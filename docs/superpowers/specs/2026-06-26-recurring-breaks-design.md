# Recurring Breaks — Design Spec

**Date:** 2026-06-26  
**Status:** Approved

## Overview

Users can define recurring break templates (e.g., lunch every day, family time every Sunday). When "Build my day" runs, applicable breaks are injected into the schedule as pinned `block_type: 'break'` blocks. The AI scheduler and the deterministic repair pass both respect them. Users can delete a break instance from the daily schedule via a click modal, and manage templates from the Profile page.

---

## 1. Data Model

### New table: `break_templates`

```sql
CREATE TABLE break_templates (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title                  text NOT NULL,
  start_time             time NOT NULL,
  end_time               time NOT NULL,
  recurrence_type        text NOT NULL CHECK (recurrence_type IN ('date', 'date_range', 'daily', 'weekly')),
  recurrence_date        date,        -- when type = 'date'
  recurrence_date_start  date,        -- when type = 'date_range'
  recurrence_date_end    date,        -- when type = 'date_range'
  recurrence_day_of_week smallint,    -- 0=Sun…6=Sat, when type = 'weekly'
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE break_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own break_templates"
  ON break_templates FOR ALL
  USING (auth.uid() = user_id);
```

### `schedule_blocks` — no changes

Break instances use the existing `block_type: 'break'` and `task_id: null`. Templates define the recurrence; actual blocks are generated fresh each time "Build my day" runs and deleted before re-generating (same as task blocks).

---

## 2. Edge Function — Schedule Generation

`supabase/functions/generate-schedule/index.ts` gains one extra step before calling Gemini:

### Step 1 — Fetch & filter applicable breaks

Query `break_templates` for the user, then evaluate each against today's date:

| `recurrence_type` | Applies when |
|---|---|
| `daily` | Always |
| `weekly` | `recurrence_day_of_week === today.getDay()` |
| `date` | `recurrence_date === today` |
| `date_range` | `recurrence_date_start <= today <= recurrence_date_end` |

### Step 2 — Inject into Gemini prompt

Add a `reserved_times` clause to the prompt:

> "Do NOT place any task during these reserved windows: `[{ title, start_time, end_time }]`"

Gemini's response schema stays unchanged — it returns only task blocks. The reserved times are a constraint, not output.

### Step 3 — Inject into `repairBlocks`

Before packing, pre-seed the repair pass with break blocks (sorted by start time). The cursor skips over them identically to how it skips over fixed-pinned tasks. Break blocks have `block_type: 'break'` and `task_id: null`.

### Step 4 — Insert alongside task blocks

The final `toInsert` array includes both task blocks and break blocks.

### Edge case — no tasks but breaks exist

The current early-return (`if (!tasks || tasks.length === 0) { return [] }`) must be updated: only return early if there are also no applicable breaks for today. If breaks exist but tasks don't, the function should still insert break blocks and return them.

### `AiBlock` type

The `AiBlock` type in the edge function is currently `block_type: 'task'` only. It must be expanded to `'task' | 'break'` so injected break blocks are valid throughout the function.

---

## 3. Task Creation — Conflict Warning

When a user sets `fixed_start` on a task, the Tasks page checks whether the task's full time window `[fixed_start, fixed_start + estimated_minutes)` overlaps with any break template applicable for the task's `scheduled_date`.

**Overlap condition:** `task_start < break_end AND task_end > break_start`

If a conflict is found, a non-blocking warning appears below the `fixed_start` field:

> "שעה זו חופפת להפסקת [title] ([start]–[end])"

The user can still save. `repairBlocks` will push the task after the break regardless.

Break templates are loaded client-side on the Tasks page (one fetch, shared for all conflict checks). The recurrence evaluation uses the task's `scheduled_date` — not today — so a task created today for next Sunday correctly checks Sunday's applicable breaks.

---

## 4. Dashboard — Break Blocks & Delete Modal

### Rendering

Break blocks render in `TimeGrid` with a distinct muted visual style, clearly differentiated from task blocks.

### Click modal

Clicking a break block opens a small popover anchored near the block (Google Calendar style) showing:
- Break title + time range
- "הסר מהיום" button

Clicking "הסר מהיום" deletes **only that `schedule_blocks` row** — the `break_template` is untouched. The block disappears from the grid immediately without triggering a full schedule rebuild.

The modal is delete-or-dismiss only. Editing the recurring template is done from Profile.

---

## 5. Profile Page — Break Management

New section below the day window fields: **"הפסקות קבועות"**.

### List view

Each template row shows: title, time range, recurrence label, edit icon, delete icon.

Recurrence label formatting:
- `daily` → "כל יום"
- `weekly` → "כל [day name]" (e.g., "כל ראשון")
- `date` → formatted date (e.g., "01/07/2026")
- `date_range` → "01/07/2026 – 31/07/2026"

### Add / Edit form

Inline expand (not a separate page or full modal). Fields:

| Field | Type |
|---|---|
| Title | text input |
| Start time | time picker |
| End time | time picker |
| Recurrence type | selector: כל יום / יום בשבוע / תאריך ספציפי / טווח תאריכים |
| Conditional fields | see below |

Conditional fields by recurrence type:
- **כל יום** — none
- **יום בשבוע** — day-of-week dropdown (ראשון–שבת)
- **תאריך ספציפי** — single date picker
- **טווח תאריכים** — start date + end date pickers

Saving calls insert or update via a `break_templates` query helper. Deleting a template removes it entirely — already-inserted `schedule_blocks` break rows are unaffected until the next rebuild.

---

## 6. New Query Helper

`src/lib/queries/breaks.ts` — following the existing query helper pattern:

- `getBreakTemplates(userId)` — fetch all templates for a user
- `createBreakTemplate(userId, data)` — insert
- `updateBreakTemplate(id, data)` — update
- `deleteBreakTemplate(id)` — delete

All functions throw on error, typed against `database.types.ts`.

---

## Layer Changes Summary

| Layer | Change |
|---|---|
| `supabase/migrations/` | New migration: `break_templates` table + RLS |
| `src/lib/database.types.ts` | Regenerated after migration |
| `src/lib/types.ts` | Add `BreakTemplate` type |
| `src/lib/queries/breaks.ts` | New file — CRUD helpers |
| `supabase/functions/generate-schedule/index.ts` | Fetch breaks, inject into prompt + repairBlocks |
| `src/pages/Tasks.tsx` | Conflict warning on fixed_start + duration |
| `src/pages/Profile.tsx` | New "הפסקות קבועות" section |
| `src/components/TimeGrid.tsx` | Break block visual style + click handler |
| `src/components/` | New `BreakModal.tsx` — delete popover |
