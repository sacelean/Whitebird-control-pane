// Ayuda revisada contra los campos y comandos registrados de los tres bots.
export const fieldHelp = {
  DISCORD_TOKEN: 'Credencial privada con la que este bot inicia sesión en Discord. Usa el token de su aplicación en Discord Developer Portal; sustitúyelo si lo regeneras.',
  DISCORD_CLIENT_ID: 'Application ID de la aplicación de este bot en Discord Developer Portal. Se usa para registrar sus comandos de barra en Discord.',
  DISCORD_GUILD_ID: 'ID del servidor de Discord que administra el bot. Activa el modo desarrollador de Discord para copiarlo. En ruleta también permite filtrar los registros del panel; vacío registra comandos globales.',
  OFFICER_ROLE_IDS: 'IDs de los roles autorizados para las acciones de oficiales, separados por comas. También se admite el permiso Gestionar servidor. En recruitment estos roles tienen acceso a los canales privados de solicitudes.',
  OFFICER_REPORT_CHANNEL_ID: 'ID del canal de texto donde WoW Sync publica el informe diario de sincronización para oficiales. El bot debe poder verlo y enviar mensajes.',
  RELEASE_NOTES_CHANNEL_ID: 'ID del canal donde el bot publica las novedades de sus versiones. El bot necesita acceso y permiso para enviar mensajes.',
  BLIZZARD_CLIENT_ID: 'Identificador de tu cliente de Battle.net. Junto al Client Secret permite consultar la API de Blizzard para obtener el roster, los rangos y las profesiones.',
  BLIZZARD_CLIENT_SECRET: 'Clave privada del cliente de Battle.net. Se usa con el Client ID para autenticar las consultas a Blizzard; el panel no muestra la clave guardada.',
  WOW_REGION: 'Región de la API de Blizzard donde están la hermandad y los personajes: eu, us, kr o tw. Por ejemplo, eu para Europa.',
  WOW_LOCALE: 'Idioma solicitado a la API de Blizzard, por ejemplo en_US. Determina el idioma de los datos devueltos; las claves del mapa de profesiones se escriben en inglés.',
  WOW_GUILD_REALM_SLUG: 'Identificador del reino de la hermandad en la API de Blizzard, por ejemplo sanguino. Usa el slug del reino, no su ID de Discord.',
  WOW_GUILD_SLUG: 'Identificador de la hermandad en la API de Blizzard. Se utiliza junto al reino y la región para consultar sus miembros y rangos.',
  WOW_DEFAULT_RANK_ROLE_ID: 'ID del rol Viajante que usa el bot como rol de rango por defecto. Debe ser distinto de los roles de rango, profesión y roster.',
  WOW_RANK_ROLE_IDS: 'Objeto JSON que relaciona el índice de rango de Blizzard con un ID de rol de Discord, por ejemplo {"0":"123456789012345678"}. El rango 0 es el maestro de hermandad. Los IDs deben ir entre comillas.',
  WOW_PROFESSION_ROLE_IDS: 'Objeto JSON que relaciona el nombre inglés de cada profesión con su rol de Discord, por ejemplo {"Alchemy":"123456789012345678"}. Se usa para asignar roles según las profesiones del personaje.',
  WOW_SYNC_HOUR: 'Hora de inicio de la sincronización automática diaria, de 0 a 23. Se interpreta en la zona horaria configurada; 4 significa las 04:00.',
  WOW_SYNC_TIMEZONE: 'Zona horaria IANA usada por la sincronización y los avisos de calderos, por ejemplo Europe/Madrid. Tiene en cuenta los cambios de horario de verano.',
  WOW_ROSTER_ROLE_ID: 'ID del rol común que recibe el roster incluido por rango. Déjalo vacío para desactivar esta función. Debe ser distinto del resto de roles gestionados.',
  WOW_ROSTER_MIN_RANK: 'Límite de rango de Blizzard incluido en el roster. El valor 4 incluye los índices 0, 1, 2, 3 y 4; los números menores representan rangos superiores.',
  WOWAUDIT_API_KEY: 'Clave privada para consultar el equipo en WoWAudit. La comparten el informe de raiders y los avisos de equipo; eliminarla desactiva ambas integraciones.',
  WOWAUDIT_TEAM_ID: 'Identificador numérico del equipo de WoWAudit que consulta el bot para los informes y el seguimiento del equipo de los raiders.',
  WOWAUDIT_LOOT_WINDOW_DAYS: 'Número de días de loot que se incluyen en el informe, entre 1 y 3660. Vacío usa la temporada en lugar de una ventana de días.',
  WOWAUDIT_LOOT_RANKS: 'Nombres de los rangos incluidos en el resumen de loot, separados por comas. Permite limitar el informe a grupos como Oficiales, Fijo, Rotativo o Trial.',
  WOWAUDIT_LOOT_CATEGORIES: 'Categorías de loot que se contabilizan en el informe, separadas por comas. Usa los nombres de WoWAudit, por ejemplo BIS, Mejora de stats, set 4p o Catalizar.',
  APPLY_CATEGORY_ID: 'ID de la categoría de Discord en la que recruitment crea los canales privados de las nuevas solicitudes. El bot necesita permiso para gestionar canales.',
  RAIDER_CATEGORY_ID: 'ID de la categoría donde recruitment crea el canal privado del raider al aceptar una solicitud.',
  ENTRY_CHANNEL_ID: 'ID del canal de texto que recibe las transcripciones de las solicitudes aceptadas o rechazadas. El bot debe poder enviar mensajes y adjuntar archivos.',
  APPLY_RECEIVED_MESSAGE: 'Texto enviado al recibir una solicitud. Admite Markdown de Discord; vacío utiliza el texto predeterminado del bot. Las variables disponibles dependen de este mensaje.',
  APPLY_ACCEPTED_MESSAGE: 'Texto enviado al aceptar una solicitud para comunicar el resultado al candidato. Admite Markdown; vacío utiliza el texto predeterminado del bot. Las variables disponibles dependen de este mensaje.',
  APPLY_REJECTED_MESSAGE: 'Texto enviado al rechazar una solicitud para comunicar el resultado al candidato. Admite Markdown; vacío utiliza el texto predeterminado del bot. Las variables disponibles dependen de este mensaje.',
  APPLY_QUESTION_CHARACTER: 'Etiqueta de la pregunta que pide el nombre del personaje principal en el formulario de solicitud. Vacío utiliza la pregunta predeterminada.',
  APPLY_QUESTION_REALM: 'Etiqueta de la pregunta que pide el reino del personaje en el formulario. Vacío utiliza la pregunta predeterminada.',
  APPLY_QUESTION_CLASS: 'Etiqueta de la pregunta sobre la clase y especialización del candidato. Vacío utiliza la pregunta predeterminada.',
  APPLY_QUESTION_EXPERIENCE: 'Etiqueta de la pregunta sobre la experiencia del candidato en el formulario. Vacío utiliza la pregunta predeterminada.',
  APPLY_QUESTION_AVAILABILITY: 'Etiqueta de la pregunta sobre horarios disponibles y motivación del candidato. Vacío utiliza la pregunta predeterminada.',
  WOW_ROLE_SYNC_DATA_DIR: 'Ruta de la carpeta data de WoW Sync en el host. Docker Compose la monta en recruitment para compartir las vinculaciones; indica una carpeta, no el archivo SQLite.',
  WOW_ROLE_SYNC_DATABASE_PATH: 'Ruta al archivo SQLite de WoW Sync accesible al proceso de recruitment cuando se ejecuta directamente. En Docker Compose se sustituye por /app/wow-role-sync-data/whitebird-wow-roles.sqlite.',
  WOW_ROLE_SYNC_BOT_ID: 'ID de usuario de Discord del bot WoW Sync. Recruitment lo utiliza para concederle acceso a los canales privados de raider y permitir su integración.'
};

