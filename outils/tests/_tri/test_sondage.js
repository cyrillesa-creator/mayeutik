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

const etat = (page) => page.evaluate(() => ({
  consigne: (document.querySelector('.consigne') || {}).textContent || '',
  bêtes: document.querySelectorAll('.bete-population').length,
  comptees: document.querySelectorAll('.bete-population.comptee').length,
  marques: Array.from(document.querySelectorAll('.tally-marques')).map((c) => c.textContent.replace(/\s/g, '')),
  paquets: Array.from(document.querySelectorAll('.tally-marques')).map((c) => c.querySelectorAll('.tally-paquet').length),
  totaux: Array.from(document.querySelectorAll('.cellule-total')).map((c) => c.textContent),
  aSaisir: document.querySelectorAll('.cellule-total.a-saisir').length,
  pave: document.querySelectorAll('.pave-numerique').length,
  casesDiagramme: document.querySelectorAll('.case-construction').length,
  casesRemplies: document.querySelectorAll('.case-construction.remplie').length,
  graduations: document.querySelectorAll('.axe-graduation').length,
  feedback: (document.getElementById('zone-feedback') || {}).className || '',
  suivant: !!document.querySelector('#bouton-suivant:not([hidden])')
}));

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  const url = `http://localhost:${port}/jeux/M39-tableaux-diagrammes.html`;
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'Test', niveau: 'CP' }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.removeItem('mayeutik-sessions');
  });

  const lancer = async () => {
    await page.goto(url);
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => document.querySelector('[data-jeu="cp-recueil-diagramme"]').click());
    await page.waitForSelector('.bete-population');
    await page.waitForTimeout(120);
  };

  // ---- Plafond de 15 bêtes, sur beaucoup de tirages ----
  const totaux = [];
  for (let i = 0; i < 25; i++) {
    await lancer();
    const e = await etat(page);
    totaux.push(e.bêtes);
    const m = e.consigne.match(/classe de (\d+) élèves/);
    if (!m || Number(m[1]) !== e.bêtes) {
      echecs++; console.log(`  ✗ tirage ${i} : consigne « ${e.consigne.slice(0, 50)} » vs ${e.bêtes} bêtes`);
    }
  }
  ok(Math.max(...totaux) <= 15, `Plafond respecté sur 25 tirages : max ${Math.max(...totaux)} bêtes (min ${Math.min(...totaux)})`);
  ok(totaux.every((t) => t >= 3), 'Chaque tirage a au moins une bête par espèce', `min ${Math.min(...totaux)}`);

  // ---- Écran 1, étape A : compter n'affiche AUCUN total ----
  await lancer();
  const depart = await etat(page);
  ok(depart.totaux.every((t) => t === ''), 'Étape A : la colonne Total est vide au départ', depart.totaux);
  await page.locator('.bete-population').first().click();
  await page.waitForTimeout(80);
  const apres1 = await etat(page);
  ok(apres1.comptees === 1 && apres1.marques.join('').length === 1,
    'Étape A : un clic ajoute une marque de décompte', apres1.marques);
  ok(apres1.totaux.every((t) => t === ''),
    'Étape A : AUCUN total ne s\'affiche pendant le comptage (pas de remplissage automatique)', apres1.totaux);
  ok(apres1.pave === 0, 'Étape A : le pavé numérique n\'est pas encore proposé');

  // On compte tout le reste.
  const n = depart.bêtes;
  for (let i = 1; i < n; i++) {
    await page.locator('.bete-population:not(.comptee)').first().click();
    await page.waitForTimeout(40);
  }
  const apresComptage = await etat(page);
  ok(apresComptage.comptees === n, `Étape A : les ${n} bêtes sont comptées`);
  ok(apresComptage.marques.reduce((s, m) => s + m.length, 0) === n,
    'Étape A : autant de marques que de bêtes', apresComptage.marques);
  ok(apresComptage.paquets.every((p, i) => p === Math.ceil(apresComptage.marques[i].length / 5)),
    'Étape A : les marques sont groupées par paquets de cinq', apresComptage.paquets);

  // ---- Écran 1, étape B : report au pavé ----
  ok(apresComptage.pave === 1, 'Étape B : le pavé numérique apparaît une fois tout compté');
  ok(apresComptage.aSaisir >= 1, 'Étape B : les cases de total sont à remplir', apresComptage.aSaisir);
  ok(apresComptage.totaux.every((t) => t === '?'),
    'Étape B : aucun total pré-rempli — l\'enfant doit tous les saisir', apresComptage.totaux);

  // On saisit les BONS totaux (lus depuis les marques, comme le ferait l'enfant).
  const vrais = apresComptage.marques.map((m) => m.length);
  for (const v of vrais) {
    for (const chiffre of String(v).split('')) {
      await page.locator('.touche-pave', { hasText: new RegExp('^' + chiffre + '$') }).first().click();
    }
    await page.locator('.touche-valider').first().click();
    await page.waitForTimeout(120);
  }
  await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mes totaux' }).click();
  await page.waitForTimeout(200);
  const apresReport = await etat(page);
  ok(apresReport.totaux.join(',') === vrais.join(','),
    'Étape B : les totaux saisis apparaissent dans la colonne de droite', apresReport.totaux);
  const verts = await page.locator('.cellule-total.correct').count();
  ok(verts === vrais.length, 'Étape B : totaux justes marqués en vert', verts);

  // ---- Transition vers l'écran 2 ----
  await page.locator('.bouton-principal', { hasText: 'Construire le diagramme' }).click();
  await page.waitForTimeout(200);
  const ecran2 = await etat(page);
  ok(ecran2.bêtes === 0 && ecran2.casesDiagramme > 0, 'Écran 2 : on quitte le comptage pour le diagramme');
  ok(ecran2.graduations > 0, 'Écran 2 : une graduation chiffrée borde le diagramme', ecran2.graduations);
  ok(ecran2.casesRemplies === 0, 'Écran 2 : le diagramme démarre vide (rien de pré-construit)');
  const rappel = await page.evaluate(() => Array.from(document.querySelectorAll('.tableau-tally tbody tr'))
    .map((tr) => tr.lastElementChild.textContent));
  ok(rappel.join(',') === vrais.join(','), 'Écran 2 : le tableau CORRECT est rappelé comme référence', rappel);

  // Le fond quadrillé : chaque case porte une bordure visible.
  const quadrillage = await page.evaluate(() => {
    const c = document.querySelector('.case-construction');
    const cs = getComputedStyle(c);
    return { bordure: cs.borderTopWidth, couleur: cs.borderTopColor, fond: cs.backgroundColor };
  });
  ok(parseFloat(quadrillage.bordure) > 0, 'Écran 2 : quadrillage de fond présent sur chaque case', quadrillage);

  // ---- Construction du diagramme ----
  for (let col = 0; col < vrais.length; col++) {
    await page.evaluate(({ col, h }) => {
      const colonne = document.querySelectorAll('.colonne-construction')[col];
      colonne.querySelectorAll('.case-construction')[h - 1].click();
    }, { col, h: vrais[col] });
    await page.waitForTimeout(60);
  }
  const construit = await etat(page);
  ok(construit.casesRemplies === vrais.reduce((a, b) => a + b, 0),
    'Écran 2 : cliquer une case monte la barre à cette hauteur', `${construit.casesRemplies} cases pour ${vrais.join('+')}`);

  await page.locator('.bouton-principal', { hasText: 'Valider mon diagramme' }).click();
  await page.waitForTimeout(250);
  const fin = await etat(page);
  ok(/feedback-succes/.test(fin.feedback), 'Manche juste sur les deux écrans → succès', fin.feedback);
  ok(fin.suivant, 'Le bouton Suivant apparaît');

  // ---- Contrat de données : une session enregistrée en fin de partie ----
  for (let manche = 0; manche < 4; manche++) {
    if (await page.locator('.bloc-resultats').count()) break;
    const s = await page.$('#bouton-suivant:not([hidden])');
    if (s) { await s.click(); await page.waitForTimeout(250); }
    if (await page.locator('.bete-population').count()) {
      const total = await page.locator('.bete-population').count();
      for (let i = 0; i < total; i++) {
        await page.locator('.bete-population:not(.comptee)').first().click();
        await page.waitForTimeout(30);
      }
      const marques = await page.evaluate(() => Array.from(document.querySelectorAll('.tally-marques'))
        .map((c) => c.textContent.replace(/\s/g, '').length));
      for (const v of marques) {
        for (const ch of String(v).split('')) {
          await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
        }
        await page.locator('.touche-valider').first().click();
        await page.waitForTimeout(100);
      }
      await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider mes totaux' }).click();
      await page.waitForTimeout(200);
      await page.locator('.bouton-principal', { hasText: 'Construire le diagramme' }).click();
      await page.waitForTimeout(200);
      for (let col = 0; col < marques.length; col++) {
        await page.evaluate(({ col, h }) => {
          document.querySelectorAll('.colonne-construction')[col]
            .querySelectorAll('.case-construction')[h - 1].click();
        }, { col, h: marques[col] });
        await page.waitForTimeout(40);
      }
      await page.locator('.bouton-principal', { hasText: 'Valider mon diagramme' }).click();
      await page.waitForTimeout(200);
    }
  }
  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]')
    .filter((s) => s.competence === 'cp-recueil-diagramme'));
  ok(sessions.length >= 1, 'Contrat de données v1 : une session enregistrée', JSON.stringify(sessions[0] || {}));
  ok(sessions.length === 0 || sessions[0].total === 3, 'La session porte sur les 3 manches du mini-jeu', sessions[0] && sessions[0].total);

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 4));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
