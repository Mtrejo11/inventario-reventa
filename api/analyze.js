// Vercel Serverless Function (Node runtime)
// POST body:
//   { images: [dataUrl, dataUrl, ...] }   (nuevo, preferido)
//   { image: dataUrl }                     (legacy, se sigue soportando)
// Devuelve: objeto con campos detectados consolidando todas las fotos.

export const config = { maxDuration: 45 };

const PROMPT_MULTI = `Eres un experto en reventa en Poshmark, Mercari, eBay y FB Marketplace, de ítems comprados en Ross, Marshalls, Burlington, TJ Maxx.

Recibirás una o varias fotos del MISMO producto desde distintos ángulos/planos (ej. una foto del producto completo, otra de la etiqueta, otra del detalle de la marca). NO son productos distintos — consolida TODA la información visible en una sola ficha.

Mira con detalle:
- El producto completo (tipo, forma, material, herraje, costuras, cuello/mangas/escote si es ropa)
- Logos visibles en el producto
- La etiqueta colgante: marca impresa, código de estilo, precio actual (sticker de Ross/Marshalls/etc), "Compare at" / MSRP, talla si aparece
- Correas, cierres, bolsillos, hebillas
- Etiqueta interior si se ve (composición de material, país, talla)
- Estado general (NWT, signos de uso, etc.)

Devuelve SOLO un JSON válido, sin markdown ni explicaciones:

{
  "name": "nombre descriptivo corto pero específico en español",
  "brand": "marca exacta o ''",
  "model": "modelo/código o ''",
  "category": "cartera|ropa|zapatos|accesorios|otro",
  "color": "color(es) principal(es)",
  "material": "material estimado o ''",
  "size": "talla si aparece (S/M/L, 32, 8, etc.) o ''",
  "condition": "Nuevo con etiqueta|Nuevo sin etiqueta|Excelente|Buena|Usado",
  "features": "3-5 características separadas por coma",
  "store": "Ross|Marshalls|Burlington|TJ Maxx|Otro|null",
  "tag_price": número USD del sticker o null,
  "original_retail": número USD del Compare at/MSRP o null,
  "style_code": "código o ''",
  "suggested_sale_price": número USD — precio de venta realista en mercado secundario,
  "price_reasoning": "1 frase corta con razón del precio",
  "notes": "resumen de 1-2 frases para listing"
}

Reglas de suggested_sale_price:
- Luxury/designer (Coach, MK, Kate Spade, Tory Burch, Marc Jacobs): 40-65% del MSRP si NWT
- Premium (Tommy Hilfiger, Calvin Klein, Guess, Nine West, Steve Madden): 35-55% del MSRP
- Mid/fast fashion: 20-40% del MSRP
- Sin marca reconocida: precio tienda + pequeño margen
- Si no hay MSRP pero sí tag_price: +50-120% sobre tag_price según marca
- Carteras/bolsas mantienen valor mejor que ropa
- "Nuevo con etiqueta" = tope del rango; "Buena"/"Usado" = -30-50%
- Redondea a .99, .95 o entero

Si no puedes leer algo con seguridad, pon '' o null. NO inventes. Usa la evidencia de TODAS las fotos combinadas.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' });
  }
  try {
    const body = req.body || {};
    const images = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);
    if (images.length === 0) {
      return res.status(400).json({ error: 'Se requiere images (array de dataURL) o image (dataURL)' });
    }
    // Valida y arma el contenido
    const content = [];
    for (const image of images) {
      if (typeof image !== 'string' || !image.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Cada image debe ser dataURL base64' });
      }
      const mediaType = image.substring(5, image.indexOf(';'));
      const base64 = image.split(',')[1];
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 }
      });
    }
    content.push({ type: 'text', text: PROMPT_MULTI });

    const requestBody = {
      model: 'claude-sonnet-4-5',
      max_tokens: 1400,
      messages: [{ role: 'user', content }]
    };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: 'Claude API error', detail: text.slice(0, 500) });
    }
    const j = await r.json();
    const text = j?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'Respuesta sin JSON', raw: text.slice(0, 300) });
    const data = JSON.parse(match[0]);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Error inesperado' });
  }
}
