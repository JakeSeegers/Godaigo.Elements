/**
 * Simplified Gamification Service Layer
 * Handles XP, Gold, Badges, and Shop functionality
 */

import { createClient } from '@supabase/supabase-js';

export class GamificationService {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.subscribers = new Map();
  }

  // ===== USER PROFILE MANAGEMENT =====

  /**
   * Get or create user's gamification profile
   */
  async getUserProfile(userId) {
    let { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    // If user doesn't exist, create profile
    if (error && error.code === 'PGRST116') {
      const { data: user } = await this.supabase
        .from('users')
        .select('full_name, email')
        .eq('id', userId)
        .single();

      const newProfile = {
        user_id: userId,
        display_name: user?.full_name || user?.email?.split('@')[0] || 'Player',
        total_xp: 0,
        current_level: 1,
        gold: 50, // Starting gold
        badges_earned: [],
        inventory: [],
        stats: { interactions: 0, streak: 0, last_active: null }
      };

      const { data, error: createError } = await this.supabase
        .from('user_profiles')
        .insert(newProfile)
        .select()
        .single();

      if (createError) throw createError;
      profile = data;
    } else if (error) {
      throw error;
    }

    return profile;
  }

  /**
   * Update user's display name
   */
  async updateDisplayName(userId, displayName) {
    const { error } = await this.supabase
      .from('user_profiles')
      .update({ display_name: displayName, updated_at: new Date() })
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }

  // ===== XP SYSTEM =====

  /**
   * Award XP to a user for an interaction or activity
   */
  async awardXP(userId, xpPoints, description = 'XP awarded', activityType = 'interaction') {
    try {
      // Use the stored procedure to handle XP awarding and level ups
      const { data, error } = await this.supabase
        .rpc('update_user_xp', {
          p_user_id: userId,
          p_xp_points: xpPoints,
          p_description: description
        });

      if (error) throw error;

      // Log the specific activity type
      if (activityType !== 'xp_awarded') {
        await this.logActivity(userId, activityType, {
          description,
          xp_awarded: xpPoints
        });
      }

      return data;
    } catch (error) {
      console.error('Error awarding XP:', error);
      throw error;
    }
  }

  /**
   * Award XP for common interactions
   */
  async awardInteractionXP(userId, interactionType, metadata = {}) {
    const xpValues = {
      'comment': 10,
      'like': 5,
      'share': 15,
      'post_create': 25,
      'daily_login': 20,
      'profile_complete': 50,
      'first_interaction': 100
    };

    const xpAmount = xpValues[interactionType] || 10;
    const description = `${interactionType.replace('_', ' ')} interaction`;

    return await this.awardXP(userId, xpAmount, description, interactionType);
  }

  /**
   * Get user's recent XP activities
   */
  async getXPHistory(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('user_activities')
      .select('created_at, xp_awarded, gold_awarded, description, activity_type')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // ===== GOLD SYSTEM =====

  /**
   * Award gold to a user
   */
  async awardGold(userId, goldAmount, description = 'Gold awarded') {
    const { data, error } = await this.supabase
      .rpc('award_gold', {
        p_user_id: userId,
        p_gold_amount: goldAmount,
        p_description: description
      });

    if (error) throw error;
    return data;
  }

  /**
   * Award gold for activities (bonus rewards)
   */
  async awardActivityGold(userId, activityType) {
    const goldValues = {
      'daily_login': 5,
      'weekly_streak': 25,
      'monthly_active': 100,
      'referral': 50,
      'feedback_submitted': 10
    };

    const goldAmount = goldValues[activityType] || 0;
    if (goldAmount > 0) {
      return await this.awardGold(userId, goldAmount, `${activityType} bonus`);
    }
  }

  // ===== SHOP SYSTEM =====

  /**
   * Get all available shop items
   */
  async getShopItems() {
    const { data, error } = await this.supabase
      .from('shop_items')
      .select('*')
      .eq('is_active', true)
      .order('cost', { ascending: true });

    if (error) throw error;
    return data;
  }

  /**
   * Purchase an item from the shop
   */
  async purchaseItem(userId, itemId) {
    const { data, error } = await this.supabase
      .rpc('purchase_item', {
        p_user_id: userId,
        p_item_id: itemId
      });

    if (error) throw error;
    return data;
  }

  /**
   * Get user's purchase history
   */
  async getPurchaseHistory(userId) {
    const { data, error } = await this.supabase
      .from('user_purchases')
      .select(`
        *,
        item:shop_items(name, type, icon)
      `)
      .eq('user_id', userId)
      .order('purchased_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // ===== BADGE SYSTEM =====

  /**
   * Get all available badges with user's earned status
   */
  async getBadgesWithStatus(userId) {
    const [badgesResult, profileResult] = await Promise.all([
      this.supabase.from('badges').select('*').eq('is_active', true),
      this.getUserProfile(userId)
    ]);

    if (badgesResult.error) throw badgesResult.error;
    if (!profileResult) throw new Error('User profile not found');

    const earnedBadges = profileResult.badges_earned || [];
    
    return badgesResult.data.map(badge => ({
      ...badge,
      earned: earnedBadges.includes(badge.id)
    }));
  }

  /**
   * Manually check badge criteria for a user (useful for retroactive awards)
   */
  async checkAllBadges(userId) {
    const { error } = await this.supabase
      .rpc('check_badge_criteria', {
        p_user_id: userId,
        p_activity_type: 'manual_check',
        p_metadata: {}
      });

    if (error) throw error;
    return true;
  }

  // ===== LEADERBOARDS =====

  /**
   * Get global leaderboard
   */
  async getLeaderboard(limit = 50, timeframe = 'all') {
    let query = this.supabase
      .from('user_profiles')
      .select('user_id, display_name, total_xp, current_level, gold')
      .order('total_xp', { ascending: false });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    // Add rankings
    return data.map((user, index) => ({
      ...user,
      rank: index + 1
    }));
  }

  /**
   * Get user's rank in the leaderboard
   */
  async getUserRank(userId) {
    const { data: userProfile } = await this.getUserProfile(userId);
    if (!userProfile) return null;

    const { count, error } = await this.supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .gt('total_xp', userProfile.total_xp);

    if (error) throw error;
    return count + 1; // +1 because count is users above this user
  }

  // ===== ANALYTICS =====

  /**
   * Get comprehensive user stats
   */
  async getUserAnalytics(userId) {
    const [profile, activities, purchases] = await Promise.all([
      this.getUserProfile(userId),
      this.getXPHistory(userId, 365), // Full year
      this.getPurchaseHistory(userId)
    ]);

    const totalGoldEarned = activities
      .filter(a => a.gold_awarded > 0)
      .reduce((sum, a) => sum + a.gold_awarded, 0);

    const totalGoldSpent = purchases
      .reduce((sum, p) => sum + p.gold_spent, 0);

    const activityByType = activities.reduce((acc, activity) => {
      acc[activity.activity_type] = (acc[activity.activity_type] || 0) + 1;
      return acc;
    }, {});

    const last30Days = activities.filter(a => 
      new Date(a.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    return {
      profile,
      totalGoldEarned,
      totalGoldSpent,
      netGold: profile.gold,
      totalActivities: activities.length,
      recentActivities: last30Days.length,
      activityBreakdown: activityByType,
      purchaseCount: purchases.length,
      averageDailyXP: last30Days.length > 0 ? 
        last30Days.reduce((sum, a) => sum + (a.xp_awarded || 0), 0) / 30 : 0
    };
  }

  /**
   * Get platform-wide analytics
   */
  async getPlatformAnalytics() {
    const [usersResult, activitiesResult] = await Promise.all([
      this.supabase
        .from('user_profiles')
        .select('total_xp, current_level, gold, created_at'),
      
      this.supabase
        .from('user_activities')
        .select('activity_type, xp_awarded, gold_awarded, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ]);

    const users = usersResult.data || [];
    const activities = activitiesResult.data || [];

    const totalUsers = users.length;
    const totalXP = users.reduce((sum, u) => sum + (u.total_xp || 0), 0);
    const averageLevel = totalUsers > 0 ? totalXP / totalUsers / 1000 : 0;
    const activeUsers = new Set(activities.map(a => a.user_id)).size;

    return {
      totalUsers,
      totalXP,
      averageLevel: Math.floor(averageLevel),
      activeUsers,
      totalActivities: activities.length,
      activityBreakdown: activities.reduce((acc, a) => {
        acc[a.activity_type] = (acc[a.activity_type] || 0) + 1;
        return acc;
      }, {})
    };
  }

  // ===== REAL-TIME FEATURES =====

  /**
   * Subscribe to user's gamification updates
   */
  subscribeToUserUpdates(userId, callback) {
    const channel = this.supabase
      .channel(`user_gamification_${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_activities',
        filter: `user_id=eq.${userId}`
      }, callback)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_profiles',
        filter: `user_id=eq.${userId}`
      }, callback)
      .subscribe();

    this.subscribers.set(`user_${userId}`, channel);
    return channel;
  }

  /**
   * Subscribe to leaderboard changes
   */
  subscribeToLeaderboard(callback) {
    const channel = this.supabase
      .channel('leaderboard_updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_profiles'
      }, callback)
      .subscribe();

    this.subscribers.set('leaderboard', channel);
    return channel;
  }

  /**
   * Unsubscribe from updates
   */
  unsubscribe(subscriptionKey) {
    const channel = this.subscribers.get(subscriptionKey);
    if (channel) {
      channel.unsubscribe();
      this.subscribers.delete(subscriptionKey);
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Log a user activity
   */
  async logActivity(userId, activityType, options = {}) {
    const activityData = {
      user_id: userId,
      activity_type: activityType,
      description: options.description || '',
      xp_awarded: options.xp_awarded || 0,
      gold_awarded: options.gold_awarded || 0,
      gold_spent: options.gold_spent || 0,
      metadata: options.metadata || {}
    };

    const { error } = await this.supabase
      .from('user_activities')
      .insert(activityData);

    if (error) throw error;
  }

  /**
   * Calculate level from XP
   */
  calculateLevel(xp, multiplier = 1000) {
    return Math.floor(xp / multiplier) + 1;
  }

  /**
   * Calculate XP needed for next level
   */
  calculateXPToNext(currentXP, multiplier = 1000) {
    const currentLevel = this.calculateLevel(currentXP, multiplier);
    const nextLevelXP = currentLevel * multiplier;
    return nextLevelXP - currentXP;
  }

  // ===== INTERACTION TRACKING =====

  /**
   * Track user interaction and award appropriate rewards
   */
  async trackInteraction(userId, interactionType, metadata = {}) {
    try {
      // Award XP for the interaction
      const xpResult = await this.awardInteractionXP(userId, interactionType, metadata);
      
      // Check for gold bonuses
      await this.awardActivityGold(userId, interactionType);
      
      // Update user stats
      await this.updateUserStats(userId, interactionType);
      
      return {
        success: true,
        xpAwarded: xpResult?.xp_awarded || 0,
        leveledUp: xpResult?.leveled_up || false,
        newLevel: xpResult?.new_level
      };
    } catch (error) {
      console.error('Error tracking interaction:', error);
      throw error;
    }
  }

  /**
   * Update user statistics
   */
  async updateUserStats(userId, interactionType) {
    const profile = await this.getUserProfile(userId);
    const stats = profile.stats || {};
    
    // Update interaction count
    stats.interactions = (stats.interactions || 0) + 1;
    stats.last_active = new Date().toISOString();
    
    // Update streak for daily login
    if (interactionType === 'daily_login') {
      const lastActive = stats.last_active ? new Date(stats.last_active) : null;
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (!lastActive || lastActive.toDateString() === yesterday.toDateString()) {
        stats.streak = (stats.streak || 0) + 1;
      } else if (lastActive.toDateString() !== today.toDateString()) {
        stats.streak = 1; // Reset streak
      }
    }

    const { error } = await this.supabase
      .from('user_profiles')
      .update({ stats, updated_at: new Date() })
      .eq('user_id', userId);

    if (error) throw error;
  }
}

// Factory function
export const createGamificationService = (supabaseUrl, supabaseKey) => {
  return new GamificationService(supabaseUrl, supabaseKey);
};

// React hook for easy integration
export const useGamificationService = (supabaseUrl, supabaseKey) => {
  const [service] = useState(() => createGamificationService(supabaseUrl, supabaseKey));
  return service;
};

// Example usage functions for common interactions
export const InteractionTypes = {
  DAILY_LOGIN: 'daily_login',
  COMMENT: 'comment',
  LIKE: 'like',
  SHARE: 'share',
  POST_CREATE: 'post_create',
  PROFILE_COMPLETE: 'profile_complete',
  FIRST_INTERACTION: 'first_interaction',
  FEEDBACK_SUBMIT: 'feedback_submitted',
  REFERRAL: 'referral'
};

// Helper function to track common interactions
export const trackUserInteraction = async (service, userId, interactionType, metadata = {}) => {
  return await service.trackInteraction(userId, interactionType, metadata);
};