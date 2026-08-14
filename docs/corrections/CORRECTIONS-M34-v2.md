# M34 — Corrections v2 (l'atelier du vitrail)

Corrections issues d'un test sur appareil. **Chaque point a été vérifié dans le code du dépôt** (`jeux/M34-formes-planes.html`, commit courant) : les lignes citées sont réelles, pas déduites de la spec.

Références : `docs/specs/SPEC-M34-formes-planes.md`, `docs/specs/SPEC-M34-convoyeur.md`, `CHARTE.md`.

---

## A — Correctifs partagés (cause racine)

### A1. Le vocabulaire d'une sous-consigne n'est pas borné par le palier

`sousConvoyeur(mot)` (l. 1659) est indexée sur la **forme**, jamais sur le **palier**. Les mêmes phrases servent donc au CP, au CE1 et au CE2. Conséquences constatées au CP :

- `carre` → « Quatre **angles droits** et quatre côtés de même longueur. »
- `rectangle` → « Quatre **angles droits**, et des côtés de deux longueurs. »
- `triangle` → « Toutes les pièces à trois côtés, **même celles qui ont un angle droit**. »

L'angle droit est une notion **CE1**. Le troisième cas est doublement fautif : au CP, `formesConvoyeur` vaut `['disque','carre','rectangle','triangle']` (l. 820) — **il n'y a aucun triangle rectangle sur le tapis**, la phrase renvoie donc à quelque chose d'absent.

**Le module connaît déjà ce principe et l'applique ailleurs** : « polygone » est réservé au CE2, comme « polyèdre » l'est en M36. Il n'a simplement pas été appliqué aux sous-consignes.

**Correctif demandé :** `sousConvoyeur(mot, palier)`. Le vocabulaire autorisé est celui du champ `vocabulaire` du palier, plus les termes du programme du niveau.

**Ne pas supprimer la sous-consigne au CP.** Le commentaire du code dit juste : la place est réservée pour que le tapis ne bouge pas, et la laisser vide reviendrait à réserver un blanc. Surtout, le programme CP demande explicitement de « donner une première description du carré, du rectangle, du triangle en utilisant les termes **sommet** et **côté** » — une sous-consigne bien écrite y travaille au lieu de gêner.

Formulations CP proposées, strictement dans le lexique autorisé (côté, sommet, même longueur) :

| Forme | Sous-consigne CP |
|---|---|
| triangle | Toutes les pièces à trois côtés et trois sommets. |
| carré | Quatre côtés de la même longueur. |
| rectangle | Quatre côtés et quatre sommets, comme une porte. |
| disque | Il est tout rond, sans côté ni sommet. |

Termes **interdits au CP** dans ce mini-jeu : angle, angle droit, polygone, quadrilatère, diagonale. Ajouter un test qui échoue si une sous-consigne de palier CP contient l'un d'eux — le garde-fou vaut mieux que la vigilance, comme pour le codage CE1 de M35.

### A2. Une exigence de désignation doit être un MINIMUM, pas un compte exact

`selectionSatisfait` (l. 1884) commence par `if (choisies.length !== total) return false;`. Pour le losange, `exigences = [{parmi:nonDroits, nb:1}]` : **toucher deux angles non droits est refusé**, alors que chacun est un contre-exemple valable et qu'en toucher plusieurs est mathématiquement irréprochable.

C'est le même défaut que la validation A1 de la revue précédente, sous une autre forme : la cible est bien décrite comme un ensemble, mais la **quantité** est figée.

**Règle demandée**, valable pour toute désignation multiple du module :

1. toute zone choisie doit appartenir à **au moins un** groupe d'exigence ; une zone hors groupe invalide la réponse ;
2. chaque exigence doit recevoir **au moins** `nb` zones ;
3. aucun plafond.

Cette règle traite correctement les deux cas sans les distinguer : sur le losange, un à quatre angles non droits conviennent ; sur le rectangle, deux longs sans aucun court restent refusés, parce que l'exigence « au moins un court » n'est pas satisfaite — et c'est juste, deux côtés égaux ne prouvent rien.

Mettre à jour la sous-consigne en conséquence : « Touche **au moins un** angle qui ne va pas. »

### A3. L'anti-redondance ne porte pas sur le couple (figure, affirmation)

Dans `qLitige` (l. 1693), `const cas = i % 2 === 0 ? 'rectangle' : 'losange'` et l'affirmation du client est **toujours** « cette pièce est un carré ». Sur cinq manches : rectangle, losange, rectangle, losange, rectangle. Trois manches identiques dans leur structure.

`tirerSansRepetition` est utilisé ailleurs (rosace, portrait, fiche du verrier) mais pas ici.

**Correctif :** élargir la banque à des couples (figure, affirmation contestée) tous distincts, et les tirer sans répétition. Le programme CE2 en fournit largement de quoi remplir cinq manches :

| Affirmation du client | Pièce réelle | Ce qui coince |
|---|---|---|
| « c'est un carré » | rectangle | deux côtés inégaux |
| « c'est un carré » | losange | angles non droits |
| « c'est un rectangle » | losange ou parallélogramme | angles non droits |
| « c'est un losange » | rectangle non carré | côtés inégaux |
| « c'est un triangle rectangle » | triangle scalène | aucun angle droit |
| « c'est un quadrilatère » | pentagone | cinq côtés |

Le validateur d'items relira comme d'habitude que la propriété violée l'est bien sur la figure engendrée.

---

## B — Corrections par mini-jeu

### B1. `cp-reconnaitre` / `ce1-reconnaitre` — « Les pièces de verre » : retour à l'assemblage

