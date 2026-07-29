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
    profilEnEdition: null,       // id du profil en cours de modification (#modifier-profil)
    origineEditionProfil: null,  // 'profils' ou 'parent' : où revenir après #modifier-profil
    domaineParent: null,     // domaine sélectionné sur le radar de synthèse
    filtreNiveauParent: 'tous',
    menuNiveauxOuvert: false,  // le menu de sélection des niveaux reste ouvert entre deux rendus
    outilsDevOuverts: false  // le panneau dev reste ouvert entre deux rendus
  };

  /*
   * État « Niveaux affichés » (sélection multiple : CP, CE1, CE2… cochables
   * indépendamment) — persistant le temps de la SESSION de navigation dans la
   * coquille, PAS dans le stockage persistant localStorage.
   *
   * Pourquoi sessionStorage plutôt qu'une simple variable mémoire : ouvrir un
   * jeu quitte la page de la coquille (les jeux sont des fichiers HTML séparés)
   * et y revenir la RECHARGE — une variable JS serait alors perdue. sessionStorage
   * survit à ce rechargement tant que l'onglet reste ouvert, et est effacé à la
   * fermeture de l'onglet (donc non persistant, comme demandé).
   *
   * La valeur stockée est préfixée par l'id du profil (périmètre) : si le
   * profil actif change par un autre chemin, la sélection ne s'applique plus
   * → retour au défaut (« Mon niveau »). Il est en outre réinitialisé
   * explicitement à l'accès à l'écran des profils.
   */
  const CLE_NIVEAUX = 'mayeutik-nav-filtre-niveaux';
  const CLE_DOMAINE = 'mayeutik-nav-filtre-domaine';
  const SEP = String.fromCharCode(1); // séparateur profilId | valeur (jamais présent dans un nom de domaine)
  let memoireNiveaux = null; // repli si sessionStorage est indisponible (Safari privé…)
  let memoireDomaine = null;

  // Niveau du profil désigné par cet id (indépendant du profil ACTIF courant,
  // utile pour calculer le défaut « Mon niveau » sans dépendre de l'ordre
  // d'appel dans vueAccueil).
  function niveauDuProfilId(profilId) {
    if (!profilId) return null;
    const p = P.lireProfils().find((pp) => pp.id === profilId);
    return (p && p.niveau) || null;
  }

  // Défaut « Mon niveau » : uniquement le niveau du profil, ou TOUS les
  // niveaux du référentiel si le profil n'a pas de niveau renseigné (rien à
  // filtrer dans ce cas).
  function niveauxParDefaut(profilId) {
    const n = niveauDuProfilId(profilId);
    return n ? [n] : (referentiel.niveaux || []).slice();
  }

  function lireNiveauxSelectionnes(profilId) {
    if (!profilId) return niveauxParDefaut(profilId);
    let brut;
    try { brut = window.sessionStorage.getItem(CLE_NIVEAUX); } catch (e) { brut = memoireNiveaux; }
    if (!brut) return niveauxParDefaut(profilId);
    const sep = brut.indexOf(SEP);
    if (sep === -1 || brut.slice(0, sep) !== profilId) return niveauxParDefaut(profilId);
    const niveaux = brut.slice(sep + 1).split(',').filter(Boolean);
    return niveaux.length ? niveaux : niveauxParDefaut(profilId);
  }
  function ecrireNiveauxSelectionnes(profilId, niveaux) {
    if (!profilId || !niveaux || !niveaux.length) return;
    const valeur = profilId + SEP + niveaux.join(',');
    memoireNiveaux = valeur;
    try {
      window.sessionStorage.setItem(CLE_NIVEAUX, valeur);
    } catch (e) {
      // sessionStorage indisponible : on garde le repli mémoire (dégradé mais sans erreur).
    }
  }

  // Filtre de domaine : même principe, mais la valeur utile est le domaine
  // choisi (ou 'tous'). On la stocke préfixée par l'id du profil (périmètre) :
  // si le profil actif change par un autre chemin, le filtre ne s'applique plus.
  function lireFiltreDomaine(profilId) {
    if (!profilId) return 'tous';
    let brut;
    try { brut = window.sessionStorage.getItem(CLE_DOMAINE); } catch (e) { brut = memoireDomaine; }
    if (!brut) return 'tous';
    const sep = brut.indexOf(SEP);
    if (sep === -1 || brut.slice(0, sep) !== profilId) return 'tous';
    return brut.slice(sep + 1) || 'tous';
  }
  function ecrireFiltreDomaine(profilId, domaine) {
    const parDefaut = !domaine || domaine === 'tous' || !profilId;
    memoireDomaine = parDefaut ? null : profilId + SEP + domaine;
    try {
      if (parDefaut) window.sessionStorage.removeItem(CLE_DOMAINE);
      else window.sessionStorage.setItem(CLE_DOMAINE, profilId + SEP + domaine);
    } catch (e) {
      // sessionStorage indisponible : repli mémoire.
    }
  }

  /*
   * Registre CENTRAL des filtres de navigation. Chaque filtre s'y enregistre
   * avec : sa clé sessionStorage, la remise à zéro de son repli mémoire, et un
   * prédicat « diffère-t-il de son état par défaut ? ». Tout NOUVEAU filtre
   * (par thème, par type de module…) n'a qu'à ajouter une entrée ici pour
   * hériter AUTOMATIQUEMENT des deux resets — bouton manuel « Réinitialiser les
   * filtres » ET retour à l'écran de choix du profil — sans risque d'oubli.
   */
  const FILTRES_NAVIGATION = [
    {
      cle: CLE_NIVEAUX,
      reinitMemoire: function () { memoireNiveaux = null; },
      // Écart au défaut = la sélection de niveaux diffère de « Mon niveau ».
      estModifie: function (profilId) {
        const actuel = lireNiveauxSelectionnes(profilId).slice().sort();
        const defaut = niveauxParDefaut(profilId).slice().sort();
        return actuel.length !== defaut.length || actuel.some((v, i) => v !== defaut[i]);
      }
    },
    {
      cle: CLE_DOMAINE,
      reinitMemoire: function () { memoireDomaine = null; },
      // Écart au défaut = un domaine précis est sélectionné (≠ « tous »).
      estModifie: function (profilId) { return lireFiltreDomaine(profilId) !== 'tous'; }
    }
  ];

  // Remet TOUS les filtres à leur état par défaut, d'un seul coup. Point d'entrée
  // UNIQUE partagé par le bouton « Réinitialiser les filtres » et par le reset
  // automatique déclenché à l'accès à l'écran de choix du profil (cf. vueProfils).
  function reinitialiserFiltres() {
    FILTRES_NAVIGATION.forEach(function (f) {
      f.reinitMemoire();
      try { window.sessionStorage.removeItem(f.cle); } catch (e) { /* rien à faire */ }
    });
  }

  // Au moins un filtre s'écarte-t-il de son état par défaut ?
  // (sert à activer/griser le bouton de réinitialisation).
  function filtresModifies(profilId) {
    return FILTRES_NAVIGATION.some(function (f) { return f.estModifie(profilId); });
  }

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

  /*
   * Icône de profil choisie par le parent/enfant (écran de modification,
   * #modifier-profil) : une lettre, deux initiales, ou un emoji au choix.
   * `profil.icone` vaut 'initiale' | 'initiales' | un emoji littéral ; toute
   * valeur absente/inconnue retombe sur 'initiale' (défaut sensé pour les
   * profils existants qui n'ont pas encore fait ce choix).
   */
  const EMOJIS_PROFIL = ['😀', '😎', '🤓', '🥳', '🥰', '😺', '🐶', '🦊', '🐼', '🦁', '🐵', '🦄', '🐧', '🐢', '🦋', '🐙'];
  /*
   * Initiales d'un prénom, avec une règle double :
   *  - prénom COMPOSÉ (tiret) : une lettre par partie, ex. « Jean-Philippe »
   *    → « JP » (pas les deux premières lettres de la première partie) ;
   *  - prénom SIMPLE : première lettre en MAJUSCULE + deuxième en minuscule,
   *    ex. « Léo » → « Lé », « Emma » → « Em », « Théo » → « Th ».
   */
  function initialesProfil(prenom) {
    const nom = (prenom || '?').trim() || '?';
    if (nom.indexOf('-') !== -1) {
      return nom.split('-')
        .map((partie) => partie.trim().charAt(0).toUpperCase())
        .filter(Boolean)
        .join('');
    }
    return nom.charAt(0).toUpperCase() + nom.slice(1, 2).toLowerCase();
  }
  function contenuIcone(profil) {
    const icone = profil.icone;
    const prenom = (profil.prenom || '?').trim() || '?';
    if (icone && icone !== 'initiale' && icone !== 'initiales') return icone; // emoji stocké tel quel
    if (icone === 'initiales') return initialesProfil(prenom);
    return prenom.charAt(0).toUpperCase();
  }
  // Icône « en tête » (grande, coin supérieur droit de l'accueil) : mêmes
  // couleurs de rotation que avatar(), et contenu dérivé du choix d'icône
  // plutôt que toujours la seule initiale.
  function avatarEnTete(profil) {
    const indice = Math.max(0, P.lireProfils().findIndex((p) => p.id === profil.id));
    const contenu = contenuIcone(profil);
    return h('span', { class: 'avatar avatar-entete' + (contenu.length > 1 ? ' avatar-texte-double' : '') +
      ' ' + CLASSES_AVATAR[indice % CLASSES_AVATAR.length], texte: contenu });
  }

  function moduleParId(id) {
    return (referentiel.modules || []).find((m) => m.id === id) || null;
  }

  /*
   * Niveaux couverts par un module (CHARTE.md §15, modules adaptatifs par
   * niveau) : un module adaptatif déclare `niveaux` (tableau) en plus de
   * `niveau` (niveau d'intro, conservé pour compatibilité) ; un module
   * classique n'a que `niveau`. Point d'entrée UNIQUE pour tout filtrage par
   * niveau, afin qu'un module multi-niveaux apparaisse pour chacun des
   * niveaux qu'il couvre plutôt que pour son seul niveau d'intro.
   */
  function niveauxModule(m) {
    return m.niveaux || [m.niveau];
  }
  function libelleNiveauxModule(m) {
    const niveaux = niveauxModule(m);
    return niveaux.length > 1 ? niveaux[0] + '→' + niveaux[niveaux.length - 1] : niveaux[0];
  }

  /*
   * Pictogrammes par compétence, dans l'esprit des pictogrammes des fiches
   * Repères : un symbole simple par domaine du programme, pour repérer d'un
   * coup d'œil la liste de compétences et le radar détaillé. Un seul emoji
   * par domaine (pas de dépendance externe, pas de jeu d'icônes par thème).
   */
  const PICTO_DOMAINE = {
    'Nombres et calcul': '🔢',
    'Grandeurs et mesures': '📏',
    'Espace et géométrie': '📐',
    'Organisation et gestion de données': '📊'
  };
  function pictoCompetence(c) {
    return PICTO_DOMAINE[c.domaine] || '📚';
  }

  /* ---------- Vue : choix / création de profil (enfant) ---------- */

  function vueProfils(conteneur) {
    // Accéder à l'écran de sélection du profil réinitialise le filtre de niveau :
    // au retour sur l'écran de choix des jeux, le filtre par défaut (niveau du
    // profil) sera réappliqué, sans mémoire de l'état précédent.
    reinitialiserFiltres();

    const profils = P.lireProfils();
    const actif = P.lireProfilActif();

    const vue = h('div', { class: 'vue' });
    vue.appendChild(h('div', { class: 'entete-enfant' }, [
      h('h1', { texte: 'Mayeutik' }),
      h('p', { class: 'sous-titre', texte: 'Qui joue aujourd’hui ?' })
    ]));

    const liste = h('div', { class: 'liste-profils' });
    profils.forEach((profil) => {
      // Zone principale cliquable (choisir le joueur) + bouton « Modifier »
      // à part (un bouton ne peut pas en contenir un autre).
      const principal = h('button', {
        class: 'carte-profil' + (profil.id === actif ? ' actif' : ''),
        onclick: () => { P.definirProfilActif(profil.id); location.hash = '#accueil'; }
      }, [
        avatar(profil),
        h('span', { texte: profil.prenom }),
        h('span', { class: 'niveau', texte: profil.niveau })
      ]);
      const modifier = h('button', {
        class: 'bouton-modifier', 'aria-label': 'Modifier le profil de ' + profil.prenom,
        onclick: () => {
          etat.profilEnEdition = profil.id;
          etat.origineEditionProfil = 'profils';
          location.hash = '#modifier-profil';
        }
      }, [h('span', { 'aria-hidden': 'true', texte: '✏️' })]);
      liste.appendChild(h('div', { class: 'ligne-profil' }, [principal, modifier]));
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

  /* ---------- Vue : modification / suppression d'un profil ---------- */

  // Où revenir après #modifier-profil : origine 'parent' -> tableau de bord,
  // sinon (par défaut) -> écran de sélection des profils (comportement historique).
  function retourApresEditionProfil() {
    const destination = etat.origineEditionProfil === 'parent' ? '#parent' : '#profils';
    etat.profilEnEdition = null;
    etat.origineEditionProfil = null;
    location.hash = destination;
  }

  function vueModifierProfil(conteneur) {
    const profil = P.lireProfils().find((p) => p.id === etat.profilEnEdition);
    // Profil introuvable (ex. supprimé entre-temps) : on revient à la sélection.
    if (!profil) { retourApresEditionProfil(); return; }

    const vue = h('div', { class: 'vue' });
    vue.appendChild(h('div', { class: 'entete-enfant' }, [
      h('h1', { texte: 'Modifier le profil' }),
      h('p', { class: 'sous-titre', texte: 'Change le prénom ou la classe de ' + profil.prenom + '.' })
    ]));

    const champPrenom = h('input', { type: 'text', maxlength: '30', value: profil.prenom, 'aria-label': 'Prénom' });
    const champNiveau = h('select', { 'aria-label': 'Classe' },
      (referentiel.niveaux || []).map((n) => {
        const opt = h('option', { value: n, texte: n });
        if (n === profil.niveau) opt.selected = true;
        return opt;
      }));

    // Sélecteur d'icône de profil : lettre / initiales / emoji au choix. État
    // local (comme prénom/classe) : rien n'est écrit tant que « Enregistrer »
    // n'est pas cliqué. La prévisualisation suit le prénom en cours de saisie.
    let iconeChoisie = profil.icone || 'initiale';
    const selecteurIcone = h('div', { class: 'champ-edition selecteur-icone' });
    function rendreSelecteurIcone() {
      selecteurIcone.textContent = '';
      const typeActuel = iconeChoisie === 'initiale' || !iconeChoisie ? 'initiale'
        : iconeChoisie === 'initiales' ? 'initiales' : 'emoji';
      const contenuApercu = contenuIcone({ prenom: champPrenom.value, icone: iconeChoisie });
      const apercu = h('span', { class: 'avatar avatar-apercu' + (contenuApercu.length > 1 ? ' avatar-texte-double' : '') },
        []);
      apercu.textContent = contenuApercu;

      const options = [['initiale', 'Une lettre'], ['initiales', 'Initiales'], ['emoji', 'Emoji']].map(([type, libelle]) =>
        h('button', { type: 'button', class: 'option-type-icone' + (typeActuel === type ? ' active' : ''),
          texte: libelle,
          onclick: () => {
            if (type === 'emoji') { if (typeActuel !== 'emoji') iconeChoisie = EMOJIS_PROFIL[0]; }
            else iconeChoisie = type;
            rendreSelecteurIcone();
          } }));

      selecteurIcone.appendChild(h('span', { texte: 'Icône du profil' }));
      selecteurIcone.appendChild(h('div', { class: 'rangee-apercu-type' }, [apercu, h('div', { class: 'options-type-icone' }, options)]));

      if (typeActuel === 'emoji') {
        selecteurIcone.appendChild(h('div', { class: 'grille-emoji' }, EMOJIS_PROFIL.map((emoji) =>
          h('button', { type: 'button', class: 'case-emoji' + (iconeChoisie === emoji ? ' active' : ''),
            'aria-label': 'Choisir cet emoji', texte: emoji,
            onclick: () => { iconeChoisie = emoji; rendreSelecteurIcone(); } }))));
      }
    }
    rendreSelecteurIcone();
    champPrenom.addEventListener('input', rendreSelecteurIcone);

    const boutonEnregistrer = h('button', { class: 'bouton-principal', texte: 'Enregistrer',
      onclick: () => {
        if (!champPrenom.value.trim()) { champPrenom.focus(); return; }
        // Met à jour le profil : si c'est le profil actif et que sa classe
        // change, l'écran de choix des jeux ré-appliquera le filtre au nouveau
        // niveau (niveau recalculé à chaque rendu depuis profilActif()).
        P.modifierProfil(profil.id, champPrenom.value, champNiveau.value, iconeChoisie);
        retourApresEditionProfil();
      } });
    const boutonAnnuler = h('button', { class: 'bouton-secondaire', texte: 'Annuler',
      onclick: retourApresEditionProfil });

    vue.appendChild(h('div', { class: 'formulaire-profil' }, [
      h('label', { class: 'champ-edition' }, [h('span', { texte: 'Prénom' }), champPrenom]),
      h('label', { class: 'champ-edition' }, [h('span', { texte: 'Classe' }), champNiveau]),
      selecteurIcone,
      boutonEnregistrer,
      boutonAnnuler
    ]));

    // Zone « danger », visuellement à part : suppression définitive.
    vue.appendChild(h('div', { class: 'zone-danger' }, [
      h('p', { class: 'zone-danger-note',
        texte: 'La suppression efface définitivement ce profil et toutes ses données.' }),
      h('button', { class: 'bouton-supprimer-profil', texte: '🗑 Supprimer ce profil',
        onclick: () => ouvrirModaleSuppression(profil) })
    ]));

    conteneur.appendChild(vue);
  }

  /*
   * Modale de confirmation de suppression : deux boutons nettement différenciés
   * (« Annuler » mis en avant, « Supprimer définitivement » en couleur d'alerte).
   * Ton bienveillant mais message clair sur l'irréversibilité (CHARTE.md).
   */
  function ouvrirModaleSuppression(profil) {
    const conteneur = document.getElementById('application');
    const fond = h('div', { class: 'modale-fond' });
    function fermer() { fond.remove(); }

    const boite = h('div', { class: 'modale-boite', role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': 'modale-suppr-titre' }, [
      h('h3', { class: 'modale-titre', id: 'modale-suppr-titre', texte: 'Supprimer ce profil ?' }),
      h('p', { class: 'modale-texte',
        texte: 'Supprimer le profil de ' + profil.prenom + ' ? Toutes ses données seront ' +
          'définitivement perdues : parties jouées, étoiles, progression enregistrée. ' +
          'Cette action est irréversible.' }),
      h('div', { class: 'modale-actions' }, [
        h('button', { class: 'bouton-modale-annuler', texte: 'Annuler', onclick: fermer }),
        h('button', { class: 'bouton-modale-danger', texte: 'Supprimer définitivement',
          onclick: () => {
            // Retire le profil + toutes ses sessions ; réassigne le profil actif
            // (profil restant, ou « aucun profil actif » si c'était le dernier).
            P.supprimerProfil(profil.id);
            fermer();
            retourApresEditionProfil(); // hashchange -> rendre() (écran d'origine)
          } })
      ])
    ]);
    fond.appendChild(boite);
    fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });
    conteneur.appendChild(fond);
  }

  /* ---------- Vue : accueil / index des jeux (enfant) ---------- */

  function modulesFiltres(niveauxSelectionnes, filtreDomaine) {
    const recherche = normaliser(etat.recherche.trim());
    return (referentiel.modules || []).filter((m) => {
      // Entrées de BACKLOG (module planifié, sans fichier de jeu) : présentes
      // dans le référentiel pour le pilotage, jamais proposées à l'enfant —
      // une carte sans jeu associé ne mènerait nulle part.
      if (!m.fichier) return false;
      // Union des niveaux cochés : un module correspond dès qu'il couvre AU
      // MOINS UN des niveaux sélectionnés. Un module adaptatif (§15) compte
      // pour CHACUN des niveaux qu'il couvre.
      if (!niveauxModule(m).some((n) => niveauxSelectionnes.indexOf(n) !== -1)) return false;
      if (filtreDomaine && filtreDomaine !== 'tous' && m.domaine !== filtreDomaine) return false;
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
      h('span', { class: 'badge badge-niveau', texte: libelleNiveauxModule(module) }),
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

  // Libellé compact du bouton fermé du menu Niveau, pour que l'état actif soit
  // visible sans avoir à rouvrir le menu (ex. « Mon niveau », « Tous les
  // niveaux », « CP, CE2 », « 3 niveaux »).
  function libelleNiveauxSelectionnes(niveauxSelectionnes, niveauProfil, niveauxDisponibles) {
    if (niveauxSelectionnes.length === niveauxDisponibles.length) return 'Tous les niveaux';
    if (niveauxSelectionnes.length === 1) {
      return niveauxSelectionnes[0] === niveauProfil ? 'Mon niveau' : 'Niveau ' + niveauxSelectionnes[0];
    }
    if (niveauxSelectionnes.length === 2) return niveauxSelectionnes.join(', ');
    return niveauxSelectionnes.length + ' niveaux';
  }

  function vueAccueil(conteneur) {
    const profil = P.profilActif();
    const niveauProfil = profil && profil.niveau ? profil.niveau : null;
    const idProfil = profil ? profil.id : null;

    // Filtres « niveaux affichés » et « domaine » : lus depuis l'état de
    // session (persistent au retour d'un jeu, réinitialisés à l'accès à l'écran
    // des profils — cf. reinitialiserFiltres dans vueProfils).
    const niveauxDisponibles = referentiel.niveaux || [];
    const niveauxSelectionnes = niveauProfil ? lireNiveauxSelectionnes(idProfil) : niveauxDisponibles;
    const filtreDomaine = lireFiltreDomaine(idProfil);

    const vue = h('div', { class: 'vue', style: 'position:relative' });

    // Icône du joueur (petite, choix libre — cf. #modifier-profil) + chevron,
    // en haut à droite : taille fixe et réduite, donc un positionnement absolu
    // reste sûr ici (contrairement à l'ancienne capsule avec le prénom en toutes
    // lettres, dont la largeur variable pouvait chevaucher le titre). Le titre
    // « Mayeutik » reste centré en grand, comme à l'origine.
    vue.appendChild(h('button', { class: 'icone-joueur',
      'aria-label': profil ? 'Changer de joueur (' + profil.prenom + ')' : 'Choisir un joueur',
      onclick: () => { location.hash = '#profils'; } },
      [profil ? avatarEnTete(profil) : h('span', { class: 'avatar avatar-entete', texte: '?' }),
       h('span', { class: 'chevron-pastille', 'aria-hidden': 'true' })]));

    vue.appendChild(h('div', { class: 'entete-enfant' }, [
      h('h1', { texte: 'Mayeutik' }),
      h('p', { class: 'sous-titre', texte: 'À quoi veux-tu jouer ?' })
    ]));

    vue.appendChild(h('input', { class: 'barre-recherche', type: 'search',
      placeholder: '🔍 Chercher un jeu…', value: etat.recherche,
      oninput: (e) => { etat.recherche = e.target.value; rendreListeJeux(); } }));

    // Filtre par niveau : DEUX contrôles complémentaires, synchronisés (même
    // source de vérité `niveauxSelectionnes`, ré-affichés ensemble à chaque
    // rendu) :
    //  - un bouton coloré à droite, raccourci à un clic pour le cas d'usage le
    //    plus courant (bascule Mon niveau ↔ Tous les niveaux) ;
    //  - un menu déroulant à gauche pour la sélection multiple fine (ex. « CP +
    //    CE2 » pour une fratrie à niveaux non contigus), simplifié dans sa
    //    présentation (plus de raccourcis internes, désormais redondants avec
    //    le bouton coloré) mais gardant sa fonction de sélection multiple.
    // (Sans niveau sur le profil, tout est affiché et ces contrôles n'ont pas lieu d'être.)
    if (niveauProfil) {
      function choisirNiveaux(niveaux, fermerMenu) {
        ecrireNiveauxSelectionnes(idProfil, niveaux);
        etat.menuNiveauxOuvert = !fermerMenu;
        rendre();
      }
      function basculerNiveau(n) {
        const actuel = new Set(niveauxSelectionnes);
        if (actuel.has(n)) {
          if (actuel.size === 1) return; // au moins un niveau doit rester coché
          actuel.delete(n);
        } else {
          actuel.add(n);
        }
        choisirNiveaux(Array.from(actuel), false);
      }

      const menuNiveaux = h('details', { class: 'menu-niveaux',
        ontoggle: (e) => { etat.menuNiveauxOuvert = e.target.open; } }, [
        h('summary', { class: 'bouton-niveaux' },
          [h('span', { texte: libelleNiveauxSelectionnes(niveauxSelectionnes, niveauProfil, niveauxDisponibles) }),
           h('span', { class: 'chevron-pastille', 'aria-hidden': 'true' })]),
        h('div', { class: 'panneau-niveaux' }, [
          h('div', { class: 'cases-niveaux' }, niveauxDisponibles.map((n) => {
            const caseACocher = h('input', { type: 'checkbox', onchange: () => basculerNiveau(n) });
            caseACocher.checked = niveauxSelectionnes.indexOf(n) !== -1;
            return h('label', { class: 'case-niveau' }, [caseACocher, h('span', { texte: n })]);
          }))
        ])
      ]);
      if (etat.menuNiveauxOuvert) menuNiveaux.setAttribute('open', '');

      const tousSelectionnes = niveauxSelectionnes.length === niveauxDisponibles.length;
      const boutonRapide = h('button', { type: 'button', class: 'bouton-niveau-rapide',
        'aria-pressed': tousSelectionnes ? 'true' : 'false',
        texte: tousSelectionnes ? 'Voir seulement mon niveau' : 'Voir tous les niveaux',
        onclick: () => choisirNiveaux(tousSelectionnes ? [niveauProfil] : niveauxDisponibles.slice(), true) });

      vue.appendChild(h('div', { class: 'rangee-niveau' }, [menuNiveaux, boutonRapide]));
    }

    // Dérivé dynamiquement de la liste des domaines du référentiel (source
    // unique, la même que celle utilisée par le radar de synthèse — cf.
    // analyserProfil dans js/statuts.js) plutôt que restreint aux domaines
    // ayant déjà un module jouable : un domaine sans jeu pour l'instant
    // (ex. « Grandeurs et mesures » avant M23) reste sélectionnable, avec le
    // message « Aucun jeu trouvé » habituel s'il ne ramène rien.
    const domainesDuReferentiel = referentiel.domaines || [];
    const rangeeDomaines = h('div', { class: 'rangee-filtres' },
      domainesDuReferentiel.map((d) => [d, d]).concat([['tous', 'Tous les domaines']]).map(([valeur, libelle]) =>
        h('button', { class: 'puce-filtre puce-filtre-domaine' + (filtreDomaine === valeur ? ' active' : ''),
          texte: libelle,
          onclick: () => { ecrireFiltreDomaine(idProfil, valeur); rendre(); } })));
    vue.appendChild(rangeeDomaines);

    // Bouton « Réinitialiser les filtres » : remet niveau + domaine au défaut
    // en une action (via le point d'entrée central). Grisé s'il n'y a rien à
    // réinitialiser, pour éviter une action inutile.
    const boutonReset = h('button', { class: 'bouton-reset-filtres', type: 'button',
      texte: '↺ Réinitialiser les filtres',
      onclick: () => { reinitialiserFiltres(); rendre(); } });
    boutonReset.disabled = !filtresModifies(idProfil);
    vue.appendChild(h('div', { class: 'barre-reset' }, [boutonReset]));

    const zoneJeux = h('div', { id: 'zone-jeux' });
    vue.appendChild(zoneJeux);

    function rendreListeJeux() {
      zoneJeux.textContent = '';
      const modules = modulesFiltres(niveauxSelectionnes, filtreDomaine);
      if (!modules.length) {
        const message = niveauxSelectionnes.length < niveauxDisponibles.length
          ? 'Aucun jeu pour ' + (niveauxSelectionnes.length === 1 ? 'le niveau ' + niveauxSelectionnes[0] : 'ces niveaux')
            + ' pour l’instant — touche le menu Niveau pour en afficher d’autres.'
          : 'Aucun jeu trouvé… essaie autre chose !';
        zoneJeux.appendChild(h('p', { class: 'aucun-resultat', texte: message }));
        return;
      }
      // On regroupe par niveau (avec un titre de section) dès que PLUSIEURS
      // niveaux peuvent coexister à l'écran (2 niveaux cochés, « tous les
      // niveaux », ou profil sans niveau). Sinon, une seule grille (tout au
      // même niveau, le badge de niveau reste visible sur chaque carte).
      // Les groupes sont limités aux niveaux SÉLECTIONNÉS (dans l'ordre du
      // référentiel) : un module adaptatif qui déborde sur un niveau non
      // coché (ex. CP+CE2 cochés, module couvrant aussi CE1) ne doit pas
      // faire apparaître une section CE1 fantôme.
      const grouperParNiveau = niveauxSelectionnes.length > 1;
      const niveauxAGrouper = (referentiel.niveaux || []).filter((n) => niveauxSelectionnes.indexOf(n) !== -1);
      const groupes = grouperParNiveau
        ? niveauxAGrouper.map((n) => [n, modules.filter((m) => niveauxModule(m).indexOf(n) !== -1)]).filter(([, l]) => l.length)
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

  /*
   * Légende de l'échelle LSU (couleurs/niveaux), réutilisée telle quelle sous
   * chaque graphique du tableau de bord (radar de synthèse, chaque radar
   * détaillé, courbe de progression) plutôt qu'une seule fois en haut de
   * page — mêmes couleurs, mêmes libellés à chaque fois. `compacte` réduit
   * l'encombrement pour les emplacements répétés sous les graphiques.
   */
  function legendeEchelle(compacte) {
    return h('div', { class: 'legende-echelle' + (compacte ? ' legende-echelle-compacte' : '') },
      S.STATUTS.map((s) => h('span', {}, [
        h('span', { class: 'point-legende statut-' + s.id }),
        h('span', { texte: s.valeurRadar + ' · ' + s.libelle })
      ])));
  }

  /*
   * Bandeau de synthèse : trois compteurs (à consolider / en cours / maîtrisées)
   * recalculés à chaque rendu à partir des statuts LSU déjà calculés — aucune
   * animation de comptage, puisque ces statuts reflètent une PROGRESSION
   * CONTINUE (plusieurs jours distincts requis) et non un score du jour
   * (PRODUIT.md, section « Tableau de bord parental »).
   */
  function bandeauSynthese(competences, onClicWidget) {
    let aConsolider = 0, enCours = 0, maitrisees = 0;
    competences.forEach((c) => {
      if (c.statut.id === 'non-atteints') aConsolider++;
      else if (c.statut.id === 'partiellement') enCours++;
      else if (c.statut.id === 'atteints' || c.statut.id === 'depasses') maitrisees++;
    });
    // Boutons (pas des div) : cliquables/focusables au clavier, font défiler
    // vers la liste complète des compétences plus bas — jamais de filtrage,
    // la liste reste toujours entière à l'arrivée.
    const bloc = (classe, nombre, libelle) => h('button', { type: 'button', class: 'bloc-bandeau ' + classe,
      'aria-label': 'Voir la liste des compétences (' + nombre + ' ' + libelle.toLowerCase() + ')',
      onclick: onClicWidget }, [
      h('div', { class: 'bloc-bandeau-nombre', texte: String(nombre) }),
      h('div', { class: 'bloc-bandeau-libelle', texte: libelle })
    ]);
    return h('div', { class: 'bandeau-synthese' }, [
      bloc('bloc-bandeau-danger', aConsolider, 'À consolider'),
      bloc('bloc-bandeau-warning', enCours, 'En cours'),
      bloc('bloc-bandeau-succes', maitrisees, 'Maîtrisées')
    ]);
  }

  /*
   * Bibliothèque de conseils « Pour l'accompagner » (fiche détail), bienveillante
   * et générique — pas d'IA générative nécessaire. Clé par thème du référentiel
   * quand un conseil précis existe, sinon repli par domaine, sinon message
   * générique.
   */
  const CONSEILS_THEME = {
    'Fractions': 'Encouragez à dessiner ou à découper avant de comparer les fractions : le sens vient avant le calcul.',
    'Nombres jusqu\'à 9': 'Manipulez des objets concrets (jetons, doigts) avant de passer aux chiffres seuls.',
    'Solides': 'Proposez de manipuler de vrais objets (boîtes, balles, dés) pour retrouver les solides de la leçon.',
    'Tables de multiplication': 'Privilégiez des séances courtes et régulières plutôt que de longues révisions : la fluence se construit par petites doses répétées.'
  };
  const CONSEILS_DOMAINE = {
    'Nombres et calcul': 'Encouragez la manipulation concrète (jetons, doigts) avant l\'écriture chiffrée, et laissez le temps de poser la démarche à voix haute avant de chercher le résultat.',
    'Grandeurs et mesures': 'Reliez la notion à des mesures réelles du quotidien (cuisine, bricolage, trajets).',
    'Espace et géométrie': 'Encouragez à dessiner, plier ou manipuler des formes avant de décrire ou comparer.',
    'Organisation et gestion de données': 'Repérez ensemble des tableaux et des graphiques du quotidien (météo, résultats sportifs) pour donner du sens à la lecture de données.'
  };
  function conseilAccompagnement(c, module) {
    const theme = module && module.theme;
    return (theme && CONSEILS_THEME[theme]) || CONSEILS_DOMAINE[c.domaine] ||
      'Valorisez les progrès, même petits : la régularité compte plus que la performance d\'un jour.';
  }

  function blocFiche(titre, texte) {
    return h('div', { class: 'fiche-bloc' }, [
      h('h4', { texte: titre }),
      h('p', { texte: texte })
    ]);
  }

  function accordSingulierPluriel(n, mot) {
    return n + ' ' + mot + (n > 1 ? 's' : '');
  }

  /*
   * Fiche détail d'une compétence : ouverte depuis un axe du radar détaillé ou
   * une ligne de la liste des compétences (côté parent). Reformule la logique
   * des fiches de restitution Repères pour une progression CONTINUE (jamais de
   * « score du jour ») — cf. PRODUIT.md, section « Tableau de bord parental ».
   */
  function ouvrirFicheDetail(c, profilId) {
    const conteneur = document.getElementById('application');
    const module = moduleParId(c.moduleId);
    const sessionsComp = P.sessionsDuProfil(profilId)
      .filter((s) => s.module === c.moduleId && s.competence === c.competenceId);

    const fond = h('div', { class: 'modale-fond' });
    function fermer() { fond.remove(); }

    const blocs = h('div', { class: 'fiche-blocs' });

    blocs.appendChild(blocFiche('Pourquoi cet exercice',
      'Ce jeu entraîne la compétence « ' + c.libelle + ' »' +
        (module && module.description ? '. ' + module.description : '.')));

    const lecture = S.lectureResultat(sessionsComp);
    blocs.appendChild(blocFiche('Lecture du résultat',
      lecture
        ? accordSingulierPluriel(lecture.nbReussies, 'session') + ' réussie' + (lecture.nbReussies > 1 ? 's' : '') +
          ' sur les ' + accordSingulierPluriel(lecture.nbSessions, 'dernière') +
          ', réparties sur ' + accordSingulierPluriel(lecture.nbJoursDistincts, 'jour') + ' distinct' + (lecture.nbJoursDistincts > 1 ? 's' : '') + '.'
        : 'Aucune partie enregistrée pour cette compétence pour l’instant.'));

    blocs.appendChild(blocFiche('Ce qu’il faut savoir',
      'Maîtriser cette compétence, c’est être capable de : « ' + c.libelle + ' ».'));

    blocs.appendChild(blocFiche('Pour l’accompagner', conseilAccompagnement(c, module)));

    const blocCourbe = h('div', { class: 'fiche-bloc' }, [h('h4', { texte: 'Évolution dans le temps' })]);
    const courbe = S.courbeProgression(sessionsComp);
    if (!courbe.assezDeDonnees) {
      blocCourbe.appendChild(h('p', { class: 'vide-section',
        texte: 'Pas encore assez de parties pour voir une tendance.' }));
    } else {
      // Même carte (bordure) que les radars, pour un habillage cohérent.
      const cadreCourbe = h('div', { class: 'cadre-radar' });
      cadreCourbe.appendChild(R.dessinerCourbe({ points: courbe.points, parSemaine: courbe.parSemaine }));
      cadreCourbe.appendChild(h('p', { class: 'aide-radar',
        texte: courbe.parSemaine
          ? 'Taux de réussite, semaine après semaine.'
          : 'Taux de réussite, partie après partie (encore trop peu de semaines distinctes pour un regroupement hebdomadaire).' }));
      blocCourbe.appendChild(cadreCourbe);
      blocCourbe.appendChild(legendeEchelle(true));
    }
    blocs.appendChild(blocCourbe);

    const boite = h('div', { class: 'modale-boite modale-fiche', role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': 'fiche-titre' }, [
      h('div', { class: 'fiche-entete' }, [
        h('span', { class: 'fiche-picto', 'aria-hidden': 'true', texte: pictoCompetence(c) }),
        h('div', { class: 'infos-titre' }, [
          h('h3', { class: 'modale-titre', id: 'fiche-titre', texte: c.libelle }),
          h('div', { class: 'details', texte: c.moduleTitre })
        ])
      ]),
      badgeStatut(c.statut),
      blocs,
      h('button', { class: 'bouton-modale-annuler', texte: 'Fermer', onclick: fermer })
    ]);
    fond.appendChild(boite);
    fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });
    conteneur.appendChild(fond);
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

    /* Outils : choix du profil suivi + filtre de niveau — première chose visible
       après la mention légale, avant tout bloc de récapitulatif (bandeau, radar). */
    const selectProfil = h('select', { 'aria-label': 'Profil suivi',
      onchange: (e) => { P.definirProfilActif(e.target.value); rendre(); } },
      profils.length
        ? profils.map((p) => {
            const opt = h('option', { value: p.id, texte: p.prenom });
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
      h('div', { class: 'champ-select' }, [
        h('label', { texte: 'Enfant suivi' }),
        h('div', { class: 'select-enveloppe' }, [selectProfil])
      ]),
      h('div', { class: 'champ-select' }, [
        h('label', { texte: 'Niveau' }),
        h('div', { class: 'select-enveloppe' }, [selectNiveau])
      ])
    ]));

    /* Bandeau de synthèse : à consolider / en cours / maîtrisées (au-dessus du radar).
       Cliquer un widget fait défiler vers la liste complète des compétences plus bas
       (jamais de filtrage : la liste reste entière à l'arrivée). */
    vue.appendChild(bandeauSynthese(analyse.competences, () => {
      const cible = document.getElementById('section-detail-competences');
      if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

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
        sousLibelle: d.nbCompetences ? (String(Math.round(d.valeur * 10) / 10).replace('.', ',') + ' / 4') : 'aucun module',
        infoBulle: d.nom + ' — ' + (d.nbCompetences
          ? 'moyenne ' + (String(Math.round(d.valeur * 10) / 10).replace('.', ',')) + ' / 4'
          : 'aucun module')
      })),
      max: 4,
      indexActif: nomsDomaines.indexOf(etat.domaineParent),
      onClicAxe: (i) => { etat.domaineParent = nomsDomaines[i]; rendre(); }
    }));
    cadreSynthese.appendChild(h('p', { class: 'aide-radar',
      texte: 'Touchez un domaine pour voir le détail par compétence.' }));
    sectionSynthese.appendChild(cadreSynthese);
    sectionSynthese.appendChild(legendeEchelle());
    vue.appendChild(sectionSynthese);

    /* Radars détaillés du domaine sélectionné (8 axes max par radar). */
    const duDomaine = analyse.competences.filter((c) => c.domaine === etat.domaineParent);
    const sectionDetail = h('div', { class: 'section-parent', id: 'section-detail-competences' });
    sectionDetail.appendChild(h('h2', { texte: 'Détail — ' + (etat.domaineParent || '') }));
    if (!duDomaine.length) {
      sectionDetail.appendChild(h('p', { class: 'vide-section',
        texte: 'Aucun module de ce domaine dans le référentiel' + (filtreNiveau ? ' pour le niveau ' + filtreNiveau : '') + ' pour l’instant.' }));
    } else {
      sectionDetail.appendChild(h('p', { class: 'aide-radar',
        texte: 'Touchez un axe du radar ou une compétence dans la liste pour voir le détail.' }));
      R.scinderEnRadars(duDomaine, 8).forEach((radar) => {
        sectionDetail.appendChild(h('div', { class: 'titre-radar-detail', texte: radar.titres.join(' · ') }));
        const cadre = h('div', { class: 'cadre-radar' });
        cadre.appendChild(R.dessiner({
          axes: radar.competences.map((c) => ({
            libelle: pictoCompetence(c) + ' ' + c.libelle,
            valeur: c.statut.valeurRadar,
            // Bulle d'aide : libellé complet + statut LSU (ex. « … — Atteints »).
            infoBulle: c.libelle + ' — ' + c.statut.libelle
          })),
          max: 4,
          onClicAxe: (i) => ouvrirFicheDetail(radar.competences[i], profilId)
        }));
        sectionDetail.appendChild(cadre);
        sectionDetail.appendChild(legendeEchelle(true));
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
        liste.appendChild(h('button', { class: 'ligne-competence', type: 'button',
          onclick: () => ouvrirFicheDetail(c, profilId) }, [
          h('span', { class: 'ligne-competence-picto', 'aria-hidden': 'true', texte: pictoCompetence(c) }),
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

    /* Gestion des profils : côté parent. La suppression n'est accessible que
     * depuis l'écran de modification du profil (#modifier-profil), jamais
     * directement depuis cette liste. */
    const sectionProfils = h('div', { class: 'section-parent' });
    sectionProfils.appendChild(h('h2', { texte: 'Profils' }));
    profils.forEach((p) => {
      sectionProfils.appendChild(h('div', { class: 'ligne-profil-parent' }, [
        avatar(p),
        h('span', { texte: p.prenom + ' · ' + p.niveau }),
        h('button', { class: 'bouton-modifier-profil', texte: 'Modifier',
          onclick: () => {
            etat.profilEnEdition = p.id;
            etat.origineEditionProfil = 'parent';
            location.hash = '#modifier-profil';
          } })
      ]));
    });
    if (!profils.length) {
      sectionProfils.appendChild(h('p', { class: 'vide-section',
        texte: 'Aucun profil : les parties sont enregistrées sous le profil par défaut. Créez un profil depuis l’écran d’accueil pour les adopter.' }));
    }
    vue.appendChild(sectionProfils);

    /* Outil de dev replié, tout en bas — n'apparaît jamais côté enfant. */
    vue.appendChild(sectionOutilsDev(profilId, profil));

    conteneur.appendChild(vue);
  }

  /* ---------- Outils de développement (démo du tableau de bord) ---------- */

  /*
   * Seul endroit où la coquille ÉCRIT `mayeutik-sessions` (partout ailleurs
   * elle ne fait que lire : ce sont les jeux qui écrivent). Cet outil de dev
   * fabrique des sessions réalistes, conformes au contrat v1, pour visualiser
   * le radar à différents niveaux d'acquisition sans jouer des dizaines de
   * parties. Les sessions injectées sont indiscernables de vraies parties :
   * à réserver à un profil de test.
   */
  function ecrireSessionsBrutes(sessions) {
    try {
      window.localStorage.setItem('mayeutik-sessions', JSON.stringify(sessions));
    } catch (e) {
      // stockage indisponible : l'injection ne survivra pas au rechargement.
    }
    P.invaliderCache();
  }

  /* Répartition (en poids) des statuts visés, par preset. */
  const PRESETS_DEMO = {
    debutant: { libelle: 'Débutant', poids: [['non-travaille', 35], ['non-atteints', 35], ['partiellement', 25], ['atteints', 5]] },
    intermediaire: { libelle: 'En progrès', poids: [['non-travaille', 15], ['non-atteints', 15], ['partiellement', 35], ['atteints', 30], ['depasses', 5]] },
    avance: { libelle: 'Avancé', poids: [['non-travaille', 5], ['partiellement', 15], ['atteints', 50], ['depasses', 30]] }
  };

  function tirerPondere(poids) {
    const somme = poids.reduce((acc, [, p]) => acc + p, 0);
    let seuil = Math.random() * somme;
    for (const [valeur, p] of poids) {
      seuil -= p;
      if (seuil <= 0) return valeur;
    }
    return poids[0][0];
  }

  function genererSessionsDemo(profilId, presetId) {
    const JOUR = 24 * 3600 * 1000;
    const maintenant = Date.now();
    const sessions = [];
    const alea = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    // Une session datée d'il y a `ilYaJours` jours, à une heure plausible.
    function pousser(moduleId, competenceId, score, total, ilYaJours, type) {
      const s = {
        profilId,
        module: moduleId,
        competence: competenceId,
        score,
        total,
        date: new Date(maintenant - ilYaJours * JOUR - alea(1, 9) * 3600 * 1000).toISOString(),
        duree: alea(60, 200)
      };
      if (type) { s.type = type; s.tempsImparti = 180; s.interrompu = false; }
      sessions.push(s);
    }

    (referentiel.modules || []).forEach((module) => {
      (module.competences || []).forEach((comp) => {
        const cible = tirerPondere(PRESETS_DEMO[presetId].poids);
        const T = 6;
        // Chaque branche fabrique le motif MINIMAL garantissant le statut visé
        // d'après les seuils de MayeutikStatuts (cf. js/statuts.js).
        if (cible === 'non-atteints') {
          pousser(module.id, comp.id, alea(0, 2), T, alea(5, 20));
          if (Math.random() < 0.5) pousser(module.id, comp.id, alea(1, 2), T, alea(2, 4));
        } else if (cible === 'partiellement') {
          pousser(module.id, comp.id, 3, T, alea(6, 14));
          pousser(module.id, comp.id, 4, T, alea(1, 5));
        } else if (cible === 'atteints') {
          // 3 sessions ≥ 80 % sur 3 jours distincts, dernières < 100 %
          pousser(module.id, comp.id, 5, T, 7);
          pousser(module.id, comp.id, 6, T, 4);
          pousser(module.id, comp.id, 5, T, 1);
        } else if (cible === 'depasses') {
          pousser(module.id, comp.id, 5, T, 6);
          pousser(module.id, comp.id, 6, T, 2);
          pousser(module.id, comp.id, 6, T, 1);
          if (comp.varianteDifficile) {
            // « Dépassés » exige les dernières sessions de la variante la
            // plus difficile à 100 % : on les fournit aussi.
            pousser(module.id, comp.varianteDifficile, 6, T, 2);
            pousser(module.id, comp.varianteDifficile, 6, T, 1);
          }
        }
        // cible === 'non-travaille' : aucune session.
      });
      // Une évaluation récente par module joué, pour la distinction visuelle.
      const duModule = sessions.filter((s) => s.module === module.id);
      if (duModule.length && Math.random() < 0.6) {
        const derniere = duModule[duModule.length - 1];
        pousser(module.id, derniere.competence, derniere.score, derniere.total, 0, 'evaluation');
      }
    });
    return sessions;
  }

  function sectionOutilsDev(profilId, profil) {
    const nom = profil ? profil.prenom : profilId;
    const boutons = Object.keys(PRESETS_DEMO).map((presetId) =>
      h('button', { class: 'bouton-dev', texte: PRESETS_DEMO[presetId].libelle,
        onclick: () => {
          const ok = window.confirm('Remplacer les parties de ' + nom +
            ' par un jeu de démonstration « ' + PRESETS_DEMO[presetId].libelle + ' » ?');
          if (!ok) return;
          const autresProfils = P.lireSessions().filter((s) => s.profilId !== profilId);
          ecrireSessionsBrutes(autresProfils.concat(genererSessionsDemo(profilId, presetId)));
          rendre();
        } }));
    const panneau = h('details', { class: 'outils-dev',
      ontoggle: (e) => { etat.outilsDevOuverts = e.target.open; } }, [
      h('summary', { texte: '🛠 Outils de développement' }),
      h('p', { class: 'vide-section',
        texte: 'Injecte des sessions de démonstration réalistes pour ce profil (remplace ses parties existantes), afin de visualiser le tableau de bord à différents niveaux d’acquisition.' }),
      h('div', { class: 'rangee-outils-dev' }, boutons),
      h('button', { class: 'bouton-dev bouton-dev-danger', texte: 'Vider les sessions de ce profil',
        onclick: () => {
          const ok = window.confirm('Effacer toutes les parties enregistrées de ' + nom + ' ? (irréversible)');
          if (!ok) return;
          ecrireSessionsBrutes(P.lireSessions().filter((s) => s.profilId !== profilId));
          rendre();
        } })
    ]);
    if (etat.outilsDevOuverts) panneau.setAttribute('open', '');
    return panneau;
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
    else if (route === '#modifier-profil') vueModifierProfil(conteneur);
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
