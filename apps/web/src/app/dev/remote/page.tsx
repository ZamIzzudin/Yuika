"use client";
// P1-PRT-4 — /dev/remote: BUKTI E2E remote control via relay (browser kedua
// sebagai device remote SEJATI: kunci dibuat di browser via WebCrypto,
// envelope seal/open lokal; API host hanya mem-proxy CLAIM — tidak pernah
// melihat private key remote maupun isi envelope).
//
// Alur: Pair (token portal) → Connect relay → pilih host → Join → kirim
// prompt, lihat streaming delta, approve dari jauh; host offline → status
// sticky; reconnect → resume via subscribe{sinceSeq}.
//
// Query params (dipakai e2e): ?portal=&relay=&token=&name=&auto=1
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, Card, Field, TextInput } from "@/components/ui";
import { toastErr } from "@/components/ui/toast";
import { generateDeviceKeys, open as webOpen, seal as webSeal, signChallenge as webSign } from "@yuika/crypto/web";
import { RelayClient, RelayRemote, newRid, type HostEntry } from "@yuika/relay-client";
import type { RemoteEvent } from "@yuika/contracts";

const LS_KEY = "yuika.devremote.device";
const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);

interface StoredDevice {
  deviceId: string;
  accountId: string;
  signPriv: string;
  signPub: string;
  dhPriv: string;
  dhPub: string;
}

type Phase = "pair" | "idle" | "connecting" | "joined";

interface Msg { role: "user" | "assistant" | "tool"; text: string }
interface Approval { approvalId: string; title: string; summary: string; risk: string; resolved?: string }
interface ScreenInfo { key: string; personaId: string; url: string; title: string; status: string; viewers: number; watchers: number }

