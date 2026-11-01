<div align="center">

<img src="resources/icons/256x256.png" width="112" alt="" />

# MosPolytech Records

**Сам заходит на онлайн-пары Мосполитеха и записывает их — пока вы спите, едете или заняты.**

Выберите группу один раз. Дальше приложение тихо живёт в трее, смотрит расписание
на [rasp.dmami.ru](https://rasp.dmami.ru), подключается к вебинарам МТС Линк и сохраняет видео
на ваш компьютер. Никаких серверов, аккаунтов и подписок.

[![Последний релиз](https://img.shields.io/github/v/release/set-night/mospolytech-records?label=%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F&color=6366f1)](https://github.com/set-night/mospolytech-records/releases/latest)
[![Скачивания](https://img.shields.io/github/downloads/set-night/mospolytech-records/total?label=%D1%81%D0%BA%D0%B0%D1%87%D0%B8%D0%B2%D0%B0%D0%BD%D0%B8%D0%B9&color=9333ea)](https://github.com/set-night/mospolytech-records/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/set-night/mospolytech-records/ci.yml?branch=main&label=CI)](https://github.com/set-night/mospolytech-records/actions/workflows/ci.yml)
[![Лицензия MIT](https://img.shields.io/github/license/set-night/mospolytech-records?color=22c55e)](LICENSE)

<br />

### Скачать

[![Windows](https://img.shields.io/badge/Windows-%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/set-night/mospolytech-records/releases/latest/download/MosPolytech-Records-Setup-x64.exe)
[![macOS Apple Silicon](https://img.shields.io/badge/macOS-M1%E2%80%93M4-111111?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/set-night/mospolytech-records/releases/latest/download/MosPolytech-Records-arm64.dmg)
[![macOS Intel](https://img.shields.io/badge/macOS-Intel-555555?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/set-night/mospolytech-records/releases/latest/download/MosPolytech-Records-x64.dmg)
[![Linux](https://img.shields.io/badge/Linux-AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/set-night/mospolytech-records/releases/latest/download/MosPolytech-Records-x86_64.AppImage)

<sub>Другие форматы — <a href="https://github.com/set-night/mospolytech-records/releases/latest/download/MosPolytech-Records-x64.msi">.msi</a> для Windows и
<a href="https://github.com/set-night/mospolytech-records/releases/latest/download/MosPolytech-Records-amd64.deb">.deb</a> для Ubuntu/Debian — и все версии на странице
<a href="https://github.com/set-night/mospolytech-records/releases">релизов</a>.</sub>

<br /><br />

<img src="docs/screenshots/status.png" width="860" alt="Главный экран: идёт запись пары" />

</div>

## Что умеет

- 🗓️ **Красивое расписание** вашей группы на неделю — прямо из rasp.dmami.ru, работает и без интернета.
- 🔴 **Записывает сам.** За 5 минут до пары заходит в вебинар, ждёт преподавателя и пишет видео со звуком.
- 🙈 **Незаметно.** Окно вебинара скрыто, звук не играет — можно спокойно пользоваться компьютером.
- 🎚️ **Вы решаете, что записывать.** Переключатель у каждого предмета; любую идущую пару можно записать вручную.
- 🎞️ **Встроенный просмотр.** Все записи по датам, поиск по предмету и преподавателю, плеер внутри приложения.
- 💾 **Всё у вас.** Видео лежат в папке «Документы/MosPolytech Records» как обычные .mp4.
- 🚀 **Автозапуск** вместе с системой и уведомление, когда выходит новая версия.

## Как пользоваться

1. **Скачайте** установщик для своей системы по кнопке выше и установите как обычную программу.
2. **Введите номер группы**, например `241-321`, и имя, под которым приложение будет заходить в вебинар.
3. **Всё.** Значок появится в трее (рядом с часами). Компьютер должен быть включён и не спать во время пары.

<table>
  <tr>
    <td><img src="docs/screenshots/schedule.png" alt="Расписание на неделю" /></td>
    <td><img src="docs/screenshots/recordings.png" alt="Библиотека записей" /></td>
  </tr>
  <tr>
    <td align="center"><b>Расписание</b> и выбор предметов</td>
    <td align="center"><b>Записи</b> с поиском и плеером</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/onboarding.png" alt="Первый запуск" /></td>
    <td><img src="docs/screenshots/settings.png" alt="Настройки" /></td>
  </tr>
  <tr>
    <td align="center"><b>Первый запуск</b> — одна минута</td>
    <td align="center"><b>Настройки</b>: папка, качество, автозапуск</td>
  </tr>
</table>

<details>
<summary><b>Светлая тема</b> включается вместе с системной</summary>
<br />
<img src="docs/screenshots/schedule-light.png" alt="Расписание в светлой теме" />
</details>

## Частые вопросы

<details>
<summary><b>Windows пишет «Система Windows защитила ваш компьютер»</b></summary>

Приложение бесплатное и не подписано платным сертификатом. Нажмите **«Подробнее» → «Выполнить в любом случае»**.
</details>

<details>
<summary><b>macOS пишет, что приложение «повреждено» или «от неустановленного разработчика»</b></summary>

Откройте «Программы», нажмите на MosPolytech Records **правой кнопкой → «Открыть»** и подтвердите.
Если не помогло — выполните в Терминале:

```bash
xattr -cr "/Applications/MosPolytech Records.app"
```
</details>

<details>
<summary><b>Как запустить AppImage на Linux?</b></summary>

Сделайте файл исполняемым (`chmod +x MosPolytech-Records-x86_64.AppImage`) и запустите. На Ubuntu 24.04+
может понадобиться пакет `libfuse2t64`. Проще — поставить .deb.
</details>

<details>
<summary><b>Пара прошла, а записи нет</b></summary>

Проверьте, что у пары есть ссылка на вебинар (в расписании нет плашки «Без вебинара»), предмет включён,
а компьютер не уходил в сон. Приложение само повторно проверяет расписание, если ссылку добавили в последний момент.
</details>

<details>
<summary><b>Сколько места занимают записи?</b></summary>

Около 0,5 / 1 / 2 ГБ за пару в режимах «Экономно», «Обычное» и «Чётко». Качество меняется в настройках.
</details>

<details>
<summary><b>Это безопасно? Куда уходят данные?</b></summary>

Никуда. Приложение обращается только к rasp.dmami.ru (расписание), к МТС Линк (сам вебинар) и к GitHub
(проверка новой версии). Записи и настройки хранятся только на вашем компьютере. Код открыт — можно проверить.
</details>

> [!NOTE]
> Это неофициальный студенческий проект, он не связан с Московским Политехом и МТС Линк.
> Записывайте занятия ответственно и уважайте правила вуза и преподавателей.

## Для разработчиков

Electron + React + TypeScript, сборка — electron-vite, установщики — electron-builder.

```bash
npm install
npm run dev      # приложение с горячей перезагрузкой
npm run check    # линт, типы и тесты — то же, что в CI
npm run dist     # установщики для текущей ОС в dist/
```

Хотите помочь? Загляните в [CONTRIBUTING.md](CONTRIBUTING.md) — там про структуру проекта, тесты и выпуск релизов.
Нашли ошибку или есть идея — [создайте issue](https://github.com/set-night/mospolytech-records/issues/new/choose).

## Лицензия

[MIT](LICENSE) — пользуйтесь, меняйте и делитесь свободно.
