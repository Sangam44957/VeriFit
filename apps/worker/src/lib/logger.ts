const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const rawLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const minLevel: number = LEVELS[rawLevel as Level] ?? LEVELS.info;

function log(level: Level, message: string, data?: unknown): void {
  if (LEVELS[level] < minLevel) return;
  const line = `[${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(
      line,
      data instanceof Error ? { message: data.message, stack: data.stack } : (data ?? ''),
    );
  } else if (level === 'warn') {
    console.warn(line, data ?? '');
  } else {
    console.log(line, data ?? ''); // eslint-disable-line no-console
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, error?: unknown) => log('error', message, error),
};
