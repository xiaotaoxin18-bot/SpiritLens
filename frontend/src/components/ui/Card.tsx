"use client";

import { cn } from "@/lib/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  glow?: boolean;
  onClick?: () => void;
}

export function Card({ className, children, hover = false, glow = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "glass rounded-card p-5 transition-all duration-300",
        hover && "glass-hover cursor-pointer",
        glow && "animate-glow-pulse",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mb-3", className)}>{children}</div>;
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn(className)}>{children}</div>;
}
