// config.js
// Инициализация Supabase-клиента, модуль валидации, безопасности,
// авторизации, управления пользователями и персональными комнатами/списками (Room / List ID)

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
    MAX_LIST_ID_LENGTH: 50,
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
    if (/^[=+\-@\t\r]/.test(trimmed)) {
        return "'" + trimmed;
    }
    return trimmed;
}

// Санитизация текстовой строки
function sanitizeText(str, maxLength) {
    if (str == null) return "";
    let s = String(str).trim();
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

// ── Управление персональными списками и комнатами (Room / List ID) ───────
const STORAGE_KEY_CURRENT_LIST = "kino_current_list_id";
const STORAGE_KEY_RECENT_LISTS = "kino_recent_lists_v1";

function sanitizeListId(raw) {
    if (!raw) return "default";
    let s = String(raw).trim().toLowerCase();
    // Разрешаем буквы, цифры, дефисы, подчеркивания и кириллицу (до 50 символов)
    s = s.replace(/[^\w\u0400-\u04FF-]/gi, "");
    if (!s || s === "default" || s === "main" || s === "general") return "default";
    return s.slice(0, LIMITS.MAX_LIST_ID_LENGTH);
}

function getCurrentListId() {
    if (typeof isAuthenticated === "function" && !isAuthenticated()) {
        return "default";
    }
    try {
        const params = new URLSearchParams(window.location.search);
        const urlList = params.get("list") || params.get("room");
        if (urlList) {
            const clean = sanitizeListId(urlList);
            localStorage.setItem(STORAGE_KEY_CURRENT_LIST, clean);
            addRecentListId(clean);
            return clean;
        }
        const saved = localStorage.getItem(STORAGE_KEY_CURRENT_LIST);
        if (saved) {
            return sanitizeListId(saved);
        }
    } catch (_) {}
    return "default";
}

function getRecentListIds() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_RECENT_LISTS);
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                return arr.map(sanitizeListId).filter(id => id && id !== "default");
            }
        }
    } catch (_) {}
    return [];
}

function addRecentListId(listId) {
    const clean = sanitizeListId(listId);
    if (!clean || clean === "default") return;
    try {
        let recents = getRecentListIds().filter(id => id !== clean);
        recents.unshift(clean);
        recents = recents.slice(0, 8); // Сохраняем до 8 последних комнат
        localStorage.setItem(STORAGE_KEY_RECENT_LISTS, JSON.stringify(recents));
    } catch (_) {}
}

function removeRecentListId(listId) {
    const clean = sanitizeListId(listId);
    try {
        let recents = getRecentListIds().filter(id => id !== clean);
        localStorage.setItem(STORAGE_KEY_RECENT_LISTS, JSON.stringify(recents));
    } catch (_) {}
}

async function registerRoomInDatabase(roomId, title, createdBy) {
    const clean = sanitizeListId(roomId);
    if (!clean || clean === "default" || !supabase) return;
    try {
        let author = createdBy;
        if (!author) {
            try {
                const savedLogin = localStorage.getItem("kino_auth_last_login");
                if (savedLogin && !savedLogin.includes("@")) {
                    author = savedLogin;
                } else if (typeof isAdmin === "function" && isAdmin()) {
                    author = "Администратор";
                } else if (typeof isAuthenticated === "function" && isAuthenticated()) {
                    author = "Пользователь";
                } else {
                    author = "Гость";
                }
            } catch (_) {
                author = "Гость";
            }
        }

        // 1. Попытка через RPC
        try {
            const { data, error } = await supabase.rpc("register_room", {
                p_room_id: clean,
                p_title: title || clean,
                p_created_by: author
            });
            if (!error && data && data.success) return;
        } catch (_) {}

        // 2. Fallback через прямую вставку в таблицу rooms
        await supabase.from("rooms").upsert({
            room_id: clean,
            title: title || clean,
            created_by: author
        }, { onConflict: "room_id" });
    } catch (e) {
        console.warn("Регистрация комнаты в базе:", e);
    }
}

function switchRoom(newRoomId, optionalTitle) {
    const clean = sanitizeListId(newRoomId);
    try {
        localStorage.setItem(STORAGE_KEY_CURRENT_LIST, clean);
        if (clean !== "default") {
            addRecentListId(clean);
            registerRoomInDatabase(clean, optionalTitle);
        }
    } catch (_) {}

    // Обновляем текущий URL и перезагружаем страницу
    const url = new URL(window.location.href);
    if (clean === "default") {
        url.searchParams.delete("list");
        url.searchParams.delete("room");
    } else {
        url.searchParams.set("list", clean);
        url.searchParams.delete("room");
    }
    window.location.href = url.toString();
}

function getShareableListUrl(listId = getCurrentListId()) {
    const clean = sanitizeListId(listId);
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    if (clean === "default") {
        url.searchParams.delete("list");
        url.searchParams.delete("room");
    } else {
        url.searchParams.set("list", clean);
        url.searchParams.delete("room");
    }
    return url.toString();
}

function updateNavigationLinksWithListId() {
    const isAuth = typeof isAuthenticated === "function" ? isAuthenticated() : false;
    const currentList = isAuth ? getCurrentListId() : "default";
    const links = document.querySelectorAll(".site-nav .nav-link, .brand-block .brand");
    links.forEach(a => {
        try {
            const href = a.getAttribute("href");
            if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
            const url = new URL(href, window.location.href);
            if (!isAuth || currentList === "default") {
                url.searchParams.delete("list");
                url.searchParams.delete("room");
            } else {
                url.searchParams.set("list", currentList);
                url.searchParams.delete("room");
            }
            a.setAttribute("href", url.pathname.split("/").pop() + url.search);
        } catch (_) {}
    });
}

function parseRoomIdFromInput(raw) {
    if (!raw) return null;
    let str = String(raw).trim();
    if (!str) return null;
    if (str.includes("://") || str.includes("?") || str.includes(".html")) {
        try {
            const urlObj = str.startsWith("http") ? new URL(str) : new URL(str, window.location.origin);
            const found = urlObj.searchParams.get("list") || urlObj.searchParams.get("room");
            if (found) {
                return sanitizeListId(found);
            }
        } catch (_) {}
    }
    return sanitizeListId(str);
}

async function cloneMoviesToCurrentRoom(sourceRoomId = "default") {
    const targetRoomId = getCurrentListId();
    if (targetRoomId === "default" && sourceRoomId === "default") {
        alert("Текущая комната уже является общим списком.");
        return false;
    }

    if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
        const authOk = await ensureAuthenticated("Для копирования фильмов в комнату");
        if (!authOk) return false;
    }

    const sourceLabel = sourceRoomId === "default" ? "Общего списка" : `комнаты «${sourceRoomId}»`;
    const targetLabel = targetRoomId === "default" ? "Общий список" : `комнату «${targetRoomId}»`;

    if (!confirm(`Скопировать все фильмы из ${sourceLabel} в ${targetLabel}?`)) {
        return false;
    }

    try {
        const sourceMovies = await loadMovies(sourceRoomId);
        if (!sourceMovies || !sourceMovies.length) {
            alert(`В ${sourceLabel} нет фильмов для копирования.`);
            return false;
        }

        const inserts = sourceMovies.map(m => ({
            title: m.title,
            genre: m.genre || "",
            comment: m.comment || "",
            status: m.status || "Не просмотрено",
            ratings: m.ratings ?? null,
            list_id: targetRoomId
        }));

        const { error } = await supabase.from("movies").insert(inserts);
        if (error) {
            throw error;
        }

        registerRoomInDatabase(targetRoomId);
        clearCachedMovies(targetRoomId);
        alert(`✅ Успешно скопировано ${inserts.length} фильмов в ${targetLabel}!`);
        window.location.reload();
        return true;
    } catch (err) {
        alert("Ошибка при копировании фильмов: " + (err.message || err));
        return false;
    }
}

if (typeof window !== "undefined") {
    window.sanitizeListId = sanitizeListId;
    window.getCurrentListId = getCurrentListId;
    window.getRecentListIds = getRecentListIds;
    window.switchRoom = switchRoom;
    window.registerRoomInDatabase = registerRoomInDatabase;
    window.getShareableListUrl = getShareableListUrl;
    window.updateNavigationLinksWithListId = updateNavigationLinksWithListId;
    window.parseRoomIdFromInput = parseRoomIdFromInput;
    window.cloneMoviesToCurrentRoom = cloneMoviesToCurrentRoom;
}

// ── Временный список фильмов для неавторизованных пользователей (Гости) ──
const STORAGE_KEY_GUEST_MOVIES = "kino_guest_movies_v1";

function getGuestMovies() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_GUEST_MOVIES);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return [];
}

function setGuestMovies(movies) {
    if (!Array.isArray(movies)) return;
    try {
        localStorage.setItem(STORAGE_KEY_GUEST_MOVIES, JSON.stringify(movies));
    } catch (_) {}
}

function insertGuestMovie(rawMovie) {
    const validation = validateMovieInput(rawMovie);
    if (!validation.valid) {
        alert(validation.error);
        return null;
    }
    const movie = validation.sanitized;
    const list = getGuestMovies();
    const newId = Date.now() + Math.floor(Math.random() * 1000);
    const guestMovie = {
        id: newId,
        title: movie.title,
        genre: movie.genre || "",
        comment: movie.comment || "",
        status: movie.status || "Не просмотрено",
        ratings: movie.ratings ?? null,
        isGuest: true
    };
    list.push(guestMovie);
    setGuestMovies(list);
    return guestMovie;
}

