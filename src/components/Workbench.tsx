'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Segment, SpeakerMap, Task } from '@/db/schema';
import { buildLookup, labelFor, STANDARD_LABELS } from '@/lib/speakers';
import PlayerBar from './PlayerBar';
import SegmentRow from './SegmentRow';
import ShortcutsHelp from './ShortcutsHelp';
import {
  PLAYBACK_RATES,
  clearCache,
  readCache,
  writeCache,
  type SaveState,
  type SegmentView,
} from './workbench-types';

const SAVE_DEBOUNCE_MS = 800;
/** Auto-scroll stays out of the way for this long after the last keystroke. */
const TYPING_QUIET_MS = 2500;

export type SerializedSegment = Omit<Segment, 'updatedAt'> & { updatedAt: string };

export default function Workbench({
  task,
  initialSegments,
  speakerRows,
  hasAudio,
}: {
  task: Task;
  initialSegments: SerializedSegment[];
  speakerRows: Pick<SpeakerMap, 'rawSpeaker' | 'label'>[];
  hasAudio: boolean;
}) {
  const [segments, setSegments] = useState<SegmentView[]>(() =>
    initialSegments.map((s) => ({
      ...s,
      updatedAt: new Date(s.updatedAt).getTime(),
      saveState: 'clean' as SaveState,
    })),
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(task.durationSeconds ?? 0);
  const [playing, setPlaying] = useState(false);
  const [rateIndex, setRateIndex] = useState(1);
  const [recovered, setRecovered] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, string>());
  const segmentsRef = useRef(segments);
  const focusedIdx = useRef<number | null>(null);
  const lastTyping = useRef(0);
  const autoScrollSuspended = useRef(false);

  segmentsRef.current = segments;

  const lookup = useMemo(() => buildLookup(speakerRows), [speakerRows]);
  const labelOptions = useMemo(() => {
    const set = new Set<string>(STANDARD_LABELS);
    for (const row of speakerRows) set.add(row.label);
    for (const seg of segments) if (seg.speakerOverride) set.add(seg.speakerOverride);
    return [...set];
  }, [speakerRows, segments]);

  const confirmedCount = segments.filter((s) => s.confirmed).length;

  /* ---------------- saving (spec 8.5) ---------------- */

  const patchSegment = useCallback(
    async (id: string, body: Record<string, unknown>, keepalive = false) => {
      const response = await fetch(`/api/segments/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      return (await response.json()).segment as SerializedSegment;
    },
    [],
  );

  const setSaveState = useCallback((id: string, saveState: SaveState, updatedAt?: number) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, saveState, updatedAt: updatedAt ?? s.updatedAt } : s)),
    );
  }, []);

  const flushSegment = useCallback(
    async (id: string, keepalive = false) => {
      const text = pending.current.get(id);
      if (text === undefined) return;
      pending.current.delete(id);
      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
      setSaveState(id, 'saving');
      try {
        const saved = await patchSegment(id, { editedText: text }, keepalive);
        // Only drop the local mirror once the server has the text.
        clearCache(id);
        setSaveState(id, 'saved', new Date(saved.updatedAt).getTime());
        setTimeout(() => {
          setSegments((prev) =>
            prev.map((s) =>
              s.id === id && s.saveState === 'saved' ? { ...s, saveState: 'clean' } : s,
            ),
          );
        }, 1500);
      } catch {
        // The localStorage mirror still holds it; it is recovered on next load.
        pending.current.set(id, text);
        setSaveState(id, 'error');
      }
    },
    [patchSegment, setSaveState],
  );

  const onChangeText = useCallback(
    (id: string, text: string) => {
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, editedText: text, saveState: 'dirty' } : s)),
      );
      // Mirror immediately, before any network call (spec 8.5).
      writeCache(id, text);
      pending.current.set(id, text);
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => void flushSegment(id), SAVE_DEBOUNCE_MS),
      );
    },
    [flushSegment],
  );

  /** Reconcile localStorage against the server on load (spec 8.5). */
  useEffect(() => {
    let recoveredCount = 0;
    const toPush: { id: string; text: string }[] = [];
    for (const seg of segmentsRef.current) {
      const cached = readCache(seg.id);
      if (!cached) continue;
      if (cached.text === seg.editedText) {
        clearCache(seg.id);
        continue;
      }
      if (cached.at > seg.updatedAt) {
        recoveredCount++;
        toPush.push({ id: seg.id, text: cached.text });
      } else {
        // The server is newer, so the cache is stale: drop it.
        clearCache(seg.id);
      }
    }
    if (toPush.length === 0) return;

    setSegments((prev) =>
      prev.map((s) => {
        const hit = toPush.find((t) => t.id === s.id);
        return hit ? { ...s, editedText: hit.text, saveState: 'dirty' as SaveState } : s;
      }),
    );
    setRecovered(recoveredCount);
    for (const item of toPush) {
      pending.current.set(item.id, item.text);
      void flushSegment(item.id);
    }
    // Runs once on mount: the server rows are the baseline for reconciliation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Last-ditch save when the tab goes away mid-edit. */
  useEffect(() => {
    const handler = () => {
      for (const id of [...pending.current.keys()]) void flushSegment(id, true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handler();
    };
    window.addEventListener('pagehide', handler);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', handler);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushSegment]);

  /* ---------------- audio binding (spec 8.2) ---------------- */

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const limit = Number.isFinite(audio.duration) ? audio.duration : seconds;
    const target = Math.max(0, Math.min(seconds, limit));
    audio.currentTime = target;
    setCurrentTime(target);
    // A deliberate seek resumes auto-scroll.
    autoScrollSuspended.current = false;
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seekTo((audio.currentTime || 0) + delta);
    },
    [seekTo],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const cycleRate = useCallback(() => {
    setRateIndex((index) => {
      const next = (index + 1) % PLAYBACK_RATES.length;
      if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_RATES[next];
      return next;
    });
  }, []);

  /** Index of the segment covering currentTime. Binary search: 2000 turns is normal. */
  const currentIdx = useMemo(() => {
    if (segments.length === 0) return -1;
    let low = 0;
    let high = segments.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (segments[mid].startSeconds <= currentTime + 0.001) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found;
  }, [segments, currentTime]);

  /*
   * Auto-scroll the current segment into view, unless the operator is typing or
   * has scrolled away by hand (spec 8.2).
   */
  useEffect(() => {
    if (currentIdx < 0 || !playing) return;
    if (autoScrollSuspended.current) return;
    if (Date.now() - lastTyping.current < TYPING_QUIET_MS) return;
    const seg = segmentsRef.current[currentIdx];
    const el = seg ? rowRefs.current.get(seg.id) : null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentIdx, playing]);

  useEffect(() => {
    const suspend = () => {
      autoScrollSuspended.current = true;
    };
    window.addEventListener('wheel', suspend, { passive: true });
    window.addEventListener('touchmove', suspend, { passive: true });
    return () => {
      window.removeEventListener('wheel', suspend);
      window.removeEventListener('touchmove', suspend);
    };
  }, []);

  /* ---------------- confirming (spec 8.4) ---------------- */

  const setConfirmed = useCallback(
    (id: string, confirmed: boolean) => {
      setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, confirmed } : s)));
      void patchSegment(id, { confirmed }).catch(() => setSaveState(id, 'error'));
    },
    [patchSegment, setSaveState],
  );

  const focusSegment = useCallback(
    (idx: number, options: { seek?: boolean } = {}) => {
      const seg = segmentsRef.current[idx];
      if (!seg) return;
      autoScrollSuspended.current = false;
      focusedIdx.current = idx;
      const el = rowRefs.current.get(seg.id);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      textareaRefs.current.get(seg.id)?.focus({ preventScroll: true });
      if (options.seek) seekTo(seg.startSeconds);
    },
    [seekTo],
  );

  const confirmAndAdvance = useCallback(() => {
    const idx = focusedIdx.current ?? currentIdx;
    const seg = segmentsRef.current[idx];
    if (!seg) return;
    setConfirmed(seg.id, true);
    const next = segmentsRef.current[idx + 1];
    if (next) focusSegment(idx + 1, { seek: audioRef.current?.paused ?? true });
  }, [currentIdx, focusSegment, setConfirmed]);

  const jumpToFirstUnconfirmed = useCallback(() => {
    const idx = segmentsRef.current.findIndex((s) => !s.confirmed);
    if (idx < 0) {
      window.alert('Every segment in this task is confirmed.');
      return;
    }
    focusSegment(idx, { seek: true });
  }, [focusSegment]);

  const revertSegment = useCallback(async (id: string) => {
    const response = await fetch(`/api/segments/${id}`, { method: 'DELETE' });
    if (!response.ok) return;
    const { segment: saved } = (await response.json()) as { segment: SerializedSegment };
    clearCache(id);
    pending.current.delete(id);
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              editedText: saved.editedText,
              saveState: 'clean' as SaveState,
              updatedAt: new Date(saved.updatedAt).getTime(),
            }
          : s,
      ),
    );
  }, []);

  const overrideSpeaker = useCallback(
    (id: string, label: string | null) => {
      setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, speakerOverride: label } : s)));
      void patchSegment(id, { speakerOverride: label }).catch(() => setSaveState(id, 'error'));
    },
    [patchSegment, setSaveState],
  );

  /* ---------------- keyboard (spec 8.3) ---------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Deliberately global: these must fire with the cursor in a text field.
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey) return;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          event.preventDefault();
          seekBy(5);
          break;
        case 'ArrowUp': {
          event.preventDefault();
          const idx = (focusedIdx.current ?? currentIdx) - 1;
          if (idx >= 0) focusSegment(idx, { seek: true });
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          const idx = (focusedIdx.current ?? currentIdx) + 1;
          if (idx < segmentsRef.current.length) focusSegment(idx, { seek: true });
          break;
        }
        case 'Enter':
          event.preventDefault();
          confirmAndAdvance();
          break;
        case '\\':
          event.preventDefault();
          cycleRate();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmAndAdvance, currentIdx, cycleRate, focusSegment, seekBy, togglePlay]);

  /* ---------------- render ---------------- */

  const audioUrl = hasAudio ? `/api/tasks/${task.id}/audio` : null;

  return (
    <div className="workbench">
      {recovered > 0 && (
        <div className="banner info" role="status">
          Recovered {recovered} unsaved edit{recovered === 1 ? '' : 's'} from this device and
          pushed {recovered === 1 ? 'it' : 'them'} to the server.
        </div>
      )}

      {segments.length === 0 && <p className="muted">This task has no segments yet.</p>}

      <div className="segments">
        {segments.map((segment) => (
          <SegmentRow
            key={segment.id}
            segment={segment}
            label={labelFor(segment, lookup)}
            labelOptions={labelOptions}
            isCurrent={currentIdx >= 0 && segments[currentIdx]?.id === segment.id}
            onSeek={seekTo}
            onChangeText={onChangeText}
            onToggleConfirmed={setConfirmed}
            onRevert={revertSegment}
            onOverrideSpeaker={overrideSpeaker}
            onFocusSegment={(idx) => {
              focusedIdx.current = idx;
            }}
            onTyping={() => {
              lastTyping.current = Date.now();
            }}
            registerRef={(id, el) => {
              if (el) rowRefs.current.set(id, el);
              else rowRefs.current.delete(id);
            }}
            registerTextarea={(id, el) => {
              if (el) textareaRefs.current.set(id, el);
              else textareaRefs.current.delete(id);
            }}
          />
        ))}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            if (Number.isFinite(el.duration)) setDuration(el.duration);
            el.playbackRate = PLAYBACK_RATES[rateIndex];
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
        />
      )}

      <PlayerBar
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        rate={PLAYBACK_RATES[rateIndex]}
        confirmedCount={confirmedCount}
        total={segments.length}
        hasAudio={Boolean(audioUrl)}
        onTogglePlay={togglePlay}
        onSeekBy={seekBy}
        onSeekTo={seekTo}
        onCycleRate={cycleRate}
        onConfirmCurrent={confirmAndAdvance}
        onJumpUnconfirmed={jumpToFirstUnconfirmed}
        onShowShortcuts={() => setShowShortcuts(true)}
      />

      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
