// Íconos de la app instalable (PWA). Uso: node scripts/generar-iconos.mjs
// Fondo azul marino a sangre (sirve como «maskable»: Android lo recorta en
// círculo o squircle) y el monograma dentro de la zona segura central (80 %).
import sharp from "sharp";

const MARINO = "#1c2a6b";
const ROJO = "#c8102e";

function svg({ tamano, escala = 1, redondeado = false }) {
  const t = tamano;
  const c = t / 2;
  const fuente = t * 0.42 * escala;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${t}" viewBox="0 0 ${t} ${t}">
  <rect width="${t}" height="${t}" rx="${redondeado ? t * 0.22 : 0}" fill="${MARINO}"/>
  <text x="${c}" y="${c + fuente * 0.3}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-weight="900" font-style="italic" font-size="${fuente}" letter-spacing="${-fuente * 0.04}" fill="#ffffff">Oa</text>
  <rect x="${c - fuente * 0.62}" y="${c + fuente * 0.5}" width="${fuente * 1.24}" height="${fuente * 0.11}" rx="${fuente * 0.055}" fill="${ROJO}"/>
</svg>`;
}

const salidas = [
  ["public/iconos/icono-192.png", { tamano: 192 }],
  ["public/iconos/icono-512.png", { tamano: 512 }],
  // Maskable: monograma más chico para que entre en la zona segura.
  ["public/iconos/icono-maskable-512.png", { tamano: 512, escala: 0.8 }],
  ["public/iconos/apple-touch-icon.png", { tamano: 180 }],
  ["public/iconos/icono-96.png", { tamano: 96 }],
];
for (const [ruta, opciones] of salidas) {
  await sharp(Buffer.from(svg(opciones))).png().toFile(ruta);
  console.log("✓", ruta);
}
