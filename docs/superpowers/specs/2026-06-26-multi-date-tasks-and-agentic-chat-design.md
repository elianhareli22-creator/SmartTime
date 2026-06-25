# Multi-date tasks, schedule-overflow fix, and multi-date agentic chat

**Date:** 2026-06-26
**Status:** Approved (design)

## Problem

Three related issues, all rooted in the app having no per-day concept of which tasks belong to which day:

1. **Tasks silently disappear from the schedule.** `generate-schedule` fetches *all*
   `status='pending'` tasks (no date filter) and packs them into one day window
   (`day_start`–`day_end`). When tasks + breaks exceed the window, the overflow is
   silently dropped — both the packing loop (`if (e > dayEndMin) continue`) and the
   deterministic fallback (`if (e <= dayEndMin)`). The user gets no feedback, so it
   looks like "sometimes tasks don't show". It only happens once a day fills up, hence
   "sometimes".

2. **Chat is hardcoded to today.** The `chat` edge function fetches blocks
   `.eq('date', today)`, the system prompt lists only today's blocks, and
   `move_block` / `generate_schedule` act on today only. The user wants to ask about
   and act on other dates.

3. **Timezone bug in chat.** `Chat.tsx` computes `today` via `toISOString()` (UTC),
   inconsistent with the timezone-safe `todayStr()` used everywhere else. Between
   midnight and ~03:00 Israel time the chat targets the previous day.

## Decisions (from brainstorming)

- **Date model:** Bind each task to a specific day via a new `scheduled_date` column.
- **Overflow handling:** Schedule only that date's tasks. If they overflow the day
  window, drop the extras from the schedule **but** return them so the UI warns the
  user. No silent drop. No carryover of past-due tasks.
- **Chat dates:** Natural language with today as the anchor — the model resolves
  "tomorrow" / "Thursday" relative to today. Chat stays on its own `/chat` page; no
  shared selected-date state with the dashboard.

## Design

### 1. Schema migration (backend-engineer)

Add a date column to `tasks`:

```sql
ALTER TABLE public.tasks
  ADD COLUMN scheduled_date date NOT NULL DEFAULT CURRENT_DATE;
-- Existing rows get CURRENT_DATE via the default; no separate backfill needed.
```

- Column is `NOT NULL DEFAULT CURRENT_DATE` so new tasks default to "today" and the
  6 existing rows are backfilled by the default.
- RLS unchanged (existing `auth.uid() = user_id` policy covers the new column).
- Workflow: migration → `apply_migration` → `generate_typescript_types` → overwrite
  `src/lib/database.types.ts` → update `src/lib/types.ts` `Task` type with
  `scheduled_date: string` → update query helpers. All in one commit.

### 2. `generate-schedule` edge function (backend-engineer)

