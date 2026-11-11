"""Storage API for the web app. Not public: every route needs the shared bearer token."""

import hmac
import json
import os
import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DbSession

from .db import get_db
from .models import Deal, Hand, LiveHand, Session, now

DEAL_TTL = timedelta(minutes=10)
MAX_STATE_BYTES = 16_000
HANDS_LIMIT = 50
HANDS_SCAN = 1000
HANDS_MAX = 500
STALE_LIMIT = 100
HandId = Annotated[str, Path(pattern=r"^[0-9a-f]{8}$")]


def require_token(authorization: Annotated[str, Header()] = "") -> None:
    token = os.environ.get("BACKEND_TOKEN", "")
    # No token configured means nobody gets in, rather than everybody.
    if not token or not hmac.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unauthorized")


app = FastAPI(title="NEAR Poker storage")
Db = Annotated[DbSession, Depends(get_db)]
Auth = [Depends(require_token)]


def session_or_404(db: DbSession, session_id: uuid.UUID) -> Session:
    s = db.get(Session, session_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown session")
    return s


class StateIn(BaseModel):
    state: dict

    @field_validator("state")
    @classmethod
    def small(cls, v: dict) -> dict:
        if len(json.dumps(v)) > MAX_STATE_BYTES:
            raise ValueError("State is too large")
        return v


class DealIn(BaseModel):
    hand_id: str = Field(pattern=r"^[0-9a-f]{8}$")
    seed: str = Field(pattern=r"^[0-9a-f]{32}$")
    commitment: str = Field(pattern=r"^[0-9a-f]{64}$")


class LinkIn(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)


class AgentIn(BaseModel):
    account_id: str = Field(pattern=r"^[a-z0-9._-]{2,64}$")
    private_key: str | None = Field(default=None, pattern=r"^ed25519:[1-9A-HJ-NP-Za-km-z]{32,100}$")
    mcp_token: str | None = Field(default=None, pattern=r"^[0-9a-f]{32,64}$")


class WalletIn(BaseModel):
    account_id: str = Field(pattern=r"^[a-z0-9._-]{2,64}$")
    private_key: str = Field(pattern=r"^ed25519:[1-9A-HJ-NP-Za-km-z]{32,100}$")


class HandIn(BaseModel):
    id: str = Field(pattern=r"^#[0-9a-f]{8}$")
    record: dict


class LiveHandIn(BaseModel):
    session_id: uuid.UUID
    status: str = Field(pattern=r"^(active|settled|cancelled)$")
    to_act: int = Field(ge=0, le=1)
    updated_at: int = Field(ge=0)
    data: dict


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/sessions", status_code=201, dependencies=Auth)
def create_session(db: Db) -> dict:
    s = Session(state={})
    db.add(s)
    db.commit()
    return {"id": str(s.id)}


@app.get("/sessions/{session_id}", dependencies=Auth)
def get_session(session_id: uuid.UUID, db: Db) -> dict:
    return {"state": session_or_404(db, session_id).state}


@app.put("/sessions/{session_id}", dependencies=Auth)
def save_session(session_id: uuid.UUID, body: StateIn, db: Db) -> dict:
    s = session_or_404(db, session_id)
    s.state = body.state
    db.commit()
    return {"ok": True}


@app.post("/sessions/{session_id}/user", dependencies=Auth)
def link_user(session_id: uuid.UUID, body: LinkIn, db: Db) -> dict:
    """Tie this browser's session to a signed-in user. If the user already has a
    session (another device, an earlier visit), that one wins and is returned."""
    current = session_or_404(db, session_id)
    existing = db.scalar(select(Session).where(Session.user_id == body.user_id))
    if existing:
        return {"id": str(existing.id), "state": existing.state}
    current.user_id = body.user_id
    db.commit()
    return {"id": str(current.id), "state": current.state}


@app.get("/sessions/{session_id}/user", dependencies=Auth)
def get_user(session_id: uuid.UUID, db: Db) -> dict:
    return {"user_id": session_or_404(db, session_id).user_id}


@app.put("/sessions/{session_id}/agent", dependencies=Auth)
def set_agent(session_id: uuid.UUID, body: AgentIn, db: Db) -> dict:
    s = session_or_404(db, session_id)
    s.agent_account, s.agent_key = body.account_id, body.private_key
    if body.mcp_token is not None:
        s.mcp_token = body.mcp_token
    db.commit()
    return {"ok": True}


@app.get("/sessions/by-token/{token}", dependencies=Auth)
def session_by_token(token: Annotated[str, Path(pattern=r"^[0-9a-f]{32,64}$")], db: Db) -> dict:
    """Resolve an agent's MCP token to its session (for the MCP server's auth)."""
    s = db.scalar(select(Session).where(Session.mcp_token == token))
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown token")
    return {"id": str(s.id), "user_id": s.user_id, "agent_account": s.agent_account, "agent_key": s.agent_key}


@app.get("/sessions/{session_id}/agent", dependencies=Auth)
def get_agent(session_id: uuid.UUID, db: Db) -> dict:
    s = session_or_404(db, session_id)
    return {"account_id": s.agent_account, "private_key": s.agent_key}


@app.put("/sessions/{session_id}/wallet", dependencies=Auth)
def set_wallet(session_id: uuid.UUID, body: WalletIn, db: Db) -> dict:
    s = session_or_404(db, session_id)
    s.wallet_account, s.wallet_key = body.account_id, body.private_key
    db.commit()
    return {"ok": True}


@app.get("/sessions/{session_id}/wallet", dependencies=Auth)
def get_wallet(session_id: uuid.UUID, db: Db) -> dict:
    s = session_or_404(db, session_id)
    return {"account_id": s.wallet_account, "private_key": s.wallet_key}


@app.post("/sessions/{session_id}/deals", status_code=201, dependencies=Auth)
def store_deal(session_id: uuid.UUID, body: DealIn, db: Db) -> dict:
    session_or_404(db, session_id)
    db.add(Deal(session_id=session_id, **body.model_dump()))
    db.commit()
    return {"ok": True}


@app.post("/sessions/{session_id}/deals/{hand_id}/claim", dependencies=Auth)
def claim_deal(session_id: uuid.UUID, hand_id: str, db: Db) -> dict:
    """Hand the seed over once, only to the session that dealt it, before it expires."""
    stamp = now()
    row = db.execute(
        update(Deal)
        .where(
            Deal.hand_id == hand_id,
            Deal.session_id == session_id,
            Deal.played_at.is_(None),
            Deal.created_at > stamp - DEAL_TTL,
        )
        .values(played_at=stamp)
        .returning(Deal.seed, Deal.commitment)
    ).first()
    db.commit()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown, expired or already played hand")
    return {"seed": row.seed, "commitment": row.commitment}


@app.post("/sessions/{session_id}/hands", status_code=201, dependencies=Auth)
def record_hand(session_id: uuid.UUID, body: HandIn, db: Db) -> dict:
    session_or_404(db, session_id)
    if not db.get(Hand, body.id):
        db.add(Hand(id=body.id, session_id=session_id, record=body.record))
        db.commit()
    return {"ok": True}


@app.get("/sessions/{session_id}/hands", dependencies=Auth)
def list_hands(
    session_id: uuid.UUID,
    db: Db,
    mode: Annotated[str | None, Query(pattern="^(real|practice)$")] = None,
    limit: Annotated[int, Query(ge=1, le=HANDS_MAX)] = HANDS_LIMIT,
) -> dict:
    # ponytail: filters the mode in Python over the newest HANDS_SCAN rows (records
    # are JSON). Add a mode column + index if sessions grow past that.
    rows = db.scalars(
        select(Hand.record)
        .where(Hand.session_id == session_id)
        .order_by(Hand.created_at.desc())
        .limit(HANDS_SCAN if mode else limit)
    )
    # Records from before practice hands were stored have no mode: they're real.
    hands = [r for r in rows if mode is None or (r.get("mode") or "real") == mode]
    return {"hands": hands[:limit]}


# Live hands are addressed by hand_id alone: the turn machine looks them up that way, and the
# timeout sweep is global, not per-session.


@app.get("/live", dependencies=Auth)
def stale_live_hands(cutoff: int, db: Db) -> dict:
    """Active hands still waiting on the external agent since before `cutoff` (ms epoch)."""
    rows = db.scalars(
        select(LiveHand.data)
        .where(LiveHand.status == "active", LiveHand.to_act == 0, LiveHand.updated_at < cutoff)
        .order_by(LiveHand.updated_at)
        .limit(STALE_LIMIT)
    )
    return {"hands": list(rows)}


@app.put("/live/{hand_id}", dependencies=Auth)
def save_live_hand(hand_id: HandId, body: LiveHandIn, db: Db) -> dict:
    session_or_404(db, body.session_id)
    row = db.get(LiveHand, hand_id)
    fields = body.model_dump()
    if row:
        for k, v in fields.items():
            setattr(row, k, v)
    else:
        db.add(LiveHand(hand_id=hand_id, **fields))
    db.commit()
    return {"ok": True}


@app.get("/live/{hand_id}", dependencies=Auth)
def get_live_hand(hand_id: HandId, db: Db) -> dict:
    row = db.get(LiveHand, hand_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown live hand")
    return {"data": row.data}
