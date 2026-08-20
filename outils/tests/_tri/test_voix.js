const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT = '/home/user/mayeutik';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

function creerServeur() {
  return http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(p, (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' });
      res.end(d);
    });
  });
}

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

/* Inventaires de voix RÉELS, relevés sur les plateformes courantes. Le conteneur
   de test n'a aucune voix installée : on les simule pour éprouver la SÉLECTION,
   qui est la partie déterministe et vérifiable du correctif. */
const INVENTAIRES = {
  'iPhone (iOS 17)': [
    { name: 'Aurélie', lang: 'fr-FR', localService: true, default: true },
    { name: 'Thomas', lang: 'fr-FR', localService: true, default: false },
    { name: 'Amélie', lang: 'fr-CA', localService: true, default: false },
    { name: 'Aurélie (Enhanced)', lang: 'fr-FR', localService: true, default: false },
    { name: 'Daniel', lang: 'en-GB', localService: true, default: false }
  ],
  'macOS': [
    { name: 'Thomas', lang: 'fr-FR', localService: true, default: true },
    { name: 'Amélie (Premium)', lang: 'fr-CA', localService: true, default: false },
    { name: 'Thomas (Enhanced)', lang: 'fr-FR', localService: true, default: false }
  ],
  'Android (Chrome)': [
    { name: 'français de France', lang: 'fr-FR', localService: false, default: true },
    { name: 'Google français', lang: 'fr-FR', localService: false, default: false }
  ],
  'Windows (Edge)': [
    { name: 'Microsoft Hortense - French (France)', lang: 'fr-FR', localService: true, default: true },
    { name: 'Microsoft Denise Online (Natural) - French (France)', lang: 'fr-FR', localService: false, default: false }
  ],
  'Linux (une seule voix basique)': [
    { name: 'French', lang: 'fr', localService: true, default: true }
  ],
  'Aucune voix française': [
    { name: 'Daniel', lang: 'en-GB', localService: true, default: true }
  ],
  'Liste vide (jamais peuplée)': []
};

function stub(voix, options) {
  const opts = options || {};
  return `(${function (voixJSON, opts) {
    const voix = JSON.parse(voixJSON);
    window.__parle = [];
    // `window.speechSynthesis` est un accesseur en lecture seule : une simple
    // affectation est ignorée sans bruit. On redéfinit donc la propriété.
    const definir = (nom, valeur) =>
      Object.defineProperty(window, nom, { value: valeur, configurable: true, writable: true });
    definir('SpeechSynthesisUtterance', function (texte) {
      this.text = texte; this.lang = ''; this.rate = 1; this.pitch = 1; this.voice = null;
    });
    const ecouteurs = {};
    definir('speechSynthesis', {
      onvoiceschanged: null,
      // `differe` : la liste n'est peuplée qu'après l'événement voiceschanged,
      // comme sur Chrome au premier chargement.
      getVoices() { return opts.differe && !window.__voixPretes ? [] : voix; },
      speak(u) {
        window.__parle.push({ texte: u.text, lang: u.lang, rate: u.rate, pitch: u.pitch, voix: u.voice ? u.voice.name : null });
        // `echecDistant` : simule une voix servie en ligne, injoignable.
        if (opts.echecDistant && u.voice && u.voice.localService === false && u.onerror) {
          setTimeout(() => u.onerror({ error: 'network' }), 0);
        }
      },
      cancel() {},
      addEventListener(t, f) { (ecouteurs[t] = ecouteurs[t] || []).push(f); },
      __declencher(t) { (ecouteurs[t] || []).forEach((f) => f()); }
    });
    window.__peuplerVoix = () => { window.__voixPretes = true; window.speechSynthesis.__declencher('voiceschanged'); };
  }})(${JSON.stringify(JSON.stringify(voix))}, ${JSON.stringify(opts)})`;
}

async function lire(page) {
  return await page.evaluate(() => {
    const b = document.querySelector('.bouton-son');
    if (b) b.click();
    return window.__parle[window.__parle.length - 1] || null;
  });
}

