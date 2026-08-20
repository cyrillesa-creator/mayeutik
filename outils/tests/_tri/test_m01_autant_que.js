const C = require('./m01_commun');

/* « Autant que le modèle » :
   - Retirer est à gauche, Ajouter à droite ;
   - police agrandie sur les trois boutons ;
   - erreur "j'ai mis autant que le modèle alors qu'il fallait +1/-1" → message
     qui renvoie à la consigne ;
   - la boîte « à toi » est dimensionnée dès le départ à sa taille finale (pas
     de saut des boutons quand le résultat prend deux lignes). */

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 900 });

  const observations = [];
  const NB_PARTIES = 5;
  for (let p = 0; p < NB_PARTIES; p++) {
    await C.lancer(page, 'autant-que');
    await page.waitForSelector('.collection-cible');
    for (let m = 0; m < 6; m++) {
      // ---- Ordre des boutons : Retirer avant Ajouter dans le DOM/l'écran ----
      const ordre = await page.evaluate(() => Array.from(document.querySelectorAll('.rangee-boutons-cible button'))
        .map((b) => b.className));
      ok(ordre.length === 2 && ordre[0].includes('bouton-retirer') && ordre[1].includes('bouton-ajouter'),
        `Partie ${p} manche ${m}: Retirer à gauche, Ajouter à droite`, ordre);

      // ---- Position X réelle à l'écran ----
      const positions = await page.evaluate(() => {
        const r = document.querySelector('.bouton-retirer').getBoundingClientRect();
        const a = document.querySelector('.bouton-ajouter').getBoundingClientRect();
        return { retirerX: r.left, ajouterX: a.left };
      });
      ok(positions.retirerX < positions.ajouterX, `Partie ${p} manche ${m}: Retirer visuellement à gauche d’Ajouter`, positions);

      // ---- Police agrandie sur les trois boutons ----
      const tailles = await page.evaluate(() => ({
        ajouter: parseFloat(getComputedStyle(document.querySelector('.bouton-ajouter')).fontSize),
        retirer: parseFloat(getComputedStyle(document.querySelector('.bouton-retirer')).fontSize),
        valider: parseFloat(getComputedStyle(document.querySelector('#zone-jeu .bouton-principal')).fontSize)
      }));
      ok(tailles.ajouter >= 18 && tailles.retirer >= 18 && tailles.valider >= 18,
        `Partie ${p} manche ${m}: police des 3 boutons agrandie (>= 18px)`, tailles);

      // ---- Boîte « à toi » pré-dimensionnée : hauteur AVANT tout ajout ----
      const hauteurAvant = await page.evaluate(() => document.querySelector('.collection-cible').getBoundingClientRect().height);
      const positionBoutonsAvant = await page.evaluate(() => document.querySelector('.rangee-boutons-cible').getBoundingClientRect().top);

      // Lit modèle / relation depuis la consigne pour reconstituer la cible.
      const infos = await page.evaluate(() => ({
        modele: document.querySelectorAll('.collection-modele span').length,
        consigneTexte: document.querySelector('#zone-jeu').textContent
      }));
      const relationPlus = /UN DE PLUS/.test(infos.consigneTexte);
      const relationMoins = /UN DE MOINS/.test(infos.consigneTexte);
      const cible = relationPlus ? infos.modele + 1 : relationMoins ? infos.modele - 1 : infos.modele;

      // Ajoute jusqu'à la cible (chemin correct), en vérifiant qu'aucun
      // ajout ne fait bouger la rangée de boutons verticalement.
      let sauteDePosition = false;
      for (let k = 0; k < cible; k++) {
        await page.click('.bouton-ajouter');
        await page.waitForTimeout(15);
        const top = await page.evaluate(() => document.querySelector('.rangee-boutons-cible').getBoundingClientRect().top);
        if (Math.abs(top - positionBoutonsAvant) > 0.5) sauteDePosition = true;
      }
      ok(!sauteDePosition, `Partie ${p} manche ${m}: les boutons ne se déplacent jamais pendant l’ajout`, { cible, modele: infos.modele });

      if (cible >= 6) {
        const hauteurRemplie = await page.evaluate(() => document.querySelector('.collection-cible').getBoundingClientRect().height);
        ok(Math.abs(hauteurRemplie - hauteurAvant) < 1,
          `Partie ${p} manche ${m}: (cible=${cible}, 2 lignes) la boîte était déjà à sa taille finale avant tout ajout`,
          { hauteurAvant, hauteurRemplie });
      }

      await page.click('#zone-jeu .bouton-principal');
      await page.waitForTimeout(150);
      const feedback = await page.evaluate(() => document.getElementById('zone-feedback').textContent);
      observations.push(feedback);
      await page.click('#bouton-suivant');
      await page.waitForTimeout(200);
      if (m < 5) await page.waitForSelector('.collection-cible');
    }
    if (p < NB_PARTIES - 1) {
      await page.waitForSelector('.bloc-resultats');
      await page.click('.bloc-resultats .bouton-principal');
      await page.waitForTimeout(200);
      await page.waitForSelector('.collection-cible');
    }
  }

  // ---- Cas d'erreur ciblé : mettre EXACTEMENT le compte du modèle quand il
  // fallait en mettre plus ou moins → message qui renvoie à la consigne. ----
  await page.waitForSelector('.bloc-resultats');
  await page.click('.bloc-resultats .bouton-principal');
  await page.waitForTimeout(200);
  let essais = 0, trouve = false;
  while (essais < 15 && !trouve) {
    await page.waitForSelector('.collection-cible');
    const consigneTexte = await page.evaluate(() => document.querySelector('#zone-jeu').textContent);
    const modele = await page.evaluate(() => document.querySelectorAll('.collection-modele span').length);
    if (/UN DE (PLUS|MOINS)/.test(consigneTexte)) {
      trouve = true;
      for (let k = 0; k < modele; k++) { await page.click('.bouton-ajouter'); await page.waitForTimeout(10); }
      await page.click('#zone-jeu .bouton-principal');
      await page.waitForTimeout(150);
      const feedback = await page.evaluate(() => document.getElementById('zone-feedback').textContent);
      ok(/consigne/i.test(feedback), 'Erreur ciblée (compte = modèle, relation +1/-1) : le message renvoie à la consigne', feedback);
      await page.click('#bouton-suivant');
    } else {
      // Passe cette manche avec la bonne réponse pour continuer à chercher un tirage "plus/moins".
      const relationPlus = /UN DE PLUS/.test(consigneTexte);
      const cible = relationPlus ? modele + 1 : modele; // ici relation === 'autant'
      for (let k = 0; k < cible; k++) { await page.click('.bouton-ajouter'); await page.waitForTimeout(10); }
      await page.click('#zone-jeu .bouton-principal');
      await page.waitForTimeout(150);
      await page.click('#bouton-suivant');
      await page.waitForTimeout(150);
      const resultats = await page.locator('.bloc-resultats').count();
      if (resultats) { await page.click('.bloc-resultats .bouton-principal'); await page.waitForTimeout(200); }
    }
    essais++;
  }
  ok(trouve, 'Un tirage "plus/moins" a bien été rencontré pour tester le message d’erreur ciblé', essais);

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
