// movies.js
// Управление таблицей фильмов: загрузка, пагинация, поиск, сортировка, удаление, редактирование

(function () {
    const moviesTableBody = document.querySelector("#moviesTable tbody");
    const searchInput = document.getElementById("moviesSearchInput");
    const clearSearchBtn = document.getElementById("clearMoviesSearchBtn");

    if (!moviesTableBody) return;

    let allMovies = [];
    let filteredMovies = [];
    let currentPage = 1;
    let pageSize = 10;
    let currentSort = { key: null, direction: null };
    let searchDebounce = null;

    // ── Сортировка таблицы ───────────────────────────────────────────────────
    function updateSortIndicators() {
        const headers = document.querySelectorAll("#moviesTable th[data-sort-key]");
        headers.forEach(th => {
            const key = th.dataset.sortKey;
            const icon = th.querySelector(".sort-icon");
            if (key === currentSort.key && currentSort.direction) {
                th.classList.add("active-sort");
                th.setAttribute("aria-sort", currentSort.direction === "asc" ? "ascending" : "descending");
                if (icon) icon.textContent = currentSort.direction === "asc" ? "▲" : "▼";
            } else {
                th.classList.remove("active-sort");
                th.setAttribute("aria-sort", "none");
                if (icon) icon.textContent = "↕";
            }
        });
    }

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

    // ── Плашка гостя над таблицей ────────────────────────────────────────────
    function updateGuestBanner() {
        const bannerContainer = document.getElementById("guestListBannerContainer");
        if (!bannerContainer) return;

        const isAuth = typeof isAuthenticated === "function" && isAuthenticated();
        if (!isAuth) {
            const guestMovies = typeof getGuestMovies === "function" ? getGuestMovies() : [];
            if (guestMovies.length > 0) {
                bannerContainer.innerHTML = `
                    <div class="guest-list-banner">
                        <div class="guest-banner-info">
                            <span class="guest-badge-pill">👤 Временный список гостя</span>
                            <span class="guest-banner-text">Фильмы сохранены в вашем браузере и используются в колесе рулетки.</span>
                        </div>
                        <div class="guest-banner-actions">
                            <a href="add.html" class="primary-button compact-btn">➕ Добавить</a>
                            <button type="button" class="danger-button compact-btn" id="guestClearListBtn">🧹 Очистить</button>
                            <button type="button" class="secondary-button compact-btn" id="guestBannerLoginBtn">🔑 Войти в систему</button>
                        </div>
                    </div>
                `;
                const clearBtn = bannerContainer.querySelector("#guestClearListBtn");
                if (clearBtn) {
                    clearBtn.addEventListener("click", () => {
                        if (confirm("Очистить ваш временный список фильмов?")) {
                            if (typeof clearGuestMovies === "function") clearGuestMovies();
                            loadAndRenderMovies();
                        }
                    });
                }
                const loginBtn = bannerContainer.querySelector("#guestBannerLoginBtn");
                if (loginBtn) {
                    loginBtn.addEventListener("click", () => {
                        if (typeof ensureAuthenticated === "function") {
                            ensureAuthenticated("Вход в киноклуб");
                        }
                    });
                }
            } else {
                bannerContainer.innerHTML = "";
            }
        } else {
            bannerContainer.innerHTML = "";
        }
    }

    // ── Загрузка и фильтрация ────────────────────────────────────────────────
    async function loadAndRenderMovies() {
        allMovies = await loadMovies();
        updateGuestBanner();
        applyFilterAndRender();
    }

    function applyFilterAndRender() {
        const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

        if (!query) {
            filteredMovies = allMovies;
        } else {
            filteredMovies = allMovies.filter(m =>
                (m.title   || "").toLowerCase().includes(query) ||
                (m.genre   || "").toLowerCase().includes(query) ||
                (m.comment || "").toLowerCase().includes(query) ||
                (m.status  || "").toLowerCase().includes(query)
            );
        }

        let displayedMovies = [...filteredMovies];

        if (currentSort.key && currentSort.direction) {
            const { key, direction } = currentSort;
            const modifier = direction === "desc" ? -1 : 1;

            displayedMovies.sort((a, b) => {
                const valA = a[key];
                const valB = b[key];

                if (key === "ratings") {
                    const numA = (valA !== null && valA !== undefined && valA !== "") ? Number(valA) : null;
                    const numB = (valB !== null && valB !== undefined && valB !== "") ? Number(valB) : null;

                    if (numA === null && numB === null) return 0;
                    if (numA === null) return 1;
                    if (numB === null) return -1;

                    return (numA - numB) * modifier;
                }

                const strA = (valA != null ? String(valA) : "").trim();
                const strB = (valB != null ? String(valB) : "").trim();

                if (!strA && !strB) return 0;
                if (!strA) return 1;
                if (!strB) return -1;

                return strA.localeCompare(strB, "ru", { numeric: true, sensitivity: "base" }) * modifier;
            });
        }

        const totalPages = Math.max(1, Math.ceil(displayedMovies.length / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * pageSize;
        const pageMovies = displayedMovies.slice(startIdx, startIdx + pageSize);

        renderMovies(pageMovies);
        renderPagination(displayedMovies.length, totalPages);
    }

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

    // ── Отрисовка таблицы фильмов ────────────────────────────────────────────
    function renderMovies(movies) {
        moviesTableBody.innerHTML = "";

        if (!movies.length) {
            const curList = (typeof getCurrentListId === "function") ? getCurrentListId() : "default";
            const isCustomRoom = (curList && curList !== "default");
            const query = (searchInput ? searchInput.value : "").trim();

            if (query) {
                moviesTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center; padding:32px 16px;">
                            <span class="muted">По запросу «${escapeHtml(query)}» фильмы не найдены</span>
                        </td>
                    </tr>`;
                return;
            }

            const isAuth = typeof isAuthenticated === "function" && isAuthenticated();

            if (!isAuth) {
                moviesTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center; padding:36px 16px;">
                            <div class="guest-empty-card" style="display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 500px; margin: 0 auto;">
                                <span style="font-size: 2.4rem;">🎬</span>
                                <strong style="font-size: 1.15rem; color: var(--text);">Ваш временный список фильмов пуст</strong>
                                <p class="muted small-text" style="margin: 0; line-height: 1.5;">
                                    Вы просматриваете киноклуб как гость. Добавьте свои фильмы через форму или импортируйте CSV файл, чтобы составить временный список для рулетки. 
                                    Либо войдите под своей учетной записью, чтобы получить доступ к общему каталогу.
                                </p>
                                <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 6px;">
                                    <a href="add.html" class="primary-button compact-btn">➕ Добавить фильм</a>
                                    <a href="add.html#csv" class="secondary-button compact-btn">📥 Импорт CSV</a>
                                    <button type="button" class="secondary-button compact-btn" id="guestEmptyCardLoginBtn">🔑 Войти в систему</button>
                                </div>
                            </div>
                        </td>
                    </tr>`;

                const cardLoginBtn = moviesTableBody.querySelector("#guestEmptyCardLoginBtn");
                if (cardLoginBtn) {
                    cardLoginBtn.addEventListener("click", () => {
                        if (typeof ensureAuthenticated === "function") {
                            ensureAuthenticated("Вход в киноклуб");
                        }
                    });
                }
                return;
            }

            const addUrl = isCustomRoom ? `add.html?list=${encodeURIComponent(curList)}` : "add.html";

            moviesTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:36px 16px;">
                        <div class="empty-room-state" style="display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 480px; margin: 0 auto;">
                            <span style="font-size: 2.2rem;">🎬</span>
                            <strong style="font-size: 1.1rem; color: var(--text);">
                                ${isCustomRoom ? `В комнате «${escapeHtml(curList)}» пока нет фильмов` : 'Список фильмов пуст'}
                            </strong>
                            <p class="muted small-text" style="margin: 0; line-height: 1.45;">
                                ${isCustomRoom 
                                    ? 'Вы можете добавить свой первый фильм, импортировать CSV файл или скопировать фильмы из общего списка:' 
                                    : 'Добавьте свой первый фильм или импортируйте таблицу через CSV.'}
                            </p>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 6px;">
                                <a href="${addUrl}" class="primary-button compact-btn">➕ Добавить фильм</a>
                                <a href="${addUrl}#csv" class="secondary-button compact-btn">📥 Импорт CSV</a>
                                ${isCustomRoom ? `
                                <button type="button" class="secondary-button compact-btn" id="emptyRoomCloneBtn">📋 Скопировать из общего списка</button>
                                ` : ''}
                            </div>
                        </div>
                    </td>
                </tr>`;

            const cloneBtn = moviesTableBody.querySelector("#emptyRoomCloneBtn");
            if (cloneBtn && typeof cloneMoviesToCurrentRoom === "function") {
                cloneBtn.addEventListener("click", async () => {
                    await cloneMoviesToCurrentRoom("default");
                });
            }
            return;
        }

        const isGuestView = typeof isAuthenticated === "function" && !isAuthenticated();
        const fragment = document.createDocumentFragment();

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
                        <button type="button" class="action-btn action-btn-edit" data-action="edit" data-id="${escapeHtml(String(movie.id))}" title="Редактировать" aria-label="Редактировать">✏️</button>
                        <button type="button" class="action-btn action-btn-delete" data-action="delete" data-id="${escapeHtml(String(movie.id))}" title="${isGuestView ? 'Удалить из временного списка' : 'Удалить'}" aria-label="Удалить">🗑️</button>
                    </div>
                </td>
            `;

            fragment.appendChild(tr);
        }

        moviesTableBody.appendChild(fragment);
    }

    // ── Пагинация ────────────────────────────────────────────────────────────
    function renderPagination(totalCount, totalPages) {
        const rangeText = document.getElementById("pageRangeText");
        const numbersContainer = document.getElementById("paginationNumbers");
        const prevBtn = document.getElementById("prevPageBtn");
        const nextBtn = document.getElementById("nextPageBtn");
        const totalBadge = document.getElementById("moviesTotalBadge");

        const isGuestView = typeof isAuthenticated === "function" && !isAuthenticated();

        if (totalBadge) {
            if (isGuestView) {
                totalBadge.textContent = totalCount ? `Временный список: ${totalCount} ${pluralizeMovies(totalCount)}` : "Временный список пуст";
            } else {
                totalBadge.textContent = totalCount ? `${totalCount} ${pluralizeMovies(totalCount)}` : "0 фильмов";
            }
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

        if (rangeText) rangeText.textContent = `Показано ${from}–${to} из ${totalCount}`;
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

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

    // ── Удаление и Редактирование ────────────────────────────────────────────
    window.deleteMovieConfirm = async function(id) {
        const isGuest = !isAuthenticated();
        const promptText = isGuest ? "Удалить фильм из вашего временного списка?" : "Удалить фильм из каталога?";
        if (!confirm(promptText)) return;
        const ok = await deleteMovie(id);
        if (ok) {
            await loadAndRenderMovies();
        }
    };

    window.editMovie = async function(id) {
        const modal = document.getElementById("movieModal");
        if (!modal) {
            window.location.href = `add.html?id=${encodeURIComponent(id)}`;
            return;
        }

        let movieData = null;

        if (!isAuthenticated()) {
            const guestList = typeof getGuestMovies === "function" ? getGuestMovies() : [];
            movieData = guestList.find(m => String(m.id) === String(id)) || allMovies.find(m => String(m.id) === String(id));
        } else {
            if (!supabase) {
                movieData = allMovies.find(m => String(m.id) === String(id));
            } else {
                const { data, error } = await supabase
                    .from("movies")
                    .select("*")
                    .eq("id", id)
                    .single();
                if (!error && data) {
                    movieData = data;
                }
            }
        }

        if (!movieData) {
            alert("Фильм не найден");
            return;
        }

        document.getElementById("movieEditId").value       = movieData.id;
        document.getElementById("movieEditTitle").value    = movieData.title;
        document.getElementById("movieEditGenre").value    = movieData.genre   || "";
        document.getElementById("movieEditComment").value  = movieData.comment || "";

        const statusSelect = document.getElementById("movieEditStatus");
        if (statusSelect) {
            let hasOption = false;
            for (const opt of statusSelect.options) {
                if (opt.value === movieData.status) { hasOption = true; break; }
            }
            if (!hasOption && movieData.status) {
                const newOpt = document.createElement("option");
                newOpt.value = movieData.status;
                newOpt.textContent = movieData.status;
                statusSelect.appendChild(newOpt);
            }
            statusSelect.value = movieData.status || "Не просмотрено";
        }

        const editRatingsEl = document.getElementById("movieEditRatings");
        const editPreviewEl = document.getElementById("movieEditRatingPreview");
        if (editRatingsEl) {
            editRatingsEl.value = movieData.ratings != null ? movieData.ratings : "";
            if (editPreviewEl && typeof formatRatingBadge === "function") {
                editPreviewEl.innerHTML = formatRatingBadge(movieData.ratings);
            }
            const editCalcInfoEl = document.getElementById("movieEditRatingCalcInfo");
            if (editCalcInfoEl) editCalcInfoEl.classList.add("hidden");
        }

        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
    };

    // ── Инициализация страницы ───────────────────────────────────────────────
    function initMoviesPage() {
        // Пагинация
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

        const perPageSelect = document.getElementById("perPageSelect");
        if (perPageSelect) {
            perPageSelect.addEventListener("change", (e) => {
                pageSize = Number(e.target.value) || 10;
                currentPage = 1;
                applyFilterAndRender();
            });
        }

        // Сортировка
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

        // Поиск с дебаунсом
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

        // Модальное окно редактирования
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

        // Делегирование событий клика по таблице
        moviesTableBody.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-action]");
            if (btn) {
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (!id) return;

                if (action === "edit") {
                    editMovie(id);
                } else if (action === "delete") {
                    deleteMovieConfirm(id);
                }
                return;
            }

            const row = e.target.closest("tr.movie-table-row");
            if (row && row.dataset.id) {
                editMovie(row.dataset.id);
            }
        });

        // Удаление из модала
        const modalDeleteBtn = document.getElementById("movieModalDeleteBtn");
        if (modalDeleteBtn) {
            modalDeleteBtn.addEventListener("click", async () => {
                const id = document.getElementById("movieEditId").value;
                if (!id) return;

                if (editModal) {
                    editModal.classList.add("hidden");
                    editModal.setAttribute("aria-hidden", "true");
                }
                await deleteMovieConfirm(id);
            });
        }

        // Сохранение изменений в модале
        if (editForm) {
            editForm.addEventListener("submit", async (e) => {
                e.preventDefault();

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

                    const rawId = document.getElementById("movieEditId").value;
                    const movie = {
                        id:      rawId,
                        title:   document.getElementById("movieEditTitle").value.trim(),
                        genre:   document.getElementById("movieEditGenre").value.trim(),
                        comment: document.getElementById("movieEditComment").value.trim(),
                        status:  document.getElementById("movieEditStatus").value.trim(),
                        ratings: parsed.finalRating
                    };

                    const ok = await updateMovie(movie);
                    if (ok) {
                        if (editModal) {
                            editModal.classList.add("hidden");
                            editModal.setAttribute("aria-hidden", "true");
                        }
                        await loadAndRenderMovies();
                    }
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        // Слушатель изменения состояния авторизации Supabase
        if (typeof supabase !== "undefined" && supabase && supabase.auth) {
            try {
                supabase.auth.onAuthStateChange(() => {
                    loadAndRenderMovies();
                });
            } catch (_) {}
        }

        // Загрузка данных
        loadAndRenderMovies();
    }

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

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initMoviesPage);
    } else {
        initMoviesPage();
    }
})();
