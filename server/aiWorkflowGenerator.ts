import { z } from 'zod';
import {
  WORKFLOW_BLOCKS,
  getBlockSpec,
  type FieldDataType,
  type WorkflowDefinition,
  type WorkflowEdgeDef,
  type WorkflowNodeDef,
  type WorkflowNodeKind,
  type WorkflowOutputMapping,
} from '../src/shared/workflowSchema.ts';
import type { ModelRecord } from './store.ts';
import { topologicalSortNodes } from './dagEngine.ts';

const ALLOWED_STEP_KINDS: WorkflowNodeKind[] = [
  'yolo_detection',
  'yolo_segmentation',
  'yolo_pose',
  'bounding_box_visualization',
  'label_visualization',
  'mask_visualization',
  'keypoint_visualization',
  'object_counter',
  'class_filter',
  'line_crossing',
  'condition',
  'webhook_sink',
  'mqtt_sink',
  'modbus_sink',
];

const aiGeneratedOutputSchema = z.object({
  name: z.string().min(1).max(64),
  value: z.string().min(1).max(160),
  dataType: z
    .enum(['image', 'predictions', 'number', 'string', 'boolean', 'any'])
    .optional(),
});

const aiGeneratedNodeSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.string().min(1),
  name: z.string().min(1).max(64),
  subtitle: z.string().max(120).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const aiGeneratedEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
});

const aiGeneratedWorkflowSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  nodes: z.array(aiGeneratedNodeSchema).min(1).max(20),
  edges: z.array(aiGeneratedEdgeSchema).max(40),
  outputs: z.array(aiGeneratedOutputSchema).max(12).optional(),
});

export function getAiGeneratorStatus(): {
  configured: boolean;
  model: string | null;
} {
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.AI_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  return {
    configured: Boolean(baseUrl && apiKey && model),
    model: model || null,
  };
}

function resolveChatCompletionsEndpoint(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AI_BASE_URL must use http:// or https:// protocol.');
  }
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function extractJsonObject(rawText: string): unknown {
  const cleaned = rawText.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try extracting fenced JSON block or outermost { ... }
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch?.[1]) {
      return JSON.parse(fenceMatch[1].trim());
    }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('AI model did not return a valid JSON workflow object.');
  }
}

function sanitizeIdentifier(raw: string, fallback: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return normalized || fallback;
}

function buildAutoLayoutPositions(
  nodes: WorkflowNodeDef[],
  edges: WorkflowEdgeDef[]
): WorkflowNodeDef[] {
  const levels = new Map<string, number>();
  nodes.forEach((n) => levels.set(n.id, 0));

  for (let i = 0; i < nodes.length; i++) {
    for (const e of edges) {
      const srcLvl = levels.get(e.source) ?? 0;
      const tgtLvl = levels.get(e.target) ?? 0;
      if (tgtLvl <= srcLvl) {
        levels.set(e.target, srcLvl + 1);
      }
    }
  }

  // Ensure outputs anchor sits at bottom level
  const maxStepLvl = Math.max(
    1,
    ...nodes
      .filter((n) => n.kind !== 'outputs')
      .map((n) => levels.get(n.id) ?? 0)
  );
  levels.set('outputs', maxStepLvl + 1);

  const byLevel = new Map<number, WorkflowNodeDef[]>();
  for (const n of nodes) {
    const lvl = levels.get(n.id) ?? 0;
    const list = byLevel.get(lvl) ?? [];
    list.push(n);
    byLevel.set(lvl, list);
  }

  return nodes.map((n) => {
    const lvl = levels.get(n.id) ?? 0;
    const peers = byLevel.get(lvl) ?? [n];
    const idx = peers.findIndex((p) => p.id === n.id);
    const totalW = peers.length * 300;
    const startX = 400 - totalW / 2 + 25;
    return {
      ...n,
      position: {
        x: Math.round(startX + idx * 300),
        y: 25 + lvl * 155,
      },
    };
  });
}

