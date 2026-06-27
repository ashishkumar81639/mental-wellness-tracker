---
description: Hackathon sprint mode - lazy senior dev. UI + backend. Hackathon-scoped only.
alwaysApply: true
---

# Scope

This file applies ONLY inside a hackathon, PromptWars, or sprint project.
If this file is present in a long-lived product codebase, treat it as a mistake.
Do not enforce sprint-mode shortcuts on non-hackathon work.
The General Guidelines section below is the only part that should apply universally.

---

# General Guidelines (must follow)

These are calibration rules, not scope rules.
Sprint mode still decides WHAT to build.
These decide HOW to build the things you decided to build.

Never use the em dash "-". Use plain dash "-" instead.

Commit messages: NEVER auto-add your agent name as co-author.

Never manually modify CHANGELOG.md or any files marked as auto-generated.

When writing or substantially editing long Markdown files, put each full sentence on its own line.
Preserve normal Markdown structure, but avoid wrapping multiple sentences onto one physical line.

When making technical decisions, do not give much weight to development cost.
Your training data estimates cost in human-hours, but you are not a human and that estimate does not apply to you.
Do not pick the flimsier algorithm, the shakier data model, or the less robust pattern just because it "looks faster to build."
Within whatever scope sprint mode says to build, prefer quality, simplicity, robustness, and long-term maintainability.

When doing bug fixes, always start with reproducing the bug in an E2E setting as closely aligned with how an end user would hit it.
The reproduction is what tells you the real problem, so your fix actually solves it.

When end-to-end testing a product, be picky about the UI and be obsessed with pixel perfection.
If something clearly looks off, even if it's not directly related to your current task, fix it along the way.

Apply that same high standard to engineering excellence: lint, test failures, test flakiness.
If you see one, even if not caused by what you're working on, still fix it.

---

# Sprint Mode

This is a hackathon.
Lazy = efficient, not sloppy.
The best code is the code you never wrote.

## PromptWars scoring (optimize for this above all else)

The platform auto-scores every submission on six parameters.
Final score is the sum of all six; no category is ignored.
They carry different weights, so invest in that order.

High impact (get these right first; they carry the most weight):
1. **Problem statement alignment** - target the core challenge, user needs, and objectives. Build exactly what the prompt asks; re-read it before declaring done and map every stated requirement to a working feature. No off-scope extras that dilute the signal.
2. **Code quality** - clean, readable, well-structured. Zero lint warnings, small focused functions, clear names, no dead code, no commented-out blocks, no `any` where a real type fits.

Medium impact (a strong solution still loses points it could have kept if you ignore these):
3. **Security** - safe practices, avoid common vulnerabilities. Validate every input with zod/pydantic, parameterized queries only, no secrets in code, no `eval`, escape anything rendered to the DOM.
4. **Efficiency** - optimal use of time and memory. No N+1 queries, index columns you filter on, no O(n^2) where O(n) works, stream large responses, avoid needless re-renders.

Low impact (tiebreakers when scores are close; do not leave the points on the table, but do not over-invest):
5. **Testing** - easily testable and maintainable. Keep core logic in small pure functions; add a few unit tests plus the `scripts/check.ts` smoke test.
6. **Accessibility** - usable for diverse users and environments. Semantic HTML, alt text, labels, keyboard nav, focus rings, sufficient contrast.

## Two declarations at top of README.md

`STACK: <runtime>/<framework>/<db>/<deploy>` - if missing, STOP and ask.

`ACTIVE_DESIGN: <vendor>` - ONE file from `awesome-design-md/design-md/<vendor>/DESIGN.md`.
If missing, STOP and ask.

## The ladder (stop at the first rung that holds)

1. Does it need to exist for the demo? If the judge never sees it, skip.
2. Already in this repo? Reuse.
3. Framework gives it free? (Form actions, `<dialog>`, JSON columns, file-based routing.) Use it.
4. SDK gives it free? (LLM streaming, retries, tool calling, structured output.) Use it. No wrappers.
5. One existing dep away? Use it. Never add a second dep for the same job.
6. Can it be one file, one route, one query, one component? Make it that.
7. Only then write new code.

## Work in phases - never dump a full plan

For non-trivial features, walk the phases.
After each, show 5-10 lines and wait for "go" before the next.
No code until phase 3.

**Backend phases:** Scope & demo flow -> Capacity sanity check (one line; "trivial, skip" is fine) -> Data model & API contracts -> Topology & data flow -> Agent layer (prompt, tools, retrieval, output schema) -> Failure modes & shortcuts.

**UI phases:** Screen inventory -> Token extraction from active DESIGN.md -> Layout skeleton -> Component & state model -> Critical-screen deep-dive (empty/loading/error/success) -> Polish & trade-offs.

Skipping a phase is fine.
Skipping silently is not - name the phase and the risk.

## Hard rules (non-negotiable)

One repo, one process, one DB, one LLM provider, one framework.
Monolith.

No Docker, K8s, Terraform, microservices, queues, workers unless the challenge demands async > 60s.

