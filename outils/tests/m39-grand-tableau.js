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

/* « Le grand tableau » :
   - des confettis se déclenchent quand le tableau est entièrement bien rempli ;
   - un objet posé dans une case peut être glissé jusqu'au vivier pour l'en retirer. */

async function ouvrir(page, port) {
  const u = `http://localhost:${port}/jeux/M39-tableaux-diagrammes.html?palier=cp`;
  await page.goto(u);
  await page.evaluate(() => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CP' }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
  });
  await page.goto(u);
  await page.waitForSelector('#grille-jeux');
  await page.evaluate(() => document.querySelector('[data-jeu="cp-tableau-double-entree"]').click());
  await page.waitForSelector('.jeton-objet');
  await page.waitForTimeout(250);
}

/* Glisser TACTILE : un objet-mini (dans une case) vers le vivier. */
async function glisserVersVivier(page, index) {
  return await page.evaluate((i) => {
    const objets = document.querySelectorAll('.objet-mini');
    const el = objets[i];
    if (!el) return { erreur: 'objet introuvable' };
    const rd = el.getBoundingClientRect();
    const rv = document.querySelector('.pool-objets').getBoundingClientRect();
    const d = { x: rd.left + rd.width / 2, y: rd.top + rd.height / 2 };
    const a = { x: rv.left + rv.width / 2, y: rv.top + rv.height / 2 };
    const env = (t, x, y) => el.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    env('pointerdown', d.x, d.y);
    const N = 10;
    for (let k = 1; k <= N; k++) env('pointermove', d.x + (a.x - d.x) * k / N, d.y + (a.y - d.y) * k / N);
    env('pointerup', a.x, a.y);
    return { cle: el.dataset.cle };
  }, index);
}

/* Glisser TACTILE : un jeton du vivier vers une case (non-régression du
   renommage celluleSous → cibleSous). */
async function glisserVersCellule(page, index, cle) {
  return await page.evaluate(({ i, cle }) => {
    const el = document.querySelectorAll('.jeton-objet')[i];
    if (!el) return { erreur: 'jeton introuvable' };
    const cible = document.querySelector(`.cellule-placement[data-cle="${cle}"]`);
    const rd = el.getBoundingClientRect();
    const rc = cible.getBoundingClientRect();
    const d = { x: rd.left + rd.width / 2, y: rd.top + rd.height / 2 };
    const a = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    const env = (t, x, y) => el.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    env('pointerdown', d.x, d.y);
    const N = 10;
    for (let k = 1; k <= N; k++) env('pointermove', d.x + (a.x - d.x) * k / N, d.y + (a.y - d.y) * k / N);
    env('pointerup', a.x, a.y);
    return {};
  }, { i: index, cle });
}

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });
  const page = await b.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  await ouvrir(page, port);

  // ---- 0. Glisser-déposer VIVIER → CASE (non-régression du renommage cibleSous) ----
  const cle0Depart = await page.locator('.jeton-objet').first().evaluate((el) => el.dataset.cle);
  const g0 = await glisserVersCellule(page, 0, cle0Depart);
  await page.waitForTimeout(80);
  ok(!g0.erreur, '0a. Le glisser-déposer vivier → case fonctionne toujours (après renommage)', g0.erreur);
  const enPlace0 = await page.locator(`.cellule-placement[data-cle="${cle0Depart}"] .objet-mini`).count();
  ok(enPlace0 === 1, '0b. L’objet glissé est bien posé dans la case visée', enPlace0);

  // ---- 1. Place chaque jeton dans SA case correcte (via son propre dataset.cle) ----
  let nb = await page.locator('.jeton-objet').count();
  ok(nb > 0, '1a. Le vivier contient des objets à ranger', nb);
  while ((await page.locator('.jeton-objet').count()) > 0) {
    const cle = await page.locator('.jeton-objet').first().evaluate((el) => el.dataset.cle);
    await page.locator('.jeton-objet').first().click();
    await page.locator(`.cellule-placement[data-cle="${cle}"]`).click();
    await page.waitForTimeout(20);
  }
  ok((await page.locator('.jeton-objet').count()) === 0, '1b. Tous les objets sont rangés (vivier vide)');

  const avantConfetti = await page.locator('#confettis-conteneur .confetti').count();
  await page.click('#zone-jeu .bouton-principal'); // "Valider mon tableau"
  await page.waitForTimeout(300);
  const note = await page.evaluate(() => document.querySelector('.note-rangement')?.textContent);
  ok(/juste/i.test(note || ''), '2a. Le rangement, fait exclusivement à la bonne case, est reconnu comme juste', note);
  const apresConfetti = await page.locator('#confettis-conteneur .confetti').count();
  ok(apresConfetti > avantConfetti, '2b. Des confettis apparaissent quand le tableau est bien rempli', { avantConfetti, apresConfetti });

  ok(erreurs.length === 0, 'Aucune erreur console / JS (étape 1-2)', erreurs.slice(0, 5));

  // ---- 3. Nouvelle manche : glisser un objet POSÉ jusqu'au vivier le reprend ----
  // (poserQuestionFinale doit d'abord être passée pour arriver à la manche suivante)
  const pave = page.locator('.touche-pave');
  if (await pave.count()) {
    await pave.first().click();
    await page.locator('.touche-valider').click();
    await page.waitForTimeout(300);
    await page.click('#bouton-suivant');
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('.jeton-objet');
  await page.waitForTimeout(200);

  // Place un seul objet, puis le fait glisser vers le vivier.
  const cle0 = await page.locator('.jeton-objet').first().evaluate((el) => el.dataset.cle);
  await page.locator('.jeton-objet').first().click();
  await page.locator(`.cellule-placement[data-cle="${cle0}"]`).click();
  await page.waitForTimeout(80);
  const vivierAvant = await page.locator('.jeton-objet').count();
  const celluleAvant = await page.locator(`.cellule-placement[data-cle="${cle0}"] .objet-mini`).count();
  ok(celluleAvant === 1, '3a. L’objet est bien posé dans sa case', celluleAvant);

  const g = await glisserVersVivier(page, 0);
  await page.waitForTimeout(120);
  ok(!g.erreur, '3b. Le glisser depuis le tableau s’exécute sans erreur', g.erreur);
  const vivierApres = await page.locator('.jeton-objet').count();
  const celluleApres = await page.locator(`.cellule-placement[data-cle="${cle0}"] .objet-mini`).count();
  ok(vivierApres === vivierAvant + 1, '3c. Glissé jusqu’au vivier : l’objet y revient', { vivierAvant, vivierApres });
  ok(celluleApres === celluleAvant - 1, '3d. …et quitte sa case', { celluleAvant, celluleApres });

  const survolClass = await page.evaluate(() => document.querySelector('.pool-objets').outerHTML.includes('cible-survolee'));
  ok(!survolClass, '3e. Le vivier ne garde pas la classe de survol après le relâché');

  ok(erreurs.length === 0, 'Aucune erreur console / JS (total)', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
