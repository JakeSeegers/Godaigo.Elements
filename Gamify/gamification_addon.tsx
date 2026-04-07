import React, { useState, useEffect } from 'react';

// Simplified Gamification Component - XP and Gold focused
const GamificationAddon = ({ 
  supabaseUrl, 
  supabaseKey, 
  userId,
  config = {},
  onError = () => {},
  onSuccess = () => {}
}) => {
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('profile');

  // Default configuration
  const defaultConfig = {
    theme: {
      primaryColor: '#8b5cf6',
      secondaryColor: '#6366f1',
      accentColor: '#f59e0b',
      goldColor: '#ffd700'
    },
    xpSystem: {
      levelMultiplier: 1000,
      maxLevel: 100
    },
    shop: {
      enabled: true,
      items: [
        { id: 'avatar_frame', name: 'Premium Avatar Frame', cost: 100, type: 'cosmetic' },
        { id: 'title_vip', name: 'VIP Title', cost: 250, type: 'title' },
        { id: 'boost_xp', name: 'XP Boost (24h)', cost: 150, type: 'boost' },
        { id: 'theme_dark', name: 'Dark Theme', cost: 75, type: 'theme' }
      ]
    },
    ...config
  };

  useEffect(() => {
    if (userId) {
      loadUserData();
      loadLeaderboard();
    }
  }, [userId]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      
      // Simulate API calls - replace with actual Supabase calls
      const userData = {
        id: userId,
        displayName: 'Player',
        totalXP: 2500,
        currentLevel: 3,
        gold: 150,
        xpToNext: 500,
        badges: ['first_steps', 'active_user'],
        inventory: [],
        stats: {
          totalInteractions: 45,
          streak: 7,
          joinDate: '2024-01-15'
        }
      };

      setGameData({
        user: userData,
        leaderboard: [],
        badges: [
          { id: 'first_steps', name: 'First Steps', description: 'Complete your first interaction', icon: '👶', earned: true },
          { id: 'active_user', name: 'Active User', description: 'Use the platform for 7 days', icon: '🔥', earned: true },
          { id: 'social_butterfly', name: 'Social Butterfly', description: '50 interactions with others', icon: '🦋', earned: false },
          { id: 'gold_collector', name: 'Gold Collector', description: 'Earn 500 gold', icon: '💰', earned: false },
          { id: 'level_master', name: 'Level Master', description: 'Reach level 10', icon: '🏆', earned: false }
        ]
      });

      onSuccess('User data loaded successfully');
    } catch (error) {
      console.error('Error loading user data:', error);
      onError('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    // Simulate leaderboard data
    const leaderboardData = [
      { id: '1', displayName: 'Alex Champion', totalXP: 5000, level: 6, gold: 300 },
      { id: '2', displayName: 'Jordan Star', totalXP: 4500, level: 5, gold: 275 },
      { id: '3', displayName: 'Casey Pro', totalXP: 3800, level: 4, gold: 200 },
      { id: userId, displayName: 'You', totalXP: 2500, level: 3, gold: 150 },
      { id: '4', displayName: 'Sam Explorer', totalXP: 2200, level: 3, gold: 120 }
    ].sort((a, b) => b.totalXP - a.totalXP);

    setGameData(prev => ({ ...prev, leaderboard: leaderboardData }));
  };

  const purchaseItem = async (item) => {
    if (!gameData?.user || gameData.user.gold < item.cost) {
      onError('Insufficient gold!');
      return;
    }

    try {
      // Simulate purchase - replace with actual API call
      const updatedUser = {
        ...gameData.user,
        gold: gameData.user.gold - item.cost,
        inventory: [...gameData.user.inventory, item.id]
      };

      setGameData(prev => ({ ...prev, user: updatedUser }));
      onSuccess(`Purchased ${item.name}!`);
    } catch (error) {
      onError('Purchase failed');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="gamification-addon">
      <style jsx>{`
        .gamification-addon {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #1e1e2e 0%, #2d1b4e 50%, #1a1a2e 100%);
          color: #e0e0e0;
          border-radius: 15px;
          overflow: hidden;
          min-height: 600px;
        }

        .addon-header {
          background: linear-gradient(135deg, rgba(147, 51, 234, 0.1) 0%, rgba(79, 70, 229, 0.1) 100%);
          padding: 20px;
          border-bottom: 1px solid rgba(147, 51, 234, 0.3);
          text-align: center;
        }

        .addon-title {
          font-size: 2em;
          background: linear-gradient(135deg, ${defaultConfig.theme.accentColor}, #ef4444, ${defaultConfig.theme.primaryColor});
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 10px;
        }

        .user-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 15px;
          padding: 15px;
          background: rgba(30, 30, 46, 0.5);
          border-radius: 10px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${defaultConfig.theme.primaryColor}, ${defaultConfig.theme.secondaryColor});
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: white;
          font-size: 1.2em;
        }

        .user-stats {
          display: flex;
          gap: 20px;
          align-items: center;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          font-size: 1.4em;
          font-weight: bold;
          color: ${defaultConfig.theme.primaryColor};
        }

        .stat-value.gold {
          color: ${defaultConfig.theme.goldColor};
        }

        .stat-label {
          font-size: 0.8em;
          color: #b0b0b0;
        }

        .navigation {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin: 20px;
          flex-wrap: wrap;
        }

        .nav-btn {
          padding: 10px 20px;
          background: linear-gradient(135deg, rgba(147, 51, 234, 0.2), rgba(79, 70, 229, 0.2));
          border: 1px solid rgba(147, 51, 234, 0.5);
          border-radius: 8px;
          color: #e0e0e0;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .nav-btn:hover, .nav-btn.active {
          background: linear-gradient(135deg, ${defaultConfig.theme.primaryColor}, ${defaultConfig.theme.secondaryColor});
          transform: translateY(-2px);
        }

        .content-area {
          padding: 20px;
        }

        .progress-section {
          background: linear-gradient(135deg, rgba(30, 30, 46, 0.9), rgba(45, 27, 78, 0.7));
          border-radius: 15px;
          padding: 25px;
          border: 1px solid rgba(147, 51, 234, 0.3);
          margin-bottom: 20px;
        }

        .level-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .level-badge {
          background: linear-gradient(135deg, ${defaultConfig.theme.primaryColor}, ${defaultConfig.theme.secondaryColor});
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
          font-size: 1.1em;
        }

        .xp-info {
          text-align: right;
          color: #10b981;
          font-weight: 600;
        }

        .progress-bar {
          width: 100%;
          height: 12px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          overflow: hidden;
          margin: 10px 0;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, ${defaultConfig.theme.primaryColor}, #10b981);
          border-radius: 6px;
          transition: width 0.3s ease;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: linear-gradient(135deg, rgba(30, 30, 46, 0.8), rgba(45, 27, 78, 0.6));
          padding: 20px;
          border-radius: 10px;
          border: 1px solid rgba(147, 51, 234, 0.3);
          text-align: center;
        }

        .stat-number {
          font-size: 1.8em;
          font-weight: bold;
          color: ${defaultConfig.theme.primaryColor};
          margin-bottom: 5px;
        }

        .leaderboard {
          background: linear-gradient(135deg, rgba(30, 30, 46, 0.9), rgba(45, 27, 78, 0.7));
          border-radius: 10px;
          padding: 20px;
          border: 1px solid rgba(147, 51, 234, 0.3);
        }

        .player-row {
          display: grid;
          grid-template-columns: 40px 1fr 80px 80px 80px;
          gap: 15px;
          padding: 12px;
          margin-bottom: 8px;
          background: rgba(30, 30, 46, 0.5);
          border-radius: 8px;
          align-items: center;
          transition: all 0.3s ease;
        }

        .player-row:hover {
          transform: translateX(3px);
          border: 1px solid rgba(147, 51, 234, 0.5);
        }

        .player-row.current-user {
          border: 2px solid ${defaultConfig.theme.accentColor};
          background: rgba(245, 158, 11, 0.1);
        }

        .rank {
          font-weight: bold;
          text-align: center;
          color: ${defaultConfig.theme.accentColor};
        }

        .rank.gold { color: #ffd700; }
        .rank.silver { color: #c0c0c0; }
        .rank.bronze { color: #cd7f32; }

        .player-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .player-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${defaultConfig.theme.primaryColor}, ${defaultConfig.theme.secondaryColor});
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: white;
          font-size: 0.8em;
        }

        .player-name {
          font-weight: 600;
          color: #e0e0e0;
          font-size: 0.9em;
        }

        .xp-points {
          font-weight: bold;
          color: #10b981;
          font-size: 0.9em;
        }

        .gold-amount {
          font-weight: bold;
          color: ${defaultConfig.theme.goldColor};
          font-size: 0.9em;
        }

        .badges-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 15px;
          margin-top: 20px;
        }

        .badge-item {
          background: linear-gradient(135deg, rgba(30, 30, 46, 0.8), rgba(45, 27, 78, 0.6));
          padding: 20px;
          border-radius: 10px;
          border: 1px solid rgba(147, 51, 234, 0.3);
          text-align: center;
          transition: all 0.3s ease;
          position: relative;
        }

        .badge-item.earned {
          border-color: ${defaultConfig.theme.accentColor};
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(45, 27, 78, 0.6));
        }

        .badge-item.locked {
          opacity: 0.5;
          filter: grayscale(50%);
        }

        .badge-icon {
          font-size: 2em;
          margin-bottom: 10px;
        }

        .badge-name {
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 5px;
        }

        .badge-description {
          font-size: 0.8em;
          color: #b0b0b0;
        }

        .earned-checkmark {
          position: absolute;
          top: 10px;
          right: 10px;
          color: ${defaultConfig.theme.accentColor};
          font-size: 1.2em;
        }

        .shop-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 15px;
          margin-top: 20px;
        }

        .shop-item {
          background: linear-gradient(135deg, rgba(30, 30, 46, 0.8), rgba(45, 27, 78, 0.6));
          padding: 20px;
          border-radius: 10px;
          border: 1px solid rgba(147, 51, 234, 0.3);
          text-align: center;
          transition: all 0.3s ease;
        }

        .shop-item:hover {
          transform: scale(1.02);
          border-color: rgba(147, 51, 234, 0.6);
        }

        .item-name {
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 10px;
        }

        .item-cost {
          font-size: 1.2em;
          font-weight: bold;
          color: ${defaultConfig.theme.goldColor};
          margin: 10px 0;
        }

        .buy-btn {
          background: linear-gradient(135deg, ${defaultConfig.theme.goldColor}, #f59e0b);
          color: #1a1a2e;
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s ease;
        }

        .buy-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(255, 215, 0, 0.4);
        }

        .buy-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .owned-badge {
          background: ${defaultConfig.theme.primaryColor};
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.7em;
          font-weight: bold;
        }

        @media (max-width: 768px) {
          .user-header {
            flex-direction: column;
            gap: 15px;
          }
          
          .user-stats {
            gap: 15px;
          }
          
          .player-row {
            grid-template-columns: 30px 1fr 60px;
            gap: 10px;
          }
          
          .gold-amount, .xp-points:last-child {
            display: none;
          }
        }
      `}</style>

      <div className="addon-header">
        <h1 className="addon-title">🎮 Player Dashboard</h1>
        
        {gameData?.user && (
          <div className="user-header">
            <div className="user-info">
              <div className="avatar">
                {(gameData.user.displayName || 'P').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="player-name" style={{ fontSize: '1.2em', marginBottom: '5px' }}>
                  {gameData.user.displayName}
                </div>
                <div style={{ color: '#b0b0b0', fontSize: '0.9em' }}>
                  Member since {new Date(gameData.user.stats.joinDate).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <div className="user-stats">
              <div className="stat-item">
                <div className="stat-value">Lvl {gameData.user.currentLevel}</div>
                <div className="stat-label">Level</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{gameData.user.totalXP.toLocaleString()}</div>
                <div className="stat-label">Total XP</div>
              </div>
              <div className="stat-item">
                <div className="stat-value gold">💰 {gameData.user.gold}</div>
                <div className="stat-label">Gold</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="navigation">
        <button 
          className={`nav-btn ${activeSection === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveSection('profile')}
        >
          👤 Profile
        </button>
        <button 
          className={`nav-btn ${activeSection === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveSection('leaderboard')}
        >
          🏆 Leaderboard
        </button>
        <button 
          className={`nav-btn ${activeSection === 'badges' ? 'active' : ''}`}
          onClick={() => setActiveSection('badges')}
        >
          🎖️ Achievements
        </button>
        <button 
          className={`nav-btn ${activeSection === 'shop' ? 'active' : ''}`}
          onClick={() => setActiveSection('shop')}
        >
          🏪 Shop
        </button>
      </div>

      <div className="content-area">
        {activeSection === 'profile' && <ProfileSection gameData={gameData} config={defaultConfig} />}
        {activeSection === 'leaderboard' && <LeaderboardSection gameData={gameData} />}
        {activeSection === 'badges' && <BadgesSection gameData={gameData} />}
        {activeSection === 'shop' && <ShopSection gameData={gameData} config={defaultConfig} onPurchase={purchaseItem} />}
      </div>
    </div>
  );
};

// Profile Section Component
const ProfileSection = ({ gameData, config }) => {
  const user = gameData?.user;
  if (!user) return null;

  const progressPercentage = ((config.xpSystem.levelMultiplier - user.xpToNext) / config.xpSystem.levelMultiplier) * 100;

  return (
    <div>
      <div className="progress-section">
        <h3 style={{ textAlign: 'center', marginBottom: '20px', color: '#8b5cf6' }}>
          🚀 Your Progress
        </h3>
        
        <div className="level-info">
          <div className="level-badge">Level {user.currentLevel}</div>
          <div className="xp-info">
            {user.totalXP.toLocaleString()} XP • {user.xpToNext} to next level
          </div>
        </div>
        
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPercentage}%` }}></div>
        </div>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{user.stats.totalInteractions}</div>
          <div className="stat-label">Total Interactions</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{user.stats.streak}</div>
          <div className="stat-label">Day Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{user.badges.length}</div>
          <div className="stat-label">Badges Earned</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#ffd700' }}>{user.inventory.length}</div>
          <div className="stat-label">Items Owned</div>
        </div>
      </div>
    </div>
  );
};

// Leaderboard Section Component
const LeaderboardSection = ({ gameData }) => (
  <div className="leaderboard">
    <h3 style={{ textAlign: 'center', marginBottom: '15px', color: '#8b5cf6' }}>
      🏆 Global Leaderboard
    </h3>
    {gameData?.leaderboard?.map((player, index) => {
      const rank = index + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'gold';
      else if (rank === 2) rankClass = 'silver';
      else if (rank === 3) rankClass = 'bronze';

      const isCurrentUser = player.id === gameData.user?.id;

      return (
        <div key={player.id} className={`player-row ${isCurrentUser ? 'current-user' : ''}`}>
          <div className={`rank ${rankClass}`}>{rank}</div>
          <div className="player-info">
            <div className="player-avatar">
              {(player.displayName || 'P').charAt(0).toUpperCase()}
            </div>
            <div className="player-name">
              {player.displayName} {isCurrentUser && '(You)'}
            </div>
          </div>
          <div style={{ fontSize: '0.8em', color: '#8b5cf6' }}>Lvl {player.level}</div>
          <div className="xp-points">{player.totalXP.toLocaleString()}</div>
          <div className="gold-amount">💰{player.gold}</div>
        </div>
      );
    })}
  </div>
);

// Badges Section Component
const BadgesSection = ({ gameData }) => (
  <div>
    <h3 style={{ textAlign: 'center', marginBottom: '15px', color: '#8b5cf6' }}>
      🎖️ Achievement Badges
    </h3>
    <div className="badges-grid">
      {gameData?.badges?.map(badge => (
        <div key={badge.id} className={`badge-item ${badge.earned ? 'earned' : 'locked'}`}>
          {badge.earned && <div className="earned-checkmark">✅</div>}
          <div className="badge-icon">{badge.icon}</div>
          <div className="badge-name">{badge.name}</div>
          <div className="badge-description">{badge.description}</div>
        </div>
      ))}
    </div>
  </div>
);

// Shop Section Component
const ShopSection = ({ gameData, config, onPurchase }) => (
  <div>
    <h3 style={{ textAlign: 'center', marginBottom: '15px', color: '#8b5cf6' }}>
      🏪 Gold Shop
    </h3>
    <div style={{ textAlign: 'center', marginBottom: '20px', fontSize: '1.1em' }}>
      Your Gold: <span style={{ color: '#ffd700', fontWeight: 'bold' }}>💰 {gameData?.user?.gold || 0}</span>
    </div>
    
    <div className="shop-grid">
      {config.shop.items.map(item => {
        const isOwned = gameData?.user?.inventory?.includes(item.id);
        const canAfford = (gameData?.user?.gold || 0) >= item.cost;

        return (
          <div key={item.id} className="shop-item">
            <div className="item-name">{item.name}</div>
            <div style={{ fontSize: '0.9em', color: '#b0b0b0', marginBottom: '10px' }}>
              {item.type === 'cosmetic' && '🎨 Cosmetic'}
              {item.type === 'title' && '🏷️ Title'}
              {item.type === 'boost' && '⚡ Boost'}
              {item.type === 'theme' && '🎨 Theme'}
            </div>
            <div className="item-cost">💰 {item.cost} Gold</div>
            
            {isOwned ? (
              <div className="owned-badge">✅ Owned</div>
            ) : (
              <button 
                className="buy-btn" 
                disabled={!canAfford}
                onClick={() => onPurchase(item)}
              >
                {canAfford ? 'Purchase' : 'Insufficient Gold'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

// Loading Spinner Component
const LoadingSpinner = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '400px',
    color: '#8b5cf6'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '3em', marginBottom: '10px' }}>🎮</div>
      <div>Loading your progress...</div>
    </div>
  </div>
);

export default GamificationAddon;