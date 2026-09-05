import JSZip from 'jszip';
import { GoogleGenAI, Type } from '@google/genai';

export interface ParsedParagraph {
  id: string;
  text: string;
  speaker?: 'narrator' | 'ellis' | 'pino' | 'ruth' | 'halvard' | 'tom' | string;
  isQuote?: boolean;
}

export interface ParsedChapter {
  id: number;
  title: string;
  subtitle?: string;
  paragraphs: ParsedParagraph[];
  mood: string;
  ambientPreset: 'night-rain' | 'deep-lab' | 'subtle-hum' | 'late-office' | 'empty-city';
  estimatedDurationSeconds: number;
}

export interface ParsedStory {
  title: string;
  subtitle: string;
  authorNote: string;
  chapters: ParsedChapter[];
}

/**
 * Strips HTML tags and decodes common entities
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Splits raw text into paragraphs and marks quotes
 */
function textToParagraphs(text: string, chapterId: number): ParsedParagraph[] {
  const rawParas = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 10);

  return rawParas.map((para, idx) => {
    const isQuote = para.startsWith('"') || para.startsWith('“');
    return {
      id: `${chapterId}-${idx + 1}`,
      text: para,
      speaker: isQuote ? 'speaker' : 'narrator',
      isQuote,
    };
  });
}

/**
 * Parses an EPUB file buffer into a structured Story object
 */
export async function parseEpubBuffer(buffer: Buffer, fileName: string): Promise<ParsedStory> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Locate container.xml to find the root OPF file path
  let opfPath = 'content.opf';
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('text');
    const match = containerXml.match(/full-path="([^"]+)"/i);
    if (match && match[1]) {
      opfPath = match[1];
    }
  }

  const opfFile = zip.file(opfPath) || Object.values(zip.files).find((f) => f.name.endsWith('.opf'));
  let title = fileName.replace(/\.epub$/i, '').replace(/[-_]/g, ' ');
  let author = 'Unknown Author';
  let description = 'EPUB Audiobook';
  const chapterFiles: string[] = [];

  const baseDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  if (opfFile) {
    const opfContent = await opfFile.async('text');

    // Title
    const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    if (titleMatch) title = titleMatch[1].trim();

    // Creator / Author
    const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    if (authorMatch) author = authorMatch[1].trim();

    // Description
    const descMatch = opfContent.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
    if (descMatch) description = descMatch[1].trim();

    // Manifest: map id -> href
    const manifestMap = new Map<string, string>();
    const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"/gi;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(opfContent)) !== null) {
      manifestMap.set(itemMatch[1], itemMatch[2]);
    }
    // Also try inverted attributes (href before id)
    const itemRegex2 = /<item\s+[^>]*href="([^"]+)"[^>]*id="([^"]+)"/gi;
    while ((itemMatch = itemRegex2.exec(opfContent)) !== null) {
      manifestMap.set(itemMatch[2], itemMatch[1]);
    }

    // Spine: get reading order
    const spineRegex = /<itemref\s+[^>]*idref="([^"]+)"/gi;
    let spineMatch: RegExpExecArray | null;
    while ((spineMatch = spineRegex.exec(opfContent)) !== null) {
      const idref = spineMatch[1];
      const href = manifestMap.get(idref);
      if (href && !href.includes('cover') && (href.endsWith('.html') || href.endsWith('.xhtml') || href.endsWith('.htm'))) {
        chapterFiles.push(baseDir + href);
      }
    }
  }

  // Fallback if spine was empty: scan zip for html/xhtml files
  if (chapterFiles.length === 0) {
    for (const relativePath of Object.keys(zip.files)) {
      if (
        (relativePath.endsWith('.xhtml') || relativePath.endsWith('.html') || relativePath.endsWith('.htm')) &&
        !relativePath.toLowerCase().includes('toc') &&
        !relativePath.toLowerCase().includes('cover')
      ) {
        chapterFiles.push(relativePath);
      }
    }
  }

  const presets: ('night-rain' | 'deep-lab' | 'subtle-hum' | 'late-office' | 'empty-city')[] = [
    'night-rain',
    'empty-city',
    'subtle-hum',
    'deep-lab',
    'late-office',
  ];

  const chapters: ParsedChapter[] = [];
  let chapterIndex = 1;

  for (const path of chapterFiles) {
    const file = zip.file(path);
    if (!file) continue;

    const htmlContent = await file.async('text');
    // Extract title from <h1>, <h2> or <title>
    let chTitle = `Chapter ${chapterIndex}`;
    const h1Match = htmlContent.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
    if (h1Match) {
      chTitle = stripHtml(h1Match[1]).trim();
    } else {
      const tMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (tMatch && tMatch[1].trim() && !tMatch[1].toLowerCase().includes('.xhtml')) {
        chTitle = stripHtml(tMatch[1]).trim();
      }
    }

    const cleanText = stripHtml(htmlContent);
    const paragraphs = textToParagraphs(cleanText, chapterIndex);

    if (paragraphs.length > 0) {
      const wordCount = cleanText.split(/\s+/).length;
      const durationSeconds = Math.round((wordCount / 130) * 60);

      chapters.push({
        id: chapterIndex,
        title: chTitle,
        subtitle: `Section ${chapterIndex}`,
        paragraphs,
        mood: 'Atmospheric narrative flow',
        ambientPreset: presets[(chapterIndex - 1) % presets.length],
        estimatedDurationSeconds: Math.max(30, durationSeconds),
      });

      chapterIndex++;
    }
  }

  // If no chapters could be split, fallback to single chapter
  if (chapters.length === 0) {
    throw new Error('No readable text content found in EPUB file.');
  }

  return {
    title,
    subtitle: `By ${author}`,
    authorNote: description || `Uploaded audiobook version of ${title}.`,
    chapters,
  };
}

