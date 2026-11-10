import {readArchive, writeArchive} from './archive-api.js';
import {language, setLanguage, t, cleanText} from './locale.js?v=10';
import {facetFields, getFacets, keyText, statKey, englishStatValue, spellStatOrder, spellStatValue, normalizeSpellFields, topicOf, templates, traitEffect, buildTotals, makeReferenceIndex} from './catalog.js?v=14';

const KIND_LABEL = {
  разумные:'Разумный жук', дикие:'Дикое существо', equipment:'Экипировка', state:'Состояние',
  rule:'Памятка', trait:'Черта', path:'Путь', proficiency:'Умение', art:'Боевое искусство', spell:'Магия'
};
const STAT_LABEL = {size:'Размер',might:'Мощь',accuracy:'Прон',shell:'Панц',grace:'Грац',hearts:'Сердца',souls:'Души',stamina:'Выносливость',speed:'Скорость',dread:'Жуть',charm:'Привлекательность',hunger:'Голод',traits:'Черты',geo:'Гео',quality:'Качество',heavy:'Вес',max:'Максимум',обычный:'Обычный',необычный:'Необычный',редкий:'Редкий',уникальный:'Уникальный'};
const VIEW_META = {
  bestiary:{title:'Бестиарий',kicker:'АРХИВ ОБИТАТЕЛЕЙ',types:['разумные','дикие']},
  equipment:{title:'Экипировка',kicker:'СНАРЯЖЕНИЕ СТРАННИКА',types:['equipment']},
  states:{title:'Состояния',kicker:'ПОЛЕВЫЕ ЗАМЕТКИ',types:['state']},
  rules:{title:'Памятка',kicker:'КОРОТКИЙ СВОД ПРАВИЛ',types:['rule']},
  traits:{title:'Черты',kicker:'КОРОТКИЙ СВОД ПРАВИЛ',types:['trait']},
  paths:{title:'Пути',kicker:'КОРОТКИЙ СВОД ПРАВИЛ',types:['path']},
  proficiencies:{title:'Умения',kicker:'КОРОТКИЙ СВОД ПРАВИЛ',types:['proficiency']},
  arts:{title:'Боевые искусства',kicker:'КОРОТКИЙ СВОД ПРАВИЛ',types:['art']},
  magic:{title:'Магия',kicker:'КОРОТКИЙ СВОД ПРАВИЛ',types:['spell']},
  search:{title:'Поиск по Атласу',kicker:'ВСЕ РАЗДЕЛЫ'}
};
const STAT_ORDER=['size','might','accuracy','shell','grace','hearts','souls','stamina','speed','dread','charm','hunger','geo','quality','heavy','max','обычный','необычный','редкий','уникальный'];
let db=[];let defaults=[];let currentView='bestiary';let selectedId=null;let gmUnlocked=false;let toastTimer;
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let archiveRevision = null;
let editorRevision = null;
let editorCredential = '';
let writing = false;
let refreshing = false;
let activeBench = '';
let benchTimer;
let english = {};
let originals = new Map();
let archiveStatus = 'подключаем архив';
let editLanguage = 'en';
let editDrafts = {};
let initialDrafts = {};
let catalogFacets = new Map();
let referenceIndex = makeReferenceIndex([]);
let groupAliases = new Map();
let selectedFacets = {};
let buildSize = 'medium';
const buildTraits = new Map();
const buildAdjustments = {};
const translatedTopics = {
  general: ['Общие правила','General rules'], equipment: ['Экипировка','Equipment'],
  traits: ['Черты','Traits'], paths: ['Пути','Paths'], proficiencies: ['Умения','Proficiencies'],
  arts: ['Боевые искусства','Weapon Arts'], magic: ['Магия','Magic']
};
const topicLabel = topic => t(...translatedTopics[topic]);
localStorage.removeItem('hallownest-editor-key');

const benches = [
  ['bestiary', 'разумные', 'Разумные жуки', 'Записки Дуэлянта'],
  ['bestiary', 'дикие', 'Дикие существа', 'Журнал Скальда'],
  ['equipment', 'equipment', 'Экипировка', 'Оружие и амулеты'],
  ['states', 'state', 'Состояния', 'Сердца и эффекты'],
  ['rules', 'rule', 'Памятка правил', 'Броски и бой'],
  ['traits', 'trait', 'Черты', 'Врождённые особенности'],
  ['paths', 'path', 'Пути', 'Военные и мистические'],
  ['proficiencies', 'proficiency', 'Умения', 'Навыки и мастерство'],
  ['arts', 'art', 'Боевые искусства', 'Приёмы и реакции'],
  ['magic', 'spell', 'Магия', 'Тайны и ритуалы']
];

function benchLabel(view, title) {
  return view === 'rules' ? t('Правила','Rules') : t(title);
}

function mountHall() {
  const pressed = $('#benches [aria-pressed="true"]')?.dataset.bench;
  $('#benches').innerHTML = benches.map(([view, kind, title, subtitle], i) => `
    <button class="bench-choice" data-bench="${i}" type="button" aria-pressed="${String(String(i) === pressed)}">
      <span class="bench-stage">
        <svg class="bench-drawing" aria-hidden="true"><use href="./symbols.svg#bench"/></svg>
        <span class="bench-shadow" aria-hidden="true"></span>
        <svg class="bench-bug" aria-hidden="true"><use href="./symbols.svg?v=4#bug"/></svg>
        <span class="bench-sparks" aria-hidden="true"><i></i><i></i><i></i></span>
      </span>
      <strong>${benchLabel(view, title)}</strong><small>${t(subtitle)}</small>
    </button>`).join('');
  $('#benches').querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      clearTimeout(benchTimer);
      $('#benches').querySelectorAll('button').forEach(other =>
        other.setAttribute('aria-pressed', String(other === button)));
      const [view, kind] = benches[Number(button.dataset.bench)];
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      benchTimer = setTimeout(() => showView(view, kind), reducedMotion ? 0 : 880);
    };
  });
}

function createBloomParticle(type, alreadyFalling = true) {
  const particle = document.createElement('span');
  const flower = type === 'flower';
  const between = (min, max) => min + Math.random() * (max - min);
  const size = flower ? between(16, 40) : between(2, 6);
  const duration = flower ? 10 + (size - 16) * 0.7 : between(12, 27);
  const drift = between(-85, 85);
  const tilt = between(-65, 65);
  particle.className = flower ? 'bloom-flower' : 'bloom-light';
  particle.style.setProperty('--x', between(0, 99) + '%');
  particle.style.setProperty('--size', size + 'px');
  particle.style.setProperty('--duration', duration + 's');
  particle.style.setProperty('--delay', (alreadyFalling ? between(-duration, 0) : between(0, 1.4)) + 's');
  particle.style.setProperty('--drift', drift + 'px');
  particle.style.setProperty('--sway', (drift / 2 + between(-35, 35)) + 'px');
  particle.style.setProperty('--tilt', tilt + 'deg');
  particle.style.setProperty('--turn', (tilt + between(75, 220) * (Math.random() < 0.5 ? -1 : 1)) + 'deg');
  particle.style.setProperty('--glow', between(0.3, 0.56));
  particle.addEventListener('animationend', () => {
    particle.replaceWith(createBloomParticle(type, false));
  }, {once: true});
  return particle;
}

function mountBloom() {
  const layer = $('.bloom-drift');
  const slider = $('#flower-count');
  const storageKey = 'hallownest-flower-count';
  const savedCount = localStorage.getItem(storageKey);
  if (savedCount !== null && /^\d+$/.test(savedCount)) {
    slider.value = savedCount;
  }
  layer.append(...Array.from({length: 22}, () => createBloomParticle('light')));

  function updateCount() {
    const count = slider.valueAsNumber;
    const flowers = [...layer.querySelectorAll('.bloom-flower')];
    while (flowers.length > count) flowers.pop().remove();
    for (let index = flowers.length; index < count; index++) {
      layer.append(createBloomParticle('flower'));
    }
    $('#flower-count-value').value = String(count);
  }
  slider.addEventListener('input', updateCount);
  slider.addEventListener('change', () => localStorage.setItem(storageKey, slider.value));
  updateCount();
}

