"use client";
import { apiUrl } from "@/lib/api";
// 🎮 Persona Studio — character customization ala game (permintaan user 2026-11):
// pilih karakter dari roster → preview maskot hidup (OrinPortrait + emote) →
// sesuaikan wujud (geometri) → pasang skill loadout — level/XP dari kerja nyata.
// Seksi Missions (melatih skill baru) + Training history = warisan Dungeon (P1-DUN).
// DS-1: hanya komponen ui/* + utility Tailwind semantik (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonaGrowth, PersonaInfo, PersonaState } from "@yui/contracts";
import {
  ArrowLeft,
  Books,
  Check,
  CircleNotch,
  Clock,
  MagnifyingGlass,
  Shapes,
  Sparkle,
  Sword,
  Trash,
  UploadSimple,
  Users,
  X,
} from "@phosphor-icons/react";
import { GrowthBadge, PersonaFace, usePersonaGrowth } from "./PersonaPicker";
import { OrinPortrait } from "./OrinPortrait";
import { PERSONA_SHAPE, SHAPE_ORDER, SHAPES, setShapeOverrides, usePersonaShape, type OrinShapeKey } from "./orinShapes";
import { Skeleton } from "./Skeleton";
import { toastErr, toastOk } from "./ui/toast";
import {
  Button,
  Chip,
  ChipToggle,
  Card,
  Modal,
  Field,
  TextInput,
  TextArea,
  Select,
  TabList,
  EmptyState,
  MetaRow,
  SectionTitle,
} from "./ui";

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
  runs: {
    id: string;
    status: "running" | "done" | "error";
    startedAt: number;
    summary?: string;
    sessionId?: string;
    projectId?: string;
  }[];
}

const DEFAULT_ACC: Record<"research" | "documents", string[]> = {
  research: [
    "Prosedur langkah demi langkah, bisa diikuti tanpa konteks lain",
    "Minimal 2 sumber nyata",
    "Tanpa klaim yang tak bisa diverifikasi",
  ],
  documents: [
    "Ringkas SEMUA materi dengan setia (tanpa mengarang)",
    "Struktur mudah di-scan",
    "Menyebut file sumber tiap bagian",
  ],
};

/** Emote preview — maskot hidup bisa dicoba semua ekspresi (ala pilih emote game). */
const EMOTES: { state: PersonaState; label: string }[] = [
  { state: "idle", label: "Santai" },
  { state: "thinking", label: "Berpikir" },
  { state: "working", label: "Bekerja" },
  { state: "awaiting_input", label: "Menunggu" },
  { state: "done", label: "Selesai" },
  { state: "celebrating", label: "Rayakan" },
  { state: "error", label: "Bingung" },
];

// ---------------------------------------------------------------------------
// Skill bindings (attach/detach + accept draft) — dipakai tab Characters.
// ---------------------------------------------------------------------------
interface BindingPersona {
  id: string;
  name: string;
  bundled: string[];
  attached: string[];
  detached: string[];
  effective: string[];
}
interface BindingsPayload {
  skills: {
    name: string;
    description: string;
    status: string;
    slug: string | null;
  }[];
  personas: BindingPersona[];
}

