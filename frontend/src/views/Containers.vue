<template>
  <div class="containers-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="filterStatus" placeholder="全部状态" clearable @change="load" class="filter-select">
          <el-option label="运行中" value="running" />
          <el-option label="已停止" value="stopped" />
          <el-option label="部署中" value="deploying" />
          <el-option label="异常" value="error" />
        </el-select>
        <el-input
          v-model="filterKeyword"
          placeholder="搜索容器名称 / 域名"
          clearable
          class="filter-input"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>
      <div class="toolbar-right">
        <span class="selected-hint" v-if="selection.length">已选 {{ selection.length }} 个</span>
        <el-button @click="refreshAll" :loading="refreshing" class="btn-refresh">
          <el-icon><Refresh /></el-icon> 刷新状态
        </el-button>
        <el-button type="warning" :disabled="!selection.length" @click="batchAction('restart')">
          <el-icon><RefreshRight /></el-icon> 批量重启
        </el-button>
        <el-button type="danger" :disabled="!selection.length" @click="batchAction('stop')">
          <el-icon><VideoPause /></el-icon> 批量停止
        </el-button>
      </div>
    </div>

    <!-- 统计条 -->
    <div class="stat-bar">
      <div class="stat-item" v-for="s in summaryStats" :key="s.label">
        <span class="stat-dot" :style="{ background: s.color }"></span>
        <span class="stat-num" :style="{ color: s.color }">{{ s.value }}</span>
        <span class="stat-label">{{ s.label }}</span>
      </div>
    </div>

    <!-- Card 网格（按平台分组） -->
    <div v-loading="loading" class="platform-groups">
      <div v-for="group in groupedContainers" :key="group.platformType" class="platform-group">
        <div class="platform-group-header" @click="toggleCollapse(group.platformType)">
          <el-icon class="collapse-arrow" :class="{ collapsed: collapsed[group.platformType] }"><ArrowDown /></el-icon>
          <span class="group-platform-name">{{ group.platformType }}</span>
          <span class="group-count">{{ group.containers.length }} 个容器</span>
        </div>
        <div class="card-grid" v-show="!collapsed[group.platformType]">
          <div
            v-for="c in group.containers"
            :key="c.id"
            class="container-card"
            :class="[`status-${c.status}`, { selected: isSelected(c) }]"
            @click="toggleSelect(c)"
          >
        <!-- 选中角标 -->
        <div class="check-mark" v-if="isSelected(c)">
          <el-icon><Check /></el-icon>
        </div>

        <!-- 状态指示条 -->
        <div class="status-bar"></div>

        <!-- 卡片头部 -->
        <div class="card-header">
          <div class="card-icon">
            <el-icon><Box /></el-icon>
          </div>
          <div class="card-title">
            <div class="container-name" :title="c.container_name">{{ c.container_name }}</div>
            <div class="platform-name">
              <el-icon style="font-size:11px"><Connection /></el-icon>
              {{ c.platform_name }}
              <el-tag size="small" class="type-tag">{{ c.platform_type }}</el-tag>
            </div>
          </div>
          <div class="status-badge" :class="`badge-${c.status}`">
            <span class="pulse" v-if="c.status === 'running'"></span>
            {{ statusLabel(c.status) }}
          </div>
        </div>

        <!-- 域名列表 -->
        <div class="domains" v-if="getDomains(c).length">
          <el-icon style="font-size:12px;color:#8b9fc1"><Link /></el-icon>
          <div class="domain-tags">
            <a class="domain-tag" v-for="d in getDomains(c)" :key="d" :href="`https://${d}`" :title="d" target="_blank" rel="noopener" @click.stop>{{ d }}</a>
          </div>
        </div>
        <div class="no-domain" v-else>
          <el-icon style="font-size:12px"><Link /></el-icon> 暂无绑定域名
        </div>

        <!-- 元数据信息 -->
        <div class="meta-grid">
          <div class="meta-item" v-if="c.metadata?.image">
            <span class="meta-key">镜像</span>
            <span class="meta-val" :title="c.metadata.image">{{ shortImage(c.metadata.image) }}</span>
          </div>
          <div class="meta-item" v-if="c.metadata?.cpu !== undefined">
            <span class="meta-key">CPU</span>
            <span class="meta-val">{{ c.metadata.cpu ?? '-' }}</span>
          </div>
          <div class="meta-item" v-if="c.metadata?.memory !== undefined">
            <span class="meta-key">内存</span>
            <span class="meta-val">{{ c.metadata.memory ?? '-' }}</span>
          </div>
          <div class="meta-item" v-if="c.metadata?.region">
            <span class="meta-key">地区</span>
            <span class="meta-val">{{ c.metadata.region }}</span>
          </div>
        </div>

        <!-- 底部：最近检查时间 + 操作按钮 -->
        <div class="card-footer">
          <span class="check-time">
            <el-icon><Clock /></el-icon>
            {{ formatTime(c.last_check) }}
          </span>
          <div class="actions" @click.stop>
            <el-tooltip content="重启" placement="top">
              <el-button circle size="small" type="warning" @click="singleAction(c, 'restart')">
                <el-icon><RefreshRight /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip :content="c.status === 'running' ? '停止' : '启动'" placement="top">
              <el-button
                circle size="small"
                :type="c.status === 'running' ? 'danger' : 'success'"
                @click="c.status === 'running' ? singleAction(c, 'stop') : singleAction(c, 'start')"
              >
                <el-icon><component :is="c.status === 'running' ? VideoPause : VideoPlay" /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="日志" placement="top">
              <el-button circle size="small" @click="singleAction(c, 'logs')">
                <el-icon><Document /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button circle size="small" type="danger" plain @click="singleAction(c, 'delete')">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </div><!-- /card-footer -->
        </div><!-- /container-card -->

        </div><!-- /card-grid -->
      </div><!-- /platform-group -->

      <!-- 空状态 -->
      <div v-if="!loading && filteredContainers.length === 0" class="empty-state">
        <el-icon class="empty-icon"><Box /></el-icon>
        <p>暂无容器数据</p>
      </div>
    </div><!-- /platform-groups -->

    <!-- 日志弹窗 -->
    <el-dialog v-model="logDialogVisible" :title="`日志 — ${logTarget?.container_name}`" width="860px" class="log-dialog">
      <div class="log-box" v-loading="logLoading">
        <pre>{{ logContent }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, RefreshRight, VideoPause, VideoPlay,
  Document, Delete, Box, Connection, Link, Clock, Check, ArrowDown
} from '@element-plus/icons-vue'
import { containerApi } from '@/api'

