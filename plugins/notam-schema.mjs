import { defineTool } from '@deepseek-ai/dsh-tools';
import { searchKnowledge } from '../apps/server/knowledge.mjs';
import {getNotamProfile} from '../apps/server/notam-profiles.mjs';

export const name = 'szh-notam-schema';
export const inject = ['tools'];

export function apply(ctx) {
  const {schema, rules} = getNotamProfile(process.env.SZH_NOTAM_PARSER_TYPE || 'runway');
  ctx.tools.register(defineTool({
    name: 'notam_schema',
    description: '读取本次NOTAM任务选定模式的字段和资料规则。解析前调用一次，以工具返回的输出格式为准。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() { return JSON.stringify({ schema, rules }); },
  }));
  ctx.tools.register(defineTool({
    name: 'notam_reference',
    description: '查询已收录的官方NOTAM格式资料摘要，返回来源网址与章节。用于核对字段、跑道编号、时间或Q码，不用于补猜机场设施。',
    parameters: { query: { type: 'string', required: true, description: '关键词，如A)字段、跑道、QMRLC或时间' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute({ query }) { return JSON.stringify(searchKnowledge(query)); },
  }));
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.tools.restrict({ allow: ['notam_schema', 'notam_reference'] });
  });
}
