import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const engine=new URL('../',import.meta.url);
const source=await readFile(new URL('apps/client/web/SZH_assets/task-client.js',engine),'utf8');
const markup=await readFile(new URL('apps/client/web/index.html',engine),'utf8');
const notam='A)KDEN E) RWY 17L/35R CLSD';
function fixture(id='fixture-one',status='awaiting_confirmation'){
 return {id,status,notam,timeout_seconds:300,updated_at:'2026-10-29T00:00:00Z',plan:['读取定义','检查结果'],steps:[],attempts:[],result:null,checks:null,error:null,execution_mode:'client_test_adapter',professional_review:'pending'};
}
async function setup(){
 const elements=new Map(),events=new Map(),requests=[],blobs=[],clicked=[],state={tasks:new Map(),creates:0};
 let doc;
 class Element{
  constructor(id){this.id=id;this.value='';this.disabled=false;this.hidden=false;this.innerHTML='';this.textContent='';this.className='';this.dataset={};this.tabIndex=0;this.attrs=new Map();this.handlers=new Map();const classes=new Set();this.classList={toggle:(v,on)=>on===false?classes.delete(v):classes.add(v),contains:v=>classes.has(v)};}
  addEventListener(k,f){this.handlers.set(k,f);} setAttribute(k,v){this.attrs.set(k,String(v));} removeAttribute(k){this.attrs.delete(k);}
  focus(){doc.activeElement=this;} getClientRects(){return this.hidden?[]:[{}];}
  querySelectorAll(){return [];} click(){clicked.push({href:this.href,name:this.download});}
 }
 for(const match of markup.matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element(match[1]));
 const tabs=['result','process','sources','files'].map(name=>{const e=elements.get('tab-'+name);e.dataset.tab=name;return e;});
 const panes=['result','process','sources','files'].map(name=>{const e=elements.get('pane-'+name);e.dataset.pane=name;return e;});
 doc={getElementById:id=>{assert(elements.has(id),'Missing real DOM id '+id);return elements.get(id);},querySelectorAll:selector=>selector==='[data-tab]'?tabs:selector==='[data-pane]'?panes:[],addEventListener:(k,f)=>events.set(k,f),createElement:tag=>new Element(tag)};
 elements.get('budget').value='300';
 const storage=new Map();
 const urlClass=class extends URL{static createObjectURL(blob){blobs.push(blob);return 'blob:test-download';}static revokeObjectURL(){}};
 const response=(data,status=200)=>new Response(JSON.stringify({data}),{status});
 const fetcher=async(url,options={})=>{
  const path=new URL(url).pathname;
  requests.push({path,method:options.method||'GET',body:options.body});
  if(path==='/api/health')return response({model_configured:false});
  if(path==='/api/tasks' && options.method==='POST'){
   state.creates++;if(state.createWait)await state.createWait;if(state.failCreate)throw new TypeError('Failed to fetch');
   const t=fixture('created-one');const submitted=JSON.parse(options.body);t.notam=submitted.notam;t.parser_type=submitted.parser_type;t.notam_id=submitted.notam_id;state.tasks.set(t.id,t);return response(t,201);
  }
  if(path==='/api/tasks')return response([...state.tasks.values()]);
  if(path.includes('/artifacts/')){
   if(state.artifactWait)await state.artifactWait;
   return state.artifactError?response({message:'该产物尚未生成。'},404):new Response('[]',{headers:{'Content-Type':'application/json'}});
  }
  const id=path.split('/').at(-1);
  if(state.failDetail)return response({message:'detail unavailable'},503);
  return response(state.tasks.get(id));
 };
 const context=vm.createContext({document:doc,window:{matchMedia:()=>({matches:false,addEventListener(){}})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{protocol:'http:',origin:'http://client.test'},fetch:fetcher,AbortSignal,URL:urlClass,Blob,console,setInterval:()=>0,setTimeout:()=>0});
 vm.runInContext(source,context);
 await new Promise(setImmediate);
 return {ctx:context,e:elements,state,requests,blobs,clicked,setCurrent(task){context.testFixture=task;vm.runInContext('current = testFixture; renderTask();',context);},value:code=>vm.runInContext(code,context)};
}
const event={preventDefault(){}};

test('启动进入通用工作台，专业表单和模型详情在能力内部展示',async()=>{
 const h=await setup();
 assert.equal(h.e.get('home').hidden,false);assert.equal(h.e.get('editor').hidden,true);assert.equal(h.e.get('task-workspace').hidden,true);
 assert.equal(h.e.get('status-detail').hidden,true);assert.equal(h.e.get('view-label').textContent,'工作台');
});

test('进入专业能力后可返回工作台，输入草稿保留',async()=>{
 const h=await setup();h.ctx.newTask();h.e.get('goal').value='未提交的通告';
 assert.equal(h.e.get('home').hidden,true);assert.equal(h.e.get('editor').hidden,false);
 h.ctx.showHome(false);assert.equal(h.e.get('home').hidden,false);assert.equal(h.e.get('goal').value,'未提交的通告');
 assert.equal(h.requests.filter(item=>item.method==='POST').length,0);
});

test('查看真实案例只读取已有任务，不创建或重新运行',async()=>{
 const h=await setup(),t=fixture('real-example','completed');t.parser_type='report';t.notam_id='ZPKM_K0790/24';t.result={airport:'ZPPP',restriction_Type:'ltd'};
 h.state.tasks.set(t.id,t);await h.ctx.refresh();h.e.get('open-example').handlers.get('click')();await new Promise(setImmediate);
 assert.equal(h.e.get('home').hidden,true);assert.equal(h.e.get('task-workspace').hidden,false);
 assert(h.requests.some(item=>item.path==='/api/tasks/real-example'));assert.equal(h.requests.filter(item=>item.method==='POST').length,0);
});
test('创建计划后确认与导出按钮恢复，不需切换页面',async()=>{
 const h=await setup();h.e.get('goal').value=notam;await h.ctx.createTask(event);
 assert.equal(h.e.get('run-action').disabled,false);assert.equal(h.e.get('record-export').disabled,false);assert.equal(h.e.get('create').disabled,false);
});
test('成功创建清空已提交草稿，已保存原文仍在',async()=>{
 const h=await setup();h.e.get('goal').value=notam;await h.ctx.createTask(event);h.ctx.newTask();
 assert.equal(h.e.get('goal').value,'');assert.equal(h.state.tasks.get('created-one').notam,notam);
});
test('提交失败保留输入及实际Failed to fetch提示',async()=>{
 const h=await setup();h.state.failCreate=true;h.e.get('goal').value=notam;await h.ctx.createTask(event);
 assert.equal(h.e.get('goal').value,notam);assert.match(h.e.get('message').textContent,/Failed to fetch/);assert.equal(h.e.get('create').disabled,false);
});
test('详情读取失败保留输入，不误判为成功消费草稿',async()=>{
 const h=await setup();h.state.failDetail=true;h.e.get('goal').value=notam;await h.ctx.createTask(event);
 assert.equal(h.e.get('goal').value,notam);assert.match(h.e.get('message').textContent,/detail unavailable/);
});
test('提交未返回期间双击仅发送一次创建',async()=>{
 const h=await setup();let release;h.state.createWait=new Promise(r=>release=r);h.e.get('goal').value=notam;
 const first=h.ctx.createTask(event),second=h.ctx.createTask(event);assert.equal(h.state.creates,1);release();await Promise.all([first,second]);assert.equal(h.state.creates,1);
});
test('提交期间继续编辑的新输入不被旧提交清空',async()=>{
 const h=await setup();let release;h.state.createWait=new Promise(r=>release=r);h.e.get('goal').value=notam;
 const pending=h.ctx.createTask(event);h.e.get('goal').value='new draft';release();await pending;assert.equal(h.e.get('goal').value,'new draft');
});
test('未提交草稿在查看历史再新建后保留',async()=>{
 const h=await setup();const t=fixture();h.state.tasks.set(t.id,t);h.e.get('goal').value='draft';
 await h.ctx.openTask(t.id);h.ctx.newTask();assert.equal(h.e.get('goal').value,'draft');
});
test('实际引用按notam_reference的callId对应返回，不将schema返回当资料',async()=>{
 const h=await setup(),t=fixture();const hit={id:'source-1',title:'官方摘录',locator:'章节1',url:'https://example.org/',summary:'说明'};
 t.steps=[{tool_calls:[{data:{name:'notam_reference',callId:'ref'}},{data:{name:'notam_schema',callId:'schema'}}],tool_results:[{message:{toolCallId:'ref',content:[{type:'text',text:JSON.stringify([hit])}]}},{message:{toolCallId:'schema',content:[{type:'text',text:JSON.stringify([{...hit,id:'wrong-source'}])}]}}]}];
 const hits=h.ctx.actualReferences(t);assert.equal(hits.length,1);assert.equal(hits[0].id,'source-1');
});
test('无资料返回如实提示，不冒充本次已引用',async()=>{
 const h=await setup();h.setCurrent(fixture());assert.match(h.e.get('runtime-sources').innerHTML,/未提供可展示的资料返回/);assert.match(h.e.get('runtime-sources').innerHTML,/不把下方资料检索当作本次引用/);
});
test('资料标题转义且拒绝javascript链接',async()=>{
 const h=await setup(),html=h.ctx.referenceView({title:'<img src=x>',url:'javascript:alert(1)',locator:'L'});
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/href="javascript:/);assert.match(html,/未提供有效/);
});
test('缺编号无效结果明确不补猜，检查文字使用失败样式',async()=>{
 const h=await setup(),t=fixture('missing','invalid_output');t.result=[];t.checks={valid:false,errors:['原文未提供明确跑道编号，不能补猜设施。'],warnings:[]};h.setCurrent(t);
 assert.match(h.e.get('simple-result').innerHTML,/报文信息不足/);assert.match(h.e.get('checks').className,/invalid/);assert.equal(h.e.get('action-hint').hidden,false);
});

test('范围外滑行道单独说明，不显示为报文编号缺失',async()=>{
 const h=await setup(),t=fixture('taxiway','invalid_output');t.result=[];t.checks={valid:false,errors:['原文涉及滑行道（TWY），当前仅支持跑道解析，不能补猜跑道编号。'],warnings:[]};h.setCurrent(t);
 assert.match(h.e.get('simple-result').innerHTML,/当前任务不支持滑行道解析/);assert.doesNotMatch(h.e.get('simple-result').innerHTML,/报文信息不足/);
});
test('局部范围保留显眼提示，专业审核仍未确认',async()=>{
 const h=await setup(),t=fixture('partial','completed');t.result=[{}];t.checks={valid:true,errors:[],warnings:['原文含局部范围']};h.setCurrent(t);
 assert.match(h.e.get('simple-result').innerHTML,/result-warning/);assert.match(h.e.get('simple-result').innerHTML,/专业审核待确认/);
});
test('下载期间切换任务仍获取原任务文件，并保留JSON MIME',async()=>{
 const h=await setup();h.setCurrent(fixture('original'));let release;h.state.artifactWait=new Promise(r=>release=r);
 const button=h.e.get('record-export'),pending=h.ctx.downloadArtifact('result.json',button);assert.equal(button.disabled,true);
 h.setCurrent(fixture('different'));release();await pending;
 assert(h.requests.some(x=>x.path==='/api/tasks/original/artifacts/result.json'));assert.equal(h.blobs.at(-1).type,'application/json;charset=utf-8');assert.equal(h.clicked.at(-1).name,'result.json');assert.equal(button.disabled,false);
});
test('下载404保留服务原因并恢复按钮，不伪造下载成功',async()=>{
 const h=await setup();h.setCurrent(fixture());h.state.artifactError=true;
 await h.ctx.downloadArtifact('runtime-summary.json',h.e.get('record-export'));
 assert.match(h.e.get('message').textContent,/尚未生成/);assert.equal(h.clicked.length,0);assert.equal(h.e.get('record-export').disabled,false);
});

test('业务模式和报文编号随创建提交，已提交编号清空',async()=>{
 const h=await setup();h.e.get('goal').value=notam;h.e.get('parser-type').value='report';h.e.get('notam-id').value='TEST_A1234/26';await h.ctx.createTask(event);
 const sent=JSON.parse(h.requests.find(item=>item.method==='POST').body);
 assert.equal(sent.parser_type,'report');assert.equal(sent.notam_id,'TEST_A1234/26');assert.equal(h.e.get('notam-id').value,'');
});

test('业务结果展示例外、分类条件和时间，不把对象当跑道数组',async()=>{
 const h=await setup(),t=fixture('business','completed');t.parser_type='report';
 t.result={airport:'ZPPP',restriction_Type:'ltd',exception:'Emergency situations',Diversion_Restriction:true,restrictions:[{applies_to:{flight_type:['domestic']},permission:'conditional',operation:'landing',condition:'Aircraft AND crew must be qualified.'}],validity:{start:'2610300800',end:null,permanent:true,estimated:false,schedule:null}};
 h.setCurrent(t);const text=h.e.get('simple-result').innerHTML;
 assert.match(text,/存在运行限制/);assert.match(text,/例外条件/);assert.match(text,/国内/);assert.match(text,/PERM/);assert.doesNotMatch(text,/undefined/);
});

test('原文高亮只采用匹配的位置，并转义输入内容',async()=>{
 const h=await setup(),t=fixture();t.notam='A)KDEN E)<img src=x> RWY 17L CLSD';t.checks={evidence:{items:[{field:'airport',text:'KDEN',offset:2},{field:'runway',text:'wrong',offset:0}]}};
 const result=h.ctx.originalView(t);assert.match(result,/<mark title="airport">KDEN<\/mark>/);assert.match(result,/&lt;img src=x&gt;/);assert.doesNotMatch(result,/<img/);
});