function updateGuestMovie(rawMovie) {
    const id = Number(rawMovie.id);
    if (!id) return false;
    const validation = validateMovieInput(rawMovie);
    if (!validation.valid) {
        alert(validation.error);
        return false;
    }
    const movie = validation.sanitized;
    const list = getGuestMovies();
    const idx = list.findIndex(m => Number(m.id) === id);
    if (idx === -1) return false;
    list[idx] = {
        ...list[idx],
        title: movie.title,
        genre: movie.genre || "",
        comment: movie.comment || "",
        status: movie.status || "Не просмотрено",
        ratings: movie.ratings ?? null
    };
    setGuestMovies(list);
    return true;
}

function deleteGuestMovie(rawId) {
    const id = Number(rawId);
    if (!id) return false;
    let list = getGuestMovies();
    list = list.filter(m => Number(m.id) !== id);
    setGuestMovies(list);
    return true;
}

function clearGuestMovies() {
    try {
        localStorage.removeItem(STORAGE_KEY_GUEST_MOVIES);
    } catch (_) {}
}

// ── Кэширование списка фильмов с разделением по комнатам (list_id) ────────
function getMoviesCacheKey(listId = getCurrentListId()) {
    return `kino_movies_cache_v2_${listId || "default"}`;
}

function getCachedMovies(listId = getCurrentListId()) {
    try {
        const raw = localStorage.getItem(getMoviesCacheKey(listId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
    } catch (_) {}
    return null;
}

function setCachedMovies(movies, listId = getCurrentListId()) {
    if (!Array.isArray(movies)) return;
    try {
        localStorage.setItem(getMoviesCacheKey(listId), JSON.stringify(movies));
    } catch (_) {}
}

function clearCachedMovies(listId = getCurrentListId()) {
    try {
        localStorage.removeItem(getMoviesCacheKey(listId));
    } catch (_) {}
}

if (typeof window !== "undefined") {
    window.getCachedMovies = getCachedMovies;
    window.setCachedMovies = setCachedMovies;
    window.clearCachedMovies = clearCachedMovies;
    window.getGuestMovies = getGuestMovies;
    window.setGuestMovies = setGuestMovies;
    window.insertGuestMovie = insertGuestMovie;
    window.updateGuestMovie = updateGuestMovie;
    window.deleteGuestMovie = deleteGuestMovie;
    window.clearGuestMovies = clearGuestMovies;
}

// ── Работа с базой данных (CRUD) ─────────────────────────────────────────

// Загрузка всех фильмов для активной комнаты
async function loadMovies(customListId) {
    if (typeof ensureAuthInitialized === "function") {
        await ensureAuthInitialized();
    }

    const isAuth = isAuthenticated();
    const guestMovies = typeof getGuestMovies === "function" ? getGuestMovies() : [];

    // Если неавторизованный пользователь составил свой временный список — показываем его
    if (!isAuth && guestMovies.length > 0) {
        return guestMovies;
    }

    const listId = customListId ? sanitizeListId(customListId) : (isAuth ? getCurrentListId() : "default");
    if (!supabase) {
        return getCachedMovies(listId) || guestMovies || [];
    }
    try {
        let query = supabase
            .from("movies")
            .select("id, title, genre, comment, status, ratings, list_id")
            .order("id", { ascending: true });

        if (listId === "default") {
            query = query.or("list_id.eq.default,list_id.is.null");
        } else {
            query = query.eq("list_id", listId);
        }

        const { data, error } = await query;

        if (error) {
            // Если колонка list_id еще не создана в Supabase, пробуем обычный запрос без list_id
            if (error.message && (error.message.includes("list_id") || error.code === "42703")) {
                const fallbackRes = await supabase
                    .from("movies")
                    .select("id, title, genre, comment, status, ratings")
                    .order("id", { ascending: true });
                if (!fallbackRes.error && fallbackRes.data) {
                    setCachedMovies(fallbackRes.data, listId);
                    return fallbackRes.data;
                }
            }
            console.error("Ошибка загрузки фильмов:", error.message);
            return getCachedMovies(listId) || guestMovies || [];
        }
        if (data && Array.isArray(data)) {
            setCachedMovies(data, listId);
            return data;
        }
        return getCachedMovies(listId) || guestMovies || [];
    } catch (err) {
        console.error("Сетевая ошибка при загрузке фильмов:", err);
        return getCachedMovies(listId) || guestMovies || [];
    }
}

// Добавление фильма в активную комнату (или во временный список гостя)
async function insertMovie(rawMovie) {
    if (!isAuthenticated()) {
        // Для неавторизованных пользователей сохраняем во временный список гостя
        const created = insertGuestMovie(rawMovie);
        return !!created;
    }

    if (!supabase) return false;

    const validation = validateMovieInput(rawMovie);
    if (!validation.valid) {
        alert(validation.error);
        return false;
    }

    const movie = validation.sanitized;
    const listId = rawMovie.list_id ? sanitizeListId(rawMovie.list_id) : getCurrentListId();

    try {
        let payload = {
            title: movie.title,
            genre: movie.genre,
            comment: movie.comment,
            status: movie.status,
            ratings: movie.ratings,
            list_id: listId
        };

        let { error } = await supabase
            .from("movies")
            .insert(payload);

        // Если в базе еще нет колонки list_id, пробуем вставить без неё
        if (error && error.message && (error.message.includes("list_id") || error.code === "42703")) {
            delete payload.list_id;
            const res2 = await supabase.from("movies").insert(payload);
            error = res2.error;
        }

        if (error) {
            console.error("Ошибка добавления фильма:", error.message);
            alert("Ошибка сохранения: " + error.message);
            return false;
        }
        if (listId !== "default") {
            registerRoomInDatabase(listId);
        }
        clearCachedMovies(listId);
        return true;
    } catch (err) {
        console.error("Сетевая ошибка при добавлении:", err);
        alert("Не удалось связаться с сервером.");
        return false;
    }
}

// Обновление фильма
async function updateMovie(rawMovie) {
    if (!isAuthenticated()) {
        return updateGuestMovie(rawMovie);
    }

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
    const listId = rawMovie.list_id ? sanitizeListId(rawMovie.list_id) : getCurrentListId();

    try {
        let updateData = {
            title: movie.title,
            genre: movie.genre,
            comment: movie.comment,
            status: movie.status,
            ratings: movie.ratings
        };
        if (rawMovie.list_id) {
            updateData.list_id = sanitizeListId(rawMovie.list_id);
        }

        const { error } = await supabase
            .from("movies")
            .update(updateData)
            .eq("id", id);

        if (error) {
            console.error("Ошибка обновления фильма:", error.message);
            alert("Ошибка сохранения: " + error.message);
            return false;
        }
        clearCachedMovies(listId);
        return true;
    } catch (err) {
        console.error("Сетевая ошибка при обновлении:", err);
        alert("Не удалось связаться с сервером.");
        return false;
    }
}

// Удаление фильма
async function deleteMovie(rawId) {
    if (!isAuthenticated()) {
        return deleteGuestMovie(rawId);
    }

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
        clearCachedMovies(getCurrentListId());
        return true;
    } catch (err) {
        console.error("Сетевая ошибка при удалении:", err);
        alert("Не удалось связаться с сервером.");
        return false;
    }
}

// ── Авторизация через Supabase Auth для изменения данных ─────────────────────
let currentAuthSession = null;
let currentAuthUser = null;
let currentIsAdmin = false;
let isAuthInitialized = false;
let authInitPromise = null;

function ensureAuthInitialized() {
    if (!authInitPromise) {
        authInitPromise = initSupabaseAuth();
    }
    return authInitPromise;
}

// Безопасная проверка прав администратора через серверную функцию Supabase
async function refreshAdminStatus() {
    if (!isAuthenticated()) {
        currentIsAdmin = false;
        return;
    }
    try {
        const { data, error } = await supabase.rpc("check_is_admin");
        currentIsAdmin = (!error && data === true);
    } catch (_) {
        currentIsAdmin = false;
    }
}

// Инициализация и проверка сессии Supabase Auth
async function initSupabaseAuth() {
    if (!supabase || !supabase.auth) {
        isAuthInitialized = true;
        return;
    }
    try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data && data.session) {
            currentAuthSession = data.session;
            currentAuthUser = data.session.user;
            await refreshAdminStatus();
        } else {
            currentAuthSession = null;
            currentAuthUser = null;
            currentIsAdmin = false;
        }
    } catch (e) {
        console.warn("Не удалось восстановить сессию Supabase:", e);
    } finally {
        isAuthInitialized = true;
        updateNavAuthButtons();
        updateNavigationLinksWithListId();
        try {
            window.dispatchEvent(new CustomEvent("kino:auth-changed", {
                detail: {
                    session: currentAuthSession,
                    user: currentAuthUser,
                    isAdmin: currentIsAdmin,
                    isAuthenticated: isAuthenticated()
                }
            }));
        } catch (_) {}
    }

    if (!window._supabaseAuthListenerAttached) {
        window._supabaseAuthListenerAttached = true;
        try {
            supabase.auth.onAuthStateChange(async (_event, session) => {
                currentAuthSession = session;
                currentAuthUser = session ? session.user : null;
                await refreshAdminStatus();
                updateNavAuthButtons();
                updateNavigationLinksWithListId();
                try {
                    window.dispatchEvent(new CustomEvent("kino:auth-changed", {
                        detail: {
                            session: currentAuthSession,
                            user: currentAuthUser,
                            isAdmin: currentIsAdmin,
                            isAuthenticated: isAuthenticated()
                        }
                    }));
                } catch (_) {}
            });
        } catch (e) {
            console.warn("Ошибка подписки на события авторизации:", e);
        }
    }
}

