# Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all "טוען..." text placeholders and missing loading states across Chat, Dashboard, Tasks, and ProtectedRoute with a consistent animated spinner.

**Architecture:** A single `Spinner` React component renders a CSS border-spin circle. It is wrapped in either `.page-loader` (full-viewport, used by ProtectedRoute) or `.content-loader` (padded flex center, used by page-level data loads). Chat gains a new `loadingInitial` state that gates the entire chat layout until the first data fetch completes.

**Tech Stack:** React 19, TypeScript, CSS custom properties (no external spinner library)

## Global Constraints

- All CSS must use logical properties — never hardcode `left`/`right`
- Colors must come from existing CSS custom properties: `--border`, `--accent`, `--paper`
- No new npm packages
- No comments added unless the WHY is non-obvious
- Spinner size: 28×28px, border: 2px, animation duration: 0.7s linear

---

### Task 1: Create Spinner component and CSS

**Files:**
- Create: `src/components/Spinner.tsx`
- Modify: `src/App.css` (add spinner + keyframe CSS after the existing `/* ── Loading ──` block)

**Interfaces:**
- Produces: `<Spinner />` — default export, no props
- Produces: `.page-loader` CSS class — full-viewport flex center with `--paper` background
- Produces: `.content-loader` CSS class — padded flex center for inline use

- [ ] **Step 1: Add CSS to `src/App.css`**

Find the existing `/* ── Loading ──` section (around line 275) and replace it with:

```css
/* ── Loading ─────────────────────────────────────────── */

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.page-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--paper);
}

.content-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
}

.loading-text {
  color: var(--muted);
  font-size: 0.9rem;
}
```

- [ ] **Step 2: Create `src/components/Spinner.tsx`**

```tsx
export default function Spinner() {
  return <div className="spinner" />
}
```

- [ ] **Step 3: Visual check**

Run `npm run dev`. Open the browser. Temporarily add `<Spinner />` to `src/App.tsx` and confirm the spinning arc appears with navy color on the warm background. Remove the temporary usage.

- [ ] **Step 4: Commit**

```bash
git add src/components/Spinner.tsx src/App.css
git commit -m "feat: add Spinner component and CSS"
```

---

### Task 2: Update ProtectedRoute to use Spinner

**Files:**
- Modify: `src/components/ProtectedRoute.tsx`

**Interfaces:**
- Consumes: `<Spinner />` from `src/components/Spinner.tsx`
- Consumes: `.page-loader` CSS class

- [ ] **Step 1: Update `src/components/ProtectedRoute.tsx`**

Replace the entire file with:

```tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Spinner from './Spinner'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth()

  if (session === undefined || (session && profile === undefined)) {
    return (
      <div className="page-loader">
        <Spinner />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 2: Visual check**

Open `http://localhost:5173` in a private/incognito window (forces auth loading). Confirm the spinner appears centered on the warm `--paper` background instead of blank white with text.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProtectedRoute.tsx
git commit -m "feat: show spinner in ProtectedRoute during auth load"
```

---

### Task 3: Update Dashboard to use Spinner

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `<Spinner />` from `../components/Spinner`
- Consumes: `.content-loader` CSS class

- [ ] **Step 1: Add Spinner import to `src/pages/Dashboard.tsx`**

Add to the import block at the top:

```tsx
import Spinner from '../components/Spinner'
```

- [ ] **Step 2: Replace the loading branch in the JSX**

Find this block (around line 185):

```tsx
{loading ? (
  <div className="loading-text">טוען...</div>
) : view === 'day' ? (
```

Replace with:

```tsx
{loading ? (
  <div className="content-loader"><Spinner /></div>
) : view === 'day' ? (
```

- [ ] **Step 3: Visual check**

Navigate to the Dashboard. On load (or change date) the spinner should briefly appear where the time grid will be, then the grid renders.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: show spinner while Dashboard data loads"
```

---

### Task 4: Update Tasks page to use Spinner

**Files:**
- Modify: `src/pages/Tasks.tsx`

**Interfaces:**
- Consumes: `<Spinner />` from `../components/Spinner`
- Consumes: `.content-loader` CSS class

- [ ] **Step 1: Add Spinner import to `src/pages/Tasks.tsx`**

```tsx
import Spinner from '../components/Spinner'
```

- [ ] **Step 2: Replace the loading branch in the JSX**

Find (around line 121):

```tsx
{loading ? (
  <p className="loading-text">טוען...</p>
) : (
  <TaskList
```

Replace with:

```tsx
{loading ? (
  <div className="content-loader"><Spinner /></div>
) : (
  <TaskList
```

- [ ] **Step 3: Visual check**

Navigate to the Tasks page. The spinner should appear in the list column while tasks fetch.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Tasks.tsx
git commit -m "feat: show spinner while Tasks data loads"
```

---

### Task 5: Add initial loading state to Chat

**Files:**
- Modify: `src/pages/Chat.tsx`

**Interfaces:**
- Consumes: `<Spinner />` from `../components/Spinner`
- Consumes: `.content-loader` CSS class

- [ ] **Step 1: Add `loadingInitial` state**

In `src/pages/Chat.tsx`, add after the `sending` state declaration (around line 46):

```tsx
const [loadingInitial, setLoadingInitial] = useState(true)
```

- [ ] **Step 2: Add Spinner import**

```tsx
import Spinner from '../components/Spinner'
```

- [ ] **Step 3: Update the initial data-fetch `useEffect`**

Find the `useEffect` that runs on `[userId]` (around line 50). Replace it with:

```tsx
useEffect(() => {
  if (!userId) return

  const storedId = localStorage.getItem(STORAGE_KEY)

  const sessionPromise = storedId
    ? fetchMessages(storedId)
        .then((msgs) => {
          if (msgs.length > 0) {
            setCurrentSessionId(storedId)
            setActiveMessages([GREETING, ...msgs.map(toWireMessage)])
          } else {
            localStorage.removeItem(STORAGE_KEY)
          }
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY))
    : Promise.resolve()

  Promise.all([
    fetchSessions(userId).then(setSessions).catch(console.error),
    sessionPromise,
  ]).finally(() => setLoadingInitial(false))
}, [userId])
```

- [ ] **Step 4: Gate the chat-main content**

In the JSX, find the `<div className="chat-main">` block. Replace its contents so that while `loadingInitial` is true the spinner is shown instead of the message list and input:

```tsx
<div className="chat-main">
  {loadingInitial ? (
    <div className="content-loader"><Spinner /></div>
  ) : (
    <>
      <div className="chat-messages">
        {loadingViewed ? (
          <div className="chat-loading">טוען...</div>
        ) : (
          displayMessages.map((m, i) => (
            <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
              {m.text}
            </div>
          ))
        )}
        {sending && (
          <div className="chat-bubble chat-bubble--model chat-bubble--typing">
            <span></span><span></span><span></span>
          </div>
        )}
        {error && <div className="chat-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {isViewingPast ? (
        <div className="chat-readonly-notice">שיחה זו הסתיימה</div>
      ) : (
        <div className="chat-input-area">
          <textarea
            className="chat-input"
            rows={1}
            placeholder="הקלד הודעה..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            שלח
          </button>
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 5: Visual check**

Navigate directly to `/chat` (not via link from another page). Confirm:
1. Spinner appears in the chat-main area briefly while sessions and stored session fetch
2. Once loaded, the GREETING message and input area appear
3. The sidebar sessions list populates at the same time

- [ ] **Step 6: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat: add initial loading spinner to Chat page"
```