const containers = ref([])
const loading = ref(false)
const refreshing = ref(false)
const selection = ref([])
const filterStatus = ref('')
const filterKeyword = ref('')
const logDialogVisible = ref(false)
const logLoading = ref(false)
const logTarget = ref(null)
const logContent = ref('')

const filteredContainers = computed(() => {
  let list = containers.value
  if (filterStatus.value) list = list.filter(c => c.status === filterStatus.value)
  if (filterKeyword.value) {
    const kw = filterKeyword.value.toLowerCase()
    list = list.filter(c => {
      const domains = getDomains(c).join(' ').toLowerCase()
      return c.container_name.toLowerCase().includes(kw) || domains.includes(kw)
    })
  }
  return list
})

const collapsed = ref({})

const groupedContainers = computed(() => {
  const map = new Map()
  for (const c of filteredContainers.value) {
    const key = c.platform_type
    if (!map.has(key)) {
      map.set(key, { platformType: key, containers: [] })
    }
    map.get(key).containers.push(c)
  }
  return Array.from(map.values())
})

function toggleCollapse(type) {
  collapsed.value[type] = !collapsed.value[type]
}

const summaryStats = computed(() => [
  { label: '全部', value: containers.value.length, color: '#8b9fc1' },
  { label: '运行中', value: containers.value.filter(c => c.status === 'running').length, color: '#36d399' },
  { label: '已停止', value: containers.value.filter(c => c.status === 'stopped').length, color: '#6b7a99' },
  { label: '部署中', value: containers.value.filter(c => c.status === 'deploying').length, color: '#fbbd23' },
  { label: '异常', value: containers.value.filter(c => c.status === 'error').length, color: '#f87272' },
])

