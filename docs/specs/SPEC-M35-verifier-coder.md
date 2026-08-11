# SPEC — M35 « Vérifier et coder »

**Statut de ce document :** spécification de conception, avant production.
**Module :** `jeux/M35-verifier-coder.html` — fichier unique, autonome, adaptatif CP / CE1 / CE2 (CHARTE §15).
**Domaine :** Espace et géométrie — sous-thème « La géométrie plane ».
**Source pédagogique :** programme de mathématiques du cycle 2, BO du 31 octobre 2024 — blocs « La géométrie plane », second bloc d'objectifs CP / CE1 / CE2 (instruments et codage).

> Le nom du module change par rapport au backlog (« Alignements et tracés »). Le nouvel intitulé dit le verbe, cohérent avec le découpage du sous-thème, et supprime l'ambiguïté avec M38 qui porte désormais seul la production de figures.

---

## 1. Ce que le module fait — et ne fait pas

M35 est le module de **l'instrument comme moyen de conclure**. On y pose un outil sur une figure et on lit ce qu'il tranche ; on annote ensuite ce qu'on a établi.

| On y fait | On n'y fait pas |
|---|---|
| poser la règle, le gabarit, l'équerre, le compas | reproduire ou construire une figure (→ M38) |
| conclure : alignés ou non, droit / aigu / obtus | nommer, décrire, justifier par propriété (→ M34) |
| apposer les codages formels | tracer à main levée le long d'un instrument |

**Une seule exception assumée**, sans quoi une compétence CP resterait orpheline : « tracer une droite passant par deux points à l'aide d'une règle » reste dans M35, comme *conclusion* du mini-jeu d'alignement. On a vérifié, on tape les deux points, le trait naît le long de la réglette. C'est un geste, pas un simulacre de crayon.

### Le parti pris de fond

Le texte insiste sur « l'habileté manuelle, la concentration et l'attention » pour les tracés. **Un écran ne peut pas entraîner la main sur un vrai compas, et ne doit pas prétendre le faire.** M35 vise la couche conceptuelle de l'instrument : ce qu'il permet de conclure, et quand il faut y recourir. Le papier reste indispensable ; le module le prépare et le prolonge, il ne le remplace pas. À dire explicitement dans la fiche parent.

### La règle d'or des items

Le texte CP dit : utiliser la règle « **dans les cas où la réponse n'est pas perceptible de façon évidente** ». Le texte CE2 dit : utiliser l'équerre « **si la réponse n'est pas évidente** ».

Conséquence directe et non négociable : **les items ambigus doivent l'être vraiment**. Trois points faux de deux ou trois pixels, un angle à 87°. Si le défaut se voit à l'œil nu, l'instrument devient décoratif et l'enfant apprend à l'ignorer — le module rate alors sa seule cible.

