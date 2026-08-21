const socle = require('./socle.js');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = socle.chargerPlaywright();

const RACINE = socle.RACINE;
const JEU = '/jeux/M35-verifier-coder.html';
let ok = 0, ko = 0;
const T = (nom, cond, det) => { if (cond) { ok++; console.log('OK   ' + nom, det === undefined ? '' : det); }
  else { ko++; console.log('KO   ' + nom, det === undefined ? '' : det); } };

const srv = http.createServer((q, r) => {
  const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d); });
});

const JEUX = ['cp-alignement','cp-tracer-droite','ce1-alignement','ce1-angles','ce1-compas',
              'ce1-codage','ce2-alignement','ce2-angles','ce2-compas','ce2-codage'];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const base = `http://localhost:${port}${JEU}`;
  const navigateur = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });
  const page = await navigateur.newPage({ viewport: { width: 390, height: 880 } });
  /* A2 : a la premiere rencontre d'un instrument, le mini-jeu s'ouvre sur une
     manche d'ESSAI. Cette suite-ci teste les TACHES, pas la decouverte (elle a
     la sienne, test_a2.js) : on declare donc les quatre instruments deja pris
     en main, pour le profil actif quel qu'il soit, AVANT chaque chargement. */
  await page.addInitScript(() => {
    try {
      const pid = localStorage.getItem('mayeutik-profil-actif') || 'p1';
      const t = JSON.parse(localStorage.getItem('mayeutik-m35-instruments-vus') || '{}');
      t[pid] = {regle:true, gabarit:true, equerre:true, compas:true};
      localStorage.setItem('mayeutik-m35-instruments-vus', JSON.stringify(t));
    } catch (e) {}
  });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push('console: ' + m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(`http://localhost:${port}`) && !u.startsWith('data:')) erreurs.push('réseau: ' + u); });

  const profil = async (niveau) => { await page.evaluate(n => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{id:'p1', prenom:'T', niveau:n}]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    }, niveau); };

  await page.goto(base);
  await profil('CE2');
  await page.evaluate(() => { localStorage.setItem('mayeutik-sessions', '[]');
    localStorage.removeItem('mayeutik-m35-verifier-etoiles'); localStorage.removeItem('mayeutik-m35-bonus-revele'); });

  /* ---------- 1. Aucune dépendance réseau ---------- */
  const brut = fs.readFileSync(RACINE + JEU, 'utf8');
  T('aucune URL externe dans le fichier', !/(src|href)\s*=\s*["']https?:/i.test(brut));
  T('aucun fetch/XHR/import distant', !/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(brut));

  /* ---------- 2. Contrat CHARTE : structure ---------- */
  T('§7 modale de confirmation présente', /id="modale-menu"/.test(brut));
  T('§4 conteneur à confettis présent', /id="confettis-conteneur"/.test(brut));
  T('§19 touch-action pan-y universel', /\*\s*\{[^}]*touch-action:\s*pan-y/.test(brut.replace(/\n/g, ' ')));
  /* §19 : l’instrument ET ses enfants — `touch-action` ne s’hérite pas, et
     le sélecteur universel remettrait la poignée en `pan-y`. */
  T('§19 les posables neutralisent le touch, enfants compris',
    /\.posable,\s*\.posable\s*\*\s*\{[^}]*touch-action:\s*none/.test(brut.replace(/\n/g, ' ')));
  T('typographie : aucune apostrophe droite dans un mot', !/[a-zà-ÿA-ZÀ-Ÿ]'[a-zà-ÿ]/.test(brut));

  /* ---------- 3. Les dix mini-jeux se lancent ---------- */
  for (const id of JEUX) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(230);
    const r = await page.evaluate(() => ({
      ecran: document.getElementById('game').hidden ? 'home' : 'game',
      n: file.filter((q) => !q.essai).length, titre: document.getElementById('hdrTitle').textContent,
      consigne: document.getElementById('qText').textContent.trim(),
      total, modes: file.map(q => q.mode)
    }));
    T(`${id} : démarre sur l’écran de jeu`, r.ecran === 'game', r.titre);
    /* B8 : ce2-angles est passé à 3 figures de 4 ou 5 angles — au-delà d'une
       douzaine de jugements la tache devient mecanique. Les autres en font 5. */
    const attenduManches = id === 'ce2-angles' ? 3 : 5;
    /* A2 : une manche d'ESSAI peut precéder la file a la premiere rencontre
       de l'instrument. Elle n'est ni notee ni comptee — on compte donc les
       manches notees, qui sont l'invariant du mini-jeu. */
    T(`${id} : ${attenduManches} manches notées`, r.n === attenduManches, r.n);
    T(`${id} : une consigne est posée`, r.consigne.length > 8, r.consigne.slice(0, 46));
    const notes = await page.evaluate(() => file.filter(q => q.note !== false).length);
    T(`${id} : total = 2 × manches notées (demi-points entiers §11)`, r.total === notes * 2, `${r.total} pour ${notes} notées`);
  }

  /* ---------- 4. §16 deep-link palier ---------- */
  await page.goto(base + '?palier=CE2');
  await page.waitForTimeout(150);
  T('§16 ?palier=CE2 ouvre le bon onglet',
    await page.evaluate(() => etatPalierAffiche === 'CE2' &&
      [...document.querySelectorAll('#grille-jeux .card')].length === 4));

  /* ---------- 5. §15 verrouillage des onglets ---------- */
  await profil('CP');
  await page.goto(base);
  await page.waitForTimeout(150);
  let puces = await page.evaluate(() => [...document.querySelectorAll('.puce-palier')]
    .map(b => ({t:b.textContent, v:b.classList.contains('verrouille'), d:b.disabled})));
  T('§15 profil CP : CE1 et CE2 verrouillés',
    puces.length === 3 && !puces[0].v && puces[1].v && puces[2].v && puces[1].d && puces[2].d,
    JSON.stringify(puces));
  T('§15 le cadenas est visible', puces[1].t.includes('🔒'));

  await profil('CE1');
  await page.goto(base);
  await page.waitForTimeout(150);
  puces = await page.evaluate(() => [...document.querySelectorAll('.puce-palier')]
    .map(b => b.classList.contains('verrouille')));
  T('§15 profil CE1 : seul CE2 est verrouillé', JSON.stringify(puces) === '[false,false,true]', JSON.stringify(puces));

  /* Paquet cadeau : maîtriser tout le CP ouvre l’aperçu CE1. */
  await page.evaluate(() => {
    const s = ['cp-alignement','cp-tracer-droite'].map(c => ({profilId:'p1', module:'M35', competence:c,
      score:10, total:10, date:new Date().toISOString(), duree:60}));
    localStorage.setItem('mayeutik-sessions', JSON.stringify(s));
  });
  await profil('CP');
  await page.goto(base);
  await page.waitForTimeout(150);
  T('§15 paquet cadeau proposé après maîtrise du CP',
    await page.evaluate(() => !document.getElementById('bloc-bonus').hidden && !document.getElementById('paquet-cadeau').hidden));
  await page.click('#paquet-cadeau');
  await page.waitForTimeout(620);
  T('§15 le paquet ouvert dévoile les mini-jeux CE1',
    await page.evaluate(() => !document.getElementById('grille-bonus').hidden &&
      document.querySelectorAll('#grille-bonus .card').length === 4));
  await page.goto(base);
  await page.waitForTimeout(150);
  puces = await page.evaluate(() => [...document.querySelectorAll('.puce-palier')].map(b => b.disabled));
  T('§15 le CE1 est déverrouillé après ouverture du paquet', JSON.stringify(puces) === '[false,false,true]', JSON.stringify(puces));

  await profil('CE2');
  await page.evaluate(() => localStorage.setItem('mayeutik-sessions', '[]'));

  /* ---------- 6. L’instrument se translate ET tourne ---------- */
  await page.goto(base + '?competence=ce2-alignement');
  await page.waitForTimeout(260);

  /* Toute la géométrie passe par des coordonnées ÉCRAN : c’est le seul
     moyen de rejouer le vrai geste, pointeur compris. */
  const versEcran = (p) => page.evaluate(([x, y]) => {
    const svg = document.getElementById('scene');
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const q = pt.matrixTransform(svg.getScreenCTM());
    return [q.x, q.y];
  }, p);
  const glisser = async (de, vers) => {
    await page.mouse.move(de[0], de[1]);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(de[0] + (vers[0]-de[0])*i/8, de[1] + (vers[1]-de[1])*i/8);
    await page.mouse.up();
  };

  /* LE MODÈLE DE ROTATION : on cale une extrémité sur un point, puis on
     tourne autour de lui. Un pivot central rendait l’opération impossible
     au doigt. */
  const poignees = await page.evaluate(() =>
    [...posableCourant.g.querySelectorAll('.poignee')].length);
  T('la règle porte DEUX poignées, une à chaque extrémité', poignees === 2, poignees);
  T('§19 les poignées sont en touch-action:none (elles n’héritent pas)',
    await page.evaluate(() => getComputedStyle(posableCourant.g.querySelector('.poignee')).touchAction === 'none'));

  const centreEcran = async (sel) => page.evaluate((s) => {
    const r = posableCourant.g.querySelectorAll(s);
    const e = r[r.length - 1].getBoundingClientRect();
    return [e.x + e.width/2, e.y + e.height/2];
  }, sel);
  const versEcranSVG = (p) => page.evaluate(([x, y]) => {
    const svg = document.getElementById('scene');
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const q = pt.matrixTransform(svg.getScreenCTM());
    return [q.x, q.y];
  }, p);

  /* 1. Glisser le CORPS ancre une extrémité sur un point, qui s’allume. */
  const cible = await page.evaluate(() => file[pos].points[0]);
  const avantT = await page.evaluate(() => posableCourant.etat());
  /* La règle est posée de biais : les décalages se calculent DANS SON
     REPÈRE, sinon on vise à quarante pixels près. */
  const local = (q) => [avantT.x + q[0]*Math.cos(avantT.angle) - q[1]*Math.sin(avantT.angle),
                        avantT.y + q[0]*Math.sin(avantT.angle) + q[1]*Math.cos(avantT.angle)];
  const prise = local([-150, 15]);              // sur le corps, près du bout gauche
  const boutGauche = local([-165, 0]);          // l’extrémité qui doit s’ancrer
  const bout = await versEcranSVG(prise);
  const dest = await versEcranSVG([prise[0] + (cible[0] - boutGauche[0]),
                                   prise[1] + (cible[1] - boutGauche[1])]);
  await glisser(bout, dest);
  const apresT = await page.evaluate(() => {
    const e = posableCourant.etat();
    const L = 165;
    const bouts = [-L, L].map(d => [e.x + d*Math.cos(e.angle), e.y + d*Math.sin(e.angle)]);
    return {e, bouts, halos:document.querySelectorAll('.halo-ancre').length, ancre:posableCourant.ancre()};
  });
  const dMin = Math.min(...apresT.bouts.map(b => Math.hypot(b[0]-cible[0], b[1]-cible[1])));
  T('glisser le corps ANCRE une extrémité sur le point', dMin < 0.01, dMin.toFixed(3));
  T('le point d’ancrage s’allume', apresT.halos === 1, apresT.halos);
  T('c’est bien une extrémité qui s’ancre, pas le centre',
    Math.hypot(apresT.e.x - cible[0], apresT.e.y - cible[1]) > 100);

  /* 2. Tirer une poignée fait pivoter AUTOUR DE L’AUTRE EXTRÉMITÉ. Poignée
     et pivot sont lus dans le MÊME appel, sur l’état réel : les calculer
     dehors, c’est réintroduire mes hypothèses dans le test. */
  const rot = await page.evaluate(() => {
    const e = posableCourant.etat(), L = 165;
    const svg = document.getElementById('scene');
    const scene = (q) => [e.x + q[0]*Math.cos(e.angle) - q[1]*Math.sin(e.angle),
                          e.y + q[0]*Math.sin(e.angle) + q[1]*Math.cos(e.angle)];
    const ecran = (p) => { const pt = svg.createSVGPoint(); pt.x = p[0]; pt.y = p[1];
      const s = pt.matrixTransform(svg.getScreenCTM()); return [s.x, s.y]; };
    /* La poignée d’indice k pivote autour de l’ancrage `pivot` ; on prend
       celle dont le pivot est l’extrémité ANCRÉE. */
    const ancres = [scene([-L, 0]), scene([L, 0])];
    const iAncre = posableCourant.ancre() === null ? 0
      : (Math.hypot(ancres[0][0]-file[pos].points[0][0], ancres[0][1]-file[pos].points[0][1]) < 2 ? 0 : 1);
    const k = iAncre === 0 ? 1 : 0;     // poignees[1].pivot = ancrages[0]
    const el = [...posableCourant.g.querySelectorAll('.poignee')].find(x => +x.dataset.poignee === k);
    const b = el.getBoundingClientRect();
    return {angle:e.angle, pivotScene:ancres[iAncre], pivot:ecran(ancres[iAncre]),
            poignee:[b.x + b.width/2, b.y + b.height/2]};
  });
  const rr = Math.hypot(rot.poignee[0]-rot.pivot[0], rot.poignee[1]-rot.pivot[1]);
  const th0 = Math.atan2(rot.poignee[1]-rot.pivot[1], rot.poignee[0]-rot.pivot[0]);
  await glisser(rot.poignee, [rot.pivot[0] + rr*Math.cos(th0 - 0.55), rot.pivot[1] + rr*Math.sin(th0 - 0.55)]);
  const apresR = await page.evaluate((pivotScene) => {
    const e = posableCourant.etat(), L = 165;
    const scene = (q) => [e.x + q[0]*Math.cos(e.angle) - q[1]*Math.sin(e.angle),
                          e.y + q[0]*Math.sin(e.angle) + q[1]*Math.cos(e.angle)];
    const bouts = [scene([-L, 0]), scene([L, 0])];
    return {angle:e.angle,
      bouge:Math.min(...bouts.map(b => Math.hypot(b[0]-pivotScene[0], b[1]-pivotScene[1])))};
  }, rot.pivotScene);
  T('tirer une poignée fait tourner l’instrument',
    Math.abs(apresR.angle - rot.angle) > 0.2,
    `${rot.angle.toFixed(3)} → ${apresR.angle.toFixed(3)} rad`);
  T('l’extrémité ancrée ne bouge pas d’un pixel pendant la rotation',
    apresR.bouge < 1.5, apresR.bouge.toFixed(2) + ' px');

  /* Poser vraiment la règle sur les points doit armer `_instrumentPose`. */
  await page.goto(base + '?competence=ce2-alignement');
  await page.waitForTimeout(260);
  const pose = await page.evaluate(async () => {
    const q = file[pos], a = q.points[0], b = q.points[2];
    posableCourant.placerExact(a[0], a[1], Math.atan2(b[1]-a[1], b[0]-a[0]));
    return q._instrumentPose === true;
  });
  T('la règle posée sur les points est reconnue comme posée', pose);

  /* ---------- 7. Barème : demi-point sans vérification ---------- */
  const bareme = await page.evaluate(async () => {
    const res = [];
    /* (a) bonne réponse SANS poser la règle sur un item indécidable */
    let q = file[pos]; q.requiert = true; q._instrumentPose = false;
    const bonne = q.aligne ? 'Alignés' : 'Pas alignés';
    [...document.querySelectorAll('#answers .rep')].find(b => b.dataset.val === bonne).click();
    await new Promise(r => setTimeout(r, 40));
    res.push({cas:'sans vérif', pts:q._pts, score});
    desarmerAutoSuivant();
    return res;
  });
  T('bonne réponse sans instrument = demi-point (1/2)',
    bareme[0].pts === 1 && bareme[0].score === 1, JSON.stringify(bareme));
  T('la correction explique qu’il fallait poser la règle',
    /r[èe]gle/i.test(await page.textContent('#feedback')), (await page.textContent('#feedback')).slice(0, 90));

  await page.goto(base + '?competence=ce2-alignement');
  await page.waitForTimeout(220);
  const plein = await page.evaluate(async () => {
    const q = file[pos]; q.requiert = true; q._instrumentPose = true;
    const bonne = q.aligne ? 'Alignés' : 'Pas alignés';
    [...document.querySelectorAll('#answers .rep')].find(b => b.dataset.val === bonne).click();
    await new Promise(r => setTimeout(r, 40));
    desarmerAutoSuivant();
    return {pts:q._pts, score};
  });
  T('bonne réponse APRÈS vérification = point plein (2/2)', plein.pts === 2 && plein.score === 2, JSON.stringify(plein));

  /* Sur-vérifier ne coûte rien. */
  await page.goto(base + '?competence=cp-alignement');
  await page.waitForTimeout(220);
  const surVerif = await page.evaluate(async () => {
    const i = file.findIndex(q => q.mode === 'alignement' && q.evident);
    if (i < 0) return null;
    pos = i; question();
    await new Promise(r => setTimeout(r, 40));
    const q = file[pos]; q._instrumentPose = true;
    const bonne = q.aligne ? 'Alignés' : 'Pas alignés';
    [...document.querySelectorAll('#answers .rep')].find(b => b.dataset.val === bonne).click();
    await new Promise(r => setTimeout(r, 40));
    desarmerAutoSuivant();
    return {pts:q._pts, requiert:q.requiert};
  });
  T('vérifier un cas évident ne coûte rien', surVerif === null || surVerif.pts === 2, JSON.stringify(surVerif));

  /* ---------- 8. §18 la bonne réponse est montrée en vert ---------- */
  await page.goto(base + '?competence=ce2-alignement');
  await page.waitForTimeout(220);
  const dixhuit = await page.evaluate(async () => {
    const q = file[pos];
    const mauvaise = q.aligne ? 'Pas alignés' : 'Alignés';
    [...document.querySelectorAll('#answers .rep')].find(b => b.dataset.val === mauvaise).click();
    await new Promise(r => setTimeout(r, 60));
    desarmerAutoSuivant();
    const boutons = [...document.querySelectorAll('#answers .rep')].map(b => ({v:b.dataset.val, ok:b.classList.contains('ok'), ko:b.classList.contains('ko')}));
    return {boutons, bonne:q.aligne ? 'Alignés' : 'Pas alignés', pts:q._pts};
  });
  const bonBouton = dixhuit.boutons.find(b => b.v === dixhuit.bonne);
  const mauvBouton = dixhuit.boutons.find(b => b.v !== dixhuit.bonne);
  T('§18 la bonne réponse passe au vert même non touchée', bonBouton.ok && !bonBouton.ko, JSON.stringify(dixhuit.boutons));
  T('§18 le rouge ne désigne jamais la bonne réponse', mauvBouton.ko && !mauvBouton.ok);
  T('une erreur ne rapporte aucun point', dixhuit.pts === 0);

  /* ---------- 9. §20 passage automatique ---------- */
  await page.goto(base + '?competence=ce2-alignement');
  await page.waitForTimeout(220);
  await page.evaluate(() => {
    const q = file[pos];
    [...document.querySelectorAll('#answers .rep')].find(b => b.dataset.val === (q.aligne ? 'Alignés' : 'Pas alignés')).click();
  });
  T('§20 le bouton Suivant apparaît', await page.evaluate(() => getComputedStyle(document.getElementById('btnNext')).display !== 'none'));
  await page.waitForTimeout(2400);
  T('§20 la manche suivante s’enchaîne toute seule', await page.evaluate(() => pos === 1), await page.evaluate(() => pos));

  /* ---------- 10. §11 contrat de session : parties complètes ---------- */
  await page.evaluate(() => localStorage.setItem('mayeutik-sessions', '[]'));
  for (const id of JEUX) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(200);
    const fini = await page.evaluate(async (id) => {
      /* On joue en forçant la bonne réponse quel que soit le mode : chaque
         rendu expose `terminerManche`, le reste est de l’interface. */
      for (let garde = 0; garde < 40 && !document.getElementById('end').hidden === false; garde++) {
        if (!document.getElementById('end').hidden) break;
        desarmerAutoSuivant();
        const q = file[pos];
        if (q._instrumentPose === undefined) q._instrumentPose = true;
        q._instrumentPose = true;
        terminerManche(true, q.note === false ? 0 : 2, 'ok', null);
        await new Promise(r => setTimeout(r, 30));
        desarmerAutoSuivant();
        if (!document.getElementById('end').hidden) break;
        document.getElementById('btnNext').click();
        await new Promise(r => setTimeout(r, 30));
      }
      const s = JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]');
      return {fin: !document.getElementById('end').hidden, derniere: s[s.length - 1],
              etoiles: document.getElementById('endStars').textContent};
    }, id);
    T(`${id} : la partie va jusqu’à l’écran de fin`, fini.fin);
    const d = fini.derniere || {};
    const contrat = ['profilId','module','competence','score','total','date','duree'];
    T(`${id} : session §11 complète`, contrat.every(k => k in d) && d.module === 'M35' && d.competence === id,
      JSON.stringify(d));
    T(`${id} : score et total entiers`, Number.isInteger(d.score) && Number.isInteger(d.total), `${d.score}/${d.total}`);
    T(`${id} : sans faute ⇒ score plein et 3 étoiles`, d.score === d.total && fini.etoiles.includes('⭐⭐⭐'),
      `${d.score}/${d.total} ${fini.etoiles}`);
  }

  /* ---------- 11. Les générateurs, sur beaucoup de tirages ---------- */
  const gen = await page.evaluate(() => {
    const r = {alignFaux:0, douteuxSansRequis:0, evidentTropPetit:0, angleAmbigu:0,
               polyAmbigu:0, polyDosage:{}, polyTailles:{}, codageIncoherent:0, N:1500};
    for (let i = 0; i < r.N; i++) {
      const evident = i % 3 === 0;
      const it = itemAlignement(evident);
      const [a, c, b] = it.points;
      const d = distancePointDroite(c, a, Math.atan2(b[1]-a[1], b[0]-a[0]));
      if (it.aligne && d > 0.5) r.alignFaux++;
      if (!it.aligne && d < 1) r.alignFaux++;
      if (!it.evident && !it.requiert) r.douteuxSansRequis++;
      if (it.evident && d < 12) r.evidentTropPetit++;

      const an = itemAngle(i % 2 === 0);
      const vrai = angleEn(an.sommet, an.a, an.b);
      const attendu = Math.abs(vrai - 90) <= 1 ? 'droit' : (vrai < 90 ? 'aigu' : 'obtus');
      if (attendu !== an.reponse) r.angleAmbigu++;

      const po = itemPolygone();
      po.angles.forEach((ang, k) => {
        const ecart = Math.abs(ang - 90);
        /* Un angle proche du droit DOIT être annoncé douteux : c’est ce
           drapeau qui rend l’équerre obligatoire et le demi-point possible.
           Un angle franc, lui, doit être franc pour de bon. */
        if (ecart < 12 && !po.douteux[k]) r.polyAmbigu++;
        if (ecart >= 12 && po.douteux[k]) r.polyAmbigu++;
        /* La réponse annoncée est celle de la figure réellement dessinée. */
        const attendu = ecart <= 1 ? 'droit' : (ang < 90 ? 'aigu' : 'obtus');
        if (attendu !== po.reponses[k]) r.polyAmbigu++;
      });
      /* B8 : le polygone a 4 OU 5 angles, la somme intérieure suit donc le
         nombre de côtés. Une constante 360 encoderait le quadrilatère. */
      const somme = po.angles.reduce((s, a) => s + a, 0);
      if (Math.abs(somme - (po.angles.length - 2) * 180) > 0.5) r.polySomme = (r.polySomme || 0) + 1;
      if (po.angles.length < 4 || po.angles.length > 5) r.polyCotes = (r.polyCotes || 0) + 1;
      r.polyTailles[po.angles.length] = (r.polyTailles[po.angles.length] || 0) + 1;
      const nbDouteux = po.douteux.filter(Boolean).length;
      r.polyDosage[nbDouteux] = (r.polyDosage[nbDouteux] || 0) + 1;
    }
    ['carre','rectangle','losange','triangleRect','isocele'].forEach(t => {
      const f = figureCodage(t);
      const n = f.pts.length;
      const L = f.pts.map((p, i) => Math.hypot(f.pts[(i+1)%n][0]-p[0], f.pts[(i+1)%n][1]-p[1]));
      f.groupes.forEach(g => { const m = L[g[0]]; g.forEach(i => { if (Math.abs(L[i]-m)/m > 0.02) r.codageIncoherent++; }); });
      f.droits.forEach(i => {
        const ang = angleEn(f.pts[i], f.pts[(i-1+n)%n], f.pts[(i+1)%n]);
        if (Math.abs(ang - 90) > 1) r.codageIncoherent++;
      });
      /* Aucun côté hors groupe ne doit être égal à un côté marqué. */
      const marques = new Set(f.groupes.flat());
      L.forEach((l, i) => { if (marques.has(i)) return;
        f.groupes.forEach(g => { if (Math.abs(l - L[g[0]])/L[g[0]] < 0.02) r.codageIncoherent++; }); });
    });
    return r;
  });
  T('alignement : `aligne` correspond toujours à la géométrie', gen.alignFaux === 0, gen.alignFaux);
  T('alignement : tout item non évident exige l’instrument', gen.douteuxSansRequis === 0, gen.douteuxSansRequis);
  T('alignement : un défaut « évident » l’est vraiment (≥12 px)', gen.evidentTropPetit === 0, gen.evidentTropPetit);
  T('angle : la réponse annoncée est celle de la figure', gen.angleAmbigu === 0, gen.angleAmbigu);
  T('polygone : `douteux` et `reponses` collent à la figure dessinée', gen.polyAmbigu === 0, gen.polyAmbigu);
  T('polygone : les angles somment à (n-2)×180', !gen.polySomme, gen.polySomme || 0);
  T('polygone : 4 ou 5 angles, jamais autre chose', !gen.polyCotes, gen.polyCotes || 0);
  T('polygone : les deux tailles sont bien tirées',
    Object.keys(gen.polyTailles).length === 2, JSON.stringify(gen.polyTailles));
  T('polygone : dosage douteux 1 ou 2 par figure',
    Object.keys(gen.polyDosage).every(k => +k >= 1 && +k <= 2), JSON.stringify(gen.polyDosage));
  T('codage : marques d’égalité et angles droits vrais sur la figure', gen.codageIncoherent === 0, gen.codageIncoherent);

  /* ---------- 12. Le codage refuse la marque isolée ---------- */
  await page.goto(base + '?competence=ce2-codage');
  await page.waitForTimeout(220);
  const isole = await page.evaluate(async () => {
    const i = file.findIndex(q => q.type === 'isocele');
    if (i < 0) return {absent:true};
    pos = i; question();
    await new Promise(r => setTimeout(r, 60));
    const q = file[pos];
    return {groupes:q.groupes, cotes:q.pts.length};
  });
  T('ce2-codage contient le triangle isocèle (marque isolée absurde)', !isole.absent, JSON.stringify(isole));

  /* ---------- 13. §7 retour au menu avec confirmation ---------- */
  await page.goto(base + '?competence=ce1-codage');
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.getElementById('btnBack').click(); });
  await page.waitForTimeout(120);
  await page.evaluate(() => document.getElementById('bouton-menu').click());
  await page.waitForTimeout(150);
  T('§7 le retour au shell demande confirmation',
    await page.evaluate(() => !document.getElementById('modale-menu').hidden));
  await page.click('#modale-menu-rester');
  await page.waitForTimeout(120);
  T('§7 « Rester » referme la modale sans quitter',
    await page.evaluate(() => document.getElementById('modale-menu').hidden && !document.getElementById('home').hidden));

  /* ---------- A3 : auto-test des invariants, tous mini-jeux ---------- */
  await page.goto(base + '?competence=cp-alignement');
  await page.waitForTimeout(200);
  const auto = await page.evaluate(() => {
    const res = {};
    Object.values(CONTENU.paliers).forEach(p => p.miniJeux.forEach(cfg => {
      let pb = 0, items = 0;
      for (let n = 0; n < 50; n++) {
        const f = engendrerFile(cfg);          // AVANT le filet de reprise
        items += f.length; pb += verifierFile(f).length;
      }
      res[cfg.id] = {items, pb};
    }));
    return res;
  });
  Object.entries(auto).forEach(([id, r]) => {
    T(`A3 — ${id} : aucun item ne viole les invariants`, r.pb === 0, `${r.pb} sur ${r.items} items`);
  });
  const filet = await page.evaluate(() => {
    let pb = 0;
    Object.values(CONTENU.paliers).forEach(p => p.miniJeux.forEach(cfg => {
      for (let n = 0; n < 15; n++) pb += verifierFile(construireFile(cfg)).length;
    }));
    return pb;
  });
  T('A3 — le filet de génération ne laisse passer aucun item fautif', filet === 0, filet);

  /* ---------- A3 : l’établi a QUATRE pointes, une seule intruse ---------- */
  const etabli = await page.evaluate(() => {
    let mauvais = 0, N = 400, nb = new Set();
    for (let i = 0; i < N; i++) {
      const it = itemEtabli();
      nb.add(it.points.length);
      /* Deux points pris au hasard ne font pas une référence : l’un d’eux
         peut être l’intruse. On passe par l’analyse calculée. */
      const an = analyseEtabli(it.points);
      if (!an.resteAligne) mauvais++;
      if (an.fautive !== it.fautive) mauvais++;
      if (an.ecart < 12) mauvais++;
    }
    return {mauvais, N, tailles:[...nb]};
  });
  T('A3 — l’établi compte quatre pointes', JSON.stringify(etabli.tailles) === '[4]', JSON.stringify(etabli.tailles));
  T('A3 — une seule pointe sort du rang, et c’est celle qu’on annonce',
    etabli.mauvais === 0, `${etabli.mauvais}/${etabli.N}`);

  /* ---------- B6 : au CE1, un seul tampon ---------- */
  await page.goto(base + '?competence=ce1-codage');
  await page.waitForTimeout(220);
  const ce1c = await page.evaluate(() => ({
    tampons:[...document.querySelectorAll('#barreOutils .outil[data-t]')].map(b => b.dataset.t),
    cotes:document.querySelectorAll('#scene .cible-tactile[data-t^="c"]').length,
    consigne:document.getElementById('qText').textContent
  }));
  T('B6 — le CE1 n’offre que le tampon d’angle droit',
    JSON.stringify(ce1c.tampons) === '["droit"]', JSON.stringify(ce1c.tampons));
  T('B6 — aucun côté n’est marquable au CE1', ce1c.cotes === 0, ce1c.cotes);
  T('B6 — la consigne ne parle que des angles droits',
    !/longueur|égal/i.test(ce1c.consigne), ce1c.consigne.slice(0, 60));

  /* ---------- B6 bis : la CORRECTION non plus ne code pas les égalités ----
     L’enfant ne pouvait pas poser la marque d’égalité, mais la figure de
     correction la lui montrait. On joue les cinq manches CE1 jusqu’au bout —
     dont le carré et le rectangle, qui SONT porteurs d’égalités — et on relit
     le dessin corrigé. Le contrôle passe par `data-code`, écrit par les
     fonctions de marque : il lit ce qui est dessiné, sans refaire le calcul
     de ce qui devrait l’être. */
  const corr = await page.evaluate(async () => {
    const pause = ms => new Promise(r => setTimeout(r, ms));
    const vus = [], types = [], pbValidateur = [];
    for (let i = 0; i < file.length; i++) {
      document.getElementById('btnValider').click();
      await pause(60);
      const codes = [...document.querySelectorAll('#marques [data-code]')].map(e => e.dataset.code);
      vus.push(...codes);
      types.push(file[pos].type);
      pbValidateur.push(...verifierItem(file[pos]));
      const n = document.getElementById('btnNext');
      if (n && n.style.display !== 'none') { n.click(); await pause(60); }
    }
    return {egalites:vus.filter(c => c === 'egalite').length, droits:vus.filter(c => c === 'droit').length,
            types, pbValidateur};
  });
  T('B6 — la correction CE1 n’affiche aucune marque d’égalité',
    corr.egalites === 0, `${corr.egalites} marque(s) sur ${corr.types.length} manches`);
  T('B6 — elle affiche bien les angles droits attendus', corr.droits > 0, corr.droits);
  T('B6 — les figures porteuses d’égalités sont bien passées (sinon le test ne prouve rien)',
    corr.types.filter(t => t === 'carre' || t === 'rectangle').length >= 3,
    JSON.stringify(corr.types));
  T('B6 — le validateur ne signale rien sur les manches jouées',
    corr.pbValidateur.length === 0, JSON.stringify(corr.pbValidateur));

  /* Le garde-fou doit SAVOIR ÉCHOUER : on lui soumet une correction CE1 qui
     porterait la marque d’égalité, et un CE1 dont la palette l’offrirait.
     Sans cela, « aucun problème signalé » ne distingue pas un code correct
     d’un contrôle inerte — c’était précisément l’état de l’ancien garde. */
  const mut = await page.evaluate(() => ({
    correction: verifierItem({mode:'codage1', pts:[[0,0],[10,0],[10,10],[0,10]],
                              droits:[], groupes:[], _codeAffiche:['egalite']}).length,
    palette:    verifierItem({mode:'codage1', pts:[[0,0],[10,0],[10,10],[0,10]],
                              droits:[], groupes:[], _tamponsOfferts:['droit','simple']}).length,
    ce2ok:      verifierItem({mode:'codage2', pts:[[0,0],[10,0],[10,10],[0,10]],
                              droits:[], groupes:[], _codeAffiche:['droit','egalite'],
                              _tamponsOfferts:['droit','simple','double']}).length
  }));
  T('B6 — le garde-fou refuse une correction CE1 qui coderait les égalités', mut.correction > 0, mut.correction);
  T('B6 — il refuse aussi un tampon d’égalité offert au CE1', mut.palette > 0, mut.palette);
  T('B6 — et il laisse passer le CE2, où les deux notations sont au programme', mut.ce2ok === 0, mut.ce2ok);

  /* ---------- B2 : une DROITE, pas un segment ---------- */
  await page.goto(base + '?competence=cp-tracer-droite');
  await page.waitForTimeout(230);
  const b2 = await page.evaluate(async () => {
    const q = file[pos];
    const consigne = document.getElementById('qText').textContent;
    /* On force le tracé juste et on mesure le trait obtenu. */
    q._alignee = true;
    posableCourant.g.dispatchEvent(new Event('x'));
    const svg = document.getElementById('scene');
    svg.insertAdjacentHTML('beforeend', droiteSvg(q._a, q._b, 'trace-fait'));
    const l = [...svg.querySelectorAll('.trace-fait')].pop();
    const p1 = [+l.getAttribute('x1'), +l.getAttribute('y1')];
    const p2 = [+l.getAttribute('x2'), +l.getAttribute('y2')];
    return {consigne, longTrait:Math.hypot(p2[0]-p1[0], p2[1]-p1[1]),
            longSeg:Math.hypot(q._b[0]-q._a[0], q._b[1]-q._a[1])};
  });
  T('B2 — l’énoncé emploie les mots du programme',
    /Trace une droite qui passe par ces deux points/.test(b2.consigne), b2.consigne.slice(0, 60));
  T('B2 — le trait DÉPASSE des deux points, des deux côtés',
    b2.longTrait > b2.longSeg + 80, `${b2.longTrait.toFixed(0)} px pour un segment de ${b2.longSeg.toFixed(0)}`);

  /* ---------- Le trait du verrier : placer, PUIS tracer ---------- */
  await page.goto(base + '?competence=cp-tracer-droite');
  await page.waitForTimeout(280);
  const vers = (p) => page.evaluate(([x, y]) => {
    const svg = document.getElementById('scene');
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const q = pt.matrixTransform(svg.getScreenCTM());
    return [q.x, q.y];
  }, p);
  const bordEcran = () => page.evaluate(() => {
    const e = posableCourant.g.querySelector('.bord').getBoundingClientRect();
    return [e.x + e.width/2, e.y + e.height/2];
  });
  const etatTracer = () => page.evaluate(() => ({
    bouton:document.getElementById('btnValider').style.display,
    texte:document.getElementById('btnValider').textContent,
    traits:document.querySelectorAll('#scene .trace-fait').length,
    verrouille, calee:!!file[pos]._calee,
    pos:[posableCourant.etat().x, posableCourant.etat().y]
  }));
  const avant = await etatTracer();
  T('le bouton de validation de la règle est offert, avec son logo',
    avant.bouton === 'block' && /📏/.test(avant.texte) && /règle/i.test(avant.texte), avant.texte);

  /* Placer en PLUSIEURS FOIS : c’est le geste réel, et c’est lui qui était
     lu comme un tracé. Chaque repose est un appui sans déplacement notable. */
  let b = await bordEcran();
  await page.mouse.move(b[0], b[1]); await page.mouse.down();
  await page.mouse.move(b[0] + 3, b[1] + 2); await page.mouse.up();
  await page.waitForTimeout(60);
  b = await bordEcran();
  await page.mouse.move(b[0], b[1]); await page.mouse.down();
  await page.mouse.move(b[0] + 2, b[1] - 1); await page.mouse.up();
  await page.waitForTimeout(60);
  const pendant = await etatTracer();
  T('reposer la règle plusieurs fois ne trace rien et ne clôt pas la manche',
    pendant.traits === 0 && pendant.verrouille === false, `${pendant.traits} trait(s)`);

  /* On valide la position, puis on vérifie que la règle ne bouge plus. */
  await page.click('#btnValider');
  await page.waitForTimeout(80);
  const calee = await etatTracer();
  T('valider la position fige la règle et retire le bouton',
    calee.calee === true && calee.bouton === 'none', JSON.stringify(calee.bouton));
  b = await bordEcran();
  await page.mouse.move(b[0], b[1]); await page.mouse.down();
  await page.mouse.move(b[0] + 70, b[1] + 40); await page.mouse.up();
  await page.waitForTimeout(80);
  const bougee = await etatTracer();
  T('une règle calée ne se déplace plus',
    Math.hypot(bougee.pos[0] - calee.pos[0], bougee.pos[1] - calee.pos[1]) < 0.5,
    `${Math.hypot(bougee.pos[0]-calee.pos[0], bougee.pos[1]-calee.pos[1]).toFixed(2)} px`);
  T('les poignées de rotation s’effacent une fois la règle calée',
    await page.evaluate(() => [...posableCourant.g.querySelectorAll('.poignee')]
      .every(e => getComputedStyle(e).display === 'none')));

  /* …et qu’un appui sur le bord trace enfin. */
  b = await bordEcran();
  await page.mouse.move(b[0], b[1]); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(120);
  const trace = await etatTracer();
  T('une fois calée, appuyer sur le bord trace et clôt la manche',
    trace.verrouille === true, `verrouille=${trace.verrouille}`);
  /* La règle partant sous les points, le tracé est faux : §18 révèle alors la
     bonne droite APRÈS un délai. On l’attend avant de compter le trait — et on
     ne désarme RIEN entre-temps : `desarmerAutoSuivant` annule aussi le
     minuteur de révélation, si bien qu’un désarmement prudent effaçait
     justement ce qu’on venait mesurer. */
  await page.waitForTimeout(1200);
  const revele = await etatTracer();
  await page.evaluate(() => desarmerAutoSuivant());
  T('et le trait attendu finit par se montrer (§18)',
    revele.traits >= 1, `${revele.traits} trait(s)`);

  /* ---------- Les vignettes du menu disent la tâche ---------- */
  const vignettes = await page.evaluate(() => {
    const o = {};
    Object.values(CONTENU.paliers).forEach(p => p.miniJeux.forEach(m => { o[m.id] = m.description; }));
    return o;
  });
  T('la vignette du trait du verrier ne parle plus de « plomb »',
    !/plomb/i.test(vignettes['cp-tracer-droite']), vignettes['cp-tracer-droite']);
  T('elle annonce la tâche réelle : une droite par deux points',
    /droite/i.test(vignettes['cp-tracer-droite']) && /deux points/i.test(vignettes['cp-tracer-droite']),
    vignettes['cp-tracer-droite']);
  T('la vignette de L’expertise prévient et dit quoi faire',
    /trompeuses/i.test(vignettes['ce2-alignement']) && /vérifier/i.test(vignettes['ce2-alignement']),
    vignettes['ce2-alignement']);
  T('elle tient sur deux lignes à l’écran',
    await page.evaluate(() => {
      retourAccueil();
      etatPalierAffiche = 'CE2'; construireAccueil();
      const d = [...document.querySelectorAll('#grille-jeux .card')]
        .find(c => c.dataset.jeu === 'ce2-alignement').querySelector('.det');
      return d.textContent.includes('\n') && getComputedStyle(d).whiteSpace === 'pre-line'
        && d.getBoundingClientRect().height > 20;
    }));

  /* ---------- Le plan certifié : compas et tampons ---------- */
  await page.goto(base + '?competence=ce2-codage');
  await page.waitForTimeout(300);
  const versCodage = (p) => page.evaluate(([x, y]) => {
    const svg = document.getElementById('scene');
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const q = pt.matrixTransform(svg.getScreenCTM());
    return [q.x, q.y];
  }, p);
  /* On se place sur une manche qui offre le compas (rectangle ou isocèle). */
  await page.evaluate(() => {
    const i = file.findIndex(q => q._exigeVerif === true
      || q.type === 'rectangle' || q.type === 'isocele');
    if (i >= 0) { pos = i; question(); }
    desarmerAutoSuivant();
  });
  await page.waitForTimeout(200);
  const aCompas = await page.evaluate(() => !!document.getElementById('btnCompas'));
  T('la manche à vérifier offre bien le compas', aCompas);

  /* Report réel : on plante la pointe sur un sommet et on ouvre jusqu’au
     voisin — c’est ce geste qui doit laisser un ARC, pas un tour complet. */
  await page.click('#btnCompas');
  await page.waitForTimeout(120);
  const sommets = await page.evaluate(() => file[pos].pts);
  const s0 = await versCodage(sommets[0]), s1 = await versCodage(sommets[1]);
  await page.mouse.move(s0[0], s0[1]); await page.mouse.down();
  await page.mouse.move(s0[0], s0[1]); await page.mouse.up();
  await page.waitForTimeout(120);
  await page.mouse.move(s0[0], s0[1]); await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(s0[0] + (s1[0]-s0[0])*i/10, s0[1] + (s1[1]-s0[1])*i/10);
  await page.mouse.up();
  await page.waitForTimeout(1400);
  const arc = await page.evaluate(() => {
    const t = [...document.querySelectorAll('#scene path')]
      .filter(e => e.getTotalLength && e.getTotalLength() > 20 && /A /.test(e.getAttribute('d') || ''));
    if (!t.length) return null;
    const e = t[t.length - 1], bb = e.getBBox();
    /* Un tour complet mesure π fois la largeur de sa boîte ; un arc de 64°
       en mesure à peine plus que sa corde. On lit la FORME dessinée, sans
       relire l’option qui l’a produite. */
    return {rapport:e.getTotalLength() / Math.max(bb.width, bb.height), arcs:(e.getAttribute('d').match(/A /g) || []).length};
  });
  T('le compas du plan certifié laisse un ARC, pas un cercle entier',
    arc && arc.rapport < 2, arc ? `rapport ${arc.rapport.toFixed(2)} (un cercle vaut ~3,14)` : 'aucun tracé');

  /* LE BUG : après le compas, les tampons ne posaient plus rien. */
  await page.click('#barreOutils .outil[data-t="droit"]');
  await page.waitForTimeout(80);
  const repris = await page.evaluate(() => ({
    compasRange:!document.getElementById('btnCompas').classList.contains('on') && compasCourant === null,
    tamponAllume:document.querySelector('#barreOutils .outil[data-t="droit"]').classList.contains('on')
  }));
  T('reprendre un tampon range le compas', repris.compasRange === true);
  T('le tampon repris s’allume', repris.tamponAllume === true);
  /* UN VRAI APPUI, pas un `dispatchEvent` : le compas capte le pointeur sur
     tout le plan. Un clic de synthèse posé directement sur la cible passe
     par-dessus cette capture et ne reproduit donc PAS la panne signalée —
     il l’avait laissée passer. */
  const posCible = await page.evaluate(() => {
    const e = document.querySelector('#scene .cible-tactile[data-t^="a"]').getBoundingClientRect();
    return [e.x + e.width/2, e.y + e.height/2];
  });
  await page.mouse.click(posCible[0], posCible[1]);
  await page.waitForTimeout(120);
  const marques = await page.evaluate(() => document.getElementById('marques').childElementCount);
  T('et il pose de nouveau ses marques après usage du compas',
    marques > 0, marques + ' marque(s)');

  /* ---------- B3 : relâcher l’instrument ne vaut jamais réponse ---------- */
  await page.goto(base + '?competence=ce1-alignement');
  await page.waitForTimeout(240);
  const b3 = await page.evaluate(async () => {
    const i = file.findIndex(q => q.placer);
    pos = i; question();
    await new Promise(r => setTimeout(r, 80));
    const q = file[pos], a = q.points[0], b = q.points[2];
    /* On pose la règle exactement sur les deux points, PUIS on relâche. */
    const m = [(a[0]+b[0])/2, (a[1]+b[1])/2];
    posableCourant.placerExact(m[0], m[1], Math.atan2(b[1]-a[1], b[0]-a[0]));
    await new Promise(r => setTimeout(r, 60));
    const apresPose = {verrouille, croix:document.querySelectorAll('#scene .trace-fait').length};
    return {apresPose, pose:q._instrumentPose === true};
  });
  T('B3 — poser la règle sur les deux points l’arme', b3.pose);
  T('B3 — mais relâcher l’instrument ne place aucune pointe',
    b3.apresPose.verrouille === false && b3.apresPose.croix === 0, JSON.stringify(b3.apresPose));

  /* --- Une poignée hors du plan n'existe plus -------------------------
     Le SVG decoupe ce qui depasse de sa viewBox : une poignee sortie du
     cadre est invisible ET intouchable. On ne verifie donc pas ses
     coordonnees, on demande au navigateur QUI recoit l'appui en son centre —
     seule reponse qui prouve qu'un doigt l'atteindrait. */
  {
    const COMP = ['cp-alignement','cp-tracer-droite','ce1-alignement',
                  'ce1-angles','ce2-alignement','ce2-angles'];
    let vues = 0, perdues = 0, ou = [];
    for (const comp of COMP) {
      for (let tour = 0; tour < 3; tour++) {
        await page.goto(base + '?competence=' + comp);
        await page.waitForTimeout(140);
        const n = await page.evaluate(() => file.length);
        for (let i = 0; i < n; i++) {
          await page.evaluate((i) => { pos = i; question(); }, i);
          await page.waitForTimeout(45);
          const ps = await page.evaluate(() => {
            if (typeof posableCourant === 'undefined' || !posableCourant) return [];
            return [...posableCourant.g.querySelectorAll('.poignee')].map(el => {
              const b = el.getBoundingClientRect();
              const t = document.elementFromPoint(b.x + b.width/2, b.y + b.height/2);
              return !!t && /^poignee/.test(t.getAttribute('class') || '');
            });
          });
          ps.forEach(bon => { vues++; if (!bon) { perdues++; if (ou.length < 4) ou.push(comp + ' #' + (i+1)); } });
        }
      }
    }
    T('toute poignée naît réellement saisissable dans le plan',
      vues > 100 && perdues === 0, `${vues} examinées, ${perdues} perdues ${ou.join(', ')}`);
  }

  /* §3 du SPEC-M38, que M35 partage puisqu'il partage l'unite : le module
     n'est PAS a l'echelle reelle, donc aucun texte affiche ne doit promettre
     une grandeur. M38 avait ce test, M35 ne l'avait pas — et le violait, ses
     consignes parlant de « rayon 4 cm ». */
  {
    const brut = require('fs').readFileSync(RACINE + '/jeux/M35-verifier-coder.html', 'utf8');
    const affiche = brut.replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const fautes = (affiche.match(/\d+\s*cm\b/g) || []);
    T('§3 aucune grandeur réelle affirmée dans un texte affiché',
      fautes.length === 0, fautes.slice(0, 4));
    const unite = (require('fs').readFileSync(RACINE + '/outils/moteur-compas.js', 'utf8')
      .match(/const UNITE = (\d+)/) || [])[1];
    T('l’unité vient du moteur, elle n’est pas redéclarée',
      /const PX_PAR_UNITE = MoteurCompas\.UNITE;/.test(brut), 'moteur ' + unite);
  }
  const MODULE = 'M35';
  const DECLARES = await page.evaluate(() => ({dimensions:Object.keys(DIMENSIONS_CONTENU),
    sansContenu:Object.keys(MODES_SANS_CONTENU)}));

  /* ---------- §13 bis : les tirages, mesurés À L’ÉCHELLE DE LA FILE ----------
     Le validateur d’items relit chaque manche PRISE ISOLÉMENT ; une file de
     manches toutes justes peut être répétitive, et c’est exactement pour cela
     qu’il n’a jamais rien vu. Les dimensions contrôlées sont DÉCLARÉES PAR LE
     MODULE : la suite ne tient pas sa propre liste, qui dériverait au premier
     mini-jeu ajouté. */
  await page.goto(base);
  await page.waitForTimeout(250);
  const tirages = await page.evaluate((MODULE) => {
    const N = 200, res = [], modesVus = new Set();
    const files = [];
    Object.values(CONTENU.paliers).forEach(pal => pal.miniJeux.forEach(cfg => {
      files.push({cfg, pal, cle: MODULE === 'M38' ? cfg.id : null});
    }));
    files.forEach(({cfg, pal}) => {
      const engendrer = () => MODULE === 'M38' ? cfg.gen() : engendrerFile(cfg);
      const dims = MODULE === 'M38' ? DIMENSIONS_CONTENU[cfg.id] : null;
      if (MODULE !== 'M38') engendrer().forEach(q => modesVus.add(q.mode));
      const listes = MODULE === 'M38' ? (dims ? [[cfg.id, dims]] : [])
        : Object.entries(DIMENSIONS_CONTENU)
            .filter(([mode]) => engendrer().some(q => q.mode === mode))
            .map(([mode, d]) => [mode, d]);
      if (!listes.length) { res.push({id:cfg.id, aucune:true}); return; }
      listes.forEach(([cle, liste]) => liste.forEach(dim => {
        const valeurs = new Set();
        let suite = 0, longueur = 0, exemple = null;
        for (let n = 0; n < N; n++) {
          const vals = engendrer().filter(q => MODULE === 'M38' || q.mode === cle).map(dim.de);
          if (!vals.length) return;
          longueur = vals.length;
          vals.forEach(v => valeurs.add(v));
          for (let i = 1; i < vals.length; i++)
            if (vals[i] === vals[i-1]) { suite++; if (!exemple) exemple = vals.join(' → '); }
        }
        const S = valeurs.size, plafond = Math.ceil(longueur / Math.max(1, S));
        let avantEpuisement = 0;
        for (let n = 0; n < N; n++) {
          const compte = {};
          engendrer().filter(q => MODULE === 'M38' || q.mode === cle).map(dim.de)
            .forEach(v => { compte[v] = (compte[v]||0)+1; });
          if (Object.values(compte).some(c => c > plafond)) avantEpuisement++;
        }
        res.push({id:cfg.id, nom:dim.nom, ferme:dim.ferme || null,
                  suite, avantEpuisement, stock:S, file:longueur, exemple});
      }));
    });
    return {res, modesVus:[...modesVus]};
  }, MODULE);

  const dims13 = tirages.res.filter(x => !x.aucune);
  T('§13 bis — au moins une dimension de contenu est déclarée et mesurée',
    dims13.length > 0, dims13.length + ' dimensions');
  if (MODULE !== 'M38') {
    const orphelins = tirages.modesVus.filter(m =>
      !DECLARES.dimensions.includes(m) && !DECLARES.sansContenu.includes(m));
    T('§13 bis — chaque mode est examiné : dimension déclarée, ou absence justifiée',
      orphelins.length === 0, orphelins.join(', '));
  }

  const suites13 = dims13.filter(x => x.suite > 0);
  T('§13 bis — aucun contenu ne paraît deux manches de suite, nulle part',
    suites13.length === 0,
    suites13.map(x => `${x.id}/${x.nom} : ${x.suite} fois (${String(x.exemple).slice(0, 70)})`).slice(0, 3).join(' | '));

  const cycles13 = dims13.filter(x => !x.ferme && x.avantEpuisement > 0);
  T('§13 bis — hors stock fermé, aucun contenu ne revient avant épuisement',
    cycles13.length === 0,
    cycles13.map(x => `${x.id}/${x.nom} : ${x.avantEpuisement}/200`).slice(0, 3).join(' | '));

  const etroits13 = dims13.filter(x => !x.ferme && x.stock <= x.file);
  T('§13 bis — hors stock fermé, le stock est plus grand que la file',
    etroits13.length === 0,
    etroits13.map(x => `${x.id}/${x.nom} : stock ${x.stock} pour ${x.file} manches`).join(' | '));

  const fermes13 = dims13.filter(x => x.ferme);
  T('§13 bis — chaque stock fermé est justifié en toutes lettres',
    fermes13.every(x => x.ferme.length > 30),
    fermes13.filter(x => x.ferme.length <= 30).map(x => x.id + '/' + x.nom).join(', '));
  const parDim = {};
  fermes13.forEach(x => { (parDim[x.nom] = parDim[x.nom] || []).push(x); });
  const gratuites13 = Object.entries(parDim)
    .filter(([, l]) => l.every(x => x.stock > x.file && x.avantEpuisement === 0));
  T('§13 bis — aucune dispense de stock fermé n’est gratuite',
    gratuites13.length === 0,
    gratuites13.map(([nom, l]) => `${nom} (${l.map(x => x.id).join(', ')})`).join(' | '));

  const jointure13 = await page.evaluate(() => {
    const mesure = (stock, n) => {
      let suite = 0, prec = null, total = 0;
      for (let k = 0; k < 3000; k++)
        tirerSansRepetition('jointure-' + stock.length + '-' + n, stock, n)
          .forEach(v => { if (prec === v) suite++; prec = v; total++; });
      return {suite, total};
    };
    /* On suit `prec` D’UN APPEL À L’AUTRE : la jointure est ENTRE deux
       cycles, pas à l’intérieur d’un appel. */
    return {court:mesure(['a','b'], 1), moyen:mesure(['a','b','c','d','e','f'], 5),
            long:mesure(['a','b','c'], 7)};
  });
  ['court','moyen','long'].forEach(cas => {
    T(`§13 bis — le tirage ne répète pas à la jointure de deux cycles (${cas})`,
      jointure13[cas].suite === 0, `${jointure13[cas].suite} sur ${jointure13[cas].total}`);
  });



  console.log('\nErreurs JS/console/réseau :', erreurs.length ? erreurs : 'aucune');
  if (erreurs.length) ko += erreurs.length;
  console.log(`\n${ok} OK, ${ko} KO`);
  console.log('EXIT:' + (ko === 0 ? 'SUCCES' : 'ECHEC'));
  await navigateur.close(); srv.close();
})().catch(e => { console.log('CRASH', e); console.log('EXIT:ECHEC'); process.exit(1); });
