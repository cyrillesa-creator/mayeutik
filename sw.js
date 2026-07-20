/*
 * Mayeutik — service worker de la coquille PWA.
 *
 * Stratégies (cf. PRODUIT.md, local-first) :
 *  - FICHIERS DE JEUX (jeux/*.html) : RÉSEAU D'ABORD, cache en secours.
 *    On va toujours chercher le vrai fichier quand le réseau répond ; le
 *    cache ne sert que hors ligne. Jamais de page de remplacement : si un
 *    jeu est introuvable, on renvoie l'erreur telle quelle, JAMAIS
 *    index.html à sa place.
 *  - COQUILLE (index.html, js/, data/, icônes) : cache d'abord (hors ligne
 *    instantané), réseau en repli. Le repli de navigation vers index.html
 *    ne s'applique QU'AUX navigations de la coquille, jamais aux jeux.
 *  - POLICE Fredoka (Google Fonts) : réseau d'abord, cache en secours ;
 *    sans réseau ni cache, la pile `font-family` retombe sur la police
 *    système, sans erreur.
 *
 * Toute mise à jour de la coquille ou d'un jeu doit s'accompagner d'une
 * incrémentation de VERSION_CACHE : l'événement `activate` supprime alors
 * tous les anciens caches (y compris les caches défectueux v1/v2).
 */
'use strict';

const VERSION_CACHE = 'mayeutik-v4';
const CACHE_POLICES = 'mayeutik-polices-v1';

/* Fichiers de la coquille elle-même. */
const FICHIERS_COQUILLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/referentiel.json',
  './js/statuts.js',
  './js/radar.js',
  './js/profils.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/*
 * Les jeux sont précachés d'après data/referentiel.json (champ `fichier` de
 * chaque module) : le référentiel reste la source unique de vérité — ajouter
 * un module au référentiel suffit pour qu'il soit disponible hors ligne
 * (après incrément de VERSION_CACHE).
 */
async function listerFichiersLocaux() {
  const reponse = await fetch('./data/referentiel.json');
  const referentiel = await reponse.json();
  const jeux = (referentiel.modules || []).map((m) => './' + m.fichier);
  return FICHIERS_COQUILLE.concat(jeux);
}

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    listerFichiersLocaux()
      .then((fichiers) => caches.open(VERSION_CACHE).then((cache) => cache.addAll(fichiers)))
      .then(() => self.skipWaiting())
  );
});

/* Purge de TOUS les caches obsolètes (dont les v1/v2 défectueux). */
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

function estFichierJeu(url) {
  return url.pathname.indexOf('/jeux/') !== -1;
}

/*
 * Réseau d'abord (jeux) : le vrai fichier tant que le réseau répond — une
 * erreur HTTP (404...) est renvoyée telle quelle, jamais remplacée par une
 * autre page. Le cache ne sert que si le réseau est injoignable.
 */
async function reseauPuisCache(requete) {
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) {
      const copie = reponse.clone();
      caches.open(VERSION_CACHE).then((cache) => cache.put(requete, copie));
    }
    return reponse;
  } catch (e) {
    const enCache = await caches.match(requete, { ignoreSearch: true });
    if (enCache) return enCache;
    return new Response('Jeu indisponible hors ligne : ouvrez-le une première fois en ligne pour le mettre en cache.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/*
 * Cache d'abord (coquille) : hors ligne instantané. En cas d'échec réseau
 * sur une NAVIGATION de la coquille uniquement (les jeux ne passent jamais
 * ici), on retombe sur index.html.
 */
async function cachePuisReseau(requete) {
  const enCache = await caches.match(requete, { ignoreSearch: true });
  if (enCache) return enCache;
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) {
      const copie = reponse.clone();
      caches.open(VERSION_CACHE).then((cache) => cache.put(requete, copie));
    }
    return reponse;
  } catch (e) {
    if (requete.mode === 'navigate') {
      const accueil = await caches.match('./index.html');
      if (accueil) return accueil;
    }
    return new Response('Hors ligne.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* Police : réseau d'abord, cache en secours (repli système sinon). */
async function policeReseauPuisCache(requete) {
  try {
    const reponse = await fetch(requete);
    const copie = reponse.clone();
    caches.open(CACHE_POLICES).then((cache) => cache.put(requete, copie));
    return reponse;
  } catch (e) {
    const enCache = await caches.match(requete);
    if (enCache) return enCache;
    return new Response('', { status: 503 });
  }
}

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  const url = new URL(evt.request.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    evt.respondWith(policeReseauPuisCache(evt.request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (estFichierJeu(url)) {
    evt.respondWith(reseauPuisCache(evt.request));
  } else {
    evt.respondWith(cachePuisReseau(evt.request));
  }
});
