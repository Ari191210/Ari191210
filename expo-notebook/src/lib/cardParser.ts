import { EXPO_CONFIG } from '../config/expo';
import type { Supplier } from '../db/types';

export interface OcrLine {
  text: string;
  /** Glyph height in px from OCR bounding boxes; bigger text is more likely the company/name. */
  height?: number;
}

export interface ParsedCard {
  company: string;
  person: string;
  role: string;
  phone: string;
  email: string;
  website: string;
}

export const PARSED_FIELDS = ['company', 'person', 'role', 'phone', 'email', 'website'] as const;

// ---------------------------------------------------------------------------
// Vocabulary

const LEGAL_SUFFIX =
  /\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|corp\.?|corporation|gmbh|co\.,?\s*ltd|plc|s\.?a\.?s?|l\.?l\.?c\.?|pte\.?|oy|ab|bv|srl|sdn\.?\s*bhd)(?=\W|$)/i;

const COMPANY_WORDS = new RegExp(
  `\\b(${[
    'technologies',
    'technology',
    'tech',
    'systems',
    'solutions',
    'industries',
    'innovations',
    'labs?',
    'enterprises?',
    'electronics',
    'automation',
    'engineering',
    'manufacturing',
    'group',
    'ventures',
    'international',
    'global',
    'works',
    'studios?',
    'motors',
    'power',
    'energy',
    'defen[cs]e',
    ...EXPO_CONFIG.companyKeywords.map((k) => k.toLowerCase()),
  ].join('|')})\\b`,
  'i',
);

const ROLE_WORDS =
  /\b(ceo|cto|coo|cfo|cmo|cpo|md|gm|agm|dgm|vp|avp|svp|evp|founder|co-?founder|director|manager|head|lead|president|chairman|chairperson|partner|proprietor|owner|chief|officer|executive|engineer|consultant|specialist|associate|analyst|designer|architect|representative|coordinator|advisor|scientist|pilot|trainer|intern|sales|marketing|business development|bd|procurement|purchase|operations|product|r&d|technical|support|strategy)\b/i;

// A line that is ONLY a department word (e.g. "Sales") is weak; real titles usually contain one of these.
const STRONG_ROLE_WORDS =
  /\b(ceo|cto|coo|cfo|cmo|cpo|md|gm|agm|dgm|vp|avp|svp|evp|founder|co-?founder|director|manager|head|lead|president|chairman|chairperson|partner|proprietor|owner|chief|officer|executive|engineer|consultant|specialist|associate|analyst|designer|architect|representative|coordinator|advisor|scientist|pilot|trainer|intern)\b/i;

const ADDRESS_WORDS =
  /\b(road|rd\.?|street|st\.|marg|lane|nagar|sector|sec\.|phase|plot|floor|flr|block|tower|building|bldg|complex|park|estate|industrial|area|near|opp\.?|behind|suite|unit|avenue|ave\.?|boulevard|blvd|highway|hwy|colony|vihar|enclave|layout|cross|main|circle|chowk|pin|zip|p\.?o\.?\s*box|district|dist\.?|taluk|india|usa|china|germany|delhi|mumbai|bengaluru|bangalore|chennai|hyderabad|pune|gurugram|gurgaon|noida|kolkata|ahmedabad|shenzhen|singapore|dubai)\b/i;

const NAME_PREFIX = /^(dr|mr|mrs|ms|miss|prof|capt|col|lt|maj|gen|wg\s*cdr|gp\s*capt|sqn\s*ldr|er|cdr|shri|smt)\.?\s+/i;

const LABEL_PREFIX =
  /^(e-?mail|email|mail|e|web|website|w|www|tel|telephone|ph|phone|mob|mobile|m|cell|c|t|p|fax|f|off|office|o|hp|whatsapp|wa)\s*[.:\-]?\s*(?=[^a-z]|$)/i;

const COMMON_TLDS =
  'com|in|co|io|net|org|ai|tech|aero|biz|info|us|uk|de|cn|jp|sg|ae|au|ca|fr|it|es|nl|eu|app|dev|xyz|me|asia|store|online|tw|kr|il|ch|se|no|fi|dk|pl|ru|br';

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const URL_RE = new RegExp(
  String.raw`\b(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:${COMMON_TLDS})(?:\.(?:in|uk|cn|jp|sg|au|tw|kr|il))?\b(?:\/[^\s,;]*)?`,
  'gi',
);
// Digits with the separators seen on cards; "/" and "," deliberately excluded (they separate numbers).
const PHONE_RE = /(?:\+|00)?\(?\d[\d\s().\-–]{6,}\d/g;
const FAX_LABEL = /\bfax\b|\bf\s*[:.]/i;
const MOBILE_LABEL = /\b(m|mob|mobile|cell|c|hp|whatsapp|wa)\s*[.:\-]/i;

// ---------------------------------------------------------------------------
// Normalisation

function cleanLine(raw: string): string {
  return raw
    .replace(/[|¦•·►▪■●◆]/g, ' | ')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s|,;:_\-–—.]+|[\s|,;:_\-–—]+$/g, '')
    .trim();
}

