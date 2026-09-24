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

// ── Кэширование списка фильмов для мгновенной загрузки UI (0ms) ──────────
const STORAGE_KEY_MOVIES_CACHE = "kino_movies_cache_v1";

function getCachedMovies() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_MOVIES_CACHE);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
    } catch (_) {}
    return null;
}

function setCachedMovies(movies) {
    if (!Array.isArray(movies)) return;
    try {
        localStorage.setItem(STORAGE_KEY_MOVIES_CACHE, JSON.stringify(movies));
    } catch (_) {}
}

function clearCachedMovies() {
    try {
        localStorage.removeItem(STORAGE_KEY_MOVIES_CACHE);
    } catch (_) {}
}

if (typeof window !== "undefined") {
    window.getCachedMovies = getCachedMovies;
    window.setCachedMovies = setCachedMovies;
    window.clearCachedMovies = clearCachedMovies;
}

// ── Работа с базой данных (CRUD) ─────────────────────────────────────────

// Загрузка всех фильмов (с автоматическим кэшированием и fallback)
async function loadMovies() {
    if (!supabase) {
        return getCachedMovies() || [];
    }
    try {
        const { data, error } = await supabase
            .from("movies")
            .select("id, title, genre, comment, status, ratings")
            .order("id", { ascending: true });

        if (error) {
            console.error("Ошибка загрузки фильмов:", error.message);
            return getCachedMovies() || [];
        }
        if (data && Array.isArray(data)) {
            setCachedMovies(data);
            return data;
        }
        return getCachedMovies() || [];
    } catch (err) {
        console.error("Сетевая ошибка при загрузке фильмов:", err);
        return getCachedMovies() || [];
    }
}

// Добавление фильма
async function insertMovie(rawMovie) {
    if (!supabase) return false;

    if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
        const authOk = await ensureAuthenticated("Для добавления фильма");
        if (!authOk) return false;
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

    if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
        const authOk = await ensureAuthenticated("Для изменения фильма");
        if (!authOk) return false;
    }

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

    if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
        const authOk = await ensureAuthenticated("Для удаления фильма");
        if (!authOk) return false;
    }

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

// ── Авторизация через Supabase Auth для изменения данных ─────────────────────
let currentAuthSession = null;
let currentAuthUser = null;
let currentIsAdmin = false;
let isAuthInitialized = false;

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
    if (!supabase || !supabase.auth) return;
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
    }

    try {
        supabase.auth.onAuthStateChange(async (_event, session) => {
            currentAuthSession = session;
            currentAuthUser = session ? session.user : null;
            await refreshAdminStatus();
            updateNavAuthButtons();
        });
    } catch (e) {
        console.warn("Ошибка подписки на события авторизации:", e);
    }
}

// Проверка: авторизован ли пользователь в Supabase Auth
function isAuthenticated() {
    return !!(currentAuthSession && currentAuthUser);
}

