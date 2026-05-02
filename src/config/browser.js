import fs from 'fs';
import puppeteer from 'puppeteer';

const browserExecutableCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  puppeteer.executablePath(),
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
].filter(Boolean);

function isExecutable(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveBrowserExecutablePath() {
  for (const candidate of browserExecutableCandidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'No Chrome or Chromium executable was found. Run `npx puppeteer browsers install chrome` or set PUPPETEER_EXECUTABLE_PATH.'
  );
}
