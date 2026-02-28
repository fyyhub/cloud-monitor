<template>
  <div class="status-page">
    <!-- 顶栏 -->
    <header class="sp-header">
      <div class="sp-header-inner">
        <div class="sp-brand">
          <div class="sp-logo"><el-icon :size="20"><Monitor /></el-icon></div>
          <span class="sp-title">服务状态监控</span>
        </div>
        <router-link to="/admin/dashboard" class="admin-entry">
          <el-icon><Setting /></el-icon> 管理后台
        </router-link>
      </div>
    </header>

    <!-- 总体状态横幅 -->
    <div class="sp-banner" :class="bannerClass">
      <div class="sp-banner-inner">
        <div class="sp-banner-icon">
          <el-icon :size="28"><CircleCheckFilled v-if="overallOk" /><WarningFilled v-else /></el-icon>
        </div>
        <div class="sp-banner-text">
          <div class="sp-banner-title">{{ overallOk ? '所有服务运行正常' : '部分服务异常' }}</div>
          <div class="sp-banner-sub">更新于 {{ lastUpdated }}</div>
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="sp-stats">
      <div class="sp-stat-card" v-for="s in summaryStats" :key="s.label">
        <div class="sp-stat-num" :style="{ color: s.color }">{{ s.value }}</div>
        <div class="sp-stat-label">
          <span class="sp-stat-dot" :style="{ background: s.color }"></span>
          {{ s.label }}
        </div>
      </div>
    </div>

    <!-- 容器列表 -->
    <div class="sp-content" v-loading="loading">
      <div v-for="group in groupedContainers" :key="group.platformType" class="sp-group">
        <div class="sp-group-header">
          <div class="sp-group-left">
            <div class="sp-platform-icon">{{ group.platformType.charAt(0).toUpperCase() }}</div>
            <span class="sp-platform-name">{{ group.platformType }}</span>
          </div>
          <span class="sp-group-count">{{ group.containers.length }} 个服务</span>
        </div>
        <div class="sp-table">
          <div
            v-for="c in group.containers"
            :key="c.container_name"
            class="sp-row"
          >
            <div class="sp-row-indicator" :class="`ind-${c.status}`"></div>
            <div class="sp-row-body">
              <div class="sp-row-main">
                <div class="sp-row-info">
                  <span class="sp-svc-name">{{ c.container_name }}</span>
                  <div class="sp-domains" v-if="c.domains && c.domains.length">
                    <a
                      v-for="d in c.domains"
                      :key="d"
                      :href="`https://${d}`"
                      target="_blank"
                      rel="noopener"
                      class="sp-domain-chip"
                    ><el-icon :size="11"><Link /></el-icon>{{ d }}</a>
                  </div>
                </div>
                <div class="sp-row-status">
                  <span class="sp-badge" :class="`badge-${c.status}`">
                    <span class="sp-pulse" v-if="c.status === 'running'"></span>
                    {{ statusLabel(c.status) }}
                  </span>
                </div>
              </div>
              <!-- 简易 uptime 条 -->
              <div class="sp-uptime-bar">
                <div class="sp-uptime-fill" :class="`fill-${c.status}`"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && containers.length === 0" class="sp-empty">
        <div class="sp-empty-icon">
          <el-icon :size="52"><Monitor /></el-icon>
        </div>
        <p>暂无服务数据</p>
        <span>请先在管理后台添加平台和容器</span>
      </div>
    </div>

    <!-- 页脚 -->
    <footer class="sp-footer">
      <span>Cloud Monitor</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Monitor, Setting, CircleCheckFilled, WarningFilled, Link } from '@element-plus/icons-vue'
import axios from 'axios'

const containers = ref([])
const loading = ref(false)

const overallOk = computed(() => {
  if (!containers.value.length) return true
  return containers.value.every(c => c.status === 'running' || c.status === 'deploying')
})

const bannerClass = computed(() => overallOk.value ? 'banner-ok' : 'banner-warn')

const summaryStats = computed(() => [
  { label: '全部服务', value: containers.value.length, color: '#6478b4' },
  { label: '正常运行', value: containers.value.filter(c => c.status === 'running').length, color: '#10b981' },
  { label: '已停止', value: containers.value.filter(c => c.status === 'stopped').length, color: '#94a3b8' },
  { label: '部署中', value: containers.value.filter(c => c.status === 'deploying').length, color: '#f59e0b' },
  { label: '异常', value: containers.value.filter(c => c.status === 'error').length, color: '#ef4444' },
])

const lastUpdated = computed(() => {
  const checks = containers.value.map(c => c.last_check).filter(Boolean)
  if (!checks.length) return '-'
  const latest = checks.sort().pop()
  return latest.replace('T', ' ').slice(0, 16)
})

const groupedContainers = computed(() => {
  const map = new Map()
  for (const c of containers.value) {
    const key = c.platform_type
    if (!map.has(key)) map.set(key, { platformType: key, containers: [] })
    map.get(key).containers.push(c)
  }
  return Array.from(map.values())
})

const statusLabel = (s) => ({ running: '正常运行', stopped: '已停止', error: '异常', deploying: '部署中' }[s] || s)

