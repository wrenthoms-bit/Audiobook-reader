import React from 'react';
import { Chapter } from '../types';
import { Play, Volume2, CloudRain, Clock, ChevronRight, UploadCloud } from 'lucide-react';

interface ChapterNavigationProps {
  chapters: Chapter[];
  currentChapterId: number;
  isPlaying: boolean;
  onSelectChapter: (chapterId: number) => void;
  onPlayFromBeginning?: () => void;
  onOpenUploadModal?: () => void;
}

export const ChapterNavigation: React.FC<ChapterNavigationProps> = ({
  chapters,
  currentChapterId,
  isPlaying,
  onSelectChapter,
  onPlayFromBeginning,
  onOpenUploadModal,
}) => {
  return (
    <nav aria-label="Audiobook Chapters" className="w-full flex flex-col gap-2">
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-white/10 text-[11px] tracking-widest uppercase text-white/50 font-mono-code">
        <span>Story Chapters</span>
        <span className="text-[#ff4e00] font-semibold">{chapters.length} Parts</span>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {onPlayFromBeginning && (
          <button
            onClick={onPlayFromBeginning}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#ff4e00]/15 hover:bg-[#ff4e00]/25 border border-[#ff4e00]/30 text-[11px] font-mono-code text-orange-300 transition"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Play Start</span>
          </button>
        )}
        {onOpenUploadModal && (
          <button
            onClick={onOpenUploadModal}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl glass-panel-interactive border border-white/15 text-[11px] font-mono-code text-white/80 hover:text-white transition"
          >
            <UploadCloud className="w-3 h-3 text-[#ff4e00]" />
            <span>Upload</span>
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {chapters.map((chapter) => {
          const isActive = chapter.id === currentChapterId;

          return (
            <button
              key={chapter.id}
              id={`chapter-btn-${chapter.id}`}
              onClick={() => onSelectChapter(chapter.id)}
              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 group flex items-start gap-3 backdrop-blur-md ${
                isActive
                  ? 'bg-[#ff4e00]/15 border-[#ff4e00]/50 text-white shadow-lg shadow-orange-950/25'
                  : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/10 text-white/70 hover:text-white hover:border-white/20'
              }`}
            >
              <div
                className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-mono font-medium transition-all ${
                  isActive
                    ? 'bg-[#ff4e00] text-white font-bold shadow-md shadow-orange-950/50'
                    : 'bg-white/10 text-white/50 group-hover:text-white group-hover:bg-white/15'
                }`}
              >
                {isActive && isPlaying ? (
                  <Volume2 className="w-3.5 h-3.5 animate-pulse text-white" />
                ) : (
                  <span>{chapter.id}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4
                    className={`text-sm font-semibold truncate tracking-wide ${
                      isActive ? 'text-orange-200' : 'text-white/90 group-hover:text-white'
                    }`}
                  >
                    {chapter.title}
                    {chapter.subtitle ? (
                      <>: <span className="font-serif italic text-white/80 font-normal">{chapter.subtitle}</span></>
                    ) : null}
                  </h4>
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                      isActive ? 'text-orange-400 translate-x-0.5' : 'text-white/30 group-hover:text-white/60'
                    }`}
                  />
                </div>

                <p className="text-xs text-white/50 line-clamp-1 mt-0.5 font-story italic">
                  {chapter.mood}
                </p>

                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/40 font-mono-code uppercase">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-white/40" />
                    ~{Math.round(chapter.estimatedDurationSeconds / 60)}m {chapter.estimatedDurationSeconds % 60}s
                  </span>
                  <span className="flex items-center gap-1">
                    <CloudRain className="w-3 h-3 text-orange-400/70" />
                    {chapter.ambientPreset.replace('-', ' ')}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
