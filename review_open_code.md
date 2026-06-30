# Senior Staff Engineer Review - Yaar (Mental Wellness Tracker)

Scope: full repo walk-through. Comments are grouped by severity and point at
the exact location with `file:line` so they are actionable. Praise is kept
short; the bulk is on what should change before this stops being a sprint
codebase.

---

## What is genuinely good

- Clean layering. Routes are thin, agents are one-file-one-contract, prompts
  are exported constants, pure logic lives in `lib/utils.ts` and is unit
  tested without DB or network. This is the shape the AGENTS.md asks for and
  it pays off: most of the system is readable in one pass.
- Boundary validation everywhere with zod (`lib/schemas.ts`). Every POST
  parses before it touches the DB or LLM. LLM tool output is re-validated
  through `AnalysisSchema` with `.catch()` defaults
  (`lib/utils.ts:63-81`) so a single hallucinated field cannot sink a check-in.
- DB work is structured: parallel reads via `Promise.all`
  (`app/api/dashboard/route.ts:13`, `app/api/chat/route.ts:27`), batched
  trigger insert via `UNNEST` instead of a per-row round-trip
  (`app/api/check-in/route.ts:97-101`), and the schema actually indexes the
  columns the dashboards filter on (`db/schema.sql:60-66`).
- LLM calls have a hard timeout via `AbortController`
  (`lib/agents/journal-analyst.ts:45-46`, `lib/agents/companion.ts:77-78`)
  and every route that calls an LLM has a graceful fallback string instead
  of crashing the demo (`app/api/reframe/route.ts:37-44`,
  `app/api/chat/route.ts:156-167`).
- Error envelope is uniform: `{ error, code }`, no stack traces to the
  client (`lib/route-utils.ts:5-13`).
- Schema is idempotent and uses `ON DELETE CASCADE` so the smoke-test
  cleanup actually cleans up (`db/schema.sql:16`, `scripts/check.ts:113`).

---

## Bugs (fix before submit)

### B1. Default TTS provider is the broken one
`lib/config/registry.ts:29` defaults `tts` to `"assembly"`, but
`lib/config/tts/assembly.ts:10-17` is a stub whose `synthesize()` always
throws. If a deployment forgets to set `TTS_PROVIDER`, every TTS call fails
and the voice screen is dead on arrival even when `SARVAM_API_KEY` is set.

Fix: default to `"sarvam"`, or fall back to the first provider that has a
key configured. The stub should never be reachable by default.

### B2. Sarvam multi-chunk replies are silently truncated
`lib/config/tts/sarvam.ts:46-47` splits long inputs into <=500-char chunks
and the doc comment at line 23 says "Sarvam concatenates the clips into a
single audio response", but lines 71-75 only decode and return
`data.audios[0]`. Everything past the first chunk is dropped. Any reply
longer than ~500 chars is cut off mid-sentence in voice mode.

Fix: base64-decode every entry of `data.audios` and concatenate the WAV
byte streams (or strip WAV headers and merge PCM + rewrite the header).
Until this is fixed, `splitForSpeech` is producing data the provider call
then discards.

### B3. Login timing-attack mitigation is documented but not implemented
`app/api/auth/login/route.ts:24-29` has a comment claiming a dummy bcrypt
compare to mask whether the username exists, but the code just returns
`false` without doing any bcrypt work when `user` is undefined. The
response-time delta between "user exists, wrong password" and "user does
not exist" is on the order of a full bcrypt hash (tens of ms) and is
trivially measurable. Either drop the misleading comment or actually run
a compare against a fixed throwaway hash on the missing-user branch.

### B4. Streak calculation uses UTC, dashboard data uses IST
`app/api/dashboard/route.ts:56` returns `entry_date` cast through
`AT TIME ZONE 'Asia/Kolkata'`, but `calculateStreak`
(`lib/utils.ts:102-124`) builds its own "today" with `new Date()` and
formats keys via `toISOString().split("T")[0]`, which is UTC. Around the
IST midnight boundary a user who journaled "today" in IST will not match
the streak key for "today" computed in UTC, so streaks intermittently read
one short. Use the same timezone the dashboard emits, or pass an already-
normalized "today" into `calculateStreak`.

### B5. Trigger-map edge parsing collides with `->` in labels
`app/api/trigger-map/route.ts:64-67` rebuilds `from`/`to` by splitting the
edge key on the literal `"->"`. Trigger and coping labels are free-text
from the LLM (e.g. a coping label like "slow down -> notice one thing")
would break the edge into three parts and corrupt the graph. Store
`from`/`to` as structured fields on the edge object instead of round-
tripping through a string.

### B6. Register has a TOCTOU on username uniqueness
`app/api/auth/register/route.ts:22-33` does a `SELECT` then an `INSERT`.
Two concurrent registrations for the same username both pass the SELECT;
one INSERT succeeds and the other throws a primary-key violation that the
catch at line 39 surfaces as a generic `500 Internal server error`
instead of the intended `409 CONFLICT`. Catch the unique-violation
SQLSTATE (23505) and re-emit 409, or rely on the INSERT alone.

### B7. TTS endpoint has no rate limit
`app/api/talk/tts/route.ts` calls a paid upstream per request but is not
in the rate-limit registry (`lib/rate-limit.ts:17-23`). The voice hook
fires one TTS request per streamed sentence, so a single turn can easily
hit the upstream 10+ times; a malicious or buggy client can drive cost
hard. Add a "talk:tts" bucket (e.g. 30/min) and apply it at the top of the
route like the other endpoints do.

