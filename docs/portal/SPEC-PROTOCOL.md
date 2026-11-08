# SPEC-PROTOCOL v1, Protokol Wire Portal & Relay (FROZEN)

> **DOKUMEN KONVERGENSI.** Dua repo mengimplementasi dokumen ini secara paralel:
> `yuika-portal` (server: relay + web) dan `your-yui` (klien: `packages/relay-client`,
> host mode, mobile, desktop). Selama `proto: 1`, dokumen ini **dibekukan**,
> perubahan hanya lewat prosedur §12. Mirror identik ada di
> `your-yui/docs/portal/SPEC-PROTOCOL.md`.
>
> Sumber kebenaran tunggal = file ini + `docs/vectors/proto1.json` (golden vectors,
> identik di dua repo). Jika kedua suite test hijau terhadap vectors yang sama,
> implementasi kompatibel di wire.

## Daftar Isi

1. Prinsip & topologi
2. Transport & framing
3. Siklus koneksi (hello → auth → auth_ok)
4. Katalog pesan (v1), C→S dan S→C
5. Envelope E2E (spesifikasi kripto eksak)
6. Limit & kebijakan
7. REST lintas-repo (claim & friends)
8. Format identifier
9. Presence, `last_seen`, dan hak tulis DB relay
10. Model kegagalan & reconnect
11. Skenario uji konvergensi (gerbang integrasi)
12. Versi & prosedur perubahan

---

## 1. Prinsip & topologi

```
remote (mobile/desktop/web-page)                    host (apps/api Yuika / Tauri)
        │                                                    │
        └──────────── wss ──▶ RELAY ◀── wss ─────────────────┘
                     (satu endpoint publik; mux BUTA)
```

- Host & remote sama-sama connect **keluar**; host tidak membuka port inbound.
- Relay **tidak pernah membaca** `payload`, isinya envelope E2E (§5).
- Satu akun pribadi; `join` hanya sah antar device **satu akun yang sama**.
- Multi-host: satu akun boleh punya ≥1 host online bersamaan (workspace terpisah).
- Remote = **action-based** (kirim intent, terima event), bukan screen mirroring.

## 2. Transport & framing

- WebSocket (`wss://` produksi, `ws://` dev). Path: `/` (apa pun).
- Setiap frame = **satu objek JSON UTF-8**, field `t` (string) = jenis pesan.
- Client → server field wajib bersifat exact; field tak dikenal HARUS diabaikan
  penerima (forward-compat).
- Ukuran maksimum frame: **262.144 byte** (lihat §6).
- HTTP `GET /healthz` pada port relay → `200 {"ok":true,"uptime":<sec>}`.

## 3. Siklus koneksi

```
C──connect──▶S   S──▶C  {"t":"hello","proto":1,"nonce":"<32char>"}
C──▶S  {"t":"auth","deviceId":"dev_…","sig":"<base64>"}
S──▶C  {"t":"auth_ok","accountId":"acc_…","deviceId":"dev_…"}        ← LANJUT
        atau {"t":"bye","code":4001|4003,"error":"…"}  + close
```

- `nonce`: 24 byte acak base64url (32 char), unik per koneksi.
- `sig` = `Ed25519(signPriv, utf8(deviceId + "|" + nonce))` base64, fungsi
  `signChallenge`/`verifyChallenge` di `@yuika-portal/crypto`.
- `proto`: versi protokol maksimum yang didukung relay. Klien yang tidak
  mendukung versi itu membalas `{"t":"bye","code":4200,"error":"proto version unsupported"}`
  lalu close. v1 klien menerima `proto:1`.
- Setelah `auth_ok`, koneksi DIKUNCI identitas: `auth` ulang = `bye 4101`.
- Semua pesan sebelum `auth` (kecuali `bye`) → `bye 4001` + close.

## 4. Katalog pesan (v1)

Ringkasan (C→S = klien kirim; S→C = relay kirim):

