# CLAUDE.md - Comparative Judgment App

## Project Overview

A **Dutch-language** web app for assessing student writing using **comparative judgment** (vergelijkend beoordelen). Teachers compare texts pairwise ("which is better?") instead of assigning absolute grades. The **Bradley-Terry model** converts these comparisons into a reliable ranking with grades and standard errors.

**Primary users are teachers** — non-technical colleagues who need a simple, intuitive tool. Every UI decision must prioritize clarity and ease of use. No jargon in the interface. Technical details (theta, SE, Hessian) stay hidden behind a "Toon achtergrondscores" toggle.

All data is stored **locally in the browser** (IndexedDB via Dexie). There is no server, no login, no cloud dependency.

## Tech Stack

- **React 18** + **TypeScript** + **Vite 7** (SWC compiler)
- **Tailwind CSS 3** + **shadcn-ui** (Radix primitives)
- **Dexie 4** (IndexedDB wrapper, schema version 6)
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
| `db.ts` | Dexie schema (6 tables: assignments, texts, judgements, scores, previousFits, assignmentMeta) |
| `graph.ts` | DFS connectivity check |
| `export.ts` | CSV, Excel, PDF export |
| `exportImport.ts` | JSON dataset export/import, CSV import, Excel import |
| `document-parser.ts` | .docx parsing via Mammoth |
| `utils.ts` | Shared utilities (pairKey, kendallTau, cn) |

### Components (src/components/)

- `HeaderNav.tsx` — top navigation bar
- `DarkModeToggle.tsx` / `ThemeToggle.tsx` — theme switching
- `GradingSettingsDialog.tsx` — configure base grade, scale, min/max
- `ManageStudentsDialog.tsx` — edit student list for an assignment
- `StudentDetailsDialog.tsx` — detailed per-student scores modal
- `ui/` — shadcn-ui component library (do not edit directly)

### Database Schema (Dexie v6)

```
assignments:   ++id, title, createdAt
texts:         ++id, assignmentId, anonymizedName
judgements:    ++id, assignmentId, pairKey, textAId, textBId, raterId, supersedesJudgementId, createdAt
scores:        ++id, assignmentId, textId, rank
previousFits:  ++id, assignmentId, calculatedAt
assignmentMeta: assignmentId (gradeBase, gradeScale, gradeMin, gradeMax, judgementMode)
```

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

## Future Plans (Optional Enhancements)

The features below are **optional improvements** that can increase validity, reliability, or usability. Each one should be proposed to the user for approval before implementation, since the app must remain simple and accessible for non-technical colleagues.

**Always ask: "Wil je dat ik [feature X] toevoeg?" before starting work on any of these.**

---

### PLAN-1: Team Judgement Mode (multi-rater collaboration)

**What**: Allow multiple colleagues to judge the same assignment together, each on their own device, with combined results. Each rater is identified by name so differences can be traced.

**Why**: Multiple independent raters dramatically improve validity and reliability. In CJ literature, 2-3 raters are sufficient for stable rankings. Inter-rater agreement provides evidence that the ranking reflects real quality differences.

**Current state**: The `raterId` field exists on every Judgement but is auto-generated as a random string per page load. There is no human-readable name, no persistence across sessions, and no UI showing who judged what. This needs to be fixed first.

**Implementation steps**:

1. **Rater identification** (prerequisite for everything else):
   - Add `raterName` field to Judgement interface in `db.ts` (schema v7)
   - On Compare page, prompt "Wie ben je?" with a text input on first visit
   - Store name in `localStorage` for persistence across sessions
   - Generate stable `raterId` from name (slugified) instead of random string
   - Solo users can dismiss with "Alleen ik" — default name, no team UI

2. **Share via JSON export/import** (simplest, no server needed):
   - Teacher A creates the assignment and exports a JSON dataset
   - Colleagues B and C import the JSON, make their own comparisons, export back
   - Teacher A imports all JSON files — `importDataset()` already merges judgements with dedup
   - The `raterId` + `raterName` fields on each Judgement distinguish raters
   - Results page shows combined BT fit across all raters
   - "Deel opdracht" button exports texts-only JSON (no judgements) for clean start

