import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className = "",
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "crm-button",
    `crm-button--${variant}`,
    `crm-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...props} />;
}
