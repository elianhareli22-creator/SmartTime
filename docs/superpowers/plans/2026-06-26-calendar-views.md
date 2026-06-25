# Calendar Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Day/Week/Month calendar views to the Dashboard with date navigation, a pending-tasks panel on day view, and "Build My Day" that schedules any selected date.

**Architecture:** Single Dashboard page gains `selectedDate` (YYYY-MM-DD, default today) and `view` ('day'|'week'|'month') state. A shared `DateNav` component handles prev/next navigation and view toggle. Day view shows a read-only pending-tasks panel above the existing time grid. Week view shows 7 time-grid columns (Mon–Sun). Month view shows a calendar grid with mini block pills. Clicking any day column/cell in Week/Month sets `view='day'` and `selectedDate` for that date. "Build My Day" passes `selectedDate` to the edge function instead of always using today.

**Tech Stack:** React 19 + TypeScript 6, Vite 8, Supabase JS v2, Deno edge function, vanilla CSS (RTL `direction: rtl`)

## Global Constraints

- All UI text in Hebrew only
- RTL layout — `direction: rtl` is set globally; do not override it
- CSS variable names: `--primary`, `--primary-hover`, `--border`, `--surface`, `--bg`, `--text`, `--text-muted`, `--radius`, `--shadow`
- No new npm dependencies — React + vanilla CSS only
- `main-content` max-width is 800px — all views must work within it
- Verification: `npm run build` must exit 0 (TypeScript compile) + visual browser check via `npm run dev`
- No test framework exists in this project — use `npm run build` as the compile gate

---

### Task 1: Date utilities + View type

