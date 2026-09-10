import { describe, expect, it } from 'vitest';

import { getAvailableFields, validateTemplate } from './template';

const schema = {
  attributes: {
    name: { type: 'string' },
    registrations: {
      type: 'relation',
      target: 'api::registration.registration',
    },
  },
};

const schemas = new Map([
  [
    'api::registration.registration',
    {
      attributes: {
        firstName: { type: 'string' },
        privateName: { type: 'string', private: true },
      },
    },
  ],
]);

describe('template system fields', () => {
  it('accepts scalar system fields', () => {
    expect(
      validateTemplate('{id} {documentId} {createdAt} {status}', schema.attributes)
    ).toBeNull();
  });

  it('lists scalar system fields with regular fields', () => {
    expect(getAvailableFields({ attributes: { name: { type: 'string' } } }, new Map())).toEqual([
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

  it('lists and validates scalar fields nested in a relation', () => {
    expect(getAvailableFields(schema, schemas)).toContain('registrations.firstName');
    expect(getAvailableFields(schema, schemas)).not.toContain('registrations.privateName');
    expect(validateTemplate('{registrations.firstName}', schema.attributes, schemas)).toBeNull();
    expect(validateTemplate('{registrations.privateName}', schema.attributes, schemas)).toContain(
      'registrations.privateName'
    );
  });

  it('validates date transformation pipelines', () => {
    expect(validateTemplate('{createdAt | toLocalDate}', schema.attributes)).toBeNull();
    expect(validateTemplate('{createdAt | toLocalDateTime}', schema.attributes)).toBeNull();
    expect(validateTemplate('{name | toLocalDate}', schema.attributes)).toContain('toLocalDate');
    expect(validateTemplate('{createdAt | unknown}', schema.attributes)).toContain('unknown');
  });
});
