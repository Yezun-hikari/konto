// Renders a LegalDoc with createElement/textContent only (no HTML strings).
import { el } from '../dom.ts';
import type { Screen } from '../router.ts';
import { operator, PLACEHOLDER } from './operator.ts';
import type { Block, Inline, LegalDoc, Text } from './types.ts';

function inline(i: Inline): Node {
  if (typeof i === 'string') return document.createTextNode(i);
  if ('field' in i) {
    const value = operator[i.field].trim();
    if (!value) return el('mark', { className: 'placeholder', text: PLACEHOLDER[i.field] });
    return i.mailto ? el('a', { text: value, attrs: { href: `mailto:${value}` } }) : document.createTextNode(value);
  }
  return el('a', { text: i.text, attrs: { href: i.href } });
}

const text = (t: Text): Node[] => (typeof t === 'string' ? [document.createTextNode(t)] : t.map(inline));

function block(b: Block): HTMLElement {
  if ('h3' in b) return el('h3', { text: b.h3 });
  if ('ul' in b) return el('ul', {}, ...b.ul.map((item) => el('li', {}, ...text(item))));
  return el('p', {}, ...text(b.p));
}

export function legalScreen(doc: LegalDoc): Screen {
  return {
    title: doc.title,
    mount(root) {
      const article = el(
        'article',
        { className: 'legal' },
        el('h1', { text: doc.title, attrs: { tabindex: '-1' } }),
        el('p', { className: 'legal-stand', text: `Stand: ${doc.stand}` }),
        ...doc.intro.map(block),
      );
      doc.sections.forEach((s, i) => {
        article.append(el('section', {}, el('h2', { text: `${i + 1}. ${s.heading}` }), ...s.blocks.map(block)));
      });
      root.append(article);
    },
  };
}
