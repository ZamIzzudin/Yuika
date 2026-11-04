"use client";
// Dungeon — ARENA LATIHAN PERSONA (P1-DUN-4, halaman terpisah).
// Alur "mengajar manusia": pilih persona → tentukan skill target → mode
// (riset mandiri / bahan ajar file yang diunggah) → persona belajar di
// sandbox → skill draf (skill_propose) → validasi + eval buta di tab Skill.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaInfo } from "@yui/contracts";
import { PersonaFace } from "./PersonaPicker";
import { Skeleton } from "./Skeleton";

interface DungeonRow {
  mission: {
    id: string;
    title: string;
    persona: string;
    goal: string;
    resources: string[];
    acceptance: string[];
    targetSkill: { name: string; description: string };
    origin: "seed" | "user";
  };
  runs: { id: string; status: "running" | "done" | "failed"; startedAt: number; endedAt: number | null; summary: string | null; sessionId: string | null; projectId: string }[];
}

const DEFAULT_ACC: Record<"research" | "documents", string[]> = {
  research: [
    "Ringkasan akurat dari sumber terpercaya (sebutkan sumbernya)",
    "Prosedur praktis & langkah konkrit — bukan teori umum",
    "Skill bisa diikuti agent lain tanpa membaca ulang sumber",
  ],
  documents: [
    "Semua materi di folder misi tercermin dalam skill (tidak ada yang hilang)",
    "Rangkuman setia pada isi materi — tidak menambah klaim dari luar",
    "Skill bisa diikuti agent lain tanpa membaca materi asli",
  ],
};

