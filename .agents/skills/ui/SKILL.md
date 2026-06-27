---
name: ui
description: Hackathon UI, components, styling, and design token rules. Use when working on frontend files, React components, CSS, design tokens, or layout.
---

# Hackathon UI Rules

## Scope

Hackathon and sprint projects only.
The single-source `ACTIVE_DESIGN` rule and the strict no-blending discipline are sprint-correct.
Long-lived products typically use their own design system, not awesome-design-md vendor mirrors.

## Source of truth

Design tokens, layout, and component patterns come from a SINGLE file in `awesome-design-md/design-md/`.

The active design file is declared at the top of `README.md` as:
`ACTIVE_DESIGN: <vendor>` (e.g. `ACTIVE_DESIGN: vercel`).

If `ACTIVE_DESIGN` is missing, STOP and ask.
Do not guess.

## Hard rules

Read ONLY the `DESIGN.md` for the declared vendor.
Do not open or "take inspiration from" any other vendor file.

Do not blend styles.
No mixing typography from one system with colors from another.
If a token is missing, derive it from the active file's existing scale - never import from a different vendor.

Use the EXACT color values, font families, spacing scale, radii, and shadow tokens from the active file.
No "close enough."

Tokens live in ONE place: `src/styles/tokens.css` or `tailwind.config.ts`.
Every component references tokens.
No hardcoded hex or px in component files.

ONE consistent visual system across every screen.
No per-page experimentation.

## Workflow

1. Open `awesome-design-md/design-md/<vendor>/DESIGN.md`.
   Extract colors, type scale, spacing, radii, shadows, motion, component conventions.

2. Paste tokens into `src/styles/tokens.css` or `tailwind.config.ts`.
   If the file already provides snippets, paste them verbatim.

3. Build layout shell first (nav, container, grid), then components, then polish.
   Animations last.
   Do not start with hero animations.

4. Before declaring a UI task done, scan the active `DESIGN.md` and confirm the rendered output matches.
   Fix mismatches before moving on.

## Mark shortcuts

Intentional simplifications get a `sprint:` comment naming the ceiling and the upgrade path:

```css
/* sprint: skipped dark mode tokens. Mirror the light scale with inverted L values when graded. */
```

## Accessibility (low-impact signal, tiebreaker)

Usable for diverse users and environments. Low weight, but cheap to get right and it separates close scores, so do not skip it.

Semantic HTML first: `<button>`, `<nav>`, `<main>`, `<header>`, `<ul>`, headings in order. No `<div onClick>`.
Every image has meaningful `alt` (empty `alt=""` only for purely decorative images).
Every input has an associated `<label>` (wrap it, or use `htmlFor`).
Keyboard reachable: every interactive element focusable and operable with Enter/Space, logical tab order, no focus traps.
Visible focus ring on every focusable element. Never `outline: none` without a replacement.
Color contrast: body text at least 4.5:1, large text and UI elements at least 3:1.
ARIA only where native semantics fall short, and only with correct roles and states.
Respect `prefers-reduced-motion` for non-essential animation.

## Efficiency (medium-impact signal)

Optimal use of time and memory.
Memoize expensive renders; stable keys on lists; no inline object/array props that bust memoization.
Lazy-load below-the-fold content and split routes into chunks.
Use `next/image` (or width/height plus lazy loading) to avoid layout shift and oversized images.
No work in render that belongs in an effect or a memo.

## NOT lazy about (UI)

Loading and empty states on every async surface.
Blank screens look broken.

Pixel perfection on every UI surface you touch, and any visible issue you notice along the way.

Responsive at one extra breakpoint beyond the design's default.
Judges resize.

Streaming UX: skeleton/shimmer while loading, partial render as tokens arrive, cancel button on long generations.

## Anti-patterns (auto-reject)

Reading multiple `DESIGN.md` files "to compare."

Adding gradients, glassmorphism, or neon accents not present in the active file.

shadcn/ui defaults when the active system specifies otherwise.

Inline styles or Tailwind arbitrary values bypassing the token layer.

Per-page color variations or one-off type sizes.
