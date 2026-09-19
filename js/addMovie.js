// addMovie.js
// Страница add.html: форма добавления фильма + CSV-импорт
// Весь код запускается только после полной загрузки DOM

window.addEventListener("DOMContentLoaded", () => {

    // ── Форма добавления ────────────────────────────────────────────────────
    const addForm      = document.getElementById("addMovieForm");
    const titleInput   = document.getElementById("movieTitle");
    const genreInput   = document.getElementById("movieGenre");
    const commentInput = document.getElementById("movieComment");
    const statusInput  = document.getElementById("movieStatus");
    const ratingInput  = document.getElementById("movieRating");

    if (addForm) {
        // Предзаполнение при редактировании (?id=…)
        const params    = new URLSearchParams(window.location.search);
        const editingId = params.get("id") ? Number(params.get("id")) : null;
        const submitBtn = addForm.querySelector("button[type=submit]");

        if (editingId) {
            if (submitBtn) submitBtn.textContent = "Сохранить изменения";
            supabase.from("movies").select("*").eq("id", editingId).single()
                .then(({ data, error }) => {
                    if (error || !data) { alert("Фильм не найден"); return; }
                    if (titleInput)   titleInput.value   = data.title;
                    if (genreInput)   genreInput.value   = data.genre   || "";
                    if (commentInput) commentInput.value = data.comment || "";
                    if (statusInput)  {
                        let hasOption = false;
                        for (const opt of statusInput.options) {
                            if (opt.value === data.status) { hasOption = true; break; }
                        }
                        if (!hasOption && data.status) {
                            const newOpt = document.createElement("option");
                            newOpt.value = data.status;
                            newOpt.textContent = data.status;
                            statusInput.appendChild(newOpt);
                        }
                        statusInput.value = data.status || "Не просмотрено";
                    }
                    if (ratingInput)  ratingInput.value  = data.ratings ?? "";
                });
        }

        addForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const ratingRaw = ratingInput && ratingInput.value.trim() !== "" ? Number(ratingInput.value) : null;
            const movie = {
                title:   titleInput   ? titleInput.value.trim()   : "",
                genre:   genreInput   ? genreInput.value.trim()   : "",
                comment: commentInput ? commentInput.value.trim() : "",
                status:  statusInput  ? statusInput.value         : "Не просмотрено",
                ratings: ratingRaw !== null && !isNaN(ratingRaw) ? ratingRaw : null
            };

            if (!movie.title) { alert("Название обязательно"); return; }

            if (movie.ratings !== null && (movie.ratings < -1 || movie.ratings > 11)) {
                alert("Оценка должна быть от -1 до 11");
                return;
            }

            if (editingId) {
                movie.id = editingId;
                const ok = await updateMovie(movie);
                if (ok) window.location.href = "movies.html";
            } else {
                const ok = await insertMovie(movie);
                if (ok) {
                    addForm.reset();
                    window.location.href = "movies.html";
                }
            }
        });
    }

    // ── CSV-импорт ──────────────────────────────────────────────────────────
    const csvInput = document.getElementById("csvInput");
    const statusEl = document.getElementById("csvImportStatus");

    function setStatus(msg, color) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.style.color = color || "#94a3b8";
    }

    // Парсит одну строку CSV с поддержкой кавычек и экранирования ""
    function parseRow(row) {
        const cols = [];
        let cur = "";
        let inQ = false;
        for (let i = 0; i < row.length; i++) {
            const ch = row[i];
            if (ch === '"') {
                if (inQ && row[i + 1] === '"') { cur += '"'; i++; } // экран. кавычка
                else inQ = !inQ;
            } else if (ch === "," && !inQ) {
                cols.push(cur.trim());
                cur = "";
            } else {
                cur += ch;
            }
        }
        cols.push(cur.trim());
        return cols;
    }

    if (csvInput) {
        csvInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            setStatus("Читаем файл…");

            let text;
            try { text = await file.text(); }
            catch (err) { setStatus("Ошибка чтения: " + err.message, "salmon"); return; }

            // Удаляем BOM (Excel добавляет \uFEFF в начало UTF-8 файлов)
            text = text.replace(/^\uFEFF/, "");

            // Определяем разделитель: запятая или точка с запятой (Excel в RU-локали)
            const delimiter = text.indexOf(";") !== -1 && text.indexOf(",") === -1 ? ";" : ",";

            // Переопределяем parseRow под текущий разделитель
            const parseLine = (row) => {
                const cols = [];
                let cur = ""; let inQ = false;
                for (let i = 0; i < row.length; i++) {
                    const ch = row[i];
                    if (ch === '"') {
                        if (inQ && row[i + 1] === '"') { cur += '"'; i++; }
                        else inQ = !inQ;
                    } else if (ch === delimiter && !inQ) {
                        cols.push(cur.trim());
                        cur = "";
                    } else { cur += ch; }
                }
                cols.push(cur.trim());
                return cols;
            };

            const lines = text.trim().split(/\r?\n/).filter(l => l.trim());

            if (lines.length < 2) {
                setStatus("Файл пустой или нет строк данных.", "salmon");
                return;
            }

            // Нормализуем заголовки: убираем BOM, кавычки, пробелы
            const headers = parseLine(lines[0]).map(h =>
                h.replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim().toLowerCase()
            );

            setStatus(`Заголовки: ${headers.join(", ")}`);

            if (!headers.includes("title")) {
                setStatus(
                    `Колонка "title" не найдена. Обнаружены: ${headers.join(", ")}`,
                    "salmon"
                );
                return;
            }

            const movies = lines.slice(1).map(line => {
                // id-колонка из CSV игнорируется — Supabase генерирует свои ID
                const cols = parseLine(line).map(c => c.replace(/^"|"$/g, "").trim());
                const obj  = {};
                headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
                const rVal = obj.ratings !== "" && !isNaN(Number(obj.ratings)) ? Number(obj.ratings) : null;
                return {
                    title:   obj.title   || "",
                    genre:   obj.genre   || "",
                    comment: obj.comment || "",
                    status:  obj.status  || "Не просмотрено",
                    ratings: (rVal !== null && rVal >= -1 && rVal <= 11) ? rVal : null
                };
            }).filter(m => m.title);

            if (!movies.length) {
                setStatus("Нет фильмов с заполненным title.", "salmon");
                return;
            }

            let done = 0, errors = 0;
            setStatus(`Импортируем 0 из ${movies.length}…`);

            for (const movie of movies) {
                const ok = await insertMovie(movie);
                if (ok) {
                    done++;
                } else {
                    errors++;
                    console.error("CSV: ошибка вставки", movie.title);
                }
                setStatus(`Загружено ${done} из ${movies.length}…`);
            }

            e.target.value = "";

            if (errors) {
                setStatus(`Готово: ${done} добавлено, ${errors} с ошибкой.`, "#fbbf24");
            } else {
                setStatus(`✓ Импортировано ${done} фильм(ов)`, "#4ade80");
            }

            setTimeout(() => { window.location.href = "movies.html"; }, 1500);
        });
    }

}); // конец DOMContentLoaded

