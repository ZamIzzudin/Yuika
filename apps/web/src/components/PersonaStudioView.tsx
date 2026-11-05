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
  CaretLeft,
  CaretRight,
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
import {
  PERSONA_SHAPE,
  SHAPE_ORDER,
  SHAPES,
  setShapeOverrides,
  usePersonaShape,
  type OrinShapeKey,
} from "./orinShapes";
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
    "Step-by-step procedure that can be followed without extra context",
    "At least 2 real sources",
    "No unverifiable claims",
  ],
  documents: [
    "Faithfully summarize ALL materials (no invention)",
    "Easy-to-scan structure",
    "Cites the source file for every part",
  ],
};

/** Emote preview — maskot hidup bisa dicoba semua ekspresi (ala pilih emote game). */
const EMOTES: { state: PersonaState; label: string }[] = [
  { state: "idle", label: "Idle" },
  { state: "thinking", label: "Think" },
  { state: "working", label: "Work" },
  { state: "awaiting_input", label: "Wait" },
  { state: "done", label: "Done" },
  { state: "celebrating", label: "Party" },
  { state: "error", label: "Oops" },
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
          throw new Error(
            (await res.json().catch(() => ({}))).error ?? "request failed",
          );
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
          throw new Error(
            (await res.json().catch(() => ({}))).error ??
              "failed to accept the draft",
          );
        await load();
        await toggle(personaId, name, "attach");
        toastOk(`Skill "${name}" accepted & equipped.`);
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
  const [panel, setPanel] = useState<"shape" | "skill">("shape");
  const [busyShape, setBusyShape] = useState<OrinShapeKey | null>(null);
  const growth = usePersonaGrowth();
  const { data: bindings, toggle, accept } = useBindings();

  const persona = personas.find((p) => p.id === selId) ?? personas[0];
  const { key: activeShape } = usePersonaShape(persona?.id);
  const bp = bindings?.personas.find((p) => p.id === persona?.id);
  const g: PersonaGrowth | undefined = growth.get(persona?.id ?? "");
  const idx = persona ? personas.findIndex((p) => p.id === persona.id) : -1;

  const xpPct = useMemo(
    () =>
      g
        ? g.nextLevelAt === null
          ? 100
          : Math.min(100, Math.round((g.turns / g.nextLevelAt) * 100))
        : 0,
    [g],
  );

  /** Switch character (wrap-around carousel) + reset emote to neutral. */
  const go = useCallback(
    (dir: -1 | 1) => {
      setSelId((cur) => {
        const i = personas.findIndex((p) => p.id === cur);
        if (i < 0 || personas.length < 2) return cur;
        return personas[(i + dir + personas.length) % personas.length]!.id;
      });
      setEmote("idle");
    },
    [personas],
  );

  // Game-style keyboard: ← / → switch character (ignored while typing).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [go]);

  // Gallery: keep the selected card visible (auto-center on switch).
  useEffect(() => {
    document
      .querySelector(`[data-gal-id="${persona?.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [persona?.id]);

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
        throw new Error(
          (await r.json().catch(() => ({})))?.error ?? "failed to save the shape",
        );
      const { shapes } = (await r.json()) as {
        shapes: { personaId: string; shape: OrinShapeKey }[];
      };
      setShapeOverrides(
        Object.fromEntries(shapes.map((s) => [s.personaId, s.shape])),
      );
      toastOk(`${persona.name} now takes the "${SHAPES[k].name}" form.`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to save the shape");
    } finally {
      setBusyShape(null);
    }
  }

  if (!persona)
    return (
      <EmptyState
        icon={<Users size={20} />}
        title="No personas yet"
        hint="Personas are loaded from packages/personas."
      />
    );

  const defaultShape = PERSONA_SHAPE[persona.id];
  const isCustom = activeShape !== defaultShape;

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Stage: detail · mascot carousel · customization ===== */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(200px,0.85fr)_1.2fr_minmax(240px,1fr)]">
        {/* --- Left: identity & stats card --- */}
        <Card className="order-2 flex flex-col gap-3 p-4 lg:order-1">
          <div className="flex flex-col gap-1">
            <h2 className="text-display font-semibold text-primary">
              {persona.name}
            </h2>
            <p className="text-caption leading-5 text-muted">
              {persona.expertise}
            </p>
            {isCustom && (
              <div className="pt-1">
                <Chip tone="info">
                  <Shapes size={11} aria-hidden className="mr-1 inline align-[-1px]" />
                  custom shape
                </Chip>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-caption text-muted">
              <b className="text-secondary">{g?.level ?? "no level yet"}</b>
              <span>
                {g ? `${g.turns}/${g.nextLevelAt ?? "MAX"} turns` : "0 turns"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-pill bg-line-strong">
              <div
                className="h-full rounded-pill bg-accent transition-all duration-500"
                style={{ width: `${xpPct}%` }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg2 bg-inset px-3 py-2.5">
            {[
              { icon: "💠", label: "Sessions", v: g?.sessions ?? 0 },
              { icon: "⚡", label: "Turns done", v: g?.turns ?? 0 },
              { icon: "✅", label: "Tasks done", v: g?.tasksDone ?? 0 },
            ].map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between text-caption text-muted"
                title={r.label}
              >
                <span>
                  {r.icon} {r.label}
                </span>
                <b className="font-mono text-body text-primary">{r.v}</b>
              </div>
            ))}
          </div>
        </Card>

        {/* --- Center: mascot stage + carousel chevrons --- */}
        <div className="order-1 flex flex-col items-center gap-3 rounded-card border border-line bg-inset px-2 py-4 lg:order-2">
          <div className="flex w-full items-center justify-center gap-1 sm:gap-3">
            <button
              type="button"
              aria-label="Previous persona"
              onClick={() => go(-1)}
              disabled={personas.length < 2}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-line bg-surface text-muted transition-all ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-accent hover:text-primary active:scale-90 disabled:pointer-events-none disabled:opacity-25"
            >
              <CaretLeft size={24} aria-hidden />
            </button>
            {/* pop-yui: mascot "pops in" on every character switch (character-select feel) */}
            <div key={persona.id} className="pop-yui flex items-center justify-center">
              <OrinPortrait state={emote} personaId={persona.id} size={230} />
            </div>
            <button
              type="button"
              aria-label="Next persona"
              onClick={() => go(1)}
              disabled={personas.length < 2}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-line bg-surface text-muted transition-all ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-accent hover:text-primary active:scale-90 disabled:pointer-events-none disabled:opacity-25"
            >
              <CaretRight size={24} aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-1">
            {EMOTES.map((e) => (
              <ChipToggle
                key={e.state}
                active={emote === e.state}
                onClick={() => setEmote(e.state)}
              >
                {e.label}
              </ChipToggle>
            ))}
          </div>
          <small className="text-dim">
            click the mascot to greet it · try the emotes
          </small>
        </div>

        {/* --- Right: customization tabs (Shape / Skills) --- */}
        <div className="order-3 flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
          <TabList
            value={panel}
            onChange={(id) => setPanel(id as typeof panel)}
            tabs={[
              { id: "shape", label: "Shape" },
              { id: "skill", label: `Skills (${bp?.effective.length ?? 0})` },
            ]}
          />
          {panel === "shape" ? (
            <div className="grid max-h-[430px] grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
              {SHAPE_ORDER.map((k) => {
                const s = SHAPES[k];
                const on = k === activeShape;
                return (
                  <button
                    key={k}
                    aria-pressed={on}
                    disabled={busyShape !== null}
                    onClick={() => void pickShape(k)}
                    title={`Set ${persona.name}'s form: ${s.name}${
                      defaultShape === k ? " (default)" : ""
                    }`}
                    className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg2 border px-1 py-1.5 text-center transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                      on
                        ? "border-accent bg-accent-soft text-accent-text"
                        : "border-line bg-inset text-muted hover:border-line-strong hover:text-primary"
                    }`}
                  >
                    <svg
                      width={38}
                      height={38}
                      viewBox="-165 -165 330 330"
                      aria-hidden
                      focusable="false"
                    >
                      <g
                        fill={s.color}
                        transform={
                          s.bodyScale && s.bodyScale !== 1
                            ? `scale(${s.bodyScale})`
                            : undefined
                        }
                      >
                        {s.geom}
                      </g>
                    </svg>
                    <b className="text-dim text-[11px] leading-3 font-medium">
                      {s.name}
                    </b>
                  </button>
                );
              })}
            </div>
          ) : !bp ? (
            <Skeleton lines={5} />
          ) : (
            <div className="flex max-h-[430px] flex-col gap-1.5 overflow-y-auto pr-0.5">
              <small className="flex items-center gap-1 text-dim">
                <Sparkle size={11} aria-hidden /> {bp.effective.length} equipped
                · applies to new sessions · click a chip to unequip
              </small>
              {bp.effective.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {bp.effective.map((s) => (
                    <button
                      key={s}
                      onClick={() => void toggle(bp.id, s, "detach")}
                      title="Unequip this skill"
                      className="cursor-pointer"
                    >
                      <Chip tone="ok">
                        {s}{" "}
                        <X
                          size={10}
                          weight="bold"
                          aria-hidden
                          className="ml-0.5 inline align-[-1px]"
                        />
                      </Chip>
                    </button>
                  ))}
                </div>
              )}
              {bindings?.skills.map((s) => {
                const on = bp.effective.includes(s.name);
                const native = bp.bundled.includes(s.name);
                const draft = s.status === "draft";
                return (
                  <div
                    key={s.name}
                    className={`flex items-center gap-2 rounded-lg2 border px-2.5 py-1.5 ${
                      on ? "border-accent/45 bg-surface" : "border-line bg-surface"
                    }`}
                  >
                    <b
                      className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-caption font-semibold text-primary"
                      title={s.description}
                    >
                      {s.name}
                      {draft ? <Chip tone="warn">draft</Chip> : null}
                      {!draft && s.status === "tested" ? (
                        <Chip tone="info">tested</Chip>
                      ) : null}
                      {native && on ? <Chip tone="muted">bundled</Chip> : null}
                    </b>
                    {draft ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void accept(bp.id, s.slug!, s.name)}
                        title="Lint + activate + equip on this persona"
                      >
                        Accept
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        active={on}
                        onClick={() =>
                          void toggle(bp.id, s.name, on ? "detach" : "attach")
                        }
                      >
                        {on ? "✓" : "Equip"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== Character gallery — horizontal slider (character select) ===== */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionTitle>
            <Users size={14} aria-hidden className="mr-1 inline align-[-2px]" />{" "}
            Characters
          </SectionTitle>
          <span className="text-dim" title="Keyboard arrows work too">
            {idx + 1} / {personas.length} · ← → to switch
          </span>
        </div>
        <div
          role="listbox"
          aria-label="Persona gallery"
          className="flex snap-x gap-2 overflow-x-auto pb-1"
        >
          {personas.map((p) => {
            const on = p.id === persona.id;
            return (
              <button
                key={p.id}
                data-gal-id={p.id}
                role="option"
                aria-selected={on}
                onClick={() => {
                  setSelId(p.id);
                  setEmote("idle");
                }}
                className={`flex w-[88px] shrink-0 cursor-pointer snap-center flex-col items-center gap-1 rounded-card border px-2 py-2.5 transition-all ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                  on
                    ? "scale-[1.04] border-accent bg-accent-soft text-accent-text shadow-[0_0_0_1px_var(--color-accent)]"
                    : "border-line bg-inset text-muted hover:scale-[1.02] hover:border-line-strong hover:text-primary"
                }`}
              >
                <PersonaFace personaId={p.id} size={52} />
                <b className="w-full truncate text-center text-caption font-semibold">
                  {p.name}
                </b>
                <GrowthBadge g={growth.get(p.id)} />
              </button>
            );
          })}
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
  const [view, setView] = useState<"characters" | "missions" | "history">(
    "characters",
  );
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
      if (r.ok)
        setDungeons(((await r.json()) as { dungeons: DungeonRow[] }).dungeons);
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
          ? `Research "${skillName}" from trusted sources and turn it into a practical, followable procedure.`
          : `Study every training material in this mission's folder until understood, then distill it into the skill "${skillName}".`;
      const r = await fetch(apiUrl("/api/dungeons/mission"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personaId,
          title: title.trim() || `Train ${skillName.trim()}`,
          goal: goal.trim() || fallbackGoal,
          skillName: skillName.trim(),
          skillDescription: skillDesc.trim(),
          mode,
          resources:
            mode === "research"
              ? resourcesText
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          acceptance: accText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!r.ok) {
        toastErr(
          (((await r.json()) as { error?: string }).error ??
            "failed to create the training") + "",
        );
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
        toastErr(
          (((await r.json()) as { error?: string }).error ??
            "failed to run the mission") + "",
        );
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
          apiUrl(
            `/api/dungeons/${encodeURIComponent(slug)}/materials?name=${encodeURIComponent(f.name)}`,
          ),
          { method: "POST", body: await f.arrayBuffer() },
        );
        if (!r.ok) {
          toastErr(
            (((await r.json()) as { error?: string }).error ??
              "upload failed") + ` (${f.name})`,
          );
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
      const r = await fetch(
        apiUrl(`/api/dungeons/${encodeURIComponent(missionId)}`),
        { method: "DELETE" },
      );
      if (!r.ok)
        toastErr(
          (((await r.json()) as { error?: string }).error ??
            "failed to delete the training") + "",
        );
      await refresh();
    } finally {
      /* void */
    }
  }

  const persona = personas.find((p) => p.id === personaId);
  const canCreate =
    personaId &&
    skillName.trim().length >= 3 &&
    skillDesc.trim().length >= 10 &&
    !busy;
  const seedMissions =
    dungeons?.filter((d) => d.mission.origin !== "user") ?? [];
  const userMissions =
    dungeons?.filter((d) => d.mission.origin === "user") ?? [];

  const card = (d: DungeonRow) => {
    const active = d.runs.find((r) => r.status === "running");
    const last = d.runs[d.runs.length - 1];
    const materials = d.mission.resources.filter((r) =>
      r.startsWith("materials/"),
    );
    return (
      <Card key={d.mission.id} className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <PersonaFace personaId={d.mission.persona} size={28} />
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-body text-primary">{d.mission.title}</b>
            <MetaRow>
              skill{" "}
              <code className="font-mono">{d.mission.targetSkill.name}</code>
              <span aria-hidden>·</span> persona{" "}
              {d.mission.persona.replace("yui-", "")}
            </MetaRow>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={Boolean(active)}
            onClick={() => void run(d.mission.id)}
          >
            {active ? "running…" : "Run"}
          </Button>
        </div>
        <small className="line-clamp-2 text-caption leading-5 text-muted">
          {d.mission.goal.trim().split("\n")[0]}
        </small>
        {materials.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m) => (
              <code
                key={m}
                className="rounded-pill border border-line bg-hover px-2 py-px font-mono text-caption text-muted"
              >
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
            {last.summary ? (
              <span className="truncate">{last.summary.slice(0, 160)}</span>
            ) : null}
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
                <UploadSimple
                  size={12}
                  aria-hidden
                  className="mr-1 inline align-[-2px]"
                />{" "}
                Materials
              </>
            )}
          </Button>
          {d.mission.origin === "user" && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => void remove(d.mission.id)}
              title="Delete this mission"
              aria-label="Delete mission"
            >
              <Trash size={13} aria-hidden />
            </Button>
          )}
        </div>
      </Card>
    );
  };

  const allRuns =
    dungeons
      ?.flatMap((d) =>
        d.runs.map((r) => ({
          ...r,
          title: d.mission.title,
          persona: d.mission.persona,
        })),
      )
      .sort((a, b) => b.startedAt - a.startedAt) ?? [];

  return (
    <section
      className="mx-auto flex w-full flex-col gap-5 px-4 py-6"
      aria-label="Persona — character studio"
    >
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
          Build your team like building game characters: pick a persona from
          the <b className="text-secondary">gallery</b>, restyle its{" "}
          <b className="text-secondary">mascot form</b>, equip a{" "}
          <b className="text-secondary">skill loadout</b> — then send it on a{" "}
          <b className="text-secondary">training mission</b> to master new
          skills (results can be equipped right away; every run is recorded).
        </p>
        <TabList
          value={view}
          onChange={(id) => setView(id as typeof view)}
          tabs={[
            { id: "characters", label: "Characters" },
            { id: "missions", label: "Missions" },
            { id: "history", label: `Training history (${allRuns.length})` },
          ]}
        />
      </header>

      {view === "characters" ? (
        <CharacterStudio personas={personas} />
      ) : view === "history" ? (
        allRuns.length === 0 ? (
          <EmptyState
            icon={<Clock size={20} />}
            title="No training runs yet"
            hint="Run a mission first — every training run is recorded here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {allRuns.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 px-3 py-2">
                <PersonaFace personaId={r.persona} size={24} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-body text-primary">{r.title}</b>
                  <MetaRow>
                    {new Date(r.startedAt).toLocaleString("en-GB")}
                    <span aria-hidden>·</span>
                    {r.status === "running" ? (
                      <>
                        <CircleNotch
                          size={11}
                          aria-hidden
                          className="animate-pulse"
                        />{" "}
                        running
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
                    {r.summary ? (
                      <span className="truncate">
                        — {r.summary.slice(0, 140)}
                      </span>
                    ) : null}
                  </MetaRow>
                </div>
                <Button
                  size="sm"
                  disabled={!onOpenProject}
                  onClick={() => onOpenProject?.(r.projectId ?? "")}
                  title="Open the training room (chat + artifacts)"
                >
                  Open session →
                </Button>
              </Card>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              + New mission
            </Button>
            <small className="text-caption text-dim">
              The full form (mode, persona, skill, pass criteria) opens as a
              modal.
            </small>
          </div>

          {userMissions.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionTitle>Your missions</SectionTitle>
              <div className="grid gap-2 md:grid-cols-2">
                {userMissions.map(card)}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <SectionTitle>Built-in missions</SectionTitle>
            {dungeons === null ? (
              <Skeleton lines={3} />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {seedMissions.map(card)}
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const slug = dungeons?.find(
                (d) => d.mission.id === uploadFor.current,
              )?.mission.slug;
              if (slug && e.target.files?.length)
                void upload(slug, e.target.files);
            }}
          />

          <Modal
            open={formOpen}
            onClose={() => setFormOpen(false)}
            title={
              <span className="flex items-center gap-2">
                <Sword size={16} aria-hidden /> New training mission
              </span>
            }
            wide
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <ChipToggle2
                  active={mode === "research"}
                  onClick={() => switchMode("research")}
                >
                  <MagnifyingGlass size={12} aria-hidden /> Self research
                </ChipToggle2>
                <ChipToggle2
                  active={mode === "documents"}
                  onClick={() => switchMode("documents")}
                >
                  <Books size={12} aria-hidden /> Study materials (files)
                </ChipToggle2>
              </div>
              <small className="text-caption leading-5 text-muted">
                {mode === "research"
                  ? "The persona researches the topic on its own (you may seed it with URLs)."
                  : "You upload files (pdf/xlsx/csv/md/…) → the persona studies them and distills a skill. Upload after the mission is created."}
              </small>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Persona to train" className="col-span-2">
                  <div className="flex items-center gap-2">
                    {persona && (
                      <PersonaFace personaId={persona.id} size={32} />
                    )}
                    <Select
                      value={personaId}
                      onChange={(e) => setPersonaId(e.target.value)}
                      aria-label="Persona"
                    >
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
                  <TextInput
                    value={skillName}
                    placeholder="e.g. phaser-basics"
                    spellCheck={false}
                    onChange={(e) => setSkillName(e.target.value)}
                  />
                </Field>
                <Field label="When this skill applies (description)">
                  <TextInput
                    value={skillDesc}
                    placeholder="e.g. Phaser 3 basics to start a 2D game"
                    onChange={(e) => setSkillDesc(e.target.value)}
                  />
                </Field>
                <Field
                  label="Training title (optional)"
                  hint={`auto: Train ${skillName || "…"}`}
                  className="col-span-2"
                >
                  <TextInput
                    value={title}
                    placeholder={`auto: Train ${skillName || "…"}`}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field
                  label="Goal / custom instructions (optional)"
                  className="col-span-2"
                >
                  <TextArea
                    value={goal}
                    rows={2}
                    placeholder="empty = mode default"
                    onChange={(e) => setGoal(e.target.value)}
                  />
                </Field>
                {mode === "research" && (
                  <Field
                    label="Starting sources — one URL per line (optional)"
                    className="col-span-2"
                  >
                    <TextArea
                      value={resourcesText}
                      rows={2}
                      spellCheck={false}
                      placeholder="https://…"
                      onChange={(e) => setResourcesText(e.target.value)}
                    />
                  </Field>
                )}
                <Field
                  label="Pass criteria — one per line"
                  hint="used by the blind eval later"
                  className="col-span-2"
                >
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
                <Button
                  variant="primary"
                  disabled={!canCreate}
                  onClick={() => void create()}
                >
                  {busy
                    ? "creating…"
                    : mode === "research"
                      ? "Create & train"
                      : "Create mission (then upload)"}
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
function ChipToggle2({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md2 border px-3 py-1.5 text-caption transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
        active
          ? "border-accent bg-accent-soft text-accent-text"
          : "border-line bg-transparent text-muted hover:border-line-strong hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}
