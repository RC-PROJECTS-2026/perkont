import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import toast from 'react-hot-toast';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data: { email: string; password: string; deviceId?: string }) =>
    apiClient.post('/auth/login', data),
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me'),
  refreshToken: (refreshToken: string) => apiClient.post('/auth/refresh', { refreshToken }),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiClient.patch('/auth/change-password', data),
  forgotPassword: (email: string) => apiClient.post('/auth/forgot-password', { email }),
  resetPassword: (data: { token: string; newPassword: string }) =>
    apiClient.post('/auth/reset-password', data),
  setupMfa: () => apiClient.get('/auth/mfa/setup'),
  confirmMfa: (data: { secret: string; token: string }) => apiClient.post('/auth/mfa/confirm', data),
  verifyMfa: (tempToken: string, code: string) =>
    apiClient.post('/auth/mfa/verify', { tempToken, code }),
  disableMfa: () => apiClient.post('/auth/mfa/disable'),
};

// ─── Customers ───────────────────────────────────────────────────────────────
export const customersApi = {
  list: (params?: Record<string, any>) => apiClient.get('/customers', { params }),
  get: (id: string) => apiClient.get(`/customers/${id}`),
  create: (data: any) => apiClient.post('/customers', data),
  update: (id: string, data: any) => apiClient.put(`/customers/${id}`, data),
  deactivate: (id: string) => apiClient.patch(`/customers/${id}/deactivate`),
  getLocations: (id: string) => apiClient.get(`/customers/${id}/locations`),
  createLocation: (id: string, data: any) => apiClient.post(`/customers/${id}/locations`, data),
  updateLocation: (locationId: string, data: any) => apiClient.put(`/customers/locations/${locationId}`, data),
  getStats: (id: string) => apiClient.get(`/customers/${id}/stats`),
};

// ─── Equipment ────────────────────────────────────────────────────────────────
export const equipmentApi = {
  listTypes: () => apiClient.get('/equipment/types'),
  createType: (data: any) => apiClient.post('/equipment/types', data),
  list: (params?: Record<string, any>) => apiClient.get('/equipment', { params }),
  get: (id: string) => apiClient.get(`/equipment/${id}`),
  create: (data: any) => apiClient.post('/equipment', data),
  update: (id: string, data: any) => apiClient.put(`/equipment/${id}`, data),
  getDueControls: (days?: number) => apiClient.get('/equipment/due-controls', { params: { days } }),
  getOverdue: () => apiClient.get('/equipment/overdue'),
  getByQr: (qrCode: string) => apiClient.get(`/equipment/by-qr/${qrCode}`),
  getQrLabel: (id: string) => apiClient.get(`/equipment/${id}/qr-label`, { responseType: 'blob' }),
};

// ─── Work Orders ──────────────────────────────────────────────────────────────
export const workOrdersApi = {
  list: (params?: Record<string, any>) => apiClient.get('/work-orders', { params }),
  get: (id: string) => apiClient.get(`/work-orders/${id}`),
  create: (data: any) => apiClient.post('/work-orders', data),
  assign: (id: string, data: any) => apiClient.patch(`/work-orders/${id}/assign`, data),
  updateStatus: (id: string, status: string) => apiClient.patch(`/work-orders/${id}/status`, { status }),
  getMyOrders: () => apiClient.get('/work-orders/my'),
  getReadyForInvoice: () => apiClient.get('/work-orders/ready-for-invoice'),
};

