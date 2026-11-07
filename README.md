# near-poker-agent

AI poker agent on NEAR.

## Frontend

Next.js 15 · TypeScript · Tailwind CSS v4 · Framer Motion — in [`frontend/`](frontend).
See [`frontend/README.md`](frontend/README.md) for routes, structure and the mock API.

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

## Branches

- `main` — releases only. Currently holds the initial project setup.
- `dev` — integration branch; **the latest frontend lives here**.
- Every change starts as a GitHub issue (`feat:`, `fix:`, `chore:` …) and gets its own
  branch named `<issue-number>-<short-name>` (e.g. `7-connect-screen`), merged into `dev`.