| t               | Arah | Kondisi      | Ringkas                                    |
| --------------- | ---- | ------------ | ------------------------------------------ |
| `hello`         | S→C  | saat connect | challenge `{proto, nonce}`                 |
| `auth`          | C→S  | sekali       | `{deviceId, sig}`                          |
| `auth_ok`       | S→C  | ,            | `{accountId, deviceId}`                    |
| `register_host` | C→S  | pasca-auth   | jadi host `{}`                             |
| `host_ready`    | S→C  | ,            | `{hostId}`                                 |
| `list_hosts`    | C→S  | pasca-auth   | minta daftar host online akunku            |
| `hosts`         | S→C  | ,            | `{hosts:[{deviceId,kind,name,lastSeen}]}`  |
| `join`          | C→S  | pasca-auth   | tempel ke host `{hostId, dhPub}`           |
| `joined`        | S→C  | ,            | `{hostId, hostName, hostKind, hostDhPub}`  |
| `data`          | C→S  | pasca-auth   | `{payload, to?}`                           |
| `data`          | S→C  | ,            | `{from, payload}`                          |
| `remote_joined` | S→C  | ke host      | `{deviceId, kind, name, dhPub}`            |
| `remote_left`   | S→C  | ke host      | `{deviceId}`                               |
| `host_offline`  | S→C  | ke remote    | `{hostId, stickyMs}`                       |
| `host_back`     | S→C  | ke remote    | `{hostId}`                                 |
| `err`           | S→C  | ,            | soft error `{code, error}` (koneksi tetap) |
| `bye`           | S→C  | ,            | fatal `{code, error}` + close              |

### 4.1 `register_host` / `host_ready`

```jsonc
C→S  {"t":"register_host"}
S→C  {"t":"host_ready","hostId":"dev_abc…"}
```

- Channel id = `deviceId` host. Re-register device sama = **replace**: koneksi
  lama diberi `{"t":"bye","code":4000,"error":"replaced by new host connection"}`
  lalu close; remote yang sticky (§10) TETAP menempel dan menerima `host_back`.
- Saat `host_ready` (termasuk reconnect), relay mengirim **satu `remote_joined`
  per remote yang masih menempel**, host wajib mengumpulkan `dhPub` dari sini
  untuk seal per-recipient.

### 4.2 `list_hosts` / `hosts`

```jsonc
C→S  {"t":"list_hosts"}
S→C  {"t":"hosts","hosts":[
       {"deviceId":"dev_abc…","kind":"web","name":"Web host (self-host)","lastSeen":1793899799624}
     ]}
```

- Hanya host yang **online saat itu** milik akun pengirim, urut `deviceId` naik
  (deterministik untuk test).
- `kind`: `desktop | mobile | web` (dari tabel `devices`); `lastSeen`: epoch ms.
- Dipakai remote untuk memilih host (UI switch-host).

### 4.3 `join` / `joined`

```jsonc
C→S  {"t":"join","hostId":"dev_abc…","dhPub":"-----BEGIN PUBLIC KEY-----…"}
S→C  {"t":"joined","hostId":"dev_abc…","hostName":"Web host (self-host)","hostKind":"web","hostDhPub":"-----BEGIN PUBLIC KEY-----…"}
```

- `dhPub` remote (SPKI X25519 PEM) diteruskan relay ke host via `remote_joined`.
  Relay memvalidasi format PEM (`BEGIN PUBLIC KEY`) saja, tidak memverifikasi
  kepemilikan (device sudah terverifikasi via auth).
- **Satu koneksi remote menempel ke maksimal SATU host (v1).** Butuh dua host =
  buka dua koneksi. `join` saat host offline → `bye 4104 "host not online"`;
  `join` lintas akun → `bye 4403 "host belongs to another account"`.
- `join` ulang ke host yang sudah ditempel (sticky) = idempotent: balas
  `joined` lagi, tanpa duplikat entri.
- `hostDhPub` dipakai remote untuk seal action ke host.

