'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export interface CategoryRow { categoryId: number; name: string; paperCount: number }

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed.');
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '');
    if (await call('/api/admin/categories', 'POST', { name })) form.reset();
  }

  return (
    <div className="stack">
      <form onSubmit={add} className="row"><div style={{ flex: 1, minWidth: 220 }}><label htmlFor="cat-name" className="sr-only">New category name</label><input id="cat-name" name="name" required maxLength={100} placeholder="New category name" /></div><button className="btn" disabled={busy}>Add category</button></form>
      {error && <div className="alert err" role="alert">{error}</div>}
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Papers</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{categories.map((c) => (
          <tr key={c.categoryId}><td>{c.name}</td><td>{c.paperCount}</td>
            <td className="row">
              <button className="btn secondary sm" disabled={busy} onClick={() => { const name = window.prompt('Rename category', c.name); if (name?.trim()) void call(`/api/admin/categories/${c.categoryId}`, 'PATCH', { name }); }}>Rename</button>
              <button className="btn danger sm" disabled={busy || c.paperCount > 0} title={c.paperCount > 0 ? 'Assigned to papers' : undefined} onClick={() => { if (window.confirm(`Delete category “${c.name}”?`)) void call(`/api/admin/categories/${c.categoryId}`, 'DELETE'); }}>Delete</button>
            </td></tr>))}</tbody></table></div>
    </div>
  );
}
