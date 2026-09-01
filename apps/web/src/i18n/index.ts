import { en, type MessageTree } from './en';

export const SUPPORTED_LOCALES = ['en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const catalogues: Record<Locale, MessageTree> = { en };

type Leaves<T, P extends string = ''> = T extends string
  ? P
  : {
      [K in keyof T & string]: Leaves<T[K], P extends '' ? K : `${P}.${K}`>;
    }[keyof T & string];

export type MessageKey = Leaves<MessageTree>;

function lookup(tree: unknown, path: string): string | undefined {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, tree) as string | undefined;
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const raw = lookup(catalogues[locale], key) ?? lookup(catalogues[DEFAULT_LOCALE], key);
  if (typeof raw !== 'string') {
    throw new Error(`Missing i18n key: ${key}`);
  }
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
