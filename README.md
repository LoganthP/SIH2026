# TEJAS-CV — Trusted Evaluation & Judgement Assurance System for Computer Vision

**SIH 2026 · PS SIH26228 · Theme: Blockchain & Cybersecurity · Team Jai Hind**

> "Don't trust the data, model, contributor or output; verify them, collect evidence, assess risk, and then decide."

TEJAS-CV is an **offline assurance layer** that sits around an existing computer-vision pipeline. It does not
replace the pipeline or retrain anything. It independently verifies the **dataset**, the **model**, the
**inference records** and the **contributors**, fuses the evidence into an explainable risk score, returns
**ACCEPT / REVIEW / QUARANTINE**, and seals the decision into a signed, hash-chained audit ledger.

```
Data → Model → Inference → Evidence → Decision          Detect → Explain → Prove → Decide
```

This repository contains the **backend and the full processing pipeline** (FastAPI + Python). The
frontend is specified separately in `UI_UX_PROMPT.md`.

---

## 1. Quick start (≈2 minutes)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

# A. Command-line attack lab (no server needed)
python scripts/run_demo.py --reset

# A2. Train a real CNN, then a backdoored one, and audit it
python scripts/train_model.py --demo-data --name cnn-clean --trust aerial-cnn-v1
python scripts/train_model.py --demo-data --name cnn-trojan --poison-target water --poison-position bottom-right --poison-pattern white
python scripts/audit.py --model <MDL-id printed above>            # zero-trust
python scripts/audit.py --model <MDL-id> --trusted aerial-cnn-v1  # against the approved model

# A3. Benchmark scored against ground truth, and independent verification
python scripts/run_benchmark.py --suite smoke                     # ~2 min, writes results.md
python scripts/verify_independent.py --rehash-files              # no TEJAS code imported

# B. API server (what the React UI talks to)
uvicorn app.main:app --host 127.0.0.1 --port 8000
#   Swagger UI:  http://127.0.0.1:8000/docs
curl -X POST http://127.0.0.1:8000/api/demo/bootstrap        # builds the attack lab (~8 s)
curl -X POST http://127.0.0.1:8000/api/demo/scenarios/clean  # starts a job, returns its WebSocket URL

