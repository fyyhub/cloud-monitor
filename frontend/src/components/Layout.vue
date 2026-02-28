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
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth'
import { DataBoard, Connection, Box, Bell, ArrowDown, Timer } from '@element-plus/icons-vue'

const router = useRouter()
const auth = useAuthStore()

function handleCommand(cmd) {
  if (cmd === 'logout') {
    auth.logout()
    router.push('/login')
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
