import { Box, Button, Field, Flex, Main, TextInput, Typography } from '@strapi/design-system';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
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
import { validateTemplate } from '../utils/template';

const PLUGIN_SETTINGS_PATH = '/strapi-relation-names/settings';

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
  const [settings, setSettings] = useState<RelationNamesSettings>({ relations: {} });
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
      setSchemas([...initResponse.data.data.contentTypes, ...initResponse.data.data.components]);
      setSettings(settingsResponse.data.data);
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
      return { relations };
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
        <Box paddingTop={2} paddingBottom={6}>
          <Typography textColor="neutral600">
            {formatMessage({ id: getTranslation('settings.description') })}
          </Typography>
        </Box>

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
                ? validateTemplate(template, targetAttributes)
                : null;

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
                      {formatMessage({ id: getTranslation('settings.template') })}
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
                    <Typography variant="pi" textColor="neutral600">
                      {formatMessage({ id: getTranslation('settings.availableFields') })}:{' '}
                      {Object.keys(targetAttributes).join(', ')}
                    </Typography>
                  </Box>
                </Box>
              );
            })
          : null}

        {!isLoading && rows.length > 0 ? (
          <Flex justifyContent="flex-end" paddingTop={4}>
            <Button loading={isSaving} disabled={isSaving} onClick={() => void save()}>
              {formatMessage({ id: getTranslation('settings.save') })}
            </Button>
          </Flex>
        ) : null}
      </Box>
    </Main>
  );
};

export { SettingsPage };
