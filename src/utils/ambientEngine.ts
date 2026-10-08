import { AmbientSettings, Soundscape } from '../types';
import { DEFAULT_SOUNDSCAPE } from '../../shared/bookConfig';
import { audioBufferToWavBlob } from './audioUtils';

export type AmbientPreset = Soundscape;

/**
 * A window of time within a rendered timeline that should be scored with a
 * particular scene's ambient soundscape (used by the offline studio exporter).
 */
export interface AmbientSegment {
  preset: AmbientPreset;
  startTime: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// Procedural noise helpers (shared building blocks for the scene generators)
// ---------------------------------------------------------------------------

function createPinkNoiseBuffer(ctx: BaseAudioContext, seconds: number, amplitude: number): AudioBuffer {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * amplitude;
    b6 = white * 0.115926;
  }
  return buffer;
}

function createBrownNoiseBuffer(ctx: BaseAudioContext, seconds: number, amplitude: number, leak = 0.02): AudioBuffer {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + leak * white) / (1 + leak);
    output[i] = last * amplitude;
  }
  return buffer;
}

function createWhiteBurstBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
  return buffer;
}

// ---------------------------------------------------------------------------
// Scene soundscape generators
//
// Each preset provides a continuous "bed" (looping texture, started/stopped
// by the caller) and an optional one-shot "transient" event that is fired
// occasionally — either from a live setInterval (real-time playback) or from
// a deterministic scan across a fixed time window (offline export render),
// so exported audio matches what real-time listening sounds like.
// ---------------------------------------------------------------------------

interface PresetConfig {
  buildBed: (ctx: BaseAudioContext, output: AudioNode) => AudioScheduledSourceNode[];
  scheduleTransient?: (ctx: BaseAudioContext, output: AudioNode, time: number) => void;
  tickSeconds: number;
  triggerProbability: number;
}

// --- rain: gentle rain on asphalt with occasional droplets ---
function buildNightRainBed(ctx: BaseAudioContext, output: AudioNode): AudioScheduledSourceNode[] {
  const source = ctx.createBufferSource();
  source.buffer = createPinkNoiseBuffer(ctx, 5, 0.035);
  source.loop = true;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1100;
  bandpass.Q.value = 0.8;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2800;

  source.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(output);

  return [source];
}

function scheduleRaindrop(ctx: BaseAudioContext, output: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  const dropGain = ctx.createGain();
  const freq = 450 + Math.random() * 600;

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.4, time + 0.08);

  dropGain.gain.setValueAtTime(0.03 + Math.random() * 0.03, time);
  dropGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);

  osc.connect(dropGain);
  dropGain.connect(output);
  osc.start(time);
  osc.stop(time + 0.12);
}

// --- electrical-hum: low electrical hum with a slow tremolo and rare crackles ---
function buildDeepLabBed(ctx: BaseAudioContext, output: AudioNode): AudioScheduledSourceNode[] {
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 55;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 82.5;

  const humGain = ctx.createGain();
  humGain.gain.value = 0.3;

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.13;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.12;
  lfo.connect(lfoDepth);
  lfoDepth.connect(humGain.gain);

  osc1.connect(humGain);
  osc2.connect(humGain);
  humGain.connect(output);

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = createBrownNoiseBuffer(ctx, 4, 3.2, 0.02);
  noiseSource.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 450;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.06;

  noiseSource.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(output);

  return [osc1, osc2, lfo, noiseSource];
}

function scheduleElectricalCrackle(ctx: BaseAudioContext, output: AudioNode, time: number): void {
  const src = ctx.createBufferSource();
  src.buffer = createWhiteBurstBuffer(ctx, 0.05);

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 2500;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.05 + Math.random() * 0.05, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

  src.connect(highpass);
  highpass.connect(gain);
  gain.connect(output);
  src.start(time);
  src.stop(time + 0.06);
}

// --- room-tone: barely-there room presence, no transients ---
function buildSubtleHumBed(ctx: BaseAudioContext, output: AudioNode): AudioScheduledSourceNode[] {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 50;

  const oscGain = ctx.createGain();
  oscGain.gain.value = 0.15;
  osc.connect(oscGain);
  oscGain.connect(output);

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = createBrownNoiseBuffer(ctx, 4, 2.2, 0.015);
  noiseSource.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 700;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.045;

  noiseSource.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(output);

  return [osc, noiseSource];
}

