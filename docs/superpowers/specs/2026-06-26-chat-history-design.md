# Chat History — Design

**Date:** 2026-06-26
**Status:** Approved

## Problem

The chat page is purely in-memory. Navigating away or refreshing discards the entire conversation. There is no way to revisit what the AI did in a previous session.

## Goal

- Persist every message to the database as it is sent or received.
- A page refresh resumes the current session seamlessly.
- A "New chat" button saves and titles the current session, then starts a fresh one.
- A left sidebar lists past sessions (AI-generated title + date), newest first.
- Clicking a past session shows its messages read-only.
- No memory crosses session boundaries — each session sends only its own history to the edge function.

## Non-goals

- No search across sessions.
- No session deletion (no delete button).
- No export or sharing.
- No pagination (fetch all sessions; trim later if needed).

## Schema

Two new tables:

```sql
CREATE TABLE chat_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title      text,           -- null while session is active; set on "New chat"
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own sessions"
  ON chat_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE TABLE chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'model')),
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own messages via session"
  ON chat_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions s
      WHERE s.id = chat_messages.session_id
        AND s.user_id = auth.uid()
    )
  );
```

Regenerate `src/lib/database.types.ts` after applying.

Add to `src/lib/types.ts`:
```ts
export type ChatSession = {
  id: string
  user_id: string
  title: string | null
  created_at: string
}

export type ChatMessage = {
  id: string
  session_id: string
  role: 'user' | 'model'
  text: string
  created_at: string
}
```

Note: the existing `ChatMessage` type in `src/lib/queries/chat.ts` (currently `{ role, text }`) becomes an inline type used only for the edge-function request body. The DB-backed type above replaces it as the primary type.

## Query helpers — `src/lib/queries/chat.ts`

```ts
createSession(userId: string): Promise<string>
// INSERT into chat_sessions, return new id

appendMessage(sessionId: string, role: 'user' | 'model', text: string): Promise<void>
// INSERT into chat_messages

fetchSessions(userId: string): Promise<ChatSession[]>
// SELECT id, title, created_at FROM chat_sessions WHERE user_id = $1 ORDER BY created_at DESC

fetchMessages(sessionId: string): Promise<ChatMessage[]>
// SELECT role, text FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC

updateSessionTitle(sessionId: string, title: string): Promise<void>
// UPDATE chat_sessions SET title = $2 WHERE id = $1
```

## Edge function — `title-chat-session`

New lightweight Deno function.

**Input:** `{ sessionId: string }` (JWT required)

**Logic:**
1. Verify JWT, extract `userId`.
2. Fetch up to 10 messages for the session (confirms it belongs to the user via RLS).
3. If 0 messages → return `{ title: null }` (caller discards the empty session, no title set).
4. Send to Gemini: *"Summarize the following chat in 4–6 Hebrew words as a short title. Reply with only the title, no punctuation."*
5. `updateSessionTitle(sessionId, title)` then return `{ title }`.

The existing `chat` edge function is unchanged — it receives `history` from the client exactly as before.

## Frontend

### Layout — `src/pages/Chat.tsx`

Two-column layout:

```
┌─────────────────┬──────────────────────────────────┐
│  Sidebar        │  Chat area                        │
│  [+ שיחה חדשה]  │  [messages]                      │
│                 │                                   │
│  26/06          │                                   │
│  הוספת משימות   │                                   │
│  לשבוע הבא     │                                   │
│                 │                                   │
│  25/06          │  [textarea] [שלח]                 │
│  הזזת פגישת     │                                   │
│  רופא שיניים   │                                   │
└─────────────────┴──────────────────────────────────┘
```

### Session state

`currentSessionId: string | null` in React state, mirrored to `localStorage` key `chat_session_id`.

**On mount:**
1. Read `localStorage` for a session id.
2. If found → `fetchMessages(id)` → hydrate message list, set `currentSessionId`.
3. If not found → `createSession(userId)` → set `currentSessionId`, store in `localStorage`, show greeting.

**On send:**
1. `appendMessage(sessionId, 'user', text)` immediately (before the edge-function call).
2. Call edge function with history (all prior DB messages, excluding the one just sent — edge function appends it itself).
3. `appendMessage(sessionId, 'model', response.reply)` on success.

**"New chat" button:**
1. If `currentSessionId` and messages.length > 0: call `title-chat-session` with sessionId. Sidebar updates with returned title.
2. `createSession(userId)` → new id → store in `localStorage` → reset messages to greeting.
3. If messages.length === 0: skip title call, reuse or discard the empty session (just reset state; don't create another empty one).

### Sidebar

- Fetches `fetchSessions(userId)` on mount and after "New chat" completes.
- Each entry: title (or "שיחה פעילה" if `title === null`) + formatted date.
- Active session highlighted.
- Clicking a past session: `fetchMessages(id)` → display read-only, hide or disable textarea with label "שיחה זו הסתיימה".
- Clicking the active session: restores the live chat view.

### Read-only past sessions

When a past session is open, `currentSessionId` remains unchanged (still the active one). A separate `viewingSessionId` piece of state tracks what's displayed. If `viewingSessionId !== currentSessionId`, the input area is hidden.

## Files touched

- `supabase/migrations/<ts>_add_chat_history.sql` (new)
- `supabase/functions/title-chat-session/index.ts` (new)
- `src/lib/database.types.ts` (regenerated)
- `src/lib/types.ts` (add `ChatSession`, `ChatMessage` DB types)
- `src/lib/queries/chat.ts` (add all helpers; update `ChatMessage` inline type)
- `src/pages/Chat.tsx` (sidebar + session lifecycle)
- `src/App.css` (sidebar layout styles)

## Testing / validation

1. Send a message → refresh page → session resumes with prior messages.
2. Click "New chat" → sidebar shows titled previous session → fresh greeting appears.
3. Click a past session → messages show read-only, no input.
4. Click back to active session → input restored.
5. Empty session → "New chat" does not title it; no extra empty session appears in sidebar.
