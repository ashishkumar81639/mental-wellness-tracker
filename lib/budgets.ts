// Per-user lifetime budgets. The hard wallet ceiling - enforced in Postgres,
// not in-memory. See LAUNCH-PREP §0/§1.
//
// Voice is Sarvam-credit-funded (₹25k credit ≈ 8.3M chars). At 1k users:
// 8,000 chars/user uses the full credit. ~26 voice turns per user.
// Text is real money (DeepSeek ~₹0.03/msg). 150 msgs/user ≈ ₹4.5k at 1k users.
export const VOICE_CHAR_CAP = 8_000;
export const CHAT_MSG_CAP = 150;
// STT (Assembly) bills by mic-open duration. Auto-end the session so a parked
// tab can't rack cost. 10 min is generous for one conversation.
export const STT_SESSION_TIMEOUT_MS = 10 * 60 * 1000;
