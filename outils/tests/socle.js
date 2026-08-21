/*
 * SOCLE COMMUN DES SUITES DE TEST — ce qui dépend de la MACHINE, et rien
 * d’autre.
 *
 * Les suites vivaient dans un répertoire de travail hors dépôt, avec des
 * chemins absolus codés en dur. Un redémarrage de conteneur les a effacées
 * d’un coup : quarante assertions perdues, celles-là mêmes qui avaient trouvé
 * les manches infaillibles, le blocage dès la deuxième manche et les
 * instruments jamais déplaçables. Le filet doit vivre avec le code qu’il
 * rattrape.
 *
 * Deux choses seulement varient d’une machine à l’autre — la racine du dépôt
 * et l’endroit où Playwright est installé — et elles sont ici, en un seul
 * exemplaire.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');

/* La racine se DÉDUIT de l’emplacement de ce fichier : une constante écrite à
   la main serait fausse dès le premier clone ailleurs. */
const RACINE = path.resolve(__dirname, '..', '..');

/* Playwright peut être installé dans le projet ou globalement. On essaie ce
   que Node sait résoudre, puis l’emplacement global de cet environnement. */
function chargerPlaywright(){
  const pistes = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const p of pistes) { try { return require(p); } catch (e) {} }
  throw new Error('Playwright introuvable. Essayé : ' + pistes.join(', '));
}

/* Un serveur local : les jeux sont des fichiers autonomes, mais `file://`
   n’autorise pas tout ce dont une page a besoin. */
function servir(){
  const srv = http.createServer((q, r) => {
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(p, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, {'Content-Type':
        (p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'text/html')
        + '; charset=utf-8'});
      r.end(d);
    });
  });
  return srv;
}

/* Les captures d’écran servent à REGARDER, jamais à décider : aucune n’est
   comparée, aucune ne fait échouer une suite. Elles n’ont donc rien à faire
   dans le dépôt — écrites au chemin relatif où on les avait laissées, elles
   se déposaient à la racine à chaque exécution, et l’une s’est retrouvée
   commise. */
const CAPTURES = path.join(require('os').tmpdir(), 'mayeutik-captures');
function capture(nom){
  fs.mkdirSync(CAPTURES, {recursive:true});
  return path.join(CAPTURES, nom);
}

module.exports = {RACINE, chargerPlaywright, servir, capture, CAPTURES,
  EXEC_CHROMIUM: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'};
