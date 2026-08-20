const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

const srv = http.createServer((q, r) => {
  const p = path.join('/home/user/mayeutik', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' });
    r.end(d);
  });
});

const CLE_BONUS = 'mayeutik-m36-bonus-revele';

async function ouvrir(browser, port, { niveau, sessions, bonusRevele } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 950 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  const u = `http://localhost:${port}/jeux/M36-solides.html`;
  await page.goto(u);
  await page.evaluate(({ niveau, sessions, bonusRevele, cle }) => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: niveau || 'CE2' }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.setItem('mayeutik-sessions', JSON.stringify(sessions || []));
    localStorage.removeItem('mayeutik-m36-solides-etoiles');
    if (bonusRevele) localStorage.setItem(cle, JSON.stringify({ p1: bonusRevele }));
    else localStorage.removeItem(cle);
  }, { niveau, sessions, bonusRevele, cle: CLE_BONUS });
  await page.goto(u);
  await page.waitForSelector('#grille-jeux .card', { state: 'attached' });
  await page.waitForTimeout(200);
  return { page, erreurs };
}

async function jouerManche(page) {
  const rep = page.locator('.rep:not([disabled])').first();
  if (await rep.count()) {
    await rep.click();
  } else {
    // question à tap 3D (J'explore : opposee / areteTap)
    await page.evaluate(() => tapHandler.cb(tapHandler.cibles[0].userData));
  }
  await page.waitForFunction(() => document.getElementById('btnNext').style.display === 'block', { timeout: 5000 });
  const fb = await page.evaluate(() => document.getElementById('feedback').textContent);
  await page.evaluate(() => document.getElementById('btnNext').click());
  await page.waitForTimeout(140);
  return fb;
}

