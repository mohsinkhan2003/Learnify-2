import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Copies text to the clipboard with visible and screen-reader feedback. */
export function CopyButton({
  value,
  label = "Copy",
  ...props
}: { value: string; label?: string } & Omit<ButtonProps, "onClick" | "value">) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      {...props}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the value is visible on screen for manual copying.
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
