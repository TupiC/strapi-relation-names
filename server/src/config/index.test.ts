import { describe, expect, it } from 'vitest';

import config, { validateConfig } from './index';

describe('plugin config', () => {
  it('defaults collections to an empty string array', () => {
    expect(config.default).toEqual({ collections: [] });
  });

  it('accepts a string array and rejects invalid collections config', () => {
    expect(() => validateConfig({ collections: ['api::article.article'] })).not.toThrow();
    expect(() => validateConfig({ collections: [] })).not.toThrow();
    expect(() => validateConfig({ collections: ['api::article.article', 1] })).toThrow();
    expect(() => validateConfig({ collections: 'api::article.article' })).toThrow();
  });
});