# C. Tests
pytest -q
```

Expected output of `run_demo.py`:

| Scenario | What happens | Decision |
|---|---|---|
| A — Trusted pipeline | clean batch, approved model, valid provenance | **ACCEPT** (risk 0) |
| B — Dataset poisoning | trigger-patch poisoning by one contributor, label-flip duplicates, files altered after signing | **QUARANTINE** (~79) |
| C — Model substitution / backdoor | validly *signed* vendor model hides a corner-trigger backdoor | **QUARANTINE** (~72) |
| C2 — Silent weight tampering | same architecture, modified weights | **QUARANTINE** |
| E — Distribution shift | night / haze / blur batch | **REVIEW** (drift ≠ attack) |
| D — Inference tampering | a stored inference output is edited after the fact | **QUARANTINE** |

All state lives in `backend/data/` (override with `TEJAS_HOME`). Nothing contacts the network.

---

## 1b. What is and is not in this system (say this exactly to the panel)

| Question | Honest answer |
|---|---|
| Does TEJAS-CV train models? | It **audits** models; it does not need to train them. For demos and benchmarks it includes a real CNN trainer (`app/ml/`, NumPy backprop + Adam, exported to ONNX, gradients unit-tested) so the models under test, clean and backdoored, are genuinely trained. |
| Is the cryptography real? | Yes: SHA-256, Merkle trees, Ed25519 (`cryptography` library). `scripts/verify_independent.py` re-checks everything with no TEJAS code. |
| Is it a blockchain? | It is a **blockchain-style** ledger: signed, hash-chained blocks with Merkle roots, on a single node. It proves tampering happened; it is not a distributed consensus network. |
| Which database? | **SQLite** (`data/tejas.db`) through SQLAlchemy, plus files on disk (datasets, models, signed reports, keys). Chosen for air-gapped use: embedded, no server, nothing listening on the network. Not MongoDB/MySQL. |
| Is the demo data real? | The attack lab is synthetic by design (reproducible). Real public data (CIFAR-10, GTSRB, CIFAR-10-C, COCO, YOLO) is supported via `scripts/import_dataset.py`. |

## 1c. Accounts and roles

Login is **on by default**. The first account created (sign-up screen or `POST /api/auth/signup`)
becomes the **admin**; later sign-ups are **users**. Admins create/promote accounts.

| | admin | user |
|---|---|---|
| View dashboards, evidence, provenance, ledger, benchmarks | ✓ | ✓ |
| Run assessments on existing assets, run inference, verify chains | ✓ | ✓ |
| Upload datasets/models, train models, approve models, build baselines | ✓ | ✗ |
| Attack lab, tamper/restore tools, reset, benchmarks | ✓ | ✗ |
| Manage accounts | ✓ | ✗ |

Every upload, training run, assessment and inference is stamped with the account that did it
(`uploaded_by` / `created_by`), and every audit block carries an `actor`. The provenance graph shows
who uploaded, trained and requested what, with timestamps. Passwords are scrypt-hashed; sessions are
random tokens stored only as SHA-256; 5 failed logins lock an account for 5 minutes.
Recovery: `python scripts/create_admin.py --username <name>`.

## 1d. Test packs (large synthetic datasets with known answers)

```powershell
python scripts\test_packs.py all --scale medium    # small | medium | large | xl
```
Generates upload-ready zips and models under `data/test_packs/<scale>/` with an answer key
(`expected.json`) covering ACCEPT, REVIEW, QUARANTINE and REJECTED, then ingests and analyses them,
scores every case, measures throughput, and writes a signed `results.md`.

## 2. Architecture

```
            React UI (separate)  ──REST / WebSocket──►  FastAPI
                                                          │
                                              ANALYSIS ORCHESTRATOR
          LOADING → FINGERPRINTING → FEATURE_EXTRACTION → MODEL_LOADING
                                                          │
                  ┌──────────────┬───────────────┬───────┴────────┐   (thread pool, parallel)
                  ▼              ▼               ▼                ▼
             DATA           MODEL          PROVENANCE          DRIFT
           ASSURANCE      ASSURANCE        & TAMPER          & ANOMALY
                  └──────────────┴───────┬───────┴────────────────┘
                                         ▼
                           EVIDENCE FUSION (risk + confidence + rules)
                                         ▼
                           DECISION: ACCEPT / REVIEW / QUARANTINE
                                         ▼
                  AUDIT LEDGER (SHA-256 chain + Merkle root + Ed25519)
                                         ▼
                         SIGNED ASSURANCE REPORT (JSON)
```

```
backend/app/
  config.py            all settings, env-overridable, no network endpoints
  database.py          SQLite (WAL) via SQLAlchemy
  core/                hashing · merkle (RFC 6962) · keys (Ed25519) · ledger · events (live bus)
  features/            image statistics · embedder (DINOv2 local, or handcrafted fallback)
  adapters/            ONNX · TorchScript/PyTorch · static pickle scanner · registry
  engines/             data_assurance · model_assurance · provenance · drift · probes
  fusion/risk.py       noisy-OR engine scores, weighted fusion, explicit decision rules
  services/            ingestion · features (sampling/batching/cache) · baseline · inference · jobs · demo
  orchestrator/        pipeline.py — the 10-stage job runner
  api/                 REST + WebSocket routers
  demo/synth.py        reproducible attack-lab generator (datasets, signed manifests, 3 ONNX models)