Corollaire, qui est le vrai apprentissage transversal du module : **savoir quand l'œil suffit et quand il ne suffit pas**. Chaque palier mélange donc délibérément des items évidents (où recourir à l'instrument est une perte de temps, et le texte l'autorise à s'en passer) et des items indécidables (où s'en passer est une faute).

### Ambiance

L'atelier de contrôle du vitrail : plan technique, trait noir sur calque, lumière rasante, palette **désaturée** — contraste voulu avec la table de tri colorée de M34 et l'établi de M38. On n'est plus dans le verre, on est dans le plan.

---

## 2. Les instruments : moteur commun

Un moteur unique d'**objet posable** sert les quatre instruments. Un doigt suffit toujours.

- **Translation** : glisser le corps de l'instrument.
- **Rotation** : glisser une **poignée** située à une extrémité. Jamais de rotation à deux doigts — impossible à découvrir et incompatible avec `touch-action: pan-y` (§19).
- **Aimantation** : à l'approche d'un point ou d'un sommet, l'instrument s'aligne doucement (quelques pixels de tolérance). Sans elle, la manche devient un test de motricité fine ; avec elle trop généreuse, elle répond à la place de l'enfant. Tolérance à calibrer sur appareil : elle doit aider à *poser*, jamais à *conclure*.
- **Défilement préservé** : `touch-action: pan-y`, lecture du seul glissement pertinent, détection du tap par `elementFromPoint` au `pointerup` (la capture du pointeur empêche le `click` d'atteindre les cibles — leçon acquise sur M37).

### Les quatre instruments

**La règle.** Réglette translucide à bord franc. Recycle le moteur de la règle mobile déjà éprouvée.

**Le gabarit d'angle droit.** Un coin de carton, pas une équerre complète. Le texte CE1 fait précéder l'équerre d'un « gabarit en carton », et c'est aussi le plus lisible : on le pose dans le sommet, et le côté de la figure tombe visiblement *dedans* (aigu) ou *dehors* (obtus). Même objet posable, deux habillages : gabarit au CE1, équerre au CE2.

**Le compas.** Jamais de pincement pouce-index. Deux régimes, calqués sur le texte :

- **CE1 — deux appuis.** Le texte dit « tracer le cercle de centre un point donné et **passant par un autre point donné** ». L'écartement n'est pas réglé, il est *dérivé* : on tape le centre, on tape le point de passage, l'animation trace. Le problème de l'écartement disparaît.
- **CE2 — écartement mesuré.** Cette fois il faut fixer une longueur (« un cercle de rayon 4 cm ayant pour centre un des sommets du carré ») : on règle l'écartement sur une échelle graduée, on pose le centre, on déclenche. Sert aussi au **report** de longueur (voir §5.4).

**La palette de marques** (codage). Trois tampons : le carré d'angle droit, le trait simple, le trait double.

---

## 3. Palier CP — deux mini-jeux

Le CP n'a ni cercle ni codage. Le bloc officiel se limite à : repérer visuellement des alignements, utiliser la règle pour repérer ou vérifier des alignements, utiliser la règle comme instrument de tracé.

### 3.1 `cp-alignement` — « Les pointes de l'établi »

Le texte est explicite sur la progression : « Les problèmes proposés portent **d'abord sur des objets réels** (par exemple, dans la cour, l'élève sait aligner des plots pour délimiter une zone), **puis sur des points** (représentés par des petites croix) sur une feuille de papier. »

Ce qui est prescriptif est le **passage du monde physique à sa représentation** ; la cour n'est qu'une illustration. On reste donc dans l'univers avec un objet réel du métier : le verrier plante de petites **pointes** le long du tracé pour caler les pièces de verre avant de souder les plombs. L'alignement y est fonctionnel — une pointe qui sort du rang, et la pièce glisse ou se coince.

Deux temps, dans cet ordre, à respecter :

1. **Sur l'établi** — vue rasante, pointes plantées dans le bois. L'enfant juge, puis replace celle qui dévie ; la pièce de verre vient se caler et tient. Aucun instrument : c'est le temps de l'objet réel, et la conséquence physique est visible.
2. **Sur le plan** — les **mêmes emplacements**, vus de dessus, en croix sur le calque. La règle apparaît. Alignés ou non ?

Le passage du premier au second temps est une vraie transition de représentation — l'établi vu de dessus *devient* le plan — et non un changement d'exercice. C'est ce basculement que le texte demande.

Répartition des items du second temps : environ un tiers d'évidents (l'œil suffit, poser la règle est inutile), deux tiers d'indécidables (écart de 2 à 4 px).

Consigne synthétique en gras, systématiquement : **« Ces trois points sont-ils alignés ? »**

### 3.2 `cp-tracer-droite` — « Le trait du verrier »

« L'élève trace une droite passant par deux points à l'aide d'une règle. Cette droite peut être **horizontale, verticale ou oblique**. »

L'enfant pose la réglette sur les deux points marqués, puis tape pour tracer. Le trait naît le long du bord. Les trois orientations sont toutes représentées — l'oblique est explicitement au programme et c'est celle que les enfants évitent.

Manche de synthèse : un plan de vitrail dont il manque des traits de plomb, chacun défini par deux points. Le vitrail se referme à mesure.

---

## 4. Palier CE1 — trois mini-jeux

Ajouts : équerre et gabarit, angles aigu / droit / obtus vérifiés, compas, milieu par pliage, code de l'angle droit.

### 4.1 `ce1-alignement` — « Le contrôle du plan »

Même mécanique qu'au CP, exigence relevée : « L'élève sait repérer **et tracer** des points alignés. L'élève sait dire que des points ne sont pas alignés **sans utiliser la règle quand il n'y a aucun doute**. »

