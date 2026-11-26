import argparse
import json
import pathlib
import sqlite3
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA_DIR = (ROOT / "src" / "data").resolve()
COUNTRIES = [
    {"code": "TN", "name": "Tunisie", "currency": "TND", "symbol": "DT", "stamp": 1.0, "corporate": 20.0},
    {"code": "FR", "name": "France", "currency": "EUR", "symbol": "€"},
    {"code": "US", "name": "États-Unis", "currency": "USD", "symbol": "$"},
    {"code": "AE", "name": "Émirats arabes unis", "currency": "AED", "symbol": "AED"},
]
ENTITIES = [
    {"code": "SAFE-TN-001", "name": "SAFE AFRIQUE TUNISIE", "country": "TN"},
    {"code": "SAFE-FR-001", "name": "SAFE EUROPE FRANCE", "country": "FR"},
    {"code": "SAFE-US-001", "name": "SAFE AMERIQUE USA", "country": "US"},
    {"code": "SAFE-AE-001", "name": "SAFE ASIE UAE", "country": "AE"},
]


def new_id():
    return str(uuid.uuid4())


def seed_database(database_path):
    database_path = pathlib.Path(database_path).resolve()
    if DATA_DIR not in database_path.parents or not database_path.is_file():
        raise ValueError("La base cible doit être un fichier SQLite existant dans src/data de DRAFT2.")

    db = sqlite3.connect(database_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("BEGIN IMMEDIATE")
        required = {
            "CountryProfile": {"id", "code", "name", "currencyCode", "currencySymbol", "stampDuty", "corporateTax", "isDefault"},
            "Entity": {"id", "code", "name", "countryId"},
            "ConsolidationGroup": {"id", "ownerEntityId", "name", "reportingCurrencyCode", "eliminationPolicy"},
            "ConsolidationGroupEntity": {"id", "groupId", "entityId", "ownershipPercentage", "consolidationMethod"},
            "TaxJurisdiction": {"id", "countryId", "parentId", "kind", "code", "name", "isActive"},
        }
        for table, expected_columns in required.items():
            columns = {row["name"] for row in db.execute(f'PRAGMA table_info("{table}")')}
            if not expected_columns.issubset(columns):
                raise ValueError(f"Schéma {table} incomplet; déployez d’abord la migration DRAFT2.")
            if table == "Entity":
                entity_columns = columns

        country_ids = {}
        has_default = db.execute('SELECT 1 FROM "CountryProfile" WHERE "isDefault" = 1 LIMIT 1').fetchone() is not None
        for country in COUNTRIES:
            existing = db.execute(
                'SELECT "id" FROM "CountryProfile" WHERE "code" = ?', (country["code"],)
            ).fetchone()
            if existing:
                country_ids[country["code"]] = existing["id"]
                continue
            country_id = new_id()
            db.execute(
                '''INSERT INTO "CountryProfile"
                   ("id","code","name","currencyCode","currencySymbol","stampDuty","corporateTax","isDefault","createdAt","updatedAt")
                   VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)''',
                (
                    country_id,
                    country["code"],
                    country["name"],
                    country["currency"],
                    country["symbol"],
                    country.get("stamp"),
                    country.get("corporate"),
                    int(country["code"] == "TN" and not has_default),
                ),
            )
            country_ids[country["code"]] = country_id

        entity_ids = {}
        for entity in ENTITIES:
            existing = db.execute(
                'SELECT "id","name","countryId" FROM "Entity" WHERE "code" = ?',
                (entity["code"],),
            ).fetchone()
            expected_country = country_ids[entity["country"]]
            if existing:
                if existing["name"] != entity["name"] or existing["countryId"] != expected_country:
                    raise ValueError(f"Le code société {entity['code']} existe avec une identité différente.")
                entity_ids[entity["code"]] = existing["id"]
                continue
            entity_id = new_id()
            insert_columns = ["id", "code", "name", "countryId"]
            values = [entity_id, entity["code"], entity["name"], expected_country]
            if "createdAt" in entity_columns:
                insert_columns.append("createdAt")
                values.append("CURRENT_TIMESTAMP")
            placeholders = ["CURRENT_TIMESTAMP" if value == "CURRENT_TIMESTAMP" else "?" for value in values]
            bound_values = [value for value in values if value != "CURRENT_TIMESTAMP"]
            column_sql = ",".join('"' + column + '"' for column in insert_columns)
            db.execute(
                f'INSERT INTO "Entity" ({column_sql}) VALUES ({",".join(placeholders)})',
                bound_values,
            )
            entity_ids[entity["code"]] = entity_id

        owner_id = entity_ids["SAFE-TN-001"]
        group = db.execute(
            'SELECT "id","ownerEntityId","reportingCurrencyCode","eliminationPolicy" FROM "ConsolidationGroup" WHERE "name" = ?',
            ("SAFE Groupe",),
        ).fetchone()
        if group:
            if group["ownerEntityId"] != owner_id or group["reportingCurrencyCode"] != "TND":
                raise ValueError("Le groupe SAFE Groupe existe avec une configuration différente.")
            group_id = group["id"]
        else:
            group_id = new_id()
            db.execute(
                '''INSERT INTO "ConsolidationGroup"
                   ("id","ownerEntityId","name","reportingCurrencyCode","eliminationPolicy","createdAt","updatedAt")
                   VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)''',
                (group_id, owner_id, "SAFE Groupe", "TND", "UNCONFIGURED"),
            )

        for entity in ENTITIES:
            entity_id = entity_ids[entity["code"]]
            membership = db.execute(
                'SELECT "ownershipPercentage","consolidationMethod" FROM "ConsolidationGroupEntity" WHERE "groupId" = ? AND "entityId" = ?',
                (group_id, entity_id),
            ).fetchone()
            if membership:
                if membership["ownershipPercentage"] != 100 or membership["consolidationMethod"] != "PROPORTIONAL":
                    raise ValueError(f"Le rattachement de {entity['name']} a une configuration différente.")
                continue
            db.execute(
                '''INSERT INTO "ConsolidationGroupEntity"
                   ("id","groupId","entityId","ownershipPercentage","consolidationMethod","createdAt")
                   VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)''',
                (new_id(), group_id, entity_id, 100, "PROPORTIONAL"),
            )

        def ensure_jurisdiction(kind, code, name, parent_id=None):
            existing = db.execute(
                'SELECT "id","name","parentId" FROM "TaxJurisdiction" WHERE "countryId" = ? AND "kind" = ? AND "code" = ?',
                (country_ids["US"], kind, code),
            ).fetchone()
            if existing:
                if existing["name"] != name or existing["parentId"] != parent_id:
                    raise ValueError(f"La juridiction {code} existe avec une identité différente.")
                return existing["id"]
            jurisdiction_id = new_id()
            db.execute(
                '''INSERT INTO "TaxJurisdiction"
                   ("id","countryId","parentId","kind","code","name","isActive","createdAt","updatedAt")
                   VALUES (?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)''',
                (jurisdiction_id, country_ids["US"], parent_id, kind, code, name),
            )
            return jurisdiction_id

        new_york_id = ensure_jurisdiction("STATE", "NY", "New York")
        massachusetts_id = ensure_jurisdiction("STATE", "MA", "Massachusetts")
        ensure_jurisdiction("CITY", "NYC", "New York City", new_york_id)
        ensure_jurisdiction("CITY", "BOS", "Boston", massachusetts_id)

        result = {
            "countries": db.execute('SELECT COUNT(*) FROM "CountryProfile" WHERE "code" IN ("TN","FR","US","AE")').fetchone()[0],
            "entities": db.execute(
                'SELECT COUNT(*) FROM "Entity" WHERE "code" IN ("SAFE-TN-001","SAFE-FR-001","SAFE-US-001","SAFE-AE-001")'
            ).fetchone()[0],
            "groups": db.execute('SELECT COUNT(*) FROM "ConsolidationGroup" WHERE "id" = ?', (group_id,)).fetchone()[0],
            "memberships": db.execute('SELECT COUNT(*) FROM "ConsolidationGroupEntity" WHERE "groupId" = ?', (group_id,)).fetchone()[0],
            "us_local_jurisdictions": db.execute(
                'SELECT COUNT(*) FROM "TaxJurisdiction" WHERE "countryId" = ? AND "code" IN ("NY","MA","NYC","BOS")',
                (country_ids["US"],),
            ).fetchone()[0],
        }
        if result != {"countries": 4, "entities": 4, "groups": 1, "memberships": 4, "us_local_jurisdictions": 4}:
            raise ValueError(f"Vérification de la population SAFE Groupe échouée : {result}")
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--confirm", required=True)
    args = parser.parse_args()
    if args.confirm != "YES":
        raise SystemExit("Refusé : --confirm YES est nécessaire.")
    print(json.dumps(seed_database(args.database), ensure_ascii=False))


if __name__ == "__main__":
    main()
