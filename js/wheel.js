let wheelMovies = [];
let selectedMovie = null;
let rotationAngle = 0;
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
const wheelCtx = wheelCanvas ? wheelCanvas.getContext("2d") : null;

const palette = ["#f97316", "#38bdf8", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];

function getWheelMovies() {
    const movies = loadMovies();
    return movies.filter(movie => movie.status === "Не просмотрено");
}

function renderWheelMovieList() {
    if (!wheelList || !wheelCount) {
        return;
    }

    wheelCount.textContent = `${wheelMovies.length} фильмов`;

    if (wheelMovies.length === 0) {
        wheelList.innerHTML = `<div class="empty-state visible">Список фильмов для колеса пуст.</div>`;
        return;
    }

    wheelList.innerHTML = wheelMovies.map((movie, index) => `
        <div class="wheel-movie-item">
            <span class="wheel-index">${index + 1}</span>
            <div>
                <strong>${movie.title}</strong>
                <div class="muted">${movie.genre || "Без жанра"}</div>
            </div>
        </div>
    `).join("");
}

function syncDurationInput() {
    spinDurationSeconds = loadWheelDuration();

    if (wheelDurationInput) {
        wheelDurationInput.value = String(spinDurationSeconds);
    }

    if (wheelDurationValue) {
        wheelDurationValue.textContent = `${spinDurationSeconds} сек`;
    }
}

function resizeWheelCanvas() {
    if (!wheelCanvas || !wheelCtx) {
        return;
    }

    const stage = wheelCanvas.parentElement;
    if (!stage) {
        return;
    }

    const size = Math.floor(Math.min(stage.clientWidth, stage.clientHeight || stage.clientWidth));
    const nextSize = Math.max(520, size);

    if (wheelCanvas.width !== nextSize || wheelCanvas.height !== nextSize) {
        wheelCanvas.width = nextSize;
        wheelCanvas.height = nextSize;
    }
}

function drawWheel() {
    if (!wheelCtx || !wheelCanvas) {
        return;
    }

    resizeWheelCanvas();

    const size = wheelCanvas.width;
    const center = size / 2;
    const radius = center - 18;
    wheelCtx.clearRect(0, 0, size, size);

    if (wheelMovies.length === 0) {
        wheelCtx.beginPath();
        wheelCtx.arc(center, center, radius, 0, Math.PI * 2);
        wheelCtx.fillStyle = "#111827";
        wheelCtx.fill();
        wheelCtx.lineWidth = 6;
        wheelCtx.strokeStyle = "rgba(255,255,255,0.08)";
        wheelCtx.stroke();
        wheelCtx.fillStyle = "#cbd5e1";
        wheelCtx.font = "600 28px Inter, sans-serif";
        wheelCtx.textAlign = "center";
        wheelCtx.fillText("Добавьте фильмы", center, center - 8);
        wheelCtx.fillText("для вращения", center, center + 28);
        return;
    }

    const segmentAngle = (Math.PI * 2) / wheelMovies.length;

    wheelMovies.forEach((movie, index) => {
        const startAngle = rotationAngle + index * segmentAngle - Math.PI / 2;
        const endAngle = startAngle + segmentAngle;

        wheelCtx.beginPath();
        wheelCtx.moveTo(center, center);
        wheelCtx.arc(center, center, radius, startAngle, endAngle);
        wheelCtx.closePath();
        wheelCtx.fillStyle = palette[index % palette.length];
        wheelCtx.fill();

        wheelCtx.strokeStyle = "rgba(255,255,255,0.92)";
        wheelCtx.lineWidth = 4;
        wheelCtx.stroke();

        wheelCtx.save();
        wheelCtx.translate(center, center);
        wheelCtx.rotate(startAngle + segmentAngle / 2);
        wheelCtx.fillStyle = "#ffffff";
        wheelCtx.font = "700 26px Inter, sans-serif";
        wheelCtx.textAlign = "right";
        wheelCtx.textBaseline = "middle";
        const label = movie.title.length > 18 ? movie.title.slice(0, 18) + "…" : movie.title;
        wheelCtx.fillText(label, radius - 28, 0);
        wheelCtx.restore();
    });

    wheelCtx.beginPath();
    wheelCtx.arc(center, center, 72, 0, Math.PI * 2);
    wheelCtx.fillStyle = "#0f172a";
    wheelCtx.fill();
    wheelCtx.lineWidth = 8;
    wheelCtx.strokeStyle = "rgba(255,255,255,0.12)";
    wheelCtx.stroke();

    wheelCtx.fillStyle = "#f8fafc";
    wheelCtx.font = "800 24px Inter, sans-serif";
    wheelCtx.textAlign = "center";
    wheelCtx.fillText("FILM", center, center + 1);
}

