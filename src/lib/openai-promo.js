// Client helper for GPT Image 2 promo generation.
// Calls /api/generate-promo serverless function.

export const AI_STYLES = [
  { key: 'studio',    label: 'Estudio',    tag: 'E-commerce',  emoji: '📸' },
  { key: 'lifestyle', label: 'Lifestyle',  tag: 'Aspiracional', emoji: '✨' },
  { key: 'editorial', label: 'Editorial',  tag: 'Fashion',     emoji: '💎' },
];

/**
 * Generate AI promo photos for a product — all styles in ONE call.
 * The server handles analysis once + generates all styles.
 * @param {string} imageUrl - Public URL of the product photo.
 * @param {(progress: {phase: string, detail: string}) => void} onProgress
 * @returns {Promise<{images: Array, rotated: number}>}
 */
export async function generateAIPromo(imageUrl, onProgress) {
  if (onProgress) onProgress({ phase: 'analyzing', detail: 'Analizando producto...' });

  const res = await fetch('/api/generate-promo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageUrl }), // no style = all styles
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${res.status}`);
  }

  if (onProgress) onProgress({ phase: 'done', detail: 'Listo' });

  const data = await res.json();
  // Enrich with dataUrl for display
  const images = (data.images || []).map(img => ({
    ...img,
    dataUrl: img.b64 ? `data:image/png;base64,${img.b64}` : null,
  }));

  return { images, rotated: data.rotated || 0 };
}

/**
 * Convert a base64 string to a Blob for uploading to Supabase.
 */
export function b64ToBlob(b64, type = 'image/png') {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}
