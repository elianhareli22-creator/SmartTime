# Loading States Design

**Date:** 2026-06-26  
**Status:** Approved

## Problem

Navigating directly to any page shows a white flash or invisible "טוען..." text while auth or page data loads. Chat in particular has no loading state for its initial data fetch.

## Solution

A single shared `<Spinner />` component used at every loading boundary.

## Spinner Component

**File:** `src/components/Spinner.tsx`

- 28×28px circle
- Border track: `var(--border)`
- Active arc: `var(--accent)` (deep navy)
- Rotation: 0.7s linear infinite
- CSS in `App.css` under a `/* ── Spinner ──` section

## Placement

| Location | Trigger | Container |
|---|---|---|
| `ProtectedRoute` | `session === undefined` or `profile === undefined` | `.page-loader` — full viewport, `--paper` background |
| `Dashboard` | `loading === true` | Replaces the `"טוען..."` text in the content area |
| `Tasks` | `loading === true` | Replaces the `"טוען..."` text in `.tasks-list-col` |
| `Chat` | new `loadingInitial` state | Covers entire `.chat-main` until sessions + stored session messages are fetched |

## Chat Initial Load

Chat currently has no loading state for its initial data fetch. Add:

```ts
const [loadingInitial, setLoadingInitial] = useState(true)
```

Set to `false` once both `fetchSessions` and (if applicable) `fetchMessages` for the stored session complete. Show `<Spinner />` in `.chat-main` while `loadingInitial` is true.

## CSS

```css
.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
```

## Out of Scope

- Skeleton screens
- Per-button loading spinners (already handled inline with disabled states)
- Optimistic UI
