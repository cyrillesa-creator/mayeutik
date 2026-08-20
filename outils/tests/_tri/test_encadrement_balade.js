const C = require('./m23_commun');

/* Point 1 : dans « En balade » (CP), l'encadrement de feedback (outline) posé
   sur la vignette choisie et sur la bonne réponse doit être ENTIÈREMENT visible
   — non rogné par le conteneur qui, portant `overflow-x:auto`, découpe aussi
   verticalement. */

const OUTLINE = 3, ECART = 2; // cf. --encadrement-trait / --encadrement-ecart

const inspecter = (page) => page.evaluate(() => {
  const marques = Array.from(document.querySelectorAll(
    '.arbre-col.correct, .arbre-col.incorrect, .brindille-btn.correct, .brindille-btn.incorrect, .clairiere-btn.correct, .clairiere-btn.incorrect'));
  if (!marques.length) return null;
  // Remonte jusqu'au premier ancêtre qui ROGNE (overflow != visible).
  const rogneur = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return p;
      p = p.parentElement;
    }
    return null;
  };
  return marques.map((m) => {
    const b = m.getBoundingClientRect();
    const cs = getComputedStyle(m);
    const trait = parseFloat(cs.outlineWidth) || 0;
    const ecart = parseFloat(cs.outlineOffset) || 0;
    const marge = trait + ecart;
    // Boîte réellement occupée par le contour.
    const contour = { l: b.left - marge, r: b.right + marge, t: b.top - marge, b: b.bottom + marge };
    const p = rogneur(m);
    if (!p) return { classe: m.className, trait, sansRogneur: true, deborde: null };
    const bp = p.getBoundingClientRect();
    const csp = getComputedStyle(p);
    const bord = (c) => parseFloat(c) || 0;
    const zone = {
      l: bp.left + bord(csp.borderLeftWidth), r: bp.right - bord(csp.borderRightWidth),
      t: bp.top + bord(csp.borderTopWidth), b: bp.bottom - bord(csp.borderBottomWidth)
    };
    return {
      classe: m.className.split(' ')[0] + (m.classList.contains('correct') ? '.correct' : '.incorrect'),
      trait,
      rogneur: p.className.split(' ')[0],
      // MARGE restante entre le contour et le bord rogneur, sur chaque côté :
      // négative = le contour dépasse et se fait couper.
      deborde: {
        gauche: +(contour.l - zone.l).toFixed(1), droite: +(zone.r - contour.r).toFixed(1),
        haut: +(contour.t - zone.t).toFixed(1), bas: +(zone.b - contour.b).toFixed(1)
      }
    };
  });
});

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, 'CP');
  let echecs = 0, testees = 0;
  const familles = new Set();

  for (let partie = 0; partie < 8; partie++) {
    await C.lancer(page, 'comparer-longueurs-cp');
    for (let manche = 0; manche < 6; manche++) {
      await page.waitForTimeout(150);
      // On choisit délibérément la PREMIÈRE vignette : souvent fausse, ce qui
      // fait apparaître les deux encadrements (rouge + vert).
      const cible = await page.$('.arbre-col:not([disabled]), .brindille-btn:not([disabled]), .clairiere-btn:not([disabled])');
      if (cible) {
        await cible.click().catch(() => {});
        await page.waitForTimeout(200);
        const marques = await inspecter(page);
        if (marques) {
          for (const m of marques) {
            testees++;
            familles.add(m.classe.split('.')[0] + ' dans ' + m.rogneur);
            if (m.trait < 1) { echecs++; console.log('  ✗ contour absent sur', m.classe); continue; }
            const d = m.deborde;
            if (!d) continue;
            const pires = Object.entries(d).filter(([, v]) => v < 0);
            if (pires.length) {
              echecs++;
              console.log(`  ✗ ${m.classe} rogné par .${m.rogneur} :`, JSON.stringify(Object.fromEntries(pires)));
            }
          }
        }
      } else {
        const opt = await page.$('.bouton-option:not([disabled])');
        if (opt) await opt.click().catch(() => {});
        const val = await page.$('.bouton-principal:visible:not([disabled])');
        if (val) await val.click().catch(() => {});
      }
      await page.waitForTimeout(120);
      const s = await page.$('#bouton-suivant:not([hidden])');
      if (s) { await s.click().catch(() => {}); await page.waitForTimeout(200); } else break;
    }
    await page.evaluate(() => { const b = document.getElementById('bouton-retour'); if (b) b.click(); });
    await page.waitForTimeout(200);
  }
  console.log(`  ${testees} encadrements mesurés, familles : ${Array.from(familles).join(' | ')}`);
  if (familles.size < 3) { echecs++; console.log('  ✗ les trois familles de vignettes n\'ont pas toutes été vues'); }
  if (erreurs.length) { echecs++; console.log('  ✗ erreurs :', erreurs.slice(0, 4)); }
  console.log(echecs === 0 ? 'ENCADREMENT EN BALADE : OK — jamais rogné' : `ENCADREMENT EN BALADE : ${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
