import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  FileImage,
  Globe,
  Info,
  Link2,
  Maximize2,
  PanelRightClose,
  Play,
  Radio,
  RefreshCw,
  Server,
  Smartphone,
  Square,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type {
  AuthUser,
  DagRunResult,
  RightPanelTab,
  StreamSummary,
} from '../types/visionflow';

const BUILTIN_SAMPLES = [
  {
    id: 'street_traffic',
    label: 'Broadway Crosswalk (Traffic & Pedestrians)',
    src: '/src/assets/images/sample_street_traffic_1795359272502.jpg',
  },
  {
    id: 'warehouse_logistics',
    label: 'Warehouse Forklift & Safety PPE',
    src: '/src/assets/images/sample_warehouse_logistics_1795359271625.jpg',
  },
];

interface RunWorkflowPanelProps {
  open: boolean;
  onClose: () => void;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  workflowId: string;
  user: AuthUser | null;
  onRequireAuth: () => void;
  running: boolean;
  runError: string | null;
  lastResult: DagRunResult | null;
  enableSinks: boolean;
  onToggleEnableSinks: (v: boolean) => void;
  showAllBlockOutputs: boolean;
  onToggleShowAllBlockOutputs: (v: boolean) => void;
  useBlockCache: boolean;
  onToggleUseBlockCache: (v: boolean) => void;
  selectedFile: File | null;
  selectedSampleId: string | null;
  imageUrlInput: string;
  onSelectFile: (file: File | null) => void;
  onSelectSample: (sampleId: string | null) => void;
  onChangeImageUrl: (url: string) => void;
  onRunWithSource: (override?: {
    imageBase64?: string;
    sourceType?: string;
  }) => void;
  streams: StreamSummary[];
  onRefreshStreams: () => void;
  onCreateStream: (payload: {
    name: string;
    rtspUrl: string;
    sourceType: 'rtsp' | 'network' | 'file_loop';
    sinkType: 'mjpeg' | 'webhook' | 'mqtt' | 'modbus';
    sinkConfig?: Record<string, unknown>;
    fpsTarget?: number;
  }) => Promise<void>;
  onStartStream: (id: string) => Promise<void>;
  onStopStream: (id: string) => Promise<void>;
  onDeleteStream: (id: string) => Promise<void>;
}

