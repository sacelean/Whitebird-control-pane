# Consulta al agente de IA

Integración implementada el 2026-11-14; pendiente de despliegue y validación real.

El formulario «Consultar al agente de IA» envía preguntas a la API del panel,
que las reenvía al servicio local whitebird-ai-agent. WoWAudit sigue en modo
solo lectura. El navegador no recibe tokens ni el almacén OAuth.

Configurar en el entorno del panel:

```dotenv
PANEL_AGENT_URL=http://127.0.0.1:3090
PANEL_AGENT_TOKEN=SECRETO_COMPARTIDO_CON_EL_AGENTE
```

El token debe coincidir con AGENT_API_TOKEN y contener al menos 32 caracteres
aleatorios. Mantener fuera del repositorio y con permisos restringidos. Si
faltan variables o la URL es inválida, las consultas WoWAudit quedan
deshabilitadas y el diagnóstico local sigue disponible.

Instalar y arrancar el servicio del agente en el mismo host antes de consultar.
Ver [guía del agente](https://github.com/sacelean/whitebird-ai-agent/blob/main/docs/control-panel.md)
(esa revisión del agente debe incorporarse antes del despliegue del panel).
El agente local implementa POST /ask con Bearer, pregunta de 1–1000 caracteres y
respuesta {tool,answer}. Solo procesa una consulta a la vez; el exceso recibe 429.
No ejecutar el CLI ni el login OAuth en paralelo con el servicio.

Reiniciar el panel después de configurar las variables. Conservar acceso por
SSH y loopback; no abrir 3080, 3090 ni el puerto del modelo en Oracle.
El despliegue del panel no instala ni reinicia el agente.

Verificación: npm test; abrir el formulario y preguntar por próximos eventos;
comprobar herramienta list_events y texto legible. Probar agente parado,
token incorrecto y una segunda consulta simultánea. Los fallos se muestran sin
detalles internos. Las respuestas se presentan como texto, nunca HTML.

Las pruebas locales de la integración usan dobles de MCP/modelo. No acreditan
OAuth, disponibilidad de Oracle ni calidad de la síntesis en producción.

## Interfaz del chat (2026-11-14)

El botón flotante «Asistente IA» abre un diálogo independiente de los módulos
 y de Comandos de Discord. Permite cerrar con Escape o el botón Cerrar y
conserva los mensajes mientras la página siga abierta, incluso al cambiar de
módulo. El historial es visual: la API sigue recibiendo una pregunta cada vez,
sin contexto de mensajes anteriores. Cerrar la ventana no cancela una consulta.

Si falta configuración, el chat explica qué variables debe configurar el
administrador y permite comprobar de nuevo la conexión tras reiniciar el
panel. La disponibilidad inicial indica configuración, no salud del agente.
Este cambio de interfaz no instala ni configura el servicio de IA.


## Diagnóstico desde el chat (2026-11-15)

Pide «diagnostica el panel», «¿por qué Recruitment no arranca?», «revisa la
configuración de ruleta» o «revisa los logs del agente». Si no mencionas un
componente, se usa el seleccionado. «Panel» o «todos» comprueba los cinco.

El backend del panel ejecuta el diagnóstico local aunque el agente o el modelo
estén caídos. Reutiliza la validación de config.js para los valores guardados,
comprueba campos requeridos, existencia de SQLite y almacén OAuth y compara
puertos, URLs y tokens entre panel, agente y adaptador Discord. Compara el
servidor y las rutas compartidas entre Recruitment y WoW Sync. Los montajes de
Compose requieren contrastar las rutas efectivas en el host.

Consulta únicamente comandos fijos de lectura. Para bots Docker usa compose ps
--all y compose logs --tail 60. Para IA usa systemctl is-active y journalctl
--lines 60 de whitebird-ai-agent o whitebird-ai-discord. Cada comando tiene un
límite de cinco segundos y 128 KiB. Los fallos de permisos aparecen como falta
de evidencia. Se permite un diagnóstico simultáneo por proceso del panel.

Las comprobaciones HTTP usan /health del agente con el token del panel y
/health del modelo, con timeout de tres segundos y sin redirecciones. Comprueban
la respuesta del proceso. La sesión OAuth y la síntesis requieren una consulta
real. El diagnóstico no inicia login OAuth ni consultas MCP.

La respuesta contiene comprobaciones y pasos concretos. Los logs se clasifican
por patrones conocidos de autenticación, permisos, conexión, archivos, puertos,
OAuth y timeout. No se devuelven líneas, valores de configuración, rutas privadas
ni excepciones. No se envían logs ni configuración al modelo. El texto se muestra
con textContent. La ruta /api/agent conserva Host/Origin y CSRF y devuelve el
contrato {tool, answer}, con tool=panel_diagnostics para estas consultas.

El diagnóstico refleja archivos guardados y evidencia puntual. No determina si
hay cambios pendientes de aplicar ni comprueba los permisos efectivos de Discord.
Los logs pueden contener errores históricos. Las correcciones se realizan desde
los formularios y procedimientos existentes. Ejecutar npm test y comprobar el
chat en la instalación destino antes de dar por verificado el despliegue.


## Explicaciones del funcionamiento (2026-11-15)

Preguntas como «¿Cómo funciona Recruitment?», «¿Qué permisos necesita la
ruleta?» y «¿Cómo se configuran los roles de WoW Role Sync?» se envían al
agente compartido. El proyecto seleccionado se transmite como contexto opcional
project para preguntas como «¿Cómo funciona?» sin nombre de bot. Los nombres
explícitos en la pregunta tienen prioridad. El historial continúa siendo visual.

Los errores, logs y solicitudes explícitas de diagnóstico mantienen el recorrido
local. La ayuda usa resúmenes documentados en whitebird-ai-agent y requiere una
revisión del agente con project-help.js y project-knowledge.js. Responde con
{tool: null, answer}. Para cuestiones de funcionamiento en Discord, indica el
nombre del bot o un comando. La ayuda no consulta la configuración efectiva.


## Administración asistida (2026-11-15)

Configura PANEL_AGENT_TOOLS_TOKEN en el entorno del panel. En el agente,
PANEL_TOOLS_URL apunta al origen HTTP loopback del panel y PANEL_TOOLS_TOKEN
contiene el mismo secreto de al menos 32 caracteres. Se mantiene separado del
token del proxy /ask. La ruta /api/agent-tools exige Bearer, Host loopback y
ausencia de Origin. Las confirmaciones del navegador conservan CSRF.

El agente dispone de herramientas para configuración real, estado, logs
redactados, diagnóstico y permisos efectivos del bot en Discord. Las lecturas
identifican valores guardados y predeterminados. La comprobación Discord usa
consultas GET con el token del propio componente. Evalúa servidor, overwrites
de canales, existencia de roles y jerarquía mediante BigInt. Limita la vista a
20 canales configurados y 100 roles e indica vistas parciales. Hilos y permisos
particulares de comandos requieren revisión específica. Algoritmo de referencia:
https://docs.discord.com/developers/topics/permissions

El modelo prepara cambios sobre campos del esquema. Los secretos se editan en
el formulario. La propuesta muestra valores anteriores y nuevos y ofrece Guardar,
Aplicar y reiniciar, Estado y cierre/cancelación según su fase. Las propuestas
se vinculan a la instancia del panel mediante su CSRF o al usuario/servidor de Discord y caducan
a los 15 minutos. Son efímeras y se invalidan al reiniciar el panel.

operations.js comparte la validación, guardado atómico y exclusión mutua entre
formularios y chat. Cada guardado compara revisión. La aplicación compara la
revisión guardada y conserva un resultado consultable. Las confirmaciones
repetidas devuelven el estado registrado. Un reinicio incierto se marca como
fallido y requiere comprobar estado/logs y preparar una nueva solicitud.

PANEL_RESTART_ENABLED conserva su efecto para Compose. Para IA,
PANEL_SYSTEMD_RESTART_ENABLED=true habilita systemctl restart de las unidades
fijas whitebird-ai-agent y whitebird-ai-discord. El usuario del panel debe tener
esos permisos mediante la configuración del sistema. Los trabajos empiezan de
forma diferida para permitir responder antes de reiniciar el agente/adaptador.
El panel consulta su estado y Discord ofrece el botón Estado. El proceso del
panel conserva el resultado durante los reinicios de los componentes IA.

Los usuarios que ya tengan acceso al agente en Discord podrán administrar los
componentes al conectar las herramientas. Los logs redactados se envían al
modelo local para investigar. Pueden contener datos operativos y personales
pertinentes al fallo. Las propuestas y el historial visible no son una auditoría
persistente. Validar el modelo, Discord y los permisos de ejecución en la VM.

## Consultas de registros

El API autenticado /api/agent-tools ofrece recruitment_summary, recruitment_recent,
wow_links, wow_sync_history, wow_cauldrons, wow_bis_summary y wow_promotions.
Solo consultas SQLite predefinidas, filtradas por el servidor configurado, sin SQL
libre, rutas ni servidor elegidos por el solicitante. Ver [contrato y alcance](bot-data.md).
