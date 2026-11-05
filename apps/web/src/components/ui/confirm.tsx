"use client";
import type { ReactNode } from "react";
import { Button } from "./button";
import { Modal } from "./surface";

export { ConfirmDialog };

/**
 * Popup konfirmasi aksi destruktif (delete/uninstall) — satu pola seragam
 * untuk semua fitur delete di aplikasi (DS-1): Modal ui (Escape + aria
 * dialog) + tombol Cancel / Confirm (danger).
 */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  busy = false,
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-body leading-6 text-muted">{message}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
