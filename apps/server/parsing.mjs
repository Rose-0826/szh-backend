import Ajv from 'ajv';
import {getNotamProfile} from './notam-profiles.mjs';
import {notamFacts} from './notam-facts.mjs';
import {checkReport} from './report-parsing.mjs';

export const runwaySchema = getNotamProfile('runway').schema;
const ajv = new Ajv({allErrors: true, strict: false});
const validators = {runway: ajv.compile(runwaySchema), report: ajv.compile(getNotamProfile('report').schema)};

export function checkParsing(raw, notam, {parserType = 'runway', notamId} = {}) {
  getNotamProfile(parserType);
  const validate = validators[parserType];
  const facts = notamFacts(notam);
  const warnings = parserType === 'report' ? ['输出字段依据研究报告案例整理，检查范围见本次记录。'] : ['字段与默认值依据论文附录第9—10页；检查范围见本次记录。', '五字段不包含关闭/开放状态和有效时段，不能单独据此判断运行条件。'];
  if (facts.partial && parserType === 'runway') warnings.push('原文含局部范围；论文模式按附录将局部影响归并到相应跑道记录，完整范围仍保留在原文，业务模式另行保留局部条件。');
  const runwayMatches = facts.runwayMatches;
  const explicitRunways = facts.runways;
  const body = facts.body;
  const taxiwayOnly = !explicitRunways.size && /\bTWYS?\b/i.test(body) && !/\bRWYS?\b/i.test(body);
  const scopeError = taxiwayOnly ? '原文涉及滑行道（TWY），当前仅支持跑道解析，不能补猜跑道编号。' : null;
  const clean = raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();
  let records;
  try { records = JSON.parse(clean); }
  catch { return { valid: false, records: null, errors: ['模型响应不是完整JSON。'], warnings }; }
  if (parserType === 'report') {
    if (!validate(records)) return {valid: false, records, errors: validate.errors.map(e => `${e.instancePath || '/'}: ${e.message}`), warnings: [], profile: 'report-v1'};
    return checkReport(records, notam, notamId);
  }
  if (Array.isArray(records) && records.length === 0) return { valid: false, records, errors: [scopeError || (explicitRunways.size ? '未返回可检查的跑道记录。' : '原文未提供当前任务可用的明确跑道编号，不能补猜设施。')], warnings };
  if (!validate(records)) {
    return { valid: false, records, errors: validate.errors.map((e) => `${e.instancePath || '/'}: ${e.message}`), warnings };
  }
  const airports = notam.match(/A\)\s*([A-Z]{4})\b/i);
  const errors = [];
  const seen = new Set();
  if (!airports) errors.push('原文缺少可核对的A)代码。');
  if (!explicitRunways.size) errors.push(scopeError || '原文没有当前格式可核对的明确跑道编号。');
  for (const row of records) {
    const key = `${row.airport}/${row.runway}`;
    if (seen.has(key)) errors.push(`重复跑道方向记录：${key}`);
    seen.add(key);
    if (airports && row.airport !== airports[1].toUpperCase()) errors.push(`机场代码与原文A)字段不一致：${row.airport}`);
    if (!explicitRunways.has(row.runway)) errors.push(`跑道方向未出现在原文明示编号中：${row.runway}`);
    const takeoff = /\b(?:TAKEOFFS?|TKOF)\b|起飞/i.test(body);
    const landing = /\b(?:LANDINGS?|LDG)\b|着陆|降落/i.test(body);
    const expectedRegion = takeoff && !landing ? 'TAKEOFFS' : landing && !takeoff ? 'LANDINGS' : 'TAKEOFFS,LANDINGS';
    if (row.affect_region !== expectedRegion) errors.push('起降影响与原文及论文默认规则不一致。');
    const allFlightTypes = [
      {source: /\bINTERNATIONAL\s+(?:FLIGHTS?|AIRLINES?)\b|国际(?:航班|航空公司)/i, output: /international|国际/i},
      {source: /\bDOMESTIC\s+(?:FLIGHTS?|AIRLINES?)\b|国内(?:航班|航空公司)/i, output: /domestic|国内/i},
      {source: /\bREGIONAL\s+(?:FLIGHTS?|AIRLINES?)\b|港[、，,]?澳[、，,]?台|地区(?:航班|航空公司)/i, output: /regional|港.*澳.*台|地区/i},
    ];
    const flightTypes = allFlightTypes.filter(type => type.source.test(body));
    if (!flightTypes.length && row.flight_type !== 'International,Domestic,Regional') errors.push('未指定航班类型时，应采用论文默认的International,Domestic,Regional。');
    if (flightTypes.some(type => !type.output.test(row.flight_type))) errors.push('航班类型遗漏原文明示类别。');
    if (flightTypes.length && allFlightTypes.some(type => !flightTypes.includes(type) && type.output.test(row.flight_type))) errors.push('航班类型增加了原文未指定的类别。');
    if (/(?:国际|国内|港[、，,]?澳[、，,]?台|地区)(?:航班|航空公司)/.test(body) && !/[\u4e00-\u9fff]/.test(row.flight_type)) errors.push('论文要求保留原文中的中文航班类型。');
    const aircraftMentioned = /\b(?:WINGSPAN|CODE\s*[A-F]|ENGINES?|B\d{3}|A\d{3})\b|翼展|机型|发动机/i.test(body);
    if (!aircraftMentioned && row.affect_actype !== null) errors.push('未提及机型条件时affect_actype应为null。');
    if (aircraftMentioned && !row.affect_actype) errors.push('原文明示机型或机型限制，affect_actype不能为null。');
    const feet = body.match(/(?:WINGSPAN|翼展)\D{0,30}(\d+(?:\.\d+)?)\s*FT\b/i);
    if (feet && row.affect_actype) {
      const metres = [...row.affect_actype.matchAll(/(\d+(?:\.\d+)?)\s*(?:M\b|米)/gi)].map(match => Number(match[1]));
      if (!metres.some(value => Math.abs(value - Number(feet[1]) * 0.3048) <= 0.011)) errors.push('翼展FT应按1FT=0.3048M换算，并保留原文比较条件。');
      if (/(?:\b(?:LT|LESS THAN|BELOW)\b|<|小于)/i.test(feet[0]) && !/(?:\b(?:LT|LESS THAN|BELOW)\b|<|小于)/i.test(row.affect_actype)) errors.push('翼展小于条件在换算后必须保留，不能反转或遗漏。');
      if (/(?:\b(?:GT|GREATER THAN|ABOVE)\b|>|大于)/i.test(feet[0]) && !/(?:\b(?:GT|GREATER THAN|ABOVE)\b|>|大于)/i.test(row.affect_actype)) errors.push('翼展大于条件在换算后必须保留，不能反转或遗漏。');
    }
    if (/\bCODE\s*[A-F]\b/i.test(body) && row.affect_actype && !/\bCODE\s*[A-F]\b/i.test(row.affect_actype)) errors.push('缺少机型映射表时应保留CODE类别，不能展开或替换为未提供的机型。');
  }
  for (const runway of explicitRunways) if (!records.some((row) => row.runway === runway)) errors.push(`缺少原文明示跑道方向：${runway}`);
  if (/\bCODE\s*[A-F]\b/i.test(body)) warnings.push('机型CODE类别按原文保留；缺少映射表时不展开具体机型。');
  return { valid: errors.length === 0, records, errors, warnings, evidence: { ...facts.evidence, airport: airports ? { text: airports[0], offset: airports.index } : null, runways: runwayMatches.map((match) => ({ text: match[0], offset: match.index })) }, interpretation: {status: facts.status, validity: facts.validity, partial: facts.partial, source: 'NOTAM-Evolve PDF第9—10页'}, profile: 'paper-v1' };
}