// --- office: fluorescent buzz, distant HVAC, occasional keyboard clacks ---
function buildLateOfficeBed(ctx: BaseAudioContext, output: AudioNode): AudioScheduledSourceNode[] {
  const buzz = ctx.createOscillator();
  buzz.type = 'sine';
  buzz.frequency.value = 120;
  const buzzGain = ctx.createGain();
  buzzGain.gain.value = 0.045;
  buzz.connect(buzzGain);
  buzzGain.connect(output);

  const fundamental = ctx.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.value = 60;
  const fundamentalGain = ctx.createGain();
  fundamentalGain.gain.value = 0.025;
  fundamental.connect(fundamentalGain);
  fundamentalGain.connect(output);

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = createPinkNoiseBuffer(ctx, 4, 0.04);
  noiseSource.loop = true;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 450;
  bandpass.Q.value = 0.7;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.05;

  noiseSource.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(output);

  return [buzz, fundamental, noiseSource];
}

function scheduleKeyboardClack(ctx: BaseAudioContext, output: AudioNode, time: number): void {
  const clicks = 3 + Math.floor(Math.random() * 4);
  let t = time;
  for (let i = 0; i < clicks; i++) {
    const src = ctx.createBufferSource();
    src.buffer = createWhiteBurstBuffer(ctx, 0.02);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 3200;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.025 + Math.random() * 0.02, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);

    src.connect(highpass);
    highpass.connect(gain);
    gain.connect(output);
    src.start(t);
    src.stop(t + 0.04);
    t += 0.05 + Math.random() * 0.08;
  }
}

// --- city-night: slow wind gusts with rare distant rumbles ---
function buildEmptyCityBed(ctx: BaseAudioContext, output: AudioNode): AudioScheduledSourceNode[] {
  const source = ctx.createBufferSource();
  source.buffer = createBrownNoiseBuffer(ctx, 6, 1.2, 0.035);
  source.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 600;

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.06;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 300;
  lfo.connect(lfoDepth);
  lfoDepth.connect(lowpass.frequency);

  const windGain = ctx.createGain();
  windGain.gain.value = 0.09;

  source.connect(lowpass);
  lowpass.connect(windGain);
  windGain.connect(output);

  return [source, lfo];
}

function scheduleDistantRumble(ctx: BaseAudioContext, output: AudioNode, time: number): void {
  const duration = 3 + Math.random() * 3;
  const src = ctx.createBufferSource();
  src.buffer = createBrownNoiseBuffer(ctx, duration, 1.0, 0.05);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 180;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(0.05, time + duration * 0.35);
  gain.gain.linearRampToValueAtTime(0.0001, time + duration);

  src.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(output);
  src.start(time);
  src.stop(time + duration + 0.1);
}

const PRESET_CONFIGS: Record<AmbientPreset, PresetConfig> = {
  rain: {
    buildBed: buildNightRainBed,
    scheduleTransient: scheduleRaindrop,
    tickSeconds: 0.5,
    triggerProbability: 0.35,
  },
  'electrical-hum': {
    buildBed: buildDeepLabBed,
    scheduleTransient: scheduleElectricalCrackle,
    tickSeconds: 6,
    triggerProbability: 0.25,
  },
  'room-tone': {
    buildBed: buildSubtleHumBed,
    tickSeconds: 999,
    triggerProbability: 0,
  },
  office: {
    buildBed: buildLateOfficeBed,
    scheduleTransient: scheduleKeyboardClack,
    tickSeconds: 9,
    triggerProbability: 0.3,
  },
  'city-night': {
    buildBed: buildEmptyCityBed,
    scheduleTransient: scheduleDistantRumble,
    tickSeconds: 10,
    triggerProbability: 0.2,
  },
};

/**
 * Ambient Soundscape and Audio Mastering Engine
 * Generates a distinct procedural soundscape per scene (rain, city-night,
 * room-tone, electrical-hum, office), crossfading between them as chapters
 * change, mixed dynamically with narration for real-time listening and
 * offline WAV/MP3 export with the same scene-accurate soundscape changes.
 */
