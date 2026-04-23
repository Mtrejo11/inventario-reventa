// Vercel Serverless Function — GPT Image 2 product photo generation.
// Pipeline: Download → Claude Vision orientation detect → Sharp rotate → GPT Image 2 generate
//
// POST body:
//   { imageUrl: "https://...", style: "studio"|"lifestyle"|"editorial"|"flat-lay"|"seasonal" }
// Returns: { images: [{ b64: "base64...", style: "..." }], rotated: 0|90|180|270 }

import sharp from 'sharp';

export const config = { maxDuration: 120 };

const STYLES = {
  studio: {
    label: 'Estudio profesional',
    prompt: `Professional e-commerce product photo. Clean white or light gray seamless backdrop. Soft, diffused studio lighting from above and both sides, creating gentle natural shadows beneath the product. The product is the sole hero — centered, fully open/unfolded, and displayed upright or laid flat to show its complete shape. Slightly closer crop than a full-body shot: frame the product with minimal empty space so details are clearly visible. Style reference: Nordstrom, Net-a-Porter product pages. No text, no watermarks, no props. CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo placement, hardware, stitching, and any patterns or textures. Every detail must be continuous and physically realistic. Never fold, roll, or partially hide the product.`,
  },
  lifestyle: {
    label: 'Lifestyle',
    prompt: `Aspirational lifestyle product photograph. The product is displayed fully open/unfolded in ONE of these physically realistic scenes (pick the most natural fit): hanging on a sleek wall hook or coat rack near a sunlit window; resting upright on a clean marble surface or wooden console table; laid flat on crisp white bedding with soft morning light; placed on a mid-century leather armchair. The scene must obey real-world physics — no furniture on top of other furniture, no floating objects. Keep the setting minimal and luxurious: 1-2 subtle props maximum (a small plant, a candle, a book). Warm, inviting tones. The product fills at least 60% of the frame — use a slightly tighter crop to highlight material and detail. Instagram-worthy aesthetic. No text, no watermarks. CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo, hardware, stitching, patterns, and textures. Never fold, crumple, or partially obscure the product.`,
  },
  editorial: {
    label: 'Editorial / Fashion',
    prompt: `High-fashion editorial product photo. The product is displayed fully open/unfolded against a bold, single-color backdrop (deep plum, emerald green, navy blue, or rich terracotta) OR on a textured surface like raw concrete or dark slate. Dramatic directional lighting — strong key light from one side with deep, cinematic shadows. The framing is a confident close-up: the product fills 65-75% of the frame, emphasizing material texture, hardware details, and craftsmanship. Think Vogue or Harper's Bazaar product features. The product should look premium, editorial, and desirable. No props, no text, no watermarks. CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo, hardware, stitching, patterns, and textures. Never fold, drape over, or partially hide the product.`,
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

  try {
    const { imageUrl, style, rotation: manualRotation } = req.body || {};

    if (!imageUrl) {
      return res.status(400).json({ error: 'Se requiere imageUrl' });
    }

    const selectedStyles = style && STYLES[style]
      ? { [style]: STYLES[style] }
      : STYLES;

    // 1. Download the source image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error('No se pudo descargar la imagen del producto');
    let imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // 2. Analyze product (strap details + orientation if no manual rotation)
    const analysis = await analyzeProduct(imgBuffer, anthropicKey);

    // 3. Apply rotation — manual override takes priority, then AI detection
    const effectiveRotation = (manualRotation && [90, 180, 270].includes(manualRotation))
      ? manualRotation
      : analysis.rotation;
    if (effectiveRotation !== 0) {
      console.log(`Applying ${effectiveRotation}° rotation (${manualRotation ? 'manual' : 'auto-detected'})`);
      imgBuffer = await sharp(imgBuffer).rotate(effectiveRotation).jpeg({ quality: 92 }).toBuffer();
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
    const results = await Promise.all(
      Object.entries(selectedStyles).map(async ([key_style, cfg]) => {
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
            headers: { 'Authorization': `Bearer ${openaiKey}` },
            body: formData,
          });

          if (!r.ok) {
            const errText = await r.text();
            console.error(`GPT Image 2 error for style ${key_style}:`, errText);
            return { style: key_style, label: cfg.label, error: true };
          }

          const data = await r.json();
          const b64 = data?.data?.[0]?.b64_json;
          if (b64) {
            return { style: key_style, label: cfg.label, b64 };
          }
          const url = data?.data?.[0]?.url;
          if (url) {
            const imgFetch = await fetch(url);
            const buf = Buffer.from(await imgFetch.arrayBuffer());
            return { style: key_style, label: cfg.label, b64: buf.toString('base64') };
          }
          return { style: key_style, label: cfg.label, error: true };
        } catch (e) {
          console.error(`Error generating ${key_style}:`, e.message);
          return { style: key_style, label: cfg.label, error: true };
        }
      })
    );

    if (results.every(r => r.error)) {
      return res.status(502).json({ error: 'No se pudo generar ninguna imagen. Verifica tu OPENAI_API_KEY.' });
    }

    return res.status(200).json({ images: results, rotated: effectiveRotation });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Error inesperado' });
  }
}
