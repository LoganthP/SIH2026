from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..core.hashing import sha256_bytes
from ..core.keys import verify_signature
from ..core.merkle import merkle_proof, verify_proof
from ..database import Asset, Contributor, DatasetSample, TrustedModel, get_db
from ..services.ingestion import (IngestionError, register_contributor, register_dataset, register_model,
                                  register_trusted_model)
from . import serializers as S

router = APIRouter(prefix="/api", tags=["assets"])


def _save_upload(up: UploadFile) -> Path:
    suffix = Path(up.filename or "upload").suffix
    fd, tmp = tempfile.mkstemp(suffix=suffix, dir=settings.uploads_dir)
    with open(fd, "wb") as out:
        shutil.copyfileobj(up.file, out)
    return Path(tmp)


MODEL_EXT = {".onnx", ".pt", ".pth", ".torchscript", ".ts"}


def _model_gate(path: Path) -> str | None:
    """Refuse files that must never enter the platform (zero-trust ingestion gate)."""
    if path.suffix.lower() not in MODEL_EXT:
        return f"unsupported model file type '{path.suffix}' (allowed: {', '.join(sorted(MODEL_EXT))})"
    if path.stat().st_size == 0:
        return "empty file"
    if path.suffix.lower() in {".pt", ".pth", ".torchscript", ".ts"}:
        from ..adapters.pickle_scan import scan_model_file
        rep = scan_model_file(path)
        if rep.get("dangerous"):
            bad = ", ".join(sorted(set(rep["dangerous"]))[:5])
            return f"pickle contains code-execution globals ({bad or 'dangerous imports'}); file was not loaded"
    return None


def _record_rejection(db: Session, kind: str, filename: str | None, path: Path, reason: str) -> None:
    """Rejected uploads leave evidence: file hash, uploader and reason are sealed in the ledger."""
    from ..core.hashing import sha256_file
    from ..core.ledger import append_block
    try:
        sha = sha256_file(path)
    except OSError:
        sha = None
    append_block(db, "INGESTION_REJECTED", filename or kind,
                 {"kind": kind, "filename": filename, "sha256": sha, "reason": reason})


@router.post("/assets/datasets", summary="Upload a dataset (.zip with <label>/<image> layout or YOLO/COCO)")
def upload_dataset(request: Request, file: UploadFile = File(...), name: Optional[str] = Form(None),
                   contributor: Optional[str] = Form(None), signature: Optional[str] = Form(None),
                   format: str = Form("classification"),
                   db: Session = Depends(get_db)):
    from ..core.actor import current_actor
    user = (request.scope.get("state") or {}).get("user")
    actor_username = user.get("username") if user else current_actor()
    ds_name = name or Path(file.filename or "dataset").stem
    ds_contributor = contributor or (user.get("username") if user else "operator")

    tmp = _save_upload(file)
    try:
        asset = register_dataset(db, tmp, ds_name, ds_contributor, signature, uploaded_by=actor_username)
        fmt = (format or "classification").lower()
        if fmt in ("yolo", "coco"):
            from ..services.ingestion import attach_detection_annotations
            asset_dir = Path(asset.path)
            try:
                if fmt == "yolo":
                    from ..formats.yolo import parse_yolo
                    yaml_p = next(asset_dir.rglob("*.yaml"), None) or next(asset_dir.rglob("*.yml"), None)
                    det = parse_yolo(asset_dir, yaml_p)
                else:
                    from ..formats.coco import parse_coco
                    json_candidates = [p for p in asset_dir.rglob("*.json") if p.name != "manifest.json"]
                    json_p = json_candidates[0] if json_candidates else None
                    if json_p:
                        det = parse_coco(json_p, asset_dir)
                    else:
                        from ..formats.detection_model import DetectionDataset
                        det = DetectionDataset(samples=[], classes={})
                attach_detection_annotations(db, asset, det)
            except Exception as parse_err:
                meta = dict(asset.meta or {})
                meta["annotation_parse_warning"] = str(parse_err)[:300]
                asset.meta = meta
                db.commit()
        return S.asset(asset)
    except IngestionError as exc:
        _record_rejection(db, "dataset", file.filename, tmp, str(exc))
        raise HTTPException(400, f"REJECTED at ingestion: {exc}") from exc
    finally:
        tmp.unlink(missing_ok=True)


