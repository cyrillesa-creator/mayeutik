# SPEC — « Le convoyeur de pièces » (M34)

**Statut :** spécification de conception, avant production.
**Module hôte :** `jeux/M34-formes-planes.html` — nouveau mini-jeu, décliné sur les trois paliers.
**Compétences ajoutées :** `cp-convoyeur`, `ce1-convoyeur`, `ce2-convoyeur`.
**Référence :** `docs/specs/SPEC-M34-formes-planes.md`, `CHARTE.md`.

---

## 1. Complément, pas remplacement

Le mini-jeu est demandé comme « alternative plus ludique » à *Les pièces de verre*. **Il doit être ajouté à côté, pas à la place** — et la raison tient dans une seule phrase du programme CP :

> « Reconnaitre des formes planes (disque, carré, rectangle et triangle) **dans un assemblage** et **dans son environnement proche**. »

Deux exigences distinctes dans la même phrase :

| Exigence | Mini-jeu qui la couvre |
|---|---|
| reconnaître **dans un assemblage** (formes juxtaposées, partageant des côtés) | *Les pièces de verre* — à conserver |
| reconnaître **dans l'environnement proche** (pièces isolées, en situation) | **Le convoyeur** |

Supprimer *Les pièces de verre* laisserait l'assemblage sans couverture, alors que c'est la partie la plus exigeante et la plus négligée du programme. Le convoyeur apporte autre chose, et cette autre chose est légitime : la **reconnaissance fluide et automatisée**, qui ne s'entraîne pas dans un exercice sans contrainte de temps.

M34 passe donc de 9 à 12 mini-jeux, et son effort de 8 à 11.

---

## 2. Le risque principal : mesurer la dextérité au lieu de la géométrie

Toucher un objet en mouvement est une tâche **motrice** avant d'être une tâche géométrique. Si la vitesse par défaut est trop élevée ou les pièces trop petites, le jeu cesse de mesurer ce qu'il prétend mesurer, et pénalise l'enfant lent à reconnaître exactement comme l'enfant maladroit.

Trois garde-fous, non négociables :

1. **Vitesse par défaut lente**, la plus lente des trois. Le levier de vitesse est une option que l'enfant choisit, jamais une progression imposée.
2. **Grandes cibles** : diamètre apparent minimal **80 px** (bien au-delà des 44 px recommandés pour une cible fixe — une cible mobile demande davantage).
3. **Au CP, aucune pénalité pour une pièce laissée passer.** Voir §5.

---

## 3. Mécanique commune aux trois paliers

**Décor.** Le convoyeur de l'atelier du vitrail : un tapis qui défile **horizontalement**, de droite à gauche, portant des pièces de verre colorées. Cohérent avec l'univers de M34 (table de tri, lumière saturée).

**Déroulé.**

1. Une consigne apparaît, **en gras et lue à voix haute** : « **Attrape les triangles.** »
2. Les pièces défilent. L'enfant touche celles qui correspondent.
3. Après **N** pièces correctement attrapées, la consigne change et désigne une autre forme.
4. Le jeu s'arrête quand **tous les types de formes du palier** ont été demandés, une fois chacun.

**Ordre des consignes :** aléatoire, **sans redondance** (CHARTE §13) — chaque type de forme est demandé une fois et une seule.

**Changement de consigne.** Moment critique : si l'enfant ne le remarque pas, il continue sur l'ancienne forme et cumule les erreurs sans comprendre.

Traitement demandé — **arrêt momentané de l'envoi de pièces, reprise automatique** :

1. Dès que la N-ième pièce cible est attrapée, **plus aucune pièce nouvelle n'est envoyée**. Le tapis continue de défiler à vitesse constante.
2. Les pièces encore présentes poursuivent leur course et **sortent de l'écran**. Elles ne comptent plus comme oubli : la phase est close.
3. Le tapis est vide. Brève respiration (~1 s), la nouvelle consigne apparaît en gras et **est lue à voix haute**.
4. L'envoi reprend automatiquement, sans action de l'enfant.

Le tapis vide fait la ponctuation. Avantage décisif sur un simple ralentissement : **chaque pièce appartient sans équivoque à une seule consigne** — aucune cohabitation entre l'ancienne série et la nouvelle, donc aucune ambiguïté sur ce qu'il fallait attraper. Avantage technique : la vitesse ne varie jamais, ce qui évite toute complication dans le calcul en `deltaTime`.

**Génération du flux.** Le flux n'est pas aléatoire pur : il doit **garantir** que N pièces cibles passeront pendant la phase, entrelacées de distracteurs. Proportion de cibles ≈ 1 pièce sur 3. Espacement suffisant pour qu'aucune pièce ne soit hors de portée pendant qu'une autre est touchée.

**Orientation des pièces.** Chaque pièce a une orientation **fixe et tirée au hasard** — un carré peut être posé sur un sommet. Conforme au principe de M34 : aucun prototype en position canonique. **Les pièces ne tournent pas pendant le défilement** : la rotation transformerait la tâche en exercice d'anticipation motrice.

