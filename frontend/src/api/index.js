import http from './http'

export const authApi = {
  login: (data) => http.post('/auth/login', data),
  register: (data) => http.post('/auth/register', data),
  profile: () => http.get('/auth/profile'),
  changePassword: (data) => http.post('/auth/change-password', data)
}

export const platformApi = {
  list: () => http.get('/platforms'),
  add: (data) => http.post('/platforms', data),
  update: (id, data) => http.put(`/platforms/${id}`, data),
  remove: (id) => http.delete(`/platforms/${id}`),
  test: (id) => http.get(`/platforms/${id}/test`),
  getApiKey: (id) => http.get(`/platforms/${id}/apikey`)
}

export const containerApi = {
  list: () => http.get('/containers'),
  detail: (id) => http.get(`/containers/${id}`),
  refresh: () => http.post('/containers/refresh'),
  start: (id) => http.post(`/containers/${id}/start`),
  restart: (id) => http.post(`/containers/${id}/restart`),
  stop: (id) => http.post(`/containers/${id}/stop`),
  remove: (id) => http.delete(`/containers/${id}`),
  logs: (id, params) => http.get(`/containers/${id}/logs`, { params }),
  batch: (data) => http.post('/containers/batch', data)
}

export const alertApi = {
  list: (params) => http.get('/alerts', { params }),
  listConfigs: () => http.get('/alerts/configs'),
  addConfig: (data) => http.post('/alerts/configs', data),
  updateConfig: (id, data) => http.put(`/alerts/configs/${id}`, data),
  removeConfig: (id) => http.delete(`/alerts/configs/${id}`)
}

export const watchApi = {
  list: () => http.get('/watch'),
  add: (data) => http.post('/watch', data),
  update: (id, data) => http.put(`/watch/${id}`, data),
  remove: (id) => http.delete(`/watch/${id}`),
  updateContainers: (id, data) => http.put(`/watch/${id}/containers`, data),
  logs: (id, params) => http.get(`/watch/${id}/logs`, { params })
}
