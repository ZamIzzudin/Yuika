// @yuika/relay-client, binding Node: crypto @yuika/crypto (node) + socket `ws`.
// Browser: pakai entry "." (core) dengan WebSocket global + @yuika/crypto/web.
import { open as nodeOpen, seal as nodeSeal, signChallenge as nodeSign } from "@yuika/crypto";
import WS from "ws";
import type { CryptoAdapter, WsLike } from "./core.js";
import { RelayClient, type RelayClientOpts } from "./core.js";

/** Adapter crypto node (sync dibungkus Promise, menyamakan antarmuka web). */
export const nodeCrypto: CryptoAdapter = {
  signChallenge: async (priv, deviceId, nonce) => nodeSign(priv, deviceId, nonce),
  seal: async (from, to, pt) => nodeSeal(from, to, pt),
  open: async (to, from, box) => nodeOpen(to, from, box).toString("utf8"),
};

/** Bungkus `ws` jadi WsLike: handler property + ping/pong/terminate
 * (keepalive watchdog host Node butuh ketiganya; browser tidak punya). */
export function nodeSocket(url: string): WsLike {
  const ws = new WS(url);
  const like: WsLike = {
    send: (d) => ws.send(d),
    close: (code?, reason?) => ws.close(code, reason),
    ping: () => ws.ping(),
    terminate: () => ws.terminate(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    onpong: null,
  };
  ws.on("open", () => like.onopen?.());
  ws.on("message", (d) => like.onmessage?.({ data: d.toString() }));
  ws.on("close", (code, reason) => like.onclose?.({ code, reason: reason?.toString() }));
  ws.on("error", (err) => like.onerror?.(err));
  ws.on("pong", () => like.onpong?.());
  return like;
}

export function createNodeRelayClient(opts: Omit<RelayClientOpts, "crypto" | "socketFactory">): RelayClient {
  return new RelayClient({ ...opts, crypto: nodeCrypto, socketFactory: nodeSocket });
}
