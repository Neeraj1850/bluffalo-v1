from datetime import timedelta

import pytest
from sqlalchemy import update

from app.models import Deal, now

SEED = "00112233445566778899aabbccddeeff"
COMMIT = "5947d7c33d783f94b3b4c1a96ebc8991ed28f1b069b71e03376cba8caa98a720"
DEAL = {"hand_id": "0123abcd", "seed": SEED, "commitment": COMMIT}


def test_health_needs_no_token(client):
    assert client.get("/health", headers={"Authorization": ""}).json() == {"ok": True}


@pytest.mark.parametrize("auth", ["", "Bearer wrong", "test-token"])
def test_rejects_missing_or_wrong_token(client, auth):
    assert client.post("/sessions", headers={"Authorization": auth}).status_code == 401


def test_refuses_everyone_when_no_token_is_configured(client, monkeypatch):
    monkeypatch.setenv("BACKEND_TOKEN", "")
    assert client.post("/sessions", headers={"Authorization": "Bearer "}).status_code == 401


class TestSessions:
    def test_new_session_starts_empty(self, client, session_id):
        assert client.get(f"/sessions/{session_id}").json() == {"state": {}}

    def test_saves_and_loads_state(self, client, session_id):
        client.put(f"/sessions/{session_id}", json={"state": {"tableId": "vault", "balance": 80}})
        assert client.get(f"/sessions/{session_id}").json() == {"state": {"tableId": "vault", "balance": 80}}

    def test_unknown_session_is_404(self, client):
        assert client.get("/sessions/00000000-0000-4000-8000-000000000000").status_code == 404

    def test_malformed_id_is_422(self, client):
        assert client.get("/sessions/not-a-uuid").status_code == 422

    @pytest.mark.parametrize("state", [[1, 2], "x", {"blob": "x" * 20_000}])
    def test_rejects_bad_state(self, client, session_id, state):
        assert client.put(f"/sessions/{session_id}", json={"state": state}).status_code == 422


class TestDeals:
    def test_reveals_the_seed_once(self, client, session_id):
        assert client.post(f"/sessions/{session_id}/deals", json=DEAL).status_code == 201
        claim = f"/sessions/{session_id}/deals/0123abcd/claim"
        assert client.post(claim).json() == {"seed": SEED, "commitment": COMMIT}
        assert client.post(claim).status_code == 404

    def test_never_reveals_to_another_session(self, client, session_id):
        other = client.post("/sessions").json()["id"]
        client.post(f"/sessions/{session_id}/deals", json=DEAL)
        assert client.post(f"/sessions/{other}/deals/0123abcd/claim").status_code == 404
        assert client.post(f"/sessions/{session_id}/deals/0123abcd/claim").status_code == 200

    def test_expires_unplayed_deals(self, client, session_id, db_factory):
        client.post(f"/sessions/{session_id}/deals", json=DEAL)
        with db_factory() as db:
            db.execute(update(Deal).values(created_at=now() - timedelta(minutes=11)))
            db.commit()
        assert client.post(f"/sessions/{session_id}/deals/0123abcd/claim").status_code == 404

    @pytest.mark.parametrize(
        "bad",
        [{"hand_id": "../x"}, {"seed": "short"}, {"commitment": "Z" * 64}],
        ids=["id", "seed", "commit"],
    )
    def test_rejects_malformed_deals(self, client, session_id, bad):
        assert client.post(f"/sessions/{session_id}/deals", json={**DEAL, **bad}).status_code == 422

    def test_needs_a_known_session(self, client):
        assert (
            client.post("/sessions/00000000-0000-4000-8000-000000000000/deals", json=DEAL).status_code == 404
        )


class TestHands:
    def test_lists_newest_first_per_session(self, client, session_id):
        other = client.post("/sessions").json()["id"]
        for n in ("#0000000a", "#0000000b"):
            client.post(f"/sessions/{session_id}/hands", json={"id": n, "record": {"id": n, "net": 1}})
        assert [h["id"] for h in client.get(f"/sessions/{session_id}/hands").json()["hands"]] == [
            "#0000000b",
            "#0000000a",
        ]
        assert client.get(f"/sessions/{other}/hands").json() == {"hands": []}

    def test_recording_twice_keeps_one(self, client, session_id):
        for _ in range(2):
            assert (
                client.post(
                    f"/sessions/{session_id}/hands", json={"id": "#0000000a", "record": {}}
                ).status_code
                == 201
            )
        assert len(client.get(f"/sessions/{session_id}/hands").json()["hands"]) == 1

    def test_rejects_malformed_ids(self, client, session_id):
        assert client.post(f"/sessions/{session_id}/hands", json={"id": "x", "record": {}}).status_code == 422


