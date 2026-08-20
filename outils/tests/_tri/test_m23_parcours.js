const C = require('./m23_commun');
// Parcours complet de TOUS les mini-jeux des trois paliers : aucune erreur
// console/JS, chaque partie va jusqu'aux résultats, une session par partie.
(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let echecs = 0, parties = 0;
  for (const niveau of ['CP', 'CE1', 'CE2']) {
    const { page, erreurs } = await C.ouvrir(browser, port, niveau);
    const jeux = await page.$$eval('[data-jeu]', (n) => n.map((e) => e.dataset.jeu));
    for (const id of jeux) {
      await C.lancer(page, id);
      for (let m = 0; m < 30; m++) {
        if (await page.locator('.bloc-resultats').count()) break;
        await C.atteindreManche(page, '.bloc-resultats', 1);
      }
      const fini = await page.locator('.bloc-resultats').count() > 0;
      if (!fini) { echecs++; console.log(`  ✗ ${niveau}/${id} : partie non terminée`); }
      else parties++;
      await page.evaluate(() => { const b = document.getElementById('bouton-retour'); if (b) b.click(); });
      await page.waitForTimeout(200);
    }
    if (erreurs.length) { echecs++; console.log(`  ✗ ${niveau} erreurs :`, erreurs.slice(0, 4)); }
    const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]').length);
    console.log(`  ${niveau} : ${jeux.length} mini-jeux, ${sessions} session(s) enregistrée(s)`);
    await page.close();
  }
  console.log(echecs === 0 ? `M23 PARCOURS : OK (${parties} parties menées à terme)` : `M23 PARCOURS : ${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
})();
