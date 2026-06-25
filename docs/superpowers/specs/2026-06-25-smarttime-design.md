# SmartTime — Design Spec
_Date: 2026-06-25_

## Overview

SmartTime is an AI daily planner. Users add tasks; an Edge Function calls Gemini to arrange them into a conflict-free time-blocked schedule; the result renders as a pixel-precise time-grid on the Dashboard; users mark tasks done.

**Golden path:** Sign in with Google → add tasks → "Build my day" → AI schedule renders on time-grid → mark task done.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React TS, vanilla CSS, RTL (`direction: rtl`) |
| Backend / DB / Auth | Supabase (PostgreSQL, Auth, Edge Functions) |
| AI | Google Gemini 2.5 Flash via REST, Edge Function only |
| Auth provider | Google OAuth |
| Notifications | Browser Notification API (in-tab only, no service worker) |
| Deploy | Vercel (frontend) + Supabase Cloud (backend) |

---

## Architecture

```
Browser (Vite + React TS)
│
├── AuthContext  — session, userId, profile (wraps entire app)
│
├── /login       — Google OAuth sign-in
├── /dashboard   — time-grid + "Build my day" + upcoming panel
├── /tasks       — task list + add/edit/delete form
└── /profile     — display_name, day_start, day_end
│
└── supabase.functions.invoke('generate-schedule')
        │
        └── Edge Function (Deno)
                ├── verify JWT → user_id
                ├── fetch pending tasks + profile
                ├── call Gemini 2.5 Flash (GEMINI_API_KEY secret)
                ├── deterministic repair pass
                └── upsert schedule_blocks for today → return blocks
```

**State management:** `AuthContext` provides session + profile app-wide (one mount, one `onAuthStateChange` subscription). Each page manages its own data with `useState`/`useEffect` + typed helpers from `src/lib/queries/`. After mutations, manually re-fetch. No external state library. No raw Supabase calls in components.

---

## Database Schema

```sql
-- profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  day_start time not null default '08:00',
  day_end time not null default '22:00',
  created_at timestamptz not null default now()
);

-- tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  estimated_minutes int not null default 30,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  deadline timestamptz,
  fixed_start time,
  status text not null default 'pending' check (status in ('pending','done')),
  created_at timestamptz not null default now()
);

-- schedule_blocks
create table schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  block_type text not null check (block_type in ('task','break'))
);
```

**RLS:** enabled on all three tables. Policy on each: `auth.uid() = user_id` (or `= id` for profiles), all operations.

**Indexes:** `tasks(user_id, status)`, `schedule_blocks(user_id, date)`.

**Trigger:** `handle_new_user()` — fires `after insert on auth.users`, inserts profile row with `display_name` from `raw_user_meta_data->>'full_name'`. Profile always exists by first page load.

---

## Auth Flow

1. Unauthenticated user lands on any route → `ProtectedRoute` reads `session` from `AuthContext` → redirects to `/login`
2. `/login`: "כניסה עם Google" → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`
3. Supabase handles OAuth callback, sets session
4. `onAuthStateChange` fires in `AuthContext` → session set → profile fetched → `ProtectedRoute` passes → redirect to `/dashboard`
5. Sign-out: `supabase.auth.signOut()` in NavBar → `onAuthStateChange` fires null → redirect to `/login`

**Loading states:** while `session === undefined` (resolving) or `profile === undefined` (fetching), show `.loading` spinner. No blank screens.

---

## Task CRUD (Tasks Page)

**Layout:** task list (left, RTL = primary column) + add/edit form (below on mobile, side panel on wider screens).

**Task list:**
- Fetched on mount, ordered by `created_at desc`
- Each row: title, priority dot (green/yellow/red), estimated minutes, deadline/fixed_start if present, status, Edit + Delete buttons
- Delete: inline confirm ("מחק / ביטול" text swap, no `window.confirm`)
- Done tasks: strikethrough, still editable/deletable

**Form fields:** title (required), estimated_minutes (positive int, default 30), priority (select, default medium), deadline (optional datetime-local), fixed_start (optional time).

**Validation:** on submit, inline error messages below each invalid field. No alert dialogs.

**Edit mode:** clicking Edit populates form, submit label becomes "עדכן". Cancel clears form back to add mode.

**Mutations:** insert/update/delete via Supabase client → re-fetch task list.

---

## Edge Function: `generate-schedule`

**Trigger:** `supabase.functions.invoke('generate-schedule')` from Dashboard.

**Steps:**
1. Verify JWT → `user_id`
2. Fetch `pending` tasks + profile (`day_start`, `day_end`)
3. If zero tasks → return `{ blocks: [] }`
4. Build Gemini prompt: task list with estimated_minutes, priority, deadline, fixed_start; instruct to place high-priority/deadline-bound tasks early, respect fixed_start exactly, add short breaks between long tasks, stay inside day window; output JSON only
5. Call Gemini 2.5 Flash REST with `responseMimeType: "application/json"` + response schema

**Gemini output schema:**
```json
{ "blocks": [
  { "task_id": "uuid|null", "title": "string", "start_time": "HH:MM", "end_time": "HH:MM", "block_type": "task|break" }
]}
```

**Deterministic repair pass (always runs):**
1. Pin `fixed_start` tasks to exact slots
2. Clamp/drop blocks outside `[day_start, day_end]`
3. Sort by start_time; greedy re-pack to resolve overlaps (push later blocks)
4. Ensure every pending task appears exactly once; append missing tasks at end

**Fallback:** if Gemini response won't parse → retry once with stricter prompt → if still fails, build deterministic greedy schedule (sort by priority then deadline, pack sequentially). Always returns a valid schedule.

**Persistence:** delete `schedule_blocks` where `user_id = user_id AND date = today`, insert validated set, return all inserted blocks.

**Return to client:** `{ blocks: [...] }` — client renders directly, no second fetch needed.

---

## Dashboard Time-Grid

**Layout:**
```
[time column — right/RTL]  [blocks column — left, position: relative]
08:00                       ┌─────────────────────┐
                            │  Task A  09:00–10:30 │
