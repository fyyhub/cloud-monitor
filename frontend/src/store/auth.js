import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const username = ref(localStorage.getItem('username') || '')
  const mustChangePassword = ref(false)

  async function login(credentials) {
    const res = await authApi.login(credentials)
    token.value = res.token
    username.value = res.username
    mustChangePassword.value = res.mustChangePassword
    localStorage.setItem('token', res.token)
    localStorage.setItem('username', res.username)
  }

  function logout() {
    token.value = ''
    username.value = ''
    mustChangePassword.value = false
    localStorage.removeItem('token')
    localStorage.removeItem('username')
  }

  return { token, username, mustChangePassword, login, logout }
})
