import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import type { ModelRecord } from './store.ts';

export interface DetectionPrediction {
  detection_id: string;
  class: string;
  class_id: number;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points?: Array<{ x: number; y: number }>;
  keypoints?: Array<{ x: number; y: number; confidence: number; name?: string }>;
}

export interface YoloInferenceResult {
  inference_id: string;
  model: string;
  task: 'detect' | 'segment' | 'pose';
  engine: 'onnxruntime-node';
  image: { width: number; height: number };
  predictions: DetectionPrediction[];
  durationMs: number;
}

const sessionCache = new Map<string, ort.InferenceSession>();

async function getOnnxSession(modelPath: string): Promise<ort.InferenceSession> {
  const cached = sessionCache.get(modelPath);
  if (cached) return cached;
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
  });
  sessionCache.set(modelPath, session);
  return session;
}

function iouScore(a: DetectionPrediction, b: DetectionPrediction): number {
  const interX1 = Math.max(a.x1, b.x1);
  const interY1 = Math.max(a.y1, b.y1);
  const interX2 = Math.min(a.x2, b.x2);
  const interY2 = Math.min(a.y2, b.y2);
  const interArea =
    Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const unionArea = areaA + areaB - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

function nonMaxSuppression(
  boxes: DetectionPrediction[],
  iouThreshold: number
): DetectionPrediction[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: DetectionPrediction[] = [];
  for (const cand of sorted) {
    let suppressed = false;
    for (const prev of kept) {
      if (prev.class_id === cand.class_id && iouScore(prev, cand) > iouThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) kept.push(cand);
  }
  return kept;
}

const COCO_KEYPOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
];

const POSE_SKELETON_EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [1, 3], [2, 4],
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
];

const BOX_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#ef4444',
];

