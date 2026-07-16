let wheelMovies = [];
let selectedMovie = null;
let rotationOffset = 0;
let spinning = false;
let spinDurationSeconds = 5;

const wheelCanvas = document.getElementById("wheelCanvas");
const wheelResult = document.getElementById("wheelResult");
const startWatchBtn = document.getElementById("startWatchBtn");
const spinBtn = document.getElementById("spinBtn");
const wheelHint = document.getElementById("wheelHint");
const wheelList = document.getElementById("wheelMovieList");
const wheelCount = document.getElementById("wheelCount");
const wheelDurationInput = document.getElementById("wheelDurationInput");
const wheelDurationValue = document.getElementById("wheelDurationValue");
const modeEliminationBtn = document.getElementById("modeElimination");
const modeNormalBtn = document.getElementById("modeNormal");

const wheelCtx = wheelCanvas ? wheelCanvas.getContext("2d") : null;

const palette = ["#0ea5a4", "#38bdf8", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];
const SEGMENT_HEIGHT = 80;
const VISIBLE_SEGMENTS = 3;

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

function truncateText(text, maxChars = 28) {
    if (!text) return "";
    return text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
}

async function getWheelMovies() {
    const movies = await loadMovies();
    return movies.filter(movie => movie.status === "Не просмотрено");
}

function renderWheelMovieList() {
    if (!wheelList || !wheelCount) return;

    wheelCount.textContent = `${wheelMovies.length} фильмов`;

    if (wheelMovies.length === 0) {
        wheelList.innerHTML = `<div class="empty-state visible">Список фильмов для барабана пуст.</div>`;
        return;
    }

    wheelList.innerHTML = wheelMovies.map((movie, index) => `
        <div class="wheel-movie-item">
            <span class="wheel-index">${index + 1}</span>
            <div>
                <strong>${escapeHtml(truncateText(movie.title, 36))}</strong>
                <div class="muted">${escapeHtml(movie.genre || "Без жанра")}</div>
            </div>
        </div>
    `).join("");
}

function syncDurationInput() {
    spinDurationSeconds = loadWheelDuration();
    wheelDurationInput.value = String(spinDurationSeconds);
    wheelDurationValue.textContent = `${spinDurationSeconds} сек`;
}

function resizeWheelCanvas() {
    const stage = wheelCanvas.parentElement;
    const style = getComputedStyle(stage);
    const paddingLeft = parseFloat(style.paddingLeft || 0);
    const paddingRight = parseFloat(style.paddingRight || 0);
    const width = Math.floor(stage.clientWidth - paddingLeft - paddingRight);
    const height = SEGMENT_HEIGHT * VISIBLE_SEGMENTS;

    wheelCanvas.width = width;
    wheelCanvas.height = height;
}

function drawDrum() {
    resizeWheelCanvas();

    const width = wheelCanvas.width;
    const height = wheelCanvas.height;
    const totalHeight = Math.max(1, wheelMovies.length) * SEGMENT_HEIGHT;

    wheelCtx.clearRect(0, 0, width, height);

    wheelCtx.fillStyle = "#020617";
    wheelCtx.fillRect(0, 0, width, height);

    if (wheelMovies.length === 0) {
        wheelCtx.fillStyle = "#1e293b";
        wheelCtx.fillRect(0, height / 2 - SEGMENT_HEIGHT / 2, width, SEGMENT_HEIGHT);
        wheelCtx.fillStyle = "#cbd5e1";
        wheelCtx.font = "700 18px Inter, sans-serif";
        wheelCtx.textAlign = "center";
        wheelCtx.textBaseline = "middle";
        wheelCtx.fillText("Добавьте фильмы", width / 2, height / 2);
        return;
    }

    const centerY = height / 2;
    const offset = ((rotationOffset % totalHeight) + totalHeight) % totalHeight;

    for (let i = 0; i < wheelMovies.length; i++) {
        const movie = wheelMovies[i];
        const baseY = centerY - SEGMENT_HEIGHT / 2 + i * SEGMENT_HEIGHT;
        let y = baseY - offset;

        while (y < -SEGMENT_HEIGHT) y += totalHeight;
        while (y > height) y -= totalHeight;

        wheelCtx.fillStyle = palette[i % palette.length];
        wheelCtx.fillRect(0, y, width, SEGMENT_HEIGHT - 4);

        wheelCtx.fillStyle = "#071026";
        wheelCtx.font = "700 18px Inter, sans-serif";
        wheelCtx.textAlign = "center";
        wheelCtx.textBaseline = "middle";
        wheelCtx.fillText(truncateText(movie.title, 36), width / 2, y + SEGMENT_HEIGHT / 2);
    }

    wheelCtx.strokeStyle = "rgba(248,250,252,0.6)";
    wheelCtx.lineWidth = 3;
    wheelCtx.strokeRect(0, centerY - SEGMENT_HEIGHT / 2, width, SEGMENT_HEIGHT);

    wheelCtx.fillStyle = "#f97316";
    wheelCtx.beginPath();
    const arrowX = 10;
    const arrowY = centerY;
    wheelCtx.moveTo(arrowX + 20, arrowY);
    wheelCtx.lineTo(arrowX, arrowY - 15);
    wheelCtx.lineTo(arrowX, arrowY + 15);
    wheelCtx.closePath();
    wheelCtx.fill();
}

