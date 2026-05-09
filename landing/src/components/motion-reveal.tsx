"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

type MotionRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  immediate?: boolean;
  y?: number;
};

export function MotionReveal({
  children,
  className,
  delay = 0,
  immediate = false,
  y = 28,
}: MotionRevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion || immediate ? false : { opacity: 0, y }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px -10% 0px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
