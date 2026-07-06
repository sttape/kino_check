const STORAGE_KEY = "movies_db";
const LAST_MOVIE_KEY = "lastMovieId";
const WHEEL_DURATION_KEY = "wheelDurationSeconds";

const appConfig = window.APP_CONFIG || {};
const supabaseUrl = String(appConfig.supabaseUrl || "").replace(/\/$/, "");
const supabaseAnonKey = String(appConfig.supabaseAnonKey || "");
const supabaseTable = String(appConfig.supabaseTable || "movies");

function hasRemoteStorage() {
    return Boolean(supabaseUrl && supabaseAnonKey);
}

function remoteHeaders(extraHeaders = {}) {
    return {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        ...extraHeaders
    };
}

function normalizeRatings(ratings) {
    if (Array.isArray(ratings)) {
        return ratings.map(value => Number(value)).filter(value => Number.isFinite(value));
    }

    if (typeof ratings === "string" && ratings.trim()) {
        try {
            const parsed = JSON.parse(ratings);

            if (Array.isArray(parsed)) {
                return parsed.map(value => Number(value)).filter(value => Number.isFinite(value));
            }
        } catch {
            return ratings
                .split(/[|;,]/)
                .map(value => Number(value.trim()))
                .filter(value => Number.isFinite(value));
        }
    }

    return [];
}

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

async function loadMoviesFromRemote() {
    const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(supabaseTable)}?select=*&order=id.asc`, {
        headers: remoteHeaders()
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const movies = await response.json();
    return Array.isArray(movies) ? movies.map(normalizeMovie) : [];
}

async function replaceRemoteMovies(movies) {
    const normalizedMovies = movies.map(normalizeMovie);
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(supabaseTable)}?id=gte.0`, {
        method: "DELETE",
        headers: remoteHeaders({
            Prefer: "return=minimal"
        })
    });

    if (!deleteResponse.ok) {
        throw new Error(await deleteResponse.text());
    }

    if (normalizedMovies.length === 0) {
        return;
    }

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

function loadMovies() {
    if (!hasRemoteStorage()) {
        return loadMoviesFromLocal();
    }

    return loadMoviesFromRemote().catch(error => {
        console.warn("Не удалось загрузить фильмы из Supabase", error);
        return loadMoviesFromLocal();
    });
}

async function saveMovies(movies) {
    const normalizedMovies = movies.map(normalizeMovie);
    saveMoviesToLocal(normalizedMovies);

    if (!hasRemoteStorage()) {
        return normalizedMovies;
    }

    try {
        await replaceRemoteMovies(normalizedMovies);
    } catch (error) {
        console.warn("Не удалось сохранить фильмы в Supabase", error);
    }

    return normalizedMovies;
}

function saveLastMovieId(movieId) {
    localStorage.setItem(LAST_MOVIE_KEY, String(movieId));
}

function loadLastMovieId() {
    const value = localStorage.getItem(LAST_MOVIE_KEY);
    return value ? Number(value) : null;
}

function saveWheelDuration(seconds) {
    localStorage.setItem(WHEEL_DURATION_KEY, String(seconds));
}

function loadWheelDuration() {
    return Number(localStorage.getItem(WHEEL_DURATION_KEY)) || 5;
}
