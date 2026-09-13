'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { SpeakerMap } from '@/db/schema';
import { formatClock } from '@/lib/format';
import { STANDARD_LABELS, prettyRaw, type SpeakerStat } from '@/lib/speakers';

/**
 * Speaker mapping (spec 9). The mapping is many-to-one on purpose: Scribe
 * over-splits one person across several ids, so several rows routinely get the
 * same label. Applying writes speaker_map; segment rows are never rewritten.
 */
export default function SpeakerMapper({
  taskId,
  stats,
  initialMap,
  hasAudio,
}: {
  taskId: string;
  stats: SpeakerStat[];
  initialMap: Pick<SpeakerMap, 'rawSpeaker' | 'label'>[];
  hasAudio: boolean;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const stat of stats) initial[stat.rawSpeaker] = '';
    for (const row of initialMap) initial[row.rawSpeaker] = row.label;
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function playSample(start: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = start;
    stopAt.current = start + 6;
    void audio.play().catch(() => undefined);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/speakers`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          map: Object.entries(labels)
            .filter(([, label]) => label.trim())
            .map(([rawSpeaker, label]) => ({ rawSpeaker, label: label.trim() })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setNote('Mapping saved. Every segment with these speaker ids now shows the new label.');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const assigned = Object.values(labels).filter((l) => l.trim()).length;

  return (
    <div className="content">
      {error && <div className="banner error">{error}</div>}
      {note && <div className="banner info">{note}</div>}

      <div className="card">
        <h2>Map speakers</h2>
        <p className="small muted">
          Scribe returns <code>speaker_0</code>, <code>speaker_1</code>… and splits the same
          person across several ids. Give every id that is the same person the same label —
          that is normal here, not a mistake. <strong>R</strong> respondent,{' '}
          <strong>I</strong> interviewer, <strong>I2</strong> second interviewer.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Speaker id</th>
                <th>Share of words</th>
                <th>Turns</th>
                <th>First heard</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.rawSpeaker}>
                  <td>
                    <strong>{prettyRaw(stat.rawSpeaker)}</strong>
                    <div className="small muted">{stat.rawSpeaker}</div>
                    <div className="small muted" style={{ maxWidth: '32ch' }}>
                      {stat.sample}
                    </div>
                  </td>
                  <td className="small">
                    {Math.round(stat.share * 100)}%
                    <span className="bar" style={{ display: 'block', marginTop: 4 }}>
                      <span style={{ width: `${Math.round(stat.share * 100)}%` }} />
                    </span>
                  </td>
                  <td className="small">{stat.turns}</td>
                  <td className="small">
                    <button
                      className="small"
                      onClick={() => playSample(stat.firstStart)}
                      disabled={!hasAudio}
                      title="Play the first few seconds of this speaker"
                    >
                      ▶ {formatClock(stat.firstStart)}
                    </button>
                  </td>
                  <td>
                    <div className="row">
                      {STANDARD_LABELS.map((option) => (
                        <button
                          key={option}
                          className={labels[stat.rawSpeaker] === option ? 'small primary' : 'small'}
                          onClick={() =>
                            setLabels((prev) => ({ ...prev, [stat.rawSpeaker]: option }))
                          }
                        >
                          {option}
                        </button>
                      ))}
                      <input
                        type="text"
                        value={labels[stat.rawSpeaker] ?? ''}
                        onChange={(e) =>
                          setLabels((prev) => ({ ...prev, [stat.rawSpeaker]: e.target.value }))
                        }
                        placeholder="or type a label"
                        style={{ width: '10rem' }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {stats.length === 0 && (
                <tr>
                  <td colSpan={5} className="small muted">
                    This task has no segments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Apply mapping'}
          </button>
          <span className="small muted">
            {assigned} of {stats.length} ids labelled. Unlabelled ids keep showing their raw id.
          </span>
        </div>
      </div>

      {hasAudio && (
        <audio
          ref={audioRef}
          src={`/api/tasks/${taskId}/audio`}
          preload="none"
          onTimeUpdate={(e) => {
            if (stopAt.current !== null && e.currentTarget.currentTime >= stopAt.current) {
              e.currentTarget.pause();
              stopAt.current = null;
            }
          }}
        />
      )}
    </div>
  );
}
