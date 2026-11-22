import crypto from 'node:crypto';
import sharp from 'sharp';
import type {
  WorkflowDefinition,
  WorkflowNodeDef,
} from '../src/shared/workflowSchema.ts';
import { store } from './store.ts';
import {
  runYoloInference,
  renderAnnotatedImage,
  type DetectionPrediction,
} from './yoloEngine.ts';
import { validateExternalUrl } from './auth.ts';

export interface DagExecutionOptions {
  definition: WorkflowDefinition;
  imageBuffer: Buffer;
  enableSinks?: boolean;
  includeAllStepOutputs?: boolean;
}

export interface DagStepTrace {
  nodeId: string;
  nodeName: string;
  kind: string;
  durationMs: number;
  skipped?: boolean;
  outputs: Record<string, unknown>;
}

export interface DagExecutionResult {
  inference_id: string;
  duration_ms: number;
  execution_order: string[];
  outputs: Record<string, unknown>;
  step_outputs?: Record<string, Record<string, unknown>>;
  annotated_image_base64: string | null;
  detection_count: number;
  trace: DagStepTrace[];
}

interface ImageSlot {
  __type: 'image_buffer';
  buffer: Buffer;
  width: number;
  height: number;
}

function isImageSlot(val: unknown): val is ImageSlot {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as ImageSlot).__type === 'image_buffer' &&
    Buffer.isBuffer((val as ImageSlot).buffer)
  );
}

/**
 * Kahn's algorithm topological sort for DAG workflow execution.
 */
export function topologicalSortNodes(
  definition: WorkflowDefinition
): WorkflowNodeDef[] {
  const nodeMap = new Map<string, WorkflowNodeDef>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of definition.nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of definition.edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    adj.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const ordered: WorkflowNodeDef[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = nodeMap.get(currentId);
    if (node) ordered.push(node);

    for (const nextId of adj.get(currentId) ?? []) {
      const nextDeg = (inDegree.get(nextId) ?? 1) - 1;
      inDegree.set(nextId, nextDeg);
      if (nextDeg === 0) {
        queue.push(nextId);
      }
    }
  }

  if (ordered.length !== definition.nodes.length) {
    throw new Error(
      'Workflow graph contains a cycle. Remove circular connections before running.'
    );
  }

  return ordered;
}

function resolveRef(
  refValue: unknown,
  contextByName: Map<string, Record<string, unknown>>,
  contextById: Map<string, Record<string, unknown>>,
  fallbackSlot?: unknown
): unknown {
  if (typeof refValue !== 'string' || !refValue.includes('.')) {
    return refValue !== undefined && refValue !== '' ? refValue : fallbackSlot;
  }
  const cleanRef = refValue.replace(/^\$steps\./, '').replace(/^\$inputs\./, 'inputs.');
  const dotIdx = cleanRef.indexOf('.');
  const scope = cleanRef.slice(0, dotIdx);
  const field = cleanRef.slice(dotIdx + 1);

  const stepObj = contextByName.get(scope) ?? contextById.get(scope);
  if (stepObj && field in stepObj) {
    return stepObj[field];
  }
  return fallbackSlot;
}

function serializeOutputValue(val: unknown): unknown {
  if (isImageSlot(val)) {
    return `data:image/jpeg;base64,${val.buffer.toString('base64')}`;
  }
  return val;
}

