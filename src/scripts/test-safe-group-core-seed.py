import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest
import uuid


SCRIPT = pathlib.Path(__file__).with_name("seed-safe-group-core.py")
SPEC = importlib.util.spec_from_file_location("safe_group_seed", SCRIPT)
SEED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SEED)


class SafeGroupSeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=SEED.DATA_DIR)
        self.database = pathlib.Path(self.temp.name) / "seed-test.db"
        db = sqlite3.connect(self.database)
        db.executescript(
            '''
            CREATE TABLE "CountryProfile" (
              "id" TEXT PRIMARY KEY, "code" TEXT UNIQUE NOT NULL, "name" TEXT NOT NULL,
              "currencyCode" TEXT NOT NULL, "currencySymbol" TEXT NOT NULL,
              "stampDuty" REAL, "corporateTax" REAL, "isDefault" BOOLEAN NOT NULL DEFAULT 0,
              "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL
            );
            CREATE TABLE "Entity" (
              "id" TEXT PRIMARY KEY, "code" TEXT UNIQUE NOT NULL DEFAULT 'TN01', "name" TEXT UNIQUE NOT NULL,
              "fiscalId" TEXT, "tradeRegister" TEXT, "countryId" TEXT NOT NULL,
              FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id")
            );
            CREATE TABLE "ConsolidationGroup" (
              "id" TEXT PRIMARY KEY, "ownerEntityId" TEXT NOT NULL, "name" TEXT NOT NULL,
              "reportingCurrencyCode" TEXT NOT NULL, "eliminationPolicy" TEXT NOT NULL,
              "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL,
              UNIQUE ("ownerEntityId","name"),
              FOREIGN KEY ("ownerEntityId") REFERENCES "Entity"("id")
            );
            CREATE TABLE "ConsolidationGroupEntity" (
              "id" TEXT PRIMARY KEY, "groupId" TEXT NOT NULL, "entityId" TEXT NOT NULL,
              "ownershipPercentage" REAL NOT NULL, "consolidationMethod" TEXT NOT NULL,
              "createdAt" DATETIME NOT NULL, UNIQUE ("groupId","entityId"),
              FOREIGN KEY ("groupId") REFERENCES "ConsolidationGroup"("id"),
              FOREIGN KEY ("entityId") REFERENCES "Entity"("id")
            );
            CREATE TABLE "TaxJurisdiction" (
              "id" TEXT PRIMARY KEY, "countryId" TEXT NOT NULL, "parentId" TEXT,
              "kind" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
              "isActive" BOOLEAN NOT NULL DEFAULT 1, "createdAt" DATETIME NOT NULL,
              "updatedAt" DATETIME NOT NULL, UNIQUE ("countryId","kind","code"),
              FOREIGN KEY ("countryId") REFERENCES "CountryProfile"("id"),
              FOREIGN KEY ("parentId") REFERENCES "TaxJurisdiction"("id")
            );
            '''
        )
        db.commit()
        db.close()

    def tearDown(self):
        self.temp.cleanup()

    def test_seed_is_additive_and_idempotent(self):
        first = SEED.seed_database(self.database)
        db = sqlite3.connect(self.database)
        db.execute('UPDATE "CountryProfile" SET "name" = ? WHERE "code" = ?', ("Nom tunisien prÃ©existant", "TN"))
        db.commit()
        second = SEED.seed_database(self.database)
        name = db.execute('SELECT "name" FROM "CountryProfile" WHERE "code" = "TN"').fetchone()[0]
        self.assertEqual(first, {"countries": 4, "entities": 4, "groups": 1, "memberships": 4, "us_local_jurisdictions": 4})
        self.assertEqual(second, first)
        self.assertEqual(name, "Nom tunisien prÃ©existant")
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        db.close()

    def test_identity_conflict_rolls_back(self):
        db = sqlite3.connect(self.database)
        country_id = str(uuid.uuid4())
        db.execute(
            'INSERT INTO "CountryProfile" VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
            (country_id, "TN", "Tunisie", "TND", "DT", 1.0, 20.0, 1),
        )
        db.execute(
            'INSERT INTO "Entity" ("id","code","name","countryId") VALUES (?,?,?,?)',
            (str(uuid.uuid4()), "SAFE-TN-001", "Autre sociÃ©tÃ©", country_id),
        )
        db.commit()
        db.close()
        with self.assertRaisesRegex(ValueError, "identitÃ© diffÃ©rente"):
            SEED.seed_database(self.database)
        db = sqlite3.connect(self.database)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM "Entity"').fetchone()[0], 1)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM "CountryProfile"').fetchone()[0], 1)
        db.close()


if __name__ == "__main__":
    unittest.main()
