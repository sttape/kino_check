// wheel.js
// Логика барабана: вращение с физикой, честный выбор, режимы и фильтрация

let allMovies = [];
let wheelMovies = [];
let spinning = false;
let eliminationMode = false;
let currentRotation = 0;
let selectedMovie = null;

const palette = [
    "#f97316", "#0ea5e9", "#8b5cf6", "#10b981", 
    "#f59e0b", "#ec4899", "#06b6d4", "#84cc16", 
    "#6366f1", "#14b8a6", "#e11d48", "#3b82f6"
];

const wheelCanvas = document.getElementById("wheelCanvas");
const ctx = wheelCanvas ? wheelCanvas.getContext("2d") : null;

const spinBtn = document.getElementById("spinBtn");
const resetWheelBtn = document.getElementById("resetWheelBtn");
const wheelResult = document.getElementById("wheelResult");
const wheelHint = document.getElementById("wheelHint");
const startWatchBtn = document.getElementById("startWatchBtn");
const wheelMovieList = document.getElementById("wheelMovieList");
const wheelCount = document.getElementById("wheelCount");

const modeNormalBtn = document.getElementById("modeNormal");
const modeEliminationBtn = document.getElementById("modeElimination");

const wheelDurationInput = document.getElementById("wheelDurationInput");
const wheelDurationValue = document.getElementById("wheelDurationValue");
const filterUnwatchedInput = document.getElementById("wheelFilterUnwatched");

const hubImageInput = document.getElementById("hubImageInput");
const resetHubImageBtn = document.getElementById("resetHubImageBtn");
const wheelCenterImg = document.getElementById("wheelCenterImg");
const wheelCenterText = document.getElementById("wheelCenterText");

const STORAGE_KEY_HUB_IMAGE = "wheel_hub_image";

// ---------------------- ИНИЦИАЛИЗАЦИЯ ----------------------

window.addEventListener("DOMContentLoaded", async () => {
    if (!wheelCanvas || !ctx) return;

    try {
        if (wheelDurationInput && wheelDurationValue) {
            const savedDuration = loadWheelDuration();
            wheelDurationInput.value = savedDuration;
            wheelDurationValue.textContent = savedDuration + " сек";

            wheelDurationInput.addEventListener("input", () => {
                wheelDurationValue.textContent = wheelDurationInput.value + " сек";
                saveWheelDuration(Number(wheelDurationInput.value));
            });
        }

        if (filterUnwatchedInput) {
            filterUnwatchedInput.addEventListener("change", () => {
                applyFilterAndRender();
            });
        }

        initHubImage();
        await syncWheelState();
    } catch (err) {
        console.error("Ошибка инициализации колеса:", err);
    }
});

// ---------------------- ЦЕНТР КОЛЕСА (GIF / ИЗОБРАЖЕНИЕ) ----------------------

function initHubImage() {
    const ALLOWED_IMAGE_TYPES = ["image/gif", "image/png", "image/jpeg", "image/webp"];
    const MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB

    try {
        const saved = localStorage.getItem(STORAGE_KEY_HUB_IMAGE);
        if (saved && typeof saved === "string" && saved.startsWith("data:image/") && !saved.startsWith("data:image/svg+xml")) {
            setHubImage(saved);
        }
    } catch (e) {}

    if (hubImageInput) {
        hubImageInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            // Защита от SVG XSS и невалидных форматов
            if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
                alert("Разрешены только растровые изображения (GIF, PNG, JPG, WebP). SVG не поддерживается в целях безопасности.");
                e.target.value = "";
                return;
            }

            // Ограничение на размер файла (защита от переполнения памяти)
            if (file.size > MAX_IMAGE_SIZE_BYTES) {
                alert("Размер файла не должен превышать 3 МБ.");
                e.target.value = "";
                return;
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
                    alert("Ошибка при чтении изображения.");
                    return;
                }
                try {
                    localStorage.setItem(STORAGE_KEY_HUB_IMAGE, dataUrl);
                } catch (err) {
                    console.warn("Изображение слишком большое для сохранения в localStorage, отображается в текущей сессии.");
                }
                setHubImage(dataUrl);
            };
            reader.readAsDataURL(file);
        });
    }

    if (resetHubImageBtn) {
        resetHubImageBtn.addEventListener("click", () => {
            clearHubImage();
        });
    }
}

