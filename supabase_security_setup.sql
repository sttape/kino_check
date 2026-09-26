-- ==============================================================================
-- НАСТРОЙКА БЕЗОПАСНОСТИ БАЗЫ ДАННЫХ SUPABASE (таблица movies + реестр комнат rooms)
-- Выполните этот скрипт в панели управления Supabase -> SQL Editor -> Run
-- ==============================================================================

-- 1. Добавление колонки list_id для персональных списков (комнат) и индексов
DO $$
BEGIN
    -- Добавление колонки list_id (по умолчанию 'default')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'movies' 
        AND column_name = 'list_id'
    ) THEN
        ALTER TABLE public.movies ADD COLUMN list_id text DEFAULT 'default';
    END IF;

    -- Обновляем старые записи, если list_id был NULL
    UPDATE public.movies SET list_id = 'default' WHERE list_id IS NULL;

    -- Создаем индекс для мгновенной фильтрации по комнатам
    CREATE INDEX IF NOT EXISTS idx_movies_list_id ON public.movies(list_id);

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

    -- Проверка длины идентификатора списка/комнаты
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_movie_list_id_len') THEN
        ALTER TABLE public.movies
            ADD CONSTRAINT check_movie_list_id_len 
            CHECK (list_id IS NULL OR length(list_id) <= 64);
    END IF;
END $$;


-- 2. Включение механизма Row Level Security (RLS) для movies
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;


-- 3. Настройка политик доступа (Policies) для movies

-- Сброс старых версий политик
DROP POLICY IF EXISTS "Allow public read" ON public.movies;
DROP POLICY IF EXISTS "Allow public insert" ON public.movies;
DROP POLICY IF EXISTS "Allow public update" ON public.movies;
DROP POLICY IF EXISTS "Allow public delete" ON public.movies;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.movies;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.movies;
DROP POLICY IF EXISTS "Allow authenticated delete" ON public.movies;

-- А) Чтение: разрешено ВСЕМ (гости и авторизованные пользователи могут просматривать каталог и крутить колесо)
CREATE POLICY "Allow public read"
ON public.movies
FOR SELECT
TO anon, authenticated
USING (true);

-- Б) Добавление: разрешено ТОЛЬКО авторизованным пользователям (Supabase Auth)
CREATE POLICY "Allow authenticated insert"
ON public.movies
FOR INSERT
TO authenticated
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
    AND (list_id IS NULL OR length(list_id) <= 64)
);

-- В) Редактирование: разрешено ТОЛЬКО авторизованным пользователям (Supabase Auth)
CREATE POLICY "Allow authenticated update"
ON public.movies
FOR UPDATE
TO authenticated
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
    AND (list_id IS NULL OR length(list_id) <= 64)
);

-- Г) Удаление: разрешено ТОЛЬКО авторизованным пользователям (Supabase Auth)
CREATE POLICY "Allow authenticated delete"
ON public.movies
FOR DELETE
TO authenticated
USING (true);


-- 4. ТАБЛИЦА РЕЕСТРА ВСЕХ КОМНАТ (public.rooms)
-- Хранит все комнаты, созданные пользователями, даже если в них пока нет фильмов.
CREATE TABLE IF NOT EXISTS public.rooms (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id text UNIQUE NOT NULL,
    title text,
    created_by text DEFAULT 'Гость',
    created_at timestamptz DEFAULT now()
);

-- Добавляем ограничение длины
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_rooms_room_id_len') THEN
        ALTER TABLE public.rooms
            ADD CONSTRAINT check_rooms_room_id_len 
            CHECK (length(trim(room_id)) > 0 AND length(room_id) <= 64);
    END IF;
END $$;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Политики для rooms: чтение и добавление доступно всем
DROP POLICY IF EXISTS "Allow public read rooms" ON public.rooms;
CREATE POLICY "Allow public read rooms"
ON public.rooms
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public insert rooms" ON public.rooms;
CREATE POLICY "Allow public insert rooms"
ON public.rooms
FOR INSERT
TO anon, authenticated
WITH CHECK (length(trim(room_id)) > 0 AND length(room_id) <= 64);

