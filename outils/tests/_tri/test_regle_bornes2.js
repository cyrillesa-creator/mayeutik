const C = require('./m23_commun');

/* Nouveau contrat de la règle mobile (ajustement du point 6) :
   - elle PEUT déborder de la scène (mesurer un côté qui va jusqu'au bord) ;
   - il en reste TOUJOURS de quoi la reprendre au doigt (≥ 25 % de sa longueur,
     et jamais moins que ~56 px) dans les deux orientations ;
   - le bouton « Recentrer la règle » la ramène au départ. */

const PRISE_MIN = 56, PART_MIN = 0.25;

async function mesures(page, index) {
  return await page.evaluate((i) => {
    const r = document.querySelectorAll('.regle-mobile')[i];
    const s = r.offsetParent;
    const br = r.getBoundingClientRect(), bs = s.getBoundingClientRect();
    const visW = Math.max(0, Math.min(br.right, bs.right) - Math.max(br.left, bs.left));
    const visH = Math.max(0, Math.min(br.bottom, bs.bottom) - Math.max(br.top, bs.top));
    // « Attrapable » = il reste une SURFACE de prise, pas juste un point : on
    // échantillonne la partie visible et on mesure l'aire qui répond vraiment
    // à la règle (une autre règle posée dessus ne compte pas).
    const l = Math.max(br.left, bs.left), t = Math.max(br.top, bs.top);
    let touches = 0, total = 0;
    const N = 7;
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        const px = l + visW * (a + 0.5) / N, py = t + visH * (b + 0.5) / N;
        if (visW <= 0 || visH <= 0) continue;
        total++;
        const el = document.elementFromPoint(px, py);
        if (el && (el === r || r.contains(el))) touches++;
      }
    }
    const airePrise = total ? (touches / total) * visW * visH : 0;
    return {
      visW, visH, w: br.width, h: br.height, airePrise,
      deborde: br.left < bs.left - 0.5 || br.right > bs.right + 0.5 || br.top < bs.top - 0.5 || br.bottom > bs.bottom + 0.5,
      attrapable: airePrise >= 44 * 44   // au moins une cible tactile standard
    };
  }, index);
}

async function glisser(page, index, dx, dy) {
  const b = await page.evaluate((i) => {
    const r = document.querySelectorAll('.regle-mobile')[i];
    const s = r.offsetParent;
    const br = r.getBoundingClientRect(), bs = s.getBoundingClientRect();
    return {
      x: (Math.max(br.left, bs.left) + Math.min(br.right, bs.right)) / 2,
      y: (Math.max(br.top, bs.top) + Math.min(br.bottom, bs.bottom)) / 2
    };
  }, index);
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(b.x + dx * k / 8, b.y + dy * k / 8);
  await page.mouse.up();
}

