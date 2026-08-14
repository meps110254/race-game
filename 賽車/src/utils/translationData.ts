import { TRANSLATIONS } from '../locales';

export interface Country {
  name: string;
  zhName?: string;
  code: string;
  lang: LangType;
  flag: string;
  keywords?: string[];
}

export type LangType = 
  | 'zh-TW' 
  | 'en' 
  | 'fr' 
  | 'ja' 
  | 'ko' 
  | 'vi' 
  | 'th' 
  | 'ms' 
  | 'ta' 
  | 'fil' 
  | 'de' 
  | 'it' 
  | 'es' 
  | 'nl' 
  | 'pt' 
  | 'mi' 
  | 'af'
  | 'ar'
  | 'fa'
  | 'tr'
  | 'he'
  | 'ku'
  | 'ru'
  | 'pl'
  | 'uk'
  | 'ro'
  | 'cs'
  | 'hu'
  | 'sv'
  | 'no'
  | 'fi'
  | 'da'
  | 'el'
  | 'ga'
  | 'bg'
  | 'hr'
  | 'lt'
  | 'lv'
  | 'et'
  | 'sk'
  | 'sl'
  | 'mt'
  | 'is';

export const COUNTRIES_LIST: Country[] = [
  { name: "Taiwan", zhName: "台灣", code: "TW", lang: "zh-TW", flag: "🇹🇼", keywords: ["台灣", "臺灣", "中華民國", "taiwan", "tw", "zh-tw", "繁體中文", "繁中"] },
  { name: "America", zhName: "美國", code: "US", lang: "en", flag: "🇺🇸", keywords: ["美國", "usa", "us", "america", "united states"] },
  { name: "Argentina", zhName: "阿根廷", code: "AR", lang: "es", flag: "🇦🇷" },
  { name: "Australia", zhName: "澳洲", code: "AU", lang: "en", flag: "🇦🇺", keywords: ["澳洲", "australia", "au"] },
  { name: "Austria", zhName: "奧地利", code: "AT", lang: "de", flag: "🇦🇹" },
  { name: "Belgium", zhName: "比利時", code: "BE", lang: "fr", flag: "🇧🇪" },
  { name: "Brazil", zhName: "巴西", code: "BR", lang: "pt", flag: "🇧🇷" },
  { name: "Bulgaria", zhName: "保加利亞", code: "BG", lang: "bg", flag: "🇧🇬" },
  { name: "Canada", zhName: "加拿大", code: "CA", lang: "en", flag: "🇨🇦", keywords: ["加拿大", "canada", "ca"] },
  { name: "Croatia", zhName: "克羅埃西亞", code: "HR", lang: "hr", flag: "🇭🇷", keywords: ["克羅埃西亞", "克羅地亞", "croatia", "hr", "hrvatska", ".hr"] },
  { name: "Czechia", zhName: "捷克", code: "CZ", lang: "cs", flag: "🇨🇿" },
  { name: "Denmark", zhName: "丹麥", code: "DK", lang: "da", flag: "🇩🇰" },
  { name: "Egypt", zhName: "埃及", code: "EG", lang: "ar", flag: "🇪🇬" },
  { name: "Estonia", zhName: "愛沙尼亞", code: "EE", lang: "et", flag: "🇪🇪" },
  { name: "Finland", zhName: "芬蘭", code: "FI", lang: "fi", flag: "🇫🇮" },
  { name: "France", zhName: "法國", code: "FR", lang: "fr", flag: "🇫🇷", keywords: ["法國", "france", "fr"] },
  { name: "Germany", zhName: "德國", code: "DE", lang: "de", flag: "🇩🇪", keywords: ["德國", "germany", "de"] },
  { name: "Greece", zhName: "希臘", code: "GR", lang: "el", flag: "🇬🇷" },
  { name: "Hong Kong", zhName: "香港", code: "HK", lang: "zh-TW", flag: "🇭🇰", keywords: ["香港", "hong kong", "hk"] },
  { name: "Hungary", zhName: "匈牙利", code: "HU", lang: "hu", flag: "🇭🇺" },
  { name: "Iceland", zhName: "冰島", code: "IS", lang: "is", flag: "🇮🇸", keywords: ["冰島", "iceland", "is", "ísland", ".is"] },
  { name: "India", zhName: "印度", code: "IN", lang: "ta", flag: "🇮🇳" },
  { name: "Iran", zhName: "伊朗", code: "IR", lang: "fa", flag: "🇮🇷" },
  { name: "Iraq", zhName: "伊拉克", code: "IQ", lang: "ar", flag: "🇮🇶" },
  { name: "Ireland", zhName: "愛爾蘭", code: "IE", lang: "ga", flag: "🇮🇪" },
  { name: "Israel", zhName: "以色列", code: "IL", lang: "he", flag: "🇮🇱" },
  { name: "Italy", zhName: "義大利", code: "IT", lang: "it", flag: "🇮🇹", keywords: ["義大利", "意大利", "italy", "it", "italia", ".it"] },
  { name: "Japan", zhName: "日本", code: "JP", lang: "ja", flag: "🇯🇵", keywords: ["日本", "japan", "jp"] },
  { name: "Latvia", zhName: "拉脫維亞", code: "LV", lang: "lv", flag: "🇱🇻" },
  { name: "Lithuania", zhName: "立陶宛", code: "LT", lang: "lt", flag: "🇱🇹" },
  { name: "Malaysia", zhName: "馬來西亞", code: "MY", lang: "ms", flag: "🇲🇾" },
  { name: "Malta", zhName: "馬爾他", code: "MT", lang: "mt", flag: "🇲🇹" },
  { name: "Mexico", zhName: "墨西哥", code: "MX", lang: "es", flag: "🇲🇽" },
  { name: "Netherlands", zhName: "荷蘭", code: "NL", lang: "nl", flag: "🇳🇱" },
  { name: "New Zealand", zhName: "紐西蘭", code: "NZ", lang: "mi", flag: "🇳🇿" },
  { name: "Norway", zhName: "挪威", code: "NO", lang: "no", flag: "🇳🇴" },
  { name: "Oman", zhName: "阿曼", code: "OM", lang: "ar", flag: "🇴🇲" },
  { name: "Philippines", zhName: "菲律賓", code: "PH", lang: "fil", flag: "🇵🇭" },
  { name: "Poland", zhName: "波蘭", code: "PL", lang: "pl", flag: "🇵🇱" },
  { name: "Portugal", zhName: "葡萄牙", code: "PT", lang: "pt", flag: "🇵🇹" },
  { name: "Qatar", zhName: "卡達", code: "QA", lang: "ar", flag: "🇶🇦" },
  { name: "Romania", zhName: "羅馬尼亞", code: "RO", lang: "ro", flag: "🇷🇴" },
  { name: "Russia", zhName: "俄羅斯", code: "RU", lang: "ru", flag: "🇷🇺" },
  { name: "Saudi Arabia", zhName: "沙烏地阿拉伯", code: "SA", lang: "ar", flag: "🇸🇦" },
  { name: "Singapore", zhName: "新加坡", code: "SG", lang: "en", flag: "🇸🇬", keywords: ["新加坡", "singapore", "sg"] },
  { name: "Slovakia", zhName: "斯洛伐克", code: "SK", lang: "sk", flag: "🇸🇰" },
  { name: "Slovenia", zhName: "斯洛維尼亞", code: "SI", lang: "sl", flag: "🇸🇮" },
  { name: "South Africa", zhName: "南非", code: "ZA", lang: "af", flag: "🇿🇦" },
  { name: "South Korea", zhName: "南韓", code: "KR", lang: "ko", flag: "🇰🇷", keywords: ["韓國", "南韓", "korea", "kr"] },
  { name: "Spain", zhName: "西班牙", code: "ES", lang: "es", flag: "🇪🇸" },
  { name: "Sweden", zhName: "瑞典", code: "SE", lang: "sv", flag: "🇸🇪" },
  { name: "Switzerland", zhName: "瑞士", code: "CH", lang: "fr", flag: "🇨🇭" },
  { name: "Thailand", zhName: "泰國", code: "TH", lang: "th", flag: "🇹🇭" },
  { name: "Turkey", zhName: "土耳其", code: "TR", lang: "tr", flag: "🇹🇷" },
  { name: "Ukraine", zhName: "烏克蘭", code: "UA", lang: "uk", flag: "🇺🇦" },
  { name: "United Kingdom", zhName: "英國", code: "GB", lang: "en", flag: "🇬🇧", keywords: ["英國", "uk", "gb", "united kingdom"] },
  { name: "United States", zhName: "美國", code: "US", lang: "en", flag: "🇺🇸", keywords: ["美國", "usa", "us", "united states"] },
  { name: "Vietnam", zhName: "越南", code: "VN", lang: "vi", flag: "🇻🇳" },
  { name: "Yemen", zhName: "葉門", code: "YE", lang: "ar", flag: "🇾🇪" },
  { name: "Zimbabwe", zhName: "津巴布韋", code: "ZW", lang: "en", flag: "🇿🇼" }
];

