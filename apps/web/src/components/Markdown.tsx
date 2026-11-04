// Markdown minimal & aman untuk bubble chat (dev-10 UX): tanpa raw HTML,
// di-parse jadi React nodes. Cakupan: fenced code ```…```, heading #–###,
// list -/* dan 1., blockquote >, inline `code`, **bold**, *italic*,
// ~~strike~~, [teks](url), autolink http(s). Sisanya teks polos.
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
    if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**") || tok.startsWith("__")) out.push(<b key={k}>{tok.slice(2, -2)}</b>);
    else if (tok.startsWith("~~")) out.push(<s key={k}>{tok.slice(2, -2)}</s>);
    else if (tok.startsWith("*")) out.push(<i key={k}>{tok.slice(1, -1)}</i>);
    else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push(
        <a key={k} href={mm[2]} target="_blank" rel="noreferrer noopener">
          {mm[1]}
        </a>,
      );
    } else
      out.push(
        <a key={k} href={tok} target="_blank" rel="noreferrer noopener">
          {tok}
        </a>,
      );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: { lang: string; lines: string[] } | null = null;
  let quote: string[] = [];
  let bi = 0;
  const key = () => `b${bi++}`;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={key()}>{inline(para.join("\n"), key())}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const L = list;
      blocks.push(
        L.ordered ? (
          <ol key={key()}>
            {L.items.map((it, j) => (
              <li key={j}>{inline(it, `${j}`)}</li>
            ))}
          </ol>
        ) : (
          <ul key={key()}>
            {L.items.map((it, j) => (
              <li key={j}>{inline(it, `${j}`)}</li>
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
        <blockquote key={key()}>
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

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    // fenced code
    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (code) {
      if (fence) {
        blocks.push(
          <pre key={key()} data-lang={code.lang || undefined}>
            <code>{code.lines.join("\n")}</code>
          </pre>,
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
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      const Tag = (["h4", "h4", "h5", "h6"] as const)[h[1]!.length - 1]!;
      blocks.push(<Tag key={key()}>{inline(h[2]!, key())}</Tag>);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]!);
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      flushQuote();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushAll();
      blocks.push(<hr key={key()} />);
      continue;
    }
    flushList();
    flushQuote();
    para.push(line);
  }
  if (code) {
    // fence tak tertutup saat streaming — tampilkan apa adanya
    blocks.push(
      <pre key={key()}>
        <code>{code.lines.join("\n")}</code>
      </pre>,
    );
  }
  flushAll();
  return <div className="md">{blocks}</div>;
}
