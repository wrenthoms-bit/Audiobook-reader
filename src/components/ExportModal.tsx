import React, { useState } from 'react';
import { Chapter, AmbientSettings } from '../types';
import { atmosphericEngine } from '../utils/ambientEngine';
import { synthesizeNarrationAudio, createAtmosphericFallbackAudioBuffer } from '../utils/ttsClient';
import { Download, X, Music, CheckCircle2, Loader2, Sparkles, Disc } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  currentChapter: Chapter;
  settings: AmbientSettings;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  chapters,
  currentChapter,
  settings,
}) => {
  const [exportScope, setExportScope] = useState<'current' | 'full'>('current');
  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState('');
  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setDownloadUrl(null);

    try {
      if (exportScope === 'current') {
        setProgressText(`Synthesizing narration for ${currentChapter.title}...`);
        const fullChapterText = currentChapter.paragraphs.map((p) => p.text).join('\n\n');

        const result = await synthesizeNarrationAudio({
          text: fullChapterText,
          voice: settings.selectedVoice,
          tone: settings.tonePrompt,
        });

        let speechBuffer = result.buffer;
        if (!speechBuffer) {
          atmosphericEngine.init();
          const ctx = atmosphericEngine.getContext();
          if (ctx) {
            speechBuffer = await createAtmosphericFallbackAudioBuffer(ctx, fullChapterText, settings.tonePrompt);
          }
        }
        if (!speechBuffer) throw new Error('Could not generate speech buffer');

        setProgressText('Mastering studio audio: blending rain on asphalt & analog tape warmth...');
        const wavBlob = await atmosphericEngine.renderMasterAudiobook(speechBuffer, settings);

        const url = URL.createObjectURL(wavBlob);
        const fileName = `Pinocchio_${currentChapter.title.replace(/\s+/g, '_')}_Master.wav`;

        setDownloadUrl(url);
        setDownloadFileName(fileName);
        setAudioDuration(speechBuffer.duration);
        setProgressText('Mastering complete! Studio audiobook WAV is ready.');
      } else {
        // Full Audiobook: Master all 7 chapters sequentially
        setProgressText('Gathering narrative text for all 7 chapters...');
        const fullBookText = chapters
          .map((ch) => `${ch.title}: ${ch.subtitle}\n\n` + ch.paragraphs.map((p) => p.text).join('\n\n'))
          .join('\n\n---\n\n');

        setProgressText('Synthesizing full narrative arc with quiet, atmospheric storytelling tone...');
        const fullResult = await synthesizeNarrationAudio({
          text: fullBookText,
          voice: settings.selectedVoice,
          tone: settings.tonePrompt,
        });

        let fullBuffer = fullResult.buffer;
        if (!fullBuffer) {
          atmosphericEngine.init();
          const ctx = atmosphericEngine.getContext();
          if (ctx) {
            fullBuffer = await createAtmosphericFallbackAudioBuffer(ctx, fullBookText, settings.tonePrompt);
          }
        }
        if (!fullBuffer) throw new Error('Could not generate audio buffer');

        setProgressText('Mastering complete multi-track soundscapes (Rain on Asphalt & Room Tone)...');
        const wavBlob = await atmosphericEngine.renderMasterAudiobook(fullBuffer, settings, 5);

        const url = URL.createObjectURL(wavBlob);
        const fileName = `Pinocchio_Complete_Atmospheric_Audiobook_Master.wav`;

        setDownloadUrl(url);
        setDownloadFileName(fileName);
        setAudioDuration(fullBuffer.duration);
        setProgressText('Complete audiobook mastered successfully in 44.1kHz Studio WAV.');
      }
    } catch (err: any) {
      console.error('Audio export error:', err);
      setProgressText(`Export error: ${err?.message || 'Failed to render audio'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="export-audiobook-modal"
        className="w-full max-w-md glass-panel rounded-2xl border border-white/15 shadow-2xl p-6 sm:p-7 space-y-5 text-white backdrop-blur-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ff4e00]/20 border border-[#ff4e00]/30 flex items-center justify-center text-[#ff4e00]">
              <Disc className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base tracking-wide">
                Export Studio Audiobook File
              </h3>
              <p className="text-[11px] text-white/50 font-story italic -mt-0.5">
                Broadcast WAV format with embedded ambient soundscapes
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

        {/* Scope Selector */}
        <div className="space-y-2">
          <label className="block text-[11px] font-mono-code uppercase tracking-widest text-white/50">
            Export Scope
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                setExportScope('current');
                setDownloadUrl(null);
              }}
              className={`p-3 rounded-xl border text-left transition backdrop-blur-md ${
                exportScope === 'current'
                  ? 'bg-[#ff4e00]/20 border-[#ff4e00]/50 text-white shadow-lg shadow-orange-950/20'
                  : 'glass-panel-subtle border-white/10 text-white/60 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold text-white">{currentChapter.title}</div>
              <div className="text-[11px] text-white/50 font-serif italic truncate">{currentChapter.subtitle}</div>
            </button>

            <button
              onClick={() => {
                setExportScope('full');
                setDownloadUrl(null);
              }}
              className={`p-3 rounded-xl border text-left transition backdrop-blur-md ${
                exportScope === 'full'
                  ? 'bg-[#ff4e00]/20 border-[#ff4e00]/50 text-white shadow-lg shadow-orange-950/20'
                  : 'glass-panel-subtle border-white/10 text-white/60 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold text-white">Complete Book</div>
              <div className="text-[11px] text-white/50 font-serif italic">All 7 Parts Mastered</div>
            </button>
          </div>
        </div>

        {/* Format Spec */}
        <div className="rounded-xl glass-panel-subtle border border-white/10 p-3.5 space-y-1.5 text-xs font-mono-code text-white/60">
          <div className="flex justify-between">
            <span>Audio Container:</span>
            <span className="text-white font-medium">Studio Broadcast WAV (.wav)</span>
          </div>
          <div className="flex justify-between">
            <span>Sample Rate & Depth:</span>
            <span className="text-white font-medium">44,100 Hz / 16-Bit Stereo</span>
          </div>
          <div className="flex justify-between">
            <span>Ambient Soundscape:</span>
            <span className="text-orange-400 font-medium">3:17 AM Rain on Asphalt</span>
          </div>
          <div className="flex justify-between">
            <span>Voice Tone:</span>
            <span className="text-orange-300 capitalize">{settings.tonePrompt.replace('-', ' ')}</span>
          </div>
        </div>

        {/* Progress Display */}
        {progressText && (
          <div className="p-3 rounded-xl glass-panel-subtle border border-white/15 text-xs font-mono-code text-white/80 flex items-start gap-2.5">
            {isExporting ? (
              <Loader2 className="w-4 h-4 text-[#ff4e00] animate-spin shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 leading-relaxed">{progressText}</div>
          </div>
        )}

        {/* Download Button or Start Action */}
        <div className="pt-2 border-t border-white/10">
          {downloadUrl ? (
            <div className="space-y-3">
              <audio controls src={downloadUrl} className="w-full h-8" />
              <a
                href={downloadUrl}
                download={downloadFileName}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs font-mono-code uppercase tracking-wider rounded-xl transition shadow-lg shadow-emerald-950/40"
              >
                <Download className="w-4 h-4" />
                Download Studio WAV File
              </a>
            </div>
          ) : (
            <button
              onClick={handleStartExport}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#ff4e00] hover:bg-[#ff5f1a] disabled:opacity-50 text-white font-bold text-xs font-mono-code uppercase tracking-wider rounded-xl transition shadow-lg shadow-orange-950/40"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mastering Audiobook...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Render & Master Audiobook WAV
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