09:00                       └─────────────────────┘
                            ┌──────────┐
10:00                       │ הפסקה    │
                            └──────────┘
...
```

**Sizing:** `px_per_minute = 1.5` → 1 hour = 90px. 14-hour day (08:00–22:00) = 1260px height.

**Block positioning:**
```
top    = (block.start_time - day_start) * px_per_minute
height = (block.end_time - block.start_time) * px_per_minute
```

**Block styles:**
- Task block: `--primary` background, white text, rounded
- Break block: light gray, "הפסקה" label, no checkbox
- Done task: 50% opacity + strikethrough title
- "Now" line: red 2px horizontal rule, `position: absolute`, updated every 60s

**"Build my day" button:** above the grid. During invoke: disabled + "בונה את היום שלך…" spinner. On success: grid replaces with new blocks. On error: inline error banner, grid unchanged.

**Mark done:** checkbox on each task block → `update tasks set status='done'` + optimistic dim (immediate visual feedback, revert on error).

**Empty state (no tasks):** message + link to `/tasks` instead of empty grid.

---

## Notifications + Upcoming Panel

**Upcoming panel:** below the time-grid, shows next 3 blocks that haven't started yet. Updates every 60s.

**Browser Notification API:**
- Request permission once on Dashboard mount
- Every 60s: check each pending block — if start_time is within 5 minutes and not yet notified, fire `new Notification('SmartTime', { body: '${title} מתחיל בקרוב' })`
- Track fired notifications in `useRef` Set (by block id), cleared on block regeneration
- If permission denied: upcoming panel still works, no OS notification, no retry

**Cleanup:** interval cleared on Dashboard unmount.

---

## RTL + Responsive CSS

**RTL:** `direction: rtl` on `html` (already set). Time column sits on the right naturally with flexbox. Block titles right-aligned. Checkboxes on the left (visual action side in RTL).

**New CSS classes:** `.day-grid`, `.time-col`, `.blocks-col`, `.schedule-block` (+ `.task`, `.break`, `.done` modifiers), `.now-line`, `.upcoming-panel`, `.task-form`, `.task-list`.

**Responsive (≤600px):** `.blocks-col` font-size `0.8rem`, block titles `text-overflow: ellipsis`, `.time-col` width `36px`. Same time-grid layout at all screen sizes; users scroll vertically.

---

## Checkpoints (Human Actions Required)

| # | What | Status |
|---|---|---|
| A | Supabase project — URL + anon key | ✅ Done (credentials in `.env`) |
| B | Google OAuth — Client ID + Secret in Supabase Auth | Pending |
| C | Gemini API key as Supabase secret | Pending |
| D | Deploy to Vercel + add production URL to Google + Supabase | Pending |

---

## Final Acceptance Gate

From the live Vercel URL in a fresh browser:
1. Google sign-in works
2. Add tasks → "Build my day" → valid schedule renders → mark done — all work
3. RLS confirmed: second account cannot see first account's data
4. Gemini key absent from all client code and network responses
5. ERD matches live schema
6. UI is RTL-correct and responsive on mobile and desktop
