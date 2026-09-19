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

// Загрузка и отображение фильмов
async function loadAndRenderMovies() {
    allMovies = await loadMovies();
    applyFilterAndRender();
}

// Применение фильтра поиска и отрисовка текущей страницы
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

    const totalPages = Math.max(1, Math.ceil(filteredMovies.length / pageSize));
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    if (currentPage < 1) {
        currentPage = 1;
    }

    const startIdx = (currentPage - 1) * pageSize;
    const pageMovies = filteredMovies.slice(startIdx, startIdx + pageSize);

    renderMovies(pageMovies);
    renderPagination(filteredMovies.length, totalPages);
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

        const statusClass = getStatusClass(movie.status);
        const statusHtml = movie.status
            ? `<span class="status-pill ${statusClass}">${escapeHtml(movie.status)}</span>`
            : `<span class="muted">-</span>`;

        const ratingHtml = movie.ratings != null
            ? `<span class="rating-badge">${movie.ratings}</span>`
            : `<span class="muted">-</span>`;

        tr.innerHTML = `
            <td><strong style="color: var(--text); font-size: 0.94rem;">${escapeHtml(movie.title)}</strong></td>
            <td>${escapeHtml(movie.genre || "-")}</td>
            <td class="comment-cell" title="${escapeHtml(movie.comment || "")}">${escapeHtml(movie.comment || "-")}</td>
            <td>${statusHtml}</td>
            <td>${ratingHtml}</td>
            <td>
                <div class="row-actions">
                    <button type="button" class="action-btn action-btn-edit" onclick="editMovie(${movie.id})">Редактировать</button>
                    <button type="button" class="action-btn action-btn-delete" onclick="deleteMovieConfirm(${movie.id})">Удалить</button>
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
    if (!confirm("Удалить фильм?")) return;
    const ok = await deleteMovie(id);
    if (ok) {
        await loadAndRenderMovies();
    }
};

// Редактирование фильма
window.editMovie = async function(id) {
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

    document.getElementById("movieEditRatings").value  = data.ratings != null ? data.ratings : "";

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
    }

    if (editForm) {
        editForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const ratingsRaw = document.getElementById("movieEditRatings").value.trim();
            const ratingsNum = ratingsRaw !== "" ? Number(ratingsRaw) : null;

            if (ratingsNum !== null && (isNaN(ratingsNum) || ratingsNum < -1 || ratingsNum > 11)) {
                alert("Оценка должна быть от -1 до 11");
                return;
            }

            const movie = {
                id:      Number(document.getElementById("movieEditId").value),
                title:   document.getElementById("movieEditTitle").value.trim(),
                genre:   document.getElementById("movieEditGenre").value.trim(),
                comment: document.getElementById("movieEditComment").value.trim(),
                status:  document.getElementById("movieEditStatus").value.trim(),
                ratings: ratingsNum
            };

            if (!movie.title) {
                alert("Название фильма обязательно");
                return;
            }

            const ok = await updateMovie(movie);
            if (ok) {
                editModal.classList.add("hidden");
                editModal.setAttribute("aria-hidden", "true");
                await loadAndRenderMovies();
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
