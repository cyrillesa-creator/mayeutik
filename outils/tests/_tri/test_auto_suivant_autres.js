const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

function creerServeur() {
  return http.createServer((q, r) => {
    const p = path.join('/home/user/mayeutik', decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(p, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': 'text/html' });
      r.end(d);
    });
  });
}

async function nouvellePage(browser, extra) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, ...extra });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  return { page, erreurs };
}

/* Vérifie, pour un fichier/mini-jeu donné, que "Suivant" avance tout seul
   ~2 s après son affichage, mais pas avant. `repondre` clique une réponse
   quelconque (peu importe juste/fausse : seul l'AFFICHAGE de "Suivant"
   compte ici) et retourne un texte de progression à comparer avant/après. */
async function verifierAutoAvance(browser, port, { fichier, jeu, palier, selecteurQuestion, repondre, lireProgression, hauteur }) {
  const { page, erreurs } = await nouvellePage(browser, { viewport: { width: 390, height: hauteur || 800 } });
  const u = `http://localhost:${port}/jeux/${fichier}` + (palier ? `?palier=${palier}` : '');
  await page.goto(u);
  if (palier) {
    await page.evaluate((niv) => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: niv }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    }, palier.toUpperCase());
    await page.goto(u);
  }
  await page.waitForSelector('[data-jeu]');
  await page.evaluate((j) => document.querySelector(`[data-jeu="${j}"]`).click(), jeu);
  await page.waitForSelector(selecteurQuestion);
  await page.waitForTimeout(200);

  const avant = await lireProgression(page);
  await repondre(page);
  await page.waitForSelector('#bouton-suivant:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(200);

  await page.waitForTimeout(1500);
  const avant2s = await lireProgression(page);
  ok(avant2s === avant, `${fichier} / ${jeu} : avant 2 s, pas encore avancé`, { avant, avant2s });

  await page.waitForTimeout(900);
  const apres2s = await lireProgression(page);
  ok(apres2s !== avant, `${fichier} / ${jeu} : ~2 s après "Suivant", avance automatique`, { avant, apres2s });

  ok(erreurs.length === 0, `${fichier} / ${jeu} : aucune erreur console / JS`, erreurs.slice(0, 5));
  await page.close();
}

(async () => {
  const srv = creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ---- M15 : « La plus grande part » (comparer-ce1), QCM à 3 boutons ----
  await verifierAutoAvance(browser, port, {
    fichier: 'M15-fractions-ce1.html', jeu: 'comparer-ce1',
    selecteurQuestion: '.reponses-duel .bouton-option',
    repondre: async (page) => page.locator('.reponses-duel .bouton-option').first().click(),
    lireProgression: (page) => page.evaluate(() => document.getElementById('progression-jeu').textContent)
  });

  // ---- M17 : « Fractions égales » (egales), QCM ----
  await verifierAutoAvance(browser, port, {
    fichier: 'M17-fractions-ce2.html', jeu: 'egales',
    selecteurQuestion: '.grille-options .bouton-option',
    repondre: async (page) => page.locator('.grille-options .bouton-option').first().click(),
    lireProgression: (page) => page.evaluate(() => document.getElementById('progression-jeu').textContent)
  });

  // ---- M23 : « L'orée du bois » (vocabulaire-longueurs-cp), QCM, palier CP ----
  await verifierAutoAvance(browser, port, {
    fichier: 'M23-longueurs.html', jeu: 'vocabulaire-longueurs-cp', palier: 'cp',
    selecteurQuestion: '.bouton-option',
    repondre: async (page) => page.locator('.bouton-option').first().click(),
    lireProgression: (page) => page.evaluate(() => document.getElementById('progression-jeu').textContent)
  });

  // ---- M39 : « Lis et interprète » (ce1-lecture), QCM, palier CE1 ----
  await verifierAutoAvance(browser, port, {
    fichier: 'M39-tableaux-diagrammes.html', jeu: 'ce1-lecture', palier: 'ce1',
    selecteurQuestion: '.bouton-option',
    repondre: async (page) => page.locator('.bouton-option').first().click(),
    lireProgression: (page) => page.evaluate(() => document.getElementById('progression-jeu').textContent)
  });

  // ---- M36 : « Qui suis-je ? » (nomme), QCM, idiomes $()/style.display ----
  {
    const { page, erreurs } = await nouvellePage(browser, { viewport: { width: 390, height: 900 } });
    await page.goto(`http://localhost:${port}/jeux/M36-solides.html`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CE1' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.reload();
    await page.waitForSelector('.card');
    await page.evaluate(() => document.querySelector('.card[data-mode="nomme"]').click());
    await page.waitForSelector('.rep');
    await page.waitForTimeout(200);
    const lireDots = () => page.evaluate(() => document.getElementById('dots').innerHTML);
    const avant = await lireDots();
    await page.locator('.rep').first().click();
    await page.waitForFunction(() => document.getElementById('btnNext').style.display === 'block', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const avant2s = await lireDots();
    ok(avant2s === avant, 'M36-solides.html / nomme : avant 2 s, pas encore avancé');
    await page.waitForTimeout(900);
    const apres2s = await lireDots();
    ok(apres2s !== avant, 'M36-solides.html / nomme : ~2 s après "Suivant", avance automatique');
    ok(erreurs.length === 0, 'M36-solides.html / nomme : aucune erreur console / JS', erreurs.slice(0, 5));
    await page.close();
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
