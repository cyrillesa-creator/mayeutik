const http = require('http'), fs = require('fs'), path = require('path');
const socle = require('./socle.js');
const { chromium } = socle.chargerPlaywright();
const RACINE = socle.RACINE, JEU = '/jeux/M38-reproduire-construire.html';
let ok = 0, ko = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('OK   ' + n, d === undefined ? '' : d); }
  else { ko++; console.log('KO   ' + n, d === undefined ? '' : d); } };
const srv = http.createServer((q, r) => {
  const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, {'Content-Type':(p.endsWith('.js')?'text/javascript':'text/html') + '; charset=utf-8'}); r.end(d); });
});

/* Trace au doigt, sur la manche courante, un chemin donné en coordonnées de
   grille — ou la solution attendue si aucun chemin n’est fourni. */
async function tracerChemin(page, chemin){
  await page.evaluate(async (ch) => {
    const t = chantier.trace, svg = document.getElementById('scene');
    const env = (type, g) => {
      const sc = t.versScene(g), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = sc[0]; pt.y = sc[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:1, bubbles:true}));
    };
    const chemins = ch ? [ch] : file[pos].solutions[0].map(ct => {
      const c = ct.map(p => t.versGrille(p).map(Math.round)); c.push(c[0]); return c;
    });
    for (const c of chemins) {
      env('pointerdown', c[0]);
      for (let i = 0; i < c.length - 1; i++) {
        const a = c[i], b = c[i+1];
        const n = Math.max(1, Math.round(Math.max(Math.abs(b[0]-a[0]), Math.abs(b[1]-a[1])) * 6));
        for (let k = 1; k <= n; k++) env('pointermove', [a[0] + (b[0]-a[0])*k/n, a[1] + (b[1]-a[1])*k/n]);
      }
      env('pointerup', c[c.length - 1]);
      await new Promise(r => setTimeout(r, 40));
    }
  }, chemin || null);
  await page.waitForTimeout(50);
}

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
  const brutM41 = fs.readFileSync(RACINE + '/jeux/M41-symetrie.html', 'utf8');

  /* ---------- Le renvoi croisé (§4, mesure 1) ---------- */
  T('M38 renvoie à son jumeau et au document de décision',
    /jumeau[^]*?M41-symetrie\.html/i.test(brut.replace(/\n/g, ' '))
    && /CORRECTIONS-M38-moteur-quadrillage\.md/.test(brut), '');
  T('M41 renvoie à son jumeau et au même document',
    /jumeau[^]*?M38-reproduire-construire\.html/i.test(brutM41.replace(/\n/g, ' '))
    && /CORRECTIONS-M38-moteur-quadrillage\.md/.test(brutM41), '');

  /* Le moteur est installé sur la scène d’une manche quelconque : à ce
     stade AUCUN mini-jeu n’est converti, on éprouve le moteur seul. */
  const installer = (pre) => page.evaluate((p) => {
    const svg = document.getElementById('scene');
    let g = svg.getElementById('bancTrace');
    if (g) g.remove();
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', 'bancTrace');
    svg.appendChild(g);
    window.banc = creerTraceQuadrillage({svg, groupe:g, zone:ZONE_TRAVAIL, pre:p || []});
    return true;
  }, pre);
  /* Glisser le doigt en coordonnées de GRILLE, avec un tremblement donné. */
  const glisser = (a, b, tremble, n) => page.evaluate(([A, B, tr, N]) => {
    const svg = document.getElementById('scene'), z = banc.zone;
    const env = (type, g) => {
      const s = banc.versScene(g);
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = s[0]; pt.y = s[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:1, bubbles:true}));
    };
    const nx = -(B[1]-A[1]), ny = (B[0]-A[0]), L = Math.hypot(nx, ny) || 1;
    env('pointerdown', A);
    for (let i = 1; i <= (N || 24); i++) {
      const t = i / (N || 24), d = tr ? Math.sin(i * 2.3) * tr : 0;
      env('pointermove', [A[0] + t*(B[0]-A[0]) + d*nx/L, A[1] + t*(B[1]-A[1]) + d*ny/L]);
    }
    env('pointerup', B);
    return [...banc.traces].sort();
  }, [a, b, tremble || 0, n]);
  const taper = (g) => page.evaluate((G) => {
    const svg = document.getElementById('scene');
    const s = banc.versScene(G);
    const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = s[0]; pt.y = s[1];
    const e = pt.matrixTransform(m);
    ['pointerdown','pointerup'].forEach(t =>
      svg.dispatchEvent(new PointerEvent(t, {clientX:e.x, clientY:e.y, pointerId:2, bubbles:true})));
    return {traces:[...banc.traces].sort(), attente:banc.attente};
  }, g);

  await page.goto(base + '?competence=cp-reproduire');
  await page.waitForTimeout(600);
  await page.evaluate(() => desarmerAutoSuivant());

  /* ---------- 1. Un doigt qui dérive au milieu d’une cellule ne trace rien ---------- */
  await installer();
  const derive = await glisser([0.5, 0.5], [5.5, 0.5], 0);
  T('1. un doigt qui dérive au milieu d’une cellule ne trace rien',
    derive.length === 0, derive.length + ' segment(s)');

  /* ---------- 2. Le même geste tremblé donne le même trait ---------- */
  const rejeux = [];
  for (const tr of [0, 0.1, 0.2, 0.28]) {
    await installer();
    rejeux.push((await glisser([1, 2], [5, 2], tr)).join(' '));
  }
  T('2. le même geste tremblé de ±0,28 maille donne le même trait',
    new Set(rejeux).size === 1 && rejeux[0].split(' ').length === 4,
    rejeux[0] || '(rien)');

  /* ---------- 3. LE TRAIT SUIT LE CHEMIN DU DOIGT ----------
     LA PROPRIÉTÉ A CHANGÉ DE FORME, et c’est assumé : la règle des huit
     voisins interdisait les pas longs, ce qui fermait les obliques du CE1.
     Elle est remplacée par une garantie plus forte et plus simple à dire :
     UN SEGMENT NE S’ÉCRIT QUE LE LONG DU CHEMIN RÉELLEMENT PARCOURU. Un pas
     long est donc légitime — c’est une oblique — mais seulement si le doigt
     y est allé DROIT ; un chemin qui s’écarte n’écrit jamais le segment de
     ses deux bouts. */
  const cheminSuivi = await page.evaluate(async () => {
    const neuf = () => {
      const svg = document.getElementById('scene');
      let g = svg.getElementById('bancTrace'); if (g) g.remove();
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('id','bancTrace');
      svg.appendChild(g);
      window.banc = creerTraceQuadrillage({svg, groupe:g, zone:ZONE_TRAVAIL, pre:[]});
      return svg;
    };
    const geste = (chemin) => {
      const svg = neuf();
      const env = (type, gg) => {
        const s2 = banc.versScene(gg), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
        pt.x = s2[0]; pt.y = s2[1];
        const e = pt.matrixTransform(m);
        svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:3, bubbles:true}));
      };
      env('pointerdown', chemin[0]);
      for (let i = 0; i < chemin.length - 1; i++) {
        const a = chemin[i], b = chemin[i+1];
        const n = Math.max(6, Math.round(Math.hypot(b[0]-a[0], b[1]-a[1]) * 10));
        for (let k = 1; k <= n; k++) env('pointermove', [a[0]+(b[0]-a[0])*k/n, a[1]+(b[1]-a[1])*k/n]);
      }
      env('pointerup', chemin[chemin.length - 1]);
      return [...banc.traces];
    };
    const cle = (a, b) => cleSeg(a, b);
    return {
      /* Droit : l’oblique s’écrit d’un seul pas, quelle que soit sa pente. */
      obliques:[[[0,0],[5,2]], [[0,0],[4,3]], [[1,1],[6,4]], [[0,5],[5,0]]].map(([a,b]) => {
        const r = geste([a, b]);
        const att = [];
        const pg = (x,y) => y ? pg(y, x%y) : x;
        const g = pg(Math.abs(b[0]-a[0]), Math.abs(b[1]-a[1])) || 1;
        for (let k = 0; k < g; k++)
          att.push(cle([a[0]+(b[0]-a[0])/g*k, a[1]+(b[1]-a[1])/g*k],
                       [a[0]+(b[0]-a[0])/g*(k+1), a[1]+(b[1]-a[1])/g*(k+1)]));
        return {de:a.join(',')+'→'+b.join(','), ok:r.sort().join() === att.sort().join(), eu:r};
      }),
      /* Détourné : le segment des deux bouts ne doit JAMAIS apparaître. */
      enV: geste([[0,0], [2, 3], [5, 0]]).indexOf(cle([0,0],[5,0])) === -1,
      enL: geste([[0,0], [0, 3], [4, 3]]).indexOf(cle([0,0],[4,3])) === -1
    };
  });
  T('3. une oblique tracée droit s’écrit d’un seul trait, quelle que soit sa pente',
    cheminSuivi.obliques.every(o => o.ok),
    cheminSuivi.obliques.filter(o => !o.ok).map(o => o.de + ' → ' + o.eu).join(' | ') || 'quatre pentes');
  T('3. mais un chemin détourné n’écrit jamais le segment de ses deux bouts',
    cheminSuivi.enV === true && cheminSuivi.enL === true,
    JSON.stringify({enV:cheminSuivi.enV, enL:cheminSuivi.enL}));


  /* ---------- L’INVARIANT : tout segment tenu est un PAS PRIMITIF ----------
     C’est lui qui rend la comparaison canonique sans qu’elle ait à canoniser,
     et c’est lui qui empêche un trait long posé par-dessus un côté donné de
     produire deux colinéaires superposés — cas que l’arrangement ne sait pas
     trancher, et qui rendait zéro pièce. */
  const primitifs = await page.evaluate(() => {
    const svg = document.getElementById('scene');
    let g = svg.getElementById('bancTrace'); if (g) g.remove();
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('id','bancTrace');
    svg.appendChild(g);
    /* On DONNE au moteur un côté long d’un bloc, et on lui fait poser un côté
       long d’un bloc : ni l’un ni l’autre ne doit rester entier. */
    const b = creerTraceQuadrillage({svg, groupe:g, zone:ZONE_TRAVAIL, pre:['0,0|4,0']});
    b.poser('1,3|1,7');          // vertical de 4
    b.poser('2,2|6,4');          // pente 2/1 doublée : deux pas de 2/1
    b.poser('3,5|5,6');          // pente 2/1 simple : indivisible
    const pg = (x, y) => y ? pg(y, x % y) : x;
    const nonPrimitif = [...b.pre, ...b.traces].filter(k => {
      const [p, q] = boutsSeg(k);
      return (pg(Math.abs(q[0]-p[0]), Math.abs(q[1]-p[1])) || 1) > 1;
    });
    return {nonPrimitif, pre:[...b.pre].length, traces:[...b.traces].length,
            garde21:b.traces.has(cleSeg([3,5],[5,6]))};
  });
  T('canonique — aucun segment tenu n’est décomposable, ni le donné ni le tracé',
    primitifs.nonPrimitif.length === 0, primitifs.nonPrimitif.join(' | ')
      || (primitifs.pre + ' donnés + ' + primitifs.traces + ' tracés'));
  T('canonique — mais une pente indivisible reste entière',
    primitifs.garde21 === true, JSON.stringify({['3,5|5,6']:primitifs.garde21}));

  /* ---------- 4. L’appui simple ouvre un segment, et ne dérape pas ---------- */
  await installer();
  const tap1 = await taper([1, 1]);
  const tap2 = await taper([4, 2]);       // pente 3/1 — hors des huit voisins
  await installer();
  const tapAnnule = await taper([2, 2]);
  const tapAnnule2 = await taper([2, 2]); // le même nœud annule le départ
  T('4. un appui simple ne trace rien mais arme un départ',
    tap1.traces.length === 0 && !!tap1.attente, JSON.stringify(tap1));
  T('4. deux appuis posent le segment entre eux, même en pente 3/1',
    tap2.traces.length === 1 && tap2.traces[0] === '1,1|4,2' && tap2.attente === null,
    tap2.traces.join());
  T('4. le même nœud tapé deux fois annule le départ',
    tapAnnule2.attente === null && tapAnnule2.traces.length === 0, JSON.stringify(tapAnnule2));

  /* ---------- 5. Le retour arrière n’efface que ce que le geste a écrit ---------- */
  await installer(['3,3|4,3']);           // un segment DONNÉ
  const retour = await page.evaluate(() => {
    const svg = document.getElementById('scene');
    const env = (type, g, id) => {
      const s = banc.versScene(g), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = s[0]; pt.y = s[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:id, bubbles:true}));
    };
    banc.poser('1,5|2,5');                // un trait ANTÉRIEUR au geste
    const res = {};
    /* LE TRAIT NE S’ÉCRIT PLUS EN CHEMIN mais au virage ou au relâchement :
       tant que le doigt va droit, rien n’est posé, parce que c’est ce qui
       laisse passer les obliques sans se faire capturer par leurs nœuds
       intermédiaires. On regarde donc l’état APRÈS avoir levé le doigt. */
    env('pointerdown', [1,1], 5);
    env('pointermove', [2,1], 5); env('pointermove', [3,1], 5);
    res.enChemin = [...banc.traces].sort();
    env('pointerup', [3,1], 5);
    res.aller = [...banc.traces].sort();
    /* Un ALLER-RETOUR complet, dans un seul geste : l’enfant a dépassé puis
       est revenu, il n’a rien tracé. Le demi-tour étant COLINÉAIRE, aucun
       test de virage ne peut le voir — c’est le doigt qui se lève qui décide. */
    env('pointerdown', [1,3], 8);
    env('pointermove', [3,3], 8); env('pointermove', [1,3], 8);
    env('pointerup', [1,3], 8);
    res.allerRetour = [...banc.traces].filter(k => k.indexOf(',3|') >= 0).length;

    /* On repasse sur le trait ANTÉRIEUR puis on recule : il doit rester. */
    env('pointerdown', [1,5], 6); env('pointermove', [2,5], 6); env('pointermove', [1,5], 6);
    env('pointerup', [1,5], 6);
    res.antérieur = banc.traces.has('1,5|2,5');
    /* Et sur le DONNÉ : il n’est ni traçable ni effaçable. */
    env('pointerdown', [3,3], 7); env('pointermove', [4,3], 7); env('pointermove', [3,3], 7);
    env('pointerup', [3,3], 7);
    res.donné = banc.pre.has('3,3|4,3') && !banc.traces.has('3,3|4,3');
    /* « ANNULER » défait le DERNIER TRAIT — c’est lui qui remplace le retour
       arrière en chemin, devenu sans objet. Il lit le journal, donc il ne
       défait que des traits, jamais le donné, et jamais plus qu’il n’y en a. */
    banc.defaire();
    res.apresAnnuler = [...banc.traces].sort();
    for (let i = 0; i < 6; i++) banc.defaire();       // bien au-delà du journal
    res.annuleTropLoin = {traces:[...banc.traces], donne:banc.pre.has('3,3|4,3')};
    return res;
  });
  T('5. rien ne s’écrit tant que le doigt va droit — c’est ce qui ouvre les obliques',
    retour.enChemin.length === 1 && retour.enChemin[0] === '1,5|2,5', retour.enChemin.join());
  T('5. le trait s’écrit quand le doigt se lève', retour.aller.length === 3, retour.aller.join());
  T('5. un aller-retour complet dans un seul geste ne trace rien',
    retour.allerRetour === 0, retour.allerRetour + ' trait(s)');
  T('5. jamais un trait antérieur au geste', retour.antérieur === true);
  T('5. jamais le donné', retour.donné === true);
  T('5. « annuler » défait le dernier TRAIT entier, pas le dernier pas',
    retour.apresAnnuler.length === 1 && retour.apresAnnuler[0] === '1,5|2,5',
    retour.apresAnnuler.join());
  T('5. et s’acharner sur « annuler » n’entame pas le donné',
    retour.annuleTropLoin.traces.length === 0 && retour.annuleTropLoin.donne === true,
    JSON.stringify(retour.annuleTropLoin));

  /* ---------- 6. La gomme frotte, et ne touche que le tracé de l’enfant ---------- */
  await installer(['2,4|3,4']);
  const gomme = await page.evaluate(() => {
    const svg = document.getElementById('scene');
    const env = (type, g, id) => {
      const s = banc.versScene(g), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = s[0]; pt.y = s[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:8, bubbles:true}));
    };
    ['1,1|2,1','2,1|3,1','1,6|2,6'].forEach(k => banc.poser(k));
    banc.outil = 'gomme';
    /* Une rayure PERPENDICULAIRE, qui ne repasse jamais le trait. */
    env('pointerdown', [1.5, 0.6], 8);
    for (let i = 1; i <= 10; i++) env('pointermove', [1.5, 0.6 + 0.8*i/10], 8);
    env('pointerup', [1.5, 1.4], 8);
    const apres = [...banc.traces].sort();
    /* Puis en travers du DONNÉ : il ne bouge pas. */
    env('pointerdown', [2.5, 3.6], 9);
    for (let i = 1; i <= 10; i++) env('pointermove', [2.5, 3.6 + 0.8*i/10], 9);
    env('pointerup', [2.5, 4.4], 9);
    banc.outil = 'crayon';
    return {apres, donné:banc.pre.has('2,4|3,4'), loin:banc.traces.has('1,6|2,6')};
  });
  T('6. une rayure en travers efface le trait qu’elle croise',
    gomme.apres.indexOf('1,1|2,1') === -1, gomme.apres.join());
  T('6. et laisse en place ce qui est loin', gomme.loin === true);
  T('6. la gomme ne mord pas sur le donné', gomme.donné === true);

  /* ---------- 7. L’outil est figé à l’appui ---------- */
  await installer();
  const fige = await page.evaluate(() => {
    const svg = document.getElementById('scene');
    const env = (type, g) => {
      const s = banc.versScene(g), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = s[0]; pt.y = s[1];
      const e = pt.matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:10, bubbles:true}));
    };
    env('pointerdown', [1,3]);
    banc.outil = 'gomme';               // on change d’outil EN COURS DE GESTE
    env('pointermove', [2,3]); env('pointermove', [3,3]);
    env('pointerup', [3,3]);
    banc.outil = 'crayon';
    return [...banc.traces].sort();
  });
  T('7. l’outil est figé à l’appui : le geste reste un tracé',
    fige.length === 2, fige.join());

  /* ---------- 8. La vue déborde le quadrillage d’une demi-maille ---------- */
  const debord = await page.evaluate(() => {
    const svg = document.getElementById('scene');
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const m = (z) => ({
      gauche:(z.x0 - vb[0]) / z.pas, droite:(vb[0] + vb[2] - z.x1) / z.pas,
      haut:(z.y0 - vb[1]) / z.pas, bas:(vb[1] + vb[3] - z.y1) / z.pas});
    return {travail:m(ZONE_TRAVAIL), pleine:m(ZONE_PLEINE)};
  });
  const assez = (o) => Object.values(o).every(v => v >= 0.5);
  T('8. la vue déborde le quadrillage d’au moins une demi-maille',
    assez(debord.travail) && assez(debord.pleine),
    'travail ' + JSON.stringify(Object.fromEntries(Object.entries(debord.travail).map(([k,v]) => [k, +v.toFixed(2)]))));

  /* ---------- 9. Le quadrillage affiché est celui qui accroche ---------- */
  await installer();
  const grille = await page.evaluate(() => {
    const g = document.getElementById('bancTrace');
    const xs = [...g.querySelectorAll('line.trace-maille')]
      .filter(l => l.getAttribute('x1') === l.getAttribute('x2'))
      .map(l => +l.getAttribute('x1')).sort((a, b) => a - b);
    const ys = [...g.querySelectorAll('line.trace-maille')]
      .filter(l => l.getAttribute('y1') === l.getAttribute('y2'))
      .map(l => +l.getAttribute('y1')).sort((a, b) => a - b);
    const ax = [], ay = [];
    for (let i = 0; i <= banc.zone.nx; i++) ax.push(banc.versScene([i, 0])[0]);
    for (let j = 0; j <= banc.zone.ny; j++) ay.push(banc.versScene([0, j])[1]);
    return {xs:xs.join(), ys:ys.join(), ax:ax.join(), ay:ay.join()};
  });
  T('9. le quadrillage affiché est exactement celui qui accroche',
    grille.xs === grille.ax && grille.ys === grille.ay, grille.xs);

  /* ---------- 10. Surface explicite, et carte entière en touch-action:none ---------- */
  const surface = await page.evaluate(() => {
    const svg = document.getElementById('scene');
    const r = svg.getBoundingClientRect();
    const points = [];
    for (let i = 1; i <= 4; i++) for (let j = 1; j <= 4; j++) {
      const el = document.elementFromPoint(r.x + r.width*i/5, r.y + r.height*j/5);
      points.push({peint: !!(el && el !== svg && svg.contains(el)),
                   touch: el ? getComputedStyle(el).touchAction : 'rien'});
    }
    const rect = document.querySelector('#bancTrace .trace-surface');
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    return {mauvais:points.filter(p => !p.peint || p.touch !== 'none').length, total:points.length,
      couvre: rect && +rect.getAttribute('width') === vb[2] && +rect.getAttribute('height') === vb[3],
      evts: rect ? getComputedStyle(rect).pointerEvents : 'rien',
      carte:getComputedStyle(document.getElementById('plan')).touchAction};
  });
  T('10. une surface explicite couvre toute la vue',
    surface.couvre === true && surface.evts === 'all', surface.evts);
  T('10. sous chaque point de la zone il y a un élément peint qui refuse le défilement',
    surface.mauvais === 0, surface.mauvais + '/' + surface.total + ' hors cible');
  T('10. et la carte entière est en touch-action:none', surface.carte === 'none', surface.carte);

  /* ---------- 11. L’intérieur est calculé, contrôlé par des aires connues ---------- */
  const aires = await page.evaluate(() => {
    const svg = document.getElementById('scene');
    const poserContour = (c) => {
      let g = svg.getElementById('bancTrace'); if (g) g.remove();
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('id','bancTrace');
      svg.appendChild(g);
      window.banc = creerTraceQuadrillage({svg, groupe:g, zone:ZONE_TRAVAIL, pre:[]});
      c.forEach(k => banc.poser(k));
      /* On mesure l’aire des polygones RENDUS, à la formule du lacet, et on
         la compare à une aire connue à la main — jamais en rappelant la
         fonction qui les produit. */
      return [...document.querySelectorAll('#bancTrace .trace-face')].map(p => {
        const pts = p.getAttribute('d').slice(2, -2).split(' L ').map(s => s.split(' ').map(Number));
        let a2 = 0;
        for (let i = 0; i < pts.length; i++) {
          const u = pts[i], v = pts[(i+1) % pts.length];
          a2 += u[0]*v[1] - v[0]*u[1];
        }
        return +(Math.abs(a2/2) / (banc.zone.pas * banc.zone.pas)).toFixed(3);
      }).sort((a, b) => a - b);
    };
    const cont = (pts) => pts.map((p, i) => {
      const q = pts[(i+1) % pts.length];
      return (p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1]))
        ? p.join(',') + '|' + q.join(',') : q.join(',') + '|' + p.join(',');
    });
    return {
      carre3:poserContour(cont([[1,1],[4,1],[4,4],[1,4]])),
      oblique21:poserContour(cont([[1,1],[3,2],[2,4],[0,3]])),
      triangle43:poserContour(cont([[1,1],[5,1],[1,4]])),
      rectDiag:poserContour(cont([[1,1],[5,1],[5,4],[1,4]]).concat(['1,1|5,4'])),
      /* Les DEUX diagonales d’un carré se croisent hors de tout nœud : sans
         découper les segments à leur intersection, le point de croisement
         n’est pas un sommet et les faces sont fausses. Un carré de 2×2 ainsi
         barré fait quatre triangles d’une maille — connu à la main. */
      croix:poserContour(cont([[1,1],[3,1],[3,3],[1,3]]).concat(['1,1|3,3','1,3|3,1'])),
      ouvert:poserContour(['1,1|2,1','2,1|3,1'])
    };
  });
  T('11. un carré de 3×3 enferme 9 mailles', aires.carre3.join() === '9', aires.carre3.join());
  T('11. un carré oblique 2/1 enferme 5 mailles — ce qu’un découpage en quarts ne sait pas dire',
    aires.oblique21.join() === '5', aires.oblique21.join());
  T('11. un triangle rectangle 4×3 en enferme 6', aires.triangle43.join() === '6', aires.triangle43.join());
  T('11. un rectangle coupé par sa diagonale donne DEUX pièces de 6',
    aires.rectDiag.join() === '6,6', aires.rectDiag.join());
  T('11. deux diagonales croisées hors nœud font QUATRE pièces d’une maille',
    aires.croix.join() === '1,1,1,1', aires.croix.join());
  T('11. une ligne ouverte n’enferme rien', aires.ouvert.length === 0, aires.ouvert.join());

  /* ---------- 12. La récompense n’arrive ni avant la réussite, ni après un abandon ---------- */
  await page.goto(base + '?competence=cp-completer');
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    desarmerAutoSuivant();
    const conf = () => document.querySelectorAll('#confettis-conteneur .confetti').length;
    window.__res = {avant:{vitrail:vitrail.length, confettis:conf()}};
    return true;
  });
  await tracerChemin(page);
  const recompense = await page.evaluate(async () => {
    const conf = () => document.querySelectorAll('#confettis-conteneur .confetti').length;
    const res = window.__res;
    res.pendant = {vitrail:vitrail.length, confettis:conf()};
    document.getElementById('btnValider').click();
    await new Promise(r => setTimeout(r, 60));
    res.apres = {vitrail:vitrail.length, confettis:conf(), ok:file[pos]._ok};
    return res;
  });
  T('12. rien n’est fêté avant la validation',
    recompense.pendant.vitrail === recompense.avant.vitrail
    && recompense.pendant.confettis === 0, JSON.stringify(recompense.pendant));
  T('12. la réussite ajoute la pièce au vitrail et lance les confettis',
    recompense.apres.ok === true && recompense.apres.vitrail === recompense.avant.vitrail + 1
    && recompense.apres.confettis > 0, JSON.stringify(recompense.apres));
  await page.goto(base + '?competence=cp-completer');
  await page.waitForTimeout(500);
  /* Une figure FAUSSE, mais RÉELLEMENT FERMÉE : sans fermeture rien n’est
     validé et le contrôle ne dirait rien. On trace le contour attendu en
     décalant un seul coin d’une maille. */
  const fausse = await page.evaluate(() => {
    desarmerAutoSuivant();
    const t = chantier.trace, q = file[pos];
    /* On ALLONGE le rectangle : la figure reste close et tous ses côtés
       restent traçables au glissement — une déformation qui casserait une
       pente rendrait le contour intraçable, donc invalidé pour la mauvaise
       raison.
       ET ON VÉRIFIE QUE LA FIGURE OBTENUE EST BIEN FAUSSE. La complétion du
       CP accepte DEUX solutions — le carré d’un côté ou de l’autre du côté
       donné — et une déformation d’une maille tombait parfois pile sur la
       seconde : le test échouait alors une fois sur cinq en accusant le code
       d’accepter une figure fausse qui n’en était pas une. On essaie donc
       plusieurs allongements et on garde le premier qui ne coïncide avec
       AUCUNE solution. */
    const base = q.solutions[0][0].map(p => t.versGrille(p).map(Math.round));
    const attendues = q.solutions.map(sol => segmentsDeSolution(sol, chantier.z));
    const u = [Math.sign(base[1][0] - base[0][0]), Math.sign(base[1][1] - base[0][1])];
    for (const n of [1, 2, -1, -2]) {
      const c = base.map(p => p.slice());
      c[1] = [c[1][0] + u[0]*n, c[1][1] + u[1]*n];
      c[2] = [c[2][0] + u[0]*n, c[2][1] + u[1]*n];
      if (c.some(p => p[0] < 0 || p[1] < 0 || p[0] > t.zone.nx || p[1] > t.zone.ny)) continue;
      const cles = c.map((p, i) => cleSeg(p, c[(i+1) % c.length]));
      if (attendues.some(att => memesTraces(cles, att, q.libre))) continue;
      c.push(c[0]);
      return c;
    }
    return null;
  });
  await tracerChemin(page, fausse);
  const abandon = await page.evaluate(async () => {
    const pret = !document.getElementById('btnValider').disabled;
    document.getElementById('btnValider').click();
    await new Promise(r => setTimeout(r, 60));
    return {pret, contours:chantier.contours.length, ok:file[pos]._ok, vitrail:vitrail.length,
      confettis:document.querySelectorAll('#confettis-conteneur .confetti').length};
  });
  T('12. une déformation vraiment fausse a été trouvée',
    fausse !== null, fausse ? fausse.length + ' sommets' : 'aucune');
  T('12. la figure fausse est bien allée jusqu’à la validation',
    abandon.pret === true && abandon.contours === 1, JSON.stringify(abandon));
  T('12. et une figure fausse ne fête rien',
    abandon.ok === false && abandon.vitrail === 0 && abandon.confettis === 0, JSON.stringify(abandon));


  /* ============================================================
     LA MAILLE — dimensionnée par le doigt, et bornée par la hauteur
     ============================================================ */
  {
    const tel = await nav.newPage({viewport:{width:390, height:664}});
    const mesures = {};
    for (const c of ['cp-reproduire','cp-assembler','ce1-reproduire','cp-completer','ce2-rosace','ce1-construire']) {
      await tel.goto(base + '?competence=' + c);
      await tel.waitForTimeout(500);
      mesures[c] = await tel.evaluate(() => {
        const svg = document.getElementById('scene'), r = svg.getBoundingClientRect();
        const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number), ech = r.width / vb[2];
        return {maillePx:MAILLE * ech, rayonPx:RAYON_NOEUD_M * MAILLE * ech,
          planBas:r.bottom, planH:r.height, fold:window.innerHeight, H:vb[3],
          avecModele:!!file[pos].modele, support:file[pos].support,
          uni:{x0:ZONE_PLEINE_UNI.x0, y0:ZONE_PLEINE_UNI.y0, l:ZONE_PLEINE_UNI.l, h:ZONE_PLEINE_UNI.h},
          rayonRosace:rayonMaxRosace(), centre:centreDuPanneau()};
      });
    }
    const m = mesures['cp-reproduire'];
    /* Le doigt, pas le nombre de cases : à 22,5 px le rayon d’accrochage
       valait 10 px, moitié de ce que M41 offre. */
    T('maille — le doigt trouve les nœuds : maille ≥ 28 px et rayon ≥ 12 px sur un iPhone',
      m.maillePx >= 28 && m.rayonPx >= 12,
      m.maillePx.toFixed(1) + ' px, rayon ' + m.rayonPx.toFixed(1) + ' px');
    /* Le plafond : TOUT tient au-dessus de la ligne de flottaison, consigne
       comprise. Une consigne écrite au long repoussait le plan sous le pli —
       l’enfant devait faire défiler pour voir le panneau qu’on lui demande de
       regarder, et une consigne qu’il faut quitter des yeux pour travailler ne
       sert plus à rien. C’est donc le TEXTE qui s’ajuste au plan, jamais le
       plan qui cède : la maille a été dimensionnée pour le doigt, elle n’a pas
       à rétrécir pour faire de la place à une phrase.
       Éprouvé sur les NEUF mini-jeux, et pas seulement sur ceux à modèle :
       n’importe quelle consigne trop bavarde doit rougir ici. */
    const avecModele = ['cp-reproduire','cp-assembler','ce1-reproduire'].map(c => mesures[c]);
    T('maille — sur un écran à modèle, tout le plan tient au-dessus de la ligne de flottaison',
      avecModele.every(x => x.avecModele && x.planBas <= x.fold),
      avecModele.map(x => Math.round(x.planBas) + '/' + x.fold).join(' '));
    /* Le papier uni est FIGÉ : élargir la maille du quadrillage ne doit pas
       déplacer la rosace ni les constructions au compas d’un pixel. */
    const uni = mesures['ce2-rosace'];
    T('maille — le panneau de papier uni garde sa géométrie historique',
      JSON.stringify(uni.uni) === JSON.stringify({x0:24, y0:20, l:338, h:260})
      && uni.rayonRosace === 59 && uni.centre[0] === 193 && uni.centre[1] === 150,
      JSON.stringify(uni.uni) + ' r=' + uni.rayonRosace);
    T('maille — et la hauteur du plan sur papier uni est inchangée',
      mesures['ce2-rosace'].H === 300 && mesures['ce1-construire'].H === 300,
      mesures['ce2-rosace'].H + '/' + mesures['ce1-construire'].H);
    /* La hauteur du plan se DÉDUIT de la zone la plus basse. */
    const derivee = await tel.evaluate(() => {
      const zs = [ZONE_TRAVAIL, ZONE_PLEINE, ZONE_PLEINE_UNI];
      return zs.map(z => hauteurPlan(z) - z.y1);
    });
    T('maille — la hauteur du plan se déduit de la zone la plus basse, jamais déclarée à côté',
      derivee.every(d => d === derivee[0] && d >= 0.5 * 26), derivee.join());
    /* LES NEUF MINI-JEUX, MANCHE PAR MANCHE. Le contrôle ne portait que sur
       la première manche de trois d’entre eux : une consigne allongée
       ailleurs — et il y en a eu — passait sans que rien ne rougisse. */
    const plis = [];
    for (const c of ['cp-reproduire','cp-completer','cp-assembler','ce1-reproduire',
                     'ce1-completer','ce1-construire','ce2-reproduire',
                     'ce2-construire-uni','ce2-rosace']) {
      await tel.goto(base + '?competence=' + c);
      await tel.waitForTimeout(400);
      plis.push(await tel.evaluate((nom) => {
        let pire = -Infinity, quelle = 0;
        for (let i = 0; i < file.length; i++) {
          pos = i; manche(); desarmerAutoSuivant();
          const d = document.getElementById('plan').getBoundingClientRect().bottom - window.innerHeight;
          if (d > pire) { pire = d; quelle = i; }
        }
        return {jeu:nom, debord:Math.round(pire), manche:quelle + 1};
      }, c));
    }
    T('pli — sur les neuf mini-jeux, aucune manche ne repousse le plan sous la ligne de flottaison',
      plis.every(p => p.debord <= 0),
      plis.filter(p => p.debord > 0).map(p => p.jeu + ' manche ' + p.manche + ' : +' + p.debord + ' px')
        .join(' | ') || 'marge la plus faible : '
        + Math.min(...plis.map(p => -p.debord)) + ' px');
    /* AUCUNE figure ne sort de sa zone, modèle compris — l’offset imposé de
       `cp-assembler` débordait dès que le panneau a perdu une rangée. */
    const debords = await tel.evaluate(() => {
      const gens = {'cp-reproduire':qCpReproduire, 'cp-completer':qCpCompleter,
        'cp-assembler':qCpAssembler, 'ce1-reproduire':qCe1Reproduire,
        'ce1-completer':qCe1Completer, 'ce2-reproduire':qCe2Reproduire};
      const dehors = [];
      const verifier = (pts, z, ou) => pts.forEach(p => {
        if (p[0] < z.x0 - 0.01 || p[0] > z.x1 + 0.01 || p[1] < z.y0 - 0.01 || p[1] > z.y1 + 0.01) dehors.push(ou);
      });
      for (let n = 0; n < 120; n++) for (const [nom, g] of Object.entries(gens)) g().forEach(q => {
        const zt = q.zone === 'pleine' ? (q.support === 'uni' ? ZONE_PLEINE_UNI : ZONE_PLEINE) : ZONE_TRAVAIL;
        if (q.modele) verifier(q.modele.flat(), ZONE_MODELE, nom + ' modèle');
        (q.solutions || []).forEach(s => verifier(s.flat(), zt, nom + ' solution'));
        (q.amorce || []).forEach(a => verifier(a, zt, nom + ' amorce'));
      });
      return [...new Set(dehors)];
    });
    T('maille — aucune figure ne sort de sa zone, modèle compris',
      debords.length === 0, debords.slice(0, 4).join(' | ') || '720 parties');
    await tel.close();
  }


  /* ============================================================
     LES DEUX MINI-JEUX DU CP AU TRACÉ AU DOIGT
     ============================================================ */
  {
    const tracer = async (comp, chemins) => {
      await page.goto(base + '?competence=' + comp);
      await page.waitForTimeout(400);
      for (const ch of (chemins || [])) {
        await page.evaluate(async (chemin) => {
          const t = chantier.trace, svg = document.getElementById('scene');
          const env = (type, g) => {
            const sc = t.versScene(g), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
            pt.x = sc[0]; pt.y = sc[1];
            const e = pt.matrixTransform(m);
            svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:1, bubbles:true}));
          };
          env('pointerdown', chemin[0]);
          for (let i = 0; i < chemin.length - 1; i++) {
            const a = chemin[i], b = chemin[i+1];
            const n = Math.max(1, Math.round(Math.max(Math.abs(b[0]-a[0]), Math.abs(b[1]-a[1])) * 6));
            for (let k = 1; k <= n; k++) env('pointermove', [a[0] + (b[0]-a[0])*k/n, a[1] + (b[1]-a[1])*k/n]);
          }
          env('pointerup', chemin[chemin.length - 1]);
        }, ch);
        await page.waitForTimeout(45);
      }
    };

    /* La pièce tracée est LUE sur les faces, et son aire se mesure : un test
       qui la recalculerait avec la fonction qui la produit validerait son
       bug (propriété 11). */
    await tracer('cp-reproduire', [[[1,1],[5,1],[5,3],[1,3],[1,1]]]);
    const aire = await page.evaluate(() => {
      const f = chantier.trace.faces();
      const air = (poly) => { let a = 0;
        for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i+1)%poly.length];
          a += p[0]*q[1] - q[0]*p[1]; } return Math.abs(a) / 2; };
      return {n:f.length, aires:f.map(x => air(x.poly)), sommets:chantier.contours.map(c => c.length)};
    });
    T('tracé — un rectangle 4×2 tracé au doigt enferme 8 mailles, en une seule pièce',
      aire.n === 1 && Math.abs(aire.aires[0] - 8) < 1e-6, JSON.stringify(aire.aires));
    /* Le contour SOUMIS AU JUGEMENT a quatre côtés, pas douze sommets : une
       face porte un sommet à chaque nœud traversé, ce qui n’est pas une
       description de la figure. */
    T('tracé — la pièce est jugée comme un quadrilatère, pas comme douze sommets',
      aire.sommets.length === 1 && aire.sommets[0] === 4, JSON.stringify(aire.sommets));

    /* UN TRAIT EN TROP FAIT ÉCHOUER LA MANCHE. Juger sur les seules faces
       laissait passer une antenne ou un trait resté en travers : ils
       n’enferment rien, donc ne changent aucune face, et la manche partait
       juste sur une figure que personne n’aurait acceptée sur le papier. */
    await page.goto(base + '?competence=cp-reproduire');
    await page.waitForTimeout(400);
    await tracerChemin(page);
    const bavure = await page.evaluate(async () => {
      const t = chantier.trace;
      const avantFaces = chantier.contours.length;
      let pose = false;
      for (let j = 0; j <= t.zone.ny && !pose; j++)
        for (let i = 0; i < t.zone.nx && !pose; i++) {
          const k = cleSeg([i,j], [i+1,j]);
          if (!t.pre.has(k) && !t.traces.has(k)) pose = t.poser(k);
        }
      desarmerAutoSuivant();
      document.getElementById('btnValider').click();
      await new Promise(r => setTimeout(r, 80));
      return {pose, avantFaces, faces:chantier.contours.length,
              ok:file[pos]._ok, fb:document.getElementById('feedback').textContent};
    });
    T('tracé — la pièce était bien juste et le trait en trop bien posé',
      bavure.pose.length > 0 && bavure.faces === 1 && bavure.avantFaces === 1, JSON.stringify(bavure));
    T('tracé — un trait en trop fait échouer la manche, même si la pièce est juste',
      bavure.ok === false, JSON.stringify({ok:bavure.ok}));

    /* ---------- LE CHOIX DU CE2 : le même travail, deux verdicts ----------
       Le croquis regarde la FIGURE et laisse passer une bavure ; le tracé
       exact regarde les TRAITS et la refuse. On joue donc DEUX FOIS la même
       manche, avec le même trait en trop, en ne changeant que le mode : si
       les deux verdicts étaient identiques, le choix ne serait qu’un bouton
       décoratif. */
    await page.goto(base + '?competence=ce2-reproduire');
    await page.waitForTimeout(400);
    const choixCE2 = await page.evaluate(async () => {
      const jouer = async (mode) => {
        await new Promise(r => setTimeout(r, 20));
        pos = 0; manche(); desarmerAutoSuivant();
        const q = file[pos], t = chantier.trace;
        segmentsDeSolution(q.solutions[0], chantier.z)
          .forEach(k => { if (!t.pre.has(k)) t.poser(k); });
        /* Une bavure : un trait de plus, qui n’enferme rien. */
        let pose = null;
        for (let j = 0; j <= t.zone.ny && !pose; j++)
          for (let i = 0; i < t.zone.nx && !pose; i++) {
            const k = cleSeg([i,j], [i+1,j]);
            if (!t.pre.has(k) && !t.traces.has(k)) pose = t.poser(k);
          }
        q._mode = mode;
        validerManche(q);
        await new Promise(r => setTimeout(r, 60));
        return {ok:q._ok, bavure:!!pose, fb:document.getElementById('feedback').textContent.trim()};
      };
      /* ET UNE FIGURE FAUSSE, EN CROQUIS. Sans ce cas, « croquis » pouvait
         devenir « tout passe » sans qu’un test bronche : mesuré, la mutation
         est restée aveugle. Croquer vite une figure JUSTE est la compétence ;
         croquer n’importe quoi n’en est pas une. On allonge un côté d’une
         maille — la figure reste close et traçable, elle est simplement
         fausse. */
      const fausse = async () => {
        await new Promise(r => setTimeout(r, 20));
        pos = 0; manche(); desarmerAutoSuivant();
        const q = file[pos], t = chantier.trace;
        const c = q.solutions[0][0].map(p => t.versGrille(p).map(Math.round));
        const u = [Math.sign(c[1][0] - c[0][0]), Math.sign(c[1][1] - c[0][1])];
        const sens = (c[1][0] + u[0] <= t.zone.nx && c[1][1] + u[1] <= t.zone.ny
                      && c[2][0] + u[0] <= t.zone.nx && c[2][1] + u[1] <= t.zone.ny) ? 1 : -1;
        c[1] = [c[1][0] + u[0]*sens, c[1][1] + u[1]*sens];
        c[2] = [c[2][0] + u[0]*sens, c[2][1] + u[1]*sens];
        for (let i = 0; i < c.length; i++) t.poser(cleSeg(c[i], c[(i+1) % c.length]));
        q._mode = 'esquisse';
        validerManche(q);
        await new Promise(r => setTimeout(r, 60));
        return {ok:q._ok, contours:chantier.contours.length};
      };
      return {exact:await jouer('exact'), croquis:await jouer('esquisse'),
              crobard:await fausse()};
    });
    T('CE2 — la bavure a bien été posée dans les deux essais',
      choixCE2.exact.bavure && choixCE2.croquis.bavure, JSON.stringify(choixCE2.exact.bavure));
    T('CE2 — en tracé exact, un trait en trop fait échouer la manche',
      choixCE2.exact.ok === false, JSON.stringify({ok:choixCE2.exact.ok}));
    T('CE2 — en croquis, la même bavure passe : c’est la figure qu’on regarde',
      choixCE2.croquis.ok === true, JSON.stringify({ok:choixCE2.croquis.ok}));
    T('CE2 — et le refus en mode exact dit que le croquis existe',
      /croquis/.test(choixCE2.exact.fb), choixCE2.exact.fb);
    T('CE2 — mais le croquis n’est pas un blanc-seing : une figure fausse est refusée',
      choixCE2.crobard.contours === 1 && choixCE2.crobard.ok === false,
      JSON.stringify(choixCE2.crobard));
    T('tracé — et on le DIT, au lieu de montrer en vert une figure déjà faite',
      /traits en trop/.test(bavure.fb), bavure.fb.trim().slice(0, 70));

    /* Le côté DONNÉ n’est pas effaçable : c’est l’énoncé, pas le travail. */
    await tracer('cp-completer', []);
    const donne = await page.evaluate(() => {
      const t = chantier.trace;
      const k = [...t.pre][0];
      const [a, b] = k.split('|').map(x => x.split(',').map(Number));
      const milieu = [(a[0]+b[0])/2, (a[1]+b[1])/2];
      const avant = t.pre.size;
      t.outil = 'gomme'; t.frotter(t.versScene(milieu)); t.outil = 'crayon';
      return {avant, apres:t.pre.size, gommages:t.gommages,
        decompose:[...t.pre].every(c => {
          const [p, q] = c.split('|').map(x => x.split(',').map(Number));
          return Math.abs(p[0]-q[0]) <= 1 && Math.abs(p[1]-q[1]) <= 1; })};
    });
    T('tracé — la gomme n’efface pas les côtés donnés',
      donne.apres === donne.avant && donne.gommages === 0, JSON.stringify(donne));
    T('tracé — les côtés donnés sont décomposés en pas de nœud à nœud',
      donne.decompose === true, JSON.stringify([...''].length ? '' : donne.decompose));

    /* LE PAPIER MONTRÉ SUIT LE SUPPORT, l’accrochage ne suit que la zone :
       imposer les lignes du moteur transformerait le pointé en quadrillé. */
    const papiers = {};
    for (const comp of ['cp-reproduire', 'cp-completer']) {
      await page.goto(base + '?competence=' + comp);
      await page.waitForTimeout(400);
      papiers[comp] = await page.evaluate(() => {
        const out = [];
        for (let i = 0; i < file.length; i++) {
          pos = i; manche();
          /* Le tracé a son propre groupe, dessiné SOUS les instruments. */
          const g = document.getElementById('tracage');
          out.push({support:file[i].support,
            lignes:g.querySelectorAll('line.maille').length,
            points:g.querySelectorAll('circle.noeud').length,
            noeudsAccroches:(chantier.z.nx + 1) * (chantier.z.ny + 1)});
        }
        return out;
      });
    }
    const tous = papiers['cp-reproduire'].concat(papiers['cp-completer']);
    T('tracé — le papier pointé reste pointé : des points, aucune ligne',
      tous.filter(x => x.support === 'pointe').every(x => x.points > 0 && x.lignes === 0),
      JSON.stringify(tous.filter(x => x.support === 'pointe').map(x => x.lignes + 'L/' + x.points + 'P')));
    T('tracé — le quadrillé reste quadrillé : des lignes, aucun point',
      tous.filter(x => x.support === 'quadrille').every(x => x.lignes > 0 && x.points === 0),
      JSON.stringify(tous.filter(x => x.support === 'quadrille').map(x => x.lignes + 'L/' + x.points + 'P')));
    /* Quadrillé et pointé n’accrochent PAS différemment : le pointé n’est pas
       plus difficile, c’est le regard qui travaille davantage. Se compare
       mini-jeu par mini-jeu — les deux n’occupent pas la même zone. */
    T('tracé — quadrillé et pointé accrochent aux mêmes nœuds',
      Object.values(papiers).every(l => new Set(l.map(x => x.noeudsAccroches)).size === 1
        && new Set(l.map(x => x.support)).size > 1),
      JSON.stringify(Object.entries(papiers).map(([c, l]) =>
        c + ':' + [...new Set(l.map(x => x.noeudsAccroches))].join('/'))));
  }



  /* ---------- Le critère d’exactitude, éprouvé sur pièces ----------
     La preuve de bout en bout ne suffisait pas : elle plaçait le trait en
     trop hors de la figure, si bien que le recalage par le coin supérieur
     gauche le refusait DE TOUTE FAÇON. Une tolérance aux traits en plus
     passait donc inaperçue. On éprouve donc la règle elle-même, sur des
     ensembles choisis, où chaque cas isole une seule chose. */
  {
    const cas = await page.evaluate(() => {
      const K = (a, b) => cleSeg(a, b);
      const carre = [K([0,0],[1,0]), K([1,0],[1,1]), K([1,1],[0,1]), K([0,1],[0,0])];
      const decale = carre.map(k => { const [a, b] = boutsSeg(k);
        return K([a[0]+3, a[1]+2], [b[0]+3, b[1]+2]); });
      const enTrop = carre.concat([K([0,0],[1,1])]);      // une diagonale DANS la figure
      const manquant = carre.slice(0, 3);
      return {
        exact:        memesTraces(carre, carre, false),
        enTrop:       memesTraces(enTrop, carre, false),
        enTropLibre:  memesTraces(enTrop, carre, true),
        manquant:     memesTraces(manquant, carre, false),
        decaleLibre:  memesTraces(decale, carre, true),
        decaleFige:   memesTraces(decale, carre, false)
      };
    });
    T('exactitude — la figure juste est acceptée', cas.exact === true);
    T('exactitude — un trait en trop est refusé, même sans changer la boîte de la figure',
      cas.enTrop === false && cas.enTropLibre === false, JSON.stringify(cas));
    T('exactitude — un trait qui manque est refusé', cas.manquant === false);
    T('exactitude — la même figure ailleurs est acceptée quand la position est libre',
      cas.decaleLibre === true, JSON.stringify({decaleLibre:cas.decaleLibre}));
    T('exactitude — et refusée quand l’amorce fixe la position',
      cas.decaleFige === false, JSON.stringify({decaleFige:cas.decaleFige}));
  }

  /* La tolérance à la translation, éprouvée EN JEU et pas seulement sur la
     règle : rien ne traçait jamais la figure ailleurs qu’à sa place. */
  {
    await page.goto(base + '?competence=cp-reproduire');
    await page.waitForTimeout(400);
    const ailleurs = await page.evaluate(() => {
      const t = chantier.trace;
      const c = file[pos].solutions[0][0].map(p => t.versGrille(p).map(Math.round));
      const dx = c.every(p => p[0] + 1 <= t.zone.nx) ? 1 : -1;
      const dy = c.every(p => p[1] + 1 <= t.zone.ny) ? 1 : -1;
      const d = c.map(p => [p[0] + dx, p[1] + dy]);
      d.push(d[0]);
      return {chemin:d, decale:[dx, dy]};
    });
    await tracerChemin(page, ailleurs.chemin);
    const verdict = await page.evaluate(async () => {
      desarmerAutoSuivant();
      document.getElementById('btnValider').click();
      await new Promise(r => setTimeout(r, 80));
      return {ok:file[pos]._ok, faces:chantier.contours.length};
    });
    T('exactitude — en jeu, la même pièce tracée une maille plus loin est acceptée',
      verdict.ok === true && verdict.faces === 1,
      JSON.stringify(Object.assign({}, verdict, {decale:ailleurs.decale})));
  }



  /* ============================================================
     LES OBLIQUES DU CE1 — le vrai saut du sous-thème
     ------------------------------------------------------------
     Sur une pente 2/1, le nœud parasite est à 0,447 maille de la corde et le
     rayon d’accrochage vaut 0,45 : un enfant qui trace PARFAITEMENT droit
     était capturé d’un cheveu. Baisser le rayon sous 0,316 (la pente 3/1)
     rendrait les nœuds inatteignables. C’est donc la règle du geste qui a
     changé, pas un réglage.
     ============================================================ */
  {
    await page.goto(base + '?competence=ce1-reproduire');
    await page.waitForTimeout(400);
    const mesure = await page.evaluate(async () => {
      const t = chantier.trace, svg = document.getElementById('scene');
      const pg = (x, y) => y ? pg(y, x % y) : x;
      const attendu = (a, b) => {
        const dx = b[0]-a[0], dy = b[1]-a[1], g = pg(Math.abs(dx), Math.abs(dy)) || 1;
        const out = [];
        for (let k = 0; k < g; k++)
          out.push(cleSeg([a[0]+dx/g*k, a[1]+dy/g*k], [a[0]+dx/g*(k+1), a[1]+dy/g*(k+1)]));
        return out.sort();
      };
      const tracer = (ch, tr) => {
        t.traces.clear(); t.journal = []; t.rendre();
        const env = (type, g) => {
          const sc = t.versScene(g), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
          pt.x = sc[0]; pt.y = sc[1];
          const e = pt.matrixTransform(m);
          svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:1, bubbles:true}));
        };
        env('pointerdown', ch[0]);
        for (let i = 0; i < ch.length - 1; i++) {
          const a = ch[i], b = ch[i+1];
          const nx = -(b[1]-a[1]), ny = (b[0]-a[0]), L = Math.hypot(nx, ny) || 1;
          const n = Math.max(4, Math.round(Math.hypot(b[0]-a[0], b[1]-a[1]) * 10));
          for (let k = 1; k <= n; k++) {
            const u = k/n, d = tr ? Math.sin(k * 2.1) * tr : 0;
            env('pointermove', [a[0]+(b[0]-a[0])*u + d*nx/L, a[1]+(b[1]-a[1])*u + d*ny/L]);
          }
        }
        env('pointerup', ch[ch.length - 1]);
        return [...t.traces].sort();
      };
      /* Les pentes que le CE1 met en jeu, plus deux voisines pour la mesure. */
      const cotes = {'horizontal':[[1,1],[5,1]], '45°':[[1,1],[4,4]], '2/1':[[1,1],[3,2]],
                     '3/1':[[1,1],[4,2]], '1/2':[[1,1],[2,3]], '2/4':[[1,1],[3,5]]};
      const pentes = {};
      Object.entries(cotes).forEach(([nom, [a, b]]) => {
        pentes[nom] = tracer([a, b], 0.28).join() === attendu(a, b).join();
      });
      /* Le virage franc reste vu, dans un seul geste. */
      const virages = [[[1,1],[5,1],[5,3]], [[1,1],[3,2],[3,4]], [[2,1],[4,2],[2,3]]].map(ch => {
        const r = tracer(ch, 0.08);
        let att = [];
        for (let i = 0; i < ch.length - 1; i++) att = att.concat(attendu(ch[i], ch[i+1]));
        return r.join() === att.sort().join();
      });
      /* Et une partie entière du CE1 se joue au doigt. */
      return {pentes, virages, modes:[...new Set(file.map(q => q.mode))]};
    });
    T('obliques — toutes les pentes du CE1 se tracent d’un geste, main tremblée de ±0,28 maille',
      Object.values(mesure.pentes).every(Boolean),
      Object.entries(mesure.pentes).map(([k, v]) => k + (v ? '✔' : '✘')).join(' '));
    T('obliques — un virage franc reste vu, même au milieu d’un geste',
      mesure.virages.every(Boolean), mesure.virages.map(v => v ? '✔' : '✘').join(''));
    T('obliques — « Reproduction » CE1 se joue au tracé au doigt',
      mesure.modes.length === 1 && mesure.modes[0] === 'tracer', JSON.stringify(mesure.modes));
  }

  /* ============================================================
     LE PETIT VITRAIL — LE CÔTÉ PARTAGÉ EST UN SEUL SEGMENT
     ------------------------------------------------------------
     C’est le gain que le brief attendait de la conversion : deux pièces qui
     se CHEVAUCHENT, ou qui se touchent par un SEUL POINT, cessent d’être
     exprimables au lieu d’être vérifiées après coup. Deux modèles d’une
     première version étaient fautifs pour cette raison exacte.
     ============================================================ */
  {
    await page.goto(base + '?competence=cp-assembler');
    await page.waitForTimeout(400);
    /* On trace CHAQUE pièce en entier, l’une après l’autre — donc en
       repassant sur le côté qu’elles partagent, comme le ferait l’enfant. */
    const contours = await page.evaluate(() => {
      const t = chantier.trace;
      return file[pos].solutions[0].map(ct => {
        const c = ct.map(p => t.versGrille(p).map(Math.round)); c.push(c[0]); return c;
      });
    });
    for (const c of contours) await tracerChemin(page, c);
    const partage = await page.evaluate(async () => {
      const t = chantier.trace;
      /* Les côtés que DEUX pièces attendent : ce sont eux qui doivent
         n’exister qu’une fois dans le tracé. */
      const compte = {};
      file[pos].solutions[0].forEach(ct => {
        segmentsDeSolution([ct], chantier.z).forEach(k => { compte[k] = (compte[k] || 0) + 1; });
      });
      const communs = Object.keys(compte).filter(k => compte[k] > 1);
      const doublons = communs.filter(k => !t.traces.has(k));
      desarmerAutoSuivant();
      document.getElementById('btnValider').click();
      await new Promise(r => setTimeout(r, 90));
      return {pieces:file[pos].solutions[0].length, faces:chantier.contours.length,
              communs:communs.length, absents:doublons.length,
              traits:t.traces.size, ok:file[pos]._ok};
    });
    T('vitrail — le modèle a bien des côtés partagés à éprouver',
      partage.communs > 0 && partage.pieces >= 2, JSON.stringify(partage));
    T('vitrail — un côté partagé n’existe qu’une fois dans le tracé, repassé ou non',
      partage.absents === 0, partage.communs + ' côté(s) partagé(s), ' + partage.absents + ' manquant(s)');
    T('vitrail — l’arrangement rend exactement autant de pièces que le modèle',
      partage.faces === partage.pieces, partage.faces + ' pour ' + partage.pieces);
    T('vitrail — et l’assemblage est accepté', partage.ok === true, JSON.stringify({ok:partage.ok}));
  }

  /* ============================================================
     LE VERRE D’UNE PIÈCE EST LE MÊME PARTOUT
     ------------------------------------------------------------
     Trois rendus choisissaient la couleur, chacun avec son propre index — le
     tracé en cours comptait les faces de la manche, le panneau comptait ses
     entrées — si bien qu’une pièce changeait de verre entre le moment où
     l’enfant la remplissait et celui où il la retrouvait dans son vitrail.
     ============================================================ */
  {
    await page.goto(base + '?competence=cp-reproduire');
    await page.waitForTimeout(400);
    const suivi = [];
    for (let m = 0; m < 5; m++) {
      await tracerChemin(page);
      const enTracant = await page.evaluate(() =>
        [...document.querySelectorAll('#tracage .trace-face')].map(e => e.getAttribute('fill')));
      await page.evaluate(async () => {
        desarmerAutoSuivant();
        document.getElementById('btnValider').click();
        await new Promise(r => setTimeout(r, 80));
      });
      await page.waitForTimeout(120);
      const recap = await page.evaluate(() =>
        [...document.querySelectorAll('#vitrailSvg path')].map(e => e.getAttribute('fill')));
      suivi.push({enTracant:enTracant[0], recap:recap[recap.length - 1]});
      await page.evaluate(() => document.getElementById('btnNext').click());
      await page.waitForTimeout(320);
    }
    T('verre — la pièce garde en s’affichant au panneau la couleur qu’elle avait en se remplissant',
      suivi.every(x => x.enTracant && x.enTracant === x.recap),
      JSON.stringify(suivi.map(x => x.enTracant + (x.enTracant === x.recap ? '=' : '≠') + x.recap)));
    T('verre — et la couleur varie tout de même d’une pièce à l’autre',
      new Set(suivi.map(x => x.recap)).size === suivi.length,
      new Set(suivi.map(x => x.recap)).size + ' couleurs pour ' + suivi.length + ' pièces');
    const fin = await page.evaluate(() =>
      [...document.querySelectorAll('#endVitrailSvg path')].map(e => e.getAttribute('fill')));
    T('verre — et l’écran de fin montre les mêmes verres, dans le même ordre',
      JSON.stringify(fin) === JSON.stringify(suivi.map(x => x.recap)), fin.join(' '));

    /* AVEC UNE MANCHE RATÉE AU MILIEU, et c’est le cas qui compte : tant que
       la partie est parfaite, le rang de la manche et celui du panneau
       coïncident, et recalculer la couleur au lieu de la lire donne le même
       résultat. Un échec les décale — le panneau se mettrait alors à
       recolorier les pièces déjà montrées. */
    await page.goto(base + '?competence=cp-reproduire');
    await page.waitForTimeout(400);
    const apresEchec = [];
    for (let m = 0; m < 3; m++) {
      const rate = (m === 1);
      const chemin = await page.evaluate((rate) => {
        const t = chantier.trace;
        const c = file[pos].solutions[0][0].map(p => t.versGrille(p).map(Math.round));
        if (rate) {   // on allonge d’une maille : figure close, mais fausse
          const u = [Math.sign(c[1][0] - c[0][0]), Math.sign(c[1][1] - c[0][1])];
          const sens = (c[1][0] + u[0] <= t.zone.nx && c[1][1] + u[1] <= t.zone.ny
                        && c[2][0] + u[0] <= t.zone.nx && c[2][1] + u[1] <= t.zone.ny) ? 1 : -1;
          c[1] = [c[1][0] + u[0]*sens, c[1][1] + u[1]*sens];
          c[2] = [c[2][0] + u[0]*sens, c[2][1] + u[1]*sens];
        }
        c.push(c[0]);
        return c;
      }, rate);
      await tracerChemin(page, chemin);
      const enTracant = await page.evaluate(() =>
        [...document.querySelectorAll('#tracage .trace-face')].map(e => e.getAttribute('fill'))[0]);
      const ok = await page.evaluate(async () => {
        desarmerAutoSuivant();
        document.getElementById('btnValider').click();
        await new Promise(r => setTimeout(r, 90));
        return file[pos]._ok;
      });
      await page.waitForTimeout(120);
      const recap = await page.evaluate(() =>
        [...document.querySelectorAll('#vitrailSvg path')].map(e => e.getAttribute('fill')));
      apresEchec.push({manche:m + 1, ok, enTracant, panneau:recap});
      await page.evaluate(() => document.getElementById('btnNext').click());
      await page.waitForTimeout(320);
    }
    const reussies = apresEchec.filter(x => x.ok);
    T('verre — la manche du milieu a bien été ratée, donc les rangs se décalent',
      apresEchec.map(x => x.ok ? '✔' : '✘').join('') === '✔✘✔',
      apresEchec.map(x => x.ok ? '✔' : '✘').join(''));
    T('verre — après une manche ratée, le panneau garde la couleur de chaque pièce',
      reussies.length === 2
      && reussies.every((x, k) => x.panneau[k] === x.enTracant)
      && apresEchec[2].panneau.length === 2,
      JSON.stringify(reussies.map(x => x.enTracant + '→' + x.panneau.join('|'))));

  }


  /* ============================================================
     LE DOIGT DE L’ENFANT, ET CE QU’ON LUI DIT
     ------------------------------------------------------------
     Trois retours d’appareil au même endroit : le sommet ne se pose pas
     toujours, le rond blanc ne dit rien, et « Vérifier » n’apparaît pas alors
     qu’on croit avoir fini. Les trois se tiennent : un tap refusé laisse la
     pièce ouverte, et rien n’explique qu’il faut la fermer.
     ============================================================ */
  {
    await page.goto(base + '?competence=ce1-completer');
    await page.waitForTimeout(400);
    const prep = await page.evaluate(() => {
      const i = file.findIndex(q => q.support === 'uni');
      pos = i; manche();
      return {sol:file[pos].solutions[0][0], seuil:SEUIL_GLISSEMENT};
    });
    const taper = async (pt, derive) => {
      const e = await page.evaluate((p) => {
        const svg = document.getElementById('scene'), m = svg.getScreenCTM(), q = svg.createSVGPoint();
        q.x = p[0]; q.y = p[1];
        const t = q.matrixTransform(m);
        return {x:t.x, y:t.y};
      }, pt);
      await page.mouse.move(e.x, e.y);
      await page.mouse.down();
      if (derive) for (let i = 1; i <= 4; i++) await page.mouse.move(e.x + derive*i/4, e.y + derive*i/4);
      await page.mouse.up();
      await page.waitForTimeout(50);
      return page.evaluate(() => ({sommets:chantier.sommets.length,
        contours:chantier.contours.length,
        valider:!document.getElementById('btnValider').disabled,
        etiquette:!!document.querySelector('.etiquette-fermer')}));
    };
    /* UN TAP QUI DÉRIVE RESTE UN TAP. À 8 px de seuil, un doigt d’enfant sur
       du verre passait pour un défilement et ne posait rien. */
    const avant = await page.evaluate(() => chantier.sommets.length);
    const derive = await taper(prep.sol[2], 10);
    T('doigt — un tap qui dérive de 10 px pose quand même le sommet',
      derive.sommets === avant + 1, avant + ' → ' + derive.sommets + ' (seuil ' + prep.seuil + ' px)');
    T('doigt — le repère de fermeture porte son étiquette',
      derive.etiquette === true, 'étiquette « ferme ici » ' + (derive.etiquette ? 'présente' : 'absente'));
    T('doigt — tant que la pièce est ouverte, « Vérifier » reste éteint',
      derive.valider === false && derive.contours === 0, JSON.stringify(derive));
    const ferme = await taper(prep.sol[3], 0);
    T('doigt — et il s’allume dès que la pièce est fermée',
      ferme.valider === true && ferme.contours === 1, JSON.stringify(ferme));
  }

  /* ============================================================
     LE CE1 — le tracé et l’INSTRUMENT sur le même écran
     ------------------------------------------------------------
     La surface de capture du tracé couvre toute la vue : au-dessus, elle
     volerait ses appuis à l’équerre, et le seul mini-jeu où l’instrument fait
     le travail deviendrait injouable. Le tracé passe donc dessous.
     ============================================================ */
  {
    await page.goto(base + '?competence=ce1-completer');
    await page.waitForTimeout(400);
    const plan = await page.evaluate(() => {
      const modes = file.map(q => ({mode:q.mode, support:q.support}));
      const i = file.findIndex(q => (q.instruments || []).indexOf('equerre') >= 0 && q.support !== 'uni');
      pos = i; manche();
      const barre = [...document.querySelectorAll('#barreOutils .outil')].map(b => b.textContent.trim());
      const bEq = [...document.querySelectorAll('#barreOutils .outil')].find(b => /équerre/i.test(b.textContent));
      if (bEq) bEq.click();
      const svg = document.getElementById('scene');
      const eq = svg.querySelector('#instruments .posable');
      let atteignable = null;
      if (eq) {
        const r = eq.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width * 0.2, r.y + r.height * 0.8);
        atteignable = !!(el && el.closest('#instruments'));
      }
      const ids = [...svg.children].map(e => e.id).filter(Boolean);
      return {modes, barre, pose:!!eq, atteignable,
              ordre:ids.indexOf('tracage') < ids.indexOf('instruments'), ids};
    });
    /* Contrôle STRUCTUREL et non positionnel : c’est le support qui décide du
       geste, pas le rang de la manche — sans quoi le test se casse au premier
       changement de composition. */
    T('plan à finir — le geste suit le SUPPORT : tracé sur nœuds, pose sur papier uni',
      plan.modes.every(m => (m.support === 'uni') === (m.mode !== 'tracer'))
      && plan.modes.some(m => m.mode === 'tracer') && plan.modes.some(m => m.support === 'uni'),
      JSON.stringify(plan.modes.map(m => m.support + ':' + (m.mode || 'poser'))));
    T('plan à finir — l’équerre reste offerte en mode tracé',
      plan.barre.some(t => /équerre/i.test(t)) && plan.pose === true, JSON.stringify(plan.barre));
    T('plan à finir — et le doigt la trouve : la surface du tracé passe DESSOUS',
      plan.atteignable === true && plan.ordre === true, JSON.stringify(plan.ids));
  }


  /* ============================================================
     L’INSTRUMENT S’AIMANTE AUX POINTS DÉJÀ DESSINÉS
     ------------------------------------------------------------
     Une équerre dont le coin tombe à trois pixels du sommet ne dit pas si
     l’angle est droit : elle donne une impression. On cale l’instrument SUR
     un point, on ne le pose pas à côté.
     ============================================================ */
  {
    await page.goto(base + '?competence=ce1-completer');
    await page.waitForTimeout(400);
    const prep = await page.evaluate(() => {
      const i = file.findIndex(q => (q.instruments || []).indexOf('equerre') >= 0 && q.support !== 'uni');
      pos = i; manche();
      [...document.querySelectorAll('#barreOutils .outil')]
        .find(x => /équerre/i.test(x.textContent)).click();
      const svg = document.getElementById('scene');
      const eq = document.querySelector('#instruments .posable');
      const t = eq.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/);
      const corps = eq.querySelector('.corps').getBoundingClientRect();
      /* La SOLUTION ne doit surtout PAS être aimantable : l’équerre
         désignerait la réponse, et l’exercice deviendrait un jeu d’adresse. */
      const sol = file[pos].solutions.map(s2 => s2[0][2]);
      const donnes = pointsRemarquables();
      const proche = (p, l) => l.some(q => Math.hypot(q[0]-p[0], q[1]-p[1]) < 1);
      return {x:+t[1], y:+t[2], ech:svg.getScreenCTM().a,
              prise:{x:corps.x + corps.width/2, y:corps.y + corps.height/2},
              cibles:donnes, solAimantable:sol.some(p => proche(p, donnes)), nbSol:sol.length};
    });
    const glisserVers = async (cible, ecart) => {
      await page.evaluate(([x, y]) => {
        document.querySelector('#instruments .posable')
          .setAttribute('transform', `translate(${x},${y}) rotate(0)`);
      }, [prep.x, prep.y]);
      const dx = (cible[0] + ecart*0.6) - prep.x, dy = (cible[1] + ecart*0.8) - prep.y;
      await page.mouse.move(prep.prise.x, prep.prise.y);
      await page.mouse.down();
      /* Le détour, même raison qu’à la règle plus bas : sous le seuil de
         glissement le geste serait un tap, pas une prise d’instrument. */
      for (let i = 1; i <= 5; i++) await page.mouse.move(prep.prise.x + 24*i, prep.prise.y + 12*i);
      for (let i = 1; i <= 10; i++)
        await page.mouse.move(prep.prise.x + dx*prep.ech*i/10, prep.prise.y + dy*prep.ech*i/10);
      await page.mouse.up();
      return page.evaluate((c) => {
        const t = document.querySelector('#instruments .posable')
          .getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/);
        return +Math.hypot(+t[1]-c[0], +t[2]-c[1]).toFixed(2);
      }, cible);
    };
    T('aimant — les points aimantants existent, et ce sont ceux du DONNÉ',
      prep.cibles.length >= 2, JSON.stringify(prep.cibles.map(p => p.map(Math.round))));
    T('aimant — la solution n’en fait PAS partie : l’équerre ne désigne pas la réponse',
      prep.solAimantable === false, prep.nbSol + ' solution(s) possible(s)');
    const pres = await glisserVers(prep.cibles[0], 9);
    T('aimant — approché à 9 unités, le coin de l’équerre tombe PILE sur le sommet',
      pres < 0.01, 'écart ' + pres);
    const loin = await glisserVers(prep.cibles[0], 20);
    T('aimant — approché à 20 unités, il reste libre : l’instrument n’est pas collant',
      loin > 5, 'écart ' + loin);

    /* EN ROTATION, C’EST L’ANGLE QUI S’AIMANTE, pas la position — déplacer
       l’instrument pendant qu’on l’oriente le ferait sauter sous le doigt. On
       aligne un BORD sur un point déjà dessiné : c’est le geste réel, on fait
       pivoter l’équerre jusqu’à ce que son côté tombe sur le coin d’en face.
       La rotation est PILOTÉE EN ANGLE DE SCÈNE ; la piloter en pixels écran
       mélangeait deux repères et le test se trompait de coupable. */
    const angles = await page.evaluate(() => {
      const essai = (ecartDeg) => {
        const i = file.findIndex(q => (q.instruments || []).indexOf('equerre') >= 0 && q.support !== 'uni');
        pos = i; manche();
        [...document.querySelectorAll('#barreOutils .outil')]
          .find(x => /équerre/i.test(x.textContent)).click();
        const p = chantier.posables[0], g = p.g, poi = g.querySelector('.poignee');
        const svg = document.getElementById('scene'), m = svg.getScreenCTM();
        const cibles = pointsRemarquables();
        const vers = (pt) => { const q = svg.createSVGPoint(); q.x = pt[0]; q.y = pt[1];
          const t = q.matrixTransform(m); return [t.x, t.y]; };
        const inv = (X, Y) => { const q = svg.createSVGPoint(); q.x = X; q.y = Y;
          const t = q.matrixTransform(m.inverse()); return [t.x, t.y]; };
        /* L’ÉVÉNEMENT PART DE LA POIGNÉE : c’est `e.target` qui distingue
           rotation et translation. Dispatché sur le groupe, il se lisait comme
           une translation et le test échouait pour une raison étrangère. */
        const env = (t, P, sur) => { const e = vers(P);
          (sur || g).dispatchEvent(new PointerEvent(t, {clientX:e[0], clientY:e[1], pointerId:31, bubbles:true})); };
        const e0 = p.etat(), corps = g.querySelector('.corps').getBoundingClientRect();
        const prise = inv(corps.x + corps.width/2, corps.y + corps.height/2);
        const d = [cibles[0][0] - e0.x, cibles[0][1] - e0.y];
        env('pointerdown', prise);
        for (let k = 1; k <= 8; k++) env('pointermove', [prise[0] + d[0]*k/8, prise[1] + d[1]*k/8]);
        env('pointerup', [prise[0] + d[0], prise[1] + d[1]]);
        const o = p.etat();
        const vise = Math.atan2(cibles[1][1] - o.y, cibles[1][0] - o.x);
        const pr = poi.getBoundingClientRect();
        const prise2 = inv(pr.x + pr.width/2, pr.y + pr.height/2);
        const R = Math.hypot(prise2[0] - o.x, prise2[1] - o.y);
        const ang0 = Math.atan2(prise2[1] - o.y, prise2[0] - o.x);
        const cible = ang0 + (vise + ecartDeg*Math.PI/180 - o.angle);
        env('pointerdown', prise2, poi);
        for (let k = 1; k <= 12; k++) { const t = ang0 + (cible - ang0)*k/12;
          env('pointermove', [o.x + R*Math.cos(t), o.y + R*Math.sin(t)]); }
        env('pointerup', [o.x + R*Math.cos(cible), o.y + R*Math.sin(cible)]);
        const fin = p.etat();
        let dmin = Infinity;
        p.ancres().forEach(A => {
          const u = [A[0]-fin.x, A[1]-fin.y]; if (Math.hypot(u[0], u[1]) < 1e-6) return;
          const v = [cibles[1][0]-fin.x, cibles[1][1]-fin.y];
          dmin = Math.min(dmin, Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0], u[0]*v[0]+u[1]*v[1])));
        });
        return {coin:Math.hypot(o.x-cibles[0][0], o.y-cibles[0][1]) < 0.01,
                ecart:+(dmin*180/Math.PI).toFixed(2),
                bouge:+Math.hypot(fin.x-o.x, fin.y-o.y).toFixed(4)};
      };
      return {pres:essai(3), loin:essai(20)};
    });
    T('aimant — le coin est bien posé sur un sommet avant qu’on tourne',
      angles.pres.coin === true && angles.loin.coin === true, JSON.stringify(angles));
    T('aimant — tourné à 3° d’un sommet, le bord de l’équerre pointe PILE dessus',
      angles.pres.ecart < 0.01, 'écart final ' + angles.pres.ecart + '°');
    T('aimant — tourné à 20°, il reste où l’enfant l’a mis',
      angles.loin.ecart > 10, 'écart final ' + angles.loin.ecart + '°');
    T('aimant — et l’aimantation d’angle ne déplace jamais l’instrument',
      angles.pres.bouge === 0 && angles.loin.bouge === 0,
      JSON.stringify([angles.pres.bouge, angles.loin.bouge]));

    /* LA RÈGLE ACCROCHE PAR N’IMPORTE QUELLE GRADUATION, pas seulement par son
       origine : poser le 7 sur un sommet est aussi légitime que d’y poser le
       0, et c’est ainsi qu’on mesure. Éprouvé sur papier UNI, là où
       l’instrument est le seul moyen d’être exact. On lit les ancres RÉELLES
       (`ancres()`) : un test qui refait le calcul du code se trompe pour son
       propre compte — celui-ci cherchait des graduations tous les 13 px quand
       l’unité en vaut 25, et accusait le code d’une erreur qui était la
       sienne. */
    await page.goto(base + '?competence=ce1-completer');
    await page.waitForTimeout(400);
    const pose = await page.evaluate(() => {
      const i = file.findIndex(q => q.support === 'uni');
      pos = i; manche();
      [...document.querySelectorAll('#barreOutils .outil')]
        .find(x => /règle/i.test(x.textContent)).click();
      const svg = document.getElementById('scene');
      const p = chantier.posables[0], anc = p.ancres(), pts = pointsRemarquables();
      /* LE COUPLE (graduation, point) EST CHOISI, PAS SUPPOSÉ. L’aimantation
         retient le rapprochement le PLUS COURT entre TOUTES les graduations
         et TOUS les points dessinés : viser au jugé laissait une autre paire
         gagner selon la position tirée au sort de la figure, et le test
         échouait alors pour sa propre erreur. On cherche donc la paire qui
         gagnera — graduation non extrême, et aucune concurrente plus proche
         une fois la règle posée. */
      let k = -1, cible = null;
      for (let c = 1; c < anc.length - 1 && k < 0; c++) for (let j = 0; j < pts.length; j++) {
        const d = [pts[j][0] + 4 - anc[c][0], pts[j][1] + 4 - anc[c][1]];
        let visee = 0, autres = Infinity;
        anc.forEach((a, ii) => pts.forEach((q, jj) => {
          const dd = Math.hypot(a[0]+d[0]-q[0], a[1]+d[1]-q[1]);
          if (ii === c && jj === j) visee = dd; else autres = Math.min(autres, dd);
        }));
        if (visee < AIMANT_INSTRUMENT && visee < autres) { k = c; cible = pts[j]; break; }
      }
      const corps = document.querySelector('#instruments .posable .corps').getBoundingClientRect();
      return {cible, k, d:[cible[0] + 4 - anc[k][0], cible[1] + 4 - anc[k][1]],
              ech:svg.getScreenCTM().a,
              prise:{x:corps.x + corps.width/2, y:corps.y + corps.height/2}};
    });
    await page.mouse.move(pose.prise.x, pose.prise.y);
    await page.mouse.down();
    /* UN DÉTOUR AVANT LA CIBLE, et c’est le seuil qui l’impose. Un instrument
       ne se saisit qu’au-delà de `SEUIL_GLISSEMENT` : en dessous, le geste est
       un TAP, qui pose un point au lieu de déplacer la règle. Or la règle
       tombe parfois à quelques unités de sa cible, et le trajet direct est
       alors trop court pour être un glissement — mesuré, un déplacement
       demandé de 7 sur 5 ne bougeait rien et posait un sommet, une fois sur
       dix. On s’éloigne donc franchement d’abord : seule la position finale
       compte, les aimantations en chemin ne s’accumulent pas puisque la
       position se recalcule sur le doigt à chaque mouvement. */
    for (let i = 1; i <= 5; i++) await page.mouse.move(pose.prise.x + 24*i, pose.prise.y + 12*i);
    for (let i = 1; i <= 10; i++)
      await page.mouse.move(pose.prise.x + pose.d[0]*pose.ech*i/10,
                            pose.prise.y + pose.d[1]*pose.ech*i/10);
    await page.mouse.up();
    const regle = await page.evaluate((c) => {
      const anc = chantier.posables[0].ancres();
      let m = Infinity, quelle = -1;
      anc.forEach((a, i) => { const d = Math.hypot(a[0]-c[0], a[1]-c[1]); if (d < m) { m = d; quelle = i; } });
      return {ecartMin:+m.toFixed(2), quelle, nb:anc.length};
    }, pose.cible);
    T('aimant — la règle accroche par une graduation quelconque, pas seulement par son origine',
      regle.ecartMin < 0.01 && regle.quelle === pose.k
      && regle.quelle !== 0 && regle.quelle !== regle.nb - 1,
      'graduation n°' + regle.quelle + ' (visée ' + pose.k + ') sur ' + regle.nb
        + ', écart ' + regle.ecartMin);

    /* ET ON LA FAIT TOURNER, EN REGARDANT LE BON POINT.
       CE TEST MESURAIT UN LEURRE : il vérifiait que le `translate()` du groupe
       ne bougeait pas, et en concluait que la règle ne « sautait » pas. Or
       `rotate()` tourne autour de l’ORIGINE LOCALE de l’habillage, qui pour la
       règle tombe en son MILIEU : le translate restait donc parfaitement
       immobile pendant que la graduation calée sur un sommet en glissait. Le
       test était vert et l’instrument faux — on ne pouvait pas poser la règle
       sur un coin et la faire tourner autour.
       Ce qui compte est la SEULE chose qu’on veut garantir : la graduation
       aimantée reste sur son point. Le translate, lui, DOIT bouger — c’est
       ainsi qu’une rotation autour d’un point excentré se réalise. */
    const rotRegle = await page.evaluate((cible) => {
      const p = chantier.posables[0], avant = p.etat();
      const ancreAvant = p.ancres().reduce((m, a) =>
        Math.hypot(a[0]-cible[0], a[1]-cible[1]) < Math.hypot(m[0]-cible[0], m[1]-cible[1]) ? a : m);
      const iAncre = p.ancres().findIndex(a => a[0] === ancreAvant[0] && a[1] === ancreAvant[1]);
      const poi = p.g.querySelector('.poignee'), po = poi.getBoundingClientRect();
      const cx = po.x + po.width/2, cy = po.y + po.height/2;
      const env = (t, X, Y, sur) => (sur || p.g).dispatchEvent(new PointerEvent(t,
        {clientX:X, clientY:Y, pointerId:22, bubbles:true}));
      env('pointerdown', cx, cy, poi);
      for (let i = 1; i <= 8; i++) env('pointermove', cx + 5*i, cy - 4*i);
      env('pointerup', cx + 40, cy - 32);
      const apres = p.etat(), ancreApres = p.ancres()[iAncre];
      return {aTourne:Math.abs(apres.angle - avant.angle) > 0.02,
              /* de combien la graduation calée a quitté son sommet */
              glissement:+Math.hypot(ancreApres[0]-ancreAvant[0], ancreApres[1]-ancreAvant[1]).toFixed(3),
              deplacement:+Math.hypot(apres.x - avant.x, apres.y - avant.y).toFixed(3),
              iAncre};
    }, pose.cible);
    T('aimant — la règle tourne aussi par sa poignée',
      rotRegle.aTourne === true, JSON.stringify({aTourne:rotRegle.aTourne}));
    T('pivot — la règle tourne AUTOUR de la graduation calée : elle ne quitte pas son sommet',
      rotRegle.glissement < 0.01,
      'graduation n°' + rotRegle.iAncre + ', glissement ' + rotRegle.glissement + ' px');
    T('pivot — et le groupe se déplace pour cela : tourner autour d’un point excentré n’est pas tourner sur place',
      rotRegle.deplacement > 1, 'translation ' + rotRegle.deplacement + ' px');

    /* SANS CALAGE, LA RÈGLE PIVOTE PAR SON ZÉRO — une extrémité, pas son
       milieu. C’est le point de tenue que son habillage désigne, et le seul
       que l’enfant voit. */
    const pivotLibre = await page.evaluate(() => {
      const svg = document.getElementById('scene');
      const p = chantier.posables[0];
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      const versClient = (s) => { pt.x = s[0]; pt.y = s[1];
        const e = pt.matrixTransform(m); return {x:e.x, y:e.y}; };
      const env = (t, X, Y, sur) => (sur || p.g).dispatchEvent(new PointerEvent(t,
        {clientX:X, clientY:Y, pointerId:31, bubbles:true}));
      const glisserVers = (s) => {
        const corps = p.g.querySelector('.corps').getBoundingClientRect();
        const prise = {x:corps.x + corps.width/2, y:corps.y + corps.height/2};
        const c = versClient(s);
        env('pointerdown', prise.x, prise.y);
        for (let i = 1; i <= 8; i++)
          env('pointermove', prise.x + (c.x-prise.x)*i/8, prise.y + (c.y-prise.y)*i/8);
        env('pointerup', c.x, c.y);
      };
      /* LA PRÉMISSE EST VÉRIFIÉE, PAS SUPPOSÉE : « sans calage » veut dire
         qu’aucune graduation n’est à portée d’aimant d’un point dessiné.
         Un premier essai posait la règle contre la figure, elle s’y accrochait
         par son dernier trait, et le test croyait mesurer le pivot par défaut
         alors qu’il mesurait un calage. */
      const loinDeTout = () => {
        const pts = pointsRemarquables();
        return p.ancres().every(a => pts.every(q =>
          Math.hypot(a[0]-q[0], a[1]-q[1]) > AIMANT_INSTRUMENT + 1));
      };
      const essais = [[ZONE_PLEINE_UNI.x0 + 6, ZONE_PLEINE_UNI.y1 - 4],
                      [ZONE_PLEINE_UNI.x0 + 6, ZONE_PLEINE_UNI.y0 + 4],
                      [ZONE_PLEINE_UNI.x1 - 6, ZONE_PLEINE_UNI.y1 - 4]];
      let libre = false;
      for (const s of essais) { glisserVers(s); if (loinDeTout()) { libre = true; break; } }
      const anc = p.ancres(), avant = anc.map(a => a.slice());
      const poi = p.g.querySelector('.poignee'), po = poi.getBoundingClientRect();
      const cx = po.x + po.width/2, cy = po.y + po.height/2;
      env('pointerdown', cx, cy, poi);
      for (let i = 1; i <= 8; i++) env('pointermove', cx + 6*i, cy - 5*i);
      env('pointerup', cx + 48, cy - 40);
      const apres = p.ancres();
      const bouges = apres.map((a, i) => +Math.hypot(a[0]-avant[i][0], a[1]-avant[i][1]).toFixed(2));
      let iFixe = 0;
      bouges.forEach((d, i) => { if (d < bouges[iFixe]) iFixe = i; });
      return {libre, n:bouges.length, iFixe, fixe:bouges[iFixe],
              zero:bouges[0], bout:bouges[bouges.length-1]};
    });
    T('pivot — la prémisse tient : la règle est bien posée loin de tout point aimantant',
      pivotLibre.libre === true, JSON.stringify({libre:pivotLibre.libre}));
    T('pivot — sans calage, la règle pivote par son ZÉRO : cette extrémité ne bouge pas',
      pivotLibre.iFixe === 0 && pivotLibre.zero < 0.01,
      'graduation fixe n°' + pivotLibre.iFixe + '/' + (pivotLibre.n - 1)
        + ', déplacement ' + pivotLibre.fixe + ' px');
    T('pivot — et c’est bien l’autre extrémité qui balaie',
      pivotLibre.bout > 10, 'autre bout ' + pivotLibre.bout + ' px');
  }

  /* ============================================================
     L’INSTRUMENT NE MANGE QUE LES GLISSEMENTS
     ------------------------------------------------------------
     Il couvre une large part du panneau, et c’est là qu’on veut poser des
     points : sur une graduation, à la longueur qu’on vient de mesurer. Tant
     qu’il coupait la propagation dès le `pointerdown`, tout tap tombant sur
     son corps était perdu — « je place un point par touche de doigt et il
     n’apparaît pas ». Le partage se fait sur UN SEUL SEUIL, le même que
     `brancherPose` : en dessous le tap traverse, au-dessus l’instrument
     prend la main et `brancherPose`, qui a vu les mêmes mouvements, renonce
     de lui-même.
     ============================================================ */
  {
    /* Amène la manche de `ce1-construire` qui a une équerre, sort
       l’instrument, et rend de quoi viser une graduation NON extrême. */
    const armer = (outil) => page.evaluate((nom) => {
      desarmerAutoSuivant();
      const svg = document.getElementById('scene');
      [...document.querySelectorAll('#barreOutils .outil')]
        .find(x => new RegExp(nom, 'i').test(x.textContent)).click();
      const p = chantier.posables[0], anc = p.ancres();
      const k = Math.floor(anc.length / 3);       // ni l’origine, ni le bout
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = anc[k][0]; pt.y = anc[k][1];
      const e = pt.matrixTransform(m);
      const el = document.elementFromPoint(e.x, e.y);
      return {ancre:anc[k], client:{x:e.x, y:e.y}, nbAncres:anc.length,
              surInstrument:!!(el && el.closest('#instruments')),
              sommets:chantier.sommets.length, etat:p.etat()};
    }, outil);

    await page.goto(base + '?competence=ce1-construire');
    await page.waitForTimeout(400);
    const avant = await armer('équerre');
    T('graduation — la graduation visée est bien SOUS le corps de l’équerre',
      avant.surInstrument === true && avant.nbAncres > 4,
      avant.nbAncres + ' ancres, sous l’instrument : ' + avant.surInstrument);

    /* LE TAP. Envoyé sur l’élément réellement sous le doigt — dispatcher sur
       le <svg> contournerait précisément ce qu’on éprouve. */
    const tapGrad = await page.evaluate((av) => {
      const el = document.elementFromPoint(av.client.x, av.client.y);
      ['pointerdown','pointerup'].forEach(t => el.dispatchEvent(new PointerEvent(t,
        {clientX:av.client.x, clientY:av.client.y, pointerId:31, bubbles:true})));
      const s = chantier.sommets;
      return {n:s.length, dernier:s[s.length-1],
              ecart:s.length ? +Math.hypot(s[s.length-1][0]-av.ancre[0],
                                           s[s.length-1][1]-av.ancre[1]).toFixed(2) : null,
              bouge:+Math.hypot(chantier.posables[0].etat().x - av.etat.x,
                                chantier.posables[0].etat().y - av.etat.y).toFixed(2)};
    }, avant);
    T('graduation — un tap sur une mesure de l’équerre pose un sommet',
      tapGrad.n === avant.sommets + 1, JSON.stringify({avant:avant.sommets, apres:tapGrad.n}));
    T('graduation — et le sommet se cale EXACTEMENT sur la graduation visée',
      tapGrad.ecart !== null && tapGrad.ecart < 0.01, 'écart ' + tapGrad.ecart);
    T('graduation — un tap ne déplace pas l’instrument',
      tapGrad.bouge === 0, 'déplacement ' + tapGrad.bouge);

    /* LE MÊME SEUIL DES DEUX CÔTÉS. Un geste court fait un point et rien
       d’autre ; un geste long déplace l’instrument et ne pose rien. S’ils
       divergeaient, il existerait une bande de gestes qui font les deux — ou
       qui ne font rien. On joue de VRAIS gestes souris : la capture de
       pointeur ne se simule pas. */
    await page.goto(base + '?competence=ce1-construire');
    await page.waitForTimeout(400);
    const court = await armer('équerre');
    await page.mouse.move(court.client.x, court.client.y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(court.client.x + 2*i, court.client.y + i);
    await page.mouse.up();
    const apresCourt = await page.evaluate((av) => ({
      n:chantier.sommets.length,
      bouge:+Math.hypot(chantier.posables[0].etat().x - av.etat.x,
                        chantier.posables[0].etat().y - av.etat.y).toFixed(2)
    }), court);
    T('seuil — un geste plus court que le seuil pose un point sans bouger l’instrument',
      apresCourt.n === court.sommets + 1 && apresCourt.bouge === 0, JSON.stringify(apresCourt));

    await page.goto(base + '?competence=ce1-construire');
    await page.waitForTimeout(400);
    const long = await armer('équerre');
    await page.mouse.move(long.client.x, long.client.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(long.client.x + 5*i, long.client.y + 3*i);
    await page.mouse.up();
    const apresLong = await page.evaluate((av) => ({
      n:chantier.sommets.length,
      bouge:+Math.hypot(chantier.posables[0].etat().x - av.etat.x,
                        chantier.posables[0].etat().y - av.etat.y).toFixed(2)
    }), long);
    T('seuil — un geste plus long déplace l’instrument et ne pose aucun point',
      apresLong.n === long.sommets && apresLong.bouge > 5, JSON.stringify(apresLong));

    /* EN MODE TRACÉ, LE MÊME PARTAGE — et c’est là que la capture de pointeur
       se joue : `setPointerCapture` est exclusif, si bien que le moteur de
       tracé, en capturant sur le <svg>, volait le pointeur à l’instrument,
       qui restait figé sous le doigt. Un seul geste éprouve les deux moitiés :
       l’équerre suit le doigt, et le crayon n’écrit rien. */
    await page.goto(base + '?competence=ce1-completer');
    await page.waitForTimeout(400);
    const av = await page.evaluate(() => {
      pos = file.findIndex(q => q.mode === 'tracer' && (q.instruments || []).indexOf('equerre') >= 0);
      manche(); desarmerAutoSuivant();
      [...document.querySelectorAll('#barreOutils .outil')]
        .find(x => /équerre/i.test(x.textContent)).click();
      const svg = document.getElementById('scene');
      const corps = document.querySelector('#instruments .posable .corps').getBoundingClientRect();
      return {etat:chantier.posables[0].etat(), traces:chantier.trace.traces.size,
              prise:{x:corps.x + corps.width/2, y:corps.y + corps.height/2}};
    });
    /* LE GESTE TOURNE, et c’est ce qui le rend probant : le moteur n’écrit
       pas en chemin, il écrit au VIRAGE et au relâchement. Une trajectoire
       droite laisserait donc passer un garde-fou manquant en cours de
       glissement — mesuré : la mutation restait aveugle. Personne ne cale
       une équerre en ligne droite, de toute façon. */
    await page.mouse.move(av.prise.x, av.prise.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(av.prise.x + 6*i, av.prise.y);
    for (let i = 1; i <= 10; i++) await page.mouse.move(av.prise.x + 60, av.prise.y + 6*i);
    await page.mouse.up();
    const apresTrace = await page.evaluate((a) => ({
      traces:chantier.trace.traces.size,
      bouge:+Math.hypot(chantier.posables[0].etat().x - a.etat.x,
                        chantier.posables[0].etat().y - a.etat.y).toFixed(2)
    }), av);
    T('tracé — glisser l’équerre en travers du papier la déplace vraiment',
      apresTrace.bouge > 5, 'déplacement ' + apresTrace.bouge);
    T('tracé — et n’écrit pas un trait au passage : on déplace la règle, on ne trace pas avec',
      apresTrace.traces === av.traces, av.traces + ' → ' + apresTrace.traces);
  }

  /* ============================================================
     LA COMMANDE DU CLIENT — l’énoncé dit ce que le verdict exige
     ------------------------------------------------------------
     Deux des trois commandes annonçaient « un rectangle » ou « un carré »
     sans dire lequel, pendant que la validation réclamait 7 sur 4 et un côté
     de 5 : la figure attendue n’était nulle part dans la consigne. Et la
     mesure doit être dans `q`, le texte AFFICHÉ — `enonce` n’est que le
     texte LU.
     ============================================================ */
  {
    const dites = await page.evaluate(() => {
      const U = PX_PAR_UNITE;
      const examiner = (q) => {
        /* Les longueurs de la figure attendue, en unités. Seules celles qui
           tombent juste sur un entier sont exigibles : l’hypoténuse d’un
           triangle 6-4 ne se dicte pas. */
        const cotes = [];
        (q.solutions[0] || []).forEach(c => c.forEach((p, i) => {
          const r = c[(i+1) % c.length];
          cotes.push(Math.hypot(r[0]-p[0], r[1]-p[1]) / U);
        }));
        const entiers = [...new Set(cotes.filter(v => Math.abs(v - Math.round(v)) < 0.01)
                                         .map(Math.round))];
        const manque = entiers.filter(v => !new RegExp('(^|\\D)' + v + '(\\D|$)').test(q.q));
        return {q:q.q, entiers, manque};
      };
      return {ce1:qCe1Construire().map(examiner), ce2:qCe2ConstruireUni().map(examiner)};
    });
    [['CE1', dites.ce1], ['CE2', dites.ce2]].forEach(([niv, l]) => {
      T('commande — ' + niv + ' : la consigne AFFICHÉE dit toutes les mesures exigées',
        l.every(x => x.manque.length === 0),
        l.filter(x => x.manque.length).map(x => x.manque.join('/') + ' absents de « ' + x.q + ' »')
          .join(' | ') || l.map(x => x.entiers.join('×')).join(' '));
    });

    /* LA TOLÉRANCE EST ENCADRÉE DES DEUX CÔTÉS, et les deux bornes se
       déduisent du contenu, pas d’un goût. En haut : les mesures demandées
       sont des ENTIERS d’unités, donc au-delà de la demi-unité un 7 et un 8
       seraient le même. En bas : à 3 % de la plus petite figure, le verdict
       se jouait sur 3,75 unités de scène — moins de 4 px sous le doigt : ce
       n’est plus de la précision, c’est une loterie. */
    const bornes = await page.evaluate(() => {
      const U = PX_PAR_UNITE;
      const manches = [].concat(qCe1Construire(), qCe2ConstruireUni(),
                                qCe1Completer().filter(q => q.support === 'uni'));
      return manches.map(q => ({q:q.q, tol:+(tolerancePapierUni(q) / U).toFixed(3)}));
    });
    T('tolérance — jamais jusqu’à la demi-unité : deux mesures entières voisines restent distinctes',
      bornes.every(b => b.tol < 0.5),
      bornes.map(b => b.tol).join(' '));
    T('tolérance — jamais sous le cinquième d’unité : le doigt doit pouvoir l’atteindre',
      bornes.every(b => b.tol >= 0.2),
      bornes.filter(b => b.tol < 0.2).map(b => b.tol + ' — ' + b.q).join(' | ')
        || bornes.length + ' manches');

    /* ============================================================
       CE QU’ON ACCEPTE, PAS SEULEMENT DE COMBIEN
       ------------------------------------------------------------
       Le papier uni n’a ni ligne ni nœud, et l’énoncé ne dit ni où poser la
       figure ni comment l’orienter : un rectangle de 7 sur 4 dessiné DE
       TRAVERS est un rectangle de 7 sur 4. Le verdict compare donc des
       mesures — longueurs et angles — et non plus des coordonnées. On
       éprouve les deux bords de cette liberté : ce qu’elle ouvre, et ce
       qu’elle continue de refuser.
       ============================================================ */
    const verdicts = await page.evaluate(() => {
      const U = PX_PAR_UNITE;
      const tourner = (c, a) => {
        const o = centre(c), co = Math.cos(a), si = Math.sin(a);
        return c.map(p => [o[0] + (p[0]-o[0])*co - (p[1]-o[1])*si,
                           o[1] + (p[0]-o[0])*si + (p[1]-o[1])*co]);
      };
      return qCe1Construire().map(q => {
        const sol = q.solutions[0], tol = tolerancePapierUni(q), par = jugeParMesures(q);
        const juge = (c) => figureAcceptee(c, q.solutions, tol, q.libre, par);
        const copie = () => sol[0].map(p => p.slice());
        /* Un seul sommet écarté de 90 % de la tolérance. */
        const glisse = copie(); glisse[0] = [glisse[0][0] + tol*0.9, glisse[0][1]];
        /* Un côté allongé d’une unité entière : la mesure change. */
        const fausse = copie().map((p, k) => k === 1 || k === 2 ? [p[0]+U, p[1]] : p);
        /* La même figure, tournée de 12° et posée ailleurs. */
        const detravers = tourner(copie(), 0.21).map(p => [p[0]+35, p[1]-20]);
        /* Le même contour cisaillé : mêmes côtés, angles de 75° et 105°. */
        const cisaille = copie().map((p, k) => k >= 2 ? [p[0] + 0.9*U, p[1]] : p);
        return {q:q.q, par,
          glisse:juge([glisse]), fausse:juge([fausse]),
          detravers:juge([detravers]), cisaille:juge([cisaille])};
      });
    });
    T('acceptation — les constructions sur papier uni se jugent bien sur les MESURES',
      verdicts.every(v => v.par === true), JSON.stringify(verdicts.map(v => v.par)));
    T('acceptation — une figure juste mais tournée de 12° et posée ailleurs est acceptée',
      verdicts.every(v => v.detravers === true),
      verdicts.filter(v => !v.detravers).map(v => v.q).join(' | ') || verdicts.length + ' figures');
    T('acceptation — un sommet qui a glissé sous la tolérance est accepté',
      verdicts.every(v => v.glisse === true),
      verdicts.filter(v => !v.glisse).map(v => v.q).join(' | ') || verdicts.length + ' figures');
    T('acceptation — mais une mesure fausse d’une unité entière est refusée',
      verdicts.every(v => v.fausse === false),
      verdicts.filter(v => v.fausse).map(v => v.q).join(' | ') || verdicts.length + ' figures');
    T('acceptation — et un contour cisaillé n’est pas la figure demandée : l’angle compte',
      verdicts.every(v => v.cisaille === false),
      verdicts.filter(v => v.cisaille).map(v => v.q).join(' | ') || verdicts.length + ' figures');

    /* ============================================================
       LE CERCLE SE RATTACHE À LA FIGURE DE L’ENFANT
       ------------------------------------------------------------
       C’est le cœur du défaut signalé : deux figures enchevêtrées étaient
       jugées chacune contre des coordonnées absolues, si bien que leurs
       imprécisions s’additionnaient. Un rectangle accepté mais posé ailleurs,
       et son cercle bien mis SUR SON COIN, était refusé — on punissait
       précisément la cohérence.
       ============================================================ */
    const rattachement = await page.evaluate(() => {
      const manches = qCe1Construire();
      const parRelation = {};
      manches.forEach(q => {
        if (!q.cercles) return;
        const rel = q.cercles[0].relation;
        const sol = q.solutions[0][0];
        const tol = tolerancePapierUni(q);
        /* La figure DE L’ENFANT : la même, franchement déplacée. */
        const sien = sol.map(p => [p[0] + 60, p[1] + 60]);
        const ancres = ancresCercle(rel, sien);
        const r = 2 * PX_PAR_UNITE;
        parRelation[rel] = {
          figureAcceptee:figureAcceptee([sien], q.solutions, tol, q.libre, jugeParMesures(q)),
          /* Sur CHACUNE des ancres de sa propre figure. */
          surLesSiennes:ancres.map(a => cercleAccepte({c:a, r}, q.cercles[0], sien, tol)),
          nbAncres:ancres.length,
          /* Au même endroit qu’attendait la figure de référence : c’est
             maintenant à côté de la sienne, donc refusé. */
          surCelleDeReference:cercleAccepte({c:ancresCercle(rel, sol)[0], r}, q.cercles[0], sien, tol),
          /* Les deux tolérances, mesurées et comparées. */
          tolRattachement:+toleranceRattachement(rel, sien).toFixed(1),
          tolMesure:+tol.toFixed(1)
        };
        /* Et l’autre relation doit rester distinguable : un cercle au milieu
           n’est pas un cercle au coin. */
        const autre = rel === 'centre' ? ancresCercle('sommet', sien)[0] : centre(sien);
        parRelation[rel].confusion = cercleAccepte({c:autre, r}, q.cercles[0], sien, tol);
      });
      return parRelation;
    });
    const rels = Object.entries(rattachement);
    T('rattachement — les deux relations du CE1 sont éprouvées : « un coin » et « le milieu »',
      rels.length === 2 && rels.some(([r]) => r === 'sommet') && rels.some(([r]) => r === 'centre'),
      rels.map(([r, v]) => r + ' (' + v.nbAncres + ' ancre(s))').join(', '));
    T('rattachement — la figure déplacée de 60 px reste acceptée',
      rels.every(([, v]) => v.figureAcceptee === true),
      rels.map(([r, v]) => r + ':' + v.figureAcceptee).join(' '));
    T('rattachement — le cercle est accepté sur N’IMPORTE QUELLE ancre de la figure de l’enfant',
      rels.every(([, v]) => v.surLesSiennes.length > 0 && v.surLesSiennes.every(Boolean)),
      rels.map(([r, v]) => r + ':' + v.surLesSiennes.filter(Boolean).length + '/' + v.nbAncres).join(' '));
    T('rattachement — mais pas à l’endroit qu’occupait la figure de référence',
      rels.every(([, v]) => v.surCelleDeReference === false),
      rels.map(([r, v]) => r + ':' + v.surCelleDeReference).join(' '));
    T('rattachement — « au milieu » et « au coin » restent distinguables',
      rels.every(([, v]) => v.confusion === false),
      rels.map(([r, v]) => r + ':' + v.confusion).join(' '));
    /* Le point du signalement : ce n’est pas la même échelle de jugement. */
    T('rattachement — reconnaître un rattachement est beaucoup plus large que mesurer',
      rels.every(([, v]) => v.tolRattachement >= 4 * v.tolMesure),
      rels.map(([r, v]) => r + ' : ' + v.tolRattachement + ' px contre ' + v.tolMesure).join(' | '));

    /* VISER LE MILIEU À VUE. Sans tracer les diagonales, on ne trouve pas le
       centre d’un carré au pixel — et les tracer polluerait la figure jugée.
       L’acceptation du milieu va donc jusqu’au BORD au droit des côtés, et
       s’arrête à mi-chemin vers les coins : on balaie le carré en croix et en
       diagonale pour lire où elle s’arrête vraiment, plutôt que de croire un
       nombre écrit dans le code. */
    const balayage = await page.evaluate(() => {
      const q = qCe1Construire().find(m => m.cercles && m.cercles[0].relation === 'centre');
      const c = q.solutions[0][0], o = centre(c), r = 2 * PX_PAR_UNITE;
      const cote = dist(c[0], c[1]);
      const portee = (ux, uy) => {          // jusqu’où on peut viser à côté
        let d = 0;
        for (let t = 0; t <= cote; t += 0.5)
          if (cercleAccepte({c:[o[0]+ux*t, o[1]+uy*t], r}, q.cercles[0], c, 1)) d = t; else break;
        return +d.toFixed(1);
      };
      const s = Math.SQRT1_2;
      return {cote:+cote.toFixed(1), auMilieu:cercleAccepte({c:o, r}, q.cercles[0], c, 1),
        versCote:portee(1, 0), versCoin:portee(s, s),
        surUnCoin:cercleAccepte({c:c[0], r}, q.cercles[0], c, 1)};
    });
    T('milieu — viser le centre exactement est évidemment accepté', balayage.auMilieu === true);
    T('milieu — on peut viser jusqu’au bord au droit d’un côté : la moitié du carré',
      balayage.versCote >= 0.45 * balayage.cote,
      balayage.versCote + ' px pour un côté de ' + balayage.cote);
    T('milieu — vers un coin l’acceptation s’arrête à mi-chemin, et le coin reste un coin',
      balayage.versCoin < balayage.versCote && balayage.surUnCoin === false,
      'coin ' + balayage.versCoin + ' px contre côté ' + balayage.versCote);

    /* EN JEU, PAS SEULEMENT SUR LA RÈGLE. Éprouver `cercleAccepte` en lui
       passant soi-même le contour de l’enfant ne dit RIEN de la ligne qui
       choisit ce contour : intervertir « la figure de l’enfant » et « la
       figure attendue » dans `validerManche` restait invisible, alors que
       c’est exactement le défaut signalé. On joue donc la manche : figure
       juste posée franchement ailleurs, cercle sur SON coin, et on demande
       le verdict au jeu. */
    await page.goto(base + '?competence=ce1-construire');
    await page.waitForTimeout(400);
    const enJeu = await page.evaluate(async () => {
      const res = [];
      for (let i = 0; i < file.length; i++) {
        if (!file[i].cercles) continue;
        pos = i; manche(); desarmerAutoSuivant();
        const q = file[pos], sol = q.solutions[0][0];
        /* La figure de l’enfant : la bonne, mais 60 px plus loin. */
        const sien = sol.map(p => [p[0] + 60, p[1] + 60]);
        chantier.contours = [sien];
        chantier.cerclesPoses = [{c:ancresCercle(q.cercles[0].relation, sien)[0].slice(),
                                  r:q.cercles[0].r != null ? q.cercles[0].r : 2 * PX_PAR_UNITE}];
        validerManche(q);
        await new Promise(r => setTimeout(r, 40));
        res.push({relation:q.cercles[0].relation, ok:q._ok,
                  fb:document.getElementById('feedback').textContent.trim().slice(0, 60)});
      }
      return res;
    });
    T('rattachement — en jeu : figure posée ailleurs, cercle sur SON coin, la manche est réussie',
      enJeu.length > 0 && enJeu.every(m => m.ok === true),
      enJeu.map(m => m.relation + ':' + m.ok + (m.ok ? '' : ' « ' + m.fb + ' »')).join(' | '));

    /* ============================================================
       LE RAYON DICTÉ DU CE2 SE CONSTRUIT À LA RÈGLE
       ------------------------------------------------------------
       « Un cercle de rayon 4 » se choisissait dans une rangée de huit
       boutons : un menu, pas une construction. Le geste rejoint celui du CE1
       — on touche le centre, puis un point par lequel le cercle passe — et
       l’exigence tient à une condition : que la graduation 4 de la règle soit
       ATTEIGNABLE au doigt. On la vise donc pour de vrai, et on lit le rayon
       obtenu, plutôt que de croire que l’aimant s’applique.
       ============================================================ */
    await page.goto(base + '?competence=ce2-construire-uni');
    await page.waitForTimeout(400);
    const rayonJoue = await page.evaluate(async () => {
      const svg = document.getElementById('scene');
      pos = file.findIndex(x => x.cercles); manche(); desarmerAutoSuivant();
      const q = file[pos], sol = q.solutions[0][0];
      const centreVise = sol[0];
      /* Le carré est déjà fermé : c’est le cercle qu’on éprouve. */
      chantier.contours = [sol.map(x => x.slice())];
      [...document.querySelectorAll('#barreOutils .outil')]
        .find(x => /règle/i.test(x.textContent)).click();
      const p = chantier.posables[0];
      const anc0 = p.ancres();
      const vise = [centreVise[0] + 4 * PX_PAR_UNITE, centreVise[1]];
      const d = [vise[0] - anc0[4][0], vise[1] - anc0[4][1]];
      const m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      const corps = p.g.querySelector('.corps').getBoundingClientRect();
      const prise = {x:corps.x + corps.width/2, y:corps.y + corps.height/2};
      const ech = m.a;
      const env = (t, X, Y, sur) => (sur || p.g).dispatchEvent(new PointerEvent(t,
        {clientX:X, clientY:Y, pointerId:41, bubbles:true}));
      env('pointerdown', prise.x, prise.y);
      for (let i = 1; i <= 5; i++) env('pointermove', prise.x + 30*i, prise.y + 15*i);
      for (let i = 1; i <= 10; i++)
        env('pointermove', prise.x + d[0]*ech*i/10, prise.y + d[1]*ech*i/10);
      env('pointerup', prise.x + d[0]*ech, prise.y + d[1]*ech);
      const anc = p.ancres();
      const grad = anc.reduce((b, a) =>
        Math.hypot(a[0]-vise[0], a[1]-vise[1]) < Math.hypot(b[0]-vise[0], b[1]-vise[1]) ? a : b);
      /* Puis le geste du compas : le centre, puis le point visé.
         LA MATRICE SE RELIT À CHAQUE TAP. Activer le compas réécrit la
         sous-consigne, dont la hauteur change et fait glisser le plan de
         quelques pixels : une matrice capturée avant le clic visait deux
         pixels à côté, l’aimant ne prenait plus, et le test accusait le code
         d’un rayon de 4,08 qui était le sien. */
      document.querySelector('#barreOutils .outil-compas').click();
      const versClient = (s) => {
        const mm = svg.getScreenCTM(), p2 = svg.createSVGPoint();
        p2.x = s[0]; p2.y = s[1];
        const q2 = p2.matrixTransform(mm); return {x:q2.x, y:q2.y};
      };
      const tap = (s) => { const c = versClient(s);
        ['pointerdown','pointerup'].forEach(t =>
          (document.elementFromPoint(c.x, c.y) || svg).dispatchEvent(
            new PointerEvent(t, {clientX:c.x, clientY:c.y, pointerId:42, bubbles:true}))); };
      tap(centreVise);
      /* ON VISE À CÔTÉ, comme un doigt : six pixels de dérive, sous le rayon
         d’accrochage. Viser la graduation au pixel près ne prouvait rien —
         le rayon tombait juste même sans aimant, et retirer l’aimant restait
         invisible. C’est l’écart qui fait la preuve. */
      tap([grad[0] + 4, grad[1] + 4]);
      const ce = chantier.cerclesPoses[0];
      return {gradAtteinte:+Math.hypot(grad[0]-vise[0], grad[1]-vise[1]).toFixed(2),
              cercle:!!ce,
              rayonEnUnites: ce ? +(ce.r / PX_PAR_UNITE).toFixed(3) : null,
              centreSurSommet: ce ? +Math.hypot(ce.c[0]-centreVise[0], ce.c[1]-centreVise[1]).toFixed(2) : null,
              accepte: ce ? cercleAccepte(ce, q.cercles[0], chantier.contours[0], tolerancePapierUni(q)) : false};
    });
    T('rayon — la règle se cale : sa graduation 4 tombe pile à 4 unités du sommet',
      rayonJoue.gradAtteinte < 0.01, 'écart ' + rayonJoue.gradAtteinte + ' px');
    T('rayon — le compas se pose sur le sommet, comme au CE1',
      rayonJoue.cercle === true && rayonJoue.centreSurSommet < 0.01,
      'centre à ' + rayonJoue.centreSurSommet + ' px du sommet');
    T('rayon — et le rayon obtenu vaut EXACTEMENT 4 : la graduation est atteignable au doigt',
      Math.abs(rayonJoue.rayonEnUnites - 4) < 0.01, 'rayon ' + rayonJoue.rayonEnUnites + ' unités');
    T('rayon — la manche accepte donc ce cercle', rayonJoue.accepte === true,
      JSON.stringify({accepte:rayonJoue.accepte}));
    /* ET LE RAYON DICTÉ EST BIEN EXIGÉ : sans cela, « de rayon 4 » ne serait
       qu’un ornement de l’énoncé. */
    const rayonFaux = await page.evaluate(() => {
      const q = file[pos], sol = q.solutions[0][0], contour = chantier.contours[0];
      const tol = tolerancePapierUni(q);
      const essai = (u) => cercleAccepte({c:sol[0].slice(), r:u * PX_PAR_UNITE},
                                         q.cercles[0], contour, tol);
      return {trois:essai(3), quatre:essai(4), cinq:essai(5), demandé:q.cercles[0].r / PX_PAR_UNITE};
    });
    T('rayon — un rayon de 3 ou de 5 est refusé : la mesure de l’énoncé est exigée',
      rayonFaux.trois === false && rayonFaux.cinq === false && rayonFaux.quatre === true,
      JSON.stringify(rayonFaux));

    /* L’ORDRE DES TROIS EXEMPLES SE TIRE AU SORT, comme au CE1 : ils sont
       ceux du programme et il n’y en aura pas de quatrième, mais les jouer
       toujours dans le même ordre, c’est une seule et même partie (§13). */
    const series = await page.evaluate(() => {
      const compte = (g) => {
        const s = new Set();
        for (let i = 0; i < 60; i++) s.add(g().map(q => q.q.slice(0, 12)).join('|'));
        return s.size;
      };
      return {ce1:compte(qCe1Construire), ce2:compte(qCe2ConstruireUni)};
    });
    /* ============================================================
       LES QUATRE COINS, ET LE GESTE QUI VA AVEC
       ------------------------------------------------------------
       « Centré sur un de ses coins » les accepte tous — le verdict, lui,
       n’a jamais fait de différence. Mais le GESTE en refusait trois : le
       second point d’un cercle centré sur un coin tombe naturellement VERS
       L’EXTÉRIEUR, donc hors du panneau, et `aimanterPoint` y rend `null`.
       La pose plantait, le cercle n’apparaissait pas, et vu de l’enfant le
       jeu n’acceptait qu’un seul coin. On rejoue donc le geste tel qu’il se
       fait — en visant dehors — sur les quatre coins et aux deux paliers,
       plutôt que d’appeler le juge en lui tendant des coordonnées choisies. */
    for (const jeu of ['ce2-construire-uni', 'ce1-construire']) {
      await page.goto(base + '?competence=' + jeu);
      await page.waitForTimeout(400);
      const coins = await page.evaluate(async () => {
        const res = [];
        const i = file.findIndex(q => q.cercles && q.cercles[0].relation === 'sommet');
        for (let k = 0; k < 4; k++) {
          pos = i; manche(); desarmerAutoSuivant();
          const q = file[pos], sol = q.solutions[0][0];
          sol.forEach(p => poserSommet(p.slice()));
          poserSommet(sol[0].slice());
          const ancre = sol[k], o = centre(sol);
          /* Un rayon de 4 unités des deux côtés : c’est la mesure imposée au
             CE2, et elle reste dans la fourchette libre du CE1 — assez grande
             pour que le second point sorte du panneau, ce qui est justement
             le cas qui plantait. */
          const r = q.cercles[0].r != null ? q.cercles[0].r : 4 * PX_PAR_UNITE;
          /* VERS L’EXTÉRIEUR : à l’opposé du centre de la figure. */
          const d = Math.hypot(ancre[0]-o[0], ancre[1]-o[1]) || 1;
          const dehors = [ancre[0] + (ancre[0]-o[0])/d*r, ancre[1] + (ancre[1]-o[1])/d*r];
          chantier.enAttenteCentre = true;
          let plante = null;
          try { poserCercle(ancre.slice()); poserCercle(dehors); }
          catch (e) { plante = String(e).slice(0, 50); }
          validerManche(q);
          await new Promise(z => setTimeout(z, 50));
          res.push({k, plante, cercles:chantier.cerclesPoses.length, ok:q._ok,
                    horsZone: dehors[0] > chantier.z.x1 || dehors[0] < chantier.z.x0
                           || dehors[1] > chantier.z.y1 || dehors[1] < chantier.z.y0});
        }
        return res;
      });
      const nom = jeu === 'ce1-construire' ? 'CE1' : 'CE2';
      T('coins ' + nom + ' — le geste vise bien DEHORS sur au moins un coin',
        coins.some(c => c.horsZone), coins.map(c => c.k + (c.horsZone ? '↗' : '·')).join(' '));
      T('coins ' + nom + ' — poser le cercle ne plante sur aucun coin',
        coins.every(c => !c.plante && c.cercles === 1),
        coins.filter(c => c.plante).map(c => 'coin ' + c.k + ' : ' + c.plante).join(' | ') || '4 coins');
      T('coins ' + nom + ' — et LES QUATRE coins font gagner la manche',
        coins.every(c => c.ok === true),
        coins.map(c => c.k + ':' + (c.ok ? '✔' : '✘')).join(' '));
    }
    await page.goto(base + '?competence=ce2-construire-uni');
    await page.waitForTimeout(400);
    /* LE CENTRE, LUI, RESTE DANS LE PANNEAU : les deux points d’un cercle
       n’ont pas les mêmes droits, et le second n’a été libéré que parce
       qu’un cercle centré sur un coin déborde forcément. */
    const centreDehors = await page.evaluate(() => {
      pos = file.findIndex(q => q.cercles); manche(); desarmerAutoSuivant();
      const z = chantier.z;
      chantier.enAttenteCentre = true;
      let plante = null;
      try { poserCercle([z.x1 + 40, z.y1 + 40]); } catch (e) { plante = String(e).slice(0, 40); }
      return {plante, pointe:!!chantier.centreProvisoire, cercles:chantier.cerclesPoses.length};
    });
    T('coins — une pointe posée hors du panneau ne plante pas, et ne pose rien',
      centreDehors.plante === null && centreDehors.pointe === false
      && centreDehors.cercles === 0, JSON.stringify(centreDehors));

    T('séries — les trois commandes du CE2 ne se jouent plus toujours dans le même ordre',
      series.ce2 >= 4 && series.ce2 === series.ce1,
      'CE2 ' + series.ce2 + ' séries, CE1 ' + series.ce1);
  }

  console.log('\nErreurs JS/console/réseau : ' + (erreurs.length ? JSON.stringify(erreurs.slice(0,3)) : 'aucune'));
  console.log(`\n${ok} OK, ${ko} KO`);
  console.log(ko === 0 && erreurs.length === 0 ? 'EXIT:SUCCES' : 'EXIT:ECHEC');
  await nav.close(); srv.close();
})();