function showView(view, kind = '', query = '', topic = '', recordId = null) {
  clearTimeout(benchTimer);
  closeExpanded();
  if (!recordId && location.hash.startsWith('#entry=')) history.replaceState(null, '', location.pathname + location.search);
  currentView = view;
  activeBench = kind;
  selectedFacets = topic ? {topic: [topic]} : {};
  selectedId = recordId;
  $('#search').value = query;
  $('#workspace').classList.remove('hidden');
  render();
  renderDetail(selectedId);
  $('#section-title').focus({preventScroll: true});
  $('#workspace').scrollIntoView({block: 'start'});
}

function setArchiveStatus(message) {
  archiveStatus = message;
  $('#save-status').textContent = t(message);
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.title = t('Атлас Халлоунеста', 'Hallownest Atlas');
  $('#language-switch').value = language;
  $('.brand').setAttribute('aria-label', t('Атлас Халлоунеста, на главную', 'Hallownest Atlas home'));
  $('#benches').setAttribute('aria-label', t('Лавочки с разделами', 'Section benches'));
  $('#search').placeholder = t('Найти запись…', 'Find an entry…');
  $('#atlas-query').placeholder = t('Поиск по всему Атласу…', 'Search the entire atlas…');
  $('#atlas-query').setAttribute('aria-label', $('#atlas-query').placeholder);
  $('#atlas-search button').textContent = t('Найти', 'Search');
  $('.bloom-settings label').textContent = t('Падающие цветы', 'Falling flowers');
  $('#edit-region').placeholder = t('например, Забытое Перепутье', 'e.g. Forgotten Crossroads');
  $('#edit-group').placeholder = t('необязательно', 'optional');
  const exportLabel = t('Скачать резервную копию', 'Download archive backup');
  $('#export-button').title = exportLabel;
  $('#export-button').setAttribute('aria-label', exportLabel);
  document.querySelectorAll('.dialog-close').forEach(button =>
    button.setAttribute('aria-label', t('Закрыть', 'Close')));

  const labels = [
    ['.brand-copy b', 'АТЛАС ХАЛЛОУНЕСТА', 'HALLOWNEST ATLAS'],
    ['.brand-copy small', 'полевые записи странника', 'a traveller’s field notes'],
    ['.hall-kicker', 'НЕОФИЦИАЛЬНЫЙ СПРАВОЧНИК · HKRPG', 'UNOFFICIAL FIELD GUIDE · HKRPG'],
    ['#hall-title', 'Атлас Халлоунеста', 'Hallownest Atlas'],
    ['.hall-heading p', 'Выбери лавочку, чтобы открыть нужный раздел.', 'Choose a bench to open a section.'],
    ['#gm-tools b', 'Редактор ГМа', 'GM editor'],
    ['#gm-tools b + span', 'Сохранённые изменения видны всем игрокам', 'Saved changes are visible to all players'],
    ['#import-label', 'Импорт базы', 'Import backup'],
    ['#reset-button', 'Сбросить к исходным', 'Restore defaults'],
    ['#add-button', '＋ Новая запись', '＋ New entry'],
    ['.catalog-footer span:first-child', 'НЕОФИЦИАЛЬНЫЙ ФАНАТСКИЙ СПРАВОЧНИК', 'UNOFFICIAL FAN REFERENCE'],
    ['.catalog-footer span:last-child', 'БЕРЕГИ СВЕЧУ · НЕ ЗАБЫВАЙ ДОРОГУ ДОМОЙ', 'KEEP YOUR LIGHT · REMEMBER THE WAY HOME'],
    ['.atlas-footer p', 'Сделано с любовью от Винса и Айви', 'Made with love by Vince and Ivy'],
    ['.atlas-footer small', 'Фанатский справочник по Hollow Knight RPG', 'A fan guide to Hollow Knight RPG'],
    ['#login-dialog .eyebrow', 'ТОЛЬКО ДЛЯ ХРАНИТЕЛЯ', 'ARCHIVE KEEPERS ONLY'],
    ['#login-dialog h2', 'Ключ от архива', 'Key to the archive'],
    ['#login-dialog p', 'Введи пароль ГМа, чтобы изменить записи атласа.', 'Enter your GM password to edit the atlas.'],
    ['#login-dialog label', 'ПАРОЛЬ ГМа', 'GM PASSWORD'],
    ['#login-dialog .primary-button', 'Открыть архив ', 'Unlock archive '],
    ['#edit-dialog .eyebrow span:last-child', 'РАБОЧАЯ ТЕТРАДЬ ГМа', 'GM WORKBOOK'],
    ['label:has(#edit-name)', 'НАЗВАНИЕ', 'NAME'],
    ['label:has(#edit-kind)', 'РАЗДЕЛ', 'SECTION'],
    ['label:has(#edit-region)', 'МЕСТО / КАТЕГОРИЯ', 'REGION / CATEGORY'],
    ['label:has(#edit-group)', 'ГРУППА', 'GROUP'],
    ['label:has(#edit-description)', 'КРАТКОЕ ОПИСАНИЕ', 'SHORT DESCRIPTION'],
    ['label:has(#edit-stats)', 'ХАРАКТЕРИСТИКИ ', 'STATS '],
    ['label:has(#edit-stats) small', 'одна строка на показатель: Размер: Средний', 'one stat per line, e.g. Size: Medium'],
    ['label[for="edit-text"]', 'ЧЕРТЫ, СПОСОБНОСТИ И ПОЛНЫЙ ТЕКСТ', 'TRAITS, ABILITIES AND FULL TEXT'],
    ['label:has(#edit-source)', 'ИСТОЧНИК / ПРИМЕЧАНИЕ', 'SOURCE / NOTE'],
    ['#delete-button', 'Удалить запись', 'Delete entry'],
    ['#edit-dialog .secondary-button', 'Отмена', 'Cancel'],
    ['#edit-dialog .primary-button', 'Сохранить запись ', 'Save entry ']
  ];
  for (const [selector, russian, english] of labels) {
    $(selector).firstChild.textContent = t(russian, english);
  }
  const editKind = $('#edit-kind');
  const selectedKind = editKind.value;
  editKind.replaceChildren(...benches.map(([view,kind,title]) => new Option(benchLabel(view, title), kind)));
  if (selectedKind) editKind.value = selectedKind;
  const editTopic = $('#edit-rule-topic');
  const topic = editTopic.value;
  editTopic.replaceChildren(...Object.keys(translatedTopics).map(key => new Option(topicLabel(key),key)));
  if (topic) editTopic.value = topic;
  $('#edit-rule-topic-label').firstChild.textContent = t('ТЕМА ПРАВИЛ', 'RULES TOPIC');
  $('#gm-label').textContent = t(gmUnlocked ? 'ГМ · закрыть' : 'Режим ГМа');
  setArchiveStatus(archiveStatus);
  mountHall();
  localizeEditorTools();
}

async function boot() {
  applyLanguage();
  mountBloom();
  wire();
  const loadData = name => fetch(`./data/${name}.json`).then(response => {
    if (!response.ok) throw new Error('Could not load ' + name);
    return response.json();
  });
  const books = ['trait', 'path', 'proficiency', 'art', 'spell'].map(kind => 'book-' + kind);
  const backups = Promise.all(['intelligent', 'wild', 'reference', ...books].map(loadData))
    .then(([intelligent, wild, reference, ...compendium]) => {
      defaults = [...intelligent, ...wild, ...reference.equipment, ...compendium.flat()];
      originals = new Map(defaults.map(record => [record.id, record]));
      if (archiveRevision === null) db = defaults;
    });
  const translations = Promise.all(['english', 'rules.en'].map(loadData))
    .then(([creatures, rules]) => { english = {...creatures, ...rules}; });
  await Promise.allSettled([backups, translations]);
  rebuildCatalogIndex();
  render();
  renderDetail(selectedId);
  await refreshArchive();
  if (location.hash) openHash();
  setInterval(() => {
    if (document.visibilityState === 'visible') void refreshArchive();
  }, 4000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshArchive();
  });
}

