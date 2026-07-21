/*
 * Mayeutik — service worker de la coquille PWA.
 *
 * Conçu pour la ROBUSTESSE avant tout : le service worker ne doit JAMAIS
 * pouvoir bloquer un visiteur. Les garde-fous :
 *
 *  1. PRECACHE 100 % LOCAL : seules des ressources de même origine, en chemins
 *     relatifs, sont pré-cachées. Aucune URL externe (polices Google...) n'entre
 *     jamais dans le precache — une police manquante ne fait pas échouer l'install.
 *  2. PRECACHE TOLÉRANT : chaque ressource est mise en cache indépendamment
 *     (jamais de `cache.addAll` strict). Un échec unitaire n'interrompt pas l'install.
 *  3. TOUJOURS UN REPLI RÉSEAU : sur défaut de cache, on va toujours au réseau ;
 *     on ne fabrique jamais de réponse vide.
 *  4. REMPLACEMENT IMMÉDIAT : `skipWaiting()` dès l'installation +
 *     `clients.claim()` à l'activation + purge des anciens caches, pour qu'une
 *     nouvelle version chasse aussitôt une ancienne (éventuellement cassée).
 *  5. CHEMINS RELATIFS : tout est relatif à la racine d'enregistrement du SW.
 *  6. AUCUNE RÉPONSE REDIRIGÉE POUR LES NAVIGATIONS : Safari iOS rejette
 *     strictement une réponse de service worker à une requête de navigation
 *     dont `redirected` est vrai (« Response served by service worker has
 *     redirections »). Or le Cache API PRÉSERVE l'indicateur de redirection :
 *     mettre en cache une réponse redirigée (ex. l'hébergeur redirige « / »
 *     vers « /index.html », capturé tel quel) casse ensuite la navigation.
 *     Parade : on reconstruit une Response « propre » (corps final, sans
 *     redirection) AVANT toute mise en cache, et on garantit au niveau du
 *     gestionnaire fetch qu'une navigation ne reçoit jamais de réponse
 *     redirigée, qu'elle vienne du cache ou du réseau.
 *
 * Toute mise à jour de la coquille ou d'un jeu doit s'accompagner d'une
 * incrémentation de VERSION_CACHE (déclenche la purge des anciens caches).
 */
'use strict';

const VERSION_CACHE = 'mayeutik-v6';
const CACHE_POLICES = 'mayeutik-polices-v1';

/* Fichiers de la coquille — tous LOCAUX et en chemins RELATIFS (garde-fou 1 & 5). */
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
 * Reconstruit une réponse SANS redirection quand la réponse d'origine en porte
 * une (`redirected === true`). Le Cache API conserve la liste d'URL (donc
 * l'indicateur `redirected`) : sans ce nettoyage, une réponse redirigée mise en
 * cache resservirait une navigation redirigée, que Safari iOS refuse (garde-fou 6).
 * Reconstruire depuis le corps final donne une réponse à liste d'URL unique,
 * dont `redirected` vaut faux. Sans redirection, la réponse est renvoyée telle
 * quelle (aucune copie inutile).
 */
async function nettoyerSiRedirige(reponse) {
  if (!reponse || !reponse.redirected) return reponse;
  const corps = await reponse.clone().blob();
  return new Response(corps, {
    status: reponse.status,
    statusText: reponse.statusText,
    headers: reponse.headers
  });
}

/*
 * Liste des ressources locales à pré-cacher : la coquille + les jeux déclarés
 * dans data/referentiel.json (le référentiel reste la source unique de vérité).
 * TOLÉRANT : si le référentiel est injoignable ou illisible, on précache au
 * moins la coquille — jamais d'exception propagée.
 */
async function listerFichiersLocaux() {
  const fichiers = FICHIERS_COQUILLE.slice();
  try {
    const reponse = await fetch('./data/referentiel.json', { cache: 'reload' });
    if (reponse && reponse.ok) {
      const referentiel = await reponse.json();
      (referentiel.modules || []).forEach((m) => {
        if (m && m.fichier) fichiers.push('./' + m.fichier);
      });
    }
  } catch (e) {
    // Référentiel indisponible à l'installation : on précache la coquille seule.
    // Les jeux seront mis en cache à la première visite (cf. reseauPuisCache).
  }
  return fichiers;
}

/*
 * Precache TOLÉRANT aux erreurs (garde-fou 2) : chaque ressource est récupérée
 * et mise en cache séparément ; un échec unitaire est ignoré. On suit les
 * redirections (`redirect: 'follow'`, comportement par défaut) puis on stocke la
 * ressource FINALE nettoyée de toute redirection (garde-fou 6) — crucial pour
 * l'entrée « ./ » que beaucoup d'hébergeurs redirigent vers « /index.html ».
 */
async function precacherTolerant() {
  const cache = await caches.open(VERSION_CACHE);
  const fichiers = await listerFichiersLocaux();
  await Promise.all(fichiers.map(async (url) => {
    try {
      const reponse = await fetch(url, { cache: 'reload', redirect: 'follow' });
      if (reponse && reponse.ok) await cache.put(url, await nettoyerSiRedirige(reponse));
    } catch (e) {
      // Ressource momentanément indisponible : ignorée, réessayée au runtime.
    }
  }));
}