**Ce n'est pas une évolution, c'est un retour à la spec.** `SPEC-M34-formes-planes.md` §3.1 dit : « Le vitrail est monté à l'écran ; l'enfant touche **dans l'assemblage** toutes les pièces demandées. » Or `assemblageCommande` (l. 1124) se termine par `poserEnGrille(liste, {cols:3, taille:76})` — les pièces sont posées **en grille**, isolées les unes des autres. Le nom de la fonction dit assemblage, son corps fait une grille.

Conséquence exacte de ce que le test a montré : **le mini-jeu fait la même chose que le convoyeur**, en plus lent. Et l'exigence la plus riche du programme CP — reconnaître « dans un assemblage » — n'est couverte nulle part.

**Correctif :** produire de vrais assemblages type puzzle / tangram.

- Les pièces **partagent un côté entier** et ne se chevauchent jamais. C'est déjà la règle appliquée dans M38 pour les assemblages CP ; reprendre le même invariant et le vérifier au validateur (deux pièces adjacentes partagent exactement deux sommets consécutifs).
- Un contact par un **seul sommet** ne fait pas un assemblage — c'était l'un des deux défauts corrigés dans M38, ne pas le réintroduire.
- L'enfant touche **toutes** les pièces du type demandé, puis Vérifier. Ce mécanisme existe déjà (`rendreReconnaitre`, l. 2229) et n'est pas à refaire.
- **Ne pas afficher le nombre de pièces à trouver.** L'exhaustivité fait partie de la compétence ; annoncer « il y en a 3 » la remplace par un décompte. Le bouton Vérifier suffit, et le retour §18 montre déjà ce qui manquait en pointillé vert.
- L'inclusion carré ⊂ rectangle reste évitée activement (déjà fait, l. 1124).

**Cas du cercle et du disque au CE1.** Un disque ne pave pas. La manche cercle/disque (l. 1364) doit rester hors assemblage — un vitrail de type rosace, avec des disques **sertis** dans l'assemblage plutôt qu'assemblés à lui. À traiter comme une exception assumée et documentée, pas comme un oubli.

### B2. `cp-decrire` — « La fiche du verrier » : 8 questions

`nbQuestions: 5` → `8` (l. 830).

Le total de points est calculé depuis la file (`total = file.reduce(...)`, l. 2058) : **aucun barème n'est à recalculer**, le contrat §11 n'impose pas de total fixe.

Point de vigilance : le générateur (l. 1411) alterne côtés/sommets sur des nombres tous différents (3, 4, 5, 6). Huit questions consomment exactement les 4 nombres × 2 types. Le stock est donc juste suffisant — vérifier que `tirerSansRepetition` ne s'épuise pas en cours de file, sinon élargir la banque de formes.

### B3. `ce1-justifier` — renommage et 8 questions

- Titre : « Le contrôle qualité » → **« Propriétés des pièces »** (l. 845).
- `nbQuestions: 5` → `8`.

Vérifier que la banque d'assertions (`ASSERTIONS_CARRE` et suivantes) fournit huit manches sans répétition ; l'élargir si nécessaire.

### B4. `ce2-litige` — « Le litige »

Voir **A2** (exigences au minimum) et **A3** (redondance). En plus :

**B4.1 — Les marqueurs de sélection sont peu lisibles.** La classe `.sel` doit se distinguer nettement de la figure. Contrainte de charte à respecter : **ni vert ni rouge**, réservés au juste et au faux (§18) — c'est la même leçon que le marqueur orange sur verre orange corrigé à la revue précédente. Une teinte franche du système, doublée d'un halo blanc pour rester lisible sur les huit verres.

**B4.2 — Ajouter un bouton Annuler.** Un retour arrière **avant validation** ne contrevient pas au §18, qui interdit l'essai-erreur **après** : c'est exactement le raisonnement déjà retenu dans M38 pour la pose de sommets. Deux gestes suffisent — retoucher une zone la désélectionne (comportement de `rendreReconnaitre`), et un bouton « Effacer ma sélection » remet tout à zéro. Le bouton se verrouille avec le reste à la validation.

**B4.3 — Le retour de l'étape 2 ne doit pas dépendre de l'étape 1.** `rendreLitigeEtape2` (l. 2355) appelle `terminerManche(q._ok1 && bon, …)`, et `terminerManche` affiche « Presque ! » dès que son premier argument est faux. Un enfant qui **désigne mal mais justifie juste** lit donc « Presque ! » sur une réponse correcte.

C'est la même erreur que celle corrigée en M35 B10 : mélanger deux compétences dans un seul retour empêche l'enfant de savoir laquelle lui a manqué. Ici elles sont explicitement distinctes — localiser le contre-exemple, puis énoncer la propriété — et elles sont même notées séparément (1 point + 2 points).

**Correctif :** le message de l'étape 2 ne juge que l'étape 2. Le score reste la somme des deux (`q._pts`, déjà en place), et la pastille de progression peut refléter les points obtenus plutôt qu'un booléen. Idéalement, le retour final nomme les deux : « Bonne raison ! Mais l'endroit qui coince était ailleurs. »

---

## C — Ordre de traitement

1. **A2** puis **A3** — le litige est le mini-jeu le plus touché, et ces deux correctifs sont dans le générateur et le validateur.
2. **A1** avec son test de vocabulaire — indépendant, rapide.
3. **B1** — le plus gros morceau : générateur d'assemblages contigus + invariant de côté partagé.
4. **B2**, **B3**, **B4.1**, **B4.2**, **B4.3** — locaux.

Après A2 et B1, retester sur appareil avant d'attaquer le reste.
