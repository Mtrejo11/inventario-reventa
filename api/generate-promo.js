// Vercel Serverless Function — GPT Image 2 product photo generation.
// Pipeline: Download → Claude Vision orientation detect → Sharp rotate → GPT Image 2 generate
//
// POST body:
//   { imageUrl: "https://...", style: "studio"|"lifestyle"|"editorial"|"flat-lay"|"seasonal" }
// Returns: { images: [{ b64: "base64...", style: "..." }], rotated: 0|90|180|270 }

import sharp from 'sharp';

export const config = { maxDuration: 300 };

const COLOR_LOCK = `COLOR FIDELITY (HIGHEST PRIORITY): The input image is the AUTHORITATIVE reference for the product's colors. Reproduce every color on the product EXACTLY as it appears in the input — same hue, same saturation, same brightness, same color temperature. If the input shows a navy blue product, output the SAME navy blue (not black, not royal blue, not brown-shifted dark). If the input shows a beige label, output the SAME beige (not white, not cream). Do NOT warm-shift, cool-shift, desaturate, or "harmonize" the product's colors with the new scene's lighting. The scene's ambient light may slightly affect highlights and shadows on the product's surface, but the underlying body colors of the product must be IDENTICAL to the input image.`;

const STATE_LOCK = `Follow the EXACT STATE TO REPRODUCE and VISIBLE FEATURES instructions provided below — they are the authoritative description of how the product must appear. You may only change the surrounding scene, background, and lighting — never the product's state, orientation, or feature set.`;

const STYLES = {
  studio: {
    label: 'Estudio profesional',
    prompt: `Professional e-commerce product photo. Clean white or light gray seamless backdrop. Soft, diffused studio lighting from above and both sides, creating gentle natural shadows beneath the product. The product is the sole hero — centered, shown in the same configuration as the input image. Slightly closer crop than a full-body shot: frame the product with minimal empty space so details are clearly visible. Style reference: Nordstrom, Net-a-Porter product pages. No text, no watermarks, no props. ${COLOR_LOCK} ${STATE_LOCK} CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo placement, hardware, stitching, and any patterns or textures. Every detail must be continuous and physically realistic.`,
  },
  lifestyle: {
    label: 'Lifestyle',
    prompt: `Aspirational lifestyle product photograph. The product is displayed in the same configuration as the input image, in ONE of these physically realistic scenes (pick the most natural fit): hanging on a sleek wall hook or coat rack near a sunlit window; resting on a clean marble surface or wooden console table; laid on crisp white bedding with soft morning light; placed on a mid-century leather armchair. The scene must obey real-world physics — no furniture on top of other furniture, no floating objects. Keep the setting minimal and luxurious: 1-2 subtle props maximum (a small plant, a candle, a book). Warm, inviting tones. The product fills at least 60% of the frame — use a slightly tighter crop to highlight material and detail. Instagram-worthy aesthetic. No text, no watermarks. The light hitting the product should come from the SAME direction and have the SAME quality as the light hitting the rest of the scene. If the scene has hard sunlight from one side, the product should also show a brighter sunlit side and a shadowed side. If the scene is soft and diffused, the product should also be soft. Do NOT add separate studio-style rim lights or all-around fill lighting that ignores the scene's actual light source. The product's cast shadow on nearby surfaces should be SOFT-EDGED and diffuse — never a sharp dark duplicate of the product's silhouette. Match the softness of other shadows in the scene (e.g. plant or prop shadows). Depth of field must be physically consistent: any object on the SAME surface or plane as the product (vases, cups, books, fabric) should be roughly as sharp as the product itself — do NOT make the product razor-sharp while blurring co-planar objects. Only true background elements (walls, distant scenery) may be softly blurred. ${COLOR_LOCK} ${STATE_LOCK} CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo, hardware, stitching, patterns, and textures.`,
  },
  editorial: {
    label: 'Editorial / Fashion',
    prompt: `High-fashion editorial product photo. The product is displayed in the same configuration as the input image, against a bold, single-color backdrop (deep plum, emerald green, navy blue, or rich terracotta) OR on a textured surface like raw concrete or dark slate. Dramatic directional lighting — strong key light from one side with deep, cinematic shadows. The framing is a confident close-up: the product fills 65-75% of the frame, emphasizing material texture, hardware details, and craftsmanship. Think Vogue or Harper's Bazaar product features. The product should look premium, editorial, and desirable. No props, no text, no watermarks. ${COLOR_LOCK} ${STATE_LOCK} CRITICAL: Reproduce the product with photographic accuracy — exact shape, material, color, logo, hardware, stitching, patterns, and textures.`,
  },
};

