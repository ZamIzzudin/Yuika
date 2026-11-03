"use client";
/**
 * OrinPortrait v4 — maskot Orin bentuk geometris (docs/Orin v4 – Pilih Maskot).
 * Rig & keyframe dipindah 1:1 dari halaman sumber; SATU rig mata dipakai semua bentuk,
 * jadi ekspresi konsisten & simetris. Identitas persona = bentuk (orinShapes.tsx).
 *
 * Mapping PersonaState (7) → mood (6):
 *   idle→idle · thinking→thinking · working→speaking (halo) ·
 *   awaiting_input→listening (mata besar) · done/celebrating→happy (mata "^") ·
 *   error→confused. celebrating men-trigger bounce ekstra.
 *
 * Siap Rive (P1-PER-2): state machine "Mascot" — mood 0–5, shape 0–4, lookX/lookY,
 * audioLevel, trigger blink/nod; hirarki identik (Root›Body›Face›EyeL/EyeR›ArcShape).
 */
import { useEffect, useRef } from "react";
import type { PersonaState } from "@yui/contracts";
import { personaShape } from "./orinShapes";

type MoodName = "idle" | "listening" | "thinking" | "speaking" | "happy" | "confused";

const MOOD: Record<PersonaState, MoodName> = {
  idle: "idle",
  thinking: "thinking",
  working: "speaking",
  awaiting_input: "listening",
  done: "happy",
  celebrating: "happy",
  error: "confused",
};

// rig params — persis B di halaman sumber v4
const B = { ew: 24, eh: 60, gap: 36, gx: 0, gy: 0, tilt: 0, hap: 0, by: 0, sy: 1, rot: 0, ring: 0, halo: 0, ey: 0 };
type Rig = typeof B;
const mk = (o: Partial<Rig> = {}): Rig => ({ ...B, ...o });

// keyframe per mood — persis S di halaman sumber v4
const S: Record<MoodName, Rig> = {
  idle: mk(),
  listening: mk({ ew: 26, eh: 74, gap: 38, by: -8, sy: 1.04, ring: 1, ey: -8 }),
  thinking: mk({ ew: 22, eh: 48, tilt: 14, gx: -0.7, gy: -0.8, rot: -4 }),
  speaking: mk({ halo: 1, by: -3 }),
  happy: mk({ ew: 24, eh: 52, gap: 50, hap: 1, by: -14, sy: 1.05, rot: 3, ey: -4 }),
  confused: mk({ ew: 22, eh: 50, tilt: 22, gx: 0.3, rot: 9 }),
};

const EYE_INK = "#0B0B0E";

