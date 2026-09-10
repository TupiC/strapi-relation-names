import { isRecord } from '../../../shared/records';

type RelationNamesLayout = {
  settings?: {
    relationNames?: Record<string, { mainField?: string }>;
  };
  layout?: unknown;
  components?: Record<string, RelationNamesLayout>;
};

const getMainFieldName = (layout: RelationNamesLayout, fieldName: string) =>
  layout.settings?.relationNames?.[fieldName]?.mainField;

const mutateFields = (fields: unknown, layout: RelationNamesLayout): unknown => {
  if (!Array.isArray(fields)) {
    return fields;
  }

  return fields.map((field) => {
    if (!isRecord(field)) {
      return field;
    }

    const mainField = getMainFieldName(layout, typeof field.name === 'string' ? field.name : '');
    if (!mainField || !isRecord(field.mainField)) {
      return field;
    }

    return {
      ...field,
      mainField: { ...field.mainField, name: mainField },
    };
  });
};

const mutateEditLayoutObject = (layout: RelationNamesLayout): RelationNamesLayout => {
  const components = Object.fromEntries(
    Object.entries(layout.components ?? {}).map(([uid, componentLayout]) => [
      uid,
      mutateEditLayoutObject(componentLayout),
    ])
  );

  return {
    ...layout,
    layout: Array.isArray(layout.layout)
      ? layout.layout.map((entry) => {
          if (!Array.isArray(entry)) {
            return entry;
          }

          return Array.isArray(entry[0])
            ? entry.map((row) => mutateFields(row, layout))
            : mutateFields(entry, layout);
        })
      : layout.layout,
    components,
  };
};

const mutateEditLayout = (payload: unknown): unknown => {
  if (!isRecord(payload) || !isRecord(payload.layout)) {
    return payload;
  }

  return { ...payload, layout: mutateEditLayoutObject(payload.layout as RelationNamesLayout) };
};

const mutateListHeaders = (payload: unknown): unknown => {
  if (!isRecord(payload) || !Array.isArray(payload.displayedHeaders) || !isRecord(payload.layout)) {
    return payload;
  }

  const layout = payload.layout as RelationNamesLayout;
  return {
    ...payload,
    displayedHeaders: payload.displayedHeaders.map((header: unknown) => {
      if (!isRecord(header) || !isRecord(header.mainField)) {
        return header;
      }

      const mainField = getMainFieldName(
        layout,
        typeof header.name === 'string' ? header.name : ''
      );
      return mainField
        ? { ...header, mainField: { ...header.mainField, name: mainField } }
        : header;
    }),
  };
};

export { mutateEditLayout, mutateListHeaders };
