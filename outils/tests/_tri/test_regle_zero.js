const C = require('./m23_commun');

/* Point 2 : le « 0 » (et plus généralement la première étiquette) de TOUTE
   règle graduée doit tenir entièrement dans la règle, qui est en
   `overflow:hidden`. On vérifie sur les trois fabriques de règles du module :
   règle fixe (construireRegle), règle déplaçable (genererMesurerGlisser) et
   double décimètre mobile (creerRegleMobile). */

const inspecter = (page) => page.evaluate(() => {
  const regles = Array.from(document.querySelectorAll('.regle-graduee'));
  return regles.map((r) => {
    const br = r.getBoundingClientRect();
    const cs = getComputedStyle(r);
    const bordure = parseFloat(cs.borderLeftWidth) || 0;
    const interieurGauche = br.left + bordure;
    const interieurDroite = br.right - bordure;
    const labels = Array.from(r.querySelectorAll('.regle-label, .regle-label-haut')).map((l) => {
      const b = l.getBoundingClientRect();
      return { t: l.textContent, gauche: b.left, droite: b.right, largeur: b.width };
    });
    if (!labels.length) return null;
    const premier = labels.reduce((a, b) => (a.gauche <= b.gauche ? a : b));
    return {
      classe: r.className,
      // Marge disponible à GAUCHE du premier label : négative = rogné.
      margeGauche: +(premier.gauche - interieurGauche).toFixed(1),
      margeDroite: +(interieurDroite - labels.reduce((a, b) => (a.droite >= b.droite ? a : b)).droite).toFixed(1),
      premier: premier.t,
      rognes: labels.filter((l) => l.gauche < interieurGauche - 0.5 || l.droite > interieurDroite + 0.5).map((l) => l.t)
    };
  }).filter(Boolean);
});

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let echecs = 0, reglesVues = 0;
  const vues = new Set();

  for (const [niveau, jeux] of [['CP', ['mesurer-longueurs-cp']],
                                ['CE1', ['comparer-ranger-ce1']],
                                ['CE2', ['calculs-mesure-ce2', 'perimetre-ce2']]]) {
    const { page, erreurs } = await C.ouvrir(browser, port, niveau);
    for (const id of jeux) {
      for (let partie = 0; partie < 4; partie++) {
        await C.lancer(page, id);
        for (let manche = 0; manche < 8; manche++) {
          await page.waitForTimeout(150);
          const regles = await inspecter(page);
          for (const r of regles) {
            reglesVues++;
            const famille = r.classe.replace(/\s+/g, '.');
            vues.add(niveau + '/' + id + ' ' + famille);
            if (r.rognes.length) {
              echecs++;
              console.log(`  ✗ ${niveau}/${id} (${famille}) : étiquette(s) rognée(s) ${JSON.stringify(r.rognes)}`);
            } else if (r.margeGauche < 1) {
              echecs++;
              console.log(`  ✗ ${niveau}/${id} (${famille}) : « ${r.premier} » collé au bord (marge ${r.margeGauche} px)`);
            }
          }
          await C.atteindreManche(page, '.rien-du-tout', 1);
          if (await page.locator('.bloc-resultats').count()) break;
        }
        await page.evaluate(() => { const b = document.getElementById('bouton-retour'); if (b) b.click(); });
        await page.waitForTimeout(200);
      }
    }
    if (erreurs.length) { echecs++; console.log(`  ✗ ${niveau} erreurs :`, erreurs.slice(0, 4)); }
    await page.close();
  }
  console.log(`  ${reglesVues} règles inspectées, ${vues.size} contextes distincts :`);
  Array.from(vues).sort().forEach((v) => console.log('    · ' + v));
  if (vues.size < 3) { echecs++; console.log('  ✗ trop peu de contextes différents'); }
  console.log(echecs === 0 ? 'RÈGLES GRADUÉES : OK — le « 0 » n\'est jamais rogné' : `RÈGLES GRADUÉES : ${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
