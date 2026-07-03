export function EmojiFloat({ emoji }) {
  return (
    <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-3xl float-emoji z-50">
      {emoji}
    </div>
  );
}
