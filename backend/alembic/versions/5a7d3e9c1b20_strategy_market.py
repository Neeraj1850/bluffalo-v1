"""strategy market

Revision ID: 5a7d3e9c1b20
Revises: b4d8e2f6a1c3
Create Date: 2026-11-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5a7d3e9c1b20"
down_revision: str | Sequence[str] | None = "b4d8e2f6a1c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("sessions", sa.Column("agent_strategy", sa.String(length=16), nullable=True))
    op.create_table(
        "strategies",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("creator_session_id", sa.Uuid(), nullable=False),
        sa.Column("creator_account", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=48), nullable=False),
        sa.Column(
            "params",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("salt", sa.String(length=32), nullable=False),
        sa.Column("params_hash", sa.String(length=64), nullable=False),
        sa.Column("contract_id", sa.String(length=64), nullable=False),
        sa.Column("mint_tx", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["creator_session_id"],
            ["sessions.id"],
            name="strategies_creator_session_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="strategies_pkey"),
        sa.UniqueConstraint("name", name="strategies_name_key"),
    )
    op.create_table(
        "market_events",
        sa.Column(
            "id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), autoincrement=True, nullable=False
        ),
        sa.Column("strategy_id", sa.String(length=16), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("account", sa.String(length=64), nullable=False),
        sa.Column("counterparty", sa.String(length=64), nullable=True),
        sa.Column("price_yocto", sa.String(length=40), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("chat_id", sa.String(length=80), nullable=True),
        sa.Column("tx", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["strategy_id"], ["strategies.id"], name="market_events_strategy_id_fkey", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="market_events_pkey"),
    )
    op.create_index("market_events_strategy_created", "market_events", ["strategy_id", "created_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("market_events_strategy_created", table_name="market_events")
    op.drop_table("market_events")
    op.drop_table("strategies")
    op.drop_column("sessions", "agent_strategy")
