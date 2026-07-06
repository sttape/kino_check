let moviesSearchQuery = "";

async function renderMoviesTable() {
    const tbody = document.querySelector("#moviesTable tbody");
    if (!tbody) {
        return;
    }

    const movies = (await loadMovies()).filter(movie => {
        if (!moviesSearchQuery) {
            return true;
        }

        const haystack = [movie.title, movie.genre, movie.comment, movie.status]
            .map(value => String(value || "").toLowerCase())
            .join(" ");

        return haystack.includes(moviesSearchQuery);
    });
    tbody.innerHTML = "";

    if (movies.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">Список пока пуст. Добавьте первый фильм на странице добавления.</td>
            </tr>
        `;
        return;
    }

    movies.forEach(movie => {
        const avg = movie.ratings?.length
            ? (movie.ratings.reduce((a, b) => a + b, 0) / movie.ratings.length).toFixed(2)
            : "-";

        const row = `
            <tr>
                <td>${movie.title}</td>
                <td>${movie.genre || "-"}</td>
                <td>${movie.comment || "-"}</td>
                <td>${movie.status || "-"}</td>
                <td>${avg}</td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="action-btn action-btn-edit" data-movie-id="${movie.id}">Редактировать</button>
                        <button type="button" class="action-btn action-btn-delete" data-movie-id="${movie.id}">Удалить</button>
                    </div>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", row);
    });

    tbody.querySelectorAll(".action-btn-edit").forEach(button => {
        button.addEventListener("click", () => openMovieModal(Number(button.dataset.movieId)));
    });

    tbody.querySelectorAll(".action-btn-delete").forEach(button => {
        button.addEventListener("click", () => deleteMovie(Number(button.dataset.movieId)));
    });
}

async function openMovieModal(movieId) {
    const movies = await loadMovies();
    const movie = movies.find(item => item.id === movieId);

    if (!movie) {
        alert("Фильм не найден");
        return;
    }

    const modal = document.getElementById("movieModal");
    const editId = document.getElementById("movieEditId");
    const title = document.getElementById("movieEditTitle");
    const genre = document.getElementById("movieEditGenre");
    const comment = document.getElementById("movieEditComment");
    const status = document.getElementById("movieEditStatus");
    const ratings = document.getElementById("movieEditRatings");

    if (!modal || !editId || !title || !genre || !comment || !status || !ratings) {
        return;
    }

    editId.value = String(movie.id);
    title.value = movie.title || "";
    genre.value = movie.genre || "";
    comment.value = movie.comment || "";
    status.value = movie.status || "Не просмотрено";
    ratings.value = Array.isArray(movie.ratings) ? movie.ratings.join(", ") : "";

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    title.focus();
}

function closeMovieModal() {
    const modal = document.getElementById("movieModal");
    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
}

async function saveMovieModal(event) {
    event.preventDefault();

    const movieId = Number(document.getElementById("movieEditId").value);
    const movies = await loadMovies();
    const movie = movies.find(item => item.id === movieId);

    if (!movie) {
        alert("Фильм не найден");
        return;
    }

    const ratingText = document.getElementById("movieEditRatings").value;
    movie.title = document.getElementById("movieEditTitle").value.trim();
    movie.genre = document.getElementById("movieEditGenre").value.trim();
    movie.comment = document.getElementById("movieEditComment").value.trim();
    movie.status = document.getElementById("movieEditStatus").value;
    movie.ratings = ratingText
        .split(/[;,]/)
        .map(value => Number(value.trim()))
        .filter(value => Number.isFinite(value));

    await saveMovies(movies);
    closeMovieModal();
    await renderMoviesTable();
}

async function deleteMovie(movieId) {
    const movies = await loadMovies();
    const movie = movies.find(item => item.id === movieId);

    if (!movie) {
        alert("Фильм не найден");
        return;
    }

    if (!confirm(`Удалить фильм «${movie.title}»?`)) {
        return;
    }

    const updatedMovies = movies.filter(item => item.id !== movieId);
    await saveMovies(updatedMovies);

    if (loadLastMovieId() === movieId) {
        localStorage.removeItem(LAST_MOVIE_KEY);
    }

    await renderMoviesTable();
}

const movieModal = document.getElementById("movieModal");
const movieEditForm = document.getElementById("movieEditForm");

if (movieModal) {
    movieModal.querySelectorAll("[data-modal-close]").forEach(button => {
        button.addEventListener("click", closeMovieModal);
    });

    movieModal.addEventListener("click", event => {
        if (event.target === movieModal) {
            closeMovieModal();
        }
    });
}

if (movieEditForm) {
    movieEditForm.addEventListener("submit", saveMovieModal);
}

if (document.body.dataset.page === "movies") {
    const searchInput = document.getElementById("moviesSearchInput");
    const clearSearchButton = document.getElementById("clearMoviesSearchBtn");

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            moviesSearchQuery = searchInput.value.trim().toLowerCase();
            renderMoviesTable();
        });
    }

    if (clearSearchButton && searchInput) {
        clearSearchButton.addEventListener("click", () => {
            searchInput.value = "";
            moviesSearchQuery = "";
            renderMoviesTable();
            searchInput.focus();
        });
    }

    renderMoviesTable();

    window.addEventListener("pageshow", () => {
        void renderMoviesTable();
    });

    window.addEventListener("focus", () => {
        void renderMoviesTable();
    });

    window.addEventListener("storage", event => {
        if (!event.key || event.key === STORAGE_KEY) {
            void renderMoviesTable();
        }
    });

    setInterval(() => {
        void renderMoviesTable();
    }, 20000);
}
