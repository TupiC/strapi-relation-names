import { describe, expect, it } from 'vitest';

import { compileTemplate, parseTemplate, renderTemplate } from './relation-labels';

const targetSchema = {
  uid: 'api::person.person',
  attributes: {
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    age: { type: 'integer' },
    active: { type: 'boolean' },
    secret: { type: 'string', private: true },
    profile: { type: 'component' },
    mainParticipant: {
      type: 'component',
      component: 'default.participant',
    },
  },
};

const componentSchemas = new Map([
  [
    'default.participant',
    {
      uid: 'default.participant',
      attributes: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        secret: { type: 'string', private: true },
      },
    },
  ],
]);

describe('relation label templates', () => {
  it('parses multiple and repeated placeholders', () => {
    expect(parseTemplate('{firstName} {lastName} ({firstName})')).toEqual([
      'firstName',
      'lastName',
      'firstName',
    ]);
  });

  it('renders scalar values and replaces missing values with empty strings', () => {
    const compiled = compileTemplate('{firstName} {lastName} #{age} {active}', targetSchema);
    expect(compiled).not.toBeNull();
    if (!compiled) {
      throw new Error('Expected template to compile');
    }
    expect(renderTemplate(compiled, { firstName: 'Ada', age: 37, active: false })).toBe(
      'Ada  #37 false'
    );
  });

  it('compiles and renders scalar system fields', () => {
    const compiled = compileTemplate(
      '{id} {documentId} {createdAt} {updatedAt} {publishedAt} {locale} {status}',
      targetSchema
    );

    expect(compiled).not.toBeNull();
    expect(
      renderTemplate(compiled!, {
        id: 3,
        documentId: 'doc-3',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
        publishedAt: null,
        locale: 'en',
        status: 'published',
      })
    ).toBe('3 doc-3 2026-01-01 2026-01-02  en published');
  });

  it('compiles and renders scalar fields nested in a component', () => {
    const compiled = compileTemplate(
      '{mainParticipant.firstName} {mainParticipant.lastName}',
      targetSchema,
      (uid) => componentSchemas.get(uid)
    );

    expect(compiled).toMatchObject({
      placeholders: ['mainParticipant.firstName', 'mainParticipant.lastName'],
      displayField: 'firstName',
    });
    expect(
      renderTemplate(compiled!, { mainParticipant: { firstName: 'Ada', lastName: 'Lovelace' } })
    ).toBe('Ada Lovelace');
  });

  it('rejects malformed, unknown, private, and unsupported placeholders', () => {
    expect(parseTemplate('{firstName')).toBeNull();
    expect(parseTemplate('firstName}')).toBeNull();
    expect(compileTemplate('{unknown}', targetSchema)).toBeNull();
    expect(compileTemplate('{secret}', targetSchema)).toBeNull();
    expect(compileTemplate('{profile}', targetSchema)).toBeNull();
    expect(
      compileTemplate('{mainParticipant.secret}', targetSchema, (uid) => componentSchemas.get(uid))
    ).toBeNull();
    expect(
      compileTemplate('{mainParticipant.unknown}', targetSchema, (uid) => componentSchemas.get(uid))
    ).toBeNull();
    expect(compileTemplate('Only static text', targetSchema)).toBeNull();
    expect(compileTemplate('{first-name}', targetSchema)).toBeNull();
    expect(parseTemplate('{mainParticipant..firstName}')).toBeNull();
  });

  it('requires a target schema and trims blank rendered labels', () => {
    expect(compileTemplate('{firstName}', undefined)).toBeNull();

    const compiled = compileTemplate(' {firstName} {lastName} ', targetSchema);
    expect(compiled).not.toBeNull();
    if (!compiled) {
      throw new Error('Expected template to compile');
    }
    expect(renderTemplate(compiled, {})).toBe('');
  });
});
