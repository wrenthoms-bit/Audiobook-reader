import React, { useState } from 'react';
import { BookConfig, Chapter, Paragraph, AmbientSettings, VoiceName } from '../types';
import { resolveTonePrompt, speechParts, toneLabel } from '../../shared/bookConfig';
import { atmosphericEngine, AmbientSegment } from '../utils/ambientEngine';
import { synthesizeNarrationAudio, createAtmosphericFallbackAudioBuffer } from '../utils/ttsClient';
import { audioBufferToWavBlob, audioBufferToMp3Blob, concatAudioBuffersWithOffsets, normalizeBuffersToMatchLoudness } from '../utils/audioUtils';
import { Download, X, Music, CheckCircle2, Loader2, Sparkles, Disc } from 'lucide-react';

type ExportFormat = 'wav' | 'mp3';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: BookConfig;
  currentChapter: Chapter;
  settings: AmbientSettings;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  book,
  currentChapter,
  settings,
}) => {
  const [exportScope, setExportScope] = useState<'current' | 'full'>('current');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp3');
  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState('');
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [masteredBuffer, setMasteredBuffer] = useState<AudioBuffer | null>(null);
  const [masteredBaseName, setMasteredBaseName] = useState('');

  if (!isOpen) return null;

  const chapters = book.chapters;
  const tonePrompt = resolveTonePrompt(settings.tonePrompt, book);
  const fileSafe = (name: string) => name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'Audiobook';

  const encodeAndSetDownload = async (buffer: AudioBuffer, baseName: string, format: ExportFormat) => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);

    if (format === 'mp3') {
      setProgressText('Encoding shareable MP3 (128kbps)...');
      const mp3Blob = await audioBufferToMp3Blob(buffer);
      setDownloadUrl(URL.createObjectURL(mp3Blob));
      setDownloadFileName(`${baseName}.mp3`);
      setProgressText('MP3 ready — perfect for sharing with friends & family.');
    } else {
      setProgressText('Encoding Studio WAV (44.1kHz / 16-bit)...');
      const wavBlob = audioBufferToWavBlob(buffer);
      setDownloadUrl(URL.createObjectURL(wavBlob));
      setDownloadFileName(`${baseName}.wav`);
      setProgressText('Studio WAV ready.');
    }
  };

  const handleFormatChange = async (format: ExportFormat) => {
    setExportFormat(format);
    if (masteredBuffer) {
      setIsExporting(true);
      try {
        await encodeAndSetDownload(masteredBuffer, masteredBaseName, format);
      } catch (err: any) {
        console.error('Audio encode error:', err);
        setProgressText(`Encode error: ${err?.message || 'Failed to encode audio'}`);
      } finally {
        setIsExporting(false);
      }
    }
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setDownloadUrl(null);
    setMasteredBuffer(null);

    try {
      let speechBuffer: AudioBuffer;
      let baseName: string;
      let extraPadding = 3;
      let ambientSegments: AmbientSegment[];

      // Synthesizes a run of same-voice paragraphs as one TTS call. If the API fails to
      // return audio for the whole group (this happens occasionally for long
      // text — it's not quota exhaustion, since later chapters still succeed),
      // bisect the group and retry each half, isolating the failure to the
      // smallest possible section instead of losing the whole chapter to a
      // multi-minute placeholder drone.
      const synthesizeTextGroup = async (paragraphs: Paragraph[], voice: VoiceName, label: string): Promise<AudioBuffer> => {
        const text = paragraphs.map((p) => p.text).join('\n\n');
        const result = await synthesizeNarrationAudio({
          text,
          voice,
          tonePrompt,
        });

        if (result.buffer) return result.buffer;

        if (paragraphs.length > 1) {
          setProgressText(`Retrying ${label} in smaller sections after a synthesis hiccup...`);
          const mid = Math.ceil(paragraphs.length / 2);
          const firstBuffer = await synthesizeTextGroup(paragraphs.slice(0, mid), voice, label);
          const secondBuffer = await synthesizeTextGroup(paragraphs.slice(mid), voice, label);
          const { buffer } = await concatAudioBuffersWithOffsets([firstBuffer, secondBuffer], 0.35, 44100);
          return buffer;
        }

        // A single paragraph still failed (e.g. TTS quota genuinely exhausted) — last resort placeholder
        atmosphericEngine.init();
        const ctx = atmosphericEngine.getContext();
        if (ctx) {
          return createAtmosphericFallbackAudioBuffer(ctx, text, tonePrompt);
        }
        throw new Error(`Could not generate speech buffer for ${label}`);
      };

      const synthesizeChapter = async (chapter: Chapter, label: string): Promise<AudioBuffer> => {
        const titleParagraph: Paragraph = {
          id: `${chapter.id}-title`,
          text: chapter.subtitle ? `${chapter.title}: ${chapter.subtitle}` : chapter.title,
        };

        // Batch consecutive text that shares a voice, so character dialogue
        // is rendered in the voice assigned in the book config.
        const runs: { voice: VoiceName; paragraphs: Paragraph[] }[] = [];
        for (const paragraph of [titleParagraph, ...chapter.paragraphs]) {
          speechParts(book, paragraph, settings.selectedVoice).forEach((part, partIdx) => {
            const piece: Paragraph = { id: `${paragraph.id}-${partIdx}`, text: part.text };
            const lastRun = runs[runs.length - 1];
            if (lastRun && lastRun.voice === part.voice) {
              lastRun.paragraphs.push(piece);
            } else {
              runs.push({ voice: part.voice, paragraphs: [piece] });
            }
          });
        }

        const runBuffers: AudioBuffer[] = [];
        for (const run of runs) {
          runBuffers.push(await synthesizeTextGroup(run.paragraphs, run.voice, label));
        }
        if (runBuffers.length === 1) return runBuffers[0];
        const { buffer } = await concatAudioBuffersWithOffsets(runBuffers, 0.2, 44100);
        return buffer;
      };

      if (exportScope === 'current') {
        setProgressText(`Synthesizing narration for ${currentChapter.title}...`);
        speechBuffer = await synthesizeChapter(currentChapter, currentChapter.title);

        baseName = `${fileSafe(book.title)}_${fileSafe(currentChapter.title)}_Master`;
        const totalDuration = speechBuffer.duration + extraPadding;
        ambientSegments = [
          { preset: currentChapter.soundscape, startTime: 0.8, duration: Math.max(0.5, totalDuration - 0.8) },
        ];
      } else {
        // Full Audiobook: synthesize each chapter individually so its own
        // scene soundscape can be scored accurately across the timeline.
        const chapterBuffers: AudioBuffer[] = [];
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          setProgressText(`Synthesizing narration for Chapter ${ch.id}: ${ch.title} (${i + 1}/${chapters.length})...`);
          chapterBuffers.push(await synthesizeChapter(ch, `Chapter ${ch.id}`));
        }

        setProgressText('Leveling narration loudness across chapters...');
        normalizeBuffersToMatchLoudness(chapterBuffers);

        setProgressText('Assembling chapters into a continuous narrative...');
        const { buffer: combinedSpeech, offsets } = await concatAudioBuffersWithOffsets(chapterBuffers, 1.4, 44100);

        extraPadding = 5;
        speechBuffer = combinedSpeech;
        baseName = `${fileSafe(book.title)}_Complete_Audiobook_Master`;

        const totalDuration = combinedSpeech.duration + extraPadding;
        ambientSegments = chapters.map((ch, i) => {
          const start = offsets[i] + 0.8;
          const end = i < chapters.length - 1 ? offsets[i + 1] + 0.8 : totalDuration;
          return { preset: ch.soundscape, startTime: start, duration: Math.max(0.5, end - start) };
        });
      }

      setProgressText('Mastering studio audio: scoring each scene\'s soundscape & analog tape warmth...');
      const renderedBuffer = await atmosphericEngine.renderMasterAudiobookBuffer(speechBuffer, settings, ambientSegments, extraPadding);

      setMasteredBuffer(renderedBuffer);
      setMasteredBaseName(baseName);
      setAudioDuration(renderedBuffer.duration);

      await encodeAndSetDownload(renderedBuffer, baseName, exportFormat);
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
                Broadcast-quality file with each scene's own soundscape scored in
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
                setMasteredBuffer(null);
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
                setMasteredBuffer(null);
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

        {/* Format Selector */}
        <div className="space-y-2">
          <label className="block text-[11px] font-mono-code uppercase tracking-widest text-white/50">
            File Format
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => handleFormatChange('mp3')}
              disabled={isExporting}
              className={`p-3 rounded-xl border text-left transition backdrop-blur-md disabled:opacity-50 ${
                exportFormat === 'mp3'
                  ? 'bg-[#ff4e00]/20 border-[#ff4e00]/50 text-white shadow-lg shadow-orange-950/20'
                  : 'glass-panel-subtle border-white/10 text-white/60 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold text-white">MP3</div>
              <div className="text-[11px] text-white/50 font-serif italic">Small & easy to share</div>
            </button>

            <button
              onClick={() => handleFormatChange('wav')}
              disabled={isExporting}
              className={`p-3 rounded-xl border text-left transition backdrop-blur-md disabled:opacity-50 ${
                exportFormat === 'wav'
                  ? 'bg-[#ff4e00]/20 border-[#ff4e00]/50 text-white shadow-lg shadow-orange-950/20'
                  : 'glass-panel-subtle border-white/10 text-white/60 hover:text-white hover:border-white/20'
              }`}
            >
              <div className="text-xs font-semibold text-white">WAV</div>
              <div className="text-[11px] text-white/50 font-serif italic">Studio lossless quality</div>
            </button>
          </div>
        </div>

        {/* Format Spec */}
        <div className="rounded-xl glass-panel-subtle border border-white/10 p-3.5 space-y-1.5 text-xs font-mono-code text-white/60">
          <div className="flex justify-between">
            <span>Audio Container:</span>
            <span className="text-white font-medium">
              {exportFormat === 'mp3' ? 'MP3 (.mp3, 128kbps)' : 'Studio Broadcast WAV (.wav)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Sample Rate & Depth:</span>
            <span className="text-white font-medium">
              {exportFormat === 'mp3' ? '44,100 Hz Stereo' : '44,100 Hz / 16-Bit Stereo'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Ambient Soundscape:</span>
            <span className="text-orange-400 font-medium capitalize">
              {exportScope === 'current'
                ? currentChapter.soundscape.replace('-', ' ')
                : 'Multi-Scene (per chapter)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Voice Tone:</span>
            <span className="text-orange-300">{toneLabel(settings.tonePrompt)}</span>
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
                Download {exportFormat.toUpperCase()} File
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
