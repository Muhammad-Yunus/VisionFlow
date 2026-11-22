export type BlockCategoryId =
  | 'inputs'
  | 'model'
  | 'visualization'
  | 'logic_video'
  | 'outputs_sinks';

export type WorkflowNodeKind =
  | 'inputs'
  | 'yolo_detection'
  | 'yolo_segmentation'
  | 'yolo_pose'
  | 'bounding_box_visualization'
  | 'label_visualization'
  | 'mask_visualization'
  | 'keypoint_visualization'
  | 'object_counter'
  | 'class_filter'
  | 'line_crossing'
  | 'condition'
  | 'outputs'
  | 'webhook_sink'
  | 'mqtt_sink'
  | 'modbus_sink';

export type FieldDataType =
  | 'image'
  | 'predictions'
  | 'number'
  | 'string'
  | 'boolean'
  | 'any';

export interface WorkflowInputField {
  id: string;
  name: string;
  type: 'image' | 'video' | 'stream';
  sourceHint?: 'upload' | 'webcam' | 'rtsp';
}

export interface WorkflowOutputMapping {
  id: string;
  name: string;
  value: string; // e.g. "count_objects.output", "annotated_image.image", "model.predictions"
  dataType: FieldDataType;
}

export interface WorkflowNodePort {
  key: string;
  label: string;
  dataType: FieldDataType;
}

export interface WorkflowNodeDef {
  id: string;
  kind: WorkflowNodeKind;
  name: string;
  subtitle?: string;
  category: BlockCategoryId;
  position: { x: number; y: number };
  disabled?: boolean;
  note?: string;
  params: Record<string, unknown>;
}

export interface WorkflowEdgeDef {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  version: '1.0';
  inputs: WorkflowInputField[];
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdgeDef[];
  outputs: WorkflowOutputMapping[];
}

export interface BlockCatalogCategory {
  id: BlockCategoryId;
  title: string;
  description: string;
  accentHex: string;
  bgTintHex: string;
  textHex: string;
}

export interface BlockCatalogItem {
  kind: WorkflowNodeKind;
  category: BlockCategoryId;
  title: string;
  description: string;
  popular?: boolean;
  defaultName: string;
  defaultSubtitle: string;
  defaultParams: Record<string, unknown>;
  inputPorts: WorkflowNodePort[];
  outputPorts: WorkflowNodePort[];
}

export const BLOCK_CATEGORIES: BlockCatalogCategory[] = [
  {
    id: 'model',
    title: 'Model',
    description: 'Run a local YOLO detection, segmentation, or pose model.',
    accentHex: '#8b5cf6',
    bgTintHex: '#f3e8ff',
    textHex: '#7c3aed',
  },
  {
    id: 'visualization',
    title: 'Visualization',
    description: 'Visualize the predictions and masks of a model.',
    accentHex: '#3b82f6',
    bgTintHex: '#dbeafe',
    textHex: '#2563eb',
  },
  {
    id: 'logic_video',
    title: 'Logic & Video',
    description: 'Count objects, filter classes, track zones, and branch flow.',
    accentHex: '#f59e0b',
    bgTintHex: '#fef3c7',
    textHex: '#d97706',
  },
  {
    id: 'inputs',
    title: 'Inputs',
    description: 'Define image upload, webcam, or RTSP video stream sources.',
    accentHex: '#475569',
    bgTintHex: '#f1f5f9',
    textHex: '#334155',
  },
  {
    id: 'outputs_sinks',
    title: 'Outputs & Sinks',
    description: 'Return JSON API payloads, annotated streams, or trigger sinks.',
    accentHex: '#db2777',
    bgTintHex: '#fce7f3',
    textHex: '#be185d',
  },
];

