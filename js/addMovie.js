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
    if (addForm) {
        // Предзаполнение при редактировании (?id=…)
        const params    = new URLSearchParams(window.location.search);
        const editingId = params.get("id") ? Number(params.get("id")) : null;
        const submitBtn = addForm.querySelector("button[type=submit]");
        let existingRating = null;

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
                    existingRating = data.ratings ?? null;
                });
        }

        addForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
                const authOk = await ensureAuthenticated(editingId ? "Для изменения фильма" : "Для добавления фильма в каталог");
                if (!authOk) return;
            }

            const submitBtn = addForm.querySelector("button[type=submit]");
            if (submitBtn) submitBtn.disabled = true;

            try {
                const movie = {
                    title:   titleInput   ? titleInput.value.trim()   : "",
                    genre:   genreInput   ? genreInput.value.trim()   : "",
                    comment: commentInput ? commentInput.value.trim() : "",
                    status:  statusInput  ? statusInput.value         : "Не просмотрено",
                    ratings: editingId ? existingRating : null
                };

                const validation = validateMovieInput(movie);
                if (!validation.valid) {
                    alert(validation.error);
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
            } finally {
                if (submitBtn) submitBtn.disabled = false;
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

    const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
    const MAX_CSV_ROWS = 1000;

    if (csvInput) {
        csvInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (typeof ensureAuthenticated === "function" && !isAuthenticated()) {
                const authOk = await ensureAuthenticated("Для импорта фильмов из CSV");
                if (!authOk) {
                    e.target.value = "";
                    return;
                }
            }

            if (file.size > MAX_CSV_SIZE_BYTES) {
                setStatus("Файл слишком большой. Максимальный размер: 5 МБ.", "salmon");
                e.target.value = "";
                return;
            }

            csvInput.disabled = true;
            setStatus("Читаем файл…");

            let text;
            try {
                const buffer = await file.arrayBuffer();
                // Пробуем UTF-8; если появляются символы замены U+FFFD — декодируем как windows-1251
                let decoded = new TextDecoder("utf-8").decode(buffer);
                if (decoded.includes("\uFFFD")) {
                    try {
                        decoded = new TextDecoder("windows-1251").decode(buffer);
                    } catch (_) {}
                }
                text = decoded;
            } catch (err) {
                setStatus("Ошибка чтения: " + err.message, "salmon");
                csvInput.disabled = false;
                return;
            }

            // Удаляем BOM
            text = text.replace(/^\uFEFF/, "");

            const lines = text.trim().split(/\r?\n/).filter(l => l.trim());

            if (lines.length < 2) {
                setStatus("Файл пустой или нет строк данных.", "salmon");
                csvInput.disabled = false;
                return;
            }

            if (lines.length > MAX_CSV_ROWS) {
                setStatus(`Файл содержит слишком много строк (${lines.length}). Лимит: ${MAX_CSV_ROWS} строк за раз.`, "salmon");
                csvInput.disabled = false;
                return;
            }

            // Надёжно определяем разделитель по первой строке
            const firstLine = lines[0];
            const semicolonCount = (firstLine.match(/;/g) || []).length;
            const commaCount = (firstLine.match(/,/g) || []).length;
            const tabCount = (firstLine.match(/\t/g) || []).length;

            let delimiter = ",";
            if (semicolonCount > 0 && semicolonCount >= commaCount && semicolonCount >= tabCount) {
                delimiter = ";";
            } else if (tabCount > 0 && tabCount > commaCount && tabCount > semicolonCount) {
                delimiter = "\t";
            }

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

            // Маппинг заголовков на поля модели
            const rawHeaders = parseLine(lines[0]).map(h =>
                h.replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim().toLowerCase()
            );

            let titleIdx = -1, genreIdx = -1, commentIdx = -1, statusIdx = -1, ratingIdx = -1;

            rawHeaders.forEach((h, idx) => {
                if (titleIdx === -1 && (h === "title" || h.includes("название") || h === "фильм")) titleIdx = idx;
                else if (genreIdx === -1 && (h === "genre" || h.includes("жанр"))) genreIdx = idx;
                else if (commentIdx === -1 && (h === "comment" || h.includes("коммент") || h.includes("описание"))) commentIdx = idx;
                else if (statusIdx === -1 && (h === "status" || h.includes("статус"))) statusIdx = idx;
                else if (ratingIdx === -1 && (h === "ratings" || h === "rating" || h.includes("оценк") || h.includes("балл"))) ratingIdx = idx;
            });

            // Если заголовков нет, но есть 6 колонок как в Google Form:
            // 0: время, 1: название, 2: жанр, 3: комментарий, 4: оценка, 5: статус
            if (titleIdx === -1 && rawHeaders.length >= 2) {
                titleIdx = 1;
                genreIdx = 2;
                commentIdx = 3;
                ratingIdx = 4;
                statusIdx = 5;
            }

            if (titleIdx === -1) {
                setStatus(`Колонка с названием не найдена. Обнаружены: ${rawHeaders.filter(Boolean).join(", ")}`, "salmon");
                csvInput.disabled = false;
                return;
            }

            function extractRating(val) {
                if (!val) return null;
                const m = val.match(/\((-?\d+)\)/);
                if (m) {
                    const n = Number(m[1]);
                    if (!isNaN(n) && n >= -1 && n <= 11) return n;
                }
                const n2 = Number(val);
                if (!isNaN(n2) && n2 >= -1 && n2 <= 11) return n2;
                return null;
            }

            function normalizeStatus(val) {
                if (!val) return "Не просмотрено";
                const v = val.toLowerCase();
                if (v.includes("не просмотрено")) return "Не просмотрено";
                if (v.includes("просмотрено")) return "Просмотрено";
                if (v.includes("запланировано")) return "Запланировано";
                if (v.includes("скоро")) return "Скоро выйдет";
                if (v.includes("не вышел")) return "Не вышел";
                if (v.includes("не охота")) return "НЕ ОХОТА";
                return val.trim();
            }

            const movies = lines.slice(1).map(line => {
                const cols = parseLine(line).map(c => c.replace(/^"|"$/g, "").trim());
                const title = titleIdx !== -1 && cols[titleIdx] ? cols[titleIdx] : "";
                if (!title) return null;

                const genre = genreIdx !== -1 && cols[genreIdx] ? cols[genreIdx] : "";
                const comment = commentIdx !== -1 && cols[commentIdx] ? cols[commentIdx] : "";
                const rawRating = ratingIdx !== -1 && cols[ratingIdx] ? cols[ratingIdx] : "";
                const rawStatus = statusIdx !== -1 && cols[statusIdx] ? cols[statusIdx] : "";

                return {
                    title,
                    genre,
                    comment,
                    status: normalizeStatus(rawStatus),
                    ratings: extractRating(rawRating)
                };
            }).filter(Boolean);

            if (!movies.length) {
                setStatus("Нет фильмов с заполненным title.", "salmon");
                csvInput.disabled = false;
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
            csvInput.disabled = false;

            if (errors) {
                setStatus(`Готово: ${done} добавлено, ${errors} с ошибкой.`, "#fbbf24");
            } else {
                setStatus(`✓ Импортировано ${done} фильм(ов)`, "#4ade80");
            }

            setTimeout(() => { window.location.href = "movies.html"; }, 1500);
        });
    }

}); // конец DOMContentLoaded

