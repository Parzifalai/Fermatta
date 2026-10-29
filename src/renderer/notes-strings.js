// Strings for the notes editor and sheet music.
import { addStrings } from './i18n.js';

addStrings({
  ru: {
    'notes.velocity': 'Сила', 'notes.grid': 'Сетка', 'notes.grid.off': 'Выкл', 'notes.bpm': 'Темп (ударов в минуту)', 'notes.bpmUnit': 'уд/мин',
    'notes.detect': 'Найти темп', 'notes.detect.hint': 'Определить темп и доли по вашей игре', 'notes.tempoFound': 'Темп: {bpm} ударов в минуту',
    'notes.tool.select': 'Выделение', 'notes.tool.draw': 'Карандаш', 'notes.tool.erase': 'Ластик',
    'notes.align': 'Выровнять', 'notes.align.sel': 'Выделено нот: {n}. Подвинем их к сетке.', 'notes.align.all': 'Подвинем все ноты к сетке. Неровности уйдут, а характер игры останется.',
    'notes.align.strength': 'Сила выравнивания', 'notes.align.live': 'живо', 'notes.align.exact': 'идеально ровно',
    'notes.align.steady': 'Ровность темпа', 'notes.align.rubato': 'как играли', 'notes.align.metronome': 'как метроном',
    'notes.align.ends': 'Выравнивать и концы нот', 'notes.align.do': 'Выровнять', 'notes.aligned': 'Ноты выровнены. Ctrl+Z — вернуть как было',
    'notes.toLeft': 'Выделенные ноты — левой рукой', 'notes.toRight': 'Выделенные ноты — правой рукой', 'notes.autoHands': 'Руки заново', 'notes.autoHands.hint': 'Заново угадать руки автоматически',
    'notes.selectFirst': 'Сначала выделите ноты', 'notes.sheet': 'Нотный стан',
    'notes.help': 'Карандаш (B) — рисовать, ластик (E) или правая кнопка — стирать, V — выделение. Колесо — вверх-вниз, Ctrl+колесо — масштаб, Shift+колесо — вбок. Alt+перетаскивание — копия. Q — выровнять.',
    'sheet.musicxml': 'MusicXML', 'sheet.pdf': 'PDF с нотами', 'sheet.making': 'Готовим ноты…',
  },
  en: {
    'notes.velocity': 'Velocity', 'notes.grid': 'Grid', 'notes.grid.off': 'Off', 'notes.bpm': 'Tempo (beats per minute)', 'notes.bpmUnit': 'bpm',
    'notes.detect': 'Find tempo', 'notes.detect.hint': 'Detect tempo and beats from your playing', 'notes.tempoFound': 'Tempo: {bpm} bpm',
    'notes.tool.select': 'Select', 'notes.tool.draw': 'Pencil', 'notes.tool.erase': 'Eraser',
    'notes.align': 'Align', 'notes.align.sel': '{n} notes selected. They will move toward the grid.', 'notes.align.all': 'All notes move toward the grid. Unevenness goes, your feel stays.',
    'notes.align.strength': 'Strength', 'notes.align.live': 'alive', 'notes.align.exact': 'perfectly even',
    'notes.align.steady': 'Steady tempo', 'notes.align.rubato': 'as played', 'notes.align.metronome': 'like a metronome',
    'notes.align.ends': 'Align note ends too', 'notes.align.do': 'Align', 'notes.aligned': 'Notes aligned. Ctrl+Z to undo',
    'notes.toLeft': 'Selected notes — left hand', 'notes.toRight': 'Selected notes — right hand', 'notes.autoHands': 'Re-guess hands', 'notes.autoHands.hint': 'Guess hands again automatically',
    'notes.selectFirst': 'Select some notes first', 'notes.sheet': 'Sheet music',
    'notes.help': 'Pencil (B) draws, eraser (E) or right button erases, V selects. Wheel scrolls, Ctrl+wheel zooms, Shift+wheel scrolls sideways. Alt+drag copies. Q aligns.',
    'sheet.musicxml': 'MusicXML', 'sheet.pdf': 'PDF sheet music', 'sheet.making': 'Preparing sheet music…',
  },
});