export const WORKFLOW_BLOCKS: BlockCatalogItem[] = [
  // Model blocks
  {
    kind: 'yolo_detection',
    category: 'model',
    title: 'Object Detection Model',
    description: 'Predict bounding boxes and classes with a local YOLO model.',
    popular: true,
    defaultName: 'model',
    defaultSubtitle: 'yolov8n.onnx',
    defaultParams: {
      image: 'inputs.image',
      modelId: 'builtin-yolov8n-detect',
      modelName: 'yolov8n.onnx',
      confidence: 0.4,
      iou: 0.45,
      classFilter: [],
    },
    inputPorts: [{ key: 'image', label: 'image', dataType: 'image' }],
    outputPorts: [
      { key: 'inference_id', label: 'inference_id', dataType: 'string' },
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
      { key: 'all_properties', label: 'all_properties', dataType: 'any' },
    ],
  },
  {
    kind: 'yolo_segmentation',
    category: 'model',
    title: 'Instance Segmentation Model',
    description: 'Predict pixel polygons, masks, and locations of objects.',
    popular: true,
    defaultName: 'seg_model',
    defaultSubtitle: 'yolov8s-seg.onnx',
    defaultParams: {
      image: 'inputs.image',
      modelId: 'builtin-yolov8s-seg',
      modelName: 'yolov8s-seg.onnx',
      confidence: 0.4,
      iou: 0.45,
      classFilter: [],
    },
    inputPorts: [{ key: 'image', label: 'image', dataType: 'image' }],
    outputPorts: [
      { key: 'inference_id', label: 'inference_id', dataType: 'string' },
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
      { key: 'all_properties', label: 'all_properties', dataType: 'any' },
    ],
  },
  {
    kind: 'yolo_pose',
    category: 'model',
    title: 'Keypoint Detection Model',
    description: 'Predict 17-point human or object skeletons and keypoints.',
    defaultName: 'pose_model',
    defaultSubtitle: 'yolov8n-pose.onnx',
    defaultParams: {
      image: 'inputs.image',
      modelId: 'builtin-yolov8n-pose',
      modelName: 'yolov8n-pose.onnx',
      confidence: 0.45,
      iou: 0.45,
    },
    inputPorts: [{ key: 'image', label: 'image', dataType: 'image' }],
    outputPorts: [
      { key: 'inference_id', label: 'inference_id', dataType: 'string' },
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
    ],
  },

  // Visualization blocks
  {
    kind: 'bounding_box_visualization',
    category: 'visualization',
    title: 'Bounding Box Visualization',
    description: 'Draw color-coded bounding boxes over detected objects.',
    popular: true,
    defaultName: 'detection_visualization',
    defaultSubtitle: 'Bounding Box Visualization',
    defaultParams: {
      image: 'inputs.image',
      predictions: 'model.predictions',
      thickness: 2,
      colorPalette: 'roboflow',
      roundness: 4,
    },
    inputPorts: [
      { key: 'image', label: 'image', dataType: 'image' },
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
    ],
    outputPorts: [
      { key: 'image', label: 'image', dataType: 'image' },
      { key: 'all_properties', label: 'all_properties', dataType: 'any' },
    ],
  },
  {
    kind: 'label_visualization',
    category: 'visualization',
    title: 'Label Visualization',
    description: 'Render class names and confidence percentages on boxes.',
    popular: true,
    defaultName: 'annotated_image',
    defaultSubtitle: 'Label Visualization',
    defaultParams: {
      image: 'detection_visualization.image',
      predictions: 'model.predictions',
      textDisplay: 'class_and_confidence',
      textPosition: 'TOP_LEFT',
      fontSize: 13,
    },
    inputPorts: [
      { key: 'image', label: 'image', dataType: 'image' },
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
    ],
    outputPorts: [
      { key: 'image', label: 'image', dataType: 'image' },
      { key: 'all_properties', label: 'all_properties', dataType: 'any' },
    ],
  },
  {
    kind: 'mask_visualization',
    category: 'visualization',
    title: 'Mask / Polygon Visualization',
    description: 'Render semi-transparent segmentation polygon overlays.',
    defaultName: 'mask_visualization',
    defaultSubtitle: 'Mask / Polygon Visualization',
    defaultParams: {
      image: 'inputs.image',
      predictions: 'seg_model.predictions',
      opacity: 0.42,
      contourThickness: 2,
    },
    inputPorts: [
      { key: 'image', label: 'image', dataType: 'image' },
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
    ],
    outputPorts: [{ key: 'image', label: 'image', dataType: 'image' }],
  },
  {
    kind: 'keypoint_visualization',
    category: 'visualization',
    title: 'Keypoint Skeleton Visualization',
    description: 'Draw pose joints and connecting limb edges onto frames.',
    defaultName: 'skeleton_visualization',
    defaultSubtitle: 'Keypoint Visualization',
    defaultParams: {
      image: 'inputs.image',
      predictions: 'pose_model.predictions',
      jointRadius: 4,
      edgeThickness: 2,
    },
    inputPorts: [
      { key: 'image', label: 'image', dataType: 'image' },
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
    ],
    outputPorts: [{ key: 'image', label: 'image', dataType: 'image' }],
  },

  // Logic & Video blocks
  {
    kind: 'object_counter',
    category: 'logic_video',
    title: 'Object Counter',
    description: 'Count total detections or group object counts by class name.',
    popular: true,
    defaultName: 'count_objects',
    defaultSubtitle: 'Property Definition',
    defaultParams: {
      data: 'model.predictions',
      operation: 'count',
      targetClass: '',
    },
    inputPorts: [{ key: 'data', label: 'predictions', dataType: 'predictions' }],
    outputPorts: [
      { key: 'output', label: 'output', dataType: 'number' },
      { key: 'by_class', label: 'by_class', dataType: 'any' },
      { key: 'all_properties', label: 'all_properties', dataType: 'any' },
    ],
  },
  {
    kind: 'class_filter',
    category: 'logic_video',
    title: 'Class Filter',
    description: 'Keep or exclude predictions matching specific class labels.',
    defaultName: 'filtered_predictions',
    defaultSubtitle: 'Class Filter',
    defaultParams: {
      predictions: 'model.predictions',
      mode: 'include',
      classes: ['person', 'car'],
    },
    inputPorts: [
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
    ],
    outputPorts: [
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
      { key: 'count', label: 'count', dataType: 'number' },
    ],
  },
  {
    kind: 'line_crossing',
    category: 'logic_video',
    title: 'Line Crossing / Zone Counter',
    description: 'Count detections intersecting a normalized tripwire or ROI zone.',
    defaultName: 'zone_counter',
    defaultSubtitle: 'Zone Counter',
    defaultParams: {
      predictions: 'model.predictions',
      mode: 'zone',
      zone: { x1: 0.1, y1: 0.25, x2: 0.9, y2: 0.9 },
      line: { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 },
    },
    inputPorts: [
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
    ],
    outputPorts: [
      { key: 'count', label: 'count', dataType: 'number' },
      { key: 'predictions', label: 'inside_predictions', dataType: 'predictions' },
    ],
  },
  {
    kind: 'condition',
    category: 'logic_video',
    title: 'Condition (if count > N)',
    description: 'Evaluate threshold expressions to gate downstream alerts or sinks.',
    defaultName: 'threshold_check',
    defaultSubtitle: 'Condition',
    defaultParams: {
      leftValue: 'count_objects.output',
      operator: 'gt',
      rightValue: 3,
    },
    inputPorts: [{ key: 'leftValue', label: 'value', dataType: 'number' }],
    outputPorts: [
      { key: 'passed', label: 'passed', dataType: 'boolean' },
      { key: 'value', label: 'value', dataType: 'number' },
    ],
  },

  // Input source blocks
  {
    kind: 'inputs',
    category: 'inputs',
    title: 'Workflow Input Source',
    description: 'Image Upload, Webcam frame, or RTSP/Video Stream input.',
    defaultName: 'inputs',
    defaultSubtitle: 'Data your workflow needs to run',
    defaultParams: {
      sourceType: 'image_upload',
    },
    inputPorts: [],
    outputPorts: [{ key: 'image', label: 'image', dataType: 'image' }],
  },

  // Outputs & Sinks
  {
    kind: 'outputs',
    category: 'outputs_sinks',
    title: 'JSON API / Image Output',
    description: 'Expose structured JSON and annotated image from the workflow.',
    defaultName: 'outputs',
    defaultSubtitle: 'Results your workflow returns',
    defaultParams: {},
    inputPorts: [{ key: 'any', label: 'mapped_fields', dataType: 'any' }],
    outputPorts: [],
  },
  {
    kind: 'webhook_sink',
    category: 'outputs_sinks',
    title: 'Webhook Trigger',
    description: 'Send detection JSON payloads to an HTTP/HTTPS webhook endpoint.',
    defaultName: 'webhook_alert',
    defaultSubtitle: 'Webhook Sink',
    defaultParams: {
      url: 'https://example.com/vision-webhook',
      triggerCondition: '',
      predictions: 'model.predictions',
      includeImage: false,
    },
    inputPorts: [
      { key: 'predictions', label: 'predictions', dataType: 'predictions' },
      { key: 'triggerCondition', label: 'condition', dataType: 'boolean' },
    ],
    outputPorts: [
      { key: 'dispatched', label: 'dispatched', dataType: 'boolean' },
      { key: 'status_code', label: 'status_code', dataType: 'number' },
    ],
  },
  {
    kind: 'mqtt_sink',
    category: 'outputs_sinks',
    title: 'MQTT Publisher',
    description: 'Publish inference telemetry events to an MQTT broker topic.',
    defaultName: 'mqtt_sink',
    defaultSubtitle: 'MQTT Sink',
    defaultParams: {
      brokerUrl: 'mqtt://broker.local:1883',
      topic: 'visionflow/detections',
      triggerCondition: '',
      payload: 'count_objects.output',
    },
    inputPorts: [
      { key: 'payload', label: 'payload', dataType: 'any' },
      { key: 'triggerCondition', label: 'condition', dataType: 'boolean' },
    ],
    outputPorts: [{ key: 'published', label: 'published', dataType: 'boolean' }],
  },
  {
    kind: 'modbus_sink',
    category: 'outputs_sinks',
    title: 'Modbus TCP Trigger',
    description: 'Write industrial PLC coil or holding register on alert condition.',
    defaultName: 'modbus_plc',
    defaultSubtitle: 'Modbus Sink',
    defaultParams: {
      host: '192.168.1.50',
      port: 502,
      coilAddress: 1,
      triggerCondition: '',
      value: 1,
    },
    inputPorts: [
      { key: 'triggerCondition', label: 'condition', dataType: 'boolean' },
    ],
    outputPorts: [{ key: 'written', label: 'written', dataType: 'boolean' }],
  },
];

