// Service Worker for PWA with Background Push Notifications
// Handles push events, offline support, and app installation

const CACHE_NAME = 'learnify-v10';
const RUNTIME_CACHE = 'learnify-runtime-v10';

// Static assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .then(() => self.skipWaiting())
      .catch(err => {
        console.error('[Service Worker] Precache failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => {
            console.log('[Service Worker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
    .then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip chrome extensions and other origins
  if (url.origin !== location.origin) {
    return;
  }
  
  // API requests - network ONLY (no caching to prevent stale data)
  // Pass through ALL API requests (GET, POST, PUT, DELETE, etc.)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Skip non-GET requests for static assets
  if (request.method !== 'GET') {
    return;
  }
  
  // Static assets - cache first, network fallback
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, responseToCache);
          });
          
          return response;
        });
      })
  );
});

// Push event - receive push notifications from server
self.addEventListener('push', event => {
  console.log('[Service Worker] Push event received:', event);
  
  let notificationData = {
    title: 'New Homework Available!',
    body: 'You have new homework to complete',
    icon: '/icon-192.png',
    badge: '/favicon.ico',
  };
  
  // Parse push event data from server
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        data: data.data || {},
      };
      console.log('[Service Worker] Parsed notification data:', notificationData);
    } catch (e) {
      console.error('[Service Worker] Error parsing push data:', e);
      notificationData.body = event.data.text();
    }
  }
  
  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: [200, 100, 200],
    tag: notificationData.data?.assignmentId || 'homework-notification',
    requireInteraction: true, // Keep notification visible until user interacts
    data: notificationData.data,
    actions: [
      { action: 'open', title: 'Start Learning', icon: '/icon-192.png' },
      { action: 'dismiss', title: 'Later', icon: '/icon-192.png' }
    ],
    silent: false // Ensure notification makes sound
  };
  
  console.log('[Service Worker] Showing notification with options:', notificationOptions);
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationOptions)
      .then(() => {
        console.log('[Service Worker] ✓ Notification displayed successfully');
      })
      .catch(error => {
        console.error('[Service Worker] ❌ Failed to show notification:', error);
      })
  );
});

// Notification click event - handle user clicking notification
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification clicked:', event.action);
  
  event.notification.close();
  
  // Handle different actions
  if (event.action === 'dismiss') {
    return;
  }
  
  // Default action or 'open' action - navigate to assignment
  const assignmentId = event.notification.data?.assignmentId;
  const urlToOpen = assignmentId ? `/chat/${assignmentId}` : '/dashboard';
  
  console.log('[Service Worker] Opening URL:', urlToOpen);
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url.includes('/dashboard') || client.url.includes('/chat')) {
            console.log('[Service Worker] Found existing client, focusing and navigating');
            return client.focus().then(client => {
              // Navigate to specific assignment
              return client.navigate(urlToOpen);
            });
          }
        }
        // Otherwise, open a new window
        console.log('[Service Worker] No existing client, opening new window');
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync event (for future offline support)
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(
      // Sync pending messages when back online
      Promise.resolve()
    );
  }
});