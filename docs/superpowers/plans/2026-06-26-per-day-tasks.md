> **SUPERSEDED (2026-06-26)** by `2026-06-26-multi-date-tasks-and-agentic-chat.md`, which folds in this plan's unique pieces (Tasks-page day nav + move-to-today). Do not execute this file.

# Per-Day Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind every task to a single day so unfinished tasks stay on their own day instead of leaking into every future "Build my day", with a manual "move to today" action and a date picker for planning ahead.

**Architecture:** Add a `task_date` column to the `tasks` table as the source of truth for a task's day. The `generate-schedule` edge function filters pending tasks by that date. The `/tasks` page gains day navigation and a date picker; unfinished tasks on a past day get a "move to today" button.

**Tech Stack:** Supabase (Postgres + Deno edge function), React 19 + TypeScript + Vite, RTL Hebrew UI.

## Global Constraints

- **No test framework exists.** Verification per task is `npm run build` (runs `tsc -b`), `npm run lint` (oxlint, no `--fix`), and browser/visual validation. Do not scaffold a test runner.
- **RTL-first:** CSS uses logical properties only (`margin-inline-start`, etc.) — never `left`/`right`.
- **Query-helper pattern:** All Supabase access lives in `src/lib/queries/*.ts`. Helpers `throw error` on failure and are typed against `database.types.ts`. Components never import the raw Supabase client.
- **Schema-change workflow:** migration → `apply_migration` → `generate_typescript_types` → overwrite `src/lib/database.types.ts` → update query helpers — in one commit.
- **`database.types.ts` is generated** — never hand-edit; regenerate it.
- **Date strings** are `"YYYY-MM-DD"`; use `todayStr()` / `addDays()` / `isToday()` from `src/lib/dateUtils.ts`. Never construct dates with `new Date()` without the `+ 'T00:00:00'` guard (timezone-safety).
- Hebrew UI copy — match the existing tone in `TaskForm.tsx` / `TaskList.tsx`.

---

### Task 1: Schema migration + Task type

Add the `task_date` column, regenerate DB types, extend the `Task` domain type. Existing rows backfill to today via `DEFAULT current_date` (a `NOT NULL` column added with a default fills existing rows with that default).

**Files:**
- Create: `supabase/migrations/<timestamp>_add_task_date.sql` (applied via MCP, written for the record)
- Modify: `src/lib/database.types.ts` (regenerated — overwrite whole file)
- Modify: `src/lib/types.ts:8-18` (the `Task` type)

**Interfaces:**
- Produces: `tasks.task_date` column (`date`, `NOT NULL`, default `current_date`); `Task.task_date: string` field.

- [ ] **Step 1: Apply the migration**

Use the Supabase `apply_migration` tool with name `add_task_date` and SQL:

```sql
ALTER TABLE tasks
  ADD COLUMN task_date date NOT NULL DEFAULT current_date;
```

- [ ] **Step 2: Verify the column and backfill**

Run via the Supabase `execute_sql` tool:

```sql
SELECT id, status, task_date FROM tasks ORDER BY created_at DESC LIMIT 5;
```

Expected: every existing row has `task_date` equal to today's date.

- [ ] **Step 3: Regenerate TypeScript types**

Use the Supabase `generate_typescript_types` tool and overwrite the entire contents of `src/lib/database.types.ts` with the output. Confirm the generated `tasks` `Row` now includes `task_date: string`.

- [ ] **Step 4: Add `task_date` to the domain `Task` type**

In `src/lib/types.ts`, add the field to the `Task` type (after `status`):

```ts
export type Task = {
  id: string
  user_id: string
  title: string
  estimated_minutes: number
  priority: 'low' | 'medium' | 'high'
  deadline: string | null
  fixed_start: string | null  // "HH:MM:SS"
  status: 'pending' | 'done'
  task_date: string  // "YYYY-MM-DD"
  created_at: string
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS (no TypeScript errors).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations src/lib/database.types.ts src/lib/types.ts
git commit -m "feat: add task_date column and Task type field"
```

---

### Task 2: Query helpers + edge function filter

Make the data layer day-aware: filter fetches by `task_date`, accept `task_date` on writes, add `moveTaskToDate`, and — the core behavioral fix — filter the edge function's pending-task fetch by the requested date.

**Files:**
- Modify: `src/lib/queries/tasks.ts`
- Modify: `supabase/functions/generate-schedule/index.ts:43`

