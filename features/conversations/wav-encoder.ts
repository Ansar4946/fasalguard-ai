export const WAV_SAMPLE_RATE = 16000;

/** Encodes mono float samples (-1..1) at 16 kHz as 16-bit PCM WAV, the format the server validates. */
export function floatToWav(samples: Float32Array): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) out[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, WAV_SAMPLE_RATE, true);
  view.setUint32(28, WAV_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return out;
}

/**
 * Converts any browser-decodable recording (WebM/Opus, MP4/AAC, ...) to 16 kHz mono WAV.
 * Decoding and resampling use the Web Audio API; throws if the browser cannot decode the audio.
 */
export async function recordingToWav(recording: Blob): Promise<Blob> {
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("This browser cannot prepare audio for transcription.");
  const context = new Context();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * WAV_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, WAV_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination); // multi-channel input is down-mixed to mono
    source.start();
    const rendered = await offline.startRendering();
    const wav = floatToWav(rendered.getChannelData(0));
    return new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
  } finally {
    void context.close();
  }
}
