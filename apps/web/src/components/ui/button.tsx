// DS-1 — komponen global: Button.
// SATU sumber tombol untuk seluruh app. Jangan tulis <button> mentah di fitur
// baru (docs/DESIGN-SYSTEM.md §Button). Variant:
//   primary   aksi utama satu per layar (Kirim, Simpan, Jalankan)
//   secondary aksi pendamping di samping primary (default bila ragu)
//   ghost     aksi sunyi di dalam kartu/bar (tanpa border)
//   danger    destruktif (hapus, tolak) — konfirmasi tetap tanggung jawab pemanggil
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md2 border font-medium " +
  "transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] " +
  "disabled:opacity-40 disabled:pointer-events-none select-none cursor-pointer whitespace-nowrap";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent border-accent text-white hover:bg-accent-hover hover:border-accent-hover",
  secondary:
    "bg-control border-line text-secondary hover:bg-raised hover:border-line-strong hover:text-primary",
  ghost:
    "bg-transparent border-transparent text-muted hover:bg-hover hover:text-primary",
  danger:
    "bg-transparent border-danger-soft text-danger hover:bg-danger-soft hover:border-danger",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-6 px-2.5 text-caption",
  md: "h-8 px-3 text-body",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** data-on: state aktif/terpilih (toggle) → aksen. */
  active?: boolean;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", active, className = "", children, ...rest }: ButtonProps) {
  const on =
    active && (variant === "secondary" || variant === "ghost")
      ? " border-accent text-accent bg-accent-soft"
      : "";
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]}${on} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Kelas tombol untuk elemen non-<button> (link, dsb). */
export function buttonClass(opts: { variant?: ButtonVariant; size?: ButtonSize; active?: boolean } = {}) {
  const v = opts.variant ?? "secondary";
  const on = opts.active && (v === "secondary" || v === "ghost") ? " border-accent text-accent bg-accent-soft" : "";
  return `${BASE} ${VARIANTS[v]} ${SIZES[opts.size ?? "md"]}${on}`;
}
