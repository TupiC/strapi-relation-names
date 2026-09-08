import {
  Accordion,
  Box,
  Button,
  Field,
  Flex,
  Main,
  TextInput,
  Typography,
} from '@strapi/design-system';
import styled from 'styled-components';
import { Fragment, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useIntl } from 'react-intl';

import { useFetchClient } from '@strapi/strapi/admin';

import type {
  InitResponse,
  RelationNamesSettings,
  Schema,
  SchemaAttribute,
  SettingsResponse,
} from '../types';
import { getTranslation } from '../utils/getTranslation';
import { getAvailableFields, validateTemplate } from '../utils/template';

const PLUGIN_SETTINGS_PATH = '/strapi-relation-names/settings';

const AvailableField = styled(Typography)`
  display: inline-block;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;

  &:hover,
  &[aria-pressed='true'] {
    border-color: currentColor;
  }
`;

type RelationRow = {
  source: Schema;
  fieldName: string;
  target?: Schema;
};

const getRelationTarget = (attribute: SchemaAttribute) => attribute.targetModel ?? attribute.target;

const SettingsPage = () => {
  const { formatMessage } = useIntl();
  const { get, put } = useFetchClient();
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [settings, setSettings] = useState<RelationNamesSettings>({
    collections: [],
    relations: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [initResponse, settingsResponse] = await Promise.all([
        get<InitResponse>('/content-manager/init'),
        get<SettingsResponse>(PLUGIN_SETTINGS_PATH),
      ]);
      const nextSettings = settingsResponse.data.data;
      const contentTypes = initResponse.data.data.contentTypes.filter(
        (schema) =>
          nextSettings.collections.length === 0 || nextSettings.collections.includes(schema.uid)
      );
      setSchemas([...contentTypes, ...initResponse.data.data.components]);
      setSettings(nextSettings);
    } catch {
      setError(formatMessage({ id: getTranslation('settings.loadError') }));
    } finally {
      setIsLoading(false);
    }
  }, [formatMessage, get]);

  useEffect(() => {
    void load();
  }, [load]);

  const schemaMap = useMemo(
    () => new Map(schemas.map((schema) => [schema.uid, schema])),
    [schemas]
  );

  const rows = useMemo<RelationRow[]>(
    () =>
      schemas
        .filter((schema) => schema.isDisplayed !== false)
        .flatMap((source) =>
          Object.entries(source.attributes ?? {})
            .filter(
              ([, attribute]) =>
                attribute.type === 'relation' &&
                !attribute.relationType?.toLowerCase().includes('morph')
            )
            .map(([fieldName, attribute]) => ({
              source,
              fieldName,
              target: getRelationTarget(attribute)
                ? schemaMap.get(getRelationTarget(attribute)!)
                : undefined,
            }))
        )
        .filter((row) => row.target),
    [schemaMap, schemas]
  );

  const updateTemplate = (sourceUid: string, fieldName: string, template: string) => {
    setSettings((current) => {
      const sourceRelations = { ...(current.relations[sourceUid] ?? {}) };
      if (template.length === 0) {
        delete sourceRelations[fieldName];
      } else {
        sourceRelations[fieldName] = template;
      }

      const relations = { ...current.relations };
      if (Object.keys(sourceRelations).length === 0) {
        delete relations[sourceUid];
      } else {
        relations[sourceUid] = sourceRelations;
      }
      return { ...current, relations };
    });
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await put<SettingsResponse, RelationNamesSettings>(PLUGIN_SETTINGS_PATH, settings);
      window.location.reload();
    } catch {
      setError(formatMessage({ id: getTranslation('settings.saveError') }));
      setIsSaving(false);
    }
  };

  return (
    <Main aria-labelledby="relation-names-title">
      <Box padding={8}>
        <Typography variant="alpha" tag="h1" id="relation-names-title">
          {formatMessage({ id: getTranslation('settings.title') })}
        </Typography>
        <Flex
          gap={2}
          width="100%"
          paddingBottom={6}
          style={{
            'justify-content': 'space-between',
            position: 'sticky',
            top: '.5rem',
            zIndex: 1,
          }}
        >
          <Typography textColor="neutral600">
            {formatMessage({ id: getTranslation('settings.description') })}
          </Typography>
          {!isLoading && rows.length > 0 ? (
            <Button loading={isSaving} disabled={isSaving} onClick={() => void save()}>
              {formatMessage({ id: getTranslation('settings.save') })}
            </Button>
          ) : null}
        </Flex>

        {isLoading ? (
          <Typography>{formatMessage({ id: getTranslation('settings.loading') })}</Typography>
        ) : null}
        {error ? (
          <Typography textColor="danger600" tag="p">
            {error}
          </Typography>
        ) : null}

        {!isLoading && rows.length === 0 ? (
          <Typography>{formatMessage({ id: getTranslation('settings.noRelations') })}</Typography>
        ) : null}

        {!isLoading
          ? rows.map(({ source, fieldName, target }) => {
              const targetAttributes = target?.attributes ?? {};
              const template = settings.relations[source.uid]?.[fieldName] ?? '';
              const validationError = template
                ? validateTemplate(template, targetAttributes, schemaMap)
                : null;
              const availableFields = getAvailableFields(target, schemaMap);

              const toggleField = (field: string) => {
                const placeholder = `{${field}}`;
                const nextTemplate = template.includes(placeholder)
                  ? template
                      .replaceAll(placeholder, '')
                      .replace(/\s{2,}/g, ' ')
                      .trim()
                  : `${template.trim()}${template.trim() ? ' ' : ''}${placeholder}`;

                updateTemplate(source.uid, fieldName, nextTemplate);
              };

              return (
                <Box
                  key={`${source.uid}.${fieldName}`}
                  padding={4}
                  marginBottom={3}
                  background="neutral0"
                  shadow="tableShadow"
                  hasRadius
                >
                  <Typography variant="beta" tag="h2">
                    {source.info?.displayName ?? source.uid} · {fieldName}
                  </Typography>
                  <Box paddingTop={1} paddingBottom={3}>
                    <Typography textColor="neutral600">
                      {formatMessage(
                        { id: getTranslation('settings.target') },
                        { target: target?.info?.displayName ?? target?.uid }
                      )}
                    </Typography>
                  </Box>
                  <Field.Root
                    error={validationError ?? undefined}
                    name={`${source.uid}.${fieldName}`}
                  >
                    <Field.Label>
                      {formatMessage({
                        id: getTranslation('settings.template'),
                      })}
                    </Field.Label>
                    <TextInput
                      value={template}
                      placeholder="{firstName} {lastName}"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateTemplate(source.uid, fieldName, event.target.value)
                      }
                    />
                    <Field.Hint />
                    <Field.Error />
                  </Field.Root>
                  <Box paddingTop={2}>
                    <Accordion.Root collapsible>
                      <Accordion.Item value="available-fields">
                        <Accordion.Header>
                          <Accordion.Trigger>
                            {formatMessage({
                              id: getTranslation('settings.availableFields'),
                            })}
                          </Accordion.Trigger>
                        </Accordion.Header>
                        <Accordion.Content>
                          <Typography variant="pi" textColor="neutral600">
                            {availableFields.map((field, index) => {
                              const placeholder = `{${field}}`;

                              return (
                                <Fragment key={field}>
                                  {index > 0 ? ', ' : null}
                                  <AvailableField
                                    as="button"
                                    type="button"
                                    variant="pi"
                                    textColor="neutral600"
                                    aria-pressed={template.includes(placeholder)}
                                    onClick={() => toggleField(field)}
                                  >
                                    {field}
                                  </AvailableField>
                                </Fragment>
                              );
                            })}
                          </Typography>
                        </Accordion.Content>
                      </Accordion.Item>
                    </Accordion.Root>
                  </Box>
                </Box>
              );
            })
          : null}
      </Box>
    </Main>
  );
};

export { SettingsPage };
