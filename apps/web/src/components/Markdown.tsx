// Markdown minimal & aman untuk bubble chat (dev-10 UX): tanpa raw HTML,
// di-parse jadi React nodes. Cakupan: fenced code ```…```, heading #–####,
// list -/* dan 1. (termasuk task list - [ ]/- [x]), blockquote >, inline
// `code`, **bold**, *italic*, ~~strike~~, [teks](url), autolink http(s),
// hr, dan TABEL GFM | a | b | (fix 2026-11: riset Scholar mengeluarkan tabel,
// sebelumnya dirender mentah sebagai baris pipe). Sisanya teks polos.
// gaya via utility Tailwind semantik (docs/DESIGN-SYSTEM.md), komponen
// ini self-contained, tidak lagi bergantung pada kelas `.md` di globals.css.
import React from "react";

type Inline = React.ReactNode;

function inline(text: string, keyPrefix = ""): Inline[] {
  const out: Inline[] = [];
  // urutan pola: code → bold → italic → strike → link → autolink
  const re =
    /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyPrefix}i${i++}`;
    if (tok.startsWith("`"))
      out.push(
        <code
          key={k}
          className="rounded-[4px] bg-hover px-1 py-px font-mono text-[12.5px]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    else if (tok.startsWith("**") || tok.startsWith("__"))
      out.push(
        <b key={k} className="font-semibold text-primary">
          {tok.slice(2, -2)}
        </b>,
      );
    else if (tok.startsWith("~~"))
      out.push(
        <s key={k} className="text-dim">
          {tok.slice(2, -2)}
        </s>,
      );
    else if (tok.startsWith("*")) out.push(<i key={k}>{tok.slice(1, -1)}</i>);
    else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push(
        <a
          key={k}
          href={mm[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {mm[1]}
        </a>,
      );
    } else
      out.push(
        <a
          key={k}
          href={tok}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {tok}
        </a>,
      );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ── Tabel GFM ──────────────────────────────────────────────────────────────────

/** Baris delimiter `| :--- | ---: |`, WAJIB mengandung `|` (hindari salah tangkap
 *  hr `---` / underline setext setelah paragraf ber-pipe). */
function isDelimRow(s: string): boolean {
  return (
    s.includes("|") &&
    s.includes("-") &&
    /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(s)
  );
}

/** Split baris tabel pada `|` yang tidak di-escape (`\|`). Pipe tepi opsional dibuang. */
function splitRow(s: string): string[] {
  const t = s.trim();
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (ch === "\\" && t[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  if (cells.length && cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function alignOf(d: string | undefined): "left" | "center" | "right" {
  if (!d) return "left";
  const c = d.startsWith(":") && d.endsWith(":") && d.length > 1;
  if (c) return "center";
  if (d.endsWith(":")) return "right";
  return "left";
}

function TaskBox({ done }: { done: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      aria-hidden
      className={`mb-px mr-1.5 inline-block shrink-0 ${done ? "text-accent" : "text-dim"}`}
      fill="none"
    >
      <rect
        x="1.25"
        y="1.25"
        width="13.5"
        height="13.5"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {done && (
        <path
          d="M4.5 8.5l2.5 2.5 4.5-5.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function Markdown({
  text,
  variant = "chat",
  renderCode,
}: {
  text: string;
  /** "chat" (default, kompak) atau "doc" (Files tab: heading besar + spasi
   *  lega, pengalaman baca dokumen). */
  variant?: "chat" | "doc";
 /** (Files): jika ada, fenced code digambar komponen eksternal
   *  (CodeBlock dgn syntax highlight + header). Chat tetap <pre> polos. */
  renderCode?: (code: string, lang: string) => React.ReactNode;
}) {
  const doc = variant === "doc";
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  type Li = { t: string; task: 0 | 1 | 2 }; // 0=bukan task, 1=open, 2=done
  let list: { ordered: boolean; items: Li[] } | null = null;
  let code: { lang: string; lines: string[] } | null = null;
  let quote: string[] = [];
  let bi = 0;
  const key = () => `b${bi++}`;

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p
          key={key()}
          className={`whitespace-pre-wrap ${doc ? "leading-relaxed" : ""}`}
        >
          {inline(para.join("\n"), key())}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const L = list;
      const itemCls = doc ? "my-1 leading-relaxed" : "my-0.5";
      blocks.push(
        L.ordered ? (
          <ol key={key()} className="ml-5 list-decimal">
            {L.items.map((it, j) => (
              <li
                key={j}
                className={`${itemCls} ${it.task === 2 ? "text-dim" : ""}`}
              >
                {it.task !== 0 && <TaskBox done={it.task === 2} />}
                {inline(it.t, `${j}`)}
              </li>
            ))}
          </ol>
        ) : (
          <ul key={key()} className="ml-5 list-disc">
            {L.items.map((it, j) => (
              <li
                key={j}
                className={`${itemCls} ${it.task === 2 ? "text-dim" : ""}`}
              >
                {it.task !== 0 && <TaskBox done={it.task === 2} />}
                {inline(it.t, `${j}`)}
              </li>
            ))}
          </ul>
        ),
      );
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(
        <blockquote
          key={key()}
          className={
            doc
              ? "rounded-r-md2 border-l-2 border-accent/60 bg-accent-soft/40 py-1.5 pr-3 pl-3.5 leading-relaxed text-muted"
              : "border-l-2 border-line pl-3 text-dim"
          }
        >
          {inline(quote.join("\n"), key())}
        </blockquote>,
      );
      quote = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!;
    const line = raw.replace(/\s+$/, "");
    // fenced code
    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (code) {
      if (fence) {
        blocks.push(
          renderCode ? (
            <div key={key()}>
              {renderCode(code.lines.join("\n"), code.lang)}
            </div>
          ) : (
            <pre
              key={key()}
              data-lang={code.lang || undefined}
              className="overflow-x-auto rounded-lg2 bg-inset px-2.5 py-2 font-mono text-[12.5px] leading-5"
            >
              <code>{code.lines.join("\n")}</code>
            </pre>
          ),
        );
        code = null;
      } else code.lines.push(raw);
      continue;
    }
    if (fence) {
      flushAll();
      code = { lang: fence[1]!, lines: [] };
      continue;
    }
    if (!line.trim()) {
      flushAll();
      continue;
    }
    // ── tabel GFM: baris ber-| diikuti baris delimiter `|---|---|` ──
    if (
      line.includes("|") &&
      li + 1 < lines.length &&
      isDelimRow(lines[li + 1]!)
    ) {
      flushAll();
      const head = splitRow(line);
      const aligns = splitRow(lines[li + 1]!).map(alignOf);
      li += 2;
      const rows: string[][] = [];
      while (
        li < lines.length &&
        lines[li]!.includes("|") &&
        lines[li]!.trim()
      ) {
        rows.push(splitRow(lines[li]!));
        li++;
      }
      li--; // kompensasi increment loop
      const alignCls = (a: "left" | "center" | "right") =>
        a === "center"
          ? "text-center"
          : a === "right"
            ? "text-right"
            : "text-left";
      blocks.push(
        <div key={key()} className="my-1 max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-inset">
                {head.map((c, j) => (
                  <th
                    key={j}
                    className={`border-b border-line px-2 py-1.5 font-semibold text-primary ${alignCls(aligns[j] ?? "left")}`}
                  >
                    {inline(c, `h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i2) => (
                <tr key={i2} className="border-b border-line/60 last:border-0">
                  {head.map((_, j) => (
                    <td
                      key={j}
                      className={`px-2 py-1.5 align-top ${alignCls(aligns[j] ?? "left")}`}
                    >
                      {inline(r[j] ?? "", `c${i2}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      const lvl = h[1]!.length;
      if (doc) {
        // varian dokumen: skala heading nyata (h1 judul, h2 seksi bergaris)
        const cls = [
          "mt-7 mb-3 text-[1.75rem] leading-tight font-semibold tracking-tight first:mt-0", // h1
          "mt-7 mb-2.5 border-b border-line pb-1.5 text-[1.3rem] font-semibold tracking-tight", // h2
          "mt-5 mb-1.5 text-[1.1rem] font-semibold", // h3
          "mt-4 mb-1 text-[1rem] font-semibold text-secondary", // h4
        ][lvl - 1]!;
        blocks.push(
          <h2 key={key()} className={`text-primary ${cls}`}>
            {inline(h[2]!, key())}
          </h2>,
        );
      } else {
        const Tag = (["h4", "h4", "h5", "h6"] as const)[lvl - 1]!;
        blocks.push(
          <Tag
            key={key()}
            className={`font-semibold text-primary ${Tag === "h4" ? "text-[1.05em]" : ""}`}
          >
            {inline(h[2]!, key())}
          </Tag>,
        );
      }
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]!);
      continue;
    }
    // task list `- [ ]` / `- [x]` sebelum list biasa
    const tl = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (tl || ul || ol) {
      flushPara();
      flushQuote();
      const ordered = !!ol && !tl && !ul;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      if (tl) list.items.push({ t: tl[2]!, task: tl[1] === " " ? 1 : 2 });
      else list.items.push({ t: (ul ?? ol)![1]!, task: 0 });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushAll();
      blocks.push(<hr key={key()} className="border-line" />);
      continue;
    }
    flushList();
    flushQuote();
    para.push(line);
  }
  if (code) {
    // fence tak tertutup saat streaming, tampilkan apa adanya
    blocks.push(
      renderCode ? (
        <div key={key()}>{renderCode(code.lines.join("\n"), code.lang)}</div>
      ) : (
        <pre
          key={key()}
          className="overflow-x-auto rounded-lg2 bg-inset px-2.5 py-2 font-mono text-[12.5px] leading-5"
        >
          <code>{code.lines.join("\n")}</code>
        </pre>
      ),
    );
  }
  flushAll();
  return (
    <div className={`flex flex-col gap-2 ${doc ? "gap-3" : ""}`}>{blocks}</div>
  );
}
