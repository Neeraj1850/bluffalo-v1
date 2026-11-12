"""pending hands and autoplay

Revision ID: c8e1f4a2b6d9
Revises: 5a7d3e9c1b20
Create Date: 2026-11-12 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8e1f4a2b6d9"
down_revision: str | Sequence[str] | None = "5a7d3e9c1b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("sessions", sa.Column("autoplay", JSON, nullable=True))
    op.add_column(
        "sessions", sa.Column("autoplay_on", sa.Boolean(), server_default=sa.false(), nullable=False)
    )
    op.create_table(
        "pending_hands",
        sa.Column("hand_id", sa.String(length=8), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("agent", sa.String(length=64), nullable=False),
        sa.Column("player_commitment", sa.String(length=64), nullable=False),
        sa.Column("commit_tx", sa.String(length=64), nullable=False),
        sa.Column("data", JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revealed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["hand_id"], ["deals.hand_id"], ondelete="CASCADE", name="pending_hands_hand_id_fkey"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], ondelete="CASCADE", name="pending_hands_session_id_fkey"
        ),
        sa.PrimaryKeyConstraint("hand_id", name="pending_hands_pkey"),
    )
    op.create_index(
        "pending_hands_one_per_agent",
        "pending_hands",
        ["agent"],
        unique=True,
        postgresql_where=sa.text("revealed_at IS NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("pending_hands_one_per_agent", table_name="pending_hands")
    op.drop_table("pending_hands")
    op.drop_column("sessions", "autoplay_on")
    op.drop_column("sessions", "autoplay")
