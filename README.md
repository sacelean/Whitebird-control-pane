# Whitebird · Centro de control

Proyecto independiente para administrar WoW Role Sync, Recruitment, Ruleta y Whitebird IA mediante un selector, con archivos de configuración separados. Permite recrear los bots con Docker Compose cuando se habilita esa opción; los componentes IA se aplican con systemd, manualmente o mediante propuestas confirmadas en el chat cuando se habilita esa opción.

## Organización independiente

Este repositorio contiene el frontend y la API local de administración. Tiene sus propias dependencias, pruebas y configuración; la vista previa del informe reutiliza el módulo de sincronización de WoW Role Sync en un proceso aislado con adaptadores de solo consulta. Las rutas relativas de SQLite se resuelven desde la carpeta del `.env` de cada bot.

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

- Lee y edita `../whitebird-wow-role-sync/.env`, conservando variables ajenas y comentarios de otras líneas. `PANEL_ENV_PATH` permite indicar otro archivo. Los valores simples (IDs, horas, rutas) se guardan sin comillas. Los textos que lo necesitan usan comillas compatibles con dotenv y Docker Compose, nunca comillas invertidas. Los mensajes admiten saltos de línea. Al guardar se corrigen también las comillas invertidas antiguas de los campos gestionados del bot seleccionado.
- `PANEL_PORT` cambia el puerto (3080 por defecto).
- Recruitment se busca en `../whitebird-recruitment-bot/.env`, como proyecto hermano de este panel. `PANEL_RECRUITMENT_ENV_PATH` permite indicar su archivo. El panel no crea archivos ausentes ni modifica parámetros de un bot al guardar otro.
- Ruleta se busca en `../whitebird-wow-wheel/.env`. `PANEL_ROULETTE_ENV_PATH` permite indicar otro archivo. Sin un archivo local aparece como no disponible; el panel no descarga credenciales desde GitHub. Su SQLite por defecto es `data/whitebird.sqlite`.
- Los archivos deben existir y ser accesibles; si falta uno, se muestra como no disponible.
- Lee la base `DATABASE_PATH` indicada en ese `.env`, relativa al directorio del bot. Por defecto usa `data/whitebird-wow-roles.sqlite`. Abre SQLite exclusivamente en lectura, sin importar el módulo de migraciones del bot.
- Muestra vinculaciones, canales, reparto de calderos, destino del informe y los diez cambios de roles más recientes del servidor configurado.
- Los secretos nunca se devuelven al navegador; se pueden sustituir o eliminar explícitamente.
- Valida tipos, IDs, JSON, horario y roles duplicados. El guardado no consulta Discord. El asistente dispone de una herramienta separada para comprobar permisos efectivos, existencia y jerarquía de roles en Discord; el bot conserva sus comprobaciones al sincronizar.
- Rechaza guardados con revisión obsoleta y serializa las escrituras del propio panel. Evita editar el `.env` simultáneamente con herramientas externas durante un guardado.
- Guarda con reemplazo atómico y permisos 0600. No modifica SQLite ni aplica migraciones.

**Guardar no aplica la configuración al proceso en ejecución.** Tras guardar, pulsa **Aplicar guardado y reiniciar** y confirma para recrear solo el bot seleccionado. Requiere `PANEL_RESTART_ENABLED=true` y acceso a Docker Compose del usuario del panel. Alternativamente, en la raíz del bot ejecuta:

```sh
docker compose up -d --force-recreate bot
```

Si ejecutas Node directamente, reinicia su proceso. No ejecutes una segunda instancia del bot. El panel muestra datos guardados, no disponibilidad en vivo de Discord ni confirmación de configuración aplicada. Los valores por defecto del formulario no implican que la integración esté operativa.

Cada campo dispone de un icono de información con una explicación de su uso. La ayuda se abre al pasar el ratón, enfocar el icono con el teclado o tocarlo; Escape la cierra. Cada bot tiene un apartado **Comandos de Discord** con la descripción, sintaxis, parámetros y permisos de sus comandos.

## Alcance de los módulos

Discord, sincronización, roster y WoWAudit tienen formularios con las variables que el bot consume. Roster se desactiva vaciando su ID; WoWAudit se desactiva eliminando su API key (afecta tanto al informe como a los avisos). No existen interruptores independientes para todas las funciones actuales.

