/**
 * Export the EDITED text, never the original (spec 11).
 *
 * House style:
 *
 *   AMCOS_Mamba_Same_MIVARF
 *
 *   R: Naitwa Mbaraka Ally, ...
 *   I: Mmh wamezoea kukuita ...
 *
 * Consecutive segments with the same label merge into one paragraph.
 * No timestamps unless explicitly asked for.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { Segment, SpeakerMap } from '@/db/schema';
import { formatClock, slugifyName } from './format';
import { buildLookup, labelFor } from './speakers';

export type ExportSegment = Pick<
  Segment,
  'idx' | 'rawSpeaker' | 'speakerOverride' | 'editedText' | 'startSeconds'
>;

export type ExportOptions = {
  /** Internal machinery, off by default; the client's deliverable has none. */
  includeTimestamps?: boolean;
};

export type Block = { label: string; text: string; start: number };

/** Merge consecutive same-label turns into one paragraph. */
export function buildBlocks(
  segments: ExportSegment[],
  speakerRows: Pick<SpeakerMap, 'rawSpeaker' | 'label'>[],
): Block[] {
  const lookup = buildLookup(speakerRows);
  const ordered = [...segments].sort((a, b) => a.idx - b.idx);
  const blocks: Block[] = [];

  for (const seg of ordered) {
    const label = labelFor(seg, lookup);
    const text = seg.editedText.trim();
    if (!text) continue;
    const last = blocks[blocks.length - 1];
    if (last && last.label === label) {
      last.text = `${last.text} ${text}`.replace(/\s+/g, ' ').trim();
    } else {
      blocks.push({ label, text, start: seg.startSeconds });
    }
  }
  return blocks;
}

export function exportMarkdown(
  taskName: string,
  segments: ExportSegment[],
  speakerRows: Pick<SpeakerMap, 'rawSpeaker' | 'label'>[],
  options: ExportOptions = {},
): string {
  const blocks = buildBlocks(segments, speakerRows);
  const lines = [slugifyName(taskName), ''];
  for (const block of blocks) {
    const stamp = options.includeTimestamps ? `[${formatClock(block.start)}] ` : '';
    lines.push(`${stamp}${block.label}: ${block.text}`, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export async function exportDocx(
  taskName: string,
  segments: ExportSegment[],
  speakerRows: Pick<SpeakerMap, 'rawSpeaker' | 'label'>[],
  options: ExportOptions = {},
): Promise<Buffer> {
  const blocks = buildBlocks(segments, speakerRows);

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: slugifyName(taskName), bold: true })],
      spacing: { after: 240 },
    }),
  ];

  for (const block of blocks) {
    const runs: TextRun[] = [];
    if (options.includeTimestamps) {
      runs.push(new TextRun({ text: `[${formatClock(block.start)}] `, color: '808080' }));
    }
    runs.push(new TextRun({ text: `${block.label}: `, bold: true }));
    runs.push(new TextRun({ text: block.text }));
    children.push(new Paragraph({ children: runs, spacing: { after: 160 } }));
  }

  const doc = new Document({
    creator: 'to-word',
    title: taskName,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 24 } },
      },
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

export function exportFilename(taskName: string, ext: 'docx' | 'md'): string {
  return `${slugifyName(taskName)}.${ext}`;
}
