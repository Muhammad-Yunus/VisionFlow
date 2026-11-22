import type { WorkflowDefinition } from '../shared/workflowSchema';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface ModelSummary {
  id: string;
  name: string;
  filename: string;
  format: 'onnx' | 'pt';
  task: 'detect' | 'segment' | 'pose';
  classNames: string[];
  inputShape: number[];
  fileSizeBytes: number;
  createdAt: string;
  extractionSource?: string;
}

export interface InferenceRunSummary {
  id: string;
  workflowId: string | null;
  sourceType: string;
  durationMs: number;
  detectionCount: number;
  resultSummary: Record<string, unknown>;
  createdAt: string;
}

export interface ApiCallLogSummary {
  id: string;
  workflowId: string | null;
  userId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  authMethod: string;
  clientIp: string;
  requestMeta: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowSummary {
  id: string;
  userId: string | null;
  name: string;
  description: string;
  status: 'draft' | 'deployed';
  isLocked?: boolean;
  definition: WorkflowDefinition;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface StreamSummary {
  id: string;
  workflowId: string;
  name: string;
  rtspUrl: string;
  sourceType: string;
  sinkType: string;
  sinkConfig: Record<string, unknown>;
  status: 'stopped' | 'running' | 'error';
  fpsTarget: number;
  framesProcessed: number;
  lastFrameAt: string | null;
  lastResult: Record<string, unknown> | null;
}

export interface DagRunResult {
  inference_id: string;
  duration_ms: number;
  execution_order: string[];
  outputs: Record<string, unknown>;
  step_outputs?: Record<string, Record<string, unknown>>;
  annotated_image_base64: string | null;
  detection_count: number;
  trace: Array<{
    nodeId: string;
    nodeName: string;
    kind: string;
    durationMs: number;
    skipped?: boolean;
    outputs: Record<string, unknown>;
  }>;
}

export type RightPanelTab = 'file' | 'webcam' | 'stream';
