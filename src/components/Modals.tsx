import React, { useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Database,
  FileCode2,
  History,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { WorkflowDefinition } from '../shared/workflowSchema';
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from '../shared/workflowTemplates';
import type {
  ApiCallLogSummary,
  AuthUser,
  InferenceRunSummary,
  ModelSummary,
  WorkflowSummary,
} from '../types/visionflow';

/* ---------------- Model Registry Modal ---------------- */
export function ModelRegistryModal({
  open,
  onClose,
  models,
  user,
  onRequireAuth,
  onUploadModel,
  onDeleteModel,
  onUseModelInCanvas,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelSummary[];
  user: AuthUser | null;
  onRequireAuth: () => void;
  onUploadModel: (file: File, name?: string) => Promise<void>;
  onDeleteModel: (id: string) => Promise<void>;
  onUseModelInCanvas: (model: ModelSummary) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');

  if (!open) return null;

  async function handleFile(file: File) {
    if (!user) {
      onRequireAuth();
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await onUploadModel(file, customName.trim() || undefined);
      setCustomName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Model upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3e8ff] text-[#7c3aed]">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-slate-900">
                Local YOLO Model Registry
              </h3>
              <p className="text-[12px] text-slate-500">
                Upload .pt or .onnx weights for automatic class_names &amp; task extraction
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto vf-scroll space-y-4">
          <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-slate-900">
                  Register YOLO Model File
                </div>
                <div className="text-[11.5px] text-slate-500">
                  Supports Ultralytics YOLOv5 / YOLOv8 / YOLO11 (.onnx &amp; .pt)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Optional alias (e.g. defect-v2)"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] w-48 focus:border-violet-500 focus:outline-none"
                />
                <input
                  ref={inputRef}
                  type="file"
                  accept=".onnx,.pt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    if (!user) {
                      onRequireAuth();
                      return;
                    }
                    inputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-60"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Inspecting...' : 'Upload .pt / .onnx'}</span>
                </button>
              </div>
            </div>
            {error && (
              <div className="text-[12px] text-rose-600 font-medium">{error}</div>
            )}
          </div>

          <div className="space-y-2.5">
            {models.map((model) => (
              <div
                key={model.id}
                className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-slate-900 truncate">
                        {model.name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {model.format.toUpperCase()} · {model.task} · [
                        {model.inputShape.join('×')}]
                      </span>
                    </div>
                    <div className="text-[11.5px] text-slate-500 tabular-nums mt-0.5">
                      {model.classNames.length} classes extracted ·{' '}
                      {(model.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB ·{' '}
                      {model.format === 'onnx'
                        ? 'ONNX Runtime ready'
                        : 'Metadata only (export to .onnx for CPU inference)'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onUseModelInCanvas(model);
                        onClose();
                      }}
                      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12px] font-medium text-violet-700 hover:bg-violet-100"
                    >
                      Use in Workflow
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteModel(model.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete model"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100 truncate">
                  class_names: [{model.classNames.slice(0, 12).join(', ')}
                  {model.classNames.length > 12
                    ? `, +${model.classNames.length - 12} more`
                    : ''}
                  ]
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Integrate & API Serving Modal ---------------- */
export function IntegrateApiModal({
  open,
  onClose,
  workflow,
  definition,
  onDeploy,
}: {
  open: boolean;
  onClose: () => void;
  workflow: WorkflowSummary;
  definition: WorkflowDefinition;
  onDeploy: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'curl' | 'python' | 'js' | 'dag'>('curl');
  const [copied, setCopied] = useState(false);
  const [deploying, setDeploying] = useState(false);

  if (!open) return null;

  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const endpoint = `${baseUrl}/api/v1/workflows/${workflow.id}/infer`;

  const snippets: Record<typeof tab, string> = {
    curl: `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${workflow.apiKey}" \\
  -d '{
    "image": "<BASE64_IMAGE_OR_DATA_URI>",
    "enableSinks": true
  }'`,
    python: `import base64, requests

with open("sample.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode("utf-8")

res = requests.post(
    "${endpoint}",
    headers={"X-API-Key": "${workflow.apiKey}"},
    json={"image": b64, "enableSinks": True},
)
print(res.json())`,
    js: `const response = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${workflow.apiKey}",
  },
  body: JSON.stringify({
    image: base64Image,
    enableSinks: true,
  }),
});
const result = await response.json();
console.log(result.outputs);`,
    dag: JSON.stringify(definition, null, 2),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3e8ff] text-[#7c3aed]">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-slate-900">
                Serve Workflow REST API
              </h3>
              <p className="text-[12px] text-slate-500">
                POST /api/v1/workflows/{workflow.id}/infer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={deploying}
              onClick={async () => {
                setDeploying(true);
                try {
                  await onDeploy();
                } finally {
                  setDeploying(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-60"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>
                {workflow.status === 'deployed'
                  ? 'Deployed'
                  : deploying
                    ? 'Deploying...'
                    : 'Deploy Service'}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto vf-scroll space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-500">
                Workflow API Key (X-API-Key)
              </div>
              <div className="font-mono text-[12.5px] text-slate-900 truncate mt-0.5">
                {workflow.apiKey || 'Save workflow to PostgreSQL to generate API key'}
              </div>
            </div>
            <button
              type="button"
              disabled={!workflow.apiKey}
              onClick={() => {
                if (!workflow.apiKey) return;
                void navigator.clipboard.writeText(workflow.apiKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 shrink-0"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <KeyRound className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copied' : 'Copy Key'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1 border-b border-slate-200">
            {(['curl', 'python', 'js', 'dag'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-[12px] font-medium border-b-2 transition ${
                  tab === t
                    ? 'border-[#7c3aed] text-[#7c3aed]'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {t === 'curl'
                  ? 'cURL'
                  : t === 'python'
                    ? 'Python'
                    : t === 'js'
                      ? 'JavaScript'
                      : 'DAG JSON Schema'}
              </button>
            ))}
          </div>

          <div className="relative rounded-xl border border-slate-200 bg-slate-950 p-4">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(snippets[tab]);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
            >
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </button>
            <pre className="text-[12px] font-mono text-slate-100 overflow-x-auto vf-scroll max-h-[340px] leading-relaxed">
              {snippets[tab]}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Auth Modal ---------------- */
export function AuthModal({
  open,
  onClose,
  needsSetup,
  databaseStatus,
  onAuthSuccess,
  onLogin,
  onRegister,
}: {
  open: boolean;
  onClose: () => void;
  needsSetup: boolean;
  databaseStatus: string;
  onAuthSuccess: (token: string, user: AuthUser) => void;
  onLogin: (email: string, password: string) => Promise<{ token: string; user: AuthUser }>;
  onRegister: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ token: string; user: AuthUser }>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>(
    needsSetup ? 'register' : 'login'
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res =
        mode === 'register'
          ? await onRegister(name, email, password)
          : await onLogin(email, password);
      onAuthSuccess(res.token, res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3e8ff] text-[#7c3aed]">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-slate-900">
                {mode === 'register' ? 'Create VisionFlow Account' : 'Sign In to VisionFlow'}
              </h3>
              <p className="text-[11.5px] text-slate-500 flex items-center gap-1.5">
                <Database className="w-3 h-3" />
                <span>
                  PostgreSQL:{' '}
                  {databaseStatus === 'connected'
                    ? 'Connected (Drizzle ORM)'
                    : 'Not connected — set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in Secrets'}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-md py-1.5 text-[12px] font-medium transition ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`rounded-md py-1.5 text-[12px] font-medium transition ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              Register
            </button>
          </div>

          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-slate-700">
                Full Name
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-slate-700">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@company.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-violet-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#7c3aed] py-2.5 text-[13px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-60"
          >
            {submitting
              ? 'Authenticating...'
              : mode === 'register'
                ? 'Create Account & Continue'
                : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Node JSON Inspector Modal ---------------- */
export function NodeJsonModal({
  nodeJson,
  onClose,
}: {
  nodeJson: string | null;
  onClose: () => void;
}) {
  if (!nodeJson) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-[#7c3aed]" />
            <h3 className="font-display text-[14px] font-semibold text-slate-900">
              Node Definition JSON
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <pre className="p-4 text-[12px] font-mono bg-slate-950 text-slate-100 overflow-auto max-h-[60vh]">
          {nodeJson}
        </pre>
      </div>
    </div>
  );
}

/* ---------------- Execution History Modal (PostgreSQL inference_runs) ---------------- */
export function ExecutionHistoryModal({
  open,
  onClose,
  runs,
  loading,
  error,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  runs: InferenceRunSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3e8ff] text-[#7c3aed]">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-slate-900">
                Inference Execution History
              </h3>
              <p className="text-[12px] text-slate-500">
                Recorded runs from PostgreSQL (inference_runs)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Refresh runs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto vf-scroll space-y-2.5">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          {!error && !loading && runs.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-[12.5px] text-slate-500">
              No inference runs recorded for this workflow yet. Run the workflow to log an execution.
            </div>
          )}

          {runs.map((run) => {
            const infId =
              typeof run.resultSummary?.inference_id === 'string'
                ? run.resultSummary.inference_id
                : run.id;
            return (
              <div
                key={run.id}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-violet-700">
                      {run.sourceType}
                    </span>
                    <span className="font-mono text-[11.5px] text-slate-800 truncate">
                      {infId}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {new Date(run.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[12px] font-mono tabular-nums shrink-0">
                  <span className="font-semibold text-emerald-700">
                    {run.detectionCount} det
                  </span>
                  <span className="text-slate-500">{run.durationMs}ms</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- API Call Logs Modal (PostgreSQL api_call_logs) ---------------- */
export function ApiCallLogsModal({
  open,
  onClose,
  logs,
  loading,
  error,
  filters,
  onChangeFilters,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  logs: ApiCallLogSummary[];
  loading: boolean;
  error: string | null;
  filters: {
    method: string;
    status: string;
    endpoint: string;
  };
  onChangeFilters: (next: {
    method: string;
    status: string;
    endpoint: string;
  }) => void;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!open) return null;

  const totalCount = logs.length;
  const successCount = logs.filter(
    (l) => l.statusCode >= 200 && l.statusCode < 300
  ).length;
  const successRate =
    totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
  const avgLatency =
    totalCount > 0
      ? Math.round(logs.reduce((acc, l) => acc + l.durationMs, 0) / totalCount)
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3e8ff] text-[#7c3aed]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-slate-900">
                API Call Logs
              </h3>
              <p className="text-[12px] text-slate-500">
                REST API &amp; workflow inference request logs stored in PostgreSQL
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.endpoint}
              onChange={(e) =>
                onChangeFilters({ ...filters, endpoint: e.target.value })
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 focus:border-violet-500 focus:outline-none"
              aria-label="Filter by endpoint"
            >
              <option value="ALL">All Endpoints</option>
              <option value="infer">Serve API (/v1/.../infer)</option>
              <option value="run">Run Test (/workflows/run)</option>
            </select>

            <select
              value={filters.method}
              onChange={(e) =>
                onChangeFilters({ ...filters, method: e.target.value })
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 focus:border-violet-500 focus:outline-none"
              aria-label="Filter by HTTP method"
            >
              <option value="ALL">All Methods</option>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>

            <select
              value={filters.status}
              onChange={(e) =>
                onChangeFilters({ ...filters, status: e.target.value })
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 focus:border-violet-500 focus:outline-none"
              aria-label="Filter by status code"
            >
              <option value="ALL">All Statuses</option>
              <option value="2xx">2xx Success</option>
              <option value="4xx_5xx">4xx / 5xx Errors</option>
            </select>
          </div>

          <div className="flex items-center gap-4 text-[12px] tabular-nums">
            <span className="text-slate-500">
              Requests: <strong className="text-slate-900">{totalCount}</strong>
            </span>
            <span className="text-slate-500">
              2xx Rate:{' '}
              <strong className="text-emerald-700">{successRate}%</strong>
            </span>
            <span className="text-slate-500">
              Avg Latency:{' '}
              <strong className="font-mono text-slate-900">{avgLatency}ms</strong>
            </span>
          </div>
        </div>

        <div className="p-5 overflow-y-auto vf-scroll space-y-2">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          {!error && !loading && logs.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-[12.5px] text-slate-500">
              No API calls match the selected filter yet. Execute a workflow or send a request to{' '}
              <code className="font-mono text-slate-700">/api/v1/workflows/:id/infer</code>.
            </div>
          )}

          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            const isOk = log.statusCode >= 200 && log.statusCode < 300;
            const isWarn = log.statusCode >= 400 && log.statusCode < 500;
            const methodTone =
              log.method === 'POST'
                ? 'bg-violet-50 text-violet-700 border-violet-200'
                : log.method === 'DELETE'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : log.method === 'PUT'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-sky-50 text-sky-700 border-sky-200';
            const statusTone = isOk
              ? 'bg-emerald-50 text-emerald-700'
              : isWarn
                ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700';

            const detCount =
              typeof log.responseSummary?.detection_count === 'number'
                ? log.responseSummary.detection_count
                : null;

            return (
              <div
                key={log.id}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10.5px] font-mono font-semibold shrink-0 ${methodTone}`}
                    >
                      {log.method}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold shrink-0 ${statusTone}`}
                    >
                      {log.statusCode}
                    </span>
                    <span className="font-mono text-[12px] text-slate-900 truncate">
                      {log.path}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11.5px] shrink-0 tabular-nums">
                    {detCount !== null && (
                      <span className="text-emerald-700 font-medium">
                        {detCount} det
                      </span>
                    )}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600">
                      {log.authMethod === 'api_key'
                        ? 'X-API-Key'
                        : log.authMethod === 'bearer'
                          ? 'Bearer'
                          : 'Public'}
                    </span>
                    <span className="font-mono text-slate-600 w-14 text-right">
                      {log.durationMs}ms
                    </span>
                    <span className="text-slate-400 hidden sm:inline">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11.5px]">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-700">
                        Request Metadata
                      </div>
                      <pre className="rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-[11px] text-slate-700 overflow-x-auto">
                        {JSON.stringify(
                          {
                            timestamp: log.createdAt,
                            clientIp: log.clientIp || 'internal',
                            authMethod: log.authMethod,
                            workflowId: log.workflowId,
                            ...log.requestMeta,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-700">
                        Response Summary
                      </div>
                      <pre className="rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-[11px] text-slate-700 overflow-x-auto">
                        {JSON.stringify(log.responseSummary, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Create Workflow from Template Modal ---------------- */
export function WorkflowTemplatesModal({
  open,
  onClose,
  models,
  aiStatus,
  onAiGenerate,
  onSelectTemplate,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelSummary[];
  aiStatus: { configured: boolean; model: string | null };
  onAiGenerate: (prompt: string, customName?: string) => Promise<void>;
  onSelectTemplate: (
    template: WorkflowTemplate,
    customName: string
  ) => Promise<void>;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCustomName, setAiCustomName] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const AI_PROMPT_IDEAS = [
    'Detect vehicles (car, truck, bus), draw bounding boxes and labels, count total vehicles',
    'Detect persons inside a perimeter zone and trigger a condition alert if count > 0',
    'Count people in retail store and alert if occupancy exceeds 5 persons',
  ];

  async function handleAiSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aiPrompt.trim()) {
      setError('Describe the workflow you want AI to build.');
      return;
    }
    setAiGenerating(true);
    setError(null);
    try {
      await onAiGenerate(
        aiPrompt.trim(),
        aiCustomName.trim() ? aiCustomName.trim() : undefined
      );
      setAiPrompt('');
      setAiCustomName('');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'AI workflow generation failed'
      );
    } finally {
      setAiGenerating(false);
    }
  }

  const categories = [
    'All',
    ...Array.from(new Set(WORKFLOW_TEMPLATES.map((t) => t.category))),
  ];

  const filtered =
    selectedCategory === 'All'
      ? WORKFLOW_TEMPLATES
      : WORKFLOW_TEMPLATES.filter((t) => t.category === selectedCategory);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3e8ff] text-[#7c3aed]">
              <LayoutTemplate className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-slate-900">
                Create New Workflow
              </h3>
              <p className="text-[12px] text-slate-500">
                Start with an empty canvas or choose a ready-to-run YOLO pipeline template
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition whitespace-nowrap ${
                  active
                    ? 'bg-[#7c3aed] text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="p-5 overflow-y-auto vf-scroll space-y-4">
          {/* AI Auto-Create Workflow Builder */}
          <form
            onSubmit={handleAiSubmit}
            className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-slate-50/70 p-4 space-y-3 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7c3aed] text-white">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="font-display text-[13.5px] font-semibold text-slate-900">
                    Auto-Create Workflow with AI
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Describe your computer vision pipeline and AI will assemble the YOLO DAG nodes &amp; wiring
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-medium ${
                  aiStatus.configured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    aiStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>
                  {aiStatus.configured
                    ? `AI Ready${aiStatus.model ? ` · ${aiStatus.model}` : ''}`
                    : 'Configure AI_BASE_URL, AI_KEY, AI_MODEL in Secrets'}
                </span>
              </span>
            </div>

            <textarea
              rows={2}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Detect cars and motorcycles, filter out bicycles, count total vehicles, draw bounding boxes + labels, and trigger a condition alert if > 4..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:border-[#7c3aed] focus:outline-none resize-none"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              {AI_PROMPT_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setAiPrompt(idea)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] text-slate-600 hover:border-violet-300 hover:text-[#7c3aed] transition truncate max-w-[260px]"
                  title={idea}
                >
                  {idea}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <input
                type="text"
                value={aiCustomName}
                onChange={(e) => setAiCustomName(e.target.value)}
                placeholder="Optional workflow name (auto-named if blank)"
                className="flex-1 min-w-[180px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-[#7c3aed] focus:outline-none"
              />
              <button
                type="submit"
                disabled={aiGenerating || Boolean(creatingId)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-60 transition shrink-0"
              >
                {aiGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating DAG...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Create with AI</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filtered.map((tpl) => {
              const isEmpty = tpl.id === 'empty-workflow';
              const matchedModel =
                models.find(
                  (m) =>
                    m.task === tpl.recommendedModelTask && m.format === 'onnx'
                ) ??
                models.find((m) => m.format === 'onnx') ??
                models[0];
              const isBusy = creatingId === tpl.id;
              const defaultInputName = isEmpty ? 'Untitled Pipeline' : tpl.name;
              const nameVal = customNames[tpl.id] ?? defaultInputName;

              return (
                <div
                  key={tpl.id}
                  className={`rounded-xl p-4 flex flex-col justify-between gap-3 transition shadow-2xs ${
                    isEmpty
                      ? 'border-2 border-dashed border-violet-300 bg-violet-50/30 hover:border-violet-500'
                      : 'border border-slate-200 bg-white hover:border-violet-300'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-semibold ${
                          isEmpty
                            ? 'bg-[#7c3aed] text-white'
                            : 'bg-violet-50 text-violet-700'
                        }`}
                      >
                        {isEmpty && <Plus className="w-3 h-3" />}
                        <span>{isEmpty ? 'Blank Canvas' : tpl.category}</span>
                      </span>
                      <span className="font-mono text-[10.5px] text-slate-500">
                        {isEmpty
                          ? 'Start from scratch'
                          : matchedModel
                            ? matchedModel.name
                            : 'No ONNX model'}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-display text-[14px] font-semibold text-slate-900">
                        {tpl.name}
                      </h4>
                      <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                        {tpl.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {tpl.pipelineSummary.map((step, idx) => (
                        <React.Fragment key={step}>
                          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-slate-700">
                            {step}
                          </span>
                          {idx < tpl.pipelineSummary.length - 1 && (
                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    <input
                      type="text"
                      value={nameVal}
                      onChange={(e) =>
                        setCustomNames((prev) => ({
                          ...prev,
                          [tpl.id]: e.target.value,
                        }))
                      }
                      placeholder="Workflow name"
                      aria-label={`Workflow name for ${tpl.name}`}
                      className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 focus:border-violet-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={Boolean(creatingId)}
                      onClick={async () => {
                        setCreatingId(tpl.id);
                        setError(null);
                        try {
                          const chosenName =
                            (customNames[tpl.id] ?? defaultInputName).trim() ||
                            defaultInputName;
                          await onSelectTemplate(tpl, chosenName);
                          onClose();
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Failed to create workflow'
                          );
                        } finally {
                          setCreatingId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-60 shrink-0"
                    >
                      <span>
                        {isBusy
                          ? 'Creating...'
                          : isEmpty
                            ? 'Create Empty'
                            : 'Use Template'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}



