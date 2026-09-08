import { describe, expect, it } from 'vitest';

import relationLabels from './relation-labels';

describe('relation labels collection config', () => {
  it('does not decorate results for a collection outside the configured list', async () => {
    let getModelCalls = 0;
    const settings = {
      get: async () => ({
        collections: ['api::article.article'],
        relations: {},
      }),
    };
    const strapi = {
      plugin: (name: string) => {
        if (name !== 'strapi-relation-names') {
          throw new Error(`Unexpected plugin: ${name}`);
        }
        return { service: () => settings };
      },
      getModel: () => {
        getModelCalls += 1;
        return undefined;
      },
    } as any;
    const service = relationLabels({ strapi });
    const results = [{ id: 1 }];

    await expect(
      service.decorateRelationResults(
        { state: { userAbility: undefined } },
        'api::author.author',
        'articles',
        results
      )
    ).resolves.toBe(results);
    expect(getModelCalls).toBe(0);
  });
});
