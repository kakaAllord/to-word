import { ElevenLabsProvider } from './elevenlabs';
import type { TranscriptionProvider } from './types';

const providers: Record<string, TranscriptionProvider> = {
  elevenlabs: new ElevenLabsProvider(),
};

export function getProvider(name: string | null | undefined): TranscriptionProvider {
  const provider = providers[name || 'elevenlabs'];
  if (!provider) throw new Error(`Unknown transcription provider: ${name}`);
  return provider;
}

export * from './types';
