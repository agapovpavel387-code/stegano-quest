'use strict';
/* Steganogram — LSB steganography + Pollinations LLM cover generation.
   Everything marked pure is exported as globals so the LSB core is testable in Node. */

/* ---------------- LSB core (pure) ---------------- */

// Encode a UTF-8 message into the low bits of an RGBA buffer.
// Layout: 4-byte big-endian byte-length prefix, then message bytes, then zero terminator.
// Bit mapping: one bit per RGB channel (alpha is left untouched). Capacity ≈ w*h*3/8 bytes.
function lsbEmbed(rgba, width, height, text) {
  const bytes = new TextEncoder().encode(text);
  const payload = new Uint8Array(4 + bytes.length + 1);
  payload[0] = (bytes.length >>> 24) & 0xff;
  payload[1] = (bytes.length >>> 16) & 0xff;
  payload[2] = (bytes.length >>> 8) & 0xff;
  payload[3] = bytes.length & 0xff;
  payload.set(bytes, 4);

  const pixels = rgba.length / 4;
  const maxBytes = Math.floor((pixels * 3) / 8);
  if (payload.length > maxBytes) throw new Error('message too long for this image (' + payload.length + ' > ' + maxBytes + ' bytes)');

  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < payload.length; i++) {
    let b = payload[i];
    for (let bit = 0; bit < 8; bit++) {
      const pos = i * 8 + bit;            // bit index inside the RGB payload area
      const px = Math.floor(pos / 3);     // pixel index
      const ch = pos % 3;                 // 0=R, 1=G, 2=B
      const target = px * 4 + ch;
      out[target] = (out[target] & 0xfe) | ((b >> (7 - bit)) & 1);
    }
  }
  return out;
}

function lsbExtract(rgba) {
  const pixels = rgba.length / 4;
  const maxBytes = Math.floor((pixels * 3) / 8) - 5; // -5: prefix + terminator
  let len = 0;
  for (let bit = 0; bit < 32; bit++) {
    const px = Math.floor(bit / 3);
    const target = px * 4 + (bit % 3);
    len = (len << 1) | (rgba[target] & 1);
  }
  if (len <= 0 || len > maxBytes) return null;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let b = 0;
    for (let bit = 0; bit < 8; bit++) {
      const pos = 32 + i * 8 + bit;
      const px = Math.floor(pos / 3);
      const target = px * 4 + (pos % 3);
      b = (b << 1) | (rgba[target] & 1);
    }
    bytes[i] = b;
  }
  try { return new TextDecoder().decode(bytes); } catch { return null; }
}
if (typeof module !== 'undefined' && typeof document === 'undefined') { module.exports = { lsbEmbed, lsbExtract }; }
if (typeof document !== 'undefined') {

/* ---------------- DOM helpers ---------------- */

const $ = (id) => document.getElementById(id);
function log(m) { const el = $('log'); el.textContent = m + '\n' + el.textContent; }
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('cannot load image'));
    img.src = url;
  });
}
function toRgba(img, maxDim) {
  let w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, (maxDim || 2048) / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
  return { canvas: c, data: ctx.getImageData(0, 0, w, h) };
}
function downloadPng(canvas, name) {
  const a = document.createElement('a');
  a.download = name; a.href = canvas.toDataURL('image/png'); a.click();
}

/* ---------------- Pollinations API ---------------- */

function settings() {
  const mode = $('mode').value;
  const key = $('key').value.trim();
  const base = mode === 'own'
    ? { text: 'https://gen.pollinations.ai/v1/chat/completions', img: 'https://gen.pollinations.ai/image' }
    : { text: 'https://text.pollinations.ai/openai', img: 'https://image.pollinations.ai/prompt' };
  return { mode, key, base, textModel: $('textModel').value.trim() || 'openai/gpt-5.4-nano', imgModel: $('imgModel').value.trim() };
}

