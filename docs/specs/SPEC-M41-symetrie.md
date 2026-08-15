# SPEC — M41 « Symétrie axiale »

**Statut :** spécification de conception, avant production.
**Module :** `jeux/M41-symetrie.html` — fichier unique, autonome. **CE2 uniquement**, donc pas de module adaptatif : un seul palier, deux mini-jeux.
**Domaine :** Espace et géométrie — sous-thème « La géométrie plane ». Quatrième et dernier module du sous-thème.
**Compétences :** `ce2-symetrie-reconnaitre`, `ce2-symetrie-completer`.
**Source :** programme du cycle 2, BO du 31 octobre 2024 — bloc « symétrie axiale », CE2.

**Univers :** fête foraine, magie, jeux de cartes. Les quatre enseignes (cœur, carreau, pique, trèfle) sont dans le texte officiel : l'univers sort du programme, pas d'un habillage plaqué.

> **Note de coordination.** La note de M34 annonce que la rosace y sera « recopiée dans M41 le moment venu ». Cette intention est **caduque** : l'univers retenu est celui des cartes et de la magie. La rosace peut rester une figure optionnelle du jeu #1 (elle a six axes, ce qui en fait un bon cas « plusieurs axes »), mais elle n'est plus l'objet d'étude du module. Ne pas importer `construireRosace` par défaut.

---

## 1. Le trou de conformité à combler d'emblée

L'énoncé de conception dit : « chaque représentation a au moins un axe de symétrie ». **Cela vide la compétence de sa moitié.**

Le programme demande : « **Reconnaitre SI** une figure possède un ou plusieurs axes de symétrie ». Si toute figure en a un, l'enfant n'exerce jamais le jugement — il ne fait que *localiser* un axe dont l'existence lui est acquise. Reconnaître suppose de pouvoir répondre non.

**Correctif :** environ **un tiers des figures n'ont aucun axe**, et l'enfant dispose d'un bouton « aucun axe » à côté du geste de tracé. Il trace, ou il déclare qu'il n'y a rien à tracer.

L'alphabet fournit gratuitement le matériel, et le programme cite explicitement les lettres majuscules :

| Axes | Lettres |
|---|---|
| vertical | A, M, T, U, V, W, Y |
| horizontal | B, C, D, E, K |
| les deux | H, I, O, X |
| **aucun** | **F, G, J, L, N, P, Q, R, S, Z** |

**N, S et Z sont les meilleurs distracteurs du module** : ils ont une symétrie de rotation d'un demi-tour et aucun axe. C'est exactement la confusion que les enfants font, et le calque la tranche visuellement — ce qui est le rôle que le programme lui assigne.

Autre piège à inclure, hors alphabet : le **parallélogramme** non rectangle, que beaucoup d'enfants croient symétrique.

---

## 2. Jeu #1 — « Symboles miroirs » (`ce2-symetrie-reconnaitre`)

> « L'élève repère les éventuels axes de symétrie sur des représentations planes d'objets usuels […] et **il les trace**. Il s'en assure en effectuant des pliages ou en utilisant du papier calque. »

### 2.1 Déroulé d'une manche

1. **Une figure est présentée**, seule, sur fond de table de jeu.
2. **L'enfant trace un axe au doigt**, à main levée — ou appuie sur **« aucun axe »**.
3. Le trait se régularise en droite et se prolonge de part et d'autre de la figure (voir §2.2, c'est le point délicat).
4. **Il valide**, ce qui déclenche la vérification au calque (§2.3).
5. Un calque translucide se pose sur l'une des deux moitiés. L'enfant **repasse au doigt le contour de cette moitié** ; le tracé s'inscrit sur le calque.
6. **Le calque se détache et bascule** comme une page qu'on retourne, et vient se superposer à l'autre moitié. Les traits du calque sont **plus fins et d'une autre couleur** que la figure, pour qu'on distingue ce qui vient d'où.
7. L'enfant **valide** ou **recommence**.
8. Si l'axe est juste : une **lueur parcourt le contour** puis la figure passe en couleurs.

### 2.2 Piège n° 1 — l'aimantation ne doit jamais corriger l'axe

C'est le point qui décide si le mini-jeu enseigne quelque chose.

Le trait à main levée doit être **régularisé** (transformé en droite propre, prolongée) — sinon le calque ne peut pas basculer proprement. Mais la régularisation doit porter sur **la forme du geste, jamais sur sa position** :

