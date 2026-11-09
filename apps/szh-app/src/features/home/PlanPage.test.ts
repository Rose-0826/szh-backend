import { describe, expect, it } from 'vitest';
import type { Solution } from '@/types/domain';
import { rankSolutions } from './PlanPage';

const solution = (id: string, name: string, description: string, tags: string[] = [], domain = '通用'): Solution => ({
  id, name, description, domain, tags, latestVersion: '0.1.0', versions: [], origin: 'mock',
});

const catalog = [
  solution('text', '文本词频统计', '统计输入文本的字符与词频', ['文本']),
  solution('fit', '最小二乘曲线拟合', '对二维数据点做线性或二次拟合，输出残差', ['拟合'], '数值方法'),
  solution('aic', 'AIC 流相推理与复核', '使用 FlowProxy 模型重建样例流场', [], '流体力学'),
];

describe('rankSolutions', () => {
  it('ranks by Chinese bigram overlap', () => {
    const [first, ...rest] = rankSolutions('帮我对实验数据做曲线拟合并看残差', catalog);
    expect(first.solution.id).toBe('fit');
    expect(first.score).toBeGreaterThan(0);
    expect(rest.every((r) => r.score <= first.score)).toBe(true);
  });

  it('matches latin words case-insensitively and ignores single letters', () => {
    expect(rankSolutions('run FLOWPROXY a', catalog)[0].solution.id).toBe('aic');
    expect(rankSolutions('a b c', catalog).every((r) => r.score === 0)).toBe(true);
  });

  it('searches domain and tags too', () => {
    expect(rankSolutions('流体力学问题', catalog)[0].solution.id).toBe('aic');
  });

  it('keeps every solution with score 0 when nothing matches, preserving order', () => {
    const ranked = rankSolutions('天气预报', catalog);
    expect(ranked.map((r) => r.score)).toEqual([0, 0, 0]);
    expect(ranked.map((r) => r.solution.id)).toEqual(['text', 'fit', 'aic']);
    expect(rankSolutions('', [])).toEqual([]);
  });
});
