import "dotenv/config";
// Testler asla geliştirme veritabanına yazmasın.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error("Testler yalnızca adı _test ile biten veritabanında çalışır");
}
process.env.SITE_URL = "https://webtasarimajansi.net";
process.env.EMAIL_TRANSPORT = "log";
