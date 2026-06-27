# Mental Wellness Tracker - Yaar (यार)

STACK: Node.js / Next.js 15 (App Router) / Postgres (Neon) / Vercel

ACTIVE_DESIGN: claude (warm cream canvas, coral accents, soft serif headlines — calm and humanist). Tokens from `awesome-design-md/design-md/claude/DESIGN.md`.

## What is Yaar?

An empathetic AI companion for Indian students navigating the stress of competitive exams (JEE, NEET, CUET, CAT, GATE, UPSC, boards).
Yaar analyzes daily journal entries and mood logs, uncovers hidden stress triggers, streams conversational support, and delivers personalised coping strategies — all through a calm, premium interface.

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> && cd mental-wellness-tracker
npm install

# 2. Set up environment
cp .env.example .env
# Fill in DATABASE_URL (Neon Postgres), DEEPSEEK_API_KEY, and JWT_SECRET

# Generate a JWT secret
openssl rand -base64 32

# 3. Run schema and seed against Neon
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"   # macOS Homebrew libpq
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql

# 4. Start dev server
npm run dev
# Open http://localhost:3000
```

## Demo Credentials

- **Username:** `demo_user`
- **Password:** `demo123`
- **Exam:** JEE, 21 days to exam
- **Seed data:** 3 journal entries with mood logs, AI analysis, and chat history

## Demo Flow (30 seconds to magic)

1. Open the app → see the calm auth page
2. Sign in with `demo_user` / `demo123`
3. Dashboard shows mood trend, triggers, and exam countdown
4. Click "New check-in" → write how you're feeling → get AI analysis with coping strategies
5. Click "Talk to Yaar" → chat with your streaming companion
6. Click "Reframe a thought" → paste a spiraling thought → get a CBT perspective shift
7. Click "View trigger map" → see your trigger→emotion→coping connections

## Tech Notes

- **LLM provider:** DeepSeek (`deepseek-chat` via API). The API may route to `deepseek-v4-flash` — this is expected and does not affect functionality.
- **Auth:** JWT (jose, HS256, 7-day expiry) + bcrypt password hashing.
- **Database:** Neon serverless Postgres (`@neondatabase/serverless`).
- **Streaming:** Chat responses stream via SSE for real-time token-by-token delivery.
- **Safety:** Crisis-language detection surfaces India's Tele-MANAS helpline (14416) and Vandrevala Foundation (1860-2662-345).

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `DEEPSEEK_API_KEY` | DeepSeek API key from platform.deepseek.com |
| `JWT_SECRET` | Random 32+ char secret. Generate: `openssl rand -base64 32` |

## Testing

```bash
# Smoke test the analysis pipeline
npm run check

# Run unit tests
npx vitest run

# Build check
npm run build

# Lint
npm run lint
```
