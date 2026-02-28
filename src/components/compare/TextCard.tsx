// src/components/compare/TextCard.tsx
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Text } from "@/lib/db";

interface TextCardProps {
  text: Text;
  colorClass: string; // e.g. "bg-primary/10 text-primary" or "bg-secondary/10 text-secondary-foreground"
}

export function TextCard({ text, colorClass }: TextCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Card className="shadow-lg">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>
              {text.anonymizedName}
            </span>
            {(text.content || text.contentHtml) && (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                title="Tekst volledig lezen"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
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

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>
                {text.anonymizedName}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 mt-2">
            {text.contentHtml ? (
              <div
                className="docx-content prose prose-sm max-w-none text-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: text.contentHtml }}
              />
            ) : (
              <div className="whitespace-pre-wrap text-foreground leading-relaxed text-base">
                {text.content}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
