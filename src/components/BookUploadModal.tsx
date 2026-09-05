import React, { useState, useRef } from 'react';
import { Story } from '../types';
import {
  UploadCloud,
  FileText,
  BookOpen,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  FileType,
} from 'lucide-react';

interface BookUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookLoaded: (newStory: Story) => void;
  currentStoryTitle: string;
}

export const BookUploadModal: React.FC<BookUploadModalProps> = ({
  isOpen,
  onClose,
  onBookLoaded,
  currentStoryTitle,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);
    setStatusMessage(null);
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.epub')) {
      setErrorMessage('Please select a valid PDF (.pdf) or EPUB (.epub) document.');
      return;
    }

    if (file.size > 40 * 1024 * 1024) {
      setErrorMessage('File size exceeds 40MB. Please choose a smaller document or chapter.');
      return;
    }

    setSelectedFile(file);
  };

  // Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleProcessUpload = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Reading file data...');

    try {
      const base64Data = await fileToBase64(selectedFile);
      const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf');
      const fileType = isPdf ? 'pdf' : 'epub';

      setStatusMessage(
        isPdf
          ? 'Analyzing PDF pages and structuring narrative chapters...'
          : 'Extracting EPUB chapter spine and narrative text...'
      );

      const res = await fetch('/api/books/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64Data,
          fileName: selectedFile.name,
          fileType,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.story) {
        throw new Error(data.error || 'Failed to parse book content.');
      }

      setStatusMessage(`Complete! Loaded ${data.story.chapters.length} chapters.`);
      setTimeout(() => {
        onBookLoaded(data.story);
        onClose();
      }, 600);
    } catch (err: any) {
      console.error('Book upload error:', err);
      setErrorMessage(err.message || 'An error occurred while parsing the book file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="book-upload-modal"
        className="w-full max-w-xl glass-panel rounded-2xl border border-white/15 shadow-2xl p-6 sm:p-7 space-y-5 text-white backdrop-blur-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#ff4e00]/20 border border-[#ff4e00]/30 flex items-center justify-center text-[#ff4e00]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base tracking-wide flex items-center gap-2">
                Upload Story for Audiobook
                <span className="text-[10px] uppercase font-mono-code px-1.5 py-0.5 rounded bg-[#ff4e00]/20 text-[#ff4e00] border border-[#ff4e00]/30 font-bold">
                  Gemini Pro TTS
                </span>
              </h3>
              <p className="text-xs text-white/50 font-serif italic -mt-0.5">
                Upload any PDF or EPUB to listen with real-time narration and ambient soundscapes
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

        {/* Current book info */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl glass-panel-subtle border border-white/10 text-xs">
          <div className="flex items-center gap-2 text-white/70">
            <Layers className="w-3.5 h-3.5 text-[#ff4e00]" />
            <span>Currently Active Book:</span>
          </div>
          <span className="font-medium text-white tracking-wide truncate max-w-[200px]">
            {currentStoryTitle}
          </span>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer border-2 border-dashed rounded-2xl p-7 text-center transition flex flex-col items-center justify-center gap-3 ${
            dragActive
              ? 'border-[#ff4e00] bg-[#ff4e00]/10 scale-[1.01]'
              : selectedFile
              ? 'border-emerald-500/50 bg-emerald-950/20'
              : 'border-white/15 hover:border-white/30 bg-black/20 hover:bg-white/5'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.epub"
            onChange={handleFileChange}
            className="hidden"
          />

          {selectedFile ? (
            <div className="space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{selectedFile.name}</p>
                <p className="text-xs text-white/50 font-mono-code mt-0.5">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ·{' '}
                  {selectedFile.name.endsWith('.pdf') ? 'PDF Document' : 'EPUB eBook'}
                </p>
              </div>
              <span className="inline-block text-[11px] text-[#ff4e00] underline font-medium hover:text-orange-300">
                Click or drop another file to change
              </span>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 text-[#ff4e00] flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Drop your <span className="text-[#ff4e00] font-semibold">PDF</span> or{' '}
                  <span className="text-[#ff4e00] font-semibold">EPUB</span> book file here
                </p>
                <p className="text-xs text-white/40 mt-1 font-serif italic">
                  Supports full books, manuscripts, novel chapters, and articles up to 40MB
                </p>
              </div>
              <button
                type="button"
                className="mt-1 px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white/80 font-mono-code transition"
              >
                Browse Local Files
              </button>
            </>
          )}
        </div>

        {/* Engine Capability Details */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono-code text-white/60">
          <div className="p-2.5 rounded-xl glass-panel-subtle border border-white/10 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#ff4e00] shrink-0 mt-0.5" />
            <div>
              <div className="text-white font-medium text-[11px]">Gemini Pro TTS</div>
              <div className="text-[10px] text-white/50">24kHz studio vocal synthesis</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl glass-panel-subtle border border-white/10 flex items-start gap-2">
            <FileType className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-white font-medium text-[11px]">Real-Time Streaming</div>
              <div className="text-[10px] text-white/50">Continuous chapter listening</div>
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {statusMessage && (
          <div className="p-3 rounded-xl glass-panel-subtle border border-white/15 text-xs font-mono-code text-white/80 flex items-center gap-2.5">
            {isProcessing ? (
              <Loader2 className="w-4 h-4 text-[#ff4e00] animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="flex-1">{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs font-mono-code text-red-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleProcessUpload}
            disabled={!selectedFile || isProcessing}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#ff4e00] hover:bg-[#ff5f1a] disabled:opacity-40 disabled:hover:bg-[#ff4e00] text-white font-bold text-xs font-mono-code uppercase tracking-wider rounded-xl transition shadow-lg shadow-orange-950/40"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing Book...
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                Load & Listen to Audiobook
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
