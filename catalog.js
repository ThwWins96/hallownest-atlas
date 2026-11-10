// Catalog metadata comes from explicit stats first, then the headers of older entries.
export const facetFields = {
  type: ['Тип', 'Type', 'weapon type', 'тип оружия'],
  range: ['Дальность', 'Range', 'reach', 'дистанция'],
  duration: ['Длительность', 'Duration'],
  difficulty: ['Сложность', 'Difficulty'],
  damage: ['Урон', 'Damage'],
  grip: ['Хватка', 'Grip', 'hands'],
  price: ['Цена', 'Price', 'cost in geo'],
  cost: ['Стоимость', 'Cost', 'activation'],
  stamina: ['Выносливость', 'Stamina'],
  souls: ['Души', 'Soul', 'soul cost', 'душа'],
  heavy: ['Вес', 'Weight', 'heavy'],
  quality: ['Качество', 'Quality', 'rarity', 'редкость'],
  geo: ['Гео', 'Geo'],
  hunger: ['Голод', 'Hunger'],
  charm: ['Привлекательность', 'Cute', 'charm'],
  dread: ['Жуть', 'Spook', 'dread'],
  prerequisite: ['Требование', 'Prerequisite', 'requirements', 'требования']
};

export function keyText(text) {
  return String(text ?? '').normalize('NFC').toLowerCase().replace(/ё/g, 'е').replace(/[_\s]+/g, ' ').trim();
}

const aliases = new Map(Object.entries(facetFields).flatMap(([key, values]) =>
  [key, ...values].map(value => [keyText(value), key])));
export const statKey = key => aliases.get(keyText(key)) ?? key;

const values = {
  type: [['Гвоздь', 'Nail'], ['Игла', 'Needle'], ['Клык', 'Fang'], ['Крюк', 'Hook'],
    ['Праща', 'Sling'], ['Щит', 'Shield']],
  range: [['Касание', 'Touch'], ['Близко', 'Close'], ['Далеко', 'Far'], ['На себя', 'Self'],
    ['Ближний', 'Melee'], ['Дальний', 'Ranged'], ['Досяг.', 'Reach']],
  duration: [['Краткая', 'Brief', 'краткость'], ['Особая', 'Special'], ['Сцена', 'Scene'],
    ['Концентрация', 'Concentration'], ['Жизнь', 'Lifetime'], ['Вечность', 'Eternal'], ['1 Отдых', '1 Rest']],
  cost: [['Концентрация', 'Focus Action']],
  heavy: [['Лёгкое', 'Light']],
  quality: [['Обычный', 'Common'], ['Необычный', 'Uncommon'], ['Редкий', 'Rare'], ['Уникальный', 'Unique']]
};

const normalizeValue = value => keyText(value).replace(/\s*\(\d+\)$/, '');
const valueAlias = (key, value) => Object.hasOwn(values,key) ? values[key].find(terms => terms.some(term => normalizeValue(term) === normalizeValue(value))) : undefined;
export const displayValue = (key, value, locale) => valueAlias(key, value)?.[locale === 'en' ? 1 : 0] ?? value;

const tracked = {
  equipment: ['type', 'range', 'damage', 'grip', 'price', 'heavy', 'quality', 'geo'],
  spell: ['range', 'duration', 'difficulty', 'souls', 'cost'],
  art: ['type', 'cost', 'stamina', 'souls', 'prerequisite'],
  trait: ['hunger', 'dread', 'charm', 'prerequisite']
};
const escapeRE = value => value.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&');

function spellHeader(key, text) {
  const label = facetFields[key].slice(0, 2).map(escapeRE).join('|');
  const options = key === 'difficulty' ? '\\d+' : values[key].flat().sort((a,b) => b.length - a.length).map(escapeRE).join('|') + '|1\\s+отдых\\w*';
  const pattern = new RegExp('(?:^|\\s)(?:' + label + ')(?:\\s+[АБAB])?\\s*:\\s*(' + options + ')(?![\\p{L}\\p{N}])', 'giu');
  return [...text.slice(0, 165).matchAll(pattern)].map(match => match[1]);
}

const traitNames = {
  hunger: 'Голод(?:а)?|Hunger', dread: 'Жуть|Жути|Spook', charm: 'Привлекательност[ьи]|Cute'
};