/** OCR commonly produces "name @ domain . com" or "name(at)domain.com". */
function normaliseForEmail(text: string): string {
  return text
    .replace(/\s*(\(at\)|\[at\]|\s@\s|\s@|@\s)\s*/gi, '@')
    .replace(/@([a-z0-9-]+)\s*\.\s*([a-z]{2,})/gi, '@$1.$2')
    .replace(/(@[a-z0-9.-]+)\s*\.\s*([a-z]{2,})\b/gi, '$1.$2');
}

function alnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function digitsOf(s: string): string {
  return s.replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// Extractors

export function extractEmails(text: string): string[] {
  const found = normaliseForEmail(text).match(EMAIL_RE) ?? [];
  return unique(found.map((e) => e.replace(/[.,;]+$/, '').toLowerCase()));
}

export function extractWebsites(text: string, emails: string[] = extractEmails(text)): string[] {
  const withoutEmails = emails.reduce(
    (t, e) => t.replace(new RegExp(escapeRe(e), 'gi'), ' '),
    normaliseForEmail(text),
  );
  const out: string[] = [];
  for (const m of withoutEmails.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;)]+$/, '');
    const start = m.index ?? 0;
    const prev = withoutEmails[start - 1];
    // Skip things like "Pvt.Ltd" or "No.12" and pieces glued to an "@".
    if (prev === '@' || /^\d+(\.\d+)+$/.test(url)) continue;
    const host = url.replace(/^https?:\/\//i, '').split('/')[0];
    const labels = host.split('.');
    const hasWww = /^www\./i.test(host) || /^https?:/i.test(url);
    // Without www/http, require a plausible domain label (≥3 chars) so "Co.In" type noise is ignored.
    if (!hasWww && (labels[0].length < 3 || /^(pvt|ltd|no|co|st|rd|dr|mr|ms)$/i.test(labels[0]))) continue;
    out.push(url.toLowerCase());
  }
  return unique(out);
}

