import React from 'react';
import { BookConfig } from '../types';
import { X, BookOpen, Library, Trash2, UploadCloud, CheckCircle2 } from 'lucide-react';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bundledBooks: BookConfig[];
  savedBooks: BookConfig[];
  currentBookId: string;
  onSelectBook: (book: BookConfig) => void;
  onDeleteBook: (book: BookConfig) => void;
  onOpenUpload: () => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({
  isOpen,
  onClose,
  bundledBooks,
  savedBooks,
  currentBookId,
  onSelectBook,
  onDeleteBook,
  onOpenUpload,
}) => {
  if (!isOpen) return null;

  const renderBook = (book: BookConfig, isSaved: boolean) => {
    const isCurrent = book.id === currentBookId;
    return (
      <div
        key={book.id}
        className={`flex items-center gap-2 rounded-xl border transition ${
          isCurrent ? 'bg-[#ff4e00]/10 border-[#ff4e00]/35' : 'glass-panel-subtle border-white/10 hover:border-white/25'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            onSelectBook(book);
            onClose();
          }}
          className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left"
          title={`Open ${book.title}`}
        >
          <BookOpen className="w-4 h-4 text-[#ff4e00] shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{book.title}</div>
            <div className="text-[11px] text-white/50 font-mono-code truncate">
              {book.author ? `${book.author} · ` : ''}
              {book.chapters.length} {book.chapters.length === 1 ? 'chapter' : 'chapters'}
            </div>
          </div>
        </button>

        {isCurrent && (
          <span className="flex items-center gap-1 text-[10px] font-mono-code uppercase text-emerald-400 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Open
          </span>
        )}

        {isSaved ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove "${book.title}" from this browser?`)) onDeleteBook(book);
            }}
            className="p-2 mr-1.5 text-white/40 hover:text-red-300 rounded-lg hover:bg-white/10 transition shrink-0"
            title="Remove from this browser"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-2 shrink-0" />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="library-modal"
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto glass-panel rounded-2xl border border-white/15 shadow-2xl p-6 sm:p-7 space-y-5 text-white backdrop-blur-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#ff4e00]/20 border border-[#ff4e00]/30 flex items-center justify-center text-[#ff4e00]">
              <Library className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base tracking-wide">Library</h3>
              <p className="text-xs text-white/50 font-serif italic -mt-0.5">
                Uploaded books are saved in this browser
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

        {/* Uploaded books */}
        <div className="space-y-2">
          <div className="text-[11px] font-mono-code uppercase tracking-widest text-white/50">Your Books</div>
          {savedBooks.length > 0 ? (
            savedBooks.map((book) => renderBook(book, true))
          ) : (
            <p className="text-xs text-white/45 font-serif italic">
              Nothing uploaded yet. Books you upload will appear here.
            </p>
          )}
        </div>

        {/* Bundled books */}
        {bundledBooks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-mono-code uppercase tracking-widest text-white/50">Bundled Books</div>
            {bundledBooks.map((book) => renderBook(book, false))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenUpload();
            }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#ff4e00] hover:bg-[#ff5f1a] text-white font-bold text-xs font-mono-code uppercase tracking-wider rounded-xl transition shadow-lg shadow-orange-950/40"
          >
            <UploadCloud className="w-4 h-4" />
            Upload a Book
          </button>
        </div>
      </div>
    </div>
  );
};