**Files:**
- Create: `src/lib/dateUtils.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces (all exported from `src/lib/dateUtils.ts`):
  - `todayStr(): string` — current date as YYYY-MM-DD
  - `addDays(date: string, n: number): string`
  - `getWeekStart(date: string): string` — Monday of the week containing `date`
  - `getWeekDates(date: string): string[]` — 7 date strings Mon–Sun
  - `getMonthStart(date: string): string` — first day of the month
  - `getMonthEnd(date: string): string` — last day of the month
  - `getMonthCells(date: string): (string | null)[]` — day strings + leading null padding, total length divisible by 7
  - `isToday(date: string): boolean`
  - `formatDayLabel(date: string): string` — short Hebrew label e.g. "ה׳, 26 יוני"
- Produces (in `src/lib/types.ts`):
  - `export type View = 'day' | 'week' | 'month'`

- [ ] **Step 1: Add View type to src/lib/types.ts**

Append at the end of the file:
```ts
export type View = 'day' | 'week' | 'month'
```

- [ ] **Step 2: Create src/lib/dateUtils.ts**

```ts
export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function getWeekStart(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const day = d.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day // shift to Monday
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export function getWeekDates(date: string): string[] {
  const mon = getWeekStart(date)
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

export function getMonthStart(date: string): string {
  return date.slice(0, 8) + '01'
}

export function getMonthEnd(date: string): string {
  const d = new Date(date.slice(0, 7) + '-01T00:00:00')
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  return d.toISOString().split('T')[0]
}

export function getMonthCells(date: string): (string | null)[] {
  const start = new Date(getMonthStart(date) + 'T00:00:00')
  const end = new Date(getMonthEnd(date) + 'T00:00:00')
  const startDay = start.getDay() // 0 = Sun
  const padding = startDay === 0 ? 6 : startDay - 1 // Monday-based
  const cells: (string | null)[] = Array(padding).fill(null)
  const cur = new Date(start)
  while (cur <= end) {
    cells.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function isToday(date: string): boolean {
  return date === todayStr()
}

export function formatDayLabel(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dateUtils.ts src/lib/types.ts
git commit -m "feat: add dateUtils and View type"
```

---

### Task 2: Query layer — schedule + task queries

**Files:**
- Modify: `src/lib/queries/schedule.ts`
- Modify: `src/lib/queries/tasks.ts`

**Interfaces:**
- Produces:
  - `fetchBlocksForDate(userId: string, date: string): Promise<ScheduleBlock[]>`
  - `fetchBlocksForRange(userId: string, startDate: string, endDate: string): Promise<ScheduleBlock[]>`
  - `generateSchedule(date: string): Promise<ScheduleBlock[]>`
  - `fetchPendingTasks(userId: string): Promise<Task[]>`

- [ ] **Step 1: Replace src/lib/queries/schedule.ts**

```ts
import { supabase } from '../supabase'
import type { ScheduleBlock } from '../types'

export async function fetchBlocksForDate(userId: string, date: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('start_time', { ascending: true })
  if (error) throw error
  return data as ScheduleBlock[]
}

export async function fetchBlocksForRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
  if (error) throw error
  return data as ScheduleBlock[]
}

export async function generateSchedule(date: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase.functions.invoke('generate-schedule', {
    body: { date },
  })
  if (error) throw error
  return (data as { blocks: ScheduleBlock[] }).blocks
}
```

- [ ] **Step 2: Append fetchPendingTasks to src/lib/queries/tasks.ts**

Add after the last function in the file:
```ts
export async function fetchPendingTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Task[]
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: exits 0. Dashboard.tsx will error on `generateSchedule()` (no args) — that is expected and will be fixed in Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/schedule.ts src/lib/queries/tasks.ts
git commit -m "feat: fetchBlocksForDate, fetchBlocksForRange, fetchPendingTasks, generateSchedule accepts date"
```

---

### Task 3: Edge function — accept date parameter

**Files:**
- Modify: `supabase/functions/generate-schedule/index.ts`
- Deploy via Supabase MCP (`mcp__supabase__deploy_edge_function`)

**Interfaces:**
- Request body: `{ date?: string }` — YYYY-MM-DD; falls back to today if omitted or malformed
- Response: unchanged `{ blocks: ScheduleBlock[] }`

- [ ] **Step 1: Replace supabase/functions/generate-schedule/index.ts**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const userId = user.id

    let today = new Date().toISOString().split('T')[0]
    try {
      const body = await req.json()
      if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        today = body.date
      }
    } catch { /* no body — use today */ }

    const [{ data: tasks, error: tasksError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabase.from('tasks').select('*').eq('user_id', userId).eq('status', 'pending'),
        supabase.from('profiles').select('*').eq('id', userId).single(),
      ])

    if (tasksError) throw tasksError
    if (profileError) throw profileError

    const dayStart = profile.day_start.slice(0, 5)
    const dayEnd = profile.day_end.slice(0, 5)

    if (!tasks || tasks.length === 0) {
      await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', today)
      return new Response(JSON.stringify({ blocks: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const taskList = tasks.map((t: Record<string, unknown>) => ({
      id: t.id,
      title: t.title,
      estimated_minutes: t.estimated_minutes,
      priority: t.priority,
      deadline: t.deadline,
      fixed_start: t.fixed_start ? (t.fixed_start as string).slice(0, 5) : null,
    }))

    const prompt = `You are a schedule optimizer. Arrange these tasks into a time-blocked day.

Day window: ${dayStart}–${dayEnd}
Tasks: ${JSON.stringify(taskList)}

Rules:
- Place high-priority and deadline-bound tasks earlier in the day
- Tasks with fixed_start MUST start at exactly that time (block_type "task")
- Add 10-minute breaks (block_type "break", task_id null, title "הפסקה") after tasks of 60+ minutes
- Every block must fit within ${dayStart}–${dayEnd}
- Return ONLY a JSON object with a "blocks" array`

    const geminiKey = Deno.env.get('GEMINI_API_KEY')!
    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`

    const responseSchema = {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task_id: { type: 'string', nullable: true },
              title: { type: 'string' },
              start_time: { type: 'string' },
              end_time: { type: 'string' },
              block_type: { type: 'string', enum: ['task', 'break'] },
            },
            required: ['task_id', 'title', 'start_time', 'end_time', 'block_type'],
          },
        },
      },
      required: ['blocks'],
    }

    let aiBlocks: AiBlock[] | null = null

    for (let attempt = 0; attempt < 2; attempt++) {
      const attemptPrompt = attempt === 1
        ? prompt + '\n\nIMPORTANT: Output raw JSON only — no markdown, no code fences.'
        : prompt

      try {
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: attemptPrompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema },
          }),
        })

        if (res.ok) {
          const json = await res.json()
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          const parsed = JSON.parse(text)
          if (Array.isArray(parsed?.blocks)) {
            aiBlocks = parsed.blocks
            break
          }
        }
      } catch {
        // retry on next attempt
      }
    }

    if (!aiBlocks) {
      aiBlocks = buildDeterministicSchedule(tasks, dayStart, dayEnd)
    }

    const repairedBlocks = repairBlocks(aiBlocks, tasks, dayStart, dayEnd)

    await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', today)

    const toInsert = repairedBlocks.map((b) => ({
      user_id: userId,
      task_id: b.task_id ?? null,
      date: today,
      start_time: b.start_time,
      end_time: b.end_time,
      block_type: b.block_type,
      title: b.title,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('schedule_blocks')
      .insert(toInsert)
      .select()

    if (insertError) throw insertError

    return new Response(JSON.stringify({ blocks: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

type AiBlock = {
  task_id: string | null
  title: string
  start_time: string
  end_time: string
  block_type: 'task' | 'break'
}

function timeToMinutes(t: string): number {
  const parts = t.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function repairBlocks(
  aiBlocks: AiBlock[],
  tasks: Record<string, unknown>[],
  dayStart: string,
  dayEnd: string,
): AiBlock[] {
  const dayStartMin = timeToMinutes(dayStart)
  const dayEndMin = timeToMinutes(dayEnd)
  const taskMap = new Map(tasks.map((t) => [t.id as string, t]))

  const fixedPinned: AiBlock[] = tasks
    .filter((t) => t.fixed_start)
    .map((t) => ({
      task_id: t.id as string,
      title: t.title as string,
      start_time: (t.fixed_start as string).slice(0, 5),
      end_time: minutesToTime(
        timeToMinutes((t.fixed_start as string).slice(0, 5)) + (t.estimated_minutes as number)
      ),
      block_type: 'task' as const,
    }))

  const nonFixed = aiBlocks.filter((b) => {
    if (b.task_id && taskMap.get(b.task_id)?.fixed_start) return false
    const s = timeToMinutes(b.start_time)
    const e = timeToMinutes(b.end_time)
    return s >= dayStartMin && e <= dayEndMin && s < e
  })

  const all = [...fixedPinned, ...nonFixed].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  )

  const packed: AiBlock[] = []
  let cursor = dayStartMin
  for (const block of all) {
    const s = Math.max(timeToMinutes(block.start_time), cursor)
    const duration = timeToMinutes(block.end_time) - timeToMinutes(block.start_time)
    const e = s + duration
    if (e > dayEndMin) continue
    packed.push({ ...block, start_time: minutesToTime(s), end_time: minutesToTime(e) })
    cursor = e
  }

  const placedIds = new Set(packed.filter((b) => b.task_id).map((b) => b.task_id))
  for (const task of tasks) {
    if (placedIds.has(task.id as string)) continue
    const e = cursor + (task.estimated_minutes as number)
    if (e <= dayEndMin) {
      packed.push({
        task_id: task.id as string,
        title: task.title as string,
        start_time: minutesToTime(cursor),
        end_time: minutesToTime(e),
        block_type: 'task',
      })
      cursor = e
    }
  }

  return packed
}

function buildDeterministicSchedule(
  tasks: Record<string, unknown>[],
  dayStart: string,
  dayEnd: string,
): AiBlock[] {
  const dayEndMin = timeToMinutes(dayEnd)
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 }

  const sorted = [...tasks].sort((a, b) => {
    const pa = order[a.priority as string] ?? 1
    const pb = order[b.priority as string] ?? 1
    if (pa !== pb) return pa - pb
    if (a.deadline && b.deadline) return (a.deadline as string).localeCompare(b.deadline as string)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return 0
  })

  const blocks: AiBlock[] = []
  let cursor = timeToMinutes(dayStart)

  for (const task of sorted) {
    const start = task.fixed_start
      ? timeToMinutes((task.fixed_start as string).slice(0, 5))
      : cursor
    const end = start + (task.estimated_minutes as number)
    if (end > dayEndMin) continue
    blocks.push({
      task_id: task.id as string,
      title: task.title as string,
      start_time: minutesToTime(start),
      end_time: minutesToTime(end),
      block_type: 'task',
    })
    cursor = end
  }

  return blocks
}
```

- [ ] **Step 2: Deploy edge function**

Use `mcp__supabase__deploy_edge_function` with:
- `name`: `generate-schedule`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `true`
- `files`: the single file above with `name: "index.ts"`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/generate-schedule/index.ts
git commit -m "feat: edge function accepts optional date param in request body"
```

---

### Task 4: DateNav component

**Files:**
- Create: `src/components/DateNav.tsx`
- Modify: `src/App.css` (append)

**Interfaces:**
- Consumes: `View` from `../lib/types`; `addDays`, `getWeekDates`, `getMonthStart`, `isToday` from `../lib/dateUtils`
- Produces: `default export DateNav(props: { date: string, view: View, onDateChange: (d: string) => void, onViewChange: (v: View) => void })`

- [ ] **Step 1: Create src/components/DateNav.tsx**

```tsx
import type { View } from '../lib/types'
import { addDays, getWeekDates, getMonthStart, isToday } from '../lib/dateUtils'

type Props = {
  date: string
  view: View
  onDateChange: (date: string) => void
  onViewChange: (view: View) => void
}

function rangeLabel(date: string, view: View): string {
  const d = new Date(date + 'T00:00:00')
  if (view === 'day') {
    return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
  }
  if (view === 'week') {
    const dates = getWeekDates(date)
    const s = new Date(dates[0] + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
    const e = new Date(dates[6] + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
    return `${s} – ${e}`
  }
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}

function navigate(date: string, view: View, dir: -1 | 1): string {
  if (view === 'day') return addDays(date, dir)
  if (view === 'week') return addDays(date, dir * 7)
  const d = new Date(getMonthStart(date) + 'T00:00:00')
  d.setMonth(d.getMonth() + dir)
  return d.toISOString().split('T')[0]
}

const VIEW_LABELS: Record<View, string> = { day: 'יום', week: 'שבוע', month: 'חודש' }

export default function DateNav({ date, view, onDateChange, onViewChange }: Props) {
  return (
    <div className="date-nav">
      <div className="date-nav-center">
        <button className="date-nav-arrow" onClick={() => onDateChange(navigate(date, view, -1))}>‹</button>
        <span className="date-nav-label">
          {rangeLabel(date, view)}
          {view === 'day' && isToday(date) && <span className="date-nav-today"> (היום)</span>}
        </span>
        <button className="date-nav-arrow" onClick={() => onDateChange(navigate(date, view, 1))}>›</button>
      </div>
      <div className="view-toggle">
        {(['day', 'week', 'month'] as View[]).map(v => (
          <button
            key={v}
            className={`view-toggle-btn${view === v ? ' active' : ''}`}
            onClick={() => onViewChange(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append to src/App.css**

```css
/* DateNav */
.date-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.date-nav-center {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.date-nav-arrow {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 32px;
  height: 32px;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.date-nav-arrow:hover { background: var(--bg); }

.date-nav-label {
  font-size: 1rem;
  font-weight: 600;
  min-width: 160px;
  text-align: center;
}

.date-nav-today {
  font-size: 0.8rem;
  color: var(--primary);
  font-weight: 400;
}

.view-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.view-toggle-btn {
  background: none;
  border: none;
  padding: 0.35rem 0.9rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}
.view-toggle-btn:not(:last-child) { border-left: 1px solid var(--border); }
.view-toggle-btn.active { background: var(--primary); color: #fff; }
.view-toggle-btn:not(.active):hover { background: var(--bg); }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/components/DateNav.tsx src/App.css
git commit -m "feat: DateNav component with day/week/month toggle and prev/next navigation"
```

---

### Task 5: PendingTasksPanel component

**Files:**
- Create: `src/components/PendingTasksPanel.tsx`
- Modify: `src/App.css` (append)

**Interfaces:**
- Consumes: `Task` from `../lib/types`
- Produces: `default export PendingTasksPanel({ tasks: Task[] })` — returns `null` when `tasks.length === 0`

- [ ] **Step 1: Create src/components/PendingTasksPanel.tsx**

```tsx
import { useState } from 'react'
import type { Task } from '../lib/types'

type Props = { tasks: Task[] }

const PRIORITY_LABEL: Record<string, string> = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' }

export default function PendingTasksPanel({ tasks }: Props) {
  const [open, setOpen] = useState(true)
  if (tasks.length === 0) return null

  return (
    <div className="pending-panel">
      <button className="pending-panel-toggle" onClick={() => setOpen(o => !o)}>
        <span>משימות ממתינות ({tasks.length})</span>
        <span>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="pending-panel-list">
          {tasks.map(t => (
            <li key={t.id} className="pending-panel-item">
              <span className={`priority-dot priority-${t.priority}`} />
              <span className="pending-title">{t.title}</span>
              <span className="pending-duration">{t.estimated_minutes} דק׳</span>
              <span className={`pending-priority-label priority-label-${t.priority}`}>
                {PRIORITY_LABEL[t.priority]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Append to src/App.css**

```css
/* PendingTasksPanel */
.pending-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 1rem;
  overflow: hidden;
}

.pending-panel-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1rem;
  background: none;
  border: none;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  text-align: right;
  transition: background 0.15s;
}
.pending-panel-toggle:hover { background: var(--bg); }

.pending-panel-list {
  list-style: none;
  border-top: 1px solid var(--border);
  padding: 0.5rem 0;
}

.pending-panel-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 1rem;
  font-size: 0.875rem;
}

.pending-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pending-duration { color: var(--text-muted); font-size: 0.8rem; flex-shrink: 0; }

.pending-priority-label {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  flex-shrink: 0;
}
.priority-label-high   { background: #fee2e2; color: #b91c1c; }
.priority-label-medium { background: #fef3c7; color: #92400e; }
.priority-label-low    { background: #dcfce7; color: #166534; }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/components/PendingTasksPanel.tsx src/App.css
git commit -m "feat: PendingTasksPanel — collapsible read-only task list for day view"
```

---

### Task 6: WeekView component

**Files:**
- Create: `src/components/WeekView.tsx`
- Modify: `src/App.css` (append)

**Interfaces:**
- Consumes:
  - `ScheduleBlock` from `../lib/types`
  - `getWeekDates`, `isToday`, `formatDayLabel` from `../lib/dateUtils`
  - `timeStrToMinutes` from `../lib/timeUtils`
- Produces: `default export WeekView(props: { blocks: ScheduleBlock[], selectedDate: string, dayStart: string, dayEnd: string, onSelectDate: (date: string) => void })`

- [ ] **Step 1: Create src/components/WeekView.tsx**

```tsx
import type { ScheduleBlock } from '../lib/types'
import { getWeekDates, isToday, formatDayLabel } from '../lib/dateUtils'
import { timeStrToMinutes } from '../lib/timeUtils'

const PX_PER_MIN = 0.9

type Props = {
  blocks: ScheduleBlock[]
  selectedDate: string
  dayStart: string  // "HH:MM"
  dayEnd: string    // "HH:MM"
  onSelectDate: (date: string) => void
}

export default function WeekView({ blocks, selectedDate, dayStart, dayEnd, onSelectDate }: Props) {
  const dates = getWeekDates(selectedDate)
  const dayStartMin = timeStrToMinutes(dayStart)
  const dayEndMin = timeStrToMinutes(dayEnd)
  const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MIN

  const byDate = new Map<string, ScheduleBlock[]>()
  for (const b of blocks) {
    const list = byDate.get(b.date) ?? []
    list.push(b)
    byDate.set(b.date, list)
  }

  const hours: number[] = []
  for (let h = Math.ceil(dayStartMin / 60); h <= Math.floor(dayEndMin / 60); h++) {
    hours.push(h)
  }

  return (
    <div className="week-view">
      <div className="week-time-col">
        <div className="week-day-header" />
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {hours.map(h => (
            <div
              key={h}
              className="week-time-label"
              style={{ top: `${(h * 60 - dayStartMin) * PX_PER_MIN}px` }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
      </div>

      {dates.map(date => {
        const dayBlocks = byDate.get(date) ?? []
        return (
          <div
            key={date}
            className={`week-day-col${isToday(date) ? ' week-day-col--today' : ''}`}
            onClick={() => onSelectDate(date)}
          >
            <div className="week-day-header">
              <span className="week-day-name">{formatDayLabel(date)}</span>
            </div>
            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
              {dayBlocks.map(block => {
                const s = timeStrToMinutes(block.start_time)
                const e = timeStrToMinutes(block.end_time)
                const top = (s - dayStartMin) * PX_PER_MIN
                const height = Math.max((e - s) * PX_PER_MIN, 6)
                return (
                  <div
                    key={block.id}
                    className={`week-block${block.block_type === 'break' ? ' week-block--break' : ' week-block--task'}`}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    title={block.title}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Append to src/App.css**

```css
/* WeekView */
.week-view {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 2rem;
}

.week-time-col {
  width: 44px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
}

.week-time-label {
  position: absolute;
  right: 2px;
  font-size: 0.65rem;
  color: var(--text-muted);
  line-height: 1;
  transform: translateY(-50%);
  white-space: nowrap;
}

.week-day-col {
  flex: 1;
  min-width: 0;
  border-left: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.12s;
}
.week-day-col:last-child { border-left: none; }
.week-day-col:hover { background: #f8fafc; }
.week-day-col--today { background: #eef2ff; }
.week-day-col--today:hover { background: #e0e7ff; }

.week-day-header {
  height: 44px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
}

.week-day-name {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.3;
}

.week-block {
  position: absolute;
  left: 2px;
  right: 2px;
  border-radius: 3px;
  min-height: 4px;
}
.week-block--task  { background: var(--primary); opacity: 0.85; }
.week-block--break { background: var(--border); }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/components/WeekView.tsx src/App.css
git commit -m "feat: WeekView — 7 time-grid columns, click day switches to day view"
```

---

### Task 7: MonthView component

**Files:**
- Create: `src/components/MonthView.tsx`
- Modify: `src/App.css` (append)

**Interfaces:**
- Consumes:
  - `ScheduleBlock` from `../lib/types`
  - `getMonthCells`, `isToday` from `../lib/dateUtils`
- Produces: `default export MonthView(props: { blocks: ScheduleBlock[], selectedDate: string, onSelectDate: (date: string) => void })`

- [ ] **Step 1: Create src/components/MonthView.tsx**

```tsx
import type { ScheduleBlock } from '../lib/types'
import { getMonthCells, isToday } from '../lib/dateUtils'

const WEEK_HEADERS = ['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳', 'א׳'] // Mon–Sun

type Props = {
  blocks: ScheduleBlock[]
  selectedDate: string
  onSelectDate: (date: string) => void
}

export default function MonthView({ blocks, selectedDate, onSelectDate }: Props) {
  const cells = getMonthCells(selectedDate)

  const byDate = new Map<string, ScheduleBlock[]>()
  for (const b of blocks) {
    const list = byDate.get(b.date) ?? []
    list.push(b)
    byDate.set(b.date, list)
  }

  return (
    <div className="month-view">
      <div className="month-header-row">
        {WEEK_HEADERS.map(d => (
          <div key={d} className="month-weekday-label">{d}</div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} className="month-cell month-cell--empty" />
          const dayBlocks = byDate.get(date) ?? []
          const taskBlocks = dayBlocks.filter(b => b.block_type === 'task')
          const visible = taskBlocks.slice(0, 3)
          const overflow = taskBlocks.length - visible.length
          const dayNum = parseInt(date.split('-')[2])
          return (
            <div
              key={date}
              className={`month-cell${isToday(date) ? ' month-cell--today' : ''}`}
              onClick={() => onSelectDate(date)}
            >
              <span className={`month-day-num${isToday(date) ? ' month-day-num--today' : ''}`}>
                {dayNum}
              </span>
              <div className="month-blocks">
                {visible.map(b => (
                  <div key={b.id} className="month-block" title={b.title}>{b.title}</div>
                ))}
                {overflow > 0 && <div className="month-overflow">+{overflow}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append to src/App.css**

```css
/* MonthView */
.month-view {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 2rem;
}

.month-header-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.month-weekday-label {
  padding: 0.5rem 0;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.month-cell {
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  min-height: 80px;
  padding: 4px 6px;
  cursor: pointer;
  background: var(--surface);
  transition: background 0.12s;
}
.month-cell:nth-child(7n+1) { border-left: none; }
.month-cell:hover { background: var(--bg); }
.month-cell--empty { background: var(--bg); cursor: default; }
.month-cell--today { background: #eef2ff; }
.month-cell--today:hover { background: #e0e7ff; }

.month-day-num {
  display: block;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.month-day-num--today { color: var(--primary); font-weight: 700; }

.month-blocks { display: flex; flex-direction: column; gap: 2px; }

.month-block {
  background: var(--primary);
  color: #fff;
  font-size: 0.65rem;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.month-overflow { font-size: 0.65rem; color: var(--text-muted); padding-right: 2px; }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/components/MonthView.tsx src/App.css
git commit -m "feat: MonthView — calendar grid with mini block pills, click day for day view"
```

---

### Task 8: Dashboard integration

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes all components and functions from Tasks 1–7 (exact signatures listed above per task)

- [ ] **Step 1: Replace src/pages/Dashboard.tsx**

```tsx
import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import TimeGrid from '../components/TimeGrid'
import UpcomingPanel from '../components/UpcomingPanel'
import DateNav from '../components/DateNav'
import PendingTasksPanel from '../components/PendingTasksPanel'
import WeekView from '../components/WeekView'
import MonthView from '../components/MonthView'
import { fetchBlocksForDate, fetchBlocksForRange, generateSchedule } from '../lib/queries/schedule'
import { markTaskDone, markTaskPending, fetchPendingTasks } from '../lib/queries/tasks'
import { nowMinutes, timeStrToMinutes } from '../lib/timeUtils'
import { todayStr, getWeekStart, addDays, getMonthStart, getMonthEnd } from '../lib/dateUtils'
import type { ScheduleBlock, Task, View } from '../lib/types'

const NOTIFY_WINDOW_MIN = 5

export default function Dashboard() {
  const { userId, profile } = useAuth()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [view, setView] = useState<View>('day')
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const notifiedRef = useRef<Set<string>>(new Set())

  const dayStart = profile?.day_start?.slice(0, 5) ?? '08:00'
  const dayEnd = profile?.day_end?.slice(0, 5) ?? '22:00'

  async function loadData(uid: string, date: string, v: View) {
    setLoading(true)
    setError(null)
    try {
      if (v === 'day') {
        const [dayBlocks, tasks] = await Promise.all([
          fetchBlocksForDate(uid, date),
          fetchPendingTasks(uid),
        ])
        setBlocks(dayBlocks)
        setPendingTasks(tasks)
      } else if (v === 'week') {
        const weekStart = getWeekStart(date)
        const weekEnd = addDays(weekStart, 6)
        setBlocks(await fetchBlocksForRange(uid, weekStart, weekEnd))
        setPendingTasks([])
      } else {
        setBlocks(await fetchBlocksForRange(uid, getMonthStart(date), getMonthEnd(date)))
        setPendingTasks([])
      }
    } catch {
      setError('שגיאה בטעינת לוח הזמנים')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userId) loadData(userId, selectedDate, view)
  }, [userId, selectedDate, view])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const checkNotifications = useCallback(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const now = nowMinutes()
    blocks.forEach(block => {
      if (block.block_type === 'break') return
      if (notifiedRef.current.has(block.id)) return
      if (block.task_id && doneTaskIds.has(block.task_id)) return
      const startMin = timeStrToMinutes(block.start_time)
      if (startMin - now <= NOTIFY_WINDOW_MIN && startMin - now > 0) {
        new Notification('SmartTime', { body: `${block.title} מתחיל בקרוב` })
        notifiedRef.current.add(block.id)
      }
    })
  }, [blocks, doneTaskIds])

  useEffect(() => {
    const id = setInterval(checkNotifications, 60_000)
    return () => clearInterval(id)
  }, [checkNotifications])

  async function handleGenerate() {
    if (!userId) return
    setGenerating(true)
    setError(null)
    notifiedRef.current = new Set()
    try {
      const newBlocks = await generateSchedule(selectedDate)
      setBlocks(newBlocks)
      setPendingTasks(await fetchPendingTasks(userId))
    } catch {
      setError('שגיאה בבניית לוח הזמנים. נסה שוב.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleToggleDone(taskId: string) {
    const wasDone = doneTaskIds.has(taskId)
    setDoneTaskIds(prev => {
      const s = new Set(prev)
      wasDone ? s.delete(taskId) : s.add(taskId)
      return s
    })
    try {
      wasDone ? await markTaskPending(taskId) : await markTaskDone(taskId)
    } catch {
      setDoneTaskIds(prev => {
        const s = new Set(prev)
        wasDone ? s.add(taskId) : s.delete(taskId)
        return s
      })
    }
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date)
    setView('day')
  }

  const dayBlocks = view === 'day' ? blocks : []

  return (
    <div className="page dashboard-page">
      <div className="dashboard-header">
        <h2>לוח הזמנים שלי</h2>
        {view === 'day' && (
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'בונה את היום שלך...' : 'בנה את היום שלי ✨'}
          </button>
        )}
      </div>

      <DateNav
        date={selectedDate}
        view={view}
        onDateChange={setSelectedDate}
        onViewChange={setView}
      />

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-text">טוען...</div>
      ) : view === 'day' ? (
        <>
          <PendingTasksPanel tasks={pendingTasks} />
          <TimeGrid
            blocks={dayBlocks}
            dayStart={dayStart}
            dayEnd={dayEnd}
            doneTaskIds={doneTaskIds}
            onMarkDone={handleToggleDone}
          />
          <UpcomingPanel blocks={dayBlocks} doneTaskIds={doneTaskIds} />
        </>
      ) : view === 'week' ? (
        <WeekView
          blocks={blocks}
          selectedDate={selectedDate}
          dayStart={dayStart}
          dayEnd={dayEnd}
          onSelectDate={handleSelectDate}
        />
      ) : (
        <MonthView
          blocks={blocks}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exits 0 with no errors.

- [ ] **Step 3: Start dev server and verify visually**

Run: `npm run dev`

Verify:
1. Dashboard opens in Day view on today with "(היום)" label
2. `‹` / `›` arrows move prev/next day; label updates
3. Switching to Week shows 7 columns; today's column has blue background
4. Clicking any week column switches to Day view for that date
5. Switching to Month shows calendar grid; today's cell highlighted in blue
6. Clicking any month cell switches to Day view for that date
7. PendingTasksPanel appears above time grid in Day view; collapses/expands on click; hidden when no pending tasks
8. "Build My Day" only shows in Day view; clicking it builds a schedule for the selected date (not always today)
9. After generating, blocks appear in the day grid; week/month views show colored bars for days with blocks

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: wire DateNav, PendingTasksPanel, WeekView, MonthView into Dashboard"
```
