# Per-Day Tasks — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

Tasks have no concept of a day. A task is only `pending` or `done`. The
`generate-schedule` edge function fetches **every** pending task and schedules
it into whatever day is built, so an unfinished task reappears on every future
"Build my day." The desired behavior is the opposite: each task belongs to a
specific day, and if it is not finished that day it should **not** carry over.

## Goal

- Each task is bound to a single day (`task_date`).
- "Build my day" for a date schedules only that date's pending tasks.
- An unfinished task stays on its own day as an incomplete historical record. It
  never appears on a later day automatically.
- The user can deliberately pull a past unfinished task forward with a
  **"move to today"** action. Nothing auto-moves.

## Non-goals

- No automatic/background rollover or midnight sweep.
- No deletion of unfinished past tasks.
- No change to `deadline` or `fixed_start` semantics (they remain per-task).

## Approach

Add a `task_date` column to the `tasks` table as the single source of truth for
a task's day.

Rejected alternative: deriving a task's day from its `schedule_blocks`. That
fails for tasks that were never scheduled and couples task identity to schedule
state. A dedicated column is queryable and unambiguous.

## Schema (backend-engineer)

Migration on `tasks`:

```sql
ALTER TABLE tasks
  ADD COLUMN task_date date NOT NULL DEFAULT current_date;
```

- The `DEFAULT current_date` backfills all existing rows to **today**, so no
  currently-added task disappears under the new model.
- RLS already restricts `tasks` to `auth.uid() = user_id`; no policy change.
- Regenerate `src/lib/database.types.ts`.
- Add `task_date: string  // "YYYY-MM-DD"` to the `Task` type in
  `src/lib/types.ts`.

## Backend behavior

### Edge function — `supabase/functions/generate-schedule/index.ts`

The core fix. The pending-task fetch gains a date filter:

```diff
- supabase.from('tasks').select('*').eq('user_id', userId).eq('status', 'pending'),
+ supabase.from('tasks').select('*').eq('user_id', userId).eq('status', 'pending').eq('task_date', today),
```

`today` already resolves to the requested `body.date` (or the server date).
Only that day's pending tasks are scheduled; nothing carries forward. The
delete-then-insert of that date's `schedule_blocks` is unchanged.

Redeploy: `supabase functions deploy generate-schedule`.

### Query helpers — `src/lib/queries/tasks.ts`

- `fetchTasksForDate(userId, date)` — `tasks` filtered by `task_date = date`,
  ordered by `created_at desc`. Replaces the flat `fetchTasks` for the
  day-filtered `/tasks` view.
- `fetchPendingTasks(userId, date)` — gains a `date` arg; adds
  `.eq('task_date', date)`. Dashboard's pending list and upcoming panel then
  reflect the viewed day.
- `createTask(userId, input)` — `input` accepts optional `task_date`; when
  omitted, defaults to today (computed client-side via the existing
  `todayStr()` / `dateUtils`). Insert includes `task_date`.
- `updateTask(id, input)` — `input` accepts optional `task_date` (enables
  editing a task's day from the form).
- `moveTaskToDate(id, date)` — thin wrapper over `updateTask({ task_date: date })`,
  used by the "move to today" button.

## Frontend (frontend-engineer)

### `/tasks` page — `src/pages/Tasks.tsx`

- Add `selectedDate` state (default `todayStr()`) and render `DateNav` locked
  to `day` view: pass `view="day"` and an `onViewChange` no-op (the week/month
  toggle is irrelevant on this page; hide it via CSS or simply ignore it).
- Load via `fetchTasksForDate(userId, selectedDate)`; reload on date change.
- `TaskForm.tsx` gains a **date picker** (`<input type="date">`) defaulting to
  today but freely settable to any **future** (or past) date, so a task can be
  planned ahead — e.g. create today a task that belongs to next Monday. The
  picker pre-fills with the page's `selectedDate` when one is in focus, else
  today. The submitted value flows through `createTask` / `updateTask` as
  `task_date`. A created future task does not appear in today's list — it
  surfaces when you navigate to its day (or build that day).
- `TaskList.tsx`: when the selected day is in the **past** (`selectedDate <
  todayStr()`) and a task is `pending`, show a **"move to today"** button that
  calls `moveTaskToDate(id, todayStr())` then reloads. Nothing auto-moves.

### Dashboard — `src/pages/Dashboard.tsx`

- Pass `selectedDate` into `fetchPendingTasks(uid, selectedDate)` (two call
  sites: initial `loadData` and the post-`generateSchedule` refresh) so the
  day's task pool is consistent with the grid.

## Behavior summary

| Action | Result |
|---|---|
| Create a task | Assigned to today (or the date set in the form). |
| Leave it unfinished | Stays on its day as incomplete; does **not** appear tomorrow. |
| Want it done later | Navigate to that day in `/tasks`, hit "move to today." |
| Build my day for date D | Schedules only date D's pending tasks. |
| Existing tasks (migration) | Backfilled to today. |

## Testing / validation

No automated tests in this repo — validation is visual via browser automation
(frontend-engineer) plus a manual backend check:

1. Migration applies; existing tasks show `task_date = today`.
2. Create a task for today → appears today; build day schedules it.
3. Navigate `/tasks` to tomorrow → today's task is absent; add one for tomorrow.
4. Build tomorrow → only tomorrow's task scheduled.
5. Leave a task unfinished, advance a day → it does not appear; "move to today"
   on its original day pulls it forward.

## Files touched

- `supabase/migrations/<new>_add_task_date.sql` (new)
- `supabase/functions/generate-schedule/index.ts`
- `src/lib/database.types.ts` (regenerated)
- `src/lib/types.ts`
- `src/lib/queries/tasks.ts`
- `src/pages/Tasks.tsx`
- `src/components/TaskForm.tsx` (date field)
- `src/components/TaskList.tsx` ("move to today" button)
- `src/pages/Dashboard.tsx`