export function extractPhones(lines: string[]): string[] {
  const mobiles: string[] = [];
  const others: string[] = [];
  for (const line of lines) {
    if (FAX_LABEL.test(line) && !MOBILE_LABEL.test(line)) continue;
    // Split on "/" or "," which separate multiple numbers on one line.
    for (const segment of line.split(/[/,;]| or /i)) {
      if (FAX_LABEL.test(segment) && !/\b(tel|ph|phone|mob|m)\b/i.test(segment)) continue;
      for (const m of segment.matchAll(PHONE_RE)) {
        const candidate = m[0].trim().replace(/[\s(–-]+$/, '');
        const d = digitsOf(candidate);
        if (d.length < 8 || d.length > 15) continue;
        // Years ranges, GSTIN-ish runs, pin codes etc. rarely have 8+ digits, but dates like 2024-2025 do.
        if (/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(candidate)) continue;
        const formatted = candidate.replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-');
        const bucket = MOBILE_LABEL.test(segment) || isIndianMobile(d) ? mobiles : others;
        bucket.push(formatted);
      }
    }
  }
  const seen = new Set<string>();
  return [...mobiles, ...others].filter((p) => {
    const key = digitsOf(p).slice(-10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isIndianMobile(d: string): boolean {
  const local = d.startsWith('91') && d.length === 12 ? d.slice(2) : d.startsWith('0') && d.length === 11 ? d.slice(1) : d;
  return local.length === 10 && /^[6-9]/.test(local);
}

// ---------------------------------------------------------------------------
// Line classification

interface Candidate {
  text: string;
  index: number;
  height: number;
}

function isAddressLike(line: string): boolean {
  if (/\b\d{3}\s?\d{3}\b/.test(line) && !/[@]/.test(line)) return true; // PIN code
  if (ADDRESS_WORDS.test(line) && (/\d/.test(line) || line.includes(','))) return true;
  if (/^(address|addr|regd|registered office|corp\.? office|factory|works)\b/i.test(line)) return true;
  return false;
}

function looksLikeName(line: string): boolean {
  const stripped = line.replace(NAME_PREFIX, '').replace(/[.,]/g, ' ').trim();
  if (!stripped || /\d|@|www|http/i.test(stripped)) return false;
  if (ROLE_WORDS.test(stripped) || LEGAL_SUFFIX.test(stripped) || COMPANY_WORDS.test(stripped)) return false;
  const words = stripped.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  if (words.length === 1 && !NAME_PREFIX.test(line)) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'’-]*$/.test(w) || /^[A-Z]$/.test(w));
}

function roleStrength(line: string): number {
  if (!ROLE_WORDS.test(line)) return 0;
  if (LEGAL_SUFFIX.test(line)) return 0;
  const words = line.split(/\s+/).length;
  if (words > 8) return 0;
  return STRONG_ROLE_WORDS.test(line) ? 2 : 1;
}

function companyStrength(line: string): number {
  if (LEGAL_SUFFIX.test(line)) return 3;
  if (COMPANY_WORDS.test(line) && !STRONG_ROLE_WORDS.test(line)) return 2;
  return 0;
}

function domainMatchesLine(domain: string, line: string): boolean {
  const label = alnum(domain.replace(/^www\./, '').split('.')[0]);
  const l = alnum(line);
  if (label.length < 3 || l.length < 3) return false;
  if (l.includes(label) || label.includes(l)) return true;
  // First word match: "SkyEye" vs skyeyeaero.com
  const first = alnum(line.split(/\s+/)[0]);
  return first.length >= 4 && label.startsWith(first);
}

const FREE_MAIL = /^(gmail|yahoo|outlook|hotmail|live|icloud|rediffmail|protonmail|proton|aol|zoho|qq|163|126|ymail|me)\./i;

/** Split "Rahul Sharma | CEO" or "Rahul Sharma, Founder & CEO" into name + title parts. */
function splitNameRole(line: string): { name: string; role: string } | null {
  const parts = line.split(/\s*(?:\||,|–|—|\s-\s)\s*/).filter(Boolean);
  if (parts.length < 2) return null;
  const [first, ...rest] = parts;
  const restText = rest.join(', ');
  if (looksLikeName(first) && roleStrength(restText) > 0 && !looksLikeName(restText)) {
    return { name: first, role: restText };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main entry

export function parseCard(input: string | OcrLine[]): ParsedCard {
  const rawLines: OcrLine[] =
    typeof input === 'string' ? input.split(/\r?\n/).map((text) => ({ text })) : input;

  const lines: Candidate[] = [];
  rawLines.forEach((l) => {
    const text = cleanLine(l.text);
    // Drop OCR noise: too short or mostly symbols.
    const letters = text.replace(/[^a-z0-9@]/gi, '').length;
    if (text.length < 2 || letters < Math.max(2, text.length * 0.4)) return;
    lines.push({ text, index: lines.length, height: l.height ?? 0 });
  });

  const fullText = lines.map((l) => l.text).join('\n');
  const emails = extractEmails(fullText);
  const websites = extractWebsites(fullText, emails);
  const phones = extractPhones(lines.map((l) => l.text));

  const result: ParsedCard = {
    company: '',
    person: '',
    role: '',
    phone: phones.slice(0, 2).join(' / '),
    email: emails[0] ?? '',
    website: websites[0] ?? '',
  };

  // Lines that carry contact info or addresses aren't name/company/role candidates.
  const contactLine = (t: string) => {
    const n = normaliseForEmail(t);
    if (LABEL_PREFIX.test(t) && /\d|@|www|\.\w{2,}/.test(t)) return true;
    if (emails.some((e) => n.toLowerCase().includes(e))) return true;
    if (websites.some((w) => t.toLowerCase().includes(w.replace(/^https?:\/\//, '')))) return true;
    if (digitsOf(t).length >= 7 && PHONE_RE.test(t)) {
      PHONE_RE.lastIndex = 0;
      return true;
    }
    PHONE_RE.lastIndex = 0;
    return false;
  };
  const textLines = lines.filter((l) => !contactLine(l.text) && !isAddressLike(l.text));

  const maxHeight = Math.max(0, ...textLines.map((l) => l.height));
  const bigness = (l: Candidate) => (maxHeight > 0 ? l.height / maxHeight : 0);

  // --- Combined "Name | Title" lines
  let nameFromSplit: Candidate | null = null;
  for (const l of textLines) {
    const split = splitNameRole(l.text);
    if (split && companyStrength(l.text) < 3) {
      result.person = cleanPerson(split.name);
      result.role = split.role;
      nameFromSplit = l;
      break;
    }
  }

  // --- Company
  const domain = [...websites.map((w) => w.replace(/^https?:\/\//, '')), ...emails.map((e) => e.split('@')[1])].find(
    (d) => d && !FREE_MAIL.test(d),
  );
  let companyLine: Candidate | undefined;
  const companyScored = textLines
    .filter((l) => l !== nameFromSplit)
    .map((l) => {
      let score = companyStrength(l.text) * 2;
      const domainHit = !!domain && domainMatchesLine(domain, l.text);
      if (domainHit) score += 3;
      if (roleStrength(l.text) === 2 && score < 6) score -= 3;
      if (looksLikeName(l.text) && !domainHit && score < 4) score -= 2;
      score += bigness(l) * 2;
      // Logos/company names usually sit at the top of the card.
      score += Math.max(0, 1 - l.index / Math.max(1, lines.length)) * 0.5;
      if (/^[A-Z0-9 &.'-]{3,}$/.test(l.text) && !looksLikeName(l.text)) score += 0.5;
      return { l, score };
    })
    .sort((a, b) => b.score - a.score);
  if (companyScored[0] && companyScored[0].score >= 2) {
    companyLine = companyScored[0].l;
    result.company = cleanCompany(companyLine.text);
  }

  // --- Role
  const remaining = textLines.filter((l) => l !== companyLine && l !== nameFromSplit);
  let roleLine: Candidate | undefined;
  if (!result.role) {
    roleLine = remaining
      .map((l) => ({ l, s: roleStrength(l.text) }))
      .filter((x) => x.s > 0 && !looksLikeName(x.l.text))
      .sort((a, b) => b.s - a.s || a.l.index - b.l.index)[0]?.l;
    if (roleLine) result.role = roleLine.text;
  }

  // --- Person
  if (!result.person) {
    const emailLocal = emails[0] ? emails[0].split('@')[0].toLowerCase() : '';
    const emailTokens = emailLocal.split(/[._\-+0-9]+/).filter((t) => t.length >= 3);
    const nameScored = remaining
      .filter((l) => l !== roleLine && looksLikeName(l.text) && companyStrength(l.text) < 2)
      .map((l) => {
        let score = 1;
        if (roleLine && (l.index === roleLine.index - 1 || l.index === roleLine.index + 1)) score += 3;
        if (roleLine && l.index === roleLine.index - 1) score += 0.5;
        const words = l.text.toLowerCase().split(/[\s.]+/);
        if (emailTokens.some((t) => words.some((w) => w.length >= 3 && (t.startsWith(w) || w.startsWith(t))))) score += 3;
        if (NAME_PREFIX.test(l.text)) score += 2;
        score += bigness(l);
        return { l, score };
      })
      .sort((a, b) => b.score - a.score || a.l.index - b.l.index);
    if (nameScored[0]) result.person = cleanPerson(nameScored[0].l.text);
  }

  // No explicit company line: fall back to the biggest / first non-person, non-role text line.
  if (!result.company) {
    const fallback = textLines.find(
      (l) =>
        l !== nameFromSplit &&
        l !== roleLine &&
        cleanPerson(l.text) !== result.person &&
        roleStrength(l.text) === 0 &&
        !looksLikeName(l.text),
    );
    if (fallback && (bigness(fallback) >= 0.8 || fallback.index <= 1)) result.company = cleanCompany(fallback.text);
  }

  return result;
}

function cleanCompany(s: string): string {
  return s.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanPerson(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[,|]+$/, '').trim();
}

// ---------------------------------------------------------------------------
// Merging into a supplier

/** Fills only empty supplier fields. Returns the patch and which fields were filled. */
export function fillEmptyFields(
  current: Pick<Supplier, (typeof PARSED_FIELDS)[number]>,
  parsed: Partial<ParsedCard>,
): { patch: Partial<ParsedCard>; filled: (typeof PARSED_FIELDS)[number][] } {
  const patch: Partial<ParsedCard> = {};
  const filled: (typeof PARSED_FIELDS)[number][] = [];
  for (const f of PARSED_FIELDS) {
    const value = parsed[f]?.trim();
    if (value && !current[f]?.trim()) {
      patch[f] = value;
      filled.push(f);
    }
  }
  return { patch, filled };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
