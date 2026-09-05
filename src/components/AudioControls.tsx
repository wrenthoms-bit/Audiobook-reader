import React from 'react';
import { Chapter, AmbientSettings } from '../types';
import { AudioVisualizer } from './AudioVisualizer';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sliders,
  Download,
  Volume2,
  VolumeX,
  Sparkles,
  CloudRain,
  Loader2,
} from 'lucide-react';

interface AudioControlsProps {
  currentChapter: Chapter;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  playbackProgress: number; // 0 to 1
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  settings: AmbientSettings;
  onTogglePlay: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onSeek: (progress: number) => void;
  onOpenMixer: () => void;
  onOpenExport: () => void;
  onUpdateSettings: (newSettings: AmbientSettings) => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  currentChapter,
  isPlaying,
  isLoadingAudio,
  playbackProgress,
  currentTimeSeconds,
  totalDurationSeconds,
  settings,
  onTogglePlay,
  onPrevChapter,
  onNextChapter,
  onSeek,
  onOpenMixer,
  onOpenExport,
  onUpdateSettings,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const speeds = [0.8, 1.0, 1.2];

  const cycleSpeed = () => {
    const nextIdx = (speeds.indexOf(settings.playbackRate) + 1) % speeds.length;
    onUpdateSettings({ ...settings, playbackRate: speeds[nextIdx] });
  };

  const toggleRainMute = () => {
    onUpdateSettings({
      ...settings,
      rainVolume: settings.rainVolume > 0 ? 0 : 0.45,
    });
  };

  return (
    <footer
      id="audiobook-controls-bar"
      className="sticky bottom-0 z-40 w-full glass-panel border-x-0 border-b-0 border-t border-white/12 px-4 py-3.5 sm:px-8 shadow-2xl backdrop-blur-2xl"
    >
      <div className="max-w-6xl mx-auto space-y-3">
        {/* Scrub Bar / Timeline */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono-code text-white/50 w-10 text-right">
            {formatTime(currentTimeSeconds)}
          </span>

          <div className="relative flex-1 group py-1 cursor-pointer">
            <input
              type="range"
              min="0"
              max="1"
              step="0.005"
              value={playbackProgress}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full accent-[#ff4e00] bg-white/10 h-1.5 rounded-lg cursor-pointer"
              title="Seek progress"
            />
          </div>

          <span className="text-[11px] font-mono-code text-white/40 w-10">
            {formatTime(totalDurationSeconds)}
          </span>
        </div>

        {/* Primary Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Track Information */}
          <div className="flex items-center gap-3.5 min-w-0 max-w-[280px] sm:max-w-xs">
            <div className="w-11 h-11 rounded-xl glass-panel-subtle border border-white/10 flex items-center justify-center shrink-0 text-[#ff4e00] shadow-inner">
              <CloudRain className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate tracking-wide">
                {currentChapter.title}{currentChapter.subtitle ? `: ${currentChapter.subtitle}` : ''}
              </div>
              <div className="text-[11px] font-mono-code text-white/50 truncate flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e00] inline-block animate-pulse"></span>
                <span className="text-[#ff4e00] font-semibold text-[10px] uppercase">Gemini Pro TTS</span>
                <span className="text-white/20">•</span>
                <span>{settings.selectedVoice}</span>
                <span className="text-white/20">•</span>
                <span className="capitalize">{settings.tonePrompt.replace('-', ' ')}</span>
              </div>
            </div>
          </div>

          {/* Center: Playback Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={onPrevChapter}
              className="p-2 text-white/50 hover:text-white rounded-full hover:bg-white/10 transition"
              title="Previous Chapter"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              id="main-play-pause-btn"
              onClick={onTogglePlay}
              disabled={isLoadingAudio}
              className="w-12 h-12 rounded-full bg-[#ff4e00] hover:bg-[#ff5f1a] active:scale-95 text-white flex items-center justify-center transition-all shadow-xl shadow-orange-950/60 ring-2 ring-[#ff4e00]/40"
              title={isPlaying ? 'Pause' : 'Read Aloud'}
            >
              {isLoadingAudio ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current text-white" />
              ) : (
                <Play className="w-5 h-5 fill-current translate-x-0.5 text-white" />
              )}
            </button>

            <button
              onClick={onNextChapter}
              className="p-2 text-white/50 hover:text-white rounded-full hover:bg-white/10 transition"
              title="Next Chapter"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Soundscape, Speed, Mixer & Master Export */}
          <div className="flex items-center gap-2">
            {/* Speed Toggle */}
            <button
              onClick={cycleSpeed}
              className="px-2.5 py-1.5 text-xs font-mono-code text-white/80 hover:text-white glass-panel-interactive border border-white/10 rounded-lg transition"
              title="Playback speed"
            >
              {settings.playbackRate}x
            </button>

            {/* Ambient Rain Quick Toggle */}
            <button
              onClick={toggleRainMute}
              className={`p-2 rounded-lg border transition ${
                settings.rainVolume > 0
                  ? 'bg-[#ff4e00]/20 border-[#ff4e00]/40 text-orange-400'
                  : 'glass-panel-subtle border-white/10 text-white/40 hover:text-white/70'
              }`}
              title={settings.rainVolume > 0 ? 'Rain soundscape active' : 'Rain soundscape muted'}
            >
              <CloudRain className="w-4 h-4" />
            </button>

            {/* Soundscape Mixer Dialog Trigger */}
            <button
              id="open-soundscape-mixer-btn"
              onClick={onOpenMixer}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-code text-white/80 hover:text-white glass-panel-interactive border border-white/10 rounded-lg transition"
              title="Open soundscape mixer"
            >
              <Sliders className="w-3.5 h-3.5 text-orange-400" />
              <span className="hidden sm:inline">Mixer</span>
            </button>

            {/* Master Studio Export Button */}
            <button
              id="open-export-modal-btn"
              onClick={onOpenExport}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono-code font-semibold text-white bg-[#ff4e00] hover:bg-[#ff5f1a] rounded-lg transition shadow-lg shadow-orange-950/40"
              title="Export Master WAV Audiobook"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export WAV</span>
            </button>
          </div>
        </div>

        {/* Real-time Atmospheric Audio Visualizer Bar */}
        <div className="pt-0.5">
          <AudioVisualizer isPlaying={isPlaying} className="h-6" />
        </div>
      </div>
    </footer>
  );
};
