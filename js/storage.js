// storage.js — единое хранилище фильмов (локальное + Supabase)
const STORAGE_KEY = "movies_db";
const LAST_MOVIE_KEY = "lastMovieId";
const WHEEL_DURATION_KEY = "wheelDurationSeconds";

const appConfig = window.APP_CONFIG || {};
const supabaseUrl = String(appConfig.supabaseUrl || "").replace(/\/$/, "");
const supabaseAnonKey = String(appConfig.supabaseAnonKey || "");
const supabaseTable = String(appConfig.supabaseTable || "movies");

// Проверяем, подключен ли Supabase
function hasRemoteStorage() {
    return Boolean(supabaseUrl && supabaseAnonKey);
}

// Заголовки для запросов
function remoteHeaders(extraHeaders = {}) {
    return {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        ...extraHeaders
    };
}

// Приведение оценок к числовому массиву
function normalizeRatings(ratings) {
    if (Array.isArray(ratings)) {
        return ratings.map(Number).filter(Number.isFinite);
    }

    if (typeof ratings === "string" && ratings.trim()) {
        try {
            const parsed = JSON.parse(ratings);
            if (Array.isArray(parsed)) {
                return parsed.map(Number).filter(Number.isFinite);
            }
        } catch {
            return ratings
                .split(/[|;,]/)
                .map(value => Number(value.trim()))
                .filter(Number.isFinite);
        }
    }

    return [];
}

// Приведение фильма к единому формату
function normalizeMovie(movie) {
    const parsedId = Number(movie.id);
    return {
        id: Number.isFinite(parsedId) ? parsedId : Date.now() + Math.random(),
        title: String(movie.title || "").trim(),
        genre: String(movie.genre || "").trim(),
        comment: String(movie.comment || "").trim(),
        status: movie.status || "Не просмотрено",
        ratings: normalizeRatings(movie.ratings)
    };
}

// Локальные операции
function loadMoviesFromLocal() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return Array.isArray(parsed) ? parsed.map(normalizeMovie) : [];
    } catch {
        return [];
    }
}

function saveMoviesToLocal(movies) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movies.map(normalizeMovie)));
}

// Загрузка из Supabase
async function loadMoviesFromRemote() {
    const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(supabaseTable)}?select=*`, {
        headers: remoteHeaders()
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const movies = await response.json();
    return Array.isArray(movies) ? movies.map(normalizeMovie) : [];
}

// Полная замена данных в Supabase
async function replaceRemoteMovies(movies) {
    const normalizedMovies = movies.map(normalizeMovie);

    // Удаляем все старые записи
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(supabaseTable)}?id=gte.0`, {
        method: "DELETE",
        headers: remoteHeaders({ Prefer: "return=minimal" })
    });

    if (!deleteResponse.ok) {
        throw new Error(await deleteResponse.text());
    }

    // Добавляем новые
    if (normalizedMovies.length > 0) {
        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(supabaseTable)}`, {
            method: "POST",
            headers: remoteHeaders({
                "Content-Type": "application/json",
                Prefer: "return=minimal"
            }),
            body: JSON.stringify(normalizedMovies)
        });

        if (!insertResponse.ok) {
            throw new Error(await insertResponse.text());
        }
    }
}

// Основная функция загрузки
function loadMovies() {
    if (!hasRemoteStorage()) {
        return loadMoviesFromLocal();
    }

    // Показываем локальные данные сразу, потом обновляем из Supabase
    const local = loadMoviesFromLocal();
    loadMoviesFromRemote()
        .then(remote => saveMoviesToLocal(remote))
        .catch(error => console.warn("Ошибка Supabase:", error));
    return local;
}

// Сохранение фильмов
async function saveMovies(movies) {
    const normalizedMovies = movies.map(normalizeMovie);
    saveMoviesToLocal(normalizedMovies);

    if (!hasRemoteStorage()) {
        return normalizedMovies;
    }

    try {
        await replaceRemoteMovies(normalizedMovies);
    } catch (error) {
        console.warn("Не удалось сохранить фильмы в Supabase:", error);
    }

    return normalizedMovies;
}

// Сохранение и загрузка последнего фильма
function saveLastMovieId(movieId) {
    localStorage.setItem(LAST_MOVIE_KEY, String(movieId));
}

function loadLastMovieId() {
    const value = localStorage.getItem(LAST_MOVIE_KEY);
    return value ? Number(value) : null;
}

// Настройки длительности прокрутки
function saveWheelDuration(seconds) {
    localStorage.setItem(WHEEL_DURATION_KEY, String(seconds));
}

function loadWheelDuration() {
    return Number(localStorage.getItem(WHEEL_DURATION_KEY)) || 5;
}
