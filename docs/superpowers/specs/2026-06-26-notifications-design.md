# Notification System Design

**Date:** 2026-06-26  
**Status:** Approved

## Overview

Add app-wide task notifications (browser push + in-app bell) that alert the user 10 minutes and 1 minute before each scheduled block starts.

## Architecture

### NotificationContext (`src/context/NotificationContext.tsx`)

A new React context that wraps the entire app (inside `AuthContext` so `userId` is available).

**Responsibilities:**
- Request browser `Notification` permission on first render
- Fetch today's `schedule_blocks` and today's `tasks` from Supabase on mount, then re-fetch every 60 seconds
- On each tick, compare each block's `start_time` against `nowMinutes()`:
  - `startMin - now` in range 9–11 → fire "10 min" notification
  - `startMin - now` in range 0–2 → fire "1 min" notification
- Track fired notifications with a `notifiedRef` keyed by `${block.id}:10` and `${block.id}:1` to prevent duplicates
- Append each fired notification to an in-memory `notifications` array
- Expose `notifications`, `unreadCount`, `markAllRead()` to consumers

**Notification object shape:**
```ts
type AppNotification = {
  id: string          // `${block.id}:${threshold}`
  title: string       // block title
  firedAt: Date       // when the notification fired
  threshold: '10' | '1'  // minutes before start
  read: boolean
}
```

**Lifecycle:**
- Only starts when `userId` is non-null
- Clears interval and resets `notifications` to `[]` when user signs out (`userId` becomes null)

### Done-task filtering

On each tick, the context fetches today's tasks and builds a `Set<string>` of `task_id`s where `status = 'done'`. Blocks whose `task_id` is in this set are skipped. Break blocks (`task_id = null`) always notify.

### Dashboard cleanup

Remove from `Dashboard.tsx`:
- `NOTIFY_WINDOW_MIN` constant
- `notifiedRef`
- `checkNotifications` callback
- The `useEffect` that calls `setInterval(checkNotifications, 60_000)`
- The `useEffect` that calls `Notification.requestPermission()`

## Bell UI (NavBar)

### Bell button
- Positioned at the inline-start end of `.navbar-links` (appears left in RTL)
- Inline SVG bell icon, no emoji
- Red badge dot showing `unreadCount`; hidden when count is 0
- Clicking toggles the dropdown and calls `markAllRead()`

### Dropdown panel
- Appears below the bell, positioned with `position: absolute`
- Closes on outside click (`document` click listener in `useEffect`)
- z-index above navbar (z-index: 150)

**Header row:**
- Label: "התראות"
- Link: "סמן הכל כנקרא" (calls `markAllRead()`, hidden when all read)

**Notification rows (newest-first):**
- Task title (bold)
- Threshold label: "10 דקות לפני" or "דקה אחת לפני"
- Time the notification fired (HH:MM)
- Unread items: subtle `--accent` inline-start border + slightly tinted background

**Empty state:** "אין התראות"

**Overflow:** `max-height` with `overflow-y: auto` for long lists

## Error handling

- Fetch failures are silently swallowed — a failed poll shouldn't disrupt the UI; next tick retries
- If browser notifications are denied, the in-app bell + dropdown still work normally
- No error state exposed to the user for notification fetch failures

## Files changed

| File | Change |
|---|---|
| `src/context/NotificationContext.tsx` | New — notification engine + context |
| `src/components/NavBar.tsx` | Add bell button + dropdown |
| `src/App.tsx` | Wrap with `NotificationProvider` |
| `src/App.css` | Bell + dropdown styles (RTL-safe logical properties) |
| `src/pages/Dashboard.tsx` | Remove old notification stub |
