import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Maximize2, RefreshCw, Share2 } from "lucide-react";
import type { ClassDto } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CopyButton } from "@/components/common/copy-button";

export const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`;

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1 2.7 11.5 11.5 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.2-.2-.2-.4-.3z" />
    </svg>
  );
}

function useQr(text: string, size: number, enabled = true) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [text, size, enabled]);
  return src;
}

/** Everything a teacher needs to get students into a class: code, link, share and a classroom QR. */
export function InvitePanel({ cls, onNewCode, regenerating }: { cls: ClassDto; onNewCode: () => void; regenerating: boolean }) {
  const url = inviteUrl(cls.joinCode);
  const [presenting, setPresenting] = useState(false);
  const message = `Join my class "${cls.name}" on Learnify: ${url} (class code ${cls.joinCode})`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  // Page thumbnail at 2× its 160 px display size; the classroom-screen version only when opened.
  const qr = useQr(url, 320);
  const bigQr = useQr(url, 720, presenting);

  return (
    <section aria-labelledby="invite-title" className="glass rounded-xl p-6 shadow-md">
      <h2 id="invite-title" className="text-section-title">
        Invite students
      </h2>
      <p className="mt-1 max-w-xl text-helper">
        Send the link, or show the QR code in class. Students create an account (or sign in) and land straight in this class. They can also
        type the code under <strong>Join a class</strong>.
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <div>
            <p className="text-label text-muted-foreground">Invite link</p>
            <div className="mt-1.5 flex gap-2">
              <Input
                readOnly
                value={url}
                aria-label="Invite link"
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <CopyButton value={url} label="Copy link" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon /> WhatsApp
                </a>
              </Button>
              {canShare && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.share({ title: `Join ${cls.name} on Learnify`, text: message, url }).catch(() => undefined)}
                >
                  <Share2 aria-hidden /> Share…
                </Button>
              )}
              <CopyButton value={message} label="Copy message" variant="ghost" />
            </div>
          </div>
          <div>
            <p className="text-label text-muted-foreground">Class code</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p
                className="font-mono text-3xl font-semibold tracking-[0.18em]"
                aria-label={`Class code ${cls.joinCode.split("").join(" ")}`}
              >
                {cls.joinCode}
              </p>
              <CopyButton value={cls.joinCode} label="Copy code" variant="ghost" />
              <Button variant="ghost" size="sm" onClick={onNewCode} loading={regenerating}>
                <RefreshCw aria-hidden /> New code
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          {qr && <img src={qr} alt={`QR code for the invite link to ${cls.name}`} className="size-40 rounded-lg bg-white p-2 shadow-sm" />}
          <Button variant="soft" size="sm" onClick={() => setPresenting(true)}>
            <Maximize2 aria-hidden /> Show in class
          </Button>
        </div>
      </div>

      <Dialog open={presenting} onOpenChange={setPresenting}>
        <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">Join {cls.name}</DialogTitle>
            <DialogDescription className="text-center text-base">
              Scan with your phone camera, or go to the address and enter the code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-5 py-2">
            {bigQr && <img src={bigQr} alt="" className="w-full max-w-[22rem] rounded-xl bg-white p-3" />}
            <p className="font-mono text-5xl font-bold tracking-[0.2em] sm:text-6xl">{cls.joinCode}</p>
            <p className="break-all text-center font-mono text-sm text-muted-foreground">{url}</p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
