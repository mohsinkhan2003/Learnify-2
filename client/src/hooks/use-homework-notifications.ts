import { useEffect, useRef, useState } from "react";
import { Assignment } from "@shared/schema";

interface NotificationSound {
  play: () => void;
}

// Store seen assignments in localStorage to persist across page loads
const STORAGE_KEY = 'learnify-seen-assignments';
const SEEDED_KEY = 'learnify-has-seeded';

function getSeenAssignments(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function setSeenAssignments(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch (error) {
    console.error('[Notifications] Failed to save seen assignments:', error);
  }
}

function hasBeenSeeded(): boolean {
  try {
    return localStorage.getItem(SEEDED_KEY) === 'true';
  } catch {
    return false;
  }
}

function markAsSeeded() {
  try {
    localStorage.setItem(SEEDED_KEY, 'true');
  } catch (error) {
    console.error('[Notifications] Failed to mark as seeded:', error);
  }
}

function clearSeeded() {
  try {
    localStorage.removeItem(SEEDED_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[Notifications] Failed to clear seeded flag:', error);
  }
}

// Convert base64 string to Uint8Array for service worker subscription
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useHomeworkNotifications(assignments: Assignment[] | undefined) {
  console.log('[Notifications] Hook initialized with assignments:', assignments?.length || 0);

  const [hasPermission, setHasPermission] = useState(() => {
    const hasNotificationAPI = "Notification" in window;
    const granted = hasNotificationAPI && Notification.permission === "granted";
    console.log('[Notifications] Initial permission state:', { hasNotificationAPI, granted, permission: hasNotificationAPI ? Notification.permission : 'N/A' });
    return granted;
  });

  const previousAssignmentsRef = useRef<Set<string>>(getSeenAssignments());
  const notificationSoundRef = useRef<NotificationSound | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const serviceWorkerRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  console.log('[Notifications] Previously seen assignments:', Array.from(previousAssignmentsRef.current));

  // Register service worker for background push notifications
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('[Push] Service Worker registered:', registration);
          serviceWorkerRegistrationRef.current = registration;

          // Trigger subscription if permission is already granted
          if (hasPermission) {
            subscribeToPush(registration);
          }
        })
        .catch(error => {
          console.error('[Push] Service Worker registration failed:', error);
        });
    }
  }, []);

  // Subscribe to push notifications
  const subscribeToPush = async (registration?: ServiceWorkerRegistration) => {
    const reg = registration || serviceWorkerRegistrationRef.current;
    if (!hasPermission || !reg) {
      console.log('[Push] Skipping subscription - permission:', hasPermission, 'registration:', !!reg);
      return;
    }

    try {
      console.log('[Push] Starting subscription process...');

      // Check if already subscribed
      const existingSubscription = await reg.pushManager.getSubscription();
      if (existingSubscription) {
        console.log('[Push] Already subscribed, reusing existing subscription');
        console.log('[Push] Endpoint:', existingSubscription.endpoint.substring(0, 50) + '...');
        
        // Ensure server has this subscription
        const saveResponse = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(existingSubscription),
        });

        if (saveResponse.ok) {
          console.log('[Push] ✓ Existing subscription confirmed with server');
        }
        return;
      }

      // Get VAPID public key from server
      console.log('[Push] Fetching VAPID public key...');
      const response = await fetch('/api/vapid-public-key');
      const { publicKey } = await response.json();

      if (!publicKey) {
        console.error('[Push] No VAPID public key available from server');
        return;
      }
      console.log('[Push] VAPID public key received:', publicKey.substring(0, 20) + '...');

      // Subscribe to push notifications
      console.log('[Push] Subscribing to push manager...');
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      console.log('[Push] Push subscription created:', subscription.endpoint.substring(0, 50) + '...');

      // Send subscription to server
      console.log('[Push] Sending subscription to server...');
      const saveResponse = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
      });

      if (!saveResponse.ok) {
        throw new Error(`Failed to save subscription: ${saveResponse.statusText}`);
      }

      console.log('[Push] ✓ Successfully subscribed to push notifications!');
      console.log('[Push] Notifications will now work everywhere - even when app is minimized or on different pages');
    } catch (error) {
      console.error('[Push] ❌ Failed to subscribe to push notifications:', error);
      console.error('[Push] Error details:', error instanceof Error ? error.message : String(error));
    }
  };

  // Re-subscribe when permission changes to granted
  useEffect(() => {
    if (hasPermission && serviceWorkerRegistrationRef.current) {
      subscribeToPush();
    }
  }, [hasPermission]);

  // Request notification permission
  const requestPermission = async () => {
    if (!("Notification" in window)) {
      console.log("Browser doesn't support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      setHasPermission(true);
      return true;
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      const granted = permission === "granted";
      setHasPermission(granted);
      return granted;
    }

    return false;
  };

  // Initialize notification sound and audio context
  useEffect(() => {
    const initAudioContext = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    notificationSoundRef.current = {
      play: () => {
        try {
          initAudioContext();

          const audioContext = audioContextRef.current;
          if (!audioContext) return;

          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.frequency.value = 800;
          oscillator.type = "sine";

          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
          console.error("Failed to play notification sound:", error);
        }
      }
    };

    if (Notification.permission === "default") {
      const handleFirstClick = () => {
        requestPermission();
        initAudioContext();
        document.removeEventListener("click", handleFirstClick);
      };
      document.addEventListener("click", handleFirstClick);
      return () => {
        document.removeEventListener("click", handleFirstClick);
      };
    } else if (Notification.permission === "granted") {
      setHasPermission(true);
      initAudioContext();
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Seed previousAssignmentsRef when permission is granted
  useEffect(() => {
    if (!hasPermission) {
      clearSeeded();
      previousAssignmentsRef.current = new Set();
      return;
    }

    if (assignments && !hasBeenSeeded()) {
      const seenIds = new Set(assignments.map(a => a.id));
      previousAssignmentsRef.current = seenIds;
      setSeenAssignments(seenIds);
      markAsSeeded();
      console.log('[Notifications] Seeded with existing assignments:', assignments.map(a => a.id));
    } else if (assignments) {
      previousAssignmentsRef.current = getSeenAssignments();
    }
  }, [hasPermission, assignments]);

  // Track seen assignments (for UI purposes only - notifications handled by service worker)
  useEffect(() => {
    if (!assignments || !hasPermission || !hasBeenSeeded()) {
      return;
    }

    try {
      const currentAssignmentIds = new Set(assignments.map(a => a.id));
      const now = new Date();
      
      const availableAssignments = assignments.filter(assignment => {
        try {
          const notificationTime = new Date(assignment.notificationTime);
          return notificationTime <= now;
        } catch (error) {
          console.error('[Notifications] Error parsing notification time for assignment:', assignment.id, error);
          return false;
        }
      });

      const newAssignments = availableAssignments.filter(
        assignment => !previousAssignmentsRef.current.has(assignment.id)
      );

      console.log('[Notifications] Tracking assignments:', {
        total: assignments.length,
        available: availableAssignments.length,
        new: newAssignments.length
      });

      // Update seen assignments (push notifications are handled by service worker)
      if (newAssignments.length > 0) {
        console.log('[Notifications] New assignments detected:', newAssignments.map(a => a.topic));
        console.log('[Notifications] Push notifications will be sent by service worker when notification time arrives');
        previousAssignmentsRef.current = currentAssignmentIds;
        setSeenAssignments(currentAssignmentIds);
      }
    } catch (error) {
      console.error('[Notifications] Error in tracking assignments:', error);
    }
  }, [assignments, hasPermission]);

  return {
    hasPermission,
    requestPermission,
  };
}