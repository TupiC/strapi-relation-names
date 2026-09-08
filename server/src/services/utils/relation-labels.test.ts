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
  },
};

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

  it('rejects malformed, unknown, private, and unsupported placeholders', () => {
    expect(parseTemplate('{firstName')).toBeNull();
    expect(parseTemplate('firstName}')).toBeNull();
    expect(compileTemplate('{unknown}', targetSchema)).toBeNull();
    expect(compileTemplate('{secret}', targetSchema)).toBeNull();
    expect(compileTemplate('{profile}', targetSchema)).toBeNull();
    expect(compileTemplate('Only static text', targetSchema)).toBeNull();
    expect(compileTemplate('{first-name}', targetSchema)).toBeNull();
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
