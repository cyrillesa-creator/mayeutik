const C = require('./m23_commun');
// Points 1 et 2 : plus de « On y retourne », et « Presque » réservé aux
// réponses réellement voisines.
(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, 'CE2');
  let echecs = 0;

  const banques = await page.evaluate(() =>
    JSON.parse(document.getElementById('donnees-jeu').textContent).messagesFeedback);
  if (banques.rate.some((m) => /on y retourne/i.test(m))) { echecs++; console.log('  ✗ « On y retourne » toujours présent'); }
  else console.log('OK   1. Plus aucun « On y retourne »');
  if (banques.rate.some((m) => /presque/i.test(m))) { echecs++; console.log('  ✗ « presque » figure dans la banque NEUTRE', banques.rate); }
  else console.log('OK   2a. « Presque » absent de la banque neutre');
  if (!banques.rateProche || !banques.rateProche.every((m) => /presque|tout près/i.test(m))) {
    echecs++; console.log('  ✗ banque « réponse voisine » absente ou incohérente');
  } else console.log('OK   2b. Banque « réponse voisine » distincte', banques.rateProche.length + ' messages');

  /* Vérification EN SITUATION sur « La lisière de la forêt » (CE1) : ses
     conversions sont toutes déductibles de l'énoncé, donc on peut viser
     exprès une réponse voisine (écart de 1) puis une réponse très fausse. */
  await page.evaluate(() => {
    const puce = Array.from(document.querySelectorAll('.puce-palier')).find((b) => b.textContent.trim() === 'CE1');
    if (puce) puce.click();
  });
  await page.waitForTimeout(200);
  await C.lancer(page, 'unites-conversion-ce1');

  let testLoin = 0, testProche = 0, manches = 0;
  for (let i = 0; i < 120 && (testLoin < 5 || testProche < 5); i++) {
    const bonne = await page.evaluate(() => {
      if (!document.querySelector('.touche-pave:not([disabled])')) return null;
      const t = (document.querySelector('.consigne') || {}).textContent || '';
      let m;
      if ((m = t.match(/(\d+)\s*m\s*\+\s*(\d+)\s*cm/))) return +m[1] * 100 + +m[2];
      if ((m = t.match(/(\d+)\s*km\s*=\s*combien de m/))) return +m[1] * 1000;
      if ((m = t.match(/(\d+)\s*m\s*=\s*combien de cm/))) return +m[1] * 100;
      return null;
    });
    if (bonne !== null) {
      manches++;
      const viserProche = testProche <= testLoin;
      const valeur = viserProche ? bonne - 1 : Math.max(1, Math.floor(bonne / 9));
      for (const d of String(valeur).split('')) {
        await page.locator('.touche-pave', { hasText: new RegExp('^' + d + '$') }).first().click({ timeout: 4000 });
      }
      await page.locator('.touche-valider').first().click({ timeout: 4000 });
      await page.waitForTimeout(180);
      const fb = await page.evaluate(() => document.getElementById('zone-feedback').textContent);
      const ditPresque = /presque|tout près/i.test(fb);
      if (viserProche) {
        testProche++;
        if (!ditPresque) { echecs++; console.log(`  ✗ écart de 1 (${valeur} au lieu de ${bonne}) : message neutre « ${fb} »`); }
      } else {
        testLoin++;
        if (ditPresque) { echecs++; console.log(`  ✗ réponse très fausse (${valeur} au lieu de ${bonne}) : « ${fb} »`); }
      }
    } else {
      const opt = await page.$('.bouton-option:not([disabled])');
      if (opt) await opt.click().catch(() => {});
      await page.waitForTimeout(120);
    }
    const s = await page.$('#bouton-suivant:not([hidden])');
    if (s) { await s.click().catch(() => {}); await page.waitForTimeout(200); }
    else {
      const r = await page.$('button:has-text("Rejouer")');
      if (r) { await r.click().catch(() => {}); await page.waitForTimeout(250); }
    }
  }
  console.log(`OK   2c. ${testProche} réponses VOISINES et ${testLoin} réponses TRÈS FAUSSES éprouvées`);
  if (testProche < 5 || testLoin < 5) { echecs++; console.log('  ✗ échantillon insuffisant'); }

  if (erreurs.length) { echecs++; console.log('  ✗ erreurs :', erreurs.slice(0, 4)); }
  console.log(echecs === 0 ? 'MESSAGES : OK' : `MESSAGES : ${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
})();
