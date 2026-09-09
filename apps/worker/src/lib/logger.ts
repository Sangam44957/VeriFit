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
    // this module is the sanctioned console wrapper; info/debug intentionally go
    // to stdout (not console.warn/error) so log aggregators don't misclassify
    // routine startup logs as warnings or errors.
    // eslint-disable-next-line no-console
    console.log(line, data ?? '');
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, error?: unknown) => log('error', message, error),
};