// Los parámetros entre < > son obligatorios; los que van entre [ ] son opcionales.
const command = (name, description, usage, access = 'Oficiales') => ({ name, description, usage, access });
export const botCommands = {
  wow: [
    command('informe-raiders', 'Publica o actualiza la tabla semanal de raiders. canal permite elegir el destino; sin él se usa el destino guardado. La primera vez debes indicar canal para guardar el destino.', '/informe-raiders [canal:#raiders]'),
    command('bis-proponer', 'Envía al canal del raider vinculado una propuesta de lista BIS para aceptar o rechazar. actividad: General, Raid o Mítico+.', '/bis-proponer raider:<@miembro> actividad:<General|Raid|Mítico+>'),
    command('vinculacion-buscar', 'Busca tu main comparando tu nombre de Discord con el roster de Blizzard para proponer una vinculación.', '/vinculacion-buscar', 'Miembros'),
    command('vinculacion-asignar', 'Vincula un usuario de Discord con su personaje principal y reino para poder sincronizarlo.', '/vinculacion-asignar usuario:<@miembro> personaje:<nombre> reino:<reino>'),
    command('vinculacion-quitar', 'Elimina la vinculación del usuario con su personaje de WoW.', '/vinculacion-quitar usuario:<@miembro>'),
    command('sincronizacion-ejecutar', 'Ejecuta manualmente la sincronización de roles de rango y profesión de los miembros vinculados.', '/sincronizacion-ejecutar'),
    command('sincronizacion-usuario', 'Ejecuta la sincronización solo para un usuario que ya está vinculado.', '/sincronizacion-usuario usuario:<@miembro>'),
    command('auditoria-revisar', 'Comprueba las vinculaciones, los roles, el roster, los canales y los calderos para detectar problemas de configuración.', '/auditoria-revisar'),
    command('historial-cambios', 'Consulta los últimos cambios de roles. usuario filtra por miembro y limite permite pedir entre 1 y 25 registros.', '/historial-cambios [usuario:@miembro] [limite:10]'),
    command('vinculacion-listar', 'Muestra las vinculaciones guardadas y las propuestas pendientes.', '/vinculacion-listar'),
    command('calderos-asignar', 'Asigna a un miembro el caldero de un día y actualiza el reparto público. dia: lunes a jueves; tipo: Potis o Frascos.', '/calderos-asignar dia:<día> tipo:<Potis|Frascos> usuario:<@miembro>'),
    command('calderos-publicar', 'Publica el mensaje del reparto de calderos o lo mueve al canal indicado.', '/calderos-publicar canal:<#crafteos>'),
    command('calderos-ver', 'Muestra de forma privada el reparto actual de calderos.', '/calderos-ver')
  ],
  recruitment: [
    command('apply-panel', 'Publica o actualiza la introducción y el panel para abrir solicitudes en el canal donde lo ejecutas. Los candidatos abren el formulario desde su botón.', '/apply-panel'),
    command('apply-corregir', 'Abre el formulario para corregir el personaje principal o reino. Ejecútalo en el canal de la solicitud abierta.', '/apply-corregir', 'Candidato de la solicitud u oficiales'),
    command('apply-aceptar', 'Acepta la solicitud del canal actual, crea el canal privado de raider y archiva la transcripción.', '/apply-aceptar'),
    command('apply-rechazar', 'Rechaza la solicitud del canal actual y archiva su transcripción. motivo es obligatorio, de 3 a 500 caracteres, y queda registrado para los oficiales.', '/apply-rechazar motivo:<explicación>')
  ],
  roulette: [
    command('ruleta-alter', 'Publica el panel visual de la ruleta. canal es opcional; si lo omites se publica en el canal actual. Para obtener una clase se pulsa Girar la ruleta.', '/ruleta-alter [canal:#alters]', 'Miembros'),
    command('mi-alter', 'Consulta en privado tu clase asignada en la ronda actual.', '/mi-alter', 'Miembros'),
    command('alter-list', 'Muestra las asignaciones de clase de la ronda actual.', '/alter-list', 'Miembros'),
    command('alter-reset', 'Libera la asignación de un miembro para que pueda volver a girar.', '/alter-reset usuario:<@miembro>'),
    command('alter-spec', 'Cambia el rol de combate del alter asignado al miembro: Tanque, DPS o Sanador.', '/alter-spec usuario:<@miembro> spec:<Tanque|DPS|Sanador>'),
    command('registrar-alter', 'Vincula tu personaje a la clase que obtuviste en la ruleta. Indica nombre, reino y región: eu, us, kr o tw.', '/registrar-alter nombre:<personaje> reino:<reino> region:<eu|us|kr|tw>', 'Miembros con clase asignada'),
    command('ranking-alters', 'Publica el nivel de objeto equipado y la mejor piedra M+ de los alters registrados. actualizar:true solicita datos recientes a Raider.IO; normalmente se usa una caché de 30 minutos.', '/ranking-alters [actualizar:true]'),
    command('alter-reset-all', 'Libera todas las asignaciones e inicia una nueva ronda. Requiere confirmar:true; afecta a todos los participantes.', '/alter-reset-all confirmar:true')
  ]
};
