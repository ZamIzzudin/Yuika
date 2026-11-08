"use client";
// CodeBlock (D29): preview file kode & fenced-code markdown dengan syntax
// highlighting editor-grade via Shiki (github-light-default, inline styles).
// Prinsip: LAZY — highlighter di-import dinamis sekali (singleton); selagi
// belum siap/berhasil → fallback <pre> polos (tidak pernah blank atau error).
// Gutter nomor baris + header (chip bahasa + copy). Aman: shiki meng-escape
// konten sebelum mewarnai; teks selalu lewat codeToHtml, bukan raw HTML user.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

/** ext → shiki lang; null = tanpa highlight (plain). */
export function langOf(filename: string | null | undefined): string | null {
  const ext = filename?.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    mts: "typescript",
    cts: "typescript",
    tsx: "tsx",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    json: "json",
    jsonc: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    markdown: "markdown",
    mdx: "markdown",
    html: "html",
    htm: "html",
    vue: "html",
    svelte: "html",
    css: "css",
    scss: "css",
    less: "css",
    py: "python",
    pyi: "python",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    xml: "xml",
    svg: "xml",
    toml: "toml",
    ini: "ini",
    env: "ini",
    properties: "ini",
    diff: "diff",
    patch: "diff",
  };
  return map[ext] ?? null;
}

type Hl = { codeToHtml: (code: string, o: { lang: string; theme: string }) => string };

/** Singleton highlighter — dibuat sekali per halaman, dipakai semua CodeBlock. */
let hlPromise: Promise<Hl | null> | null = null;
function getHl(langs: string[]): Promise<Hl | null> {
  if (!hlPromise) {
    hlPromise = (async () => {
      try {
        const s = await import("shiki");
        const hl = await s.createHighlighter({
          themes: ["github-light-default"],
          // gabungkan bahasa yang diminta pemanggil pertama + set inti
          langs: Array.from(new Set(["typescript", "tsx", "javascript", "jsx", "json", "yaml", "markdown", "html", "css", "python", "bash", "sql", "xml", "toml", "ini", "diff", ...langs])),
        });
        return hl as unknown as Hl;
      } catch {
        return null; // offline/bundling bermasalah → plain text tetap jalan
      }
    })();
  }
  return hlPromise;
}

export function CodeBlock({
  code,
  lang,
  filename,
  lineNumbers = false,
  maxHeight,
  className = "",
}: {
  code: string;
  /** shiki lang (dari langOf / fence). null/unknown → plain. */
  lang?: string | null;
  filename?: string;
  lineNumbers?: boolean;
  maxHeight?: number;
  className?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    if (!lang) return;
    void getHl([lang]).then((hl) => {
      if (!alive || !hl) return;
      try {
        setHtml(hl.codeToHtml(code, { lang, theme: "github-light-default" }));
      } catch {
        /* grammar tak terdaftar → plain */
      }
    });
    return () => {
      alive = false;
    };
  }, [code, lang]);

  useEffect(() => () => {
    if (copyT.current) clearTimeout(copyT.current);
  }, []);

  const lineCount = useMemo(() => code.split("\n").length, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyT.current) clearTimeout(copyT.current);
      copyT.current = setTimeout(() => setCopied(false), 1_400);
    } catch {
      /* clipboard ditolak browser */
    }
  }

  return (
    <div
      className={`overflow-hidden rounded-lg2 border border-line bg-inset ${className}`}
      data-codeblock
    >
      <header className="flex items-center gap-2 border-b border-line/70 px-2.5 py-1.5">
        <span
          className="rounded-pill bg-hover px-2 py-px font-mono text-[10.5px] font-medium tracking-wide text-secondary uppercase"
          aria-hidden
        >
          {lang ?? "text"}
        </span>
        {filename && (
          <b className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-medium text-muted">
            {filename}
          </b>
        )}
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy code"
          title="Copy"
          className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-md2 px-1.5 py-0.5 text-[11px] text-dim transition-colors hover:bg-hover hover:text-primary"
        >
          {copied ? (
            <Check size={12} aria-hidden className="text-success" />
          ) : (
            <Copy size={12} aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </header>
      <div
        className="flex overflow-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {lineNumbers && (
          <div
            aria-hidden
            className="sticky left-0 shrink-0 border-r border-line/60 bg-inset py-2 pr-2 pl-3 text-right font-mono text-[12.5px] leading-5 text-dim/80 select-none"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        {html ? (
          // shiki: token colors inline; latar kita sendiri (bg-inset) —
          // background inline shiki di-nol-kan via [&_.shiki]
          <div
            className="min-w-0 flex-1 [&_.shiki]:bg-transparent! [&_.shiki]:p-0! [&_code]:font-mono! [&_code]:text-[12.5px]! [&_code]:leading-5!"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="min-w-0 flex-1 px-3 py-2 font-mono text-[12.5px] leading-5 text-secondary">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
