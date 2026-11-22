import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import {
  Check,
  ChevronDown,
  Clock,
  Code2,
  Cpu,
  Edit3,
  GitBranch,
  History,
  Layers,
  Lock,
  Maximize,
  Map as MapIcon,
  Minus,
  PanelRight,
  Play,
  Plus,
  Redo2,
  Save,
  Settings,
  Share2,
  SlidersHorizontal,
  Undo2,
  Unlock,
  User,
  X,
} from 'lucide-react';
import {
  createDefaultWorkflowDefinition,
  getBlockSpec,
  type BlockCatalogItem,
  type WorkflowDefinition,
  type WorkflowNodeDef,
  type WorkflowOutputMapping,
} from './shared/workflowSchema';
import { api, setAuthToken } from './lib/api';
import type {
  AuthUser,
  DagRunResult,
  ModelSummary,
  RightPanelTab,
  StreamSummary,
  WorkflowSummary,
} from './types/visionflow';
import {
  DashedWorkflowEdge,
  InputsNode,
  OutputsNode,
  WorkflowStepNode,
  type SharedNodeCallbacks,
  type UpstreamGroup,
} from './components/WorkflowNodes';
import { WorkflowBlocksSidebar } from './components/WorkflowBlocksSidebar';
import { RunWorkflowPanel } from './components/RunWorkflowPanel';
import {
  AuthModal,
  IntegrateApiModal,
  ModelRegistryModal,
  NodeJsonModal,
} from './components/Modals';

const nodeTypes = {
  inputs: InputsNode,
  step: WorkflowStepNode,
  outputs: OutputsNode,
};

const edgeTypes = {
  dashed: DashedWorkflowEdge,
};

function defNodeToRfNode(
  nodeDef: WorkflowNodeDef,
  callbacks: SharedNodeCallbacks,
  selectedId: string | null
): Node {
  const rfType =
    nodeDef.kind === 'inputs'
      ? 'inputs'
      : nodeDef.kind === 'outputs'
        ? 'outputs'
        : 'step';
  return {
    id: nodeDef.id,
    type: rfType,
    position: nodeDef.position,
    selected: nodeDef.id === selectedId,
    data: {
      nodeDef,
      callbacks,
    },
  };
}

function buildUpstreamMap(
  definition: WorkflowDefinition
): Record<string, UpstreamGroup[]> {
  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));
  const result: Record<string, UpstreamGroup[]> = {};

  for (const target of definition.nodes) {
    // BFS backwards from target to collect all upstream nodes
    const visited = new Set<string>();
    const queue = [target.id];
    const upstreamIds: string[] = [];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const edge of definition.edges) {
        if (edge.target === curr && !visited.has(edge.source)) {
          visited.add(edge.source);
          upstreamIds.push(edge.source);
          queue.push(edge.source);
        }
      }
    }

    // Fallback: if a node isn't wired yet, still expose 'inputs'
    if (!visited.has('inputs') && target.id !== 'inputs') {
      const inpNode = nodeMap.get('inputs');
      if (inpNode) upstreamIds.push('inputs');
    }

    const groups: UpstreamGroup[] = [];
    for (const uid of upstreamIds) {
      const uNode = nodeMap.get(uid);
      if (!uNode) continue;
      const spec = getBlockSpec(uNode.kind);
      const outputs =
        uNode.kind === 'inputs'
          ? definition.inputs.map((inp) => ({
              key: inp.name,
              label: inp.name,
              dataType: inp.type,
              ref: `inputs.${inp.name}`,
            }))
          : spec.outputPorts.map((p) => ({
              key: p.key,
              label: p.label,
              dataType: p.dataType,
              ref: `${uNode.name}.${p.key}`,
            }));

      groups.push({
        nodeId: uNode.id,
        nodeName: uNode.kind === 'inputs' ? 'inputs' : uNode.name,
        category: uNode.category,
        outputs,
      });
    }
    result[target.id] = groups;
  }

  return result;
}

