import { siteA } from './site_a_ozkaradeniz.js';
import { siteB } from './site_b_enderyapi.js';
import { siteC } from './site_c_yasarteknik.js';
import { siteD } from './site_d_polisan.js';
import { siteE } from './site_e_akyuzler.js';
import { siteF } from './site_f_firatboru.js';
import { siteH } from './site_h_kamilturk.js';
import { siteI } from './site_i_tokticaret.js';
import { siteJ } from './site_j_duzmetal.js';
import { siteK } from './site_k_rico.js';

export {
  siteA,
  siteB,
  siteC,
  siteD,
  siteE,
  siteF,
  siteH,
  siteI,
  siteJ,
  siteK
};

export const SITE_ADAPTERS = {
  SITE_A: siteA,
  SITE_B: siteB,
  SITE_C: siteC,
  SITE_D: siteD,
  SITE_E: siteE,
  SITE_F: siteF,
  SITE_H: siteH,
  SITE_I: siteI,
  SITE_J: siteJ,
  SITE_K: siteK
};

// Geriye dönük uyumluluk için PARSERS takma adı
export const PARSERS = SITE_ADAPTERS;

