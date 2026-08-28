import axios from 'axios';
import { getApiUrl } from '../config';

const API_BASE_URL = getApiUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Response error handler (401 auto logout trigger)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Auth cookie is missing/expired. Clear any cached user info.
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API Service Functions

export const DashboardService = {
  getStats: async (params?: { schoolId?: string }) => {
    const res = await api.get('/api/dashboard', { params });
    return res.data.data;
  },
};

export const StaffService = {
  getModules: async (params?: { schoolId?: string }) => {
    const res = await api.get('/api/staff/modules', { params });
    return res.data.data;
  },
  getModuleDetail: async (moduleName: string, params?: { schoolId?: string }) => {
    const res = await api.get(`/api/staff/${moduleName}`, { params });
    return res.data.data;
  },
  createEntry: async (moduleName: string, payload: any) => {
    const res = await api.post(`/api/staff/${moduleName}/entry`, payload);
    return res.data.data;
  },
  updateEntry: async (moduleName: string, entryId: string, payload: any) => {
    const res = await api.patch(`/api/staff/${moduleName}/entry/${entryId}`, payload);
    return res.data.data;
  },
  deleteEntry: async (moduleName: string, entryId: string) => {
    const res = await api.delete(`/api/staff/${moduleName}/entry/${entryId}`);
    return res.data;
  },
};

export const SourcesService = {
  getAll: async (params?: { module?: string; schoolId?: string }) => {
    const res = await api.get('/api/sources', { params });
    return res.data.data;
  },
  create: async (data: any) => {
    const res = await api.post('/api/sources', data);
    return res.data.data;
  },
  connect: async (id: string, connectionConfig: any) => {
    const res = await api.put(`/api/sources/${id}/connect`, { connectionConfig });
    return res.data.data;
  },
  startGmailAuth: async (id: string) => {
    const res = await api.post(`/api/sources/${id}/gmail/connect`);
    return res.data.data;
  },
  startMicrosoftAuth: async (id: string) => {
    const res = await api.post(`/api/sources/${id}/microsoft/connect`);
    return res.data.data;
  },
  testConnection: async (payload: {
    type: 'GOOGLE_DRIVE' | 'GOOGLE_SHEETS' | 'ONEDRIVE' | 'SHAREPOINT';
    externalUrl: string;
    connectionConfig?: Record<string, any>;
  }) => {
    const res = await api.post('/api/sources/test-connection', payload);
    return res.data.data;
  },
  updateStatus: async (id: string, status: string) => {
    const res = await api.patch(`/api/sources/${id}/status`, { status });
    return res.data.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/api/sources/${id}`);
    return res.data;
  },
};

export const ImportService = {
  getBatches: async (params?: { datasetType?: string; sourceId?: string; status?: string; schoolId?: string; limit?: number }) => {
    const res = await api.get('/api/imports/batches', { params });
    return res.data.data;
  },
  getBatch: async (id: string) => {
    const res = await api.get(`/api/imports/batches/${id}`);
    return res.data.data;
  },
  previewSource: async (sourceId: string, payload: { datasetType: string; mapping?: Record<string, string> }) => {
    const res = await api.post(`/api/imports/sources/${sourceId}/preview`, payload);
    return res.data.data;
  },
  importSource: async (sourceId: string, payload: { datasetType: string; mapping?: Record<string, string> }) => {
    const res = await api.post(`/api/imports/sources/${sourceId}/import`, payload);
    return res.data.data;
  },
  previewExcelUpload: async (file: File, datasetType: string, mapping?: Record<string, string>) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('datasetType', datasetType);
    if (mapping && Object.keys(mapping).length > 0) {
      formData.append('mapping', JSON.stringify(mapping));
    }

    const res = await api.post('/api/imports/excel-upload/preview', formData);
    return res.data.data;
  },
  importExcelUpload: async (payload: {
    uploadId: string;
    datasetType: string;
    sourceName: string;
    module: string;
    schoolId?: string;
    mapping?: Record<string, string>;
    externalUrl?: string;
  }) => {
    const res = await api.post('/api/imports/excel-upload/import', payload);
    return res.data.data;
  },
  rollbackBatch: async (batchId: string) => {
    const res = await api.post(`/api/imports/batches/${batchId}/rollback`);
    return res.data.data;
  },
};

export const DocumentsService = {
  getAll: async (params?: { module?: string; schoolId?: string }) => {
    const res = await api.get('/api/documents', { params });
    return res.data.data;
  },
  create: async (data: any) => {
    const res = await api.post('/api/documents', data);
    return res.data.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/api/documents/${id}`);
    return res.data;
  },
  saveAnalysis: async (id: string, analysis: any) => {
    const res = await api.post(`/api/documents/${id}/analysis`, { analysis });
    return res.data.data;
  },
};

export const AIService = {
  analyze: async (payload: {
    documentType: string;
    module: string;
    summaryType: string;
    text: string;
    documentName?: string;
  }) => {
    const res = await api.post('/api/ai/analyze', payload);
    return res.data.data;
  },
  generateReport: async (payload: {
    title?: string;
    scope: string;
    period: string;
    modules: string[];
    schoolId?: string;
    contextData?: string;
  }) => {
    const res = await api.post('/api/ai/report', payload);
    return res.data.data;
  },
  getConfig: async () => {
    const res = await api.get('/api/ai/config');
    return res.data.data;
  },
  testConnection: async (overrides?: any) => {
    const res = await api.post('/api/ai/test', overrides);
    return res.data.data;
  },
};

