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
    const t = chantier.trace;
    const c = file[pos].solutions[0][0].map(p => t.versGrille(p).map(Math.round));
    /* On ALLONGE le rectangle d’une maille : la figure reste close et tous
       ses côtés restent traçables au glissement — une déformation qui
       casserait une pente rendrait le contour intraçable, donc invalidé
       pour la mauvaise raison. */
    const u = [Math.sign(c[1][0] - c[0][0]), Math.sign(c[1][1] - c[0][1])];
    const sens = (c[1][0] + u[0] <= t.zone.nx && c[1][1] + u[1] <= t.zone.ny
                  && c[2][0] + u[0] <= t.zone.nx && c[2][1] + u[1] <= t.zone.ny) ? 1 : -1;
    c[1] = [c[1][0] + u[0]*sens, c[1][1] + u[1]*sens];
    c[2] = [c[2][0] + u[0]*sens, c[2][1] + u[1]*sens];
    c.push(c[0]);
    return c;
  });
  await tracerChemin(page, fausse);
  const abandon = await page.evaluate(async () => {
    const pret = !document.getElementById('btnValider').disabled;
    document.getElementById('btnValider').click();
    await new Promise(r => setTimeout(r, 60));
    return {pret, contours:chantier.contours.length, ok:file[pos]._ok, vitrail:vitrail.length,
      confettis:document.querySelectorAll('#confettis-conteneur .confetti').length};
  });
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
          planBas:r.bottom, fold:window.innerHeight, H:vb[3],
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
    /* Le plafond : les deux panneaux doivent se voir ENSEMBLE, sinon
       « reproduis le modèle » demande de faire défiler entre les deux. */
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
    T('obliques — « Le modèle oblique » se joue au tracé au doigt',
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

  console.log('\nErreurs JS/console/réseau : ' + (erreurs.length ? JSON.stringify(erreurs.slice(0,3)) : 'aucune'));
  console.log(`\n${ok} OK, ${ko} KO`);
  console.log(ko === 0 && erreurs.length === 0 ? 'EXIT:SUCCES' : 'EXIT:ECHEC');
  await nav.close(); srv.close();
})();
