// ⚔ Dungeon — arena latihan persona (P1-DUN-2/3, P1-MEM-3).
// DS-1: file ini LAYAR REFERENSI design system — hanya komponen ui/* +
// utility Tailwind semantik; tanpa CSS kustom (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaInfo } from "@yui/contracts";
import { ArrowLeft, Books, Check, CircleNotch, Clock, MagnifyingGlass, Sparkle, Sword, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { Skeleton } from "./Skeleton";
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
  const [err, setErr] = useState<string | null>(null);

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
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "gagal");
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "gagal menyimpan");
      void load();
    }
  }

  /** Draf → terima (lint + pindah aktif) → langsung pasang ke persona terpilih. */
  async function acceptAndAttach(personaId: string, slug: string, name: string) {
    setErr(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "gagal menerima draf");
      await load(); // status baru dari server
      await toggle(personaId, name, "attach");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "gagal menerima draf");
      void load();
    }
  }

  if (!data) return <Skeleton lines={4} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption leading-5 text-muted">
        Pasang skill yang sudah ada ke persona — otomatis masuk <b className="text-secondary">index prompt sesi baru</b> persona itu
        (sesi berjalan tidak berubah; skill tetap bisa dibaca via <code className="font-mono">skills_list</code>). “Bawaan” ={" "}
        <code className="font-mono">skills.yaml</code> persona (bisa dilepas). Skill <b className="text-secondary">draf</b> dari hasil
        latihan bisa diterima langsung di sini.
      </p>
      {err && <p className="rounded-md2 border border-danger/30 bg-danger-soft px-3 py-1.5 text-caption text-danger">{err}</p>}

      <div className="flex flex-wrap gap-2">
        {data.personas.map((p) => (
          <button
            key={p.id}
            aria-pressed={persona?.id === p.id}
            title={`${p.effective.length} skill efektif`}
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
            <EmptyState icon={<Sparkle size={20} />} title="Belum ada skill" hint="Latih persona di tab Misi — hasil latihan muncul di sini sebagai draf yang bisa diterima." />
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
                      {draft ? <Chip tone="warn">draf</Chip> : null}
                      {!draft && s.status === "tested" ? <Chip tone="info">diuji</Chip> : null}
                      {native && on ? <Chip tone="muted">bawaan</Chip> : null}
                    </b>
                    <small className="truncate text-caption text-muted" title={s.description}>
                      {s.description}
                    </small>
                  </div>
                  {draft ? (
                    <Button size="sm" variant="primary" onClick={() => void acceptAndAttach(persona.id, s.slug!, s.name)} title="Lint + pindah ke skill aktif, lalu pasang ke persona ini">
                      Terima &amp; pasang
                    </Button>
                  ) : (
                    <Button size="sm" active={on} onClick={() => void toggle(persona.id, s.name, on ? "detach" : "attach")}>
                      {on ? "Terpasang ✓" : "Pasang"}
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
  const [err, setErr] = useState<string | null>(null);
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
    setErr(null);
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
        setErr((((await r.json()) as { error?: string }).error ?? "gagal membuat latihan") + "");
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
    setErr(null);
    try {
      const r = await fetch("/api/dungeons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      if (!r.ok) setErr((((await r.json()) as { error?: string }).error ?? "gagal menjalankan misi") + "");
      await refresh();
    } catch {
      setErr("gagal menghubungi server");
    }
  }

  /** Unggah bahan ajar (multi-file) → <dungeon>/materials/ + jadi sumber misi. */
  async function upload(slug: string, files: FileList) {
    setUploading(slug);
    setErr(null);
    try {
      for (const f of Array.from(files)) {
        const r = await fetch(`/api/dungeons/${encodeURIComponent(slug)}/materials?name=${encodeURIComponent(f.name)}`, {
          method: "POST",
          body: await f.arrayBuffer(),
        });
        if (!r.ok) {
          setErr((((await r.json()) as { error?: string }).error ?? "gagal mengunggah") + ` (${f.name})`);
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
    setErr(null);
    try {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!r.ok) setErr((((await r.json()) as { error?: string }).error ?? "gagal menghapus latihan") + "");
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
            {active ? "berjalan…" : "Jalankan"}
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
                <CircleNotch size={11} aria-hidden /> berjalan
              </Chip>
            ) : last.status === "done" ? (
              <Chip tone="ok">
                <Check size={11} weight="bold" aria-hidden /> selesai
              </Chip>
            ) : (
              <Chip tone="danger">
                <X size={11} weight="bold" aria-hidden /> gagal
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
            {uploading === d.mission.id ? "mengunggah…" : <><UploadSimple size={12} aria-hidden className="mr-1 inline align-[-2px]" /> Bahan ajar</>}
          </Button>
          {d.mission.origin === "user" && (
            <Button size="sm" variant="danger" onClick={() => void remove(d.mission.id)} title="Hapus latihan ini" aria-label="Hapus latihan">
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
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6" aria-label="Dungeon — arena latihan persona">
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
          Ajari persona keterampilan baru layaknya mengajar orang: beri topik riset atau unggah bahan ajar → persona belajar di
          sandbox → menghasilkan <b className="text-secondary">skill</b> yang ia kuasai (draf → Anda terima → siap dipasang ke persona via
          tab Mapping Skill).
        </p>
        <TabList
          value={view}
          onChange={(id) => setView(id as typeof view)}
          tabs={[
            { id: "misi", label: "Misi" },
            { id: "riwayat", label: `Riwayat sesi latihan (${allRuns.length})` },
            { id: "mapping", label: "Mapping Skill" },
          ]}
        />
      </header>

      {view === "riwayat" ? (
        allRuns.length === 0 ? (
          <EmptyState icon={<Clock size={20} />} title="Belum ada sesi latihan" hint="Jalankan misi dulu — semua run latihan tercatat di sini." />
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
                        <CircleNotch size={11} aria-hidden className="animate-pulse" /> berjalan
                      </>
                    ) : r.status === "done" ? (
                      <>
                        <Check size={11} weight="bold" aria-hidden /> selesai
                      </>
                    ) : (
                      <>
                        <X size={11} weight="bold" aria-hidden /> gagal
                      </>
                    )}
                    {r.summary ? <span className="truncate">— {r.summary.slice(0, 140)}</span> : null}
                  </MetaRow>
                </div>
                <Button size="sm" disabled={!onOpenProject} onClick={() => onOpenProject?.(r.projectId ?? "")} title="Buka ruangan latihan (chat + artefak sesi ini)">
                  Buka sesi →
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
              + Buat latihan baru
            </Button>
            <small className="text-caption text-dim">Form lengkap (mode, persona, skill, kriteria lulus) sebagai popup modal.</small>
          </div>

          <Modal open={formOpen} onClose={() => setFormOpen(false)} title={<span className="flex items-center gap-2"><Sword size={16} aria-hidden /> Buat latihan baru</span>} wide>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                  <ChipToggle2 active={mode === "research"} onClick={() => switchMode("research")}>
                    <MagnifyingGlass size={12} aria-hidden /> Riset mandiri
                  </ChipToggle2>
                  <ChipToggle2 active={mode === "documents"} onClick={() => switchMode("documents")}>
                    <Books size={12} aria-hidden /> Bahan ajar (file)
                  </ChipToggle2>
              </div>
              <small className="text-caption leading-5 text-muted">
                {mode === "research"
                  ? "Persona mencari & mempelajari topik sendiri (boleh diberi URL awal)."
                  : "Anda unggah file (pdf/xlsx/csv/md/…) → persona mempelajarinya lalu merangkum jadi skill. Unggah setelah latihan dibuat."}
              </small>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Persona yang dilatih" className="col-span-2">
                  <div className="flex items-center gap-2">
                    {persona && <PersonaFace personaId={persona.id} size={32} />}
                    <Select value={personaId} onChange={(e) => setPersonaId(e.target.value)} aria-label="Persona">
                      <option value="">Pilih persona…</option>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Field>
                <Field label="Nama skill target">
                  <TextInput value={skillName} placeholder="mis. phaser-basics" spellCheck={false} onChange={(e) => setSkillName(e.target.value)} />
                </Field>
                <Field label="Kapan skill ini dipakai (deskripsi)">
                  <TextInput value={skillDesc} placeholder="mis. Dasar Phaser 3 untuk memulai game 2D" onChange={(e) => setSkillDesc(e.target.value)} />
                </Field>
                <Field label="Judul latihan (opsional)" hint={`otomatis: Latih ${skillName || "…"}`} className="col-span-2">
                  <TextInput value={title} placeholder={`otomatis: Latih ${skillName || "…"}`} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Tujuan belajar / instruksi khusus (opsional)" className="col-span-2">
                  <TextArea value={goal} rows={2} placeholder="kosong = default sesuai mode" onChange={(e) => setGoal(e.target.value)} />
                </Field>
                {mode === "research" && (
                  <Field label="Sumber awal — URL, satu per baris (opsional)" className="col-span-2">
                    <TextArea value={resourcesText} rows={2} spellCheck={false} placeholder="https://…" onChange={(e) => setResourcesText(e.target.value)} />
                  </Field>
                )}
                <Field label="Kriteria lulus — satu per baris" hint="dipakai eval buta nanti" className="col-span-2">
                  <TextArea value={accText} rows={3} spellCheck={false} onChange={(e) => { setAccText(e.target.value); setAccDirty(true); }} />
                </Field>
              </div>
              {err && <p className="rounded-md2 border border-danger/30 bg-danger-soft px-3 py-1.5 text-caption text-danger">{err}</p>}
              <div className="flex justify-end">
                <Button variant="primary" disabled={!canCreate} onClick={() => void create()}>
                  {busy ? "membuat…" : mode === "research" ? "Buat & latih" : "Buat latihan (lalu unggah bahan)"}
                </Button>
              </div>
            </div>
          </Modal>

          {dungeons === null ? (
            <Skeleton lines={4} />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <SectionTitle>Latihan Anda ({userMissions.length})</SectionTitle>
                {userMissions.length === 0 ? (
                  <EmptyState title="Belum ada latihan buatan Anda" hint="Buat lewat tombol “Buat latihan baru”." />
                ) : (
                  userMissions.map(card)
                )}
              </div>
              <div className="flex flex-col gap-2">
                <SectionTitle>Latihan bawaan ({seedMissions.length})</SectionTitle>
                {seedMissions.map(card)}
              </div>
              <p className="text-caption leading-5 text-dim">
                Selesai latihan → skill muncul sebagai <b>draf</b>: terima langsung di tab <b className="text-secondary">Mapping Skill</b>{" "}
                (atau di tab Skill project). Persona tanpa skill fase ditandai ✕ di tab Roster — latih di sini.
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
