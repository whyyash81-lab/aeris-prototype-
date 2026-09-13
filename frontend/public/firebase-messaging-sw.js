/* eslint-disable no-restricted-globals */
// AERIS — background Firebase Cloud Messaging service worker.
// Version it to match the frontend Firebase SDK (firebase ~12).
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDBiZdVPAUJzYpeUY6PxhPe1LyJ9ZSHQmk",
  authDomain: "aeris978-e62b8.firebaseapp.com",
  projectId: "aeris978-e62b8",
  storageBucket: "aeris978-e62b8.firebasestorage.app",
  messagingSenderId: "193846282592",
  appId: "1:193846282592:web:fb4193c8071de709807605",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[AERIS sw] background message", payload);

  const data = payload.data || {};
  const options = {
    body:
      payload.notification?.body ??
      data.message ??
      "A sensor node has crossed a risk threshold.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: `aeris-${data.nodeId ?? "node"}`,
    renotify: true,
  };

  self.registration.showNotification(
    payload.notification?.title ?? "AERIS alert",
    options
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow("/");
    })
  );
});