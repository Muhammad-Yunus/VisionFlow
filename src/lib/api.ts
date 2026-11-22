import type { WorkflowDefinition } from '../shared/workflowSchema';
import type {
  AuthUser,
  DagRunResult,
  ModelSummary,
  StreamSummary,
  WorkflowSummary,
} from '../types/visionflow';

let memoryAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (memoryAuthToken) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(text || `Request failed (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(
      typeof json.error === 'string'
        ? json.error
        : `Request failed with status ${res.status}`
    );
  }
  return json as T;
}

export const api = {
  getBootstrapStatus: () =>
    apiFetch<{ needsSetup: boolean; databaseStatus: string }>(
      '/api/auth/bootstrap-status'
    ),

  register: (payload: { email: string; name: string; password: string }) =>
    apiFetch<{ token: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => apiFetch<{ user: AuthUser }>('/api/auth/me'),

  listModels: () => apiFetch<{ models: ModelSummary[] }>('/api/models'),

  uploadModel: (file: File, customName?: string) => {
    const fd = new FormData();
    fd.append('model', file);
    if (customName) fd.append('name', customName);
    return apiFetch<{ model: ModelSummary }>('/api/models/upload', {
      method: 'POST',
      body: fd,
    });
  },

  deleteModel: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/models/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  listWorkflows: () =>
    apiFetch<{ workflows: WorkflowSummary[] }>('/api/workflows'),

  createWorkflow: (payload: {
    name: string;
    description?: string;
    definition: WorkflowDefinition;
  }) =>
    apiFetch<{ workflow: WorkflowSummary }>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWorkflow: (
    id: string,
    payload: {
      name?: string;
      description?: string;
      status?: 'draft' | 'deployed';
      definition?: WorkflowDefinition;
    }
  ) =>
    apiFetch<{ workflow: WorkflowSummary }>(
      `/api/workflows/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  deployWorkflow: (id: string) =>
    apiFetch<{ workflow: WorkflowSummary; endpoint: string }>(
      `/api/workflows/${encodeURIComponent(id)}/deploy`,
      { method: 'POST' }
    ),

  runWorkflow: (payload: {
    workflowId?: string;
    definition: WorkflowDefinition;
    file?: File;
    imageBase64?: string;
    imageUrl?: string;
    sampleId?: string;
    sourceType?: string;
    enableSinks?: boolean;
    showAllBlockOutputs?: boolean;
  }) => {
    if (payload.file) {
      const fd = new FormData();
      fd.append('file', payload.file);
      fd.append('definition', JSON.stringify(payload.definition));
      if (payload.workflowId) fd.append('workflowId', payload.workflowId);
      fd.append('sourceType', payload.sourceType ?? 'file');
      fd.append('enableSinks', String(Boolean(payload.enableSinks)));
      fd.append(
        'showAllBlockOutputs',
        String(Boolean(payload.showAllBlockOutputs))
      );
      return apiFetch<DagRunResult>('/api/workflows/run', {
        method: 'POST',
        body: fd,
      });
    }
    return apiFetch<DagRunResult>('/api/workflows/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listStreams: () => apiFetch<{ streams: StreamSummary[] }>('/api/streams'),

  createStream: (payload: {
    workflowId: string;
    name: string;
    rtspUrl: string;
    sourceType: 'rtsp' | 'network' | 'file_loop';
    sinkType: 'mjpeg' | 'webhook' | 'mqtt' | 'modbus';
    sinkConfig?: Record<string, unknown>;
    fpsTarget?: number;
  }) =>
    apiFetch<{ stream: StreamSummary }>('/api/streams', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  startStream: (id: string) =>
    apiFetch<{ stream: StreamSummary }>(
      `/api/streams/${encodeURIComponent(id)}/start`,
      { method: 'POST' }
    ),

  stopStream: (id: string) =>
    apiFetch<{ stream: StreamSummary }>(
      `/api/streams/${encodeURIComponent(id)}/stop`,
      { method: 'POST' }
    ),

  deleteStream: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/streams/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getStreamLatest: (id: string) =>
    apiFetch<{
      stream: StreamSummary;
      latestFrameBase64: string | null;
      latestMeta: Record<string, unknown> | null;
    }>(`/api/streams/${encodeURIComponent(id)}/latest`),
};
