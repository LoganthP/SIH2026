"""Tamper-evident audit ledger: a signed hash chain whose blocks carry Merkle roots.

block_hash = SHA256(canonical{index, timestamp, event_type, subject,
                              payload_hash, merkle_root, previous_hash})
signature  = Ed25519(platform_key, block_hash)

Any edit to a payload, header or link is detected by verify_chain(); every block
after the first compromised one is marked UNTRUSTED_DOWNSTREAM.
"""
from __future__ import annotations

import threading
from typing import Any

from sqlalchemy.orm import Session

from ..database import AuditBlock, iso_now
from .hashing import sha256_json
from .keys import platform_keys, verify_signature
from .merkle import merkle_root

GENESIS_PREV = "0" * 64
_lock = threading.Lock()


def _core(b: AuditBlock) -> dict[str, Any]:
    return {"index": b.index, "timestamp": b.timestamp, "event_type": b.event_type,
            "subject": b.subject, "payload_hash": b.payload_hash,
            "merkle_root": b.merkle_root, "previous_hash": b.previous_hash}


def append_block(session: Session, event_type: str, subject: str, payload: dict[str, Any],
                 leaves: list[str] | None = None) -> AuditBlock:
    from .actor import current_actor
    if "actor" not in payload and event_type != "GENESIS":
        payload = {**payload, "actor": current_actor()}    # who did it, sealed with the block
    with _lock:
        last = session.query(AuditBlock).order_by(AuditBlock.index.desc()).first()
        payload_hash = sha256_json(payload)
        leaves = leaves or [payload_hash]
        blk = AuditBlock(
            index=(last.index + 1) if last else 0, timestamp=iso_now(), event_type=event_type,
            subject=subject, payload=payload, payload_hash=payload_hash,
            merkle_root=merkle_root(leaves), leaf_count=len(leaves),
            previous_hash=last.block_hash if last else GENESIS_PREV,
        )
        blk.block_hash = sha256_json(_core(blk))
        blk.signature = platform_keys().sign(blk.block_hash)
        session.add(blk)
        session.commit()
        return blk


def ensure_genesis(session: Session) -> None:
    if session.query(AuditBlock).count() == 0:
        km = platform_keys()
        append_block(session, "GENESIS", "TEJAS-CV",
                     {"system": "TEJAS-CV", "platform_key_id": km.key_id,
                      "public_key": km.public_hex})


def verify_chain(session: Session) -> dict[str, Any]:
    pub = platform_keys().public_hex
    blocks = session.query(AuditBlock).order_by(AuditBlock.index).all()
    prev, first_bad, out = GENESIS_PREV, None, []
    for b in blocks:
        issues = []
        if sha256_json(b.payload) != b.payload_hash:
            issues.append("PAYLOAD_ALTERED")
        if sha256_json(_core(b)) != b.block_hash:
            issues.append("HEADER_ALTERED")
        if b.previous_hash != prev:
            issues.append("LINK_BROKEN")
        if not verify_signature(pub, b.block_hash, b.signature):
            issues.append("BAD_SIGNATURE")
        if issues:
            status = "TAMPERED"
            first_bad = b.index if first_bad is None else first_bad
        else:
            status = "UNTRUSTED_DOWNSTREAM" if first_bad is not None else "VALID"
        out.append({"index": b.index, "event_type": b.event_type, "subject": b.subject,
                    "timestamp": b.timestamp, "block_hash": b.block_hash,
                    "previous_hash": b.previous_hash, "merkle_root": b.merkle_root,
                    "status": status, "issues": issues})
        prev = b.block_hash
    return {"valid": first_bad is None, "length": len(blocks), "first_invalid_index": first_bad,
            "head_hash": blocks[-1].block_hash if blocks else None,
            "verified_at": iso_now(), "blocks": out}
