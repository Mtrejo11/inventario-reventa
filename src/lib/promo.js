// Composición de fotos promocionales: bg removal + fondos procedurales.
//
// Flujo:
//   1. removeBackground(imageUrl) -> Blob PNG con transparencia (corre 100% en navegador, WASM).
//   2. loadAsImage(blob) -> HTMLImageElement
//   3. composeWithPreset(productImg, presetKey, size) -> Blob JPEG cuadrado listo para usar.

import { getPreset } from './backgrounds.js';

let bgRemoverPromise = null;
async function getBgRemover() {
  if (!bgRemoverPromise) {
    bgRemoverPromise = import('@imgly/background-removal').then(mod => mod.removeBackground);
  }
  return bgRemoverPromise;
}

// Quita el fondo de una URL (http o dataURL). Devuelve un Blob con transparencia.
export async function removeProductBackground(imageUrl, onProgress) {
  const removeBackground = await getBgRemover();
  return removeBackground(imageUrl, {
    output: { format: 'image/png', quality: 0.9 },
    progress: (key, current, total) => {
      if (onProgress) onProgress({ key, current, total, pct: total ? Math.round((current / total) * 100) : 0 });
    },
  });
}

// Convierte un Blob/File en HTMLImageElement (cargado).
export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen compuesta')); };
    img.src = url;
  });
}

// Recorta los bordes transparentes del producto para que quede pegado al centro sin espacios.
function trimTransparent(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data: d, width: W, height: H } = data;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) {
    return { canvas, x: 0, y: 0, w: W, h: H };
  }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  const octx = out.getContext('2d');
  octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return { canvas: out, x: minX, y: minY, w: cw, h: ch };
}

/**
 * Compone el producto (img con transparencia) sobre un fondo preset.
 * @param {HTMLImageElement} productImg - imagen ya sin fondo
 * @param {string} presetKey - key en backgrounds.js
 * @param {number} size - tamaño cuadrado final (default 1200)
 * @returns {Promise<Blob>} JPEG listo para subir/descargar
 */
export async function composeWithPreset(productImg, presetKey, size = 1200) {
  const preset = getPreset(presetKey);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 1. Pinta el fondo
  preset.draw(ctx, size, size);

  // 2. Recorta transparencias sobrantes del producto y lo centra
  const trimmed = trimTransparent(productImg);
  const pw = trimmed.canvas.width;
  const ph = trimmed.canvas.height;

  // Escala para que el lado largo ocupe `productScale` del lienzo
  const scale = Math.min((size * preset.productScale) / pw, (size * preset.productScale) / ph);
  const drawW = pw * scale;
  const drawH = ph * scale;
  const drawX = (size - drawW) / 2;
  // Lo empujamos ligeramente hacia arriba para dejar espacio de sombra debajo
  const drawY = (size - drawH) / 2 - size * 0.02;

  // 3. Sombra debajo del producto — elipse suave
  const shadowY = drawY + drawH - drawH * 0.05;
  const shadowRX = drawW * 0.44;
  const shadowRY = drawH * 0.06;
  ctx.save();
  ctx.filter = 'blur(14px)';
  ctx.fillStyle = preset.shadowColor;
  ctx.beginPath();
  ctx.ellipse(drawX + drawW / 2, shadowY, shadowRX, shadowRY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. Drop shadow suave bajo el producto
  ctx.save();
  ctx.shadowColor = preset.shadowColor;
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  ctx.drawImage(trimmed.canvas, drawX, drawY, drawW, drawH);
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
  });
}

// Convierte blob a dataURL (útil para preview rápido).
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Helper: fetch URL remoto y convierte en Blob (para pasar a removeBackground aunque ya acepta URLs,
// esto es útil si necesitamos data URLs o para forzar CORS).
export async function urlToBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo descargar la imagen');
  return res.blob();
}
