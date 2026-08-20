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

async function ouvrir(browser, port) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  await page.goto(`http://localhost:${port}/jeux/M42-solides-ce2.html`);
  await page.waitForSelector('.card');
  await page.waitForTimeout(200);
  return { page, erreurs };
}

/* Joue une manche : clique la première réponse dispo, capture le texte de
   feedback, clique "Suivant" (ou attend l'auto-avance si le bouton est
   masqué mais présent). Renvoie le texte de feedback observé. */
async function jouerManche(page) {
  const rep = page.locator('.rep:not([disabled])').first();
  if (!(await rep.count())) return null;
  await rep.click();
  await page.waitForFunction(() => document.getElementById('btnNext').style.display === 'block', { timeout: 4000 });
  const feedback = await page.evaluate(() => document.getElementById('feedback').textContent);
  await page.evaluate(() => document.getElementById('btnNext').click());
  await page.waitForTimeout(150);
  return feedback;
}

async function jouerPartie(page, mode, nbManchesAttendu) {
  await page.evaluate((m) => document.querySelector(`.card[data-mode="${m}"]`).click(), mode);
  await page.waitForSelector('#qText');
  await page.waitForTimeout(150);
  const feedbacks = [];
  for (let i = 0; i < nbManchesAttendu + 2; i++) {
    if (await page.locator('#end:not([hidden])').count()) break;
    const fb = await jouerManche(page);
    if (fb === null) break;
    feedbacks.push(fb);
    if (await page.locator('#end:not([hidden])').count()) break;
  }
  return feedbacks;
}

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await ouvrir(browser, port);

  // ---- 0. Pas de "M36" visible, contenu réduit à 6 solides ----
  const titre = await page.title();
  ok(titre.includes('M42') && !titre.includes('M36'), 'Le titre de la page référence M42, pas M36', titre);
  const { clesCount, polysCount, modeId } = await page.evaluate(() => ({
    clesCount: CLES.length, polysCount: POLYS.length, modeId: MODULE_ID
  }));
  ok(clesCount === 6, 'CLES contient 6 solides (prisme retiré)', clesCount);
  ok(polysCount === 3, 'POLYS contient 3 polyèdres (cube, pavé, pyramide)', polysCount);
  ok(modeId === 'M42', 'MODULE_ID vaut M42', modeId);
  const cle = await page.evaluate(() => CLE_STOCKAGE);
  ok(cle === 'mayeutik-m42-solides-etoiles', 'Clé de stockage des étoiles propre à M42 (pas de collision avec M36)', cle);

  // ---- 1. Perspective cavalière : 3 manches, cube/pavé/pyramide uniquement ----
  {
    const solidesVus = await page.evaluate(() => Object.keys(CAVALIERE));
    ok(solidesVus.length === 3 && solidesVus.every((s) => ['cube', 'pave', 'pyramide'].includes(s)),
      'CAVALIERE ne couvre que cube/pavé/pyramide', solidesVus);
  }
  const fbCavaliere = await jouerPartie(page, 'cavaliere', 3);
  ok(fbCavaliere.length === 3, 'Perspective cavalière : 3 manches jouées (une par solide)', fbCavaliere.length);
  ok(fbCavaliere.every((f) => /arêtes cachées/.test(f) && /pointillés/.test(f)),
    'Chaque feedback de Perspective cavalière mentionne les arêtes cachées en pointillés', fbCavaliere);
  ok(fbCavaliere.every((f) => /faces/.test(f)),
    'Chaque feedback de Perspective cavalière justifie par les faces', fbCavaliere);

  // ---- 2. Qui suis-je ? : 6 manches, justification systématique ----
  await page.click('#btnBack');
  await page.waitForSelector('.card');
  const fbNomme = await jouerPartie(page, 'nomme', 6);
  ok(fbNomme.length === 6, 'Qui suis-je ? : 6 manches (une par solide, prisme exclu)', fbNomme.length);
  const justifNomme = ['faces carrées', 'faces rectangulaires', 'base carrée', 'faces planes', 'face plane', 'aucune face plane'];
  ok(fbNomme.every((f) => justifNomme.some((j) => f.includes(j))),
    'Qui suis-je ? : chaque retour (juste ou faux) justifie par les faces', fbNomme);
  ok(!fbNomme.some((f) => /prisme/i.test(f)), 'Qui suis-je ? : aucune mention du prisme', fbNomme);

  // ---- 3. Devinettes : justification systématique, aucune mention du prisme ----
  await page.click('#btnBack');
  await page.waitForSelector('.card');
  const fbDevinette = await jouerPartie(page, 'devinette', 8);
  ok(fbDevinette.length === 8, 'Devinettes : 8 manches jouées', fbDevinette.length);
  ok(fbDevinette.every((f) => justifNomme.some((j) => f.includes(j))),
    'Devinettes : chaque retour justifie par les faces', fbDevinette);
  ok(!fbDevinette.some((f) => /prisme/i.test(f)), 'Devinettes : aucune mention du prisme', fbDevinette);

  // ---- 4. Polyèdre ? : 6 manches (au lieu de 7) ----
  await page.click('#btnBack');
  await page.waitForSelector('.card');
  const fbPolyedre = await jouerPartie(page, 'polyedre', 6);
  ok(fbPolyedre.length === 6, 'Polyèdre ? : 6 manches (prisme exclu)', fbPolyedre.length);

  // ---- 5. Je compte : fonctionne avec 3 polyèdres (9 combos exactement) ----
  await page.click('#btnBack');
  await page.waitForSelector('.card');
  const fbCompte = await jouerPartie(page, 'compte', 9);
  ok(fbCompte.length === 9, 'Je compte : 9 manches jouées sans erreur (3 polyèdres x 3 grandeurs)', fbCompte.length);

  // ---- 6. J'explore : fonctionne sans le prisme (types à réponses ET types
  //         à tap 3D — areteTap/opposee n'ont pas de bouton .rep) ----
  await page.click('#btnBack');
  await page.waitForSelector('.card');
  await page.evaluate(() => document.querySelector('.card[data-mode="explore"]').click());
  await page.waitForSelector('#qText');
  await page.waitForTimeout(150);
  let manchesExplore = 0;
  for (let i = 0; i < 6; i++) {
    if (await page.locator('#end:not([hidden])').count()) break;
    const aBoutons = await page.locator('.rep').count();
    if (aBoutons) {
      await jouerManche(page);
    } else {
      // Question à tap 3D (opposee/areteTap) : on simule le tap via le
      // tapHandler exposé par le moteur, en visant sa première cible.
      await page.evaluate(() => tapHandler.cb(tapHandler.cibles[0].userData));
      await page.waitForFunction(() => document.getElementById('btnNext').style.display === 'block', { timeout: 4000 });
      await page.evaluate(() => document.getElementById('btnNext').click());
      await page.waitForTimeout(150);
    }
    manchesExplore++;
    if (await page.locator('#end:not([hidden])').count()) break;
  }
  ok(manchesExplore === 6, 'J’explore : 6 manches jouées sans erreur', manchesExplore);

  // ---- 7. Les patrons : fonctionne avec 6 patrons (au lieu de 7), sans prisme ----
  await page.click('#btnBack');
  await page.waitForSelector('.card');
  await page.evaluate(() => document.querySelector('.card[data-mode="patrons"]').click());
  await page.waitForSelector('#qText');
  await page.waitForTimeout(150);
  let manchesPatrons = 0, prismeVu = false;
  for (let i = 0; i < 7; i++) {
    if (await page.locator('#end:not([hidden])').count()) break;
    const texteBoutons = await page.evaluate(() => Array.from(document.querySelectorAll('.rep')).map((b) => b.textContent));
    if (texteBoutons.some((t) => /prisme/i.test(t))) prismeVu = true;
    const fb = await jouerManche(page);
    if (fb === null) break;
    manchesPatrons++;
    if (await page.locator('#end:not([hidden])').count()) break;
  }
  ok(manchesPatrons === 5, 'Les patrons : 5 manches jouées (banque de 6)', manchesPatrons);
  ok(!prismeVu, 'Les patrons : aucun bouton ne propose/affiche "prisme"', prismeVu);

  // ---- 8. Découverte : plus de solide "prisme" dans les chips ----
  await page.click('#btnBack');
  await page.waitForSelector('.card');
  await page.evaluate(() => document.querySelector('.card[data-mode="decouvre"]').click());
  await page.waitForSelector('#chips .chip');
  await page.waitForTimeout(200);
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('#chips .chip')).map((c) => c.textContent));
  ok(chips.length === 6 && !chips.some((c) => /prisme/i.test(c)),
    'Découverte : 6 solides, aucun prisme', chips);

  ok(erreurs.length === 0, 'Aucune erreur console / JS sur l’ensemble du parcours', erreurs.slice(0, 6));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
