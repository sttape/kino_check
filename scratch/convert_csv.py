import glob
import csv
import re
import os

files = [f for f in glob.glob(r'C:\Users\sttape\Desktop\*.csv') if 'test' not in f and 'converted' not in f]
if not files:
    print("No target file found!")
    exit(1)

source_file = files[0]
print(f"Reading from: {source_file}")

output_file = r'C:\Users\sttape\Desktop\kino_check\movies_converted.csv'
desktop_output = r'C:\Users\sttape\Desktop\movies_converted.csv'

def parse_rating(val):
    if not val:
        return ""
    val = val.strip()
    # Check for (9), (10), etc.
    m = re.search(r'\((\d+)\)', val)
    if m:
        num = int(m.group(1))
        if -1 <= num <= 11:
            return str(num)
    # Check for direct number
    m2 = re.search(r'^-?\d+', val)
    if m2:
        num = int(m2.group(0))
        if -1 <= num <= 11:
            return str(num)
    return ""

def parse_status(val):
    if not val:
        return "Не просмотрено"
    v = val.strip().lower()
    if "не просмотрено" in v:
        return "Не просмотрено"
    if "просмотрено" in v:
        return "Просмотрено"
    if "запланировано" in v:
        return "Запланировано"
    if "скоро" in v:
        return "Скоро выйдет"
    if "не вышел" in v:
        return "Не вышел"
    if "не охота" in v:
        return "НЕ ОХОТА"
    # fallback
    return val.strip()

converted_rows = []

with open(source_file, 'r', encoding='cp1251', errors='replace') as fp:
    reader = csv.reader(fp, delimiter=';')
    header = next(reader, None)
    
    for row_idx, row in enumerate(reader, start=2):
        if not row or not any(cell.strip() for cell in row):
            continue
        
        # Columns in source Google Form export:
        # 0: Отметка времени
        # 1: Название фильма (title)
        # 2: Жанр фильма (genre)
        # 3: Комментарий (comment)
        # 4: Оценка (ratings)
        # 5: Статус (status)
        
        title = row[1].strip() if len(row) > 1 else ""
        if not title:
            continue
            
        genre = row[2].strip() if len(row) > 2 else ""
        comment = row[3].strip() if len(row) > 3 else ""
        raw_rating = row[4].strip() if len(row) > 4 else ""
        raw_status = row[5].strip() if len(row) > 5 else ""
        
        rating = parse_rating(raw_rating)
        status = parse_status(raw_status)
        
        converted_rows.append({
            'title': title,
            'genre': genre,
            'comment': comment,
            'status': status,
            'ratings': rating
        })

print(f"Total valid movies converted: {len(converted_rows)}")

# Write to CSV in UTF-8 with BOM for Excel and Web compatibility
for out_path in [output_file, desktop_output]:
    with open(out_path, 'w', encoding='utf-8-sig', newline='') as fp:
        writer = csv.DictWriter(fp, fieldnames=['title', 'genre', 'comment', 'status', 'ratings'], delimiter=';')
        writer.writeheader()
        for r in converted_rows:
            writer.writerow(r)
    print(f"Saved to: {out_path}")

# Print first 10 converted movies
print("\nFirst 10 movies:")
for r in converted_rows[:10]:
    print(f"  [{r['status']}] {r['title']} | {r['genre']} | Оценка: {r['ratings'] or '-'}")
