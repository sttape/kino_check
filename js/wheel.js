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

const wheelSoundToggleBtn = document.getElementById("wheelSoundToggleBtn");
const wheelSoundIcon = document.getElementById("wheelSoundIcon");
const wheelSoundText = document.getElementById("wheelSoundText");

const wheelWinnerOverlay = document.getElementById("wheelWinnerOverlay");
const winnerOverlayBackdrop = document.getElementById("winnerOverlayBackdrop");
const winnerOverlayCard = document.getElementById("winnerOverlayCard");
const winnerOverlayContent = document.getElementById("winnerOverlayContent");
const closeWinnerOverlayBtn = document.getElementById("closeWinnerOverlayBtn");

function closeWinnerOverlay() {
    if (wheelWinnerOverlay) {
        wheelWinnerOverlay.classList.add("hidden");
    }
}

if (closeWinnerOverlayBtn) {
    closeWinnerOverlayBtn.addEventListener("click", closeWinnerOverlay);
}

if (winnerOverlayBackdrop) {
    winnerOverlayBackdrop.addEventListener("click", closeWinnerOverlay);
}

let isWheelSoundEnabled = true;

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
        if (!spinning) {
            invalidateWheelBuffer();
            drawWheel();
            if (drumTrack && drumWindow && wheelMovies.length) {
                const cardWidth = window.innerWidth <= 480 ? 140 : 150;
                const windowW = drumWindow.clientWidth || 280;
                const initialOffset = (windowW / 2) - (cardWidth / 2);
                currentDrumTranslateX = initialOffset;
                drumTrack.style.transform = `translate3d(${initialOffset}px, 0, 0)`;
            }
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

        initWheelSound();
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
    closeWinnerOverlay();

    updateHint();
    renderWheelList();
    invalidateWheelBuffer();
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

// ---------------------- ОФФСКРИН БУФЕР И ОТРИСОВКА КОЛЕСА ----------------------

let wheelBufferCanvas = null;
let wheelBufferCtx = null;
let isWheelBufferValid = false;

function invalidateWheelBuffer() {
    isWheelBufferValid = false;
}

function updateWheelBuffer() {
    if (!wheelCanvas) return;
    const size = wheelCanvas.width || 1200;

    if (!wheelBufferCanvas) {
        wheelBufferCanvas = document.createElement("canvas");
    }
    if (wheelBufferCanvas.width !== size || wheelBufferCanvas.height !== size) {
        wheelBufferCanvas.width = size;
        wheelBufferCanvas.height = size;
    }

    wheelBufferCtx = wheelBufferCanvas.getContext("2d");
    if (!wheelBufferCtx) return;

    wheelBufferCtx.clearRect(0, 0, size, size);

    const count = wheelMovies.length;
    if (!count) {
        isWheelBufferValid = true;
        return;
    }

    const center = size / 2;
    const radius = center - 8;
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
        const startAngle = i * angleStep;
        const endAngle = startAngle + angleStep;

        // Сектор
        wheelBufferCtx.beginPath();
        wheelBufferCtx.moveTo(center, center);
        wheelBufferCtx.arc(center, center, radius, startAngle, endAngle);
        wheelBufferCtx.closePath();
        wheelBufferCtx.fillStyle = palette[i % palette.length];
        wheelBufferCtx.fill();

        // Граница сектора
        wheelBufferCtx.strokeStyle = "rgba(2, 6, 23, 0.55)";
        wheelBufferCtx.lineWidth = count > 40 ? 2 : 3;
        wheelBufferCtx.stroke();

        // Текст на секторе
        wheelBufferCtx.save();
        wheelBufferCtx.translate(center, center);
        wheelBufferCtx.rotate(startAngle + angleStep / 2);
        wheelBufferCtx.textAlign = "right";
        wheelBufferCtx.textBaseline = "middle";
        wheelBufferCtx.font = `800 ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

        let title = wheelMovies[i].title;
        if (title.length > maxChars) {
            title = title.slice(0, maxChars - 1) + "…";
        }

        // Тёмная обводка для максимальной контрастности и читаемости
        wheelBufferCtx.lineWidth = isSmallScreen ? 6 : 4;
        wheelBufferCtx.strokeStyle = "rgba(0, 0, 0, 0.85)";
        wheelBufferCtx.strokeText(title, radius - 24, 0);

        wheelBufferCtx.fillStyle = "#ffffff";
        wheelBufferCtx.fillText(title, radius - 24, 0);
        wheelBufferCtx.restore();

        // Декоративные металлические шпильки по внешнему ободу
        const pinAngle = startAngle;
        const pinX = center + (radius - 12) * Math.cos(pinAngle);
        const pinY = center + (radius - 12) * Math.sin(pinAngle);
        wheelBufferCtx.beginPath();
        wheelBufferCtx.arc(pinX, pinY, count > 40 ? 2.5 : 4, 0, Math.PI * 2);
        wheelBufferCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
        wheelBufferCtx.fill();
        wheelBufferCtx.lineWidth = 1;
        wheelBufferCtx.strokeStyle = "rgba(0, 0, 0, 0.6)";
        wheelBufferCtx.stroke();
    }

    isWheelBufferValid = true;
}

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

    if (!isWheelBufferValid || !wheelBufferCanvas) {
        updateWheelBuffer();
    }

    // Мгновенная отрисовка буфера с поворотом (GPU texture blit)
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(currentRotation);
    ctx.drawImage(wheelBufferCanvas, -center, -center);
    ctx.restore();

    // Внешний обод
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
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

// ---------------------- АУДИО ЭФФЕКТЫ (Web Audio API) ----------------------

let audioCtx = null;
let lastTickSoundTime = 0;

function initWheelSound() {
    isWheelSoundEnabled = typeof loadWheelSound === "function" ? loadWheelSound() : true;
    updateSoundUI();

    if (wheelSoundToggleBtn) {
        wheelSoundToggleBtn.addEventListener("click", toggleWheelSound);
    }
}

function toggleWheelSound() {
    isWheelSoundEnabled = !isWheelSoundEnabled;
    if (typeof saveWheelSound === "function") {
        saveWheelSound(isWheelSoundEnabled);
    }
    updateSoundUI();
    if (isWheelSoundEnabled) {
        playTickSound();
    }
}

function updateSoundUI() {
    if (wheelSoundIcon) {
        wheelSoundIcon.textContent = isWheelSoundEnabled ? "🔊" : "🔇";
    }
    if (wheelSoundText) {
        wheelSoundText.textContent = isWheelSoundEnabled ? "Звук вкл" : "Без звука";
    }
    if (wheelSoundToggleBtn) {
        if (isWheelSoundEnabled) {
            wheelSoundToggleBtn.classList.remove("is-muted");
            wheelSoundToggleBtn.title = "Выключить звук";
        } else {
            wheelSoundToggleBtn.classList.add("is-muted");
            wheelSoundToggleBtn.title = "Включить звук";
        }
    }
}

function getAudioContext() {
    if (!audioCtx) {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (AudioClass) {
            audioCtx = new AudioClass();
        }
    }
    if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

function playTickSound() {
    if (!isWheelSoundEnabled) return;
    try {
        const now = performance.now();
        if (now - lastTickSoundTime < 32) return;
        lastTickSoundTime = now;

        const aCtx = getAudioContext();
        if (!aCtx) return;

        const osc = aCtx.createOscillator();
        const gain = aCtx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(520, aCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, aCtx.currentTime + 0.025);

        gain.gain.setValueAtTime(0.06, aCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, aCtx.currentTime + 0.025);

        osc.connect(gain);
        gain.connect(aCtx.destination);

        osc.start(aCtx.currentTime);
        osc.stop(aCtx.currentTime + 0.025);
    } catch (e) {}
}

function playWinSound() {
    if (!isWheelSoundEnabled) return;
    try {
        const aCtx = getAudioContext();
        if (!aCtx) return;

        const now = aCtx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = aCtx.createOscillator();
            const gain = aCtx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            gain.gain.setValueAtTime(0, now + idx * 0.08);
            gain.gain.linearRampToValueAtTime(0.1, now + idx * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

            osc.connect(gain);
            gain.connect(aCtx.destination);

            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.4);
        });
    } catch (e) {}
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
    closeWinnerOverlay();
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
    const turns = 5 + Math.floor(Math.random() * 3); // 5-7 полных оборотов
    const currentNorm = ((currentRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let neededNorm = (1.5 * Math.PI - targetSliceAngle) % (2 * Math.PI);
    if (neededNorm < 0) neededNorm += 2 * Math.PI;

    let delta = neededNorm - currentNorm;
    if (delta <= 0) delta += 2 * Math.PI;

    const startAngle = currentRotation;
    const targetRotation = currentRotation + turns * 2 * Math.PI + delta;

    const duration = Math.max(1000, (loadWheelDuration ? loadWheelDuration() : 5) * 1000);
    const startTime = performance.now();

    const pointerEl = document.querySelector(".wheel-pointer");
    let lastTickSector = -1;

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

        // Шелковисто-плавная кривая замедления с реалистичной физикой инерции
        const eased = 1 - Math.pow(1 - progress, 4.6);
        currentRotation = startAngle + (targetRotation - startAngle) * eased;

        drawWheel();

        // Реалистичная микро-анимация отклонения стрелочки
        if (pointerEl && count > 0) {
            const pointerAngleInWheel = ((1.5 * Math.PI - (currentRotation % (2 * Math.PI))) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const currentSector = Math.floor(pointerAngleInWheel / angleStep);
            const sectorFrac = (pointerAngleInWheel % angleStep) / angleStep;

            if (currentSector !== lastTickSector) {
                lastTickSector = currentSector;
                playTickSound();
            }

            let needleTilt = 0;
            if (sectorFrac < 0.22) {
                needleTilt = Math.sin((sectorFrac / 0.22) * Math.PI) * -12;
            }
            const speedMultiplier = Math.min(1, (1 - progress) * 2.2);
            pointerEl.style.transform = `translateX(-50%) rotate(${needleTilt * speedMultiplier}deg)`;
        }

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

            if (pointerEl) {
                pointerEl.style.transform = "translateX(-50%) rotate(0deg)";
            }

            if (drumTrack) {
                drumTrack.style.transform = `translate3d(${drumTargetTranslateX}px, 0, 0)`;
                currentDrumTranslateX = drumTargetTranslateX;
                const winnerCard = drumTrack.querySelector(".drum-card-target");
                if (winnerCard) winnerCard.classList.add("winner-highlight");
            }

            playWinSound();
            finishSpin(selectedMovie);
        }
    }

    requestAnimationFrame(animate);
}

function finishSpin(winner) {
    spinning = false;
    if (spinBtn) spinBtn.disabled = false;

    const isElimination = eliminationMode;

    saveLastMovieId(winner.id);

    // Всплывающее окно поверх колеса
    if (wheelWinnerOverlay && winnerOverlayContent) {
        if (isElimination) {
            if (winnerOverlayCard) {
                winnerOverlayCard.className = "winner-overlay-card is-elimination";
            }
            const remainingCount = wheelMovies.length - 1;
            winnerOverlayContent.innerHTML = `
                <p class="winner-overlay-eyebrow elim">❌ Выбыл из колеса</p>
                <h3 class="winner-overlay-title">${escapeHtml(winner.title)}</h3>
                <p class="winner-overlay-genre">${escapeHtml(winner.genre || "Без жанра")}</p>
                <span class="winner-overlay-remaining">Осталось в колесе: ${remainingCount}</span>
                <div class="winner-overlay-actions">
                    <button type="button" class="primary-button" id="overlayNextElimBtn">${remainingCount <= 1 ? 'Показать победителя' : 'Продолжить выбывание'}</button>
                </div>
            `;
            const nextElimBtn = document.getElementById("overlayNextElimBtn");
            if (nextElimBtn) {
                nextElimBtn.addEventListener("click", () => {
                    closeWinnerOverlay();
                });
            }
        } else {
            if (winnerOverlayCard) {
                winnerOverlayCard.className = "winner-overlay-card";
            }
            winnerOverlayContent.innerHTML = `
                <p class="winner-overlay-eyebrow win">🏆 Выбран фильм</p>
                <h3 class="winner-overlay-title">${escapeHtml(winner.title)}</h3>
                <p class="winner-overlay-genre">${escapeHtml(winner.genre || "Без жанра")}</p>
                <div class="winner-overlay-actions">
                    <a class="primary-link" href="rating.html?id=${winner.id}">🍿 Начать просмотр</a>
                    <button type="button" class="secondary-button" id="overlaySpinAgainBtn">Крутить снова</button>
                </div>
            `;
            const spinAgainBtn = document.getElementById("overlaySpinAgainBtn");
            if (spinAgainBtn) {
                spinAgainBtn.addEventListener("click", () => {
                    closeWinnerOverlay();
                    if (!spinning && wheelMovies.length) {
                        spinWheel();
                    }
                });
            }
        }
        wheelWinnerOverlay.classList.remove("hidden");
    }

    if (isElimination) {
        eliminateMovie(winner.id);
    }
}

// ---------------------- РЕЖИМЫ ----------------------

if (modeNormalBtn) {
    modeNormalBtn.addEventListener("click", () => {
        if (spinning) return;
        closeWinnerOverlay();
        eliminationMode = false;
        modeNormalBtn.classList.add("active");
        if (modeEliminationBtn) modeEliminationBtn.classList.remove("active");
        if (resetWheelBtn) resetWheelBtn.classList.add("hidden");
        updateHint();
        renderDrum();
    });
}

if (modeEliminationBtn) {
    modeEliminationBtn.addEventListener("click", () => {
        if (spinning) return;
        closeWinnerOverlay();
        eliminationMode = true;
        modeEliminationBtn.classList.add("active");
        if (modeNormalBtn) modeNormalBtn.classList.remove("active");
        if (resetWheelBtn) resetWheelBtn.classList.add("hidden");
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
    invalidateWheelBuffer();
    drawWheel();
    renderDrum();

    if (resetWheelBtn) resetWheelBtn.classList.remove("hidden");

    if (wheelMovies.length === 1) {
        const finalWinner = wheelMovies[0];
        saveLastMovieId(finalWinner.id);

        // Финальный победитель в режиме на выбывание прямо поверх колеса
        if (wheelWinnerOverlay && winnerOverlayContent) {
            if (winnerOverlayCard) {
                winnerOverlayCard.className = "winner-overlay-card is-final-winner";
            }
            winnerOverlayContent.innerHTML = `
                <p class="winner-overlay-eyebrow final">👑 Абсолютный победитель</p>
                <h3 class="winner-overlay-title">${escapeHtml(finalWinner.title)}</h3>
                <p class="winner-overlay-genre">${escapeHtml(finalWinner.genre || "Без жанра")}</p>
                <div class="winner-overlay-actions">
                    <a class="primary-link" href="rating.html?id=${finalWinner.id}">🍿 Начать просмотр</a>
                    <button type="button" class="secondary-button" id="overlayResetBtn">Сбросить колесо</button>
                </div>
            `;
            const resetBtn = document.getElementById("overlayResetBtn");
            if (resetBtn) {
                resetBtn.addEventListener("click", () => {
                    closeWinnerOverlay();
                    applyFilterAndRender();
                });
            }
            wheelWinnerOverlay.classList.remove("hidden");
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
