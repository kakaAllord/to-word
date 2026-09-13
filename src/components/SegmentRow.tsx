'use client';

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';
import type { SaveState, SegmentView } from './workbench-types';

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'clean') return null;
  const text =
    state === 'saving'
      ? 'saving…'
      : state === 'saved'
        ? 'saved'
        : state === 'error'
          ? 'not saved'
          : 'unsaved';
  return <span className={`save-state ${state}`}>{text}</span>;
}

export type SegmentRowProps = {
  segment: SegmentView;
  label: string;
  labelOptions: string[];
  isCurrent: boolean;
  onSeek: (seconds: number) => void;
  onChangeText: (id: string, text: string) => void;
  onToggleConfirmed: (id: string, confirmed: boolean) => void;
  onRevert: (id: string) => void;
  onOverrideSpeaker: (id: string, label: string | null) => void;
  onFocusSegment: (idx: number) => void;
  onTyping: () => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  registerTextarea: (id: string, el: HTMLTextAreaElement | null) => void;
};

function SegmentRowInner({
  segment,
  label,
  labelOptions,
  isCurrent,
  onSeek,
  onChangeText,
  onToggleConfirmed,
  onRevert,
  onOverrideSpeaker,
  onFocusSegment,
  onTyping,
  registerRef,
  registerTextarea,
}: SegmentRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);

  useLayoutEffect(() => {
    autoGrow(textareaRef.current);
  }, [segment.editedText]);

  useEffect(() => {
    const onResize = () => autoGrow(textareaRef.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const edited = segment.editedText !== segment.originalText;

  return (
    <div
      ref={(el) => registerRef(segment.id, el)}
      className={[
        'segment',
        isCurrent ? 'current' : '',
        segment.confirmed ? 'confirmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-idx={segment.idx}
    >
      <div className="seg-side">
        {editingLabel ? (
          <select
            autoFocus
            defaultValue={segment.speakerOverride ?? ''}
            onBlur={() => setEditingLabel(false)}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '__custom__') {
                const custom = window.prompt('Speaker label for this turn', label);
                onOverrideSpeaker(segment.id, custom?.trim() ? custom.trim() : null);
              } else {
                onOverrideSpeaker(segment.id, value || null);
              }
              setEditingLabel(false);
            }}
            style={{ fontSize: '0.8rem', padding: '0.15rem' }}
          >
            <option value="">Use mapping ({label})</option>
            {labelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
        ) : (
          <button
            className="seg-label"
            title={`Speaker ${label}${segment.rawSpeaker ? ` (${segment.rawSpeaker})` : ''} — click to override for this turn`}
            onClick={() => setEditingLabel(true)}
          >
            {label}
            {segment.speakerOverride ? '*' : ''}
          </button>
        )}
        <button
          className="seg-time"
          onClick={() => onSeek(segment.startSeconds)}
          title="Play from here"
        >
          {formatClock(segment.startSeconds)}
        </button>
      </div>

      <div className="seg-body">
        <textarea
          ref={(el) => {
            textareaRef.current = el;
            registerTextarea(segment.id, el);
            autoGrow(el);
          }}
          className="seg-text"
          value={segment.editedText}
          rows={1}
          spellCheck={false}
          onChange={(e) => {
            onChangeText(segment.id, e.target.value);
            onTyping();
            autoGrow(e.target);
          }}
          onFocus={() => onFocusSegment(segment.idx)}
          // Click into the text to work on this turn; the clock button seeks.
          aria-label={`Segment ${segment.idx + 1}, speaker ${label}`}
        />

        {showOriginal && (
          <p className="original">
            {segment.originalText || <em>(empty)</em>}
            <br />
            <span className="small">machine transcript, never modified</span>
          </p>
        )}

        <div className={`seg-foot ${segment.confirmed || segment.saveState !== 'clean' ? 'always' : ''}`}>
          <button
            className="small ghost"
            onClick={() => onToggleConfirmed(segment.id, !segment.confirmed)}
            title="Ctrl+Enter confirms and moves to the next segment"
          >
            {segment.confirmed ? '✓ confirmed' : 'confirm'}
          </button>
          <button className="small ghost" onClick={() => setShowOriginal((v) => !v)}>
            {showOriginal ? 'hide original' : 'show original'}
          </button>
          {edited && (
            <button
              className="small ghost"
              onClick={() => {
                if (window.confirm('Revert this segment to the machine transcript?')) {
                  onRevert(segment.id);
                }
              }}
            >
              revert
            </button>
          )}
          <span className="spacer" />
          <SaveIndicator state={segment.saveState} />
        </div>
      </div>
    </div>
  );
}

export default memo(SegmentRowInner);
