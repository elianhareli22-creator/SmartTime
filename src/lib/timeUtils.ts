export function timeStrToMinutes(t: string): number {
  // handles "HH:MM" and "HH:MM:SS"
  const parts = t.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

export function minutesToTimeStr(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

export function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`
}
