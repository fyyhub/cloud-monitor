# 数据库配置说明

本项目支持三种数据库：SQLite、PostgreSQL 和 MySQL。

## 配置方式

通过环境变量 `DB_TYPE` 指定数据库类型：

```bash
DB_TYPE=sqlite    # 默认，使用 SQLite
DB_TYPE=postgres  # 使用 PostgreSQL
DB_TYPE=mysql     # 使用 MySQL
```

## SQLite（默认）

适合小型部署和开发环境。

```env
DB_TYPE=sqlite
DATABASE_PATH=./data/monitor.db
```

## PostgreSQL

适合生产环境和大规模部署。

### 方式1：使用连接字符串

```env
DB_TYPE=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/cloud_monitor
DB_SSL=false  # 是否启用 SSL
```

### 方式2：使用独立配置项

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cloud_monitor
DB_USER=postgres
DB_PASS=your_password
DB_SSL=false
```

### 初始化 PostgreSQL 数据库

```bash
# 创建数据库
createdb cloud_monitor

# 或使用 psql
psql -U postgres -c "CREATE DATABASE cloud_monitor;"

# 启动应用（会自动创建表）
npm start
```

## MySQL

适合已有 MySQL 基础设施的环境。

### 方式1：使用连接字符串

```env
DB_TYPE=mysql
DATABASE_URL=mysql://user:password@localhost:3306/cloud_monitor
```

### 方式2：使用独立配置项

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=cloud_monitor
DB_USER=root
DB_PASS=your_password
```

### 初始化 MySQL 数据库

```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE cloud_monitor CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 启动应用（会自动创建表）
npm start
```

## Docker Compose 示例

### 使用 SQLite（默认）

```yaml
services:
  cloud-monitor:
    image: cloud-monitor:latest
    environment:
      - DB_TYPE=sqlite
      - DATABASE_PATH=/app/backend/data/monitor.db
    volumes:
      - ./data:/app/backend/data
```

### 使用 PostgreSQL

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: cloud_monitor
      POSTGRES_USER: monitor
      POSTGRES_PASSWORD: secure_password
    volumes:
      - pgdata:/var/lib/postgresql/data

  cloud-monitor:
    image: cloud-monitor:latest
    environment:
      - DB_TYPE=postgres
      - DATABASE_URL=postgresql://monitor:secure_password@postgres:5432/cloud_monitor
    depends_on:
      - postgres

volumes:
  pgdata:
```

### 使用 MySQL

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: cloud_monitor
      MYSQL_USER: monitor
      MYSQL_PASSWORD: secure_password
      MYSQL_ROOT_PASSWORD: root_password
    volumes:
      - mysqldata:/var/lib/mysql

  cloud-monitor:
    image: cloud-monitor:latest
    environment:
      - DB_TYPE=mysql
      - DATABASE_URL=mysql://monitor:secure_password@mysql:3306/cloud_monitor
    depends_on:
      - mysql

volumes:
  mysqldata:
```

## 数据迁移

### 从 SQLite 迁移到 PostgreSQL/MySQL

1. 导出 SQLite 数据（可使用工具如 `pgloader` 或手动导出）
2. 配置新数据库连接
3. 启动应用（自动创建表结构）
4. 导入数据

### 备份建议

- **SQLite**: 直接备份 `monitor.db` 文件
- **PostgreSQL**: 使用 `pg_dump`
  ```bash
  pg_dump -U postgres cloud_monitor > backup.sql
  ```
- **MySQL**: 使用 `mysqldump`
  ```bash
  mysqldump -u root -p cloud_monitor > backup.sql
  ```

## 性能对比

| 数据库 | 适用场景 | 并发性能 | 备份迁移 |
|--------|----------|----------|----------|
| SQLite | 小型部署、开发环境 | 低 | 简单（单文件） |
| PostgreSQL | 生产环境、大规模部署 | 高 | 需要工具 |
| MySQL | 已有 MySQL 基础设施 | 高 | 需要工具 |

## 故障排查

### 连接失败

检查数据库服务是否运行：
```bash
# PostgreSQL
pg_isready -h localhost -p 5432

# MySQL
mysqladmin -h localhost -P 3306 ping
```

### 权限错误

确保数据库用户有足够权限：
```sql
-- PostgreSQL
GRANT ALL PRIVILEGES ON DATABASE cloud_monitor TO monitor;

-- MySQL
GRANT ALL PRIVILEGES ON cloud_monitor.* TO 'monitor'@'%';
FLUSH PRIVILEGES;
```

### 查看日志

应用日志位于 `backend/logs/` 目录，包含详细的数据库连接和查询信息。
