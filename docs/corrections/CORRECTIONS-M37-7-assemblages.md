# M37 — Extension à 7 assemblages par palier

Demande : porter chaque palier de **5 à 7 assemblages**, et faire figurer **cubes ET pavés** dans l'un des deux nouveaux niveaux du CE1.

Vérifié dans `jeux/M37-assemblages.html` (état courant du dépôt) : les lignes et faits cités sont réels.

---

## 1. Ce que la lecture du code fait apparaître

Trois constats qui orientent le contenu des quatre nouveaux niveaux.

### 1.1 Le CE1 perd les pavés exactement quand les cubes cachés arrivent

Inventaire des pièces sur les dix assemblages existants : **70 cubes, 6 pavés**, et rien d'autre.

| Palier | Assemblages avec pavé |
|---|---|
| CP | Le banc, Le château |
| CE1 | **La double tour uniquement** |

Les trois assemblages CE1 à cube caché — La croix, La tour sur socle, Le gros bloc — sont **exclusivement en cubes**. Le choix se comprend (n'introduire qu'une difficulté à la fois), mais il laisse un trou : le programme demande au CE1 comme au CP « construire des assemblages **de cubes et de pavés** », et les niveaux les plus exigeants du palier n'en contiennent aucun.

La demande de Roberto comble donc un écart au programme, pas seulement un manque de variété.

### 1.2 Aucun assemblage n'utilise le pavé « en profondeur »

Les six pavés du jeu sont **tous** en `dx:2, dy:1`. Aucun `dy:2`.

Or l'interface propose un bouton de rotation (l. 960, « ↻ posé en largeur / posé en profondeur »). **Ce bouton n'a jamais d'utilité** : il existe, il s'affiche, et aucune manche n'en dépend.

**Attention au piège :** il ne suffit pas de poser un pavé en profondeur dans un nouvel assemblage. La validation est **invariante par rotation** (l. ~1000, `signature` / `tourneCell`) : un modèle à pavé vertical se reproduit très bien avec un pavé horizontal si l'enfant tourne toute la construction d'un quart de tour. Pour que l'orientation compte vraiment, il faut **deux pavés à angle droit l'un de l'autre** dans le même assemblage — aucune rotation globale ne peut alors les ramener tous deux à l'horizontale.

### 1.3 La règle d'appui est un appui TOTAL — et c'est ce qui rend le pavé intéressant au CE1

`poser` (l. 995-997) exige que **chaque cellule** de la pièce repose sur une cellule occupée à l'étage inférieur :

```js
for(const k of cellules(p)) if(!d.has(k.join(","))) { /* refus */ }
```

Conséquence directe, et c'est le meilleur argument pédagogique du nouveau niveau CE1 : **un pavé posé à l'étage supérieur témoigne pour DEUX cellules à la fois.** Un cube prouve qu'une case est occupée en dessous ; un pavé en prouve deux. La déduction n'est pas seulement plus grande, elle est d'une autre nature.

Corollaire à connaître avant de concevoir : **on ne peut pas construire un pont ni une arche.** Un pavé ne peut pas enjamber un vide. Toute idée de portique est à écarter d'emblée.

---

## 2. Les quatre nouveaux assemblages

Plateau **4 × 4** (`GRILLE=4`, l. 875). Chaque assemblage marqué `cache:true` doit réellement contenir une pièce cachée — un test de données le vérifie déjà (l. 800), et `piecesCachees` exige l'enfermement sur les quatre côtés **plus** au-dessus.

### CP — deux niveaux, tout visible, 2 à 3 étages

**A. « L'équerre » — les deux orientations du pavé.** À placer juste après *Le banc*, qui introduit le premier pavé.

Deux pavés à angle droit au sol, un cube posé sur l'un d'eux. Trois pièces, deux étages. C'est le plus petit assemblage possible qui rende le bouton de rotation nécessaire — et il le rend nécessaire pour de bon (§1.2).

**B. « La cheminée » — pavés croisés sur deux étages.** À placer entre *La tour en L* et *Le château*.

