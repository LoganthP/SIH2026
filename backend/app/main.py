"""TEJAS-CV: Trusted Evaluation & Judgement Assurance System for Computer Vision.

Run:  uvicorn app.main:app --host 127.0.0.1 --port 8000
Docs: http://127.0.0.1:8000/docs
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import assets, auth, benchmarks, demo, jobs, ml, provenance, system, ws
from .auth.middleware import AuthMiddleware
from .config import settings
from .core.events import bus
from .core.keys import platform_keys
from .core.ledger import ensure_genesis
from .database import SessionLocal, init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.ensure_dirs()
    init_db()
    platform_keys()
    with SessionLocal() as db:
        ensure_genesis(db)
    bus.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title="TEJAS-CV Assurance API", version="1.0.0", lifespan=lifespan,
              description="Offline integrity assurance for computer-vision data, models and inference outputs. "
                          "Detect -> Explain -> Prove -> Decide.")
# Starlette: the LAST middleware added is the outermost. Auth is added first so CORS wraps it
# and even 401/403 responses carry CORS headers.
app.add_middleware(AuthMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
for r in (auth.router, system.router, assets.router, jobs.router, provenance.router, demo.router,
          benchmarks.router, ml.router, ws.router):
    app.include_router(r)


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}
