"""Tables. Portable types (Postgres in production, SQLite in tests); JSON becomes JSONB on Postgres."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

Json = JSON().with_variant(JSONB(), "postgresql")


def now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Session(Base):
    """One per browser (httpOnly cookie), or per signed-in user. `state` is the player's setup."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Privy user (did:privy:…) once signed in; one session per user so data follows them across devices.
    user_id: Mapped[str | None] = mapped_column(String(128), unique=True)
    # The agent's NEAR account, set by the server at deploy — never by the browser.
    agent_account: Mapped[str | None] = mapped_column(String(64))
    # The agent's only key: a function-call key limited to the poker contract's withdraw_to.
    # Read by the web server for cash-outs; never sent to a browser.
    agent_key: Mapped[str | None] = mapped_column(String(128))
    # The player's custodial deposit wallet (implicit testnet account) and its full-access key.
    # Server-side only; never sent to a browser.
    wallet_account: Mapped[str | None] = mapped_column(String(64))
    wallet_key: Mapped[str | None] = mapped_column(String(128))
    # Opaque bearer token an external agent presents to the MCP server; resolves back to this session.
    mcp_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    # The market strategy (token id) the deployed agent plays, if any.
    agent_strategy: Mapped[str | None] = mapped_column(String(16))
    state: Mapped[dict] = mapped_column(Json, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Deal(Base):
    """Commit-reveal: the seed stays here until its hand is played, once, by the session that dealt it."""

    __tablename__ = "deals"

    hand_id: Mapped[str] = mapped_column(String(8), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    seed: Mapped[str] = mapped_column(String(32))
    commitment: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Hand(Base):
    """A real-money hand, with its deal proof inside `record`."""

    __tablename__ = "hands"
    __table_args__ = (Index("hands_session_created", "session_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    record: Mapped[dict] = mapped_column(Json)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class LiveHand(Base):
    """A hand in progress, driven turn by turn by an external agent over MCP. The whole
    turn-machine record lives in `data`; `status`/`to_act`/`updated_at` are pulled out so the
    timeout sweep can find hands stuck waiting on the agent (status=active, to_act=0, old)."""

    __tablename__ = "live_hands"
    __table_args__ = (Index("live_hands_sweep", "status", "to_act", "updated_at"),)

    hand_id: Mapped[str] = mapped_column(String(8), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16))
    to_act: Mapped[int] = mapped_column(Integer)
    # Milliseconds since the epoch, to match the machine's JS record exactly.
    updated_at: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[dict] = mapped_column(Json)


class Strategy(Base):
    """A minted market strategy. `params` and `salt` are secret: only the params hash is public."""

    __tablename__ = "strategies"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # contract token id
    creator_session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    creator_account: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(48), unique=True)
    params: Mapped[dict] = mapped_column(Json)
    salt: Mapped[str] = mapped_column(String(32))
    params_hash: Mapped[str] = mapped_column(String(64))
    contract_id: Mapped[str] = mapped_column(String(64))
    mint_tx: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MarketEvent(Base):
    """Market activity feed: mints, listings, sales, uses, price ticks, NPC chatter."""

    __tablename__ = "market_events"
    __table_args__ = (Index("market_events_strategy_created", "strategy_id", "created_at"),)

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    strategy_id: Mapped[str | None] = mapped_column(ForeignKey("strategies.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16))
    account: Mapped[str] = mapped_column(String(64))
    counterparty: Mapped[str | None] = mapped_column(String(64))
    price_yocto: Mapped[str | None] = mapped_column(String(40))
    amount: Mapped[int | None] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(Text)
    chat_id: Mapped[str | None] = mapped_column(String(80))
    tx: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