Un socle de deux pavés croisés, un pavé à l'étage au-dessus dans une troisième position, une cheminée d'un ou deux cubes. Six à sept pièces, trois étages. L'enfant doit tenir l'orientation d'un étage à l'autre, ce qu'aucune manche ne demande aujourd'hui.

### CE1 — deux niveaux

**C. « Le couvercle » — un pavé au-dessus d'un cube caché.** À placer après *La croix*, donc juste après l'écran d'explication des cubes cachés.

Reprendre une base en croix (le cube central est caché) mais coiffer le centre d'un **pavé** au lieu d'un cube. Le raisonnement change de forme : ce n'est plus « il y a un cube dessous parce qu'un cube tient dessus », c'est « **les deux cases sous le pavé sont occupées, sinon il pencherait** ».

**D. « Le grand couvercle » — un pavé qui prouve DEUX cubes cachés.** Niveau final du palier, à la place du *Gros bloc* ou après lui.

Un bloc plein au sol dont **deux cases voisines** sont entourées de tous côtés, coiffées d'**un seul pavé** à l'étage supérieur. Ce pavé prouve à lui seul l'existence des deux cubes invisibles.

C'est le sommet logique du palier : une pièce, deux déductions. Rien dans le jeu actuel ne va aussi loin. Douze à quatorze pièces, comparable au *Gros bloc* existant.

**Ce niveau satisfait la demande « cubes et pavés » du CE1**, et le niveau C aussi.

---

## 3. Points techniques

### 3.1 Le barème n'est pas à toucher

`total = listeAssemblages().length` (l. 1348) : le score se calcule depuis la longueur de la liste. Passer à 7 suffit, rien à recalculer.

### 3.2 Les étoiles sont indexées par mini-jeu, pas par assemblage

`enregistrerEtoiles(jeuId, valeur)` (l. 530) range sous la clé du mini-jeu. **Insérer un niveau au milieu ne décale donc aucune étoile déjà gagnée.** L'insertion en position pédagogiquement juste est sans risque — pas besoin d'ajouter en fin de liste pour préserver les données.

### 3.3 Ne PAS appliquer le §13 bis ici

La règle de tirage sans remise ne s'applique pas : les assemblages forment un **stock fermé et ORDONNÉ**, joué intégralement à chaque partie, dont l'ordre porte la progression de difficulté (2 étages → 3 étages → cube caché → deux cubes cachés). Les mélanger détruirait la progression, et l'écran d'explication des cubes cachés, qui s'ouvre à la première rencontre, tomberait n'importe où.

À déclarer explicitement dans le module, comme les autres stocks fermés de plein droit, avec cette raison écrite — sinon une application mécanique de la charte cassera le mini-jeu.

### 3.4 Durée de la partie

Sept assemblages au CE1, dont deux à plus de douze pièces, allongent sensiblement la session. **À mesurer sur appareil** : si une partie dépasse une dizaine de minutes, c'est trop pour le public visé, et il faudra soit alléger les nouveaux niveaux, soit envisager une reprise en cours de partie — qui n'existe pas aujourd'hui.

---

## 4. Prompt à donner à Code

> Lis `jeux/M37-assemblages.html` et `CHARTE.md`, puis ce document.
>
> **Première action** : écris ce document dans `docs/corrections/` et commit.
>
> Objectif : porter chaque palier de M37 de 5 à 7 assemblages, selon la section 2.
>
> **Ne code rien avant de m'avoir répondu sur trois points :**
>
> 1. Confirme que la validation est bien invariante par rotation, et que deux pavés à angle droit dans le même assemblage sont donc nécessaires pour que le bouton d'orientation compte (§1.2).
> 2. Propose les coordonnées des quatre assemblages, et fais-les relire par le contrôle de données existant — en particulier que chaque `cache:true` contient réellement une pièce cachée au sens de `piecesCachees`.
> 3. Dis-moi comment tu déclares ce stock comme **fermé et ordonné de plein droit**, hors du §13 bis (§3.3) — la progression de difficulté et l'écran d'explication des cubes cachés en dépendent.
>
> Le barème et les étoiles ne demandent aucune modification (§3.1, §3.2) : vérifie-le plutôt que de me croire.
>
> Après implémentation, mesure la durée d'une partie complète sur les deux paliers et dis-la-moi.
