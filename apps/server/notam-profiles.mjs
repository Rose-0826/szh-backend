import {readFileSync} from 'node:fs';

const load = name => JSON.parse(readFileSync(new URL('../../solutions/aviation-notam/' + name, import.meta.url), 'utf8'));
const profiles = {
  runway: {name: '论文五字段跑道解析', schemaVersion: 'paper-v1', schema: load('runway.schema.json'), rules: load('runway-rules.json')},
  report: {name: '研究报告业务解析', schemaVersion: 'report-v1', schema: load('report.schema.json'), rules: load('report-rules.json')},
};

export function getNotamProfile(parserType = 'runway') {
  if (!Object.hasOwn(profiles, parserType)) throw new Error('unsupported_parser');
  return profiles[parserType];
}
