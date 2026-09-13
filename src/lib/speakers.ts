import type { Segment, SpeakerMap } from '@/db/schema';

/** Labels the client's house style expects, offered first in the UI. */
export const STANDARD_LABELS = ['R', 'I', 'I2'] as const;

export type SpeakerLookup = Record<string, string>;

export function buildLookup(rows: Pick<SpeakerMap, 'rawSpeaker' | 'label'>[]): SpeakerLookup {
  const lookup: SpeakerLookup = {};
  for (const row of rows) lookup[row.rawSpeaker] = row.label;
  return lookup;
}

/**
 * Display label for a segment. Resolution order (spec 9): per-segment override,
 * then the task's speaker map, then the provider's raw id. Segment rows are
 * never rewritten by mapping.
 */
export function labelFor(
  seg: Pick<Segment, 'rawSpeaker' | 'speakerOverride'>,
  lookup: SpeakerLookup,
): string {
  if (seg.speakerOverride) return seg.speakerOverride;
  if (seg.rawSpeaker && lookup[seg.rawSpeaker]) return lookup[seg.rawSpeaker];
  return prettyRaw(seg.rawSpeaker);
}

/** "speaker_0" -> "S0" so an unmapped transcript still reads tidily. */
export function prettyRaw(raw: string | null | undefined): string {
  if (!raw) return '?';
  const m = /^speaker_(\d+)$/i.exec(raw);
  return m ? `S${m[1]}` : raw;
}

export type SpeakerStat = {
  rawSpeaker: string;
  words: number;
  share: number;
  turns: number;
  firstStart: number;
  sample: string;
};

/** Per-raw-speaker word share, used to drive the mapping screen. */
export function speakerStats(
  segments: Pick<Segment, 'rawSpeaker' | 'editedText' | 'startSeconds'>[],
): SpeakerStat[] {
  const byRaw = new Map<string, { words: number; turns: number; firstStart: number; sample: string }>();
  for (const seg of segments) {
    const raw = seg.rawSpeaker ?? 'unknown';
    const words = seg.editedText.trim() ? seg.editedText.trim().split(/\s+/).length : 0;
    const entry = byRaw.get(raw);
    if (entry) {
      entry.words += words;
      entry.turns += 1;
      if (seg.startSeconds < entry.firstStart) {
        entry.firstStart = seg.startSeconds;
        entry.sample = seg.editedText;
      }
    } else {
      byRaw.set(raw, {
        words,
        turns: 1,
        firstStart: seg.startSeconds,
        sample: seg.editedText,
      });
    }
  }
  const total = [...byRaw.values()].reduce((sum, e) => sum + e.words, 0) || 1;
  return [...byRaw.entries()]
    .map(([rawSpeaker, e]) => ({
      rawSpeaker,
      words: e.words,
      share: e.words / total,
      turns: e.turns,
      firstStart: e.firstStart,
      sample: e.sample.slice(0, 160),
    }))
    .sort((a, b) => b.words - a.words);
}
