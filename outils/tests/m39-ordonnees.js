const socle = require('./socle.js');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = socle.chargerPlaywright();

const srv = http.createServer((q, r) => {
  const p = path.join(socle.RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' });
    r.end(d);
  });
});

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

/* Le nombre n de l'axe des ordonnées doit tomber sur le TRAIT qui borne le haut
   de la case n — pas au milieu de la case, où il désignait un entre-deux. On
   compare le centre de l'étiquette au bord haut de la case correspondante, dans
   la première colonne (toutes les colonnes partagent le même rythme). */
const MESURE = `(() => {
  const grads = Array.from(document.querySelectorAll('.axe-graduation'));
  const col = document.querySelector('.colonne-construction');
  if (!grads.length || !col) return null;
  const cases = Array.from(col.querySelectorAll('.case-construction'));
  const wrap = document.querySelector('.diagramme-construction');
  const rw = wrap.getBoundingClientRect();
  const ecarts = [];
  const ecartsAuMilieu = [];
  grads.forEach((g, i) => {
    const span = g.querySelector('.valeur-graduation');
    if (!span || !cases[i]) return;
    const rs = span.getBoundingClientRect();
    const rc = cases[i].getBoundingClientRect();
    ecarts.push(Math.round((rs.top + rs.height / 2 - rc.top) * 100) / 100);
    ecartsAuMilieu.push(Math.round((rs.top + rs.height / 2 - (rc.top + rc.height / 2)) * 100) / 100);
  });
  const hautExtreme = grads[grads.length - 1].querySelector('.valeur-graduation').getBoundingClientRect().top;
  return {
    nb: ecarts.length,
    valeurs: grads.map((g) => g.textContent),
    ecartMax: Math.max(...ecarts.map(Math.abs)),
    ecartAuMilieuMin: Math.min(...ecartsAuMilieu.map(Math.abs)),
    // L'étiquette la plus haute déborde de la moitié de sa hauteur : le
    // conteneur doit lui réserver la place, sinon elle serait rognée.
    margeAuDessus: Math.round((hautExtreme - rw.top) * 10) / 10,
    pasEntreEtiquettes: (() => {
      const t = grads.map((g) => g.querySelector('.valeur-graduation').getBoundingClientRect().top);
      const pas = t.slice(1).map((v, i) => Math.round(Math.abs(v - t[i]) * 10) / 10);
      return [...new Set(pas)];
    })()
  };
})()`;

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });
  const page = await b.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  const ouvrir = async (palier, jeu, attendre) => {
    const u = `http://localhost:${port}/jeux/M39-tableaux-diagrammes.html?palier=${palier}`;
    await page.goto(u);
    await page.evaluate((n) => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: n }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    }, palier.toUpperCase());
    await page.goto(u);
    await page.waitForSelector('#grille-jeux');
    await page.evaluate((j) => document.querySelector(`[data-jeu="${j}"]`).click(), jeu);
    await page.waitForSelector(attendre);
    await page.waitForTimeout(250);
  };

  // ---- Les effectifs du jardin : le diagramme est là dès l'ouverture ----
  await ouvrir('ce2', 'diagramme-completer-ce2', '.diagramme-construction');
  {
    const m = await page.evaluate(MESURE);
    ok(m && m.ecartMax < 0.5,
      `Les effectifs du jardin : les ${m.nb} nombres tombent sur leur trait (13 px d'écart avant correction)`,
      `écart max ${m.ecartMax} px`);
    ok(m && m.ecartAuMilieuMin > 10,
      'Ils ne sont plus au milieu des cases', `écart au milieu ${m.ecartAuMilieuMin} px`);
    ok(m && m.pasEntreEtiquettes.length === 1 && m.pasEntreEtiquettes[0] === 26,
      'Le rythme de l’échelle reste celui des cases', m && m.pasEntreEtiquettes);
    ok(m && m.margeAuDessus >= 0,
      'Le nombre le plus haut n’est pas rogné par le haut du diagramme', m && `${m.margeAuDessus} px de marge`);
    ok(m && m.valeurs[0] === '1' && m.valeurs[m.nb - 1] === String(m.nb),
      'La graduation reste numérotée de 1 au sommet', m && `${m.valeurs[0]}…${m.valeurs[m.nb - 1]}`);
  }

  // ---- Le sondage du jardin partage le même composant ----
  await ouvrir('cp', 'cp-recueil-diagramme', '.bete-population');
  {
    const n = await page.locator('.bete-population').count();
    for (let i = 0; i < n; i++) { await page.locator('.bete-population:not(.comptee)').first().click(); await page.waitForTimeout(15); }
    await page.waitForTimeout(150);
    const vrais = await page.evaluate(() => Array.from(document.querySelectorAll('.tally-marques'))
      .map((c) => c.textContent.replace(/\s/g, '').length));
    for (const v of vrais) {
      for (const ch of String(v).split('')) await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
      await page.locator('.touche-valider').first().click();
      await page.waitForTimeout(70);
    }
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mes totaux' }).click();
    await page.waitForTimeout(250);
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Construire le diagramme' }).click();
    await page.waitForTimeout(300);
    const m = await page.evaluate(MESURE);
    ok(m && m.ecartMax < 0.5,
      'Le sondage du jardin : même correction, le composant est partagé', m && `écart max ${m.ecartMax} px`);
    ok(m && m.margeAuDessus >= 0, 'Sondage : nombre le plus haut non rogné', m && `${m.margeAuDessus} px`);
  }

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
