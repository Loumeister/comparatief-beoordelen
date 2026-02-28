// src/components/results/GradeHistogram.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExportData } from "@/lib/export";

interface GradeHistogramProps {
  results: ExportData[];
}

const BAR_MAX_HEIGHT = 80; // px

export function GradeHistogram({ results }: GradeHistogramProps) {
  if (results.length < 3) return null;

  // Use anchored grade when available, otherwise relative grade
  const grades = results.map(r => r.anchoredGrade ?? r.grade);

  const minBucket = Math.floor(Math.min(...grades));
  const maxBucket = Math.floor(Math.max(...grades));

  // One bucket per whole-number band: [n, n+1). Last bucket is [maxBucket, ∞) to capture e.g. 9.9
  const buckets: { label: number; count: number }[] = [];
  for (let n = minBucket; n <= maxBucket; n++) {
    const isLast = n === maxBucket;
    const count = grades.filter(g => isLast ? g >= n : g >= n && g < n + 1).length;
    buckets.push({ label: n, count });
  }

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const avg = grades.reduce((a, b) => a + b, 0) / grades.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Verdeling cijfers</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1" style={{ height: `${BAR_MAX_HEIGHT + 40}px` }}>
          {buckets.map((bucket) => (
            <div key={bucket.label} className="flex flex-col items-center flex-1 gap-0.5">
              <span className="text-xs text-muted-foreground leading-none" style={{ minHeight: '14px' }}>
                {bucket.count > 0 ? bucket.count : ''}
              </span>
              <div
                className={`w-full rounded-t ${bucket.count > 0 ? 'bg-primary/75' : 'bg-muted/20'}`}
                style={{ height: `${bucket.count > 0 ? Math.max((bucket.count / maxCount) * BAR_MAX_HEIGHT, 4) : 0}px` }}
              />
              <span className="text-xs text-muted-foreground leading-none mt-0.5">{bucket.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {results.length} leerlingen · gemiddeld {avg.toFixed(1)}
          {results.some(r => r.anchoredGrade != null) ? ' (geijkt cijfer)' : ' (relatief cijfer)'}
        </p>
      </CardContent>
    </Card>
  );
}
