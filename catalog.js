// Catalog metadata comes from explicit stats first, then the headers of older entries.
export const facetFields = {
  type: ['Тип', 'Type', 'weapon type', 'тип оружия'],
  range: ['Дальность', 'Range', 'reach', 'дистанция'],
  duration: ['Длительность', 'Duration', 'длитеность'],
  difficulty: ['Сложность', 'Difficulty'],
  damage: ['Урон', 'Damage'],
  grip: ['Хватка', 'Grip', 'hands'],
  price: ['Цена', 'Price', 'cost in geo'],
  cost: ['Стоимость', 'Cost', 'activation'],
  stamina: ['Выносливость', 'Stamina'],
  souls: ['Души', 'Soul', 'soul cost', 'душа'],
  heavy: ['Вес', 'Bulk', 'weight'],
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
  type: [['Гвоздь', 'Nail'], ['Игла', 'Needle'], ['Клык', 'Tusk', 'Fang'], ['Крюк', 'Hook'],
    ['Праща', 'Sling'], ['Щит', 'Shield']],
  range: [['Касание', 'Touch'], ['Близко', 'Close'], ['Далеко', 'Far'], ['На себя', 'Self'],
    ['Ближний', 'Melee'], ['Дальний', 'Range', 'Ranged'], ['Досяг.', 'Reach']],
  duration: [['Краткая', 'Brief', 'краткость'], ['Особая', 'Special'], ['Сцена', 'Scene'],
    ['Концентрация', 'Concentration'], ['Жизнь', 'Lifetime'], ['Вечность', 'Eternal'], ['1 Отдых', '1 Rest'], ['Мгновенная', 'Instantaneous']],
  grip: [['1Р', '1H'], ['2Р', '2H'], ['2Р+', '2H+']],
  cost: [['Концентрация', 'Focus Action']],
  heavy: [['Лёгкое', 'Light']],
  quality: [['Обычный', 'Common'], ['Необычный', 'Uncommon'], ['Редкий', 'Rare'], ['Уникальный', 'Unique']]
};

const normalizeValue = value => keyText(value).replace(/\s*\(\d+\)$/, '');
const valueAlias = (key, value) => Object.hasOwn(values,key) ? values[key].find(terms => terms.some(term => normalizeValue(term) === normalizeValue(value))) : undefined;
export const displayValue = (key, value, locale) => valueAlias(key, value)?.[locale === 'en' ? 1 : 0] ?? value;

const statAnnotations = {
  stamina: [[/Скорость/gi, 'Speed']],
  hunger: [[/Сытость/gi, 'Belly'], [/Мшистокрыл/gi, 'Mossfly'], [/до (?=\d)/gi, 'up to ']],
  shell: [[/Поглощение/gi, 'Absorption'], [/Впитывание невозможно/gi, 'cannot Soak']],
  might: [[/Нагрузка/gi, 'Load']],
  hearts: [[/Сердца Живокрови/gi, 'Lifeblood Hearts']]
};

export function englishStatValue(key, value) {
  const text = String(value ?? '').replace(/Гео/gi, 'Geo');
  if (Object.hasOwn(values,key)) {
    return text.split(/([/,;])/).map((part,index) => {
      if (index % 2) return part;
      const term = part.trim();
      const qualifier = term.match(/\s*\(\d+\)$/)?.[0] ?? '';
      const translation = valueAlias(key,term);
      return translation ? part.replace(term,translation[1] + (qualifier ? ' ' + qualifier.trim() : '')) : part;
    }).join('');
  }
  const replacements = Object.hasOwn(statAnnotations,key) ? statAnnotations[key] : [];
  return replacements.reduce((result,[pattern,english]) => result.replace(pattern,english),text);
}

const tracked = {
  equipment: ['type', 'range', 'damage', 'grip', 'price', 'heavy', 'quality', 'geo'],
  spell: ['range', 'difficulty', 'duration', 'souls', 'cost'],
  art: ['type', 'cost', 'stamina', 'souls', 'prerequisite'],
  trait: ['hunger', 'dread', 'charm', 'prerequisite']
};
const escapeRE = value => value.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&');

export const spellStatOrder = ['range','difficulty','duration'];

const spellTerms = key => values[key].flat().sort((a,b) => b.length - a.length).map(escapeRE).join('|');
const rangeTerm = '(?:' + spellTerms('range') + '|\\d+[ \\t]*(?:клет(?:ка|ки|ок)|squares?))'
  + '(?:[ \\t]*\\((?:Target|Place Copy|Цель|Место копии|\\d+)\\))?';