**Piège à éviter.** Comme dans tout M34 : quand la consigne demande « les rectangles », **aucun carré ne figure sur le tapis**. L'inclusion carré ⊂ rectangle est hors programme au cycle 2, et un enfant qui touche un carré aurait mathématiquement raison.

**Retour sur erreur (CHARTE §18).** Une pièce touchée à tort s'immobilise brièvement, se marque, et **son nom est annoncé** : « C'était un rectangle. » Puis elle repart. Pas d'essai-erreur : la pièce ne peut plus être touchée.

**Levier de vitesse.** Trois crans, accessibles à tout moment, avec un habillage d'atelier (manette du convoyeur). Le cran choisi est mémorisé par `profilId`. Il influence le score (§5) mais **ne conditionne aucune progression** : on peut terminer le jeu à la vitesse la plus lente.

---

## 4. Déclinaison par palier

### 4.1 `cp-convoyeur` — quatre formes

Formes demandées : **disque, carré, rectangle, triangle**.

- **N = 3** pièces par consigne → 12 prises sur la partie.
- Vitesses : 35 / 55 / 80 px/s (viewBox de 360 de large : une pièce traverse en 10 s, 6,5 s, 4,5 s).
- Pièces laissées passer : **non pénalisées** (§5).

### 4.2 `ce1-convoyeur` — six formes

Ajouts du programme CE1 : **cercle**, **disque** distingués, **triangle rectangle**.

Formes demandées : disque, **cercle**, carré, rectangle, triangle, **triangle rectangle**.

- **N = 3** → 18 prises. Si le test montre que c'est trop long, descendre à N = 2.
- Vitesses : 45 / 70 / 100 px/s.

**Occasion offerte par l'univers :** le convoyeur rend la distinction cercle / disque immédiatement lisible — le **cercle** est un anneau de plomb vide, le **disque** est une pièce de verre pleine. Bien meilleure que toute explication verbale.

**Attention au triangle rectangle** : quand la consigne demande « les triangles », les triangles rectangles **sont** des triangles et doivent être acceptés. Quand elle demande « les triangles rectangles », seuls ceux-là comptent. C'est le seul cas d'inclusion légitime au CE1 et il doit être traité explicitement dans la validation.

### 4.3 `ce2-convoyeur` — classer par catégorie

Changement de nature, pas seulement d'inventaire. Le CE2 introduit **polygone, quadrilatère, pentagone, hexagone** : la consigne ne désigne plus une forme mais une **catégorie**, ce qui oblige à classer plusieurs formes différentes sous un même mot.

Consignes : **les quadrilatères** (carré, rectangle, losange, quadrilatère quelconque), **les triangles**, **les pentagones**, **les hexagones**, **les losanges**, **les disques**.

- **N = 3** → 18 prises.
- Vitesses : 55 / 85 / 120 px/s.

C'est la version la plus riche du mini-jeu : reconnaître un quadrilatère quelconque comme quadrilatère est nettement plus exigeant que reconnaître un carré.

**Séparation avec `ce2-vocabulaire` (la rosace).** Les deux mini-jeux ne doivent pas se recouvrir :

| Mini-jeu | Porte sur |
|---|---|
| **Le convoyeur** | **classer des figures entières** par type et par catégorie |
| **La rosace** | **désigner des éléments** d'une figure : centre, rayon, diamètre, diagonale, longueur, largeur |

La rosace est donc à recentrer sur les éléments et le lexique de position ; le classement polygone / quadrilatère / pentagone / hexagone migre vers le convoyeur, où il est mieux servi.

---

## 5. Score

Deux sources d'écart, pondérées différemment, conformément à l'intention : **l'erreur pèse plus que l'oubli**.

| Événement | Effet |
|---|---|
| Pièce cible attrapée | + 1 |
| Pièce non cible touchée (**erreur**) | − 1 |
| Pièce cible laissée passer (**oubli**) | − 0,25 (CE1, CE2) / **0** au CP |

**Pourquoi zéro au CP.** Un enfant de 6 ans qui hésite est un enfant qui réfléchit. Pénaliser l'hésitation à ce niveau enseigne la précipitation, exactement le contraire de ce que vise la reconnaissance des formes. La contrainte de temps suffit à créer l'enjeu.

**Vitesse et score.** Les crans rapides appliquent un léger coefficient favorable (× 1,1 et × 1,2) pour récompenser la prise de risque, sans jamais rendre la vitesse lente perdante.

**Fin de partie.** Bilan par forme demandée — attrapées, manquées, erreurs — pour que l'enfant et le parent voient *quelle forme* pose problème. C'est l'information utile, pas le score global.

---

## 6. Contraintes techniques