export function getBlockSpec(kind: WorkflowNodeKind): BlockCatalogItem {
  return (
    WORKFLOW_BLOCKS.find((b) => b.kind === kind) ??
    WORKFLOW_BLOCKS[0]
  );
}

export function getCategorySpec(id: BlockCategoryId): BlockCatalogCategory {
  return (
    BLOCK_CATEGORIES.find((c) => c.id === id) ??
    BLOCK_CATEGORIES[0]
  );
}

export const COCO_80_CLASSES: string[] = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
  'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
  'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
];

export function createDefaultWorkflowDefinition(): WorkflowDefinition {
  return {
    version: '1.0',
    inputs: [
      {
        id: 'input-image',
        name: 'image',
        type: 'image',
        sourceHint: 'upload',
      },
    ],
    nodes: [
      {
        id: 'inputs',
        kind: 'inputs',
        name: 'Inputs',
        subtitle: 'Data your workflow needs to run',
        category: 'inputs',
        position: { x: 280, y: 20 },
        params: { sourceType: 'image_upload' },
      },
      {
        id: 'model',
        kind: 'yolo_detection',
        name: 'model',
        subtitle: 'yolov8n.onnx',
        category: 'model',
        position: { x: 280, y: 205 },
        params: {
          image: 'inputs.image',
          modelId: 'builtin-yolov8n-detect',
          modelName: 'yolov8n.onnx',
          confidence: 0.4,
          iou: 0.45,
          classFilter: [],
        },
      },
      {
        id: 'detection_visualization',
        kind: 'bounding_box_visualization',
        name: 'detection_visualization',
        subtitle: 'Bounding Box Visualization',
        category: 'visualization',
        position: { x: 110, y: 365 },
        params: {
          image: 'inputs.image',
          predictions: 'model.predictions',
          thickness: 2,
          colorPalette: 'roboflow',
          roundness: 4,
        },
      },
      {
        id: 'count_objects',
        kind: 'object_counter',
        name: 'count_objects',
        subtitle: 'Property Definition',
        category: 'logic_video',
        position: { x: 450, y: 365 },
        params: {
          data: 'model.predictions',
          operation: 'count',
          targetClass: '',
        },
      },
      {
        id: 'annotated_image',
        kind: 'label_visualization',
        name: 'annotated_image',
        subtitle: 'Label Visualization',
        category: 'visualization',
        position: { x: 110, y: 505 },
        params: {
          image: 'detection_visualization.image',
          predictions: 'model.predictions',
          textDisplay: 'class_and_confidence',
          textPosition: 'TOP_LEFT',
          fontSize: 13,
        },
      },
      {
        id: 'outputs',
        kind: 'outputs',
        name: 'Outputs',
        subtitle: 'Results your workflow returns',
        category: 'outputs_sinks',
        position: { x: 280, y: 650 },
        params: {},
      },
    ],
    edges: [
      { id: 'e-inputs-model', source: 'inputs', target: 'model' },
      { id: 'e-model-bbox', source: 'model', target: 'detection_visualization' },
      { id: 'e-model-count', source: 'model', target: 'count_objects' },
      {
        id: 'e-bbox-label',
        source: 'detection_visualization',
        target: 'annotated_image',
      },
      { id: 'e-label-outputs', source: 'annotated_image', target: 'outputs' },
      { id: 'e-count-outputs', source: 'count_objects', target: 'outputs' },
    ],
    outputs: [
      {
        id: 'out-count',
        name: 'count_objects',
        value: 'count_objects.output',
        dataType: 'number',
      },
      {
        id: 'out-image',
        name: 'output_image',
        value: 'annotated_image.image',
        dataType: 'image',
      },
      {
        id: 'out-predictions',
        name: 'predictions',
        value: 'model.predictions',
        dataType: 'predictions',
      },
    ],
  };
}
