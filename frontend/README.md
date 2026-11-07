# Near Poker Agent — frontend

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Framer Motion 12.

Built from the design canvas: https://claude.ai/artifact/4dmA5jxvT5stVhPWBMjG5L

## Run it

Requires Node.js 20 or newer.

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm start          # serve the production build
npm run lint
```

## The flow

| Route | Screen |
| --- | --- |
| `/` | Connect — email or wallet (mocked until Privy is wired) |
| `/lobby` | Pick a table |
| `/strategy` | Personality presets, fine-tune sliders, safety limits |
| `/sandbox` | Practice mode — simulated hands, free chips |
| `/deploy` | Confirm real-money deployment |
| `/game` | Watch the agent play (live or practice) |
| `/history` | Hand archive with replays |
| `/results` | Hand result, fair-play verification, cash out |

Choices (table, strategy, limits, agent status, balance) carry across screens via
`SetupProvider` and survive a refresh (sessionStorage).

Theme: dark by default; toggle on the connect screen footer, the history header, or
the desktop rail. Respects `prefers-reduced-motion`.

## Structure

```
src/
  app/                    routes; (app)/ shares the nav shell
  components/
    cards/                PlayingCard, CardFan
    connect/ lobby/ strategy/ sandbox/ deploy/ game/ history/ results/
    nav/                  BottomNav (mobile), NavRail (≥1024px), AppShell
    ui/                   Button, StatusBadge, StatBox, Sheet, Disclosure, …
  lib/
    data/                 tables, strategy presets, demo hands
    store/setup.tsx       cross-screen state
    motion.ts             springs, timings, variants
    cards.ts format.ts theme.ts
  services/agentApi.ts    the only door to the backend
```

## Backend: mock today, real later

Everything that touches money or verification goes through `src/services/agentApi.ts`:
`getFeeQuote`, `deployAgent`, `getVerification`, `getCashoutQuote`, `submitCashout`,
`getCashoutStatus`. Right now `agentApi = mockAgentApi` — realistic delays, demo values.
Implement the `AgentApi` interface against your service and swap that one export.

Game hands are scripted demo data in `src/lib/data/hands.ts` until the live hand feed exists.

Try the unhappy paths with the mock by adding a query string:

| URL | Shows |
| --- | --- |
| `/deploy?fail=quote` | fee quote unavailable — confirm stays locked |
| `/deploy?fail=deploy` | deploy rejected — settings kept, "no funds moved" |
| `/results?verify=pending` | verification still running |
| `/results?verify=unavailable` | verification couldn't be checked |
| `/results?fail=cashout` | cash-out submission fails |

## Design rules worth keeping

- Monochrome only. Meaning comes from shape: dashed = practice/provisional, solid = live/committed.
- Win/loss always signed (`+6.0` / `−3.0`) and labelled, never color alone.
- Quote ≠ submitted ≠ confirmed. Never show success before the service resolves.
- Plain language: "Connect account", "Your agent is thinking", "Fair-play verified".