function sanitizeAndNormalizeDefinition(
  raw: z.infer<typeof aiGeneratedWorkflowSchema>,
  models: ModelRecord[]
): { name: string; description: string; definition: WorkflowDefinition } {
  const inputsNode: WorkflowNodeDef = {
    id: 'inputs',
    kind: 'inputs',
    name: 'Inputs',
    subtitle: 'Data your workflow needs to run',
    category: 'inputs',
    position: { x: 280, y: 25 },
    params: { sourceType: 'image_upload' },
  };

  const outputsNode: WorkflowNodeDef = {
    id: 'outputs',
    kind: 'outputs',
    name: 'Outputs',
    subtitle: 'Results your workflow returns',
    category: 'outputs_sinks',
    position: { x: 280, y: 650 },
    params: {},
  };

  const idRemap = new Map<string, string>();
  const usedIds = new Set<string>(['inputs', 'outputs']);
  const usedNames = new Set<string>(['Inputs', 'Outputs', 'inputs', 'outputs']);
  const stepNodes: WorkflowNodeDef[] = [];

  for (const rawNode of raw.nodes) {
    if (rawNode.kind === 'inputs') {
      idRemap.set(rawNode.id, 'inputs');
      continue;
    }
    if (rawNode.kind === 'outputs') {
      idRemap.set(rawNode.id, 'outputs');
      continue;
    }
    if (!ALLOWED_STEP_KINDS.includes(rawNode.kind as WorkflowNodeKind)) {
      continue;
    }

    const kind = rawNode.kind as WorkflowNodeKind;
    const spec = getBlockSpec(kind);

    let safeId = sanitizeIdentifier(rawNode.id, spec.defaultName);
    if (usedIds.has(safeId)) {
      safeId = `${safeId}_${stepNodes.length + 1}`;
    }
    usedIds.add(safeId);
    idRemap.set(rawNode.id, safeId);

    let safeName = sanitizeIdentifier(rawNode.name, spec.defaultName);
    if (usedNames.has(safeName)) {
      safeName = `${safeName}_${stepNodes.length + 1}`;
    }
    usedNames.add(safeName);

    const mergedParams: Record<string, unknown> = {
      ...spec.defaultParams,
      ...(rawNode.params ?? {}),
    };

    let subtitle = rawNode.subtitle?.trim() || spec.defaultSubtitle;

    if (
      kind === 'yolo_detection' ||
      kind === 'yolo_segmentation' ||
      kind === 'yolo_pose'
    ) {
      const desiredTask =
        kind === 'yolo_segmentation'
          ? 'segment'
          : kind === 'yolo_pose'
            ? 'pose'
            : 'detect';
      const requestedModelName =
        typeof mergedParams.modelName === 'string'
          ? mergedParams.modelName.trim()
          : '';
      const matched =
        models.find((m) => m.id === mergedParams.modelId) ??
        models.find((m) => m.name === requestedModelName) ??
        models.find((m) => m.task === desiredTask && m.format === 'onnx') ??
        models.find((m) => m.format === 'onnx') ??
        models[0];

      if (matched) {
        mergedParams.modelId = matched.id;
        mergedParams.modelName = matched.name;
        subtitle = matched.name;
      }
    }

    stepNodes.push({
      id: safeId,
      kind,
      name: safeName,
      subtitle,
      category: spec.category,
      position: { x: 280, y: 180 + stepNodes.length * 140 },
      params: mergedParams,
    });
  }

  // Fallback: ensure at least a YOLO detection node exists if AI skipped all steps
  if (stepNodes.length === 0) {
    const spec = getBlockSpec('yolo_detection');
    const defaultModel =
      models.find((m) => m.format === 'onnx') ?? models[0];
    stepNodes.push({
      id: 'model',
      kind: 'yolo_detection',
      name: 'model',
      subtitle: defaultModel?.name ?? spec.defaultSubtitle,
      category: 'model',
      position: { x: 280, y: 180 },
      params: {
        ...spec.defaultParams,
        ...(defaultModel
          ? { modelId: defaultModel.id, modelName: defaultModel.name }
          : {}),
      },
    });
  }

  const allNodes = [inputsNode, ...stepNodes, outputsNode];
  const validNodeIds = new Set(allNodes.map((n) => n.id));

  // Map and deduplicate edges while blocking cycles
  const seenEdges = new Set<string>();
  const cleanEdges: WorkflowEdgeDef[] = [];

  for (const rawEdge of raw.edges) {
    const source = idRemap.get(rawEdge.source) ?? rawEdge.source;
    const target = idRemap.get(rawEdge.target) ?? rawEdge.target;
    if (
      !validNodeIds.has(source) ||
      !validNodeIds.has(target) ||
      source === target ||
      source === 'outputs' ||
      target === 'inputs'
    ) {
      continue;
    }
    const edgeKey = `${source}->${target}`;
    if (seenEdges.has(edgeKey)) continue;

    // Test whether adding edge preserves DAG acyclicity
    const candidateEdges: WorkflowEdgeDef[] = [
      ...cleanEdges,
      { id: `e-${source}-${target}`, source, target },
    ];
    try {
      topologicalSortNodes({
        version: '1.0',
        inputs: [],
        nodes: allNodes,
        edges: candidateEdges,
        outputs: [],
      });
      seenEdges.add(edgeKey);
      cleanEdges.push({ id: `e-${source}-${target}`, source, target });
    } catch {
      // Drop cycle-inducing edge
    }
  }

  // Ensure every step node has at least one incoming edge and leaf steps wire into outputs
  for (const step of stepNodes) {
    const hasIncoming = cleanEdges.some((e) => e.target === step.id);
    if (!hasIncoming) {
      cleanEdges.push({
        id: `e-inputs-${step.id}`,
        source: 'inputs',
        target: step.id,
      });
    }
  }
  for (const step of stepNodes) {
    const hasOutgoing = cleanEdges.some((e) => e.source === step.id);
    if (!hasOutgoing) {
      cleanEdges.push({
        id: `e-${step.id}-outputs`,
        source: step.id,
        target: 'outputs',
      });
    }
  }

  const positionedNodes = buildAutoLayoutPositions(allNodes, cleanEdges);

  // Build valid outputs mappings
  const validStepNames = new Set(stepNodes.map((n) => n.name));
  const cleanOutputs: WorkflowOutputMapping[] = [];
  for (const out of raw.outputs ?? []) {
    const refScope = out.value.split('.')[0];
    if (
      refScope !== 'inputs' &&
      !validStepNames.has(refScope) &&
      !validNodeIds.has(refScope)
    ) {
      continue;
    }
    cleanOutputs.push({
      id: `out-${cleanOutputs.length + 1}`,
      name: sanitizeIdentifier(out.name, `output_${cleanOutputs.length + 1}`),
      value: out.value,
      dataType: (out.dataType ?? 'any') as FieldDataType,
    });
  }

  if (cleanOutputs.length === 0) {
    const firstViz = stepNodes.find((n) => n.category === 'visualization');
    const firstModel = stepNodes.find((n) => n.category === 'model');
    const firstCounter = stepNodes.find((n) => n.kind === 'object_counter');
    if (firstCounter) {
      cleanOutputs.push({
        id: 'out-count',
        name: 'count',
        value: `${firstCounter.name}.output`,
        dataType: 'number',
      });
    }
    if (firstViz) {
      cleanOutputs.push({
        id: 'out-image',
        name: 'output_image',
        value: `${firstViz.name}.image`,
        dataType: 'image',
      });
    }
    if (firstModel) {
      cleanOutputs.push({
        id: 'out-predictions',
        name: 'predictions',
        value: `${firstModel.name}.predictions`,
        dataType: 'predictions',
      });
    }
  }

  return {
    name: raw.name.trim().slice(0, 120),
    description: raw.description?.trim().slice(0, 500) ?? '',
    definition: {
      version: '1.0',
      inputs: [
        {
          id: 'input-image',
          name: 'image',
          type: 'image',
          sourceHint: 'upload',
        },
      ],
      nodes: positionedNodes,
      edges: cleanEdges,
      outputs: cleanOutputs,
    },
  };
}

