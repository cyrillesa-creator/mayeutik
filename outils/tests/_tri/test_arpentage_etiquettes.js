const C = require('./m23_commun');

(async () => {
  const srv = C.creerServeur(); await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, 'CE2');
  let echecs = 0;

  const inspecter = () => page.evaluate(() => {
    const svg = document.querySelector('.arpentage-scene svg');
    if (!svg) return null;
    const et = Array.from(svg.querySelectorAll('.arpentage-etiquette'));
    const boites = et.map((e) => { const b = e.getBBox(); return { t: e.textContent, x: b.x, y: b.y, w: b.width, h: b.height }; });
    let pires = [];
    for (let i = 0; i < boites.length; i++) {
      for (let j = i + 1; j < boites.length; j++) {
        const a = boites[i], b = boites[j];
        const chevauche = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        if (chevauche) pires.push([a.t, b.t]);
      }
    }
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const horsCadre = boites.filter((b) => b.x < vb[0] - 0.5 || b.y < vb[1] - 0.5 ||
      b.x + b.width > vb[0] + vb[2] + 0.5 || b.y + b.height > vb[1] + vb[3] + 0.5).map((b) => b.t);
    return { n: boites.length, chevauchements: pires, horsCadre, textes: boites.map((b) => b.t) };
  });

  // On rejoue la partie plusieurs fois pour balayer beaucoup de figures.
  let figuresVues = 0, manchesCloture = 0;
  for (let partie = 0; partie < 8; partie++) {
    await C.lancer(page, 'perimetre-calcul-ce2');
    for (let manche = 0; manche < 7; manche++) {
      await page.waitForTimeout(150);
      const info = await inspecter();
      if (info) {
        figuresVues++;
        if (info.chevauchements.length) {
          echecs++;
          console.log(`  ✗ étiquettes superposées : ${JSON.stringify(info.chevauchements)} (figure ${JSON.stringify(info.textes)})`);
        }
        if (info.horsCadre.length) {
          echecs++;
          console.log('  ✗ étiquette hors du cadre :', info.horsCadre);
        }
        // Problème de clôture : tout doit être en mètres.
        const txt = await page.evaluate(() => document.getElementById('zone-jeu').textContent);
        if (/clôture/i.test(txt)) {
          manchesCloture++;
          if (/\d+\s*cm/.test(txt)) { echecs++; console.log('  ✗ clôture encore en cm :', txt.match(/.{0,40}\d+\s*cm.{0,20}/)[0]); }
          if (!/\d+\s*m\b/.test(txt)) { echecs++; console.log('  ✗ clôture : aucune mesure en mètres'); }
        }
      }
      const pave = await page.$('.touche-pave');
      if (pave) { await pave.click().catch(() => {}); const v = await page.$('.touche-valider'); if (v) await v.click().catch(() => {}); }
      await page.waitForTimeout(120);
      const s = await page.$('#bouton-suivant:not([hidden])');
      if (s) { await s.click().catch(() => {}); await page.waitForTimeout(200); } else break;
    }
    await page.evaluate(() => { const b = document.getElementById('bouton-retour'); if (b) b.click(); });
    await page.waitForTimeout(200);
  }
  console.log(`  ${figuresVues} figures inspectées, dont ${manchesCloture} problèmes de clôture`);
  if (figuresVues < 20) { echecs++; console.log('  ✗ trop peu de figures balayées'); }
  if (manchesCloture === 0) { echecs++; console.log('  ✗ aucune manche « clôture » atteinte'); }
  if (erreurs.length) { echecs++; console.log('  ✗ erreurs :', erreurs.slice(0, 4)); }
  console.log(echecs === 0 ? 'ARPENTAGE : OK — aucune étiquette superposée, clôture en mètres' : `ARPENTAGE : ${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
})();
