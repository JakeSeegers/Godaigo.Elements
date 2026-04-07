-- ============================================================
-- Multi-Room Support Migration
-- Run once in the Supabase SQL Editor before testing.
-- Safe to re-run: ALTER TABLE uses IF NOT EXISTS, functions
-- use CREATE OR REPLACE.
-- ============================================================

-- 0. Remove the old singleton enforcement that blocks creating more than one room.
--    The original schema had CHECK (id = 1) named "single_room".
--    IF NOT EXISTS equivalent: DROP CONSTRAINT is safe to retry — use IF EXISTS.
ALTER TABLE game_room DROP CONSTRAINT IF EXISTS single_room;

-- 1a. game_room: add columns for multi-room support
ALTER TABLE game_room
  ADD COLUMN IF NOT EXISTS is_private  BOOL        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS join_code   TEXT,
  ADD COLUMN IF NOT EXISTS host_name   TEXT,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

-- Unique index so join codes never collide
-- (NULLs are ignored by the partial predicate, so public rooms never conflict)
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_room_join_code
  ON game_room(join_code) WHERE join_code IS NOT NULL;

-- 1b. players: scope each player to a room
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS game_id INT REFERENCES game_room(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);

-- REPLICA IDENTITY FULL means Supabase Realtime includes ALL columns (not just the
-- primary key) in DELETE event payloads.  Without this, the postgres_changes filter
-- "game_id=eq.X" can never match a DELETE because game_id is absent from payload.old,
-- so the remaining player never receives the "someone left" event.
ALTER TABLE players REPLICA IDENTITY FULL;

-- ============================================================
-- 1c. Ensure game_room.id has a working auto-increment sequence.
--
--     The original singleton design may have used a plain INT (no
--     serial/sequence), so every new INSERT tries id = DEFAULT = 1,
--     hits a primary-key conflict, and the retry loop exhausts itself.
--     This block detects that situation and attaches a proper sequence.
-- ============================================================
DO $$
DECLARE
  col_default  TEXT;
  has_identity BOOLEAN;
  max_id       INT;
BEGIN
  SELECT column_default,
         (is_identity = 'YES')
    INTO col_default, has_identity
    FROM information_schema.columns
   WHERE table_name = 'game_room' AND column_name = 'id';

  IF has_identity OR (col_default IS NOT NULL AND col_default LIKE '%nextval%') THEN
    RAISE NOTICE 'game_room.id already has an auto-increment (%). No change needed.', col_default;
  ELSE
    RAISE NOTICE 'game_room.id has no sequence (default = %). Adding one now.', col_default;

    -- Create the sequence if it does not already exist
    CREATE SEQUENCE IF NOT EXISTS game_room_id_seq;

    -- Fast-forward the sequence past any existing rows so we never collide
    SELECT COALESCE(MAX(id), 0) INTO max_id FROM game_room;
    PERFORM setval('game_room_id_seq', GREATEST(max_id, 1));

    -- Attach the sequence as the column default
    ALTER TABLE game_room
      ALTER COLUMN id SET DEFAULT nextval('game_room_id_seq');

    RAISE NOTICE 'Sequence game_room_id_seq created and attached (starts at %).', max_id + 1;
  END IF;
END $$;

-- ============================================================
-- 1d. Ensure the authenticated & anon roles can read/write these tables.
--     These are no-ops if the grants already exist.
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE game_room TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE players   TO authenticated, anon;

-- Grant usage on whichever sequences exist (covers both SERIAL and the one we may have just created)
DO $$
DECLARE
  seq_name TEXT;
BEGIN
  FOR seq_name IN
    SELECT sequence_name FROM information_schema.sequences
     WHERE sequence_schema = 'public'
       AND sequence_name IN ('game_room_id_seq',
                             'game_room_id_seq1',   -- Supabase sometimes appends a suffix
                             'players_id_seq',
                             'players_id_seq1')
  LOOP
    EXECUTE 'GRANT USAGE ON SEQUENCE ' || seq_name || ' TO authenticated, anon';
    RAISE NOTICE 'Granted USAGE on sequence %', seq_name;
  END LOOP;

  -- Also catch whatever pg_get_serial_sequence reports (handles SERIAL columns)
  SELECT pg_get_serial_sequence('game_room', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    EXECUTE 'GRANT USAGE ON SEQUENCE ' || seq_name || ' TO authenticated, anon';
  END IF;
  SELECT pg_get_serial_sequence('players', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    EXECUTE 'GRANT USAGE ON SEQUENCE ' || seq_name || ' TO authenticated, anon';
  END IF;
END $$;

-- ============================================================
-- 1e. Atomic room creation with collision-safe join code generation.
--
--     SECURITY DEFINER: runs as the function owner (postgres/service role)
--     so it can always INSERT regardless of RLS or table grants on the
--     calling client's role.
-- ============================================================
CREATE OR REPLACE FUNCTION create_game_room(p_is_private BOOL, p_host_name TEXT)
RETURNS TABLE(room_id INT, join_code TEXT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code  TEXT;
  v_id    INT;
  v_tries INT  := 0;
  chars   TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ';  -- no I or O to avoid confusion
BEGIN
  LOOP
    IF p_is_private THEN
      -- Generate a 6-character code
      v_code := '';
      FOR i IN 1..6 LOOP
        v_code := v_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
    ELSE
      v_code := NULL;
    END IF;

    BEGIN
      INSERT INTO game_room(status, current_turn_index, is_private, join_code, host_name, created_at)
      VALUES ('waiting', 0, p_is_private, v_code, p_host_name, NOW())
      RETURNING id INTO v_id;

      RETURN QUERY SELECT v_id, v_code;
      RETURN;

    EXCEPTION WHEN unique_violation THEN
      -- Distinguish: if this is a join_code collision (private room), retry with a new code.
      -- For any other unique violation (e.g. primary key with no sequence), fail immediately
      -- with a clear message rather than looping 10 more times.
      IF SQLERRM NOT LIKE '%idx_game_room_join_code%' AND p_is_private = false THEN
        RAISE EXCEPTION 'game_room INSERT failed with unexpected unique violation: %. '
          'The id column may be missing its auto-increment sequence — '
          'please re-run supabase_schema_rooms.sql in the SQL Editor.', SQLERRM;
      END IF;

      v_tries := v_tries + 1;
      IF v_tries > 10 THEN
        RAISE EXCEPTION 'Could not generate a unique join code after 10 tries.';
      END IF;
    END;
  END LOOP;
END;
$$;

-- Allow any authenticated or anonymous client to call this RPC
GRANT EXECUTE ON FUNCTION create_game_room(BOOL, TEXT) TO authenticated, anon;

-- ============================================================
-- 1f. Stale room cleanup — called client-side at join time.
--     Removes rooms older than 2 hours that are finished or have no players.
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_stale_rooms() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM game_room
  WHERE created_at < NOW() - INTERVAL '2 hours'
    AND (
      status = 'finished'
      OR NOT EXISTS (
        SELECT 1 FROM players WHERE players.game_id = game_room.id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION cleanup_stale_rooms() TO authenticated, anon;