export class AtmosphericAudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Master Gain & Analyser
  private masterGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private voiceCompressor: DynamicsCompressorNode | null = null;
  private ambientMasterGain: GainNode | null = null;
  private soundscapeGain: GainNode | null = null;
  private tapeGain: GainNode | null = null;
  public analyser: AnalyserNode | null = null;

  // Active scene soundscape chain
  private activePreset: AmbientPreset | null = null;
  private activeChain: { gain: GainNode; sources: AudioScheduledSourceNode[]; intervalId: any } | null = null;

  private tapeSource: AudioBufferSourceNode | null = null;

  // Active voice source
  private currentVoiceSource: AudioBufferSourceNode | null = null;
  private isPlayingSpeech = false;
  private currentSettings: AmbientSettings = {
    masterVolume: 0.9,
    voiceVolume: 1.0,
    rainVolume: 0.35,
    analogTapeWarmth: 0.15,
    playbackRate: 1.0,
    selectedVoice: 'Charon',
    tonePrompt: 'quiet-atmospheric',
  };

  public init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.currentSettings.masterVolume, this.ctx.currentTime);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Voice track, with a gentle leveling compressor so paragraph-to-paragraph
    // TTS loudness variance doesn't produce audible volume jumps
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.setValueAtTime(this.currentSettings.voiceVolume, this.ctx.currentTime);

    this.voiceCompressor = this.ctx.createDynamicsCompressor();
    this.voiceCompressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
    this.voiceCompressor.knee.setValueAtTime(30, this.ctx.currentTime);
    this.voiceCompressor.ratio.setValueAtTime(3, this.ctx.currentTime);
    this.voiceCompressor.attack.setValueAtTime(0.02, this.ctx.currentTime);
    this.voiceCompressor.release.setValueAtTime(0.25, this.ctx.currentTime);

    this.voiceGain.connect(this.voiceCompressor);
    this.voiceCompressor.connect(this.masterGain);

    // Ambient master sub-bus (starts muted until playback begins)
    this.ambientMasterGain = this.ctx.createGain();
    this.ambientMasterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.ambientMasterGain.connect(this.masterGain);

    // Scene soundscape bus (whichever preset is currently active crossfades in here)
    this.soundscapeGain = this.ctx.createGain();
    this.soundscapeGain.gain.setValueAtTime(this.currentSettings.rainVolume, this.ctx.currentTime);
    this.soundscapeGain.connect(this.ambientMasterGain);

    // Tape warmth track
    this.tapeGain = this.ctx.createGain();
    this.tapeGain.gain.setValueAtTime(this.currentSettings.analogTapeWarmth, this.ctx.currentTime);
    this.tapeGain.connect(this.ambientMasterGain);

    this.setupTapeWarmthGenerator();

    this.isInitialized = true;

    if (!this.activePreset) {
      this.setPreset(DEFAULT_SOUNDSCAPE);
    }
  }

  /**
   * Crossfades the live ambient soundscape to match the given scene preset.
   * Safe to call repeatedly with the same preset (no-op) — call this whenever
   * the active chapter changes during playback.
   */
  public setPreset(preset: AmbientPreset) {
    this.init();
    if (!this.ctx || !this.soundscapeGain) return;
    if (this.activePreset === preset && this.activeChain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const fadeSeconds = 1.4;

    const oldChain = this.activeChain;
    if (oldChain) {
      oldChain.gain.gain.cancelScheduledValues(now);
      oldChain.gain.gain.setValueAtTime(oldChain.gain.gain.value, now);
      oldChain.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSeconds);

      const sourcesToStop = oldChain.sources;
      const intervalToClear = oldChain.intervalId;
      setTimeout(() => {
        clearInterval(intervalToClear);
        sourcesToStop.forEach((s) => {
          try { s.stop(); } catch { /* already stopped */ }
          try { s.disconnect(); } catch { /* already disconnected */ }
        });
        try { oldChain.gain.disconnect(); } catch { /* already disconnected */ }
      }, fadeSeconds * 1000 + 150);
    }

    const config = PRESET_CONFIGS[preset];
    const chainGain = ctx.createGain();
    chainGain.gain.setValueAtTime(0.0001, now);
    chainGain.gain.linearRampToValueAtTime(1.0, now + fadeSeconds);
    chainGain.connect(this.soundscapeGain);

    const sources = config.buildBed(ctx, chainGain);
    sources.forEach((s) => {
      try { s.start(); } catch { /* already started */ }
    });

    let intervalId: any = null;
    if (config.scheduleTransient && config.triggerProbability > 0) {
      const transientFn = config.scheduleTransient;
      intervalId = setInterval(() => {
        if (!this.isPlayingSpeech) return;
        if (Math.random() < config.triggerProbability) {
          transientFn(ctx, chainGain, ctx.currentTime);
        }
      }, config.tickSeconds * 1000);
    }

    this.activeChain = { gain: chainGain, sources, intervalId };
    this.activePreset = preset;
  }

  // Analog tape warmth & subtle studio room air (constant bed under every scene)
  private setupTapeWarmthGenerator() {
    if (!this.ctx || !this.tapeGain) return;

    this.tapeSource = this.ctx.createBufferSource();
    this.tapeSource.buffer = createWhiteBurstBuffer(this.ctx, 2);
    this.tapeSource.loop = true;

    // Scale down the raw white-burst buffer's amplitude for a quiet tape-hiss level
    const rawData = this.tapeSource.buffer.getChannelData(0);
    for (let i = 0; i < rawData.length; i++) rawData[i] *= 0.012;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, this.ctx.currentTime);
    filter.Q.setValueAtTime(0.5, this.ctx.currentTime);

    this.tapeSource.connect(filter);
    filter.connect(this.tapeGain);
    this.tapeSource.start();
  }

  // Update volume mixer settings in real-time
  public updateSettings(settings: AmbientSettings) {
    this.currentSettings = settings;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(settings.masterVolume, now, 0.05);
    }
    if (this.voiceGain) {
      this.voiceGain.gain.setTargetAtTime(settings.voiceVolume, now, 0.05);
    }
    if (this.soundscapeGain) {
      this.soundscapeGain.gain.setTargetAtTime(settings.rainVolume, now, 0.05);
    }
    if (this.tapeGain) {
      this.tapeGain.gain.setTargetAtTime(settings.analogTapeWarmth, now, 0.05);
    }
  }

  // Play a synthesized speech buffer
  public playAudioBuffer(
    audioBuffer: AudioBuffer,
    playbackRate = 1.0,
    onEnded?: () => void
  ): AudioBufferSourceNode {
    this.init();
    if (!this.ctx || !this.voiceGain || !this.ambientMasterGain) {
      throw new Error('Audio engine not initialized');
    }

    this.stopSpeech();

    // Fade in ambient sounds softly when speech begins
    const now = this.ctx.currentTime;
    this.ambientMasterGain.gain.cancelScheduledValues(now);
    this.ambientMasterGain.gain.setTargetAtTime(1.0, now, 0.2);

    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.setValueAtTime(playbackRate, now);

    // Warm speech EQ: gentle high-pass at 85Hz, presence boost at 2.4kHz
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(85, now);

    const presence = this.ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.setValueAtTime(2400, now);
    presence.gain.setValueAtTime(2.0, now);

    source.connect(highpass);
    highpass.connect(presence);
    presence.connect(this.voiceGain);

    this.isPlayingSpeech = true;

    source.onended = () => {
      this.isPlayingSpeech = false;
      this.currentVoiceSource = null;
      if (onEnded) onEnded();
    };

    source.start(now);
    this.currentVoiceSource = source;

    return source;
  }

  // Play narration using browser's native Web Speech API with atmospheric soundscape accompaniment
  public playWebSpeech(
    text: string,
    settings: AmbientSettings,
    onEnded?: () => void
  ) {
    this.init();
    this.stopSpeech();

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis is not supported in this browser environment');
      if (onEnded) onEnded();
      return;
    }

    // Fade in ambient sounds softly when speech begins
    if (this.ctx && this.ambientMasterGain) {
      const now = this.ctx.currentTime;
      this.ambientMasterGain.gain.cancelScheduledValues(now);
      this.ambientMasterGain.gain.setTargetAtTime(1.0, now, 0.2);
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Math.max(0.7, Math.min(1.4, (settings.playbackRate || 1.0) * 0.94));
    utterance.pitch = settings.selectedVoice === 'Kore' ? 1.04 : 0.93;

    // Pick best natural sounding English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((v) => v.lang.startsWith('en') && (
        v.name.includes('Natural') ||
        v.name.includes('Google') ||
        v.name.includes('Daniel') ||
        v.name.includes('Samantha') ||
        v.name.includes('Alex')
      )) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    this.isPlayingSpeech = true;

    utterance.onend = () => {
      this.isPlayingSpeech = false;
      if (onEnded) onEnded();
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('SpeechSynthesis event error:', e.error);
      }
      this.isPlayingSpeech = false;
      if (onEnded) onEnded();
    };

    window.speechSynthesis.speak(utterance);
  }

  // Stop speech AND immediately silence all ambient sounds so nothing lingers
  public stopSpeech() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.currentVoiceSource) {
      try {
        this.currentVoiceSource.stop();
        this.currentVoiceSource.disconnect();
      } catch {
        // Source might have already ended
      }
      this.currentVoiceSource = null;
    }
    this.isPlayingSpeech = false;

    // Completely silence ambient soundscape immediately when stopped/paused
    if (this.ctx && this.ambientMasterGain) {
      const now = this.ctx.currentTime;
      this.ambientMasterGain.gain.cancelScheduledValues(now);
      this.ambientMasterGain.gain.setTargetAtTime(0.0, now, 0.05);
    }
  }

  public decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    this.init();
    if (!this.ctx) throw new Error('AudioContext missing');
    return this.ctx.decodeAudioData(arrayBuffer);
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getIsPlayingSpeech(): boolean {
    return this.isPlayingSpeech;
  }

  // Schedules one scene's soundscape (continuous bed + deterministic transient
  // events) into a fixed time window of an offline render.
  private scheduleOfflinePresetSegment(
    offlineCtx: OfflineAudioContext,
    destination: AudioNode,
    segment: AmbientSegment,
    settings: AmbientSettings
  ) {
    const config = PRESET_CONFIGS[segment.preset];
    const fadeSeconds = Math.min(1.2, segment.duration / 4);
    const targetVolume = Math.max(0.0001, settings.rainVolume);

    const segmentGain = offlineCtx.createGain();
    segmentGain.gain.setValueAtTime(0.0001, segment.startTime);
    segmentGain.gain.linearRampToValueAtTime(targetVolume, segment.startTime + fadeSeconds);
    segmentGain.gain.setValueAtTime(targetVolume, segment.startTime + segment.duration - fadeSeconds);
    segmentGain.gain.linearRampToValueAtTime(0.0001, segment.startTime + segment.duration);
    segmentGain.connect(destination);

    const sources = config.buildBed(offlineCtx, segmentGain);
    const stopTime = segment.startTime + segment.duration + 0.2;
    sources.forEach((s) => {
      try { s.start(segment.startTime); } catch { /* ignore */ }
      try { s.stop(stopTime); } catch { /* ignore */ }
    });

    if (config.scheduleTransient && config.triggerProbability > 0) {
      const endTime = segment.startTime + segment.duration;
      for (let t = segment.startTime + config.tickSeconds; t < endTime; t += config.tickSeconds) {
        if (Math.random() < config.triggerProbability) {
          config.scheduleTransient(offlineCtx, segmentGain, t);
        }
      }
    }
  }

  /**
   * Master Studio Exporter: Renders Speech + scene-accurate ambient soundscapes
   * + Analog Tape Warmth into a clean studio-quality stereo AudioBuffer.
   * `ambientSegments` lets each chapter's window of the timeline be scored
   * with that chapter's own soundscape, crossfading at the boundaries.
   */
  public async renderMasterAudiobookBuffer(
    speechBuffer: AudioBuffer,
    settings: AmbientSettings,
    ambientSegments: AmbientSegment[],
    extraPaddingSeconds = 3
  ): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const totalDuration = speechBuffer.duration + extraPaddingSeconds;
    const totalFrames = Math.ceil(sampleRate * totalDuration);

    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

    // 1. Voice Track with Broadcast Warmth EQ
    const voiceSource = offlineCtx.createBufferSource();
    voiceSource.buffer = speechBuffer;

    const voiceHighpass = offlineCtx.createBiquadFilter();
    voiceHighpass.type = 'highpass';
    voiceHighpass.frequency.setValueAtTime(85, 0);

    const voicePresence = offlineCtx.createBiquadFilter();
    voicePresence.type = 'peaking';
    voicePresence.frequency.setValueAtTime(2500, 0);
    voicePresence.gain.setValueAtTime(1.8, 0);

    const voiceGain = offlineCtx.createGain();
    voiceGain.gain.setValueAtTime(settings.voiceVolume * 1.1, 0);

    // Gentle leveling compressor: smooths any residual loudness variance
    // between chapters/sentences beyond the explicit per-chapter normalization
    const voiceCompressor = offlineCtx.createDynamicsCompressor();
    voiceCompressor.threshold.setValueAtTime(-24, 0);
    voiceCompressor.knee.setValueAtTime(30, 0);
    voiceCompressor.ratio.setValueAtTime(3, 0);
    voiceCompressor.attack.setValueAtTime(0.02, 0);
    voiceCompressor.release.setValueAtTime(0.25, 0);

    voiceSource.connect(voiceHighpass);
    voiceHighpass.connect(voicePresence);
    voicePresence.connect(voiceGain);
    voiceGain.connect(voiceCompressor);
    voiceCompressor.connect(offlineCtx.destination);

    // Start speech after a 0.8-second gentle lead-in
    voiceSource.start(0.8);

    // 2. Scene-accurate ambient soundscape segments
    const ambientBus = offlineCtx.createGain();
    ambientBus.gain.setValueAtTime(1, 0);
    ambientBus.connect(offlineCtx.destination);

    for (const segment of ambientSegments) {
      this.scheduleOfflinePresetSegment(offlineCtx, ambientBus, segment, settings);
    }

    // 3. Subtle Room Air / Tape Warmth (constant bed under every scene)
    if (settings.analogTapeWarmth > 0.02) {
      const tapeBuffer = offlineCtx.createBuffer(2, totalFrames, sampleRate);
      const tapeL = tapeBuffer.getChannelData(0);
      const tapeR = tapeBuffer.getChannelData(1);
      for (let i = 0; i < totalFrames; i++) {
        tapeL[i] = (Math.random() * 2 - 1) * 0.008;
        tapeR[i] = (Math.random() * 2 - 1) * 0.008;
      }
      const tapeSource = offlineCtx.createBufferSource();
      tapeSource.buffer = tapeBuffer;

      const tapeFilter = offlineCtx.createBiquadFilter();
      tapeFilter.type = 'bandpass';
      tapeFilter.frequency.setValueAtTime(3200, 0);
      tapeFilter.Q.setValueAtTime(0.5, 0);

      const tapeGain = offlineCtx.createGain();
      const targetTapeVol = Math.max(0.0001, settings.analogTapeWarmth * 0.15);
      tapeGain.gain.setValueAtTime(0.0001, 0);
      tapeGain.gain.exponentialRampToValueAtTime(targetTapeVol, 1.0);
      tapeGain.gain.setValueAtTime(targetTapeVol, totalDuration - 1.5);
      tapeGain.gain.exponentialRampToValueAtTime(0.0001, totalDuration);

      tapeSource.connect(tapeFilter);
      tapeFilter.connect(tapeGain);
      tapeGain.connect(offlineCtx.destination);
      tapeSource.start(0);
    }

    // Render mixdown
    return offlineCtx.startRendering();
  }

  public async renderMasterAudiobook(
    speechBuffer: AudioBuffer,
    settings: AmbientSettings,
    ambientSegments: AmbientSegment[],
    extraPaddingSeconds = 3
  ): Promise<Blob> {
    const renderedBuffer = await this.renderMasterAudiobookBuffer(speechBuffer, settings, ambientSegments, extraPaddingSeconds);
    return audioBufferToWavBlob(renderedBuffer);
  }

  public destroy() {
    if (this.activeChain) {
      clearInterval(this.activeChain.intervalId);
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this.isInitialized = false;
  }
}

export const atmosphericEngine = new AtmosphericAudioEngine();
