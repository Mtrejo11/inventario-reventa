// Vercel Serverless Function — GPT Image 2 product photo generation.
// Pipeline: Download → Claude Vision orientation detect → Sharp rotate → GPT Image 2 generate
//
// POST body:
//   { imageUrl: "https://...", style: "studio"|"lifestyle"|"editorial"|"flat-lay"|"seasonal" }
// Returns: { images: [{ b64: "base64...", style: "..." }], rotated: 0|90|180|270 }

import sharp from 'sharp';

export const config = { maxDuration: 300 };

const COLOR_LOCK = `COLOR FIDELITY (HIGHEST PRIORITY): The input image is the AUTHORITATIVE reference for the product's colors. Reproduce every color on the product EXACTLY as it appears in the input — same hue, same saturation, same brightness, same color temperature. If the input shows a navy blue product, output the SAME navy blue (not black, not royal blue, not brown-shifted dark). If the input shows a beige label, output the SAME beige (not white, not cream). Do NOT warm-shift, cool-shift, desaturate, or "harmonize" the product's colors with the new scene's lighting. The scene's ambient light may slightly affect highlights and shadows on the product's surface, but the underlying body colors of the product must be IDENTICAL to the input image.`;

const STYLES = {
  studio: {
    label: 'Estudio profesional',
    prompt: `Professional e-commerce product photo. Clean white or light gray seamless backdrop. Soft, diffused studio lighting from above and both sides, creating gentle natural shadows beneath the product. The product is the sole hero — centered, fully open/unfolded, and displayed upright or laid flat to show its complete shape. Slightly closer crop than a full-body shot: frame the product with minimal empty space so details are clearly visible. Style reference: Nordstrom, Net-a-Porter product pages. No text, no watermarks, no props. ${COLOR_LOCK} CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo placement, hardware, stitching, and any patterns or textures. Every detail must be continuous and physically realistic. Never fold, roll, or partially hide the product.`,
  },
  lifestyle: {
    label: 'Lifestyle',
    prompt: `Aspirational lifestyle product photograph. The product is displayed fully open/unfolded in ONE of these physically realistic scenes (pick the most natural fit): hanging on a sleek wall hook or coat rack near a sunlit window; resting upright on a clean marble surface or wooden console table; laid flat on crisp white bedding with soft morning light; placed on a mid-century leather armchair. The scene must obey real-world physics — no furniture on top of other furniture, no floating objects. Keep the setting minimal and luxurious: 1-2 subtle props maximum (a small plant, a candle, a book). Warm, inviting tones. The product fills at least 60% of the frame — use a slightly tighter crop to highlight material and detail. Instagram-worthy aesthetic. No text, no watermarks. The light hitting the product should come from the SAME direction and have the SAME quality as the light hitting the rest of the scene. If the scene has hard sunlight from one side, the product should also show a brighter sunlit side and a shadowed side. If the scene is soft and diffused, the product should also be soft. Do NOT add separate studio-style rim lights or all-around fill lighting that ignores the scene's actual light source. The product's cast shadow on nearby surfaces should be SOFT-EDGED and diffuse — never a sharp dark duplicate of the product's silhouette. Match the softness of other shadows in the scene (e.g. plant or prop shadows). Depth of field must be physically consistent: any object on the SAME surface or plane as the product (vases, cups, books, fabric) should be roughly as sharp as the product itself — do NOT make the product razor-sharp while blurring co-planar objects. Only true background elements (walls, distant scenery) may be softly blurred. ${COLOR_LOCK} CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo, hardware, stitching, patterns, and textures. Never fold, crumple, or partially obscure the product.`,
  },
  editorial: {
    label: 'Editorial / Fashion',
    prompt: `High-fashion editorial product photo. The product is displayed fully open/unfolded against a bold, single-color backdrop (deep plum, emerald green, navy blue, or rich terracotta) OR on a textured surface like raw concrete or dark slate. Dramatic directional lighting — strong key light from one side with deep, cinematic shadows. The framing is a confident close-up: the product fills 65-75% of the frame, emphasizing material texture, hardware details, and craftsmanship. Think Vogue or Harper's Bazaar product features. The product should look premium, editorial, and desirable. No props, no text, no watermarks. ${COLOR_LOCK} CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo, hardware, stitching, patterns, and textures. Never fold, drape over, or partially hide the product.`,
  },
};