3. **Per-rater overview on Results page** (only shown when >1 rater):
   - "Beoordelaarsoverzicht" card showing per rater: name, # judgements, model agreement %, tie rate
   - Flag raters with <60% agreement or >40% ties with gentle warnings
   - Overall inter-rater agreement percentage

4. **Disagreement analysis** (the key insight feature):
   - Detect pairs where raters explicitly disagree (A says X wins, B says Y wins)
   - "Meningsverschillen" section: list contested pairs, sorted by disagreement count
   - Per-text disagreement hotspots — texts involved in many disputes may be ambiguous
   - In StudentDetailsDialog: show which rater made each judgement

5. **Per-rater rank comparison** (advanced, behind "Toon achtergrondscores"):
   - Separate BT fit per rater (only those with >10 judgements)
   - Kendall's tau correlation between each rater's ranking and the consensus
   - Highlight texts with largest rank difference between raters

6. **Dashboard enhancements**:
   - Show rater count on assignment cards ("2 beoordelaars")
   - Include rater name in CSV/Excel/PDF exports and JSON dataset

7. **Solo mode must always work**. Team features are additive — a teacher working alone should never see team-specific UI unless they opt in (multiple raters detected).

**The existing data model mostly supports this**: `raterId` on Judgement, `getEffectiveJudgements()` handles per-rater dedup, `importDataset()` merges data. The main work is rater identification, analysis logic (`src/lib/rater-analysis.ts`), and UI.

---

### PLAN-2: Judge Consistency Metrics

**What**: Show per-rater agreement statistics and disagreement analysis when multiple raters are involved.

**Why**: One inconsistent rater can silently corrupt results. Without metrics, there is no way to identify rater disagreement. Teachers need to see where colleagues' views diverge — those are the texts worth discussing.

**How** (implemented as `src/lib/rater-analysis.ts`):
- **Per-judge model agreement**: % of judgements that agree with BT predicted winner. Flag judges <60%.
- **Per-judge tie rate**: % of EQUAL judgements. Warn if >40% (ties are half as informative).
- **Pairwise disagreement detection**: find pairs where rater A says X wins but rater B says Y wins.
- **Disagreement hotspots**: texts involved in the most disputes (may be genuinely ambiguous).
- **Per-rater BT fit** (advanced): separate BT per rater, Kendall's tau vs. consensus ranking.
- Show on Results page only when multiple raters exist, in collapsible sections.
- Simple Dutch labels: "Beoordelaarsoverzicht", "Meningsverschillen", "Overeenstemming".

**Depends on**: PLAN-1 step 1 (rater identification with `raterName` field).

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

### PLAN-6: Anchor-Based Grading (absolute calibration)

**What**: Let the teacher mark one or more texts as "anchor points" with a known grade, then calibrate the rest of the scale.

**Why**: Current grading is purely norm-referenced (average always gets base grade). This means a class of all excellent writers still produces low grades. Anchor points let teachers inject absolute quality standards.

**How**:
- UI: on Results page, let teacher click a text and say "this is a 6"
- Refit the linear transformation (base + scale * z) to pass through the anchor(s)
- If multiple anchors, use least-squares fit
- Show both "relatief cijfer" and "geijkt cijfer" columns

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

### PLAN-9: Tie Guidance in UI

**What**: Adjust the UI to gently discourage excessive use of "Gelijkwaardig" (equal/tie).

**Why**: Ties contribute half the Fisher information of decisive judgements, slowing convergence. The current UI says "Bij twijfel: Gelijkwaardig" which encourages ties.

**How**:
- Change guidance text to: "Kies de betere tekst, ook als het verschil klein is. Alleen gelijkwaardig als ze echt even goed zijn."
- Track tie rate per rater. If >40%, show a gentle nudge: "Tip: probeer vaker een keuze te maken, ook als het verschil klein is."
- Never block ties — they are valid judgements, just less informative.

---

### PLAN-10: Progress Dashboard per Text

**What**: Show a visual overview of which texts have been compared enough and which need more attention.

**Why**: Teachers currently only see overall cohort reliability. A per-text view helps them understand where to focus remaining effort.

**How**:
- Small bar chart or heat map on the Compare page showing each text's SE or comparison count
- Color coding: green (reliable), yellow (almost), red (needs work)
- Helps teachers decide whether to continue or stop