/**
 * Extracts raw text from PDF buffer using pdf-parse or fallback
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import('pdf-parse');
    const PDFParse = (pdfModule as any).PDFParse || (pdfModule as any).default?.PDFParse;
    if (typeof PDFParse === 'function') {
      const parser = new PDFParse({ data: buffer });
      if (typeof parser.load === 'function') {
        await parser.load();
      }
      if (typeof parser.getText === 'function') {
        const text = await parser.getText();
        if (text && typeof text === 'string') return text;
      }
    }
  } catch (err) {
    console.warn('pdf-parse module extraction failed, attempting regex/binary text sweep:', err);
  }

  // Fallback: extract ASCII string streams from PDF
  const raw = buffer.toString('binary');
  const streamMatches = raw.match(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g);
  if (streamMatches) {
    let combined = '';
    for (const s of streamMatches) {
      // Look for text fragments inside parenthesis
      const textMatches = s.match(/\(([^)]+)\)/g);
      if (textMatches) {
        combined += textMatches.map((t) => t.slice(1, -1)).join(' ') + '\n\n';
      }
    }
    if (combined.length > 50) return combined;
  }

  throw new Error('Unable to extract text from PDF.');
}

/**
 * Uses Gemini AI (gemini-3.8-flash) to structure PDF or raw book text into an atmospheric audiobook story
 */
export async function structureBookWithGemini(
  ai: GoogleGenAI,
  rawTextOrPdfBase64: { isPdf?: boolean; base64?: string; text?: string },
  fileName: string
): Promise<ParsedStory> {
  const systemPrompt = `You are a master audiobook producer. Your task is to analyze the provided book content and structure it into clean chapters and narrative paragraphs for real-time TTS narration.
Output MUST be strictly valid JSON matching the requested schema.
- Break the story into chapters (1 to 10 chapters depending on length).
- For each chapter, provide title, subtitle, mood, ambientPreset (one of 'night-rain', 'deep-lab', 'subtle-hum', 'late-office', 'empty-city'), and paragraphs.
- For each paragraph, provide a unique id, the cleaned text (no page numbers, no line breaks mid-sentence), and speaker.`;

  const contents: any[] = [];
  if (rawTextOrPdfBase64.isPdf && rawTextOrPdfBase64.base64) {
    contents.push({
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: rawTextOrPdfBase64.base64,
          },
        },
        {
          text: `Extract and produce an audiobook structure for this document (${fileName}). Keep the core narrative intact.`,
        },
      ],
    });
  } else {
    // Send text slice
    const textSample = (rawTextOrPdfBase64.text || '').slice(0, 35000);
    contents.push({
      parts: [
        {
          text: `Here is the book content from file "${fileName}":\n\n${textSample}\n\nProduce the structured audiobook JSON for this story.`,
        },
      ],
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          authorNote: { type: Type.STRING },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                title: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                mood: { type: Type.STRING },
                ambientPreset: {
                  type: Type.STRING,
                  description: "One of: 'night-rain', 'deep-lab', 'subtle-hum', 'late-office', 'empty-city'",
                },
                estimatedDurationSeconds: { type: Type.INTEGER },
                paragraphs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      text: { type: Type.STRING },
                      speaker: { type: Type.STRING },
                      isQuote: { type: Type.BOOLEAN },
                    },
                    required: ['id', 'text'],
                  },
                },
              },
              required: ['id', 'title', 'paragraphs'],
            },
          },
        },
        required: ['title', 'chapters'],
      },
    },
  });

  const jsonText = response.text?.trim();
  if (!jsonText) {
    throw new Error('Empty response from Gemini AI during book structuring.');
  }

  const parsed = JSON.parse(jsonText) as ParsedStory;
  // Ensure presets are valid
  const validPresets = ['night-rain', 'deep-lab', 'subtle-hum', 'late-office', 'empty-city'];
  parsed.chapters = parsed.chapters.map((ch, idx) => ({
    ...ch,
    id: ch.id || idx + 1,
    ambientPreset: validPresets.includes(ch.ambientPreset) ? ch.ambientPreset : 'night-rain',
    estimatedDurationSeconds: ch.estimatedDurationSeconds || Math.max(45, (ch.paragraphs?.length || 5) * 12),
  }));

  return parsed;
}

