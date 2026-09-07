# strapi-relation-names

Display Strapi relations with clear, customizable labels built from your content fields.

## Strapi 5

`strapi-relation-names` is an Admin-only Strapi 5 plugin. It does not add Content API routes and does not change stored entries or public API responses.

## Configuration

Open **Settings → Global → Relation Names**. Each relation field is listed with the scalar fields available on its related content type or component.

Templates use direct field placeholders:

```text
{firstName} {lastName}
```

Multiple and repeated placeholders, static text, numbers, booleans, dates, and other scalar fields are supported. Nested paths, expressions, relations, components, media, JSON, rich text, and dynamic zones are not supported.

The first placeholder is used internally by the Admin relation renderer. Strapi's existing relation search and sorting continue to use the configured default main field.

Missing values are replaced with an empty string. If the complete rendered label is blank, or if a template is missing or invalid, Strapi's default relation label is used.

After saving settings, the Admin reloads so all open Content Manager views use the new labels.
