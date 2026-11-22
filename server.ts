import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createServer as createViteServer } from 'vite';
import { initDatabase, getDbStatus } from './src/db/index.ts';
import {
  hashPassword,
  verifyPassword,
  signAuthToken,
  optionalAuthMiddleware,
  requireAuthMiddleware,
  validateExternalUrl,
  type AuthenticatedRequest,
} from './server/auth.ts';
import { store, seedDatabaseDefaults } from './server/store.ts';
import { inspectModelFile } from './server/modelInspector.ts';
import { executeWorkflowDag } from './server/dagEngine.ts';
import {
  startStreamWorker,
  stopStreamWorker,
  getActiveWorker,
} from './server/streamWorker.ts';
import type { WorkflowDefinition } from './src/shared/workflowSchema.ts';

const PORT = 3000;
const MODELS_DIR = path.resolve(process.cwd(), 'uploads', 'models');

const registerSchema = z.object({
  email: z.string().email().max(160),
  name: z.string().min(2).max(80),
  password: z.string().min(6).max(128),
});

const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(128),
});

const workflowPayloadSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  status: z.enum(['draft', 'deployed']).optional(),
  definition: z.object({
    version: z.literal('1.0'),
    inputs: z.array(z.any()),
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    outputs: z.array(z.any()),
  }),
});

const createStreamSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string().min(1).max(120),
  rtspUrl: z.string().min(1).max(512),
  sourceType: z.enum(['rtsp', 'network', 'file_loop']).default('rtsp'),
  sinkType: z.enum(['mjpeg', 'webhook', 'mqtt', 'modbus']).default('mjpeg'),
  sinkConfig: z.record(z.string(), z.unknown()).default({}),
  fpsTarget: z.number().min(0.2).max(10).default(2),
});

