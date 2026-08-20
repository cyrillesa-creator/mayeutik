const C = require('./m01_commun');
// Parcours de tous les mini-jeux : rien de cassé, aucune erreur console,
// et surtout aucun verrou de défilement laissé derrière.
(async () => {
  const srv = C.creerServeur(); await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(b, port, { hauteur: 844 });
  let echecs = 0;
  const jeux = await page.$$eval('[data-jeu]', n => n.map(e => e.dataset.jeu));
  for (const id of jeux) {
    await C.lancer(page, id);
    for (let q = 0; q < 20; q++) {
      if (await page.locator('.bloc-resultats').count()) break;
      const t = await page.$('.touche-chiffre:not([disabled])');
      if (t) await t.click().catch(() => {});
      const g = await page.$('.carte-etiquetage:not([disabled])');
      if (g) {
        const n = await page.locator('.carte-etiquetage').count();
        for (let i = 0; i < n; i++) {
          await page.locator('.carte-etiquetage').nth(i).click().catch(() => {});
          await page.locator('.etiquette-nombre').nth((i + 1) % n).click().catch(() => {});
        }
      }
      const o = await page.$('.bouton-option:not([disabled])');
      if (o) await o.click().catch(() => {});
      const v = await page.$('.bouton-principal:visible:not([disabled])');
      if (v) await v.click().catch(() => {});
      await page.waitForTimeout(120);
      const s = await page.$('#bouton-suivant:not([hidden])');
      if (s) { await s.click().catch(() => {}); await page.waitForTimeout(200); } else break;
    }
    const verrou = await page.evaluate(() => document.documentElement.classList.contains('glisse-en-cours'));
    if (verrou) { echecs++; console.log(`  ✗ ${id} : verrou de défilement laissé actif`); }
    console.log(`  ${id} : ${await page.locator('.bloc-resultats').count() ? 'terminé' : 'non terminé (pilote limité)'}`);
    await page.evaluate(() => { const x = document.getElementById('bouton-retour'); if (x) x.click(); });
    await page.waitForTimeout(200);
  }
  if (erreurs.length) { echecs++; console.log('  ✗ erreurs :', erreurs.slice(0, 5)); }
  else console.log('OK   Aucune erreur console / JS');
  console.log(echecs === 0 ? 'M01 PARCOURS : OK' : `M01 PARCOURS : ${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
})();
