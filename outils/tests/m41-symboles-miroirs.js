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

  const aller = async (comp) => {
    await page.goto(base + '?competence=' + comp);
    await page.waitForTimeout(350);
    await page.evaluate(() => desarmerAutoSuivant());
  };
  /* Poser la figure voulue et rejouer la manche : les tests ne dépendent
     pas du tirage. */
  const poser = (nom) => page.evaluate((n) => {
    desarmerAutoSuivant();
    file[0] = {fig: FIGURES1.find(f => f.nom === n), _points:0, _ok:false};
    pos = 0; score = 0; manche1(); desarmerAutoSuivant();
  }, nom);
  /* Tracer un trait au doigt, en coordonnées de figure, avec un tremblement. */
  const tracer = (a, b, tremble) => page.evaluate(([A, B, tr]) => {
    const svg = document.getElementById('figure');
    const env = (type, p) => {
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = p[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:1, bubbles:true}));
    };
    const N = 24, bruit = (i) => tr ? Math.sin(i * 2.3) * tr : 0;
    const nx = -(B[1]-A[1]), ny = (B[0]-A[0]);
    const L = Math.hypot(nx, ny) || 1;
    env('pointerdown', A);
    for (let i = 1; i <= N; i++) {
      const t = i / N, d = bruit(i);
      env('pointermove', [A[0] + t*(B[0]-A[0]) + d*nx/L, A[1] + t*(B[1]-A[1]) + d*ny/L]);
    }
    env('pointerup', B);
  }, [a, b, tremble || 0]);

  const brut = fs.readFileSync(RACINE + JEU, 'utf8');
  T('typographie : aucune apostrophe droite dans un mot', !/[a-zà-ÿA-ZÀ-Ÿ]'[a-zà-ÿ]/.test(brut));
  T('la rosace de M34 n’est pas recopiée', !/construireRosace|rosace/i.test(brut));

  /* ================= LA BANQUE, RECALCULÉE ================= */
  await aller('ce2-symetrie-reconnaitre');
  const banque = await page.evaluate(() => FIGURES1.map(f =>
    ({nom:f.nom, declare:f.axes, calcule:f._axes.length, segs:f.prims.length})));
  T('les axes déclarés sont ceux que la géométrie donne',
    banque.every(f => f.declare === f.calcule),
    banque.filter(f => f.declare !== f.calcule).map(f => f.nom).join(', ') || '19/19');
  const sans = banque.filter(f => f.calcule === 0);
  T('la banque compte environ un tiers de figures sans axe', sans.length / banque.length >= .3,
    sans.length + '/' + banque.length);
  /* AUCUNE FIGURE DE LA BANQUE N’EST INATTEIGNABLE. Les familles étaient
     décrites par un nombre exact d’axes : le panneau stop, qui en a quatre,
     ne tombait dans aucune et n’était jamais tiré — présent dans le fichier,
     absent du jeu. Chaque figure doit appartenir à exactement une famille. */
  const familles = await page.evaluate(() => FIGURES1.map(f => ({
    nom:f.nom, axes:f._axes.length,
    familles:REPARTITION1.filter(r => r.prend(f)).map(r => r.nom)
  })).filter(x => x.familles.length !== 1));
  T('chaque figure appartient à exactement une famille de tirage',
    familles.length === 0,
    familles.map(x => x.nom + ' (' + x.axes + ' axes → ' + (x.familles.join('+') || 'aucune') + ')').join(', ')
      || 'les 28');
  /* Et chacune sort effectivement, sur un grand nombre de parties. */
  const sorties = await page.evaluate(() => {
    const vues = new Set();
    for (let n = 0; n < 400; n++)
      engendrerFile1(jeu('ce2-symetrie-reconnaitre')).forEach(q => vues.add(q.fig.nom));
    return FIGURES1.filter(f => !vues.has(f.nom)).map(f => f.nom);
  });
  T('et sort effectivement au tirage', sorties.length === 0, sorties.join(', ') || 'les 28');

  /* Ce que l’enfant rencontre compte plus que ce que la banque contient :
     la PARTIE doit porter le tiers, dans tous les tirages. */
  const proportions = await page.evaluate(() => {
    const res = {parties:120, mauvaises:0, reparties:{}};
    for (let n = 0; n < res.parties; n++) {
      const f = engendrerFile1(jeu('ce2-symetrie-reconnaitre'));
      const cle = f.map(q => q.fig._axes.length).sort().join('');
      res.reparties[cle] = (res.reparties[cle] || 0) + 1;
      if (f.filter(q => q.fig._axes.length === 0).length !== 2) res.mauvaises++;
    }
    return res;
  });
  T('chaque partie porte exactement deux figures sans axe sur six',
    proportions.mauvaises === 0, JSON.stringify(proportions.reparties));
  ['la lettre N','la lettre S','la lettre Z','le parallélogramme'].forEach(n =>
    T('« ' + n +' » est bien sans axe', sans.some(f => f.nom === n)));
  /* Le contrôle ne tamponne pas la déclaration : une figure faussée perd
     son axe. Sans cette vérification, une fonction qui renverrait toujours
     le nombre déclaré passerait le test précédent. */
  const faussee = await page.evaluate(() => {
    const c = FIGURES1.find(f => f.nom === 'le rectangle');
    const copie = {prims: c.prims.map(s => ['S', s[1].slice(), s[2].slice()])};
    const avant = axesDe(copie).length;
    copie.prims[0][1] = [copie.prims[0][1][0] + 9, copie.prims[0][1][1]];   // un sommet déplacé
    return {avant, apres: axesDe(copie).length};
  });
  T('un sommet déplacé fait disparaître les axes (le contrôle calcule vraiment)',
    faussee.avant === 2 && faussee.apres === 0, faussee);
  /* Et surtout : les droites que le jeu SERT comme axes en sont vraiment.
     Comparer un compte à un compte laisserait passer une liste fabriquée à
     partir du nombre déclaré — même longueur, droites inventées. */
  const axesServis = await page.evaluate(() => FIGURES1.map(f => ({
    nom:f.nom,
    pire:Math.max(0, ...f._axes.map(L => erreurDeSymetrie(f, L)))
  })).filter(x => x.pire > 1e-6));
  T('chaque axe servi au jeu en est réellement un',
    axesServis.length === 0, axesServis.map(x => x.nom).join(', ') || 'les 20');

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

  /* ================= LE CALQUE A LA BOÎTE DU PLAN =================
     Les deux SVG portent la même `viewBox` ; ils ne se superposent donc que
     si leur BOÎTE est la même au pixel près. Sitôt qu’elle diffère, la vue
     s’y recentre et tout le dessin glisse — avant même le moindre pliage.
     On mesure les deux, à plusieurs largeurs d’écran. */
  const boites = [];
  for (const large of [390, 360, 430]) {
    await page.setViewportSize({width:large, height:844});
    await aller('ce2-symetrie-reconnaitre');
    boites.push(await page.evaluate((w) => {
      const c = document.getElementById('calque');
      c.removeAttribute('hidden');
      const p1 = document.getElementById('figure').getBoundingClientRect();
      const p2 = c.getBoundingClientRect();
      c.setAttribute('hidden', '');
      return {w, ecart:+Math.max(Math.abs(p1.x-p2.x), Math.abs(p1.y-p2.y),
        Math.abs(p1.width-p2.width), Math.abs(p1.height-p2.height)).toFixed(2),
        taille:Math.round(p1.width) + '×' + Math.round(p1.height)};
    }, large));
  }
  await page.setViewportSize({width:390, height:844});
  T('le calque a exactement la boîte de la figure, à toute largeur',
    boites.every(b => b.ecart < 0.01), boites.map(b => b.w + 'px→' + b.taille + ' (' + b.ecart + ')').join(', '));

  /* ================= LA SURFACE DE TRACÉ ================= */
  await poser('la lettre T');
  const surface = await page.evaluate(() => {
    const z = document.getElementById('figure');
    const r = z.getBoundingClientRect();
    const points = [];
    /* On sonde TOUTE la zone, y compris loin de l’encre : sous chaque point
       il doit y avoir un élément de la zone de tracé, et il doit refuser le
       défilement. Un coin vide qui désigne la carte au lieu du plan, c’est
       le doigt qui fait glisser la page au lieu de tracer. */
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
      const el = document.elementFromPoint(r.x + r.width*i/6, r.y + r.height*j/6);
      /* On exige un élément PEINT sous le doigt — la surface ou un trait —
         et non le `<svg>` lui-même : c’est là que les moteurs divergent, et
         s’en remettre au conteneur, c’est s’en remettre au hasard. */
      points.push({dans: !!(el && z.contains(el) && el !== z),
                   touch: el ? getComputedStyle(el).touchAction : 'rien'});
    }
    return {mauvais:points.filter(p => !p.dans || p.touch !== 'none').length, total:points.length,
            carte:getComputedStyle(document.getElementById('scene')).touchAction};
  });
  T('toute la zone de tracé est une cible, même loin de l’encre',
    surface.mauvais === 0, surface.mauvais + ' points sur ' + surface.total + ' hors cible');
  T('et la carte entière refuse le défilement', surface.carte === 'none', surface.carte);

  /* ================= LA RÉGULARISATION N’AIMANTE PAS ================= */
  /* La figure est posée au centre pour ces mesures : son axe vertical tombe
     alors sur la colonne x = 50 du quadrillage. */
  const centrer = (n) => page.evaluate((nom) => {
    desarmerAutoSuivant();
    file[0] = {fig:poserFigure(FIGURES1.find(f => f.nom === nom), [0,0]), _points:0, _ok:false};
    pos = 0; score = 0; manche1(); desarmerAutoSuivant();
  }, n);

  await centrer('le cœur');
  await tracer([50, 4], [50, 96], 0);
  const droit = await page.evaluate(() => ({
    noeuds:ligne1.noeuds, erreur:erreurDeSymetrie(file[pos].fig, ligne1)}));
  T('un trait vertical s’accroche exactement sur l’axe',
    JSON.stringify(droit.noeuds) === '[[50,0],[50,100]]' && droit.erreur < 1e-9, droit);

  await centrer('le cœur');
  /* Un trait franchement penché sur une figure dont l’axe est vertical :
     s’il ressortait vertical, c’est que le jeu aurait corrigé l’enfant, et
     la vérification au calque ne vérifierait plus rien. L’accroche va aux
     NŒUDS DE LA GRILLE, jamais à l’axe : un trait de travers s’accroche de
     travers. */
  await tracer([40, 6], [60, 94], 0);
  const penche = await page.evaluate(() => ({
    noeuds: ligne1.noeuds,
    angle: Math.atan2(ligne1.d[1], ligne1.d[0]) * 180 / Math.PI,
    erreur: erreurDeSymetrie(file[pos].fig, ligne1),
    tol: toleranceDe(file[pos].fig)
  }));
  T('un trait penché RESTE penché : aucune aimantation vers l’axe vrai',
    Math.abs(penche.angle - 90) > 8 && penche.noeuds[0][0] === 40 && penche.noeuds[1][0] === 60,
    penche.angle.toFixed(2) + '° entre ' + JSON.stringify(penche.noeuds) + ' (vrai axe : 90°)');
  T('et le verdict le refuse', penche.erreur > penche.tol, penche.erreur.toFixed(3));

  /* Un trait visé UN NŒUD À CÔTÉ s’accroche un nœud à côté : l’erreur reste
     l’erreur de l’enfant, la grille ne la rattrape pas. */
  await centrer('le cœur');
  await tracer([40, 4], [40, 96], 0);
  const aCote = await page.evaluate(() => ({noeuds:ligne1.noeuds,
    erreur:erreurDeSymetrie(file[pos].fig, ligne1), tol:toleranceDe(file[pos].fig)}));
  T('un trait visé un nœud à côté reste un nœud à côté',
    JSON.stringify(aCote.noeuds) === '[[40,0],[40,100]]' && aCote.erreur > aCote.tol, aCote);

  /* LA CERTITUDE DU TRAIT : le même geste, tremblé autrement, doit donner
     LE MÊME trait. C’est ce que la grille apporte — un trait libre, lui,
     changeait à chaque essai. */
  const repetitions = [];
  for (const tremble of [0, 2, 4, 6]) {
    await centrer('le cœur');
    await tracer([50, 6], [50, 94], tremble);
    repetitions.push(await page.evaluate(() => JSON.stringify(ligne1.noeuds)));
  }
  T('le même geste, tremblé autrement, donne le même trait',
    new Set(repetitions).size === 1, repetitions.join(' | '));

  /* Tout axe de toute figure doit être ATTEIGNABLE : deux nœuds distincts
     de la grille doivent tomber dessus, sinon l’enfant ne peut pas le
     tracer, quelle que soit son adresse. */
  const atteignables = await page.evaluate(() => {
    const hors = [];
    FIGURES1.forEach(f => f._decalages.forEach(d => {
      const g = poserFigure(f, d);
      g._axes.forEach(L => {
        let n = 0;
        for (let x = NOEUD_MIN; x <= NOEUD_MAX; x += PAS_GRILLE)
          for (let y = NOEUD_MIN; y <= NOEUD_MAX; y += PAS_GRILLE)
            if (Math.abs(cote([x,y], L)) < 1e-9) n++;
        if (n < 2) hors.push(f.nom + ' ' + JSON.stringify(d));
      });
    }));
    return hors;
  });
  T('tout axe est traçable : deux nœuds au moins tombent dessus',
    atteignables.length === 0, atteignables.join(', ') || 'toutes positions comprises');

  /* La figure ne se pose pas toujours au milieu, sinon le quadrillage
     ferait de la médiane une évidence. */
  const places = await page.evaluate(() => {
    /* Une droite se désigne par sa POSITION, pas par le point qui a servi à
       l’écrire : deux figures centrées donnent deux `p` différents pour le
       même axe médian. On relève donc l’abscisse d’une verticale et
       l’ordonnée d’une horizontale. */
    const vus = {};
    for (let n = 0; n < 200; n++)
      engendrerFile1(jeu('ce2-symetrie-reconnaitre')).forEach(q => q.fig._axes.forEach(L => {
        const v = Math.abs(L.d[0]) < 1e-9 ? 'x=' + Math.round(L.p[0]) : 'y=' + Math.round(L.p[1]);
        vus[v] = (vus[v] || 0) + 1;
      }));
    return vus;
  });
  const mediane = (places['x=50'] || 0) + (places['y=50'] || 0);
  const total = Object.values(places).reduce((a, b) => a + b, 0);
  T('les axes ne tombent pas toujours sur la médiane',
    Object.keys(places).length >= 4 && mediane / total < 0.6, JSON.stringify(places));

  /* LA GRILLE MONTRÉE EST LA GRILLE QUI ACCROCHE. Un quadrillage décoratif,
     ou d’un autre pas que celui de l’accroche, tromperait l’enfant sur les
     traits qu’il peut poser. */
  const quadrillage = await page.evaluate(() => {
    const xs = [...document.querySelectorAll('#figure line.maille')]
      .filter(l => l.getAttribute('x1') === l.getAttribute('x2'))
      .map(l => +l.getAttribute('x1')).sort((a, b) => a - b);
    const ys = [...document.querySelectorAll('#figure line.maille')]
      .filter(l => l.getAttribute('y1') === l.getAttribute('y2'))
      .map(l => +l.getAttribute('y1')).sort((a, b) => a - b);
    const attendu = [];
    for (let v = NOEUD_MIN; v <= NOEUD_MAX; v += PAS_GRILLE) attendu.push(v);
    return {xs:xs.join(), ys:ys.join(), attendu:attendu.join()};
  });
  T('le quadrillage affiché est exactement celui de l’accroche',
    quadrillage.xs === quadrillage.attendu && quadrillage.ys === quadrillage.attendu,
    quadrillage.xs || '(aucun)');

  /* Un geste sans direction n’est pas une droite : on redemande. */
  await poser('le cœur');
  await page.evaluate(() => {
    const svg = document.getElementById('figure');
    const env = (type, p) => {
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = p[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:2, bubbles:true}));
    };
    env('pointerdown', [50,50]);
    for (let i = 0; i <= 20; i++) { const a = 2*Math.PI*i/20;
      env('pointermove', [50 + 6*Math.cos(a), 50 + 6*Math.sin(a)]); }
    env('pointerup', [56,50]);
  });
  const gribouillis = await page.evaluate(() => ({ligne:ligne1, msg:document.getElementById('feedback').textContent}));
  T('un gribouillis rond ne devient pas une droite au hasard',
    gribouillis.ligne === null && /droit/.test(gribouillis.msg), gribouillis.msg);

  /* ================= LE VERDICT ================= */
  const verdicts = await page.evaluate(() => {
    const res = [];
    const essai = (nom, deg, decal) => {
      const f = FIGURES1.find(x => x.nom === nom);
      const L = f._axes[0];
      const a = Math.atan2(L.d[1], L.d[0]) + deg * Math.PI/180;
      const d = [Math.cos(a), Math.sin(a)];
      const p = [L.p[0] + decal*d[1], L.p[1] - decal*d[0]];
      res.push({nom, deg, decal, err:+erreurDeSymetrie(f, droite(p, d)).toFixed(4),
                tol:+toleranceDe(f).toFixed(4)});
    };
    ['le cœur','le carreau','la lettre B'].forEach(n => {
      essai(n, 0, 0); essai(n, 1, 0); essai(n, 0, 1); essai(n, 3, 0); essai(n, 0, 3);
    });
    /* La MEILLEURE droite possible sur le piège du module. */
    const par = FIGURES1.find(x => x.nom === 'le parallélogramme');
    const c = centreDe(sommetsDe(par));
    let best = Infinity;
    for (let d = 0; d < 180; d += 0.5) { const a = d*Math.PI/180;
      for (let off = -12; off <= 12; off += 1) {
        best = Math.min(best, erreurDeSymetrie(par,
          droite([c[0]+off*Math.sin(a), c[1]-off*Math.cos(a)], [Math.cos(a), Math.sin(a)]))); } }
    return {res, piege:+best.toFixed(3), tolPiege:+toleranceDe(par).toFixed(4),
            /* Le critère n’est plus un chiffre posé : c’est l’épaisseur du
               trait. On le relit ici pour l’afficher dans le compte rendu. */
            epaisseur:EPAISSEUR_TRAIT};
  });
  const pris = (deg, decal) => verdicts.res.filter(r => r.deg === deg && r.decal === decal);
  T('l’axe exact est accepté', pris(0,0).every(r => r.err <= r.tol), 0);
  T('1° de travers passe encore', pris(1,0).every(r => r.err <= r.tol),
    pris(1,0).map(r => r.err + '≤' + r.tol).join(' '));
  T('1 unité de décalage passe encore', pris(0,1).every(r => r.err <= r.tol),
    pris(0,1).map(r => r.err + '≤' + r.tol).join(' '));
  T('3° de travers sont refusés', pris(3,0).every(r => r.err > r.tol),
    pris(3,0).map(r => r.err + '>' + r.tol).join(' '));
  T('3 unités de décalage sont refusées', pris(0,3).every(r => r.err > r.tol),
    pris(0,3).map(r => r.err + '>' + r.tol).join(' '));
  /* CE QUI EST ACCEPTÉ DOIT SE SUPERPOSER À L’ŒIL : le décalage produit au
     report, mesuré en unités de figure, ne doit pas dépasser l’épaisseur du
     trait. C’est la définition même de la tolérance — on vérifie qu’elle
     tient, plutôt que de la croire sur parole. */
  const auPire = await page.evaluate(() => {
    let pire = 0;
    FIGURES1.filter(f => f._axes.length > 0).forEach(f => {
      const L = f._axes[0];
      for (let deg = 0; deg < 3; deg += 0.1) {
        const a = Math.atan2(L.d[1], L.d[0]) + deg*Math.PI/180;
        const D = droite(L.p, [Math.cos(a), Math.sin(a)]);
        if (erreurDeSymetrie(f, D) > toleranceDe(f)) continue;
        /* décalage réel, en unités, du point le plus déplacé */
        f.prims.forEach(u => [u[1], u[2]].forEach(p => {
          const q = refletPoint(p, D);
          let d0 = Infinity;
          f.prims.forEach(v => [v[1], v[2]].forEach(w =>
            { d0 = Math.min(d0, Math.hypot(q[0]-w[0], q[1]-w[1])); }));
          pire = Math.max(pire, d0);
        }));
      }
    });
    return {pire:+pire.toFixed(2), epaisseur:EPAISSEUR_TRAIT};
  });
  T('tout axe accepté se superpose à l’épaisseur du trait près',
    auPire.pire <= auPire.epaisseur + 1e-6,
    auPire.pire + ' unité(s) de décalage pour un trait de ' + auPire.epaisseur);
  /* RÈGLE DE CONTENU, et pas seulement de code : une figure « sans axe »
     qui serait PRESQUE symétrique est un piège déloyal — l’enfant y verrait
     un axe, le jeu lui dirait non, et il aurait raison contre le jeu. On
     cherche donc, pour chacune des sept, la MEILLEURE droite possible, et
     l’on exige qu’elle reste nettement au-dessus de la tolérance. C’est ce
     contrôle qui a écarté un parallélogramme trop peu penché, à peine
     distinguable d’un losange (0,017 — soit un cinquième de la tolérance). */
  const marges = await page.evaluate(() => FIGURES1.filter(f => f._axes.length === 0).map(f => {
    const c = centreDe(sommetsDe(f));
    let best = Infinity;
    for (let d = 0; d < 180; d += 0.5) { const a = d*Math.PI/180;
      for (let off = -16; off <= 16; off += 0.5) {
        best = Math.min(best, erreurDeSymetrie(f,
          droite([c[0]+off*Math.sin(a), c[1]-off*Math.cos(a)], [Math.cos(a), Math.sin(a)]))); } }
    return {nom:f.nom, marge:+(best / toleranceDe(f)).toFixed(1)};
  }));
  T('aucune figure « sans axe » n’est presque symétrique',
    marges.every(m => m.marge >= 4),
    marges.map(m => m.nom.replace(/^(la|le) /, '') + ' ' + m.marge + '×').join(', '));

  /* ================= « AUCUN AXE » ================= */
  await poser('la lettre N');
  await page.click('#b1Aucun');
  const aucunJuste = await page.evaluate(() => ({pts:file[pos]._points, ok:file[pos]._ok,
    msg:document.getElementById('feedback').textContent,
    vrais:document.querySelectorAll('#figure .axe-vrai').length}));
  T('« aucun axe » sur une figure sans axe : juste',
    aucunJuste.pts === 2 && aucunJuste.ok === true, aucunJuste);
  await poser('le cœur');
  await page.click('#b1Aucun');
  const aucunFaux = await page.evaluate(() => ({pts:file[pos]._points,
    vrais:document.querySelectorAll('#figure .axe-vrai').length,
    msg:document.getElementById('feedback').textContent}));
  T('« aucun axe » sur une figure qui en a un : faux',
    aucunFaux.pts === 0, aucunFaux.pts);
  T('§18 : l’axe réel est montré après l’erreur', aucunFaux.vrais === 1, aucunFaux);

  /* ================= LE CALQUE ================= */
  await poser('le cœur');
  await tracer([50, 6], [50, 94], 0);
  await page.click('#b1Verifier');
  const calqueAvant = await page.evaluate(() => {
    const c = document.getElementById('calque'), l = c.querySelector('line');
    return {etape:etape1, morceaux:morceaux1.length, vus:morceaux1.filter(m => m.vu).length,
      guides:c.querySelectorAll('.guide').length, reveles:c.querySelectorAll('.revele').length,
      /* ÊTRE DANS LE DOM N’EST PAS ÊTRE À L’ÉCRAN : on lit le `display`
         calculé et la taille réelle d’un trait. Un contrôle qui comptait
         seulement les éléments n’a pas vu que le calque restait masqué. */
      affiche:getComputedStyle(c).display,
      /* Un trait seul peut être vertical, donc large de zéro : on mesure
         l’étendue de TOUT le contour. */
      etendue:(() => {
        const r = [...c.querySelectorAll('line')].map(e => e.getBoundingClientRect());
        if (!r.length) return 0;
        return Math.min(Math.max(...r.map(b2 => b2.x + b2.width)) - Math.min(...r.map(b2 => b2.x)),
                        Math.max(...r.map(b2 => b2.y + b2.height)) - Math.min(...r.map(b2 => b2.y)));
      })()};
  });
  T('le calque s’ouvre avec le contour en attente',
    calqueAvant.etape === 'calque' && calqueAvant.guides > 20 && calqueAvant.reveles === 0, calqueAvant);
  T('et il est réellement visible à l’écran',
    calqueAvant.affiche === 'block' && calqueAvant.etendue > 40,
    calqueAvant.affiche + ', contour de ' + calqueAvant.etendue.toFixed(0) + ' px');
  /* LE DOIGT RÉVÈLE, IL NE DESSINE PAS : on balaie n’importe comment — un
     va-et-vient grossier — et ce qui s’inscrit est le contour IDÉAL, au
     morceau près, jamais la trajectoire suivie. */
  const balayage = await page.evaluate(async () => {
    const svg = document.getElementById('figure');
    const env = (type, p) => {
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = p[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:3, bubbles:true}));
    };
    /* On suit les morceaux dans leur ordre, mais en s’en écartant de
       plusieurs unités — la main d’un enfant, pas un traceur. */
    const cible = morceaux1.map(m => [(m.s[1][0]+m.s[2][0])/2, (m.s[1][1]+m.s[2][1])/2]);
    env('pointerdown', cible[0]);
    cible.forEach((c, i) => env('pointermove', [c[0] + Math.sin(i)*3.5, c[1] + Math.cos(i*1.7)*3.5]));
    env('pointerup', cible[cible.length-1]);
    await new Promise(r => setTimeout(r, 60));
    /* Le contour idéal est RECALCULÉ ici, à partir de la figure et de la
       droite tracée — et non relu dans `morceaux1`, que la révélation vient
       de manipuler. Comparer l’affichage à l’état qui l’a produit ne dirait
       rien : les deux porteraient la même erreur. */
    const ideal = decouperEnMorceaux(demiFigure(file[pos].fig, ligne1));
    return {etape:etape1, restants:morceaux1.filter(m => !m.vu).length,
            axe:[+ligne1.d[0].toFixed(4), +ligne1.d[1].toFixed(4)],
            axeIntact:Math.abs(Math.abs(ligne1.d[1]) - 1) < 1e-3,
            inscrits:[...document.querySelectorAll('#calque .revele')].map(l =>
              [+l.getAttribute('x1'), +l.getAttribute('y1'), +l.getAttribute('x2'), +l.getAttribute('y2')]),
            attendus:ideal.map(m => [m.s[1][0], m.s[1][1], m.s[2][0], m.s[2][1]])};
  });
  T('un balayage approximatif révèle tout le contour', balayage.restants === 0, balayage.restants + ' morceaux oubliés');
  T('ce qui s’inscrit est le contour IDÉAL, pas la trajectoire du doigt',
    balayage.inscrits.length === balayage.attendus.length
    && balayage.inscrits.every((s, i) => s.every((v, k) => Math.abs(v - balayage.attendus[i][k]) < 1e-9)),
    balayage.inscrits.length + ' morceaux');
  T('le contour parcouru en entier fait basculer le calque', balayage.etape === 'verdict');
  /* La bascule se déclenche SOUS LE DOIGT, au milieu du balayage : la fin du
     même geste ne doit pas être relue comme un tracé d’axe. */
  T('la fin du balayage ne remplace pas l’axe de l’enfant',
    balayage.axeIntact, JSON.stringify(balayage.axe));

  /* LA MOITIÉ EST DÉCOUPÉE PAR LA DROITE DE L’ENFANT, pas par l’axe vrai —
     sans quoi le calque confirmerait un axe faux au lieu de le démentir. */
  const decoupe = await page.evaluate(() => {
    const f = FIGURES1.find(x => x.nom === 'le cœur');
    const vrai = f._axes[0];
    const a = Math.atan2(vrai.d[1], vrai.d[0]) + 20*Math.PI/180;
    const penchee = droite(vrai.p, [Math.cos(a), Math.sin(a)]);
    const A = decouperEnMorceaux(demiFigure(f, vrai));
    const B = decouperEnMorceaux(demiFigure(f, penchee));
    const memes = A.length === B.length && A.every((m, i) =>
      Math.abs(m.s[1][0]-B[i].s[1][0]) < 1e-9 && Math.abs(m.s[1][1]-B[i].s[1][1]) < 1e-9);
    return {nA:A.length, nB:B.length, memes};
  });
  T('la moitié à repasser suit la droite tracée, pas l’axe vrai (calcul)',
    !decoupe.memes, JSON.stringify(decoupe));
  /* Et sur le vrai chemin du jeu : on trace penché, on ouvre le calque, et
     ce qu’il contient doit venir de LA DROITE TRACÉE. */
  await poser('le cœur');
  await tracer([34, 6], [66, 94], 0);
  await page.click('#b1Verifier');
  const suitLeTrait = await page.evaluate(() => {
    const f = file[pos].fig;
    const mesure = (L) => {
      const m = decouperEnMorceaux(demiFigure(f, L));
      return m.length + ':' + m.map(x => x.s[1][0].toFixed(2)).join(',');
    };
    const rendu = morceaux1.length + ':' + morceaux1.map(x => x.s[1][0].toFixed(2)).join(',');
    return {commeTrace: rendu === mesure(ligne1), commeAxeVrai: rendu === mesure(f._axes[0])};
  });
  T('le calque ouvert découpe selon la droite tracée',
    suitLeTrait.commeTrace && !suitLeTrait.commeAxeVrai, JSON.stringify(suitLeTrait));

  /* LA BASCULE : on ne lit pas ce qui est DÉCLARÉ, on mesure OÙ LE CALQUE
     ARRIVE. Le demi-tour autour d’une droite est une réflexion : la moitié
     révélée doit se retrouver exactement à l’image miroir d’elle-même par
     la droite de l’enfant. On compare donc la boîte du calque retourné à
     celle que donne le calcul de la réflexion — lire `transform-origin`
     n’aurait prouvé qu’une écriture. */
  await poser('le cœur');
  /* Trait DÉCENTRÉ à dessein : sur une droite passant par le milieu de la
     scène, une origine posée bêtement au centre tomberait juste par
     accident, et le contrôle ne prouverait rien. */
  await tracer([16, 6], [44, 94], 0);
  await page.click('#b1Verifier');
  const bascule = await page.evaluate(async () => {
    morceaux1.forEach(m => { m.vu = true; });
    rendreCalque(); basculerCalque();
    /* La position à l’écran d’un point de figure, calque non transformé. */
    const svg = document.getElementById('figure');
    const ecran = (p) => {
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = p[1];
      const e = pt.matrixTransform(m);
      return [e.x, e.y];
    };
    const bouts = [];
    morceaux1.forEach(m => { bouts.push(refletPoint(m.s[1], ligne1), refletPoint(m.s[2], ligne1)); });
    const xs = bouts.map(p => ecran(p)[0]), ys = bouts.map(p => ecran(p)[1]);
    const attendue = {x:Math.min(...xs), y:Math.min(...ys),
                      X:Math.max(...xs), Y:Math.max(...ys)};
    await new Promise(r => setTimeout(r, 1400));      // la bascule se termine et tient
    const c = document.getElementById('calque');
    const st = getComputedStyle(c);
    /* On mesure LE CONTENU, pas la boîte du calque : l’élément `<svg>` est
       un rectangle plein page, et son rectangle englobant retourné ne dit
       rien de l’endroit où les traits atterrissent. Les `<line>` filles,
       elles, portent la transformation de leur ancêtre. */
    const rr = [...c.querySelectorAll('line')].map(l => l.getBoundingClientRect());
    const posee = {x:Math.min(...rr.map(r => r.x)), y:Math.min(...rr.map(r => r.y)),
                   X:Math.max(...rr.map(r => r.x + r.width)), Y:Math.max(...rr.map(r => r.y + r.height))};
    /* Le trait a une épaisseur : la boîte mesurée déborde de la moitié de
       part et d’autre. On la retire avant de comparer. */
    const demi = 2.5;
    return {anim:st.animationName,
      ax:+c.style.getPropertyValue('--ax'), ay:+c.style.getPropertyValue('--ay'),
      dx:ligne1.d[0], dy:ligne1.d[1],
      ecart:Math.max(
        Math.abs(posee.x + demi - attendue.x), Math.abs(posee.y + demi - attendue.y),
        Math.abs(posee.X - demi - attendue.X), Math.abs(posee.Y - demi - attendue.Y))};
  });
  T('la bascule tourne autour de la droite tracée (axe de rotation)',
    bascule.anim === 'basculer-calque'
    && Math.abs(bascule.ax - bascule.dx) < 1e-6 && Math.abs(bascule.ay - bascule.dy) < 1e-6,
    'axe (' + bascule.ax.toFixed(3) + ', ' + bascule.ay.toFixed(3) + ')');
  T('et la moitié retournée atterrit à l’image miroir d’elle-même',
    bascule.ecart < 3, bascule.ecart.toFixed(2) + ' px d’écart');

  /* ================= REFAIRE SON TRAIT =================
     Le trait doit pouvoir se défaire AVANT le test au calque, et sans avoir
     à deviner qu’un second geste remplace le premier. */
  await poser('le cœur');
  const avantTrait = await page.evaluate(() =>
    [...document.querySelectorAll('#actions1 button')].map(b => b.id + (b.disabled ? '/inactif' : '')));
  await tracer([50, 6], [50, 94], 0);
  const avecTrait = await page.evaluate(() => ({
    boutons:[...document.querySelectorAll('#actions1 button')].map(b => b.id + (b.disabled ? '/inactif' : '')),
    axes:document.querySelectorAll('#figure .axe-trace').length
  }));
  await page.click('#b1Effacer');
  const efface = await page.evaluate(() => ({
    ligne:ligne1, etape:etape1,
    axes:document.querySelectorAll('#figure .axe-trace').length,
    boutons:[...document.querySelectorAll('#actions1 button')].map(b => b.id + (b.disabled ? '/inactif' : ''))
  }));
  T('sans trait : « aucun axe », et le calque est hors d’atteinte',
    avantTrait.join() === 'b1Aucun,b1Verifier/inactif', avantTrait.join());
  T('dès qu’un trait est posé, on peut l’effacer et vérifier',
    avecTrait.boutons.join() === 'b1Effacer,b1Verifier' && avecTrait.axes === 1, avecTrait);
  T('effacer retire le trait et rend la manche à son début',
    efface.ligne === null && efface.etape === 'tracer' && efface.axes === 0
    && efface.boutons.join() === 'b1Aucun,b1Verifier/inactif', efface);
  /* Et un nouveau trait reste possible après effacement. */
  await tracer([40, 6], [60, 94], 0);
  const retrace = await page.evaluate(() => ligne1 !== null);
  T('et l’on peut retracer aussitôt', retrace);

  /* ================= LE BALAYAGE NE SE REDEMANDE PAS =================
     Ajuster son axe est ce que le calque demande ; refaire le tour du
     contour à chaque essai ne le punirait que d’avoir ajusté. */
  await poser('le cœur');
  await tracer([44, 6], [56, 94], 0);
  await page.click('#b1Verifier');
  const premierPassage = await page.evaluate(() => ({
    etape:etape1, aRevekler:morceaux1.filter(m => !m.vu).length}));
  await page.evaluate(async () => {
    const svg = document.getElementById('figure');
    const env = (t, p) => { const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = p[1]; const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(t, {clientX:e.x, clientY:e.y, pointerId:9, bubbles:true})); };
    const c = morceaux1.map(m => [(m.s[1][0]+m.s[2][0])/2, (m.s[1][1]+m.s[2][1])/2]);
    env('pointerdown', c[0]); c.forEach(p => env('pointermove', p)); env('pointerup', c[c.length-1]);
    await new Promise(r => setTimeout(r, 50));
  });
  await page.click('#b1Recommencer');
  await tracer([50, 6], [50, 94], 0);
  await page.click('#b1Verifier');
  await page.waitForTimeout(120);
  const secondPassage = await page.evaluate(() => ({
    etape:etape1, aReveler:morceaux1.filter(m => !m.vu).length}));
  await page.waitForTimeout(1400);
  const apresRetour = await page.evaluate(() => { desarmerAutoSuivant(); return etape1; });
  T('au premier essai, le contour est à repasser', premierPassage.aRevekler > 20, premierPassage);
  T('au second essai sur la même figure, il est déjà repassé',
    secondPassage.aReveler === 0, secondPassage);
  T('et la bascule s’enchaîne d’elle-même', apresRetour === 'verdict', apresRetour);

  /* ================= LE STOP ET SES QUATRE AXES =================
     Une figure à plus de deux axes ne se traite pas comme les autres : lui
     faire dire « aucun autre axe » après deux serait un piège, et lui faire
     tracer les quatre ferait durer la manche cinq fois plus. On s’en tient
     au minimum, et on le dit. */
  await centrer('le panneau stop');
  const stop = await page.evaluate(() => {
    const f = file[pos].fig, res = {axes:f._axes.length};
    ligne1 = f._axes[0]; etape1 = 'tracer'; verdict1(false);
    res.apresLePremier = {pts:file[pos]._points, fini:mancheFinie,
      consigne:document.getElementById('qText').textContent,
      boutons:[...document.querySelectorAll('#actions1 button')].map(b => b.id)};
    ligne1 = f._axes[1]; etape1 = 'tracer'; verdict1(false);
    res.apresLeSecond = {pts:file[pos]._points, ok:file[pos]._ok, fini:mancheFinie};
    return res;
  });
  T('le panneau stop a bien quatre axes', stop.axes === 4, stop.axes);
  T('on lui demande deux axes, et la manche s’arrête là',
    stop.apresLeSecond.pts === 2 && stop.apresLeSecond.ok === true && stop.apresLeSecond.fini === true,
    stop.apresLeSecond);
  T('la consigne annonce qu’il y en a plusieurs',
    /plusieurs axes/i.test(stop.apresLePremier.consigne), stop.apresLePremier.consigne);
  T('et le bouton « aucun autre axe » disparaît, puisqu’il serait faux',
    stop.apresLePremier.boutons.indexOf('b1Aucun') === -1, stop.apresLePremier.boutons.join(','));
  /* Les figures à un ou deux axes, elles, gardent la question ouverte. */
  await centrer('le rectangle');
  const deuxAxesGardent = await page.evaluate(() => {
    const f = file[pos].fig;
    ligne1 = f._axes[0]; etape1 = 'tracer'; verdict1(false);
    return {consigne:document.getElementById('qText').textContent,
      boutons:[...document.querySelectorAll('#actions1 button')].map(b => b.id)};
  });
  T('une figure à deux axes garde « Aucun autre axe » et la question ouverte',
    deuxAxesGardent.boutons.indexOf('b1Aucun') !== -1
    && !/plusieurs axes/i.test(deuxAxesGardent.consigne), deuxAxesGardent);

  /* ================= LE CALQUE NE S’OUVRE JAMAIS SUR LE VIDE =================
     Une droite qui passe à côté de la figure ne découpe aucune moitié : le
     calque s’ouvrait alors sur un contour inexistant, sans rien à révéler
     donc sans bascule, et la manche n’avait plus d’issue que « Passer ».
     Relevé à l’essai sur la lettre A ; toutes les figures en avaient. */
  await centrer('la lettre A');
  await tracer([90, 4], [90, 96], 0);
  const aCoteDeLaFigure = await page.evaluate(() => {
    const avant = etape1;
    document.getElementById('b1Verifier').click();
    return {avant, apres:etape1, morceaux:morceaux1.length,
      msg:document.getElementById('feedback').textContent,
      calque:getComputedStyle(document.getElementById('calque')).display};
  });
  T('un trait à côté de la figure n’ouvre pas le calque',
    aCoteDeLaFigure.apres === 'tracer' && aCoteDeLaFigure.calque === 'none', aCoteDeLaFigure);
  T('et l’enfant sait pourquoi', /traverser|en travers|à côté/i.test(aCoteDeLaFigure.msg),
    aCoteDeLaFigure.msg);

  /* L’autre bord : la figure entièrement d’un seul côté du trait. La moitié
     à repasser ne serait pas vide — ce serait la figure entière —, mais le
     rabat la poserait là où il n’y a rien, et une telle droite ne peut pas
     davantage être un axe. Les deux bords se refusent donc pareillement. */
  await centrer('la lettre A');
  await tracer([10, 4], [10, 96], 0);
  const deLautreBord = await page.evaluate(() => {
    document.getElementById('b1Verifier').click();
    return {etape:etape1, msg:document.getElementById('feedback').textContent,
      cotePlein:demiFigure(file[pos].fig, ligne1).length,
      coteVide:demiFigure(file[pos].fig, droite(ligne1.p, [-ligne1.d[0], -ligne1.d[1]])).length};
  });
  T('la figure entièrement d’un côté du trait : refusé aussi',
    deLautreBord.etape === 'tracer' && deLautreBord.cotePlein > 0 && deLautreBord.coteVide === 0,
    deLautreBord);

  /* La propriété, sur tout le stock : jamais de calque vide. On passe en
     revue toutes les droites qu’un enfant peut tracer d’un bord à l’autre,
     pour chaque figure et chaque position. */
  const jamaisVide = await page.evaluate(() => {
    let refuses = 0, ouverts = 0, vides = 0;
    FIGURES1.forEach(f => f._decalages.forEach(d => {
      const g = poserFigure(f, d);
      for (let x1 = NOEUD_MIN; x1 <= NOEUD_MAX; x1 += PAS_GRILLE)
        for (let x2 = NOEUD_MIN; x2 <= NOEUD_MAX; x2 += PAS_GRILLE) {
          const L = droite([x1, NOEUD_MIN], [x2 - x1, NOEUD_MAX - NOEUD_MIN]);
          if (!traverseLaFigure(g, L)) { refuses++; continue; }
          ouverts++;
          if (decouperEnMorceaux(demiFigure(g, L)).length === 0) vides++;
        }
    }));
    return {refuses, ouverts, vides};
  });
  T('aucune droite acceptée n’ouvre un calque vide',
    jamaisVide.vides === 0 && jamaisVide.refuses > 0,
    jamaisVide.ouverts + ' acceptées, ' + jamaisVide.refuses + ' refusées, ' + jamaisVide.vides + ' vides');

  /* Et le garde-fou ne peut pas refuser une bonne réponse. */
  const axesTraversent = await page.evaluate(() => {
    const hors = [];
    FIGURES1.forEach(f => f._decalages.forEach(d => {
      const g = poserFigure(f, d);
      g._axes.forEach(L => { if (!traverseLaFigure(g, L)) hors.push(f.nom); });
    }));
    return hors;
  });
  T('tout axe vrai traverse sa figure : le garde-fou ne bloque aucune bonne réponse',
    axesTraversent.length === 0, axesTraversent.join(', ') || 'toutes positions comprises');

  /* ================= DEUX AXES : « UN ET NON L’AXE » ================= */
  await poser('le rectangle');
  const deuxAxes = await page.evaluate(async () => {
    const f = file[pos].fig, res = {};
    const poserDroite = (L) => { ligne1 = L; etape1 = 'tracer'; };
    poserDroite(f._axes[0]); verdict1(false);
    res.apresPremier = {pts:file[pos]._points, etape:etape1, fini:mancheFinie,
      consigne:document.getElementById('qText').textContent};
    /* Le même axe redit autrement ne compte pas une seconde fois. */
    poserDroite(droite([f._axes[0].p[0]+1, f._axes[0].p[1]], f._axes[0].d)); verdict1(false);
    res.memeAxe = {pts:file[pos]._points, fini:mancheFinie};
    return res;
  });
  T('un premier axe juste ne clôt pas la manche sur une figure qui en a deux',
    deuxAxes.apresPremier.pts === 1 && deuxAxes.apresPremier.fini === false, deuxAxes.apresPremier.pts);
  /* La consigne POSE LA QUESTION sans y répondre : elle ne peut pas
     annoncer un deuxième axe, puisque la même question est posée aux
     figures qui n’en ont qu’un. */
  T('et la consigne demande s’il y en a un autre, sans le dire',
    /autre axe/i.test(deuxAxes.apresPremier.consigne)
    && !/deuxième axe/i.test(deuxAxes.apresPremier.consigne),
    deuxAxes.apresPremier.consigne);
  T('le même axe retracé ne compte pas deux fois', deuxAxes.memeAxe.pts === 1, deuxAxes.memeAxe);

  /* LE SECOND TEMPS EST POSÉ À TOUTE FIGURE QUI A UN AXE, pas seulement à
     celles qui en ont deux : sinon, entendre la question vaudrait réponse,
     et l’enfant apprendrait le signal au lieu de la géométrie. */
  await poser('le cœur');
  const unSeulAxe = await page.evaluate(() => {
    const f = file[pos].fig, res = {};
    ligne1 = f._axes[0]; etape1 = 'tracer'; verdict1(false);
    res.apresLAxe = {pts:file[pos]._points, fini:mancheFinie, etape:etape1,
      bouton:(document.getElementById('b1Aucun') || {}).textContent,
      consigne:document.getElementById('qText').textContent,
      aBalayer:dejaBalaye};
    verdict1(true);                       // « aucun autre axe » : c’est juste
    res.apres = {pts:file[pos]._points, ok:file[pos]._ok, fini:mancheFinie};
    return res;
  });
  T('sur une figure à UN axe, la manche demande aussi s’il y en a un autre',
    unSeulAxe.apresLAxe.fini === false && unSeulAxe.apresLAxe.pts === 1, unSeulAxe.apresLAxe.pts);
  T('la question ne donne pas la réponse',
    /y en a-t-il un autre|Y a-t-il un autre/i.test(unSeulAxe.apresLAxe.consigne)
    && !/deuxième axe|il y en a un autre\b/i.test(unSeulAxe.apresLAxe.consigne),
    unSeulAxe.apresLAxe.consigne);
  T('le bouton devient « Aucun autre axe »',
    unSeulAxe.apresLAxe.bouton === 'Aucun autre axe', unSeulAxe.apresLAxe.bouton);
  T('« aucun autre axe » achève alors la manche',
    unSeulAxe.apres.pts === 2 && unSeulAxe.apres.ok === true && unSeulAxe.apres.fini === true,
    unSeulAxe.apres);

  /* Et sur une figure à DEUX axes, la même réponse est fausse. */
  await poser('le rectangle');
  const deuxMaisNie = await page.evaluate(() => {
    const f = file[pos].fig;
    ligne1 = f._axes[0]; etape1 = 'tracer'; verdict1(false);
    verdict1(true);
    return {pts:file[pos]._points, ok:file[pos]._ok,
      msg:document.getElementById('feedback').textContent,
      vrais:document.querySelectorAll('#figure .axe-vrai').length};
  });
  T('« aucun autre axe » est faux quand il y en a bien un autre',
    deuxMaisNie.pts === 1 && deuxMaisNie.ok === false, deuxMaisNie);
  T('§18 : les axes réels sont alors montrés', deuxMaisNie.vrais === 2, deuxMaisNie.vrais);

  /* LE CALQUE SE REFAIT POUR LE SECOND AXE : c’est une vérification
     nouvelle, sur une autre moitié. Le balayage n’était sauté que pour ne
     pas punir l’enfant qui AJUSTE le même trait. */
  await poser('le rectangle');
  const balayageSecond = await page.evaluate(() => {
    const f = file[pos].fig, res = {};
    ligne1 = f._axes[0]; etape1 = 'tracer';
    ouvrirCalque();
    morceaux1.forEach(m => { m.vu = true; });
    res.premierBalaye = dejaBalaye;       // pas encore : posé par le balayage réel
    dejaBalaye = true;                    // on simule un premier tour complet
    verdict1(false);
    res.apresLePremierAxe = dejaBalaye;
    ligne1 = f._axes[1]; etape1 = 'tracer';
    ouvrirCalque();
    res.aRepasser = morceaux1.filter(m => !m.vu).length;
    return res;
  });
  T('le calque redemande le tracé pour le second axe',
    balayageSecond.apresLePremierAxe === false && balayageSecond.aRepasser > 10,
    balayageSecond.aRepasser + ' morceaux à repasser');

  await poser('le rectangle');
  const lesDeux = await page.evaluate(async () => {
    const f = file[pos].fig;
    ligne1 = f._axes[0]; etape1 = 'tracer'; verdict1(false);
    ligne1 = f._axes[1]; etape1 = 'tracer'; verdict1(false);
    return {pts:file[pos]._points, ok:file[pos]._ok, fini:mancheFinie};
  });
  T('les deux axes trouvés valent la manche entière',
    lesDeux.pts === 2 && lesDeux.ok === true && lesDeux.fini === true, lesDeux);

  /* ================= SORTIE DE MANCHE ET §18 ================= */
  await poser('le carreau');
  await page.click('#btnPasser');
  const passee = await page.evaluate(() => ({ok:file[pos]._ok, pts:file[pos]._points,
    vrais:document.querySelectorAll('#figure .axe-vrai').length,
    suivant:document.getElementById('btnNext').style.display}));
  T('une sortie de manche existe', passee.ok === false && passee.suivant === 'block', passee);
  T('§18 : passer montre les deux axes de la figure', passee.vrais === 2, passee.vrais);

  /* ================= §13 bis SUR CHAQUE STOCK ================= */
  const tirages1 = await page.evaluate(() => {
    const res = {doublons:0, suite:0, N:200};
    let dernierParStock = {};
    for (let n = 0; n < res.N; n++) {
      const f = engendrerFile1(jeu('ce2-symetrie-reconnaitre')).map(q => q.fig.nom);
      if (new Set(f).size !== f.length) res.doublons++;
    }
    /* La règle « jamais deux fois de suite » vaut PAR STOCK : c’est là que
       le tirage sans remise opère, l’ordre des six étant ensuite mélangé. */
    const suites = {};
    [0,1,2].forEach(a => {
      const stock = FIGURES1.filter(f => f._axes.length === a);
      let prec = null, mal = 0;
      for (let n = 0; n < 300; n++) {
        tirerSansRepetition('audit-' + a, stock, 1).forEach(f => {
          if (f === prec) mal++;
          prec = f;
        });
      }
      suites[a] = mal;
    });
    return {res, suites};
  });
  T('§13 bis : jamais deux fois la même figure dans une partie',
    tirages1.res.doublons === 0, tirages1.res.doublons);
  T('§13 bis : ni deux fois de suite, dans chacun des trois stocks',
    Object.values(tirages1.suites).every(v => v === 0), JSON.stringify(tirages1.suites));

  /* ================= PARTIE COMPLÈTE, SCORE ET SESSION ================= */
  await aller('ce2-symetrie-reconnaitre');
  await page.evaluate(() => localStorage.setItem('mayeutik-sessions', '[]'));
  for (let m = 0; m < 6; m++) {
    await page.evaluate(() => {
      desarmerAutoSuivant();
      const f = file[pos].fig;
      if (f._axes.length === 0) { verdict1(true); }
      else {
        f._axes.forEach(L => { ligne1 = L; etape1 = 'tracer'; verdict1(false); });
        /* Tous les axes tracés, reste à dire qu’il n’y en a pas d’autre. */
        if (!mancheFinie) verdict1(true);
      }
    });
    await page.waitForTimeout(60);
    await page.evaluate(() => { desarmerAutoSuivant();
      const b = document.getElementById('btnNext');
      if (b.style.display !== 'none') b.click(); });
    await page.waitForTimeout(120);
  }
  const fin1 = await page.evaluate(() => ({fin:!document.getElementById('end').hidden,
    etoiles:document.getElementById('endStars').textContent.trim().length,
    session:JSON.parse(localStorage.getItem('mayeutik-sessions')).pop()}));
  T('partie parfaite : écran de fin et 3 étoiles', fin1.fin && fin1.etoiles === 3, fin1);
  T('§11 session M41 enregistrée, 12/12',
    fin1.session && fin1.session.module === 'M41'
    && fin1.session.competence === 'ce2-symetrie-reconnaitre'
    && fin1.session.score === 12 && fin1.session.total === 12, fin1.session);

  console.log('\nErreurs JS/console/réseau : '  + (erreurs.length ? JSON.stringify(erreurs.slice(0,3)) : 'aucune'));
  console.log(`\n${ok} OK, ${ko} KO`);
  console.log(ko === 0 && erreurs.length === 0 ? 'EXIT:SUCCES' : 'EXIT:ECHEC');
  await nav.close(); srv.close();
})();