function decodeBase64Image(input: string): Buffer {
  const cleaned = input.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

async function resolveImageBufferFromRequest(opts: {
  fileBuffer?: Buffer;
  imageBase64?: string;
  imageUrl?: string;
}): Promise<Buffer> {
  if (opts.fileBuffer && opts.fileBuffer.length > 0) {
    return opts.fileBuffer;
  }

  if (opts.imageBase64 && opts.imageBase64.trim().length > 16) {
    const buffer = decodeBase64Image(opts.imageBase64.trim());
    if (buffer.length === 0) {
      throw new Error('Invalid base64 image payload.');
    }
    return buffer;
  }

  if (opts.imageUrl && opts.imageUrl.trim().length > 0) {
    const check = validateExternalUrl(opts.imageUrl, ['http:', 'https:']);
    if (!check.valid) {
      throw new Error(check.error ?? 'Invalid image URL.');
    }
    const resp = await fetch(check.url!.toString(), {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      throw new Error(`Failed to fetch image URL (HTTP ${resp.status}).`);
    }
    const arrayBuf = await resp.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  throw new Error('No input image provided. Upload an image file or enter a public HTTPS image URL.');
}

async function startServer() {
  await fs.mkdir(MODELS_DIR, { recursive: true });
  const dbInit = await initDatabase();
  console.log('[VisionFlow] Database status:', dbInit.status);
  if (dbInit.connected) {
    await seedDatabaseDefaults();
  }

  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  const modelUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, MODELS_DIR),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeStem = path
          .basename(file.originalname, ext)
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .slice(0, 48);
        cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeStem}${ext}`);
      },
    }),
    limits: { fileSize: 250 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.onnx' && ext !== '.pt') {
        cb(new Error('Only .onnx and .pt YOLO model files are supported.'));
        return;
      }
      cb(null, true);
    },
  });

  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  // --- Health & DB Status ---
  app.get('/api/health', (_req, res) => {
    const db = getDbStatus();
    res.json({
      ok: true,
      service: 'VisionFlow Inference Server',
      database: db.status,
    });
  });

  // --- Auth Routes ---
  app.get('/api/auth/bootstrap-status', async (_req, res) => {
    const userCount = await store.countUsers();
    const db = getDbStatus();
    res.json({
      needsSetup: userCount === 0,
      databaseStatus: db.status,
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }
      const existing = await store.findUserByEmail(parsed.data.email);
      if (existing) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }
      const userCount = await store.countUsers();
      const role = userCount === 0 ? 'admin' : 'member';
      const passwordHash = await hashPassword(parsed.data.password);
      const user = await store.createUser({
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role,
      });
      const authUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const token = signAuthToken(authUser);
      res.status(201).json({ token, user: authUser });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Registration failed',
      });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Valid email and password are required.' });
        return;
      }
      const user = await store.findUserByEmail(parsed.data.email);
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      const ok = await verifyPassword(parsed.data.password, user.passwordHash);
      if (!ok) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      const authUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      const token = signAuthToken(authUser);
      res.json({ token, user: authUser });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Login failed',
      });
    }
  });

  app.get('/api/auth/me', requireAuthMiddleware, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // --- Model Registry Routes ---
  app.get('/api/models', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const items = await store.listModels(req.user?.id);
      res.json({
        models: items.map((m) => ({
          id: m.id,
          name: m.name,
          filename: m.filename,
          format: m.format,
          task: m.task,
          classNames: m.classNames,
          inputShape: m.inputShape,
          fileSizeBytes: m.fileSizeBytes,
          createdAt: m.createdAt,
        })),
      });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Database unavailable',
      });
    }
  });

  app.post(
    '/api/models/upload',
    requireAuthMiddleware,
    modelUpload.single('model'),
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'Please upload a .onnx or .pt model file.' });
          return;
        }
        const resolvedPath = path.resolve(req.file.path);
        if (!resolvedPath.startsWith(MODELS_DIR + path.sep)) {
          res.status(400).json({ error: 'Invalid file destination path.' });
          return;
        }

        const ext = path.extname(req.file.originalname).toLowerCase();
        const format: 'onnx' | 'pt' = ext === '.pt' ? 'pt' : 'onnx';
        const inspected = await inspectModelFile(resolvedPath, format);

        const customName =
          typeof req.body?.name === 'string' && req.body.name.trim()
            ? req.body.name.trim()
            : req.file.originalname;

        const record = await store.createModel({
          userId: req.user!.id,
          name: customName,
          filename: req.file.originalname,
          storagePath: resolvedPath,
          format,
          task: inspected.task,
          classNames: inspected.classNames,
          inputShape: inspected.inputShape,
          fileSizeBytes: req.file.size,
        });

        res.status(201).json({
          model: {
            id: record.id,
            name: record.name,
            filename: record.filename,
            format: record.format,
            task: record.task,
            classNames: record.classNames,
            inputShape: record.inputShape,
            fileSizeBytes: record.fileSizeBytes,
            createdAt: record.createdAt,
            extractionSource: inspected.extractionSource,
          },
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Model upload failed',
        });
      }
    }
  );

  app.delete('/api/models/:id', requireAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    const modelId = String(req.params.id);
    const removed = await store.deleteModel(modelId, req.user!.id);
    if (!removed) {
      res.status(404).json({ error: 'Model not found or access denied.' });
      return;
    }
    if (removed.storagePath && !removed.storagePath.startsWith('builtin://')) {
      const resolved = path.resolve(removed.storagePath);
      if (resolved.startsWith(MODELS_DIR + path.sep)) {
        await fs.unlink(resolved).catch(() => undefined);
      }
    }
    res.json({ deleted: true, id: removed.id });
  });

  // --- Workflow CRUD & Deploy Routes ---
  app.get('/api/workflows', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const items = await store.listWorkflows(req.user?.id);
      res.json({ workflows: items });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Database unavailable',
      });
    }
  });

  app.get('/api/workflows/:id', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const wf = await store.getWorkflowById(String(req.params.id));
      if (!wf) {
        res.status(404).json({ error: 'Workflow not found.' });
        return;
      }
      if (wf.userId && req.user?.id !== wf.userId) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }
      res.json({ workflow: wf });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Database unavailable',
      });
    }
  });

  app.post('/api/workflows', requireAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    const parsed = workflowPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid workflow payload' });
      return;
    }
    const wf = await store.createWorkflow({
      userId: req.user!.id,
      name: parsed.data.name,
      description: parsed.data.description,
      status: parsed.data.status ?? 'draft',
      definition: parsed.data.definition as WorkflowDefinition,
    });
    res.status(201).json({ workflow: wf });
  });

  app.put('/api/workflows/:id', requireAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    const parsed = workflowPayloadSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid workflow update' });
      return;
    }
    const updated = await store.updateWorkflow(String(req.params.id), req.user!.id, {
      name: parsed.data.name,
      description: parsed.data.description,
      status: parsed.data.status,
      definition: parsed.data.definition as WorkflowDefinition | undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Workflow not found or access denied.' });
      return;
    }
    res.json({ workflow: updated });
  });

  app.post('/api/workflows/:id/deploy', requireAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    const updated = await store.updateWorkflow(String(req.params.id), req.user!.id, {
      status: 'deployed',
    });
    if (!updated) {
      res.status(404).json({ error: 'Workflow not found or access denied.' });
      return;
    }
    res.json({
      workflow: updated,
      endpoint: `/api/v1/workflows/${updated.id}/infer`,
    });
  });

  app.get('/api/workflows/:id/runs', optionalAuthMiddleware, async (req, res) => {
    try {
      const runs = await store.listInferenceRuns(String(req.params.id));
      res.json({ runs });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Database unavailable',
      });
    }
  });

  // --- Interactive Run & Test Endpoint (Right Panel) ---
  app.post(
    '/api/workflows/run',
    optionalAuthMiddleware,
    memoryUpload.single('file'),
    async (req: AuthenticatedRequest, res) => {
      try {
        let definition: WorkflowDefinition | undefined;
        if (typeof req.body?.definition === 'string') {
          definition = JSON.parse(req.body.definition) as WorkflowDefinition;
        } else if (req.body?.definition && typeof req.body.definition === 'object') {
          definition = req.body.definition as WorkflowDefinition;
        }

        if (!definition || !Array.isArray(definition.nodes)) {
          res.status(400).json({ error: 'Workflow definition is required.' });
          return;
        }

        const buffer = await resolveImageBufferFromRequest({
          fileBuffer: req.file?.buffer,
          imageBase64: req.body?.imageBase64,
          imageUrl: req.body?.imageUrl,
        });

        const enableSinks =
          req.body?.enableSinks === true || req.body?.enableSinks === 'true';
        const showAllBlockOutputs =
          req.body?.showAllBlockOutputs === true ||
          req.body?.showAllBlockOutputs === 'true';

        const result = await executeWorkflowDag({
          definition,
          imageBuffer: buffer,
          enableSinks,
          includeAllStepOutputs: showAllBlockOutputs,
        });

        const workflowId =
          typeof req.body?.workflowId === 'string' ? req.body.workflowId : null;
        await store.recordInferenceRun({
          workflowId,
          userId: req.user?.id ?? null,
          sourceType: req.body?.sourceType ?? 'file',
          durationMs: result.duration_ms,
          detectionCount: result.detection_count,
          resultSummary: {
            inference_id: result.inference_id,
            execution_order: result.execution_order,
          },
        });

        res.json(result);
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Workflow execution failed',
        });
      }
    }
  );

  // --- Serving / Deployed REST API Endpoint ---
  app.post(
    '/api/v1/workflows/:workflowId/infer',
    optionalAuthMiddleware,
    memoryUpload.single('image'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const workflowId = String(req.params.workflowId);
        const wf = await store.getWorkflowById(workflowId);
        if (!wf) {
          res.status(404).json({ error: 'Workflow not found.' });
          return;
        }

        const apiKeyHeader =
          typeof req.headers['x-api-key'] === 'string'
            ? req.headers['x-api-key'].trim()
            : '';
        const authorizedByUser =
          Boolean(req.user) && (!wf.userId || wf.userId === req.user!.id);
        const authorizedByApiKey = apiKeyHeader !== '' && apiKeyHeader === wf.apiKey;

        if (!authorizedByUser && !authorizedByApiKey) {
          res.status(401).json({
            error: 'Provide a valid X-API-Key header or Authorization Bearer token.',
          });
          return;
        }

        const buffer = await resolveImageBufferFromRequest({
          fileBuffer: req.file?.buffer,
          imageBase64: req.body?.image ?? req.body?.imageBase64,
          imageUrl: req.body?.image_url ?? req.body?.imageUrl,
        });

        const result = await executeWorkflowDag({
          definition: wf.definition,
          imageBuffer: buffer,
          enableSinks: req.body?.enableSinks !== false,
          includeAllStepOutputs: Boolean(req.body?.includeAllStepOutputs),
        });

        await store.recordInferenceRun({
          workflowId: wf.id,
          userId: req.user?.id ?? wf.userId,
          sourceType: 'api',
          durationMs: result.duration_ms,
          detectionCount: result.detection_count,
          resultSummary: {
            inference_id: result.inference_id,
            execution_order: result.execution_order,
          },
        });

        res.json({
          workflow_id: wf.id,
          workflow_name: wf.name,
          ...result,
        });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Inference failed',
        });
      }
    }
  );

  // --- RTSP / Stream Background Workers ---
  app.get('/api/streams', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const list = await store.listStreams(req.user?.id);
      res.json({ streams: list });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Database unavailable',
      });
    }
  });

  app.post('/api/streams', requireAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    const parsed = createStreamSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid stream config' });
      return;
    }
    const wf = await store.getWorkflowById(parsed.data.workflowId);
    if (!wf) {
      res.status(404).json({ error: 'Target workflow not found.' });
      return;
    }
    if (wf.userId && wf.userId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied to workflow.' });
      return;
    }

    const urlCheck = validateExternalUrl(parsed.data.rtspUrl, [
      'rtsp:',
      'rtsps:',
      'http:',
      'https:',
    ]);
    if (!urlCheck.valid && parsed.data.sourceType === 'rtsp') {
      res.status(400).json({ error: urlCheck.error ?? 'Invalid RTSP stream URL.' });
      return;
    }

    const stream = await store.createStream({
      userId: req.user!.id,
      workflowId: parsed.data.workflowId,
      name: parsed.data.name,
      rtspUrl: parsed.data.rtspUrl,
      sourceType: parsed.data.sourceType,
      sinkType: parsed.data.sinkType,
      sinkConfig: parsed.data.sinkConfig,
      fpsTarget: parsed.data.fpsTarget,
    });
    res.status(201).json({ stream });
  });

  app.post('/api/streams/:id/start', requireAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    const stream = await store.getStreamById(String(req.params.id));
    if (!stream) {
      res.status(404).json({ error: 'Stream not found.' });
      return;
    }
    if (stream.userId && stream.userId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    await startStreamWorker(stream);
    const updated = await store.getStreamById(stream.id);
    res.json({ stream: updated });
  });

  app.post('/api/streams/:id/stop', requireAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    const stream = await store.getStreamById(String(req.params.id));
    if (!stream) {
      res.status(404).json({ error: 'Stream not found.' });
      return;
    }
    if (stream.userId && stream.userId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    await stopStreamWorker(stream.id);
    const updated = await store.getStreamById(stream.id);
    res.json({ stream: updated });
  });

  app.delete('/api/streams/:id', requireAuthMiddleware, async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    await stopStreamWorker(id);
    const deleted = await store.deleteStream(id, req.user!.id);
    if (!deleted) {
      res.status(404).json({ error: 'Stream not found or access denied.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.get('/api/streams/:id/latest', optionalAuthMiddleware, async (req, res) => {
    const id = String(req.params.id);
    const worker = getActiveWorker(id);
    const stream = await store.getStreamById(id);
    if (!stream) {
      res.status(404).json({ error: 'Stream not found.' });
      return;
    }
    res.json({
      stream,
      latestFrameBase64: worker?.latestJpegBuffer
        ? `data:image/jpeg;base64,${worker.latestJpegBuffer.toString('base64')}`
        : null,
      latestMeta: worker?.latestMeta ?? stream.lastResult,
    });
  });

  app.get('/api/streams/:id/mjpeg', async (req, res) => {
    const id = String(req.params.id);
    const worker = getActiveWorker(id);
    if (!worker) {
      res.status(404).json({ error: 'Stream worker is not running.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=visionflowframe',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
    });

    const writeFrame = (frameBuf: Buffer) => {
      res.write(
        `--visionflowframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${frameBuf.length}\r\n\r\n`
      );
      res.write(frameBuf);
      res.write('\r\n');
    };

    if (worker.latestJpegBuffer) {
      writeFrame(worker.latestJpegBuffer);
    }

    worker.subscribers.add(writeFrame);
    req.on('close', () => {
      worker.subscribers.delete(writeFrame);
    });
  });

  // --- Vite Dev Middleware / Production Static ---
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VisionFlow] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[VisionFlow] Fatal startup error:', err);
  process.exit(1);
});
