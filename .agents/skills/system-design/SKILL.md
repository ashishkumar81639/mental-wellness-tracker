---
name: system-design
description: Hackathon system design and architecture planning. Use when scoping a feature, designing a data model, planning topology, or designing the agent layer.
---

# Hackathon System Design - Phased Approach

## Scope

Hackathon and sprint projects only.
Do not apply this phased approach to long-lived product work where the team uses different planning conventions.

For any non-trivial feature, walk the phases in order.
After each phase, stop, show 5-10 lines, and wait for "go" before the next.
No code until phase 3.
If your phase 1 is longer than 8 lines, you're over-scoping - cut it.

## Problem statement alignment is scored first

Alignment is one of the two high-impact scoring signals (with code quality), so anchor the whole design to it.
Copy the exact problem statement into the README and list every explicit requirement as a checkbox.
Every phase, screen, and feature must trace back to one of those checkboxes. If it doesn't, cut it.
Re-check the list before declaring the build done; an unmet requirement costs more than any extra feature gains.

## Backend phases

1. **Scope & demo flow** - what the judge clicks, what the system does in response, what's explicitly out of scope.
   Include scale numbers only if they change the design (most sprints: they don't, say so).

2. **Capacity sanity check** - one-line math on QPS, storage, token spend per demo run.
   If the answer is "trivially small," say "trivial, skipping" and move on.
   Don't fake numbers.

3. **Data model & API contracts (LLD)** - tables with columns and indexes, endpoints with request/response shapes, the zod/pydantic schemas at the boundary.

4. **Topology & data flow (HLD)** - one diagram in words: where the LLM calls happen, where state lives, what streams vs blocks, where the failure points are.

5. **Agent layer deep-dive** - system prompt sketch, tool list with signatures, retrieval strategy, output schema.
   This is where you win points; spend real thought here.

6. **Failure modes & shortcuts** - what breaks under a slow LLM, a hallucinated tool call, a duplicate submit.
   What's marked `sprint:` and what's the upgrade path.

## UI phases

1. **Screen inventory & flow** - list the screens needed for the demo, the click-path between them, what's cut from scope.

2. **Design system extraction** - confirm `ACTIVE_DESIGN`, pull tokens from that single `DESIGN.md` into `src/styles/tokens.css` or `tailwind.config.ts`.
   Paste the values; no paraphrasing.

3. **Layout skeleton** - nav, container, grid, primary breakpoints.
   No real content yet; placeholders only.

4. **Component breakdown & state model** - which components exist, which own state, what props they take, where async happens.

5. **Critical-screen deep-dive** - the one or two screens the judge will spend time on.
   Empty state, loading state, error state, success state - all four.

6. **Polish pass & trade-offs** - motion, focus rings, alt text, what was sacrificed for time and why.

## Skipping

Skipping a phase is fine.
Skipping silently is not - name the phase you skipped and what risk that creates.

## When designing the agent layer

This is the deepest part of phase 5 and worth its own checklist.

System prompt should fit in your head: role, task, output schema, one constraint about tone or scope.
Anything longer is probably trying to compensate for missing tool definitions.

Tools: name, input schema, output schema, one-line description of when to call.
If a tool needs prose to explain when to use it, the name is wrong.

Retrieval: declare chunk size, embedding model, top-k, similarity threshold.
If you can't say all four numbers, you haven't designed retrieval, you've gestured at it.

Output schema: zod/pydantic, mandatory.
Models that emit free-form prose for downstream code to parse are a future bug.

Failure modes to plan for in phase 6: empty retrieval, tool returns error, LLM returns malformed JSON, LLM streams forever, user submits duplicate.
Each gets a named handler.
