import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-lg shadow-cyan-900/15 hover:-translate-y-0.5 hover:bg-cyan-600",
        destructive: "bg-destructive text-destructive-foreground shadow-lg shadow-red-900/15 hover:-translate-y-0.5 hover:bg-red-600",
        secondary: "bg-secondary text-secondary-foreground hover:bg-amber-200",
      },
      size: {
        default: "h-12 px-5 py-3",
        compact: "h-10 px-4 py-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
