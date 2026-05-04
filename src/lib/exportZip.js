import JSZip from 'jszip';

// Slugify a product name into a filesystem-safe folder name.
// "Tommy Hilfiger Crossbody Pequeño Negro" → "tommy-hilfiger-crossbody-pequeno-negro"
function slugify(s) {
  return String(s || 'producto')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'producto';
}

function shortId(id) {
  return String(id || '').replace(/-/g, '').slice(0, 6);
}

function folderNameFor(product) {
  return `${slugify(product.name)}-${shortId(product.id)}`;
}

// Detect the file extension from a URL or default to jpg.
function extFromUrl(url) {
  const m = String(url).match(/\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i);
  return (m ? m[1].toLowerCase() : 'jpg').replace('jpeg', 'jpg');
}

async function fetchBlob(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.blob();
}

// Run async tasks with a concurrency limit. Returns array of results in order.
async function runWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Build a list of {product, url, kind, ext} entries describing every photo to download.
 */
function buildEntries(products) {
  const entries = [];
  for (const p of products) {
    const originals = [
      p.photo_url,
      ...(Array.isArray(p.extra_photo_urls) ? p.extra_photo_urls : []),
    ].filter(Boolean);
    const promos = Array.isArray(p.promo_urls) ? p.promo_urls.filter(Boolean) : [];

    originals.forEach((url, idx) => {
      entries.push({ product: p, url, kind: 'originales', index: idx + 1, ext: extFromUrl(url) });
    });
    promos.forEach((url, idx) => {
      entries.push({ product: p, url, kind: 'promos', index: idx + 1, ext: extFromUrl(url) });
    });
  }
  return entries;
}

/**
 * Download images for the given products and stream them into a ZIP, then trigger download.
 *
 * @param {Array} products - product rows
 * @param {Object} opts
 * @param {(progress: { done: number, total: number, currentProduct?: string, errors: number }) => void} opts.onProgress
 * @param {string} opts.zipName - name of the resulting zip file (without extension)
 * @returns {Promise<{ totalFiles: number, errors: Array<{url: string, error: string}> }>}
 */
export async function exportProductsAsZip(products, { onProgress, zipName = 'inventario' } = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('No hay productos para exportar');
  }

  const zip = new JSZip();
  const entries = buildEntries(products);
  if (entries.length === 0) {
    throw new Error('Los productos seleccionados no tienen ninguna foto');
  }

  const errors = [];
  let done = 0;

  await runWithLimit(entries, 5, async (entry) => {
    try {
      const blob = await fetchBlob(entry.url);
      const folder = folderNameFor(entry.product);
      const path = `${folder}/${entry.kind}/${String(entry.index).padStart(2, '0')}.${entry.ext}`;
      zip.file(path, blob);
    } catch (e) {
      errors.push({ url: entry.url, error: e.message });
    } finally {
      done++;
      if (onProgress) {
        onProgress({
          done,
          total: entries.length,
          currentProduct: entry.product?.name,
          errors: errors.length,
        });
      }
    }
  });

  if (onProgress) onProgress({ done: entries.length, total: entries.length, errors: errors.length, phase: 'compressing' });

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

  // Trigger browser download
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `${zipName}_${today}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a short delay so the download has time to start
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return { totalFiles: entries.length - errors.length, errors };
}

/**
 * Export a single product (used for per-card download button).
 */
export async function exportSingleProductAsZip(product, opts = {}) {
  return exportProductsAsZip([product], {
    ...opts,
    zipName: folderNameFor(product),
  });
}
