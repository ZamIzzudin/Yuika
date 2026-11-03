"use client";
/**
 * OrinPortrait — maskot serigala Orin sebagai placeholder animasi SVG (W3-B2/W3-C1).
 * Rig & keyframe dipindah 1:1 dari `docs/Orin v2 – Maskot AI Agent.html` (tabel S) —
 * hirarki bone/input sama persis untuk migrasi ke Rive (P1-PER-3), cukup ganti isi
 * komponen ini dengan <Rive src="/orin.riv" stateMachines="Mascot">.
 *
 * Mapping PersonaState (7) → mood Orin (6): error & awaiting_input berbagi "confused",
 * done & celebrating berbagi "happy" — differensiasi visual penuh menyusul via Rive.
 * Tint per persona: satu art + hue-rotate (DEMO-WEEK-1 §6: placeholder sama, warna beda).
 */
import { useEffect, useRef } from "react";
import type { PersonaState } from "@yui/contracts";

type MoodName = "idle" | "listening" | "thinking" | "speaking" | "happy" | "confused";

const MOOD: Record<PersonaState, MoodName> = {
  idle: "idle",
  thinking: "thinking",
  working: "listening",
  awaiting_input: "confused",
  done: "happy",
  celebrating: "happy",
  error: "confused",
};

/** Tint per persona (derajat hue-rotate; art base biru navy #04235A/#AACBFF). */
const TINT: Record<string, number> = {
  "yui-conductor": 0,
  "yui-scholar": 150,
  "yui-scribe": 260,
  "yui-coder": 80,
};

// rig params — persis B di sumber halaman Orin
const B = { eL: 0, eR: 0, pw: 13, ph: 18, pr: 1, ps: 1, gx: 0, gy: 0, top: 0, tl: 0, tr: 0, hap: 0, sniff: 0, by: 0, sy: 1, rot: 0, ring: 0, halo: 0, ms: 0.35, mo: 0, mx: 0 };
type Rig = typeof B;
const mk = (o: Partial<Rig> = {}): Rig => ({ ...B, ...o });

// keyframe per mood — persis S di sumber halaman Orin
const S: Record<MoodName, Rig> = {
  idle: mk(),
  listening: mk({ eL: -7, eR: -7, pw: 14, ph: 22, ps: 1.06, by: -8, sy: 1.04, rot: 3, ring: 1, ms: 0.1, mo: 0.2 }),
  thinking: mk({ eL: 8, eR: -4, pw: 12, ph: 15, gx: -0.8, gy: -0.8, top: 0.2, tl: -8, tr: 8, sniff: 1, rot: -5, ms: -0.15, mx: -7 }),
  speaking: mk({ eL: -2, eR: -2, pw: 13, ph: 19, halo: 1, by: -3, ms: 0.3, mo: 0.3 }),
  happy: mk({ eL: -10, eR: -10, pw: 15, ph: 17, hap: 1, by: -14, sy: 1.05, rot: 3, ms: 1, mo: 0.5 }),
  confused: mk({ eL: -12, eR: 24, pw: 11, ph: 16, pr: 1.45, top: 0.28, tl: 14, tr: -4, gx: 0.5, gy: -0.2, rot: 8, ms: -0.6, mx: 6 }),
};

