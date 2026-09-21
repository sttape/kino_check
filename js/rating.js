// rating.js
// Страница выставления оценки фильму с текстовым поиском фильма

const movieSearchInput   = document.getElementById("ratingMovieSearchInput");
const movieIdInput       = document.getElementById("ratingMovieId");
const searchResults      = document.getElementById("movieSearchResults");
const clearSearchBtn     = document.getElementById("clearMovieSearchBtn");
const ratingInput        = document.getElementById("ratingInput");
const movieTitleEl       = document.getElementById("ratingMovieTitle");
const saveRatingBtn      = document.getElementById("saveRatingBtn");
const multiRatingInput   = document.getElementById("multiRatingInput");
const multiRatingCalcInfo = document.getElementById("multiRatingCalcInfo");
const ratingLivePreview  = document.getElementById("ratingLivePreview");
const quickRateButtons   = document.querySelectorAll(".quick-rate-btn");

// Если элементов формы нет — скрипт не на своей странице
if (!movieSearchInput || !saveRatingBtn) {
    void 0; // выходим без ошибок
} else {

// Кэш фильмов
let cachedMovies = [];
let selectedMovie = null;
let currentFocusIndex = -1;

// Статусные цвета
const STATUS_COLORS = {
    "Просмотрено":    "rgba(74,222,128,0.18)",
    "Не просмотрено": "rgba(148,163,184,0.14)",
    "Не вышел":       "rgba(251,191,36,0.18)",
    "Скоро выйдет":   "rgba(56,189,248,0.18)",
    "Запланировано":  "rgba(56,189,248,0.18)",
    "НЕ ОХОТА":       "rgba(239,68,68,0.18)",
};

// ── Обновление интерфейса превью и кнопок оценки ────────────────────────────
function updateRatingUI(val) {
    if (ratingLivePreview) {
        ratingLivePreview.innerHTML = typeof formatRatingBadge === "function"
            ? formatRatingBadge(val)
            : (val !== "" && val != null ? `<span class="rating-badge">${val}</span>` : `<span class="muted">-</span>`);
    }

    const numVal = (val !== "" && val != null) ? Number(val) : null;
    quickRateButtons.forEach(btn => {
        const btnVal = Number(btn.dataset.rate);
        if (numVal !== null && !isNaN(numVal) && btnVal === numVal) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

// ── Расчет среднего арифметического нескольких оценок ────────────────────────
function calculateMultiRating() {
    if (!multiRatingInput) return;
    const raw = multiRatingInput.value.trim();

    if (!raw) {
        if (multiRatingCalcInfo) multiRatingCalcInfo.classList.add("hidden");
        return;
    }

    const parsed = typeof parseRatingInput === "function"
        ? parseRatingInput(raw)
        : { valid: false, error: "Функция парсинга не найдена" };

    if (!parsed.valid) {
        if (multiRatingCalcInfo) {
            multiRatingCalcInfo.classList.remove("hidden");
            multiRatingCalcInfo.textContent = parsed.error;
        }
        return;
    }

    if (parsed.isMultiple) {
        if (multiRatingCalcInfo) {
            multiRatingCalcInfo.classList.remove("hidden");
            multiRatingCalcInfo.innerHTML = `📊 Оценок: <b>${parsed.numbers.length}</b> &nbsp;|&nbsp; Среднее: <b>${parsed.average.toFixed(2)}</b> &nbsp;➔&nbsp; Итоговая оценка: <b>${parsed.finalRating}</b>`;
        }
    } else if (multiRatingCalcInfo) {
        multiRatingCalcInfo.classList.add("hidden");
    }

    if (ratingInput) {
        ratingInput.value = parsed.finalRating !== null ? parsed.finalRating : "";
        updateRatingUI(parsed.finalRating);
    }
}

// ── Выбор фильма ─────────────────────────────────────────────────────────────
function selectMovie(movie) {
    if (!movie) {
        selectedMovie = null;
        if (movieIdInput) movieIdInput.value = "";
        if (movieSearchInput) movieSearchInput.value = "";
        if (clearSearchBtn) clearSearchBtn.classList.add("hidden");
        updateMovieCard(null);
        syncRatingInputWithMovie(null);
        closeDropdown();
        return;
    }

    selectedMovie = movie;
    if (movieIdInput) movieIdInput.value = movie.id;
    if (movieSearchInput) movieSearchInput.value = movie.title;
    if (clearSearchBtn) clearSearchBtn.classList.remove("hidden");

    closeDropdown();
    updateMovieCard(movie);
    syncRatingInputWithMovie(movie);
}

function syncRatingInputWithMovie(movie) {
    if (!ratingInput) return;
    if (multiRatingInput) multiRatingInput.value = "";
    if (multiRatingCalcInfo) multiRatingCalcInfo.classList.add("hidden");

    if (movie && movie.ratings != null) {
        ratingInput.value = movie.ratings;
        updateRatingUI(movie.ratings);
    } else {
        ratingInput.value = "";
        updateRatingUI(null);
    }
}

function updateMovieCard(movie) {
    if (!movieTitleEl) return;

    if (!movie) {
        movieTitleEl.innerHTML = `<span class="muted">Найдите и выберите фильм для оценки</span>`;
        return;
    }

    const bgColor = STATUS_COLORS[movie.status] || "rgba(148,163,184,0.14)";
    const ratingDisplay = movie.ratings != null 
        ? (typeof formatRatingBadge === "function" ? formatRatingBadge(movie.ratings) : `⭐ ${movie.ratings}`)
        : `<span class="muted">Не оценён</span>`;

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

// ── Выпадающий список результатов поиска ──────────────────────────────────────
function closeDropdown() {
    if (searchResults) {
        searchResults.classList.add("hidden");
        searchResults.innerHTML = "";
    }
    currentFocusIndex = -1;
}

function renderSearchResults(query) {
    if (!searchResults) return;

    const q = (query || "").trim().toLowerCase();
    const filtered = q
        ? cachedMovies.filter(m =>
            (m.title || "").toLowerCase().includes(q) ||
            (m.genre || "").toLowerCase().includes(q)
          )
        : cachedMovies.slice(0, 20);

    if (!filtered.length) {
        searchResults.innerHTML = `<div class="movie-search-empty">Фильмы не найдены</div>`;
        searchResults.classList.remove("hidden");
        currentFocusIndex = -1;
        return;
    }

    searchResults.innerHTML = "";
    filtered.forEach((movie, idx) => {
        const item = document.createElement("div");
        item.className = "movie-search-item";
        item.dataset.id = movie.id;
        item.setAttribute("role", "option");
        item.setAttribute("id", `search-item-${idx}`);

        const ratingBadge = movie.ratings != null
            ? (typeof formatRatingBadge === "function" ? formatRatingBadge(movie.ratings) : `<span class="rating-badge">${movie.ratings}</span>`)
            : "";

        item.innerHTML = `
            <div class="movie-search-item-info">
                <span class="movie-search-item-title">${escapeHtml(movie.title)}</span>
                <span class="movie-search-item-meta">
                    ${movie.genre ? `<span>🎬 ${escapeHtml(movie.genre)}</span>` : ""}
                    ${movie.status ? `<span>📌 ${escapeHtml(movie.status)}</span>` : ""}
                </span>
            </div>
            <div class="movie-search-item-badge">
                ${ratingBadge}
            </div>
        `;

        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            selectMovie(movie);
        });

        searchResults.appendChild(item);
    });

    searchResults.classList.remove("hidden");
    currentFocusIndex = -1;
}

function updateHighlight(items) {
    items.forEach((item, idx) => {
        if (idx === currentFocusIndex) {
            item.classList.add("focused");
            item.scrollIntoView({ block: "nearest" });
        } else {
            item.classList.remove("focused");
        }
    });
}

// ── Инициализация ────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
    // Слушатели событий ввода оценки
    if (ratingInput) {
        ratingInput.addEventListener("input", () => {
            const raw = ratingInput.value.trim();
            const parsed = typeof parseRatingInput === "function"
                ? parseRatingInput(raw)
                : { valid: true, isMultiple: false, numbers: [], average: null, finalRating: (raw !== "" ? Number(raw) : null), error: null };

            if (!parsed.valid) {
                if (multiRatingCalcInfo) {
                    multiRatingCalcInfo.classList.remove("hidden");
                    multiRatingCalcInfo.textContent = parsed.error;
                }
                updateRatingUI(null);
                return;
            }

            if (parsed.isMultiple) {
                if (multiRatingCalcInfo) {
                    multiRatingCalcInfo.classList.remove("hidden");
                    multiRatingCalcInfo.innerHTML = `📊 Оценок: <b>${parsed.numbers.length}</b> &nbsp;|&nbsp; Среднее: <b>${parsed.average.toFixed(2)}</b> &nbsp;➔&nbsp; Итого: <b>${parsed.finalRating}</b>`;
                }
            } else if (multiRatingCalcInfo) {
                multiRatingCalcInfo.classList.add("hidden");
            }

            updateRatingUI(parsed.finalRating);
        });
    }

    if (multiRatingInput) {
        multiRatingInput.addEventListener("input", calculateMultiRating);
    }

    quickRateButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const rate = Number(btn.dataset.rate);
            if (ratingInput) {
                ratingInput.value = rate;
                updateRatingUI(rate);
            }
            if (multiRatingInput) multiRatingInput.value = "";
            if (multiRatingCalcInfo) multiRatingCalcInfo.classList.add("hidden");
        });
    });

    // Загрузка списка фильмов
    cachedMovies = await loadMovies();

    // Слушатели для поля поиска фильма
    if (movieSearchInput) {
        movieSearchInput.addEventListener("input", () => {
            const val = movieSearchInput.value;
            if (clearSearchBtn) {
                clearSearchBtn.classList.toggle("hidden", !val);
            }
            if (selectedMovie && selectedMovie.title !== val) {
                if (movieIdInput) movieIdInput.value = "";
            }
            renderSearchResults(val);
        });

        movieSearchInput.addEventListener("focus", () => {
            renderSearchResults(movieSearchInput.value);
        });

        movieSearchInput.addEventListener("keydown", (e) => {
            if (!searchResults || searchResults.classList.contains("hidden")) {
                if (e.key === "ArrowDown" || e.key === "Enter") {
                    renderSearchResults(movieSearchInput.value);
                }
                return;
            }

            const items = searchResults.querySelectorAll(".movie-search-item");
            if (!items.length) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                currentFocusIndex = (currentFocusIndex + 1) % items.length;
                updateHighlight(items);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                currentFocusIndex = (currentFocusIndex - 1 + items.length) % items.length;
                updateHighlight(items);
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (currentFocusIndex >= 0 && items[currentFocusIndex]) {
                    const id = Number(items[currentFocusIndex].dataset.id);
                    const movie = cachedMovies.find(m => m.id === id);
                    if (movie) selectMovie(movie);
                }
            } else if (e.key === "Escape") {
                closeDropdown();
            }
        });
    }

    // Кнопка очистки поиска
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
            selectMovie(null);
            if (movieSearchInput) movieSearchInput.focus();
        });
    }

    // Закрытие выпадающего списка при клике вне его области
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".movie-search-wrapper")) {
            closeDropdown();
        }
    });

    // Предвыбор: сначала проверяем URL (?id=…), затем последний фильм из колеса (localStorage)
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get("id") ? Number(urlParams.get("id")) : null;
    const lastId = urlId || (loadLastMovieId ? loadLastMovieId() : null);

    if (lastId) {
        const found = cachedMovies.find(m => m.id === lastId);
        if (found) {
            selectMovie(found);
            return;
        }
    }

    // Если предвыбора нет — показываем пустую карточку
    updateMovieCard(null);
});

// ── Сохранение оценки ────────────────────────────────────────────────────────
saveRatingBtn.addEventListener("click", async () => {
    if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
        const authOk = await ensureAuthenticated("Для сохранения оценки фильма");
        if (!authOk) return;
    }

    const movieId = Number(movieIdInput ? movieIdInput.value : "");
    const movie = selectedMovie || cachedMovies.find(m => m.id === movieId);

    if (!movie) {
        alert("Пожалуйста, найдите и выберите фильм из списка");
        if (movieSearchInput) movieSearchInput.focus();
        return;
    }

    const rawRating = ratingInput ? ratingInput.value.trim() : "";
    const parsed = typeof parseRatingInput === "function"
        ? parseRatingInput(rawRating)
        : { valid: rawRating !== "" && !isNaN(Number(rawRating)), finalRating: Number(rawRating) };

    if (!parsed.valid || parsed.finalRating === null) {
        alert(parsed.error || "Оценка должна быть от -1 до 11 (или несколько через запятую)");
        return;
    }

    const rating = parsed.finalRating;

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

        // Обновляем кэш и карточку сразу
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

} // конец if (movieSearchInput && saveRatingBtn)
