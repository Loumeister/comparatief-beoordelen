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

There are **no tests yet**. No test framework is configured. See Future Plans below.

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
| `rater-analysis.ts` | Per-rater agreement stats, disagreement detection, tie rate analysis (PLAN-2) |
| `anchor-grading.ts` | Anchor-based grading: refit linear transform through teacher-set anchor points (PLAN-6) |
| `reliability-status.ts` | Derive cohort reliability status (reliable/moderate/insufficient) from ExportData |
| `utils.ts` | Shared utilities (pairKey, kendallTau, cn) |

### Custom Hooks (src/hooks/)

| Hook | Used by | Responsibility |
|------|---------|----------------|
| `use-assignment-data.ts` | (shared) | Load assignment + texts + judgements + meta from IndexedDB |
| `use-results-data.ts` | Results | BT calculation, rater analysis, anchor management, all exports |
| `use-compare-data.ts` | Compare | BT maps, pair generation with fallback, judgement saving |
| `use-compare-data.ts` (useRaterIdentification) | Compare | Rater name/id, localStorage persistence |
| `use-dashboard-data.ts` | Dashboard | Assignment stats, CRUD, file import (JSON/CSV/XLSX) |

### Components (src/components/)

- `HeaderNav.tsx` — top navigation bar
- `DarkModeToggle.tsx` / `ThemeToggle.tsx` — theme switching
- `GradingSettingsDialog.tsx` — configure base grade, scale, min/max
- `ManageStudentsDialog.tsx` — edit student list for an assignment
- `StudentDetailsDialog.tsx` — detailed per-student scores modal
- `results/` — extracted Results page subcomponents:
  - `ReliabilityCard.tsx` — cohort reliability progress bar with stop advice
  - `RaterOverviewCard.tsx` — collapsible per-rater stats table
  - `DisagreementsCard.tsx` — collapsible list of contested pairs
  - `AnchorInfoCard.tsx` — anchor status banner with clear-all button
  - `ResultsTable.tsx` — sortable results table with anchor/detail toggle
  - `AnchorDialog.tsx` — set/edit/remove anchor grade for a text
  - `FeedbackDialog.tsx` — configure and trigger per-student feedback PDF export
- `compare/TextCard.tsx` — reusable text display card (handles plain text, HTML, and paper-only)
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
| Item infit/misfit flags | yes | yes | -- | yes | partial | PLAN-3 |
| **Judge infit** (per-rater misfit) | yes | yes | yes | yes | **no** | **PLAN-12** |
| **Split-half reliability** (alongside SSR) | yes | yes | -- | -- | **no** | **PLAN-13** |
| **Time per judgement tracking** | yes | yes | yes | -- | **no** | **PLAN-14** |
| **Student-as-judge** (peer assessment) | -- | yes | yes | yes | **no** | **PLAN-15** |
| **Feedback questions on submission** | -- | -- | yes | -- | **no** | **PLAN-16** |
| **Student self-review / action plans** | -- | -- | yes | partial | **no** | **PLAN-17** |
| **Multi-media support** (images, video, audio) | -- | yes | yes | yes | **no** | **PLAN-18** |
| **Undo / review previous judgements** | -- | -- | -- | -- | **no** | **PLAN-19** |
| **National / cross-school benchmarking** | yes | yes | -- | -- | **no** | out of scope (requires server) |
| **AI judges** (LLM-assisted) | yes | -- | -- | -- | **no** | **PLAN-20** |
| **LMS integration** (LTI) | -- | -- | yes | -- | **no** | out of scope (requires server) |
| **Mobile companion app** | -- | yes | -- | -- | **no** | low priority (PWA possible) |
| **Exemplar / training round** | yes | -- | -- | -- | **no** | **PLAN-21** |
| Per-text progress dashboard | -- | -- | -- | -- | **no** | PLAN-10 |
| Decision trail (why this score?) | yes | yes | -- | -- | **no** | **PLAN-22** |

### Strategic Takeaways

1. **Our strongest differentiator**: Local-first, zero-config, free, Dutch-language. No account, no server, no subscription. This matters for teachers who can't get IT approval for cloud tools.
2. **Biggest reliability gap**: Professional tools show **judge infit** and **split-half reliability** alongside SSR. We only show model agreement %. Adding these (PLAN-12, PLAN-13) would bring us to parity on psychometric quality.
3. **Biggest UX gap**: **Time per judgement** tracking is standard — it catches careless judging (fast + high misfit = low quality). Easy to add (PLAN-14).
4. **Biggest pedagogical gap**: **Peer assessment** (students as judges) is a major use case in Comproved and RM Compare. It's powerful for formative learning but requires careful UX (PLAN-15).
5. **Out of scope**: National benchmarking and LMS integration require a server. We deliberately stay local-first. AI judges (PLAN-20) could work client-side via a user-provided API key.

