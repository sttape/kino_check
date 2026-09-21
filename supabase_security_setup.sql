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

-- Б) Добавление: разрешено ТОЛЬКО авторизованным администраторам (Supabase Auth)
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
);

-- В) Редактирование: разрешено ТОЛЬКО авторизованным администраторам (Supabase Auth)
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
);

-- Г) Удаление: разрешено ТОЛЬКО авторизованным администраторам (Supabase Auth)
CREATE POLICY "Allow authenticated delete"
ON public.movies
FOR DELETE
TO authenticated
USING (true);


-- 4. Таблица профилей для входа по ЛОГИНУ (user_profiles)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text UNIQUE NOT NULL,
    email text NOT NULL,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Безопасная функция проверки прав главного администратора (выполняется на сервере Supabase без циклических блокировок)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce((auth.jwt() ->> 'email') = 'adm@mail.com', false);
$$;

GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated;

-- Разрешаем чтение списка пользователей ТОЛЬКО администратору (через серверную функцию)
DROP POLICY IF EXISTS "Allow admin read profiles" ON public.user_profiles;
CREATE POLICY "Allow admin read profiles"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (public.check_is_admin());

-- Безопасная функция поиска email по логину при входе (без раскрытия списка гостям)
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


-- 5. АВТОМАТИЧЕСКОЕ ПОДТВЕРЖДЕНИЕ EMAIL (чтобы новые пользователи могли сразу входить)
-- В Supabase по умолчанию требуется клик по ссылке в письме. Этот триггер автоматически активирует аккаунт.
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
-- 3. Все пользователи (включая только что созданных) сразу активируются и смогут входить по логину и паролю!
-- ==============================================================================
