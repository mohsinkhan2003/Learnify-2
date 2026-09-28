import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // All browser-specific checks must happen in useEffect for SSR safety
    
    // Check if user already dismissed the prompt
    const isDismissed = sessionStorage.getItem('pwa-prompt-dismissed') === 'true';
    if (isDismissed) {
      return; // Don't show anything if user dismissed
    }

    // Check if app is already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');
    
    if (isStandalone) {
      return; // Don't show if already installed
    }

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Listen for the beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, show prompt only if not dismissed and not already installed
    if (iOS) {
      setShowPrompt(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response: ${outcome}`);

    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Remember dismissal for this session (safe to use here - inside click handler)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pwa-prompt-dismissed', 'true');
    }
  };

  // Only show if showPrompt is true (all checks done in useEffect)
  if (!showPrompt) {
    return null;
  }

  return (
    <Card className="fixed bottom-4 left-4 right-4 z-50 p-4 shadow-lg border-primary/20">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-base mb-1" data-testid="text-install-title">
            Install Learnify App
          </h3>
          
          {isIOS ? (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Install this app on your iPhone:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Tap the Share button <span className="inline-block">⎋</span></li>
                <li>Scroll and tap "Add to Home Screen"</li>
                <li>Tap "Add" to install</li>
              </ol>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">
              Install Learnify on your device for quick access and offline use.
            </p>
          )}
          
          {!isIOS && deferredPrompt && (
            <Button 
              onClick={handleInstallClick}
              className="mt-3"
              size="sm"
              data-testid="button-install-pwa"
            >
              <Download className="w-4 h-4 mr-2" />
              Install Now
            </Button>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="flex-shrink-0"
          data-testid="button-dismiss-install"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
