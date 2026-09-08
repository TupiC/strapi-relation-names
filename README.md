# 🔗 strapi-relation-names

**Clear and customizable relation labels for Strapi v5**

Display Strapi relations using readable labels built from your content fields instead of relying on the default relation name.

[![npm version](https://img.shields.io/npm/v/strapi-relation-names)](https://www.npmjs.com/package/strapi-relation-names)
![Strapi Version](https://img.shields.io/badge/strapi-v5-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![npm](https://img.shields.io/npm/dt/strapi-relation-names)

---

## ✨ Features

- 🏷️ **Custom relation labels**
- 🧩 Combine multiple fields in a single label
- ✏️ Add static text around field values
- 🔁 Supports repeated placeholders
- 📦 Supports scalar fields such as strings, numbers, booleans, and dates
- 🛡️ Falls back to Strapi's default relation label when necessary
- 🔎 Keeps Strapi's existing relation search and sorting behavior
- 🖥️ Admin-only — no changes to your Content API or stored data

---

## 🚀 Installation

Install via npm:

```bash
npm install strapi-relation-names
```

or yarn:

```bash
yarn add strapi-relation-names
```

or pnpm:

```bash
pnpm add strapi-relation-names
```

Enable the plugin:

```javascript
// config/plugins.{js,ts}
'strapi-relation-names': {
  enabled: true,
},
```

---

## Quickstart

After installing and enabling the plugin, open the Strapi Admin settings panel:

**Settings → Global → Relation Names**

Each relation field is displayed together with the scalar fields available on its related content type or component.

Create a label using placeholders:

```text
{firstName} {lastName}
```

For example, given:

```text
firstName = John
lastName = Doe
```

the relation will be displayed as:

```text
John Doe
```

You can also mix placeholders with static text:

```text
{firstName} {lastName} ({customerNumber})
```

After saving the settings, the Strapi Admin reloads automatically so open Content Manager views use the updated labels.

---

## ⚙️ Configuration

Possible configuration keys are listed below; omitted keys keep the plugin defaults.

| Key           | Description                                                                                     | Possible values |
| ------------- | ----------------------------------------------------------------------------------------------- | --------------- |
| `collections` | Limit relation names to the listed collection and single type UIDs. Leave empty to include all. | `string[]`      |

Example:

```javascript
// config/plugins.{js,ts}
'strapi-relation-names': {
  enabled: true,
  config: {
    collections: ['api::article.article', 'api::author.author'],
  },
},
```

---

## ⚙️ Templates

Templates use direct field placeholders:

```text
{fieldName}
```

Multiple placeholders can be combined:

```text
{firstName} {lastName}
```

Placeholders can also be repeated:

```text
{name} - {name}
```

Static text can be included anywhere:

```text
Customer: {firstName} {lastName}
```

---

## 🗂️ How It Works

The plugin changes how relations are displayed inside the Strapi Admin panel.

The first placeholder in a template is used internally by Strapi's Admin relation renderer.

Strapi's existing relation search and sorting continue to use the configured default main field.

Missing field values are replaced with an empty string.

For example:

```text
{firstName} {lastName}
```

with a missing `lastName` becomes:

```text
John
```

If the complete rendered label is blank, Strapi automatically falls back to its default relation label.

The default label is also used when:

- No template is configured
- The configured template is invalid
- The rendered template contains no usable value

---

## 🔮 Planned Features

- [ ] Live label previews while editing templates
- [ ] Define default relation templates in plugin configuration
- [ ] Support nested field paths in templates
- [ ] Import and export relation-label settings
- [ ] Conditional labels and configurable fallback rules

If you have any feature requests or suggestions, please open a dedicated issue.

## 🛑 Problems

If you encounter any issues, please feel free to open an issue on the [GitHub repo](https://github.com/TupiC/strapi-relation-names/issues/new).

## 🛠️ Contributing

Contributions are welcome! If you have suggestions or improvements, please open an issue or submit a pull request to the `dev` branch.
