# CLAUDE.md - Comparative Judgment App

## Project Overview

A **Dutch-language** web app for assessing student writing using **comparative judgment** (vergelijkend beoordelen). Teachers compare texts pairwise ("which is better?") instead of assigning absolute grades. The **Bradley-Terry model** converts these comparisons into a reliable ranking with grades and standard errors.

**Primary users are teachers** — non-technical colleagues who need a simple, intuitive tool. Every UI decision must prioritize clarity and ease of use. No jargon in the interface. Technical details (theta, SE, Hessian) stay hidden behind a "Toon achtergrondscores" toggle.

All data is stored **locally in the browser** (IndexedDB via Dexie). There is no server, no login, no cloud dependency.

## Tech Stack

- **React 18** + **TypeScript** + **Vite 7** (SWC compiler)
- **Tailwind CSS 3** + **shadcn-ui** (Radix primitives)
- **Dexie 4** (IndexedDB wrapper, schema version 9)
- **ExcelJS**, **jsPDF**, **Mammoth** (export/import/doc parsing)
- Deployed to **GitHub Pages** (base path `/comparatief-beoordelen/`)

## Commands

```sh
npm install          # install dependencies
npm run dev          # dev server on port 8080
npm run build        # production build to dist/
npm run build:dev    # development build
npm run lint         # ESLint
npm run preview      # preview production build
```

**Testing**: Vitest is configured with 113 tests across 10 test files in `src/lib/__tests__/`. Run with `npx vitest run`.

## Architecture

### Routes (src/App.tsx)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | List assignments, quick actions |
| `/upload` | Upload | Create assignment, add texts |
| `/compare/:assignmentId` | Compare | Pairwise comparison interface |
| `/results/:assignmentId` | Results | Ranking, grades, export |
| `/readme` | ReadMe | In-app documentation |

### Core Library (src/lib/)