tests/                 crypto, full scenarios, API + WebSocket contract
scripts/run_demo.py    CLI attack lab
```

---

## 3. What each engine actually does

Every finding carries **reason, evidence, confidence, severity and recommendation**, and is hashed into the
audit block's Merkle tree.

### Data Assurance
- Readability / format validation of every file; SHA-256 per sample; dataset identity = **Merkle root**.
- Exact duplicates (SHA-256) and **cross-label duplicates** (same bytes, different labels → label flipping).
- **Near-duplicates** via perceptual hash (pHash) clustering.
- Class-distribution comparison against the reference (Jensen–Shannon distance).
- **Label consistency**: k-nearest-neighbour vote in embedding space.
- **Trigger screen**: looks for the same localized pattern recurring in many samples and concentrated in one
  label (classic patch-poisoning signature).
- Per-label statistical outliers (brightness, contrast, blur, haze, edge density).
- **Contributor attribution**: suspicious samples are aggregated per contributor.

### Model Assurance
- Static pickle scan for dangerous globals (`os.system`, `subprocess`, `eval`…) in `.pt/.pth` files.
- **Signed trusted-model registry**: distinguishes *substitution* (different architecture) from *weight
  modification* (same architecture, different weights) from an *unverified* model.
- Structural inspection: parameter count, layers, custom ops, and **input-region shortcut detection**
  (a graph path that reads a tiny patch of the input directly — an architectural-backdoor heuristic).
- Weight-distribution outliers.
- **Behavioural fingerprint**: agreement with the trusted model on 16 deterministic probe images.
- Accuracy probe on the incoming data.
- **Controlled trigger testing**: 16 trigger patterns (corner/centre patches, checkerboards, random patches,
  plus a Gaussian-noise control). Reports attack-success rate and target-class concentration.

### Provenance & Tamper Detection
- Re-hashes the dataset on disk and compares with the registered Merkle root.
- Verifies the contributor's **Ed25519-signed `manifest.json`** and lists files changed after signing.
- Re-hashes the model file; verifies contributor signatures.
- Verifies the **inference provenance chain** (input hash + model hash + output hash + timestamp + nonce +
  previous hash, signed) and the **audit ledger** itself.
- `/api/inference/attest` detects forged records, altered outputs, stale results and **replay**.

### Distribution Shift & Anomaly
- Verifies the baseline file's hash before trusting it.
- OOD rate vs. the reference 99th-percentile distance envelope.
- **MMD two-sample permutation test** on embeddings (p-value).
- KS tests + tail-share on brightness / contrast / saturation / blur / haze → named **environmental
  conditions** (night, haze, blur, sensor change).
- Capped at MEDIUM severity by design: **drift is not an attack**.

### Evidence Fusion & Decision
- Engine score = noisy-OR of finding scores (severity base × confidence).
- Risk = 0.6 · max(engine) + 0.4 · weighted mean (weights data .3 / model .3 / provenance .2 / drift .2 —
  a prototype configuration, not a universal constant).
- Thresholds: `<35 ACCEPT`, `35–69 REVIEW`, `≥70 QUARANTINE`, plus explicit, reported rules:
  R1 any CRITICAL → QUARANTINE · R2 HIGH model/provenance finding → QUARANTINE · R3 ≥2 HIGH data findings →
  QUARANTINE · R4 unverified model → at least REVIEW · R5/R6 drift → REVIEW, never QUARANTINE on its own.
- Confidence is reduced when checks were unavailable (coverage).

---

## 4. Demo script for the judges (UI or curl)

1. `POST /api/demo/bootstrap` → dashboard shows assets, contributors, trusted model, baseline.
2. Run **clean** → ACCEPT, every engine green.
3. Run **model-substitution** → model engine turns red; open the trigger-test finding ("white patch
   bottom-right forces 'water' on 78% of inputs"). *The vendor's signature was valid — the behaviour wasn't.*
4. Run **poisoned** → contributor `vendor-charlie` is attributed; manifest mismatch proven by signature.
5. Run **inference-tamper** → one record TAMPERED.
6. Run **drift** → REVIEW with named conditions. *Drift ≠ attack.*
7. **Last**: `POST /api/demo/tamper/audit/{index}` then `POST /api/audit/verify` → block turns TAMPERED,
   every later block UNTRUSTED_DOWNSTREAM. (A tampered ledger is reported by every later job, so do this
   last or `POST /api/demo/reset` afterwards.)

---

## 5. API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/system/status` | air-gap mode, embedder, adapters, signing key, ledger health, fusion config |
| GET | `/api/dashboard/summary` | counters, decisions, severity counts, recent findings |
| POST | `/api/assets/datasets` | upload `.zip` (`<label>/<image>`, optional `manifest.json` + `manifest.sig`) · form: `name`, `contributor`, `signature?` |
| POST | `/api/assets/models` | upload `.onnx` / TorchScript `.pt` / state-dict `.pth` · form: `name`, `contributor`, `adapter_meta` JSON, `signature?` |
| GET | `/api/assets?asset_type=` · `/api/assets/{id}` | list / detail |
| GET | `/api/assets/{id}/samples` | paginated samples with hashes and stats |
| GET | `/api/assets/{id}/samples/{sid}/proof` | Merkle inclusion proof |
| GET | `/api/assets/{id}/samples/{sid}/image` | sample image |
| POST/GET | `/api/contributors` | register (keypair generated if none given) / list |
| POST/GET | `/api/registry/models` | approve a model (signed fingerprint) / list |
| POST/GET | `/api/baselines` | build reference baseline / list |
| POST | `/api/jobs` | start analysis `{dataset_id?, model_id?, baseline_id?, trusted_model?, label?}` |
| GET | `/api/jobs` · `/api/jobs/{id}` · `/summary` · `/findings` · `/report` · `/events` · `/provenance-graph` | results |
| POST | `/api/inference` | run model + create signed chained record (form: `model_id`, `file`) |
| GET | `/api/inference` · `/api/inference/{id}` | records |
| POST | `/api/inference/verify-chain` · `/api/inference/attest` | chain verification · replay/forgery check |
| GET | `/api/audit` · POST `/api/audit/verify` | ledger blocks · full-chain verification |
| POST | `/api/demo/bootstrap` · `/api/demo/scenarios/{name}` · `/api/demo/tamper/{inference\|audit\|model-file}/{id}` · `/api/demo/reset` | attack lab |
| WS | `/ws/jobs/{id}` | replay + live events for one job |
| WS | `/ws/events` | global live feed |

