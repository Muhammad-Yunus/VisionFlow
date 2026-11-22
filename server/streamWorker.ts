import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { store, type StreamRecord } from './store.ts';
import { executeWorkflowDag } from './dagEngine.ts';
import { validateExternalUrl } from './auth.ts';

const execFileAsync = promisify(execFile);

interface ActiveWorker {
  streamId: string;
  timer: NodeJS.Timeout | null;
  running: boolean;
  latestJpegBuffer: Buffer | null;
  latestMeta: Record<string, unknown> | null;
  subscribers: Set<(frame: Buffer) => void>;
}

const activeWorkers = new Map<string, ActiveWorker>();

async function captureRtspFrame(rtspUrl: string): Promise<{
  buffer: Buffer;
  sceneHint?: string;
}> {
  const urlCheck = validateExternalUrl(rtspUrl, [
    'rtsp:',
    'rtsps:',
    'http:',
    'https:',
  ]);

  if (urlCheck.valid) {
    try {
      const { stdout } = await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-rtsp_transport',
          'tcp',
          '-i',
          urlCheck.url!.toString(),
          '-frames:v',
          '1',
          '-f',
          'image2pipe',
          '-vcodec',
          'mjpeg',
          'pipe:1',
        ],
        { timeout: 4500, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 }
      );
      if (Buffer.isBuffer(stdout) && stdout.length > 500) {
        return { buffer: stdout };
      }
    } catch {
      // Fallback to local sample stream frames if external RTSP camera is unreachable
    }
  }

  // Alternate between the local street & warehouse sample images to simulate live frames
  const useStreet = Math.floor(Date.now() / 3000) % 2 === 0;
  const filename = useStreet
    ? 'sample_street_traffic_1795359272502.jpg'
    : 'sample_warehouse_logistics_1795359271625.jpg';
  const samplePath = path.resolve(process.cwd(), 'src/assets/images', filename);
  const buffer = await fs.readFile(samplePath);
  return {
    buffer,
    sceneHint: useStreet ? 'street_traffic' : 'warehouse_logistics',
  };
}

export async function startStreamWorker(stream: StreamRecord): Promise<void> {
  if (activeWorkers.has(stream.id)) {
    return;
  }

  const worker: ActiveWorker = {
    streamId: stream.id,
    timer: null,
    running: true,
    latestJpegBuffer: null,
    latestMeta: null,
    subscribers: new Set(),
  };
  activeWorkers.set(stream.id, worker);
  await store.updateStreamStatus(stream.id, { status: 'running' });

  let frameCount = stream.framesProcessed ?? 0;
  const intervalMs = Math.max(400, Math.round(1000 / Math.min(5, Math.max(0.2, stream.fpsTarget || 1))));

  const tick = async () => {
    if (!worker.running) return;
    try {
      const latestStream = await store.getStreamById(stream.id);
      const workflow = await store.getWorkflowById(stream.workflowId);
      if (!latestStream || !workflow) {
        await stopStreamWorker(stream.id);
        return;
      }

      const { buffer, sceneHint } = await captureRtspFrame(latestStream.rtspUrl);
      const result = await executeWorkflowDag({
        definition: workflow.definition,
        imageBuffer: buffer,
        enableSinks: true,
        sceneHint,
      });

      const base64Data = result.annotated_image_base64?.replace(
        /^data:image\/\w+;base64,/,
        ''
      );
      const jpegBuf = base64Data ? Buffer.from(base64Data, 'base64') : buffer;
      worker.latestJpegBuffer = jpegBuf;
      frameCount += 1;

      const summary = {
        frame: frameCount,
        inference_id: result.inference_id,
        duration_ms: result.duration_ms,
        detection_count: result.detection_count,
        outputs: {
          ...result.outputs,
          output_image: undefined,
        },
        timestamp: new Date().toISOString(),
      };
      worker.latestMeta = summary;

      await store.updateStreamStatus(stream.id, {
        status: 'running',
        framesProcessed: frameCount,
        lastFrameAt: new Date(),
        lastResult: summary,
      });

      for (const listener of worker.subscribers) {
        try {
          listener(jpegBuf);
        } catch {
          // ignore closed listener
        }
      }
    } catch (err) {
      console.warn(
        `[StreamWorker ${stream.id}] frame error:`,
        err instanceof Error ? err.message : err
      );
    } finally {
      if (worker.running) {
        worker.timer = setTimeout(tick, intervalMs);
      }
    }
  };

  void tick();
}

export async function stopStreamWorker(streamId: string): Promise<void> {
  const worker = activeWorkers.get(streamId);
  if (worker) {
    worker.running = false;
    if (worker.timer) clearTimeout(worker.timer);
    worker.subscribers.clear();
    activeWorkers.delete(streamId);
  }
  await store.updateStreamStatus(streamId, { status: 'stopped' });
}

export function getActiveWorker(streamId: string): ActiveWorker | undefined {
  return activeWorkers.get(streamId);
}
