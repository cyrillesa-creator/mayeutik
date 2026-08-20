const C = require('./m01_commun');

/* « La bonne étiquette » : les DEUX façons de relier doivent marcher —
   le tap séquentiel (déjà en place) et le nouveau tracé continu au doigt. */

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
  gele: document.documentElement.classList.contains('glisse-en-cours'),
  validerVisible: !!document.querySelector('#zone-jeu .bouton-principal:not([hidden])'),
  couleurs: Array.from(document.querySelectorAll('.traits-connexion .trait-connexion'))
    .map((l) => l.getAttribute('stroke'))
}));

/* Tracé continu : on part du bocal `iCarte`, on glisse jusqu'à l'étiquette
   `iEtq` (ou `null` pour relâcher dans le vide), en relevant l'état à mi-geste. */
async function tracer(page, iCarte, iEtq, options) {
  const opts = options || {};
  return await page.evaluate(({ iCarte, iEtq, opts }) => {
    const carte = document.querySelectorAll('.carte-etiquetage')[iCarte];
    if (!carte) return { erreur: 'carte introuvable' };
    const rc = carte.getBoundingClientRect();
    const d = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    let a;
    if (iEtq === null) {
      a = { x: rc.left + rc.width / 2, y: rc.bottom + 140 }; // dans le vide
    } else {
      const etq = document.querySelectorAll('.etiquette-nombre')[iEtq];
      if (!etq) return { erreur: 'étiquette introuvable' };
      const re = etq.getBoundingClientRect();
      a = { x: re.left + re.width / 2, y: re.top + re.height / 2 };
    }
    const env = (t, x, y) => carte.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    env('pointerdown', d.x, d.y);
    const releves = [];
    const N = 8;
    for (let k = 1; k <= N; k++) {
      const x = d.x + (a.x - d.x) * k / N, y = d.y + (a.y - d.y) * k / N;
      env('pointermove', x, y);
      const ligne = document.querySelector('.trait-en-cours');
      const zone = document.querySelector('.zone-etiquetage').getBoundingClientRect();
      releves.push({
        doigt: { x: Math.round(x - zone.left), y: Math.round(y - zone.top) },
        bout: ligne ? { x: Math.round(+ligne.getAttribute('x2')), y: Math.round(+ligne.getAttribute('y2')) } : null,
        couleur: ligne ? ligne.getAttribute('stroke') : null,
        gele: document.documentElement.classList.contains('glisse-en-cours'),
        survolees: document.querySelectorAll('.cible-survolee').length
      });
      if (k === 4) {
        const tm = new Event('touchmove', { bubbles: true, cancelable: true });
        document.dispatchEvent(tm);
        releves[releves.length - 1].touchmoveAnnule = tm.defaultPrevented;
        releves[releves.length - 1].touchActionCarte = getComputedStyle(carte).touchAction;
      }
    }
    if (opts.annuler) env('pointercancel', a.x, a.y);
    else env('pointerup', a.x, a.y);
    return { releves, valeurCarte: carte.textContent, valeurEtq: iEtq === null ? null :
      document.querySelectorAll('.etiquette-nombre')[iEtq].textContent };
  }, { iCarte, iEtq, opts });
}

