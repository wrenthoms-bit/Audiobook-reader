/**
 * Book config: the single format every book uses, whether it is bundled with
 * the app (src/books/*.book.json) or produced by uploading a PDF/EPUB/Markdown
 * file. Shared by the client and the server.
 */

export const BOOK_FORMAT_VERSION = 1;

// Gemini prebuilt TTS voices, with Google's own style label for each
export const VOICE_DESCRIPTIONS = {
  Zephyr: 'Bright',
  Puck: 'Upbeat',
  Charon: 'Informative',
  Kore: 'Firm',
  Fenrir: 'Excitable',
  Leda: 'Youthful',
  Orus: 'Firm',
  Aoede: 'Breezy',
  Callirrhoe: 'Easy-going',
  Autonoe: 'Bright',
  Enceladus: 'Breathy',
  Iapetus: 'Clear',
  Umbriel: 'Easy-going',
  Algieba: 'Smooth',
  Despina: 'Smooth',
  Erinome: 'Clear',
  Algenib: 'Gravelly',
  Rasalgethi: 'Informative',
  Laomedeia: 'Upbeat',
  Achernar: 'Soft',
  Alnilam: 'Firm',
  Schedar: 'Even',
  Gacrux: 'Mature',
  Pulcherrima: 'Forward',
  Achird: 'Friendly',
  Zubenelgenubi: 'Casual',
  Vindemiatrix: 'Gentle',
  Sadachbia: 'Lively',
  Sadaltager: 'Knowledgeable',
  Sulafat: 'Warm',
} as const;
export type VoiceName = keyof typeof VOICE_DESCRIPTIONS;
export const VOICES = Object.keys(VOICE_DESCRIPTIONS) as VoiceName[];

export const DEFAULT_VOICE: VoiceName = 'Charon';

// Procedural ambient soundscapes, named by mood rather than by story location
export const SOUNDSCAPES = ['rain', 'city-night', 'room-tone', 'electrical-hum', 'office'] as const;
export type Soundscape = (typeof SOUNDSCAPES)[number];

export const SOUNDSCAPE_DESCRIPTIONS: Record<Soundscape, string> = {
  rain: 'Layered gentle rain on asphalt and subtle analog room tone.',
  'city-night': 'Slow wind gusts through empty streets with rare distant rumbles.',
  'room-tone': 'A barely-there room presence, quiet and still.',
  'electrical-hum': 'Low electrical hum with a slow tremolo and rare crackles.',
  office: 'Fluorescent buzz, distant HVAC drone, and occasional keyboard clacks.',
};

export const DEFAULT_SOUNDSCAPE: Soundscape = 'rain';

// Soundscape ids used before presets were renamed to generic moods
const LEGACY_SOUNDSCAPES: Record<string, Soundscape> = {
  'night-rain': 'rain',
  'empty-city': 'city-night',
  'subtle-hum': 'room-tone',
  'deep-lab': 'electrical-hum',
  'late-office': 'office',
};

// Generic narration tone presets. A book may instead supply its own
// narration.tonePrompt, which takes precedence over its tonePreset.
export const TONE_PRESETS = {
  'neutral-storyteller': {
    label: 'Neutral Storyteller',
    prompt:
      'Read as a clear, engaging audiobook narrator with natural pacing and expressive but unforced delivery.',
  },
  'quiet-atmospheric': {
    label: 'Quiet & Atmospheric',
    prompt:
      'Read in a quiet, atmospheric storytelling tone with gentle cadence, deliberate pauses, and introspective depth. Do not shout or rush.',
  },
  'warm-conversational': {
    label: 'Warm & Conversational',
    prompt:
      'Read in a warm, friendly, conversational tone, as if telling the story to a friend. Relaxed pacing with natural emphasis.',
  },
  dramatic: {
    label: 'Dramatic',
    prompt:
      'Read with dramatic energy and a strong sense of tension and release. Vary pace and intensity to match the action, without shouting.',
  },
  'calm-whisper': {
    label: 'Calm Whisper',
    prompt: 'Read with a calm, gentle, measured tone, quiet and contemplative, as if confiding a secret.',
  },
} as const;
export type TonePresetId = keyof typeof TONE_PRESETS;

export const DEFAULT_TONE_PRESET: TonePresetId = 'neutral-storyteller';

// Tone ids used before the presets were made generic
const LEGACY_TONE_PRESETS: Record<string, TonePresetId> = {
  'somber-nocturnal': 'quiet-atmospheric',
  'measured-whisper': 'calm-whisper',
};