// ─── Inspections ──────────────────────────────────────────────────────────────
export const inspectionsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/inspections', { params }),
  get: (id: string) => apiClient.get(`/inspections/${id}`),
  start: (data: any) => apiClient.post('/inspections', data),
  saveFieldValues: (id: string, data: any) => apiClient.post(`/inspections/${id}/field-values`, data),
  uploadPhoto: (id: string, formData: FormData) =>
    apiClient.post(`/inspections/${id}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  uploadFile: (id: string, formData: FormData) =>
    apiClient.post(`/inspections/${id}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  addNonconformity: (id: string, data: any) => apiClient.post(`/inspections/${id}/nonconformities`, data),
  complete: (id: string, data: any) => apiClient.patch(`/inspections/${id}/complete`, data),
  submit: (id: string) => apiClient.patch(`/inspections/${id}/submit`),
  review: (id: string, action: string, note: string) =>
    apiClient.patch(`/inspections/${id}/review`, { action, note }),
  syncOffline: (payload: any) => apiClient.post('/inspections/sync/offline', payload),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/reports', { params }),
  get: (id: string) => apiClient.get(`/reports/${id}`),
  createFromInspection: (inspectionId: string) =>
    apiClient.post(`/reports/from-inspection/${inspectionId}`),
  getPdf: (id: string, signed?: boolean) =>
    apiClient.get(`/reports/${id}/pdf`, {
      params: { signed: signed ? 'true' : undefined },
      responseType: 'blob',
    }),
  approve: (id: string, comment: string) => apiClient.patch(`/reports/${id}/approve`, { comment }),
  requestRevision: (id: string, comment: string) =>
    apiClient.patch(`/reports/${id}/request-revision`, { comment }),
  initiateSign: (id: string, phone: string) => apiClient.post(`/reports/${id}/sign/initiate`, { phone }),
  completeSigning: (id: string, data: any) => apiClient.post(`/reports/${id}/sign/complete`, data),
  deliver: (id: string) => apiClient.post(`/reports/${id}/deliver`),
  verify: (reportNumber: string) => apiClient.get(`/reports/verify/${reportNumber}`),
};

