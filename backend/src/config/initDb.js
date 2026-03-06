import 'dotenv/config'
import bcrypt from 'bcrypt'
import { getDb, getDbType } from './database.js'

export async function initDb() {
  const db = getDb()
  const dbType = getDbType()

  // 测试连接
  await db.authenticate()

  if (dbType === 'sqlite') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        must_change_password INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS platforms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        platform_type VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        api_key TEXT NOT NULL,
        extra_config TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS containers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform_id INTEGER NOT NULL,
        container_id VARCHAR(100) NOT NULL,
        container_name VARCHAR(100),
        status VARCHAR(20),
        last_check TIMESTAMP,
        metadata TEXT,
        FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container_id INTEGER NOT NULL,
        alert_type VARCHAR(20),
        message TEXT,
        notified INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES watch_tasks(id) ON DELETE CASCADE
      );
    `)
  } else if (dbType === 'postgres' || dbType === 'postgresql') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        must_change_password INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS platforms (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform_type VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        api_key TEXT NOT NULL,
        extra_config TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS containers (
        id SERIAL PRIMARY KEY,
        platform_id INTEGER NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
        container_id VARCHAR(100) NOT NULL,
        container_name VARCHAR(100),
        status VARCHAR(20),
        last_check TIMESTAMP,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
        alert_type VARCHAR(20),
        message TEXT,
        notified INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS alert_configs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type VARCHAR(20),
        config TEXT,
        enabled INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS watch_tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        cron_expr VARCHAR(50) NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS watch_task_containers (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES watch_tasks(id) ON DELETE CASCADE,
        container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
        UNIQUE(task_id, container_id)
      );

      CREATE TABLE IF NOT EXISTS watch_logs (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES watch_tasks(id) ON DELETE CASCADE,
        container_id INTEGER NOT NULL,
        action VARCHAR(20) NOT NULL,
        result VARCHAR(20) NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
  } else {
    // MySQL
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        must_change_password TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS platforms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        platform_type VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        api_key TEXT NOT NULL,
        extra_config TEXT,
        enabled TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS containers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        platform_id INT NOT NULL,
        container_id VARCHAR(100) NOT NULL,
        container_name VARCHAR(100),
        status VARCHAR(20),
        last_check TIMESTAMP NULL,
        metadata TEXT,
        FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_id INT NOT NULL,
        alert_type VARCHAR(20),
        message TEXT,
        notified TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS alert_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        notification_type VARCHAR(20),
        config TEXT,
        enabled TINYINT DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS watch_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        cron_expr VARCHAR(50) NOT NULL,
        enabled TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS watch_task_containers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        container_id INT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES watch_tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_task_container (task_id, container_id)
      );

      CREATE TABLE IF NOT EXISTS watch_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        container_id INT NOT NULL,
        action VARCHAR(20) NOT NULL,
        result VARCHAR(20) NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES watch_tasks(id) ON DELETE CASCADE
      );
    `)
  }

  console.log('数据库初始化完成')

  // 迁移：为已存在的 users 表补充 must_change_password 列
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`)
  } catch {
    // 列已存在则忽略
  }

  // 创建默认 admin 用户（如不存在）
  const adminUser = await db.get('SELECT id FROM users WHERE username = ?', ['admin'])
  if (!adminUser) {
    const hash = bcrypt.hashSync('admin123', 10)
    await db.run(
      'INSERT INTO users (username, password_hash, must_change_password) VALUES (?, ?, ?)',
      ['admin', hash, 1]
    )
    console.log('已创建默认管理员账户 admin / admin123')
  }

  // 迁移：为已存在的 platforms 表补充 extra_config 列
  try {
    await db.exec(`ALTER TABLE platforms ADD COLUMN extra_config TEXT`)
  } catch {
    // 列已存在则忽略
  }
}

// 直接执行时初始化
initDb().catch(err => {
  console.error('数据库初始化失败:', err)
  process.exit(1)
})
