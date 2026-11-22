import {
  createDefaultWorkflowDefinition,
  createEmptyWorkflowDefinition,
  type WorkflowDefinition,
} from './workflowSchema';

export interface WorkflowTemplate {
  id: string;
  name: string;
  category:
    | 'General Purpose'
    | 'Mobility & Smart City'
    | 'Safety & Retail'
    | 'Security & Perimeter'
    | 'Retail & Logistics';
  description: string;
  recommendedModelTask: 'detect' | 'segment' | 'pose';
  pipelineSummary: string[];
  buildDefinition: (modelBinding?: {
    modelId: string;
    modelName: string;
  }) => WorkflowDefinition;
}

function modelParams(
  modelBinding?: { modelId: string; modelName: string },
  confidence = 0.4,
  iou = 0.45
) {
  return {
    image: 'inputs.image',
    modelId: modelBinding?.modelId ?? '',
    modelName: modelBinding?.modelName ?? 'yolov8n.onnx',
    confidence,
    iou,
    classFilter: [],
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'empty-workflow',
    name: 'Create Empty Workflow',
    category: 'General Purpose',
    description:
      'Start with a clean blank canvas containing only Inputs and Outputs anchors so you can build and wire custom YOLO blocks from scratch.',
    recommendedModelTask: 'detect',
    pipelineSummary: ['Inputs', 'Custom Blocks', 'Outputs'],
    buildDefinition: () => createEmptyWorkflowDefinition(),
  },
  {
    id: 'traffic-vehicle-counter',
    name: 'Traffic & Vehicle Counter',
    category: 'Mobility & Smart City',
    description:
      'Detect and count road vehicles (car, truck, bus, motorcycle, bicycle), filter out non-vehicle classes, and render labeled bounding boxes.',
    recommendedModelTask: 'detect',
    pipelineSummary: [
      'Inputs',
      'YOLO Detect',
      'Class Filter',
      'Object Counter',
      'Box + Label Viz',
      'Outputs',
    ],
    buildDefinition: (modelBinding) => ({
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
          subtitle: 'Street camera or image frame',
          category: 'inputs',
          position: { x: 280, y: 20 },
          params: { sourceType: 'image_upload' },
        },
        {
          id: 'model',
          kind: 'yolo_detection',
          name: 'model',
          subtitle: modelBinding?.modelName ?? 'yolov8n.onnx',
          category: 'model',
          position: { x: 280, y: 175 },
          params: modelParams(modelBinding, 0.35, 0.45),
        },
        {
          id: 'vehicle_filter',
          kind: 'class_filter',
          name: 'vehicle_filter',
          subtitle: 'Vehicles Only Filter',
          category: 'logic_video',
          position: { x: 280, y: 325 },
          params: {
            predictions: 'model.predictions',
            mode: 'include',
            classes: ['car', 'truck', 'bus', 'motorcycle', 'bicycle'],
          },
        },
        {
          id: 'bbox_viz',
          kind: 'bounding_box_visualization',
          name: 'bbox_viz',
          subtitle: 'Bounding Box Visualization',
          category: 'visualization',
          position: { x: 100, y: 475 },
          params: {
            image: 'inputs.image',
            predictions: 'vehicle_filter.predictions',
            thickness: 2,
            colorPalette: 'roboflow',
            roundness: 4,
          },
        },
        {
          id: 'vehicle_counter',
          kind: 'object_counter',
          name: 'vehicle_counter',
          subtitle: 'Vehicle Count & Breakdown',
          category: 'logic_video',
          position: { x: 460, y: 475 },
          params: {
            data: 'vehicle_filter.predictions',
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
          position: { x: 100, y: 615 },
          params: {
            image: 'bbox_viz.image',
            predictions: 'vehicle_filter.predictions',
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
          position: { x: 280, y: 760 },
          params: {},
        },
      ],
      edges: [
        { id: 'e-in-m', source: 'inputs', target: 'model' },
        { id: 'e-m-vf', source: 'model', target: 'vehicle_filter' },
        { id: 'e-vf-bb', source: 'vehicle_filter', target: 'bbox_viz' },
        { id: 'e-vf-vc', source: 'vehicle_filter', target: 'vehicle_counter' },
        { id: 'e-bb-lbl', source: 'bbox_viz', target: 'annotated_image' },
        { id: 'e-lbl-out', source: 'annotated_image', target: 'outputs' },
        { id: 'e-vc-out', source: 'vehicle_counter', target: 'outputs' },
      ],
      outputs: [
        {
          id: 'out-vcount',
          name: 'vehicle_count',
          value: 'vehicle_counter.output',
          dataType: 'number',
        },
        {
          id: 'out-vbyclass',
          name: 'vehicle_breakdown',
          value: 'vehicle_counter.by_class',
          dataType: 'any',
        },
        {
          id: 'out-vimg',
          name: 'output_image',
          value: 'annotated_image.image',
          dataType: 'image',
        },
        {
          id: 'out-vpreds',
          name: 'predictions',
          value: 'vehicle_filter.predictions',
          dataType: 'predictions',
        },
      ],
    }),
  },
  {
    id: 'crowd-occupancy-alert',
    name: 'Crowd & Occupancy Alert (> N)',
    category: 'Safety & Retail',
    description:
      'Monitor people occupancy in queues, lobbies, or retail floors and raise a boolean overcrowding alert when headcount exceeds 5 persons.',
    recommendedModelTask: 'detect',
    pipelineSummary: [
      'Inputs',
      'YOLO Detect',
      'Person Filter',
      'Person Counter',
      'Condition (> 5)',
      'Outputs',
    ],
    buildDefinition: (modelBinding) => ({
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
          subtitle: 'Lobby or store camera feed',
          category: 'inputs',
          position: { x: 280, y: 20 },
          params: { sourceType: 'image_upload' },
        },
        {
          id: 'model',
          kind: 'yolo_detection',
          name: 'model',
          subtitle: modelBinding?.modelName ?? 'yolov8n.onnx',
          category: 'model',
          position: { x: 280, y: 170 },
          params: modelParams(modelBinding, 0.35, 0.45),
        },
        {
          id: 'person_filter',
          kind: 'class_filter',
          name: 'person_filter',
          subtitle: 'Filter: person',
          category: 'logic_video',
          position: { x: 280, y: 315 },
          params: {
            predictions: 'model.predictions',
            mode: 'include',
            classes: ['person'],
          },
        },
        {
          id: 'bbox_viz',
          kind: 'bounding_box_visualization',
          name: 'bbox_viz',
          subtitle: 'Bounding Box Visualization',
          category: 'visualization',
          position: { x: 100, y: 465 },
          params: {
            image: 'inputs.image',
            predictions: 'person_filter.predictions',
            thickness: 2,
            colorPalette: 'roboflow',
            roundness: 4,
          },
        },
        {
          id: 'person_counter',
          kind: 'object_counter',
          name: 'person_counter',
          subtitle: 'Headcount',
          category: 'logic_video',
          position: { x: 460, y: 465 },
          params: {
            data: 'person_filter.predictions',
            operation: 'count',
            targetClass: 'person',
          },
        },
        {
          id: 'annotated_image',
          kind: 'label_visualization',
          name: 'annotated_image',
          subtitle: 'Label Visualization',
          category: 'visualization',
          position: { x: 100, y: 605 },
          params: {
            image: 'bbox_viz.image',
            predictions: 'person_filter.predictions',
            textDisplay: 'class_and_confidence',
            textPosition: 'TOP_LEFT',
            fontSize: 13,
          },
        },
        {
          id: 'crowd_alert',
          kind: 'condition',
          name: 'crowd_alert',
          subtitle: 'If Headcount > 5',
          category: 'logic_video',
          position: { x: 460, y: 605 },
          params: {
            leftValue: 'person_counter.output',
            operator: 'gt',
            rightValue: 5,
          },
        },
        {
          id: 'outputs',
          kind: 'outputs',
          name: 'Outputs',
          subtitle: 'Occupancy metrics & alert state',
          category: 'outputs_sinks',
          position: { x: 280, y: 760 },
          params: {},
        },
      ],
      edges: [
        { id: 'e-in-m', source: 'inputs', target: 'model' },
        { id: 'e-m-pf', source: 'model', target: 'person_filter' },
        { id: 'e-pf-bb', source: 'person_filter', target: 'bbox_viz' },
        { id: 'e-pf-pc', source: 'person_filter', target: 'person_counter' },
        { id: 'e-bb-lbl', source: 'bbox_viz', target: 'annotated_image' },
        { id: 'e-pc-ca', source: 'person_counter', target: 'crowd_alert' },
        { id: 'e-lbl-out', source: 'annotated_image', target: 'outputs' },
        { id: 'e-ca-out', source: 'crowd_alert', target: 'outputs' },
      ],
      outputs: [
        {
          id: 'out-pcount',
          name: 'person_count',
          value: 'person_counter.output',
          dataType: 'number',
        },
        {
          id: 'out-palert',
          name: 'over_capacity',
          value: 'crowd_alert.passed',
          dataType: 'boolean',
        },
        {
          id: 'out-pimg',
          name: 'output_image',
          value: 'annotated_image.image',
          dataType: 'image',
        },
        {
          id: 'out-ppreds',
          name: 'predictions',
          value: 'person_filter.predictions',
          dataType: 'predictions',
        },
      ],
    }),
  },
  {
    id: 'restricted-zone-guard',
    name: 'Restricted Zone & Intrusion Guard',
    category: 'Security & Perimeter',
    description:
      'Detect people entering a normalized perimeter ROI zone, evaluate intrusion status (count > 0), and annotate only detections inside the guarded zone.',
    recommendedModelTask: 'detect',
    pipelineSummary: [
      'Inputs',
      'YOLO Detect',
      'Person Filter',
      'Zone Counter',
      'Intrusion Check',
      'Outputs',
    ],
    buildDefinition: (modelBinding) => ({
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
          subtitle: 'Perimeter camera or frame',
          category: 'inputs',
          position: { x: 280, y: 20 },
          params: { sourceType: 'image_upload' },
        },
        {
          id: 'model',
          kind: 'yolo_detection',
          name: 'model',
          subtitle: modelBinding?.modelName ?? 'yolov8n.onnx',
          category: 'model',
          position: { x: 280, y: 170 },
          params: modelParams(modelBinding, 0.4, 0.45),
        },
        {
          id: 'person_filter',
          kind: 'class_filter',
          name: 'person_filter',
          subtitle: 'Filter: person',
          category: 'logic_video',
          position: { x: 280, y: 315 },
          params: {
            predictions: 'model.predictions',
            mode: 'include',
            classes: ['person'],
          },
        },
        {
          id: 'perimeter_zone',
          kind: 'line_crossing',
          name: 'perimeter_zone',
          subtitle: 'ROI Zone Counter',
          category: 'logic_video',
          position: { x: 280, y: 460 },
          params: {
            predictions: 'person_filter.predictions',
            mode: 'zone',
            zone: { x1: 0.15, y1: 0.25, x2: 0.85, y2: 0.9 },
            line: { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 },
          },
        },
        {
          id: 'bbox_viz',
          kind: 'bounding_box_visualization',
          name: 'bbox_viz',
          subtitle: 'Zone Detections Box',
          category: 'visualization',
          position: { x: 100, y: 605 },
          params: {
            image: 'inputs.image',
            predictions: 'perimeter_zone.predictions',
            thickness: 3,
            colorPalette: 'roboflow',
            roundness: 4,
          },
        },
        {
          id: 'intrusion_alert',
          kind: 'condition',
          name: 'intrusion_alert',
          subtitle: 'If Zone Count > 0',
          category: 'logic_video',
          position: { x: 460, y: 605 },
          params: {
            leftValue: 'perimeter_zone.count',
            operator: 'gt',
            rightValue: 0,
          },
        },
        {
          id: 'annotated_image',
          kind: 'label_visualization',
          name: 'annotated_image',
          subtitle: 'Label Visualization',
          category: 'visualization',
          position: { x: 100, y: 745 },
          params: {
            image: 'bbox_viz.image',
            predictions: 'perimeter_zone.predictions',
            textDisplay: 'class_and_confidence',
            textPosition: 'TOP_LEFT',
            fontSize: 13,
          },
        },
        {
          id: 'outputs',
          kind: 'outputs',
          name: 'Outputs',
          subtitle: 'Zone intrusion verdict & overlay',
          category: 'outputs_sinks',
          position: { x: 280, y: 890 },
          params: {},
        },
      ],
      edges: [
        { id: 'e-in-m', source: 'inputs', target: 'model' },
        { id: 'e-m-pf', source: 'model', target: 'person_filter' },
        { id: 'e-pf-pz', source: 'person_filter', target: 'perimeter_zone' },
        { id: 'e-pz-bb', source: 'perimeter_zone', target: 'bbox_viz' },
        { id: 'e-pz-ia', source: 'perimeter_zone', target: 'intrusion_alert' },
        { id: 'e-bb-lbl', source: 'bbox_viz', target: 'annotated_image' },
        { id: 'e-lbl-out', source: 'annotated_image', target: 'outputs' },
        { id: 'e-ia-out', source: 'intrusion_alert', target: 'outputs' },
      ],
      outputs: [
        {
          id: 'out-zcount',
          name: 'zone_count',
          value: 'perimeter_zone.count',
          dataType: 'number',
        },
        {
          id: 'out-zalert',
          name: 'intrusion_detected',
          value: 'intrusion_alert.passed',
          dataType: 'boolean',
        },
        {
          id: 'out-zimg',
          name: 'output_image',
          value: 'annotated_image.image',
          dataType: 'image',
        },
        {
          id: 'out-zpreds',
          name: 'zone_predictions',
          value: 'perimeter_zone.predictions',
          dataType: 'predictions',
        },
      ],
    }),
  },
  {
    id: 'retail-shelf-inventory',
    name: 'Retail Shelf & Inventory Audit',
    category: 'Retail & Logistics',
    description:
      'Audit stock items (bottle, cup, bowl, apple, orange, banana, book, laptop, cell phone), return per-class counts, and flag low inventory (< 3).',
    recommendedModelTask: 'detect',
    pipelineSummary: [
      'Inputs',
      'YOLO Detect',
      'Item Filter',
      'Inventory Counter',
      'Low-Stock Check',
      'Outputs',
    ],
    buildDefinition: (modelBinding) => ({
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
          subtitle: 'Shelf or counter snapshot',
          category: 'inputs',
          position: { x: 280, y: 20 },
          params: { sourceType: 'image_upload' },
        },
        {
          id: 'model',
          kind: 'yolo_detection',
          name: 'model',
          subtitle: modelBinding?.modelName ?? 'yolov8n.onnx',
          category: 'model',
          position: { x: 280, y: 170 },
          params: modelParams(modelBinding, 0.3, 0.45),
        },
        {
          id: 'item_filter',
          kind: 'class_filter',
          name: 'item_filter',
          subtitle: 'Retail SKU Filter',
          category: 'logic_video',
          position: { x: 280, y: 315 },
          params: {
            predictions: 'model.predictions',
            mode: 'include',
            classes: [
              'bottle',
              'cup',
              'wine glass',
              'bowl',
              'apple',
              'orange',
              'banana',
              'book',
              'laptop',
              'cell phone',
            ],
          },
        },
        {
          id: 'bbox_viz',
          kind: 'bounding_box_visualization',
          name: 'bbox_viz',
          subtitle: 'Bounding Box Visualization',
          category: 'visualization',
          position: { x: 100, y: 465 },
          params: {
            image: 'inputs.image',
            predictions: 'item_filter.predictions',
            thickness: 2,
            colorPalette: 'roboflow',
            roundness: 4,
          },
        },
        {
          id: 'inventory_count',
          kind: 'object_counter',
          name: 'inventory_count',
          subtitle: 'Stock Tally',
          category: 'logic_video',
          position: { x: 460, y: 465 },
          params: {
            data: 'item_filter.predictions',
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
          position: { x: 100, y: 605 },
          params: {
            image: 'bbox_viz.image',
            predictions: 'item_filter.predictions',
            textDisplay: 'class_and_confidence',
            textPosition: 'TOP_LEFT',
            fontSize: 13,
          },
        },
        {
          id: 'low_stock_alert',
          kind: 'condition',
          name: 'low_stock_alert',
          subtitle: 'If Stock < 3',
          category: 'logic_video',
          position: { x: 460, y: 605 },
          params: {
            leftValue: 'inventory_count.output',
            operator: 'lt',
            rightValue: 3,
          },
        },
        {
          id: 'outputs',
          kind: 'outputs',
          name: 'Outputs',
          subtitle: 'Inventory summary & alert',
          category: 'outputs_sinks',
          position: { x: 280, y: 760 },
          params: {},
        },
      ],
      edges: [
        { id: 'e-in-m', source: 'inputs', target: 'model' },
        { id: 'e-m-if', source: 'model', target: 'item_filter' },
        { id: 'e-if-bb', source: 'item_filter', target: 'bbox_viz' },
        { id: 'e-if-ic', source: 'item_filter', target: 'inventory_count' },
        { id: 'e-bb-lbl', source: 'bbox_viz', target: 'annotated_image' },
        { id: 'e-ic-ls', source: 'inventory_count', target: 'low_stock_alert' },
        { id: 'e-lbl-out', source: 'annotated_image', target: 'outputs' },
        { id: 'e-ls-out', source: 'low_stock_alert', target: 'outputs' },
      ],
      outputs: [
        {
          id: 'out-icount',
          name: 'total_items',
          value: 'inventory_count.output',
          dataType: 'number',
        },
        {
          id: 'out-ibyclass',
          name: 'by_class',
          value: 'inventory_count.by_class',
          dataType: 'any',
        },
        {
          id: 'out-ilow',
          name: 'low_stock',
          value: 'low_stock_alert.passed',
          dataType: 'boolean',
        },
        {
          id: 'out-iimg',
          name: 'output_image',
          value: 'annotated_image.image',
          dataType: 'image',
        },
      ],
    }),
  },
  {
    id: 'detect-count-visualize',
    name: 'Detect, Count, and Visualize (Starter)',
    category: 'General Purpose',
    description:
      'All-class YOLO object detection baseline with bounding boxes, confidence labels, and total object count.',
    recommendedModelTask: 'detect',
    pipelineSummary: [
      'Inputs',
      'YOLO Detect',
      'Object Counter',
      'Box + Label Viz',
      'Outputs',
    ],
    buildDefinition: (modelBinding) => {
      const def = createDefaultWorkflowDefinition();
      if (modelBinding) {
        def.nodes = def.nodes.map((n) =>
          n.kind === 'yolo_detection'
            ? {
                ...n,
                subtitle: modelBinding.modelName,
                params: {
                  ...n.params,
                  modelId: modelBinding.modelId,
                  modelName: modelBinding.modelName,
                },
              }
            : n
        );
      }
      return def;
    },
  },
];