WebSocket event types: `queued`, `stage`, `engine_progress`, `engine_complete`, `complete`, `failed`.
Stages: `LOADING → FINGERPRINTING → FEATURE_EXTRACTION → MODEL_LOADING → PARALLEL_ANALYSIS → FUSION →
DECISION → AUDIT → REPORT → COMPLETED` (or `FAILED`).

---

## 6. Using real models and DINOv2 (offline)

- **ONNX** works out of the box. Supply `adapter_meta`, e.g.
  `{"input_size":[224,224],"mean":[0.485,0.456,0.406],"std":[0.229,0.224,0.225],"class_names":["..."]}`.
- **PyTorch / TorchScript**: `pip install -r requirements-optional.txt`. TorchScript runs fully; plain
  state-dicts are inspected statically (loaded with `weights_only`) — behavioural checks need TorchScript or ONNX
  and are reported as *unavailable*, not silently skipped.
- **DINOv2 without internet**: on a connected machine, `git clone https://github.com/facebookresearch/dinov2`
  and download `dinov2_vits14_pretrain.pth`; copy both across, then
  `export TEJAS_EMBEDDER=dinov2 TEJAS_DINOV2_REPO=/path/dinov2 TEJAS_DINOV2_WEIGHTS=/path/dinov2_vits14_pretrain.pth`.
  Rebuild the baseline afterwards. If not configured, the built-in handcrafted embedder is used and every
  report says so.
- **Offline installation**: on a connected machine `pip download -r requirements.txt -d wheelhouse`, carry
  the folder across, then `pip install --no-index --find-links wheelhouse -r requirements.txt`.

---

## 6b. Scripts

| Script | Purpose |
|---|---|
| `run_demo.py` | six-scenario attack lab, no server |
| `train_model.py` | train a CNN (optionally poisoned with a chosen trigger), register it, optionally approve it |
| `audit.py` | run one assurance job and print verdict + evidence |
| `make_attack.py` | red-team dataset/model attacks with a signed answer key kept outside the dataset |
| `run_benchmark.py` | `ci` / `smoke` / `standard` suites scored against ground truth; `--source DS-id` for real data |
| `calibrate.py` | fit a baseline on clean calibration data and measure false alarms on a clean hold-out |
| `fetch_datasets.py` | download public archives (connected machine only) |
| `import_dataset.py` | offline, hash-verified import of CIFAR-10 / GTSRB / CIFAR-10-C / COCO / YOLO |
| `verify_independent.py` | independent re-verification of ledger, inference chain, files and signed reports |

## 7. Honest limitations (also embedded in every signed report)

- Trigger testing screens a bank of common trigger shapes; novel or input-specific triggers may evade it.
  We claim **backdoor-like behavioural screening**, not complete backdoor discovery.
- Drift/OOD results indicate operational change, not malicious intent.
- Label consistency depends on the embedder's notion of visual similarity.
- Pickle scanning is static; heavily obfuscated payloads may be missed.
- The platform signing key is stored locally; production should use an HSM/KMS.
- The demo data is synthetic (reproducible by design); thresholds were set on it and should be recalibrated
  on real reference data.
- Trigger testing covers solid white/black and checker patches in the corners, a centre checker and 8 random
  solid patches. In our own benchmark a learned backdoor with a **red centre** patch (100% attack success) was
  not flagged in zero-trust mode; it was caught only by comparison with the approved model. SIG-style and
  strongly blended triggers are also weak spots. See the generated `results.md`.
- The ledger is a local tamper-*evident* hash chain, not a distributed blockchain: it proves *that*
  tampering happened, it cannot prevent a privileged attacker from deleting everything. Periodically exporting
  the ledger head hash to a write-once medium closes that gap.
