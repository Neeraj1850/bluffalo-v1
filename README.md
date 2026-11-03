# near-poker-agent

AI poker agent on NEAR.

## Frontend

Next.js 15 · TypeScript · Tailwind CSS v4 · Framer Motion — in [`frontend/`](frontend).

```bash
cd frontend
npm install
npm run dev
```

## Workflow

- `main` — releases only.
- `dev` — integration branch. All work lands here.
- Every change starts as a GitHub issue (`feat:`, `fix:`, `chore:` …) and gets its own branch named `<issue-number>-<short-name>`, e.g. `1-design-foundations`.
