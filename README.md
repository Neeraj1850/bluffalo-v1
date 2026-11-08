# 🃏 NEAR Poker Agent

> AI poker agent with real stakes. Configure your strategy, test in sandbox, deploy live. Provably fair — dealt and decided inside a TEE.

Built for [NEAR HACKATHON](https://nearhackathon.com) (Nov 1–14, 2026).

## What is this?

A platform where you configure an AI poker agent's strategy — aggression, bluff frequency, position play, bankroll limits — test it with fake chips in a sandbox, then deploy it live against an AI house agent with real NEAR.

Every card deal and agent decision runs inside a [NEAR AI Cloud](https://docs.near.ai) Trusted Execution Environment (TEE). Nobody can see the cards or reverse-engineer the strategy. The attestation proves the game was fair.

Buy in from any chain (ETH, SOL, ARB, etc.) via [NEAR Intents](https://docs.near-intents.org). Cash out winnings back to wherever you came from.

> **Status:** the full frontend flow is built. Auth, deals, fees, verification and cash-out run against a mock backend (`frontend/src/services/agentApi.ts`) until the NEAR / TEE / Intents services are wired.

## Try it — do X, see Y

Run the app (see [Local development](#local-development)), then:

### 1. Connect
- **Do**: Open `http://localhost:3000`. Connect with email or wallet.
- **See**: You land in the Lobby. No seed phrase.

### 2. Pick a table
- **Do**: In the Lobby, pick a table ("the kitchen" → "the vault").
- **See**: Blinds, buy-in range and experience level per table; your balance chip at the top.

### 3. Build a strategy
- **Do**: Go to Strategy. Pick a personality preset, then fine-tune aggression, bluff frequency, bet sizing and position awareness.
- **See**: Sliders update. Safety limits show stop loss, take profit and max hands — the agent stops itself when one is hit.

### 4. Test in sandbox
- **Do**: Start practice mode.
- **See**: "Practice — no real money" badge (dashed = practice). Live win rate and P&L, plus a decision feed — "what your agent did · newest first".

### 5. Deploy live
- **Do**: Go to Deploy and review the summary.
- **See**: Fee quote, "Real money at risk" confirmation. Nothing is sent until you confirm; on failure, settings are kept and no funds move.

### 6. Watch the game
- **Do**: Open Live.
- **See**: Cards deal with spring animation. Opponent's cards face-down, "your agent is thinking", community cards flip on flop/turn/river.

### 7. Review history
- **Do**: Open History.
- **See**: Each hand with hole cards, result and signed P&L (`+6.0` / `−3.0`); tap to replay.

### 8. Cash out
- **Do**: On Results, open the TEE attestation, then cash out.
- **See**: "Fair-play verified", then pick a destination chain. Quote → submitted → confirmed, never success before it resolves.

Unhappy paths with the mock: `/deploy?fail=quote`, `/deploy?fail=deploy`, `/results?verify=pending`, `/results?verify=unavailable`, `/results?fail=cashout`.

## NEAR Technologies Used

| Technology | What it does here |
|---|---|
| **NEAR AI Cloud (TEE)** | Card dealing + agent strategy run in Intel TDX enclaves. Attestation proves fairness. |
| **NEAR Intents** | Cross-chain buy-in and cashout via 1Click API. Play with ETH, settle on NEAR. |
| **Function Call Keys** | Agent sub-account can only call `place_bet`, `fold`, `call`, `raise` — nothing else. |
| **Sub-accounts** | Each agent gets `agent-XXX.poker.near` — sandboxed wallet. |
| **Meta Transactions** | Gasless UX — players don't need NEAR for gas. |

## Architecture

```
┌─────────────────────────────────────┐
│  Next.js Frontend (Privy Auth)      │
│  Strategy Builder · Sandbox · Watch │
└────────────┬────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌──────────┐   ┌──────────────────┐
│ NEAR     │   │ NEAR AI Cloud    │
│ Intents  │   │ (TEE)            │
│ 1Click   │   │ Card dealing     │
│ API      │   │ Agent decisions  │
└──────────┘   │ Attestation      │
               └────────┬─────────┘
                        │
                        ▼
               ┌────────────────┐
               │ Poker Contract │
               │ (poker.near)   │
               │ Escrow · State │
               │ Verify proofs  │
               └────────────────┘
```

## Stack

- Next.js 15 (App Router, TypeScript) — in [`frontend/`](frontend), see [`frontend/README.md`](frontend/README.md)
- Tailwind CSS v4 (monochrome — black/white only)
- Framer Motion 12 (spring physics animations)
- Privy (email/social/wallet auth) — planned
- NEAR AI Cloud (OpenAI-compatible TEE inference) — planned
- NEAR Intents 1Click API (cross-chain swaps) — planned
- near-sdk-rs (Rust smart contract) — planned

## Tracks

- 🎮 Games With Real Economies
- 🤖 Agent Economy
- 🔒 Privacy & Private AI
- 🛡️ AI Security & Defense

## Local development

Requires Node.js 20+.

```bash
git clone https://github.com/Neeraj1850/near-poker-agent.git
cd near-poker-agent/frontend
npm install
cp .env.example .env.local   # add GROQ_API_KEY
createdb near_poker          # local Postgres (sessions, deals, hands)
npm run db:setup
npm run dev   # http://localhost:3000
```

Agent decisions use [Groq](https://console.groq.com) (free tier). Put `GROQ_API_KEY=...` in
`frontend/.env.local`; without it the agents fall back to a built-in heuristic.

## Contributing

- Every feature and every bug fix ships with a test (`frontend/src/tests/`, mirroring `src/` paths, vitest).
- `make check` (lint + typecheck + tests) must pass before every commit. Enable the hook once:
  `git config core.hooksPath .githooks` — it runs `make check` and blocks the commit on failure.

## Branches

- `main` — releases only.
- `dev` — integration branch; **the latest frontend lives here**.
- Every change starts as a GitHub issue (`feat:`, `fix:`, `chore:` …) and gets its own
  branch named `<issue-number>-<short-name>` (e.g. `7-connect-screen`), merged into `dev`.

## License

MIT