@router.post("/assets/models", summary="Upload a model (.onnx, TorchScript .pt, state-dict .pth)")
def upload_model(request: Request, file: UploadFile = File(...), name: Optional[str] = Form(None),
                 contributor: Optional[str] = Form(None),
                 adapter_meta: str = Form("{}", description='JSON: {"input_size":[H,W],"mean":[..],"std":[..],"class_names":[..]}'),
                 signature: Optional[str] = Form(None, description="Ed25519 hex signature over the file SHA-256 hex"),
                 db: Session = Depends(get_db)):
    from ..core.actor import current_actor
    user = (request.scope.get("state") or {}).get("user")
    actor_username = user.get("username") if user else current_actor()
    md_name = name or Path(file.filename or "model").stem
    md_contributor = contributor or (user.get("username") if user else "operator")

    try:
        meta = json.loads(adapter_meta or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "adapter_meta must be JSON") from exc
    tmp = _save_upload(file)
    try:
        reason = _model_gate(tmp)
        if reason:
            _record_rejection(db, "model", file.filename, tmp, reason)
            raise HTTPException(400, f"REJECTED at ingestion: {reason}")
        return S.asset(register_model(db, tmp, md_name, md_contributor, meta, signature, uploaded_by=actor_username))
    finally:
        tmp.unlink(missing_ok=True)


@router.get("/assets")
def list_assets(asset_type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Asset)
    if asset_type:
        q = q.filter_by(asset_type=asset_type)
    return [S.asset(a) for a in q.order_by(Asset.created_at.desc())]


@router.get("/assets/{asset_id}")
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    a = db.get(Asset, asset_id)
    if not a:
        raise HTTPException(404, "asset not found")
    return S.asset(a)


@router.get("/assets/{asset_id}/samples")
def list_samples(asset_id: str, offset: int = 0, limit: int = 100, label: Optional[str] = None,
                 db: Session = Depends(get_db)):
    q = db.query(DatasetSample).filter_by(dataset_id=asset_id)
    if label:
        q = q.filter_by(label=label)
    total = q.count()
    rows = q.order_by(DatasetSample.relpath).offset(offset).limit(min(limit, 500)).all()
    return {"total": total, "items": [{"id": r.id, "relpath": r.relpath, "label": r.label,
                                       "contributor": r.contributor, "sha256": r.sha256, "phash": r.phash,
                                       "readable": r.readable, "error": r.error, "stats": r.stats,
                                       "width": r.width, "height": r.height} for r in rows]}


@router.get("/assets/{asset_id}/samples/{sample_id}/proof", summary="Merkle inclusion proof for one image")
def sample_proof(asset_id: str, sample_id: int, db: Session = Depends(get_db)):
    a = db.get(Asset, asset_id)
    rows = db.query(DatasetSample).filter_by(dataset_id=asset_id).order_by(DatasetSample.relpath).all()
    idx = next((i for i, r in enumerate(rows) if r.id == sample_id), None)
    if a is None or idx is None:
        raise HTTPException(404, "sample not found")
    leaves = [r.sha256 for r in rows]
    proof = merkle_proof(leaves, idx)
    return {"sample": rows[idx].relpath, "leaf_sha256": leaves[idx], "leaf_index": idx, "proof": proof,
            "merkle_root": a.sha256, "verified": verify_proof(leaves[idx], proof, a.sha256)}


