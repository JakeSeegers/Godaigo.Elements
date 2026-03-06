-- Simplified Gamification System - Supabase Database Schema
-- Focus on individual user rewards: XP, Gold, Badges, and Shop

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (assuming you have an existing users table)
-- If not, uncomment and adjust this:
/*
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
*/

-- Gamification User Profiles
CREATE TABLE user_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  total_xp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  gold INTEGER DEFAULT 0,
  badges_earned JSONB DEFAULT '[]', -- Array of badge IDs
  inventory JSONB DEFAULT '[]', -- Array of purchased item IDs
  settings JSONB DEFAULT '{}',
  stats JSONB DEFAULT '{"interactions": 0, "streak": 0, "last_active": null}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Achievement Badges
CREATE TABLE badges (
  id VARCHAR(50) PRIMARY KEY, -- e.g., 'first_steps', 'social_butterfly'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(10) DEFAULT '🏆',
  criteria JSONB, -- Criteria for earning this badge
  xp_reward INTEGER DEFAULT 0,
  gold_reward INTEGER DEFAULT 0,
  rarity VARCHAR(50) DEFAULT 'common', -- common, rare, epic, legendary
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shop Items
CREATE TABLE shop_items (
  id VARCHAR(50) PRIMARY KEY, -- e.g., 'avatar_frame', 'xp_boost'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL, -- cosmetic, boost, title, theme
  cost INTEGER NOT NULL, -- Gold cost
  icon VARCHAR(10),
  metadata JSONB DEFAULT '{}', -- Item-specific data
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Activities/Interactions Log
CREATE TABLE user_activities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(100) NOT NULL, -- interaction, purchase, badge_earned, level_up
  xp_awarded INTEGER DEFAULT 0,
  gold_awarded INTEGER DEFAULT 0,
  gold_spent INTEGER DEFAULT 0,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Purchases (for shop items)
CREATE TABLE user_purchases (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(50) REFERENCES shop_items(id),
  gold_spent INTEGER NOT NULL,
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

-- Indexes for performance
CREATE INDEX idx_user_profiles_xp ON user_profiles(total_xp DESC);
CREATE INDEX idx_user_activities_user ON user_activities(user_id, created_at DESC);
CREATE INDEX idx_user_activities_type ON user_activities(activity_type, created_at DESC);
CREATE INDEX idx_user_purchases_user ON user_purchases(user_id);

-- Function to update user XP and handle level ups
CREATE OR REPLACE FUNCTION update_user_xp(
  p_user_id UUID,
  p_xp_points INTEGER,
  p_description TEXT DEFAULT 'XP awarded'
) RETURNS JSONB AS $$
DECLARE
  current_xp INTEGER;
  current_level INTEGER;
  new_xp INTEGER;
  new_level INTEGER;
  level_multiplier INTEGER := 1000;
  result JSONB;
BEGIN
  -- Get current XP and level
  SELECT total_xp, current_level INTO current_xp, current_level
  FROM user_profiles 
  WHERE user_id = p_user_id;
  
  -- If user doesn't exist in profiles, create them
  IF current_xp IS NULL THEN
    INSERT INTO user_profiles (user_id, display_name, total_xp, current_level)
    VALUES (p_user_id, 'Player', p_xp_points, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      total_xp = user_profiles.total_xp + p_xp_points,
      current_level = FLOOR((user_profiles.total_xp + p_xp_points) / level_multiplier) + 1,
      updated_at = NOW();
    
    current_xp := 0;
    current_level := 1;
  END IF;
  
  -- Calculate new XP and level
  new_xp := current_xp + p_xp_points;
  new_level := FLOOR(new_xp / level_multiplier) + 1;
  
  -- Update user profile
  UPDATE user_profiles 
  SET total_xp = new_xp,
      current_level = new_level,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log the XP activity
  INSERT INTO user_activities (user_id, activity_type, xp_awarded, description)
  VALUES (p_user_id, 'xp_awarded', p_xp_points, p_description);
  
  -- If level increased, log level up and give gold bonus
  IF new_level > current_level THEN
    -- Award gold for leveling up (50 gold per level)
    UPDATE user_profiles 
    SET gold = gold + (50 * (new_level - current_level))
    WHERE user_id = p_user_id;
    
    INSERT INTO user_activities (user_id, activity_type, gold_awarded, description)
    VALUES (p_user_id, 'level_up', 50 * (new_level - current_level), 
            'Level up bonus: Reached level ' || new_level);
  END IF;
  
  -- Return results
  result := jsonb_build_object(
    'success', true,
    'old_level', current_level,
    'new_level', new_level,
    'xp_awarded', p_xp_points,
    'total_xp', new_xp,
    'leveled_up', new_level > current_level
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to award gold
CREATE OR REPLACE FUNCTION award_gold(
  p_user_id UUID,
  p_gold_amount INTEGER,
  p_description TEXT DEFAULT 'Gold awarded'
) RETURNS BOOLEAN AS $$
BEGIN
  -- Update user's gold
  UPDATE user_profiles 
  SET gold = gold + p_gold_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log the gold activity
  INSERT INTO user_activities (user_id, activity_type, gold_awarded, description)
  VALUES (p_user_id, 'gold_awarded', p_gold_amount, p_description);
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to handle shop purchases
CREATE OR REPLACE FUNCTION purchase_item(
  p_user_id UUID,
  p_item_id VARCHAR(50)
) RETURNS JSONB AS $$
DECLARE
  user_gold INTEGER;
  item_cost INTEGER;
  item_name VARCHAR(255);
  result JSONB;
BEGIN
  -- Get user's current gold
  SELECT gold INTO user_gold FROM user_profiles WHERE user_id = p_user_id;
  
  -- Get item cost and name
  SELECT cost, name INTO item_cost, item_name FROM shop_items WHERE id = p_item_id;
  
  -- Check if user has enough gold
  IF user_gold < item_cost THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient gold');
  END IF;
  
  -- Check if user already owns this item
  IF EXISTS (SELECT 1 FROM user_purchases WHERE user_id = p_user_id AND item_id = p_item_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Item already owned');
  END IF;
  
  -- Deduct gold from user
  UPDATE user_profiles 
  SET gold = gold - item_cost,
      inventory = inventory || jsonb_build_array(p_item_id),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Record the purchase
  INSERT INTO user_purchases (user_id, item_id, gold_spent)
  VALUES (p_user_id, p_item_id, item_cost);
  
  -- Log the activity
  INSERT INTO user_activities (user_id, activity_type, gold_spent, description)
  VALUES (p_user_id, 'item_purchased', item_cost, 'Purchased: ' || item_name);
  
  RETURN jsonb_build_object('success', true, 'item_name', item_name, 'gold_spent', item_cost);
END;
$$ LANGUAGE plpgsql;

-- Function to check and award badges
CREATE OR REPLACE FUNCTION check_badge_criteria(
  p_user_id UUID,
  p_activity_type VARCHAR(100),
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
DECLARE
  badge_record RECORD;
  user_profile RECORD;
  activity_count INTEGER;
  current_badges JSONB;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM user_profiles WHERE user_id = p_user_id;
  current_badges := user_profile.badges_earned;
  
  -- Check each badge
  FOR badge_record IN SELECT * FROM badges WHERE is_active = true LOOP
    -- Skip if user already has this badge
    IF current_badges ? badge_record.id THEN
      CONTINUE;
    END IF;
    
    -- Check badge criteria based on type
    CASE badge_record.criteria->>'type'
      WHEN 'xp_threshold' THEN
        IF user_profile.total_xp >= (badge_record.criteria->>'threshold')::integer THEN
          PERFORM award_badge(p_user_id, badge_record.id);
        END IF;
        
      WHEN 'level_reached' THEN
        IF user_profile.current_level >= (badge_record.criteria->>'level')::integer THEN
          PERFORM award_badge(p_user_id, badge_record.id);
        END IF;
        
      WHEN 'activity_count' THEN
        SELECT COUNT(*) INTO activity_count 
        FROM user_activities 
        WHERE user_id = p_user_id 
        AND activity_type = COALESCE(badge_record.criteria->>'activity_type', p_activity_type);
        
        IF activity_count >= (badge_record.criteria->>'count')::integer THEN
          PERFORM award_badge(p_user_id, badge_record.id);
        END IF;
        
      WHEN 'gold_earned' THEN
        SELECT COALESCE(SUM(gold_awarded), 0) INTO activity_count
        FROM user_activities
        WHERE user_id = p_user_id;
        
        IF activity_count >= (badge_record.criteria->>'amount')::integer THEN
          PERFORM award_badge(p_user_id, badge_record.id);
        END IF;
        
      WHEN 'first_time' THEN
        IF p_activity_type = badge_record.criteria->>'activity_type' THEN
          PERFORM award_badge(p_user_id, badge_record.id);
        END IF;
    END CASE;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to award a badge
CREATE OR REPLACE FUNCTION award_badge(
  p_user_id UUID,
  p_badge_id VARCHAR(50)
) RETURNS VOID AS $$
DECLARE
  badge_info RECORD;
BEGIN
  -- Get badge information
  SELECT * INTO badge_info FROM badges WHERE id = p_badge_id;
  
  -- Add badge to user's collection
  UPDATE user_profiles 
  SET badges_earned = badges_earned || jsonb_build_array(p_badge_id),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Award XP and gold if specified
  IF badge_info.xp_reward > 0 THEN
    PERFORM update_user_xp(p_user_id, badge_info.xp_reward, 'Badge reward: ' || badge_info.name);
  END IF;
  
  IF badge_info.gold_reward > 0 THEN
    PERFORM award_gold(p_user_id, badge_info.gold_reward, 'Badge reward: ' || badge_info.name);
  END IF;
  
  -- Log the badge award
  INSERT INTO user_activities (user_id, activity_type, description)
  VALUES (p_user_id, 'badge_earned', 'Earned badge: ' || badge_info.name);
END;
$$ LANGUAGE plpgsql;

-- Trigger to check badges after activities
CREATE OR REPLACE FUNCTION trigger_check_badges() RETURNS TRIGGER AS $$
BEGIN
  PERFORM check_badge_criteria(NEW.user_id, NEW.activity_type, NEW.metadata);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_badges_trigger
  AFTER INSERT ON user_activities
  FOR EACH ROW EXECUTE FUNCTION trigger_check_badges();

-- Row Level Security (if needed)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_purchases ENABLE ROW LEVEL SECURITY;

-- Policies for user data access
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can view own activities" ON user_activities
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view own purchases" ON user_purchases
  FOR SELECT USING (user_id = auth.uid());

-- Public read access for badges and shop items
CREATE POLICY "Anyone can view badges" ON badges
  FOR SELECT USING (true);

CREATE POLICY "Anyone can view shop items" ON shop_items
  FOR SELECT USING (true);

-- Sample Data
INSERT INTO badges (id, name, description, icon, criteria, xp_reward, gold_reward) VALUES
('first_steps', 'First Steps', 'Complete your first interaction', '👶', 
 '{"type": "first_time", "activity_type": "interaction"}', 50, 10),

('active_user', 'Active User', 'Use the platform for 7 days', '🔥',
 '{"type": "activity_count", "activity_type": "daily_login", "count": 7}', 100, 25),

('social_butterfly', 'Social Butterfly', 'Complete 50 interactions', '🦋',
 '{"type": "activity_count", "activity_type": "interaction", "count": 50}', 200, 50),

('gold_collector', 'Gold Collector', 'Earn 500 gold total', '💰',
 '{"type": "gold_earned", "amount": 500}', 150, 0),

('level_master', 'Level Master', 'Reach level 10', '🏆',
 '{"type": "level_reached", "level": 10}', 500, 100),

('xp_hunter', 'XP Hunter', 'Earn 5000 total XP', '⚡',
 '{"type": "xp_threshold", "threshold": 5000}', 300, 75);

INSERT INTO shop_items (id, name, description, type, cost, icon) VALUES
('avatar_frame', 'Premium Avatar Frame', 'Golden border for your avatar', 'cosmetic', 100, '🖼️'),
('title_vip', 'VIP Title', 'Show off your VIP status', 'title', 250, '👑'),
('boost_xp', 'XP Boost (24h)', 'Double XP for 24 hours', 'boost', 150, '⚡'),
('theme_dark', 'Dark Theme', 'Unlock dark mode interface', 'theme', 75, '🌙'),
('badge_glow', 'Badge Glow Effect', 'Make your badges sparkle', 'cosmetic', 200, '✨'),
('lucky_charm', 'Lucky Charm', 'Increases gold drop rate', 'boost', 300, '🍀');