# =====================
# Stage 1: Build Frontend
# =====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit

COPY frontend/ ./
RUN npm run build && \
    # 删除 source maps 和不必要的文件
    find dist -name "*.map" -delete

# =====================
# Stage 2: Build Backend (install production deps + compile native modules)
# =====================
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# better-sqlite3 / bcrypt 需要编译原生模块
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
RUN npm ci --omit=dev --prefer-offline --no-audit && \
    # 清理 npm 缓存
    npm cache clean --force

COPY backend/src ./src

# =====================
# Stage 3: Final Image (nginx:alpine + minimal Node runtime)
# =====================
FROM nginx:1.27-alpine

# 只复制 node 二进制，不需要 npm
COPY --from=backend-builder /usr/local/bin/node /usr/local/bin/node

# 安装 supervisord 和 dumb-init（轻量级 init 系统）
RUN apk add --no-cache supervisor dumb-init && \
    # 清理 apk 缓存
    rm -rf /var/cache/apk/* && \
    mkdir -p /var/log/supervisor /run/nginx

# ---------- Nginx 配置 ----------
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# ---------- 后端 ----------
WORKDIR /app/backend

COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/src ./src
COPY backend/package.json ./

# 数据和日志目录（建议挂载 volume）
RUN mkdir -p /app/backend/data /app/backend/logs && \
    # 创建非 root 用户
    addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser && \
    # 设置权限
    chown -R appuser:appuser /app/backend /var/log/supervisor /run/nginx /var/cache/nginx /var/log/nginx

# ---------- supervisord 配置 ----------
COPY supervisord.conf /etc/supervisord.conf

# ---------- 环境变量默认值 ----------
ENV PORT=3000 \
    NODE_ENV=production \
    DATABASE_PATH=/app/backend/data/monitor.db

EXPOSE 80

# 使用 dumb-init 作为 PID 1，正确处理信号
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
