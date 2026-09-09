# SafeNest

SafeNest correlates facility appliance telemetry, maintenance history, and human reports to prioritize safety risk and route recommended maintenance through human approval.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/safenest run dev` — run the web dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — managed PostgreSQL connection string
- Optional env: `GEMINI_API_KEY` — enables concise Gemini-refined investigation summaries; the local risk engine remains the source of truth

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for SafeNest API contracts
- `lib/db/src/schema/safenest.ts` — Drizzle schema for appliances, telemetry, maintenance, incidents, tickets, and audit events
- `artifacts/api-server/src/lib/safenest.ts` — seeded demo data and deterministic risk engine
- `artifacts/api-server/src/routes/safenest.ts` — dashboard, investigation, reports, tickets, and chat routes
- `artifacts/safenest/src/App.tsx` — dashboard frontend and route shell

## Architecture decisions

- Risk categories are driven by deterministic rules with safety overrides; the LLM can only refine wording.
- Ticket creation produces an approval request; the agent cannot approve or execute consequential work.
- Demo data is seeded once with Fan-104 as the multi-signal critical scenario.

## Product

Facility managers can scan appliance risk, inspect sensor and maintenance evidence, submit incident reports, investigate equipment with the safety assistant, and approve or reject maintenance tickets.

## User preferences

No additional preferences recorded.

## Gotchas

- Run API codegen after changing `lib/api-spec/openapi.yaml`.
- Run `pnpm run typecheck` after changing shared schema or API code.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
