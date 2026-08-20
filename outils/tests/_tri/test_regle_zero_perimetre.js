const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const SCRATCH = '/tmp/claude-0/-home-user-mayeutik/9c811c93-b040-5195-a545-ab2966a28f08/scratchpad';

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const p = u === '/diag' ? path.join(SCRATCH, 'M23_diag.html') : path.join('/home/user/mayeutik', u);
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : 'text/html' });
    r.end(d);
  });
});

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

/* Écart, en pixels d'écran, entre le trait « 0 » de la règle posée et
   l'origine réelle du segment déplié. L'origine se lit sur le DESSIN lui-même
   (x1 du premier côté : le point 0 ne bouge jamais pendant le dépliage), et le
   zéro sur la RÈGLE : aucune des deux valeurs n'est recalculée à la main. */
const mesurerEcart = (scope) => `(() => {
  const racine = ${scope};
  if (!racine) return null;
  const svg = racine.querySelector('svg');
  const regle = racine.querySelector('.regle-graduee');
  if (!svg || !regle) return null;
  const tick0 = regle.querySelector('.regle-tick');
  const seg0 = svg.querySelectorAll('line')[1];
  const xOrigine = svg.getBoundingClientRect().left + parseFloat(seg0.getAttribute('x1'));
  const xZero = tick0.getBoundingClientRect().left;
  const yOrigine = svg.getBoundingClientRect().top + parseFloat(seg0.getAttribute('y1'));
  return {
    ecart: Math.round((xZero - xOrigine) * 100) / 100,
    left: regle.style.left,
    /* La règle doit aussi rester ENTIÈREMENT visible dans la scène. */
    debordeGauche: Math.round(regle.getBoundingClientRect().left - racine.getBoundingClientRect().left),
    ySegment: Math.round(yOrigine),
    hautRegle: Math.round(regle.getBoundingClientRect().top)
  };
})()`;

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  // ---- 1. Le composant, sur les trois familles de figures ----
  await page.goto(`http://localhost:${port}/diag`);
  await page.waitForTimeout(300);
  {
    const res = await page.evaluate(async () => {
      const sortie = [];
      const bac = document.createElement('div');
      bac.style.cssText = 'position:absolute;left:0;top:0;width:390px';
      document.body.appendChild(bac);
      for (const type of ['rectangle', 'triangle', 'L']) {
        for (let essai = 0; essai < 10; essai++) {
          const fig = window.__figure([type]);
          const dep = window.__depliage(fig, window.__PX);
          bac.innerHTML = ''; bac.appendChild(dep.el);
          await new Promise((r) => dep.toutDeplier(r));
          await new Promise((r) => dep.poserRegleSurSegment(window.__CAP, r));
          await new Promise((r) => setTimeout(r, 60));
          const svg = dep.el.querySelector('svg');
          const regle = dep.el.querySelector('.regle-graduee');
          const tick0 = regle.querySelector('.regle-tick');
          const seg0 = svg.querySelectorAll('line')[1];
          const xOrigine = svg.getBoundingClientRect().left + parseFloat(seg0.getAttribute('x1'));
          const xZero = tick0.getBoundingClientRect().left;
          // Le bout du segment doit aussi tomber sur la graduation du périmètre.
          const perimetre = fig.cotes.reduce((a, c) => a + c, 0);
          const labels = Array.from(regle.querySelectorAll('.regle-label'));
          const labelFin = labels.find((l) => l.textContent === String(perimetre));
          const dernierSeg = svg.querySelectorAll('line')[svg.querySelectorAll('line').length - 1];
          const xFin = svg.getBoundingClientRect().left + parseFloat(dernierSeg.getAttribute('x2'));
          sortie.push({
            type, cotes: fig.cotes.join('+'), perimetre,
            ecart: Math.round((xZero - xOrigine) * 100) / 100,
            ecartFin: labelFin ? Math.round((labelFin.getBoundingClientRect().left + labelFin.getBoundingClientRect().width / 2 - xFin) * 100) / 100 : null,
            left: parseFloat(regle.style.left)
          });
        }
      }
      bac.remove();
      return sortie;
    });

    const ecarts = res.map((r) => Math.abs(r.ecart));
    ok(Math.max(...ecarts) < 0.5,
      `Le « 0 » coïncide avec l'origine sur ${res.length} figures (11 px d'écart avant correction)`,
      `écart max ${Math.max(...ecarts)} px`);
    ['rectangle', 'triangle', 'L'].forEach((t) => {
      const sous = res.filter((r) => r.type === t);
      ok(sous.every((r) => Math.abs(r.ecart) < 0.5),
        `  · ${t} : ${sous.length} figures alignées`,
        `périmètres ${[...new Set(sous.map((r) => r.perimetre))].sort().join(', ')} cm`);
    });
    ok(res.every((r) => r.left >= 0),
      'Aucune règle n\'est calée de force à gauche (le rognage à left:0 était la cause)',
      `left min ${Math.min(...res.map((r) => r.left))} px`);

    // L'alignement du zéro ne servirait à rien si l'échelle ne suivait pas :
    // le bout du segment doit tomber sur la graduation du périmètre.
    const fins = res.filter((r) => r.ecartFin !== null).map((r) => Math.abs(r.ecartFin));
    ok(fins.length > 0 && Math.max(...fins) < 2,
      'Le bout du segment tombe sur la graduation du périmètre (même échelle 22 px/cm)',
      `écart max ${Math.max(...fins)} px sur ${fins.length} figures`);

    // Périmètres variés : la correction ne dépend pas d'une longueur.
    ok(new Set(res.map((r) => r.perimetre)).size >= 2,
      'Vérifié sur plusieurs périmètres différents',
      [...new Set(res.map((r) => r.perimetre))].sort((a, b) => a - b).join(', ') + ' cm');
  }

  // ---- 2. Dans le VRAI mini-jeu, palier CE2 ----
  {
    await page.goto(`http://localhost:${port}/jeux/M23-longueurs.html?palier=ce2`);
    await page.evaluate(() => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CE2' }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    });
    await page.goto(`http://localhost:${port}/jeux/M23-longueurs.html?palier=ce2`);
    await page.waitForSelector('#grille-jeux');
    await page.evaluate(() => document.querySelector('[data-jeu="perimetre-ce2"]').click());
    await page.waitForTimeout(400);

    const mesures = [];
    /* Le mini-jeu alterne trois étapes : comparaison au compas (reporter tous
       les côtés avant de pouvoir répondre), dépliage — la seule qui pose la
       règle, tantôt tout seul (démonstration) tantôt côté par côté — et mesure
       à la règle mobile. On joue chaque étape avec ses propres gestes. */
    for (let manche = 1; manche <= 7; manche++) {
      /* Compas : reporter chaque côté. Les zones RESTENT dans le DOM une fois
         reportées, et un report en cours en bloque un autre — on parcourt donc
         tous les indices, en laissant chaque animation se finir, jusqu'à ce que
         le QCM s'ouvre. */
      if (await page.$('.compas-cote-zone')) {
        for (let passe = 0; passe < 6; passe++) {
          if (await page.$('#zone-jeu .bouton-option')) break;
          const n = await page.evaluate(() => document.querySelectorAll('.compas-cote-zone').length);
          for (let k = 0; k < n; k++) {
            await page.evaluate((i) => {
              const z = document.querySelectorAll('.compas-cote-zone')[i];
              if (z) z.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }, k);
            await page.waitForTimeout(950);
          }
        }
      }
      // Dépliage : la démonstration se déroule seule, le dépliage actif
      // demande un clic par charnière. On attend la pose de la règle en
      // cliquant tout bouton de dépliage qui se présente.
      for (let garde = 0; garde < 30; garde++) {
        if (await page.$('.cartographie-regle-posee')) break;
        if (!(await page.$('.cartographie-scene'))) break;
        const btns = await page.$$('#zone-jeu .bouton-principal:not([disabled]), #zone-jeu .bouton-secondaire:not([disabled])');
        for (const btn of btns) {
          const t = ((await btn.textContent()) || '').trim();
          if (/déplier|déplie|côté|contour/i.test(t)) { await btn.click(); break; }
        }
        await page.waitForTimeout(400);
      }
      /* La règle ARRIVE en glissant (translation de 0,8 s) : mesurer pendant
         le vol donnerait la position de vol. On attend que le transform soit
         retombé à zéro avant de relever quoi que ce soit. */
      if (await page.$('.cartographie-regle-posee')) {
        await page.waitForFunction(() => {
          const r = document.querySelector('.cartographie-regle-posee');
          if (!r) return false;
          const t = getComputedStyle(r).transform;
          return t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t);
        }, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(150);
      }
      const m = await page.evaluate(mesurerEcart("document.querySelector('.cartographie-scene')"));
      if (m) mesures.push(Object.assign({ manche }, m));

      // Sortir de la manche : QCM si présent, sinon bouton de validation.
      for (let garde = 0; garde < 6; garde++) {
        if (await page.$('#bouton-suivant:not([hidden])')) break;
        const opt = await page.$('#zone-jeu .bouton-option:not([disabled])');
        if (opt) { await opt.click(); await page.waitForTimeout(350); continue; }
        const val = await page.$('#zone-jeu .bouton-principal:not([disabled])');
        if (val) { await val.click(); await page.waitForTimeout(350); continue; }
        break;
      }
      const suivant = await page.$('#bouton-suivant:not([hidden])');
      if (!suivant) break;
      await suivant.click();
      await page.waitForTimeout(600);
    }

    ok(mesures.length >= 1, 'La règle se pose bien sur plusieurs manches du vrai mini-jeu', `${mesures.length} manches mesurées`);
    const pires = mesures.map((m) => Math.abs(m.ecart));
    ok(pires.length > 0 && Math.max(...pires) < 0.5,
      'En jeu réel : le « 0 » coïncide avec l\'origine du segment',
      mesures.map((m) => `manche ${m.manche} : ${m.ecart} px`).join(' · '));
    ok(mesures.every((m) => m.debordeGauche >= 0),
      'La règle reste entièrement dans la scène (pas de rognage à gauche)',
      mesures.map((m) => m.debordeGauche).join(' '));
    ok(mesures.every((m) => m.hautRegle <= m.ySegment && m.ySegment <= m.hautRegle + 100),
      'Le segment passe bien dans le corps de la règle',
      mesures.map((m) => `${m.ySegment}-${m.hautRegle}`).join(' '));
  }

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 5));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
