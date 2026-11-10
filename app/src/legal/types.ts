import type { Operator } from './operator.ts';

/** A piece of running text: plain text, an operator field, or a link. */
export type Inline =
  | string
  | { field: keyof Operator; mailto?: boolean }
  | { text: string; href: string };

/** A paragraph: plain string or a sequence of inline pieces. */
export type Text = string | Inline[];

export type Block = { p: Text } | { ul: Text[] } | { h3: string };

export interface LegalSection {
  heading: string;
  blocks: Block[];
}

export interface LegalDoc {
  /** h1 and document title. */
  title: string;
  /** "Stand" date, already formatted in German. */
  stand: string;
  intro: Block[];
  sections: LegalSection[];
}
