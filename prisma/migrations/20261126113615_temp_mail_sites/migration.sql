-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TempMailProvider" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "adapterKey" TEXT NOT NULL DEFAULT 'generic',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TempMailProvider" ("createdAt", "domain", "enabled", "id", "isBuiltin", "name", "sortOrder") SELECT "createdAt", "domain", "enabled", "id", "isBuiltin", "name", "sortOrder" FROM "TempMailProvider";
DROP TABLE "TempMailProvider";
ALTER TABLE "new_TempMailProvider" RENAME TO "TempMailProvider";
CREATE UNIQUE INDEX "TempMailProvider_domain_key" ON "TempMailProvider"("domain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
