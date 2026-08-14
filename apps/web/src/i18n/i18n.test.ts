import { describe, expect, it } from 'vitest';
import { translate } from './index';

describe('i18n', () => {
  it('interpolates placeholders', () => {
    expect(translate('en', 'wizard.step', { current: 2, total: 3 })).toBe('Step 2 of 3');
  });

  it('throws on unknown keys', () => {
    expect(() => translate('en', 'does.not.exist' as never)).toThrow(/Missing i18n key/);
  });
});
