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

/* Lecture de l'état du tableau : clés de cases, contenu réel (cle du jeton
   d'après son aria-label), marques de correction. */
const etat = (page) => page.evaluate(() => {
  const cases = Array.from(document.querySelectorAll('.cellule-placement'));
  return {
    consignes: Array.from(document.querySelectorAll('.consigne')).map((c) => c.textContent),
    consigne: (Array.from(document.querySelectorAll('.consigne')).pop() || {}).textContent || '',
    nbLignes: document.querySelectorAll('.tableau-placement tbody tr').length,
    nbColonnes: document.querySelectorAll('.tableau-placement thead th').length - 1,
    nbCases: cases.length,
    cles: cases.map((c) => c.dataset.cle),
    contenu: cases.map((c) => Array.from(c.querySelectorAll('.objet-mini')).map((b) => b.getAttribute('aria-label'))),
    vivier: Array.from(document.querySelectorAll('.jeton-objet')).map((b) => b.getAttribute('aria-label')),
    fausses: cases.filter((c) => c.classList.contains('case-fausse')).map((c) => c.dataset.cle),
    attendues: cases.filter((c) => c.classList.contains('case-attendue')).map((c) => c.dataset.cle),
    malPlaces: document.querySelectorAll('.objet-mini.mal-place').length,
    note: (document.querySelector('.note-rangement') || {}).textContent || '',
    bouton: (document.querySelector('#zone-jeu .bouton-principal:not([hidden])') || {}).textContent || '',
    boutonActif: !!document.querySelector('#zone-jeu .bouton-principal:not([hidden]):not([disabled])'),
    pave: document.querySelectorAll('.pave-numerique').length,
    feedback: (document.getElementById('zone-feedback') || {}).className || '',
    suivant: !!document.querySelector('#bouton-suivant:not([hidden])')
  };
});

/* Le vivier n'expose que « <singulier> <couleur> » ; la clé d'une case est
   « <objetId>|<teinteId> ». On reconstruit la correspondance depuis la page. */
const dico = (page) => page.evaluate(() => {
  const d = JSON.parse(document.getElementById('donnees-jeu').textContent);
  const parLabel = {};
  Object.keys(d.objets).forEach((oid) => d.teintes.forEach((t) => {
    parLabel[d.objets[oid].singulier + ' ' + (d.objets[oid].genre === 'f' ? t.femSing : t.mascSing)] = oid + '|' + t.id;
  }));
  return parLabel;
});


/* La case visée n'est plus signalée dans le tableau pendant la question (c'est
   justement ce qu'il faut trouver) : on la déduit de l'ÉNONCÉ, comme le ferait
   un enfant, en recomposant « Combien de <pluriel> <couleur accordée> ». */