const statusLabel = (s) => ({ running: '运行中', stopped: '已停止', error: '异常', deploying: '部署中' }[s] || s)

function getDomains(c) {
  if (!c.metadata) return []
  const meta = c.metadata
  // 兼容多种字段命名
  const raw = meta.domains || meta.domain || meta.bindings || meta.urls || []
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw)) return raw
  return []
}

function shortImage(img) {
  if (!img) return '-'
  const parts = img.split('/')
  return parts[parts.length - 1]
}

function formatTime(t) {
  if (!t) return '-'
  return t.replace('T', ' ').slice(0, 16)
}

function isSelected(c) {
  return selection.value.some(s => s.id === c.id)
}

function toggleSelect(c) {
  const idx = selection.value.findIndex(s => s.id === c.id)
  if (idx === -1) selection.value.push(c)
  else selection.value.splice(idx, 1)
}

async function load() {
  loading.value = true
  try { containers.value = await containerApi.list() } finally { loading.value = false }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await containerApi.refresh()
    await load()
    ElMessage.success('刷新完成')
  } catch (err) {
    ElMessage.error(err?.message || '刷新失败')
  } finally {
    refreshing.value = false
  }
}

async function singleAction(row, action) {
  if (action === 'logs') { viewLogs(row); return }
  if (action === 'delete') {
    await ElMessageBox.confirm(`确定删除容器 "${row.container_name}" 吗？`, '警告', { type: 'warning' })
    await containerApi.remove(row.id)
    ElMessage.success('删除成功')
    load()
    return
  }
  try {
    if (action === 'restart') { await containerApi.restart(row.id); row.status = 'running' }
    else if (action === 'stop') { await containerApi.stop(row.id); row.status = 'stopped' }
    else if (action === 'start') { await containerApi.start(row.id); row.status = 'running' }
    ElMessage.success('操作成功')
  } catch (err) {
    ElMessage.error(err?.message || '操作失败')
  }
}

async function batchAction(action) {
  await ElMessageBox.confirm(`确定对 ${selection.value.length} 个容器执行「${action === 'restart' ? '重启' : '停止'}」操作？`, '确认')
  const res = await containerApi.batch({ ids: selection.value.map(c => c.id), action })
  const failed = res.results.filter(r => !r.success)
  failed.length ? ElMessage.warning(`${failed.length} 个操作失败`) : ElMessage.success('批量操作完成')
  selection.value = []
  load()
}