self.addEventListener('install', (evt) => {
  // skipWaiting() est demandé IMMÉDIATEMENT, sans dépendre du precache : même si
  // la mise en cache est lente ou partielle, la nouvelle version prend la main
  // au plus vite et remplace un éventuel ancien SW cassé (garde-fou 4).
  self.skipWaiting();
  evt.waitUntil(precacherTolerant());
});

/* Activation : purge des caches obsolètes + prise de contrôle immédiate des
   pages déjà ouvertes (garde-fou 4). Purge aussi un éventuel cache antérieur
   contenant une entrée « ./ » redirigée (garde-fou 6). */
self.addEventListener('activate', (evt) => {
  evt.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(
      noms
        .filter((nom) => nom !== VERSION_CACHE && nom !== CACHE_POLICES)
        .map((nom) => caches.delete(nom))
    );
    await self.clients.claim();
  })());
});

function estFichierJeu(url) {
  return url.pathname.indexOf('/jeux/') !== -1;
}

function mettreEnCache(cacheNom, requete, reponse) {
  // `reponse` doit déjà être « propre » (sans redirection) — cf. nettoyerSiRedirige.
  // Mise en cache best-effort en arrière-plan : ne bloque ni ne casse la réponse.
  caches.open(cacheNom).then((cache) => cache.put(requete, reponse)).catch(() => {});
}

/*
 * JEUX (jeux/*.html) — RÉSEAU D'ABORD : on sert toujours le vrai fichier tant
 * que le réseau répond (une 404 est transmise telle quelle, jamais remplacée
 * par une autre page). La réponse est nettoyée de toute redirection avant d'être
 * mise en cache ET renvoyée (garde-fou 6 ; ouvrir un jeu est une navigation).
 * Le cache ne sert qu'en repli hors ligne ; en dernier recours on relaie
 * l'erreur réseau native plutôt qu'une réponse vide.
 */
async function reseauPuisCache(requete) {
  try {
    const reponse = await fetch(requete);
    if (reponse && reponse.ok) {
      const propre = await nettoyerSiRedirige(reponse);
      mettreEnCache(VERSION_CACHE, requete, propre.clone());
      return propre;
    }
    return reponse;
  } catch (e) {
    const enCache = await caches.match(requete, { ignoreSearch: true });
    if (enCache) return enCache;
    // Ni réseau ni cache : réponse informative NON VIDE (jamais un corps vide).
    return new Response(
      'Jeu indisponible hors ligne : ouvrez-le une première fois en ligne pour le mettre en cache.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
}

/*
 * COQUILLE (index.html, js/, data/, icônes) — CACHE D'ABORD pour un démarrage
 * hors ligne instantané, avec REPLI RÉSEAU systématique sur défaut de cache
 * (garde-fou 3). Les réponses réseau sont nettoyées de toute redirection avant
 * mise en cache (garde-fou 6). Le repli de navigation vers index.html ne
 * concerne QUE la coquille (les jeux ne passent jamais par ici).
 */
async function cachePuisReseau(requete) {
  const enCache = await caches.match(requete, { ignoreSearch: true });
  if (enCache) return enCache; // déjà nettoyé au moment du cache.put
  try {
    const reponse = await fetch(requete);
    if (reponse && reponse.ok) {
      const propre = await nettoyerSiRedirige(reponse);
      mettreEnCache(VERSION_CACHE, requete, propre.clone());
      return propre;
    }
    return reponse;
  } catch (e) {
    if (requete.mode === 'navigate') {
      const accueil = await caches.match('./index.html');
      if (accueil) return accueil;
    }
    // Pas de réponse vide : on relaie l'échec réseau natif (comme sans SW).
    return Promise.reject(e);
  }
}

/*
 * POLICE Fredoka (Google Fonts, ressource externe) — RÉSEAU D'ABORD, cache en
 * secours. Jamais pré-cachée. En dernier recours on laisse l'échec réseau
 * remonter (repli sur la police système via la pile font-family) plutôt que de
 * fabriquer une réponse vide.
 */
async function policeReseauPuisCache(requete) {
  try {
    const reponse = await fetch(requete);
    if (reponse && reponse.ok) mettreEnCache(CACHE_POLICES, requete, reponse.clone());
    return reponse;
  } catch (e) {
    const enCache = await caches.match(requete);
    if (enCache) return enCache;
    return Promise.reject(e);
  }
}

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  const url = new URL(evt.request.url);

  // Ressources externes (polices...) : network-first, jamais pré-cachées.
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      evt.respondWith(policeReseauPuisCache(evt.request));
    }
    // Tout autre domaine externe : laissé au navigateur (pas d'interception).
    return;
  }

  const reponse = estFichierJeu(url)
    ? reseauPuisCache(evt.request)
    : cachePuisReseau(evt.request);

  // Garantie Safari iOS (garde-fou 6) : une NAVIGATION ne doit jamais recevoir
  // une réponse portant une redirection — quelle que soit sa source (cache ou
  // réseau). On nettoie donc systématiquement le résultat des navigations.
  if (evt.request.mode === 'navigate') {
    evt.respondWith(reponse.then(nettoyerSiRedirige));
  } else {
    evt.respondWith(reponse);
  }
});
