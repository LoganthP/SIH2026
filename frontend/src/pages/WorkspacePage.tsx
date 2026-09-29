import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import {
  UploadCloud,
  BrainCircuit,
  Play,
  CheckCircle2,
  ChevronRight,
  History,
  Activity,
  AlertCircle,
  FileArchive,
  Zap,
  Database,
  Layers,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  FileCheck,
  User as UserIcon,
} from "lucide-react";
import { GlassPanel } from "../components/ui/GlassPanel";
import { RequirePermission } from "../hooks/RequirePermission";
import {
  uploadDataset,
  listAssets,
  uploadModel,
  trainMlModel,
  listBaselines,
  listTrustedModels,
  startJob,
  getAuditBlocks,
} from "../api/endpoints";
import { API_URL } from "../api/client";
import { useLedgerGuard } from "../hooks/useLedgerGuard";
import { Asset } from "../types/api";

export const WorkspacePage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [createdDatasetId, setCreatedDatasetId] = useState<string | null>(null);
  const [createdModelId, setCreatedModelId] = useState<string | null>(null);

  const { user, permissions } = useAuth();
  const navigate = useNavigate();

  const steps = [
    { id: 1, label: "Ingest Data", icon: UploadCloud, perm: "ingest_data" as const, roleNeeded: "Operator or Admin" },
    { id: 2, label: "Model", icon: BrainCircuit, perm: "train_models" as const, roleNeeded: "Operator or Admin" },
    { id: 3, label: "Assess", icon: Play, perm: "run_assessments" as const, roleNeeded: "Client, Operator or Admin" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold text-white flex items-center gap-2">
          Workspace
        </h1>
        <p className="text-slate-400 font-mono text-sm mt-1">
          Guided MLOps and Integrity Assurance Flow
        </p>
      </div>

      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = step === s.id;
          const isLocked = s.perm && !permissions?.[s.perm];

          return (
            <React.Fragment key={s.id}>
              <button
                onClick={() => !isLocked && setStep(s.id)}
                disabled={isLocked}
                title={isLocked ? `${s.roleNeeded} required` : undefined}
                className={`flex flex-col items-center gap-2 transition-all ${
                  isActive ? "text-cyan-400" : isLocked ? "text-slate-600 cursor-not-allowed" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                    isActive ? "border-cyan-400 bg-cyan-500/10 shadow-glow-cyan" : "border-current bg-black/40"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest flex items-center gap-1">
                  {s.label}
                  {isLocked && <span title={`${s.roleNeeded} required`}>🔒</span>}
                </div>
              </button>
              {idx < steps.length - 1 && (
                <div className="flex-1 h-px bg-white/10 mx-4" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-8">
        {step === 1 && (
          <IngestStep
            onNext={(id) => {
              setCreatedDatasetId(id);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <ModelStep
            defaultDatasetId={createdDatasetId}
            onNext={(id) => {
              setCreatedModelId(id);
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <AssessStep
            defaultDatasetId={createdDatasetId}
            defaultModelId={createdModelId}
          />
        )}
      </div>

      <MyActivityPanel />
    </div>
  );
};

const IngestStep = ({ onNext }: { onNext: (id: string) => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [contributor, setContributor] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisPhase, setAnalysisPhase] = useState("");
  const [ingestedAsset, setIngestedAsset] = useState<Asset | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.username && !contributor) {
      setContributor(user.username);
    }
  }, [user, contributor]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setErrorMsg("");
      setIngestedAsset(null);
      if (!datasetName) {
        setDatasetName(selected.name.replace(/\.zip$/i, ""));
      }
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (fileToUpload: File) => {
      setUploadProgress(15);
      setAnalysisPhase("Streaming ZIP archive into ingestion gateway...");

      const progressTimer = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev < 40) {
            setAnalysisPhase("Extracting archive & verifying path traversal bounds...");
            return prev + 15;
          } else if (prev < 75) {
            setAnalysisPhase("Scanning samples, perceptual hashing & profiling images...");
            return prev + 12;
          } else if (prev < 90) {
            setAnalysisPhase("Constructing Merkle tree root & attaching annotations...");
            return prev + 5;
          }
          return prev;
        });
      }, 500);

      const fd = new FormData();
      fd.append("file", fileToUpload);
      fd.append("name", datasetName.trim() || fileToUpload.name.replace(/\.zip$/i, ""));
      fd.append("contributor", contributor.trim() || user?.username || "operator");

      try {
        const res = await uploadDataset(fd);
        clearInterval(progressTimer);
        setUploadProgress(100);
        setAnalysisPhase("Ingestion & cryptographic integrity seal verified!");
        return res;
      } catch (err) {
        clearInterval(progressTimer);
        throw err;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setIngestedAsset(data);
    },
    onError: (err: any) => {
      setUploadProgress(0);
      setAnalysisPhase("");
      setErrorMsg(err.message || "Failed to upload and ingest dataset");
    },
  });

  const handleCopyHash = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <RequirePermission perm="ingest_data">
      <GlassPanel className="p-6 sm:p-8 max-w-2xl mx-auto border-white/10">
        {!ingestedAsset ? (
          <>
            <div className="text-center mb-6">
              <UploadCloud className="w-12 h-12 mx-auto mb-3 text-cyan-400" />
              <h2 className="text-xl font-mono text-white mb-1.5">Upload & Ingest Dataset</h2>
              <p className="text-slate-400 text-xs sm:text-sm font-mono max-w-lg mx-auto">
                Upload a ZIP file of any size. Supports standard class-folder layouts (<code className="text-cyan-300">&lt;class&gt;/&lt;image&gt;</code>) or YOLO/COCO object detection archives with bounding boxes.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-xs rounded-lg flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div className="whitespace-pre-wrap">{errorMsg}</div>
              </div>
            )}

            <div className="space-y-4">
              <div className="border-2 border-dashed border-white/15 rounded-xl p-6 text-center bg-black/40 hover:bg-white/[0.03] transition-colors relative">
                <input
                  type="file"
                  id="dataset-upload"
                  className="hidden"
                  accept=".zip"
                  onChange={handleFileChange}
                  disabled={uploadMutation.isPending}
                />
                <label htmlFor="dataset-upload" className="cursor-pointer flex flex-col items-center">
                  <FileArchive className="w-10 h-10 text-cyan-400/70 mb-2.5" />
                  <span className="text-sm font-mono text-cyan-300 font-bold tracking-wide uppercase hover:underline">
                    {file ? "Change Selected ZIP File" : "Select Dataset ZIP Archive"}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono mt-1">
                    Any archive size supported (up to 1TB)
                  </span>
                  {file && (
                    <div className="mt-3 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200 font-mono flex items-center gap-2">
                      <FileCheck className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{file.name}</span>
                      <span className="text-slate-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </div>
                  )}
                </label>
              </div>

              {file && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 uppercase tracking-wider text-[11px]">
                      Dataset Name
                    </label>
                    <input
                      type="text"
                      value={datasetName}
                      onChange={(e) => setDatasetName(e.target.value)}
                      placeholder="e.g. coco8-benchmark"
                      disabled={uploadMutation.isPending}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 uppercase tracking-wider text-[11px]">
                      Attributed Uploader / Contributor
                    </label>
                    <input
                      type="text"
                      value={contributor}
                      onChange={(e) => setContributor(e.target.value)}
                      placeholder="operator"
                      disabled={uploadMutation.isPending}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Progress & Live Ingestion Status */}
              {uploadMutation.isPending && (
                <div className="pt-2 animate-fadeIn space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-cyan-300 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      {analysisPhase || "Processing dataset..."}
                    </span>
                    <span className="text-slate-400 font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 shadow-glow-cyan"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-500">
                  {user ? (
                    <span className="flex items-center gap-1.5">
                      <UserIcon className="w-3 h-3 text-cyan-400" />
                      Operating as <strong className="text-slate-300">@{user.username}</strong> ({user.role})
                    </span>
                  ) : (
                    "Authenticated ingestion session"
                  )}
                </span>

                <button
                  onClick={() => {
                    if (file) uploadMutation.mutate(file);
                  }}
                  disabled={!file || uploadMutation.isPending}
                  className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold font-mono text-xs uppercase tracking-wider rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-glow-cyan transition-all cursor-pointer"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                      <span>Ingesting & Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <span>Upload & Ingest</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Real-Time Ingestion Analytics & Results Card */
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-glow-accept">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-mono font-bold text-white flex items-center gap-2">
                    {ingestedAsset.name}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest font-bold">
                      INGESTION VERIFIED
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                    <span>ID: {ingestedAsset.id}</span>
                    <span>·</span>
                    <span>Sealed into Tamper-Proof Ledger</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setFile(null);
                  setIngestedAsset(null);
                  setDatasetName("");
                }}
                className="text-xs font-mono text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
              >
                Upload Another
              </button>
            </div>

            {/* Cryptographic Merkle Root Card */}
            <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 font-mono text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  Dataset Merkle Root Hash
                </span>
                <button
                  onClick={() => handleCopyHash(ingestedAsset.sha256)}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[10px] uppercase tracking-wider"
                >
                  {copiedHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedHash ? "Copied" : "Copy Hash"}
                </button>
              </div>
              <div className="p-2 rounded bg-black/60 border border-white/5 text-cyan-300 text-[11px] break-all select-all font-mono">
                {ingestedAsset.sha256}
              </div>
            </div>

            {/* Ingestion Analytics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Samples</span>
                <span className="text-base font-bold text-white mt-1 block">
                  {ingestedAsset.meta?.sample_count || 0}
                </span>
                <span className="text-[9px] text-slate-500">Image files indexed</span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Archive Size</span>
                <span className="text-base font-bold text-white mt-1 block">
                  {(ingestedAsset.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <span className="text-[9px] text-slate-500">Compressed</span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Sample Health</span>
                <span className="text-base font-bold text-emerald-400 mt-1 block">
                  {ingestedAsset.meta?.unreadable === 0 ? "100% OK" : `${ingestedAsset.meta?.unreadable} Corrupt`}
                </span>
                <span className="text-[9px] text-emerald-500/80">0 unreadable</span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Format Detected</span>
                <span className="text-xs font-bold text-amber-300 mt-1.5 block truncate">
                  {ingestedAsset.meta?.task === "detection"
                    ? `YOLO (${ingestedAsset.meta?.boxes || 0} Boxes)`
                    : "Classification"}
                </span>
                <span className="text-[9px] text-slate-500">
                  {ingestedAsset.meta?.task === "detection" ? "Bounding boxes stored" : "Class-folder layout"}
                </span>
              </div>
            </div>

            {/* Provenance & Attribution Banner */}
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-violet-200 font-bold block">
                    Uploader: @{ingestedAsset.uploaded_by || user?.username || "operator"}
                  </span>
                  <span className="text-[10px] text-violet-300/70">
                    Contributor: {ingestedAsset.contributor} · Sealed at {new Date(ingestedAsset.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              <span className="text-[10px] px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase tracking-wider font-bold">
                PROVENANCE LINKED
              </span>
            </div>

            {/* Class Breakdown if available */}
            {ingestedAsset.meta?.classes && Object.keys(ingestedAsset.meta.classes).length > 0 && (
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-xs space-y-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                  Class / Category Distribution ({Object.keys(ingestedAsset.meta.classes).length} categories)
                </span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ingestedAsset.meta.classes).map(([cls, count]) => (
                    <div
                      key={cls}
                      className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2 text-slate-300"
                    >
                      <span className="text-cyan-400 font-bold">{cls}:</span>
                      <span>{String(count)} images</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation & Action Footer */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10">
              <button
                onClick={() => navigate("/provenance")}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>View Provenance Graph</span>
                <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              </button>

              <button
                onClick={() => onNext(ingestedAsset.id)}
                className="w-full sm:w-auto px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold font-mono text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 shadow-glow-cyan transition-all cursor-pointer"
              >
                <span>Continue to Step 2: Model</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </GlassPanel>
    </RequirePermission>
  );
};

const ModelStep = ({ defaultDatasetId, onNext }: { defaultDatasetId: string | null, onNext: (id: string) => void }) => {
  const [tab, setTab] = useState<"train" | "upload">("train");
  const [datasetId, setDatasetId] = useState(defaultDatasetId || "");
  const [modelName, setModelName] = useState("");
  const [trustAs, setTrustAs] = useState("");
  const [epochs, setEpochs] = useState(5);
  const [file, setFile] = useState<File | null>(null);
  
  const { permissions } = useAuth();
  const canApprove = !!permissions?.approve_models;

  const { data: datasets } = useQuery({ queryKey: ["assets", "dataset"], queryFn: () => listAssets("dataset") });
  const queryClient = useQueryClient();

  const trainMutation = useMutation({
    mutationFn: () => trainMlModel({
      name: modelName,
      dataset_id: datasetId,
      epochs,
      trust_as: canApprove && trustAs.trim() ? trustAs.trim() : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      alert("Training job started. View progress in backend logs.");
      onNext("");
    }
  });

  const uploadMutation = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return uploadModel(fd);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      onNext(data.id);
    }
  });

  return (
    <RequirePermission perm="train_models">
      <GlassPanel className="p-8 max-w-xl mx-auto border-white/10">
        <div className="flex gap-4 border-b border-white/10 pb-4 mb-6">
          <button onClick={() => setTab("train")} className={`font-mono text-sm uppercase tracking-wide font-bold ${tab === "train" ? "text-cyan-400" : "text-slate-400"}`}>Train Model</button>
          <button onClick={() => setTab("upload")} className={`font-mono text-sm uppercase tracking-wide font-bold ${tab === "upload" ? "text-cyan-400" : "text-slate-400"}`}>Upload Weights</button>
        </div>

        {tab === "train" ? (
          <div className="space-y-4 font-mono text-sm">
            <div>
              <label className="block text-slate-400 mb-1 text-xs uppercase">Model Name</label>
              <input type="text" value={modelName} onChange={e => setModelName(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-cyan-400" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 text-xs uppercase">Dataset</label>
              <select value={datasetId} onChange={e => setDatasetId(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-cyan-400">
                <option value="">Select a dataset</option>
                {datasets?.map(d => <option key={d.id} value={d.id}>{d.name} ({d.id.substring(0,6)})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1 text-xs uppercase">Epochs ({epochs})</label>
              <input type="range" min="1" max="20" value={epochs} onChange={e => setEpochs(parseInt(e.target.value))} className="w-full accent-cyan-400" />
            </div>

            {canApprove ? (
              <div>
                <label className="block text-slate-400 mb-1 text-xs uppercase">Approve into Trusted Registry (Optional, Admin Only)</label>
                <input
                  type="text"
                  value={trustAs}
                  onChange={e => setTrustAs(e.target.value)}
                  placeholder="e.g. aerial-landcover-v2"
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-cyan-400 placeholder:text-slate-600"
                />
              </div>
            ) : (
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs font-mono text-slate-400">
                <span className="text-amber-400 font-bold block mb-0.5">Model Approval Policy</span>
                An administrator approves models into the trusted registry.
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => trainMutation.mutate()}
                disabled={!datasetId || !modelName || trainMutation.isPending}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold font-mono text-sm uppercase tracking-wider rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {trainMutation.isPending ? "Starting..." : "Train & Continue"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center bg-black/40 hover:bg-white/5 transition-colors">
              <input type="file" id="model-upload" className="hidden" accept=".h5,.pt,.bin,.onnx" onChange={(e) => { if (e.target.files) setFile(e.target.files[0]); }} />
              <label htmlFor="model-upload" className="cursor-pointer flex flex-col items-center">
                <BrainCircuit className="w-8 h-8 text-slate-500 mb-2" />
                <span className="text-sm font-mono text-cyan-400 font-bold tracking-wide uppercase">Select Model File</span>
                {file && <span className="mt-2 text-xs text-slate-300 font-mono">{file.name}</span>}
              </label>
            </div>
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => { if (file) uploadMutation.mutate(file); }}
                disabled={!file || uploadMutation.isPending}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold font-mono text-sm uppercase tracking-wider rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload & Continue"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </GlassPanel>
    </RequirePermission>
  );
};

const AssessStep = ({ defaultDatasetId, defaultModelId }: { defaultDatasetId: string | null, defaultModelId: string | null }) => {
  const [datasetId, setDatasetId] = useState(defaultDatasetId || "");
  const [modelId, setModelId] = useState(defaultModelId || "");
  const [baselineId, setBaselineId] = useState("");
  const navigate = useNavigate();
  const { guardAction, GuardModal } = useLedgerGuard();

  const { data: datasets } = useQuery({ queryKey: ["assets", "dataset"], queryFn: () => listAssets("dataset") });
  const { data: models } = useQuery({ queryKey: ["assets", "model"], queryFn: () => listAssets("model") });
  const { data: baselines } = useQuery({ queryKey: ["baselines"], queryFn: () => listBaselines() });

  const assessMutation = useMutation({
    mutationFn: () => startJob({ dataset_id: datasetId, model_id: modelId, baseline_id: baselineId || null, label: "Workspace Assessment" }),
    onSuccess: (data) => {
      navigate(`/jobs/${data.id}`);
    }
  });

  const handleLaunch = () => {
    guardAction(() => assessMutation.mutate(), "workspace assessment");
  };

  return (
    <GlassPanel className="p-8 max-w-xl mx-auto border-white/10">
      <div className="text-center mb-8">
        <Play className="w-12 h-12 mx-auto mb-4 text-cyan-400" />
        <h2 className="text-xl font-mono text-white mb-2">Run Assurance Pipeline</h2>
        <p className="text-slate-400 text-sm font-mono">Verify dataset integrity, model provenance, and execution validity.</p>
      </div>

      <div className="space-y-4 font-mono text-sm">
        <div>
          <label className="block text-slate-400 mb-1 text-xs uppercase">Target Model</label>
          <select value={modelId} onChange={e => setModelId(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-cyan-400">
            <option value="">Select a model</option>
            {models?.map(m => <option key={m.id} value={m.id}>{m.name} ({m.id.substring(0,6)})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-slate-400 mb-1 text-xs uppercase">Evaluation Dataset (Optional)</label>
          <select value={datasetId} onChange={e => setDatasetId(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-cyan-400">
            <option value="">None</option>
            {datasets?.map(d => <option key={d.id} value={d.id}>{d.name} ({d.id.substring(0,6)})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-slate-400 mb-1 text-xs uppercase">Baseline Config (Optional)</label>
          <select value={baselineId} onChange={e => setBaselineId(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white outline-none focus:border-cyan-400">
            <option value="">None</option>
            {baselines?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleLaunch}
            disabled={!modelId || assessMutation.isPending}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold font-mono text-sm uppercase tracking-wider rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {assessMutation.isPending ? "Starting Job..." : "Launch Assessment"}
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </div>
      {GuardModal}
    </GlassPanel>
  );
};

const MyActivityPanel = () => {
  const { user } = useAuth();
  const { data: auditResponse } = useQuery({
    queryKey: ["myActivity", user?.username],
    queryFn: () => getAuditBlocks(0, 100),
    enabled: !!user
  });

  const myBlocks = auditResponse?.items?.filter(b => b.payload?.actor === user?.username) || [];

  return (
    <GlassPanel className="mt-12 p-6 border-white/10">
      <h3 className="font-mono font-bold text-white mb-4 flex items-center gap-2">
        <History className="w-5 h-5 text-cyan-400" />
        My Recent Activity
      </h3>
      {myBlocks.length === 0 ? (
        <p className="text-sm font-mono text-slate-400">No recent activity found.</p>
      ) : (
        <div className="space-y-2">
          {myBlocks.slice(0, 5).map((block) => (
            <div key={block.index} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg font-mono text-sm">
              <div>
                <span className="text-cyan-400 font-bold">{block.event_type}</span>
                <span className="text-slate-300 ml-2">{block.subject}</span>
              </div>
              <div className="text-xs text-slate-500">{new Date(block.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
};
