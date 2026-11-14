import type { ProgressSnapshot } from './piece-access'

const EMPTY_PROGRESS: ProgressSnapshot = {
  level: 0,
  completedTaskIds: new Set<string>(),
}

export function parseDevProgressOverride(search: string, isDev: boolean): ProgressSnapshot | undefined {
  if (!isDev) return undefined
  const params = new URLSearchParams(search)
  const rawLevel = params.get('__devLevel')
  const rawTasks = params.get('__devTasks')
  if (rawLevel === null && rawTasks === null) return undefined
  if (rawLevel !== null && !/^\d+$/.test(rawLevel)) return undefined

  const level = rawLevel === null ? EMPTY_PROGRESS.level : Number(rawLevel)
  const completedTaskIds = new Set((rawTasks ?? '').split(',').filter((taskId) => taskId.length > 0))
  return { level, completedTaskIds }
}
