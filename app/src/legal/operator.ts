/**
 * Operator (controller) details shown on the legal pages. Single source of truth: change them only here.
 * While a field is empty, the pages show a clearly marked placeholder instead (see PLACEHOLDER).
 * No postal address on purpose (owner's decision).
 */
export interface Operator {
  name: string;
  email: string;
  /** Region of the Supabase project (database, auth, Edge Functions). */
  supabaseRegion: string;
}

export const operator: Operator = {
  name: 'Tim Faul',
  email: 'info@yezun.de',
  supabaseRegion: 'EU West (Irland)',
};

export const PLACEHOLDER: Record<keyof Operator, string> = {
  name: '[Name des Betreibers]',
  email: '[E-Mail-Adresse des Betreibers]',
  supabaseRegion: '[Region des Supabase-Projekts]',
};
