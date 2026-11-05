"use client";
// 🌌 CharacterStage — character-select screen satu layar (spec user 2026-11):
// tiga lapis — (1) latar konstelasi SVG, (2) maskot hero di tengah + dua card
// kaca melayang (identitas kiri · stats+skill kanan), (3) galeri dock bawah.
// Aksen tunggal --c (warna wujud aktif) dipakai rasi, radar, ring skill, pil,
// progress bar & galeri — otomatis ikut saat karakter/wujud diganti.
// DATA: persona/growth/skill-bindings NYATA dari API; radar & bonus skill =
// lapisan kosmetik deterministik (hash id/nama), BUKAN hasil evaluasi.
// DS-1: utility Tailwind + token semantik; tanpa file CSS baru (keyframes di globals).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonaGrowth, PersonaInfo, PersonaState } from "@yui/contracts";
import {
  BookOpen,
  Brain,
  CaretLeft,
  CaretRight,
  ChartLine,
  Check,
  Code,
  Compass,
  Fire,
  Lightning,
  MagnifyingGlass,
  PuzzlePiece,
  Rocket,
  Sparkle,
  Target,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { OrinPortrait } from "./OrinPortrait";
import {
  PERSONA_SHAPE,
  SHAPE_ORDER,
  SHAPES,
  setShapeOverrides,
  usePersonaShape,
  useShapeOverridesMap,
  type OrinShapeKey,
} from "./orinShapes";
import { toastErr, toastOk } from "./ui/toast";
import { apiUrl } from "@/lib/api";

// ---------------------------------------------------------------------------
// Util deterministik — lapisan kosmetik game (bukan data evaluasi).
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

/** Radar 6 sumbu — urutan dari atas, searah jarum jam. */
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

/** Stat dasar persona: deterministik dari id (3..9) — feel game, bukan skor nyata. */
function baseStats(id: string): number[] {
  const rnd = mulberry32(hashStr(id));
  return AXES.map(() => 3 + Math.floor(rnd() * 7));
}

/** Bonus skill: 1–2 sumbu, +1/+2 — deterministik dari nama skill. */
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

/** Glyph ikon skill — deterministik dari nama (grid 5 kolom, tanpa teks panjang). */
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
// Bindings (dipakai panel skill — attach/detach + accept draft).
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
// Latar konstelasi — bintang ber-seed + garis tetangga + rasi utama (≥1100px).
// ---------------------------------------------------------------------------
interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
  tw: boolean;
}

