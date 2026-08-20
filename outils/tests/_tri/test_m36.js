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

/* Vocabulaire INTERDIT au CP : les mots que le programme n'introduit qu'au CE1.
   On les cherche en mot entier, insensible à la casse/accents usuels. */
const MOTS_CE1 = ['sommet', 'sommets', 'arête', 'arêtes', 'arete', 'aretes', 'polyèdre', 'polyèdres', 'polyedre', 'pyramide', 'pyramides'];
function motsInterdits(texte) {
  const t = (texte || '').toLowerCase();
  return MOTS_CE1.filter((m) => new RegExp('(^|[^a-zà-ÿ])' + m + '($|[^a-zà-ÿ])', 'i').test(t));
}

async function ouvrir(browser, niveau, opts) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  const u = `http://localhost:${srv.address().port}/jeux/M36-solides.html` + ((opts && opts.query) || '');
  await page.goto(u);
  await page.evaluate(({ niveau, sessions }) => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.setItem('mayeutik-sessions', JSON.stringify(sessions || []));
    localStorage.removeItem('mayeutik-m36-bonus-revele');
    localStorage.removeItem('mayeutik-m36-solides-etoiles');
  }, { niveau, sessions: (opts && opts.sessions) || [] });
  await page.goto(u);
  /* Avec `?competence=`, le jeu démarre directement : les cartes existent bien
     dans le DOM mais #home est masqué. On attend donc leur PRÉSENCE, pas leur
     visibilité, sinon le helper expire sur ce cas parfaitement normal. */
  await page.waitForSelector('#grille-jeux .card', { state: 'attached' });
  await page.waitForTimeout(200);
  return { page, erreurs };
}

/* Joue une partie entière en cliquant toujours la 1re réponse dispo ; renvoie
   l'énoncé de chaque manche pour analyse du vocabulaire. */