function useBindings() {
  const [data, setData] = useState<BindingsPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/skills/bindings"));
      if (r.ok) setData(await r.json());
    } catch {
      /* coba lagi nanti */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (personaId: string, skill: string, action: "attach" | "detach") => {
      // optimistic — PUT persist; gagal → reload (state server yang benar)
      setData((prev) =>
        prev
          ? {
              ...prev,
              personas: prev.personas.map((p) =>
                p.id === personaId
                  ? {
                      ...p,
                      attached:
                        action === "attach"
                          ? [...new Set([...p.attached, skill])]
                          : p.attached.filter((s) => s !== skill),
                      detached:
                        action === "detach"
                          ? [...new Set([...p.detached, skill])]
                          : p.detached.filter((s) => s !== skill),
                      effective:
                        action === "attach"
                          ? [...new Set([...p.effective, skill])]
                          : p.effective.filter((s) => s !== skill),
                    }
                  : p,
              ),
            }
          : prev,
      );
      try {
        const res = await fetch(apiUrl("/api/skills/bindings"), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ personaId, skill, action }),
        });
        if (!res.ok)
          throw new Error((await res.json().catch(() => ({}))).error ?? "request failed");
      } catch (e) {
        toastErr(e instanceof Error ? e.message : "failed to save");
        void load();
      }
    },
    [load],
  );

  /** Draf latihan → terima (lint + aktif) → langsung dipasang ke persona. */
  const accept = useCallback(
    async (personaId: string, slug: string, name: string) => {
      try {
        const res = await fetch(apiUrl("/api/skills"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (!res.ok)
          throw new Error((await res.json().catch(() => ({}))).error ?? "failed to accept the draft");
        await load();
        await toggle(personaId, name, "attach");
        toastOk(`Skill "${name}" diterima & dipasang.`);
      } catch (e) {
        toastErr(e instanceof Error ? e.message : "failed to accept the draft");
      }
    },
    [load, toggle],
  );

  return { data, toggle, accept };
}

// ---------------------------------------------------------------------------
// Tab Characters — character customization ala game.
// ---------------------------------------------------------------------------
function CharacterStudio({ personas }: { personas: PersonaInfo[] }) {
  const [selId, setSelId] = useState(personas[0]?.id ?? "");
  const [emote, setEmote] = useState<PersonaState>("idle");
  const [busyShape, setBusyShape] = useState<OrinShapeKey | null>(null);
  const growth = usePersonaGrowth();
  const { data: bindings, toggle, accept } = useBindings();

  const persona = personas.find((p) => p.id === selId) ?? personas[0];
  const { key: activeShape } = usePersonaShape(persona?.id);
  const bp = bindings?.personas.find((p) => p.id === persona?.id);
  const g: PersonaGrowth | undefined = growth.get(persona?.id ?? "");

  const xpPct = useMemo(
    () => (g ? (g.nextLevelAt === null ? 100 : Math.min(100, Math.round((g.turns / g.nextLevelAt) * 100))) : 0),
    [g],
  );

  async function pickShape(k: OrinShapeKey) {
    if (!persona || busyShape) return;
    setBusyShape(k);
    try {
      const r = await fetch(apiUrl("/api/personas/shapes"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId: persona.id, shape: k }),
      });
      if (!r.ok)
        throw new Error((await r.json().catch(() => ({}))).error ?? "failed to save the shape");
      const { shapes } = (await r.json()) as { shapes: { personaId: string; shape: OrinShapeKey }[] };
      setShapeOverrides(Object.fromEntries(shapes.map((s) => [s.personaId, s.shape])));
      toastOk(`${persona.name} kini berwujud "${SHAPES[k].name}".`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to save the shape");
    } finally {
      setBusyShape(null);
    }
  }

  if (!persona) return <EmptyState icon={<Users size={20} />} title="Belum ada persona" hint="Persona dimuat dari packages/personas." />;

  const defaultShape = PERSONA_SHAPE[persona.id];
  const isCustom = activeShape !== defaultShape;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* ===== Roster — pilih karakter ===== */}
      <div className="flex flex-col gap-2">
        <SectionTitle>
          <Users size={14} aria-hidden className="mr-1 inline align-[-2px]" /> Roster
        </SectionTitle>
        {personas.map((p) => (
          <button
            key={p.id}
            aria-pressed={p.id === persona.id}
            onClick={() => {
              setSelId(p.id);
              setEmote("idle");
            }}
            className={`flex cursor-pointer items-center gap-2.5 rounded-card border px-3 py-2 text-left transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
              p.id === persona.id
                ? "border-accent/55 bg-accent-soft text-accent-text"
                : "border-line bg-surface text-muted hover:border-line-strong hover:text-primary"
            }`}
          >
            <PersonaFace personaId={p.id} size={34} />
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate text-body">{p.name}</b>
              <GrowthBadge g={growth.get(p.id)} />
            </span>
          </button>
        ))}
      </div>

      {/* ===== Detail karakter ===== */}
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col items-center gap-4 p-4 sm:flex-row">
          <div className="flex flex-col items-center gap-2">
            <OrinPortrait state={emote} personaId={persona.id} size={190} />
            <div className="flex flex-wrap justify-center gap-1">
              {EMOTES.map((e) => (
                <ChipToggle key={e.state} active={emote === e.state} onClick={() => setEmote(e.state)}>
                  {e.label}
                </ChipToggle>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <h2 className="text-display font-semibold text-primary">{persona.name}</h2>
              <p className="text-caption text-muted">{persona.expertise}</p>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-caption text-muted">
                <b className="text-secondary">{g?.level ?? "—"}</b>
                <span>{g ? `${g.turns}/${g.nextLevelAt ?? "MAX"} turn` : "belum ada riwayat"}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-pill bg-line-strong">
                <div className="h-full rounded-pill bg-accent transition-all duration-500" style={{ width: `${xpPct}%` }} />
              </div>
            </div>
            <MetaRow>
              <span title="Sesi yang pernah dibuat persona ini">💠 {g?.sessions ?? 0} sesi</span>
              <span aria-hidden>·</span>
              <span title="Turn selesai">⚡ {g?.turns ?? 0} turn</span>
              <span aria-hidden>·</span>
              <span title="Task project selesai">✅ {g?.tasksDone ?? 0} task</span>
            </MetaRow>
          </div>
        </Card>

        {/* ===== Wujud / geometri ===== */}
        <div className="flex flex-col gap-2">
          <SectionTitle>
            <Shapes size={14} aria-hidden className="mr-1 inline align-[-2px]" /> Wujud — Geometri {isCustom && <Chip tone="info">custom</Chip>}
          </SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {SHAPE_ORDER.map((k) => {
              const s = SHAPES[k];
              const on = k === activeShape;
              return (
                <button
                  key={k}
                  aria-pressed={on}
                  disabled={busyShape !== null}
                  onClick={() => void pickShape(k)}
                  title={`Jadikan wujud ${persona.name}: ${s.name}`}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg2 border px-2 py-2.5 text-center transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                    on
                      ? "border-accent bg-accent-soft text-accent-text"
                      : "border-line bg-inset text-muted hover:border-line-strong hover:text-primary"
                  }`}
                >
                  <svg width={44} height={44} viewBox="-165 -165 330 330" aria-hidden focusable="false">
                    <g
                      fill={s.color}
                      transform={s.bodyScale && s.bodyScale !== 1 ? `scale(${s.bodyScale})` : undefined}
                    >
                      {s.geom}
                    </g>
                  </svg>
                  <b className="text-caption font-semibold">{s.name}</b>
                  {on ? (
                    <small className="text-dim">aktif {isCustom ? "" : "(default)"}</small>
                  ) : (
                    <small className="text-dim">{defaultShape === k ? "default" : busyShape === k ? "menyimpan…" : "pilih"}</small>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== Skill loadout ===== */}
        <div className="flex flex-col gap-2">
          <SectionTitle>
            <Sparkle size={14} aria-hidden className="mr-1 inline align-[-2px]" /> Skill Loadout{" "}
            <span className="text-dim">— {bp?.effective.length ?? 0} terpasang · berlaku untuk sesi baru</span>
          </SectionTitle>
          {!bp ? (
            <Skeleton lines={3} />
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {bp.effective.length === 0 ? (
                  <small className="text-caption text-dim">Belum ada skill terpasang — latih via tab Missions, lalu pasang di sini.</small>
                ) : (
                  bp.effective.map((s) => (
                    <button
                      key={s}
                      onClick={() => void toggle(bp.id, s, "detach")}
                      title="Lepas skill ini dari persona"
                      className="cursor-pointer"
                    >
                      <Chip tone="ok">
                        {s} <X size={10} weight="bold" aria-hidden className="ml-0.5 inline align-[-1px]" />
                      </Chip>
                    </button>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {bindings?.skills.map((s) => {
                  const on = bp.effective.includes(s.name);
                  const native = bp.bundled.includes(s.name);
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
                        <Button size="sm" variant="primary" onClick={() => void accept(bp.id, s.slug!, s.name)} title="Lint + aktifkan + pasang ke persona ini">
                          Terima &amp; pasang
                        </Button>
                      ) : (
                        <Button size="sm" active={on} onClick={() => void toggle(bp.id, s.name, on ? "detach" : "attach")}>
                          {on ? "Terpasang ✓" : "Pasang"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View utama — menu Persona (menggantikan Enhancer/Dungeon).
// ---------------------------------------------------------------------------
export function PersonaStudioView({
  personas,
  onBack,
  onOpenProject,
}: {
  personas: PersonaInfo[];
  onBack: () => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const [view, setView] = useState<"characters" | "misi" | "riwayat">("characters");
  const [dungeons, setDungeons] = useState<DungeonRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadFor = useRef<string | null>(null);
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
      const r = await fetch(apiUrl("/api/dungeons"));
      if (r.ok) setDungeons(((await r.json()) as { dungeons: DungeonRow[] }).dungeons);
    } catch {
      /* refresh berikutnya */
    }
  }, []);

  useEffect(() => {
    if (view === "characters") return; // poll hanya saat tab latihan terbuka
    void refresh();
    const t = setInterval(() => void refresh(), 5_000); // progress run live
    return () => clearInterval(t);
  }, [refresh, view]);

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
      const r = await fetch(apiUrl("/api/dungeons/mission"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personaId,
          title: title.trim() || `Latih ${skillName.trim()}`,
          goal: goal.trim() || fallbackGoal,
          skillName: skillName.trim(),
          skillDescription: skillDesc.trim(),
          mode,
          resources:
            mode === "research"
              ? resourcesText.split("\n").map((s) => s.trim()).filter(Boolean)
              : [],
          acceptance: accText.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) {
        toastErr((((await r.json()) as { error?: string }).error ?? "failed to create the training") + "");
        return;
      }
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
      const r = await fetch(apiUrl("/api/dungeons"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      if (!r.ok)
        toastErr((((await r.json()) as { error?: string }).error ?? "failed to run the mission") + "");
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
        const r = await fetch(
          apiUrl(`/api/dungeons/${encodeURIComponent(slug)}/materials?name=${encodeURIComponent(f.name)}`),
          { method: "POST", body: await f.arrayBuffer() },
        );
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

  async function remove(missionId: string) {
    try {
      const r = await fetch(apiUrl(`/api/dungeons/${encodeURIComponent(missionId)}`), { method: "DELETE" });
      if (!r.ok)
        toastErr((((await r.json()) as { error?: string }).error ?? "failed to delete the training") + "");
      await refresh();
    } finally {
      /* void */
    }
  }

  const persona = personas.find((p) => p.id === personaId);
  const canCreate = personaId && skillName.trim().length >= 3 && skillDesc.trim().length >= 10 && !busy;
  const seedMissions = dungeons?.filter((d) => d.mission.origin !== "user") ?? [];
  const userMissions = dungeons?.filter((d) => d.mission.origin === "user") ?? [];

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
              <span aria-hidden>·</span> persona {d.mission.persona.replace("yui-", "")}
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
            {uploading === d.mission.id ? (
              "uploading…"
            ) : (
              <>
                <UploadSimple size={12} aria-hidden className="mr-1 inline align-[-2px]" /> Materials
              </>
            )}
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
    <section className="mx-auto flex w-full flex-col gap-5 px-4 py-6" aria-label="Persona — character studio">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={onBack}>
            <ArrowLeft size={13} aria-hidden />
          </Button>
          <h1 className="flex items-center gap-2 text-display font-semibold text-primary">
            <Users size={22} aria-hidden /> Persona
          </h1>
        </div>
        <p className="max-w-3xl text-body leading-6 text-muted">
          Susun tim kamu seperti membangun karakter game: pilih persona dari{" "}
          <b className="text-secondary">roster</b>, sesuaikan{" "}
          <b className="text-secondary">wujud maskot</b>-nya, pasang{" "}
          <b className="text-secondary">skill loadout</b> — lalu kirim dia ke{" "}
          <b className="text-secondary">misi latihan</b> untuk menguasai skill baru (hasilnya
          bisa langsung dipasang; riwayat latihan tersimpan).
        </p>
        <TabList
          value={view}
          onChange={(id) => setView(id as typeof view)}
          tabs={[
            { id: "characters", label: "Characters" },
            { id: "misi", label: "Missions" },
            { id: "riwayat", label: `Training history (${allRuns.length})` },
          ]}
        />
      </header>

      {view === "characters" ? (
        <CharacterStudio personas={personas} />
      ) : view === "riwayat" ? (
        allRuns.length === 0 ? (
          <EmptyState icon={<Clock size={20} />} title="Belum ada sesi latihan" hint="Jalankan misi dulu — setiap run latihan tercatat di sini." />
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
                <Button
                  size="sm"
                  disabled={!onOpenProject}
                  onClick={() => onOpenProject?.(r.projectId ?? "")}
                  title="Buka ruang latihan (chat + artefak sesi ini)"
                >
                  Buka sesi →
                </Button>
              </Card>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              + Misi baru
            </Button>
            <small className="text-caption text-dim">
              Form lengkap (mode, persona, skill, kriteria lulus) terbuka sebagai modal.
            </small>
          </div>

          {userMissions.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionTitle>Misi kamu</SectionTitle>
              <div className="grid gap-2 md:grid-cols-2">{userMissions.map(card)}</div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <SectionTitle>Misi bawaan</SectionTitle>
            {dungeons === null ? <Skeleton lines={3} /> : <div className="grid gap-2 md:grid-cols-2">{seedMissions.map(card)}</div>}
          </div>

          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const slug = dungeons?.find((d) => d.mission.id === uploadFor.current)?.mission.slug;
              if (slug && e.target.files?.length) void upload(slug, e.target.files);
            }}
          />

          <Modal
            open={formOpen}
            onClose={() => setFormOpen(false)}
            title={
              <span className="flex items-center gap-2">
                <Sword size={16} aria-hidden /> Misi latihan baru
              </span>
            }
            wide
          >
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
                  ? "Persona meneliti topiknya sendiri (boleh beri URL awal)."
                  : "Kamu unggah file (pdf/xlsx/csv/md/…) → persona mempelajarinya lalu merangkum jadi skill. Unggah setelah misi dibuat."}
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
                  <TextInput
                    value={skillDesc}
                    placeholder="mis. dasar Phaser 3 untuk mulai game 2D"
                    onChange={(e) => setSkillDesc(e.target.value)}
                  />
                </Field>
                <Field label="Judul latihan (opsional)" hint={`otomatis: Latih ${skillName || "…"}`} className="col-span-2">
                  <TextInput value={title} placeholder={`otomatis: Latih ${skillName || "…"}`} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Tujuan / instruksi khusus (opsional)" className="col-span-2">
                  <TextArea value={goal} rows={2} placeholder="kosong = default mode" onChange={(e) => setGoal(e.target.value)} />
                </Field>
                {mode === "research" && (
                  <Field label="Sumber awal — URL, satu per baris (opsional)" className="col-span-2">
                    <TextArea
                      value={resourcesText}
                      rows={2}
                      spellCheck={false}
                      placeholder="https://…"
                      onChange={(e) => setResourcesText(e.target.value)}
                    />
                  </Field>
                )}
                <Field label="Kriteria lulus — satu per baris" hint="dipakai pada blind eval nanti" className="col-span-2">
                  <TextArea
                    value={accText}
                    rows={3}
                    spellCheck={false}
                    onChange={(e) => {
                      setAccText(e.target.value);
                      setAccDirty(true);
                    }}
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" disabled={!canCreate} onClick={() => void create()}>
                  {busy ? "membuat…" : mode === "research" ? "Buat & latih" : "Buat misi (lalu unggah bahan)"}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </section>
  );
}

/** Toggle mode chip (dipakai form misi) — padanan ChipToggle dengan ukuran form. */
function ChipToggle2({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md2 border px-3 py-1.5 text-caption transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
        active ? "border-accent bg-accent-soft text-accent-text" : "border-line bg-transparent text-muted hover:border-line-strong hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}
