---
phase: "03"
plan: "04"
subsystem: ui
tags: [css-tokens, typography, tailwind, design-system]
dependency_graph:
  requires: []
  provides: [chart-color-tokens, tailwind-typography-physicslab]
  affects: [web/src/index.css, web/src/components/TelemetryPanel.tsx, web/src/pages/Simulation.tsx, web/src/pages/PhysicsLaboratory.tsx]
tech_stack:
  added: []
  patterns: [css-custom-properties, tailwind-utility-classes, js-color-constants]
key_files:
  created: []
  modified:
    - web/src/index.css
    - web/src/components/TelemetryPanel.tsx
    - web/src/pages/Simulation.tsx
    - web/src/pages/PhysicsLaboratory.tsx
decisions:
  - Use JS constants (CHART_*) in SVG components rather than CSS var() because SVG attribute values cannot consume CSS custom properties without inline style
  - Leave ACTION_COLORS palette untokenized — 20+ unique per-action semantic colors are data visualization, not theme colors
  - Retain 0.68rem skill label fontSize — no standard Tailwind utility maps to this subpixel value
  - Task 3 (CTA copy) was already complete from prior work — no changes needed
metrics:
  duration_minutes: 25
  completed_date: "2026-03-24"
  tasks_completed: 3
  files_modified: 4
---

# Phase 3 Plan 04: UI/UX Standardization & Cleanup Summary

**One-liner:** Chart hex colors centralized into named JS constants and CSS variables; all typography in PhysicsLaboratory migrated from inline fontSize to Tailwind text-xs/text-sm utilities.

## What Was Changed and Why

### Task 1: Color Tokenization (UI-01)

Added 8 semantic chart color tokens to `web/src/index.css`:
- `--chart-blue: #60a5fa` (fiat supply, dopamine)
- `--chart-orange: #f97316` (food reserve, cortisol, default fallback)
- `--chart-green: #4ade80` (AMM spot price)
- `--chart-teal: #2dd4bf` (calories produced)
- `--chart-red: #f87171` (calories burned, crime rate)
- `--chart-violet: #a78bfa` (Gini, dopamine)
- `--chart-emerald: #34d399` (trust index)
- `--chart-coral: #fb923c` (avg cortisol)

In `TelemetryPanel.tsx`:
- Added 8 `CHART_*` JS constants at file top (SVG attributes cannot use CSS var())
- Replaced all 11 hardcoded hex values in SVG chart color props and default fallbacks

In `Simulation.tsx`:
- Added `CHART_ORANGE` and `CHART_VIOLET` constants
- Replaced 2 hardcoded hex values in StatCard color props for Cortisol and Dopamine

**Hex count before:** 13 scattered across TelemetryPanel and Simulation (excluding ACTION_COLORS)
**Hex count after:** 0 scattered — all centralized in CHART_* constant definitions

The `ACTION_COLORS` palette (20+ action-type colors in Simulation.tsx) was intentionally left as-is — each color is uniquely semantic to a specific action type and would be impractical to tokenize without creating 20+ individual CSS variables.

### Task 2: Typography Standardization (UI-02)

In `PhysicsLaboratory.tsx`, replaced all recoverable inline `fontSize` styles with Tailwind utilities:

| Old inline style | Tailwind class used |
|---|---|
| `fontSize: '1.25rem'` | `text-xl` |
| `fontSize: '0.88rem'` | `text-sm` |
| `fontSize: '0.85rem'` | `text-sm` |
| `fontSize: '0.82rem'` | `text-sm` |
| `fontSize: '0.8rem'` | `text-sm` |
| `fontSize: '0.78rem'` | `text-xs` |
| `fontSize: '0.75rem'` | `text-xs` |
| `fontSize: '0.72rem'` | `text-xs` |
| `fontSize: '0.71rem'` | `text-xs` |
| `fontSize: '0.7rem'` | `text-xs` |

One value retained: `fontSize: '0.68rem'` on skill label spans — no standard Tailwind class maps to this size.

### Task 3: CTA Copy Standardization (UI-03)

No changes required. Both CTAs were already using domain-specific language from prior work:
- `SettingsPage.tsx`: "Apply Configuration" (was already updated)
- `IdeaInput.tsx`: "Begin Brainstorming" (already domain-specific)

## Requirements Satisfied

- **UI-01:** Chart hex values tokenized into centralized CHART_* constants synchronized with CSS variables in index.css. Zero scattered hex props in primary simulation and telemetry components.
- **UI-02:** All recoverable `fontSize` inline styles in PhysicsLaboratory.tsx replaced with Tailwind text-xs/text-sm utilities. One 0.68rem subpixel value retained with documented justification.
- **UI-03:** CTA labels already satisfied — "Apply Configuration" and "Begin Brainstorming" in place.

## Deviations from Plan

### Pre-existing (no changes needed)

**Task 3 — CTA already complete**
- Both `SettingsPage.tsx` and `IdeaInput.tsx` already had domain-specific CTA text from prior session work
- No changes made; requirement already satisfied

### Technical approach deviation

**SVG Color Tokens — JS constants instead of CSS var()**
- SVG `fill` and `stroke` attributes cannot reference CSS custom properties unless applied via `style=` attribute
- Used `CHART_*` JavaScript constants instead of direct `var(--chart-*)` usage
- Constants are documented as synchronized with the CSS variables in index.css comments

## Known Stubs

None. All changes are cosmetic (color centralization and typography class migration) with no data wiring implications.

## Self-Check: PASSED

All modified files confirmed present. Both commits (ec26c82, 64e40e5) confirmed in git log.
