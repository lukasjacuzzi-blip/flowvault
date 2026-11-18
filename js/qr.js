/**
 * Kompakter QR-Code-Generator (Reed-Solomon & Byte-Mode) für WLAN & Links.
 * Rendert gestochen scharf auf HTML5-Canvas ohne externe Bibliotheken.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = Array.of(1);
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

const VERSIONS = Array.of(
  null,
  { size: 21, total: 26, ec: 7, dataCap: 17 },
  { size: 25, total: 44, ec: 10, dataCap: 32 },
  { size: 29, total: 70, ec: 15, dataCap: 53 },
  { size: 33, total: 100, ec: 20, dataCap: 78 },
  { size: 37, total: 134, ec: 26, dataCap: 106 },
  { size: 41, total: 172, ec: 36, dataCap: 134 }
);

const ALIGN_POS = Array.of(
  Array.of(),
  Array.of(),
  Array.of(6, 18),
  Array.of(6, 22),
  Array.of(6, 26),
  Array.of(6, 30),
  Array.of(6, 34)
);

function buildQrMatrix(text) {
  const bytes = new TextEncoder().encode(text || 'FlowVault');
  let ver = 1;
  while (ver < VERSIONS.length && bytes.length > VERSIONS[ver].dataCap) ver++;
  if (ver >= VERSIONS.length) ver = VERSIONS.length - 1;

  const info = VERSIONS[ver];
  const payload = bytes.slice(0, info.dataCap);
  const dataBytesCount = info.total - info.ec;

  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  payload.forEach((b) => pushBits(b, 8));
  pushBits(0, Math.min(4, dataBytesCount * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    codewords.push(byte);
  }
  const pads = Array.of(0xec, 0x11);
  let pIdx = 0;
  while (codewords.length < dataBytesCount) {
    codewords.push(pads[pIdx++ % 2]);
  }

  const ecBytes = rsEncode(Uint8Array.from(codewords), info.ec);
  const allBytes = [...codewords, ...ecBytes];

  const n = info.size;
  const grid = Array.from({ length: n }, () => new Int8Array(n).fill(-1));
  const reserved = Array.from({ length: n }, () => new Uint8Array(n));

  const setFixed = (r, c, val) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      grid[r][c] = val ? 1 : 0;
      reserved[r][c] = 1;
    }
  };

  const placeFinder = (row, col) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFixed(row + r, col + c, inside && (border || center));
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  const ap = ALIGN_POS[ver];
  if (ap.length >= 2) {
    const r0 = ap.at(1);
    const c0 = ap.at(1);
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const val = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
        setFixed(r0 + r, c0 + c, val);
      }
    }
  }

  for (let i = 8; i < n - 8; i++) {
    setFixed(6, i, i % 2 === 0);
    setFixed(i, 6, i % 2 === 0);
  }

  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = 1;
      reserved[i][8] = 1;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][n - 1 - i] = 1;
    reserved[n - 1 - i][8] = 1;
  }
  setFixed(n - 8, 8, 1);

  let bitIdx = 0;
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx;
        if (!reserved[r][c]) {
          const byte = allBytes[bitIdx >> 3] || 0;
          const bit = (byte >>> (7 - (bitIdx & 7))) & 1;
          const mask = (r + c) % 2 === 0 ? 1 : 0;
          grid[r][c] = bit ^ mask;
          bitIdx++;
        }
      }
    }
    up = !up;
  }

  const fmt = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >>> i) & 1;
    if (i < 6) grid[8][i] = bit;
    else if (i < 8) grid[8][i + 1] = bit;
    else grid[8][n - 15 + i] = bit;

    if (i < 8) grid[n - 1 - i][8] = bit;
    else if (i < 9) grid[15 - i][8] = bit;
    else grid[14 - i][8] = bit;
  }

  return grid;
}

export function drawQrToCanvas(canvas, text) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const matrix = buildQrMatrix(text);
  const count = matrix.length;
  const quiet = 2;
  const totalCells = count + quiet * 2;
  const pxSize = 220;
  canvas.width = pxSize;
  canvas.height = pxSize;

  const cell = pxSize / totalCells;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pxSize, pxSize);

  ctx.fillStyle = '#0d1117';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c] === 1) {
        ctx.fillRect(
          Math.floor((c + quiet) * cell),
          Math.floor((r + quiet) * cell),
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }
  }
}
