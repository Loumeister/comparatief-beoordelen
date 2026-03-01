# ROADMAP.md - Comparative Judgment App

## Competitive Landscape

Maps features from professional CJ platforms to identify what we have, what we lack, and what's worth building. Goal is **not** to replicate enterprise SaaS — we stay local-first and simple.

### Platforms Analyzed

| Platform | Focus | Key Differentiator |
|----------|-------|--------------------|
| [**No More Marking**](https://www.nomoremarking.com/) | K-12 writing assessment (UK) | National benchmarking, AI judges (90% AI / 10% human), personalised student feedback reports |
| [**RM Compare**](https://compare.rm.com/) | Enterprise ACJ across sectors | Multi-media support, adaptive algorithm, mobile app, 0.9+ SSR |
| [**Comproved**](https://comproved.com/en/) | Higher ed + secondary (Flanders/NL) | Peer assessment with student-as-judge, feedback questions, LMS integration (LTI) |
| [**D-PAC**](https://www.uantwerpen.be/en/research/info-for-companies/offer-for-companies/licence-offers/human-and-social-sci/dpac/) | Research platform (U. Antwerp / Ghent) | Academic focus, competence assessment |

### Feature Comparison Matrix

| Feature | NMM | RM | Comproved | D-PAC | **Us** | Gap? |
|---------|:---:|:--:|:---------:|:-----:|:------:|:----:|
| Pairwise comparison | yes | yes | yes | yes | **yes** | -- |
| Bradley-Terry / BT-L model | yes | yes | yes | yes | **yes** | -- |
| Adaptive pairing | yes | yes | partial | yes | **yes** | -- |
| Multi-rater collaboration | yes | yes | yes | yes | **yes** | -- |
| Per-rater agreement/misfit | yes | yes | yes | yes | **yes** | -- |
| Anchor/benchmark grading | -- | -- | yes | -- | **yes** | -- |
| Per-student feedback PDF | yes | -- | -- | -- | **yes** | -- |
| Tie handling & guidance | -- | -- | -- | -- | **yes** | -- |
| Item infit/misfit flags | yes | yes | -- | yes | **yes** | -- |
| Judge infit (per-rater misfit) | yes | yes | yes | yes | **yes** | -- |
| Split-half reliability | yes | yes | -- | -- | **yes** | -- |
| Undo / review previous judgements | -- | -- | -- | -- | **yes** | -- |
| **Time per judgement tracking** | yes | yes | yes | -- | **no** | PLAN-14 (deferred) |
| **Student-as-judge** (peer assessment) | -- | yes | yes | yes | **no** | PLAN-15 |
| **Feedback questions on submission** | -- | -- | yes | -- | **no** | PLAN-16 |
| **Multi-media support** (images, video, audio) | -- | yes | yes | yes | **no** | PLAN-18 |
| **AI judges** (LLM-assisted) | yes | -- | -- | -- | **no** | PLAN-20 |
| **Exemplar / training round** | yes | -- | -- | -- | **no** | PLAN-21 |
| Decision trail (why this score?) | yes | yes | -- | -- | **no** | PLAN-22 (nice-to-have) |
| National / cross-school benchmarking | yes | yes | -- | -- | **no** | out of scope (requires server) |
| LMS integration (LTI) | -- | -- | yes | -- | **no** | out of scope (requires server) |
| Mobile companion app | -- | yes | -- | -- | **no** | low priority (PWA possible) |

### Strategic Takeaways

1. **Our strongest differentiator**: Local-first, zero-config, free, Dutch-language. No account, no server, no subscription.
2. **Psychometric parity achieved**: Item infit, judge infit, and split-half reliability match professional tools on statistical quality metrics.
3. **Biggest pedagogical gap**: Peer assessment (students as judges) is a major use case in Comproved and RM Compare (PLAN-15).
4. **Out of scope**: National benchmarking and LMS integration require a server. AI judges (PLAN-20) could work client-side via user-provided API key.

---

## Pending Plans

**Always ask: "Wil je dat ik [feature X] toevoeg?" before starting work on any of these.**

---

### PLAN-16: Feedback Questions on Submission

**Effort**: Small

**What**: Let teachers define a feedback question that judges see during comparison.

**How**:
- Add optional `feedbackPrompt` field on assignment creation
- Display the prompt above the comment fields during comparison: e.g., "Waar kan de leerling verbeteren?"
- Store on `assignmentMeta` table

---

### PLAN-15: Student-as-Judge (Peer Assessment Mode)

**Complexity**: High (new UX flow, sharing mechanism, role separation)

**What**: Allow students to act as judges — they compare peer work and learn from the process.

**How**: Start simple with "Leerlingen als beoordelaar" mode where students export/import JSONs like team mode. Students get a simplified Compare interface (no reliability stats). Teacher sees aggregated student-judge data separately in Results.

---

### PLAN-18: Multi-Media Support (Images, Audio, Video)

**Complexity**: High (IndexedDB storage limits, big UX overhaul, media playback)

**What**: Support comparing non-text artefacts: images, audio files, and video.

**How**: Extend `texts` table with `mediaType` field. Side-by-side display with `<img>`, `<audio>`, `<video>`. Watch for IndexedDB storage limits (~50-100MB per origin).

---

### PLAN-20: AI-Assisted Judging

**Complexity**: High (external API dependency, prompt engineering)

**What**: Optionally use an LLM to generate additional judgements via user-provided API key.

**How**: User provides API key (stored in `localStorage`). AI judges marked with `source: "ai"`. Start with 50% AI / 50% human split. Must be fully opt-in.

---

### PLAN-21: Exemplar / Training Round

**Complexity**: Medium (new assignment setup step, training flow, localStorage tracking)

**What**: Before real judging, show a brief training round with pre-scored exemplar texts to calibrate judgement.

**How**: Teacher uploads 2-4 exemplar texts with quality labels. Judges see 3-5 training pairs before real comparisons, with feedback on "expected" answers. Training judgements not counted in BT model.

---

### PLAN-22: Decision Trail (Why This Score?)

**Complexity**: Low (extends existing StudentDetailsDialog)

**What**: For any text in the results, show predicted probability per comparison and highlight "surprising" outcomes.

**Why deferred**: `StudentDetailsDialog` already shows the win/loss/tie record. PLAN-19's revision feature already handles fixing problematic judgements. Added value is modest.

---

### PLAN-14: Time per Judgement Tracking

**Complexity**: Medium (schema migration + unresolved UX questions)

**What**: Record how long each comparison takes. Potentially flag suspiciously fast judgements.

**Open questions**: Professional tools track timing but it's unclear whether it's surfaced to users or used internally. Showing per-rater timing risks feeling like surveillance. Judge infit already catches poor-quality judging without timing data.

**How (if pursued)**: Record `startedAt`/`duration_ms` on judgements (schema v10). Show timing only to the individual rater as a private nudge. Do not show in the shared Beoordelaarsoverzicht.

---

## Removed Plans

These plans were evaluated and removed:

- **PLAN-5 (Smarter Labels)**: Over-engineering. Theta-gap detection is fragile and produces inconsistent results across cohort sizes. Fixed percentile labels are simple and predictable.
- **PLAN-7 (Strict TypeScript)**: Not a plan — enable strictness incrementally as files are touched.
- **PLAN-8 (Improved Reference Node SE)**: Micro-optimization with negligible real-world impact. Current average-variance approximation works well enough.
- **PLAN-17 (Student Self-Review & Action Plans)**: Requires a new route, new DB table, and complex UX for a niche use case. Better served by exporting feedback PDF.
