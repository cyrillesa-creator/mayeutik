const C = require('./m01_commun');

/* Navigation automatique après un délai (CHARTE §20) :
   - 2 s après l'affichage du bouton « Suivant », la manche avance sans clic ;
   - un clic manuel avant les 2 s annule le minuteur (pas de double-avance) ;
   - quitter le jeu (bouton retour) pendant le délai n'a plus d'effet retardé. */

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 700 });

  // ---- 1. Avance automatique après ~2 s, sans clic ----
  await C.lancer(page, 'comparer');
  await page.waitForSelector('.bouton-contenant');
  const progressionAvant = await page.evaluate(() => document.getElementById('progression-jeu').textContent);
  await page.locator('.bouton-contenant').first().click();
  await page.waitForSelector('#bouton-suivant:not([hidden])');

  await page.waitForTimeout(1500);
  const avant2s = await page.evaluate(() => document.getElementById('progression-jeu').textContent);
  ok(avant2s === progressionAvant, '1a. Avant 2 s : pas encore avancé', { avant2s, progressionAvant });

  await page.waitForTimeout(900); // total ~2.4 s
  const apres2s = await page.evaluate(() => document.getElementById('progression-jeu').textContent);
  ok(apres2s !== progressionAvant, '1b. ~2 s après l’affichage de "Suivant" : la manche a avancé toute seule', { avant: progressionAvant, apres: apres2s });

  // ---- 2. Un clic manuel avant les 2 s empêche toute double-avance ----
  await page.waitForSelector('.bouton-contenant');
  const progressionAvant2 = await page.evaluate(() => document.getElementById('progression-jeu').textContent);
  await page.locator('.bouton-contenant').first().click();
  await page.waitForSelector('#bouton-suivant:not([hidden])');
  await page.waitForTimeout(300);
  await page.click('#bouton-suivant'); // clic manuel, bien avant les 2 s
  await page.waitForTimeout(150);
  const progressionApresClic = await page.evaluate(() => document.getElementById('progression-jeu').textContent);
  ok(progressionApresClic !== progressionAvant2, '2a. Le clic manuel fait bien avancer une fois', { progressionAvant2, progressionApresClic });
  // On attend largement au-delà des 2 s d'origine : si le minuteur n'avait pas
  // été annulé, une seconde avance fantôme se produirait ici.
  await page.waitForTimeout(2200);
  const progressionApresAttente = await page.evaluate(() => document.getElementById('progression-jeu').textContent);
  ok(progressionApresAttente === progressionApresClic,
    '2b. Aucune double-avance fantôme : le minuteur du clic précédent a bien été annulé',
    { progressionApresClic, progressionApresAttente });

  // ---- 3. Quitter le jeu pendant le délai : pas d'avance fantôme sur l'accueil ----
  await page.waitForSelector('.bouton-contenant');
  await page.locator('.bouton-contenant').first().click();
  await page.waitForSelector('#bouton-suivant:not([hidden])');
  await page.click('#bouton-retour');
  await page.waitForSelector('#grille-jeux');
  await page.waitForTimeout(2500); // largement au-delà des 2 s du minuteur laissé armé
  const surAccueil = await page.evaluate(() => !document.getElementById('ecran-accueil').hidden);
  ok(surAccueil, '3. Toujours sur l’accueil 2,5 s après la sortie : aucune avance fantôme ne nous a ramené dans le jeu', surAccueil);

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