export function DungeonView({ personas, onBack, onOpenProject }: { personas: PersonaInfo[]; onBack: () => void; onOpenProject?: (projectId: string) => void }) {
  const [dungeons, setDungeons] = useState<DungeonRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadFor = useRef<string | null>(null);
  // Fix dev-10 (user): sesi latihan TIDAK lagi tampil sebagai card project (scope
  // beda) — daftar semua run latihan bisa dibuka dari sini (tab Riwayat).
  const [view, setView] = useState<"misi" | "riwayat">("misi");
  const [formOpen, setFormOpen] = useState(false);

  // ---- form buat latihan ----
  const [mode, setMode] = useState<"research" | "documents">("research");
  const [personaId, setPersonaId] = useState("");
  const [skillName, setSkillName] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [resourcesText, setResourcesText] = useState("");
  const [accText, setAccText] = useState(DEFAULT_ACC.research.join("\n"));
  const [accDirty, setAccDirty] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/dungeons");
      if (r.ok) setDungeons(((await r.json()) as { dungeons: DungeonRow[] }).dungeons);
    } catch {
      /* refresh berikutnya */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5_000); // progress run live
    return () => clearInterval(t);
  }, [refresh]);

  function switchMode(next: "research" | "documents") {
    setMode(next);
    if (!accDirty) setAccText(DEFAULT_ACC[next].join("\n"));
  }

  async function create() {
    setErr(null);
    setBusy(true);
    try {
      const fallbackGoal =
        mode === "research"
          ? `Pelajari "${skillName}" dari sumber terpercaya dan susun jadi prosedur praktis yang bisa diikuti.`
          : `Pelajari semua bahan ajar di folder misi ini sampai paham, lalu rangkum menjadi skill "${skillName}".`;
      const r = await fetch("/api/dungeons/mission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personaId,
          title: title.trim() || `Latih ${skillName.trim()}`,
          goal: goal.trim() || fallbackGoal,
          skillName: skillName.trim(),
          skillDescription: skillDesc.trim(),
          mode,
          resources: mode === "research" ? resourcesText.split("\n").map((s) => s.trim()).filter(Boolean) : [],
          acceptance: accText.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) {
        setErr((((await r.json()) as { error?: string }).error ?? "gagal membuat latihan") + "");
        return;
      }
      // reset form ringan
      setSkillName("");
      setSkillDesc("");
      setTitle("");
      setGoal("");
      setResourcesText("");
      setAccDirty(false);
      setAccText(DEFAULT_ACC[mode].join("\n"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function run(missionId: string) {
    setErr(null);
    try {
      const r = await fetch("/api/dungeons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      if (!r.ok) setErr((((await r.json()) as { error?: string }).error ?? "gagal menjalankan misi") + "");
      await refresh();
    } catch {
      setErr("gagal menghubungi server");
    }
  }

  /** Unggah bahan ajar (multi-file) → <dungeon>/materials/ + jadi sumber misi. */
  async function upload(slug: string, files: FileList) {
    setUploading(slug);
    setErr(null);
    try {
      for (const f of Array.from(files)) {
        const r = await fetch(`/api/dungeons/${encodeURIComponent(slug)}/materials?name=${encodeURIComponent(f.name)}`, {
          method: "POST",
          body: await f.arrayBuffer(),
        });
        if (!r.ok) {
          setErr((((await r.json()) as { error?: string }).error ?? "gagal mengunggah") + ` (${f.name})`);
          break;
        }
      }
      await refresh();
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(slug: string) {
    setErr(null);
    try {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!r.ok) setErr((((await r.json()) as { error?: string }).error ?? "gagal menghapus latihan") + "");
      await refresh();
    } finally {
      /* void */
    }
  }

  const persona = personas.find((p) => p.id === personaId);
  const canCreate = personaId && skillName.trim().length >= 3 && skillDesc.trim().length >= 10 && !busy;
  const userMissions = dungeons?.filter((d) => d.mission.origin === "user") ?? [];
  const seedMissions = dungeons?.filter((d) => d.mission.origin !== "user") ?? [];

  const card = (d: DungeonRow) => {
    const active = d.runs.find((r) => r.status === "running");
    const last = d.runs[d.runs.length - 1];
    const materials = d.mission.resources.filter((r) => r.startsWith("materials/"));
    return (
      <div key={d.mission.id} className="dungeon-mission">
        <div className="dungeon-head">
          <PersonaFace personaId={d.mission.persona} size={28} />
          <div className="dungeon-title">
            <b>{d.mission.title}</b>
            <small className="dim">
              skill: <code>{d.mission.targetSkill.name}</code> · persona {d.mission.persona.replace("yui-", "")}
            </small>
          </div>
          <button className="btn" disabled={Boolean(active)} onClick={() => void run(d.mission.id)}>
            {active ? "berjalan…" : "Jalankan"}
          </button>
        </div>
        <small className="dungeon-goal">{d.mission.goal.trim().split("\n")[0]}</small>
        {materials.length > 0 && (
          <div className="dungeon-materials">
            {materials.map((m) => (
              <code key={m}>{m}</code>
            ))}
          </div>
        )}
        {last && (
          <small className="dungeon-run" data-s={last.status}>
            {last.status === "running" ? "◐ berjalan" : last.status === "done" ? "✓ selesai" : "✕ gagal"}
            {last.summary ? ` — ${last.summary.slice(0, 160)}` : ""}
          </small>
        )}
        <div className="dungeon-actions">
          <button
            className="btn secondary"
            disabled={uploading === d.mission.id}
            onClick={() => {
              uploadFor.current = d.mission.id;
              fileRef.current?.click();
            }}
          >
            {uploading === d.mission.id ? "mengunggah…" : "⬆ Bahan ajar"}
          </button>
          {d.mission.origin === "user" && (
            <button className="btn secondary" onClick={() => void remove(d.mission.id)} title="Hapus latihan ini">
              🗑
            </button>
          )}
        </div>
      </div>
    );
  };

  const allRuns =
    dungeons
      ?.flatMap((d) => d.runs.map((r) => ({ ...r, title: d.mission.title, persona: d.mission.persona })))
      .sort((a, b) => b.startedAt - a.startedAt) ?? [];

  return (
    <section className="dungeon-page" aria-label="Dungeon — arena latihan persona">
      <header className="dungeon-hero">
        <button className="btn secondary" onClick={onBack}>
          ← Workspace
        </button>
        <h1>⚔ Dungeon — arena latihan persona</h1>
        <p className="dim">
          Ajari persona keterampilan baru layaknya mengajar orang: beri topik riset atau unggah bahan ajar →
          persona belajar di sandbox → menghasilkan <b>skill</b> yang ia kuasai (draf → Anda terima → eval buta → siap
          di-assign ke project).
        </p>
        <div className="dungeon-tabs" role="tablist">
          <button role="tab" aria-selected={view === "misi"} data-active={view === "misi" ? "" : undefined} onClick={() => setView("misi")}>
            Misi
          </button>
          <button role="tab" aria-selected={view === "riwayat"} data-active={view === "riwayat" ? "" : undefined} onClick={() => setView("riwayat")}>
            Riwayat sesi latihan ({allRuns.length})
          </button>
        </div>
      </header>

      {view === "riwayat" ? (
        <div className="dungeon-history">
          {allRuns.length === 0 ? (
            <p className="dim">Belum ada sesi latihan — jalankan misi dulu.</p>
          ) : (
            allRuns.map((r) => (
              <div key={r.id} className="dungeon-history-row">
                <PersonaFace personaId={r.persona} size={24} />
                <div className="dh-main">
                  <b>{r.title}</b>
                  <small className="dim">
                    {new Date(r.startedAt).toLocaleString("id-ID")} ·{" "}
                    {r.status === "running" ? "◐ berjalan" : r.status === "done" ? "✓ selesai" : "✕ gagal"}
                    {r.summary ? ` — ${r.summary.slice(0, 140)}` : ""}
                  </small>
                </div>
                <button
                  className="btn secondary"
                  disabled={!onOpenProject}
                  onClick={() => onOpenProject?.(r.projectId)}
                  title="Buka ruangan latihan (chat + artefak sesi ini)"
                >
                  Buka sesi →
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
      <div className="dungeon-create-actions">
        <button className="btn" onClick={() => setFormOpen(true)}>
          + Buat latihan baru
        </button>
        <small className="dim">Form lengkap (mode, persona, skill, kriteria lulus) kini popup modal — daftar misi tetap terlihat.</small>
      </div>
      {formOpen && (
      <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && setFormOpen(false)} role="dialog" aria-modal>
        <div className="dungeon-form-modal">
          <div className="settings-head">
            <b>⚔ Buat latihan baru</b>
            <button className="settings-close" onClick={() => setFormOpen(false)} aria-label="Tutup">✕</button>
          </div>
          <div className="dungeon-form-body">
      <div className="dungeon-create">
        <span className="field-title">Buat latihan baru</span>
        <div className="dungeon-mode" role="tablist">
          <button role="tab" aria-selected={mode === "research"} data-active={mode === "research" ? "" : undefined} onClick={() => switchMode("research")}>
            🔍 Riset mandiri
          </button>
          <button role="tab" aria-selected={mode === "documents"} data-active={mode === "documents" ? "" : undefined} onClick={() => switchMode("documents")}>
            📚 Bahan ajar (file)
          </button>
        </div>
        <small className="dim">
          {mode === "research"
            ? "Persona mencari & mempelajari topik sendiri (boleh diberi URL awal)."
            : "Anda unggah file (pdf/xlsx/csv/md/…) → persona mempelajarinya lalu merangkum jadi skill. Unggah setelah latihan dibuat."}
        </small>

        <div className="dungeon-form">
          <label className="dungeon-persona-pick">
            Persona yang dilatih
            <span className="dungeon-persona-row">
              {persona && <PersonaFace personaId={persona.id} size={32} />}
              <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} aria-label="Persona">
                <option value="">Pilih persona…</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label>
            Nama skill target
            <input value={skillName} placeholder="mis. phaser-basics" spellCheck={false} onChange={(e) => setSkillName(e.target.value)} />
          </label>
          <label>
            Kapan skill ini dipakai (deskripsi)
            <input
              value={skillDesc}
              placeholder="mis. Dasar Phaser 3 untuk memulai game 2D"
              onChange={(e) => setSkillDesc(e.target.value)}
            />
          </label>
          <label>
            Judul latihan (opsional)
            <input value={title} placeholder={`otomatis: Latih ${skillName || "…"}`} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="dungeon-full">
            Tujuan belajar / instruksi khusus (opsional)
            <textarea value={goal} rows={2} placeholder="kosong = default sesuai mode" onChange={(e) => setGoal(e.target.value)} />
          </label>
          {mode === "research" && (
            <label className="dungeon-full">
              Sumber awal — URL, satu per baris (opsional)
              <textarea value={resourcesText} rows={2} spellCheck={false} placeholder="https://…" onChange={(e) => setResourcesText(e.target.value)} />
            </label>
          )}
          <label className="dungeon-full">
            Kriteria lulus — satu per baris (dipakai eval buta nanti)
            <textarea value={accText} rows={3} spellCheck={false} onChange={(e) => { setAccText(e.target.value); setAccDirty(true); }} />
          </label>
          <div className="dungeon-full dungeon-submit">
            <button className="btn primary" disabled={!canCreate} onClick={() => void create()}>
              {busy ? "membuat…" : mode === "research" ? "Buat & latih" : "Buat latihan (lalu unggah bahan)"}
            </button>
          </div>
        </div>
        {err && <p className="project-err">{err}</p>}
          </div>
          </div>
        </div>
      </div>
      )}

      {dungeons === null ? (
        <Skeleton lines={4} />
      ) : (
        <>
          <div className="dungeon-list">
            <span className="field-title">Latihan Anda ({userMissions.length})</span>
            {userMissions.length === 0 ? (
              <p className="dim">Belum ada — buat lewat form di atas.</p>
            ) : (
              userMissions.map(card)
            )}
          </div>
          <div className="dungeon-list">
            <span className="field-title">Latihan bawaan ({seedMissions.length})</span>
            {seedMissions.map(card)}
          </div>
          <p className="dim dungeon-note">
            Selesai latihan → skill muncul sebagai <b>draf</b> di tab Skill project (Terima → “diuji manusia” →
            <b> Eval buta</b> → ✓ siap). Persona tanpa skill fase ditandai ✕ di tab Roster — latih di sini.
          </p>
        </>
      )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const slug = uploadFor.current;
          if (slug && e.target.files?.length) void upload(slug, e.target.files);
        }}
      />
    </section>
  );
}