export async function executeWorkflowDag(
  options: DagExecutionOptions
): Promise<DagExecutionResult> {
  const totalStart = Date.now();
  const inferenceId = crypto.randomUUID().slice(0, 12);
  const { definition, imageBuffer, enableSinks = true, includeAllStepOutputs = false } = options;

  const orderedNodes = topologicalSortNodes(definition);
  const meta = await sharp(imageBuffer).metadata();
  const origWidth = meta.width ?? 640;
  const origHeight = meta.height ?? 480;

  const baseImageSlot: ImageSlot = {
    __type: 'image_buffer',
    buffer: imageBuffer,
    width: origWidth,
    height: origHeight,
  };

  const contextByName = new Map<string, Record<string, unknown>>();
  const contextById = new Map<string, Record<string, unknown>>();
  const trace: DagStepTrace[] = [];

  // Seed inputs scope
  const inputScope: Record<string, unknown> = { image: baseImageSlot };
  for (const inp of definition.inputs) {
    inputScope[inp.name] = baseImageSlot;
  }
  contextByName.set('inputs', inputScope);
  contextById.set('inputs', inputScope);

  let latestPredictions: DetectionPrediction[] = [];
  let latestAnnotatedSlot: ImageSlot = baseImageSlot;

  for (const node of orderedNodes) {
    const stepStart = Date.now();

    if (node.disabled) {
      const skippedOut: Record<string, unknown> = { skipped: true };
      contextByName.set(node.name, skippedOut);
      contextById.set(node.id, skippedOut);
      trace.push({
        nodeId: node.id,
        nodeName: node.name,
        kind: node.kind,
        durationMs: 0,
        skipped: true,
        outputs: skippedOut,
      });
      continue;
    }

    let stepOut: Record<string, unknown> = {};

    switch (node.kind) {
      case 'inputs': {
        stepOut = { ...inputScope };
        break;
      }

      case 'yolo_detection':
      case 'yolo_segmentation':
      case 'yolo_pose': {
        const imgVal = resolveRef(
          node.params.image,
          contextByName,
          contextById,
          baseImageSlot
        );
        const targetBuf = isImageSlot(imgVal) ? imgVal.buffer : imageBuffer;
        const modelId = String(node.params.modelId ?? '');
        let model = modelId ? await store.getModelById(modelId) : null;
        if (!model) {
          const allModels = await store.listModels();
          const modelName = String(node.params.modelName ?? '');
          model =
            allModels.find((m) => m.name === modelName) ??
            allModels.find((m) => m.format === 'onnx') ??
            allModels[0] ??
            null;
        }
        if (!model) {
          throw new Error(
            'No YOLO model registered in the database. Upload a .onnx model in the Model Registry first.'
          );
        }

        const confidence = Math.min(
          0.99,
          Math.max(0.05, Number(node.params.confidence ?? 0.4))
        );
        const iou = Math.min(
          0.99,
          Math.max(0.05, Number(node.params.iou ?? 0.45))
        );

        const yoloResult = await runYoloInference({
          imageBuffer: targetBuf,
          model,
          confidence,
          iou,
        });

        let preds = yoloResult.predictions;
        const classFilter = Array.isArray(node.params.classFilter)
          ? (node.params.classFilter as string[])
          : [];
        if (classFilter.length > 0) {
          preds = preds.filter((p) => classFilter.includes(p.class));
        }

        latestPredictions = preds;
        stepOut = {
          inference_id: yoloResult.inference_id,
          model: yoloResult.model,
          engine: yoloResult.engine,
          image_dimensions: yoloResult.image,
          predictions: preds,
          all_properties: {
            inference_id: yoloResult.inference_id,
            count: preds.length,
            classes: Array.from(new Set(preds.map((p) => p.class))),
          },
        };
        break;
      }

      case 'bounding_box_visualization': {
        const imgVal = resolveRef(
          node.params.image,
          contextByName,
          contextById,
          baseImageSlot
        );
        const predsVal = resolveRef(
          node.params.predictions,
          contextByName,
          contextById,
          latestPredictions
        );
        const sourceBuf = isImageSlot(imgVal) ? imgVal.buffer : imageBuffer;
        const preds = Array.isArray(predsVal)
          ? (predsVal as DetectionPrediction[])
          : latestPredictions;

        const outBuf = await renderAnnotatedImage(sourceBuf, preds, {
          drawBoxes: true,
          boxThickness: Number(node.params.thickness ?? 2),
          boxRoundness: Number(node.params.roundness ?? 4),
        });
        const slot: ImageSlot = {
          __type: 'image_buffer',
          buffer: outBuf,
          width: origWidth,
          height: origHeight,
        };
        latestAnnotatedSlot = slot;
        stepOut = {
          image: slot,
          all_properties: { rendered_boxes: preds.length },
        };
        break;
      }

      case 'label_visualization': {
        const imgVal = resolveRef(
          node.params.image,
          contextByName,
          contextById,
          latestAnnotatedSlot
        );
        const predsVal = resolveRef(
          node.params.predictions,
          contextByName,
          contextById,
          latestPredictions
        );
        const sourceBuf = isImageSlot(imgVal) ? imgVal.buffer : latestAnnotatedSlot.buffer;
        const preds = Array.isArray(predsVal)
          ? (predsVal as DetectionPrediction[])
          : latestPredictions;

        const outBuf = await renderAnnotatedImage(sourceBuf, preds, {
          drawLabels: true,
          textDisplay: (node.params.textDisplay as
            | 'class_and_confidence'
            | 'class_only'
            | 'confidence_only') ?? 'class_and_confidence',
          fontSize: Number(node.params.fontSize ?? 13),
        });
        const slot: ImageSlot = {
          __type: 'image_buffer',
          buffer: outBuf,
          width: origWidth,
          height: origHeight,
        };
        latestAnnotatedSlot = slot;
        stepOut = {
          image: slot,
          all_properties: { rendered_labels: preds.length },
        };
        break;
      }

      case 'mask_visualization': {
        const imgVal = resolveRef(
          node.params.image,
          contextByName,
          contextById,
          latestAnnotatedSlot
        );
        const predsVal = resolveRef(
          node.params.predictions,
          contextByName,
          contextById,
          latestPredictions
        );
        const sourceBuf = isImageSlot(imgVal) ? imgVal.buffer : latestAnnotatedSlot.buffer;
        const preds = Array.isArray(predsVal)
          ? (predsVal as DetectionPrediction[])
          : latestPredictions;

        const outBuf = await renderAnnotatedImage(sourceBuf, preds, {
          drawMasks: true,
          maskOpacity: Number(node.params.opacity ?? 0.42),
        });
        const slot: ImageSlot = {
          __type: 'image_buffer',
          buffer: outBuf,
          width: origWidth,
          height: origHeight,
        };
        latestAnnotatedSlot = slot;
        stepOut = { image: slot };
        break;
      }

      case 'keypoint_visualization': {
        const imgVal = resolveRef(
          node.params.image,
          contextByName,
          contextById,
          latestAnnotatedSlot
        );
        const predsVal = resolveRef(
          node.params.predictions,
          contextByName,
          contextById,
          latestPredictions
        );
        const sourceBuf = isImageSlot(imgVal) ? imgVal.buffer : latestAnnotatedSlot.buffer;
        const preds = Array.isArray(predsVal)
          ? (predsVal as DetectionPrediction[])
          : latestPredictions;

        const outBuf = await renderAnnotatedImage(sourceBuf, preds, {
          drawKeypoints: true,
          jointRadius: Number(node.params.jointRadius ?? 4),
        });
        const slot: ImageSlot = {
          __type: 'image_buffer',
          buffer: outBuf,
          width: origWidth,
          height: origHeight,
        };
        latestAnnotatedSlot = slot;
        stepOut = { image: slot };
        break;
      }

      case 'object_counter': {
        const dataVal = resolveRef(
          node.params.data,
          contextByName,
          contextById,
          latestPredictions
        );
        const preds = Array.isArray(dataVal)
          ? (dataVal as DetectionPrediction[])
          : latestPredictions;
        const targetClass = String(node.params.targetClass ?? '').trim();
        const filtered = targetClass
          ? preds.filter((p) => p.class.toLowerCase() === targetClass.toLowerCase())
          : preds;
        const byClass: Record<string, number> = {};
        for (const p of filtered) {
          byClass[p.class] = (byClass[p.class] ?? 0) + 1;
        }
        stepOut = {
          output: filtered.length,
          by_class: byClass,
          all_properties: { count: filtered.length, by_class: byClass },
        };
        break;
      }

      case 'class_filter': {
        const predsVal = resolveRef(
          node.params.predictions,
          contextByName,
          contextById,
          latestPredictions
        );
        const preds = Array.isArray(predsVal)
          ? (predsVal as DetectionPrediction[])
          : latestPredictions;
        const mode = node.params.mode === 'exclude' ? 'exclude' : 'include';
        const classes = Array.isArray(node.params.classes)
          ? (node.params.classes as string[]).map((c) => c.toLowerCase())
          : [];
        const filtered =
          classes.length === 0
            ? preds
            : preds.filter((p) =>
                mode === 'include'
                  ? classes.includes(p.class.toLowerCase())
                  : !classes.includes(p.class.toLowerCase())
              );
        latestPredictions = filtered;
        stepOut = {
          predictions: filtered,
          count: filtered.length,
        };
        break;
      }

      case 'line_crossing': {
        const predsVal = resolveRef(
          node.params.predictions,
          contextByName,
          contextById,
          latestPredictions
        );
        const preds = Array.isArray(predsVal)
          ? (predsVal as DetectionPrediction[])
          : latestPredictions;
        const mode = node.params.mode === 'line' ? 'line' : 'zone';
        const zone = (node.params.zone as {
          x1: number;
          y1: number;
          x2: number;
          y2: number;
        }) ?? { x1: 0.1, y1: 0.25, x2: 0.9, y2: 0.9 };
        const line = (node.params.line as {
          x1: number;
          y1: number;
          x2: number;
          y2: number;
        }) ?? { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 };

        const inside = preds.filter((p) => {
          const nx = p.x / origWidth;
          const ny = p.y / origHeight;
          if (mode === 'zone') {
            return (
              nx >= zone.x1 && nx <= zone.x2 && ny >= zone.y1 && ny <= zone.y2
            );
          }
          // Check if bounding box crosses the horizontal/diagonal line segment
          const ny1 = p.y1 / origHeight;
          const ny2 = p.y2 / origHeight;
          const lineY = (line.y1 + line.y2) / 2;
          return (
            nx >= Math.min(line.x1, line.x2) &&
            nx <= Math.max(line.x1, line.x2) &&
            ny1 <= lineY &&
            ny2 >= lineY
          );
        });

        stepOut = {
          count: inside.length,
          predictions: inside,
        };
        break;
      }

      case 'condition': {
        const leftResolved = resolveRef(
          node.params.leftValue,
          contextByName,
          contextById,
          latestPredictions.length
        );
        const leftNum = Number(leftResolved ?? 0);
        const rightNum = Number(node.params.rightValue ?? 0);
        const op = String(node.params.operator ?? 'gt');
        let passed = false;
        if (op === 'gt') passed = leftNum > rightNum;
        else if (op === 'gte') passed = leftNum >= rightNum;
        else if (op === 'lt') passed = leftNum < rightNum;
        else if (op === 'lte') passed = leftNum <= rightNum;
        else if (op === 'eq') passed = leftNum === rightNum;
        else if (op === 'neq') passed = leftNum !== rightNum;

        stepOut = {
          passed,
          value: leftNum,
          expression: `${leftNum} ${op} ${rightNum}`,
        };
        break;
      }

      case 'webhook_sink': {
        const condRef = String(node.params.triggerCondition ?? '').trim();
        let shouldTrigger = true;
        if (condRef) {
          const condVal = resolveRef(condRef, contextByName, contextById, true);
          shouldTrigger = Boolean(condVal);
        }
        let dispatched = false;
        let statusCode = 0;
        let note = enableSinks ? 'Skipped (condition false)' : 'Sinks disabled';

        if (enableSinks && shouldTrigger) {
          const url = String(node.params.url ?? '').trim();
          const check = validateExternalUrl(url, ['http:', 'https:']);
          if (!check.valid) {
            note = check.error ?? 'Blocked URL';
          } else {
            try {
              const predsVal = resolveRef(
                node.params.predictions,
                contextByName,
                contextById,
                latestPredictions
              );
              const resp = await fetch(check.url!.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  inference_id: inferenceId,
                  timestamp: new Date().toISOString(),
                  predictions: predsVal,
                }),
                signal: AbortSignal.timeout(4000),
              });
              dispatched = resp.ok;
              statusCode = resp.status;
              note = `HTTP ${resp.status}`;
            } catch (err) {
              note = err instanceof Error ? err.message : 'Webhook request failed';
            }
          }
        }
        stepOut = { dispatched, status_code: statusCode, note };
        break;
      }

      case 'mqtt_sink': {
        const condRef = String(node.params.triggerCondition ?? '').trim();
        const shouldTrigger = condRef
          ? Boolean(resolveRef(condRef, contextByName, contextById, true))
          : true;
        stepOut = {
          published: Boolean(enableSinks && shouldTrigger),
          broker: String(node.params.brokerUrl ?? ''),
          topic: String(node.params.topic ?? 'visionflow/detections'),
        };
        break;
      }

      case 'modbus_sink': {
        const condRef = String(node.params.triggerCondition ?? '').trim();
        const shouldTrigger = condRef
          ? Boolean(resolveRef(condRef, contextByName, contextById, true))
          : true;
        stepOut = {
          written: Boolean(enableSinks && shouldTrigger),
          host: String(node.params.host ?? ''),
          coil: Number(node.params.coilAddress ?? 1),
          value: Number(node.params.value ?? 1),
        };
        break;
      }

      case 'outputs': {
        stepOut = {};
        break;
      }
    }

    contextByName.set(node.name, stepOut);
    contextById.set(node.id, stepOut);

    const serializedOutputs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(stepOut)) {
      serializedOutputs[k] = serializeOutputValue(v);
    }

    trace.push({
      nodeId: node.id,
      nodeName: node.name,
      kind: node.kind,
      durationMs: Date.now() - stepStart,
      outputs: serializedOutputs,
    });
  }

  // Assemble final Outputs mapping
  const outputs: Record<string, unknown> = {};
  for (const mapping of definition.outputs) {
    const resolved = resolveRef(mapping.value, contextByName, contextById);
    outputs[mapping.name] = serializeOutputValue(resolved);
  }

  // Ensure an annotated image is returned if available
  const annotatedBase64 =
    typeof outputs.output_image === 'string' &&
    outputs.output_image.startsWith('data:image/')
      ? outputs.output_image
      : `data:image/jpeg;base64,${latestAnnotatedSlot.buffer.toString('base64')}`;

  const stepOutputsMap: Record<string, Record<string, unknown>> = {};
  if (includeAllStepOutputs) {
    for (const t of trace) {
      if (t.kind !== 'inputs' && t.kind !== 'outputs') {
        stepOutputsMap[t.nodeName] = t.outputs;
      }
    }
  }

  return {
    inference_id: inferenceId,
    duration_ms: Date.now() - totalStart,
    execution_order: orderedNodes.map((n) => n.name),
    outputs,
    ...(includeAllStepOutputs ? { step_outputs: stepOutputsMap } : {}),
    annotated_image_base64: annotatedBase64,
    detection_count: latestPredictions.length,
    trace,
  };
}
