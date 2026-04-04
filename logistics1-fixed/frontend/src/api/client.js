// src/api/client.js
import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — attach access token ─────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (err) => Promise.reject(err)
)

// ── Response interceptor — handle 401, show errors ────────
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)))
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }
      original._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) {
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(err)
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', { refreshToken })
        const { accessToken, refreshToken: newRefresh } = data.data
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', newRefresh)
        api.defaults.headers.Authorization = `Bearer ${accessToken}`
        processQueue(null, accessToken)
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    // Surface error message
    const message = err.response?.data?.message || 'An error occurred'
    if (err.response?.status !== 401) toast.error(message)
    return Promise.reject(err)
  }
)

export default api

// ── Typed API helpers ──────────────────────────────────────

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.patch('/auth/profile', data),
  changePassword: (data) => api.patch('/auth/change-password', data),
  getUsers: (params) => api.get('/auth/users', { params }),
  updateUser: (id, data) => api.patch(`/auth/users/${id}`, data),
  register: (data) => api.post('/auth/register', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
}

export const procurementAPI = {
  getStats: () => api.get('/procurement/stats'),
  getSuppliers: (p) => api.get('/procurement/suppliers', { params: p }),
  getSupplier: (id) => api.get(`/procurement/suppliers/${id}`),
  createSupplier: (d) => api.post('/procurement/suppliers', d),
  updateSupplier: (id, d) => api.patch(`/procurement/suppliers/${id}`, d),
  deleteSupplier: (id) => api.delete(`/procurement/suppliers/${id}`),
  getRFQs: (p) => api.get('/procurement/rfqs', { params: p }),
  getRFQ: (id) => api.get(`/procurement/rfqs/${id}`),
  createRFQ: (d) => api.post('/procurement/rfqs', d),
  submitRFQ: (id) => api.post(`/procurement/rfqs/${id}/submit`),
  approveRFQ: (id, d) => api.post(`/procurement/rfqs/${id}/approve`, d),
  rejectRFQ: (id, d) => api.post(`/procurement/rfqs/${id}/reject`, d),
  getQuoteComparison: (rfqId) => api.get(`/procurement/rfqs/${rfqId}/compare`),
  getPOs: (p) => api.get('/procurement/purchase-orders', { params: p }),
  getPO: (id) => api.get(`/procurement/purchase-orders/${id}`),
  createPO: (d) => api.post('/procurement/purchase-orders', d),
  submitPO: (id) => api.post(`/procurement/purchase-orders/${id}/submit`),
  approvePO: (id, d) => api.post(`/procurement/purchase-orders/${id}/approve`, d),
  rejectPO: (id, d) => api.post(`/procurement/purchase-orders/${id}/reject`, d),
  receivePO: (id, d) => api.post(`/procurement/purchase-orders/${id}/receive`, d),
  getReceivings: (id) => api.get(`/procurement/purchase-orders/${id}/receivings`),
}

export const inventoryAPI = {
  getStats: () => api.get('/inventory/stats'),
  getValuation: () => api.get('/inventory/valuation'),
  getItems: (p) => api.get('/inventory', { params: p }),
  getItem: (id) => api.get(`/inventory/${id}`),
  createItem: (d) => api.post('/inventory', d),
  updateItem: (id, d) => api.patch(`/inventory/${id}`, d),
  getBatches: (p) => api.get('/inventory/batches/all', { params: p }),
  getBatch: (id) => api.get(`/inventory/batches/${id}`),
  getMovements: (p) => api.get('/inventory/movements/all', { params: p }),
  adjustStock: (d) => api.post('/inventory/adjust', d),
  issueStock: (d) => api.post('/inventory/issue', d),
  transferStock: (d) => api.post('/inventory/transfer', d),
  getLowStock: () => api.get('/inventory/low-stock'),
  getExpiring: (days) => api.get('/inventory/expiring', { params: { days } }),
}

