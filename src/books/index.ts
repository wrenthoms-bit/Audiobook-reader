/// <reference types="vite/client" />
import { BookConfig, normalizeBookConfig } from '../../shared/bookConfig';

// Every *.book.json file in this folder is bundled with the app.
const modules = import.meta.glob('./*.book.json', { eager: true, import: 'default' });

const FALLBACK_BOOK: BookConfig = normalizeBookConfig({
  title: 'Welcome',
  subtitle: 'No bundled books found',
  chapters: [
    {
      title: 'Getting Started',
      paragraphs: [
        { text: 'Upload a PDF, EPUB, Markdown, or book config file to start listening.' },
      ],
    },
  ],
});

export const BUNDLED_BOOKS: BookConfig[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([path, raw]) => {
    try {
      return [normalizeBookConfig(raw)];
    } catch (err) {
      console.error(`Skipping invalid bundled book ${path}:`, err);
      return [];
    }
  });

export const DEFAULT_BOOK: BookConfig = BUNDLED_BOOKS[0] || FALLBACK_BOOK;
