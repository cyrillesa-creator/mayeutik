/*
 * Mayeutik — profils enfants et accès aux données partagées.
 *
 * Implémente le pattern « stockage sûr » de CHARTE.md (section 9) sur les
 * trois clés partagées du contrat de données v1 (section 11) :
 *   - mayeutik-profils      : tableau de profils (JSON)
 *   - mayeutik-profil-actif : id du profil courant, stocké en CHAÎNE BRUTE
 *   - mayeutik-sessions     : tableau de sessions écrites par les jeux (JSON)
 *
 * ATTENTION au format de mayeutik-profil-actif : les jeux (M01, M17, M36)
 * lisent la valeur brute de localStorage, sans JSON.parse. La coquille doit
 * donc y écrire l'id nu ("p1"), jamais une chaîne JSON ("\"p1\"").
 *
 * La coquille ne fait que LIRE les sessions (ce sont les jeux qui les
 * écrivent) ; elle est en revanche seule responsable des profils.
 * Expose l'espace de noms global `MayeutikProfils`.
 */
(function (global) {
  'use strict';

  const CLE_PROFILS = 'mayeutik-profils';
  const CLE_PROFIL_ACTIF = 'mayeutik-profil-actif';
  const CLE_SESSIONS = 'mayeutik-sessions';
  const PROFIL_PAR_DEFAUT = 'p1';

  /*
   * Cache mémoire = source de vérité pour la session en cours (CHARTE.md §9).
   * `null` = pas encore lu. invaliderCache() force une relecture : nécessaire
   * au retour d'un jeu (le jeu a écrit de nouvelles sessions pendant que la
   * coquille était en cache de navigation).
   */
  let cache = { profils: null, profilActif: null, sessions: null };

  function lireBrut(cle) {
    try {
      return global.localStorage.getItem(cle);
    } catch (e) {
      return null; // stockage indisponible : on fonctionne en mémoire seule
    }
  }
  function ecrireBrut(cle, valeur) {
    try {
      global.localStorage.setItem(cle, valeur);
    } catch (e) {
      // stockage indisponible : les données restent valables pour la session en cours
    }
  }

  function invaliderCache() {
    cache = { profils: null, profilActif: null, sessions: null };
  }

  /* ---------- Profils ---------- */

  function lireProfils() {
    if (cache.profils === null) {
      cache.profils = [];
      const brut = lireBrut(CLE_PROFILS);
      if (brut) {
        try {
          const analyse = JSON.parse(brut);
          if (Array.isArray(analyse)) cache.profils = analyse;
        } catch (e) {
          cache.profils = [];
        }
      }
    }
    return cache.profils;
  }

  function enregistrerProfils(profils) {
    cache.profils = profils;
    ecrireBrut(CLE_PROFILS, JSON.stringify(profils));
  }

  /*
   * Le premier profil créé prend l'id "p1" : c'est l'id par défaut qu'utilisent
   * les jeux quand aucun profil n'existe, donc les sessions jouées AVANT la
   * création du premier profil lui sont automatiquement rattachées.
   */
  function prochainId(profils) {
    let maxNumero = 0;
    profils.forEach((p) => {
      const m = /^p(\d+)$/.exec(p.id);
      if (m) maxNumero = Math.max(maxNumero, parseInt(m[1], 10));
    });
    return 'p' + (maxNumero + 1);
  }

  function creerProfil(prenom, niveau) {
    const profils = lireProfils();
    const profil = {
      id: prochainId(profils),
      prenom: String(prenom || '').trim().slice(0, 30),
      niveau: niveau || '',
      creeLe: new Date().toISOString().slice(0, 10)
    };
    enregistrerProfils(profils.concat([profil]));
    definirProfilActif(profil.id);
    return profil;
  }

  /*
   * Modifie le prénom, le niveau et/ou l'icône d'un profil existant (id et
   * date de création conservés). `icone` est optionnel (4ᵉ argument) : vaut
   * 'initiale' | 'initiales' | un emoji littéral ; omis (undefined), le
   * champ existant n'est pas touché. Renvoie le profil mis à jour, ou null
   * s'il n'existe pas. Écriture via le pattern « stockage sûr ».
   */
  function modifierProfil(id, prenom, niveau, icone) {
    const profils = lireProfils();
    const profil = profils.find((p) => p.id === id);
    if (!profil) return null;
    profil.prenom = String(prenom || '').trim().slice(0, 30);
    profil.niveau = niveau || '';
    if (icone !== undefined) profil.icone = icone;
    enregistrerProfils(profils);
    return profil;
  }

  /*
   * Minimisation RGPD : supprimer un profil supprime aussi TOUTES ses
   * sessions (aucune donnée orpheline ne subsiste).
   */
  function supprimerProfil(id) {
    const restants = lireProfils().filter((p) => p.id !== id);
    enregistrerProfils(restants);

    const sessions = lireSessions().filter((s) => s.profilId !== id);
    cache.sessions = sessions;
    ecrireBrut(CLE_SESSIONS, JSON.stringify(sessions));

    if (lireProfilActif() === id) {
      definirProfilActif(restants.length ? restants[0].id : PROFIL_PAR_DEFAUT);
    }
  }

  /* ---------- Profil actif ---------- */

  function lireProfilActif() {
    if (cache.profilActif === null) {
      cache.profilActif = lireBrut(CLE_PROFIL_ACTIF) || PROFIL_PAR_DEFAUT;
    }
    return cache.profilActif;
  }

  function definirProfilActif(id) {
    cache.profilActif = id;
    ecrireBrut(CLE_PROFIL_ACTIF, id); // chaîne brute, cf. commentaire d'en-tête
  }

  function profilActif() {
    const id = lireProfilActif();
    return lireProfils().find((p) => p.id === id) || null;
  }

  /* ---------- Sessions (lecture seule côté coquille) ---------- */

  function lireSessions() {
    if (cache.sessions === null) {
      cache.sessions = [];
      const brut = lireBrut(CLE_SESSIONS);
      if (brut) {
        try {
          const analyse = JSON.parse(brut);
          if (Array.isArray(analyse)) cache.sessions = analyse;
        } catch (e) {
          cache.sessions = [];
        }
      }
    }
    return cache.sessions;
  }

  function sessionsDuProfil(profilId) {
    return lireSessions().filter((s) => s.profilId === profilId);
  }

  global.MayeutikProfils = {
    PROFIL_PAR_DEFAUT,
    invaliderCache,
    lireProfils,
    creerProfil,
    modifierProfil,
    supprimerProfil,
    lireProfilActif,
    definirProfilActif,
    profilActif,
    lireSessions,
    sessionsDuProfil
  };
})(typeof window !== 'undefined' ? window : globalThis);