DROP POLICY IF EXISTS "Allow admin delete rooms" ON public.rooms;
CREATE POLICY "Allow admin delete rooms"
ON public.rooms
FOR DELETE
TO authenticated
USING (true);

-- Создаем базовую комнату по умолчанию
INSERT INTO public.rooms (room_id, title, created_by)
VALUES ('default', 'Общий список', 'Система')
ON CONFLICT (room_id) DO NOTHING;


-- 5. Таблица профилей для входа по ЛОГИНУ (user_profiles)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text UNIQUE NOT NULL,
    email text NOT NULL,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Безопасная функция проверки прав главного администратора (выполняется на сервере Supabase без циклических блокировок)
DROP FUNCTION IF EXISTS public.check_is_admin() CASCADE;
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce((auth.jwt() ->> 'email') = 'adm@mail.com', false);
$$;

GRANT EXECUTE ON FUNCTION public.check_is_admin() TO anon, authenticated;

-- Разрешаем чтение списка пользователей ТОЛЬКО администратору (через серверную функцию)
DROP POLICY IF EXISTS "Allow admin read profiles" ON public.user_profiles;
CREATE POLICY "Allow admin read profiles"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (public.check_is_admin());

-- Безопасная функция поиска email по логину при входе (без раскрытия списка гостям)
DROP FUNCTION IF EXISTS public.get_email_by_username(text) CASCADE;
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT email FROM public.user_profiles 
    WHERE lower(username) = lower(trim(p_username))
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;

-- Безопасная функция добавления пользователя администратором
DROP FUNCTION IF EXISTS public.admin_register_user_profile(text, text) CASCADE;
CREATE OR REPLACE FUNCTION public.admin_register_user_profile(p_username text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Проверка прав через серверную функцию
    IF NOT public.check_is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Доступ запрещен: требуется аккаунт администратора');
    END IF;

    -- Валидация логина
    IF p_username IS NULL OR length(trim(p_username)) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Логин должен быть не короче 2 символов');
    END IF;

    -- Валидация email
    IF p_email IS NULL OR p_email NOT LIKE '%@%.%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Некорректный email адрес');
    END IF;

    -- Проверка на занятость логина
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE lower(username) = lower(trim(p_username))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Пользователь с таким логином уже существует');
    END IF;

    -- Добавление профиля
    INSERT INTO public.user_profiles (username, email)
    VALUES (trim(p_username), lower(trim(p_email)));

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_user_profile(text, text) TO authenticated;

-- Функция удаления пользователя администратором
DROP FUNCTION IF EXISTS public.admin_delete_user_profile(text) CASCADE;
CREATE OR REPLACE FUNCTION public.admin_delete_user_profile(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.check_is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Доступ запрещен: требуется аккаунт администратора');
    END IF;

    IF lower(trim(p_username)) = 'admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Нельзя удалить главного администратора');
    END IF;

    DELETE FROM public.user_profiles WHERE lower(username) = lower(trim(p_username));
    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user_profile(text) TO authenticated;

-- Главный администратор с логином 'admin' (привязанный к вашему email в Supabase Auth)
INSERT INTO public.user_profiles (username, email)
VALUES ('admin', 'adm@mail.com')
ON CONFLICT (username) DO UPDATE 
SET email = EXCLUDED.email;


-- 6. ФУНКЦИИ ДЛЯ РАБОТЫ С РЕЕСТРОМ КОМНАТ И ПАНЕЛИ АДМИНИСТРАТОРА

