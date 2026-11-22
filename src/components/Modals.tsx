import React, { useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Cpu,
  Database,
  FileCode2,
  KeyRound,
  Lock,
  Play,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { WorkflowDefinition } from '../shared/workflowSchema';
import type { AuthUser, ModelSummary, WorkflowSummary } from '../types/visionflow';

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
                      {(model.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                      {model.isBuiltin ? ' · Built-in preset' : ''}
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
                    {!model.isBuiltin && (
                      <button
                        type="button"
                        onClick={() => void onDeleteModel(model.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Delete model"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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
                {workflow.apiKey}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(workflow.apiKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 shrink-0"
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
                    : 'Preview store (set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in Secrets)'}
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
