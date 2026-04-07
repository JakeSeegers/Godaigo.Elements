# Simplified Gamification Addon Integration Guide

A streamlined gamification system focused on individual user rewards with XP, gold currency, achievements, and a shop system.

## 📋 System Overview

**Core Features:**
- **XP System**: Users earn XP for interactions and level up automatically
- **Gold Currency**: Users earn gold and can spend it in the shop
- **Achievement Badges**: Unlockable badges based on user activity
- **Shop System**: Purchase cosmetics, boosts, and other items with gold
- **Leaderboards**: Global rankings based on XP

**No Admin Panel**: The system is designed for automatic rewards based on user interactions.

## 🚀 Quick Setup

### 1. Database Setup

Run the SQL schema in your Supabase SQL editor to create all necessary tables and functions.

### 2. Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 3. Basic Integration

```jsx
import GamificationAddon from './components/GamificationAddon';
import { createGamificationService, InteractionTypes } from './services/GamificationService';

function App() {
  const user = useUser(); // Your existing auth
  const [gamificationService] = useState(() => 
    createGamificationService(
      process.env.REACT_APP_SUPABASE_URL,
      process.env.REACT_APP_SUPABASE_ANON_KEY
    )
  );

  // Track user interactions throughout your app
  const handleUserComment = async (commentData) => {
    // Your existing comment logic
    await saveComment(commentData);
    
    // Award XP for commenting
    await gamificationService.trackInteraction(
      user.id, 
      InteractionTypes.COMMENT,
      { comment_id: commentData.id }
    );
  };

  return (
    <div>
      {/* Your existing app content */}
      
      {/* Gamification Dashboard */}
      <GamificationAddon
        supabaseUrl={process.env.REACT_APP_SUPABASE_URL}
        supabaseKey={process.env.REACT_APP_SUPABASE_ANON_KEY}
        userId={user.id}
        config={{
          theme: {
            primaryColor: '#your-brand-color',
            goldColor: '#ffd700'
          },
          shop: {
            enabled: true,
            items: [] // Uses default items or custom ones
          }
        }}
        onError={(error) => console.error('Gamification error:', error)}
        onSuccess={(message) => console.log('Gamification success:', message)}
      />
    </div>
  );
}
```

## 🎯 Integration Patterns

### 1. Social Media Platform

```jsx
// Award XP for various social interactions
const SocialActions = {
  async likePost(postId, userId) {
    await likePostInDatabase(postId, userId);
    
    // Award 5 XP for liking a post
    await gamificationService.trackInteraction(
      userId, 
      InteractionTypes.LIKE,
      { post_id: postId }
    );
  },

  async createPost(postData, userId) {
    const post = await createPostInDatabase(postData);
    
    // Award 25 XP for creating a post
    await gamificationService.trackInteraction(
      userId, 
      InteractionTypes.POST_CREATE,
      { post_id: post.id }
    );
  },

  async sharePost(postId, userId) {
    await sharePostInDatabase(postId, userId);
    
    // Award 15 XP for sharing
    await gamificationService.trackInteraction(
      userId, 
      InteractionTypes.SHARE,
      { post_id: postId }
    );
  }
};
```

### 2. E-learning Platform

```jsx
// Award XP for learning activities
const LearningActions = {
  async completeLesson(lessonId, userId, score) {
    await markLessonComplete(lessonId, userId, score);
    
    // Award XP based on lesson completion and score
    const baseXP = 50;
    const bonusXP = Math.floor(score * 0.5); // Bonus for high scores
    
    await gamificationService.awardXP(
      userId, 
      baseXP + bonusXP, 
      `Completed lesson with ${score}% score`
    );
  },

  async submitAssignment(assignmentId, userId) {
    await submitAssignmentToDatabase(assignmentId, userId);
    
    // Award XP for assignment submission
    await gamificationService.trackInteraction(
      userId, 
      InteractionTypes.ASSIGNMENT_SUBMIT,
      { assignment_id: assignmentId }
    );
  }
};
```

### 3. Community Forum

