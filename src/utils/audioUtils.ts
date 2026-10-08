/**
 * Audio processing and WAV file generator utilities.
 */

export function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Converts raw 16-bit PCM little-endian audio buffer to a standard RIFF/WAVE container.
 */
export function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, numChannels = 1): ArrayBuffer {
  const dataLen = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length: 36 + SubChunk2Size
  view.setUint32(4, 36 + dataLen, true);
  // RIFF type
  writeString(view, 8, 'WAVE');

  // Format chunk identifier
  writeString(view, 12, 'fmt ');
  // Format chunk length (16 for PCM)
  view.setUint32(16, 16, true);
  // Sample format (1 is Linear PCM)
  view.setUint16(20, 1, true);
  // Channel count
  view.setUint16(22, numChannels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // Block align (NumChannels * BitsPerSample/8)
  view.setUint16(32, numChannels * 2, true);
  // Bits per sample
  view.setUint16(34, 16, true);

  // Data chunk identifier
  writeString(view, 36, 'data');
  // Data chunk length
  view.setUint32(40, dataLen, true);

  // Copy PCM payload
  new Uint8Array(buffer, 44).set(pcmData);

  return buffer;
}

/**
 * Converts an AudioBuffer into a 16-bit PCM WAV Blob for studio export.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteLength = length * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(arrayBuffer);

  // RIFF
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(view, 8, 'WAVE');

  // fmt 
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  // data
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  // Interleave channels & convert float32 to int16
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      // Soft limiter / clamp
      sample = Math.max(-1, Math.min(1, sample));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Converts an AudioBuffer into an MP3 Blob (128kbps CBR) for compact, shareable exports.
 */
export async function audioBufferToMp3Blob(buffer: AudioBuffer): Promise<Blob> {
  const lamejs = await import('@breezystack/lamejs');
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const kbps = 128;

  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);

  const floatToInt16 = (channel: Float32Array): Int16Array => {
    const out = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return out;
  };

  const left = floatToInt16(buffer.getChannelData(0));
  const right = numChannels > 1 ? floatToInt16(buffer.getChannelData(1)) : undefined;

  const chunks: Uint8Array[] = [];
  const blockSize = 1152;

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const mp3buf = right
      ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize))
      : encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf));
  }

  const finalBuf = encoder.flush();
  if (finalBuf.length > 0) chunks.push(new Uint8Array(finalBuf));

  return new Blob(chunks, { type: 'audio/mpeg' });
}

/**
 * Resamples an AudioBuffer to a target sample rate (no-op if already matching).
 */
export async function resampleAudioBuffer(buffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate) return buffer;
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.ceil(buffer.duration * targetSampleRate),
    targetSampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  return offlineCtx.startRendering();
}

function computeRms(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) sumSquares += data[i] * data[i];
  return Math.sqrt(sumSquares / data.length);
}

/**
 * Levels a set of independently-synthesized narration buffers (e.g. one TTS
 * call per chapter) to a common loudness in-place, so chapter boundaries
 * don't have an audible volume jump caused by per-request normalization
 * differences in the TTS engine. Mutates and returns the same buffers.
 */
export function normalizeBuffersToMatchLoudness(buffers: AudioBuffer[]): AudioBuffer[] {
  const rmsValues = buffers.map(computeRms);
  const audibleRms = rmsValues.filter((v) => v > 0.0001);
  if (audibleRms.length === 0) return buffers;

  const sorted = [...audibleRms].sort((a, b) => a - b);
  const targetRms = sorted[Math.floor(sorted.length / 2)];

  buffers.forEach((buffer, idx) => {
    const rms = rmsValues[idx];
    if (rms <= 0.0001) return;

    const gain = Math.max(0.5, Math.min(2.0, targetRms / rms));
    if (Math.abs(gain - 1) < 0.02) return;

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const scaled = Math.abs(data[i] * gain);
        if (scaled > peak) peak = scaled;
      }
      const safeGain = peak > 0.98 ? gain * (0.98 / peak) : gain;
      for (let i = 0; i < data.length; i++) data[i] *= safeGain;
    }
  });

  return buffers;
}

/**
 * Concatenates several narration buffers (e.g. one per chapter) into a single
 * continuous AudioBuffer with a short gap between each, resampling to a
 * common sample rate first. Returns the combined buffer plus each input
 * buffer's start offset (in seconds) within it, so callers can align other
 * timed events (like per-chapter ambient soundscapes) to the same timeline.
 */
export async function concatAudioBuffersWithOffsets(
  buffers: AudioBuffer[],
  gapSeconds = 1.4,
  targetSampleRate = 44100
): Promise<{ buffer: AudioBuffer; offsets: number[] }> {
  const resampled = await Promise.all(buffers.map((b) => resampleAudioBuffer(b, targetSampleRate)));
  const numChannels = Math.max(1, ...resampled.map((b) => b.numberOfChannels));
  const gapFrames = Math.round(gapSeconds * targetSampleRate);

  let totalFrames = 0;
  const offsets: number[] = [];
  resampled.forEach((b, i) => {
    offsets.push(totalFrames / targetSampleRate);
    totalFrames += b.length;
    if (i < resampled.length - 1) totalFrames += gapFrames;
  });

  const result = new AudioBuffer({ length: totalFrames, numberOfChannels: numChannels, sampleRate: targetSampleRate });
  let cursor = 0;
  resampled.forEach((b, i) => {
    for (let c = 0; c < numChannels; c++) {
      const channelData = c < b.numberOfChannels ? b.getChannelData(c) : b.getChannelData(0);
      result.getChannelData(c).set(channelData, cursor);
    }
    cursor += b.length;
    if (i < resampled.length - 1) cursor += gapFrames;
  });

  return { buffer: result, offsets };
}

/**
 * Base64 string to Uint8Array helper
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
