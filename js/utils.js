/**
 * Small shared helpers. No DOM writes beyond the toast, no state.
 */

const _els = {};

/**
 * Element lookup by id, cached, but only while the cached node is still in the
 * document. render() replaces whole screens, so a plain cache hands back a
 * detached node and every read of it is the value the screen had before the
 * last render. That is not theoretical: it silently reverted a settings save.
 */
export function $(id) {
  const cached = _els[id];
  if (cached && cached.isConnected) return cached;
  const found = document.getElementById(id);
  _els[id] = found;
  return found;
}

/** Escape HTML special characters. Everything rendered goes through this. */
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolve a bilingual value. Semantics copied from gamme
 * (projects/gamme-site/js/state.js:37-42): a bare string is legal, English is
 * the fallback, then Spanish, then empty. Never undefined reaching the DOM.
 */
export function t(obj, lang = 'en') {
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj.en || obj.es || '';
}

/** Substitute {0}, {1}, ... in a resolved string. Arguments are not escaped. */
export function fill(text, ...args) {
  return String(text).replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : String(args[i])));
}

/**
 * The engine's own copy, every string a learner reads, as {en, es} objects
 * resolved through t() with state.lang. English is the default and the
 * fallback; a key with no Spanish entry shows the English. Host-facing text
 * (error events, console lines) is not here and stays English.
 */
