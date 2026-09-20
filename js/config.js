// config.js
// Инициализация Supabase-клиента и модуль валидации и безопасности

const SUPABASE_URL = "https://ribxwepxmiywgyrkzjlp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_z0SBAp1Urwwvo4s263EmyQ_geW6qy23";

// Внимание: в клиентском коде используется ТОЛЬКО публичный anon-ключ.
// Секретный service_role ключ НИКОГДА не должен попадать на клиент!

if (typeof supabase === "undefined" || !supabase || typeof supabase.from !== "function") {
    var supabase = (window.supabase && window.supabase.createClient)
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        : null;
}

// ── Белые списки и ограничения безопасности ──────────────────────────────
const ALLOWED_STATUSES = [
    "Не просмотрено",
    "Просмотрено",
    "Запланировано",
    "Скоро выйдет",
    "Не вышел",
    "НЕ ОХОТА"
];

const LIMITS = {
    MAX_TITLE_LENGTH: 250,
    MAX_GENRE_LENGTH: 250,
    MAX_COMMENT_LENGTH: 2000,
    MIN_RATING: -1,
    MAX_RATING: 11
};

// Форматирование бейджа оценки фильма по правилам проекта:
// - оценка -1: красная надпись «хуйня»
// - оценки 1..5: красная плашка
// - оценки 6..10: зеленая плашка
// - оценка 11: надпись «охуенный»
function formatRatingBadge(rating) {
    if (rating === null || rating === undefined || rating === "") {
        return `<span class="muted">-</span>`;
    }
    const r = Number(rating);
    if (isNaN(r)) {
        return `<span class="muted">-</span>`;
    }
    if (r === -1) {
        return `<span class="rating-text-terrible">хуйня</span>`;
    }
    if (r >= 1 && r <= 5) {
        return `<span class="rating-badge rating-badge-red">${r}</span>`;
    }
    if (r >= 6 && r <= 10) {
        return `<span class="rating-badge rating-badge-green">${r}</span>`;
    }
    if (r === 11) {
        return `<span class="rating-text-awesome">охуенный</span>`;
    }
    if (r < 1) {
        return `<span class="rating-text-terrible">хуйня</span>`;
    }
    return `<span class="rating-badge">${r}</span>`;
}

// Универсальный парсинг введенных оценок (одной или нескольких через запятую/пробел/слэш)
function parseRatingInput(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === "") {
        return { valid: true, isMultiple: false, numbers: [], average: null, finalRating: null, error: null };
    }
    const s = String(raw).trim();
    // Ищем все числа, включая отрицательные (-1)
    const tokens = s.match(/-?\d+(?:\.\d+)?/g);
    if (!tokens || !tokens.length) {
        return { 
            valid: false, 
            isMultiple: false, 
            numbers: [], 
            average: null, 
            finalRating: null, 
            error: "Введите оценку от -1 до 11 (или несколько оценок через запятую)" 
        };
    }

    const numbers = [];
    for (const t of tokens) {
        const n = Number(t);
        if (isNaN(n) || n < LIMITS.MIN_RATING || n > LIMITS.MAX_RATING) {
            return { 
                valid: false, 
                isMultiple: tokens.length > 1, 
                numbers: [], 
                average: null, 
                finalRating: null, 
                error: `Оценка ${t} вне диапазона (от ${LIMITS.MIN_RATING} до ${LIMITS.MAX_RATING})` 
            };
        }
        numbers.push(n);
    }

    if (numbers.length === 1) {
        let single = Math.round(numbers[0]);
        if (single < -1) single = -1;
        if (single > 11) single = 11;
        if (single === 0) single = numbers[0] < 0 ? -1 : 1;
        return { valid: true, isMultiple: false, numbers, average: numbers[0], finalRating: single, error: null };
    }

    const sum = numbers.reduce((acc, v) => acc + v, 0);
    const avg = sum / numbers.length;
    let finalRating = Math.round(avg);
    if (finalRating < -1) finalRating = -1;
    if (finalRating > 11) finalRating = 11;
    if (finalRating === 0) finalRating = avg < 0 ? -1 : 1;

    return {
        valid: true,
        isMultiple: true,
        numbers,
        average: avg,
        finalRating,
        error: null
    };
}

if (typeof window !== "undefined") {
    window.formatRatingBadge = formatRatingBadge;
    window.parseRatingInput = parseRatingInput;
}

// Защита от CSV Formula Injection (нейтрализация формул для Excel)
function sanitizeFormulaInjection(str) {
    if (!str || typeof str !== "string") return "";
    const trimmed = str.trim();
    // Если строка начинается со спецсимволов формул Excel (=, +, -, @, \t, \r)
    if (/^[=+\-@\t\r]/.test(trimmed)) {
        return "'" + trimmed;
    }
    return trimmed;
}

// Санитизация текстовой строки
function sanitizeText(str, maxLength) {
    if (str == null) return "";
    let s = String(str).trim();
    // Убираем потенциально опасные управляющие ASCII символы (0-31), кроме переноса строки
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    s = sanitizeFormulaInjection(s);
    if (maxLength && s.length > maxLength) {
        s = s.slice(0, maxLength);
    }
    return s;
}

