import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { fieldClass } from "./Input";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldClass, "block resize-y px-2.5 py-1.5 leading-relaxed", className)} {...props} />;
});
