# Growth Plan: Internationalization & Business Model

> Written: 2026-02-28
> Scope: technical i18n roadmap, school licensing, and full automation stack
> Principle: **maximum automation, minimum ongoing maintenance**

---

## 1. Vision

The app is already psychometrically solid, free, local-first, and Dutch. That combination has no real competition in the Dutch market — but Comproved is well-funded and targeting the same schools.

The highest-leverage move is **internationalizing first, monetizing second**. A translated English version reaches a market 20–30× larger where the dominant tools (No More Marking, RM Compare) are expensive and institution-only. French and German markets have almost no local CJ tooling at all.

Monetization stays simple: **the app is always free for individuals**. Schools get a paid support package that gives them an invoice for their accounting department, an onboarding call, and priority support — not a feature gate.

---

## 2. Current State

| Dimension | Status |
|---|---|
| Languages | Dutch only (~300–400 hardcoded strings) |
| i18n infrastructure | None |
| Deploy | GitHub Pages via GitHub Actions (automated) |
| Tests | 113 Vitest tests (automated on PR with minor CI extension) |
| Backend | None (local-first IndexedDB) |
| Licensing | None |
| Analytics | None |

---

## 3. Market Opportunity

### 3.1 By Language

| Language | Teacher population | CJ tool competition | Strategic value |
|---|---|---|---|
| **Dutch** (current) | ~170k (NL + BE) | High (Comproved) | Defend, not grow |
| **English** | Millions (UK, US, AU) | High (NMM, RM Compare) — but they're expensive | High volume, differentiator = free & local |
| **French** | ~800k (FR + BE-fr + QC) | Near zero | **Best opportunity** — large + uncontested |
| **German** | ~800k (DE + AT + CH) | Near zero | Strong second target |
| **Spanish** | Millions | Near zero | Long-term, lower CJ awareness |

### 3.2 Competitive Positioning by Language

**English**: compete on *free + local-first + no account needed*. NMM costs schools £4–8/student/year. RM Compare is enterprise-priced. Our angle: "professional-grade CJ, no budget, no IT approval needed."

**French / German**: first-mover advantage. The concept of *évaluation comparative* / *vergleichendes Beurteilen* is taught in teacher training programs but no accessible tool exists. This is a greenfield.

---

## 4. Business Model

### 4.1 Recommended: Free App + School Support Package

The app remains **100% free and open-source**. Schools pay for:

| Tier | Price | What's included | Automated? |
|---|---|---|---|
| **Free** | €0 | Full app, forever | — |
| **School Plan** | €150–250/year | Invoice (for school admin), onboarding video call (1h), priority email support, licence key for tracking | ~80% automated |
| **District Plan** | €500–800/year | Everything above × 5 schools, shared results session | ~60% automated |

**Why this works for a no-server app:**
- Schools need an invoice. A free tool with no paper trail is hard to "buy" through procurement. A €150 annual fee with an invoice solves this.
- Most support questions are answered by the in-app ReadMe. Email support costs ~30 min/month once the FAQ covers the top 10 questions.
- Renewals are fully automated via LemonSqueezy.

### 4.2 What the Licence Key Does

The licence key is **symbolic, not technical DRM** — the app is open-source so any school could fork it. The key:
- Validates offline via HMAC-SHA256 pattern check (no server call at runtime)
- Unlocks a small "School Plan" badge in the header (visible to teachers, signals legitimacy)
- Stores school name in `localStorage` for personalised export headers ("Rapport — Obs De Esdoorn")

This is not a paywall. It is a receipted relationship.

### 4.3 Revenue Projection

| Scenario | Schools | Annual |
|---|---|---|
| Conservative | 20 NL + 10 EN | €4,500 |
| Moderate | 50 NL + 30 EN + 20 FR | €15,000 |
| Optimistic | 150 schools across 4 languages | €37,500 |

These numbers are achievable with **zero sales staff** — pure inbound from GitHub, word-of-mouth, and teacher communities.

---

## 5. Technical i18n Plan

### 5.1 Library Choice

| Option | Verdict |
|---|---|
| `react-i18next` | **Use this.** Industry standard, excellent TypeScript support, lazy-loads translations, works with all major translation management platforms |
| `next-intl` | Not applicable (not Next.js) |
| `lingui` | Good but smaller ecosystem |

Add `i18next`, `react-i18next`, and `i18next-browser-languagedetector`.

