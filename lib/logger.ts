type Value = string | number | boolean | null | undefined;
type Fields = Record<string, Value>;

const FORBIDDEN_KEY = /key|secret|token|password|url|authorization/i;

function write(level: 'info' | 'warn' | 'error', event: string, fields: Fields = {}): void {
  const safe: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!FORBIDDEN_KEY.test(k)) safe[k] = v;
  }
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe });
  (level === 'info' ? process.stdout : process.stderr).write(line + '\n');
}

/**
 * Structured logger. Accepts only scalar fields and drops any key that looks secret-bearing.
 * Callers log error codes and names, never raw error messages (which may contain SQL or URLs).
 */
export const logger = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};

export function errorFields(err: unknown): Fields {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return { errorName: err.name, errorCode: typeof code === 'string' ? code : undefined };
  }
  return { errorName: 'NonError' };
}
