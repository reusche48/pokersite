// Registro de estilos de avatar (colecciones DiceBear, todas open-source).
// La clave se guarda en avatar_config._style; el Avatar elige la colección.
import {
  avataaars, bottts, funEmoji, adventurer, bigSmile, micah,
  openPeeps, personas, lorelei, pixelArt, notionists, toonHead,
  miniavs, croodles, thumbs,
} from '@dicebear/collection';

export const AVATAR_STYLES = [
  { key: 'avataaars', label: '🙂 Cara personalizable', collection: avataaars },
  { key: 'bottts', label: '🤖 Robot', collection: bottts },
  { key: 'funEmoji', label: '😄 Emoji', collection: funEmoji },
  { key: 'adventurer', label: '🧝 Aventurero', collection: adventurer },
  { key: 'bigSmile', label: '😁 Sonriente', collection: bigSmile },
  { key: 'micah', label: '🎨 Ilustrado', collection: micah },
  { key: 'openPeeps', label: '✏️ Boceto', collection: openPeeps },
  { key: 'personas', label: '👤 Persona', collection: personas },
  { key: 'lorelei', label: '🌸 Anime', collection: lorelei },
  { key: 'notionists', label: '📝 Estilo Notion', collection: notionists },
  { key: 'toonHead', label: '📺 Caricatura', collection: toonHead },
  { key: 'miniavs', label: '🧩 Mini', collection: miniavs },
  { key: 'croodles', label: '🖍️ Doodle', collection: croodles },
  { key: 'pixelArt', label: '👾 Pixel', collection: pixelArt },
  { key: 'thumbs', label: '👍 Pulgar', collection: thumbs },
];

export const STYLE_MAP = Object.fromEntries(AVATAR_STYLES.map(s => [s.key, s.collection]));

// Estilos "divertidos" para repartir entre los bots (excluye avataaars, que es la base humana)
export const BOT_STYLE_KEYS = [
  'bottts', 'funEmoji', 'adventurer', 'bigSmile', 'micah',
  'openPeeps', 'personas', 'lorelei', 'notionists', 'toonHead', 'miniavs', 'croodles',
];
