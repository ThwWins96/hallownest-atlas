import {readArchive, writeArchive} from './archive-api.js';
import {language, setLanguage, t, cleanText} from './locale.js?v=5';

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
let db=[];let defaults=[];let currentView='bestiary';let activeFilter='Все';let selectedId=null;let gmUnlocked=false;let toastTimer;
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
      <strong>${t(title)}</strong><small>${t(subtitle)}</small>
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

function createBloomParticle(type, index) {
  const particle = document.createElement('span');
  const flower = type === 'flower';
  const size = flower ? 17 + (index * 7) % 23 : 2 + (index * 3) % 5;
  const duration = flower ? 11 + (size - 17) * 0.65 : 13 + (index * 5) % 14;
  const phase = ((index * 43 + (flower ? 18 : 31)) % 101) / 101;
  particle.className = flower ? 'bloom-flower' : 'bloom-light';
  particle.style.setProperty('--x', (index * 29 + (flower ? 3 : 19)) % 100 + '%');
  particle.style.setProperty('--size', size + 'px');
  particle.style.setProperty('--duration', duration + 's');
  particle.style.setProperty('--delay', -duration * phase + 's');
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
  layer.append(...Array.from({length: 22}, (_, index) => createBloomParticle('light', index)));

  const flowers = [];
  function updateCount() {
    const count = slider.valueAsNumber;
    while (flowers.length > count) flowers.pop().remove();
    while (flowers.length < count) {
      const flower = createBloomParticle('flower', flowers.length);
      flowers.push(flower);
      layer.append(flower);
    }
    $('#flower-count-value').value = String(count);
  }
  slider.addEventListener('input', updateCount);
  slider.addEventListener('change', () => localStorage.setItem(storageKey, slider.value));
  updateCount();
}

function showView(view, kind = '', query = '') {
  clearTimeout(benchTimer);
  currentView = view;
  activeBench = kind;
  activeFilter = 'Все';
  selectedId = null;
  $('#search').value = query;
  $('#workspace').classList.remove('hidden');
  render();
  renderDetail(null);
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
    ['.side-section-label', 'УКАЗАТЕЛЬ', 'INDEX'],
    ['.side-note p', '«В темноте всякий путь начинается с имени»', '“In the dark, every path begins with a name.”'],
    ['.side-note small', '— запись на полях', '— a note in the margins'],
    ['.source-note', 'ИСТОЧНИКИ', 'SOURCES'],
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
    ['label:has(#edit-text)', 'ЧЕРТЫ, СПОСОБНОСТИ И ПОЛНЫЙ ТЕКСТ', 'TRAITS, ABILITIES AND FULL TEXT'],
    ['label:has(#edit-source)', 'ИСТОЧНИК / ПРИМЕЧАНИЕ', 'SOURCE / NOTE'],
    ['#delete-button', 'Удалить запись', 'Delete entry'],
    ['#edit-dialog .secondary-button', 'Отмена', 'Cancel'],
    ['#edit-dialog .primary-button', 'Сохранить запись ', 'Save entry ']
  ];
  for (const [selector, russian, english] of labels) {
    $(selector).firstChild.textContent = t(russian, english);
  }
  $('.source-note span').replaceChildren(
    t('Правила HKRPG v1.7', 'HKRPG Rulebook v1.0.15'), document.createElement('br'),
    t('Журнал Скальда'), document.createElement('br'), t('Записки Дуэлянта'));
  const editKind = $('#edit-kind');
  const selectedKind = editKind.value;
  editKind.replaceChildren(...benches.map(([,kind,title]) => new Option(t(title), kind)));
  if (selectedKind) editKind.value = selectedKind;
  $('#gm-label').textContent = t(gmUnlocked ? 'ГМ · закрыть' : 'Режим ГМа');
  setArchiveStatus(archiveStatus);
  mountHall();
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
  render();
  renderDetail(selectedId);
  await refreshArchive();
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

