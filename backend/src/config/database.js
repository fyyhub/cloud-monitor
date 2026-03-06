import { Sequelize, QueryTypes } from 'sequelize'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 延迟读取，确保 dotenv 已加载后再取值
export function getDbType() {
  return (process.env.DB_TYPE || 'sqlite').toLowerCase()
}

function createSqliteDb() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/monitor.db')
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

function createSequelize() {
  const dbType = getDbType()

  if (dbType === 'postgres' || dbType === 'postgresql') {
    if (process.env.DATABASE_URL) {
      const needSsl = process.env.DB_SSL === 'true' || process.env.DATABASE_URL.includes('sslmode=require')
      return new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: needSsl ? {
          ssl: { require: true, rejectUnauthorized: false }
        } : {}
      })
    }
    return new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'cloud_monitor',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || '',
      logging: false,
      dialectOptions: process.env.DB_SSL === 'true' ? {
        ssl: { require: true, rejectUnauthorized: false }
      } : {}
    })
  }

  if (dbType === 'mysql') {
    if (process.env.DATABASE_URL) {
      return new Sequelize(process.env.DATABASE_URL, {
        dialect: 'mysql',
        logging: false,
        dialectOptions: { charset: 'utf8mb4' },
        define: { charset: 'utf8mb4' }
      })
    }
    return new Sequelize({
      dialect: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'cloud_monitor',
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      logging: false,
      dialectOptions: { charset: 'utf8mb4' },
      define: { charset: 'utf8mb4' }
    })
  }

  return null
}

// 统一数据库接口（async/await）
class DbAdapter {
  constructor() {
    const dbType = getDbType()
    this._dbType = dbType
    if (dbType === 'sqlite') {
      this._sqlite = createSqliteDb()
    } else {
      this._seq = createSequelize()
    }
  }

  get isPg() {
    return this._dbType === 'postgres' || this._dbType === 'postgresql'
  }

  // 将 ? 占位符转为 Postgres 的 $1/$2...
  _pg(sql) {
    let i = 0
    return sql.replace(/\?/g, () => `$${++i}`)
  }

  // 查询多行
  async all(sql, params = []) {
    if (this._sqlite) {
      return this._sqlite.prepare(sql).all(...params)
    }
    const q = this.isPg ? this._pg(sql) : sql
    return this._seq.query(q, {
      replacements: this.isPg ? undefined : params,
      bind: this.isPg ? params : undefined,
      type: QueryTypes.SELECT,
      raw: true
    })
  }

  // 查询单行
  async get(sql, params = []) {
    const rows = await this.all(sql, params)
    return rows[0] ?? null
  }

  // INSERT / UPDATE / DELETE，返回 { lastInsertRowid, changes }
  async run(sql, params = []) {
    if (this._sqlite) {
      const r = this._sqlite.prepare(sql).run(...params)
      return { lastInsertRowid: r.lastInsertRowid, changes: r.changes }
    }

    const q = this.isPg ? this._pg(sql) : sql

    if (this.isPg) {
      // Postgres RETURNING id 支持
      const returning = /^\s*INSERT/i.test(sql) ? q + ' RETURNING id' : q
      const [rows] = await this._seq.query(returning, { bind: params, raw: true })
      return {
        lastInsertRowid: Array.isArray(rows) && rows[0] ? rows[0].id : null,
        changes: Array.isArray(rows) ? rows.length : null
      }
    }

    const [, meta] = await this._seq.query(q, { replacements: params, raw: true })
    return {
      lastInsertRowid: meta?.insertId ?? null,
      changes: meta?.affectedRows ?? null
    }
  }

  // 执行多条 SQL（建表用）
  async exec(sql) {
    if (this._sqlite) {
      this._sqlite.exec(sql)
      return
    }
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean)
    for (const stmt of statements) {
      await this._seq.query(stmt, { raw: true })
    }
  }

  // 测试连接
  async authenticate() {
    if (this._sqlite) return
    await this._seq.authenticate()
  }

  close() {
    if (this._sqlite) {
      this._sqlite.close()
    } else {
      this._seq.close()
    }
  }
}

let _db

export function getDb() {
  if (!_db) {
    _db = new DbAdapter()
  }
  return _db
}

export async function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}
