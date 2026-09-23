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

const openWheelSettingsBtn = document.getElementById("openWheelSettingsBtn");
const wheelSettingsModal = document.getElementById("wheelSettingsModal");
const wheelSettingsContainer = document.getElementById("wheelSettingsContainer");
const wheelSettingsModalBody = document.getElementById("wheelSettingsModalBody");
const desktopSettingsSlot = document.getElementById("desktopSettingsSlot");

const mobileDrumStage = document.getElementById("mobileDrumStage");
const drumWindow = document.getElementById("drumWindow");
const drumTrack = document.getElementById("drumTrack");
const drumHousing = document.getElementById("drumHousing");
let currentDrumTranslateX = 0;

const STORAGE_KEY_HUB_IMAGE = "wheel_hub_image";

// ---------------------- МОДАЛЬНОЕ ОКНО НАСТРОЕК ----------------------

function syncSettingsLocation() {
    const isMobile = window.innerWidth <= 920;
    if (isMobile) {
        if (wheelSettingsContainer && wheelSettingsModalBody && !wheelSettingsModalBody.contains(wheelSettingsContainer)) {
            wheelSettingsModalBody.appendChild(wheelSettingsContainer);
        }
    } else {
        if (wheelSettingsContainer && desktopSettingsSlot && !desktopSettingsSlot.contains(wheelSettingsContainer)) {
            desktopSettingsSlot.appendChild(wheelSettingsContainer);
        }
        if (wheelSettingsModal && !wheelSettingsModal.classList.contains("hidden")) {
            closeWheelSettings();
        }
    }
}

function openWheelSettings() {
    if (wheelSettingsContainer && wheelSettingsModalBody && !wheelSettingsModalBody.contains(wheelSettingsContainer)) {
        wheelSettingsModalBody.appendChild(wheelSettingsContainer);
    }
    if (wheelSettingsModal) {
        wheelSettingsModal.classList.remove("hidden");
        wheelSettingsModal.setAttribute("aria-hidden", "false");
    }
}

function closeWheelSettings() {
    if (wheelSettingsModal) {
        wheelSettingsModal.classList.add("hidden");
        wheelSettingsModal.setAttribute("aria-hidden", "true");
    }
    if (window.innerWidth > 920 && desktopSettingsSlot && wheelSettingsContainer) {
        if (!desktopSettingsSlot.contains(wheelSettingsContainer)) {
            desktopSettingsSlot.appendChild(wheelSettingsContainer);
        }
    }
}

function initWheelSettingsModal() {
    if (openWheelSettingsBtn) {
        openWheelSettingsBtn.addEventListener("click", openWheelSettings);
    }

    if (wheelSettingsModal) {
        const closeButtons = wheelSettingsModal.querySelectorAll("[data-wheel-modal-close]");
        closeButtons.forEach(btn => btn.addEventListener("click", closeWheelSettings));
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && wheelSettingsModal && !wheelSettingsModal.classList.contains("hidden")) {
            closeWheelSettings();
        }
    });

    window.addEventListener("resize", () => {
        syncSettingsLocation();
        if (!spinning && drumTrack && drumWindow && wheelMovies.length) {
            const cardWidth = window.innerWidth <= 480 ? 140 : 150;
            const windowW = drumWindow.clientWidth || 280;
            const initialOffset = (windowW / 2) - (cardWidth / 2);
            currentDrumTranslateX = initialOffset;
            drumTrack.style.transform = `translate3d(${initialOffset}px, 0, 0)`;
        }
    });
    syncSettingsLocation();
}

// ---------------------- ИНИЦИАЛИЗАЦИЯ ----------------------