/**
 * Procedurally splits raw book text into logical chapters if AI API is not active
 */
export function splitTextIntoProceduralChapters(rawText: string, _fileName: string): ParsedChapter[] {
  const clean = stripHtml(rawText);
  const rawParagraphs = clean
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 20);

  if (rawParagraphs.length === 0) {
    return [
      {
        id: 1,
        title: 'Chapter 1',
        subtitle: 'Opening Passage',
        mood: 'Atmospheric narrative flow',
        ambientPreset: 'night-rain',
        estimatedDurationSeconds: 60,
        paragraphs: [
          {
            id: '1-1',
            text: clean.slice(0, 1000) || 'Audiobook text imported.',
            speaker: 'narrator',
          },
        ],
      },
    ];
  }

  // Look for chapter headers in paragraphs
  const chapterBreakIndices: { index: number; title: string }[] = [];
  rawParagraphs.forEach((para, idx) => {
    if (
      para.length < 80 &&
      /^(chapter|part|act|section|book|\b[IVXLCDM]+\b)\s*(\d+|[a-z]+)?/i.test(para)
    ) {
      chapterBreakIndices.push({ index: idx, title: para });
    }
  });

  const presets: ('night-rain' | 'deep-lab' | 'subtle-hum' | 'late-office' | 'empty-city')[] = [
    'night-rain',
    'empty-city',
    'subtle-hum',
    'deep-lab',
    'late-office',
  ];

  const chapters: ParsedChapter[] = [];

  if (chapterBreakIndices.length >= 2) {
    for (let c = 0; c < chapterBreakIndices.length; c++) {
      const start = chapterBreakIndices[c].index;
      const end = c + 1 < chapterBreakIndices.length ? chapterBreakIndices[c + 1].index : rawParagraphs.length;
      const parasInChapter = rawParagraphs.slice(start + 1, end);
      if (parasInChapter.length === 0) continue;

      const formattedParas: ParsedParagraph[] = parasInChapter.map((p, pIdx) => ({
        id: `${c + 1}-${pIdx + 1}`,
        text: p,
        speaker: p.startsWith('"') || p.startsWith('“') ? 'speaker' : 'narrator',
        isQuote: p.startsWith('"') || p.startsWith('“'),
      }));

      const totalWords = parasInChapter.join(' ').split(/\s+/).length;

      chapters.push({
        id: c + 1,
        title: chapterBreakIndices[c].title,
        subtitle: `Section ${c + 1}`,
        mood: 'Atmospheric narrative flow',
        ambientPreset: presets[c % presets.length],
        estimatedDurationSeconds: Math.max(30, Math.round((totalWords / 130) * 60)),
        paragraphs: formattedParas,
      });
    }
  }

  // If no clear chapter headers found, chunk paragraphs into balanced chapters (~8-12 paras each)
  if (chapters.length === 0) {
    const parasPerChapter = 8;
    const totalChapters = Math.ceil(rawParagraphs.length / parasPerChapter);

    for (let c = 0; c < totalChapters; c++) {
      const slice = rawParagraphs.slice(c * parasPerChapter, (c + 1) * parasPerChapter);
      const formattedParas: ParsedParagraph[] = slice.map((p, pIdx) => ({
        id: `${c + 1}-${pIdx + 1}`,
        text: p,
        speaker: p.startsWith('"') || p.startsWith('“') ? 'speaker' : 'narrator',
        isQuote: p.startsWith('"') || p.startsWith('“'),
      }));

      const totalWords = slice.join(' ').split(/\s+/).length;

      chapters.push({
        id: c + 1,
        title: `Chapter ${c + 1}`,
        subtitle: `Part ${c + 1}`,
        mood: 'Atmospheric narrative flow',
        ambientPreset: presets[c % presets.length],
        estimatedDurationSeconds: Math.max(30, Math.round((totalWords / 130) * 60)),
        paragraphs: formattedParas,
      });
    }
  }

  return chapters;
}
