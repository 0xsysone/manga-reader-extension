# Manga Reader – Book Mode 読

Lecteur de manga en mode livre (anciennement « Yomu »).

Extension Chrome (Manifest V3) qui remplace la lecture en défilement des sites de scans par un vrai lecteur de livre. Elle s'active en un clic, site par site.

- **Page entière à l'écran** : chaque page est ajustée à la hauteur, sans défilement.
- **Double page** comme un tankōbon ouvert. En mode *Auto*, la double page s'active quand l'écran est assez large. La couverture s'affiche seule, et les dessins paysage (doubles pages d'origine) restent d'un seul tenant.
- **Sens de lecture japonais** (droite → gauche) par défaut : `←` avance, `→` recule, la première page d'une planche est à droite. Le sens occidental est disponible.
- **Pages qui se tournent** : en 3D autour du dos du livre, avec ombres portées, pénombre et reflet. Autres choix : *Glissement* ou *Aucune* animation.
- **Mode sombre** (fond noir) ou clair (papier).
- Barre de progression orientée selon le sens de lecture, avec aperçu au survol. Passage au chapitre suivant ou précédent ; le précédent s'ouvre sur sa dernière page.

## Installation

1. Ouvrir `chrome://extensions`.
2. Activer **Mode développeur** (en haut à droite).
3. **Charger l'extension non empaquetée** → sélectionner le dossier du projet.

## Activer un site

1. Ouvrir un chapitre sur le site voulu.
2. Cliquer sur l'icône Manga Reader, puis **Activer** dans la carte du site.
3. Chrome demande l'accès **à ce domaine uniquement** (sous-domaines compris). Le lecteur se lance aussitôt, et automatiquement aux visites suivantes.

**Désactiver**, dans la même carte, retire le script et l'autorisation. Retirer l'accès depuis `chrome://extensions` désactive aussi le site.

Les pages sont détectées dans cet ordre :

0. **Adaptateurs dédiés** : Scan-Manga, Anime-Sama, MangaDex (API publique), CMS « my Manga Reader » (Scan-VF et clones).
1. **Thème WordPress MangaReader** (`ts_reader.run`) : images et chapitres voisins exacts.
2. **Lecteurs connus** : Madara (`.reading-content`), Manganato (`.container-chapter-reader`) et quelques autres. Les images en chargement paresseux (`data-src`, `srcset`…) sont prises en compte.
3. **Détection générique** : le plus grand groupe de grandes images d'un même conteneur. Les couvertures, logos, bannières de pub et bandes de webtoon sont écartés. Dans ce cas, le lecteur n'est pas ouvert d'office : le bouton **Lire en mode livre** le propose.

### Scan-Manga

Scan-Manga protège ses scans : son lecteur les décode lui-même et révoque aussitôt leurs URLs. Le lecteur ne contourne pas cette protection. Il **affiche les pages que le site a déjà décodées** dans ton navigateur, dessinées dans un canvas (pas de copie, clic droit bloqué comme sur le site). Il fait aussi avancer le lecteur du site en arrière-plan pour qu'il continue à précharger la suite.

- Le site ne charge rien avant une activité réelle : **bouge la souris** à l'ouverture. Un message le rappelle.
- Tant que le **bandeau cookies** n'a pas de réponse, le site refuse d'avancer. Le lecteur le signale, et **Répondre** ferme le lecteur pour te laisser choisir. Rouvre-le ensuite avec « Lire en mode livre ».
- Chapitres précédent et suivant : repris des flèches du site.

Les liens vers les chapitres précédent et suivant sont cherchés par classe (`next`, `prev_page`…), par `rel`, puis par texte (« Chapitre suivant », « Next »…).

Limites : les sites qui chargent les images uniquement au défilement, ou qui les dessinent dans un `<canvas>`, ne sont pas détectés. Les webtoons (bandes verticales) ne conviennent pas au mode livre.

`Échap` revient au site. Le bouton flottant **Lire en mode livre** rouvre le lecteur. L'icône de l'extension ouvre les réglages (mode d'affichage, sens, animation, thème, couverture seule, ouverture automatique), appliqués en direct.

L'interface suit la langue du navigateur : anglais (par défaut), français, espagnol, portugais du Brésil, allemand, indonésien et japonais.

## Compatibilité

Le lecteur reconnaît les moteurs de lecture courants (thème WordPress MangaReader, Madara, my Manga Reader, MangaDex) et, à défaut, le plus grand groupe d'images d'une page. Un site ne marche pas ? Ouvre une issue en précisant son moteur si tu le connais, **sans lien vers du contenu piraté**.

### Plateformes avec DRM

Izneo dessine les pages dans un `<canvas>` à partir de données protégées (vérifié sur sa liseuse) : il n'existe aucune image exploitable sans contourner la protection, ce que l'extension ne fait pas. Google Play Livres protège aussi ses livres par DRM ; sa liseuse n'a pas été examinée en détail, mais elle n'est pas prise en charge non plus. Ces liseuses proposent déjà leur propre affichage page entière.

## Raccourcis

| Action | Touches |
| --- | --- |
| Page suivante / précédente | `←` / `→` en japonais (inversé en occidental), `Espace` / `⇧ Espace`, molette, balayage |
| Début / fin du chapitre | `Début` / `Fin` |
| Chapitre suivant / précédent | `N` / `P`, ou appuyer encore une fois en fin / début de chapitre |
| Une page → double → auto | `D` |
| Décaler les paires (couverture seule) | `O` |
| Sens de lecture | `S` |
| Animation | `A` |
| Sombre / clair | `M` |
| Zoom qui suit la souris | `Z` ou double-clic au centre |
| Plein écran | `F` |
| Aide | `?` |
| Fermer | `Échap` |

Clic sur le tiers gauche ou droit de l'écran : tourner la page. Clic au centre : afficher ou masquer l'interface (elle se cache seule).

## Structure

```
manifest.json
src/core.js      logique pure : extraction, détection générique, appariement des planches, clavier, mise en page
src/i18n.js      traductions de l'interface (chrome.i18n, dossier _locales/)
src/styles.js    styles du lecteur (Shadow DOM, isolés du site)
src/reader.js    lecteur : rendu en livre, tournage 3D, interface, préchargement
src/content.js   détection du chapitre (3 stratégies), réglages, bouton de lancement
src/sites.js     sites activés : autorisations, scripts enregistrés dynamiquement
background.js    service worker : garde sites, autorisations et scripts cohérents
popup/           réglages + activation du site courant
icons/
test/core.test.js
```

Pour la détection des pages, voir la section « Autres sites de scans ».

## Tests

```bash
node --test test/
```