```jsx
// Award XP for forum participation
const ForumActions = {
  async postReply(threadId, userId, content) {
    const reply = await createReply(threadId, content);
    
    // Award XP for helpful participation
    await gamificationService.trackInteraction(
      userId, 
      InteractionTypes.COMMENT,
      { thread_id: threadId, reply_id: reply.id }
    );
  },

  async markHelpfulAnswer(answerId, userId) {
    await markAnswerHelpful(answerId);
    
    // Award bonus gold for helpful answers
    await gamificationService.awardGold(
      userId, 
      25, 
      'Received helpful answer vote'
    );
  }
};
```

## 🏪 Shop System Integration

### Custom Shop Items

```jsx
// Add custom shop items to your database
const customShopItems = [
  {
    id: 'premium_profile',
    name: 'Premium Profile Badge',
    description: 'Show your premium status',
    type: 'cosmetic',
    cost: 500,
    icon: '⭐'
  },
  {
    id: 'ad_free_week',
    name: 'Ad-Free Week',
    description: 'Enjoy ad-free experience for 7 days',
    type: 'boost',
    cost: 200,
    icon: '🚫'
  }
];

// Handle post-purchase logic
const handlePurchase = async (userId, itemId) => {
  const result = await gamificationService.purchaseItem(userId, itemId);
  
  if (result.success) {
    // Apply the purchased item's effects
    switch (itemId) {
      case 'ad_free_week':
        await grantAdFreeWeek(userId);
        break;
      case 'premium_profile':
        await updateUserPremiumStatus(userId, true);
        break;
      // Add more item effects as needed
    }
  }
};
```

## 🎖️ Badge System

### Automatic Badge Criteria

Badges are automatically awarded based on database triggers. The system supports several criteria types:

```sql
-- XP Threshold badges
INSERT INTO badges (id, name, description, criteria) VALUES
('xp_1000', 'Rising Star', 'Earn 1000 XP', 
 '{"type": "xp_threshold", "threshold": 1000}');

-- Activity Count badges  
INSERT INTO badges (id, name, description, criteria) VALUES
('commenter', 'Active Commenter', 'Post 25 comments',
 '{"type": "activity_count", "activity_type": "comment", "count": 25}');

-- Level Achievement badges
INSERT INTO badges (id, name, description, criteria) VALUES
('level_5', 'Experienced', 'Reach level 5',
 '{"type": "level_reached", "level": 5}');

-- Gold Collection badges
INSERT INTO badges (id, name, description, criteria) VALUES
('gold_saver', 'Gold Saver', 'Save 1000 gold',
 '{"type": "gold_earned", "amount": 1000}');
```

### Custom Badge Logic

```jsx
// Manually check for custom achievements
const checkCustomBadges = async (userId, activityData) => {
  // Example: Award badge for first interaction
  const userStats = await gamificationService.getUserProfile(userId);
  
  if (userStats.stats.interactions === 1) {
    await gamificationService.checkAllBadges(userId);
  }
};
```

## 💰 Gold Economy

### Earning Gold

```jsx
// Users earn gold through various activities
const goldRewards = {
  daily_login: 5,        // Daily login bonus
  weekly_streak: 25,     // 7-day streak bonus
  level_up: 50,          // Automatic level-up bonus
  referral: 100,         // Successful referral
  feedback: 10           // Submitting feedback
};

// Award gold for special achievements
await gamificationService.awardGold(
  userId, 
  goldRewards.referral, 
  'Successful referral bonus'
);
```

### Spending Gold

```jsx
// Users can spend gold on various items
const shopCategories = {
  cosmetic: ['avatar_frames', 'themes', 'badges'],
  boost: ['xp_multiplier', 'gold_boost', 'priority_support'],
  functional: ['extra_storage', 'premium_features', 'ad_removal']
};
```

## 📊 Analytics Integration

### User Analytics Dashboard

