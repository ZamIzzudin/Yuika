"use client";
// P1-PER-5 blind test panel: persona menjawab SATU prompt sama (sesi fresh),
// penguji menebak penulis tiap jawaban anonim (A/B/C…). Gerbang ≥80% benar.
// Mapping huruf→persona dirahasiakan server sampai tebakan disubmit.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonaInfo } from "@yuika/contracts";
import { CircleNotch, EyeSlash, Sword } from "@phosphor-icons/react";
import { apiUrl, authFetch } from "@/lib/api";
import { toastErr } from "./ui/toast";
import { Button, Chip, Select } from "./ui";

interface BlindEntryView {
  letter: string;
  personaId: string; // "" sampai reveal
  sessionId: string;
  status: "running" | "done" | "failed";
  answer: string | null;
  error: string | null;
}

interface BlindRunView {
  id: string;
  promptId: string;
  promptLabel: string;
  promptText: string;
  createdAt: number;
  endedAt: number | null;
  status: "running" | "done" | "failed";
  entries: BlindEntryView[];
  guesses: Record<string, string> | null;
  correct: number | null;
  score: number | null;
  gatePass: boolean | null;
}

interface BlindListResponse {
  prompts: Array<{ id: string; label: string; text: string }>;
  runs: BlindRunView[];
}

const LETTER_TONE: Record<string, string> = {
  A: "#007cf7",
  B: "#22c55e",
  C: "#e05252",
  D: "#7b61ff",
  E: "#ec4899",
  F: "#e6a23c",
};

