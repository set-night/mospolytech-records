import { describe, expect, it } from 'vitest';
import { errorText } from '@shared/errors';
import { addDays, dayTitle, duration, fileSize, moscowDate, plural, until, weekStart } from '../src/renderer/src/shared/format';

describe('format', () => {
  it('declines Russian nouns by number', () => {
    const word = (count: number): string => plural(count, 'пару', 'пары', 'пар');
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111, 101].map(word))
      .toEqual(['пару', 'пары', 'пар', 'пар', 'пар', 'пару', 'пары', 'пар', 'пар', 'пару']);
  });

  it('tells how soon a lesson starts', () => {
    expect(until(20_000)).toBe('через 1 мин');
    expect(until(45 * 60_000)).toBe('через 45 мин');
    expect(until(120 * 60_000)).toBe('через 2 ч');
    expect(until(135 * 60_000)).toBe('через 2 ч 15 мин');
    expect(until(3 * 24 * 60 * 60_000)).toBe('через 3 дня');
  });

  it('formats durations and sizes', () => {
    expect(duration(-5)).toBe('00:00');
    expect(duration(65_000)).toBe('01:05');
    expect(duration(3_725_000)).toBe('1:02:05');
    expect(fileSize(512)).toBe('512 Б');
    expect(fileSize(1536 * 1024)).toBe('1.5 МБ');
    expect(fileSize(5 * 1024 ** 4)).toBe('5120.0 ГБ');
  });

  it('keeps dates in Moscow, whatever the computer thinks', () => {
    expect(moscowDate(Date.parse('2026-11-02T20:59:59Z'))).toBe('2026-11-02');
    expect(moscowDate(Date.parse('2026-11-02T21:00:00Z'))).toBe('2026-11-03');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayTitle('2026-11-02')).toBe('понедельник, 2 ноября');
  });
});

describe('errorText', () => {
  it('unwraps what IPC adds around a main-process error', () => {
    expect(errorText(new Error("Error invoking remote method 'checkGroup': ScheduleError: Нет связи с rasp.dmami.ru")))
      .toBe('Нет связи с rasp.dmami.ru');
    expect(errorText(new Error("Error invoking remote method 'sendChat': Error: Чат закрыт"))).toBe('Чат закрыт');
    expect(errorText(new Error('Просто ошибка'))).toBe('Просто ошибка');
    expect(errorText('строка')).toBe('строка');
  });
});