export function traitHeader(text) {
  const modifiers = {};
  const header = String(text ?? '').match(/^\s*(?:[+\-−]\s*\d+(?:[.,]\d+)?\s*[\p{L}]+(?:\s+(?:or|или)\s+[\p{L}]+)?(?:\s*\([^)\n]*\))?[, \t]*)+/iu)?.[0] ?? '';
  for (const [key, names] of Object.entries(traitNames)) {
    const pattern = new RegExp('([+\\-−]\\s*\\d+(?:[.,]\\d+)?)\\s*(?:' + names + ')(?!\\p{L})', 'giu');
    modifiers[key] = [...header.matchAll(pattern)].map(match => Number(match[1].replace('−','-').replace(',','.').replace(/\s/g,'')));
  }
  return {modifiers, choice: /(?:Spook|Жуть)\s+(?:or|или)\s+(?:Cute|Привлекательность)|(?:Cute|Привлекательность)\s+(?:or|или)\s+(?:Spook|Жуть)/iu.test(header)};
}

function textFacets(item) {
  const text = String(item.text ?? '');
  if (item.kind === 'spell') return Object.fromEntries(['range', 'duration', 'difficulty'].map(key => [key, spellHeader(key, text)]));
  if (item.kind === 'trait') return traitHeader(text).modifiers;
  if (item.kind !== 'art') return {};
  const prefix = text.slice(0, 120);
  const cost = prefix.match(/^\s*(?:Концентрация|Действие Фокусировки|Focus Action)/iu)?.[0]?.trim();
  const requirement = prefix.match(/^\s*(?:\d+|X|Х)\s*(?:Выносливост[ьи]|Stamina|Душ[аиу]?|Soul)\s*[-–—]\s*(Парное оружие|Pairable Weapons|Оружие ближнего боя|Melee Weapon|Дальнобойное оружие|Ranged Weapon)/iu)?.[1];
  return {
    stamina: [...prefix.matchAll(/(?:^|[+/])\s*(\d+|X|Х)\s*(?:Выносливост[ьи]|Stamina)/giu)].map(match => match[1]),
    souls: [...prefix.matchAll(/(?:^|[+/])\s*(\d+|X|Х)\s*(?:Душ[аиу]?|Soul)/giu)].map(match => match[1]),
    cost: cost ? [cost] : [],
    prerequisite: requirement ? [requirement] : []
  };
}

export function getFacets(item, locale) {
  const found = new Map(Object.entries(textFacets(item)));
  const keys = tracked[item.kind];
  if (!keys) return {};
  const available = new Set(keys);
  for (const [label, value] of Object.entries(item.stats ?? {})) {
    const key = statKey(label);
    if (['traits','kind','topic','region','group','__proto__','constructor','prototype'].includes(key)
      || value == null || value === '' || String(value).length > 96) continue;
    const parts = ['type','range','duration','prerequisite'].includes(key) ? String(value).split(/\s*[/,;•]\s*/) : [String(value)];
    found.set(key,parts.filter(Boolean));
    available.add(key);
  }
  return Object.fromEntries([...available].filter(key => found.get(key)?.length).map(key => {
    const options = [...new Set(found.get(key).map(value => displayValue(key, String(value).trim(), locale)).filter(Boolean))];
    return [key, options];
  }));
}

export const ruleTopics = {
  'rules-rolls': 'general', 'rules-damage': 'general', 'project-note': 'general',
  'gear-high': 'equipment', 'gear-medium': 'equipment', 'gear-low': 'equipment',
  'amulet-prices': 'equipment', 'weapon-basics': 'equipment',
  'book-trait-guide': 'traits', 'book-path-guide': 'paths', 'book-proficiency-guide': 'proficiencies',
  'book-art-guide': 'arts', 'book-magic-guide': 'magic', 'book-magic-modifiers': 'magic'
};

export function topicOf(item) {
  if (['general','equipment','traits','paths','proficiencies','arts','magic'].includes(item.ruleTopic)) return item.ruleTopic;
  if (Object.hasOwn(ruleTopics,item.id)) return ruleTopics[item.id];
  const group = keyText(item.group || item.region);
  if (item.kind === 'spell' && /^(правила магии|casting rules|magic rules)$/.test(group)) return 'magic';
  if (item.kind === 'art' && /^(правила искусств|art rules|weapon art rules)$/.test(group)) return 'arts';
  return item.kind === 'rule' ? 'general' : '';
}

