# Comparative Judgment App

Een applicatie voor het beoordelen van leerlingteksten via **comparative judgment** (vergelijkend beoordelen).

---

## 📚 Wat is Comparative Judgment?

**Comparative judgment** is een beoordelingsmethode waarbij je **niet direct een cijfer geeft**, maar **teksten paarsgewijs met elkaar vergelijkt**. In plaats van te beslissen "deze tekst verdient een 7", kies je simpelweg: "welke van deze twee teksten is beter?"

### Waarom comparative judgment?

- **Betrouwbaarder**: Mensen zijn beter in vergelijken dan in absoluut beoordelen.
- **Consistenter**: Je gebruikt automatisch dezelfde maatstaf voor alle teksten.
- **Efficiënter**: Je hoeft niet na te denken over cijfers of rubrics, alleen: "welke is beter?"

### Hoe werkt het?

1. Je krijgt twee anonieme teksten te zien.
2. Je leest beide teksten.
3. Je klikt op de betere tekst (of kiest "gelijkwaardig" als ze echt even goed zijn).
4. Het systeem gebruikt een wiskundig model (Bradley-Terry) om uit alle vergelijkingen een rangorde en cijfers te berekenen.

**Vuistregel**: Elk leerlingwerk moet ongeveer 7-10 keer vergeleken worden voor een betrouwbaar resultaat.

---

## 📊 Scores en Betrouwbaarheid

### Individuele scores per tekst

Na voldoende vergelijkingen krijgt elke tekst:

- **Cijfer** (1-10): Berekend op basis van de positie in de rangorde
- **Label**: 
  - *Topgroep* (top 10%)
  - *Bovengemiddeld* (11-50%)
  - *Gemiddeld* (51-90%)
  - *Onder gemiddeld* (onderste 10%)
- **Betrouwbaarheidsindicator**:
  - ✅ **Resultaat betrouwbaar** (SE ≤ 0.75) - voldoende vergelijkingen
  - ⚠️ **Nog enkele vergelijkingen nodig** (0.75 < SE ≤ 1.00) - bijna klaar
  - ❌ **Onvoldoende gegevens** (SE > 1.00) - meer vergelijkingen nodig

### Cohort-betrouwbaarheid (stopadvies)

Het systeem geeft aan wanneer je kunt **stoppen met beoordelen**:

- **Resultaat betrouwbaar (stopadvies)** als:
  - ≥70% van de teksten heeft SE ≤ 0.75, **of**
  - Mediaan(SE) ≤ 0.80 én max(SE) ≤ 1.40

---

## 🧭 Navigatie in de App

### 1️⃣ **Dashboard** (`/`)

Het startscherm toont al je opdrachten.

**Wat kun je hier doen:**
- Bekijk alle opdrachten met status (aantal teksten, aantal beoordelingen)
- Klik op **"Vergelijken"** om te starten met beoordelen
- Klik op **"Resultaten"** om de uitkomsten te bekijken
- Klik op **"Nieuw"** (rechtsonder) om een nieuwe opdracht aan te maken

---

### 2️⃣ **Upload** (`/upload`)

Upload leerlingteksten voor een nieuwe opdracht.

**Stappen:**
1. Geef de opdracht een naam
2. Stel optioneel beoordelingsinstellingen in (basis cijfer, schaal, min/max)
3. Upload teksten via **kopiëren/plakken** of **bestand uploaden**:
   - **Tekst**: Plak tekst direct in het veld
   - **Word (.docx)**: Upload één of meerdere Word-bestanden
   - **Excel/CSV**: Upload een bestand met meerdere teksten (één kolom)
4. Klik op **"Opslaan"** om de opdracht aan te maken

**Tips:**
- Je kunt anonieme labels gebruiken (bijv. "Tekst A", "Tekst B") of echte namen
- Zorg dat alle teksten dezelfde opdracht beantwoorden

---

### 3️⃣ **Vergelijken** (`/compare/:assignmentId`)

Hier beoordeel je door teksten paarsgewijs te vergelijken.

**Interface:**
- **Twee kolommen** met een tekst links en rechts
- **Knoppen onderaan**: "Tekst links is beter" | "Gelijkwaardig" | "Tekst rechts is beter"
- **Voortgangsbalk**: Toont hoeveel vergelijkingen je al hebt gedaan
- **Betrouwbaarheidsindicator**: Toont wanneer je kunt stoppen

