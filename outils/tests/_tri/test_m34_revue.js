const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const RACINE = '/home/user/mayeutik';
const JEU = '/jeux/M34-formes-planes.html';
let ok = 0, ko = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('OK   ' + n, d === undefined ? '' : d); }
  else { ko++; console.log('KO   ' + n, d === undefined ? '' : d); } };

const MIME = {'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'};
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const p = path.join(RACINE, u === '/' ? '/index.html' : u);
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': (MIME[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); r.end(d); });
});

const JEUX = ['cp-reconnaitre','cp-relations','cp-decrire',
              'ce1-reconnaitre','ce1-justifier','ce1-angles',
              'ce2-vocabulaire','ce2-portrait','ce2-litige'];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const base = `http://localhost:${port}${JEU}`;
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await nav.newPage({ viewport: { width: 390, height: 780 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  await page.goto(base);
  await page.evaluate(() => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{id:'p1', prenom:'T', niveau:'CE2'}]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.setItem('mayeutik-sessions', '[]');
  });
  const brut = fs.readFileSync(RACINE + JEU, 'utf8');

  /* ---------- Le logo du menu général ---------- */
  const ref = JSON.parse(fs.readFileSync(RACINE + '/data/referentiel.json', 'utf8'));
  const m34 = ref.modules.find(m => m.id === 'M34');
  T('le référentiel porte une icône dessinée pour M34', !!m34.iconeSvg && m34.iconeSvg.length > 200);
  T('l’icône est un vitrail : base rectangulaire, sommet en ogive',
    /Q 8 7 20 5 Q 32 7 32 19/.test(m34.iconeSvg) && /L 8 19/.test(m34.iconeSvg));
  T('l’icône est faite de formes géométriques colorées',
    (m34.iconeSvg.match(/fill="#[0-9A-F]{6}"/gi) || []).length >= 6);
  T('la coquille sait rendre une icône dessinée',
    /iconeSvg/.test(fs.readFileSync(RACINE + '/js/app.js', 'utf8')));

  /* ---------- Renommages ---------- */
  const titres = await page.evaluate(() => {
    const o = {};
    Object.values(CONTENU.paliers).forEach(p => p.miniJeux.forEach(m => { o[m.id] = {t:m.titre, i:m.icone, n:m.nbQuestions}; }));
    return o;
  });
  T('cp-reconnaitre s’appelle « Les pièces de verre »', titres['cp-reconnaitre'].t === 'Les pièces de verre');
  T('ce1-reconnaitre aussi', titres['ce1-reconnaitre'].t === 'Les pièces de verre');
  T('cp-relations s’appelle « Assemblages »', titres['cp-relations'].t === 'Assemblages', titres['cp-relations'].t);
  T('ce2-portrait s’appelle « La commande de pièces »', titres['ce2-portrait'].t === 'La commande de pièces');
  T('la rosace n’a plus une rose pour logo', titres['ce2-vocabulaire'].i !== '🌹', titres['ce2-vocabulaire'].i);
  T('la rosace compte 6 manches', titres['ce2-vocabulaire'].n === 6, titres['ce2-vocabulaire'].n);

  /* ---------- La sélection n’est plus orange ---------- */
  /* B4.1 — le marqueur se MESURE sur la pièce rendue. La version précédente
     figeait la couleur littérale `#12233C` dans le texte du CSS : elle
     validait une écriture, pas une lisibilité, et cassait au premier
     changement de teinte alors que rien de visible n’avait empiré. */
  await page.goto(base + '?competence=cp-reconnaitre');
  await page.waitForTimeout(300);
  const marque = await page.evaluate(() => {
    const g = document.querySelector('#svgScene .piece');
    g.dispatchEvent(new MouseEvent('click', {bubbles:true}));
    const verre = getComputedStyle(g.querySelector('.verre'));
    const halo = getComputedStyle(g.querySelector('.halo'));
    return {trait:verre.stroke, largeur:parseFloat(verre.strokeWidth),
            halo:halo.stroke, haloLarge:parseFloat(halo.strokeWidth),
            verres:VERRES};
  });
  const rgb = t => (t.match(/\d+/g) || []).map(Number);
  const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
  const proche = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) < 90;
  T('B4.1 — le marqueur de sélection ne reprend aucune couleur de verre',
    !marque.verres.some(v => proche(rgb(marque.trait), hex(v))), marque.trait);
  T('B4.1 — il n’est ni vert ni rouge, réservés au juste et au faux (§18)',
    !proche(rgb(marque.trait), hex('#2EC4A6')) && !proche(rgb(marque.trait), hex('#FF5D5D')), marque.trait);
  T('B4.1 — un halo blanc le détache du verre, plus épais que le trait',
    proche(rgb(marque.halo), [255,255,255]) && marque.haloLarge > marque.largeur,
    `${marque.halo} ${marque.haloLarge} > ${marque.largeur}`);
  T('le marqueur de zone sélectionnée non plus',
    !/\.zone\.sel\{[^}]*--mandarine/.test(brut));
  T('le marqueur d’angle n’est pas orange',
    !/\.marque-angle\{[^}]*--mandarine/.test(brut));

  /* ---------- Taille de scène constante, sans défilement ---------- */
  const tailles = {}, hauteurs = {};
  for (const id of JEUX) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(230);
    tailles[id] = await page.evaluate(async () => {
      const h = [];
      for (let i = 0; i < file.length; i++) {
        pos = i; question();
        await new Promise(r => setTimeout(r, 60));
        const v = document.getElementById('vitrail');
        h.push(v.hidden ? 0 : Math.round(v.getBoundingClientRect().height));
      }
      desarmerAutoSuivant();
      return h;
    });
  }
  ['cp-relations','ce1-justifier','ce2-litige','cp-decrire','ce1-angles','cp-reconnaitre'].forEach(id => {
    const h = tailles[id].filter(x => x > 0);
    T(`${id} : la scène garde une hauteur constante`,
      h.length === 0 || Math.max(...h) - Math.min(...h) <= 1, JSON.stringify(tailles[id]));
  });

  for (const id of JEUX) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(250);
    const debord = await page.evaluate(async () => {
      let pire = 0;
      for (let i = 0; i < file.length; i++) {
        pos = i; question();
        await new Promise(r => setTimeout(r, 70));
        pire = Math.max(pire, document.documentElement.scrollHeight);
      }
      desarmerAutoSuivant();
      return pire;
    });
    T(`${id} : la manche tient sur un écran de 780 px`, debord <= 782, debord + ' px');
    hauteurs[id] = debord;
  }

  /* ---------- A1 : auto-test des invariants, tous mini-jeux ---------- */
  const auto = await page.evaluate(() => {
    const res = {};
    Object.entries(CONTENU.paliers).forEach(([nom, palier]) => {
      palier.miniJeux.forEach(cfg => {
        let pb = 0, items = 0;
        for (let n = 0; n < 60; n++) {
          const f = engendrerFile(cfg, palier);   // AVANT le filet de reprise
          items += f.length;
          pb += verifierFile(f).length;
        }
        res[cfg.id] = {items, pb};
      });
    });
    return res;
  });
  Object.entries(auto).forEach(([id, r]) => {
    T(`A1 — ${id} : aucun item ne viole les invariants`, r.pb === 0, `${r.pb} sur ${r.items} items`);
  });

  const filet = await page.evaluate(() => {
    /* Le filet de `construireFile` doit rendre une file toujours conforme. */
    let pb = 0;
    Object.entries(CONTENU.paliers).forEach(([nom, palier]) => {
      palier.miniJeux.forEach(cfg => {
        for (let n = 0; n < 20; n++) pb += verifierFile(construireFile(cfg, palier)).length;
      });
    });
    return pb;
  });
  T('A1 — le filet de génération ne laisse passer aucun item fautif', filet === 0, filet);

  /* ---------- cp-relations ---------- */
  await page.goto(base + '?competence=cp-relations');
  await page.waitForTimeout(220);
  const rel = await page.evaluate(() => {
    let amorces = 0, doublons = 0, multi = 0, simple = 0, nbVraies = {}, N = 600;
    for (let i = 0; i < N; i++) {
      const f = qRelations({nbQuestions:5});
      f.forEach(q => {
        const textes = q.props.map(p => texteRelation(p.e));
        textes.forEach(t => { if (/^(Il y a|Je vois)/.test(t)) amorces++; });
        if (new Set(textes).size !== textes.length) doublons++;
        const v = q.props.filter(p => p.bon).length;
        if (q.multi) { multi++; nbVraies[v] = (nbVraies[v] || 0) + 1; }
        else { simple++; if (v !== 1) nbVraies['simple' + v] = (nbVraies['simple' + v] || 0) + 1; }
      });
    }
    return {amorces, doublons, multi, simple, nbVraies, N};
  });
  T('aucun énoncé ne commence par « Il y a » ou « Je vois »', rel.amorces === 0, rel.amorces);
  T('jamais deux propositions au texte identique', rel.doublons === 0, rel.doublons);
  T('la famille triangle/carré est en CHOIX MULTIPLE', rel.multi > 0, `${rel.multi} manches multiples`);
  T('elle porte toujours exactement 3 phrases vraies',
    Object.keys(rel.nbVraies).length === 1 && rel.nbVraies['3'] === rel.multi, JSON.stringify(rel.nbVraies));
  T('les autres scénarios gardent une seule phrase vraie', rel.simple > 0 && !Object.keys(rel.nbVraies).some(k => /^simple/.test(k)));

  const multiJoue = await page.evaluate(async () => {
    let i = file.findIndex(q => q.multi);
    if (i < 0) { file = qRelations({nbQuestions:5}); i = file.findIndex(q => q.multi); }
    pos = i; verrouille = false; question();
    await new Promise(r => setTimeout(r, 80));
    const q = file[pos];
    const reps = [...document.querySelectorAll('#answers .rep')];
    /* On coche les trois vraies, on laisse la fausse. */
    q.props.forEach((p, k) => { if (p.bon) reps[k].click(); });
    document.getElementById('btnValider').click();
    await new Promise(r => setTimeout(r, 80));
    desarmerAutoSuivant();
    const etat = reps.map(r => r.className);
    return {ok:file[pos]._ok, etat, consigne:document.getElementById('qText').textContent};
  });
  T('choix multiple : cocher exactement les phrases vraies est juste', multiJoue.ok === true);
  T('choix multiple : la consigne demande TOUTES les phrases vraies',
    /toutes les phrases vraies/i.test(multiJoue.consigne), multiJoue.consigne.slice(0, 50));

  const multiRate = await page.evaluate(async () => {
    let i = file.findIndex(q => q.multi);
    if (i < 0) { file = qRelations({nbQuestions:5}); i = file.findIndex(q => q.multi); }
    pos = i; verrouille = false;
    document.getElementById('answers').innerHTML = ''; document.getElementById('answers').className = '';
    question();
    await new Promise(r => setTimeout(r, 80));
    const q = file[pos];
    const reps = [...document.querySelectorAll('#answers .rep')];
    /* Une seule vraie cochée : incomplet, donc faux. */
    reps[q.props.findIndex(p => p.bon)].click();
    document.getElementById('btnValider').click();
    await new Promise(r => setTimeout(r, 80));
    desarmerAutoSuivant();
    return {ok:file[pos]._ok,
      vertes:reps.filter(r => r.classList.contains('ok')).length,
      attendues:q.props.filter(p => p.bon).length,
      rouges:reps.filter(r => r.classList.contains('ko')).length};
  });
  T('choix multiple : une réponse incomplète est fausse', multiRate.ok === false);
  T('§18 : toutes les phrases vraies passent au vert',
    multiRate.vertes === multiRate.attendues, `${multiRate.vertes}/${multiRate.attendues}`);
  T('§18 : le rouge ne marque que ce qui a été coché à tort', multiRate.rouges === 0, multiRate.rouges);

  const schemas = await page.evaluate(() => {
    const lire = (html) => {
      const d = document.createElement('div'); d.innerHTML = html;
      const poly = [...d.querySelectorAll('polygon')];
      const tri = poly.find(p => p.getAttribute('points').split(' ').length === 3);
      const carre = poly.find(p => p.getAttribute('points').split(' ').length === 4);
      const dots = [...d.querySelectorAll('circle')].map(c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
      const pts = e => e ? e.getAttribute('points').split(' ').map(s => s.split(',').map(Number)) : null;
      return {tri:pts(tri), carre:pts(carre), dots};
    };
    const res = {};
    [['k2', {modele:'sommets-sur', k:2, a:'triangle', b:'carre'}],
     ['k3', {modele:'sommets-sur', k:3, a:'triangle', b:'carre'}],
     ['cote', {modele:'sommet-sur-cote', a:'triangle', b:'carre'}]].forEach(([nom, e]) => {
      const g = lire(schemaRelation(e));
      const surTri = g.dots.every(d => g.tri.some(p => Math.hypot(p[0]-d[0], p[1]-d[1]) < 1.5));
      const surCoin = g.dots.map(d => g.carre.some(p => Math.hypot(p[0]-d[0], p[1]-d[1]) < 1.5));
      res[nom] = {n:g.dots.length, surTri, surCoin};
    });
    return res;
  });
  T('schéma « deux sommets » : deux pastilles sur deux coins',
    schemas.k2.n === 2 && schemas.k2.surTri && schemas.k2.surCoin.every(Boolean), JSON.stringify(schemas.k2));
  T('schéma « trois sommets » : trois pastilles sur trois coins',
    schemas.k3.n === 3 && schemas.k3.surCoin.every(Boolean), JSON.stringify(schemas.k3));
  T('schéma « sur un côté » : la pastille n’est PAS sur un coin',
    schemas.cote.n === 1 && schemas.cote.surTri && !schemas.cote.surCoin[0], JSON.stringify(schemas.cote));

  /* ---------- cp-decrire ---------- */
  await page.goto(base + '?competence=cp-decrire');
  await page.waitForTimeout(220);
  const dec = await page.evaluate(() => {
    let collisions = 0, N = 300;
    const palier = CONTENU.paliers.CP;
    for (let i = 0; i < N; i++) {
      const f = qDecrire({nbQuestions:5}, palier);
      const nombres = f.filter(q => q.compte).map(q => q.bonNombre);
      if (new Set(nombres).size !== nombres.length) collisions++;
    }
    const f = qDecrire({nbQuestions:5}, palier);
    return {collisions, N, nombres:f.filter(q => q.compte).map(q => q.bonNombre),
            quoi:f.filter(q => q.compte).map(q => q.compte)};
  });
  T('cp-decrire : les nombres à trouver sont tous différents', dec.collisions === 0,
    `${dec.collisions}/${dec.N} — ex. ${JSON.stringify(dec.nombres)}`);
  T('cp-decrire : côtés et sommets alternent', new Set(dec.quoi).size === 2, JSON.stringify(dec.quoi));

  const compt = await page.evaluate(async () => {
    const i = file.findIndex(q => q.compte);
    pos = i; question();
    await new Promise(r => setTimeout(r, 80));
    const q = file[pos];
    const faux = [...document.querySelectorAll('#answers .rep')]
      .find(b => b.querySelector('.txt').textContent !== q.ans);
    faux.click();
    await new Promise(r => setTimeout(r, 80));
    const chipAvant = document.getElementById('compteur').getAttribute('opacity');
    await new Promise(r => setTimeout(r, 3400));
    desarmerAutoSuivant();
    const svg = document.getElementById('svgScene');
    return {chipAvant, chip:document.getElementById('compteur').getAttribute('opacity'),
            valeur:document.getElementById('compteurTxt').textContent,
            attendu:String(q.bonNombre), quoi:q.compte,
            marques:svg.querySelectorAll('.trait-compte, .point-compte').length,
            encoreLa: !document.getElementById('game').hidden && pos === i};
  });
  T('cp-decrire : sur une erreur, un compteur apparaît', compt.chip === '1');
  T('cp-decrire : il monte jusqu’à la bonne réponse', compt.valeur === compt.attendu,
    `${compt.valeur} / ${compt.attendu}`);
  T('cp-decrire : chaque côté ou sommet est marqué un à un',
    compt.marques === +compt.attendu, `${compt.marques} marques pour ${compt.attendu} ${compt.quoi}`);
  T('cp-decrire : le passage automatique attend la fin du décompte', compt.encoreLa);

  /* ---------- ce1-justifier ---------- */
  await page.goto(base + '?competence=ce1-justifier');
  await page.waitForTimeout(220);
  const just = await page.evaluate(() => {
    let repetitions = 0, distracteurVrai = 0, N = 400;
    const palier = CONTENU.paliers.CE1;
    for (let i = 0; i < N; i++) {
      const f = qJustifier({nbQuestions:8}, palier);
      /* B3 — huit manches se partagent six formes : la non-répétition ne peut
         plus valoir sur la partie entière. Elle vaut DANS CHAQUE PHASE, et
         c’est ce qui compte — nommer un triangle puis réfuter qu’il soit un
         carré sont deux tâches distinctes sur la même forme. */
      ['nommer','refuter'].forEach(phase => {
        const formes = f.filter(q => q._signature.startsWith(phase))
          .map(q => q.pieces[0].forme);
        if (new Set(formes).size !== formes.length) repetitions++;
      });
      f.filter(q => /Pourquoi/.test(q.etape2.q)).forEach(q => {
        const p = proprietes(q.pieces[0]);
        q.etape2.opts.filter(o => o !== q.etape2.ans).forEach(o => {
          const a = ASSERTIONS_CARRE.find(x => x.t === o);
          if (a && a.vrai(p)) distracteurVrai++;
        });
      });
    }
    return {repetitions, distracteurVrai, N};
  });
  T('ce1-justifier : jamais deux fois la même pièce dans une partie',
    just.repetitions === 0, `${just.repetitions}/${just.N}`);
  T('ce1-justifier : aucun distracteur n’est vrai sur la pièce montrée',
    just.distracteurVrai === 0, just.distracteurVrai);

  /* ---------- ce1-angles ---------- */
  await page.goto(base + '?competence=ce1-angles');
  await page.waitForTimeout(240);
  const ang = await page.evaluate(async () => {
    const res = [];
    for (let i = 0; i < file.length; i++) {
      pos = i; question();
      await new Promise(r => setTimeout(r, 60));
      const q = file[pos], p = q.pieces[0], pts = p.pts, n = pts.length, j = q.sommet;
      const S = pts[j], A = pts[(j-1+n)%n], B = pts[(j+1)%n];
      const arc = document.querySelector('.marque-angle');
      const d = arc.getAttribute('d');
      const m = d.match(/M ([-\d.]+) ([-\d.]+) A 26 26 0 0 ([01]) ([-\d.]+) ([-\d.]+)/);
      const m1 = [+m[1], +m[2]], sweep = +m[3], m2 = [+m[4], +m[5]];
      /* Le centre de l’arc doit être LE SOMMET : on reconstruit le milieu
         de l’arc et on vérifie qu’il est bien à 26 du sommet, et à
         l’intérieur de l’angle. */
      const d1 = Math.atan2(m1[1]-S[1], m1[0]-S[0]), d2 = Math.atan2(m2[1]-S[1], m2[0]-S[0]);
      let e = d2 - d1;
      while (e <= -Math.PI) e += Math.PI*2;
      while (e > Math.PI) e -= Math.PI*2;
      const sweepAttendu = e > 0 ? 1 : 0;
      const mid = d1 + e/2;
      const pm = [S[0] + Math.cos(mid)*26, S[1] + Math.sin(mid)*26];
      /* Le milieu de l’arc doit tomber DANS la pièce. */
      let dedans = false;
      let cr = 0;
      for (let k = 0; k < n; k++) {
        const a = pts[k], b = pts[(k+1)%n];
        if ((a[1] > pm[1]) !== (b[1] > pm[1])
          && pm[0] < (b[0]-a[0]) * (pm[1]-a[1]) / (b[1]-a[1]) + a[0]) cr++;
      }
      dedans = cr % 2 === 1;
      res.push({sweep, sweepAttendu, dedans, halo: !!document.querySelector('.marque-angle-halo')});
    }
    desarmerAutoSuivant();
    return res;
  });
  T('ce1-angles : le balayage de l’arc est calculé, pas figé',
    ang.every(a => a.sweep === a.sweepAttendu), JSON.stringify(ang.map(a => a.sweep + '/' + a.sweepAttendu)));
  T('ce1-angles : l’arc est bien à l’intérieur de la pièce',
    ang.every(a => a.dedans), JSON.stringify(ang.map(a => a.dedans)));
  T('ce1-angles : un halo blanc rend le marqueur visible sur toute couleur',
    ang.every(a => a.halo));

  /* ---------- ce2-vocabulaire ---------- */
  await page.goto(base + '?competence=ce2-vocabulaire');
  await page.waitForTimeout(220);
  const voc = await page.evaluate(async () => {
    const notions = file.map(q => q.notion);
    const consignes = {};
    ['centre','rayon','diametre','diagonale','longueur','largeur'].forEach(n => consignes[n] = consigneVocabulaire(n));
    const bons = {}, attribution = {}, surbrillance = {};
    for (const n of ['centre','rayon','diametre','diagonale','longueur','largeur']) {
      file[0] = Object.assign({}, file[0], {notion:n, q:consigneVocabulaire(n)});
      pos = 0; verrouille = false; question();
      await new Promise(r => setTimeout(r, 60));
      const svg = document.getElementById('svgScene');
      const traces = [...svg.querySelectorAll('[data-c]')];
      bons[n] = traces.filter(t => {
        const id = t.dataset.c;
        return (n === 'centre' && id === 'centre')
          || (n === 'rayon' && /^rayon/.test(id))
          || (n === 'diametre' && /^diam/.test(id))
          || (n === 'longueur' && /^long/.test(id))
          || (n === 'largeur' && /^larg/.test(id))
          || (n === 'diagonale' && /^diag/.test(id));
      }).length;
      surbrillance[n] = !!svg.querySelector('.surbrillance') || !!svg.querySelector('.anneau-vise');
      attribution[n] = 0;
    }
    desarmerAutoSuivant();
    return {notions, consignes, bons, attribution, surbrillance};
  });
  T('ce2-vocabulaire : 6 notions distinctes', new Set(voc.notions).size === 6, JSON.stringify(voc.notions));
  T('centre et diamètre parlent du CERCLE qui entoure la rosace, pas de la rosace',
    /cercle jaune qui entoure la rosace/.test(voc.consignes.centre)
    && /cercle jaune qui entoure la rosace/.test(voc.consignes.diametre),
    voc.consignes.centre);
  T('« touche UN diamètre », pas « le diamètre »',
    /Touche un diamètre/.test(voc.consignes.diametre), voc.consignes.diametre);
  /* « en surbrillance » n'etait pas compris : c'est un mot d'ecran. La
     consigne nomme desormais ce qui se VOIT — le jaune. */
  T('l’objet visé est désigné par sa couleur, pas par un mot d’écran',
    /entouré en jaune/.test(voc.consignes.diagonale)
    && !/surbrillance|éclairé/.test(Object.values(voc.consignes).join(' ')),
    voc.consignes.diagonale);
  T('« touche UNE longueur », pas « la longueur »',
    /Touche une longueur/.test(voc.consignes.longueur) && /Touche une largeur/.test(voc.consignes.largeur),
    voc.consignes.longueur);
  T('deux longueurs, deux largeurs, deux diagonales, deux rayons, deux diamètres',
    voc.bons.longueur === 2 && voc.bons.largeur === 2 && voc.bons.diagonale === 2
    && voc.bons.rayon === 2 && voc.bons.diametre === 2, JSON.stringify(voc.bons));
  T('et il est réellement entouré de jaune à l’écran',
    Object.values(voc.surbrillance).every(Boolean), JSON.stringify(voc.surbrillance));
  /* Le jaune ne peut designer qu'UNE chose : la rosace portait un hexagone ET
     un petale exactement de la couleur du repere, ce qui vidait la consigne
     de son sens. La liste des verres se deduit du jaune du repere. */
  const jaune = await page.evaluate(() => {
    const r = construireRosace();
    const couleurs = r.petales.map(p => p.couleur).concat([r.hexagone.couleur]);
    return {couleurs, collisions:couleurs.filter(c => c.toUpperCase() === JAUNE_REPERE).length,
            distinctes:new Set(couleurs.map(c => c.toUpperCase())).size, n:couleurs.length};
  });
  T('aucune pièce de la rosace ne porte le jaune du repère',
    jaune.collisions === 0, jaune.couleurs.join(' '));
  T('et les sept pièces gardent sept couleurs distinctes',
    jaune.distinctes === jaune.n, jaune.distinctes + ' pour ' + jaune.n);

  /* Rien ne doit dépasser du cadre : une cible rognée ne se touche pas. */
  const cadrage = await page.evaluate(async () => {
    const pires = {};
    for (const notion of ['centre','rayon','diametre','longueur','largeur','diagonale']) {
      file[0] = Object.assign({}, file[0], {notion, q:consigneVocabulaire(notion)});
      pos = 0; verrouille = false; question();
      await new Promise(r => setTimeout(r, 60));
      const svg = document.getElementById('svgScene');
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      let debord = 0;
      svg.querySelectorAll('[data-c], .surbrillance, .piece polygon, .piece circle').forEach(e => {
        const b = e.getBBox();
        debord = Math.max(debord, vb[0] - b.x, vb[1] - b.y,
          (b.x + b.width) - (vb[0] + vb[2]), (b.y + b.height) - (vb[1] + vb[3]));
      });
      pires[notion] = Math.round(debord);
    }
    desarmerAutoSuivant();
    return pires;
  });
  T('la rosace tient entièrement dans son cadre',
    Object.values(cadrage).every(d => d <= 0), JSON.stringify(cadrage));

  /* ---------- A2 : attribution du toucher ---------- */
  const a2 = await page.evaluate(async () => {
    /* On touche le MILIEU de chaque cible correcte, l’une après l’autre :
       chacune doit être reconnue, sans se laisser voler par une voisine. */
    const res = {};
    for (const notion of ['centre','rayon','diametre','longueur','largeur','diagonale']) {
      const ids = [];
      file[0] = Object.assign({}, file[0], {notion, q:consigneVocabulaire(notion)});
      pos = 0; verrouille = false; question();
      await new Promise(r => setTimeout(r, 60));
      document.querySelectorAll('#svgScene [data-c]').forEach(t => {
        const id = t.dataset.c;
        const bon = (notion === 'centre' && id === 'centre')
          || (notion === 'rayon' && /^rayon/.test(id)) || (notion === 'diametre' && /^diam/.test(id))
          || (notion === 'longueur' && /^long/.test(id)) || (notion === 'largeur' && /^larg/.test(id))
          || (notion === 'diagonale' && /^diag/.test(id));
        if (bon) ids.push(id);
      });
      let reussites = 0;
      for (const id of ids) {
        file[0] = Object.assign({}, file[0], {notion, q:consigneVocabulaire(notion)});
        delete file[0]._ok;
        pos = 0; verrouille = false; question();
        await new Promise(r => setTimeout(r, 50));
        const svg = document.getElementById('svgScene');
        const t = svg.querySelector(`[data-c="${id}"]`);
        /* On sonde à 72 % du segment, et non en son milieu : le milieu
           d’un DIAMÈTRE est le centre du cercle, cible ponctuelle qui doit
           justement l’emporter (c’est la règle A2, pas un défaut). */
        const u = 0.72;
        const x = t.tagName === 'circle' ? +t.getAttribute('cx')
          : +t.getAttribute('x1') + (+t.getAttribute('x2') - +t.getAttribute('x1')) * u;
        const y = t.tagName === 'circle' ? +t.getAttribute('cy')
          : +t.getAttribute('y1') + (+t.getAttribute('y2') - +t.getAttribute('y1')) * u;
        const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
        const e = pt.matrixTransform(svg.getScreenCTM());
        svg.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:e.x, clientY:e.y}));
        await new Promise(r => setTimeout(r, 50));
        desarmerAutoSuivant();
        if (file[0]._ok === true) reussites++;
      }
      res[notion] = {cibles:ids.length, reussites};
    }
    return res;
  });
  Object.entries(a2).forEach(([notion, r]) => {
    T(`A2 — ${notion} : chacune des ${r.cibles} cibles justes est bien reconnue`,
      r.cibles > 0 && r.reussites === r.cibles, `${r.reussites}/${r.cibles}`);
  });
  const a2bis = await page.evaluate(async () => {
    /* Le diamètre passe EXACTEMENT sur le centre : le point doit gagner. */
    file[0] = Object.assign({}, file[0], {notion:'centre', q:consigneVocabulaire('centre')});
    delete file[0]._ok;
    pos = 0; verrouille = false; question();
    await new Promise(r => setTimeout(r, 60));
    const svg = document.getElementById('svgScene');
    const c = svg.querySelector('[data-c="centre"]');
    const pt = svg.createSVGPoint();
    pt.x = +c.getAttribute('cx') + 4; pt.y = +c.getAttribute('cy');   // 4 px à côté
    const e = pt.matrixTransform(svg.getScreenCTM());
    svg.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:e.x, clientY:e.y}));
    await new Promise(r => setTimeout(r, 60));
    desarmerAutoSuivant();
    return file[0]._ok;
  });
  T('A2 — le centre l’emporte sur le diamètre qui passe dessus', a2bis === true);

  /* ---------- A4 : mémoire de session ---------- */
  const a4 = await page.evaluate(() => {
    const res = {};
    /* Deux parties d’affilée ne doivent pas reproposer les mêmes notions
       ni les mêmes pièces tant que le stock n’est pas épuisé. */
    const v1 = qVocabulaire({nbQuestions:6}).map(q => q.notion);
    const v2 = qVocabulaire({nbQuestions:6}).map(q => q.notion);
    res.vocRepetitions = v1.filter(n => v2.includes(n)).length;
    /* La taille du stock se MESURE — la figer en dur obligeait à retoucher
       le test chaque fois que la banque bougeait, et c'est justement ce qui
       vient d'arriver quand le classement par categorie est parti au
       convoyeur : la banque de la rosace est passee de onze notions a six. */
    const tousVoc = new Set();
    for (let i = 0; i < 40; i++) qVocabulaire({nbQuestions:6}).forEach(q => tousVoc.add(q.notion));
    res.vocStock = tousVoc.size;
    res.vocDoublonsDansUnePartie = 6 - new Set(v1).size;
    const p1 = qPortrait({nbQuestions:5}).map(q => q.cible);
    const p2 = qPortrait({nbQuestions:5}).map(q => q.cible);
    res.portraitRepetitions = p1.filter(n => p2.includes(n)).length;
    const tousPor = new Set();
    for (let i = 0; i < 40; i++) qPortrait({nbQuestions:5}).forEach(q => tousPor.add(q.cible));
    res.portraitStock = tousPor.size;
    res.portraitDoublonsDansUnePartie = 5 - new Set(p1).size;
    return res;
  });
  T('A4 — deux parties de La rosace : au plus le débord du stock est revu',
    a4.vocRepetitions <= Math.max(0, 2 * 6 - a4.vocStock),
    `${a4.vocRepetitions} notions revues, stock mesuré ${a4.vocStock}`);
  /* Quand le stock vaut exactement la longueur d'une partie, l'invariant
     inter-parties devient vide ; celui-ci ne l'est jamais. */
  T('A4 — jamais deux fois la même notion DANS une partie',
    a4.vocDoublonsDansUnePartie === 0, a4.vocDoublonsDansUnePartie);
  T('A4 — jamais deux fois la même pièce DANS une partie',
    a4.portraitDoublonsDansUnePartie === 0, a4.portraitDoublonsDansUnePartie);
  T('A4 — deux parties de La commande de pièces idem',
    a4.portraitRepetitions <= Math.max(0, 2 * 5 - a4.portraitStock), `${a4.portraitRepetitions} pièces revues`);

  /* ---------- ce2-portrait ---------- */
  await page.goto(base + '?competence=ce2-portrait');
  await page.waitForTimeout(220);
  const portrait = await page.evaluate(async () => {
    const q = file[pos];
    const i = q.choix.indexOf(q.cible);
    document.querySelectorAll('#answers .rep')[i].click();
    await new Promise(r => setTimeout(r, 60));
    desarmerAutoSuivant();
    return {fb:document.getElementById("feedback").textContent, cible:q.cible};
  });
  T('ce2-portrait : la pièce est NOMMÉE à la vérification',
    /Il s’agit d’un|Il s’agit d’une/.test(portrait.fb), portrait.fb);

  /* ---------- ce2-litige ---------- */
  await page.goto(base + '?competence=ce2-litige');
  await page.waitForTimeout(220);
  const lit = await page.evaluate(() => {
    const res = {couples:{}, refusees:0, plafond:0, horsGroupe:0, doublons:0,
                 combinaisons:[], surplusRefuse:0};
    for (let n = 0; n < 60; n++) {
      const f = qLitige({nbQuestions:5});
      /* A3 — les cinq manches d’une partie sont des COUPLES distincts. */
      const sig = f.map(q => q._signature);
      if (new Set(sig).size !== sig.length) res.doublons++;
      f.forEach(q => {
        res.couples[q.affirme + '/' + q.reel] = (res.couples[q.affirme + '/' + q.reel] || 0) + 1;
        const groupes = q.exigences;
        /* A2 — toute combinaison prenant AU MOINS `nb` zones dans chaque
           groupe passe, quelle que soit sa taille ; et le surplus ne se
           refuse pas. */
        /* Le MINIMUM de chaque groupe — `nb`, pas une zone : certaines
           raisons se montrent en désignant tous les côtés ou tous les
           angles, et n’en prendre qu’un ne les établit pas. */
        const uneParGroupe = groupes.reduce((a, e) => a.concat(e.parmi.slice(0, e.nb)), []);
        if (!selectionSatisfait(uneParGroupe, groupes)) res.refusees++;
        const toutes = [...new Set(groupes.reduce((a, e) => a.concat(e.parmi), []))];
        if (!selectionSatisfait(toutes, groupes)) res.surplusRefuse++;
        if (groupes.length === 2) {
          const [L, C] = groupes;
          if (res.combinaisons.length < 1) res.combinaisons.push(L.parmi.length * C.parmi.length);
          L.parmi.forEach(a => C.parmi.forEach(b => {
            if (!selectionSatisfait([a, b], groupes)) res.refusees++;
          }));
          /* Deux zones du MÊME groupe ne suffisent pas : l’autre exigence
             n’est pas satisfaite, et c’est juste. */
          if (L.parmi.length > 1 && selectionSatisfait([L.parmi[0], L.parmi[1]], groupes)) res.plafond++;
        }
        /* Une zone hors de tout groupe invalide la réponse. */
        const intruse = 'z9';
        if (selectionSatisfait(uneParGroupe.concat(intruse), groupes)) res.horsGroupe++;
        if (selectionSatisfait([], groupes)) res.horsGroupe++;
      });
    }
    return res;
  });
  T('A2 — toute désignation qui satisfait chaque exigence est acceptée',
    lit.refusees === 0, lit.refusees + ' refus');
  T('A2 — en désigner PLUS que le minimum reste juste (aucun plafond)',
    lit.surplusRefuse === 0, lit.surplusRefuse + ' refus de surplus');
  T('A2 — mais deux zones du même groupe ne suffisent pas',
    lit.plafond === 0, lit.plafond);
  T('A2 — une zone hors groupe, ou aucune zone, invalide',
    lit.horsGroupe === 0, lit.horsGroupe);
  T('A2 — les quatre paires long/court d’un rectangle sont acceptées',
    lit.combinaisons[0] === 4, lit.combinaisons[0] + ' combinaisons');
  T('A3 — les cinq manches d’une partie sont des couples distincts',
    lit.doublons === 0, lit.doublons + ' parties avec doublon');
  T('A3 — la banque compte plus de deux couples (figure, affirmation)',
    Object.keys(lit.couples).length >= 5, JSON.stringify(Object.keys(lit.couples)));

  /* ---------- A1 : le vocabulaire d’une sous-consigne est borné ---------- */
  const vocPalier = await page.evaluate(() => {
    const res = {fautes:[], vides:0, phases:0, couverture:{}};
    Object.values(CONTENU.paliers).forEach(pal => {
      const cfg = pal.miniJeux.find(m => m.mode === 'convoyeur');
      const vues = new Set();
      for (let n = 0; n < 30; n++) {
        qConvoyeur(cfg, pal).forEach(q => {
          res.phases++;
          vues.add(q.consigne.mot);
          if (!q.sous || !q.sous.trim()) res.vides++;
          [q.q, q.sous].forEach(t => motsHorsPalier(t, pal._nom)
            .forEach(m => res.fautes.push(pal._nom + ' « ' + m + ' » : ' + t)));
          /* Une sous-consigne ne doit pas renvoyer à des pièces ABSENTES du
             tapis de ce palier : c’était le second défaut du cas `triangle`
             au CP, qui parlait des triangles rectangles. */
          if (/rectangle/.test(q.sous) && !pal.formesConvoyeur.includes('triangleRect')
              && q.consigne.mot === 'triangle')
            res.fautes.push(pal._nom + ' : la sous-consigne du triangle évoque une pièce absente');
        });
      }
      res.couverture[pal._nom] = [...vues].every(m => sousConvoyeur(m, pal._nom) !== 'Laisse passer les autres.');
    });
    return res;
  });
  T('A1 — aucune sous-consigne n’emploie un mot hors du palier',
    vocPalier.fautes.length === 0, [...new Set(vocPalier.fautes)].slice(0, 3).join(' | '));
  T('A1 — chaque consigne garde sa sous-consigne (la place est réservée)',
    vocPalier.vides === 0 && vocPalier.phases > 0, `${vocPalier.vides} vides sur ${vocPalier.phases}`);
  T('A1 — chaque palier écrit vraiment ses propres sous-consignes',
    Object.values(vocPalier.couverture).every(Boolean), JSON.stringify(vocPalier.couverture));
  /* Le garde-fou doit SAVOIR ÉCHOUER, sinon « aucune faute » ne distingue pas
     un vocabulaire correct d’un contrôle inerte. */
  const gardeVoc = await page.evaluate(() => ({
    cp:  motsHorsPalier('Quatre angles droits et quatre côtés de même longueur.', 'CP').length,
    ce1: motsHorsPalier('Toutes les pièces à quatre côtés : des quadrilatères.', 'CE1').length,
    ce2: motsHorsPalier('Quatre angles droits, et des côtés de deux longueurs.', 'CE2').length,
    faux: motsHorsPalier('Toutes les pièces à trois côtés et trois sommets.', 'CP').length,
    piege: motsHorsPalier('Attrape les rectangles et les triangles !', 'CP').length
  }));
  T('A1 — le garde-fou rejette « angle droit » au CP', gardeVoc.cp > 0, gardeVoc.cp);
  T('A1 — et « quadrilatère » au CE1', gardeVoc.ce1 > 0, gardeVoc.ce1);
  T('A1 — mais laisse passer le CE2, où ces mots sont au programme', gardeVoc.ce2 === 0, gardeVoc.ce2);
  T('A1 — il ne déclenche pas sur une phrase CP correcte', gardeVoc.faux === 0, gardeVoc.faux);
  T('A1 — ni sur « rectangles » ou « triangles », qui contiennent « angle »',
    gardeVoc.piege === 0, gardeVoc.piege);

  /* ---------- B1 : le vitrail est un ASSEMBLAGE ---------- */
  const asm = await page.evaluate(() => {
    const res = {N:0, isolees:0, chevauche:0, contacts:[], grilles:0,
                 nbPieces:[], carreAvecRectangle:0, comptesAnnonces:0};
    ['CP','CE1'].forEach(nom => {
      const pal = CONTENU.paliers[nom];
      const cfg = pal.miniJeux.find(m => m.mode === 'reconnaitre');
      for (let n = 0; n < 25; n++) {
        qReconnaitre(cfg, pal).forEach(q => {
          if (!q.assemblage) return;            // la verrière sertie est hors invariant
          res.N++;
          res.nbPieces.push(q.pieces.length);
          if (/il y en a|combien|\d+ pièces/i.test(q.sous + q.q)) res.comptesAnnonces++;
          if (q.demandees.includes('rectangle') && q.pieces.some(p => p.forme === 'carre'))
            res.carreAvecRectangle++;
          const pts = q.pieces.map(p => p.pts);
          for (let i = 0; i < pts.length; i++) {
            let attache = 0;
            for (let j = 0; j < pts.length; j++) {
              if (i === j) continue;
              if (seChevauchent(pts[i], pts[j])) res.chevauche++;
              if (contactBords(pts[i], pts[j]) > 1) attache++;
            }
            if (!attache) res.isolees++;
          }
          if (!assemblageConnexe(q.pieces)) res.grilles++;
        });
      }
    });
    return res;
  });
  T('B1 — le vitrail n’est plus une grille : toutes les pièces se joignent',
    asm.N > 0 && asm.grilles === 0, `${asm.grilles} vitraux disjoints sur ${asm.N}`);
  T('B1 — aucune pièce n’est accrochée par un seul point',
    asm.isolees === 0, asm.isolees);
  T('B1 — aucune pièce n’en recouvre une autre', asm.chevauche === 0, asm.chevauche);
  T('B1 — le vitrail reste lisible (5 à 10 pièces)',
    Math.min(...asm.nbPieces) >= 5 && Math.max(...asm.nbPieces) <= 10,
    `${Math.min(...asm.nbPieces)}–${Math.max(...asm.nbPieces)}`);
  T('B1 — jamais un carré dans un vitrail où l’on demande les rectangles',
    asm.carreAvecRectangle === 0, asm.carreAvecRectangle);
  T('B1 — le nombre de pièces à trouver n’est PAS annoncé',
    asm.comptesAnnonces === 0, asm.comptesAnnonces);
  /* L’invariant doit savoir dire non : on lui soumet une grille — deux pièces
     posées loin l’une de l’autre — et un recouvrement franc. */
  const gardeAsm = await page.evaluate(() => {
    const carre = (x, y, c) => [[x,y],[x+c,y],[x+c,y+c],[x,y+c]];
    return {
      grille: assemblageConnexe([{pts:carre(0,0,50)}, {pts:carre(200,0,50)}]),
      parUnPoint: assemblageConnexe([{pts:carre(0,0,50)}, {pts:carre(50,50,50)}]),
      colles: assemblageConnexe([{pts:carre(0,0,50)}, {pts:carre(50,0,50)}]),
      superposees: seChevauchent(carre(0,0,50), carre(20,20,50)),
      voisines: seChevauchent(carre(0,0,50), carre(50,0,50))
    };
  });
  T('B1 — l’invariant refuse deux pièces posées côte à côte sans se toucher',
    gardeAsm.grille === false);
  T('B1 — il refuse aussi un contact par un seul sommet',
    gardeAsm.parUnPoint === false);
  T('B1 — et accepte deux pièces qui partagent un côté', gardeAsm.colles === true);
  T('B1 — le test de recouvrement voit deux pièces superposées',
    gardeAsm.superposees === true);
  T('B1 — et ne crie pas sur deux pièces simplement accolées',
    gardeAsm.voisines === false);

  /* ---------- Les verdicts se lisent sur n’importe quel verre ---------- */
  await page.goto(base + '?competence=cp-reconnaitre');
  await page.waitForTimeout(320);
  const verdict = await page.evaluate(async () => {
    desarmerAutoSuivant();
    /* Les quatre verdicts ne coexistent que sur une manche qui a DEUX pièces
       attendues au moins — une choisie, une oubliée — et deux intruses : une
       touchée à tort, une laissée de côté. On va la chercher au lieu de
       supposer que la première manche l’est. */
    const bonne = file.findIndex(x => {
      const att = x.pieces.filter(p => x.demandees.includes(p.forme)).length;
      return att >= 2 && x.pieces.length - att >= 2;
    });
    if (bonne >= 0) { pos = bonne; question(); await new Promise(r => setTimeout(r, 90)); }
    desarmerAutoSuivant();
    const q = file[pos];
    const attendues = q.pieces.filter(p => q.demandees.includes(p.forme)).map(p => p.id);
    const intruse = q.pieces.find(p => !q.demandees.includes(p.forme));
    const noeud = id => [...document.querySelectorAll('#svgScene .piece')]
      .find(e => e.dataset.piece === id);
    noeud(attendues[0]).dispatchEvent(new MouseEvent('click', {bubbles:true}));
    noeud(intruse.id).dispatchEvent(new MouseEvent('click', {bubbles:true}));
    document.getElementById('btnValider').click();
    await new Promise(r => setTimeout(r, 120));
    desarmerAutoSuivant();
    const lire = sel => {
      const e = document.querySelector('#svgScene .piece.' + sel + ' .verre');
      if (!e) return null;
      const cs = getComputedStyle(e);
      const halo = getComputedStyle(e.parentNode.querySelector('.halo'));
      return {trait:cs.stroke, fill:cs.fill, halo:halo.stroke};
    };
    /* Une pièce grisée ne doit être ni choisie ni attendue : griser une pièce
       en cause reviendrait à cacher le verdict qu’on veut montrer. */
    const grisAJuste = [...document.querySelectorAll('#svgScene .piece.neutre')]
      .every(g => !attendues.includes(g.dataset.piece));
    return {bon:lire('bon'), faux:lire('faux'), neutre:lire('neutre'),
            manque:lire('manque'), grisAJuste, verres:VERRES,
            classesCumulees:[...document.querySelectorAll('#svgScene .piece')]
              .some(g => ['bon','faux','manque','neutre'].filter(c => g.classList.contains(c)).length !== 1)};
  });
  const rgbV = t => (t.match(/\d+/g) || []).map(Number);
  const hexV = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
  const procheV = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) < 90;
  ['bon','faux','manque'].forEach(v => {
    T(`verdict « ${v} » : sa couleur ne figure dans aucun verre`,
      verdict[v] && !verdict.verres.some(c => procheV(rgbV(verdict[v].trait), hexV(c))),
      verdict[v] && verdict[v].trait);
    T(`verdict « ${v} » : un halo blanc le détache du verre`,
      verdict[v] && procheV(rgbV(verdict[v].halo), [255,255,255]),
      verdict[v] && verdict[v].halo);
  });
  T('le juste et le faux restent distincts l’un de l’autre',
    !procheV(rgbV(verdict.bon.trait), rgbV(verdict.faux.trait)),
    `${verdict.bon.trait} / ${verdict.faux.trait}`);
  T('les pièces hors sujet sont VRAIMENT grisées, pas seulement pâlies',
    verdict.neutre && (() => { const c = rgbV(verdict.neutre.fill);
      return Math.max(...c) - Math.min(...c) < 45; })(),
    verdict.neutre && verdict.neutre.fill);
  T('aucune pièce en cause n’est grisée', verdict.grisAJuste === true);
  T('chaque pièce porte un seul verdict', verdict.classesCumulees === false);

  /* ---------- B2 / B3 : huit manches sans redondance ---------- */
  const huit = await page.evaluate(() => {
    const res = {};
    [['cp-decrire','CP', qDecrire], ['ce1-justifier','CE1', qJustifier]].forEach(([id, nom, gen]) => {
      const pal = CONTENU.paliers[nom];
      const cfg = pal.miniJeux.find(m => m.id === id);
      let doublons = 0, tailles = new Set(), reponsesEgales = 0;
      for (let n = 0; n < 200; n++) {
        const f = gen(cfg, pal);
        tailles.add(f.length);
        const sig = f.map(q => q._signature);
        if (new Set(sig).size !== sig.length) doublons++;
        const nombres = f.filter(q => q.compte).map(q => q.bonNombre);
        if (new Set(nombres).size !== nombres.length) reponsesEgales++;
      }
      res[id] = {n:cfg.nbQuestions, doublons, tailles:[...tailles], reponsesEgales};
    });
    return res;
  });
  T('B2 — cp-decrire compte huit manches', huit['cp-decrire'].n === 8
    && JSON.stringify(huit['cp-decrire'].tailles) === '[8]', JSON.stringify(huit['cp-decrire']));
  T('B2 — aucune manche en double, et deux comptages n’ont jamais la même réponse',
    huit['cp-decrire'].doublons === 0 && huit['cp-decrire'].reponsesEgales === 0,
    `${huit['cp-decrire'].doublons} doublons / ${huit['cp-decrire'].reponsesEgales} réponses jumelles`);
  T('B3 — ce1-justifier compte huit manches', huit['ce1-justifier'].n === 8
    && JSON.stringify(huit['ce1-justifier'].tailles) === '[8]', JSON.stringify(huit['ce1-justifier']));
  T('B3 — la banque fournit huit manches distinctes',
    huit['ce1-justifier'].doublons === 0, huit['ce1-justifier'].doublons);
  T('B3 — le mini-jeu s’appelle « Propriétés des pièces »',
    titres['ce1-justifier'].t === 'Propriétés des pièces', titres['ce1-justifier'].t);

  /* ---------- B4.2 : effacer sa sélection ---------- */
  await page.goto(base + '?competence=ce2-litige');
  await page.waitForTimeout(280);
  const eff = await page.evaluate(async () => {
    desarmerAutoSuivant();
    const svg = document.getElementById('svgScene');
    const toucher = (z) => {
      const q = file[pos], pts = q.pieces[0].pts, n = pts.length, i = +z.slice(1);
      const p = z[0] === 'a' ? pts[i]
        : [(pts[i][0]+pts[(i+1)%n][0])/2, (pts[i][1]+pts[(i+1)%n][1])/2];
      const pt = svg.createSVGPoint(); pt.x = p[0]; pt.y = p[1];
      const e = pt.matrixTransform(svg.getElementById('scenePieces').getScreenCTM());
      svg.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:e.x, clientY:e.y}));
    };
    const zones = file[pos].exigences[0].parmi;
    const visible = !document.getElementById('btnEffacer').hidden;
    toucher(zones[0]);
    const apres = selection.size;
    toucher(zones[0]);
    const retouche = selection.size;
    toucher(zones[0]);
    document.getElementById('btnEffacer').click();
    const efface = selection.size;
    const marques = svg.querySelectorAll('.trace-choisi').length;
    document.getElementById('btnValider').click();
    await new Promise(r => setTimeout(r, 80));
    desarmerAutoSuivant();
    return {visible, apres, retouche, efface, marques,
            cacheApres:document.getElementById('btnEffacer').hidden};
  });
  T('B4.2 — le bouton « Effacer » est offert pendant la sélection', eff.visible);
  T('B4.2 — retoucher une zone la désélectionne', eff.apres === 1 && eff.retouche === 0,
    `${eff.apres} puis ${eff.retouche}`);
  T('B4.2 — le bouton remet la sélection à zéro, marques comprises',
    eff.efface === 0 && eff.marques === 0, `${eff.efface} zones, ${eff.marques} marques`);
  T('B4.2 — et il se verrouille avec le reste à la validation', eff.cacheApres === true);

  /* ---------- B4.3 : le retour de l’étape 2 ne juge que l’étape 2 ---------- */
  const deuxTemps = await page.evaluate(async () => {
    const res = {};
    for (const [id, mode] of [['ce2-litige','litige'], ['ce1-justifier','justifier']]) {
      location.hash = '';
      lance(id);
      await new Promise(r => setTimeout(r, 200));
      desarmerAutoSuivant();
      const q = file[pos];
      /* On rate l’étape 1 volontairement, puis on réussit l’étape 2. */
      if (mode === 'litige') { verrouille = false; selection = new Set();
        document.getElementById('btnValider').click(); }
      else [...document.querySelectorAll('#answers .rep')]
        .find(b => b.textContent !== q.etape1.ans).click();
      await new Promise(r => setTimeout(r, 90));
      desarmerAutoSuivant();
      document.getElementById('btnNext').click();
      await new Promise(r => setTimeout(r, 150));
      desarmerAutoSuivant();
      [...document.querySelectorAll('#answers .rep')]
        .find(b => b.textContent === q.etape2.ans).click();
      await new Promise(r => setTimeout(r, 90));
      desarmerAutoSuivant();
      const vu = {texte:document.getElementById('feedback').textContent,
                  classe:document.getElementById('feedback').className,
                  pts:file[pos]._pts, rang:pos};
      /* La pastille de la manche courante porte « cur » tant qu’on y est :
         c’est en passant à la suivante qu’elle prend son verdict. */
      document.getElementById('btnNext').click();
      await new Promise(r => setTimeout(r, 120));
      desarmerAutoSuivant();
      vu.pastille = document.querySelectorAll('#dots .dot')[vu.rang].className;
      res[id] = vu;
    }
    return res;
  });
  ['ce2-litige','ce1-justifier'].forEach(id => {
    T(`B4.3 — ${id} : bien répondre à l’étape 2 ne s’annonce plus « Presque ! »`,
      !/Presque/.test(deuxTemps[id].texte) && deuxTemps[id].classe === 'bon',
      deuxTemps[id].texte);
    T(`B4.3 — ${id} : le retour nomme quand même l’étape 1 manquée`,
      /ailleurs|restait/.test(deuxTemps[id].texte), deuxTemps[id].texte);
    T(`B4.3 — ${id} : les deux points de l’étape 2 sont bien comptés`,
      deuxTemps[id].pts === 2, deuxTemps[id].pts);
    T(`B4.3 — ${id} : la pastille reflète les points, pas le dernier booléen`,
      /ok/.test(deuxTemps[id].pastille), deuxTemps[id].pastille);
  });

  /* ---------- §13 bis : les tirages, mesurés À L’ÉCHELLE DE LA FILE ----------
     Le validateur d’items relit chaque manche PRISE ISOLÉMENT. C’est
     nécessaire et insuffisant : une file de manches toutes justes peut être
     répétitive, et c’est exactement pour cela qu’il n’avait rien vu quand
     `scenarioRelation` servait trois fois la même famille. La justesse d’une
     manche et la variété d’une file sont deux propriétés distinctes.
     Les dimensions contrôlées sont DÉCLARÉES PAR LE MODULE : la suite ne tient
     pas sa propre liste, qui dériverait au premier mini-jeu ajouté. */
  const tirages = await page.evaluate(() => {
    const N = 200, res = [];
    Object.values(CONTENU.paliers).forEach(pal => pal.miniJeux.forEach(cfg => {
      const dims = DIMENSIONS_CONTENU[cfg.mode];
      if (!dims) { res.push({id:cfg.id, absente:true}); return; }
      dims.forEach(dim => {
        const valeurs = new Set();
        let suite = 0, avantEpuisement = 0, longueur = 0, exemple = null;
        for (let n = 0; n < N; n++) {
          const f = engendrerFile(cfg, pal);
          const vals = f.map(dim.de);
          longueur = vals.length;
          vals.forEach(v => valeurs.add(v));
          for (let i = 1; i < vals.length; i++)
            if (vals[i] === vals[i-1]) { suite++; if (!exemple) exemple = vals.slice(0, 6).join(' → '); }
        }
        /* « Un contenu revient avant épuisement de son stock » : dans une file
           de L manches puisant dans un stock de S, une valeur ne peut
           légitimement paraître que ⌈L/S⌉ fois. */
        const S = valeurs.size, plafond = Math.ceil(longueur / Math.max(1, S));
        for (let n = 0; n < N; n++) {
          const compte = {};
          engendrerFile(cfg, pal).map(dim.de).forEach(v => { compte[v] = (compte[v]||0)+1; });
          if (Object.values(compte).some(c => c > plafond)) avantEpuisement++;
        }
        res.push({id:cfg.id, nom:dim.nom, ferme:dim.ferme || null,
                  suite, avantEpuisement, stock:S, file:longueur, plafond, exemple});
      });
    }));
    return res;
  });

  T('§13 bis — chaque mini-jeu déclare ses dimensions de contenu',
    tirages.every(x => !x.absente), tirages.filter(x => x.absente).map(x => x.id).join(', '));

  const suites = tirages.filter(x => x.suite > 0);
  T('§13 bis — aucun contenu ne paraît deux manches de suite, nulle part',
    suites.length === 0,
    suites.map(x => `${x.id}/${x.nom} : ${x.suite} fois (${x.exemple})`).slice(0, 3).join(' | '));

  const cycles = tirages.filter(x => !x.ferme && x.avantEpuisement > 0);
  T('§13 bis — hors stock fermé, aucun contenu ne revient avant épuisement',
    cycles.length === 0,
    cycles.map(x => `${x.id}/${x.nom} : ${x.avantEpuisement}/200`).slice(0, 3).join(' | '));

  const etroits = tirages.filter(x => !x.ferme && x.stock <= x.file);
  T('§13 bis — hors stock fermé, le stock est plus grand que la file',
    etroits.length === 0,
    etroits.map(x => `${x.id}/${x.nom} : stock ${x.stock} pour ${x.file} manches`).join(' | '));

  /* Un stock fermé n’est pas un laissez-passer : il doit dire POURQUOI il
     l’est, et rester soumis à la clause « pas deux fois de suite ». */
  const fermes = tirages.filter(x => x.ferme);
  T('§13 bis — chaque stock fermé est justifié en toutes lettres',
    fermes.every(x => x.ferme.length > 30),
    fermes.filter(x => x.ferme.length <= 30).map(x => x.id + '/' + x.nom).join(', '));
  /* Une dimension est déclarée PAR MODE, donc partagée par plusieurs
     mini-jeux : la dispense se juge sur l’ensemble. Elle est gratuite si
     AUCUN mini-jeu ne s’y heurte — c’est alors une exception qu’on a cessé
     d’avoir besoin d’écrire, et qui masquerait la prochaine régression. */
  const parDimension = {};
  fermes.forEach(x => {
    (parDimension[x.nom] = parDimension[x.nom] || []).push(x);
  });
  const gratuites = Object.entries(parDimension)
    .filter(([, l]) => l.every(x => x.stock > x.file && x.avantEpuisement === 0));
  T('§13 bis — aucune dispense de stock fermé n’est gratuite',
    gratuites.length === 0,
    gratuites.map(([nom, l]) => `${nom} (${l.map(x => x.id).join(', ')})`).join(' | '));

  /* La pondération par duplication d’une entrée du stock est incompatible
     avec le sans-remise : les doublons s’épuisent ensemble. */
  T('§13 bis — aucun stock de tirage ne pondère en dupliquant une entrée',
    await page.evaluate(() => [FAMILLES_RELATION.map(f => f.type + ':' + (f.a || '')),
                               FAUSSES_TRI_CARRE.map(f => JSON.stringify(f)),
                               LITIGES.map(l => l.affirme + '/' + l.reel)]
      .every(stock => new Set(stock).size === stock.length)));

  /* Le tirage lui-même doit tenir la clause 2 À LA JOINTURE DE DEUX CYCLES —
     le point que le sans-remise seul ne couvre pas, et qui tombe au milieu
     d’une file dès que le stock est plus court qu’elle. */
  const jointure = await page.evaluate(() => {
    const mesure = (stock, n) => {
      let suite = 0, prec = null, total = 0;
      for (let k = 0; k < 3000; k++)
        tirerSansRepetition('jointure-' + stock.length + '-' + n, stock, n)
          .forEach(v => { if (prec === v) suite++; prec = v; total++; });
      return {suite, total};
    };
    /* On suit `prec` D’UN APPEL À L’AUTRE : la jointure est ENTRE deux
       cycles, pas à l’intérieur d’un appel. Mesurer sans franchir la
       frontière laissait passer la suppression pure et simple de la clause. */
    return {court:mesure(['a','b'], 1), moyen:mesure(['a','b','c','d','e','f'], 5),
            long:mesure(['a','b','c'], 7)};
  });
  ['court','moyen','long'].forEach(cas => {
    T(`§13 bis — le tirage ne répète pas à la jointure de deux cycles (${cas})`,
      jointure[cas].suite === 0, `${jointure[cas].suite} sur ${jointure[cas].total}`);
  });

  /* ---------- Parties complètes, §11 ---------- */
  await page.evaluate(() => localStorage.setItem('mayeutik-sessions', '[]'));
  for (const id of JEUX) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(200);
    const fini = await page.evaluate(async (id) => {
      for (let g = 0; g < 40 && document.getElementById('end').hidden; g++) {
        desarmerAutoSuivant();
        const q = file[pos];
        if (q.mode === 'litige' && q.etape === 1) {
          const svg = document.getElementById('svgScene');
          q.exigences.forEach(e => e.parmi.slice(0, e.nb).forEach(z => {
            const i = +z.slice(1), pts = q.pieces[0].pts, n = pts.length;
            const p = z[0] === 'a' ? pts[i]
              : [(pts[i][0] + pts[(i+1)%n][0]) / 2, (pts[i][1] + pts[(i+1)%n][1]) / 2];
            const pt = svg.createSVGPoint(); pt.x = p[0]; pt.y = p[1];
            const ev = pt.matrixTransform(svg.getScreenCTM());
            svg.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:ev.x, clientY:ev.y}));
          }));
          document.getElementById('btnValider').click();
        } else if (q.mode === 'reconnaitre') {
          const dem = q.demandees;
          q.pieces.filter(p => dem.includes(p.forme)).forEach(p => {
            document.querySelector(`[data-piece="${p.id}"]`).dispatchEvent(new MouseEvent('click', {bubbles:true}));
          });
          document.getElementById('btnValider').click();
        } else if (q.mode === 'relations' && q.multi) {
          const reps = [...document.querySelectorAll('#answers .rep')];
          q.props.forEach((p, k) => { if (p.bon) reps[k].click(); });
          document.getElementById('btnValider').click();
        } else if (q.mode === 'vocabulaire' && !document.querySelector('#answers .rep')) {
          /* Les cibles de la rosace sont géométriques : on touche le SVG au
             bon endroit plutôt que de cliquer un élément. */
          const svg = document.getElementById('svgScene');
          const t = svg.querySelector('[data-c]');
          if (t) {
            const x = t.tagName === 'circle' ? +t.getAttribute('cx')
              : (+t.getAttribute('x1') + +t.getAttribute('x2')) / 2;
            const y = t.tagName === 'circle' ? +t.getAttribute('cy')
              : (+t.getAttribute('y1') + +t.getAttribute('y2')) / 2;
            const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
            const e = pt.matrixTransform(svg.getScreenCTM());
            svg.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:e.x, clientY:e.y}));
          } else {
            const p = document.querySelector('#svgScene .piece');
            if (p) p.dispatchEvent(new MouseEvent('click', {bubbles:true}));
          }
        } else {
          const b = document.querySelector('#answers .rep') || document.querySelector('#svgScene .piece');
          if (b) b.dispatchEvent(new MouseEvent('click', {bubbles:true}));
        }
        await new Promise(r => setTimeout(r, 60));
        desarmerAutoSuivant();
        if (!document.getElementById('end').hidden) break;
        const n = document.getElementById('btnNext');
        if (n && n.style.display !== 'none') n.click();
        await new Promise(r => setTimeout(r, 60));
      }
      const s = JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]');
      return {fin: !document.getElementById('end').hidden, d:s[s.length-1]};
    }, id);
    T(`${id} : la partie va jusqu’au bout`, fini.fin);
    const d = fini.d || {};
    T(`${id} : session §11 complète`,
      ['profilId','module','competence','score','total','date','duree'].every(k => k in d)
      && d.module === 'M34' && d.competence === id, JSON.stringify(d));
  }

  console.log('\nErreurs JS/console :', erreurs.length ? erreurs.slice(0, 6) : 'aucune');
  if (erreurs.length) ko += erreurs.length;
  console.log(`\n${ok} OK, ${ko} KO`);
  console.log('EXIT:' + (ko === 0 ? 'SUCCES' : 'ECHEC'));
  await nav.close(); srv.close();
})().catch(e => { console.log('CRASH', e); console.log('EXIT:ECHEC'); process.exit(1); });