function localizeRecord(record, locale = language) {
  const initial = originals.get(record.id);
  const translation = english[record.id];
  const personal = record.en;
  const result = {...record};
  for (const field of localizedFields) {
    const original = record[field] ?? '';
    const unchanged = initial && original === (initial[field] ?? '');
    const russian = field === 'region' && unchanged ? translation?.repairRegion ?? original : original;
    const fallback = locale === 'en' && unchanged ? translation?.[field] ?? russian : russian;
    result[field] = cleanText(locale === 'en' ? personal?.[field] ?? fallback : russian);
  }
  if (!result.name && translation?.repairName) result.name = translation.repairName;
  if (!result.name && record.id === 'дикие-26' && !result.text) return null;
  if (!result.name) result.name = locale === 'en' ? 'Untitled entry' : 'Запись без названия';
  const stats = record.stats ?? {};
  result.stats = {};
  for (const key of new Set([...Object.keys(stats), ...Object.keys(personal?.stats ?? {})])) {
    const value = stats[key];
    if (locale === 'ru' && value === undefined) continue;
    const translated = value === initial?.stats?.[key] && !numericStats.has(key)
      ? translation?.stats?.[key] : undefined;
    const candidate = locale === 'en' && !numericStats.has(key)
      ? personal?.stats?.[key] ?? translated ?? String(value ?? '').replace(/Гео/g, 'Geo')
      : value;
    if (candidate !== undefined) result.stats[key] = cleanText(candidate);
  }
  return result;
}

function typeRecords() {
  return db.filter(record => currentView === 'search'
    || (VIEW_META[currentView].types.includes(record.kind) && (!activeBench || record.kind === activeBench)))
    .map(record => localizeRecord(record)).filter(Boolean);
}

