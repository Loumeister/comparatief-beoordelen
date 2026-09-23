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
3. **Deepen the core workflow before expanding the scope**: The highest-value next steps are stronger moderation, safer comparison presentation, reusable local calibration, and clearer uncertainty/reporting.
4. **Make local-first a workflow advantage**: Portable assignments, local benchmark sets, and file-based moderation can become a genuine alternative to platform-based CJ rather than merely a cheaper version of it.
5. **Expansion comes later**: Peer assessment, multi-media, and AI judging are meaningful extensions, but should not outrank improvements to the teacher/department assessment workflow.
6. **Out of scope**: National benchmarking and LMS integration require a server and conflict with the current local-first architecture.

---

## Pending Plans

**Always ask: "Wil je dat ik [feature X] toevoeg?" before starting work on any of these.**

### Recommended sequence

1. **Methodological hardening + moderation**: PLAN-24 → PLAN-25 → PLAN-26
2. **Core differentiation + defensible reporting**: PLAN-27 → PLAN-28 → PLAN-29
3. **Pedagogical depth**: PLAN-21 → PLAN-16
4. **Scope expansion**: PLAN-15 → PLAN-18 → PLAN-20
5. **Deferred / nice-to-have**: PLAN-22, PLAN-14

The principle is: improve the reliability, moderation, calibration, and explainability of the existing teacher workflow before adding new media types, new user roles, or AI.

---

### PLAN-24: Randomized Left/Right Presentation

**Priority**: Highest — methodological safeguard

**Complexity**: Low

**What**: Stop presenting each pair in a fixed alphabetical left/right order. Randomize which text appears on the left and right while keeping the orientation stable when the same judgement is reviewed or revised.

**Why**: `Compare.tsx` currently sorts the two texts alphabetically before display. Any systematic left/right response bias can therefore leak into the ranking. This is avoidable.

**How**:
- Use a deterministic pseudo-random orientation derived from the pair plus rater/session, so the display is balanced but stable on review
- Keep winner storage independent of visual left/right position
- Add regression tests for orientation and winner mapping
- Do not change the pairing algorithm itself

---

### PLAN-25: Guided Moderation Mode

**Priority**: Highest — core departmental workflow

**Complexity**: Medium

**What**: Turn the existing disagreement analysis into a step-by-step moderation workflow.

**Flow**:
1. Results page shows **"Bespreek meningsverschillen"**
2. Open only contested pairs, one at a time
3. Moderator judges the pair without seeing previous raters' choices
4. After judging, reveal who chose what
5. Save the moderation judgement as the final override and continue to the next disputed pair

**Why**: The app already detects disagreements, supports manual pair selection, stores rater identities, and supports final judgements. This plan turns those separate capabilities into an immediately useful moderation workflow instead of only reporting disagreement after the fact.

**Guardrails**:
- Previous choices stay hidden until the moderator has made an independent judgement
- Original judgements remain in the audit trail
- Final overrides must be visibly distinguishable from ordinary judgements
- Solo assessment remains unchanged

---

### PLAN-26: Upload Preflight / Dataset Health Check

**Priority**: High — trust and error prevention

**Complexity**: Low–Medium

**What**: Validate the imported class set before comparisons start.

**Checks**:
- Empty or failed document parsing
- Extremely short submissions relative to the rest of the set
- Exact or near-exact duplicate content
- Duplicate filenames/names
- Unsupported or malformed files

**UX**: Show one compact preflight summary such as: "27 teksten geladen · 0 leeg · 1 opvallend kort · 2 mogelijke dubbelen." Let the teacher inspect warnings before continuing. Only clearly unusable files should block progress.

**Why**: Finding a bad import after dozens of judgements damages trust and wastes assessment time. This is a small feature with direct real-world value.

---

### PLAN-27: Reusable Local Benchmark / Exemplar Sets

**Priority**: High — strongest differentiation candidate

**Complexity**: Medium–High

**What**: Let teachers or departments save a small set of benchmark texts with known grades/standards and reuse them in later assignments.

**Example**: "3 havo betoog — vakgroepbenchmark 2026" with exemplar texts anchored at 5.5, 6.5, and 8.0.

**Why**: Current anchors calibrate one assignment. Reusable benchmark sets would allow cross-class and year-to-year calibration without a central server. That makes local-first a substantive assessment advantage rather than only a privacy feature.

**How**:
- Export/import a benchmark set as a portable local file
- Add selected benchmarks to a new assignment as clearly marked reference texts
- Let them participate in pairwise comparisons and anchor the grade transform
- Exclude benchmark texts from normal student counts and student exports by default
- Preserve provenance: benchmark name, source assignment, fixed grade, created date
- Keep all storage and sharing local/file-based

**Distinction from PLAN-21**: PLAN-21 calibrates the **judge before assessment**. PLAN-27 calibrates the **score scale across assessments**.

---

### PLAN-28: Uncertainty-Aware Grades and Result Status

**Priority**: High — scientific credibility

**Complexity**: Medium

**What**: Make it harder to interpret precise grades as more certain than the model supports.

**How**:
- Mark grades/results as **voorlopig** while cohort reliability is insufficient
- Keep the simple ranking/grade table as the default teacher view
- Behind "Toon achtergrondscores", expose an approximate uncertainty range derived from theta SE and the active grade transform
- Include reliability status and uncertainty notes in exports
- Warn when two adjacent grades are closer than the model can meaningfully distinguish
- Never imply that 7.2 versus 7.3 is a precise distinction when uncertainty is larger

**Why**: The app already computes strong uncertainty and reliability diagnostics. Surfacing them carefully prevents false precision without cluttering the core workflow.

---

### PLAN-29: One-Click Assessment / Method Report

**Priority**: Medium–High — defensibility and departmental use

**Complexity**: Low–Medium

**What**: Generate a concise PDF/Excel report documenting how an assessment result was produced.

**Include**:
- Assignment title, date, number of texts
- Number of effective comparisons
- Number of raters and comparisons per rater
- Cohort reliability and split-half reliability
- Agreement/disagreement summary
- Graph connectivity
- Anchors/benchmarks used
- Grade settings and rounding
- Whether the result met the app's reliability criterion
- Optional technical appendix with model details

**Why**: Teachers can archive the method alongside grades, discuss it in a department, or explain the assessment process without exposing the full technical UI. It turns existing statistical work into a portable accountability artefact.

---

### PLAN-21: Exemplar / Training Round

**Complexity**: Medium (new assignment setup step, training flow, localStorage tracking)

**What**: Before real judging, show a brief training round with pre-scored exemplar texts to calibrate judgement.

**How**: Teacher uploads 2-4 exemplar texts with quality labels. Judges see 3-5 training pairs before real comparisons, with feedback on "expected" answers. Training judgements not counted in BT model.

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