- **Boucle d'animation** en `requestAnimationFrame`, position calculée à partir du **temps écoulé** (`deltaTime`), jamais d'un incrément par image : sinon la vitesse dépend de la fréquence d'écran et diffère entre appareils.
- **Détection du toucher sur cible mobile** : au `pointerdown`, résoudre la position des pièces à l'instant du toucher, pas à la dernière image rendue. Tolérance de rattrapage : une pièce touchée à moins de ~10 px de son bord compte comme touchée.
- **Tactile** : `touch-action: none` sur la seule zone du convoyeur, `pan-y` ailleurs. Détection au `pointerup` par `elementFromPoint` uniquement si aucune capture de pointeur n'est active — sinon résolution manuelle par coordonnées. Blocage du zoom double-tap.
- **`prefers-reduced-motion`** : le défilement est l'essence du jeu et ne peut pas être supprimé. Réduire alors à la vitesse la plus lente, supprimer tout mouvement décoratif (reflets, poussière), et proposer un bouton de pause franche. Documenter cette limite.
- **Pause** : bouton d'arrêt franc toujours accessible. Un jeu chronométré sans pause est inutilisable dans une salle de classe comme à la maison.
- **Voix (§5)** : consigne lue à chaque changement, sur les trois paliers. Au CP, c'est une condition d'accès.
- **Référentiel** : trois compétences ajoutées dans `data/referentiel.json`, `niveaux: ["CP","CE1","CE2"]`. Lancement `?competence=cp-convoyeur&palier=cp`.
- **Anti-redondance (§13)** : ordre des consignes tiré sans remise ; formes et couleurs variées d'une session à l'autre.

---

## 7. À calibrer sur appareil

Rien de ce qui suit ne se décide sur le papier :

- Les **vitesses**. Les valeurs ci-dessus sont un point de départ, pas une prescription.
- La **taille des pièces** face à la vitesse : à 120 px/s, 80 px peuvent devenir insuffisants.
- La **densité du flux** : trop dense, l'écran est illisible ; trop clairsemé, l'enfant attend.
- La **durée d'une partie**. 18 prises au CE1 et CE2 est une hypothèse à vérifier — si la partie dépasse trois minutes, réduire N à 2.

---

## 8. Impact backlog

- M34 : 9 → **12 mini-jeux**, 12 compétences. Effort 8 → **11**.
- `ce2-vocabulaire` : périmètre resserré sur les éléments de figure ; le classement par catégorie part au convoyeur (§4.3).
- Mécanique M34 : ajouter « reconnaissance en flux temporisé » à la mécanique déclarée.

---

## 9. Prompt à donner à Code

> Lis `SPEC-M34-convoyeur.md` (chargé dans cette session), `docs/specs/SPEC-M34-formes-planes.md` et `CHARTE.md`.
>
> **Première action : écris `SPEC-M34-convoyeur.md` dans `docs/specs/` du dépôt et commit** (message : `docs: spec du convoyeur de pièces (M34)`). La spec doit être versionnée pour rester consultable aux sessions suivantes.
>
> **Ne code rien pour l'instant.** Résume-moi ensuite en une quinzaine de lignes le moteur de convoyeur que tu comptes écrire — boucle d'animation, génération du flux garantissant N cibles par phase, détection du toucher sur cible mobile — et liste ce que tu juges sous-spécifié. On code après validation.
>
> Ensuite, produire dans cet ordre, avec un arrêt et un test sur iPhone entre chaque :
>
> 1. **Moteur + `cp-convoyeur` seul.** C'est là que tout se joue : boucle en `deltaTime`, résolution du toucher à l'instant du `pointerdown`, `touch-action` correct, pause franche. Ne pas passer à la suite tant que toucher une pièce en mouvement n'est pas fluide et fiable sur appareil.
> 2. **Levier de vitesse et score.** Vérifier que la vitesse ne dépend pas de la fréquence d'écran.
> 3. **`ce1-convoyeur`.** Attention au cas d'inclusion : un triangle rectangle est un triangle.
> 4. **`ce2-convoyeur`.** Consignes par catégorie, et resserrage de `ce2-vocabulaire` en parallèle pour éviter le recouvrement.
>
> Contraintes impératives : aucune pénalité d'oubli au CP ; aucun carré sur le tapis quand la consigne demande les rectangles ; pièces en orientation libre mais non tournantes ; consigne lue à voix haute à chaque changement.

---

## 10. Modèle recommandé

**Étape 1 (moteur + `cp-convoyeur`) : Opus 5.** Le cœur du problème n'est pas la géométrie mais la **synchronisation entre animation et toucher sur mobile** — c'est précisément le terrain des bugs subtils : décalage entre la position rendue et la position au moment du toucher, vitesse dépendante de la fréquence d'écran, conflit entre `touch-action` et défilement de page. Ça mérite le meilleur modèle, en `effort: xhigh` pour cette passe.

**Étapes 2 à 4 : Sonnet 5.** Une fois le moteur stable et testé, les déclinaisons CE1 et CE2 sont des variations de contenu sur un socle existant — inventaire de formes, libellés de consigne, règles d'inclusion. C'est exactement le profil où Sonnet suffit, à un coût bien moindre.

Si l'étape 1 bute après deux passes sur un défaut de synchronisation que tu n'arrives pas à faire corriger, c'est le cas typique où une passe Fable se justifie — un problème identifié et circonscrit, pas une revue générale.
