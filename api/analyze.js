// Vercel Serverless Function (Node runtime)
// POST { image: dataUrl } -> objeto con campos detectados.
// Mantiene la ANTHROPIC_API_KEY en el servidor (no se expone al cliente).

export const config = { maxDuration: 30 };

const PROMPT = `Eres un experto en reventa de ropa y accesorios en plataformas como Poshmark, Mercari, eBay, Facebook Marketplace y OfferUp. Conoces los precios de mercado reales para ítems comprados en Ross, Marshalls, Burlington y TJ Maxx.

Analiza la foto EN DETALLE. Mira todo:
- El producto en sí (tipo, forma, material, herraje, costuras, detalles)
- Logos visibles en el producto
- La etiqueta colgante: marca, código de estilo, precio actual (sticker de Ross/Marshalls/etc), "Compare at" / MSRP
- Correas, cierres, bolsillos, hebillas, acabados
- Estado general (NWT, signos de uso, etc.)

Devuelve SOLO un JSON válido, sin markdown ni explicaciones, con esta estructura EXACTA:

{
  "name": "nombre descriptivo corto pero específico en español (ej: 'Crossbody camera bag Tommy Hilfiger negra con correa tricolor')",
  "brand": "marca exacta visible, o '' si no se ve",
  "model": "nombre/código del modelo si aparece en la etiqueta, o ''",
  "category": "cartera|ropa|zapatos|accesorios|otro",
  "color": "color(es) principal(es)",
  "material": "material estimado o ''",
  "condition": "Nuevo con etiqueta|Nuevo sin etiqueta|Excelente|Buena|Usado",
  "features": "3-5 características clave separadas por coma, útiles para vender",
  "store": "Ross|Marshalls|Burlington|TJ Maxx|Otro|null (SOLO si el sticker es visible)",
  "tag_price": número USD del sticker de la tienda o null,
  "original_retail": número USD del 'Compare at'/MSRP si aparece o null,
  "style_code": "código de estilo o ''",
  "suggested_sale_price": número USD — precio de venta sugerido razonable en el mercado secundario (Poshmark/Mercari/FB Marketplace),
  "price_reasoning": "1 frase corta explicando el precio sugerido (marca, condición, comparables)",
  "notes": "resumen de 1-2 frases útil para listing de venta"
}

Reglas para "suggested_sale_price":
- Tiene que reflejar lo que realmente pagan los compradores en reventa, NO un % fijo del MSRP.
- Considera el tier de marca:
  - Luxury/designer (Coach, MK, Kate Spade, Tory Burch, Marc Jacobs): 40-65% del MSRP si NWT
  - Premium mainstream (Tommy Hilfiger, Calvin Klein, Guess, Nine West, Steve Madden): 35-55% del MSRP si NWT
  - Mid/fast fashion (marcas de Ross sin reconocimiento): 20-40% del MSRP
  - Sin marca o desconocida: cerca del precio de tienda + pequeño margen
- Si hay tag_price pero no MSRP, suma 50-120% sobre tag_price según marca/categoría.
- Carteras y bolsas mantienen valor mejor que ropa; zapatos mantienen valor moderado.
- Condición "Nuevo con etiqueta" = máximo del rango; "Buena" o "Usado" = -30-50%.
- El precio debe ser número puro (ej. 35, 44.99), redondeado a .99, .95 o entero.

Reglas generales:
- Si no puedes leer algo con seguridad, pon '' o null. No inventes.
- Precios como números puros (21.99, no "$21.99").
- "name" debe incluir marca + tipo + color/detalle cuando sea posible.
- Sé específico: "crossbody", "tote", "clutch", "hobo" en vez de solo "cartera".`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' });
  }
  try {
    const { image } = req.body || {};
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Se requiere image (dataURL base64)' });
    }
    const mediaType = image.substring(5, image.indexOf(';'));
    const base64 = image.split(',')[1];

    const body = {
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT }
        ]
      }]
    };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
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
