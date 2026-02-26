// src/components/compare/TextCard.tsx
import { Card, CardContent } from "@/components/ui/card";
import type { Text } from "@/lib/db";

interface TextCardProps {
  text: Text;
  colorClass: string; // e.g. "bg-primary/10 text-primary" or "bg-secondary/10 text-secondary-foreground"
}

export function TextCard({ text, colorClass }: TextCardProps) {
  return (
    <Card className="shadow-lg">
      <CardContent className="p-6 space-y-4">
        <div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>
            {text.anonymizedName}
          </span>
        </div>
        {text.content || text.contentHtml ? (
          text.contentHtml ? (
            <div
              className="docx-content prose prose-sm max-w-none text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: text.contentHtml }}
            />
          ) : (
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-foreground leading-relaxed">{text.content}</div>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground text-center px-4">
              Bekijk de papieren tekst van
              <br />
              <strong className="text-foreground">{text.anonymizedName}</strong>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
