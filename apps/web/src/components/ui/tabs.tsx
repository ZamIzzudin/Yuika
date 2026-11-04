// DS-1 — komponen global: Tabs + primitif kecil (EmptyState, Skeleton, MetaRow, SectionTitle).
// Tabs: baris tab aria lengkap; konten digele pengguna (state tab milik pemanggil).
import type { ReactNode } from "react";
import { Leaf } from "@phosphor-icons/react";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Tooltip tab (opsional). */
  title?: string;
}

export function TabList({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <nav role="tablist" className={`flex flex-wrap items-center gap-1 border-b border-line px-1 ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          title={t.title}
          onClick={() => onChange(t.id)}
          className={`-mb-px inline-flex cursor-pointer items-center gap-1.5 rounded-t-md2 border border-b-0 px-3 py-1.5 text-body transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
            value === t.id
              ? "border-line-strong bg-surface text-primary"
              : "border-transparent bg-transparent text-muted hover:bg-hover hover:text-primary"
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

/** Keadaan kosong seragam — JANGAN pakai <p className="dim"> polos untuk list kosong. */
export function EmptyState({ icon, title, hint, className = "" }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line px-4 py-8 text-center ${className}`}>
      <span aria-hidden className="mb-1 text-muted">{icon ?? <Leaf size={22} />}</span>
      <b className="text-body text-secondary">{title}</b>
      {hint ? <small className="max-w-sm text-caption text-dim">{hint}</small> : null}
    </div>
  );
}

/** Baris meta label:nilai kecil (bawah kartu, baris daftar). */
export function MetaRow({ className = "", children }: { className?: string; children: ReactNode }) {
  return <small className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-muted ${className}`}>{children}</small>;
}

/** Judul seksi dalam panel. */
export function SectionTitle({ className = "", children }: { className?: string; children: ReactNode }) {
  return <h3 className={`text-caption font-semibold tracking-wide text-dim uppercase ${className}`}>{children}</h3>;
}