async function refreshArchive() {
  if (writing || refreshing) return;
  refreshing = true;
  try {
    const version = await readArchive('revision');
    if (version.revision !== archiveRevision) {
      const latest = await readArchive();
      if (writing || (archiveRevision !== null && latest.revision < archiveRevision)) return;
      db = latest.entries;
      rebuildCatalogIndex();
      archiveRevision = latest.revision;
      render();
      renderDetail(selectedId);
    }
    setArchiveStatus('общий архив подключён');
  } catch {
    setArchiveStatus('нет связи с общим архивом');
  } finally {
    refreshing = false;
  }
}

async function saveArchive(next, expected = archiveRevision) {
  if (!gmUnlocked || writing || expected === null) return false;
  writing = true;
  setArchiveStatus('сохраняем записи');
  try {
    archiveRevision = await writeArchive(editorCredential, expected, next);
    db = next;
    rebuildCatalogIndex();
    setArchiveStatus('сохранено для всех');
    return true;
  } catch (error) {
    setArchiveStatus('запись не сохранена');
    if (error.status === 409) {
      toast('Архив уже изменился. Скопируй черновик и открой запись заново.');
    } else {
      toast('Сохранение не прошло. Изменения пока остались в форме.');
    }
    return false;
  } finally {
    writing = false;
    void refreshArchive();
  }
}

const localizedFields = ['name', 'region', 'group', 'description', 'text', 'source'];
const numericStats = new Set(['might', 'accuracy', 'shell', 'grace', 'hearts', 'souls', 'stamina', 'dread', 'charm', 'hunger']);

function normalizeStats(stats) {
  return Object.fromEntries(Object.entries(stats ?? {}).map(([key,value]) => [statKey(key),value]));
}

function localizeRecord(record, locale = language) {
  const initial = originals.get(record.id);
  const translation = english[record.id];
  const personal = record.en;
  const effectiveLocale = locale === 'ru' && record.baseLocale === 'en' ? 'en' : locale;
  const result = {...record};
  for (const field of localizedFields) {
    const original = record[field] ?? '';
    const unchanged = initial && original === (initial[field] ?? '');
    const russian = field === 'region' && unchanged ? translation?.repairRegion ?? original : original;
    const fallback = effectiveLocale === 'en' && unchanged ? translation?.[field] ?? russian : russian;
    result[field] = cleanText(effectiveLocale === 'en' ? personal?.[field] ?? fallback : russian, field === 'text' || field === 'description');
  }
  if (!result.name && translation?.repairName) result.name = translation.repairName;
  if (!result.name && record.id === 'дикие-26' && !result.text) return null;
  if (!result.name) result.name = locale === 'en' ? 'Untitled entry' : 'Запись без названия';
  const stats = normalizeStats(record.stats);
  if (effectiveLocale === 'en') {
    const personalStats = normalizeStats(personal?.stats);
    const originalStats = normalizeStats(initial?.stats);
    const translatedStats = normalizeStats(translation?.stats);
    const pairs = [];
    for (const key of new Set([...Object.keys(stats), ...Object.keys(personalStats)])) {
      const value = stats[key];
      const unchanged = value !== undefined && value === originalStats[key];
      const personalValue = Object.hasOwn(personalStats,key) ? personalStats[key] : undefined;
      const stock = unchanged ? translatedStats[key] : undefined;
      if (unchanged && personalValue === undefined && (
        (key === 'size' && /^Клешни:/iu.test(value)) ||
        (key === 'hearts' && /^\.\s*Этот урон нельзя уменьшить\.$/iu.test(value)))) continue;
      let candidate = personalValue ?? stock ?? value;
      if (numericStats.has(key)) {
        candidate = englishStatValue(key,value);
        if (/\p{Script=Cyrillic}/u.test(candidate) && stock !== undefined) candidate = stock;
      }
      pairs.push([key,cleanText(englishStatValue(key,candidate))]);
    }
    result.stats = Object.fromEntries(pairs);
  } else {
    result.stats = Object.fromEntries(Object.entries(stats).map(([key,value]) => [key,cleanText(value)]));
  }
  result.topic = topicOf(record) || topicOf(result);
  if (result.topic) result.kind = 'rule';
  if (result.kind !== 'spell') return result;
  const spell = normalizeSpellFields(result);
  const alternate = normalizeSpellFields(effectiveLocale === 'en' ? record : personal ?? {});
  for (const key of spellStatOrder) {
    const value = spell.stats[key] || alternate.stats[key];
    if (value) spell.stats[key] = spellStatValue(key,value,locale);
  }
  return spell;
}

function rebuildCatalogIndex() {
  groupAliases = new Map();
  for (const record of defaults) {
    const translated = english[record.id] ?? record.en;
    for (const field of ['region', 'group']) {
      const names = [record[field], translated?.[field]];
      if (!names.every(Boolean)) continue;
      for (const name of names) groupAliases.set(record.kind + '|' + keyText(name), names);
    }
  }
  referenceIndex = makeReferenceIndex(db.flatMap(record => [
    localizeRecord(record, 'ru'), localizeRecord(record, 'en')
  ]).filter(Boolean));
}

function catalogGroup(item, field) {
  let value = item[field];
  if (item.kind === 'spell' && field === 'region' && item.group
    && (!value || groupAliases.has('spell|' + keyText(item.group)))) value = item.group;
  const match = groupAliases.get(item.kind + '|' + keyText(value));
  if (match) return match[language === 'en' ? 1 : 0];
  if (item.kind === 'equipment' && (/^(оружие|weapons)$/i.test(value)
    || (field === 'region' && !value && getFacets(item, language).type))) return t('Оружие', 'Weapons');
  return value;
}

function typeRecords() {
  return db.map(record => localizeRecord(record)).filter(item => item && (
    currentView === 'search' || (VIEW_META[currentView].types.includes(item.kind)
      && (!activeBench || item.kind === activeBench))));
}

