// Interface strings, Russian and English.
const STR = {
  ru: {
    'pedal': 'Педаль', 'title.takes': 'Записи', 'title.sound': 'Звук', 'title.notes': 'Ноты', 'title.tiles': 'Падающие ноты', 'title.export': 'Экспорт',
    'theme.aurora': 'Аврора', 'theme.stage': 'Сцена', 'theme.switch': 'Тема «{name}»', 'settings.theme': 'Тема',
    'nav.takes': 'Записи', 'nav.sound': 'Звук', 'nav.notes': 'Ноты', 'nav.tiles': 'Плитки', 'nav.export': 'Экспорт',
    'midi.none': 'Пианино не подключено', 'midi.connected': '{name}', 'midi.hint': 'Подключите пианино кабелем USB — оно появится здесь само.',
    'rec.start': 'Записать', 'rec.stop': 'Остановить запись', 'rec.pause': 'Пауза', 'rec.resume': 'Продолжить', 'rec.waiting': 'Ждём первую ноту…', 'rec.recording': 'Идёт запись',
    'rec.saved': 'Запись «{name}» сохранена', 'rec.empty': 'Ни одной ноты — запись не сохранена', 'rec.paused': 'Запись на паузе',
    'punch.button': 'Дозаписать с {time}', 'punch.replace': 'Заменить', 'punch.overlay': 'Наложить', 'punch.end': 'Метку в конец',
    'punch.hintReplace': 'Старое после метки сотрётся, сыгранное запишется вместо него', 'punch.hintOverlay': 'Старое останется, новое ляжет поверх',
    'punch.listen': 'Слушайте, запись с {time}', 'punch.recording': 'Идёт дозапись', 'punch.empty': 'Ничего не сыграно, запись не изменилась',
    'punch.doneReplace': 'Дозаписано нот: {n}, старое после метки заменено', 'punch.doneOverlay': 'Наложено нот: {n}', 'punch.preroll': 'Вступление перед дозаписью', 'punch.sec': '{n} с',
    'play.play': 'Слушать', 'play.pause': 'Пауза', 'play.stop': 'Стоп',
    'take.untitled': 'Запись {n}', 'take.notes': '{n} нот', 'take.rename': 'Переименовать', 'take.duplicate': 'Сделать копию', 'take.delete': 'В корзину',
    'take.copyName': '{name} (копия)', 'take.deleted': '«{name}» в корзине', 'take.restore': 'Вернуть', 'take.restored': '«{name}» возвращена',
    'take.purge': 'Удалить навсегда', 'take.import': 'Открыть ноты', 'take.export': 'Сохранить…',
    'takes.empty.title': 'Здесь появятся ваши записи', 'takes.empty.body': 'Нажмите «Записать» или пробел и играйте на пианино. Пока вы играете, слышите свою Ямаху, а потом запись можно послушать дорогим роялем.',
    'takes.trash': 'Корзина', 'takes.back': 'Все записи', 'takes.trashEmpty': 'Корзина пуста',
    'takes.search': 'Найти запись',
    'sound.pianos': 'Рояль', 'sound.install': 'Скачать', 'sound.installing': 'Скачивается', 'sound.convert': 'Подготовка звуков', 'sound.unpack': 'Распаковка',
    'sound.use': 'Выбрать', 'sound.active': 'Звучит сейчас', 'sound.remove': 'Удалить с диска', 'sound.cancel': 'Отменить', 'sound.custom': 'Добавить свой рояль (.sfz)',
    'sound.loading': 'Загружаем рояль в память…', 'sound.needPiano': 'Сначала скачайте рояль — без него не на чем играть.',
    'sound.size': '{mb} МБ', 'sound.license': 'Лицензия: {l}',
    'sound.controls': 'Звучание', 'sound.volume': 'Громкость', 'sound.length': 'Длина звучания', 'sound.length.short': 'короче', 'sound.length.long': 'бесконечно',
    'sound.release': 'Затухание после отпускания', 'sound.hall': 'Зал', 'sound.hallMix': 'Сколько зала', 'sound.brightness': 'Яркость звука', 'sound.brightness.soft': 'бархатно', 'sound.brightness.bright': 'звонко',
    'sound.sensitivity': 'Сила игры', 'sound.sensitivity.even': 'ровнее', 'sound.sensitivity.expr': 'выразительнее',
    'sound.hands': 'Громкость рук', 'sound.left': 'Левая', 'sound.right': 'Правая', 'sound.transpose': 'Тональность', 'sound.tempo': 'Темп', 'sound.noise': 'Шумы механики',
    'sound.reset': 'Сбросить', 'sound.semitones': '{n} пт',
    'hall.none': 'Без зала', 'hall.room': 'Комната', 'hall.studio': 'Студия', 'hall.hall': 'Зал', 'hall.concert': 'Концертный зал', 'hall.cathedral': 'Собор',
    'settings.title': 'Настройки', 'settings.language': 'Язык', 'settings.midi': 'Пианино', 'settings.monitor': 'Играть звуком Fermatta во время игры',
    'settings.monitor.hint': 'Выключено: слышите Ямаху. Включено: компьютер сразу играет выбранным роялем (нужны наушники или колонки).',
    'settings.pedalStart': 'Начинать запись двойным нажатием педали', 'settings.folders': 'Папки', 'settings.library': 'Записи', 'settings.pianosDir': 'Рояли', 'settings.exportDir': 'Готовые файлы',
    'settings.change': 'Изменить', 'settings.hotkeys': 'Горячие клавиши', 'settings.hotkeys.hint': 'Нажмите на клавишу справа и затем новую комбинацию.', 'settings.hotkeys.press': 'Нажмите клавиши…',
    'settings.hotkeys.reset': 'Вернуть стандартные', 'settings.close': 'Готово', 'settings.about': 'О программе', 'about.text': 'Звуки роялей и модели принадлежат их авторам:',
    'hk.record': 'Начать / остановить запись', 'hk.recordAlt': 'Запись (с любого экрана)', 'hk.punch': 'Дозапись с метки', 'hk.pause': 'Пауза записи', 'hk.play': 'Слушать / пауза', 'hk.stop': 'Стоп',
    'hk.prev': 'Предыдущая запись', 'hk.next': 'Следующая запись', 'hk.back': 'Назад на 5 секунд', 'hk.fwd': 'Вперёд на 5 секунд', 'hk.delete': 'В корзину',
    'hk.rename': 'Переименовать', 'hk.duplicate': 'Сделать копию', 'hk.undo': 'Отменить', 'hk.redo': 'Вернуть', 'hk.export': 'Экспорт', 'hk.settings': 'Настройки',
    'export.title': 'Экспорт', 'export.audio': 'Звук', 'export.video': 'Видео', 'export.sheet': 'Ноты', 'export.mp3': 'MP3', 'export.wav': 'WAV без сжатия', 'export.flac': 'FLAC',
    'export.audio.desc': 'Ваша игра звуком выбранного рояля со всеми настройками звучания.', 'export.sheet.desc': 'Ноты для MuseScore, FL Studio и других программ.', 'export.video.desc': 'Падающие ноты с вашими цветами, фоном и эффектами.',
    'export.midi': 'MIDI-файл', 'export.musicxml': 'MusicXML (MuseScore)', 'export.pdf': 'PDF с нотами', 'export.rendering': 'Сохраняем…', 'export.done': 'Готово: {file}', 'export.show': 'Показать в папке',
    'export.pickTake': 'Выберите запись слева или на вкладке «Записи».', 'export.failed': 'Не получилось сохранить: {e}',
    'common.cancel': 'Отмена', 'common.ok': 'Готово', 'common.save': 'Сохранить', 'common.yes': 'Да', 'common.no': 'Нет', 'common.undo': 'Отменить',
    'err.noPiano': 'Рояль ещё не скачан', 'err.unsupported': 'Такой файл открыть нельзя', 'err.generic': 'Ошибка: {e}',
  },
  en: {
    'pedal': 'Pedal', 'title.takes': 'Takes', 'title.sound': 'Sound', 'title.notes': 'Notes', 'title.tiles': 'Falling notes', 'title.export': 'Export',
    'theme.aurora': 'Aurora', 'theme.stage': 'Stage', 'theme.switch': '{name} theme', 'settings.theme': 'Theme',
    'nav.takes': 'Takes', 'nav.sound': 'Sound', 'nav.notes': 'Notes', 'nav.tiles': 'Tiles', 'nav.export': 'Export',
    'midi.none': 'No piano connected', 'midi.connected': '{name}', 'midi.hint': 'Connect your piano with a USB cable — it will show up here.',
    'rec.start': 'Record', 'rec.stop': 'Stop recording', 'rec.pause': 'Pause', 'rec.resume': 'Resume', 'rec.waiting': 'Waiting for the first note…', 'rec.recording': 'Recording',
    'rec.saved': 'Saved “{name}”', 'rec.empty': 'No notes played — nothing saved', 'rec.paused': 'Recording paused',
    'punch.button': 'Punch in at {time}', 'punch.replace': 'Replace', 'punch.overlay': 'Overlay', 'punch.end': 'Mark at end',
    'punch.hintReplace': 'Everything after the mark is replaced by what you play', 'punch.hintOverlay': 'The old notes stay, the new ones go on top',
    'punch.listen': 'Listen, recording from {time}', 'punch.recording': 'Punching in', 'punch.empty': 'Nothing played, the take is unchanged',
    'punch.doneReplace': '{n} notes recorded, the rest after the mark replaced', 'punch.doneOverlay': '{n} notes added on top', 'punch.preroll': 'Lead-in before punch-in', 'punch.sec': '{n} s',
    'play.play': 'Listen', 'play.pause': 'Pause', 'play.stop': 'Stop',
    'take.untitled': 'Take {n}', 'take.notes': '{n} notes', 'take.rename': 'Rename', 'take.duplicate': 'Duplicate', 'take.delete': 'Move to trash',
    'take.copyName': '{name} (copy)', 'take.deleted': '“{name}” moved to trash', 'take.restore': 'Restore', 'take.restored': '“{name}” restored',
    'take.purge': 'Delete forever', 'take.import': 'Open notes', 'take.export': 'Save…',
    'takes.empty.title': 'Your takes will appear here', 'takes.empty.body': 'Press Record or Space and play. You hear your own piano while playing, then listen back on a concert grand.',
    'takes.trash': 'Trash', 'takes.back': 'All takes', 'takes.trashEmpty': 'Trash is empty',
    'takes.search': 'Find a take',
    'sound.pianos': 'Piano', 'sound.install': 'Download', 'sound.installing': 'Downloading', 'sound.convert': 'Preparing sounds', 'sound.unpack': 'Unpacking',
    'sound.use': 'Use', 'sound.active': 'Playing now', 'sound.remove': 'Remove from disk', 'sound.cancel': 'Cancel', 'sound.custom': 'Add your own piano (.sfz)',
    'sound.loading': 'Loading the piano into memory…', 'sound.needPiano': 'Download a piano first — there is nothing to play without one.',
    'sound.size': '{mb} MB', 'sound.license': 'License: {l}',
    'sound.controls': 'Tone', 'sound.volume': 'Volume', 'sound.length': 'Sustain length', 'sound.length.short': 'shorter', 'sound.length.long': 'endless',
    'sound.release': 'Fade after release', 'sound.hall': 'Hall', 'sound.hallMix': 'Amount of hall', 'sound.brightness': 'Brightness', 'sound.brightness.soft': 'velvet', 'sound.brightness.bright': 'bright',
    'sound.sensitivity': 'Touch', 'sound.sensitivity.even': 'even', 'sound.sensitivity.expr': 'expressive',
    'sound.hands': 'Hand volume', 'sound.left': 'Left', 'sound.right': 'Right', 'sound.transpose': 'Transpose', 'sound.tempo': 'Tempo', 'sound.noise': 'Mechanical noise',
    'sound.reset': 'Reset', 'sound.semitones': '{n} st',
    'hall.none': 'Dry', 'hall.room': 'Room', 'hall.studio': 'Studio', 'hall.hall': 'Hall', 'hall.concert': 'Concert hall', 'hall.cathedral': 'Cathedral',
    'settings.title': 'Settings', 'settings.language': 'Language', 'settings.midi': 'Piano', 'settings.monitor': 'Play Fermatta sound while I play',
    'settings.monitor.hint': 'Off: you hear your own piano. On: the computer plays the chosen grand right away (use headphones or speakers).',
    'settings.pedalStart': 'Start recording with a double pedal press', 'settings.folders': 'Folders', 'settings.library': 'Takes', 'settings.pianosDir': 'Pianos', 'settings.exportDir': 'Exports',
    'settings.change': 'Change', 'settings.hotkeys': 'Shortcuts', 'settings.hotkeys.hint': 'Click a shortcut, then press the new keys.', 'settings.hotkeys.press': 'Press keys…',
    'settings.hotkeys.reset': 'Restore defaults', 'settings.close': 'Done', 'settings.about': 'About', 'about.text': 'Piano sounds and models belong to their authors:',
    'hk.record': 'Start / stop recording', 'hk.recordAlt': 'Record (any screen)', 'hk.punch': 'Punch in from the mark', 'hk.pause': 'Pause recording', 'hk.play': 'Listen / pause', 'hk.stop': 'Stop',
    'hk.prev': 'Previous take', 'hk.next': 'Next take', 'hk.back': 'Back 5 seconds', 'hk.fwd': 'Forward 5 seconds', 'hk.delete': 'Move to trash',
    'hk.rename': 'Rename', 'hk.duplicate': 'Duplicate', 'hk.undo': 'Undo', 'hk.redo': 'Redo', 'hk.export': 'Export', 'hk.settings': 'Settings',
    'export.title': 'Export', 'export.audio': 'Audio', 'export.video': 'Video', 'export.sheet': 'Sheet music', 'export.mp3': 'MP3', 'export.wav': 'Uncompressed WAV', 'export.flac': 'FLAC',
    'export.audio.desc': 'Your playing on the chosen grand with all tone settings.', 'export.sheet.desc': 'Notes for MuseScore, FL Studio and other apps.', 'export.video.desc': 'Falling notes with your colours, background and effects.',
    'export.midi': 'MIDI file', 'export.musicxml': 'MusicXML (MuseScore)', 'export.pdf': 'PDF sheet music', 'export.rendering': 'Saving…', 'export.done': 'Saved: {file}', 'export.show': 'Show in folder',
    'export.pickTake': 'Pick a take on the left or on the Takes tab.', 'export.failed': 'Could not save: {e}',
    'common.cancel': 'Cancel', 'common.ok': 'Done', 'common.save': 'Save', 'common.yes': 'Yes', 'common.no': 'No', 'common.undo': 'Undo',
    'err.noPiano': 'The piano is not downloaded yet', 'err.unsupported': 'This file type cannot be opened', 'err.generic': 'Error: {e}',
  },
};

let lang = 'ru';
const extra = { ru: {}, en: {} };

export function setLang(l) { lang = STR[l] ? l : 'ru'; document.documentElement.lang = lang; }
export function getLang() { return lang; }
export function addStrings(map) { for (const l of Object.keys(map)) Object.assign(extra[l], map[l]); }

export function t(key, vars) {
  let s = extra[lang][key] ?? STR[lang][key] ?? extra.ru[key] ?? STR.ru[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

// Russian plural for counts: plural(5, ['нота','ноты','нот'])
export function plural(n, forms) {
  if (lang === 'en') return n === 1 ? forms[0] : forms[forms.length - 1];
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
