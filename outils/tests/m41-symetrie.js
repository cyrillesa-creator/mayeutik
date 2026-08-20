const http = require('http'), fs = require('fs'), path = require('path');
const socle = require('./socle.js');
const { chromium } = socle.chargerPlaywright();
const RACINE = socle.RACINE, JEU = '/jeux/M41-symetrie.html';
let ok = 0, ko = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('OK   ' + n, d === undefined ? '' : d); }
  else { ko++; console.log('KO   ' + n, d === undefined ? '' : d); } };
const srv = http.createServer((q, r) => {
  const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); r.end(d); });
});
(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port, base = `http://localhost:${port}${JEU}`;
  const nav = await chromium.launch({executablePath:socle.EXEC_CHROMIUM});
  const page = await nav.newPage({viewport:{width:390, height:844}});
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push('console: ' + m.text()); });
  page.on('request', r => { const u = r.url();
    if (!u.startsWith(`http://localhost:${port}`) && !u.startsWith('data:')) erreurs.push('réseau: ' + u); });

  const brut = fs.readFileSync(RACINE + JEU, 'utf8');
  T('aucune URL externe', !/(src|href)\s*=\s*["']https?:/i.test(brut));
  T('aucun fetch/XHR/import distant', !/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(brut));
  T('§7 modale de confirmation présente', /id="modale-menu"/.test(brut));
  T('§4 conteneur à confettis présent', /id="confettis-conteneur"/.test(brut));
  T('§19 touch-action pan-y universel', /\*\s*\{[^}]*touch-action:\s*pan-y/.test(brut.replace(/\n/g,' ')));
  T('§19 la zone de tracé neutralise le touch, enfants compris',
    /#grille,\s*#grille\s*\*\s*\{[^}]*touch-action:\s*none/.test(brut.replace(/\n/g,' ')));
  T('appui long : menu contextuel et sélection iOS neutralisés',
    /-webkit-touch-callout:\s*none/.test(brut) && /user-select:\s*none/.test(brut));
  T('typographie : aucune apostrophe droite dans un mot', !/[a-zà-ÿA-ZÀ-Ÿ]'[a-zà-ÿ]/.test(brut));
  T('la rosace de M34 n’est PAS recopiée ici', !/construireRosace|rosace/i.test(brut));

  // ---------- Lancement + géométrie à l’écran ----------
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(400);
  const geo = await page.evaluate(() => {
    const svg = document.getElementById('grille');
    const r = svg.getBoundingClientRect();
    /* La maille se mesure sur la viewBox RÉELLE : depuis que la vue déborde
       du quadrillage, diviser la largeur par 8 surestimait la cellule. */
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    return {jeu:!document.getElementById('game').hidden, maille:r.width / vb[2],
            defile: document.documentElement.scrollHeight > window.innerHeight + 2,
            manches:file.length, total};
  });
  T('§16 le lancement paramétré ouvre le mini-jeu', geo.jeu);
  T('six manches, total = 2 × manches (§11)', geo.manches === 6 && geo.total === 12, geo.total);
  T('la maille dépasse 35 px sur un écran de 390 pt', geo.maille > 35, geo.maille.toFixed(1) + ' px');
  /* Les segments du BORD doivent être atteignables : sans marge intérieure
     ils tombent sur l’arête de la surface tactile, et la figure qui en porte
     un devient impossible à finir. */
  const marge = await page.evaluate(() => {
    const svg = document.getElementById('grille');
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const r = svg.getBoundingClientRect();
    const parMaille = r.width / vb[2];
    return {gauche:(0 - vb[0]) * parMaille, haut:(0 - vb[1]) * parMaille,
            droite:(vb[0] + vb[2] - 8) * parMaille, bas:(vb[1] + vb[3] - 10) * parMaille};
  });
  T('le plan déborde du quadrillage de tous les côtés (bords atteignables)',
    Math.min(marge.gauche, marge.haut, marge.droite, marge.bas) > 8,
    JSON.stringify(Object.fromEntries(Object.entries(marge).map(([k,v]) => [k, +v.toFixed(1)]))));
  T('la page ne défile pas sur iPhone', !geo.defile);

  /* --------- Le geste : on TAPE le milieu d’un segment, au vrai pointeur --------- */
  const versEcran = (k) => page.evaluate((kk) => {
    const [a, b] = kk.split('|').map(s => s.split(',').map(Number));
    const svg = document.getElementById('grille'), m = svg.getScreenCTM();
    /* On tape à 30 % du segment, PAS à son milieu : le milieu d’une diagonale
       est le centre de la cellule, à distance nulle des DEUX diagonales — un
       point volontairement ambigu, qui ne dit rien de ce que vise le doigt. */
    const p = svg.createSVGPoint();
    p.x = a[0] + (b[0]-a[0])*0.3; p.y = a[1] + (b[1]-a[1])*0.3;
    const q = p.matrixTransform(m);
    return [q.x, q.y];
  }, k);
  const taper = async (k) => { const [x,y] = await versEcran(k);
    await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(12); };

  const aTracer = await page.evaluate(() => [...file[pos].aTracer]);
  T('la manche de report laisse une moitié entière à tracer', aTracer.length > 5, aTracer.length);

  /* Un segment en trop qui ROMPT LA SYMÉTRIE empêche la complétion — c’est
     à cela que sert la gomme. (Un trait en trop dont le miroir est tracé
     aussi, lui, ne gêne pas : voir plus bas.) On choisit donc un intrus
     dont le miroir n’est pas dessiné. */
  const intrus = await page.evaluate(() => {
    const q = file[pos];
    return SEGMENTS.find(k => {
      const m = reflechirSeg(k, q.fig.axe);
      return m !== k && !q.cible.has(k) && !q.pre.has(k) && !q.cible.has(m);
    });
  });
  await taper(intrus);
  for (const k of aTracer) await taper(k);
  let etat = await page.evaluate(() => ({fini:mancheFinie, traces:traces.size, attendus:file[pos].aTracer.size}));
  T('un segment en trop qui rompt la symétrie EMPÊCHE la complétion', !etat.fini, etat);

  await page.evaluate(() => { outil = 'gomme'; });
  await taper(intrus);
  await page.waitForTimeout(150);
  etat = await page.evaluate(() => ({fini:mancheFinie, gommages, ok:file[pos]._ok,
    suivant:document.getElementById('btnNext').style.display}));
  T('gommer le segment en trop achève la figure', etat.fini && etat.ok === true, etat);
  T('le gommage est compté', etat.gommages === 1, etat.gommages);
  T('la complétion fait apparaître « Suivant » (pas de bouton Valider)',
    etat.suivant === 'block' && !/id="btnValider"/.test(brut));

  /* --------- LE GESTE CENTRAL : un glissement continu trace la suite --------- */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  const versPt = (x, y) => page.evaluate(([px, py]) => {
    const svg = document.getElementById('grille'), m = svg.getScreenCTM();
    const p = svg.createSVGPoint(); p.x = px; p.y = py;
    const q = p.matrixTransform(m);
    return [q.x, q.y];
  }, [x, y]);
  /* On balaie une colonne du quadrillage sur trois mailles, au doigt. */
  const d0 = await versPt(6, 1), d1 = await versPt(6, 4);
  await page.mouse.move(d0[0], d0[1]);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++)
    await page.mouse.move(d0[0] + (d1[0]-d0[0])*i/24, d0[1] + (d1[1]-d0[1])*i/24);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const balayage = await page.evaluate(() => [...traces.keys()].sort());
  T('un glissement trace TOUTE la suite de segments parcourue',
    ['6,1|6,2','6,2|6,3','6,3|6,4'].every(k => balayage.includes(k)), balayage.join(' '));
  T('et rien qui soit loin du doigt',
    balayage.every(k => /^6,\d+\|6,\d+$/.test(k)), balayage.join(' '));

  /* LE GESTE RÉEL : un doigt d’enfant ne suit pas la ligne au pixel, il
     VAGABONDE autour. La première version ramassait alors toutes les
     diagonales des cellules traversées — constaté à l’appareil : le trait
     voulu arrivait noyé sous une résille de croix. On rejoue ce geste. */
  await page.evaluate(() => { traces = new Map(); rendrePlan(); });
  /* Le chemin passe du côté VIDE de l’axe : sur la moitié pré-remplie,
     `appliquer` refuse à juste titre de redessiner ce qui est déjà là, et le
     test mesurerait ce refus au lieu du geste. */
  const chemin = [[5,2],[5,3],[5,4],[6,4],[7,4]];      // un L, en nœuds
  let pts = [];
  for (let i = 0; i + 1 < chemin.length; i++) {
    for (let t = 0; t < 1; t += 0.1) {
      const x = chemin[i][0] + (chemin[i+1][0]-chemin[i][0])*t;
      const y = chemin[i][1] + (chemin[i+1][1]-chemin[i][1])*t;
      /* Le tremblement : ±0.28 maille, soit une dizaine de pixels — un doigt
         posé à plat fait cela sans y penser. */
      pts.push([x + (t*7 % 1 - 0.5)*0.56, y + (t*11 % 1 - 0.5)*0.56]);
    }
  }
  pts.push(chemin[chemin.length-1]);
  const ecran = [];
  for (const q of pts) ecran.push(await versPt(q[0], q[1]));
  await page.mouse.move(ecran[0][0], ecran[0][1]);
  await page.mouse.down();
  for (const e of ecran.slice(1)) await page.mouse.move(e[0], e[1]);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const vagabond = await page.evaluate(() => [...traces.keys()].sort());
  const attendus = ['5,2|5,3','5,3|5,4','5,4|6,4','6,4|7,4'];
  T('un doigt qui tremble trace le trait suivi, et RIEN d’autre',
    attendus.every(k => vagabond.includes(k)) && vagabond.length === attendus.length,
    vagabond.join(' '));
  T('aucune diagonale ramassée en traversant les cellules',
    !vagabond.some(k => { const [a,b] = k.split('|').map(s => s.split(',').map(Number));
      return a[0] !== b[0] && a[1] !== b[1]; }), vagabond.join(' '));

  /* Un glissement en DIAGONALE doit tracer la diagonale suivie, pas sa jumelle. */
  await page.evaluate(() => { traces = new Map(); rendrePlan(); });
  const g0 = await versPt(1, 1), g1 = await versPt(3, 3);
  await page.mouse.move(g0[0], g0[1]);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++)
    await page.mouse.move(g0[0] + (g1[0]-g0[0])*i/20, g0[1] + (g1[1]-g0[1])*i/20);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const diag = await page.evaluate(() => [...traces.keys()].sort());
  T('un glissement en diagonale suit LA diagonale parcourue, pas sa jumelle',
    diag.includes('1,1|2,2') && diag.includes('2,2|3,3')
    && !diag.includes('1,2|2,1') && !diag.includes('2,3|3,2'), diag.join(' '));

  /* --------- La couleur ne porte aucun sens ---------
     Bloc AUTONOME : chaque bloc repart d’une partie neuve, sinon l’état
     laissé par le précédent décide de son résultat. */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  const aTracer2 = await page.evaluate(() => [...file[pos].aTracer]);
  for (let i = 0; i < aTracer2.length; i++) {
    await page.evaluate((c) => { outil = 'feutre'; couleur = c; }, ['#2F6FED','#E5399B','#12A150'][i % 3]);
    await taper(aTracer2[i]);
  }
  const bigarre = await page.evaluate(() => ({fini:mancheFinie, couleurs:[...new Set([...traces.values()])].length}));
  T('une figure tracée en plusieurs couleurs se complète quand même',
    bigarre.fini === true && bigarre.couleurs > 1, bigarre);

  /* --------- RIEN D’UN MINI-JEU NE RESTE SUR L’AUTRE ---------
     Les deux partagent l’écran de jeu ; ce qui appartient à l’un doit
     disparaître avec lui. On enchaîne les deux dans les deux sens et l’on
     relève ce qui est réellement affiché — c’est ainsi que la barre du jeu
     des axes s’est retrouvée posée sur le quadrillage. */
  const attendu = {
    'ce2-symetrie-reconnaitre': {scene:true, actions1:true, plan:false, outils:false, palette:false},
    'ce2-symetrie-completer':   {scene:false, actions1:false, plan:true, outils:true, palette:false}
  };
  const releve = () => page.evaluate(() => {
    const vis = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
    return {jeu:miniJeuCourant.id, scene:vis('scene'), actions1:vis('actions1'),
            plan:vis('plan'), outils:vis('outils'), palette:vis('palette'),
            restes:[...document.querySelectorAll('#actions1 button')].map(b => b.textContent)};
  });
  await page.goto(base + '?competence=ce2-symetrie-reconnaitre');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  const enchainement = [await releve()];
  for (const id of ['ce2-symetrie-completer', 'ce2-symetrie-reconnaitre', 'ce2-symetrie-completer']) {
    await page.evaluate((j) => { retourAccueil(); lance(j); desarmerAutoSuivant(); }, id);
    await page.waitForTimeout(120);
    enchainement.push(await releve());
  }
  const fautifs = enchainement.filter(e =>
    Object.keys(attendu[e.jeu]).some(k => e[k] !== attendu[e.jeu][k]));
  T('en passant d’un mini-jeu à l’autre, rien de l’autre ne reste affiché',
    fautifs.length === 0,
    fautifs.length ? JSON.stringify(fautifs[0]) : enchainement.length + ' enchaînements');
  T('et la barre du jeu des axes ne survit pas au quadrillage',
    enchainement.filter(e => e.jeu === 'ce2-symetrie-completer').every(e => e.restes.length === 0),
    JSON.stringify(enchainement.map(e => e.jeu.slice(4, 12) + ':' + e.restes.length)));

  /* --------- L’ORDRE DES DEUX MINI-JEUX ---------
     On reconnaît un axe avant d’avoir à s’en servir pour compléter : c’est
     l’ordre du programme, et c’est celui de l’écran d’accueil du module. */
  await page.goto(base);
  await page.waitForTimeout(300);
  const ordre = await page.evaluate(() => ({
    cartes:[...document.querySelectorAll('#grille-jeux .nom')].map(e => e.textContent),
    ids:CONTENU.miniJeux.map(m => m.id)
  }));
  T('l’accueil présente « Symboles miroirs » en premier',
    ordre.cartes[0] === 'Symboles miroirs' && ordre.cartes[1] === 'Le monde à moitié effacé',
    ordre.cartes.join(' puis '));
  T('et le rang d’affichage suit l’ordre déclaré',
    ordre.ids[0] === 'ce2-symetrie-reconnaitre', ordre.ids.join(', '));

  /* --------- CE QUI ACHÈVE LA FIGURE : LA SYMÉTRIE ---------
     Non la conformité à un modèle que l’enfant n’a jamais vu. Des traits en
     plus sont donc recevables tant qu’ils viennent par paires miroirs. */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  const enPlus = await page.evaluate(() => {
    const q = file[pos];
    desarmerAutoSuivant();
    /* Une paire miroir LIBRE, hors de la figure attendue. */
    let paire = null;
    for (const k of SEGMENTS) {
      const m = reflechirSeg(k, q.fig.axe);
      if (m !== k && !q.cible.has(k) && !q.cible.has(m) && !q.pre.has(k) && !q.pre.has(m)) { paire = [k, m]; break; }
    }
    const res = {paire};
    traces.set(paire[0], '#2F6FED');           // un seul des deux : asymétrique
    q.aTracer.forEach(k => traces.set(k, '#2F6FED'));
    res.avecUnSeul = verifierComplete();
    traces.set(paire[1], '#2F6FED');           // la paire complète : symétrique
    res.avecLaPaire = verifierComplete();
    return res;
  });
  T('un trait en plus, seul de son côté, n’achève pas la figure',
    enPlus.avecUnSeul === false, enPlus.paire && enPlus.paire[0]);
  T('mais des traits en plus SYMÉTRIQUES l’achèvent', enPlus.avecLaPaire === true);

  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  const manquant = await page.evaluate(() => {
    const q = file[pos];
    desarmerAutoSuivant();
    const tout = [...q.aTracer];
    tout.slice(1).forEach(k => traces.set(k, '#2F6FED'));
    const sansUn = verifierComplete();
    traces.set(tout[0], '#2F6FED');
    return {sansUn, complet:verifierComplete()};
  });
  T('il manque un trait : la figure n’est pas achevée', manquant.sansUn === false);
  T('le dernier trait posé, elle l’est', manquant.complet === true);

  /* LE CAS DU POISSON, RELEVÉ À L’ESSAI. Un enfant a prolongé le trait de
     l’œil d’un bord à l’autre de la figure au lieu de s’arrêter à sa moitié.
     Cela ajoute deux segments hors du modèle — mais qui se répondent de part
     et d’autre de l’axe : la figure reste symétrique, donc elle est achevée.
     Le même trait posé d’un seul côté, lui, ne l’achève pas. */
  const poisson = await page.evaluate(() => {
    desarmerAutoSuivant();
    file[0] = construireManche(FIGURES.find(f => f.nom === 'le poisson'), 'report');
    pos = 0; manche(); desarmerAutoSuivant();
    const q = file[0];
    const haut = cle([3,4],[3,5]), bas = cle([3,5],[3,6]);
    const res = {horsModele: !q.cible.has(haut) && !q.cible.has(bas),
                 miroirs: reflechirSeg(haut, q.fig.axe) === bas};
    [...q.aTracer].forEach(k => traces.set(k, '#2F6FED'));
    traces.set(haut, '#2F6FED');
    res.dUnSeulCote = verifierComplete();
    traces.set(bas, '#2F6FED');
    res.desDeuxCotes = verifierComplete();
    return res;
  });
  T('le trait de l’œil prolongé sort bien du modèle',
    poisson.horsModele && poisson.miroirs, JSON.stringify(poisson));
  T('prolongé d’un seul côté de l’axe : la figure n’est pas achevée',
    poisson.dUnSeulCote === false);
  T('prolongé des deux côtés : elle l’est', poisson.desDeuxCotes === true);

  /* LE MINIMUM EST UNE EXIGENCE À PART ENTIÈRE. Sur une manche fabriquée à
     la main où une paire miroir ENTIÈRE manque, le dessin reste symétrique
     tout en étant incomplet — et doit être refusé. */
  const paireEntiere = await page.evaluate(() => {
    const q = file[pos];
    desarmerAutoSuivant();
    let paire = null;
    for (const k of q.cible) {
      const m = reflechirSeg(k, q.fig.axe);
      if (m !== k && q.cible.has(m)) { paire = [k, m]; break; }
    }
    q.pre = new Set([...q.cible].filter(k => k !== paire[0] && k !== paire[1]));
    q.aTracer = new Set(paire);
    traces = new Map();
    const symetriqueMaisIncomplet = verifierComplete();
    paire.forEach(k => traces.set(k, '#2F6FED'));
    return {symetriqueMaisIncomplet, complet:verifierComplete()};
  });
  T('une paire miroir entière qui manque : symétrique, mais refusé',
    paireEntiere.symetriqueMaisIncomplet === false);
  T('les deux posés, la figure est achevée', paireEntiere.complet === true);

  /* Et l’on vérifie le raisonnement qui autorise à énoncer les deux règles :
     la fabrication n’efface jamais une paire des DEUX côtés. */
  const jamaisLesDeux = await page.evaluate(() => {
    let mauvais = 0;
    for (let n = 0; n < 60; n++)
      engendrerFile(jeu('ce2-symetrie-completer')).forEach(m => {
        m.aTracer.forEach(k => {
          const j = reflechirSeg(k, m.fig.axe);
          if (j !== k && m.aTracer.has(j)) mauvais++;
        });
      });
    return mauvais;
  });
  T('aucune paire miroir n’est effacée des deux côtés à la fabrication',
    jamaisLesDeux === 0, jamaisLesDeux);

  /* --------- LA GOMME FROTTE ---------
     L’enfant ne repasse pas le trait pour l’effacer : il raye en travers. */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  const gomme = await page.evaluate(() => {
    desarmerAutoSuivant();
    /* Figure IMPOSÉE : la mesure porte sur ce que la gomme emporte autour
       d’elle, et cela dépend du dessin. Laissée au tirage, l’assertion
       tenait ou non selon la figure servie — un contrôle qui change d’avis
       ne contrôle rien. */
    file[pos] = construireManche(FIGURES.find(f => f.nom === 'la maison'), 'report');
    manche(); desarmerAutoSuivant();
    const q = file[pos];
    /* On trace tout, puis on choisit un segment HORIZONTAL à rayer, et l’on
       regarde ce qui, plus loin d’une maille, doit survivre. */
    q.aTracer.forEach(k => traces.set(k, '#2F6FED'));
    const horizontaux = [...q.aTracer].filter(k => {
      const [a, b] = bouts(k);
      return a[1] === b[1] && Math.abs(a[0]-b[0]) === 1;
    });
    if (!horizontaux.length) return {impossible:true};
    const vise = horizontaux[0];
    const [a, b] = bouts(vise);
    const mid = [(a[0]+b[0])/2, a[1]];
    /* Ce qui doit survivre : TOUT trait resté à plus d’une maille de la
       rayure. Chercher un unique voisin laissait passer les figures qui
       n’en avaient pas, et l’assertion ne disait alors rien. */
    const loin = [...q.aTracer].filter(k => {
      if (k === vise) return false;
      const [c, d] = bouts(k);
      return Math.min(distanceAuSegment([mid[0], mid[1]-0.35], c, d),
                      distanceAuSegment([mid[0], mid[1]+0.35], c, d),
                      distanceAuSegment(mid, c, d)) > 1;
    });
    const svg = document.getElementById('grille');
    const env = (t, p) => { const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = p[1]; const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(t, {clientX:e.x, clientY:e.y, pointerId:11, bubbles:true})); };
    outil = 'gomme';
    /* Une rayure PERPENDICULAIRE, courte, qui ne repasse jamais le trait. */
    env('pointerdown', [mid[0], mid[1] - 0.35]);
    for (let i = 1; i <= 8; i++) env('pointermove', [mid[0], mid[1] - 0.35 + 0.7*i/8]);
    env('pointerup', [mid[0], mid[1] + 0.35]);
    const avant = q.aTracer.size;
    const apres = {efface: !traces.has(vise), total:avant,
                   emportes: avant - [...q.aTracer].filter(k => traces.has(k)).length,
                   loin: loin.length, loinPerdus: loin.filter(k => !traces.has(k)).length};
    /* Le pré-rempli ne s’efface pas, même frotté. */
    const kPre = [...q.pre][0];
    const [pa, pb] = bouts(kPre);
    const pm = [(pa[0]+pb[0])/2, (pa[1]+pb[1])/2];
    env('pointerdown', [pm[0]-0.3, pm[1]-0.3]);
    for (let i = 1; i <= 8; i++) env('pointermove', [pm[0]-0.3+0.6*i/8, pm[1]-0.3+0.6*i/8]);
    env('pointerup', [pm[0]+0.3, pm[1]+0.3]);
    outil = 'feutre';
    return Object.assign(apres, {preTouche: !file[pos].pre.has(kPre)});
  });
  T('une rayure en travers efface le trait qu’elle croise', gomme.efface === true, gomme);
  T('et laisse en place tout ce qui est à plus d’une maille',
    gomme.loin >= 4 && gomme.loinPerdus === 0,
    gomme.loin + ' traits éloignés, ' + gomme.loinPerdus + ' emportés');
  /* UNE RAYURE COURTE NE BALAIE PAS LA FIGURE. La gomme touche ce qu’elle
     croise — le trait visé, et au plus ce que le doigt traverse dans les
     deux cellules voisines. Au-delà, ce n’est plus gommer, c’est effacer. */
  T('une rayure courte n’emporte pas la figure',
    gomme.emportes <= 3, gomme.emportes + ' traits emportés sur ' + gomme.total);
  T('la gomme ne mord pas sur le pré-rempli', gomme.preTouche === false);

  /* --------- La sortie de manche --------- */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  const avant = await page.evaluate(() => ({bouton:!document.getElementById('btnPasser').hidden,
    manque:file[pos].aTracer.size}));
  await page.click('#btnPasser');
  await page.waitForTimeout(150);
  await page.evaluate(() => desarmerAutoSuivant());
  const apres = await page.evaluate(() => ({fini:mancheFinie, ok:file[pos]._ok, montres:traces.size}));
  T('une sortie de manche existe', avant.bouton === true);
  T('passer clôt la manche sans la compter juste', apres.fini && apres.ok === false, apres);
  T('§18 : passer montre ce qu’il fallait tracer', apres.montres === avant.manque, apres);

  /* --------- Le calque du rabat a la boîte du plan ---------
     Même `viewBox` des deux côtés : ils ne se superposent que si leur BOÎTE
     est identique. Sinon la vue s’y recentre et tout le dessin glisse. */
  const boites = [];
  for (const large of [390, 360, 430]) {
    await page.setViewportSize({width:large, height:844});
    await page.goto(base + '?competence=ce2-symetrie-completer');
    await page.waitForTimeout(300);
    await page.evaluate(() => desarmerAutoSuivant());
    boites.push(await page.evaluate((w) => {
      const r = document.getElementById('rabat');
      r.style.display = 'block';
      const a2 = document.getElementById('grille').getBoundingClientRect();
      const b2 = r.getBoundingClientRect();
      r.style.display = '';
      return {w, ecart:+Math.max(Math.abs(a2.x-b2.x), Math.abs(a2.y-b2.y),
        Math.abs(a2.width-b2.width), Math.abs(a2.height-b2.height)).toFixed(2)};
    }, large));
  }
  await page.setViewportSize({width:390, height:844});
  T('le calque du rabat a exactement la boîte du plan, à toute largeur',
    boites.every(b => b.ecart < 0.01), boites.map(b => b.w + 'px (' + b.ecart + ')').join(', '));

  /* --------- L’axe est une DROITE, et LA MOITIÉ SE RABAT dessus --------- */
  const axeEtPli = await page.evaluate(async () => {
    const res = [];
    for (const orient of ['v','h']) {
      /* On prend, pour chaque orientation, la figure qui porte le PLUS de
         segments posés sur l’axe : ce sont eux qui appartiennent aux deux
         moitiés, et une figure qui n’en a aucun ne dirait rien de leur sort. */
      const surAxeDe = (f) => pairesDe(f, cibleDe(f)).surAxe.length;
      const fig = FIGURES.filter(f => f.axe === orient)
        .sort((a2, b2) => surAxeDe(b2) - surAxeDe(a2))[0];
      file[0] = construireManche(fig, 'report'); pos = 0; manche(); desarmerAutoSuivant();
      await new Promise(r => setTimeout(r, 60));
      const svg = document.getElementById('grille'), plan = document.getElementById('plan');
      const rabat = document.getElementById('rabat');
      const b = svg.querySelector('.axe').getBBox();
      const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      /* L’axe couvre-t-il TOUTE la vue, et pas seulement le quadrillage ? */
      const couvre = orient === 'v'
        ? (Math.abs(b.y - vb[1]) < 0.01 && Math.abs(b.y + b.height - (vb[1]+vb[3])) < 0.01)
        : (Math.abs(b.x - vb[0]) < 0.01 && Math.abs(b.x + b.width - (vb[0]+vb[2])) < 0.01);
      /* On TRACE avant de réussir : sans traits posés, le calque et le plan
         se ressembleraient de toute façon, et la comparaison ne prouverait
         rien sur ce que le calque emporte. */
      [...file[0].aTracer].forEach(k => traces.set(k, '#2F6FED'));
      rendrePlan();
      reussir();
      /* On attend la fin du PREMIER temps : la moitié est alors posée sur sa
         jumelle, immobile, et c’est là que la superposition se mesure. */
      await new Promise(r => setTimeout(r, 900));
      desarmerAutoSuivant();
      const st = getComputedStyle(rabat);
      const anim = st.animationName, affiche = st.display;
      const [ox, oy] = st.transformOrigin.split(' ').map(parseFloat);
      const r = rabat.getBoundingClientRect();
      const pt = svg.createSVGPoint();
      pt.x = r.x + ox; pt.y = r.y + oy;
      const c = pt.matrixTransform(rabat.getScreenCTM().inverse());
      const surAxe = orient === 'v' ? Math.abs(c.x - AXE_V) : Math.abs(c.y - AXE_H);
      /* LA MESURE QUI COMPTE : chaque trait emporté par le calque doit tomber,
         À L’ÉCRAN, sur son image miroir restée dans le plan. On lit des
         `getBoundingClientRect`, qui tiennent compte de la rotation en cours :
         c’est la superposition VUE, pas celle qu’on déduit des déclarations. */
      const lignes = (racine) => {
        const m = {};
        racine.querySelectorAll('line.pre, line.trace').forEach(l => {
          const k = cle([+l.getAttribute('x1'), +l.getAttribute('y1')],
                        [+l.getAttribute('x2'), +l.getAttribute('y2')]);
          m[k] = l.getBoundingClientRect();
        });
        return m;
      };
      const surCalque = lignes(rabat), surPlan = lignes(svg);
      let ecart = 0, paires = 0;
      Object.keys(surCalque).forEach(k => {
        if (!estDuCoteReference(k, orient)) return;
        const jumeau = surPlan[reflechirSeg(k, orient)];
        if (!jumeau) return;
        paires++;
        const a = surCalque[k];
        ecart = Math.max(ecart,
          Math.abs((a.x + a.width/2) - (jumeau.x + jumeau.width/2)),
          Math.abs((a.y + a.height/2) - (jumeau.y + jumeau.height/2)));
      });
      /* Les deux découpes doivent être COMPLÉMENTAIRES : ce que le calque
         emporte, le plan ne le garde pas — sinon la moitié ne quitte jamais
         sa place et l’on regarde un simple pivot. */
      const dRabat = st.clipPath, dPlan = getComputedStyle(svg).clipPath;
      /* LE CALQUE N’EMPORTE QUE SON ENCRE : tous les traits de la moitié de
         référence (et ceux posés sur l’axe, qui appartiennent aux deux), et
         AUCUN de la moitié d’en face. Comparer les deux images caractère par
         caractère ne disait pas cela — et laissait passer un calque qui
         emportait, avec ses traits, les bouts arrondis de ceux d’en face. */
      const encre = (racine) => new Set([...racine.querySelectorAll('line.pre, line.trace')].map(l =>
        cle([+l.getAttribute('x1'), +l.getAttribute('y1')], [+l.getAttribute('x2'), +l.getAttribute('y2')])));
      const estSurAxe = (k) => reflechirSeg(k, orient) === k;
      const auCalque = encre(rabat), auPlan = encre(svg);
      const attendu = [...auPlan].filter(k => estDuCoteReference(k, orient) || estSurAxe(k));
      const memeImage = auCalque.size === attendu.length
        && attendu.every(k => auCalque.has(k)) && attendu.length > 5;
      const encreDenFace = [...auCalque].filter(k => !estDuCoteReference(k, orient) && !estSurAxe(k)).length;
      res.push({orient, figure:fig.nom, couvre, surAxe:+surAxe.toFixed(3), anim, affiche,
                dRabat, dPlan, memeImage, encreDenFace, ecart:+ecart.toFixed(2), paires});
      arreterPli();
    }
    return res;
  });
  axeEtPli.forEach(x => {
    const vert = x.orient === 'v';
    T(`l’axe ${vert ? 'vertical' : 'horizontal'} court sur toute la vue`, x.couvre, x.figure);
    T(`le pli tombe SUR l’axe (${x.orient})`, x.surAxe < 0.02, x.surAxe + ' maille d’écart');
    T(`et il tourne autour du bon axe (${x.orient})`,
      x.anim === (vert ? 'plier-v' : 'plier-h'), x.anim);
    T(`le calque du rabat s’affiche pendant le pli (${x.orient})`, x.affiche === 'block', x.affiche);
    T(`le calque emporte toute l’encre de sa moitié (${x.orient})`, x.memeImage);
    T(`et rien de celle d’en face (${x.orient})`, x.encreDenFace === 0, x.encreDenFace + ' traits de trop');
    /* La découpe du calque prend la moitié de RÉFÉRENCE — gauche pour un axe
       vertical, haut pour un axe horizontal — et le plan garde l’autre.
       On développe le raccourci CSS (`inset()` accepte 1 à 4 valeurs) plutôt
       que d’attendre une écriture précise : c’est la géométrie qui compte. */
    const inset = (v) => {
      const m = /inset\((.*)\)/.exec(v);
      if (!m) return null;
      /* Chaque valeur vaut « 0px », « 50% » ou « calc(50% - 4px) » : on en
         retient le POURCENTAGE et le débord en pixels, séparément. */
      const p = (m[1].match(/calc\([^)]*\)|[^\s]+/g) || []).map(v2 => {
        const pct = (/(-?[\d.]+)%/.exec(v2) || [0, 0])[1] * 1;
        /* Dans un `calc`, le signe est un OPÉRATEUR détaché du nombre : le
           lire comme faisant partie du nombre donnait +4 là où il y a −4. */
        const g = /calc\(/.test(v2) ? /([-+])\s*([\d.]+)px/.exec(v2) : null;
        const px = g ? (g[1] === '-' ? -1 : 1) * (g[2] * 1)
                     : (/(-?[\d.]+)px/.exec(v2) || [0, 0])[1] * 1;
        return {pct, px};
      });
      const [t, r = t, b = t, l = r] = p;
      return {t, r, b, l};   // haut, droite, bas, gauche
    };
    const coupe = (v, cote, debordMax) => {
      const i = inset(v);
      if (!i) return false;
      const c = i[cote];
      return Math.abs(c.pct - 50) < .01 && c.px <= 0 && c.px >= -(debordMax || 0)
        && ['t','r','b','l'].every(n => n === cote || (!i[n].pct && !i[n].px));
    };
    /* Le calque déborde de quelques pixels au plus — de quoi couvrir les
       bouts arrondis des traits, pas de quoi mordre sur l’autre moitié. */
    T(`les deux découpes sont complémentaires (${x.orient})`,
      coupe(x.dRabat, vert ? 'r' : 'b', 8) && coupe(x.dPlan, vert ? 'l' : 't', 0),
      x.dRabat + ' | ' + x.dPlan);
    /* LA MOITIÉ POSÉE RECOUVRE SA JUMELLE — au pixel près, sur tous les
       traits, pas seulement en moyenne. */
    T(`la moitié rabattue se superpose à l’autre (${x.orient})`,
      x.paires >= 8 && x.ecart < 1, x.ecart + ' px sur ' + x.paires + ' paires');
  });

  /* --------- L’INTÉRIEUR COLORIÉ ---------
     On ne vérifie pas le remplissage en le recalculant avec la fonction qui
     le produit — cela ne prouverait rien. On mesure l’AIRE des polygones
     rendus, par la formule du lacet, sur deux figures de contrôle dont
     l’aire est connue sans aucun code : un carré fermé de 2×2 enferme
     4 mailles, un trait ouvert n’enferme rien. */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  const aires = await page.evaluate(() => {
    const svg = document.getElementById('grille');
    const aire = () => [...svg.querySelectorAll('.dedans polygon')].reduce((somme, g) => {
      const pts = g.getAttribute('points').trim().split(/\s+/).map(c => c.split(',').map(Number));
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1,y1] = pts[i], [x2,y2] = pts[(i+1) % pts.length];
        a += x1*y2 - x2*y1;
      }
      return somme + Math.abs(a) / 2;
    }, 0);
    const poser = (segs) => {
      file[pos].pre = new Set(segs); file[pos].aTracer = new Set();
      traces = new Map(); colorierDedans = true; rendrePlan();
      return aire();
    };
    const carre = poser([cle([2,2],[4,2]), cle([4,2],[4,4]), cle([4,4],[2,4]), cle([2,4],[2,2])]
      .length ? [cle([2,2],[3,2]), cle([3,2],[4,2]), cle([4,2],[4,3]), cle([4,3],[4,4]),
                 cle([4,4],[3,4]), cle([3,4],[2,4]), cle([2,4],[2,3]), cle([2,3],[2,2])] : []);
    const ouvert = poser([cle([1,1],[2,1]), cle([2,1],[3,1])]);
    /* Une diagonale coupe sa cellule : le triangle d’un demi-carreau doit
       compter pour une demi-maille, pas pour une maille entière. */
    const triangle = poser([cle([1,1],[3,1]).length ? cle([1,1],[2,1]) : '', cle([2,1],[1,2]),
                            cle([1,2],[1,1])].filter(Boolean));
    return {carre, ouvert, triangle};
  });
  T('l’intérieur d’un carré fermé de 2×2 vaut 4 mailles', Math.abs(aires.carre - 4) < 1e-6, aires.carre);
  T('un trait ouvert n’enferme rien', aires.ouvert === 0, aires.ouvert);
  T('une diagonale coupe la cellule : le demi-carreau vaut 0,5 maille',
    Math.abs(aires.triangle - 0.5) < 1e-6, aires.triangle);

  /* L’intérieur d’une figure symétrique est lui-même symétrique : les deux
     moitiés doivent porter la même aire. C’est une propriété de la figure,
     indépendante de la façon dont on calcule le dedans. */
  const symetrie = await page.evaluate(async () => {
    const svg = document.getElementById('grille');
    const fig = FIGURES.find(f => f.nom === 'la maison');
    file[0] = construireManche(fig, 'report'); pos = 0; manche(); desarmerAutoSuivant();
    [...file[0].aTracer].forEach(k => traces.set(k, '#2F6FED'));
    colorierDedans = true; rendrePlan();
    let gauche = 0, droite = 0;
    [...svg.querySelectorAll('.dedans polygon')].forEach(g => {
      const pts = g.getAttribute('points').trim().split(/\s+/).map(c => c.split(',').map(Number));
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1,y1] = pts[i], [x2,y2] = pts[(i+1) % pts.length];
        a += x1*y2 - x2*y1;
      }
      const cx = pts.reduce((s,p) => s + p[0], 0) / pts.length;
      if (cx < AXE_V) gauche += Math.abs(a)/2; else droite += Math.abs(a)/2;
    });
    return {gauche, droite};
  });
  T('l’intérieur d’une figure symétrique l’est aussi',
    symetrie.gauche > 0 && Math.abs(symetrie.gauche - symetrie.droite) < 1e-6, symetrie);

  /* Le coloriage est une RÉCOMPENSE : il n’arrive ni avant la réussite, ni
     après un abandon, et il arrive AU RETOUR du rabat, pas avant. */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  const avantDedans = await page.evaluate(() => document.querySelectorAll('.dedans polygon').length);
  const segs = await page.evaluate(() => [...file[pos].aTracer]);
  for (const k of segs) await taper(k);
  await page.evaluate(() => desarmerAutoSuivant());
  const pendant = await page.evaluate(() => document.querySelectorAll('.dedans polygon').length);
  await page.waitForTimeout(2600);
  await page.evaluate(() => desarmerAutoSuivant());
  const apresPli = await page.evaluate(() => {
    const p = [...document.querySelectorAll('#grille .dedans polygon')];
    const vert = file[pos].fig.axe === 'v';
    const retards = p.map(g => parseFloat(getComputedStyle(g).animationDelay));
    /* Le retard doit CROÎTRE avec la distance à l’axe : on compare le
       triangle le plus proche de l’axe et le plus éloigné. */
    const dist = (g) => {
      const pts = g.getAttribute('points').trim().split(/\s+/).map(c => c.split(',').map(Number));
      const c = pts.reduce((s2, q) => s2 + q[vert?0:1], 0) / pts.length;
      return Math.abs(c - (vert ? AXE_V : AXE_H));
    };
    const tri = p.map((g, i) => ({d:dist(g), r:retards[i]})).sort((a, b) => a.d - b.d);
    return {n:p.length, retardMax:Math.max(...retards), retardMin:Math.min(...retards),
            retardAxe:tri[0].r, retardBord:tri[tri.length-1].r};
  });
  T('rien n’est colorié avant la réussite', avantDedans === 0, avantDedans);
  T('ni à l’instant du succès : le coloriage attend le retour du rabat', pendant === 0, pendant);
  T('l’intérieur se colorie au retour du rabat', apresPli.n > 0, apresPli.n + ' triangles');
  T('la couleur part de l’axe et gagne les bords (retards échelonnés)',
    apresPli.retardMin < .1 && apresPli.retardMax > .3
    && apresPli.retardMax - apresPli.retardMin > .25, apresPli);
  T('et le plus proche de l’axe part le premier', apresPli.retardAxe < apresPli.retardBord,
    apresPli.retardAxe + ' s vs ' + apresPli.retardBord + ' s');

  /* Abandon : on montre ce qui manquait, on ne colorie pas. */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  await page.click('#btnPasser');
  await page.evaluate(() => desarmerAutoSuivant());
  await page.waitForTimeout(1400);
  const apresPasser = await page.evaluate(() => document.querySelectorAll('.dedans polygon').length);
  T('passer ne colorie pas l’intérieur', apresPasser === 0, apresPasser);

  /* --------- §20 : L’AVANCE LAISSE SAVOURER LA RÉUSSITE ---------
     Le §20 arme le minuteur « 2 s après l’affichage du bouton Suivant »,
     parce que l’enfant a déjà tout vu quand le bouton paraît. Sur une
     réussite de M41 c’est faux : la récompense COMMENCE à cet instant. On
     mesure donc que le jeu n’avance pas pendant la fête, et qu’il avance
     bien ensuite — et que le clic manuel, lui, reste immédiat. */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  const repere = await page.evaluate(() => {
    const seg = [...file[pos].aTracer];
    return {fig:file[pos].fig.nom, seg};
  });
  for (const k of repere.seg) await taper(k);
  const boutonTout_de_suite = await page.evaluate(() =>
    document.getElementById('btnNext').style.display === 'block');
  await page.waitForTimeout(2600);
  const pendantLaFete = await page.evaluate(() => ({fig:file[pos].fig.nom, pos}));
  await page.waitForTimeout(2600);
  const apresLaFete = await page.evaluate(() => { const p = pos; desarmerAutoSuivant(); return {pos:p}; });
  T('le bouton Suivant paraît dès la réussite : le clic manuel reste immédiat',
    boutonTout_de_suite === true);
  T('§20 : le jeu n’avance pas pendant la fête de réussite',
    pendantLaFete.pos === 0 && pendantLaFete.fig === repere.fig, pendantLaFete);
  T('mais il avance bien une fois la fête finie', apresLaFete.pos === 1, apresLaFete);

  /* Un abandon n’a pas de fête à laisser voir : le §20 s’applique tel quel. */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.click('#btnPasser');
  await page.waitForTimeout(2600);
  const apresAbandon = await page.evaluate(() => { const p = pos; desarmerAutoSuivant(); return p; });
  T('§20 inchangé après un abandon : 2 s et le jeu avance', apresAbandon === 1, apresAbandon);

  /* Mouvement réduit : aucune animation ne se joue, donc aucun `animationend`
     ne vient jamais. L’intérieur doit tout de même se colorier et le jeu
     doit tout de même avancer — sans quoi la manche resterait figée. */
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  const segRM = await page.evaluate(() => [...file[pos].aTracer]);
  for (const k of segRM) await taper(k);
  const rmTout_de_suite = await page.evaluate(() =>
    document.querySelectorAll('#grille .dedans polygon').length);
  await page.waitForTimeout(2600);
  const rmApres = await page.evaluate(() => { const p = pos; desarmerAutoSuivant(); return p; });
  await page.emulateMedia({reducedMotion:null});
  T('mouvement réduit : l’intérieur se colorie d’emblée', rmTout_de_suite > 0, rmTout_de_suite);
  T('mouvement réduit : le jeu avance sans attendre d’animation', rmApres === 1, rmApres);

  /* --------- LE RETOUR ARRIÈRE EFFACE --------- */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => desarmerAutoSuivant());
  const retour = await page.evaluate(async () => {
    /* On choisit deux pas consécutifs à tracer, pour glisser A→B→C→B→A. */
    const q = file[pos];
    const libres = [...q.aTracer];
    const trouve = (() => {
      for (const k1 of libres) for (const k2 of libres) {
        if (k1 === k2) continue;
        const [a,b] = bouts(k1), [c,d] = bouts(k2);
        for (const pivot of [a,b]) for (const autre of [c,d]) {
          if (pivot[0] === autre[0] && pivot[1] === autre[1]) {
            const debut = (pivot === a) ? b : a;
            const bout = (autre === c) ? d : c;
            return {debut, pivot, bout, k1, k2};
          }
        }
      }
      return null;
    })();
    if (!trouve) return {impossible:true};
    const {debut, pivot, bout, k1, k2} = trouve;
    const svg = document.getElementById('grille');
    const ecran = (p) => {
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = p[1];
      const s = pt.matrixTransform(m);
      return {x:s.x, y:s.y};
    };
    const env = (type, p, id) => svg.dispatchEvent(new PointerEvent(type,
      {clientX:ecran(p).x, clientY:ecran(p).y, pointerId:id, bubbles:true}));
    /* Aller : début → pivot → bout. */
    env('pointerdown', debut, 1);
    env('pointermove', pivot, 1); env('pointermove', bout, 1);
    const aller = {k1:traces.has(k1), k2:traces.has(k2), n:traces.size};
    /* Retour sur ses pas : bout → pivot → début. */
    env('pointermove', pivot, 1); env('pointermove', debut, 1);
    const efface = {k1:traces.has(k1), k2:traces.has(k2), n:traces.size};
    env('pointerup', debut, 1);
    /* Deuxième geste : on repasse sur un trait DÉJÀ POSÉ avant de reculer.
       Le retour arrière ne doit pas l’effacer — il n’en est pas l’auteur. */
    traces.set(k1, '#2F6FED'); rendrePlan();
    env('pointerdown', debut, 2);
    env('pointermove', pivot, 2);
    env('pointermove', debut, 2);
    const ancien = {k1:traces.has(k1)};
    env('pointerup', debut, 2);
    /* Et le pré-rempli reste intouchable, même en reculant dessus. */
    const kPre = [...file[pos].pre][0];
    const [pa, pb] = bouts(kPre);
    env('pointerdown', pa, 3); env('pointermove', pb, 3); env('pointermove', pa, 3);
    env('pointerup', pa, 3);
    return {aller, efface, ancien, pre:file[pos].pre.has(kPre)};
  });
  T('le geste pose bien les deux segments à l’aller',
    retour.aller && retour.aller.k1 && retour.aller.k2, retour.aller);
  T('revenir sur ses pas efface ce que le geste vient d’écrire',
    retour.efface && !retour.efface.k1 && !retour.efface.k2 && retour.efface.n === 0, retour.efface);
  T('mais pas un trait antérieur au geste', retour.ancien && retour.ancien.k1 === true, retour.ancien);
  T('ni le pré-rempli', retour.pre === true);

  /* La gomme et le retour arrière : reculer sur ses pas ne doit pas exhumer
     ce que la gomme vient d’effacer — le retour arrière défait un TRACÉ, il
     n’est pas un « refaire ». */
  const gommeRetour = await page.evaluate(async () => {
    const q = file[pos];
    const libres = [...q.aTracer];
    let paire = null;
    for (const k1 of libres) for (const k2 of libres) {
      if (k1 === k2 || paire) continue;
      const [a,b] = bouts(k1), [c,d] = bouts(k2);
      for (const pivot of [a,b]) for (const autre of [c,d]) {
        if (!paire && pivot[0] === autre[0] && pivot[1] === autre[1]) {
          paire = {debut:(pivot === a ? b : a), pivot, bout:(autre === c ? d : c), k1, k2};
        }
      }
    }
    if (!paire) return {impossible:true};
    const {debut, pivot, bout, k1, k2} = paire;
    traces.set(k1, '#2F6FED'); traces.set(k2, '#2F6FED'); rendrePlan();
    const svg = document.getElementById('grille');
    const env = (type, p, id) => {
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = p[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:id, bubbles:true}));
    };
    outil = 'gomme';
    env('pointerdown', debut, 7);
    env('pointermove', pivot, 7); env('pointermove', bout, 7);
    const efface = traces.size;
    env('pointermove', pivot, 7); env('pointermove', debut, 7);
    env('pointerup', debut, 7);
    outil = 'feutre';
    return {efface, apresRetour:traces.size, k1:traces.has(k1), k2:traces.has(k2)};
  });
  T('la gomme efface bien les deux segments au passage', gommeRetour.efface === 0, gommeRetour);
  T('et reculer n’exhume pas ce qu’elle vient d’effacer',
    gommeRetour.apresRetour === 0 && !gommeRetour.k1 && !gommeRetour.k2, gommeRetour);

  /* --------- §13 bis : les figures d’une partie sont distinctes --------- */
  const tirages = await page.evaluate(() => {
    const res = {doublons:0, suite:0, N:200, stock:FIGURES.length, file:6};
    for (let n = 0; n < res.N; n++) {
      const noms = engendrerFile(jeu('ce2-symetrie-completer')).map(m => m.fig.nom);
      if (new Set(noms).size !== noms.length) res.doublons++;
      for (let i = 1; i < noms.length; i++) if (noms[i] === noms[i-1]) res.suite++;
    }
    return res;
  });
  T('§13 bis : jamais deux fois la même figure dans une partie', tirages.doublons === 0, tirages.doublons);
  T('§13 bis : ni deux fois de suite', tirages.suite === 0, tirages.suite);
  T('§13 bis : stock strictement plus grand que la file', tirages.stock > tirages.file, tirages);
  const prog = await page.evaluate(() => {
    const modes = engendrerFile(jeu('ce2-symetrie-completer')).map(m => m.mode);
    return {modes, declare: PROGRESSIONS_DECLAREES.mode};
  });
  T('le report précède toujours la fusion (progression déclarée)',
    JSON.stringify(prog.modes) === JSON.stringify(['report','report','report','fusion','fusion','fusion']),
    prog.modes.join(','));
  T('et la progression est justifiée en toutes lettres', prog.declare.length > 40);

  /* --------- Partie complète : score et session (§11) --------- */
  await page.goto(base + '?competence=ce2-symetrie-completer');
  await page.waitForTimeout(350);
  await page.evaluate(() => localStorage.setItem('mayeutik-sessions', '[]'));
  for (let m = 0; m < 6; m++) {
    await page.evaluate(() => desarmerAutoSuivant());
    const seg = await page.evaluate(() => [...file[pos].aTracer]);
    for (const k of seg) await taper(k);
    await page.evaluate(() => { desarmerAutoSuivant(); const b = document.getElementById('btnNext');
      if (b.style.display !== 'none') b.click(); });
    await page.waitForTimeout(180);
  }
  const fin = await page.evaluate(() => ({fin:!document.getElementById('end').hidden,
    etoiles:document.getElementById('endStars').textContent.trim().length,
    session:JSON.parse(localStorage.getItem('mayeutik-sessions')).pop()}));
  T('partie parfaite : écran de fin et 3 étoiles', fin.fin && fin.etoiles === 3, fin);
  T('§11 session M41 enregistrée, 12/12',
    fin.session && fin.session.module === 'M41' && fin.session.competence === 'ce2-symetrie-completer'
    && fin.session.score === 12 && fin.session.total === 12, fin.session);

  console.log('\nErreurs JS/console/réseau : ' + (erreurs.length ? JSON.stringify(erreurs.slice(0,3)) : 'aucune'));
  console.log(`\n${ok} OK, ${ko} KO`);
  console.log(ko === 0 && erreurs.length === 0 ? 'EXIT:SUCCES' : 'EXIT:ECHEC');
  await nav.close(); srv.close();
})();
