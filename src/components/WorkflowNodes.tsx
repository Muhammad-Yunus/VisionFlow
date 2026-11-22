import React, { useState } from 'react';
import {
  Handle,
  Position,
  getBezierPath,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  Cpu,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  GitBranch,
  Hash,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Link2,
  Lock,
  Play,
  Plus,
  ScanLine,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Webhook,
  Radio,
  Cpu as PlcIcon,
  X,
  ChevronDown,
  ChevronUp,
  Code2,
} from 'lucide-react';
import {
  getBlockSpec,
  getCategorySpec,
  type WorkflowInputField,
  type WorkflowNodeDef,
  type WorkflowOutputMapping,
} from '../shared/workflowSchema';
import type { ModelSummary } from '../types/visionflow';

export interface UpstreamGroup {
  nodeId: string;
  nodeName: string;
  category: WorkflowNodeDef['category'];
  outputs: Array<{ key: string; label: string; dataType: string; ref: string }>;
}

export interface SharedNodeCallbacks {
  models: ModelSummary[];
  isLocked?: boolean;
  workflowInputs: WorkflowInputField[];
  workflowOutputs: WorkflowOutputMapping[];
  upstreamGroupsByNodeId: Record<string, UpstreamGroup[]>;
  onSelectNode: (nodeId: string) => void;
  onUpdateNodeParams: (nodeId: string, patch: Record<string, unknown>) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onToggleDisableNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onAddWorkflowInput: () => void;
  onRemoveWorkflowInput: (id: string) => void;
  onAddWorkflowOutput: (name?: string, value?: string, dataType?: string) => void;
  onUpdateWorkflowOutput: (id: string, patch: Partial<WorkflowOutputMapping>) => void;
  onRemoveWorkflowOutput: (id: string) => void;
  onOpenModelRegistry: () => void;
  onInspectNodeJson: (nodeId: string) => void;
  onQuickTestWorkflow: () => void;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeDef: WorkflowNodeDef;
  callbacks: SharedNodeCallbacks;
}

function renderNodeIcon(kind: WorkflowNodeDef['kind'], className = 'w-4 h-4') {
  switch (kind) {
    case 'inputs':
      return <ArrowDownToLine className={className} />;
    case 'outputs':
      return <ArrowUpFromLine className={className} />;
    case 'yolo_detection':
    case 'yolo_segmentation':
    case 'yolo_pose':
      return <Cpu className={className} />;
    case 'bounding_box_visualization':
      return <Box className={className} />;
    case 'label_visualization':
      return <Tag className={className} />;
    case 'mask_visualization':
      return <Layers className={className} />;
    case 'keypoint_visualization':
      return <Sparkles className={className} />;
    case 'object_counter':
      return <Settings2 className={className} />;
    case 'class_filter':
      return <Filter className={className} />;
    case 'line_crossing':
      return <ScanLine className={className} />;
    case 'condition':
      return <GitBranch className={className} />;
    case 'webhook_sink':
      return <Webhook className={className} />;
    case 'mqtt_sink':
      return <Radio className={className} />;
    case 'modbus_sink':
      return <PlcIcon className={className} />;
    default:
      return <Box className={className} />;
  }
}

