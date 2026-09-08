import { describe, expect, it } from 'vitest';

import {
  applyLabel,
  getIdentity,
  matchesRelation,
  relationValues,
  replaceRelationValue,
} from './relation-values';

const runtime = {
  template: '{firstName} {lastName}',
  placeholders: ['firstName', 'lastName'],
  displayField: 'firstName',
  sourceUid: 'api::article.article',
  targetUid: 'api::person.person',
  originalMainField: 'name',
};

describe('relation values', () => {
  it('uses component ids and document ids for content types', () => {
    expect(getIdentity({ id: 3, documentId: 'doc-3' }, 'component')).toBe(3);
    expect(getIdentity({ id: 3, documentId: 'doc-3' }, 'content-type')).toBe('doc-3');
    expect(getIdentity({ id: 3 }, 'content-type')).toBe(3);
  });

  it('matches relations by id or document id with locale and publication checks', () => {
    expect(matchesRelation({ id: 3 }, { id: 3 })).toBe(true);
    expect(matchesRelation({ id: 3 }, { id: 4 })).toBe(false);
    expect(
      matchesRelation(
        { documentId: 'doc-3', locale: 'en', publishedAt: null },
        { documentId: 'doc-3', locale: 'en', publishedAt: null }
      )
    ).toBe(true);
    expect(
      matchesRelation({ documentId: 'doc-3', locale: 'en' }, { documentId: 'doc-3', locale: 'de' })
    ).toBe(false);
    expect(
      matchesRelation(
        { documentId: 'doc-3', publishedAt: '2025-01-01' },
        { documentId: 'doc-3', publishedAt: null }
      )
    ).toBe(false);
  });

  it('extracts record relation values and ignores invalid array items', () => {
    const first = { id: 1 };
    const second = { id: 2 };

    expect(relationValues(first)).toEqual([first]);
    expect(relationValues([first, null, 'invalid', second])).toEqual([first, second]);
    expect(relationValues(null)).toEqual([]);
  });

  it('applies a rendered label without mutating the original value', () => {
    const value = { id: 1 };
    const labeled = applyLabel(value, { firstName: 'Ada', lastName: 'Lovelace' }, runtime);

    expect(labeled).toEqual({ id: 1, firstName: 'Ada Lovelace' });
    expect(value).toEqual({ id: 1 });
  });

  it('preserves identity fields for nested labels', () => {
    const value = { id: 1, documentId: 'doc-1' };
    const nestedRuntime = {
      ...runtime,
      template: '{mainParticipant.firstName} {mainParticipant.lastName}',
      placeholders: ['mainParticipant.firstName', 'mainParticipant.lastName'],
      displayField: 'documentId',
      originalMainField: 'documentId',
    };

    expect(
      applyLabel(
        value,
        { mainParticipant: { firstName: 'Ada', lastName: 'Lovelace' } },
        nestedRuntime
      )
    ).toEqual({ id: 1, documentId: 'doc-1', label: 'Ada Lovelace' });
  });

  it('falls back to the original main field when the label is blank', () => {
    const value = { id: 1 };
    expect(
      applyLabel(value, { documentId: 'doc-1' }, { ...runtime, originalMainField: 'id' })
    ).toEqual({ id: 1, firstName: 'doc-1' });

    const sameFieldRuntime = { ...runtime, displayField: 'name', originalMainField: 'name' };
    expect(applyLabel(value, {}, sameFieldRuntime)).toBe(value);
  });

  it('replaces both single and collection relation values', () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const hydrated = new Map([
      [first, { firstName: 'Ada', lastName: 'Lovelace' }],
      [second, { firstName: 'Grace', lastName: 'Hopper' }],
    ]);

    expect(replaceRelationValue(first, [first], hydrated, runtime)).toEqual({
      id: 1,
      firstName: 'Ada Lovelace',
    });
    expect(replaceRelationValue([first, second], [first, second], hydrated, runtime)).toEqual([
      { id: 1, firstName: 'Ada Lovelace' },
      { id: 2, firstName: 'Grace Hopper' },
    ]);
  });
});
