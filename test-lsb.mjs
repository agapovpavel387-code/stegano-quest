// Correctness test for the LSB steganography core (runs in Node, no DOM needed).
import mod from './app.js';
const { lsbEmbed, lsbExtract } = mod;

let failed = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failed++;
}

// build a small RGBA buffer (pure noise)
function noise(w, h, seed) {
  const d = new Uint8ClampedArray(w * h * 4);
  let s = seed || 7;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s & 0xff; }
  return d;
}

const w = 64, h = 64;
const src = noise(w, h, 42);

// 1. round-trip: plain text
let out = lsbEmbed(src, w, h, 'hello secret world');
let back = lsbExtract(out);
check('round-trip ascii', back === 'hello secret world');

// 2. cyrillic / unicode
out = lsbEmbed(src, w, h, 'привет, секретный мир! 🗝️');
back = lsbExtract(out);
check('round-trip unicode', back === 'привет, секретный мир! 🗝️');

// 3. long-ish message fit check (128x128: capacity = 128*128*3/8 = 6144 bytes)
const long = 'x'.repeat(2000);
out = lsbEmbed(noise(128, 128, 7), 128, 128, long);
back = lsbExtract(out);
check('round-trip 2000 bytes (128x128)', back === long);

// 4. overflow rejected
const tooLong = 'y'.repeat(3000);
let overflowRejected = false;
try { lsbEmbed(src, w, h, tooLong); } catch (e) { overflowRejected = true; }
check('overflow throws', overflowRejected);

// 5. empty / no-message image returns null (pixel losslessness not required; random data may rarely decode)
// ensure extraction never crashes on garbage already covered by (4) path — just call it:
const garbage = noise(w, h, 1234);
const g = lsbExtract(garbage);
check('garbage extraction returns null or short garbage gracefully', g === null || g.length < 8);

// 6. alpha channel untouched
out = lsbEmbed(src, w, h, 'alpha check');
const alphasSame = (() => {
  for (let px = 0; px < w * h; px++) {
    const i = px * 4 + 3;
    if (out[i] !== src[i]) return false;
  }
  return true;
})();
check('alpha channel preserved', alphasSame);

console.log(failed === 0 ? '\nALL TESTS PASSED' : '\n' + failed + ' TEST(S) FAILED');
process.exit(failed === 0 ? 0 : 1);