Nouveauté : l'enfant doit parfois **placer** un point de façon à ce qu'il soit aligné avec deux autres, et non plus seulement juger. Et les items évidents deviennent piégeux dans l'autre sens : y recourir à la règle n'est pas une erreur, mais le feedback le signale (« Bien vu — ici, l'œil suffisait. »).

### 4.2 `ce1-angles` — « Le gabarit de l'atelier »

Frontière avec M34 : M34 classe à l'œil des angles **francs** ; M35 tranche les cas **douteux** à l'instrument. Ici, les angles sont proches de 90° — 84°, 87°, 93°, 96°.

L'enfant pose le gabarit dans le sommet, observe, puis conclut : droit, aigu, obtus. Le feedback superpose brièvement le gabarit en position exacte pour montrer l'écart (§18 : toujours montrer la bonne réponse).

Seconde moitié de manche, le gabarit devient une **équerre** — même objet, habillage d'outil réel.

### 4.3 `ce1-compas` — « Le cercle du rosaces »

Trois tâches, toutes dans le texte :

1. **Tracer un cercle au compas** — libre, pour prendre l'objet en main.
2. **Cercle de centre donné passant par un point donné** — la formulation officielle exacte, deux appuis.
3. **Milieu d'un segment par pliage** — le texte dit « par pliage », pas au compas ni à la règle graduée. Animation de pli du calque : le segment se replie sur lui-même, le pli marque le milieu. L'enfant place d'abord son estimation, le pliage tranche.

### 4.4 `ce1-codage` — « L'angle droit sur le plan »

Codage limité à l'**angle droit** : le texte CE1 ne prévoit que « le code pour les angles droits ». Le codage des égalités de longueur est CE2 — voir §7.

Palette réduite à un seul tampon : le carré d'angle droit. L'enfant l'appose sur tous les angles droits d'une figure, et **seulement** sur eux. La marque s'oriente automatiquement selon les deux côtés du sommet.

Au CE1, **pas de vérification préalable obligatoire** : on code ce qu'on a déjà établi au mini-jeu précédent, sur des figures franches.

---

## 5. Palier CE2 — quatre mini-jeux

Ajouts : équerre systématique sur cas douteux, compas à écartement mesuré, report de longueur, codage des égalités.

### 5.1 `ce2-alignement` — « L'expertise »

Items exclusivement indécidables. Se passer de la règle devient une faute, et le feedback le dit.

### 5.2 `ce2-angles` — « L'équerre du contrôleur »

Le texte : « L'élève sait dire si **chacun des angles** d'un polygone est ou non un angle droit en utilisant l'équerre si la réponse n'est pas évidente. »

Changement d'échelle : ce n'est plus un angle isolé mais un **polygone entier** à passer en revue, angle par angle. L'enfant parcourt les sommets et statue sur chacun. Certains sont francs (l'œil suffit), un ou deux sont douteux (l'équerre s'impose). C'est le mini-jeu où s'apprend le jugement « quand l'œil suffit-il ? ».

### 5.3 `ce2-compas` — « L'écartement »

Compas à écartement réglé sur échelle graduée. Deux tâches :

1. **Construire un cercle de rayon donné** centré sur un point donné — « un cercle de rayon 4 cm ayant pour centre un des sommets du carré ».
2. **Reporter une longueur** — prendre l'écartement sur un segment, le transporter sur un autre pour les comparer sans mesurer. Ce geste alimente directement le mini-jeu suivant.

### 5.4 `ce2-codage` — « Le plan certifié »

Le mini-jeu de synthèse du module.

**Ce que le codage veut dire.** Une marque d'égalité est **relationnelle**, jamais absolue : elle ne dit pas « ce côté mesure quelque chose », elle dit « ce côté est égal à celui qui porte la même marque ». D'où deux principes que le mini-jeu doit faire découvrir :

- il faut **au moins deux marques identiques** pour qu'un codage ait un sens — une marque isolée ne veut rien dire, et c'est l'erreur que le jeu doit provoquer puis corriger ;
- **deux groupes d'égalité distincts appellent deux notations distinctes** : trait simple pour la longueur, trait double pour la largeur.

**Progression des figures**, construite exactement sur cette idée :

| Figure | Ce qu'elle oblige à comprendre |
|---|---|
| Carré | une seule marque, répétée quatre fois — le cas simple |
| **Rectangle** | **deux groupes → deux notations** ; c'est l'exemple de réussite officiel, donc l'objet d'étude central |
| Losange | quatre côtés égaux mais **aucun** angle droit : marques de longueur, zéro carré rouge |
| Triangle rectangle | un carré rouge, aucune égalité à coder |
| Triangle isocèle | deux côtés marqués sur trois — la marque isolée devient visiblement absurde |

**Vérification obligatoire avant apposition** — spécifique au CE2. Une marque n'est légitime que si la propriété est vraie :

- angle → équerre, **sauf si l'écart est franc** (le texte l'autorise explicitement) ;
- longueurs → **report au compas**, pas règle graduée : c'est le geste juste pour comparer deux segments sans les mesurer, et il réutilise le moteur du mini-jeu précédent.

Le jeu tranche lui-même, item par item, si la vérification est exigée : figure ambiguë → instrument obligatoire ; figure franche → apposition directe. Ce n'est donc pas un péage systématique, et le mini-jeu ne dégénère pas en révision des trois précédents : l'instrument y redevient un moyen qu'on mobilise **à bon escient**.