- **Autorisé** : ajuster le trait à une droite par les moindres carrés, le prolonger au-delà de la figure, lisser le tremblement.
- **Interdit** : rapprocher le trait de l'axe vrai le plus proche, ou l'aligner sur la verticale/l'horizontale.

Si l'application aimante vers la bonne réponse, le calque ne vérifie plus rien : il confirme un axe que le jeu a corrigé lui-même. **Toute la vérification devient du théâtre.** Un axe tracé de travers doit rester de travers, et le calque doit le révéler.

Même raison que l'aimantation de M35, qui accroche la position d'un instrument et jamais son angle : « trancher l'angle reviendrait à répondre à la place de l'enfant ».

### 2.3 Piège n° 2 — le verdict ne doit pas dépendre de la qualité du tracé

Repasser au doigt le contour d'un cœur ou d'un trèfle sur un écran de téléphone est une tâche **motrice**. Si le calque reproduit fidèlement les écarts du doigt, la superposition sera mauvaise même avec un axe juste, et l'enfant sera puni pour sa main.

**Correctif :** le tracé du doigt sert à **révéler progressivement** le contour, pas à le dessiner. Le doigt balaie, et le trait exact apparaît là où il est passé, avec une tolérance généreuse. Une fois le contour parcouru en entier, ce qui est inscrit sur le calque est le contour **idéal** de la demi-figure.

Le geste garde tout son sens — il force à parcourir la forme et à en voir le détail — sans que la précision du doigt entre dans le jugement. C'est la même distinction qu'en M38 : la décision géométrique est préservée, la motricité fine du tracé appartient au papier.

### 2.4 Plusieurs axes : « un et non l'axe »

Le programme dit « un ou **plusieurs** axes » et « il **les** trace ».

- Sur une figure à deux axes (rectangle, carreau, H, I, O, X, panneau « sens interdit »), **les deux doivent être acceptés**. C'est le principe « une et non la », déjà appliqué dans tout M34 et rappelé par la règle A2 de sa revue v2 : une exigence de désignation est un minimum, jamais un compte exact.
- Après un premier axe validé, la manche **enchaîne sur « il y en a un autre, trouve-le »**. C'est ce que le texte demande, et c'est la partie la plus formatrice.
- La consigne dit **« trace UN axe »**, jamais « l'axe ».

### 2.5 Banque de figures

Toutes issues du texte officiel, plus quelques ajouts cohérents.

| Famille | Figures | Axes |
|---|---|---|
| Cartes | cœur, pique, trèfle | 1 vertical |
| Cartes | carreau | 2 |
| Géométrie | rectangle, losange | 2 |
| Géométrie | cerf-volant | 1 |
| Géométrie | **parallélogramme** | **0 — piège** |
| Panneaux | danger (triangle), sens unique | 1 |
| Panneaux | sens interdit | 2 |
| Panneaux | stationnement interdit | 1 (le long de la barre) |
| Lettres | A, M, T, U, V, W, Y / B, C, D, E, K | 1 |
| Lettres | H, I, O, X | 2 |
| Lettres | **F, G, J, L, N, P, Q, R, S, Z** | **0** |

Les figures sont dessinées en **SVG au trait**, jamais importées : pas de dépendance réseau, et les axes se calculent depuis la géométrie plutôt que d'être déclarés à côté du dessin — principe d'écriture commun à M34, M35 et M38.

**Contrôle de données à écrire :** pour chaque figure, le nombre d'axes déclaré doit être **recalculé** depuis ses points (une figure est symétrique par rapport à une droite si l'image de chaque sommet par la réflexion appartient à la figure). Aucune figure ne doit avoir un axe non déclaré, ni l'inverse.

---

## 3. Jeu #2 — « Le monde à moitié effacé » (`ce2-symetrie-completer`)