// Analyze product: orientation + strap details + visible state/features.
// Returns { rotation, strapInfo, productInfo, stateInfo, featuresInfo }
async function analyzeProduct(imgBuffer, anthropicKey) {
  const result = { rotation: 0, strapInfo: '', productInfo: '', stateInfo: '', featuresInfo: '' };
  if (!anthropicKey) return result;

  try {
    const smallBuf = await sharp(imgBuffer).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
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
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
            },
            {
              type: 'text',
              text: `You are preparing instructions for an image generation model that will recreate this product photo in different scenes. Be EXTREMELY precise about what is visible. Reply in this EXACT format:

ROTATION: [0, 90, 180, or 270 — degrees CW needed so the product is naturally upright]
PRODUCT: [1 sentence: type, brand if visible, color, material]
STATE: [is the product OPEN, CLOSED, FOLDED, FLAT, HANGING, etc.? Which side/face is facing the camera (front, back, interior, exterior)? Be explicit. Example: "Wallet is OPEN, showing the INTERIOR with two card slots on the left flap and a zippered compartment + ID window on the right flap." Example: "Wallet is CLOSED, showing the EXTERIOR front face with embossed logo. Interior is NOT visible." Example: "Shirt is laid FLAT, showing the front side with collar at top and buttons running down center."]
VISIBLE_FEATURES: [comma-separated list of every distinct feature PERMANENTLY part of the product: hardware, logos, stitching lines, pockets, zippers, panels, embellishments. Only list what you can SEE. EXCLUDE all retail/price tags, hangtags, store stickers, and removable paper or plastic labels — those will be removed in the output. Example: "gold zipper pull on right flap, embossed STEVE MADDEN logo on bottom-left of left flap, two horizontal card slots on left flap, transparent ID window on right flap, light blue pebbled leather body, gold lobster clasp at top, light blue wristlet strap"]
STRAP: [Describe a real wearable/carrying strap, handle, chain, or wristlet ONLY if ALL of these conditions are true: (1) it forms a CLOSED LOOP large enough to fit a hand or wrist through (typically 6+ inches / 15+ cm of total length), AND (2) it is attached to a dedicated D-ring, side loop, or strap anchor on the product body — NOT to a zipper slider. If even one of those conditions is not met, reply "none". A short metal chain or leather tab hanging from the zipper slider with a brand-name engraved rectangular tag is a ZIPPER PULL DECORATION, not a wristlet — reply "none". A tassel, keyring, charm, or any short dangling ornament is NOT a strap — reply "none". When in doubt, reply "none".]`,
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

    const prodMatch = rawText.match(/PRODUCT:\s*(.+?)(?=\nSTATE:|$)/s);
    if (prodMatch) result.productInfo = prodMatch[1].trim();

    const stateMatch = rawText.match(/STATE:\s*(.+?)(?=\nVISIBLE_FEATURES:|$)/s);
    if (stateMatch) result.stateInfo = stateMatch[1].trim();

    const featMatch = rawText.match(/VISIBLE_FEATURES:\s*(.+?)(?=\nSTRAP:|$)/s);
    if (featMatch) result.featuresInfo = featMatch[1].trim();

    const strapMatch = rawText.match(/STRAP:\s*(.+?)$/s);
    if (strapMatch && strapMatch[1].trim().toLowerCase() !== 'none') {
      result.strapInfo = strapMatch[1].trim();
    }

    console.log(`Analysis: rotation=${result.rotation}°, state="${result.stateInfo.slice(0, 80)}...", strap=${result.strapInfo ? 'yes' : 'none'}`);
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

    // 4. Build positive-instruction context from Claude's analysis.
    //    These tell the model EXACTLY what to render — no guessing from the input image.
    let extraContext = '';
    if (analysis.productInfo) {
      extraContext += `\n\nPRODUCT IDENTITY: ${analysis.productInfo}`;
    }
    if (analysis.stateInfo) {
      extraContext += `\n\nEXACT STATE TO REPRODUCE (do not deviate): ${analysis.stateInfo} The product MUST appear in this exact state and orientation in the output. Do NOT open it if it is closed. Do NOT close it if it is open. Do NOT flip, fold, unfold, or change which side faces the camera.`;
    }
    if (analysis.featuresInfo) {
      extraContext += `\n\nVISIBLE FEATURES (reproduce ALL of these, and ONLY these — do not invent extras): ${analysis.featuresInfo}. Any feature not in this list must NOT appear in the output (no extra zippers, slots, pockets, hardware, or embellishments).`;
    }
    extraContext += `\n\nTAG REMOVAL (mandatory): Remove ALL retail tags, hangtags, price stickers, store labels, and any removable paper or plastic tag from the product, even if they are visible in the input image. The product must appear clean and ready-to-sell — no tags, no stickers, no dangling labels of any kind. Permanent embossed/printed brand logos that are part of the product itself must remain.`;
    if (analysis.strapInfo) {
      extraContext += `\n\nSTRAP/HANDLE ACCURACY: ${analysis.strapInfo}. Reproduce the EXACT colors, pattern, material, width, and attachment hardware. The pattern must be CONTINUOUS and UNBROKEN along the entire length. Show it in a natural, relaxed draping position. Do NOT simplify or alter it.`;
    } else {
      extraContext += `\n\nNO STRAP / NO CHAIN / NO WRISTLET (mandatory): This product has NO carrying strap, NO chain, NO handle, NO wristlet, NO lanyard, and NO shoulder strap of any kind. Do NOT add a chain, strap, handle, wristlet, lanyard, or any carrying accessory to the product. Any small metal pull tab on a zipper is JUST a zipper pull — it is NOT a chain and must NOT extend or connect to a chain. The product stands or rests on its own with no attached carrying piece.`;
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