| File | Responsibility |
|------|----------------|
| `bradley-terry.ts` | BT model fitting (Newton-Raphson), full Hessian SE via Cholesky |
| `pairing.ts` | Smart pair generation: bridging phase + intra-component scoring |
| `reliability.ts` | Cohort reliability: core SE check, ladder evidence, convergence (Kendall's tau) |
| `constants.ts` | All thresholds (SE_RELIABLE=0.75, COHORT_MEDIAN_OK=0.80, etc.) |
| `effective-judgements.ts` | Filters raw judgements: moderation overrides, per-rater dedup |
| `db.ts` | Dexie schema v9 (6 tables: assignments, texts, judgements, scores, previousFits, assignmentMeta) |
| `graph.ts` | DFS connectivity check |
| `export.ts` | CSV, Excel, PDF export + per-student feedback PDF |
| `exportImport.ts` | JSON dataset export/import, CSV import, Excel import |
| `document-parser.ts` | .docx parsing via Mammoth |
| `rater-analysis.ts` | Per-rater agreement stats, disagreement detection, tie rate analysis (PLAN-2), judge infit (PLAN-12) |
| `split-half.ts` | Monte Carlo split-half reliability coefficient with Spearman-Brown correction (PLAN-13) |
| `anchor-grading.ts` | Anchor-based grading: refit linear transform through teacher-set anchor points (PLAN-6) |
| `reliability-status.ts` | Derive cohort reliability status (reliable/moderate/insufficient) from ExportData |
| `utils.ts` | Shared utilities (pairKey, kendallTau, cn) |

### Custom Hooks (src/hooks/)

| Hook | Used by | Responsibility |
|------|---------|----------------|
| `use-assignment-data.ts` | (shared) | Load assignment + texts + judgements + meta from IndexedDB |
| `use-results-data.ts` | Results | BT calculation, rater analysis, split-half reliability, anchor management, all exports |
| `use-compare-data.ts` | Compare | BT maps, pair generation with fallback, judgement saving, manual pair selection, undo/review (PLAN-19) |
| `use-compare-data.ts` (useRaterIdentification) | Compare | Rater name/id, localStorage persistence |
| `use-dashboard-data.ts` | Dashboard | Assignment stats, CRUD, file import (JSON/CSV/XLSX) |

### Components (src/components/)

- `HeaderNav.tsx` — top navigation bar
- `DarkModeToggle.tsx` / `ThemeToggle.tsx` — theme switching
- `GradingSettingsDialog.tsx` — configure base grade, scale, min/max
- `ManageStudentsDialog.tsx` — edit student list for an assignment
- `StudentDetailsDialog.tsx` — detailed per-student scores modal
- `results/` — extracted Results page subcomponents:
  - `ReliabilityCard.tsx` — cohort reliability progress bar with stop advice + split-half coefficient (PLAN-13)
  - `RaterOverviewCard.tsx` — collapsible per-rater stats table with judge infit (PLAN-12)
  - `DisagreementsCard.tsx` — collapsible list of contested pairs
  - `AnchorInfoCard.tsx` — anchor status banner with clear-all button
  - `ResultsTable.tsx` — sortable results table with anchor/detail toggle
  - `AnchorDialog.tsx` — set/edit/remove anchor grade for a text
  - `FeedbackDialog.tsx` — configure and trigger per-student feedback PDF export
- `compare/TextCard.tsx` — reusable text display card (handles plain text, HTML, and paper-only)
- `compare/TextProgressCard.tsx` — per-text SE/comparison progress overview (PLAN-10)
- `compare/MyJudgementsDialog.tsx` — review/revise past judgements dialog (PLAN-19)
- `dashboard/AssignmentCard.tsx` — per-assignment card with stats and action buttons
- `ui/` — shadcn-ui component library (do not edit directly)

### Database Schema (Dexie v9)

```
assignments:   ++id, title, createdAt
                 fields: title, genre, numComparisons, createdAt, updatedAt
texts:         ++id, assignmentId, anonymizedName
                 fields: content, contentHtml?, originalFilename, anonymizedName, createdAt
judgements:    ++id, assignmentId, pairKey, textAId, textBId, raterId, supersedesJudgementId, createdAt
                 fields: winner, comment?, commentA?, commentB?, raterId?, raterName?,
                         sessionId?, source?, supersedesJudgementId?, isFinal?, pairKey?
scores:        ++id, assignmentId, textId, rank
previousFits:  ++id, assignmentId, calculatedAt
assignmentMeta: assignmentId
                 fields: judgementMode?, seRepeatThreshold?, gradeBase?, gradeScale?,
                         gradeMin?, gradeMax?, anchors?
```

**Schema history**: v4 (pairKey backfill) → v5 (grading defaults) → v6 (commentA/B) → v7 (raterName for team mode) → v8 (contentHtml for Word formatting) → v9 (anchors for anchor-based grading)

When changing the schema, increment the version number in `db.ts` and add an `.upgrade()` handler for backward compatibility.

## Key Design Decisions

### Lambda values
- **Pairing phase** (`Compare.tsx`): `lambda = 0.3` — stronger regularization for stable estimates with sparse data
- **Final results** (`Results.tsx`): `lambda = 0.1` — less regularization for more accurate final scores
- This is intentional. Both values must be considered when changing regularization.

### Effective judgements
`getEffectiveJudgements()` must be called before any BT calculation. It handles:
- `isFinal` moderation overrides (newest final judgement wins)
- Per-rater deduplication (only most recent per rater per pair)
- Both `Results.tsx` and `Compare.tsx` use this filter. Never pass raw judgements to `calculateBradleyTerry`.

### Pairing strategy
Two phases: (1) **bridging** to connect disconnected graph components, (2) **intra-component** scoring that considers Fisher information, SE priority, core/wing composition, exposure balance. The `underCap` gate requires at least one text in the pair to still need data (AND logic, not OR).

### Grading is norm-referenced
`grade = base + scale * z_score` means grades are relative within the cohort. The average student always gets the base grade (default 7). This is inherent to comparative judgment — document it clearly in any UI that shows grades.

### Labels are percentile-based
Topgroep (top 10%), Bovengemiddeld (11-50%), Gemiddeld (51-90%), Onder gemiddeld (bottom 10%). Fixed cuts, not theta clusters.

## Coding Guidelines

### Language
- **UI text**: Dutch (this is a Dutch educational tool)
- **Code comments**: Dutch or English (existing codebase mixes both; either is fine)
- **Variable/function names**: English

### UX principles
- **Keep it simple**. The primary users are teachers, not developers.
- Every new feature must have a clear, jargon-free label in the UI.
- Technical details (theta, SE, Hessian) stay behind opt-in toggles.
- New features should not clutter the main workflow (Upload -> Compare -> Results).
- When in doubt, hide advanced options in a settings dialog or collapsible section.

### Code style
- Use the existing `@/` path alias (maps to `src/`)
- Use shared utilities from `src/lib/utils.ts` (e.g., `pairKey()` for pair keys)
- Use `shadcn-ui` components from `src/components/ui/` — don't add new UI libraries
- All database queries go through the `db` singleton from `src/lib/db.ts`
- Export types from `db.ts` when adding new interfaces
- Constants belong in `src/lib/constants.ts`

### What to avoid
- Don't break the core workflow (Upload -> Compare -> Results)
- Don't add server dependencies — this is a local-first browser app
- Don't remove the ability to work solo (single-rater must always work)
- Don't make the UI more complex without explicit user approval
- Don't change threshold values without updating README.md and constants.ts comments

---

## Implemented Plans

The following plans from the original roadmap have been **fully implemented** and are live in the current codebase.

---

### PLAN-1: Team Judgement Mode (multi-rater collaboration) — IMPLEMENTED

**Status**: Fully implemented across schema v7, Compare.tsx, Results.tsx, Dashboard.tsx.

**What was built**:
1. **Rater identification**: `raterName` field on Judgement (schema v7). Compare page prompts "Wie ben je?" on first visit. Name stored in `localStorage`, `raterId` generated from slugified name. Solo users click "Ik werk alleen — start" (defaults to "Docent").
2. **Share via JSON export/import**: "Deel met collega" button exports texts-only JSON. Colleagues import, judge, export back. `importDataset()` merges with per-rater dedup.
3. **Per-rater overview**: "Beoordelaarsoverzicht" on Results page (collapsible, only shown with >1 rater). Shows per rater: name, # judgements, model agreement %, tie rate. Flags low agreement (<60%) and high ties (>40%).
4. **Disagreement analysis**: "Meningsverschillen" section on Results page. Lists contested pairs with vote breakdown.
5. **Dashboard enhancements**: Assignment cards show rater count ("X beoordelaars") when >1 rater.
6. **Solo mode preserved**: Team UI only appears when multiple raters are detected.

**Key files**: `src/pages/Compare.tsx` (rater prompt), `src/pages/Results.tsx` (rater overview, disagreements), `src/lib/rater-analysis.ts` (analysis logic), `src/pages/Dashboard.tsx` (rater count display).

---

### PLAN-2: Judge Consistency Metrics — IMPLEMENTED

**Status**: Fully implemented in `src/lib/rater-analysis.ts` and Results.tsx.

**What was built**:
- Per-judge model agreement % (flags <60%)
- Per-judge tie rate (warns >40%)
- Pairwise disagreement detection
- Displayed in collapsible sections on Results page (only with >1 rater)
- Dutch labels: "Beoordelaarsoverzicht", "Meningsverschillen"

---

### PLAN-6: Anchor-Based Grading — IMPLEMENTED

**Status**: Fully implemented across schema v9, `src/lib/anchor-grading.ts`, Results.tsx.

**What was built**:
- Anchor icon next to each grade in Results table — click to set a fixed grade
- `anchors` field on AssignmentMeta (schema v9)
- Single anchor: offset shift. Multiple anchors: least-squares fit.
- Shows both "Relatief cijfer" and "Geijkt cijfer" columns when anchors are active
- Info card explains single vs. multiple anchor behavior
- "Wis ijkpunten" button to clear all anchors
- Fully documented in ReadMe.tsx

---

### PLAN-9: Tie Guidance in UI — IMPLEMENTED

**Status**: Implemented in Compare.tsx.

**What was built**:
- Guidance text updated to: "Kies de betere tekst, ook als het verschil klein is. Alleen Gelijkwaardig als ze echt even goed zijn."
- Per-rater tie rate tracking. When >40%, shows nudge: "Tip: probeer vaker een keuze te maken"
- Ties are never blocked, only gently discouraged

---

### PLAN-3: Infit/Outfit Statistics (Item Fit) — IMPLEMENTED

**Status**: Fully implemented in `src/lib/bradley-terry.ts` and `src/components/results/ResultsTable.tsx`.

**What was built**:
- Infit mean-square computed per text during BT fitting: `infit_i = Σ(observed - expected)² / Σ var_ij`
- Texts flagged with infit > 1.3 (underfit: noisy) or < 0.7 (overfit: too predictable)
- Shown as an optional column in the Results table behind the "Toon achtergrondscores" toggle
- Dutch labels: "Goed passend" / "Afwijkend patroon (overfit)" / "Afwijkend patroon (onderfit)"
- Highlighted in amber when outside the 0.7–1.3 range

---

### PLAN-12: Judge Infit Statistics (per-rater misfit) — IMPLEMENTED

**Status**: Fully implemented in `src/lib/rater-analysis.ts` and `src/components/results/RaterOverviewCard.tsx`.

**What was built**:
- Infit mean-square computed per judge: `infit_j = Σ(observed - expected)² / Σ var_ij` using BT model predictions
- Judges flagged with infit > 1.2 as inconsistent, > 1.5 as potentially careless
- Shown as "Consistentie" column in "Beoordelaarsoverzicht" alongside existing agreement % and tie rate
- Only computed for raters with ≥10 judgements (shows "te weinig data" otherwise)
- Dutch labels: "Goed consistent" / "Inconsistent patroon" / "Mogelijk onzorgvuldig"
- Explanation added to the footer text of the rater overview card

**Key files**: `src/lib/rater-analysis.ts` (computation), `src/components/results/RaterOverviewCard.tsx` (display).

---

### PLAN-13: Split-Half Reliability — IMPLEMENTED

**Status**: Fully implemented in `src/lib/split-half.ts`, `src/hooks/use-results-data.ts`, and `src/components/results/ReliabilityCard.tsx`.

**What was built**:
- Monte Carlo split-half reliability (20 random splits by default)
- Each split: randomly halve judgements → run lightweight BT on each half → Spearman rank correlation
- Spearman-Brown correction applied: `r_full = 2 * r_half / (1 + r_half)`
- Shown as "Betrouwbaarheidscoëfficiënt (split-half)" in the reliability card below the progress bar
- Color-coded: green (≥0.80), amber (0.60–0.79), red (<0.60)
- Dutch interpretation text adapts to coefficient level
- Seeded PRNG (xorshift32) for reproducible results across reloads
- Minimum 6 judgements and 3 texts required; returns null otherwise

**Key files**: `src/lib/split-half.ts` (all computation), `src/hooks/use-results-data.ts` (integration), `src/components/results/ReliabilityCard.tsx` (display).

---

### PLAN-4: Unit Tests for Core Algorithms — IMPLEMENTED

**Status**: Fully implemented. Vitest configured with 113 tests across 10 test files.

**What was built**:
- Vitest dev dependency added with `src/lib/__tests__/` convention
- Test suites for: `bradley-terry.ts` (17 tests), `pairing.ts` (10 tests), `reliability.ts` (10 tests), `effective-judgements.ts` (9 tests), `graph.ts` (8 tests), `utils.ts` (10 tests), `anchor-grading.ts` (11 tests), `split-half.ts` (8 tests), `rater-analysis.ts` (20 tests), `reliability-status.ts` (10 tests)
- Tests cover BT convergence, SE computation, pair generation bridging, effective judgement dedup, split-half reproducibility, judge infit, and more

**Key files**: `src/lib/__tests__/*.test.ts`, `vitest.config.ts`.

---

### PLAN-10: Progress Dashboard per Text — IMPLEMENTED

**Status**: Fully implemented in `src/components/compare/TextProgressCard.tsx` and `src/hooks/use-compare-data.ts`.

**What was built**:
- Collapsible card on Compare page showing per-text SE and comparison count
- Color-coded status: green (reliable, SE ≤ 0.75), yellow (almost, SE ≤ 1.0), red (needs work)
- Sorted worst-first so teachers see which texts need more comparisons
- Uses existing BT computation data, no extra queries

---

### PLAN-11: UX Polish for Non-Technical Teachers — IMPLEMENTED

**Status**: All 8 items fully implemented.

**What was built**:
1. Removed "Design Mode" button from `HeaderNav.tsx`
2. Improved "Geen paren beschikbaar" message with explanation and next steps
3. Added legend for Reliability column in Results table
4. Rater Overview expanded by default when >1 rater
5. Improved anchor icon tooltip with contextual explanation
6. Clarified "Wie ben je?" prompt — clearer that solo teachers can skip
7. Added "(optioneel)" hint to Genre field on Upload page
8. Added "Klik op een kolomkop om te sorteren" hint near Results table

---

### PLAN-19: Undo / Review Previous Judgements — IMPLEMENTED

**Status**: Fully implemented in `src/components/compare/MyJudgementsDialog.tsx`, `src/hooks/use-compare-data.ts`, and `src/pages/Compare.tsx`.

**What was built**:
- "Mijn oordelen" button in Compare header showing count of past judgements
- Dialog listing current rater's judgements (deduplicated per pair, newest first) with text names, winner badge, timestamp
- "Herzie" button per judgement opens the pair in manual comparison mode with `supersedesJudgementId` tracked
- 5-second undo toast after each judgement with "Ongedaan maken" action button
- `undoLastJudgement()` deletes the record from IndexedDB and reloads
- No schema migration needed — `supersedesJudgementId` already existed, `getEffectiveJudgements` already handles dedup

**Key files**: `src/components/compare/MyJudgementsDialog.tsx` (dialog), `src/hooks/use-compare-data.ts` (myJudgements state, undo logic), `src/pages/Compare.tsx` (UI wiring).

---

## Pending UI/UX Improvements

These features have been approved for implementation. Each is small-to-medium scope, requires no new libraries, and no server dependency.

---

### UI-1: Grade Distribution Histogram — IMPLEMENTED

**Location**: `src/components/results/GradeHistogram.tsx` (used in `src/pages/Results.tsx`)
Vertical bar chart per whole-number grade band. Uses `anchoredGrade ?? grade`. Pure CSS/Tailwind, no chart library. Shows average and labels which grade type is displayed. Hidden when fewer than 3 students.

---

### UI-2: Student Name Search / Filter in Results Table — IMPLEMENTED

**Location**: `src/components/results/ResultsTable.tsx`
Search input above the results table with `Search` icon. Filters by `anonymizedName`, shows "X van Y leerlingen" count when active.

---

### UI-3: Grade Rounding Toggle

**Location**: `src/components/GradingSettingsDialog.tsx` + `src/lib/db.ts` + `src/hooks/use-results-data.ts`
**What**: Add an "Afronden op" segmented control in `GradingSettingsDialog` with three options: `0.1` (default, current behavior) / `0.5` / `1`. Stored on `assignmentMeta` as a new optional field `gradeRounding?: 0.1 | 0.5 | 1`. Applied when computing displayed grades in `use-results-data.ts`.
**How**: Schema stays at v9 — `gradeRounding` fits within the existing `assignmentMeta` object (no new table column needed since it's a JS-level field read via Dexie). Apply rounding via `Math.round(grade / step) * step` before display.
**Dutch label**: "Afronden op: 0,1 / 0,5 / 1"

---

### UI-4: Assignment Duplication — IMPLEMENTED

**Location**: `src/hooks/use-dashboard-data.ts` + `src/components/dashboard/AssignmentCard.tsx`
`Copy` icon button in card header (next to edit/delete). `handleDuplicate` in hook clones assignment + all texts in one transaction. Toast confirmation. No judgements/meta copied.

---

### UI-5: Assignment Search / Filter on Dashboard — IMPLEMENTED

**Location**: `src/pages/Dashboard.tsx`
Search input appears in the header row when ≥4 assignments exist. Filters by title with clear (×) button.

---

### UI-6: "Snel Starten" — Prominent Continue Button — IMPLEMENTED

**Location**: `src/components/dashboard/AssignmentCard.tsx`
Button shows "Ga verder →" when `stats.judgements > 0 && stats.reliabilityPct < 100`, "Vergelijk" when not yet started.

---

### UI-7: Print Stylesheet

**Location**: `src/index.css`
**What**: Add `@media print` CSS rules that produce a clean printed Results page. Hide: `HeaderNav`, all action/export buttons, `ReliabilityCard` controls, collapsible section toggles, the "Toon achtergrondscores" toggle. Show: results table, reliability status text, grade settings summary. Ensure table borders print, avoid page breaks mid-row.
**How**: Pure CSS in `src/index.css`. Add `.no-print` utility class applied to elements that should be hidden on print, plus direct `@media print` overrides for table styling.
**Dutch note**: No visible UI changes — print triggered by browser Ctrl+P / Cmd+P

---

### UI-8: Fullscreen Text Reader

**Location**: `src/components/compare/TextCard.tsx`
**What**: A small `Maximize2` icon button (lucide, already a dependency) in the top-right corner of each `TextCard`. Clicking it opens a full-screen `<Dialog>` showing the complete text with comfortable reading width and line height. Supports plain text, `contentHtml`, and shows "Fysiek exemplaar" for paper-only texts.
**How**: Add local `isOpen` state + `Dialog` using the existing shadcn-ui `Dialog` component. No new dependencies. Dialog shows the student name (anonymized), full text content, and a close button.
**Dutch label**: Tooltip on expand icon: "Tekst volledig lezen"

---

### UI-9: Keyboard Shortcut "E" for Gelijkwaardig — IMPLEMENTED

**Location**: `src/pages/Compare.tsx`
`E`/`e` added as alias for `T`/`t`. UI updated: button shows "Sneltoets: T / E", guidance text says "(sneltoets T of E)".

---

## Competitive Landscape

This section maps features from professional CJ platforms to identify what we have, what we lack, and what's worth building. The goal is **not** to replicate enterprise SaaS — we stay local-first and simple — but to cherry-pick the high-impact features that teachers actually benefit from.

### Platforms Analyzed

| Platform | Focus | Key Differentiator |
|----------|-------|--------------------|
| [**No More Marking**](https://www.nomoremarking.com/) | K-12 writing assessment (UK) | National benchmarking, AI judges (90% AI / 10% human), personalised student feedback reports, Writing Progression framework |
| [**RM Compare**](https://compare.rm.com/) (formerly CompareAssess) | Enterprise ACJ across sectors | Multi-media support (text, image, video, audio, webpages), adaptive algorithm, mobile companion app, 0.9+ SSR, hiring/awarding use cases |
| [**Comproved**](https://comproved.com/en/) | Higher ed + secondary (Flanders/NL) | Peer assessment with student-as-judge, feedback questions on submission, action plans, benchmark-based grading, LMS integration (LTI) |
| [**D-PAC**](https://www.uantwerpen.be/en/research/info-for-companies/offer-for-companies/licence-offers/human-and-social-sci/dpac/) | Research platform (U. Antwerp / Ghent) | Academic focus, competence assessment, feedback loop research |

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
| Split-half reliability (alongside SSR) | yes | yes | -- | -- | **yes** | -- |
| **Time per judgement tracking** | yes | yes | yes | -- | **no** | **PLAN-14** (deferred) |
| **Student-as-judge** (peer assessment) | -- | yes | yes | yes | **no** | **PLAN-15** |
| **Feedback questions on submission** | -- | -- | yes | -- | **no** | **PLAN-16** |
| **Multi-media support** (images, video, audio) | -- | yes | yes | yes | **no** | **PLAN-18** |
| Undo / review previous judgements | -- | -- | -- | -- | **yes** | -- |
| **National / cross-school benchmarking** | yes | yes | -- | -- | **no** | out of scope (requires server) |
| **AI judges** (LLM-assisted) | yes | -- | -- | -- | **no** | **PLAN-20** |
| **LMS integration** (LTI) | -- | -- | yes | -- | **no** | out of scope (requires server) |
| **Mobile companion app** | -- | yes | -- | -- | **no** | low priority (PWA possible) |
| **Exemplar / training round** | yes | -- | -- | -- | **no** | **PLAN-21** |
| Per-text progress dashboard | -- | -- | -- | -- | **yes** | -- |
| Decision trail (why this score?) | yes | yes | -- | -- | **no** | nice-to-have (PLAN-22) |

### Strategic Takeaways

1. **Our strongest differentiator**: Local-first, zero-config, free, Dutch-language. No account, no server, no subscription. This matters for teachers who can't get IT approval for cloud tools.
2. **Psychometric parity achieved**: With item infit (PLAN-3), judge infit (PLAN-12), and split-half reliability (PLAN-13), we now match professional tools on statistical quality metrics.
3. **Time per judgement** tracking exists in professional tools, but how they surface it is unclear. Needs research into whether it's used internally (algorithm tuning) or shown to users. Showing per-rater timing risks being confrontational in a collegial setting — deferred to nice-to-have (PLAN-14).
4. **Biggest pedagogical gap**: **Peer assessment** (students as judges) is a major use case in Comproved and RM Compare. It's powerful for formative learning but requires careful UX (PLAN-15).
5. **Out of scope**: National benchmarking and LMS integration require a server. We deliberately stay local-first. AI judges (PLAN-20) could work client-side via a user-provided API key.

---

## Short-Term Roadmap

The short-term roadmap is now **complete**. All planned features (PLAN-4, PLAN-10, PLAN-11, PLAN-19) have been implemented. The remaining plan below is optional and low-priority.

**Always ask: "Wil je dat ik [feature X] toevoeg?" before starting work on any of these.**

---

### PLAN-16: Feedback Questions on Submission

**Effort**: Small (one field on assignmentMeta + display in Compare)

**What**: Let teachers define a feedback question that judges see during comparison.

**How**:
- Add optional `feedbackPrompt` field on assignment creation (teacher sets a guiding question)
- Display the prompt above the comment fields during comparison: e.g., "Waar kan de leerling verbeteren?"
- Store on `assignmentMeta` table

---

## Long-Term / Nice-to-Have

These features are valuable but require significant effort, complex UX design, or introduce new paradigms. They should only be pursued when the short-term roadmap is complete and there is explicit user demand.

---

### PLAN-15: Student-as-Judge (Peer Assessment Mode)

**Complexity**: High (new UX flow, sharing mechanism, role separation)

**What**: Allow students to act as judges — they compare peer work and learn from the process.

**Why**: Both RM Compare and Comproved offer this. Research shows CJ-based peer feedback improves student understanding of quality criteria.

**How**: Start simple with "Leerlingen als beoordelaar" mode where students export/import JSONs like team mode. Students get a simplified Compare interface (no reliability stats). Teacher sees aggregated student-judge data separately in Results.

---

### PLAN-18: Multi-Media Support (Images, Audio, Video)

**Complexity**: High (IndexedDB storage limits, big UX overhaul, media playback)

**What**: Support comparing non-text artefacts: images, audio files, and video.

**How**: Extend `texts` table with `mediaType` field. Side-by-side display with `<img>`, `<audio>`, `<video>` elements. Accept `.jpg`, `.png`, `.mp3`, `.mp4`, `.webm` uploads. Watch for IndexedDB storage limits (~50-100MB per origin).

---

### PLAN-20: AI-Assisted Judging

**Complexity**: High (external API dependency, ongoing API maintenance, prompt engineering)

**What**: Optionally use an LLM to generate additional judgements via user-provided API key.

**Why**: NoMoreMarking's AI-enhanced CJ uses 90% AI / 10% human split, cutting marking time by 95%.

**How**: User provides API key (stored in `localStorage`). AI judges marked with `source: "ai"`. Start with 50% AI / 50% human split. Must be fully opt-in, work without it.

---

### PLAN-21: Exemplar / Training Round

**Complexity**: Medium (new assignment setup step, training flow, localStorage tracking)

**What**: Before real judging, show a brief training round with pre-scored exemplar texts to calibrate judgement.

**How**: Teacher uploads 2-4 exemplar texts with quality labels. Judges see 3-5 training pairs before real comparisons, with feedback on "expected" answers. Training judgements not counted in BT model. Optional: "Wil je eerst een oefenronde?"

---

### PLAN-22: Decision Trail (Why This Score?)

**Complexity**: Low (extends existing StudentDetailsDialog)

**What**: For any text in the results, show predicted probability per comparison and highlight "surprising" outcomes.

**Why deferred**: The existing `StudentDetailsDialog` already shows the win/loss/tie record. The main added value (surprise highlighting) is modest — most teachers trust the ranking without needing to inspect statistical reasoning. PLAN-19's revision feature already handles the use case of fixing problematic judgements.

---

### PLAN-14: Time per Judgement Tracking

**Complexity**: Medium (schema migration + unresolved UX questions)

**What**: Record how long each comparison takes. Potentially flag suspiciously fast judgements.

**Open questions**: Professional tools (NMM, RM Compare, Comproved) all track timing, but it's unclear how they surface it — internally for algorithm tuning, or visible to coordinators? Showing per-rater timing in a shared overview risks feeling like surveillance in a collegial setting. The existing judge infit metric already catches poor-quality judging without timing data. More research is needed before implementing.

**How (if pursued)**: Record `startedAt`/`duration_ms` on judgements (schema v10). Show timing only to the individual rater as a private nudge, similar to the existing tie-rate nudge. Do not show per-rater timing in the shared Beoordelaarsoverzicht.

---

## Removed Plans

These plans were evaluated and removed from the roadmap:

- **PLAN-5 (Smarter Labels)**: Over-engineering. Theta-gap detection is fragile and produces inconsistent results across cohort sizes. Fixed percentile labels are simple and predictable.
- **PLAN-7 (Strict TypeScript)**: Not a feature — just enable strictness incrementally as files are touched. No need for a dedicated plan.
- **PLAN-8 (Improved Reference Node SE)**: Micro-optimization with negligible real-world impact. The current average-variance approximation works well enough for educational assessment.
- **PLAN-17 (Student Self-Review & Action Plans)**: Requires a new route, new DB table, and complex UX for a niche use case. Better served by exporting feedback PDF and letting students use existing tools.