class TestUsers:
    def test_links_a_user_to_the_current_session(self, client, session_id):
        res = client.post(f"/sessions/{session_id}/user", json={"user_id": "did:privy:alice"})
        assert res.json()["id"] == session_id
        assert client.get(f"/sessions/{session_id}/user").json() == {"user_id": "did:privy:alice"}

    def test_returns_the_users_existing_session_on_another_device(self, client, session_id):
        client.put(f"/sessions/{session_id}", json={"state": {"tableId": "vault"}})
        client.post(f"/sessions/{session_id}/user", json={"user_id": "did:privy:alice"})
        laptop = client.post("/sessions").json()["id"]
        res = client.post(f"/sessions/{laptop}/user", json={"user_id": "did:privy:alice"}).json()
        assert res == {"id": session_id, "state": {"tableId": "vault"}}

    def test_anonymous_session_has_no_user(self, client, session_id):
        assert client.get(f"/sessions/{session_id}/user").json() == {"user_id": None}

    def test_rejects_an_empty_user_id(self, client, session_id):
        assert client.post(f"/sessions/{session_id}/user", json={"user_id": ""}).status_code == 422


class TestAgents:
    def test_stores_the_agent_account(self, client, session_id):
        assert client.get(f"/sessions/{session_id}/agent").json() == {"account_id": None, "private_key": None}
        client.put(f"/sessions/{session_id}/agent", json={"account_id": "a1b2c3d4.npoker-op.testnet"})
        assert client.get(f"/sessions/{session_id}/agent").json() == {
            "account_id": "a1b2c3d4.npoker-op.testnet",
            "private_key": None,
        }

    def test_stores_the_agent_key_with_the_account(self, client, session_id):
        key = "ed25519:" + "3" * 64
        client.put(f"/sessions/{session_id}/agent", json={"account_id": "a1.op.testnet", "private_key": key})
        assert client.get(f"/sessions/{session_id}/agent").json()["private_key"] == key

    def test_rejects_a_malformed_key(self, client, session_id):
        body = {"account_id": "a1.op.testnet", "private_key": "not-a-key"}
        assert client.put(f"/sessions/{session_id}/agent", json=body).status_code == 422

    @pytest.mark.parametrize("bad", ["", "UPPER.testnet", "has space", "x" * 65])
    def test_rejects_invalid_account_ids(self, client, session_id, bad):
        assert client.put(f"/sessions/{session_id}/agent", json={"account_id": bad}).status_code == 422


class TestLiveHands:
    def live(self, session_id, **over):
        body = {
            "session_id": session_id,
            "status": "active",
            "to_act": 0,
            "updated_at": 1000,
            "data": {"handId": "0123abcd", "reasons": []},
        }
        return body | over

    def test_saves_and_loads_a_live_hand(self, client, session_id):
        assert client.put("/live/0123abcd", json=self.live(session_id)).json() == {"ok": True}
        assert client.get("/live/0123abcd").json() == {"data": {"handId": "0123abcd", "reasons": []}}

    def test_put_upserts(self, client, session_id):
        client.put("/live/0123abcd", json=self.live(session_id))
        client.put(
            "/live/0123abcd",
            json=self.live(session_id, status="settled", data={"handId": "0123abcd", "net": 4}),
        )
        assert client.get("/live/0123abcd").json() == {"data": {"handId": "0123abcd", "net": 4}}

    def test_unknown_live_hand_is_404(self, client):
        assert client.get("/live/deadbeef").status_code == 404

    def test_malformed_hand_id_is_422(self, client, session_id):
        assert client.put("/live/NOTHEX12", json=self.live(session_id)).status_code == 422

    def test_put_to_unknown_session_is_404(self, client):
        body = self.live("00000000-0000-4000-8000-000000000000")
        assert client.put("/live/0123abcd", json=body).status_code == 404

    def test_stale_returns_only_old_active_hands_awaiting_the_agent(self, client, session_id):
        client.put(
            "/live/0000aaaa", json=self.live(session_id) | {"updated_at": 500}
        )  # old, active, to_act 0
        client.put("/live/0000bbbb", json=self.live(session_id) | {"updated_at": 5000})  # too recent
        client.put(
            "/live/0000cccc", json=self.live(session_id) | {"updated_at": 500, "to_act": 1}
        )  # house's turn
        client.put(
            "/live/0000dddd", json=self.live(session_id) | {"updated_at": 500, "status": "settled"}
        )  # done
        got = client.get("/live", params={"cutoff": 1000}).json()["hands"]
        assert got == [{"handId": "0123abcd", "reasons": []}]


class TestMcpToken:
    def test_stores_and_resolves_the_token(self, client, session_id):
        token = "a" * 48
        client.put(
            f"/sessions/{session_id}/agent",
            json={"account_id": "a1.op.testnet", "private_key": "ed25519:" + "3" * 64, "mcp_token": token},
        )
        got = client.get(f"/sessions/by-token/{token}").json()
        assert got["id"] == session_id
        assert got["agent_account"] == "a1.op.testnet"
        assert got["agent_key"] == "ed25519:" + "3" * 64

    def test_unknown_token_is_404(self, client):
        assert client.get("/sessions/by-token/" + "f" * 48).status_code == 404

    def test_malformed_token_is_422(self, client):
        assert client.get("/sessions/by-token/not-a-hex-token").status_code == 422