export const assetsAPI = {
  getStats: () => api.get('/assets/stats'),
  getMaintenanceReport: () => api.get('/assets/maintenance-report'),
  getAssets: (p) => api.get('/assets', { params: p }),
  getAsset: (id) => api.get(`/assets/${id}`),
  createAsset: (d) => api.post('/assets', d),
  updateAsset: (id, d) => api.patch(`/assets/${id}`, d),
  changeStatus: (id, d) => api.post(`/assets/${id}/status`, d),
  convertBatch: (d) => api.post('/assets/convert', d),
  getLogs: (id) => api.get(`/assets/${id}/logs`),
  addLog: (id, d) => api.post(`/assets/${id}/logs`, d),
  getSchedules: (p) => api.get('/assets/schedules/all', { params: p }),
  createSchedule: (d) => api.post('/assets/schedules', d),
  updateSchedule: (id, d) => api.patch(`/assets/schedules/${id}`, d),
  advanceSchedule: (id, d) => api.post(`/assets/schedules/${id}/advance`, d),
}

export const mroAPI = {
  getStats: () => api.get('/mro/stats'),
  getWorkOrders: (p) => api.get('/mro', { params: p }),
  getWorkOrder: (id) => api.get(`/mro/${id}`),
  createWorkOrder: (d) => api.post('/mro', d),
  updateWorkOrder: (id, d) => api.patch(`/mro/${id}`, d),
  openWO: (id) => api.post(`/mro/${id}/open`),
  startWO: (id) => api.post(`/mro/${id}/start`),
  holdWO: (id, d) => api.post(`/mro/${id}/hold`, d),
  completeWO: (id, d) => api.post(`/mro/${id}/complete`, d),
  cancelWO: (id, d) => api.post(`/mro/${id}/cancel`, d),
  getLogs: (id) => api.get(`/mro/${id}/logs`),
  addLog: (id, d) => api.post(`/mro/${id}/logs`, d),
  getParts: (id) => api.get(`/mro/${id}/parts`),
  addPart: (id, d) => api.post(`/mro/${id}/parts`, d),
  removePart: (id, partId) => api.delete(`/mro/${id}/parts/${partId}`),
}

export const projectsAPI = {
  getStats: () => api.get('/projects/stats'),
  getProjects: (p) => api.get('/projects', { params: p }),
  getProject: (id) => api.get(`/projects/${id}`),
  createProject: (d) => api.post('/projects', d),
  updateProject: (id, d) => api.patch(`/projects/${id}`, d),
  getTasks: (id, p) => api.get(`/projects/${id}/tasks`, { params: p }),
  createTask: (id, d) => api.post(`/projects/${id}/tasks`, d),
  updateTask: (id, tid, d) => api.patch(`/projects/${id}/tasks/${tid}`, d),
  getRisks: (id) => api.get(`/projects/${id}/risks`),
  createRisk: (id, d) => api.post(`/projects/${id}/risks`, d),
  getMaterials: (id) => api.get(`/projects/${id}/materials`),
  consumeMaterial: (id, d) => api.post(`/projects/${id}/materials`, d),
  getBudgetReport: (id) => api.get(`/projects/${id}/budget-report`),
  getCommunications: (id) => api.get(`/projects/${id}/communications`),
  createCommunication: (id, d) => api.post(`/projects/${id}/communications`, d),
}

export const notificationsAPI = {
  getAll: (p) => api.get('/notifications', { params: p }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/mark-all-read'),
  clearRead: () => api.post('/notifications/clear-read'),
  runScan: () => api.post('/notifications/scan'),
}

export const reportsAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getInventory: (p) => api.get('/reports/inventory', { params: p }),
  getSupplierPerformance: (p) => api.get('/reports/supplier-performance', { params: p }),
  getAssetMaintenance: (p) => api.get('/reports/asset-maintenance', { params: p }),
  getProjectMaterials: (p) => api.get('/reports/project-materials', { params: p }),
  getAudit: (p) => api.get('/reports/audit', { params: p }),
  exportCSV: async (type, params = {}) => {
    const token = localStorage.getItem('accessToken')
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString()
    const url = `/api/reports/export/${type}${query ? `?${query}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') || ''
    const filename = cd.match(/filename="?([^"]+)"?/)?.[1] || `${type}_export.csv`
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
  },
}

export const validationAPI = {
  runFull: () => api.get('/validation/run'),
  runModule: (module) => api.get(`/validation/run/${module}`),
}
