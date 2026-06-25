export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function getWeekStart(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const day = d.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day // shift to Monday
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
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
  return d.toISOString().split('T')[0]
}

export function getMonthCells(date: string): (string | null)[] {
  const start = new Date(getMonthStart(date) + 'T00:00:00')
  const end = new Date(getMonthEnd(date) + 'T00:00:00')
  const startDay = start.getDay() // 0 = Sun
  const padding = startDay === 0 ? 6 : startDay - 1 // Monday-based
  const cells: (string | null)[] = Array(padding).fill(null)
  const cur = new Date(start)
  while (cur <= end) {
    cells.push(cur.toISOString().split('T')[0])
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
