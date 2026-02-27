<template>
  <div class="watch-page">
    <div class="page-header">
      <h2>定时监测</h2>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建任务</el-button>
    </div>

    <el-table :data="tasks" v-loading="loading" row-key="id">
      <el-table-column label="任务名称" prop="name" min-width="130" />
      <el-table-column label="Cron 表达式" prop="cron_expr" width="160">
        <template #default="{ row }">
          <el-tag type="info">{{ row.cron_expr }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="监测容器" min-width="200">
        <template #default="{ row }">
          <span v-if="!row.containers.length" class="text-muted">未绑定容器</span>
          <el-tag
            v-for="c in row.containers" :key="c.id"
            size="small" style="margin: 2px"
          >{{ c.container_name }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-switch
            :model-value="!!row.enabled"
            @change="toggleEnabled(row)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
          <el-button size="small" @click="openContainersDialog(row)">容器</el-button>
          <el-button size="small" @click="openLogsDialog(row)">日志</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建/编辑任务 Dialog -->
    <el-dialog v-model="taskDialogVisible" :title="editingTask ? '编辑任务' : '新建任务'" width="480px">
      <el-form :model="taskForm" label-width="110px" @submit.prevent>
        <el-form-item label="任务名称" required>
          <el-input v-model="taskForm.name" placeholder="如：每小时检查生产服务" />
        </el-form-item>
        <el-form-item label="Cron 表达式" required>
          <el-input v-model="taskForm.cron_expr" placeholder="如：0 * * * *（每小时）" />
          <div class="cron-tips">
            常用示例：
            <el-tag size="small" style="cursor:pointer" @click="taskForm.cron_expr = '*/5 * * * *'">每5分钟</el-tag>
            <el-tag size="small" style="cursor:pointer" @click="taskForm.cron_expr = '0 * * * *'">每小时</el-tag>
            <el-tag size="small" style="cursor:pointer" @click="taskForm.cron_expr = '0 0 * * *'">每天零点</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="taskForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitTask">确定</el-button>
      </template>
    </el-dialog>

    <!-- 绑定容器 Dialog -->
    <el-dialog v-model="containersDialogVisible" title="管理监测容器" width="540px">
      <p class="dialog-tip">选择该任务需要监测并自动重启的容器：</p>
      <el-transfer
        v-model="selectedContainerIds"
        :data="allContainers"
        :titles="['全部容器', '已监测']"
        :props="{ key: 'id', label: 'label' }"
        filterable
      />
      <template #footer>
        <el-button @click="containersDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitContainers">保存</el-button>
      </template>
    </el-dialog>

    <!-- 执行日志 Dialog -->
    <el-dialog v-model="logsDialogVisible" :title="`执行日志 — ${currentTask?.name}`" width="780px">
      <el-table :data="logs" v-loading="logsLoading" max-height="400">
        <el-table-column label="时间" prop="created_at" width="170" />
        <el-table-column label="容器" prop="container_name" width="140" />
        <el-table-column label="动作" prop="action" width="90">
          <template #default="{ row }">
            <el-tag :type="row.action === 'restart' ? 'warning' : 'info'" size="small">
              {{ row.action === 'restart' ? '重启' : '检查' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结果" prop="result" width="80">
          <template #default="{ row }">
            <el-tag :type="row.result === 'ok' || row.result === 'success' ? 'success' : 'danger'" size="small">
              {{ row.result === 'ok' || row.result === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="详情" prop="message" min-width="160" show-overflow-tooltip />
      </el-table>
      <el-pagination
        v-if="logTotal > logLimit"
        style="margin-top: 12px; justify-content: flex-end"
        layout="total, prev, pager, next"
        :total="logTotal"
        :page-size="logLimit"
        :current-page="logPage"
        @current-change="loadLogs"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { watchApi, containerApi } from '@/api/index'

const loading = ref(false)
const submitting = ref(false)
const tasks = ref([])

// ---- 加载任务列表 ----
async function loadTasks() {
  loading.value = true
  try {
    tasks.value = await watchApi.list()
  } finally {
    loading.value = false
  }
}

onMounted(loadTasks)

// ---- 新建/编辑任务 ----
const taskDialogVisible = ref(false)
const editingTask = ref(null)
const taskForm = ref({ name: '', cron_expr: '', enabled: true })

function openCreateDialog() {
  editingTask.value = null
  taskForm.value = { name: '', cron_expr: '', enabled: true }
  taskDialogVisible.value = true
}

function openEditDialog(row) {
  editingTask.value = row
  taskForm.value = { name: row.name, cron_expr: row.cron_expr, enabled: !!row.enabled }
  taskDialogVisible.value = true
}

async function submitTask() {
  if (!taskForm.value.name.trim() || !taskForm.value.cron_expr.trim()) {
    ElMessage.warning('请填写任务名称和 Cron 表达式')
    return
  }
  submitting.value = true
  try {
    const payload = { ...taskForm.value }
    if (editingTask.value) {
      await watchApi.update(editingTask.value.id, payload)
      ElMessage.success('任务已更新')
    } else {
      await watchApi.add(payload)
      ElMessage.success('任务已创建')
    }
    taskDialogVisible.value = false
    loadTasks()
  } catch (err) {
    ElMessage.error(typeof err === 'string' ? err : '操作失败')
  } finally {
    submitting.value = false
  }
}

// ---- 启用/禁用 ----
async function toggleEnabled(row) {
  try {
    await watchApi.update(row.id, { enabled: !row.enabled })
    row.enabled = row.enabled ? 0 : 1
  } catch {
    ElMessage.error('操作失败')
  }
}

// ---- 删除 ----
async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除任务「${row.name}」？`, '删除确认', { type: 'warning' })
  await watchApi.remove(row.id)
  ElMessage.success('已删除')
  loadTasks()
}

// ---- 绑定容器 ----
const containersDialogVisible = ref(false)
const currentTask = ref(null)
const allContainers = ref([])
const selectedContainerIds = ref([])

async function openContainersDialog(row) {
  currentTask.value = row
  const res = await containerApi.list()
  allContainers.value = res.map(c => ({
    id: c.id,
    label: `${c.container_name}（${c.platform_name || c.platform_type}）`
  }))
  selectedContainerIds.value = row.containers.map(c => c.id)
  containersDialogVisible.value = true
}

async function submitContainers() {
  submitting.value = true
  try {
    await watchApi.updateContainers(currentTask.value.id, { container_ids: selectedContainerIds.value })
    ElMessage.success('容器已保存')
    containersDialogVisible.value = false
    loadTasks()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    submitting.value = false
  }
}

// ---- 执行日志 ----
const logsDialogVisible = ref(false)
const logsLoading = ref(false)
const logs = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const logLimit = 50

async function openLogsDialog(row) {
  currentTask.value = row
  logPage.value = 1
  logsDialogVisible.value = true
  await loadLogs(1)
}

async function loadLogs(page = 1) {
  logPage.value = page
  logsLoading.value = true
  try {
    const res = await watchApi.logs(currentTask.value.id, { page, limit: logLimit })
    logs.value = res.logs
    logTotal.value = res.total
  } finally {
    logsLoading.value = false
  }
}
</script>

<style scoped>
.watch-page { padding: 20px; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-header h2 { margin: 0; }
.cron-tips { margin-top: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #909399; }
.text-muted { color: #c0c4cc; font-size: 13px; }
.dialog-tip { margin: 0 0 12px; color: #606266; font-size: 14px; }
</style>
