# Whitebird · Centro de control

Proyecto independiente para administrar WoW Role Sync, Recruitment y Ruleta mediante un selector de bots, con archivos de configuración separados. No arranca el bot ni envía mensajes a Discord.

## Organización independiente

Este repositorio contiene el frontend y la API local de administración. Tiene sus propias dependencias, pruebas y configuración; no importa código de los bots. Las rutas relativas de SQLite se resuelven desde la carpeta del `.env` de cada bot.

Estructura predeterminada:

```text
proyectos/
  whitebird-control-panel/
  whitebird-wow-role-sync/
  whitebird-recruitment-bot/
  whitebird-wow-wheel/
```

El `.env` de este panel contiene solo `PANEL_*`: rutas y puerto. Los tokens permanecen en los `.env` propios de cada bot. No copies credenciales ni bases de datos al repositorio del panel. Las variables exportadas en la terminal prevalecen sobre su `.env`.

## Arranque

Requiere Node.js 22 o posterior. Desde la raíz de este repositorio:

```sh
npm ci
cp .env.example .env
# Ajusta las rutas de los bots en .env si están en otras carpetas.
npm start
```

Abre **http://127.0.0.1:3080**. El servidor escucha solo en loopback y exige esa dirección. Para acceder a un servidor remoto, usa un túnel SSH:

```sh
ssh -L 3080:127.0.0.1:3080 usuario@servidor
```

Ejecuta el panel en el host que contiene el `.env` del bot y su carpeta `data/`, con un usuario que tenga permisos de acceso. No publiques este puerto: esta versión es una herramienta de administración local sin inicio de sesión multiusuario.

## Configuración y estado

- Lee y edita `../whitebird-wow-role-sync/.env`, conservando variables ajenas y comentarios de otras líneas. `PANEL_ENV_PATH` permite indicar otro archivo. Los valores guardados se entrecomillan; no se admiten saltos de línea.
- `PANEL_PORT` cambia el puerto (3080 por defecto).
- Recruitment se busca en `../whitebird-recruitment-bot/.env`, como proyecto hermano de este panel. `PANEL_RECRUITMENT_ENV_PATH` permite indicar su archivo. El panel no crea archivos ausentes ni modifica parámetros de un bot al guardar otro.
- Ruleta se busca en `../whitebird-wow-wheel/.env`. `PANEL_ROULETTE_ENV_PATH` permite indicar otro archivo. Sin un archivo local aparece como no disponible; el panel no descarga credenciales desde GitHub. Su SQLite por defecto es `data/whitebird.sqlite`.
- Los archivos deben existir y ser accesibles; si falta uno, se muestra como no disponible.
- Lee la base `DATABASE_PATH` indicada en ese `.env`, relativa al directorio del bot. Por defecto usa `data/whitebird-wow-roles.sqlite`. Abre SQLite exclusivamente en lectura, sin importar el módulo de migraciones del bot.
- Muestra vinculaciones, canales, reparto de calderos, destino del informe y los diez cambios de roles más recientes del servidor configurado.
- Los secretos nunca se devuelven al navegador; se pueden sustituir o eliminar explícitamente.
- Valida tipos, IDs, JSON, horario y roles duplicados. La existencia, permisos y jerarquía de roles se comprueban en el bot al sincronizar, no desde este panel.
- Rechaza guardados con revisión obsoleta y serializa las escrituras del propio panel. Evita editar el `.env` simultáneamente con herramientas externas durante un guardado.
- Guarda con reemplazo atómico y permisos 0600. No modifica SQLite ni aplica migraciones.

**Guardar no aplica la configuración al proceso en ejecución.** En la raíz del bot ejecuta:

```sh
docker compose up -d --force-recreate bot
```

Si ejecutas Node directamente, reinicia su proceso. No ejecutes una segunda instancia del bot. El panel muestra datos guardados, no disponibilidad en vivo de Discord ni confirmación de configuración aplicada. Los valores por defecto del formulario no implican que la integración esté operativa.

## Alcance de los módulos

Discord, sincronización, roster y WoWAudit tienen formularios con las variables que el bot consume. Roster se desactiva vaciando su ID; WoWAudit se desactiva eliminando su API key (afecta tanto al informe como a los avisos). No existen interruptores independientes para todas las funciones actuales.

Calderos muestra el reparto y panel guardados; usa `/calderos-asignar` y `/calderos-publicar` para cambiarlos. El destino de raiders se establece con `/informe-raiders`. BIS y ascensos muestran las instrucciones de gestión. Recruitment incluye sus propias credenciales, categorías, transcripciones, mensajes, cinco preguntas y conexión compartida con WoW Sync. Su SQLite muestra el panel de solicitudes publicado. No almacena un historial de applies en su esquema actual.

`WOW_ROLE_SYNC_DATA_DIR` es una carpeta del host usada por Docker Compose. `WOW_ROLE_SYNC_DATABASE_PATH` es una ruta del proceso para ejecución directa; Compose la sobrescribe con `/app/wow-role-sync-data/whitebird-wow-roles.sqlite`. Las rutas del contenedor pueden no existir en el host: el panel mostrará SQLite no disponible si `DATABASE_PATH` apunta a una ruta inaccesible.

Después de guardar recruitment, recrea su contenedor desde el directorio de ese proyecto. No hace falta recrear el bot de WoW por cambios exclusivos de recruitment.

Ejemplo con rutas explícitas:

```sh
PANEL_ENV_PATH=/ruta/wow/.env PANEL_RECRUITMENT_ENV_PATH=/ruta/recruitment/.env npm start
```

## Verificación

```sh
npm test
```

Incluye pruebas de ocultación de secretos, conservación del archivo, serialización, validación y roles duplicados. Para una comprobación manual, usa una copia de `.env` con `PANEL_ENV_PATH`, cambia un horario, guarda y vuelve a cargar. Comprueba que el valor queda persistido y que las credenciales existentes se conservan.

## Ruleta de alters

Adaptador revisado contra [sacelean/whitebird-wow-wheel](https://github.com/sacelean/whitebird-wow-wheel): credenciales Discord, Application ID, servidor y roles de oficiales. Las 13 clases, probabilidades y caché de Raider.IO no tienen variables de entorno: se muestran como comportamiento del bot, sin interruptores ficticios. El estado de asignaciones, roles, personajes, estadísticas y panel se consulta en modo de solo lectura. Los cambios de ronda y asignaciones siguen en los comandos de Discord.

Si el código/archivo de ruleta está en otra carpeta, arranca con:

```sh
PANEL_ROULETTE_ENV_PATH=/ruta/whitebird-wow-wheel/.env npm start
```

Aunque el bot permite comandos globales sin `DISCORD_GUILD_ID`, para visualizar SQLite en el panel debes indicar el servidor. Después de guardar ruleta, ejecuta desde su proyecto `docker compose up -d --force-recreate whitebird-wow-wheel`.
