/**
 * Provider abstraction (spec 6.5). One method: audio path in, turns out.
 * `task.provider` names the implementation, so a future file can be routed
 * elsewhere without touching the pipeline.
 */
export type Turn = {
  speaker: string | null;
  start: number;
  end: number;
  text: string;
};

export type TranscriptionResult = {
  turns: Turn[];
  language: string | null;
};

export interface TranscriptionProvider {
  readonly name: string;
  readonly defaultModel: string;
  transcribe(audioPath: string, options?: { model?: string; language?: string }): Promise<TranscriptionResult>;
}

/** Thrown with the real provider message — never swallowed (spec 6.2, 15). */
export class ProviderError extends Error {
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: { status?: number; retryAfterMs?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.retryable = opts.retryable ?? false;
  }
}
