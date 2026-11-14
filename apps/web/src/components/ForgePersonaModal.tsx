"use client";
// F2 Persona Forge v2: buat/edit persona custom - persona BARU di luar 9
// built-in. Bukan clone: user memilih sendiri native functions (terminal,
// browser, design, ...) di luar workflow, lapisan prompt, skill dari bank,
// bentuk maskot. Share: Import dari file JSON (prefill penuh) - teman bisa
// memasang persona buatan install lain; Export ada di kartu persona custom.
import { useEffect, useMemo, useRef, useState } from "react";
import { ORIN_SHAPE_KEYS, PERSONA_SHARE_FORMAT, TOOL_CATEGORIES, type ForgeKit, type PersonaShareFile } from "@yuika/contracts";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, Modal } from "./ui";
import { toastErr, toastOk } from "./ui/toast";
import { SHAPES } from "./orinShapes";

const TEMPLATE = (name: string) =>
  [
    `# ${name}, Persona Layer`,
    "",
    "## Who you are",
    "",
    `You are ${name}, a member of the Yui team. Describe your specialty, tone,`,
    "and how you prefer to work.",
    "",
    "## How you work",
    "",
    "1. First rule of how you operate.",
    "2. Second rule (files, tools, verification habits).",
    "3. How you report results back to the user.",
    "",
  ].join("\n");

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
  /** Mode edit: id persona custom yang akan dibentuk ulang (prefill dari kit). */
  editId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kit, setKit] = useState<ForgeKit | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [personaMd, setPersonaMd] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [shape, setShape] = useState("orb");
  const [busy, setBusy] = useState(false);
  const [editInit, setEditInit] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void fetchForgeKit().then((k) => setKit(k));
  }, []);

  // Mode edit: prefill semua lapisan dari entry kit (sekali, saat kit siap).
  useEffect(() => {
    if (!kit || !editId || editInit) return;
    const e = kit.personas.find((p) => p.id === editId);
    if (!e) return;
    setName(e.name);
    setDescription(e.description);
    setPersonaMd(e.personaMd);
    setTools(e.tools.filter((t) => !t.endsWith("*")));
    setSkills(e.skills);
    setEditInit(true);
  }, [kit, editId, editInit]);

  // Mode create: prefill template prompt begitu user mengetik nama pertama.
  useEffect(() => {
    if (editId || !name || personaMd) return;
    setPersonaMd(TEMPLATE(name.trim() || "New persona"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const bank = useMemo(() => new Map((kit?.skills ?? []).map((s) => [s.name, s.description])), [kit]);
  const nativeDesc = kit?.nativeTools ?? {};

  function toggleTool(t: string) {
    setTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function toggleSkill(s: string) {
    setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 16 ? [...prev, s] : prev));
  }

  /** Import file share: prefill seluruh form (user tetap me-review sebelum save). */
  async function importFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as PersonaShareFile;
      if (parsed.format !== PERSONA_SHARE_FORMAT) throw new Error("not a persona share file");
      setName(parsed.name);
      setDescription(parsed.description);
      setPersonaMd(parsed.personaMd);
      setTools(parsed.tools);
      setSkills(parsed.skills);
      if (parsed.shape) setShape(parsed.shape);
      toastOk(`Loaded "${parsed.name}" from file. Review it, then save.`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to read the file");
    }
  }

  async function save() {
    if (!name.trim() || !description.trim() || !personaMd.trim() || tools.length === 0) {
      toastErr("Name, description, prompt layer, and at least one native function are required.");
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify(
        editId
          ? { name: name.trim(), description: description.trim(), personaMd, tools, skills }
          : { name: name.trim(), description: description.trim(), personaMd, tools, skills, shape },
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
      toastOk(editId ? `${name.trim()} reforged.` : `${name.trim()} joined the team.`);
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

  return (
    <Modal open onClose={onClose} title={editId ? `Reforge ${name || "persona"}` : "Forge a new persona"} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-muted">
            A custom persona is a new team member outside the 9 built-ins. Workflow delegation
            stays locked: they execute, they do not spawn others.
          </p>
          {!editId && (
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                Import from file
              </Button>
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-caption text-muted">
            Name
            <input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mary"
              className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-line-strong"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-caption text-muted">
            Description
            <input
              value={description}
              maxLength={120}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What they do, in one line"
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
            placeholder="# Template prefill appears once you type a name"
            className="h-44 resize-y rounded-[10px] border border-line bg-surface px-3 py-2 font-mono text-xs text-primary outline-none focus:border-line-strong"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-caption text-muted">
            Native functions ({tools.length}) - what this persona can actually do
          </span>
          <div className="flex max-h-36 flex-col gap-2 overflow-y-auto rounded-[10px] border border-line p-2.5">
            {TOOL_CATEGORIES.map((cat) => (
              <div key={cat.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-36 shrink-0 text-[11px] font-semibold text-dim">{cat.label}</span>
                {cat.tools.map((t) => {
                  const on = tools.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      title={nativeDesc[t] ?? t}
                      onClick={() => toggleTool(t)}
                      className={`cursor-pointer rounded-pill border px-2 py-0.5 text-[11px] transition-colors duration-150 ${
                        on
                          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                          : "border-line text-muted hover:border-line-strong"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-caption text-muted">
            Skills ({skills.length}/16) - picked from the skill bank
          </span>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-[10px] border border-line p-2">
            {[...bank.entries()].map(([s, d]) => {
              const on = skills.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  title={d}
                  onClick={() => toggleSkill(s)}
                  className={`cursor-pointer rounded-pill border px-2 py-0.5 text-[11px] transition-colors duration-150 ${
                    on
                      ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                      : "border-line text-muted hover:border-line-strong"
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
                    shape === k
                      ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                      : "border-line text-muted hover:border-line-strong"
                  }`}
                >
                  {SHAPES[k].name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Forging…" : editId ? "Save" : "Forge persona"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
