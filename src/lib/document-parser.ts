import mammoth from 'mammoth';

/**
 * Parse DOCX or TXT file to plain text
 */
export async function parseDocument(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'txt') {
    return await file.text();
  }

  if (extension === 'docx' || extension === 'doc') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  throw new Error(`Onondersteund bestandstype: ${extension}`);
}

/**
 * Generate anonymized name (Tekst 1, Tekst 2, etc.)
 */
export function generateAnonymizedName(index: number): string {
  return `Tekst ${index + 1}`;
}
