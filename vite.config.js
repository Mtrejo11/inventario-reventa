import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
            const { image } = JSON.parse(body || '{}');
            if (!image?.startsWith?.('data:image/')) {
              res.statusCode = 400;
              res.setHeader('content-type', 'application/json');
              return res.end(JSON.stringify({ error: 'image inválida' }));
            }
            const mediaType = image.substring(5, image.indexOf(';'));
            const base64 = image.split(',')[1];
            const PROMPT = `Eres un experto en reventa en Poshmark, Mercari, eBay y FB Marketplace, de ítems comprados en Ross, Marshalls, Burlington, TJ Maxx.

Analiza la foto EN DETALLE: producto, logos, etiqueta (marca, código, precio sticker, Compare at/MSRP), correas, cierres, condición.

Devuelve SOLO un JSON válido, sin markdown:

{
  "name": "nombre descriptivo en español",
  "brand": "marca exacta o ''",
  "model": "modelo/código o ''",
  "category": "cartera|ropa|zapatos|accesorios|otro",
  "color": "color principal",
  "material": "material estimado o ''",
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

Reglas de suggested_sale_price (basado en datos reales de reventa, no un % fijo):
- Luxury/designer (Coach, MK, Kate Spade, Tory Burch, Marc Jacobs): 40-65% del MSRP si NWT
- Premium (Tommy Hilfiger, Calvin Klein, Guess, Nine West, Steve Madden): 35-55% del MSRP
- Mid/fast fashion: 20-40% del MSRP
- Sin marca reconocida: precio tienda + pequeño margen
- Si no hay MSRP pero sí tag_price: +50-120% sobre tag_price según marca
- Carteras/bolsas mantienen valor mejor que ropa
- "Nuevo con etiqueta" = tope del rango; "Buena"/"Usado" = -30-50%
- Redondea a .99, .95 o entero

Si no puedes leer algo con seguridad, pon '' o null. No inventes.`;
            const r = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 1200,
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                    { type: 'text', text: PROMPT },
                  ],
                }],
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
    plugins: [react(), devAnalyze(env)],
    server: { port: 5173 },
  };
});
