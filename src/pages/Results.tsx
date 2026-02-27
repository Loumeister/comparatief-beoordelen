// src/pages/Results.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, FileSpreadsheet, FileText, AlertCircle, Link2, Database, MessageSquare, Share2 } from "lucide-react";
import { HeaderNav } from "@/components/HeaderNav";
import { StudentDetailsDialog } from "@/components/StudentDetailsDialog";
import { useResultsData } from "@/hooks/use-results-data";
import { ReliabilityCard } from "@/components/results/ReliabilityCard";
import { getReliabilityStatus } from "@/lib/reliability-status";
import { RaterOverviewCard } from "@/components/results/RaterOverviewCard";
import { DisagreementsCard } from "@/components/results/DisagreementsCard";
import { AnchorInfoCard } from "@/components/results/AnchorInfoCard";
import { ResultsTable } from "@/components/results/ResultsTable";
import { AnchorDialog } from "@/components/results/AnchorDialog";
import { FeedbackDialog } from "@/components/results/FeedbackDialog";

const Results = () => {
  const navigate = useNavigate();

  const {
    assignment,
    results,
    loading,
    connected,
    raterAnalysis,
    splitHalf,
    anchors,
    gradingConfig,
    // Anchor management
    saveAnchor,
    removeAnchor,
    clearAllAnchors,
    // Exports
    handleExport,
    handleExportDataset,
    handleShareAssignment,
    handleExportFeedback,
  } = useResultsData();

  // Local UI state
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [anchorDialogOpen, setAnchorDialogOpen] = useState(false);
  const [anchorTarget, setAnchorTarget] = useState<{ textId: number; name: string; currentGrade: number } | null>(null);

  const openAnchorDialog = (textId: number, name: string, currentGrade: number) => {
    setAnchorTarget({ textId, name, currentGrade });
    setAnchorDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Berekenen van resultaten...</p>
      </div>
    );
  }

  const reliabilityStatus = getReliabilityStatus(results);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Terug naar overzicht
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">{assignment?.title}</h1>
              <p className="text-muted-foreground">Resultaten van vergelijkende beoordeling</p>
            </div>
            <HeaderNav />
          </div>

          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">Exporteer resultaten:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleExport("xlsx")} title="Download als Excel-bestand">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" onClick={() => handleExport("pdf")} title="Download als PDF-bestand">
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" onClick={() => handleExport("csv")} title="Download als CSV (voor eigen verwerking)">
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={() => setFeedbackDialogOpen(true)} title="Download feedback per leerling als PDF (voor leerlingen)">
                <MessageSquare className="w-4 h-4 mr-2" />
                Leerlingfeedback
              </Button>
              <Button variant="outline" onClick={handleShareAssignment} title="Exporteer alleen de teksten zodat een collega zelf kan beoordelen">
                <Share2 className="w-4 h-4 mr-2" />
                Deel met collega
              </Button>
              <Button variant="outline" onClick={handleExportDataset} title="Exporteer alles (teksten + oordelen) als back-up of om samen te voegen">
                <Database className="w-4 h-4 mr-2" />
                Volledige back-up
              </Button>
            </div>
          </div>
        </div>

        {/* Disconnected graph warning */}
        {connected === false && (
          <Card className="mb-6 border-destructive bg-destructive/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-destructive mb-2">Voorlopige resultaten</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Sommige leerlingen vormen nog losse groepen die niet met elkaar zijn vergeleken. De weergegeven rangorde is daarom onvolledig en mogelijk onbetrouwbaar.
                  </p>
                  <Button size="sm" onClick={() => navigate(`/compare/${assignment?.id}`)}>
                    <Link2 className="w-4 h-4 mr-2" />
                    Meer vergelijkingen maken
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <ReliabilityCard results={results} splitHalf={splitHalf} />

        {raterAnalysis && <RaterOverviewCard raterAnalysis={raterAnalysis} />}
        {raterAnalysis && <DisagreementsCard raterAnalysis={raterAnalysis} />}

        <AnchorInfoCard anchors={anchors} onClearAll={clearAllAnchors} />

        <ResultsTable
          results={results}
          anchors={anchors}
          onSelectStudent={setSelectedStudent}
          onOpenAnchorDialog={openAnchorDialog}
        />

        {/* Continue comparing button */}
        <div className="mt-6 flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(`/compare/${assignment?.id}`)}>
            Meer vergelijkingen maken
          </Button>
          {reliabilityStatus !== 'reliable' && (
            <p className="text-sm text-muted-foreground">
              De resultaten worden nauwkeuriger naarmate je meer vergelijkingen maakt.
            </p>
          )}
        </div>
      </div>

      {/* Student Details Dialog */}
      <StudentDetailsDialog
        studentName={selectedStudent || ''}
        assignmentId={assignment?.id || 0}
        open={!!selectedStudent}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      />

      {/* Feedback Export Dialog */}
      <FeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        onExport={handleExportFeedback}
      />

      {/* Anchor Setting Dialog */}
      <AnchorDialog
        open={anchorDialogOpen}
        onOpenChange={setAnchorDialogOpen}
        target={anchorTarget}
        anchors={anchors}
        gradingConfig={gradingConfig}
        onSave={saveAnchor}
        onRemove={removeAnchor}
      />
    </div>
  );
};

export default Results;
