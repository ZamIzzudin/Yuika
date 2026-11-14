"use client";
import { apiUrl, authFetch } from "@/lib/api";
// 🎮 Persona Studio, menu Persona (permintaan user 2026-11):
// tab Characters = CharacterStage (layar character-select penuh, konstelasi,
// maskot hero, dua card kaca, galeri dock; lihat CharacterStage.tsx).
// Missions tab (skill training) + Training history, formerly Dungeon.
// Minimalist but informative: mission cards show identity + short meta
// + last run result + actions; history rows are date.status.summary.
// UI: only ui/* components + semantic Tailwind (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaInfo } from "@yuika/contracts";
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
  X,
} from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { CharacterStage } from "./CharacterStage";
import { BlindTestPanel } from "./BlindTestPanel";
import { Skeleton } from "./Skeleton";
import { toastErr } from "./ui/toast";
import {
  Button,
  Card,
  ConfirmDialog,
  Modal,
  Field,
  TextInput,
  TextArea,
  Select,
  TabPills,
  EmptyState,
  SectionTitle,
  Chip,
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

// View utama, menu Persona (menggantikan Enhancer/Dungeon).
// ---------------------------------------------------------------------------
export function PersonaStudioView({
  personas,
  onPersonaRenamed,
  onPersonasChanged,
  onBack,
  onOpenProject,
}: {
  personas: PersonaInfo[];
  /** F1 rename: selesai rename/reset → refetch daftar persona (nama baru tampil di semua UI). */
  onPersonaRenamed?: () => void;
  /** F2 forge: daftar persona berubah (custom baru/ubah/hapus). */
  onPersonasChanged?: () => void;
  onBack: () => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const [view, setView] = useState<"personas" | "missions" | "blind" | "history">(
    "personas",
  );
  const [dungeons, setDungeons] = useState<DungeonRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadFor = useRef<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Popup konfirmasi hapus mission (dulu: langsung delete tanpa konfirmasi).
  const [confirmMission, setConfirmMission] = useState<{
    id: string;
    title: string;
  } | null>(null);

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
      const r = await authFetch(apiUrl("/api/dungeons"));
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
      const r = await authFetch(apiUrl("/api/dungeons/mission"), {
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
      const r = await authFetch(apiUrl("/api/dungeons"), {
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
        const r = await authFetch(
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
      const r = await authFetch(
        apiUrl(`/api/dungeons/${encodeURIComponent(missionId)}`),
        { method: "DELETE" },
      );
      if (!r.ok)
        toastErr(
          (((await r.json()) as { error?: string }).error ??
            "failed to delete the training") + "",
        );
      setConfirmMission(null);
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

  /** Mission card: identity + Run on the top row, short skill meta,
   *  last run result separated by a line, tool actions on the bottom row. */
  const card = (d: DungeonRow) => {
    const active = d.runs.find((r) => r.status === "running");
    const last = d.runs[d.runs.length - 1];
    const materials = d.mission.resources.filter((r) =>
      r.startsWith("materials/"),
    );
    return (
      <Card key={d.mission.id} className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <PersonaFace personaId={d.mission.persona} size={30} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <b className="truncate text-body font-semibold text-primary">
              {d.mission.title}
            </b>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-dim">
              <code className="rounded-pill border border-line bg-inset px-2 py-px font-mono text-secondary">
                {d.mission.targetSkill.name}
              </code>
              {materials.length > 0 && (
                <span
                  className="flex items-center gap-1"
                  title={materials.join("\n")}
                >
                  <UploadSimple size={11} aria-hidden />{" "}
                  {materials.length} materials
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            disabled={Boolean(active)}
            onClick={() => void run(d.mission.id)}
          >
            {active ? (
              <span className="flex items-center gap-1.5">
                <CircleNotch size={12} aria-hidden className="animate-spin" />{" "}
                running
              </span>
            ) : (
              "Run"
            )}
          </Button>
        </div>

        {last && (
          <div className="flex items-start gap-2 border-t border-line pt-3">
            {last.status === "running" ? (
              <CircleNotch
                size={12}
                aria-hidden
                className="mt-1 shrink-0 animate-spin text-warn"
              />
            ) : last.status === "done" ? (
              <Check
                size={12}
                weight="bold"
                aria-hidden
                className="mt-1 shrink-0 text-success"
              />
            ) : (
              <X
                size={12}
                weight="bold"
                aria-hidden
                className="mt-1 shrink-0 text-danger"
              />
            )}
            <span className="min-w-0 flex-1 text-caption leading-5 text-muted line-clamp-2">
              {last.summary ??
                (last.status === "running"
                  ? "The persona is working through the mission…"
                  : "No summary recorded.")}
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={uploading === d.mission.id}
            onClick={() => {
              uploadFor.current = d.mission.id;
              fileRef.current?.click();
            }}
          >
            {uploading === d.mission.id ? "Uploading…" : "Materials"}
          </Button>
          {d.mission.origin === "user" && (
            <Button
              size="sm"
              variant="danger"
              onClick={() =>
                setConfirmMission({ id: d.mission.id, title: d.mission.title })
              }
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
      aria-label="Persona, character studio"
    >
      {/* Header: back + judul di kiri, TAB PILLS terpusat di tengah. */}
      {/* grid 3 kolom [1fr_auto_1fr], pills center geometris sejati (kolom kiri
          & kanan sama lebar); sebelumnya mx-auto + spacer fixed 150px → geser). */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pb-3">
        <div className="flex shrink-0 justify-self-start">
          <Button onClick={onBack} aria-label="Back to workspace">
            <ArrowLeft size={13} aria-hidden />
          </Button>
        </div>
        <TabPills
          ariaLabel="Persona views"
          value={view}
          onChange={(id) => setView(id as typeof view)}
          tabs={[
            { id: "personas", label: "Persona" },
            { id: "missions", label: "Missions" },
            { id: "blind", label: "Blind test" },
            { id: "history", label: `Training history (${allRuns.length})` },
          ]}
        />
      </header>

      {view === "personas" ? (
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          <CharacterStage personas={personas} onPersonaRenamed={onPersonaRenamed} onPersonasChanged={onPersonasChanged} />
        </div>
      ) : view === "blind" ? (
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          <BlindTestPanel personas={personas} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {view === "history" ? (
            allRuns.length === 0 ? (
              <EmptyState
                icon={<Clock size={20} />}
                title="No training runs yet"
                hint="Run a mission first, every training run is recorded here."
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <header className="col-span-full flex flex-col gap-1">
                  <b className="text-body font-semibold text-primary">
                    Training history
                  </b>
                  <p className="text-caption leading-5 text-dim">
                    Every mission run, newest first. Open a run to revisit its
                    chat and artifacts.
                  </p>
                </header>
                {allRuns.map((r) => (
                  <Card key={r.id} className="flex h-full flex-col gap-2 p-3">
                    <div className="flex items-center gap-2.5">
                      <PersonaFace personaId={r.persona} size={28} />
                      <b className="min-w-0 flex-1 truncate text-body font-semibold text-primary">
                        {r.title}
                      </b>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.status === "running" ? (
                        <span className="flex shrink-0 items-center gap-1 text-caption text-warn">
                          <CircleNotch
                            size={11}
                            aria-hidden
                            className="animate-spin"
                          />{" "}
                          running
                        </span>
                      ) : r.status === "done" ? (
                        <Chip size="sm" tone="ok">
                          Done
                        </Chip>
                      ) : (
                        <Chip size="sm" tone="danger">
                          Failed
                        </Chip>
                      )}
                      <span className="shrink-0 tabular-nums text-caption text-dim">
                        {new Date(r.startedAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {r.summary && (
                      <p
                        className="line-clamp-2 text-caption leading-5 text-muted"
                        title={r.summary}
                      >
                        {r.summary}
                      </p>
                    )}
                    <div className="mt-auto flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!onOpenProject || !r.projectId}
                        onClick={() => onOpenProject?.(r.projectId ?? "")}
                        title="Open the training room (chat + artifacts)"
                      >
                        Open
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <>
              <header className="flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <b className="text-body font-semibold text-primary">
                    Missions
                  </b>
                  <p className="max-w-[520px] text-caption leading-5 text-dim">
                    Run a mission to grow a new skill. The persona researches a
                    topic or studies your files, then distills what it learns.
                  </p>
                </div>
                <Button onClick={() => setFormOpen(true)}>
                  <Sword size={13} aria-hidden /> New mission
                </Button>
              </header>

              {userMissions.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  <SectionTitle>Your missions</SectionTitle>
                  <div className="grid gap-2 md:grid-cols-2">
                    {userMissions.map(card)}
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-col gap-2">
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
                        label="Starting sources, one URL per line (optional)"
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
                      label="Pass criteria, one per line"
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

      {/* Popup konfirmasi hapus training mission */}
      <ConfirmDialog
        open={confirmMission !== null}
        title="Delete mission"
        message={
          confirmMission && (
            <>
              Permanently delete <b>“{confirmMission.title}”</b> and its run
              history? The skill it was training stays untouched.
            </>
          )
        }
        confirmLabel="Delete mission"
        onConfirm={() => confirmMission && void remove(confirmMission.id)}
        onClose={() => setConfirmMission(null)}
      />
    </section>
  );
}

/** Toggle mode chip (dipakai form misi), padanan ChipToggle dengan ukuran form. */
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