-- Функция регистрации комнаты в реестре (вызывается при создании пользователем)
DROP FUNCTION IF EXISTS public.register_room(text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION public.register_room(p_room_id text, p_title text DEFAULT NULL, p_created_by text DEFAULT 'Гость')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean text;
    v_title text;
    v_author text;
BEGIN
    v_clean := lower(trim(p_room_id));
    IF v_clean IS NULL OR length(v_clean) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Идентификатор комнаты не может быть пустым');
    END IF;

    v_title := COALESCE(NULLIF(trim(p_title), ''), v_clean);
    v_author := COALESCE(NULLIF(trim(p_created_by), ''), 'Гость');

    INSERT INTO public.rooms (room_id, title, created_by)
    VALUES (v_clean, v_title, v_author)
    ON CONFLICT (room_id) DO UPDATE
    SET title = COALESCE(EXCLUDED.title, public.rooms.title);

    RETURN jsonb_build_object('success', true, 'room_id', v_clean);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_room(text, text, text) TO anon, authenticated;

-- Получение ПОЛНОЙ сводки по ВСЕМ комнатам от ВСЕХ пользователей (для администратора)
DROP FUNCTION IF EXISTS public.get_admin_rooms_summary() CASCADE;
CREATE OR REPLACE FUNCTION public.get_admin_rooms_summary()
RETURNS TABLE (
    room_id text,
    title text,
    created_by text,
    created_at timestamptz,
    total_movies bigint,
    unwatched_count bigint,
    watched_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_room_ids AS (
        SELECT room_id, title, created_by, created_at FROM public.rooms
        UNION
        SELECT DISTINCT COALESCE(NULLIF(trim(list_id), ''), 'default') AS room_id, 
               COALESCE(NULLIF(trim(list_id), ''), 'default') AS title,
               'Гость' AS created_by,
               now() AS created_at
        FROM public.movies
        WHERE COALESCE(NULLIF(trim(list_id), ''), 'default') NOT IN (SELECT room_id FROM public.rooms)
    )
    SELECT 
        r.room_id,
        COALESCE(NULLIF(r.title, ''), r.room_id) AS title,
        COALESCE(r.created_by, 'Гость') AS created_by,
        r.created_at,
        count(m.id)::bigint AS total_movies,
        count(m.id) FILTER (WHERE m.status = 'Не просмотрено')::bigint AS unwatched_count,
        count(m.id) FILTER (WHERE m.status = 'Просмотрено')::bigint AS watched_count
    FROM all_room_ids r
    LEFT JOIN public.movies m ON COALESCE(NULLIF(trim(m.list_id), ''), 'default') = r.room_id
    GROUP BY r.room_id, r.title, r.created_by, r.created_at
    ORDER BY (r.room_id = 'default') DESC, count(m.id) DESC, r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_rooms_summary() TO anon, authenticated;

-- Полное удаление комнаты администратором (удаляет и комнату из реестра, и все её фильмы)
DROP FUNCTION IF EXISTS public.admin_delete_room(text) CASCADE;
CREATE OR REPLACE FUNCTION public.admin_delete_room(p_room_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_room text;
    v_deleted_movies int;
BEGIN
    IF NOT public.check_is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Доступ запрещен: требуется аккаунт администратора');
    END IF;

    v_clean_room := COALESCE(NULLIF(trim(p_room_id), ''), 'default');

    IF lower(v_clean_room) = 'default' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Нельзя удалить общий список');
    END IF;

    -- Удаляем фильмы комнаты
    DELETE FROM public.movies 
    WHERE list_id = v_clean_room;
    GET DIAGNOSTICS v_deleted_movies = ROW_COUNT;

    -- Удаляем комнату из реестра
    DELETE FROM public.rooms 
    WHERE room_id = v_clean_room;

    RETURN jsonb_build_object('success', true, 'deleted_movies', v_deleted_movies);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_room(text) TO authenticated;


-- 7. АВТОМАТИЧЕСКОЕ ПОДТВЕРЖДЕНИЕ EMAIL (чтобы новые пользователи могли сразу входить)
DROP FUNCTION IF EXISTS public.auto_confirm_new_users() CASCADE;
CREATE OR REPLACE FUNCTION public.auto_confirm_new_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_auto_confirm
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_confirm_new_users();

-- Активируем всех уже созданных пользователей, которые заблокированы из-за неподтвержденной почты
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL;

-- ==============================================================================
-- ИНСТРУКЦИЯ:
-- 1. Откройте панель управления https://app.supabase.com -> ваш проект -> SQL Editor
-- 2. Вставьте этот текст и нажмите "RUN"
-- 3. Все готово: реестр комнат, безопасность, пользователи и права администратора настроены!
-- ==============================================================================
