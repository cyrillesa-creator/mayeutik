const C = require('./m01_commun');

/* « La parade des escargots » :
   1. une réponse fausse validée montre la solution puis fait AVANCER la manche
      (plus de seconde chance sur le même classement) ;
   2. le geste d'échange fige le défilement, qui reste libre en dehors. */

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

const etat = (page) => page.evaluate(() => ({
  progression: (document.getElementById('progression-jeu') || {}).textContent || '',
  slots: Array.from(document.querySelectorAll('.slot-rang')).map((s) => {
    const c = s.querySelector('.carte-parade');
    return { valeur: c ? Number(c.dataset.valeur) : null, correct: s.classList.contains('rang-correct'), incorrect: s.classList.contains('rang-incorrect') };
  }),
  feedback: (document.getElementById('zone-feedback') || {}).className || '',
  texteFeedback: (document.getElementById('zone-feedback') || {}).textContent || '',
  validerVisible: !!document.querySelector('#zone-jeu .bouton-principal:not([hidden])'),
  suivantVisible: !!document.querySelector('#bouton-suivant:not([hidden])'),
  gele: document.documentElement.classList.contains('glisse-en-cours'),
  enLAir: Array.from(document.querySelectorAll('.carte-parade'))
    .filter((b) => b.style.position === 'fixed' || b.classList.contains('en-glisse')).length
}));

/* Échange par glissement d'une carte vers la case d'index `cible`, avec relevé
   de l'état à mi-geste (le défilement doit y être bloqué). */
async function echanger(page, indexSource, indexCible) {
  return await page.evaluate(({ s, c }) => {
    const cartes = Array.from(document.querySelectorAll('.carte-parade'));
    const el = cartes[s];
    const slots = document.querySelectorAll('.slot-rang');
    const cible = slots[c];
    if (!el || !cible) return { erreur: 'introuvable' };
    const r = el.getBoundingClientRect(), rc = cible.getBoundingClientRect();
    const d = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const a = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    const env = (t, x, y) => el.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    env('pointerdown', d.x, d.y);
    let miGeste = null;
    const N = 8;
    for (let k = 1; k <= N; k++) {
      env('pointermove', d.x + (a.x - d.x) * k / N, d.y + (a.y - d.y) * k / N);
      if (k === 4) {
        const tm = new Event('touchmove', { bubbles: true, cancelable: true });
        document.dispatchEvent(tm);
        miGeste = {
          gele: document.documentElement.classList.contains('glisse-en-cours'),
          touchmoveAnnule: tm.defaultPrevented,
          overflow: getComputedStyle(document.documentElement).overflowY,
          touchAction: getComputedStyle(document.documentElement).touchAction,
          touchActionCarte: getComputedStyle(el).touchAction
        };
      }
    }
    env('pointerup', a.x, a.y);
    return { miGeste };
  }, { s: indexSource, c: indexCible });
}

/* Remplit toutes les cases, en plaçant DÉLIBÉRÉMENT à l'envers pour être sûr
   de se tromper (l'ordre attendu est croissant ou décroissant selon la manche). */
