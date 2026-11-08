import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {checkParsing} from '../apps/server/parsing.mjs';
import {notamFacts} from '../apps/server/notam-facts.mjs';
import {TaskService} from '../apps/server/tasks.mjs';
import {tmpdir} from 'node:os';

const suite=JSON.parse(await readFile(new URL('../evaluation/report-cases.json',import.meta.url),'utf8'));
const check=(item,value=item.expected)=>checkParsing(JSON.stringify(value),item.notam,{parserType:'report',notamId:item.notam_id});
const row={airport:'KDEN',runway:'17L',affect_actype:null,affect_region:'TAKEOFFS,LANDINGS',flight_type:'International,Domestic,Regional'};

test('两种模式格式分别检查，业务错误提示不套用五字段说明',()=>{
 const invalid=checkParsing('not json','A)KDEN E)AD CLSD',{parserType:'report'});
 assert.equal(invalid.valid,false);assert(!invalid.warnings.some(text=>text.includes('五字段')));
 assert.equal(checkParsing(JSON.stringify([row]),'A)KDEN E)RWY 17L CLSD',{parserType:'report'}).valid,false);
 assert.equal(checkParsing(JSON.stringify(suite.cases[0].expected),suite.cases[0].notam).valid,false);
});

for(const item of suite.cases)test('研究报告原始参考输出可检查：'+item.id,()=>{
 const result=check(item);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
 for(const span of result.evidence.items)assert.equal(item.notam.slice(span.offset,span.offset+span.text.length),span.text);
});

test('业务模式拒绝错误机场、生成编号、漏备降和漏例外',()=>{
 assert.equal(check(suite.cases[0],{...suite.cases[0].expected,airport:'ZBAA'}).valid,false);
 assert.equal(check(suite.cases[0],{...suite.cases[0].expected,id:'invented'}).valid,false);
 const noDiversion=structuredClone(suite.cases[1].expected);delete noDiversion.Diversion_Restriction;
 assert.equal(check(suite.cases[1],noDiversion).valid,false);
 const noException=structuredClone(suite.cases[2].expected);delete noException.exception;
 assert.equal(check(suite.cases[2],noException).valid,false);
});

test('业务模式保留条件AND/OR，不把部分设施关闭写成整场关闭',()=>{
 const wrong=structuredClone(suite.cases[2].expected);wrong.restrictions[1].condition='Aircraft OR crew must have RNP-AR AND RNP-APCH.';
 assert.equal(check(suite.cases[2],wrong).valid,false);
 const airportClosed={...suite.cases[4].expected,restriction_Type:'closed'};
 assert.equal(check(suite.cases[4],airportClosed).valid,false);
});

test('业务模式拒绝虚构跑道、遗漏ALL TWY、错AIP引用和多余字段',()=>{
 const item=suite.cases[4];
 for(const value of [
  {...item.expected,affected_facilities:[{type:'Runway',name:'18/36',status:'closed'}]},
  {...item.expected,affected_facilities:item.expected.affected_facilities.filter(item=>item.type!=='Taxiway')},
  {...item.expected,aip_reference:'AIP SUP 09/24'},
  {...item.expected,hidden_assumption:'invented'},
 ])assert.equal(check(item,value).valid,false);
});

test('AIP原文编号附日期可规范化，修改过的日期不能冒充原文',()=>{
 const item=suite.cases[4];const dated='AIP SUP 08/24 DATED 08 MAR 2024';
 const result=check(item,{...item.expected,aip_reference:dated});
 assert.equal(result.valid,true);assert.equal(result.records.aip_reference,'AIP SUP 08/24');assert.equal(result.normalizations[0].from,dated);
 assert.equal(check(item,{...item.expected,aip_reference:'AIP SUP 08/24 DATED 09 MAR 2024'}).valid,false);
});

test('机场设施可保留原文名称，不能换成未提供的名称',()=>{
 const item=suite.cases[4];const facilities=item.expected.affected_facilities;
 assert.equal(check(item,{...item.expected,affected_facilities:[...facilities,{type:'Airport',name:'KAOHSIUNG INTL AIRPORT',status:'restricted'}]}).valid,true);
 assert.equal(check(item,{...item.expected,affected_facilities:[...facilities,{type:'Airport',name:'UNKNOWN INTL AIRPORT',status:'restricted'}]}).valid,false);
});

