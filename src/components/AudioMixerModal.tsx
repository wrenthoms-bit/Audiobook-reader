import React from 'react';
import { AmbientSettings } from '../types';
import { X, Sliders, CloudRain, Radio, Disc, Mic, Volume2, Sparkles } from 'lucide-react';

interface AudioMixerModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AmbientSettings;
  onUpdateSettings: (newSettings: AmbientSettings) => void;
}

export const AudioMixerModal: React.FC<AudioMixerModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  const presets = [
    {
      name: '3:17 AM Rain',
      desc: 'Gentle night street rain with light tape air',
      settings: {
        rainVolume: 0.45,
        analogTapeWarmth: 0.2,
      },
    },
    {
      name: 'Late Night Calm',
      desc: 'Muted raindrops and subtle room presence',
      settings: {
        rainVolume: 0.2,
        analogTapeWarmth: 0.15,
      },
    },
    {
      name: 'Studio Dry',
      desc: 'Pure isolated narration with crystal clarity',
      settings: {
        rainVolume: 0.0,
        analogTapeWarmth: 0.05,
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="audio-mixer-dialog"
        className="w-full max-w-lg glass-panel rounded-2xl border border-white/15 shadow-2xl p-6 sm:p-7 space-y-6 text-white backdrop-blur-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ff4e00]/20 border border-[#ff4e00]/30 flex items-center justify-center text-[#ff4e00]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base tracking-wide">
                Atmospheric Soundscape Mixer
              </h3>
              <p className="text-[11px] text-white/50 font-story italic -mt-0.5">
                Real-time procedural rain & analog tape warmth
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets */}
        <div>
          <label className="block text-[11px] font-mono-code uppercase tracking-widest text-white/50 mb-2">
            Soundscape Presets
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {presets.map((p) => (
              <button
                key={p.name}
                onClick={() => onUpdateSettings({ ...settings, ...p.settings })}
                className="p-2.5 rounded-xl glass-panel-interactive border border-white/10 hover:border-white/20 text-left transition"
              >
                <div className="text-xs font-semibold text-orange-400">{p.name}</div>
                <div className="text-[10px] text-white/50 line-clamp-2 mt-0.5 font-serif italic">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Faders */}
        <div className="space-y-4 pt-1">
          {/* Voice Level */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono-code">
              <span className="flex items-center gap-1.5 text-white/80">
                <Mic className="w-3.5 h-3.5 text-[#ff4e00]" />
                Storytelling Voice Level
              </span>
              <span className="text-white/50">{Math.round(settings.voiceVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={settings.voiceVolume}
              onChange={(e) => onUpdateSettings({ ...settings, voiceVolume: parseFloat(e.target.value) })}
              className="w-full accent-[#ff4e00] bg-white/10 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          {/* Rain on Asphalt */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono-code">
              <span className="flex items-center gap-1.5 text-white/80">
                <CloudRain className="w-3.5 h-3.5 text-orange-400" />
                3:17 AM Rain on Asphalt & Droplets
              </span>
              <span className="text-white/50">{Math.round(settings.rainVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.05"
              value={settings.rainVolume}
              onChange={(e) => onUpdateSettings({ ...settings, rainVolume: parseFloat(e.target.value) })}
              className="w-full accent-[#ff4e00] bg-white/10 h-1.5 rounded-lg cursor-pointer"
            />
          </div>

          {/* Analog Tape Warmth */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono-code">
              <span className="flex items-center gap-1.5 text-white/80">
                <Disc className="w-3.5 h-3.5 text-amber-400" />
                Analog Tape Saturation & Room Air
              </span>
              <span className="text-white/50">{Math.round(settings.analogTapeWarmth * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="0.8"
              step="0.05"
              value={settings.analogTapeWarmth}
              onChange={(e) => onUpdateSettings({ ...settings, analogTapeWarmth: parseFloat(e.target.value) })}
              className="w-full accent-[#ff4e00] bg-white/10 h-1.5 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Narrator Voice & Tone Choice */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
          <div>
            <label className="block text-[11px] font-mono-code uppercase tracking-wider text-white/50 mb-1.5">
              Narrator Voice
            </label>
            <select
              value={settings.selectedVoice}
              onChange={(e) => onUpdateSettings({ ...settings, selectedVoice: e.target.value as any })}
              className="w-full bg-white/5 border border-white/15 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#ff4e00] backdrop-blur-md cursor-pointer"
            >
              <option value="Charon" className="bg-neutral-900 text-white">Charon (Quiet & Deep)</option>
              <option value="Fenrir" className="bg-neutral-900 text-white">Fenrir (Somber & Resonant)</option>
              <option value="Kore" className="bg-neutral-900 text-white">Kore (Calm & Clear)</option>
              <option value="Zephyr" className="bg-neutral-900 text-white">Zephyr (Soft & Whispered)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono-code uppercase tracking-wider text-white/50 mb-1.5">
              Storytelling Tone
            </label>
            <select
              value={settings.tonePrompt}
              onChange={(e) => onUpdateSettings({ ...settings, tonePrompt: e.target.value as any })}
              className="w-full bg-white/5 border border-white/15 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#ff4e00] backdrop-blur-md cursor-pointer"
            >
              <option value="quiet-atmospheric" className="bg-neutral-900 text-white">Quiet & Atmospheric</option>
              <option value="somber-nocturnal" className="bg-neutral-900 text-white">Somber Nocturnal</option>
              <option value="measured-whisper" className="bg-neutral-900 text-white">Measured Whisper</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-mono-code bg-[#ff4e00] text-white font-semibold rounded-xl hover:bg-[#ff5f1a] transition shadow-lg shadow-orange-950/40"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
