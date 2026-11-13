# Skills: pembagian persona (D99)

Bahan pretrain di `docs/skills/` (23 file, 4 kategori) dikonversi menjadi
skill BAWAAN persona (bundled di `packages/personas/*/skills.yaml`); user
tidak perlu melatih manual. File asli tetap sebagai referensi.

## Mapping per persona

### Rommel (yui-planner) - project manager
| Skill | Asal bahan | Fungsi |
| --- | --- | --- |
| product-manager-toolkit | project-manager/product-manager-toolkit | Framework PM discovery sampai delivery |
| prd-writing | project-manager/to-prd | Sintesis percakapan jadi PRD di docs/ (diadaptasi: issue tracker eksternal jadi docs + task list Yuika) |
| issue-breakdown | project-manager/to-issues | Rencana jadi task tracer-bullet vertical slice di task list project |
| triage | project-manager/triage | State machine triage backlog + brief siap-agent |
| customer-journey-map | project-manager/customer-journey-map | Journey map stages/touchpoint/pain/opportunity |
| wayfinder-planning | project-manager/wayfinder | Rencana raksasa via tiket investigasi satu per satu |
| workflow-grilling | project-manager/loop-me | Grilling spec workflow layak automasi (satu ronde pertanyaan + rekomendasi) |
| ai-product-strategy | research/ai-product-strategy | Strategi produk AI: di mana AI dipakai, roadmap, build vs buy |

### Maestro (yui-conductor) - orkestrator
| Skill | Asal | Fungsi |
| --- | --- | --- |
| agent-handoff | project-manager/pm-handoff | Padatkan sesi jadi dokumen handoff utk agent lain |
| review-loop | project-manager/review-loop | Siklus worker-reviewer via delegasi sampai quality gate |

### Poe (yui-scribe) - penulis dokumen
| Skill | Asal | Fungsi |
| --- | --- | --- |
| copywriting | copy-writing/copywriting | Copy marketing konversi |
| doc-coauthoring | data/doc-coauthoring | Co-authoring dokumen bersama user |
| docx-documents | data/docx | Rekayasa file Word (buat/baca/edit) |
| pdf-documents | data/pdf | Rekayasa file PDF (ekstrak/merge/split) |

### Nighty (yui-analyst) - spesialis data
| Skill | Asal | Fungsi |
| --- | --- | --- |
| xlsx-spreadsheets | data/xlsx | Spreadsheet input/output (xlsx/csv, formula vs nilai) |
| data-visualization | data/d3-visualization | Pemilihan chart + dashboard jujur |
| diagram-design | data/diagram-design | Arsitektur, flowchart, sequence, ER, swimlane |

### Pierre (yui-scholar) - peneliti
| Skill | Asal | Fungsi |
| --- | --- | --- |
| source-research | research/research | Investigasi sumber primer + catatan tersitasi |
| user-research | research/user-research | Rencana riset, wawancara, usability, sintesis |
| web-scraping | research/just-scrape | Ekstraksi terstruktur web (diadaptasi ke research tools Yuika; CLI di workshop bila berat) |

### Hiro (yui-coder) - developer
| Skill | Asal | Fungsi |
| --- | --- | --- |
| llm-product-engineering | research/ai-product | Ship fitur LLM: prompts, evals, guardrails, latency/cost |

### Watson (yui-sherlock) - QA/audit
| Skill | Asal | Fungsi |
| --- | --- | --- |
| eval-audit | data/eval-audit | Audit pipeline eval LLM, temuan berprioritas |

## Yang tidak dikonversi

- `copy-writing/ux-writing`: duplikat `ux-microcopy` Picasso (D98); dilewati.

## Adaptasi saat konversi

- 17 skill disalin utuh (nilai pretrain), normalisasi: em/en dash jadi
  hyphen, emoji simbol (checkmark/cross/warning) jadi teks (OK/WRONG/Warning),
  frontmatter Yuika (name, description, personas, status ready).
- 5 skill ditulis ulang agar konsisten konteks Yuika (tool eksternal disebut
  sebagai opsi, bukan prasyarat): prd-writing, issue-breakdown,
  wayfinder-planning, workflow-grilling, web-scraping.
- Dijaga test `pretrain-roster.test.ts`: semua skill ter-load valid,
  binding benar per persona, tanpa em dash.
