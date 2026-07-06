// Opciones curadas del avatar DiceBear "avataaars" para el editor de perfil.
// Los colores son hex SIN '#', como los espera DiceBear.

export const SKIN_COLORS = ['ffdbb4', 'edb98a', 'fd9841', 'fdb141', 'd08b5b', 'ae5d29', '614335'];
export const HAIR_COLORS = ['2c1b18', '4a312c', '724133', 'a55728', 'b58143', 'd6b370', 'c93305', 'e8e1e1', 'ecdcbf', 'f59797'];
export const CLOTHES_COLORS = ['262e33', '3c4f5c', '5199e4', '25557c', '65c9ff', '929598', 'e6e6e6', 'ff488e', 'ff5c5c', 'ffafb9', 'ffffb1', 'a7ffc4', 'b1e2ff', 'ffffff'];
export const BG_COLORS = ['transparent', 'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', '1b5e20', '350c11'];

// Listas con etiqueta legible en español
export const TOPS = [
  { v: 'shortFlat', l: 'Corto liso' }, { v: 'shortCurly', l: 'Corto rizado' },
  { v: 'shortWaved', l: 'Corto ondulado' }, { v: 'theCaesar', l: 'César' },
  { v: 'shortRound', l: 'Corto redondo' }, { v: 'sides', l: 'Rapado a los lados' },
  { v: 'dreads01', l: 'Rastas' }, { v: 'fro', l: 'Afro' }, { v: 'froBand', l: 'Afro con banda' },
  { v: 'bob', l: 'Bob' }, { v: 'bun', l: 'Moño' }, { v: 'curly', l: 'Rizado largo' },
  { v: 'curvy', l: 'Ondulado largo' }, { v: 'straight01', l: 'Lacio largo' },
  { v: 'longButNotTooLong', l: 'Media melena' }, { v: 'miaWallace', l: 'Flequillo' },
  { v: 'bigHair', l: 'Melenón' }, { v: 'frida', l: 'Trenzas' },
  { v: 'hat', l: 'Sombrero' }, { v: 'turban', l: 'Turbante' }, { v: 'winterHat02', l: 'Gorro' },
];
export const EYES = [
  { v: 'default', l: 'Normal' }, { v: 'happy', l: 'Felices' }, { v: 'wink', l: 'Guiño' },
  { v: 'squint', l: 'Entornados' }, { v: 'surprised', l: 'Sorprendido' },
  { v: 'hearts', l: 'Corazones' }, { v: 'side', l: 'De reojo' }, { v: 'closed', l: 'Cerrados' },
  { v: 'cry', l: 'Lágrima' }, { v: 'eyeRoll', l: 'Ojos en blanco' },
];
export const MOUTHS = [
  { v: 'smile', l: 'Sonrisa' }, { v: 'default', l: 'Normal' }, { v: 'serious', l: 'Serio' },
  { v: 'twinkle', l: 'Pícaro' }, { v: 'tongue', l: 'Lengua' }, { v: 'grimace', l: 'Mueca' },
  { v: 'eating', l: 'Comiendo' }, { v: 'screamOpen', l: 'Gritando' }, { v: 'sad', l: 'Triste' },
];
export const FACIAL_HAIR = [
  { v: 'none', l: 'Sin vello' }, { v: 'beardLight', l: 'Barba ligera' },
  { v: 'beardMedium', l: 'Barba media' }, { v: 'beardMajestic', l: 'Barbón' },
  { v: 'moustacheFancy', l: 'Bigote fino' }, { v: 'moustacheMagnum', l: 'Bigotazo' },
];
export const ACCESSORIES = [
  { v: 'none', l: 'Ninguno' }, { v: 'prescription02', l: 'Lentes' }, { v: 'round', l: 'Lentes redondos' },
  { v: 'sunglasses', l: 'Gafas de sol' }, { v: 'wayfarers', l: 'Wayfarer' }, { v: 'eyepatch', l: 'Parche' },
];
export const CLOTHING = [
  { v: 'hoodie', l: 'Hoodie' }, { v: 'shirtCrewNeck', l: 'Camiseta' },
  { v: 'shirtVNeck', l: 'Cuello en V' }, { v: 'collarAndSweater', l: 'Suéter con cuello' },
  { v: 'blazerAndShirt', l: 'Saco y camisa' }, { v: 'blazerAndSweater', l: 'Saco y suéter' },
  { v: 'graphicShirt', l: 'Estampada' }, { v: 'overall', l: 'Overol' },
];

// Estado por defecto del editor
export const DEFAULT_LOOK = {
  skinColor: 'edb98a', top: 'shortFlat', hairColor: '2c1b18',
  eyes: 'default', mouth: 'smile', facialHair: 'none', accessories: 'none',
  clothing: 'hoodie', clothesColor: '3c4f5c', backgroundColor: 'b6e3f4',
};

// Convierte el estado del editor a config de DiceBear (cada opción va como array)
export function lookToConfig(look) {
  return {
    skinColor: [look.skinColor],
    top: [look.top],
    hairColor: [look.hairColor],
    eyes: [look.eyes],
    mouth: [look.mouth],
    clothing: [look.clothing],
    clothesColor: [look.clothesColor],
    backgroundColor: [look.backgroundColor],
    facialHair: look.facialHair === 'none' ? [] : [look.facialHair],
    facialHairProbability: look.facialHair === 'none' ? 0 : 100,
    accessories: look.accessories === 'none' ? [] : [look.accessories],
    accessoriesProbability: look.accessories === 'none' ? 0 : 100,
  };
}

// Lee una config guardada de vuelta al estado del editor
export function configToLook(cfg = {}) {
  const g = (k, d) => (Array.isArray(cfg[k]) && cfg[k][0]) || d;
  return {
    skinColor: g('skinColor', DEFAULT_LOOK.skinColor),
    top: g('top', DEFAULT_LOOK.top),
    hairColor: g('hairColor', DEFAULT_LOOK.hairColor),
    eyes: g('eyes', DEFAULT_LOOK.eyes),
    mouth: g('mouth', DEFAULT_LOOK.mouth),
    clothing: g('clothing', DEFAULT_LOOK.clothing),
    clothesColor: g('clothesColor', DEFAULT_LOOK.clothesColor),
    backgroundColor: g('backgroundColor', DEFAULT_LOOK.backgroundColor),
    facialHair: (cfg.facialHairProbability === 0 || !cfg.facialHair?.length) ? 'none' : cfg.facialHair[0],
    accessories: (cfg.accessoriesProbability === 0 || !cfg.accessories?.length) ? 'none' : cfg.accessories[0],
  };
}

export function randomLook() {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const pv = arr => pick(arr).v;
  return {
    skinColor: pick(SKIN_COLORS), top: pv(TOPS), hairColor: pick(HAIR_COLORS),
    eyes: pv(EYES), mouth: pv(MOUTHS), facialHair: pv(FACIAL_HAIR), accessories: pv(ACCESSORIES),
    clothing: pv(CLOTHING), clothesColor: pick(CLOTHES_COLORS), backgroundColor: pick(BG_COLORS),
  };
}