- **Task query** changes from `.eq('status','pending')` to
  `.eq('status','pending').eq('scheduled_date', today)` where `today` is the request's
  target date (already parsed from `body.date`, defaulting to the server's current date).
- **Surface overflow instead of dropping silently:** after `repairBlocks`, build the
  set of `task_id`s that received a block. Any of that day's pending tasks not in the
  set is "unscheduled". Return:

  ```json
  { "blocks": [...], "unscheduled": [{ "id", "title", "estimated_minutes" }] }
  ```

  The schedule itself still only contains what fits (the user chose "drop with
  warning"). The empty-tasks early-return path returns `unscheduled: []`.

### 3. `chat` edge function (backend-engineer)

- **New read tool `get_schedule`** with one required `date` (YYYY-MM-DD) param. Returns
  that date's blocks (id, title, start/end, type, task_id) as the tool result. This is
  how the model answers "what's on Thursday?" and how it discovers block IDs before
  editing a non-today day. Relies on the existing 5-round agent loop for
  read-then-act chains.
- **`generate_schedule` tool** gains an optional `date` param (default = today). When
  set, the inner call to the generate-schedule function passes `{ date }`.
- **`create_task` / `update_task` tools** gain an optional `scheduled_date` param so the
  model can add/build for a specific day. `executeTool` writes it when present;
  `create_task` omitting it falls back to the DB default (today).
- **System instruction:** keep today's task + block snapshot inline. Add an explicit
  "today is `<date>`" anchor and instruct the model to resolve relative Hebrew dates
  ("מחר", "מחרתיים", "יום חמישי") against it, and to call `get_schedule(date)` for any
  day other than today. The inline task list now shows each task's `scheduled_date`.
- `move_block` / `delete_task` are unchanged (global ID); the model finds IDs via the
  inline snapshot or `get_schedule`.

### 4. Frontend (frontend-engineer)

- **`Chat.tsx`:** replace `now.toISOString().split('T')[0]` with `todayStr()` from
  `dateUtils` so chat agrees with the rest of the app.
- **`TaskForm`:** add a `scheduled_date` date picker. Default value = the date passed in
  from the dashboard's `selectedDate` (falls back to `todayStr()`).
- **Query helpers (`src/lib/queries/tasks.ts`):** `createTask` / `updateTask` accept and
  write `scheduled_date`. Replace `fetchPendingTasks(uid)` with
  `fetchPendingTasksForDate(uid, date)` (`.eq('scheduled_date', date)`).
- **`generateSchedule()` helper** returns `{ blocks, unscheduled }` instead of just
  `blocks`.
- **`Dashboard.tsx`:** pass `selectedDate` to `fetchPendingTasksForDate` and `TaskForm`;
  render a warning banner after a build listing any `unscheduled` task titles
  (e.g. "המשימות הבאות לא נכנסו ליום: …"). Clear it on date change / next build.

## Data flow

```
Build my day (date D)
  Dashboard.handleGenerate(D)
    → generateSchedule(D)  POST { date: D }
        → generate-schedule: pending tasks WHERE scheduled_date = D
          → AI/deterministic → repairBlocks → insert blocks for D
          → unscheduled = pending-for-D tasks with no block
        ← { blocks, unscheduled }
    → setBlocks(blocks); if unscheduled.length → warning banner

Chat "build tomorrow" / "what's on Thursday?" / "move my 3pm Thursday"
  Chat.tsx (today = todayStr()) → chat fn
    → model resolves relative date, optionally get_schedule(date),
      then generate_schedule({date}) / move_block / update_task({scheduled_date})
    ← reply + actionsPerformed
```

## Components / boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `tasks.scheduled_date` | Binds a task to a day | migration |
| `generate-schedule` | Schedule one day's tasks; report overflow | tasks.scheduled_date |
| `chat` | Multi-date Q&A + actions via tools | get_schedule, generate-schedule, tasks |
| `queries/tasks.ts` | Date-scoped task reads/writes | types |
| `queries/schedule.ts` | `generateSchedule` returns unscheduled | — |
| `TaskForm` | Capture scheduled_date | queries/tasks |
| `Dashboard` | Show day's pending tasks + overflow warning | queries |
| `Chat.tsx` | Timezone-correct `today` | dateUtils |

## Error handling

- Generate-schedule overflow is **not** an error — it's reported via `unscheduled`.
- `get_schedule` for a date with no blocks returns an empty list (not an error).
- Existing chat error handling (Gemini quota/5xx, 401) is unchanged.
- `scheduled_date` is server-validated by the date column type; the chat tool should
  pass `YYYY-MM-DD` and rely on the existing per-tool try/catch to report bad input.

## Testing / verification

No automated tests in this repo — verification is manual + browser automation:

1. Create >1 day's worth of tasks for one date → Build → schedule fills, warning lists
   the overflow tasks; none silently vanish.
2. Create tasks on different dates → Build on each date schedules only that date's tasks.
3. Chat: "מה יש לי ביום חמישי?" → reads Thursday's blocks. "תבנה לי את המחר" → builds
   tomorrow. "תזיז את הפגישה ב-15:00 ביום חמישי לשעה 16:00" → moves the right block.
4. Late-night check: chat's `today` matches the dashboard's date (timezone fix).

## Out of scope (YAGNI)

- Past-due task carryover.
- Sharing the dashboard's selected date into the chat page.
- Recurring tasks, drag-to-reschedule across days, multi-day spill of overflow.
