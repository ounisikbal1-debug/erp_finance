import os

with open('src/data/prisma/schema.prisma', 'r', encoding='utf-8') as f:
    sqlite_content = f.read()

pg_content = sqlite_content.replace('provider = "sqlite"', 'provider = "postgresql"')

with open('src/data/prisma/postgresql/schema.prisma', 'w', encoding='utf-8') as f:
    f.write(pg_content)

print('Synchronized PostgreSQL schema successfully!')
