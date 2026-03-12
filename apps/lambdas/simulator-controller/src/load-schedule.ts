/** Default load schedule: worker count by UTC hour (0-23). */
const DEFAULT_SCHEDULE: Record<number, number> = {
  0: 5,
  1: 5,
  2: 5,
  3: 5,
  4: 10,
  5: 15,
  6: 25,
  7: 35,
  8: 50,
  9: 50,
  10: 50,
  11: 50,
  12: 40,
  13: 50,
  14: 50,
  15: 50,
  16: 45,
  17: 35,
  18: 25,
  19: 15,
  20: 10,
  21: 10,
  22: 5,
  23: 5,
}

export function getWorkerCount(
  hour: number,
  scheduleJson?: string,
  workerCountOverride?: number
): number {
  if (workerCountOverride != null && workerCountOverride > 0) {
    return workerCountOverride
  }
  const schedule = scheduleJson
    ? (JSON.parse(scheduleJson) as Record<string, number>)
    : DEFAULT_SCHEDULE
  return schedule[hour] ?? DEFAULT_SCHEDULE[hour] ?? 5
}

export { DEFAULT_SCHEDULE }
