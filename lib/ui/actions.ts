/** Small client-side API actions kept injectable so their success and failure paths can be tested. */
export async function requestLogout(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl('/api/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error('Could not log out. Please try again.');
}

export async function setPaperSaved(
  paperId: string,
  saved: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`/api/saved/${encodeURIComponent(paperId)}`, {
    method: saved ? 'PUT' : 'DELETE',
  });
  if (response.ok) return;

  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(body?.error?.message ?? 'Could not update saved papers. Please try again.');
}
