# Orin

Pilih bentuk dan warna maskot. Rig mata sama untuk semua bentuk, jadi ekspresinya konsisten dan selalu simetris.

idle

Bentuk

Ekspresi

## Rig (siap dipindah ke Rive)

Satu rig mata dipakai semua bentuk. Di Rive, buat satu artboard per bentuk dengan hirarki identik, atau satu artboard dengan number input `shape` (0–14) yang menukar Body dan warna.

| Bone / shape | Pivot | Digerakkan oleh |
| --- | --- | --- |
| Root › Body (bentuk + warna) | tengah | napas, squash-stretch, bounce, goyang |
| Body › Face (grup) | tengah | geser tatapan (parallax), offset per bentuk |
| Face › EyeL, EyeR (kapsul gelap) | tengah mata | tinggi, lebar, rotasi cermin, jarak, kedip |
| Eye › ArcShape (mata "^") | tengah mata | cross-fade dengan kapsul saat senang |

State machine "Mascot": `mood` (0 idle, 1 listening, 2 thinking, 3 speaking, 4 happy, 5 confused), `audioLevel` 0–100, `lookX`/`lookY` −100..100, `shape` 0–14, trigger `blink` dan `nod`.

```
const { rive, RiveComponent } = useRive({ src: "/orin.riv", stateMachines: "Mascot", autoplay: true });
const mood  = useStateMachineInput(rive, "Mascot", "mood");
const shape = useStateMachineInput(rive, "Mascot", "shape");
mood.value = 2;   // agent berpikir
shape.value = 1;  // pilih bentuk awan
```