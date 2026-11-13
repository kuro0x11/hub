import * as D from './data.js';
import oggi from './oggi.js';
import sessione from './sessione.js';
import calendario from './calendario.js';
import progressi from './progressi.js';
import importa from './importa.js';

export default {
  id: 'palestra',
  nome: 'Palestra',
  schema: 1,
  // Migrazione dei dati da una versione dello schema alla successiva.
  async migrate(store, from) {
    if (from < 1) { /* v1: primo schema, niente da convertire */ }
  },
  async init({ store }) { await D.load(store); },
  screens: [
    { id: 'oggi', label: 'Oggi', render: oggi },
    { id: 'calendario', label: 'Calendario', render: calendario },
    { id: 'progressi', label: 'Progressi', render: progressi },
  ],
  sub: {
    sessione: { render: sessione },
    importa: { render: importa },
  },
};
