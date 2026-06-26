const CACHE_NAME = "bofia-cache-v1";
const OFFLINE_URL = "/offline.html"; // صفحة تعرضها للعميل إذا لم يكن لديه إنترنت وليست مخزنة

// 1. مرحلة التثبيت: تخزين الصفحات الأساسية مثل صفحة الأوفلاين
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // يمكنك إضافة الملفات الأساسية هنا (CSS, JS, صور)
      return cache.addAll([OFFLINE_URL, "/", "/index.html"]);
    }),
  );
  // تفعيل الـ Service Worker الجديد فوراً دون انتظار إغلاق المتصفح
  self.skipWaiting();
});

// 2. مرحلة التنشيط: تفعيل ميزة Navigation Preload وتنظيف الكاش القديم
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // تفعيل الجلب المسبق للتصفح إذا كان المتصفح يدعمه
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      // تنظيف أي كاش قديم لا يحمل نفس الاسم الحالي
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        }),
      );
    })(),
  );
  // السيطرة على الصفحة الحالية فوراً
  self.clients.claim();
});

// 3. مرحلة جلب البيانات (Fetch): هنا يكمن حل المشكلة!
self.addEventListener("fetch", (event) => {
  // نطبق الميزة فقط على طلبات تصفح الصفحات (Navigation Requests)
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // الحل: انتظر وعد الجلب المسبق أولاً (Preload Response)
          const preloadResponse = await event.preloadResponse;

          if (preloadResponse) {
            // إذا كانت الاستجابة المسبقة جاهزة، خذ نسخة منها واحفظها في الكاش للتحديث
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, preloadResponse.clone());
            return preloadResponse;
          }

          // إذا لم يدعم المتصفح Preload، اذهب للشبكة بالطريقة العادية
          const networkResponse = await fetch(event.request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          // في حال فشل الإنترنت تماماً (Offline)، ابحث عنها في الكاش
          console.log(
            "فشل جلب البيانات من الشبكة، جاري البحث في الكاش...",
            error,
          );
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(event.request);

          if (cachedResponse) {
            return cachedResponse;
          }

          // إذا لم تكن الصفحة في الكاش أيضاً، اعرض صفحة الأوفلاين العامة
          return cache.match(OFFLINE_URL);
        }
      })(),
    );
  } else {
    // بالنسبة للملفات الأخرى (صور، خطوط، ملفات CSS) - استراتيجية الكاش أولاً للسرعة
    event.respondWith(
      caches.match(event.request).then((response) => {
        return (
          response ||
          fetch(event.request).then((networkResponse) => {
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            });
          })
        );
      }),
    );
  }
});