```jsx
function UserDashboard({ userId }) {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      const data = await gamificationService.getUserAnalytics(userId);
      setAnalytics(data);
    };
    loadAnalytics();
  }, [userId]);

  return (
    <div>
      <h2>Your Stats</h2>
      <p>Level: {analytics?.profile.current_level}</p>
      <p>Total XP: {analytics?.profile.total_xp}</p>
      <p>Gold: {analytics?.profile.gold}</p>
      <p>Total Activities: {analytics?.totalActivities}</p>
      <p>Average Daily XP: {analytics?.averageDailyXP}</p>
    </div>
  );
}
```

### Platform Analytics

```jsx
// Get platform-wide insights (for admin dashboards)
const platformStats = await gamificationService.getPlatformAnalytics();
console.log('Total Users:', platformStats.totalUsers);
console.log('Average Level:', platformStats.averageLevel);
console.log('Active Users (30d):', platformStats.activeUsers);
```

## 🔄 Real-time Updates

### User Progress Updates

```jsx
function GamificationNotifications({ userId }) {
  useEffect(() => {
    const subscription = gamificationService.subscribeToUserUpdates(
      userId,
      (payload) => {
        if (payload.new.activity_type === 'level_up') {
          showNotification('🎉 Level Up!', payload.new.description);
        } else if (payload.new.activity_type === 'badge_earned') {
          showNotification('🏆 Badge Earned!', payload.new.description);
        }
      }
    );

    return () => gamificationService.unsubscribe(`user_${userId}`);
  }, [userId]);

  return null; // This component just handles notifications
}
```

## 🎮 Best Practices

### 1. Balanced Rewards

```jsx
// Create a balanced XP economy
const XP_VALUES = {
  // Low effort, frequent actions
  like: 2,
  view_content: 1,
  daily_login: 10,
  
  // Medium effort actions  
  comment: 15,
  share: 20,
  profile_update: 25,
  
  // High effort actions
  create_content: 50,
  tutorial_complete: 100,
  referral: 200
};
```

### 2. Meaningful Progression

```jsx
// Level requirements that feel achievable but meaningful
const LEVEL_SYSTEM = {
  xpPerLevel: 1000,      // Consistent XP per level
  goldPerLevel: 50,      // Gold bonus for leveling up
  maxLevel: 100,         // Reasonable maximum level
  
  // Special level rewards
  milestoneRewards: {
    5: { gold: 100, badge: 'early_adopter' },
    10: { gold: 250, badge: 'dedicated_user' },
    25: { gold: 500, badge: 'power_user' },
    50: { gold: 1000, badge: 'elite_member' }
  }
};
```

### 3. Engaging Shop Items

```jsx
// Mix of cosmetic and functional items
const SHOP_STRATEGY = {
  // Low-cost items for frequent purchases
  cosmetics: [50, 75, 100],
  
  // Medium-cost functional items
  boosts: [150, 200, 300],
  
  // High-cost premium items
  premium: [500, 750, 1000]
};
```

## 🔧 Configuration Options

### Theme Customization

```jsx
const customTheme = {
  primaryColor: '#6366f1',    // Your brand primary
  secondaryColor: '#8b5cf6',  // Your brand secondary
  accentColor: '#f59e0b',     // Highlights and CTAs
  goldColor: '#ffd700',       // Gold currency color
  backgroundColor: '#1e1e2e', // Dark theme background
  cardBackground: '#2d1b4e'   // Card/panel background
};
```

### XP System Configuration

```jsx
const xpConfig = {
  levelMultiplier: 1000,      // XP needed per level
  maxLevel: 100,              // Maximum achievable level
  
  // Interaction XP values
  interactions: {
    comment: 10,
    like: 5,
    share: 15,
    post: 25,
    daily_login: 20
  }
};
```

## 🚀 Deployment

### Environment Variables

```bash
# .env file
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_GAMIFICATION_ENABLED=true
```

### Production Considerations

1. **Database Indexes**: Ensure proper indexes are in place for performance
2. **Rate Limiting**: Prevent XP farming with reasonable rate limits
3. **Monitoring**: Track gamification metrics and user engagement
4. **Backup**: Regular backups of user progress data

This simplified system provides a complete gamification experience focused on individual user progression without complex admin management!