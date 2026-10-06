// Validates public/icons.json against public/icons/. Run with `npm run check`.
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';

const ICONS_DIR = new URL('../public/icons/', import.meta.url);
const MANIFEST = new URL('../public/icons.json', import.meta.url);
const TAGS = new URL('../public/icon-tags.json', import.meta.url);
const NAME_PATTERN = /^24_icon-fill\/[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE_PATTERN = /^[a-z0-9]+(-+[a-z0-9]+)*\.svg$/;

const errors = [];
const icons = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const tags = JSON.parse(readFileSync(TAGS, 'utf8'));
const files = readdirSync(ICONS_DIR).filter(file => file.endsWith('.svg'));
const fileSet = new Set(files);

function findDuplicates(values) {
  const seen = new Set();
  return [...new Set(values.filter(value => seen.has(value) || !seen.add(value)))];
}

if (!Array.isArray(icons)) errors.push('icons.json должен быть массивом');

icons.forEach((icon, index) => {
  const where = `icons.json[${index}]${icon?.nodeId ? ` (${icon.nodeId})` : ''}`;
  if (!icon?.nodeId) errors.push(`${where}: нет nodeId`);
  if (!NAME_PATTERN.test(icon?.name ?? '')) errors.push(`${where}: имя «${icon?.name}» не соответствует 24_icon-fill/kebab-case`);
  if (!FILE_PATTERN.test(icon?.file ?? '')) errors.push(`${where}: файл «${icon?.file}» не в kebab-case`);
  else if (!fileSet.has(icon.file)) errors.push(`${where}: файла public/icons/${icon.file} нет`);
});

const listed = new Set(icons.map(icon => icon.file));
files.filter(file => !listed.has(file)).forEach(file => errors.push(`public/icons/${file} нет в icons.json`));

for (const [field, label] of [['nodeId', 'nodeId'], ['name', 'имя'], ['file', 'файл']]) {
  findDuplicates(icons.map(icon => icon[field])).forEach(value => errors.push(`повторяется ${label}: ${value}`));
}

const byHash = new Map();
for (const file of files) {
  const hash = createHash('sha1').update(readFileSync(new URL(file, ICONS_DIR))).digest('hex');
  byHash.set(hash, [...(byHash.get(hash) || []), file]);
}
[...byHash.values()].filter(group => group.length > 1)
  .forEach(group => errors.push(`одинаковое содержимое у файлов: ${group.join(', ')}`));

const nodeIds = new Set(icons.map(icon => icon.nodeId));
Object.keys(tags).filter(nodeId => !nodeIds.has(nodeId))
  .forEach(nodeId => errors.push(`icon-tags.json: неизвестный nodeId ${nodeId}`));

if (errors.length) {
  console.error(`Манифест иконок: ошибок — ${errors.length}\n${errors.map(error => `  • ${error}`).join('\n')}`);
  process.exit(1);
}
console.log(`Манифест иконок в порядке: ${icons.length} иконок`);
