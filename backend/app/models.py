"""Tables. Portable types (Postgres in production, SQLite in tests); JSON becomes JSONB on Postgres."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Uuid
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
