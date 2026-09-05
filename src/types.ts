export interface Paragraph {
  id: string;
  text: string;
  speaker?: 'narrator' | 'ellis' | 'pino' | 'ruth' | 'halvard' | 'tom';
  isQuote?: boolean;
}

export interface Chapter {
  id: number;
  title: string;
  subtitle?: string;
  paragraphs: Paragraph[];
  mood: string;
  ambientPreset: 'night-rain' | 'deep-lab' | 'subtle-hum' | 'late-office' | 'empty-city';
  estimatedDurationSeconds: number;
}

export interface Story {
  title: string;
  subtitle: string;
  authorNote: string;
  chapters: Chapter[];
}

export interface AmbientSettings {
  masterVolume: number;
  rainVolume: number;
  analogTapeWarmth: number;
  voiceVolume: number;
  playbackRate: number;
  selectedVoice: 'Charon' | 'Fenrir' | 'Kore' | 'Puck' | 'Zephyr';
  tonePrompt: 'quiet-atmospheric' | 'somber-nocturnal' | 'measured-whisper';
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
