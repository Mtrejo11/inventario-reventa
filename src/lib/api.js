import { supabase, BUCKET, supabaseReady } from '../supabase.js';
import { dataUrlToBlob } from './utils.js';

// -------- Productos --------

export async function listProducts() {
  if (!supabaseReady()) return [];
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createProduct(p) {
  const { data, error } = await supabase.from('products').insert(p).select().single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, patch) {
  const { data, error } = await supabase.from('products').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id, photoPath) {
  if (photoPath) {
    // intento best-effort de borrar la foto
    await supabase.storage.from(BUCKET).remove([photoPath]).catch(() => {});
  }
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// -------- Fotos --------

export async function uploadPhoto(dataUrl, folder = '') {
  const blob = dataUrlToBlob(dataUrl);
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const name = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = folder ? `${folder.replace(/\/$/, '')}/${name}` : name;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function removeStoragePath(path) {
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch {}
}

// Sube una foto promocional ya procesada (Blob JPEG) al bucket bajo carpeta promos/.
export async function uploadPromoPhoto(blob, productId, presetKey = 'std') {
  const name = `promos/${productId}_${presetKey}_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
  return { url: data.publicUrl, path: name };
}

export async function appendPromoUrls(productId, newUrls) {
  // Leer actuales, agregar, guardar
  const { data: current, error: e1 } = await supabase
    .from('products')
    .select('promo_urls')
    .eq('id', productId)
    .single();
  if (e1) throw e1;
  const existing = Array.isArray(current?.promo_urls) ? current.promo_urls : [];
  const merged = [...existing, ...newUrls];
  const { data, error } = await supabase
    .from('products')
    .update({ promo_urls: merged })
    .eq('id', productId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removePromoUrl(productId, url) {
  const { data: current } = await supabase
    .from('products')
    .select('promo_urls')
    .eq('id', productId)
    .single();
  const existing = Array.isArray(current?.promo_urls) ? current.promo_urls : [];
  const filtered = existing.filter(u => u !== url);
  const { data } = await supabase
    .from('products')
    .update({ promo_urls: filtered })
    .eq('id', productId)
    .select()
    .single();
  // Best-effort: eliminar del storage
  try {
    const parts = url.split('/product-photos/');
    if (parts[1]) {
      await supabase.storage.from(BUCKET).remove([parts[1]]);
    }
  } catch {}
  return data;
}

// -------- Claude Vision --------

export async function analyzeImage(dataUrl) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: dataUrl })
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  return res.json();
}
