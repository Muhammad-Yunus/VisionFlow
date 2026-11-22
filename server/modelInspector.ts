import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as ort from 'onnxruntime-node';
import AdmZip from 'adm-zip';
import { COCO_80_CLASSES } from '../src/shared/workflowSchema.ts';

const execFileAsync = promisify(execFile);

export interface InspectedModelInfo {
  format: 'onnx' | 'pt';
  task: 'detect' | 'segment' | 'pose';
  classNames: string[];
  inputShape: number[];
  extractionSource: string;
}

function parsePythonDictNames(rawText: string): string[] | null {
  // Match Ultralytics ONNX metadata format: "{0: 'person', 1: 'bicycle', ...}"
  const dictMatch = rawText.match(/\{(?:\s*\d+\s*:\s*['"][^'"]+['"]\s*,?)+\s*\}/);
  if (!dictMatch) return null;

  const entries: Array<{ idx: number; label: string }> = [];
  const pairRegex = /(\d+)\s*:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = pairRegex.exec(dictMatch[0])) !== null) {
    entries.push({ idx: Number(m[1]), label: m[2] });
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => a.idx - b.idx);
  return entries.map((e) => e.label);
}

function parseJsonArrayNames(rawText: string): string[] | null {
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      const keys = Object.keys(parsed)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b));
      if (keys.length > 0) {
        return keys.map((k) => String((parsed as Record<string, unknown>)[k]));
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function inspectOnnxModel(filePath: string): Promise<InspectedModelInfo> {
  let inputShape = [1, 3, 640, 640];
  let task: 'detect' | 'segment' | 'pose' = 'detect';
  let inferredNumClasses = 80;

  try {
    const session = await ort.InferenceSession.create(filePath, {
      executionProviders: ['cpu'],
    });

    const inMeta = session.inputMetadata;
    const firstInputMeta = Array.isArray(inMeta) ? inMeta[0] : undefined;
    const rawDims =
      firstInputMeta && 'shape' in firstInputMeta
        ? firstInputMeta.shape
        : undefined;
    if (Array.isArray(rawDims) && rawDims.length === 4) {
      inputShape = rawDims.map((d, idx) =>
        typeof d === 'number' && d > 0 ? d : idx === 0 ? 1 : idx === 1 ? 3 : 640
      );
    }

    const outMeta = session.outputMetadata;
    const outputNames = session.outputNames;
    if (outputNames.length >= 2) {
      task = 'segment';
    }
    const firstOutMeta = Array.isArray(outMeta) ? outMeta[0] : undefined;
    const firstOutDims =
      firstOutMeta && 'shape' in firstOutMeta ? firstOutMeta.shape : undefined;
    if (Array.isArray(firstOutDims) && firstOutDims.length === 3) {
      const ch = Number(firstOutDims[1]);
      if (Number.isFinite(ch) && ch > 4) {
        if (task === 'segment' && ch > 36) {
          inferredNumClasses = ch - 36;
        } else if (ch === 56) {
          task = 'pose';
          inferredNumClasses = 1;
        } else {
          inferredNumClasses = ch - 4;
        }
      }
    }
    await session.release();
  } catch {
    // Even if ORT session cannot load custom ops, continue binary metadata extraction
  }

  // Scan ONNX protobuf strings for Ultralytics metadata_props (`names`, `task`)
  const buffer = await fs.readFile(filePath);
  const textSample = buffer.toString('latin1');
  let extractedNames: string[] | null = null;
  let extractionSource = 'onnx-tensor-fallback';

  const namesPos = textSample.indexOf('names');
  if (namesPos !== -1) {
    const windowStr = textSample.slice(namesPos, namesPos + 8192);
    extractedNames =
      parsePythonDictNames(windowStr) ?? parseJsonArrayNames(windowStr);
    if (extractedNames) {
      extractionSource = 'onnx-metadata-props';
    }
  }

  if (!extractedNames) {
    // Search anywhere in metadata tail (protobuf metadata_props are usually at end of file)
    const tail = textSample.slice(Math.max(0, textSample.length - 65536));
    extractedNames = parsePythonDictNames(tail);
    if (extractedNames) {
      extractionSource = 'onnx-protobuf-tail';
    }
  }

  if (textSample.includes('segment') || textSample.includes('-seg')) {
    task = 'segment';
  } else if (textSample.includes('pose') || textSample.includes('-pose')) {
    task = 'pose';
  }

  if (!extractedNames) {
    if (inferredNumClasses === 80) {
      extractedNames = COCO_80_CLASSES;
      extractionSource = 'coco-80-default';
    } else if (task === 'pose' && inferredNumClasses === 1) {
      extractedNames = ['person'];
      extractionSource = 'yolo-pose-default';
    } else {
      const count = Math.max(1, Math.min(inferredNumClasses, 512));
      extractedNames = Array.from({ length: count }, (_, i) => `class_${i}`);
    }
  }

  return {
    format: 'onnx',
    task,
    classNames: extractedNames,
    inputShape,
    extractionSource,
  };
}

async function inspectPtModel(filePath: string): Promise<InspectedModelInfo> {
  let task: 'detect' | 'segment' | 'pose' = 'detect';
  const filename = path.basename(filePath).toLowerCase();
  if (filename.includes('seg')) task = 'segment';
  if (filename.includes('pose')) task = 'pose';

  // Safe pickle opcode scanner via Python stdlib pickletools (never executes pickle.loads!)
  const pythonInspector = `
import sys, zipfile, pickletools, json

pt_path = sys.argv[1]
names = []
detected_task = None

try:
    with zipfile.ZipFile(pt_path, 'r') as zf:
        pkl_entries = [n for n in zf.namelist() if n.endswith('data.pkl') or n.endswith('.pkl')]
        for entry in pkl_entries[:2]:
            data = zf.read(entry)
            strings = []
            ints = []
            # Scan opcodes safely without executing code
            try:
                for opcode, arg, _pos in pickletools.genops(data[:2_500_000]):
                    if isinstance(arg, str):
                        strings.append(arg)
                    elif isinstance(arg, int):
                        ints.append(arg)
            except Exception:
                pass

            # Look for Ultralytics 'names' marker or 'nc'
            for idx, s in enumerate(strings):
                if s in ('segment', 'pose', 'detect') and detected_task is None:
                    detected_task = s
                if s == 'names':
                    # Collect contiguous short class-like strings following 'names'
                    cand = []
                    for nxt in strings[idx+1:idx+120]:
                        if nxt in ('yaml', 'model', 'nc', 'ch', 'stride', 'args', 'train_args', 'task', 'epoch', 'best_fitness'):
                            break
                        if 1 <= len(nxt) <= 48 and not nxt.startswith('ultralytics') and not nxt.startswith('torch'):
                            cand.append(nxt)
                    if cand:
                        names = cand
                        break
except Exception:
    pass

print(json.dumps({"names": names, "task": detected_task}))
`;

  let extractedNames: string[] = [];
  let extractionSource = 'pt-coco-fallback';

  try {
    const { stdout } = await execFileAsync('python3', ['-c', pythonInspector, filePath], {
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });
    const parsed = JSON.parse(stdout.trim()) as {
      names?: string[];
      task?: string | null;
    };
    if (parsed.task === 'segment' || parsed.task === 'pose' || parsed.task === 'detect') {
      task = parsed.task;
    }
    if (Array.isArray(parsed.names) && parsed.names.length > 0) {
      extractedNames = parsed.names;
      extractionSource = 'pt-pickle-opcodes';
    }
  } catch {
    // Fallback to AdmZip raw string scan in Node.js
    try {
      const zip = new AdmZip(filePath);
      const pklEntry = zip
        .getEntries()
        .find((e) => e.entryName.endsWith('data.pkl'));
      if (pklEntry) {
        const raw = pklEntry.getData().toString('latin1');
        const dictNames = parsePythonDictNames(raw);
        if (dictNames && dictNames.length > 0) {
          extractedNames = dictNames;
          extractionSource = 'pt-zip-string-scan';
        }
      }
    } catch {
      // ignore
    }
  }

  if (extractedNames.length === 0) {
    extractedNames = task === 'pose' ? ['person'] : COCO_80_CLASSES;
  }

  return {
    format: 'pt',
    task,
    classNames: extractedNames,
    inputShape: [1, 3, 640, 640],
    extractionSource,
  };
}

export async function inspectModelFile(
  filePath: string,
  format: 'onnx' | 'pt'
): Promise<InspectedModelInfo> {
  if (format === 'onnx') {
    return inspectOnnxModel(filePath);
  }
  return inspectPtModel(filePath);
}
