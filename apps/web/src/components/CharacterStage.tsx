"use client";
// 🌌 CharacterStage, character-select screen satu layar (spec user 2026-11):
// tiga lapis, (1) latar konstelasi SVG, (2) maskot hero di tengah + dua card
// kaca melayang (identitas kiri · stats+skill kanan), (3) galeri dock bawah.
// Aksen tunggal --c (warna wujud aktif) dipakai rasi, radar, ring skill, pil,
// progress bar & galeri, otomatis ikut saat karakter/wujud diganti.
// DATA: persona/growth/skill-bindings NYATA dari API; radar & bonus skill =
// lapisan kosmetik deterministik (hash id/nama), BUKAN hasil evaluasi.
// utility Tailwind + token semantik; tanpa file CSS baru (keyframes di globals).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PersonaGrowth,
  PersonaInfo,
  PersonaState,
} from "@yuika/contracts";
import {
  BookOpen,
  Brain,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  ChartLine,
  Check,
  Code,
  Compass,
  Fire,
  Gear,
  Hammer,
  Lightning,
  MagnifyingGlass,
  PencilSimple,
  PuzzlePiece,
  Plus,
  Rocket,
  Sparkle,
  Trash,
  Target,
  Wrench,
} from "@phosphor-icons/react";
import { OrinPortrait } from "./OrinPortrait";
import { ForgePersonaModal } from "./ForgePersonaModal";
import { ConfirmDialog } from "./ui/confirm";
import { PersonaModelModal } from "./PersonaModelModal";
import { Button, Modal } from "./ui";
import {
  MiniFace,
  PERSONA_SHAPE,
  SHAPE_ORDER,
  SHAPES,
  setShapeOverrides,
  usePersonaShape,
  useShapeOverridesMap,
  type OrinShapeKey,
} from "./orinShapes";
import { toastErr, toastOk } from "./ui/toast";
import { apiUrl, authFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Util deterministik, lapisan kosmetik game (bukan data evaluasi).
// ---------------------------------------------------------------------------
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Radar 6 sumbu, urutan dari atas, searah jarum jam. */
const AXES = [
  "Logic",
  "Craft",
  "Speed",
  "Research",
  "Focus",
  "Detail",
] as const;

/** Pil tipe per domain persona (persona.yaml `domain`). */
const TYPE_TAGS: Record<string, [string, string]> = {
  automation: ["Automation", "Ops"],
  "software-development": ["Builder", "Code"],
  research: ["Research", "Analysis"],
  design: ["Design", "Craft"],
  data: ["Data", "Analysis"],
  documents: ["Scribe", "Docs"],
  planning: ["Planning", "Strategy"],
  orchestration: ["Maestro", "Orchestration"],
};

/** Stat dasar persona: deterministik dari id (3..9), feel game, bukan skor nyata. */
function baseStats(id: string): number[] {
  const rnd = mulberry32(hashStr(id));
  return AXES.map(() => 3 + Math.floor(rnd() * 7));
}

/** Bonus skill: 1–2 sumbu, +1/+2, deterministik dari nama skill. */
function skillBonus(name: string): Array<[number, number]> {
  const rnd = mulberry32(hashStr("skill:" + name));
  const n = rnd() < 0.6 ? 1 : 2;
  const out: Array<[number, number]> = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let a = Math.floor(rnd() * AXES.length);
    while (used.has(a)) a = (a + 1) % AXES.length;
    used.add(a);
    out.push([a, 1 + Math.floor(rnd() * 2)]);
  }
  return out;
}

/** Glyph ikon skill, deterministik dari nama (grid 5 kolom, tanpa teks panjang). */
const SKILL_GLYPHS = [
  Brain,
  Code,
  Rocket,
  MagnifyingGlass,
  Target,
  Lightning,
  BookOpen,
  Wrench,
  ChartLine,
  Compass,
  Fire,
  PuzzlePiece,
  Sparkle,
];
function skillGlyph(name: string) {
  return SKILL_GLYPHS[hashStr("glyph:" + name) % SKILL_GLYPHS.length]!;
}

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
// Bindings (dipakai panel skill, attach/detach + accept draft).
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
    category: string;
    slug: string | null;
  }[];
  personas: BindingPersona[];
}

/** Kategori skill (D104) — kosakata domain persona + qa; urutan tampil modal. */
const CATEGORY_ORDER = [
  "design",
  "planning",
  "software-development",
  "research",
  "data",
  "documents",
  "orchestration",
  "qa",
  "general",
];
const CATEGORY_LABEL: Record<string, string> = {
  design: "Design",
  planning: "Planning",
  "software-development": "Engineering",
  research: "Research",
  data: "Data",
  documents: "Docs",
  orchestration: "Orchestration",
  qa: "QA",
  general: "General",
};