async function jouerPartie(page, jeuId) {
  await page.evaluate((id) => document.querySelector(`.card[data-jeu="${id}"]`).click(), jeuId);
  await page.waitForSelector('#qText');
  await page.waitForTimeout(150);
  const enonces = [];
  for (let i = 0; i < 30; i++) {
    if (await page.locator('#end:not([hidden])').count()) break;
    const q = await page.evaluate(() => document.getElementById('qText').textContent);
    const feedbackAv = await page.evaluate(() => document.getElementById('feedback').textContent);
    enonces.push(q);
    const rep = page.locator('.rep:not([disabled])').first();
    if (await rep.count()) {
      await rep.click();
    } else {
      // question 3D (tap sur une face/arête) : on répond via le tapHandler
      await page.evaluate(() => {
        if (window.__forcerTap) window.__forcerTap();
      });
      // pas de handler exposé : on abandonne cette manche proprement
      await page.waitForTimeout(100);
      if (!(await page.locator('#btnNext').evaluate((b) => b.style.display === 'block'))) break;
    }
    await page.waitForFunction(() => document.getElementById('btnNext').style.display === 'block', { timeout: 4000 });
    const fb = await page.evaluate(() => document.getElementById('feedback').textContent);
    enonces.push(fb);
    await page.evaluate(() => document.getElementById('btnNext').click());
    await page.waitForTimeout(120);
  }
  return enonces;
}

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ================= PALIER CP ================= */
  {
    const { page, erreurs } = await ouvrir(browser, 'CP');

    const cartes = await page.evaluate(() => Array.from(document.querySelectorAll('#grille-jeux .card')).map((c) => c.dataset.jeu));
    ok(JSON.stringify(cartes) === JSON.stringify(['decouvre', 'cp-nommer', 'cp-compter-faces', 'cp-devinettes']),
      'CP : exactement Découverte + 3 mini-jeux CP (ni Polyèdre ?, ni J\'explore)', cartes);

    const palierActif = await page.evaluate(() => document.querySelector('.puce-palier.actif').textContent);
    ok(palierActif === 'CP', 'CP : le palier du profil est sélectionné par défaut', palierActif);

    // ---- Découverte : 5 solides, pas de pyramide, pas d'arêtes/sommets/polyèdre ----
    await page.evaluate(() => document.querySelector('.card[data-jeu="decouvre"]').click());
    await page.waitForSelector('#chips .chip');
    await page.waitForTimeout(250);
    const chips = await page.evaluate(() => Array.from(document.querySelectorAll('#chips .chip')).map((c) => c.textContent));
    ok(chips.length === 5 && !chips.some((c) => /pyramide/i.test(c)),
      'CP découverte : 5 solides, aucune pyramide', chips);
    const togsVisibles = await page.evaluate(() => Array.from(document.querySelectorAll('.tog')).filter((t) => !t.hidden).map((t) => t.dataset.t));
    ok(JSON.stringify(togsVisibles) === JSON.stringify(['faces']),
      'CP découverte : seul le bouton Faces est proposé (ni arêtes, ni sommets)', togsVisibles);

    // Parcourt les 5 fiches et vérifie qu'aucune n'emploie de mot CE1.
    const fautes = [];
    for (let i = 0; i < chips.length; i++) {
      await page.locator('#chips .chip').nth(i).click();
      await page.waitForTimeout(120);
      const txt = await page.evaluate(() => document.getElementById('infoCard').textContent);
      const m = motsInterdits(txt);
      if (m.length) fautes.push({ chip: chips[i], mots: m, txt: txt.slice(0, 90) });
    }
    ok(fautes.length === 0, 'CP découverte : aucune fiche n’emploie sommet/arête/polyèdre/pyramide', fautes);

    // L'encart de distinction cube/pavé est bien là.
    await page.locator('#chips .chip', { hasText: 'Cube' }).first().click();
    await page.waitForTimeout(120);
    const distinctionCube = await page.evaluate(() => {
      const el = document.querySelector('#infoCard .distinction');
      return el ? el.textContent : null;
    });
    ok(distinctionCube && /pavé/i.test(distinctionCube) && /pas un pavé/i.test(distinctionCube),
      'CP : la fiche du cube dit explicitement que le cube n’est pas un pavé', distinctionCube);

    await page.click('#btnBack');
    await page.waitForSelector('#grille-jeux .card');

    // ---- Les 3 mini-jeux CP : vocabulaire et solides ----
    for (const jeu of ['cp-nommer', 'cp-compter-faces', 'cp-devinettes']) {
      const textes = await jouerPartie(page, jeu);
      const mauvais = textes.map((t) => ({ t, m: motsInterdits(t) })).filter((x) => x.m.length);
      ok(mauvais.length === 0, `CP / ${jeu} : aucun mot réservé au CE1 dans les énoncés et corrections`,
        mauvais.slice(0, 3));
      ok(await page.locator('#end:not([hidden])').count() === 1, `CP / ${jeu} : la partie va jusqu’au score`);
      await page.click('#bMenu');
      await page.waitForSelector('#grille-jeux .card');
    }

    ok(erreurs.length === 0, 'CP : aucune erreur console / JS', erreurs.slice(0, 4));
    await page.close();
  }

  /* ================= PALIER CE1 ================= */
  {
    const { page, erreurs } = await ouvrir(browser, 'CE1');

    const cartes = await page.evaluate(() => Array.from(document.querySelectorAll('#grille-jeux .card')).map((c) => c.dataset.jeu));
    ok(JSON.stringify(cartes) === JSON.stringify(['decouvre', 'ce1-nommer', 'ce1-compter', 'ce1-polyedre', 'ce1-explorer', 'ce1-devinettes']),
      'CE1 : Découverte + 5 mini-jeux (dont Polyèdre ? et J\'explore)', cartes);

    await page.evaluate(() => document.querySelector('.card[data-jeu="decouvre"]').click());
    await page.waitForSelector('#chips .chip');
    await page.waitForTimeout(250);
    const chips = await page.evaluate(() => Array.from(document.querySelectorAll('#chips .chip')).map((c) => c.textContent));
    ok(chips.length === 6 && chips.some((c) => /pyramide/i.test(c)),
      'CE1 découverte : 6 solides, pyramide incluse', chips);
    const togsVisibles = await page.evaluate(() => Array.from(document.querySelectorAll('.tog')).filter((t) => !t.hidden).map((t) => t.dataset.t));
    ok(togsVisibles.length === 3, 'CE1 découverte : faces, arêtes et sommets proposés', togsVisibles);
    const badge = await page.evaluate(() => !!document.querySelector('#infoCard .badge'));
    ok(badge, 'CE1 découverte : le badge POLYÈDRE apparaît');
    await page.click('#btnBack');
    await page.waitForSelector('#grille-jeux .card');

    // Aucun prisme nulle part dans les solides jouables.
    const solides = await page.evaluate(() => Object.keys(CONTENU.solides));
    ok(!solides.includes('prisme'), 'Le prisme droit a disparu du contenu', solides);
    /* Les patrons EXISTENT depuis la fusion du CE2, mais ne doivent apparaître
       qu'au palier CE2 — jamais dans les mini-jeux CP ni CE1. */
    const patronsParPalier = await page.evaluate(() => {
      const out = {};
      Object.keys(CONTENU.paliers).forEach((n) => {
        out[n] = CONTENU.paliers[n].miniJeux.filter((mj) => mj.mode === 'patrons' || mj.mode === 'cavaliere').map((mj) => mj.id);
      });
      return out;
    });
    ok(patronsParPalier.CP.length === 0 && patronsParPalier.CE1.length === 0,
      'Patrons et perspective cavalière absents des paliers CP et CE1', patronsParPalier);
    ok(patronsParPalier.CE2.length === 2,
      'Patrons et perspective cavalière présents au seul palier CE2', patronsParPalier.CE2);

    for (const jeu of ['ce1-nommer', 'ce1-compter', 'ce1-polyedre', 'ce1-devinettes']) {
      await jouerPartie(page, jeu);
      ok(await page.locator('#end:not([hidden])').count() === 1, `CE1 / ${jeu} : la partie va jusqu’au score`);
      await page.click('#bMenu');
      await page.waitForSelector('#grille-jeux .card');
    }

    ok(erreurs.length === 0, 'CE1 : aucune erreur console / JS', erreurs.slice(0, 4));
    await page.close();
  }

  /* ============ PAQUET CADEAU : CP maîtrisé -> aperçu CE1 ============ */
  {
    const maitrise = ['cp-nommer', 'cp-compter-faces', 'cp-devinettes'].map((id) => ({
      profilId: 'p1', module: 'M36', competence: id, score: 5, total: 5,
      date: new Date().toISOString(), duree: 60
    }));
    const { page, erreurs } = await ouvrir(browser, 'CP', { sessions: maitrise });

    const blocVisible = await page.evaluate(() => !document.getElementById('bloc-bonus').hidden);
    ok(blocVisible, 'Palier CP maîtrisé : le bloc bonus apparaît');
    const paquetVisible = await page.evaluate(() => !document.getElementById('paquet-cadeau').hidden);
    const grilleCachee = await page.evaluate(() => document.getElementById('grille-bonus').hidden);
    ok(paquetVisible && grilleCachee, 'Première fois : le paquet cadeau recouvre la grille bonus',
      { paquetVisible, grilleCachee });

    await page.click('#paquet-cadeau');
    await page.waitForTimeout(700);
    const apresOuverture = await page.evaluate(() => ({
      paquet: document.getElementById('paquet-cadeau').hidden,
      grille: document.getElementById('grille-bonus').hidden,
      cartes: Array.from(document.querySelectorAll('#grille-bonus .card')).map((c) => c.dataset.jeu)
    }));
    ok(apresOuverture.paquet && !apresOuverture.grille && apresOuverture.cartes.length === 5,
      'Après ouverture : le paquet disparaît, les 5 mini-jeux CE1 sont révélés', apresOuverture);

    // Indexation par palier CIBLE : après rechargement, plus de paquet pour CE1.
    await page.reload();
    await page.waitForSelector('#grille-jeux .card');
    await page.waitForTimeout(200);
    const auRetour = await page.evaluate(() => ({
      paquet: document.getElementById('paquet-cadeau').hidden,
      grille: document.getElementById('grille-bonus').hidden
    }));
    ok(auRetour.paquet && !auRetour.grille,
      'Le paquet ne réapparaît plus pour ce profil et ce palier cible', auRetour);

    ok(erreurs.length === 0, 'Bonus : aucune erreur console / JS', erreurs.slice(0, 4));
    await page.close();
  }

  /* ============ Deep-link ?competence= et ?palier= (CHARTE §16) ============ */
  {
    const { page, erreurs } = await ouvrir(browser, 'CP', { query: '?competence=ce1-polyedre' });
    await page.waitForTimeout(400);
    const surJeu = await page.evaluate(() => ({
      jeuVisible: !document.getElementById('game').hidden,
      titre: document.getElementById('hdrTitle').textContent
    }));
    ok(surJeu.jeuVisible && /Polyèdre/.test(surJeu.titre),
      'Deep-link ?competence=ce1-polyedre démarre directement le mini-jeu', surJeu);
    ok(erreurs.length === 0, 'Deep-link : aucune erreur console / JS', erreurs.slice(0, 4));
    await page.close();
  }
  {
    const { page } = await ouvrir(browser, 'CP', { query: '?competence=nexiste-pas&palier=zzz' });
    await page.waitForTimeout(300);
    const retombee = await page.evaluate(() => ({
      accueil: !document.getElementById('home').hidden,
      palier: document.querySelector('.puce-palier.actif').textContent
    }));
    ok(retombee.accueil && retombee.palier === 'CP',
      'Paramètres invalides : retour silencieux à l’accueil, palier du profil', retombee);
    await page.close();
  }

  /* ====== Profil CE2 : palier désormais COUVERT depuis la fusion ====== */
  {
    const { page } = await ouvrir(browser, 'CE2');
    const palier = await page.evaluate(() => document.querySelector('.puce-palier.actif').textContent.trim());
    ok(palier === 'CE2', 'Profil CE2 : ouvre directement son palier (couvert depuis la fusion de M42)', palier);
    await page.close();
  }

  /* ====== Niveau réellement non couvert -> palier le plus bas ====== */
  {
    const { page } = await ouvrir(browser, 'CM1');
    const palier = await page.evaluate(() => document.querySelector('.puce-palier.actif').textContent.trim());
    ok(palier === 'CP', 'Niveau de profil non couvert (CM1) : on retombe sur le palier le plus bas', palier);
    await page.close();
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