Calderos muestra el reparto y panel guardados. Las asignaciones se cambian únicamente en Discord con `/calderos-asignar`, que actualiza el mensaje del reparto automáticamente. Usa `/calderos-publicar` para publicar o mover ese mensaje. El destino de raiders se establece con `/informe-raiders`. BIS y ascensos muestran las instrucciones de gestión. Recruitment incluye sus propias credenciales, categorías, transcripciones, mensajes, cinco preguntas y conexión compartida con WoW Sync. Su SQLite muestra el panel de solicitudes publicado y, cuando existe la tabla `recruitment_decisions`, el registro de decisiones de aceptación y rechazo. No reconstruye decisiones anteriores a la incorporación de ese registro.

`WOW_ROLE_SYNC_DATA_DIR` es una carpeta del host usada por Docker Compose. `WOW_ROLE_SYNC_DATABASE_PATH` es una ruta del proceso para ejecución directa; Compose la sobrescribe con `/app/wow-role-sync-data/whitebird-wow-roles.sqlite`. Las rutas del contenedor pueden no existir en el host: el panel mostrará SQLite no disponible si `DATABASE_PATH` apunta a una ruta inaccesible.

Después de guardar recruitment, recrea su contenedor desde el directorio de ese proyecto. No hace falta recrear el bot de WoW por cambios exclusivos de recruitment.

Ejemplo con rutas explícitas:

```sh
PANEL_ENV_PATH=/ruta/wow/.env PANEL_RECRUITMENT_ENV_PATH=/ruta/recruitment/.env npm start
```

## Vista previa y registros

WoW Role Sync incluye una vista previa del informe diario: consulta datos actuales
con el módulo de sincronización del bot instalado, en un proceso aislado con un
límite de dos minutos. Necesita acceso al código del bot, sus dependencias,
SQLite y los servicios externos configurados. No modifica roles, canales ni SQLite,
ni simula felicitaciones o fallos al aplicar cambios.

La actividad guardada permite buscar y filtrar roles, propuestas y ediciones BIS,
ascensos y versiones, con páginas de 50 filas y alcance del servidor configurado.
BIS y ascensos muestran el último estado del registro; no es una auditoría completa
de cada transición ni incluye los logs de Docker.

Recruitment muestra decisiones en bloques de 100, con fecha, personaje, candidato,
oficial, motivo, estado del proceso y pasos de vinculación y canal Raider. Son
registros del bot, no una comprobación actual en Discord. Si falta la tabla o la
base no es accesible, se informa de que el registro no está disponible. Todas
estas consultas SQLite son de solo lectura y no crean ni migran tablas.

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

## CI/CD en OCI

La pipeline de [GitHub Actions](.github/workflows/ci-cd.yml) verifica las PR y
los cambios en `main`, y despliega por SSH tras superar las pruebas.
La [guía de despliegue](deploy/README.md) explica la preparación de la máquina,
los secrets de GitHub, el servicio systemd y la recuperación automática.

### Reinicio desde el panel

`PANEL_RESTART_ENABLED=true` habilita el botón; sin esta variable queda
deshabilitado. En OCI añádela a `/etc/whitebird-control-panel.env` y reinicia
`whitebird-control-panel`. Los despliegues no reemplazan ese archivo.

La carpeta del proyecto se toma del directorio del `.env` configurado para
cada bot. Debe contener su Compose. Los servicios son `bot` para WoW Sync y
Recruitment, y `whitebird-wow-wheel` para Ruleta. No se admiten comandos desde
el navegador. Se ejecuta `docker compose up -d --no-deps --force-recreate`
solo sobre ese servicio, con un límite de dos minutos.

En la instalación OCI con los bots propiedad de `ubuntu`, el servicio del
panel debe ejecutarse también como `ubuntu` (User y Group en systemd), con
acceso al directorio del proyecto y Docker. Comprueba como ese usuario
`docker compose version` y `docker ps`. El acceso a Docker da control amplio
sobre el host; mantén el panel limitado a loopback y acceso por SSH.

El botón requiere guardar primero y pide confirmación. Durante una operación
no se permite otro guardado o reinicio. Un resultado correcto confirma la
recreación, no la conexión a Discord. Si falla o expira el tiempo, los cambios
siguen guardados y debes consultar `docker compose ps` y los logs del bot
antes de repetir. El panel no devuelve la salida de Compose para evitar
exponer credenciales.

## Whitebird IA: servicio y bot Discord

El proyecto real es `whitebird-ai-agent`. El selector incluye dos componentes
porque usan archivos independientes:

