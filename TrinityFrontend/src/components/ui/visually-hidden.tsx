import * as React from "react"
import { cn } from "@/lib/utils"

interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

const VisuallyHidden = React.forwardRef<HTMLElement, VisuallyHiddenProps>(
  ({ className, asChild, as = "span", ...props }, ref) => {
    const Component = as as keyof JSX.IntrinsicElements;
    
    return React.createElement(
      Component,
      {
        ref,
        className: cn(
          "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0",
          "clip-[rect(0,0,0,0)]",
          className
        ),
        ...props,
      }
    );
  }
)
VisuallyHidden.displayName = "VisuallyHidden"

export { VisuallyHidden }

