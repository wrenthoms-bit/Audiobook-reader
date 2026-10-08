import { atmosphericEngine } from './ambientEngine';
import { base64ToUint8Array } from './audioUtils';
import { DEFAULT_TONE_PRESET, DEFAULT_VOICE, TONE_PRESETS, VoiceName } from '../../shared/bookConfig';

const DEFAULT_TONE_PROMPT = TONE_PRESETS[DEFAULT_TONE_PRESET].prompt;

// In-memory cache for decoded AudioBuffers
const bufferCache = new Map<string, AudioBuffer>();
let isQuotaExhausted = false;

export function getIsQuotaExhausted(): boolean {
  return isQuotaExhausted;
}

export interface TTSRequestOptions {
  text: string;
  voice?: VoiceName;
  /** Tone guidance text (resolved from the book config / tone preset) */
  tonePrompt?: string;
  /**
   * Always ask the server, even after a quota error. Playback switches to the
   * browser voice once the quota is hit; an export has to wait and retry.
   */
  ignoreQuotaFlag?: boolean;
}

export interface TTSResult {
  buffer?: AudioBuffer;
  isGeminiTTS: boolean;
  isQuotaExhausted?: boolean;
  /** How long the server asked us to wait before trying again */
  retryAfterSeconds?: number;
  /** Why no audio came back, when the server said */
  errorMessage?: string;
}

/**
 * Synthesizes voice narration using Gemini TTS API, with seamless Web Speech API fallback.
 */
export async function synthesizeNarrationAudio(
  options: TTSRequestOptions
): Promise<TTSResult> {
  const { text, voice = DEFAULT_VOICE, tonePrompt = DEFAULT_TONE_PROMPT } = options;
  const cacheKey = `${voice}_${tonePrompt}_${text.trim()}`;

  if (bufferCache.has(cacheKey)) {
    return { buffer: bufferCache.get(cacheKey)!, isGeminiTTS: true };
  }

  // Ensure AudioContext is ready
  atmosphericEngine.init();
  const ctx = atmosphericEngine.getContext();
  if (!ctx) throw new Error('AudioContext failed to initialize');

  // If already known quota exhausted, switch directly to browser speech engine
  if (isQuotaExhausted && !options.ignoreQuotaFlag) {
    return { isGeminiTTS: false, isQuotaExhausted: true };
  }

  let errorMessage: string | undefined;

  try {
    const res = await fetch('/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, tonePrompt }),
    });

    const data = await res.json();

    if (data.isQuotaExhausted) {
      isQuotaExhausted = true;
      return {
        isGeminiTTS: false,
        isQuotaExhausted: true,
        retryAfterSeconds: data.remainingCooldownSeconds,
        errorMessage: data.message,
      };
    }

    if (data.success && data.audioBase64) {
      // Decode WAV base64
      const pcmBytes = base64ToUint8Array(data.audioBase64);
      const audioBuffer = await ctx.decodeAudioData(pcmBytes.buffer);
      bufferCache.set(cacheKey, audioBuffer);
      if (options.ignoreQuotaFlag) isQuotaExhausted = false;
      return { buffer: audioBuffer, isGeminiTTS: true };
    }
    errorMessage = data.error || data.message;
  } catch (err) {
    console.warn('Backend TTS request error, switching to browser voice engine:', err);
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return { isGeminiTTS: false, isQuotaExhausted: options.ignoreQuotaFlag ? false : isQuotaExhausted, errorMessage };
}

/**
 * Creates an atmospheric audio buffer in browser if server API is unavailable.
 */
export async function createAtmosphericFallbackAudioBuffer(
  ctx: AudioContext,
  text: string,
  _tone: string
): Promise<AudioBuffer> {
  // Approximate reading duration: ~130 words per minute for quiet, atmospheric storytelling
  const wordCount = text.split(/\s+/).length;
  const estimatedSeconds = Math.max(3, (wordCount / 130) * 60);
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * estimatedSeconds);

  const buffer = ctx.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);

  let phase = 0;
  const baseFreq = 115;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const sentenceEnvelope = 0.5 + 0.5 * Math.sin(t * 1.5);
    const fundamental = Math.sin(phase);
    const harmonic1 = 0.3 * Math.sin(phase * 2);
    const harmonic2 = 0.15 * Math.sin(phase * 3);
    const noise = (Math.random() * 2 - 1) * 0.05;

    channel[i] = (fundamental + harmonic1 + harmonic2 + noise) * 0.12 * sentenceEnvelope;

    const freq = baseFreq + 8 * Math.sin(t * 2);
    phase += (2 * Math.PI * freq) / sampleRate;
  }

  return buffer;
}

/**
 * Pre-fetches and caches audio for an upcoming paragraph in the background
 * to eliminate gap latency during real-time continuous listening.
 */
export async function prefetchNarrationAudio(options: TTSRequestOptions): Promise<void> {
  // If quota is exhausted, skip background prefetching
  if (isQuotaExhausted) return;

  try {
    const { text, voice = DEFAULT_VOICE, tonePrompt = DEFAULT_TONE_PROMPT } = options;
    if (!text || text.trim().length === 0) return;
    const cacheKey = `${voice}_${tonePrompt}_${text.trim()}`;
    if (bufferCache.has(cacheKey)) return;
    await synthesizeNarrationAudio(options);
  } catch {
    // Non-blocking background prefetch
  }
}

