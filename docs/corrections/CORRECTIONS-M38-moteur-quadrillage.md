# M38 — Réutiliser le moteur de tracé sur quadrillage de M41

Demande : reprendre pour M38 le module de dessin sur quadrillage développé pour M41 « Le monde à moitié effacé », adapté à chaque compétence là où c'est pertinent.

Vérifié dans le dépôt (`jeux/M38-reproduire-construire.html`, `jeux/M41-symetrie.html`, `outils/`).

---

## 1. Les deux modèles ne sont pas interchangeables

| | M38 aujourd'hui | M41 |
|---|---|---|
| Ce que l'enfant pose | des **sommets** (`poserSommet`, l. 2390) | des **segments** |
| Comment | tap sur un nœud, retour sur le premier pour fermer | glissement le long d'un **chemin de nœuds** |
| Ce qui en résulte | un **contour fermé**, rempli de verre coloré | un **ensemble de traits**, dont l'intérieur est calculé |
| Pas légaux | n'importe quel nœud | les **huit voisins** seulement |

Le passage de l'un à l'autre n'est donc pas un remplacement de moteur, c'est un changement de ce que l'enfant produit. Ce qui suit précise où c'est un gain, et où ça ne marche pas.

---

## 2. Où le moteur de M41 est pertinent — et pourquoi c'est un gain

**Cinq mini-jeux sur neuf**, ceux qui travaillent sur quadrillé ou pointé :

`cp-reproduire`, `cp-completer`, `cp-assembler`, `ce2-reproduire`, et la partie quadrillée de `ce1-completer`.

Trois gains, pas seulement de confort :

**Le geste juste.** M41 a déjà payé le prix de la leçon, notée en toutes lettres dans son code : la première version allumait le segment le plus proche du doigt, et « un enfant ne tape pas case par case, il GLISSE » — un doigt qui traverse l'intérieur d'une cellule y trouve une **diagonale** comme segment le plus proche, et le trait voulu arrivait « noyé sous une résille de croix ». Le chemin de nœuds règle cela. M38 fait poser des sommets un par un, ce qui contourne le problème mais ne correspond pas au geste du crayon sur papier quadrillé — et c'est précisément ce que le programme CP décrit.

**L'assemblage devient exact par construction.** `cp-assembler` exige que les pièces partagent un **côté entier** sans jamais se chevaucher — et la note du module signale que deux modèles d'une première version étaient fautifs, « deux triangles qui se recouvraient et un triangle accroché au carré par un seul point ». En modèle segments, un côté partagé **est un seul segment tracé une fois** : le chevauchement et le contact par un point cessent d'être exprimables. Le défaut disparaît au lieu d'être vérifié.

**L'intérieur colorié est déjà résolu, et mieux.** M38 remplit un polygone fermé. M41 **calcule** « dedans » : chaque cellule est découpée en quatre quarts par ses diagonales, les traits deviennent des murs, et l'intérieur est ce qu'on n'atteint pas depuis le dehors par un parcours en largeur. C'est nécessaire dès qu'une diagonale traverse une cellule — la moitié gauche peut être dehors quand la droite est dedans. Le vitrail cumulatif de M38 y gagne, et le remplissage cesse de dépendre de la fermeture d'un contour unique.

