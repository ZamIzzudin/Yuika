"use client";
// Dropdown konsisten seluruh app (D40): <details> + useMenuAutoClose —
// menutup saat klik di luar, Escape, DAN saat item dipilih (close() di
// onClick). Ganti <select> native agar rasa UI satu bahasa dengan menu
// persona/sessions di header. Gaya summary = TeamSetupView start menu.
import { CaretDown } from "@phosphor-icons/react";
import { useMenuAutoClose } from "./menu";

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  className,
  menuClassName,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
  /** Lebar panel item (default ikut lebar summary). */
  menuClassName?: string;
}) {
  const menu = useMenuAutoClose<HTMLDetailsElement>();
  const cur = options.find((o) => o.value === value);
  return (
    <details className="group relative w-full" ref={menu.ref}>
      <summary
        className={`flex w-full cursor-pointer list-none items-center justify-between gap-2 rounded-md2 border border-line bg-control px-3 py-1.5 text-caption text-secondary select-none transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-line-strong hover:text-primary [&::-webkit-details-marker]:hidden ${className ?? ""}`}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {cur?.label ?? value}
        </span>
        <CaretDown size={12} aria-hidden className="shrink-0" />
      </summary>
      <div
        className={`glass-panel absolute top-full left-0 z-30 mt-1 flex max-h-[280px] min-w-full flex-col gap-px overflow-y-auto rounded-lg2 p-1 shadow-pop ${menuClassName ?? "w-full"}`}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-current={o.value === value ? "true" : undefined}
            className={`flex cursor-pointer items-center gap-2 rounded-md2 border px-2 py-1.5 text-left text-caption transition-colors ${
              o.value === value
                ? "border-line bg-hover text-primary"
                : "border-transparent text-secondary hover:bg-hover hover:text-primary"
            }`}
            onClick={() => {
              onChange(o.value);
              menu.close();
            }}
          >
            <span className="min-w-0 flex-1">{o.label}</span>
            {o.value === value && (
              <i
                aria-hidden
                className="size-2 shrink-0 rounded-pill bg-accent"
              />
            )}
          </button>
        ))}
      </div>
    </details>
  );
}
