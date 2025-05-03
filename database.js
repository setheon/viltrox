const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Set the database file path
const db = new sqlite3.Database(path.join(__dirname, 'points.db'));

// Initialize the database
function initDB() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        last_timestamp INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, server_id)
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Get user stats (points and last timestamp) for a specific user and server
function getUserStats(userId, serverId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT count, last_timestamp FROM user_stats
      WHERE user_id = ? AND server_id = ?
    `, [userId, serverId], (err, row) => {
      if (err) return reject(err);
      resolve(row || { count: 0, last_timestamp: 0 });
    });
  });
}

// Update or insert user stats for a specific user and server
function updateUserStats(userId, serverId, count, lastTimestamp) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO user_stats (user_id, server_id, count, last_timestamp)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, server_id) DO UPDATE SET
        count = excluded.count,
        last_timestamp = excluded.last_timestamp
    `, [userId, serverId, count, lastTimestamp], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  initDB,
  getUserStats,
  updateUserStats
};