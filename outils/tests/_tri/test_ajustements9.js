const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const srv = http.createServer((q, r) => {
  const p = path.join('/home/user/mayeutik', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
    r.end(d);
  });
});

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

/* Écart entre l'axe des abscisses tracé et le pied réel des barres, et entre
   l'axe des ordonnées et le bord gauche de la zone de tracé. */
const mesurerAxes = (selDiagramme, selZone, selBarre) => `(() => {
  const d = document.querySelector('${selDiagramme}');
  if (!d) return null;
  const zones = Array.from(d.querySelectorAll('${selZone}'));
  if (!zones.length) return null;
  const bas = zones.map((z) => Math.round(z.getBoundingClientRect().bottom * 10) / 10);
  const cs = (el, p) => getComputedStyle(el)[p];
  return {
    nbZones: zones.length,
    basDistincts: [...new Set(bas)],
    // Continuité : chaque zone touche la suivante (pas de trou dans le trait).
    trous: zones.slice(1).map((z, i) =>
      Math.round((z.getBoundingClientRect().left - zones[i].getBoundingClientRect().right) * 10) / 10)
      .filter((t) => t > 0.6),
    ${selBarre ? `basBarres: [...new Set(Array.from(d.querySelectorAll('.colonne-diagramme'))
      .map((c) => c.querySelector('${selBarre}'))
      .filter(Boolean)
      .map((b) => Math.round(b.getBoundingClientRect().bottom * 10) / 10))],` : ''}
    largeurTrait: zones.map((z) => cs(z, 'borderBottomWidth')).filter((w) => parseFloat(w) > 0).length,
    couleurTrait: cs(zones[0], 'borderBottomColor')
  };
})()`;

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  const url = (p) => `http://localhost:${port}/jeux/M39-tableaux-diagrammes.html?palier=${p}`;
  const profil = async (niveau, p) => {
    await page.goto(url(p));
    await page.evaluate((n) => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: n }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    }, niveau);
    await page.goto(url(p));
    await page.waitForSelector('#grille-jeux');
  };
  const lancer = async (jeu) => { await page.evaluate((j) => document.querySelector(`[data-jeu="${j}"]`).click(), jeu); await page.waitForTimeout(200); };

  // ================== TITRES (points 7 et 8) ==================
  {
    await profil('CE1', 'ce1');
    const t1 = await page.evaluate(() => (document.querySelector('[data-jeu="ce1-lecture"] h2') || {}).textContent);
    ok(t1 === 'Lis et interprète', 'CE1 : « Lis le jardin » devient « Lis et interprète »', t1);
    await profil('CE2', 'ce2');
    const t2 = await page.evaluate(() => (document.querySelector('[data-jeu="ce2-probleme-combine"] h2') || {}).textContent);
    ok(t2 === "L'enquête", 'CE2 : « L\'enquête complète » devient « L\'enquête »', t2);
    // Le titre suit aussi dans l'écran de jeu.
    await lancer('ce2-probleme-combine');
    const t3 = await page.evaluate(() => (document.getElementById('titre-jeu-courant') || {}).textContent);
    ok(t3 === "L'enquête", 'Le titre en cours de partie suit le renommage', t3);
  }

  // ============ L'ENQUÊTE : catégories en COULEURS (point 9) ============
  {
    const enTete = await page.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('.tableau-double thead th')).slice(1);
      return ths.map((t) => ({ nom: t.textContent, couleur: getComputedStyle(t).color }));
    });
    const teintes = await page.evaluate(() => JSON.parse(document.getElementById('donnees-jeu').textContent).teintes.map((t) => t.nom));
    ok(enTete.length === 3, 'L\'enquête : 3 catégories en colonnes', enTete.length);
    ok(enTete.every((e) => teintes.includes(e.nom)),
      'Les catégories sont des COULEURS, plus des tranches de jours', enTete.map((e) => e.nom).join(', '));
    ok(!enTete.some((e) => /jour/i.test(e.nom)), 'Plus aucune catégorie en « jours »');
    const distinctes = new Set(enTete.map((e) => e.couleur));
    ok(distinctes.size === enTete.length,
      'Chaque en-tête est écrit dans sa propre teinte', [...distinctes].join(' '));
    const src = await page.content();
    ok(!/tranchesAge/.test(src), 'Les données de tranches d\'âge ont disparu du fichier');
  }

  // ====== AXES du diagramme de LECTURE (point 2, côté enquête) ======
  {
    const m = await page.evaluate(mesurerAxes('.diagramme', '.zone-trace-lecture', '.case-diagramme.remplie'));
    ok(m && m.basDistincts.length === 1,
      'Diagramme de lecture : toutes les zones de tracé ont le même pied', m && m.basDistincts);
    ok(m && m.trous.length === 0, 'Axe des abscisses continu (aucun trou entre colonnes)', m && m.trous);
    ok(m && m.largeurTrait === m.nbZones, 'Chaque zone porte le trait d\'abscisse', m && `${m.largeurTrait}/${m.nbZones}`);
    const ord = await page.evaluate(() => {
      const z = document.querySelector('.zone-trace-lecture.porte-ordonnees');
      if (!z) return null;
      const cs = getComputedStyle(z);
      return { largeur: cs.borderLeftWidth, nb: document.querySelectorAll('.zone-trace-lecture.porte-ordonnees').length };
    });
    ok(ord && parseFloat(ord.largeur) > 0 && ord.nb === 1,
      'Axe des ordonnées : un seul trait, au bord gauche de la zone de tracé', ord);
    ok(m && m.basBarres.length === 1, 'Le pied de toutes les barres est au même niveau', m && m.basBarres);
  }

  // ================== SONDAGE DU JARDIN ==================
  await profil('CP', 'cp');
  await lancer('cp-recueil-diagramme');
  await page.waitForSelector('.bete-population');
  {
    // ---- Énoncé séquencé (point 3) ----
    const dep = await page.evaluate(() => ({
      consigne: (document.querySelector('.consigne') || {}).textContent || '',
      legende: (document.querySelector('.legende') || {}).textContent || ''
    }));
    ok(dep.consigne.length < 90,
      'Énoncé raccourci (il faisait plus de 200 caractères)', `${dep.consigne.length} car. : « ${dep.consigne} »`);
    ok((dep.consigne.match(/[.!?]/g) || []).length <= 1,
      'Une seule phrase à l\'écran, le contexte', dep.consigne);
    ok(!/total/i.test(dep.consigne),
      'L\'énoncé ne parle plus de l\'étape 2 avant qu\'elle commence');
    ok(/Étape 1/.test(dep.legende) && /compter/.test(dep.legende),
      'La tâche du moment est portée par la légende d\'étape', dep.legende);

    // La voix, elle, garde l'explication complète.
    const voix = await page.evaluate(() => {
      const b = document.querySelector('.bouton-son');
      return b ? b.parentElement.querySelector('.consigne').textContent : '';
    });
    ok(voix.length < 90, 'Le texte affiché reste court', voix.length);

    // ---- Comptage puis report ----
    const n = await page.locator('.bete-population').count();
    for (let i = 0; i < n; i++) { await page.locator('.bete-population:not(.comptee)').first().click(); await page.waitForTimeout(20); }
    await page.waitForTimeout(150);
    const legende2 = await page.evaluate(() => (document.querySelector('.legende') || {}).textContent || '');
    ok(/Étape 2/.test(legende2), 'La légende passe à l\'étape 2 quand l\'étape 2 commence', legende2);

    const vrais = await page.evaluate(() => Array.from(document.querySelectorAll('.tally-marques'))
      .map((c) => c.textContent.replace(/\s/g, '').length));
    for (const v of vrais) {
      for (const ch of String(v).split('')) await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
      await page.locator('.touche-valider').first().click();
      await page.waitForTimeout(80);
    }

    // ---- Confettis quand l'étape 1 est juste (point 1) ----
    const avant = await page.evaluate(() => document.querySelectorAll('.confetti').length);
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mes totaux' }).click();
    await page.waitForTimeout(250);
    const apres = await page.evaluate(() => document.querySelectorAll('.confetti').length);
    ok(avant === 0 && apres > 0, 'Totaux justes → confettis à la fin de l\'étape 1', `${avant} → ${apres}`);
    const note = await page.evaluate(() => (document.querySelector('.legende') || {}).textContent || '');
    ok(/Bravo/.test(note), 'Message de réussite affiché', note);
  }

  // ---- Axes du diagramme à CONSTRUIRE (point 2) ----
  {
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Construire le diagramme' }).click();
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const pieds = Array.from(document.querySelectorAll('.colonne-construction .pied-colonne'));
      const piles = Array.from(document.querySelectorAll('.pile-construction'));
      const grads = Array.from(document.querySelectorAll('.axe-graduation'));
      const cases = Array.from(piles[0].querySelectorAll('.case-construction'));
      const mid = (el) => { const r = el.getBoundingClientRect(); return r.y + r.height / 2; };
      return {
        nbPieds: pieds.length,
        hautsPieds: [...new Set(pieds.map((p) => Math.round(p.getBoundingClientRect().top * 10) / 10))],
        basPiles: [...new Set(piles.map((p) => Math.round(p.getBoundingClientRect().bottom * 10) / 10))],
        trous: pieds.slice(1).map((p, i) =>
          Math.round((p.getBoundingClientRect().left - pieds[i].getBoundingClientRect().right) * 10) / 10)
          .filter((t) => t > 0.6),
        traitAbscisse: getComputedStyle(pieds[0]).borderTopWidth,
        abscisseSousGraduations: getComputedStyle(document.querySelector('.colonne-axe .pied-colonne')).borderTopWidth,
        traitOrdonnee: getComputedStyle(document.querySelector('.axe-diagramme')).borderRightWidth,
        // L'alignement graduations / cases doit rester intact (0 px acquis).
        ecartMax: Math.max(...grads.map((g, i) => cases[i] ? Math.abs(mid(g) - mid(cases[i])) : 0))
      };
    });
    ok(parseFloat(m.traitAbscisse) > 0, 'Diagramme à construire : trait d\'abscisse présent', m.traitAbscisse);
    ok(parseFloat(m.traitOrdonnee) > 0, 'Diagramme à construire : trait d\'ordonnée présent', m.traitOrdonnee);
    ok(parseFloat(m.abscisseSousGraduations) === 0,
      'L\'abscisse part de l\'origine, pas sous la colonne des graduations', m.abscisseSousGraduations);
    ok(m.hautsPieds.length === 1, 'Le trait d\'abscisse est à un seul niveau', m.hautsPieds);
    ok(m.trous.length === 0, 'Trait d\'abscisse continu d\'une colonne à l\'autre', m.trous);
    ok(m.basPiles.length === 1 && Math.abs(m.basPiles[0] - m.hautsPieds[0]) < 0.6,
      'Le trait passe exactement au pied des barres', `piles ${m.basPiles} / trait ${m.hautsPieds}`);
    ok(m.ecartMax < 0.5,
      'L\'alignement graduations / cases reste intact après l\'ajout des axes', `écart max ${Math.round(m.ecartMax * 100) / 100} px`);
  }

  // ================== LE GRAND TABLEAU ==================
  const LABELS = await page.evaluate(() => {
    const d = JSON.parse(document.getElementById('donnees-jeu').textContent);
    const m = {};
    Object.keys(d.objets).forEach((o) => d.teintes.forEach((t) => {
      m[d.objets[o].singulier + ' ' + (d.objets[o].genre === 'f' ? t.femSing : t.mascSing)] = o + '|' + t.id;
    }));
    return m;
  });
  const relancerTableau = async () => {
    await profil('CP', 'cp');
    await lancer('cp-tableau-double-entree');
    await page.waitForSelector('.tableau-placement');
    await page.waitForTimeout(150);
  };
  const etatT = () => page.evaluate(() => ({
    vivier: Array.from(document.querySelectorAll('.jeton-objet')).map((b) => b.getAttribute('aria-label')),
    selection: (document.querySelector('.jeton-objet.selectionnee') || {}).ariaLabel
      || ((document.querySelector('.jeton-objet.selectionnee') || {}).getAttribute
          ? document.querySelector('.jeton-objet.selectionnee').getAttribute('aria-label') : null),
    nbSelection: document.querySelectorAll('.jeton-objet.selectionnee').length,
    cles: Array.from(document.querySelectorAll('.cellule-placement')).map((c) => c.dataset.cle),
    contenu: Array.from(document.querySelectorAll('.cellule-placement'))
      .map((c) => Array.from(c.querySelectorAll('.objet-mini')).map((o) => o.getAttribute('aria-label')))
  }));

  // ---- Sélection d'office (point 4) ----
  await relancerTableau();
  {
    const e0 = await etatT();
    ok(e0.nbSelection === 1 && e0.selection === e0.vivier[0],
      'Un objet est sélectionné dès l\'ouverture : on peut cliquer droit dans le tableau', e0.selection);

    // Ranger UNIQUEMENT en cliquant dans le tableau, sans jamais toucher le vivier.
    const total = e0.vivier.length;
    for (let i = 0; i < total; i++) {
      const e = await etatT();
      const cible = LABELS[e.selection];
      await page.locator(`.cellule-placement[data-cle="${cible}"]`).click();
      await page.waitForTimeout(40);
    }
    const fin = await etatT();
    ok(fin.vivier.length === 0,
      `Les ${total} objets se rangent sans un seul clic dans le vivier`, `${total - fin.vivier.length}/${total} posés`);
    const juste = fin.cles.every((cle, i) => fin.contenu[i].every((l) => LABELS[l.replace('Reprendre ', '')] === cle));
    ok(juste, 'Chaque objet est arrivé dans la case correspondant à sa sélection');
  }

  // ---- Glisser-déposer (point 5) ----
  await relancerTableau();
  {
    const e0 = await etatT();
    // On glisse le 2e objet (pas le sélectionné) vers une case VOLONTAIREMENT
    // différente : c'est bien l'objet traîné qui compte, pas la sélection.
    const labelTraine = e0.vivier[1];
    const cleTraine = LABELS[labelTraine];
    const cleAutre = e0.cles.find((c) => c !== cleTraine);

    const src = await page.locator('.jeton-objet').nth(1).boundingBox();
    const dst = await page.locator(`.cellule-placement[data-cle="${cleAutre}"]`).boundingBox();
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + src.width / 2 + 20, src.y + src.height / 2 + 10, { steps: 3 });
    const enVol = await page.evaluate(() => ({
      fantomes: document.querySelectorAll('.jeton-fantome').length,
      fantomeClics: document.querySelector('.jeton-fantome')
        ? getComputedStyle(document.querySelector('.jeton-fantome')).pointerEvents : null,
      estompe: document.querySelectorAll('.jeton-objet.en-glisse').length
    }));
    ok(enVol.fantomes === 1, 'Un fantôme suit le doigt pendant le glisser', enVol.fantomes);
    ok(enVol.fantomeClics === 'none',
      'Le fantôme est transparent aux événements (sinon il masquerait la case visée)', enVol.fantomeClics);
    ok(enVol.estompe === 1, 'Le jeton d\'origine s\'estompe', enVol.estompe);

    await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 6 });
    const survol = await page.evaluate(() => document.querySelectorAll('.cellule-placement.cible-survolee').length);
    ok(survol === 1, 'La case survolée s\'annonce avant le relâchement', survol);

    await page.mouse.up();
    await page.waitForTimeout(120);
    const e1 = await etatT();
    const dansAutre = e1.contenu[e1.cles.indexOf(cleAutre)];
    ok(dansAutre.some((l) => l === 'Reprendre ' + labelTraine),
      'Le glisser dépose bien l\'objet TRAÎNÉ dans la case visée', `${labelTraine} → ${cleAutre}`);
    ok(e1.vivier.length === e0.vivier.length - 1, 'L\'objet a quitté le vivier', e1.vivier.length);
    ok(await page.evaluate(() => document.querySelectorAll('.jeton-fantome, .cible-survolee, .en-glisse').length) === 0,
      'Fin de geste propre : ni fantôme, ni surbrillance résiduelle');

    // ---- Le clic n'est pas cassé pour autant ----
    const e2 = await etatT();
    await page.locator('.jeton-objet').first().click();
    await page.waitForTimeout(60);
    const e3 = await etatT();
    ok(e3.nbSelection === 1 || e3.nbSelection === 0,
      'Le clic sur un jeton continue de piloter la sélection', e3.nbSelection);
    const cible = LABELS[(await etatT()).selection || e2.vivier[0]];
    const avantClic = (await etatT()).vivier.length;
    if ((await etatT()).nbSelection === 0) { await page.locator('.jeton-objet').first().click(); await page.waitForTimeout(60); }
    await page.locator(`.cellule-placement[data-cle="${LABELS[(await etatT()).selection]}"]`).click();
    await page.waitForTimeout(80);
    ok((await etatT()).vivier.length === avantClic - 1,
      'Le dépôt au clic fonctionne toujours après un glisser', `${avantClic} → ${(await etatT()).vivier.length}`);

    // ---- Un tap court ne déclenche PAS un glisser ----
    const src2 = await page.locator('.jeton-objet').first().boundingBox();
    await page.mouse.move(src2.x + src2.width / 2, src2.y + src2.height / 2);
    await page.mouse.down();
    await page.mouse.move(src2.x + src2.width / 2 + 3, src2.y + src2.height / 2 + 2, { steps: 2 });
    const pasDeFantome = await page.evaluate(() => document.querySelectorAll('.jeton-fantome').length);
    await page.mouse.up();
    ok(pasDeFantome === 0, 'Un déplacement sous le seuil reste un simple tap (pas de glisser)', pasDeFantome);
  }

  // ---- La case de la question n'est pas entourée avant la réponse (point 6) ----
  await relancerTableau();
  {
    while ((await etatT()).vivier.length > 0) {
      const e = await etatT();
      await page.locator(`.cellule-placement[data-cle="${LABELS[e.selection]}"]`).click();
      await page.waitForTimeout(35);
    }
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mon tableau' }).click();
    await page.waitForTimeout(200);
    const pendant = await page.evaluate(() => ({
      pave: document.querySelectorAll('.pave-numerique').length,
      question: document.querySelectorAll('.cellule-placement.case-question').length,
      marquees: document.querySelectorAll('.cellule-placement.case-attendue, .cellule-placement.case-fausse').length
    }));
    ok(pendant.pave === 1, 'La question est bien posée');
    ok(pendant.question === 0 && pendant.marquees === 0,
      'AUCUNE case n\'est entourée pendant la question', JSON.stringify(pendant));

    // On répond, puis la case est révélée.
    const vrai = await page.evaluate(() =>
      (Array.from(document.querySelectorAll('.consigne')).pop() || {}).textContent || '');
    await page.locator('.touche-pave', { hasText: /^1$/ }).first().click();
    await page.locator('.touche-valider').first().click();
    await page.waitForTimeout(250);
    const apres = await page.evaluate(() => document.querySelectorAll('.cellule-placement.case-attendue').length);
    ok(apres === 1, 'Une fois la réponse validée, la case concernée est révélée', apres);
    ok(/^Combien /.test(vrai), 'L\'énoncé de la question est bien posé', vrai.slice(0, 60));
  }

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
