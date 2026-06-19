import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function buttonVariants(variant: "primary" | "secondary" | "outline" | "ghost" | "danger" = "primary") {
  const base =
    "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium tracking-normal shadow-sm transition-all disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    primary: "bg-zinc-950 text-white hover:bg-zinc-800 hover:shadow",
    secondary: "bg-teal-700 text-white hover:bg-teal-800 hover:shadow",
    outline: "border border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50",
    ghost: "bg-transparent text-zinc-700 shadow-none hover:bg-zinc-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700 hover:shadow",
  };
  return cn(base, variants[variant]);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return <button className={cn(buttonVariants(variant), className)} {...props} />;
}
