# Multi-date Tasks, Schedule-Overflow Fix, and Multi-date Agentic Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind every task to a specific day, stop the schedule generator from silently dropping tasks that don't fit, and let the chat assistant read and act on any date (not just today).

**Architecture:** Add a `scheduled_date` column to `tasks`. `generate-schedule` schedules only the target day's pending tasks and returns the ones that didn't fit so the UI can warn. The `chat` edge function gains a `get_schedule(date)` read tool plus date parameters on its action tools, and the agent loop resolves relative dates against "today".

**Tech Stack:** Supabase (Postgres + Deno edge functions), Gemini 3.1 Flash Lite, React 19 + TypeScript + Vite. Hebrew/RTL UI.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-26-multi-date-tasks-and-agentic-chat-design.md`
- **No automated test framework** — verification = `npm run build`, `npm run lint` (oxlint, no `--fix`), SQL checks via Supabase, and browser automation. Do NOT scaffold a test runner.
- **Query-helper pattern:** all DB access lives in `src/lib/queries/*.ts`; components/pages never call `supabase` directly. Helpers `throw error` and use `.single()` for single rows.
- **RTL-first CSS:** logical properties only (`margin-inline-*`, `inset-inline-*`); never hardcode `left`/`right`.
- **Times are "HH:MM:SS" / "HH:MM"** from the DB; dates are "YYYY-MM-DD". Use `todayStr()` / `dateUtils` for local-date math — never `toISOString()` for calendar dates.
- **Edge function deploy:** `supabase functions deploy <name>` (or the `deploy_edge_function` MCP tool) after changes.
- **Schema-change workflow:** migration → `apply_migration` → `generate_typescript_types` → overwrite `src/lib/database.types.ts` → update `src/lib/types.ts` + query helpers — one commit.
- **Gemini URL in use:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=...` (keep as-is; do not change the model).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/<ts>_add_scheduled_date_to_tasks.sql` | Create | Add `scheduled_date` column |
| `src/lib/database.types.ts` | Create/overwrite | Generated DB types (referenced by CLAUDE.md; regenerate) |
| `src/lib/types.ts` | Modify | Add `scheduled_date` to `Task` |
| `supabase/functions/generate-schedule/index.ts` | Modify | Date-filter tasks; return `unscheduled` |
| `src/lib/queries/schedule.ts` | Modify | `generateSchedule` returns `{ blocks, unscheduled }` |
| `src/lib/queries/tasks.ts` | Modify | `scheduled_date` in create/update; `fetchPendingTasksForDate` |
| `src/pages/Dashboard.tsx` | Modify | Date-scoped pending tasks; overflow warning |
| `src/components/TaskForm.tsx` | Modify | `scheduled_date` date field |
| `supabase/functions/chat/index.ts` | Modify | `get_schedule` tool, date params, system prompt |
| `src/pages/Chat.tsx` | Modify | Timezone-correct `today` |

---

## Task 1: Add `scheduled_date` column to `tasks`

**Files:**
- Create: `supabase/migrations/<timestamp>_add_scheduled_date_to_tasks.sql`
- Create/overwrite: `src/lib/database.types.ts` (generated)
- Modify: `src/lib/types.ts:9-19`

**Interfaces:**
- Produces: `tasks.scheduled_date` (Postgres `date`, `NOT NULL DEFAULT CURRENT_DATE`); `Task.scheduled_date: string` ("YYYY-MM-DD").

- [ ] **Step 1: Apply the migration**

Use the `apply_migration` MCP tool with name `add_scheduled_date_to_tasks` and SQL:

```sql
ALTER TABLE public.tasks
  ADD COLUMN scheduled_date date NOT NULL DEFAULT CURRENT_DATE;
```

(Existing rows are backfilled to today by the column default; RLS unchanged.)

- [ ] **Step 2: Verify the column and backfill**

Run via `execute_sql`:

```sql
SELECT id, title, scheduled_date FROM public.tasks ORDER BY created_at;
```

Expected: all 6 existing rows show today's date (`2026-06-26` or the run date); column is non-null.

- [ ] **Step 3: Regenerate DB types**

Use `generate_typescript_types` and overwrite `src/lib/database.types.ts` with the result.

- [ ] **Step 4: Add `scheduled_date` to the domain `Task` type**

In `src/lib/types.ts`, add the field to `Task` (after `status`):

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
  scheduled_date: string      // "YYYY-MM-DD"
  created_at: string
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS (tsc + vite build, no type errors).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ src/lib/database.types.ts src/lib/types.ts
git commit -m "feat: add scheduled_date column to tasks"
```

---

## Task 2: `generate-schedule` — schedule only the day's tasks, report overflow

**Files:**
- Modify: `supabase/functions/generate-schedule/index.ts:41-58` (task query + empty path) and `:141-164` (post-repair return)

**Interfaces:**
- Consumes: `tasks.scheduled_date` (Task 1).
- Produces: response JSON `{ blocks: ScheduleBlock[], unscheduled: { id: string; title: string; estimated_minutes: number }[] }` from POST `{ date }`.

- [ ] **Step 1: Date-filter the pending-tasks query**

In `supabase/functions/generate-schedule/index.ts`, change the tasks query (currently line ~43) to also filter by the target date. Replace:

```ts
        supabase.from('tasks').select('*').eq('user_id', userId).eq('status', 'pending'),
```

with:

```ts
        supabase.from('tasks').select('*').eq('user_id', userId).eq('status', 'pending').eq('scheduled_date', today),
```

(`today` already holds the request's `body.date` when valid, else the server's current date.)

- [ ] **Step 2: Return `unscheduled: []` on the empty-tasks path**

Replace the no-tasks early return block (currently lines ~53-58):

```ts
    if (!tasks || tasks.length === 0) {
      await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', today)
      return new Response(JSON.stringify({ blocks: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
```

with:

```ts
    if (!tasks || tasks.length === 0) {
      await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', today)
      return new Response(JSON.stringify({ blocks: [], unscheduled: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
```

- [ ] **Step 3: Compute and return `unscheduled` after insert**

Replace the final success block (currently lines ~155-164, from `const { data: inserted ...` through its `return`):

```ts
    const { data: inserted, error: insertError } = await supabase
      .from('schedule_blocks')
      .insert(toInsert)
      .select()

    if (insertError) throw insertError

    return new Response(JSON.stringify({ blocks: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
```

with:

```ts
    const { data: inserted, error: insertError } = await supabase
      .from('schedule_blocks')
      .insert(toInsert)
      .select()

    if (insertError) throw insertError

    // Pending tasks for this day that received no block — surfaced so the UI can
    // warn instead of silently dropping them.
    const scheduledTaskIds = new Set(repairedBlocks.map((b) => b.task_id).filter(Boolean))
    const unscheduled = tasks
      .filter((t: Record<string, unknown>) => !scheduledTaskIds.has(t.id as string))
      .map((t: Record<string, unknown>) => ({
        id: t.id as string,
        title: t.title as string,
        estimated_minutes: t.estimated_minutes as number,
      }))

    return new Response(JSON.stringify({ blocks: inserted, unscheduled }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
```

- [ ] **Step 4: Deploy the function**

Run: `supabase functions deploy generate-schedule`
Expected: deploy succeeds.

- [ ] **Step 5: Verify date-filtering and overflow reporting via SQL + curl**

Confirm there is a date with more pending-task minutes than its day window (or temporarily set several tasks to the same `scheduled_date` via `execute_sql`). Then invoke the function for that date (browser "Build my day", or an authenticated curl) and confirm the JSON response includes a non-empty `unscheduled` array while `blocks` only contains what fits. Also build a date with few tasks and confirm `unscheduled` is `[]`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-schedule/index.ts
git commit -m "fix: generate-schedule filters by scheduled_date and reports unscheduled tasks"
```

---

## Task 3: Frontend — date-scoped pending tasks + overflow warning

**Files:**
- Modify: `src/lib/queries/schedule.ts:32-38`
- Modify: `src/lib/queries/tasks.ts:74-83`
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: generate-schedule response `{ blocks, unscheduled }` (Task 2).
- Produces: `generateSchedule(date): Promise<{ blocks: ScheduleBlock[]; unscheduled: UnscheduledTask[] }>`; `fetchPendingTasksForDate(userId, date): Promise<Task[]>`.

- [ ] **Step 1: Make `generateSchedule` return `{ blocks, unscheduled }`**

In `src/lib/queries/schedule.ts`, add an exported type and update the function. Replace lines 32-38:

```ts
export async function generateSchedule(date: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase.functions.invoke('generate-schedule', {
    body: { date },
  })
  if (error) throw error
  return (data as { blocks: ScheduleBlock[] }).blocks
}
```

with:

```ts
export type UnscheduledTask = { id: string; title: string; estimated_minutes: number }

export async function generateSchedule(
  date: string,
): Promise<{ blocks: ScheduleBlock[]; unscheduled: UnscheduledTask[] }> {
  const { data, error } = await supabase.functions.invoke('generate-schedule', {
    body: { date },
  })
  if (error) throw error
  const res = data as { blocks: ScheduleBlock[]; unscheduled?: UnscheduledTask[] }
  return { blocks: res.blocks, unscheduled: res.unscheduled ?? [] }
}
```

- [ ] **Step 2: Add `fetchPendingTasksForDate`**

In `src/lib/queries/tasks.ts`, add below `fetchPendingTasks` (keep `fetchPendingTasks` — other call sites may use it):

```ts
export async function fetchPendingTasksForDate(userId: string, date: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('scheduled_date', date)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Task[]
}
```

- [ ] **Step 3: Wire the Dashboard to date-scoped pending tasks + overflow warning**

In `src/pages/Dashboard.tsx`:

(a) Update the import on line 10:

```ts
import { markTaskDone, markTaskPending, fetchPendingTasksForDate } from '../lib/queries/tasks'
```

(b) Add an `unscheduled` state next to the other `useState`s (after line 26):

```ts
  const [unscheduled, setUnscheduled] = useState<{ id: string; title: string }[]>([])
```

(c) In `loadData`, replace the `fetchPendingTasks(uid)` call (inside the `v === 'day'` branch, line ~42) with `fetchPendingTasksForDate(uid, date)`:

```ts
        const [dayBlocks, tasks] = await Promise.all([
          fetchBlocksForDate(uid, date),
          fetchPendingTasksForDate(uid, date),
        ])
```

(d) Clear stale warnings when a (non-stale) load completes — after `setPendingTasks(nextTasks)` (line ~56) add:

```ts
      setUnscheduled([])
```

(e) Rewrite `handleGenerate` (lines ~96-110) to consume the new return shape:

```ts
  async function handleGenerate() {
    if (!userId) return
    setGenerating(true)
    setError(null)
    notifiedRef.current = new Set()
    try {
      const result = await generateSchedule(selectedDate)
      setBlocks(result.blocks)
      setUnscheduled(result.unscheduled)
      setPendingTasks(await fetchPendingTasksForDate(userId, selectedDate))
    } catch {
      setError('שגיאה בבניית לוח הזמנים. נסה שוב.')
    } finally {
      setGenerating(false)
    }
  }
```

(f) Render the warning banner. Directly after the existing `{error && ...}` line (line ~159) add:

```tsx
      {unscheduled.length > 0 && (
        <div className="warning-banner">
          המשימות הבאות לא נכנסו ליום ({dayStart}–{dayEnd}): {unscheduled.map((t) => t.title).join(', ')}
        </div>
      )}
```

- [ ] **Step 4: Add minimal `.warning-banner` styling**

In `src/App.css`, mirror the existing `.error-banner` rule (find it for exact tokens) with a warning tone, using logical properties only. Example:

```css
.warning-banner {
  padding-block: 0.5rem;
  padding-inline: 0.75rem;
  margin-block-end: 1rem;
  border-radius: 6px;
  background: var(--warning-bg, #fff4e5);
  color: var(--warning-fg, #7a4a00);
  font-size: 0.9rem;
}
```

- [ ] **Step 5: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 6: Verify in the browser**

Run `npm run dev`, open the dashboard. On a date whose tasks overflow the day window, click "בנה את היום שלי ✨" and confirm the warning banner lists the overflow task titles, the grid shows only what fit, and the warning clears when you navigate to another date. Confirm the pending panel shows only the selected date's pending tasks.

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries/schedule.ts src/lib/queries/tasks.ts src/pages/Dashboard.tsx src/App.css
git commit -m "feat: date-scoped pending tasks and schedule-overflow warning on dashboard"
```

---

## Task 4: TaskForm + task helpers — capture `scheduled_date`

**Files:**
- Modify: `src/lib/queries/tasks.ts:14-51` (create/update signatures)
- Modify: `src/components/TaskForm.tsx`

**Interfaces:**
- Consumes: `Task.scheduled_date` (Task 1); `todayStr()` from `src/lib/dateUtils`.
- Produces: `createTask`/`updateTask` accept optional `scheduled_date?: string`; `TaskForm.onSubmit` data includes `scheduled_date: string`.

- [ ] **Step 1: Add `scheduled_date` to the query helpers**

In `src/lib/queries/tasks.ts`, add `scheduled_date?: string` to both input object types. For `createTask` (lines 16-22 input) add the field:

```ts
  input: {
    title: string
    estimated_minutes: number
    priority: 'low' | 'medium' | 'high'
    deadline?: string | null
    fixed_start?: string | null
    scheduled_date?: string
  }
```

and for `updateTask` (lines 35-41 input):

```ts
  input: {
    title?: string
    estimated_minutes?: number
    priority?: 'low' | 'medium' | 'high'
    deadline?: string | null
    fixed_start?: string | null
    scheduled_date?: string
  }
```

The bodies already spread `input` into the insert/update, so no body change is needed. (Omitting `scheduled_date` on create falls back to the DB default = today.)

- [ ] **Step 2: Add the date field to `TaskForm`**

In `src/components/TaskForm.tsx`:

(a) Import `todayStr` at the top:

```ts
import { todayStr } from '../lib/dateUtils'
```

(b) Add `scheduled_date` to `FormData` (after `fixed_start`, line 9):

```ts
  scheduled_date: string
```

(c) Add it to the `onSubmit` data type in `Props` (after `fixed_start`, line 19):

```ts
    scheduled_date: string
```

(d) Update `EMPTY` (lines 25-31) to default to today:

```ts
const EMPTY: FormData = {
  title: '',
  estimated_minutes: '30',
  priority: 'medium',
  deadline: '',
  fixed_start: '',
  scheduled_date: todayStr(),
}
```

(e) In the `editTarget` branch of the `useEffect` (lines 39-45), populate from the task:

```ts
      setForm({
        title: editTarget.title,
        estimated_minutes: String(editTarget.estimated_minutes),
        priority: editTarget.priority as 'low' | 'medium' | 'high',
        deadline: editTarget.deadline ? editTarget.deadline.slice(0, 16) : '',
        fixed_start: editTarget.fixed_start ? editTarget.fixed_start.slice(0, 5) : '',
        scheduled_date: editTarget.scheduled_date,
      })
```

(f) In `handleSubmit` (lines 66-72), pass the field through:

```ts
    await onSubmit({
      title: form.title.trim(),
      estimated_minutes: parseInt(form.estimated_minutes),
      priority: form.priority,
      deadline: form.deadline || null,
      fixed_start: form.fixed_start || null,
      scheduled_date: form.scheduled_date,
    })
```

(g) Add the input field. Insert a new `field(...)` block before the `deadline` field (before line 122):

```tsx
      {field('scheduled_date', 'תאריך *',
        <input
          className="form-input"
          type="date"
          value={form.scheduled_date}
          onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
        />
      )}
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: both PASS. (`Tasks.tsx` passes data through via `Parameters<typeof createTask>[1]`, so it needs no change.)

- [ ] **Step 4: Verify in the browser**

On `/tasks`: create a task with a future date → confirm it saves. On the dashboard, navigate to that date and "Build my day" → the task appears; on other dates it does not. Edit the task → the date field is pre-filled with its `scheduled_date`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/tasks.ts src/components/TaskForm.tsx
git commit -m "feat: TaskForm captures scheduled_date"
```

---

## Task 5: `chat` function — multi-date read tool, date params, system prompt

**Files:**
- Modify: `supabase/functions/chat/index.ts` — `TOOL_DECLARATIONS` (lines 8-70), `buildSystemInstruction` (lines 219-252), `executeTool` (lines 254-318)

**Interfaces:**
- Consumes: `tasks.scheduled_date`; the generate-schedule function accepting `{ date }`.
- Produces: tools `get_schedule(date)`, `generate_schedule(date?)`, `create_task(..., scheduled_date?)`, `update_task(..., scheduled_date?)`.

- [ ] **Step 1: Add `scheduled_date` / `date` params to tool declarations**

In `supabase/functions/chat/index.ts`, in `TOOL_DECLARATIONS`:

(a) `create_task` properties (after `fixed_start`, line 19) — add:

```ts
        scheduled_date: { type: 'string', nullable: true, description: 'YYYY-MM-DD; defaults to today' },
```

(b) `update_task` properties (after `fixed_start`, line 35) — add:

```ts
        scheduled_date: { type: 'string', nullable: true, description: 'YYYY-MM-DD' },
```

(c) Replace the `generate_schedule` entry (lines 64-69) with one that takes an optional date:

```ts
  {
    name: 'generate_schedule',
    description: "Regenerate the AI schedule from pending tasks for a given date (default: today)",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
      },
    },
  },
```

(d) Add a new `get_schedule` read tool to the array (e.g. after `move_block`):

```ts
  {
    name: 'get_schedule',
    description: "Read the schedule blocks for a specific date (use for any date other than today)",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
```

- [ ] **Step 2: Implement the new tool behavior in `executeTool`**

In `executeTool`, the `create_task` insert (lines 264-271) — add `scheduled_date` (omit when absent so the DB default applies):

```ts
    if (name === 'create_task') {
      const insert: Record<string, unknown> = {
        user_id: userId,
        title: args.title,
        estimated_minutes: args.estimated_minutes,
        priority: args.priority,
        deadline: args.deadline ?? null,
        fixed_start: args.fixed_start ?? null,
      }
      if (args.scheduled_date) insert.scheduled_date = args.scheduled_date
      const { error } = await supabase.from('tasks').insert(insert)
      if (error) throw error
      return { tool: name, args, result: 'ok' }
    }
```

In `update_task` (lines 276-287), add `scheduled_date` to the mapped fields — after the `fixed_start` line:

```ts
      if (fields.scheduled_date !== undefined) update.scheduled_date = fields.scheduled_date
```

Replace the `generate_schedule` handler (lines 305-312) to forward the date:

```ts
    if (name === 'generate_schedule') {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-schedule`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(args.date ? { date: args.date } : {}),
      })
      if (!res.ok) throw new Error('generate-schedule failed')
      return { tool: name, args, result: 'ok' }
    }
```

Add a `get_schedule` handler (before the final `return { ... Unknown tool ... }`):

```ts
    if (name === 'get_schedule') {
      const { data, error } = await supabase
        .from('schedule_blocks')
        .select('id, title, start_time, end_time, block_type, task_id')
        .eq('user_id', userId)
        .eq('date', args.date)
        .order('start_time', { ascending: true })
      if (error) throw error
      const detail = (data && data.length)
        ? data.map((b) => `[${b.id}] "${b.title}" ${b.start_time}–${b.end_time} (${b.block_type}) task_id:${b.task_id ?? 'אין'}`).join('\n')
        : 'אין בלוקים בתאריך זה'
      return { tool: name, args, result: 'ok', detail }
    }
```

(The agent loop already feeds `detail` back to the model as the `functionResponse`.)

- [ ] **Step 3: Update the system instruction for multi-date awareness**

In `buildSystemInstruction`, change the task line builder (lines 227-229) to include each task's date:

```ts
        `- [${t.id}] "${t.title}" | ${t.estimated_minutes}min | עדיפות: ${t.priority} | תאריך: ${t.scheduled_date} | deadline: ${t.deadline ?? 'אין'} | fixed_start: ${t.fixed_start ?? 'אין'} | סטטוס: ${t.status}`
```

And append a dates instruction to the returned prompt — replace the final paragraph (line 251):

```ts
כשמשתמש מבקש לבצע פעולה — השתמש בכלים המתאימים. לאחר ביצוע, ענה בעברית בצורה ידידותית וקצרה.

**תאריכים:** "היום" הוא ${context.today}. פענח ביטויים יחסיים ("מחר", "מחרתיים", "יום חמישי") ביחס אליו והעבר אותם לכלים בפורמט YYYY-MM-DD. הבלוקים המוצגים למעלה הם של היום בלבד — לכל תאריך אחר קרא תחילה ל-get_schedule כדי לקבל את הבלוקים וה-IDs שלהם לפני עריכה.`
```

- [ ] **Step 4: Deploy the function**

Run: `supabase functions deploy chat`
Expected: deploy succeeds.

- [ ] **Step 5: Verify multi-date chat end-to-end**

(Defer the full browser run to Task 6, which also fixes the client `today`.) For now, smoke-test with an authenticated curl or the running app: ask "מה יש לי מחר?" → the model calls `get_schedule` for tomorrow's date and answers; ask "תבנה לי את לוח הזמנים למחר" → `generate_schedule` runs for tomorrow (verify tomorrow's `schedule_blocks` rows via `execute_sql`).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/chat/index.ts
git commit -m "feat: chat reads and acts on any date via get_schedule and date params"
```

---

## Task 6: `Chat.tsx` timezone fix + end-to-end verification

**Files:**
- Modify: `src/pages/Chat.tsx:3,36-38`

**Interfaces:**
- Consumes: `todayStr()` from `src/lib/dateUtils`.

- [ ] **Step 1: Use the timezone-safe local date**

In `src/pages/Chat.tsx`, add the import (after line 3):

```ts
import { todayStr } from '../lib/dateUtils'
```

Then in `handleSend`, replace the `today` computation (line 38):

```ts
      const today = now.toISOString().split('T')[0]
```

with:

```ts
      const today = todayStr()
```

(`now` is still used for `nowTime`, so keep the `const now = new Date()` line above it.)

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 3: End-to-end browser verification**

Run `npm run dev`, open `/chat`, and confirm the full flow:
- "מה יש לי ביום חמישי?" → reads Thursday's blocks (no action taken).
- "תוסיף משימה לכתוב דו״ח מחר ל-45 דקות" → task created with tomorrow's `scheduled_date` (check `/tasks`).
- "תבנה לי את המחר" → tomorrow's schedule is built; navigate the dashboard to tomorrow to see it.
- "תזיז את הבלוק הראשון ביום חמישי לשעה 16:00" → the model calls `get_schedule` then `move_block`; verify the block moved.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "fix: chat uses timezone-safe local date as today anchor"
```

---

## Self-Review

**Spec coverage:**
- Schema migration (`scheduled_date`) → Task 1. ✓
- generate-schedule date-filter + `unscheduled` (no silent drop) → Task 2. ✓
- Dashboard overflow warning + date-scoped pending panel → Task 3. ✓
- TaskForm `scheduled_date` + query helpers → Task 4. ✓
- chat `get_schedule`, date params, system prompt → Task 5. ✓
- Chat.tsx timezone fix → Task 6. ✓
- Out-of-scope items (carryover, shared selected-date, recurring) → not planned. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to" — every code step shows the code. The one CSS step gives concrete properties and notes mirroring `.error-banner` for exact palette tokens. ✓

**Type consistency:** `UnscheduledTask` defined in Task 3 Step 1 and consumed by `generateSchedule`'s return; Dashboard's `unscheduled` state uses the `{id,title}` subset it renders. `fetchPendingTasksForDate(userId, date)` defined in Task 3, used in Task 3. `Task.scheduled_date: string` defined in Task 1, consumed in Tasks 4/5. `generate_schedule` tool forwards `{ date }` matching the function's `body.date` parsing. ✓

**Note on spec deviation:** Spec said TaskForm defaults to "the dashboard's selected date / today"; TaskForm actually lives on `/tasks` (no selected-date context), so it defaults to `todayStr()`. Documented in Task 4.