function normalizeQuery(value) {
  return String(value).normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function searchAtlas(query) {
  const words = normalizeQuery(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const kinds = selectedFacets.kind ?? [];
  const results = [];
  for (const record of db) {
    const item = localizeRecord(record);
    if (!item || (kinds.length && !kinds.includes(item.kind))) continue;
    const alternate = localizeRecord(record, language === 'en' ? 'ru' : 'en');
    const names = normalizeQuery([item.name, alternate?.name].join(' '));
    const content = [item, alternate].filter(Boolean).flatMap(entry =>
      [entry.name, entry.region, entry.group, entry.description, entry.text, ...Object.values(entry.stats)]);
    const section = KIND_LABEL[item.kind] ?? '';
    const haystack = normalizeQuery([...content, section, t(section)].join(' '));
    if (words.every(word => haystack.includes(word))) {
      const rank = words.every(word => names.includes(word)) ? 2 : words.some(word => names.includes(word)) ? 1 : 0;
      results.push({item, rank});
    }
  }
  return results.sort((a,b) => b.rank - a.rank || a.item.name.localeCompare(b.item.name, language))
    .map(result => result.item);
}

function filteredRecords() {
  const search = $('#search').value;
  if (currentView === 'search') return searchAtlas(search);
  const query = normalizeQuery(search);
  const records = typeRecords().filter(item => Object.entries(selectedFacets).every(([key, choices]) =>
    !choices.length || choices.some(choice => catalogFacets.get(item.id)?.[key]?.includes(choice)))
    && (!query || normalizeQuery([item.name, item.description, item.region, item.group, item.text, ...Object.values(item.stats)].join(' ')).includes(query)));
  return currentView === 'magic' ? sortMagicRecords(records) : records;
}

function sortMagicRecords(records) {
  const bookOrder = defaults.filter(record => record.kind === 'spell' && !topicOf(record));
  const ids = new Map(bookOrder.map((record,index) => [record.id,index]));
  const schools = new Map([...new Set(bookOrder.map(record => catalogGroup(record,'region')))].map((school,index) => [school,index]));
  const group = item => catalogGroup(item,'region');
  return records.sort((a,b) => (schools.get(group(a)) ?? schools.size) - (schools.get(group(b)) ?? schools.size)
    || group(a).localeCompare(group(b),language)
    || (ids.get(a.id) ?? ids.size) - (ids.get(b.id) ?? ids.size)
    || a.name.localeCompare(b.name,language));
}

function render() {
  const meta = VIEW_META[currentView];
  const bench = benches.find(([view,kind]) => view === currentView && kind && kind === activeBench);
  $('#section-title').textContent = currentView === 'rules' ? t('Правила','Rules') : t(bench?.[2] ?? meta.title);
  $('#section-kicker').textContent = t(meta.kicker);
  renderCatalogActions();
  renderFilters();
  renderList();
}

function renderCatalogActions() {
  const actions = $('#catalog-actions');
  const canLink = Object.hasOwn(translatedTopics,currentView) && db.some(record => topicOf(record) === currentView);
  actions.innerHTML = (canLink ? '<button class="filter-chip" type="button" id="topic-rules"></button>' : '')
    + (currentView === 'traits' ? '<button class="filter-chip" type="button" id="open-builder"></button>' : '');
  const topic = selectedFacets.topic?.length === 1 && selectedFacets.topic[0];
  const bench = currentView === 'rules' && benches.find(([view]) => view === topic);
  if (bench) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'filter-chip';
    back.textContent = '← ' + topicLabel(topic);
    back.onclick = () => showView(bench[0],bench[1]);
    actions.append(back);
  }
  if (canLink) {
    $('#topic-rules').textContent = t('Сводка правил ↗', 'Rules summary ↗');
    $('#topic-rules').onclick = () => showView('rules', 'rule', '', currentView);
  }
  if (currentView === 'traits') {
    $('#open-builder').textContent = t('Конструктор жука', 'Bug builder');
    $('#open-builder').onclick = () => {
      renderBuilder();
      $('#builder-dialog').showModal();
      $('#builder-search').focus();
    };
  }
}

function renderFilters() {
  const container = $('#filters');
  const wasOpen = container.querySelector('details')?.open;
  const records = typeRecords();
  const options = new Map();
  const add = (key, value) => {
    if (!options.has(key)) options.set(key, new Map());
    const counts = options.get(key);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  };
  catalogFacets = new Map(records.map(item => {
    const facets = getFacets(item, language);
    if (currentView === 'search') facets.kind = [item.kind];
    else if (item.topic) {
      facets.topic = [item.topic];
      if (item.topic === 'general' && item.group && item.group !== item.region) facets.group = [item.group];
    } else {
      const region = catalogGroup(item, 'region');
      const group = catalogGroup(item, 'group');
      if (region || group) facets.region = [region || group];
      if (group && region && keyText(group) !== keyText(region)) facets.group = [group];
    }
    for (const [key, values] of Object.entries(facets))
      for (const value of values) add(key, value);
    return [item.id, facets];
  }));
  if (!options.size) {
    container.replaceChildren();
    return;
  }
  const label = key => ({
    kind: t('Раздел', 'Section'), topic: t('Тема','Topic'), region: t('Группа', 'Group'),
    group: t('Подгруппа', 'Subgroup')
  }[key] ?? statLabel(key));
  const valueLabel = (key,value) => key === 'kind' ? t(KIND_LABEL[value]) : key === 'topic' ? topicLabel(value) : value;
  const primary = ['kind','topic','region'];
  const groups = [...options.keys()].sort((a,b) => (primary.indexOf(a) + 4) % 4 - (primary.indexOf(b) + 4) % 4);
  const count = Object.values(selectedFacets).reduce((sum, selected) => sum + selected.length, 0);
  container.innerHTML = '<details' + (wasOpen || count ? ' open' : '') + '><summary>'
    + esc(t('Фильтры', 'Filters')) + (count ? ' · ' + count : '') + '</summary>'
    + '<div class="facet-tools"><button type="button" class="filter-chip" id="clear-facets">'
    + esc(t('Сбросить фильтры', 'Clear filters')) + '</button><span>'
    + esc(t('Можно выбрать несколько значений', 'Choose multiple values')) + '</span></div>'
    + '<div class="facet-grid">' + groups.map(key => {
      const choices = [...options.get(key)].sort(([a], [b]) => valueLabel(key,a).localeCompare(valueLabel(key,b), language, {numeric:true}));
      return '<fieldset><legend>' + esc(label(key)) + '</legend><div class="facet-options">'
        + choices.map(([value, total]) => '<label><input type="checkbox" data-facet="' + esc(key)
          + '" value="' + esc(value) + '"' + (selectedFacets[key]?.includes(value) ? ' checked' : '')
          + '> <span>' + esc(valueLabel(key,value)) + '</span> <small>' + total + '</small></label>').join('')
        + '</div></fieldset>';
    }).join('') + '</div></details>';
  container.onchange = event => {
    const input = event.target.closest('[data-facet]');
    if (!input) return;
    const key = input.dataset.facet;
    const values = selectedFacets[key] ?? [];
    selectedFacets[key] = input.checked ? [...values, input.value] : values.filter(value => value !== input.value);
    clearSelection();
    renderCatalogActions();
    renderFilters();
    container.querySelectorAll('[data-facet]').forEach(next => {
      if (next.dataset.facet === key && next.value === input.value) next.focus({preventScroll:true});
    });
  };
  $('#clear-facets').onclick = () => {
    selectedFacets = {};
    clearSelection();
    renderCatalogActions();
    renderFilters();
    $('#clear-facets')?.focus();
  };
}

function clearSelection() {
  selectedId = null;
  closeExpanded();
  renderList();
  renderDetail(null);
}

function statLabel(key) {
  const field = statKey(key);
  const labels = Object.hasOwn(facetFields,field) && facetFields[field];
  return labels ? t(labels[0], labels[1]) : t(Object.hasOwn(STAT_LABEL,key) ? STAT_LABEL[key] : key);
}

function statPairs(item) {
  const stats = item.stats ?? {};
  const required = item.kind === 'spell' ? spellStatOrder : [];
  return [...new Set([...required, ...STAT_ORDER, ...Object.keys(stats)])]
    .filter(key => required.includes(key) || (stats[key] !== undefined && stats[key] !== '' && key !== 'traits'))
    .map(key => [statLabel(key), stats[key] || t('Не указано','Not specified')]);
}
function renderList(){const list=filteredRecords();
  if (currentView === 'search') {
    $('#section-kicker').textContent = t(`НАЙДЕНО: ${list.length}`, `RESULTS: ${list.length}`);
  }
  $('#record-list').innerHTML=list.length?list.map(item=>{
  const stats=statPairs(item).slice(0,4).map(([k,v])=>`<span class="stat-pill">${esc(k)} ${esc(v)}</span>`).join('');
  return `<article class="record-card ${item.id===selectedId?'selected':''}" tabindex="0" role="button" data-id="${esc(item.id)}"><div class="card-top"><div><div class="card-name">${esc(item.name)}</div><div class="card-region">${esc(item.topic ? topicLabel(item.topic) : catalogGroup(item, 'region') || t('Без привязки'))}</div></div><span class="kind-mark ${item.kind==='дикие'?'wild':''}">${esc(t(KIND_LABEL[item.kind]||'Запись'))}</span></div>${item.description?`<p class="card-description">${esc(item.description)}</p>`:''}${stats?`<div class="stat-line">${stats}</div>`:''}${item.stats?.traits?`<div class="card-traits">${esc(item.stats.traits)}</div>`:''}${gmUnlocked?'<button class="edit-mini" data-edit="'+esc(item.id)+'">' + t('ИЗМЕНИТЬ') + '</button>':''}</article>`;
 }).join(''):`<div class="empty-results"><b>${t('Следов не найдено')}</b><span>${t('Попробуй другое слово или очисти фильтр.')}</span></div>`;
  $('#record-list').querySelectorAll('.record-card').forEach(card => {
    card.onclick = event => { if (!event.target.closest('[data-edit]')) selectRecord(card.dataset.id); };
    card.onkeydown = event => {
      if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        selectRecord(card.dataset.id, true);
      }
    };
  });
  $('#record-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openEditor(b.dataset.edit);});
}
function splitTraits(item) {
  return String(item.stats?.traits || '').split(/[,;•]/).map(value => value.trim()).filter(Boolean);
}

function statPairsWithFacets(item) {
  const pairs = statPairs(item);
  const explicit = new Set(Object.keys(item.stats).map(statKey));
  const facets = getFacets(item, language);
  return [...pairs, ...Object.entries(facets).filter(([key]) => !explicit.has(key))
    .map(([key, values]) => [statLabel(key), values.join(' / ')])];
}

function recordHref(id) {
  return '#entry=' + encodeURIComponent(id);
}

function resolveReference(name, current, kind) {
  const matches = (referenceIndex.entries.get(keyText(name)) ?? []).filter(item => item.id !== current);
  const preferred = kind ? matches.filter(item => item.kind === kind) : matches;
  return preferred.length === 1 ? preferred[0] : null;
}

function referenceLink(name, target, linked) {
  if (!target || linked.has(target.id)) return esc(name);
  linked.add(target.id);
  return '<a class="atlas-ref" data-ref="' + esc(target.id) + '" href="' + recordHref(target.id) + '">' + esc(name) + '</a>';
}

function linkText(text, item, linked, kind) {
  const pattern = referenceIndex.pattern;
  if (!pattern) return esc(text);
  let offset = 0;
  let html = '';
  for (const match of text.matchAll(pattern)) {
    html += esc(text.slice(offset, match.index));
    const name = match[0];
    const target = resolveReference(name, item.id, kind);
    html += referenceLink(name, target, linked);
    offset = match.index + name.length;
  }
  return html + esc(text.slice(offset));
}

function formattedText(text, item, linked) {
  const tokens = /\[\[([^\]\n]+)\]\]|\*\*([^*\n]+)\*\*|==([^=\n]+)==/g;
  let html = '';
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    html += linkText(text.slice(offset, match.index), item, linked);
    const [, reference, strong, highlight] = match;
    if (reference) {
      const [name, alias = name] = reference.split('|', 2).map(value => value.trim());
      const target = resolveReference(name, item.id);
      html += referenceLink(alias, target, linked);
    } else {
      const tag = strong ? 'strong' : 'mark';
      html += '<' + tag + '>' + linkText(strong ?? highlight, item, linked) + '</' + tag + '>';
    }
    offset = match.index + match[0].length;
  }
  return html + linkText(text.slice(offset), item, linked);
}

