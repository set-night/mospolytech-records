import { z } from 'zod';

const BASE = 'https://rasp.dmami.ru';
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEBINAR_HOSTS = ['my.mts-link.ru', 'events.webinar.ru', 'my.webinar.ru'];

export class ScheduleError extends Error {}

/** The site answered, but it has no timetable for the group. */
export class GroupNotFoundError extends ScheduleError {}

/** One schedule cell: either repeating on a weekday within `from..to`, or on one `date`. */
export interface ScheduleEntry {
  weekday: number | null;
  date: string | null;
  slot: number;
  from: string;
  to: string;
  subject: string;
  type: string;
  teacher: string;
  rooms: string;
  link: string | null;
}

export interface ParsedSchedule {
  title: string;
  /** Time grid variant of the group: 0 day, 1 and 2 evening. */
  evening: number;
  dateFrom: string;
  dateTo: string;
  entries: ScheduleEntry[];
}

const auditory = z.object({ title: z.string().catch('') });
const lessonSchema = z.object({
  sbj: z.string().min(1),
  df: z.string().regex(DATE),
  dt: z.string().regex(DATE),
  teacher: z.string().nullish(),
  type: z.string().nullish(),
  location: z.string().nullish(),
  shortRooms: z.array(z.string()).nullish().catch(null),
  auditories: z.array(auditory).nullish().catch(null),
  e_link: z.string().nullish().catch(null),
});
const responseSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  grid: z.record(z.string(), z.record(z.string(), z.array(z.unknown())).or(z.array(z.unknown()))).optional(),
  group: z.object({
    title: z.string(),
    dateFrom: z.string().regex(DATE).nullish(),
    dateTo: z.string().regex(DATE).nullish(),
    evening: z.coerce.number().int().min(0).max(2).catch(0),
  }).optional(),
});

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(value: string): string {
  return value.replace(/&(?:(amp|lt|gt|quot|apos|nbsp)|#(\d{1,7})|#x([0-9a-f]{1,6}));/gi, (match, name?: string, decimal?: string, hex?: string) => {
    if (name) return ENTITIES[name.toLowerCase()] ?? match;
    const code = decimal ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? '', 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

function plain(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Only HTTPS MTS Link rooms are recordable; other links (docs, LMS) are ignored. */
export function webinarUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(decodeEntities(value.trim()));
    return url.protocol === 'https:' && WEBINAR_HOSTS.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function lessonLink(lesson: z.infer<typeof lessonSchema>): string | null {
  for (const { title } of lesson.auditories ?? []) {
    for (const match of title.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      const link = webinarUrl(match[1]);
      if (link) return link;
    }
  }
  return webinarUrl(lesson.e_link);
}

function lessonRooms(lesson: z.infer<typeof lessonSchema>): string {
  const short = (lesson.shortRooms ?? []).map(plain).filter(Boolean);
  if (short.length) return short.join(', ');
  const titles = (lesson.auditories ?? []).map(({ title }) => plain(title)).filter(Boolean);
  return titles.length ? titles.join(', ') : plain(lesson.location ?? '');
}

/** Parses a `/site/group` response; malformed single lessons are skipped, not fatal. */
export function parseSchedule(value: unknown): ParsedSchedule {
  const body = responseSchema.safeParse(value);
  if (!body.success) throw new ScheduleError('Сайт расписания вернул неожиданный ответ');
  if (body.data.status !== 'ok' || !body.data.group || !body.data.grid) {
    throw new GroupNotFoundError(body.data.message || 'Расписание для группы не найдено');
  }
  const { group, grid } = body.data;
  const entries: ScheduleEntry[] = [];
  for (const [day, slots] of Object.entries(grid)) {
    const weekday = /^[1-7]$/.test(day) ? Number(day) : null;
    const date = DATE.test(day) ? day : null;
    if (weekday === null && date === null) continue;
    const cells = Array.isArray(slots) ? Object.fromEntries(slots.map((cell, index) => [String(index + 1), cell])) : slots;
    for (const [slotKey, lessons] of Object.entries(cells)) {
      if (!/^[1-7]$/.test(slotKey) || !Array.isArray(lessons)) continue;
      for (const raw of lessons) {
        const lesson = lessonSchema.safeParse(raw);
        if (!lesson.success) continue;
        const data = lesson.data;
        entries.push({
          weekday, date, slot: Number(slotKey), from: data.df, to: data.dt,
          subject: plain(data.sbj), type: plain(data.type ?? ''), teacher: plain(data.teacher ?? ''),
          rooms: lessonRooms(data), link: lessonLink(data),
        });
      }
    }
  }
  const dates = entries.flatMap((entry) => [entry.from, entry.to]).sort();
  return {
    title: group.title,
    evening: group.evening,
    dateFrom: group.dateFrom ?? dates[0] ?? '',
    dateTo: group.dateTo ?? dates.at(-1) ?? '',
    entries,
  };
}

async function getJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { Referer: `${BASE}/`, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ScheduleError('Нет связи с rasp.dmami.ru');
  }
  if (!response.ok) throw new ScheduleError(`rasp.dmami.ru ответил ошибкой ${response.status}`);
  const tooBig = new ScheduleError('Слишком большой ответ от rasp.dmami.ru');
  // Do not even download a body the server already says is oversized.
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw tooBig;
  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    throw new ScheduleError('Нет связи с rasp.dmami.ru');
  }
  if (buffer.byteLength > MAX_BYTES) throw tooBig;
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch {
    throw new ScheduleError('rasp.dmami.ru вернул не JSON');
  }
}

export async function fetchSchedule(group: string): Promise<ParsedSchedule> {
  return parseSchedule(await getJson(`/site/group?group=${encodeURIComponent(group)}&session=0`));
}

const groupsSchema = z.object({ groups: z.record(z.string(), z.unknown()) });

export async function fetchGroups(): Promise<string[]> {
  const body = groupsSchema.safeParse(await getJson('/groups-list.json'));
  if (!body.success) throw new ScheduleError('Не удалось получить список групп');
  return Object.keys(body.data.groups).sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Normalises user input like ` 231 321 ` or `231 – 321` to the site's `231-321`. */
export function normalizeGroup(value: string): string {
  return value.trim().toUpperCase().replace(/[\s–—-]+/g, '-');
}
