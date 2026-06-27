---
name: backend
description: Hackathon backend, API, database, agents, RAG, and server-side code rules. Use when working on server files, API routes, database schemas, agent implementations, or prompt engineering.
---

# Hackathon Backend Rules

## Scope

Hackathon and sprint projects only.
The hard rules below (monolith, no auth, raw SQL, console.log instead of OTel) are sprint-correct, NOT production-correct.
Do not apply these to long-lived product code.

## Stack declaration

Declare once at the top of `README.md`:
`STACK: <runtime>/<framework>/<db>/<deploy>`

If undeclared, STOP and ask.
Never introduce a second framework, second DB, or second language mid-build.

## Defaults if user has no preference

Full-stack web: Next.js App Router + SQLite + Vercel.

Python-required: FastAPI + SQLite + Render.

Agent/RAG: same as above + in-process vector store (LanceDB/Chroma).
No Pinecone.

## Hard rules

One repo, one process, one DB, one LLM provider, one framework.
Monolith.

No Docker, K8s, Terraform, microservices, queues, workers unless the challenge demands async > 60s.

No auth unless required.
If required: magic link or one hardcoded demo user.

No Prisma migrations.
Raw SQL in `schema.sql`, run on boot.

No Sentry, Datadog, OTel.
`console.log` is the spec.

No custom retry / backoff wrappers.
Use the SDK's.

No repository pattern, DI container, service layer for CRUD.

Validate every user/LLM boundary with zod/pydantic.
Trust nothing past that line.

Stream LLM output.
Never block on full completion.

Seed data on boot.
Empty state is a bug in a demo.

Server-side by default.
Dumb client.

Deletion over addition.
Boring over clever.
Fewest files possible.

## File layout

```
/app or /src         routes, pages, components
/lib                 db client, llm client, utils
/lib/prompts         exported constants with input/output types
/lib/agents          one agent per file: system prompt, tools, contract
/db                  schema.sql + seed.sql
/scripts/check.ts    one runnable check exercising the main pipeline
/tests or *.test.ts  a few unit tests (low-impact, keep light), runner config in package.json
/README.md           STACK, ACTIVE_DESIGN, run + demo script
```

## Agent / RAG specifics

Prompts as exported constants in `/lib/prompts/*.ts`.
Never inline a prompt > 3 lines in a route handler.

One agent = one file = one contract (input, output, tools, system prompt).

Tools = plain functions + zod/pydantic schemas, registered once.

Retrieval: chunk -> embed on ingest -> store vectors next to source rows in same DB.
No separate vector DB under 100k chunks.

Cache embeddings by content hash.
Re-ingest must be free.

Log every LLM call: prompt name, model, tokens, latency, tools.
One line to stdout.

Every agent has a hard `max_iterations` and `max_tokens`.
Fail loud when hit.
A runaway loop can burn through credits fast.

## API design

REST (or tRPC inside a Next.js monolith).
No GraphQL.

Route per resource, verbs as HTTP methods.
JSON in, JSON out, status codes that mean what they say.

Errors: `{ error: string, code: string }`.
No stack traces to client.
Log full error server-side.

## Security (medium-impact signal)

Safe practices that avoid common vulnerabilities. Worth real attention; do not let a strong solution leak points here.

Parameterized queries only. Never string-concatenate SQL.
Validate and narrow every request body, query param, and LLM output with zod/pydantic before use.
No secrets in code or in the repo. Read keys from `process.env` / `os.environ`, list them in `.env.example`.
No `eval`, no `child_process`/`subprocess` on user input, no unsafe deserialization (`pickle`, `yaml.load`).
Set a timeout on every outbound fetch and LLM call.
Return `{ error, code }` to the client, never a stack trace or raw exception message.
Rate-limit any public write endpoint, even if the limiter is in-memory.

## Efficiency (medium-impact signal)

Optimal use of time and memory.
Index every column you filter, join, or order by.
No N+1 queries. Batch or join instead of looping queries.
No O(n^2) where a map or a single pass works.
Stream LLM and large list responses; do not buffer the whole thing in memory.
Cache embeddings and any pure, repeatable computation by content hash.

## NOT lazy about (backend)

Input validation at user and LLM boundaries.
Models hallucinate JSON.
Users paste garbage.

Error handling around LLM calls.
Catch, log, render fallback.
Never crash the demo on a timeout.

A few unit tests with the stack's runner (Vitest/Jest/pytest). Testing is low-impact, so keep it light: cover pure functions, schema parsing, and tool handlers, do not chase coverage.
`scripts/check.ts` stays as the full-pipeline smoke test: fixed input, assert the output schema, print PASS or FAIL.

Secrets hygiene.
`.env` in `.gitignore` from the first commit.
Never paste API keys into code.
