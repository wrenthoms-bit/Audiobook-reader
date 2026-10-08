import type { VoiceName } from '../shared/bookConfig';

export type {
  BookConfig,
  BookCharacter,
  Chapter,
  Paragraph,
  Soundscape,
  VoiceName,
} from '../shared/bookConfig';

export interface AmbientSettings {
  masterVolume: number;
  rainVolume: number;
  analogTapeWarmth: number;
  voiceVolume: number;
  playbackRate: number;
  /** Narrator voice; characters use the voices assigned in the book config */
  selectedVoice: VoiceName;
  /** Tone preset id, or BOOK_TONE_ID for the book's own tone prompt */
  tonePrompt: string;
  cityHumVolume?: number;
  nocturnalDroneVolume?: number;
}

export interface AudioGenerationProgress {
  status: 'idle' | 'generating' | 'ready' | 'error';
  message: string;
  progressPercent: number;
  audioBlobUrl?: string;
  audioDuration?: number;
}
