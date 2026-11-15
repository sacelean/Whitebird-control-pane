import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readBotData, madridMidnight } from '../bot-data.js';
import { createManagement } from '../management.js';
import { modules, recruitmentModules } from '../config.js';
async function fixture(t){
 const base=await mkdtemp(join(tmpdir(),'bot-data-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const file=join(base,'records.sqlite'),env={DISCORD_GUILD_ID:'guild-a',DATABASE_PATH:'records.sqlite'};
 const db=new Database(file);
 db.exec(`CREATE TABLE recruitment_decisions(guild_id TEXT,application_channel_id TEXT,character TEXT,realm TEXT,decision TEXT,status TEXT,decided_at TEXT,PRIMARY KEY(guild_id,application_channel_id));
 CREATE TABLE wow_links(guild_id TEXT,character_name TEXT,realm_slug TEXT,raider_channel_id TEXT);
 CREATE TABLE wow_sync_history(id INTEGER PRIMARY KEY,guild_id TEXT,character_name TEXT,realm_slug TEXT,category TEXT,action TEXT,role_name TEXT,created_at TEXT);
 CREATE TABLE wow_cauldron_assignments(guild_id TEXT,weekday TEXT,cauldron_type TEXT,character_name TEXT);
 CREATE TABLE wow_bis_lists(guild_id TEXT,status TEXT);CREATE TABLE wow_bis_current(guild_id TEXT);
 CREATE TABLE wow_raider_promotions(guild_id TEXT,character_name TEXT,realm_slug TEXT,status TEXT,created_at TEXT,sent_at TEXT);`);
 for(const r of [['a','Alpha','aceptada','completed','2026-10-31 23:30:00'],['b','Beta','aceptada','pending','2026-11-01 01:00:00'],['c','Gamma','rechazada','completed','2026-10-01 12:00:00']])db.prepare('INSERT INTO recruitment_decisions VALUES (?,?,?,?,?,?,?)').run('guild-a',r[0],r[1],'realm',r[2],r[3],r[4]);
 db.prepare('INSERT INTO recruitment_decisions VALUES (?,?,?,?,?,?,?)').run('guild-b','x','PRIVATE','realm','aceptada','completed','2026-11-01 02:00:00');
 db.exec(`INSERT INTO wow_links VALUES ('guild-a','Alpha','realm','123'),('guild-b','PRIVATE','realm',NULL);
 INSERT INTO wow_sync_history VALUES (1,'guild-a','Alpha','realm','rank','added','Raider','2026-11-01 01:00:00'),(2,'guild-b','PRIVATE','realm','rank','added','Other','2026-11-01 01:00:00');
 INSERT INTO wow_cauldron_assignments VALUES ('guild-a','monday','flasks','Alpha'),('guild-a','tuesday','potions','Beta'),('guild-b','monday','flasks','PRIVATE');
 INSERT INTO wow_bis_lists VALUES ('guild-a','accepted'),('guild-a','pending'),('guild-b','accepted');INSERT INTO wow_bis_current VALUES ('guild-a'),('guild-b');
 INSERT INTO wow_raider_promotions VALUES ('guild-a','Alpha','realm','sent','2026-11-01 00:00:00','2026-11-01 01:00:00'),('guild-b','PRIVATE','realm','pending','2026-11-01 00:00:00',NULL);`);
 db.close();return {base,file,env,project:{id:'recruitment',base}};
}
test('counts completed decisions separately from pending; filters guild and local calendar dates',async t=>{
 const f=await fixture(t);const before=await readFile(f.file);
 const all=readBotData('recruitment_summary',{project:'recruitment'},f.env,f.project);
 assert.equal(readBotData('recruitment_summary',{project:'recruitment',character:'Alpha'},f.env,f.project).total,1);
 assert.equal(all.available,true);assert.equal(all.total,3);assert.equal(all.acceptedCompleted,1);assert.equal(all.acceptedPending,1);assert.equal(all.rejectedCompleted,1);
 const november=readBotData('recruitment_summary',{project:'recruitment',from:'2026-11-01',to:'2026-11-01'},f.env,f.project);
 assert.equal(november.total,2,'Oct 31 23:30 UTC is Nov 1 in Madrid');
 assert.deepEqual(await readFile(f.file),before,'read-only queries must not alter database bytes');
 assert.equal(madridMidnight('2026-07-01'),'2026-06-30T22:00:00.000Z');assert.equal(madridMidnight('2026-11-01'),'2026-10-31T23:00:00.000Z');
 assert.equal((Date.parse(madridMidnight('2026-03-30'))-Date.parse(madridMidnight('2026-03-29')))/3600000,23);
 assert.equal((Date.parse(madridMidnight('2026-10-26'))-Date.parse(madridMidnight('2026-10-25')))/3600000,25);
});
test('lists are bounded, filtered, parameterized and exclude identities and rejection text',async t=>{
 const f=await fixture(t);
 const data=readBotData('recruitment_recent',{project:'recruitment',limit:1},f.env,f.project);
 assert.equal(data.rows.length,1);assert.equal(data.partial,true);assert.ok(!JSON.stringify(data).includes('PRIVATE'));
 assert.deepEqual(Object.keys(data.rows[0]).sort(),['character','date','decision','realm','status']);
 assert.equal(readBotData('recruitment_recent',{project:'recruitment',character:"'; DROP TABLE recruitment_decisions;--"},f.env,f.project).total,0);
 assert.equal(readBotData('recruitment_summary',{project:'recruitment'},f.env,f.project).total,3);
});
test('WoW tools stay within guild and distinguish current records from event history',async t=>{
 const f=await fixture(t);const project={id:'wow',base:f.base};
 for(const tool of ['wow_links','wow_sync_history','wow_promotions']){
  const data=readBotData(tool,{project:'wow'},f.env,project);assert.equal(data.available,true);assert.equal(data.total,1);assert.ok(!JSON.stringify(data).includes('PRIVATE'));
 }
 assert.equal(readBotData('wow_cauldrons',{project:'wow',weekday:'monday'},f.env,project).total,1);
 const bis=readBotData('wow_bis_summary',{project:'wow'},f.env,project);assert.equal(bis.total,2);assert.equal(bis.currentLists,1);
 assert.match(readBotData('wow_sync_history',{project:'wow'},f.env,project).scope,/No cuenta ciclos/);
});
test('bad filters fail; missing file/table/config is unavailable rather than zero or an accidental new DB',async t=>{
 const f=await fixture(t);
 for(const args of [{project:'recruitment',sql:'SELECT 1'},{project:'wow'},{project:'recruitment',from:'2026-02-30'},{project:'recruitment',from:'2026-12-01',to:'2026-01-01'}])assert.throws(()=>readBotData('recruitment_summary',args,f.env,f.project));
 assert.throws(()=>readBotData('recruitment_recent',{project:'recruitment',limit:1000},f.env,f.project));
 assert.equal(readBotData('recruitment_summary',{project:'recruitment'},{...f.env,DATABASE_PATH:'absent.sqlite'},f.project).available,false);
 await assert.rejects(readFile(join(f.base,'absent.sqlite')));
 assert.equal(readBotData('recruitment_summary',{project:'recruitment'},{DATABASE_PATH:f.file},f.project).available,false);
 const db=new Database(f.file);db.exec('DROP TABLE recruitment_decisions');db.close();assert.equal(readBotData('recruitment_summary',{project:'recruitment'},f.env,f.project).available,false);
});
test('management integration only permits known tools, projects and registered database locations',async t=>{
 const f=await fixture(t);const path=join(f.base,'bot.env');await writeFile(path,'DISCORD_GUILD_ID=guild-a\nDATABASE_PATH=records.sqlite\n');
 const m=createManagement({projects:[{...f.project,path,modules:recruitmentModules}],token:'x'.repeat(32)});
 assert.equal((await m.call('recruitment_summary',{project:'recruitment'},'authorized-user')).acceptedCompleted,1);
 await assert.rejects(m.call('recruitment_summary',{project:'recruitment',path:'/somewhere'}));
 await assert.rejects(m.call('sql',{project:'recruitment',sql:'SELECT 1'}));
 await assert.rejects(m.call('wow_links',{project:'recruitment'}));
});

test('HTTP tool API authenticates, rejects caller SQL/guild/path overrides, and reads only configured records',async t=>{
 const f=await fixture(t),path=join(f.base,'bot.env');await writeFile(path,'DISCORD_GUILD_ID=guild-a\nDATABASE_PATH=records.sqlite\n');
 const {default:http}=await import('node:http');const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const {createPanel}=await import('../server.js');const token='tool-token-'.repeat(4),server=createPanel({envPath:path,recruitmentEnvPath:path,toolsToken:token,port});
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${port}/api/agent-tools`;
  const request=(args,auth=true)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({tool:'recruitment_summary',arguments:args})});
  assert.equal((await request({project:'recruitment'},false)).status,401);
  const result=await request({project:'recruitment'});assert.equal(result.status,200);assert.equal((await result.json()).acceptedCompleted,1);
  for(const extra of [{sql:'DELETE FROM recruitment_decisions'},{guildId:'guild-b'},{path:f.file}])assert.equal((await request({project:'recruitment',...extra})).status,400);
  const tools=await(await fetch(url,{headers:{Authorization:`Bearer ${token}`}})).json();assert.ok(tools.tools.some(x=>x.name==='wow_sync_history'));
 }finally{await new Promise(r=>server.close(r));}
});
