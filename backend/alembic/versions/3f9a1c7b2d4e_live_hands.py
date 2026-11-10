"""live hands

Revision ID: 3f9a1c7b2d4e
Revises: 9cc5602b0aa9
Create Date: 2026-10-28 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3f9a1c7b2d4e"
down_revision: str | Sequence[str] | None = "9cc5602b0aa9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "live_hands",
        sa.Column("hand_id", sa.String(length=8), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("to_act", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.Column(
            "data",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("hand_id"),
    )
    op.create_index("live_hands_sweep", "live_hands", ["status", "to_act", "updated_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("live_hands_sweep", table_name="live_hands")
    op.drop_table("live_hands")
