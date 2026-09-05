import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PINOCCHIO_STORY } from './data/storyData';
import { Story, Chapter, Paragraph, AmbientSettings } from './types';
import { atmosphericEngine } from './utils/ambientEngine';
import { synthesizeNarrationAudio, prefetchNarrationAudio } from './utils/ttsClient';
import { ChapterNavigation } from './components/ChapterNavigation';
import { StoryReader } from './components/StoryReader';
import { AudioControls } from './components/AudioControls';
import { AudioMixerModal } from './components/AudioMixerModal';
import { ExportModal } from './components/ExportModal';
import { BookUploadModal } from './components/BookUploadModal';
import {
  BookOpen,
  Volume2,
  Sliders,
  Download,
  Menu,
  X,
  CloudRain,
  Headphones,
  Sparkles,
  UploadCloud,
  Play,
  RotateCcw,
} from 'lucide-react';

export default function App() {
  const [currentStory, setCurrentStory] = useState<Story>(PINOCCHIO_STORY);
  const [currentChapterId, setCurrentChapterId] = useState<number>(1);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [isFullStoryMode, setIsFullStoryMode] = useState<boolean>(false);
  const [isUsingFallbackTTS, setIsUsingFallbackTTS] = useState<boolean>(false);
  const [isMixerOpen, setIsMixerOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isBookUploadOpen, setIsBookUploadOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Mixer & Soundscape Settings (clean speech + gentle rain & tape warmth)
  const [settings, setSettings] = useState<AmbientSettings>({
    masterVolume: 0.9,
    voiceVolume: 1.0,
    rainVolume: 0.35,
    analogTapeWarmth: 0.15,
    playbackRate: 1.0,
    selectedVoice: 'Charon', // Deep, quiet, atmospheric storyteller
    tonePrompt: 'quiet-atmospheric',
  });

  // Current Chapter reference
  const currentChapter =
    currentStory.chapters.find((c) => c.id === currentChapterId) ||
    currentStory.chapters[0] || {
      id: 1,
      title: 'Chapter 1',
      subtitle: '',
      paragraphs: [],
      mood: 'Atmospheric narrative',
      ambientPreset: 'night-rain',
      estimatedDurationSeconds: 60,
    };

  const activeParagraph = currentChapter.paragraphs[activeParagraphIndex] || null;

  // Refs for tracking playback state across async callbacks
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const currentChapterIdRef = useRef(currentChapterId);
  currentChapterIdRef.current = currentChapterId;

  const activeParagraphIndexRef = useRef(activeParagraphIndex);
  activeParagraphIndexRef.current = activeParagraphIndex;

  const currentStoryRef = useRef(currentStory);
  currentStoryRef.current = currentStory;

  const isFullStoryModeRef = useRef(isFullStoryMode);
  isFullStoryModeRef.current = isFullStoryMode;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Update engine audio mixer parameters whenever settings change
  useEffect(() => {
    atmosphericEngine.updateSettings(settings);
  }, [settings]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      atmosphericEngine.destroy();
    };
  }, []);

  // Pre-fetch upcoming paragraph to guarantee zero-latency playback
  const prefetchUpcoming = useCallback((chapterId: number, paraIdx: number) => {
    const story = currentStoryRef.current;
    const chapter = story.chapters.find((c) => c.id === chapterId);
    if (!chapter) return;

    let nextText: string | null = null;
    if (paraIdx + 1 < chapter.paragraphs.length) {
      nextText = chapter.paragraphs[paraIdx + 1].text;
    } else {
      const nextChapter = story.chapters.find((c) => c.id === chapterId + 1);
      if (nextChapter && nextChapter.paragraphs[0]) {
        nextText = nextChapter.paragraphs[0].text;
      }
    }

    if (nextText) {
      prefetchNarrationAudio({
        text: nextText,
        voice: settingsRef.current.selectedVoice,
        tone: settingsRef.current.tonePrompt,
      });
    }
  }, []);

  // Play narration for a specific chapter and paragraph index
  const playParagraph = useCallback(async (chapterId: number, paraIdx: number) => {
    const story = currentStoryRef.current;
    const chapter = story.chapters.find((c) => c.id === chapterId);
    if (!chapter || !chapter.paragraphs[paraIdx]) {
      setIsPlaying(false);
      setIsFullStoryMode(false);
      atmosphericEngine.stopSpeech();
      return;
    }

    setCurrentChapterId(chapterId);
    setActiveParagraphIndex(paraIdx);
    setIsLoadingAudio(true);
    setIsPlaying(true);

    const paragraph = chapter.paragraphs[paraIdx];

    // Scroll smoothly to active paragraph
    const el = document.getElementById(`para-${paragraph.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Prefetch next paragraph in the background
    prefetchUpcoming(chapterId, paraIdx);

    try {
      atmosphericEngine.init();

      const result = await synthesizeNarrationAudio({
        text: paragraph.text,
        voice: settingsRef.current.selectedVoice,
        tone: settingsRef.current.tonePrompt,
      });

      setIsLoadingAudio(false);

      if (!isPlayingRef.current) {
        return;
      }

      if (result.isQuotaExhausted) {
        setIsUsingFallbackTTS(true);
      }

      const onParagraphCompleted = () => {
        if (!isPlayingRef.current) return;

        const currentStorySnap = currentStoryRef.current;
        const currentChapSnap = currentStorySnap.chapters.find((c) => c.id === chapterId);
        if (!currentChapSnap) return;

        const nextParaIdx = activeParagraphIndexRef.current + 1;
        if (nextParaIdx < currentChapSnap.paragraphs.length) {
          playParagraph(chapterId, nextParaIdx);
        } else {
          // End of chapter: Advance to next chapter
          const nextChapterId = chapterId + 1;
          const nextChapter = currentStorySnap.chapters.find((c) => c.id === nextChapterId);
          if (nextChapter) {
            playParagraph(nextChapterId, 0);
          } else {
            // End of the full story
            setIsPlaying(false);
            setIsFullStoryMode(false);
          }
        }
      };

      if (result.isGeminiTTS && result.buffer) {
        atmosphericEngine.playAudioBuffer(
          result.buffer,
          settingsRef.current.playbackRate,
          onParagraphCompleted
        );
      } else {
        setIsUsingFallbackTTS(true);
        atmosphericEngine.playWebSpeech(
          paragraph.text,
          settingsRef.current,
          onParagraphCompleted
        );
      }
    } catch (err) {
      console.warn('Playback error, trying browser voice engine:', err);
      try {
        setIsUsingFallbackTTS(true);
        setIsLoadingAudio(false);
        atmosphericEngine.playWebSpeech(
          paragraph.text,
          settingsRef.current,
          () => {
            if (!isPlayingRef.current) return;
            const nextParaIdx = activeParagraphIndexRef.current + 1;
            const currentChap = currentStoryRef.current.chapters.find((c) => c.id === chapterId);
            if (currentChap && nextParaIdx < currentChap.paragraphs.length) {
              playParagraph(chapterId, nextParaIdx);
            }
          }
        );
      } catch (fallbackErr) {
        console.error('All playback engines failed:', fallbackErr);
        setIsLoadingAudio(false);
        setIsPlaying(false);
        setIsFullStoryMode(false);
      }
    }
  }, [prefetchUpcoming]);

  // Main Play/Pause toggle
  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      atmosphericEngine.stopSpeech();
    } else {
      playParagraph(currentChapterId, activeParagraphIndex);
    }
  };

  // Start reading aloud the FULL STORY from the very beginning (Chapter 1, Paragraph 1)
  const handlePlayFullStory = () => {
    setIsFullStoryMode(true);
    playParagraph(currentStory.chapters[0]?.id || 1, 0);
  };

  // Handle newly uploaded book (PDF or EPUB)
  const handleBookLoaded = (newStory: Story) => {
    atmosphericEngine.stopSpeech();
    setIsPlaying(false);
    setIsFullStoryMode(false);
    setCurrentStory(newStory);
    setCurrentChapterId(newStory.chapters[0]?.id || 1);
    setActiveParagraphIndex(0);
  };

  // Reset back to original Pinocchio story
  const handleResetToPinocchio = () => {
    atmosphericEngine.stopSpeech();
    setIsPlaying(false);
    setIsFullStoryMode(false);
    setCurrentStory(PINOCCHIO_STORY);
    setCurrentChapterId(1);
    setActiveParagraphIndex(0);
  };

  // Navigation handlers
  const handleSelectChapter = (chapterId: number) => {
    setCurrentChapterId(chapterId);
    setActiveParagraphIndex(0);
    if (isPlaying) {
      playParagraph(chapterId, 0);
    } else {
      atmosphericEngine.stopSpeech();
    }
    setIsSidebarOpen(false);
  };

  const handlePrevChapter = () => {
    const currentIndex = currentStory.chapters.findIndex((c) => c.id === currentChapterId);
    if (currentIndex > 0) {
      handleSelectChapter(currentStory.chapters[currentIndex - 1].id);
    }
  };

  const handleNextChapter = () => {
    const currentIndex = currentStory.chapters.findIndex((c) => c.id === currentChapterId);
    if (currentIndex !== -1 && currentIndex < currentStory.chapters.length - 1) {
      handleSelectChapter(currentStory.chapters[currentIndex + 1].id);
    }
  };

  const handleParagraphClick = (paragraph: Paragraph) => {
    const idx = currentChapter.paragraphs.findIndex((p) => p.id === paragraph.id);
    if (idx !== -1) {
      playParagraph(currentChapterId, idx);
    }
  };

  // Seek across chapter paragraphs
  const handleSeek = (progress: number) => {
    const totalParas = currentChapter.paragraphs.length;
    if (totalParas === 0) return;
    const targetIdx = Math.min(totalParas - 1, Math.floor(progress * totalParas));
    playParagraph(currentChapterId, targetIdx);
  };

  const progress = currentChapter.paragraphs.length > 0
    ? (activeParagraphIndex + 1) / currentChapter.paragraphs.length
    : 0;

  const estimatedTotalSeconds = currentChapter.estimatedDurationSeconds || 60;
  const estimatedCurrentSeconds = Math.round(progress * estimatedTotalSeconds);

  const isCustomBook = currentStory.title !== PINOCCHIO_STORY.title;

  return (
    <div className="relative flex flex-col min-h-screen bg-[#050505] text-neutral-100 font-sans selection:bg-[#ff4e00]/30 selection:text-orange-200 overflow-hidden">
      {/* Frosted Glass Mesh Gradient Background */}
      <div className="mesh-bg" aria-hidden="true" />

      {/* Top Application Bar - Frosted Glass Panel */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 glass-panel px-4 py-3 sm:px-8 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition"
            title="Toggle Chapter Navigation"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#ff4e00] flex items-center justify-center text-white shadow-lg shadow-orange-950/50">
              <div className="w-3 h-3 bg-white rotate-45" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-display font-bold tracking-widest text-white flex items-center gap-2">
                {currentStory.title.length > 22 ? `${currentStory.title.slice(0, 20)}...` : currentStory.title}
                <span className="hidden sm:inline-block text-[10px] font-mono-code font-bold px-2 py-0.5 rounded-full bg-[#ff4e00]/20 text-[#ff4e00] border border-[#ff4e00]/30">
                  {isUsingFallbackTTS ? 'Web Speech Engine' : 'Gemini Pro TTS'}
                </span>
              </h1>
              <p className="text-[11px] font-story italic text-white/50 -mt-0.5">
                Atmospheric Spatial Audio & Nocturnal Soundscape
              </p>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Play Full Story Button in Header */}
          <button
            id="header-play-full-story-btn"
            onClick={handlePlayFullStory}
            className={`hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono-code rounded-lg transition shadow-sm backdrop-blur-md ${
              isPlaying
                ? 'bg-[#ff4e00] text-white font-semibold shadow-orange-950/40'
                : 'text-orange-300 bg-[#ff4e00]/15 hover:bg-[#ff4e00]/25 border border-[#ff4e00]/30'
            }`}
            title="Play full story from Chapter 1"
          >
            {isPlaying ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>Playing Story</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Full Story</span>
              </>
            )}
          </button>

          {/* Upload PDF / EPUB Button in Header */}
          <button
            id="header-upload-book-btn"
            onClick={() => setIsBookUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-code text-white/90 hover:text-white glass-panel-interactive border border-white/15 rounded-lg transition"
            title="Upload a PDF or EPUB to listen as an audiobook"
          >
            <UploadCloud className="w-3.5 h-3.5 text-[#ff4e00]" />
            <span className="hidden md:inline">Upload PDF / EPUB</span>
            <span className="md:hidden">Upload</span>
          </button>

          {/* If custom book is active, offer quick reset to Pinocchio */}
          {isCustomBook && (
            <button
              onClick={handleResetToPinocchio}
              className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono-code text-white/50 hover:text-white rounded-lg hover:bg-white/5 transition"
              title="Return to original Pinocchio story"
            >
              <RotateCcw className="w-3 h-3 text-[#ff4e00]" />
              <span>Pinocchio</span>
            </button>
          )}

          {/* Soundscape settings */}
          <button
            onClick={() => setIsMixerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-code text-white/80 hover:text-white glass-panel-interactive rounded-lg transition"
            title="Soundscape Settings"
          >
            <Sliders className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden lg:inline">Soundscape</span>
          </button>

          {/* Export WAV */}
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono-code font-semibold text-white bg-[#ff4e00] hover:bg-[#ff5f1a] rounded-lg transition shadow-lg shadow-orange-950/40"
            title="Export Studio WAV File"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export WAV</span>
          </button>
        </div>
      </header>

      {/* Fallback notification when free-tier Gemini TTS quota is reached */}
      {isUsingFallbackTTS && (
        <div className="bg-amber-950/40 border-b border-amber-500/20 px-4 py-1.5 text-center text-[11px] font-mono-code text-amber-200/90 flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Gemini Free-Tier TTS quota reached (10 requests/day). Seamlessly playing via browser speech engine with atmospheric soundscapes.</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left Sidebar: Chapters & Mood Info */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 sm:w-80 glass-panel border-y-0 border-l-0 border-r border-white/10 p-5 transform transition-transform duration-300 lg:translate-x-0 lg:static lg:block overflow-y-auto ${
            isSidebarOpen ? 'translate-x-0 shadow-2xl bg-neutral-950/90' : '-translate-x-full'
          }`}
        >
          <div className="space-y-6">
            {/* Story Overview Card */}
            <div className="p-4 rounded-2xl glass-panel-subtle border border-white/10 space-y-2.5 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-[#ff4e00]/20 border border-[#ff4e00]/30 text-[10px] font-mono-code uppercase tracking-wider text-orange-400 font-bold">
                  {isCustomBook ? 'Uploaded Book' : 'Original Tale'}
                </span>
                <span className="text-[10px] font-mono-code text-white/40">
                  {currentStory.chapters.length} Chapters
                </span>
              </div>
              <h3 className="font-serif italic font-semibold text-white text-base leading-snug">
                {currentStory.title}
              </h3>
              <p className="text-xs text-white/60 font-story leading-relaxed line-clamp-3">
                {currentStory.authorNote || currentStory.subtitle}
              </p>
              <div className="pt-2 flex items-center justify-between text-[10px] uppercase font-mono-code text-white/40 border-t border-white/10">
                <span>{isUsingFallbackTTS ? 'Browser Voice Engine' : 'Gemini Pro TTS'}</span>
                <span className={isUsingFallbackTTS ? 'text-amber-300 font-semibold' : 'text-emerald-400'}>
                  {isUsingFallbackTTS ? 'Active & Unlimited' : '24kHz Audio'}
                </span>
              </div>
            </div>

            {/* Chapter Navigation List */}
            <ChapterNavigation
              chapters={currentStory.chapters}
              currentChapterId={currentChapterId}
              isPlaying={isPlaying}
              onSelectChapter={handleSelectChapter}
              onPlayFromBeginning={handlePlayFullStory}
              onOpenUploadModal={() => setIsBookUploadOpen(true)}
            />

            {/* Active Soundscape Badge */}
            <div className="p-3.5 rounded-xl glass-panel-subtle border border-white/10 text-xs font-mono-code space-y-1.5 text-white/60">
              <div className="text-[10px] uppercase tracking-wider text-white/40">
                Atmosphere Preset
              </div>
              <div className="flex items-center gap-2 text-orange-400 font-medium text-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="capitalize">{currentChapter.ambientPreset.replace('-', ' ')}</span>
              </div>
              <p className="text-[11px] text-white/45 leading-normal">
                Layered gentle rain on asphalt and subtle analog room tone.
              </p>
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile drawer */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/70 backdrop-blur-md lg:hidden"
          />
        )}

        {/* Literary Story Reader */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <StoryReader
            currentChapter={currentChapter}
            activeParagraphId={activeParagraph?.id || null}
            isPlaying={isPlaying}
            isLoadingAudio={isLoadingAudio}
            isFullStoryMode={isFullStoryMode}
            storyTitle={currentStory.title}
            storySubtitle={currentStory.subtitle}
            authorNote={currentStory.authorNote}
            totalChapters={currentStory.chapters.length}
            onParagraphClick={handleParagraphClick}
            onTogglePlay={handleTogglePlay}
            onPlayFullStory={handlePlayFullStory}
            onOpenUploadModal={() => setIsBookUploadOpen(true)}
          />
        </main>
      </div>

      {/* Persistent Audio Controls Dock */}
      <AudioControls
        currentChapter={currentChapter}
        isPlaying={isPlaying}
        isLoadingAudio={isLoadingAudio}
        playbackProgress={progress}
        currentTimeSeconds={estimatedCurrentSeconds}
        totalDurationSeconds={estimatedTotalSeconds}
        settings={settings}
        onTogglePlay={handleTogglePlay}
        onPrevChapter={handlePrevChapter}
        onNextChapter={handleNextChapter}
        onSeek={handleSeek}
        onOpenMixer={() => setIsMixerOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onUpdateSettings={setSettings}
      />

      {/* Audio Mixer Modal */}
      <AudioMixerModal
        isOpen={isMixerOpen}
        onClose={() => setIsMixerOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />

      {/* Studio WAV Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        chapters={currentStory.chapters}
        currentChapter={currentChapter}
        settings={settings}
      />

      {/* PDF & EPUB Book Upload Modal */}
      <BookUploadModal
        isOpen={isBookUploadOpen}
        onClose={() => setIsBookUploadOpen(false)}
        onBookLoaded={handleBookLoaded}
        currentStoryTitle={currentStory.title}
      />
    </div>
  );
}
