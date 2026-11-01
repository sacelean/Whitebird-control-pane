# CI/CD a una instancia OCI

La pipeline ejecuta `npm ci` y `npm test` en cada PR y push a `main`.
Solo después de superar CI, los pushes a `main` y las ejecuciones manuales
sobre `main` despliegan el artefacto probado por SSH al entorno `production`.
No se publican tokens ni archivos de los bots como artefactos.

## 1. Preparación de la máquina (una vez)

Se requiere Linux con systemd, Node.js **22** en `/usr/bin/node`, npm,
OpenSSH, curl, tar, util-linux (`flock`), make, g++ y Python 3. Estos últimos
permiten compilar `better-sqlite3` cuando no haya binario para la arquitectura.
La instalación de npm en OCI requiere salida a Internet. No se necesita Docker.

Copia la carpeta `deploy/` a la máquina. Como administrador, ejecuta:

```sh
sudo useradd --create-home --shell /bin/bash whitebird-panel
sudo install -d -o whitebird-panel -g whitebird-panel -m 0750 \
  /opt/whitebird-control-panel \
  /opt/whitebird-control-panel/incoming \
  /opt/whitebird-control-panel/releases
sudo install -m 0644 deploy/whitebird-control-panel.service /etc/systemd/system/
sudo install -m 0600 deploy/panel.env.example /etc/whitebird-control-panel.env
sudoedit /etc/whitebird-control-panel.env
sudo systemctl daemon-reload
sudo systemctl enable whitebird-control-panel
```

Si el usuario ya existe, omite `useradd`. Configura rutas **absolutas** de los
bots en `/etc/whitebird-control-panel.env`. Mantén `PANEL_PORT=3080`, utilizado
por el health check. El servicio lee este archivo con systemd; no necesita
un `.env` en cada release.

El usuario `whitebird-panel` necesita poder recorrer los directorios de los
bots, leer sus SQLite y leer/escribir sus `.env`. También necesita escritura
en la carpeta que contiene cada `.env`: el panel guarda mediante reemplazo
atómico. Los archivos guardados pertenecen a `whitebird-panel` y tienen modo
0600; comprueba que el usuario que recrea los contenedores puede leerlos.
Configura los permisos según los usuarios existentes, sin abrir secretos a
otros usuarios. Las rutas SQLite que solo existen dentro de contenedores no
serán accesibles desde este proceso del host.

Autoriza una clave SSH exclusiva de despliegue en
`/home/whitebird-panel/.ssh/authorized_keys` (carpeta 0700, archivo 0600,
propietario `whitebird-panel`). No copies la clave privada al servidor.

Con `sudo visudo -f /etc/sudoers.d/whitebird-control-panel`, añade estas reglas
(ajusta `/usr/bin/systemctl` si `command -v systemctl` devuelve otra ruta):

```sudoers
whitebird-panel ALL=(root) NOPASSWD: /usr/bin/systemctl restart whitebird-control-panel
whitebird-panel ALL=(root) NOPASSWD: /usr/bin/systemctl stop whitebird-control-panel
whitebird-panel ALL=(root) NOPASSWD: /usr/bin/systemctl is-active --quiet whitebird-control-panel
```

El servicio y su archivo de entorno deben seguir siendo propiedad de root.
El despliegue no los actualiza; si los cambias, instálalos como administrador
y ejecuta `systemctl daemon-reload` y reinicia el servicio.

## 2. Configuración de GitHub

Crea el environment **production** en Settings → Environments del repositorio.
Añade estos secrets al environment:

| Secret | Contenido |
| --- | --- |
| `OCI_HOST` | IP pública o nombre DNS de la máquina |
| `OCI_USER` | `whitebird-panel` |
| `OCI_SSH_KEY` | Clave privada de despliegue completa, sin passphrase |
| `OCI_KNOWN_HOSTS` | Entrada known_hosts del servidor verificada por un canal de confianza |

Opcionalmente, define la variable `OCI_SSH_PORT` (por defecto `22`). Para un
puerto distinto, la entrada known_hosts debe usar `[host]:puerto`. Puedes
obtener la entrada con `ssh-keyscan -p PUERTO HOST`, pero comprueba su huella
contra las claves del servidor antes de guardarla; la pipeline exige
`StrictHostKeyChecking=yes`.

La instancia debe ser accesible por SSH desde el runner de GitHub. Configura
las reglas de red de OCI y el firewall del host según la red de tus runners.
Si usas un runner con salida fija, limita el acceso SSH a esa dirección.

Haz push a `main` o ejecuta el workflow `CI / CD OCI` sobre esa rama.
Si tu rama de producción tiene otro nombre, cambia los dos filtros `main`
en `.github/workflows/ci-cd.yml`.

## 3. Acceso y operación

El panel administra secretos y mantiene su acceso local original. No abras
3080 en OCI. Desde tu ordenador, con tu usuario habitual de administración:

```sh
ssh -N -L 3080:127.0.0.1:3080 usuario@HOST_OCI
```

Abre `http://127.0.0.1:3080`. Usa ese puerto local para que coincidan las
validaciones de Host y Origin del servidor.

```sh
sudo systemctl status whitebird-control-panel
sudo journalctl -u whitebird-control-panel -n 100 --no-pager
```

Cada despliegue instala dependencias en una carpeta nueva de `releases/` y
cambia `current` mediante un enlace atómico antes de reiniciar. Se comprueban
el servicio, `/api/projects` y la página principal; los bots ausentes no impiden
arrancar. Si el arranque falla, se restaura el enlace anterior y se reinicia.
Hay una breve interrupción al reiniciar. Las releases se conservan para
recuperación manual: elimina periódicamente las antiguas, manteniendo la
actual y al menos la anterior. Un fallo antes de activar puede dejar archivos
en `incoming/` o una release sin activar.

El despliegue solo reinicia el panel. Los cambios guardados en los bots se
aplican con los comandos de recreación descritos en el README principal.
