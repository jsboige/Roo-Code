# Analyse des Capacités de Test pour `roo-code`

**Date :** 2025-08-02
**Auteur :** Roo, Assistant Technique
**Protocole :** SDDD

---

## 1. Objectif

Cette analyse vise à déterminer une méthode viable pour tester localement les modifications apportées au fork de `roo-code` sur une instance installée de l'extension VS Code, sans nécessiter un processus de packaging et de signature complet.

---

## 2. Processus de Build

L'investigation du projet `roo-code` a révélé les points suivants concernant le processus de build :

*   **Orchestration :** La commande principale `pnpm bundle` est lancée depuis le répertoire `roo-code/src/`.
*   **Technologie :** Le script [`esbuild.mjs`](roo-code/src/esbuild.mjs:1) est utilisé pour la transpilation du TypeScript en JavaScript.
*   **Sortie (Output) :** Le processus de build génère un répertoire `dist/` à la racine de `roo-code/src/`. Ce répertoire contient tous les fichiers JavaScript compilés et les ressources statiques nécessaires au fonctionnement de l'extension.

---

## 3. Localisation de l'Extension Installée

Le répertoire d'installation de l'extension a été localisé à l'adresse suivante sur le système de fichiers :

*   `C:/Users/jsboi/.vscode/extensions/rooveterinaryinc.roo-cline-3.25.6/`

L'analyse de ce répertoire a montré qu'il contenait également un sous-répertoire `dist/` dont la structure est identique à celle produite par le script de build local.

---

## 4. Conclusion : Procédure de Test par "Hot-Swapping"

Le test local par remplacement manuel des fichiers ("hot-swapping") est **confirmé comme étant une méthode viable**.

La procédure est la suivante :

1.  **Compiler localement :** Exécuter la commande `pnpm bundle` dans le répertoire `roo-code/src/`.
2.  **Copier les artefacts :** Remplacer le contenu du répertoire `dist/` de l'extension installée (`C:/Users/jsboi/.vscode/extensions/rooveterinaryinc.roo-cline-3.25.6/dist/`) par le contenu du répertoire `dist/` généré localement (`roo-code/src/dist/`).
3.  **Redémarrer VS Code :** Un redémarrage complet de l'éditeur est nécessaire pour qu'il charge les nouveaux fichiers de l'extension.