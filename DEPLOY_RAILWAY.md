# Deploy en Railway

Este repo ya incluye los archivos necesarios para Railway:

- `Dockerfile`: imagen de produccion.
- `railway.json`: builder Dockerfile, healthcheck y restart policy.
- `.dockerignore`: evita subir archivos locales, secretos y la base de datos local.

## 1. Crear el servicio

1. En Railway, crea un proyecto nuevo.
2. Agrega un servicio desde este repositorio de GitHub.
3. Railway debe detectar `railway.json` y construir con `Dockerfile`.

## 2. Configurar variables

Configura estas variables en el servicio:

```bash
ACCESS_CODE=mi-link-secreto
ADMIN_TOKEN=un-token-admin-largo-y-nuevo
DATA_DIR=/data

# Opcional: resultados automaticos
FOOTBALL_DATA_TOKEN=tu-api-key
FOOTBALL_DATA_COMPETITION=WC
FOOTBALL_DATA_SEASON=2026
RESULT_SYNC_INTERVAL_MINUTES=45
AUTO_RESULT_SYNC=true
AUTO_FIXTURE_SYNC=false
```

No configures `PORT`: Railway lo inyecta automaticamente y el servidor ya lo usa.

## 3. Agregar volumen persistente

La app guarda participantes, predicciones y resultados en un JSON. Para no perder datos entre deploys:

1. Agrega un volumen al servicio.
2. Montalo en `/data`.
3. Mantiene `DATA_DIR=/data`.

El calendario inicial se lee desde la imagen en `/app/data/matches.seed.json`, asi que el volumen puede empezar vacio.

## 4. Deploy

Haz push a la rama conectada a Railway o dispara un deploy manual. El healthcheck usa:

```text
/health
```

Cuando el deploy termine, abre el dominio publico de Railway. Si configuraste `ACCESS_CODE`, comparte el link con:

```text
https://tu-dominio.railway.app/?code=mi-link-secreto
```
