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

  /* Coupe un libellé en 2 lignes max (~motifs de mots), avec ellipse au-delà. */
  function couperLibelle(texte, maxParLigne) {
    const mots = String(texte).split(/\s+/);
    const lignes = [''];
    mots.forEach((mot) => {
      const courante = lignes[lignes.length - 1];
      if (courante && (courante + ' ' + mot).length > maxParLigne && lignes.length < 2) {
        lignes.push(mot);
      } else {
        lignes[lignes.length - 1] = courante ? courante + ' ' + mot : mot;
      }
    });
    if (lignes[1] && lignes[1].length > maxParLigne) {
      lignes[1] = lignes[1].slice(0, maxParLigne - 1) + '…';
    }
    return lignes;
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
      const lignes = couperLibelle(axe.libelle, 15);
      const texte = el('text', {
        x: pLib.x,
        y: pLib.y - (lignes.length - 1) * 5,
        'text-anchor': ancre,
        class: 'radar-libelle' + (options.onClicAxe ? ' radar-libelle-cliquable' : '') +
          (options.indexActif === i ? ' radar-libelle-actif' : '')
      });
      lignes.forEach((ligne, j) => {
        const tspan = el('tspan', { x: pLib.x, dy: j === 0 ? 0 : 11 });
        tspan.textContent = ligne;
        texte.appendChild(tspan);
      });
      if (axe.sousLibelle) {
        const tspan = el('tspan', { x: pLib.x, dy: 11, class: 'radar-sous-libelle' });
        tspan.textContent = axe.sousLibelle;
        texte.appendChild(tspan);
      }
      const titre = el('title', {});
      titre.textContent = axe.libelle + ' : ' + axe.valeur + ' / ' + max;
      texte.appendChild(titre);
      if (options.onClicAxe) {
        texte.addEventListener('click', () => options.onClicAxe(i));
      }
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
      titre.textContent = axes[i].libelle + ' : ' + axes[i].valeur + ' / ' + max;
      cercle.appendChild(titre);
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

  global.MayeutikRadar = { dessiner, scinderEnRadars };
})(typeof window !== 'undefined' ? window : globalThis);
