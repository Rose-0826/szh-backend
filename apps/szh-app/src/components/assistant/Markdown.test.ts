import { describe, expect, it } from 'vitest';
import { inline, parseBlocks } from './Markdown';

describe('parseBlocks', () => {
  it('splits headings, lists, quotes, rules, code fences and paragraphs', () => {
    const md = ['## 结论', '', '第一行', '第二行', '- a', '- b', '1. x', '2) y', '> 引用', '---', '```js', 'const a = 1;', '', '```', '尾段'].join('\n');
    expect(parseBlocks(md)).toEqual([
      { t: 'h', level: 2, text: '结论' },
      { t: 'p', lines: ['第一行', '第二行'] },
      { t: 'ul', items: ['a', 'b'] },
      { t: 'ol', items: ['x', 'y'] },
      { t: 'quote', lines: ['引用'] },
      { t: 'hr' },
      { t: 'code', lang: 'js', body: 'const a = 1;\n' },
      { t: 'p', lines: ['尾段'] },
    ]);
  });

  it('keeps an unterminated fence as code', () => {
    expect(parseBlocks('```\nraw')).toEqual([{ t: 'code', lang: '', body: 'raw' }]);
  });
});

describe('inline', () => {
  it('keeps plain text and recognises code, bold and http links only', () => {
    const nodes = inline('a `b` **c** [d](https://x.y) [e](javascript:alert(1))');
    expect(nodes.filter((n) => typeof n === 'string').join('')).toBe('a' + ' '.repeat(4) + '[e](javascript:alert(1))');
    const tags = nodes.filter((n) => typeof n !== 'string').map((n) => (n as { type: string }).type);
    expect(tags).toEqual(['code', 'strong', 'a']);
  });
});