**Interfaces:**
- Consumes: `Task.task_date` (Task 1).
- Produces:
  - `fetchTasksForDate(userId: string, date: string): Promise<Task[]>`
  - `fetchPendingTasks(userId: string, date: string): Promise<Task[]>` (now requires `date`)
  - `createTask(userId, input)` where `input` gains `task_date: string`
  - `updateTask(id, input)` where `input` gains optional `task_date?: string`
  - `moveTaskToDate(id: string, date: string): Promise<Task>`

- [ ] **Step 1: Add `fetchTasksForDate` and update `fetchPendingTasks`**

In `src/lib/queries/tasks.ts`, replace the existing `fetchPendingTasks` (lines 74-83) and add `fetchTasksForDate` next to `fetchTasks`:

```ts
export async function fetchTasksForDate(userId: string, date: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('task_date', date)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Task[]
}

export async function fetchPendingTasks(userId: string, date: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('task_date', date)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Task[]
}
```

- [ ] **Step 2: Add `task_date` to `createTask` and `updateTask`, add `moveTaskToDate`**

In `src/lib/queries/tasks.ts`, change the `createTask` `input` type to include `task_date: string` (the `insert` already spreads `...input`, so no body change). Change the `updateTask` `input` type to include `task_date?: string`. Then append `moveTaskToDate`:

```ts
export async function createTask(
  userId: string,
  input: {
    title: string
    estimated_minutes: number
    priority: 'low' | 'medium' | 'high'
    deadline?: string | null
    fixed_start?: string | null
    task_date: string
  }
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data as Task
}

export async function updateTask(
  id: string,
  input: {
    title?: string
    estimated_minutes?: number
    priority?: 'low' | 'medium' | 'high'
    deadline?: string | null
    fixed_start?: string | null
    task_date?: string
  }
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Task
}

export async function moveTaskToDate(id: string, date: string): Promise<Task> {
  return updateTask(id, { task_date: date })
}
```

- [ ] **Step 3: Filter the edge function's pending-task fetch by date**

In `supabase/functions/generate-schedule/index.ts`, line 43, add the `task_date` filter (`today` already resolves to `body.date` or the server date):

```ts
        supabase.from('tasks').select('*').eq('user_id', userId).eq('status', 'pending').eq('task_date', today),
```

- [ ] **Step 4: Deploy the edge function**

Use the Supabase `deploy_edge_function` tool for `generate-schedule` (or `supabase functions deploy generate-schedule`).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: This will FAIL at the `fetchPendingTasks` call sites in `Dashboard.tsx` (now missing the `date` arg) — that is expected and fixed in Task 5. Confirm the ONLY errors are the two `fetchPendingTasks` call sites in `src/pages/Dashboard.tsx`. If any other file errors, fix it before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/tasks.ts supabase/functions/generate-schedule/index.ts
git commit -m "feat: day-filter task queries and schedule generation"
```

---

### Task 3: TaskForm date picker

Add a date field to the task form, defaulting to a passed-in date (the page's selected day) and freely settable to any future or past date.

**Files:**
- Modify: `src/components/TaskForm.tsx`

**Interfaces:**
- Consumes: `createTask`/`updateTask` `task_date` (Task 2), `Task.task_date` (Task 1).
- Produces: `TaskForm` gains a required `defaultDate: string` prop; its `onSubmit` payload gains `task_date: string`.

- [ ] **Step 1: Add `task_date` to form state and the onSubmit contract**

In `src/components/TaskForm.tsx`:

- Add `task_date: string` to the `FormData` type.
- Add `task_date: string` to the `onSubmit` payload type in `Props`.
- Add `defaultDate: string` to `Props`.
- Remove the module-level `EMPTY` constant and instead build empties from `defaultDate` inside the component (so the date pre-fills correctly). Replace the destructure and `EMPTY` usage:

```ts
type Props = {
  editTarget: Task | null
  defaultDate: string
  onSubmit: (data: {
    title: string
    estimated_minutes: number
    priority: 'low' | 'medium' | 'high'
    deadline: string | null
    fixed_start: string | null
    task_date: string
  }) => Promise<void>
  onCancel: () => void
  loading: boolean
}

