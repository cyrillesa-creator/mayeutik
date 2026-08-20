const C = require('./m01_commun');

let echecs = 0;
const ok = (cond, msg, extra) => {
  console.log((cond ? 'OK   ' : '✗    ') + msg, extra === undefined ? '' : extra);
  if (!cond) echecs++;
};

const etat = (page) => page.evaluate(() => ({
  panier: document.querySelectorAll('.grille-cible .bete-draggable').length,
  reserve: document.querySelectorAll('.reserve-drag .bete-draggable').length,
  enLAir: Array.from(document.querySelectorAll('.bete-draggable'))
    .filter((b) => b.style.position === 'fixed' || b.classList.contains('en-glisse')).length,
  scrollY: window.scrollY,
  scrollMax: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  gele: document.documentElement.classList.contains('glisse-en-cours')
}));

/* Glissement tactile pas à pas, avec relevé de l'état À MI-GESTE (c'est là que
   le défilement doit être bloqué) et tentative de défilement pendant le geste. */
async function glisserAvecReleve(page, cible, options) {
  const opts = options || {};
  return await page.evaluate(async ({ cible, opts }) => {
    const el = document.querySelector('.reserve-drag .bete-draggable');
    if (!el) return { erreur: 'plus rien en réserve' };
    const r = el.getBoundingClientRect();
    const depart = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const c = document.querySelector(cible).getBoundingClientRect();
    const arrivee = { x: c.left + c.width / 2 + (opts.decalX || 0), y: c.top + c.height / 2 + (opts.decalY || 0) };
    const env = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    env('pointerdown', depart.x, depart.y);
    const N = 10;
    let miGeste = null;
    for (let k = 1; k <= N; k++) {
      env('pointermove', depart.x + (arrivee.x - depart.x) * k / N, depart.y + (arrivee.y - depart.y) * k / N);
      if (k === Math.floor(N / 2)) {
        // Un touchmove ANNULÉ est ce qui empêche réellement le navigateur de
        // défiler pendant le geste : on en émet un et on regarde s'il l'est.
        const tm = new Event('touchmove', { bubbles: true, cancelable: true });
        document.dispatchEvent(tm);
        miGeste = {
          gele: document.documentElement.classList.contains('glisse-en-cours'),
          touchmoveAnnule: tm.defaultPrevented,
          overflow: getComputedStyle(document.documentElement).overflowY,
          touchAction: getComputedStyle(document.documentElement).touchAction
        };
      }
    }
    if (opts.annuler) env('pointercancel', arrivee.x, arrivee.y);
    else env('pointerup', arrivee.x, arrivee.y);
    return { miGeste };
  }, { cible, opts });
}

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // Viewport COURT : la page défile réellement, condition d'apparition du bug.
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 500 });

  // ---- Le défilement doit être NORMAL hors glissement ----
  await C.lancer(page, 'constituer');
  await page.waitForSelector('.bete-draggable');
  const libre = await page.evaluate(async () => {
    window.scrollTo(0, 0);
    window.scrollBy(0, 200);
    await new Promise((r) => requestAnimationFrame(r));
    const y = window.scrollY;
    window.scrollTo(0, 0);
    return { y, max: document.documentElement.scrollHeight - window.innerHeight };
  });
  ok(libre.max > 0 && libre.y > 0, 'Hors glissement : la page défile normalement',
    `${libre.y} px sur ${libre.max} possibles`);

  // ---- Plusieurs dépôts successifs, avec tentative de défilement en plein geste ----
  let depotsOk = 0, tentatives = 0, gelesConstates = 0;
  for (let i = 0; i < 5; i++) {
    const avant = await etat(page);
    if (avant.reserve === 0) break;
    tentatives++;
    const r = await glisserAvecReleve(page, '.grille-cible');
    await page.waitForTimeout(100);
    const apres = await etat(page);
    if (apres.panier === avant.panier + 1) depotsOk++;
    else console.log(`  ✗ dépôt ${i + 1} : panier ${avant.panier} -> ${apres.panier}`);
    if (r.miGeste) {
      const bloque = r.miGeste.gele && r.miGeste.touchmoveAnnule &&
        r.miGeste.overflow === 'hidden' && r.miGeste.touchAction === 'none';
      if (bloque) gelesConstates++;
      else console.log('  ✗ défilement NON bloqué pendant le geste :', JSON.stringify(r.miGeste));
    }
    if (apres.gele) { echecs++; console.log('  ✗ le gel du défilement n\'a pas été relâché après le dépôt'); }
    if (apres.enLAir) { echecs++; console.log('  ✗ un élément est resté en l\'air après le dépôt'); }
  }
  ok(depotsOk === tentatives && tentatives >= 4,
    `${depotsOk}/${tentatives} dépôts successifs se fixent dans le panier`);
  ok(gelesConstates === tentatives,
    `${gelesConstates}/${tentatives} gestes : page figée (classe + overflow:hidden + touch-action:none + touchmove annulé)`);

  // ---- Le défilement redevient normal APRÈS les gestes ----
  const apresTout = await page.evaluate(async () => {
    window.scrollBy(0, 150);
    await new Promise((r) => requestAnimationFrame(r));
    const y = window.scrollY;
    window.scrollTo(0, 0);
    return y;
  });
  ok(apresTout > 0 || libre.max === 0, 'Après les gestes : la page défile de nouveau', apresTout + ' px');
  const verrousResiduels = await page.evaluate(() => {
    const tm = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(tm);
    return {
      gele: document.documentElement.classList.contains('glisse-en-cours'),
      touchmoveAnnule: tm.defaultPrevented,
      overflow: getComputedStyle(document.documentElement).overflowY
    };
  });
  ok(!verrousResiduels.gele && !verrousResiduels.touchmoveAnnule && verrousResiduels.overflow !== 'hidden',
    'Après les gestes : plus aucun verrou de défilement résiduel', verrousResiduels);

  // ---- Geste ANNULÉ par le navigateur : rien ne doit rester en l'air ----
  await C.lancer(page, 'constituer');
  await page.waitForSelector('.reserve-drag .bete-draggable');
  await glisserAvecReleve(page, '.grille-cible', { annuler: true });
  await page.waitForTimeout(150);
  const apresAnnul = await etat(page);
  ok(apresAnnul.enLAir === 0, 'Geste annulé (pointercancel) : aucune bête ne reste en l\'air');
  ok(!apresAnnul.gele, 'Geste annulé : le défilement est bien dégelé');
  ok(apresAnnul.panier === 1, 'Geste annulé sur le panier : la bête y est tout de même déposée', apresAnnul);

  // ---- Lâcher au RAS du bord : l'objet recouvre le panier, le doigt non ----
  await C.lancer(page, 'constituer');
  await page.waitForSelector('.reserve-drag .bete-draggable');
  const dims = await page.evaluate(() => {
    const g = document.querySelector('.grille-cible').getBoundingClientRect();
    const b = document.querySelector('.bete-draggable').getBoundingClientRect();
    return { hg: g.height, hb: b.height };
  });
  const avantBord = await etat(page);
  // Doigt 6 px SOUS le bord bas du panier : l'objet, lui, le chevauche encore.
  await glisserAvecReleve(page, '.grille-cible', { decalY: dims.hg / 2 + 6 });
  await page.waitForTimeout(120);
  const apresBord = await etat(page);
  ok(apresBord.panier === avantBord.panier + 1,
    'Lâcher au ras du bord (doigt 6 px dehors, objet sur le panier) : le dépôt est accepté', apresBord);

  // ---- Lâcher FRANCHEMENT à côté : le dépôt doit être refusé ----
  const avantLoin = await etat(page);
  await glisserAvecReleve(page, '.grille-cible', { decalY: dims.hg / 2 + 120 });
  await page.waitForTimeout(120);
  const apresLoin = await etat(page);
  ok(apresLoin.panier === avantLoin.panier,
    'Lâcher franchement à côté : le dépôt est refusé (la tolérance ne colle pas tout au panier)', apresLoin);

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 4));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