function setHubImage(dataUrl) {
    if (wheelCenterImg && wheelCenterText) {
        if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/") || dataUrl.startsWith("data:image/svg+xml")) {
            return;
        }
        wheelCenterImg.src = dataUrl;
        wheelCenterImg.classList.remove("hidden");
        wheelCenterText.classList.add("hidden");
        if (resetHubImageBtn) resetHubImageBtn.classList.remove("hidden");
    }
}

function clearHubImage() {
    try {
        localStorage.removeItem(STORAGE_KEY_HUB_IMAGE);
    } catch (e) {}

    if (wheelCenterImg && wheelCenterText) {
        wheelCenterImg.src = "";
        wheelCenterImg.classList.add("hidden");
        wheelCenterText.classList.remove("hidden");
        if (resetHubImageBtn) resetHubImageBtn.classList.add("hidden");
    }
    if (hubImageInput) hubImageInput.value = "";
}

// ---------------------- ЗАГРУЗКА ФИЛЬМОВ ----------------------

async function syncWheelState() {
    if (spinning) return;

    const data = await loadMovies();
    allMovies = Array.isArray(data) ? data : [];

    applyFilterAndRender();
}

function applyFilterAndRender() {
    const onlyUnwatched = filterUnwatchedInput ? filterUnwatchedInput.checked : true;

    if (onlyUnwatched) {
        wheelMovies = allMovies.filter(m => m.status === "Не просмотрено");
    } else {
        wheelMovies = [...allMovies];
    }

    if (resetWheelBtn) resetWheelBtn.classList.add("hidden");
    if (startWatchBtn) startWatchBtn.classList.add("hidden");
    if (wheelResult) wheelResult.textContent = "";

    updateHint();
    renderWheelList();
    drawWheel();
}

function updateHint() {
    if (!wheelHint) return;
    if (!wheelMovies.length) {
        wheelHint.textContent = filterUnwatchedInput && filterUnwatchedInput.checked
            ? "Все фильмы уже просмотрены! Снимите галочку фильтра или добавьте новые."
            : "Добавьте фильмы в каталог, чтобы крутить колесо.";
    } else {
        wheelHint.textContent = eliminationMode
            ? "Режим выбывания: выбранный фильм удаляется из колеса после каждого вращения."
            : "Нажмите кнопку вращения, чтобы колесо выбрало случайный фильм.";
    }
}

// ---------------------- ОТРИСОВКА СПИСКА ----------------------

function renderWheelList() {
    if (!wheelMovieList || !wheelCount) return;

    wheelMovieList.innerHTML = "";
    wheelCount.textContent = `${wheelMovies.length} фильмов`;

    if (!wheelMovies.length) {
        wheelMovieList.innerHTML = `<p class="muted">Фильмов нет</p>`;
        return;
    }

    wheelMovies.forEach((movie, index) => {
        const div = document.createElement("div");
        div.className = "wheel-movie-item";
        div.innerHTML = `
            <div class="wheel-index">${index + 1}</div>
            <div>
                <strong>${escapeHtml(movie.title)}</strong>
                <p class="muted">${escapeHtml(movie.genre || movie.status || "")}</p>
            </div>
        `;
        wheelMovieList.appendChild(div);
    });
}

// ---------------------- ОТРИСОВКА КОЛЕСА ----------------------

