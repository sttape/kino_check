# 🤖 Инструкция по настройке и запуску Telegram-бота «Kino Check»

Данный бот работает как **Serverless Edge Function** в вашем облаке Supabase.
Ему **не нужен** отдельный сервер, он работает 24/7 и подключается напрямую к таблице `movies`.

---

## Шаг 1. Создание бота в Telegram (1 минута)

1. Откройте диалог с официальным ботом **[@BotFather](https://t.me/BotFather)** в Telegram.
2. Отправьте команду:
   ```text
   /newbot
   ```
3. Введите отображаемое имя (например: `Kino Check Bot` или `Фильмы нашей компании`).
4. Введите юзернейм бота, оканчивающийся на `bot` (например: `kino_check_team_bot`).
5. **Скопируйте полученный токен** (он выглядит примерно так: `7890123456:AAFlk...xyz`).
   > ⚠️ Храните этот токен в секрете!

### Настройка меню команд в @BotFather
Чтобы в Telegram чате у пользователей было удобное всплывающее меню команд:
1. Отправьте команду в `@BotFather`:
   ```text
   /setcommands
   ```
2. Выберите созданного бота и отправьте следующий список:
   ```text
   add - Добавить фильм в список
   random - Выбрать случайный фильм к просмотру
   list - Список фильмов в очереди
   search - Найти фильм в каталоге
   myid - Узнать свой Telegram ID
   help - Показать справку
   ```

---

## Шаг 2. Добавление переменных в Supabase

Ваш проект Supabase: `https://ribxwepxmiywgyrkzjlp.supabase.co`

1. Откройте панель управления **[Supabase Dashboard](https://supabase.com/dashboard/project/ribxwepxmiywgyrkzjlp)**.
2. Перейдите в левом меню: **Project Settings** (иконка шестеренки) ➔ **Edge Functions** (или раздел **Edge Functions** в боковом меню).
3. В блоке **Secrets** (Секреты) нажмите **Add new secret**:
   - **Name:** `TELEGRAM_BOT_TOKEN`
   - **Value:** Вставьте токен бота, полученный от `@BotFather`.
4. **🔒 Ограничение круга лиц (Белый список пользователей):**
   - **Name:** `ALLOWED_TELEGRAM_USERS`
   - **Value:** Список разрешённых Telegram ID или юзернеймов через запятую:
     `@sttape, @friend_username, 123456789`
     *(Если этот секрет задан, ботом смогут пользоваться **только** указанные люди. Любой посторонний получит отказ с указанием своего Telegram ID).*
5. *(Опционально) Ограничение по конкретному чату / группе:*
   - **Name:** `ALLOWED_CHAT_IDS`
   - **Value:** ID вашей группы или беседы через запятую (например: `-1001234567890`).
6. *(Опционально)* Для дополнительной защиты от посторонних запросов к вебхуку:
   - **Name:** `TELEGRAM_SECRET_TOKEN`
   - **Value:** Любая секретная случайная строка (например: `kino_secret_abc123`).

> 💡 `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` платформа Supabase передает в функцию автоматически.

---

## Шаг 3. Развертывание функции (Deploy)

Откройте терминал в папке проекта `c:\Users\sttape\Desktop\kino_check` и выполните развертывание:

1. Авторизуйтесь в Supabase (потребуется один раз ввести Access Token из личного кабинета Supabase):
   ```bash
   npx supabase login
   ```

2. Привяжите локальный проект к вашему облачному проекту:
   ```bash
   npx supabase link --project-ref ribxwepxmiywgyrkzjlp
   ```

3. Разверните функцию `telegram-bot`:
   ```bash
   npx supabase functions deploy telegram-bot --no-verify-jwt
   ```
   > ⚠️ **Важно:** Флаг `--no-verify-jwt` обязателен, так как вебхуки от серверов Telegram приходят без заголовка JWT-авторизации Supabase.

После завершения функция будет доступна по адресу:
```text
https://ribxwepxmiywgyrkzjlp.supabase.co/functions/v1/telegram-bot
```
*(Вы можете открыть эту ссылку в браузере — она должна вернуть `{"status":"active", "service":"Kino Check Telegram Bot"}`).*

---

## Шаг 4. Привязка вебхука Telegram к вашей функции

Чтобы Telegram пересылал входящие сообщения боту в вашу функцию, выполните один запрос.

Замените `<ТОКЕН_БОТА>` на ваш токен от `@BotFather` и откройте эту ссылку в любом браузере:

```text
https://api.telegram.org/bot<ТОКЕН_БОТА>/setWebhook?url=https://ribxwepxmiywgyrkzjlp.supabase.co/functions/v1/telegram-bot
```

Если вы на шаге 2 задали `TELEGRAM_SECRET_TOKEN`, добавьте его в конец ссылки:
```text
https://api.telegram.org/bot<ТОКЕН_БОТА>/setWebhook?url=https://ribxwepxmiywgyrkzjlp.supabase.co/functions/v1/telegram-bot&secret_token=<ВАШ_СЕКРЕТ>
```

В ответ в браузере появится JSON:
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

---

## Шаг 5. Проверка работы! 🎉

1. Откройте диалог со своим ботом в Telegram или добавьте его в ваш общий чат/группу.
2. Напишите:
   ```text
   /start
   ```
   Бот поприветствует вас и покажет список команд.
3. Добавьте фильм:
   ```text
   /add Остров проклятых | Триллер, Детектив | Рекомендую!
   ```
4. Бот подтвердит сохранение, а фильм **моментально отобразится на сайте** в таблице `movies.html` и в колесе выбора!

---

### Полезные команды для проверки вебхука в будущем:

- **Узнать статус вебхука:**
  `https://api.telegram.org/bot<ТОКЕН_БОТА>/getWebhookInfo`
- **Сбросить/удалить вебхук:**
  `https://api.telegram.org/bot<ТОКЕН_БОТА>/deleteWebhook`
