# Deploy en Oracle Cloud Always Free

Esta guia publica la quiniela en una VM gratuita de Oracle Cloud con disco persistente.

## 1. Crear la VM

1. Entra a Oracle Cloud.
2. Ve a `Compute` -> `Instances` -> `Create instance`.
3. Elige una imagen Ubuntu, por ejemplo Ubuntu 22.04 o 24.04.
4. Elige una shape marcada como `Always Free`, preferiblemente Ampere A1 si esta disponible.
5. Descarga o pega tu llave SSH publica.
6. Crea la instancia.

Guarda:

- IP publica de la VM.
- Usuario SSH, normalmente `ubuntu`.
- Ruta de tu llave privada.

## 2. Abrir puertos en Oracle

En la VCN/Subnet de la instancia, agrega reglas de entrada:

- TCP `22` desde tu IP para SSH.
- TCP `80` desde `0.0.0.0/0` para HTTP.
- TCP `443` desde `0.0.0.0/0` para HTTPS.

## 3. Entrar por SSH

```bash
ssh -i /ruta/a/tu-llave.key ubuntu@IP_PUBLICA
```

## 4. Instalar Node, Git y Caddy

```bash
sudo apt update
sudo apt install -y nodejs npm git caddy
node --version
```

La app necesita Node 18 o superior. Si Ubuntu instala una version vieja, instala Node LTS con NodeSource.

## 5. Subir el proyecto

Opcion A: clonar desde GitHub:

```bash
sudo mkdir -p /opt/quiniela-mundial
sudo chown -R ubuntu:ubuntu /opt/quiniela-mundial
git clone URL_DE_TU_REPO /opt/quiniela-mundial
```

Opcion B: subir la carpeta desde tu computadora:

```bash
scp -i /ruta/a/tu-llave.key -r ./crea-un-proyecto-web-con-tecnologias ubuntu@IP_PUBLICA:/tmp/quiniela-mundial
ssh -i /ruta/a/tu-llave.key ubuntu@IP_PUBLICA
sudo mkdir -p /opt/quiniela-mundial
sudo cp -r /tmp/quiniela-mundial/* /opt/quiniela-mundial/
```

## 6. Configurar variables

```bash
cd /opt/quiniela-mundial
sudo cp .env.production.example .env
sudo nano .env
```

Edita:

```bash
ACCESS_CODE=quiniela-amigos-2026
ADMIN_TOKEN=un-token-admin-nuevo
FOOTBALL_DATA_TOKEN=tu-api-key-nueva
DATA_DIR=/opt/quiniela-mundial/data
```

## 7. Crear usuario y permisos

```bash
sudo useradd --system --home /opt/quiniela-mundial --shell /usr/sbin/nologin quiniela || true
sudo mkdir -p /opt/quiniela-mundial/data
sudo chown -R quiniela:quiniela /opt/quiniela-mundial
```

## 8. Instalar servicio systemd

```bash
sudo cp /opt/quiniela-mundial/deploy/quiniela-mundial.service /etc/systemd/system/quiniela-mundial.service
sudo systemctl daemon-reload
sudo systemctl enable quiniela-mundial
sudo systemctl start quiniela-mundial
sudo systemctl status quiniela-mundial
```

Probar localmente desde la VM:

```bash
curl http://127.0.0.1:3000/api/state
```

## 9. Configurar dominio y HTTPS

Apunta un dominio o subdominio a la IP publica de la VM con un registro `A`.

Ejemplo:

```text
quiniela.tudominio.com -> IP_PUBLICA
```

Edita Caddy:

```bash
sudo nano /etc/caddy/Caddyfile
```

Contenido:

```caddyfile
quiniela.tudominio.com {
  reverse_proxy 127.0.0.1:3000
}
```

Reinicia Caddy:

```bash
sudo systemctl reload caddy
```

Tu link final sera:

```text
https://quiniela.tudominio.com/?code=quiniela-amigos-2026
```

## 10. Importar partidos y verificar cron

1. Abre el sitio.
2. Entra con `?code=quiniela-amigos-2026`.
3. Abre `Admin: capturar resultados`.
4. Usa tu `ADMIN_TOKEN`.
5. Presiona `Importar partidos API`.
6. Presiona `Sincronizar API` para probar resultados.

Despues de eso, el servidor consultara resultados automaticamente cada `RESULT_SYNC_INTERVAL_MINUTES`.

## Comandos utiles

Ver logs:

```bash
sudo journalctl -u quiniela-mundial -f
```

Reiniciar app:

```bash
sudo systemctl restart quiniela-mundial
```

Actualizar app tras subir cambios:

```bash
cd /opt/quiniela-mundial
sudo systemctl stop quiniela-mundial
sudo git pull
sudo chown -R quiniela:quiniela /opt/quiniela-mundial
sudo systemctl start quiniela-mundial
```

Respaldar base:

```bash
sudo cp /opt/quiniela-mundial/data/quiniela.db.json ~/quiniela-db-backup.json
```
