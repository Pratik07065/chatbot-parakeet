// Test downsampleTo16k logic
function downsampleTo16k(buffer, inputSampleRate, targetSampleRate = 16000) {
  if (!buffer || buffer.length === 0) return new Float32Array(0);
  if (inputSampleRate === targetSampleRate) return buffer;

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

console.log('--> 1. Testing 48000 Hz -> 16000 Hz downsampling...');
// 1 second of 48000 Hz audio = 48000 samples
const buf48k = new Float32Array(48000);
for (let i = 0; i < buf48k.length; i++) {
  // 440 Hz tone
  buf48k[i] = Math.sin(2 * Math.PI * 440 * (i / 48000));
}

const out16kFrom48 = downsampleTo16k(buf48k, 48000, 16000);
console.log(`    Input samples: ${buf48k.length} (at 48kHz = 1.0s)`);
console.log(`    Output samples: ${out16kFrom48.length} (at 16kHz = ${out16kFrom48.length / 16000}s)`);
if (out16kFrom48.length !== 16000) {
  throw new Error(`Expected 16000 samples, got ${out16kFrom48.length}`);
}

console.log('--> 2. Testing 44100 Hz -> 16000 Hz downsampling...');
const buf44k = new Float32Array(44100);
for (let i = 0; i < buf44k.length; i++) {
  buf44k[i] = Math.sin(2 * Math.PI * 440 * (i / 44100));
}

const out16kFrom44 = downsampleTo16k(buf44k, 44100, 16000);
console.log(`    Input samples: ${buf44k.length} (at 44.1kHz = 1.0s)`);
console.log(`    Output samples: ${out16kFrom44.length} (at 16kHz = ${out16kFrom44.length / 16000}s)`);
if (Math.abs(out16kFrom44.length - 16000) > 1) {
  throw new Error(`Expected ~16000 samples, got ${out16kFrom44.length}`);
}

console.log('--> 3. Testing 4096-sample chunk downsampling (typical ScriptProcessor buffer)...');
const chunk4096 = new Float32Array(4096);
const chunkOut = downsampleTo16k(chunk4096, 48000, 16000);
console.log(`    4096 samples at 48kHz (85.3ms) -> ${chunkOut.length} samples at 16kHz (${(chunkOut.length / 16000 * 1000).toFixed(1)}ms)`);

console.log('All downsampler unit tests passed successfully!');