const spellValues = {
  range: rangeTerm + '(?:[ \\t]*[,/][ \\t]*' + rangeTerm + ')*',
  difficulty: '\\d+',
  duration: spellTerms('duration') + '|\\d+[ \\t]*(?:раунд(?:а|ов)?|минут[аыу]?|отдых(?:а|ов)?|rounds?|minutes?|rests?)'
};
const spellHeaderPatterns = Object.fromEntries(spellStatOrder.map(key => {
  const labels = facetFields[key].slice(0,2).map(escapeRE).join('|');
  const letter = key === 'range' ? '(?:[ \\t]+([АБAB]))?' : '()';
  const separator = key === 'difficulty' ? '(?:[ \\t]*:[ \\t]*|[ \\t]+)' : '[ \\t]*:[ \\t]*';
  return [key,new RegExp('^(?:' + labels + ')' + letter + separator + '(' + spellValues[key]
    + ')(?![\\p{L}\\p{N}])','iu')];
}));
const ritualPrefix = /^(?:Стоимость|Cost)[\s\S]*?(?:Время каста|Casting Time)[ \t]*:[^\n]*\n(?=[ \t]*(?:Длительность|Duration)[ \t]*:)/iu;

export function splitSpellHeader(text) {
  const prefix = text.match(ritualPrefix)?.[0] ?? '';
  let rest = text.slice(prefix.length).trimStart();
  const stats = {};
  while (rest) {
    const key = spellStatOrder.find(field => spellHeaderPatterns[field].test(rest));
    if (!key) break;
    const [match,letter,value] = spellHeaderPatterns[key].exec(rest);
    const part = letter ? letter.toUpperCase() + ': ' + value : value;
    stats[key] = stats[key] ? stats[key] + ' / ' + part : part;
    rest = rest.slice(match.length).replace(/^[\s.;•]+/u,'');
  }
  return Object.keys(stats).length
    ? {stats,text:[prefix.trimEnd(),rest].filter(Boolean).join('\n\n')}
    : {stats,text};
}

export function normalizeSpellFields(record) {
  const fields = {...record};
  const stats = Object.fromEntries(Object.entries(fields.stats ?? {}).map(([key,value]) => [statKey(key),value]));
  for (const field of ['text','description','traits']) {
    const value = field === 'traits' ? stats.traits : fields[field];
    if (typeof value !== 'string' || !value) continue;
    const parsed = splitSpellHeader(value);
    for (const key of spellStatOrder) {
      if (!String(stats[key] ?? '').trim() && parsed.stats[key]) stats[key] = parsed.stats[key];
    }
    if (field === 'traits') {
      if (parsed.text) stats.traits = parsed.text;
      else delete stats.traits;
    } else {
      fields[field] = parsed.text;
    }
  }
  return {...fields,stats};
}

export function spellStatValue(key, value, locale) {
  return String(value ?? '').split(/\s*([/,;])\s*/).map((part,index) => {
    if (index % 2) return part === ',' ? ', ' : ' ' + part + ' ';
    let stat = part.trim();
    const letter = stat.match(/^([АБAB]):\s*/iu);
    stat = stat.slice(letter?.[0].length ?? 0);
    const qualifier = stat.match(/\s*\((Target|Place Copy|Цель|Место копии)\)$/iu);
    stat = stat.slice(0, stat.length - (qualifier?.[0].length ?? 0));
    const quantity = stat.match(/^(\d+)\s+(ктетки|клет(?:ка|ки|ок)|squares?|минут[аыу]?|minutes?|раунд(?:а|ов)?|rounds?)$/iu);
    let result = displayValue(key,stat,locale);
    if (quantity) {
      const count = Number(quantity[1]);
      const forms = /^(?:к[лт]|square)/iu.test(quantity[2]) ? ['клетка','клетки','клеток','square']
        : /^(?:минут|minute)/iu.test(quantity[2]) ? ['минута','минуты','минут','minute']
        : ['раунд','раунда','раундов','round'];
      const suffix = count % 100 >= 11 && count % 100 <= 14 ? 2 : count % 10 === 1 ? 0 : count % 10 >= 2 && count % 10 <= 4 ? 1 : 2;
      result = count + ' ' + (locale === 'en' ? forms[3] + (count === 1 ? '' : 's') : forms[suffix]);
    }
    if (qualifier) {
      const target = /^(Target|Цель)$/iu.test(qualifier[1]);
      result += ' (' + (locale === 'en' ? target ? 'Target' : 'Place Copy' : target ? 'Цель' : 'Место копии') + ')';
    }
    if (!letter) return result;
    const first = /^[AА]$/iu.test(letter[1]);
    return (locale === 'en' ? first ? 'A' : 'B' : first ? 'А' : 'Б') + ': ' + result;
  }).join('');
}

const traitNames = {
  hunger: 'Голод(?:а)?|Hunger', dread: 'Жуть|Жути|Spook', charm: 'Привлекательност[ьи]|Cute'
};

const traitStatPattern = new RegExp('^([+−-]?[ \\t]*\\d+(?:[.,]\\d+)?)\\s*('
  + Object.values(traitNames).join('|') + ')(?!\\p{L})(?:[ \\t]+(or|или|and|и)[ \\t]+('
  + traitNames.dread + '|' + traitNames.charm + ')(?!\\p{L}))?(?:[ \\t]*\\(([^)\\n]*)\\))?', 'iu');
