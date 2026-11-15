import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { operationError } from './operations.js';
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const period = { from: date, to: date };
const character = { type: 'string', maxLength: 80 };
const realm = { type: 'string', maxLength: 80 };
const limit = { type: 'integer', minimum: 1, maximum: 10 };
const definition = (name, project, description, properties, required=['project']) => ({ name, description,
  inputSchema: { type: 'object', required, additionalProperties: false, properties: { project: {type:'string',enum:[project]}, ...properties } } });
export const botDataTools = [
 definition('wow_resolve_user','wow','Resuelve un usuario Discord concreto a su personaje y reino vinculados en este servidor; solo lectura.',{userId:{type:'string',pattern:'^\\d{17,20}$'}},['project','userId']),
 definition('recruitment_summary','recruitment','Cuenta decisiones completadas y pendientes en SQLite; no incluye solicitudes abiertas ni historia anterior al registro.',{...period,character,realm}),
 definition('recruitment_recent','recruitment','Lista decisiones guardadas, por personaje, fecha, decisión y estado; no transcripciones.',{...period,character,realm,limit,decision:{type:'string',enum:['aceptada','rechazada']},status:{type:'string',enum:['completed','pending']}}),
 definition('wow_links','wow','Cuenta y lista vinculaciones actuales guardadas; no equivale al roster vivo de Blizzard.',{character,realm,limit}),
 definition('wow_sync_history','wow','Cuenta y lista cambios de roles guardados; no mide ciclos de sincronización ni ejecuciones sin cambios.',{...period,character,realm,limit}),
 definition('wow_cauldrons','wow','Consulta asignaciones semanales actuales de calderos; no confirma su entrega.',{weekday:{type:'string',enum:['monday','tuesday','wednesday','thursday','friday','saturday','sunday']},limit}),
 definition('wow_bis_summary','wow','Cuenta propuestas por estado y listas BIS activas guardadas, sin consultar guías externas.',{}),
 definition('wow_promotions','wow','Cuenta y lista felicitaciones de ascenso guardadas; sent acredita envío registrado, no todos los ascensos de la guild.',{...period,character,realm,limit})
];
const scopes = {
 recruitment_summary:'Solo decisiones registradas por Recruitment para este servidor. Las aceptadas y rechazadas completadas se separan de las pendientes. No incluye solicitudes abiertas ni decisiones anteriores a la incorporación del registro.',
 recruitment_recent:'Solo decisiones registradas; pueden faltar decisiones anteriores a la incorporación del registro. La fecha es la de decisión, no la de finalización.',
 wow_links:'Vinculaciones actuales guardadas. No es un recuento del roster vivo ni una verificación de pertenencia actual a la guild.',
 wow_sync_history:'Histórico de cambios de roles registrados. No cuenta ciclos de sincronización; puede haber sincronizaciones sin cambios y eventos anteriores no registrados.',
 wow_cauldrons:'Configuración semanal actual guardada. No confirma entrega, recordatorio ni presencia del responsable.',
 wow_bis_summary:'Propuestas y listas activas guardadas. No consulta WoWAudit ni las guías externas.',
 wow_promotions:'Registros de felicitaciones de ascenso, no un censo histórico completo de ascensos. El periodo filtra la fecha de creación del registro.'
};
function validDate(value) {
 if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(+d) && d.toISOString().slice(0,10)===value;
}
// Interpret calendar days consistently, including both Europe/Madrid DST offsets.
export function madridMidnight(day) {
 if(!validDate(day))throw operationError(400,'Fecha no válida; usa YYYY-MM-DD.');
 const target=Date.parse(day+'T00:00:00Z');let guess=target;
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let n=0;n<3;n++){
  const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
  guess+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
 }
 return new Date(guess).toISOString();
}
function validate(tool,input,project) {
 const def=botDataTools.find(t=>t.name===tool);
 if(!def || !input || Array.isArray(input) || typeof input!=='object' || input.project!==project.id || !def.inputSchema.properties.project.enum.includes(project.id))throw operationError(400,'Consulta o componente no válido.');
 if(Object.keys(input).some(k=>!Object.hasOwn(def.inputSchema.properties,k)))throw operationError(400,'Filtro desconocido.');
 for(const [key,value] of Object.entries(input)){
  if(key==='project')continue;const spec=def.inputSchema.properties[key];
  if(spec.enum && !spec.enum.includes(value))throw operationError(400,'Filtro no válido.');
  if(key==='limit' && (!Number.isInteger(value)||value<1||value>10))throw operationError(400,'Límite no válido (1–10).');
  if(['character','realm'].includes(key) && (typeof value!=='string'||!value.trim()||value.length>80||/[\x00-\x1f]/.test(value)))throw operationError(400,'Personaje no válido.');
  if(['from','to'].includes(key)&&!validDate(value))throw operationError(400,'Fecha no válida; usa YYYY-MM-DD.');
 }
 if(tool==='wow_resolve_user'&&(typeof input.userId!=='string'||!/^\d{17,20}$/.test(input.userId)))throw operationError(400,'Mención Discord no válida.');
 if(input.from && input.to && input.from>input.to)throw operationError(400,'El inicio es posterior al final del periodo.');
}
export function readBotData(tool,input,env,project,{now=Date.now}={}) {
 validate(tool,input,project);
 if(!env.DISCORD_GUILD_ID)return {available:false,message:'Configura el servidor del componente para consultar sus registros.'};
 let db;
 try {
  db=new Database(resolve(project.base,env.DATABASE_PATH || (project.id==='wow'?'./data/whitebird-wow-roles.sqlite':'./data/whitebird-recruitment.sqlite')),{readonly:true,fileMustExist:true,timeout:2000});
  db.pragma('query_only = ON');
  return db.transaction(()=>{
   const exists=name=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
   const missing=()=>({available:false,message:'El registro solicitado no está disponible. Comprueba la versión del bot, la ruta SQLite y sus permisos.'});
   const value=(sql,...args)=>db.prepare(sql).get(...args);
   const all=(sql,...args)=>db.prepare(sql).all(...args);
   if(tool==='wow_resolve_user'){
    if(!exists('wow_links'))return missing();
    const rows=all('SELECT DISTINCT character_name AS character,realm_slug AS realm FROM wow_links WHERE guild_id=? AND user_id=? LIMIT 2',env.DISCORD_GUILD_ID,input.userId);
    const identity=rows[0];
    const valid=v=>typeof v==='string'&&v.length>0&&v.length<=80&&!/[\x00-\x1f]/.test(v);
    return {available:true,guildId:env.DISCORD_GUILD_ID,status:rows.length===0?'not_found':rows.length>1?'ambiguous':valid(identity.character)&&valid(identity.realm)?'resolved':'invalid',...(rows.length===1&&valid(identity.character)&&valid(identity.realm)?identity:{})};
   }
   const filters=['guild_id=?'],bindings=[env.DISCORD_GUILD_ID];
   const periodColumn=tool.startsWith('recruitment_')?'decided_at':'created_at';
   if(input.from){filters.push(`datetime(${periodColumn}) >= datetime(?)`);bindings.push(madridMidnight(input.from));}
   if(input.to){const next=new Date(Date.parse(input.to+'T00:00:00Z')+86400000).toISOString().slice(0,10);filters.push(`datetime(${periodColumn}) < datetime(?)`);bindings.push(madridMidnight(next));}
   if(input.character){filters.push(input.realm?'lower(character_name)=lower(?)':'instr(lower(character_name), lower(?)) > 0');bindings.push(input.character);}
   if(input.realm){filters.push(tool.startsWith('recruitment_')?'lower(realm)=lower(?)':'lower(realm_slug)=lower(?)');bindings.push(input.realm);}
   // Recruitment calls its character column differently; filters remain fixed SQL.
   const where=()=>filters.join(' AND ').replaceAll('character_name',tool.startsWith('recruitment_')?'character':'character_name');
   const n=input.limit||5;
   let data;
   if(tool==='recruitment_summary'||tool==='recruitment_recent'){
    if(!exists('recruitment_decisions'))return missing();
    if(input.decision){filters.push('decision=?');bindings.push(input.decision);}
    if(input.status){filters.push('status=?');bindings.push(input.status);}
    const total=value(`SELECT COUNT(*) AS total FROM recruitment_decisions WHERE ${where()}`,...bindings).total;
    const first=value('SELECT MIN(decided_at) AS firstRecordedAt FROM recruitment_decisions WHERE guild_id=?',env.DISCORD_GUILD_ID).firstRecordedAt;
    if(tool==='recruitment_summary'){
     const groups=all(`SELECT decision,status,COUNT(*) AS count FROM recruitment_decisions WHERE ${where()} GROUP BY decision,status ORDER BY decision,status`,...bindings);
     const count=(decision,status)=>groups.filter(g=>g.decision===decision&&g.status===status).reduce((n,g)=>n+g.count,0);
     data={total,acceptedCompleted:count('aceptada','completed'),rejectedCompleted:count('rechazada','completed'),acceptedPending:count('aceptada','pending'),rejectedPending:count('rechazada','pending'),firstRecordedAt:first};
    }else data={total,firstRecordedAt:first,rows:all(`SELECT character,realm,decision,status,decided_at AS date FROM recruitment_decisions WHERE ${where()} ORDER BY decided_at DESC,rowid DESC LIMIT ?`,...bindings,n)};
   }else if(tool==='wow_links'){
    if(!exists('wow_links'))return missing();
    data={total:value(`SELECT COUNT(*) AS total FROM wow_links WHERE ${where()}`,...bindings).total,
     rows:all(`SELECT character_name AS character,realm_slug AS realm,CASE WHEN raider_channel_id IS NULL OR raider_channel_id='' THEN 0 ELSE 1 END AS hasRaiderChannel FROM wow_links WHERE ${where()} ORDER BY character_name,realm_slug LIMIT ?`,...bindings,n)};
   }else if(tool==='wow_sync_history'){
    if(!exists('wow_sync_history'))return missing();
    data={total:value(`SELECT COUNT(*) AS total FROM wow_sync_history WHERE ${where()}`,...bindings).total,
     firstRecordedAt:value('SELECT MIN(created_at) AS firstRecordedAt FROM wow_sync_history WHERE guild_id=?',env.DISCORD_GUILD_ID).firstRecordedAt,
     rows:all(`SELECT character_name AS character,realm_slug AS realm,category,action,role_name AS role,created_at AS date FROM wow_sync_history WHERE ${where()} ORDER BY id DESC LIMIT ?`,...bindings,n)};
   }else if(tool==='wow_cauldrons'){
    if(!exists('wow_cauldron_assignments'))return missing();
    if(input.weekday){filters.push('weekday=?');bindings.push(input.weekday);}
    data={total:value(`SELECT COUNT(*) AS total FROM wow_cauldron_assignments WHERE ${where()}`,...bindings).total,
     rows:all(`SELECT weekday,cauldron_type AS type,character_name AS character FROM wow_cauldron_assignments WHERE ${where()} ORDER BY weekday,cauldron_type LIMIT ?`,...bindings,n)};
   }else if(tool==='wow_bis_summary'){
    if(!exists('wow_bis_lists')||!exists('wow_bis_current'))return missing();
    data={total:value('SELECT COUNT(*) AS total FROM wow_bis_lists WHERE guild_id=?',env.DISCORD_GUILD_ID).total,
     currentLists:value('SELECT COUNT(*) AS total FROM wow_bis_current WHERE guild_id=?',env.DISCORD_GUILD_ID).total,
     statuses:all('SELECT status,COUNT(*) AS count FROM wow_bis_lists WHERE guild_id=? GROUP BY status ORDER BY status',env.DISCORD_GUILD_ID)};
   }else if(tool==='wow_promotions'){
    if(!exists('wow_raider_promotions'))return missing();
    data={total:value(`SELECT COUNT(*) AS total FROM wow_raider_promotions WHERE ${where()}`,...bindings).total,
     rows:all(`SELECT character_name AS character,realm_slug AS realm,status,created_at AS date,sent_at AS sentAt FROM wow_raider_promotions WHERE ${where()} ORDER BY created_at DESC,rowid DESC LIMIT ?`,...bindings,n)};
   }
   const trim=value=>typeof value==='string'?value.slice(0,160):value;
   if(data.rows)data.rows=data.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,trim(v)])));
   return {available:true,project:project.id,tool,checkedAt:new Date(now()).toISOString(),period:input.from||input.to?{from:input.from||null,to:input.to||null,timeZone:'Europe/Madrid'}:null,...data,
    filters:{...(input.realm?{realm:input.realm}:{}),...(input.character?{character:input.character}:{}),...(input.weekday?{weekday:input.weekday}:{})},partial:Array.isArray(data.rows)&&data.rows.length<data.total,scope:scopes[tool],timestampZone:'UTC'};
  })();
 }catch{return {available:false,message:'No se pudo leer el registro SQLite configurado. Revisa versión, ruta y permisos; no se ha modificado la base.'};}
 finally{db?.close();}
}

