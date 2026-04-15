# Inventario de Reventa

App de inventario para reventa de productos comprados en Ross, Marshalls, Burlington y similares. Detecta automáticamente los datos del producto desde la foto usando **Claude Vision**.

**Stack:** React + Vite + Bun · Supabase (Postgres + Storage, nueva API con publishable keys) · Vercel (hosting + serverless API) — todo en free tier.

## Funcionalidades

- 📸 Subir foto → Claude detecta tipo, marca, color y condición
- ➕ Agregar / editar productos con precio de compra, precio de venta, tienda, notas
- 💰 Cálculo automático de ganancia y margen
- 📊 Dashboard con stats: invertido, valor potencial, ganancia real + potencial
- 🔍 Filtros por categoría, tienda, estado (disponible/vendido) y buscador
- ✅ Marcar como vendido con precio real, fecha y comparación vs. estimado
- ☁️ Persistencia en Supabase (accesible desde cualquier dispositivo)

---

## 1. Setup local

Requisitos: [Bun](https://bun.sh) instalado.

```bash
cd inventario-reventa
bun install
cp .env.example .env
# Llena .env con tus credenciales (ver pasos 2 y 3)
bun run dev
```

Abre http://localhost:5173

> Para probar la detección de fotos en local necesitas Vercel CLI (`bun add -g vercel && vercel dev`) porque `/api/analyze` es una serverless function. Sin eso, la app funciona pero el auto-fill de foto no responderá en desarrollo (sí funciona en producción).

---

## 2. Supabase (gratis)

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo (free tier).
2. En **SQL Editor**, pega y corre el contenido de `supabase/schema.sql`. Crea la tabla `products` con RLS abierto (app de uso personal).
3. En **Storage** → **New bucket** crea un bucket llamado `product-photos` y márcalo como **Public**.
   - En el mismo bucket → **Policies**, agrega:
     - Policy "Allow public read" → `SELECT` → `true`
     - Policy "Allow anon uploads" → `INSERT` → `true`
     - Policy "Allow anon deletes" → `DELETE` → `true`
4. Ve a **Project Settings → API Keys** (pestaña "Publishable and secret API keys") y copia:
   - `Project URL` (en Settings → Data API) → `VITE_SUPABASE_URL`
   - **Publishable key** (empieza con `sb_publishable_...`) → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - ⚠️ NO uses el **Secret key** (`sb_secret_...`) ni lo pongas en el cliente. La publishable es la que va en el navegador (reemplaza a la antigua `anon` key).

---

## 3. Clave de Claude API

1. Ve a [console.anthropic.com](https://console.anthropic.com) y crea una API Key.
2. Guarda la clave como `ANTHROPIC_API_KEY` (se usa solo en el servidor, nunca en el cliente).

---

## 4. Deploy a Vercel

### Opción A — con Vercel CLI

```bash
bun add -g vercel
cd inventario-reventa
vercel
# Sigue el wizard. Cuando termine:
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

### Opción B — desde el Dashboard de Vercel

1. Sube el proyecto a GitHub (público o privado).
2. En [vercel.com](https://vercel.com) → **New Project** → importa tu repo.
3. Framework preset: **Vite** (se detecta solo por `vercel.json`).
4. En **Environment Variables**, agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `ANTHROPIC_API_KEY`
5. Deploy.

Tu app quedará en `https://<tu-proyecto>.vercel.app`.

---

## Estructura

```
inventario-reventa/
├── api/
│   └── analyze.js           # Serverless: proxy a Claude Vision (oculta la API key)
├── src/
│   ├── components/          # Header, Stats, Filters, ProductGrid, ProductCard, modals
│   ├── lib/
│   │   ├── api.js           # Cliente Supabase + llamada a /api/analyze
│   │   └── utils.js         # Helpers (dinero, fechas, conversión imagen)
│   ├── supabase.js          # Cliente Supabase
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── supabase/
│   └── schema.sql           # Tabla products + políticas RLS
├── public/favicon.svg
├── index.html
├── vite.config.js
├── vercel.json              # Build con bun, rewrites para SPA
├── package.json
├── .env.example
└── .gitignore
```

## Notas

- **Costo:** todo free tier mientras no pases los límites de Supabase (500MB DB + 1GB storage) ni hagas miles de análisis de foto con Claude al mes.
- **Seguridad:** la `ANTHROPIC_API_KEY` NUNCA se expone al navegador. Se usa solo en `api/analyze.js` (serverless function).
- **RLS:** las políticas de Supabase son abiertas para uso personal. Si vas a exponerla a más gente, agrega **Supabase Auth** y cambia las policies a `auth.uid() = user_id`.
