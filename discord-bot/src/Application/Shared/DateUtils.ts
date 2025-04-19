export function isLastDayOfMonth (date: Date): boolean {
  const nextDay = new Date(date)
  nextDay.setDate(date.getDate() + 1)
  return nextDay.getDate() === 1
}

export function isMonday (date: Date): boolean {
  return date.getDay() === 1
}