async function jouerPartie(page, jeuId, maxManches) {
  await page.evaluate((id) => document.querySelector(`.card[data-jeu="${id}"]`).click(), jeuId);
  await page.waitForSelector('#qText');
  await page.waitForTimeout(150);
  const fbs = [];
  for (let i = 0; i < maxManches + 2; i++) {
    if (await page.locator('#end:not([hidden])').count()) break;
    fbs.push(await jouerManche(page));
    if (await page.locator('#end:not([hidden])').count()) break;
  }
  return fbs;
}

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ================= Structure de la fusion ================= */
  {
    const { page, erreurs } = await ouvrir(browser, port, { niveau: 'CE2' });
    const ordre = await page.evaluate(() => ORDRE_PALIERS);
    ok(JSON.stringify(ordre) === JSON.stringify(['CP', 'CE1', 'CE2']), 'ORDRE_PALIERS = CP, CE1, CE2', ordre);

    const cartes = await page.evaluate(() => Array.from(document.querySelectorAll('#grille-jeux .card')).map((c) => c.dataset.jeu));
    ok(JSON.stringify(cartes) === JSON.stringify(
      ['decouvre', 'ce2-nommer', 'ce2-compter', 'ce2-polyedre', 'ce2-explorer', 'ce2-devinettes', 'ce2-patrons', 'ce2-cavaliere']),
      'Palier CE2 : Découverte + les 7 mini-jeux repris de M42', cartes);

    // Aucune collision : le CE2 reprend le vocabulaire CE1 en le sur-ensemblant.
    const vocab = await page.evaluate(() => ({
      CP: CONTENU.paliers.CP.vocabulaire,
      CE1: CONTENU.paliers.CE1.vocabulaire,
      CE2: CONTENU.paliers.CE2.vocabulaire
    }));
    ok(vocab.CE1.every((m) => vocab.CE2.includes(m)),
      'Le vocabulaire CE2 est un SUR-ENSEMBLE du CE1 (reprise, pas redéfinition)', vocab.CE2);
    ok(vocab.CP.every((m) => vocab.CE1.includes(m)), 'Le vocabulaire CE1 est un sur-ensemble du CP', vocab.CE1);
    ok(vocab.CE2.includes('patron') && vocab.CE2.includes('cavaliere'),
      'Le CE2 ajoute ses deux notions propres (patron, cavalière)', vocab.CE2);

    // Un seul jeu de solides / de devinettes partagé, pas de duplication.
    const partage = await page.evaluate(() => ({
      solides: Object.keys(CONTENU.solides).length,
      devinettes: CONTENU.devinettes.length,
      explicationPolyUnique: typeof CONTENU.explicationPoly === 'object',
      devinettesCE2: CONTENU.devinettes.filter((d) => ORDRE_PALIERS.indexOf(d.niveau) <= ORDRE_PALIERS.indexOf('CE2')).length
    }));
    ok(partage.solides === 6, 'Un seul jeu de 6 solides partagé par les 3 paliers (pas de prisme)', partage.solides);
    ok(partage.devinettesCE2 === partage.devinettes,
      'Le CE2 hérite de TOUTES les devinettes CP+CE1 (filtre par `niveau`, aucune redéfinie)', partage);

    // Identifiants de compétence uniques dans tout le module (CHARTE §15).
    const ids = await page.evaluate(() =>
      Object.keys(CONTENU.paliers).flatMap((n) => CONTENU.paliers[n].miniJeux.map((mj) => mj.id)));
    ok(ids.length === 15 && new Set(ids).size === 15,
      '15 identifiants de compétence, tous uniques dans le module', ids.length);
    ok(ids.filter((i) => i.startsWith('ce2-')).length === 7, '7 compétences préfixées ce2-', ids.filter((i) => i.startsWith('ce2-')));

    ok(erreurs.length === 0, 'Structure : aucune erreur console / JS', erreurs.slice(0, 4));
    await page.close();
  }

  /* ================= Les 7 mini-jeux CE2 se jouent ================= */
  {
    const { page, erreurs } = await ouvrir(browser, port, { niveau: 'CE2' });

    const attendus = {
      'ce2-nommer': 6, 'ce2-compter': 6, 'ce2-polyedre': 6,
      'ce2-explorer': 6, 'ce2-devinettes': 8, 'ce2-patrons': 5, 'ce2-cavaliere': 3
    };
    const feedbacks = {};
    for (const [jeu, n] of Object.entries(attendus)) {
      const fbs = await jouerPartie(page, jeu, n);
      feedbacks[jeu] = fbs;
      ok(fbs.length === n, `CE2 / ${jeu} : ${n} manches jouées jusqu'au score`, fbs.length);
      await page.click('#btnBack');
      await page.waitForSelector('#grille-jeux .card');
    }

    // Justification par les faces : exigence CE2, sur « Qui suis-je ? » et Devinettes.
    const justifs = ['faces carrées', 'faces rectangulaires', 'base carrée', 'faces planes', 'face plane', 'aucune face plane'];
    ok(feedbacks['ce2-nommer'].every((f) => justifs.some((j) => f.includes(j))),
      'CE2 « Qui suis-je ? » : chaque retour justifie par les faces', feedbacks['ce2-nommer'].slice(0, 2));
    ok(feedbacks['ce2-devinettes'].every((f) => justifs.some((j) => f.includes(j))),
      'CE2 Devinettes : chaque retour justifie par les faces', feedbacks['ce2-devinettes'].slice(0, 2));
    ok(feedbacks['ce2-cavaliere'].every((f) => /pointillés/.test(f)),
      'CE2 Perspective cavalière : le retour explique les arêtes en pointillés', feedbacks['ce2-cavaliere'].slice(0, 1));

    ok(erreurs.length === 0, 'Parcours CE2 : aucune erreur console / JS', erreurs.slice(0, 4));
    await page.close();
  }

  /* ====== CP et CE1 : le retour NE contient PAS la justification ====== */
  {
    const { page, erreurs } = await ouvrir(browser, port, { niveau: 'CP' });
    const fbCP = await jouerPartie(page, 'cp-nommer', 5);
    ok(fbCP.every((f) => !/faces carrées identiques|faces rectangulaires, pas toutes/.test(f)),
      'CP « Qui suis-je ? » : retour inchangé, sans la justification CE2', fbCP.slice(0, 2));
    // Et toujours aucun mot réservé au CE1 au palier CP.
    ok(fbCP.every((f) => !/sommet|arête|polyèdre/i.test(f)),
      'CP : aucun mot réservé au CE1 dans les retours', fbCP.slice(0, 2));
    ok(erreurs.length === 0, 'CP : aucune erreur console / JS', erreurs.slice(0, 4));
    await page.close();
  }

  /* ============ Paquet cadeau CE1 -> CE2 ============ */
  {
    const maitriseCE1 = ['ce1-nommer', 'ce1-compter', 'ce1-polyedre', 'ce1-explorer', 'ce1-devinettes'].map((id) => ({
      profilId: 'p1', module: 'M36', competence: id, score: 6, total: 6,
      date: new Date().toISOString(), duree: 60
    }));
    const { page, erreurs } = await ouvrir(browser, port, { niveau: 'CE1', sessions: maitriseCE1 });

    ok(await page.evaluate(() => !document.getElementById('bloc-bonus').hidden),
      'Palier CE1 maîtrisé : le bloc bonus CE2 apparaît');
    const avant = await page.evaluate(() => ({
      paquet: !document.getElementById('paquet-cadeau').hidden,
      grille: document.getElementById('grille-bonus').hidden
    }));
    ok(avant.paquet && avant.grille, 'Première fois : le paquet cadeau recouvre l’aperçu CE2', avant);

    // L'onglet CE2 est encore verrouillé tant que le paquet n'est pas ouvert.
    const ongletsAvant = await page.evaluate(() => Array.from(document.querySelectorAll('.puce-palier'))
      .map((p) => ({ t: p.textContent.replace('🔒', '').trim(), v: p.classList.contains('verrouille'), d: p.disabled })));
    ok(ongletsAvant.length === 3, '3 onglets de palier affichés', ongletsAvant.map((o) => o.t));
    ok(!ongletsAvant[0].v && !ongletsAvant[1].v && ongletsAvant[2].v && ongletsAvant[2].d,
      'Profil CE1 : CP et CE1 ouverts, CE2 verrouillé 🔒 avant ouverture du paquet', ongletsAvant);

    await page.click('#paquet-cadeau');
    await page.waitForTimeout(700);
    const apres = await page.evaluate(() => ({
      paquet: document.getElementById('paquet-cadeau').hidden,
      grille: document.getElementById('grille-bonus').hidden,
      cartes: Array.from(document.querySelectorAll('#grille-bonus .card')).map((c) => c.dataset.jeu)
    }));
    ok(apres.paquet && !apres.grille && apres.cartes.length === 7,
      'Après ouverture : les 7 mini-jeux CE2 sont révélés en aperçu bonus', apres.cartes);

    // Et l'onglet CE2 se déverrouille définitivement, y compris après rechargement.
    await page.reload();
    await page.waitForSelector('#grille-jeux .card');
    await page.waitForTimeout(200);
    const ongletsApres = await page.evaluate(() => Array.from(document.querySelectorAll('.puce-palier'))
      .map((p) => ({ t: p.textContent.replace('🔒', '').trim(), v: p.classList.contains('verrouille'), d: p.disabled })));
    ok(ongletsApres.every((o) => !o.v && !o.d),
      'Après ouverture du paquet : l’onglet CE2 est déverrouillé pour de bon', ongletsApres);

    // On peut effectivement naviguer vers le palier CE2 déverrouillé.
    await page.locator('.puce-palier', { hasText: 'CE2' }).click();
    await page.waitForTimeout(200);
    const cartesCE2 = await page.evaluate(() => Array.from(document.querySelectorAll('#grille-jeux .card')).map((c) => c.dataset.jeu));
    ok(cartesCE2.includes('ce2-patrons') && cartesCE2.includes('ce2-cavaliere'),
      'Navigation vers le palier CE2 déverrouillé : ses mini-jeux s’affichent', cartesCE2.length);

    ok(erreurs.length === 0, 'Paquet cadeau CE1→CE2 : aucune erreur console / JS', erreurs.slice(0, 4));
    await page.close();
  }

  /* ====== Indexation par palier CIBLE : ouvrir CE1 ne déverrouille pas CE2 ====== */
  {
    const { page } = await ouvrir(browser, port, { niveau: 'CP', bonusRevele: { CE1: true } });
    const onglets = await page.evaluate(() => Array.from(document.querySelectorAll('.puce-palier'))
      .map((p) => ({ t: p.textContent.replace('🔒', '').trim(), v: p.classList.contains('verrouille') })));
    ok(!onglets[0].v && !onglets[1].v && onglets[2].v,
      'Profil CP ayant ouvert le paquet CE1 : CE1 ouvert, CE2 toujours verrouillé', onglets);
    await page.close();
  }

  /* ====== Profil CE2 : tous les onglets ouverts ====== */
  {
    const { page } = await ouvrir(browser, port, { niveau: 'CE2' });
    const onglets = await page.evaluate(() => Array.from(document.querySelectorAll('.puce-palier'))
      .map((p) => ({ t: p.textContent.trim(), v: p.classList.contains('verrouille'), d: p.disabled })));
    ok(onglets.every((o) => !o.v && !o.d), 'Profil au niveau le plus haut (CE2) : tous les onglets ouverts', onglets);
    await page.close();
  }

  /* ====== Deep-link vers une compétence CE2 ====== */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 950 } });
    const u = `http://localhost:${port}/jeux/M36-solides.html?competence=ce2-cavaliere`;
    await page.goto(u);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CP' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.goto(u);
    await page.waitForTimeout(600);
    const etat = await page.evaluate(() => ({
      jeu: !document.getElementById('game').hidden,
      titre: document.getElementById('hdrTitle').textContent,
      illustration: !!document.querySelector('.patronTmp svg')
    }));
    ok(etat.jeu && /cavalière/i.test(etat.titre) && etat.illustration,
      'Deep-link ?competence=ce2-cavaliere démarre le mini-jeu avec son dessin', etat);
    await page.close();
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
