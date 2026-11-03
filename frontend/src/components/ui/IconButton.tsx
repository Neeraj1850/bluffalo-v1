"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { pressable } from "@/lib/motion";

const classes =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-btn border border-border text-fg";

const MotionLink = motion.create(Link);

type IconButtonProps = {
  label: string;
  children: ReactNode;
  className?: string;
} & ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

/** 44×44 square control: back arrows, steppers, close. */
export function IconButton({ label, children, className, href, onClick }: IconButtonProps) {
  if (href) {
    return (
      <MotionLink href={href} aria-label={label} className={cn(classes, className)} {...pressable}>
        {children}
      </MotionLink>
    );
  }
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(classes, className)}
      {...pressable}
    >
      {children}
    </motion.button>
  );
}
