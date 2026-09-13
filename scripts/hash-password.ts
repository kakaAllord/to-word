/**
 * Generate APP_PASSWORD_HASH. Usage:
 *   npm run hash-password -- 'the password'
 * The plaintext is never stored anywhere by this script.
 */
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash-password -- 'the password'");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nAdd this to your environment (quote it — it contains $):\n');
console.log(`APP_PASSWORD_HASH='${hash}'\n`);
