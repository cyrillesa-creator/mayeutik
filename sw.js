/*
 * Mayeutik — service worker de la coquille PWA.
 *
 * Stratégie (cf. PRODUIT.md, local-first) :
 *  - les fichiers locaux (coquille + jeux) sont pré-mis en cache à
 *    l'installation, puis servis CACHE-FIRST : l'app fonctionne hors ligne ;
 *  - la police Fredoka (Google Fonts) est mise en cache au fil de l'eau
 *    (réseau d'abord, cache en secours) : hors ligne sans cache, la pile
 *    `font-family` retombe sur la police système, sans erreur ;
 *  - toute mise à jour de la coquille ou d'un jeu doit s'accompagner d'une
 *    incrémentation de VERSION_CACHE ci-dessous, sinon les clients déjà
 *    installés continueront de servir l'ancienne version depuis le cache.
 */
'use strict';

const VERSION_CACHE = 'mayeutik-v1';
const CACHE_POLICES = 'mayeutik-polices-v1';

/* La coquille et tous les jeux : tout ce qu'il faut pour jouer hors ligne. */
const FICHIERS_LOCAUX = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/referentiel.json',
  './js/statuts.js',
  './js/radar.js',
  './js/profils.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './jeux/M01-nombres-jusqu-9-cp.html',
  './jeux/M17-fractions-ce2.html',
  './jeux/M36-solides.html'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(VERSION_CACHE)
      .then((cache) => cache.addAll(FICHIERS_LOCAUX))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((nom) => nom !== VERSION_CACHE && nom !== CACHE_POLICES)
          .map((nom) => caches.delete(nom))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);
  if (evt.request.method !== 'GET') return;

  /* Police Fredoka : réseau d'abord (pour suivre les mises à jour Google
     Fonts), cache en secours hors ligne. Tout autre domaine externe est
     laissé au réseau (la coquille n'en utilise aucun). */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    evt.respondWith(
      fetch(evt.request)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(CACHE_POLICES).then((cache) => cache.put(evt.request, copie));
          return reponse;
        })
        .catch(() => caches.match(evt.request))
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  /* Fichiers locaux : cache-first, avec repli réseau (et mise en cache du
     résultat) pour un fichier ajouté après l'installation. */
  evt.respondWith(
    caches.match(evt.request, { ignoreSearch: true }).then((enCache) => {
      if (enCache) return enCache;
      return fetch(evt.request).then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(VERSION_CACHE).then((cache) => cache.put(evt.request, copie));
        }
        return reponse;
      });
    })
  );
});