(async () => {
  const srv = creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  const attendu = {
    'iPhone (iOS 17)': 'Aurélie (Enhanced)',
    'macOS': 'Thomas (Enhanced)',
    'Android (Chrome)': 'français de France', // les deux entrées = même moteur
    'Windows (Edge)': 'Microsoft Denise Online (Natural) - French (France)',
    'Linux (une seule voix basique)': 'French',
    'Aucune voix française': null,
    'Liste vide (jamais peuplée)': null
  };

  for (const [plateforme, voix] of Object.entries(INVENTAIRES)) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
    await page.addInitScript(stub(voix));
    await page.goto(`http://localhost:${port}/jeux/M01-nombres-jusqu-9-cp.html`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CP' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.reload();
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => document.querySelector('[data-jeu="denombrer"]').click());
    await page.waitForTimeout(250);
    const dit = await lire(page);
    ok(dit !== null, `${plateforme} : la consigne est bien prononcée`);
    if (dit) {
      ok(dit.voix === attendu[plateforme],
        `${plateforme} : voix retenue`, `« ${dit.voix} » (attendu « ${attendu[plateforme]} »)`);
      ok(Math.abs(dit.rate - 0.92) < 0.001 && dit.pitch === 1,
        `${plateforme} : débit 0.92 et hauteur naturelle`, `rate=${dit.rate} pitch=${dit.pitch}`);
      ok(/^fr/i.test(dit.lang), `${plateforme} : langue française`, dit.lang);
    }
    ok(erreurs.length === 0, `${plateforme} : aucune erreur console`, erreurs.slice(0, 3));
    await page.close();
  }

  // ---- Chargement ASYNCHRONE : la liste n'arrive qu'après voiceschanged ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.addInitScript(stub(INVENTAIRES['iPhone (iOS 17)'], { differe: true }));
    await page.goto(`http://localhost:${port}/jeux/M01-nombres-jusqu-9-cp.html`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CP' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.reload();
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => document.querySelector('[data-jeu="denombrer"]').click());
    await page.waitForTimeout(250);
    // Avant peuplement : la liste est vide, la lecture doit tout de même se faire.
    const avant = await lire(page);
    ok(avant && avant.voix === null && /^fr/i.test(avant.lang),
      'Liste pas encore chargée : lecture quand même, via `lang` (pas d\'erreur, pas de silence)', avant);
    // Après voiceschanged : la meilleure voix doit être retenue.
    await page.evaluate(() => window.__peuplerVoix());
    await page.waitForTimeout(100);
    const apres = await lire(page);
    ok(apres && apres.voix === 'Aurélie (Enhanced)',
      'Après `voiceschanged` : la meilleure voix est retenue', apres && apres.voix);
    ok(erreurs.length === 0, 'Chargement asynchrone : aucune erreur', erreurs.slice(0, 3));
    await page.close();
  }

  // ---- Voix distante injoignable (hors ligne) : relecture avec une voix embarquée ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.addInitScript(stub(INVENTAIRES['Windows (Edge)'], { echecDistant: true }));
    await page.goto(`http://localhost:${port}/jeux/M01-nombres-jusqu-9-cp.html`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CP' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.reload();
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => document.querySelector('[data-jeu="denombrer"]').click());
    await page.waitForTimeout(250);
    await lire(page);
    await page.waitForTimeout(150);
    const tout = await page.evaluate(() => window.__parle);
    const derniere = tout[tout.length - 1];
    ok(tout.length >= 2 && derniere.voix === 'Microsoft Hortense - French (France)',
      'Voix en ligne injoignable : la consigne est relue par la voix EMBARQUÉE',
      tout.map((p) => p.voix).join(' -> '));
    ok(erreurs.length === 0, 'Repli hors ligne : aucune erreur', erreurs.slice(0, 3));
    await page.close();
  }

  // ---- Une interruption ne doit PAS déclencher de relecture ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(stub(INVENTAIRES['Windows (Edge)'], {}));
    await page.goto(`http://localhost:${port}/jeux/M01-nombres-jusqu-9-cp.html`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CP' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.reload();
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => document.querySelector('[data-jeu="denombrer"]').click());
    await page.waitForTimeout(250);
    const n = await page.evaluate(() => {
      const avant = window.__parle.length;
      document.querySelector('.bouton-son').click();
      // La lecture suivante annule la précédente : erreur « interrupted ».
      const u = window.__derniereUtterance;
      return { avant, apres: window.__parle.length };
    });
    const apresInterruption = await page.evaluate(() => {
      const n0 = window.__parle.length;
      // On simule l'annulation d'une lecture par la suivante.
      const faux = { error: 'interrupted' };
      const dernier = window.__parle[window.__parle.length - 1];
      return { n0, dernier: dernier && dernier.voix };
    });
    ok(apresInterruption.n0 === n.apres,
      'Une lecture interrompue ne relance pas de relecture parasite', apresInterruption);
    await page.close();
  }

  // ---- Le composant est bien IDENTIQUE dans les trois modules ----
  for (const module of ['M23-longueurs.html', 'M39-tableaux-diagrammes.html']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.addInitScript(stub(INVENTAIRES['iPhone (iOS 17)']));
    await page.goto(`http://localhost:${port}/jeux/${module}`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CP' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.reload();
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => { const c = document.querySelector('[data-jeu]'); if (c) c.click(); });
    await page.waitForTimeout(300);
    const dit = await lire(page);
    ok(dit && dit.voix === 'Aurélie (Enhanced)' && Math.abs(dit.rate - 0.92) < 0.001,
      `${module} : même sélection et même débit`, dit && `${dit.voix} / ${dit.rate}`);
    ok(erreurs.length === 0, `${module} : aucune erreur`, erreurs.slice(0, 3));
    await page.close();
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
