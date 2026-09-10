# Drive

Application terrain Drive, désormais auto-hébergée sur `https://drive.mycloudapi.fr`.

## Architecture de production

- `drive-web` : frontend React/Vite servi par Nginx ;
- `drive-api` : API Express, authentification et autorisations côté serveur ;
- `drive-db` : PostgreSQL 16 dédié, sans port publié ;
- `drive-backup` : sauvegarde quotidienne de PostgreSQL et des médias, conservée 30 jours ;
- Traefik : terminaison HTTPS et routage du sous-domaine.

La base reste exclusivement sur le réseau Docker interne `drive-private`. L'API utilise aussi `drive-egress` pour ses rares appels sortants, sans port publié. Seul Nginx rejoint le réseau public de Traefik. L'API se connecte avec le rôle PostgreSQL limité `drive_app`; le compte propriétaire est réservé aux migrations et sauvegardes. Les PIN historiques sont migrés vers Argon2id lors de la première connexion réussie et les sessions utilisent un cookie `HttpOnly`, `Secure` et `SameSite=Strict`.

## Développement local

```bash
npm ci
npm ci --prefix server
cp .env.example .env
docker compose up -d db
set -a; source .env; set +a
npm --prefix server start
npm run dev
```

Le frontend Vite relaie `/api` vers `127.0.0.1:3000`.

Les prix et ruptures de carburants proviennent directement du flux officiel du ministère de l'Économie. La correspondance station/enseigne, absente de l'Open Data officiel, est conservée dans PostgreSQL.

## Déploiement VPS

Le déploiement actif se trouve dans `/opt/drive` sur le VPS. Le fichier `.env` de production n'est jamais versionné.

```bash
cd /opt/drive
sudo docker compose up -d --build
sudo docker compose ps
curl -fsS https://drive.mycloudapi.fr/health
```

En DNS, `drive.mycloudapi.fr` doit avoir un enregistrement `A` vers `152.228.238.158`. Traefik demandera ensuite automatiquement le certificat Let's Encrypt.

## Sauvegardes

Les archives sont écrites dans `/opt/drive/data/backups` :

- `drive-<date>.dump` pour PostgreSQL ;
- `drive-uploads-<date>.tar.gz` pour les photos et avatars.

Validation d'une archive PostgreSQL :

```bash
sudo docker exec drive-backup pg_restore --list /backups/drive-<date>.dump
```

## Migration Supabase

L'export se fait avec `scripts/export-supabase.mjs`. L'import idempotent est disponible via le profil d'outillage :

```bash
sudo docker compose --profile tools run --rm migrate
```

Les identifiants Supabase ne doivent être placés ni dans le frontend ni dans Git.
