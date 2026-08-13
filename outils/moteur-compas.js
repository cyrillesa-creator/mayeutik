/* ============================================================================
   MOTEUR DE COMPAS — source unique, partagée par M35 et M38
   ----------------------------------------------------------------------------
   Ce fichier est la SOURCE. Il n’est jamais chargé par un jeu : la charte
   impose des fichiers autonomes (§19, « une feuille de style partagée les
   rendrait dépendants d’un fichier tiers »). `outils/sync-compas.js` recopie
   ce bloc entre les sentinelles de chaque jeu et ÉCHOUE si une copie a dérivé.
   Les jeux restent donc autonomes, mais « toute retouche ici est à reporter
   là-bas » cesse d’être une promesse tenue de mémoire.

   Tout tient sous UN SEUL nom global, `MoteurCompas`, et le moteur pose sa
   propre feuille de style : une copie ne peut ainsi entrer en collision avec
   rien dans le fichier hôte.

   LE GESTE, validé sur appareil : un seul doigt.
     pointerdown  plante la pointe ;
     pointermove  ouvre et referme le compas, un rayon en pointillé suit ;
     pointerup    lance le tracé, la mine parcourt le cercle en ~1,15 s.
   Jamais de pincement à deux doigts : indécouvrable pour un enfant, et
   incompatible avec le défilement de la page.

   LA GÉOMÉTRIE est celle d’un vrai compas : branches de LONGUEUR FIXE, seul
   l’angle d’ouverture varie. La charnière est au sommet du triangle isocèle
   de côtés `branche` et de base `r` ; sa hauteur vaut √(branche² − (r/2)²).
   Deux conséquences qu’on ne peut pas contourner, et qu’on assume donc :

     • le rayon est PLAFONNÉ à 2 × branche. Au-delà, le compas est grand
       ouvert et le dit. Sans ce plafond, la racine devient négative, la
       hauteur NaN, et le compas disparaît de l’écran.

     • à la verticale, les deux normales possibles ont exactement la même
       hauteur : « charnière vers le haut » ne départage plus rien, et le
       moindre tremblement du doigt fait basculer la charnière d’un côté à
       l’autre — c’est ce qui rendait le glissement vers le bas inutilisable.
       Une hystérésis ne suffit pas : en début de geste, deux pixels de
       tremblement font tourner la direction de vingt degrés. Le côté est
       donc CHOISI UNE FOIS, dès que l’ouverture est franche, et conservé
       pour tout le geste. Le compas tourne alors d’un bloc avec la main,
       exactement comme un vrai qu’on fait pivoter autour de sa pointe.
   ============================================================================ */