export default function TaskForm({ editTarget, defaultDate, onSubmit, onCancel, loading }: Props) {
  const empty: FormData = {
    title: '',
    estimated_minutes: '30',
    priority: 'medium',
    deadline: '',
    fixed_start: '',
    task_date: defaultDate,
  }
  const [form, setForm] = useState<FormData>(empty)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
```

- [ ] **Step 2: Prefill `task_date` on edit and reset, and submit it**

Update the `useEffect` that syncs `editTarget`: in the edit branch add `task_date: editTarget.task_date`, and replace the `else { setForm(EMPTY) }` with `else { setForm(empty) }`. Add `defaultDate` to the effect's dependency array. In `handleSubmit`, add `task_date: form.task_date` to the `onSubmit` argument and replace the post-submit `setForm(EMPTY)` with `setForm(empty)`:

```ts
  useEffect(() => {
    if (editTarget) {
      setForm({
        title: editTarget.title,
        estimated_minutes: String(editTarget.estimated_minutes),
        priority: editTarget.priority as 'low' | 'medium' | 'high',
        deadline: editTarget.deadline ? editTarget.deadline.slice(0, 16) : '',
        fixed_start: editTarget.fixed_start ? editTarget.fixed_start.slice(0, 5) : '',
        task_date: editTarget.task_date,
      })
    } else {
      setForm(empty)
    }
    setErrors({})
  }, [editTarget, defaultDate])
```

```ts
    await onSubmit({
      title: form.title.trim(),
      estimated_minutes: parseInt(form.estimated_minutes),
      priority: form.priority,
      deadline: form.deadline || null,
      fixed_start: form.fixed_start || null,
      task_date: form.task_date,
    })
    setForm(empty)
    setErrors({})
```

- [ ] **Step 3: Render the date picker field**

In the JSX, add a date field directly after the `title` field block (before `estimated_minutes`):

```tsx
      {field('task_date', 'תאריך *',
        <input
          className="form-input"
          type="date"
          value={form.task_date}
          onChange={e => setForm(f => ({ ...f, task_date: e.target.value }))}
        />
      )}
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build`
Expected: FAIL only at `src/pages/Tasks.tsx` (`TaskForm` now requires `defaultDate`) and the Dashboard `fetchPendingTasks` sites — both fixed in later tasks. Confirm no errors inside `TaskForm.tsx` itself.

- [ ] **Step 5: Commit**

```bash
git add src/components/TaskForm.tsx
git commit -m "feat: add date picker to TaskForm"
```

---

### Task 4: Tasks page — day navigation + filter + move-to-today

Give `/tasks` a day focus: a `DateNav` to switch days, day-filtered loading, the form pre-filled to the viewed day, and a "move to today" button on past unfinished tasks.

**Files:**
- Modify: `src/pages/Tasks.tsx`
- Modify: `src/components/TaskList.tsx`

**Interfaces:**
- Consumes: `fetchTasksForDate`, `moveTaskToDate`, `createTask`, `updateTask` (Task 2); `TaskForm` `defaultDate` (Task 3); `DateNav` (existing); `todayStr` (existing).
- Produces: `TaskList` gains an optional `onMoveToToday?: (id: string) => Promise<void>` prop.

- [ ] **Step 1: Add "move to today" to TaskList**

In `src/components/TaskList.tsx`, add the prop and render the button for pending tasks when the handler is provided. Update `Props`:

```ts
type Props = {
  tasks: Task[]
  onEdit: (task: Task) => void
  onDelete: (id: string) => Promise<void>
  onMoveToToday?: (id: string) => Promise<void>
}
```

Destructure `onMoveToToday` and, inside the non-confirm `<>...</>` action branch (alongside the עריכה/מחק buttons), add:

```tsx
                {onMoveToToday && task.status === 'pending' && (
                  <button className="btn-link" onClick={() => onMoveToToday(task.id)}>
                    העבר להיום
                  </button>
                )}
```

- [ ] **Step 2: Add day state, DateNav, and day-filtered loading to Tasks page**

Rewrite `src/pages/Tasks.tsx` to track `selectedDate`, render `DateNav` locked to day view, load via `fetchTasksForDate`, pass `defaultDate` to the form, and wire move-to-today only when viewing a past day:

```tsx
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import DateNav from '../components/DateNav'
import TaskForm from '../components/TaskForm'
import TaskList from '../components/TaskList'
import { fetchTasksForDate, createTask, updateTask, deleteTask, moveTaskToDate } from '../lib/queries/tasks'
import { todayStr } from '../lib/dateUtils'
import type { Task } from '../lib/types'

export default function Tasks() {
  const { userId } = useAuth()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Task | null>(null)

  async function loadTasks() {
    if (!userId) return
    setLoading(true)
    try {
      setTasks(await fetchTasksForDate(userId, selectedDate))
    } catch {
      setError('שגיאה בטעינת משימות')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTasks() }, [userId, selectedDate])

  async function handleSubmit(data: Parameters<typeof createTask>[1]) {
    if (!userId) return
    setSaving(true)
    setError(null)
    try {
      if (editTarget) {
        await updateTask(editTarget.id, data)
        setEditTarget(null)
      } else {
        await createTask(userId, data)
      }
      await loadTasks()
    } catch {
      setError('שגיאה בשמירת המשימה')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteTask(id)
      await loadTasks()
    } catch {
      setError('שגיאה במחיקת המשימה')
    }
  }

  async function handleMoveToToday(id: string) {
    setError(null)
    try {
      await moveTaskToDate(id, todayStr())
      await loadTasks()
    } catch {
      setError('שגיאה בהעברת המשימה')
    }
  }

  const isPast = selectedDate < todayStr()

  return (
    <div className="page tasks-page">
      <h2>המשימות שלי</h2>
      <DateNav
        date={selectedDate}
        view="day"
        onDateChange={setSelectedDate}
        onViewChange={() => {}}
      />
      {error && <div className="error-banner">{error}</div>}
      <div className="tasks-layout">
        <div className="tasks-list-col">
          {loading ? (
            <p className="loading-text">טוען...</p>
          ) : (
            <TaskList
              tasks={tasks}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onMoveToToday={isPast ? handleMoveToToday : undefined}
            />
          )}
        </div>
        <div className="tasks-form-col">
          <TaskForm
            editTarget={editTarget}
            defaultDate={selectedDate}
            onSubmit={handleSubmit}
            onCancel={() => setEditTarget(null)}
            loading={saving}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Hide the view toggle on the Tasks page**

The `DateNav` renders a day/week/month toggle that is meaningless here. In `src/App.css`, scope it out for this page (logical properties only — this is just `display`):

```css
.tasks-page .view-toggle {
  display: none;
}
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: Build still fails ONLY at the Dashboard `fetchPendingTasks` sites (Task 5). `Tasks.tsx`, `TaskList.tsx`, `TaskForm.tsx` produce no errors. Lint is clean for the changed files.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Tasks.tsx src/components/TaskList.tsx src/App.css
git commit -m "feat: day navigation, date-filtered tasks, move-to-today"
```

---

### Task 5: Dashboard — day-scoped pending tasks

Pass the selected day into `fetchPendingTasks` at both call sites so the dashboard's task pool matches the grid's day. This clears the remaining build errors.

**Files:**
- Modify: `src/pages/Dashboard.tsx:43` and `src/pages/Dashboard.tsx:104`

**Interfaces:**
- Consumes: `fetchPendingTasks(uid, date)` (Task 2).

- [ ] **Step 1: Pass `date` in the day-view load**

In `src/pages/Dashboard.tsx`, the `loadData` day branch (~line 43) calls `fetchPendingTasks(uid)` — change it to pass the `date` parameter already in scope:

```ts
        const [dayBlocks, tasks] = await Promise.all([
          fetchBlocksForDate(uid, date),
          fetchPendingTasks(uid, date),
        ])
```

- [ ] **Step 2: Pass `selectedDate` in the post-generate refresh**

In the "Build my day" handler (~line 104), change `fetchPendingTasks(userId)` to:

```ts
      setPendingTasks(await fetchPendingTasks(userId, selectedDate))
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS — no TypeScript errors anywhere, lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: scope dashboard pending tasks to selected day"
```

---

### Task 6: End-to-end visual validation

No automated tests — validate the whole flow in the browser (frontend-engineer via browser automation, or manually with `npm run dev`).

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (serves at http://localhost:5173).

- [ ] **Step 2: Validate creation + same-day scheduling**

On `/tasks` (today selected): the date picker defaults to today. Create a task. It appears in today's list. Go to `/dashboard`, "Build my day" → the task is scheduled.

- [ ] **Step 3: Validate future planning**

On `/tasks`, set the date picker to a future date and create a task. It does NOT appear in today's list. Use `DateNav` to advance to that day → the task appears there. The view toggle (week/month) is hidden.

- [ ] **Step 4: Validate no auto-rollover**

Navigate `DateNav` back to a past day that has a pending task. Confirm: the task shows there, today's list does NOT show it, and the **"העבר להיום" (move to today)** button is present on the pending past task. Click it → the task leaves the past day and appears on today.

- [ ] **Step 5: Validate build-day isolation**

On `/dashboard`, build a future day that has its own task and confirm only that day's task is scheduled — past unfinished tasks never appear. Confirm an unfinished task from a prior day does not get scheduled into a later day's build.

- [ ] **Step 6: Final commit (if any validation fixups were needed)**

```bash
git add -A
git commit -m "fix: per-day tasks validation fixups"
```

(Skip if no changes were required.)
