#!/usr/bin/env node
/* ============================================================================
   sync-compas.js — recopie le moteur de compas dans les jeux, ou vérifie
   qu’aucune copie n’a dérivé.
   ----------------------------------------------------------------------------
   La charte impose des fichiers de jeu AUTONOMES : pas de <script src>, pas de
   feuille de style partagée. Le partage se fait donc par recopie — ce que le
   dépôt pratiquait déjà pour la rosace de M34 et pour le moteur d’instruments
   de M35, avec un commentaire « toute retouche ici est à reporter là-bas ».
   Un commentaire n’est pas un mécanisme. Ici, la source est
   `outils/moteur-compas.js`, les copies vivent entre deux sentinelles, et
   `--verifie` échoue si l’une d’elles ne correspond plus.

   Usage :
     node outils/sync-compas.js            recopie la source dans les jeux
     node outils/sync-compas.js --verifie  n’écrit rien, sort en erreur si dérive
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const SOURCE = path.join(RACINE, 'outils', 'moteur-compas.js');
const DEBUT = '/* <<<< MOTEUR-COMPAS — copie de outils/moteur-compas.js, ne pas éditer ici */';
const FIN = '/* MOTEUR-COMPAS >>>> */';

/* Les jeux concernés sont ceux qui portent déjà les sentinelles : on n’en
   impose à personne, on garantit seulement que les copies existantes sont
   exactes. */
function jeuxAvecSentinelles(){
  const dir = path.join(RACINE, 'jeux');
  return fs.readdirSync(dir).filter(f => f.endsWith('.html'))
    .map(f => path.join(dir, f))
    .filter(p => fs.readFileSync(p, 'utf8').includes(DEBUT));
}

function corpsSource(){
  /* On retire l’en-tête de licence/documentation du fichier source : il parle
     du rôle du fichier dans le dépôt, pas du moteur. Le reste est recopié
     tel quel, à l’indentation près. */
  const brut = fs.readFileSync(SOURCE, 'utf8');
  const i = brut.indexOf('const MoteurCompas');
  if (i < 0) throw new Error('moteur-compas.js : `const MoteurCompas` introuvable');
  return brut.slice(i).trimEnd();
}

function bloc(){
  return DEBUT + '\n' + corpsSource() + '\n' + FIN;
}

function remplacer(contenu, nouveau){
  const i = contenu.indexOf(DEBUT), j = contenu.indexOf(FIN);
  if (i < 0 || j < 0 || j < i) return null;
  return contenu.slice(0, i) + nouveau + contenu.slice(j + FIN.length);
}

function extraire(contenu){
  const i = contenu.indexOf(DEBUT), j = contenu.indexOf(FIN);
  if (i < 0 || j < 0 || j < i) return null;
  return contenu.slice(i, j + FIN.length);
}

const verifie = process.argv.includes('--verifie');
const attendu = bloc();
const fichiers = jeuxAvecSentinelles();
let derives = 0, ecrits = 0;

if (!fichiers.length) {
  console.log('Aucun jeu ne porte encore les sentinelles du moteur de compas.');
  process.exit(0);
}
fichiers.forEach(p => {
  const contenu = fs.readFileSync(p, 'utf8');
  const actuel = extraire(contenu);
  const nom = path.basename(p);
  if (actuel === attendu) { console.log('OK      ' + nom); return; }
  if (verifie) { console.log('DÉRIVE  ' + nom); derives++; return; }
  fs.writeFileSync(p, remplacer(contenu, attendu));
  console.log('recopié ' + nom);
  ecrits++;
});

if (verifie && derives) {
  console.log('\n' + derives + ' copie(s) ont dérivé de outils/moteur-compas.js.');
  console.log('Lance `node outils/sync-compas.js` pour les remettre à jour.');
  process.exit(1);
}
console.log('\n' + fichiers.length + ' jeu(x) contrôlé(s)' + (ecrits ? ', ' + ecrits + ' mis à jour' : '') + '.');
