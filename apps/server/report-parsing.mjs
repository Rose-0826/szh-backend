import {notamFacts} from './notam-facts.mjs';

export function checkReport(records, notam, notamId) {
  const facts = notamFacts(notam);
  const errors = [];
  const normalizations = [];
  const warnings = ['字段依据研究报告TC-001至TC-005整理；检查通过表示已实现的格式与原文检查通过。'];
  if (!facts.airport) errors.push('原文缺少可核对的A)代码。');
  else if (records.airport !== facts.airport) errors.push('机场代码与原文A)字段不一致。');
  const sourceId = notamId || notam.match(/\b(?:[A-Z]{4}_)?[A-Z]\d{4}\/\d{2}\b/)?.[0];
  if (records.id && records.id !== sourceId) errors.push('报文编号与输入不一致，不能生成未提供的编号。');
  if (sourceId && records.id !== sourceId) errors.push('缺少输入已提供的报文编号。');
  if (facts.validity) {
    if (JSON.stringify(records.validity) !== JSON.stringify(facts.validity)) {
      // Compare by field; object key order has no semantic meaning.
      if (!records.validity || Object.keys(facts.validity).some(key => records.validity[key] !== facts.validity[key])) errors.push('validity与原文B)/C)/D)不一致，PERM、EST和缺失时间必须如实保留。');
    }
  } else if (records.validity) errors.push('原文未提供B)/C)/D)，不能补写有效时间。');
  const body = facts.body;
  if (records.restriction_Type === 'closed' && (/紧急情况除外|\b(?:EXC|EXCEPT|ONLY AVBL|NOT AFFECTED)\b/i.test(body) || facts.partial || !/(?:机场|本场).{0,8}关闭|\b(?:AD|AIRPORT)\s+(?:IS\s+)?(?:CLSD|CLOSED)\b/i.test(body))) errors.push('不能把部分设施、部分业务关闭或保留例外的报文写成机场完全关闭。');
  if (records.restriction_Type === 'open' && !/\b(?:OPEN|OPN|CANCELLED CLOSURE|NOT CLSD)\b|重新开放|恢复开放|取消关闭/i.test(body)) errors.push('原文没有明确的开放或取消关闭依据。');
  if (/\b(?:CANCELLED CLOSURE|NOT CLSD|OPN TO TFC)\b|重新开放|恢复开放|取消关闭/i.test(body) && records.restriction_Type === 'closed') errors.push('原文是开放或取消关闭，不能输出closed。');
  const diversion = /不接收备降|不.{0,6}备降|\b(?:NOT (?:AVBL|AVAILABLE|USABLE).{0,30}(?:DIVERSION|ALTN)|NOT TO BE REQ AS AN ALTN|NO DIVERSION)\b/i.test(body);
  if (diversion && records.Diversion_Restriction !== true) errors.push('原文明示备降限制，不能遗漏Diversion_Restriction。');
  if (records.Diversion_Restriction === true && !diversion) errors.push('原文没有已实现规则可核对的备降限制依据。');
  if (/\b(?:INDUSTRIAL ACTIONS?|STRIKE)\b|罢工/i.test(body) && records.industrialaction !== true) errors.push('原文明示工业行动或罢工，不能遗漏industrialaction。');
  if (records.industrialaction === true && !/\b(?:INDUSTRIAL ACTIONS?|STRIKE)\b|罢工/i.test(body)) errors.push('原文未提及工业行动或罢工。');
  if (/紧急情况除外|\b(?:EXC|EXCEPT|ONLY AVBL FOR)\b/i.test(body) && !records.exception) errors.push('原文明示例外，必须保留exception。');
  if (/机组与航空器同时|航空器与机组同时/i.test(body)) {
    const conditions = (records.restrictions || []).map(item => item.condition || '').join(' ');
    if (!/(?:aircraft.{0,40}\bAND\b.{0,40}crew|crew.{0,40}\bAND\b.{0,40}aircraft|机组.{0,15}航空器.{0,10}同时|航空器.{0,15}机组.{0,10}同时|同时.{0,15}(?:机组|航空器))/i.test(conditions)) errors.push('原文要求机组与航空器同时满足条件，不能遗漏或改成二选一。');
    if (/RNP-AR\s*或\s*RNP-APCH/i.test(body) && !/RNP-AR.{0,20}(?:\bOR\b|或).{0,20}RNP-APCH/i.test(conditions)) errors.push('RNP-AR或RNP-APCH的可选资格关系必须保留。');
  }
  const aip = body.match(/\bAIP\s+SUP\s+(\d{1,3}\/\d{2,4})\b/i);
  if (aip && records.aip_reference) {
    const canonical = 'AIP SUP ' + aip[1];
    const supplied = records.aip_reference.replace(/\s+/g, ' ').trim();
    if (supplied.toUpperCase().startsWith(canonical + ' DATED ') && body.replace(/\s+/g, ' ').toUpperCase().includes(supplied.toUpperCase())) {
      normalizations.push({field:'aip_reference',from:records.aip_reference,to:canonical,reason:'将原文中的编号与发布日期分开，原始模型返回完整保留。'});
      records.aip_reference = canonical;
    }
  }
  if (aip && records.aip_reference?.toUpperCase() !== 'AIP SUP ' + aip[1]) errors.push('AIP SUP引用缺失或与原文不一致。');
  if (records.aip_reference && !aip) errors.push('原文没有AIP SUP引用，不能生成引用编号。');
  for (const facility of records.affected_facilities || []) {
    if (facility.type === 'Runway') {
      const names = facility.name.toUpperCase().replace(/^RWYS?\s*/, '').split(/\s*\/\s*/);
      if (!names.length || names.some(name => !facts.runways.has(name))) errors.push('受影响跑道未在原文明确写出：' + facility.name);
    } else if (facility.type === 'Taxiway') {
      const raw = facility.name.toUpperCase();
      const match = raw === 'ALL' ? /\bALL\s+TWYS?\b/i.test(body) : new RegExp('\\bTWYS?\\s+' + raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b','i').test(body);
      if (!match) errors.push('受影响滑行道未在原文明确写出：' + facility.name);
    } else if (facility.name !== facts.airport && !(/(?:AIRPORT|机场)$/i.test(facility.name) && body.toUpperCase().includes(facility.name.toUpperCase()))) errors.push('机场设施名称必须取A)代码或原文明示的机场名称。');
  }
  for (const runway of facts.runways) if (!(records.affected_facilities || []).some(facility => facility.type === 'Runway' && facility.name.split('/').map(value => value.trim()).includes(runway))) errors.push('缺少原文明示受影响跑道：' + runway);
  if (/\bALL\s+TWYS?\b/i.test(body) && !(records.affected_facilities || []).some(facility => facility.type === 'Taxiway' && facility.name === 'ALL')) errors.push('缺少原文明示的ALL TWY设施记录。');
  if (facts.partial) warnings.push('原文涉及局部范围，业务模式保留原文长度、位置和例外，不按整场关闭处理。');
  if (facts.validity) warnings.push('validity为工程时间字段，保留原始UTC十位字符串；未进行当前是否生效的运行判断。');
  if (records.restrictions?.some(item => item.permission === 'conditional')) warnings.push('条件与例外已保留；语义是否完整需结合原文查看。');
  if (/\bCODE\s*[A-F]\b/i.test(body)) warnings.push('未接入机型CODE映射表，保留原文类别，不展开具体机型。');
  return {valid: errors.length === 0, records, errors, warnings, normalizations, evidence: facts.evidence, profile: 'report-v1'};
}
