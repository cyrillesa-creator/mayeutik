# Ce qui reste à trier

Ces suites viennent d'un répertoire de travail hors dépôt, effacé deux fois par
un redémarrage de conteneur. Les **20 qui passaient telles quelles** ont été
versées dans `outils/tests/` (chemins en dur remplacés par le socle, noms mis à
la convention `<module>-<sujet>.js`). **Restent 41 suites qui échouent** — et un
échec ici ne dit pas encore si c'est le test qui est périmé ou le code qui est
cassé. Ce fichier existe pour que ce tri ne soit pas à refaire de zéro au
prochain redémarrage.

Bilan brut : `bilan.json` (produit par `trier.js`, à relancer depuis ce
répertoire).

## 1. Un fichier d'aide manquant — 17 suites, aucune ne démarre

Elles échouent en une seconde sur `Cannot find module`. Le fichier appelé
n'a jamais été copié ici ; il est perdu avec le répertoire de travail.

- `./m01_commun` — 10 suites : `test_auto_suivant_m01`, `test_m01_autant_que`,
  `test_m01_comparer_consigne`, `test_m01_denombrer`, `test_m01_drag`,
  `test_m01_etiqueter`, `test_m01_etiqueter_bidir`, `test_m01_parade`,
  `test_m01_parade2`, `test_m01_parcours`.
- `./m23_commun` — 7 suites : `test_arpentage_etiquettes`,
  `test_encadrement_balade`, `test_m23_parcours`, `test_messages`,
  `test_regle_bornes2`, `test_regle_zero`, `test_sapin`.

L'API à reconstruire se lit dans les appels : `chromium`, `creerServeur()`,
`ouvrir(browser, port, opts)` qui rend `{page, erreurs}`, `lancer(page, id)` qui
démarre un mini-jeu, et pour M23 `atteindreManche(page, selecteur, n)`.
Attention : **M01 n'a pas de lien profond `?competence=`** — `lancer` y passe
forcément par un clic sur la carte. Un helper qui devine mal ferait échouer
17 suites pour ses propres raisons, ce qui est pire que l'absence : à
reconstruire une fois, puis à vérifier suite par suite.

## 2. Dépassement du délai de 180 s — 12 suites

`test_auto_suivant_autres`, `test_construction`, `test_grand_tableau`,
`test_m15`, `test_m36_retouches`, `test_palier_priorite`,
`test_protections_tactiles`, `test_sondage`, `test_sondage_ce1`,
`test_verrouillage_paliers`, `test_voix`.

Le délai vient de `trier.js`, pas des suites : certaines des suites versées
prennent déjà 90 s à 130 s. À rejouer avec un délai plus large avant de
conclure quoi que ce soit.

## 3. Un échec nommé — à instruire une par une

- `test_ajustements9` — « L'enquête complète » est devenue « L'enquête ».
- `test_articles` — les 12 énoncés d'unité ne sont plus lus.
- `test_b8b9b10` — 25/26 : « reposer le compas le fait disparaître ».
- `test_m17_calculs_couleur` — 0 réussite éprouvée.
- `test_m36` — attend « Découverte + 3 mini-jeux CP », le module en a changé.
- `test_m36_ce2` — attend 15 identifiants de compétence, il y en a 16.
- `test_regle_zero_perimetre` — le « 0 » et l'origine.
- `test_interieur`, `test_palier_module`, `verif_bareme` — échec court, motif
  non relevé.

Un renommage de mini-jeu rend une suite périmée ; un compas qui disparaît est
un vrai signal. La différence ne se voit qu'en ouvrant chacune.

## 4. Périmé, à supprimer

- `test_m42.js` — vise `jeux/M42-solides-ce2.html`, supprimé lors de la fusion
  dans M36.

Déjà supprimés pour cette raison : `verif_gabarits.js` (copie plus ancienne de
`outils/verif-elision-gabarits.js`, sans la section sur l'accord).
