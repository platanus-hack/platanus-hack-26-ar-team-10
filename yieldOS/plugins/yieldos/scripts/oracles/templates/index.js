'use strict';

const { WEB_TEMPLATES } = require('./web');
const { API_AGENTIC_TEMPLATES } = require('./api-agentic');
const { AUTH_DATA_TEMPLATES } = require('./auth-data');

const TEMPLATE_CATALOG = Object.freeze([
  ...WEB_TEMPLATES,
  ...API_AGENTIC_TEMPLATES,
  ...AUTH_DATA_TEMPLATES,
].map((item) => Object.freeze(item)));

function cloneTemplate(item) {
  return JSON.parse(JSON.stringify(item));
}

function listTemplates() {
  return TEMPLATE_CATALOG.map(cloneTemplate);
}

function getTemplate(id) {
  const found = TEMPLATE_CATALOG.find((item) => item.id === id);
  return found ? cloneTemplate(found) : null;
}

function templatesForStandard(family) {
  return listTemplates().filter((item) => item.standards.some((standard) => standard.family === family));
}

module.exports = {
  TEMPLATE_CATALOG,
  listTemplates,
  getTemplate,
  templatesForStandard,
};
