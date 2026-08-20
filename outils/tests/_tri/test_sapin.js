const C = require('./m23_commun');
// L'énoncé du sapin doit porter la précision, dans les DEUX mini-jeux CE1 qui
// partagent cette banque d'unités, et être lu tel quel à voix haute.
let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, 'CE1');

  // La banque elle-même : un seul énoncé « sapin », et il est précisé.
  const banque = await page.evaluate(() => {
    // La banque vit dans l'IIFE : on la relit dans la source de la page.
    return document.documentElement.outerHTML.match(/La hauteur d'un sapin[^"]*/g);
  });
  ok(banque && banque.length === 1, 'Un seul énoncé « sapin » dans le module', banque);
  ok(banque && /^La hauteur d'un sapin/.test(banque[0]), "Il emploie l'article indéfini", banque && banque[0]);

  /* Le sapin est un item parmi douze, tiré dans un sous-type parmi deux, lui-même
     un sous-type parmi quatre pour « La règle du garde forestier » : le rencontrer
     par échantillonnage y est très improbable. On prouve donc le CHEMIN D'APPEL,
     qui est déterministe, et on complète par un échantillonnage sur le mini-jeu
     où il sort souvent. */
  const source = await page.evaluate(() => document.documentElement.outerHTML);
  const enchaine = (depuis, vers) => {
    const i = source.indexOf('function ' + depuis);
    if (i === -1) return false;
    return source.slice(i, i + 1800).includes(vers);
  };
  ok(enchaine('genererComparerRangerCE1', 'genererUnitesConversionCE1'),
    'La règle du garde forestier appelle bien le sous-type unités');
  ok(enchaine('genererUnitesConversionCE1', 'genererUniteAppropriee'),
    '…lequel appelle le générateur de question d\'unité');
  ok(enchaine('genererUniteAppropriee', 'OBJETS_UNITES_CE1'),
    '…qui puise dans la banque contenant le sapin précisé');

  let vu = null;
  for (let partie = 0; partie < 10 && !vu; partie++) {
    await C.lancer(page, 'unites-conversion-ce1');
    for (let manche = 0; manche < 7 && !vu; manche++) {
      await page.waitForTimeout(110);
      const t = await page.evaluate(() => {
        const c = document.querySelector('.consigne');
        return c ? c.textContent : '';
      });
      if (/sapin/.test(t)) vu = t;
      await C.atteindreManche(page, '.rien-du-tout', 1);
      if (await page.locator('.bloc-resultats').count()) break;
    }
    await page.evaluate(() => { const b = document.getElementById('bouton-retour'); if (b) b.click(); });
    await page.waitForTimeout(150);
  }
  ok(vu && /d'un sapin/.test(vu),
    "Rencontré en jeu, l'énoncé affiché emploie l'article indéfini", vu || '(sapin non tiré)');

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 4));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
