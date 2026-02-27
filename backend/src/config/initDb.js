import { getDb } from './database.js'

export function initDb() {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform_type VARCHAR(20) NOT NULL,
      name VARCHAR(100) NOT NULL,
      api_key TEXT NOT NULL,
      extra_config TEXT,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_id INTEGER NOT NULL,
      container_id VARCHAR(100) NOT NULL,
      container_name VARCHAR(100),
      status VARCHAR(20),
      last_check DATETIME,
      metadata TEXT,
      FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_id INTEGER NOT NULL,
      alert_type VARCHAR(20),
      message TEXT,
      notified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alert_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      notification_type VARCHAR(20),
      config TEXT,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watch_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      cron_expr VARCHAR(50) NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watch_task_containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      container_id INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES watch_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE,
      UNIQUE(task_id, container_id)
    );

    CREATE TABLE IF NOT EXISTS watch_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      container_id INTEGER NOT NULL,
      action VARCHAR(20) NOT NULL,
      result VARCHAR(20) NOT NULL,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES watch_tasks(id) ON DELETE CASCADE
    );
  `)

  console.log('数据库初始化完成')

  // 迁移：为已存在的 platforms 表补充 extra_config 列
  try {
    db.exec(`ALTER TABLE platforms ADD COLUMN extra_config TEXT`)
  } catch {
    // 列已存在则忽略
  }

  // 迁移：新增 watch 相关表（旧数据库兼容）
  const migrations = [
    `CREATE TABLE IF NOT EXISTS watch_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      cron_expr VARCHAR(50) NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS watch_task_containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      container_id INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES watch_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE,
      UNIQUE(task_id, container_id)
    )`,
    `CREATE TABLE IF NOT EXISTS watch_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      container_id INTEGER NOT NULL,
      action VARCHAR(20) NOT NULL,
      result VARCHAR(20) NOT NULL,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES watch_tasks(id) ON DELETE CASCADE
    )`
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* 已存在则忽略 */ }
  }
}

// 直接执行时初始化
initDb()
