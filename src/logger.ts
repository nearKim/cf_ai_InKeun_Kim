type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const log = (level: LogLevel, event: string, data: Record<string, unknown>) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  }))
}
