# docs/portal — Mirror Kontrak Protokol (FROZEN)

> **MIRROR — jangan edit di sini.** Sumber kebenaran = `yuika-portal` repo
> (`D:\projects\yuika-portal\docs\`). File di sini disalin **byte-identik**
> dan diverifikasi via hash (lihat bawah). Sesi development Yuika
> mengimplementasi `packages/relay-client` + host mode **terhadap salinan ini**.

## Isi

| File | Fungsi |
|---|---|
| `SPEC-PROTOCOL.md` | Protokol wire v1 (pesan, kode error, envelope E2E, limit, REST claim, reconnect, skenario uji) |
| `CONTRACTS-REMOTE.md` | Payload aplikasi `RemoteAction`/`RemoteEvent` (blok zod disalin verbatim ke `packages/contracts/src/remote.ts`) |
| `vectors/proto1.json` | Golden vectors — suite test Yuika WAJIB memuat file ini dan hijau (sama seperti portal) |

## Verifikasi sinkron

```
sha256sum docs/portal/vectors/proto1.json
# = 82d15e573cdc5aa38fc8472d722b841a9702732eaaeb5d8132f49473fa2ba22f
```

Jika portal mem-bump proto (SPEC §12): user mengoordinasi, lalu sesi Yuika
menyalin ulang ketiga file + memperbarui hash di sini.

## Aturan untuk sesi Yuika

1. Implementasi SDK/host mengikuti SPEC-PROTOCOL.md **apa adanya**; jangan
   menambah/mengubah semantik pesan sepihak — usulan lewat user ke
   `yuika-portal/docs/CHANGE-PROPOSALS.md`.
2. Test vectors: salin pola
   `yuika-portal/packages/crypto/__tests__/vectors.test.ts` (atau buka langsung
   file JSON) — buat suite setara di repo ini (P1-PRT-1 acceptance).
3. Sebelum gerbang P1-PRT-6, cek `yuika-portal/docs/TASKS.md` memuat baris
   **"PORTAL READY FOR INTEGRATION"** ✅ (T1+T2+T4 hijau di portal).
