"""Adapter factory: picks an adapter from the file type."""
from __future__ import annotations

from pathlib import Path

from .base import ModelAdapter, ModelLoadError

TORCH_EXT = {".pt", ".pth", ".ts", ".torchscript", ".pkl", ".bin"}


def load_adapter(path: str | Path, meta: dict | None = None) -> ModelAdapter:
    ext = Path(path).suffix.lower()
    if ext == ".onnx":
        task = (meta or {}).get("task") or (meta or {}).get("adapter_meta", {}).get("task") or (meta or {}).get("format")
        if task in ("detection", "onnx-yolo"):
            from .onnx_detection_adapter import OnnxYoloAdapter
            return OnnxYoloAdapter(path, meta)
        from .onnx_adapter import OnnxAdapter
        return OnnxAdapter(path, meta)
    if ext in TORCH_EXT:
        from .torch_adapter import TorchAdapter
        return TorchAdapter(path, meta)
    raise ModelLoadError(f"unsupported model format '{ext}' (supported: .onnx, "
                         f"{', '.join(sorted(TORCH_EXT))})")


def adapter_availability() -> dict[str, bool]:
    out = {}
    for mod in ("onnx", "onnxruntime", "torch"):
        try:
            __import__(mod)
            out[mod] = True
        except ImportError:
            out[mod] = False
    return out