> « Compléter, sur une feuille quadrillée ou pointée, une figure simple pour la rendre symétrique par rapport à un axe donné (l'axe étant vertical ou horizontal). »

**Histoire :** un mage a effacé une partie du monde. À l'aide de sa baguette, l'enfant reconstruit les formes effacées en respectant l'axe indiqué au milieu du quadrillage.

### 3.1 Le plan

- Quadrillage **8 de large × 10 de haut**, en **filigrane gris**.
- Axe **vertical ou horizontal**, tracé au milieu, bien visible.
- Demi-figures de 4 × 10 (axe vertical) ou 8 × 5 (axe horizontal).
- Pré-remplissage en **traits noirs épais**, complément en **bleu épais**.
- Le tracé suit les **lignes et les diagonales du quadrillage** : l'ensemble des segments possibles est fini, ce qui rend le geste au doigt praticable — le doigt balaie, le segment le plus proche s'allume.
- **Gomme** (bouton à pictogramme) et **feutre bleu** ; appui long sur le feutre → palette de couleurs.
- **Pas de bouton Valider** : la complétion déclenche l'effet.

### 3.2 Le niveau 2 est mieux posé qu'il n'en a l'air — à condition de le dire

Les trois premières manches sont un simple **report** : une moitié complète, l'autre vide.

Les trois suivantes demandent des **ajouts des deux côtés**. Une question se pose alors, et Code la manquera si elle n'est pas écrite : **si les deux moitiés sont incomplètes, qu'est-ce qui détermine la figure finale ?** La symétrie seule ne suffit pas — n'importe quelle paire d'ajouts en miroir donnerait une figure symétrique.

**La réponse est nette, et c'est ce qui fait la valeur du niveau 2 :**

> La figure cible est **l'union des deux moitiés**, chacune rabattue sur l'autre.

Autrement dit : ce que porte la gauche doit apparaître à droite, et ce que porte la droite doit apparaître à gauche. **Aucune moitié n'est le modèle ; le modèle est leur réunion.** L'enfant doit lire les deux côtés et les fusionner, ce qui est une tâche nettement plus riche que le report.

Deux contraintes de génération en découlent :

1. chaque moitié doit porter **au moins un segment que l'autre n'a pas**, sinon il n'y a rien à ajouter d'un côté ;
2. la figure complète doit rester **connexe et lisible** — une figure reconnaissable, pas un nuage de traits.

### 3.3 Détection de la complétion

Sans bouton Valider, la règle doit être exacte : la figure est complète quand l'ensemble des segments tracés est **exactement** l'ensemble attendu — ni moins, ni plus.

Un segment en trop **empêche** donc la complétion. C'est à cela que sert la gomme, et c'est cohérent avec le §18 : le retour arrière **avant** validation est légitime (même raisonnement qu'en M38 pour la pose de sommets), l'essai-erreur après validation ne l'est pas — ici il n'y a pas d'après.

**La couleur ne porte jamais de sens.** Un segment tracé en vert ou en rose compte comme un segment tracé ; la palette est un plaisir, pas une donnée.

**Prévoir une sortie.** Un enfant bloqué doit pouvoir passer la manche. Sans bouton Valider ni bouton Passer, une figure mal comprise enferme la partie.

### 3.4 L'effet de fin

Les pages du livre se referment l'une sur l'autre puis se rouvrent ; les traits noirs se colorient ; étincelles, puis les confettis habituels.

Sous `prefers-reduced-motion`, l'effet se réduit à un changement de couleur franc, sans mouvement de page — le signal de réussite ne doit jamais dépendre d'une animation.

---

## 4. Barème et session

Six manches par mini-jeu, **1 point par manche**, total 10 sur le contrat de session — à ajuster selon la convention du §11.

- **Jeu #1** : la manche est juste si l'axe tracé (ou le « aucun axe ») est correct. Une figure à deux axes compte pour une manche, le second axe apportant un point supplémentaire ou une étoile, au choix.
- **Jeu #2** : la manche est acquise à la complétion. Le nombre de **gommages** ne retire pas de point mais peut conditionner l'étoile — effacer fait partie du travail, se tromper dix fois est une information.

**§13 bis (tirage sans remise).** Les deux blocs du jeu #2 constituent **deux stocks distincts** — trois manches de report, trois manches de fusion — tirés indépendamment. La charte exige un stock **strictement supérieur** à la longueur de la file : il faut donc **au moins 4 figures par bloc**, 5 ou 6 de préférence. Idem pour la banque du jeu #1, où le tirage doit en outre garantir la proportion de figures sans axe (c'est une **proportion voulue**, l'une des trois exclusions du §13 bis : elle ne se tire pas par cycle).

---

## 5. Contraintes techniques

- **Fichier unique autonome**, SVG pur, aucune dépendance réseau.
- **CE2 seul** : pas de paliers, pas de paquet cadeau, pas d'onglets. Le module est plus simple que ses trois voisins.
- **Lancement paramétré** (§16) : `?competence=<id>`.
- **Tactile** (§19) : `*{touch-action:pan-y}` universel, `touch-action:none` sur les seules zones de tracé, déclaré aussi sur les enfants (la propriété ne s'hérite pas). Le geste de tracé se distingue du défilement par un **seuil de déplacement**, jamais par une temporisation.
- **Appui long sur le feutre** : neutraliser le menu contextuel et la sélection iOS (`-webkit-touch-callout:none`, `user-select:none`), sans quoi la palette entrera en conflit avec le comportement natif.
- **Feedback §18** : sur un axe faux, montrer le ou les axes réels après le verdict ; le rouge ne désigne jamais la bonne réponse.
- **`prefers-reduced-motion`** : bascule du calque et effet de pages remplacés par une transition franche.
- **Voix** (§5) : consignes lues.

---

## 6. À calibrer sur appareil

- **La taille du quadrillage.** 8 × 10 sur un écran de téléphone donne des cellules d'environ 35 px : à la limite basse pour un doigt. À mesurer avant d'écrire le reste ; si c'est trop serré, réduire la hauteur plutôt que la largeur.
- **La tolérance de balayage** du jeu #1 : assez large pour que le contour se révèle sans effort, assez étroite pour qu'on ne révèle pas la figure entière d'un geste.
- **La régularisation du trait d'axe** : elle doit produire une droite crédible sans jamais déplacer le trait vers la bonne réponse (§2.2).
- **La durée d'une partie.** Le jeu #1 enchaîne tracé, calque et bascule : six manches peuvent être longues.

---

## 7. Prompt à donner à Code

> Lis `SPEC-M41-symetrie.md` (chargé dans cette session), `CHARTE.md`, et les specs de M34, M35 et M38 déjà présentes dans `docs/specs/`.
>
> **Première action** : écris `SPEC-M41-symetrie.md` dans `docs/specs/` et commit.
>
> **Ne code rien ensuite tout de suite.** Réponds-moi d'abord sur quatre points :
>
> 1. Comment régularises-tu le trait d'axe à main levée **sans jamais le rapprocher de l'axe vrai** (§2.2) ? C'est le point qui décide si le mini-jeu enseigne quelque chose.
> 2. Comment sépares-tu le **balayage du doigt** du **contour idéal** inscrit sur le calque, pour que le verdict ne dépende jamais de la précision de la main (§2.3) ?
> 3. Comment calcules-tu la figure cible du niveau 2 du jeu #2 comme **union des deux moitiés rabattues** (§3.2), et comment garantis-tu que chaque moitié porte au moins un segment que l'autre n'a pas ?
> 4. Le contrôle de données qui **recalcule** les axes de chaque figure depuis sa géométrie, au lieu de les croire déclarés (§2.5).
>
> Puis produis dans cet ordre, avec un arrêt et un test sur iPhone entre chaque :
>
> 1. **Jeu #2 d'abord** (`ce2-symetrie-completer`) : quadrillage, tracé au doigt sur lignes et diagonales, gomme, détection de complétion. C'est le plus simple techniquement et il valide le geste de tracé sur appareil, dont le jeu #1 dépend.
> 2. **Jeu #1** (`ce2-symetrie-reconnaitre`) : banque de figures + contrôle de données, tracé d'axe, calque et bascule.
>
> Contraintes impératives : un tiers de figures **sans aucun axe**, avec N, S, Z et le parallélogramme parmi elles ; « trace **UN** axe », les deux axes acceptés quand il y en a deux ; la couleur du feutre ne porte aucun sens ; une sortie de manche existe.
>
> **Ne recopie pas la rosace de M34** : cette intention, notée dans le backlog, est caduque.

---

## 8. Modèle recommandé

**Opus 5 en `effort: xhigh` pour le jeu #2**, qui porte le moteur de tracé au doigt sur grille — c'est là que se logent les difficultés tactiles (seuil contre défilement, accrochage au segment, appui long sans menu iOS).

**Sonnet 5 pour le jeu #1** une fois ce moteur validé : la banque de figures et le calque sont du contenu et de l'animation sur un socle éprouvé. Réserver Opus à la régularisation du trait d'axe si elle résiste.