function colorForClass(classId: number): string {
  return BOX_COLORS[Math.abs(classId) % BOX_COLORS.length];
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function extractMaskPolygonFromPrototypes(
  maskCoeffs: number[],
  protoData: Float32Array,
  protoC: number,
  protoH: number,
  protoW: number,
  box: { x1: number; y1: number; x2: number; y2: number },
  targetW: number,
  targetH: number,
  padX: number,
  padY: number,
  scale: number
): Array<{ x: number; y: number }> {
  const bx1 = Math.max(0, Math.floor(((box.x1 * scale + padX) / targetW) * protoW));
  const by1 = Math.max(0, Math.floor(((box.y1 * scale + padY) / targetH) * protoH));
  const bx2 = Math.min(protoW - 1, Math.ceil(((box.x2 * scale + padX) / targetW) * protoW));
  const by2 = Math.min(protoH - 1, Math.ceil(((box.y2 * scale + padY) / targetH) * protoH));

  const boundaryPts: Array<{ x: number; y: number }> = [];
  const mhArea = protoH * protoW;

  for (let my = by1; my <= by2; my++) {
    let rowLeft = -1;
    let rowRight = -1;
    for (let mx = bx1; mx <= bx2; mx++) {
      let sum = 0;
      for (let k = 0; k < protoC; k++) {
        sum += maskCoeffs[k] * protoData[k * mhArea + my * protoW + mx];
      }
      if (sigmoid(sum) > 0.5) {
        if (rowLeft === -1) rowLeft = mx;
        rowRight = mx;
      }
    }
    if (rowLeft !== -1) {
      const ixLeft = Math.round(((rowLeft / protoW) * targetW - padX) / scale);
      const iy = Math.round(((my / protoH) * targetH - padY) / scale);
      boundaryPts.push({ x: ixLeft, y: iy });
    }
  }

  // Right edge bottom-to-top to form closed contour
  for (let my = by2; my >= by1; my--) {
    let rowRight = -1;
    for (let mx = bx2; mx >= bx1; mx--) {
      let sum = 0;
      for (let k = 0; k < protoC; k++) {
        sum += maskCoeffs[k] * protoData[k * mhArea + my * protoW + mx];
      }
      if (sigmoid(sum) > 0.5) {
        rowRight = mx;
        break;
      }
    }
    if (rowRight !== -1) {
      const ixRight = Math.round(((rowRight / protoW) * targetW - padX) / scale);
      const iy = Math.round(((my / protoH) * targetH - padY) / scale);
      boundaryPts.push({ x: ixRight, y: iy });
    }
  }

  if (boundaryPts.length <= 24) return boundaryPts;
  const step = Math.ceil(boundaryPts.length / 24);
  return boundaryPts.filter((_, idx) => idx % step === 0);
}

export async function runYoloInference(options: {
  imageBuffer: Buffer;
  model: ModelRecord;
  confidence: number;
  iou: number;
}): Promise<YoloInferenceResult> {
  const { imageBuffer, model, confidence, iou } = options;

  if (model.format !== 'onnx') {
    throw new Error(
      `Model "${model.name}" is in PyTorch (.pt) format. Export it to ONNX (.onnx) to execute inference on the local CPU ONNX Runtime engine.`
    );
  }

  try {
    await fs.access(model.storagePath);
  } catch {
    throw new Error(
      `Model file not found on disk at "${model.storagePath}". Re-upload the .onnx model in the Model Registry.`
    );
  }

  const start = Date.now();
  const meta = await sharp(imageBuffer).metadata();
  const origW = meta.width ?? 640;
  const origH = meta.height ?? 480;

  const targetH = model.inputShape[2] ?? 640;
  const targetW = model.inputShape[3] ?? 640;

  const scale = Math.min(targetW / origW, targetH / origH);
  const resizedW = Math.round(origW * scale);
  const resizedH = Math.round(origH * scale);
  const padX = Math.floor((targetW - resizedW) / 2);
  const padY = Math.floor((targetH - resizedH) / 2);

  const { data } = await sharp(imageBuffer)
    .resize(resizedW, resizedH, { fit: 'fill' })
    .extend({
      top: padY,
      bottom: targetH - resizedH - padY,
      left: padX,
      right: targetW - resizedW - padX,
      background: { r: 114, g: 114, b: 114, alpha: 1 },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = targetW * targetH;
  const floatData = new Float32Array(3 * totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    floatData[i] = data[i * 3] / 255.0;
    floatData[totalPixels + i] = data[i * 3 + 1] / 255.0;
    floatData[2 * totalPixels + i] = data[i * 3 + 2] / 255.0;
  }

  const session = await getOnnxSession(model.storagePath);
  const inputName = session.inputNames[0];
  const tensor = new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);
  const outputs = await session.run({ [inputName]: tensor });

  const firstOut = outputs[session.outputNames[0]];
  const outDims = firstOut.dims;
  const outData = firstOut.data as Float32Array;
  const classNames = model.classNames;

  const protoOut =
    session.outputNames.length >= 2 ? outputs[session.outputNames[1]] : null;

  interface CandidateWithMask {
    pred: DetectionPrediction;
    maskCoeffs?: number[];
  }
  const candidates: CandidateWithMask[] = [];

  if (outDims.length === 3) {
    const dim1 = Number(outDims[1]);
    const dim2 = Number(outDims[2]);

    // YOLOv8/v11 format: [1, 4 + num_classes (+ extra), num_anchors]
    if (dim1 < dim2) {
      const numChannels = dim1;
      const numAnchors = dim2;
      const hasSegProto = Boolean(protoOut && protoOut.dims.length === 4);
      const segChannels = hasSegProto ? Number(protoOut!.dims[1]) : 0;
      const poseChannels = model.task === 'pose' && numChannels >= 56 ? 51 : 0;
      const numClasses = Math.max(
        1,
        Math.min(classNames.length, numChannels - 4 - segChannels - poseChannels)
      );

      for (let a = 0; a < numAnchors; a++) {
        let bestScore = 0;
        let bestCls = 0;
        for (let c = 0; c < numClasses; c++) {
          const score = outData[(4 + c) * numAnchors + a];
          if (score > bestScore) {
            bestScore = score;
            bestCls = c;
          }
        }
        if (bestScore < confidence) continue;

        const cx = outData[0 * numAnchors + a];
        const cy = outData[1 * numAnchors + a];
        const bw = outData[2 * numAnchors + a];
        const bh = outData[3 * numAnchors + a];

        const x1 = Math.max(0, (cx - bw / 2 - padX) / scale);
        const y1 = Math.max(0, (cy - bh / 2 - padY) / scale);
        const x2 = Math.min(origW, (cx + bw / 2 - padX) / scale);
        const y2 = Math.min(origH, (cy + bh / 2 - padY) / scale);
        if (x2 <= x1 || y2 <= y1) continue;

        const pred: DetectionPrediction = {
          detection_id: crypto.randomUUID().slice(0, 8),
          class: classNames[bestCls] ?? `class_${bestCls}`,
          class_id: bestCls,
          confidence: Number(bestScore.toFixed(4)),
          x: Math.round((x1 + x2) / 2),
          y: Math.round((y1 + y2) / 2),
          width: Math.round(x2 - x1),
          height: Math.round(y2 - y1),
          x1: Math.round(x1),
          y1: Math.round(y1),
          x2: Math.round(x2),
          y2: Math.round(y2),
        };

        let maskCoeffs: number[] | undefined;
        if (hasSegProto && segChannels > 0) {
          maskCoeffs = [];
          const maskStart = 4 + numClasses;
          for (let m = 0; m < segChannels && maskStart + m < numChannels; m++) {
            maskCoeffs.push(outData[(maskStart + m) * numAnchors + a]);
          }
        } else if (poseChannels === 51) {
          const kpts: Array<{
            x: number;
            y: number;
            confidence: number;
            name: string;
          }> = [];
          const kptStart = 4 + numClasses;
          for (let k = 0; k < 17 && kptStart + k * 3 + 2 < numChannels; k++) {
            const kx = (outData[(kptStart + k * 3) * numAnchors + a] - padX) / scale;
            const ky =
              (outData[(kptStart + k * 3 + 1) * numAnchors + a] - padY) / scale;
            const kc = outData[(kptStart + k * 3 + 2) * numAnchors + a];
            kpts.push({
              x: Math.round(Math.max(0, Math.min(origW, kx))),
              y: Math.round(Math.max(0, Math.min(origH, ky))),
              confidence: Number(kc.toFixed(3)),
              name: COCO_KEYPOINT_NAMES[k] ?? `kpt_${k}`,
            });
          }
          pred.keypoints = kpts;
        }

        candidates.push({ pred, maskCoeffs });
      }
    } else {
      // YOLOv5/v10 transposed format: [1, num_anchors, 5 + num_classes]
      const numAnchors = dim1;
      const stride = dim2;
      for (let a = 0; a < numAnchors; a++) {
        const base = a * stride;
        const objConf = stride > 5 ? outData[base + 4] : 1.0;
        let bestClsScore = 0;
        let bestCls = 0;
        const clsStart = stride > 6 ? 5 : 4;
        for (let c = clsStart; c < stride; c++) {
          const s = outData[base + c] * (clsStart === 5 ? objConf : 1);
          if (s > bestClsScore) {
            bestClsScore = s;
            bestCls = c - clsStart;
          }
        }
        if (bestClsScore < confidence) continue;
        const cx = outData[base];
        const cy = outData[base + 1];
        const bw = outData[base + 2];
        const bh = outData[base + 3];
        const x1 = Math.max(0, (cx - bw / 2 - padX) / scale);
        const y1 = Math.max(0, (cy - bh / 2 - padY) / scale);
        const x2 = Math.min(origW, (cx + bw / 2 - padX) / scale);
        const y2 = Math.min(origH, (cy + bh / 2 - padY) / scale);
        if (x2 <= x1 || y2 <= y1) continue;
        candidates.push({
          pred: {
            detection_id: crypto.randomUUID().slice(0, 8),
            class: classNames[bestCls] ?? `class_${bestCls}`,
            class_id: bestCls,
            confidence: Number(bestClsScore.toFixed(4)),
            x: Math.round((x1 + x2) / 2),
            y: Math.round((y1 + y2) / 2),
            width: Math.round(x2 - x1),
            height: Math.round(y2 - y1),
            x1: Math.round(x1),
            y1: Math.round(y1),
            x2: Math.round(x2),
            y2: Math.round(y2),
          },
        });
      }
    }
  }

  const keptPreds = nonMaxSuppression(
    candidates.map((c) => c.pred),
    iou
  ).slice(0, 100);

  // Decode segmentation mask polygons only for surviving NMS detections
  if (protoOut && protoOut.dims.length === 4) {
    const protoC = Number(protoOut.dims[1]);
    const protoH = Number(protoOut.dims[2]);
    const protoW = Number(protoOut.dims[3]);
    const protoData = protoOut.data as Float32Array;
    const coeffById = new Map(
      candidates.map((c) => [c.pred.detection_id, c.maskCoeffs])
    );
    for (const p of keptPreds) {
      const coeffs = coeffById.get(p.detection_id);
      if (coeffs && coeffs.length === protoC) {
        p.points = extractMaskPolygonFromPrototypes(
          coeffs,
          protoData,
          protoC,
          protoH,
          protoW,
          p,
          targetW,
          targetH,
          padX,
          padY,
          scale
        );
      }
    }
  }

  return {
    inference_id: crypto.randomUUID().slice(0, 12),
    model: model.name,
    task: model.task,
    engine: 'onnxruntime-node',
    image: { width: origW, height: origH },
    predictions: keptPreds,
    durationMs: Date.now() - start,
  };
}

export interface AnnotationLayerOptions {
  drawBoxes?: boolean;
  boxThickness?: number;
  boxRoundness?: number;
  drawLabels?: boolean;
  textDisplay?: 'class_and_confidence' | 'class_only' | 'confidence_only';
  fontSize?: number;
  drawMasks?: boolean;
  maskOpacity?: number;
  drawKeypoints?: boolean;
  jointRadius?: number;
  zoneOverlay?: {
    mode: 'zone' | 'line';
    zone?: { x1: number; y1: number; x2: number; y2: number };
    line?: { x1: number; y1: number; x2: number; y2: number };
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderAnnotatedImage(
  imageBuffer: Buffer,
  predictions: DetectionPrediction[],
  layers: AnnotationLayerOptions
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 640;
  const height = meta.height ?? 480;

  const svgParts: string[] = [];

  if (layers.zoneOverlay) {
    if (layers.zoneOverlay.mode === 'zone' && layers.zoneOverlay.zone) {
      const z = layers.zoneOverlay.zone;
      const zx = Math.round(z.x1 * width);
      const zy = Math.round(z.y1 * height);
      const zw = Math.round((z.x2 - z.x1) * width);
      const zh = Math.round((z.y2 - z.y1) * height);
      svgParts.push(
        `<rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="#f59e0b" fill-opacity="0.14" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="8 6" />`
      );
    } else if (layers.zoneOverlay.mode === 'line' && layers.zoneOverlay.line) {
      const l = layers.zoneOverlay.line;
      svgParts.push(
        `<line x1="${Math.round(l.x1 * width)}" y1="${Math.round(l.y1 * height)}" x2="${Math.round(l.x2 * width)}" y2="${Math.round(l.y2 * height)}" stroke="#f59e0b" stroke-width="3" stroke-dasharray="8 5" />`
      );
    }
  }

  for (const pred of predictions) {
    const color = colorForClass(pred.class_id);

    if (layers.drawMasks && pred.points && pred.points.length >= 3) {
      const pts = pred.points.map((p) => `${p.x},${p.y}`).join(' ');
      const opacity = layers.maskOpacity ?? 0.4;
      svgParts.push(
        `<polygon points="${pts}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="2" />`
      );
    }

    if (layers.drawBoxes) {
      const strokeW = layers.boxThickness ?? 2;
      const rx = layers.boxRoundness ?? 3;
      svgParts.push(
        `<rect x="${pred.x1}" y="${pred.y1}" width="${pred.width}" height="${pred.height}" rx="${rx}" fill="none" stroke="${color}" stroke-width="${strokeW}" />`
      );
    }

    if (layers.drawKeypoints && pred.keypoints && pred.keypoints.length > 0) {
      const r = layers.jointRadius ?? 4;
      for (const [a, b] of POSE_SKELETON_EDGES) {
        const ka = pred.keypoints[a];
        const kb = pred.keypoints[b];
        if (ka && kb && ka.confidence > 0.3 && kb.confidence > 0.3) {
          svgParts.push(
            `<line x1="${ka.x}" y1="${ka.y}" x2="${kb.x}" y2="${kb.y}" stroke="#22d3ee" stroke-width="2" />`
          );
        }
      }
      for (const kp of pred.keypoints) {
        if (kp.confidence > 0.3) {
          svgParts.push(
            `<circle cx="${kp.x}" cy="${kp.y}" r="${r}" fill="#f43f5e" stroke="#ffffff" stroke-width="1.5" />`
          );
        }
      }
    }

    if (layers.drawLabels) {
      const fontSize = layers.fontSize ?? 13;
      const confPct = `${Math.round(pred.confidence * 100)}%`;
      const text =
        layers.textDisplay === 'class_only'
          ? pred.class
          : layers.textDisplay === 'confidence_only'
            ? confPct
            : `${pred.class} ${confPct}`;
      const padX = 6;
      const boxH = fontSize + 8;
      const boxW = Math.max(
        42,
        Math.round(text.length * (fontSize * 0.62) + padX * 2)
      );
      const labelY = Math.max(0, pred.y1 - boxH);
      svgParts.push(
        `<rect x="${pred.x1}" y="${labelY}" width="${boxW}" height="${boxH}" rx="3" fill="${color}" />`
      );
      svgParts.push(
        `<text x="${pred.x1 + padX}" y="${labelY + fontSize + 1}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff">${escapeXml(text)}</text>`
      );
    }
  }

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svgParts.join('')}</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}
