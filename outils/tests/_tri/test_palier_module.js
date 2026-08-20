const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fichier = process.argv[2];

const srv = http.createServer((q, r) => {
  const p = path.join('/home/user/mayeutik', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : /\.json$/.test(p) ? 'application/json' : 'text/html' });
    r.end(d);
  });
});

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // Une SEULE page réutilisée : enchaîner les contextes fait tomber
  // l'environnement de test en timeout.
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  const base = `http://localhost:${port}/jeux/${fichier}`;
  await page.goto(base);
  const charger = async (niveauProfil, palierURL) => {
    await page.evaluate((n) => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'Test', niveau: n }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    }, niveauProfil);
    await page.goto(base + (palierURL === null ? '' : `?palier=${palierURL}`));
    await page.waitForSelector('#grille-jeux');
    await page.waitForTimeout(120);
    return page.evaluate(() => (Array.from(document.querySelectorAll('.puce-palier'))
      .find((x) => x.classList.contains('actif')) || {}).textContent || null);
  };

  // 1. Le point d'entrée prime sur le profil quand ils diffèrent.
  for (const [profil, entree] of [['CE2', 'cp'], ['CP', 'ce2'], ['CE1', 'ce2'], ['CE2', 'ce1']]) {
    const vu = await charger(profil, entree);
    ok(vu === entree.toUpperCase(),
      `profil ${profil} + point d'entrée ${entree.toUpperCase()} → le point d'entrée l'emporte`, `affiché : ${vu}`);
  }
  // 2. Sans paramètre : le profil fait foi.
  for (const profil of ['CP', 'CE1', 'CE2']) {
    const vu = await charger(profil, null);
    ok(vu === profil, `ouverture générique, profil ${profil} → le profil fait foi`, `affiché : ${vu}`);
  }
  // 3. Paramètre invalide : ignoré sans casse.
  for (const mauvais of ['cm1', 'xyz', '']) {
    const vu = await charger('CE1', mauvais);
    ok(vu === 'CE1', `?palier=${mauvais || '(vide)'} ignoré → retour au profil`, `affiché : ${vu}`);
  }
  // 4. Casse indifférente.
  ok((await charger('CP', 'CE2')) === 'CE2', '?palier=CE2 en majuscules fonctionne aussi');

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 4));
  console.log(echecs === 0 ? `${fichier} : TOUT OK` : `${fichier} : ${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
