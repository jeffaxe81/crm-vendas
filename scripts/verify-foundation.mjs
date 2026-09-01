import { readFile } from 'node:fs/promises';

const requiredFiles = [
  'README.md',
  'docs/architecture/foundation.md',
  'docs/testing/README.md',
  'docs/decisions/ADR-0001-foundation.md',
  'CHANGELOG.md',
];

const requiredHeadings = [
  '## Pré-requisitos',
  '## Inicialização',
  '## Validação',
  '## Arquitetura',
  '## Testes',
  '## Retorno',
  '## Changelog',
];

const documents = [];
const errors = [];

for (const path of requiredFiles) {
  try {
    documents.push({
      path,
      content: await readFile(path, 'utf8'),
    });
  } catch {
    errors.push('arquivo ausente: ' + path);
  }
}

for (const heading of requiredHeadings) {
  if (!documents.some(({ content }) => content.includes(heading))) {
    errors.push('título ausente: ' + heading.replace('## ', ''));
  }
}

const changelog = documents.find(({ path }) => path === 'CHANGELOG.md');
if (
  changelog &&
  !changelog.content.includes('## [0.0.0] - 2026-08-30')
) {
  errors.push('CHANGELOG.md não contém a entrada [0.0.0] - 2026-08-30');
}

if (errors.length > 0) {
  console.error('foundation documentation: incomplete');
  for (const error of errors) {
    console.error('- ' + error);
  }
  process.exit(1);
}

console.log('foundation documentation: complete');
