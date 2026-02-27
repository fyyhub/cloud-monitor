<template>
  <div>
    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="stat in stats" :key="stat.label">
        <el-card shadow="never">
          <div class="stat-item">
            <div class="stat-value" :style="{ color: stat.color }">{{ stat.value }}</div>
            <div class="stat-label">{{ stat.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="12">
        <el-card header="平台状态">
          <el-table :data="platforms" size="small">
            <el-table-column prop="name" label="平台名称" />
            <el-table-column prop="platform_type" label="类型" width="100" />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                  {{ row.enabled ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="最近告警">
          <el-table :data="recentAlerts" size="small">
            <el-table-column prop="container_name" label="容器" />
            <el-table-column prop="message" label="告警内容" show-overflow-tooltip />
            <el-table-column prop="created_at" label="时间" width="160" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { platformApi, containerApi, alertApi } from '@/api'

const platforms = ref([])
const containers = ref([])
const recentAlerts = ref([])

const stats = computed(() => [
  { label: '平台总数', value: platforms.value.length, color: '#409EFF' },
  { label: '容器总数', value: containers.value.length, color: '#67C23A' },
  { label: '运行中', value: containers.value.filter(c => c.status === 'running').length, color: '#67C23A' },
  { label: '异常', value: containers.value.filter(c => c.status === 'error').length, color: '#F56C6C' }
])

onMounted(async () => {
  const [p, c, a] = await Promise.allSettled([
    platformApi.list(),
    containerApi.list(),
    alertApi.list({ limit: 5 })
  ])
  if (p.status === 'fulfilled') platforms.value = p.value
  if (c.status === 'fulfilled') containers.value = c.value
  if (a.status === 'fulfilled') recentAlerts.value = a.value.alerts
})
</script>

<style scoped>
.stat-row { margin-bottom: 8px; }
.stat-item { text-align: center; padding: 8px 0; }
.stat-value { font-size: 32px; font-weight: bold; }
.stat-label { color: #909399; margin-top: 4px; }
</style>
