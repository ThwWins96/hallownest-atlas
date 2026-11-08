import {readArchive, writeArchive} from './archive-api.js';
const KIND_LABEL = {разумные:'Разумный жук',дикие:'Дикое существо',equipment:'Экипировка',state:'Состояние',rule:'Памятка'};
const STAT_LABEL = {size:'Размер',might:'Мощь',accuracy:'Прон',shell:'Панц',grace:'Грац',hearts:'Сердца',souls:'Души',stamina:'Выносливость',speed:'Скорость',dread:'Жуть',charm:'Привлекательность',hunger:'Голод',traits:'Черты',geo:'Гео',quality:'Качество',heavy:'Вес',max:'Максимум',обычный:'Обычный',необычный:'Необычный',редкий:'Редкий',уникальный:'Уникальный'};
const VIEW_META = {
  bestiary:{title:'Бестиарий',kicker:'АРХИВ ОБИТАТЕЛЕЙ',hero:'Там, где <em>замирает</em><br>свет фонаря',desc:'Атлас обитателей увядающего королевства. Имена, повадки и заметки для тех, кто не боится идти глубже.',types:['разумные','дикие']},
  equipment:{title:'Экипировка',kicker:'СНАРЯЖЕНИЕ СТРАННИКА',hero:'Всё, что <em>держит</em><br>тебя в пути',desc:'Оружие, защита, амулеты и Гео. Собери снаряжение перед тем, как спуститься в старые тоннели.',types:['equipment']},
  states:{title:'Состояния',kicker:'ПОЛЕВЫЕ ЗАМЕТКИ',hero:'Сердце бьётся.<br><em>Путь продолжается.</em>',desc:'Состояния, опасности и краткие напоминания для боя и отдыха. Точные формулировки сверяй с книгой правил.',types:['state']},
  rules:{title:'Памятка',kicker:'КОРОТКИЙ СВОД ПРАВИЛ',hero:'Шесть граней.<br><em>Один шанс.</em>',desc:'Основные ориентиры для бросков и сражения, чтобы быстрее вернуться к истории.',types:['rule']}
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
const keyStorage = 'hallownest-editor-key';
const linkedKey = new URLSearchParams(location.hash.slice(1)).get('gm-key');
if (linkedKey && /^[a-f0-9]{64}$/.test(linkedKey)) {
  localStorage.setItem(keyStorage, linkedKey);
  history.replaceState(null, '', location.pathname + location.search);
}

const benches = [
  ['bestiary', 'разумные', 'Разумные жуки', 'Записки Дуэлянта'],
  ['bestiary', 'дикие', 'Дикие существа', 'Журнал Скальда'],
  ['equipment', '', 'Экипировка', 'Оружие и амулеты'],
  ['states', '', 'Состояния', 'Сердца и эффекты'],
  ['rules', '', 'Памятка правил', 'Броски и бой']
];

function mountHall() {
  $('#benches').innerHTML = benches.map(([view, kind, title, subtitle], i) => `
    <button class="bench-choice" data-bench="${i}" type="button" aria-pressed="false">
      <span class="bench-stage">
        <svg class="bench-drawing" aria-hidden="true"><use href="./symbols.svg#bench"/></svg>
        <svg class="bench-bug" aria-hidden="true"><use href="./symbols.svg#bug"/></svg>
      </span>
      <strong>${title}</strong><small>${subtitle}</small>
    </button>`).join('');
  $('#benches').querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      clearTimeout(benchTimer);
      $('#benches').querySelectorAll('button').forEach(other =>
        other.setAttribute('aria-pressed', String(other === button)));
      const [view, kind] = benches[Number(button.dataset.bench)];
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      benchTimer = setTimeout(() => showView(view, kind), reducedMotion ? 0 : 560);
    };
  });
  $('.bloom-drift').innerHTML = Array.from({length: 13}, (_, i) =>
    `<span style="--x:${(i * 29 + 3) % 100}%;--size:${17 + (i * 7) % 23}px;--duration:${17 + i % 8}s;--delay:-${i * 2.9}s"></span>`).join('');
}

