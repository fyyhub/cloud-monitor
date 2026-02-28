<template>
  <div class="login-page">
    <el-card class="login-card">
      <h2 class="title">云容器监控平台</h2>
      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="onSubmit">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" size="large" prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" size="large"
            prefix-icon="Lock" show-password @keyup.enter="onSubmit" />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" @click="onSubmit" style="width:100%">
          登录
        </el-button>
      </el-form>
    </el-card>

    <!-- 强制修改密码对话框 -->
    <el-dialog v-model="showChangePwd" title="首次登录请修改密码" width="400px" :close-on-click-modal="false"
      :close-on-press-escape="false" :show-close="false">
      <el-form :model="pwdForm" :rules="pwdRules" ref="pwdFormRef">
        <el-form-item prop="newPassword" label="新密码">
          <el-input v-model="pwdForm.newPassword" type="password" placeholder="请输入新密码（至少6位）"
            show-password />
        </el-form-item>
        <el-form-item prop="confirmPassword" label="确认密码">
          <el-input v-model="pwdForm.confirmPassword" type="password" placeholder="再次输入新密码"
            show-password @keyup.enter="onChangePwd" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="changePwdLoading" @click="onChangePwd">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api'

const router = useRouter()
const auth = useAuthStore()
const formRef = ref()
const loading = ref(false)

const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const showChangePwd = ref(false)
const changePwdLoading = ref(false)
const pwdFormRef = ref()
const pwdForm = reactive({ newPassword: '', confirmPassword: '' })
// 保存登录时的原始密码，用于修改密码时作为 oldPassword
let loginPassword = ''

const pwdRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== pwdForm.newPassword) {
          callback(new Error('两次密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

async function onSubmit() {
  await formRef.value.validate()
  loading.value = true
  try {
    await auth.login(form)
    if (auth.mustChangePassword) {
      loginPassword = form.password
      showChangePwd.value = true
    } else {
      router.push('/admin/dashboard')
    }
  } catch (err) {
    ElMessage.error(err || '登录失败')
  } finally {
    loading.value = false
  }
}

async function onChangePwd() {
  await pwdFormRef.value.validate()
  changePwdLoading.value = true
  try {
    await authApi.changePassword({
      oldPassword: loginPassword,
      newPassword: pwdForm.newPassword
    })
    ElMessage.success('密码修改成功')
    auth.mustChangePassword = false
    showChangePwd.value = false
    router.push('/admin/dashboard')
  } catch (err) {
    ElMessage.error(err || '密码修改失败')
  } finally {
    changePwdLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
}
.login-card {
  width: 380px;
}
.title {
  text-align: center;
  margin-bottom: 24px;
  color: #303133;
}
</style>
