from tests.test_api import COMMIT, DEAL

AGENT = "a1.op.testnet"
P = {
    "agent": AGENT,
    "player_commitment": COMMIT,
    "commit_tx": "TX",
    "data": {"tableId": "vault", "stack": 50},
}


def deal(client, sid, hand_id="0123abcd"):
    client.post(f"/sessions/{sid}/deals", json={**DEAL, "hand_id": hand_id})


def test_pending_blocks_the_agent_until_revealed(client, session_id):
    deal(client, session_id)
    deal(client, session_id, "0123abce")
    assert client.put("/pending/0123abcd", json={**P, "session_id": session_id}).status_code == 201
    got = client.get("/pending", params={"agent": AGENT}).json()["hand"]
    assert got["hand_id"] == "0123abcd" and got["seed"] == DEAL["seed"] and got["data"]["stack"] == 50
    assert got["session_id"] == session_id and got["created_at"] > 0
    # One unrevealed hand per agent, enforced by the database.
    assert client.put("/pending/0123abce", json={**P, "session_id": session_id}).status_code == 409
    assert client.post("/pending/0123abcd/reveal").json() == {"ok": True}
    assert client.post("/pending/0123abcd/reveal").status_code == 404  # once
    assert client.get("/pending/0123abcd").status_code == 404
    assert client.get("/pending", params={"agent": AGENT}).json() == {"hand": None}
    assert client.put("/pending/0123abce", json={**P, "session_id": session_id}).status_code == 201


def test_pending_needs_a_known_deal_and_session(client, session_id):
    assert client.put("/pending/0123abcd", json={**P, "session_id": session_id}).status_code == 404
    deal(client, session_id)
    other = "00000000-0000-4000-8000-000000000000"
    assert client.put("/pending/0123abcd", json={**P, "session_id": other}).status_code == 404


def test_pending_needs_the_token(client):
    assert client.get("/pending", params={"agent": AGENT}, headers={"Authorization": ""}).status_code == 401


def test_autoplay_flag_lists_sessions_to_resume(client, session_id):
    assert client.get(f"/sessions/{session_id}/autoplay").json() == {"on": False, "autoplay": None}
    client.put(
        f"/sessions/{session_id}/autoplay", json={"on": True, "autoplay": {"tableId": "vault", "hands": 0}}
    )
    assert client.get("/autoplay").json() == {"sessions": [session_id]}
    client.put(f"/sessions/{session_id}/autoplay", json={"on": False})
    assert client.get("/autoplay").json() == {"sessions": []}
    # Turning off keeps the last progress (and stop reason) for the page to show.
    assert client.get(f"/sessions/{session_id}/autoplay").json()["autoplay"] == {
        "tableId": "vault",
        "hands": 0,
    }
