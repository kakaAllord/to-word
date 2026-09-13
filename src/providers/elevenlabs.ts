import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { elevenLabsApiKey } from '@/lib/env';
import {
  ProviderError,
  type TranscriptionProvider,
  type TranscriptionResult,
  type Turn,
} from './types';

const ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';

type ScribeWord = {
  text: string;
  start?: number;
  end?: number;
  type?: 'word' | 'spacing' | 'audio_event' | string;
  speaker_id?: string | null;
};

type ScribeResponse = {
  language_code?: string;
  /** Reported as low as 0.152 for audio it transcribed well — never gate on it. */
  language_probability?: number;
  text?: string;
  words?: ScribeWord[];
};

/**
 * Group the flat words array into turns, breaking whenever speaker_id changes
 * (spec 6.3). `spacing` entries carry no speaker and must not trigger a break.
 */
export function buildTurns(words: ScribeWord[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  let pendingSpacing = '';

  for (const word of words) {
    const type = word.type ?? 'word';
    // tag_audio_events is off, but never trust the provider to honour it.
    if (type === 'audio_event') continue;

    if (type === 'spacing') {
      if (current) pendingSpacing += word.text ?? ' ';
      continue;
    }

    const speaker = word.speaker_id ?? null;
    const start: number =
      typeof word.start === 'number' ? word.start : ((current as Turn | null)?.end ?? 0);
    const end = typeof word.end === 'number' ? word.end : start;

    if (!current || current.speaker !== speaker) {
      if (current) turns.push(current);
      current = { speaker, start, end, text: word.text ?? '' };
      pendingSpacing = '';
    } else {
      current.text += (pendingSpacing || ' ') + (word.text ?? '');
      current.end = Math.max(current.end, end);
      pendingSpacing = '';
    }
  }
  if (current) turns.push(current);

  return turns
    .map((t) => ({ ...t, text: t.text.replace(/\s+/g, ' ').trim() }))
    .filter((t) => t.text.length > 0);
}

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const date = Date.parse(headerValue);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export class ElevenLabsProvider implements TranscriptionProvider {
  readonly name = 'elevenlabs';
  readonly defaultModel = 'scribe_v1';

  async transcribe(
    audioPath: string,
    options: { model?: string; language?: string } = {},
  ): Promise<TranscriptionResult> {
    const bytes = await readFile(audioPath);
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(bytes)], { type: 'audio/ogg' }), basename(audioPath));
    form.set('model_id', options.model || this.defaultModel);
    form.set('language_code', options.language || 'swa');
    form.set('diarize', 'true');
    // Must stay false: it emits [kero], [ukipiga meza] noise the operator
    // would delete by hand (spec 6.2).
    form.set('tag_audio_events', 'false');
    form.set('timestamps_granularity', 'word');

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'xi-api-key': elevenLabsApiKey() },
        body: form,
      });
    } catch (err) {
      throw new ProviderError(
        `Network error calling ElevenLabs: ${(err as Error).message}`,
        { retryable: true },
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const message = extractMessage(body) || response.statusText;
      throw new ProviderError(`ElevenLabs ${response.status}: ${message}`, {
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const data = (await response.json()) as ScribeResponse;
    const words = data.words ?? [];
    if (words.length === 0) {
      if (data.text?.trim()) {
        // No word timings at all: one untimed turn is better than losing the text.
        return {
          turns: [{ speaker: null, start: 0, end: 0, text: data.text.trim() }],
          language: data.language_code ?? null,
        };
      }
      throw new ProviderError('ElevenLabs returned no words for this audio.');
    }

    return { turns: buildTurns(words), language: data.language_code ?? null };
  }
}

/** Pull the human-readable message out of an ElevenLabs error body. */
function extractMessage(body: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body);
    const detail = parsed?.detail ?? parsed?.error ?? parsed;
    if (typeof detail === 'string') return detail;
    if (typeof detail?.message === 'string') return detail.message;
    return JSON.stringify(detail).slice(0, 500);
  } catch {
    return body.slice(0, 500);
  }
}