async function load() {
  loading.value = true
  try {
    const res = await axios.get('/api/status')
    containers.value = res.data
  } catch {
    containers.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
/* ===== 全局 ===== */
.status-page {
  min-height: 100vh;
  background: #f4f6fb;
  display: flex;
  flex-direction: column;
}

/* ===== 顶栏 ===== */
.sp-header {
  background: #1e293b;
  position: sticky;
  top: 0;
  z-index: 20;
}
.sp-header-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sp-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sp-logo {
  width: 34px; height: 34px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.sp-title {
  font-size: 16px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: 0.5px;
}
.admin-entry {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  background: rgba(255,255,255,0.08);
  border-radius: 7px;
  color: #94a3b8;
  font-size: 13px;
  text-decoration: none;
  transition: all 0.2s;
}
.admin-entry:hover {
  background: rgba(255,255,255,0.15);
  color: #e2e8f0;
}

/* ===== 总体状态横幅 ===== */
.sp-banner {
  padding: 0 24px;
}
.sp-banner-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 28px 0;
  display: flex;
  align-items: center;
  gap: 16px;
}
.sp-banner-icon {
  width: 52px; height: 52px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.banner-ok { background: linear-gradient(135deg, #ecfdf5, #d1fae5); }
.banner-ok .sp-banner-icon { background: #10b981; color: #fff; }
.banner-ok .sp-banner-title { color: #065f46; }

.banner-warn { background: linear-gradient(135deg, #fef3c7, #fde68a); }
.banner-warn .sp-banner-icon { background: #f59e0b; color: #fff; }
.banner-warn .sp-banner-title { color: #92400e; }

.sp-banner-title {
  font-size: 20px;
  font-weight: 700;
}
.sp-banner-sub {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 2px;
}

/* ===== 统计卡片 ===== */
.sp-stats {
  max-width: 960px;
  width: 100%;
  margin: -8px auto 0;
  padding: 0 24px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.sp-stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  border: 1px solid #e8ecf4;
  transition: transform 0.2s, box-shadow 0.2s;
}
.sp-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.07);
}
.sp-stat-num {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
}
.sp-stat-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}
.sp-stat-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
}

/* ===== 内容区 ===== */
.sp-content {
  max-width: 960px;
  width: 100%;
  margin: 24px auto;
  padding: 0 24px;
  min-height: 200px;
  flex: 1;
}

/* ===== 分组 ===== */
.sp-group {
  margin-bottom: 28px;
}
.sp-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sp-group-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sp-platform-icon {
  width: 30px; height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.sp-platform-name {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  text-transform: capitalize;
}
.sp-group-count {
  font-size: 12px;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 3px 10px;
  border-radius: 20px;
}

/* ===== 容器行 ===== */
.sp-table {
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e8ecf4;
  box-shadow: 0 1px 4px rgba(0,0,0,0.03);
  overflow: hidden;
}
.sp-row {
  display: flex;
  transition: background 0.15s;
}
.sp-row:hover {
  background: #f8fafc;
}
.sp-row + .sp-row {
  border-top: 1px solid #f1f5f9;
}
.sp-row-indicator {
  width: 4px;
  flex-shrink: 0;
}
.ind-running  { background: #10b981; }
.ind-stopped  { background: #cbd5e1; }
.ind-error    { background: #ef4444; }
.ind-deploying { background: #f59e0b; }

.sp-row-body {
  flex: 1;
  padding: 16px 20px;
  min-width: 0;
}
.sp-row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sp-row-info {
  min-width: 0;
  flex: 1;
}
.sp-svc-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}
.sp-domains {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.sp-domain-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #6366f1;
  text-decoration: none;
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}
.sp-domain-chip:hover {
  background: #e0e7ff;
  text-decoration: underline;
}

/* ===== 状态徽章 ===== */
.sp-row-status {
  flex-shrink: 0;
}
.sp-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 20px;
  white-space: nowrap;
}
.badge-running  { background: #d1fae5; color: #065f46; }
.badge-stopped  { background: #f1f5f9; color: #64748b; }
.badge-error    { background: #fee2e2; color: #991b1b; }
.badge-deploying { background: #fef3c7; color: #92400e; }

.sp-pulse {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #10b981;
  animation: pulse-anim 1.5s ease-in-out infinite;
}
@keyframes pulse-anim {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
  50% { opacity: 0.7; box-shadow: 0 0 0 5px rgba(16,185,129,0); }
}

/* ===== Uptime 条 ===== */
.sp-uptime-bar {
  margin-top: 10px;
  height: 4px;
  border-radius: 4px;
  background: #f1f5f9;
  overflow: hidden;
}
.sp-uptime-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s ease;
}
.fill-running  { width: 100%; background: linear-gradient(90deg, #6ee7b7, #10b981); }
.fill-stopped  { width: 30%; background: #cbd5e1; }
.fill-error    { width: 15%; background: linear-gradient(90deg, #fca5a5, #ef4444); }
.fill-deploying { width: 60%; background: linear-gradient(90deg, #fde68a, #f59e0b); }

/* ===== 空状态 ===== */
.sp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #94a3b8;
}
.sp-empty-icon {
  width: 88px; height: 88px;
  background: #f1f5f9;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  color: #cbd5e1;
}
.sp-empty p { margin: 0; font-size: 16px; font-weight: 600; color: #64748b; }
.sp-empty span { font-size: 13px; margin-top: 6px; }

/* ===== 页脚 ===== */
.sp-footer {
  text-align: center;
  padding: 20px;
  font-size: 12px;
  color: #cbd5e1;
}

/* ===== 响应式 ===== */
@media (max-width: 640px) {
  .sp-stats {
    grid-template-columns: repeat(3, 1fr);
  }
  .sp-stat-num { font-size: 22px; }
  .sp-banner-title { font-size: 17px; }
  .sp-row-main { flex-direction: column; align-items: flex-start; gap: 8px; }
  .sp-row-status { align-self: flex-start; }
}
@media (max-width: 400px) {
  .sp-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
