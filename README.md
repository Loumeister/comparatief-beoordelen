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
- Kies altijd de betere tekst, ook als het verschil klein is — dat maakt de resultaten nauwkeuriger
- Gebruik "Gelijkwaardig" alleen als twee teksten echt even goed zijn
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
- **Beoordelaarsoverzicht** (alleen bij meerdere beoordelaars): per beoordelaar het aantal vergelijkingen, overeenstemming met het model, en gelijkwaardig-percentage
- **Meningsverschillen** (alleen bij meerdere beoordelaars): overzicht van paren waarover beoordelaars het oneens zijn
- **Ijkpunten** (optioneel): markeer een tekst als referentie-cijfer (bijv. "dit essay is een 6") om de cijferschaal te kalibreren. Het systeem toont dan zowel een relatief cijfer als een geijkt cijfer.

**Acties:**
- **"Toon technische details"**: Bekijk achtergrondscores (theta, SE, aantal beoordelingen)
- **"Exporteer naar CSV/Excel/PDF"**: Download resultaten voor verdere analyse
- **"Leerlingfeedback"**: Download een PDF met per leerling alle verzamelde opmerkingen — handig om uit te delen als feedback
- **"Terug naar vergelijken"**: Voeg meer beoordelingen toe als resultaten nog niet betrouwbaar zijn
- **"Terug naar Dashboard"**: Ga terug naar het overzicht

---

## 🎯 Typische Workflow

### Solo (alleen jij)
1. **Upload** → Upload alle leerlingteksten voor een opdracht
2. **Vergelijken** → Beoordeel door teksten te vergelijken (elk werk ~7-10x)
3. **Resultaten** → Bekijk de rangorde en exporteer cijfers
4. **(Optioneel) Terug naar Vergelijken** → Voeg meer beoordelingen toe als het nog niet betrouwbaar genoeg is

### Team (met collega's)
1. **Upload** → Maak de opdracht aan met alle teksten
2. **Deel** → Exporteer de opdracht via "Deel met collega" (teksten zonder oordelen)
3. **Collega's importeren** → Elke collega importeert het bestand en maakt eigen vergelijkingen
4. **Collega's exporteren** → Iedereen exporteert het resultaat als JSON-bestand
5. **Importeer alles** → Importeer alle JSON-bestanden. Het systeem combineert alle oordelen
6. **Resultaten** → Bekijk de gecombineerde rangorde, beoordelaarsoverzicht en eventuele meningsverschillen

---

## ⚙️ Technische Details

### Wiskundig model
- **Bradley-Terry model** met ridge-regularisatie
- **Newton-Raphson optimalisatie** voor theta-schatting
- **Standard Error (SE)** gebaseerd op de inverse van de volledige Hessian-matrix (Cholesky-decompositie)

### Betrouwbaarheidsdrempels
- Individueel: SE ≤ 0.75 (betrouwbaar), SE ≤ 1.00 (bijna klaar)
- Cohort: ≥70% betrouwbaar OF (mediaan ≤ 0.80 EN max ≤ 1.40)

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
→ Ja! Exporteer de opdracht via de "Deel met collega"-knop (teksten zonder oordelen). Je collega importeert het bestand, maakt eigen vergelijkingen, en exporteert het resultaat terug. Jij importeert alle bestanden — het systeem combineert alle oordelen automatisch in één rangorde. Op de Resultaten-pagina zie je per beoordelaar hoeveel vergelijkingen zijn gemaakt en hoe goed de onderlinge overeenstemming is.

**Waarom krijgen sommige teksten "Onvoldoende gegevens"?**
→ Ze zijn nog niet vaak genoeg vergeleken. Ga terug naar "Vergelijken" om meer beoordelingen toe te voegen.

**Wat zijn ijkpunten?**
→ Met ijkpunten kun je een of meer teksten een vast cijfer geven (bijv. "dit essay is een 6"). Het systeem past de hele schaal daarop aan. Handig als je vindt dat de relatieve cijfers niet aansluiten bij je verwachtingen. Je vindt het anker-icoon naast elk cijfer in de Resultaten-tabel.

**Kan ik feedback aan leerlingen geven?**
→ Ja! Tijdens het vergelijken kun je per tekst een korte opmerking invoeren (bijv. "goede opbouw" of "veel spelfouten"). Op de Resultaten-pagina kun je via de knop "Leerlingfeedback" een PDF downloaden met per leerling alle verzamelde opmerkingen — klaar om uit te delen.

**Waar wordt mijn data opgeslagen?**
→ Alle data wordt lokaal in je browser opgeslagen (IndexedDB). Er is geen server, geen login, en niets wordt naar het internet gestuurd. Als je je browserdata wist, verdwijnen ook je opdrachten — maak dus regelmatig een export.

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

De app wordt automatisch gedeployed naar **GitHub Pages** via een GitHub Actions workflow. Bij elke push naar `main` wordt de app gebouwd en gepubliceerd.

Base path: `/comparatief-beoordelen/`
