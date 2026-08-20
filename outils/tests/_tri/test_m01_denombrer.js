const C = require('./m01_commun');

/* « Compte les petites bêtes » :
   - toujours au moins 2 bêtes à compter (plus de manche à 1 seul élément) ;
   - la question du pavé numérique dit "Combien de/d' [pluriel]", jamais
     "As-tu compté [singulier] ?" ni une élision fautive ("de abeilles"). */

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 700 });

  const observations = [];
  const NB_PARTIES = 6; // 6 parties x 6 manches = 36 tirages, large échantillon
  for (let p = 0; p < NB_PARTIES; p++) {
    await C.lancer(page, 'denombrer');
    await page.waitForSelector('.bete-jardin');
    for (let m = 0; m < 6; m++) {
      const nbBetes = await page.locator('.bete-jardin').count();
      ok(nbBetes >= 2, `Partie ${p} manche ${m}: au moins 2 bêtes à compter`, nbBetes);
      for (let k = 0; k < nbBetes; k++) {
        await page.locator('.bete-jardin:not(.comptee)').first().click();
        await page.waitForTimeout(12);
      }
      await page.waitForSelector('.pave-numerique');
      const consigne = await page.evaluate(() => document.getElementById('zone-pave').textContent);
      observations.push(consigne);
      ok(!/^As-tu compté/i.test(consigne.trim()), `Partie ${p} manche ${m}: plus la question "As-tu compté...?" (question à un seul élément retirée)`, consigne);
      ok(/^Combien /.test(consigne.trim()), `Partie ${p} manche ${m}: la question commence par "Combien"`, consigne);
      ok(!/Combien de [aeiouyàâäéèêëïîôöùûüh]/i.test(consigne), `Partie ${p} manche ${m}: pas de "de" devant une voyelle`, consigne);
      const boutons = await page.locator('.touche-chiffre').all();
      await boutons[0].click();
      await page.waitForTimeout(120);
      await page.click('#bouton-suivant');
      await page.waitForTimeout(200);
      if (m < 5) await page.waitForSelector('.bete-jardin');
    }
    // Écran de résultats : on rejoue directement pour la partie suivante.
    if (p < NB_PARTIES - 1) {
      await page.waitForSelector('.bloc-resultats');
      await page.click('.bloc-resultats .bouton-principal'); // "Rejouer"
      await page.waitForTimeout(200);
      await page.waitForSelector('.bete-jardin');
    }
  }

  const aEuAbeilleOuEscargot = observations.some((c) => /d.(abeille|escargot)s?/i.test(c));
  ok(aEuAbeilleOuEscargot, 'Au moins une manche a testé l’élision (abeille/escargot)',
    observations.filter((c) => /abeille|escargot/i.test(c)).slice(0, 3));

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
