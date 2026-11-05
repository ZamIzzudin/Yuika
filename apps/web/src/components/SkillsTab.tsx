
"use client";
import { apiUrl } from "@/lib/api";
// Tab Skill (P1-MEM-3): pengalaman → draf skill → validasi user → siap pakai.
// Draf: agent usulkan via tool skill_propose; user edit bebas → Terima (lint +
// aktif, langsung terlihat agent via skills_list) atau Tolak (hapus).
// DS-1: ui/* + Tailwind semantik + Phosphor (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useState } from "react";
import { Check, CircleNotch, Eye, Flag, Info, PencilSimple, X } from "@phosphor-icons/react";
import { Button, Card, Field, TextArea, TextInput } from "./ui";
import { toastErr, toastOk } from "./ui/toast";

interface DraftRow {
  slug: string;
  name: string;
  description: string;
  body: string;
}
interface SkillRow {
  name: string;
  description: string;
  usage?: { views: number; patches: number; used: number };
  status?: "draft" | "tested" | "ready";
  personas?: string[];
  eval?: {
    verdict: "pending" | "pass" | "fail";
    reason: string | null;
    judgeSessionId: string;
    at: number;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  tested: "human-tested",
  ready: "ready",
  draft: "draft",
};

export function SkillsTab() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    name: string;
    description: string;
    body: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/skills"));
      if (r.ok) {
        const d = (await r.json()) as {
          drafts: DraftRow[];
          skills: SkillRow[];
        };
        setDrafts(d.drafts);
        setSkills(d.skills);
      }
    } catch {
      /* refresh berikutnya */
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Eval buta jalan async — polling 5 dtk agar statusnya hidup.
    const t = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(t);
  }, [refresh]);

  /** P1-DUN-3: eval buta skill tested — lulus → ready (polling 5 dtk mengambil hasil). */
  async function evalSkill(name: string) {
    try {
      const r = await fetch(apiUrl("/api/skills/eval"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: name }),
      });
      if (!r.ok)
        toastErr(((await r.json()) as { error?: string }).error ?? "failed to start the eval");
      await refresh();
    } catch {
      toastErr("could not reach the server");
    }
  }

  async function saveDraft(d: DraftRow) {
    if (!edit) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/api/skills"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: d.slug, ...edit }),
      });
      if (!r.ok)
        toastErr(((await r.json()) as { error?: string }).error ?? "failed to save");
      else setOpen(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(slug: string) {
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/api/skills"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!r.ok)
        toastErr(((await r.json()) as { error?: string }).error ?? "failed to accept");
      else toastOk(`Draft ${slug} accepted & attached to the related persona.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject(slug: string) {
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/skills?slug=${encodeURIComponent(slug)}`), {
        method: "DELETE",
      });
      if (!r.ok)
        toastErr(((await r.json()) as { error?: string }).error ?? "failed to delete");
      setOpen(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Skills — drafts and active" className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-md2 border border-line bg-inset px-3 py-2 text-caption leading-5 text-muted">
        <Info size={14} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <span>
          New skills are <b className="text-secondary">saved immediately &amp; usable by the agent</b> via
          <code className="font-mono"> skills_list</code>/<code className="font-mono">skill_view</code> — but they're only{" "}
          <b className="text-secondary">introduced into the prompt of NEW sessions</b> (the running session's prompt is frozen by
          design).
        </span>
      </p>
      {drafts.length === 0 ? (
        <p className="text-caption leading-5 text-dim">
          No drafts yet. Mention it in chat — e.g. &quot;make the way you just worked into a skill&quot; — or the agent
          proposes one itself after a flow proves successful.
        </p>
      ) : (
        drafts.map((d) => (
          <Card key={d.slug} className="flex flex-col gap-2.5">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-body font-semibold text-primary">
                {open === d.slug && edit ? edit.name : d.name}
              </b>
              <span className="flex gap-1.5">
                {open === d.slug ? (
                  <Button size="sm" onClick={() => void saveDraft(d)} disabled={busy}>
                    Save
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setOpen(d.slug);
                      setEdit({
                        name: d.name,
                        description: d.description,
                        body: d.body,
                      });
                    }}
                  >
                    Edit
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={() => void accept(d.slug)} disabled={busy} title="Validate & activate this skill">
                  Accept
                </Button>
                <Button size="sm" variant="danger" onClick={() => void reject(d.slug)} disabled={busy} title="Delete draft">
                  Reject
                </Button>
              </span>
            </header>
            {open === d.slug && edit ? (
              <div className="flex flex-col gap-2.5">
                <Field label="Skill name">
                  <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Skill name" />
                </Field>
                <Field label="When to use">
                  <TextInput
                    value={edit.description}
                    onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                    placeholder="When this skill should be used"
                  />
                </Field>
                <Field label="Body (markdown)">
                  <TextArea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={10} spellCheck={false} />
                </Field>
              </div>
            ) : (
              <>
                <small className="text-caption leading-5 text-muted">{d.description}</small>
                <pre className="overflow-x-auto rounded-md2 bg-inset px-3 py-2.5 font-mono text-[12.5px] leading-5 text-secondary">{d.body}</pre>
              </>
            )}
          </Card>
        ))
      )}

      <div className="flex flex-col gap-2">
        <b className="text-body font-semibold text-primary">Ready to use ({skills.length})</b>
        {skills.length === 0 ? (
          <p className="text-caption text-dim">No active skills yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {skills.map((s) => (
              <li key={s.name} className="flex flex-col gap-0.5 border-l-2 border-line pl-3">
                <b className="flex flex-wrap items-baseline gap-x-2 text-body font-semibold text-primary">
                  {s.name}
                  {s.usage && (
                    <small className="flex items-center gap-2 text-caption font-normal text-dim" title="views · edits · uses">
                      <span className="flex items-center gap-0.5">
                        <Eye size={11} aria-hidden /> {s.usage.views}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <PencilSimple size={11} aria-hidden /> {s.usage.patches}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Flag size={11} aria-hidden /> {s.usage.used}
                      </span>
                    </small>
                  )}
                </b>
                <small className="text-caption leading-5 text-muted">
                  {s.description}
                  {s.status && s.status !== "ready" && (
                    <span className="ml-1 inline-flex items-center gap-0.5 align-baseline text-warn" title="Lifecycle P1-DUN-2: draft → tested (reviewed) → ready (assignable)">
                      ·{" "}
                      {s.status === "tested" && <CircleNotch size={11} aria-hidden />} {STATUS_LABEL[s.status]}
                    </span>
                  )}
                  {s.personas && s.personas.length > 0 && (
                    <span className="ml-1 text-dim">· {s.personas.map((p) => p.replace("yui-", "")).join(", ")}</span>
                  )}
                </small>
                {(s.status === "tested" || s.eval) && (
                  <small
                    className={`flex flex-wrap items-center gap-1.5 text-caption leading-5 ${
                      s.eval?.verdict === "pass" ? "text-success" : s.eval?.verdict === "fail" ? "text-danger" : "text-muted"
                    }`}
                  >
                    {s.eval?.verdict === "pending" ? (
                      <>
                        <CircleNotch size={11} aria-hidden className="animate-pulse" /> evaluasi buta berjalan… (hakim sedang memeriksa bukti)
                      </>
                    ) : s.eval?.verdict === "pass" ? (
                      <>
                        <Check size={11} weight="bold" aria-hidden /> lulus eval buta
                        {s.eval.reason ? ` — ${s.eval.reason.slice(0, 120)}` : ""}
                      </>
                    ) : s.eval?.verdict === "fail" ? (
                      <>
                        <X size={11} weight="bold" aria-hidden /> belum lulus — {s.eval.reason?.slice(0, 160) ?? "tanpa alasan"}
                      </>
                    ) : (
                      "belum pernah dieval"
                    )}
                    {s.status === "tested" && s.eval?.verdict !== "pending" && (
                      <Button size="sm" onClick={() => void evalSkill(s.name)} disabled={busy}>
                        Eval buta
                      </Button>
                    )}
                  </small>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