function selectRecord(id, keyboard = false) {
  selectedId = id;
  if (location.hash.startsWith('#entry=')) history.replaceState(null, '', recordHref(id));
  renderList();
  renderDetail(id);
  if (keyboard) $('#detail-title')?.focus({preventScroll:true});
  if (keyboard || matchMedia('(max-width: 780px)').matches)
    $('#detail-panel').scrollIntoView({block:'start'});
}

function openHash() {
  if (!location.hash.startsWith('#entry=')) return;
  try { openRecord(decodeURIComponent(location.hash.slice(7))); }
  catch (error) { if (!(error instanceof URIError)) throw error; }
}

function openRecord(id) {
  const raw = db.find(item => item.id === id);
  const item = raw && localizeRecord(raw);
  const bench = item && benches.find(([,kind]) => kind === item.kind);
  if (!bench) return;
  if ($('#builder-dialog').open) $('#builder-dialog').close();
  showView(bench[0], bench[1], '', item.topic, id);
  $('#detail-title')?.focus({preventScroll:true});
  $('#detail-panel').scrollIntoView({block:'start'});
}

function renderDetail(id) {
  hideReferenceTip();
  const raw = db.find(item => item.id === id);
  const item = raw && localizeRecord(raw);
  const panel = $('#detail-panel');
  if (!item) {
    closeExpanded();
    panel.innerHTML = '<div class="detail-empty"><div class="empty-symbol">✳</div><h3>'
      + esc(t('Открой запись')) + '</h3><p>' + esc(t('Выбери жука или заметку в списке, чтобы рассмотреть её поближе.'))
      + '</p><span>' + esc(t('КЛИКНИ ПО ЛЮБОЙ КАРТОЧКЕ')) + '</span></div>';
    return;
  }
  const stats = statPairsWithFacets(item).map(([key, value]) =>
    '<div class="detail-stat"><small>' + esc(key) + '</small><b>' + esc(value) + '</b></div>').join('');
  const linked = new Set();
  const description = formattedText(item.description, item, linked);
  const tags = splitTraits(item).map(name => {
    const target = resolveReference(name, id, 'trait');
    return '<span class="trait-tag">' + (target ? referenceLink(name, target, linked) : linkText(name, item, linked, 'trait')) + '</span>';
  }).join('');
  const region = item.topic ? topicLabel(item.topic) : catalogGroup(item, 'region') || t('Халлоунест');
  const group = catalogGroup(item, 'group');
  panel.innerHTML = '<div class="detail-content"><div class="detail-topline"><span class="detail-kind">'
    + esc(t(KIND_LABEL[item.kind] || 'Запись')) + '</span><div class="detail-toolbar">'
    + ($('#reading-dialog').open ? '' : '<button type="button" class="filter-chip" id="expand-reading">'
      + esc(t('Развернуть ⤢', 'Expand ⤢')) + '</button>')
    + (gmUnlocked ? '<button type="button" class="text-button" data-detail-edit>' + esc(t('Редактировать ✎')) + '</button>' : '')
    + '</div></div><div class="detail-region">' + esc(region + (group && group !== region ? ' · ' + group : ''))
    + '</div><h3 class="detail-title" id="detail-title" tabindex="-1">' + esc(item.name) + '</h3>'
    + (item.description ? '<p class="detail-description">' + description + '</p>' : '')
    + (stats ? '<div class="detail-stats">' + stats + '</div>' : '')
    + (tags ? '<div class="detail-traits"><div class="detail-label">' + esc(t('Черты'))
      + '</div><div class="trait-tags">' + tags + '</div></div>' : '')
    + (item.text ? '<div class="detail-body"><p>' + formattedText(item.text, item, linked) + '</p></div>' : '')
    + '<div class="detail-source">' + esc(t('Источник')) + ': ' + esc(item.source || t('добавлено Хранителем архива')) + '</div>'
    + (gmUnlocked ? '<div class="detail-actions"><button type="button" data-detail-delete>'
      + esc(t('Удалить')) + '</button></div>' : '') + '</div>';
  if ($('#expand-reading')) $('#expand-reading').onclick = expandReading;
  panel.querySelector('[data-detail-edit]')?.addEventListener('click', () => openEditor(id));
  panel.querySelector('[data-detail-delete]')?.addEventListener('click', () => deleteRecord(id));
}

function expandReading() {
  const dialog = $('#reading-dialog');
  $('#close-reading').textContent = t('Свернуть ⤡', 'Collapse ⤡');
  $('#reading-content').append($('#detail-panel'));
  dialog.showModal();
  renderDetail(selectedId);
  $('#close-reading').focus();
}

function closeExpanded(restoreFocus = false) {
  const dialog = $('#reading-dialog');
  if (dialog.open) dialog.close();
  const panel = $('#detail-panel');
  if (panel.parentElement.id !== 'reading-content') return;
  hideReferenceTip();
  $('.catalog-grid').append(panel);
  if (restoreFocus) {
    renderDetail(selectedId);
    $('#expand-reading')?.focus();
  }
}

let tipAnchor;
function hideReferenceTip() {
  const tip = $('#reference-tip');
  if (!tip) return;
  tipAnchor?.removeAttribute('aria-describedby');
  tipAnchor = null;
  tip.classList.add('hidden');
}

function showReferenceTip(anchor) {
  const raw = db.find(item => item.id === anchor.dataset.ref);
  const item = raw && localizeRecord(raw);
  if (!item || tipAnchor === anchor) return;
  hideReferenceTip();
  const tip = $('#reference-tip');
  (anchor.closest('dialog') ?? document.body).append(tip);
  const summary = (item.description || item.text || item.region).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_,name,label) => label ?? name)
    .replace(/\*\*|==/g, '').replace(/\s+/g, ' ').trim();
  tip.innerHTML = '<small>' + esc(t(KIND_LABEL[item.kind] || 'Запись')) + '</small><strong>' + esc(item.name) + '</strong>'
    + (summary ? '<span>' + esc(summary.length > 200 ? summary.slice(0, 197).trimEnd() + '…' : summary) + '</span>' : '');
  tip.classList.remove('hidden');
  tipAnchor = anchor;
  anchor.setAttribute('aria-describedby', tip.id);
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8));
  const top = rect.bottom + tip.offsetHeight + 12 < window.innerHeight
    ? rect.bottom + 7 : Math.max(8, rect.top - tip.offsetHeight - 7);
  Object.assign(tip.style, {left: left + 'px', top: top + 'px'});
}

