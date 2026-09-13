/**
 * Glossary: case-insensitive, whole-word `wrong -> right` replacement.
 *
 * Applied to edited_text only. original_text is never touched, and (spec 10)
 * re-applying must never touch a confirmed segment.
 */
export type Term = { wrong: string; right: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-word boundaries that work for Swahili/English text. \b is unreliable
 * when a term contains punctuation or spaces, so the boundary is expressed as
 * "not preceded/followed by a letter, digit or apostrophe".
 */
function termPattern(wrong: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}'’])${escapeRegExp(wrong.trim())}(?![\\p{L}\\p{N}'’])`,
    'giu',
  );
}

export function applyTerm(text: string, term: Term): string {
  if (!term.wrong.trim()) return text;
  return text.replace(termPattern(term.wrong), term.right);
}

/** Applies every term in order. Later terms see the output of earlier ones. */
export function applyGlossary(text: string, terms: Term[]): string {
  let out = text;
  for (const term of terms) out = applyTerm(out, term);
  return out;
}

export function countMatches(text: string, term: Term): number {
  if (!term.wrong.trim()) return 0;
  return text.match(termPattern(term.wrong))?.length ?? 0;
}
