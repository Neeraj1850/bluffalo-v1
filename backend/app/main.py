"""Storage API for the web app. Not public: every route needs the shared bearer token."""

import hmac
import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Float, case, delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .db import get_db
from .models import Deal, Hand, LiveHand, MarketEvent, PendingHand, Session, Strategy, now

DEAL_TTL = timedelta(minutes=10)
MAX_STATE_BYTES = 16_000
HANDS_LIMIT = 50
HANDS_MAX = 500
STALE_LIMIT = 100
EVENTS_LIMIT = 50
EVENTS_MAX = 200
PRICE_TTL = timedelta(days=7)
StrategyId = Annotated[str, Path(pattern=r"^[a-z0-9]{1,16}$")]
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
    strategy_id: str | None = Field(default=None, pattern=r"^[a-z0-9]{1,16}$")


class StrategyIn(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9]{1,16}$")
    creator_session_id: uuid.UUID
    creator_account: str = Field(pattern=r"^[a-z0-9._-]{2,64}$")
    name: str = Field(min_length=1, max_length=48)
    params: dict
    salt: str = Field(pattern=r"^[0-9a-f]{32}$")
    params_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    contract_id: str = Field(pattern=r"^[a-z0-9._-]{2,64}$")
    mint_tx: str | None = Field(default=None, max_length=64)

    @field_validator("params")
    @classmethod
    def small(cls, v: dict) -> dict:
        if len(json.dumps(v)) > MAX_STATE_BYTES:
            raise ValueError("Params are too large")
        return v


class EventIn(BaseModel):
    strategy_id: str | None = Field(default=None, pattern=r"^[a-z0-9]{1,16}$")
    kind: Literal["mint", "list", "delist", "sale", "use", "price", "npc"]
    account: str = Field(min_length=1, max_length=64)
    counterparty: str | None = Field(default=None, max_length=64)
    price_yocto: str | None = Field(default=None, pattern=r"^[0-9]{1,40}$")
    amount: int | None = None
    reason: str | None = Field(default=None, max_length=2000)
    chat_id: str | None = Field(default=None, max_length=80)
    tx: str | None = Field(default=None, max_length=64)


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
    s.agent_strategy = body.strategy_id  # a new agent without a strategy clears it
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
    return {"account_id": s.agent_account, "private_key": s.agent_key, "strategy_id": s.agent_strategy}


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
    query = select(Hand.record).where(Hand.session_id == session_id)
    if mode:
        # Records from before practice hands were stored have no mode: they're real.
        query = query.where(func.coalesce(Hand.record["mode"].as_string(), "real") == mode)
    rows = db.scalars(query.order_by(Hand.created_at.desc()).limit(limit))
    return {"hands": list(rows)}


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


# Pending reveals: real-money hands committed on-chain, waiting for the player's seed.


class PendingIn(BaseModel):
    session_id: uuid.UUID
    agent: str = Field(pattern=r"^[a-z0-9._-]{2,64}$")
    player_commitment: str = Field(pattern=r"^[0-9a-f]{64}$")
    commit_tx: str = Field(min_length=1, max_length=64)
    data: dict

    @field_validator("data")
    @classmethod
    def small(cls, v: dict) -> dict:
        if len(json.dumps(v)) > MAX_STATE_BYTES:
            raise ValueError("Data is too large")
        return v


def ms(t: datetime) -> int:
    # SQLite hands back naive datetimes; they were stored as UTC.
    return int((t if t.tzinfo else t.replace(tzinfo=UTC)).timestamp() * 1000)


def pending_out(p: PendingHand, deal: Deal) -> dict:
    return {
        "hand_id": p.hand_id,
        "session_id": str(p.session_id),
        "agent": p.agent,
        "player_commitment": p.player_commitment,
        "commit_tx": p.commit_tx,
        "data": p.data,
        "created_at": ms(p.created_at),
        "seed": deal.seed,
        "commitment": deal.commitment,
    }


def unrevealed(db: DbSession, *where) -> dict | None:
    row = db.execute(
        select(PendingHand, Deal)
        .join(Deal, Deal.hand_id == PendingHand.hand_id)
        .where(PendingHand.revealed_at.is_(None), *where)
    ).first()
    return pending_out(*row) if row else None