- **Whitebird IA · Servicio**: API local, token compartido, modelo llama-server,
  equipo WoWAudit y configuración MCP/OAuth. Ruta: `PANEL_AGENT_ENV_PATH`
  (por defecto `../whitebird-ai-agent/.env`). En OCI indica el archivo compartido
  `agent.env` que lee el servicio, fuera de las releases.
- **Whitebird IA · Bot Discord**: token propio `DISCORD_BOT_TOKEN`,
  `DISCORD_APPLICATION_ID`, servidor, canales y roles permitidos, URL del agente
  y token compartido. Ruta: `PANEL_AGENT_DISCORD_ENV_PATH`
  (por defecto `../whitebird-ai-agent/discord.env`). Incluye guía de `/whitebird-ask`.

Los archivos deben existir; el panel no crea credenciales ni sesiones OAuth.
No se consulta SQLite para estos componentes. Los secretos no se devuelven al
navegador. Guardar modifica solo el archivo del componente seleccionado.
Después aplica los cambios reiniciando `whitebird-ai-agent` o
`whitebird-ai-discord` con systemd. Desde el selector el reinicio es manual y el
botón Docker queda deshabilitado. El chat permite confirmar el reinicio si
`PANEL_SYSTEMD_RESTART_ENABLED=true` y el usuario del panel tiene permisos sobre
las unidades correspondientes.
El usuario de los servicios debe poder leer los archivos tras guardarlos (0600).

El chat emergente sigue siendo global e independiente del selector. Para
conectarlo configura `PANEL_AGENT_URL` y `PANEL_AGENT_TOKEN` en el entorno del
panel y reinicia el panel. Cambiar `AGENT_PORT` o `AGENT_API_TOKEN` no propaga
cambios al panel ni al otro componente: actualiza sus URL y secretos coincidentes.
El login OAuth se hace fuera del panel, con el servicio IA detenido.
Los formularios no acreditan disponibilidad del agente, Discord, modelo u OAuth.

Los adaptadores de configuración están implementados en esta copia del panel.
Comprueba la revisión y los archivos de entorno que usan los servicios instalados
antes de aplicar cambios; los formularios no acreditan compatibilidad con cualquier
revisión del agente.


## Investigar errores desde el asistente

El chat admite «diagnostica el panel», «¿por qué Recruitment no arranca?» y
«revisa los logs del agente». Comprueba configuración guardada, conexiones,
estado de servicios y patrones de error en logs recientes. El diagnóstico local
funciona también con el agente IA desconectado. Los resultados incluyen pasos
para corregir los problemas y conservan ocultos los secretos y logs originales.
Consulta [el alcance y los límites del diagnóstico](docs/ai-agent.md).


## Cambios y diagnóstico desde la IA

El agente puede consultar configuración real, investigar estado/logs y permisos
de Discord y preparar cambios para revisar en el chat del panel o Discord.
Configura PANEL_AGENT_TOOLS_TOKEN y el secreto correspondiente en el servicio IA
según docs/ai-agent.md. Los controles de guardar y aplicar usan las operaciones
del panel. Los reinicios IA desde el chat requieren
PANEL_SYSTEMD_RESTART_ENABLED y permisos sobre sus dos unidades systemd.

## Documentación del chatbot

Mantener [docs/knowledge.json](docs/knowledge.json) junto con cada cambio de comportamiento. La pipeline publica la versión verificada en este mismo repositorio y Whitebird-context la recoge con acceso de lectura. Ver [flujo y comprobaciones](docs/context-publication.md).


## Consultas SQLite desde el chatbot

El backend expone herramientas autenticadas de lectura para decisiones de
Recruitment y registros de WoW Sync. Usa las rutas y credenciales del panel ya
configuradas. No modifica datos ni devuelve transcripciones o motivos de rechazo.
Ver [herramientas, filtros y alcance](docs/bot-data.md).

## Estado de esta documentación

Revisada el 2026-11-15 contra el código del panel, incluida la revisión `8b45a2d`
de `origin/main`, y los cinco documentos de entrada de
[Whitebird-context](https://github.com/sacelean/Whitebird-context).
No se ha inspeccionado la VM ni comprobado el despliegue o la salud de los
servicios durante esta revisión.

La ayuda del chatbot es un producto separado de estas guías Markdown. Cada
origen publica `docs/knowledge.json` en su rama `knowledge-published`;
Whitebird-context recoge las publicaciones con GitHub Actions y el agente lee
el catálogo local generado. Editar este README no actualiza por sí solo las
respuestas del chatbot.
