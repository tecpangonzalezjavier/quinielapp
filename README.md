# Quiniela Mundial

App web plug and play para una quiniela privada del Mundial.

## Que incluye

- Registro por nombre, con limite de 50 participantes.
- Link privado opcional mediante `ACCESS_CODE`.
- El navegador guarda el ID del participante en `localStorage`.
- Predicciones por partido: local, empate o visita en grupos; equipo que avanza en eliminatoria.
- Cada prediccion queda bloqueada automaticamente al iniciar ese partido.
- Incluye fase de grupos y eliminatoria hasta la final cuando se importa calendario desde la API.
- Tabla de posiciones con podio para primero, segundo y tercero.
- Panel admin para cargar resultados y recalcular puntos.
- Sincronizacion opcional de resultados con `football-data.org`.
- Base de datos embebida en archivo JSON: `data/quiniela.db.json`.

## Ejecutar local

```bash
npm start
```

Abre `http://localhost:3000`.

Si configuras `ACCESS_CODE`, puedes compartir el link asi:

```text
https://tu-dominio.com/?code=mi-link-secreto
```

Con ese formato tus amigos solo ven el campo de nombre.

Variables utiles:

```bash
PORT=3000
ACCESS_CODE=mi-link-secreto
ADMIN_TOKEN=mi-token-admin
DATA_DIR=./data
FOOTBALL_DATA_TOKEN=tu-api-key
FOOTBALL_DATA_COMPETITION=WC
FOOTBALL_DATA_SEASON=2026
RESULT_SYNC_INTERVAL_MINUTES=45
AUTO_RESULT_SYNC=true
AUTO_FIXTURE_SYNC=false
```

En Windows PowerShell:

```powershell
$env:ACCESS_CODE="mi-link-secreto"
$env:ADMIN_TOKEN="mi-token-admin"
$env:FOOTBALL_DATA_TOKEN="tu-api-key"
npm start
```

## Resultados automaticos

La app puede sincronizar resultados desde `football-data.org`. Esa API lista FIFA World Cup en su Free Tier y usa el header `X-Auth-Token`.

Pasos:

1. Crea una cuenta y API key en `football-data.org`.
2. Configura `FOOTBALL_DATA_TOKEN`.
3. Deja `FOOTBALL_DATA_COMPETITION=WC` y `FOOTBALL_DATA_SEASON=2026`.
4. Entra al panel admin y usa `Importar partidos API` para cargar calendario completo: fase de grupos y eliminatoria.
5. Ajusta `RESULT_SYNC_INTERVAL_MINUTES`; 45 o 60 minutos es suficiente para no gastar llamadas.

Cuando `FOOTBALL_DATA_TOKEN` existe, el servidor consulta automaticamente los partidos del torneo y solo guarda resultados con estado `FINISHED`. Tambien puedes forzar una corrida desde el panel admin con el boton `Sincronizar API`.

Si quieres que el servidor intente importar el calendario al arrancar, configura `AUTO_FIXTURE_SYNC=true`. Para evitar cambios accidentales cuando la quiniela ya esta abierta, por defecto esta apagado y se dispara desde admin.

Para que el cruce sea exacto, agrega `externalId` a cada partido cuando tengas el calendario oficial desde la API:

```json
{
  "id": "m01",
  "externalId": "123456",
  "group": "Grupo A",
  "home": "Mexico",
  "away": "Equipo A2",
  "startsAt": "2026-06-11T19:00:00-06:00",
  "venue": "Estadio Azteca, Ciudad de Mexico"
}
```

Si no hay `externalId`, la app intenta empatar por nombres de equipos y fecha del partido, pero `externalId` es mucho mas confiable.

El boton `Importar partidos API` ya guarda ese `externalId` automaticamente, asi que despues los resultados se enlazan por ID del proveedor y los puntos se recalculan solos. En eliminatoria, si la API todavia no conoce los equipos, la app muestra `Por definir` y bloquea el pick hasta que una sincronizacion complete la llave.

## Publicar

Este proyecto no usa dependencias externas, asi que se puede subir a cualquier host que ejecute Node.js 18+ y permita escritura persistente en disco.

Opciones sencillas:

- Un VPS gratuito o economico con Node.js.
- Un servicio tipo Render, Railway, Fly.io, Koyeb o Replit si te permite disco persistente o volumen.
- Un servidor casero o NAS con Node.js y un proxy como Caddy/Nginx.

Para Railway, usa la guia especifica en `DEPLOY_RAILWAY.md`. Este repo incluye `railway.json`, `.dockerignore` y un `Dockerfile` preparado para montar un volumen en `/data`.

Configura estas variables en el host:

- `ACCESS_CODE`: codigo que deben conocer tus amigos para entrar.
- `ADMIN_TOKEN`: token para capturar resultados.
- `DATA_DIR`: ruta persistente donde se guardara la base de datos.

Importante: si el host borra archivos al reiniciar y no tiene volumen persistente, se perderan participantes y predicciones. Para algo entre amigos, un archivo JSON persistente es suficiente y evita montar Postgres/MySQL.

## Railway y persistencia

Railway borra los archivos escritos en el filesystem del contenedor al hacer redeploy si no usas un Volume. Para conservar participantes, predicciones y resultados:

1. En Railway, abre el proyecto.
2. Crea un `Volume` y conéctalo al servicio de la app.
3. Configura el mount path como:

```text
/app/data
```

Railway inyecta automaticamente `RAILWAY_VOLUME_MOUNT_PATH`; la app lo detecta y guarda ahi `quiniela.db.json`. No necesitas configurar `DATA_DIR` si usas el volume.

Si prefieres configurarlo manualmente, usa:

```text
DATA_DIR=/app/data
```

No montes el volume sobre la raiz `/app`, solo sobre `/app/data`.

## Calendario de partidos

Los partidos iniciales viven en `config/matches.seed.json`. Al primer arranque se crea `data/quiniela.db.json` copiando esa lista.

Para cambiar el calendario antes de abrir la quiniela:

1. Edita `config/matches.seed.json`.
2. Borra `data/quiniela.db.json` si ya se habia creado en pruebas.
3. Reinicia la app.

Formato:

```json
{
  "id": "m01",
  "group": "Grupo A",
  "home": "Mexico",
  "away": "Equipo A2",
  "startsAt": "2026-06-11T19:00:00-06:00",
  "venue": "Estadio Azteca, Ciudad de Mexico"
}
```

Use la pagina oficial de FIFA como referencia para el calendario: https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums

Referencia API: https://www.football-data.org/documentation/api
