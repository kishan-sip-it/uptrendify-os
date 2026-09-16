type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogMeta = Record<string, unknown>;

function write(level: LogLevel, message: string, meta?: LogMeta) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ?? {}),
  });
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  sink(line);
}

export const obs = {
  debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
};