---

## Future Plans (Optional Enhancements)

The features below are **optional improvements** that can increase validity, reliability, or usability. Each one should be proposed to the user for approval before implementation, since the app must remain simple and accessible for non-technical colleagues.

**Always ask: "Wil je dat ik [feature X] toevoeg?" before starting work on any of these.**

### Existing Plans (from original roadmap)

---

### PLAN-3: Infit/Outfit Statistics (item fit)

**What**: Detect texts that don't fit the Bradley-Terry model (e.g., a text that beats strong texts but loses to weak ones).

**Why**: Standard ACJ implementations (Pollitt 2012) include fit statistics. NoMoreMarking and RM Compare both surface item misfit. Without them, model violations go undetected.

**How**:
- Compute infit mean-square per text: `infit_i = sum(z_ij^2 * w_ij) / sum(w_ij)`
- Flag texts with infit > 1.3 (underfit: noisy) or < 0.7 (overfit: too predictable)
- Show as an optional column in the Results table behind the "Toon achtergrondscores" toggle
- Keep the label simple: "Goed passend" / "Afwijkend patroon"

---

### PLAN-4: Unit Tests for Core Algorithms

**What**: Add Vitest test suites for bradley-terry.ts, pairing.ts, reliability.ts, effective-judgements.ts.

**Why**: The mathematical algorithms are complex and subtle bugs (like the Hessian double-counting bug that was found and fixed) can go undetected without tests.

**How**:
- Add `vitest` as dev dependency
- Create `src/lib/__tests__/` directory
- Test BT with known hand-computed examples (3-5 texts, known comparisons, verify theta convergence and SE)
- Test pairing: verify bridging connects components, no opposite-wings in intra phase
- Test reliability: ladder evidence with ties, convergence detection
- Test effective-judgements: moderation overrides, per-rater dedup

---

### PLAN-5: Smarter Labels (theta-gap aware)

**What**: Instead of fixed percentile labels (10/50/90), detect natural gaps in the theta distribution.

**Why**: In a homogeneous class, two students with near-identical ability can get different labels just because they straddle a percentile boundary.

**How**:
- After computing theta values, look for gaps > 1 SE between adjacent items
- Use these gaps to define natural groups
- Fall back to percentile labels when no clear gaps exist
- Show confidence intervals: "Tekst A: Bovengemiddeld (range: Topgroep - Gemiddeld)"

---

### PLAN-7: Enable Strict TypeScript

**What**: Enable `strict: true`, `strictNullChecks: true`, `noImplicitAny: true` in tsconfig.

**Why**: Current config has these disabled, which undermines type safety and lets null-reference bugs slip through.

**How**: Incremental migration:
1. Enable `strictNullChecks` first, fix resulting errors (mostly adding null guards)
2. Enable `noImplicitAny`, add type annotations
3. Enable full `strict` mode

---

### PLAN-8: Improved Reference Node SE

**What**: Replace the average-variance approximation for the reference node's SE with a proper computation.

**Why**: The current code picks the last text as reference and approximates its variance as the average of all other variances. This can be wrong if the reference is unusually well- or poorly-connected.

**How**:
- Choose the most-connected text (highest exposure) as reference — minimizes approximation error
- Or use Moore-Penrose pseudoinverse with sum-to-zero constraint for exact computation
- Validate with unit tests (PLAN-4)

---

### PLAN-10: Progress Dashboard per Text

**What**: Show a visual overview of which texts have been compared enough and which need more attention.

**Why**: Teachers currently only see overall cohort reliability. A per-text view helps them understand where to focus remaining effort. Both NoMoreMarking and RM Compare provide per-item data to coordinators.

**How**:
- Small bar chart or heat map on the Compare page showing each text's SE or comparison count
- Color coding: green (reliable), yellow (almost), red (needs work)
- Helps teachers decide whether to continue or stop

---

### PLAN-11: UX Polish for Non-Technical Teachers

**What**: A set of small UX improvements to make the app more accessible for colleagues who are not comfortable with technology.

**Why**: UX review revealed several friction points: confusing developer UI, missing onboarding, unclear error messages, and hidden features that teachers won't discover on their own.

**How** (priority order):