async function pivoter90(page) {
  return await page.evaluate(() => {
    const r = document.querySelector('.regle-mobile');
    const b = r.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const env = (t, id, x, y) => r.dispatchEvent(new PointerEvent(t, {
      pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch'
    }));
    env('pointerdown', 1, cx - 40, cy); env('pointerdown', 2, cx + 40, cy);
    for (let a = 0; a <= 90; a += 10) {
      const rad = a * Math.PI / 180;
      env('pointermove', 1, cx - 40 * Math.cos(rad), cy - 40 * Math.sin(rad));
      env('pointermove', 2, cx + 40 * Math.cos(rad), cy + 40 * Math.sin(rad));
    }
    env('pointerup', 1, cx, cy - 40); env('pointerup', 2, cx, cy + 40);
  });
}

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, 'CE2');
  await C.lancer(page, 'perimetre-ce2');
  const trouve = await C.atteindreManche(page, '.regle-mobile', 60);
  if (!trouve) { console.log('✗ manche « règle mobile » introuvable'); await browser.close(); srv.close(); process.exit(1); }

  let echecs = 0, debordementsObserves = 0;
  const verifier = async (etiquette, index) => {
    const m = await mesures(page, index);
    const exigeW = Math.min(m.w, Math.max(m.w * PART_MIN, PRISE_MIN));
    const exigeH = Math.min(m.h, Math.max(m.h * PART_MIN, PRISE_MIN));
    // -1 px de tolérance : arrondis sous-pixel du navigateur.
    const assez = m.visW >= exigeW - 1 && m.visH >= exigeH - 1;
    if (!assez || !m.attrapable) {
      echecs++;
      console.log(`  ✗ ${etiquette} : visible ${m.visW.toFixed(0)}×${m.visH.toFixed(0)} px (exigé ${exigeW.toFixed(0)}×${exigeH.toFixed(0)}), aire de prise ${Math.round(m.airePrise)} px² (min 1936)`);
    }
    if (m.deborde) debordementsObserves++;
    return m;
  };

  const b0 = await mesures(page, 0);
  console.log(`règle ${b0.w.toFixed(0)}×${b0.h.toFixed(0)} px`);

  const pousseesH = [['gauche', -900, 0], ['droite', 900, 0], ['haut', 0, -900], ['bas', 0, 900],
                     ['coin haut-gauche', -900, -900], ['coin bas-droite', 900, 900]];
  for (const [nom, dx, dy] of pousseesH) { await glisser(page, 0, dx, dy); await verifier(`horizontale → ${nom}`, 0); }
  console.log(`  horizontale : ${debordementsObserves}/${pousseesH.length} poussées ont fait DÉBORDER la règle (comportement voulu)`);

  const avantPivot = debordementsObserves;
  await pivoter90(page); await page.waitForTimeout(200);
  const bv = await mesures(page, 0);
  if (bv.h <= bv.w) { echecs++; console.log('  ✗ le pivot à 90° n\'a pas eu lieu'); }
  else console.log(`  après pivot : VERTICALE (${bv.w.toFixed(0)}×${bv.h.toFixed(0)})`);

  for (const [nom, dx, dy] of [['gauche', -900, 0], ['droite', 900, 0], ['haut', 0, -900], ['bas', 0, 900],
                               ['coin haut-droite', 900, -900], ['coin bas-gauche', -900, 900]]) {
    await glisser(page, 0, dx, dy); await verifier(`verticale → ${nom}`, 0);
  }
  console.log(`  verticale : ${debordementsObserves - avantPivot}/6 poussées ont fait DÉBORDER la règle`);

  // Un débordement doit être RÉCUPÉRABLE : on repousse la règle vers le centre.
  await glisser(page, 0, -900, 0);
  const sortie = await mesures(page, 0);
  await glisser(page, 0, 400, 0);
  const revenue = await mesures(page, 0);
  if (!(revenue.visW > sortie.visW)) { echecs++; console.log('  ✗ règle sortie non récupérable au doigt', { sortie, revenue }); }
  else console.log('  ✓ une règle à moitié sortie se rattrape et revient au doigt');

  // Filet de sécurité : le bouton de recentrage.
  await glisser(page, 0, 900, 900);
  await page.click('.bouton-recentrer');
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => document.querySelector('.regle-mobile').style.transform);
  if (!/translate\(20px,\s*20px\)/.test(t) || !/rotate\(0deg\)/.test(t)) { echecs++; console.log('  ✗ recentrage :', t); }
  else console.log('  ✓ « Recentrer la règle » ramène la règle à plat en (20, 20)');

  // Mode « 2 règles ».
  await page.click('.bouton-secondaire:not(.bouton-recentrer)');
  await page.waitForTimeout(200);
  const n = await page.locator('.regle-mobile').count();
  if (n !== 2) { echecs++; console.log('  ✗ mode 2 règles : ' + n); }
  for (let i = 0; i < n; i++) {
    for (const [nom, dx, dy] of [['gauche', -900, 0], ['bas', 0, 900], ['droite', 900, 0], ['haut', 0, -900]]) {
      await glisser(page, i, dx, dy); await verifier(`2 règles #${i + 1} → ${nom}`, i);
    }
  }

  if (debordementsObserves === 0) { echecs++; console.log('  ✗ la règle n\'a JAMAIS débordé : la contrainte est restée trop stricte'); }
  if (erreurs.length) { echecs++; console.log('  ✗ erreurs :', erreurs.slice(0, 4)); }
  console.log(echecs === 0
    ? `RÈGLE MOBILE : OK — déborde quand il le faut (${debordementsObserves} fois), jamais insaisissable`
    : `RÈGLE MOBILE : ${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