function wireCatalogTools() {
  const dialog = $('#reading-dialog');
  $('#close-reading').onclick = () => closeExpanded(true);
  dialog.addEventListener('close', () => { if (!dialog.open) closeExpanded(true); });
  $('#close-builder').onclick = () => $('#builder-dialog').close();
  $('#builder-search').oninput = renderBuilderList;
  $('#edit-kind').onchange = toggleRuleTopicField;
  $('#translate-draft').onclick = translateDraft;
  $('#edit-locale').onchange = () => {
    editDrafts[editLanguage] = readEditorDraft();
    editLanguage = $('#edit-locale').value;
    loadEditorDraft();
  };
  document.querySelectorAll('[data-format]').forEach(button => button.onclick = () => formatSelection(button.dataset.format));
  window.addEventListener('hashchange', openHash);
  document.addEventListener('click', event => {
    const anchor = event.target.closest('[data-ref]');
    if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (selectedId && !location.hash) history.replaceState(null, '', recordHref(selectedId));
    history.pushState(null, '', anchor.getAttribute('href'));
    openRecord(anchor.dataset.ref);
  });
  document.addEventListener('pointerover', event => {
    const anchor = event.target.closest('[data-ref]');
    if (anchor && event.pointerType !== 'touch') showReferenceTip(anchor);
  });
  document.addEventListener('pointerout', event => {
    if (tipAnchor && tipAnchor.contains(event.target) && !tipAnchor.contains(event.relatedTarget) && tipAnchor !== document.activeElement) hideReferenceTip();
  });
  document.addEventListener('focusin', event => {
    const anchor = event.target.closest('[data-ref]');
    if (anchor) showReferenceTip(anchor);
    else hideReferenceTip();
  });
  window.addEventListener('scroll', hideReferenceTip, {capture:true, passive:true});
  window.addEventListener('resize', hideReferenceTip);
}

function builderTraits() {
  return db.filter(record => record.kind === 'trait' && !topicOf(record))
    .map(record => localizeRecord(record)).filter(Boolean);
}

function numberLabel(value) {
  return value.toLocaleString(language, {maximumFractionDigits:2});
}

function renderBuilderList() {
  const query = normalizeQuery($('#builder-search').value);
  const traits = builderTraits().filter(item => normalizeQuery([item.name,item.group,item.region].join(' ')).includes(query))
    .sort((a,b) => a.name.localeCompare(b.name,language));
  $('#builder-list').innerHTML = traits.map(item => {
    const selected = buildTraits.has(item.id);
    const effect = traitEffect(item, buildSize, buildTraits.get(item.id));
    return '<div class="builder-choice"><span><a data-ref="' + esc(item.id) + '" href="' + recordHref(item.id) + '">'
      + esc(item.name) + '</a><small>' + esc(catalogGroup(item, 'region')) + '</small></span><button class="filter-chip" type="button" data-build="' + esc(item.id) + '" aria-pressed="' + selected + '">'
      + (selected ? '✓ ' + esc(t('Убрать','Remove')) : '+ ' + esc(t('Взять','Add'))) + ' · '
      + esc(numberLabel(effect.hunger)) + (effect.variableCost ? '*' : '') + '</button></div>';
  }).join('') || '<p>' + esc(t('Следов не найдено')) + '</p>';
  $('#builder-list').querySelectorAll('[data-build]').forEach(button => button.onclick = () => {
    const id = button.dataset.build;
    if (buildTraits.has(id)) buildTraits.delete(id);
    else buildTraits.set(id, {});
    renderBuilder();
    [...$('#builder-list').querySelectorAll('[data-build]')].find(next => next.dataset.build === id)?.focus({preventScroll:true});
  });
}

function builderInput(key, value) {
  return '<input class="form-input" data-build-setting="' + esc(key) + '" type="number" step="0.5" value="' + esc(value) + '">';
}

