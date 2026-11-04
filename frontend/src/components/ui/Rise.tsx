"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ease, spring } from "@/lib/motion";

type RiseProps = {
  children: ReactNode;
  delay?: number;
  /** Distance travelled upward, px. */
  distance?: number;
  /** "spring" for headlines, "ease" for supporting text. */
  feel?: "spring" | "ease";
  as?: "div" | "h1" | "p" | "section" | "header";
  className?: string;
  id?: string;
};

/** Fade in while rising into place. Used for headlines and blocks on entry. */
export function Rise({
  children,
  delay = 0,
  distance = 20,
  feel = "ease",
  as = "div",
  className,
  id,
}: RiseProps) {
  const Tag = motion[as];
  return (
    <Tag
      id={id}
      className={className}
      initial={{ opacity: 0, y: distance }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        feel === "spring"
          ? { ...spring.pop, delay }
          : { duration: 0.5, ease: ease.soft, delay }
      }
    >
      {children}
    </Tag>
  );
}