async function viewLogs(row) {
  logTarget.value = row
  logDialogVisible.value = true
  logLoading.value = true
  logContent.value = ''
  try {
    const res = await containerApi.logs(row.id, { lines: 200 })
    logContent.value = Array.isArray(res.logs)
      ? res.logs.map(l => l.content || l.message || JSON.stringify(l)).join('\n')
      : res.logs
  } catch (err) {
    logContent.value = `获取日志失败: ${err}`
  } finally {
    logLoading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.containers-page {
  padding: 0;
  background: transparent;
}

/* ---- 工具栏 ---- */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar-left { display: flex; gap: 10px; align-items: center; }
.toolbar-right { display: flex; gap: 8px; align-items: center; }
.filter-select { width: 130px; }
.filter-input { width: 220px; }
.selected-hint { font-size: 13px; color: #409eff; font-weight: 500; }
.btn-refresh { }

/* ---- 统计条 ---- */
.stat-bar {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  background: #f4f6fb;
  border-radius: 8px;
  padding: 10px 20px;
}
.stat-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.stat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.stat-num { font-size: 18px; font-weight: 700; line-height: 1; }
.stat-label { color: #909399; }

/* ---- 平台分组 ---- */
.platform-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 200px;
}
.platform-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f4f6fb;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.platform-group-header:hover {
  background: #eaecf5;
}
.collapse-arrow {
  font-size: 13px;
  color: #8b9fc1;
  transition: transform 0.2s;
}
.collapse-arrow.collapsed {
  transform: rotate(-90deg);
}
.group-platform-name {
  font-size: 14px;
  font-weight: 700;
  color: #1a2233;
  text-transform: capitalize;
}
.group-count {
  margin-left: auto;
  font-size: 12px;
  color: #909399;
}

/* ---- Card 网格 ---- */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
  min-height: 200px;
}

/* ---- 单个容器卡片 ---- */
.container-card {
  position: relative;
  background: #fff;
  border-radius: 10px;
  border: 1.5px solid #e4e9f0;
  padding: 16px 16px 12px;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s;
  overflow: hidden;
}
.container-card:hover {
  box-shadow: 0 4px 20px rgba(64, 158, 255, 0.12);
  border-color: #c0d4f5;
  transform: translateY(-1px);
}
.container-card.selected {
  border-color: #409eff;
  background: #f0f7ff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.15);
}

/* 状态左侧彩色条 */
.status-bar {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  border-radius: 10px 0 0 10px;
}
.status-running  .status-bar { background: #36d399; }
.status-stopped  .status-bar { background: #6b7a99; }
.status-error    .status-bar { background: #f87272; }
.status-deploying .status-bar { background: #fbbd23; }

/* 选中角标 */
.check-mark {
  position: absolute;
  top: 8px; right: 8px;
  width: 20px; height: 20px;
  background: #409eff;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  font-size: 12px;
  z-index: 2;
}

/* ---- 卡片头部 ---- */
.card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}
.card-icon {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  font-size: 18px;
  flex-shrink: 0;
}
.status-running  .card-icon { background: linear-gradient(135deg, #36d399, #0ca678); }
.status-error    .card-icon { background: linear-gradient(135deg, #f87272, #c92a2a); }
.status-deploying .card-icon { background: linear-gradient(135deg, #fbbd23, #e67700); }

.card-title { flex: 1; min-width: 0; }
.container-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a2233;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.platform-name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #8b9fc1;
  margin-top: 2px;
}
.type-tag {
  margin-left: 2px;
  background: #eef2ff;
  color: #5c6bc0;
  border: none;
  font-size: 10px;
}

/* 状态徽章 */
.status-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.badge-running  { background: #d1fae5; color: #065f46; }
.badge-stopped  { background: #f1f5f9; color: #475569; }
.badge-error    { background: #fee2e2; color: #991b1b; }
.badge-deploying { background: #fef3c7; color: #92400e; }

/* 运行中脉冲动画 */
.pulse {
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #36d399;
  animation: pulse-anim 1.4s infinite;
}
@keyframes pulse-anim {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

/* ---- 域名 ---- */
.domains, .no-domain {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 10px;
  padding: 7px 10px;
  background: #f8faff;
  border-radius: 6px;
  border: 1px solid #e8eef8;
  font-size: 12px;
}
.no-domain { color: #b0bccf; }
.domain-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.domain-tag {
  background: #e8f0fe;
  color: #3b5bdb;
  padding: 1px 7px;
  border-radius: 12px;
  font-size: 11px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
}
.domain-tag:hover {
  background: #d0e0fc;
  text-decoration: underline;
}

/* ---- 元数据网格 ---- */
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 8px;
  margin-bottom: 12px;
}
.meta-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #5a6a85;
}
.meta-key {
  color: #a0aec0;
  flex-shrink: 0;
}
.meta-val {
  color: #2d3a4e;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 卡片底部 ---- */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #f0f3f8;
  padding-top: 10px;
}
.check-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #b0bccf;
}
.actions { display: flex; gap: 5px; }

/* ---- 空状态 ---- */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: #c0cce0;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }

/* ---- 日志弹窗 ---- */
.log-box {
  background: #0d1117;
  color: #c9d1d9;
  padding: 14px;
  border-radius: 6px;
  max-height: 520px;
  overflow: auto;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}
pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
</style>
