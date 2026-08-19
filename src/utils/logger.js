// ANSI Color codes للتوافق الكامل
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const logger = {
  info(text) {
    console.log(`${colors.cyan}[INFO] [${new Date().toLocaleTimeString()}]${colors.reset} ${text}`);
  },
  success(text) {
    console.log(`${colors.green}[SUCCESS] [${new Date().toLocaleTimeString()}]${colors.reset} ${text}`);
  },
  warn(text) {
    console.log(`${colors.yellow}[WARN] [${new Date().toLocaleTimeString()}]${colors.reset} ${text}`);
  },
  error(text, err = '') {
    console.log(`${colors.red}[ERROR] [${new Date().toLocaleTimeString()}]${colors.reset} ${text}`, err);
  }
};

module.exports = logger;