export default function DevRemotePage() {
  const [phase, setPhase] = useState<Phase>("pair");
  const [portalUrl, setPortalUrl] = useState(q.get("portal") ?? "http://localhost:3100");
  const [relayUrl, setRelayUrl] = useState(q.get("relay") ?? "ws://localhost:3101");
  const [token, setToken] = useState(q.get("token") ?? "");
  const [deviceName, setDeviceName] = useState(q.get("name") ?? "Dev remote");
  const [device, setDevice] = useState<StoredDevice | null>(null);
  const [hosts, setHosts] = useState<HostEntry[]>([]);
  const [hostState, setHostState] = useState<string>("idle");
  const [sessions, setSessions] = useState<Array<{ sessionId: string; title: string; personaId: string; updatedAt: number }>>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [personaId, setPersonaId] = useState("yui-coder");
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([]);
  // SCR-7: remote watch live screen (~1fps JPEG via relay)
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [watchKey, setWatchKey] = useState<string | null>(null);
  const [frame, setFrame] = useState<{ data: string; width: number; height: number } | null>(null);

  const clientRef = useRef<RelayClient | null>(null);
  const remoteRef = useRef<RelayRemote | null>(null);
  const deviceRef = useRef<StoredDevice | null>(null);
  const activeRef = useRef<string | null>(null);
  const watchKeyRef = useRef<string | null>(null);
  const seqRef = useRef<Map<string, number>>(new Map());
  const subscribedRef = useRef<boolean>(false);

  const addLog = useCallback((s: string) => {
    setLog((l) => [...l.slice(-80), `${new Date().toLocaleTimeString()} ${s}`]);
  }, []);

  useEffect(() => {
    deviceRef.current = device;
    activeRef.current = activeSession;
    watchKeyRef.current = watchKey;
  }, [device, activeSession, watchKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const d = JSON.parse(raw) as StoredDevice;
        setDevice(d);
        deviceRef.current = d;
        setPhase("idle");
      }
    } catch {
      /* storage kotor → pair ulang */
    }
    void (async () => {
      try {
        const res = await authFetch(apiUrl("/api/personas"));
        if (res.ok) {
          const list = (await res.json()) as unknown;
          const arr = (Array.isArray(list) ? list : ((list as { personas?: unknown[] }).personas ?? [])) as Array<{ id: string; name: string }>;
          setPersonas(arr.map((p) => ({ id: p.id, name: p.name })));
        }
      } catch {
        /* opsional */
      }
    })();
  }, []);

  const onEvent = useCallback((ev: RemoteEvent) => {
    switch (ev.ev) {
      case "host.state":
        setSessions(ev.sessions);
        if (ev.screens) setScreens(ev.screens);
        break;
      case "session.list":
        setSessions(ev.sessions);
        break;
      case "screen.state":
        addLog(`screen ${ev.status}: ${ev.title || ev.url} (viewers ${ev.viewers} · QA ${ev.watchers})`);
        if (ev.rid) {
          // reply watch_screen/unwatch_screen → tampilkan/hentikan viewer
          if (watchKeyRef.current && watchKeyRef.current !== ev.key) break;
          setWatchKey((k) => (k === ev.key && ev.status === "stopped" ? null : k));
        }
        setScreens((ss) => {
          const i = ss.findIndex((x) => x.key === ev.key);
          const next = { key: ev.key, personaId: ev.key.split("/")[1] ?? "", url: ev.url, title: ev.title, status: ev.status, viewers: ev.viewers, watchers: ev.watchers };
          if (i === -1) return ev.status === "stopped" ? ss : [...ss, next];
          const cp = [...ss];
          if (ev.status === "stopped") cp.splice(i, 1);
          else cp[i] = next;
          return cp;
        });
        break;
      case "screen.frame":
        if (ev.key === watchKeyRef.current) setFrame({ data: ev.data, width: ev.width, height: ev.height });
        break;
      case "session.snapshot": {
        if (ev.rid) {
          // reply send_prompt sesi BARU → adopsi sessionId asli host.
          if (activeRef.current === "pending") {
            activeRef.current = ev.sessionId;
            setActiveSession(ev.sessionId);
            seqRef.current.set(ev.sessionId, ev.latestSeq);
          }
          break;
        }
        setMsgs(ev.messages.map((m) => ({ role: m.role, text: m.text })));
        seqRef.current.set(ev.sessionId, Math.max(seqRef.current.get(ev.sessionId) ?? 0, ev.latestSeq));
        break;
      }
      case "message.delta": {
        if (ev.sessionId !== activeRef.current) break;
        seqRef.current.set(ev.sessionId, ev.seq);
        setMsgs((ms) => {
          const next = [...ms];
          const last = next[next.length - 1];
          if (last?.role === "assistant") next[next.length - 1] = { ...last, text: last.text + ev.delta };
          else next.push({ role: "assistant", text: ev.delta });
          return next;
        });
        break;
      }
      case "message.done": {
        seqRef.current.set(ev.sessionId, ev.seq);
        addLog(`message.done (${ev.finish}) seq=${ev.seq}`);
        break;
      }
      case "approval.request":
        setApprovals((a) => [...a, { approvalId: ev.approvalId, title: ev.title, summary: ev.summary, risk: ev.risk }]);
        break;
      case "approval.resolved":
        setApprovals((a) => a.map((x) => (x.approvalId === ev.approvalId ? { ...x, resolved: ev.resolution } : x)));
        break;
      case "delegation.update":
        addLog(`delegation ${ev.state}: ${ev.jobId}${ev.detail ? ` — ${ev.detail}` : ""}`);
        break;
      case "error":
        addLog(`error ${ev.code}: ${ev.message}`);
        toastErr(`${ev.code}: ${ev.message}`);
        break;
      default:
        break;
    }
  }, [addLog]);

  // ── pair (kunci dibuat DI BROWSER) ─────────────────────────────────────
  const pair = useCallback(async () => {
    try {
      const keys = await generateDeviceKeys();
      const res = await authFetch(apiUrl("/api/remote-dev/claim"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          portalUrl: portalUrl.trim(),
          token: token.trim(),
          kind: "web",
          name: deviceName.trim() || "Dev remote",
          signPub: keys.signPub,
          dhPub: keys.dhPub,
        }),
      });
      const body = (await res.json()) as { error?: string; deviceId?: string; accountId?: string };
      if (!res.ok || !body.deviceId || !body.accountId) {
        toastErr(body.error ?? "claim failed");
        return;
      }
      const d: StoredDevice = {
        deviceId: body.deviceId, accountId: body.accountId,
        signPriv: keys.signPriv, signPub: keys.signPub,
        dhPriv: keys.dhPriv, dhPub: keys.dhPub,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(d));
      setDevice(d);
      deviceRef.current = d;
      setPhase("idle");
      addLog(`paired as ${d.deviceId} (account ${d.accountId})`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "pair failed");
    }
  }, [portalUrl, token, deviceName, addLog]);

  // ── connect + pilih host + join ────────────────────────────────────────
  const connect = useCallback(async () => {
    const d = deviceRef.current;
    if (!d) return;
    setPhase("connecting");
    const client = new RelayClient({
      url: relayUrl.trim(),
      deviceId: d.deviceId,
      signPriv: d.signPriv,
      crypto: {
        signChallenge: webSign,
        seal: (f, t, pt) => webSeal(f, t, pt),
        open: (t, f, b) => webOpen(t, f, b),
      },
      socketFactory: (url) => new WebSocket(url) as unknown as import("@yuika/relay-client").WsLike,
      log: (...a) => addLog(a.map(String).join(" ")),
    });
    clientRef.current = client;
    const remote = new RelayRemote({
      client,
      deviceId: d.deviceId,
      dhPriv: d.dhPriv,
      dhPub: d.dhPub,
      onEvent,
      onHostState: (s) => {
        setHostState(s);
        addLog(`host state: ${s}`);
        // reconnect/rejoin → langganan ulang resume (seq terakhir tersimpan)
        if (s === "joined" && subscribedRef.current && activeRef.current) {
          const since = Object.fromEntries(seqRef.current);
          void remote.sendAction({ proto: 1, act: "subscribe", rid: newRid(), sessions: [activeRef.current], sinceSeq: since });
        }
      },
    });
    remoteRef.current = remote;
    try {
      await client.connect();
      addLog(`authed (account ${client.accountId})`);
      const list = await remote.listHosts();
      setHosts(list);
      addLog(`hosts online: ${list.map((h) => h.name).join(", ") || "none"}`);
      const target = list[0];
      if (target) {
        await remote.join(target.deviceId);
        setPhase("joined");
        subscribedRef.current = true;
        void remote.sendAction({ proto: 1, act: "list_sessions", rid: newRid() });
      } else {
        setPhase("idle");
        toastErr("no host online for this account");
      }
    } catch (e) {
      setPhase("idle");
      toastErr(e instanceof Error ? e.message : "connect failed");
    }
  }, [relayUrl, onEvent, addLog]);

  const joinHost = useCallback(async (hostId: string) => {
    const remote = remoteRef.current;
    if (!remote) return;
    await remote.join(hostId);
    setPhase("joined");
    subscribedRef.current = true;
    void remote.sendAction({ proto: 1, act: "list_sessions", rid: newRid() });
  }, []);

  // ── actions ─────────────────────────────────────────────────────────────
  const sendPrompt = useCallback(async () => {
    const remote = remoteRef.current;
    const text = prompt.trim();
    if (!remote || !text) return;
    const sid = activeRef.current ?? "new";
    if (!activeRef.current) {
      setActiveSession("pending");
      setMsgs([{ role: "user", text }]);
    } else {
      setMsgs((ms) => [...ms, { role: "user", text }]);
    }
    setPrompt("");
    await remote.sendAction({ proto: 1, act: "send_prompt", rid: newRid(), sessionId: sid, personaId, message: text });
  }, [prompt, personaId]);

  useEffect(() => {
    // host.state intro ditangani di onEvent (sessions). (hook penanda)
  }, []);

  const decide = useCallback(async (approvalId: string, approved: boolean) => {
    const remote = remoteRef.current;
    if (!remote) return;
    await remote.sendAction(
      approved
        ? { proto: 1, act: "approve", rid: newRid(), approvalId }
        : { proto: 1, act: "reject", rid: newRid(), approvalId },
    );
  }, []);

  const pickSession = useCallback(async (sid: string) => {
    const remote = remoteRef.current;
    if (!remote) return;
    setActiveSession(sid);
    activeRef.current = sid;
    setMsgs([]);
    setApprovals([]);
    await remote.sendAction({ proto: 1, act: "subscribe", rid: newRid(), sessions: [sid], sinceSeq: Object.fromEntries(seqRef.current) });
  }, []);

  // SCR-7: watch/stop live screen dari jauh (read-only, ~1fps)
  const watchScreen = useCallback(async (key: string) => {
    const remote = remoteRef.current;
    if (!remote) return;
    setWatchKey(key);
    watchKeyRef.current = key;
    setFrame(null);
    await remote.sendAction({ proto: 1, act: "watch_screen", rid: newRid(), key });
  }, []);

  const stopWatchScreen = useCallback(async () => {
    const remote = remoteRef.current;
    if (!remote) return;
    await remote.sendAction({ proto: 1, act: "unwatch_screen", rid: newRid() });
    setWatchKey(null);
    watchKeyRef.current = null;
    setFrame(null);
  }, []);

  const disconnect = useCallback(() => {
    remoteRef.current?.close();
    remoteRef.current = null;
    clientRef.current = null;
    setPhase("idle");
    setHosts([]);
    setHostState("idle");
  }, []);

  const forget = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    remoteRef.current?.close();
    remoteRef.current = null;
    clientRef.current = null;
    setDevice(null);
    deviceRef.current = null;
    setPhase("pair");
  }, []);

  // host.state intro: saat joined pertama, host mengirim daftar sesi — jika
  // ada sesi, auto-subscribe yang terbaru (hanya auto pertama kali).
  const introDone = useRef(false);
  useEffect(() => {
    if (phase === "joined" && !introDone.current && sessions.length > 0 && !activeSession) {
      introDone.current = true;
      void pickSession(sessions[0]!.sessionId);
    }
  }, [phase, sessions, activeSession, pickSession]);

  // auto start (e2e): token via query → pair → connect → join host pertama.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !q.get("auto") || !q.get("token")) return;
    autoRan.current = true;
    if (!device) void (async () => {
      await pair();
      // pairing → deviceRef terisi via setState; beri satu tick lalu connect
      setTimeout(() => void connect(), 300);
    })();
    else void connect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusChip = useMemo(() => {
    const map: Record<string, string> = {
      pair: "not paired",
      idle: device ? "paired, disconnected" : "not paired",
      connecting: "connecting…",
      joined: hostState === "joined" ? "joined" : hostState,
    };
    const color = phase === "joined" && hostState === "joined" ? "text-emerald-400 border-emerald-500/40" : "text-amber-400 border-amber-500/40";
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption ${color}`}>
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
        {map[phase]}
      </span>
    );
  }, [phase, hostState, device]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold">Remote (dev)</h1>
          <p className="text-caption text-dim">
            P1-PRT-4 — second-device proof: keys live in this browser, relay is blind.
          </p>
        </div>
        {statusChip}
      </header>

      {phase === "pair" ? (
        <Card className="flex flex-col gap-3 p-4">
          <Field label="Portal URL">
            <TextInput value={portalUrl} onChange={(e) => setPortalUrl(e.target.value)} spellCheck={false} />
          </Field>
          <Field label="Device name">
            <TextInput value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={64} />
          </Field>
          <Field label="Pairing token" hint="portal → Devices → pairing token (web slot)">
            <TextInput value={token} onChange={(e) => setToken(e.target.value)} spellCheck={false} />
          </Field>
          <Button onClick={() => void pair()} disabled={token.trim().length < 20}>
            Pair as remote device
          </Button>
        </Card>
      ) : (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-caption text-dim">device</p>
              <p className="truncate font-mono text-body">{device?.deviceId}</p>
            </div>
            <div className="flex items-center gap-2">
              <TextInput value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} spellCheck={false} className="w-56" aria-label="Relay URL" />
              {phase === "idle" || phase === "connecting" ? (
                <Button onClick={() => void connect()}>Connect</Button>
              ) : (
                <Button variant="ghost" onClick={disconnect}>Disconnect</Button>
              )}
              <Button variant="ghost" onClick={forget}>Forget</Button>
            </div>
          </Card>

          {hosts.length > 0 && phase !== "joined" && (
            <Card className="flex flex-col gap-2 p-4">
              <p className="text-body font-semibold">Hosts online</p>
              {hosts.map((h) => (
                <button key={h.deviceId} onClick={() => void joinHost(h.deviceId)} className="cursor-pointer rounded-md2 border border-line px-3 py-2 text-left hover:bg-hover">
                  <b>{h.name}</b> <span className="text-caption text-dim">({h.kind} · {h.deviceId})</span>
                </button>
              ))}
            </Card>
          )}

          {phase === "joined" && (
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <Card className="flex flex-col gap-2 p-4">
                <p className="text-body font-semibold">Sessions</p>
                {sessions.length === 0 && <p className="text-caption text-dim">none yet</p>}
                {sessions.map((s) => (
                  <button
                    key={s.sessionId}
                    onClick={() => void pickSession(s.sessionId)}
                    className={`cursor-pointer rounded-md2 border px-2.5 py-2 text-left text-caption ${activeSession === s.sessionId ? "border-primary/50 bg-hover" : "border-line hover:bg-hover"}`}
                  >
                    <b className="line-clamp-1">{s.title}</b>
                    <span className="text-dim">{s.personaId}</span>
                  </button>
                ))}
                <div className="mt-2 border-t border-line pt-2">
                  <p className="mb-1 text-caption text-dim">New session persona</p>
                  <select
                    className="w-full rounded-md2 border border-line bg-surface px-2 py-1.5 text-body"
                    value={personaId}
                    onChange={(e) => setPersonaId(e.target.value)}
                  >
                    {personas.length === 0 && <option value="yui-coder">yui-coder</option>}
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    className="mt-2 w-full"
                    onClick={() => {
                      // mulai sesi baru: prompt berikutnya membawa personaId terpilih
                      setActiveSession(null);
                      activeRef.current = null;
                      setMsgs([]);
                      setApprovals([]);
                    }}
                  >
                    New session
                  </Button>
                </div>
              </Card>

              <div className="flex flex-col gap-4">
                <Card className="flex min-h-[240px] flex-1 flex-col gap-2 p-4">
                  <p className="text-body font-semibold">
                    Chat {activeSession && activeSession !== "pending" ? <span className="font-mono text-caption text-dim">{activeSession}</span> : null}
                  </p>
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto" aria-label="messages">
                    {msgs.length === 0 && <p className="text-caption text-dim">no messages yet — send a prompt</p>}
                    {msgs.map((m, i) => (
                      <div key={i} className={`rounded-md2 border px-3 py-2 text-body whitespace-pre-wrap ${m.role === "user" ? "border-line bg-hover" : "border-line"}`}>
                        <span className="mr-2 text-caption text-dim">{m.role}</span>
                        {m.text}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <TextInput
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendPrompt();
                        }
                      }}
                      placeholder={activeSession ? "Message the host…" : "First prompt creates a session…"}
                    />
                    <Button onClick={() => void sendPrompt()} disabled={!prompt.trim()}>Send</Button>
                  </div>
                </Card>

                <Card className="flex flex-col gap-2 p-4">
                  <p className="text-body font-semibold">Approvals</p>
                  {approvals.length === 0 && <p className="text-caption text-dim">none pending</p>}
                  {approvals.map((a) => (
                    <div key={a.approvalId} className="flex items-center justify-between gap-3 rounded-md2 border border-line px-3 py-2">
                      <div className="min-w-0">
                        <b className="text-body">{a.title}</b> <span className={`text-caption ${a.risk === "high" ? "text-red-400" : "text-amber-400"}`}>{a.risk}</span>
                        <p className="truncate text-caption text-dim">{a.summary}</p>
                      </div>
                      {a.resolved ? (
                        <span className="text-caption text-dim">{a.resolved}</span>
                      ) : (
                        <div className="flex gap-2">
                          <Button onClick={() => void decide(a.approvalId, true)}>Approve</Button>
                          <Button variant="ghost" onClick={() => void decide(a.approvalId, false)}>Reject</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </Card>

                {/* SCR-7 — remote watch live screen (~1fps JPEG, read-only) */}
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-body font-semibold">Live screens</p>
                    {watchKey && (
                      <Button variant="ghost" onClick={() => void stopWatchScreen()}>Stop watching</Button>
                    )}
                  </div>
                  {screens.length === 0 && !watchKey && (
                    <p className="text-caption text-dim">none active — a persona is not driving a browser right now</p>
                  )}
                  {screens.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-3 rounded-md2 border border-line px-3 py-2">
                      <div className="min-w-0">
                        <b className="text-body">{s.personaId}</b>
                        <span className={`ml-2 text-caption ${s.status === "running" ? "text-emerald-400" : "text-amber-400"}`}>{s.status}</span>
                        <p className="truncate text-caption text-dim">{s.title || s.url}</p>
                      </div>
                      <Button
                        variant={watchKey === s.key ? "ghost" : "primary"}
                        disabled={watchKey === s.key}
                        onClick={() => void watchScreen(s.key)}
                      >
                        {watchKey === s.key ? "watching" : "Watch"}
                      </Button>
                    </div>
                  ))}
                  {frame && (
                    <div className="overflow-hidden rounded-md2 border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:image/jpeg;base64,${frame.data}`} alt="live screen frame" className="w-full" />
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          <Card className="flex max-h-48 flex-col gap-1 overflow-y-auto p-4">
            <p className="text-body font-semibold">Log</p>
            {log.map((l, i) => (
              <p key={i} className="font-mono text-caption text-dim">{l}</p>
            ))}
          </Card>
        </>
      )}
    </main>
  );
}