export function OrinPortrait({ state, personaId, size = 190 }: { state: PersonaState; personaId?: string; size?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tgtRef = useRef<Rig>(S[MOOD[state]]);
  const nameRef = useRef<MoodName>(MOOD[state]);

  useEffect(() => {
    nameRef.current = MOOD[state];
    tgtRef.current = S[MOOD[state]];
  }, [state]);

  useEffect(() => {
    const $ = (id: string) => document.getElementById(id);
    const svg = svgRef.current;
    if (!svg) return;
    // cache elemen rig sekali (id dipakai lintas-instance aman: 1 portrait per sesi)
    const E = {
      body: $("orin-body"), face: $("orin-face"),
      eo: [...svg.querySelectorAll<SVGElement>(".orin-eo")], ef: [...svg.querySelectorAll<SVGElement>(".orin-ef")], ei: [...svg.querySelectorAll<SVGElement>(".orin-ei")],
      eL: $("orin-eL"), eR: $("orin-eR"), gL: $("orin-gL"), gR: $("orin-gR"),
      pL: $("orin-pL"), pR: $("orin-pR"), pbL: $("orin-pbL"), pbR: $("orin-pbR"), lL: $("orin-lL"), lR: $("orin-lR"),
      nose: $("orin-nose"), mouth: $("orin-mouth"), mopen: $("orin-mopen"), mclip: $("orin-mclip"), tongue: $("orin-tongue"),
      fgL: $("orin-fgL"), fgR: $("orin-fgR"), dmL: $("orin-dmL"), dmR: $("orin-dmR"),
      r1: $("orin-r1"), r2: $("orin-r2"), halo: $("orin-halo"), shadow: $("orin-shadow"),
    };
    if (!E.body || !E.face) return;

    const cur = mk();
    let raf = 0;
    const t0 = performance.now();
    let last = t0, blink = 0, nextBlink = t0 + 2500, bump = 0, lvl = 0, lvlT = 0, mx = 0, my = 0, sm = 0;

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
      const tgt = tgtRef.current, name = nameRef.current;
      for (const p in cur) cur[p as keyof Rig] += (tgt[p as keyof Rig] - cur[p as keyof Rig]) * k;

      // kedip
      let bl = 1;
      if (now > nextBlink) { blink = 1; nextBlink = now + 2200 + Math.random() * 3500; }
      if (blink > 0) { blink -= dt / 0.15; bl = blink > 0 ? Math.max(0.1, Math.abs(blink * 2 - 1)) : 1; if (blink <= 0) blink = 0; }

      lvl = 0; // audioLevel: diaktifkan saat integrasi voice (P3) — mood "speaking" tak dipakai Web demo
      sm += (lvl - sm) * (1 - Math.exp(-dt * 14));
      const L = sm;

      let gx = cur.gx, gy = cur.gy;
      if (name === "thinking") { gx += Math.sin(t * 1.1) * 0.4; gy += Math.sin(t * 0.8) * 0.15; }
      else if (name === "idle" || name === "listening" || name === "happy") { gx += mx * 0.9; gy += my * 0.7; }
      bump *= Math.exp(-dt * 4);

      // body: napas + bounce klik
      const br = Math.sin(t * 1.6), by = cur.by + br * 1.8 - Math.sin(bump * Math.PI) * 16;
      const sy = cur.sy + br * 0.012 + L * 0.05 + bump * 0.05, sx = 1 + (1 - sy) * 0.7;
      const rot = cur.rot + Math.sin(t * 0.9) * 0.8 + (name === "speaking" ? Math.sin(t * 5) * L * 2.2 : 0);
      E.body!.setAttribute("transform", `translate(200 ${206 + by}) rotate(${rot}) scale(${1.2 * sx} ${1.2 * sy})`);
      E.face!.setAttribute("transform", `translate(${gx * 5} ${gy * 3})`);
      E.shadow!.setAttribute("rx", String(100 - by * 0.9));
      E.shadow!.setAttribute("opacity", String(0.8 + by * 0.015));

      // telinga
      const wig = Math.sin(t * 9) * L * 4;
      for (const els of [E.eo, E.ef, E.ei]) for (const e of els) {
        const s = Number(e.dataset.s);
        const a = (s < 0 ? cur.eL : cur.eR) * s + (s < 0 ? -wig : wig) + Math.sin(t * 0.7 + s) * 0.8;
        e.setAttribute("transform", `rotate(${a} ${s * 52} -72)`);
      }

      // mata
      const eyes: ["L" | "R", number, number, number][] = [["L", -1, 1, cur.tl], ["R", 1, cur.pr, cur.tr]];
      for (const [side, x, m, tl] of eyes) {
        const eEye = side === "L" ? E.eL : E.eR, g = side === "L" ? E.gL : E.gR;
        const p = side === "L" ? E.pL : E.pR, pb = side === "L" ? E.pbL : E.pbR;
        const lid = side === "L" ? E.lL : E.lR;
        const ph = cur.ph * (1 + L * 0.14), pw = cur.pw * (1 - L * 0.05);
        eEye!.setAttribute("transform", `translate(${x * 46} 4) scale(${cur.ps})`);
        g!.setAttribute("transform", `translate(${gx * 14 + x * -3} ${gy * 15})`);
        p!.setAttribute("rx", String(pw * m));
        p!.setAttribute("ry", String(Math.max(1.5, ph * m * bl)));
        const H = ph * m;
        pb!.setAttribute("ry", String(H * 1.25));
        pb!.setAttribute("rx", String(pw * m * 2.2));
        pb!.setAttribute("cy", String(H * 2.3 - cur.hap * H * 1.4));
        const ye = -42 + cur.top * 84;
        lid!.setAttribute("height", String(Math.max(0, ye + 60)));
        lid!.setAttribute("transform", `rotate(${tl} 0 ${ye})`);
      }

      // mulut (mood keyframe; mo>0 → mulut terbuka)
      const mo = Math.max(0, Math.min(1, cur.mo)), ms = cur.ms, mw = 22 + ms * 4 - mo * 3, mxx = cur.mx;
      const mcy = 64 - ms * 1.5 + Math.sin(t * 1.6) * 0.3, ly = mcy - ms * 3 + 1, ry = mcy - ms * 5 - 2;
      const lx = mxx - mw, rx = mxx + mw, ctx = mxx + 2, cty = mcy + 4 + ms * 6;
      const up = `M${lx},${ly}Q${ctx},${cty} ${rx},${ry}`;
      const od = `${up}Q${mxx},${mcy + 4 + mo * 26} ${lx},${ly}Z`, oo = Math.min(1, mo * 6);
      E.mouth!.setAttribute("d", up); E.mouth!.style.opacity = String(1 - oo);
      E.mopen!.setAttribute("d", od); E.mopen!.style.opacity = String(oo); E.mclip!.setAttribute("d", od);
      const tg = E.tongue!;
      tg.setAttribute("cx", String(mxx)); tg.setAttribute("cy", String(mcy + 4 + mo * 24));
      tg.setAttribute("rx", String(mw * 0.4)); tg.setAttribute("ry", String(2 + mo * 8)); tg.style.opacity = "0";
      // taring & dimple (mood happy/speaking)
      const qp = (u: number): [number, number] => {
        const a = 1 - u;
        return [a * a * lx + 2 * a * u * ctx + u * u * rx, a * a * ly + 2 * a * u * cty + u * u * ry];
      };
      const f1 = qp(0.25), f2 = qp(0.75), fl = 4 + mo * 4;
      E.fgL!.setAttribute("d", `M${f1[0] - 3.5},${f1[1] - 0.5}L${f1[0] + 3.5},${f1[1] - 0.5}L${f1[0]},${f1[1] + fl}Z`);
      E.fgR!.setAttribute("d", `M${f2[0] - 3.5},${f2[1] - 0.5}L${f2[0] + 3.5},${f2[1] - 0.5}L${f2[0]},${f2[1] + fl}Z`);
      E.fgL!.style.opacity = "0"; E.fgR!.style.opacity = "0";
      E.dmR!.setAttribute("d", `M${rx + 2},${ry}L${rx + 8},${ry - 4}`);
      E.dmL!.setAttribute("d", `M${lx - 2},${ly}L${lx - 8},${ly - 4}`);
      E.dmR!.style.opacity = "0"; E.dmL!.style.opacity = "0";

      // hidung sniff (berpikir)
      const sn = 1 + Math.sin(t * 14) * 0.07 * cur.sniff;
      E.nose!.setAttribute("transform", `translate(0 ${26 - cur.sniff * Math.abs(Math.sin(t * 14)) * 1.5}) scale(${sn})`);

      // ring (listening) + halo (speaking)
      const rings: [HTMLElement | null, number][] = [[E.r1, 0], [E.r2, 0.5]];
      for (const [el, ph2] of rings) {
        const ph3 = (t * 0.6 + ph2) % 1;
        el!.setAttribute("r", String(160 + ph3 * 36));
        el!.setAttribute("opacity", String(cur.ring * (1 - ph3) * 0.55));
      }
      E.halo!.setAttribute("r", String(150 + L * 14));
      E.halo!.setAttribute("opacity", String(cur.halo * (0.15 + L * 0.55)));

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onClick = () => {
      bump = 1; // squash kecil saat diklik — responsif "hidup"
    };
    svg.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      svg.removeEventListener("click", onClick);
    };
  }, []);

  const tint = personaId ? (TINT[personaId] ?? 0) : 0;

  return (
    <div ref={wrapRef} className="orin-wrap" style={{ filter: `hue-rotate(${tint}deg)`, width: size }}>
      <svg ref={svgRef} viewBox="0 0 400 400" role="img" aria-label="Maskot Orin" className="orin-svg">
        <defs>
          <path id="orin-head" d="M-52,-88C-26,-98 26,-98 52,-88C84,-68 100,-22 102,26L112,35C115,39 114,44 111,49C86,96 42,120 0,120C-42,120 -86,96 -111,49C-114,44 -115,39 -112,35L-102,26C-100,-22 -84,-68 -52,-88Z" />
          <path id="orin-earR" d="M12,-82C20,-100 28,-116 42,-118C52,-118 58,-112 66,-104C80,-86 90,-64 92,-40L28,-40Z" />
          <path id="orin-earL" d="M-12,-82C-20,-100 -28,-116 -42,-118C-52,-118 -58,-112 -66,-104C-80,-86 -90,-64 -92,-40L-28,-40Z" />
          <clipPath id="orin-cL"><ellipse rx="35" ry="42" /></clipPath>
          <clipPath id="orin-cR"><ellipse rx="35" ry="42" /></clipPath>
          <clipPath id="orin-mcc"><path id="orin-mclip" d="M0,0Z" /></clipPath>
          <mask id="orin-pmL" maskUnits="userSpaceOnUse" x="-40" y="-40" width="80" height="80"><rect x="-40" y="-40" width="80" height="80" fill="#fff" /><ellipse id="orin-pbL" rx="30" ry="14" fill="#000" /></mask>
          <mask id="orin-pmR" maskUnits="userSpaceOnUse" x="-40" y="-40" width="80" height="80"><rect x="-40" y="-40" width="80" height="80" fill="#fff" /><ellipse id="orin-pbR" rx="30" ry="14" fill="#000" /></mask>
          <filter id="orin-soft"><feGaussianBlur stdDeviation="10" /></filter>
          <radialGradient id="orin-sh"><stop offset="0" stopColor="#04235A" stopOpacity=".25" /><stop offset="1" stopColor="#04235A" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse id="orin-shadow" cx="200" cy="368" rx="100" ry="11" fill="url(#orin-sh)" />
        <circle id="orin-r1" cx="200" cy="200" r="160" fill="none" stroke="#6FA8FF" strokeWidth="2" opacity="0" />
        <circle id="orin-r2" cx="200" cy="200" r="160" fill="none" stroke="#6FA8FF" strokeWidth="2" opacity="0" />
        <circle id="orin-halo" cx="200" cy="200" r="150" fill="none" stroke="#6FA8FF" strokeWidth="16" opacity="0" filter="url(#orin-soft)" />
        <g id="orin-body">
          <g fill="#04235A" stroke="#04235A" strokeWidth="16" strokeLinejoin="round">
            <use className="orin-eo" data-s={-1} href="#orin-earL" /><use className="orin-eo" data-s={1} href="#orin-earR" /><use href="#orin-head" />
          </g>
          <g fill="#AACBFF">
            <use className="orin-ef" data-s={-1} href="#orin-earL" /><use className="orin-ef" data-s={1} href="#orin-earR" /><use href="#orin-head" />
          </g>
          <path className="orin-ei" data-s={-1} fill="#04235A" d="M-50,-96C-60,-84 -68,-72 -72,-60C-65,-62 -56,-64 -47,-60Z" />
          <path className="orin-ei" data-s={1} fill="#04235A" d="M50,-96C60,-84 68,-72 72,-60C65,-62 56,-64 47,-60Z" />
          <g id="orin-face">
            <path fill="#fff" d="M-88,26L-68,42C-50,70 -26,98 0,100C26,98 50,70 68,42L88,26L64,6L-64,6Z" />
            <g id="orin-eL"><g clipPath="url(#orin-cL)"><ellipse rx="35" ry="42" fill="#fff" /><g id="orin-gL"><ellipse id="orin-pL" rx="13" ry="18" fill="#04235A" mask="url(#orin-pmL)" /></g><rect id="orin-lL" x="-46" y="-60" width="92" height="20" fill="#AACBFF" /></g></g>
            <g id="orin-eR"><g clipPath="url(#orin-cR)"><ellipse rx="35" ry="42" fill="#fff" /><g id="orin-gR"><ellipse id="orin-pR" rx="13" ry="18" fill="#04235A" mask="url(#orin-pmR)" /></g><rect id="orin-lR" x="-46" y="-60" width="92" height="20" fill="#AACBFF" /></g></g>
            <path id="orin-nose" fill="#04235A" d="M-14,-6C-8,-9 8,-9 14,-6C12,0 5,5 0,8C-5,5 -12,0 -14,-6Z" />
            <path id="orin-mopen" fill="#04235A" stroke="#04235A" strokeWidth="9" strokeLinejoin="round" opacity="0" d="M0,0Z" />
            <ellipse id="orin-tongue" fill="#FF8FA3" clipPath="url(#orin-mcc)" opacity="0" rx="10" ry="4" cx="0" cy="75" />
            <path id="orin-mouth" fill="none" stroke="#04235A" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" d="M-22,64Q2,70 22,60" />
            <path id="orin-fgL" fill="#fff" opacity="0" d="M0,0" />
            <path id="orin-fgR" fill="#fff" opacity="0" d="M0,0" />
            <path id="orin-dmL" fill="none" stroke="#04235A" strokeWidth="3.5" strokeLinecap="round" opacity="0" d="M0,0" />
            <path id="orin-dmR" fill="none" stroke="#04235A" strokeWidth="3.5" strokeLinecap="round" opacity="0" d="M0,0" />
          </g>
        </g>
      </svg>
    </div>
  );
}
