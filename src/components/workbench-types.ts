import type { Segment } from '@/db/schema';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export type SegmentView = Omit<Segment, 'updatedAt'> & {
  /** Server's last-known update time, as epoch ms, for offline reconciliation. */
  updatedAt: number;
  saveState: SaveState;
};

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const;

/** localStorage key for the mirror of an in-progress edit (spec 8.5). */
export function cacheKey(segmentId: string): string {
  return `tw:seg:${segmentId}`;
}

export type CachedEdit = { text: string; at: number };

export function readCache(segmentId: string): CachedEdit | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(segmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEdit;
    return typeof parsed?.text === 'string' && typeof parsed?.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCache(segmentId: string, text: string): void {
  try {
    window.localStorage.setItem(
      cacheKey(segmentId),
      JSON.stringify({ text, at: Date.now() } satisfies CachedEdit),
    );
  } catch {
    // Private mode or a full quota: the debounced server save is still the
    // primary path, so this is not worth interrupting the operator over.
  }
}

export function clearCache(segmentId: string): void {
  try {
    window.localStorage.removeItem(cacheKey(segmentId));
  } catch {
    /* ignore */
  }
}
