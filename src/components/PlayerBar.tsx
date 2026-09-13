'use client';

import { formatClock } from '@/lib/format';
import { PLAYBACK_RATES } from './workbench-types';

/**
 * Fixed to the bottom of the viewport. On mobile these are the only controls,
 * so every button is a large tap target (spec 8.6).
 */
export default function PlayerBar({
  playing,
  currentTime,
  duration,
  rate,
  confirmedCount,
  total,
  hasAudio,
  onTogglePlay,
  onSeekBy,
  onSeekTo,
  onCycleRate,
  onConfirmCurrent,
  onJumpUnconfirmed,
  onShowShortcuts,
}: {
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  confirmedCount: number;
  total: number;
  hasAudio: boolean;
  onTogglePlay: () => void;
  onSeekBy: (delta: number) => void;
  onSeekTo: (seconds: number) => void;
  onCycleRate: () => void;
  onConfirmCurrent: () => void;
  onJumpUnconfirmed: () => void;
  onShowShortcuts: () => void;
}) {
  const percent = total ? Math.round((confirmedCount / total) * 100) : 0;

  return (
    <div className="player">
      <div className="player-inner">
        <div className="scrub">
          <span className="clock">{formatClock(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.5}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => onSeekTo(Number(e.target.value))}
            disabled={!hasAudio}
            aria-label="Seek"
          />
          <span className="clock">{formatClock(duration)}</span>
        </div>

        <div className="transport">
          <button onClick={() => onSeekBy(-5)} disabled={!hasAudio} title="Back 5 seconds (Ctrl+←)">
            « 5s
          </button>
          <button className="play primary" onClick={onTogglePlay} disabled={!hasAudio} title="Play / pause (Ctrl+Space)">
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button onClick={() => onSeekBy(5)} disabled={!hasAudio} title="Forward 5 seconds (Ctrl+→)">
            5s »
          </button>
          <button onClick={onCycleRate} disabled={!hasAudio} title="Playback speed (Ctrl+\)">
            {rate}×
          </button>
          <button className="mobile-only" onClick={onConfirmCurrent}>
            ✓ Confirm
          </button>

          <span className="spacer" />

          <span className="progress-note">
            {confirmedCount}/{total} confirmed ({percent}%)
          </span>
          <button className="small" onClick={onJumpUnconfirmed} title="Jump to the first unconfirmed segment">
            Jump to first unconfirmed
          </button>
          <button className="small ghost desktop-only" onClick={onShowShortcuts}>
            Shortcuts
          </button>
        </div>

        {!hasAudio && (
          <p className="small muted" style={{ margin: 0 }}>
            The audio for this task has been deleted (it was marked paid). The transcript is
            still fully editable and exportable.
          </p>
        )}
      </div>
    </div>
  );
}

export { PLAYBACK_RATES };
