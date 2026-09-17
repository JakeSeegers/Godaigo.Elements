-- =============================================================
-- Godaigo Session Log Schema
--
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor → New query
--   2. Paste this entire file and click "Run"
--   3. Done — the table and RLS policies are created.
--
-- Stores a full copy of window.ActionLog's session payload (same shape
-- as the existing client-side "Download Action Log" export) for players
-- who opted in to the "Help Improve Godaigo?" consent prompt. In
-- multiplayer, only the host's consent flag gates the upload — see
-- js/session-log-upload.js. Read access is restricted to the developer
-- account via the existing public.is_hermit() function (already deployed,
-- gates nuke_all_rooms elsewhere) — not redefined here.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS game_session_logs (
    id             UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id        UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id        INTEGER     REFERENCES game_room(id) ON DELETE SET NULL,
    is_multiplayer BOOLEAN     NOT NULL DEFAULT false,
    player_count   INTEGER,
    log            JSONB       NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_session_logs_user    ON game_session_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_session_logs_created ON game_session_logs(created_at DESC);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE game_session_logs ENABLE ROW LEVEL SECURITY;

-- Any signed-in player (including guests, who get a real auth.uid() too)
-- may insert a log row for themselves — never for anyone else.
DROP POLICY IF EXISTS "Users can insert own session logs" ON game_session_logs;
CREATE POLICY "Users can insert own session logs" ON game_session_logs
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Append-only from the client: no UPDATE/DELETE policies at all.
-- Only the developer ("the Hermit") can read stored logs back.
DROP POLICY IF EXISTS "Hermit can view session logs" ON game_session_logs;
CREATE POLICY "Hermit can view session logs" ON game_session_logs
    FOR SELECT USING (is_hermit());
