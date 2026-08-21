const socle = require('./socle.js');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = socle.chargerPlaywright();

const srv = http.createServer((q, r) => {
  const p = path.join(socle.RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
    r.end(d);
  });
});

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  const url = `http://localhost:${port}/jeux/M39-tableaux-diagrammes.html?palier=cp`;
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CP' }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
  });

  const lancer = async (jeu) => {
    await page.goto(url);
    await page.waitForSelector('#grille-jeux');
    await page.evaluate((j) => document.querySelector(`[data-jeu="${j}"]`).click(), jeu || 'cp-recueil-diagramme');
    await page.waitForSelector('.bete-population');
    await page.waitForTimeout(120);
  };
  const toutCompter = async () => {
    const n = await page.locator('.bete-population').count();
    for (let i = 0; i < n; i++) { await page.locator('.bete-population:not(.comptee)').first().click(); await page.waitForTimeout(20); }
    await page.waitForTimeout(150);
  };
  const taper = async (v) => {
    for (const ch of String(v).split('')) await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
    await page.locator('.touche-valider').first().click();
    await page.waitForTimeout(80);
  };
  const marques = () => page.evaluate(() => Array.from(document.querySelectorAll('.tally-marques'))
    .map((c) => c.textContent.replace(/\s/g, '').length));
  const totaux = () => page.evaluate(() => Array.from(document.querySelectorAll('.cellule-total')).map((c) => c.textContent));

  // ================= 1. LE PAVÉ NUMÉRIQUE PARTAGÉ =================
  await lancer();
  await toutCompter();
  {
    const p = await page.evaluate(() => {
      const m = (s) => { const el = document.querySelector(s); if (!el) return null;
        const b = el.getBoundingClientRect(); const c = getComputedStyle(el);
        return { w: Math.round(b.width), h: Math.round(b.height), display: c.display,
                 cols: c.gridTemplateColumns, fond: c.backgroundColor, chiffres: c.fontVariantNumeric,
                 maxW: c.maxWidth }; };
      return { pave: m('.pave-numerique'), ecran: m('.pave-ecran'), grille: m('.pave-grille'),
               touche: m('.touche-pave'), valider: m('.touche-valider'), effacer: m('.touche-effacer'),
               nbTouches: document.querySelectorAll('.touche-pave').length };
    });
    ok(p.nbTouches === 12, 'Pavé partagé : 12 touches (7-8-9 / 4-5-6 / 1-2-3 / C-0-✓)', p.nbTouches);
    ok(p.grille.display === 'grid' && /repeat|px/.test(p.grille.cols) && p.grille.cols.split(' ').length === 3,
      'Pavé partagé : grille de 3 colonnes', p.grille.cols);
    ok(p.ecran.h >= 40, 'Pavé partagé : l’écran de saisie a une hauteur réelle (il était à 0 px)', p.ecran.h + 'px');
    ok(p.ecran.chiffres === 'tabular-nums',
      'Pavé partagé : chiffres à chasse fixe — la saisie ne fait pas bouger la mise en page', p.ecran.chiffres);
    ok(p.touche.h >= 44 && p.touche.w >= 44,
      'Pavé partagé : touches au-dessus de la cible tactile de 44 px (elles faisaient 24×21)',
      `${p.touche.w}×${p.touche.h}`);
    ok(p.pave.w <= 260, 'Pavé partagé : largeur contenue, pas étalé sur toute la page', p.pave.w + 'px');
    const distinct = p.valider.fond !== p.touche.fond && p.effacer.fond !== p.touche.fond && p.valider.fond !== p.effacer.fond;
    ok(distinct, 'Pavé partagé : ✓ et C se distinguent des chiffres', `${p.touche.fond} / ${p.valider.fond} / ${p.effacer.fond}`);
    ok(/rgba\(0, 0, 0, 0\)/.test(p.ecran.fond) === false, 'Pavé partagé : l’écran a bien un fond', p.ecran.fond);

    // Le pavé de M39 est-il identique à celui de M23 (composant partagé) ?
    const src39 = fs.readFileSync('/home/user/mayeutik/jeux/M39-tableaux-diagrammes.html', 'utf8');
    const src23 = fs.readFileSync('/home/user/mayeutik/jeux/M23-longueurs.html', 'utf8');
    const bloc = (s) => {
      const i = s.indexOf('.pave-numerique{');
      return s.slice(i, s.indexOf('.touche-effacer{', i)).replace(/\s+/g, ' ').trim();
    };
    ok(bloc(src39) === bloc(src23),
      'Le style du pavé de M39 est EXACTEMENT celui du composant partagé de M23');
  }

  // ============ 2. UNE SEULE VALIDATION POUR TOUS LES TOTAUX ============
  {
    const vrais = await marques();
    ok((await totaux()).every((t) => t === '?'), 'Report : toutes les cases attendent une saisie', await totaux());

    // On saisit un premier total, FAUX : rien ne doit être jugé à ce stade.
    await taper(vrais[0] + 1);
    const apres1 = await page.evaluate(() => ({
      totaux: Array.from(document.querySelectorAll('.cellule-total')).map((c) => c.textContent),
      juges: document.querySelectorAll('.cellule-total.correct, .cellule-total.incorrect').length,
      feedback: (document.getElementById('zone-feedback') || {}).textContent || '',
      boutonActif: !!document.querySelector('#zone-jeu .bouton-principal:not([disabled])')
    }));
    ok(apres1.juges === 0, 'Aucune case n’est jugée à la saisie : pas de validation ligne par ligne', apres1.juges);
    ok(apres1.feedback === '', 'Aucun feedback de manche déclenché à la saisie', apres1.feedback);
    ok(!apres1.boutonActif, 'Le bouton de validation reste inactif tant que tout n’est pas saisi');
    ok(apres1.totaux[0] === String(vrais[0] + 1), 'La valeur saisie s’inscrit telle quelle dans la case', apres1.totaux[0]);

    // On saisit les autres.
    for (let i = 1; i < vrais.length; i++) await taper(vrais[i]);
    const apres = await page.evaluate(() => ({
      juges: document.querySelectorAll('.cellule-total.correct, .cellule-total.incorrect').length,
      bouton: (document.querySelector('#zone-jeu .bouton-principal') || {}).textContent || '',
      boutonActif: !!document.querySelector('#zone-jeu .bouton-principal:not([disabled])'),
      pave: document.querySelectorAll('.pave-numerique').length
    }));
    ok(apres.juges === 0, 'Toujours aucun jugement avant le clic sur Valider', apres.juges);
    ok(apres.boutonActif && /Valider mes totaux/.test(apres.bouton),
      'Un bouton de validation UNIQUE apparaît une fois toutes les cases remplies', apres.bouton);
    ok(apres.pave === 1, 'Un seul pavé partagé pour toutes les lignes (pas un par ligne)', apres.pave);

    // On corrige la première case AVANT de valider : c'est tout l'intérêt.
    await page.locator('.cellule-total').first().click();
    await page.waitForTimeout(60);
    await taper(vrais[0]);
    ok((await totaux())[0] === String(vrais[0]), 'Une case déjà remplie peut être corrigée avant la validation', (await totaux())[0]);

    // Validation unique : les N totaux sont jugés d'un coup.
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mes totaux' }).click();
    await page.waitForTimeout(200);
    const juges = await page.evaluate(() => ({
      corrects: document.querySelectorAll('.cellule-total.correct').length,
      incorrects: document.querySelectorAll('.cellule-total.incorrect').length,
      suite: (document.querySelector('#zone-jeu .bouton-principal') || {}).textContent || ''
    }));
    ok(juges.corrects === vrais.length && juges.incorrects === 0,
      `Validation unique : les ${vrais.length} totaux sont jugés d’un seul coup`, JSON.stringify(juges));
    ok(/Construire le diagramme/.test(juges.suite), 'On enchaîne sur l’écran du diagramme', juges.suite);
  }

  // ============ 3. ÉCHELLE DU DIAGRAMME (AXE DES ABSCISSES) ============
  const mesurerAxe = () => page.evaluate(() => {
    const grads = Array.from(document.querySelectorAll('.axe-graduation'));
    const cols = Array.from(document.querySelectorAll('.colonne-construction'));
    const mid = (el) => { const b = el.getBoundingClientRect(); return b.y + b.height / 2; };
    const ecarts = [];
    cols.forEach((c) => {
      const cases = Array.from(c.querySelectorAll('.case-construction'));
      grads.forEach((g, i) => { if (cases[i]) ecarts.push(Math.abs(mid(g) - mid(cases[i]))); });
    });
    const pieds = Array.from(document.querySelectorAll('.pied-colonne')).map((p) => Math.round(p.getBoundingClientRect().height));
    return {
      nbColonnes: cols.length,
      ecartMax: Math.round(Math.max(...ecarts) * 10) / 10,
      hautsPile: [...new Set(cols.map((c) => Math.round(c.querySelector('.pile-construction').getBoundingClientRect().top)))],
      hautAxe: Math.round(document.querySelector('.axe-diagramme').getBoundingClientRect().top),
      pieds: [...new Set(pieds)],
      debordement: document.querySelector('.diagramme-construction').scrollWidth
                 - document.querySelector('.diagramme-construction').clientWidth
    };
  });

  await page.locator('#zone-jeu .bouton-principal', { hasText: 'Construire le diagramme' }).click();
  await page.waitForTimeout(250);
  {
    const m = await mesurerAxe();
    ok(m.ecartMax < 1,
      `Axe vertical aligné sur les cases, ${m.nbColonnes} catégories (écart de 46,2 px avant correction)`,
      `écart max ${m.ecartMax} px`);
    ok(m.hautsPile.length === 1 && m.hautsPile[0] === m.hautAxe,
      'Zone de tracé : axe et colonnes partent exactement du même y', `axe ${m.hautAxe} / piles ${m.hautsPile}`);
    ok(m.pieds.length === 1, 'Le pied des abscisses a une hauteur FIXE, identique partout', m.pieds);
    ok(m.debordement === 0, 'Pas de débordement horizontal sur mobile', m.debordement + 'px');
  }

  // Le composant tient-il à 2, 3, 4 et 6 catégories, et avec des noms longs ?
  {
    const resultats = await page.evaluate(() => {
      // On instancie le diagramme hors partie, via un clone de la zone de jeu.
      const bac = document.createElement('div');
      bac.style.cssText = 'position:absolute;left:0;top:0;width:390px';
      document.body.appendChild(bac);
      const sortie = [];
      // Reconstruction minimale à partir du DOM existant : on duplique le
      // diagramme réel en ajoutant/retirant des colonnes.
      const modele = document.querySelector('.diagramme-construction');
      [2, 3, 4, 6].forEach((n) => {
        const copie = modele.cloneNode(true);
        const cols = Array.from(copie.querySelectorAll('.colonne-construction'));
        while (cols.length < n) { const c = cols[0].cloneNode(true); copie.appendChild(c); cols.push(c); }
        cols.slice(n).forEach((c) => c.remove());
        // Noms de catégories volontairement longs, pour éprouver le pied fixe.
        copie.querySelectorAll('.legende-colonne').forEach((l, i) => {
          l.textContent = i % 2 ? 'coccinelles à sept points' : 'papillons';
        });
        bac.innerHTML = '';
        bac.appendChild(copie);
        const grads = Array.from(copie.querySelectorAll('.axe-graduation'));
        const mid = (el) => { const b = el.getBoundingClientRect(); return b.y + b.height / 2; };
        let ecart = 0;
        Array.from(copie.querySelectorAll('.colonne-construction')).forEach((c) => {
          const cases = Array.from(c.querySelectorAll('.case-construction'));
          grads.forEach((g, i) => { if (cases[i]) ecart = Math.max(ecart, Math.abs(mid(g) - mid(cases[i]))); });
        });
        const pieds = [...new Set(Array.from(copie.querySelectorAll('.pied-colonne')).map((p) => Math.round(p.getBoundingClientRect().height)))];
        sortie.push({ n, ecart: Math.round(ecart * 10) / 10, pieds });
      });
      bac.remove();
      return sortie;
    });
    resultats.forEach((r) => {
      ok(r.ecart < 1, `Alignement conservé à ${r.n} catégories, même avec des légendes longues`, `écart ${r.ecart} px`);
      ok(r.pieds.length === 1, `Pied fixe à ${r.n} catégories malgré une légende sur deux lignes`, r.pieds);
    });
  }

  // ============ 4. PARCOURS COMPLET, JUSQU'À LA SESSION ============
  {
    const vrais = await page.evaluate(() => Array.from(document.querySelectorAll('.tableau-tally tbody tr'))
      .map((tr) => Number(tr.lastElementChild.textContent)));
    for (let c = 0; c < vrais.length; c++) {
      await page.evaluate(({ c, h }) => {
        document.querySelectorAll('.colonne-construction')[c].querySelectorAll('.case-construction')[h - 1].click();
      }, { c, h: vrais[c] });
      await page.waitForTimeout(40);
    }
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mon diagramme' }).click();
    await page.waitForTimeout(250);
    const fb = await page.evaluate(() => (document.getElementById('zone-feedback') || {}).className || '');
    ok(/feedback-succes/.test(fb), 'Parcours complet : manche réussie sur les deux écrans', fb);
  }

  // ============ 5. LE CE1 (4 espèces) suit le même chemin ============
  {
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CE1' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.goto(`http://localhost:${port}/jeux/M39-tableaux-diagrammes.html?palier=ce1`);
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => document.querySelector('[data-jeu="ce1-recueil-diagramme"]').click());
    await page.waitForSelector('.bete-population');
    await toutCompter();
    const vrais = await marques();
    for (const v of vrais) await taper(v);
    const b1 = await page.evaluate(() => ({
      texte: (document.querySelector('#zone-jeu .bouton-principal') || {}).textContent || '',
      juges: document.querySelectorAll('.cellule-total.correct, .cellule-total.incorrect').length
    }));
    ok(/Valider mes totaux/.test(b1.texte) && b1.juges === 0,
      `CE1 (${vrais.length} espèces) : même validation unique`, b1.texte);
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mes totaux' }).click();
    await page.waitForTimeout(200);
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Construire le diagramme' }).click();
    await page.waitForTimeout(250);
    const m = await mesurerAxe();
    ok(m.ecartMax < 1, `CE1 : axe aligné avec ${m.nbColonnes} catégories`, `écart max ${m.ecartMax} px`);
    ok(m.debordement === 0, 'CE1 : pas de débordement horizontal', m.debordement + 'px');
  }

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