const cibleQuestion = (page) => page.evaluate(() => {
  const enonce = (Array.from(document.querySelectorAll('.consigne')).pop() || {}).textContent || '';
  const d = JSON.parse(document.getElementById('donnees-jeu').textContent);
  const elision = (m) => /^[aeiouyàâéèêëîïôöùûü]/i.test(m) ? 'd\u2019' + m : 'de ' + m;
  let trouve = null;
  Object.keys(d.objets).forEach((oid) => d.teintes.forEach((t) => {
    const o = d.objets[oid];
    const frag = 'Combien ' + elision(o.pluriel) + ' ' + (o.genre === 'f' ? t.fem : t.masc) + ' ';
    if (enonce.indexOf(frag) === 0) trouve = oid + '|' + t.id;
  }));
  return trouve;
});

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  const url = `http://localhost:${port}/jeux/M39-tableaux-diagrammes.html?palier=cp`;
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'Test', niveau: 'CP' }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.removeItem('mayeutik-sessions');
  });

  const lancer = async () => {
    await page.goto(url);
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => document.querySelector('[data-jeu="cp-tableau-double-entree"]').click());
    await page.waitForSelector('.tableau-placement');
    await page.waitForTimeout(120);
  };

  const LABELS = await (async () => { await lancer(); return dico(page); })();

  // Pose le jeton d'indice `i` du vivier dans la case `cle`.
  async function poser(i, cle) {
    await page.locator('.jeton-objet').nth(i).click();
    await page.locator(`.cellule-placement[data-cle="${cle}"]`).click();
    await page.waitForTimeout(30);
  }

  // ---- 1. Structure et progression de difficulté sur les 3 manches ----
  {
    const attendu = [{ cases: 4, objets: 10, couleurs: 2 }, { cases: 6, objets: 15, couleurs: 3 }, { cases: 6, objets: 15, couleurs: 3 }];
    const pairesVues = [];
    for (let manche = 0; manche < 3; manche++) {
      const e = await etat(page);
      const a = attendu[manche];
      ok(e.nbCases === a.cases, `Manche ${manche + 1} : ${a.cases} cases`, `${e.nbLignes}×${e.nbColonnes} = ${e.nbCases}`);
      ok(e.vivier.length === a.objets, `Manche ${manche + 1} : ${a.objets} objets à placer`, e.vivier.length);
      const teintes = new Set(e.cles.map((c) => c.split('|')[1]));
      ok(teintes.size === a.couleurs, `Manche ${manche + 1} : ${a.couleurs} couleurs`, [...teintes].join(','));
      const objets = [...new Set(e.cles.map((c) => c.split('|')[0]))].sort();
      ok(objets.length === 2, `Manche ${manche + 1} : 2 sortes d'objets`, objets.join('+'));
      pairesVues.push(objets.join('+'));
      // 2×3 ou 3×2, jamais autre chose.
      ok((e.nbLignes === 2 && e.nbColonnes === a.couleurs) || (e.nbLignes === a.couleurs && e.nbColonnes === 2),
        `Manche ${manche + 1} : orientation 2×N ou N×2`, `${e.nbLignes}×${e.nbColonnes}`);

      // On range tout CORRECTEMENT pour passer à la manche suivante.
      let restant = a.objets;
      while (restant > 0) {
        const label = (await etat(page)).vivier[0];
        await poser(0, LABELS[label]);
        restant--;
      }
      await page.locator('#zone-jeu .bouton-principal').click();
      await page.waitForTimeout(150);
      const apres = await etat(page);
      ok(apres.pave === 1, `Manche ${manche + 1} : la question finale suit le tableau validé`);
      ok(/^Combien /.test(apres.consigne) && /y a-t-il dans le tableau/.test(apres.consigne),
        `Manche ${manche + 1} : question portant sur le contenu du tableau`, apres.consigne);
      // On répond juste, en comptant réellement la case visée.
      const cible = await cibleQuestion(page);
      const n = (await etat(page)).contenu[(await etat(page)).cles.indexOf(cible)].length;
      for (const ch of String(n).split('')) {
        await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
      }
      await page.locator('.touche-valider').first().click();
      await page.waitForTimeout(200);
      const fin = await etat(page);
      ok(/feedback-succes/.test(fin.feedback), `Manche ${manche + 1} : tableau juste + question juste → succès`, fin.feedback);
      await page.locator('#bouton-suivant').click();
      if (manche < 2) await page.waitForSelector('.tableau-placement');
      await page.waitForTimeout(180);
    }
    ok(new Set(pairesVues).size === 3, 'Les 3 paires d’objets sortent toutes dans une partie', pairesVues.join(' / '));
  }

  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]')
    .filter((s) => s.competence === 'cp-tableau-double-entree'));
  ok(sessions.length === 1 && sessions[0].score === 3 && sessions[0].total === 3,
    'Contrat de données v1 : une session 3/3', JSON.stringify(sessions[0] || {}));

  // ---- 2. Tirage aléatoire des paires sur plusieurs parties ----
  {
    const ordres = [];
    for (let partie = 0; partie < 8; partie++) {
      await lancer();
      const e = await etat(page);
      ordres.push([...new Set(e.cles.map((c) => c.split('|')[0]))].sort().join('+'));
    }
    ok(new Set(ordres).size >= 2, 'La paire de la manche 1 varie d’une partie à l’autre', ordres.join(' '));
  }

  // ---- 3. L'ERREUR EST AUTORISÉE, puis corrigée ----
  await lancer();
  {
    const e0 = await etat(page);
    const labelPremier = e0.vivier[0];
    const cleJuste = LABELS[labelPremier];
    const cleFausse = e0.cles.find((c) => c !== cleJuste);

    await poser(0, cleFausse);
    const e1 = await etat(page);
    ok(e1.contenu[e1.cles.indexOf(cleFausse)].length === 1,
      'Un objet peut être posé dans une MAUVAISE case (le geste n’est plus refusé)',
      `${labelPremier} → ${cleFausse}`);
    ok(e1.vivier.length === e0.vivier.length - 1, 'L’objet a bien quitté le vivier', e1.vivier.length);

    // On range tout le reste correctement : une seule erreur volontaire.
    while ((await etat(page)).vivier.length > 0) {
      const label = (await etat(page)).vivier[0];
      await poser(0, LABELS[label]);
    }
    const avantValidation = await etat(page);
    ok(avantValidation.boutonActif && /Valider/.test(avantValidation.bouton),
      'La validation n’est proposée qu’une fois tout posé', avantValidation.bouton);

    await page.locator('#zone-jeu .bouton-principal').click();
    await page.waitForTimeout(150);
    const e2 = await etat(page);
    ok(e2.fausses.length === 1 && e2.fausses[0] === cleFausse,
      'CHARTE §18 : la case erronée est signalée en rouge', e2.fausses.join(','));
    ok(e2.attendues.includes(cleJuste), 'CHARTE §18 : la case attendue est signalée en vert', e2.attendues.join(','));
    ok(e2.malPlaces === 1, 'L’objet fautif lui-même est entouré', e2.malPlaces);
    ok(e2.pave === 0, 'Pas de question finale tant que le tableau est faux');
    ok(/Je replace/.test(e2.bouton) && e2.boutonActif, 'Un bouton propose de replacer les objets mal rangés', e2.bouton);

    // Vérification des couleurs : rouge sur la case fausse, vert sur l'attendue.
    const teintes = await page.evaluate(({ f, v }) => {
      const lire = (cle) => {
        const cs = getComputedStyle(document.querySelector(`.cellule-placement[data-cle="${cle}"]`));
        return { outline: cs.outlineColor, fond: cs.backgroundColor };
      };
      return { fausse: lire(f), attendue: lire(v) };
    }, { f: cleFausse, v: cleJuste });
    const estRouge = (c) => { const m = c.match(/\d+/g); return m && +m[0] > +m[1] + 40 && +m[0] > +m[2] + 40; };
    const estVert = (c) => { const m = c.match(/\d+/g); return m && +m[1] > +m[0] + 20 && +m[1] > +m[2] - 10; };
    ok(estRouge(teintes.fausse.outline), 'La case fausse est bien ROUGE', teintes.fausse.outline);
    ok(estVert(teintes.attendue.outline), 'La case attendue est bien VERTE', teintes.attendue.outline);

    await page.locator('#zone-jeu .bouton-principal').click();
    await page.waitForTimeout(150);
    const e3 = await etat(page);
    ok(e3.vivier.length === 1 && e3.vivier[0] === labelPremier,
      'Seul l’objet mal rangé revient au vivier — le reste ne bouge pas', e3.vivier);
    ok(!e3.contenu[e3.cles.indexOf(cleFausse)].includes(labelPremier),
      'L’intrus a quitté la mauvaise case, qui garde ses objets légitimes',
      e3.contenu[e3.cles.indexOf(cleFausse)]);
    ok(e3.fausses.length === 0 && e3.attendues.length === 0, 'Les marques de correction sont effacées');
    ok(/Valider/.test(e3.bouton), 'Le bouton reprend son rôle de validation', e3.bouton);

    // On corrige et on revalide : le tableau devient juste.
    await poser(0, cleJuste);
    await page.locator('#zone-jeu .bouton-principal').click();
    await page.waitForTimeout(150);
    const e4 = await etat(page);
    ok(e4.pave === 1, 'Après correction, la question finale s’affiche');
    ok(/juste/.test(e4.note), 'Le tableau corrigé est reconnu juste', e4.note);

    // ... mais la manche reste perdue : la correction n'efface pas l'erreur.
    const cible = await cibleQuestion(page);
    const e5 = await etat(page);
    const n = e5.contenu[e5.cles.indexOf(cible)].length;
    for (const ch of String(n).split('')) {
      await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
    }
    await page.locator('.touche-valider').first().click();
    await page.waitForTimeout(200);
    const e6 = await etat(page);
    ok(/feedback-erreur/.test(e6.feedback),
      'CHARTE §18 : un rangement corrigé ne rattrape pas le score de la manche', e6.feedback);
    ok(e6.suivant, 'Le bouton Suivant apparaît quand même');
  }

  // ---- 4. Reprendre un objet déjà posé ----
  await lancer();
  {
    /* Règle : tant que l'enfant a un objet EN MAIN (sélectionné d'office),
       toucher une case y pose cet objet — y compris en visant l'un de ses
       objets, sinon une case pleine deviendrait impossible à remplir. Une fois
       le vivier vide, plus rien n'est en main : toucher un objet le reprend,
       ce qui est la correction. Le glisser, lui, marche à tout moment. */
    const e0 = await etat(page);

    // (a) En cours de rangement : on GLISSE un objet posé vers une autre case.
    const cle = LABELS[e0.vivier[0]];
    await poser(0, cle);
    const autre = e0.cles.find((c) => c !== cle);
    const src = await page.locator(`.cellule-placement[data-cle="${cle}"] .objet-mini`).first().boundingBox();
    const dst = await page.locator(`.cellule-placement[data-cle="${autre}"]`).boundingBox();
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const e1 = await etat(page);
    ok(e1.contenu[e1.cles.indexOf(cle)].length === 0 && e1.contenu[e1.cles.indexOf(autre)].length === 1,
      'En cours de rangement, un objet posé se corrige au GLISSER vers une autre case',
      `${cle} → ${autre}`);

    // (b) Vivier vide : toucher un objet posé le reprend.
    while ((await etat(page)).vivier.length > 0) {
      const e = await etat(page);
      const label = e.vivier[0];
      await page.locator(`.cellule-placement[data-cle="${LABELS[label]}"]`).click();
      await page.waitForTimeout(35);
    }
    const pleine = await etat(page);
    ok(pleine.vivier.length === 0, 'Tout est posé, plus rien en main');
    const cleAvecObjet = pleine.cles.find((c, i) => pleine.contenu[i].length > 0);
    await page.locator(`.cellule-placement[data-cle="${cleAvecObjet}"] .objet-mini`).first().click();
    await page.waitForTimeout(80);
    const e2 = await etat(page);
    ok(e2.vivier.length === 1,
      'Vivier vide : toucher un objet posé le reprend', e2.vivier);
    ok(e2.contenu[e2.cles.indexOf(cleAvecObjet)].length === pleine.contenu[pleine.cles.indexOf(cleAvecObjet)].length - 1,
      'La case perd bien l’objet repris');
  }

  // ---- 5. Question finale fausse ----
  await lancer();
  {
    while ((await etat(page)).vivier.length > 0) {
      const label = (await etat(page)).vivier[0];
      await poser(0, LABELS[label]);
    }
    await page.locator('#zone-jeu .bouton-principal').click();
    await page.waitForTimeout(150);
    const cible = await cibleQuestion(page);
    const e = await etat(page);
    const vrai = e.contenu[e.cles.indexOf(cible)].length;
    const faux = vrai === 9 ? 8 : vrai + 1;
    await page.locator('.touche-pave', { hasText: new RegExp('^' + faux + '$') }).first().click();
    await page.locator('.touche-valider').first().click();
    await page.waitForTimeout(200);
    const fin = await etat(page);
    ok(/feedback-erreur/.test(fin.feedback), 'Question finale fausse → manche ratée', fin.feedback);
    const corr = await page.evaluate(() => (document.querySelector('.bloc-correction') || {}).textContent || '');
    ok(corr.includes('Ta réponse : ' + faux) && corr.includes('La bonne réponse : ' + vrai),
      'CHARTE §18 : réponse donnée et réponse attendue affichées', corr);
    const vert = await page.evaluate((c) => document.querySelector(`.cellule-placement[data-cle="${c}"]`).classList.contains('case-attendue'), cible);
    ok(vert, 'La case sur laquelle portait la question est révélée en vert');
  }

  // ---- 6. La couleur est DANS le dessin, pas une pastille à côté ----
  await lancer();
  {
    const rendu = await page.evaluate(() => {
      const teintes = JSON.parse(document.getElementById('donnees-jeu').textContent).teintes;
      const hexs = teintes.map((t) => t.hex.toLowerCase());
      const jetons = Array.from(document.querySelectorAll('.jeton-objet'));
      return {
        nbJetons: jetons.length,
        // Un jeton = exactement UN dessin, et rien d'autre (pas de pastille).
        sansDessinUnique: jetons.filter((j) => j.querySelectorAll('svg.objet-dessin').length !== 1).length,
        enfantsEnTrop: jetons.filter((j) => j.children.length !== 1).length,
        // La teinte est portée par une forme du corps du dessin.
        sansTeinteDansLeDessin: jetons.filter((j) => {
          const formes = Array.from(j.querySelectorAll('svg.objet-dessin *'));
          return !formes.some((f) => hexs.includes(String(f.getAttribute('fill') || '').toLowerCase()));
        }).length,
        // Aucun cercle/pastille de couleur pleine posé À CÔTÉ du dessin.
        pastilles: document.querySelectorAll('.jeton-objet > span, .jeton-objet > i, .objet-mini > span').length,
        // Les en-têtes de sorte sont dessinés en gris neutre, sans teinte de jeu.
        enteteTeintee: Array.from(document.querySelectorAll('.tableau-placement th svg.objet-dessin *'))
          .filter((f) => hexs.includes(String(f.getAttribute('fill') || '').toLowerCase())).length
      };
    });
    ok(rendu.sansDessinUnique === 0, `Chaque jeton porte un dessin unique (${rendu.nbJetons} jetons)`, rendu.sansDessinUnique);
    ok(rendu.enfantsEnTrop === 0, 'Aucun élément supplémentaire à côté du dessin', rendu.enfantsEnTrop);
    ok(rendu.sansTeinteDansLeDessin === 0, 'La couleur remplit une forme DU dessin lui-même', rendu.sansTeinteDansLeDessin);
    ok(rendu.pastilles === 0, 'Aucune pastille de couleur apposée', rendu.pastilles);
    ok(rendu.enteteTeintee === 0, 'Les en-têtes de sorte restent non peints (gris neutre)', rendu.enteteTeintee);

    // Deux objets de même sorte mais de couleurs différentes rendent bien deux dessins différents.
    const variantes = await page.evaluate(() => {
      const par = {};
      Array.from(document.querySelectorAll('.jeton-objet')).forEach((j) => {
        const l = j.getAttribute('aria-label');
        const sorte = l.split(' ')[0];
        (par[sorte] = par[sorte] || new Set()).add(j.querySelector('svg').innerHTML);
      });
      return Object.keys(par).map((k) => [k, par[k].size]);
    });
    ok(variantes.every(([, n]) => n >= 2), 'Une même sorte apparaît en plusieurs coloris distincts', JSON.stringify(variantes));
  }

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
