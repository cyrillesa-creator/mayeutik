const socle = require('./socle.js');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = socle.chargerPlaywright();

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : JSON.stringify(x)); if (!c) echecs++; };

const srv = http.createServer((q, r) => {
  const p = path.join(socle.RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(d); });
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });
  const page = await browser.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  await page.goto(`http://localhost:${port}/jeux/M37-assemblages.html`);
  await page.waitForTimeout(400);

  const rapport = await page.evaluate(() => {
    const GRILLE = 4;
    const out = {};
    for (const [nomPalier, palier] of Object.entries(CONTENU.paliers)) {
      out[nomPalier] = palier.miniJeux[0].assemblages.map(a => {
        const occ = new Set();
        const soucis = [];
        // chevauchement + débordement
        a.pieces.forEach(p => {
          if (p.x < 0 || p.y < 0 || p.x + p.dx > GRILLE || p.y + p.dy > GRILLE)
            soucis.push('déborde du plateau: ' + JSON.stringify(p));
          for (let i = 0; i < p.dx; i++) for (let j = 0; j < p.dy; j++) {
            const k = (p.x + i) + ',' + (p.y + j) + ',' + p.z;
            if (occ.has(k)) soucis.push('chevauchement en ' + k);
            occ.add(k);
          }
        });
        // appui : toute cellule d'une pièce à z>0 doit être portée
        a.pieces.forEach(p => {
          if (p.z === 0) return;
          for (let i = 0; i < p.dx; i++) for (let j = 0; j < p.dy; j++) {
            const sous = (p.x + i) + ',' + (p.y + j) + ',' + (p.z - 1);
            if (!occ.has(sous)) soucis.push('pièce en l\'air (pas d\'appui en ' + sous + ')');
          }
        });
        const caches = piecesCachees(a.pieces);
        return {
          nom: a.nom, pieces: a.pieces.length,
          etages: Math.max(...a.pieces.map(p => p.z)) + 1,
          pavés: a.pieces.filter(p => p.type === 'pave').length,
          declareCache: !!a.cache, nbCaches: caches.length,
          soucis
        };
      });
    }
    return out;
  });

  console.log(JSON.stringify(rapport, null, 1));

  // ---- Contrôles ----
  for (const [pal, liste] of Object.entries(rapport)) {
    ok(liste.length >= 5, `${pal} : au moins 5 assemblages`, liste.length);
    liste.forEach(a => {
      ok(a.soucis.length === 0, `${pal}/${a.nom} : géométrie saine (appui, chevauchement, plateau)`, a.soucis);
      ok(a.declareCache === (a.nbCaches > 0),
        `${pal}/${a.nom} : le drapeau « cache » correspond à la réalité`, { declare: a.declareCache, reel: a.nbCaches });
    });
    /* Difficulté croissante sur DEUX axes : le cube caché est un saut
       qualitatif indépendant de la taille. On exige donc que tous les
       assemblages sans cube caché précèdent ceux qui en ont, et que la
       taille croisse à l'intérieur de chaque groupe. */
    const iPremierCache = liste.findIndex(a => a.nbCaches > 0);
    const sansCache = liste.filter(a => a.nbCaches === 0);
    ok(iPremierCache === -1 || liste.slice(iPremierCache).every(a => a.nbCaches > 0),
      `${pal} : les assemblages à cube caché sont tous groupés à la fin`, liste.map(a => a.nbCaches));
    [['sans cube caché', sansCache], ['à cube caché', liste.filter(a => a.nbCaches > 0)]]
      .forEach(([libelle, groupe]) => {
        const nb = groupe.map(a => a.pieces);
        ok(nb.every((n, i) => i === 0 || n >= nb[i - 1]),
          `${pal} : taille croissante parmi les assemblages ${libelle}`, nb);
      });
  }
  // CP : aucun cube caché, étages 2 ou 3, des pavés présents
  const cp = rapport.CP;
  ok(cp.every(a => a.nbCaches === 0), 'CP : AUCUN cube caché', cp.map(a => a.nbCaches));
  ok(cp.every(a => a.etages >= 2 && a.etages <= 3), 'CP : 2 à 3 étages', cp.map(a => a.etages));
  ok(cp.some(a => a.pavés > 0), 'CP : des pavés dès le CP', cp.map(a => a.pavés));
  // CE1 : 3 étages, cubes cachés présents, plus grand que le CP
  const ce1 = rapport.CE1;
  ok(ce1.every(a => a.etages === 3), 'CE1 : 3 étages partout', ce1.map(a => a.etages));
  ok(ce1.filter(a => a.nbCaches > 0).length >= 3, 'CE1 : au moins 3 assemblages à cube caché',
    ce1.map(a => a.nbCaches));
  ok(!ce1[0].nbCaches && !ce1[1].nbCaches && ce1[2].nbCaches > 0,
    'CE1 : les cubes cachés arrivent au 3e assemblage (progression)', ce1.map(a => a.nbCaches));
  ok(Math.max(...ce1.map(a => a.pieces)) > Math.max(...cp.map(a => a.pieces)),
    'CE1 : assemblages plus grands qu\'au CP',
    { cpMax: Math.max(...cp.map(a => a.pieces)), ce1Max: Math.max(...ce1.map(a => a.pieces)) });

  ok(erreurs.length === 0, 'Aucune erreur JS au chargement', erreurs.slice(0, 3));

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
