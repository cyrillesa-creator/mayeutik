const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT = '/home/user/mayeutik';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

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

/* Palier réellement affiché = la puce active de l'écran d'accueil du module. */
const palierAffiche = (page) => page.evaluate(() =>
  (Array.from(document.querySelectorAll('.puce-palier')).find((b) => b.classList.contains('actif')) || {}).textContent || null);

async function ouvrir(browser, port, fichier, niveauProfil, palierURL) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  const url = `http://localhost:${port}/jeux/${fichier}` + (palierURL ? `?palier=${palierURL}` : '');
  await page.goto(url);
  await page.evaluate((n) => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'Test', niveau: n }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
  }, niveauProfil);
  await page.goto(url); // rechargement AVEC le profil en place
  await page.waitForSelector('#grille-jeux');
  return { page, erreurs };
}

(async () => {
  const srv = creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  const MULTI = ['M23-longueurs.html', 'M39-tableaux-diagrammes.html'];

  for (const f of MULTI) {
    // Profil CE2, point d'entrée CP : le POINT D'ENTRÉE doit gagner.
    for (const [profil, entree] of [['CE2', 'cp'], ['CP', 'ce2'], ['CE1', 'ce2'], ['CE2', 'ce1']]) {
      const { page, erreurs } = await ouvrir(browser, port, f, profil, entree);
      const affiche = await palierAffiche(page);
      ok(affiche === entree.toUpperCase(),
        `${f} — profil ${profil}, point d'entrée ${entree.toUpperCase()} : le point d'entrée l'emporte`,
        `affiché : ${affiche}`);
      ok(erreurs.length === 0, `${f} — profil ${profil}/${entree} : aucune erreur console`, erreurs.slice(0, 3));
      await page.close();
    }

    // Ouverture GÉNÉRIQUE (sans ?palier) : on retombe sur le niveau du profil.
    for (const profil of ['CP', 'CE1', 'CE2']) {
      const { page } = await ouvrir(browser, port, f, profil, null);
      const affiche = await palierAffiche(page);
      ok(affiche === profil,
        `${f} — ouverture générique, profil ${profil} : le profil fait foi`, `affiché : ${affiche}`);
      await page.close();
    }

    // Paramètre farfelu : on ne casse rien, on retombe sur le profil.
    for (const mauvais of ['cm1', 'xyz', '']) {
      const { page, erreurs } = await ouvrir(browser, port, f, 'CE1', mauvais);
      const affiche = await palierAffiche(page);
      ok(affiche === 'CE1', `${f} — ?palier=${mauvais || '(vide)'} ignoré, retour au profil`, `affiché : ${affiche}`);
      ok(erreurs.length === 0, `${f} — ?palier=${mauvais || '(vide)'} : aucune erreur console`, erreurs.slice(0, 3));
      await page.close();
    }

    // Casse indifférente.
    const { page } = await ouvrir(browser, port, f, 'CP', 'CE2');
    ok((await palierAffiche(page)) === 'CE2', `${f} — ?palier=CE2 (majuscules) fonctionne aussi`);
    await page.close();
  }

  // ---- Le lien produit par la coquille porte-t-il bien le palier ? ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(`http://localhost:${port}/index.html`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'Test', niveau: 'CE2' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForTimeout(600);
    // On bascule sur « Tous les niveaux » pour obtenir les sections par niveau.
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button, a')).find((x) => /tous les niveaux/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(500);
    const liens = await page.evaluate(() => Array.from(document.querySelectorAll('a.carte-jeu'))
      .map((a) => a.getAttribute('href')).filter((h) => /M23|M39/.test(h)));
    const avecPalier = liens.filter((h) => /\?palier=/.test(h));
    ok(avecPalier.length > 0,
      'La coquille produit bien des liens ?palier= pour les modules multi-niveaux',
      Array.from(new Set(avecPalier)).slice(0, 6).join('  '));
    ok(erreurs.length === 0, 'Coquille : aucune erreur console', erreurs.slice(0, 3));
    await page.close();
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
