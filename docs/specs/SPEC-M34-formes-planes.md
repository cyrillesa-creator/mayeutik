# SPEC — M34 « Formes planes »

**Statut de ce document :** spécification de conception, avant production.
**Module :** `jeux/M34-formes-planes.html` — fichier unique, autonome, adaptatif CP / CE1 / CE2 (CHARTE §15).
**Domaine :** Espace et géométrie — sous-thème « La géométrie plane ».
**Source pédagogique :** programme de mathématiques du cycle 2, BO du 31 octobre 2024, application rentrée 2025 — blocs « La géométrie plane » CP, CE1, CE2 (texte intégral, objectifs d'apprentissage + exemples de réussite).

---

## 1. Position dans le sous-thème

Le sous-thème « La géométrie plane » est découpé en **trois modules par verbe**, chacun avec sa mécanique propre. Ce découpage remplace celui du backlog, dont les frontières faisaient se recouvrir M35 et M38 (même mécanique déclarée, « Tracé sur grille »).

| Module | Verbe | On y fait | On n'y fait jamais |
|---|---|---|---|
| **M34** | **Nommer et justifier** | reconnaître, décrire, justifier, réfuter | aucun tracé, aucun instrument |
| M35 | Vérifier et coder | poser un instrument, lire ce qu'il conclut, annoter | produire une figure |
| M38 | Reproduire et construire | reproduire, compléter, construire | vérifier une figure donnée |

M41 (symétrie axiale, CE2 seul) reste distinct et réutilise la rosace introduite en M34-CE2.

**Univers commun aux quatre modules : l'atelier du vitrail.** Un vitrail est un assemblage de formes planes juxtaposées partageant des côtés — c'est littéralement l'objet que le programme décrit au CP. Le thème est partagé mais chaque module a son lieu et son ambiance :

- **M34 — la table de tri.** Pièces de verre colorées, vitrail monté, lumière saturée. On parle, on ne touche pas aux outils.
- **M35 — l'atelier de contrôle.** Plan technique, trait noir sur calque, palette désaturée.
- **M38 — l'établi de montage.** Carton quadrillé puis papier uni ; la couleur revient à mesure que le vitrail se remplit.

---

## 2. Mécanique originale du module

**La justification par propriété**, qui mûrit en trois temps sur les trois paliers :

- **CP — décrire.** L'enfant dit ce qu'il voit, y compris les *relations* entre formes.
- **CE1 — justifier.** Nommer ne suffit plus : il faut désigner la propriété qui fonde le nom.
- **CE2 — réfuter.** L'enfant doit montrer *où* une affirmation se casse, puis *pourquoi*.

C'est cette montée (voir → justifier → réfuter) qui fait l'unité du module et le distingue des jeux de reconnaissance de formes existants, qui s'arrêtent tous au premier étage.

---

## 3. Palier CP

Contexte du programme : « Reconnaitre des formes planes (disque, carré, rectangle et triangle) **dans un assemblage** et dans son environnement proche », « Nommer », « Donner une première description en utilisant les termes *sommet* et *côté* ».

Point capital souvent négligé : le texte ne demande jamais de nommer une figure isolée sur fond blanc. Il demande de l'identifier **dans un assemblage** et de décrire des **relations**. Les trois mini-jeux respectent cela.

### 3.1 `cp-reconnaitre` — « La commande »

Un client commande des pièces. Le vitrail est monté à l'écran ; l'enfant touche **dans l'assemblage** toutes les pièces demandées.

- Formes : disque, carré, rectangle, triangle. Uniquement celles-là au CP.
- Les figures sont **orientées librement** (carré posé sur un sommet, triangle non isocèle, rectangle oblique) : le programme parle de reconnaissance, pas de prototypes en position canonique. C'est le principal défaut des jeux concurrents.
- Progression sur la manche : 1 forme demandée → 2 formes ensemble (« les carrés **et** les triangles »).
- Piège utile et légitime : un carré est aussi un rectangle au sens des propriétés, mais **le programme ne demande pas cette inclusion au cycle 2**. On l'évite : quand on demande « les rectangles », aucun carré ne figure dans l'assemblage.

### 3.2 `cp-relations` — « Ce que je vois »

Le cœur du palier, et le mini-jeu le plus original du module.

Deux ou trois pièces juxtaposées ou superposées ; trois phrases proposées, une seule vraie. Repris presque mot pour mot des exemples de réussite officiels :

- juxtaposition — « Il y a deux triangles qui forment un rectangle. » / « Je vois deux carrés avec un côté en commun. »
- superposition — « Il y a un triangle dans un carré. Deux sommets du triangle sont des sommets du carré. Un sommet du triangle est sur un côté du carré. »

Les distracteurs ne sont pas aléatoires : ils modifient **un seul terme** de la phrase vraie (deux carrés → deux rectangles ; un côté en commun → un sommet en commun ; deux sommets → un sommet). L'enfant doit donc écouter la phrase entière, pas repérer un mot-clé.

**Contrainte forte :** un enfant de CP ne lit pas ces phrases. Les trois propositions sont **systématiquement lues à voix haute** (CHARTE §5, Web Speech API, voix française), avec un bouton de réécoute par proposition. Sans cela, le mini-jeu devient un test de lecture. À valider en test réel : c'est le point de risque n°1 du module.

Longueur des phrases : deux propositions maximum. La phrase officielle à trois propositions (« Il y a un triangle dans un carré. Deux sommets… Un sommet… ») est découpée en deux manches successives sur la même figure.

### 3.3 `cp-decrire` — « La fiche du verrier »

Une pièce est présentée seule ; l'enfant remplit sa fiche d'atelier :

1. son nom (disque, carré, rectangle, triangle) ;
2. son nombre de **côtés** et de **sommets** — le vocabulaire exigé par le texte ;
3. pour le carré et le rectangle, désigner les côtés de **même longueur**.

Le texte ajoute : « L'élève sait donner le nombre de sommets et le nombre de côtés d'un polygone qui lui est présenté. » — donc on présente aussi, en fin de palier, des polygones **non nommés** (5 ou 6 côtés) à seulement compter. Le mot « polygone » n'est pas exigé au CP : on dit « cette pièce ».

---

## 4. Palier CE1

Ajouts du programme : cercle, triangle rectangle ; propriétés des angles et égalités de longueur pour carré et rectangle ; angles **aigu / droit / obtus** ; justification et première réfutation.

### 4.1 `ce1-reconnaitre` — « La commande de l'atelier »

Même mécanique qu'au CP, contenu enrichi : cercle, disque, triangle rectangle.

Occasion offerte par l'univers : la distinction **cercle / disque** est difficile et abstraite sur papier, mais évidente en vitrail — le *cercle* est le fil de plomb qui fait le tour, le *disque* est le verre coloré à l'intérieur. À exploiter explicitement dans la consigne et le feedback.

### 4.2 `ce1-justifier` — « Le contrôle qualité »

En deux temps sur la même figure :

1. **nommer** la figure ;
2. **choisir la propriété** qui le prouve, parmi trois — « ses quatre angles sont droits et ses quatre côtés ont la même longueur » / « ses quatre angles sont droits » / « ses côtés opposés ont la même longueur ».

Puis, en seconde moitié de manche, la réfutation simple attendue par le texte : une pièce est refusée par le contrôle, l'enfant choisit le motif — « Ce n'est pas un rectangle car l'un de ses angles n'est pas droit. »

Le texte cible explicitement l'énoncé complet des propriétés du rectangle : « quatre sommets, quatre angles droits, quatre côtés, et les côtés opposés ont la même longueur ». Une manche de synthèse fait cocher les quatre propriétés.

### 4.3 `ce1-angles` — « L'angle de la pièce »

Trois catégories : **droit**, **aigu** (plus petit qu'un angle droit), **obtus** (plus grand).

Nouveauté du programme 2025 souvent manquée : les angles sont traités en géométrie et non plus en grandeurs et mesures, et **aigu/obtus arrivent dès le CE1** — la fiche M34 du backlog ne les mentionne pas (voir §7).

Ici on **classe** un angle à l'œil ; on ne le vérifie pas à l'équerre — la vérification instrumentée appartient à M35. La frontière entre les deux modules passe exactement là. Le texte l'autorise : « L'élève sait dire qu'un angle n'est pas droit **sans équerre** quand il n'y a aucun doute. » Les angles proposés sont donc franchement aigus ou franchement obtus, jamais limites.

---

## 5. Palier CE2

Ajouts : losange ; vocabulaire polygone / quadrilatère / pentagone / hexagone ; diagonale ; longueur et largeur du rectangle ; rayon, diamètre, centre ; réfutation argumentée.

### 5.1 `ce2-vocabulaire` — « La rosace »

Une rosace de cathédrale : cercle extérieur, centre, rayons, pétales, quadrilatères, hexagone central. L'enfant désigne l'élément nommé — *le centre, un rayon, le diamètre, une diagonale de ce quadrilatère, la longueur du rectangle, la largeur*.

Puis classement par nombre de côtés : triangle / quadrilatère / pentagone / hexagone, avec le terme générique **polygone** posé comme le mot qui les englobe tous.

Cette rosace est réutilisée telle quelle par M41 comme objet d'étude de la symétrie.

### 5.2 `ce2-portrait` — « Le portrait-robot »

Le mouvement inverse de la justification : le client décrit la pièce qu'il veut par ses **propriétés**, l'enfant trouve laquelle du présentoir correspond.

- « Quatre côtés de même longueur, mais aucun angle droit. » → losange
- « Quatre côtés, quatre angles droits, mais ses côtés ne sont pas tous de même longueur. » → rectangle non carré

Le texte fixe la définition à faire émerger : « un losange a quatre sommets et quatre côtés de même longueur » ; « un quadrilatère est un polygone ayant quatre côtés et quatre sommets ».

### 5.3 `ce2-litige` — « Le litige »

Le mini-jeu signature du module. Un client affirme quelque chose de faux : « Cette pièce est un carré. » L'enfant conteste **en deux temps** :

1. **désigner l'endroit de la figure qui coince** — toucher l'angle non droit, ou les deux côtés de longueurs différentes ; la figure est zonée en régions tactiles (angles, côtés) ;
2. **nommer la propriété violée** parmi trois — « Or un carré a ses quatre angles droits. »

C'est la mécanique la plus formatrice du module : elle oblige à localiser le contre-exemple avant de l'énoncer, au lieu de deviner une raison plausible dans une liste. Elle reprend la structure d'argument du texte : *constat* + « Or… » + *propriété générale*.

Coût de production supérieur aux autres mini-jeux (zonage tactile des figures, deux temps de validation) : à prévoir dans l'effort.

---

## 6. Contraintes techniques et de charte

- **Fichier unique autonome**, SVG pur, aucune dépendance réseau, aucun moteur externe.
- **Adaptatif** (§15) : bloc JSON pédagogique structuré en `paliers` `CP` / `CE1` / `CE2` ; palier par défaut lu depuis le profil actif ; palier bonus avec effet « paquet cadeau » — attention, **deux transitions possibles** (CP→CE1 et CE1→CE2), donc indicateur `mayeutik-m34-bonus-revele` indexé par `profilId` **puis par palier cible**.
- **Lancement paramétré** (§16) : `?competence=<id>&palier=<cp|ce1|ce2>`.
- **Neuf compétences** — une par mini-jeu, conformément à §15 (la granularité du référentiel est le mini-jeu, pas le palier) : `cp-reconnaitre`, `cp-relations`, `cp-decrire`, `ce1-reconnaitre`, `ce1-justifier`, `ce1-angles`, `ce2-vocabulaire`, `ce2-portrait`, `ce2-litige`. Dans `data/referentiel.json`, champ `niveaux: ["CP","CE1","CE2"]` en plus de `niveau`.
- **Feedback d'erreur** (§18) : toujours montrer la bonne réponse, teintes exactes de la charte, pas d'essai-erreur sur place.
- **Randomisation** (§13) : position des réponses, ordre des questions, variété entre sessions.
- **Remontée en haut** à chaque changement d'écran (§17) ; **protections tactiles** (§19), `touch-action: pan-y` pour préserver le défilement vertical sur iPhone.
- **Voix** (§5) : lecture systématique des consignes et, au CP, des propositions de `cp-relations`.

---

## 7. Corrections à porter au backlog

Constatées à la lecture du texte intégral, à répercuter dans `pilotage/backlog.json` :

1. **M35 — erreur factuelle.** La note attribue au CE1 le codage des égalités de longueur. Le texte CE1 ne prévoit que « le code pour les angles droits » ; c'est le **CE2** qui ajoute « celui qui indique que des segments ont la même longueur ».
2. **M34 — omission.** Les angles **aigu et obtus** apparaissent dès le **CE1** et ne figurent pas dans le champ `competence`.
3. **M38 — périmètre trop étroit.** `anneesCouvertes` indique `CE1,CE2`, mais le CP a son propre bloc de construction (« construire un carré, un rectangle, un triangle ou un assemblage sur papier quadrillé ou pointé », compléter un rectangle dont deux côtés consécutifs sont tracés, compléter un carré dont un côté est tracé). À passer en `CP,CE1,CE2`.
4. **M38 — support.** Le **papier uni avec côtés obliques** arrive dès le **CE1**, pas au CE2 ; le CE2 y ajoute les constructions aux mesures données (rectangle 7 × 3 cm, carré de 6 cm avec cercle de rayon 4 cm centré sur un sommet, triangle rectangle de côtés 10 et 4 cm).
5. **M34 — mécanique.** Remplacer « QCM + drag & drop » par « justification par propriété (désignation dans l'assemblage + choix de la raison) ».
6. **M34 — effort.** L'estimation à 5 est basse pour neuf mini-jeux dont un à zonage tactile. Proposer **8**.

---

## 8. Points de vigilance

- **La lecture au CP.** `cp-relations` est verbal par nature. Sans lecture audio fiable, il devient inaccessible. Tester tôt sur appareil.
- **Ne pas dériver vers M35.** Dès qu'un instrument apparaît à l'écran, on est hors sujet. M34 conclut à l'œil ou par le raisonnement, jamais par la mesure.
- **Orientation des figures.** Aucun prototype en position canonique. Un carré posé sur un sommet reste un carré.
- **Inclusion carré/rectangle.** Hors programme au cycle 2 : à éviter activement dans la construction des items, pas seulement à ne pas enseigner.
- **Densité du CE2.** Le vocabulaire CE2 est très fourni. Si `ce2-vocabulaire` déborde, sortir rayon/diamètre/centre vers une manche dédiée plutôt que d'allonger les manches.
