"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

type TypewriterHeroTitleProps = {
  text: string;
  lines?: string[];
  className?: string;
  speedMs?: number;
  startDelayMs?: number;
};

export function TypewriterHeroTitle({
  text,
  lines,
  className = "",
  speedMs = 52,
  startDelayMs = 420,
}: TypewriterHeroTitleProps) {
  const reduceMotion = useReducedMotion();
  const [visibleCharacters, setVisibleCharacters] = useState(0);
  const displayLines = lines ?? [text];
  const serializedText = displayLines.join("\n");

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setVisibleCharacters((current) => {
          if (current >= serializedText.length) {
            if (intervalId !== undefined) {
              window.clearInterval(intervalId);
            }
            return current;
          }

          return current + 1;
        });
      }, speedMs);
    }, startDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [reduceMotion, serializedText, speedMs, startDelayMs]);

  const effectiveCharacters = reduceMotion
    ? serializedText.length
    : visibleCharacters;
  const typedLines = serializedText.slice(0, effectiveCharacters).split("\n");
  const isComplete = effectiveCharacters >= serializedText.length;
  const caretLineIndex = isComplete
    ? displayLines.length - 1
    : Math.min(typedLines.length - 1, displayLines.length - 1);
  const safeWord = "coding";

  function renderLineWithSafeMarker(value: string, revealed: boolean) {
    const safeIndex = value.indexOf(safeWord);

    if (safeIndex === -1) {
      return value;
    }

    return (
      <>
        {value.slice(0, safeIndex)}
        <span className="hero-safe-word">
          {safeWord}
          <span
            className="hero-safe-marker"
            aria-hidden="true"
            data-revealed={revealed ? "true" : "false"}
          >
            <span className="hero-safe-label">SAFE</span>
            <svg
              className="hero-safe-arrow"
              viewBox="0 0 120 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                className="hero-safe-arrow-path"
                d="M 6 14 C 32 6, 62 28, 92 66"
              />
              <path
                className="hero-safe-arrow-head"
                d="M 74 56 L 92 66 L 84 46"
              />
            </svg>
          </span>
        </span>
        {value.slice(safeIndex + safeWord.length)}
      </>
    );
  }

  function renderTypedLine(line: string, value: string, revealed: boolean) {
    if (!line.includes(safeWord) || !value.includes(safeWord)) {
      return value;
    }

    return renderLineWithSafeMarker(value, revealed);
  }

  return (
    <motion.h1
      aria-label={text}
      className={`hero-typewriter ${className}`}
      initial={reduceMotion ? false : { opacity: 0.92, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="hero-typewriter-layout" aria-hidden="true">
        {displayLines.map((line) => (
          <span
            key={line}
            className={`hero-typewriter-line ${line.includes("coding") ? "hero-safe-line" : ""}`}
          >
            {renderLineWithSafeMarker(line, false)}
          </span>
        ))}
      </span>
      <span className="hero-typewriter-copy" aria-hidden="true">
        {displayLines.map((line, index) => (
          <span
            key={line}
            className={`hero-typewriter-line ${line.includes("coding") ? "hero-safe-line" : ""}`}
          >
            {renderTypedLine(line, typedLines[index] ?? "", isComplete)}
            {index === caretLineIndex ? (
              <span
                className="hero-typewriter-caret"
                data-complete={isComplete ? "true" : undefined}
              />
            ) : null}
          </span>
        ))}
      </span>
    </motion.h1>
  );
}
