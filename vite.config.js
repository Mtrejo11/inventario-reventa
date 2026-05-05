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
          const tStart = Date.now();
          const ms = (t) => `${((Date.now() - t) / 1000).toFixed(1)}s`;
          try {
            const parsed = JSON.parse(body || '{}');
            const { imageUrl, style, rotation: manualRotation } = parsed;
            if (!imageUrl) {
              res.statusCode = 400;
              res.setHeader('content-type', 'application/json');
              return res.end(JSON.stringify({ error: 'Se requiere imageUrl' }));
            }

            const COLOR_LOCK = ' COLOR FIDELITY (HIGHEST PRIORITY): The input image is the AUTHORITATIVE reference for the product\'s colors. Reproduce every color on the product EXACTLY as it appears in the input — same hue, same saturation, same brightness, same color temperature. If the input shows a navy blue product, output the SAME navy blue (not black, not royal blue, not brown-shifted dark). If the input shows a beige label, output the SAME beige (not white, not cream). Do NOT warm-shift, cool-shift, desaturate, or "harmonize" the product\'s colors with the new scene\'s lighting. The scene\'s ambient light may slightly affect highlights and shadows on the product\'s surface, but the underlying body colors of the product must be IDENTICAL to the input image.';
            const STATE_LOCK = ' Follow the EXACT STATE TO REPRODUCE and VISIBLE FEATURES instructions provided below — they are the authoritative description of how the product must appear. You may only change the surrounding scene, background, and lighting — never the product\'s state, orientation, or feature set.';
            const PRESERVE = ' CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo, hardware, stitching, patterns, and textures. Every detail must be continuous and physically realistic.';
            const STYLES = {
              studio: {
                label: 'Estudio profesional',
                prompt: 'Professional e-commerce product photo. Clean white or light gray seamless backdrop. Soft, diffused studio lighting from above and both sides, creating gentle natural shadows. The product is the sole hero — centered, shown in the same configuration as the input image. Slightly closer crop with minimal empty space so details are visible. Style: Nordstrom, Net-a-Porter. No text, no watermarks, no props.' + COLOR_LOCK + STATE_LOCK + PRESERVE,
              },
              lifestyle: {
                label: 'Lifestyle',
                prompt: 'Aspirational lifestyle product photo. Product displayed in the same configuration as the input image, in a physically realistic scene: hanging on a wall hook near a sunlit window, resting on a marble surface or wooden console, laid on crisp white bedding, or on a leather armchair. Must obey real-world physics — no furniture stacked illogically. Minimal setting, 1-2 subtle props max. Warm tones. Product fills 60%+ of frame. Instagram-worthy. No text, no watermarks. The light hitting the product should come from the SAME direction and have the SAME quality as the light hitting the rest of the scene. If the scene has hard sunlight from one side, the product should also show a brighter sunlit side and a shadowed side. If the scene is soft and diffused, the product should also be soft. Do NOT add separate studio-style rim lights or all-around fill lighting that ignores the scene\'s actual light source. The product\'s cast shadow on nearby surfaces should be SOFT-EDGED and diffuse — never a sharp dark duplicate of the product\'s silhouette. Match the softness of other shadows in the scene (e.g. plant or prop shadows). Depth of field must be physically consistent: any object on the SAME surface or plane as the product (vases, cups, books, fabric) should be roughly as sharp as the product itself — do NOT make the product razor-sharp while blurring co-planar objects. Only true background elements (walls, distant scenery) may be softly blurred.' + COLOR_LOCK + STATE_LOCK + PRESERVE,
              },
              editorial: {
                label: 'Editorial / Fashion',
                prompt: 'High-fashion editorial product photo. Product shown in the same configuration as the input image, against a bold single-color backdrop (deep plum, emerald, navy, terracotta) or textured surface (concrete, dark slate). Dramatic directional lighting with cinematic shadows. Confident close-up: product fills 65-75% of frame, emphasizing texture and craftsmanship. Vogue/Harper\'s Bazaar style. No props, no text, no watermarks.' + COLOR_LOCK + STATE_LOCK + PRESERVE,
              },
            };

            const selectedStyles = style && STYLES[style]
              ? { [style]: STYLES[style] }
              : STYLES;

            // Download the source image
            const tDownload = Date.now();
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) throw new Error('No se pudo descargar la imagen');
            let imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            console.log(`[timing] Download: ${ms(tDownload)}`);

            const sharp = (await import('sharp')).default;

            // Step 1: ALWAYS apply EXIF rotation + manual rotation FIRST.
            // This guarantees the buffer sent to OpenAI matches what the user sees.
            const tRotate = Date.now();
            const validManual = [90, 180, 270].includes(manualRotation) ? manualRotation : 0;
            console.log(`[generate-promo] manualRotation=${manualRotation} → applying ${validManual}° (after EXIF)`);
            imgBuffer = await sharp(imgBuffer)
              .rotate() // EXIF auto-orient
              .toBuffer();
            if (validManual !== 0) {
              imgBuffer = await sharp(imgBuffer).rotate(validManual).jpeg({ quality: 92 }).toBuffer();
            } else {
              imgBuffer = await sharp(imgBuffer).jpeg({ quality: 92 }).toBuffer();
            }
            console.log(`[timing] Rotation: ${ms(tRotate)}`);

            // Step 2: Claude analysis on the ALREADY-rotated buffer (rotation + state + features + strap).
            // Auto-rotation only kicks in when there's no manual rotation.
            let strapInfo = '';
            let productInfo = '';
            let stateInfo = '';
            let featuresInfo = '';
            const tAnalysis = Date.now();
            try {
              const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
              if (anthropicKey) {
                const smallBuf = await sharp(imgBuffer).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
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
                    max_tokens: 600,
                    messages: [{
                      role: 'user',
                      content: [
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64img } },
                        { type: 'text', text: `You are preparing instructions for an image generation model that will recreate this product photo in different scenes. Be EXTREMELY precise about what is visible. Reply in this EXACT format:

ROTATION: [0, 90, 180, or 270 — degrees CW needed so the product is naturally upright]
PRODUCT: [1 sentence: type, brand if visible, color, material]
STATE: [is the product OPEN, CLOSED, FOLDED, FLAT, HANGING, etc.? Which side/face is facing the camera (front, back, interior, exterior)? Be explicit. Example: "Wallet is OPEN, showing the INTERIOR with two card slots on the left flap and a zippered compartment + ID window on the right flap." Example: "Wallet is CLOSED, showing the EXTERIOR front face with embossed logo. Interior is NOT visible." Example: "Shirt is laid FLAT, showing the front side with collar at top and buttons running down center."]
VISIBLE_FEATURES: [comma-separated list of every distinct feature PERMANENTLY part of the product: hardware, logos, stitching lines, pockets, zippers, panels, embellishments. Only list what you can SEE. EXCLUDE all retail/price tags, hangtags, store stickers, and removable paper or plastic labels — those will be removed in the output. Example: "gold zipper pull on right flap, embossed STEVE MADDEN logo on bottom-left of left flap, two horizontal card slots on left flap, transparent ID window on right flap, light blue pebbled leather body, gold lobster clasp at top, light blue wristlet strap"]
STRAP: [Describe a real wearable/carrying strap, handle, chain, or wristlet ONLY if ALL of these conditions are true: (1) it forms a CLOSED LOOP large enough to fit a hand or wrist through (typically 6+ inches / 15+ cm of total length), AND (2) it is attached to a dedicated D-ring, side loop, or strap anchor on the product body — NOT to a zipper slider. If even one of those conditions is not met, reply "none". A short metal chain or leather tab hanging from the zipper slider with a brand-name engraved rectangular tag is a ZIPPER PULL DECORATION, not a wristlet — reply "none". A tassel, keyring, charm, or any short dangling ornament is NOT a strap — reply "none". When in doubt, reply "none".]` },
                      ],
                    }],
                  }),
                });
                if (orientRes.ok) {
                  const oj = await orientRes.json();
                  const rawText = oj?.content?.[0]?.text || '';
                  console.log('[generate-promo] Claude analysis:', rawText);
                  // Only auto-rotate when user did NOT specify a manual rotation
                  if (validManual === 0) {
                    const rotMatch = rawText.match(/ROTATION:\s*(\d+)/);
                    const aiDeg = rotMatch ? parseInt(rotMatch[1], 10) : 0;
                    if ([90, 180, 270].includes(aiDeg)) {
                      console.log(`[generate-promo] Auto-rotating ${aiDeg}° (Claude detection)`);
                      imgBuffer = await sharp(imgBuffer).rotate(aiDeg).jpeg({ quality: 92 }).toBuffer();
                    }
                  }
                  const prodMatch = rawText.match(/PRODUCT:\s*(.+?)(?=\nSTATE:|$)/s);
                  if (prodMatch) productInfo = prodMatch[1].trim();
                  const stateMatch = rawText.match(/STATE:\s*(.+?)(?=\nVISIBLE_FEATURES:|$)/s);
                  if (stateMatch) stateInfo = stateMatch[1].trim();
                  const featMatch = rawText.match(/VISIBLE_FEATURES:\s*(.+?)(?=\nSTRAP:|$)/s);
                  if (featMatch) featuresInfo = featMatch[1].trim();
                  const strapMatch = rawText.match(/STRAP:\s*(.+?)$/s);
                  if (strapMatch && strapMatch[1].trim().toLowerCase() !== 'none') {
                    strapInfo = strapMatch[1].trim();
                  }
                }
              }
            } catch (e) {
              console.warn('[generate-promo] Claude analysis error (non-fatal):', e.message);
            }
            console.log(`[timing] Claude analysis: ${ms(tAnalysis)}`);

            const imgBlob = new Blob([imgBuffer], { type: 'image/jpeg' });

            let extraContext = '';
            if (productInfo) {
              extraContext += `\n\nPRODUCT IDENTITY: ${productInfo}`;
            }
            if (stateInfo) {
              extraContext += `\n\nEXACT STATE TO REPRODUCE (do not deviate): ${stateInfo} The product MUST appear in this exact state and orientation in the output. Do NOT open it if it is closed. Do NOT close it if it is open. Do NOT flip, fold, unfold, or change which side faces the camera.`;
            }
            if (featuresInfo) {
              extraContext += `\n\nVISIBLE FEATURES (reproduce ALL of these, and ONLY these — do not invent extras): ${featuresInfo}. Any feature not in this list must NOT appear in the output (no extra zippers, slots, pockets, hardware, or embellishments).`;
            }
            extraContext += `\n\nTAG REMOVAL (mandatory): Remove ALL retail tags, hangtags, price stickers, store labels, and any removable paper or plastic tag from the product, even if they are visible in the input image. The product must appear clean and ready-to-sell — no tags, no stickers, no dangling labels of any kind. Permanent embossed/printed brand logos that are part of the product itself must remain.`;
            if (strapInfo) {
              extraContext += `\n\nSTRAP/HANDLE ACCURACY: ${strapInfo}. Reproduce the EXACT colors, pattern, material, width, and attachment hardware. The pattern must be CONTINUOUS and UNBROKEN along the entire length. Show it in a natural, relaxed draping position. Do NOT simplify or alter it.`;
            } else {
              extraContext += `\n\nNO STRAP / NO CHAIN / NO WRISTLET (mandatory): This product has NO carrying strap, NO chain, NO handle, NO wristlet, NO lanyard, and NO shoulder strap of any kind. Do NOT add a chain, strap, handle, wristlet, lanyard, or any carrying accessory to the product. Any small metal pull tab on a zipper is JUST a zipper pull — it is NOT a chain and must NOT extend or connect to a chain. The product stands or rests on its own with no attached carrying piece.`;
            }

            const tGenAll = Date.now();
            console.log(`[timing] Starting ${Object.keys(selectedStyles).length} GPT Image 2 generation(s) in parallel...`);
            const results = await Promise.all(
              Object.entries(selectedStyles).map(async ([sKey, cfg]) => {
                const tStyle = Date.now();
                try {
                  const formData = new FormData();
                  formData.append('model', 'gpt-image-2');
                  formData.append('image[]', imgBlob, 'product.jpg');
                  formData.append('prompt', cfg.prompt + extraContext);
                  formData.append('n', '1');
                  formData.append('size', '1024x1024');
                  formData.append('quality', 'medium');

                  const r = await fetch('https://api.openai.com/v1/images/edits', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}` },
                    body: formData,
                  });
                  if (!r.ok) {
                    const errText = await r.text();
                    console.error(`[timing] ${sKey} FAILED in ${ms(tStyle)}:`, errText);
                    return { style: sKey, label: cfg.label, error: true };
                  }
                  const data = await r.json();
                  const b64 = data?.data?.[0]?.b64_json;
                  if (b64) {
                    console.log(`[timing] ${sKey} done: ${ms(tStyle)}`);
                    return { style: sKey, label: cfg.label, b64 };
                  }
                  const url = data?.data?.[0]?.url;
                  if (url) {
                    const imgF = await fetch(url);
                    const buf = Buffer.from(await imgF.arrayBuffer());
                    console.log(`[timing] ${sKey} done (via URL): ${ms(tStyle)}`);
                    return { style: sKey, label: cfg.label, b64: buf.toString('base64') };
                  }
                  console.error(`[timing] ${sKey} returned no image after ${ms(tStyle)}`);
                  return { style: sKey, label: cfg.label, error: true };
                } catch (e) {
                  console.error(`[timing] ${sKey} threw after ${ms(tStyle)}:`, e.message);
                  return { style: sKey, label: cfg.label, error: true };
                }
              })
            );
            console.log(`[timing] All generations finished in ${ms(tGenAll)}`);
            console.log(`[timing] TOTAL request: ${ms(tStart)}`);

            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ images: results }));
          } catch (e) {
            console.error(`[timing] Request FAILED after ${ms(tStart)}:`, e?.message);
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
                model: 'claude-sonnet-4-6',
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
