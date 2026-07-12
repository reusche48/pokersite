import { useState, useRef, useEffect } from 'react';
import { EmotePanel } from './EmotePanel';

export function ChatBox({ chat, onSend, onEmote, onReaction }) {
  const [text, setText] = useState('');
  const [showEmotes, setShowEmotes] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Dealer / chat log */}
      <div className="flex-1 overflow-y-auto chat-scroll p-2 space-y-0.5">
        {chat.map((msg, i) => (
          <div key={i} className={`text-[11px] leading-relaxed ${
            msg.type === 'dealer' ? 'text-yellow-600'
            : msg.type === 'emote' ? 'text-yellow-300 italic'
            : 'text-gray-400'
          }`}>
            {msg.type === 'dealer' ? (
              <><span className="text-yellow-700 font-semibold">Dealer:</span> {msg.text}</>
            ) : (
              <><span className="text-gray-300 font-semibold">{msg.nickname}:</span> {msg.text}</>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showEmotes && (
        <div className="absolute bottom-10 left-0 right-0 p-2 bg-gray-900/95 border-t border-gray-700 z-20">
          <EmotePanel onEmote={t => { onEmote(t); setShowEmotes(false); }} onReaction={e => { onReaction(e); setShowEmotes(false); }} />
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-1 p-1.5 border-t border-gray-800">
        <button
          type="button"
          onClick={() => setShowEmotes(s => !s)}
          className="text-sm flex-shrink-0 hover:scale-110 transition-transform"
        >😊</button>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Escribe aquí..."
          maxLength={200}
          aria-label="Mensaje de chat"
          className="flex-1 min-w-0 bg-black/50 text-gray-300 text-[11px] px-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-green-600"
        />
        <button
          type="submit"
          className="flex-shrink-0 bg-green-800 hover:bg-green-700 text-white text-[10px] px-2 py-1 rounded font-semibold"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