function computeSelectedIndexFromOffset(finalOffset) {
    const totalHeight = Math.max(1, wheelMovies.length) * SEGMENT_HEIGHT;
    const normalized = ((finalOffset % totalHeight) + totalHeight) % totalHeight;
    const centerIndex = Math.floor((normalized + SEGMENT_HEIGHT / 2) / SEGMENT_HEIGHT) % wheelMovies.length;
    return (centerIndex + wheelMovies.length) % wheelMovies.length;
}

async function finishDrumSpin(finalOffset) {
    const selectedIndex = computeSelectedIndexFromOffset(finalOffset);
    const selected = wheelMovies[selectedIndex];
    const eliminationMode = modeEliminationBtn?.classList.contains("active");

    if (eliminationMode) {
        const eliminated = wheelMovies.splice(selectedIndex, 1)[0];
        rotationOffset = rotationOffset % (wheelMovies.length * SEGMENT_HEIGHT);

        if (wheelMovies.length === 0) {
            wheelResult.innerHTML = `<strong>Все фильмы выбыли.</strong>`;
            drawDrum();
            return;
        }

        wheelResult.innerHTML =
            `<strong>Выбывает:</strong> ${escapeHtml(eliminated.title)}<br>
             <span class="muted">${escapeHtml(eliminated.genre || "Без жанра")}</span>`;

        if (wheelMovies.length === 1) {
            wheelResult.innerHTML =
                `<strong>Последний фильм:</strong> ${escapeHtml(wheelMovies[0].title)}`;
            startWatchBtn.classList.remove("hidden");
        }
    } else {
        wheelResult.innerHTML =
            `<strong>Выбран фильм:</strong> ${escapeHtml(selected.title)}<br>
             <span class="muted">${escapeHtml(selected.genre || "Без жанра")}</span>`;
        saveLastMovieId(selected.id);
        startWatchBtn.classList.remove("hidden");
    }

    renderWheelMovieList();
    drawDrum();
}

function spinDrum() {
    if (spinning) return;
    if (wheelMovies.length === 0) {
        alert("Нет фильмов для барабана");
        return;
    }

    spinning = true;
    startWatchBtn.classList.add("hidden");

    const totalHeight = wheelMovies.length * SEGMENT_HEIGHT;
    const extraTurns = 3 + Math.random() * 2;
    const randomOffset = Math.floor(Math.random() * totalHeight);
    const targetOffset = rotationOffset + totalHeight * extraTurns + randomOffset;
    const startOffset = rotationOffset;
    const duration = Math.max(600, spinDurationSeconds * 1000);
    const startTime = performance.now();

    function animateFrame(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        rotationOffset = startOffset + (targetOffset - startOffset) * eased;
        drawDrum();

        if (progress < 1) {
            requestAnimationFrame(animateFrame);
        } else {
            spinning = false;
            finishDrumSpin(rotationOffset);
        }
    }

    requestAnimationFrame(animateFrame);
}

function setModeButtons() {
    modeEliminationBtn.addEventListener("click", () => {
        modeEliminationBtn.classList.add("active");
        modeNormalBtn.classList.remove("active");
    });

    modeNormalBtn.addEventListener("click", () => {
        modeNormalBtn.classList.add("active");
        modeEliminationBtn.classList.remove("active");
    });
}

async function syncWheelState() {
    wheelMovies = await getWheelMovies();
    selectedMovie = null;
    syncDurationInput();
    startWatchBtn.classList.add("hidden");

    wheelResult.textContent = wheelMovies.length
        ? `В барабане ${wheelMovies.length} фильмов`
        : "Список для барабана пуст.";

    renderWheelMovieList();
    drawDrum();
}

wheelDurationInput.addEventListener("input", () => {
    spinDurationSeconds = Number(wheelDurationInput.value);
    saveWheelDuration(spinDurationSeconds);
    wheelDurationValue.textContent = `${spinDurationSeconds} сек`;
});

spinBtn.addEventListener("click", spinDrum);

startWatchBtn.addEventListener("click", () => {
    const last = loadLastMovieId();
    if (!last) {
        alert("Сначала выберите фильм");
        return;
    }
    window.location.href = "rating.html";
});

window.addEventListener("pageshow", syncWheelState);
window.addEventListener("focus", syncWheelState);

window.addEventListener("storage", event => {
    if (!event.key || event.key === STORAGE_KEY) {
        syncWheelState();
    }
});

if (document.body.dataset.page === "wheel") {
    setModeButtons();
    syncWheelState();

    window.addEventListener("resize", drawDrum);

    // автообновление каждые 10 секунд
    setInterval(() => {
        if (!spinning) syncWheelState();
    }, 10000);
}
