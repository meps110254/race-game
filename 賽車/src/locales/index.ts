import { zhTW } from './zh-TW';
import { en } from './en';
import { cs } from './cs';
import { ja } from './ja';
import { af } from './af';
import { ms } from './ms';
import { fr } from './fr';
import { da } from './da';
import { de } from './de';
import { et } from './et';
import { es } from './es';
import { fil } from './fil';
import { ga } from './ga';
import { hr } from './hr';
import { is } from './is';
import { it } from './it';
import { LangType } from '../utils/translationData';

export const TRANSLATIONS: Record<LangType, Record<string, string>> = {
  'zh-TW': zhTW,
  'en': en,
  'cs': cs,
  'ja': ja,
  'af': af,
  'ms': ms,
  'fr': fr,
  'da': da,
  'de': de,
  'ko': {},
  'vi': {},
  'th': {},
  'ta': {},
  'fil': fil,
  'it': it,
  'es': es,
  'nl': {},
  'pt': {},
  'mi': {},
  'ar': {},
  'fa': {},
  'tr': {},
  'he': {},
  'ku': {},
  'ru': {},
  'pl': {},
  'uk': {},
  'ro': {},
  'hu': {},
  'sv': {},
  'no': {},
  'fi': {},
  'el': {},
  'ga': ga,
  'bg': {},
  'hr': hr,
  'lt': {},
  'lv': {},
  'et': et,
  'sk': {},
  'sl': {},
  'mt': {},
  'is': is
};

export { zhTW, en, cs, ja, af, ms, fr, da, de, et, es, fil, ga, hr, is, it };
