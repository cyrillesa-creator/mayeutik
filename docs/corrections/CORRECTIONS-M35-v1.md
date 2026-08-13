# M35 — Corrections après première production

Corrections issues d'un test réel sur appareil. **Traiter les sections A avant les sections B.**

Références : `docs/specs/SPEC-M35-verifier-coder.md`, `docs/specs/SPEC-M34-formes-planes.md`, `CHARTE.md`, `PRODUIT.md`.

---

## A — Correctifs partagés (cause racine)

### A1. Le modèle de rotation de la règle

**C'est le défaut le plus important du module. Il rend trois mini-jeux difficiles ou inutilisables :** *Le contrôle du plan*, *L'expertise*, *Le trait du verrier*.

La règle pivote actuellement **autour de son centre**. C'est le mauvais modèle : quand on veut relier deux points, on cale d'abord la règle sur l'un et on fait tourner autour de lui. Un pivot central déplace les deux extrémités à la fois et rend l'opération quasi impossible au doigt.

**Modèle demandé** — celui du compas, et celui du geste réel :

1. La règle se **translate** en glissant son corps.
2. Elle porte **deux poignées de rotation, une à chaque extrémité** (pas une seule, pas au centre).
3. Quand une extrémité s'approche d'un point, elle **s'y ancre** (aimantation visible : le point s'allume, l'extrémité s'y colle).
4. Une fois ancrée, la rotation se fait **autour de ce point d'ancrage**, exactement comme une pointe de compas plantée. L'autre extrémité balaie librement.
5. Un second point rencontré par le bord de la règle s'allume à son tour : c'est le signal que l'alignement est trouvé.

Ce modèle rend le geste « relier deux points » naturel : j'ancre sur le premier, je tourne jusqu'à ce que le second s'allume.

**À appliquer aussi au gabarit et à l'équerre** : le gabarit s'ancre par son coin sur le sommet, puis pivote autour de lui (voir B6).

### A2. Prise en main des instruments — manche d'essai sans enjeu

Signalé pour la règle, valable pour tous les instruments. Aucun instrument n'est explicable par une consigne seule.

**Ajouter une manche d'essai « pour du beurre »** à la première rencontre de chaque instrument (règle, gabarit, équerre, compas) : pas de score, pas de progression, pas de bonne réponse. Une figure, l'instrument, et une consigne qui décrit le geste. L'enfant sort quand il veut.

L'indicateur « instrument déjà découvert » est stocké par `profilId` et par instrument, pour ne pas rejouer la manche à chaque session.

C'est un motif réutilisable : à remonter dans `CHARTE.md` si le résultat est concluant, puisque M38 réutilisera les mêmes instruments.

### A3. Validité des items : la réponse attendue doit être unique

**Ce défaut est le même que celui déjà corrigé dans M34 (brief `CORRECTIONS-M34-v1.md`, section A1). Il réapparaît ici dans un autre module : le validateur n'a pas été généralisé.**

Cas signalé — *Les pointes de l'établi* : avec **trois** pointes non alignées, la tâche « replace celle qui dévie » n'a pas de réponse unique. N'importe laquelle des trois peut être considérée comme l'intruse. L'item est mathématiquement mal posé.

**Correctif :** quatre pointes, dont **trois alignées et une seule à l'écart**. L'intruse est alors unique.

**Nuance à respecter, les deux tâches n'ont pas la même exigence :**

| Tâche | Nombre de pointes |
|---|---|
| « Ces pointes sont-elles alignées ? » (jugement oui/non) | 3 suffisent |
| « Replace celle qui dévie » (désignation) | **4 obligatoires**, 3 alignées + 1 à l'écart |

**Action de fond demandée :** reprendre le validateur d'items écrit pour M34 et l'appliquer à **tous** les générateurs d'items de M35, avec son auto-test. Toute tâche de désignation doit déclarer soit une cible unique, soit l'ensemble complet des cibles acceptables.

### A4. Ordre des modules dans l'écran d'accueil

Les trois ateliers de géométrie plane doivent s'enchaîner. Plus largement : **ordonner les modules d'un niveau selon l'ordre du programme** (domaines dans l'ordre du BO, puis sous-thèmes, puis progression interne).

C'est la règle la plus simple, la plus stable et la plus défendable ; elle évite d'avoir à rejustifier l'ordre à chaque ajout de module. Décision à consigner dans `PRODUIT.md`.

Un seul point de vigilance : l'ordre du programme n'est pas toujours l'ordre des prérequis. Ici il l'est (nommer → vérifier → construire), mais si un cas de conflit apparaît, le prérequis prime et l'exception est documentée.

---

## B — Corrections par mini-jeu

### B0. M34 — `ce2-litige` : régression

Le toucher sur les figures ne répond plus. **À traiter en priorité : c'est probablement une régression introduite par le correctif A1/A2 de `CORRECTIONS-M34-v1.md`** (passage des cibles de zone unique à ensemble de zones, et refonte des zones tactiles). Vérifier que la détection au `pointerup` par `elementFromPoint` n'a pas été remplacée par un `click` que la capture de pointeur empêche d'aboutir.