function getChipColors(category: WorkflowNodeDef['category']) {
  if (category === 'model') {
    return 'bg-[#f3e8ff] text-[#7c3aed] border-[#e9d5ff]';
  }
  if (category === 'visualization') {
    return 'bg-[#dbeafe] text-[#2563eb] border-[#bfdbfe]';
  }
  if (category === 'logic_video') {
    return 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]';
  }
  if (category === 'outputs_sinks') {
    return 'bg-[#fce7f3] text-[#be185d] border-[#fbcfe8]';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function NodeActionToolbar({
  nodeDef,
  callbacks,
}: {
  nodeDef: WorkflowNodeDef;
  callbacks: SharedNodeCallbacks;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(nodeDef.name);

  return (
    <div
      className="nodrag nopan absolute -top-11 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-md whitespace-nowrap"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => callbacks.onInspectNodeJson(nodeDef.id)}
        className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        title="View node JSON"
      >
        <Code2 className="w-3.5 h-3.5" />
        <span>JSON</span>
      </button>
      <button
        type="button"
        onClick={callbacks.onQuickTestWorkflow}
        className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        title="Run test on workflow"
      >
        <Play className="w-3 h-3" />
        <span>Test</span>
      </button>
      <div className="h-3.5 w-px bg-slate-200 mx-0.5" />
      {callbacks.isLocked ? (
        <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
          <Lock className="w-3 h-3" />
          <span>Locked</span>
        </span>
      ) : (
        <>
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draftName.trim()) {
                  callbacks.onRenameNode(nodeDef.id, draftName.trim());
                }
                setRenaming(false);
              }}
              className="flex items-center gap-1 px-1"
            >
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => setRenaming(false)}
                className="w-28 rounded border border-violet-300 px-1.5 py-0.5 text-[11px] text-slate-900 focus:outline-none"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftName(nodeDef.name);
                setRenaming(true);
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Edit3 className="w-3 h-3" />
              <span>Rename</span>
            </button>
          )}
          {nodeDef.kind !== 'inputs' && nodeDef.kind !== 'outputs' && (
            <>
              <button
                type="button"
                onClick={() => callbacks.onToggleDisableNode(nodeDef.id)}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {nodeDef.disabled ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3" />
                )}
                <span>{nodeDef.disabled ? 'Enable' : 'Disable'}</span>
              </button>
              <button
                type="button"
                onClick={() => callbacks.onDeleteNode(nodeDef.id)}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function FloatingVariableMapper({
  groups,
  outputPorts,
  onPickRef,
  locked = false,
  titleRight = 'Drag to block fields to connect',
}: {
  groups: UpstreamGroup[];
  outputPorts?: Array<{ key: string; label: string; dataType: string }>;
  onPickRef: (ref: string, dataType: string) => void;
  locked?: boolean;
  titleRight?: string;
}) {
  const totalInputs = groups.reduce((acc, g) => acc + g.outputs.length, 0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  return (
    <div
      className="nodrag nopan absolute left-[calc(100%+16px)] top-0 z-30 w-[238px] space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      {groups.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <span className="text-[12px] font-semibold text-slate-900 tabular-nums">
              {totalInputs} {totalInputs === 1 ? 'Input' : 'Inputs'}
            </span>
            <span className="text-[10px] text-slate-400 truncate">
              {locked ? 'Read-only (locked)' : titleRight}
            </span>
          </div>
          <div className="mt-2 space-y-2 max-h-[260px] overflow-y-auto vf-scroll pr-0.5">
            {groups.map((grp) => {
              const isCollapsed = Boolean(collapsedGroups[grp.nodeId]);
              return (
                <div key={grp.nodeId} className="space-y-1">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedGroups((prev) => ({
                        ...prev,
                        [grp.nodeId]: !prev[grp.nodeId],
                      }))
                    }
                    className="flex w-full items-center justify-between text-[11px] font-medium text-slate-700 hover:text-slate-900 py-0.5"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Link2 className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{grp.nodeName}</span>
                    </span>
                    {isCollapsed ? (
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    ) : (
                      <ChevronUp className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                  {!isCollapsed && (
                    <div className="flex flex-wrap gap-1.5 pl-4">
                      {grp.outputs.map((out) => (
                        <button
                          key={out.ref}
                          type="button"
                          draggable={!locked}
                          disabled={locked}
                          onDragStart={(e) => {
                            if (locked) {
                              e.preventDefault();
                              return;
                            }
                            e.dataTransfer.setData('application/visionflow-ref', out.ref);
                            e.dataTransfer.setData('application/visionflow-type', out.dataType);
                          }}
                          onClick={() => {
                            if (!locked) onPickRef(out.ref, out.dataType);
                          }}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                            locked
                              ? 'opacity-70 cursor-not-allowed'
                              : 'cursor-grab active:cursor-grabbing hover:brightness-95'
                          } ${getChipColors(grp.category)}`}
                          title={
                            locked
                              ? 'Workflow locked — unlock to remap'
                              : `Click or drag ${out.ref}`
                          }
                        >
                          <span className="truncate max-w-[140px]">{out.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {outputPorts && outputPorts.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-[12px] font-semibold text-slate-900 tabular-nums">
              {outputPorts.length} {outputPorts.length === 1 ? 'Output' : 'Outputs'}
            </span>
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {outputPorts.map((port) => (
              <span
                key={port.key}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
              >
                {port.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InputsNode({ data, selected }: NodeProps) {
  const { nodeDef, callbacks } = data as WorkflowNodeData;
  return (
    <div className="relative">
      {selected && <NodeActionToolbar nodeDef={nodeDef} callbacks={callbacks} />}
      <div
        className={`w-[244px] rounded-xl bg-white transition-all ${
          selected
            ? 'border-2 border-[#7c3aed] shadow-md'
            : 'border border-slate-200 shadow-[0_1px_4px_rgba(15,23,42,0.05)] hover:border-slate-300'
        }`}
      >
        <div className="flex items-start justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-slate-900 leading-tight">
                {nodeDef.name}
              </div>
              <div className="text-[10.5px] text-slate-500 truncate">
                {nodeDef.subtitle || 'Data your workflow needs to run'}
              </div>
            </div>
          </div>
          <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        </div>

        <div className="p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {callbacks.workflowInputs.map((inp) => (
              <div
                key={inp.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11.5px] font-medium text-slate-800"
              >
                <ImageIcon className="w-3 h-3 text-slate-500" />
                <span>{inp.name}</span>
                {callbacks.workflowInputs.length > 1 && !callbacks.isLocked && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      callbacks.onRemoveWorkflowInput(inp.id);
                    }}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={Boolean(callbacks.isLocked)}
            onClick={(e) => {
              e.stopPropagation();
              callbacks.onAddWorkflowInput();
            }}
            className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>Add Input</span>
          </button>
        </div>

        <Handle type="source" position={Position.Bottom} id="out" />
      </div>
    </div>
  );
}

export function OutputsNode({ data, selected }: NodeProps) {
  const { nodeDef, callbacks } = data as WorkflowNodeData;
  const upstreamGroups = callbacks.upstreamGroupsByNodeId[nodeDef.id] ?? [];

  return (
    <div
      className="relative"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (callbacks.isLocked) return;
        const ref = e.dataTransfer.getData('application/visionflow-ref');
        const dtype = e.dataTransfer.getData('application/visionflow-type') || 'any';
        if (ref) {
          const cleanName = ref.replace(/\./g, '_');
          callbacks.onAddWorkflowOutput(cleanName, ref, dtype);
        }
      }}
    >
      {selected && <NodeActionToolbar nodeDef={nodeDef} callbacks={callbacks} />}
      <div
        className={`w-[254px] rounded-xl bg-white transition-all ${
          selected
            ? 'border-2 border-[#7c3aed] shadow-md'
            : 'border border-slate-200 shadow-[0_1px_4px_rgba(15,23,42,0.05)] hover:border-slate-300'
        }`}
      >
        <Handle type="target" position={Position.Top} id="in" />
        <div className="flex items-start justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ArrowUpFromLine className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-slate-900 leading-tight">
                {nodeDef.name}
              </div>
              <div className="text-[10.5px] text-slate-500 truncate">
                {nodeDef.subtitle || 'Results your workflow returns'}
              </div>
            </div>
          </div>
          <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        </div>

        <div className="p-3 space-y-2.5">
          {callbacks.workflowOutputs.map((out) => {
            const chipClass = out.value.includes('count')
              ? 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]'
              : out.value.includes('image') || out.dataType === 'image'
                ? 'bg-[#dbeafe] text-[#2563eb] border-[#bfdbfe]'
                : 'bg-[#f3e8ff] text-[#7c3aed] border-[#e9d5ff]';

            return (
              <div key={out.id} className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-700">
                  <span className="truncate">{out.name}</span>
                  {!callbacks.isLocked && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          callbacks.onRemoveWorkflowOutput(out.id);
                        }}
                        className="text-slate-400 hover:text-rose-600"
                        title="Remove output mapping"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${chipClass}`}
                >
                  {out.dataType === 'number' ? (
                    <Hash className="w-3 h-3" />
                  ) : out.dataType === 'image' ? (
                    <ImageIcon className="w-3 h-3" />
                  ) : (
                    <Box className="w-3 h-3" />
                  )}
                  <span className="truncate max-w-[190px]">{out.value}</span>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            disabled={Boolean(callbacks.isLocked)}
            onClick={(e) => {
              e.stopPropagation();
              callbacks.onSelectNode(nodeDef.id);
              const firstGroup = upstreamGroups[0];
              const firstOut = firstGroup?.outputs[0];
              if (firstOut) {
                callbacks.onAddWorkflowOutput(
                  `output_${callbacks.workflowOutputs.length + 1}`,
                  firstOut.ref,
                  firstOut.dataType
                );
              }
            }}
            className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>Add Output</span>
          </button>
        </div>
      </div>

      {selected && (
        <FloatingVariableMapper
          groups={upstreamGroups}
          locked={Boolean(callbacks.isLocked)}
          titleRight="Drag to Connect"
          onPickRef={(ref, dataType) => {
            if (callbacks.isLocked) return;
            const base = ref.split('.').join('_');
            callbacks.onAddWorkflowOutput(base, ref, dataType);
          }}
        />
      )}
    </div>
  );
}

export function WorkflowStepNode({ data, selected }: NodeProps) {
  const { nodeDef, callbacks } = data as WorkflowNodeData;
  const spec = getBlockSpec(nodeDef.kind);
  const cat = getCategorySpec(nodeDef.category);
  const upstreamGroups = callbacks.upstreamGroupsByNodeId[nodeDef.id] ?? [];
  const [showAdditional, setShowAdditional] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const isModelNode =
    nodeDef.kind === 'yolo_detection' ||
    nodeDef.kind === 'yolo_segmentation' ||
    nodeDef.kind === 'yolo_pose';

  const handleFieldDrop = (fieldKey: string, e: React.DragEvent) => {
    e.preventDefault();
    if (callbacks.isLocked) return;
    const ref = e.dataTransfer.getData('application/visionflow-ref');
    if (ref) {
      callbacks.onUpdateNodeParams(nodeDef.id, { [fieldKey]: ref });
    }
  };

  const renderRefField = (
    fieldKey: string,
    label: string,
    helpText: string,
    defaultVal: string
  ) => {
    const val = String(nodeDef.params[fieldKey] ?? defaultVal);
    const isFocused = focusedField === fieldKey;
    return (
      <div
        key={fieldKey}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleFieldDrop(fieldKey, e)}
        onClick={() => !callbacks.isLocked && setFocusedField(fieldKey)}
        className={`rounded-lg border p-2 transition ${
          callbacks.isLocked
            ? 'border-slate-200 bg-slate-50/70 cursor-not-allowed'
            : isFocused
              ? 'border-violet-400 bg-violet-50/40 cursor-pointer'
              : 'border-slate-200 bg-white hover:border-slate-300 cursor-pointer'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-800">
            {label} <span className="text-rose-500">*</span>
          </span>
          <span className="text-[10px] text-slate-400">
            {callbacks.isLocked
              ? 'Locked'
              : isFocused
                ? 'Click input chip →'
                : 'Drop or click'}
          </span>
        </div>
        <p className="text-[10.5px] text-slate-500 mt-0.5">{helpText}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {val ? (
            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800">
              <span>{val}</span>
              {!callbacks.isLocked && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    callbacks.onUpdateNodeParams(nodeDef.id, { [fieldKey]: '' });
                  }}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ) : (
            <span className="text-[11px] italic text-slate-400">
              Unmapped — click a variable on the right
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {selected && <NodeActionToolbar nodeDef={nodeDef} callbacks={callbacks} />}

      <div
        style={{ borderLeftColor: cat.accentHex, borderLeftWidth: '4px' }}
        className={`rounded-xl bg-white transition-all overflow-hidden ${
          nodeDef.disabled ? 'opacity-55' : ''
        } ${
          selected
            ? 'w-[288px] ring-2 ring-[#7c3aed] border border-[#7c3aed] shadow-lg'
            : 'w-[248px] border border-slate-200 shadow-[0_1px_4px_rgba(15,23,42,0.05)] hover:border-slate-300'
        }`}
      >
        <Handle type="target" position={Position.Top} id="in" />

        {/* Node Header */}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div
            style={{ backgroundColor: cat.bgTintHex, color: cat.textHex }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          >
            {renderNodeIcon(nodeDef.kind, 'w-4 h-4')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] italic text-slate-500 truncate leading-tight">
              {nodeDef.subtitle || spec.title}
            </div>
            <div className="text-[13px] font-semibold text-slate-900 truncate leading-snug">
              {nodeDef.name}
            </div>
          </div>
          {nodeDef.disabled && (
            <span className="text-[10px] font-medium text-slate-400">Off</span>
          )}
        </div>

        {/* Inline Expanded Inspector when Selected (Matches Screenshot 3) */}
        {selected && (
          <div
            className="nodrag nopan border-t border-slate-100 px-3 py-3 space-y-2.5 bg-[#fcfcfd]"
            onClick={(e) => e.stopPropagation()}
          >
            {callbacks.isLocked && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10.5px] font-medium text-amber-800">
                <Lock className="w-3 h-3 shrink-0" />
                <span>Read-only — unlock workflow to edit</span>
              </div>
            )}
            {isModelNode && (
              <>
                <fieldset disabled={Boolean(callbacks.isLocked)} className="contents">
                  {renderRefField(
                    'image',
                    'Image',
                    'The image to infer on.',
                    'inputs.image'
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-800">
                        Model <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={callbacks.onOpenModelRegistry}
                        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-violet-700 hover:underline"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Upload .pt/.onnx</span>
                      </button>
                    </div>
                    <select
                      value={String(nodeDef.params.modelId ?? '')}
                      onChange={(e) => {
                        const chosen = callbacks.models.find(
                          (m) => m.id === e.target.value
                        );
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          modelId: e.target.value,
                          modelName: chosen?.name ?? e.target.value,
                        });
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 focus:border-violet-500 focus:outline-none"
                    >
                      {callbacks.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.format.toUpperCase()} · {m.classNames.length} cls)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-800">Confidence</span>
                      <span className="font-mono text-slate-700 tabular-nums">
                        {Number(nodeDef.params.confidence ?? 0.4).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.95}
                      step={0.05}
                      value={Number(nodeDef.params.confidence ?? 0.4)}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          confidence: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#7c3aed]"
                    />
                  </div>
                </fieldset>

                <button
                  type="button"
                  onClick={() => setShowAdditional((v) => !v)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  {showAdditional ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {showAdditional
                      ? 'Hide Additional Properties'
                      : 'Show Additional Properties'}
                  </span>
                </button>

                {showAdditional && (
                  <fieldset disabled={Boolean(callbacks.isLocked)} className="contents">
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-800">
                            IoU Threshold
                          </span>
                          <span className="font-mono text-slate-700 tabular-nums">
                            {Number(nodeDef.params.iou ?? 0.45).toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={0.95}
                          step={0.05}
                          value={Number(nodeDef.params.iou ?? 0.45)}
                          onChange={(e) =>
                            callbacks.onUpdateNodeParams(nodeDef.id, {
                              iou: Number(e.target.value),
                            })
                          }
                          className="w-full accent-[#7c3aed]"
                        />
                      </div>
                    </div>
                  </fieldset>
                )}
              </>
            )}

            <fieldset disabled={Boolean(callbacks.isLocked)} className="contents">
            {(nodeDef.kind === 'bounding_box_visualization' ||
              nodeDef.kind === 'label_visualization' ||
              nodeDef.kind === 'mask_visualization' ||
              nodeDef.kind === 'keypoint_visualization') && (
              <>
                {renderRefField(
                  'image',
                  'Image',
                  'Image surface to annotate.',
                  'inputs.image'
                )}
                {renderRefField(
                  'predictions',
                  'Predictions',
                  'Detections from upstream model.',
                  'model.predictions'
                )}
                {nodeDef.kind === 'bounding_box_visualization' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-800">
                        Stroke Thickness
                      </span>
                      <span className="font-mono tabular-nums">
                        {Number(nodeDef.params.thickness ?? 2)}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={1}
                      value={Number(nodeDef.params.thickness ?? 2)}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          thickness: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#2563eb]"
                    />
                  </div>
                )}
                {nodeDef.kind === 'label_visualization' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-800">
                      Label Format
                    </label>
                    <select
                      value={String(
                        nodeDef.params.textDisplay ?? 'class_and_confidence'
                      )}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          textDisplay: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11.5px]"
                    >
                      <option value="class_and_confidence">
                        Class + Confidence
                      </option>
                      <option value="class_only">Class Name Only</option>
                      <option value="confidence_only">Confidence Only</option>
                    </select>
                  </div>
                )}
                {nodeDef.kind === 'mask_visualization' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-800">
                        Mask Opacity
                      </span>
                      <span className="font-mono tabular-nums">
                        {Number(nodeDef.params.opacity ?? 0.42).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={0.85}
                      step={0.05}
                      value={Number(nodeDef.params.opacity ?? 0.42)}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          opacity: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#2563eb]"
                    />
                  </div>
                )}
              </>
            )}

            {nodeDef.kind === 'object_counter' && (
              <>
                {renderRefField(
                  'data',
                  'Predictions',
                  'Predictions array to count.',
                  'model.predictions'
                )}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-800">
                    Target Class (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="All classes (e.g. person, car)"
                    value={String(nodeDef.params.targetClass ?? '')}
                    onChange={(e) =>
                      callbacks.onUpdateNodeParams(nodeDef.id, {
                        targetClass: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </>
            )}

            {nodeDef.kind === 'class_filter' && (
              <>
                {renderRefField(
                  'predictions',
                  'Predictions',
                  'Detections to filter.',
                  'model.predictions'
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={String(nodeDef.params.mode ?? 'include')}
                    onChange={(e) =>
                      callbacks.onUpdateNodeParams(nodeDef.id, {
                        mode: e.target.value,
                      })
                    }
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11.5px]"
                  >
                    <option value="include">Include only</option>
                    <option value="exclude">Exclude</option>
                  </select>
                  <input
                    type="text"
                    placeholder="person, car"
                    value={
                      Array.isArray(nodeDef.params.classes)
                        ? (nodeDef.params.classes as string[]).join(', ')
                        : ''
                    }
                    onChange={(e) =>
                      callbacks.onUpdateNodeParams(nodeDef.id, {
                        classes: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11.5px]"
                  />
                </div>
              </>
            )}

            {nodeDef.kind === 'line_crossing' && (
              <>
                {renderRefField(
                  'predictions',
                  'Predictions',
                  'Detections to evaluate against zone/line.',
                  'model.predictions'
                )}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-800">
                    Evaluation Mode
                  </label>
                  <select
                    value={String(nodeDef.params.mode ?? 'zone')}
                    onChange={(e) =>
                      callbacks.onUpdateNodeParams(nodeDef.id, {
                        mode: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11.5px]"
                  >
                    <option value="zone">ROI Zone Counter</option>
                    <option value="line">Tripwire Line Crossing</option>
                  </select>
                </div>
              </>
            )}

            {nodeDef.kind === 'condition' && (
              <>
                {renderRefField(
                  'leftValue',
                  'Left Value',
                  'Numeric output to compare (e.g. count_objects.output).',
                  'count_objects.output'
                )}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={String(nodeDef.params.operator ?? 'gt')}
                    onChange={(e) =>
                      callbacks.onUpdateNodeParams(nodeDef.id, {
                        operator: e.target.value,
                      })
                    }
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11.5px]"
                  >
                    <option value="gt">&gt; greater than</option>
                    <option value="gte">&gt;= at least</option>
                    <option value="eq">== equals</option>
                    <option value="lt">&lt; less than</option>
                  </select>
                  <input
                    type="number"
                    value={Number(nodeDef.params.rightValue ?? 3)}
                    onChange={(e) =>
                      callbacks.onUpdateNodeParams(nodeDef.id, {
                        rightValue: Number(e.target.value),
                      })
                    }
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-mono tabular-nums"
                  />
                </div>
              </>
            )}

            {(nodeDef.kind === 'webhook_sink' ||
              nodeDef.kind === 'mqtt_sink' ||
              nodeDef.kind === 'modbus_sink') && (
              <>
                {nodeDef.kind === 'webhook_sink' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-800">
                      Webhook Endpoint URL
                    </label>
                    <input
                      type="url"
                      value={String(nodeDef.params.url ?? '')}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          url: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-mono"
                    />
                  </div>
                )}
                {nodeDef.kind === 'mqtt_sink' && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      placeholder="mqtt://broker.local:1883"
                      value={String(nodeDef.params.brokerUrl ?? '')}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          brokerUrl: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-mono"
                    />
                    <input
                      type="text"
                      placeholder="visionflow/detections"
                      value={String(nodeDef.params.topic ?? '')}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          topic: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-mono"
                    />
                  </div>
                )}
                {nodeDef.kind === 'modbus_sink' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      placeholder="192.168.1.50"
                      value={String(nodeDef.params.host ?? '')}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          host: e.target.value,
                        })
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-mono"
                    />
                    <input
                      type="number"
                      placeholder="Coil #1"
                      value={Number(nodeDef.params.coilAddress ?? 1)}
                      onChange={(e) =>
                        callbacks.onUpdateNodeParams(nodeDef.id, {
                          coilAddress: Number(e.target.value),
                        })
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-mono tabular-nums"
                    />
                  </div>
                )}
              </>
            )}
            </fieldset>
          </div>
        )}

        <Handle type="source" position={Position.Bottom} id="out" />
      </div>

      {/* Floating Input/Output Variable Mapper beside selected node (Matches Screenshot 3) */}
      {selected && (
        <FloatingVariableMapper
          groups={upstreamGroups}
          outputPorts={spec.outputPorts}
          locked={Boolean(callbacks.isLocked)}
          onPickRef={(ref) => {
            if (callbacks.isLocked) return;
            const targetKey =
              focusedField || spec.inputPorts[0]?.key || 'image';
            callbacks.onUpdateNodeParams(nodeDef.id, { [targetKey]: ref });
          }}
        />
      )}
    </div>
  );
}

export function DashedWorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.45,
  });

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={selected ? '#8b5cf6' : '#cbd5e1'}
        strokeWidth={selected ? 2.2 : 1.75}
        strokeDasharray="5 4"
        className="transition-colors"
      />
    </>
  );
}