if (typeof window !== "undefined") {
    window.ensureAuthInitialized = ensureAuthInitialized;
    window.initSupabaseAuth = initSupabaseAuth;
}

// Проверка: авторизован ли пользователь в Supabase Auth
function isAuthenticated() {
    return !!(currentAuthSession && currentAuthUser);
}

// Получение данных текущего пользователя
function getAuthUser() {
    return currentAuthUser;
}

// Проверка: является ли текущий пользователь главным администратором
function isAdmin() {
    return isAuthenticated() && currentIsAdmin === true;
}

// Выход из системы
async function logout() {
    if (supabase && supabase.auth) {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.error("Ошибка при выходе из Supabase:", e);
        }
    }
    currentAuthSession = null;
    currentAuthUser = null;
    currentIsAdmin = false;
    updateNavAuthButtons();
}

// Создание модального окна авторизации в DOM
function getOrCreateAuthModal() {
    let modal = document.getElementById("authPasswordModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "authPasswordModal";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="modal-backdrop" data-auth-modal-close></div>
        <div class="modal-dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
            <div class="modal-header">
                <div>
                    <p class="eyebrow">Требуется доступ</p>
                    <h2 id="authModalTitle">Вход в киноклуб</h2>
                </div>
                <button type="button" class="modal-close" data-auth-modal-close aria-label="Закрыть">×</button>
            </div>
            <form id="authPasswordForm" class="movie-form modal-form">
                <p id="authActionText" class="auth-action-text muted">Для выполнения этого действия войдите под своей учетной записью:</p>
                <label>
                    <span>Логин:</span>
                    <input type="text" id="authLoginInput" placeholder="Например: admin или ваш логин" required autocomplete="username">
                </label>
                <label>
                    <span>Пароль:</span>
                    <div class="input-with-actions single-action">
                        <input type="password" id="authPasswordInput" placeholder="Введите пароль..." required autocomplete="current-password">
                        <div class="input-actions-group">
                            <button type="button" id="togglePasswordBtn" class="input-action-btn" title="Показать/скрыть пароль" aria-label="Показать/скрыть пароль">👁️</button>
                        </div>
                    </div>
                </label>
                <div id="authErrorMsg" class="auth-error-msg hidden"></div>
                <div class="modal-actions">
                    <button type="button" class="secondary-button" data-auth-modal-close>Отмена</button>
                    <button type="submit" class="primary-button" id="authSubmitBtn">Войти</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    const closeEls = modal.querySelectorAll("[data-auth-modal-close]");
    closeEls.forEach(el => {
        el.addEventListener("click", () => {
            closeAuthModal(false);
        });
    });

    const toggleBtn = modal.querySelector("#togglePasswordBtn");
    const passInput = modal.querySelector("#authPasswordInput");
    if (toggleBtn && passInput) {
        toggleBtn.addEventListener("click", () => {
            const isPass = passInput.type === "password";
            passInput.type = isPass ? "text" : "password";
            toggleBtn.textContent = isPass ? "🙈" : "👁️";
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.classList.contains("hidden")) {
            closeAuthModal(false);
        }
    });

    return modal;
}

let authResolveCallback = null;

function closeAuthModal(result) {
    const modal = document.getElementById("authPasswordModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
        const err = modal.querySelector("#authErrorMsg");
        if (err) err.classList.add("hidden");
        const pass = modal.querySelector("#authPasswordInput");
        if (pass) pass.value = "";
    }
    if (authResolveCallback) {
        authResolveCallback(result);
        authResolveCallback = null;
    }
}

// Запрос авторизации (возвращает Promise<boolean>)
async function ensureAuthenticated(actionDescription) {
    if (!isAuthInitialized && supabase && supabase.auth) {
        await initSupabaseAuth();
    }

    if (isAuthenticated()) {
        return true;
    }

    return new Promise((resolve) => {
        authResolveCallback = resolve;
        const modal = getOrCreateAuthModal();
        const actionEl = modal.querySelector("#authActionText");
        if (actionEl) {
            actionEl.textContent = actionDescription
                ? `${actionDescription}. Войдите под своей учетной записью:`
                : "Для выполнения этого действия войдите под своей учетной записью:";
        }
        const errEl = modal.querySelector("#authErrorMsg");
        if (errEl) errEl.classList.add("hidden");

        const form = modal.querySelector("#authPasswordForm");
        const loginInput = modal.querySelector("#authLoginInput");
        const passInput = modal.querySelector("#authPasswordInput");
        const submitBtn = modal.querySelector("#authSubmitBtn");

        if (loginInput) {
            try {
                const savedLogin = localStorage.getItem("kino_auth_last_login") || "";
                if (savedLogin && !loginInput.value) {
                    loginInput.value = savedLogin;
                }
            } catch (_) {}
        }
        if (passInput) passInput.value = "";

        form.onsubmit = async (e) => {
            e.preventDefault();
            const enteredLogin = loginInput ? loginInput.value.trim() : "";
            const password = passInput ? passInput.value : "";
            if (!enteredLogin || !password) return;

            if (!supabase || !supabase.auth) {
                if (errEl) {
                    errEl.classList.remove("hidden");
                    errEl.textContent = "Supabase Auth недоступен. Проверьте подключение к сети.";
                }
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Вход...";
            }
            if (errEl) errEl.classList.add("hidden");

            let emailToUse = enteredLogin;

            if (!enteredLogin.includes("@")) {
                try {
                    const { data: resolvedEmail, error: rpcErr } = await supabase.rpc("get_email_by_username", {
                        p_username: enteredLogin
                    });

                    if (!rpcErr && resolvedEmail) {
                        emailToUse = resolvedEmail;
                    } else {
                        if (errEl) {
                            errEl.classList.remove("hidden");
                            errEl.textContent = `Логин «${enteredLogin}» не найден. Проверьте логин или введите Email.`;
                        }
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = "Войти";
                        }
                        return;
                    }
                } catch (lookupErr) {
                    console.warn("Ошибка поиска email по логину:", lookupErr);
                }
            }

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: emailToUse,
                    password: password
                });

                if (error) {
                    if (errEl) {
                        errEl.classList.remove("hidden");
                        let msg = error.message;
                        if (msg.includes("Invalid login credentials")) {
                            msg = "Неверный логин или пароль.";
                        } else if (msg.includes("Email not confirmed")) {
                            msg = "Email еще не подтвержден в базе.";
                        }
                        errEl.textContent = msg;
                    }
                    if (passInput) {
                        passInput.value = "";
                        passInput.focus();
                    }
                } else if (data && data.session) {
                    currentAuthSession = data.session;
                    currentAuthUser = data.user;
                    await refreshAdminStatus();
                    try {
                        localStorage.setItem("kino_auth_last_login", enteredLogin);
                    } catch (_) {}
                    updateNavAuthButtons();
                    closeAuthModal(true);
                }
            } catch (err) {
                if (errEl) {
                    errEl.classList.remove("hidden");
                    errEl.textContent = "Ошибка при авторизации: " + (err.message || err);
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Войти";
                }
            }
        };

        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
        setTimeout(() => {
            if (loginInput && !loginInput.value) {
                loginInput.focus();
            } else if (passInput) {
                passInput.focus();
            }
        }, 50);
    });
}

// Генерация случайного пароля
function generateRandomPassword(length = 10) {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
    let pass = "";
    const array = new Uint8Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
            pass += chars[array[i] % chars.length];
        }
    } else {
        for (let i = 0; i < length; i++) {
            pass += chars[Math.floor(Math.random() * chars.length)];
        }
    }
    return pass;
}

