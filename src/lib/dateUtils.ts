// Serialize a Date from its LOCAL components. Never use toISOString() here:
// it converts to UTC, which in any timezone ahead of UTC (e.g. Israel, UTC+2/3)
// shifts the calendar date back a day on the parse→serialize round-trip.
function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return fmt(new Date())
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return fmt(d)
}

export function getWeekStart(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const day = d.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day // shift to Monday
  d.setDate(d.getDate() + diff)
  return fmt(d)
}

export function getWeekDates(date: string): string[] {
  const mon = getWeekStart(date)
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

export function getMonthStart(date: string): string {
  return date.slice(0, 8) + '01'
}

export function getMonthEnd(date: string): string {
  const d = new Date(date.slice(0, 7) + '-01T00:00:00')
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  return fmt(d)
}

export function getMonthCells(date: string): (string | null)[] {
  const start = new Date(getMonthStart(date) + 'T00:00:00')
  const end = new Date(getMonthEnd(date) + 'T00:00:00')
  const startDay = start.getDay() // 0 = Sun
  const padding = startDay === 0 ? 6 : startDay - 1 // Monday-based
  const cells: (string | null)[] = Array(padding).fill(null)
  const cur = new Date(start)
  while (cur <= end) {
    cells.push(fmt(cur))
    cur.setDate(cur.getDate() + 1)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function isToday(date: string): boolean {
  return date === todayStr()
}

export function formatDayLabel(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}