#### Critical
1. **Remove "Design Mode" button** from `HeaderNav.tsx` — this is a developer tool that confuses end users and has no place in production.
2. **Improve "Geen paren beschikbaar" message** in `Compare.tsx` — add explanation and next steps ("Je hebt alle vergelijkingen al gedaan, of het aantal leerlingen is te klein. Je kunt nu de resultaten bekijken.").
3. **Improve "Gelijkwaardig" guidance** in `Compare.tsx` — explain *why* choosing is better: "Dat maakt de resultaten nauwkeuriger."
4. **Add legend for Reliability column** in `Results.tsx` — explain what green/yellow/red means in terms of teacher action (stop / continue / needs more work).

#### High
5. **Expand Rater Overview by default** in `Results.tsx` when >1 rater exists — teachers won't discover it if it's collapsed.
6. **Add first-use welcome modal** on `Dashboard.tsx` — detect no assignments in DB and show a brief introduction to comparative judgment.
7. **Improve anchor icon tooltip** in `Results.tsx` — explain when/why to use it: "Markeer een vaste referentie-graad (bijv. 'dit essay is een 6')."
8. **Clarify "Wie ben je?" prompt** in `Compare.tsx` — make it clearer that solo teachers can skip immediately.

#### Medium
9. **Add "(optioneel)" hint** to Genre field on `Upload.tsx`.
10. **Add "Klik op een kolomkop om te sorteren" hint** near Results table.
11. **Add estimated time** to ReadMe.tsx: "Dit duurt ca. 30-60 minuten voor 20 leerlingen."

---

### New Plans (inspired by professional tools)

---

### PLAN-12: Judge Infit Statistics (per-rater misfit)

**What**: Compute infit mean-square per judge, not just per text (PLAN-3). Flag judges whose decisions are statistically inconsistent with the group consensus.

**Why**: All professional CJ tools (NoMoreMarking, RM Compare, D-PAC) surface judge infit. NoMoreMarking specifically flags judges with high infit (> 1.2) combined with low median judgement time as "careless". Currently we only show model agreement %, which is a coarser measure.