// Экранирование HTML-символов для безопасности
function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ── Модальное окно управления пользователями (только для админа) ───────────
function getOrCreateAdminUsersModal() {
    let modal = document.getElementById("adminUsersModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "adminUsersModal";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="modal-backdrop" data-admin-modal-close></div>
        <div class="modal-dialog admin-dialog" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle">
            <div class="modal-header">
                <div>
                    <p class="eyebrow">Панель администратора</p>
                    <h2 id="adminModalTitle">Управление пользователями</h2>
                </div>
                <button type="button" class="modal-close" data-admin-modal-close aria-label="Закрыть">×</button>
            </div>

            <div class="admin-modal-body">
                <section class="admin-create-user-section">
                    <h3 class="section-subtitle">Регистрация нового пользователя</h3>
                    <p class="muted small-text">Пользователь сможет входить под своим логином и паролем для добавления, изменения и оценки фильмов.</p>
                    
                    <form id="adminCreateUserForm" class="movie-form modal-form">
                        <label>
                            <span>Логин нового пользователя:</span>
                            <input type="text" id="newUserNameInput" placeholder="например: user1, alex, misha" required autocomplete="off">
                        </label>
                        
                        <label>
                            <span>Пароль для входа:</span>
                            <div class="input-with-actions">
                                <input type="password" id="newUserPassInput" placeholder="Введите или сгенерируйте пароль..." required autocomplete="new-password">
                                <div class="input-actions-group">
                                    <button type="button" id="genNewUserPassBtn" class="input-action-btn" title="Сгенерировать случайный пароль" aria-label="Сгенерировать пароль">🎲</button>
                                    <button type="button" id="toggleNewUserPassBtn" class="input-action-btn" title="Показать/скрыть пароль" aria-label="Показать пароль">👁️</button>
                                </div>
                            </div>
                        </label>

                        <div id="adminCreateUserMsg" class="auth-error-msg hidden"></div>

                        <div class="modal-actions" style="margin-top: 14px;">
                            <button type="submit" class="primary-button" id="adminCreateUserSubmitBtn">Зарегистрировать</button>
                        </div>
                    </form>
                </section>

                <section class="admin-user-list-section">
                    <div class="section-title compact-title" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <h3 class="section-subtitle" style="margin: 0;">Зарегистрированные пользователи</h3>
                        <button type="button" id="refreshUserListBtn" class="secondary-button compact-btn">🔄 Обновить</button>
                    </div>
                    <div id="adminUsersTableWrap" class="admin-users-table-wrap">
                        <div class="muted small-text">Загрузка пользователей...</div>
                    </div>
                </section>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeEls = modal.querySelectorAll("[data-admin-modal-close]");
    closeEls.forEach(el => {
        el.addEventListener("click", () => {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
        });
    });

    const toggleBtn = modal.querySelector("#toggleNewUserPassBtn");
    const passInput = modal.querySelector("#newUserPassInput");
    if (toggleBtn && passInput) {
        toggleBtn.addEventListener("click", () => {
            const isPass = passInput.type === "password";
            passInput.type = isPass ? "text" : "password";
            toggleBtn.textContent = isPass ? "🙈" : "👁️";
        });
    }

    const genBtn = modal.querySelector("#genNewUserPassBtn");
    if (genBtn && passInput) {
        genBtn.addEventListener("click", () => {
            const pass = generateRandomPassword(10);
            passInput.value = pass;
            passInput.type = "text";
            if (toggleBtn) toggleBtn.textContent = "🙈";
        });
    }

    const refreshBtn = modal.querySelector("#refreshUserListBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            const origText = refreshBtn.innerHTML;
            refreshBtn.innerHTML = `<span>⏳ Обновление...</span>`;
            await loadAdminUserList();
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = origText;
        });
    }

    const form = modal.querySelector("#adminCreateUserForm");
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const username = modal.querySelector("#newUserNameInput")?.value.trim();
            const password = modal.querySelector("#newUserPassInput")?.value;
            const msgEl = modal.querySelector("#adminCreateUserMsg");
            const submitBtn = modal.querySelector("#adminCreateUserSubmitBtn");

            if (!username || !password) return;

            if (msgEl) {
                msgEl.classList.add("hidden");
                msgEl.style.color = "";
                msgEl.style.background = "";
                msgEl.style.borderColor = "";
            }
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Регистрация...";
            }

            try {
                const internalEmail = `${encodeURIComponent(username.toLowerCase())}@kino.internal`;

                const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
                    method: "POST",
                    headers: {
                        "apikey": SUPABASE_ANON_KEY,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email: internalEmail,
                        password: password,
                        data: { username: username }
                    })
                });

                const signupData = await signupRes.json();
                if (!signupRes.ok) {
                    throw new Error(signupData.msg || signupData.error_description || signupData.message || "Не удалось создать пользователя");
                }

                const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_register_user_profile", {
                    p_username: username,
                    p_email: internalEmail
                });

                if (rpcErr) throw new Error(rpcErr.message);
                if (rpcRes && !rpcRes.success) throw new Error(rpcRes.error || "Не удалось сохранить логин");

                if (msgEl) {
                    msgEl.classList.remove("hidden");
                    msgEl.style.color = "#4ade80";
                    msgEl.style.background = "rgba(74, 222, 128, 0.12)";
                    msgEl.style.borderColor = "rgba(74, 222, 128, 0.3)";
                    msgEl.textContent = `Пользователь «${username}» успешно зарегистрирован!`;
                }

                form.reset();
                if (passInput) passInput.type = "password";
                if (toggleBtn) toggleBtn.textContent = "👁️";
                await loadAdminUserList();

            } catch (err) {
                if (msgEl) {
                    msgEl.classList.remove("hidden");
                    msgEl.style.color = "#f87171";
                    msgEl.style.background = "rgba(248, 113, 113, 0.12)";
                    msgEl.style.borderColor = "rgba(248, 113, 113, 0.3)";
                    msgEl.textContent = "Ошибка регистрации: " + (err.message || err);
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Зарегистрировать";
                }
            }
        };
    }

    return modal;
}

