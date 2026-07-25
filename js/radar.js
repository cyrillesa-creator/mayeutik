/*
 * Mayeutik — radar (toile d'araignée) en SVG pur, sans librairie externe.
 *
 * Utilisé par le tableau de bord parental (PRODUIT.md) :
 *  - radar de synthèse à 4 axes (les domaines) ;
 *  - radars détaillés par compétence (8 axes maximum par radar).
 *
 * Module d'affichage pur : il reçoit des axes déjà calculés (libellé +
 * valeur radiale 0..4) et rend un élément SVG responsive. Aucune logique
 * métier ici. Expose l'espace de noms global `MayeutikRadar`.
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  function el(nom, attrs) {
    const e = document.createElementNS(NS, nom);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    return e;
  }

  /* Point (x, y) pour l'axe i (sur n), à la distance d du centre. Axe 0 en haut. */
  function point(cx, cy, n, i, d) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + d * Math.cos(angle), y: cy + d * Math.sin(angle) };
  }

  /*
   * Enveloppe un libellé sur plusieurs lignes (découpe aux espaces), SANS
   * jamais tronquer : le texte complet est toujours présent. `maxLignes`
   * borne le nombre de lignes ; si atteint, les mots restants s'accumulent
   * sur la dernière ligne (toujours pas de troncature).
   */
  function envelopper(texte, maxParLigne, maxLignes) {
    const mots = String(texte).split(/\s+/).filter(Boolean);
    const lignes = [''];
    mots.forEach((mot) => {
      const courante = lignes[lignes.length - 1];
      const depasse = courante && (courante + ' ' + mot).length > maxParLigne;
      if (depasse && (!maxLignes || lignes.length < maxLignes)) {
        lignes.push(mot);
      } else {
        lignes[lignes.length - 1] = courante ? courante + ' ' + mot : mot;
      }
    });
    return lignes.length ? lignes : [''];
  }

  /* ---------- Bulle d'aide (tooltip) : survol desktop + appui long tactile ---------- */

  let infoBulleEl = null;
  function obtenirInfoBulle() {
    if (!infoBulleEl) {
      infoBulleEl = document.createElement('div');
      infoBulleEl.className = 'radar-infobulle';
      infoBulleEl.setAttribute('role', 'tooltip');
      infoBulleEl.hidden = true;
      document.body.appendChild(infoBulleEl);
    }
    return infoBulleEl;
  }
  function montrerInfoBulle(texte, x, y) {
    const bulle = obtenirInfoBulle();
    bulle.textContent = texte;
    bulle.hidden = false;
    const marge = 8;
    let gauche = x - bulle.offsetWidth / 2;
    gauche = Math.max(marge, Math.min(gauche, window.innerWidth - bulle.offsetWidth - marge));
    let haut = y - bulle.offsetHeight - 12;
    if (haut < marge) haut = y + 18; // pas la place au-dessus : on bascule dessous
    bulle.style.left = gauche + 'px';
    bulle.style.top = haut + 'px';
  }
  function cacherInfoBulle() {
    if (infoBulleEl) infoBulleEl.hidden = true;
  }
  if (typeof window !== 'undefined') {
    // La bulle est positionnée en coordonnées écran : on la masque si la page
    // défile ou est redimensionnée, pour ne pas la laisser « flotter ».
    window.addEventListener('scroll', cacherInfoBulle, { passive: true });
    window.addEventListener('resize', cacherInfoBulle);
  }

  /*
   * Rend une cible (libellé ou point d'axe) porteuse d'une bulle d'aide :
   *  - desktop : affichage au survol (mouseenter/mousemove), masquage à la sortie ;
   *  - tactile : appui long (~350 ms) SANS bloquer le défilement — les écouteurs
   *    sont passifs (aucun preventDefault) et un déplacement du doigt annule.
   */
  function activerInfoBulle(cible, texte) {
    cible.style.cursor = cible.style.cursor || 'help';
    cible.addEventListener('mouseenter', (e) => montrerInfoBulle(texte, e.clientX, e.clientY));
    cible.addEventListener('mousemove', (e) => montrerInfoBulle(texte, e.clientX, e.clientY));
    cible.addEventListener('mouseleave', cacherInfoBulle);

    let minuteur = null;
    const annuler = () => { if (minuteur) { clearTimeout(minuteur); minuteur = null; } };
    cible.addEventListener('touchstart', (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      const x = t.clientX, y = t.clientY;
      annuler();
      minuteur = setTimeout(() => { montrerInfoBulle(texte, x, y); minuteur = null; }, 350);
    }, { passive: true });
    cible.addEventListener('touchmove', annuler, { passive: true });
    cible.addEventListener('touchend', () => { annuler(); setTimeout(cacherInfoBulle, 1800); }, { passive: true });
    cible.addEventListener('touchcancel', () => { annuler(); cacherInfoBulle(); }, { passive: true });
  }

  /*
   * Dessine un radar et le retourne (élément <svg>).
   *
   * options :
   *  - axes : [{ libelle, valeur, sousLibelle? }] — valeur dans [0, max]
   *  - max : valeur radiale maximale (défaut 4, échelle LSU)
   *  - onClicAxe(index) : rend les libellés cliquables (radar de synthèse)
   *  - indexActif : index d'axe mis en évidence (domaine sélectionné)
   */
  function dessiner(options) {
    const axes = options.axes || [];
    const n = Math.max(axes.length, 1);
    const max = options.max || 4;
    const TAILLE = 400;               // unités du viewBox (le SVG est responsive)
    const cx = TAILLE / 2;
    const cy = TAILLE / 2;
    const r = 105;                    // rayon de la toile ; le reste = place des libellés

    const svg = el('svg', {
      viewBox: '0 0 ' + TAILLE + ' ' + TAILLE,
      class: 'radar-svg',
      role: 'img'
    });

    // Anneaux de la grille : un polygone concentrique par palier de l'échelle.
    for (let k = 1; k <= max; k++) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const p = point(cx, cy, n, i, (k / max) * r);
        pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
      }
      svg.appendChild(el(n >= 3 ? 'polygon' : 'circle', n >= 3
        ? { points: pts.join(' '), class: 'radar-grille' }
        : { cx, cy, r: (k / max) * r, class: 'radar-grille' }));
    }

    // Rayons (un par axe) + libellés.
    axes.forEach((axe, i) => {
      const bout = point(cx, cy, n, i, r);
      svg.appendChild(el('line', { x1: cx, y1: cy, x2: bout.x, y2: bout.y, class: 'radar-axe' }));

      const pLib = point(cx, cy, n, i, r + 12);
      const cosinus = Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n);
      const ancre = Math.abs(cosinus) < 0.25 ? 'middle' : cosinus > 0 ? 'start' : 'end';

      // Libellé COMPLET : enveloppé sur autant de lignes que nécessaire (jamais
      // tronqué), avec une police réduite pour les libellés longs afin de tenir
      // dans l'espace tout en restant lisible.
      const lignes = envelopper(axe.libelle, 16, 4);
      const longueurMax = lignes.reduce((m, l) => Math.max(m, l.length), 0);
      let taille = 10.5;
      if (lignes.length >= 4 || longueurMax > 20) taille = 8.5;
      else if (lignes.length === 3 || longueurMax > 15) taille = 9.5;
      const interligne = taille * 1.08;

      const texte = el('text', {
        x: pLib.x,
        y: pLib.y - (lignes.length - 1) * (interligne / 2),
        'text-anchor': ancre,
        'font-size': taille,
        class: 'radar-libelle' + (options.onClicAxe ? ' radar-libelle-cliquable' : '') +
          (options.indexActif === i ? ' radar-libelle-actif' : '')
      });
      lignes.forEach((ligne, j) => {
        const tspan = el('tspan', { x: pLib.x, dy: j === 0 ? 0 : interligne });
        tspan.textContent = ligne;
        texte.appendChild(tspan);
      });
      if (axe.sousLibelle) {
        const tspan = el('tspan', { x: pLib.x, dy: interligne + 1, class: 'radar-sous-libelle' });
        tspan.textContent = axe.sousLibelle;
        texte.appendChild(tspan);
      }
      // Repli natif (title) conservé, en plus de la bulle personnalisée.
      const titre = el('title', {});
      titre.textContent = axe.infoBulle || (axe.libelle + ' : ' + axe.valeur + ' / ' + max);
      texte.appendChild(titre);
      if (options.onClicAxe) {
        texte.addEventListener('click', () => options.onClicAxe(i));
      }
      if (axe.infoBulle) activerInfoBulle(texte, axe.infoBulle);
      svg.appendChild(texte);
    });

    // Polygone des valeurs (par-dessus la grille), puis un point par sommet.
    const ptsValeurs = axes.map((axe, i) =>
      point(cx, cy, n, i, (Math.max(0, Math.min(max, axe.valeur)) / max) * r));
    if (n >= 3) {
      svg.appendChild(el('polygon', {
        points: ptsValeurs.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' '),
        class: 'radar-valeurs'
      }));
    } else if (n === 2) {
      // Cas dégénéré (2 axes) : un segment plutôt qu'un polygone.
      svg.appendChild(el('line', {
        x1: ptsValeurs[0].x, y1: ptsValeurs[0].y,
        x2: ptsValeurs[1].x, y2: ptsValeurs[1].y,
        class: 'radar-valeurs-ligne'
      }));
    }
    ptsValeurs.forEach((p, i) => {
      const cercle = el('circle', { cx: p.x, cy: p.y, r: 3.5, class: 'radar-point' });
      const titre = el('title', {});
      titre.textContent = axes[i].infoBulle || (axes[i].libelle + ' : ' + axes[i].valeur + ' / ' + max);
      cercle.appendChild(titre);
      if (axes[i].infoBulle) activerInfoBulle(cercle, axes[i].infoBulle);
      svg.appendChild(cercle);
    });

    return svg;
  }

  /*
   * Découpe une liste de compétences en radars de 8 axes maximum
   * (PRODUIT.md : « au-delà on scinde en plusieurs radars »). On regroupe
   * par module pour que chaque radar reste lisible : les compétences d'un
   * même module restent ensemble tant qu'elles tiennent dans la limite.
   */
  function scinderEnRadars(competences, maxAxes) {
    maxAxes = maxAxes || 8;
    const parModule = [];
    competences.forEach((c) => {
      const dernier = parModule[parModule.length - 1];
      if (dernier && dernier.moduleId === c.moduleId) dernier.liste.push(c);
      else parModule.push({ moduleId: c.moduleId, moduleTitre: c.moduleTitre, liste: [c] });
    });

    const radars = [];
    parModule.forEach((groupe) => {
      // Un module trop grand pour un seul radar est scindé en tranches.
      for (let debut = 0; debut < groupe.liste.length; debut += maxAxes) {
        const tranche = groupe.liste.slice(debut, debut + maxAxes);
        const courant = radars[radars.length - 1];
        if (courant && courant.competences.length + tranche.length <= maxAxes &&
            groupe.liste.length <= maxAxes) {
          courant.competences = courant.competences.concat(tranche);
          if (!courant.titres.includes(groupe.moduleTitre)) courant.titres.push(groupe.moduleTitre);
        } else {
          radars.push({ titres: [groupe.moduleTitre], competences: tranche });
        }
      }
    });
    return radars;
  }

  /* Date courte (« 20 juil. ») à partir d'une date AAAA-MM-JJ (lundi de semaine ou jour de session). */
  function formaterDateCourte(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  /*
   * Courbe de progression temporelle (complément du radar instantané,
   * PRODUIT.md) : un point par semaine (ou par session si les données sont
   * trop éparses), taux de réussite en ordonnée. SVG léger, sans librairie.
   *
   * options :
   *  - points : [{ date: 'AAAA-MM-JJ', taux: 0..1, nbSessions }], déjà triés
   *  - parSemaine : true si les points sont des regroupements hebdomadaires
   */
  function dessinerCourbe(options) {
    const points = options.points || [];
    const LARGEUR = 400, HAUTEUR = 160;
    const marge = { haut: 14, bas: 26, gauche: 12, droite: 12 };
    const zoneL = LARGEUR - marge.gauche - marge.droite;
    const zoneH = HAUTEUR - marge.haut - marge.bas;
    const n = points.length;

    const svg = el('svg', { viewBox: '0 0 ' + LARGEUR + ' ' + HAUTEUR, class: 'courbe-svg', role: 'img' });

    const xy = (i, taux) => ({
      x: marge.gauche + (n <= 1 ? zoneL / 2 : (i / (n - 1)) * zoneL),
      y: marge.haut + (1 - Math.max(0, Math.min(1, taux))) * zoneH
    });

    // Lignes de repère horizontales (0 %, 50 %, 100 %).
    [0, 0.5, 1].forEach((f) => {
      const y = marge.haut + (1 - f) * zoneH;
      svg.appendChild(el('line', {
        x1: marge.gauche, y1: y.toFixed(1), x2: LARGEUR - marge.droite, y2: y.toFixed(1),
        class: 'courbe-grille'
      }));
    });

    if (n) {
      const chemin = points.map((p, i) => {
        const c = xy(i, p.taux);
        return (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1);
      }).join(' ');
      svg.appendChild(el('path', { d: chemin, class: 'courbe-ligne' }));
    }

    // N'affiche pas tous les libellés si les points sont nombreux (lisibilité).
    const pas = n > 6 ? Math.ceil(n / 6) : 1;
    points.forEach((p, i) => {
      const c = xy(i, p.taux);
      const cercle = el('circle', { cx: c.x.toFixed(1), cy: c.y.toFixed(1), r: 3.5, class: 'courbe-point' });
      const titre = el('title', {});
      titre.textContent = (options.parSemaine ? 'Semaine du ' : '') + formaterDateCourte(p.date) +
        ' — ' + Math.round(p.taux * 100) + ' % · ' + p.nbSessions + ' partie' + (p.nbSessions > 1 ? 's' : '');
      cercle.appendChild(titre);
      svg.appendChild(cercle);
      if (i % pas === 0 || i === n - 1) {
        const texte = el('text', {
          x: c.x.toFixed(1), y: HAUTEUR - 8, 'text-anchor': 'middle', 'font-size': 8.5, class: 'courbe-libelle'
        });
        texte.textContent = formaterDateCourte(p.date);
        svg.appendChild(texte);
      }
    });

    return svg;
  }

  global.MayeutikRadar = { dessiner, scinderEnRadars, dessinerCourbe };
})(typeof window !== 'undefined' ? window : globalThis);
