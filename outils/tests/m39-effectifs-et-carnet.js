const socle = require('./socle.js');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = socle.chargerPlaywright();
const SCRATCH = '/tmp/claude-0/-home-user-mayeutik/9c811c93-b040-5195-a545-ab2966a28f08/scratchpad';

/* Copie de diagnostic : on expose la fabrique du tableau pour pouvoir
   l'éprouver sur des milliers de tirages sans jouer autant de parties. */
const src = fs.readFileSync('/home/user/mayeutik/jeux/M39-tableaux-diagrammes.html', 'utf8');
const ancre = '  /* ================================================================\n     Mini-jeu : Lecture de diagramme';
if (src.indexOf(ancre) === -1) { console.error('ancre introuvable'); process.exit(2); }
fs.writeFileSync(path.join(SCRATCH, 'M39_diag.html'),
  src.replace(ancre, '  window.__fabriquer = fabriquerTableauDeduction;\n'
    + '  window.__contraintes = contraintesTableau;\n' + ancre));

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const p = u === '/diag' ? path.join(SCRATCH, 'M39_diag.html') : path.join(socle.RACINE, u);
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

  // =============== 1. LE GÉNÉRATEUR, SUR 3000 TIRAGES ===============
  await page.goto(`http://localhost:${port}/diag`);
  await page.waitForTimeout(300);

  const rapport = await page.evaluate((N) => {
    const cfg = { nbLignes: 4, miniValeur: 2, maxiValeur: 14, nbCachees: 7 };
    const NBCOL = 2;

    /* VÉRIFICATION INDÉPENDANTE de l'unicité : on ne fait pas confiance au
       solveur du jeu. Les 8 relations du tableau forment un système linéaire
       sur les cases masquées ; la solution est unique si et seulement si le
       rang de la matrice égale le nombre d'inconnues. Élimination de Gauss. */
    function rang(matrice, nbColonnes) {
      const m = matrice.map((l) => l.slice());
      let r = 0;
      for (let c = 0; c < nbColonnes && r < m.length; c++) {
        let pivot = -1;
        for (let i = r; i < m.length; i++) if (Math.abs(m[i][c]) > 1e-9) { pivot = i; break; }
        if (pivot === -1) continue;
        const tmp = m[r]; m[r] = m[pivot]; m[pivot] = tmp;
        for (let i = 0; i < m.length; i++) {
          if (i === r || Math.abs(m[i][c]) < 1e-9) continue;
          const f = m[i][c] / m[r][c];
          for (let k = c; k < nbColonnes; k++) m[i][k] -= f * m[r][k];
        }
        r++;
      }
      return r;
    }

    /* Le solveur « enfant », réécrit ici indépendamment du jeu : on compte
       aussi le nombre d'ÉTAPES, pour vérifier qu'aucune n'exige deux inconnues
       simultanées (par construction, une étape = une seule inconnue). */
    function deduire(connues, contraintes) {
      const su = new Set(connues);
      const etapes = [];
      let progres = true;
      while (progres) {
        progres = false;
        contraintes.forEach((g) => {
          const inc = g.filter((k) => !su.has(k));
          if (inc.length === 1) { su.add(inc[0]); etapes.push({ cle: inc[0], taille: g.length }); progres = true; }
        });
      }
      return { su, etapes };
    }

    const res = { total: 0, echecFabrication: 0, mauvaisNbCachees: 0, nonResoluble: 0,
      nonUnique: 0, horsBornes: 0, incoherent: 0, repartitionsPauvres: 0,
      minCacheesDonnees: 99, minCacheesTotaux: 99, totauxVus: new Set(), etapesMax: 0,
      exemples: [] };

    for (let n = 0; n < N; n++) {
      const t = window.__fabriquer(cfg);
      res.total++;
      if (!t) { res.echecFabrication++; continue; }
      const { valeurs, cachees, toutesCles } = t;
      const contraintes = window.__contraintes(cfg.nbLignes);

      if (cachees.size !== cfg.nbCachees) res.mauvaisNbCachees++;

      // (a) cohérence arithmétique du tableau complet
      let coherent = true;
      for (let i = 0; i < cfg.nbLignes; i++) {
        let s = 0;
        for (let j = 0; j < NBCOL; j++) s += valeurs['d:' + i + ':' + j];
        if (s !== valeurs['L:' + i]) coherent = false;
      }
      for (let j = 0; j < NBCOL; j++) {
        let s = 0;
        for (let i = 0; i < cfg.nbLignes; i++) s += valeurs['d:' + i + ':' + j];
        if (s !== valeurs['C:' + j]) coherent = false;
      }
      let sl = 0; for (let i = 0; i < cfg.nbLignes; i++) sl += valeurs['L:' + i];
      let sc = 0; for (let j = 0; j < NBCOL; j++) sc += valeurs['C:' + j];
      if (sl !== valeurs.T || sc !== valeurs.T) coherent = false;
      if (!coherent) res.incoherent++;

      // (b) toutes les valeurs entre 1 et 99
      if (toutesCles.some((k) => valeurs[k] < 1 || valeurs[k] > 99)) res.horsBornes++;

      // (c) résoluble par déductions successives à une seule inconnue
      const connues = toutesCles.filter((k) => !cachees.has(k));
      const { su, etapes } = deduire(connues, contraintes);
      if (su.size !== toutesCles.length) res.nonResoluble++;
      res.etapesMax = Math.max(res.etapesMax, etapes.length);

      // (d) UNICITÉ, par le rang du système linéaire sur les inconnues
      const inconnues = [...cachees];
      const idx = {};
      inconnues.forEach((k, i) => { idx[k] = i; });
      const lignes = contraintes.map((g) => {
        const l = new Array(inconnues.length).fill(0);
        g.forEach((k, i) => {
          const coeff = (i === g.length - 1) ? -1 : 1; // somme des membres = dernier
          if (idx[k] !== undefined) l[idx[k]] += coeff;
        });
        return l;
      });
      if (rang(lignes, inconnues.length) !== inconnues.length) res.nonUnique++;

      // (e) mélange données / totaux
      const cd = inconnues.filter((k) => k.charAt(0) === 'd').length;
      const ct = inconnues.length - cd;
      res.minCacheesDonnees = Math.min(res.minCacheesDonnees, cd);
      res.minCacheesTotaux = Math.min(res.minCacheesTotaux, ct);
      if (cd < 2 || ct < 2) res.repartitionsPauvres++;

      res.totauxVus.add(valeurs.T);
      if (res.exemples.length < 3) res.exemples.push({ T: valeurs.T, cachees: inconnues.sort().join(' ') });
    }
    res.totauxDistincts = res.totauxVus.size;
    delete res.totauxVus;
    return res;
  }, 3000);

  ok(rapport.echecFabrication === 0,
    `Génération : ${rapport.total} tirages, aucun abandon`, `${rapport.echecFabrication} échec(s)`);
  ok(rapport.mauvaisNbCachees === 0, 'Toujours exactement 7 cases masquées', rapport.mauvaisNbCachees);
  ok(rapport.incoherent === 0, 'Tableau toujours arithmétiquement cohérent (lignes, colonnes, total)', rapport.incoherent);
  ok(rapport.horsBornes === 0, 'Toutes les valeurs restent entre 1 et 99', rapport.horsBornes);
  ok(rapport.nonResoluble === 0,
    'JAMAIS de tableau non résoluble par déductions successives à une seule inconnue', rapport.nonResoluble);
  ok(rapport.nonUnique === 0,
    'JAMAIS de tableau ambigu — unicité prouvée par le rang du système linéaire', rapport.nonUnique);
  ok(rapport.repartitionsPauvres === 0,
    'Toujours au moins 2 données ET 2 totaux masqués (ni « fais les additions », ni l’inverse)',
    `min données ${rapport.minCacheesDonnees}, min totaux ${rapport.minCacheesTotaux}`);
  ok(rapport.totauxDistincts > 20,
    'Les valeurs varient d’une partie à l’autre', `${rapport.totauxDistincts} totaux généraux distincts`);
  console.log('     exemples :', JSON.stringify(rapport.exemples));

  // ---- Contre-épreuve : un retrait ALÉATOIRE de 7 cases échouerait souvent ----
  const naif = await page.evaluate((N) => {
    const cfg = { nbLignes: 4, miniValeur: 2, maxiValeur: 14, nbCachees: 7 };
    const contraintes = window.__contraintes(cfg.nbLignes);
    const toutesCles = [];
    for (let i = 0; i < cfg.nbLignes; i++) {
      for (let j = 0; j < 2; j++) toutesCles.push('d:' + i + ':' + j);
      toutesCles.push('L:' + i);
    }
    for (let j = 0; j < 2; j++) toutesCles.push('C:' + j);
    toutesCles.push('T');
    const melange = (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
    function deduire(connues) {
      const su = new Set(connues); let p = true;
      while (p) { p = false; contraintes.forEach((g) => { const inc = g.filter((k) => !su.has(k)); if (inc.length === 1) { su.add(inc[0]); p = true; } }); }
      return su;
    }
    let mauvais = 0;
    for (let n = 0; n < N; n++) {
      const cachees = new Set(melange(toutesCles).slice(0, 7));
      const connues = toutesCles.filter((k) => !cachees.has(k));
      if (deduire(connues).size !== toutesCles.length) mauvais++;
    }
    return { mauvais, N };
  }, 3000);
  ok(naif.mauvais > naif.N * 0.3,
    'Contre-épreuve : un simple retrait aléatoire de 7 cases produirait des tableaux irrésolubles',
    `${naif.mauvais}/${naif.N} (${Math.round(naif.mauvais / naif.N * 100)} %) — d’où l’algorithme dédié`);

  // =============== 2. LES DEUX MINI-JEUX, DE BOUT EN BOUT ===============
  const url = `http://localhost:${port}/jeux/M39-tableaux-diagrammes.html?palier=ce2`;
  const ouvrir = async (id) => {
    await page.goto(url);
    await page.waitForSelector('#grille-jeux');
    await page.evaluate((j) => document.querySelector(`[data-jeu="${j}"]`).click(), id);
    await page.waitForTimeout(400);
  };
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CE2' }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.removeItem('mayeutik-sessions');
  });
  await page.goto(url);
  await page.waitForSelector('#grille-jeux');
  {
    const cartes = await page.evaluate(() => Array.from(document.querySelectorAll('#grille-jeux .carte-jeu'))
      .map((c) => ({ id: c.dataset.jeu, titre: c.querySelector('h2').textContent })));
    ok(cartes.length === 3, 'Le palier CE2 compte désormais trois mini-jeux', cartes.length);
    const eff = cartes.find((c) => c.id === 'diagramme-completer-ce2');
    const carnet = cartes.find((c) => c.id === 'tableau-double-entree-deduction-ce2');
    ok(eff && eff.titre === 'Les effectifs du jardin', '« Les effectifs du jardin » est un mini-jeu à part', eff && eff.titre);
    ok(carnet && carnet.titre === 'Le carnet à trous du jardinier',
      '« Le carnet à trous du jardinier » est un mini-jeu à part', carnet && carnet.titre);
    ok(!cartes.some((c) => /enquête avancée/i.test(c.titre)), '« L\'enquête avancée » n\'existe plus');
  }

  const taper = async (v) => {
    for (const ch of String(v).split('')) await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
    await page.locator('.touche-valider').first().click();
    await page.waitForTimeout(90);
  };

  // ---- Les effectifs du jardin : 4 manches ----
  await ouvrir('diagramme-completer-ce2');
  {
    const titre = await page.evaluate(() => (document.getElementById('titre-jeu-courant') || {}).textContent);
    ok(titre === 'Les effectifs du jardin', 'Titre affiché en partie', titre);
    const lieuxVus = new Set();
    for (let manche = 1; manche <= 4; manche++) {
      const prog = await page.evaluate(() => (document.getElementById('progression-jeu') || {}).textContent);
      ok(prog === `Manche ${manche} / 4`, `Effectifs, manche ${manche} : progression sur 4`, prog);

      const d = await page.evaluate(() => {
        const cols = Array.from(document.querySelectorAll('.colonne-construction'));
        return {
          consigne: (document.querySelector('.consigne') || {}).textContent || '',
          nbColonnes: cols.length,
          verrouillees: cols.filter((c) => c.classList.contains('colonne-donnee')).length,
          remplies: cols.map((c) => c.querySelectorAll('.case-construction.remplie').length),
          cliquables: cols.map((c) => c.querySelectorAll('.case-construction:not([disabled])').length),
          grille: document.querySelectorAll('.axe-graduation').length,
          legendes: Array.from(document.querySelectorAll('.legende-colonne')).map((l) => l.textContent)
        };
      });
      ok(d.nbColonnes === 4, `Effectifs, manche ${manche} : quatre lieux`, d.nbColonnes);
      ok(d.verrouillees === 3, `Effectifs, manche ${manche} : 3 barres données, 1 à construire`, d.verrouillees);
      ok(d.cliquables.filter((c) => c > 0).length === 1,
        `Effectifs, manche ${manche} : seule la barre manquante est manipulable`, d.cliquables);
      ok(d.grille > 0, `Effectifs, manche ${manche} : diagramme gradué`, d.grille);
      d.legendes.forEach((l) => lieuxVus.add(l));

      const m = d.consigne.match(/^(\d+) petites bêtes/);
      ok(!!m, `Effectifs, manche ${manche} : l'énoncé donne le total`, d.consigne.slice(0, 60));
      const attendu = Number(m[1]) - d.remplies.reduce((a, b) => a + b, 0);
      ok(attendu >= 1, `Effectifs, manche ${manche} : barre déduite par soustraction`, `= ${attendu}`);
      ok(/Complète le diagramme avec la barre correspondant à l’effectif/.test(d.consigne),
        `Effectifs, manche ${manche} : consigne sur le modèle attendu`);

      const iCible = d.remplies.indexOf(0);
      await page.evaluate(({ i, h }) => {
        document.querySelectorAll('.colonne-construction')[i].querySelectorAll('.case-construction')[h - 1].click();
      }, { i: iCible, h: attendu });
      await page.waitForTimeout(80);
      await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mon diagramme' }).click();
      await page.waitForTimeout(250);
      const fb = await page.evaluate(() => (document.getElementById('zone-feedback') || {}).className || '');
      ok(/feedback-succes/.test(fb), `Effectifs, manche ${manche} : bonne barre → succès`, fb);
      await page.locator('#bouton-suivant').click();
      await page.waitForTimeout(400);
    }
    ok(lieuxVus.size > 4, 'Les lieux varient d’une manche à l’autre', `${lieuxVus.size} lieux distincts sur 4 manches`);
    const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]'));
    const s = sessions.find((x) => x.competence === 'diagramme-completer-ce2');
    ok(s && s.score === 4 && s.total === 4 && s.module === 'M39',
      'Contrat v1 : une session « diagramme-completer-ce2 » sur 4 manches', JSON.stringify(s || {}));
    const res = await page.evaluate(() => ({
      etoiles: document.querySelectorAll('.etoile.pleine').length,
      confettis: document.querySelectorAll('.confetti').length
    }));
    ok(res.etoiles === 3 && res.confettis > 0, 'Écran de résultats : 3 étoiles et confettis', JSON.stringify(res));
  }

  // ---- Le carnet à trous du jardinier : 3 manches ----
  await ouvrir('tableau-double-entree-deduction-ce2');
  {
    const titre = await page.evaluate(() => (document.getElementById('titre-jeu-courant') || {}).textContent);
    ok(titre === 'Le carnet à trous du jardinier', 'Titre affiché en partie', titre);
    for (let manche = 1; manche <= 3; manche++) {
      const prog = await page.evaluate(() => (document.getElementById('progression-jeu') || {}).textContent);
      ok(prog === `Manche ${manche} / 3`, `Carnet, manche ${manche} : progression sur 3`, prog);

      const t = await page.evaluate(() => ({
        cases: document.querySelectorAll('.cellule-deduction').length,
        aTrouver: document.querySelectorAll('.cellule-deduction.a-trouver, .cellule-deduction.active').length,
        lignes: document.querySelectorAll('.tableau-deduction tbody tr').length,
        colonnes: document.querySelectorAll('.tableau-deduction thead th').length - 1,
        pave: document.querySelectorAll('.pave-numerique').length,
        boutonActif: !!document.querySelector('#zone-jeu .bouton-principal:not([disabled])')
      }));
      ok(t.cases === 15, `Carnet, manche ${manche} : 15 cases (8 données + 7 totaux)`, t.cases);
      ok(t.aTrouver === 7, `Carnet, manche ${manche} : 7 cases à retrouver`, t.aTrouver);
      ok(t.lignes === 5 && t.colonnes === 3, `Carnet, manche ${manche} : 4 espèces + totaux`, `${t.lignes}×${t.colonnes}`);
      ok(t.pave === 1, `Carnet, manche ${manche} : saisie au pavé diégétique`);
      ok(!t.boutonActif, `Carnet, manche ${manche} : validation inactive tant que tout n'est pas rempli`);

      const resolu = await page.evaluate(() => {
        const lire = (cle) => {
          const td = document.querySelector(`.cellule-deduction[data-cle="${cle}"]`);
          const t = (td.textContent || '').trim();
          return /^\d+$/.test(t) ? Number(t) : null;
        };
        const cles = Array.from(document.querySelectorAll('.cellule-deduction')).map((td) => td.dataset.cle);
        const groupes = [];
        for (let i = 0; i < 4; i++) groupes.push(['d:' + i + ':0', 'd:' + i + ':1', 'L:' + i]);
        for (let j = 0; j < 2; j++) groupes.push(['d:0:' + j, 'd:1:' + j, 'd:2:' + j, 'd:3:' + j, 'C:' + j]);
        groupes.push(['L:0', 'L:1', 'L:2', 'L:3', 'T']);
        groupes.push(['C:0', 'C:1', 'T']);
        const val = {};
        cles.forEach((k) => { const v = lire(k); if (v !== null) val[k] = v; });
        const ordre = [];
        let progres = true;
        while (progres) {
          progres = false;
          groupes.forEach((g) => {
            const inc = g.filter((k) => val[k] === undefined);
            if (inc.length !== 1) return;
            const cle = inc[0];
            const dernier = g[g.length - 1];
            val[cle] = (cle === dernier)
              ? g.slice(0, -1).reduce((s, k) => s + val[k], 0)
              : val[dernier] - g.slice(0, -1).filter((k) => k !== cle).reduce((s, k) => s + val[k], 0);
            ordre.push(cle);
            progres = true;
          });
        }
        return { complet: cles.every((k) => val[k] !== undefined), ordre, val };
      });
      ok(resolu.complet, `Carnet, manche ${manche} : se résout entièrement par déductions successives`,
        `${resolu.ordre.length} déductions`);

      for (let k = 0; k < 7; k++) {
        const cle = await page.evaluate(() => (document.querySelector('.cellule-deduction.active') || {}).dataset.cle);
        if (!cle) break;
        await taper(resolu.val[cle]);
      }
      const avant = await page.evaluate(() => ({
        juges: document.querySelectorAll('.cellule-deduction.correct, .cellule-deduction.incorrect').length,
        boutonActif: !!document.querySelector('#zone-jeu .bouton-principal:not([disabled])')
      }));
      ok(avant.juges === 0, `Carnet, manche ${manche} : rien n'est jugé avant la validation`, avant.juges);
      ok(avant.boutonActif, `Carnet, manche ${manche} : validation possible une fois les 7 saisies faites`);

      await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mon carnet' }).click();
      await page.waitForTimeout(300);
      const fb = await page.evaluate(() => ({
        classe: (document.getElementById('zone-feedback') || {}).className || '',
        verts: document.querySelectorAll('.cellule-deduction.correct').length
      }));
      ok(/feedback-succes/.test(fb.classe), `Carnet, manche ${manche} : déductions justes → succès`, fb.classe);
      ok(fb.verts === 7, `Carnet, manche ${manche} : les 7 cases passent au vert`, fb.verts);
      await page.locator('#bouton-suivant').click();
      await page.waitForTimeout(400);
    }
    const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]'));
    const s = sessions.find((x) => x.competence === 'tableau-double-entree-deduction-ce2');
    ok(s && s.score === 3 && s.total === 3 && s.module === 'M39',
      'Contrat v1 : une session « tableau-double-entree-deduction-ce2 » sur 3 manches', JSON.stringify(s || {}));
    const deux = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]')
      .filter((x) => /diagramme-completer-ce2|tableau-double-entree-deduction-ce2/.test(x.competence)).length);
    ok(deux === 2, 'Les deux compétences sont suivies séparément, une session chacune', deux);
  }

  // =============== 4. UNE ERREUR EST BIEN SIGNALÉE (§18) ===============
  {
    await ouvrir('diagramme-completer-ce2');
    const d = await page.evaluate(() => {
      const cols = Array.from(document.querySelectorAll('.colonne-construction'));
      return { remplies: cols.map((c) => c.querySelectorAll('.case-construction.remplie').length),
               consigne: (document.querySelector('.consigne') || {}).textContent || '' };
    });
    const total = Number(d.consigne.match(/^(\d+)/)[1]);
    const attendu = total - d.remplies.reduce((a, b) => a + b, 0);
    const iCible = d.remplies.indexOf(0);
    const faux = attendu > 1 ? attendu - 1 : attendu + 1;
    await page.evaluate(({ i, h }) => {
      document.querySelectorAll('.colonne-construction')[i].querySelectorAll('.case-construction')[h - 1].click();
    }, { i: iCible, h: faux });
    await page.waitForTimeout(80);
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mon diagramme' }).click();
    await page.waitForTimeout(300);
    const apres = await page.evaluate(() => ({
      classe: (document.getElementById('zone-feedback') || {}).className || '',
      correction: (document.querySelector('.bloc-correction') || {}).textContent || '',
      hauteurRevelee: document.querySelectorAll('.colonne-construction')[
        Array.from(document.querySelectorAll('.colonne-construction')).findIndex((c) => !c.classList.contains('colonne-donnee'))
      ].querySelectorAll('.case-construction.remplie').length
    }));
    ok(/feedback-erreur/.test(apres.classe), 'Barre fausse → manche ratée', apres.classe);
    ok(apres.correction.includes('La bonne réponse : ' + attendu),
      'CHARTE §18 : la bonne valeur est donnée, avec le calcul', apres.correction);
    ok(apres.hauteurRevelee === attendu,
      'CHARTE §18 : la bonne barre est MONTRÉE, pas seulement énoncée', apres.hauteurRevelee);
  }

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
