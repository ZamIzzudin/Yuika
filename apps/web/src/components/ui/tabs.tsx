// komponen global: TabPills + primitif kecil (EmptyState, Skeleton, MetaRow, SectionTitle).
// TabPills: tab kapsul terpusat (aria lengkap; konten digele pemanggil).
// Center sejati: pemanggil pakai grid 3 kolom [1fr_auto_1fr], kolom kiri &
// kanan sama lebar, pills di kolom tengah (lihat PersonaStudioView & page.tsx).
import type { ReactNode } from "react";
import { Leaf } from "@phosphor-icons/react";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Tooltip tab (opsional). */
  title?: string;
}

export function TabPills({
  tabs,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      className={`mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-pill border border-line bg-surface/70 p-1 shadow-[0_10px_30px_-18px_rgb(0_0_0/.5)] backdrop-blur-md ${className}`}
    >
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            title={t.title}
            onClick={() => onChange(t.id)}
            className={`cursor-pointer whitespace-nowrap rounded-pill px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
              on
                ? "bg-hover text-primary shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                : "text-muted hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Keadaan kosong seragam, JANGAN pakai <p className="dim"> polos untuk list kosong. */
export function EmptyState({
  icon,
  title,
  hint,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line px-4 py-8 text-center ${className}`}
    >
      <span aria-hidden className="mb-1 text-muted">
        {icon ?? <Leaf size={22} />}
      </span>
      <b className="text-body text-secondary">{title}</b>
      {hint ? (
        <small className="max-w-sm text-caption text-dim">{hint}</small>
      ) : null}
    </div>
  );
}

/** Baris meta label:nilai kecil (bawah kartu, baris daftar). */
export function MetaRow({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <small
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-muted ${className}`}
    >
      {children}
    </small>
  );
}

/** Judul seksi dalam panel. */
export function SectionTitle({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h3
      className={`text-caption font-semibold tracking-wide text-dim uppercase ${className}`}
    >
      {children}
    </h3>
  );
}
