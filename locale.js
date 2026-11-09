const strings = {
  'Пути':'Paths', 'Путь':'Path', 'Умения':'Proficiencies', 'Умение':'Proficiency',
  'Боевые искусства':'Weapon Arts', 'Боевое искусство':'Weapon Art', 'Магия':'Magic', 'Черта':'Trait',
  'Врождённые особенности':'Innate Traits', 'Военные и мистические':'Martial and Mystic',
  'Навыки и мастерство':'Skills and Mastery', 'Приёмы и реакции':'Techniques and Reactions',
  'Тайны и ритуалы':'Arcana and Rituals', 'Поиск по Атласу':'Search the Atlas',
  'ВСЕ РАЗДЕЛЫ':'ALL SECTIONS', 'Все разделы':'All sections',
  'Режим ГМа': 'GM mode', 'ГМ · закрыть': 'Lock GM mode', 'подключаем архив': 'connecting to archive',
  'общий архив подключён': 'shared archive connected', 'нет связи с общим архивом': 'shared archive offline',
  'сохраняем записи': 'saving records', 'сохранено для всех': 'saved for everyone',
  'запись не сохранена': 'record not saved', 'Все': 'All', 'Все записи': 'All entries', 'Все заметки': 'All notes',
  'Разумные жуки': 'Sapient Bugs', 'Записки Дуэлянта': 'The Duelist’s Duelogue',
  'Дикие существа': 'Wild Creatures', 'Журнал Скальда': 'The Skald’s Journal',
  'Экипировка': 'Equipment', 'Оружие и амулеты': 'Weapons and Charms',
  'Состояния': 'Conditions', 'Сердца и эффекты': 'Hearts and Effects',
  'Памятка правил': 'Rules Reference', 'Броски и бой': 'Checks and Combat',
  'Бестиарий': 'Bestiary', 'Памятка': 'Reference',
  'АРХИВ ОБИТАТЕЛЕЙ': 'CREATURE ARCHIVE', 'СНАРЯЖЕНИЕ СТРАННИКА': 'TRAVELLER’S KIT',
  'ПОЛЕВЫЕ ЗАМЕТКИ': 'FIELD NOTES', 'КОРОТКИЙ СВОД ПРАВИЛ': 'QUICK RULES REFERENCE',
  'Разумный жук': 'Sapient bug', 'Дикое существо': 'Wild creature', 'Состояние': 'Condition', 'Запись': 'Entry',
  'Халлоунест': 'Hallownest', 'Без привязки': 'Unassigned', 'Черты': 'Traits', 'Источник': 'Source',
  'Описание и способности': 'Description and abilities', 'Как действует': 'How it works',
  'Заметки об экипировке': 'Equipment notes', 'добавлено Хранителем архива': 'Added by the archive keeper',
  'ИЗМЕНИТЬ': 'EDIT', 'Редактировать ✎': 'Edit ✎', 'Изменить запись': 'Edit entry',
  'Удалить': 'Delete', 'Следов не найдено': 'No entries found',
  'Попробуй другое слово или очисти фильтр.': 'Try another search or clear the filter.',
  'Открой запись': 'Open an entry', 'Выбери жука или заметку в списке, чтобы рассмотреть её поближе.': 'Select a creature or note to read its details.',
  'КЛИКНИ ПО ЛЮБОЙ КАРТОЧКЕ': 'SELECT AN ENTRY',
  'Размер': 'Size', 'Мощь': 'Might', 'Прон': 'Insight', 'Панц': 'Shell', 'Грац': 'Grace',
  'Сердца': 'Hearts', 'Души': 'Soul', 'Выносливость': 'Stamina', 'Скорость': 'Speed',
  'Жуть': 'Spook', 'Привлекательность': 'Cute', 'Голод': 'Hunger', 'Гео': 'Geo',
  'Качество': 'Quality', 'Вес': 'Bulk', 'Максимум': 'Maximum', 'Обычный': 'Common',
  'Необычный': 'Uncommon', 'Редкий': 'Rare', 'Уникальный': 'Unique',
  'Редактировать запись': 'Edit entry', 'Новая запись': 'New entry',
  'Архив уже изменился. Скопируй черновик и открой запись заново.': 'The archive changed. Copy your draft and reopen the entry.',
  'Сохранение не прошло. Изменения пока остались в форме.': 'Could not save. Your draft is still in the form.',
  'Редактор открыт. Сохранённые правки увидят все.': 'GM mode is open. Saved edits are visible to everyone.',
  'Пароль ГМа не подошёл.': 'The GM password did not match.',
  'Запрос к общему архиву не прошёл.': 'Could not connect to the shared archive.',
  'Режим ГМа закрыт.': 'GM mode locked.', 'добавлено ГМом': 'Added by the GM',
  'Запись сохранена для всех.': 'Entry saved for everyone.',
  'Запись удалена из общего архива.': 'Entry removed from the shared archive.',
  'Резервная копия скачана.': 'Backup downloaded.',
  'Резервная копия сохранена в общем архиве.': 'Backup restored to the shared archive.',
  'Не получилось прочитать резервную копию.': 'Could not read the backup.',
  'Вернуть исходную базу для всех игроков?': 'Restore the starting archive for all players?',
  'Исходная база восстановлена для всех.': 'Starting archive restored for everyone.'
};

export let language = localStorage.getItem('hallownest-language') === 'ru' ? 'ru' : 'en';
export function setLanguage(value) {
  language = value === 'ru' ? 'ru' : 'en';
  localStorage.setItem('hallownest-language', language);
}
export function t(russian, english = strings[russian]) {
  return language === 'en' ? english ?? russian : russian;
}

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\\([#*_!\[\]()=.|-])/g, '$1')
    .replace(/!\[[^\]\n]*\](?:\[[^\]\n]*\]|\([^\n]*?\))/g, '')
    .replace(/^\s*\[image\d+\]:[^\n]*$/gim, '')
    .replace(/\[(?:image\d+|artist(?:\s*:[^\]\n]*)?|artwork needed)\]/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\[([^\]\n]+)\](?:\((?:https?:\/\/|mailto:)[^)\n]+\)|\[[^\]\n]*\])/g, '$1')
    .replace(/^[ \t]*#{1,6}(?:[ \t]+|$)/gm, '')
    .replace(/^[ \t]*(?:[-—–_*]\s*){3,}$/gm, '')
    .replace(/^[ \t]*[*+-][ \t]+/gm, '• ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[\s(])([*_])([^*_\n]+)\2(?=$|[\s).,;:!?])/gm, '$1$3')
    .replace(/^\s*[*“"«]*(?:Цитата из бестиария|Bestiary quote|Notebook quote)[*”"»]*\s*$/gim, '')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*[_*]+\s*$/, '')
    .trim();
}

