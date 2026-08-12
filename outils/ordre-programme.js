#!/usr/bin/env node
/* ============================================================================
   ordre-programme.js — inscrit dans le référentiel le RANG PROGRAMME de chaque
   module, calculé depuis `pilotage/backlog.json`.
   ----------------------------------------------------------------------------
   L’accueil doit présenter les modules d’un niveau DANS L’ORDRE DU PROGRAMME :
   domaines dans l’ordre du BO, puis sous-thèmes, puis progression interne.
   C’est la règle la plus simple et la plus stable — elle évite d’avoir à
   rejustifier la place de chaque module à chaque ajout (cf. PRODUIT.md).

   Cet ordre existe déjà quelque part : `pilotage/backlog.json` est issu du
   fichier de pilotage et liste les 41 modules groupés par domaine puis par
   sous-thème. Le recopier à la main dans le référentiel, ce serait maintenir
   deux vérités qui divergeront. On le CALCULE donc :

     rang = 1000 × (rang du domaine)      ordre d’apparition dans le backlog
          +  100 × (rang du sous-thème)   ordre d’apparition dans son domaine
          +        (rang dans le sous-thème)

   L’ordre d’apparition suffit parce que le backlog groupe ses entrées : le
   premier « Espace et géométrie » rencontré donne la place du domaine entier.
   Aucune liste d’ordre n’est donc écrite nulle part, et un module ajouté au
   pilotage prend sa place tout seul.

   Un module absent du backlog est rangé EN FIN DE SON DOMAINE, et non en fin
   de liste : le référentiel peut porter des entrées hors pilotage, mais un
   module de calcul relégué derrière la gestion de données pour une raison
   d’intendance se lirait comme une erreur à l’écran. Le domaine se retrouve
   par `domaineProgramme`, qui porte le libellé du BO — celui du backlog.

   Usage :
     node outils/ordre-programme.js            écrit `rangProgramme` dans le référentiel
     node outils/ordre-programme.js --verifie  n’écrit rien, sort en erreur si dérive
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const BACKLOG = path.join(RACINE, 'pilotage', 'backlog.json');
const REFERENTIEL = path.join(RACINE, 'data', 'referentiel.json');
const FIN_DE_DOMAINE = 900;      // après tous les sous-thèmes connus d’un domaine
const HORS_TOUT = 9000;          // domaine lui-même inconnu du pilotage

function entrees(backlog){
  return Array.isArray(backlog) ? backlog : (backlog.modules || backlog.backlog || []);
}

/* Rang de chaque module, par identifiant. */
function rangs(){
  const liste = entrees(JSON.parse(fs.readFileSync(BACKLOG, 'utf8')));
  const domaines = [];                 // ordre d’apparition
  const themes = {};                   // domaine -> ordre d’apparition des sous-thèmes
  const compteur = {};                 // "domaine|sousTheme" -> combien déjà vus
  const par = {};
  liste.forEach(m => {
    const d = m.domaine || '', st = m.sousTheme || '';
    if (domaines.indexOf(d) < 0) domaines.push(d);
    (themes[d] = themes[d] || []);
    if (themes[d].indexOf(st) < 0) themes[d].push(st);
    const cle = d + '|' + st;
    const i = (compteur[cle] = (compteur[cle] || 0) + 1) - 1;
    par[m.id] = domaines.indexOf(d) * 1000 + themes[d].indexOf(st) * 100 + i;
  });
  return {par, domaines};
}

/* Place d’un module que le pilotage ne connaît pas : la fin de son domaine. */
function rangDeRepli(m, domaines){
  const i = domaines.indexOf(m.domaineProgramme || m.domaine);
  return i < 0 ? HORS_TOUT : i * 1000 + FIN_DE_DOMAINE;
}

const {par, domaines} = rangs();
const brut = fs.readFileSync(REFERENTIEL, 'utf8');
const ref = JSON.parse(brut);
const verifie = process.argv.includes('--verifie');
let derives = 0, poses = 0;

(ref.modules || []).forEach(m => {
  const attendu = par[m.id] === undefined ? rangDeRepli(m, domaines) : par[m.id];
  if (m.rangProgramme === attendu) return;
  if (verifie) {
    console.log('DÉRIVE  ' + m.id + ' : rangProgramme ' + m.rangProgramme + ', attendu ' + attendu);
    derives++;
    return;
  }
  m.rangProgramme = attendu;
  poses++;
});

if (verifie) {
  if (derives) {
    console.log('\n' + derives + ' module(s) mal rangé(s).');
    console.log('Lance `node outils/ordre-programme.js` pour les remettre à jour.');
    process.exit(1);
  }
  console.log((ref.modules || []).length + ' module(s) contrôlé(s), aucun écart.');
  process.exit(0);
}

if (poses) fs.writeFileSync(REFERENTIEL, JSON.stringify(ref, null, 2) + '\n');
console.log((ref.modules || []).length + ' module(s) contrôlé(s)'
  + (poses ? ', ' + poses + ' mis à jour' : ', aucun changement') + '.');

/* Trace lisible de l’ordre obtenu, pour relire le résultat plutôt que le code. */
(ref.modules || []).slice().sort((a, b) => a.rangProgramme - b.rangProgramme)
  .forEach(m => console.log('  ' + String(m.rangProgramme).padStart(4) + '  '
    + m.id + '  ' + m.domaine + ' / ' + m.theme));