window.addEventListener("DOMContentLoaded", async () => {
    if (!wheelCanvas || !ctx) return;

    try {
        initWheelSettingsModal();

        if (wheelDurationInput) {
            const savedDuration = loadWheelDuration();
            wheelDurationInput.value = savedDuration;
            if (wheelDurationValue) {
                wheelDurationValue.textContent = savedDuration + " сек";
            }

            const syncDuration = () => {
                let val = Math.round(Number(wheelDurationInput.value));
                if (isNaN(val) || val < 1) val = 1;
                if (val > 60) val = 60;
                saveWheelDuration(val);
                if (wheelDurationValue) {
                    wheelDurationValue.textContent = val + " сек";
                }
            };

            wheelDurationInput.addEventListener("input", syncDuration);
            wheelDurationInput.addEventListener("change", () => {
                let val = Math.round(Number(wheelDurationInput.value));
                if (isNaN(val) || val < 1) val = 1;
                if (val > 60) val = 60;
                wheelDurationInput.value = val;
                saveWheelDuration(val);
                if (wheelDurationValue) {
                    wheelDurationValue.textContent = val + " сек";
                }
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

const IDB_NAME = "KinoCheckWheelDB";
const IDB_STORE = "settings";
const IDB_KEY_HUB = "wheel_hub_image";

function openWheelDB() {
    return new Promise((resolve) => {
        if (!window.indexedDB) {
            resolve(null);
            return;
        }
        try {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch (err) {
            resolve(null);
        }
    });
}

async function saveHubImagePersistent(dataUrl) {
    try {
        const db = await openWheelDB();
        if (db) {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).put(dataUrl, IDB_KEY_HUB);
        }
    } catch (e) {
        console.warn("Не удалось сохранить изображение в IndexedDB:", e);
    }

    try {
        localStorage.setItem(STORAGE_KEY_HUB_IMAGE, dataUrl);
    } catch (e) {
        // Если размер превышает квоту localStorage, IndexedDB сохранит данные
    }
}

async function loadHubImagePersistent() {
    try {
        const db = await openWheelDB();
        if (db) {
            const tx = db.transaction(IDB_STORE, "readonly");
            const req = tx.objectStore(IDB_STORE).get(IDB_KEY_HUB);
            const val = await new Promise((res) => {
                req.onsuccess = () => res(req.result);
                req.onerror = () => res(null);
            });
            if (val && typeof val === "string" && val.startsWith("data:image/") && !val.startsWith("data:image/svg+xml")) {
                return val;
            }
        }
    } catch (e) {}

    try {
        const saved = localStorage.getItem(STORAGE_KEY_HUB_IMAGE);
        if (saved && typeof saved === "string" && saved.startsWith("data:image/") && !saved.startsWith("data:image/svg+xml")) {
            return saved;
        }
    } catch (e) {}

    return null;
}

async function clearHubImagePersistent() {
    try {
        const db = await openWheelDB();
        if (db) {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).delete(IDB_KEY_HUB);
        }
    } catch (e) {}

    try {
        localStorage.removeItem(STORAGE_KEY_HUB_IMAGE);
    } catch (e) {}
}

async function initHubImage() {
    const ALLOWED_IMAGE_TYPES = ["image/gif", "image/png", "image/jpeg", "image/webp"];
    const MAX_IMAGE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB

    const saved = await loadHubImagePersistent();
    if (saved) {
        setHubImage(saved);
    }

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

            // Ограничение на размер файла до 30 МБ
            if (file.size > MAX_IMAGE_SIZE_BYTES) {
                alert("Размер файла не должен превышать 30 МБ.");
                e.target.value = "";
                return;
            }

            const reader = new FileReader();
            reader.onload = async (ev) => {
                const dataUrl = ev.target.result;
                if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
                    alert("Ошибка при чтении изображения.");
                    return;
                }
                await saveHubImagePersistent(dataUrl);
                setHubImage(dataUrl);
            };
            reader.readAsDataURL(file);
        });
    }

    if (resetHubImageBtn) {
        resetHubImageBtn.addEventListener("click", async () => {
            await clearHubImage();
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

async function clearHubImage() {
    await clearHubImagePersistent();

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
    renderDrum();
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
            <div class="wheel-movie-info">
                <strong class="wheel-movie-title">${escapeHtml(movie.title)}</strong>
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
    const isSmallScreen = window.innerWidth <= 768;
    let fontSize, maxChars;
    if (count <= 10) {
        fontSize = isSmallScreen ? 44 : 40;
        maxChars = isSmallScreen ? 22 : 28;
    } else if (count <= 20) {
        fontSize = isSmallScreen ? 34 : 32;
        maxChars = isSmallScreen ? 20 : 26;
    } else if (count <= 38) {
        fontSize = isSmallScreen ? 28 : 26;
        maxChars = isSmallScreen ? 18 : 24;
    } else if (count <= 55) {
        fontSize = isSmallScreen ? 24 : 22;
        maxChars = isSmallScreen ? 16 : 20;
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
        ctx.lineWidth = isSmallScreen ? 6 : 4;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
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

if (drumHousing) {
    drumHousing.style.cursor = "pointer";
    drumHousing.addEventListener("click", () => {
        if (spinning) return;
        if (!wheelMovies.length) return;
        spinWheel();
    });
}

// ---------------------- ОТРИСОВКА МОБИЛЬНОГО БАРАБАНА ----------------------

function renderDrum() {
    if (!drumTrack || !drumWindow) return;
    if (!wheelMovies.length) {
        drumTrack.innerHTML = `<div class="drum-empty-state"><span class="muted">Фильмов нет для барабана</span></div>`;
        drumTrack.style.transform = "none";
        currentDrumTranslateX = 0;
        return;
    }

    const cardWidth = window.innerWidth <= 480 ? 140 : 150;
    const minItems = 30;
    const items = [];
    while (items.length < minItems) {
        items.push(...wheelMovies);
    }
    const displayItems = items.slice(0, Math.max(minItems, wheelMovies.length * 2));

    drumTrack.innerHTML = displayItems.map((movie, idx) => {
        const color = palette[idx % palette.length];
        return `
            <div class="drum-card" data-id="${movie.id}" style="--card-accent: ${color};">
                <span class="drum-card-num" style="background:${color}">#${(idx % wheelMovies.length) + 1}</span>
                <strong class="drum-card-title">${escapeHtml(movie.title)}</strong>
                <span class="drum-card-genre">${escapeHtml(movie.genre || "Без жанра")}</span>
            </div>
        `;
    }).join("");

    const windowW = drumWindow.clientWidth || 280;
    const initialOffset = (windowW / 2) - (cardWidth / 2);
    currentDrumTranslateX = initialOffset;
    drumTrack.style.transform = `translate3d(${initialOffset}px, 0, 0)`;
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

    const duration = Math.max(1000, (loadWheelDuration ? loadWheelDuration() : 5) * 1000);
    const startTime = performance.now();

    // Подготовка данных для анимации мобильного барабана
    const cardWidth = window.innerWidth <= 480 ? 140 : 150;
    const gap = 8;
    const pitch = cardWidth + gap;
    let drumStartTranslateX = 0;
    let drumTargetTranslateX = 0;

    if (drumTrack && drumWindow) {
        const windowW = drumWindow.clientWidth || 280;
        const initialOffset = (windowW / 2) - (cardWidth / 2);

        // Всегда возвращаем барабан в начальное состояние при нажатии крутить
        drumStartTranslateX = initialOffset;
        currentDrumTranslateX = initialOffset;
        drumTrack.style.transform = `translate3d(${initialOffset}px, 0, 0)`;

        // Формируем цепочку карточек для барабана с победителем в конце
        const spinCount = Math.max(30, Math.round((duration / 1000) * 8)) + Math.floor(Math.random() * 4);
        const targetCardIndex = spinCount - 5; // победитель на 5 карточек раньше конца для реалистичного докатывания

        const drumSequence = [];
        for (let i = 0; i < spinCount; i++) {
            if (i === targetCardIndex) {
                drumSequence.push(selectedMovie);
            } else {
                const randomPick = wheelMovies[Math.floor(Math.random() * count)];
                drumSequence.push(randomPick);
            }
        }

        drumTrack.innerHTML = drumSequence.map((m, idx) => {
            const color = palette[idx % palette.length];
            const isWinner = idx === targetCardIndex;
            const originalIdx = wheelMovies.findIndex(x => x.id === m.id);
            const num = originalIdx >= 0 ? originalIdx + 1 : (idx % count) + 1;
            return `
                <div class="drum-card ${isWinner ? 'drum-card-target' : ''}" data-id="${m.id}" style="--card-accent: ${color};">
                    <span class="drum-card-num" style="background:${color}">#${num}</span>
                    <strong class="drum-card-title">${escapeHtml(m.title)}</strong>
                    <span class="drum-card-genre">${escapeHtml(m.genre || "Без жанра")}</span>
                </div>
            `;
        }).join("");

        const cardCenter = targetCardIndex * pitch + (cardWidth / 2);
        const drumJitter = (Math.random() - 0.5) * 20;
        const targetX = cardCenter + drumJitter;

        drumTargetTranslateX = (windowW / 2) - targetX;
        drumTrack.style.transform = `translate3d(${initialOffset}px, 0, 0)`;
    }

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Плавное замедление (ease-out quartic)
        const eased = 1 - Math.pow(1 - progress, 4);
        currentRotation = startAngle + (targetRotation - startAngle) * eased;

        drawWheel();

        if (drumTrack) {
            const drumCurrentX = drumStartTranslateX + (drumTargetTranslateX - drumStartTranslateX) * eased;
            drumTrack.style.transform = `translate3d(${drumCurrentX}px, 0, 0)`;
            currentDrumTranslateX = drumCurrentX;
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            currentRotation = targetRotation;
            drawWheel();

            if (drumTrack) {
                drumTrack.style.transform = `translate3d(${drumTargetTranslateX}px, 0, 0)`;
                currentDrumTranslateX = drumTargetTranslateX;
                const winnerCard = drumTrack.querySelector(".drum-card-target");
                if (winnerCard) winnerCard.classList.add("winner-highlight");
            }

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
        renderDrum();
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
        renderDrum();
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
    renderDrum();

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
