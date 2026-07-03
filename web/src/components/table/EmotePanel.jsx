const EMOTES = ['GG', 'Nice hand!', 'Oops!', 'Tanking...', 'Lucky!', '😤', '🤔', '😂'];
const EMOJI_REACTIONS = ['👏', '🔥', '😎', '💀', '🤑', '😱'];

export function EmotePanel({ onEmote, onReaction }) {
  return (
    <div className="bg-gray-800 rounded-xl p-3 space-y-2">
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Emotes</p>
      <div className="flex flex-wrap gap-1">
        {EMOTES.map(e => (
          <button
            key={e}
            onClick={() => onEmote(e)}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded-lg transition-colors"
          >
            {e}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider pt-1">Reacciones</p>
      <div className="flex flex-wrap gap-1">
        {EMOJI_REACTIONS.map(e => (
          <button
            key={e}
            onClick={() => onReaction(e)}
            className="text-xl hover:scale-125 transition-transform"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
