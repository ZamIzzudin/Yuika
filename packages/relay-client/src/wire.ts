// @yuika/relay-client, tipe wire SPEC-PROTOCOL v1 (FROZEN, mirror
// docs/portal/SPEC-PROTOCOL.md §4). Jangan ubah shape, perubahan = proto bump.
// Field tak dikenal HARUS diabaikan penerima (forward-compat §2).

export const PROTO = 1;
export const MAX_FRAME = 262_144;

/** bye fatal, SDK match berdasarkan code (string hanya untuk log) §4.7. */
export const ByeCode = {
  REPLACED: 4000,
  UNKNOWN_DEVICE: 4001,
  BAD_SIGNATURE: 4003,
  BAD_JSON: 4100,
  ALREADY_AUTH: 4101,
  PAYLOAD_REQUIRED: 4102,
  NO_REMOTE: 4103,
  HOST_NOT_ONLINE: 4104,
  TOO_LARGE: 4105,
  NOT_JOINED: 4106,
  PROTO_UNSUPPORTED: 4200,
  ACCOUNT_LIMIT: 4201,
} as const;

/** err soft (koneksi tetap), v1 hanya host-offline. */
export const ErrCode = { HOST_OFFLINE: 4104 } as const;

export interface HostEntry {
  deviceId: string;
  kind: "desktop" | "mobile" | "web";
  name: string;
  lastSeen: number;
}

// ── S→C ─────────────────────────────────────────────────────────────────────

export interface HelloMsg { t: "hello"; proto: number; nonce: string }
export interface AuthOkMsg { t: "auth_ok"; accountId: string; deviceId: string }
export interface HostReadyMsg { t: "host_ready"; hostId: string }
export interface HostsMsg { t: "hosts"; hosts: HostEntry[] }
export interface JoinedMsg { t: "joined"; hostId: string; hostName: string; hostKind: HostEntry["kind"]; hostDhPub: string }
export interface DataInMsg { t: "data"; from: string; payload: string }
export interface RemoteJoinedMsg { t: "remote_joined"; deviceId: string; kind: HostEntry["kind"]; name: string; dhPub: string }
export interface RemoteLeftMsg { t: "remote_left"; deviceId: string }
export interface HostOfflineMsg { t: "host_offline"; hostId: string; stickyMs: number }
export interface HostBackMsg { t: "host_back"; hostId: string }
export interface ErrMsg { t: "err"; code: number; error: string }
export interface ByeMsg { t: "bye"; code: number; error: string }

// ── C→S ─────────────────────────────────────────────────────────────────────

export interface AuthMsg { t: "auth"; deviceId: string; sig: string }
export interface RegisterHostMsg { t: "register_host" }
export interface ListHostsMsg { t: "list_hosts" }
export interface JoinMsg { t: "join"; hostId: string; dhPub: string }
export interface DataOutMsg { t: "data"; payload: string; to?: string }

export type ServerMsg =
  | HelloMsg | AuthOkMsg | HostReadyMsg | HostsMsg | JoinedMsg | DataInMsg
  | RemoteJoinedMsg | RemoteLeftMsg | HostOfflineMsg | HostBackMsg | ErrMsg | ByeMsg;
export type ClientMsg = AuthMsg | RegisterHostMsg | ListHostsMsg | JoinMsg | DataOutMsg;