function builderSelect(key, options, value) {
  return '<select class="form-input" data-build-setting="' + esc(key) + '">' + options.map(([id,label]) =>
    '<option value="' + esc(id) + '"' + (id === value ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select>';
}

function traitCopies(item) {
  const raw = db.find(record => record.id === item.id);
  const text = [item.text, raw?.text, raw?.en?.text].join(' ');
  if (/may be taken up to three times|можно взять до тр[её]х раз/iu.test(text)) return 3;
  return /may be taken twice|можно взять дважды/iu.test(text) ? 2 : 1;
}

function renderBuilderSummary(selected) {
  const all = selected.flatMap(({item,settings}) => Array.from({length:settings.count ?? 1}, (_, index) => ({
    item,
    settings: item.id === 'book-trait-029' && index ? {...settings,cost:2} : settings
  })));
  const {stats,points} = buildTotals(all,buildSize,buildAdjustments);
  $('#builder-summary').innerHTML = '<p class="builder-points" role="status"><b>' + esc(t('Очки черт','Trait points'))
    + ' · ' + esc(numberLabel(points)) + ' / 16</b>'
    + (points > 16 ? '<span>' + esc(t('Лимит превышен на ', 'Over the limit by ') + numberLabel(points - 16)) + '</span>' : '')
    + '</p><div class="detail-stats">' + Object.entries(stats).map(([key,value]) => '<div class="detail-stat"><small>'
      + esc(statLabel(key)) + '</small><b>' + esc(numberLabel(value)) + '</b></div>').join('') + '</div>';
}

function renderBuilder() {
  $('#builder-title').textContent = t('Конструктор жука', 'Bug builder');
  $('#builder-search-label').textContent = t('Найти черту','Find a trait');
  $('#builder-search').placeholder = t('Название или группа','Name or group');
  const sizes = [['small',t('Малый','Small')], ['medium',t('Средний','Average')], ['large',t('Большой','Large')]];
  $('#builder-options').innerHTML = '<label>' + esc(t('Размер жука','Bug size')) + builderSelect('size',sizes,buildSize)
    + '</label><button type="button" class="filter-chip" id="reset-build">' + esc(t('Очистить выбор','Reset build')) + '</button>';
  $('#builder-options').querySelector('select').onchange = event => {
    buildSize = event.target.value;
    renderBuilder();
    $('#builder-options select').focus({preventScroll:true});
  };
  $('#reset-build').onclick = () => {
    buildTraits.clear();
    Object.keys(buildAdjustments).forEach(key => delete buildAdjustments[key]);
    renderBuilder();
    $('#builder-search').focus();
  };
  const selected = builderTraits().filter(item => buildTraits.has(item.id)).map(item => ({item, settings:buildTraits.get(item.id)}));
  renderBuilderSummary(selected);
  $('#builder-selected').innerHTML = selected.length ? '<h3>' + esc(t('Выбранные черты','Selected traits')) + '</h3>'
    + selected.map(({item,settings}) => {
      const effect = traitEffect(item, buildSize, settings);
      const [,first,second] = effect.exchange ?? [];
      const copies = traitCopies(item);
      return '<div class="builder-choice" data-selected-trait="' + esc(item.id) + '"><span>' + esc(item.name) + '</span><div>'
        + (copies > 1 ? '<label>' + esc(t('Количество','Copies')) + builderSelect('count',
          Array.from({length:copies}, (_, index) => [String(index + 1), String(index + 1)]), String(settings.count ?? 1)) + '</label>' : '')
        + (effect.variableCost ? '<label>' + esc(t('Цена черты','Trait cost')) + builderInput('cost',effect.hunger) + '</label>' : '')
        + (effect.choice ? '<label>' + esc(t('Бонус к','Bonus to')) + builderSelect('social',
          ['dread','charm'].map(key => [key,statLabel(key)]),settings.social ?? 'dread') + '</label>' : '')
        + (second ? '<label>' + esc(t('Убавить из','Reduce')) + builderSelect('trade',
          [first,second].map(key => [key,statLabel(key)]),settings.trade ?? first) + '</label>' : '')
        + '<button class="filter-chip" type="button" data-remove-build="' + esc(item.id) + '">' + esc(t('Убрать','Remove')) + '</button></div></div>';
    }).join('') : '';
  $('#builder-selected').onchange = event => {
    const key = event.target.dataset.buildSetting;
    const row = event.target.closest('[data-selected-trait]');
    if (!key || !row) return;
    const value = event.target.value;
    const settings = buildTraits.get(row.dataset.selectedTrait);
    if (key === 'cost' && value === '') delete settings[key];
    else settings[key] = key === 'count' || key === 'cost' ? Number(value) : value;
    renderBuilder();
    [...$('#builder-selected').querySelectorAll('[data-selected-trait]')].find(next => next.dataset.selectedTrait === row.dataset.selectedTrait)
      ?.querySelector('[data-build-setting="' + key + '"]')?.focus({preventScroll:true});
  };
  $('#builder-selected').querySelectorAll('[data-remove-build]').forEach(button => button.onclick = () => {
    buildTraits.delete(button.dataset.removeBuild);
    renderBuilder();
    $('#builder-search').focus();
  });
  const adjustmentsOpen = $('#builder-adjustments details')?.open;
  $('#builder-adjustments').innerHTML = '<details' + (adjustmentsOpen ? ' open' : '') + '><summary>'
    + esc(t('Ручные поправки','Manual adjustments')) + '</summary><p>'
    + esc(t('Постоянные бонусы и стоимость считаются автоматически там, где они заданы. Условные эффекты, ограничения и подчерты сверяй с описанием.',
      'Listed fixed bonuses and costs are calculated automatically. Check the trait text for conditional effects, restrictions, and subtraits.'))
    + '</p><div class="builder-adjustment-grid">' + Object.keys(templates[buildSize]).map(key => '<label>'
      + esc(statLabel(key)) + builderInput(key,buildAdjustments[key] ?? 0) + '</label>').join('') + '</div></details>';
  $('#builder-adjustments').oninput = event => {
    const key = event.target.dataset.buildSetting;
    if (!key) return;
    buildAdjustments[key] = Number(event.target.value);
    renderBuilderSummary(selected);
  };
  renderBuilderList();
}

function wire(){
  $('#atlas-search').onsubmit = event => {
    event.preventDefault();
    const query = $('#atlas-query').value.trim();
    if (normalizeQuery(query)) showView('search', '', query);
  };
  $('#language-switch').onchange = event => {
    clearTimeout(benchTimer);
    setLanguage(event.target.value);
    selectedFacets = Object.fromEntries(Object.entries(selectedFacets).filter(([key]) => key === 'kind' || key === 'topic'));
    if (currentView !== 'search') $('#search').value = '';
    applyLanguage();
    render();
    renderDetail(selectedId);
  };
  $('.brand').onclick = event => {
    event.preventDefault();
    clearTimeout(benchTimer);
    closeExpanded();
    history.replaceState(null, '', location.pathname + location.search);
    $('#workspace').classList.add('hidden');
    $('#bench-hall').scrollIntoView({block: 'start'});
  };
  $('#search').oninput = clearSelection;
  wireCatalogTools();
  $('#gm-toggle').onclick = () => gmUnlocked ? lockGM() : $('#login-dialog').showModal();
  $('#login-dialog .dialog-close').onclick = () => $('#login-dialog').close();
  $('#login-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    const password = $('#gm-password').value;
    const error = $('#login-error');
    error.classList.add('hidden');
    try {
      await writeArchive(password);
      editorCredential = password;
      gmUnlocked = true;
      $('#login-dialog').close();
      $('#gm-password').value = '';
      $('#gm-toggle').classList.add('unlocked');
      $('#gm-label').textContent = t('ГМ · закрыть');
      $('#gm-tools').classList.remove('hidden');
      if ($('#workspace').classList.contains('hidden')) showView('bestiary');
      renderList();
      renderDetail(selectedId);
      void refreshArchive();
      toast('Редактор открыт. Сохранённые правки увидят все.');
    } catch (failure) {
      error.textContent = failure.status === 401 || failure.status === 403
        ? t('Пароль ГМа не подошёл.')
        : t(failure.message);
      error.classList.remove('hidden');
    } finally {
      if (button) button.disabled = false;
    }
  };
  $('#login-dialog').addEventListener('click',e=>{if(e.target===$('#login-dialog'))$('#login-dialog').close();});
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#edit-dialog').close());
  $('#edit-form').onsubmit=saveEditor;$('#add-button').onclick=()=>openEditor(null);$('#delete-button').onclick=()=>deleteRecord($('#edit-id').value);
  $('#export-button').onclick=exportData;$('#import-file').onchange=importData;$('#reset-button').onclick=resetData;
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.target.closest('input, textarea, select, [contenteditable]') && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      $($('#workspace').classList.contains('hidden') ? '#atlas-query' : '#search').focus();
    }
    if (event.key === 'Escape' && $('#edit-dialog').open) $('#edit-dialog').close();
  });
}
function lockGM(){gmUnlocked=false;editorCredential='';$('#gm-toggle').classList.remove('unlocked');$('#gm-label').textContent=t('Режим ГМа');$('#gm-tools').classList.add('hidden');renderList();renderDetail(selectedId);toast('Режим ГМа закрыт.');}
function localizeEditorTools() {
  $('#edit-locale-label').textContent = t('Язык записи','Entry language');
  $('#edit-locale-note').textContent = t('Введи русский и английский тексты отдельно. Обе версии сохраняются одной кнопкой.',
    'Enter Russian and English text separately. Save both versions together.');
  $('[data-format="**"]').textContent = t('Жирный','Bold');
  $('[data-format="=="]').textContent = t('Выделить','Highlight');
  $('[data-format="link"]').textContent = t('Ссылка на запись','Link to entry');
  $('#translate-draft').textContent = t('Заполнить перевод','Fill in translation');
}

function formatSelection(format) {
  const field = $('#edit-text');
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const text = field.value.slice(start,end) || t('текст','text');
  const left = format === 'link' ? '[[' : format;
  const right = format === 'link' ? ']]' : format;
  field.setRangeText(left + text + right,start,end);
  field.focus();
  field.setSelectionRange(start + left.length,start + left.length + text.length);
}

async function translateDraft() {
  const notice = $('#translation-status');
  const button = $('#translate-draft');
  const drafts = editDrafts;
  const sourceLanguage = editLanguage;
  const targetLanguage = sourceLanguage === 'ru' ? 'en' : 'ru';
  drafts[sourceLanguage] = readEditorDraft();
  const source = drafts[sourceLanguage];
  const target = drafts[targetLanguage];
  if (!source.name.trim()) {
    notice.textContent = t('Сначала заполни название исходной записи.','Enter the source title first.');
    return;
  }
  const dialog = $('#edit-dialog');
  const current = () => dialog.open && drafts === editDrafts;
  const abort = new AbortController();
  const cancel = () => abort.abort();
  dialog.addEventListener('close',cancel,{once:true});
  const timeout = setTimeout(cancel,120000);
  let translator;
  button.disabled = true;
  notice.textContent = t('Готовим перевод…','Preparing translation…');
  try {
    const {createDraftTranslator} = await import('./draft-translator.js?v=13');
    translator = await createDraftTranslator({sourceLanguage,targetLanguage,signal:abort.signal}, () => {
      if (current()) notice.textContent = t('Загружаем локальную модель (~32 МБ при первом запуске)…',
        'Loading the local model (~32 MB on first use)…');
    });
    if (!current()) return;
    notice.textContent = t('Переводим черновик…','Translating draft…');
    const translated = {};
    for (const field of localizedFields) {
      if (target[field].trim() || !source[field].trim()) continue;
      const groupName = field === 'region' || field === 'group'
        ? groupAliases.get($('#edit-kind').value + '|' + keyText(source[field])) : null;
      translated[field] = groupName ? groupName[targetLanguage === 'en' ? 1 : 0]
        : await translateWithFormatting(translator,source[field]);
      if (!current()) return;
    }
    drafts[editLanguage] = readEditorDraft();
    const other = drafts[targetLanguage];
    for (const [field,value] of Object.entries(translated)) {
      if (!other[field].trim()) other[field] = value;
    }
    editLanguage = targetLanguage;
    loadEditorDraft();
    notice.textContent = t('Проверь черновик перед сохранением. Характеристики можно заполнить вручную.',
      'Review the draft before saving. Enter the localized stat values manually.');
  } catch {
    if (current()) notice.textContent = t('Модель перевода не запустилась. Проверь соединение и попробуй ещё раз.',
      'The translation model could not start. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    dialog.removeEventListener('close',cancel);
    translator?.destroy();
    if (current()) button.disabled = false;
  }
}

async function translateWithFormatting(translator, text) {
  const parts = text.split(/(\[\[[^\]\n]+\]\]|\*\*|==|\r?\n)/);
  for (let i = 0; i < parts.length; i += 2) {
    const segment = parts[i];
    if (!segment.trim()) continue;
    const result = await translator.translate(segment.trim());
    parts[i] = (segment.match(/^\s*/)?.[0] ?? '') + result + (segment.match(/\s*$/)?.[0] ?? '');
  }
  return parts.join('');
}