function useBindings() {
  const [data, setData] = useState<BindingsPayload | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/api/skills/bindings"));
      if (r.ok) setData(await r.json());
    } catch {
      /* retry berikutnya */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const toggle = useCallback(
    async (personaId: string, skill: string, action: "attach" | "detach") => {
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
        const res = await authFetch(apiUrl("/api/skills/bindings"), {
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
  const accept = useCallback(
    async (personaId: string, slug: string, name: string) => {
      try {
        const res = await authFetch(apiUrl("/api/skills"), {
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
        toastOk(`Skill “${name}” accepted & equipped.`);
      } catch (e) {
        toastErr(e instanceof Error ? e.message : "failed to accept the draft");
      }
    },
    [load, toggle],
  );
  return { data, toggle, accept };
}

// ---------------------------------------------------------------------------
// Radar heksagonal, dasar vs. setelah bonus skill (real-time).
// ---------------------------------------------------------------------------
function RadarChart({
  base,
  bonus,
  accent,
}: {
  base: number[];
  bonus: number[];
  accent: string;
}) {
  const CX = 130;
  const CY = 108;
  const R = 72;
  const pt = (i: number, val: number): [number, number] => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    const r = (R * Math.min(10, Math.max(0, val))) / 10;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };
  const poly = (vals: number[]) =>
    vals.map((v, i) => pt(i, v).join(",")).join(" ");
  const shown = base.map((b, i) => Math.min(10, b + (bonus[i] ?? 0)));
  const labelAt = (i: number): [number, number] => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return [CX + R * 1.24 * Math.cos(a), CY + R * 1.24 * Math.sin(a)];
  };
  return (
    <svg
      viewBox="0 0 260 216"
      width="100%"
      role="img"
      aria-label="Stat radar"
      focusable="false"
    >
      {/* grid heksagonal: cincin + jari-jari, kontras jelas sebagai latar radar */}
      {[2.5, 5, 7.5, 10].map((v) => (
        <polygon
          key={v}
          points={poly(AXES.map(() => v))}
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth={1.1}
          opacity={0.9}
        />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, 10);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="var(--color-line-strong)"
            strokeWidth={1}
            opacity={0.85}
          />
        );
      })}
      {/* bonus (di belakang): putus-putus tipis */}
      <polygon
        points={poly(shown)}
        fill={accent}
        fillOpacity={0.1}
        stroke={accent}
        strokeWidth={1.4}
        strokeDasharray="4 3"
        opacity={0.9}
      />
      {/* dasar: solid aksen */}
      <polygon
        points={poly(base)}
        fill={accent}
        fillOpacity={0.38}
        stroke={accent}
        strokeWidth={2}
      />
      {/* label sumbu + nilai (+n bila ada bonus) */}
      {AXES.map((ax, i) => {
        const [x, y] = labelAt(i);
        return (
          <text
            key={ax}
            x={x}
            y={y}
            textAnchor="middle"
            fontSize={9.5}
            fill="var(--color-muted)"
          >
            <tspan x={x} dy="-4">
              {ax}
            </tspan>
            <tspan
              x={x}
              dy="12"
              fontSize={11}
              fontWeight={700}
              fill="var(--color-primary)"
            >
              {shown[i] ?? 0}
              {(bonus[i] ?? 0) > 0 && (
                <tspan fill={accent} fontSize={10}>
                  {" "}
                  +{bonus[i]}
                </tspan>
              )}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Modal library skill (D104): seluruh skill dikelompokkan per kategori,
// skill terpasang ditandai & muncul di seksi awal "Equipped". Klik row =
// toggle attach/detach (draft otomatis accept dulu, jalur sama dgn card).
// ---------------------------------------------------------------------------
type LibSkill = BindingsPayload["skills"][number];

function groupByCategory(skills: LibSkill[]): {
  groups: { key: string; label: string; skills: LibSkill[] }[];
  drafts: LibSkill[];
} {
  const byCat = new Map<string, LibSkill[]>();
  const drafts: LibSkill[] = [];
  for (const s of skills) {
    if (s.slug !== null) drafts.push(s);
    else byCat.set(s.category, [...(byCat.get(s.category) ?? []), s]);
  }
  const order = CATEGORY_ORDER.filter((k) => byCat.has(k));
  for (const k of [...byCat.keys()].sort())
    if (!CATEGORY_ORDER.includes(k) && k !== "general") order.push(k);
  if (byCat.has("general")) order.push("general");
  return {
    groups: order.map((k) => ({
      key: k,
      label: CATEGORY_LABEL[k] ?? k,
      skills: byCat.get(k) ?? [],
    })),
    drafts,
  };
}

function SkillLibraryModal({
  personaName,
  accent,
  skills,
  effective,
  onToggle,
  onClose,
}: {
  personaName: string;
  accent: string;
  skills: LibSkill[];
  effective: string[];
  onToggle: (name: string) => void;
  onClose: () => void;
}) {
  const { groups, drafts } = groupByCategory(skills);

  /** Satu row skill: glyph + nama + deskripsi + status terpasang. */
  const Row = ({ s }: { s: LibSkill }) => {
    const on = effective.includes(s.name);
    const Glyph = skillGlyph(s.name);
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${s.name}, ${s.description}`}
        onClick={() => onToggle(s.name)}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[12px] border px-2.5 py-2 text-left transition-colors duration-200 ${
          on
            ? "border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_10%,transparent)]"
            : "border-line hover:border-line-strong hover:bg-hover"
        }`}
      >
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-[9px] border ${on ? "border-transparent text-[var(--c)]" : "border-line text-muted"}`}
          style={on ? { backgroundColor: `${accent}1a` } : undefined}
        >
          <Glyph size={14} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[12.5px] font-semibold text-primary capitalize">
            {s.name.replaceAll("-", " ")}
          </b>
          <span className="block truncate text-caption text-muted">
            {s.description}
          </span>
        </span>
        {on ? (
          <Check
            size={13}
            weight="bold"
            aria-hidden
            className="shrink-0 text-[var(--c)]"
          />
        ) : (
          <Plus size={13} aria-hidden className="shrink-0 text-dim" />
        )}
      </button>
    );
  };

  return (
    <Modal open onClose={onClose} wide title={`${personaName}'s Skills`}>
      <div
        className="flex flex-col gap-5"
        style={{ "--c": accent } as React.CSSProperties}
      >
        {/* Semua skill siap pakai, dikelompokkan per kategori. */}
        {groups.map((g) => (
          <section
            key={g.key}
            aria-label={g.label}
            className="flex flex-col gap-2"
          >
            <small className="flex items-baseline gap-2 text-caption font-semibold uppercase tracking-wide text-dim">
              {g.label}
              <span className="text-dim/70 tabular-nums">
                ({g.skills.length})
              </span>
            </small>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {g.skills.map((s) => (
                <Row key={s.name} s={s} />
              ))}
            </div>
          </section>
        ))}

        {/* Draft hasil latihan: pakai setelah di-accept (klik = accept+attach). */}
        {drafts.length > 0 && (
          <section aria-label="Draft skills" className="flex flex-col gap-2">
            <small className="flex items-baseline gap-2 text-caption font-semibold uppercase tracking-wide text-dim">
              Drafts
              <span className="text-dim/70 tabular-nums">
                ({drafts.length})
              </span>
            </small>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {drafts.map((s) => (
                <Row key={s.name} s={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Stage utama.
// ---------------------------------------------------------------------------
export function CharacterStage({
  personas,
  onPersonaRenamed,
  onPersonasChanged,
}: {
  personas: PersonaInfo[];
  onPersonaRenamed?: () => void;
  /** F2 forge: persona custom dibuat/ubah/hapus -> refetch daftar. */
  onPersonasChanged?: () => void;
}) {
  const [selId, setSelId] = useState(personas[0]?.id ?? "");
  const [emote, setEmote] = useState<PersonaState>("idle");
  const [busyShape, setBusyShape] = useState<OrinShapeKey | null>(null);
  const [greeted, setGreeted] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  // F1 rename: modal edit nama tampilan persona (id internal tetap).
  const [renameOpen, setRenameOpen] = useState(false);
  const [rnName, setRnName] = useState("");
  const [rnDesc, setRnDesc] = useState("");
  const [rnDefault, setRnDefault] = useState("");
  const [rnBusy, setRnBusy] = useState(false);
  // D104: modal library skill (buka dari tile + di akhir grid card skill).
  const [libOpen, setLibOpen] = useState(false);
  // F2 Persona Forge: modal create/edit custom + konfirmasi delete.
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeEditId, setForgeEditId] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  // Tooltip skill melayang (layer stage, tak terpotong scroll card):
  // posisi = pusat-atas tile, relatif stage.
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(
    null,
  );
  const growthMap = useGrowthMap();
  const overrides = useShapeOverridesMap();
  const { data: bindings, toggle, accept } = useBindings();

  const persona = personas.find((p) => p.id === selId) ?? personas[0];
  const { key: activeShape } = usePersonaShape(persona?.id);
  const bp = bindings?.personas.find((p) => p.id === persona?.id);
  const g: PersonaGrowth | undefined = growthMap.get(persona?.id ?? "");
  const idx = persona ? personas.findIndex((p) => p.id === persona.id) : -1;
  const accent = SHAPES[activeShape].color;

  const boxRef = useRef<HTMLDivElement | null>(null);

  /** Ganti karakter (carousel loop), reset emote & sapaan. */
  const go = useCallback(
    (dir: -1 | 1) => {
      setSelId((cur) => {
        const i = personas.findIndex((p) => p.id === cur);
        if (i < 0 || personas.length < 2) return cur;
        return personas[(i + dir + personas.length) % personas.length]!.id;
      });
      setEmote("idle");
      setGreeted(false);
    },
    [personas],
  );

  // Keyboard ala game: ←/→ ganti karakter (diabaikan saat mengetik).
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

  // Galeri: kartu terpilih selalu terlihat (auto-center).
  useEffect(() => {
    document.querySelector(`[data-gal-id="${persona?.id}"]`)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [persona?.id]);

  /** Anchor tooltip: pusat-atas elemen, relatif stage. */
  const tipAt = useCallback((name: string, el: HTMLElement) => {
    const b = boxRef.current?.getBoundingClientRect();
    if (!b) return;
    const r = el.getBoundingClientRect();
    setTip({ name, x: r.left + r.width / 2 - b.left, y: r.top - b.top });
  }, []);

  /** F1: buka modal rename; ambil nama default dari override store
   *  (bila sudah dioverride, persona.name = nama baru, default ada di entry). */
  /** F2: hapus persona custom (built-in tak punya tombol ini). */
  async function deleteCustom() {
    if (!persona?.custom) return;
    setDelBusy(true);
    try {
      const res = await authFetch(apiUrl(`/api/personas/custom/${persona.id}`), { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "request failed");
      toastOk(`${persona.name} deleted.`);
      setSelId(personas.find((p) => p.id !== persona.id)?.id ?? "");
      onPersonasChanged?.();
      setDelOpen(false);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to delete the persona");
    } finally {
      setDelBusy(false);
    }
  }

  /** F2 share: unduh file share persona custom (dipasang di install lain). */
  async function exportCustom() {
    if (!persona?.custom) return;
    try {
      const r = await authFetch(apiUrl(`/api/personas/custom/${persona.id}/export`));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "request failed");
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.persona.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toastOk(`Share file for ${data.name} downloaded.`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to export the persona");
    }
  }

  async function openRename() {
    if (!persona) return;
    setRnName(persona.name);
    setRnDesc("");
    setRnDefault("");
    setRenameOpen(true);
    try {
      const r = await authFetch(apiUrl("/api/personas/renames"));
      if (r.ok) {
        const { renames } = (await r.json()) as {
          renames: { personaId: string; name: string; description: string | null; defaultName: string }[];
        };
        const e = renames.find((x) => x.personaId === persona.id);
        setRnDefault(e?.defaultName ?? persona.name);
        setRnDesc(e?.description ?? "");
      } else {
        setRnDefault(persona.name);
      }
    } catch {
      setRnDefault(persona.name);
    }
  }

  async function saveRename() {
    if (!persona || rnBusy) return;
    const name = rnName.trim();
    if (!name) {
      toastErr("Name cannot be empty.");
      return;
    }
    setRnBusy(true);
    try {
      const r = await authFetch(apiUrl("/api/personas/renames"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personaId: persona.id,
          name,
          description: rnDesc.trim() || null,
        }),
      });
      if (!r.ok)
        throw new Error(
          (await r.json().catch(() => ({})))?.error ?? "failed to save the name",
        );
      setRenameOpen(false);
      onPersonaRenamed?.();
      toastOk(`Now known as “${name}” everywhere.`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to save the name");
    } finally {
      setRnBusy(false);
    }
  }

  async function resetRename() {
    if (!persona || rnBusy) return;
    setRnBusy(true);
    try {
      const r = await authFetch(
        apiUrl(`/api/personas/renames/${persona.id}`),
        { method: "DELETE" },
      );
      if (!r.ok)
        throw new Error(
          (await r.json().catch(() => ({})))?.error ?? "failed to reset the name",
        );
      setRenameOpen(false);
      onPersonaRenamed?.();
      toastOk(`Back to “${rnDefault || persona.name}”.`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to reset the name");
    } finally {
      setRnBusy(false);
    }
  }

  async function pickShape(k: OrinShapeKey) {
    if (!persona || busyShape) return;
    setBusyShape(k);
    try {
      const r = await authFetch(apiUrl("/api/personas/shapes"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId: persona.id, shape: k }),
      });
      if (!r.ok)
        throw new Error(
          (await r.json().catch(() => ({})))?.error ??
            "failed to save the shape",
        );
      const { shapes } = (await r.json()) as {
        shapes: { personaId: string; shape: OrinShapeKey }[];
      };
      setShapeOverrides(
        Object.fromEntries(shapes.map((s) => [s.personaId, s.shape])),
      );
      toastOk(`${persona.name} now takes the “${SHAPES[k].name}” form.`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to save the shape");
    } finally {
      setBusyShape(null);
    }
  }

  /** Pasang/lepas skill, maks 3 slot; penuh → tooltip pesan (bukan error). */
  /** Pasang/lepas skill, klik tile: terpasang → lepas, belum → pasang.
   *  Tanpa batasan jumlah (permintaan user): semua skill boleh aktif serentak. */
  function toggleSkill(name: string) {
    if (!bp) return;
    const on = bp.effective.includes(name);
    const s = bindings?.skills.find((x) => x.name === name);
    if (!on && s?.status === "draft" && s.slug)
      void accept(bp.id, s.slug, name);
    else void toggle(bp.id, name, on ? "detach" : "attach");
  }

  if (!persona)
    return (
      <div className="grid h-full place-items-center text-muted">
        <p>No personas yet, loaded from packages/personas.</p>
      </div>
    );

  const defaultShape = PERSONA_SHAPE[persona.id] ?? "orb";
  const xpPct = g
    ? g.nextLevelAt === null
      ? 100
      : Math.min(100, Math.round((g.turns / g.nextLevelAt) * 100))
    : 0;
  const tags = TYPE_TAGS[g?.domain ?? ""] ?? ["Specialist", "Agent"];
  const base = useMemo(() => baseStats(persona.id), [persona.id]);
  const bonus = useMemo(() => {
    const b = AXES.map(() => 0);
    for (const n of bp?.effective ?? [])
      for (const [ax, v] of skillBonus(n)) b[ax] = (b[ax] ?? 0) + v;
    return b;
  }, [bp?.effective]);
  const detail = tip
    ? (bindings?.skills.find((s) => s.name === tip.name) ?? null)
    : null;
  const detailBonus = detail ? skillBonus(detail.name) : [];

  const galKey = (id: string): OrinShapeKey =>
    (overrides[id] as OrinShapeKey | undefined) ?? PERSONA_SHAPE[id] ?? "orb";

  const cardCls =
    "z-[2] flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface/75 p-4 shadow-[0_18px_50px_-24px_rgb(0_0_0/.55)] backdrop-blur-[14px] max-[999px]:h-auto min-[1000px]:absolute min-[1000px]:top-[40%] min-[1000px]:h-[min(440px,calc(100%-260px))] min-[1000px]:w-[272px] xl:w-[288px] min-[1000px]:-translate-y-1/2";

  return (
    <div
      ref={boxRef}
      className="relative isolate h-[88dvh] min-h-[540px] w-full overflow-hidden max-[999px]:flex max-[999px]:flex-col max-[999px]:gap-4 max-[999px]:h-auto max-[999px]:min-h-0 max-[999px]:overflow-visible max-[999px]:pb-4"
      style={{ "--c": accent } as React.CSSProperties}
    >
      {/* latar: OVAL BERLAPIS, konsep sama dengan orbit workspace
          (PersonaPicker): cincin elips konsentris di belakang maskot. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 max-[999px]:hidden"
      >
        <div className="absolute top-[44%] left-1/2 h-[460px] w-[min(520px,54vw)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-line/70" />
        <div className="absolute top-[44%] left-1/2 h-[320px] w-[min(380px,38vw)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/80" />
        <div className="absolute top-[44%] left-1/2 h-[220px] w-[min(260px,28vw)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-line/90" />
      </div>

      {/* ===== HERO, maskot di tengah panggung ===== */}
      <div className="absolute left-1/2 top-[44%] z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[18px] max-[999px]:static max-[999px]:mt-2 max-[999px]:translate-x-0 max-[999px]:translate-y-0">
        <div key={persona.id} className="pop-yui flex flex-col items-center">
          <button
            type="button"
            aria-label={`Greet ${persona.name}`}
            onClick={() => setGreeted(true)}
            className="group size-[168px] cursor-pointer rounded-full transition-transform duration-300 ease-[var(--ease-out-yui)] hover:-translate-y-1 hover:scale-[1.03] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[var(--c)]"
          >
            <OrinPortrait state={emote} personaId={persona.id} size={168} />
          </button>
        </div>
        <div
          className="flex flex-wrap justify-center gap-1.5 max-w-[24dvw]"
          role="group"
          aria-label="Emotes"
        >
          {EMOTES.map((e) => (
            <button
              key={e.state}
              type="button"
              aria-pressed={emote === e.state}
              onClick={() => setEmote(e.state)}
              className={`cursor-pointer rounded-[9px] border px-3 py-1 text-[11px] font-medium transition-colors duration-200 ${
                emote === e.state
                  ? "border-[var(--c)] text-[var(--c)]"
                  : "border-line text-muted hover:border-line-strong hover:text-primary"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
        <small className="text-dim" aria-live="polite">
          {greeted
            ? `“Hi, I’m ${persona.name}!”`
            : "Click the mascot to say hi"}
        </small>
      </div>

      {/* ===== Chevron prev/next (dalam rasi, dekat maskot) ===== */}
      <button
        type="button"
        aria-label="Previous persona"
        onClick={() => go(-1)}
        disabled={personas.length < 2}
        className="absolute top-[44%] z-[3] hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface/80 text-muted backdrop-blur-md transition-all duration-200 hover:border-[var(--c)] hover:text-primary active:scale-90 disabled:pointer-events-none disabled:opacity-25 min-[1000px]:flex min-[1000px]:left-[calc(50%-146px)] xl:left-[calc(50%-160px)]"
      >
        <CaretLeft size={18} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Next persona"
        onClick={() => go(1)}
        disabled={personas.length < 2}
        className="absolute top-[44%] z-[3] hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface/80 text-muted backdrop-blur-md transition-all duration-200 hover:border-[var(--c)] hover:text-primary active:scale-90 disabled:pointer-events-none disabled:opacity-25 min-[1000px]:flex min-[1000px]:left-[calc(50%+104px)] xl:left-[calc(50%+118px)]"
      >
        <CaretRight size={18} aria-hidden />
      </button>

      {/* ===== CARD KIRI, identitas ===== */}
      <aside
        className={
          cardCls +
          " relative min-[1000px]:left-[max(24px,calc(25%-580px))] min-[1000px]:overflow-hidden"
        }
      >
        {/* setup model persona, pojok kiri atas card */}
        <button
          type="button"
          data-model-gear=""
          aria-label={`Model settings for ${persona.name}`}
          title="Model settings"
          onClick={() => setModelOpen(true)}
          className="absolute top-3 left-3 z-[3] grid size-7 cursor-pointer place-items-center rounded-[9px] border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:text-primary"
        >
          <Gear size={14} weight="duotone" aria-hidden />
        </button>
        {/* F1: rename display name (mirror gear, pojok kanan). */}
        <button
          type="button"
          aria-label={`Rename ${persona.name}`}
          title="Rename"
          onClick={() => void openRename()}
          className="absolute top-3 right-3 z-[3] grid size-7 cursor-pointer place-items-center rounded-[9px] border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:text-primary"
        >
          <PencilSimple size={14} aria-hidden />
        </button>
        {/* F2 Persona Forge: custom -> reforge + delete; built-in -> forge baru. */}
        <button
          type="button"
          aria-label={persona.custom ? `Reforge ${persona.name}` : "Forge a persona"}
          title={persona.custom ? "Reforge (edit prompt layer)" : "Forge a persona"}
          onClick={() => {
            setForgeEditId(persona.custom ? persona.id : null);
            setForgeOpen(true);
          }}
          className="absolute top-3 right-[3.25rem] z-[3] grid size-7 cursor-pointer place-items-center rounded-[9px] border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:text-primary"
        >
          <Hammer size={14} aria-hidden />
        </button>
        {persona.custom && (
          <button
            type="button"
            aria-label={`Delete ${persona.name}`}
            title="Delete custom persona"
            onClick={() => setDelOpen(true)}
            className="absolute top-3 right-[6rem] z-[3] grid size-7 cursor-pointer place-items-center rounded-[9px] border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:text-primary"
          >
            <Trash size={14} aria-hidden />
          </button>
        )}
        {persona.custom && (
          <button
            type="button"
            aria-label={`Share ${persona.name}`}
            title="Download share file (import on another install)"
            onClick={() => void exportCustom()}
            className="absolute top-3 right-[8.75rem] z-[3] grid size-7 cursor-pointer place-items-center rounded-[9px] border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:text-primary"
          >
            <DownloadSimple size={14} aria-hidden />
          </button>
        )}
        <div className="flex flex-wrap gap-1.5 items-center justify-center mb-3">
          <span
            className="rounded-pill border px-2 py-0.5 text-[11px] font-semibold"
            style={{
              borderColor: accent,
              color: accent,
              backgroundColor: `${accent}1a`,
            }}
          >
            {tags[0]}
          </span>
          <span className="rounded-pill border border-line px-2 py-0.5 text-[11px] font-semibold text-muted">
            {tags[1]}
          </span>
        </div>
        <h2 className="text-lg font-bold tracking-tight text-primary text-center mb-2">
          {persona.name}
        </h2>
        <p className="text-[12px] leading-4 text-muted text-center">
          {persona.description || persona.expertise}
        </p>
        <div className="grid grid-cols-3 gap-1.5 my-2">
          {[
            { label: "Sessions", v: g?.sessions ?? 0 },
            { label: "Turns", v: g?.turns ?? 0 },
            { label: "Tasks", v: g?.tasksDone ?? 0 },
          ].map((r) => (
            <div
              key={r.label}
              className="flex flex-col items-center gap-0.5 rounded-[12px] py-2"
              style={{ backgroundColor: `${accent}1a` }}
            >
              <b className="text-sm font-semibold tabular-nums text-primary">
                {r.v}
              </b>
              <small className="text-dim">{r.label}</small>
            </div>
          ))}
        </div>
        {/* Bentuk: satu-satunya bagian card yang scroll (identitas tetap terlihat). */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <b className="text-[12px] font-semibold text-secondary mb-2">Shape</b>
          <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-1.5 overflow-y-auto pr-0.5">
            {SHAPE_ORDER.map((k) => {
              const s = SHAPES[k];
              const on = k === activeShape;
              return (
                <button
                  key={k}
                  type="button"
                  data-shape-tile={k}
                  aria-pressed={on}
                  aria-label={`Set ${persona.name}'s form: ${s.name}`}
                  title={`Set ${persona.name}'s form: ${s.name}${defaultShape === k ? " (default)" : ""}`}
                  disabled={busyShape !== null}
                  onClick={() => void pickShape(k)}
                  className={`relative grid aspect-square cursor-pointer place-items-center rounded-[12px] border transition-colors duration-200 ${
                    on
                      ? "border-[var(--c)]"
                      : "border-line hover:border-line-strong"
                  }`}
                  style={on ? { backgroundColor: `${accent}1a` } : undefined}
                >
                  <svg
                    width={26}
                    height={26}
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
                    <MiniFace shape={s} />
                  </svg>
                  {on && (
                    <span className="absolute top-1 right-1 grid size-3.5 place-items-center rounded-pill bg-[var(--c)] text-canvas">
                      <Check size={9} weight="bold" aria-hidden />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* ===== CARD KANAN, stats & skill: radar TETAP (tidak ikut scroll),
          hanya list skill yang menggulir bila panjang ===== */}
      <aside
        className={
          cardCls +
          " min-[1000px]:right-[max(24px,calc(25%-580px))] min-[1000px]:overflow-hidden"
        }
      >
        <div className="shrink-0">
          <RadarChart base={base} bonus={bonus} accent={accent} />
        </div>
        <div className="mt-1 flex min-h-0 flex-1 flex-col gap-3">
          <b className="shrink-0 text-[13px] font-semibold text-secondary">
            Skills ({bp?.effective.length ?? 0})
          </b>
          {/* D104: card hanya menampilkan skill TERPASANG utk persona ini;
              tombol tambah di akhir grid membuka library modal per kategori. */}
          <div className="grid min-h-0 flex-1 grid-cols-5 content-start gap-2 overflow-y-auto pr-0.5">
            {bindings?.skills
              .filter((s) => bp?.effective.includes(s.name))
              .map((s) => {
                const Glyph = skillGlyph(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    data-skill-tile={s.name}
                    aria-pressed
                    aria-label={`${s.name}, ${s.description}`}
                    onFocus={(e) => tipAt(s.name, e.currentTarget)}
                    onMouseEnter={(e) => tipAt(s.name, e.currentTarget)}
                    onMouseLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                    onClick={() => toggleSkill(s.name)}
                    className="grid aspect-square cursor-pointer place-items-center rounded-[12px] border border-[var(--c)] text-[var(--c)] transition-all duration-200 hover:-translate-y-0.5"
                    style={{ backgroundColor: `${accent}1a` }}
                  >
                    <Glyph size={15} aria-hidden />
                  </button>
                );
              })}
            <button
              type="button"
              data-skill-add=""
              aria-label={`Add a skill to ${persona.name}`}
              title="Browse the skill library"
              onClick={() => setLibOpen(true)}
              className="grid aspect-square cursor-pointer place-items-center rounded-[12px] border border-dashed border-line-strong text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--c)] hover:text-[var(--c)]"
            >
              <Plus size={15} weight="bold" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== Tooltip skill, popup di layer stage (tak terpotong scroll card) ===== */}
      {detail && tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-[6] w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-[12px] leading-5 shadow-[0_14px_36px_-14px_rgb(0_0_0/.7)] flex flex-col gap-2"
          style={{ left: tip.x, top: tip.y - 10 }}
        >
          <b className="text-primary capitalize">
            {detail.name.replaceAll("-", " ")}
          </b>
          <span style={{ color: accent }} className="text-xs italic">
            {detailBonus.map(([ax, v], i) => (
              <span key={i}>
                {i > 0 ? " " : ""}
                {"+"}
                {v} {AXES[ax] ?? ""}
              </span>
            ))}
          </span>
          <span className="text-muted text-justify">{detail.description}</span>
          <span className="absolute bottom-[-4px] left-1/2 size-2 -translate-x-1/2 rotate-45 border-r border-b border-line bg-surface" />
        </div>
      )}

      {/* ===== DOCK, galeri karakter ===== */}
      <div className="absolute inset-x-0 bottom-5 z-[4] flex flex-col items-center gap-2 max-[999px]:static max-[999px]:mt-4">
        <div
          data-dock=""
          role="listbox"
          aria-label="Character gallery"
          className="flex max-w-[min(760px,calc(100vw-32px))] snap-x snap-mandatory gap-2.5 overflow-x-auto rounded-[22px] border border-line bg-surface/70 px-5 pt-5 pb-3 shadow-[0_16px_40px_-20px_rgb(0_0_0/.6)] backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {personas.map((p) => {
            const on = p.id === persona.id;
            const s = SHAPES[galKey(p.id)];
            return (
              <button
                key={p.id}
                data-gal-id={p.id}
                role="option"
                aria-selected={on}
                aria-label={p.name}
                onClick={() => {
                  setSelId(p.id);
                  setEmote("idle");
                  setGreeted(false);
                }}
                className={`flex w-[92px] shrink-0 cursor-pointer snap-center flex-col items-center gap-[7px] rounded-2xl border px-1.5 py-2 transition-all duration-200 ${
                  on
                    ? "-translate-y-1 scale-[1.06] border-[var(--c)] bg-hover text-primary"
                    : "border-transparent text-muted hover:border-line-strong hover:text-primary"
                }`}
              >
                <svg
                  width={44}
                  height={44}
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
                  <MiniFace shape={s} />
                </svg>
                <b className="w-full truncate text-center text-[12px] font-semibold">
                  {p.name}
                </b>
              </button>
            );
          })}
        </div>
      </div>

      {/* setup model per persona, dipindah dari SettingsModal */}
      {modelOpen && persona && (
        <PersonaModelModal
          personaId={persona.id}
          personaName={persona.name}
          onClose={() => setModelOpen(false)}
        />
      )}

      {/* F1: rename persona — nama tampilan saja, id internal tetap. */}
      {renameOpen && persona && (
        <Modal
          open
          onClose={() => setRenameOpen(false)}
          title={`Rename ${persona.name}`}
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-caption text-muted">
              Display name
              <input
                autoFocus
                value={rnName}
                maxLength={40}
                onChange={(e) => setRnName(e.target.value)}
                placeholder={rnDefault || persona.name}
                className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-line-strong"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-caption text-muted">
              Description (optional)
              <input
                value={rnDesc}
                maxLength={120}
                onChange={(e) => setRnDesc(e.target.value)}
                placeholder={persona.description}
                className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-line-strong"
              />
            </label>
            <p className="text-caption text-dim">
              Default: {rnDefault || persona.name}. The persona id stays the
              same; chat history, roster, and delegation are untouched.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={rnBusy || !rnDefault || rnDefault === persona.name}
                onClick={() => void resetRename()}
                title="Remove the override and restore the default name"
              >
                Reset
              </Button>
              <Button
                size="sm"
                disabled={rnBusy || !rnName.trim() || rnName.trim() === persona.name}
                onClick={() => void saveRename()}
              >
                {rnBusy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* F2 Persona Forge: wizard create/edit persona custom. */}
      {forgeOpen && (
        <ForgePersonaModal
          editId={forgeEditId ?? undefined}
          onClose={() => {
            setForgeOpen(false);
            setForgeEditId(null);
          }}
          onDone={() => onPersonasChanged?.()}
        />
      )}

      {/* F2: konfirmasi hapus persona custom. */}
      {delOpen && persona && (
        <ConfirmDialog
          open
          title={`Delete ${persona.name}?`}
          message={
            <>
              This permanently removes the custom persona and its prompt layer.
              Existing chat history stays readable; roster entries using it
              should be reassigned. Built-in personas are not affected.
            </>
          }
          busy={delBusy}
          onConfirm={() => void deleteCustom()}
          onClose={() => setDelOpen(false)}
        />
      )}

      {/* D104: library skill per kategori — equipped di awal, toggle langsung. */}
      {libOpen && persona && bindings && (
        <SkillLibraryModal
          personaName={persona.name}
          accent={accent}
          skills={bindings.skills}
          effective={bp?.effective ?? []}
          onToggle={toggleSkill}
          onClose={() => setLibOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Growth map, poll ringan (levels & stats nyata dari kerja persona).
// ---------------------------------------------------------------------------
function useGrowthMap(): Map<string, PersonaGrowth> {
  const [map, setMap] = useState<Map<string, PersonaGrowth>>(new Map());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await authFetch(apiUrl("/api/personas/growth"));
        if (!r.ok || !alive) return;
        const d = (await r.json()) as { growth: PersonaGrowth[] };
        if (alive) setMap(new Map(d.growth.map((x) => [x.id, x])));
      } catch {
        /* poll berikutnya */
      }
    };
    void load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return map;
}
