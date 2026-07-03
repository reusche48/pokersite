import { motion } from 'framer-motion';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import { useMemo } from 'react';

const AVATAR_STATES = {
  idle: { scale: [1, 1.02, 1], transition: { duration: 3, repeat: Infinity } },
  thinking: { rotate: [-2, 2, -2], transition: { duration: 0.4, repeat: Infinity } },
  won: { y: [-6, 0, -6], transition: { duration: 0.4, repeat: 3 } },
  folded: { opacity: 0.4, scale: 0.9 },
  all_in: { scale: [1, 1.06, 1], transition: { duration: 0.25, repeat: Infinity } },
};

export function Avatar({ nickname, avatarConfig = {}, state = 'idle', size = 32 }) {
  const seed = nickname || 'default';
  const svg = useMemo(() => createAvatar(avataaars, {
    seed,
    ...avatarConfig,
    size: 64,
  }).toString(), [seed]);

  return (
    <motion.div
      className="rounded-full overflow-hidden border border-gray-500 bg-gray-700 flex-shrink-0"
      style={{ width: size, height: size }}
      animate={AVATAR_STATES[state] || AVATAR_STATES.idle}
    >
      <div
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ width: size, height: size }}
        className="[&>svg]:w-full [&>svg]:h-full"
      />
    </motion.div>
  );
}