function syncWheelState() {
    wheelMovies = getWheelMovies();
    selectedMovie = null;
    syncDurationInput();

    if (wheelResult) {
        wheelResult.textContent = wheelMovies.length
            ? `В колесе ${wheelMovies.length} фильмов. После каждого прокрута фильм выбывает.`
            : "Список для колеса пока пуст.";
    }

    if (wheelHint) {
        wheelHint.textContent = wheelMovies.length
            ? "Крутите колесо. Выбранный фильм будет выбывать из списка колеса."
            : "Сначала добавьте несколько фильмов со статусом «Не просмотрено».";
    }

    if (startWatchBtn) {
        startWatchBtn.classList.add("hidden");
    }

    renderWheelMovieList();
    drawWheel();
}

function finishSpin(finalRotation) {
    rotationAngle = finalRotation % (Math.PI * 2);
    const segmentAngle = (Math.PI * 2) / wheelMovies.length;
    const pointerAngle = (Math.PI * 1.5 - rotationAngle + Math.PI * 2) % (Math.PI * 2);
    const selectedIndex = Math.floor(pointerAngle / segmentAngle) % wheelMovies.length;
    selectedMovie = wheelMovies[selectedIndex];
    const eliminatedMovie = wheelMovies.splice(selectedIndex, 1)[0];
    spinning = false;

    if (wheelResult) {
        wheelResult.innerHTML = `<strong>Выбывает:</strong> ${eliminatedMovie.title}<br><span class="muted">${eliminatedMovie.genre || "Без жанра"}</span>`;
    }

    saveLastMovieId(eliminatedMovie.id);
    const movies = loadMovies();
    const movie = movies.find(item => item.id === eliminatedMovie.id);
    if (movie) {
        movie.status = "Просмотрено";
        saveMovies(movies);
    }

    if (startWatchBtn) {
        startWatchBtn.classList.remove("hidden");
    }

    wheelMovies = getWheelMovies();
    renderWheelMovieList();
    drawWheel();
}

function spinWheel() {
    if (spinning) {
        return;
    }

    wheelMovies = getWheelMovies();

    if (wheelMovies.length === 0) {
        alert("Нет фильмов для рулетки");
        return;
    }

    if (wheelMovies.length === 1) {
        selectedMovie = wheelMovies[0];
        saveLastMovieId(selectedMovie.id);
        if (wheelResult) {
            wheelResult.innerHTML = `<strong>Последний фильм:</strong> ${selectedMovie.title}`;
        }
        if (startWatchBtn) {
            startWatchBtn.classList.remove("hidden");
        }
        drawWheel();
        return;
    }

    spinning = true;
    if (startWatchBtn) {
        startWatchBtn.classList.add("hidden");
    }

    const extraTurns = 4 + Math.random() * 3;
    const segmentAngle = (Math.PI * 2) / wheelMovies.length;
    const chosenIndex = Math.floor(Math.random() * wheelMovies.length);
    const pointerTarget = Math.PI * 1.5 - (chosenIndex * segmentAngle + segmentAngle / 2);
    const targetRotation = extraTurns * Math.PI * 2 + pointerTarget;
    const startRotation = rotationAngle;
    const animationDuration = Math.max(1800, spinDurationSeconds * 1000);
    const startTime = performance.now();

    function animateFrame(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentRotation = startRotation + (targetRotation - startRotation) * eased;

        rotationAngle = currentRotation;
        drawWheel();

        if (progress < 1) {
            requestAnimationFrame(animateFrame);
            return;
        }

        finishSpin(targetRotation);
    }

    requestAnimationFrame(animateFrame);
}

if (wheelDurationInput) {
    wheelDurationInput.addEventListener("input", () => {
        spinDurationSeconds = Number(wheelDurationInput.value);
        saveWheelDuration(spinDurationSeconds);
        if (wheelDurationValue) {
            wheelDurationValue.textContent = `${spinDurationSeconds} сек`;
        }
    });
}

if (spinBtn) {
    spinBtn.addEventListener("click", spinWheel);
}

if (startWatchBtn) {
    startWatchBtn.addEventListener("click", () => {
        if (!selectedMovie) {
            alert("Сначала выберите фильм в рулетке");
            return;
        }

        window.location.href = "rating.html";
    });
}
        window.addEventListener("pageshow", () => {
            syncWheelState();
        });

        window.addEventListener("focus", () => {
            syncWheelState();
        });

        window.addEventListener("storage", event => {
            if (!event.key || event.key === STORAGE_KEY || event.key === LAST_MOVIE_KEY || event.key === WHEEL_DURATION_KEY) {
                syncWheelState();
            }
        });

if (document.body.dataset.page === "wheel") {
    syncWheelState();
    window.addEventListener("resize", () => {
        drawWheel();
    });
}
