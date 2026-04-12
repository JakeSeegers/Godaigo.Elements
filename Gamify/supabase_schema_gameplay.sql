-- =============================================================
-- Godaigo Gameplay Gamification Schema
-- Adapted from Gamify/supabase_schema.sql for game events.
--
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor → New query
--   2. Paste this entire file and click "Run"
--   3. Done — the tables, functions, and seed data are created.
--
-- Activity types tracked:
--   daily_login      → player logs in for the first time today (gold reward)
--   scroll_cast      → player casts any scroll (badge tracking only, no XP)
--   element_activated → player activates an element scroll
--   game_complete    → player finishes any game (win or lose)
--   game_win         → player wins a game
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- TABLES
-- =============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    total_xp     INTEGER      DEFAULT 0,
    current_level INTEGER     DEFAULT 1,
    gold         INTEGER      DEFAULT 0,
    badges_earned JSONB       DEFAULT '[]',   -- array of badge ID strings
    inventory    JSONB        DEFAULT '[]',
    stats        JSONB        DEFAULT '{"games_played":0,"games_won":0,"scrolls_cast":0,"elements_activated":0,"streak":0,"last_active":null}',
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS badges (
    id          VARCHAR(50)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    icon        VARCHAR(10)  DEFAULT '',
    criteria    JSONB,
    xp_reward   INTEGER      DEFAULT 0,
    gold_reward INTEGER      DEFAULT 0,
    rarity      VARCHAR(50)  DEFAULT 'common',
    is_active   BOOLEAN      DEFAULT true,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- User activity log — every insert fires the badge-check trigger
CREATE TABLE IF NOT EXISTS user_activities (
    id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL,
    xp_awarded   INTEGER     DEFAULT 0,
    gold_awarded INTEGER     DEFAULT 0,
    gold_spent   INTEGER     DEFAULT 0,
    description  TEXT,
    metadata     JSONB       DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Shop placeholder (no Phase-1 UI, kept for future use)
CREATE TABLE IF NOT EXISTS shop_items (
    id          VARCHAR(50)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    type        VARCHAR(50)  NOT NULL,
    cost        INTEGER      NOT NULL,
    icon        VARCHAR(10),
    metadata    JSONB        DEFAULT '{}',
    is_active   BOOLEAN      DEFAULT true,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_xp       ON user_profiles(total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_user   ON user_activities(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_type   ON user_activities(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_u_type ON user_activities(user_id, activity_type);

-- =============================================================
-- FUNCTION: update_user_xp
-- Awards XP, handles level-ups, and grants 50 gold per level.
-- =============================================================

CREATE OR REPLACE FUNCTION update_user_xp(
    p_user_id     UUID,
    p_xp_points   INTEGER,
    p_description TEXT DEFAULT 'XP awarded'
) RETURNS JSONB AS $$
DECLARE
    current_xp    INTEGER;
    current_level INTEGER;
    new_xp        INTEGER;
    new_level     INTEGER;
    level_mult    INTEGER := 1000;
    result        JSONB;
BEGIN
    SELECT total_xp, current_level
    INTO   current_xp, current_level
    FROM   user_profiles
    WHERE  user_id = p_user_id;

    IF current_xp IS NULL THEN
        INSERT INTO user_profiles (user_id, display_name, total_xp, current_level)
        VALUES (p_user_id, 'Player', p_xp_points, 1)
        ON CONFLICT (user_id) DO UPDATE
            SET total_xp      = user_profiles.total_xp + p_xp_points,
                current_level = FLOOR((user_profiles.total_xp + p_xp_points) / level_mult) + 1,
                updated_at    = NOW();
        current_xp    := 0;
        current_level := 1;
    END IF;

    new_xp    := current_xp + p_xp_points;
    new_level := FLOOR(new_xp / level_mult) + 1;

    UPDATE user_profiles
    SET    total_xp      = new_xp,
           current_level = new_level,
           updated_at    = NOW()
    WHERE  user_id = p_user_id;

    INSERT INTO user_activities (user_id, activity_type, xp_awarded, description)
    VALUES (p_user_id, 'xp_awarded', p_xp_points, p_description);

    IF new_level > current_level THEN
        UPDATE user_profiles
        SET    gold = gold + (50 * (new_level - current_level))
        WHERE  user_id = p_user_id;

        INSERT INTO user_activities (user_id, activity_type, gold_awarded, description)
        VALUES (p_user_id, 'level_up', 50 * (new_level - current_level),
                'Level up bonus: reached level ' || new_level);
    END IF;

    result := jsonb_build_object(
        'success',    true,
        'old_level',  current_level,
        'new_level',  new_level,
        'xp_awarded', p_xp_points,
        'total_xp',   new_xp,
        'leveled_up', new_level > current_level
    );
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- FUNCTION: award_gold
-- =============================================================

CREATE OR REPLACE FUNCTION award_gold(
    p_user_id     UUID,
    p_gold_amount INTEGER,
    p_description TEXT DEFAULT 'Gold awarded'
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE user_profiles
    SET    gold       = gold + p_gold_amount,
           updated_at = NOW()
    WHERE  user_id = p_user_id;

    INSERT INTO user_activities (user_id, activity_type, gold_awarded, description)
    VALUES (p_user_id, 'gold_awarded', p_gold_amount, p_description);

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- FUNCTION: award_badge
-- Idempotent — no-ops if already earned.
-- =============================================================

CREATE OR REPLACE FUNCTION award_badge(
    p_user_id  UUID,
    p_badge_id VARCHAR(50)
) RETURNS VOID AS $$
DECLARE
    badge_info RECORD;
BEGIN
    SELECT * INTO badge_info FROM badges WHERE id = p_badge_id;

    -- No-op if already earned
    IF (SELECT badges_earned FROM user_profiles WHERE user_id = p_user_id) ? p_badge_id THEN
        RETURN;
    END IF;

    UPDATE user_profiles
    SET    badges_earned = badges_earned || jsonb_build_array(p_badge_id),
           updated_at    = NOW()
    WHERE  user_id = p_user_id;

    IF badge_info.xp_reward > 0 THEN
        PERFORM update_user_xp(p_user_id, badge_info.xp_reward,
                               'Badge reward: ' || badge_info.name);
    END IF;

    IF badge_info.gold_reward > 0 THEN
        PERFORM award_gold(p_user_id, badge_info.gold_reward,
                           'Badge reward: ' || badge_info.name);
    END IF;

    INSERT INTO user_activities (user_id, activity_type, description)
    VALUES (p_user_id, 'badge_earned', 'Earned badge: ' || badge_info.name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- FUNCTION: check_badge_criteria
-- Evaluates all active badges against the current user state.
-- Called automatically by trigger after every user_activities insert.
-- =============================================================

CREATE OR REPLACE FUNCTION check_badge_criteria(
    p_user_id      UUID,
    p_activity_type VARCHAR(100),
    p_metadata     JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
DECLARE
    badge_rec      RECORD;
    user_profile   RECORD;
    activity_count INTEGER;
    current_badges JSONB;
BEGIN
    SELECT * INTO user_profile   FROM user_profiles WHERE user_id = p_user_id;
    current_badges := COALESCE(user_profile.badges_earned, '[]'::jsonb);

    FOR badge_rec IN SELECT * FROM badges WHERE is_active = true LOOP
        -- Skip if already earned
        IF current_badges ? badge_rec.id THEN
            CONTINUE;
        END IF;

        CASE badge_rec.criteria->>'type'

            WHEN 'xp_threshold' THEN
                IF user_profile.total_xp >= (badge_rec.criteria->>'threshold')::integer THEN
                    PERFORM award_badge(p_user_id, badge_rec.id);
                END IF;

            WHEN 'level_reached' THEN
                IF user_profile.current_level >= (badge_rec.criteria->>'level')::integer THEN
                    PERFORM award_badge(p_user_id, badge_rec.id);
                END IF;

            WHEN 'activity_count' THEN
                SELECT COUNT(*) INTO activity_count
                FROM   user_activities
                WHERE  user_id       = p_user_id
                AND    activity_type = COALESCE(badge_rec.criteria->>'activity_type',
                                                p_activity_type);

                IF activity_count >= (badge_rec.criteria->>'count')::integer THEN
                    PERFORM award_badge(p_user_id, badge_rec.id);
                END IF;

            WHEN 'first_time' THEN
                IF p_activity_type = badge_rec.criteria->>'activity_type' THEN
                    PERFORM award_badge(p_user_id, badge_rec.id);
                END IF;

            ELSE
                -- Unknown criteria type; skip silently
                NULL;
        END CASE;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- TRIGGER: fires check_badge_criteria after every activity insert
-- =============================================================

CREATE OR REPLACE FUNCTION trigger_check_badges() RETURNS TRIGGER AS $$
BEGIN
    -- Only run badge checks for meaningful activity types (skip xp_awarded / level_up)
    IF NEW.activity_type NOT IN ('xp_awarded','level_up','badge_earned','gold_awarded') THEN
        PERFORM check_badge_criteria(NEW.user_id, NEW.activity_type, NEW.metadata);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_badges_trigger ON user_activities;
CREATE TRIGGER check_badges_trigger
    AFTER INSERT ON user_activities
    FOR EACH ROW EXECUTE FUNCTION trigger_check_badges();

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE user_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_items      ENABLE ROW LEVEL SECURITY;

-- user_profiles: all authenticated users can SELECT (needed for leaderboard)
-- only own row for INSERT / UPDATE
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON user_profiles;
CREATE POLICY "Authenticated users can view all profiles" ON user_profiles
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (user_id = auth.uid());

-- user_activities: own rows only
DROP POLICY IF EXISTS "Users can view own activities" ON user_activities;
CREATE POLICY "Users can view own activities" ON user_activities
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own activities" ON user_activities;
CREATE POLICY "Users can insert own activities" ON user_activities
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- badges & shop_items: public read (no auth required)
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view badges" ON badges;
CREATE POLICY "Anyone can view badges" ON badges
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view shop items" ON shop_items;
CREATE POLICY "Anyone can view shop items" ON shop_items
    FOR SELECT USING (true);

-- Grant execute on RPCs to authenticated role
GRANT EXECUTE ON FUNCTION update_user_xp      TO authenticated;
GRANT EXECUTE ON FUNCTION award_gold           TO authenticated;
GRANT EXECUTE ON FUNCTION check_badge_criteria TO authenticated;

-- =============================================================
-- SEED DATA — GAMEPLAY BADGES
-- =============================================================

INSERT INTO badges (id, name, description, criteria, xp_reward, gold_reward, rarity) VALUES

('first_steps',
 'First Steps',
 'Complete your first game.',
 '{"type": "first_time", "activity_type": "game_complete"}',
 50, 10, 'common'),

('first_victory',
 'First Victory',
 'Win your first game.',
 '{"type": "first_time", "activity_type": "game_win"}',
 100, 25, 'common'),

('scroll_apprentice',
 'Scroll Apprentice',
 'Cast 10 scrolls total.',
 '{"type": "activity_count", "activity_type": "scroll_cast", "count": 10}',
 50, 10, 'common'),

('scroll_adept',
 'Scroll Adept',
 'Cast 50 scrolls total.',
 '{"type": "activity_count", "activity_type": "scroll_cast", "count": 50}',
 100, 25, 'rare'),

('veteran',
 'Veteran',
 'Complete 10 games.',
 '{"type": "activity_count", "activity_type": "game_complete", "count": 10}',
 100, 20, 'rare'),

('champion',
 'Champion',
 'Win 5 games.',
 '{"type": "activity_count", "activity_type": "game_win", "count": 5}',
 200, 50, 'epic'),

('master',
 'Master',
 'Win 10 games.',
 '{"type": "activity_count", "activity_type": "game_win", "count": 10}',
 300, 100, 'legendary'),

('dedicated',
 'Dedicated',
 'Log in on 7 different days.',
 '{"type": "activity_count", "activity_type": "daily_login", "count": 7}',
 100, 25, 'rare')

ON CONFLICT (id) DO NOTHING;
