// supabase/functions/telegram-bot/index.ts
// Serverless Telegram Bot для проекта Kino Check на Supabase Edge Functions (Deno)

import { createClient } from "@supabase/supabase-js";

// Экранирование HTML-тегов для безопасной отправки сообщений в Telegram
function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Отправка сообщений через Telegram Bot API
async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  replyToMessageId?: number,
  inlineKeyboard?: any
) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: any = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
  }

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Telegram API error:", res.status, errText);
    }
  } catch (err) {
    console.error("Failed to call Telegram API:", err);
  }
}

// Точка входа в Edge Function
Deno.serve(async (req: Request) => {
  // Быстрая проверка работоспособности при открытии в браузере (GET)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "active",
        service: "Kino Check Telegram Bot",
        timestamp: new Date().toISOString(),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const secretToken = Deno.env.get("TELEGRAM_SECRET_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    "";

  if (!botToken || !supabaseUrl || !supabaseKey) {
    console.error("Missing configuration: TELEGRAM_BOT_TOKEN, SUPABASE_URL or SUPABASE_KEY");
    return new Response("Server configuration error", { status: 500 });
  }

  // Проверка секретного токена вебхука Telegram (если задан)
  if (secretToken) {
    const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (incomingSecret !== secretToken) {
      console.warn("Invalid secret token from webhook");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // Инициализация Supabase клиента (с правами service_role для гарантированной записи)
  const supabase = createClient(supabaseUrl, supabaseKey);

  let update: any;
  try {
    update = await req.json();
  } catch (_e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const message = update.message || update.edited_message;
  if (!message || !message.text) {
    // Не текстовое сообщение (стикер, фото, системное событие и т.п.)
    return new Response("OK", { status: 200 });
  }

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = message.text.trim();

  // Идентификаторы отправителя
  const userId = message.from?.id;
  const userIdStr = userId ? String(userId) : "";
  const rawUsername = message.from?.username || "";
  const usernameClean = rawUsername.toLowerCase().replace(/^@/, "");

  // Определение автора для заметки
  const senderUsername = message.from?.username;
  const senderFirstName = message.from?.first_name || "";
  const authorTag = senderUsername
    ? `@${senderUsername}`
    : senderFirstName.trim() || "участник чата";

  // Парсинг команды (поддерживает /command и /command@botname)
  const firstWord = text.split(/\s+/)[0];
  const command = firstWord.split("@")[0].toLowerCase();
  const args = text.slice(firstWord.length).trim();

  // ── Команда /myid или /id (доступна всем, чтобы узнать свой ID для белого списка) ──
  if (command === "/myid" || command === "/id") {
    const idInfoMsg =
      `🆔 <b>Ваш Telegram ID:</b> <code>${userIdStr || "Не определен"}</code>\n` +
      (rawUsername ? `👤 <b>Ваш юзернейм:</b> @${rawUsername}\n` : "") +
      `💬 <b>ID этого чата:</b> <code>${chatId}</code>\n\n` +
      `<i>Передайте эти данные администратору для добавления в белый список бота.</i>`;
    await sendTelegramMessage(botToken, chatId, idInfoMsg, messageId);
    return new Response("OK", { status: 200 });
  }

  // ── Проверка белого списка доступа (Whitelist) ───────────────────────────
  const allowedUsersEnv = Deno.env.get("ALLOWED_TELEGRAM_USERS") || "";
  const allowedChatIdsEnv = Deno.env.get("ALLOWED_CHAT_IDS") || "";

  const allowedUsers = allowedUsersEnv
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  const allowedChatIds = allowedChatIdsEnv
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const hasWhitelist = allowedUsers.length > 0 || allowedChatIds.length > 0;

  if (hasWhitelist) {
    const isUserAllowed =
      (userIdStr && allowedUsers.includes(userIdStr.toLowerCase())) ||
      (usernameClean && allowedUsers.includes(usernameClean));

    const isChatAllowed = allowedChatIds.includes(String(chatId));

    if (!isUserAllowed && !isChatAllowed) {
      // Пользователь не в белом списке — сообщаем о запрете (только если это команда)
      if (text.startsWith("/")) {
        const deniedMsg =
          `⛔ <b>Доступ ограничен</b>\n\n` +
          `Этим ботом может пользоваться только ограниченный круг лиц.\n\n` +
          `🆔 <b>Ваш Telegram ID:</b> <code>${userIdStr}</code>\n` +
          (rawUsername ? `👤 <b>Ваш юзернейм:</b> @${rawUsername}\n\n` : `\n`) +
          `Передайте эти данные администратору, чтобы получить доступ.`;

        await sendTelegramMessage(botToken, chatId, deniedMsg, messageId);
      }
      return new Response("OK", { status: 200 });
    }
  }

  try {
    switch (command) {
      // ── /start и /help ─────────────────────────────────────────────────────
      case "/start":
      case "/help": {
        const welcomeText =
          `🍿 <b>Привет! Я бот для киносписка «Kino Check»</b>\n\n` +
          `Я помогаю собирать фильмы прямо из этого чата. Все добавленные фильмы моментально появляются в общем каталоге и в колесе рулетки!\n\n` +
          `<b>Доступные команды:</b>\n` +
          `➕ <code>/add Название фильма</code>\n` +
          `   <i>Или с деталями:</i>\n` +
          `   <code>/add Начало | Фантастика | Шедевр</code>\n\n` +
          `🎲 <code>/random</code> — выбрать случайный фильм для просмотра\n` +
          `📋 <code>/list</code> — список последних фильмов в очереди\n` +
          `🔍 <code>/search Название</code> — найти фильм в базе\n` +
          `ℹ️ <code>/help</code> — показать эту подсказку`;

        await sendTelegramMessage(botToken, chatId, welcomeText, messageId);
        break;
      }

      // ── /add — Добавление фильма ───────────────────────────────────────────
      case "/add": {
        if (!args) {
          const usageText =
            `⚠️ <b>Пожалуйста, укажите название фильма!</b>\n\n` +
            `<b>Формат:</b>\n` +
            `<code>/add Название</code>\n\n` +
            `<b>Расширенный формат с жанром и комментарием:</b>\n` +
            `<code>/add Название | Жанр | Ваш комментарий</code>\n\n` +
            `<i>Пример:</i> <code>/add Интерстеллар | Фантастика, Драма</code>`;

          await sendTelegramMessage(botToken, chatId, usageText, messageId);
          break;
        }

        // Разделяем по символу "|"
        const parts = args.split("|").map((p) => p.trim());
        const title = parts[0];
        const genre = parts[1] ? parts[1].slice(0, 250) : null;
        let comment = parts[2] ? parts[2].slice(0, 2000) : null;

        // Если комментарий не указан, автоматически записываем автора
        if (!comment) {
          comment = `Предложил: ${authorTag}`;
        } else {
          comment = `${comment} (от ${authorTag})`.slice(0, 2000);
        }

        // Проверка ограничений длины
        if (title.length > 250) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `⚠️ Название фильма слишком длинное (максимум 250 символов).`,
            messageId
          );
          break;
        }

        // 1. Проверка на дубликаты (поиск без учета регистра)
        const { data: existingMovies } = await supabase
          .from("movies")
          .select("id, title, status, ratings, genre")
          .ilike("title", title)
          .limit(1);

        if (existingMovies && existingMovies.length > 0) {
          const existing = existingMovies[0];
          let dupMsg =
            `⚠️ <b>Фильм уже есть в списке!</b>\n\n` +
            `🎬 <b>«${escapeHtml(existing.title)}»</b>\n` +
            `📌 <b>Статус:</b> ${escapeHtml(existing.status || "Не указан")}\n`;

          if (existing.ratings !== null && existing.ratings !== undefined) {
            dupMsg += `⭐ <b>Оценка:</b> ${existing.ratings}/10\n`;
          }
          if (existing.genre) {
            dupMsg += `🎭 <b>Жанр:</b> ${escapeHtml(existing.genre)}\n`;
          }

          dupMsg +=
            `\n<i>Если это другой фильм с таким же именем, добавьте год: <code>/add ${escapeHtml(title)} (2024)</code></i>`;

          await sendTelegramMessage(botToken, chatId, dupMsg, messageId);
          break;
        }

        // 2. Вставка нового фильма
        const { error: insertError } = await supabase.from("movies").insert([
          {
            title: title,
            genre: genre,
            comment: comment,
            status: "Не просмотрено",
            ratings: null,
          },
        ]);

        if (insertError) {
          console.error("Supabase insert error:", insertError);
          await sendTelegramMessage(
            botToken,
            chatId,
            `❌ Ошибка при сохранении в базу данных: ${escapeHtml(insertError.message)}`,
            messageId
          );
          break;
        }

        // Успешный ответ
        let successMsg =
          `🎬 <b>Фильм добавлен в очередь!</b>\n\n` +
          `🏷 <b>Название:</b> «${escapeHtml(title)}»\n`;

        if (genre) {
          successMsg += `🎭 <b>Жанр:</b> ${escapeHtml(genre)}\n`;
        }
        if (comment) {
          successMsg += `💬 <b>Заметка:</b> ${escapeHtml(comment)}\n`;
        }
        successMsg +=
          `📌 <b>Статус:</b> Не просмотрено\n\n` +
          `<i>Фильм сразу доступен на сайте и в рулетке!</i>`;

        await sendTelegramMessage(botToken, chatId, successMsg, messageId);
        break;
      }

      // ── /random — Выбрать случайный фильм ──────────────────────────────────
      case "/random": {
        const { data: movies, error } = await supabase
          .from("movies")
          .select("id, title, genre, comment, status")
          .eq("status", "Не просмотрено");

        if (error || !movies) {
          console.error("Supabase select error:", error);
          await sendTelegramMessage(
            botToken,
            chatId,
            `❌ Не удалось получить фильмы из базы.`,
            messageId
          );
          break;
        }

        if (movies.length === 0) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `🎉 <b>Все фильмы просмотрены!</b>\n\nДобавьте новые через команду:\n<code>/add Название фильма</code>`,
            messageId
          );
          break;
        }

        // Случайный выбор
        const randomMovie = movies[Math.floor(Math.random() * movies.length)];

        let randomMsg =
          `🎲 <b>Рулетка выбрала фильм на сегодня!</b>\n\n` +
          `🎬 <b>«${escapeHtml(randomMovie.title)}»</b>\n`;

        if (randomMovie.genre) {
          randomMsg += `🎭 <b>Жанр:</b> ${escapeHtml(randomMovie.genre)}\n`;
        }
        if (randomMovie.comment) {
          randomMsg += `💬 <b>Заметка:</b> ${escapeHtml(randomMovie.comment)}\n`;
        }

        randomMsg += `\n🍿 <i>Приятного просмотра!</i>`;

        await sendTelegramMessage(botToken, chatId, randomMsg, messageId);
        break;
      }

      // ── /list — Список фильмов в ожидании ───────────────────────────────────
      case "/list": {
        const { data: movies, error, count } = await supabase
          .from("movies")
          .select("id, title, genre, comment", { count: "exact" })
          .eq("status", "Не просмотрено")
          .order("id", { ascending: false })
          .limit(10);

        if (error || !movies) {
          console.error("Supabase error:", error);
          await sendTelegramMessage(
            botToken,
            chatId,
            `❌ Ошибка при загрузке списка фильмов.`,
            messageId
          );
          break;
        }

        if (movies.length === 0) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `📋 Список к просмотру пуст. Добавьте фильм командой <code>/add Название</code>!`,
            messageId
          );
          break;
        }

        let listMsg = `📋 <b>Фильмы в очереди на просмотр:</b>\n\n`;
        movies.forEach((m, idx) => {
          listMsg += `${idx + 1}. <b>«${escapeHtml(m.title)}»</b>`;
          if (m.genre) {
            listMsg += ` <i>(${escapeHtml(m.genre)})</i>`;
          }
          listMsg += `\n`;
        });

        const total = count ?? movies.length;
        if (total > movies.length) {
          listMsg += `\n<i>...и ещё ${total - movies.length} фильмов в базе.</i>`;
        }

        await sendTelegramMessage(botToken, chatId, listMsg, messageId);
        break;
      }

      // ── /search — Поиск фильма ─────────────────────────────────────────────
      case "/search": {
        if (!args) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `⚠️ Укажите название для поиска:\n<code>/search Интерстеллар</code>`,
            messageId
          );
          break;
        }

        const { data: results, error } = await supabase
          .from("movies")
          .select("id, title, genre, status, ratings, comment")
          .ilike("title", `%${args}%`)
          .limit(5);

        if (error || !results) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `❌ Ошибка при выполнении поиска.`,
            messageId
          );
          break;
        }

        if (results.length === 0) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `🔍 По запросу <b>«${escapeHtml(args)}»</b> ничего не найдено.\n\nХотите добавить его? Отправьте:\n<code>/add ${escapeHtml(args)}</code>`,
            messageId
          );
          break;
        }

        let searchMsg = `🔍 <b>Найдено в базе (первые ${results.length}):</b>\n\n`;
        results.forEach((m, idx) => {
          searchMsg += `${idx + 1}. 🎬 <b>«${escapeHtml(m.title)}»</b>\n`;
          searchMsg += `   📌 Статус: <b>${escapeHtml(m.status || "Не указан")}</b>`;
          if (m.ratings !== null && m.ratings !== undefined) {
            searchMsg += ` | ⭐ ${m.ratings}/10`;
          }
          if (m.genre) {
            searchMsg += `\n   🎭 Жанр: ${escapeHtml(m.genre)}`;
          }
          searchMsg += `\n\n`;
        });

        await sendTelegramMessage(botToken, chatId, searchMsg.trim(), messageId);
        break;
      }

      default:
        // Если это личный диалог с ботом и команда неизвестна — подскажем /help
        if (message.chat.type === "private" && text.startsWith("/")) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `❓ Неизвестная команда. Напишите <code>/help</code> для списка доступных команд.`,
            messageId
          );
        }
        break;
    }
  } catch (err: any) {
    console.error("Unhandled error in bot handler:", err);
  }

  // Всегда возвращаем HTTP 200 Telegram-серверу, чтобы он не повторял запрос
  return new Response("OK", { status: 200 });
});