**Geste : le tampon, pas le tracé.** L'enfant choisit une marque dans la palette et l'appose sur un sommet ou un côté. Elle s'oriente seule — perpendiculaire au segment et à son milieu pour les égalités, dans le sommet en épousant les deux côtés pour l'angle droit. Rien à dessiner à la main.

**Cible finale**, mot pour mot le texte : « indiquer sur un rectangle les codes pour les quatre angles droits et des codes signalant l'égalité des longueurs des côtés opposés ».

---

## 6. Contraintes techniques et de charte

- **Fichier unique autonome**, SVG pur, aucune dépendance réseau.
- **Adaptatif** (§15) : `paliers` CP / CE1 / CE2 ; palier par défaut lu depuis le profil actif ; palier bonus « paquet cadeau » avec indicateur `mayeutik-m35-bonus-revele` indexé par `profilId` **puis par palier cible** (deux transitions : CP→CE1, CE1→CE2).
- **Lancement paramétré** (§16) : `?competence=<id>&palier=<cp|ce1|ce2>`.
- **Dix compétences**, une par mini-jeu (§15) : `cp-alignement`, `cp-tracer-droite`, `ce1-alignement`, `ce1-angles`, `ce1-compas`, `ce1-codage`, `ce2-alignement`, `ce2-angles`, `ce2-compas`, `ce2-codage`. Dans `data/referentiel.json`, `niveaux: ["CP","CE1","CE2"]`.
- **Feedback d'erreur** (§18) : toujours montrer la bonne réponse. Ici, la forme adaptée est la **révélation différée** — l'instrument se replace tout seul en position exacte après ~900 ms, avec les gardes `isConnected` et le verrouillage des éléments interactifs. Le rouge ne désigne jamais la bonne réponse.
- **Pas d'essai-erreur sur place** (§18) : une pose validée est validée ; on montre, on passe.
- **Randomisation** (§13) : ordre des items, position des réponses, variété entre sessions.
- **Remontée en haut** (§17) ; **protections tactiles** (§19), `touch-action: pan-y`.
- **Voix** (§5) : consignes lues ; consigne synthétique en gras à l'écran.

---

## 7. Corrections à porter au backlog

Rappel et complément des points déjà relevés lors de la conception de M34.

1. **Erreur factuelle.** La note M35 attribue au CE1 le codage des égalités de longueur. Le texte CE1 ne prévoit que « le code pour les angles droits » ; l'égalité des longueurs est **CE2** (« le codage d'un angle droit **et celui qui indique que des segments ont la même longueur** »).
2. **Intitulé.** « Alignements et tracés » → **« Vérifier et coder »**, les tracés relevant désormais de M38.
3. **Mécanique.** « Tracé sur grille » → « Instruments posables + codage » (supprime le doublon de mécanique avec M38).
4. **Compétence CP.** Ajouter explicitement le premier temps sur **objets réels** (plots dans la cour) avant le passage aux points sur papier — le texte le prescrit dans cet ordre.
5. **Compétence CE1.** Ajouter le **gabarit en carton** comme étape préalable à l'équerre, et le **milieu par pliage** (déjà en note, à remonter dans le champ `competence`).
6. **Effort.** L'estimation à 7 est basse pour dix mini-jeux et quatre moteurs d'instrument. Proposer **10**, sachant que le moteur d'objet posable est mutualisé et amorti dès le CP.

---

## 8. Points de vigilance

- **L'ambiguïté des items est la condition de vie du module.** Un défaut visible à l'œil rend l'instrument décoratif. C'est le point à tester en premier, sur écran d'iPhone, où la densité de pixels change tout.
- **L'aimantation est un curseur délicat.** Trop faible, le module devient un test de motricité fine ; trop forte, il répond à la place de l'enfant. Elle doit aider à poser, jamais à conclure.
- **Ne pas dériver vers M38.** Dès qu'on demande de produire une figure, on est hors sujet. Seule exception : la droite par deux points au CP.
- **Ne pas dériver vers M34.** Le classement d'angles francs à l'œil appartient à M34 ; M35 ne traite que les cas où l'instrument est nécessaire.
- **Honnêteté sur le geste.** Aucun pincement à deux doigts, aucune simulation de crayon longeant une réglette. Ce que l'écran ne peut pas faire honnêtement, il ne le fait pas.
- **Charge du CE2.** Quatre mini-jeux dont un de synthèse à vérification conditionnelle : c'est le palier le plus lourd du sous-thème. Si le volume déborde, sortir le report de longueur de `ce2-compas` pour le fondre dans `ce2-codage`, où il sert directement.