### B8. Partial assistant reply is lost on stream abort
`app/api/chat/route.ts:149-152` only inserts the assistant turn after the
stream fully closes. If the client disconnects mid-stream the
`controller` is closed, the insert never runs, and the user's message at
line 84 is stored without its reply - the next dashboard render will show
a dangling user turn. Either persist the partial reply on
`cancel`/`error`, or wrap the insert in a `finally` that checks
`fullReply.length > 0`.

---

## Should fix (not demo-breaking, but real)

### S1. LLM calls are not logged
AGENTS.md mandates one stdout line per LLM call (prompt name, model,
tokens, latency, tools). Neither `lib/agents/companion.ts` nor
`lib/agents/journal-analyst.ts` logs anything. The TTS route logs
(`app/api/talk/tts/route.ts:29-31`) but the actual LLM spend does not.
Add a one-line log around the `fetch` in each agent: name, model,
latency, and `usage` from the final chunk.

### S2. `verifyToken` swallows every error
`lib/auth.ts:27-38` returns `null` for any `jwtVerify` failure including
a malformed secret, a thrown crypto error, or a network blip. That is the
right call for an invalid token, but at minimum log the non-token errors
so a misconfigured `JWT_SECRET` does not silently lock every user out
with no trace.

### S3. `exam-countdown` averages per-day averages
`app/api/exam-countdown/route.ts:24-26` groups moods by day and
`averageMood` (`lib/utils.ts:134-137`) then averages those per-day
numbers. A day with one entry of mood 5 counts the same as a day with
twenty entries of mood 3. For 7-day stress forecasting this is fine, but
the comment says "recent mood trend" and a judge reading the dashboard
will assume a true mean. Either drop the `GROUP BY` and average the raw
moods, or rename the field to make the smoothing explicit.

### S4. `sanitiseToolJson` second `JSON.parse` can throw
`lib/utils.ts:45-56` catches the first parse failure, strips fences, and
calls `JSON.parse` again in the catch block - if that also fails it throws
out of the function rather than returning a safe default. The caller in
`journal-analyst.ts:96-105` catches it and converts to `LLMError`, so the
demo does not crash, but the function's own contract ("sanitise") is
broken. Wrap the second parse and return `{}` on failure.

### S5. JWT in `localStorage`
`app/page.tsx:57-58` stores the token in `localStorage`, which is
readable by any script in the page - including any future third-party
widget. Acceptable for a hackathon, but flag it: this is the first thing
to change if the app outlives the sprint. Move to an httpOnly cookie set
by the login/register routes, or at minimum to a `memory` store with a
short refresh window.

### S6. Streak cap is implicit
`calculateStreak` (`lib/utils.ts:109`) loops 31 times and the dashboard
query (`app/api/dashboard/route.ts:60`) caps at `LIMIT 31`. A user on a
32-day streak sees 31. The two constants are not linked - if the query
limit changes, the loop silently undercounts. Derive the loop bound from
`dates.length` or raise both to 90 (the schema already supports it).

### S7. `check-in` trigger insert relies on column-order of `UNNEST`
`app/api/check-in/route.ts:97-101` does
`SELECT ${analysisId}, * FROM UNNEST(${labels}::text[], ${categories}::text[], ${sentiments}::int[])`.
The `*` expands to the unnested columns in declaration order, which only
matches the `triggers` table order by accident. Name the columns
explicitly:
`INSERT INTO triggers (analysis_id, label, category, sentiment) SELECT ${analysisId}, label, category, sentiment FROM UNNEST(...)`.

### S8. Companion context journal block is a second system message
`lib/agents/companion.ts:32-41` injects journal summaries as a
`{ role: "system" }` message between the system prompt and the chat
history. Some OpenAI-compatible backends (DeepSeek included) quietly
merge or drop mid-conversation system messages, and the ordering
(system, system, user, assistant, ...) is non-standard. Put the context
inside the main system prompt as a clearly delimited block, or use the
`developer`/tool-channel if DeepSeek supports it.

---

## Nits (skip if time is short)

- `app/api/check-in/route.ts:10` redefines a local `cleanCoping` instead
  of reusing the same shaping already done at `app/api/journal/route.ts:
  49-54`. Two copies of the same idea; pull it into `lib/utils.ts`.
- `app/api/auth/register/route.ts:27` calls `bcrypt.hash` directly
  instead of the `hashPassword` helper from `lib/auth.ts:8-10`. One
  indirection too many saved, but it duplicates the cost-10 choice.
- `lib/agents/companion.ts:111-122` re-parses the trailing buffer after
  the stream is `done`. The same parsing already runs on every line in
  the loop, so the only case this catches is a final chunk with no
  trailing newline. Fine, but the duplicate logic is worth a small
  helper.
- `lib/rate-limit.ts:14` - unbounded `Map` keyed by IP, already marked
  `sprint:`. Honour the existing comment and stop here.
- `lib/agents/companion.ts:5` and `lib/agents/journal-analyst.ts:14`
  both hardcode the DeepSeek URL and model. One constant in `lib/env.ts`
  would do, and it is the natural place to log the model per call (S1).
- `db/schema.sql:11` - `persona_pref` column exists with a default but
  nothing in the app reads or writes it. Either wire it up or drop it so
  the schema is not lying about a feature that does not exist.

---

## Overall

This is a well-organised sprint codebase that already follows most of its
own rules: validation at boundaries, pure logic isolated, agents in one
file, streaming all the way to the browser, graceful LLM fallbacks. The
things that will bite the demo are the four hard bugs (B1, B2, B3, B4) and
the missing TTS rate limit (B7). Fix those and the rest is polish.
