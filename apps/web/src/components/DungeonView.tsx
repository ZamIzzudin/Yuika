// ⚔ Dungeon — arena latihan persona (P1-DUN-2/3, P1-MEM-3).
// DS-1: file ini LAYAR REFERENSI design system — hanya komponen ui/* +
// utility Tailwind semantik; tanpa CSS kustom (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaInfo } from "@yui/contracts";
import { ArrowLeft, Books, Check, CircleNotch, Clock, MagnifyingGlass, Sparkle, Sword, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { Skeleton } from "./Skeleton";
import { toastErr, toastOk } from "./ui/toast";
import { Button, Chip, Card, Modal, Field, TextInput, TextArea, Select, TabList, EmptyState, MetaRow, SectionTitle } from "./ui";

/** Baris GET /api/dungeons. */
export interface DungeonRow {
  mission: {
    id: string;
    slug: string;
    title: string;
    goal: string;
    persona: string;
    origin: "seed" | "user";
    targetSkill: { name: string; description: string };
    resources: string[];
    acceptance: string[];
  };
  runs: { id: string; status: "running" | "done" | "error"; startedAt: number; summary?: string; sessionId?: string; projectId?: string }[];
}

const DEFAULT_ACC: Record<"research" | "documents", string[]> = {
  research: ["Prosedur langkah demi langkah, bisa diikuti tanpa konteks lain", "Minimal 2 sumber nyata", "Tanpa klaim yang tak bisa diverifikasi"],
  documents: ["Ringkas SEMUA materi dengan setia (tanpa mengarang)", "Struktur mudah di-scan", "Menyebut file sumber tiap bagian"],
};

/** Tab "Mapping Skill" (feedback user dev-10): pilih persona → toggle skill
 *  yang sudah ada (attach/detach manual, termasuk lepas bawaan). Persist di
 *  skill-bindings.json — berlaku untuk SESI BARU (prompt sesi beku by design).
 *  DRAF hasil latihan bisa DITERIMA + dipasang langsung dari sini (self-
 *  sufficient — jalur terima di tab Skill hanya ada saat project aktif). */
interface BindingPersona {
  id: string;
  name: string;
  bundled: string[];
  attached: string[];
  detached: string[];
  effective: string[];
}
interface BindingsPayload {
  skills: { name: string; description: string; status: string; slug: string | null }[];
  personas: BindingPersona[];
}

function SkillMapping() {
  const [data, setData] = useState<BindingsPayload | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/skills/bindings");
      if (r.ok) setData(await r.json());
    } catch {
      /* coba lagi nanti */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persona = data?.personas.find((p) => p.id === sel) ?? data?.personas[0];

  async function toggle(personaId: string, skill: string, action: "attach" | "detach") {
    // optimistic — PUT persist; gagal → reload (state server yang benar)
    setData((prev) =>
      prev
        ? {
            ...prev,
            personas: prev.personas.map((p) =>
              p.id === personaId
                ? {
                    ...p,
                    attached: action === "attach" ? [...new Set([...p.attached, skill])] : p.attached.filter((s) => s !== skill),
                    detached: action === "detach" ? [...new Set([...p.detached, skill])] : p.detached.filter((s) => s !== skill),
                    effective: action === "attach" ? [...new Set([...p.effective, skill])] : p.effective.filter((s) => s !== skill),
                  }
                : p,
            ),
          }
        : prev,
    );
    try {
      const res = await fetch("/api/skills/bindings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, skill, action }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "request failed");
      } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to save");
      void load();
    }
  }

  /** Draf → terima (lint + pindah aktif) → langsung pasang ke persona terpilih. */
  async function acceptAndAttach(personaId: string, slug: string, name: string) {
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed to accept the draft");
      await load(); // status baru dari server
      await toggle(personaId, name, "attach");
      toastOk(`Skill "${name}" accepted & attached to the selected persona.`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to accept the draft");
      void load();
    }
  }

  if (!data) return <Skeleton lines={4} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption leading-5 text-muted">
        Attach existing skills to a persona — they automatically enter that persona's{" "}
        <b className="text-secondary">new-session prompt index</b> (running sessions don't change; skills stay readable via{" "}
        <code className="font-mono">skills_list</code>). “Bundled” = the persona's{" "}
        <code className="font-mono">skills.yaml</code> (detachable). <b className="text-secondary">Draft</b> skills from
        training runs can be accepted right here.
      </p>

      <div className="flex flex-wrap gap-2">
        {data.personas.map((p) => (
          <button
            key={p.id}
            aria-pressed={persona?.id === p.id}
            title={`${p.effective.length} effective skills`}
            onClick={() => setSel(p.id)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md2 border px-3.5 py-1.5 text-caption transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
              persona?.id === p.id
                ? "border-accent bg-accent-soft text-accent-text"
                : "border-line bg-transparent text-muted hover:border-line-strong hover:text-primary"
            }`}
          >
            <PersonaFace personaId={p.id} size={22} /> {p.name.replace(" Yui", "")}
            <span className="rounded-pill bg-hover px-1.5 py-px text-dim">{p.effective.length}</span>
          </button>
        ))}
      </div>

      {persona ? (
        <div className="flex flex-col gap-2">
          {data.skills.length === 0 ? (
            <EmptyState icon={<Sparkle size={20} />} title="No skills yet" hint="Train the persona on the Missions tab — training results appear here as drafts you can accept." />
          ) : (
            data.skills.map((s) => {
              const on = persona.effective.includes(s.name);
              const native = persona.bundled.includes(s.name);
              const draft = s.status === "draft";
              return (
                <div
                  key={s.name}
                  className={`flex items-center gap-3 rounded-card border px-3 py-2 transition-colors ${
                    on ? "border-accent/45 bg-surface" : "border-line bg-surface"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <b className="flex flex-wrap items-center gap-2 text-body text-primary">
                      {s.name}
                      {draft ? <Chip tone="warn">draft</Chip> : null}
                      {!draft && s.status === "tested" ? <Chip tone="info">tested</Chip> : null}
                      {native && on ? <Chip tone="muted">bundled</Chip> : null}
                    </b>
                    <small className="truncate text-caption text-muted" title={s.description}>
                      {s.description}
                    </small>
                  </div>
                  {draft ? (
                    <Button size="sm" variant="primary" onClick={() => void acceptAndAttach(persona.id, s.slug!, s.name)} title="Lint + move to active skills, then attach to this persona">
                      Accept &amp; attach
                    </Button>
                  ) : (
                    <Button size="sm" active={on} onClick={() => void toggle(persona.id, s.name, on ? "detach" : "attach")}>
                      {on ? "Attached ✓" : "Attach"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

export function DungeonView({ personas, onBack, onOpenProject }: { personas: PersonaInfo[]; onBack: () => void; onOpenProject?: (projectId: string) => void }) {
  const [dungeons, setDungeons] = useState<DungeonRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadFor = useRef<string | null>(null);
  // Fix dev-10 (user): sesi latihan TIDAK lagi tampil sebagai card project (scope
  // beda) — daftar semua run latihan bisa dibuka dari sini (tab Riwayat).
  const [view, setView] = useState<"misi" | "riwayat" | "mapping">("misi");
  const [formOpen, setFormOpen] = useState(false);

  // ---- form buat latihan ----
  const [mode, setMode] = useState<"research" | "documents">("research");
  const [personaId, setPersonaId] = useState("");
  const [skillName, setSkillName] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [resourcesText, setResourcesText] = useState("");
  const [accText, setAccText] = useState(DEFAULT_ACC.research.join("\n"));
  const [accDirty, setAccDirty] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/dungeons");
      if (r.ok) setDungeons(((await r.json()) as { dungeons: DungeonRow[] }).dungeons);
    } catch {
      /* refresh berikutnya */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5_000); // progress run live
    return () => clearInterval(t);
  }, [refresh]);

  function switchMode(next: "research" | "documents") {
    setMode(next);
    if (!accDirty) setAccText(DEFAULT_ACC[next].join("\n"));
  }

  async function create() {
    setBusy(true);
    try {
      const fallbackGoal =
        mode === "research"
          ? `Pelajari "${skillName}" dari sumber terpercaya dan susun jadi prosedur praktis yang bisa diikuti.`
          : `Pelajari semua bahan ajar di folder misi ini sampai paham, lalu rangkum menjadi skill "${skillName}".`;
      const r = await fetch("/api/dungeons/mission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personaId,
          title: title.trim() || `Latih ${skillName.trim()}`,
          goal: goal.trim() || fallbackGoal,
          skillName: skillName.trim(),
          skillDescription: skillDesc.trim(),
          mode,
          resources: mode === "research" ? resourcesText.split("\n").map((s) => s.trim()).filter(Boolean) : [],
          acceptance: accText.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) {
        toastErr((((await r.json()) as { error?: string }).error ?? "failed to create the training") + "");
        return;
      }
      // reset form ringan
      setSkillName("");
      setSkillDesc("");
      setTitle("");
      setGoal("");
      setResourcesText("");
      setAccDirty(false);
      setAccText(DEFAULT_ACC[mode].join("\n"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function run(missionId: string) {
    try {
      const r = await fetch("/api/dungeons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      if (!r.ok) toastErr((((await r.json()) as { error?: string }).error ?? "failed to run the mission") + "");
      await refresh();
    } catch {
      toastErr("could not reach the server");
    }
  }

  /** Unggah bahan ajar (multi-file) → <dungeon>/materials/ + jadi sumber misi. */
  async function upload(slug: string, files: FileList) {
    setUploading(slug);
    try {
      for (const f of Array.from(files)) {
        const r = await fetch(`/api/dungeons/${encodeURIComponent(slug)}/materials?name=${encodeURIComponent(f.name)}`, {
          method: "POST",
          body: await f.arrayBuffer(),
        });
        if (!r.ok) {
          toastErr((((await r.json()) as { error?: string }).error ?? "upload failed") + ` (${f.name})`);
          break;
        }
      }
      await refresh();
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(slug: string) {
    try {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!r.ok) toastErr((((await r.json()) as { error?: string }).error ?? "failed to delete the training") + "");
      await refresh();
    } finally {
      /* void */
    }
  }

  const persona = personas.find((p) => p.id === personaId);
  const canCreate = personaId && skillName.trim().length >= 3 && skillDesc.trim().length >= 10 && !busy;
  const userMissions = dungeons?.filter((d) => d.mission.origin === "user") ?? [];
  const seedMissions = dungeons?.filter((d) => d.mission.origin !== "user") ?? [];

  const card = (d: DungeonRow) => {
    const active = d.runs.find((r) => r.status === "running");
    const last = d.runs[d.runs.length - 1];
    const materials = d.mission.resources.filter((r) => r.startsWith("materials/"));
    return (
      <Card key={d.mission.id} className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <PersonaFace personaId={d.mission.persona} size={28} />
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-body text-primary">{d.mission.title}</b>
            <MetaRow>
              skill <code className="font-mono">{d.mission.targetSkill.name}</code>
              <span aria-hidden>·</span>
              persona {d.mission.persona.replace("yui-", "")}
            </MetaRow>
          </div>
          <Button variant="primary" size="sm" disabled={Boolean(active)} onClick={() => void run(d.mission.id)}>
            {active ? "running…" : "Run"}
          </Button>
        </div>
        <small className="line-clamp-2 text-caption leading-5 text-muted">{d.mission.goal.trim().split("\n")[0]}</small>
        {materials.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m) => (
              <code key={m} className="rounded-pill border border-line bg-hover px-2 py-px font-mono text-caption text-muted">
                {m}
              </code>
            ))}
          </div>
        )}
        {last && (
          <MetaRow>
            {last.status === "running" ? (
              <Chip tone="warn">
                <CircleNotch size={11} aria-hidden /> running
              </Chip>
            ) : last.status === "done" ? (
              <Chip tone="ok">
                <Check size={11} weight="bold" aria-hidden /> done
              </Chip>
            ) : (
              <Chip tone="danger">
                <X size={11} weight="bold" aria-hidden /> failed
              </Chip>
            )}
            {last.summary ? <span className="truncate">{last.summary.slice(0, 160)}</span> : null}
          </MetaRow>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={uploading === d.mission.id}
            onClick={() => {
              uploadFor.current = d.mission.id;
              fileRef.current?.click();
            }}
          >
            {uploading === d.mission.id ? "uploading…" : <><UploadSimple size={12} aria-hidden className="mr-1 inline align-[-2px]" /> Materials</>}
          </Button>
          {d.mission.origin === "user" && (
            <Button size="sm" variant="danger" onClick={() => void remove(d.mission.id)} title="Delete this training" aria-label="Delete training">
              <Trash size={13} aria-hidden />
            </Button>
          )}
        </div>
      </Card>
    );
  };

  const allRuns =
    dungeons
      ?.flatMap((d) => d.runs.map((r) => ({ ...r, title: d.mission.title, persona: d.mission.persona })))
      .sort((a, b) => b.startedAt - a.startedAt) ?? [];

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6" aria-label="Dungeon — persona training arena">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={onBack}>
            <ArrowLeft size={13} aria-hidden /> Workspace
          </Button>
          <h1 className="flex items-center gap-2 text-display font-semibold text-primary">
            <Sword size={20} aria-hidden /> Dungeon
          </h1>
        </div>
        <p className="text-body leading-6 text-muted">
          Teach personas new skills the way you'd teach a person: give a research topic or upload learning materials → the
          persona studies in a sandbox → it produces a <b className="text-secondary">skill</b> it has mastered (draft → you accept → ready
          to attach via the Skill Mapping tab).
        </p>
        <TabList
          value={view}
          onChange={(id) => setView(id as typeof view)}
          tabs={[
            { id: "misi", label: "Missions" },
            { id: "riwayat", label: `Training history (${allRuns.length})` },
            { id: "mapping", label: "Skill Mapping" },
          ]}
        />
      </header>

      {view === "riwayat" ? (
        allRuns.length === 0 ? (
          <EmptyState icon={<Clock size={20} />} title="No training sessions yet" hint="Run a mission first — every training run is recorded here." />
        ) : (
          <div className="flex flex-col gap-2">
            {allRuns.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 px-3 py-2">
                <PersonaFace personaId={r.persona} size={24} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-body text-primary">{r.title}</b>
                  <MetaRow>
                    {new Date(r.startedAt).toLocaleString("id-ID")}
                    <span aria-hidden>·</span>
                    {r.status === "running" ? (
                      <>
                        <CircleNotch size={11} aria-hidden className="animate-pulse" /> running
                      </>
                    ) : r.status === "done" ? (
                      <>
                        <Check size={11} weight="bold" aria-hidden /> done
                      </>
                    ) : (
                      <>
                        <X size={11} weight="bold" aria-hidden /> failed
                      </>
                    )}
                    {r.summary ? <span className="truncate">— {r.summary.slice(0, 140)}</span> : null}
                  </MetaRow>
                </div>
                <Button size="sm" disabled={!onOpenProject} onClick={() => onOpenProject?.(r.projectId ?? "")} title="Open the training room (chat + artifacts of this session)">
                  Open session →
                </Button>
              </Card>
            ))}
          </div>
        )
      ) : view === "mapping" ? (
        <SkillMapping />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              + New training
            </Button>
            <small className="text-caption text-dim">Full form (mode, persona, skill, pass criteria) opens as a modal popup.</small>
          </div>

          <Modal open={formOpen} onClose={() => setFormOpen(false)} title={<span className="flex items-center gap-2"><Sword size={16} aria-hidden /> New training</span>} wide>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                  <ChipToggle2 active={mode === "research"} onClick={() => switchMode("research")}>
                    <MagnifyingGlass size={12} aria-hidden /> Self-research
                  </ChipToggle2>
                  <ChipToggle2 active={mode === "documents"} onClick={() => switchMode("documents")}>
                    <Books size={12} aria-hidden /> Learning materials (files)
                  </ChipToggle2>
              </div>
              <small className="text-caption leading-5 text-muted">
                {mode === "research"
                  ? "The persona researches and studies the topic on its own (you may give starting URLs)."
                  : "You upload files (pdf/xlsx/csv/md/…) → the persona studies them and summarizes them into a skill. Upload after creating the training."}
              </small>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Persona to train" className="col-span-2">
                  <div className="flex items-center gap-2">
                    {persona && <PersonaFace personaId={persona.id} size={32} />}
                    <Select value={personaId} onChange={(e) => setPersonaId(e.target.value)} aria-label="Persona">
                      <option value="">Pick a persona…</option>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Field>
                <Field label="Target skill name">
                  <TextInput value={skillName} placeholder="e.g. phaser-basics" spellCheck={false} onChange={(e) => setSkillName(e.target.value)} />
                </Field>
                <Field label="When this skill is used (description)">
                  <TextInput value={skillDesc} placeholder="e.g. Phaser 3 basics to start a 2D game" onChange={(e) => setSkillDesc(e.target.value)} />
                </Field>
                <Field label="Training title (optional)" hint={`auto: Train ${skillName || "…"}`} className="col-span-2">
                  <TextInput value={title} placeholder={`auto: Train ${skillName || "…"}`} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Learning goal / special instructions (optional)" className="col-span-2">
                  <TextArea value={goal} rows={2} placeholder="empty = mode default" onChange={(e) => setGoal(e.target.value)} />
                </Field>
                {mode === "research" && (
                  <Field label="Starting sources — URLs, one per line (optional)" className="col-span-2">
                    <TextArea value={resourcesText} rows={2} spellCheck={false} placeholder="https://…" onChange={(e) => setResourcesText(e.target.value)} />
                  </Field>
                )}
                <Field label="Pass criteria — one per line" hint="used later in the blind eval" className="col-span-2">
                  <TextArea value={accText} rows={3} spellCheck={false} onChange={(e) => { setAccText(e.target.value); setAccDirty(true); }} />
                </Field>
              </div>
                      <div className="flex justify-end">
                <Button variant="primary" disabled={!canCreate} onClick={() => void create()}>
                  {busy ? "creating…" : mode === "research" ? "Create & train" : "Create training (then upload materials)"}
                </Button>
              </div>
            </div>
          </Modal>

          {dungeons === null ? (
            <Skeleton lines={4} />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <SectionTitle>Your trainings ({userMissions.length})</SectionTitle>
                {userMissions.length === 0 ? (
                  <EmptyState title="No trainings of yours yet" hint="Create one with the “New training” button." />
                ) : (
                  userMissions.map(card)
                )}
              </div>
              <div className="flex flex-col gap-2">
                <SectionTitle>Built-in trainings ({seedMissions.length})</SectionTitle>
                {seedMissions.map(card)}
              </div>
              <p className="text-caption leading-5 text-dim">
                After training, the skill appears as a <b>draft</b>: accept it directly on the <b className="text-secondary">Skill Mapping</b>{" "}
                tab (or the project's Skill tab). Personas without phase skills are marked ✕ on the Roster tab — train them here.
              </p>
            </>
          )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const slug = uploadFor.current;
          if (slug && e.target.files?.length) void upload(slug, e.target.files);
        }}
      />
    </section>
  );
}

/** Toggle mode kecil lokal (pilihan 2 opsi) — ChipToggle ui dengan spacing bar. */
function ChipToggle2({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md2 border px-3.5 py-1.5 text-caption transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
        active ? "border-accent bg-accent-soft text-accent-text" : "border-line text-muted hover:border-line-strong hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}