// Единая валидация данных фильма перед отправкой в базу
function validateMovieInput(movie) {
    if (!movie || typeof movie !== "object") {
        return { valid: false, error: "Некорректные данные фильма." };
    }

    const title = String(movie.title || "").trim();
    if (!title) {
        return { valid: false, error: "Название фильма обязательно для заполнения." };
    }
    if (title.length > LIMITS.MAX_TITLE_LENGTH) {
        return { valid: false, error: `Название фильма не должно превышать ${LIMITS.MAX_TITLE_LENGTH} символов.` };
    }

    const genre = String(movie.genre || "").trim();
    if (genre.length > LIMITS.MAX_GENRE_LENGTH) {
        return { valid: false, error: `Жанр не должен превышать ${LIMITS.MAX_GENRE_LENGTH} символов.` };
    }

    const comment = String(movie.comment || "").trim();
    if (comment.length > LIMITS.MAX_COMMENT_LENGTH) {
        return { valid: false, error: `Комментарий не должен превышать ${LIMITS.MAX_COMMENT_LENGTH} символов.` };
    }

    const status = String(movie.status || "Не просмотрено").trim();
    if (status && !ALLOWED_STATUSES.includes(status)) {
        return { valid: false, error: "Указан недопустимый статус фильма." };
    }

    let ratings = null;
    if (movie.ratings !== null && movie.ratings !== undefined && movie.ratings !== "") {
        const parsed = parseRatingInput(movie.ratings);
        if (!parsed.valid) {
            return { valid: false, error: parsed.error || `Оценка должна быть числом от ${LIMITS.MIN_RATING} до ${LIMITS.MAX_RATING}.` };
        }
        ratings = parsed.finalRating;
    }

    return {
        valid: true,
        sanitized: {
            title: sanitizeText(title, LIMITS.MAX_TITLE_LENGTH),
            genre: sanitizeText(genre, LIMITS.MAX_GENRE_LENGTH),
            comment: sanitizeText(comment, LIMITS.MAX_COMMENT_LENGTH),
            status: status || "Не просмотрено",
            ratings: ratings
        }
    };
}

// Защита от флуда запросами (Client-side rate-limiting)
let lastWriteTime = 0;
const WRITE_COOLDOWN_MS = 250; // Минимальный интервал между одиночными операциями записи

function checkWriteCooldown() {
    const now = Date.now();
    if (now - lastWriteTime < WRITE_COOLDOWN_MS) {
        return false;
    }
    lastWriteTime = now;
    return true;
}

// ── Работа с базой данных (CRUD) ─────────────────────────────────────────

// Загрузка всех фильмов
async function loadMovies() {
    if (!supabase) return [];
    try {
        const { data, error } = await supabase
            .from("movies")
            .select("id, title, genre, comment, status, ratings")
            .order("id", { ascending: true });

        if (error) {
            console.error("Ошибка загрузки фильмов:", error.message);
            return [];
        }
        return data || [];
    } catch (err) {
        console.error("Сетевая ошибка при загрузке фильмов:", err);
        return [];
    }
}

// Добавление фильма
async function insertMovie(rawMovie) {
    if (!supabase) return false;

    const validation = validateMovieInput(rawMovie);
    if (!validation.valid) {
        alert(validation.error);
        return false;
    }

    const movie = validation.sanitized;

    try {
        const { error } = await supabase
            .from("movies")
            .insert({
                title: movie.title,
                genre: movie.genre,
                comment: movie.comment,
                status: movie.status,
                ratings: movie.ratings
            });

        if (error) {
            console.error("Ошибка добавления фильма:", error.message);
            alert("Ошибка сохранения: " + error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error("Сетевая ошибка при добавлении:", err);
        alert("Не удалось связаться с сервером.");
        return false;
    }
}

// Обновление фильма
async function updateMovie(rawMovie) {
    if (!supabase) return false;

    const id = Number(rawMovie.id);
    if (!id || isNaN(id) || id <= 0) {
        alert("Некорректный ID фильма");
        return false;
    }

    const validation = validateMovieInput(rawMovie);
    if (!validation.valid) {
        alert(validation.error);
        return false;
    }

    const movie = validation.sanitized;

    try {
        const { error } = await supabase
            .from("movies")
            .update({
                title: movie.title,
                genre: movie.genre,
                comment: movie.comment,
                status: movie.status,
                ratings: movie.ratings
            })
            .eq("id", id);

        if (error) {
            console.error("Ошибка обновления фильма:", error.message);
            alert("Ошибка сохранения: " + error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error("Сетевая ошибка при обновлении:", err);
        alert("Не удалось связаться с сервером.");
        return false;
    }
}

// Удаление фильма
async function deleteMovie(rawId) {
    if (!supabase) return false;

    const id = Number(rawId);
    if (!id || isNaN(id) || id <= 0) {
        alert("Некорректный ID фильма");
        return false;
    }

    try {
        const { error } = await supabase
            .from("movies")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("Ошибка удаления фильма:", error.message);
            alert("Ошибка удаления: " + error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error("Сетевая ошибка при удалении:", err);
        alert("Не удалось связаться с сервером.");
        return false;
    }
}
