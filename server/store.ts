import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../src/db/index.ts';
import {
  users,
  models,
  workflows,
  streams,
  inferenceRuns,
} from '../src/db/schema.ts';
import {
  COCO_80_CLASSES,
  createDefaultWorkflowDefinition,
  type WorkflowDefinition,
} from '../src/shared/workflowSchema.ts';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
}

export interface ModelRecord {
  id: string;
  userId: string | null;
  name: string;
  filename: string;
  storagePath: string;
  format: 'onnx' | 'pt';
  task: 'detect' | 'segment' | 'pose';
  classNames: string[];
  inputShape: number[];
  fileSizeBytes: number;
  createdAt: Date;
  isBuiltin?: boolean;
}

export interface WorkflowRecord {
  id: string;
  userId: string | null;
  name: string;
  description: string;
  status: 'draft' | 'deployed';
  definition: WorkflowDefinition;
  apiKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StreamRecord {
  id: string;
  userId: string | null;
  workflowId: string;
  name: string;
  rtspUrl: string;
  sourceType: string;
  sinkType: string;
  sinkConfig: Record<string, unknown>;
  status: 'stopped' | 'running' | 'error';
  fpsTarget: number;
  framesProcessed: number;
  lastFrameAt: Date | null;
  lastResult: Record<string, unknown> | null;
  createdAt: Date;
}

export interface InferenceRunRecord {
  id: string;
  workflowId: string | null;
  userId: string | null;
  sourceType: string;
  durationMs: number;
  detectionCount: number;
  resultSummary: Record<string, unknown>;
  createdAt: Date;
}

export const BUILTIN_MODELS: ModelRecord[] = [
  {
    id: 'builtin-yolov8n-detect',
    userId: null,
    name: 'yolov8n.onnx',
    filename: 'yolov8n.onnx',
    storagePath: 'builtin://yolov8n.onnx',
    format: 'onnx',
    task: 'detect',
    classNames: COCO_80_CLASSES,
    inputShape: [1, 3, 640, 640],
    fileSizeBytes: 12_845_056,
    createdAt: new Date('2026-01-15T00:00:00Z'),
    isBuiltin: true,
  },
  {
    id: 'builtin-yolov8s-seg',
    userId: null,
    name: 'yolov8s-seg.onnx',
    filename: 'yolov8s-seg.onnx',
    storagePath: 'builtin://yolov8s-seg.onnx',
    format: 'onnx',
    task: 'segment',
    classNames: COCO_80_CLASSES,
    inputShape: [1, 3, 640, 640],
    fileSizeBytes: 47_290_112,
    createdAt: new Date('2026-01-15T00:00:00Z'),
    isBuiltin: true,
  },
  {
    id: 'builtin-yolov8n-pose',
    userId: null,
    name: 'yolov8n-pose.onnx',
    filename: 'yolov8n-pose.onnx',
    storagePath: 'builtin://yolov8n-pose.onnx',
    format: 'onnx',
    task: 'pose',
    classNames: ['person'],
    inputShape: [1, 3, 640, 640],
    fileSizeBytes: 13_412_800,
    createdAt: new Date('2026-01-15T00:00:00Z'),
    isBuiltin: true,
  },
];

// In-memory store used when DATABASE_URL is not yet configured in Secrets
const memUsers: UserRecord[] = [];
const memModels: ModelRecord[] = [];
const memWorkflows: WorkflowRecord[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    userId: null,
    name: 'Detect, Count, and Visualize',
    description:
      'Default VisionFlow pipeline detecting objects with YOLO, drawing bounding boxes & labels, and returning counts.',
    status: 'draft',
    definition: createDefaultWorkflowDefinition(),
    apiKey: 'vf_demo_' + crypto.randomBytes(12).toString('hex'),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
const memStreams: StreamRecord[] = [];
const memRuns: InferenceRunRecord[] = [];

export const store = {
  async countUsers(): Promise<number> {
    const db = getDb();
    if (!db) return memUsers.length;
    const rows = await db.select({ id: users.id }).from(users);
    return rows.length;
  },

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    const db = getDb();
    if (!db) {
      return memUsers.find((u) => u.email === normalized) ?? null;
    }
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    return row ?? null;
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    const db = getDb();
    if (!db) {
      return memUsers.find((u) => u.id === id) ?? null;
    }
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  },

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: string;
  }): Promise<UserRecord> {
    const normalized = input.email.trim().toLowerCase();
    const db = getDb();
    if (!db) {
      const record: UserRecord = {
        id: crypto.randomUUID(),
        email: normalized,
        name: input.name.trim(),
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: new Date(),
      };
      memUsers.push(record);
      return record;
    }
    const [row] = await db
      .insert(users)
      .values({
        email: normalized,
        name: input.name.trim(),
        passwordHash: input.passwordHash,
        role: input.role,
      })
      .returning();
    return row;
  },

  async listModels(userId?: string): Promise<ModelRecord[]> {
    const db = getDb();
    let customModels: ModelRecord[] = [];
    if (!db) {
      customModels = memModels.filter(
        (m) => !userId || !m.userId || m.userId === userId
      );
    } else {
      const rows = await db.select().from(models).orderBy(desc(models.createdAt));
      customModels = rows
        .filter((r) => !userId || !r.userId || r.userId === userId)
        .map((r) => ({
          id: r.id,
          userId: r.userId,
          name: r.name,
          filename: r.filename,
          storagePath: r.storagePath,
          format: r.format as 'onnx' | 'pt',
          task: r.task as 'detect' | 'segment' | 'pose',
          classNames: r.classNames,
          inputShape: r.inputShape,
          fileSizeBytes: r.fileSizeBytes,
          createdAt: r.createdAt,
        }));
    }
    return [...customModels, ...BUILTIN_MODELS];
  },

  async getModelById(id: string): Promise<ModelRecord | null> {
    const builtin = BUILTIN_MODELS.find((m) => m.id === id);
    if (builtin) return builtin;

    const db = getDb();
    if (!db) {
      return memModels.find((m) => m.id === id) ?? null;
    }
    const [row] = await db
      .select()
      .from(models)
      .where(eq(models.id, id))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      filename: row.filename,
      storagePath: row.storagePath,
      format: row.format as 'onnx' | 'pt',
      task: row.task as 'detect' | 'segment' | 'pose',
      classNames: row.classNames,
      inputShape: row.inputShape,
      fileSizeBytes: row.fileSizeBytes,
      createdAt: row.createdAt,
    };
  },

  async createModel(input: {
    userId: string;
    name: string;
    filename: string;
    storagePath: string;
    format: 'onnx' | 'pt';
    task: 'detect' | 'segment' | 'pose';
    classNames: string[];
    inputShape: number[];
    fileSizeBytes: number;
  }): Promise<ModelRecord> {
    const db = getDb();
    if (!db) {
      const rec: ModelRecord = {
        id: crypto.randomUUID(),
        ...input,
        createdAt: new Date(),
      };
      memModels.unshift(rec);
      return rec;
    }
    const [row] = await db.insert(models).values(input).returning();
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      filename: row.filename,
      storagePath: row.storagePath,
      format: row.format as 'onnx' | 'pt',
      task: row.task as 'detect' | 'segment' | 'pose',
      classNames: row.classNames,
      inputShape: row.inputShape,
      fileSizeBytes: row.fileSizeBytes,
      createdAt: row.createdAt,
    };
  },

  async deleteModel(id: string, userId: string): Promise<ModelRecord | null> {
    const db = getDb();
    if (!db) {
      const idx = memModels.findIndex((m) => m.id === id && m.userId === userId);
      if (idx === -1) return null;
      const [removed] = memModels.splice(idx, 1);
      return removed;
    }
    const [row] = await db.select().from(models).where(eq(models.id, id)).limit(1);
    if (!row || row.userId !== userId) return null;
    await db.delete(models).where(eq(models.id, id));
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      filename: row.filename,
      storagePath: row.storagePath,
      format: row.format as 'onnx' | 'pt',
      task: row.task as 'detect' | 'segment' | 'pose',
      classNames: row.classNames,
      inputShape: row.inputShape,
      fileSizeBytes: row.fileSizeBytes,
      createdAt: row.createdAt,
    };
  },

  async listWorkflows(userId?: string): Promise<WorkflowRecord[]> {
    const db = getDb();
    if (!db) {
      return memWorkflows.filter(
        (w) => !userId || !w.userId || w.userId === userId
      );
    }
    const rows = await db
      .select()
      .from(workflows)
      .orderBy(desc(workflows.updatedAt));
    const filtered = rows
      .filter((r) => !userId || !r.userId || r.userId === userId)
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        description: r.description,
        status: r.status as 'draft' | 'deployed',
        definition: r.definition,
        apiKey: r.apiKey,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    if (filtered.length === 0) {
      return memWorkflows;
    }
    return filtered;
  },

  async getWorkflowById(id: string): Promise<WorkflowRecord | null> {
    const memMatch = memWorkflows.find((w) => w.id === id);
    const db = getDb();
    if (!db) return memMatch ?? null;
    // Validate UUID shape before querying pg UUID column
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return memMatch ?? null;
    }
    const [row] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1);
    if (!row) return memMatch ?? null;
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      status: row.status as 'draft' | 'deployed',
      definition: row.definition,
      apiKey: row.apiKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async createWorkflow(input: {
    userId: string;
    name: string;
    description?: string;
    definition: WorkflowDefinition;
    status?: 'draft' | 'deployed';
  }): Promise<WorkflowRecord> {
    const apiKey = 'vf_' + crypto.randomBytes(18).toString('hex');
    const db = getDb();
    if (!db) {
      const rec: WorkflowRecord = {
        id: crypto.randomUUID(),
        userId: input.userId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        status: input.status ?? 'draft',
        definition: input.definition,
        apiKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memWorkflows.unshift(rec);
      return rec;
    }
    const [row] = await db
      .insert(workflows)
      .values({
        userId: input.userId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        status: input.status ?? 'draft',
        definition: input.definition,
        apiKey,
      })
      .returning();
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      status: row.status as 'draft' | 'deployed',
      definition: row.definition,
      apiKey: row.apiKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async updateWorkflow(
    id: string,
    userId: string,
    patch: {
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
      status?: 'draft' | 'deployed';
    }
  ): Promise<WorkflowRecord | null> {
    const db = getDb();
    if (!db) {
      const idx = memWorkflows.findIndex((w) => w.id === id);
      if (idx === -1) return null;
      const existing = memWorkflows[idx];
      if (existing.userId && existing.userId !== userId) return null;
      const updated: WorkflowRecord = {
        ...existing,
        userId: existing.userId ?? userId,
        name: patch.name ?? existing.name,
        description: patch.description ?? existing.description,
        definition: patch.definition ?? existing.definition,
        status: patch.status ?? existing.status,
        updatedAt: new Date(),
      };
      memWorkflows[idx] = updated;
      return updated;
    }

    const existing = await this.getWorkflowById(id);
    if (!existing) return null;
    if (existing.userId && existing.userId !== userId) return null;

    // If updating the seeded demo template for first time into DB, insert a DB copy owned by user
    if (id === '00000000-0000-4000-8000-000000000001' && !existing.userId) {
      const [inserted] = await db
        .insert(workflows)
        .values({
          id,
          userId,
          name: patch.name ?? existing.name,
          description: patch.description ?? existing.description,
          status: patch.status ?? existing.status,
          definition: patch.definition ?? existing.definition,
          apiKey: existing.apiKey,
        })
        .onConflictDoUpdate({
          target: workflows.id,
          set: {
            name: patch.name ?? existing.name,
            description: patch.description ?? existing.description,
            status: patch.status ?? existing.status,
            definition: patch.definition ?? existing.definition,
            updatedAt: new Date(),
          },
        })
        .returning();
      return {
        id: inserted.id,
        userId: inserted.userId,
        name: inserted.name,
        description: inserted.description,
        status: inserted.status as 'draft' | 'deployed',
        definition: inserted.definition,
        apiKey: inserted.apiKey,
        createdAt: inserted.createdAt,
        updatedAt: inserted.updatedAt,
      };
    }

    const [row] = await db
      .update(workflows)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.definition !== undefined ? { definition: patch.definition } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, id))
      .returning();

    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      status: row.status as 'draft' | 'deployed',
      definition: row.definition,
      apiKey: row.apiKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async listStreams(userId?: string): Promise<StreamRecord[]> {
    const db = getDb();
    if (!db) {
      return memStreams.filter((s) => !userId || !s.userId || s.userId === userId);
    }
    const rows = await db
      .select()
      .from(streams)
      .orderBy(desc(streams.createdAt));
    return rows
      .filter((r) => !userId || !r.userId || r.userId === userId)
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        workflowId: r.workflowId,
        name: r.name,
        rtspUrl: r.rtspUrl,
        sourceType: r.sourceType,
        sinkType: r.sinkType,
        sinkConfig: r.sinkConfig,
        status: r.status as 'stopped' | 'running' | 'error',
        fpsTarget: r.fpsTarget,
        framesProcessed: r.framesProcessed,
        lastFrameAt: r.lastFrameAt,
        lastResult: r.lastResult,
        createdAt: r.createdAt,
      }));
  },

  async getStreamById(id: string): Promise<StreamRecord | null> {
    const db = getDb();
    if (!db) {
      return memStreams.find((s) => s.id === id) ?? null;
    }
    const [row] = await db
      .select()
      .from(streams)
      .where(eq(streams.id, id))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      workflowId: row.workflowId,
      name: row.name,
      rtspUrl: row.rtspUrl,
      sourceType: row.sourceType,
      sinkType: row.sinkType,
      sinkConfig: row.sinkConfig,
      status: row.status as 'stopped' | 'running' | 'error',
      fpsTarget: row.fpsTarget,
      framesProcessed: row.framesProcessed,
      lastFrameAt: row.lastFrameAt,
      lastResult: row.lastResult,
      createdAt: row.createdAt,
    };
  },

  async createStream(input: {
    userId: string;
    workflowId: string;
    name: string;
    rtspUrl: string;
    sourceType: string;
    sinkType: string;
    sinkConfig: Record<string, unknown>;
    fpsTarget: number;
  }): Promise<StreamRecord> {
    const db = getDb();
    if (!db) {
      const rec: StreamRecord = {
        id: crypto.randomUUID(),
        ...input,
        status: 'stopped',
        framesProcessed: 0,
        lastFrameAt: null,
        lastResult: null,
        createdAt: new Date(),
      };
      memStreams.unshift(rec);
      return rec;
    }
    const [row] = await db.insert(streams).values(input).returning();
    return {
      id: row.id,
      userId: row.userId,
      workflowId: row.workflowId,
      name: row.name,
      rtspUrl: row.rtspUrl,
      sourceType: row.sourceType,
      sinkType: row.sinkType,
      sinkConfig: row.sinkConfig,
      status: row.status as 'stopped' | 'running' | 'error',
      fpsTarget: row.fpsTarget,
      framesProcessed: row.framesProcessed,
      lastFrameAt: row.lastFrameAt,
      lastResult: row.lastResult,
      createdAt: row.createdAt,
    };
  },

  async updateStreamStatus(
    id: string,
    patch: {
      status?: 'stopped' | 'running' | 'error';
      framesProcessed?: number;
      lastFrameAt?: Date;
      lastResult?: Record<string, unknown>;
    }
  ): Promise<void> {
    const db = getDb();
    if (!db) {
      const item = memStreams.find((s) => s.id === id);
      if (item) {
        if (patch.status !== undefined) item.status = patch.status;
        if (patch.framesProcessed !== undefined)
          item.framesProcessed = patch.framesProcessed;
        if (patch.lastFrameAt !== undefined) item.lastFrameAt = patch.lastFrameAt;
        if (patch.lastResult !== undefined) item.lastResult = patch.lastResult;
      }
      return;
    }
    await db
      .update(streams)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.framesProcessed !== undefined
          ? { framesProcessed: patch.framesProcessed }
          : {}),
        ...(patch.lastFrameAt !== undefined
          ? { lastFrameAt: patch.lastFrameAt }
          : {}),
        ...(patch.lastResult !== undefined
          ? { lastResult: patch.lastResult }
          : {}),
      })
      .where(eq(streams.id, id));
  },

  async deleteStream(id: string, userId: string): Promise<boolean> {
    const db = getDb();
    if (!db) {
      const idx = memStreams.findIndex((s) => s.id === id && s.userId === userId);
      if (idx === -1) return false;
      memStreams.splice(idx, 1);
      return true;
    }
    const [row] = await db
      .select()
      .from(streams)
      .where(eq(streams.id, id))
      .limit(1);
    if (!row || row.userId !== userId) return false;
    await db.delete(streams).where(eq(streams.id, id));
    return true;
  },

  async recordInferenceRun(input: {
    workflowId: string | null;
    userId: string | null;
    sourceType: string;
    durationMs: number;
    detectionCount: number;
    resultSummary: Record<string, unknown>;
  }): Promise<InferenceRunRecord> {
    const db = getDb();
    if (!db) {
      const rec: InferenceRunRecord = {
        id: crypto.randomUUID(),
        ...input,
        createdAt: new Date(),
      };
      memRuns.unshift(rec);
      if (memRuns.length > 100) memRuns.pop();
      return rec;
    }
    // Check if workflowId exists in DB before foreign key insert
    let validWorkflowId = input.workflowId;
    if (validWorkflowId) {
      const [wfRow] = await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.id, validWorkflowId))
        .limit(1);
      if (!wfRow) validWorkflowId = null;
    }
    const [row] = await db
      .insert(inferenceRuns)
      .values({
        ...input,
        workflowId: validWorkflowId,
      })
      .returning();
    return row;
  },

  async listInferenceRuns(workflowId?: string): Promise<InferenceRunRecord[]> {
    const db = getDb();
    if (!db) {
      return memRuns
        .filter((r) => !workflowId || r.workflowId === workflowId)
        .slice(0, 30);
    }
    const rows = await db
      .select()
      .from(inferenceRuns)
      .orderBy(desc(inferenceRuns.createdAt))
      .limit(30);
    return rows.filter((r) => !workflowId || r.workflowId === workflowId);
  },
};
