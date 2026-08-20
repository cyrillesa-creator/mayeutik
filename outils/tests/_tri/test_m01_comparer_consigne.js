const C = require('./m01_commun');
let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };
(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 700 });
  ok((await page.locator('[data-jeu="comparer"] .desc-jeu, [data-jeu="comparer"]').first().textContent()).includes('Choisis'),
    'Carte d’accueil : description dit "Choisis"');
  for (let i = 0; i < 10; i++) {
    await C.lancer(page, 'comparer');
    await page.waitForSelector('.bouton-contenant');
    const consigne = await page.evaluate(() => document.querySelector('#zone-jeu').textContent);
    ok(/Choisis /.test(consigne) && !/Entoure/.test(consigne), `Manche ${i}: consigne dit "Choisis" (pas "Entoure")`, consigne.slice(0, 80));
    await page.locator('.bouton-contenant').first().click();
    await page.waitForTimeout(150);
    await page.click('#bouton-suivant');
    await page.waitForTimeout(200);
    if (await page.locator('.bloc-resultats').count()) { await page.click('.bloc-resultats .bouton-principal'); await page.waitForTimeout(200); }
  }
  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
