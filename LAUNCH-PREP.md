# LinkedIn Launch Prep

Backlog of work to do before publishing the app to a wider audience on LinkedIn.
Pick up from here. Items marked **DECIDED** have agreed numbers; **OPEN** needs a call.

Context: WhatsApp story test → 20 views, 2 new users (genuine, just trying — not
abusers). Can't predict LinkedIn reach. "Real traction" ≈ 100 users.

---

## 0. Budget guardrails (the money model) — DECIDED

- **Total burn tolerance for launch: ₹2,000.** Acceptable to lose this for traction
  / funding appreciation.
- **Max spend per user: ₹20, LIFETIME ("overall"), not daily.**
  - 100 users × ₹20 = ₹2,000 → hard ceiling holds.
  - Lifetime (not daily) so repeat fans can't compound past ₹2k.
- **Per-user split of the ₹20 → Voice-heavy** (voice = the "wow" feature for
  LinkedIn / VCs):

  | Feature   | Lifetime cap | Cost   | Experience            |
  |-----------|--------------|--------|-----------------------|
  | Voice TTS | 5,000 chars  | ≈₹15   | ~16–18 turns (full)   |
  | Text chat | 150 messages | ≈₹4.5  | abuse ceiling, loose  |
  | **Max**   |              | **≈₹19.5/user** | 100 users ≈ ₹1,950 |

### Cost reference (for recomputing if numbers change)
- **Sarvam TTS (bulbul:v3):** ₹30 / 10K chars = **₹0.003/char**. ~6 chars/spoken word.
  A typical reply ≈ 300 chars ≈ ₹0.90.
- **DeepSeek-chat (now v4-flash non-thinking):** input $0.14/M (cache miss),
  $0.0028/M (cache hit); output $0.28/M. Per message ≈ **₹0.03** (cache miss),
  ~₹0.015 with prefix caching. ~30× cheaper than one voice reply.
- **Assembly STT:** billed by audio duration (~₹15–40/hr) — see gap in §2.

---

## 1. Rate limit per user — text & voice — OPEN (ready to build)

The real cost guarantee. **Enforce lifetime budgets in Postgres** (atomic UPDATE) —
that DB counter is what actually caps spend at ₹2k. The existing in-memory limiter
(`lib/rate-limit.ts`) is per-process / per-instance on serverless → leaky, but that's
OK because the Postgres budget is the hard wallet ceiling.

**Plan:**
- **Voice:** add `users.voice_chars_used BIGINT DEFAULT 0`. In
  `app/api/talk/tts/route.ts`, atomic `UPDATE ... SET voice_chars_used = +len
  WHERE id = user AND voice_chars_used < 5000 RETURNING ...`; no row → `429
  quota_exceeded`. Charge before calling Sarvam (reserve pattern).
- **Text:** NO new column needed — `chat_messages` already stores every message.
  `COUNT(*) WHERE user_id AND role='user' >= 150` → `429`. Fold the count into the
  chat route's existing `Promise.all` reads.
- **Graceful 429 UX:** voice already degrades (skips audio, keeps text). Add a
  friendly message: "You've used your free voice — keep chatting by text."
- **Burst limits (secondary, DoS not cost):** add missing `talk/tts` entry to the
  limiter; bump `chat` to ~20/min. Switch limiter key from IP → username. In-memory
  is fine for these.
- Numbers decided in §0. Just needs green light to implement.

### Sub-gap: mass-signup farming
Per-user caps can be reset by registering new accounts. Keep / tighten the
`auth:register` per-IP limit (currently 5/min) so budgets can't be farmed. Consider
email/phone verification (ties into §3) as the real fix.

---

## 2. STT (Assembly) cost gap — OPEN
The ₹20 budget caps **TTS (Yaar speaking)** but **NOT Assembly STT (transcribing the
user)**. STT bills by mic-open duration, so a parked/idle tab racks cost outside the
cap (~₹15–40/hr).

**Fix options:**
- Auto-end the voice session when (a) voice budget exhausted, or (b) idle/total
  timeout (~10 min).
- OR leave STT uncapped for v1 and just watch the Assembly bill.
- **Decision needed.**

---

## 3. Email-based OTP / verification — DECIDED (provider: Resend)

**Decision: do auth via EMAIL OTP** (no SMS — see §4). Email verification also
hardens §1 against signup-farming of the ₹20 budgets.

- **Provider: Resend.** Best DX for Next.js, free tier **3,000/mo (100/day)** = ₹0
  at launch scale. Add env config + a `lib/email` helper. Send the OTP/verification
  + password-reset mails.
- Two kinds of email — don't confuse them:
  - *Mailbox* (`ashishkumar@yaarhelp.in`) = manual replies/outreach. Already live on
    GoDaddy (see §7).
  - *Transactional* (OTP, reset) = sent programmatically via Resend AS the domain.
    Do NOT SMTP through the GoDaddy mailbox — low limits + spam.
