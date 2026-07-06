import { motion, AnimatePresence } from 'framer-motion';

// Modo cine para el run-out de all-in: viñeta oscura en los bordes
// + banner "¡ALL-IN!" pulsante. La mesa queda como bajo un foco.
export function CinemaOverlay({ active }) {
  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Viñeta */}
          <motion.div
            key="vignette"
            className="absolute inset-0 pointer-events-none z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8 } }}
            transition={{ duration: 0.6 }}
            style={{
              background: 'radial-gradient(ellipse at 50% 42%, transparent 42%, rgba(0,0,0,0.55) 78%, rgba(0,0,0,0.8) 100%)',
            }}
          />
          {/* Banner ALL-IN */}
          <motion.div
            key="banner"
            className="absolute left-1/2 top-[16%] -translate-x-1/2 pointer-events-none z-30"
            initial={{ opacity: 0, scale: 0.6, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <motion.div
              animate={{
                textShadow: [
                  '0 0 12px rgba(239,68,68,0.7)',
                  '0 0 28px rgba(239,68,68,1)',
                  '0 0 12px rgba(239,68,68,0.7)',
                ],
                scale: [1, 1.04, 1],
              }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              className="text-4xl font-black tracking-[0.25em] text-red-500"
              style={{ WebkitTextStroke: '1px rgba(255,255,255,0.25)' }}
            >
              ¡ALL-IN!
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
