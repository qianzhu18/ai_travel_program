import "dotenv/config";
import mysql from "mysql2/promise";

const LEGACY_GROUP_CODES = [
  "shaonv",
  "shunv",
  "yuanqigege",
  "ruizhidashu",
  "ruanmengnvhai",
  "ertong",
  "laonian",
];

const TEMPLATE_VERSION_KEY = "template_version";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pool = mysql.createPool(databaseUrl);
  const placeholders = LEGACY_GROUP_CODES.map(() => "?").join(", ");

  try {
    const [beforeRows] = await pool.query<any[]>(
      "SELECT COUNT(*) AS count FROM templates",
    );
    const beforeCount = Number(beforeRows[0]?.count || 0);

    const [deleteTemplatesResult] = await pool.execute<mysql.ResultSetHeader>(
      `
      DELETE FROM templates
      WHERE groupType IN (${placeholders})
         OR imageUrl LIKE 'https://picsum.photos/seed/%'
         OR imageUrl LIKE 'https://via.placeholder.com/%'
         OR thumbnailUrl LIKE 'https://picsum.photos/seed/%'
         OR thumbnailUrl LIKE 'https://via.placeholder.com/%'
      `,
      LEGACY_GROUP_CODES,
    );

    const [deleteGroupTypesResult] = await pool.execute<mysql.ResultSetHeader>(
      `DELETE FROM groupTypes WHERE code IN (${placeholders})`,
      LEGACY_GROUP_CODES,
    );

    await pool.execute(
      `
      INSERT INTO systemConfigs (configKey, configValue, description)
      VALUES (?, '1', 'Template list version')
      ON DUPLICATE KEY UPDATE
        configValue = CAST(configValue AS UNSIGNED) + 1,
        description = VALUES(description)
      `,
      [TEMPLATE_VERSION_KEY],
    );

    const [afterRows] = await pool.query<any[]>(
      "SELECT COUNT(*) AS count FROM templates",
    );
    const afterCount = Number(afterRows[0]?.count || 0);

    console.log("[cleanup] Legacy template cleanup completed");
    console.log(
      `[cleanup] templates: ${beforeCount} -> ${afterCount} (deleted ${deleteTemplatesResult.affectedRows})`,
    );
    console.log(
      `[cleanup] groupTypes deleted: ${deleteGroupTypesResult.affectedRows}`,
    );
    console.log("[cleanup] template_version bumped");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[cleanup] Failed:", error);
  process.exit(1);
});
