"use client";

import Link from "next/link";
import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { pressable } from "@/lib/motion";
import { ThinkingDots } from "./ThinkingDots";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse";
export type ButtonSize = "lg" | "md" | "sm";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Content pushed to the right edge (arrow, mono hint). Left-aligns the label. */
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
};

const base =
  "relative inline-flex w-full select-none items-center gap-3 rounded-btn font-display font-medium tracking-[-0.01em] transition-colors disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-sel text-onsel",
  secondary: "border border-fg text-fg",
  ghost: "text-fg underline underline-offset-4 font-sans font-normal tracking-normal",
  /** For use on an inverted (bg-sel) surface. */
  inverse: "bg-onsel text-sel",
};

const sizes: Record<ButtonSize, string> = {
  lg: "h-14 px-5 text-[18px]",
  md: "h-[52px] px-5 text-[17px]",
  sm: "h-11 px-4 text-[15px]",
};

export function buttonClasses({
  variant = "primary",
  size = "lg",
  trailing,
  className,
}: Omit<CommonProps, "children">) {
  return cn(
    base,
    variants[variant],
    sizes[size],
    trailing ? "justify-between" : "justify-center",
    className,
  );
}

type ButtonProps = CommonProps &
  Omit<HTMLMotionProps<"button">, "children" | "className"> & {
    /** Locks the button, keeps its width and shows thinking dots. */
    pending?: boolean;
    pendingLabel?: ReactNode;
  };

export function Button({
  variant,
  size,
  trailing,
  className,
  children,
  pending = false,
  pendingLabel,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || pending;
  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      aria-busy={pending || undefined}
      {...(isDisabled ? {} : pressable)}
      className={buttonClasses({
        variant,
        size,
        trailing: pending ? undefined : trailing,
        className: cn(
          isDisabled && !pending && "opacity-40",
          pending && "cursor-progress",
          className,
        ),
      })}
      {...rest}
    >
      {pending ? (
        <>
          <ThinkingDots size={6} />
          <span>{pendingLabel ?? children}</span>
        </>
      ) : (
        <>
          <span>{children}</span>
          {trailing}
        </>
      )}
    </motion.button>
  );
}

const MotionLink = motion.create(Link);

type ButtonLinkProps = CommonProps &
  Omit<React.ComponentProps<typeof MotionLink>, "children" | "className">;

export function ButtonLink({
  variant,
  size,
  trailing,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <MotionLink
      {...pressable}
      className={buttonClasses({ variant, size, trailing, className })}
      {...rest}
    >
      <span>{children}</span>
      {trailing}
    </MotionLink>
  );
}

/** Mono hint used as a trailing element, e.g. "FREE →". */
export function ButtonHint({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-[0.12em]",
        muted && "text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function Arrow({ char = "→" }: { char?: string }) {
  return <span aria-hidden="true">{char}</span>;
}