function showView(view, kind = '') {
  clearTimeout(benchTimer);
  currentView = view;
  activeBench = kind;
  activeFilter = 'Все';
  selectedId = null;
  $('#search').value = '';
  $('#workspace').classList.remove('hidden');
  render();
  renderDetail(null);
  $('#section-title').focus({preventScroll: true});
  $('#workspace').scrollIntoView({block: 'start'});
}

function setArchiveStatus(message) {
  $('#save-status').textContent = message;
}

async function boot() {
  mountHall();
  wire();
  const backups = Promise.all(['intelligent', 'wild', 'reference'].map(name =>
    fetch(`./data/${name}.json`).then(response => response.json())
  )).then(([intelligent, wild, reference]) => {
    defaults = [...intelligent, ...wild, ...reference.equipment];
    if (archiveRevision === null) db = defaults;
    render();
  }).catch(() => {});
  await Promise.all([backups, refreshArchive()]);
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

function typeRecords(){return db.filter(x=>VIEW_META[currentView].types.includes(x.kind) && (!activeBench || x.kind === activeBench));}
function filteredRecords(){const q=$('#search').value.trim().toLocaleLowerCase('ru');return typeRecords().filter(x=>(activeFilter==='Все'||x.region===activeFilter||x.group===activeFilter)&&(!q||[x.name,x.description,x.region,x.group,x.text,...Object.values(x.stats||{})].join(' ').toLocaleLowerCase('ru').includes(q)));}
function regionsForView(){return [...new Set(typeRecords().map(x=>x.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));}
function render(){renderHero();document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));renderNav();renderFilters();renderList();renderCount();}
function renderHero(){const m=VIEW_META[currentView];$('#hero-title').innerHTML=m.hero;$('#hero-description').textContent=m.desc;$('#hero-eyebrow').textContent=`ПОЛЕВОЙ СПРАВОЧНИК · ${String(Object.keys(VIEW_META).indexOf(currentView)+1).padStart(2,'0')}`;$('#section-title').textContent=benches.find(([v,k])=>v===currentView&&k&&k===activeBench)?.[2]||m.title;$('#section-kicker').textContent=m.kicker;}
function renderNav(){const counts={};for(const r of typeRecords())counts[r.region]=(counts[r.region]||0)+1;const items=['Все',...regionsForView()];$('#side-nav').innerHTML=items.map((x,i)=>`<button class="${activeFilter===x?'active':''}" data-filter="${esc(x)}"><span>${esc(x==='Все'?(currentView==='bestiary'?'Все записи':'Все заметки'):x)}</span><span>${i===0?typeRecords().length:counts[x]}</span></button>`).join('');$('#side-nav').querySelectorAll('button').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;selectedId=null;render();renderDetail(null);});}
function renderFilters(){const groups=[...new Set(typeRecords().map(x=>x.group).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));const options=['Все',...groups];$('#filters').innerHTML=options.map(x=>`<button class="filter-chip ${activeFilter===x?'active':''}" data-filter="${esc(x)}">${esc(x)}</button>`).join('');$('#filters').querySelectorAll('button').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;selectedId=null;render();renderDetail(null);});}
function statPairs(item){const s=item.stats||{};return STAT_ORDER.filter(k=>s[k]!==undefined&&s[k]!==''&&k!=='traits').slice(0,6).map(k=>[STAT_LABEL[k]||k,s[k]]);}
function renderList(){const list=filteredRecords();$('#record-list').innerHTML=list.length?list.map(item=>{
  const stats=statPairs(item).slice(0,4).map(([k,v])=>`<span class="stat-pill">${esc(k)} ${esc(v)}</span>`).join('');
  return `<article class="record-card ${item.id===selectedId?'selected':''}" tabindex="0" role="button" data-id="${esc(item.id)}"><div class="card-top"><div><div class="card-name">${esc(item.name)}</div><div class="card-region">${esc(item.region||'Без привязки')}</div></div><span class="kind-mark ${item.kind==='дикие'?'wild':''}">${esc(KIND_LABEL[item.kind]||'Запись')}</span></div>${item.description?`<p class="card-description">${esc(item.description)}</p>`:''}${stats?`<div class="stat-line">${stats}</div>`:''}${item.stats?.traits?`<div class="card-traits">${esc(item.stats.traits)}</div>`:''}${gmUnlocked?'<button class="edit-mini" data-edit="'+esc(item.id)+'">ИЗМЕНИТЬ</button>':''}</article>`;
 }).join(''):`<div class="empty-results"><b>Следов не найдено</b><span>Попробуй другое слово или очисти фильтр.</span></div>`;
  $('#record-list').querySelectorAll('.record-card').forEach(card=>{card.onclick=e=>{if(e.target.closest('[data-edit]'))return;selectedId=card.dataset.id;renderList();renderDetail(selectedId);};card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectedId=card.dataset.id;renderList();renderDetail(selectedId);}};});
  $('#record-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openEditor(b.dataset.edit);});
}
function renderCount(){const n=typeRecords().length;$('#record-count').textContent=currentView==='bestiary'?`${db.filter(x=>x.kind==='разумные').length} разумных · ${db.filter(x=>x.kind==='дикие').length} диких записей`:`${n} ${n===1?'запись':'записей'} в разделе`;}
function splitTraits(item){return String(item.stats?.traits||'').split(/[,;•]/).map(x=>x.trim()).filter(Boolean);}
function renderDetail(id){const item=db.find(x=>x.id===id);if(!item){$('#detail-panel').innerHTML='<div class="detail-empty"><div class="empty-symbol">✳</div><h3>Открой запись</h3><p>Выбери жука или заметку в списке, чтобы рассмотреть её поближе.</p><span>КЛИКНИ ПО ЛЮБОЙ КАРТОЧКЕ</span></div>';return;}
  const stats=statPairs(item).map(([k,v])=>`<div class="detail-stat"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('');const tags=splitTraits(item);const text=String(item.text||'').trim();
  $('#detail-panel').innerHTML=`<div class="detail-content"><div class="detail-topline"><span class="detail-kind">${esc(KIND_LABEL[item.kind]||'Запись')}</span>${gmUnlocked?`<button class="text-button" data-detail-edit="${esc(item.id)}">Редактировать ✎</button>`:''}</div><div class="detail-region">${esc(item.region||'Халлоунест')}${item.group?' · '+esc(item.group):''}</div><h3 class="detail-title">${esc(item.name)}</h3>${item.description?`<p class="detail-description">${esc(item.description)}</p>`:''}${stats?`<div class="detail-stats">${stats}</div>`:''}${tags.length?`<div class="detail-traits"><div class="detail-label">Черты</div><div class="trait-tags">${tags.map(t=>`<span class="trait-tag">${esc(t)}</span>`).join('')}</div></div>`:''}${text?`<div class="detail-body"><h4>${item.kind==='equipment'?'Заметки об экипировке':item.kind==='state'?'Как действует':'Описание и способности'}</h4><p>${esc(text)}</p></div>`:''}<div class="detail-source">Источник: ${esc(item.source||'добавлено Хранителем архива')}</div>${gmUnlocked?`<div class="detail-actions"><button data-detail-edit="${esc(item.id)}">Изменить запись</button><button data-detail-delete="${esc(item.id)}">Удалить</button></div>`:''}</div>`;
  $('#detail-panel').querySelectorAll('[data-detail-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.detailEdit));$('#detail-panel').querySelectorAll('[data-detail-delete]').forEach(b=>b.onclick=()=>deleteRecord(b.dataset.detailDelete));
}
function wire(){
  document.querySelectorAll('.nav-link').forEach(button => {
    button.onclick = () => {
      $('#benches').querySelectorAll('button').forEach(bench => bench.setAttribute('aria-pressed', 'false'));
      showView(button.dataset.view);
    };
  });
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
    const key = localStorage.getItem(keyStorage);
    const password = $('#gm-password').value;
    const error = $('#login-error');
    error.classList.add('hidden');
    try {
      if (!key) throw new Error('Сначала открой личную ссылку ГМа на этом устройстве.');
      const credential = password + ':' + key;
      await writeArchive(credential);
      editorCredential = credential;
      gmUnlocked = true;
      $('#login-dialog').close();
      $('#gm-password').value = '';
      $('#gm-toggle').classList.add('unlocked');
      $('#gm-label').textContent = 'ГМ · закрыть';
      $('#gm-tools').classList.remove('hidden');
      if ($('#workspace').classList.contains('hidden')) showView('bestiary');
      renderList();
      renderDetail(selectedId);
      void refreshArchive();
      toast('Редактор открыт. Сохранённые правки увидят все.');
    } catch (failure) {
      error.textContent = failure.status === 401 || failure.status === 403
        ? 'Код или ключ ГМа не подошёл.'
        : failure.message;
      error.classList.remove('hidden');
    } finally {
      if (button) button.disabled = false;
    }
  };
  $('#login-dialog').addEventListener('click',e=>{if(e.target===$('#login-dialog'))$('#login-dialog').close();});
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#edit-dialog').close());
  $('#edit-form').onsubmit=saveEditor;$('#add-button').onclick=()=>openEditor(null);$('#delete-button').onclick=()=>deleteRecord($('#edit-id').value);
  $('#export-button').onclick=exportData;$('#import-file').onchange=importData;$('#reset-button').onclick=resetData;
  document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA'){e.preventDefault();$('#search').focus();}if(e.key==='Escape'&&$('#edit-dialog').open)$('#edit-dialog').close();});
}
function lockGM(){gmUnlocked=false;editorCredential='';$('#gm-toggle').classList.remove('unlocked');$('#gm-label').textContent='Режим ГМа';$('#gm-tools').classList.add('hidden');renderList();renderDetail(selectedId);toast('Режим ГМа закрыт.');}
function openEditor(id){if(!gmUnlocked)return;const item=id?db.find(x=>x.id===id):null;editorRevision=archiveRevision;$('#edit-title').textContent=item?'Редактировать запись':'Новая запись';$('#edit-id').value=item?.id||'';$('#edit-name').value=item?.name||'';$('#edit-kind').value=item?.kind||({equipment:'equipment',states:'state',rules:'rule'}[currentView]||activeBench||'разумные');$('#edit-region').value=item?.region||'';$('#edit-group').value=item?.group||'';$('#edit-description').value=item?.description||'';$('#edit-text').value=item?.text||'';$('#edit-source').value=item?.source||'';$('#edit-stats').value=Object.entries(item?.stats||{}).map(([k,v])=>`${STAT_LABEL[k]||k}: ${v}`).join('\n');$('#delete-button').classList.toggle('hidden',!item);$('#edit-dialog').showModal();setTimeout(()=>$('#edit-name').focus(),50);}
function parseStats(value){const out={};for(const line of value.split(/\r?\n/)){const i=line.indexOf(':');if(i>0){const label=line.slice(0,i).trim();const key=Object.keys(STAT_LABEL).find(k=>STAT_LABEL[k].toLocaleLowerCase('ru')===label.toLocaleLowerCase('ru'))||label.toLocaleLowerCase('ru').replace(/\s+/g,'_');out[key]=line.slice(i+1).trim();}}return out;}
async function saveEditor(event) {
  event.preventDefault();
  if (!gmUnlocked || writing) return;
  const id = $('#edit-id').value || crypto.randomUUID();
  const item = {
    id,
    name: $('#edit-name').value.trim(),
    kind: $('#edit-kind').value,
    region: $('#edit-region').value.trim() || 'Халлоунест',
    group: $('#edit-group').value.trim(),
    description: $('#edit-description').value.trim(),
    stats: parseStats($('#edit-stats').value),
    text: $('#edit-text').value.trim(),
    source: $('#edit-source').value.trim() || 'добавлено ГМом'
  };
  if (!item.name) return;
  const exists = db.some(record => record.id === id);
  const next = exists ? db.map(record => record.id === id ? item : record) : [item, ...db];
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
  if (!item || !confirm(`Удалить «${item.name}» из общего архива?`)) return;
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
    if (!confirm(`Заменить общий архив? В копии ${entries.length} записей.`)) return;
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
  if (!confirm('Вернуть исходную базу для всех игроков?')) return;
  if (!await saveArchive(structuredClone(defaults))) return;
  selectedId = null;
  activeFilter = 'Все';
  render();
  renderDetail(null);
  toast('Исходная база восстановлена для всех.');
}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600);}
boot();