test('时间B/C/D保留PERM、EST和时段，拒绝补写或改动',()=>{
 for(const [end,expectedEnd,permanent,estimated] of [['PERM',null,true,false],['2611011200 EST','2611011200',false,true]]){
  const notam='A)KDEN B)2610300800 C)'+end+' D)0800-1200 E)AIRPORT CLSD';
  const validity={start:'2610300800',end:expectedEnd,permanent,estimated,schedule:'0800-1200'};
  assert.deepEqual(notamFacts(notam).validity,validity);
  const result={airport:'KDEN',restriction_Type:'closed',details:'Airport closed.',validity};
  assert.equal(checkParsing(JSON.stringify(result),notam,{parserType:'report'}).valid,true);
  assert.equal(checkParsing(JSON.stringify({...result,validity:{...validity,end:'2612010000'}}),notam,{parserType:'report'}).valid,false);
 }
 const wrong={airport:'KDEN',restriction_Type:'closed',details:'Closed',validity:{start:null,end:null,permanent:true,estimated:false,schedule:null}};
 assert.equal(checkParsing(JSON.stringify(wrong),'A)KDEN E)AIRPORT CLSD',{parserType:'report'}).valid,false);
});

test('论文默认起降和航班类型生效，显式类别不得被扩大',()=>{
 const notam='A)KDEN E)RWY 17L CLSD';
 assert.equal(checkParsing(JSON.stringify([row]),notam).valid,true);
 assert.equal(checkParsing(JSON.stringify([{...row,affect_region:'LANDINGS'}]),notam).valid,false);
 assert.equal(checkParsing(JSON.stringify([{...row,flight_type:'Domestic'}]),notam).valid,false);
 const explicit='A)KDEN E)RWY 17L CLSD FOR LANDINGS INTERNATIONAL FLIGHTS ONLY';
 assert.equal(checkParsing(JSON.stringify([{...row,affect_region:'LANDINGS',flight_type:'International'}]),explicit).valid,true);
 assert.equal(checkParsing(JSON.stringify([{...row,affect_region:'LANDINGS'}]),explicit).valid,false);
 const chinese='A)KDEN E)RWY 17L CLSD FOR LANDINGS 仅限国内航班';
 assert.equal(checkParsing(JSON.stringify([{...row,affect_region:'LANDINGS',flight_type:'国内航班'}]),chinese).valid,true);
});

test('翼展FT换算保留比较关系，CODE不展开未知机型',()=>{
 const notam='A)KDEN E)RWY 17L RESTRICTED TO ACFT WINGSPAN LT 100FT';
 assert.equal(checkParsing(JSON.stringify([{...row,affect_actype:'WINGSPAN < 30.48M'}]),notam).valid,true);
 for(const value of [null,'WINGSPAN < 100M','WINGSPAN > 30.48M'])assert.equal(checkParsing(JSON.stringify([{...row,affect_actype:value}]),notam).valid,false);
 const code='A)KDEN E)RWY 17L LIMITED TO CODE C ACFT';
 assert.equal(checkParsing(JSON.stringify([{...row,affect_actype:'CODE C'}]),code).valid,true);
 assert.equal(checkParsing(JSON.stringify([{...row,affect_actype:'B737'}]),code).valid,false);
});

test('论文模式保存开放/限制/局部分类并接受逗号列出的跑道',()=>{
 const rows=[row,{...row,runway:'35R'}];
 assert.equal(checkParsing(JSON.stringify(rows),'A)KDEN E)RWY 17L,35R OPN TO TFC').interpretation.status,'open');
 const partial=checkParsing(JSON.stringify(rows),'A)KDEN E)RWY 17L/35R E 500FT CLSD');
 assert.equal(partial.valid,true);assert.equal(partial.interpretation.partial,true);assert.equal(partial.interpretation.status,'closed');
});

test('业务任务传递模式与编号，重开保留模式、结果和schema版本',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'szh-report-test-'));
 let seen;
 const item=suite.cases[2];
 const service=await TaskService.open({directory,executionMode:'test',runner:async args=>{seen=args;return {raw:JSON.stringify(item.expected),runtime:'test',model:'test',tool_calls:[]};}});
 t.after(async()=>{await service.close();assert(directory.startsWith(join(tmpdir(),'szh-report-test-')));await rm(directory,{recursive:true});});
 const task=await service.create({notam:item.notam,notam_id:item.notam_id,parser_type:'report'});
 await service.start(task.id);
 for(let i=0;i<100 && service.get(task.id).status!=='completed';i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(service.get(task.id).status,'completed');assert.equal(seen.parserType,'report');assert.equal(seen.notamId,item.notam_id);
 assert.equal(seen.dshHome,join(directory,'dsh'));
 assert.equal(service.get(task.id).solution.schema_version,'report-v1');
 await service.close();
 const reopened=await TaskService.open({directory,executionMode:'test',runner:async()=>{throw new Error('must not run');}});
 assert.equal(reopened.get(task.id).parser_type,'report');assert.deepEqual(reopened.get(task.id).result,item.expected);await reopened.close();
});