/** Tone selection meaning "use the book's own custom tonePrompt". */
export const BOOK_TONE_ID = 'book';

export const MAX_TONE_PROMPT_LENGTH = 600;

export interface Paragraph {
  id: string;
  text: string;
  /** 'narrator', a character id/name from the book's characters, or any other label */
  speaker?: string;
  isQuote?: boolean;
}

/** A stretch of a paragraph that is spoken in a single voice. */
export interface SpeechPart {
  text: string;
  voice: VoiceName;
}

export interface Chapter {
  id: number;
  title: string;
  subtitle?: string;
  paragraphs: Paragraph[];
  mood: string;
  soundscape: Soundscape;
  estimatedDurationSeconds: number;
}

export interface BookCharacter {
  id: string;
  name: string;
  voice: VoiceName;
}

export interface BookNarration {
  narratorVoice: VoiceName;
  tonePreset: TonePresetId;
  /** Optional custom tone guidance; overrides tonePreset when present */
  tonePrompt?: string;
}

export interface BookConfig {
  formatVersion: number;
  id: string;
  title: string;
  author: string;
  subtitle: string;
  description: string;
  narration: BookNarration;
  defaultSoundscape: Soundscape;
  characters: BookCharacter[];
  chapters: Chapter[];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isVoiceName(value: unknown): value is VoiceName {
  return typeof value === 'string' && (VOICES as readonly string[]).includes(value);
}

function toVoice(value: unknown, fallback: VoiceName): VoiceName {
  if (typeof value !== 'string') return fallback;
  const match = VOICES.find((v) => v.toLowerCase() === value.trim().toLowerCase());
  return match || fallback;
}

function toSoundscape(value: unknown, fallback: Soundscape): Soundscape {
  if (typeof value !== 'string') return fallback;
  const key = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if ((SOUNDSCAPES as readonly string[]).includes(key)) return key as Soundscape;
  return LEGACY_SOUNDSCAPES[key] || fallback;
}

function toTonePreset(value: unknown): TonePresetId {
  if (typeof value !== 'string') return DEFAULT_TONE_PRESET;
  const key = value.trim().toLowerCase();
  if (key in TONE_PRESETS) return key as TonePresetId;
  return LEGACY_TONE_PRESETS[key] || DEFAULT_TONE_PRESET;
}

function estimateDurationSeconds(paragraphs: Paragraph[]): number {
  const wordCount = paragraphs.reduce((sum, p) => sum + p.text.split(/\s+/).length, 0);
  return Math.max(30, Math.round((wordCount / 130) * 60));
}

/**
 * Validates and fills in defaults for a raw book config (hand-written JSON,
 * a parser result, or AI output) so the rest of the app can rely on its shape.
 * Throws if the input has no readable chapters.
 */
export function normalizeBookConfig(raw: unknown, options: { fallbackTitle?: string } = {}): BookConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Book config must be a JSON object.');
  }
  const input = raw as Record<string, any>;

  const title = asString(input.title) || asString(options.fallbackTitle) || 'Untitled Book';
  const narrationInput = input.narration && typeof input.narration === 'object' ? input.narration : {};
  const narratorVoice = toVoice(narrationInput.narratorVoice, DEFAULT_VOICE);
  const tonePrompt = asString(narrationInput.tonePrompt).slice(0, MAX_TONE_PROMPT_LENGTH);
  const defaultSoundscape = toSoundscape(input.defaultSoundscape, DEFAULT_SOUNDSCAPE);

  const characters: BookCharacter[] = [];
  for (const c of Array.isArray(input.characters) ? input.characters : []) {
    if (!c || typeof c !== 'object') continue;
    const name = asString(c.name) || asString(c.id);
    const id = slugify(asString(c.id) || name);
    if (!id || id === 'narrator' || characters.some((existing) => existing.id === id)) continue;
    characters.push({ id, name, voice: toVoice(c.voice, narratorVoice) });
  }

  const chapters: Chapter[] = [];
  for (const ch of Array.isArray(input.chapters) ? input.chapters : []) {
    if (!ch || typeof ch !== 'object') continue;
    // Chapters are renumbered sequentially: playback advances by chapter id + 1
    const chapterId = chapters.length + 1;

    const paragraphs: Paragraph[] = [];
    const seenIds = new Set<string>();
    for (const p of Array.isArray(ch.paragraphs) ? ch.paragraphs : []) {
      const text = asString(typeof p === 'string' ? p : p?.text);
      if (!text) continue;
      let id = asString(p?.id);
      if (!id || seenIds.has(id)) id = `${chapterId}-${paragraphs.length + 1}`;
      seenIds.add(id);

      const paragraph: Paragraph = { id, text };
      const speaker = asString(p?.speaker);
      if (speaker) paragraph.speaker = speaker;
      if (typeof p?.isQuote === 'boolean') paragraph.isQuote = p.isQuote;
      paragraphs.push(paragraph);
    }
    if (paragraphs.length === 0) continue;

    const duration = Number(ch.estimatedDurationSeconds);
    const chapter: Chapter = {
      id: chapterId,
      title: asString(ch.title) || `Chapter ${chapterId}`,
      paragraphs,
      mood: asString(ch.mood),
      soundscape: toSoundscape(ch.soundscape ?? ch.ambientPreset, defaultSoundscape),
      estimatedDurationSeconds:
        Number.isFinite(duration) && duration > 0 ? Math.round(duration) : estimateDurationSeconds(paragraphs),
    };
    const subtitle = asString(ch.subtitle);
    if (subtitle) chapter.subtitle = subtitle;
    chapters.push(chapter);
  }

  if (chapters.length === 0) {
    throw new Error('Book config has no chapters with readable paragraphs.');
  }

  const narration: BookNarration = { narratorVoice, tonePreset: toTonePreset(narrationInput.tonePreset) };
  if (tonePrompt) narration.tonePrompt = tonePrompt;

  return {
    formatVersion: BOOK_FORMAT_VERSION,
    id: slugify(asString(input.id) || title) || 'book',
    title,
    author: asString(input.author),
    subtitle: asString(input.subtitle),
    description: asString(input.description) || asString(input.authorNote),
    narration,
    defaultSoundscape,
    characters,
    chapters,
  };
}