### 4.4 `data` (forward opaque)

```jsonc
C→S  {"t":"data","payload":"<base64 envelope E2E>"}                 // remote → host
C→S  {"t":"data","payload":"…","to":"dev_remote…"}                   // host → remote spesifik
C→S  {"t":"data","payload":"…"}                                      // host → semua remote (box per-recipient)
S→C  {"t":"data","from":"dev_…","payload":"…"}
```

- Relay MENYALIN apa adanya; `payload` string base64, TIDAK diinspeksi.
- Broadcast tanpa `to`: relay mengirim pesan yang SAMA ke tiap remote, host
  bertanggung jawab seal **satu box per recipient** (box E2E hanya terbuka
  pemilik kunci; satu box untuk semua secara kripto mustahil, lihat §5.4).
- Remote mengirim `data` tanpa menempel → `bye 4106 "not joined to any host"`.
- Host mengirim `data` saat tidak ada remote → `bye 4103 "no remote connected"`.
- Remote mengirim `data` saat host offline (sticky window) → `err 4104`
  (koneksi tetap; SDK menahan antrian).

### 4.5 `remote_joined` / `remote_left` (ke host)

```jsonc
S→C  {"t":"remote_joined","deviceId":"dev_mob…","kind":"mobile","name":"Phone","dhPub":"-----BEGIN PUBLIC KEY-----…"}
S→C  {"t":"remote_left","deviceId":"dev_mob…"}
```

- Host menyimpan map `deviceId → {kind, name, dhPub}`; dipakai untuk seal
  per-recipient dan badge "N remote connected".

### 4.6 `host_offline` / `host_back` (ke remote)

```jsonc
S→C  {"t":"host_offline","hostId":"dev_abc…","stickyMs":60000}
S→C  {"t":"host_back","hostId":"dev_abc…"}
```

- Saat ws host putus, relay MENAHAN remote yang menempel selama `stickyMs`
  (default 60.000 ms). Dalam window: host kembali → semua remote menempel
  menerima `host_back` (tidak perlu join ulang). Lewat window → relay
  melepas remote (tanpa pesan; SDK berhenti retry join setelah backoff max).
- Remote yang connect BARU saat host offline tidak bisa join (4104), dia
  harus `list_hosts` dan menunggu.

### 4.7 `err` (soft) vs `bye` (fatal)

- `err` = kondisi transien; koneksi hidup. v1 hanya `4104 host offline`.
- `bye` = pelanggaran protokol/otorisasi; relay close setelah mengirim.
  Close code ws = kode yang sama.

**Tabel `bye` (kode + string error, BEKU):**

| code | error (persis)                                      | Pemicu                             |
| ---- | --------------------------------------------------- | ---------------------------------- |
| 4000 | `replaced by new host connection`                   | host re-register                   |
| 4001 | `unknown device` / `not authenticated`              | auth gagal device / pesan pra-auth |
| 4003 | `bad signature` / `host belongs to another account` | sig salah / join lintas akun       |
| 4100 | `bad json`                                          | frame bukan JSON                   |
| 4101 | `already authenticated`                             | auth dua kali                      |
| 4102 | `payload required`                                  | data tanpa payload string          |
| 4103 | `no remote connected`                               | host data tanpa remote             |
| 4104 | `host not online`                                   | join ke host offline               |
| 4105 | `message too large`                                 | frame > §6                         |
| 4106 | `not joined to any host`                            | remote data tanpa join             |
| 4200 | `proto version unsupported`                         | klien tak dukung `proto` relay     |

SDK klien HARUS match berdasarkan `code` (string hanya untuk log manusia).

## 5. Envelope E2E (kripto eksak)

Diverifikasi golden: `docs/vectors/proto1.json` (identik dua repo).

1. **Kunci**: tiap device punya pasangan sign (Ed25519) + DH (X25519), format
   PEM PKCS8/SPKI. Private TIDAK PERNAH keluar dari device.
