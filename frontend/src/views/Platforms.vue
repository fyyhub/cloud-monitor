<template>
  <div>
    <div style="margin-bottom:16px">
      <el-button type="primary" @click="openAdd">添加平台</el-button>
    </div>

    <el-table :data="platforms" v-loading="loading">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="platform_type" label="平台类型" width="120">
        <template #default="{ row }">
          <el-tag>{{ row.platform_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-switch :model-value="!!row.enabled" @change="toggleEnabled(row)" />
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="添加时间" width="180" />
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" @click="testPlatform(row)">测试</el-button>
          <el-button size="small" type="warning" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="removePlatform(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editTarget ? '编辑平台' : '添加平台'" width="480px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="平台类型" prop="platform_type">
          <el-select v-model="form.platform_type" :disabled="!!editTarget" style="width:100%">
            <el-option v-for="t in platformTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="自定义名称" />
        </el-form-item>
        <el-form-item label="API Key" prop="api_key">
          <el-input v-model="form.api_key" type="password" show-password
            :placeholder="editTarget ? '不修改请留空' : '请输入 API Key'" />
          <el-button
            v-if="editTarget"
            size="small"
            style="margin-top:6px"
            :loading="keyLoading"
            @click="loadCurrentKey"
          >查看当前 Key</el-button>
        </el-form-item>
        <el-form-item v-if="form.platform_type === 'vercel'" label="Team ID">
          <el-input v-model="form.extra_config.teamId" placeholder="可选，Team 账号下项目必填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { platformApi, containerApi } from '@/api'

const platforms = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const submitting = ref(false)
const editTarget = ref(null)
const formRef = ref()
const keyLoading = ref(false)
const form = ref({ platform_type: '', name: '', api_key: '', extra_config: { teamId: '' } })

const platformTypes = [
  { label: 'Zeabur', value: 'zeabur' },
  { label: 'Render', value: 'render' },
  { label: 'Koyeb', value: 'koyeb' },
  { label: 'Vercel', value: 'vercel' }
]

const rules = {
  platform_type: [{ required: true, message: '请选择平台类型' }],
  name: [{ required: true, message: '请输入名称' }],
  api_key: [{ required: true, message: '请输入 API Key', trigger: 'blur' }]
}

async function load() {
  loading.value = true
  try { platforms.value = await platformApi.list() } finally { loading.value = false }
}

function openAdd() {
  editTarget.value = null
  form.value = { platform_type: '', name: '', api_key: '', extra_config: { teamId: '' } }
  dialogVisible.value = true
}

function openEdit(row) {
  editTarget.value = row
  form.value = {
    platform_type: row.platform_type,
    name: row.name,
    api_key: '',
    extra_config: { teamId: row.extra_config?.teamId || '' }
  }
  dialogVisible.value = true
}

async function loadCurrentKey() {
  keyLoading.value = true
  try {
    const res = await platformApi.getApiKey(editTarget.value.id)
    form.value.api_key = res.api_key
    ElMessage.success('已填入当前 Key，可直接查看或修改')
  } catch {
    ElMessage.error('获取失败')
  } finally {
    keyLoading.value = false
  }
}

async function onSubmit() {
  await formRef.value.validate()
  submitting.value = true
  try {
    const payload = {
      platform_type: form.value.platform_type,
      name: form.value.name,
      api_key: form.value.api_key
    }
    // 构建 extra_config，只保留非空字段
    if (form.value.platform_type === 'vercel') {
      const teamId = form.value.extra_config.teamId?.trim()
      payload.extra_config = teamId ? { teamId } : null
    }
    if (editTarget.value) {
      if (!payload.api_key) delete payload.api_key
      await platformApi.update(editTarget.value.id, payload)
      ElMessage.success('更新成功')
    } else {
      await platformApi.add(payload)
      // 新增平台后自动同步一次容器列表
      containerApi.refresh().catch(() => {})
      ElMessage.success('添加成功，正在后台同步服务列表...')
    }
    dialogVisible.value = false
    load()
  } catch (err) {
    ElMessage.error(err || '操作失败')
  } finally {
    submitting.value = false
  }
}

async function toggleEnabled(row) {
  await platformApi.update(row.id, { enabled: !row.enabled })
  load()
}

async function testPlatform(row) {
  ElMessage.info('正在测试连接...')
  const res = await platformApi.test(row.id)
  res.success ? ElMessage.success(res.message) : ElMessage.error(res.message)
}

async function removePlatform(row) {
  await ElMessageBox.confirm(`确定删除平台 "${row.name}" 吗？`, '警告', { type: 'warning' })
  await platformApi.remove(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>
