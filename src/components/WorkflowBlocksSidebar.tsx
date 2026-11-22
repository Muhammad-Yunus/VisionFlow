import React, { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  Filter,
  GitBranch,
  Layers,
  Lock,
  Plus,
  Radio,
  ScanLine,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Webhook,
  X,
} from 'lucide-react';
import {
  BLOCK_CATEGORIES,
  WORKFLOW_BLOCKS,
  type BlockCategoryId,
  type BlockCatalogItem,
} from '../shared/workflowSchema';

interface WorkflowBlocksSidebarProps {
  open: boolean;
  locked?: boolean;
  onClose: () => void;
  onAddBlock: (item: BlockCatalogItem) => void;
}

function CategoryIcon({
  id,
  className = 'w-4 h-4',
}: {
  id: BlockCategoryId;
  className?: string;
}) {
  switch (id) {
    case 'model':
      return <Cpu className={className} />;
    case 'visualization':
      return <Eye className={className} />;
    case 'logic_video':
      return <GitBranch className={className} />;
    case 'inputs':
      return <ArrowDownToLine className={className} />;
    case 'outputs_sinks':
      return <ArrowUpFromLine className={className} />;
  }
}

function BlockItemIcon({
  kind,
  className = 'w-4 h-4',
}: {
  kind: BlockCatalogItem['kind'];
  className?: string;
}) {
  switch (kind) {
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
    default:
      return <ArrowUpFromLine className={className} />;
  }
}

export function WorkflowBlocksSidebar({
  open,
  locked = false,
  onClose,
  onAddBlock,
}: WorkflowBlocksSidebarProps) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'popular'>('all');
  const [selectedCategory, setSelectedCategory] =
    useState<BlockCategoryId | null>(null);
  const [viewAllFlat, setViewAllFlat] = useState(false);

  const activeCategorySpec = useMemo(
    () => BLOCK_CATEGORIES.find((c) => c.id === selectedCategory) ?? null,
    [selectedCategory]
  );

  const filteredBlocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return WORKFLOW_BLOCKS.filter((b) => {
      if (selectedCategory && !viewAllFlat && b.category !== selectedCategory) {
        return false;
      }
      if (filterMode === 'popular' && !b.popular) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.kind.toLowerCase().includes(q)
      );
    });
  }, [search, filterMode, selectedCategory, viewAllFlat]);

  if (!open) return null;

  const showBlockList =
    viewAllFlat || selectedCategory !== null || search.trim().length > 0;

  return (
    <aside className="absolute left-4 top-[68px] bottom-4 z-20 w-[274px] flex flex-col rounded-xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {activeCategorySpec && !viewAllFlat && (
            <span
              style={{
                backgroundColor: activeCategorySpec.bgTintHex,
                color: activeCategorySpec.textHex,
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            >
              <CategoryIcon id={activeCategorySpec.id} className="w-3.5 h-3.5" />
            </span>
          )}
          <h2 className="font-display text-[14.5px] font-semibold text-slate-900 truncate">
            {activeCategorySpec && !viewAllFlat
              ? activeCategorySpec.title
              : 'Workflow Blocks'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close blocks panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search + Segmented Filter */}
      <div className="px-3.5 pb-3 space-y-2.5 border-b border-slate-100">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflow blocks"
            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-[12.5px] text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${
              filterMode === 'all'
                ? 'bg-[#f3e8ff] text-[#7c3aed]'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('popular')}
            className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${
              filterMode === 'popular'
                ? 'bg-[#f3e8ff] text-[#7c3aed]'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Popular
          </button>
        </div>
      </div>

      {/* Locked notice */}
      {locked && (
        <div className="mx-3.5 mt-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
          <Lock className="w-3.5 h-3.5 shrink-0 text-amber-700" />
          <span>Workflow locked — unlock to add blocks</span>
        </div>
      )}

      {/* Body: Categories or Blocks */}
      <div className="flex-1 overflow-y-auto vf-scroll px-2.5 py-2">
        {!showBlockList ? (
          <div className="space-y-1">
            {BLOCK_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setViewAllFlat(false);
                }}
                className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50 transition"
              >
                <span
                  style={{ backgroundColor: cat.bgTintHex, color: cat.textHex }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                >
                  <CategoryIcon id={cat.id} className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-slate-900 leading-tight">
                    {cat.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 leading-snug">
                    {cat.description}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {selectedCategory && !viewAllFlat && (
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="flex items-center gap-1 px-2 py-1.5 text-[12px] font-medium text-slate-700 hover:text-slate-900"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            {filteredBlocks.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-slate-500">
                No blocks match your search.
              </div>
            ) : (
              filteredBlocks.map((block) => {
                const cat =
                  BLOCK_CATEGORIES.find((c) => c.id === block.category) ??
                  BLOCK_CATEGORIES[0];
                return (
                  <div
                    key={block.kind}
                    draggable={!locked}
                    onDragStart={(e) => {
                      if (locked) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData(
                        'application/visionflow-block',
                        block.kind
                      );
                    }}
                    onClick={() => onAddBlock(block)}
                    className={`group flex items-start gap-2.5 rounded-lg border border-transparent p-2 transition ${
                      locked
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:border-slate-200 hover:bg-slate-50 cursor-pointer'
                    }`}
                    title={
                      locked
                        ? 'Workflow is locked — unlock to add blocks'
                        : 'Click or drag onto canvas'
                    }
                  >
                    <span
                      style={{
                        backgroundColor: cat.bgTintHex,
                        color: cat.textHex,
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5"
                    >
                      <BlockItemIcon kind={block.kind} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[12.5px] font-semibold text-slate-900 leading-tight truncate">
                          {block.title}
                        </span>
                        <Plus className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0" />
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                        {block.description}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Footer button */}
      <button
        type="button"
        onClick={() => {
          setViewAllFlat((v) => !v);
          setSelectedCategory(null);
        }}
        className="border-t border-slate-100 bg-white px-4 py-2.5 text-center text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 transition"
      >
        {viewAllFlat ? 'Browse by Category' : 'View All Blocks'}
      </button>
    </aside>
  );
}
