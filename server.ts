import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  parseEpubBuffer,
  extractPdfText,
  structureBookWithGemini,
  splitTextIntoProceduralChapters,
} from './server/bookParser';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to write string into DataView for WAV header
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Convert PCM bytes to WAV ArrayBuffer
function pcmToWavBuffer(pcmData: Uint8Array, sampleRate = 24000, numChannels = 1): Buffer {
  const dataLen = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLen, true);

  new Uint8Array(buffer, 44).set(pcmData);
  return Buffer.from(buffer);
}

// In-memory cache for synthesized audio clips
const audioCache = new Map<string, string>();
let ttsQuotaExceededUntil = 0;

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// TTS Narration API Endpoint
app.post('/api/tts/synthesize', async (req, res) => {
  const { text, voice = 'Charon', tone = 'quiet-atmospheric' } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text prompt is required.' });
  }

  // Create cache key
  const cacheKey = `${voice}_${tone}_${text.trim()}`;
  if (audioCache.has(cacheKey)) {
    return res.json({
      success: true,
      audioBase64: audioCache.get(cacheKey),
      mimeType: 'audio/wav',
      sampleRate: 24000,
      cached: true,
    });
  }

  // If in quota cooldown, bypass calling Gemini API and use browser voice engine
  if (Date.now() < ttsQuotaExceededUntil) {
    const remainingSeconds = Math.max(1, Math.ceil((ttsQuotaExceededUntil - Date.now()) / 1000));
    return res.status(200).json({
      success: false,
      fallback: true,
      isQuotaExhausted: true,
      remainingCooldownSeconds: remainingSeconds,
      message: 'Gemini TTS daily quota active. Seamlessly using browser high-fidelity speech engine.',
    });
  }

  const ai = getGenAI();
  if (!ai) {
    return res.status(200).json({
      success: false,
      fallback: true,
      message: 'GEMINI_API_KEY is not configured. Falling back to client-side speech engine.',
    });
  }

  try {
    let toneGuidance = 'Read in a quiet, atmospheric storytelling tone with gentle cadence, deliberate pauses, and introspective depth. Do not shout or rush. Speak like a solitary narrator in an empty city at 3:17 in the morning.';
    if (tone === 'somber-nocturnal') {
      toneGuidance = 'Read in a deeply somber, muted nocturnal storytelling tone. Slow, measured, observant, whispered and quiet.';
    } else if (tone === 'measured-whisper') {
      toneGuidance = 'Read with a calm, gentle, measured tone, quiet and contemplative, as if confiding a secret.';
    }

    const promptText = `${toneGuidance}\n\n"${text.trim()}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const pcmBase64 = part?.inlineData?.data;

    if (!pcmBase64) {
      throw new Error('No audio returned from Gemini TTS API');
    }

    // Convert raw PCM to standard WAV
    const pcmBytes = Buffer.from(pcmBase64, 'base64');
    const wavBuffer = pcmToWavBuffer(pcmBytes, 24000, 1);
    const wavBase64 = wavBuffer.toString('base64');

    // Cache result
    audioCache.set(cacheKey, wavBase64);

    return res.json({
      success: true,
      audioBase64: wavBase64,
      mimeType: 'audio/wav',
      sampleRate: 24000,
      cached: false,
    });
  } catch (error: any) {
    const errorMsg = String(error?.message || error || '');
    const isQuotaError =
      error?.status === 429 ||
      error?.status === 'RESOURCE_EXHAUSTED' ||
      errorMsg.includes('429') ||
      errorMsg.includes('quota') ||
      errorMsg.includes('RESOURCE_EXHAUSTED') ||
      errorMsg.includes('exceeded your current quota');

    if (isQuotaError) {
      // Set cooldown for 60 seconds to avoid repeating failed 429 calls
      ttsQuotaExceededUntil = Date.now() + 60000;
      console.warn('Gemini TTS quota exceeded. Switching seamlessly to browser voice engine.');
      return res.status(200).json({
        success: false,
        fallback: true,
        isQuotaExhausted: true,
        remainingCooldownSeconds: 60,
        message: 'Gemini TTS quota exceeded. Using browser voice engine.',
      });
    }

    console.warn('Gemini TTS synthesis error, using fallback:', errorMsg);
    return res.status(200).json({
      success: false,
      fallback: true,
      error: errorMsg,
      message: 'Falling back to atmospheric client speech engine.',
    });
  }
});

// PDF & EPUB Book Upload and Parsing Endpoint
app.post('/api/books/parse', async (req, res) => {
  const { fileBase64, fileName, fileType } = req.body;

  if (!fileBase64 || !fileName) {
    return res.status(400).json({ error: 'fileBase64 and fileName are required.' });
  }

  const isPdf = fileType === 'pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isEpub = fileType === 'epub' || fileName.toLowerCase().endsWith('.epub');

  if (!isPdf && !isEpub) {
    return res.status(400).json({ error: 'Unsupported file type. Please provide a .pdf or .epub file.' });
  }

  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const ai = getGenAI();

    if (isEpub) {
      const parsedStory = await parseEpubBuffer(buffer, fileName);
      return res.json({
        success: true,
        story: parsedStory,
        source: 'epub',
        message: `Successfully parsed EPUB into ${parsedStory.chapters.length} chapters.`,
      });
    }

    if (isPdf) {
      // If Gemini client is active, attempt direct high-fidelity multimodal document extraction
      if (ai) {
        try {
          const structuredStory = await structureBookWithGemini(ai, { isPdf: true, base64: fileBase64 }, fileName);
          return res.json({
            success: true,
            story: structuredStory,
            source: 'gemini-pdf',
            message: `Structured with Gemini into ${structuredStory.chapters.length} chapters.`,
          });
        } catch (geminiPdfErr) {
          console.warn('Gemini direct PDF extraction failed, attempting fallback text parsing:', geminiPdfErr);
        }
      }

      // Fallback: extract text and optionally structure
      let rawText = '';
      try {
        rawText = await extractPdfText(buffer);
      } catch (pdfTextErr) {
        console.warn('PDF text extraction error:', pdfTextErr);
      }

      if (rawText && ai) {
        try {
          const structuredStory = await structureBookWithGemini(ai, { text: rawText }, fileName);
          return res.json({
            success: true,
            story: structuredStory,
            source: 'gemini-text',
            message: `Extracted and structured with Gemini into ${structuredStory.chapters.length} chapters.`,
          });
        } catch (geminiTextErr) {
          console.warn('Gemini text structuring failed, proceeding with procedural formatting:', geminiTextErr);
        }
      }

      // Procedural fallback
      const cleanTitle = fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
      const proceduralChapters = splitTextIntoProceduralChapters(rawText || 'Audiobook text imported from PDF.', fileName);

      return res.json({
        success: true,
        story: {
          title: cleanTitle.toUpperCase(),
          subtitle: 'Imported PDF Document',
          authorNote: 'Audiobook ready for real-time Gemini Pro TTS narration.',
          chapters: proceduralChapters,
        },
        source: 'procedural-pdf',
        message: `Parsed PDF into ${proceduralChapters.length} audio sections.`,
      });
    }
  } catch (error: any) {
    console.error('Book parsing server error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to process the uploaded book file.',
    });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pinocchio Audiobook server running on port ${PORT}`);
  });
}

startServer();
