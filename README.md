# Mecopia Watchdog

Supervisa los servicios PM2 de Mecopia en `mecopia-admin-server` y envía un correo a `nandezgarcia@gmail.com` cuando alguno deje de estar `online`.

## Estado actual de PM2 (3 ago 2026)

```
┌────┬───────────────────────┬─────────┐
│ id │ name                  │ status  │
├────┼───────────────────────┼─────────┤
│ 2  │ exanter-api           │ online  │
│ 6  │ exanter-projection    │ online  │
│ 9  │ exanter-web           │ online  │
│ 1  │ front-agedap-admin    │ stopped │
│ 4  │ mecopia-back          │ online  │
│ 5  │ mecopia-web           │ online  │
│ 7  │ mecopia-web-admin     │ online  │
│ 3  │ naturgy-checker       │ stopped │
│ 0  │ nostr                 │ online  │
└────┴───────────────────────┴─────────┘
```

## Configuración del correo

El envío usa **Gmail + OAuth2**, igual que el backend de Mecopia (`/root/mecopia-web-backend/lib/mail.js`).

Las credenciales necesarias ya existen en `/root/mecopia-web-backend/.env`:

- `MAIL_USER`
- `MAIL_CLIENT_ID`
- `MAIL_CLIENT_SECRET`
- `MAIL_REFRESH_TOKEN`

> **Importante:** no se incluyen en este repositorio. Al desplegar se copiarán a `/opt/mecopia-watchdog/.env`.

## Modos de funcionamiento

- **`CHECK_MODE=local`** (recomendado): el watchdog corre **dentro de `mecopia-admin-server`** y ejecuta `pm2 jlist` localmente. Así puede usar las mismas credenciales OAuth2 del backend.
- **`CHECK_MODE=ssh`**: corre en otra máquina, se conecta por SSH a `mecopia-admin-server` y ejecuta `pm2 jlist`. Útil si quieres monitorizar desde fuera, pero entonces el envío de correo necesitará las credenciales OAuth2 copiadas a esa máquina.

## Anti-spam

Guarda el estado en `data/state.json`:

- Envía alerta inmediata al detectar una caída.
- No reenvía hasta que pase `ALERT_INTERVAL_MS` (por defecto 5 min) mientras siga caído.
- Envía correo de recuperación cuando el servicio vuelva a `online`.

## Despliegue automático en `mecopia-admin-server` (modo local)

Desde este directorio:

```bash
./scripts/deploy.sh
```

El script:

1. Sube el código a `/opt/mecopia-watchdog`.
2. Instala dependencias con `npm ci`.
3. Genera el `.env` copiando las credenciales OAuth2 de `/root/mecopia-web-backend/.env`.
4. Instala y activa el timer de systemd.
5. Ejecuta una prueba en seco (`DRY_RUN=true`).

## Verificación

```bash
ssh mecopia-admin-server 'systemctl status mecopia-watchdog.timer'
ssh mecopia-admin-server 'journalctl -u mecopia-watchdog.service -f'
```

## Variables de entorno

Ver `.env.example`.

## Logs

```bash
journalctl -u mecopia-watchdog.service -f
```
