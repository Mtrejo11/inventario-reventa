// Fondos procedurales dibujados en canvas. Cada uno recibe (ctx, w, h)
// y pinta un fondo cuadrado listo para que se le componga el producto encima.
//
// Metadata por preset:
//   label: nombre visible
//   palette: color/gradiente principal (para thumbnail)
//   shadowColor: color de la sombra del producto
//   shadowAlpha: 0..1
//   productScale: cuánto del lienzo ocupa el producto (0.55-0.85)
//   tag: etiqueta corta para la UI

const PRESETS = {
  'studio-white': {
    label: 'Estudio blanco',
    tag: 'Minimalista',
    shadowColor: 'rgba(0,0,0,0.22)',
    productScale: 0.72,
    draw: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.1, w / 2, h / 2, w * 0.85);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, '#f3f4f7');
      g.addColorStop(1, '#dfe1e7');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },

  'studio-warm': {
    label: 'Estudio cálido',
    tag: 'Neutro',
    shadowColor: 'rgba(90,60,30,0.22)',
    productScale: 0.72,
    draw: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.1, w / 2, h / 2, w * 0.85);
      g.addColorStop(0, '#fdf6ec');
      g.addColorStop(0.6, '#f1e6d3');
      g.addColorStop(1, '#d8c6ab');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },

  'pink-pastel': {
    label: 'Rosa pastel',
    tag: 'Fashion',
    shadowColor: 'rgba(120,30,70,0.20)',
    productScale: 0.68,
    draw: (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#fde2ec');
      g.addColorStop(0.5, '#f9cfd9');
      g.addColorStop(1, '#f1b5c6');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Vignette sutil
      const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
      v.addColorStop(0, 'rgba(255,255,255,0)');
      v.addColorStop(1, 'rgba(180,80,110,0.18)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    },
  },

  'lilac-premium': {
    label: 'Lila premium',
    tag: 'Elegante',
    shadowColor: 'rgba(60,30,110,0.28)',
    productScale: 0.70,
    draw: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.4, w * 0.1, w * 0.5, h * 0.5, w * 0.85);
      g.addColorStop(0, '#e8deff');
      g.addColorStop(0.5, '#c9b6f0');
      g.addColorStop(1, '#8b6edc');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },

  'marble': {
    label: 'Mármol',
    tag: 'Lujo',
    shadowColor: 'rgba(30,30,40,0.25)',
    productScale: 0.70,
    draw: (ctx, w, h) => {
      // Base blanco roto
      ctx.fillStyle = '#f5f2ec';
      ctx.fillRect(0, 0, w, h);
      // Veteados: varias curvas bezier con baja opacidad
      const veinColors = ['rgba(120,120,130,0.18)', 'rgba(90,85,95,0.14)', 'rgba(160,150,140,0.16)'];
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = veinColors[i % veinColors.length];
        ctx.lineWidth = 1 + Math.random() * 2.5;
        ctx.beginPath();
        const y = Math.random() * h;
        ctx.moveTo(-10, y + Math.random() * 60);
        ctx.bezierCurveTo(
          w * 0.3, y + (Math.random() - 0.5) * 180,
          w * 0.6, y + (Math.random() - 0.5) * 180,
          w + 10, y + (Math.random() - 0.5) * 120
        );
        ctx.stroke();
      }
      // Suavizado con gradiente sobre todo
      const g = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.2, w / 2, h / 2, w);
      g.addColorStop(0, 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },

  'wood': {
    label: 'Madera clara',
    tag: 'Lifestyle',
    shadowColor: 'rgba(70,40,20,0.30)',
    productScale: 0.68,
    draw: (ctx, w, h) => {
      // Base madera tan cálido
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#e6c79a');
      g.addColorStop(1, '#c99f6a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Vetas horizontales con ruido
      for (let i = 0; i < 60; i++) {
        const y = (i / 60) * h + (Math.random() - 0.5) * 5;
        ctx.strokeStyle = `rgba(80,50,20,${0.05 + Math.random() * 0.08})`;
        ctx.lineWidth = 1 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x < w; x += 20) {
          ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 1.5);
        }
        ctx.stroke();
      }
      // Vignette cálido
      const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
      v.addColorStop(0, 'rgba(255,220,180,0.15)');
      v.addColorStop(1, 'rgba(60,30,10,0.25)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    },
  },

  'charcoal': {
    label: 'Negro elegante',
    tag: 'Premium',
    shadowColor: 'rgba(0,0,0,0.55)',
    productScale: 0.70,
    draw: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.4, w * 0.1, w * 0.5, h * 0.5, w * 0.9);
      g.addColorStop(0, '#2a2d36');
      g.addColorStop(0.6, '#15171d');
      g.addColorStop(1, '#07080b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Rim light sutil arriba
      const rim = ctx.createLinearGradient(0, 0, 0, h * 0.4);
      rim.addColorStop(0, 'rgba(255,255,255,0.06)');
      rim.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, w, h * 0.4);
    },
  },

  'mint-soft': {
    label: 'Menta suave',
    tag: 'Fresco',
    shadowColor: 'rgba(20,60,50,0.22)',
    productScale: 0.70,
    draw: (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#d7f0e3');
      g.addColorStop(0.5, '#b9e2d1');
      g.addColorStop(1, '#8cc8b2');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const v = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.25, w / 2, h / 2, w * 0.8);
      v.addColorStop(0, 'rgba(255,255,255,0.25)');
      v.addColorStop(1, 'rgba(10,50,40,0.15)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    },
  },
};

export const PRESET_KEYS = Object.keys(PRESETS);
export function getPreset(key) {
  return PRESETS[key] || PRESETS['studio-white'];
}
export function getAllPresets() {
  return PRESET_KEYS.map(k => ({ key: k, ...PRESETS[k] }));
}
