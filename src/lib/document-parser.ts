/**
 * Parse result containing both plain text and (optional) HTML
 */
export interface ParseResult {
  text: string;
  html?: string;
}

/**
 * Parse DOCX or TXT file to plain text + HTML (for .docx formatting).
 * Mammoth is loaded dynamically to keep the main bundle CSP-clean
 * (bluebird/underscore inside mammoth use new Function()).
 */
export async function parseDocument(file: File): Promise<ParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'txt') {
    return { text: await file.text() };
  }

  if (extension === 'docx' || extension === 'doc') {
    const mammoth = (await import('mammoth')).default;
    const arrayBuffer = await file.arrayBuffer();
    const [textResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer }),
      mammoth.convertToHtml({ arrayBuffer }),
    ]);
    return {
      text: textResult.value,
      html: htmlResult.value,
    };
  }

  throw new Error(`Onondersteund bestandstype: ${extension}`);
}

/**
 * Generate anonymized name (Tekst 1, Tekst 2, etc.)
 */
export function generateAnonymizedName(index: number): string {
  return `Tekst ${index + 1}`;
}
