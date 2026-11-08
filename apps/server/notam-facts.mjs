export function notamFacts(notam) {
  const fields = {};
  const markers = [...notam.matchAll(/\b([A-GQ])\)\s*/gi)];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + markers[i][0].length;
    const end = markers[i + 1]?.index ?? notam.length;
    fields[markers[i][1].toUpperCase()] = {text: notam.slice(start, end).trim(), offset: start};
  }
  const body = fields.E?.text || notam;
  const runwayMatches = [...notam.matchAll(/\bRWYS?\s+((?:0[1-9]|[12]\d|3[0-6])[LRC]?(?:\s*(?:\/|,|\bAND\b)\s*(?:0[1-9]|[12]\d|3[0-6])[LRC]?)*)\b/gi)];
  const runways = new Set(runwayMatches.flatMap(match => match[1].toUpperCase().split(/\s*(?:\/|,|\bAND\b)\s*/)));
  const airport = fields.A?.text.match(/^([A-Z]{4})\b/i)?.[1].toUpperCase() || null;
  const partial = /\b(?:PART|PARTIALLY|PORTION|\d+\s*(?:FT|M)\s+CLSD)\b|局部|部分.*(?:跑道|关闭)/i.test(body);
  const status = /\b(?:OPEN|OPN|CANCELLED CLOSURE|NOT CLSD)\b|重新开放|恢复开放|取消关闭/i.test(body) ? 'open'
    : /\b(?:RESTRICTED|LIMITED|RESERVED FOR)\b|限制|受限/i.test(body) ? 'restricted'
    : /\b(?:CLOSED|CLSD|CLOSURE|NOT AVBL|UNAVAILABLE|SUSPENDED)\b|关闭/i.test(body) ? 'closed' : null;
  const permanent = /^PERM\b/i.test(fields.C?.text || '');
  const validity = ['B', 'C', 'D'].some(key => fields[key]) ? {
    start: fields.B?.text.match(/^\d{10}\b/)?.[0] || null,
    end: permanent ? null : fields.C?.text.match(/^\d{10}\b/)?.[0] || null,
    permanent, estimated: /\bEST\b/i.test(fields.C?.text || ''), schedule: fields.D?.text || null,
  } : null;
  const items = [];
  if (airport) items.push({field: 'airport', text: airport, offset: fields.A.offset});
  for (const match of runwayMatches) items.push({field: 'runway', text: match[0], offset: match.index});
  for (const key of ['B', 'C', 'D']) if (fields[key]) items.push({field: 'validity', ...fields[key]});
  for (const match of notam.matchAll(/\b(?:CLSD|CLOSED|RESTRICTED|LIMITED|OPEN|OPN TO TFC|NOT AVBL|UNAVAILABLE|ALL TWYS?|TWY\s+[A-Z]\w*)\b|机场关闭|不接收备降|紧急情况除外|指定区域/gi)) {
    items.push({field: 'restriction', text: match[0], offset: match.index});
  }
  return {fields, body, airport, partial, status, runwayMatches, runways, validity, evidence: {items}};
}
