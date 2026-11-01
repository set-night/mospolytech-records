# Как помочь проекту

Спасибо, что заглянули! Любая помощь ценна: сообщение об ошибке, идея, правка текста или код.

## Сообщить об ошибке или предложить идею

Откройте [issue](https://github.com/set-night/mospolytech-records/issues/new/choose) и выберите шаблон.
Для ошибок укажите версию приложения (раздел «О программе»), систему и группу.

## Подготовка

Нужны Node.js 24 (см. `.nvmrc`) и git.

```bash
git clone https://github.com/set-night/mospolytech-records.git
cd mospolytech-records
npm install
npm run dev
```

| Команда | Что делает |
|---|---|
| `npm run dev` | приложение с горячей перезагрузкой |
| `npm run check` | ESLint, проверка типов и тесты — то же, что в CI |
| `npm run pack` | собрать распакованное приложение в `dist/` |
| `npm run dist` | установщики для текущей ОС |

## Устройство проекта

Код разложен по фичам, а не по слоям:

```
src/
  shared/              типы и схемы zod, общие для всех процессов
  main/                процесс Electron
    schedule/          загрузка и кэш расписания rasp.dmami.ru
    recorder/          план записи, вход в вебинар, MediaRecorder
    recordings/        список записей на диске
    settings/          настройки
    tray.ts, updates.ts, autostart.ts
  preload/             безопасный мост window.api
  renderer/src/
    features/          экраны: status, schedule, recordings, settings, onboarding, about
    shared/            общие компоненты и хуки
tests/                 тесты vitest
```

Правила, которых мы держимся:

- **TypeScript без `any`.** Данные извне (расписание, IPC, файлы настроек) проверяются схемами zod на границе — дальше коду можно доверять.
- **Тесты на реальных данных, а не на моках.** Файловая система — во временной папке, расписание — на сохранённых ответах rasp.dmami.ru.
- **Интерфейс — на русском**, коротко и понятно человеку, который не разбирается в технике.

## Коммиты и pull request

- Сообщения коммитов и заголовок PR — в формате [Conventional Commits](https://www.conventionalcommits.org/ru/):
  `feat(schedule): показывать номер аудитории`, `fix(recorder): …`. Типы: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`.
- Перед PR запустите `npm run check`.
- PR сливаются через squash — один PR, один коммит в `main`, поэтому заголовок PR важнее отдельных коммитов.
- Если меняется интерфейс — приложите скриншот.

## Выпуск версии

1. Поднимите версию: `npm version 0.2.0 --no-git-tag-version`, закоммитьте `chore(release): v0.2.0`.
2. Создайте и отправьте тег: `git tag v0.2.0 && git push origin main v0.2.0`.
3. Workflow **Release** соберёт установщики на Windows, macOS и Linux и опубликует релиз с кнопками скачивания.

## Поведение

Будьте доброжелательны — см. [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
