import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Download, FileSpreadsheet, FileText, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { db, Assignment, Text } from '@/lib/db';
import { calculateBradleyTerry } from '@/lib/bradley-terry';
import { exportToCSV, exportToXLSX, exportToPDF, ExportData } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';

const Results = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [results, setResults] = useState<ExportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [canCompare, setCanCompare] = useState(false);

  useEffect(() => {
    loadResults();
  }, [assignmentId]);

  const loadResults = async () => {
    try {
      const id = parseInt(assignmentId!);
      const assign = await db.assignments.get(id);

      if (!assign) {
        toast({
          title: 'Opdracht niet gevonden',
          variant: 'destructive'
        });
        navigate('/');
        return;
      }

      setAssignment(assign);

      const texts = await db.texts.where('assignmentId').equals(id).toArray();
      const judgements = await db.judgements.where('assignmentId').equals(id).toArray();

      if (judgements.length === 0) {
        toast({
          title: 'Geen beoordelingen',
          description: 'Begin met vergelijken om resultaten te zien',
        });
        navigate(`/compare/${id}`);
        return;
      }

      const btResults = calculateBradleyTerry(texts, judgements);

      // Map to export format
      const exportData: ExportData[] = btResults.map(r => {
        const text = texts.find(t => t.id === r.textId)!;
        return {
          anonymizedName: text.anonymizedName,
          rank: r.rank,
          label: r.label,
          grade: r.grade,
          theta: r.theta,
          standardError: r.standardError,
          reliability: r.reliability
        };
      });

      setResults(exportData);

      // Save scores to database
      await db.scores.where('assignmentId').equals(id).delete();
      for (const r of btResults) {
        await db.scores.add({
          assignmentId: id,
          textId: r.textId,
          theta: r.theta,
          standardError: r.standardError,
          rank: r.rank,
          label: r.label,
          grade: r.grade,
          reliability: r.reliability,
          calculatedAt: new Date()
        });
      }

      // Check if more comparisons are needed
      const { generatePairs } = await import('@/lib/pairing');
      const possiblePairs = generatePairs(texts, judgements, {
        targetComparisonsPerText: assign.numComparisons || 10,
        batchSize: 12,
      });
      setCanCompare(possiblePairs.length > 0);

      setLoading(false);
    } catch (error) {
      console.error('Results error:', error);
      toast({
        title: 'Fout bij laden resultaten',
        variant: 'destructive'
      });
    }
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!assignment) return;

    try {
      if (format === 'csv') {
        exportToCSV(results, assignment.title);
      } else if (format === 'xlsx') {
        exportToXLSX(results, assignment.title);
      } else {
        exportToPDF(results, assignment.title);
      }

      toast({
        title: 'Export geslaagd',
        description: `Resultaten geëxporteerd als ${format.toUpperCase()}`
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export mislukt',
        variant: 'destructive'
      });
    }
  };

  const getLabelColor = (label: string) => {
    switch (label) {
      case 'Topgroep':
        return 'bg-secondary text-secondary-foreground';
      case 'Bovengemiddeld':
        return 'bg-primary text-primary-foreground';
      case 'Gemiddeld':
        return 'bg-muted text-muted-foreground';
      case 'Onder gemiddeld':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getReliabilityColor = (reliability: string) => {
    if (reliability === 'Resultaat betrouwbaar') {
      return 'text-secondary';
    } else if (reliability === 'Nog enkele vergelijkingen nodig') {
      return 'text-primary';
    }
    return 'text-destructive';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Berekenen van resultaten...</p>
      </div>
    );
  }

  // Calculate overall reliability
  const reliableCount = results.filter(r => r.reliability === 'Resultaat betrouwbaar').length;
  const reliabilityPercentage = (reliableCount / results.length) * 100;
  
  let reliabilityStatus: 'insufficient' | 'moderate' | 'reliable';
  let reliabilityText: string;
  let reliabilityIcon: typeof CheckCircle;
  let progressColor: string;
  
  if (reliabilityPercentage < 60) {
    reliabilityStatus = 'insufficient';
    reliabilityText = 'Onvoldoende gegevens';
    reliabilityIcon = XCircle;
    progressColor = 'bg-destructive';
  } else if (reliabilityPercentage < 80) {
    reliabilityStatus = 'moderate';
    reliabilityText = 'Nog enkele vergelijkingen nodig';
    reliabilityIcon = AlertCircle;
    progressColor = 'bg-primary';
  } else {
    reliabilityStatus = 'reliable';
    reliabilityText = 'Resultaat betrouwbaar';
    reliabilityIcon = CheckCircle;
    progressColor = 'bg-secondary';
  }
  
  const ReliabilityIcon = reliabilityIcon;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Terug naar overzicht
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">{assignment?.title}</h1>
              <p className="text-muted-foreground">
                Resultaten van vergelijkende beoordeling
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExport('csv')}>
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={() => handleExport('xlsx')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button onClick={() => handleExport('pdf')}>
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Overall Reliability Bar */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ReliabilityIcon className={`w-5 h-5 ${
                reliabilityStatus === 'reliable' ? 'text-secondary' :
                reliabilityStatus === 'moderate' ? 'text-primary' :
                'text-destructive'
              }`} />
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{reliabilityText}</h3>
                <p className="text-sm text-muted-foreground">
                  {Math.round(reliabilityPercentage)}% van de teksten heeft voldoende vergelijkingen
                </p>
              </div>
            </div>
            <div className="relative">
              <Progress 
                value={reliabilityPercentage} 
                className="h-3"
              />
              <style>{`
                [role="progressbar"] > div {
                  background: ${
                    reliabilityStatus === 'reliable' ? 'hsl(var(--secondary))' :
                    reliabilityStatus === 'moderate' ? 'hsl(var(--primary))' :
                    'hsl(var(--destructive))'
                  };
                  transition: background-color 0.3s ease;
                }
              `}</style>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader>
            <CardTitle>Rangorde</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rang</TableHead>
                  <TableHead>Tekst</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Cijfer</TableHead>
                  <TableHead>Betrouwbaarheid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => (
                  <TableRow key={result.anonymizedName}>
                    <TableCell className="font-bold text-lg">
                      {result.rank}
                    </TableCell>
                    <TableCell className="font-medium">
                      {result.anonymizedName}
                    </TableCell>
                    <TableCell>
                      <Badge className={getLabelColor(result.label)}>
                        {result.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">
                      {result.grade.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <span className={getReliabilityColor(result.reliability)}>
                        {result.reliability}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-2">Over deze resultaten</h3>
            <p className="text-sm text-muted-foreground mb-4">
              De rangorde is berekend met het Bradley-Terry model op basis van de 
              paarsgewijze vergelijkingen. Het cijfer is afgeleid van de geschatte 
              vaardigheid (theta) op een schaal van 1-10.
            </p>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Labels:</span>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li>• <strong>Topgroep:</strong> Top 25%</li>
                  <li>• <strong>Bovengemiddeld:</strong> 25-50%</li>
                  <li>• <strong>Gemiddeld:</strong> 50-75%</li>
                  <li>• <strong>Onder gemiddeld:</strong> Bottom 25%</li>
                </ul>
              </div>
              
              <div>
                <span className="font-medium">Betrouwbaarheid:</span>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li className="text-secondary">• <strong>Resultaat betrouwbaar:</strong> Voldoende vergelijkingen</li>
                  <li className="text-primary">• <strong>Nog enkele vergelijkingen nodig:</strong> Matig betrouwbaar</li>
                  <li className="text-destructive">• <strong>Onvoldoende gegevens:</strong> Te weinig vergelijkingen</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Continue comparing button */}
        {canCompare && (
          <div className="mt-6">
            <Button
              variant="outline"
              onClick={() => navigate(`/compare/${assignment?.id}`)}
            >
              Meer vergelijkingen maken
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Results;