/**
 * Voice for a paragraph: the matching character's voice, otherwise the
 * narrator voice (which the listener can override in the mixer).
 */
export function voiceForParagraph(
  book: BookConfig,
  paragraph: Pick<Paragraph, 'speaker'>,
  narratorVoice: VoiceName
): VoiceName {
  const speaker = paragraph.speaker?.trim().toLowerCase();
  if (!speaker || speaker === 'narrator') return narratorVoice;
  const character = book.characters.find((c) => c.id === speaker || c.name.toLowerCase() === speaker);
  return character ? character.voice : narratorVoice;
}

/**
 * Splits a paragraph into the parts each voice should read. For a paragraph
 * spoken by a character, the quoted speech is read in the character's voice
 * and everything outside the quotes ("he said") by the narrator. A character
 * paragraph without quotation marks is read entirely in the character's voice.
 */
export function speechParts(book: BookConfig, paragraph: Paragraph, narratorVoice: VoiceName): SpeechPart[] {
  const characterVoice = voiceForParagraph(book, paragraph, narratorVoice);
  const whole: SpeechPart[] = [{ text: paragraph.text, voice: characterVoice }];
  if (characterVoice === narratorVoice) return whole;

  const pieces = paragraph.text.split(/("[^"]*"|“[^”]*”)/);
  if (pieces.length === 1) return whole;

  const parts: SpeechPart[] = [];
  pieces.forEach((piece, idx) => {
    const text = piece.trim();
    if (!text) return;
    const voice = idx % 2 === 1 ? characterVoice : narratorVoice;
    const last = parts[parts.length - 1];
    // Stray punctuation between quotes isn't worth its own narration clip
    if (last && (last.voice === voice || !/[\p{L}\p{N}]/u.test(text))) {
      last.text = `${last.text} ${text}`;
    } else {
      parts.push({ text, voice });
    }
  });
  return parts.length > 0 ? parts : whole;
}

/** Tone selection a book starts with: its own prompt if it has one, else its preset. */
export function initialToneId(book: BookConfig): string {
  return book.narration.tonePrompt ? BOOK_TONE_ID : book.narration.tonePreset;
}

/** Resolves a tone selection (preset id or BOOK_TONE_ID) to the guidance text sent to TTS. */
export function resolveTonePrompt(toneId: string, book: BookConfig): string {
  if (toneId === BOOK_TONE_ID && book.narration.tonePrompt) return book.narration.tonePrompt;
  const preset = TONE_PRESETS[toneId as TonePresetId] || TONE_PRESETS[book.narration.tonePreset];
  return (preset || TONE_PRESETS[DEFAULT_TONE_PRESET]).prompt;
}

export function toneLabel(toneId: string): string {
  if (toneId === BOOK_TONE_ID) return 'Book Default';
  return TONE_PRESETS[toneId as TonePresetId]?.label || toneId;
}
