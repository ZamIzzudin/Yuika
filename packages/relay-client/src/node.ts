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

/** Bungkus `ws` jadi WsLike (handler property; semua frame wire = teks). */
export function nodeSocket(url: string): WsLike {
  const ws = new WS(url);
  return ws as unknown as WsLike; // frame teks JSON → data string otomatis
}

export function createNodeRelayClient(opts: Omit<RelayClientOpts, "crypto" | "socketFactory">): RelayClient {
  return new RelayClient({ ...opts, crypto: nodeCrypto, socketFactory: nodeSocket });
}
