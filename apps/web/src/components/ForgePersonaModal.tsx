"use client";
// F2 Persona Forge: wizard buat/edit persona custom (clone-template).
// Lapisan yang dibentuk user: basis (hanya saat create), nama, deskripsi,
// lapisan prompt (PERSONA.md), pilihan skill dari bank, bentuk maskot.
// Tools & delegation dikunci dari basis (plafon kekuatan) - dinyatakan
// eksplisit di UI supaya ekspektasi jelas sejak awal.
import { useEffect, useMemo, useState } from "react";
import type { ForgeKit, ForgeKitPersona } from "@yuika/contracts";
import { ORIN_SHAPE_KEYS, type OrinShapeKey } from "@yuika/contracts";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, Modal } from "./ui";
import { toastErr, toastOk } from "./ui/toast";
import { SHAPES } from "./orinShapes";

async function fetchForgeKit(): Promise<ForgeKit | null> {
  try {
    const r = await authFetch(apiUrl("/api/personas/forge-kit"));
    return r.ok ? ((await r.json()) as ForgeKit) : null;
  } catch {
    return null;
  }
}

export function ForgePersonaModal({
  editId,
  onClose,
  onDone,
}: {
  /** Mode edit: id persona custom yang akan dibentuk ulang (basis terkunci,
   *  entry lengkap diambil dari forge-kit). */
  editId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kit, setKit] = useState<ForgeKit | null>(null);
  const [baseId, setBaseId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [personaMd, setPersonaMd] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [shape, setShape] = useState<OrinShapeKey>("orb");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"basis" | "form">("basis");
  const [editInit, setEditInit] = useState(false);

  useEffect(() => {
    void fetchForgeKit().then((k) => setKit(k));
  }, []);

  // Mode edit: prefill semua lapisan dari entry kit (sekali, saat kit siap).
  useEffect(() => {
    if (!kit || !editId || editInit) return;
    const e = kit.personas.find((p) => p.id === editId);
    if (!e) return;
    setBaseId(e.base ?? "");
    setName(e.name);
    setDescription(e.description);
    setPersonaMd(e.personaMd);
    setSkills(e.skills);
    setStep("form");
    setEditInit(true);
  }, [kit, editId, editInit]);

  // Create mode: mulai dari pilih basis; pilih basis = prefill seluruh form.
  useEffect(() => {
    if (editId) return;
    setStep(kit && baseId ? "form" : "basis");
  }, [kit, baseId, editId]);

  const base = useMemo(() => kit?.personas.find((p) => p.id === baseId), [kit, baseId]);
  const builtin = useMemo(() => (kit?.personas ?? []).filter((p) => !p.custom), [kit]);
  const bank = useMemo(() => new Map((kit?.skills ?? []).map((s) => [s.name, s.description])), [kit]);

  function pickBasis(id: string) {
    const b = kit?.personas.find((p) => p.id === id);
    if (!b) return;
    setBaseId(id);
    setName((prev) => prev || `${b.name.split(" ")[0]} Custom`);
    setDescription((prev) => prev || `Custom take on ${b.description}`);
    setPersonaMd(b.personaMd);
    setSkills(b.skills);
  }

  function toggleSkill(s: string) {
    setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 16 ? [...prev, s] : prev));
  }

  async function save() {
    if (!baseId || !name.trim() || !description.trim() || !personaMd.trim()) {
      toastErr("Name, description, and prompt layer are all required.");
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify(
        editId
          ? { name: name.trim(), description: description.trim(), personaMd, skills }
          : { baseId, name: name.trim(), description: description.trim(), personaMd, skills, shape },
      );
      const res = await authFetch(
        apiUrl(editId ? `/api/personas/custom/${editId}` : "/api/personas/custom"),
        {
          method: editId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body,
        },
      );
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error ?? "request failed");
      }
      toastOk(editId ? `${name.trim()} reforged.` : `${name.trim()} forged. Tools are locked to the base template.`);
      onDone();
      onClose();
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to forge the persona");
    } finally {
      setBusy(false);
    }
  }

  if (!kit) {
    return (
      <Modal open onClose={onClose} title="Persona Forge">
        <p className="px-1 py-6 text-center text-caption text-dim">Loading the forge kit…</p>
      </Modal>
    );
  }

  // Step 1 (create only): pilih template basis.
  if (step === "basis") {
    return (
      <Modal open onClose={onClose} title="Forge a persona" wide>
        <div className="flex flex-col gap-4">
          <p className="text-caption text-muted">
            Pick a built-in template. Your persona inherits its tools and power ceiling; the
            prompt layer, skills, and identity are yours to shape.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {builtin.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickBasis(p.id)}
                className="flex cursor-pointer flex-col gap-1 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left transition-colors duration-200 hover:border-line-strong"
              >
                <b className="text-sm text-primary">{p.name}</b>
                <span className="text-caption text-muted line-clamp-2">{p.description}</span>
                <span className="text-[11px] text-dim">{p.skills.length} bundled skills</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  // Step 2: form lengkap.
  return (
    <Modal open onClose={onClose} title={editId ? "Reforge persona" : "Forge a persona"} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
          <span className="rounded-pill border border-line px-2 py-0.5">
            {editId ? "Base (locked)" : "Base"}: {base?.name ?? baseId}
          </span>
          <span>Tools and delegation are locked to the base template.</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-caption text-muted">
            Name
            <input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-line-strong"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-caption text-muted">
            Description
            <input
              value={description}
              maxLength={120}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-line-strong"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-caption text-muted">
          Prompt layer (PERSONA.md)
          <textarea
            value={personaMd}
            onChange={(e) => setPersonaMd(e.target.value)}
            rows={10}
            spellCheck={false}
            className="h-44 resize-y rounded-[10px] border border-line bg-surface px-3 py-2 font-mono text-xs text-primary outline-none focus:border-line-strong"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-caption text-muted">
            Skills ({skills.length}/16) - picked from the skill bank
          </span>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-[10px] border border-line p-2">
            {[...bank.entries()].map(([s, d]) => {
              const on = skills.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  title={d}
                  onClick={() => toggleSkill(s)}
                  className={`cursor-pointer rounded-pill border px-2 py-0.5 text-[11px] transition-colors duration-150 ${
                    on ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-line text-muted hover:border-line-strong"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        {!editId && (
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted">Maskot shape</span>
            <div className="flex flex-wrap gap-1.5">
              {ORIN_SHAPE_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setShape(k)}
                  className={`cursor-pointer rounded-pill border px-2 py-0.5 text-[11px] transition-colors duration-150 ${
                    shape === k ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-line text-muted hover:border-line-strong"
                  }`}
                >
                  {SHAPES[k].name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {!editId && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStep("basis")}>
              Change base
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Forging…" : editId ? "Save" : "Forge persona"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