2. **Derivasi** `from → to`:
   - `secret = X25519_ECDH(from.dhPriv, to.dhPub)`
   - `aad    = utf8(from.deviceId + "|" + to.deviceId)`
   - `key    = HKDF-SHA256(secret, salt=aad, info="", L=32)`
3. **Box** = `base64( iv[12] ‖ AES-256-GCM(key, iv, plaintext, aad).ciphertext ‖ tag[16] )`.
   `plaintext` = UTF-8 JSON `RemoteAction`/`RemoteEvent` (CONTRACTS-REMOTE.md).
4. **Aturan arah**: AAD mengikat pasangan & arah, box A→B TIDAK terbuka oleh A,
   dan tidak bisa dipindah ke device lain. Key A→B == key B→A (static-static;
   arah dibedakan AAD). Rotasi = unlink + pair ulang (credential baru).
5. **Broadcast** = host seal **satu box per recipient** lalu kirim
   `data{payload_box_i, to:recipient_i}` per remote. TIDAK ADA box bersama.

## 6. Limit & kebijakan

| Batas               | Nilai default (env)                        | Pelanggaran                           |
| ------------------- | ------------------------------------------ | ------------------------------------- |
| Frame maksimum      | 262.144 B (`RELAY_MAX_FRAME`)              | `bye 4105`                            |
| Koneksi per akun    | 8 (`RELAY_MAX_CONN_PER_ACCOUNT`)           | `bye 4201 "account connection limit"` |
| Ping keepalive      | tiap 30 dtk; 2× tanpa pong → terminate     | ,                                     |
| Sticky host offline | 60.000 ms (`RELAY_STICKY_MS`)              | §4.6                                  |
| Claim API rate      | 10/menit/IP & 100/jam global               | HTTP 429                              |
| Pairing token       | 43 char base64url, single-use, TTL 120 dtk | §7                                    |

`bye 4201` ditambahkan ke tabel §4.7 oleh implementasi (spec change note: v1.1).

## 7. REST lintas-repo (dipanggil klien Yuika)

Base dev: `http://localhost:3100` (produksi: origin portal).

### POST /api/devices/claim, device baru menukar pairing token

```jsonc
→ {"token":"<43char>","kind":"desktop|mobile|web","name":"My Desktop",
   "signPub":"-----BEGIN PUBLIC KEY-----…","dhPub":"-----BEGIN PUBLIC KEY-----…"}
← 201 {"deviceId":"dev_…","accountId":"acc_…"}
```

Error (body `{"error": string}`):

- `400` field invalid · `404` token not found · `409` already used **atau** slot
  kind sudah linked (`a desktop device is already linked ('…'), unlink it…`) ·
  `410` expired · `429` rate limited (baru; portal session menambahkan).

Aturan: token single-use; satu slot `linked` per kind; pengganti wajib unlink
dulu dari portal web. `name` dipotong 64 char oleh server.

### Endpoints portal lain (browser user, bukan SDK)

`POST /api/account/register|login|logout`, `GET /api/account/me`,
`GET /api/devices`, `POST /api/devices/pairing {kind}` (→ token + `qrDataUrl`),
`DELETE /api/devices/{id}`. Session = cookie httpOnly `yuika_portal_session`.

## 8. Format identifier

| ID             | Format                   | Contoh                 |
| -------------- | ------------------------ | ---------------------- |
| accountId      | `acc_` + 16 hex          | `acc_de7cfb1041d11697` |
| deviceId       | `dev_` + 16 hex          | `dev_05461d8b74fca7c8` |
| pairing token  | 32 B base64url (43 char) | `45gkeus36ITN…`        |
| session cookie | 32 B base64url           | (opaque)               |
| nonce          | 24 B base64url (32 char) | ,                      |

Password hash: scrypt `s1$<salt32hex>$<key128hex>` (64-byte key).

## 9. Presence, `last_seen`, hak tulis DB relay