### B1. `cp-alignement` — « Les pointes de l'établi »

Voir A3 : passer à quatre pointes pour les tâches de désignation.

### B2. `cp-tracer-droite` — « Le trait du verrier »

- **Énoncé incompréhensible au CP.** « Tracer le plomb » ne veut rien dire pour un enfant de 6 ans. Remplacer par : **« Trace une droite qui passe par ces deux points. »**
- **Rendu :** le trait doit **dépasser des deux points**, des deux côtés. C'est une **droite**, pas un segment — et c'est exactement le terme du programme CP (« l'élève trace une droite passant par deux points à l'aide d'une règle »). La distinction droite / segment se construit visuellement ici.
- Voir A1 pour le maniement de la règle.

### B3. `ce1-alignement` — « Le contrôle du plan »

**Bug de séquencement.** Dans la tâche « place la troisième pointe », la pointe se place **automatiquement au relâchement de la règle**. L'enfant n'a pas la main.

Séquence attendue, en deux temps distincts :
1. l'enfant cale la règle sur les deux points existants et la relâche — **rien ne se passe** ;
2. il appuie **sur le bord de la règle**, à l'endroit voulu : la pointe s'y place.

Le relâchement de l'instrument ne doit jamais valoir réponse. À vérifier partout ailleurs dans le module.

### B4. `ce1-angles` — « Le gabarit de l'atelier »

- **Consigne à expliciter.** Décrire le geste en deux temps : *cale le coin du gabarit sur le coin de la figure*, puis *utilise le bouton orange pour le faire pivoter*. Le bouton de rotation n'est pas découvrable seul.
- **Aimantation en deux temps**, cohérente avec A1 : le coin s'ancre d'abord sur le sommet ; **ensuite** le bord du gabarit se cale magnétiquement sur l'un ou l'autre des côtés de la figure pendant la rotation. Tolérance à calibrer sur appareil : elle doit aider à poser, jamais à conclure.
- Voir A2 pour la manche d'essai.

### B5. `ce1-compas` — « Le cercle des rosaces »

**Bug :** le compas ne se déclenche pas de façon fiable au début du jeu ; il faut insister. Piste : `pointerdown` non capté sur les premiers appuis (zone tactile pas encore montée, `touch-action` mal appliqué, ou premier appui consommé par le défilement). Vérifier que la zone de tracé est bien en `touch-action: none` dès le montage.

### B6. `ce1-codage` — « L'angle droit sur le plan »

**Écart à la spécification, pas une préférence.** Le marquage des côtés égaux n'a rien à faire ici : le programme **CE1** ne prévoit que « le code pour les angles droits ». Le codage des égalités de longueur est une compétence **CE2** (« le codage d'un angle droit **et celui qui indique que des segments ont la même longueur** »).

Supprimer la palette de marques de longueur au CE1. Un seul tampon : le carré d'angle droit.

### B7. `ce2-alignement` — « L'expertise »

Voir A1. Pas de correction locale supplémentaire.

### B8. `ce2-angles` — « L'équerre du contrôleur »

**Manche trop longue.** Ramener à **3 figures de 4 ou 5 angles**, soit 12 à 15 jugements. Au-delà, la tâche devient mécanique et perd son objet — qui est d'apprendre *quand* l'œil suffit, pas de vérifier vingt angles.

### B9. `ce2-compas` — « L'écartement »

Reprendre le compas nouvellement spécifié (`PROMPT-CODE-compas-rosace.md`), avec une **séquence propre au CE2**, inverse de celle du CE1 :

1. **fixer d'abord l'écartement sur une règle graduée** — c'est la compétence CE2, « un cercle de rayon 4 » ;
2. **puis appuyer pour poser la pointe** au centre ;
3. le tracé se déclenche.

Au CE1 le rayon est *dérivé* d'un point de passage (glissement) ; au CE2 il est *mesuré* d'abord. La différence est pédagogique, pas cosmétique — voir SPEC-M35 §2.

### B10. `ce2-codage` — « Le plan reporté »

> Nom divergent de la spec, où ce mini-jeu s'appelle **« Le plan certifié »**. Trancher et aligner spec, code et référentiel.

- **Annoncer la figure représentée** avant la tâche de codage.
- **Supprimer le bouton « Reporter »**, sans effet visible. Si le report de longueur au compas doit rester accessible ici (il est nécessaire pour vérifier les égalités avant de les coder, voir SPEC-M35 §5.4), il doit être **un instrument posable**, pas un bouton — sinon le retirer complètement et laisser la vérification à `ce2-compas`.

---

## C — Ordre de traitement

1. **B0** (régression M34) — bloquant, et probablement rapide.
2. **A1**, le modèle de rotation. C'est le correctif qui débloque le plus de mini-jeux.
3. **A3**, généralisation du validateur d'items.
4. **B3**, **B5**, **B6** — bugs et écart de spec, indépendants.
5. **A2** (manches d'essai), puis le reste de la section B.

Après A1, retester sur appareil avant d'aller plus loin : plusieurs points de la section B pourraient déjà avoir disparu.
