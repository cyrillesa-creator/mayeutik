const C = require('./m01_commun');
// « La parade des escargots » partage activerDrag : le gel du défilement et la
// nouvelle détection de dépôt (meilleure cible par recouvrement) ne doivent pas
// avoir cassé son rangement en cases voisines.
let echecs = 0;
const ok = (c, m, x) => { console.log((c?'OK   ':'✗    ')+m, x===undefined?'':x); if(!c) echecs++; };

const etat = (page) => page.evaluate(() => ({
  slotsRemplis: Array.from(document.querySelectorAll('.slot-rang')).filter(s => s.querySelector('.carte-parade')).length,
  enReserve: document.querySelectorAll('.reserve-drag .carte-parade').length,
  enLAir: Array.from(document.querySelectorAll('.carte-parade'))
    .filter(b => b.style.position === 'fixed' || b.classList.contains('en-glisse')).length,
  gele: document.documentElement.classList.contains('glisse-en-cours'),
  ordre: Array.from(document.querySelectorAll('.slot-rang')).map(s => {
    const c = s.querySelector('.carte-parade'); return c ? c.dataset.valeur : null;
  })
}));

async function glisserVersSlot(page, indexSlot) {
  return await page.evaluate((i) => {
    const el = document.querySelector('.carte-parade:not([data-slot]), .carte-parade[data-slot=""]');
    if (!el) return { erreur: 'plus de carte libre' };
    const slots = document.querySelectorAll('.slot-rang');
    const s = slots[i]; if (!s) return { erreur: 'slot introuvable' };
    const r = el.getBoundingClientRect(), rc = s.getBoundingClientRect();
    const d = { x: r.left + r.width/2, y: r.top + r.height/2 };
    const a = { x: rc.left + rc.width/2, y: rc.top + rc.height/2 };
    const env = (t,x,y) => el.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    env('pointerdown', d.x, d.y);
    for (let k = 1; k <= 8; k++) env('pointermove', d.x + (a.x-d.x)*k/8, d.y + (a.y-d.y)*k/8);
    env('pointerup', a.x, a.y);
    return { valeur: el.dataset.valeur };
  }, indexSlot);
}

(async () => {
  const srv = C.creerServeur(); await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await C.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await C.ouvrir(browser, port, { hauteur: 500 });
  await C.lancer(page, 'ranger');
  await page.waitForSelector('.carte-parade');
  const nbSlots = await page.locator('.slot-rang').count();
  console.log(`  ${nbSlots} cases à remplir`);

  let poses = 0;
  for (let i = 0; i < nbSlots; i++) {
    const avant = await etat(page);
    const r = await glisserVersSlot(page, i);
    await page.waitForTimeout(100);
    const apres = await etat(page);
    if (apres.slotsRemplis === avant.slotsRemplis + 1) poses++;
    else console.log(`  ✗ case ${i} : ${JSON.stringify(r)} — remplies ${avant.slotsRemplis} -> ${apres.slotsRemplis}`);
    if (apres.enLAir) { echecs++; console.log('  ✗ carte restée en l\'air'); }
    if (apres.gele) { echecs++; console.log('  ✗ défilement resté gelé'); }
  }
  ok(poses === nbSlots, `${poses}/${nbSlots} cartes déposées dans la bonne case`);
  const fin = await etat(page);
  ok(fin.ordre.every(v => v !== null), 'Toutes les cases sont occupées', fin.ordre);
  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 4));
  console.log(echecs === 0 ? 'PARADE : OK' : `PARADE : ${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
})();
