-- Idempotent: safe to run on every setup.

-- One row per browser (httpOnly cookie). `state` is the player's setup:
-- table, strategy, limits, balance, agent status.
create table if not exists sessions (
  id uuid primary key,
  state jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Commit-reveal: the seed stays here until its hand is played, once, by the session that dealt it.
create table if not exists deals (
  hand_id text primary key,
  session_id uuid not null references sessions (id) on delete cascade,
  seed text not null,
  commitment text not null,
  created_at timestamptz not null default now(),
  played_at timestamptz
);

-- Real-money hands, with their deal proof inside `record`.
create table if not exists hands (
  id text primary key,
  session_id uuid not null references sessions (id) on delete cascade,
  record jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists hands_session_created on hands (session_id, created_at desc);