export const LANGUAGE_LABELS: Record<LangType, string> = {
  "zh-TW": "繁中",
  "en": "EN",
  "fr": "FR",
  "ja": "日本語",
  "ko": "한국어",
  "vi": "Tiếng Việt",
  "th": "ไทย",
  "ms": "Bahasa Melayu",
  "ta": "தமிழ்",
  "fil": "Filipino",
  "de": "Deutsch",
  "it": "Italiano",
  "es": "Español",
  "nl": "Nederlands",
  "pt": "Português",
  "mi": "Māori",
  "af": "Afrikaans",
  "ar": "العربية",
  "fa": "فارسی",
  "tr": "Türkçe",
  "he": "עברית",
  "ku": "Kurdî",
  "ru": "Русский",
  "pl": "Polski",
  "uk": "Українська",
  "ro": "Română",
  "cs": "Čeština",
  "hu": "Magyar",
  "sv": "Svenska",
  "no": "Norsk",
  "fi": "Suomi",
  "da": "Dansk",
  "el": "Ελληνικά",
  "ga": "Gaeilge",
  "bg": "Български",
  "hr": "Hrvatski",
  "lt": "Lietuvių",
  "lv": "Latviešu",
  "et": "Eesti",
  "sk": "Slovenčina",
  "sl": "Slovenščina",
  "mt": "Malti",
  "is": "Íslenska"
};

