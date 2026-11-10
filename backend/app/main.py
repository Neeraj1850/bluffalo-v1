"""Storage API for the web app. Not public: every route needs the shared bearer token."""

import hmac
import json
import os
import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DbSession

from .db import get_db
from .models import Deal, Hand, Session, now

DEAL_TTL = timedelta(minutes=10)
MAX_STATE_BYTES = 16_000
HANDS_LIMIT = 50


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


class HandIn(BaseModel):
    id: str = Field(pattern=r"^#[0-9a-f]{8}$")
    record: dict


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
    session_or_404(db, session_id).agent_account = body.account_id
    db.commit()
    return {"ok": True}


@app.get("/sessions/{session_id}/agent", dependencies=Auth)
def get_agent(session_id: uuid.UUID, db: Db) -> dict:
    return {"account_id": session_or_404(db, session_id).agent_account}


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
def list_hands(session_id: uuid.UUID, db: Db) -> dict:
    rows = db.scalars(
        select(Hand.record)
        .where(Hand.session_id == session_id)
        .order_by(Hand.created_at.desc())
        .limit(HANDS_LIMIT)
    )
    return {"hands": list(rows)}
