"""session wallet (also merges the agent-key and mcp-token heads)

Revision ID: b4d8e2f6a1c3
Revises: 0b1d56f9a240, 7c2e5b1a9f03
Create Date: 2026-11-05 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4d8e2f6a1c3"
down_revision: str | Sequence[str] | None = ("0b1d56f9a240", "7c2e5b1a9f03")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("sessions", sa.Column("wallet_account", sa.String(length=64), nullable=True))
    op.add_column("sessions", sa.Column("wallet_key", sa.String(length=128), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("sessions", "wallet_key")
    op.drop_column("sessions", "wallet_account")