async function llmInnocentPrompt(secret, s) {
  const body = {
    model: s.textModel,
    messages: [
      { role: 'system', content: 'You turn a secret message into a completely ordinary, innocent image prompt. Return ONLY a short image prompt (5-20 words), nothing else, no quotes, no explanation.' },
      { role: 'user', content: 'Secret: "' + secret + '"' }
    ],
    max_tokens: 120
  };
  const headers = { 'Content-Type': 'application/json' };
  if (s.key) headers['Authorization'] = 'Bearer ' + s.key;
  const r = await fetch(s.base.text, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('LLM ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
}

async function generateCover(desc, s) {
  let url;
  if (s.mode === 'own') {
    url = s.base.img + '/' + encodeURIComponent(desc) + '?model=' + encodeURIComponent(s.imgModel) + '&width=1024&height=1024&seed=' + Math.floor(Math.random() * 1e9);
  } else {
    url = s.base.img + '/' + encodeURIComponent(desc) + '?width=1024&height=1024&seed=' + Math.floor(Math.random() * 1e9);
  }
  const headers = {};
  if (s.key) headers['Authorization'] = 'Bearer ' + s.key;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error('image API ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const blob = await r.blob();
  const buf = await blob.arrayBuffer();
  // decoded via <img> so canvas is a plain snapshot
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('bad image from API')); img.src = URL.createObjectURL(new Blob([buf], { type: blob.type || 'image/jpeg' })); });
  return img;
}

/* ---------------- UI wiring ---------------- */

let hideCanvas = null;

$('tab-hide').onclick = () => switchTab('hide');
$('tab-reveal').onclick = () => switchTab('reveal');
$('tab-settings').onclick = () => switchTab('settings');
function switchTab(name) {
  ['hide', 'reveal', 'settings'].forEach((t) => {
    $('panel-' + t).style.display = t === name ? '' : 'none';
    $('tab-' + t).classList.toggle('active', t === name);
  });
}
$('mode').onchange = () => { $('key').disabled = $('mode').value === 'classic'; };
$('key').value = localStorage.getItem('sg.key') || '';
$('key').oninput = () => { try { localStorage.setItem('sg.key', $('key').value); } catch {} };
$('mode').value = localStorage.getItem('sg.mode') || 'classic';
$('mode').onchange(); // eslint-disable-line

async function currentCoverImage() {
  const f = $('coverFile').files[0];
  if (f) return loadImage(f);
  // auto-generate with AI using the stored description
  const s = settings();
  log('AI: turning the cover description into an image (billed to your wallet in Own Pollen mode)…');
  const img = await generateCover($('coverDesc').value.trim() || 'a quiet bookshop on a rainy street, watercolor', s);
  log('AI: cover image ready.');
  return img;
}

$('genCover').onclick = async () => {
  try {
    const s = settings();
    log('LLM: crafting an innocent cover prompt from your description…');
    // fall back to the described scene when no secret is usable
    const prompt = await llmInnocentPrompt($('msg').value.trim() || 'nothing unusual here', s);
    log('LLM prompt: ' + prompt);
    $('coverDesc').value = prompt;
    const img = await generateCover(prompt, s);
    const snap = toRgba(img, 1024);
    hideCanvas = snap.canvas;
    $('hidePreview').src = snap.canvas.toDataURL('image/png');
    $('hidePreview').style.display = '';
    log('Cover generated. Now press "Hide message in image" (requires a message).');
  } catch (e) { log('ERROR: ' + e.message); }
};

$('doHide').onclick = async () => {
  try {
    const msg = $('msg').value;
    if (!msg.trim()) { log('ERROR: write a secret message first.'); return; }
    let img;
    if (hideCanvas) { img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = hideCanvas.toDataURL('image/png'); }); }
    else img = await currentCoverImage();
    const env = toRgba(img, 2048);
    const embedded = lsbEmbed(env.data.data, env.data.width, env.data.height, msg);
    const ctx = env.canvas.getContext('2d');
    ctx.putImageData(new ImageData(embedded, env.data.width, env.data.height), 0, 0);
    hideCanvas = env.canvas;
    $('hidePreview').src = env.canvas.toDataURL('image/png');
    $('hidePreview').style.display = '';
    $('dlPng').disabled = false;
    log('Message hidden (' + new TextEncoder().encode(msg).length + ' bytes).');
  } catch (e) { log('ERROR: ' + e.message); }
};

$('dlPng').onclick = () => { if (hideCanvas) downloadPng(hideCanvas, 'steganogram-' + Date.now() + '.png'); };

$('doReveal').onclick = async () => {
  try {
    const f = $('revealFile').files[0];
    if (!f) { log('ERROR: choose an image first.'); return; }
    const img = await loadImage(f);
    const env = toRgba(img, 4096);
    $('revealPreview').src = env.canvas.toDataURL('image/png');
    $('revealPreview').style.display = '';
    const text = lsbExtract(env.data.data);
    $('out').value = text !== null ? text : '(no hidden message found)';
    log(text !== null ? 'Message found: ' + text.length + ' chars.' : 'No embedded message detected in this image.');
  } catch (e) { log('ERROR: ' + e.message); }
};
}