export function RunWorkflowPanel(props: RunWorkflowPanelProps) {
  const {
    open,
    onClose,
    activeTab,
    onTabChange,
    user,
    onRequireAuth,
    running,
    runError,
    lastResult,
    enableSinks,
    onToggleEnableSinks,
    showAllBlockOutputs,
    onToggleShowAllBlockOutputs,
    useBlockCache,
    onToggleUseBlockCache,
    selectedFile,
    selectedSampleId,
    imageUrlInput,
    onSelectFile,
    onSelectSample,
    onChangeImageUrl,
    onRunWithSource,
    streams,
    onCreateStream,
    onStartStream,
    onStopStream,
    onDeleteStream,
  } = props;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const [showAssets, setShowAssets] = useState(false);
  const [showUrlBox, setShowUrlBox] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [expandedModal, setExpandedModal] = useState(false);

  // Webcam state
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [webcamAutoLoop, setWebcamAutoLoop] = useState(false);

  // Stream creation state
  const [showAddStream, setShowAddStream] = useState(false);
  const [streamName, setStreamName] = useState('Warehouse Gate Cam 01');
  const [rtspUrl, setRtspUrl] = useState('rtsp://demo-camera.example.com:554/stream1');
  const [streamSink, setStreamSink] = useState<'mjpeg' | 'webhook' | 'mqtt' | 'modbus'>('mjpeg');
  const [streamFps, setStreamFps] = useState(1);
  const [streamCreating, setStreamCreating] = useState(false);
  const [streamFormError, setStreamFormError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = () => setPreviewDataUrl(String(reader.result));
      reader.readAsDataURL(selectedFile);
    } else if (selectedSampleId) {
      const found = BUILTIN_SAMPLES.find((s) => s.id === selectedSampleId);
      setPreviewDataUrl(found ? found.src : null);
    } else if (imageUrlInput.trim()) {
      setPreviewDataUrl(imageUrlInput.trim());
    } else {
      setPreviewDataUrl(null);
    }
  }, [selectedFile, selectedSampleId, imageUrlInput]);

  // Stop webcam when switching tabs
  useEffect(() => {
    if (activeTab !== 'webcam' && webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
      setWebcamActive(false);
      setWebcamAutoLoop(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!webcamAutoLoop || !webcamActive || activeTab !== 'webcam') return;
    const timer = setInterval(() => {
      captureWebcamAndRun();
    }, 1500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webcamAutoLoop, webcamActive, activeTab]);

  async function startWebcam() {
    setWebcamError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      webcamStreamRef.current = media;
      if (videoRef.current) {
        videoRef.current.srcObject = media;
      }
      setWebcamActive(true);
    } catch (err) {
      setWebcamError(
        err instanceof Error
          ? err.message
          : 'Camera permission denied or no webcam device found.'
      );
    }
  }

  function stopWebcam() {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    setWebcamActive(false);
    setWebcamAutoLoop(false);
  }

  function captureWebcamAndRun() {
    if (!videoRef.current || !webcamActive) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUri = canvas.toDataURL('image/jpeg', 0.85);
    onRunWithSource({ imageBase64: dataUri, sourceType: 'webcam' });
  }

  async function handleAddStreamSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setStreamCreating(true);
    setStreamFormError(null);
    try {
      await onCreateStream({
        name: streamName,
        rtspUrl,
        sourceType: 'rtsp',
        sinkType: streamSink,
        fpsTarget: streamFps,
      });
      setShowAddStream(false);
    } catch (err) {
      setStreamFormError(
        err instanceof Error ? err.message : 'Failed to create stream'
      );
    } finally {
      setStreamCreating(false);
    }
  }

  if (!open) return null;

  const jsonPayload = lastResult
    ? JSON.stringify(
        {
          inference_id: lastResult.inference_id,
          duration_ms: lastResult.duration_ms,
          execution_order: lastResult.execution_order,
          outputs: {
            ...lastResult.outputs,
            output_image:
              typeof lastResult.outputs.output_image === 'string'
                ? `<base64 image (${lastResult.outputs.output_image.length} chars)>`
                : lastResult.outputs.output_image,
          },
          ...(lastResult.step_outputs
            ? { step_outputs: lastResult.step_outputs }
            : {}),
        },
        null,
        2
      )
    : null;

  return (
    <>
      <aside className="w-[336px] shrink-0 border-l border-slate-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Collapse Run Panel"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
            <h2 className="font-display text-[13.5px] font-semibold text-slate-900">
              Run Workflow
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {lastResult && (
              <button
                type="button"
                onClick={() => setExpandedModal(true)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                title="Expand results"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Segmented Source Tabs: File | Webcam | Stream */}
        <div className="px-4 pt-3 pb-2.5">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-50 p-1 border border-slate-200/80">
            <button
              type="button"
              onClick={() => onTabChange('file')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition whitespace-nowrap ${
                activeTab === 'file'
                  ? 'bg-[#f3e8ff] text-[#7c3aed] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>File</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('webcam')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition whitespace-nowrap ${
                activeTab === 'webcam'
                  ? 'bg-[#f3e8ff] text-[#7c3aed] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Webcam</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('stream')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition whitespace-nowrap ${
                activeTab === 'stream'
                  ? 'bg-[#f3e8ff] text-[#7c3aed] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Stream</span>
            </button>
          </div>
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto vf-scroll px-4 pb-3 space-y-3">
          {activeTab === 'file' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) {
                    onSelectSample(null);
                    onChangeImageUrl('');
                    onSelectFile(file);
                  }
                }}
              />

              {/* Dashed Purple Dropzone matching Reference Screenshots */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    onSelectSample(null);
                    onChangeImageUrl('');
                    onSelectFile(file);
                  }
                }}
                className="rounded-xl border-2 border-dashed border-[#a855f7] bg-[#faf5ff]/25 flex flex-col overflow-hidden"
              >
                {previewDataUrl ? (
                  <div className="relative bg-slate-950/5">
                    <img
                      src={lastResult?.annotated_image_base64 || previewDataUrl}
                      alt="Workflow test preview"
                      referrerPolicy="no-referrer"
                      className="w-full max-h-[240px] object-contain bg-slate-900/5"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onSelectFile(null);
                        onSelectSample(null);
                        onChangeImageUrl('');
                      }}
                      className="absolute top-2 right-2 rounded-full bg-white/90 p-1 text-slate-700 shadow hover:bg-white"
                      title="Clear input image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center px-4 py-14 text-center hover:bg-[#faf5ff]/60 transition"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-200 bg-white text-[#7c3aed] shadow-2xs mb-3">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div className="text-[13.5px] font-semibold text-slate-900">
                      Drag or Drop a File
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-slate-500">
                      PNG · JPG · WEBP · MP4 · MOV
                    </div>
                  </button>
                )}

                <div className="grid grid-cols-2 border-t border-violet-200/70 bg-white divide-x divide-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAssets((v) => !v)}
                    className="flex items-center justify-center gap-1.5 py-2.5 text-[11.5px] font-medium text-[#7c3aed] hover:bg-violet-50/50 transition"
                  >
                    <FileImage className="w-3.5 h-3.5" />
                    <span>Asset Library</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUrlBox((v) => !v)}
                    className="flex items-center justify-center gap-1.5 py-2.5 text-[11.5px] font-medium text-[#7c3aed] hover:bg-violet-50/50 transition"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Image URL</span>
                  </button>
                </div>
              </div>

              {showAssets && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold text-slate-800">
                      Sample Test Assets
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAssets(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BUILTIN_SAMPLES.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          onSelectFile(null);
                          onChangeImageUrl('');
                          onSelectSample(sample.id);
                          setShowAssets(false);
                        }}
                        className={`rounded-lg border overflow-hidden text-left transition ${
                          selectedSampleId === sample.id
                            ? 'border-violet-500 ring-2 ring-violet-200'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <img
                          src={sample.src}
                          alt={sample.label}
                          referrerPolicy="no-referrer"
                          className="h-20 w-full object-cover"
                        />
                        <div className="p-1.5 text-[10.5px] font-medium text-slate-700 truncate">
                          {sample.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showUrlBox && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Public Image URL (HTTPS)
                  </label>
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => {
                      onSelectFile(null);
                      onSelectSample(null);
                      onChangeImageUrl(e.target.value);
                    }}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] focus:border-violet-500 focus:outline-none"
                  />
                </div>
              )}
            </>
          )}

          {activeTab === 'webcam' && (
            <div className="space-y-2.5">
              <div className="rounded-xl border border-slate-200 bg-slate-950 overflow-hidden aspect-[4/3] relative flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    webcamActive ? 'block' : 'hidden'
                  }`}
                />
                {!webcamActive && (
                  <div className="text-center px-4">
                    <Camera className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                    <p className="text-[12px] text-slate-300">
                      Start local camera to test live frames
                    </p>
                  </div>
                )}
              </div>

              {webcamError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">
                  {webcamError}
                </div>
              )}

              <div className="flex items-center gap-2">
                {!webcamActive ? (
                  <button
                    type="button"
                    onClick={startWebcam}
                    className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-[12px] font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Enable Camera
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={captureWebcamAndRun}
                      className="flex-1 rounded-lg bg-slate-900 py-2 text-[12px] font-medium text-white hover:bg-slate-800"
                    >
                      Capture Frame
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebcamAutoLoop((v) => !v)}
                      className={`rounded-lg border px-3 py-2 text-[12px] font-medium ${
                        webcamAutoLoop
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {webcamAutoLoop ? 'Live On' : 'Live Loop'}
                    </button>
                    <button
                      type="button"
                      onClick={stopWebcam}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      title="Stop camera"
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>

              {lastResult?.annotated_image_base64 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <img
                    src={lastResult.annotated_image_base64}
                    alt="Webcam annotated output"
                    className="w-full object-contain"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'stream' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-slate-900 tabular-nums">
                  Streams ({streams.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddStream((v) => !v)}
                  className="text-[11.5px] font-medium text-slate-600 hover:text-slate-900"
                >
                  {showAddStream ? 'Cancel' : '+ Add Stream'}
                </button>
              </div>

              {showAddStream && (
                <form
                  onSubmit={handleAddStreamSubmit}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5"
                >
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Stream Name
                    </label>
                    <input
                      type="text"
                      required
                      value={streamName}
                      onChange={(e) => setStreamName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      RTSP / HTTP Video URL
                    </label>
                    <input
                      type="text"
                      required
                      value={rtspUrl}
                      onChange={(e) => setRtspUrl(e.target.value)}
                      placeholder="rtsp://camera-host:554/live"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700">
                        Output Sink
                      </label>
                      <select
                        value={streamSink}
                        onChange={(e) =>
                          setStreamSink(
                            e.target.value as 'mjpeg' | 'webhook' | 'mqtt' | 'modbus'
                          )
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px]"
                      >
                        <option value="mjpeg">MJPEG Stream</option>
                        <option value="webhook">Webhook</option>
                        <option value="mqtt">MQTT Broker</option>
                        <option value="modbus">Modbus PLC</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700">
                        Target FPS
                      </label>
                      <input
                        type="number"
                        min={0.5}
                        max={5}
                        step={0.5}
                        value={streamFps}
                        onChange={(e) => setStreamFps(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-mono tabular-nums"
                      />
                    </div>
                  </div>
                  {streamFormError && (
                    <p className="text-[11px] text-rose-600">{streamFormError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={streamCreating}
                    className="w-full rounded-lg bg-[#7c3aed] py-1.5 text-[12px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-60"
                  >
                    {streamCreating ? 'Creating...' : 'Save Stream Worker'}
                  </button>
                </form>
              )}

              {streams.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-14 text-center space-y-3">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold text-slate-900">
                      No streams online
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-500">
                      Add a stream to run this workflow on live video.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddStream(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-[#f3e8ff] px-2.5 py-1.5 text-[11.5px] font-medium text-[#7c3aed] hover:bg-violet-100"
                    >
                      <Server className="w-3 h-3" />
                      <span>Network</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddStream(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-[#f3e8ff] px-2.5 py-1.5 text-[11.5px] font-medium text-[#7c3aed] hover:bg-violet-100"
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Phone</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddStream(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-[#f3e8ff] px-2.5 py-1.5 text-[11.5px] font-medium text-[#7c3aed] hover:bg-violet-100"
                    >
                      <Globe className="w-3 h-3" />
                      <span>URL</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {streams.map((st) => {
                    const isRunning = st.status === 'running';
                    return (
                      <div
                        key={st.id}
                        className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                              {st.name}
                            </div>
                            <div className="text-[10.5px] font-mono text-slate-500 truncate">
                              {st.rtspUrl}
                            </div>
                          </div>
                          <span
                            className={`text-[10.5px] font-semibold px-2 py-0.5 rounded ${
                              isRunning
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isRunning ? 'Running' : 'Stopped'}
                          </span>
                        </div>

                        {isRunning && (
                          <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-950">
                            <img
                              src={`/api/streams/${st.id}/mjpeg`}
                              alt={`${st.name} MJPEG output`}
                              className="w-full h-32 object-contain"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                          <span>
                            {st.framesProcessed} frames · {st.sinkType.toUpperCase()}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isRunning ? (
                              <button
                                type="button"
                                onClick={() => onStopStream(st.id)}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Square className="w-3 h-3" />
                                <span>Stop</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onStartStream(st.id)}
                                className="inline-flex items-center gap-1 rounded bg-[#7c3aed] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#6d28d9]"
                              >
                                <Play className="w-3 h-3" />
                                <span>Start</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteStream(st.id)}
                              className="rounded p-1 text-slate-400 hover:text-rose-600"
                              title="Delete stream"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {runError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {runError}
            </div>
          )}

          {/* Live Execution Output Summary + JSON Inspector */}
          {lastResult && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold text-slate-800 tabular-nums">
                  <span>Output JSON</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-emerald-700">
                    {lastResult.detection_count} detected
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono text-slate-500">
                    {lastResult.duration_ms}ms
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (jsonPayload) {
                      void navigator.clipboard.writeText(jsonPayload);
                      setCopiedJson(true);
                      setTimeout(() => setCopiedJson(false), 1500);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
                >
                  {copiedJson ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedJson ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono text-slate-700 max-h-[210px] overflow-auto vf-scroll leading-relaxed">
                {jsonPayload}
              </pre>
            </div>
          )}
        </div>

        {/* Bottom Settings Toggles & Primary Run CTA */}
        <div className="border-t border-slate-200 bg-white px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <span>Enable Sinks</span>
              <Info className="w-3.5 h-3.5 text-slate-400" />
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enableSinks}
              onClick={() => onToggleEnableSinks(!enableSinks)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                enableSinks ? 'bg-[#7c3aed]' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  enableSinks ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <span>Show All Block Outputs</span>
              <Info className="w-3.5 h-3.5 text-slate-400" />
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showAllBlockOutputs}
              onClick={() => onToggleShowAllBlockOutputs(!showAllBlockOutputs)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                showAllBlockOutputs ? 'bg-[#7c3aed]' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  showAllBlockOutputs ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <span>Use Block Cache</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={useBlockCache}
              onClick={() => onToggleUseBlockCache(!useBlockCache)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                useBlockCache ? 'bg-[#7c3aed]' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  useBlockCache ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            disabled={running}
            onClick={() => {
              if (activeTab === 'webcam') {
                captureWebcamAndRun();
              } else {
                onRunWithSource();
              }
            }}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#9333ea] hover:bg-[#7e22ce] active:scale-[0.99] py-2.5 text-[13px] font-semibold text-white shadow-sm transition disabled:opacity-60"
          >
            {running ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{running ? 'Running Workflow...' : 'Run Workflow'}</span>
          </button>
        </div>
      </aside>

      {/* Fullscreen Result Modal */}
      {expandedModal && lastResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-6"
          onClick={() => setExpandedModal(false)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <Video className="w-4 h-4 text-[#7c3aed]" />
                <h3 className="font-display text-[15px] font-semibold text-slate-900">
                  Workflow Execution Result
                </h3>
                <span className="text-[12px] text-slate-500 tabular-nums">
                  {lastResult.detection_count} detections · {lastResult.duration_ms}ms
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExpandedModal(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 overflow-hidden">
              <div className="bg-slate-950 flex items-center justify-center p-4 overflow-auto">
                {lastResult.annotated_image_base64 && (
                  <img
                    src={lastResult.annotated_image_base64}
                    alt="Annotated inference output"
                    className="max-h-[70vh] object-contain rounded"
                  />
                )}
              </div>
              <div className="p-4 overflow-auto vf-scroll bg-slate-50">
                <pre className="text-[12px] font-mono text-slate-800 leading-relaxed">
                  {jsonPayload}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