// Получение данных текущего пользователя
function getAuthUser() {
    return currentAuthUser;
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

// Создание модального окна в DOM (если еще не создано)
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
                    <h2 id="authModalTitle">Вход администратора</h2>
                </div>
                <button type="button" class="modal-close" data-auth-modal-close aria-label="Закрыть">×</button>
            </div>
            <form id="authPasswordForm" class="movie-form modal-form">
                <p id="authActionText" class="auth-action-text muted">Для выполнения этого действия войдите под учетной записью администратора:</p>
                <label>
                    <span>Логин:</span>
                    <input type="text" id="authLoginInput" placeholder="Например: admin" required autocomplete="username">
                </label>
                <label>
                    <span>Пароль:</span>
                    <div class="password-input-row">
                        <input type="password" id="authPasswordInput" placeholder="Введите пароль..." required autocomplete="current-password">
                        <button type="button" id="togglePasswordBtn" class="toggle-password-btn" title="Показать/скрыть пароль" aria-label="Показать/скрыть пароль">👁️</button>
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
                ? `${actionDescription}. Войдите под учетной записью администратора:`
                : "Для выполнения этого действия войдите под учетной записью администратора:";
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

            // Если введен логин (без знака @), ищем связанный email через функцию get_email_by_username
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
                            msg = "Email еще не подтвержден в Supabase.";
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

// Проверка: является ли текущий пользователь главным администратором (серверная валидация)
function isAdmin() {
    return isAuthenticated() && currentIsAdmin === true;
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

// Модальное окно управления пользователями (только для админа)
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
                            <div class="password-input-row">
                                <input type="password" id="newUserPassInput" placeholder="Введите или сгенерируйте пароль..." required autocomplete="new-password">
                                <button type="button" id="genNewUserPassBtn" class="toggle-password-btn" style="right: 44px;" title="Сгенерировать случайный пароль">🎲</button>
                                <button type="button" id="toggleNewUserPassBtn" class="toggle-password-btn" title="Показать/скрыть пароль">👁️</button>
                            </div>
                        </label>

                        <div id="adminCreateUserMsg" class="auth-error-msg hidden"></div>

                        <div class="modal-actions" style="margin-top: 14px;">
                            <button type="submit" class="primary-button" id="adminCreateUserSubmitBtn">Зарегистрировать</button>
                        </div>
                    </form>
                </section>

                <section class="admin-user-list-section">
                    <div class="section-title compact-title">
                        <h3 class="section-subtitle">Зарегистрированные пользователи</h3>
                        <button type="button" id="refreshUserListBtn" class="secondary-button compact">🔄 Обновить</button>
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
                // Автоматический скрытый внутренний email для Supabase Auth (пользователю нужен только логин)
                const internalEmail = `${encodeURIComponent(username.toLowerCase())}@kino.internal`;

                // 1. Изолированная регистрация в Supabase Auth (прямой HTTP-запрос без сброса сессии администратора)
                const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
                    method: "POST",
                    headers: {
                        "apikey": SUPABASE_ANON_KEY,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email: internalEmail,
                        password: password,
                        data: {
                            username: username
                        }
                    })
                });

                const signupData = await signupRes.json();
                if (!signupRes.ok) {
                    throw new Error(signupData.msg || signupData.error_description || signupData.message || "Не удалось создать пользователя");
                }

                // 2. Привязка логина в таблице user_profiles через защищенную RPC-функцию администратора
                const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_register_user_profile", {
                    p_username: username,
                    p_email: internalEmail
                });

                if (rpcErr) {
                    throw new Error(rpcErr.message);
                }
                if (rpcRes && !rpcRes.success) {
                    throw new Error(rpcRes.error || "Не удалось сохранить логин");
                }

                // Успешная регистрация
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
        tableWrap.innerHTML = `<p class="muted">Supabase не подключен.</p>`;
        return;
    }

    try {
        const { data: users, error } = await supabase
            .from("user_profiles")
            .select("id, username, created_at")
            .order("id", { ascending: true });

        if (error) {
            tableWrap.innerHTML = `<p class="muted">Не удалось загрузить пользователей: ${error.message}</p>`;
            return;
        }

        if (!users || users.length === 0) {
            tableWrap.innerHTML = `<p class="muted">Пользователи не найдены.</p>`;
            return;
        }

        let html = `
            <table class="movies-table admin-users-table">
                <thead>
                    <tr>
                        <th>Логин</th>
                        <th>Роль</th>
                        <th style="width: 100px; text-align: right;">Действие</th>
                    </tr>
                </thead>
                <tbody>
        `;

        users.forEach(u => {
            const isMainAdmin = (u.username.toLowerCase() === "admin");
            html += `
                <tr>
                    <td><strong>${u.username}</strong></td>
                    <td>
                        <span class="user-role-badge ${isMainAdmin ? 'role-admin' : 'role-user'}">
                            ${isMainAdmin ? 'Администратор' : 'Пользователь'}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        ${isMainAdmin 
                            ? `<span class="muted small-text">Главный</span>`
                            : `<button type="button" class="action-btn action-btn-delete compact" data-delete-username="${u.username}">Удалить</button>`
                        }
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        tableWrap.innerHTML = html;

        // Привязка обработчиков удаления (без inline onclick для соблюдения CSP)
        tableWrap.querySelectorAll("[data-delete-username]").forEach(btn => {
            btn.addEventListener("click", () => {
                const uname = btn.getAttribute("data-delete-username");
                if (uname) {
                    handleDeleteUser(uname);
                }
            });
        });

    } catch (e) {
        tableWrap.innerHTML = `<p class="muted">Ошибка сети: ${e.message || e}</p>`;
    }
}

// Удаление пользователя администратором
async function handleDeleteUser(username) {
    if (!confirm(`Удалить логин «${username}» из списка пользователей киноклуба?`)) return;

    try {
        let deleted = false;

        // 1. Попытка через защищенную RPC функцию в базе
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

        // 2. Если RPC не создан, удаляем напрямую из user_profiles
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

// Кнопка входа/выхода в шапке
function updateNavAuthButtons() {
    const navs = document.querySelectorAll(".site-nav");
    navs.forEach(nav => {
        let btn = nav.querySelector("#navAuthBtn");
        if (!btn) {
            btn = document.createElement("button");
            btn.id = "navAuthBtn";
            btn.type = "button";
            btn.className = "nav-auth-btn";
            nav.appendChild(btn);
            btn.addEventListener("click", () => {
                if (isAuthenticated()) {
                    const roleLabel = isAdmin() ? "Администратор" : "Пользователь";
                    if (confirm(`Выйти из учетной записи (${roleLabel})? Для последующих изменений потребуется снова войти.`)) {
                        logout();
                    }
                } else {
                    ensureAuthenticated("Вход в систему управления");
                }
            });
        }

        const isAuth = isAuthenticated();
        if (isAuth) {
            btn.className = "nav-auth-btn authorized";
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
            btn.innerHTML = `<span>🔓 ${shortName}</span>`;
            btn.title = `Вы вошли как ${shortName}. Нажмите для выхода.`;

            // Кнопка «Пользователи» только для главного администратора
            let usersBtn = nav.querySelector("#navUsersBtn");
            if (isAdmin()) {
                if (!usersBtn) {
                    usersBtn = document.createElement("button");
                    usersBtn.id = "navUsersBtn";
                    usersBtn.type = "button";
                    usersBtn.className = "nav-auth-btn nav-admin-btn";
                    usersBtn.innerHTML = `<span>👥 Пользователи</span>`;
                    usersBtn.title = "Управление и регистрация пользователей киноклуба";
                    nav.insertBefore(usersBtn, btn);
                    usersBtn.addEventListener("click", () => {
                        openAdminUsersModal();
                    });
                }
            } else if (usersBtn) {
                usersBtn.remove();
            }
        } else {
            const usersBtn = nav.querySelector("#navUsersBtn");
            if (usersBtn) usersBtn.remove();

            btn.className = "nav-auth-btn";
            btn.innerHTML = `<span>🔑 Вход</span>`;
            btn.title = "Войти для добавления, изменения и оценки фильмов";
        }
    });
}

// ── Плавный переход между страницами ─────────────────────────────────────
function initPageTransitions() {
    document.addEventListener("click", (e) => {
        const link = e.target.closest("a[href]");
        if (!link) return;

        const rawHref = link.getAttribute("href");
        if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
            return;
        }

        // Игнорируем внешние ссылки и клики с зажатыми модификаторами
        if (link.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
            return;
        }

        try {
            const url = new URL(link.href, window.location.origin);
            if (url.origin !== window.location.origin) return;

            // Если кликнули на ссылку текущей страницы с теми же параметрами
            if (url.pathname === window.location.pathname && url.search === window.location.search) {
                return;
            }

            // Если браузер не поддерживает View Transitions API, плавно гасим текущую страницу перед переходом
            if (!("startViewTransition" in document)) {
                e.preventDefault();
                document.body.classList.add("page-is-leaving");
                setTimeout(() => {
                    window.location.href = link.href;
                }, 140);
            }
        } catch (_) {}
    });

    // При возврате по истории браузера (bfcache) сбрасываем класс анимации
    window.addEventListener("pageshow", (e) => {
        if (e.persisted) {
            document.body.classList.remove("page-is-leaving");
        }
    });
}

window.addEventListener("DOMContentLoaded", () => {
    initPageTransitions();
    updateNavAuthButtons();
    initSupabaseAuth();
});

