export const logger = {
  debug: (message: string, data?: unknown) => {
    console.warn(`[DEBUG] ${message}`, data ?? '');
  },

  info: (message: string, data?: unknown) => {
    console.warn(`[INFO] ${message}`, data ?? '');
  },

  warn: (message: string, data?: unknown) => {
    console.warn(`[WARN] ${message}`, data ?? '');
  },

  error: (message: string, error?: unknown) => {
    if (error instanceof Error) {
      console.error(`[ERROR] ${message}`, {
        message: error.message,
        stack: error.stack,
      });
    } else {
      console.error(`[ERROR] ${message}`, error ?? '');
    }
  },
};
