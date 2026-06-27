---
description: Antigravity-specific overrides for hackathon sprint mode. Takes precedence over AGENTS.md when running inside Antigravity.
alwaysApply: true
---

# Antigravity Overrides (hackathon)

This file is read by Antigravity in addition to AGENTS.md.
Where this file and AGENTS.md disagree, this file wins.
Cursor ignores this file - it only reads `.cursor/rules/*.mdc` and AGENTS.md.

## Scope

Hackathon and sprint projects only.

## Model selection inside Antigravity

DeepSeek is NOT available natively in the Antigravity model picker.
If the user wants DeepSeek as the primary coding model, advise switching to Cursor for that session.

Default picks for hackathon work in Antigravity:

- **Fast routing, classification, extraction:** Gemini 3 Flash (free in the public preview, lowest latency)
- **Code generation, complex reasoning:** Claude Sonnet 4.6 or Claude Opus 4.6 with Thinking (paste your own Anthropic key in Settings to avoid the shared pool)
- **One-shot UI generation from a DESIGN.md:** Claude Opus 4.6 (worth the cost; clean output)

Do not use Gemini 3 Pro for routing decisions when Flash is available.
Do not use Claude Opus for trivial extraction tasks where Flash would suffice.
One model per task tier - the AGENTS.md hard rule still applies.

## Anthropic key

Paste your own Anthropic API key in Antigravity Settings before the hackathon starts.
The shared public-preview pool will throttle when everyone in the room hits it simultaneously.

## Mid-hackathon tool switching

If switching from Antigravity to Cursor mid-build:
1. Commit and push current state first.
2. Pull in Cursor.
3. Same AGENTS.md and `.cursor/rules/*.mdc` apply, no reconfiguration needed.
4. Tell Cursor the active model (DeepSeek, Claude, etc.) in your first prompt so it doesn't assume Gemini context.

Do not have both tools editing the same files at the same time.
Pick one as primary per task to avoid merge confusion.

## Antigravity-specific demo check

Antigravity's built-in browser preview is what the jury sees if you demo on your laptop.
Before declaring done:
1. Open the built-in preview, not just `localhost:3000` in your own browser.
2. Confirm the demo script runs end-to-end in the preview.
3. Check that any external API calls (LLM, vector DB) still work from the preview's network context.

## What this file does NOT override

The General Guidelines in AGENTS.md (em dash, commit author, markdown sentence-per-line, dev-cost bias, E2E reproduction, pixel perfection, lint/test discipline) apply unchanged.
The phased work approach in the `system-design` skill applies unchanged.
The backend and UI hard rules apply unchanged.