function VisionFlowWorkspace() {
  const reactFlow = useReactFlow();
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null);

  // Auth & DB state
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState('unconfigured');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Workflows & Models
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(
    '00000000-0000-4000-8000-000000000001'
  );
  const [definition, setDefinition] = useState<WorkflowDefinition>(() =>
    createDefaultWorkflowDefinition()
  );
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(createDefaultWorkflowDefinition())
  );
  const [undoStack, setUndoStack] = useState<WorkflowDefinition[]>([]);
  const [redoStack, setRedoStack] = useState<WorkflowDefinition[]>([]);

  const [models, setModels] = useState<ModelSummary[]>([]);
  const [streams, setStreams] = useState<StreamSummary[]>([]);

  // UI Panel states
  const [blocksOpen, setBlocksOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightPanelTab>('file');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [canvasLocked, setCanvasLocked] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);

  // Modals
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [integrateModalOpen, setIntegrateModalOpen] = useState(false);
  const [nodeJsonModalText, setNodeJsonModalText] = useState<string | null>(null);
  const [renamingWorkflow, setRenamingWorkflow] = useState(false);
  const [workflowNameDraft, setWorkflowNameDraft] = useState('');

  // Run & Test State
  const [enableSinks, setEnableSinks] = useState(true);
  const [showAllBlockOutputs, setShowAllBlockOutputs] = useState(false);
  const [useBlockCache, setUseBlockCache] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(
    'street_traffic'
  );
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DagRunResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2600);
  }, []);

  // Load initial bootstrap, workflows, models, streams
  const loadInitialData = useCallback(async () => {
    try {
      const [boot, wfRes, modelRes, streamRes] = await Promise.all([
        api.getBootstrapStatus(),
        api.listWorkflows(),
        api.listModels(),
        api.listStreams(),
      ]);
      setNeedsSetup(boot.needsSetup);
      setDatabaseStatus(boot.databaseStatus);
      setModels(modelRes.models);
      setStreams(streamRes.streams);
      if (wfRes.workflows.length > 0) {
        setWorkflows(wfRes.workflows);
        const first = wfRes.workflows[0];
        setActiveWorkflowId(first.id);
        setDefinition(first.definition);
        setSavedSnapshot(JSON.stringify(first.definition));
      }
    } catch (err) {
      console.error('Failed loading initial workspace:', err);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Poll stream stats while any stream is running
  useEffect(() => {
    const anyRunning = streams.some((s) => s.status === 'running');
    if (!anyRunning) return;
    const timer = setInterval(() => {
      void api.listStreams().then((r) => setStreams(r.streams)).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [streams]);

  const activeWorkflow = useMemo<WorkflowSummary>(() => {
    const found = workflows.find((w) => w.id === activeWorkflowId);
    if (found) return found;
    return {
      id: activeWorkflowId,
      userId: null,
      name: 'Detect, Count, and Visualize',
      description: '',
      status: 'draft',
      definition,
      apiKey: 'vf_preview_key',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [workflows, activeWorkflowId, definition]);

  const isDirty = useMemo(
    () => JSON.stringify(definition) !== savedSnapshot,
    [definition, savedSnapshot]
  );

  const commitDefinition = useCallback(
    (updater: (prev: WorkflowDefinition) => WorkflowDefinition, recordHistory = true) => {
      setDefinition((prev) => {
        if (recordHistory) {
          setUndoStack((u) => [...u.slice(-19), prev]);
          setRedoStack([]);
        }
        return updater(prev);
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const previous = u[u.length - 1];
      setRedoStack((r) => [...r, definition]);
      setDefinition(previous);
      return u.slice(0, -1);
    });
  }, [definition]);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const next = r[r.length - 1];
      setUndoStack((u) => [...u, definition]);
      setDefinition(next);
      return r.slice(0, -1);
    });
  }, [definition]);

  const upstreamGroupsByNodeId = useMemo(
    () => buildUpstreamMap(definition),
    [definition]
  );

  const handleRunWorkflow = useCallback(
    async (override?: { imageBase64?: string; sourceType?: string }) => {
      setRunning(true);
      setRunError(null);
      setRightPanelOpen(true);
      try {
        const res = await api.runWorkflow({
          workflowId: activeWorkflow.id,
          definition,
          file: override?.imageBase64 ? undefined : selectedFile ?? undefined,
          imageBase64: override?.imageBase64,
          imageUrl:
            !override?.imageBase64 && !selectedFile && imageUrlInput.trim()
              ? imageUrlInput.trim()
              : undefined,
          sampleId:
            !override?.imageBase64 &&
            !selectedFile &&
            !imageUrlInput.trim()
              ? selectedSampleId ?? 'street_traffic'
              : undefined,
          sourceType: override?.sourceType ?? rightTab,
          enableSinks,
          showAllBlockOutputs,
        });
        setLastResult(res);
      } catch (err) {
        setRunError(
          err instanceof Error ? err.message : 'Workflow execution failed'
        );
      } finally {
        setRunning(false);
      }
    },
    [
      activeWorkflow.id,
      definition,
      selectedFile,
      imageUrlInput,
      selectedSampleId,
      rightTab,
      enableSinks,
      showAllBlockOutputs,
    ]
  );

  const nodeCallbacks = useMemo<SharedNodeCallbacks>(
    () => ({
      models,
      workflowInputs: definition.inputs,
      workflowOutputs: definition.outputs,
      upstreamGroupsByNodeId,
      onSelectNode: (id) => setSelectedNodeId(id),
      onUpdateNodeParams: (nodeId, patch) => {
        commitDefinition((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.id !== nodeId) return n;
            const nextParams = { ...n.params, ...patch };
            const nextSubtitle =
              typeof patch.modelName === 'string' ? patch.modelName : n.subtitle;
            return { ...n, subtitle: nextSubtitle, params: nextParams };
          }),
        }));
      },
      onRenameNode: (nodeId, newName) => {
        commitDefinition((prev) => {
          const target = prev.nodes.find((n) => n.id === nodeId);
          if (!target) return prev;
          const oldName = target.name;
          const sanitize = (s: string) => s.replace(/\s+/g, '_');
          const safeNew = sanitize(newName);

          const updatedNodes = prev.nodes.map((n) => {
            if (n.id === nodeId) return { ...n, name: safeNew };
            // Update references in downstream nodes
            const updatedParams: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(n.params)) {
              if (typeof v === 'string' && v.startsWith(`${oldName}.`)) {
                updatedParams[k] = `${safeNew}.${v.slice(oldName.length + 1)}`;
              } else {
                updatedParams[k] = v;
              }
            }
            return { ...n, params: updatedParams };
          });

          const updatedOutputs = prev.outputs.map((o) =>
            o.value.startsWith(`${oldName}.`)
              ? { ...o, value: `${safeNew}.${o.value.slice(oldName.length + 1)}` }
              : o
          );

          return {
            ...prev,
            nodes: updatedNodes,
            outputs: updatedOutputs,
          };
        });
      },
      onToggleDisableNode: (nodeId) => {
        commitDefinition((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === nodeId ? { ...n, disabled: !n.disabled } : n
          ),
        }));
      },
      onDeleteNode: (nodeId) => {
        commitDefinition((prev) => ({
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== nodeId),
          edges: prev.edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          ),
        }));
        setSelectedNodeId((curr) => (curr === nodeId ? null : curr));
      },
      onDuplicateNode: (nodeId) => {
        commitDefinition((prev) => {
          const orig = prev.nodes.find((n) => n.id === nodeId);
          if (!orig) return prev;
          const newId = `${orig.kind}_${Date.now().toString(36).slice(-4)}`;
          const clone: WorkflowNodeDef = {
            ...orig,
            id: newId,
            name: `${orig.name}_copy`,
            position: { x: orig.position.x + 40, y: orig.position.y + 40 },
          };
          return { ...prev, nodes: [...prev.nodes, clone] };
        });
      },
      onAddWorkflowInput: () => {
        commitDefinition((prev) => ({
          ...prev,
          inputs: [
            ...prev.inputs,
            {
              id: `input-${Date.now().toString(36)}`,
              name: `image_${prev.inputs.length + 1}`,
              type: 'image',
              sourceHint: 'upload',
            },
          ],
        }));
      },
      onRemoveWorkflowInput: (id) => {
        commitDefinition((prev) => ({
          ...prev,
          inputs: prev.inputs.filter((i) => i.id !== id),
        }));
      },
      onAddWorkflowOutput: (name, value, dataType) => {
        commitDefinition((prev) => {
          const outName = name || `output_${prev.outputs.length + 1}`;
          const newItem: WorkflowOutputMapping = {
            id: `out-${Date.now().toString(36)}`,
            name: outName,
            value: value || 'model.predictions',
            dataType: (dataType as WorkflowOutputMapping['dataType']) || 'any',
          };
          return { ...prev, outputs: [...prev.outputs, newItem] };
        });
      },
      onUpdateWorkflowOutput: (id, patch) => {
        commitDefinition((prev) => ({
          ...prev,
          outputs: prev.outputs.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        }));
      },
      onRemoveWorkflowOutput: (id) => {
        commitDefinition((prev) => ({
          ...prev,
          outputs: prev.outputs.filter((o) => o.id !== id),
        }));
      },
      onOpenModelRegistry: () => setModelModalOpen(true),
      onInspectNodeJson: (nodeId) => {
        const found = definition.nodes.find((n) => n.id === nodeId);
        if (found) setNodeJsonModalText(JSON.stringify(found, null, 2));
      },
      onQuickTestWorkflow: () => {
        void handleRunWorkflow();
      },
    }),
    [
      models,
      definition,
      upstreamGroupsByNodeId,
      commitDefinition,
      handleRunWorkflow,
    ]
  );

  const rfNodes = useMemo(
    () =>
      definition.nodes.map((n) =>
        defNodeToRfNode(n, nodeCallbacks, selectedNodeId)
      ),
    [definition.nodes, nodeCallbacks, selectedNodeId]
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      definition.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'dashed',
      })),
    [definition.edges]
  );

  const onNodesChange: OnNodesChange<Node> = useCallback(
    (changes) => {
      const posChanges = changes.getByType('position');
      if (posChanges.length > 0) {
        const updatedRf = changes.applyTo(rfNodes);
        const posById = new Map<string, { x: number; y: number }>(
          updatedRf.map((n) => [n.id, n.position])
        );
        setDefinition((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => ({
            ...n,
            position: posById.get(n.id) ?? n.position,
          })),
        }));
      }
      const selChanges = changes.getByType('select');
      const newlySelected = selChanges.find((c) => c.selected);
      if (newlySelected) {
        setSelectedNodeId(newlySelected.id);
      }
    },
    [rfNodes]
  );

  const onEdgesChange: OnEdgesChange<Edge> = useCallback(
    (changes) => {
      if (changes.getByType('remove').length > 0) {
        const nextEdges = changes.applyTo(rfEdges);
        commitDefinition((prev) => ({
          ...prev,
          edges: nextEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
          })),
        }));
      }
    },
    [rfEdges, commitDefinition]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      commitDefinition((prev) => {
        const nextEdges = addEdge(
          {
            ...connection,
            id: `e-${connection.source}-${connection.target}-${Date.now().toString(36)}`,
            type: 'dashed',
          },
          prev.edges.map((e) => ({ ...e, type: 'dashed' }))
        );
        return {
          ...prev,
          edges: nextEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
          })),
        };
      });
    },
    [commitDefinition]
  );

  const handleAddBlock = useCallback(
    (block: BlockCatalogItem, dropPos?: { x: number; y: number }) => {
      if (block.kind === 'inputs' || block.kind === 'outputs') {
        showToast('Inputs and Outputs anchor nodes are already on the canvas.');
        return;
      }

      commitDefinition((prev) => {
        const existingCount = prev.nodes.filter((n) => n.kind === block.kind).length;
        const uniqueName =
          existingCount === 0
            ? block.defaultName
            : `${block.defaultName}_${existingCount + 1}`;
        const newId = `${block.kind}_${Date.now().toString(36).slice(-4)}`;

        const pos = dropPos ?? {
          x: 280 + (prev.nodes.length % 3) * 45,
          y: 260 + (prev.nodes.length % 4) * 55,
        };

        const newNode: WorkflowNodeDef = {
          id: newId,
          kind: block.kind,
          name: uniqueName,
          subtitle: block.defaultSubtitle,
          category: block.category,
          position: pos,
          params: { ...block.defaultParams },
        };

        return {
          ...prev,
          nodes: [...prev.nodes, newNode],
        };
      });
    },
    [commitDefinition, showToast]
  );

  const handleAutoLayout = useCallback(() => {
    commitDefinition((prev) => {
      // Compute topological level for top-to-bottom DAG layout
      const levels = new Map<string, number>();
      prev.nodes.forEach((n) => levels.set(n.id, 0));
      for (let i = 0; i < prev.nodes.length; i++) {
        for (const e of prev.edges) {
          const srcLvl = levels.get(e.source) ?? 0;
          const tgtLvl = levels.get(e.target) ?? 0;
          if (tgtLvl <= srcLvl) {
            levels.set(e.target, srcLvl + 1);
          }
        }
      }
      const byLevel = new Map<number, WorkflowNodeDef[]>();
      for (const n of prev.nodes) {
        const lvl = levels.get(n.id) ?? 0;
        const list = byLevel.get(lvl) ?? [];
        list.push(n);
        byLevel.set(lvl, list);
      }

      const positioned = prev.nodes.map((n) => {
        const lvl = levels.get(n.id) ?? 0;
        const peers = byLevel.get(lvl) ?? [n];
        const idx = peers.findIndex((p) => p.id === n.id);
        const totalW = peers.length * 300;
        const startX = 400 - totalW / 2 + 25;
        return {
          ...n,
          position: {
            x: Math.round(startX + idx * 300),
            y: 30 + lvl * 155,
          },
        };
      });

      return { ...prev, nodes: positioned };
    });
    setTimeout(() => reactFlow.fitView({ padding: 0.2, duration: 250 }), 40);
  }, [commitDefinition, reactFlow]);

  async function handleSaveWorkflow(deployAfter = false) {
    if (!user) {
      setAuthModalOpen(true);
      showToast('Sign in to save or deploy workflows.');
      return;
    }
    setSaving(true);
    try {
      const existsInStore = workflows.some((w) => w.id === activeWorkflow.id);
      let saved: WorkflowSummary;
      if (existsInStore) {
        const res = await api.updateWorkflow(activeWorkflow.id, {
          name: activeWorkflow.name,
          definition,
          status: deployAfter ? 'deployed' : activeWorkflow.status,
        });
        saved = res.workflow;
      } else {
        const res = await api.createWorkflow({
          name: activeWorkflow.name,
          definition,
        });
        saved = res.workflow;
        if (deployAfter) {
          const dep = await api.deployWorkflow(saved.id);
          saved = dep.workflow;
        }
      }

      setWorkflows((prev) => {
        const idx = prev.findIndex((w) => w.id === saved.id);
        if (idx === -1) return [saved, ...prev];
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      });
      setActiveWorkflowId(saved.id);
      setSavedSnapshot(JSON.stringify(definition));
      showToast(
        deployAfter
          ? 'Workflow deployed! Inference API endpoint is live.'
          : 'Workflow draft saved.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateNewWorkflowTab() {
    if (!user) {
      setAuthModalOpen(true);
      showToast('Sign in to create additional workflows.');
      return;
    }
    try {
      const freshDef = createDefaultWorkflowDefinition();
      const res = await api.createWorkflow({
        name: `Pipeline ${workflows.length + 1}`,
        definition: freshDef,
      });
      setWorkflows((prev) => [...prev, res.workflow]);
      setActiveWorkflowId(res.workflow.id);
      setDefinition(res.workflow.definition);
      setSavedSnapshot(JSON.stringify(res.workflow.definition));
      setSelectedNodeId(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create workflow');
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden text-slate-900">
      {/* Row 1: Top Workflow Tabs Chrome */}
      <header className="h-11 shrink-0 bg-white border-b border-slate-200 px-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 shrink-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#7c3aed] text-white">
              <GitBranch className="w-3.5 h-3.5" />
            </div>
            <span className="font-display text-[13.5px] font-bold tracking-tight text-slate-900 whitespace-nowrap">
              VisionFlow
            </span>
          </div>

          <div className="flex items-center gap-1 min-w-0">
            {(workflows.length > 0 ? workflows : [activeWorkflow]).map((wf) => {
              const active = wf.id === activeWorkflow.id;
              return (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkflowId(wf.id);
                    setDefinition(wf.definition);
                    setSavedSnapshot(JSON.stringify(wf.definition));
                    setSelectedNodeId(null);
                  }}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1 text-[12.5px] font-medium transition whitespace-nowrap shrink-0 ${
                    active
                      ? 'border border-slate-200 bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                  <span className="max-w-[180px] truncate">{wf.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleCreateNewWorkflowTab}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
              title="New workflow tab"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {renamingWorkflow ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (workflowNameDraft.trim()) {
                  setWorkflows((prev) =>
                    prev.map((w) =>
                      w.id === activeWorkflow.id
                        ? { ...w, name: workflowNameDraft.trim() }
                        : w
                    )
                  );
                }
                setRenamingWorkflow(false);
              }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                value={workflowNameDraft}
                onChange={(e) => setWorkflowNameDraft(e.target.value)}
                onBlur={() => setRenamingWorkflow(false)}
                className="rounded-md border border-violet-400 px-2 py-1 text-[12px] w-44 focus:outline-none"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setWorkflowNameDraft(activeWorkflow.name);
                setRenamingWorkflow(true);
              }}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Rename workflow"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setModelModalOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Cpu className="w-3.5 h-3.5 text-[#7c3aed]" />
            <span>Models ({models.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <User className="w-3.5 h-3.5 text-slate-600" />
            <span>{user ? user.name : 'Sign In'}</span>
          </button>

          <button
            type="button"
            onClick={() => setRightPanelOpen((v) => !v)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="Toggle Run Workflow sidebar"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Row 2: Draft / Deploy Status Sub-Header */}
      <div className="h-11 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {activeWorkflow.status === 'deployed' && !isDirty ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-700 whitespace-nowrap">
              <Check className="w-3.5 h-3.5" />
              <span>Deployed — REST API &amp; Stream Service Live</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#fef3c7] px-2.5 py-1 text-[12px] font-medium text-[#b45309] whitespace-nowrap">
              <Edit3 className="w-3.5 h-3.5" />
              <span>
                {isDirty ? 'Unsaved changes' : 'Draft saved — not deployed yet'}
              </span>
            </span>
          )}

          {toastMessage && (
            <span className="text-[12px] font-medium text-[#7c3aed] truncate">
              {toastMessage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 relative">
          <button
            type="button"
            onClick={() => setIntegrateModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Integrate</span>
          </button>

          <div className="inline-flex rounded-lg border border-slate-200 bg-white shadow-2xs">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveWorkflow(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 rounded-l-lg whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5 text-slate-500" />
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSaveMenu((v) => !v)}
              className="border-l border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50 rounded-r-lg"
              aria-label="More save and deploy options"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {showSaveMenu && (
            <div className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setShowSaveMenu(false);
                  void handleSaveWorkflow(true);
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12.5px] font-medium text-slate-800 hover:bg-violet-50 hover:text-[#7c3aed]"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Save &amp; Deploy as API Service</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSaveMenu(false);
                  setIntegrateModalOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>View DAG JSON &amp; API</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main 3-Column Workspace */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Center Node Canvas */}
        <div
          ref={reactFlowWrapperRef}
          className="flex-1 relative h-full bg-white"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/visionflow-block')) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            const blockKind = e.dataTransfer.getData('application/visionflow-block');
            if (!blockKind) return;
            e.preventDefault();
            const spec = getBlockSpec(blockKind as WorkflowNodeDef['kind']);
            const pos = reactFlow.screenToFlowPosition({
              x: e.clientX,
              y: e.clientY,
            });
            handleAddBlock(spec, pos);
          }}
        >
          {/* Floating Top-Left Toolbar */}
          <div className="absolute left-4 top-3.5 z-20 flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setModelModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-[#7c3aed] hover:bg-violet-50 whitespace-nowrap"
            >
              <span>Local YOLO</span>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            <div className="h-4 w-px bg-slate-200 mx-0.5" />
            <button
              type="button"
              onClick={() => setModelModalOpen(true)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Model Registry"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIntegrateModalOpen(true)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Integrate & REST API"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setBlocksOpen((v) => !v)}
              className={`rounded-md p-1.5 transition ${
                blocksOpen
                  ? 'bg-violet-50 text-[#7c3aed]'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Toggle Workflow Blocks"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIntegrateModalOpen(true)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Share Endpoint"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleRunWorkflow()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Evaluate</span>
            </button>
          </div>

          {/* Floating Top-Right Canvas Actions */}
          <div className="absolute right-4 top-3.5 z-20 flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (lastResult) {
                    showToast(
                      `Last run: ${lastResult.detection_count} detections in ${lastResult.duration_ms}ms`
                    );
                  } else {
                    showToast('Run the workflow to inspect execution history.');
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50"
                title="Execution History"
              >
                <History className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleRunWorkflow()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-medium text-slate-800 shadow-xs hover:bg-slate-50"
              >
                <Play className="w-3.5 h-3.5 text-slate-700" />
                <span>Run</span>
              </button>
              <button
                type="button"
                onClick={handleAutoLayout}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-medium text-slate-700 shadow-xs hover:bg-slate-50"
                title="Auto-arrange DAG top-to-bottom"
              >
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Auto</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
            </div>
            {isDirty && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500 pr-1">
                <span>Unsaved changes</span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      setDefinition(JSON.parse(savedSnapshot) as WorkflowDefinition);
                      setSelectedNodeId(null);
                    } catch {
                      // ignore
                    }
                  }}
                  className="font-medium text-slate-700 hover:text-slate-900 underline"
                >
                  Discard
                </button>
              </div>
            )}
          </div>

          {/* Left Floating Workflow Blocks Palette */}
          <WorkflowBlocksSidebar
            open={blocksOpen}
            onClose={() => setBlocksOpen(false)}
            onAddBlock={(item) => handleAddBlock(item)}
          />

          {/* React Flow DAG Canvas */}
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={() => setSelectedNodeId(null)}
            nodesDraggable={!canvasLocked}
            nodesConnectable={!canvasLocked}
            elementsSelectable={!canvasLocked}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{ type: 'dashed' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1.25}
              color="#cbd5e1"
              bgColor="#ffffff"
            />
            {showMinimap && (
              <MiniMap
                position="bottom-left"
                pannable
                zoomable
                className="!rounded-xl !border !border-slate-200 !shadow-md"
              />
            )}
          </ReactFlow>

          {/* Floating Bottom-Center Canvas Controls Toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-md">
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
              title="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
              title="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={handleAutoLayout}
              className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-[#7c3aed] hover:bg-violet-100"
              title="Auto-layout DAG"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
            <div className="h-4 w-px bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={() => reactFlow.zoomOut({ duration: 150 })}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              title="Zoom out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => reactFlow.zoomIn({ duration: 150 })}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              title="Zoom in"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCanvasLocked((v) => !v)}
              className={`rounded-md p-1.5 ${
                canvasLocked
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title={canvasLocked ? 'Unlock canvas' : 'Lock canvas'}
            >
              {canvasLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Unlock className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => reactFlow.fitView({ padding: 0.2, duration: 250 })}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              title="Fit view"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowMinimap((v) => !v)}
              className={`rounded-md p-1.5 ${
                showMinimap
                  ? 'bg-violet-50 text-[#7c3aed]'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Toggle minimap"
            >
              <MapIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Sidebar: Run & Test Panel */}
        <RunWorkflowPanel
          open={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          activeTab={rightTab}
          onTabChange={setRightTab}
          workflowId={activeWorkflow.id}
          user={user}
          onRequireAuth={() => setAuthModalOpen(true)}
          running={running}
          runError={runError}
          lastResult={lastResult}
          enableSinks={enableSinks}
          onToggleEnableSinks={setEnableSinks}
          showAllBlockOutputs={showAllBlockOutputs}
          onToggleShowAllBlockOutputs={setShowAllBlockOutputs}
          useBlockCache={useBlockCache}
          onToggleUseBlockCache={setUseBlockCache}
          selectedFile={selectedFile}
          selectedSampleId={selectedSampleId}
          imageUrlInput={imageUrlInput}
          onSelectFile={setSelectedFile}
          onSelectSample={setSelectedSampleId}
          onChangeImageUrl={setImageUrlInput}
          onRunWithSource={handleRunWorkflow}
          streams={streams}
          onRefreshStreams={() => {
            void api.listStreams().then((r) => setStreams(r.streams));
          }}
          onCreateStream={async (payload) => {
            const res = await api.createStream({
              ...payload,
              workflowId: activeWorkflow.id,
            });
            setStreams((prev) => [res.stream, ...prev]);
          }}
          onStartStream={async (id) => {
            if (!user) {
              setAuthModalOpen(true);
              return;
            }
            const res = await api.startStream(id);
            setStreams((prev) =>
              prev.map((s) => (s.id === id ? res.stream : s))
            );
          }}
          onStopStream={async (id) => {
            if (!user) {
              setAuthModalOpen(true);
              return;
            }
            const res = await api.stopStream(id);
            setStreams((prev) =>
              prev.map((s) => (s.id === id ? res.stream : s))
            );
          }}
          onDeleteStream={async (id) => {
            if (!user) {
              setAuthModalOpen(true);
              return;
            }
            await api.deleteStream(id);
            setStreams((prev) => prev.filter((s) => s.id !== id));
          }}
        />
      </div>

      {/* Modals */}
      <ModelRegistryModal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        models={models}
        user={user}
        onRequireAuth={() => setAuthModalOpen(true)}
        onUploadModel={async (file, name) => {
          const res = await api.uploadModel(file, name);
          setModels((prev) => [res.model, ...prev]);
          showToast(
            `Model "${res.model.name}" registered (${res.model.classNames.length} classes extracted).`
          );
        }}
        onDeleteModel={async (id) => {
          await api.deleteModel(id);
          setModels((prev) => prev.filter((m) => m.id !== id));
        }}
        onUseModelInCanvas={(model) => {
          commitDefinition((prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) =>
              n.kind === 'yolo_detection' ||
              n.kind === 'yolo_segmentation' ||
              n.kind === 'yolo_pose'
                ? {
                    ...n,
                    subtitle: model.name,
                    params: {
                      ...n.params,
                      modelId: model.id,
                      modelName: model.name,
                    },
                  }
                : n
            ),
          }));
          showToast(`Assigned ${model.name} to model node.`);
        }}
      />

      <IntegrateApiModal
        open={integrateModalOpen}
        onClose={() => setIntegrateModalOpen(false)}
        workflow={activeWorkflow}
        definition={definition}
        onDeploy={() => handleSaveWorkflow(true)}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        needsSetup={needsSetup}
        databaseStatus={databaseStatus}
        onLogin={(email, password) => api.login({ email, password })}
        onRegister={(name, email, password) =>
          api.register({ name, email, password })
        }
        onAuthSuccess={(token, authUser) => {
          setAuthToken(token);
          setUser(authUser);
          setNeedsSetup(false);
          void loadInitialData();
          showToast(`Signed in as ${authUser.name}`);
        }}
      />

      <NodeJsonModal
        nodeJson={nodeJsonModalText}
        onClose={() => setNodeJsonModalText(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <VisionFlowWorkspace />
    </ReactFlowProvider>
  );
}
