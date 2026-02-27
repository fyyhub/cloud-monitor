<template>
  <div>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="告警历史" name="history">
        <el-table :data="alerts" v-loading="loading" style="margin-top:12px">
          <el-table-column prop="container_name" label="容器" width="150" />
          <el-table-column prop="platform_name" label="平台" width="120" />
          <el-table-column prop="alert_type" label="告警类型" width="120" />
          <el-table-column prop="message" label="告警内容" show-overflow-tooltip />
          <el-table-column label="通知" width="80">
            <template #default="{ row }">
              <el-tag :type="row.notified ? 'success' : 'warning'" size="small">
                {{ row.notified ? '已通知' : '未通知' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="时间" width="180" />
        </el-table>
        <el-pagination style="margin-top:12px" layout="total, prev, pager, next"
          :total="total" :page-size="pageSize" v-model:current-page="page" @current-change="load" />
      </el-tab-pane>

      <el-tab-pane label="告警配置" name="configs">
        <div style="margin:12px 0">
          <el-button type="primary" @click="openAddConfig">添加通知配置</el-button>
        </div>
        <el-table :data="configs">
          <el-table-column prop="notification_type" label="通知类型" width="120">
            <template #default="{ row }">
              <el-tag>{{ row.notification_type === 'email' ? '邮件' : 'Webhook' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="配置内容">
            <template #default="{ row }">
              {{ row.notification_type === 'email' ? row.config.email : row.config.url }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-switch :model-value="!!row.enabled" @change="toggleConfig(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" type="danger" @click="removeConfig(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="configDialogVisible" title="添加通知配置" width="440px">
      <el-form :model="configForm" ref="configFormRef" label-width="100px">
        <el-form-item label="通知类型" prop="notification_type" :rules="[{ required: true }]">
          <el-radio-group v-model="configForm.notification_type">
            <el-radio value="email">邮件</el-radio>
            <el-radio value="webhook">Webhook</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="configForm.notification_type === 'email'" label="邮件地址" prop="config.email"
          :rules="[{ required: true, type: 'email', message: '请输入有效邮箱' }]">
          <el-input v-model="configForm.config.email" placeholder="接收告警的邮箱地址" />
        </el-form-item>
        <el-form-item v-if="configForm.notification_type === 'webhook'" label="Webhook URL"
          prop="config.url" :rules="[{ required: true, message: '请输入 URL' }]">
          <el-input v-model="configForm.config.url" placeholder="https://..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="addConfig">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { alertApi } from '@/api'

const activeTab = ref('history')
const alerts = ref([])
const configs = ref([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = 20
const configDialogVisible = ref(false)
const configFormRef = ref()
const configForm = ref({ notification_type: 'email', config: { email: '', url: '' } })

async function load() {
  loading.value = true
  try {
    const res = await alertApi.list({ page: page.value, limit: pageSize })
    alerts.value = res.alerts
    total.value = res.total
  } finally {
    loading.value = false
  }
}

async function loadConfigs() {
  configs.value = await alertApi.listConfigs()
}

function openAddConfig() {
  configForm.value = { notification_type: 'email', config: { email: '', url: '' } }
  configDialogVisible.value = true
}

async function addConfig() {
  await configFormRef.value.validate()
  const { notification_type, config } = configForm.value
  const payload = notification_type === 'email' ? { email: config.email } : { url: config.url }
  await alertApi.addConfig({ notification_type, config: payload })
  ElMessage.success('添加成功')
  configDialogVisible.value = false
  loadConfigs()
}

async function toggleConfig(row) {
  await alertApi.updateConfig(row.id, { enabled: !row.enabled })
  loadConfigs()
}

async function removeConfig(row) {
  await ElMessageBox.confirm('确定删除此通知配置？', '警告', { type: 'warning' })
  await alertApi.removeConfig(row.id)
  ElMessage.success('已删除')
  loadConfigs()
}

onMounted(() => { load(); loadConfigs() })
</script>
