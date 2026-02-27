# =====================
# Stage 1: Build Frontend
# =====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# =====================
# Stage 2: Build Backend (install production deps + compile native modules)
# =====================
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# better-sqlite3 / bcrypt 需要编译原生模块
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src

# =====================
# Stage 3: Final Image (nginx:alpine + minimal Node runtime)
# =====================
FROM nginx:1.27-alpine

# 从官方 node 镜像只复制运行时二进制和标准库，避免引入完整 node 镜像
COPY --from=backend-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=backend-builder /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm

# 安装 supervisord（nginx 已内置）
RUN apk add --no-cache supervisor && \
    mkdir -p /var/log/supervisor

# ---------- Nginx 配置 ----------
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# ---------- 后端 ----------
WORKDIR /app/backend

COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/src ./src
COPY backend/package.json ./

# 数据和日志目录（建议挂载 volume）
RUN mkdir -p /app/backend/data /app/backend/logs /run/nginx

# ---------- supervisord 配置 ----------
COPY supervisord.conf /etc/supervisord.conf

# ---------- 环境变量默认值 ----------
ENV PORT=3000 \
    NODE_ENV=production \
    DATABASE_PATH=/app/backend/data/monitor.db

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