- **MUST avoid spam (the domain's DMARC is `p=quarantine` — see §7):** authenticate
  Resend or OTP mail goes to spam. Steps:
  1. Add Resend's **DKIM** records to DNS (Resend provides exact values).
  2. **Send from a subdomain** `send.yaarhelp.in` with its own SPF + DKIM — keeps it
     off the GoDaddy mailbox SPF and protects the main domain's reputation.
  - At ~100 users volume is trivial; auth is the only thing that matters for inbox.

---

## 4. SMS — DROPPED (not doing it)

**Decision: NO SMS.** Auth is email-OTP only (§3).

Reasons: SMS costs real money per message, and India mandates **DLT registration**
(TRAI) for OTP SMS — sender ID + template registration, needs business/PAN docs,
days of friction. Email OTP (free via Resend) already solves signup-farming, so SMS
buys nothing for a 100-user launch. Revisit only if phone verification becomes a
real requirement later.

---

## 5. Payment gateway integration — DEFER (replace with a waitlist signal first)

**Decision: do NOT build payments for the LinkedIn launch.** Replace it with a
lightweight "want more?" waitlist button. Build Razorpay only after demand is proven.

**Reasoning:**
- The goal of this launch is **buzz + job-search credibility**, with funding as a
  long-shot bonus. Payments serve none of those directly.
- Building a checkout for demand you haven't validated is effort spent on the
  *least* likely upside. Nobody has asked to pay yet.
- A payment page nobody uses is weak evidence. **A waitlist with N real clicks is
  strong evidence** — better for both job-search storytelling AND any funding
  conversation than a dead checkout.
- It de-risks: you find out if anyone wants to pay *before* sinking time into
  pricing/tiers/webhooks/DB schema.

**What to build instead (cheap):**
- When free budget (§0) is exhausted, show a "Want more voice time? Join the
  waitlist" CTA → capture email/intent in a `waitlist` table (or even just log it).
- Track click count. That number is your demand signal and your launch metric.

**Trigger to actually build Razorpay:** e.g. ~30 waitlist clicks, or clear repeat
retention. Only then: pricing/tier model, checkout, webhook to grant paid quota, DB
columns for plan + paid balance (ties into §1 counters — paid users get higher /
unmetered caps). India-first: **Razorpay** (UPI, cards); Stripe if global.

---

## 6. Domain & startup credits — domain DONE, credits are POST-launch

**Domain: bought (₹500).** Makes the launch look like a product, not a weekend
project. Bonus: enables a custom email (`you@yourdomain`) — use it for LinkedIn
outreach and credit applications (looks legit).

**Sequencing (do NOT block launch on this):** spend the ₹2k → get traction →
traction is what unlocks credits + funding. Credits come AFTER, not before. Not
waiting on them.

**Credit tiers (for later):**
- *Accessible now, no funding needed (~$1k–$5k):* Microsoft for Startups Founders
  Hub (~$1k Azure, includes Azure AI/OpenAI credits), AWS Activate self-serve
  (~$1k), Google for Startups self-serve (~$2k). A live site on the domain + short
  product blurb usually qualifies. Apply AFTER the site is live (stronger app).
- *Big numbers ($25k–$150k):* need accelerator / VC / incubator backing → come
  after traction. The ₹2k launch is how you get there.

**The cost lever credits unlock (post-launch optimization, not launch-blocking):**
- Swap **Sarvam TTS → Azure/Google neural TTS** (~₹13/10K vs ₹30/10K = half cost,
  and credit-funded ≈ free). Guts the single biggest cost line (§0). Worth it later;
  do NOT rebuild the voice pipeline before shipping the §1 caps.
- Caveat: credits expire (~12 mo) — apply in parallel once live, don't pre-optimize.

## 7. DNS / domain setup — TODO (domain = yaarhelp.in, on GoDaddy)

Checked live DNS. Current state:
- **Registrar/DNS:** GoDaddy (`domaincontrol.com` nameservers).
- **Mailbox email:** LIVE — `ashishkumar@yaarhelp.in` works (GoDaddy MX
  `*.secureserver.net`).
- **SPF:** `v=spf1 include:secureserver.net -all` — authorizes ONLY GoDaddy,
  hardfail.
- **DMARC:** `p=quarantine` — unauthenticated mail → spam. (Good baseline, but means
  Resend MUST be authenticated — see §3.)
- **Apex A record:** `216.198.79.1` = GoDaddy parking, **NOT the Vercel app yet.**

**Action items before launch:**
1. **Point yaarhelp.in → Vercel.** Add the domain in Vercel; it gives the apex A
   (`76.76.21.21`) or a CNAME → set it in GoDaddy DNS. Until done, the domain doesn't
   serve the app.
2. **Resend on `send.yaarhelp.in`** with its own SPF + DKIM (§3) so OTP email clears
   the `p=quarantine` DMARC and lands in inbox.

---

## Priority order for launch (against the goal: buzz + job search, capped loss)
1. **MUST ship before launch — these make the "₹2k cap" actually true:**
   - §1 per-user budgets (voice + text, Postgres-enforced)
   - §2 STT cap (the only remaining hole in the ₹2k guarantee)
   - Until these ship, the ₹2k cap is fiction (TTS/STT currently uncapped).
2. **SHIP for launch:** §3 email-OTP via Resend (stops signup-farming, looks
   professional) + §7 DNS (point domain → Vercel, Resend DKIM on `send.` subdomain).
3. **DEFER — do NOT build for launch:** §5 payments → ship the waitlist button instead
   (build Razorpay only on demand trigger, ~30 clicks / repeat retention).
4. **DROPPED:** §4 SMS — email-OTP only.

## Open decisions to resolve next session
1. **Green light** to build the §1 per-user budgets (schema + both routes + burst limits)?
2. **STT:** add voice-session auto-end, or leave uncapped for v1? (§2)
3. (Deferred) pricing/tier model for payments (§5, only after waitlist signal).

## Settled this session (no longer open)
- Money model: ₹2k total cap, ₹20/user lifetime, voice-heavy (5,000 chars / 150 msgs). (§0)
- Auth = email-OTP via Resend; NO SMS. (§3, §4)
- Payments deferred behind a waitlist signal. (§5)
- Domain yaarhelp.in bought; credits are post-traction, not a blocker. (§6)

## Notes / non-issues
- DeepSeek `deepseek-chat` deprecates 2026-07-24 → maps to v4-flash non-thinking.
  **Known / non-issue** — already effectively on v4-flash.
