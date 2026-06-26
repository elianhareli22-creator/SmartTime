# SmartTime — Entity Relationship Diagram

All six tables live in Supabase PostgreSQL. Every table has RLS enabled; all queries are automatically scoped to `auth.uid() = user_id`.

```mermaid
erDiagram
  profiles ||--o{ tasks : "has"
  profiles ||--o{ schedule_blocks : "owns"
  profiles ||--o{ break_templates : "owns"
  profiles ||--o{ chat_sessions : "owns"
  tasks ||--o{ schedule_blocks : "scheduled_as"
  chat_sessions ||--o{ chat_messages : "contains"

  profiles {
    uuid id PK
    text display_name
    time day_start
    time day_end
    timestamptz created_at
  }

  tasks {
    uuid id PK
    uuid user_id FK
    text title
    text description
    int estimated_minutes
    text priority
    timestamptz deadline
    time fixed_start
    text status
    date scheduled_date
    timestamptz created_at
  }

  schedule_blocks {
    uuid id PK
    uuid user_id FK
    uuid task_id FK
    date date
    time start_time
    time end_time
    text block_type
    text title
  }

  break_templates {
    uuid id PK
    uuid user_id FK
    text title
    time start_time
    time end_time
    text recurrence_type
    date recurrence_date
    date recurrence_date_start
    date recurrence_date_end
    smallint recurrence_day_of_week
    timestamptz created_at
  }

  chat_sessions {
    uuid id PK
    uuid user_id FK
    text title
    timestamptz created_at
  }

  chat_messages {
    uuid id PK
    uuid session_id FK
    text role
    text text
    timestamptz created_at
  }
```

## Table descriptions

| Table | Purpose |
|---|---|
| `profiles` | User display name and day window (start / end time) |
| `tasks` | Tasks with priority, estimated duration, optional deadline and fixed-start pin |
| `schedule_blocks` | AI-generated or break time blocks, one row per block per date |
| `break_templates` | Recurring or one-off break rules injected into every generated schedule |
| `chat_sessions` | AI assistant conversation containers |
| `chat_messages` | Individual user / model messages inside a chat session |

## Key constraints

- `tasks.priority` — `low | medium | high`
- `tasks.status` — `pending | done`
- `schedule_blocks.block_type` — `task | break`
- `chat_messages.role` — `user | model`
- `break_templates.recurrence_type` — `date | date_range | daily | weekly`
- All times stored as `HH:MM:SS`; all dates as `YYYY-MM-DD`
