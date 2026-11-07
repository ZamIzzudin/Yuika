"use client";
// Batch 16 (Home & Team Assembly): halaman HOME — landing pertama aplikasi.
// Tidak ada lagi workspace/freespace: semua sesi hidup di dalam project.
// - Typing headline: "Hello, Let's Build Something!" → hapus → "Hello, Wanna
//   Build Something?" (sekali jalan; prefers-reduced-motion → langsung final).
// - Kartu project (+ kartu Create di posisi pertama). Create = form modal.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectInfo } from "@yuika/contracts";
import { Plus } from "@phosphor-icons/react";
import { Button, Card, Field, Modal, TextInput } from "./ui";
import { Skeleton } from "./Skeleton";
import { toastErr } from "./ui/toast";
import { apiUrl, authFetch } from "@/lib/api";

const FIRST = "Hello, Wanna Build Something?";
const FINAL = "Hello, Let's Build Something!";

/** Typewriter sekali-jalan: ketik FIRST → jeda → hapus ke "Hello, " → ketik
 *  FINAL → berhenti (caret berkedip). Reduced-motion → FINAL langsung. */
function TypingHeadline() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<
    "typing" | "hold" | "deleting" | "retyping" | "done"
  >("typing");
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced.current) {
      setText(FINAL);
      setPhase("done");
      return;
    }
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const step = (p: typeof phase, i: number) => {
      if (!alive) return;
      if (p === "typing") {
        if (i <= FIRST.length) {
          setText(FIRST.slice(0, i));
          t = setTimeout(() => step("typing", i + 1), 42 + Math.random() * 46);
        } else {
          setPhase("hold");
          t = setTimeout(() => step("deleting", FIRST.length), 1_700);
        }
      } else if (p === "deleting") {
        if (i >= 7) {
          setText(FIRST.slice(0, i));
          t = setTimeout(
            () => step("deleting", i - 1),
            22 + Math.random() * 18,
          );
        } else {
          setPhase("retyping");
          t = setTimeout(() => step("retyping", 7), 500);
        }
      } else if (p === "retyping") {
        if (i <= FINAL.length) {
          setText(FINAL.slice(0, i));
          t = setTimeout(
            () => step("retyping", i + 1),
            46 + Math.random() * 50,
          );
        } else {
          setPhase("done");
        }
      }
    };
    step("typing", 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  return (
    <h1
      className="text-center text-[clamp(1.6rem,4.5vw,2.6rem)] font-semibold tracking-tight text-primary"
      aria-label={FINAL}
    >
      {text || "\u00A0"}
      <span
        className={`ml-1 inline-block h-[1em] w-[3px] translate-y-[0.12em] rounded-pill bg-accent ${
          phase === "done" ? "animate-pulse" : ""
        }`}
        aria-hidden
      />
    </h1>
  );
}

export function HomeView({
  projects,
  booted,
  onOpenProject,
  onCreated,
}: {
  projects: ProjectInfo[];
  booted: boolean;
  onOpenProject: (id: string) => void;
  /** Dipanggil setelah project baru dibuat (parent refresh daftar + buka). */
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const create = useCallback(async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await authFetch(apiUrl("/api/projects"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        project?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.project)
        throw new Error(body.error ?? `HTTP ${res.status}`);
      setName("");
      setDesc("");
      setOpen(false);
      onCreated(body.project.id);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [name, desc, busy, onCreated]);

  const cards = useMemo(
    () => projects.filter((p) => p.kind !== "dungeon"),
    [projects],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-10">
      <div className="mt-[6vh] mb-8 flex flex-col items-center gap-3 text-center">
        <TypingHeadline />
        <p className="max-w-[440px] text-body text-muted">
          Every conversation lives inside a project — pick one, or start
          something new.
        </p>
      </div>

      <div className="grid w-full max-w-[760px] grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {/* Kartu Create — selalu pertama; satu-satunya pintu bikin project. */}
        <button
          type="button"
          aria-label="New project"
          onClick={() => setOpen(true)}
          className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg2 border border-dashed border-line-strong bg-transparent text-dim transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-accent hover:bg-accent-soft hover:text-primary"
        >
          <Plus size={22} weight="bold" aria-hidden className="text-accent" />
          <span className="text-body">New project</span>
        </button>

        {!booted && cards.length === 0 && (
          <Card variant="inset" className="min-h-[120px] p-4">
            <Skeleton lines={3} />
          </Card>
        )}
        {booted && cards.length === 0 && (
          <p className="col-span-full px-2 py-6 text-center text-body text-dim">
            No projects yet — the card above is the only thing you need.
          </p>
        )}

        {cards.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpenProject(p.id)}
            className={`group flex min-h-[120px] cursor-pointer flex-col gap-2 rounded-lg2 border p-4 text-left transition-all ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
              p.status === "archived"
                ? "border-line bg-inset opacity-70"
                : "border-line bg-surface hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
            }`}
          >
            <span className="flex items-center gap-2">
              <i
                className={`h-[7px] w-[7px] shrink-0 rounded-pill ${p.status === "archived" ? "bg-line-strong" : "bg-accent"}`}
                aria-hidden
              />
              <b className="truncate text-body font-semibold text-primary">
                {p.name}
              </b>
            </span>
            <span className="line-clamp-3 text-caption text-muted">
              {p.description || "No description"}
            </span>
            <span className="mt-auto text-caption text-dim">
              {p.status === "archived" ? "archived · " : ""}
              {p.kind === "dungeon" ? "dungeon" : "project"}
            </span>
          </button>
        ))}
      </div>

      <Modal
        open={open}
        title="New project"
        onClose={() => !busy && setOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <TextInput
              autoFocus
              placeholder="Project Name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
            />
          </Field>
          <Field label="Description">
            <TextInput
              placeholder="Description (optional)"
              value={desc}
              maxLength={280}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
            />
          </Field>
          <div className="mt-1 flex justify-end gap-2">
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={create}
              disabled={!name.trim() || busy}
            >
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
