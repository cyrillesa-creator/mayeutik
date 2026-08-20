const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

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

const PAGES = ['index.html', 'jeux/M01-nombres-jusqu-9-cp.html', 'jeux/M17-fractions-ce2.html',
               'jeux/M23-longueurs.html', 'jeux/M36-solides.html', 'jeux/M39-tableaux-diagrammes.html',
               'jeux/M99-boss-des-tables.html'];

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  for (const f of PAGES) {
    await page.goto(`http://localhost:${port}/${f}`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'Test', niveau: 'CE2' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.goto(`http://localhost:${port}/${f}`);
    await page.waitForTimeout(400);

    const etat = await page.evaluate(() => {
      const cs = (el) => el ? getComputedStyle(el) : null;
      const corps = cs(document.body);
      // Échantillon large : tout ce sur quoi un enfant tape.
      const interactifs = Array.from(document.querySelectorAll(
        'button, a, [role="button"], .carte-jeu, .bouton-option, .touche-pave, .touche-chiffre, p, div, span, img, svg'))
        .slice(0, 250);
      const sansManipulation = interactifs
        .filter((el) => {
          const ta = getComputedStyle(el).touchAction;
          // `none` est légitime : geste piloté en JS (règle mobile, glisser-déposer).
          return ta !== 'manipulation' && ta !== 'none';
        })
        .map((el) => el.tagName + '.' + String(el.className).split(' ')[0] + ' → ' + getComputedStyle(el).touchAction);
      return {
        viewport: (document.querySelector('meta[name=viewport]') || {}).content || '',
        userSelectBody: corps.webkitUserSelect || corps.userSelect,
        calloutBody: corps.webkitTouchCallout,
        surbrillance: corps.webkitTapHighlightColor,
        nbInteractifs: interactifs.length,
        sansManipulation: sansManipulation.slice(0, 5),
        nbSansManipulation: sansManipulation.length
      };
    });

    ok(/maximum-scale=1/.test(etat.viewport) && /user-scalable=no/.test(etat.viewport),
      `${f} — meta viewport interdit le zoom de page`, etat.viewport);
    ok(etat.userSelectBody === 'none', `${f} — sélection désactivée sur le corps`, etat.userSelectBody);
    /* `-webkit-touch-callout` est propre à WebKit/iOS : Chromium ne l'implémente
       pas et getComputedStyle renvoie une chaîne vide. On ne peut donc pas
       l'observer ici — on vérifie que la déclaration est bien PRÉSENTE dans la
       feuille de style, ce qui est ce qui compte pour iOS. */
    const source = await page.content();
    ok(/body\s*\{[^}]*-webkit-touch-callout:\s*none/s.test(source),
      `${f} — déclaration -webkit-touch-callout:none présente (non observable hors WebKit)`);
    ok(/rgba\(0, 0, 0, 0\)|transparent/.test(etat.surbrillance), `${f} — pas de surbrillance de tap`, etat.surbrillance);
    ok(etat.nbSansManipulation === 0,
      `${f} — les ${etat.nbInteractifs} éléments échantillonnés sont protégés du double-tap`,
      etat.sansManipulation);
  }

  // ---- Les champs de saisie restent sélectionnables ----
  for (const [f, ouvrirChamp] of [['jeux/M39-tableaux-diagrammes.html', null]]) {
    await page.goto(`http://localhost:${port}/${f}`);
    await page.waitForTimeout(300);
    const champ = await page.evaluate(() => {
      const i = document.createElement('input');
      i.type = 'number';
      document.body.appendChild(i);
      const cs = getComputedStyle(i);
      const r = { userSelect: cs.webkitUserSelect || cs.userSelect, callout: cs.webkitTouchCallout };
      i.remove();
      return r;
    });
    ok(champ.userSelect === 'text', `${f} — un <input> garde la sélection de texte`, champ.userSelect);
    const src = await page.content();
    ok(/input[^{]*\{[^}]*-webkit-touch-callout:\s*default/s.test(src),
      `${f} — les champs de saisie ré-autorisent explicitement le menu d'édition`);
  }

  // ---- La règle mobile de M23 garde son geste à deux doigts ----
  {
    await page.goto(`http://localhost:${port}/jeux/M23-longueurs.html`);
    await page.waitForTimeout(300);
    const regle = await page.evaluate(() => {
      // On instancie une règle mobile hors jeu pour lire son touch-action calculé.
      const d = document.createElement('div');
      d.className = 'regle-graduee regle-mobile';
      document.body.appendChild(d);
      const ta = getComputedStyle(d).touchAction;
      d.remove();
      return ta;
    });
    ok(regle === 'none',
      'M23 — la règle mobile conserve touch-action:none (geste à deux doigts piloté en JS)', regle);
  }

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
