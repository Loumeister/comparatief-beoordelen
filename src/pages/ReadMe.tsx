import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { HeaderNav } from '@/components/HeaderNav';

const ReadMe = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/10 to-[hsl(var(--choice-b))]/10 border-b">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-start justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Terug naar overzicht
            </Button>
            <HeaderNav />
          </div>
          <h1 className="text-4xl font-bold mb-4">Handleiding</h1>
          <p className="text-xl text-muted-foreground">
            Stap voor stap uitleg over vergelijkende beoordeling
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-8 space-y-8">

        {/* Quick Start */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Snel aan de slag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>In drie stappen van leerlingteksten naar cijfers:</p>
            <ol className="list-decimal list-inside space-y-2">
              <li><strong>Maak een opdracht aan</strong> — klik op "Nieuwe Opdracht" en upload de teksten van je leerlingen.</li>
              <li><strong>Vergelijk</strong> — je krijgt steeds twee teksten te zien. Klik op de betere. Herhaal dit tot het systeem aangeeft dat je kunt stoppen.</li>
              <li><strong>Bekijk resultaten</strong> — het systeem berekent automatisch een rangorde met cijfers. Download als Excel of PDF.</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-2">
              Dat is alles! Hieronder vind je uitgebreidere uitleg per onderdeel.
            </p>
          </CardContent>
        </Card>

        {/* What is CJ */}
        <Card>
          <CardHeader>
            <CardTitle>Wat is vergelijkende beoordeling?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Bij vergelijkende beoordeling geef je <strong>niet direct een cijfer</strong>. In plaats daarvan vergelijk je steeds twee teksten en kies je welke beter is. Uit al die vergelijkingen berekent het systeem een betrouwbare rangorde.
            </p>

            <div>
              <h4 className="font-semibold mb-2">Waarom werkt dit beter dan cijfers geven?</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>Eerlijker</strong> — je vergelijkt altijd met dezelfde maatstaf, omdat je twee teksten direct naast elkaar ziet.</li>
                <li><strong>Betrouwbaarder</strong> — onderzoek toont aan dat mensen beter zijn in vergelijken dan in absoluut beoordelen.</li>
                <li><strong>Sneller</strong> — je hoeft niet na te denken over rubrics of punten. Alleen: welke is beter?</li>
              </ul>
            </div>

            <p className="text-sm bg-muted/50 p-3 rounded-lg">
              <strong>Vuistregel:</strong> elke tekst moet ongeveer 7 tot 10 keer vergeleken worden voor een betrouwbaar resultaat. Het systeem geeft aan wanneer je genoeg hebt gedaan.
            </p>
          </CardContent>
        </Card>

        {/* Step 1: Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Stap 1: Opdracht aanmaken</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Klik op <strong>"Nieuwe Opdracht"</strong> op het startscherm.</p>

            <div>
              <h4 className="font-semibold mb-2">Teksten toevoegen</h4>
              <p className="text-muted-foreground mb-2">Er zijn twee manieren:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>
                  <strong>Bestanden uploaden</strong> — sleep Word-bestanden (.docx) of tekstbestanden (.txt) naar het uploadveld. Elk bestand wordt een aparte leerlingtekst.
                </li>
                <li>
                  <strong>Alleen namen invoeren</strong> — handig als je papieren teksten beoordeelt. Typ de namen van de leerlingen (of anonieme codes zoals "Tekst 1", "Tekst 2"). Tijdens het vergelijken zie je dan een kaartje met de naam in plaats van de volledige tekst.
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Instellingen</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>Titel</strong> — geef de opdracht een herkenbare naam (bijv. "Betoog 3V").</li>
                <li><strong>Genre</strong> (optioneel) — bijv. "Betoog", "Verhaal", "Verslag". Puur voor je eigen overzicht.</li>
              </ul>
            </div>

            <p className="text-sm text-muted-foreground">
              Je kunt later altijd leerlingen toevoegen of verwijderen via "Leerlingbeheer" op het startscherm.
            </p>
          </CardContent>
        </Card>

        {/* Step 2: Compare */}
        <Card>
          <CardHeader>
            <CardTitle>Stap 2: Vergelijken</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Klik op <strong>"Vergelijk"</strong> bij een opdracht. Je ziet twee teksten naast elkaar.
            </p>

            <div>
              <h4 className="font-semibold mb-2">Wat moet je doen?</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Lees beide teksten.</li>
                <li>Klik op de knop van de <strong>betere</strong> tekst.</li>
                <li>Zijn ze echt even goed? Klik dan op <strong>"Gelijkwaardig"</strong>.</li>
                <li>Het volgende paar verschijnt automatisch.</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Sneltoetsen (optioneel)</h4>
              <p className="text-muted-foreground mb-2">Als je snel wilt werken, kun je het toetsenbord gebruiken:</p>
              <ul className="list-disc list-inside text-muted-foreground">
                <li><strong>A</strong> — kies de linker tekst</li>
                <li><strong>B</strong> — kies de rechter tekst</li>
                <li><strong>T</strong> — gelijkwaardig</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Opmerkingen</h4>
              <p className="text-muted-foreground">
                Onder de knoppen kun je een korte opmerking typen bij elke tekst (bijv. "goede opbouw" of "veel spelfouten"). Dit is optioneel en puur voor jezelf — het telt niet mee voor het cijfer. De opmerkingen verschijnen later bij de resultaten per leerling.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Wanneer stoppen?</h4>
              <p className="text-muted-foreground">
                Bovenaan zie je een voortgangsbalk. Zodra er genoeg vergelijkingen zijn, verschijnt een groen bericht: <strong>"Resultaten zijn betrouwbaar"</strong>. Je kunt dan stoppen, maar je mag altijd doorgaan voor nog nauwkeurigere resultaten.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Tips</h4>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Kies altijd de betere tekst, ook als het verschil klein is. Gebruik "Gelijkwaardig" alleen als ze echt even goed zijn.</li>
                <li>Wees consistent: gebruik dezelfde criteria bij elke vergelijking.</li>
                <li>Je kunt tussendoor stoppen en later verder gaan — je voortgang wordt automatisch opgeslagen.</li>
                <li>Maak je geen zorgen over fouten. Een enkel verkeerd oordeel heeft nauwelijks invloed op het eindresultaat.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Results */}
        <Card>
          <CardHeader>
            <CardTitle>Stap 3: Resultaten bekijken</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Klik op <strong>"Resultaten"</strong> bij een opdracht. Je ziet de rangorde van alle leerlingen met cijfers.
            </p>

            <div>
              <h4 className="font-semibold mb-2">Wat zie je?</h4>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>
                  <strong>Rangorde</strong> — alle teksten gesorteerd van best naar minst goed. Klik op een naam om alle vergelijkingen en opmerkingen van die leerling te zien.
                </li>
                <li>
                  <strong>Cijfer</strong> — automatisch berekend. De gemiddelde leerling krijgt standaard een 7,0. Dit kun je aanpassen via "Cijferinstellingen" op het startscherm.
                </li>
                <li>
                  <strong>Label</strong> — Topgroep (beste 10%), Bovengemiddeld, Gemiddeld, of Onder gemiddeld (onderste 10%).
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Betrouwbaarheid</h4>
              <p className="text-muted-foreground mb-2">Bovenaan zie je of de resultaten betrouwbaar zijn:</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground"><strong>Betrouwbaar</strong> — er zijn genoeg vergelijkingen gedaan. Je kunt de cijfers gebruiken.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground"><strong>Bijna klaar</strong> — nog een paar vergelijkingen nodig. De rangorde is al grotendeels stabiel.</span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground"><strong>Onvoldoende</strong> — nog te weinig vergelijkingen. Ga terug naar "Vergelijken" om er meer te doen.</span>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Exporteren</h4>
              <p className="text-muted-foreground">
                Je kunt de resultaten downloaden als <strong>Excel</strong> (handig voor in je cijferadministratie), <strong>PDF</strong> (handig om uit te printen), of <strong>CSV</strong> (voor eigen verwerking).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Team mode */}
        <Card>
          <CardHeader>
            <CardTitle>Samenwerken met collega's</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Je kunt dezelfde set teksten met meerdere collega's beoordelen. Dat maakt de resultaten nog betrouwbaarder.
            </p>

            <div>
              <h4 className="font-semibold mb-2">Hoe werkt het?</h4>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>Maak de opdracht aan en upload de teksten.</li>
                <li>Ga naar Resultaten en klik op <strong>"Deel met collega"</strong>. Dit downloadt een bestand met alleen de teksten (zonder jouw oordelen).</li>
                <li>Stuur dit bestand naar je collega's. Zij klikken op <strong>"Importeer bestand"</strong> op het startscherm.</li>
                <li>Iedereen beoordeelt zelfstandig op eigen apparaat.</li>
                <li>Elke collega exporteert zijn/haar dataset via <strong>"Volledige back-up"</strong> op de resultatenpagina en stuurt het bestand naar jou terug.</li>
                <li>Jij importeert alle bestanden. De oordelen worden automatisch samengevoegd.</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Beoordelaarsoverzicht</h4>
              <p className="text-muted-foreground">
                Zodra er meerdere beoordelaars zijn, verschijnt op de resultatenpagina een <strong>"Beoordelaarsoverzicht"</strong>. Daar zie je per collega hoeveel vergelijkingen hij/zij heeft gedaan en hoe goed de oordelen overeenkomen met de gezamenlijke rangorde.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Meningsverschillen</h4>
              <p className="text-muted-foreground">
                Als collega's het bij bepaalde paren oneens zijn, verschijnt een overzicht <strong>"Meningsverschillen"</strong>. Dit zijn precies de teksten die het meest geschikt zijn om samen te bespreken.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Grading */}
        <Card>
          <CardHeader>
            <CardTitle>Cijfers instellen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              De cijfers zijn <strong>relatief</strong>: ze geven de positie van een leerling ten opzichte van de rest van de klas weer. De gemiddelde leerling krijgt altijd het basiscijfer (standaard 7,0).
            </p>

            <div>
              <h4 className="font-semibold mb-2">Instellingen aanpassen</h4>
              <p className="text-muted-foreground mb-2">
                Via <strong>"Cijferinstellingen"</strong> op het startscherm kun je twee dingen aanpassen:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li><strong>Basiscijfer</strong> — welk cijfer krijgt de gemiddelde leerling? Standaard 7,0.</li>
                <li><strong>Spreiding</strong> — hoe ver liggen de cijfers uit elkaar? Hogere waarde = meer verschil tussen leerlingen.</li>
              </ul>
            </div>

            <p className="text-sm bg-muted/50 p-3 rounded-lg">
              <strong>Let op:</strong> omdat de cijfers relatief zijn, krijgt een klas met alleen uitstekende schrijvers dezelfde verdeling als een zwakke klas. Dit is inherent aan vergelijkende beoordeling — het systeem kan alleen zeggen wie <em>beter</em> is, niet hoe goed iemand in absolute zin is.
            </p>

            <div>
              <h4 className="font-semibold mb-2">Ijkpunten (vast cijfer instellen)</h4>
              <p className="text-muted-foreground mb-2">
                Wil je dat een specifieke tekst een bepaald cijfer krijgt? Klik op het <strong>ankertje</strong> naast het cijfer in de resultatentabel. Je kunt dan een vast cijfer invoeren — de overige cijfers worden automatisch herschaald.
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li><strong>Eén ijkpunt</strong> — het hele cijferbereik verschuift, de onderlinge verhoudingen blijven gelijk.</li>
                <li><strong>Meerdere ijkpunten</strong> — de schaal wordt zo goed mogelijk door alle ijkpunten gefit.</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Zodra er ijkpunten actief zijn, zie je twee kolommen: het <strong>relatieve cijfer</strong> (normreferentie) en het <strong>geijkte cijfer</strong> (gekalibreerd). Ijkpunten kun je altijd weer verwijderen.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle>Veelgestelde vragen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-semibold">Hoeveel vergelijkingen moet ik doen?</p>
              <p className="text-sm text-muted-foreground">Ongeveer 7-10 per tekst. Bij 20 leerlingen zijn dat zo'n 70-100 vergelijkingen totaal. Het systeem geeft automatisch aan wanneer je kunt stoppen.</p>
            </div>
            <div>
              <p className="font-semibold">Wat als ik per ongeluk de verkeerde kies?</p>
              <p className="text-sm text-muted-foreground">Geen probleem. Het systeem is robuust: één foutje heeft nauwelijks invloed als je genoeg vergelijkingen maakt. Gewoon doorgaan.</p>
            </div>
            <div>
              <p className="font-semibold">Worden mijn gegevens ergens opgeslagen?</p>
              <p className="text-sm text-muted-foreground">Nee. Alle data staat alleen in je eigen browser. Er wordt niets naar een server gestuurd. Als je je browsergegevens wist, zijn je gegevens weg — maak dus regelmatig een back-up via "Volledige back-up" op de resultatenpagina.</p>
            </div>
            <div>
              <p className="font-semibold">Kan ik de app op mijn telefoon gebruiken?</p>
              <p className="text-sm text-muted-foreground">Ja, maar een laptop of tablet werkt prettiger omdat je de twee teksten dan naast elkaar ziet.</p>
            </div>
            <div>
              <p className="font-semibold">Kan ik later nog leerlingen toevoegen?</p>
              <p className="text-sm text-muted-foreground">Ja, via "Leerlingbeheer" op het startscherm. De nieuwe leerling moet dan wel voldoende keer vergeleken worden.</p>
            </div>
            <div>
              <p className="font-semibold">Waarom krijgt een leerling het label "Onvoldoende gegevens"?</p>
              <p className="text-sm text-muted-foreground">Die tekst is nog niet vaak genoeg vergeleken. Ga terug naar "Vergelijken" en doe nog een paar vergelijkingen. Het systeem kiest automatisch de teksten die het meest nodig zijn.</p>
            </div>
            <div>
              <p className="font-semibold">Hoe nauwkeurig zijn de cijfers?</p>
              <p className="text-sm text-muted-foreground">Na voldoende vergelijkingen is de rangorde zeer betrouwbaar (vergelijkbaar met 2-3 onafhankelijke beoordelaars). De precieze cijfers (bijv. 7,2 vs 7,3) zijn minder exact — kijk vooral naar de rangorde en de labels.</p>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card>
          <CardHeader>
            <CardTitle>Tips voor een goed resultaat</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong>Wees consistent</strong> — beoordeel alle paren op dezelfde criteria. Bedenk van tevoren wat je belangrijk vindt (bijv. inhoud, structuur, taalgebruik).</li>
              <li><strong>Kies altijd</strong> — probeer altijd een voorkeur aan te geven, ook als het verschil klein is. "Gelijkwaardig" is alleen voor teksten die echt even goed zijn.</li>
              <li><strong>Niet te lang nadenken</strong> — je eerste indruk is vaak de juiste. Besteed niet meer dan 1-2 minuten per vergelijking.</li>
              <li><strong>Doe het in één of twee sessies</strong> — zo blijf je consistent. Je kunt tussendoor pauzeren; je voortgang wordt bewaard.</li>
              <li><strong>Werk samen</strong> — meerdere beoordelaars maken het resultaat betrouwbaarder. Al met twee collega's heb je een sterk resultaat.</li>
            </ul>
          </CardContent>
        </Card>

        {/* Data & Privacy */}
        <Card>
          <CardHeader>
            <CardTitle>Gegevens en privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Alle data wordt <strong>lokaal in je browser</strong> opgeslagen. Er is geen server, geen account, geen cloud.</li>
              <li>Niemand anders kan bij je gegevens, tenzij je ze zelf exporteert en deelt.</li>
              <li>Als je je browsergegevens wist, zijn je gegevens weg. Maak regelmatig een back-up.</li>
              <li>De app werkt ook offline (na de eerste keer laden).</li>
            </ul>
          </CardContent>
        </Card>

        {/* Back button */}
        <div className="text-center pb-8">
          <Button onClick={() => navigate('/')} size="lg">
            Terug naar overzicht
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReadMe;