export const UI = {
  // Card states, in the browse table
  stateNew: { en: 'New', es: 'Nueva' },
  stateLearning: { en: 'Learning', es: 'Aprendiendo' },
  stateReview: { en: 'Review', es: 'Repaso' },
  stateRelearning: { en: 'Relearning', es: 'Reaprendiendo' },
  now: { en: 'now', es: 'ahora' },
  // Deck rows. The three pills, the "next in" fragment, the version stamp's
  // "built in" and the Review label went with the row they belonged to: one
  // sentence per deck now, in the readout keys further down. Copy nothing
  // renders is copy that drifts, and a translator would have paid for it.
  cram: { en: 'Cram', es: 'Práctica libre' },
  browse: { en: 'Browse', es: 'Explorar' },
  deckJson: { en: 'Deck JSON', es: 'JSON del mazo' },
  tsv: { en: 'TSV', es: 'TSV' },
  forget: { en: 'Forget', es: 'Olvidar' },
  addBuiltin: { en: 'Add to my decks', es: 'Añadir a mis mazos' },
  // Library
  decks: { en: 'Decks', es: 'Mazos' },
  libraryLead: {
    en: 'Scheduling is FSRS-6 and it runs in this browser. Your review history stays here unless you export it.',
    es: 'La programación es FSRS-6 y se ejecuta en este navegador. Tu historial de repasos se queda aquí a menos que lo exportes.',
  },
  import: { en: 'Import', es: 'Importar' },
  exportLedger: { en: 'Export ledger', es: 'Exportar el registro' },
  restoreLedger: { en: 'Restore ledger', es: 'Restaurar el registro' },
  noDecks: { en: 'No decks yet', es: 'Todavía no hay mazos' },
  noDecksHelp: {
    en: 'Import a TSV, CSV or JSON file, or paste a word list. Anki\'s <code>#separator:</code> headers are read as written, so a file exported from Anki loads unchanged.',
    es: 'Importa un archivo TSV, CSV o JSON, o pega una lista de palabras. Las cabeceras <code>#separator:</code> de Anki se leen tal como están, así que un archivo exportado desde Anki se carga sin cambios.',
  },
  shelfTitle: { en: 'Decks this build ships', es: 'Mazos que incluye esta versión' },
  shelfNote: { en: '{0} cards from {1} notes. {2}.', es: '{0} tarjetas de {1} notas. {2}.' },
  cardMap: { en: 'Card map {0} of {1}.', es: 'Mapa de tarjetas: {0} de {1}.' },
  storageRefused: {
    en: 'This browser refused a storage write, so nothing is being saved.',
    es: 'Este navegador rechazó una escritura en el almacenamiento, así que no se está guardando nada.',
  },
  accountNone: {
    en: 'No account is needed and none is configured.',
    es: 'No hace falta ninguna cuenta y no hay ninguna configurada.',
  },
  accountSignedOut: {
    en: 'Account sync is available, and you are not signed in.',
    es: 'La sincronización de cuenta está disponible y no has iniciado sesión.',
  },
  accountSignedIn: {
    en: 'Signed in. Sync carries card scheduling and settings, never the review log.',
    es: 'Sesión iniciada. La sincronización lleva la programación de las tarjetas y los ajustes, nunca el registro de repasos.',
  },
  licence: { en: 'Licence', es: 'Licencia' },
  // Browse
  browseLead: {
    en: 'Every card, with the scheduler state behind it. S is stability in days, D is difficulty from 1 to 10.',
    es: 'Todas las tarjetas, con el estado del planificador detrás de cada una. S es la estabilidad en días, D es la dificultad de 1 a 10.',
  },
  backToDecks: { en: 'Back to decks', es: 'Volver a los mazos' },
  thFront: { en: 'Front', es: 'Anverso' },
  thTemplate: { en: 'Template', es: 'Plantilla' },
  thState: { en: 'State', es: 'Estado' },
  thDue: { en: 'Due', es: 'Vence' },
  thReps: { en: 'Reps', es: 'Reps' },
  thLapses: { en: 'Lapses', es: 'Fallos' },
  // Settings
  stats: { en: 'Stats', es: 'Estadísticas' },
  settings: { en: 'Settings', es: 'Ajustes' },
  settingsLead: {
    en: 'FSRS-6 with the 21 published defaults. There is no optimizer here: fitting parameters is gradient descent over your whole history and needs a build step this site does not have. Paste the array Anki computed for you instead.',
    es: 'FSRS-6 con los 21 valores predeterminados publicados. Aquí no hay optimizador: ajustar los parámetros es un descenso de gradiente sobre todo tu historial y necesita un paso de compilación que este sitio no tiene. Pega en su lugar el array que Anki calculó para ti.',
  },
  desiredRetention: { en: 'Desired retention', es: 'Retención deseada' },
  retentionNote: {
    en: 'Above 90 percent the workload climbs very quickly. At 90 percent the interval equals stability exactly, which is what stability means.',
    es: 'Por encima del 90 por ciento la carga de trabajo sube muy rápido. Al 90 por ciento el intervalo es exactamente igual a la estabilidad, que es lo que la estabilidad significa.',
  },
  learnSteps: { en: 'Learning steps, seconds', es: 'Pasos de aprendizaje, en segundos' },
  relearnSteps: { en: 'Relearning steps, seconds', es: 'Pasos de reaprendizaje, en segundos' },
  dayStart: { en: 'Next day starts at', es: 'El día siguiente empieza a las' },
  params: { en: 'Parameters, 17, 19 or 21 numbers', es: 'Parámetros, 17, 19 o 21 números' },
  paramsNote: {
    en: 'A 17 or 19 value array is migrated the way fsrs-rs migrates it. Length and finiteness are the only checks.',
    es: 'Un array de 17 o 19 valores se migra tal como lo migra fsrs-rs. La longitud y que los valores sean finitos son las únicas comprobaciones.',
  },
  save: { en: 'Save', es: 'Guardar' },
  backToDefaults: { en: 'Back to defaults', es: 'Volver a los predeterminados' },
  language: { en: 'Language', es: 'Idioma' },
  languageNote: {
    en: 'The interface and deck copy are shown in this language. Deck copy falls back to English when the deck does not carry it.',
    es: 'La interfaz y el texto del mazo se muestran en este idioma. El texto del mazo pasa al inglés cuando el mazo no lo incluye.',
  },
  // Review surface
  gradeAgain: { en: 'Again', es: 'Otra vez' },
  gradeAgainGloss: { en: 'I did not recall it', es: 'No lo recordé' },
  gradeHard: { en: 'Hard', es: 'Difícil' },
  gradeHardGloss: { en: 'I recalled it, with effort', es: 'Lo recordé, con esfuerzo' },
  gradeGood: { en: 'Good', es: 'Bien' },
  gradeGoodGloss: { en: 'I recalled it', es: 'Lo recordé' },
  gradeEasy: { en: 'Easy', es: 'Fácil' },
  gradeEasyGloss: { en: 'I recalled it at once', es: 'Lo recordé al instante' },
  gradesLabel: { en: 'How did that go', es: '¿Cómo te fue?' },
  hardWarn: {
    en: 'Hard is a passing grade: it means you did recall it. Press Again when the answer did not come.',
    es: 'Difícil es una calificación de acierto: significa que sí lo recordaste. Pulsa Otra vez cuando la respuesta no llegó.',
  },
  yourAnswer: { en: 'Your answer', es: 'Tu respuesta' },
  typeIt: { en: 'Type it, then press Enter', es: 'Escríbelo y luego pulsa Enter' },
  pickAnswer: { en: 'Pick the answer', es: 'Elige la respuesta' },
  verdictHit: { en: 'That matches.', es: 'Coincide.' },
  verdictMiss: { en: 'Not a match. The answer is above.', es: 'No coincide. La respuesta está arriba.' },
  nextReady: {
    en: 'The next card is ready in {0}. Learning cards inside {1} minutes are shown early; nothing else is.',
    es: 'La siguiente tarjeta estará lista en {0}. Las tarjetas en aprendizaje que vencen dentro de {1} minutos se muestran antes; nada más.',
  },
  nothingDue: { en: 'Nothing is due in this deck right now.', es: 'Ahora mismo no hay nada pendiente en este mazo.' },
  sessionFinished: { en: 'Session finished', es: 'Sesión terminada' },
  cramThis: { en: 'Cram this deck', es: 'Práctica libre con este mazo' },
  sessionCount: { en: '{0} of {1}', es: '{0} de {1}' },
  showAnswer: { en: 'Show answer', es: 'Mostrar la respuesta' },
  // The shortcut sheet (js/keys.js)
  keyFlipHint: { en: 'Spacebar, while a card is face down', es: 'Barra espaciadora, mientras la tarjeta está boca abajo' },
  keyHardPass: { en: 'This is a PASS', es: 'Esto es un ACIERTO' },
  // The stats screen (js/stats.js)
  statDueNow: { en: 'Due now', es: 'Pendientes ahora' },
  statNew: { en: 'New', es: 'Nuevas' },
  statCards: { en: 'Cards', es: 'Tarjetas' },
  statReviewsToday: { en: 'Reviews today', es: 'Repasos de hoy' },
  statStreak: { en: 'Day streak', es: 'Racha de días' },
  statRecall: { en: 'Recall', es: 'Recuerdo' },
  reviewHistory: { en: 'Review history', es: 'Historial de repasos' },
  noReviewsYet: { en: 'No reviews yet. Answer a card and this fills in.', es: 'Todavía no hay repasos. Responde una tarjeta y esto se rellena.' },
  heatTitle: { en: 'Reviews, last 18 weeks', es: 'Repasos, últimas 18 semanas' },
  heatAria: { en: 'Reviews per day over the last eighteen weeks', es: 'Repasos por día durante las últimas dieciocho semanas' },
  countOnDevice: { en: '{0} on this device', es: '{0} en este dispositivo' },
  countTotal: { en: '{0} total', es: '{0} en total' },
  recallTitle: { en: 'Recall, rolling 50 reviews', es: 'Recuerdo, ventana de 50 repasos' },
  recallOnDevice: { en: '{0}% on this device', es: '{0}% en este dispositivo' },
  recallAllTime: { en: '{0}% all time', es: '{0}% desde el principio' },
  recallAria: { en: 'Rolling recall percentage over time', es: 'Porcentaje de recuerdo en ventana móvil a lo largo del tiempo' },
  recallOverTime: { en: 'Recall over time', es: 'Recuerdo a lo largo del tiempo' },
  recallNeedsTen: { en: 'Ten graded reviews and this line starts.', es: 'Diez repasos calificados y esta línea empieza.' },
  reviewsOf: { en: 'Reviews of {0}', es: 'Repasos de {0}' },
  historyElsewhereTitle: {
    en: 'Review history stays on the device that made it',
    es: 'El historial de repasos se queda en el dispositivo que lo creó',
  },
  historyElsewhereBody: {
    en: 'The schedule for {0} is here, but the reviews themselves are not. Account sync carries card scheduling and settings, never the log, and an exported ledger leaves the log out unless you ask for it. So the heatmap, the streak and the recall figure have nothing to draw from {1}.',
    es: 'La programación de {0} está aquí, pero los repasos en sí no. La sincronización de cuenta lleva la programación de las tarjetas y los ajustes, nunca el registro, y un registro exportado deja fuera el historial a menos que lo pidas. Así que el mapa de calor, la racha y la cifra de recuerdo no tienen de dónde dibujarse {1}.',
  },
  historyElsewhereHow: {
    en: 'Export the ledger on the device that holds the history, then restore the file here. It carries both halves, and restoring the same file twice changes nothing.',
    es: 'Exporta el registro en el dispositivo que tiene el historial y luego restaura el archivo aquí. Lleva las dos mitades, y restaurar el mismo archivo dos veces no cambia nada.',
  },
  reviewCountOne: { en: '{0} review', es: '{0} repaso' },
  reviewCountMany: { en: '{0} reviews', es: '{0} repasos' },
  elsewhereYet: { en: 'yet', es: 'todavía' },
  elsewhereThose: { en: 'for those reviews', es: 'para esos repasos' },
  // The standalone shell: index.html marks a node data-ui="<key>" (text),
  // data-ui-html="<key>" (markup) or data-ui-aria="<key>" (aria-label) and
  // render.js relabels them on every paint.
  importTitle: { en: 'Import a deck', es: 'Importar un mazo' },
  importLead: {
    en: 'TSV, CSV or JSON. Anki\'s <code>#separator:</code> header block is read as written, so a file exported from Anki loads unchanged, and <code>#guid column:</code> keeps note ids stable across a re-import.',
    es: 'TSV, CSV o JSON. El bloque de cabeceras <code>#separator:</code> de Anki se lee tal como está, así que un archivo exportado desde Anki se carga sin cambios, y <code>#guid column:</code> mantiene estables los ids de las notas al volver a importar.',
  },
  deckName: { en: 'Deck name', es: 'Nombre del mazo' },
  file: { en: 'File', es: 'Archivo' },
  orPaste: { en: 'Or paste it', es: 'O pégalo aquí' },
  importReverse: { en: 'Also make a typed card in the reverse direction', es: 'Crear también una tarjeta escrita en el sentido inverso' },
  importNote: {
    en: 'Three templates over 50 notes is 150 cards, which is a month of reviews from one paste. Add the reverse only when it is a real skill.',
    es: 'Tres plantillas sobre 50 notas son 150 tarjetas, que es un mes de repasos a partir de un solo pegado. Añade el inverso solo cuando sea una habilidad real.',
  },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  closeDialog: { en: 'Close dialog', es: 'Cerrar el diálogo' },
  restoreTitle: { en: 'Restore a ledger', es: 'Restaurar un registro' },
  restoreLead: {
    en: 'Take back a <code>neo-ledger/1</code> file exported from another browser or device. Merge keeps whichever review of each card is newer, so two devices that studied different cards both survive.',
    es: 'Recupera un archivo <code>neo-ledger/1</code> exportado desde otro navegador o dispositivo. Combinar conserva el repaso más reciente de cada tarjeta, así que dos dispositivos que estudiaron tarjetas distintas sobreviven los dos.',
  },
  restoreLegend: { en: 'What to do with what is already here', es: 'Qué hacer con lo que ya está aquí' },
  restoreMerge: { en: 'Merge, newest review of each card wins', es: 'Combinar, gana el repaso más reciente de cada tarjeta' },
  restoreReplace: { en: 'Replace everything in this browser', es: 'Reemplazar todo lo que hay en este navegador' },
  restore: { en: 'Restore', es: 'Restaurar' },
  // Toasts a learner reads while loading a deck
  deckInvalid: { en: 'That deck is not valid: {0}', es: 'Ese mazo no es válido: {0}' },
  deckRefused: {
    en: 'Refused: this deck would take the card map to {0}, over the {1} ceiling. Export and forget a deck first.',
    es: 'Rechazado: este mazo llevaría el mapa de tarjetas a {0}, por encima del límite de {1}. Exporta y olvida un mazo primero.',
  },
  deckSweptOne: {
    en: 'Deck updated to {0}: {1} row for removed notes swept',
    es: 'Mazo actualizado a {0}: se barrió {1} fila de notas eliminadas',
  },
  deckSweptMany: {
    en: 'Deck updated to {0}: {1} rows for removed notes swept',
    es: 'Mazo actualizado a {0}: se barrieron {1} filas de notas eliminadas',
  },
  noBuiltin: {
    en: 'No built-in deck called "{0}" on this build',
    es: 'No hay ningún mazo integrado llamado "{0}" en esta versión',
  },

  // ── Navigation and landmarks ──────────────────────────────────────────
  // Names for the regions a screen reader lists, and the two skip links. A
  // landmark with no name is announced as "navigation" and nothing else, which
  // is no help on a page that has three of them.
  navLabel: { en: 'Sections', es: 'Secciones' },
  attribLabel: { en: 'Licences', es: 'Licencias' },
  skipToContent: { en: 'Skip to content', es: 'Ir al contenido' },
  skipToCard: { en: 'Skip to the card', es: 'Ir a la tarjeta' },

  // ── Deck rows ─────────────────────────────────────────────────────────
  // One sentence per row, and only one of the three is ever drawn. The accent
  // is spent on deckReady alone, so a library of quiet decks has no colour in
  // it and a deck with work waiting is the only thing that catches the eye.
  study: { en: 'Study', es: 'Estudiar' },
  deckReady: { en: '{0} to study now', es: '{0} para estudiar ahora' },
  readoutSplit: { en: '{0} due, {1} new', es: '{0} pendientes, {1} nuevas' },
  deckQuiet: { en: 'Nothing due. Next card in {0}.', es: 'Nada pendiente. Siguiente tarjeta en {0}.' },
  deckUntouched: { en: 'Not started. {0} cards.', es: 'Sin empezar. {0} tarjetas.' },
  moreActions: { en: 'More actions for {0}', es: 'Más acciones para {0}' },
  deckVersion: { en: 'Version {0}', es: 'Versión {0}' },
  storage: { en: 'Storage', es: 'Almacenamiento' },
  forgetConfirm: {
    en: 'Forget "{0}" and every review of it in this browser?',
    es: '¿Olvidar "{0}" y todos sus repasos en este navegador?',
  },
  statsLead: {
    en: 'Everything below is drawn from the review log in this browser.',
    es: 'Todo lo de abajo se dibuja a partir del registro de repasos de este navegador.',
  },

  // ── The review surface, named for the keyboard and for a screen reader ──
  endSession: { en: 'End session', es: 'Terminar la sesión' },
  tapToReveal: { en: 'Tap to reveal', es: 'Toca para ver la respuesta' },
  cardRegion: { en: 'Card {0} of {1}', es: 'Tarjeta {0} de {1}' },
  announceFront: { en: 'Card {0} of {1}: {2}', es: 'Tarjeta {0} de {1}: {2}' },
  progressText: { en: '{0} of {1} answered', es: '{0} de {1} respondidas' },
  // A reveal is announced as the answer, never as bare text: on a basic or a
  // cloze card the back read out on its own ("good morning") is word for word
  // what a new front sounds like, and a reader could not tell them apart.
  answerIs: { en: 'Answer: {0}', es: 'Respuesta: {0}' },
  gradesHint: {
    en: 'Arrow keys move, 1 to 4 grade, Enter or Space confirms',
    es: 'Las flechas mueven, 1 a 4 califican, Enter o espacio confirma',
  },
  sessionDone: {
    en: 'Session done. Every card that was due has been seen.',
    es: 'Sesión terminada. Se han visto todas las tarjetas pendientes.',
  },

  // ── The strings that used to be English-only ──────────────────────────
  // Written as literals in js/events.js and js/boot.js, so a Spanish visitor
  // read English at every point where something actually happened to their
  // data. They live here now; the call sites resolve them through t().
  ledgerSaved: {
    en: 'Ledger downloaded, card state and full review log',
    es: 'Registro descargado, estado de las tarjetas y registro completo de repasos',
  },
  settingsSaved: {
    en: 'Saved. New intervals use these from the next answer on.',
    es: 'Guardado. Los nuevos intervalos usan estos valores a partir de la siguiente respuesta.',
  },
  settingsReset: {
    en: 'Back to the 21 published FSRS-6 defaults',
    es: 'De vuelta a los 21 valores predeterminados publicados de FSRS-6',
  },
  paramsRejected: { en: 'Parameters rejected: {0}', es: 'Parámetros rechazados: {0}' },
  imported: { en: 'Imported {0} notes into "{1}"', es: 'Se importaron {0} notas en "{1}"' },
  restored: {
    en: 'Restored {0} card rows and {1} log entries',
    es: 'Se restauraron {0} filas de tarjetas y {1} entradas del registro',
  },
  notValidJson: { en: 'Not valid JSON: {0}', es: 'No es JSON válido: {0}' },
  audioMissing: {
    en: 'That audio file is not in this deck folder',
    es: 'Ese archivo de audio no está en la carpeta del mazo',
  },
  srcNotHttps: { en: 'A ?src= deck must be an https URL', es: 'Un mazo ?src= tiene que ser una URL https' },
  fetchFailed: {
    en: 'Could not fetch that deck. It may be a CORS or a network problem.',
    es: 'No se pudo descargar ese mazo. Puede ser un problema de CORS o de red.',
  },
  inlineBad: { en: 'The deck in that link did not decode', es: 'El mazo de ese enlace no se pudo decodificar' },

  // ── The card itself: the tag, the answer box, what you produced ────────
  cramBadge: { en: 'Cram, nothing is saved', es: 'Práctica libre, no se guarda nada' },
  kanaMode: {
    en: 'Romaji becomes kana as you type',
    es: 'El romaji se convierte en kana mientras escribes',
  },
  youWrote: { en: 'You wrote {0}', es: 'Escribiste {0}' },
  // A choice card is picked from four buttons, so "You wrote thank you" was
  // describing something the learner did not do.
  youPicked: { en: 'You picked {0}', es: 'Elegiste {0}' },
};

/** base64url of a UTF-8 string. */
export function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of b64urlEncode. Throws on a malformed input, so callers catch. */
export function b64urlDecode(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Trigger a file download from a string. */
export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let _toastTimer = null;

/** A temporary message. The only DOM this module touches. */
export function showToast(msg) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2600);
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** YYYY-MM-DD in local time, the key every daily statistic is grouped by. */
export function dayKey(ts) {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A short local date, for a due stamp in a table. */
export function shortDate(ts, lang = 'en') {
  if (!ts) return t(UI.now, lang);
  return new Date(ts).toLocaleDateString(lang === 'es' ? 'es' : undefined, { month: 'short', day: 'numeric' });
}

/** Bytes a JSON-serialisable value takes, as UTF-8. */
export function byteLength(value) {
  try {
    return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

/** "1.42 MiB". Used where a refusal has to say the number. */
export function mib(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
