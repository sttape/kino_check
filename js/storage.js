const STORAGE_KEY = "movies_db";
const LAST_MOVIE_KEY = "lastMovieId";
const WHEEL_DURATION_KEY = "wheelDurationSeconds";

function loadMovies() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
}

function saveMovies(movies) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
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
