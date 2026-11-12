"use client";

/** Page through a long list: "← Newer · 2 / 5 · Older →". Hidden when everything fits on one page. */
export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  const btn =
    "h-10 rounded-chip border border-border px-3.5 font-mono text-[11px] uppercase tracking-[0.1em] enabled:hover:border-fg disabled:opacity-40";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 pt-4">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {"←"} Newer
      </button>
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        {page} / {pages}
      </span>
      <button type="button" className={btn} disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Older {"→"}
      </button>
    </nav>
  );
}

/** One page of a list (1-based) and how many pages there are. */
export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * size, p * size), page: p, pages };
}
