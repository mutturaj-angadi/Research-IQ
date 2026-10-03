export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Flattens Next searchParams to the first string value of each key. */
export async function flat(sp: SearchParams): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(await sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s === 'string') out[k] = s;
  }
  return out;
}

export const fmtDate = (iso: string): string => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