// Загрузка списка пользователей для администратора
async function loadAdminUserList() {
    const modal = document.getElementById("adminUsersModal");
    if (!modal) return;
    const tableWrap = modal.querySelector("#adminUsersTableWrap");
    if (!tableWrap) return;

    if (!supabase) {
        tableWrap.innerHTML = `<p class="muted" style="padding: 16px;">Supabase не подключен.</p>`;
        return;
    }

    try {
        const { data: users, error } = await supabase
            .from("user_profiles")
            .select("id, username, created_at")
            .order("id", { ascending: true });

        if (error) {
            tableWrap.innerHTML = `<p class="muted" style="padding: 16px;">Не удалось загрузить пользователей: ${error.message}</p>`;
            return;
        }

        if (!users || users.length === 0) {
            tableWrap.innerHTML = `<p class="muted" style="padding: 16px;">Пользователи не найдены.</p>`;
            return;
        }

        let html = `
            <table class="admin-users-table">
                <thead>
                    <tr>
                        <th>Логин</th>
                        <th>Роль</th>
                        <th style="width: 120px; text-align: right;">Действие</th>
                    </tr>
                </thead>
                <tbody>
        `;

        users.forEach(u => {
            const isMainAdmin = (u.username.toLowerCase() === "admin");
            html += `
                <tr>
                    <td><strong>${escapeHtml(u.username)}</strong></td>
                    <td>
                        <span class="user-role-badge ${isMainAdmin ? 'role-admin' : 'role-user'}">
                            ${isMainAdmin ? 'Администратор' : 'Пользователь'}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        ${isMainAdmin 
                            ? `<span class="badge-main-admin">👑 Главный</span>`
                            : `<button type="button" class="btn-delete-user" data-delete-username="${escapeHtml(u.username)}">🗑️ Удалить</button>`
                        }
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        tableWrap.innerHTML = html;

        tableWrap.querySelectorAll("[data-delete-username]").forEach(btn => {
            btn.addEventListener("click", () => {
                const uname = btn.getAttribute("data-delete-username");
                if (uname) {
                    handleDeleteUser(uname);
                }
            });
        });

    } catch (e) {
        tableWrap.innerHTML = `<p class="muted" style="padding: 16px;">Ошибка сети: ${e.message || e}</p>`;
    }
}

// Удаление пользователя администратором
async function handleDeleteUser(username) {
    if (!confirm(`Удалить логин «${username}» из списка пользователей киноклуба?`)) return;

    try {
        let deleted = false;
        try {
            const { data, error } = await supabase.rpc("admin_delete_user_profile", {
                p_username: username
            });
            if (!error && data && data.success) {
                deleted = true;
            } else if (data && !data.success) {
                alert(data.error || "Не удалось удалить пользователя");
                return;
            }
        } catch (_) {}

        if (!deleted) {
            const { error: directErr } = await supabase
                .from("user_profiles")
                .delete()
                .ilike("username", username);

            if (directErr) {
                alert("Ошибка удаления: " + directErr.message);
                return;
            }
        }

        await loadAdminUserList();
    } catch (err) {
        alert("Ошибка при удалении: " + (err.message || err));
    }
}

// ── Модальное окно профиля пользователя ────────────────────────────────────
function getOrCreateUserProfileModal() {
    let modal = document.getElementById("userProfileModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "userProfileModal";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="modal-backdrop" data-profile-modal-close></div>
        <div class="modal-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
            <div class="modal-header">
                <div>
                    <p class="eyebrow">Учетная запись</p>
                    <h2 id="profileModalTitle">Профиль пользователя</h2>
                </div>
                <button type="button" class="modal-close" data-profile-modal-close aria-label="Закрыть">×</button>
            </div>
            <div class="profile-modal-body">
                <div class="profile-header-card">
                    <div class="profile-avatar" id="profileAvatarIcon">👤</div>
                    <div class="profile-info-main">
                        <h3 id="profileUsername" class="profile-username">Пользователь</h3>
                        <div id="profileRoleBadge" class="profile-role-badge">Пользователь</div>
                    </div>
                </div>

                <div class="profile-details-grid">
                    <div class="profile-detail-item">
                        <span class="detail-label">Логин для входа:</span>
                        <span id="profileLoginValue" class="detail-value">-</span>
                    </div>
                    <div class="profile-detail-item">
                        <span class="detail-label">Права доступа:</span>
                        <span id="profileAccessValue" class="detail-value">Полный доступ</span>
                    </div>
                    <div class="profile-detail-item">
                        <span class="detail-label">Активная комната:</span>
                        <span id="profileRoomValue" class="detail-value">Общий список</span>
                    </div>
                </div>

                <div class="profile-section-card">
                    <h4 class="profile-section-title">Смена пароля</h4>
                    <form id="profileChangePasswordForm" class="movie-form modal-form">
                        <label>
                            <span>Новый пароль:</span>
                            <div class="input-with-actions single-action">
                                <input type="password" id="profileNewPasswordInput" placeholder="Введите новый пароль (минимум 6 символов)" required minlength="6" autocomplete="new-password">
                                <div class="input-actions-group">
                                    <button type="button" id="toggleProfileNewPassBtn" class="input-action-btn" title="Показать/скрыть пароль" aria-label="Показать пароль">👁️</button>
                                </div>
                            </div>
                        </label>
                        <div id="profileChangePassMsg" class="auth-error-msg hidden"></div>
                        <div class="profile-form-actions">
                            <button type="submit" class="primary-button" id="profileChangePassSubmitBtn">Сохранить новый пароль</button>
                        </div>
                    </form>
                </div>

                <div class="modal-actions" style="margin-top: 14px;">
                    <button type="button" class="secondary-button" data-profile-modal-close>Закрыть</button>
                    <button type="button" id="profileModalLogoutBtn" class="danger-button">Выйти из аккаунта</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeEls = modal.querySelectorAll("[data-profile-modal-close]");
    closeEls.forEach(el => {
        el.addEventListener("click", () => {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
        });
    });

    const toggleBtn = modal.querySelector("#toggleProfileNewPassBtn");
    const passInput = modal.querySelector("#profileNewPasswordInput");
    if (toggleBtn && passInput) {
        toggleBtn.addEventListener("click", () => {
            const isPass = passInput.type === "password";
            passInput.type = isPass ? "text" : "password";
            toggleBtn.textContent = isPass ? "🙈" : "👁️";
        });
    }

    const changePassForm = modal.querySelector("#profileChangePasswordForm");
    if (changePassForm) {
        changePassForm.onsubmit = async (e) => {
            e.preventDefault();
            const newPass = passInput?.value;
            const msgEl = modal.querySelector("#profileChangePassMsg");
            const submitBtn = modal.querySelector("#profileChangePassSubmitBtn");

            if (!newPass || newPass.length < 6) {
                if (msgEl) {
                    msgEl.classList.remove("hidden");
                    msgEl.textContent = "Пароль должен содержать минимум 6 символов.";
                    msgEl.style.color = "#f87171";
                    msgEl.style.background = "rgba(248, 113, 113, 0.12)";
                    msgEl.style.borderColor = "rgba(248, 113, 113, 0.25)";
                }
                return;
            }

            if (!supabase || !supabase.auth) {
                if (msgEl) {
                    msgEl.classList.remove("hidden");
                    msgEl.textContent = "Supabase Auth недоступен.";
                }
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Сохранение...";
            }

            try {
                const { error } = await supabase.auth.updateUser({ password: newPass });
                if (error) throw error;

                if (msgEl) {
                    msgEl.classList.remove("hidden");
                    msgEl.textContent = "✅ Пароль успешно изменен!";
                    msgEl.style.color = "#4ade80";
                    msgEl.style.background = "rgba(74, 222, 128, 0.12)";
                    msgEl.style.borderColor = "rgba(74, 222, 128, 0.3)";
                }
                if (passInput) passInput.value = "";
            } catch (err) {
                if (msgEl) {
                    msgEl.classList.remove("hidden");
                    msgEl.textContent = "Ошибка смены пароля: " + (err.message || err);
                    msgEl.style.color = "#f87171";
                    msgEl.style.background = "rgba(248, 113, 113, 0.12)";
                    msgEl.style.borderColor = "rgba(248, 113, 113, 0.25)";
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Сохранить новый пароль";
                }
            }
        };
    }

    const logoutBtn = modal.querySelector("#profileModalLogoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
            const roleLabel = isAdmin() ? "Администратор" : "Пользователь";
            if (confirm(`Выйти из учетной записи (${roleLabel})? Для последующих изменений потребуется снова войти.`)) {
                logout();
            }
        });
    }

    return modal;
}

// Открытие модального окна профиля пользователя
function openUserProfileModal() {
    if (!isAuthenticated()) {
        ensureAuthenticated("Вход в личный профиль");
        return;
    }

    const modal = getOrCreateUserProfileModal();
    const isUserAdmin = isAdmin();

    let username = "Пользователь";
    try {
        const savedLogin = localStorage.getItem("kino_auth_last_login");
        if (savedLogin && !savedLogin.includes("@")) {
            username = savedLogin;
        }
    } catch (_) {}
    if (isUserAdmin && username === "Пользователь") {
        username = "admin";
    }

    const curRoom = getCurrentListId();
    const roomLabel = curRoom === "default" ? "🌐 Общий список" : `🏷️ Комната «${curRoom}»`;

    const usernameEl = modal.querySelector("#profileUsername");
    const roleBadgeEl = modal.querySelector("#profileRoleBadge");
    const loginValEl = modal.querySelector("#profileLoginValue");
    const accessValEl = modal.querySelector("#profileAccessValue");
    const roomValEl = modal.querySelector("#profileRoomValue");
    const avatarEl = modal.querySelector("#profileAvatarIcon");
    const msgEl = modal.querySelector("#profileChangePassMsg");
    const passInput = modal.querySelector("#profileNewPasswordInput");

    if (usernameEl) usernameEl.textContent = username;
    if (loginValEl) loginValEl.textContent = username;
    if (roomValEl) roomValEl.textContent = roomLabel;
    if (avatarEl) avatarEl.textContent = isUserAdmin ? "👑" : "👤";

    if (roleBadgeEl) {
        roleBadgeEl.textContent = isUserAdmin ? "Главный администратор" : "Пользователь киноклуба";
        roleBadgeEl.className = isUserAdmin ? "profile-role-badge admin" : "profile-role-badge";
    }

    if (accessValEl) {
        accessValEl.textContent = isUserAdmin
            ? "Полные права (управление фильмами, оценками, пользователями и комнатами)"
            : "Права участника (добавление, редактирование, удаление фильмов и оценка)";
    }

    if (msgEl) msgEl.classList.add("hidden");
    if (passInput) passInput.value = "";

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
}

// Открытие модального окна управления пользователями
function openAdminUsersModal() {
    if (!isAdmin()) {
        alert("Доступно только главному администратору.");
        return;
    }
    const modal = getOrCreateAdminUsersModal();
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    loadAdminUserList();
}

// ── Модальное окно управления персональной комнатой (Room Modal) ───────────
function getOrCreateRoomModal() {
    let modal = document.getElementById("roomManagerModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "roomManagerModal";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="modal-backdrop" data-room-modal-close></div>
        <div class="modal-dialog room-dialog" role="dialog" aria-modal="true" aria-labelledby="roomModalTitle">
            <div class="modal-header">
                <div>
                    <p class="eyebrow">Персональные комнаты и списки</p>
                    <h2 id="roomModalTitle">Комната киноклуба</h2>
                </div>
                <button type="button" class="modal-close" data-room-modal-close aria-label="Закрыть">×</button>
            </div>
            <div class="room-modal-body">
                <!-- Текущая активная комната -->
                <div class="room-current-card" id="roomCurrentCard">
                    <!-- Заполняется динамически -->
                </div>

                <!-- Блок 1: Подключить чужую комнату (по ссылке или названию) -->
                <div class="room-section-card">
                    <h4 class="room-section-title">➕ Подключить чужой список (по ссылке или коду)</h4>
                    <p class="muted small-text" style="margin: 0 0 10px;">Вставьте ссылку на чужой список фильмов (например, <code>https://.../movies.html?list=friends</code>) или введите код комнаты:</p>
                    <form id="roomConnectForm" class="room-switch-form">
                        <div class="room-input-row">
                            <input type="text" id="connectRoomInput" placeholder="Вставьте ссылку https://... или код комнаты..." required autocomplete="off">
                            <button type="submit" class="primary-button compact-btn">Подключить</button>
                        </div>
                    </form>
                    <div id="roomConnectMsg" class="auth-error-msg hidden" style="margin-top: 8px;"></div>
                </div>

                <!-- Блок 2: Создать новую пустую комнату -->
                <div class="room-section-card">
                    <h4 class="room-section-title">✨ Создать новую пустую комнату</h4>
                    <p class="muted small-text" style="margin: 0 0 10px;">Создайте персональную комнату с пустым списком фильмов для своего киноклуба или марафона:</p>
                    <form id="roomCreateNewForm" class="room-switch-form">
                        <div class="room-input-row">
                            <input type="text" id="createNewRoomIdInput" placeholder="Например: marvel, anime, family..." maxlength="50" required autocomplete="off">
                            <button type="submit" class="secondary-button compact-btn">Создать пустую</button>
                        </div>
                    </form>
                </div>

                <!-- Блок 3: Клонирование / копирование фильмов в текущую комнату (если не общий список) -->
                <div id="roomCloneSection" class="room-section-card hidden">
                    <h4 class="room-section-title">📥 Скопировать фильмы в эту комнату</h4>
                    <p class="muted small-text" style="margin: 0 0 10px;">Хотите заполнить текущую комнату существующими фильмами? Вы можете скопировать все фильмы из общего списка в текущую:</p>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button type="button" id="cloneFromGeneralBtn" class="secondary-button compact-btn">📋 Скопировать из общего списка</button>
                    </div>
                </div>

                <!-- Блок 4: Мои сохраненные комнаты и списки -->
                <div class="room-section-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h4 class="room-section-title" style="margin: 0;">📁 Мои комнаты и сохраненные списки</h4>
                        <span class="muted small-text" id="roomSavedCount">0 комнат</span>
                    </div>
                    <div class="room-chips-wrap" id="roomRecentChips">
                        <!-- Чипы сохраненных комнат -->
                    </div>
                </div>

                <!-- Блок 5: Поделиться текущей комнатой -->
                <div class="room-section-card">
                    <h4 class="room-section-title">🔗 Ссылка на текущую комнату</h4>
                    <p class="muted small-text" style="margin: 0 0 8px;">Отправьте эту ссылку друзьям, чтобы они сразу открыли именно этот список фильмов:</p>
                    <div class="room-share-row">
                        <input type="text" id="roomShareLinkInput" readonly class="room-share-input" spellcheck="false">
                        <button type="button" id="copyRoomShareLinkBtn" class="primary-button compact-btn">📋 Скопировать</button>
                    </div>
                    <div id="roomCopyFeedback" class="copy-feedback-msg hidden">✓ Ссылка скопирована в буфер обмена!</div>
                </div>

                <!-- Панель администратора shortcut -->
                <div id="roomAdminShortcut" class="room-admin-shortcut hidden" style="margin-top: 10px;">
                    <button type="button" id="openAdminRoomsFromRoomModalBtn" class="secondary-button" style="width: 100%; justify-content: center; gap: 8px;">
                        <span>👑 Все комнаты в базе (Панель администратора)</span>
                    </button>
                </div>

                <div class="modal-actions" style="margin-top: 14px;">
                    <button type="button" class="secondary-button" data-room-modal-close>Закрыть</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeEls = modal.querySelectorAll("[data-room-modal-close]");
    closeEls.forEach(el => {
        el.addEventListener("click", () => {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
        });
    });

    const copyBtn = modal.querySelector("#copyRoomShareLinkBtn");
    const linkInput = modal.querySelector("#roomShareLinkInput");
    const feedbackEl = modal.querySelector("#roomCopyFeedback");

    if (copyBtn && linkInput) {
        copyBtn.addEventListener("click", async () => {
            linkInput.select();
            try {
                await navigator.clipboard.writeText(linkInput.value);
            } catch (_) {
                document.execCommand("copy");
            }
            if (feedbackEl) {
                feedbackEl.classList.remove("hidden");
                setTimeout(() => {
                    feedbackEl.classList.add("hidden");
                }, 2500);
            }
        });
    }

    // Форма подключения чужой комнаты (по ссылке или коду)
    const connectForm = modal.querySelector("#roomConnectForm");
    const connectInput = modal.querySelector("#connectRoomInput");
    const connectMsg = modal.querySelector("#roomConnectMsg");

    if (connectForm && connectInput) {
        connectForm.onsubmit = (e) => {
            e.preventDefault();
            const val = connectInput.value.trim();
            if (!val) return;
            const parsed = parseRoomIdFromInput(val);
            if (!parsed) {
                if (connectMsg) {
                    connectMsg.classList.remove("hidden");
                    connectMsg.textContent = "Не удалось распознать ссылку или название комнаты.";
                }
                return;
            }
            switchRoom(parsed);
        };
    }

    // Форма создания новой пустой комнаты
    const createNewForm = modal.querySelector("#roomCreateNewForm");
    const createNewInput = modal.querySelector("#createNewRoomIdInput");

    if (createNewForm && createNewInput) {
        createNewForm.onsubmit = (e) => {
            e.preventDefault();
            const val = createNewInput.value.trim();
            if (!val) return;
            const clean = sanitizeListId(val);
            if (!clean || clean === "default") {
                alert("Укажите уникальное название комнаты.");
                return;
            }
            switchRoom(clean);
        };
    }

    // Кнопка клонирования из общего списка
    const cloneBtn = modal.querySelector("#cloneFromGeneralBtn");
    if (cloneBtn) {
        cloneBtn.addEventListener("click", async () => {
            await cloneMoviesToCurrentRoom("default");
        });
    }

    const adminShortcutBtn = modal.querySelector("#openAdminRoomsFromRoomModalBtn");
    if (adminShortcutBtn) {
        adminShortcutBtn.addEventListener("click", () => {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
            openAdminRoomsModal();
        });
    }

    return modal;
}

// Открытие модального окна управления комнатой
function openRoomModal() {
    const modal = getOrCreateRoomModal();
    const currentList = getCurrentListId();
    const isDefault = (currentList === "default");

    const currentCard = modal.querySelector("#roomCurrentCard");
    const linkInput = modal.querySelector("#roomShareLinkInput");
    const recentChips = modal.querySelector("#roomRecentChips");
    const savedCountEl = modal.querySelector("#roomSavedCount");
    const cloneSection = modal.querySelector("#roomCloneSection");
    const adminShortcut = modal.querySelector("#roomAdminShortcut");

    if (currentCard) {
        if (isDefault) {
            currentCard.innerHTML = `
                <div class="room-status-badge general">🌐 Общий список</div>
                <div class="room-status-text">
                    <strong>Вы находитесь в общем списке фильмов</strong>
                    <span class="muted small-text">Этот список виден всем пользователям по умолчанию. Вы можете создать отдельную пустую комнату или подключить чужую комнату по ссылке.</span>
                </div>
            `;
        } else {
            currentCard.innerHTML = `
                <div class="room-status-badge custom">🏷️ Комната: <b>${escapeHtml(currentList)}</b></div>
                <div class="room-status-text">
                    <strong>Персональная комната «${escapeHtml(currentList)}»</strong>
                    <span class="muted small-text">Фильмы, колесо и оценки в этой комнате изолированы от других списков.</span>
                </div>
                <button type="button" class="btn-reset-to-general compact-btn secondary-button" id="resetToGeneralBtn">↩️ В общий список</button>
            `;
            const resetBtn = currentCard.querySelector("#resetToGeneralBtn");
            if (resetBtn) {
                resetBtn.addEventListener("click", () => {
                    switchRoom("default");
                });
            }
        }
    }

    if (cloneSection) {
        if (!isDefault) {
            cloneSection.classList.remove("hidden");
        } else {
            cloneSection.classList.add("hidden");
        }
    }

    if (linkInput) {
        linkInput.value = getShareableListUrl(currentList);
    }

    if (recentChips) {
        let chipsHtml = `
            <div class="room-chip-item">
                <button type="button" class="room-chip ${isDefault ? 'active' : ''}" data-switch-room="default" title="Перейти в общий список">
                    <span>🌐 Общий список</span>
                </button>
            </div>
        `;

        const recents = getRecentListIds();
        if (savedCountEl) {
            savedCountEl.textContent = `${recents.length + 1} комнат(ы)`;
        }

        recents.forEach(r => {
            const isCur = (r === currentList);
            chipsHtml += `
                <div class="room-chip-item">
                    <button type="button" class="room-chip ${isCur ? 'active' : ''}" data-switch-room="${escapeHtml(r)}" title="Перейти в комнату «${escapeHtml(r)}»">
                        <span>🏷️ ${escapeHtml(r)}</span>
                    </button>
                    <button type="button" class="room-chip-delete" data-delete-recent="${escapeHtml(r)}" title="Убрать из списка сохраненных" aria-label="Убрать">×</button>
                </div>
            `;
        });

        recentChips.innerHTML = chipsHtml;

        recentChips.querySelectorAll("[data-switch-room]").forEach(btn => {
            btn.addEventListener("click", () => {
                const r = btn.getAttribute("data-switch-room");
                if (r) switchRoom(r);
            });
        });

        recentChips.querySelectorAll("[data-delete-recent]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const r = btn.getAttribute("data-delete-recent");
                if (r) {
                    removeRecentListId(r);
                    openRoomModal();
                }
            });
        });
    }

    if (adminShortcut) {
        if (isAdmin()) {
            adminShortcut.classList.remove("hidden");
        } else {
            adminShortcut.classList.add("hidden");
        }
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
}

// ── Модальное окно просмотра всех персональных списков (для Администратора) ──
function getOrCreateAdminRoomsModal() {
    let modal = document.getElementById("adminRoomsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "adminRoomsModal";
    modal.className = "modal hidden";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="modal-backdrop" data-admin-rooms-modal-close></div>
        <div class="modal-dialog admin-dialog admin-rooms-dialog" role="dialog" aria-modal="true" aria-labelledby="adminRoomsModalTitle">
            <div class="modal-header">
                <div>
                    <p class="eyebrow">Панель администратора</p>
                    <h2 id="adminRoomsModalTitle">Все персональные списки и комнаты</h2>
                </div>
                <button type="button" class="modal-close" data-admin-rooms-modal-close aria-label="Закрыть">×</button>
            </div>

            <div class="admin-modal-body">
                <p class="muted small-text" style="margin-top: -6px; margin-bottom: 14px;">
                    Здесь отображаются все созданные пользователями комнаты и количество фильмов в каждой из них. Вы можете мгновенно перейти в любой список, скопировать ссылку или очистить тестовые списки.
                </p>

                <div class="admin-rooms-stats-grid" id="adminRoomsStatsGrid">
                    <div class="stats-card">
                        <span class="stats-label">Всего комнат:</span>
                        <strong class="stats-value" id="statsTotalRooms">-</strong>
                    </div>
                    <div class="stats-card">
                        <span class="stats-label">Всего фильмов:</span>
                        <strong class="stats-value" id="statsTotalMovies">-</strong>
                    </div>
                    <div class="stats-card">
                        <span class="stats-label">Просмотрено:</span>
                        <strong class="stats-value stats-green" id="statsWatchedMovies">-</strong>
                    </div>
                    <div class="stats-card">
                        <span class="stats-label">В очереди:</span>
                        <strong class="stats-value stats-blue" id="statsUnwatchedMovies">-</strong>
                    </div>
                </div>

                <div class="section-title compact-title" style="display: flex; align-items: center; justify-content: space-between; margin: 16px 0 10px; gap: 10px; flex-wrap: wrap;">
                    <input type="search" id="adminRoomsSearchInput" class="compact-search-input" placeholder="Поиск комнаты..." style="flex: 1; min-width: 180px; min-height: 36px; padding: 4px 14px; font-size: 0.88rem; border-radius: 999px; background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border); color: var(--text);">
                    <button type="button" id="refreshAdminRoomsBtn" class="secondary-button compact-btn">🔄 Обновить</button>
                </div>

                <div id="adminRoomsTableWrap" class="admin-users-table-wrap">
                    <div class="muted small-text" style="padding: 16px; text-align: center;">Загрузка списка комнат...</div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeEls = modal.querySelectorAll("[data-admin-rooms-modal-close]");
    closeEls.forEach(el => {
        el.addEventListener("click", () => {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
        });
    });

    const refreshBtn = modal.querySelector("#refreshAdminRoomsBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            const orig = refreshBtn.innerHTML;
            refreshBtn.innerHTML = `<span>⏳ Обновление...</span>`;
            await loadAdminRoomsList();
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = orig;
        });
    }

    const searchInput = modal.querySelector("#adminRoomsSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            filterAdminRoomsTable(searchInput.value);
        });
    }

    return modal;
}

let cachedAdminRoomsData = [];

// Загрузка сводки по всем комнатам в базе данных для администратора
async function loadAdminRoomsList() {
    const modal = document.getElementById("adminRoomsModal");
    if (!modal) return;
    const tableWrap = modal.querySelector("#adminRoomsTableWrap");
    if (!tableWrap) return;

    if (!supabase) {
        tableWrap.innerHTML = `<p class="muted" style="padding: 16px;">Supabase не подключен.</p>`;
        return;
    }

    try {
        let rooms = [];

        // 1. Попытка через быструю RPC функцию
        try {
            const { data: rpcData, error: rpcErr } = await supabase.rpc("get_admin_rooms_summary");
            if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
                rooms = rpcData;
            }
        } catch (_) {}

        // 2. Fallback: загрузка из таблиц rooms и movies с объединением на клиенте
        if (!rooms.length) {
            let dbRooms = [];
            try {
                const { data: roomsData } = await supabase
                    .from("rooms")
                    .select("room_id, title, created_by, created_at");
                if (Array.isArray(roomsData)) {
                    dbRooms = roomsData;
                }
            } catch (_) {}

            let allMovies = [];
            try {
                const { data: moviesData } = await supabase
                    .from("movies")
                    .select("id, status, list_id");
                if (Array.isArray(moviesData)) {
                    allMovies = moviesData;
                }
            } catch (_) {}

            const map = {};
            // Гарантируем наличие Общего списка
            map["default"] = {
                room_id: "default",
                title: "Общий список",
                created_by: "Система",
                created_at: null,
                total_movies: 0,
                unwatched_count: 0,
                watched_count: 0
            };

            // Добавляем зарегистрированные комнаты
            dbRooms.forEach(r => {
                const rid = sanitizeListId(r.room_id);
                map[rid] = {
                    room_id: rid,
                    title: r.title || rid,
                    created_by: r.created_by || "Гость",
                    created_at: r.created_at || null,
                    total_movies: 0,
                    unwatched_count: 0,
                    watched_count: 0
                };
            });

            // Добавляем/агрегируем фильмы
            allMovies.forEach(m => {
                const rid = sanitizeListId(m.list_id);
                if (!map[rid]) {
                    map[rid] = {
                        room_id: rid,
                        title: rid,
                        created_by: "Гость",
                        created_at: null,
                        total_movies: 0,
                        unwatched_count: 0,
                        watched_count: 0
                    };
                }
                map[rid].total_movies++;
                const st = (m.status || "").toLowerCase();
                if (st.includes("не просмотрено")) map[rid].unwatched_count++;
                if (st.includes("просмотрено")) map[rid].watched_count++;
            });

            rooms = Object.values(map);
            rooms.sort((a, b) => {
                if (a.room_id === "default") return -1;
                if (b.room_id === "default") return 1;
                if (b.total_movies !== a.total_movies) return b.total_movies - a.total_movies;
                return (new Date(b.created_at || 0)) - (new Date(a.created_at || 0));
            });
        }

        cachedAdminRoomsData = rooms;

        // Обновляем плашки статистики
        let totalMovies = 0, totalWatched = 0, totalUnwatched = 0;
        rooms.forEach(r => {
            totalMovies += Number(r.total_movies || 0);
            totalWatched += Number(r.watched_count || 0);
            totalUnwatched += Number(r.unwatched_count || 0);
        });

        const sRooms = modal.querySelector("#statsTotalRooms");
        const sMovies = modal.querySelector("#statsTotalMovies");
        const sWatched = modal.querySelector("#statsWatchedMovies");
        const sUnwatched = modal.querySelector("#statsUnwatchedMovies");

        if (sRooms) sRooms.textContent = String(rooms.length);
        if (sMovies) sMovies.textContent = String(totalMovies);
        if (sWatched) sWatched.textContent = String(totalWatched);
        if (sUnwatched) sUnwatched.textContent = String(totalUnwatched);

        const searchInput = modal.querySelector("#adminRoomsSearchInput");
        if (searchInput && searchInput.value.trim()) {
            filterAdminRoomsTable(searchInput.value);
        } else {
            renderAdminRoomsTable(rooms);
        }

    } catch (e) {
        tableWrap.innerHTML = `<p class="muted" style="padding: 16px;">Ошибка сети: ${e.message || e}</p>`;
    }
}

function formatAdminDate(isoStr) {
    if (!isoStr) return "";
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (_) {
        return "";
    }
}

function renderAdminRoomsTable(rooms) {
    const modal = document.getElementById("adminRoomsModal");
    if (!modal) return;
    const tableWrap = modal.querySelector("#adminRoomsTableWrap");
    if (!tableWrap) return;

    if (!rooms.length) {
        tableWrap.innerHTML = `<p class="muted" style="padding: 16px; text-align: center;">Комнаты не найдены.</p>`;
        return;
    }

    const currentList = getCurrentListId();

    let html = `
        <table class="admin-users-table admin-rooms-table">
            <thead>
                <tr>
                    <th>Комната / Список</th>
                    <th>Создатель</th>
                    <th>Фильмы</th>
                    <th>Статус</th>
                    <th style="width: 190px; text-align: right;">Действия</th>
                </tr>
            </thead>
            <tbody>
    `;

    rooms.forEach(r => {
        const rid = r.room_id || "default";
        const isDef = (rid === "default");
        const isCurrent = (rid === currentList);
        const author = r.created_by || (isDef ? "Система" : "Гость");
        const dateStr = formatAdminDate(r.created_at);

        const badgeHtml = isDef
            ? `<span class="badge-general-room">🌐 Общий</span>`
            : `<span class="badge-custom-room">🏷️ ${escapeHtml(rid)}</span>`;

        html += `
            <tr data-room-row-id="${escapeHtml(rid)}">
                <td>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <strong>${escapeHtml(isDef ? "Общий список" : (r.title || rid))}</strong>
                            ${badgeHtml}
                            ${isCurrent ? `<span class="badge-active-room">Текущая</span>` : ''}
                        </div>
                        ${!isDef && r.title && r.title !== rid ? `<span class="small-text muted">Код: <code>${escapeHtml(rid)}</code></span>` : ''}
                    </div>
                </td>
                <td>
                    <div>
                        <span class="badge-author">👤 ${escapeHtml(author)}</span>
                        ${dateStr ? `<span class="room-meta-date">${escapeHtml(dateStr)}</span>` : ''}
                    </div>
                </td>
                <td>
                    <span class="room-count-pill"><b>${Number(r.total_movies || 0)}</b> ф.</span>
                </td>
                <td>
                    <div style="font-size: 0.8rem; display: flex; gap: 6px; flex-wrap: wrap;">
                        <span style="color: #4ade80;">✓ ${Number(r.watched_count || 0)}</span>
                        <span class="muted">|</span>
                        <span style="color: #38bdf8;">⏳ ${Number(r.unwatched_count || 0)}</span>
                    </div>
                </td>
                <td style="text-align: right; width: 190px;">
                    <div class="admin-room-actions">
                        <button type="button" class="btn-room-action btn-open-room" data-action-open-room="${escapeHtml(rid)}" title="Открыть эту комнату">👁️ Открыть</button>
                        <button type="button" class="btn-room-action btn-copy-room" data-action-copy-room="${escapeHtml(rid)}" title="Скопировать ссылку на комнату">📋</button>
                        ${!isDef ? `
                        <button type="button" class="btn-room-action btn-clear-room" data-action-delete-room="${escapeHtml(rid)}" title="Удалить комнату и все её фильмы">🗑️</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    tableWrap.innerHTML = html;

    tableWrap.querySelectorAll("[data-action-open-room]").forEach(btn => {
        btn.addEventListener("click", () => {
            const rid = btn.getAttribute("data-action-open-room");
            if (rid) {
                modal.classList.add("hidden");
                modal.setAttribute("aria-hidden", "true");
                switchRoom(rid);
            }
        });
    });

    tableWrap.querySelectorAll("[data-action-copy-room]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const rid = btn.getAttribute("data-action-copy-room");
            if (rid) {
                const shareUrl = getShareableListUrl(rid);
                try {
                    await navigator.clipboard.writeText(shareUrl);
                } catch (_) {}
                const orig = btn.textContent;
                btn.textContent = "✓";
                setTimeout(() => { btn.textContent = orig; }, 1500);
            }
        });
    });

    tableWrap.querySelectorAll("[data-action-delete-room]").forEach(btn => {
        btn.addEventListener("click", () => {
            const rid = btn.getAttribute("data-action-delete-room");
            if (rid) {
                handleAdminDeleteRoom(rid);
            }
        });
    });
}

function filterAdminRoomsTable(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) {
        renderAdminRoomsTable(cachedAdminRoomsData);
        return;
    }
    const filtered = cachedAdminRoomsData.filter(r => {
        return (r.room_id || "").toLowerCase().includes(q) ||
               (r.title || "").toLowerCase().includes(q) ||
               (r.created_by || "").toLowerCase().includes(q);
    });
    renderAdminRoomsTable(filtered);
}

// Полное удаление комнаты администратором
async function handleAdminDeleteRoom(roomId) {
    if (!roomId || roomId === "default") {
        alert("Нельзя удалить общий список.");
        return;
    }
    if (!confirm(`Удалить комнату «${roomId}» и ВСЕ находящиеся в ней фильмы?\nЭто действие необратимо и удалит комнату из реестра всех пользователей.`)) {
        return;
    }

    try {
        let deleted = false;
        try {
            const { data, error } = await supabase.rpc("admin_delete_room", {
                p_room_id: roomId
            });
            if (!error && data && data.success) {
                deleted = true;
            }
        } catch (_) {}

        if (!deleted) {
            await supabase.from("movies").delete().eq("list_id", roomId);
            await supabase.from("rooms").delete().eq("room_id", roomId);
        }

        clearCachedMovies(roomId);
        removeRecentListId(roomId);
        
        if (getCurrentListId() === roomId) {
            localStorage.setItem(STORAGE_KEY_CURRENT_LIST, "default");
        }

        alert(`Комната «${roomId}» и все её фильмы успешно удалены.`);
        await loadAdminRoomsList();
    } catch (err) {
        alert("Ошибка при удалении комнаты: " + (err.message || err));
    }
}

// Открытие модального окна всех комнат для администратора
function openAdminRoomsModal() {
    if (!isAdmin()) {
        alert("Доступно только главному администратору.");
        return;
    }
    const modal = getOrCreateAdminRoomsModal();
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    loadAdminRoomsList();
}

// ── Обновление навигации: кнопка комнаты и меню пользователя ──────────────
function updateNavAuthButtons() {
    updateNavigationLinksWithListId();

    const headers = document.querySelectorAll(".site-header");
    headers.forEach(header => {
        const isAuth = isAuthenticated();

        // 1. Навигация по страницам
        const nav = header.querySelector(".site-nav");
        if (nav) {
            // Ссылка на страницу оценки («Оценка») — доступна только авторизованным пользователям
            const ratingLinks = nav.querySelectorAll('a[href*="rating.html"]');
            ratingLinks.forEach(link => {
                link.style.display = isAuth ? "" : "none";
            });

            // Если старые контейнеры были внутри nav — перемещаем их наружу
            const oldRoom = nav.querySelector("#navRoomContainer");
            const oldUser = nav.querySelector("#navUserContainer");
            if (oldRoom) oldRoom.remove();
            if (oldUser) oldUser.remove();
        }

        // 2. Блок действий (комната + меню пользователя / вход)
        let actionsGroup = header.querySelector(".nav-actions-group");
        if (!actionsGroup) {
            actionsGroup = document.createElement("div");
            actionsGroup.className = "nav-actions-group";
            header.appendChild(actionsGroup);
        }

        // Кнопка активной комнаты (Room Badge) — видна ТОЛЬКО авторизованным пользователям
        let roomContainer = actionsGroup.querySelector("#navRoomContainer");
        if (!roomContainer) {
            roomContainer = document.createElement("div");
            roomContainer.id = "navRoomContainer";
            roomContainer.className = "nav-room-badge-container";
            actionsGroup.appendChild(roomContainer);
        }

        if (!isAuth) {
            roomContainer.innerHTML = "";
            roomContainer.style.display = "none";
        } else {
            roomContainer.style.display = "";
            const currentList = getCurrentListId();
            const isDefault = (currentList === "default");

            roomContainer.innerHTML = `
                <button type="button" class="nav-room-btn ${isDefault ? 'room-general' : 'room-custom'}" id="navRoomBtn" title="Управление комнатой киноклуба (${escapeHtml(isDefault ? 'Общий список' : currentList)})">
                    <span class="room-btn-icon">${isDefault ? '🌐' : '🏷️'}</span>
                    <span class="room-btn-label">${escapeHtml(isDefault ? 'Общий список' : currentList)}</span>
                    <span class="room-btn-arrow">▾</span>
                </button>
            `;

            const roomBtn = roomContainer.querySelector("#navRoomBtn");
            if (roomBtn) {
                roomBtn.addEventListener("click", () => {
                    openRoomModal();
                });
            }
        }

        // Кнопка меню пользователя / авторизации
        let authContainer = actionsGroup.querySelector("#navUserContainer");
        if (!authContainer) {
            authContainer = document.createElement("div");
            authContainer.id = "navUserContainer";
            authContainer.className = "nav-user-menu-container";
            actionsGroup.appendChild(authContainer);
        }

        if (isAuth) {
            let shortName = "Пользователь";
            try {
                const savedLogin = localStorage.getItem("kino_auth_last_login");
                if (savedLogin && !savedLogin.includes("@")) {
                    shortName = savedLogin;
                }
            } catch (_) {}
            if (isAdmin()) {
                shortName = "Администратор";
            }

            const isUserAdmin = isAdmin();
            const roleLabel = isUserAdmin ? "Администратор" : "Пользователь";

            authContainer.innerHTML = `
                <button type="button" class="nav-user-menu-btn authorized" id="navUserMenuBtn" aria-expanded="false" aria-haspopup="true" title="Меню пользователя (${escapeHtml(shortName)})">
                    <span>👤 ${escapeHtml(shortName)}</span>
                    <span class="dropdown-arrow" aria-hidden="true">▾</span>
                </button>
                <div class="nav-user-dropdown hidden" id="navUserDropdown" role="menu">
                    <div class="dropdown-user-header">
                        <span class="dropdown-user-name">${escapeHtml(shortName)}</span>
                        <span class="dropdown-user-role">${escapeHtml(roleLabel)}</span>
                    </div>
                    <button type="button" class="dropdown-item" id="menuProfileBtn" role="menuitem">
                        <span class="dropdown-icon">👤</span>
                        <span>Профиль</span>
                    </button>
                    ${isUserAdmin ? `
                    <button type="button" class="dropdown-item" id="menuAdminRoomsBtn" role="menuitem">
                        <span class="dropdown-icon">🏷️</span>
                        <span>Все комнаты и списки</span>
                    </button>
                    <button type="button" class="dropdown-item" id="menuUsersBtn" role="menuitem">
                        <span class="dropdown-icon">👥</span>
                        <span>Пользователи</span>
                    </button>
                    ` : ''}
                    <button type="button" class="dropdown-item dropdown-item-danger" id="menuLogoutBtn" role="menuitem">
                        <span class="dropdown-icon">🚪</span>
                        <span>Выйти</span>
                    </button>
                </div>
            `;

            const menuBtn = authContainer.querySelector("#navUserMenuBtn");
            const dropdown = authContainer.querySelector("#navUserDropdown");
            const profileBtn = authContainer.querySelector("#menuProfileBtn");
            const adminRoomsBtn = authContainer.querySelector("#menuAdminRoomsBtn");
            const usersBtn = authContainer.querySelector("#menuUsersBtn");
            const logoutBtn = authContainer.querySelector("#menuLogoutBtn");

            if (menuBtn && dropdown) {
                menuBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const isHidden = dropdown.classList.contains("hidden");
                    document.querySelectorAll(".nav-user-dropdown").forEach(d => {
                        if (d !== dropdown) d.classList.add("hidden");
                    });
                    document.querySelectorAll(".nav-user-menu-btn").forEach(b => {
                        if (b !== menuBtn) b.setAttribute("aria-expanded", "false");
                    });

                    if (isHidden) {
                        dropdown.classList.remove("hidden");
                        menuBtn.setAttribute("aria-expanded", "true");
                    } else {
                        dropdown.classList.add("hidden");
                        menuBtn.setAttribute("aria-expanded", "false");
                    }
                });
            }

            if (profileBtn) {
                profileBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    dropdown?.classList.add("hidden");
                    menuBtn?.setAttribute("aria-expanded", "false");
                    openUserProfileModal();
                });
            }

            if (adminRoomsBtn) {
                adminRoomsBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    dropdown?.classList.add("hidden");
                    menuBtn?.setAttribute("aria-expanded", "false");
                    openAdminRoomsModal();
                });
            }

            if (usersBtn) {
                usersBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    dropdown?.classList.add("hidden");
                    menuBtn?.setAttribute("aria-expanded", "false");
                    openAdminUsersModal();
                });
            }

            if (logoutBtn) {
                logoutBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    dropdown?.classList.add("hidden");
                    menuBtn?.setAttribute("aria-expanded", "false");
                    if (confirm(`Выйти из учетной записи (${roleLabel})? Для последующих изменений потребуется снова войти.`)) {
                        logout();
                    }
                });
            }
        } else {
            authContainer.innerHTML = `
                <button type="button" class="nav-auth-btn" id="navAuthBtn" title="Войти для добавления, изменения и оценки фильмов">
                    <span>🔑 Вход</span>
                </button>
            `;
            const loginBtn = authContainer.querySelector("#navAuthBtn");
            if (loginBtn) {
                loginBtn.addEventListener("click", () => {
                    ensureAuthenticated("Вход в систему управления");
                });
            }
        }
    });
}

// Глобальные слушатели клика и клавиши Escape для закрытия выпадающего меню
if (!window._navUserMenuListenersAttached) {
    window._navUserMenuListenersAttached = true;
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".nav-user-menu-container")) {
            document.querySelectorAll(".nav-user-dropdown").forEach(d => d.classList.add("hidden"));
            document.querySelectorAll(".nav-user-menu-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".nav-user-dropdown").forEach(d => d.classList.add("hidden"));
            document.querySelectorAll(".nav-user-menu-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
        }
    });
}

window.addEventListener("DOMContentLoaded", () => {
    updateNavAuthButtons();
    initSupabaseAuth();
    const curList = getCurrentListId();
    if (curList && curList !== "default") {
        registerRoomInDatabase(curList);
    }
});
