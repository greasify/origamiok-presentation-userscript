# OrigamiOK Presentation

Юзерскрипт для [origamiok.com](https://origamiok.com). На странице инструкции появляется кнопка «Открыть презентацию».
Английский текст переводится в браузере через [Translator API](https://developer.mozilla.org/en-US/docs/Web/API/Translator).

## Разработка

```bash
pnpm install
pnpm dev
```

Страница отдает скрипт для установки. Откройте её, поставьте скрипт в Tampermonkey, Violentmonkey или Greasemonkey и зайдите на урок, например [origami swan](https://origamiok.com/origami-swan/).

Стрелки и пробел листают слайды, `F` включает полный экран, `Esc` закрывает. При первом запуске Chrome может скачать языковую модель: прогресс виден на кнопке и в панели презентации.

Локальные макеты, без менеджера скриптов:

- [fixtures/preview.html](fixtures/preview.html) — инструкция со шагами
- [fixtures/preview-guide.html](fixtures/preview-guide.html) — статья без `Step N`
- [fixtures/preview-empty.html](fixtures/preview-empty.html) — кнопки быть не должно

## Сборка

```bash
pnpm build
```

Файл для установки: `dist/origamiok-presentation.user.js`.
