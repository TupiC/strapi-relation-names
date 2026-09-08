import { describe, expect, it } from 'vitest';

import { normalizeSettings } from './settings';
import { isCollectionEnabled } from './utils/collections';

describe('relation names settings', () => {
  it('normalizes stored relations while applying configured collections', () => {
    expect(
      normalizeSettings(
        {
          relations: {
            'api::article.article': {
              title: '{title}',
              invalid: 42,
            },
          },
        },
        ['api::article.article']
      )
    ).toEqual({
      collections: ['api::article.article'],
      relations: {
        'api::article.article': { title: '{title}' },
      },
    });
  });

  it('enables every collection when the list is empty', () => {
    expect(isCollectionEnabled([], 'api::article.article')).toBe(true);
    expect(isCollectionEnabled(['api::article.article'], 'api::article.article')).toBe(true);
    expect(isCollectionEnabled(['api::article.article'], 'api::author.author')).toBe(false);
  });
});