@router.get("/assets/{asset_id}/samples/{sample_id}/image")
def sample_image(asset_id: str, sample_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse
    a, r = db.get(Asset, asset_id), db.get(DatasetSample, sample_id)
    if not a or not r or r.dataset_id != asset_id:
        raise HTTPException(404, "sample not found")
    p = (Path(a.path) / r.relpath).resolve()
    if not str(p).startswith(str(Path(a.path).resolve())) or not p.exists():
        raise HTTPException(404, "file missing")
    return FileResponse(p)


@router.get("/assets/{asset_id}/samples/{sample_id}/details", summary="Windows-properties style deep details for a sample")
def sample_details(asset_id: str, sample_id: int, db: Session = Depends(get_db)):
    a = db.get(Asset, asset_id)
    s = db.get(DatasetSample, sample_id)
    if not a or not s or s.dataset_id != asset_id:
        raise HTTPException(404, "sample not found")

    p = (Path(a.path) / s.relpath).resolve()
    cur_hash = sha256_bytes(p.read_bytes()) if p.exists() else None
    file_unchanged = bool(cur_hash == s.sha256)

    # Merkle proof & verification
    rows = db.query(DatasetSample).filter_by(dataset_id=asset_id).order_by(DatasetSample.relpath).all()
    idx = next((i for i, r in enumerate(rows) if r.id == sample_id), None)
    if idx is not None:
        leaves = [r.sha256 for r in rows]
        proof = merkle_proof(leaves, idx)
        merkle_verified = bool(verify_proof(leaves[idx], proof, a.sha256))
    else:
        proof = []
        merkle_verified = False

    # Manifest checking
    root = Path(a.path)
    mpath = root / "manifest.json"
    spath = root / "manifest.sig"
    manifest_present = mpath.exists()
    listed_in_manifest = False
    manifest_hash_matches = False
    manifest_signer = None
    manifest_signature_valid = False
    signer_key_fingerprint = None

    if manifest_present:
        try:
            mdata = json.loads(mpath.read_text())
            declared_files = {f["path"]: f for f in mdata.get("files", [])}
            if s.relpath in declared_files:
                listed_in_manifest = True
                manifest_hash_matches = bool(declared_files[s.relpath].get("sha256") == s.sha256)
        except Exception:
            pass

        manifest_signer = a.contributor
        contrib = db.query(Contributor).filter_by(name=a.contributor).first()
        if contrib and contrib.public_key:
            signer_key_fingerprint = sha256_bytes(contrib.public_key.encode()).hex()[:16]
            if spath.exists():
                try:
                    sig = spath.read_text().strip()
                    manifest_signature_valid = bool(verify_signature(contrib.public_key, mpath.read_bytes(), sig))
                except Exception:
                    manifest_signature_valid = False

    # Findings on latest completed job on this dataset
    from ..database import Job
    latest_job = (
        db.query(Job)
        .filter(Job.dataset_id == asset_id, Job.status == "COMPLETED")
        .order_by(Job.completed_at.desc(), Job.created_at.desc())
        .first()
    )
    findings = []
    if latest_job and latest_job.report:
        flagged_list = (
            latest_job.report.get("metrics", {})
            .get("data", {})
            .get("flagged_sample_list", [])
        )
        sample_flags = next(
            (item for item in flagged_list if item.get("sample_id") == s.id or item.get("relpath") == s.relpath),
            None
        )
        if sample_flags and sample_flags.get("reasons"):
            findings.append({
                "job_id": latest_job.id,
                "decision": latest_job.decision,
                "time": latest_job.completed_at.isoformat() if latest_job.completed_at else (latest_job.created_at.isoformat() if latest_job.created_at else None),
                "reasons": sample_flags.get("reasons", []),
            })

    # History: same_file_elsewhere (same sha256)
    same_files = (
        db.query(DatasetSample, Asset)
        .join(Asset, DatasetSample.dataset_id == Asset.id)
        .filter(DatasetSample.sha256 == s.sha256, DatasetSample.id != s.id)
        .limit(20)
        .all()
    )
    same_file_elsewhere = [
        {
            "dataset_id": other_asset.id,
            "dataset_name": other_asset.name,
            "relpath": other_s.relpath,
            "label": other_s.label,
            "ingested_at": other_asset.created_at.isoformat() if other_asset.created_at else None,
        }
        for other_s, other_asset in same_files
    ]

    # History: near duplicates (pHash distance <= 6, max 10)
    near_duplicates = []
    if s.phash:
        try:
            import imagehash
            h1 = imagehash.hex_to_hash(s.phash)
            candidates = (
                db.query(DatasetSample)
                .filter(DatasetSample.phash.isnot(None), DatasetSample.id != s.id)
                .limit(500)
                .all()
            )
            dups = []
            for cand in candidates:
                if cand.phash:
                    try:
                        h2 = imagehash.hex_to_hash(cand.phash)
                        dist = int(h1 - h2)
                        if dist <= 6:
                            dups.append({
                                "dataset_id": cand.dataset_id,
                                "relpath": cand.relpath,
                                "sample_id": cand.id,
                                "distance": dist,
                            })
                    except Exception:
                        pass
            dups.sort(key=lambda x: x["distance"])
            near_duplicates = dups[:10]
        except Exception:
            pass

    # Source meta
    sm = s.source_meta or {}

    return {
        "general": {
            "filename": Path(s.relpath).name,
            "relpath": s.relpath,
            "label": s.label,
            "dataset_id": a.id,
            "dataset_name": a.name,
            "size_bytes": sm.get("size_bytes") if sm.get("size_bytes") is not None else s.size,
            "format": sm.get("format"),
            "width": sm.get("width") if sm.get("width") is not None else s.width,
            "height": sm.get("height") if sm.get("height") is not None else s.height,
            "mode": sm.get("mode"),
            "source_modified_at": sm.get("archive_modified_at"),
            "ingested_at": a.created_at.isoformat() if a.created_at else None,
            "uploaded_by": a.uploaded_by,
            "contributor": s.contributor,
        },
        "signatures": {
            "sha256": s.sha256,
            "sha256_recomputed_now": cur_hash,
            "file_unchanged": file_unchanged,
            "merkle_root": a.sha256,
            "merkle_proof": proof,
            "merkle_verified": merkle_verified,
            "manifest_present": manifest_present,
            "listed_in_manifest": listed_in_manifest,
            "manifest_hash_matches": manifest_hash_matches,
            "manifest_signer": manifest_signer,
            "manifest_signature_valid": manifest_signature_valid,
            "signer_key_fingerprint": signer_key_fingerprint,
        },
        "security": {
            "dataset_status": a.status,
            "uploaded_by": a.uploaded_by,
            "ingested_at": a.created_at.isoformat() if a.created_at else None,
            "visible_to_roles": ["admin", "operator", "client"],
            "findings": findings,
        },
        "details": {
            "exif": sm.get("exif"),
            "stats": s.stats or {},
            "phash": s.phash,
            "sample_id": s.id,
        },
        "history": {
            "same_file_elsewhere": same_file_elsewhere,
            "near_duplicates": near_duplicates,
            "demo_tampered": not file_unchanged,
        },
    }


# ---- contributors & trusted registry ---------------------------------------------------
class ContributorIn(BaseModel):
    name: str
    public_key: Optional[str] = None
    organisation: Optional[str] = None


@router.post("/contributors", tags=["registry"])
def create_contributor(body: ContributorIn, db: Session = Depends(get_db)):
    try:
        c, priv = register_contributor(db, body.name, body.public_key, body.organisation)
    except IngestionError as exc:
        raise HTTPException(409, str(exc)) from exc
    out = S.contributor(c)
    if priv:
        out["private_key_once"] = priv
        out["warning"] = "Private key is shown once and is not stored by TEJAS-CV."
    return out


@router.get("/contributors", tags=["registry"])
def list_contributors(db: Session = Depends(get_db)):
    return [S.contributor(c) for c in db.query(Contributor).order_by(Contributor.name)]


class TrustedIn(BaseModel):
    asset_id: str
    name: str


@router.post("/registry/models", tags=["registry"], summary="Approve a model: store its signed fingerprint")
def trust_model(body: TrustedIn, db: Session = Depends(get_db)):
    a = db.get(Asset, body.asset_id)
    if not a:
        raise HTTPException(404, "asset not found")
    try:
        return S.trusted(register_trusted_model(db, a, body.name))
    except IngestionError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/registry/models", tags=["registry"])
def list_trusted(db: Session = Depends(get_db)):
    return [S.trusted(t) for t in db.query(TrustedModel).order_by(TrustedModel.name)]
