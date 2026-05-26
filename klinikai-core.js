/**
 * klinikai-core.js
 * ─────────────────────────────────────────────────────────
 * Delt prompt-bibliotek for KlinikAI-motoren.
 * Importeres af Clinote, KlinikAI standalone og fremtidige apps.
 *
 * Opdater ét sted → alle apps opdateres automatisk.
 * Version: 1.0.0 | Helgason.io
 */

// ══════════════════════════════════════════════════════════
// AFDELINGSKONFIGURATION
// Tilpas denne sektion per afdeling/sygehus
// ══════════════════════════════════════════════════════════

const KLINIKAI_CONFIG = {
  sygehus:        'OUH — Odense Universitetshospital',
  afdeling:       'Neurologisk afdeling / Stroke',
  fagrolle:       'SOSU-assistent og sygeplejersker',
  epj_system:     'Columna (Nexus)',
  sprog:          'da-DK',
  version:        '1.0.0',
};

// ══════════════════════════════════════════════════════════
// FIDO-DOMÆNER
// Standard FIDO-dokumentationsdomæner — bruges i alle noter
// ══════════════════════════════════════════════════════════

const FIDO_DOMÆNER = [
  'Funktion og færdigheder',
  'Ernæring',
  'Hud og slimhinder',
  'Kommunikation',
  'Respiration',
  'Cirkulation',
  'Smerte',
  'Søvn og hvile',
  'Vandladning',
  'Tarmfunktion',
  'Psykosociale forhold',
  'Seksualitet',
];

// ══════════════════════════════════════════════════════════
// DOC_FORMAT
// Definerer outputformater til EPJ
// ══════════════════════════════════════════════════════════

const DOC_FORMAT = {

  FIDO_NOTAT: `
STRUKTURERET FIDO-NOTAT
Dato/tid: {DATO}
Afdeling: {AFDELING}
─────────────────────────────────────────────────
{FIDO_SEKTIONER}
─────────────────────────────────────────────────
Diktering behandlet af KlinikAI — skal godkendes og indsættes i {EPJ_SYSTEM}
`.trim(),

  TOKS_NOTAT: `
TOKS — TIDLIG OPSPORING AF KRITISK SYGDOM
Dato/tid: {DATO}
─────────────────────────────────────────────────
VITALE PARAMETRE:
  Respirationsfrekvens : {RESP} /min
  Saturation           : {SAT} %
  Iltbehandling        : {ILT} l/min
  Blodtryk             : {BTS}/{BTD} mmHg
  Puls                 : {PULS} /min
  Temperatur           : {TEMP} °C
  GCS total            : {GCS} /15
TOKS TOTALSCORE        : {TOKS} /14
{EKSTRA}
─────────────────────────────────────────────────
Dokumenteret i Clinote — skal indsættes i {EPJ_SYSTEM}
`.trim(),

  AKUT_NOTAT: `
⚠️ AKUT OBSERVATION / HASTEOBS
Dato/tid: {DATO}
─────────────────────────────────────────────────
ÅRSAG                  : {ÅRSAG}
VITALE VÆRDIER (AKUT):
  Saturation           : {SAT} %
  Respirationsfrekvens : {RESP} /min
  Puls                 : {PULS} /min
  BT                   : {BTS}/{BTD} mmHg
  Temperatur           : {TEMP} °C
  GCS                  : {GCS} /15
BEVIDSTHED/NEUROLOGI   : {NEUROLOGI}
IVÆRKSAT HANDLING      : {HANDLING}
{EKSTRA}
─────────────────────────────────────────────────
Dokumenteret i Clinote — skal indsættes i {EPJ_SYSTEM}
`.trim(),

};

// ══════════════════════════════════════════════════════════
// FAGRUPPE_INSTRUKS
// Rollespecifikke instruktioner til AI-motoren
// ══════════════════════════════════════════════════════════

