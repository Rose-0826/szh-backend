import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../../knowledge/passages.json', import.meta.url), 'utf8'));

export function searchKnowledge(query = '') {
  const terms = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.passages.filter((passage) => {
    const text = [passage.title, passage.summary, ...passage.keywords].join(' ').toLowerCase();
    return !terms.length || terms.some((term) => text.includes(term));
  }).slice(0, 8).map((passage) => ({ ...passage, verified_on: catalog.verified_on }));
}

export function readKnowledge(id) {
  return searchKnowledge().find((passage) => passage.id === id) || null;
}