/* Tap séquentiel : un appui bref sur le bocal, puis un clic sur l'étiquette. */
async function tapSequentiel(page, iCarte, iEtq) {
  await page.evaluate(({ iCarte }) => {
    const carte = document.querySelectorAll('.carte-etiquetage')[iCarte];
    const r = carte.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const env = (t) => carte.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    env('pointerdown'); env('pointermove'); env('pointerup');
  }, { iCarte });
  await page.waitForTimeout(60);
  await page.locator('.etiquette-nombre').nth(iEtq).click();
  await page.waitForTimeout(60);
}

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 500 });
  await C.lancer(page, 'etiqueter');
  await page.waitForSelector('.carte-etiquetage');

  // ---- 1. TRACÉ CONTINU : le trait suit le doigt ----
  const t = await tracer(page, 0, 0);
  const suit = t.releves.every((r) => r.bout && Math.abs(r.bout.x - r.doigt.x) <= 1 && Math.abs(r.bout.y - r.doigt.y) <= 1);
  ok(suit, '1a. Le trait suit le doigt en temps réel (bout du trait = position du doigt)',
    t.releves.slice(-1).map((r) => `doigt ${r.doigt.x},${r.doigt.y} / trait ${r.bout && r.bout.x},${r.bout && r.bout.y}`).join(''));
  ok(t.releves.every((r) => r.couleur && r.couleur !== 'none'),
    '1b. Le tracé porte la couleur de la paire', t.releves[0].couleur);
  const apresTrace = await etat(page);
  ok(apresTrace.liens === 1 && apresTrace.cartesLiees === 1 && apresTrace.etiquettesLiees === 1,
    '1c. Relâché sur une étiquette : la liaison est créée', apresTrace);
  ok(apresTrace.traceEnCours === 0 && apresTrace.departs === 0 && apresTrace.survolees === 0,
    '1d. Aucun résidu de tracé après le geste', apresTrace);
  const survolPendant = t.releves.some((r) => r.survolees === 1);
  ok(survolPendant, '1e. L\'étiquette visée est mise en avant pendant le tracé');

  // ---- 2. Défilement figé pendant le tracé, libre après ----
  const mi = t.releves.find((r) => r.touchmoveAnnule !== undefined);
  ok(mi && mi.gele && mi.touchmoveAnnule && mi.touchActionCarte === 'none',
    '2a. Pendant le tracé : page figée, touchmove annulé, touch-action:none', JSON.stringify(mi));
  ok(!apresTrace.gele, '2b. Après le tracé : le défilement est relâché');

  // ---- 3. Relâché DANS LE VIDE : aucun lien, état propre ----
  const avantVide = await etat(page);
  await tracer(page, 1, null);
  await page.waitForTimeout(80);
  const apresVide = await etat(page);
  ok(apresVide.liens === avantVide.liens,
    '3a. Relâché en dehors d\'une étiquette : aucune liaison créée', apresVide);
  ok(apresVide.traceEnCours === 0 && apresVide.departs === 0 && apresVide.survolees === 0 && !apresVide.gele,
    '3b. Tracé abandonné : rien ne reste (ni trait, ni survol, ni verrou)', apresVide);
  ok(apresVide.selection === 0, '3c. Tracé abandonné : aucune sélection en suspens', apresVide);

  // ---- 4. Geste ANNULÉ par le navigateur ----
  const avantAnnul = await etat(page);
  await tracer(page, 1, 1, { annuler: true });
  await page.waitForTimeout(80);
  const apresAnnul = await etat(page);
  ok(apresAnnul.liens === avantAnnul.liens && apresAnnul.traceEnCours === 0 && !apresAnnul.gele,
    '4. pointercancel : tracé abandonné proprement', apresAnnul);

  // ---- 5. TAP SÉQUENTIEL toujours fonctionnel ----
  const avantTap = await etat(page);
  await tapSequentiel(page, 1, 1);
  const apresTap = await etat(page);
  ok(apresTap.liens === avantTap.liens + 1,
    '5a. Tap séquentiel (bocal puis étiquette) : la liaison est créée', apresTap);
  ok(apresTap.selection === 0, '5b. Après un tap séquentiel, plus aucune sélection en attente');

  // Tap RÉEL (événements de confiance : pointerdown + pointerup + click), tel
  // que le produit un vrai doigt — c'est le chemin qu'il ne fallait pas casser.
  const avantVrai = await etat(page);
  await page.locator('.carte-etiquetage').nth(0).tap();
  await page.waitForTimeout(80);
  const apresSelection = await etat(page);
  ok(apresSelection.selection === 1,
    '5c. Tap RÉEL sur un bocal : il est sélectionné (une seule fois, pas de double effet)', apresSelection.selection);
  await page.locator('.etiquette-nombre').nth(0).tap();
  await page.waitForTimeout(80);
  const apresVrai = await etat(page);
  ok(apresVrai.liens === avantVrai.liens && apresVrai.selection === 0,
    '5d. Tap RÉEL sur l\'étiquette : la liaison est refaite sans doublon', apresVrai);

  // ---- 6. Les deux gestes cohabitent jusqu'à la validation ----
  const nbCartes = await page.locator('.carte-etiquetage').count();
  for (let i = 2; i < nbCartes; i++) {
    if (i % 2 === 0) await tracer(page, i, i);
    else await tapSequentiel(page, i, i);
    await page.waitForTimeout(60);
  }
  const complet = await etat(page);
  ok(complet.liens === nbCartes && complet.cartesLiees === nbCartes,
    `6a. ${nbCartes} liaisons établies en alternant tracé et tap`, complet);
  ok(new Set(complet.couleurs).size === complet.couleurs.length,
    '6b. Chaque lien garde sa couleur distincte', complet.couleurs);
  ok(complet.validerVisible, '6c. Le bouton Valider apparaît une fois tout relié');

  // ---- 7. La manche se valide normalement ----
  await page.click('#zone-jeu .bouton-principal');
  await page.waitForTimeout(250);
  const apresValidation = await page.evaluate(() => ({
    feedback: document.getElementById('zone-feedback').className,
    suivant: !!document.querySelector('#bouton-suivant:not([hidden])')
  }));
  ok(/feedback-(succes|erreur)/.test(apresValidation.feedback) && apresValidation.suivant,
    '7. La manche se valide et propose la suivante', apresValidation);

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 4));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