const FAGRUPPE_INSTRUKS = {

  SOSU: `
Du assisterer en SOSU-assistent.
- Brug enkelt, præcist plejesprog
- Fokuser på observerbare fund — ikke diagnoser
- Henvis altid til sygeplejerske/læge ved klinisk usikkerhed
- Hold FIDO-strukturen
`.trim(),

  SYGEPLEJERSKE: `
Du assisterer en sygeplejerske.
- Brug klinisk fagsprog inkl. medicinske termer
- Du må inkludere kliniske vurderinger og handlingsforslag
- Henvis til læge ved ordinationsbehov
- Hold FIDO-strukturen og inkluder relevante scores
`.trim(),

  LÆGE: `
Du assisterer en læge.
- Brug fuldt medicinsk fagsprog
- Inkluder differentialdiagnostiske overvejelser
- Beskriv fund, vurdering og plan (SAP-format hvis relevant)
`.trim(),

};

// ══════════════════════════════════════════════════════════
// SPECS — Kliniske specialregler per afdeling
// ══════════════════════════════════════════════════════════

const SPECS = {

  NEUROLOGI: {
    navn: 'Neurologisk afdeling / Stroke',
    fokus: [
      'Bevidsthedsniveau og GCS',
      'FAST-test (ansigt, arm, tale, tid)',
      'Kramper og postiktal fase',
      'Apopleksi og TIA',
      'Parkinson og MS',
      'Smerter og neuropati',
    ],
    scores: ['GCS', 'NIHSS', 'TOKS', 'NEWS', 'NRS'],
    alarmsignaler: [
      'Pludselig svaghed eller lammelse',
      'Pludselig talebesvær',
      'Bevidsthedstab',
      'Kramper',
      'Pludselig kraftig hovedpine',
    ],
    retningslinjer: 'OUH Neurologiafdelingens kliniske retningslinjer',
  },

  MEDICIN: {
    navn: 'Medicinsk afdeling',
    fokus: [
      'Hjerte-kar sygdomme',
      'Diabetes og metaboliske tilstande',
      'Infektioner og sepsis',
      'Nyresygdomme',
      'Lunge- og luftvejssygdomme',
    ],
    scores: ['TOKS', 'NEWS', 'qSOFA', 'NRS'],
    alarmsignaler: [
      'Sepsis tegn',
      'Akutte brystsmerter',
      'Svær dyspnø',
      'Bevidsthedspåvirkning',
    ],
    retningslinjer: 'Medicinske afdelingers kliniske retningslinjer',
  },

  KIRURGI: {
    navn: 'Kirurgisk afdeling',
    fokus: [
      'Postoperativ overvågning',
      'Sårheling og komplikationer',
      'Smertebehandling',
      'Mobilisering postoperativt',
      'Væskebalance',
    ],
    scores: ['TOKS', 'NEWS', 'NRS', 'VAS'],
    alarmsignaler: [
      'Tegn på infektion i operationssår',
      'Postoperativ blødning',
      'Dyb venetrombose tegn',
      'Lungeemboli mistanke',
    ],
    retningslinjer: 'Kirurgiske afdelingers kliniske retningslinjer',
  },

  PSYKIATRI: {
    navn: 'Psykiatrisk afdeling',
    fokus: [
      'Psykisk tilstand og adfærd',
      'MedicinCompliance',
      'Suicidalvurdering',
      'Sociale forhold',
      'Søvn og aktivitet',
    ],
    scores: ['GAF', 'HoNOS'],
    alarmsignaler: [
      'Suicidaltanker eller -handlinger',
      'Alvorlig agitation',
      'Psykotiske symptomer',
    ],
    retningslinjer: 'Psykiatriske afdelingers kliniske retningslinjer',
  },

};

// ══════════════════════════════════════════════════════════
// SYSTEM PROMPT GENERATOR
// Bygger den endelige system-prompt til Claude API
// ══════════════════════════════════════════════════════════

