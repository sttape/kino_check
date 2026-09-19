// config.js
// Инициализация Supabase-клиента

const SUPABASE_URL = "https://ribxwepxmiywgyrkzjlp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_z0SBAp1Urwwvo4s263EmyQ_geW6qy23";

// var вместо const — не бросает ошибку при повторной загрузке скрипта
if (typeof supabase === "undefined" || !supabase || typeof supabase.from !== "function") {
    var supabase = (window.supabase && window.supabase.createClient)
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        : null;
}

// Загрузка всех фильмов
async function loadMovies() {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from("movies")
        .select("*")
        .order("id", { ascending: true });

    if (error) {
        console.error("Ошибка загрузки фильмов:", error.message);
        return [];
    }

    return data || [];
}

// Добавление фильма
async function insertMovie(movie) {
    if (!supabase) return false;
    const { error } = await supabase
        .from("movies")
        .insert({
            title: movie.title,
            genre: movie.genre,
            comment: movie.comment,
            status: movie.status,
            ratings: movie.ratings ?? null
        });

    if (error) {
        console.error("Ошибка добавления фильма:", error.message);
        alert("Ошибка добавления фильма: " + error.message);
        return false;
    }
    return true;
}

// Обновление фильма
async function updateMovie(movie) {
    if (!supabase) return false;
    const { error } = await supabase
        .from("movies")
        .update({
            title: movie.title,
            genre: movie.genre,
            comment: movie.comment,
            status: movie.status,
            ratings: movie.ratings ?? null
        })
        .eq("id", movie.id);

    if (error) {
        console.error("Ошибка обновления фильма:", error.message);
        alert("Ошибка обновления фильма: " + error.message);
        return false;
    }
    return true;
}

// Удаление фильма
async function deleteMovie(id) {
    if (!supabase) return false;
    const { error } = await supabase
        .from("movies")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Ошибка удаления фильма:", error.message);
        alert("Ошибка удаления фильма: " + error.message);
        return false;
    }
    return true;
}

