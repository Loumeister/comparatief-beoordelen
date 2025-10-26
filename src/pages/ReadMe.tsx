import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

const ReadMe = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/10 to-[hsl(var(--choice-b))]/10 border-b">
        <div className="max-w-4xl mx-auto p-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Terug naar Dashboard
          </Button>
          <h1 className="text-4xl font-bold mb-4">Handleiding</h1>
          <p className="text-xl text-muted-foreground">
            Alles wat je moet weten over vergelijkende beoordeling
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-8 space-y-8">
        {/* What is Comparative Judgment */}
        <Card>
          <CardHeader>
            <CardTitle>📚 Wat is Comparative Judgment?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              <strong>Comparative judgment</strong> is een beoordelingsmethode waarbij je <strong>niet direct een cijfer geeft</strong>, maar <strong>teksten paarsgewijs met elkaar vergelijkt</strong>. In plaats van te beslissen "deze tekst verdient een 7", kies je simpelweg: "welke van deze twee teksten is beter?"
            </p>
            
            <div>
              <h4 className="font-semibold mb-2">Waarom comparative judgment?</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>Betrouwbaarder</strong>: Mensen zijn beter in vergelijken dan in absoluut beoordelen</li>
                <li><strong>Consistenter</strong>: Je gebruikt automatisch dezelfde maatstaf voor alle teksten</li>
                <li><strong>Efficiënter</strong>: Je hoeft niet na te denken over cijfers of rubrics, alleen: "welke is beter?"</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Hoe werkt het?</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Je krijgt twee anonieme teksten te zien</li>
                <li>Je leest beide teksten</li>
                <li>Je klikt op de betere tekst (of kiest "gelijkwaardig" als ze echt even goed zijn)</li>
                <li>Het systeem gebruikt een wiskundig model (Bradley-Terry) om uit alle vergelijkingen een rangorde en cijfers te berekenen</li>
              </ol>
            </div>

            <p className="text-sm bg-primary/5 p-3 rounded-lg">
              <strong>Vuistregel</strong>: Elk leerlingwerk moet ongeveer 7-10 keer vergeleken worden voor een betrouwbaar resultaat.
            </p>
          </CardContent>
        </Card>

        {/* Scores and Reliability */}
        <Card>
          <CardHeader>
            <CardTitle>📊 Scores en Betrouwbaarheid</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Individuele scores per tekst</h4>
              <p className="text-muted-foreground mb-2">Na voldoende vergelijkingen krijgt elke tekst:</p>
              <ul className="space-y-2">
                <li><strong>Cijfer</strong> (1-10): Berekend op basis van de positie in de rangorde</li>
                <li>
                  <strong>Label</strong>:
                  <ul className="list-disc list-inside ml-4 text-muted-foreground">
                    <li><em>Topgroep</em> (top 10%)</li>
                    <li><em>Bovengemiddeld</em> (11-50%)</li>
                    <li><em>Gemiddeld</em> (51-90%)</li>
                    <li><em>Onder gemiddeld</em> (onderste 10%)</li>
                  </ul>
                </li>
                <li>
                  <strong>Betrouwbaarheidsindicator</strong>:
                  <ul className="space-y-2 mt-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span><strong>Resultaat betrouwbaar</strong> (SE ≤ 0.75) - voldoende vergelijkingen</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <span><strong>Nog enkele vergelijkingen nodig</strong> (0.75 &lt; SE ≤ 1.00) - bijna klaar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <span><strong>Onvoldoende gegevens</strong> (SE &gt; 1.00) - meer vergelijkingen nodig</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Cohort-betrouwbaarheid (stopadvies)</h4>
              <p className="text-muted-foreground mb-2">Het systeem geeft aan wanneer je kunt <strong>stoppen met beoordelen</strong>:</p>
              <p className="bg-primary/5 p-3 rounded-lg">
                <strong>Resultaat betrouwbaar (stopadvies)</strong> als:
                <br />• ≥70% van de teksten heeft SE ≤ 0.75, <strong>of</strong>
                <br />• Mediaan(SE) ≤ 0.80 én max(SE) ≤ 1.40
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <Card>
          <CardHeader>
            <CardTitle>🧭 Navigatie in de App</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-semibold mb-2">1️⃣ Dashboard (<code>/</code>)</h4>
              <p className="text-muted-foreground mb-2">Het startscherm toont al je opdrachten.</p>
              <p className="text-sm"><strong>Wat kun je hier doen:</strong></p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>Bekijk alle opdrachten met status (aantal teksten, aantal beoordelingen)</li>
                <li>Klik op "Vergelijken" om te starten met beoordelen</li>
                <li>Klik op "Resultaten" om de uitkomsten te bekijken</li>
                <li>Klik op "Nieuw" (rechtsonder) om een nieuwe opdracht aan te maken</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">2️⃣ Upload (<code>/upload</code>)</h4>
              <p className="text-muted-foreground mb-2">Upload leerlingteksten voor een nieuwe opdracht.</p>
              <p className="text-sm"><strong>Stappen:</strong></p>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>Geef de opdracht een naam</li>
                <li>Stel optioneel beoordelingsinstellingen in (basis cijfer, schaal, min/max)</li>
                <li>Upload teksten via kopiëren/plakken of bestand uploaden</li>
                <li>Klik op "Opslaan" om de opdracht aan te maken</li>
              </ol>
              <p className="text-sm mt-2"><strong>Tips:</strong></p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>Je kunt anonieme labels gebruiken (bijv. "Tekst A", "Tekst B") of echte namen</li>
                <li>Zorg dat alle teksten dezelfde opdracht beantwoorden</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">3️⃣ Vergelijken (<code>/compare/:assignmentId</code>)</h4>
              <p className="text-muted-foreground mb-2">Hier beoordeel je door teksten paarsgewijs te vergelijken.</p>
              <p className="text-sm"><strong>Interface:</strong></p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>Twee kolommen met een tekst links en rechts</li>
                <li>Knoppen onderaan: "Tekst links is beter" | "Gelijkwaardig" | "Tekst rechts is beter"</li>
                <li>Voortgangsbalk: Toont hoeveel vergelijkingen je al hebt gedaan</li>
                <li>Betrouwbaarheidsindicator: Toont wanneer je kunt stoppen</li>
              </ul>
              <p className="text-sm mt-2"><strong>Tips:</strong></p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>Wees consistent: gebruik dezelfde criteria voor elke vergelijking</li>
                <li>Twijfel je? Kies dan "gelijkwaardig"</li>
                <li>Je kunt altijd stoppen en later verder gaan</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">4️⃣ Resultaten (<code>/results/:assignmentId</code>)</h4>
              <p className="text-muted-foreground mb-2">Bekijk de definitieve rangorde en cijfers.</p>
              <p className="text-sm"><strong>Wat zie je:</strong></p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>Cohort-betrouwbaarheid: Algemene betrouwbaarheidsstatus met statistieken</li>
                <li>Voortgang: Grafiek met vergelijkingen per tekst</li>
                <li>Rangorde-tabel: Alle teksten gesorteerd op kwaliteit</li>
              </ul>
              <p className="text-sm mt-2"><strong>Acties:</strong></p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>"Toon details": Bekijk technische scores</li>
                <li>"Exporteer naar CSV/Excel": Download resultaten</li>
                <li>"Terug naar vergelijken": Voeg meer beoordelingen toe</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Workflow */}
        <Card>
          <CardHeader>
            <CardTitle>🎯 Typische Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li><strong>Upload</strong> → Upload alle leerlingteksten voor een opdracht</li>
              <li><strong>Vergelijken</strong> → Beoordeel door teksten te vergelijken (elk werk ~7-10x)</li>
              <li><strong>Resultaten</strong> → Bekijk de rangorde en exporteer cijfers</li>
              <li><strong>(Optioneel) Terug naar Vergelijken</strong> → Voeg meer beoordelingen toe als het nog niet betrouwbaar genoeg is</li>
            </ol>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle>💡 Veelgestelde Vragen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-semibold">Hoeveel vergelijkingen zijn nodig?</p>
              <p className="text-sm text-muted-foreground">→ Ongeveer 7-10 vergelijkingen per tekst. Het systeem geeft aan wanneer je kunt stoppen.</p>
            </div>
            <div>
              <p className="font-semibold">Wat als ik een fout maak?</p>
              <p className="text-sm text-muted-foreground">→ Geen probleem! Het model is robuust en één foutje heeft weinig impact bij voldoende vergelijkingen.</p>
            </div>
            <div>
              <p className="font-semibold">Kan ik met meerdere mensen tegelijk beoordelen?</p>
              <p className="text-sm text-muted-foreground">→ Ja, de app slaat alle vergelijkingen op en combineert ze in één rangorde.</p>
            </div>
            <div>
              <p className="font-semibold">Waarom krijgen sommige teksten "Onvoldoende gegevens"?</p>
              <p className="text-sm text-muted-foreground">→ Ze zijn nog niet vaak genoeg vergeleken. Ga terug naar "Vergelijken" om meer beoordelingen toe te voegen.</p>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>⚙️ Technische Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Wiskundig model</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>Bradley-Terry model met ridge-regularisatie</li>
                <li>Newton-Raphson optimalisatie voor theta-schatting</li>
                <li>Standard Error (SE) gebaseerd op Hessian-diagonaal</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Betrouwbaarheidsdrempels</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>Individueel: SE ≤ 0.75 (betrouwbaar), SE ≤ 1.00 (bijna klaar)</li>
                <li>Cohort: ≥70% betrouwbaar OF (mediaan ≤ 0.80 EN max ≤ 1.40)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Pairing-strategie</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li>Bridging: Prioriteit voor vergelijkingen tussen ongekoppelde groepen</li>
                <li>Informatief: Focus op teksten met hoge SE en kleine θ-verschillen</li>
                <li>Adaptief: Past zich aan naarmate er meer data komt</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReadMe;
