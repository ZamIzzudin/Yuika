// komponen global: Chip (badge status/label kecil) & Dot (indikator titik).
// Chip NON-interaktif: menampilkan status/kategori (✓ selesai, ● berjalan, draf).
// Untuk tombol pilihan → pakai <Button active> atau Chip dengan onSelect.
import type { ReactNode } from "react";

export type ChipTone = "accent" | "ok" | "warn" | "danger" | "info" | "muted";

const TONES: Record<ChipTone, string> = {
  accent: "bg-accent-soft text-accent-text border-accent/30",
  ok: "bg-success-soft text-success border-success/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-hover text-secondary border-line-strong",
  muted: "bg-hover text-muted border-line",
};

export function Chip({
  tone = "muted",
  size = "md",
  className = "",
  children,
}: {
  tone?: ChipTone;
  /** md = default; sm = chip mini untuk card/baris compact . */
  size?: "md" | "sm";
  className?: string;
  children: ReactNode;
}) {
  const pad =
    size === "sm"
      ? "gap-1 px-2 py-1 text-[10px] leading-3"
      : "gap-2 px-3 py-2 text-caption leading-4";
  return (
    <span
      className={`inline-flex items-center rounded-pill border ${pad} ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Chip yang bisa diklik (pilihan filter/persona), state aktif = aksen. */
export function ChipToggle({
  tone = "muted",
  active,
  className = "",
  onClick,
  title,
  children,
}: {
  tone?: ChipTone;
  active?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md2 border px-3 py-1 text-caption transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
        active
          ? "border-accent bg-accent-soft text-accent-text"
          : `${TONES[tone]} hover:border-line-strong hover:text-primary`
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Titik status kecil (di judul tab, baris daftar). */
export function Dot({
  tone = "muted",
  pulse,
  className = "",
}: {
  tone?: ChipTone;
  pulse?: boolean;
  className?: string;
}) {
  const color =
    tone === "ok"
      ? "bg-success"
      : tone === "warn"
        ? "bg-warn"
        : tone === "danger"
          ? "bg-danger"
          : tone === "accent"
            ? "bg-accent"
            : "bg-muted";
  return (
    <span
      aria-hidden
      className={`inline-block size-1.5 shrink-0 rounded-full ${color} ${pulse ? "animate-pulse" : ""} ${className}`}
    />
  );
}

/* ── State persona (idle/working/done/…), dipakai header chat & kartu delegasi ── */
export const STATE_LABEL: Record<string, string> = {
  idle: "Waiting",
  thinking: "Thinking",
  working: "Working",
  awaiting_input: "Waiting Approval",
  done: "Done",
  error: "Error",
  celebrating: "Celebrating",
};
const STATE_TONE: Record<string, ChipTone> = {
  idle: "muted",
  thinking: "accent",
  working: "accent",
  awaiting_input: "warn",
  done: "ok",
  celebrating: "ok",
  error: "danger",
};

/** Chip state persona dengan titik berdenyut saat bekerja. */
export function StateChip({
  state,
  className = "",
}: {
  state: string;
  className?: string;
}) {
  const tone = STATE_TONE[state] ?? "muted";
  const pulse = state === "thinking" || state === "working";
  return (
    <Chip tone={tone} className={className}>
      <Dot tone={tone} pulse={pulse} />
      {STATE_LABEL[state] ?? state}
    </Chip>
  );
}
