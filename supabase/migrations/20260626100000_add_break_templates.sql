CREATE TABLE break_templates (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title                  text NOT NULL,
  start_time             time NOT NULL,
  end_time               time NOT NULL,
  recurrence_type        text NOT NULL CHECK (recurrence_type IN ('date', 'date_range', 'daily', 'weekly')),
  recurrence_date        date,
  recurrence_date_start  date,
  recurrence_date_end    date,
  recurrence_day_of_week smallint,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE break_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own break_templates"
  ON break_templates FOR ALL
  USING (auth.uid() = user_id);