function Constellation({
  w,
  h,
  accent,
}: {
  w: number;
  h: number;
  accent: string;
}) {
  // Bintang: jumlah ∝ luas, posisi ber-seed tetap (konsisten antar render/resize).
  const stars = useMemo<Star[]>(() => {
    if (w < 2 || h < 2) return [];
    const rnd = mulberry32(42);
    const n = Math.max(14, Math.round((w * h) / 15000));
    return Array.from({ length: n }, () => ({
      x: rnd() * w,
      y: rnd() * h,
      r: 0.8 + rnd() * 1.4,
      o: 0.18 + rnd() * 0.22,
      tw: rnd() < 0.18,
    }));
  }, [w, h]);

  // Garis: tiap bintang → maks 2 tetangga terdekat dalam 130px.
  const lines = useMemo(() => {
    const out: Array<[number, number, number, number]> = [];
    for (let i = 0; i < stars.length; i++) {
      const a = stars[i]!;
      const near = stars
        .map((s, j) => ({ j, d: Math.hypot(s.x - a.x, s.y - a.y) }))
        .filter((s) => s.j !== i && s.d < 130)
        .sort((x, y) => x.d - y.d)
        .slice(0, 2);
      for (const { j } of near) {
        const b = stars[j]!;
        out.push([a.x, a.y, b.x, b.y]);
      }
    }
    return out;
  }, [stars]);

  // Rasi utama mengelilingi maskot: elips 8 node + 8 sisi + 2 diagonal (≥1100px).
  const ring = useMemo(() => {
    if (w < 1100 || h < 2) return null;
    const cx = w / 2;
    const cy = h * 0.44;
    const rr = Math.min(w, h) * 0.3;
    const rx = rr * 1.14;
    const ry = rr * 0.95;
    const nodes = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      return {
        x: cx + rx * Math.cos(a),
        y: cy + ry * Math.sin(a),
        r: i % 2 ? 3 : 4,
      };
    });
    const edges: Array<[number, number]> = nodes.map((_, i) => [
      i,
      (i + 1) % 8,
    ]);
    edges.push([0, 4], [2, 6]); // dua diagonal
    return { nodes, edges };
  }, [w, h]);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0"
      width={w}
      height={h}
      aria-hidden
      focusable="false"
    >
      {lines.map(([x1, y1, x2, y2], i) => (
        <line
          key={"l" + i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--color-primary)"
          strokeWidth={1}
          opacity={0.1}
        />
      ))}
      {stars.map((s, i) => (
        <circle
          key={"s" + i}
          className={s.tw ? "twinkle-yui" : undefined}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="var(--color-primary)"
          opacity={s.tw ? undefined : s.o}
        />
      ))}
      {ring && (
        <g
          style={{ transition: "stroke .3s, fill .3s" }}
          stroke={accent}
          fill={accent}
        >
          {ring.edges.map(([a, b], i) => {
            const na = ring.nodes[a]!;
            const nb = ring.nodes[b]!;
            return (
              <line
                key={"re" + i}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                strokeWidth={1.2}
                opacity={0.5}
              />
            );
          })}
          {ring.nodes.map((n, i) => (
            <circle key={"rn" + i} cx={n.x} cy={n.y} r={n.r} opacity={0.85} />
          ))}
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Radar heksagonal — dasar vs. setelah bonus skill (real-time).
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
      {/* cincin + jari-jari samar */}
      {[2.5, 5, 7.5, 10].map((v) => (
        <polygon
          key={v}
          points={poly(AXES.map(() => v))}
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth={0.8}
          opacity={0.5}
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
            strokeWidth={0.8}
            opacity={0.5}
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
// Stage utama.
// ---------------------------------------------------------------------------
export function CharacterStage({ personas }: { personas: PersonaInfo[] }) {
  const [selId, setSelId] = useState(personas[0]?.id ?? "");
  const [emote, setEmote] = useState<PersonaState>("idle");
  const [busyShape, setBusyShape] = useState<OrinShapeKey | null>(null);
  const [greeted, setGreeted] = useState(false);
  // Tooltip skill melayang (layer stage — tak terpotong scroll card):
  // posisi = pusat-atas tile, relatif stage.
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);
  const [fullTip, setFullTip] = useState<{ x: number; y: number } | null>(null);
  const growthMap = useGrowthMap();
  const overrides = useShapeOverridesMap();
  const { data: bindings, toggle, accept } = useBindings();

  const persona = personas.find((p) => p.id === selId) ?? personas[0];
  const { key: activeShape } = usePersonaShape(persona?.id);
  const bp = bindings?.personas.find((p) => p.id === persona?.id);
  const g: PersonaGrowth | undefined = growthMap.get(persona?.id ?? "");
  const idx = persona ? personas.findIndex((p) => p.id === persona.id) : -1;
  const accent = SHAPES[activeShape].color;

  // ukuran stage — konstelasi digambar ulang saat resize
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Ganti karakter (carousel loop) — reset emote & sapaan. */
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

  // Flash "slot penuh" ±2 dtk (tooltip di posisi tile yang diklik).
  useEffect(() => {
    if (!fullTip) return;
    const t = setTimeout(() => setFullTip(null), 2000);
    return () => clearTimeout(t);
  }, [fullTip]);

  /** Anchor tooltip: pusat-atas elemen, relatif stage. */
  const tipAt = useCallback((name: string, el: HTMLElement) => {
    const b = boxRef.current?.getBoundingClientRect();
    if (!b) return;
    const r = el.getBoundingClientRect();
    setTip({ name, x: r.left + r.width / 2 - b.left, y: r.top - b.top });
  }, []);

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

  /** Pasang/lepas skill — maks 3 slot; penuh → tooltip pesan (bukan error). */
  function toggleSkill(name: string, el?: HTMLElement) {
    if (!bp) return;
    const on = bp.effective.includes(name);
    if (!on && bp.effective.length >= 3) {
      const b = boxRef.current?.getBoundingClientRect();
      const r = el?.getBoundingClientRect();
      if (b && r)
        setFullTip({ x: r.left + r.width / 2 - b.left, y: r.top - b.top });
      return;
    }
    const s = bindings?.skills.find((x) => x.name === name);
    if (!on && s?.status === "draft" && s.slug)
      void accept(bp.id, s.slug, name);
    else void toggle(bp.id, name, on ? "detach" : "attach");
  }

  if (!persona)
    return (
      <div className="grid h-full place-items-center text-muted">
        <p>No personas yet — loaded from packages/personas.</p>
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
  const detail = tip ? (bindings?.skills.find((s) => s.name === tip.name) ?? null) : null;
  const detailBonus = detail ? skillBonus(detail.name) : [];

  const galKey = (id: string): OrinShapeKey =>
    (overrides[id] as OrinShapeKey | undefined) ?? PERSONA_SHAPE[id] ?? "orb";

  const cardCls =
    "z-[2] flex flex-col gap-3 rounded-[18px] border border-line bg-surface/75 p-5 shadow-[0_18px_50px_-24px_rgb(0_0_0/.55)] backdrop-blur-[14px] max-[1099px]:h-auto min-[1100px]:absolute min-[1100px]:top-[40%] min-[1100px]:h-[min(520px,calc(100%-240px))] min-[1100px]:w-[320px] min-[1100px]:-translate-y-1/2";

  return (
    <div
      ref={boxRef}
      className="relative isolate h-[88dvh] min-h-[560px] w-full overflow-hidden max-[1099px]:flex max-[1099px]:flex-col max-[1099px]:gap-4 max-[1099px]:overflow-visible max-[1099px]:pb-2"
      style={{ "--c": accent } as React.CSSProperties}
    >
      <Constellation w={size.w} h={size.h} accent={accent} />

      {/* ===== HERO — maskot di tengah panggung ===== */}
      <div className="absolute left-1/2 top-[44%] z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[26px] max-[1099px]:static max-[1099px]:mt-2 max-[1099px]:translate-x-0 max-[1099px]:translate-y-0">
        <div key={persona.id} className="pop-yui flex flex-col items-center">
          <button
            type="button"
            aria-label={`Greet ${persona.name}`}
            onClick={() => setGreeted(true)}
            className="group size-[200px] cursor-pointer rounded-full transition-transform duration-300 ease-[var(--ease-out-yui)] hover:-translate-y-1 hover:scale-[1.03] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[var(--c)]"
          >
            <OrinPortrait state={emote} personaId={persona.id} size={200} />
          </button>
        </div>
        <div
          className="flex flex-wrap justify-center gap-1.5"
          role="group"
          aria-label="Emotes"
        >
          {EMOTES.map((e) => (
            <button
              key={e.state}
              type="button"
              aria-pressed={emote === e.state}
              onClick={() => setEmote(e.state)}
              className={`cursor-pointer rounded-[9px] border px-3.5 py-1.5 text-[12px] font-medium transition-colors duration-200 ${
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
        className="absolute top-[44%] z-[3] hidden size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface/80 text-muted backdrop-blur-md transition-all duration-200 hover:border-[var(--c)] hover:text-primary active:scale-90 disabled:pointer-events-none disabled:opacity-25 min-[1100px]:flex min-[1100px]:left-[calc(50%-190px)]"
      >
        <CaretLeft size={22} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Next persona"
        onClick={() => go(1)}
        disabled={personas.length < 2}
        className="absolute top-[44%] z-[3] hidden size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface/80 text-muted backdrop-blur-md transition-all duration-200 hover:border-[var(--c)] hover:text-primary active:scale-90 disabled:pointer-events-none disabled:opacity-25 min-[1100px]:flex min-[1100px]:left-[calc(50%+146px)]"
      >
        <CaretRight size={22} aria-hidden />
      </button>

      {/* ===== CARD KIRI — identitas ===== */}
      <aside
        className={cardCls + " min-[1100px]:left-[max(24px,calc(25%-580px))] min-[1100px]:overflow-hidden"}
      >
        <h2 className="text-2xl font-bold tracking-tight text-primary">
          {persona.name}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <span
            className="rounded-pill border px-2.5 py-0.5 text-[12px] font-semibold"
            style={{
              borderColor: accent,
              color: accent,
              backgroundColor: `${accent}1a`,
            }}
          >
            {tags[0]}
          </span>
          <span className="rounded-pill border border-line px-2.5 py-0.5 text-[12px] font-semibold text-muted">
            {tags[1]}
          </span>
        </div>
        <p className="text-[13px] leading-5 text-muted">
          {persona.description || persona.expertise}
        </p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <b className="text-secondary">{g?.level ?? "No Level Yet"}</b>
            <span>
              {g?.turns ?? 0}/{g?.nextLevelAt ?? "Max"} Turns
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-line-strong">
            <div
              className="h-full rounded-pill bg-[var(--c)] transition-all duration-500"
              style={{ width: `${xpPct}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "Sessions", v: g?.sessions ?? 0 },
            { label: "Turns", v: g?.turns ?? 0 },
            { label: "Tasks", v: g?.tasksDone ?? 0 },
          ].map((r) => (
            <div
              key={r.label}
              className="flex flex-col items-center gap-0.5 rounded-[12px] bg-inset py-2"
            >
              <b className="text-lg font-semibold tabular-nums text-primary">
                {r.v}
              </b>
              <small className="text-dim">{r.label}</small>
            </div>
          ))}
        </div>
        {/* Bentuk: satu-satunya bagian card yang scroll (identitas tetap terlihat). */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <b className="text-[13px] font-semibold text-secondary">Shape</b>
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
                    width={30}
                    height={30}
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

      {/* ===== CARD KANAN — stats & skill ===== */}
      <aside
        className={cardCls + " min-[1100px]:right-[max(24px,calc(25%-580px))] min-[1100px]:overflow-y-auto"}
      >
        <RadarChart base={base} bonus={bonus} accent={accent} />
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <b className="text-sm font-semibold text-secondary">
              Skills ({bp?.effective.length ?? 0})
            </b>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {bindings?.skills.map((s) => {
              const on = bp?.effective.includes(s.name) ?? false;
              const Glyph = skillGlyph(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  data-skill-tile={s.name}
                  aria-pressed={on}
                  aria-label={`${s.name} — ${s.description}`}
                  onFocus={(e) => tipAt(s.name, e.currentTarget)}
                  onMouseEnter={(e) => tipAt(s.name, e.currentTarget)}
                  onMouseLeave={() => setTip(null)}
                  onBlur={() => setTip(null)}
                  onClick={(e) => toggleSkill(s.name, e.currentTarget)}
                  className={`grid aspect-square cursor-pointer place-items-center rounded-[12px] border transition-all duration-200 hover:-translate-y-0.5 ${
                    on
                      ? "border-[var(--c)] text-[var(--c)]"
                      : "border-line text-muted hover:border-line-strong hover:text-primary"
                  }`}
                  style={on ? { backgroundColor: `${accent}1a` } : undefined}
                >
                  <Glyph size={17} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* ===== Tooltip skill — popup di layer stage (tak terpotong scroll card) ===== */}
      {detail && tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-[6] w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-[12px] leading-5 shadow-[0_14px_36px_-14px_rgb(0_0_0/.7)]"
          style={{ left: tip.x, top: tip.y - 10 }}
        >
          <b className="text-primary">{detail.name}</b>{" "}
          <span style={{ color: accent }}>
            {detailBonus.map(([ax, v], i) => (
              <span key={i}>
                {i > 0 ? " " : ""}
                {"+"}
                {v} {AXES[ax] ?? ""}
              </span>
            ))}
          </span>
          <br />
          <span className="text-muted">{detail.description}</span>
          <span className="absolute bottom-[-4px] left-1/2 size-2 -translate-x-1/2 rotate-45 border-r border-b border-line bg-surface" />
        </div>
      )}
      {fullTip && (
        <div
          role="status"
          className="pointer-events-none absolute z-[6] w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-[12px] leading-5 font-medium shadow-[0_14px_36px_-14px_rgb(0_0_0/.7)]"
          style={{ left: fullTip.x, top: fullTip.y - 10, color: accent }}
        >
          Slots full — unequip one skill first.
          <span className="absolute bottom-[-4px] left-1/2 size-2 -translate-x-1/2 rotate-45 border-r border-b border-line bg-surface" />
        </div>
      )}

      {/* ===== DOCK — galeri karakter ===== */}
      <div className="absolute inset-x-0 bottom-5 z-[4] flex flex-col items-center gap-2 max-[1099px]:sticky max-[1099px]:bottom-0 max-[1099px]:mt-auto max-[1099px]:translate-y-0">
        <div
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
                </svg>
                <b className="w-full truncate text-center text-[12px] font-semibold">
                  {p.name}
                </b>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Growth map — poll ringan (levels & stats nyata dari kerja persona).
// ---------------------------------------------------------------------------
function useGrowthMap(): Map<string, PersonaGrowth> {
  const [map, setMap] = useState<Map<string, PersonaGrowth>>(new Map());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(apiUrl("/api/personas/growth"));
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
