import { isRecord, renderTemplate } from '../../../../shared/template';
import type { RelationRuntime } from './relation-labels';

export const getIdentity = (value: Record<string, unknown>, modelType?: string): unknown =>
  modelType === 'component' ? value.id : (value.documentId ?? value.id);

export const matchesRelation = (
  source: Record<string, unknown>,
  candidate: Record<string, unknown>,
  targetModelType?: string
): boolean => {
  if (source.id !== undefined && candidate.id === source.id) {
    return true;
  }

  if (source.documentId !== undefined && candidate.documentId === source.documentId) {
    if (source.locale !== undefined && candidate.locale !== source.locale) {
      return false;
    }
    if (source.publishedAt !== undefined && candidate.publishedAt !== source.publishedAt) {
      return false;
    }
    return true;
  }

  return getIdentity(source, targetModelType) === getIdentity(candidate, targetModelType);
};

export const applyLabel = (
  value: Record<string, unknown>,
  hydrated: Record<string, unknown>,
  runtime: RelationRuntime
): Record<string, unknown> => {
  const label = renderTemplate(runtime, hydrated);

  if (label) {
    const isNestedTemplate = runtime.placeholders.some((placeholder) => placeholder.includes('.'));
    const isIdentityField = runtime.displayField === 'id' || runtime.displayField === 'documentId';

    if (isNestedTemplate && isIdentityField) {
      return { ...value, label };
    }

    return { ...value, [runtime.displayField]: label };
  }

  if (runtime.displayField === runtime.originalMainField) {
    return value;
  }

  const fallbackField =
    runtime.originalMainField === 'id' ? 'documentId' : runtime.originalMainField;
  const fallback = Object.prototype.hasOwnProperty.call(hydrated, fallbackField)
    ? hydrated[fallbackField]
    : undefined;

  return { ...value, [runtime.displayField]: fallback };
};

export const relationValues = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  return isRecord(value) ? [value] : [];
};

export const replaceRelationValue = (
  original: unknown,
  values: Record<string, unknown>[],
  hydrated: Map<Record<string, unknown>, Record<string, unknown>>,
  runtime: RelationRuntime
): unknown => {
  const decorated = values.map((value) => applyLabel(value, hydrated.get(value) ?? value, runtime));
  return Array.isArray(original) ? decorated : (decorated[0] ?? original);
};
