import { describe, expect, it } from 'vitest';
import { classifyAsset } from './asset-loader';

describe('classifyAsset', () => {
  it('recognises pdf and images', () => {
    expect(classifyAsset('application/pdf')).toBe('pdf');
    expect(classifyAsset('image/png')).toBe('image');
    expect(classifyAsset('application/zip')).toBe('unknown');
  });
});