function byggSystemPrompt(opgave = 'FIDO_DIKTERING', spec = 'NEUROLOGI', rolle = 'SOSU') {

  const afdeling = SPECS[spec] || SPECS.NEUROLOGI;
  const fagInstruks = FAGRUPPE_INSTRUKS[rolle] || FAGRUPPE_INSTRUKS.SOSU;

  const prompts = {

    FIDO_DIKTERING: `
Du er KlinikAI — en klinisk dokumentationsmotor integreret i Clinote på ${KLINIKAI_CONFIG.sygehus}.

AFDELING: ${afdeling.navn}
BRUGERROLLE: ${rolle}

${fagInstruks}

DIN OPGAVE:
Du modtager rå dikteringstekst fra en klinisk medarbejder.
Du skal strukturere teksten som et præcist FIDO-notat klar til indsættelse i ${KLINIKAI_CONFIG.epj_system}.

OUTPUTFORMAT — returner KUN dette, ingen ekstra tekst:
Gennemgå dikteringen og udfyld relevante FIDO-domæner:

FUNKTION OG FÆRDIGHEDER:
[fund fra diktering, eller "Ikke beskrevet"]

ERNÆRING:
[fund fra diktering, eller "Ikke beskrevet"]

HUD OG SLIMHINDER:
[fund fra diktering, eller "Ikke beskrevet"]

KOMMUNIKATION:
[fund fra diktering, eller "Ikke beskrevet"]

RESPIRATION:
[fund fra diktering, eller "Ikke beskrevet"]

CIRKULATION:
[fund fra diktering, eller "Ikke beskrevet"]

SMERTE:
[fund fra diktering, eller "Ikke beskrevet"]

SØVN OG HVILE:
[fund fra diktering, eller "Ikke beskrevet"]

VANDLADNING:
[fund fra diktering, eller "Ikke beskrevet"]

TARMFUNKTION:
[fund fra diktering, eller "Ikke beskrevet"]

AFDELINGENS FOKUSOMRÅDER (${afdeling.navn}):
${afdeling.fokus.map(f => '- ' + f).join('\n')}

⚠️ ALARMSIGNALER — nævn tydeligt hvis dikteringen indeholder:
${afdeling.alarmsignaler.map(a => '- ' + a).join('\n')}

Svar KUN med det strukturerede FIDO-notat. Ingen forklaringer.
`.trim(),

    KLINISK_VEJLEDNING: `
Du er KlinikAI — en klinisk beslutningsstøtte på ${KLINIKAI_CONFIG.sygehus}, ${afdeling.navn}.

BRUGERROLLE: ${rolle}
${fagInstruks}

Besvar kliniske spørgsmål præcist og handlingsorienteret på dansk.
Relevante scores for denne afdeling: ${afdeling.scores.join(', ')}.
Retningslinjer: ${afdeling.retningslinjer}.

Husk altid: Dette er vejledende — klinisk vurdering foretages af kvalificeret personale.
Returner KUN svaret. Intet preamble.
`.trim(),

    TOKS_ANALYSE: `
Du er KlinikAI's TOKS-analysemodul på ${KLINIKAI_CONFIG.sygehus}.

Analyser de indtastede vitale værdier og returner:
1. TOKS-score vurdering (0-14)
2. Handlingsanbefaling per score-niveau
3. Eventuelle alarmsignaler
4. Foreslået handling

Brug ${afdeling.navn}'s retningslinjer.
Svar på dansk. Returner KUN analysen.
`.trim(),

  };

  return prompts[opgave] || prompts.FIDO_DIKTERING;
}

// ══════════════════════════════════════════════════════════
// API-KALD — Central Claude-funktion
// Bruges af alle apps der importerer klinikai-core.js
// ══════════════════════════════════════════════════════════

async function klinikAiKald({ opgave = 'FIDO_DIKTERING', spec = 'NEUROLOGI', rolle = 'SOSU', input, onStart, onComplete, onError }) {

  const systemPrompt = byggSystemPrompt(opgave, spec, rolle);

  try {
    if (onStart) onStart();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: input }],
      }),
    });

    if (!response.ok) throw new Error(`API fejl: ${response.status}`);

    const data = await response.json();
    const svar = data.content?.[0]?.text || '';

    if (onComplete) onComplete(svar);
    return svar;

  } catch (err) {
    const fejl = `⚠️ KlinikAI fejl: ${err.message}`;
    if (onError) onError(fejl);
    throw err;
  }
}

// Eksporter til browser-miljø
if (typeof window !== 'undefined') {
  window.KLINIKAI_CONFIG = KLINIKAI_CONFIG;
  window.FIDO_DOMÆNER = FIDO_DOMÆNER;
  window.DOC_FORMAT = DOC_FORMAT;
  window.FAGRUPPE_INSTRUKS = FAGRUPPE_INSTRUKS;
  window.SPECS = SPECS;
  window.byggSystemPrompt = byggSystemPrompt;
  window.klinikAiKald = klinikAiKald;
}