export function OrinPortrait({ state, personaId, size = 190 }: { state: PersonaState; personaId?: string; size?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  const eLRef = useRef<SVGGElement>(null);
  const eRRef = useRef<SVGGElement>(null);
  const cLRef = useRef<SVGRectElement>(null);
  const cRRef = useRef<SVGRectElement>(null);
  const aLRef = useRef<SVGPathElement>(null);
  const aRRef = useRef<SVGPathElement>(null);
  const r1Ref = useRef<SVGCircleElement>(null);
  const r2Ref = useRef<SVGCircleElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);

  const shape = personaShape(personaId);

  const tgtRef = useRef<Rig>(S[MOOD[state]]);
  const moodRef = useRef<MoodName>(MOOD[state]);
  const overrideUntilRef = useRef(0);
  const bumpRef = useRef(0);

  useEffect(() => {
    moodRef.current = MOOD[state];
    if (performance.now() > overrideUntilRef.current) tgtRef.current = S[MOOD[state]];
    if (state === "celebrating") bumpRef.current = 1; // bounce ekstra saat merayakan
  }, [state]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const cur = mk();
    const sc = { fy: shape.fy, gs: shape.gs, es: shape.es, gr: shape.gr }; // konstan — bentuk statis per instance
    let raf = 0;
    const t0 = performance.now();
    let last = t0, blink = 0, nextBlink = t0 + 2500, lvl = 0, lvlT = 0, mx = 0, my = 0, sm = 0;

    const onPointer = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      mx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width * 0.7)));
      my = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height * 0.7)));
    };
    window.addEventListener("pointermove", onPointer);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1e3);
      last = now;
      const t = (now - t0) / 1e3, k = 1 - Math.exp(-dt * 9);
      const name = moodRef.current;
      const tgt = now < overrideUntilRef.current ? S.happy : tgtRef.current;
      for (const p in cur) cur[p as keyof Rig] += (tgt[p as keyof Rig] - cur[p as keyof Rig]) * k;

      // kedip
      let bl = 1;
      if (now > nextBlink) { blink = 1; nextBlink = now + 2200 + Math.random() * 3500; }
      if (blink > 0) { blink -= dt / 0.15; bl = blink > 0 ? Math.max(0.1, Math.abs(blink * 2 - 1)) : 1; if (blink <= 0) blink = 0; }

      // audioLevel: disimulasikan saat speaking (menyala-nyala halo) — mic asli menyusul voice (P3)
      if (name === "speaking") {
        if (now > lvlT) { lvlT = now + 80 + Math.random() * 110; lvl = Math.random() < 0.18 ? 0.05 : 0.35 + Math.random() * 0.65; }
      } else lvl = 0;
      sm += (lvl - sm) * (1 - Math.exp(-dt * 14));
      const L = sm;

      let gx = cur.gx, gy = cur.gy;
      if (name === "thinking") { gx += Math.sin(t * 1.1) * 0.4; gy += Math.sin(t * 0.8) * 0.15; }
      else if (name === "idle" || name === "listening" || name === "happy") { gx += mx * 0.9; gy += my * 0.7; }
      bumpRef.current *= Math.exp(-dt * 4);

      // body: napas + bounce klik/perayaan (squash-stretch)
      const br = Math.sin(t * 1.6), by = cur.by + br * 2 - Math.sin(bumpRef.current * Math.PI) * 18;
      const sy = cur.sy + br * 0.012 + L * 0.05 + bumpRef.current * 0.05, sx = 1 + (1 - sy) * 0.7;
      const rot = cur.rot + Math.sin(t * 0.9) * 0.8 + (name === "speaking" ? Math.sin(t * 5) * L * 2 : 0);
      bodyRef.current?.setAttribute("transform", `translate(200 ${200 + by}) rotate(${rot}) scale(${sx} ${sy})`);

      // wajah: tatapan parallax + offset per bentuk
      faceRef.current?.setAttribute("transform", `translate(${gx * 34 * sc.gr} ${gy * 26 * sc.gr + cur.ey + sc.fy})`);

      // mata kapsul ↔ arc "^" (happy) cross-fade
      const hp = Math.min(1, cur.hap), w = cur.ew * sc.es, h = cur.eh * sc.es * (1 + L * 0.3) * bl;
      const eyes: [SVGGElement | null, SVGRectElement | null, SVGPathElement | null, number][] = [
        [eLRef.current, cLRef.current, aLRef.current, -1],
        [eRRef.current, cRRef.current, aRRef.current, 1],
      ];
      for (const [g, c, a, d] of eyes) {
        if (!g || !c || !a) continue;
        g.setAttribute("transform", `translate(${d * cur.gap * sc.gs} 0) rotate(${d * cur.tilt})`);
        c.setAttribute("x", String(-w / 2)); c.setAttribute("y", String(-h / 2));
        c.setAttribute("width", String(w)); c.setAttribute("height", String(h));
        c.setAttribute("rx", String(w / 2));
        c.style.opacity = String(1 - hp);
        const aw = w * 0.8;
        a.setAttribute("stroke-width", String(w * 0.8));
        a.setAttribute("d", `M${-aw},6Q0,-12 ${aw},6`);
        a.style.opacity = String(hp);
      }

      // ring pulsa (listening) + halo (speaking)
      const rings: [SVGCircleElement | null, number][] = [[r1Ref.current, 0], [r2Ref.current, 0.5]];
      for (const [el, ph0] of rings) {
        if (!el) continue;
        const ph = ((t * 0.6) + ph0) % 1;
        el.setAttribute("r", String(135 + ph * 40));
        el.setAttribute("opacity", String(cur.ring * (1 - ph) * 0.5));
      }
      haloRef.current?.setAttribute("r", String(134 + L * 14));
      haloRef.current?.setAttribute("opacity", String(cur.halo * (0.1 + L * 0.4)));

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // klik: squash + senyum sebentar kalau idle — "hidup"
    const onClick = () => {
      bumpRef.current = 1;
      if (moodRef.current === "idle") overrideUntilRef.current = performance.now() + 1100;
    };
    svg.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      svg.removeEventListener("click", onClick);
    };
  }, [shape]);

  return (
    <div className="orin-wrap" style={{ width: size }}>
      <svg ref={svgRef} viewBox="0 0 400 400" role="img" aria-label="Maskot Orin" className="orin-svg">
        <circle ref={r1Ref} cx={200} cy={200} r={135} fill="none" stroke={shape.color} strokeWidth={2} opacity={0} />
        <circle ref={r2Ref} cx={200} cy={200} r={135} fill="none" stroke={shape.color} strokeWidth={2} opacity={0} />
        <g ref={bodyRef}>
          <circle ref={haloRef} r={130} fill="none" stroke={shape.color} strokeWidth={14} opacity={0} />
          {/* stroke-based shapes (star/hex/trap) memakai currentColor → set color juga */}
          <g fill={shape.color} style={{ color: shape.color }}>
            {shape.geom}
          </g>
          <g ref={faceRef}>
            <g ref={eLRef}>
              <rect ref={cLRef} fill={EYE_INK} />
              <path ref={aLRef} fill="none" stroke={EYE_INK} strokeLinecap="round" opacity={0} />
            </g>
            <g ref={eRRef}>
              <rect ref={cRRef} fill={EYE_INK} />
              <path ref={aRRef} fill="none" stroke={EYE_INK} strokeLinecap="round" opacity={0} />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
