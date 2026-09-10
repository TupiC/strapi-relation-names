export type {
  CompiledTemplate,
  SchemaResolver,
  TemplateAttribute as SchemaAttribute,
  TemplateSchema,
} from '../../../../shared/template';

export {
  compileTemplate,
  getPathValue,
  isRecord,
  parseTemplate,
  parseTemplateAst,
  renderTemplate,
} from '../../../../shared/template';

export type SchemaLike = import('../../../../shared/template').TemplateSchema & {
  uid: string;
  modelType?: string;
};

export type RelationRuntime = import('../../../../shared/template').CompiledTemplate & {
  sourceUid: string;
  targetUid: string;
  originalMainField: string;
};
