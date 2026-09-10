import type { Core } from '@strapi/strapi';

import { getPathValue } from '../../../../shared/template';

import { getIdentity, matchesRelation } from './relation-values';
import type { RelationRuntime, SchemaLike } from './relation-labels';

export type Populate = Record<string, true | { populate: Populate }>;

export const buildPopulate = (placeholders: string[]): Populate | undefined => {
  const populate: Populate = {};

  for (const placeholder of placeholders) {
    const segments = placeholder.split('.');
    if (segments.length < 2) {
      continue;
    }

    let current = populate;
    for (const [index, segment] of segments.slice(0, -1).entries()) {
      const existing = current[segment];
      if (existing === true) {
        break;
      }

      if (index === segments.length - 2) {
        current[segment] = existing ?? true;
        break;
      }

      if (!existing) {
        current[segment] = { populate: {} };
      }

      const next = current[segment];
      if (next !== true) {
        current = next.populate;
      }
    }
  }

  return Object.keys(populate).length > 0 ? populate : undefined;
};

export const hydrateValues = async (
  strapi: Core.Strapi,
  ctx: any,
  runtime: RelationRuntime,
  values: Record<string, unknown>[]
): Promise<Map<Record<string, unknown>, Record<string, unknown>>> => {
  const targetSchema = strapi.getModel(runtime.targetUid as never) as unknown as SchemaLike;
  const targetModelType = targetSchema.modelType;
  const missingFields = runtime.placeholders.filter((field) =>
    values.some((value) => getPathValue(value, field) === undefined)
  );

  if (missingFields.length === 0) {
    return new Map(values.map((value) => [value, value]));
  }

  const identities = values
    .map((value) => getIdentity(value, targetModelType))
    .filter((identity) => identity !== undefined && identity !== null);

  if (identities.length === 0) {
    return new Map(values.map((value) => [value, value]));
  }

  try {
    const permissionChecker = strapi
      .plugin('content-manager')
      .service('permission-checker')
      .create({ userAbility: ctx.state.userAbility, model: runtime.targetUid });
    const fields = Array.from(
      new Set([
        ...runtime.placeholders.filter((field) => !field.includes('.')),
        runtime.originalMainField,
        'id',
        'documentId',
        'locale',
        'publishedAt',
      ])
    );
    const populate = buildPopulate(runtime.placeholders);
    const identityField = targetModelType === 'component' ? 'id' : 'documentId';
    const permissionQuery = await permissionChecker.sanitizedQuery.read({
      fields,
      filters: { [identityField]: { $in: identities } },
      ...(populate ? { populate } : {}),
    });
    const query = strapi.get('query-params').transform(runtime.targetUid, permissionQuery);
    const hydrated = (await strapi.db.query(runtime.targetUid).findMany(query)) as Record<
      string,
      unknown
    >[];

    return new Map(
      values.map((value) => [
        value,
        hydrated.find((candidate) => matchesRelation(value, candidate, targetModelType)) ?? value,
      ])
    );
  } catch {
    return new Map(values.map((value) => [value, value]));
  }
};
