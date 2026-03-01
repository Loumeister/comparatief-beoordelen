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
| `rater-analysis.ts` | Per-rater agreement stats, disagreement detection, tie rate, judge infit |
| `split-half.ts` | Monte Carlo split-half reliability coefficient with Spearman-Brown correction |
| `anchor-grading.ts` | Anchor-based grading: refit linear transform through teacher-set anchor points |
| `reliability-status.ts` | Derive cohort reliability status (reliable/moderate/insufficient) from ExportData |
| `utils.ts` | Shared utilities (pairKey, kendallTau, cn) |

### Custom Hooks (src/hooks/)

| Hook | Used by | Responsibility |
|------|---------|----------------|
| `use-assignment-data.ts` | (shared) | Load assignment + texts + judgements + meta from IndexedDB |
| `use-results-data.ts` | Results | BT calculation, rater analysis, split-half reliability, anchor management, all exports |
| `use-compare-data.ts` | Compare | BT maps, pair generation with fallback, judgement saving, manual pair selection, undo/review |
| `use-compare-data.ts` (useRaterIdentification) | Compare | Rater name/id, localStorage persistence |
| `use-dashboard-data.ts` | Dashboard | Assignment stats, CRUD, file import (JSON/CSV/XLSX) |

### Components (src/components/)

- `HeaderNav.tsx` — dark mode toggle (accepts optional `className`)
- `GradingSettingsDialog.tsx` — configure base grade, scale, min/max, rounding
- `ManageStudentsDialog.tsx` — edit student list for an assignment
- `StudentDetailsDialog.tsx` — detailed per-student scores modal
- `results/` — Results page subcomponents:
  - `ReliabilityCard.tsx` — cohort reliability progress bar + split-half coefficient
  - `RaterOverviewCard.tsx` — collapsible per-rater stats table with judge infit
  - `DisagreementsCard.tsx` — collapsible list of contested pairs
  - `AnchorInfoCard.tsx` — anchor status banner with clear-all button
  - `ResultsTable.tsx` — sortable results table with search, anchor/detail toggle
  - `GradeHistogram.tsx` — grade distribution bar chart (pure CSS)
  - `AnchorDialog.tsx` — set/edit/remove anchor grade for a text
  - `FeedbackDialog.tsx` — configure and trigger per-student feedback PDF export
- `compare/TextCard.tsx` — text display card (plain text, HTML, paper-only; fullscreen dialog)
- `compare/TextProgressCard.tsx` — per-text SE/comparison progress overview
- `compare/MyJudgementsDialog.tsx` — review/revise past judgements dialog
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
                         gradeMin?, gradeMax?, gradeRounding?, anchors?
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

## Implemented Features

All of the following are live in the current codebase. See `ROADMAP.md` for pending plans and competitive analysis.

| Plan | Feature | Key files |
|------|---------|-----------|
| PLAN-1 | Multi-rater collaboration: rater identification, JSON share/merge, per-rater overview, disagreements | `Compare.tsx`, `rater-analysis.ts`, `Results.tsx` |
| PLAN-2 | Judge consistency metrics: agreement %, tie rate, pairwise disagreements | `rater-analysis.ts`, `RaterOverviewCard.tsx`, `DisagreementsCard.tsx` |
| PLAN-3 | Item infit/outfit per text (threshold 0.7–1.3), shown behind technical-details toggle | `bradley-terry.ts`, `ResultsTable.tsx` |
| PLAN-4 | 113 unit tests across 10 files | `src/lib/__tests__/` |
| PLAN-6 | Anchor-based grading: schema v9 `anchors`, single-anchor offset, multi-anchor least-squares | `anchor-grading.ts`, `AnchorDialog.tsx`, `AnchorInfoCard.tsx` |
| PLAN-9 | Tie guidance: nudge shown when rater's tie rate exceeds 40% | `Compare.tsx` |
| PLAN-10 | Per-text SE progress card on Compare page (worst-first, color-coded) | `compare/TextProgressCard.tsx` |
| PLAN-11 | UX polish: 8 teacher-facing improvements (labels, hints, tooltips) | Various |
| PLAN-12 | Judge infit per rater (requires ≥10 judgements; flags >1.2 / >1.5) | `rater-analysis.ts`, `RaterOverviewCard.tsx` |
| PLAN-13 | Split-half reliability: 20 Monte Carlo splits, Spearman-Brown correction | `split-half.ts`, `ReliabilityCard.tsx` |
| PLAN-19 | Undo/review judgements: 5s toast, revise-in-place dialog, `supersedesJudgementId` | `MyJudgementsDialog.tsx`, `use-compare-data.ts` |
| UI-1 | Grade distribution histogram (pure CSS, no chart library) | `GradeHistogram.tsx` |
| UI-2 | Student name search/filter in Results table | `ResultsTable.tsx` |
| UI-3 | Grade rounding toggle (0.1 / 0.5 / 1) stored on `assignmentMeta.gradeRounding` | `GradingSettingsDialog.tsx`, `use-results-data.ts` |
| UI-4 | Assignment duplication (clones texts, excludes judgements/meta) | `use-dashboard-data.ts`, `AssignmentCard.tsx` |
| UI-5 | Assignment search/filter on Dashboard (appears when ≥4 assignments exist) | `Dashboard.tsx` |
| UI-6 | Prominent "Ga verder →" / "Vergelijk" button based on judgement progress | `AssignmentCard.tsx` |
| UI-7 | Print stylesheet: `.no-print` utility, table borders, `break-inside: avoid` | `index.css` |
| UI-8 | Fullscreen text reader dialog (Maximize2 icon on each TextCard) | `compare/TextCard.tsx` |
| UI-9 | Keyboard shortcut E (alias for T) for Gelijkwaardig | `Compare.tsx` |
