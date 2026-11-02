#!/usr/bin/env bash
set -euo pipefail

release=${1:?Indica el identificador de release}
[[ "$release" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Release no válida' >&2; exit 1; }
root=/opt/whitebird-control-panel
service=whitebird-control-panel
exec 9>"$root/.deploy.lock"
flock -n 9 || { echo 'Ya hay un despliegue en curso' >&2; exit 1; }
cd "$root/incoming/$release"
[[ $(node -p 'process.versions.node.split(".")[0]') == 22 ]] || { echo 'Se requiere Node.js 22' >&2; exit 1; }
# Instala el módulo SQLite nativo en la arquitectura real de OCI (ARM o x86).
npm ci --omit=dev
# Verifica imports y el módulo nativo antes de cambiar la release activa.
# Importar server.js no abre el puerto ni modifica las bases de datos de los bots.
node --input-type=module <<'JS'
import { createPanel } from './server.js';
import Database from 'better-sqlite3';
import { accessSync } from 'node:fs';
if (typeof createPanel !== 'function') throw new Error('No se pudo cargar el servidor del panel.');
const db = new Database(':memory:');
db.prepare('SELECT 1').get();
db.close();
for (const file of ['index.html', 'app.js', 'help.js', 'style.css', 'logo.png']) {
  accessSync(`public/${file}`);
}
console.log('Release verificada: imports, SQLite y archivos públicos disponibles.');
JS
mkdir -p "$root/releases"
mv "$root/incoming/$release" "$root/releases/$release"
previous=$(readlink -f "$root/current" || true)
activate() {
  ln -s "$1" "$root/.current-next"
  mv -Tf "$root/.current-next" "$root/current"
}
activate "$root/releases/$release"
healthy() {
  local attempt
  for attempt in {1..20}; do
    if sudo -n systemctl is-active --quiet "$service" && curl --fail --silent --max-time 2 "http://127.0.0.1:3080/api/projects" >/dev/null; then
      sleep 2
      sudo -n systemctl is-active --quiet "$service" && curl --fail --silent --max-time 2 "http://127.0.0.1:3080/" >/dev/null && return 0
    fi
    sleep 1
  done
  return 1
}
if sudo -n systemctl restart "$service" && healthy; then
  echo "Desplegada release $release"
else
  echo 'El despliegue ha fallado; restaurando la versión anterior.' >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    activate "$previous"
    sudo -n systemctl restart "$service"
    healthy || echo 'La versión anterior tampoco responde. Revisa journalctl.' >&2
  else
    sudo -n systemctl stop "$service"
    rm -f "$root/current"
  fi
  exit 1
fi
