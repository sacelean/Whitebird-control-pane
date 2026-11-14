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
faltan variables, el formulario queda deshabilitado. Una URL distinta de un
origen HTTP 127.0.0.1 impide arrancar el panel.

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