### 5.2 File Structure

```
src/
  locales/
    nl/
      common.json        # shared: buttons, labels, errors
      compare.json       # Compare page
      results.json       # Results page
      upload.json        # Upload page
      dashboard.json     # Dashboard
      readme.json        # ReadMe page (long-form)
    en/
      ... (same structure)
    fr/
      ...
    de/
      ...
```

Namespace per page avoids loading all strings on every route. `common.json` is always loaded.

### 5.3 Language Detection Order

```
localStorage → browser language → fallback to 'nl'
```

- A small language selector (flag + ISO code) sits in `HeaderNav.tsx`
- Persists to `localStorage` so it survives reloads
- No URL-based language routing — keeps URLs clean and IndexedDB data portable across language switches

### 5.4 String Extraction Automation

`i18next-parser` scans source files and produces/updates JSON translation files automatically.

```sh
npx i18next-parser --config i18next-parser.config.js
```

Config (`i18next-parser.config.js`):
```js
module.exports = {
  locales: ['nl', 'en', 'fr', 'de'],
  defaultNamespace: 'common',
  output: 'src/locales/$LOCALE/$NAMESPACE.json',
  input: ['src/**/*.{ts,tsx}'],
  sort: true,
  keepRemoved: false,  // auto-cleans deleted strings
}
```

This runs in CI on every push to `main`. New strings appear in `nl` (filled by developer), appear as empty in other locales, and trigger the translation platform to notify translators.

### 5.5 TypeScript Safety

Generate a typed `useTranslation` hook via `i18next-resources-to-backend` or `i18next-typescript` so that `t('key.that.does.not.exist')` is a compile error.

---

## 6. Automation Stack

This is the core of the plan. Every step that can run without human action, should.

### 6.1 CI/CD (GitHub Actions)

Extend the existing `deploy.yml` and add two new workflows:

#### `ci.yml` — runs on every PR

```yaml
jobs:
  test:       # npx vitest run
  lint:       # npm run lint
  i18n-check: # npx i18next-parser --dry-run → fail if new untranslated strings in nl/
  build:      # npm run build (catch broken imports)
```

**Effect**: No broken strings or failed tests can reach `main`.

#### `i18n-sync.yml` — runs after merge to `main`

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/**/*.tsx'
      - 'src/**/*.ts'
jobs:
  extract:
    steps:
      - run: npx i18next-parser
      - uses: peter-evans/create-pull-request@v6  # opens PR if new strings found
        with:
          title: "i18n: new untranslated strings detected"
          branch: i18n/auto-extract
