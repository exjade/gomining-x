import { motion, useScroll, useSpring } from 'framer-motion';

export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    restDelta: 0.001,
  });

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none h-[2.5px] bg-white/[0.03]">
      <motion.div
        className="h-full bg-gradient-to-r from-white via-purple-400 to-white origin-left shadow-[0_0_12px_rgba(168,85,247,0.7)]"
        style={{ scaleX }}
        aria-hidden="true"
      />
    </div>
  );
}
