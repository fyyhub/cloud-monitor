<template>
  <el-container class="layout">
    <el-aside width="200px" class="aside">
      <div class="logo">云容器监控</div>
      <el-menu :router="true" :default-active="$route.path" background-color="#001529"
        text-color="#ffffffa6" active-text-color="#fff">
        <el-menu-item index="/admin/dashboard">
          <el-icon><DataBoard /></el-icon>仪表盘
        </el-menu-item>
        <el-menu-item index="/admin/platforms">
          <el-icon><Connection /></el-icon>平台管理
        </el-menu-item>
        <el-menu-item index="/admin/containers">
          <el-icon><Box /></el-icon>容器列表
        </el-menu-item>
        <el-menu-item index="/admin/alerts">
          <el-icon><Bell /></el-icon>告警中心
        </el-menu-item>
        <el-menu-item index="/admin/watch">
          <el-icon><Timer /></el-icon>定时监测
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <span />
        <el-dropdown @command="handleCommand">
          <span class="user-info">{{ auth.username }} <el-icon><ArrowDown /></el-icon></span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="settings">账号设置</el-dropdown-item>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <el-main>
        <router-view />
      </el-main>
    </el-container>

    <!-- 账号设置弹窗 -->
    <el-dialog v-model="settingsVisible" title="账号设置" width="500px">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="修改用户名" name="username">
          <el-form :model="usernameForm" label-width="100px">
            <el-form-item label="新用户名">
              <el-input v-model="usernameForm.newUsername" placeholder="请输入新用户名" />
            </el-form-item>
            <el-form-item label="确认密码">
              <el-input v-model="usernameForm.password" type="password" placeholder="请输入当前密码" />
            </el-form-item>
          </el-form>
          <div style="text-align: right;">
            <el-button @click="settingsVisible = false">取消</el-button>
            <el-button type="primary" @click="handleChangeUsername" :loading="loading">确定</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane label="修改密码" name="password">
          <el-form :model="passwordForm" label-width="100px">
            <el-form-item label="旧密码">
              <el-input v-model="passwordForm.oldPassword" type="password" placeholder="请输入旧密码" />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="passwordForm.newPassword" type="password" placeholder="请输入新密码(至少6位)" />
            </el-form-item>
            <el-form-item label="确认密码">
              <el-input v-model="passwordForm.confirmPassword" type="password" placeholder="请再次输入新密码" />
            </el-form-item>
          </el-form>
          <div style="text-align: right;">
            <el-button @click="settingsVisible = false">取消</el-button>
            <el-button type="primary" @click="handleChangePassword" :loading="loading">确定</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api'
import { DataBoard, Connection, Box, Bell, ArrowDown, Timer } from '@element-plus/icons-vue'

const router = useRouter()
const auth = useAuthStore()

const settingsVisible = ref(false)
const activeTab = ref('username')
const loading = ref(false)

const usernameForm = ref({ newUsername: '', password: '' })
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

function handleCommand(cmd) {
  if (cmd === 'logout') {
    auth.logout()
    router.push('/login')
  } else if (cmd === 'settings') {
    usernameForm.value = { newUsername: '', password: '' }
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    activeTab.value = 'username'
    settingsVisible.value = true
  }
}

async function handleChangeUsername() {
  const { newUsername, password } = usernameForm.value
  if (!newUsername || !password) {
    ElMessage.warning('请填写新用户名和密码')
    return
  }
  loading.value = true
  try {
    const res = await authApi.changeUsername({ newUsername, password })
    auth.setUsername(res.username)
    ElMessage.success('用户名修改成功')
    settingsVisible.value = false
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '修改失败')
  } finally {
    loading.value = false
  }
}

async function handleChangePassword() {
  const { oldPassword, newPassword, confirmPassword } = passwordForm.value
  if (!oldPassword || !newPassword || !confirmPassword) {
    ElMessage.warning('请填写所有密码字段')
    return
  }
  if (newPassword !== confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  loading.value = true
  try {
    await authApi.changePassword({ oldPassword, newPassword })
    ElMessage.success('密码修改成功，请重新登录')
    settingsVisible.value = false
    auth.logout()
    router.push('/login')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '修改失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.layout { min-height: 100vh; }
.aside { background: #001529; }
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  border-bottom: 1px solid #002140;
}
.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
}
.user-info { cursor: pointer; display: flex; align-items: center; gap: 4px; }
</style>