export const templates = {
  small: {might:2, accuracy:3, shell:3, grace:4, hearts:6, stamina:3, souls:3, charm:1.5, dread:1, speed:7, hunger:-1},
  medium: {might:3, accuracy:3, shell:3, grace:3, hearts:7, stamina:3, souls:3, charm:1, dread:1, speed:6, hunger:4},
  large: {might:4, accuracy:3, shell:4, grace:2, hearts:8, stamina:3, souls:3, charm:1, dread:1.5, speed:5, hunger:9}
};

// Fixed passive changes from the rulebook. Other effects can be entered as adjustments.
const passive = {
  '031': {grace:-1}, '035': {accuracy:-1}, '036': {shell:-1}, '037': {grace:.5},
  '038': {hearts:1}, '039': {hearts:-1}, '040': {accuracy:.5}, '042': {might:.5},
  '044': {speed:-1}, '047': {shell:.5}, '048': {speed:1}, '049': {might:-1}, '102': {speed:-1}
};

export function traitEffect(item, size, settings = {}) {
  const {modifiers, choice} = traitHeader(item.text);
  for (const [label, value] of Object.entries(item.stats ?? {})) {
    const key = statKey(label);
    const amount = String(value).trim().replace(',','.');
    if (Object.hasOwn(modifiers,key) && amount && Number.isFinite(Number(amount))) modifiers[key] = [Number(amount)];
  }
  const number = /^book-trait-(\d{3})$/.exec(item.id)?.[1];
  const costs = modifiers.hunger;
  const variableCost = number !== '022' && (new Set(costs).size > 1
    || /(?:[+\-−]\s*[xх]\s*(?:Голод|Hunger)|(?:Голод|Hunger)\s*:\s*[xх])/iu.test(item.text ?? ''));
  const defaultCost = number === '022' && costs.length >= 3 ? costs[['small','medium','large'].indexOf(size)] : costs[0] ?? 0;
  const hunger = settings.cost ?? defaultCost;
  const base = {...passive[number]};
  for (const key of ['dread','charm']) base[key] = modifiers[key][0] ?? 0;
  if (choice) {
    const delta = base.dread || base.charm;
    base.dread = settings.social === 'charm' ? 0 : delta;
    base.charm = settings.social === 'charm' ? delta : 0;
  }
  const exchange = {
    '028':['accuracy','might','shell'], '030':['shell','grace','speed'],
    '032':['might','grace'], '043':['accuracy'], '045':['grace','might']
  }[number];
  return {hunger, base, exchange, choice, variableCost};
}

export function buildTotals(items, size, adjustments = {}) {
  const stats = {...templates[size]};
  const effects = items.map(({item, settings}) => ({...traitEffect(item, size, settings), settings}));
  let points = 0;
  for (const {exchange, settings} of effects) {
    if (!exchange) continue;
    const [raised, first, second] = exchange;
    const increase = Math.max(0, 4 - stats[raised]);
    stats[raised] += increase;
    const lowered = settings.trade === second && second ? second : first;
    if (lowered) stats[lowered] -= increase;
  }
  for (const {hunger, base} of effects) {
    points += hunger;
    for (const [key, value] of Object.entries(base)) stats[key] += value;
  }
  points += adjustments.hunger || 0;
  stats.hunger += points;
  for (const key of Object.keys(stats)) {
    if (key !== 'hunger') stats[key] += adjustments[key] || 0;
  }
  return {stats, points};
}

export function makeReferenceIndex(items) {
  const entries = new Map();
  for (const item of items) {
    if (!item.name) continue;
    const key = keyText(item.name);
    const matches = entries.get(key) ?? [];
    if (!matches.some(match => match.id === item.id)) matches.push(item);
    entries.set(key, matches);
  }
  const names = [...entries].filter(([key, matches]) => key.length >= 4 && matches.length === 1)
    .map(([, matches]) => matches[0].name).sort((a,b) => b.length - a.length).map(escapeRE);
  return {entries, pattern: names.length ? new RegExp('(?<![\\p{L}\\p{N}])(?:' + names.join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null};
}

