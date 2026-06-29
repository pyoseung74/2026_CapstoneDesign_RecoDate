// RecoDate 서비스 워커.
// 목적: PWA 설치 자격(fetch 핸들러 보유) + 아이콘/매니페스트 등 정적 자산만 안전하게 캐시.
// ⚠️ app.js / styles.css 같은 코드 자산은 캐시하지 않는다(?v= 버전 갱신과 충돌해
//    구버전이 박제되는 사고를 막기 위해). API 응답도 절대 캐시하지 않는다.
const CACHE_NAME = "recodate-pwa-v1";
const PRECACHE = [
  "/icons/icon-192.webp",
  "/icons/icon-512.webp",
  "/icons/maskable.svg",
  "/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

// ----- 푸시 알림(웹푸시) -----
// 서버(pywebpush)가 보낸 payload(JSON)를 받아 OS 알림으로 띄운다.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: "RecoDate", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "RecoDate";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.webp",
    badge: "/icons/icon-192.webp",
    // 같은 사람의 채팅은 한 줄로 묶이도록 tag 부여(과도한 누적 방지).
    tag: payload.type === "message" && payload.actor_id ? `chat-${payload.actor_id}` : undefined,
    renotify: payload.type === "message",
    data: {
      type: payload.type || "",
      post_id: payload.post_id || "",
      actor_id: payload.actor_id || "",
      actor: payload.actor || "",
      url: payload.url || "/",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림을 탭하면 앱을 포커스(없으면 새로 열고)하고, 어디로 갈지 클라이언트에 알린다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({ source: "recodate-push", data });
          return;
        }
      }
      return self.clients.openWindow(data.url || "/");
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API는 항상 네트워크(캐시 금지).
  if (url.pathname.startsWith("/api/")) return;
  // 아이콘/매니페스트만 캐시 우선, 나머지는 네트워크 우선.
  const isStaticAsset = url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })),
    );
  }
});