**Le retour arrière et la gomme aussi.** M41 distingue déjà deux gestes : le crayon suit le chemin de nœuds, la gomme travaille **par proximité** (« l'enfant raye en travers »), et revenir sur le nœud précédent efface le segment que le geste vient d'écrire. M38 n'a que « revenir sur le dernier sommet le retire ».

---

## 3. Où il ne marche pas — le point dur

### 3.1 Les obliques 2/1 et 3/1 sont hors d'atteinte du modèle

`voisins()` dans M41 n'autorise que `dx ≤ 1 && dy ≤ 1` : les **huit voisins**, donc les orthogonales et les diagonales **à 45° seulement**.

Or la spec de M38-CE1 fait des pentes **2/1 et 3/1** le cœur de `ce1-reproduire`, et la note du module les désigne comme « le vrai saut du CE1 et le point de décrochage du sous-thème ». Une oblique 2/1 n'est pas un pas entre voisins : elle traverse l'intérieur des cellules, ce que le modèle refuse **par conception** — et c'est bien ce refus qui l'a rendu utilisable.

Trois issues, à trancher :

1. **Garder la pose de sommets pour les obliques.** Le moteur accepte deux modes ; `ce1-reproduire` reste en pose de sommets. Le plus simple, et défendable : tracer une oblique longue, c'est poser ses deux bouts.
2. **Autoriser les « pas longs alignés »** — un glissement d'un nœud A à un nœud B produit le segment droit si le doigt ne quitte pas la droite AB. Plus fidèle au geste, mais ré-ouvre exactement la porte que le chemin de nœuds avait fermée : à calibrer, et à tester sur appareil avant de s'y engager.
3. **Poser les deux bouts par tap** dans le même moteur, sans glissement, pour les seules manches obliques.

**Recommandation : option 1 pour commencer**, option 2 comme amélioration ultérieure si le test montre que la pose de sommets casse le rythme.

### 3.2 Le papier uni n'a pas de nœuds

`ce1-construire`, `ce2-construire-uni` et la partie unie de `ce1-completer` ne peuvent pas utiliser le moteur : il n'y a aucun nœud. Là, l'exactitude vient de l'instrument, « qui publie ses graduations comme ANCRES d'accrochage ». Ne pas y toucher.

### 3.3 La rosace est au compas

`ce2-rosace` relève de `outils/moteur-compas.js`. Hors sujet.

---

## 4. Décision : moteur DUPLIQUÉ dans M38, tests indépendants

**Décision prise (Roberto).** Le moteur de tracé sur quadrillage est **recopié** dans M38 et non extrait dans `outils/`, afin de pouvoir l'adapter aux obliques sans contraindre M41. Les **tests des deux modules restent indépendants** : les maillages n'auront pas forcément la même taille.

Le raisonnement se tient au-delà des obliques : `moteur-compas.js` a fini par porter sept options ajoutées une à une pour des besoins particuliers (`surReglage`, `rayonCrante`, `aimantsMine`, `guide`, `rayonMax`, `ecartLoupe`, `arc`). Un moteur partagé entre deux usages divergents accumule les drapeaux des deux.

Et la divergence est plus profonde que les obliques : **le calcul de l'intérieur diverge aussi.** Le découpage en quarts de cellule par les diagonales capture exactement les murs possibles de M41 — mais une oblique 2/1 ne suit aucune diagonale de cellule, donc ce découpage ne la représente pas. M38 aura besoin d'un remplissage plus général. Il n'y avait donc pas non plus cette partie à partager.

### Ce que la duplication coûte, et le seul garde-fou qui reste

Plus rien ne propage une correction d'un module à l'autre. Le précédent est dans le dépôt : la note de M34 dit de la rosace « toute retouche ici est à reporter là-bas » — engagement que personne ne tient sur la durée.

Deux mesures compensatoires, obligatoires :

**1. Un renvoi croisé en tête des deux moteurs**, en commentaire : « moteur jumeau dans `jeux/M41-symetrie.html` (resp. M38), volontairement dupliqué — voir `docs/corrections/CORRECTIONS-M38-moteur-quadrillage.md` §4. Toute correction de comportement est à examiner dans les deux. »

**2. La liste des propriétés à RÉTABLIR dans M38**, chacune par son propre test. Ce sont des leçons déjà payées à l'appareil sur M41 ; les perdre à la copie serait le pire résultat possible.

| # | Propriété | Pourquoi elle existe |
|---|---|---|
| 1 | Un doigt qui dérive au milieu d'une cellule ne trace rien | sinon le trait voulu est noyé sous une résille de diagonales |
| 2 | Un même geste tremblé de ±0,28 maille donne le **même** trait | le résultat ne doit pas dépendre de la main |
| 3 | Un nœud non voisin (doigt qui saute) **replace** sans tracer | plutôt qu'inventer un segment |
| 4 | L'appui simple garde l'accrochage au segment le plus proche | recours de précision, sans trajectoire qui dérape |
| 5 | Le retour arrière n'efface qu'un pas **dont le geste est l'auteur** | ni le pré-rempli, ni un trait antérieur |
| 6 | La gomme travaille par **proximité** et ne touche que ce que l'enfant a tracé | on gomme en travers, on ne repasse pas |
| 7 | L'outil est **figé à l'appui** | un geste garde le sens qu'il avait en commençant |
| 8 | La vue **déborde le quadrillage d'une demi-maille** | sinon les segments du bord tombent sur l'arête tactile |
| 9 | Le quadrillage **affiché** est exactement celui qui accroche | deux vérités pour une grille |
| 10 | Une **surface explicite** (`<rect>` non peint, `pointer-events:all`) couvre la zone, et `touch-action:none` porte sur la **carte entière** | sous un point vide d'un `<svg>` racine, la cible désignée dépend du moteur : WebKit et Blink diffèrent, et le geste redevenait un défilement |
| 11 | L'intérieur colorié est **calculé**, jamais déclaré, et son contrôle **mesure l'aire** de figures à aire connue au lieu de recalculer avec la fonction qui le produit | un test qui partage l'hypothèse du code valide son bug |
| 12 | La récompense n'arrive **ni avant la réussite, ni après un abandon** | |

Le point 10 est le plus coûteux à retrouver : il n'était **pas reproductible sous Chromium** et n'a été identifié qu'en comparant la structure des deux mini-jeux de M41. À porter tel quel.

---

## 5. Ce qu'il me manque

Le brief ne couvre que le remplacement de moteur. **« Les jeux ne fonctionnent pas ou pas bien » ne suffit pas à cibler le reste** — et changer le moteur ne corrigera pas nécessairement ce que tu as vu.

À noter au fil du test, mini-jeu par mini-jeu : ce qui ne répond pas, ce qui répond mal, ce qui est juste inconfortable. C'est la liste qui a permis les trois revues de M34.

---

## 6. Prompt à donner à Code

> Lis ce document, `jeux/M38-reproduire-construire.html`, `jeux/M41-symetrie.html`, `docs/specs/SPEC-M38-reproduire-construire.md` et `CHARTE.md`.
>
> **Première action** : écris ce document dans `docs/corrections/` et commit.
>
> **Ne code rien avant de m'avoir répondu sur quatre points :**
>
> 1. Le périmètre : confirme quels mini-jeux de M38 peuvent passer au moteur de chemin de nœuds et lesquels ne peuvent pas (§2, §3), en te fondant sur le code et non sur ce document.
> 2. Les **obliques 2/1 et 3/1** de `ce1-reproduire` : `voisins()` ne connaît que les huit voisins. Quelle issue proposes-tu (§3.1) ?
> 3. L'extraction dans `outils/moteur-quadrillage.js` : quelle interface, et comment garantis-tu que M41 se comporte exactement comme avant après extraction ? Un test de non-régression sur M41 est attendu **avant** toute adaptation de M38.
> 4. La contradiction de charte sur les fichiers autonomes contre les moteurs partagés (§4). Propose une formulation.
>
> Puis produis dans cet ordre, avec un arrêt et un test sur iPhone entre chaque :
>
> 1. **Extraction du moteur**, M41 inchangé fonctionnellement. Rien d'autre.
> 2. **`cp-reproduire` et `cp-completer`** au nouveau moteur, y compris l'intérieur calculé pour le vitrail.
> 3. **`cp-assembler`**, où le côté partagé devient un segment unique.
> 4. **`ce2-reproduire`**, puis la partie quadrillée de `ce1-completer`.
>
> Ne touche ni au papier uni, ni à la rosace, ni au moteur de compas.
