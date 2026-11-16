# Sandbox no-escape checklist (G-ALPHA)

Gerbang alpha F5: sandbox eksekusi tidak bisa dikaburi. Tiap vektor punya
kontrol (flag docker), bukti unit (argv), dan bukti nyata (test integrasi
gated). Semua test gated dijalankan dengan Docker hidup:

```bash
YUI_SANDBOX_IT=1 npx vitest run \
  packages/core/src/__tests__/sandbox-integration.test.ts \
  packages/core/src/__tests__/sandbox-escape.test.ts
```

(Tanpa env/ tanpa Docker: skip otomatis, CI tetap hijau.)

## Matrix vektor → kontrol → bukti

| # | Vektor kabur | Kontrol (flag container) | Bukti unit argv | Bukti nyata (escape test) |
| --- | --- | --- | --- | --- |
| 1 | Tulis file keluar workspace (`../../`) | rootfs `--read-only`; hanya bind mount workspace `rw` + tmpfs `/tmp` | `sandbox.test.ts` "workspace mount rw + least privilege" | PATH: tulis `/x-escape` gagal (exit 3) |
| 2 | Baca berkas host di luar mount | hanya workspace yang di-mount; path host lain tidak ada di container | idem | PATH: `/var/run/docker.sock` ENOENT |
| 3 | Pivot via docker socket / privilege binary | socket tidak di-mount; image ringan tanpa `sudo`/`su`; `--cap-drop ALL` + `--security-opt no-new-privileges` | `sandbox.test.ts` "least privilege" | HOST SURFACE: socket + su/sudo tidak ada |
| 4 | Network keluar (HTTP, DNS, TCP) | `--network none` default-deny; allowlist egress = lewat proxy host (hanya host 80/443 ter-allowlist) | `sandbox.test.ts` "network default-deny" | NETWORK: fetch + DNS gagal (exit 3) |
| 5 | Fork bomb / banjir proses | `--pids-limit 128` + memory 512m + cpus 1 + hard timeout `docker kill` | `sandbox.test.ts` "resource caps" + "timeout" | RESOURCE: 200 spawn busy-loop ditahan; run kembali <120 dtk |
| 6 | Bertahan lewat timeout | timeout memanggil `docker kill`, bukan cuma kill CLI; container `--rm` | `sandbox.test.ts` "sandbox timeout" | (tercakup #5: run pasti selesai) |
| 7 | Leak secret lewat stdout | redaction jalan di jalur sandbox (defense-in-depth) | `sandbox.test.ts` "redaction tetap jalan" | (unit) |
| 8 | Eksekusi tanpa persetujuan | approval tetap diminta sebelum run (defense-in-depth) | `sandbox.test.ts` "approval tetap diminta" | (unit) |

## Egress allowlist (jalan kelur yang LEGAL)

Sandbox default tanpa jaringan. Saat eksekusi butuh network sah (mis.
`npm install`), container jalan dengan network + `HTTPS_PROXY` ke proxy host
(`tools/egress.ts`): hanya host 80/443 dalam allowlist yang diteruskan,
lainnya 403. Allowlist per project: `workspace/.yuika/egress.json`
(`{"allow": ["host", ".suffix.com"]}`), fallback env `YUI_EGRESS_ALLOW`,
default registry npm + nodejs.org.

## Catatan fallback lokal

`YUI_SANDBOX=off` / Docker mati = eksekusi lokal TANPA isolasi dengan warning
eksplisit (`sandbox.test.ts` "off → catatan non-isolasi"). Mode
`YUI_SANDBOX=docker` saat Docker mati = FAIL-CLOSEED, bukan diam-diam turun
ke lokal. Untuk gerbang alpha, host staging wajib Docker hidup
(`docker info` hijau) supaya semua run eksekusi lewat container.

## Status

- [x] Unit argv suite hijau (`sandbox.test.ts`, CI selalu jalan)
- [x] Escape suite tertulis (`sandbox-escape.test.ts`, gated)
- [ ] Run escape suite di host staging dengan Docker hidup, lampirkan output
      ke runbook alpha saat pertama kali dijalankan