function drawWheel() {
    if (!ctx || !wheelCanvas) return;

    const count = wheelMovies.length;
    const size = wheelCanvas.width;
    const center = size / 2;
    const radius = center - 8;

    ctx.clearRect(0, 0, size, size);

    if (!count) {
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
        ctx.stroke();

        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 28px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Нет фильмов для колеса", center, center);
        return;
    }

    const angleStep = (2 * Math.PI) / count;

    // Подбираем крупный читаемый шрифт с учётом разрешения холста 1200px
    let fontSize, maxChars;
    if (count <= 10) {
        fontSize = 40;
        maxChars = 28;
    } else if (count <= 20) {
        fontSize = 32;
        maxChars = 26;
    } else if (count <= 38) {
        fontSize = 26;
        maxChars = 24;
    } else if (count <= 55) {
        fontSize = 22;
        maxChars = 20;
    } else if (count <= 80) {
        fontSize = 18;
        maxChars = 17;
    } else {
        fontSize = 15;
        maxChars = 14;
    }

    for (let i = 0; i < count; i++) {
        const startAngle = currentRotation + i * angleStep;
        const endAngle = startAngle + angleStep;

        // Сектор
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = palette[i % palette.length];
        ctx.fill();

        // Граница сектора
        ctx.strokeStyle = "rgba(2, 6, 23, 0.55)";
        ctx.lineWidth = count > 40 ? 2 : 3;
        ctx.stroke();

        // Текст на секторе
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(startAngle + angleStep / 2);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.font = `800 ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

        let title = wheelMovies[i].title;
        if (title.length > maxChars) {
            title = title.slice(0, maxChars - 1) + "…";
        }

        // Тёмная обводка для максимальной контрастности и читаемости
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
        ctx.strokeText(title, radius - 24, 0);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(title, radius - 24, 0);
        ctx.restore();
    }

    // Внешний обод
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 6;
    ctx.stroke();

    // Центральная подложка под HTML-хаб
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.175, 0, Math.PI * 2);
    ctx.fillStyle = "#0b1020";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#f97316";
    ctx.stroke();
}

// ---------------------- ВРАЩЕНИЕ ----------------------

if (spinBtn) {
    spinBtn.addEventListener("click", () => {
        if (spinning) return;
        if (!wheelMovies.length) {
            alert("Нет доступных фильмов для вращения!");
            return;
        }
        spinWheel();
    });
}

if (wheelCanvas) {
    wheelCanvas.style.cursor = "pointer";
    wheelCanvas.addEventListener("click", () => {
        if (spinning) return;
        if (!wheelMovies.length) return;
        spinWheel();
    });
}

function spinWheel() {
    spinning = true;
    spinBtn.disabled = true;
    if (startWatchBtn) startWatchBtn.classList.add("hidden");
    if (wheelResult) wheelResult.textContent = "Колесо крутится…";

    const count = wheelMovies.length;
    const angleStep = (2 * Math.PI) / count;

    // Честный случайный выбор победителя
    const winningIndex = Math.floor(Math.random() * count);
    selectedMovie = wheelMovies[winningIndex];

    // Стрелка находится сверху: угол в системе координат канваса = 1.5 * PI (270 градусов / 12 часов)
    // Центральный угол сектора winningIndex в локальной системе колеса:
    const sliceCenterAngle = winningIndex * angleStep + angleStep / 2;

    // Небольшое случайное отклонение от точного центра сектора (+-30% от половины сектора)
    const jitter = (Math.random() - 0.5) * (angleStep * 0.6);
    const targetSliceAngle = sliceCenterAngle + jitter;

    // Вычисляем целевой угол поворота колеса targetRotation так, чтобы:
    // (1.5 * Math.PI - (targetRotation % 2PI)) == targetSliceAngle
    const turns = 4 + Math.floor(Math.random() * 3); // 4-6 полных оборотов
    const currentNorm = currentRotation % (2 * Math.PI);
    let neededNorm = (1.5 * Math.PI - targetSliceAngle) % (2 * Math.PI);
    if (neededNorm < 0) neededNorm += 2 * Math.PI;

    let delta = neededNorm - currentNorm;
    if (delta <= 0) delta += 2 * Math.PI;

    const startAngle = currentRotation;
    const targetRotation = currentRotation + turns * 2 * Math.PI + delta;

    const duration = Math.max(2000, (loadWheelDuration ? loadWheelDuration() : 5) * 1000);
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Плавное замедление (ease-out quartic)
        const eased = 1 - Math.pow(1 - progress, 4);
        currentRotation = startAngle + (targetRotation - startAngle) * eased;

        drawWheel();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            currentRotation = targetRotation;
            drawWheel();
            finishSpin(selectedMovie);
        }
    }

    requestAnimationFrame(animate);
}

function finishSpin(winner) {
    spinning = false;
    if (spinBtn) spinBtn.disabled = false;

    const isElimination = eliminationMode;
    const labelTitle = isElimination ? "Выбыл" : "Победил";
    const labelColor = isElimination ? "#f87171" : "#f97316";

    if (wheelResult) {
        wheelResult.innerHTML = `
            <div>
                <p class="eyebrow" style="margin-bottom:4px; color:${labelColor};">${labelTitle}</p>
                <strong style="font-size:1.25rem; display:block; margin-bottom:4px;">${escapeHtml(winner.title)}</strong>
                <p class="muted" style="margin:0; font-size:0.9rem;">${escapeHtml(winner.genre || "Без жанра")}</p>
            </div>
        `;
    }

    saveLastMovieId(winner.id);

    if (isElimination) {
        if (startWatchBtn) startWatchBtn.classList.add("hidden");
        eliminateMovie(winner.id);
    } else {
        if (startWatchBtn) {
            startWatchBtn.classList.remove("hidden");
            startWatchBtn.href = `rating.html?id=${winner.id}`;
        }
    }
}

// ---------------------- РЕЖИМЫ ----------------------

if (modeNormalBtn) {
    modeNormalBtn.addEventListener("click", () => {
        if (spinning) return;
        eliminationMode = false;
        modeNormalBtn.classList.add("active");
        if (modeEliminationBtn) modeEliminationBtn.classList.remove("active");
        if (wheelResult) wheelResult.textContent = "";
        if (startWatchBtn) startWatchBtn.classList.add("hidden");
        updateHint();
    });
}

if (modeEliminationBtn) {
    modeEliminationBtn.addEventListener("click", () => {
        if (spinning) return;
        eliminationMode = true;
        modeEliminationBtn.classList.add("active");
        if (modeNormalBtn) modeNormalBtn.classList.remove("active");
        if (wheelResult) wheelResult.textContent = "";
        if (startWatchBtn) startWatchBtn.classList.add("hidden");
        updateHint();
    });
}

// ---------------------- СБРОС КОЛЕСА ----------------------

if (resetWheelBtn) {
    resetWheelBtn.addEventListener("click", () => {
        if (spinning) return;
        applyFilterAndRender();
        resetWheelBtn.classList.add("hidden");
    });
}

// ---------------------- УДАЛЕНИЕ В РЕЖИМЕ ВЫБЫВАНИЯ ----------------------

function eliminateMovie(id) {
    wheelMovies = wheelMovies.filter(m => m.id !== id);
    renderWheelList();
    drawWheel();

    if (resetWheelBtn) resetWheelBtn.classList.remove("hidden");

    if (wheelMovies.length === 1) {
        const finalWinner = wheelMovies[0];
        saveLastMovieId(finalWinner.id);
        if (wheelResult) {
            wheelResult.innerHTML += `
                <div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(148,163,184,0.2);">
                    <p class="eyebrow" style="margin-bottom:4px; color:#4ade80;">Победил</p>
                    <strong style="font-size:1.25rem; display:block; margin-bottom:4px; color:#4ade80;">${escapeHtml(finalWinner.title)}</strong>
                    <p class="muted" style="margin:0; font-size:0.9rem;">${escapeHtml(finalWinner.genre || "Без жанра")}</p>
                </div>
            `;
        }
        if (startWatchBtn) {
            startWatchBtn.classList.remove("hidden");
            startWatchBtn.href = `rating.html?id=${finalWinner.id}`;
        }
    }
}

// ---------------------- УТИЛИТЫ ----------------------

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
