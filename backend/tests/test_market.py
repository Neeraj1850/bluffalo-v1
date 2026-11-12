from datetime import timedelta

from sqlalchemy import update

from app.models import MarketEvent, now

KEY = "ed25519:" + "1" * 40


def strategy(session_id, id="s1a2b3c4d", name="Shark"):
    return {
        "id": id,
        "creator_session_id": session_id,
        "creator_account": "alice.testnet",
        "name": name,
        "params": {"aggression": 0.8},
        "salt": "ab" * 16,
        "params_hash": "cd" * 32,
        "contract_id": "npk-63o824.testnet",
        "mint_tx": "TxHash1",
    }


def test_public_list_hides_params_and_salt(client, session_id):
    assert client.post("/strategies", json=strategy(session_id)).status_code == 201
    [s] = client.get("/strategies").json()["strategies"]
    assert s["id"] == "s1a2b3c4d" and s["name"] == "Shark" and s["params_hash"] == "cd" * 32
    assert "params" not in s and "salt" not in s and "creator_session_id" not in s
    secret = client.get("/strategies/s1a2b3c4d/params").json()
    assert secret == {"params": {"aggression": 0.8}, "salt": "ab" * 16, "params_hash": "cd" * 32}
    assert client.get("/strategies/nope/params").status_code == 404


def test_duplicate_name_or_id_conflicts(client, session_id):
    client.post("/strategies", json=strategy(session_id))
    assert client.post("/strategies", json=strategy(session_id, id="other")).status_code == 409
    assert client.post("/strategies", json=strategy(session_id, name="Other")).status_code == 409


def test_stats_aggregate_real_hands_by_strategy(client, session_id):
    client.post("/strategies", json=strategy(session_id))
    hands = [
        ("#00000001", {"net": 6.0, "potWon": 12.0, "agent": {"strategy": "s1a2b3c4d"}}),
        ("#00000002", {"net": -3.0, "potWon": 0, "agent": {"strategy": "s1a2b3c4d"}, "mode": "real"}),
        ("#00000003", {"net": 9.0, "potWon": 18.0, "agent": {"strategy": "s1a2b3c4d"}, "mode": "practice"}),
        ("#00000004", {"net": 2.0, "potWon": 4.0, "agent": {"params": {}}}),
    ]
    for id, record in hands:
        client.post(f"/sessions/{session_id}/hands", json={"id": id, "record": record})
    assert client.get("/strategies/stats").json() == {
        "stats": [{"strategy_id": "s1a2b3c4d", "hands": 2, "stake": 9.0, "net": 3.0, "wins": 1}]
    }


def test_events_round_trip_newest_first_with_limit_and_since(client, session_id):
    client.post("/strategies", json=strategy(session_id))
    ids = [
        client.post(
            "/market/events", json={"strategy_id": "s1a2b3c4d", "kind": k, "account": "bob.testnet"}
        ).json()["id"]
        for k in ["list", "sale", "use"]
    ]
    client.post("/market/events", json={"kind": "npc", "account": "npc", "reason": "hi", "chat_id": "c1"})
    events = client.get("/market/events", params={"strategy_id": "s1a2b3c4d"}).json()["events"]
    assert [e["kind"] for e in events] == ["use", "sale", "list"]
    assert [e["kind"] for e in client.get("/market/events", params={"limit": 1}).json()["events"]] == ["npc"]
    newer = client.get("/market/events", params={"since": ids[1]}).json()["events"]
    assert [e["kind"] for e in newer] == ["npc", "use"]
    assert client.get("/market/events", params={"limit": 201}).status_code == 422
    bad = {"kind": "rug", "account": "x"}
    assert client.post("/market/events", json=bad).status_code == 422
    assert (
        client.post("/market/events", json={"strategy_id": "zz", "kind": "use", "account": "x"}).status_code
        == 404
    )


def test_prune_drops_only_old_price_rows(client, session_id, db_factory):
    client.post("/strategies", json=strategy(session_id))
    for kind in ["price", "price", "sale"]:
        client.post(
            "/market/events",
            json={"strategy_id": "s1a2b3c4d", "kind": kind, "account": "x", "price_yocto": "10"},
        )
    with db_factory() as db:
        old = now() - timedelta(days=8)
        db.execute(update(MarketEvent).where(MarketEvent.id.in_([1, 3])).values(created_at=old))
        db.commit()
    assert client.post("/market/prune").json() == {"deleted": 1}
    assert [e["kind"] for e in client.get("/market/events").json()["events"]] == ["sale", "price"]


def test_agent_strategy_set_and_cleared(client, session_id):
    url = f"/sessions/{session_id}/agent"
    client.put(url, json={"account_id": "agent.testnet", "private_key": KEY, "strategy_id": "s1a2b3c4d"})
    assert client.get(url).json()["strategy_id"] == "s1a2b3c4d"
    client.put(url, json={"account_id": "agent.testnet", "private_key": KEY})
    assert client.get(url).json() == {"account_id": "agent.testnet", "private_key": KEY, "strategy_id": None}