function normalizeQuery(value) {
  return String(value).normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function searchAtlas(query) {
  const words = normalizeQuery(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const kindFilter = activeFilter === 'Все' ? null : activeFilter;
  const results = [];
  for (const record of db) {
    if (kindFilter && record.kind !== kindFilter) continue;
    const item = localizeRecord(record);
    if (!item) continue;
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
  if (currentView === 'search') return searchAtlas($('#search').value);
  const query = $('#search').value.trim().toLocaleLowerCase(language);
  return typeRecords().filter(record =>
    (activeFilter === 'Все' || record.region === activeFilter || record.group === activeFilter)
    && (!query || [record.name, record.description, record.region, record.group, record.text, ...Object.values(record.stats)]
      .join(' ').toLocaleLowerCase(language).includes(query)));
}
function regionsForView() {
  return [...new Set(typeRecords().map(record => record.region).filter(Boolean))].sort((a,b) => a.localeCompare(b, language));
}
function render() {
  const meta = VIEW_META[currentView];
  const bench = benches.find(([view,kind]) => view === currentView && kind && kind === activeBench);
  $('#section-title').textContent = t(bench?.[2] ?? meta.title);
  $('#section-kicker').textContent = t(meta.kicker);
  renderNav();
  renderFilters();
  renderList();
}
function renderNav() {
  const records = typeRecords();
  const searching = currentView === 'search';
  const counts = new Map();
  for (const record of records) {
    const key = searching ? record.kind : record.region;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const options = searching ? benches.map(([,kind,title]) => [kind,t(title)])
    : regionsForView().map(region => [region,region]);
  options.unshift(['Все', t(searching ? 'Все разделы' : 'Все записи')]);
  $('#side-nav').innerHTML = options.map(([key,label]) =>
    `<button class="${activeFilter===key?'active':''}" data-filter="${esc(key)}"><span>${esc(label)}</span><span>${key === 'Все' ? records.length : counts.get(key) ?? 0}</span></button>`).join('');
  $('#side-nav').querySelectorAll('button').forEach(button => {
    button.onclick = () => { activeFilter = button.dataset.filter; selectedId = null; render(); renderDetail(null); };
  });
}

function renderFilters() {
  const records = typeRecords();
  if (currentView === 'search' || records.every(record => !record.group || record.group === record.region)) {
    $('#filters').replaceChildren();
    return;
  }
  const groups = [...new Set(records.map(record => record.group).filter(Boolean))].sort((a,b) => a.localeCompare(b,language));
  $('#filters').innerHTML = ['Все', ...groups].map(group =>
    `<button class="filter-chip ${activeFilter===group?'active':''}" data-filter="${esc(group)}">${esc(group==='Все'?t(group):group)}</button>`).join('');
  $('#filters').querySelectorAll('button').forEach(button => {
    button.onclick = () => { activeFilter = button.dataset.filter; selectedId = null; render(); renderDetail(null); };
  });
}
function statPairs(item) {
  const stats = item.stats ?? {};
  return [...new Set([...STAT_ORDER, ...Object.keys(stats)])]
    .filter(key => stats[key] !== undefined && stats[key] !== '' && key !== 'traits')
    .map(key => [t(STAT_LABEL[key] ?? key), stats[key]]);
}
function renderList(){const list=filteredRecords();
  if (currentView === 'search') {
    $('#section-kicker').textContent = t(`НАЙДЕНО: ${list.length}`, `RESULTS: ${list.length}`);
  }
  $('#record-list').innerHTML=list.length?list.map(item=>{
  const stats=statPairs(item).slice(0,4).map(([k,v])=>`<span class="stat-pill">${esc(k)} ${esc(v)}</span>`).join('');
  return `<article class="record-card ${item.id===selectedId?'selected':''}" tabindex="0" role="button" data-id="${esc(item.id)}"><div class="card-top"><div><div class="card-name">${esc(item.name)}</div><div class="card-region">${esc(item.region||t('Без привязки'))}</div></div><span class="kind-mark ${item.kind==='дикие'?'wild':''}">${esc(t(KIND_LABEL[item.kind]||'Запись'))}</span></div>${item.description?`<p class="card-description">${esc(item.description)}</p>`:''}${stats?`<div class="stat-line">${stats}</div>`:''}${item.stats?.traits?`<div class="card-traits">${esc(item.stats.traits)}</div>`:''}${gmUnlocked?'<button class="edit-mini" data-edit="'+esc(item.id)+'">' + t('ИЗМЕНИТЬ') + '</button>':''}</article>`;
 }).join(''):`<div class="empty-results"><b>${t('Следов не найдено')}</b><span>${t('Попробуй другое слово или очисти фильтр.')}</span></div>`;
  $('#record-list').querySelectorAll('.record-card').forEach(card=>{card.onclick=e=>{if(e.target.closest('[data-edit]'))return;selectedId=card.dataset.id;renderList();renderDetail(selectedId);};card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectedId=card.dataset.id;renderList();renderDetail(selectedId);}};});
  $('#record-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openEditor(b.dataset.edit);});
}
function splitTraits(item){return String(item.stats?.traits||'').split(/[,;•]/).map(x=>x.trim()).filter(Boolean);}
function renderDetail(id){const raw=db.find(x=>x.id===id);const item=raw&&localizeRecord(raw);if(!item){$('#detail-panel').innerHTML=`<div class="detail-empty"><div class="empty-symbol">✳</div><h3>${t('Открой запись')}</h3><p>${t('Выбери жука или заметку в списке, чтобы рассмотреть её поближе.')}</p><span>${t('КЛИКНИ ПО ЛЮБОЙ КАРТОЧКЕ')}</span></div>`;return;}
  const stats=statPairs(item).map(([k,v])=>`<div class="detail-stat"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('');const tags=splitTraits(item);const text=String(item.text||'').trim();
  $('#detail-panel').innerHTML=`<div class="detail-content"><div class="detail-topline"><span class="detail-kind">${esc(t(KIND_LABEL[item.kind]||'Запись'))}</span>${gmUnlocked?`<button class="text-button" data-detail-edit="${esc(item.id)}">${t('Редактировать ✎')}</button>`:''}</div><div class="detail-region">${esc(item.region||t('Халлоунест'))}${item.group?' · '+esc(item.group):''}</div><h3 class="detail-title">${esc(item.name)}</h3>${item.description?`<p class="detail-description">${esc(item.description)}</p>`:''}${stats?`<div class="detail-stats">${stats}</div>`:''}${tags.length?`<div class="detail-traits"><div class="detail-label">${t('Черты')}</div><div class="trait-tags">${tags.map(t=>`<span class="trait-tag">${esc(t)}</span>`).join('')}</div></div>`:''}${text?`<div class="detail-body"><h4>${t(item.kind==='equipment'?'Заметки об экипировке':item.kind==='state'?'Как действует':'Описание и способности')}</h4><p>${esc(text)}</p></div>`:''}<div class="detail-source">${t('Источник')}: ${esc(item.source||t('добавлено Хранителем архива'))}</div>${gmUnlocked?`<div class="detail-actions"><button data-detail-edit="${esc(item.id)}">${t('Изменить запись')}</button><button data-detail-delete="${esc(item.id)}">${t('Удалить')}</button></div>`:''}</div>`;
  $('#detail-panel').querySelectorAll('[data-detail-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.detailEdit));$('#detail-panel').querySelectorAll('[data-detail-delete]').forEach(b=>b.onclick=()=>deleteRecord(b.dataset.detailDelete));
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
    activeFilter = 'Все';
    if (currentView !== 'search') $('#search').value = '';
    applyLanguage();
    render();
    renderDetail(selectedId);
  };
  $('.brand').onclick = event => {
    event.preventDefault();
    clearTimeout(benchTimer);
    $('#workspace').classList.add('hidden');
    $('#bench-hall').scrollIntoView({block: 'start'});
  };
  $('#search').oninput = () => {
    selectedId = null;
    renderList();
    renderDetail(null);
  };
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
function openEditor(id) {
  if (!gmUnlocked) return;
  editLanguage = language;
  const original = id && db.find(record => record.id === id);
  const item = original && localizeRecord(original);
  editorRevision = archiveRevision;
  $('#edit-title').textContent = t(item ? 'Редактировать запись' : 'Новая запись')
    + (item ? ' · ' + editLanguage.toUpperCase() : '');
  $('#edit-id').value = item?.id ?? '';
  $('#edit-kind').value = item?.kind ?? (activeBench || VIEW_META[currentView].types?.[0] || 'разумные');
  for (const field of localizedFields) $('#edit-' + field).value = item?.[field] ?? '';
  $('#edit-stats').value = Object.entries(item?.stats ?? {})
    .map(([key, value]) => `${t(STAT_LABEL[key] ?? key)}: ${value}`).join('\n');
  $('#delete-button').classList.toggle('hidden', !item);
  $('#edit-dialog').showModal();
  $('#edit-name').focus();
}

function parseStats(value) {
  const stats = {};
  for (const line of value.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const label = line.slice(0, colon).trim().toLocaleLowerCase(editLanguage);
    const key = Object.keys(STAT_LABEL).find(key =>
      t(STAT_LABEL[key]).toLocaleLowerCase(editLanguage) === label) ?? label.replace(/\s+/g, '_');
    stats[key] = cleanText(line.slice(colon + 1));
  }
  return stats;
}
async function saveEditor(event) {
  event.preventDefault();
  if (!gmUnlocked || writing) return;
  const id = $('#edit-id').value || crypto.randomUUID();
  const fields = Object.fromEntries(localizedFields.map(field =>
    [field, cleanText($('#edit-' + field).value)]));
  const stats = parseStats($('#edit-stats').value);
  const kind = $('#edit-kind').value;
  if (!fields.name) return;
  const old = db.find(record => record.id === id);
  let item = {...old, id, kind, ...fields, stats};
  if (editLanguage === 'en' && old) {
    const sharedStats = {...old.stats};
    for (const key of numericStats) {
      if (Object.hasOwn(stats, key)) sharedStats[key] = stats[key];
      else delete sharedStats[key];
      delete stats[key];
    }
    item = {...old, id, kind, stats: sharedStats, en: {...fields, stats}};
  }
  const next = old ? db.map(record => record.id === id ? item : record) : [item, ...db];
  if (!await saveArchive(next, editorRevision)) return;
  $('#edit-dialog').close();
  selectedId = id;
  activeFilter = 'Все';
  render();
  renderDetail(id);
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
    activeFilter = 'Все';
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
  activeFilter = 'Все';
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