const MoteurCompas = (function(){
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  /* L’UNITÉ VIRTUELLE, définie ici et nulle part ailleurs pour M35 et M38.
     Un rayon de 4 et un côté de 7 ont ainsi la même taille apparente d’un
     module à l’autre par construction, et non par vigilance. Elle n’affirme
     aucune grandeur réelle : voir SPEC-M38 §3. */
  const UNITE = 25;
  /* LES BRANCHES SONT PROPORTIONNÉES AUX OUVERTURES RÉELLEMENT DEMANDÉES.
     À neuf unités, elles restaient presque fermées pour un rayon de 2 à 4 :
     la charnière montait alors très haut — la hauteur du triangle isocèle
     vaut √(branche² − (r/2)²), donc elle croît quand l’ouverture diminue —
     et l’instrument débordait du plan par le haut, précisément le risque
     signalé au prototype. Cinq unités donnent un compas franchement ouvert
     sur toute la plage utile, sans jamais approcher son plafond. */
  const BRANCHE = 5 * UNITE;          // longueur fixe des branches
  const R_MAX = 2 * BRANCHE;          // ouverture maximale d’un compas réel
  const R_MIN = 8;
  const DUREE_TRACE = 1150;           // ms
  const AIMANT_POINTE = 12;           // px : accrochage de la pointe
  const AIMANT_RAYON = 6;             // px : accrochage du rayon à l’unité
  /* En deçà de cette ouverture, le compas n’est pas dessiné et son côté n’est
     pas fixé : quand la mine est à quelques pixels de la pointe, incliner le
     doigt de deux pixels fait tourner la direction de vingt degrés, et une
     charnière située à 126 px balaye alors tout l’écran. Un compas fermé n’a
     de toute façon pas d’orientation. On ne montre donc que la pointe plantée
     et le rayon qui s’étire. */
  const OUVERTURE_FRANCHE = 20;
  const R_LOUPE = 42;                 // rayon de la loupe, en unités de viewBox
  const GROSSISSEMENT = 2;
  /* Décalage par défaut. Il doit être PLUS GRAND quand l’objet observé porte
     des inscriptions à lire : sur une règle graduée, une loupe trop proche
     recouvre les chiffres qu’elle est censée dégager — d’où `spec.ecartLoupe`. */
  const ECART_LOUPE = 62;
  let compteurMonde = 0;              // les identifiants doivent rester uniques

  const hyp = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bride = (v, a, b) => Math.max(a, Math.min(b, v));
  function reduitMouvement(){
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  /* Le style du compas voyage avec le moteur : une copie n’a rien à ajouter
     dans la feuille de style de son hôte. */
  const CSS = `
.compas{pointer-events:none;}
.compas .branche{stroke:#33404F; stroke-width:5; stroke-linecap:round; vector-effect:non-scaling-stroke;}
.compas .charniere{fill:#33404F; stroke:#fff; stroke-width:2; vector-effect:non-scaling-stroke;}
.compas .pointe-fermee{fill:#33404F; stroke:#fff; stroke-width:2; vector-effect:non-scaling-stroke;}
.compas .pointe{fill:none; stroke:#33404F; stroke-width:3; stroke-linejoin:round; vector-effect:non-scaling-stroke;}
.compas .mine{fill:#FF8A3D; stroke:#33404F; stroke-width:2; vector-effect:non-scaling-stroke;}
.compas.verrouille .branche{stroke:#7C8B9C;}
.compas.verrouille .charniere{fill:#7C8B9C;}
.compas-rayon{fill:none; stroke:#FF8A3D; stroke-width:2.4; stroke-dasharray:6 5; stroke-linecap:round; vector-effect:non-scaling-stroke;}
.compas-cercle{fill:none; stroke:#0B8A70; stroke-width:3.2; stroke-linecap:round; vector-effect:non-scaling-stroke;}
.compas-cercle.attendu{stroke-dasharray:8 6;}
/* Le cercle que l’enfant a tracé, quand il ne convient pas. Le rouge marque
   SA production, jamais la bonne réponse — laquelle reste en vert (§18). */
.compas-cercle.faux{stroke:#FF5D5D;}
.compas-etiquette{font-size:14px; font-weight:700; fill:#1D3354; paint-order:stroke; stroke:#fff; stroke-width:4;}
.compas-etiquette.grise{fill:#7C8B9C;}
.compas-invite{font-size:13px; fill:#41577A; opacity:.85;}
.compas-zone{touch-action:none;}
/* LA LOUPE. Au moment précis où l’enfant plante la pointe, son doigt couvre
   l’endroit qu’il vise : il pose à l’aveugle. La loupe montre, décalée
   au-dessus du doigt, ce qui se trouve dessous — agrandi deux fois, avec une
   croix sur le point exact où la pointe tombera. Elle ne capte aucun
   évènement : c’est une fenêtre, pas un objet. */
.compas-loupe{pointer-events:none;}
.compas-loupe .verre-loupe{fill:#fff;}
.compas-loupe .cercle-loupe{fill:none; stroke:#33404F; stroke-width:2.5; vector-effect:non-scaling-stroke;}
/* La croix est DOUBLÉE d’un halo blanc : en orange seul elle disparaissait
   sur le point orange qu’elle est censée désigner. Même correction que le
   marqueur d’angle de M34 — une marque doit se lire sur ce qu’elle marque. */
.compas-loupe .croix-halo{stroke:#fff; stroke-width:5; stroke-linecap:round; vector-effect:non-scaling-stroke;}
.compas-loupe .croix-loupe{stroke:#12233C; stroke-width:2; stroke-linecap:round; vector-effect:non-scaling-stroke;}
@media (prefers-reduced-motion:reduce){ .compas, .compas-cercle{transition:none !important;} }
`;
  function poserStyle(){
    if (document.getElementById('style-moteur-compas')) return;
    const s = document.createElement('style');
    s.id = 'style-moteur-compas';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------
     creerCompas(svg, spec)
       spec.zone         {x0,y0,x1,y1} où la pointe peut se planter
       spec.branche      longueur des branches (défaut : BRANCHE)
       spec.aimants      [[x,y]…] points d’accrochage de la POINTE
       spec.aimantsMine  [[x,y]…] points d’accrochage de la MINE
       spec.guide        {c, r} : la pointe se pose SUR ce cercle
       spec.rayonMax     plafond d’ouverture propre au mini-jeu
       spec.pointeLibre  false → la pointe REFUSE de se planter ailleurs
       spec.rayonAimante true → le rayon s’accroche à l’unité entière (fenêtre)
       spec.rayonCrante  true → le rayon EST toujours un nombre entier d’unités
       spec.ecartLoupe   de combien la loupe se décale du doigt (défaut : 62)
       spec.arc          angle (rad) : trace un ARC et non un tour complet
       spec.loupe        false → pas de loupe sous le doigt (défaut : true)
       spec.surPointe    ()            pointe plantée
       spec.surApercu    ({centre,r})  pendant le glissement
       spec.surTrace     ({centre,r})  après l’animation
       spec.surReglage   ({r})         RÈGLE l’écartement au lieu de tracer
     `surReglage` renverse l’ordre du geste, et c’est toute la différence du
     CE2 : tant que l’écartement n’est pas verrouillé, relâcher le RÈGLE et le
     fige ; une fois réglé, relâcher TRACE. Au CE1 le rayon est dérivé d’un
     point de passage, au CE2 il est mesuré d’abord — voir SPEC-M35 §2.
     Le moteur ne juge JAMAIS : il trace et rend compte. C’est le mini-jeu
     qui décide si le cercle est juste, comme `creerPosable` ne décide pas
     d’un alignement.
     ------------------------------------------------------------------ */
  function creerCompas(svg, spec){
    poserStyle();
    const o = Object.assign({
      branche: BRANCHE, aimants: [], aimantsMine: [], guide: null, rayonMax: 0,
      pointeLibre: true,
      rayonAimante: false, rayonCrante: false, zone: null, etiquette: true,
      loupe: true, ecartLoupe: ECART_LOUPE
    }, spec || {});

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'compas');
    const gTrace = document.createElementNS(NS, 'g');   // les cercles déjà tracés
    let derniereTrace = null;
    const gApercu = document.createElementNS(NS, 'g');  // rayon pointillé, étiquette

    /* LE MONDE, pour que la loupe ait quelque chose à agrandir. Elle montre un
       `<use>` de ce groupe : la figure de la manche ET les cercles déjà
       tracés, mais NI le compas NI la loupe elle-même — l’instrument dans sa
       propre loupe encombrerait la vue qu’on cherche justement à dégager, et
       une loupe qui se contient elle-même boucle. Les enfants existants du
       SVG y sont déplacés au montage et remis en place à la destruction : le
       jeu hôte retrouve son DOM exactement tel qu’il l’avait laissé. */
    const gMonde = document.createElementNS(NS, 'g');
    gMonde.setAttribute('class', 'compas-monde');
    const idMonde = 'compas-monde-' + (++compteurMonde);
    gMonde.id = idMonde;
    const enfantsHote = [];
    while (svg.firstChild) { enfantsHote.push(svg.firstChild); gMonde.appendChild(svg.firstChild); }
    svg.appendChild(gMonde);
    gMonde.appendChild(gTrace);
    svg.appendChild(gApercu); svg.appendChild(g);

    /* La loupe est TOUJOURS montée ; `loupe` n’autorise que son apparition, et
       peut donc changer en cours de manche. Elle aide quand le doigt cache la
       cible, elle NUIT quand il faut lire des chiffres : sur une règle
       graduée, elle recouvrirait précisément les graduations qu’on vise. */
    const gLoupe = document.createElementNS(NS, 'g');
    gLoupe.setAttribute('class', 'compas-loupe');
    gLoupe.setAttribute('display', 'none');
    {
      const idClip = 'clip-loupe-' + compteurMonde;
      gLoupe.innerHTML =
          `<defs><clipPath id="${idClip}"><circle cx="0" cy="0" r="${R_LOUPE}"/></clipPath></defs>`
        + `<circle class="verre-loupe" cx="0" cy="0" r="${R_LOUPE}"/>`
        + `<g clip-path="url(#${idClip})"><use href="#${idMonde}"/></g>`
        + `<line class="croix-halo" x1="-10" y1="0" x2="10" y2="0"/>`
        + `<line class="croix-halo" x1="0" y1="-10" x2="0" y2="10"/>`
        + `<line class="croix-loupe" x1="-10" y1="0" x2="10" y2="0"/>`
        + `<line class="croix-loupe" x1="0" y1="-10" x2="0" y2="10"/>`
        + `<circle class="cercle-loupe" cx="0" cy="0" r="${R_LOUPE}"/>`;
      svg.appendChild(gLoupe);
    }
    svg.classList.add('compas-zone');

    /* LA CONVERSION ÉCRAN → SVG, UNE FOIS PAR GESTE. `getScreenCTM()` lit la
       géométrie de la page, que le dessin précédent vient d’invalider : appelée
       à chaque `pointermove`, elle imposait un recalcul de mise en page forcé
       par mouvement, écriture / lecture / écriture — le motif qui fait traîner
       un glissement. La matrice ne peut pas bouger pendant le geste : le doigt
       est capturé et la zone est en `touch-action:none`, donc rien ne défile ni
       ne se redimensionne. On la lit donc au `pointerdown` et on garde son
       inverse. */
    const ptSVG = svg.createSVGPoint();
    let inv = null;
    function relireRepere(){ const m = svg.getScreenCTM(); inv = m ? m.inverse() : null; }
    function versSVG(clientX, clientY){
      if (!inv) relireRepere();
      if (!inv) return [clientX, clientY];
      ptSVG.x = clientX; ptSVG.y = clientY;
      const q = ptSVG.matrixTransform(inv);
      return [q.x, q.y];
    }

    let centre = null, r = 0, angleMine = 0;
    let verrouille = false, phase = 'repos', cote = null, anim = null, detruit = false;
    /* `bloque` gèle le geste sans effacer le dessin : après validation, un
       cercle validé est validé (CHARTE §18, pas d’essai-erreur sur place). */
    let bloque = false;

    /* Le plafond peut être RESSERRÉ par le mini-jeu : une construction dont
       la figure entière dépend du premier rayon doit pouvoir le borner, plutôt
       que de recadrer après coup ce que l’enfant a tracé. */
    const rMax = () => Math.min(R_MAX, 2 * o.branche, o.rayonMax || Infinity);
    const etat = () => ({centre: centre ? centre.slice() : null, r, verrouille, phase});

    /* --- Le côté de la charnière : choisi une fois, gardé (cf. en-tête) --- */
    function normales(u){ return [[-u[1], u[0]], [u[1], -u[0]]]; }
    function choisirCote(u, d){
      if (cote !== null) return;              // déjà fixé pour ce geste
      if (d < OUVERTURE_FRANCHE) return;      // direction encore trop instable
      const n = normales(u);
      cote = n[0][1] <= n[1][1] ? 0 : 1;      // celle qui pointe le plus haut
    }
    function charniere(c, m){
      const d = hyp(c, m) || 1e-6;
      const u = [(m[0] - c[0]) / d, (m[1] - c[1]) / d];
      choisirCote(u, d);
      if (cote === null) cote = normales(u)[0][1] <= normales(u)[1][1] ? 0 : 1;
      const n = normales(u)[cote];
      /* On borne AVANT la racine : au-delà de 2·branche elle serait négative
         et la charnière deviendrait NaN — le compas s’évanouissait. */
      const demi = Math.min(d, rMax()) / 2;
      const h = Math.sqrt(Math.max(0, o.branche * o.branche - demi * demi));
      return [(c[0] + m[0]) / 2 + n[0] * h, (c[1] + m[1]) / 2 + n[1] * h];
    }
    const positionMine = () => centre
      ? [centre[0] + Math.cos(angleMine) * r, centre[1] + Math.sin(angleMine) * r] : null;

    /* --- Les nœuds du compas, créés UNE SEULE FOIS ------------------------
       Réécrire `innerHTML` à chaque `pointermove` faisait analyser cinq
       fragments de SVG et reconstruire cinq nœuds par mouvement, là où seules
       six coordonnées changent. Les éléments sont donc permanents et le dessin
       ne fait plus que poser des attributs ; ce qui n’a pas lieu d’être visible
       est masqué, jamais détruit. */
    function creer(tag, classe, parent){
      const e = document.createElementNS(NS, tag);
      e.setAttribute('class', classe);
      parent.appendChild(e);
      return e;
    }
    const elFermee   = creer('circle', 'pointe-fermee', g);
    const elBrancheP = creer('path', 'branche', g);
    const elBrancheM = creer('path', 'branche', g);
    const elPointe   = creer('path', 'pointe', g);
    const elCharn    = creer('circle', 'charniere', g);
    const elMine     = creer('circle', 'mine', g);
    const OUVERT     = [elBrancheP, elBrancheM, elPointe, elCharn, elMine];
    const elRayon    = creer('path', 'compas-rayon', gApercu);
    const elEtiq     = creer('text', 'compas-etiquette', gApercu);
    elFermee.setAttribute('r', 5);
    elCharn.setAttribute('r', 7);
    elMine.setAttribute('r', 5);
    /* `display:none` sort l’élément du rendu, contrairement à `visibility` :
       un compas fermé ne coûte alors rien du tout. */
    const montrer = (e, oui) => e.setAttribute('display', oui ? 'inline' : 'none');
    const pose = (e, k, v) => e.setAttribute(k, v.toFixed(1));

    /* --- Dessin, entièrement déduit de l’état --- */
    function dessiner(){
      if (detruit) return;
      if (!centre) {
        montrer(elFermee, false); OUVERT.forEach(e => montrer(e, false));
        return;
      }
      if (r < OUVERTURE_FRANCHE) {
        /* Pointe plantée, compas encore fermé : on ne montre que la pointe. */
        g.style.opacity = '1';
        pose(elFermee, 'cx', centre[0]); pose(elFermee, 'cy', centre[1]);
        montrer(elFermee, true); OUVERT.forEach(e => montrer(e, false));
        return;
      }
      /* L’instrument se révèle en fondu sur les vingt-cinq pixels suivants :
         apparaître d’un coup avec une charnière à 126 px ferait un saut. */
      g.style.opacity = String(Math.min(1, (r - OUVERTURE_FRANCHE) / 25));
      montrer(elFermee, false); OUVERT.forEach(e => montrer(e, true));
      const m = positionMine();
      const ch = charniere(centre, m);
      const seg = (a, b) => `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} L ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
      /* La pointe sèche : un petit V. La mine : une pastille. */
      const dirP = [(centre[0] - ch[0]), (centre[1] - ch[1])];
      const lp = Math.hypot(dirP[0], dirP[1]) || 1;
      const perp = [-dirP[1] / lp, dirP[0] / lp];
      const base = [centre[0] - dirP[0] / lp * 11, centre[1] - dirP[1] / lp * 11];
      elBrancheP.setAttribute('d', seg(ch, centre));
      elBrancheM.setAttribute('d', seg(ch, m));
      elPointe.setAttribute('d',
          `M ${(base[0] + perp[0] * 5).toFixed(1)} ${(base[1] + perp[1] * 5).toFixed(1)}`
        + ` L ${centre[0].toFixed(1)} ${centre[1].toFixed(1)}`
        + ` L ${(base[0] - perp[0] * 5).toFixed(1)} ${(base[1] - perp[1] * 5).toFixed(1)}`);
      pose(elCharn, 'cx', ch[0]); pose(elCharn, 'cy', ch[1]);
      pose(elMine, 'cx', m[0]);   pose(elMine, 'cy', m[1]);
      g.classList.toggle('verrouille', verrouille);
    }
    function dessinerApercu(){
      if (detruit) return;
      if (!centre) { montrer(elRayon, false); montrer(elEtiq, false); return; }
      const m = positionMine();
      elRayon.setAttribute('d',
        `M ${centre[0].toFixed(1)} ${centre[1].toFixed(1)} L ${m[0].toFixed(1)} ${m[1].toFixed(1)}`);
      montrer(elRayon, true);
      if (!o.etiquette) { montrer(elEtiq, false); return; }
      const t = (r / UNITE);
      elEtiq.textContent = (Math.abs(t - Math.round(t)) < 0.02 ? String(Math.round(t)) : t.toFixed(1))
        + (r >= rMax() - 0.5 ? ' — grand ouvert' : '');
      elEtiq.setAttribute('class', 'compas-etiquette' + (verrouille ? ' grise' : ''));
      pose(elEtiq, 'x', centre[0] + 12); pose(elEtiq, 'y', centre[1] - 12);
      montrer(elEtiq, true);
    }

    /* La loupe se place AU-DESSUS du doigt, et passe dessous quand le doigt
       approche du haut du plan : une loupe à moitié hors du cadre ne montre
       plus rien. Le décalage la sort de sous la main sans l’éloigner du
       geste. Le contenu est recentré sur le point observé puis agrandi. */
    function majLoupe(p){
      if (!o.loupe || !p) return;
      const vb = svg.viewBox && svg.viewBox.baseVal;
      const haut = vb && vb.height ? vb.y : 0;
      const bas = vb && vb.height ? vb.y + vb.height : 400;
      const gauche = vb && vb.width ? vb.x : 0;
      const droite = vb && vb.width ? vb.x + vb.width : 400;
      const marge = R_LOUPE + 4;
      const ecart = o.ecartLoupe;
      const dessus = p[1] - ecart >= haut + marge;
      const ly = bride(dessus ? p[1] - ecart : p[1] + ecart, haut + marge, bas - marge);
      const lx = bride(p[0], gauche + marge, droite - marge);
      gLoupe.setAttribute('transform', `translate(${lx.toFixed(1)},${ly.toFixed(1)})`);
      const u = gLoupe.querySelector('use');
      if (u) u.setAttribute('transform',
        `scale(${GROSSISSEMENT}) translate(${(-p[0]).toFixed(2)},${(-p[1]).toFixed(2)})`);
      gLoupe.setAttribute('display', 'inline');
    }
    const cacherLoupe = () => { if (o.loupe) gLoupe.setAttribute('display', 'none'); };

    /* UN DESSIN PAR IMAGE, PAS UN PAR ÉVÉNEMENT. Un écran tactile envoie
       jusqu’à 120 `pointermove` par seconde là où l’écran n’en affiche que 60 :
       dessiner à chaque événement, c’est jeter la moitié du travail et prendre
       du retard sur le doigt. L’ÉTAT reste mis à jour immédiatement — `etat()`
       ne ment jamais — seul le rendu est reporté à la prochaine image. */
    let demande = 0;
    function planifier(){
      if (demande || detruit) return;
      demande = requestAnimationFrame(() => { demande = 0; dessiner(); dessinerApercu(); });
    }
    function rafraichir(){
      if (demande) { cancelAnimationFrame(demande); demande = 0; }
      dessiner(); dessinerApercu();
    }
    /* Les nœuds naissent sans coordonnées : sans ce premier passage, la pointe
       fermée s’afficherait à l’origine du plan avant le moindre geste. */
    rafraichir();

    /* --- Le tracé : la mine parcourt le cercle, le compas tourne avec --- */
    function tracer(fini){
      phase = 'trace';
      const depart = angleMine;
      const cercle = document.createElementNS(NS, 'path');
      cercle.setAttribute('class', 'compas-cercle');
      gTrace.appendChild(cercle);
      derniereTrace = cercle;
      /* UN ARC OU UN TOUR COMPLET. Reporter une longueur, on ne fait pas le
         tour : on donne un coup d’arc là où la comparaison se lit. Deux
         cercles entiers superposés encombrent le plan et noient précisément
         ce qu’on demande de regarder. L’arc est CENTRÉ sur la direction où la
         mine se trouvait au relâchement — c’est le prolongement du geste, pas
         un secteur arbitraire. */
      const etendue = o.arc || Math.PI * 2;
      const a0 = o.arc ? depart - o.arc / 2 : depart;
      const arc = (t) => {
        if (!o.arc && t >= 0.9995) return `M ${(centre[0] + r).toFixed(2)} ${centre[1].toFixed(2)}`
          + ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(centre[0] - r).toFixed(2)} ${centre[1].toFixed(2)}`
          + ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(centre[0] + r).toFixed(2)} ${centre[1].toFixed(2)}`;
        const a1 = a0 + t * etendue;
        return `M ${(centre[0] + Math.cos(a0) * r).toFixed(2)} ${(centre[1] + Math.sin(a0) * r).toFixed(2)}`
          + ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${t * etendue > Math.PI ? 1 : 0} 1`
          + ` ${(centre[0] + Math.cos(a1) * r).toFixed(2)} ${(centre[1] + Math.sin(a1) * r).toFixed(2)}`;
      };
      const achever = () => {
        cercle.setAttribute('d', arc(1));
        angleMine = depart;
        phase = 'pose';
        rafraichir();
        if (o.surTrace) o.surTrace({centre: centre.slice(), r});
      };
      /* §19 accessibilité : sans animation, le cercle apparaît d’un trait. */
      if (reduitMouvement()) { achever(); return; }
      const t0 = performance.now();
      /* L’ADOUCISSEMENT DU PROTOTYPE. La mine part doucement, prend de la
         vitesse, puis ralentit en arrivant — un tracé à vitesse constante
         démarre et s’arrête sec, ce qui se remarque sur un geste d’une
         seconde. C’est l’animation qui a été jugée sur appareil ; le moteur
         la reprend telle quelle plutôt qu’une approximation linéaire. */
      const adoucir = (k) => k < .5 ? 2*k*k : -1 + (4 - 2*k)*k;
      const pas = (maintenant) => {
        if (detruit || !cercle.isConnected) return;
        const t = adoucir(bride((maintenant - t0) / DUREE_TRACE, 0, 1));
        cercle.setAttribute('d', arc(t));
        angleMine = a0 + t * etendue;
        dessiner();
        /* On teste le temps ÉCOULÉ, pas la valeur adoucie : `adoucir(1)` vaut
           bien 1, mais s’arrêter sur la courbe plutôt que sur l’horloge
           inviterait une erreur d’arrondi à retenir l’animation. */
        if (maintenant - t0 < DUREE_TRACE) anim = requestAnimationFrame(pas);
        else { anim = null; achever(); }
      };
      anim = requestAnimationFrame(pas);
    }

    /* --- Le geste --- */
    function dansZone(p){
      if (!o.zone) return true;
      return p[0] >= o.zone.x0 && p[0] <= o.zone.x1 && p[1] >= o.zone.y0 && p[1] <= o.zone.y1;
    }
    function accrocherPointe(p){
      let meilleur = null, d0 = AIMANT_POINTE;
      o.aimants.forEach(a => { const d = hyp(p, a); if (d < d0) { d0 = d; meilleur = a; } });
      if (meilleur) return meilleur.slice();
      /* LA POINTE PEUT SE POSER SUR UN CERCLE, et pas seulement sur des points
         énumérés. C’est ce qu’exige une construction au compas : le centre du
         cercle suivant est « un point quelconque du précédent », et il y en a
         une infinité. On projette donc le doigt sur le guide. Les points
         énumérés restent PRIORITAIRES — ce sont les intersections déjà
         construites, et retomber exactement dessus est ce qui fait tenir la
         figure. */
      if (o.guide) {
        const d = hyp(p, o.guide.c) || 1e-6;
        return [o.guide.c[0] + (p[0] - o.guide.c[0]) / d * o.guide.r,
                o.guide.c[1] + (p[1] - o.guide.c[1]) / d * o.guide.r];
      }
      return o.pointeLibre ? p : null;
    }
    let actif = false;
    const surDown = (ev) => {
      if (detruit || bloque || phase === 'trace') return;
      /* Une seule lecture de la matrice écran → SVG par geste : la page a pu
         défiler ou tourner depuis le geste précédent, elle ne bougera plus
         pendant celui-ci. */
      relireRepere();
      const p = versSVG(ev.clientX, ev.clientY);
      if (!dansZone(p)) return;
      const c = accrocherPointe(p);
      if (!c) return;                                   // pointe refusée hors aimants
      centre = c;
      if (!verrouille) { r = 0; cote = null; }
      phase = 'ouverture';
      actif = true;
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
      rafraichir();
      /* Au `pointerdown`, ce que le doigt cache est justement la pointe. */
      majLoupe(centre);
      if (o.surPointe) o.surPointe(etat());
      ev.preventDefault();
    };
    const surMove = (ev) => {
      if (!actif || detruit) return;
      const p = versSVG(ev.clientX, ev.clientY);
      angleMine = Math.atan2(p[1] - centre[1], p[0] - centre[0]);
      if (!verrouille) {
        let d = bride(hyp(centre, p), 0, rMax());
        /* ACCROCHAGE DE LA MINE. Reporter une longueur, c’est poser la pointe
           sur un bout et la mine sur l’autre : si la mine arrive près d’un
           point déclaré, l’écartement devient EXACTEMENT la distance à ce
           point. Sans cela, un enfant qui ouvre à quelques pixels près
           reporte une longueur fausse, et la comparaison qu’on lui demande
           ensuite ne veut plus rien dire — sur deux segments qui diffèrent de
           moins de 15 %, l’imprécision du geste dépasse l’écart à juger.
           C’est la POSITION de la mine qu’on teste, pas seulement le rayon :
           un point situé à la bonne distance mais dans une autre direction
           n’a aucune raison d’accrocher. */
        if (o.aimantsMine.length) {
          const m = [centre[0] + (p[0]-centre[0]) / (hyp(centre, p) || 1) * d,
                     centre[1] + (p[1]-centre[1]) / (hyp(centre, p) || 1) * d];
          let meilleur = null, d0 = AIMANT_POINTE;
          o.aimantsMine.forEach(a => { const e = hyp(m, a); if (e < d0) { d0 = e; meilleur = a; } });
          if (meilleur) d = bride(hyp(centre, meilleur), 0, rMax());
        }
        /* DEUX FORCES D’ACCROCHAGE, et la faible ne suffisait pas.
           `rayonAimante` n’attire que dans une fenêtre de 6 px autour de
           chaque unité : à 25 px l’unité, moins de la moitié des positions
           accrochent, et entre deux fenêtres l’enfant lit « 2,4 » sans
           pouvoir atteindre 2. C’est invivable sur les PETITES longueurs, où
           la course entière tient dans la largeur d’un doigt.
           `rayonCrante` supprime la fenêtre : l’écartement vaut TOUJOURS un
           nombre entier d’unités, et le compas passe de cran en cran comme
           une molette. Régler à 2 devient alors aussi facile qu’à 5, et la
           tâche reste entière — il faut toujours LIRE la graduation visée. */
        if (o.rayonCrante) {
          d = Math.max(UNITE, Math.round(d / UNITE) * UNITE);
        } else if (o.rayonAimante) {
          const u = Math.round(d / UNITE) * UNITE;
          if (Math.abs(d - u) <= AIMANT_RAYON && u >= UNITE) d = u;
        }
        r = d;
      }
      planifier();
      /* Pendant le glissement, le doigt est sur la MINE : c’est elle qu’il
         cache, et donc elle que la loupe doit montrer. */
      majLoupe(positionMine() || centre);
      if (o.surApercu) o.surApercu(etat());
      ev.preventDefault();
    };
    const surUp = (ev) => {
      if (!actif || detruit) return;
      actif = false;
      cacherLoupe();
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (r < R_MIN) { phase = 'repos'; centre = null; rafraichir(); return; }
      rafraichir();                       // le dessin rattrape le dernier mouvement
      /* Réglage de l’écartement : on ne trace pas, on FIGE l’ouverture. La
         pointe se relève, le compas garde sa mesure — c’est le geste qu’on
         fait sur une règle graduée avant de porter le compas sur la feuille. */
      if (o.surReglage && !verrouille) {
        verrouille = true; phase = 'pose'; centre = null;
        rafraichir();
        o.surReglage({r});
        return;
      }
      tracer();
    };
    svg.addEventListener('pointerdown', surDown);
    svg.addEventListener('pointermove', surMove);
    svg.addEventListener('pointerup', surUp);
    svg.addEventListener('pointercancel', surUp);

    return {
      g, etat,
      /* L’écartement verrouillé : le glissement ne repose plus que la pointe.
         C’est le geste réel — on ouvre une fois, on plante autant de fois
         qu’il faut — et c’est ce qui rend la rosace possible. */
      verrouiller(){ verrouille = true; rafraichir(); },
      deverrouiller(){ verrouille = false; rafraichir(); },
      /* Le même compas change de terrain sans changer d’identité : il quitte
         la règle graduée pour la feuille, et son écartement le suit. */
      configurer(c){
        if ('zone' in c) o.zone = c.zone;
        if ('aimants' in c) o.aimants = c.aimants;
        if ('aimantsMine' in c) o.aimantsMine = c.aimantsMine;
          if ('pointeLibre' in c) o.pointeLibre = c.pointeLibre;
        if ('loupe' in c) { o.loupe = c.loupe; if (!c.loupe) cacherLoupe(); }
        if ('ecartLoupe' in c) o.ecartLoupe = c.ecartLoupe;
        if ('rayonCrante' in c) o.rayonCrante = c.rayonCrante;
        if ('guide' in c) o.guide = c.guide;
        if ('rayonMax' in c) o.rayonMax = c.rayonMax;
      },
      estVerrouille(){ return verrouille; },
      grandOuvert(){ return r >= rMax() - 0.5; },
      /* Pose programmatique : sert à la révélation différée du §18. */
      placer(c, rayon, trace){
        centre = c.slice(); r = bride(rayon, 0, rMax()); cote = null; angleMine = 0;
        rafraichir();
        if (trace) tracer();
      },
      effacerTraces(){ gTrace.innerHTML = ''; derniereTrace = null; },
      /* Marque le cercle que l’enfant vient de tracer comme non conforme. */
      marquerFaux(){ if (derniereTrace) derniereTrace.classList.add('faux'); },
      /* Trace un cercle de correction, en vert, sans toucher au compas. */
      montrerAttendu(c, rayon){
        const e = document.createElementNS(NS, 'circle');
        e.setAttribute('class', 'compas-cercle attendu');
        e.setAttribute('cx', c[0]); e.setAttribute('cy', c[1]); e.setAttribute('r', rayon);
        gTrace.appendChild(e);
      },
      figer(){ bloque = true; actif = false; },
      detruire(){
        detruit = true;
        if (anim) cancelAnimationFrame(anim);
        if (demande) { cancelAnimationFrame(demande); demande = 0; }
        svg.removeEventListener('pointerdown', surDown);
        svg.removeEventListener('pointermove', surMove);
        svg.removeEventListener('pointerup', surUp);
        svg.removeEventListener('pointercancel', surUp);
        svg.classList.remove('compas-zone');
        [g, gTrace, gApercu, gLoupe].forEach(e => e.remove());
        /* On rend au SVG les enfants qu’on lui avait empruntés, dans l’ordre,
           puis on retire l’emballage : le jeu hôte retrouve exactement la
           structure qu’il avait avant. */
        if (gMonde.parentNode) {
          enfantsHote.forEach(e => svg.insertBefore(e, gMonde));
          gMonde.remove();
        }
      }
    };
  }

  return {UNITE, BRANCHE, R_MAX, DUREE_TRACE, AIMANT_POINTE, AIMANT_RAYON, creerCompas};
})();