// Analyze product: orientation + strap details.
// Returns { rotation: 0|90|180|270, strapInfo: string, productInfo: string }
async function analyzeProduct(imgBuffer, anthropicKey) {
  const result = { rotation: 0, strapInfo: '', productInfo: '' };
  if (!anthropicKey) return result;

  try {
    const smallBuf = await sharp(imgBuffer).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
    const b64 = smallBuf.toString('base64');

    const r = await fetch('https://api.anthropic.com/v1/messages', {
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
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
            },
            {
              type: 'text',
              text: `Analyze this product photo. Reply in this EXACT format:
ROTATION: [0, 90, 180, or 270 — degrees CW needed so the product is naturally upright]
STRAP: [detailed description of strap/handle/chain if any, or "none"]
PRODUCT: [1-sentence product description]`,
            },
          ],
        }],
      }),
    });

    if (!r.ok) {
      console.error('Claude analysis failed:', await r.text());
      return result;
    }

    const j = await r.json();
    const rawText = (j?.content?.[0]?.text || '').trim();
    console.log('Claude product analysis:', rawText);

    const rotMatch = rawText.match(/ROTATION:\s*(\d+)/);
    result.rotation = rotMatch ? parseInt(rotMatch[1], 10) : 0;
    if (![0, 90, 180, 270].includes(result.rotation)) result.rotation = 0;

    const strapMatch = rawText.match(/STRAP:\s*(.+?)(?=\nPRODUCT:|$)/s);
    if (strapMatch && strapMatch[1].trim().toLowerCase() !== 'none') {
      result.strapInfo = strapMatch[1].trim();
    }

    const prodMatch = rawText.match(/PRODUCT:\s*(.+?)$/s);
    if (prodMatch) result.productInfo = prodMatch[1].trim();

    console.log(`Analysis: rotation=${result.rotation}°, strap=${result.strapInfo ? 'yes' : 'none'}`);
    return result;
  } catch (e) {
    console.error('Product analysis error:', e.message);
    return result;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return res.status(500).json({ error: 'Falta OPENAI_API_KEY en el servidor.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const tStart = Date.now();
  const ms = (t) => `${((Date.now() - t) / 1000).toFixed(1)}s`;

  try {
    const { imageUrl, style, rotation: manualRotation } = req.body || {};

    if (!imageUrl) {
      return res.status(400).json({ error: 'Se requiere imageUrl' });
    }

    const selectedStyles = style && STYLES[style]
      ? { [style]: STYLES[style] }
      : STYLES;

    // 1. Download the source image
    const tDownload = Date.now();
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error('No se pudo descargar la imagen del producto');
    let imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    console.log(`[timing] Download: ${ms(tDownload)}`);

    // 2. ALWAYS apply EXIF rotation + manual rotation FIRST so the buffer
    //    sent to OpenAI matches what the user sees in the preview.
    const tRotate = Date.now();
    const validManual = [90, 180, 270].includes(manualRotation) ? manualRotation : 0;
    console.log(`manualRotation=${manualRotation} → applying ${validManual}° (after EXIF)`);
    imgBuffer = await sharp(imgBuffer).rotate().toBuffer(); // EXIF auto-orient
    if (validManual !== 0) {
      imgBuffer = await sharp(imgBuffer).rotate(validManual).jpeg({ quality: 92 }).toBuffer();
    } else {
      imgBuffer = await sharp(imgBuffer).jpeg({ quality: 92 }).toBuffer();
    }
    console.log(`[timing] Rotation: ${ms(tRotate)}`);

    // 3. Analyze product on the ALREADY-rotated buffer (strap context + auto-rotation only when no manual).
    const tAnalysis = Date.now();
    const analysis = await analyzeProduct(imgBuffer, anthropicKey);
    console.log(`[timing] Claude analysis: ${ms(tAnalysis)}`);
    if (validManual === 0 && [90, 180, 270].includes(analysis.rotation)) {
      console.log(`Auto-rotating ${analysis.rotation}° (Claude detection, no manual)`);
      imgBuffer = await sharp(imgBuffer).rotate(analysis.rotation).jpeg({ quality: 92 }).toBuffer();
    }

    // 4. Build strap/product context for prompts
    let extraContext = '';
    if (analysis.strapInfo) {
      extraContext += `\n\nCRITICAL — STRAP/HANDLE ACCURACY: This product has a strap: ${analysis.strapInfo}. Rules for the strap:
1. Reproduce the EXACT colors, pattern, material, width, and attachment hardware.
2. The stripe/pattern must be CONTINUOUS and UNBROKEN along the entire length of the strap — no gaps, no pattern interruptions, no sudden changes in stripe direction. Think of it as a single physical piece of fabric.
3. Show the strap in a natural, relaxed draping position.
4. The strap attaches to the product at specific hardware points — show those connections realistically.
5. Do NOT simplify, invent, or alter the strap pattern. It must look like the SAME real strap, just repositioned naturally.`;
    }
    if (analysis.productInfo) {
      extraContext += `\nProduct context: ${analysis.productInfo}`;
    }

    // 5. Create blob from corrected image
    const imgBlob = new Blob([imgBuffer], { type: 'image/jpeg' });

    // 6. Generate images for each style — ALL IN PARALLEL
    const tGenAll = Date.now();
    console.log(`[timing] Starting ${Object.keys(selectedStyles).length} GPT Image 2 generation(s) in parallel...`);
    const results = await Promise.all(
      Object.entries(selectedStyles).map(async ([key_style, cfg]) => {
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
            headers: { 'Authorization': `Bearer ${openaiKey}` },
            body: formData,
          });

          if (!r.ok) {
            const errText = await r.text();
            console.error(`[timing] ${key_style} FAILED in ${ms(tStyle)}:`, errText);
            return { style: key_style, label: cfg.label, error: true };
          }

          const data = await r.json();
          const b64 = data?.data?.[0]?.b64_json;
          if (b64) {
            console.log(`[timing] ${key_style} done: ${ms(tStyle)}`);
            return { style: key_style, label: cfg.label, b64 };
          }
          const url = data?.data?.[0]?.url;
          if (url) {
            const imgFetch = await fetch(url);
            const buf = Buffer.from(await imgFetch.arrayBuffer());
            console.log(`[timing] ${key_style} done (via URL): ${ms(tStyle)}`);
            return { style: key_style, label: cfg.label, b64: buf.toString('base64') };
          }
          console.error(`[timing] ${key_style} returned no image after ${ms(tStyle)}`);
          return { style: key_style, label: cfg.label, error: true };
        } catch (e) {
          console.error(`[timing] ${key_style} threw after ${ms(tStyle)}:`, e.message);
          return { style: key_style, label: cfg.label, error: true };
        }
      })
    );

    console.log(`[timing] All generations finished in ${ms(tGenAll)}`);
    console.log(`[timing] TOTAL request: ${ms(tStart)}`);

    if (results.every(r => r.error)) {
      return res.status(502).json({ error: 'No se pudo generar ninguna imagen. Verifica tu OPENAI_API_KEY.' });
    }

    const finalRotation = validManual !== 0
      ? validManual
      : (analysis.rotation && [90, 180, 270].includes(analysis.rotation) ? analysis.rotation : 0);
    return res.status(200).json({ images: results, rotated: finalRotation });
  } catch (e) {
    console.error(`[timing] Request FAILED after ${ms(tStart)}:`, e?.message);
    return res.status(500).json({ error: e?.message || 'Error inesperado' });
  }
}
