"use client";
// DS-1, toast global (react-hot-toast) untuk feedback aksi success/error.
// Semua operasi async (simpan, upload, install, accept, hapus) WAJIB pakai
// toastOk/toastErr, bukan banner inline tersebar (docs/DESIGN-SYSTEM.md §Toast).
// Ikon Phosphor (§5b), gaya dari token --yui-*.
import { Check, Warning } from "@phosphor-icons/react";
import { Toaster, toast } from "react-hot-toast";

export function YuiToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3500,
        style: {
          background: "var(--yui-bg-surface-raised)",
          color: "var(--yui-text-primary)",
          border: "1px solid var(--yui-border-strong)",
          borderRadius: "var(--radius-lg2)",
          boxShadow: "var(--shadow-pop)",
          fontSize: "var(--yui-text-md)",
          padding: "10px 14px",
          maxWidth: "460px",
        },
      }}
    />
  );
}

/** Sukses, centang hijau, singkat. */
export const toastOk = (msg: string) =>
  toast.success(msg, {
    duration: 2600,
    icon: (
      <Check size={15} weight="bold" aria-hidden className="text-success" />
    ),
  });

/** Gagal, segitiga merah, tahan lebih lama agar sempat dibaca. */
export const toastErr = (msg: string) =>
  toast.error(msg, {
    duration: 5200,
    icon: (
      <Warning size={15} weight="fill" aria-hidden className="text-danger" />
    ),
  });
