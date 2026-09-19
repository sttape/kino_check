-- ==============================================================================
-- НАСТРОЙКА БЕЗОПАСНОСТИ БАЗЫ ДАННЫХ SUPABASE (таблица movies)
-- Выполните этот скрипт в панели управления Supabase -> SQL Editor -> Run
-- ==============================================================================

-- 1. Добавление проверок целостности данных (CHECK constraints) на уровне таблицы
-- Это защищает от слишком длинных строк (DoS/переполнение памяти), некорректных рейтингов
-- и пустых названий независимо от клиента.

DO $$
BEGIN
    -- Проверка длины и непустого названия
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_movie_title_valid') THEN
        ALTER TABLE public.movies
            ADD CONSTRAINT check_movie_title_valid 
            CHECK (title IS NOT NULL AND length(trim(title)) > 0 AND length(title) <= 250);
    END IF;

    -- Проверка длины жанра
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_movie_genre_len') THEN
        ALTER TABLE public.movies
            ADD CONSTRAINT check_movie_genre_len 
            CHECK (genre IS NULL OR length(genre) <= 250);
    END IF;

    -- Проверка длины комментария
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_movie_comment_len') THEN
        ALTER TABLE public.movies
            ADD CONSTRAINT check_movie_comment_len 
            CHECK (comment IS NULL OR length(comment) <= 2000);
    END IF;

    -- Проверка допустимого диапазона оценок (-1 .. 11)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_movie_ratings_range') THEN
        ALTER TABLE public.movies
            ADD CONSTRAINT check_movie_ratings_range 
            CHECK (ratings IS NULL OR (ratings >= -1 AND ratings <= 11));
    END IF;

    -- Проверка допустимых статусов
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_movie_status_valid') THEN
        ALTER TABLE public.movies
            ADD CONSTRAINT check_movie_status_valid 
            CHECK (status IS NULL OR status IN (
                'Просмотрено', 'Не просмотрено', 'Запланировано', 
                'Скоро выйдет', 'Не вышел', 'НЕ ОХОТА'
            ));
    END IF;
END $$;


-- 2. Включение механизма Row Level Security (RLS)
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;


-- 3. Настройка политик доступа (Policies)

-- Сброс старых версий политик, если они уже создавались
DROP POLICY IF EXISTS "Allow public read" ON public.movies;
DROP POLICY IF EXISTS "Allow public insert" ON public.movies;
DROP POLICY IF EXISTS "Allow public update" ON public.movies;
DROP POLICY IF EXISTS "Allow public delete" ON public.movies;

-- А) Чтение: разрешено всем (публичный просмотр каталога и колеса)
CREATE POLICY "Allow public read"
ON public.movies
FOR SELECT
TO anon, authenticated
USING (true);

-- Б) Добавление: разрешено с проверкой корректности полей
CREATE POLICY "Allow public insert"
ON public.movies
FOR INSERT
TO anon, authenticated
WITH CHECK (
    title IS NOT NULL 
    AND length(trim(title)) > 0 
    AND length(title) <= 250
    AND (genre IS NULL OR length(genre) <= 250)
    AND (comment IS NULL OR length(comment) <= 2000)
    AND (ratings IS NULL OR (ratings >= -1 AND ratings <= 11))
    AND (status IS NULL OR status IN (
        'Просмотрено', 'Не просмотрено', 'Запланировано', 
        'Скоро выйдет', 'Не вышел', 'НЕ ОХОТА'
    ))
);

-- В) Редактирование: обновление существующих фильмов
CREATE POLICY "Allow public update"
ON public.movies
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (
    title IS NOT NULL 
    AND length(trim(title)) > 0 
    AND length(title) <= 250
    AND (genre IS NULL OR length(genre) <= 250)
    AND (comment IS NULL OR length(comment) <= 2000)
    AND (ratings IS NULL OR (ratings >= -1 AND ratings <= 11))
    AND (status IS NULL OR status IN (
        'Просмотрено', 'Не просмотрено', 'Запланировано', 
        'Скоро выйдет', 'Не вышел', 'НЕ ОХОТА'
    ))
);

-- Г) Удаление: разрешено удаление записей
CREATE POLICY "Allow public delete"
ON public.movies
FOR DELETE
TO anon, authenticated
USING (true);

-- ==============================================================================
-- Инструкция:
-- 1. Откройте https://app.supabase.com
-- 2. Выберите ваш проект
-- 3. Перейдите в раздел "SQL Editor" слева
-- 4. Вставьте этот текст и нажмите кнопку "RUN"
-- ==============================================================================
