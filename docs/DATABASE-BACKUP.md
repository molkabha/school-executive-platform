# Database Backup

Un système de backup automatisé est en place pour la base de données PostgreSQL de ce projet, garantissant qu'aucune donnée n'est perdue et respectant les limites de la version gratuite de Supabase.

## Fonctionnement du Backup Automatique

1. **Déclenchement :** Une GitHub Action (`database-backup.yml`) s'exécute automatiquement tous les jours (ainsi que manuellement via `workflow_dispatch`).
2. **Configuration :** L'action utilise le secret GitHub `DATABASE_URL` pour se connecter à la base de données. *Ne jamais écrire ou logguer cette variable en clair.*
3. **Création :** Le script `backend/scripts/backup-db.sh` génère un dump au format PostgreSQL compressé (`-Fc`) à l'aide de `pg_dump`.
4. **Conservation :** Le fichier généré est téléchargé en tant que *GitHub Actions Artifact* et est conservé pendant **90 jours** (voir `retention-days` dans `.github/workflows/database-backup.yml`). Les backups ne sont pas committés dans le dépôt Git.

## Restauration

> ⚠️ **AVERTISSEMENT :** Ne jamais restaurer un backup directement sur la base de production sans avoir vérifié la base cible. La restauration écrasera et remplacera potentiellement les données existantes.

Si vous avez besoin de restaurer une sauvegarde (par exemple, sur une base locale pour du debug, ou suite à un incident majeur) :

1. Téléchargez l'artifact (ex: `school-executive-2026-08-16.dump`) depuis l'onglet **Actions** sur GitHub.
2. Utilisez la commande `pg_restore` pour injecter le dump dans votre base de données cible.

Exemple de commande de restauration :

```bash
pg_restore -d "postgresql://user:password@host:port/dbname" -1 --clean school-executive-2026-08-16.dump
```

- L'option `-1` (ou `--single-transaction`) enveloppe la restauration dans une transaction unique, s'assurant que soit tout passe, soit rien n'est modifié en cas d'erreur.
- L'option `--clean` supprime les objets de la base de données existante avant de les recréer (attention, destructif !).