async function remplirALEnvers(page) {
  const n = await page.locator('.slot-rang').count();
  for (let i = 0; i < n; i++) {
    await page.evaluate((k) => {
      const libres = Array.from(document.querySelectorAll('.carte-parade'))
        .filter((c) => !c.dataset.slot);
      // On prend la plus GRANDE valeur restante en premier : si l'ordre attendu
      // est croissant, c'est faux ; sinon on inversera au tour suivant.
      libres.sort((a, b) => Number(b.dataset.valeur) - Number(a.dataset.valeur));
      const el = libres[0];
      const cible = document.querySelectorAll('.slot-rang')[k];
      if (!el || !cible) return;
      const r = el.getBoundingClientRect(), rc = cible.getBoundingClientRect();
      const d = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const a = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
      const env = (t, x, y) => el.dispatchEvent(new PointerEvent(t, {
        pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true
      }));
      env('pointerdown', d.x, d.y);
      for (let j = 1; j <= 6; j++) env('pointermove', d.x + (a.x - d.x) * j / 6, d.y + (a.y - d.y) * j / 6);
      env('pointerup', a.x, a.y);
    }, i);
    await page.waitForTimeout(60);
  }
}

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 500 });
  await C.lancer(page, 'ranger');
  await page.waitForSelector('.carte-parade');

  // ---- Défilement libre hors geste ----
  const libre = await page.evaluate(async () => {
    window.scrollTo(0, 0); window.scrollBy(0, 200);
    await new Promise((r) => requestAnimationFrame(r));
    const y = window.scrollY; window.scrollTo(0, 0);
    return { y, max: document.documentElement.scrollHeight - window.innerHeight };
  });
  ok(libre.max === 0 || libre.y > 0, 'Hors geste : la page défile normalement', `${libre.y}/${libre.max} px`);

  // ---- Plusieurs échanges successifs, défilement figé pendant chacun ----
  await remplirALEnvers(page);
  let geles = 0, gestes = 0;
  for (const [s, c] of [[0, 2], [1, 0], [2, 1]]) {
    const r = await echanger(page, s, c);
    await page.waitForTimeout(80);
    if (r.miGeste) {
      gestes++;
      const bloque = r.miGeste.gele && r.miGeste.touchmoveAnnule &&
        r.miGeste.overflow === 'hidden' && r.miGeste.touchAction === 'none' &&
        r.miGeste.touchActionCarte === 'none';
      if (bloque) geles++;
      else console.log('  ✗ défilement non bloqué pendant l\'échange :', JSON.stringify(r.miGeste));
    }
    const e = await etat(page);
    if (e.gele) { echecs++; console.log('  ✗ gel non relâché après l\'échange'); }
    if (e.enLAir) { echecs++; console.log('  ✗ carte restée en l\'air'); }
  }
  ok(gestes >= 3 && geles === gestes,
    `${geles}/${gestes} échanges : page figée pendant le geste, libérée après`);

  // ---- Réponse FAUSSE : correction montrée, puis manche suivante ----
  let testeeFausse = 0, testeeJuste = 0;
  for (let manche = 0; manche < 8 && testeeFausse < 3; manche++) {
    if (await page.locator('.bloc-resultats').count()) break;
    await remplirALEnvers(page);
    const avant = await etat(page);
    const valider = await page.$('#zone-jeu .bouton-principal:not([hidden])');
    if (!valider) { console.log('  (Valider indisponible, manche ignorée)'); break; }
    await valider.click();
    await page.waitForTimeout(200);
    const juste = await etat(page);
    const estErreur = /feedback-erreur/.test(juste.feedback);
    if (estErreur) {
      testeeFausse++;
      ok(!juste.validerVisible,
        `Erreur ${testeeFausse} : le bouton Valider disparaît (pas de nouvel essai sur place)`);
      ok(juste.suivantVisible,
        `Erreur ${testeeFausse} : le bouton « Suivant » apparaît — la manche est validée`);
      ok(juste.slots.some((s) => s.incorrect),
        `Erreur ${testeeFausse} : les cases mal placées sont en ROUGE`,
        juste.slots.map((s) => (s.correct ? 'V' : s.incorrect ? 'R' : '-')).join(''));
      ok(/La bonne réponse/.test(juste.texteFeedback),
        `Erreur ${testeeFausse} : la bonne réponse est énoncée`, juste.texteFeedback.slice(0, 80));
      // Après la révélation : tout en vert, dans le bon ordre.
      await page.waitForTimeout(1000);
      const revele = await etat(page);
      const ordre = revele.slots.map((s) => s.valeur);
      const croissant = ordre.every((v, i) => i === 0 || ordre[i - 1] <= v);
      const decroissant = ordre.every((v, i) => i === 0 || ordre[i - 1] >= v);
      ok(revele.slots.every((s) => s.correct && !s.incorrect),
        `Erreur ${testeeFausse} : après révélation, toutes les cases sont VERTES`,
        revele.slots.map((s) => (s.correct ? 'V' : s.incorrect ? 'R' : '-')).join(''));
      ok(croissant || decroissant,
        `Erreur ${testeeFausse} : la solution affichée est bien rangée`, ordre.join(' – '));
      // On avance : la manche suivante doit être NEUVE (progression incrémentée).
      const av = juste.progression;
      await page.click('#bouton-suivant');
      await page.waitForTimeout(300);
      const apres = await etat(page);
      ok(apres.progression !== av,
        `Erreur ${testeeFausse} : « Suivant » mène à une nouvelle manche`, `${av} -> ${apres.progression}`);
    } else if (/feedback-succes/.test(juste.feedback)) {
      testeeJuste++;
      const s = await page.$('#bouton-suivant:not([hidden])');
      if (s) { await s.click(); await page.waitForTimeout(300); }
    }
  }
  ok(testeeFausse >= 3, `${testeeFausse} réponses fausses éprouvées`);

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 4));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