// ─── Form Templates ───────────────────────────────────────────────────────────
export const formTemplatesApi = {
  list: (equipmentTypeId?: string) =>
    apiClient.get('/form-templates', { params: { equipmentTypeId } }),
  get: (id: string) => apiClient.get(`/form-templates/${id}`),
  create: (data: any) => apiClient.post('/form-templates', data),
  getActive: (equipmentTypeId: string) =>
    apiClient.get(`/form-templates/active/${equipmentTypeId}`),
  activate: (id: string) => apiClient.patch(`/form-templates/${id}/activate`),
  createRevision: (id: string, revision: string) =>
    apiClient.post(`/form-templates/${id}/revise`, { revision }),
  uploadTemplate: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post(`/form-templates/${id}/upload-template`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  updateField: (templateId: string, fieldId: string, data: any) =>
    apiClient.put(`/form-templates/${templateId}/fields/${fieldId}`, data),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  getMain: () => apiClient.get('/dashboard'),
  getExtended: () => apiClient.get('/dashboard/extended'),
  getInspector: () => apiClient.get('/dashboard/inspector'),
  getTechnicalManager: () => apiClient.get('/dashboard/technical-manager'),
  getFinance: () => apiClient.get('/dashboard/finance'),
  getEquipmentTimeline: (days?: number) =>
    apiClient.get('/dashboard/equipment-timeline', { params: { days } }),
  getMonthlyStats: (months?: number) =>
    apiClient.get('/dashboard/monthly-stats', { params: { months } }),
};

// ─── LOGO ─────────────────────────────────────────────────────────────────────
export const logoApi = {
  getQueue: (params?: Record<string, any>) => apiClient.get('/logo/queue', { params }),
  getStats: () => apiClient.get('/logo/queue/stats'),
  retryItem: (id: string) => apiClient.post(`/logo/queue/${id}/retry`),
  retryAllFailed: () => apiClient.post('/logo/queue/retry-all-failed'),
  syncCustomer: (customerId: string) => apiClient.post(`/logo/customers/${customerId}/sync`),
  mapCustomer: (customerId: string, logoCariId: string) =>
    apiClient.patch(`/logo/customers/${customerId}/map`, { logoCariId }),
  createInvoice: (data: any) => apiClient.post('/logo/invoices', data),
};

// ─── Payments ────────────────────────────────────────────────────────────────
export const paymentsApi = {
  initiateCheckout: (data: any) => apiClient.post('/payments/checkout', data),
  handleCallback: (token: string) => apiClient.post('/payments/callback', { token }),
  recordManual: (data: any) => apiClient.post('/payments/manual', data),
  refund: (id: string, refundAmount: number) => apiClient.post(`/payments/${id}/refund`, { refundAmount }),
  getInstallments: (binNumber: string, price: number) =>
    apiClient.get('/payments/installments', { params: { binNumber, price } }),
  list: (params?: Record<string, any>) => apiClient.get('/payments', { params }),
  getStats: () => apiClient.get('/payments/stats'),
  get: (id: string) => apiClient.get(`/payments/${id}`),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: (params?: Record<string, any>) => apiClient.get('/users', { params }),
  get: (id: string) => apiClient.get(`/users/${id}`),
  create: (data: any) => apiClient.post('/users', data),
  update: (id: string, data: any) => apiClient.put(`/users/${id}`, data),
  getQualifications: (id: string) => apiClient.get(`/users/${id}/qualifications`),
  addQualification: (id: string, data: any) => apiClient.post(`/users/${id}/qualifications`, data),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  getMyNotifications: () => apiClient.get('/notifications'),
  getUnreadCount: () => apiClient.get('/notifications/unread-count'),
  markAsRead: (id: string) => apiClient.patch(`/notifications/${id}/read`),
  markAllAsRead: () => apiClient.patch('/notifications/read-all'),
};

// ─── Audit ────────────────────────────────────────────────────────────────────
export const auditApi = {
  list: (params?: Record<string, any>) => apiClient.get('/audit', { params }),
  getEntityHistory: (type: string, id: string) => apiClient.get(`/audit/entity/${type}/${id}`),
};

// ─── Contracts ────────────────────────────────────────────────────────────────
export const contractsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/contracts', { params }),
  get: (id: string) => apiClient.get(`/contracts/${id}`),
  create: (data: any) => apiClient.post('/contracts', data),
  update: (id: string, data: any) => apiClient.put(`/contracts/${id}`, data),
  upload: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post(`/contracts/${id}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  sign: (id: string, party: 'customer' | 'company') =>
    apiClient.patch(`/contracts/${id}/sign/${party}`),
  getExpiring: (days?: number) => apiClient.get('/contracts/expiring', { params: { days } }),
};

// ─── Quotations ───────────────────────────────────────────────────────────────
export const quotationsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/quotations', { params }),
  get: (id: string) => apiClient.get(`/quotations/${id}`),
  create: (data: any) => apiClient.post('/quotations', data),
  update: (id: string, data: any) => apiClient.put(`/quotations/${id}`, data),
  send: (id: string) => apiClient.patch(`/quotations/${id}/send`),
  accept: (id: string) => apiClient.patch(`/quotations/${id}/accept`),
  reject: (id: string, reason: string) =>
    apiClient.patch(`/quotations/${id}/reject`, { reason }),
  getPdf: (id: string) =>
    apiClient.get(`/quotations/${id}/pdf`, { responseType: 'blob' }),
};

// ─── Calibration ──────────────────────────────────────────────────────────────
export const calibrationApi = {
  list: (params?: Record<string, any>) => apiClient.get('/calibration', { params }),
  get: (id: string) => apiClient.get(`/calibration/${id}`),
  create: (data: any) => apiClient.post('/calibration', data),
  update: (id: string, data: any) => apiClient.put(`/calibration/${id}`, data),
  getExpiring: (days?: number) => apiClient.get('/calibration/expiring', { params: { days } }),
  uploadCertificate: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post(`/calibration/${id}/certificate`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ─── CAPA ─────────────────────────────────────────────────────────────────────
export const capaApi = {
  list: (params?: Record<string, any>) => apiClient.get('/capa', { params }),
  get: (id: string) => apiClient.get(`/capa/${id}`),
  create: (data: any) => apiClient.post('/capa', data),
  update: (id: string, data: any) => apiClient.put(`/capa/${id}`, data),
  close: (id: string, data: any) => apiClient.patch(`/capa/${id}/close`, data),
  getStats: () => apiClient.get('/capa/stats'),
};

// ─── Complaints ───────────────────────────────────────────────────────────────
export const complaintsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/complaints', { params }),
  get: (id: string) => apiClient.get(`/complaints/${id}`),
  create: (data: any) => apiClient.post('/complaints', data),
  update: (id: string, data: any) => apiClient.put(`/complaints/${id}`, data),
  resolve: (id: string, data: any) => apiClient.patch(`/complaints/${id}/resolve`, data),
  close: (id: string) => apiClient.patch(`/complaints/${id}/close`),
  getStats: () => apiClient.get('/complaints/stats'),
};

// ─── Internal Audit ───────────────────────────────────────────────────────────
export const internalAuditApi = {
  listPlans: (params?: Record<string, any>) => apiClient.get('/internal-audit/plans', { params }),
  getPlan: (id: string) => apiClient.get(`/internal-audit/plans/${id}`),
  createPlan: (data: any) => apiClient.post('/internal-audit/plans', data),
  updatePlan: (id: string, data: any) => apiClient.put(`/internal-audit/plans/${id}`, data),
  addFinding: (planId: string, data: any) =>
    apiClient.post(`/internal-audit/plans/${planId}/findings`, data),
  getOpenFindings: () => apiClient.get('/internal-audit/findings/open'),
  closeFinding: (id: string) => apiClient.patch(`/internal-audit/findings/${id}/close`),
};

// ─── Personnel ────────────────────────────────────────────────────────────────
export const personnelApi = {
  createReview: (data: any) => apiClient.post('/personnel/management-reviews', data),
  listReviews: (params?: Record<string, any>) =>
    apiClient.get('/personnel/management-reviews', { params }),
  getReview: (id: string) => apiClient.get(`/personnel/management-reviews/${id}`),
  updateReview: (id: string, data: any) =>
    apiClient.put(`/personnel/management-reviews/${id}`, data),
  getUserDocuments: (userId: string) => apiClient.get(`/personnel/documents/${userId}`),
};

// ─── Accreditation ────────────────────────────────────────────────────────────
export const accreditationApi = {
  listScopes: () => apiClient.get('/accreditation/scopes'),
  createScope: (data: any) => apiClient.post('/accreditation/scopes', data),
  listDeclarations: (userId?: string) =>
    apiClient.get('/accreditation/declarations', { params: { userId } }),
  createDeclaration: (data: any) => apiClient.post('/accreditation/declarations', data),
  getCurrentDeclaration: (userId: string) =>
    apiClient.get(`/accreditation/declarations/${userId}/current`),
  listReferenceDocs: () => apiClient.get('/accreditation/reference-docs'),
  createReferenceDoc: (data: any) => apiClient.post('/accreditation/reference-docs', data),
};

// ─── Risk ─────────────────────────────────────────────────────────────────────
export const riskApi = {
  list: (params?: Record<string, any>) => apiClient.get('/risk', { params }),
  get: (id: string) => apiClient.get(`/risk/${id}`),
  create: (data: any) => apiClient.post('/risk', data),
  update: (id: string, data: any) => apiClient.put(`/risk/${id}`, data),
  getHeatmap: () => apiClient.get('/risk/heatmap'),
  getStats: () => apiClient.get('/risk/stats'),
};

// ─── SLA ──────────────────────────────────────────────────────────────────────
export const slaApi = {
  listDefinitions: () => apiClient.get('/sla/definitions'),
  createDefinition: (data: any) => apiClient.post('/sla/definitions', data),
  getDashboard: () => apiClient.get('/sla/dashboard'),
  getBreaches: () => apiClient.get('/sla/breaches'),
};

// ─── Subcontractors ───────────────────────────────────────────────────────────
export const subcontractorsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/subcontractors', { params }),
  get: (id: string) => apiClient.get(`/subcontractors/${id}`),
  create: (data: any) => apiClient.post('/subcontractors', data),
  update: (id: string, data: any) => apiClient.put(`/subcontractors/${id}`, data),
  createAssignment: (data: any) => apiClient.post('/subcontractors/assignments', data),
  completeAssignment: (id: string, data: any) =>
    apiClient.patch(`/subcontractors/assignments/${id}/complete`, data),
  getExpiringContracts: () => apiClient.get('/subcontractors/expiring-contracts'),
};

// ─── Reference Documents ──────────────────────────────────────────────────────
export const referenceDocsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/reference-docs', { params }),
  get: (id: string) => apiClient.get(`/reference-docs/${id}`),
  create: (data: any) => apiClient.post('/reference-docs', data),
  update: (id: string, data: any) => apiClient.put(`/reference-docs/${id}`, data),
  getDueForReview: () => apiClient.get('/reference-docs/due-for-review'),
};

// ─── Storage Quota ────────────────────────────────────────────────────────────
export const storageQuotaApi = {
  getSummary: () => apiClient.get('/storage-quota/summary'),
  getHistory: (params?: Record<string, any>) =>
    apiClient.get('/storage-quota/history', { params }),
  getLargestFiles: () => apiClient.get('/storage-quota/largest'),
};

// ─── Device Management ───────────────────────────────────────────────────────
export const deviceManagementApi = {
  listDevices: (params?: Record<string, any>) => apiClient.get('/device-management/devices', { params }),
  getStats: () => apiClient.get('/device-management/stats'),
  blockDevice: (id: string, reason: string) =>
    apiClient.patch(`/device-management/devices/${id}/block`, { reason }),
  getLogs: (deviceId: string) => apiClient.get(`/device-management/logs/${deviceId}`),
};

// ─── Company ──────────────────────────────────────────────────────────────────
export const companyApi = {
  list: () => apiClient.get('/companies'),
  get: (id: string) => apiClient.get(`/companies/${id}`),
  update: (id: string, data: any) => apiClient.put(`/companies/${id}`, data),
  updateSettings: (id: string, settings: any) =>
    apiClient.patch(`/companies/${id}/settings`, { settings }),
  updateAccreditationScope: (id: string, scope: any) =>
    apiClient.patch(`/companies/${id}/accreditation-scope`, { accreditationScope: scope }),
};

// ─── Reporting / BI ───────────────────────────────────────────────────────────
export const reportingApi = {
  getMetric: (metricName: string, params?: Record<string, any>) =>
    apiClient.get('/reporting/metrics', { params: { metric: metricName, ...params } }),
  getKpi: () => apiClient.get('/reporting/kpi'),
  exportCsv: (metricName: string, params?: Record<string, any>) =>
    apiClient.get('/reporting/export/csv', {
      params: { metric: metricName, ...params },
      responseType: 'blob',
    }),
  getAvailableMetrics: () => apiClient.get('/reporting/available-metrics'),
};

// ─── Portal ───────────────────────────────────────────────────────────────────
export const portalApi = {
  getDashboard: () => apiClient.get('/portal/dashboard'),
  getEquipment: (params?: Record<string, any>) =>
    apiClient.get('/portal/equipment', { params }),
  getReports: (params?: Record<string, any>) =>
    apiClient.get('/portal/reports', { params }),
  getContracts: () => apiClient.get('/portal/contracts'),
  getContract: (id: string) => apiClient.get(`/portal/contracts/${id}`),
  acceptContract: (id: string) => apiClient.post(`/portal/contracts/${id}/accept`),
  rejectContract: (id: string, reason: string) =>
    apiClient.post(`/portal/contracts/${id}/reject`, { reason }),
};

// ─── Pricing ──────────────────────────────────────────────────────────────────
export const pricingApi = {
  list: (params?: Record<string, any>) => apiClient.get('/pricing', { params }),
  get: (id: string) => apiClient.get(`/pricing/${id}`),
  create: (data: any) => apiClient.post('/pricing', data),
  update: (id: string, data: any) => apiClient.put(`/pricing/${id}`, data),
  getForEquipmentType: (equipmentTypeId: string) =>
    apiClient.get(`/pricing/equipment-type/${equipmentTypeId}`),
  getForCustomer: (customerId: string, equipmentTypeId: string) =>
    apiClient.get(`/pricing/customer/${customerId}/equipment-type/${equipmentTypeId}`),
};

// ─── Invoice Preparation ─────────────────────────────────────────────────────
export const invoicePrepApi = {
  getReady: (params?: Record<string, any>) =>
    apiClient.get('/invoice-preparation/ready', { params }),
  getStats: () => apiClient.get('/invoice-preparation/stats'),
  prepare: (workOrderId: string, data: any) =>
    apiClient.post(`/invoice-preparation/${workOrderId}/prepare`, data),
  getBatch: (params?: Record<string, any>) =>
    apiClient.get('/invoice-preparation/batch', { params }),
  createBatch: (data: any) => apiClient.post('/invoice-preparation/batch', data),
  cancelBatch: (id: string, reason: string) =>
    apiClient.patch(`/invoice-preparation/batch/${id}/cancel`, { reason }),
  refundBatch: (id: string, refundAmount: number) =>
    apiClient.post(`/invoice-preparation/batch/${id}/refund`, { refundAmount }),
  reInvoice: (id: string, data: any) =>
    apiClient.post(`/invoice-preparation/batch/${id}/re-invoice`, data),
  recordPayment: (id: string, amount: number) =>
    apiClient.patch(`/invoice-preparation/batch/${id}/payment`, { amount }),
  getPaymentSummary: () => apiClient.get('/invoice-preparation/payment-summary'),
};

// ─── Proposals (Teklif Form Motoru) ─────────────────────────────────────
export const proposalsApi = {
  list: (params?: Record<string, any>) => apiClient.get('/proposals', { params }),
  get: (id: string) => apiClient.get(`/proposals/${id}`),
  create: (data: any) => apiClient.post('/proposals', data),
  update: (id: string, data: any) => apiClient.put(`/proposals/${id}`, data),
  addItem: (id: string, data: any) => apiClient.post(`/proposals/${id}/items`, data),
  removeItem: (id: string, itemId: string) => apiClient.delete(`/proposals/${id}/items/${itemId}`),
  createRevision: (id: string) => apiClient.post(`/proposals/${id}/revision`),
  send: (id: string) => apiClient.patch(`/proposals/${id}/send`),
  accept: (id: string) => apiClient.patch(`/proposals/${id}/accept`),
  reject: (id: string, reason: string) => apiClient.patch(`/proposals/${id}/reject`, { reason }),
  getPdf: (id: string) => apiClient.get(`/proposals/${id}/pdf`, { responseType: 'blob' }),
  getStatusLog: (id: string) => apiClient.get(`/proposals/${id}/status-log`),
  // Templates
  listTemplates: () => apiClient.get('/proposals/templates'),
  createTemplate: (data: any) => apiClient.post('/proposals/templates', data),
  activateTemplate: (id: string) => apiClient.patch(`/proposals/templates/${id}/activate`),
};

// ─── Contract Engine (Sözleşme Form Motoru) ──────────────────────────────
export const contractEngineApi = {
  list: (params?: Record<string, any>) => apiClient.get('/contract-engine', { params }),
  get: (id: string) => apiClient.get(`/contract-engine/${id}`),
  create: (data: any) => apiClient.post('/contract-engine', data),
  createFromProposal: (proposalId: string, data: any) => apiClient.post(`/contract-engine/from-proposal/${proposalId}`, data),
  update: (id: string, data: any) => apiClient.put(`/contract-engine/${id}`, data),
  getPdf: (id: string) => apiClient.get(`/contract-engine/${id}/pdf`, { responseType: 'blob' }),
  send: (id: string) => apiClient.patch(`/contract-engine/${id}/send`),
  uploadSigned: (id: string, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return apiClient.post(`/contract-engine/${id}/upload-signed`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  sign: (id: string) => apiClient.patch(`/contract-engine/${id}/sign`),
  activate: (id: string) => apiClient.patch(`/contract-engine/${id}/activate`),
  getFiles: (id: string) => apiClient.get(`/contract-engine/${id}/files`),
  getStatusLog: (id: string) => apiClient.get(`/contract-engine/${id}/status-log`),
};

// ─── Sales Pipeline ──────────────────────────────────────────────────────────
export const salesPipelineApi = {
  list: (params?: Record<string, any>) => apiClient.get('/sales-pipeline', { params }),
  get: (id: string) => apiClient.get(`/sales-pipeline/${id}`),
  create: (data: any) => apiClient.post('/sales-pipeline', data),
  update: (id: string, data: any) => apiClient.put(`/sales-pipeline/${id}`, data),
  addActivity: (id: string, data: any) => apiClient.post(`/sales-pipeline/${id}/activities`, data),
  getActivities: (id: string) => apiClient.get(`/sales-pipeline/${id}/activities`),
  markWon: (id: string, proposalId?: string) => apiClient.patch(`/sales-pipeline/${id}/won`, { proposalId }),
  markLost: (id: string, reason: string) => apiClient.patch(`/sales-pipeline/${id}/lost`, { reason }),
  getStats: () => apiClient.get('/sales-pipeline/stats'),
  getFollowUps: () => apiClient.get('/sales-pipeline/follow-ups'),
};

// ─── React Query hooks ────────────────────────────────────────────────────────
export function useCustomers(params?: Record<string, any>) {
  return useQuery({ queryKey: ['customers', params], queryFn: () => customersApi.list(params) });
}
export function useCustomer(id: string) {
  return useQuery({ queryKey: ['customer', id], queryFn: () => customersApi.get(id), enabled: !!id });
}
export function useEquipmentTypes() {
  return useQuery({ queryKey: ['equipment-types'], queryFn: equipmentApi.listTypes });
}
export function useEquipment(params?: Record<string, any>) {
  return useQuery({ queryKey: ['equipment', params], queryFn: () => equipmentApi.list(params) });
}
export function useWorkOrders(params?: Record<string, any>) {
  return useQuery({ queryKey: ['work-orders', params], queryFn: () => workOrdersApi.list(params) });
}
export function useInspections(params?: Record<string, any>) {
  return useQuery({ queryKey: ['inspections', params], queryFn: () => inspectionsApi.list(params) });
}
export function useReports(params?: Record<string, any>) {
  return useQuery({ queryKey: ['reports', params], queryFn: () => reportsApi.list(params) });
}
export function useReport(id: string) {
  return useQuery({ queryKey: ['report', id], queryFn: () => reportsApi.get(id), enabled: !!id });
}
export function useMainDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.getMain, refetchInterval: 60000 });
}
export function useLogoQueue(params?: Record<string, any>) {
  return useQuery({ queryKey: ['logo-queue', params], queryFn: () => logoApi.getQueue(params), refetchInterval: 30000 });
}
export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: notificationsApi.getMyNotifications, refetchInterval: 30000 });
}
export function useUnreadCount() {
  return useQuery({ queryKey: ['unread-count'], queryFn: notificationsApi.getUnreadCount, refetchInterval: 15000 });
}

// ─── Mutation helpers ─────────────────────────────────────────────────────────
export function useMutationWithToast<T>(
  fn: (data: T) => Promise<any>,
  options?: {
    onSuccess?: (data: any) => void;
    invalidateKeys?: string[][];
    successMessage?: string;
  },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (options?.successMessage) toast.success(options.successMessage);
      options?.invalidateKeys?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      options?.onSuccess?.(data);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Bir hata oluştu');
    },
  });
}