@app.put("/pending/{hand_id}", status_code=201, dependencies=Auth)
def put_pending(hand_id: HandId, body: PendingIn, db: Db) -> dict:
    """Record a committed hand. 409 if the hand exists or the agent already has one unrevealed."""
    session_or_404(db, body.session_id)
    if not db.get(Deal, hand_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown deal")
    db.add(PendingHand(hand_id=hand_id, **body.model_dump()))
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Agent already has a hand awaiting reveal") from None
    return {"ok": True}


@app.get("/pending/{hand_id}", dependencies=Auth)
def get_pending(hand_id: HandId, db: Db) -> dict:
    p = unrevealed(db, PendingHand.hand_id == hand_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown or already revealed hand")
    return p


@app.get("/pending", dependencies=Auth)
def agent_pending(agent: Annotated[str, Query(pattern=r"^[a-z0-9._-]{2,64}$")], db: Db) -> dict:
    """The agent's unrevealed hand, or null."""
    return {"hand": unrevealed(db, PendingHand.agent == agent)}


@app.post("/pending/{hand_id}/reveal", dependencies=Auth)
def reveal_pending(hand_id: HandId, db: Db) -> dict:
    """Mark revealed (or closed by timeout) exactly once; unblocks the agent."""
    n = db.execute(
        update(PendingHand)
        .where(PendingHand.hand_id == hand_id, PendingHand.revealed_at.is_(None))
        .values(revealed_at=now())
    ).rowcount
    db.commit()
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown or already revealed hand")
    return {"ok": True}


# Server-side autoplay: config + progress per session, and the on flag a restart resumes from.


class AutoplayIn(BaseModel):
    on: bool | None = None  # None: progress update only, leave the flag as is
    autoplay: dict | None = None

    @field_validator("autoplay")
    @classmethod
    def small(cls, v: dict | None) -> dict | None:
        if v is not None and len(json.dumps(v)) > MAX_STATE_BYTES:
            raise ValueError("Autoplay is too large")
        return v


@app.put("/sessions/{session_id}/autoplay", dependencies=Auth)
def set_autoplay(session_id: uuid.UUID, body: AutoplayIn, db: Db) -> dict:
    s = session_or_404(db, session_id)
    if body.on is not None:
        s.autoplay_on = body.on
    if body.autoplay is not None:
        s.autoplay = body.autoplay
    db.commit()
    return {"ok": True}


@app.get("/sessions/{session_id}/autoplay", dependencies=Auth)
def get_autoplay(session_id: uuid.UUID, db: Db) -> dict:
    s = session_or_404(db, session_id)
    return {"on": s.autoplay_on, "autoplay": s.autoplay}


@app.get("/autoplay", dependencies=Auth)
def autoplay_sessions(db: Db) -> dict:
    """Sessions whose autoplay should be running (resumed after a restart)."""
    return {"sessions": [str(i) for i in db.scalars(select(Session.id).where(Session.autoplay_on))]}


# Strategy market. Params and salt are secret: only /strategies/{id}/params returns them.

PUBLIC = (
    Strategy.id,
    Strategy.creator_account,
    Strategy.name,
    Strategy.params_hash,
    Strategy.contract_id,
    Strategy.mint_tx,
    Strategy.created_at,
)


@app.post("/strategies", status_code=201, dependencies=Auth)
def create_strategy(body: StrategyIn, db: Db) -> dict:
    session_or_404(db, body.creator_session_id)
    db.add(Strategy(**body.model_dump()))
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Strategy id or name already taken") from None
    return {"ok": True}


@app.get("/strategies", dependencies=Auth)
def list_strategies(db: Db) -> dict:
    rows = db.execute(select(*PUBLIC).order_by(Strategy.created_at.desc()))
    return {"strategies": [dict(r._mapping) for r in rows]}


@app.get("/strategies/stats", dependencies=Auth)
def strategy_stats(db: Db) -> dict:
    """Per strategy, over real-money hands: count, chips staked, net, wins. Stake = what the
    agent committed = potWon − net (the record has no separate stake field)."""
    # ponytail: JSON-path aggregate over every hand, add an indexed column if hands grows
    sid = Hand.record[("agent", "strategy")].as_string()
    net = Hand.record["net"].as_float()
    stake = Hand.record["potWon"].as_float() - net
    rows = db.execute(
        select(
            sid.label("strategy_id"),
            func.count().label("hands"),
            func.coalesce(func.sum(stake), 0).cast(Float).label("stake"),
            func.coalesce(func.sum(net), 0).cast(Float).label("net"),
            func.sum(case((net > 0, 1), else_=0)).label("wins"),
        )
        .where(sid.is_not(None), func.coalesce(Hand.record["mode"].as_string(), "real") == "real")
        .group_by(sid)
    )
    return {"stats": [dict(r._mapping) for r in rows]}


@app.get("/strategies/{strategy_id}/hands", dependencies=Auth)
def strategy_hands(strategy_id: StrategyId, db: Db) -> dict:
    """The newest 50 real-money hand records played under a strategy (for its verified record)."""
    sid = Hand.record[("agent", "strategy")].as_string()
    rows = db.scalars(
        select(Hand.record)
        .where(sid == strategy_id, func.coalesce(Hand.record["mode"].as_string(), "real") == "real")
        .order_by(Hand.created_at.desc())
        .limit(50)
    )
    return {"hands": list(rows)}


@app.get("/strategies/{strategy_id}/params", dependencies=Auth)
def strategy_params(strategy_id: StrategyId, db: Db) -> dict:
    s = db.get(Strategy, strategy_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown strategy")
    return {"params": s.params, "salt": s.salt, "params_hash": s.params_hash}


@app.post("/market/events", status_code=201, dependencies=Auth)
def add_event(body: EventIn, db: Db) -> dict:
    if body.strategy_id and not db.get(Strategy, body.strategy_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown strategy")
    e = MarketEvent(**body.model_dump())
    db.add(e)
    db.commit()
    return {"id": e.id}


@app.get("/market/events", dependencies=Auth)
def list_events(
    db: Db,
    strategy_id: Annotated[str | None, Query(pattern=r"^[a-z0-9]{1,16}$")] = None,
    since: Annotated[int | None, Query(ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=EVENTS_MAX)] = EVENTS_LIMIT,
) -> dict:
    """Newest first. `since` is an event id: only events after it (for polling)."""
    query = select(MarketEvent)
    if strategy_id:
        query = query.where(MarketEvent.strategy_id == strategy_id)
    if since is not None:
        query = query.where(MarketEvent.id > since)
    rows = db.scalars(query.order_by(MarketEvent.id.desc()).limit(limit))
    cols = [c.key for c in MarketEvent.__table__.columns]
    return {"events": [{k: getattr(e, k) for k in cols} for e in rows]}


def prune_prices(db: DbSession) -> int:
    """Drop price ticks older than a week; the rest of the feed is kept."""
    n = db.execute(
        delete(MarketEvent).where(MarketEvent.kind == "price", MarketEvent.created_at < now() - PRICE_TTL)
    ).rowcount
    db.commit()
    return n


@app.post("/market/prune", dependencies=Auth)
def prune(db: Db) -> dict:
    return {"deleted": prune_prices(db)}
