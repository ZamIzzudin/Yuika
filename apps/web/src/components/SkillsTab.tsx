"use client";
import { apiUrl, authFetch } from "@/lib/api";
// Config → Skills (P1-MEM-3, redesign D36): lifecycle draft → tested → ready.
// Draf: agent usulkan via tool skill_propose; user edit → Accept (aktif,
// terlihat agent via skills_list) atau Reject (hapus permanen).
// Skill tested bisa dijalankan ke EVAL BUTA (P1-DUN-3): lulus → ready.
// Semua copy UI ENGLISH (aturan proyek). D36: rata kartu surface p-4 ala
// page Config lain; bahasa campur & list border-left lama dibuang total.
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CircleNotch,
  Eye,
  Flag,
  Info,
  PencilSimple,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  Field,
  TextArea,
  TextInput,
} from "./ui";
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
const STATUS_TONE: Record<string, "ok" | "warn" | "muted"> = {
  ready: "ok",
  tested: "warn",
  draft: "muted",
};

export function SkillsTab() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  // Popup konfirmasi reject (draf terhapus permanen, dulu langsung delete).
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    name: string;
    description: string;
    body: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/api/skills"));
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
    // Eval buta jalan async, polling 5 dtk agar statusnya hidup.
    const t = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(t);
  }, [refresh]);

  /** P1-DUN-3: eval buta skill tested, lulus → ready (polling 5 dtk mengambil hasil). */
  async function evalSkill(name: string) {
    try {
      const r = await authFetch(apiUrl("/api/skills/eval"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: name }),
      });
      if (!r.ok)
        toastErr(
          ((await r.json()) as { error?: string }).error ??
            "failed to start the eval",
        );
      await refresh();
    } catch {
      toastErr("could not reach the server");
    }
  }

  async function saveDraft(d: DraftRow) {
    if (!edit) return;
    setBusy(true);
    try {
      const r = await authFetch(apiUrl("/api/skills"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: d.slug, ...edit }),
      });
      if (!r.ok)
        toastErr(
          ((await r.json()) as { error?: string }).error ?? "failed to save",
        );
      else setOpen(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(slug: string) {
    setBusy(true);
    try {
      const r = await authFetch(apiUrl("/api/skills"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!r.ok)
        toastErr(
          ((await r.json()) as { error?: string }).error ?? "failed to accept",
        );
      else toastOk(`Draft ${slug} accepted & attached to the related persona.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject(slug: string) {
    setBusy(true);
    try {
      const r = await authFetch(
        apiUrl(`/api/skills?slug=${encodeURIComponent(slug)}`),
        {
          method: "DELETE",
        },
      );
      if (!r.ok)
        toastErr(
          ((await r.json()) as { error?: string }).error ?? "failed to delete",
        );
      setOpen(null);
      setConfirmSlug(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Skills, drafts and active"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <b className="text-body font-semibold text-primary">Skills</b>
        <p className="text-caption leading-5 text-dim">
          Reusable ways of working the personas earn from experience. Drafts
          arrive from chat, you edit and accept them, and every accepted skill
          joins the prompt of new sessions.
        </p>
      </header>

      <p className="flex items-start gap-2 rounded-lg2 border border-line bg-surface px-3 py-2.5 text-caption leading-5 text-muted">
        <Info size={14} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <span>
          New skills are{" "}
          <b className="text-secondary">
            saved immediately &amp; usable by the agent
          </b>{" "}
          via
          <code className="font-mono"> skills_list</code>/
          <code className="font-mono">skill_view</code>, but they&apos;re only{" "}
          <b className="text-secondary">
            introduced into the prompt of NEW sessions
          </b>
        </span>
      </p>

      {/* ── Draf diusulkan agent ── */}
      <div className="flex flex-col gap-2">
        <small className="text-caption font-semibold uppercase tracking-wide text-dim">
          Proposed drafts ({drafts.length})
        </small>
        {drafts.length === 0 ? (
          <Card className="p-4 text-caption leading-5 text-dim">
            No drafts yet. Mention it in chat, e.g. &quot;make the way you just
            worked into a skill&quot;, or the agent proposes one itself after a
            flow proves successful.
          </Card>
        ) : (
          drafts.map((d) => (
            <Card key={d.slug} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Sparkle
                    size={18}
                    aria-hidden
                    className="shrink-0 text-accent"
                  />
                  <b className="min-w-0 truncate text-body font-semibold text-primary">
                    {open === d.slug && edit ? edit.name : d.name}
                  </b>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {open === d.slug ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void saveDraft(d)}
                        disabled={busy}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpen(null)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
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
                  <Button
                    size="sm"
                    onClick={() => void accept(d.slug)}
                    disabled={busy}
                    title="Validate & activate this skill"
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setConfirmSlug(d.slug)}
                    disabled={busy}
                    title="Delete draft"
                  >
                    Reject
                  </Button>
                </div>
              </div>

              {open === d.slug && edit ? (
                <div className="flex flex-col gap-2.5">
                  <Field label="Skill name">
                    <TextInput
                      value={edit.name}
                      onChange={(e) =>
                        setEdit({ ...edit, name: e.target.value })
                      }
                      placeholder="Skill name"
                    />
                  </Field>
                  <Field label="When to use">
                    <TextInput
                      value={edit.description}
                      onChange={(e) =>
                        setEdit({ ...edit, description: e.target.value })
                      }
                      placeholder="When this skill should be used"
                    />
                  </Field>
                  <Field label="Body (markdown)">
                    <TextArea
                      value={edit.body}
                      onChange={(e) =>
                        setEdit({ ...edit, body: e.target.value })
                      }
                      rows={10}
                      spellCheck={false}
                      className="font-mono"
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <p className="text-caption leading-5 text-muted">
                    {d.description}
                  </p>
                  <pre className="max-h-56 overflow-auto rounded-md2 bg-inset p-3 font-mono text-[12.5px] leading-5 whitespace-pre-wrap text-secondary">
                    {d.body}
                  </pre>
                </>
              )}
            </Card>
          ))
        )}
      </div>

      {/* ── Library skill aktif ── */}
      <div className="flex flex-col gap-2">
        <small className="text-caption font-semibold uppercase tracking-wide text-dim">
          Library ({skills.length})
        </small>
        {skills.length === 0 ? (
          <Card className="p-4 text-caption leading-5 text-dim">
            No active skills yet. Accept a draft to start the library.
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5 pb-8">
            {skills.map((s) => (
              <Card key={s.name} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <b className="min-w-0 truncate text-body font-semibold text-primary capitalize">
                      {s.name.replaceAll("-", " ")}
                    </b>
                    {s.status && (
                      <Chip size="sm" tone={STATUS_TONE[s.status] ?? "muted"}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Chip>
                    )}
                  </div>
                  {s.usage && (
                    <small
                      className="flex items-center gap-2.5 text-caption text-dim"
                      title="views · edits · uses"
                    >
                      <span className="flex items-center gap-1">
                        <Eye size={12} aria-hidden /> {s.usage.views}
                      </span>
                      <span className="flex items-center gap-1">
                        <PencilSimple size={12} aria-hidden /> {s.usage.patches}
                      </span>
                      <span className="flex items-center gap-1">
                        <Flag size={12} aria-hidden /> {s.usage.used}
                      </span>
                    </small>
                  )}
                </div>
                <p className="text-caption leading-5 text-muted">
                  {s.description}
                </p>
                {s.personas && s.personas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.personas.map((p) => (
                      <span
                        key={p}
                        className="rounded-pill border border-line bg-inset px-2 py-0.5 font-mono text-caption text-secondary"
                      >
                        {p.replace("yui-", "")}
                      </span>
                    ))}
                  </div>
                )}
                {(s.status === "tested" || s.eval) && (
                  <div className="flex flex-wrap items-center gap-2 text-caption leading-5">
                    {s.eval?.verdict === "pending" ? (
                      <span className="flex items-center gap-1.5 text-muted">
                        <CircleNotch
                          size={12}
                          aria-hidden
                          className="animate-spin"
                        />
                        Blind eval running, the judge is checking the evidence…
                      </span>
                    ) : s.eval?.verdict === "pass" ? (
                      <span className="flex items-center gap-1.5 text-success">
                        <Check size={12} weight="bold" aria-hidden />
                        Passed the blind eval
                        {s.eval.reason
                          ? `, ${s.eval.reason.slice(0, 120)}`
                          : ""}
                      </span>
                    ) : s.eval?.verdict === "fail" ? (
                      <span className="flex items-center gap-1.5 text-danger">
                        <X size={12} weight="bold" aria-hidden />
                        Not passing,{" "}
                        {s.eval.reason?.slice(0, 160) ?? "no reason given"}
                      </span>
                    ) : (
                      <span className="text-muted">
                        Never evaluated by the blind judge yet.
                      </span>
                    )}
                    {s.status === "tested" && s.eval?.verdict !== "pending" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void evalSkill(s.name)}
                        disabled={busy}
                        title="P1-DUN-3: a judge persona runs the skill blind; pass → ready"
                      >
                        Run blind eval
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Popup konfirmasi reject (hapus draf skill permanen) */}
      <ConfirmDialog
        open={confirmSlug !== null}
        title="Delete skill draft"
        message={
          confirmSlug && (
            <>
              Permanently delete the draft{" "}
              <b>
                “
                {drafts.find((x) => x.slug === confirmSlug)?.name ??
                  confirmSlug}
                ”
              </b>
              ? It cannot be accepted afterwards, the agent can always
              re-propose it from a later session.
            </>
          )
        }
        confirmLabel="Delete draft"
        busy={busy}
        busyLabel="Deleting…"
        onConfirm={() => confirmSlug && void reject(confirmSlug)}
        onClose={() => setConfirmSlug(null)}
      />
    </section>
  );
}
