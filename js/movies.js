// movies.js
// Управление таблицей фильмов: загрузка, пагинация, поиск, удаление, редактирование

const moviesTableBody = document.querySelector("#moviesTable tbody");
const searchInput = document.getElementById("moviesSearchInput");
const clearSearchBtn = document.getElementById("clearMoviesSearchBtn");

// Если таблицы нет на странице — не инициализируем модуль
if (!moviesTableBody) {
    void 0;
} else {

let allMovies = [];
let filteredMovies = [];
let currentPage = 1;
let pageSize = 8;
let currentSort = { key: null, direction: null };

// Обновление индикаторов сортировки в шапке таблицы
function updateSortIndicators() {
    const headers = document.querySelectorAll("#moviesTable th[data-sort-key]");
    headers.forEach(th => {
        const key = th.dataset.sortKey;
        const icon = th.querySelector(".sort-icon");
        if (key === currentSort.key && currentSort.direction) {
            th.classList.add("active-sort");
            th.setAttribute("aria-sort", currentSort.direction === "asc" ? "ascending" : "descending");
            if (icon) {
                icon.textContent = currentSort.direction === "asc" ? "▲" : "▼";
            }
        } else {
            th.classList.remove("active-sort");
            th.setAttribute("aria-sort", "none");
            if (icon) {
                icon.textContent = "↕";
            }
        }
    });
}

// Обработка клика по заголовку сортируемой колонки (asc -> desc -> default)
function handleSortClick(key) {
    if (currentSort.key === key) {
        if (currentSort.direction === "asc") {
            currentSort.direction = "desc";
        } else if (currentSort.direction === "desc") {
            currentSort.key = null;
            currentSort.direction = null;
        } else {
            currentSort.direction = "asc";
        }
    } else {
        currentSort.key = key;
        currentSort.direction = "asc";
    }

    currentPage = 1;
    updateSortIndicators();
    applyFilterAndRender();
}

// Загрузка и отображение фильмов
async function loadAndRenderMovies() {
    allMovies = await loadMovies();
    applyFilterAndRender();
}

// Применение фильтра поиска, сортировки и отрисовка текущей страницы
function applyFilterAndRender() {
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

    if (!query) {
        filteredMovies = allMovies;
    } else {
        filteredMovies = allMovies.filter(m =>
            (m.title    || "").toLowerCase().includes(query) ||
            (m.genre    || "").toLowerCase().includes(query) ||
            (m.comment  || "").toLowerCase().includes(query) ||
            (m.status   || "").toLowerCase().includes(query)
        );
    }

    let displayedMovies = [...filteredMovies];

    if (currentSort.key && currentSort.direction) {
        const { key, direction } = currentSort;
        const modifier = direction === "desc" ? -1 : 1;

        displayedMovies.sort((a, b) => {
            const valA = a[key];
            const valB = b[key];

            // Сортировка по оценкам
            if (key === "ratings") {
                const numA = (valA !== null && valA !== undefined && valA !== "") ? Number(valA) : null;
                const numB = (valB !== null && valB !== undefined && valB !== "") ? Number(valB) : null;

                // Пустые оценки всегда помещаются в конец списка
                if (numA === null && numB === null) return 0;
                if (numA === null) return 1;
                if (numB === null) return -1;

                return (numA - numB) * modifier;
            }

            // Текстовая локализованная сортировка (название, жанр, статус)
            const strA = (valA != null ? String(valA) : "").trim();
            const strB = (valB != null ? String(valB) : "").trim();

            if (!strA && !strB) return 0;
            if (!strA) return 1;
            if (!strB) return -1;

            return strA.localeCompare(strB, "ru", { numeric: true, sensitivity: "base" }) * modifier;
        });
    }

    const totalPages = Math.max(1, Math.ceil(displayedMovies.length / pageSize));
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    if (currentPage < 1) {
        currentPage = 1;
    }

    const startIdx = (currentPage - 1) * pageSize;
    const pageMovies = displayedMovies.slice(startIdx, startIdx + pageSize);

    renderMovies(pageMovies);
    renderPagination(displayedMovies.length, totalPages);
}

// Определение CSS-класса для плашки статуса
function getStatusClass(status) {
    if (!status) return "";
    const s = status.toLowerCase();
    if (s.includes("не просмотрено")) return "status-unwatched";
    if (s.includes("просмотрено")) return "status-watched";
    if (s.includes("запланировано")) return "status-planned";
    if (s.includes("скоро")) return "status-coming-soon";
    if (s.includes("не вышел")) return "status-not-released";
    if (s.includes("не охота")) return "status-no-interest";
    return "";
}

// Отрисовка таблицы
function renderMovies(movies) {
    moviesTableBody.innerHTML = "";

    if (!movies.length) {
        moviesTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:28px 16px;">
                    <span class="muted">Фильмы не найдены</span>
                </td>
            </tr>`;
        return;
    }

    for (const movie of movies) {
        const tr = document.createElement("tr");
        tr.className = "movie-table-row";
        tr.dataset.id = String(movie.id);

        const statusClass = getStatusClass(movie.status);
        const statusHtml = movie.status
            ? `<span class="status-pill ${statusClass}">${escapeHtml(movie.status)}</span>`
            : `<span class="muted">-</span>`;

        const ratingHtml = typeof formatRatingBadge === "function"
            ? formatRatingBadge(movie.ratings)
            : (movie.ratings != null ? `<span class="rating-badge">${movie.ratings}</span>` : `<span class="muted">-</span>`);

        tr.innerHTML = `
            <td class="col-title"><strong class="cell-truncate movie-title-text" style="color: var(--text);" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</strong></td>
            <td class="col-genre"><span class="cell-truncate" title="${escapeHtml(movie.genre || '')}">${escapeHtml(movie.genre || "-")}</span></td>
            <td class="col-comment"><span class="cell-truncate" title="${escapeHtml(movie.comment || '')}">${escapeHtml(movie.comment || "-")}</span></td>
            <td class="col-status">${statusHtml}</td>
            <td class="col-rating">${ratingHtml}</td>
            <td class="col-actions">
                <div class="row-actions">
                    <button type="button" class="action-btn action-btn-edit" data-action="edit" data-id="${Number(movie.id)}" title="Редактировать" aria-label="Редактировать">✏️</button>
                    <button type="button" class="action-btn action-btn-delete" data-action="delete" data-id="${Number(movie.id)}" title="Удалить" aria-label="Удалить">🗑️</button>
                </div>
            </td>
        `;

        moviesTableBody.appendChild(tr);
    }
}

// Отрисовка блока пагинации
function renderPagination(totalCount, totalPages) {
    const rangeText = document.getElementById("pageRangeText");
    const numbersContainer = document.getElementById("paginationNumbers");
    const prevBtn = document.getElementById("prevPageBtn");
    const nextBtn = document.getElementById("nextPageBtn");
    const totalBadge = document.getElementById("moviesTotalBadge");

    if (totalBadge) {
        totalBadge.textContent = totalCount ? `${totalCount} ${pluralizeMovies(totalCount)}` : "0 фильмов";
    }

    if (!totalCount) {
        if (rangeText) rangeText.textContent = "0 фильмов";
        if (numbersContainer) numbersContainer.innerHTML = "";
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    const from = (currentPage - 1) * pageSize + 1;
    const to = Math.min(currentPage * pageSize, totalCount);

    if (rangeText) {
        rangeText.textContent = `Показано ${from}–${to} из ${totalCount}`;
    }

    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }

    if (!numbersContainer) return;
    numbersContainer.innerHTML = "";

    const pages = getPageRange(currentPage, totalPages);

    for (const p of pages) {
        if (p === "...") {
            const span = document.createElement("span");
            span.className = "page-number-btn ellipsis";
            span.textContent = "…";
            numbersContainer.appendChild(span);
        } else {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `page-number-btn ${p === currentPage ? "active" : ""}`;
            btn.textContent = p;
            btn.addEventListener("click", () => {
                if (currentPage !== p) {
                    currentPage = p;
                    applyFilterAndRender();
                }
            });
            numbersContainer.appendChild(btn);
        }
    }
}

// Расчёт диапазона страниц с многоточием
function getPageRange(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages = [];
    if (current <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push("...");
        pages.push(total);
    } else if (current >= total - 3) {
        pages.push(1);
        pages.push("...");
        for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
        pages.push(1);
        pages.push("...");
        pages.push(current - 1);
        pages.push(current);
        pages.push(current + 1);
        pages.push("...");
        pages.push(total);
    }
    return pages;
}

function pluralizeMovies(n) {
    const abs = Math.abs(n) % 100;
    const num = abs % 10;
    if (abs > 10 && abs < 20) return "фильмов";
    if (num > 1 && num < 5) return "фильма";
    if (num === 1) return "фильм";
    return "фильмов";
}

// Удаление (вызывается через onclick)
window.deleteMovieConfirm = async function(id) {
    if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
        const authOk = await ensureAuthenticated("Для удаления фильма");
        if (!authOk) return;
    }
    if (!confirm("Удалить фильм?")) return;
    const ok = await deleteMovie(id);
    if (ok) {
        await loadAndRenderMovies();
    }
};

// Редактирование фильма
window.editMovie = async function(id) {
    if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
        const authOk = await ensureAuthenticated("Для редактирования фильма");
        if (!authOk) return;
    }

    const modal = document.getElementById("movieModal");
    if (!modal) {
        window.location.href = `add.html?id=${id}`;
        return;
    }

    const { data, error } = await supabase
        .from("movies")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        alert("Ошибка загрузки фильма");
        return;
    }

    document.getElementById("movieEditId").value       = data.id;
    document.getElementById("movieEditTitle").value    = data.title;
    document.getElementById("movieEditGenre").value    = data.genre   || "";
    document.getElementById("movieEditComment").value  = data.comment || "";

    const statusSelect = document.getElementById("movieEditStatus");
    if (statusSelect) {
        let hasOption = false;
        for (const opt of statusSelect.options) {
            if (opt.value === data.status) { hasOption = true; break; }
        }
        if (!hasOption && data.status) {
            const newOpt = document.createElement("option");
            newOpt.value = data.status;
            newOpt.textContent = data.status;
            statusSelect.appendChild(newOpt);
        }
        statusSelect.value = data.status || "Не просмотрено";
    }

    const editRatingsEl = document.getElementById("movieEditRatings");
    const editPreviewEl = document.getElementById("movieEditRatingPreview");
    if (editRatingsEl) {
        editRatingsEl.value = data.ratings != null ? data.ratings : "";
        if (editPreviewEl && typeof formatRatingBadge === "function") {
            editPreviewEl.innerHTML = formatRatingBadge(data.ratings);
        }
        const editCalcInfoEl = document.getElementById("movieEditRatingCalcInfo");
        if (editCalcInfoEl) editCalcInfoEl.classList.add("hidden");
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
};

// ── Модал редактирования и обработчики пагинации ──────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
    // Пагинация: предыдущая / следующая страница
    const prevBtn = document.getElementById("prevPageBtn");
    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                applyFilterAndRender();
            }
        });
    }

    const nextBtn = document.getElementById("nextPageBtn");
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            const totalPages = Math.max(1, Math.ceil(filteredMovies.length / pageSize));
            if (currentPage < totalPages) {
                currentPage++;
                applyFilterAndRender();
            }
        });
    }

    // Выбор количества фильмов на страницу
    const perPageSelect = document.getElementById("perPageSelect");
    if (perPageSelect) {
        perPageSelect.addEventListener("change", (e) => {
            pageSize = Number(e.target.value) || 8;
            currentPage = 1;
            applyFilterAndRender();
        });
    }

    // Сортировка по колонкам таблицы
    const sortHeaders = document.querySelectorAll("#moviesTable th[data-sort-key]");
    sortHeaders.forEach(th => {
        const key = th.dataset.sortKey;
        th.addEventListener("click", () => handleSortClick(key));
        th.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSortClick(key);
            }
        });
    });
    updateSortIndicators();

    // Форма редактирования
    const editModal = document.getElementById("movieModal");
    const editForm  = document.getElementById("movieEditForm");
    const closeEls  = editModal ? editModal.querySelectorAll("[data-modal-close]") : [];

    if (editModal) {
        closeEls.forEach(el => {
            el.addEventListener("click", () => {
                editModal.classList.add("hidden");
                editModal.setAttribute("aria-hidden", "true");
            });
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !editModal.classList.contains("hidden")) {
                editModal.classList.add("hidden");
                editModal.setAttribute("aria-hidden", "true");
            }
        });

        const modalRatingInput = document.getElementById("movieEditRatings");
        const modalRatingPreview = document.getElementById("movieEditRatingPreview");
        const modalRatingCalc = document.getElementById("movieEditRatingCalcInfo");

        function updateModalRatingUI() {
            if (!modalRatingInput || !modalRatingPreview) return;
            const raw = modalRatingInput.value.trim();
            const parsed = typeof parseRatingInput === "function"
                ? parseRatingInput(raw)
                : { valid: true, isMultiple: false, numbers: [], average: null, finalRating: (raw !== "" ? Number(raw) : null), error: null };

            if (!parsed.valid) {
                if (modalRatingCalc) {
                    modalRatingCalc.classList.remove("hidden");
                    modalRatingCalc.textContent = parsed.error;
                }
                modalRatingPreview.innerHTML = `<span class="muted">-</span>`;
                return;
            }

            if (parsed.isMultiple && modalRatingCalc) {
                modalRatingCalc.classList.remove("hidden");
                modalRatingCalc.innerHTML = `📊 Оценок: <b>${parsed.numbers.length}</b> &nbsp;|&nbsp; Среднее: <b>${parsed.average.toFixed(2)}</b> &nbsp;➔&nbsp; Итого: <b>${parsed.finalRating}</b>`;
            } else if (modalRatingCalc) {
                modalRatingCalc.classList.add("hidden");
            }

            if (typeof formatRatingBadge === "function") {
                modalRatingPreview.innerHTML = formatRatingBadge(parsed.finalRating);
            }
        }

        if (modalRatingInput) {
            modalRatingInput.addEventListener("input", updateModalRatingUI);
        }
    }

    // Делегирование кликов по таблице фильмов (кнопки или тап по строке)
    if (moviesTableBody) {
        moviesTableBody.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-action]");
            if (btn) {
                const action = btn.dataset.action;
                const id = Number(btn.dataset.id);
                if (!id || isNaN(id) || id <= 0) return;

                if (action === "edit") {
                    editMovie(id);
                } else if (action === "delete") {
                    deleteMovieConfirm(id);
                }
                return;
            }

            // Тап / клик по строке tr (для удобства на мобильных)
            const row = e.target.closest("tr.movie-table-row");
            if (row && row.dataset.id) {
                const id = Number(row.dataset.id);
                if (id && !isNaN(id) && id > 0) {
                    editMovie(id);
                }
            }
        });
    }

    // Удаление фильма из модального окна редактирования
    const modalDeleteBtn = document.getElementById("movieModalDeleteBtn");
    if (modalDeleteBtn) {
        modalDeleteBtn.addEventListener("click", async () => {
            const id = Number(document.getElementById("movieEditId").value);
            if (!id || isNaN(id) || id <= 0) return;

            if (editModal) {
                editModal.classList.add("hidden");
                editModal.setAttribute("aria-hidden", "true");
            }
            await deleteMovieConfirm(id);
        });
    }

    if (editForm) {
        editForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
                const authOk = await ensureAuthenticated("Для сохранения изменений фильма");
                if (!authOk) return;
            }

            const submitBtn = editForm.querySelector("button[type=submit]");
            if (submitBtn) submitBtn.disabled = true;

            try {
                const ratingsRaw = document.getElementById("movieEditRatings").value.trim();
                const parsed = typeof parseRatingInput === "function"
                    ? parseRatingInput(ratingsRaw)
                    : { valid: true, finalRating: (ratingsRaw !== "" ? Number(ratingsRaw) : null) };

                if (!parsed.valid) {
                    alert(parsed.error || "Некорректная оценка");
                    return;
                }

                const movie = {
                    id:      Number(document.getElementById("movieEditId").value),
                    title:   document.getElementById("movieEditTitle").value.trim(),
                    genre:   document.getElementById("movieEditGenre").value.trim(),
                    comment: document.getElementById("movieEditComment").value.trim(),
                    status:  document.getElementById("movieEditStatus").value.trim(),
                    ratings: parsed.finalRating
                };

                const ok = await updateMovie(movie);
                if (ok) {
                    editModal.classList.add("hidden");
                    editModal.setAttribute("aria-hidden", "true");
                    await loadAndRenderMovies();
                }
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
});

// ── Поиск с дебаунсом ────────────────────────────────────────────────────────
let searchDebounce = null;

if (searchInput) {
    searchInput.addEventListener("input", () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            currentPage = 1;
            applyFilterAndRender();
        }, 250);
    });
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        currentPage = 1;
        applyFilterAndRender();
    });
}

// HTML-экранирование
function escapeHtml(s) {
    if (!s) return "";
    return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[c]));
}

// Запуск загрузки
window.addEventListener("DOMContentLoaded", loadAndRenderMovies);

} // конец блока if (moviesTableBody)