export const ReportsService = {
  getAll: async (params?: { schoolId?: string; scope?: string; period?: string; page?: number; limit?: number }) => {
    const res = await api.get('/api/reports', { params });
    return res.data;
  },
  getOne: async (id: string) => {
    const res = await api.get(`/api/reports/${id}`);
    return res.data.data;
  },
  generate: async (payload: any) => {
    const res = await api.post('/api/reports/generate', payload);
    return res.data.data;
  },
};

export const AlertsService = {
  getAll: async (params?: { status?: string; priority?: string; type?: string; schoolId?: string }) => {
    const res = await api.get('/api/alerts', { params });
    return res.data.data;
  },
  create: async (data: any) => {
    const res = await api.post('/api/alerts', data);
    return res.data.data;
  },
  resolve: async (id: string) => {
    const res = await api.patch(`/api/alerts/${id}/resolve`);
    return res.data.data;
  },
  updateStatus: async (id: string, status: string) => {
    const res = await api.patch(`/api/alerts/${id}/status`, { status });
    return res.data.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/api/alerts/${id}`);
    return res.data;
  },
};

export const ConfigService = {
  getAll: async () => {
    const res = await api.get('/api/config');
    return res.data.data;
  },
  updateKey: async (key: string, value: string) => {
    const res = await api.put(`/api/config/${key}`, { value });
    return res.data.data;
  },
  bulkUpdate: async (updates: Array<{ key: string; value: string }>) => {
    const res = await api.post('/api/config/bulk', { updates });
    return res.data.data;
  },
};

export const SchoolsService = {
  getAll: async () => {
    const res = await api.get('/api/schools');
    return res.data.data;
  },
  create: async (payload: { name: string; code: string }) => {
    const res = await api.post('/api/schools', payload);
    return res.data.data;
  },
  bulkCreate: async (schools: Array<{ name: string; code: string }>) => {
    const res = await api.post('/api/schools/bulk', { schools });
    return res.data.data;
  },
  update: async (id: string, payload: { name: string; code: string }) => {
    const res = await api.put(`/api/schools/${id}`, payload);
    return res.data.data;
  },
  updateStatus: async (id: string, isActive: boolean) => {
    const res = await api.patch(`/api/schools/${id}/status`, { isActive });
    return res.data.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/api/schools/${id}`);
    return res.data.data;
  },
};

export const AgentService = {
  chat: async (message: string, history?: Array<{ role: string; content: string }>, schoolId?: string) => {
    const res = await api.post('/api/agent/chat', { message, history, schoolId });
    return res.data.data;
  },
  getHistory: async (params?: { schoolId?: string }) => {
    const res = await api.get('/api/agent/history', { params });
    return res.data.data;
  },
  // Pass schoolId to scope the deletion to a specific school.
  // If absent, the backend performs a cross-school purge (all messages for the user).
  clearHistory: async (params?: { schoolId?: string }) => {
    const res = await api.delete('/api/agent/history', { params });
    return res.data;
  },
  getTodaySummary: async (params?: { schoolId?: string }) => {
    const res = await api.get('/api/agent/summary-today', { params });
    return res.data.data;
  },
  refreshSummary: async (params?: { schoolId?: string }) => {
    const res = await api.post('/api/agent/summary-today/refresh', params);
    return res.data.data;
  },
};

// ---- New services for Complaints, Tasks, Meetings ----

export const ComplaintsService = {
  getAll: async (params?: { schoolId?: string; status?: string; priority?: string }) => {
    const res = await api.get('/api/complaints', { params });
    return res.data.data;
  },
  create: async (data: any) => {
    const res = await api.post('/api/complaints', data);
    return res.data.data;
  },
  update: async (id: string, data: any) => {
    const res = await api.patch(`/api/complaints/${id}`, data);
    return res.data.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/api/complaints/${id}`);
    return res.data;
  },
};

export const TasksService = {
  getAll: async (params?: { schoolId?: string; status?: string; priority?: string }) => {
    const res = await api.get('/api/tasks', { params });
    return res.data.data;
  },
  create: async (data: any) => {
    const res = await api.post('/api/tasks', data);
    return res.data.data;
  },
  update: async (id: string, data: any) => {
    const res = await api.patch(`/api/tasks/${id}`, data);
    return res.data.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/api/tasks/${id}`);
    return res.data;
  },
};

export const MeetingsService = {
  getAll: async (params?: { date?: string; status?: string; upcoming?: string; schoolId?: string }) => {
    const res = await api.get('/api/meetings', { params });
    return res.data.data;
  },
  getToday: async (params?: { schoolId?: string }) => {
    const res = await api.get('/api/meetings/today', { params });
    return res.data.data;
  },
  create: async (data: any) => {
    const res = await api.post('/api/meetings', data);
    return res.data.data;
  },
  update: async (id: string, data: any) => {
    const res = await api.patch(`/api/meetings/${id}`, data);
    return res.data.data;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/api/meetings/${id}`);
    return res.data;
  },
};

// Audit log service — supervisor-only, no write methods exposed
export const AuditService = {
  getAll: async () => {
    const res = await api.get('/api/audit');
    return res.data.data;
  },
};
