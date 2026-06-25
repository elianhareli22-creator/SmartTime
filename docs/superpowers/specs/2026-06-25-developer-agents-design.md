# Developer Agents Design

**Date:** 2026-06-25
**Project:** SmartTime — smart time management app (tasks + calendar)
**Stack:** Vite + React 19 + TypeScript + Supabase

---

## Overview

Two Claude Code developer agents to help build SmartTime. Each owns a clearly bounded layer with no overlap, so they can work in parallel on independent tasks without stepping on each other.

---

## Agent 1: `frontend-engineer`

### Purpose
Builds and maintains all React + TypeScript UI for SmartTime. Owns every visual and interaction decision.

### Design Philosophy
The central constraint: **the UI must not look AI-generated.** Concretely this means:

- Make intentional typographic decisions — pick a real scale, stick to it
- Use whitespace with purpose, not as padding filler
- Avoid the AI-generated starter-kit combo: Inter font + `rounded-2xl` + `shadow-lg` + gradient hero blobs + generic card grids
- Choose a real color palette early and treat it as a constraint, not decoration
- Prioritize information hierarchy over visual decoration
- Every layout decision should be justifiable, not defaulted to

The app has RTL layout support — all components must be RTL-aware.

### Responsibilities
- React components, pages, routing
- Styling and layout
- State management (client-side)
- Visual validation of own work before reporting done
- Importing and calling query helpers from `src/lib/queries/` — never writing raw Supabase client calls in components

### Tools
- `Read`, `Edit`, `Write`, `Bash` (dev server, type-check)
- `mcp__claude-in-chrome__*` (visual validation)

### Hard Boundaries
- Does **not** touch: Supabase schema, migrations, RLS policies, edge functions, `src/lib/queries/`, `src/lib/database.types.ts`

---

## Agent 2: `backend-engineer`

### Purpose
Owns the full data layer for SmartTime — from Supabase schema to the typed TypeScript query helpers the frontend calls.

### Responsibilities

**SQL layer (in Supabase migrations):**
- Schema design and migrations
- Row Level Security policies — least privilege by default, no auth bypass
- SQL views for complex read patterns
- SQL functions and stored procedures for server-side logic

**TypeScript query layer (`src/lib/queries/`):**
- Typed query helper functions per domain (e.g. `src/lib/queries/tasks.ts`, `src/lib/queries/calendar.ts`)
- Every function is fully typed against `src/lib/database.types.ts`
- No raw Supabase client code escapes this directory

**Types:**
- After every schema change, runs `generate_typescript_types` and saves output to `src/lib/database.types.ts`

**Edge functions:**
- Server-side logic: task scheduling, calendar sync, smart suggestions
- Deployed via Supabase MCP

### Tools
- `Read`, `Edit`, `Write`, `Bash`
- Full Supabase MCP (`mcp__supabase__*`): `apply_migration`, `execute_sql`, `deploy_edge_function`, `generate_typescript_types`, `get_logs`, `get_advisors`, `list_tables`, `list_migrations`

### Hard Boundaries
- Does **not** touch: React components, CSS, routing, UI layout

---

## Interface Contract

The boundary between the two agents is `src/lib/queries/`:

```
frontend-engineer  →  imports from src/lib/queries/*
backend-engineer   →  writes src/lib/queries/*, src/lib/database.types.ts
```

The frontend agent consumes typed query helpers. It never writes Supabase client calls. The backend agent never writes UI code. This boundary means both agents can work independently on their layer without coordination.

---

## File Ownership Summary

| Path | Owner |
|------|-------|
| `src/components/**` | frontend-engineer |
| `src/pages/**` | frontend-engineer |
| `src/App.tsx`, routing | frontend-engineer |
| `src/index.css`, styling | frontend-engineer |
| `src/hooks/**` | frontend-engineer |
| `src/lib/queries/**` | backend-engineer |
| `src/lib/database.types.ts` | backend-engineer |
| `src/lib/supabase.ts` | backend-engineer |
| `supabase/migrations/**` | backend-engineer |
| `supabase/functions/**` | backend-engineer |

---

## Out of Scope (for now)

- Testing agent
- AI features agent (smart scheduling, prioritization)
- CI/CD agent

These can be added as the project grows.
