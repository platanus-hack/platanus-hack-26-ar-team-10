"use client";

import { motion, useReducedMotion } from "motion/react";

const story = [
  { step: "1", title: "Tool call captured" },
  { step: "2", title: "Candidate classified" },
  { step: "3", title: "Policy checks run" },
  { step: "4", title: "Verdict returned" },
];

export function AnimatedDemoStory() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {story.map((item, index) => (
        <motion.article
          key={item.step}
          className="cinematic-card relative overflow-hidden rounded-md border border-white/10 bg-white/[0.04] p-3 sm:p-4"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
          transition={{
            duration: 0.58,
            delay: index * 0.09,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <span className="absolute left-0 top-4 h-8 w-px bg-[var(--acid)] opacity-70" />
          <h3 className="font-mono text-[11px] leading-5 text-white sm:text-sm">
            {item.step}. {item.title}
          </h3>
        </motion.article>
      ))}
    </div>
  );
}
