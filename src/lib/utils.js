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

// Convierte un File a dataURL redimensionado (JPEG) para reducir tamaño.
export async function fileToDataUrl(input, maxSize = 1280, quality = 0.85) {
  const file = await normalizeHeic(input);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            const r = Math.min(maxSize / width, maxSize / height);
            width *= r; height *= r;
          }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
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
