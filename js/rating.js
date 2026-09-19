// rating.js
// Страница выставления оценки фильму

const movieSelect   = document.getElementById("ratingMovieSelect");
const ratingInput   = document.getElementById("ratingInput");
const movieTitleEl  = document.getElementById("ratingMovieTitle");
const saveRatingBtn = document.getElementById("saveRatingBtn");

// Если элементов формы нет — скрипт не на своей странице
if (!movieSelect || !saveRatingBtn) {
    void 0; // выходим без ошибок
} else {

// Кэш фильмов, чтобы не делать лишние запросы
let cachedMovies = [];

// Статусные цвета
const STATUS_COLORS = {
    "Просмотрено":    "rgba(74,222,128,0.18)",
    "Не просмотрено": "rgba(148,163,184,0.14)",
    "Не вышел":       "rgba(251,191,36,0.18)",
    "Скоро выйдет":   "rgba(56,189,248,0.18)",
    "Запланировано":  "rgba(56,189,248,0.18)",
    "НЕ ОХОТА":       "rgba(239,68,68,0.18)",
};

// ── Инициализация ────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
    cachedMovies = await loadMovies();

    movieSelect.innerHTML = "";

    if (!cachedMovies.length) {
        movieSelect.innerHTML = `<option value="">Нет фильмов</option>`;
        updateMovieCard(null);
        return;
    }

    for (const movie of cachedMovies) {
        const opt = document.createElement("option");
        opt.value = movie.id;
        opt.textContent = `${movie.title} [${movie.status || "Без статуса"}]`;
        movieSelect.appendChild(opt);
    }

    // Предвыбор: сначала проверяем URL (?id=…), затем последний фильм из колеса (localStorage)
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get("id") ? Number(urlParams.get("id")) : null;
    const lastId = urlId || (loadLastMovieId ? loadLastMovieId() : null);

    if (lastId) {
        const found = cachedMovies.find(m => m.id === lastId);
        if (found) movieSelect.value = found.id;
    }

    const initialMovie = getCurrentMovie();
    updateMovieCard(initialMovie);
    syncRatingInputWithMovie(initialMovie);
});

// ── Обновление карточки фильма при смене выбора ──────────────────────────────
movieSelect.addEventListener("change", () => {
    const movie = getCurrentMovie();
    updateMovieCard(movie);
    syncRatingInputWithMovie(movie);
});

function syncRatingInputWithMovie(movie) {
    if (!ratingInput) return;
    if (movie && movie.ratings != null) {
        ratingInput.value = movie.ratings;
    } else {
        ratingInput.value = "";
    }
}

function getCurrentMovie() {
    const id = Number(movieSelect.value);
    return cachedMovies.find(m => m.id === id) || null;
}

function updateMovieCard(movie) {
    if (!movieTitleEl) return;

    if (!movie) {
        movieTitleEl.innerHTML = `<span class="muted">Выберите фильм из списка</span>`;
        return;
    }

    const bgColor = STATUS_COLORS[movie.status] || "rgba(148,163,184,0.14)";
    const ratingDisplay = movie.ratings != null ? `⭐ ${movie.ratings}` : "Не оценён";

    movieTitleEl.innerHTML = `
        <div class="movie-card-preview" style="background:${bgColor}">
            <div class="movie-card-preview-header">
                <strong class="movie-card-preview-title">${escapeHtml(movie.title)}</strong>
                <span class="movie-card-preview-rating">${ratingDisplay}</span>
            </div>
            ${movie.genre ? `<p class="movie-card-preview-meta">🎬 ${escapeHtml(movie.genre)}</p>` : ""}
            ${movie.status ? `<p class="movie-card-preview-meta">📌 ${escapeHtml(movie.status)}</p>` : ""}
            ${movie.comment ? `<p class="movie-card-preview-comment">${escapeHtml(movie.comment)}</p>` : ""}
        </div>
    `;
}

// ── Сохранение оценки ────────────────────────────────────────────────────────
saveRatingBtn.addEventListener("click", async () => {
    const movie = getCurrentMovie();
    const ratingVal = ratingInput ? ratingInput.value.trim() : "";
    const rating = Number(ratingVal);

    if (!movie) {
        alert("Выберите фильм");
        return;
    }

    if (ratingVal === "" || isNaN(rating) || rating < -1 || rating > 11) {
        alert("Оценка должна быть от -1 до 11");
        return;
    }

    const updatedMovie = {
        id:      movie.id,
        title:   movie.title,
        genre:   movie.genre,
        comment: movie.comment,
        status:  "Просмотрено",
        ratings: rating
    };

    const validation = typeof validateMovieInput === "function" 
        ? validateMovieInput(updatedMovie) 
        : { valid: true };
    if (!validation.valid) {
        alert(validation.error);
        return;
    }

    const origText = saveRatingBtn.textContent;
    saveRatingBtn.disabled = true;
    saveRatingBtn.textContent = "Сохранение…";

    try {
        const ok = await updateMovie(updatedMovie);
        if (!ok) {
            saveRatingBtn.disabled = false;
            saveRatingBtn.textContent = origText;
            return;
        }

        // Обновляем кэш и карточку сразу, не ждём перехода
        const idx = cachedMovies.findIndex(m => m.id === movie.id);
        if (idx !== -1) {
            cachedMovies[idx] = { ...movie, status: "Просмотрено", ratings: rating };
            updateMovieCard(cachedMovies[idx]);
        }

        saveRatingBtn.textContent = "✓ Сохранено";
        setTimeout(() => {
            window.location.href = "movies.html";
        }, 900);
    } catch (err) {
        console.error("Ошибка сохранения оценки:", err);
        alert("Ошибка сохранения: " + (err.message || "Неизвестная ошибка"));
        saveRatingBtn.disabled = false;
        saveRatingBtn.textContent = origText;
    }
});

// ── Утилиты ──────────────────────────────────────────────────────────────────
function escapeHtml(s) {
    if (!s) return "";
    return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

} // конец if (movieSelect && saveRatingBtn)

