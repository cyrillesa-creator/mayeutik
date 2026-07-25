/*
 * Mayeutik — calcul des statuts d'acquisition (échelle LSU).
 *
 * Module PUR : aucune dépendance DOM ni stockage. Il reçoit des sessions
 * brutes (contrat de données v1, CHARTE.md section 11) et le référentiel,
 * et calcule les statuts À LA LECTURE — les statuts ne sont jamais stockés.
 *
 * Script classique (pas d'ESM) pour rester chargeable sans build ni serveur ;
 * expose l'espace de noms global `MayeutikStatuts`. L'enveloppe accepte aussi
 * `globalThis` pour permettre des tests unitaires sous Node.
 */
(function (global) {
  'use strict';

  /*
   * Seuils de l'échelle (CHARTE.md section 11). Ce sont des PARAMÈTRES de la
   * coquille : on peut les ajuster ici sans toucher aux données des jeux.
   */
  const SEUILS = {
    tauxPartiel: 0.5,          // une session ≥ 50 % → au moins « Partiellement atteints »
    tauxAtteint: 0.8,          // score minimal d'une session comptant pour « Atteints »
    nbSessionsAtteint: 3,      // nombre de sessions ≥ tauxAtteint requises
    nbJoursDistinctsAtteint: 2, // ... réparties sur au moins N jours distincts
    tauxDepasse: 1.0,          // « Dépassés » : dernières sessions à 100 %...
    nbDernieresDepasse: 2      // ... sur les N dernières sessions de la variante la plus difficile
  };

  /* Échelle ordonnée. `valeurRadar` = valeur radiale portée sur le radar (PRODUIT.md). */
  const STATUTS = [
    { id: 'non-travaille', libelle: 'Non travaillé', affichage: '—', valeurRadar: 0 },
    { id: 'non-atteints', libelle: 'Objectifs non atteints', affichage: 'Objectifs non atteints', valeurRadar: 1 },
    { id: 'partiellement', libelle: 'Partiellement atteints', affichage: 'Partiellement atteints', valeurRadar: 2 },
    { id: 'atteints', libelle: 'Atteints', affichage: 'Atteints', valeurRadar: 3 },
    { id: 'depasses', libelle: 'Dépassés', affichage: 'Dépassés', valeurRadar: 4 }
  ];
  const PAR_ID = {};
  STATUTS.forEach((s) => { PAR_ID[s.id] = s; });

  /* Mention obligatoire sur toute vue parentale (CHARTE.md / PRODUIT.md). */
  const MENTION_PARENTALE =
    'positionnement indicatif basé sur les jeux, inspiré de l’échelle du livret scolaire';

  function tauxReussite(session) {
    if (!session || !session.total) return 0;
    return session.score / session.total;
  }

  /* Jour local (AAAA-MM-JJ) d'une date ISO — pour le critère « jours distincts ». */
  function jourLocal(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const mois = String(d.getMonth() + 1).padStart(2, '0');
    const jour = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mois + '-' + jour;
  }

  function trierParDate(sessions) {
    return [...sessions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  /*
   * Bandes de lecture officielles (fiches Repères, PRODUIT.md) : quand une
   * compétence en déclare dans le référentiel ET qu'une session d'évaluation
   * existe, la bande de la DERNIÈRE évaluation prime sur les seuils
   * génériques. Format attendu dans le référentiel :
   *   "bandes": { "nonAtteints": [0, 4], "partiellement": [5, 6], "atteints": [7, 10] }
   * (bornes incluses, sur le score brut). « Dépassés » n'est pas couvert par
   * les bandes officielles : il reste calculé par les seuils génériques.
   */
  function statutDepuisBandes(bandes, session) {
    const score = session.score;
    const dans = (b) => Array.isArray(b) && score >= b[0] && score <= b[1];
    if (dans(bandes.atteints)) return 'atteints';
    if (dans(bandes.partiellement)) return 'partiellement';
    if (dans(bandes.nonAtteints)) return 'non-atteints';
    return null; // score hors bandes déclarées : on retombe sur les seuils génériques
  }

  /*
   * Statut d'UNE compétence à partir de ses sessions (déjà filtrées par
   * profil et par compétence).
   *
   * options :
   *  - sessionsVarianteDifficile : sessions de la variante la plus difficile
   *    déclarée dans le référentiel (`varianteDifficile`). Si absent, la
   *    compétence est sa propre variante la plus difficile.
   *  - bandes : bandes de lecture officielles (modules E, cf. ci-dessus).
   */
  function calculerStatut(sessions, options) {
    options = options || {};
    if (!sessions || sessions.length === 0) return PAR_ID['non-travaille'];

    const triees = trierParDate(sessions);

    // Bandes officielles : priment quand une évaluation existe.
    if (options.bandes) {
      const evaluations = triees.filter((s) => s.type === 'evaluation');
      if (evaluations.length > 0) {
        const id = statutDepuisBandes(options.bandes, evaluations[evaluations.length - 1]);
        if (id) {
          // « Dépassés » reste possible par-dessus une bande « atteints ».
          if (id === 'atteints' && estDepassee(triees, options)) return PAR_ID['depasses'];
          return PAR_ID[id];
        }
      }
    }

    // « Objectifs non atteints » : des sessions existent, mais aucune
    // n'atteint 50 % (c'est la lecture cohérente avec le critère
    // « Partiellement » = au moins une session ≥ 50 %).
    const auMoinsUnePartielle = triees.some((s) => tauxReussite(s) >= SEUILS.tauxPartiel);
    if (!auMoinsUnePartielle) return PAR_ID['non-atteints'];

    // « Atteints » : ≥ N sessions à ≥ 80 %, réparties sur ≥ 2 jours distincts.
    const bonnes = triees.filter((s) => tauxReussite(s) >= SEUILS.tauxAtteint);
    const jours = new Set(bonnes.map((s) => jourLocal(s.date)).filter(Boolean));
    const atteinte = bonnes.length >= SEUILS.nbSessionsAtteint && jours.size >= SEUILS.nbJoursDistinctsAtteint;
    if (!atteinte) return PAR_ID['partiellement'];

    return estDepassee(triees, options) ? PAR_ID['depasses'] : PAR_ID['atteints'];
  }

  /*
   * « Dépassés » : critères « atteints » remplis (vérifiés par l'appelant) +
   * les N dernières sessions de la variante la plus difficile sont à 100 %.
   * Si une variante difficile est déclarée mais n'a jamais été jouée, la
   * compétence ne peut pas être « Dépassés ».
   */
  function estDepassee(sessionsTriees, options) {
    let cibles = sessionsTriees;
    if (options.sessionsVarianteDifficile !== undefined) {
      cibles = trierParDate(options.sessionsVarianteDifficile || []);
      if (cibles.length === 0) return false;
    }
    const dernieres = cibles.slice(-SEUILS.nbDernieresDepasse);
    return dernieres.length >= SEUILS.nbDernieresDepasse &&
      dernieres.every((s) => tauxReussite(s) >= SEUILS.tauxDepasse);
  }

  /*
   * Analyse complète d'un profil : croise le référentiel et les sessions.
   *
   * Retourne :
   *  - competences : une entrée par compétence du référentiel (filtrée par
   *    niveau si `filtreNiveau` est fourni), avec statut calculé, dates et
   *    compteurs — de quoi alimenter radars, listes et recommandations.
   *  - domaines : pour le radar de synthèse, valeur moyenne par domaine
   *    (moyenne des valeurs radar des compétences du domaine).
   */
  function analyserProfil(referentiel, sessions, profilId, filtreNiveau) {
    const duProfil = (sessions || []).filter((s) => s.profilId === profilId);

    // Index module → competence → sessions (une seule passe sur les sessions).
    const parModuleEtCompetence = {};
    duProfil.forEach((s) => {
      const cle = s.module + '/' + s.competence;
      (parModuleEtCompetence[cle] = parModuleEtCompetence[cle] || []).push(s);
    });

    const competences = [];
    (referentiel.modules || []).forEach((module) => {
      // Entrées de BACKLOG (module planifié, sans fichier de jeu) : elles vivent
      // dans le référentiel pour le pilotage, mais ne peuvent produire aucune
      // session. On les exclut de l'analyse pour ne pas polluer les radars et
      // les recommandations d'axes « Non travaillé » qui ne progresseront jamais.
      if (!module.fichier) return;
      if (filtreNiveau && module.niveau !== filtreNiveau) return;
      (module.competences || []).forEach((comp) => {
        const sessionsComp = parModuleEtCompetence[module.id + '/' + comp.id] || [];
        const options = { bandes: comp.bandes };
        if (comp.varianteDifficile) {
          options.sessionsVarianteDifficile =
            parModuleEtCompetence[module.id + '/' + comp.varianteDifficile] || [];
        }
        const statut = calculerStatut(sessionsComp, options);
        const triees = trierParDate(sessionsComp);
        const derniere = triees.length ? triees[triees.length - 1] : null;
        competences.push({
          moduleId: module.id,
          moduleTitre: module.titre,
          moduleFichier: module.fichier,
          moduleIcone: module.icone,
          niveau: module.niveau,
          domaine: module.domaine,
          competenceId: comp.id,
          libelle: comp.libelle,
          statut,
          nbSessions: sessionsComp.length,
          nbEvaluations: sessionsComp.filter((s) => s.type === 'evaluation').length,
          derniereDate: derniere ? derniere.date : null,
          dernierScore: derniere ? { score: derniere.score, total: derniere.total } : null
        });
      });
    });

    // Synthèse par domaine (ordre du référentiel) pour le radar à 4 axes.
    const domaines = (referentiel.domaines || []).map((nom) => {
      const duDomaine = competences.filter((c) => c.domaine === nom);
      const somme = duDomaine.reduce((acc, c) => acc + c.statut.valeurRadar, 0);
      return {
        nom,
        nbCompetences: duDomaine.length,
        valeur: duDomaine.length ? somme / duDomaine.length : 0
      };
    });

    return { competences, domaines };
  }

  /*
   * Recommandations (PRODUIT.md) : d'abord les compétences « à consolider »
   * (Objectifs non atteints), puis « en cours » (Partiellement atteints),
   * chaque groupe trié de la plus ancienne à la plus récente dernière partie.
   */
  function recommandations(analyse, max) {
    const parAnciennete = (a, b) => String(a.derniereDate).localeCompare(String(b.derniereDate));
    const aConsolider = analyse.competences.filter((c) => c.statut.id === 'non-atteints').sort(parAnciennete);
    const enCours = analyse.competences.filter((c) => c.statut.id === 'partiellement').sort(parAnciennete);
    const liste = aConsolider.map((c) => ({ ...c, priorite: 'à consolider' }))
      .concat(enCours.map((c) => ({ ...c, priorite: 'en cours' })));
    return typeof max === 'number' ? liste.slice(0, max) : liste;
  }

  global.MayeutikStatuts = {
    SEUILS,
    STATUTS,
    MENTION_PARENTALE,
    calculerStatut,
    analyserProfil,
    recommandations,
    tauxReussite,
    jourLocal
  };
})(typeof window !== 'undefined' ? window : globalThis);