```

**Effect**: Developers never forget to add translation keys. New strings automatically surface as a PR.

### 6.2 Translation Management — Crowdin

**Why Crowdin**: free for open-source projects, has a GitHub integration that bidirectionally syncs with the repo, provides a web UI for volunteer translators, and can run machine pre-translation (DeepL/Google) that human reviewers then correct.

**Setup** (one-time, ~2 hours):
1. Create project on crowdin.com (free for open-source)
2. Install the Crowdin GitHub App → authorize the repo
3. Add `crowdin.yml` to the repo root:

```yaml
# crowdin.yml
project_id: "<project_id>"
api_token_env: CROWDIN_PERSONAL_TOKEN
files:
  - source: /src/locales/nl/*.json   # Dutch is the source
    translation: /src/locales/%two_letters_code%/%original_file_name%
```

**Automated flow:**
1. `i18n-sync.yml` runs `i18next-parser` → updates `src/locales/nl/*.json`
2. Crowdin GitHub App detects changes → pulls new Dutch strings into Crowdin
3. Machine pre-translation (DeepL) fills English/French/German drafts automatically
4. Human reviewers approve via Crowdin UI (volunteers or community)
5. When a language reaches 100% approved, Crowdin opens a PR to the repo automatically
6. PR is reviewed and merged → next deploy includes the new language

**Zero manual steps for the maintainer once configured.**

### 6.3 Billing & Licensing — LemonSqueezy

**Why LemonSqueezy**: handles EU VAT (critical for selling to European schools), sends invoices automatically, manages annual renewals with retry logic, webhooks for custom actions. No monthly fee — 5% + $0.50 per transaction.

**Setup** (one-time, ~3 hours):

1. Create LemonSqueezy store
2. Create two products: "School Plan" (€200/year) and "District Plan" (€600/year)
3. Checkout link → embed on a simple GitHub Pages landing page (`/pricing`)

**Automated licence key delivery:**

```
LemonSqueezy payment → webhook → Cloudflare Worker → generate key → Resend email
```

The Cloudflare Worker (free tier, 100k req/day):

```typescript
// worker.ts
async function handleWebhook(event: LemonSqueezyEvent) {
  const { school_name, email, order_id } = event.meta.custom_data;
  const expiry = new Date().getFullYear() + 1;

  // HMAC key: schoolSlug + expiryYear, signed with env secret
  const key = await generateHMACKey(slugify(school_name), expiry, env.LICENSE_SECRET);

  await sendEmail({
    to: email,
    subject: "Uw licentiesleutel — Comparatief Beoordelen",
    body: licenceEmailTemplate({ school_name, key, expiry })
  });

  await logToKV(order_id, { school_name, email, key, expiry }); // Cloudflare KV, free
}
```

**Key validation in the app (offline):**

```typescript
// src/lib/licence.ts
export async function validateLicenceKey(key: string, schoolName: string): Promise<boolean> {
  const currentYear = new Date().getFullYear();
  const slug = slugify(schoolName);
  // Try current year and next (grace period for late renewals)
  for (const year of [currentYear, currentYear + 1]) {
    const expected = await generateHMACKey(slug, year, COMPILED_SECRET);
    if (timingSafeEqual(key, expected)) return true;
  }
  return false;
}
```

`COMPILED_SECRET` is injected at build time via Vite `define`. This is obfuscation, not hard security — intentional, since the app is open-source.

**Renewal automation:**
- LemonSqueezy sends renewal reminders 30/7 days before expiry (built-in)
- Failed payments retry automatically for 14 days
- Cancellations trigger a "key expired" state in the app (graceful degradation: badge disappears, all features remain)

### 6.4 Analytics — Plausible

**Why Plausible**: privacy-compliant (no cookie banner needed under GDPR), €9/month for up to 10k pageviews, simple script embed, no personal data collected.

Add to `index.html`:
```html
<script defer data-domain="<github-pages-domain>" src="https://plausible.io/js/script.js"></script>
```

Track custom events for key actions:
```typescript
// track language switches, exports, number of comparisons made
plausible('export', { props: { format: 'pdf', language: i18n.language } });
```

**What to watch:**
- Language breakdown (tells you which translations are being used)
- Bounce rate on landing page (tells you if the pitch works)
- Compare → Results funnel completion rate

### 6.5 Support Automation

| Channel | Tool | Cost | Automation |
|---|---|---|---|
| Bug reports | GitHub Issues (existing) | Free | Issue templates auto-categorise |
| FAQ / docs | In-app ReadMe (existing) + `/help` page | Free | Already done |
| Email (School Plan) | Fastmail alias → shared inbox | €3/mo | Auto-reply with FAQ link + SLA |
| Onboarding call | Calendly (free tier) | Free | LemonSqueezy post-purchase redirect to Calendly |

**Issue templates** (`.github/ISSUE_TEMPLATE/`):
- `bug_report.yml` — structured form, asks for language/browser/steps
- `translation_error.yml` — for flagging wrong translations
- `feature_request.yml` — linked to roadmap categories

### 6.6 Landing Page

A separate simple GitHub Pages site (`/pricing` route on the same domain, or a separate repo) with:
- 30-second explanation of what the app does
- Language selector → links to the app
- "School Plan" CTA → LemonSqueezy checkout
- FAQ section (reduces support emails)

Generated as static HTML — no framework, no build step, auto-deploys from `docs/` folder.

---

## 7. Phased Roadmap

### Phase 1: i18n Foundation (2 weeks)

**Goal**: app supports multiple languages, all infrastructure in place.

| Task | Effort | Automated after? |
|---|---|---|
| Install `react-i18next`, configure namespaces | 2h | — |
| Run `i18next-parser`, extract all Dutch strings | 3h | Yes (CI) |
| Replace hardcoded strings in all `.tsx` files | 1–2 days | — |
| Add language selector to `HeaderNav.tsx` | 2h | — |
| Add `i18n-check` job to GitHub Actions CI | 1h | Yes |
| Add `i18n-sync.yml` auto-extract workflow | 1h | Yes |
| Configure Crowdin + GitHub App | 2h | Yes |
| Set up machine pre-translation in Crowdin | 1h | Yes |
| Add Plausible analytics embed | 30min | Yes |

**Deliverable**: Dutch app unchanged. i18n infrastructure live. Crowdin ready for translators.

### Phase 2: English Translation (1 week)

**Goal**: English version live, reachable by non-Dutch teachers.

| Task | Effort | Notes |
|---|---|---|
| Review Crowdin machine translation (EN) | 4–6h | One-time; DeepL quality is ~85% for UI strings |
| Translate `readme.json` (long-form docs) | 3–4h | Machine translation needs heavier editing here |
| Update GitHub repo README.md with English section | 30min | — |
| Add English to `deploy.yml` smoke test | 30min | — |
| Submit to ProductHunt, r/edtech, Hacker News | 1h | One-time launch |

**Deliverable**: English app live. First non-Dutch users.

### Phase 3: School Licensing (1 week)

**Goal**: payment flow live, first paying school.

| Task | Effort | Notes |
|---|---|---|
| Create LemonSqueezy products + checkout | 2h | — |
| Build Cloudflare Worker for key generation | 3h | ~50 lines TypeScript |
| Set up Resend email for key delivery | 1h | — |
| Implement `licence.ts` in app | 3h | HMAC validation, localStorage |
| Add `SchoolBadge` to `HeaderNav.tsx` | 1h | Simple conditional render |
| Build `/pricing` landing page | 3h | Static HTML |
| Set up Calendly for onboarding calls | 30min | Free tier |
| Add issue templates to `.github/` | 1h | — |
| Write FAQ (covers top 10 questions) | 2h | One-time |

**Deliverable**: School Plan purchasable end-to-end, fully automated from payment to key delivery.

### Phase 4: French & German (4–6 weeks, mostly async)

**Goal**: French and German live, community translators contributing.

| Task | Effort | Notes |
|---|---|---|
| Review Crowdin machine translation (FR) | 4–6h | — |
| Review Crowdin machine translation (DE) | 4–6h | — |
| Post in French/German teacher communities | 2h | One-time outreach |
| Adjust pricing page for FR/DE markets | 1h | Consider €150/year for smaller markets |

**Deliverable**: Two new language markets, zero new infrastructure.

---

## 8. What NOT to Do

These are decisions that look tempting but would undermine the core value proposition:

| Temptation | Why to avoid |
|---|---|
| Add a server for "better" licence validation | Kills the local-first guarantee. Teachers can't use it on a school network that blocks external calls. |
| Feature-gate core functionality behind payment | Alienates the individual teachers who are your best evangelists. |
| Build a multi-tenant SaaS version | Different product, different codebase, months of work, ongoing server costs. Doesn't leverage what makes this app good. |
| Add URL-based language routing (`/en/compare/123`) | Breaks IndexedDB data (assignment IDs are keyed to the origin path). |
| Charge per-student or per-judgement | Impossible to enforce in a local-first app. Just creates resentment. |
| Build a custom CMS for translations | Crowdin is free for open-source and already solved this problem. |

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Machine translations have errors, schools complain | Medium | Medium | Crowdin review step + "report translation error" GitHub issue template |
| LemonSqueezy changes pricing or shuts down | Low | High | Stripe is the fallback. Worker code is portable. |
| Crowdin ends free OSS tier | Low | Medium | Weblate is self-hostable alternative. JSON files stay in repo. |
| GitHub Pages blocks paid content | Low | Low | The app is free. The landing page just links to LemonSqueezy. |
| Competing tool launches in FR/DE before us | Medium | Medium | Speed to market matters. Phase 1–2 should ship within 4 weeks. |
| GDPR questions about Plausible | Low | Low | Plausible is cookie-free, EU-hosted, explicitly GDPR-compliant. |
| Key is extracted and shared between schools | High | Low | Intentionally accepted. App is open-source. Schools are trusted professionals. |

---

## 10. Summary: Minimal Ongoing Work

Once the automation stack is live, the **steady-state maintenance per month** is:

| Activity | Time |
|---|---|
| Review Crowdin PRs (new translations) | ~1h |
| Answer support emails (School Plan) | ~1h |
| Fix bugs found via GitHub Issues | varies |
| Review `i18n-sync` auto-PRs | 15 min |
| Check Plausible dashboard | 10 min |
| **Total non-feature work** | **~3h/month** |

New translations, billing, renewals, key delivery, CI, and deploy all run without human action.
