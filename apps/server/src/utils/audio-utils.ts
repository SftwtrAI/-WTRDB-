/**
 * Audio utilities for converting between formats and resampling
 */

/**
 * Convert µ-law (mulaw) audio to 16-bit PCM
 * @param mulawData - µ-law encoded audio data
 * @returns 16-bit PCM audio data
 */
export function mulawToPCM16(mulawData: Buffer): Buffer {
  const pcmData = Buffer.alloc(mulawData.length * 2);

  for (let i = 0; i < mulawData.length; i++) {
    const mulawByte = mulawData[i];
    const pcmValue = mulawDecode(mulawByte);

    // Write 16-bit little-endian PCM value
    pcmData.writeInt16LE(pcmValue, i * 2);
  }

  return pcmData;
}

/**
 * Decode a single µ-law byte to 16-bit PCM
 */
function mulawDecode(mulawByte: number): number {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 0x7fff;

  // Flip all the bits
  mulawByte = ~mulawByte;

  // Extract sign, exponent, and mantissa
  const sign = mulawByte & 0x80;
  const exponent = (mulawByte >> 4) & 0x07;
  const mantissa = mulawByte & 0x0f;

  // Compute the sample value
  let sample = mantissa << (exponent + 3);
  sample += MULAW_BIAS << exponent;

  // Adjust for sign
  if (sign === 0) {
    sample = -sample;
  }

  // Clamp to 16-bit range
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  if (sample < -MULAW_MAX) sample = -MULAW_MAX;

  return sample;
}

/**
 * Simple upsampling from 8kHz to 16kHz using linear interpolation
 * @param pcmData - 16-bit PCM audio at 8kHz
 * @returns 16-bit PCM audio at 16kHz
 */
export function resample8to16kHz(pcmData: Buffer): Buffer {
  const samplesIn = pcmData.length / 2; // 16-bit samples
  const samplesOut = samplesIn * 2; // Double the samples for 2x sample rate
  const resampledData = Buffer.alloc(samplesOut * 2);

  for (let i = 0; i < samplesIn - 1; i++) {
    const sample1 = pcmData.readInt16LE(i * 2);
    const sample2 = pcmData.readInt16LE((i + 1) * 2);

    // Write original sample
    resampledData.writeInt16LE(sample1, i * 4);

    // Write interpolated sample (average of current and next)
    const interpolated = Math.round((sample1 + sample2) / 2);
    resampledData.writeInt16LE(interpolated, i * 4 + 2);
  }

  // Handle last sample (duplicate it)
  const lastSample = pcmData.readInt16LE((samplesIn - 1) * 2);
  resampledData.writeInt16LE(lastSample, (samplesIn - 1) * 4);
  resampledData.writeInt16LE(lastSample, (samplesIn - 1) * 4 + 2);

  return resampledData;
}

/**
 * Detect if an audio chunk is silent (below threshold)
 * @param pcmData - 16-bit PCM audio data
 * @param threshold - RMS threshold for silence detection (default 200)
 * @returns true if the audio is considered silent
 */
export function isSilent(pcmData: Buffer, threshold: number = 200): boolean {
  const samples = pcmData.length / 2;
  let sumSquares = 0;

  for (let i = 0; i < samples; i++) {
    const sample = pcmData.readInt16LE(i * 2);
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / samples);
  return rms < threshold;
}

/**
 * Convert base64-encoded µ-law audio to 16kHz PCM for STT
 * @param base64Audio - Base64-encoded µ-law audio from Twilio
 * @returns 16-bit PCM audio at 16kHz
 */
export function convertTwilioAudioForSTT(base64Audio: string): Buffer {
  // Decode base64 to µ-law buffer
  const mulawData = Buffer.from(base64Audio, "base64");

  // Convert µ-law to 16-bit PCM
  const pcm8kHz = mulawToPCM16(mulawData);

  // Resample from 8kHz to 16kHz
  const pcm16kHz = resample8to16kHz(pcm8kHz);

  return pcm16kHz;
}
