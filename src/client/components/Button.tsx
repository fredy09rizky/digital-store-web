import { forwardRef } from "react";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "compact";
type Size = "sm" | "md" | "lg";

export interface ButtonStyleProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  icon?: ComponentType<{ className?: string; size?: number }>;
  iconRight?: ComponentType<{ className?: string; size?: number }>;
  className?: string;
  children?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-danger",
  compact: "btn-compact",
};

const sizeClass: Record<Size, string> = {
  sm: "text-xs px-3 min-h-[32px]",
  md: "",
  lg: "text-base px-5 min-h-[44px]",
};

function buildClass(p: ButtonStyleProps) {
  return [
    variantClass[p.variant ?? "primary"],
    p.size ? sizeClass[p.size] : "",
    p.block ? "w-full" : "",
    p.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ButtonProps = ButtonStyleProps & ButtonHTMLAttributes<HTMLButtonElement>;
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, block, icon: Icon, iconRight: IconRight, children, className, disabled, ...rest },
  ref,
) {
  const sz = size === "lg" ? 20 : size === "sm" ? 14 : 16;
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buildClass({ variant, size, block, className })}
      {...rest}
    >
      {loading ? <Spinner size={sz} /> : Icon ? <Icon size={sz} className="shrink-0" /> : null}
      {children != null && <span>{children}</span>}
      {!loading && IconRight && <IconRight size={sz} className="shrink-0" />}
    </button>
  );
});

type LinkButtonProps = ButtonStyleProps & Omit<LinkProps, "className">;
export function LinkButton({
  variant,
  size,
  block,
  icon: Icon,
  iconRight: IconRight,
  children,
  className,
  ...rest
}: LinkButtonProps) {
  const sz = size === "lg" ? 20 : size === "sm" ? 14 : 16;
  return (
    <Link className={buildClass({ variant, size, block, className })} {...rest}>
      {Icon && <Icon size={sz} className="shrink-0" />}
      {children != null && <span>{children}</span>}
      {IconRight && <IconRight size={sz} className="shrink-0" />}
    </Link>
  );
}

type AnchorBtnProps = ButtonStyleProps & AnchorHTMLAttributes<HTMLAnchorElement>;
export function AnchorButton({
  variant,
  size,
  block,
  icon: Icon,
  iconRight: IconRight,
  children,
  className,
  ...rest
}: AnchorBtnProps) {
  const sz = size === "lg" ? 20 : size === "sm" ? 14 : 16;
  return (
    <a className={buildClass({ variant, size, block, className })} {...rest}>
      {Icon && <Icon size={sz} className="shrink-0" />}
      {children != null && <span>{children}</span>}
      {IconRight && <IconRight size={sz} className="shrink-0" />}
    </a>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ComponentType<{ className?: string; size?: number }>;
  label: string;
  size?: number;
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 18, className = "", ...rest },
  ref,
) {
  return (
    <button ref={ref} aria-label={label} title={label} className={`btn-icon ${className}`} {...rest}>
      <Icon size={size} />
    </button>
  );
});
