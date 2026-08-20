const C = require('./m01_commun');

/* « La bonne étiquette » : le tracé doit désormais marcher AUSSI depuis une
   étiquette de droite vers une carte de gauche (et pas seulement l'inverse). */

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

const etat = (page) => page.evaluate(() => ({
  liens: document.querySelectorAll('.traits-connexion .trait-connexion').length,
  traceEnCours: document.querySelectorAll('.traits-connexion .trait-en-cours').length,
  cartesLiees: document.querySelectorAll('.carte-etiquetage.liee').length,
  etiquettesLiees: document.querySelectorAll('.etiquette-nombre.liee').length,
  selection: document.querySelectorAll('.carte-etiquetage.selectionnee').length,
  survolees: document.querySelectorAll('.cible-survolee').length,
  departs: document.querySelectorAll('.trace-depart').length,
  gele: document.documentElement.classList.contains('glisse-en-cours')
}));

/* Tracé continu PARTI DE DROITE : on part de l'étiquette `iEtq`, on glisse
   jusqu'à la carte `iCarte` (ou `null` pour relâcher dans le vide). */
async function tracerDepuisDroite(page, iEtq, iCarte, options) {
  const opts = options || {};
  return await page.evaluate(({ iEtq, iCarte, opts }) => {
    const etq = document.querySelectorAll('.etiquette-nombre')[iEtq];
    if (!etq) return { erreur: 'étiquette introuvable' };
    const rc = etq.getBoundingClientRect();
    const d = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    let a;
    if (iCarte === null) {
      a = { x: rc.left + rc.width / 2, y: rc.bottom + 140 };
    } else {
      const carte = document.querySelectorAll('.carte-etiquetage')[iCarte];
      if (!carte) return { erreur: 'carte introuvable' };
      const rcarte = carte.getBoundingClientRect();
      a = { x: rcarte.left + rcarte.width / 2, y: rcarte.top + rcarte.height / 2 };
    }
    const env = (t, x, y) => etq.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    env('pointerdown', d.x, d.y);
    const releves = [];
    const N = 8;
    for (let k = 1; k <= N; k++) {
      const x = d.x + (a.x - d.x) * k / N, y = d.y + (a.y - d.y) * k / N;
      env('pointermove', x, y);
      const ligne = document.querySelector('.trait-en-cours');
      releves.push({
        bout: ligne ? { x: Math.round(+ligne.getAttribute('x2')), y: Math.round(+ligne.getAttribute('y2')) } : null,
        couleur: ligne ? ligne.getAttribute('stroke') : null,
        survolees: document.querySelectorAll('.cible-survolee').length
      });
    }
    if (opts.annuler) env('pointercancel', a.x, a.y);
    else env('pointerup', a.x, a.y);
    return { releves };
  }, { iEtq, iCarte, opts });
}

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 500 });
  await C.lancer(page, 'etiqueter');
  await page.waitForSelector('.carte-etiquetage');

  // ---- 1. TRACÉ PARTI DE DROITE : relâché sur une carte, la liaison se crée ----
  const avant = await etat(page);
  const t = await tracerDepuisDroite(page, 0, 0);
  ok(!t.erreur, '1a. Le tracé parti de droite s’exécute sans erreur', t.erreur);
  ok(t.releves.some((r) => r.survolees === 1), '1b. La carte visée est mise en avant pendant le tracé');
  ok(t.releves[t.releves.length - 1].couleur && t.releves[t.releves.length - 1].couleur !== 'var(--couleur-encre)',
    '1c. Le trait reprend la couleur de la carte survolée', t.releves[t.releves.length - 1].couleur);
  const apres = await etat(page);
  ok(apres.liens === avant.liens + 1 && apres.cartesLiees === 1 && apres.etiquettesLiees === 1,
    '1d. Relâché sur une carte : la liaison est créée (sens droite → gauche)', apres);
  ok(apres.traceEnCours === 0 && apres.departs === 0 && apres.survolees === 0,
    '1e. Aucun résidu de tracé après le geste', apres);

  // ---- 2. Relié DANS LE VIDE depuis la droite : rien ne se passe ----
  const avantVide = await etat(page);
  await tracerDepuisDroite(page, 1, null);
  await page.waitForTimeout(80);
  const apresVide = await etat(page);
  ok(apresVide.liens === avantVide.liens, '2. Relâché en dehors d’une carte : aucune liaison créée', apresVide);

  // ---- 3. Tap RÉEL sur l'étiquette de droite SEUL (sans sélection à gauche) : rien ----
  const avantTapSeul = await etat(page);
  await page.locator('.etiquette-nombre').nth(2).tap();
  await page.waitForTimeout(80);
  const apresTapSeul = await etat(page);
  ok(apresTapSeul.liens === avantTapSeul.liens, '3. Tap seul sur une étiquette (aucune carte choisie) : ne fait rien', apresTapSeul);

  // ---- 4. Tap RÉEL bocal puis étiquette (chemin déjà testé) doit toujours marcher ----
  await page.locator('.carte-etiquetage').nth(1).tap();
  await page.waitForTimeout(60);
  await page.locator('.etiquette-nombre').nth(1).tap();
  await page.waitForTimeout(80);
  const apresTapClassique = await etat(page);
  ok(apresTapClassique.liens === apresVide.liens + 1, '4. Tap séquentiel classique (gauche puis droite) fonctionne toujours', apresTapClassique);

  // ---- 5. Relier les cartes restantes toutes DEPUIS LA DROITE, puis valider ----
  // (peu importe ici que la paire soit juste : seule la CRÉATION du lien par
  // le nouveau sens de tracé est testée — la justesse est vérifiée ailleurs.)
  const nbCartes = await page.locator('.carte-etiquetage').count();
  for (let i = 0; i < nbCartes; i++) {
    const liee = await page.locator('.carte-etiquetage').nth(i).evaluate((el) => el.classList.contains('liee'));
    if (liee) continue;
    await tracerDepuisDroite(page, i, i);
    await page.waitForTimeout(60);
  }
  const complet = await etat(page);
  ok(complet.liens === nbCartes && complet.cartesLiees === nbCartes,
    `5. Les ${nbCartes} cartes se relient toutes en partant systématiquement de la droite`, complet);
  const validerVisible = await page.locator('#zone-jeu .bouton-principal:not([hidden])').count();
  ok(validerVisible === 1, '6. Le bouton Valider apparaît une fois tout relié depuis la droite');
  await page.click('#zone-jeu .bouton-principal');
  await page.waitForTimeout(250);
  const apresValidation = await page.evaluate(() => document.getElementById('zone-feedback').className);
  ok(/feedback-(succes|erreur)/.test(apresValidation), '7. La manche se valide normalement', apresValidation);

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