export async function generateWorkflowWithAi(opts: {
  prompt: string;
  customName?: string;
  models: ModelRecord[];
}): Promise<{
  name: string;
  description: string;
  definition: WorkflowDefinition;
}> {
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.AI_KEY?.trim();
  const aiModel = process.env.AI_MODEL?.trim();

  if (!baseUrl || !apiKey || !aiModel) {
    throw new Error(
      'AI Workflow Generator is not configured. Set AI_BASE_URL, AI_KEY, and AI_MODEL in Settings -> Secrets.'
    );
  }

  const endpoint = resolveChatCompletionsEndpoint(baseUrl);

  const catalogGuide = WORKFLOW_BLOCKS.filter(
    (b) => b.kind !== 'inputs' && b.kind !== 'outputs'
  ).map((b) => ({
    kind: b.kind,
    title: b.title,
    defaultName: b.defaultName,
    defaultParams: b.defaultParams,
    inputPorts: b.inputPorts.map((p) => `${p.key} (${p.dataType})`),
    outputPorts: b.outputPorts.map((p) => `${p.key} (${p.dataType})`),
  }));

  const registeredModelsSummary = opts.models.map((m) => ({
    id: m.id,
    name: m.name,
    format: m.format,
    task: m.task,
    sampleClasses: m.classNames.slice(0, 20),
  }));

  const systemPrompt = [
    'You are an expert Computer Vision DAG Architect for VisionFlow.',
    'Given a user request, design a valid VisionFlow DAG workflow JSON.',
    'Return ONLY a single JSON object (no markdown commentary) with this exact schema:',
    '{',
    '  "name": "Short descriptive workflow name",',
    '  "description": "1 sentence explaining what the pipeline detects, analyzes, and outputs",',
    '  "nodes": [',
    '    { "id": "inputs", "kind": "inputs", "name": "Inputs" },',
    '    { "id": "model", "kind": "<kind>", "name": "<snake_case_step_name>", "subtitle": "<label>", "params": { ... } },',
    '    { "id": "outputs", "kind": "outputs", "name": "Outputs" }',
    '  ],',
    '  "edges": [ { "source": "inputs", "target": "model" }, ... ],',
    '  "outputs": [ { "name": "output_image", "value": "annotated_image.image", "dataType": "image" }, ... ]',
    '}',
    '',
    'Allowed step node kinds, params, and ports:',
    JSON.stringify(catalogGuide, null, 2),
    '',
    'Registered local YOLO models currently in PostgreSQL:',
    JSON.stringify(registeredModelsSummary, null, 2),
    '',
    'Rules:',
    '1. Always include node "inputs" at the start and node "outputs" at the end.',
    '2. Reference upstream outputs strictly using "<nodeName>.<outputPortKey>" (for example "inputs.image", "model.predictions", "vehicle_filter.predictions", "bbox_viz.image", "count_objects.output").',
    '3. Keep step node "name" unique snake_case identifiers (letters, numbers, underscores).',
    '4. When rendering labels on top of bounding boxes, chain bounding_box_visualization -> label_visualization (passing bbox node ".image" to label node "image") so both boxes and labels appear on the output image.',
    '5. When using class_filter, populate params.classes with relevant COCO class names (e.g. "person", "car", "truck", "bus", "motorcycle", "bicycle", "bottle", "cup", "dog", "cat", "chair", "laptop", "cell phone").',
    '6. Keep edges strictly acyclic (top-to-bottom DAG).',
  ].join('\n');

  const userMessage = opts.customName?.trim()
    ? `Workflow Name Preference: "${opts.customName.trim()}"\nUser Request: ${opts.prompt.trim()}`
    : `User Request: ${opts.prompt.trim()}`;

  const callLlm = async (useJsonFormat: boolean) => {
    const body: Record<string, unknown> = {
      model: aiModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    };
    if (useJsonFormat) {
      body.response_format = { type: 'json_object' };
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
  };

  let resp = await callLlm(true);
  if (resp.status === 400) {
    // Some OpenAI-compatible models/providers reject response_format
    resp = await callLlm(false);
  }

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(
      `AI endpoint returned HTTP ${resp.status}${errBody ? `: ${errBody.slice(0, 180)}` : ''}`
    );
  }

  const payload = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('AI endpoint returned an empty completion.');
  }

  const parsedJson = extractJsonObject(content);
  const validated = aiGeneratedWorkflowSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new Error(
      `AI response did not match workflow schema: ${validated.error.issues[0]?.message ?? 'invalid structure'}`
    );
  }

  const result = sanitizeAndNormalizeDefinition(validated.data, opts.models);
  if (opts.customName?.trim()) {
    result.name = opts.customName.trim().slice(0, 120);
  }
  return result;
}
