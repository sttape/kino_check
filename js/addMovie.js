function parseCsvLine(line) {
    const result = [];
    let current = "";
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];

        if (character === '"') {
            if (insideQuotes && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                insideQuotes = !insideQuotes;
            }
            continue;
        }

        if (character === ',' && !insideQuotes) {
            result.push(current.trim());
            current = "";
            continue;
        }

        current += character;
    }

    result.push(current.trim());
    return result;
}

async function importMoviesFromCsv(csvText) {
    const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    if (lines.length === 0) {
        throw new Error("CSV пустой");
    }

    const headers = parseCsvLine(lines[0]).map(header => header.toLowerCase());
    const requiredFields = ["title"];
    const hasRequiredFields = requiredFields.every(field => headers.includes(field));

    if (!hasRequiredFields) {
        throw new Error("CSV должен содержать колонку title");
    }

    const movies = await loadMovies();

    lines.slice(1).forEach(line => {
        const values = parseCsvLine(line);
        if (values.every(value => value === "")) {
            return;
        }

        const record = headers.reduce((accumulator, header, index) => {
            accumulator[header] = values[index] || "";
            return accumulator;
        }, {});

        const ratings = record.ratings
            ? String(record.ratings)
                .split(/[|;]/)
                .map(value => Number(value.trim()))
                .filter(value => Number.isFinite(value))
            : [];

        movies.push({
            id: Date.now() + Math.random(),
            title: record.title,
            genre: record.genre || "",
            comment: record.comment || "",
            status: record.status || "Не просмотрено",
            ratings
        });
    });

    await saveMovies(movies);
}

const addMovieForm = document.getElementById("addMovieForm");
if (addMovieForm) {
    addMovieForm.addEventListener("submit", async e => {
        e.preventDefault();

        const movies = await loadMovies();
        const title = document.getElementById("title").value.trim();
        const genre = document.getElementById("genre").value.trim();
        const comment = document.getElementById("comment").value.trim();

        movies.push({
            id: Date.now(),
            title,
            genre,
            comment,
            status: document.getElementById("status").value,
            ratings: []
        });

        await saveMovies(movies);
        alert("Фильм добавлен!");
        e.target.reset();

        const addMovieModal = document.getElementById("addMovieModal");
        if (addMovieModal) {
            addMovieModal.classList.add("hidden");
            addMovieModal.setAttribute("aria-hidden", "true");
        }

        if (document.body.dataset.page === "movies") {
            if (typeof renderMoviesTable === "function") {
                await renderMoviesTable();
            }
        }
    });
}

const csvInput = document.getElementById("csvInput");
if (csvInput) {
    csvInput.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            const text = await file.text();
            await importMoviesFromCsv(text);
            alert("CSV импортирован!");
            csvInput.value = "";
            const addMovieModal = document.getElementById("addMovieModal");
            if (addMovieModal) {
                addMovieModal.classList.add("hidden");
                addMovieModal.setAttribute("aria-hidden", "true");
            }
            if (document.body.dataset.page === "movies" && typeof renderMoviesTable === "function") {
                await renderMoviesTable();
            }
        } catch (error) {
            alert(error.message || "Не удалось импортировать CSV");
            event.target.value = "";
        }
    });
}

const openAddMovieModalBtn = document.getElementById("openAddMovieModalBtn");
const addMovieModal = document.getElementById("addMovieModal");

function closeAddMovieModal() {
    if (!addMovieModal) {
        return;
    }

    addMovieModal.classList.add("hidden");
    addMovieModal.setAttribute("aria-hidden", "true");
}

if (openAddMovieModalBtn && addMovieModal) {
    openAddMovieModalBtn.addEventListener("click", () => {
        addMovieModal.classList.remove("hidden");
        addMovieModal.setAttribute("aria-hidden", "false");
        const titleField = document.getElementById("title");
        if (titleField) {
            titleField.focus();
        }
    });

    addMovieModal.querySelectorAll("[data-add-modal-close]").forEach(button => {
        button.addEventListener("click", closeAddMovieModal);
    });

    addMovieModal.addEventListener("click", event => {
        if (event.target === addMovieModal) {
            closeAddMovieModal();
        }
    });
}