Pemilik schema & data = `apps/web`. Relay membuka portal.db dengan
**hak tulis sempit**:

- `UPDATE devices SET last_seen = ?`, saat `auth_ok` dan tiap `register_host`.
- `INSERT INTO device_events …`, audit (tabel baru, dibuat web; kolom:
  `id, device_id, account_id, kind, event, at`; event ∈ `auth_ok | auth_fail |
host_online | host_offline | host_replaced | remote_joined | remote_left`).
- Selain dua operasi itu relay READ-ONLY. Web tetap satu-satunya penulis
  accounts/sessions/pairing/devices lain.

`last_seen` juga diperbarui web saat halaman Devices dibuka (read = tak menulis;
gunakan nilai relay). Offline device = `last_seen` terakhir diketahui.

## 10. Model kegagalan & reconnect

- Klien SEMUA arah: auto-reconnect exponential backoff (250 ms → 16 s, jitter),
  lalu ulang handshake penuh (hello/auth) + `register_host`/`join` idempotent.
- Remote: saat `host_offline`, SDK menahan antrian action; `host_back` → kirim
  ulang; lewat sticky window → surface "host offline" ke UI.
- Host: reconnect = `register_host` (replace otomatis) + terima batch
  `remote_joined` ulang.
- Server restart relay: state hilang (in-memory), semua klien reconnect;
  tidak ada pesan yang dijamin (at-most-once per koneksi; reliabilitas =
  tanggung jawab lapisan aplikasi via `rid` + snapshot, lihat CONTRACTS-REMOTE).

## 11. Skenario uji konvergensi (gerbang P1-PRT-6)

Kedua repo masing-masing punya harness yang lulus skenario berikut (relay
in-process untuk unit; lintas proses untuk gerbang):

1. Handshake valid → auth_ok; sig salah → bye 4003; device unlinked → 4001.
2. Host register → remote join salah akun → 4403; benar → joined (dhPub tiba).
3. Remote action E2E → host buka box (plaintext sesuai CONTRACTS) → balas
   event per-recipient → tiap remote membuka box-nya; box remote lain throw.
4. Broadcast: 2 remote; host kirim 2 box `to` spesifik; masing-masing hanya
   bisa membuka miliknya.
5. `list_hosts` benar (multi-host dua device online, urut deviceId).
6. Host putus → `host_offline(stickyMs)` → reconnect dalam window → `host_back`
   - `remote_joined` batch; data remote saat offline → `err 4104`.
7. Frame > 262.144 B → bye 4105; koneksi ke-9 satu akun → bye 4201.
8. Golden vectors proto1.json hijau di dua repo (crypto + envelope + arah AAD).
9. Claim API: 201 → token reuse 409 → slot clash 409 → expire 410 → 429 setelah
   10 permintaan/menit dari satu IP.

## 12. Versi & prosedur perubahan

- `proto: 1` = semua di dokumen ini. Field baru yang OPTIONAL pada pesan lama
  TIDAK menaikkan proto (aturan ignore-unknown §2).
- Perubahan apa pun yang mengubah semantik/shape pesan, envelope, kode error,
  atau limit default = **proto +1**; dokumen ini diberi catatan changelog;
  `docs/vectors/protoN.json` baru digenerate; relay `hello.proto` dinaikkan.
- Selama paralel development: **SERVER (repo portal) tidak boleh mengubah spec
  sepihak**, usulan ditulis di `docs/CHANGE-PROPOSALS.md` portal, keputusan
  bersama user, lalu sinkronisasi mirror ke `your-yui/docs/portal/`.
- Implementasi relay saat ini (`apps/relay`) SUDAH sesuai §3–4 kecuali: `proto`
  di hello, `join.dhPub`/`joined.hostDhPub`, `list_hosts`/`hosts`,
  `remote_joined`, `host_back`/sticky, `err`, kode 4200/4201, limit §6,
  `device_events`, itu pekerjaan P1-PRT-5 (repo portal).
