// Íconos de la app instalable (PWA) y favicon. Uso: node scripts/generar-iconos.mjs
// Fondo azul marino a sangre (sirve como «maskable»: Android lo recorta en
// círculo o squircle) y el monograma dentro de la zona segura central (80 %).
import { writeFileSync } from "node:fs";
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
// Insignia de la barra de notificaciones de Android: blanca sobre transparente.
const insignia = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <text x="48" y="60" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-weight="900" font-style="italic" font-size="50" letter-spacing="-2" fill="#ffffff">Oa</text>
  <rect x="20" y="70" width="56" height="6" rx="3" fill="#ffffff"/>
</svg>`;
await sharp(Buffer.from(insignia)).png().toFile("public/iconos/insignia-96.png");
console.log("✓ public/iconos/insignia-96.png");

for (const [ruta, opciones] of salidas) {
  await sharp(Buffer.from(svg(opciones))).png().toFile(ruta);
  console.log("✓", ruta);
}

// Favicon de la pestaña: el mismo monograma con esquinas redondeadas, en
// 16, 32 y 48 px dentro de un .ico (cada tamaño va como PNG, que todos los
// navegadores actuales leen). Next lo publica solo desde src/app/favicon.ico.
const tamanosFavicon = [16, 32, 48];
const pngs = await Promise.all(tamanosFavicon.map((t) => sharp(Buffer.from(svg({ tamano: t, escala: 1.38, redondeado: true }))).png().toBuffer()));
const cabecera = Buffer.alloc(6 + 16 * pngs.length);
cabecera.writeUInt16LE(0, 0); // reservado
cabecera.writeUInt16LE(1, 2); // tipo: ícono
cabecera.writeUInt16LE(pngs.length, 4);
let desplazamiento = cabecera.length;
pngs.forEach((png, i) => {
  const e = 6 + 16 * i;
  cabecera.writeUInt8(tamanosFavicon[i], e); // ancho
  cabecera.writeUInt8(tamanosFavicon[i], e + 1); // alto
  cabecera.writeUInt8(0, e + 2); // sin paleta
  cabecera.writeUInt8(0, e + 3);
  cabecera.writeUInt16LE(1, e + 4); // planos
  cabecera.writeUInt16LE(32, e + 6); // bits por píxel
  cabecera.writeUInt32LE(png.length, e + 8);
  cabecera.writeUInt32LE(desplazamiento, e + 12);
  desplazamiento += png.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([cabecera, ...pngs]));
console.log("✓ src/app/favicon.ico");
