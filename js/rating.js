let ratingMovie = null;

function renderRatingPage() {
    const titleEl = document.getElementById("ratingMovieTitle");
    const emptyEl = document.getElementById("ratingMovieEmpty");
    const selectEl = document.getElementById("ratingMovieSelect");
    const movies = loadMovies();
    const lastRatedMovieId = loadLastMovieId();

    if (selectEl) {
        selectEl.innerHTML = movies.length
            ? movies.map(movie => `<option value="${movie.id}">${movie.title}</option>`).join("")
            : `<option value="">Фильмов пока нет</option>`;
        selectEl.disabled = movies.length === 0;
        if (lastRatedMovieId) {
            selectEl.value = String(lastRatedMovieId);
        }
        selectEl.addEventListener("change", () => {
            const selectedId = Number(selectEl.value);
            ratingMovie = movies.find(movie => movie.id === selectedId) || null;
            if (ratingMovie) {
                saveLastMovieId(ratingMovie.id);
            }
            renderRatingMovieState();
        }, { once: true });
    }

    ratingMovie = movies.find(movie => movie.id === lastRatedMovieId) || movies[0] || null;
    if (ratingMovie && selectEl) {
        selectEl.value = String(ratingMovie.id);
    }

    renderRatingMovieState();
}

function renderRatingMovieState() {
    const titleEl = document.getElementById("ratingMovieTitle");
    const emptyEl = document.getElementById("ratingMovieEmpty");

    if (!titleEl || !emptyEl) {
        return;
    }

    if (!ratingMovie) {
        emptyEl.classList.remove("hidden");
        titleEl.textContent = "";
        return;
    }

    emptyEl.classList.add("hidden");
    titleEl.innerHTML = `
        <strong>Выбранный фильм:</strong> ${ratingMovie.title}<br>
        <span class="muted">${ratingMovie.genre || "Без жанра"}</span>
    `;
}

document.getElementById("saveRatingBtn").addEventListener("click", () => {
    const ratingInput = document.getElementById("ratingInput");
    const rating = Number(ratingInput.value);

    if (rating < -1 || rating > 11) {
        alert("Оценка должна быть от -1 до 11");
        return;
    }

    if (!ratingMovie) {
        alert("Сначала выберите фильм в рулетке");
        return;
    }

    const movies = loadMovies();
    const movie = movies.find(item => item.id === ratingMovie.id);

    if (!movie) {
        alert("Фильм не найден в списке");
        return;
    }

    movie.ratings = movie.ratings || [];
    movie.ratings.push(rating);
    movie.status = "Просмотрено";

    saveMovies(movies);
    saveLastMovieId(movie.id);
    ratingInput.value = "";
    alert("Оценка сохранена!");
    renderRatingPage();
});

if (document.body.dataset.page === "rating") {
    renderRatingPage();
}
