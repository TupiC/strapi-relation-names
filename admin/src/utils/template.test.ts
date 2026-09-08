import { describe, expect, it } from 'vitest';

import { getAvailableFields, validateTemplate } from './template';

const schema = {
  attributes: {
    name: { type: 'string' },
  },
};

describe('template system fields', () => {
  it('accepts scalar system fields', () => {
    expect(
      validateTemplate('{id} {documentId} {createdAt} {status}', schema.attributes)
    ).toBeNull();
  });

  it('lists scalar system fields with regular fields', () => {
    expect(getAvailableFields(schema, new Map())).toEqual([
      'id',
      'documentId',
      'createdAt',
      'updatedAt',
      'publishedAt',
      'locale',
      'status',
      'name',
    ]);
  });
});
