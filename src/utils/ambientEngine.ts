import { AmbientSettings } from '../types';
import { audioBufferToWavBlob } from './audioUtils';

/**
 * Ambient Soundscape and Audio Mastering Engine
 * Generates procedural atmospheric rain and gentle analog tape warmth,
 * mixed dynamically with narration for real-time listening and offline WAV export.
 * Note: Drone has been completely removed. Ambient soundscapes automatically mute when narration pauses.
 */
export class AtmosphericAudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Master Gain & Analyser
  private masterGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private ambientMasterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private tapeGain: GainNode | null = null;
  public analyser: AnalyserNode | null = null;

  // Ambient Audio Nodes
  private rainSource: AudioBufferSourceNode | null = null;
  private dropletInterval: any = null;
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

    // Voice track
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.setValueAtTime(this.currentSettings.voiceVolume, this.ctx.currentTime);
    this.voiceGain.connect(this.masterGain);

    // Ambient master sub-bus (starts muted until playback begins)
    this.ambientMasterGain = this.ctx.createGain();
    this.ambientMasterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.ambientMasterGain.connect(this.masterGain);

    // Rain track
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.setValueAtTime(this.currentSettings.rainVolume, this.ctx.currentTime);
    this.rainGain.connect(this.ambientMasterGain);

    // Tape warmth track
    this.tapeGain = this.ctx.createGain();
    this.tapeGain.gain.setValueAtTime(this.currentSettings.analogTapeWarmth, this.ctx.currentTime);
    this.tapeGain.connect(this.ambientMasterGain);

    this.setupRainGenerator();
    this.setupTapeWarmthGenerator();

    this.isInitialized = true;
  }

  // Create continuous procedural rain on asphalt
  private setupRainGenerator() {
    if (!this.ctx || !this.rainGain) return;

    // 5 seconds looping pink noise buffer
    const bufferSize = this.ctx.sampleRate * 5;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
      b6 = white * 0.115926;
    }

    this.rainSource = this.ctx.createBufferSource();
    this.rainSource.buffer = noiseBuffer;
    this.rainSource.loop = true;

    // Gentle filtered rain
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1100, this.ctx.currentTime);
    bandpass.Q.setValueAtTime(0.8, this.ctx.currentTime);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(2800, this.ctx.currentTime);

    this.rainSource.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(this.rainGain);
    this.rainSource.start();

    // Occasional gentle drops - only triggers when speech is active
    this.dropletInterval = setInterval(() => {
      if (!this.ctx || !this.rainGain || this.ctx.state !== 'running' || !this.isPlayingSpeech) return;
      if (Math.random() > 0.65) {
        this.triggerRaindrop();
      }
    }, 500);
  }

  private triggerRaindrop() {
    if (!this.ctx || !this.rainGain || !this.isPlayingSpeech) return;
    try {
      const osc = this.ctx.createOscillator();
      const dropGain = this.ctx.createGain();

      const freq = 450 + Math.random() * 600;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, this.ctx.currentTime + 0.08);

      dropGain.gain.setValueAtTime(0.03 + Math.random() * 0.03, this.ctx.currentTime);
      dropGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.09);

      osc.connect(dropGain);
      dropGain.connect(this.rainGain);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.1);
    } catch {
      // Audio context might be closing
    }
  }

  // Analog tape warmth & subtle studio room air (no drone, no sub bass)
  private setupTapeWarmthGenerator() {
    if (!this.ctx || !this.tapeGain) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.012;
    }

    this.tapeSource = this.ctx.createBufferSource();
    this.tapeSource.buffer = buffer;
    this.tapeSource.loop = true;

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
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(settings.rainVolume, now, 0.05);
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

  /**
   * Master Studio Exporter: Renders Speech + Gentle Rain + Analog Tape Warmth
   * into a clean studio-quality stereo WAV Blob (with no low sub drone).
   */
  public async renderMasterAudiobook(
    speechBuffer: AudioBuffer,
    settings: AmbientSettings,
    extraPaddingSeconds = 3
  ): Promise<Blob> {
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

    voiceSource.connect(voiceHighpass);
    voiceHighpass.connect(voicePresence);
    voicePresence.connect(voiceGain);
    voiceGain.connect(offlineCtx.destination);

    // Start speech after a 0.8-second gentle lead-in
    voiceSource.start(0.8);

    // 2. Ambient Rain Noise Track (Gentle and airy, no sub bass)
    const rainNoiseBuffer = offlineCtx.createBuffer(2, totalFrames, sampleRate);
    const leftNoise = rainNoiseBuffer.getChannelData(0);
    const rightNoise = rainNoiseBuffer.getChannelData(1);

    let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0, b6L = 0;
    let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0, b6R = 0;

    for (let i = 0; i < totalFrames; i++) {
      const wL = Math.random() * 2 - 1;
      b0L = 0.99886 * b0L + wL * 0.0555179;
      b1L = 0.99332 * b1L + wL * 0.0750759;
      b2L = 0.96900 * b2L + wL * 0.1538520;
      b3L = 0.86650 * b3L + wL * 0.3104856;
      b4L = 0.55000 * b4L + wL * 0.5329522;
      b5L = -0.7616 * b5L - wL * 0.0168980;
      leftNoise[i] = (b0L + b1L + b2L + b3L + b4L + b5L + b6L + wL * 0.5362) * 0.03;
      b6L = wL * 0.115926;

      const wR = Math.random() * 2 - 1;
      b0R = 0.99886 * b0R + wR * 0.0555179;
      b1R = 0.99332 * b1R + wR * 0.0750759;
      b2R = 0.96900 * b2R + wR * 0.1538520;
      b3R = 0.86650 * b3R + wR * 0.3104856;
      b4R = 0.55000 * b4R + wR * 0.5329522;
      b5R = -0.7616 * b5R - wR * 0.0168980;
      rightNoise[i] = (b0R + b1R + b2R + b3R + b4R + b5R + b6R + wR * 0.5362) * 0.03;
      b6R = wR * 0.115926;
    }

    const rainSource = offlineCtx.createBufferSource();
    rainSource.buffer = rainNoiseBuffer;

    const rainFilter = offlineCtx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.setValueAtTime(1150, 0);
    rainFilter.Q.setValueAtTime(0.8, 0);

    const rainGain = offlineCtx.createGain();
    const targetRainVol = Math.max(0.0001, settings.rainVolume * 0.3);
    rainGain.gain.setValueAtTime(0.0001, 0);
    rainGain.gain.exponentialRampToValueAtTime(targetRainVol, 1.0);
    rainGain.gain.setValueAtTime(targetRainVol, totalDuration - 1.5);
    rainGain.gain.exponentialRampToValueAtTime(0.0001, totalDuration);

    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(offlineCtx.destination);
    rainSource.start(0);

    // 3. Subtle Room Air / Tape Warmth (no sub drone)
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
    const renderedBuffer = await offlineCtx.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
  }

  public destroy() {
    if (this.dropletInterval) clearInterval(this.dropletInterval);
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this.isInitialized = false;
  }
}

export const atmosphericEngine = new AtmosphericAudioEngine();