**Workflow:**
1. Lees beide teksten aandachtig
2. Klik op de betere tekst (of "gelijkwaardig")
3. De volgende vergelijking verschijnt automatisch
4. Ga door tot het systeem aangeeft dat het cohort betrouwbaar is

**Tips:**
- Wees consistent: gebruik dezelfde criteria voor elke vergelijking
- Twijfel je? Kies dan "gelijkwaardig"
- Je kunt altijd stoppen en later verder gaan

---

### 4️⃣ **Resultaten** (`/results/:assignmentId`)

Bekijk de definitieve rangorde en cijfers.

**Wat zie je:**
- **Cohort-betrouwbaarheid**: Algemene betrouwbaarheidsstatus met statistieken
- **Voortgang**: Grafiek met vergelijkingen per tekst
- **Rangorde-tabel**: Alle teksten gesorteerd op kwaliteit met:
  - Rang (1 = beste)
  - Label (Topgroep, Bovengemiddeld, etc.)
  - Cijfer (1-10)
  - Betrouwbaarheidsindicator per tekst

**Acties:**
- **"Toon details"**: Bekijk technische scores (theta, SE, aantal beoordelingen)
- **"Exporteer naar CSV/Excel"**: Download resultaten voor verdere analyse
- **"Terug naar vergelijken"**: Voeg meer beoordelingen toe als resultaten nog niet betrouwbaar zijn
- **"Terug naar Dashboard"**: Ga terug naar het overzicht

---

## 🎯 Typische Workflow

1. **Upload** → Upload alle leerlingteksten voor een opdracht
2. **Vergelijken** → Beoordeel door teksten te vergelijken (elk werk ~7-10x)
3. **Resultaten** → Bekijk de rangorde en exporteer cijfers
4. **(Optioneel) Terug naar Vergelijken** → Voeg meer beoordelingen toe als het nog niet betrouwbaar genoeg is

---

## ⚙️ Technische Details

### Wiskundig model
- **Bradley-Terry modptimalisatie** voor theta-schatting
- **Standard Error (SE)** gebaseerd op Hessian-diagonaalel** met ridge-regularisatie
- **Newton-Raphson o

### Betrouwbaarheid & stopadvies
- **Individueel**: 
  - SE ≤ 0.75: "Resultaat betrouwbaar"
  - SE ≤ 1.00: "Nog enkele vergelijkingen nodig"
  - SE > 1.00: "Onvoldoende gegevens"
- **Cohort (stopadvies)**: 
  - ≥70% betrouwbaar (SE ≤ 0.75), **of**
  - Mediaan(SE) ≤ 0.80 én max(SE) ≤ 1.40
- **Minimum vergelijkingen**: Elke tekst krijgt minimaal 5 vergelijkingen (MIN_BASE) voordat deze als "klaar" wordt beschouwd

### Pairing-strategie
- **Bridging**: Prioriteit voor vergelijkingen tussen ongekoppelde groepen
- **Informatief**: Focus op teksten met hoge SE en kleine θ-verschillen
- **Adaptief**: Past zich aan naarmate er meer data komt

---

## 💡 Veelgestelde Vragen

**Hoeveel vergelijkingen zijn nodig?**  
→ Ongeveer 7-10 vergelijkingen per tekst. Het systeem geeft aan wanneer je kunt stoppen.

**Wat als ik een fout maak?**  
→ Geen probleem! Het model is robuust en één foutje heeft weinig impact bij voldoende vergelijkingen.

**Kan ik met meerdere mensen tegelijk beoordelen?**  
→ Ja, de app slaat alle vergelijkingen op en combineert ze in één rangorde.

**Waarom krijgen sommige teksten "Onvoldoende gegevens"?**  
→ Ze zijn nog niet vaak genoeg vergeleken. Ga terug naar "Vergelijken" om meer beoordelingen toe te voegen.

---

## 🛠️ Technische Informatie (voor ontwikkelaars)

Dit project is gebouwd met:
- **React** + **TypeScript**
- **Vite** (build tool)
- **Dexie** (IndexedDB voor lokale opslag)
- **Tailwind CSS** + **shadcn-ui** (design system)
- **Recharts** (data visualisatie)

### Lokaal draaien

```sh
npm install
npm run dev
```

### Deployment
Open [Lovable](https://lovable.dev/projects/6a46e496-25a4-434c-8bbe-27f6fad7edcf) en klik op Share → Publish.
