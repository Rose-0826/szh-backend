// Development conformance check using the supplied report examples; calls the configured model.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const base=process.env.SZH_SERVICE_URL || 'http://127.0.0.1:4782';
const reference=JSON.parse(await readFile(new URL('../evaluation/report-cases.json',import.meta.url),'utf8'));
const cases=[...reference.cases,
 {id:'X-FT',parser_type:'runway',notam:'A)KDEN E)RWY 17L RESTRICTED TO ACFT WINGSPAN LT 100FT',expected_runway:'17L'},
 {id:'X-PERM-PARTIAL',parser_type:'report',notam:'A)KDEN B)2610300800 C)PERM D)0800-1200 E)RWY 17L/35R E 500FT CLSD',expected_status:'ltd'},
 {id:'X-OPEN-EST',parser_type:'report',notam:'A)KDEN B)2610300800 C)2610311200 EST E)RWY 17L/35R OPN TO TFC',expected_status:'open'},
];
const selected=process.argv[2] ? cases.filter(item=>item.id===process.argv[2]) : cases;
if(!selected.length)throw new Error('Unknown case');
const report={date:'2026-10-30',mode:'live_model_development_check',note:'报告中已知参考案例及少量构造变体，用于开发检查，不代表总体专业正确率。',cases:[]};
const api=async(path,body)=>{
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const {data}=await response.json();if(!response.ok)throw new Error(data.message);return data;
};
const equality=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const restrictionKeys=items=>[...new Set((items||[]).flatMap(item=>(item.applies_to.flight_type||[item.applies_to.aircraft_type]).map(type=>type+'|'+item.permission+'|'+item.operation)))].sort();
try{
 for(const item of selected){
  const created=await api('/api/tasks',{notam:item.notam,notam_id:item.notam_id,parser_type:item.parser_type,timeout_seconds:300});
  await api('/api/tasks/'+created.id+'/start',{});
  let task;
  const deadline=Date.now()+330000;
  do{
   await new Promise(resolve=>setTimeout(resolve,500));
   task=await api('/api/tasks/'+created.id);
   if(Date.now()>deadline)throw new Error('Polling timeout');
  }while(['queued','running','stopping'].includes(task.status));
  const comparisons={completed:task.status==='completed',runtime_executed:task.runtime_executed};
  const actual=task.result;
  if(item.expected && actual && !Array.isArray(actual)){
   for(const key of ['id','airport','restriction_Type','affect_region','Diversion_Restriction','industrialaction'])if(Object.hasOwn(item.expected,key))comparisons[key]=equality(actual[key],item.expected[key]);
   for(const key of ['reason','details','exception','aip_reference'])if(item.expected[key])comparisons[key+'_present']=typeof actual[key]==='string' && actual[key].length>0;
   if(item.expected.affected_facilities)comparisons.affected_facilities=item.expected.affected_facilities.every(expected=>(actual.affected_facilities||[]).some(item=>item.type===expected.type && item.name===expected.name && item.status===expected.status));
   if(item.expected.restrictions)comparisons.restrictions=equality(restrictionKeys(actual.restrictions),restrictionKeys(item.expected.restrictions));
  }
  if(item.expected_status)comparisons.expected_status=actual?.restriction_Type===item.expected_status;
  if(item.expected_runway)comparisons.expected_runway=Array.isArray(actual) && actual.length===1 && actual[0].runway===item.expected_runway;
  // Artifact responses have their own shape, unlike the API envelope.
  const artifactResponse=await fetch(base+'/api/tasks/'+task.id+'/artifacts/model-response.json');
  const receipt=await artifactResponse.json();
  const schemaCall=receipt.tool_calls?.find(call=>call.name==='notam_schema');
  const schemaReply=receipt.tool_results?.find(result=>result.message?.toolCallId===schemaCall?.callId)?.message;
  const payload=schemaReply?.content?.find(block=>block.type==='text')?.text;
  comparisons.correct_tool_profile=payload ? JSON.parse(payload).rules.version===(item.parser_type==='report'?'report-v1':'paper-v1') : false;
  const result={id:item.id,source:item.source||'constructed',task_id:task.id,parser_type:item.parser_type,status:task.status,passed:Object.values(comparisons).every(Boolean),comparisons,result:actual,checks:task.checks,error:task.error};
  report.cases.push(result);
  console.log(JSON.stringify({case:item.id,task_id:task.id,status:task.status,passed:result.passed,failed_checks:Object.entries(comparisons).filter(([,passed])=>!passed).map(([key])=>key),errors:task.checks?.errors}));
 }
}finally{
 const filename='materials-live-20261030-'+randomUUID().slice(0,8)+'.json';
 const directory=new URL('../evaluation/results/',import.meta.url);await mkdir(directory,{recursive:true});
 await writeFile(new URL(filename,directory),JSON.stringify(report,null,2));
 console.log(JSON.stringify({report:'evaluation/results/'+filename,passed:report.cases.filter(item=>item.passed).length,total:report.cases.length}));
}
if(report.cases.length!==selected.length || report.cases.some(item=>!item.passed))process.exitCode=1;
