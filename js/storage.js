// storage.js
// Локальные настройки (длительность прокрутки, последний выбранный фильм)

const STORAGE_KEY_WHEEL_DURATION = "wheel_duration";
const STORAGE_KEY_LAST_MOVIE_ID = "last_movie_id";

// Длительность прокрутки барабана
function loadWheelDuration() {
    const raw = localStorage.getItem(STORAGE_KEY_WHEEL_DURATION);
    const value = Number(raw);
    if (!raw || Number.isNaN(value) || value < 1 || value > 60) {
        return 5; // значение по умолчанию
    }
    return Math.round(value);
}

function saveWheelDuration(seconds) {
    localStorage.setItem(STORAGE_KEY_WHEEL_DURATION, String(seconds));
}

// Последний выбранный фильм
function saveLastMovieId(id) {
    localStorage.setItem(STORAGE_KEY_LAST_MOVIE_ID, String(id));
}

function loadLastMovieId() {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_MOVIE_ID);
    const value = Number(raw);
    if (!raw || Number.isNaN(value)) return null;
    return value;
}
