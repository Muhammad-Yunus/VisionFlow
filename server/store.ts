import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../src/db/index.ts';
import {
  users,
  models,
  workflows,
  streams,
  inferenceRuns,
  apiCallLogs,
} from '../src/db/schema.ts';
import {
  createDefaultWorkflowDefinition,
  type WorkflowDefinition,
} from '../src/shared/workflowSchema.ts';
import { inspectModelFile } from './modelInspector.ts';

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
}

export interface WorkflowRecord {
  id: string;
  userId: string | null;
  name: string;
  description: string;
  status: 'draft' | 'deployed';
  isLocked: boolean;
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

export interface ApiCallLogRecord {
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
  createdAt: Date;
}

function requireDb() {
  const db = getDb();
  if (!db) {
    throw new Error(
      'PostgreSQL database is not connected. Set DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in Settings -> Secrets.'
    );
  }
  return db;
}

/**
 * Ensures the real local yolov8n.onnx model file on disk and the default
 * "Detect, Count, and Visualize" workflow exist as real rows in PostgreSQL.
 */
export async function seedDatabaseDefaults(): Promise<void> {
  const db = getDb();
  if (!db) return;

  const existingModels = await db.select().from(models);
  let defaultModel = existingModels.find((m) => m.filename === 'yolov8n.onnx');

  if (!defaultModel) {
    const onnxPath = path.resolve(
      process.cwd(),
      'uploads',
      'models',
      'yolov8n.onnx'
    );
    try {
      const stat = await fs.stat(onnxPath);
      const inspected = await inspectModelFile(onnxPath, 'onnx');
      const [inserted] = await db
        .insert(models)
        .values({
          userId: null,
          name: 'yolov8n.onnx',
          filename: 'yolov8n.onnx',
          storagePath: onnxPath,
          format: inspected.format,
          task: inspected.task,
          classNames: inspected.classNames,
          inputShape: inspected.inputShape,
          fileSizeBytes: stat.size,
        })
        .returning();
      defaultModel = inserted;
    } catch (err) {
      console.warn(
        '[VisionFlow Seed] uploads/models/yolov8n.onnx not found on disk:',
        err instanceof Error ? err.message : err
      );
    }
  }

  const existingWorkflows = await db.select().from(workflows);
  if (existingWorkflows.length === 0) {
    const def = createDefaultWorkflowDefinition();
    if (defaultModel) {
      def.nodes = def.nodes.map((n) =>
        n.kind === 'yolo_detection'
          ? {
              ...n,
              subtitle: defaultModel!.name,
              params: {
                ...n.params,
                modelId: defaultModel!.id,
                modelName: defaultModel!.name,
              },
            }
          : n
      );
    }
    await db.insert(workflows).values({
      userId: null,
      name: 'Detect, Count, and Visualize',
      description:
        'Default VisionFlow DAG pipeline detecting objects with local YOLOv8n ONNX, drawing boxes & labels, and returning counts.',
      status: 'draft',
      definition: def,
      apiKey: 'vf_' + crypto.randomBytes(18).toString('hex'),
    });
  }
}

export const store = {
  async countUsers(): Promise<number> {
    const db = getDb();
    if (!db) return 0;
    const rows = await db.select({ id: users.id }).from(users);
    return rows.length;
  },

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const db = requireDb();
    const normalized = email.trim().toLowerCase();
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    return row ?? null;
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    const db = requireDb();
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  },

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: string;
  }): Promise<UserRecord> {
    const db = requireDb();
    const normalized = input.email.trim().toLowerCase();
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
    const db = requireDb();
    const rows = await db.select().from(models).orderBy(desc(models.createdAt));
    return rows
      .filter((r) => !r.userId || (Boolean(userId) && r.userId === userId))
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
  },

  async getModelById(id: string): Promise<ModelRecord | null> {
    const db = requireDb();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
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
    const db = requireDb();
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
    const db = requireDb();
    const [row] = await db.select().from(models).where(eq(models.id, id)).limit(1);
    if (!row || (row.userId && row.userId !== userId)) return null;
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
    const db = requireDb();
    const rows = await db
      .select()
      .from(workflows)
      .orderBy(desc(workflows.updatedAt));
    return rows
      .filter((r) => !r.userId || (Boolean(userId) && r.userId === userId))
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        description: r.description,
        status: r.status as 'draft' | 'deployed',
        isLocked: Boolean(r.isLocked),
        definition: r.definition,
        apiKey: r.apiKey,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
  },

  async getWorkflowById(id: string): Promise<WorkflowRecord | null> {
    const db = requireDb();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    const [row] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      status: row.status as 'draft' | 'deployed',
      isLocked: Boolean(row.isLocked),
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
    isLocked?: boolean;
  }): Promise<WorkflowRecord> {
    const db = requireDb();
    const apiKey = 'vf_' + crypto.randomBytes(18).toString('hex');
    const [row] = await db
      .insert(workflows)
      .values({
        userId: input.userId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        status: input.status ?? 'draft',
        isLocked: Boolean(input.isLocked),
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
      isLocked: Boolean(row.isLocked),
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
      isLocked?: boolean;
    }
  ): Promise<WorkflowRecord | null> {
    const db = requireDb();
    const existing = await this.getWorkflowById(id);
    if (!existing) return null;
    if (existing.userId && existing.userId !== userId) return null;

    const modifyingStructure =
      patch.name !== undefined ||
      patch.description !== undefined ||
      patch.definition !== undefined;
    if (existing.isLocked && patch.isLocked !== false && modifyingStructure) {
      throw new Error('Workflow is locked. Unlock it before saving modifications.');
    }

    const [row] = await db
      .update(workflows)
      .set({
        ...(existing.userId === null ? { userId } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.definition !== undefined ? { definition: patch.definition } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.isLocked !== undefined ? { isLocked: patch.isLocked } : {}),
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
      isLocked: Boolean(row.isLocked),
      definition: row.definition,
      apiKey: row.apiKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async listStreams(userId?: string): Promise<StreamRecord[]> {
    const db = requireDb();
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
    const db = requireDb();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
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
    const db = requireDb();
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
    const db = requireDb();
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
    const db = requireDb();
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
    const db = requireDb();
    let validWorkflowId = input.workflowId;
    if (
      !validWorkflowId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        validWorkflowId
      )
    ) {
      validWorkflowId = null;
    } else {
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
    const db = requireDb();
    const rows = await db
      .select()
      .from(inferenceRuns)
      .orderBy(desc(inferenceRuns.createdAt))
      .limit(30);
    return rows.filter((r) => !workflowId || r.workflowId === workflowId);
  },

  async recordApiCallLog(input: {
    workflowId?: string | null;
    userId?: string | null;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    authMethod: string;
    clientIp: string;
    requestMeta: Record<string, unknown>;
    responseSummary: Record<string, unknown>;
  }): Promise<void> {
    const db = getDb();
    if (!db) return;

    let validWorkflowId: string | null = input.workflowId ?? null;
    if (
      !validWorkflowId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        validWorkflowId
      )
    ) {
      validWorkflowId = null;
    } else {
      const [wfRow] = await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.id, validWorkflowId))
        .limit(1);
      if (!wfRow) validWorkflowId = null;
    }

    let validUserId: string | null = input.userId ?? null;
    if (
      !validUserId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        validUserId
      )
    ) {
      validUserId = null;
    }

    await db.insert(apiCallLogs).values({
      workflowId: validWorkflowId,
      userId: validUserId,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      authMethod: input.authMethod,
      clientIp: input.clientIp,
      requestMeta: input.requestMeta,
      responseSummary: input.responseSummary,
    });
  },

  async listApiCallLogs(options?: {
    workflowId?: string;
    method?: string;
    status?: string;
    endpoint?: string;
    limit?: number;
  }): Promise<ApiCallLogRecord[]> {
    const db = requireDb();
    const limit = Math.min(200, Math.max(1, options?.limit ?? 100));
    const rows = await db
      .select()
      .from(apiCallLogs)
      .orderBy(desc(apiCallLogs.createdAt))
      .limit(limit);

    return rows.filter((r) => {
      if (options?.workflowId && r.workflowId !== options.workflowId) return false;
      if (
        options?.method &&
        options.method !== 'ALL' &&
        r.method.toUpperCase() !== options.method.toUpperCase()
      ) {
        return false;
      }
      if (options?.status === '2xx' && (r.statusCode < 200 || r.statusCode >= 300)) {
        return false;
      }
      if (options?.status === '4xx_5xx' && r.statusCode < 400) {
        return false;
      }
      if (options?.endpoint === 'infer' && !r.path.includes('/infer')) {
        return false;
      }
      if (options?.endpoint === 'run' && !r.path.includes('/workflows/run')) {
        return false;
      }
      return true;
    });
  },
};
