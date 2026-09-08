import { describe, expect, it } from 'vitest';

import relationLabels, { buildPopulate } from './relation-labels';

describe('relation label population', () => {
  it('populates component roots for nested template fields', () => {
    expect(
      buildPopulate(['mainParticipant.firstName', 'mainParticipant.lastName', 'profile.name'])
    ).toEqual({ mainParticipant: true, profile: true });
  });

  it('populates nested relation paths', () => {
    expect(buildPopulate(['registrations.firstName'])).toEqual({ registrations: true });
    expect(buildPopulate(['registrations.participant.firstName'])).toEqual({
      registrations: { populate: { participant: true } },
    });
  });

  it('does not add population for top-level template fields', () => {
    expect(buildPopulate(['name'])).toBeUndefined();
  });
});

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
