import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

export function AnimatedNumber({ value, prefix = '', className = '' }) {
  const mv = useMotionValue(value || 0);
  const display = useTransform(mv, v => `${prefix}${Math.round(v).toLocaleString()}`);

  useEffect(() => {
    const controls = animate(mv, value || 0, { duration: 0.6, ease: 'easeOut' });
    return controls.stop;
  }, [value]);

  return <motion.span className={className}>{display}</motion.span>;
}
