#!/usr/bin/env node

/**
 * 数据库连接测试脚本
 * 用法: node test-db.js [sqlite|postgres|mysql]
 */

import { getDb, closeDb, DB_TYPE } from './src/config/database.js'

async function testDatabase() {
  console.log(`\n测试数据库类型: ${DB_TYPE}`)
  console.log('=' .repeat(50))

  try {
    const db = getDb()

    // 测试连接
    console.log('✓ 数据库连接成功')
    await db.authenticate()
    console.log('✓ 数据库认证成功')

    // 测试建表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS test_table (
        id ${DB_TYPE === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' :
            DB_TYPE === 'postgres' ? 'SERIAL PRIMARY KEY' :
            'INT AUTO_INCREMENT PRIMARY KEY'},
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('✓ 建表成功')

    // 测试插入
    const result = await db.run(
      'INSERT INTO test_table (name) VALUES (?)',
      ['test_' + Date.now()]
    )
    console.log('✓ 插入数据成功, ID:', result.lastInsertRowid)

    // 测试查询
    const rows = await db.all('SELECT * FROM test_table LIMIT 5', [])
    console.log('✓ 查询数据成功, 记录数:', rows.length)

    // 清理测试表
    await db.run('DROP TABLE test_table', [])
    console.log('✓ 清理测试表成功')

    await closeDb()
    console.log('\n✅ 所有测试通过!\n')
    process.exit(0)
  } catch (err) {
    console.error('\n❌ 测试失败:', err.message)
    console.error(err)
    process.exit(1)
  }
}

testDatabase()
