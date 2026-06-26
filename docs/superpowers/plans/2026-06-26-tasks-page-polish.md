# Tasks Page Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Tasks page so the "Build my day" button lives in the same toolbar row as the DateNav instead of floating disconnected above it.

**Architecture:** Two-file change. `Tasks.tsx` restructures the header section — the `dashboard-header` div shrinks to just the `<h2>`, and a new `tasks-toolbar` div wraps `<DateNav>` and the CTA button side-by-side. `App.css` adds `.tasks-toolbar` flex styles and overrides DateNav's own bottom margin when nested inside it.

**Tech Stack:** React 19, TypeScript, plain CSS (RTL/logical properties), Vite dev server.

## Global Constraints

- All CSS must use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`) — never `left`/`right`.
- Direction is RTL throughout.
- No new dependencies, no new component files.
- There are no automated tests — visual validation via browser automation is the verification step.

---

### Task 1: Restructure Tasks.tsx header + add toolbar CSS

**Files:**
- Modify: `src/pages/Tasks.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: existing `DateNav`, `btn-cta`, `dashboard-header`, `date-nav` classes
- Produces: new `tasks-toolbar` class; `.tasks-page .dashboard-header` becomes unused and should be removed from CSS if present (it isn't — the rule only existed on `.dashboard-page .dashboard-header`)

- [ ] **Step 1: Update `src/pages/Tasks.tsx`**

Replace the header + DateNav block. The `dashboard-header` div keeps the `<h2>` only. A new `tasks-toolbar` div wraps `<DateNav>` and the button:

```tsx
return (
  <div className="page tasks-page">
    <div className="dashboard-header">
      <h2>המשימות שלי</h2>
    </div>
    <div className="tasks-toolbar">
      <DateNav
        date={selectedDate}
        view="day"
        onDateChange={setSelectedDate}
        onViewChange={() => {}}
      />
      <button className="btn-cta" onClick={handleBuild} disabled={generating}>
        {generating ? 'בונה את היום שלך...' : 'בנה את היום שלי'}
      </button>
    </div>
    {error && <div className="error-banner">{error}</div>}
    {buildMsg && <div className="info-banner">{buildMsg}</div>}
    {unscheduled.length > 0 && (
      <div className="warning-banner">
        {unscheduled.length} משימות לא נכנסו ללוח הזמנים: {unscheduled.map(t => t.title).join(', ')}
      </div>
    )}
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
```

- [ ] **Step 2: Add `.tasks-toolbar` to `src/App.css`**

Insert after the `/* ── Tasks page ── */` comment block (around line 343), before `.tasks-page .tasks-layout`:

```css
.tasks-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-block-end: 1.25rem;
  flex-wrap: wrap;
}

.tasks-toolbar .date-nav {
  margin-bottom: 0;
}
```

- [ ] **Step 3: Verify visually — start the dev server**

```bash
npm run dev
```

Open http://localhost:5173 and navigate to the Tasks page. Confirm:
- "המשימות שלי" heading appears alone on the top line
- DateNav (date label + arrows + today button) and "בנה את היום שלי" button appear on the same row below the heading, flush to opposite ends (button on the left in RTL, DateNav on the right)
- No extra vertical gap between the toolbar and the two-column content area
- Button still triggers schedule generation (click it, confirm loading state appears)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Tasks.tsx src/App.css
git commit -m "feat: move build-my-day button into tasks toolbar alongside DateNav"
```
