"""session mcp token

Revision ID: 7c2e5b1a9f03
Revises: 3f9a1c7b2d4e
Create Date: 2026-10-28 00:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c2e5b1a9f03"
down_revision: str | Sequence[str] | None = "3f9a1c7b2d4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("sessions", sa.Column("mcp_token", sa.String(length=64), nullable=True))
    op.create_unique_constraint("sessions_mcp_token_key", "sessions", ["mcp_token"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("sessions_mcp_token_key", "sessions", type_="unique")
    op.drop_column("sessions", "mcp_token")
