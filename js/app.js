/*
 * Mayeutik — interface de la coquille.
 *
 * Trois vues, routées par le hash de l'URL :
 *   #profils : choix / création du profil (côté enfant, ludique)
 *   #accueil : index des jeux par niveau × domaine × thème (côté enfant)
 *   #parent  : tableau de bord parental (sobre, informatif)
 *
 * Toute la construction du DOM passe par le petit constructeur h() avec
 * `textContent` : aucun innerHTML avec des données utilisateur (prénoms).
 */
(function () {
  'use strict';

  const P = window.MayeutikProfils;
  const S = window.MayeutikStatuts;
  const R = window.MayeutikRadar;

  let referentiel = null;

  /* État d'interface uniquement (jamais persisté). */
  const etat = {
    recherche: '',
    filtreNiveau: 'tous',
    filtreDomaine: 'tous',
    domaineParent: null,     // domaine sélectionné sur le radar de synthèse
    filtreNiveauParent: 'tous'
  };

  /* ---------- Petits utilitaires ---------- */

  function h(balise, attrs, enfants) {
    const e = document.createElement(balise);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === 'texte') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (enfants || []).forEach((enfant) => { if (enfant) e.appendChild(enfant); });
    return e;
  }

  function normaliser(texte) {
    return String(texte).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function formaterDate(iso) {
    if (!iso) return 'jamais';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'jamais';
    const options = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return d.toLocaleDateString('fr-FR', options);
  }

  const CLASSES_AVATAR = ['avatar-mandarine', 'avatar', 'avatar-corail', 'avatar-soleil'];
  function avatar(profil) {
    const indice = Math.max(0, P.lireProfils().findIndex((p) => p.id === profil.id));
    return h('span', { class: 'avatar ' + CLASSES_AVATAR[indice % CLASSES_AVATAR.length],
      texte: (profil.prenom || '?').charAt(0).toUpperCase() });
  }

  function moduleParId(id) {
    return (referentiel.modules || []).find((m) => m.id === id) || null;
  }

  /* ---------- Vue : choix / création de profil (enfant) ---------- */

  function vueProfils(conteneur) {
    const profils = P.lireProfils();
    const actif = P.lireProfilActif();

    const vue = h('div', { class: 'vue' });
    vue.appendChild(h('div', { class: 'entete-enfant' }, [
      h('h1', { texte: 'Mayeutik' }),
      h('p', { class: 'sous-titre', texte: 'Qui joue aujourd’hui ?' })
    ]));

    const liste = h('div', { class: 'liste-profils' });
    profils.forEach((profil) => {
      liste.appendChild(h('button', {
        class: 'carte-profil' + (profil.id === actif ? ' actif' : ''),
        onclick: () => { P.definirProfilActif(profil.id); location.hash = '#accueil'; }
      }, [
        avatar(profil),
        h('span', { texte: profil.prenom }),
        h('span', { class: 'niveau', texte: profil.niveau })
      ]));
    });
    vue.appendChild(liste);

    // Création (prénom + niveau uniquement : minimisation RGPD).
    const champPrenom = h('input', { type: 'text', maxlength: '30', placeholder: 'Prénom',
      'aria-label': 'Prénom' });
    const champNiveau = h('select', { 'aria-label': 'Niveau' },
      (referentiel.niveaux || []).map((n) => h('option', { value: n, texte: n })));
    const boutonCreer = h('button', { class: 'bouton-principal', texte: 'C’est parti !',
      onclick: () => {
        if (!champPrenom.value.trim()) { champPrenom.focus(); return; }
        P.creerProfil(champPrenom.value, champNiveau.value);
        location.hash = '#accueil';
        rendre();
      } });
    vue.appendChild(h('div', { class: 'formulaire-profil' }, [
      h('h3', { texte: profils.length ? 'Ajouter un joueur' : 'Crée ton profil pour commencer !' }),
      h('div', { class: 'champs' }, [champPrenom, champNiveau]),
      boutonCreer
    ]));

    vue.appendChild(piedEnfant());
    conteneur.appendChild(vue);
  }

  /* ---------- Vue : accueil / index des jeux (enfant) ---------- */

  function modulesFiltres() {
    const recherche = normaliser(etat.recherche.trim());
    return (referentiel.modules || []).filter((m) => {
      if (etat.filtreNiveau !== 'tous' && m.niveau !== etat.filtreNiveau) return false;
      if (etat.filtreDomaine !== 'tous' && m.domaine !== etat.filtreDomaine) return false;
      if (recherche) {
        const meule = normaliser([m.titre, m.theme, m.description, m.domaine].join(' '));
        if (meule.indexOf(recherche) === -1) return false;
      }
      return true;
    });
  }

  const COULEURS_CARTES = ['carte-mandarine', 'carte-menthe', 'carte-soleil', 'carte-corail'];

  function carteJeu(module, indice) {
    const badges = [
      h('span', { class: 'badge badge-niveau', texte: module.niveau }),
      h('span', { class: 'badge', texte: module.domaine }),
      h('span', { class: 'badge', texte: module.theme })
    ];
    if (module.type === 'evaluation') {
      badges.push(h('span', { class: 'badge badge-evaluation', texte: '⏱ Évaluation' }));
    }
    return h('a', { class: 'carte-jeu ' + COULEURS_CARTES[indice % COULEURS_CARTES.length],
      href: module.fichier }, [
      h('span', { class: 'icone', texte: module.icone || '🎲' }),
      h('div', { class: 'infos' }, [
        h('div', { class: 'titre', texte: module.titre }),
        h('div', { class: 'description', texte: module.description || '' }),
        h('div', { class: 'badges' }, badges)
      ])
    ]);
  }

  function vueAccueil(conteneur) {
    const profil = P.profilActif();
    const vue = h('div', { class: 'vue', style: 'position:relative' });

    vue.appendChild(h('button', { class: 'pastille-profil', 'aria-label': 'Changer de joueur',
      onclick: () => { location.hash = '#profils'; } },
      profil ? [avatar(profil), h('span', { texte: profil.prenom })]
             : [h('span', { class: 'avatar', texte: '?' }), h('span', { texte: 'Choisir' })]));

    vue.appendChild(h('div', { class: 'entete-enfant' }, [
      h('h1', { texte: 'Mayeutik' }),
      h('p', { class: 'sous-titre', texte: 'À quoi veux-tu jouer ?' })
    ]));

    vue.appendChild(h('input', { class: 'barre-recherche', type: 'search',
      placeholder: '🔍 Chercher un jeu…', value: etat.recherche,
      oninput: (e) => { etat.recherche = e.target.value; rendreListeJeux(); } }));

    // Filtres niveau puis domaine (navigation niveau × domaine × thème).
    const niveauxAvecModules = (referentiel.niveaux || [])
      .filter((n) => referentiel.modules.some((m) => m.niveau === n));
    const rangeeNiveaux = h('div', { class: 'rangee-filtres' },
      [['tous', 'Tous']].concat(niveauxAvecModules.map((n) => [n, n])).map(([valeur, libelle]) =>
        h('button', { class: 'puce-filtre' + (etat.filtreNiveau === valeur ? ' active' : ''),
          texte: libelle,
          onclick: () => { etat.filtreNiveau = valeur; rendre(); } })));
    vue.appendChild(rangeeNiveaux);

    const domainesAvecModules = (referentiel.domaines || [])
      .filter((d) => referentiel.modules.some((m) => m.domaine === d));
    const rangeeDomaines = h('div', { class: 'rangee-filtres' },
      [['tous', 'Tous les domaines']].concat(domainesAvecModules.map((d) => [d, d])).map(([valeur, libelle]) =>
        h('button', { class: 'puce-filtre puce-filtre-domaine' + (etat.filtreDomaine === valeur ? ' active' : ''),
          texte: libelle,
          onclick: () => { etat.filtreDomaine = valeur; rendre(); } })));
    vue.appendChild(rangeeDomaines);

    const zoneJeux = h('div', { id: 'zone-jeux' });
    vue.appendChild(zoneJeux);

    function rendreListeJeux() {
      zoneJeux.textContent = '';
      const modules = modulesFiltres();
      if (!modules.length) {
        zoneJeux.appendChild(h('p', { class: 'aucun-resultat', texte: 'Aucun jeu trouvé… essaie autre chose !' }));
        return;
      }
      // Regroupement par niveau (dans l'ordre du référentiel) quand aucun
      // niveau précis n'est sélectionné, pour garder une lecture « par classe ».
      const groupes = etat.filtreNiveau === 'tous'
        ? (referentiel.niveaux || []).map((n) => [n, modules.filter((m) => m.niveau === n)]).filter(([, l]) => l.length)
        : [[null, modules]];
      groupes.forEach(([niveau, liste]) => {
        if (niveau) zoneJeux.appendChild(h('div', { class: 'titre-groupe', texte: niveau }));
        zoneJeux.appendChild(h('div', { class: 'grille-jeux' }, liste.map(carteJeu)));
      });
    }
    rendreListeJeux();

    vue.appendChild(piedEnfant());
    conteneur.appendChild(vue);
  }

  /* Accès parent volontairement à l'écart : petit lien discret en pied de page. */
  function piedEnfant() {
    return h('div', { class: 'pied-enfant' }, [
      h('button', { class: 'lien-parent', texte: 'Espace parents',
        onclick: () => { location.hash = '#parent'; } })
    ]);
  }

  /* ---------- Vue : tableau de bord parental ---------- */

  function badgeStatut(statut) {
    return h('span', { class: 'statut statut-' + statut.id, texte: statut.affichage });
  }

  function vueParent(conteneur) {
    const profils = P.lireProfils();
    const profilId = P.lireProfilActif();
    const profil = P.profilActif();
    const filtreNiveau = etat.filtreNiveauParent === 'tous' ? null : etat.filtreNiveauParent;
    const analyse = S.analyserProfil(referentiel, P.lireSessions(), profilId, filtreNiveau);

    const vue = h('div', { class: 'vue vue-parent' });

    vue.appendChild(h('div', { class: 'entete-parent' }, [
      h('a', { class: 'lien-retour-jeux', href: '#accueil', texte: '← Jeux' }),
      h('h1', { texte: 'Espace parents' })
    ]));
    // Mention obligatoire (CHARTE.md / PRODUIT.md), toujours visible en tête.
    // Texte défini une seule fois, dans MayeutikStatuts.MENTION_PARENTALE.
    const mention = S.MENTION_PARENTALE.charAt(0).toUpperCase() + S.MENTION_PARENTALE.slice(1) + '.';
    vue.appendChild(h('p', { class: 'mention-legale', texte: mention }));

    /* Outils : choix du profil suivi + filtre de niveau. */
    const selectProfil = h('select', { 'aria-label': 'Profil suivi',
      onchange: (e) => { P.definirProfilActif(e.target.value); rendre(); } },
      profils.length
        ? profils.map((p) => {
            const opt = h('option', { value: p.id, texte: p.prenom + ' (' + p.niveau + ')' });
            if (p.id === profilId) opt.selected = true;
            return opt;
          })
        : [h('option', { value: profilId, texte: 'Profil par défaut' })]);
    const selectNiveau = h('select', { 'aria-label': 'Filtrer par niveau',
      onchange: (e) => { etat.filtreNiveauParent = e.target.value; rendre(); } },
      [h('option', { value: 'tous', texte: 'Tous les niveaux' })].concat(
        (referentiel.niveaux || []).map((n) => {
          const opt = h('option', { value: n, texte: 'Niveau ' + n });
          if (etat.filtreNiveauParent === n) opt.selected = true;
          return opt;
        })));
    vue.appendChild(h('div', { class: 'rangee-outils-parent' }, [
      h('div', {}, [h('label', { texte: 'Enfant suivi' }), selectProfil]),
      h('div', {}, [h('label', { texte: 'Niveau' }), selectNiveau])
    ]));

    /* Radar de synthèse : 4 axes = les 4 domaines du programme. */
    const sectionSynthese = h('div', { class: 'section-parent' });
    sectionSynthese.appendChild(h('h2', { texte: 'Vue d’ensemble par domaine' }));
    const cadreSynthese = h('div', { class: 'cadre-radar' });
    const nomsDomaines = analyse.domaines.map((d) => d.nom);
    if (etat.domaineParent === null || nomsDomaines.indexOf(etat.domaineParent) === -1) {
      // Par défaut : le premier domaine où l'enfant a déjà joué, sinon le premier.
      const avecActivite = analyse.domaines.find((d) => d.valeur > 0);
      etat.domaineParent = (avecActivite || analyse.domaines[0] || {}).nom || null;
    }
    cadreSynthese.appendChild(R.dessiner({
      axes: analyse.domaines.map((d) => ({
        libelle: d.nom,
        valeur: Math.round(d.valeur * 10) / 10,
        sousLibelle: d.nbCompetences ? (String(Math.round(d.valeur * 10) / 10).replace('.', ',') + ' / 4') : 'aucun module'
      })),
      max: 4,
      indexActif: nomsDomaines.indexOf(etat.domaineParent),
      onClicAxe: (i) => { etat.domaineParent = nomsDomaines[i]; rendre(); }
    }));
    cadreSynthese.appendChild(h('p', { class: 'aide-radar',
      texte: 'Touchez un domaine pour voir le détail par compétence.' }));
    sectionSynthese.appendChild(cadreSynthese);
    sectionSynthese.appendChild(h('div', { class: 'legende-echelle' },
      S.STATUTS.map((s) => h('span', {}, [
        h('span', { class: 'point-legende statut-' + s.id }),
        h('span', { texte: s.valeurRadar + ' · ' + s.libelle })
      ]))));
    vue.appendChild(sectionSynthese);

    /* Radars détaillés du domaine sélectionné (8 axes max par radar). */
    const duDomaine = analyse.competences.filter((c) => c.domaine === etat.domaineParent);
    const sectionDetail = h('div', { class: 'section-parent' });
    sectionDetail.appendChild(h('h2', { texte: 'Détail — ' + (etat.domaineParent || '') }));
    if (!duDomaine.length) {
      sectionDetail.appendChild(h('p', { class: 'vide-section',
        texte: 'Aucun module de ce domaine dans le référentiel' + (filtreNiveau ? ' pour le niveau ' + filtreNiveau : '') + ' pour l’instant.' }));
    } else {
      R.scinderEnRadars(duDomaine, 8).forEach((radar) => {
        sectionDetail.appendChild(h('div', { class: 'titre-radar-detail', texte: radar.titres.join(' · ') }));
        const cadre = h('div', { class: 'cadre-radar' });
        cadre.appendChild(R.dessiner({
          axes: radar.competences.map((c) => ({ libelle: c.libelle, valeur: c.statut.valeurRadar })),
          max: 4
        }));
        sectionDetail.appendChild(cadre);
      });

      /* Liste des compétences du domaine, avec statut et repères. */
      const liste = h('div', { class: 'liste-competences' });
      duDomaine.forEach((c) => {
        const details = [
          c.moduleTitre,
          c.nbSessions ? c.nbSessions + ' partie' + (c.nbSessions > 1 ? 's' : '') : 'jamais joué',
          c.nbSessions ? 'dernière : ' + formaterDate(c.derniereDate) : null,
          c.nbEvaluations ? '⏱ ' + c.nbEvaluations + ' évaluation' + (c.nbEvaluations > 1 ? 's' : '') : null
        ].filter(Boolean).join(' · ');
        liste.appendChild(h('div', { class: 'ligne-competence' }, [
          h('div', { class: 'libelle' }, [
            h('div', { texte: c.libelle }),
            h('div', { class: 'details', texte: details })
          ]),
          badgeStatut(c.statut)
        ]));
      });
      sectionDetail.appendChild(h('div', { style: 'margin-top:.7rem' }, [liste]));
    }
    vue.appendChild(sectionDetail);

    /* Recommandations : à consolider puis en cours, les plus anciennes d'abord. */
    const sectionRecos = h('div', { class: 'section-parent' });
    sectionRecos.appendChild(h('h2', { texte: 'À travailler en priorité' }));
    const recos = S.recommandations(analyse, 5);
    if (!recos.length) {
      sectionRecos.appendChild(h('p', { class: 'vide-section',
        texte: 'Rien à signaler : lancez un jeu pour commencer le suivi, ou continuez sur cette lancée !' }));
    } else {
      recos.forEach((c) => {
        sectionRecos.appendChild(h('a', {
          class: 'carte-reco' + (c.priorite === 'en cours' ? ' en-cours' : ''),
          href: c.moduleFichier
        }, [
          h('div', {}, [
            h('div', { style: 'font-size:.9rem', texte: c.libelle }),
            h('div', { class: 'details', style: 'font-size:.75rem;opacity:.65',
              texte: (c.priorite === 'en cours' ? 'En cours' : 'À consolider') +
                ' · ' + c.moduleTitre + ' · dernière partie : ' + formaterDate(c.derniereDate) })
          ]),
          h('span', { class: 'action', texte: 'Jouer →' })
        ]));
      });
    }
    vue.appendChild(sectionRecos);

    /* Historique récent, sessions d'évaluation distinguées. */
    const sectionHistorique = h('div', { class: 'section-parent' });
    sectionHistorique.appendChild(h('h2', { texte: 'Dernières parties' }));
    const sessions = P.sessionsDuProfil(profilId)
      .slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);
    if (!sessions.length) {
      sectionHistorique.appendChild(h('p', { class: 'vide-section', texte: 'Aucune partie enregistrée pour ce profil.' }));
    } else {
      sessions.forEach((s) => {
        const module = moduleParId(s.module);
        const competence = module && (module.competences || []).find((c) => c.id === s.competence);
        const estEvaluation = s.type === 'evaluation';
        sectionHistorique.appendChild(h('div', { class: 'ligne-session' }, [
          h('span', { class: 'quand', texte: formaterDate(s.date) }),
          h('span', { texte: (competence ? competence.libelle : s.competence) }),
          h('span', { class: 'puce-type' + (estEvaluation ? ' puce-type-evaluation' : ''),
            texte: estEvaluation ? '⏱ évaluation' : 'entraînement' }),
          h('span', { class: 'score', texte: s.score + '/' + s.total })
        ]));
      });
    }
    vue.appendChild(sectionHistorique);

    /* Gestion des profils : côté parent (l'enfant ne peut pas supprimer). */
    const sectionProfils = h('div', { class: 'section-parent' });
    sectionProfils.appendChild(h('h2', { texte: 'Profils' }));
    profils.forEach((p) => {
      sectionProfils.appendChild(h('div', { class: 'ligne-profil-parent' }, [
        avatar(p),
        h('span', { texte: p.prenom + ' · ' + p.niveau }),
        h('button', { class: 'bouton-supprimer', texte: 'Supprimer',
          onclick: () => {
            const ok = window.confirm('Supprimer le profil de ' + p.prenom +
              ' ? Toutes ses parties enregistrées seront effacées (irréversible).');
            if (ok) { P.supprimerProfil(p.id); rendre(); }
          } })
      ]));
    });
    if (!profils.length) {
      sectionProfils.appendChild(h('p', { class: 'vide-section',
        texte: 'Aucun profil : les parties sont enregistrées sous le profil par défaut. Créez un profil depuis l’écran d’accueil pour les adopter.' }));
    }
    vue.appendChild(sectionProfils);

    conteneur.appendChild(vue);
  }

  /* ---------- Routage et cycle de vie ---------- */

  function rendre() {
    const conteneur = document.getElementById('application');
    conteneur.textContent = '';
    if (!referentiel) return;

    let route = location.hash || '#accueil';
    // Premier lancement : pas de profil → écran de choix/création.
    if (route === '#accueil' && P.lireProfils().length === 0) route = '#profils';

    if (route === '#parent') vueParent(conteneur);
    else if (route === '#profils') vueProfils(conteneur);
    else vueAccueil(conteneur);
    window.scrollTo(0, 0);
  }

  function afficherErreurChargement() {
    const conteneur = document.getElementById('application');
    conteneur.textContent = '';
    conteneur.appendChild(h('div', { class: 'erreur-chargement',
      texte: 'Impossible de charger le référentiel des jeux (data/referentiel.json). ' +
        'Si vous avez ouvert ce fichier directement (file://), servez le dossier via un petit serveur local, ' +
        'par exemple : python3 -m http.server' }));
  }

  fetch('data/referentiel.json')
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((json) => { referentiel = json; rendre(); })
    .catch(afficherErreurChargement);

  window.addEventListener('hashchange', rendre);

  /*
   * Retour depuis un jeu : la page peut revenir du cache de navigation
   * (bfcache) sans rechargement. On invalide alors le cache mémoire pour
   * relire les sessions fraîchement écrites par le jeu, et on re-rend —
   * le tableau de bord reflète immédiatement les nouvelles parties.
   */
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) { P.invaliderCache(); rendre(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { P.invaliderCache(); rendre(); }
  });
})();
