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
| `utils.ts` | Shared utilities (pairKey, kendallTau, cn) |

### Components (src/components/)

- `HeaderNav.tsx` — top navigation bar
- `DarkModeToggle.tsx` / `ThemeToggle.tsx` — theme switching
- `GradingSettingsDialog.tsx` — configure base grade, scale, min/max
- `ManageStudentsDialog.tsx` — edit student list for an assignment
- `StudentDetailsDialog.tsx` — detailed per-student scores modal
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

## Future Plans (Optional Enhancements)

The features below are **optional improvements** that can increase validity, reliability, or usability. Each one should be proposed to the user for approval before implementation, since the app must remain simple and accessible for non-technical colleagues.

**Always ask: "Wil je dat ik [feature X] toevoeg?" before starting work on any of these.**

---

### PLAN-3: Infit/Outfit Statistics (item fit)

**What**: Detect texts that don't fit the Bradley-Terry model (e.g., a text that beats strong texts but loses to weak ones).

**Why**: Standard ACJ implementations (Pollitt 2012) include fit statistics. Without them, model violations go undetected.

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

**Why**: Teachers currently only see overall cohort reliability. A per-text view helps them understand where to focus remaining effort.

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
