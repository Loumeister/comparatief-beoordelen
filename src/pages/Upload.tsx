import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload as UploadIcon, FileText, X } from 'lucide-react';
import { db } from '@/lib/db';
import { parseDocument, generateAnonymizedName } from '@/lib/document-parser';
import { useToast } from '@/hooks/use-toast';

const Upload = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [numComparisons, setNumComparisons] = useState(10);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(
        f => f.name.endsWith('.docx') || f.name.endsWith('.doc') || f.name.endsWith('.txt')
      );
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({
        title: 'Titel vereist',
        description: 'Voer een titel in voor de opdracht',
        variant: 'destructive'
      });
      return;
    }

    if (files.length < 2) {
      toast({
        title: 'Minimaal 2 teksten',
        description: 'Upload minimaal 2 tekstbestanden',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);

    try {
      // Create assignment
      const assignmentId = await db.assignments.add({
        title: title.trim(),
        genre: genre.trim() || 'Algemeen',
        numComparisons,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Parse and store texts
      for (let i = 0; i < files.length; i++) {
        const content = await parseDocument(files[i]);
        
        await db.texts.add({
          assignmentId,
          content,
          originalFilename: files[i].name,
          anonymizedName: generateAnonymizedName(i),
          createdAt: new Date()
        });
      }

      toast({
        title: 'Opdracht aangemaakt',
        description: `${files.length} teksten succesvol geüpload`
      });

      navigate(`/compare/${assignmentId}`);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload mislukt',
        description: 'Er is een fout opgetreden bij het uploaden',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Nieuwe Opdracht</h1>
          <p className="text-muted-foreground">Upload leerlingteksten voor vergelijkende beoordeling</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Opdracht Details</CardTitle>
              <CardDescription>Geef de opdracht een titel en genre</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="bijv. Essay Klimaatverandering"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="genre">Genre</Label>
                <Input
                  id="genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="bijv. Betoog, Verslag, Verhaal"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="comparisons">Aantal vergelijkingen per tekst</Label>
                <Input
                  id="comparisons"
                  type="number"
                  min={5}
                  max={20}
                  value={numComparisons}
                  onChange={(e) => setNumComparisons(parseInt(e.target.value) || 10)}
                />
                <p className="text-sm text-muted-foreground">
                  Aanbevolen: 10 vergelijkingen per tekst
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Teksten Uploaden</CardTitle>
              <CardDescription>Upload DOCX of TXT bestanden (minimaal 2)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept=".docx,.doc,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <UploadIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-1">Klik om bestanden te selecteren</p>
                  <p className="text-sm text-muted-foreground">
                    of sleep bestanden hierheen
                  </p>
                </label>
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Geselecteerde bestanden ({files.length})</p>
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-primary" />
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/')}
              disabled={uploading}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={uploading || files.length < 2}>
              {uploading ? 'Uploaden...' : 'Start Beoordeling'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Upload;
