"""HTTP + WebSocket contract used by the React frontend."""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture(scope="module")
def client(demo_state):
    with TestClient(app) as c:
        yield c


def test_health_and_status(client):
    assert client.get("/api/health").status_code == 200
    st = client.get("/api/system/status").json()
    assert "embedder" in str(st).lower() or st


def test_scenario_over_websocket(client):
    r = client.post("/api/demo/scenarios/clean")
    assert r.status_code == 200
    job_id = r.json()["job"]["id"]
    types = []
    with client.websocket_connect(f"/ws/jobs/{job_id}") as ws:
        while True:
            ev = ws.receive_json()
            types.append(ev["type"])
            if ev["type"] in ("complete", "failed"):
                break
    assert types[-1] == "complete" and ev["decision"] == "ACCEPT"
    assert "stage" in types
    job = client.get(f"/api/jobs/{job_id}").json()
    assert job["status"] == "COMPLETED"
    assert client.get(f"/api/jobs/{job_id}/findings").status_code == 200
    assert client.get(f"/api/jobs/{job_id}/summary").status_code == 200
    rep = client.get(f"/api/jobs/{job_id}/report").json()
    assert rep["signature_valid"] is True
    g = client.get(f"/api/jobs/{job_id}/provenance-graph").json()
    assert g["nodes"] and g["edges"]


def test_inference_then_tamper_then_verify(client, demo_state):
    # use a non-approved model so the approved model's chain stays clean for later tests
    model_id = demo_state["models"]["tampered"]
    buf = io.BytesIO()
    Image.new("RGB", (128, 128), (40, 120, 40)).save(buf, "PNG")
    r = client.post("/api/inference", data={"model_id": model_id},
                    files={"file": ("probe.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200, r.text
    rec = r.json()
    rid = rec["id"]
    a1 = client.post("/api/inference/attest", json={"record": rec}).json()
    a2 = client.post("/api/inference/attest", json={"record": rec}).json()
    assert a1["verdict"] == "ACCEPT"
    assert a2["verdict"] == "REJECT" and "REPLAY" in a2["reason"]
    client.post(f"/api/demo/tamper/inference/{rid}")
    v = client.post("/api/inference/verify-chain").json()
    assert not v["valid"]
    assert any(x["id"] == rid and x["status"] == "TAMPERED" for x in v["records"])


def test_dataset_merkle_proof(client, demo_state):
    ds = demo_state["datasets"]["reference"]
    samples = client.get(f"/api/assets/{ds}/samples", params={"limit": 3}).json()
    items = samples["items"] if isinstance(samples, dict) else samples
    sid = items[0]["id"]
    proof = client.get(f"/api/assets/{ds}/samples/{sid}/proof").json()
    assert proof["verified"] is True