export function BlindTestPanel({ personas }: { personas: PersonaInfo[] }) {
  const [prompts, setPrompts] = useState<BlindListResponse["prompts"]>([]);
  const [runs, setRuns] = useState<BlindRunView[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [promptId, setPromptId] = useState("plan");
  const [active, setActive] = useState<BlindRunView | null>(null);
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/api/personas/blindtest"));
      if (r.ok) {
        const j = (await r.json()) as BlindListResponse;
        setPrompts(j.prompts);
        setRuns(j.runs);
        // aktifkan run terbaru bila belum ada yang dipilih
        setActive((cur) => cur ?? j.runs[0] ?? null);
      }
    } catch {
      /* panel diam saat API belum siap */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // polling run aktif (answers muncul satu per satu saat turn selesai)
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (active && active.status === "running") {
      pollRef.current = setInterval(async () => {
        try {
          const r = await authFetch(apiUrl(`/api/personas/blindtest/${active.id}`));
          if (r.ok) setActive((await r.json()) as BlindRunView);
        } catch {
          /* retry tick berikutnya */
        }
      }, 2500);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [active]);

  async function startRun(): Promise<void> {
    if (picked.length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await authFetch(apiUrl("/api/personas/blindtest"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaIds: picked, promptId }),
      });
      const j = (await r.json()) as BlindRunView & { error?: string };
      if (!r.ok) {
        toastErr(j.error ?? "cannot start blind test");
        return;
      }
      setGuesses({});
      setActive(j);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitGuesses(): Promise<void> {
    if (!active || busy) return;
    setBusy(true);
    try {
      const r = await authFetch(apiUrl(`/api/personas/blindtest/${active.id}/guesses`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guesses }),
      });
      const j = (await r.json()) as BlindRunView & { error?: string };
      if (!r.ok) {
        toastErr(j.error ?? "cannot submit guesses");
        return;
      }
      setActive(j);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  const doneEntries = useMemo(
    () => active?.entries.filter((e) => e.status === "done") ?? [],
    [active],
  );
  const allGuessed =
    doneEntries.length > 0 && doneEntries.every((e) => guesses[e.letter]?.trim());
  const revealed = active?.guesses != null;
  const personaName = (id: string): string =>
    personas.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <header className="flex flex-col gap-1">
        <b className="text-body font-semibold text-primary">Blind test</b>
        <p className="text-caption leading-5 text-dim">
          Several personas answer the same prompt in fresh sessions. Read the
          anonymous answers, guess who wrote each one. Gate: at least 80%
          correct proves the personas behave differently, not just look
          different.
        </p>
      </header>

      {/* Setup */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          {personas.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  setPicked((cur) =>
                    cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id],
                  )
                }
                className={`rounded-full border px-3 py-1 text-caption font-medium transition-colors ${
                  on
                    ? "border-accent bg-accent-soft text-primary"
                    : "border-line bg-inset text-dim hover:text-primary"
                }`}
                title={p.expertise}
              >
                {p.name}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={promptId}
            onChange={(e) => setPromptId(e.target.value)}
            aria-label="Test prompt"
          >
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          <Button onClick={() => void startRun()} disabled={picked.length < 2 || busy}>
            {busy ? <CircleNotch size={13} className="animate-spin" aria-hidden /> : <Sword size={13} aria-hidden />}
            Start run ({picked.length})
          </Button>
          {picked.length < 2 ? (
            <span className="text-caption text-faint">pick at least 2 personas</span>
          ) : null}
        </div>
      </div>

      {/* Run aktif */}
      {active ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{active.promptLabel}</Chip>
            {active.status === "running" ? (
              <span className="flex items-center gap-1 text-caption text-dim">
                <CircleNotch size={12} className="animate-spin" aria-hidden /> waiting for
                answers ({active.entries.filter((e) => e.status === "done").length}/
                {active.entries.length})
              </span>
            ) : null}
            {revealed && active.correct != null ? (
              <Chip tone={active.gatePass ? "ok" : "warn"}>
                {`${active.correct}/${active.entries.filter((e) => e.status === "done").length} correct — ${Math.round((active.score ?? 0) * 100)}%`}
              </Chip>
            ) : null}
          </div>

          {active.entries.map((e) => (
            <article
              key={e.letter}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3"
            >
              <header className="flex flex-wrap items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: LETTER_TONE[e.letter] ?? "#616161" }}
                  aria-label={`Answer ${e.letter}`}
                >
                  {e.letter}
                </span>
                {e.status === "running" ? (
                  <span className="text-caption text-dim">writing…</span>
                ) : e.status === "failed" ? (
                  <Chip tone="danger">failed</Chip>
                ) : null}
                {/* hasil reveal */}
                {revealed && e.status === "done" && active?.guesses ? (
                  <span className="flex items-center gap-1 text-caption">
                    <b className={active.guesses[e.letter] === e.personaId ? "text-success" : "text-danger"}>
                      {active.guesses[e.letter] === e.personaId ? "correct" : "wrong"}
                    </b>
                    <span className="text-dim">— actually {personaName(e.personaId)}</span>
                  </span>
                ) : null}
              </header>
              {e.answer ? (
                <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-caption leading-5 text-primary">
                  {e.answer}
                </p>
              ) : e.error ? (
                <p className="text-caption text-danger">{e.error}</p>
              ) : null}
              {/* tebakan */}
              {e.status === "done" && !revealed ? (
                <label className="flex items-center gap-2 text-caption text-dim">
                  <EyeSlash size={13} aria-hidden /> your guess:
                  <Select
                    value={guesses[e.letter] ?? ""}
                    onChange={(ev) =>
                      setGuesses((g) => ({ ...g, [e.letter]: ev.target.value }))
                    }
                    aria-label={`Guess for answer ${e.letter}`}
                  >
                    <option value="">— pick —</option>
                    {picked.map((id) => (
                      <option key={id} value={id}>
                        {personaName(id)}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
            </article>
          ))}

          {active.status !== "running" && !revealed ? (
            <Button onClick={() => void submitGuesses()} disabled={!allGuessed || busy}>
              Submit guesses
            </Button>
          ) : null}
          {revealed && active.gatePass === false ? (
            <p className="text-caption text-warn">
              Below the 80% gate: these personas still answer too similarly.
              Iterate their PERSONA.md (voice, process, output format) and run
              again.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Riwayat */}
      {runs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <b className="text-caption uppercase tracking-wide text-faint">Runs</b>
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setActive(r);
                setGuesses(r.guesses ?? {});
              }}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-caption transition-colors ${
                active?.id === r.id ? "border-accent bg-accent-soft" : "border-line bg-inset hover:bg-surface"
              }`}
            >
              <span className="text-primary">
                {r.promptLabel} · {new Date(r.createdAt).toLocaleString()}
              </span>
              {r.score != null ? (
                <Chip tone={r.gatePass ? "ok" : "warn"}>
                  {`${Math.round(r.score * 100)}%${r.gatePass ? " · pass" : ""}`}
                </Chip>
              ) : (
                <Chip tone={r.status === "running" ? "accent" : "muted"}>{r.status}</Chip>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
