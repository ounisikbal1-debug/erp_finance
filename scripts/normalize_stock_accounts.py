import sqlite3

con = sqlite3.connect('src/data/data.db')
cur = con.cursor()

# Mettre à jour les intitulés pour les conformer aux normes SCE tunisiennes officielles
official_accounts = [
    ('311', 'Matières premières et fournitures consommables (Norme SCE)', 3, 'Asset'),
    ('33', 'En-cours de production de biens et services (Norme SCE)', 3, 'Asset'),
    ('603', 'Variations des stocks d approvisionnements et marchandises (Norme SCE)', 6, 'Expense'),
]

for code, desc, cls, typ in official_accounts:
    cur.execute(
        "UPDATE ChartOfAccount SET description = ?, classNumber = ?, type = ? WHERE code = ?",
        (desc, cls, typ, code)
    )
    print(f"Compte {code} normalisé : {desc}")

con.commit()
cur.close()
con.close()
print("Normalisation comptable des stocks terminée.")
