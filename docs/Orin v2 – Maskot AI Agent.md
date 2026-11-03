# Orin

Maskot serigala kecil dengan rig: telinga, mata, pupil, kelopak, hidung, dan badan bergerak mengikuti percakapan.

idle

## Rig (siap dipindah ke Rive)

Gambar ini orisinal, digambar ulang mengikuti gaya referensi (bukan hasil menjiplak logonya). Hirarki bone dan input di bawah dipakai persis sama saat Anda membangun artboard di Rive Editor: gambar tiap bagian sebagai shape terpisah, beri bone, lalu atur pivot sesuai tabel.

| Bone / shape | Pivot | Digerakkan oleh |
| --- | --- | --- |
| Root › Body (kepala + outline) | tengah | squash-stretch, goyang, napas, bounce |
| Body › EarL, EarR (+ inner ear) | pangkal telinga | rotasi: perk, flick, layu, miring |
| Body › Face › Muzzle | tengah | parallax ringan mengikuti tatapan |
| Face › EyePatchL/R › Pupil | tengah patch | translasi tatapan, skala (besar/kecil), squash untuk kedip |
| EyePatch › Lid (clipping) | tepi atas | turun + miring (berpikir, bingung) |
| Pupil › BottomCut (mask) | bawah pupil | naik menjadi mata "^ ^" saat senang |
| Face › Nose | tengah hidung | sniff saat berpikir |
| Face › Mouth | tengah mulut | garis smirk, rahang V, taring, lidah; buka mengikuti audioLevel |

State machine "Mascot": number `mood` (0 idle, 1 listening, 2 thinking, 3 speaking, 4 happy, 5 confused), `audioLevel` 0–100, `lookX`/`lookY` −100..100, trigger `blink` dan `nod`.

```
const { rive, RiveComponent } = useRive({ src: "/orin.riv", stateMachines: "Mascot", autoplay: true });
const mood  = useStateMachineInput(rive, "Mascot", "mood");
const level = useStateMachineInput(rive, "Mascot", "audioLevel");
mood.value = 2;          // agent berpikir
level.value = ttsLevel;  // 0-100 tiap frame saat bicara
```

Nilai keyframe tiap ekspresi ada pada tabel `S` di sumber halaman ini.