**How**:
- For each judge, compute infit: `infit_j = sum(z_ij^2 * w_ij) / sum(w_ij)` where `z_ij` is the standardized residual of each judgement
- Flag judges with infit > 1.2 as inconsistent (use NoMoreMarking's threshold)
- Show in the "Beoordelaarsoverzicht" section alongside existing agreement % and tie rate
- Dutch labels: "Goed consistent" / "Inconsistent patroon" / "Mogelijk onzorgvuldig"
- Only meaningful with >10 judgements per rater

**Inspiration**: NoMoreMarking's [Judge Infit](https://help.nomoremarking.com/en/article/judge-infit-1h0p4pv/) documentation.

---

### PLAN-13: Split-Half Reliability

**What**: Add a split-half reliability coefficient alongside the current SE-based cohort reliability.

**Why**: Bramley (2015) demonstrated that adaptive pairing algorithms can inflate Scale Separation Reliability (SSR). RM Compare explicitly recommends presenting both SSR and split-half reliability. Our current reliability metric is SE-based (not SSR), but adding split-half would give teachers a second, independent confidence signal.

**How**:
- Randomly split judges (or judgements if solo) into two halves
- Run BT independently on each half → get two rankings
- Compute Spearman rank correlation between the two rankings
- Apply Spearman-Brown correction: `r_full = 2 * r_half / (1 + r_half)`
- Show as "Betrouwbaarheidscoëfficiënt" (e.g., "0.87") in the reliability card
- Consider running multiple random splits and averaging (Monte Carlo split-half)

**Inspiration**: [Bramley 2015](https://www.cambridgeassessment.org.uk/Images/232694-investigating-the-reliability-of-adaptive-comparative-judgment.pdf), RM Compare's reliability documentation.

---

### PLAN-14: Time per Judgement Tracking

**What**: Record and display how long each comparison takes. Flag suspiciously fast judgements.

**Why**: NoMoreMarking tracks median judgement time per judge and uses it (combined with infit) to identify careless judging. Comproved shows per-student comparison times. This is standard in professional tools and helps quality-assure the assessment process.

**How**:
- Record `startedAt` timestamp when a pair is first displayed, save `duration_ms` alongside the judgement in the DB (new field on `judgements` table, requires schema v10)
- Show median time per rater in "Beoordelaarsoverzicht"
- Flag raters with median < 5 seconds as potentially careless ("Mogelijk te snel")
- Show overall average time on the Compare progress bar: "Gemiddeld X seconden per vergelijking"
- No schema migration needed for existing judgements (they'll just have `null` duration)

---

### PLAN-15: Student-as-Judge (Peer Assessment Mode)

**What**: Allow students to act as judges in the comparison process — they compare peer work and learn from the process.

**Why**: Both RM Compare and Comproved offer student peer assessment. Research (Bartholomew et al., ASEE 2018) shows that students acting as CJ judges improves their own understanding of quality criteria. The IB's Harding High School project found that CJ-based peer feedback increased higher-order thinking, collaboration, and student agency.

**How**:
- Add a "Peer assessment" mode toggle on assignment creation
- Generate shareable session links (could be a URL with assignment ID encoded — since we're local-first, this would need a QR code / copy-paste JSON approach)
- Students get a simplified Compare interface: just the two texts and choice buttons (no reliability stats, no technical details)
- Teacher sees aggregated student-judge data in Results, clearly separated from teacher judgements
- Consider: should student judgements count toward the ranking, or be purely formative?
- Start simple: "Leerlingen als beoordelaar" mode where students export/import JSONs like the team mode

**Inspiration**: [Comproved's comparing tool](https://comproved.com/en/comparing-tool/), [RM Compare peer assessment](https://compare.rm.com/).

---

### PLAN-16: Feedback Questions on Submission

**What**: Let teachers define a feedback question that judges see during comparison. Let students define their own feedback question when submitting work.

**Why**: Comproved research shows that when students formulate their own feedback questions, they receive more targeted feedback and are more open to it. Teachers can also guide judges to focus on specific aspects ("Let op de opbouw van het betoog").

**How**:
- Add optional `feedbackPrompt` field on assignment creation (teacher sets a guiding question)
- Display the prompt above the comment fields during comparison: e.g., "Waar kan de leerling verbeteren?"
- For peer assessment mode (PLAN-15): allow the text submitter to add their own feedback question
- Store feedback questions on the `assignmentMeta` or `texts` table

**Inspiration**: [Comproved feedback literacy](https://comproved.com/en/assessment/feedback-literacy/).

---

### PLAN-17: Student Self-Review & Action Plans

**What**: After results are computed, give students a view of their feedback with tools to create improvement plans.

**Why**: Comproved's action plan feature lets students organize received feedback by theme, agree/disagree with it, and formulate next steps. Research shows formative self-assessment yields the highest learning gains when not tied to grades.

**How**:
- New route `/student/:assignmentId/:textId` with a simplified, read-only view
- Shows: received feedback comments, position in ranking (optional, teacher-controlled), and peer work examples (anonymized)
- Action plan builder: student categorizes feedback, marks agree/disagree, writes improvement steps
- Stored locally (could use a separate IndexedDB table or export as PDF)
- Teacher can opt to hide grades/ranking and only show qualitative feedback

**Inspiration**: [Comproved action plans](https://comproved.com/en/assessment/feedback-action-plan/).

---

### PLAN-18: Multi-Media Support (Images, Audio, Video)

**What**: Support comparing non-text artefacts: images (e.g., art projects), audio files (e.g., music performances), and video (e.g., presentations).

**Why**: RM Compare supports text, images, video, audio, and webpages. Many school subjects require assessment of non-written work. Art, music, PE, and technology education all have comparison-suitable artefacts.

**How**:
- Extend the `texts` table to support a `mediaType` field: `text | image | audio | video`
- For images: display side-by-side in the comparison view (use `<img>` with zoom/pan)
- For audio: embed `<audio>` players side-by-side
- For video: embed `<video>` players side-by-side (consider mobile bandwidth)
- File upload: accept `.jpg`, `.png`, `.mp3`, `.mp4`, `.webm` alongside `.docx`
- Storage: use IndexedDB blobs (Dexie supports binary data). Watch for storage limits (~50-100MB per origin in most browsers).

**Inspiration**: [RM Compare](https://compare.rm.com/) — "text documents, images, video, audio files and webpages".

---

### PLAN-19: Undo / Review Previous Judgements

**What**: Let judges review and optionally revise their past judgements. Show a history of all comparisons made.

**Why**: Teachers sometimes realize they made a mistake or want to reconsider after seeing more texts. Currently there's no way to review or undo a judgement. While the BT model is robust to isolated errors, giving teachers agency increases trust in the tool.

**How**:
- New "Mijn oordelen" section accessible from the Compare page header
- Shows a list of past judgements with: text A name, text B name, winner, timestamp, comments
- "Herzie" button marks the old judgement as superseded and opens a fresh comparison for that pair (uses existing `supersedesJudgementId` field)
- Keep it simple: no inline editing, just "redo this comparison"
- Consider adding a "Ongedaan maken" (undo) button immediately after a judgement is submitted (within 5 seconds)

---

### PLAN-20: AI-Assisted Judging

**What**: Optionally use an LLM to generate additional judgements, reducing the number of human comparisons needed.

**Why**: NoMoreMarking's AI-enhanced CJ uses a 90% AI / 10% human split, cutting marking time by 95% while maintaining 83% agreement with teachers. For a class of 30 texts, this could reduce teacher effort from ~150 comparisons to ~15.

**How**:
- User provides their own API key (OpenAI, Anthropic, etc.) — stored in `localStorage`, never sent anywhere except the API
- AI judges are clearly marked with `source: "ai"` and `raterName: "AI"` on the judgement
- Teacher sees AI judgements separately in the rater overview and can accept/reject them
- Default split: suggest 50% AI / 50% human for a cautious start (not 90/10 like NMM)
- The prompt should be: "Which of these two texts is better? Consider overall quality, coherence, and argumentation. Respond with A, B, or EQUAL."
- Show agreement rate between AI and human judges prominently

**Inspiration**: [NoMoreMarking AI-Enhanced CJ](https://www.nomoremarking.com/cj-ai).

**Important**: This is the only plan that requires an external dependency (API). It must be opt-in, clearly explained, and work without it. Solo/offline mode must always work.

---

### PLAN-21: Exemplar / Training Round

**What**: Before "real" judging begins, show judges a brief training round with pre-scored exemplar texts to calibrate their judgement.

**Why**: NoMoreMarking recommends "a quick discussion and outline before starting" and provides exemplar texts via the Writing Hub. RM Compare research shows that brief calibration improves judge consistency. Comproved's feedback criteria feature serves a similar purpose.

**How**:
- Teacher uploads or selects 2-4 "exemplar" texts during assignment setup, and assigns each a quality label (good / average / weak)
- Before the first real comparison, judges see 3-5 training pairs from the exemplar set
- After each training judgement, show the "expected" answer: "De meeste beoordelaars kozen Tekst A — dit was een sterke tekst vanwege [X]."
- Training judgements are not counted in the BT model
- Mark training as complete in `localStorage` per rater per assignment
- Keep it optional: "Wil je eerst een oefenronde? (Aanbevolen)"

---

### PLAN-22: Decision Trail (Why This Score?)

**What**: For any text in the results, show the chain of comparisons that led to its ranking — who it beat, who it lost to, and how "surprising" each result was.

**Why**: NoMoreMarking lets coordinators "look at the decisions made for that candidate, who they were compared against, and the probability that the decision was 'correct'". RM Compare provides similar decision-level transparency. Teachers want to understand *why* a text got its score, not just accept a number.

**How**:
- Click on any text in the Results table → show a "Vergelijkingsoverzicht" panel
- List all comparisons involving this text: opponent, winner, predicted probability, actual outcome
- Highlight "surprising" results (actual outcome differs from model prediction by >0.8 probability)
- Show a mini visualization: the text's position in the ranking with arrows to its comparison partners
- This extends the existing `StudentDetailsDialog` with richer statistical context

---

### Priority Order (recommended implementation sequence)

**Phase 1 — Psychometric parity** (makes our results as trustworthy as professional tools):
1. PLAN-12: Judge infit (complements existing agreement %)
2. PLAN-13: Split-half reliability (guards against SSR inflation)
3. PLAN-3: Item infit (already partially in codebase)

**Phase 2 — Quality assurance UX**:
4. PLAN-14: Time per judgement (catches careless judging)
5. PLAN-19: Undo/review judgements (teacher agency)
6. PLAN-22: Decision trail (transparency)

**Phase 3 — Teacher productivity**:
7. PLAN-10: Per-text progress dashboard
8. PLAN-21: Exemplar/training round
9. PLAN-11: UX polish bundle

**Phase 4 — Pedagogical expansion**:
10. PLAN-15: Student-as-judge (peer assessment)
11. PLAN-16: Feedback questions
12. PLAN-17: Student self-review & action plans

**Phase 5 — Advanced capabilities**:
13. PLAN-18: Multi-media support
14. PLAN-20: AI-assisted judging
15. PLAN-5: Smarter labels

**Infrastructure** (do anytime):
- PLAN-4: Unit tests
- PLAN-7: Strict TypeScript
- PLAN-8: Improved reference node SE
