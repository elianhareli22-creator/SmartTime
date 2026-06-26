# Tasks Page Polish

**Date:** 2026-06-26  
**Status:** Approved

## Problem

The Tasks page uses `<div className="dashboard-header">` but the CSS scopes that header's flex layout to `.dashboard-page .dashboard-header`. On the tasks page the title and "Build my day" button stack vertically instead of sitting side-by-side, making the button look detached and out of place.

## Goal

Polish the Tasks page so it has a clean visual hierarchy and the "Build my day" button feels contextually placed — without changing the two-column list/form layout or any component APIs.

## Design

### Approach: Integrated Toolbar (B)

The "Build my day" button is a date-specific action — it builds the schedule for the currently selected date. Moving it next to the DateNav groups related controls together and fixes the detached feeling.

### Page structure (RTL, top to bottom)

```
┌─────────────────────────────────────────────────────────┐
│  המשימות שלי                                            │  ← h2, standalone heading
├─────────────────────────────────────────────────────────┤
│  [יום | שבוע | חודש]  ‹  יום שבת, 27 ביוני  ›  [היום]  │  [בנה את היום שלי]  │
│                        .tasks-toolbar row                │
├─────────────────────────────────────────────────────────┤
│  [banners: error / info / warning if present]           │
├───────────────────────────────┬─────────────────────────┤
│  task list (flex: 1)          │  form panel (320px)      │
└───────────────────────────────┴─────────────────────────┘
```

### Changes

#### `src/pages/Tasks.tsx`

- Remove `btn-cta` button from inside the `dashboard-header` div. The `dashboard-header` div becomes a plain heading wrapper (or just the `<h2>` directly, with the div removed).
- Add a new `<div className="tasks-toolbar">` wrapping `<DateNav>` and the "Build my day" `<button>` as siblings.

#### `src/App.css`

- Remove or repurpose `.tasks-page .dashboard-header` — the header is now just the h2 with standard page heading margin.
- Add `.tasks-toolbar`:
  ```css
  .tasks-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }
  ```
- When `.date-nav` is inside `.tasks-toolbar`, zero its own `margin-bottom` so the toolbar controls the spacing:
  ```css
  .tasks-toolbar .date-nav { margin-bottom: 0; }
  ```

### What does NOT change

- `TaskForm`, `TaskList`, `DateNav` — no component changes.
- Two-column layout (`.tasks-layout`, `.tasks-list-col`, `.tasks-form-col`) — unchanged.
- All banner styles — unchanged.
- Button styling (`btn-cta`) — unchanged.

## Out of scope

- Mobile layout (the existing `@media (max-width: 640px)` column-stack behavior is preserved).
- Task list item design.
- Form field design.