const traitStatKey = label => Object.keys(traitNames).find(key => new RegExp('^(?:' + traitNames[key] + ')$', 'iu').test(label));
const numericTraitValue = value => Number(value.trim().replace('−','-').replace(',','.').replace(/\s/g,''));

function traitHeader(text) {
  const modifiers = {hunger:[], dread:[], charm:[]};
  let rest = String(text ?? '').trimStart();
  let choice = false;
  let qualified = false;
  for (let match; (match = traitStatPattern.exec(rest));) {
    const [,amount,label,operator,other,qualifier] = match;
    const key = traitStatKey(label);
    const value = numericTraitValue(amount);
    modifiers[key].push(value);
    if (/^(or|или)$/iu.test(operator ?? '')) choice = true;
    else if (other) modifiers[traitStatKey(other)].push(value);
    qualified ||= Boolean(qualifier);
    rest = rest.slice(match[0].length).replace(/^[\s,;•]+/u,'');
  }
  return {modifiers, choice, qualified, rest};
}

export function normalizeTraitFields(record) {
  const stats = Object.fromEntries(Object.entries(record.stats ?? {}).map(([key,value]) => [statKey(key),value]));
  const {modifiers, choice, qualified, rest} = traitHeader(record.text);
  for (const [key, values] of Object.entries(modifiers)) {
    if (!String(stats[key] ?? '').trim() && (values.length || key === 'hunger')) {
      stats[key] = values.length ? values.join(' / ') : '0';
    }
  }
  // Preserve the wording for conditional costs and either/or bonuses.
  const text = choice || qualified || Object.values(modifiers).some(values => values.length > 1)
    ? record.text : rest;
  return {...record, text, stats};
}

function textFacets(item) {
  const text = String(item.text ?? '');
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
  if (item.kind === 'trait') item = normalizeTraitFields(item);
  const found = new Map(Object.entries(textFacets(item)));
  const keys = tracked[item.kind];
  if (!keys) return {};
  const available = new Set(keys);
  for (const [label, value] of Object.entries(item.stats ?? {})) {
    const key = statKey(label);
    if (['traits','kind','topic','region','group','__proto__','constructor','prototype'].includes(key)
      || value == null || value === '' || String(value).length > 96) continue;
    const parts = ['type','range','duration','prerequisite'].includes(key) ? String(value).split(/\s*[/,;•]\s*/)
      : item.kind === 'trait' && key === 'hunger' ? String(value).split(/\s*\/\s*/) : [String(value)];
    found.set(key,parts.map(part => item.kind === 'spell' && key === 'range'
      ? part.replace(/^[АБAB]:\s*/iu,'').replace(/\s*\((?:Target|Place Copy|Цель|Место копии)\)$/iu,'') : part).filter(Boolean));
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

export const devourerCosts = {hearts:4, souls:2, stamina:1};

export function traitEffect(item, size, settings = {}) {
  const {choice} = traitHeader(item.text);
  const {stats} = normalizeTraitFields(item);
  const modifiers = Object.fromEntries(Object.keys(traitNames).map(key => [key, String(stats[key] ?? '')
    .split('/').filter(value => value.trim()).map(numericTraitValue).filter(Number.isFinite)]));
  const number = /^book-trait-(\d{3})$/.exec(item.id)?.[1];
  const costs = modifiers.hunger;
  const poolChoice = number === '066';
  const variableCost = !poolChoice && number !== '022' && (new Set(costs).size > 1
    || /(?:[+\-−]\s*[xх]\s*(?:Голод|Hunger)|(?:Голод|Hunger)\s*:\s*[xх])/iu.test(item.text ?? ''));
  const defaultCost = number === '022' && costs.length >= 3 ? costs[['small','medium','large'].indexOf(size)] : costs[0] ?? 0;
  const pool = Object.hasOwn(devourerCosts,settings.pool) ? settings.pool : 'hearts';
  const hunger = poolChoice ? devourerCosts[pool] : settings.cost ?? defaultCost;
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
  return {hunger, base, exchange, choice, variableCost, poolChoice};
}

export function buildTotals(items, size, adjustments = {}) {
  const stats = {...templates[size]};
  const effects = items.map(({item, settings, count = 1}) => ({...traitEffect(item, size, settings), settings, count}));
  let points = 0;
  for (const {exchange, settings} of effects) {
    if (!exchange) continue;
    const [raised, first, second] = exchange;
    const increase = Math.max(0, 4 - stats[raised]);
    stats[raised] += increase;
    const lowered = settings.trade === second && second ? second : first;
    if (lowered) stats[lowered] -= increase;
  }
  for (const {hunger, base, count} of effects) {
    points += hunger * count;
    for (const [key, value] of Object.entries(base)) stats[key] += value * count;
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

