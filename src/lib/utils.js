export function money(n) {
  if (isNaN(n) || n == null) n = 0;
  return '$' + Number(n).toLocaleString('es-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Intenta decodificar con <img> nativo (Safari soporta HEIC; Chrome/Firefox no).
function canDecodeNatively(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(true); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

// Detecta HEIC/HEIF (fotos de iPhone) y lo convierte a JPEG antes de procesar.
async function normalizeHeic(file) {
  const isHeic =
    /image\/heic|image\/heif/i.test(file.type) ||
    /\.(heic|heif)$/i.test(file.name);
  if (!isHeic) return file;

  // 1) Si el navegador puede decodificar nativamente (Safari), no convertimos.
  if (await canDecodeNatively(file)) return file;

  // 2) Intenta heic-to (más moderno, maneja HEIC de iPhone con HEVC).
  try {
    const mod = await import(/* @vite-ignore */ 'https://esm.sh/heic-to@1.1.14');
    const heicTo = mod.heicTo || mod.default?.heicTo || mod.default;
    const jpegBlob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.85 });
    return new File([jpegBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
  } catch (e1) {
    // 3) Fallback a heic2any por si el archivo es viejo y heic-to falla
    try {
      const mod = await import(/* @vite-ignore */ 'https://esm.sh/heic2any@0.0.4');
      const heic2any = mod.default || mod;
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
    } catch (e2) {
      throw new Error(
        'No se pudo convertir el HEIC en el navegador. ' +
        'Tip: en iPhone ve a Ajustes → Cámara → Formatos → "Más compatible" para tomar fotos en JPEG. ' +
        'Detalle: ' + (e1?.message || e1)
      );
    }
  }
}

// Lee el tag de orientación EXIF de un ArrayBuffer JPEG.
// Devuelve 1-8 (1 = normal). Solo lee el mínimo necesario.
function readExifOrientation(buffer) {
  const view = new DataView(buffer);
  // Verificar marcador JPEG SOI
  if (view.getUint16(0) !== 0xFFD8) return 1;
  let offset = 2;
  while (offset < view.byteLength - 2) {
    const marker = view.getUint16(offset);
    if (marker === 0xFFE1) {
      // APP1 (EXIF)
      const len = view.getUint16(offset + 2);
      const exifStart = offset + 4;
      // Verificar "Exif\0\0"
      if (view.getUint32(exifStart) !== 0x45786966 || view.getUint16(exifStart + 4) !== 0x0000) return 1;
      const tiffStart = exifStart + 6;
      const bigEndian = view.getUint16(tiffStart) === 0x4D4D;
      const get16 = (o) => bigEndian ? view.getUint16(o) : view.getUint16(o, true);
      const ifdOffset = tiffStart + (bigEndian ? view.getUint32(tiffStart + 4) : view.getUint32(tiffStart + 4, true));
      const entries = get16(ifdOffset);
      for (let i = 0; i < entries; i++) {
        const entryOff = ifdOffset + 2 + i * 12;
        if (get16(entryOff) === 0x0112) {
          // Orientation tag
          return get16(entryOff + 8);
        }
      }
      return 1;
    } else if ((marker & 0xFF00) !== 0xFF00) {
      return 1; // no es marcador válido
    } else {
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return 1;
}

// Aplica transformación de orientación EXIF al canvas.
// Modifica canvas.width/height y aplica transform al contexto ANTES de drawImage.
function applyExifOrientation(ctx, canvas, orientation, w, h) {
  // orientaciones: https://sirv.com/help/articles/rotate-photos-to-be-upright/
  switch (orientation) {
    case 2: // flip horizontal
      canvas.width = w; canvas.height = h;
      ctx.transform(-1, 0, 0, 1, w, 0);
      break;
    case 3: // rotate 180
      canvas.width = w; canvas.height = h;
      ctx.transform(-1, 0, 0, -1, w, h);
      break;
    case 4: // flip vertical
      canvas.width = w; canvas.height = h;
      ctx.transform(1, 0, 0, -1, 0, h);
      break;
    case 5: // transpose (rotate 90 CW + flip horizontal)
      canvas.width = h; canvas.height = w;
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6: // rotate 90 CW
      canvas.width = h; canvas.height = w;
      ctx.transform(0, 1, -1, 0, h, 0);
      break;
    case 7: // transverse (rotate 90 CCW + flip horizontal)
      canvas.width = h; canvas.height = w;
      ctx.transform(0, -1, -1, 0, h, w);
      break;
    case 8: // rotate 90 CCW
      canvas.width = h; canvas.height = w;
      ctx.transform(0, -1, 1, 0, 0, w);
      break;
    default: // 1 = normal, no transform
      canvas.width = w; canvas.height = h;
      break;
  }
}

// Convierte un File a dataURL redimensionado (JPEG) para reducir tamaño.
// Aplica corrección de orientación EXIF automáticamente.
export async function fileToDataUrl(input, maxSize = 1280, quality = 0.85) {
  const file = await normalizeHeic(input);

  // 1. Leer EXIF orientation del archivo original
  const arrBuf = await file.arrayBuffer();
  const orientation = readExifOrientation(arrBuf);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let { naturalWidth: w, naturalHeight: h } = img;

          // 2. Redimensionar si es necesario (basado en dimensiones originales)
          if (w > maxSize || h > maxSize) {
            const r = Math.min(maxSize / w, maxSize / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // 3. Aplicar transformación EXIF (ajusta canvas.width/height y ctx transform)
          applyExifOrientation(ctx, canvas, orientation, w, h);

          // 4. Dibujar la imagen (el transform del contexto la rota correctamente)
          ctx.drawImage(img, 0, 0, w, h);

          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(new Error('No se pudo procesar la imagen: ' + (e?.message || e)));
        }
      };
      img.onerror = () => reject(new Error('El navegador no pudo decodificar la imagen (¿formato no soportado?)'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

// Convierte cualquier URL pública de imagen a dataURL (base64).
// Útil para pasar fotos ya guardadas en Supabase al endpoint de análisis.
// Redimensiona a maxSize para mantener el payload pequeño.
export async function urlToDataUrl(url, maxSize = 1280, quality = 0.85) {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo descargar la imagen');
  const blob = await res.blob();
  const file = new File([blob], 'remote.jpg', { type: blob.type || 'image/jpeg' });
  return fileToDataUrl(file, maxSize, quality);
}

// Convierte un dataURL a Blob para subir a Storage.
export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.substring(5, meta.indexOf(';'));
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
