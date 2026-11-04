"use client";
// Tab Skill (P1-MEM-3): pengalaman → draf skill → validasi user → siap pakai.
// Draf: agent usulkan via tool skill_propose; user edit bebas → Terima (lint +
// aktif, langsung terlihat agent via skills_list) atau Tolak (hapus).
import { useCallback, useEffect, useState } from "react";

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
}
interface DungeonRow {
  mission: { id: string; title: string; persona: string; goal: string; resources: string[]; acceptance: string[]; targetSkill: { name: string; description: string } };
  runs: { id: string; status: "running" | "done" | "failed"; startedAt: number; endedAt: number | null; summary: string | null }[];
}

const STATUS_LABEL: Record<string, string> = { tested: "◐ diuji manusia", ready: "✓ siap", draft: "draf" };

export function SkillsTab() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [dungeons, setDungeons] = useState<DungeonRow[] | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; description: string; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/skills");
      if (r.ok) {
        const d = (await r.json()) as { drafts: DraftRow[]; skills: SkillRow[] };
        setDrafts(d.drafts);
        setSkills(d.skills);
      }
      const dr = await fetch("/api/dungeons");
      if (dr.ok) setDungeons(((await dr.json()) as { dungeons: DungeonRow[] }).dungeons);
    } catch {
      /* refresh berikutnya */
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Dungeon run jalan async — polling 5 dtk saat tab terbuka.
    const t = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(t);
  }, [refresh]);

  /** P1-DUN-1: jalankan misi — sesi sandbox persona, skill target diusulkan di akhir. */
  async function runMission(missionId: string) {
    setRunErr(null);
    try {
      const r = await fetch("/api/dungeons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      if (!r.ok) setRunErr((((await r.json()) as { error?: string }).error ?? "gagal menjalankan misi") + "");
      await refresh();
    } catch {
      setRunErr("gagal menghubungi server");
    }
  }

  async function saveDraft(d: DraftRow) {
    if (!edit) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/skills", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: d.slug, ...edit }),
      });
      if (!r.ok) setErr((((await r.json()) as { error?: string }).error ?? "gagal menyimpan") + "");
      else setOpen(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(slug: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!r.ok) setErr((((await r.json()) as { error?: string }).error ?? "gagal menerima") + "");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject(slug: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/skills?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!r.ok) setErr((((await r.json()) as { error?: string }).error ?? "gagal menghapus") + "");
      setOpen(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Skill — draf dan siap pakai">
      <p className="pane-hint">
        Skill = prosedur reusable yang dipelajari dari pengalaman. Agent mengusulkan draf lewat tool
        <code> skill_propose</code>; Anda validasi di sini. Yang diterima langsung bisa dipakai agent
        (<code>skills_list</code> → <code>skill_view</code>).
      </p>

      {drafts.length === 0 ? (
        <p className="dim">Belum ada draf. Sebut di chat — mis. &quot;jadikan skill cara kerja barusan&quot; — atau agent\n        mengusulkan sendiri setelah alur terbukti berhasil.</p>
      ) : (
        drafts.map((d) => (
          <div key={d.slug} className="memory-doc skill-draft">
            <header>
              <b>{open === d.slug && edit ? edit.name : d.name}</b>
              <span className="skill-actions">
                {open === d.slug ? (
                  <button className="btn" onClick={() => void saveDraft(d)} disabled={busy}>
                    Simpan
                  </button>
                ) : (
                  <button
                    className="btn"
                    onClick={() => {
                      setOpen(d.slug);
                      setEdit({ name: d.name, description: d.description, body: d.body });
                    }}
                  >
                    Edit
                  </button>
                )}
                <button className="btn" onClick={() => void accept(d.slug)} disabled={busy} title="Validasi & aktifkan skill ini">
                  Terima
                </button>
                <button className="btn secondary" onClick={() => void reject(d.slug)} disabled={busy} title="Hapus draf">
                  Tolak
                </button>
              </span>
            </header>
            {open === d.slug && edit ? (
              <>
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nama skill" />
                <input
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  placeholder="Kapan skill ini dipakai"
                />
                <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={10} spellCheck={false} />
              </>
            ) : (
              <>
                <small className="skill-desc">{d.description}</small>
                <pre className="skill-body">{d.body}</pre>
              </>
            )}
          </div>
        ))
      )}

      <div className="skill-active">
        <header className="project-head">
          <span className="project-title">Siap pakai ({skills.length})</span>
        </header>
        {skills.length === 0 ? (
          <p className="dim">Belum ada skill aktif.</p>
        ) : (
          <ul className="skill-list">
            {skills.map((s) => (
              <li key={s.name}>
                <b>
                  {s.name}
                  {s.usage && (
                    <small className="skill-usage" title="dilihat · diedit · dipakai">
                      👁 {s.usage.views} · ✎ {s.usage.patches} · ⚑ {s.usage.used}
                    </small>
                  )}
                </b>
                <small>
                  {s.description}
                  {s.status && s.status !== "ready" && (
                    <span className="skill-status" data-s={s.status} title="Lifecycle P1-DUN-2: draft → tested (direview) → ready (siap assign)">
                      {" "}· {STATUS_LABEL[s.status]}
                    </span>
                  )}
                  {s.personas && s.personas.length > 0 && <span className="skill-personas"> · {s.personas.map((p) => p.replace("yui-", "")).join(", ")}</span>}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dungeons !== null && dungeons.length > 0 && (
        <div className="dungeon-arena">
          <header className="project-head">
            <span className="project-title">Dungeon — arena latihan ({dungeons.length})</span>
          </header>
          <p className="pane-hint">
            Misi menjalankan persona di ruang sandbox terisolasi (<code>workspace/dungeons/</code>) — hasilnya skill draf lewat
            <code> skill_propose</code>. Terima drafnya di atas untuk melihatnya jadi <b>tested</b>.
          </p>
          {dungeons.map((d) => {
            const active = d.runs.find((r) => r.status === "running");
            const last = d.runs[d.runs.length - 1];
            return (
              <div key={d.mission.id} className="dungeon-mission">
                <div className="dungeon-head">
                  <b>{d.mission.title}</b>
                  <span className="dungeon-persona">{d.mission.persona.replace("yui-", "")}</span>
                  <button className="btn" disabled={Boolean(active)} onClick={() => void runMission(d.mission.id)}>
                    {active ? "berjalan…" : "Jalankan"}
                  </button>
                </div>
                <small className="dungeon-goal">{d.mission.goal.trim().split("\n")[0]}</small>
                {last && (
                  <small className="dungeon-run" data-s={last.status}>
                    {last.status === "running" ? "◐ berjalan" : last.status === "done" ? "✓ selesai" : "✕ gagal"}
                    {last.summary ? ` — ${last.summary.slice(0, 140)}` : ""}
                  </small>
                )}
              </div>
            );
          })}
          {runErr && <p className="project-err">{runErr}</p>}
        </div>
      )}
      {err && <p className="project-err">{err}</p>}
    </section>
  );
}