export const LANGUAGE_FULL_LABELS: Record<LangType, string> = {
  "zh-TW": "繁體中文 (Traditional Chinese)",
  "en": "English",
  "fr": "Français (French)",
  "ja": "日本語 (Japanese)",
  "ko": "한국어 (Korean)",
  "vi": "Tiếng Việt (Vietnamese)",
  "th": "ไทย (Thai)",
  "ms": "Bahasa Melayu (Malay)",
  "ta": "தமிழ் (Tamil)",
  "fil": "Filipino (Tagalog)",
  "de": "Deutsch (German)",
  "it": "Italiano (Italian)",
  "es": "Español (Spanish)",
  "nl": "Nederlands (Dutch)",
  "pt": "Português (Portuguese)",
  "mi": "Māori (Te Reo)",
  "af": "Afrikaans (Afrikaans)",
  "ar": "العربية (Arabic)",
  "fa": "فارسی (Persian)",
  "tr": "Türkçe (Turkish)",
  "he": "עברית (Hebrew)",
  "ku": "Kurdî (Kurdish)",
  "ru": "Русский (Russian)",
  "pl": "Polski (Polish)",
  "uk": "Українська (Ukrainian)",
  "ro": "Română (Romanian)",
  "cs": "Čeština (Czech)",
  "hu": "Magyar (Hungarian)",
  "sv": "Svenska (Swedish)",
  "no": "Norsk (Norwegian)",
  "fi": "Suomi (Finnish)",
  "da": "Dansk (Danish)",
  "el": "Ελληνικά (Greek)",
  "ga": "Gaeilge (Irish)",
  "bg": "Български (Bulgarian)",
  "hr": "Hrvatski (Croatian)",
  "lt": "Lietuvių (Lithuanian)",
  "lv": "Latviešu (Latvian)",
  "et": "Eesti (Estonian)",
  "sk": "Slovenčina (Slovak)",
  "sl": "Slovenščina (Slovenian)",
  "mt": "Malti (Maltese)",
  "is": "Íslenska (Icelandic)"
};

export const LANGUAGE_FLAGS: Record<LangType, string> = {
  "zh-TW": "🇹🇼",
  "en": "🇺🇸",
  "fr": "🇫🇷",
  "ja": "🇯🇵",
  "ko": "🇰🇷",
  "vi": "🇻🇳",
  "th": "🇹🇭",
  "ms": "🇲🇾",
  "ta": "🇮🇳",
  "fil": "🇵🇭",
  "de": "🇩🇪",
  "it": "🇮🇹",
  "es": "🇪🇸",
  "nl": "🇳🇱",
  "pt": "🇵🇹",
  "mi": "🇳🇿",
  "af": "🇿🇦",
  "ar": "🇸🇦",
  "fa": "🇮🇷",
  "tr": "🇹🇷",
  "he": "🇮🇱",
  "ku": "☀️",
  "ru": "🇷🇺",
  "pl": "🇵🇱",
  "uk": "🇺🇦",
  "ro": "🇷🇴",
  "cs": "🇨🇿",
  "hu": "🇭🇺",
  "sv": "🇸🇪",
  "no": "🇳🇴",
  "fi": "🇫🇮",
  "da": "🇩🇰",
  "el": "🇬🇷",
  "ga": "🇮🇪",
  "bg": "🇧🇬",
  "hr": "🇭🇷",
  "lt": "🇱🇹",
  "lv": "🇱🇻",
  "et": "🇪🇪",
  "sk": "🇸🇰",
  "sl": "🇸🇮",
  "mt": "🇲🇹",
  "is": "🇮🇸"
};

export { TRANSLATIONS };
