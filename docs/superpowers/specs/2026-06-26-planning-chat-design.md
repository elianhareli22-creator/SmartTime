# Planning Chat — Design Spec
_Date: 2026-06-26_

## Overview

A dedicated `/chat` page where the user converses with Gemini 2.5 Flash to plan their day. The AI has full context (tasks, today's schedule, profile, current time) and can execute actions — create, update, delete tasks, move schedule blocks, and regenerate the schedule — all from a single chat message. History is session-only (cleared on navigate/refresh).

---

## Architecture

```
/chat page (React)
│
├── on mount: fetch tasks + today's blocks + profile → build context object
├── ChatMessage[] in useState (session-only)
├── user types message → POST to Edge Function `chat`
│     body: { message, history, context }
│
└── Supabase Edge Function: chat (Deno)
      ├── verify JWT → user_id
      ├── build Gemini request:
      │     systemInstruction = full context (tasks with IDs, blocks with IDs, profile, current time)
      │     tools = [create_task, update_task, delete_task, move_block, generate_schedule]
      │     contents = conversation history + new user message
      ├── call Gemini 2.5 Flash with function calling
      ├── if Gemini returns functionCall parts:
      │     execute each against DB (in order)
      │     send functionResponse parts back to Gemini for final text reply
      └── return { reply: string, actionsPerformed: ToolCall[] }

/chat page (after response)
└── append assistant message to history
    if actionsPerformed.length > 0 → re-fetch tasks + blocks
```

All DB mutations flow through the Edge Function. The `/chat` page never writes to the database directly.

---

## AI Tools

The Edge Function declares five tools to Gemini:

| Tool | Parameters | What it does |
|---|---|---|
| `create_task` | title, estimated_minutes, priority, deadline?, fixed_start? | Inserts a new task row |
| `update_task` | task_id, title?, estimated_minutes?, priority?, deadline?, fixed_start? | Updates any fields on an existing task |
| `delete_task` | task_id | Deletes the task (cascades to schedule_blocks) |
| `move_block` | block_id, new_start_time, new_end_time | Updates start/end on a schedule_block for today |
| `generate_schedule` | — | Regenerates today's schedule (reuses generate-schedule logic) |

Gemini can chain multiple tools in a single round-trip. The system prompt includes task IDs and block IDs so Gemini can resolve references without asking the user.

---

## Data Flow

### Request (frontend → Edge Function)
```typescript
{
  message: string
  history: { role: 'user' | 'model', text: string }[]
  context: {
    tasks: Task[]
    blocks: ScheduleBlock[]
    profile: Profile
    nowTime: string   // "HH:MM"
    today: string     // "YYYY-MM-DD"
  }
}
```

### Response (Edge Function → frontend)
```typescript
{
  reply: string
  actionsPerformed: {
    tool: string
    args: Record<string, unknown>
    result: 'ok' | 'error'
    detail?: string
  }[]
}
```

### Edge Function steps
1. Verify JWT, extract `user_id`
2. Build `systemInstruction` from context (tasks with IDs, blocks with IDs, profile, time)
3. Build `contents` array from history + new user message
4. Call Gemini with `tools` declaration → receive response
5. If response contains `functionCall` parts: execute each in order against Supabase
6. If tools were called: send `functionResponse` parts back to Gemini → receive final text reply
7. Return `{ reply, actionsPerformed }`

### Frontend steps
1. Append user message to state
2. Show typing indicator ("...")
3. POST to `chat` Edge Function with auth header
4. On response: append assistant message, hide indicator
5. If `actionsPerformed.length > 0`: re-fetch tasks + blocks to keep context fresh

---

## UI

Full-height chat layout, RTL Hebrew, consistent with existing SmartTime style.

```
┌─────────────────────────────────────────┐
│  NavBar  (link "צ'אט" added)            │
├─────────────────────────────────────────┤
│                                         │
│  [assistant bubble] שלום! אני כאן       │
│  לעזור לך לתכנן את היום שלך.           │
│                                         │
│        [user bubble] הוסף משימה חדשה   │
│                        של שעה לקוד     │
│                                         │
│  [assistant bubble] יצרתי משימה        │
│  "קוד" — 60 דקות, עדיפות בינונית.      │
│  רוצה שאבנה מחדש את היום?             │
│                                         │
│                            ↕ scrollable │
├─────────────────────────────────────────┤
│  [ הקלד הודעה...              ] [שלח]  │
└─────────────────────────────────────────┘
```

- **Bubbles:** user right-aligned, assistant left-aligned (RTL-natural)
- **Loading:** "..." typing indicator while waiting for Edge Function response
- **Action narration:** assistant reply describes what was done ("יצרתי / מחקתי / עדכנתי") — no separate confirmation modal
- **Error state:** inline error message in chat on Edge Function failure
- **NavBar:** add "צ'אט" link alongside existing nav links

---

## New Files

| File | Purpose |
|---|---|
| `supabase/functions/chat/index.ts` | New Edge Function — Gemini function-calling + DB mutations |
| `src/pages/Chat.tsx` | New `/chat` page — message list, input, state management |
| `src/lib/queries/chat.ts` | `sendChatMessage(...)` helper wrapping `supabase.functions.invoke('chat')` |

## Modified Files

| File | Change |
|---|---|
| `src/App.tsx` | Add `/chat` route |
| `src/components/NavBar.tsx` | Add "צ'אט" nav link |

---

## Out of Scope

- Persistent chat history (session-only by design)
- Message timestamps
- File/image attachments
- Multi-day schedule manipulation (today only)
- Preserving manual `move_block` edits after a subsequent `generate_schedule` call — regenerating the schedule overwrites all blocks, so any manual moves are lost (same behavior as the existing "Build my day" button)
