# 数据库升级完成

## 新增功能

项目现已支持三种数据库：
- **SQLite**（默认）- 适合小型部署和开发环境
- **PostgreSQL** - 适合生产环境和大规模部署
- **MySQL** - 适合已有 MySQL 基础设施的环境

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置数据库

编辑 `.env` 文件：

```env
# 使用 SQLite（默认，无需额外配置）
DB_TYPE=sqlite
DATABASE_PATH=./data/monitor.db

# 或使用 PostgreSQL
# DB_TYPE=postgres
# DATABASE_URL=postgresql://user:password@localhost:5432/cloud_monitor

# 或使用 MySQL
# DB_TYPE=mysql
# DATABASE_URL=mysql://user:password@localhost:3306/cloud_monitor
```

### 3. 测试数据库连接

```bash
node test-db.js
```

### 4. 初始化数据库

```bash
npm run db:init
```

### 5. 启动应用

```bash
npm start
```

## 代码变更说明

### 主要改动

1. **database.js** - 新增 `DbAdapter` 类，统一三种数据库的接口
2. **所有路由文件** - 将同步调用改为 `async/await`
3. **initDb.js** - 根据数据库类型生成不同的建表 SQL
4. **package.json** - 新增 `sequelize`、`pg`、`mysql2` 依赖

### API 兼容性

所有现有 API 接口保持不变，无需修改前端代码。

### 性能影响

- SQLite: 无变化
- PostgreSQL/MySQL: 所有数据库操作现在是异步的，性能更好

## 从 SQLite 迁移到 PostgreSQL/MySQL

### 方法1：使用 pgloader（推荐）

```bash
# 安装 pgloader
apt-get install pgloader  # Debian/Ubuntu
brew install pgloader     # macOS

# 迁移到 PostgreSQL
pgloader ./data/monitor.db postgresql://user:pass@localhost/cloud_monitor

# 迁移到 MySQL
pgloader ./data/monitor.db mysql://user:pass@localhost/cloud_monitor
```

### 方法2：手动导出导入

```bash
# 1. 导出 SQLite 数据为 SQL
sqlite3 ./data/monitor.db .dump > backup.sql

# 2. 编辑 backup.sql，调整语法差异
# 3. 导入到目标数据库
psql -U postgres cloud_monitor < backup.sql  # PostgreSQL
mysql -u root -p cloud_monitor < backup.sql  # MySQL
```

## Docker 部署

### 使用 SQLite（默认）

```bash
docker-compose up -d
```

### 使用 PostgreSQL

编辑 `docker-compose.yml`，取消注释 PostgreSQL 配置：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: cloud_monitor
      POSTGRES_USER: monitor
      POSTGRES_PASSWORD: your_password
    volumes:
      - pgdata:/var/lib/postgresql/data

  cloud-monitor:
    environment:
      - DB_TYPE=postgres
      - DATABASE_URL=postgresql://monitor:your_password@postgres:5432/cloud_monitor
    depends_on:
      - postgres

volumes:
  pgdata:
```

然后启动：

```bash
docker-compose up -d
```

## 故障排查

### 测试失败

运行测试脚本查看详细错误：

```bash
node test-db.js
```

### 查看日志

```bash
tail -f logs/combined.log
```

### 常见问题

1. **PostgreSQL 连接失败**
   - 检查 PostgreSQL 服务是否运行：`pg_isready`
   - 检查防火墙和端口：`telnet localhost 5432`

2. **MySQL 连接失败**
   - 检查 MySQL 服务：`mysqladmin ping`
   - 检查用户权限：`SHOW GRANTS FOR 'user'@'host';`

3. **权限错误**
   - 确保数据库用户有 CREATE、INSERT、UPDATE、DELETE 权限

## 更多信息

详细配置说明请参考 [DATABASE.md](./DATABASE.md)
