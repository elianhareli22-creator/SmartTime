# Calendar Views — Design Spec
_Date: 2026-06-26_

## Overview

Add date navigation and three schedule views (Day / Week / Month) to the Dashboard, plus a pending-tasks panel on the Day view so users can see what will be scheduled before hitting "Build My Day."

Tasks remain dateless. A scheduled date is only meaningful on `schedule_blocks`, which already carry a `date` column. "Build My Day" schedules the **selected date**, not always today.

---

## User Flow

1. Dashboard opens on today in Day view.
2. User sees pending tasks panel → knows what tasks exist.
3. User hits "Build My Day" → AI schedules the selected date.
4. User switches to Week or Month view → sees colored blocks across days.
5. User clicks any day column/cell → jumps to Day view for that date.
6. Prev/Next arrows navigate by day, week, or month depending on active view.

---

## State (Dashboard)

```ts
selectedDate: string   // YYYY-MM-DD, defaults to today
view: 'day' | 'week' | 'month'
```

All data fetches key off `selectedDate`. Changing `selectedDate` or `view` triggers a re-fetch.

---

## Components

### `DateNav`
Header strip shared across all views.

```
← [Jun 26, Thu]  →      [ Day | Week | Month ]
```

- Prev/Next move by 1 day (Day view), 7 days (Week view), or 1 month (Month view).
- Toggle pill switches `view`; `selectedDate` is preserved.
- Placed above the view area, below the page header.

---

### Day View (enhanced existing)

```
[ Pending Tasks ▾ ]
  • Write report       45 min   [high]
  • Review PR          20 min   [medium]
[ Build My Day ✨ ]
[ Time grid ]
```

- **Pending tasks panel** — collapsible strip. Fetches all tasks with `status = 'pending'`. Shows title, estimated duration, priority badge. Read-only.
- **Time grid** — unchanged component, receives blocks for `selectedDate`.
- **"Build My Day"** — calls `generateSchedule(selectedDate)`.
- **UpcomingPanel** — unchanged, shown below time grid.

---

### Week View

- 7 columns, Mon–Sun, anchored to the week containing `selectedDate`.
- Shared time axis on the left (same hour markers as Day view).
- Each column: day label + date at top, then colored block bars at their actual vertical time positions.
- Today's column highlighted with a distinct background.
- Clicking any column → sets `selectedDate` to that date and `view = 'day'`.
- Prev/Next moves the entire week ±7 days.

---

### Month View

- Standard calendar grid: rows of 7 days (Mon–Sun), covering the full calendar month of `selectedDate`.
- Each day cell: date number + up to 3 mini block pills (colored, title truncated to ~15 chars).
- If a day has more than 3 blocks: "+N more" label.
- Today's cell highlighted.
- Clicking any cell → sets `selectedDate` to that date and `view = 'day'`.
- Prev/Next moves ±1 month; `selectedDate` snaps to the 1st of the new month if the current date falls outside it.

---

## Data Layer

### `src/lib/queries/schedule.ts`

| Old | New | Change |
|---|---|---|
| `fetchTodayBlocks(userId)` | `fetchBlocksForDate(userId, date)` | Parameterize `date` instead of hardcoding today |
| — | `fetchBlocksForRange(userId, startDate, endDate)` | New — fetches all blocks where `date >= startDate AND date <= endDate`; used by Week and Month views |

### `src/lib/queries/tasks.ts`

| Function | Change |
|---|---|
| `fetchPendingTasks(userId)` | New — same as `fetchTasks` but adds `.eq('status', 'pending')`; used by the tasks panel |

### Edge Function (`generate-schedule`)

- Accepts optional `date` field in the JSON request body.
- Falls back to today (`new Date().toISOString().split('T')[0]`) if `date` is omitted.
- All `schedule_blocks` inserts use the received date instead of hardcoded today.

### DB

No schema changes. `schedule_blocks.date` already exists.

---

## Error Handling

- Week/Month fetches: if query fails, show an inline error banner; don't crash the view.
- Day view "Build My Day" error handling unchanged (existing error banner).
- Pending tasks panel: if fetch fails, hide the panel silently (non-critical path).

---

## Out of Scope

- Drag-and-drop tasks onto time slots.
- "Build Week" or "Build Month" (bulk scheduling).
- Task date fields.
- Mobile-specific layouts (RTL already handled by existing CSS).