function editorDraft(record, locale, kind) {
  const initial = record && originals.get(record.id);
  const hasRussian = record && record.baseLocale !== 'en';
  const hasEnglish = record && (record.en || english[record.id] || initial?.en || record.baseLocale === 'en');
  const item = (locale === 'ru' ? hasRussian : hasEnglish) && localizeRecord(record,locale);
  const draft = Object.fromEntries(localizedFields.map(field => [field,item?.[field] ?? '']));
  const shared = Object.entries(record?.stats ?? {}).filter(([key]) => numericStats.has(key));
  const stats = item?.stats ?? Object.fromEntries(shared);
  const ordered = kind === 'spell' ? [...new Set([...spellStatOrder,...Object.keys(stats)])] : Object.keys(stats);
  draft.stats = ordered.map(key => {
    const value = stats[key] ?? '';
    const field = statKey(key);
    const labels = Object.hasOwn(facetFields,field) && facetFields[field];
    const label = labels ? labels[locale === 'en' ? 1 : 0] : locale === language ? statLabel(key) : key;
    return label + ': ' + value;
  }).join('\n');
  return draft;
}

function readEditorDraft() {
  return Object.fromEntries([...localizedFields,'stats'].map(field => [field,$('#edit-' + field).value]));
}

function loadEditorDraft() {
  const draft = editDrafts[editLanguage];
  $('#edit-locale').value = editLanguage;
  for (const [key,value] of Object.entries(draft)) $('#edit-' + key).value = value;
}

function toggleRuleTopicField() {
  $('#edit-rule-topic-label').classList.toggle('hidden',$('#edit-kind').value !== 'rule');
}

function openEditor(id) {
  if (!gmUnlocked) return;
  editLanguage = language;
  const record = id && db.find(entry => entry.id === id);
  const topic = record ? topicOf(record) : selectedFacets.topic?.[0];
  const kind = (record && topic ? 'rule' : record?.kind) ?? (activeBench || VIEW_META[currentView].types?.[0] || 'разумные');
  initialDrafts = {en:editorDraft(record,'en',kind), ru:editorDraft(record,'ru',kind)};
  editDrafts = structuredClone(initialDrafts);
  editorRevision = archiveRevision;
  $('#edit-title').textContent = t(record ? 'Редактировать запись' : 'Новая запись');
  $('#edit-id').value = record?.id ?? '';
  $('#edit-kind').value = kind;
  $('#edit-rule-topic').value = topic || 'general';
  toggleRuleTopicField();
  loadEditorDraft();
  $('#translation-status').textContent = '';
  $('#translate-draft').disabled = false;
  $('#delete-button').classList.toggle('hidden', !record);
  $('#edit-dialog').showModal();
  $('#edit-name').focus();
}

function parseStats(value) {
  const stats = Object.create(null);
  for (const line of value.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const label = keyText(line.slice(0,colon));
    const stat = Object.keys(STAT_LABEL).find(key => [key,STAT_LABEL[key],t(STAT_LABEL[key])].some(name => keyText(name) === label));
    const key = stat ?? statKey(label).replace(/\s+/g,'_');
    stats[key] = cleanText(line.slice(colon + 1));
  }
  return stats;
}

function cleanDraft(draft, kind) {
  const fields = Object.fromEntries(localizedFields.map(field => [field,cleanText(draft[field],field === 'text' || field === 'description')]));
  const item = {...fields,stats:parseStats(draft.stats)};
  return kind === 'spell' ? normalizeSpellFields(item) : item;
}

async function saveEditor(event) {
  event.preventDefault();
  if (!gmUnlocked || writing) return;
  editDrafts[editLanguage] = readEditorDraft();
  const kind = $('#edit-kind').value;
  const ru = cleanDraft(editDrafts.ru,kind);
  const en = cleanDraft(editDrafts.en,kind);
  if (!ru.name && !en.name) return toast(t('Укажи название хотя бы на одном языке.', 'Enter a name in at least one language.'));
  const id = $('#edit-id').value || crypto.randomUUID();
  const old = db.find(record => record.id === id);
  const changed = locale => JSON.stringify(editDrafts[locale]) !== JSON.stringify(initialDrafts[locale]);
  const changedRu = changed('ru');
  const changedEn = changed('en');
  let item = {...old,id,kind};
  if (kind === 'rule') item.ruleTopic = $('#edit-rule-topic').value;
  else delete item.ruleTopic;
  if (!old || changedRu) {
    if (ru.name) {
      item = {...item,...ru};
      delete item.baseLocale;
    } else if (en.name) {
      item = {...item,...en,baseLocale:'en'};
    }
  }
  if ((!old || changedEn) && en.name) {
    if (item.baseLocale === 'en') item = {...item,...en};
    const sharedStats = {...item.stats};
    const originalStats = parseStats(initialDrafts.en.stats);
    for (const key of numericStats) {
      if (!old || originalStats[key] !== en.stats[key]) {
        if (Object.hasOwn(en.stats,key)) sharedStats[key] = en.stats[key];
        else if (!changedRu) delete sharedStats[key];
      }
      delete en.stats[key];
    }
    item.stats = sharedStats;
    item.en = en;
  } else if (changedEn && !en.name) {
    delete item.en;
  }
  const next = old ? db.map(record => record.id === id ? item : record) : [item,...db];
  if (!await saveArchive(next,editorRevision)) return;
  $('#edit-dialog').close();
  openRecord(id);
  toast('Запись сохранена для всех.');
}

async function deleteRecord(id) {
  if (!gmUnlocked || writing) return;
  const item = db.find(record => record.id === id);
  const name = item && localizeRecord(item)?.name;
  if (!item || !confirm(t(`Удалить «${name}» из общего архива?`, `Remove “${name}” from the shared archive?`))) return;
  const expected = $('#edit-dialog').open ? editorRevision : archiveRevision;
  if (!await saveArchive(db.filter(record => record.id !== id), expected)) return;
  selectedId = null;
  $('#edit-dialog').close();
  render();
  renderDetail(null);
  toast('Запись удалена из общего архива.');
}
function exportData(){const blob=new Blob([JSON.stringify({title:'Атлас Халлоунеста',version:1,exportedAt:new Date().toISOString(),entries:db},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='atlas-hallownest-backup.json';a.click();URL.revokeObjectURL(a.href);toast('Резервная копия скачана.');}
async function importData(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!gmUnlocked || !file || writing) return;
  const expected = archiveRevision;
  try {
    const parsed = JSON.parse(await file.text());
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(entries) || entries.some(entry => !entry?.id || !entry.name || !KIND_LABEL[entry.kind])) {
      throw new Error('Invalid backup');
    }
    if (!confirm(t(`Заменить общий архив? В копии ${entries.length} записей.`, `Replace the shared archive with these ${entries.length} entries?`))) return;
    if (!await saveArchive(entries, expected)) return;
    selectedId = null;
    render();
    renderDetail(null);
    toast('Резервная копия сохранена в общем архиве.');
  } catch {
    toast('Не получилось прочитать резервную копию.');
  }
}

async function resetData() {
  if (!gmUnlocked || writing || !defaults.length) return;
  if (!confirm(t('Вернуть исходную базу для всех игроков?'))) return;
  if (!await saveArchive(structuredClone(defaults))) return;
  selectedId = null;
  render();
  renderDetail(null);
  toast('Исходная база восстановлена для всех.');
}
function toast(message) {
  const notice = $('#toast');
  notice.textContent = t(message);
  notice.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => notice.classList.remove('show'), 2600);
}
boot();

