// komponen global: permukaan kartu + modal + field form.
// Card    → blok konten bertepi (variant: surface default / raised mengambang / inset tenggelam).
// Modal   → popup glass (ESC & klik overlay menutup), jangan bikin overlay sendiri.
// Field   → label + kontrol + hint seragam (TextInput/TextArea/Select share style).
import { useEffect, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

export type CardVariant = "surface" | "raised" | "inset";

const CARDS: Record<CardVariant, string> = {
  surface: "bg-surface border-line",
  raised: "bg-raised border-line-strong shadow-card",
  inset: "bg-inset border-line",
};

export function Card({
  variant = "surface",
  className = "",
  children,
  ...rest
}: {
  variant?: CardVariant;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border ${CARDS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "dialog"}
        className={`glass-panel flex max-h-[86vh] w-full flex-col rounded-card shadow-pop ${wide ? "max-w-5xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-glass-line px-4 py-3">
          <b className="text-title text-primary">{title}</b>
          <button
            type="button"
            aria-label="Close"
            className="cursor-pointer rounded-md2 border border-transparent bg-transparent p-1 text-muted transition-colors hover:bg-hover hover:text-primary"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Field & kontrol form ─────────────────────────────────────────────── */

const CONTROL =
  "w-full rounded-md2 border border-line bg-control px-3 py-1.5 text-body text-primary placeholder:text-dim " +
  "transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] " +
  "hover:border-line-strong focus:border-accent focus:outline-none";

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-caption font-medium text-secondary">{label}</span>
      {children}
      {hint ? <span className="text-caption text-dim">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const { className = "", ...rest } = props;
  return <textarea className={`${CONTROL} resize-y ${className}`} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return (
    <select
      className={`${CONTROL} cursor-pointer ${className}`}
      {...rest}
    />
  );
}
