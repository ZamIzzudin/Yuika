"use client";
import { apiUrl } from "@/lib/api";
// 🎮 Persona Studio — menu Persona (permintaan user 2026-11):
// tab Characters = CharacterStage (layar character-select penuh — konstelasi,
// maskot hero, dua card kaca, galeri dock; lihat CharacterStage.tsx).
// Tab Missions (melatih skill baru) + Training history = warisan Dungeon (P1-DUN).
// DS-1: hanya komponen ui/* + utility Tailwind semantik (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaInfo } from "@yui/contracts";
import {
  ArrowLeft,
  Books,
  Check,
  CircleNotch,
  Clock,
  MagnifyingGlass,
  Sword,
  Trash,
  UploadSimple,
  Users,
  X,
} from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { CharacterStage } from "./CharacterStage";
import { Skeleton } from "./Skeleton";
import { toastErr } from "./ui/toast";
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
  const [view, setView] = useState<"personas" | "missions" | "history">(
    "personas",
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
    if (view === "personas") return; // poll hanya saat tab latihan terbuka
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
      className="flex h-full min-h-0 w-full flex-col px-4 pt-3 lg:px-6"
      aria-label="Persona — character studio"
    >
      {/* Header: back + judul di kiri, TAB PILLS terpusat di tengah. */}
      <header className="flex items-center gap-3 pb-3">
        <div className="flex shrink-0 items-center gap-3">
          <Button onClick={onBack} aria-label="Back to workspace">
            <ArrowLeft size={13} aria-hidden />
          </Button>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-primary">
            Personas
          </h1>
        </div>
        <nav
          role="tablist"
          aria-label="Persona views"
          className="mx-auto flex items-center gap-1 rounded-pill border border-line bg-surface/70 p-1 shadow-[0_10px_30px_-18px_rgb(0_0_0/.5)] backdrop-blur-md"
        >
          {(
            [
              { id: "personas", label: "Persona" },
              { id: "missions", label: "Missions" },
              { id: "history", label: `Training history (${allRuns.length})` },
            ] as const
          ).map((t) => {
            const on = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setView(t.id)}
                className={`cursor-pointer rounded-pill px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  on
                    ? "bg-hover text-primary shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                    : "text-muted hover:text-primary"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
        {/* penyeimbang lebar kiri supaya pills benar-benar di tengah */}
        <div className="shrink-0 basis-[150px]" aria-hidden />
      </header>

      {view === "personas" ? (
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          <CharacterStage personas={personas} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {view === "history" ? (
            allRuns.length === 0 ? (
              <EmptyState
                icon={<Clock size={20} />}
                title="No training runs yet"
                hint="Run a mission first — every training run is recorded here."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {allRuns.map((r) => (
                  <Card
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <PersonaFace personaId={r.persona} size={24} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <b className="truncate text-body text-primary">
                        {r.title}
                      </b>
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
        </div>
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
