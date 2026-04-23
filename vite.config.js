import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Plugin que emula /api/generate-promo en dev (en prod lo sirve Vercel).
function devGeneratePromo(env) {
  return {
    name: 'dev-generate-promo',
    configureServer(server) {
      server.middlewares.use('/api/generate-promo', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        const key = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        if (!key) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify({ error: 'Falta OPENAI_API_KEY en .env' }));
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const { imageUrl, style, rotation: manualRotation } = parsed;
            if (!imageUrl) {
              res.statusCode = 400;
              res.setHeader('content-type', 'application/json');
              return res.end(JSON.stringify({ error: 'Se requiere imageUrl' }));
            }

            const PRESERVE = ' CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo, hardware, stitching, patterns, and textures. Every detail must be continuous and physically realistic. Never fold, roll, or partially hide the product.';
            const STYLES = {
              studio: {
                label: 'Estudio profesional',
                prompt: 'Professional e-commerce product photo. Clean white or light gray seamless backdrop. Soft, diffused studio lighting from above and both sides, creating gentle natural shadows. The product is the sole hero — centered, fully open/unfolded, displayed upright or laid flat to show its complete shape. Slightly closer crop with minimal empty space so details are visible. Style: Nordstrom, Net-a-Porter. No text, no watermarks, no props.' + PRESERVE,
              },
              lifestyle: {
                label: 'Lifestyle',
                prompt: 'Aspirational lifestyle product photo. Product displayed fully open/unfolded in a physically realistic scene: hanging on a wall hook near a sunlit window, resting upright on a marble surface or wooden console, laid flat on crisp white bedding, or on a leather armchair. Must obey real-world physics — no furniture stacked illogically. Minimal setting, 1-2 subtle props max. Warm tones. Product fills 60%+ of frame. Instagram-worthy. No text, no watermarks.' + PRESERVE,
              },
              editorial: {
                label: 'Editorial / Fashion',
                prompt: 'High-fashion editorial product photo. Product fully open/unfolded against a bold single-color backdrop (deep plum, emerald, navy, terracotta) or textured surface (concrete, dark slate). Dramatic directional lighting with cinematic shadows. Confident close-up: product fills 65-75% of frame, emphasizing texture and craftsmanship. Vogue/Harper\'s Bazaar style. No props, no text, no watermarks.' + PRESERVE,
              },
            };

            const selectedStyles = style && STYLES[style]
              ? { [style]: STYLES[style] }
              : STYLES;

            // Download the source image
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) throw new Error('No se pudo descargar la imagen');
            let imgBuffer = Buffer.from(await imgRes.arrayBuffer());

            // Auto-orientation with Claude Vision + sharp
            let strapInfo = '';
            let productInfo = '';
            try {
              const sharp = (await import('sharp')).default;
              // Fix EXIF rotation first
              imgBuffer = await sharp(imgBuffer).rotate().jpeg({ quality: 92 }).toBuffer();

              const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
              if (anthropicKey) {
                const smallBuf = await sharp(imgBuffer).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
                const b64img = smallBuf.toString('base64');
                console.log('[generate-promo] Asking Claude for product analysis...');
                const orientRes = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'content-type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 300,
                    messages: [{
                      role: 'user',
                      content: [
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64img } },
                        { type: 'text', text: `Analyze this product photo. Reply in this EXACT format:
ROTATION: [0, 90, 180, or 270 — degrees CW needed so the product is naturally upright]
STRAP: [detailed description of strap/handle/chain if any, or "none"]
PRODUCT: [1-sentence product description]` },
                      ],
                    }],
                  }),
                });
                if (orientRes.ok) {
                  const oj = await orientRes.json();
                  const rawText = oj?.content?.[0]?.text || '';
                  console.log('[generate-promo] Claude analysis:', rawText);
                  const rotMatch = rawText.match(/ROTATION:\s*(\d+)/);
                  const aiDeg = rotMatch ? parseInt(rotMatch[1], 10) : 0;
                  // Manual rotation takes priority over AI detection
                  const effectiveDeg = (manualRotation && [90, 180, 270].includes(manualRotation))
                    ? manualRotation : aiDeg;
                  if ([90, 180, 270].includes(effectiveDeg)) {
                    console.log(`[generate-promo] Rotating ${effectiveDeg}° (${manualRotation ? 'manual' : 'auto'})`);
                    imgBuffer = await sharp(imgBuffer).rotate(effectiveDeg).jpeg({ quality: 92 }).toBuffer();
                  }
                  const strapMatch = rawText.match(/STRAP:\s*(.+?)(?=\nPRODUCT:|$)/s);
                  if (strapMatch && strapMatch[1].trim().toLowerCase() !== 'none') {
                    strapInfo = strapMatch[1].trim();
                  }
                  const prodMatch = rawText.match(/PRODUCT:\s*(.+?)$/s);
                  if (prodMatch) productInfo = prodMatch[1].trim();
                }
              }
            } catch (e) {
              console.warn('[generate-promo] Orientation fix error:', e.message);
              // Still apply manual rotation even if analysis failed
              if (manualRotation && [90, 180, 270].includes(manualRotation)) {
                try {
                  const sharp = (await import('sharp')).default;
                  console.log(`[generate-promo] Applying manual rotation ${manualRotation}° (fallback)`);
                  imgBuffer = await sharp(imgBuffer).rotate(manualRotation).jpeg({ quality: 92 }).toBuffer();
                } catch {}
              }
            }

            const imgBlob = new Blob([imgBuffer], { type: 'image/jpeg' });

            let extraContext = '';
            if (strapInfo) {
              extraContext += `\n\nCRITICAL — STRAP/HANDLE ACCURACY: This product has a strap: ${strapInfo}. Rules:
1. Reproduce EXACT colors, pattern, material, width, and hardware.
2. The stripe/pattern must be CONTINUOUS and UNBROKEN along the entire strap length — no gaps, no pattern breaks, no direction changes. It is one physical piece of fabric.
3. Show the strap draped naturally.
4. Do NOT simplify or alter the strap pattern.`;
            }
            if (productInfo) {
              extraContext += `\nProduct: ${productInfo}`;
            }

            const results = await Promise.all(
              Object.entries(selectedStyles).map(async ([sKey, cfg]) => {
                try {
                  const formData = new FormData();
                  formData.append('model', 'gpt-image-2');
                  formData.append('image[]', imgBlob, 'product.jpg');
                  formData.append('prompt', cfg.prompt + extraContext);
                  formData.append('n', '1');
                  formData.append('size', '1024x1024');
                  formData.append('quality', 'high');

                  const r = await fetch('https://api.openai.com/v1/images/edits', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}` },
                    body: formData,
                  });
                  if (!r.ok) {
                    const errText = await r.text();
                    console.error(`GPT Image 2 error (${sKey}):`, errText);
                    return { style: sKey, label: cfg.label, error: true };
                  }
                  const data = await r.json();
                  const b64 = data?.data?.[0]?.b64_json;
                  if (b64) {
                    return { style: sKey, label: cfg.label, b64 };
                  }
                  const url = data?.data?.[0]?.url;
                  if (url) {
                    const imgF = await fetch(url);
                    const buf = Buffer.from(await imgF.arrayBuffer());
                    return { style: sKey, label: cfg.label, b64: buf.toString('base64') };
                  }
                  return { style: sKey, label: cfg.label, error: true };
                } catch (e) {
                  console.error(`Error (${sKey}):`, e.message);
                  return { style: sKey, label: cfg.label, error: true };
                }
              })
            );

            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ images: results }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: e?.message || 'error' }));
          }
        });
      });
    },
  };
}

// Plugin que emula /api/analyze en dev server (en prod lo sirve Vercel).
function devAnalyze(env) {
  return {
    name: 'dev-analyze',
    configureServer(server) {
      server.middlewares.use('/api/analyze', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        const key = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!key) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify({
            error: 'Falta ANTHROPIC_API_KEY en .env (solo dev)',
          }));
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const images = Array.isArray(parsed.images) ? parsed.images : (parsed.image ? [parsed.image] : []);
            if (images.length === 0) {
              res.statusCode = 400;
              res.setHeader('content-type', 'application/json');
              return res.end(JSON.stringify({ error: 'images/image inválida' }));
            }
            const content = [];
            for (const image of images) {
              if (!image?.startsWith?.('data:image/')) {
                res.statusCode = 400;
                res.setHeader('content-type', 'application/json');
                return res.end(JSON.stringify({ error: 'cada imagen debe ser dataURL base64' }));
              }
              const mediaType = image.substring(5, image.indexOf(';'));
              const base64 = image.split(',')[1];
              content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
            }
            const PROMPT = `Eres un experto en reventa en Poshmark, Mercari, eBay y FB Marketplace, de ítems comprados en Ross, Marshalls, Burlington, TJ Maxx.

Recibirás una o varias fotos del MISMO producto (no productos distintos). Consolida TODA la información visible.

Devuelve SOLO un JSON válido, sin markdown:

{
  "name": "nombre descriptivo en español",
  "brand": "marca exacta o ''",
  "model": "modelo/código o ''",
  "category": "cartera|ropa|zapatos|accesorios|otro",
  "color": "color principal",
  "material": "material estimado o ''",
  "size": "talla si aparece o ''",
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
- Luxury/designer (Coach, MK, Kate Spade, Tory Burch): 40-65% del MSRP si NWT
- Premium (Tommy Hilfiger, Calvin Klein, Guess, Nine West): 35-55% del MSRP
- Mid/fast fashion: 20-40% del MSRP
- Sin marca: precio tienda + pequeño margen
- Si hay tag_price sin MSRP: +50-120% según marca
- "Nuevo con etiqueta" = tope del rango; "Buena"/"Usado" = -30-50%

Si no puedes leer algo con seguridad, pon '' o null. NO inventes.`;
            content.push({ type: 'text', text: PROMPT });
            const r = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 1400,
                messages: [{ role: 'user', content }],
              }),
            });
            if (!r.ok) {
              const t = await r.text();
              res.statusCode = 502;
              res.setHeader('content-type', 'application/json');
              return res.end(JSON.stringify({ error: 'Claude API error', detail: t.slice(0, 500) }));
            }
            const j = await r.json();
            const text = j?.content?.[0]?.text || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (!match) {
              res.statusCode = 502;
              res.setHeader('content-type', 'application/json');
              return res.end(JSON.stringify({ error: 'Respuesta sin JSON', raw: text.slice(0, 300) }));
            }
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(match[0]);
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: e?.message || 'error' }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), devAnalyze(env), devGeneratePromo(env)],
    server: { port: 5173 },
  };
});
