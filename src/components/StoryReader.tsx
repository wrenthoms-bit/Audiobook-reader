import React, { useState } from 'react';
import { Chapter, Paragraph } from '../types';
import {
  Volume2,
  BookOpen,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  UploadCloud,
  Sparkles,
  Loader2,
  Headphones,
} from 'lucide-react';

interface StoryReaderProps {
  currentChapter: Chapter;
  activeParagraphId: string | null;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  isFullStoryMode: boolean;
  storyTitle: string;
  storySubtitle: string;
  authorNote: string;
  totalChapters: number;
  onParagraphClick: (paragraph: Paragraph) => void;
  onTogglePlay: () => void;
  onPlayFullStory: () => void;
  onOpenUploadModal: () => void;
}

export const StoryReader: React.FC<StoryReaderProps> = ({
  currentChapter,
  activeParagraphId,
  isPlaying,
  isLoadingAudio,
  isFullStoryMode,
  storyTitle,
  storySubtitle,
  authorNote,
  totalChapters,
  onParagraphClick,
  onTogglePlay,
  onPlayFullStory,
  onOpenUploadModal,
}) => {
  const [fontSizeIndex, setFontSizeIndex] = useState(1); // 0: normal, 1: large (default for literary), 2: x-large

  const fontSizes = [
    { label: 'Standard', bodyClass: 'text-base leading-relaxed', quoteClass: 'text-base' },
    { label: 'Literary', bodyClass: 'text-lg leading-[1.8]', quoteClass: 'text-lg' },
    { label: 'Generous', bodyClass: 'text-xl leading-[1.9]', quoteClass: 'text-xl' },
  ];

  return (
    <article
      id="story-reader-view"
      className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 bg-transparent text-neutral-100"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Story Master Hero Card with Play Full Story Button & Upload */}
        <div className="glass-panel rounded-2xl border border-white/15 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2 text-xs font-mono-code text-white/60">
              <span className="w-2 h-2 rounded-full bg-[#ff4e00] animate-pulse" />
              <span className="text-[#ff4e00] font-semibold tracking-wider uppercase text-[11px]">
                Gemini Pro TTS Real-time Engine
              </span>
              <span className="text-white/30">•</span>
              <span className="text-white/60">24kHz Broadcast</span>
            </div>

            <button
              onClick={onOpenUploadModal}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel-interactive border border-white/15 text-xs text-white/80 hover:text-white font-mono-code transition"
            >
              <UploadCloud className="w-3.5 h-3.5 text-[#ff4e00]" />
              <span>Upload PDF / EPUB</span>
            </button>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              {storyTitle}
            </h1>
            <p className="text-sm font-serif italic text-white/70">
              {storySubtitle}
            </p>
            {authorNote && (
              <p className="text-xs text-white/50 line-clamp-2 leading-relaxed font-sans">
                {authorNote}
              </p>
            )}
          </div>

          {/* Hero Action: Play Full Story and Controls */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              id="hero-play-full-story-btn"
              onClick={onPlayFullStory}
              disabled={isLoadingAudio}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-3 px-6 py-3.5 bg-[#ff4e00] hover:bg-[#ff5f1a] active:scale-[0.98] text-white font-bold text-sm tracking-wide rounded-xl transition shadow-xl shadow-orange-950/40"
            >
              {isLoadingAudio ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Synthesizing Voice...</span>
                </>
              ) : isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current text-white" />
                  <span>Pause Story Playback</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current text-white translate-x-0.5" />
                  <span>Play Full Story (All Chapters)</span>
                </>
              )}
            </button>

            <button
              onClick={onTogglePlay}
              className="flex items-center gap-2 px-4 py-3.5 rounded-xl glass-panel-interactive border border-white/15 text-xs font-mono-code text-white/80 hover:text-white transition"
              title="Play or pause the current chapter"
            >
              <Headphones className="w-4 h-4 text-orange-400" />
              <span>
                {isPlaying ? 'Playing Chapter' : `Play Chapter ${currentChapter.id}`}
              </span>
            </button>

            <div className="hidden md:flex items-center gap-2 text-xs font-mono-code text-white/40 ml-auto">
              <span>{totalChapters} Chapters</span>
              <span>•</span>
              <span className="text-emerald-400">Low-Latency Pre-buffered</span>
            </div>
          </div>
        </div>

        {/* Chapter Reader Container */}
        <div className="glass-panel rounded-2xl border border-white/12 p-6 sm:p-10 shadow-2xl backdrop-blur-2xl">
          {/* Top Header / Formatting toolbar */}
          <header className="flex items-center justify-between border-b border-white/10 pb-4 mb-8">
            <div className="flex items-center gap-2 text-xs font-mono-code text-white/60">
              <BookOpen className="w-3.5 h-3.5 text-[#ff4e00]" />
              <span className="uppercase tracking-widest text-[11px]">
                Chapter {currentChapter.id} of {totalChapters}
              </span>
            </div>

            <div className="flex items-center gap-1.5 glass-panel-subtle border border-white/10 rounded-lg p-0.5 text-xs text-white/60 font-mono-code">
              <button
                onClick={() => setFontSizeIndex((i) => Math.max(0, i - 1))}
                disabled={fontSizeIndex === 0}
                className="p-1.5 hover:text-white disabled:opacity-30 rounded-md hover:bg-white/10 transition"
                title="Decrease text size"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-[11px] text-white/80 select-none">
                {fontSizes[fontSizeIndex].label}
              </span>
              <button
                onClick={() => setFontSizeIndex((i) => Math.min(fontSizes.length - 1, i + 1))}
                disabled={fontSizeIndex === fontSizes.length - 1}
                className="p-1.5 hover:text-white disabled:opacity-30 rounded-md hover:bg-white/10 transition"
                title="Increase text size"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </header>

          {/* Chapter Header */}
          <div className="text-center mb-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono-code font-medium tracking-widest uppercase bg-[#ff4e00]/20 border border-[#ff4e00]/30 text-orange-400 shadow-sm">
              <span>Part {currentChapter.id} • Atmospheric Narrative</span>
            </div>

            <div className="w-16 h-0.5 bg-[#ff4e00] mx-auto my-3 rounded-full opacity-80" />

            <h2 className="text-3xl sm:text-4xl font-serif italic text-white tracking-wide leading-snug">
              {currentChapter.subtitle || currentChapter.title}
            </h2>

            <p className="text-xs sm:text-sm font-serif italic text-white/60 max-w-lg mx-auto leading-relaxed">
              "{currentChapter.mood}"
            </p>
          </div>

          {/* Story Text Paragraphs */}
          <div className="space-y-5">
            {currentChapter.paragraphs.map((p, idx) => {
              const isActive = p.id === activeParagraphId;

              return (
                <div
                  key={p.id}
                  id={`para-${p.id}`}
                  onClick={() => onParagraphClick(p)}
                  className={`group relative rounded-xl p-4 transition-all duration-300 cursor-pointer backdrop-blur-md ${
                    isActive
                      ? 'bg-[#ff4e00]/10 border border-[#ff4e00]/35 text-white shadow-xl shadow-orange-950/20 ring-1 ring-[#ff4e00]/30'
                      : 'hover:bg-white/[0.04] border border-transparent hover:border-white/10 text-white/85'
                  }`}
                >
                  {/* Active audio indicator dot */}
                  {isActive && (
                    <div className="absolute -left-2 top-4 flex items-center justify-center">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff4e00] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#ff4e00]"></span>
                      </span>
                    </div>
                  )}

                  {/* Paragraph Content */}
                  <div
                    className={`font-story whitespace-pre-line ${fontSizes[fontSizeIndex].bodyClass} text-white/90`}
                  >
                    {p.text}
                  </div>

                  {/* Hover read prompt */}
                  <div className="mt-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-mono-code text-white/45">
                    <span className="flex items-center gap-1.5 text-orange-400">
                      <Volume2 className="w-3.5 h-3.5" />
                      {isActive && isPlaying ? 'Currently narrating' : 'Click to narrate from here'}
                    </span>
                    <span>¶ {idx + 1}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chapter End Flourish */}
          <div className="mt-14 pt-8 border-t border-white/10 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-12 h-0.5 bg-white/20 rounded-full" />
            <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/40">
              End of Chapter {currentChapter.id}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
};
