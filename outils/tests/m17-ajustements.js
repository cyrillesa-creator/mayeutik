const socle = require('./socle.js');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = socle.chargerPlaywright();
const ROOT = socle.RACINE;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

function creerServeur() {
  return http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

let echecs = 0;
const ok = (cond, msg, extra) => {
  console.log((cond ? 'OK   ' : '✗    ') + msg, extra === undefined ? '' : extra);
  if (!cond) echecs++;
};

async function ouvrir(browser, port) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true
  });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  await page.goto(`http://localhost:${port}/jeux/M17-fractions-ce2.html`);
  await page.evaluate(() => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'Test', niveau: 'CE2' }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.removeItem('mayeutik-sessions');
  });
  await page.reload();
  await page.waitForSelector('#grille-jeux');
  return { page, erreurs };
}

const lancer = async (page, id) => {
  await page.evaluate((i) => document.querySelector(`[data-jeu="${i}"]`).click(), id);
  await page.waitForTimeout(300);
};
const retour = async (page) => {
  await page.evaluate(() => { const b = document.getElementById('bouton-retour'); if (b) b.click(); });
  await page.waitForTimeout(250);
};

(async () => {
  const srv = creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });
  const { page, erreurs } = await ouvrir(browser, port);

  // ---- 1. Plus de « Regarde bien la forme » ----
  const messages = await page.evaluate(() =>
    JSON.parse(document.getElementById('donnees-jeu').textContent).messagesFeedback.rate);
  ok(!messages.some((m) => /forme/i.test(m)), '1. Aucun message d\'erreur ne renvoie à « la forme »', messages);

  // ---- 2. Découverte : plus de légende « n numérateur sur d dénominateur » ----
  await lancer(page, 'decouverte');
  let fuite = 0;
  for (let q = 0; q < 6; q++) {
    const t = await page.evaluate(() => document.getElementById('zone-jeu').textContent);
    if (/numérateur/i.test(t) || /dénominateur/i.test(t)) fuite++;
    const opt = await page.$('.bouton-option:not([disabled])');
    if (!opt) break;
    await opt.click(); await page.waitForTimeout(150);
    const s = await page.$('#bouton-suivant:not([hidden])');
    if (s) { await s.click(); await page.waitForTimeout(250); } else break;
  }
  ok(fuite === 0, '2. Découverte : plus aucune phrase d\'aide numérateur/dénominateur', fuite + ' manche(s) fautive(s)');
  await retour(page);

  // ---- 3. Droite graduée : aucun débordement horizontal ----
  await lancer(page, 'droite');
  const debordements = [];
  for (let q = 0; q < 8; q++) {
    const m = await page.evaluate(() => {
      const d = document.querySelector('.droite-graduee');
      if (!d) return null;
      const b = d.getBoundingClientRect();
      const ticks = Array.from(document.querySelectorAll('.tick-interactive, .graduation, .graduation-label'));
      const bornes = ticks.map((t) => t.getBoundingClientRect());
      return {
        nbTicks: document.querySelectorAll('.tick-interactive').length,
        largeurDroite: b.width, largeurEcran: document.documentElement.clientWidth,
        scrollPage: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollDroite: (d.parentElement.scrollWidth - d.parentElement.clientWidth),
        min: bornes.length ? Math.min(...bornes.map((r) => r.left)) : 0,
        max: bornes.length ? Math.max(...bornes.map((r) => r.right)) : 0
      };
    });
    if (m) {
      if (m.scrollPage > 1 || m.scrollDroite > 1 || m.min < -0.5 || m.max > m.largeurEcran + 0.5) debordements.push(m);
    }
    const cible = await page.$('.tick-interactive:not([disabled]), .bouton-option:not([disabled])');
    if (!cible) break;
    await cible.click(); await page.waitForTimeout(150);
    const s = await page.$('#bouton-suivant:not([hidden])');
    if (s) { await s.click(); await page.waitForTimeout(250); } else break;
  }
  ok(debordements.length === 0, '3. Droite graduée : jamais de défilement horizontal ni de repère hors écran',
    debordements.slice(0, 2));
  await retour(page);

  // ---- 4. Comparer : clic + glisser-déposer + validation explicite ----
  await lancer(page, 'comparer');
  await page.waitForSelector('.carte-comparaison');
  const nbCartes = await page.locator('.carte-comparaison').count();
  // On remplit toutes les cases dans l'ordre proposé.
  for (let i = 0; i < nbCartes; i++) {
    await page.locator('.carte-comparaison:not([disabled])').first().click();
    await page.waitForTimeout(80);
  }
  const apresRemplissage = await page.evaluate(() => ({
    slotsRemplis: document.querySelectorAll('.slot-ordre.rempli').length,
    dejaValide: document.querySelectorAll('.slot-ordre.correct, .slot-ordre.incorrect').length,
    feedback: document.getElementById('zone-feedback').textContent,
    validerActif: !document.querySelector('.bouton-principal').disabled
  }));
  ok(apresRemplissage.dejaValide === 0 && apresRemplissage.feedback === '',
    '4a. Comparer : remplir toutes les cases ne valide PLUS automatiquement', apresRemplissage);
  ok(apresRemplissage.validerActif, '4b. Comparer : le bouton Valider s\'active une fois les cases remplies');

  // Glisser-déposer : on échange les contenus des cases 1 et 3.
  const avant = await page.$$eval('.slot-ordre', (s) => s.map((x) => x.textContent.trim()));
  const boites = await page.$$eval('.slot-ordre', (s) => s.map((x) => {
    const r = x.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }));
  await page.mouse.move(boites[0].x, boites[0].y);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) {
    await page.mouse.move(boites[0].x + (boites[2].x - boites[0].x) * k / 6,
                          boites[0].y + (boites[2].y - boites[0].y) * k / 6);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  const apres = await page.$$eval('.slot-ordre', (s) => s.map((x) => x.textContent.trim()));
  ok(apres[0] === avant[2] && apres[2] === avant[0],
    '4c. Comparer : glisser une étiquette sur une autre case ÉCHANGE les deux', { avant, apres });

  // Appui simple sur une étiquette : elle retourne dans la pioche.
  await page.locator('.slot-ordre .etiquette-ordre').first().click();
  await page.waitForTimeout(150);
  const apresRetrait = await page.evaluate(() => ({
    remplis: document.querySelectorAll('.slot-ordre.rempli').length,
    cartesDispo: document.querySelectorAll('.carte-comparaison:not([disabled])').length,
    validerActif: !document.querySelector('.bouton-principal').disabled
  }));
  ok(apresRetrait.remplis === nbCartes - 1 && apresRetrait.cartesDispo === 1 && !apresRetrait.validerActif,
    '4d. Comparer : toucher une étiquette la reprend, et Valider se redésactive', apresRetrait);

  // On repose, puis on valide explicitement.
  await page.locator('.carte-comparaison:not([disabled])').first().click();
  await page.waitForTimeout(100);
  await page.locator('.bouton-principal:visible').first().click();
  await page.waitForTimeout(250);
  const apresValidation = await page.evaluate(() => ({
    marques: document.querySelectorAll('.slot-ordre.correct, .slot-ordre.incorrect').length,
    feedback: document.getElementById('zone-feedback').className
  }));
  ok(apresValidation.marques > 0 && /feedback-(succes|erreur)/.test(apresValidation.feedback),
    '4e. Comparer : la validation n\'a lieu qu\'au clic sur Valider', apresValidation);
  await page.waitForTimeout(1100);
  const solution = await page.evaluate(() => ({
    rouges: document.querySelectorAll('.slot-ordre.incorrect').length,
    verts: document.querySelectorAll('.slot-ordre.correct').length
  }));
  ok(solution.rouges === 0, '4f. Comparer : après la révélation, la solution est en vert (aucun rouge résiduel)', solution);
  await retour(page);

  // ---- 5. Calculer : correction GRAPHIQUE ----
  await lancer(page, 'calculer-facile');
  let testee = false;
  for (let q = 0; q < 6 && !testee; q++) {
    // On répond faux : on inverse l'état de toutes les cases.
    const n = await page.locator('.cellule-interactive').count();
    for (let i = 0; i < n; i++) await page.locator('.cellule-interactive').nth(i).click();
    await page.locator('.bouton-principal:visible').click();
    await page.waitForTimeout(250);
    const etat = await page.evaluate(() => {
      const bc = document.querySelector('.bande-correction');
      const f = document.getElementById('zone-feedback');
      return {
        erreur: /feedback-erreur/.test(f.className),
        bande: !!bc,
        segments: bc ? bc.querySelectorAll('.segment-bande').length : 0,
        remplis: bc ? bc.querySelectorAll('.segment-bande.rempli').length : 0,
        vert: bc ? getComputedStyle(bc.querySelector('.segment-bande.rempli')).backgroundColor : null,
        texte: bc ? bc.textContent : ''
      };
    });
    if (etat.erreur) {
      testee = true;
      ok(etat.bande, '5a. Calculer : la bonne réponse est aussi montrée sous forme de BANDE', etat.texte);
      ok(etat.remplis > 0 && etat.remplis <= etat.segments,
        '5b. Calculer : la bande de correction est remplie du bon nombre de parts',
        etat.remplis + '/' + etat.segments);
      ok(etat.vert === 'rgb(78, 205, 196)', '5c. Calculer : la bande de correction est en VERT (menthe)', etat.vert);
    }
    const s = await page.$('#bouton-suivant:not([hidden])');
    if (s) { await s.click(); await page.waitForTimeout(250); } else break;
  }
  ok(testee, '5. Calculer : au moins une erreur a pu être provoquée pour vérifier la correction');

  // ---- 6. Double-tap : touch-action manipulation sur les cases ----
  const ta = await page.evaluate(() => {
    const c = document.querySelector('.cellule-interactive');
    return c ? getComputedStyle(c).touchAction : null;
  });
  ok(ta === 'manipulation', '6. Calculer : les cases portent touch-action:manipulation (pas de zoom au double-tap)', ta);

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 4));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