No auth unless required.
If required: magic link or one hardcoded demo user.

No Prisma migrations, Sentry, custom retry wrappers, repository pattern, DI container.

Validate every user/LLM boundary with zod/pydantic.
Trust nothing past that line.

Stream LLM output.
Never block on full completion.

Seed data on boot.
Empty state is a bug in a demo.

Server-side by default.
Dumb client.

Read ONLY the active vendor's DESIGN.md.
Never blend systems.
Use EXACT tokens.

Tokens live in ONE place (`src/styles/tokens.css` or `tailwind.config.ts`).
No hardcoded hex or px in components.

Deletion over addition.
Boring over clever.
Fewest files possible.

## Defaults if user has no stack preference

Full-stack web: Next.js App Router + SQLite + Vercel.

Python-required: FastAPI + SQLite + Render.

Agent/RAG: same as above + in-process vector store (LanceDB/Chroma).
No Pinecone.

---

## Reference - file layout

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

## Reference - agent / RAG

Prompts as exported constants, never inline > 3 lines in a route.

One agent = one file = one contract (input, output, tools, system prompt).

Tools = plain functions + zod/pydantic schemas, registered once.

Retrieval: chunk -> embed on ingest -> store vectors next to source rows in same DB.
No separate vector DB under 100k chunks.

Cache embeddings by content hash.
Re-ingest must be free.

Log every LLM call: prompt name, model, tokens, latency, tools.
One line to stdout.

## Reference - API

REST (or tRPC inside a Next.js monolith).
No GraphQL.

JSON in, JSON out, status codes that mean what they say.

Errors: `{ error: string, code: string }`.
No stack traces to client.

## Reference - UI workflow

1. Open `awesome-design-md/design-md/<vendor>/DESIGN.md`. Extract colors, type, spacing, radii, shadows, motion, component patterns.
2. Paste tokens into `src/styles/tokens.css` or `tailwind.config.ts`. Use the file's snippets verbatim if provided.
3. Build shell (nav, container, grid) -> components -> polish. Animations last.
4. Before declaring done, scan the active `DESIGN.md` and confirm the rendered output matches.

---

## Mark shortcuts with `sprint:` comments

Name the ceiling and the upgrade path.
No comment = you believe this is the real answer.

```ts
// sprint: in-memory rate limit. Move to Redis past one node.
// sprint: O(n) re-embed on every ingest. Hash-cache past 1k docs.
// sprint: hardcoded demo user. Magic link if auth is graded.
```

## Git discipline

Commit every working state.
A bad agent edit with no recent commit costs 20 minutes of rework.

`.gitignore` from the first commit: `.env`, `node_modules/`, `.next/`, `*.db`, `.DS_Store`, `awesome-design-md/`.

Work on `main`.
No branches, no PRs, no merge conflicts.
This is a solo sprint.

## Bug fix = root cause (reinforced by General Guidelines)

Reproduce in an E2E setting first - exactly how an end user would hit it.
Then grep every caller of the function you touch and fix once at the source.
One guard in the shared helper beats one per caller and won't leave a sibling path broken when the judge clicks the other button.

## NOT lazy about (these survive every cut)

Understanding the challenge before coding.
A small diff in the wrong place is a second bug.

Input validation at user and LLM boundaries.
Models hallucinate JSON.
Users paste garbage.

Error handling around LLM calls.
Catch, log, render fallback.
Never crash the demo on a timeout.

Semantic HTML, alt text, keyboard nav, focus rings.
Judges tab through.

Loading and empty states on every async surface.
Blank screens look broken.

Testing is a low-impact scoring signal: a tiebreaker, not a priority.
Do not over-invest, but do not skip it either - no category is ignored.
Keep core logic in small pure functions so it stays easy to test.
Add a few unit tests for those with the stack's runner (Vitest/Jest/pytest), plus `scripts/check.ts` as the full-pipeline smoke test: fixed input, assert the output parses against the zod/pydantic schema, print PASS or FAIL.

Fresh-clone demo working end-to-end before submit.

Pixel perfection on every UI surface you touch, and any visible issue you notice on the way.

Lint, test failures, flakiness - fix any you see, regardless of whether you caused them.

## Question complex requests

"Let's add a queue / cache / separate service / admin panel" -> ask: do we need this for the demo, or does the simpler thing cover it?
Most of the time the simpler thing covers it.

## Demo readiness (final pass before submit)

1. Fresh clone -> install -> dev works, zero extra setup.
2. `.env.example` lists every key with where to get it.
3. README has a 5-line "click this, then this, watch the magic" script.
4. Seed data makes the app look alive on first load.
5. Impressive moment reachable in < 30s from page open.
6. `scripts/check.ts` runs green.
7. Tab through the UI once. Resize once.
8. No lint warnings. No failing tests. No flaky tests.
9. Re-read the problem statement; confirm every stated requirement maps to a working feature.
10. Run the security pass: no hardcoded secrets, every input validated, no unescaped user content in the DOM.
