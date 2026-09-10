import { describe, expect, it } from 'vitest';

import { compileTemplate, parseTemplate, renderTemplate } from './relation-labels';
import { parseTemplateAst } from '../../../../shared/template';

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
    registrations: {
      type: 'relation',
      target: 'api::registration.registration',
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
  [
    'api::registration.registration',
    {
      uid: 'api::registration.registration',
      attributes: {
        firstName: { type: 'string' },
        privateName: { type: 'string', private: true },
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

  it('parses transformation pipelines into an AST', () => {
    expect(parseTemplateAst('{firstName} — {createdAt | toLocalDate}')).toEqual({
      tokens: [
        { type: 'expression', expression: { path: 'firstName', transforms: [] } },
        { type: 'text', value: ' — ' },
        {
          type: 'expression',
          expression: { path: 'createdAt', transforms: ['toLocalDate'] },
        },
      ],
      expressions: [
        { path: 'firstName', transforms: [] },
        { path: 'createdAt', transforms: ['toLocalDate'] },
      ],
    });
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

  it('formats date and datetime transformations with the supplied context', () => {
    const compiled = compileTemplate(
      '{createdAt | toLocalDate} / {createdAt | toLocalDateTime}',
      targetSchema
    );

    expect(compiled).not.toBeNull();
    expect(
      renderTemplate(
        compiled!,
        { createdAt: '2026-01-02T15:04:00.000Z' },
        { locale: 'en-US', timeZone: 'UTC' }
      )
    ).toBe('1/2/26 / 1/2/26, 3:04 PM');
  });

  it('preserves date-only values while formatting them', () => {
    const compiled = compileTemplate('{publishedAt | toLocalDate}', targetSchema);

    expect(compiled).not.toBeNull();
    expect(
      renderTemplate(
        compiled!,
        { publishedAt: '2026-01-02' },
        {
          locale: 'en-US',
          timeZone: 'America/Los_Angeles',
        }
      )
    ).toBe('1/2/26');
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

  it('compiles and renders scalar fields nested in a relation', () => {
    const compiled = compileTemplate('{registrations.firstName}', targetSchema, (uid) =>
      componentSchemas.get(uid)
    );

    expect(compiled).toMatchObject({
      placeholders: ['registrations.firstName'],
      displayField: 'firstName',
    });
    expect(renderTemplate(compiled!, { registrations: { firstName: 'Ada' } })).toBe('Ada');
    expect(
      renderTemplate(compiled!, { registrations: [{ firstName: 'Ada' }, { firstName: 'Grace' }] })
    ).toBe('Ada,Grace');
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
    expect(
      compileTemplate('{registrations.privateName}', targetSchema, (uid) =>
        componentSchemas.get(uid)
      )
    ).toBeNull();
    expect(
      compileTemplate('{registrations.unknown}', targetSchema, (uid) => componentSchemas.get(uid))
    ).toBeNull();
    expect(compileTemplate('Only static text', targetSchema)).toBeNull();
    expect(compileTemplate('{first-name}', targetSchema)).toBeNull();
    expect(compileTemplate('{firstName | missingTransform}', targetSchema)).toBeNull();
    expect(compileTemplate('{firstName | toLocalDate}', targetSchema)).toBeNull();
    expect(compileTemplate('{createdAt | toLocalDateTime}', targetSchema)).not.toBeNull();
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
