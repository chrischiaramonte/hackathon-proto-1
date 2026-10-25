// End-to-end test of the real pipeline without a physical webcam.
//
// Chrome's fake camera plays PopSign videos of real signers (made by
// backend/scripts/make_fake_webcam.py), so every step is the production path:
// getUserMedia -> MediaPipe Holistic (WASM) -> POST /api/recognize -> TFLite
// model -> lesson UI. Nothing is mocked except where a scenario says so.
//
// Needs both servers running (backend on :8000, `npm run dev` on :5173) and
// Google Chrome installed. Run: npm run e2e
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const CAMS = process.env.FAKE_WEBCAM_DIR ?? resolve(here, '../../backend/data/fake-webcam');
const APP = process.env.APP_URL ?? 'http://localhost:5173/';
const OUT = join(here, 'output');
const PROFILE = join(OUT, 'profile');
const PRAISE = /Nice signing!|You got it!|Great job!|Excellent!/;
mkdirSync(OUT, { recursive: true });

let failures = 0;
async function scenario(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error).split('\n')[0]}`);
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** Chrome whose webcam shows `cam` (a sign), or no camera permission at all. */
async function launch(cam, { denyCamera = false } = {}) {
  const args = ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
  if (!denyCamera) args.push('--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${join(CAMS, `${cam}.y4m`)}`);
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 860 },
    permissions: denyCamera ? [] : ['camera'],
    args,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const results = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/recognize')) results.push(await response.json().catch(() => null));
  });
  return { context, page, results };
}

const word = (page) => page.locator('h1').first().innerText();
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

async function signCurrentWord(page, name) {
  await page.getByRole('button', { name: /I’m ready/ }).click();
  await page.getByText(PRAISE).waitFor({ timeout: 20_000 });
  await shot(page, name);
}

rmSync(PROFILE, { recursive: true, force: true });

await scenario('recognises the sign on camera and awards XP', async () => {
  const { context, page, results } = await launch('hello');
  await page.goto(APP);
  await page.getByRole('button', { name: /Start learning/ }).click();
  check((await word(page)) === 'Hello', 'first sign should be Hello');
  await signCurrentWord(page, '01-hello-accepted');
  const accepted = results.find((r) => r?.accepted);
  check(accepted?.topPredictions[0].sign === 'hello', 'the model should have recognised hello');
  check(await page.getByText('+10 XP').isVisible(), 'first-try XP should be +10');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Same camera, but the lesson now asks for PLEASE: must not pass.
  check((await word(page)) === 'Please', 'second sign should be Please');
  await page.getByRole('button', { name: /I’m ready/ }).click();
  await page.getByText('Time’s up').waitFor({ timeout: 30_000 });
  await shot(page, '02-please-timed-out');
  check(!results.some((r) => r?.target === 'please' && r.accepted), 'HELLO must not be accepted as PLEASE');
  check(await page.getByText('The model saw “Hello” instead.').isVisible(), 'the miss should say what the model saw');
  await page.getByRole('button', { name: 'Continue' }).click();
  check((await word(page)) === 'Thank you', 'the missed sign should move to the end of the queue');
  await context.close();
});

await scenario('resumes the lesson after a reload', async () => {
  const { context, page } = await launch('hello');
  await page.goto(APP);
  await page.getByText('Pick up where you left off').waitFor();
  check((await page.locator('section').first().innerText()).includes('1/6'), 'progress should show 1/6');
  await context.close();
});

await scenario('completes the lesson with real recognition', async () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    // Find out which sign is next, then relaunch with that sign on camera.
    let { context, page } = await launch('hello');
    await page.goto(APP);
    await page.getByRole('button', { name: /^Continue/ }).first().click();
    await page.getByRole('button', { name: /I’m ready|Getting camera ready|Connecting/ }).waitFor();
    if ((await page.locator('h1').count()) === 0) {
      // A translation prompt hides the word: type the meaning, as a learner would.
      const label = (await page.locator('video').first().getAttribute('aria-label')).match(/“(.+)”/)[1];
      await page.getByRole('button', { name: /I’m ready/ }).click();
      await page.getByLabel('English meaning').fill(label);
      await page.getByRole('button', { name: 'Check answer' }).click();
      await page.getByText(PRAISE).waitFor();
    } else {
      const next = (await word(page)).toLowerCase().replace(/[^a-z]/g, '');
      await context.close();

      ({ context, page } = await launch(next));
      await page.goto(APP);
      await page.getByRole('button', { name: /^Continue/ }).first().click();
      await page.waitForTimeout(2000); // let hand tracking load
      await signCurrentWord(page, `03-${next}-accepted`);
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    const complete = await page.getByText('Lesson complete!').isVisible().catch(() => false);
    if (complete) {
      await shot(page, '04-lesson-complete');
      const text = await page.locator('main').innerText();
      check(/XP EARNED\s*75/i.test(text), `expected 75 XP (5 first tries, 1 after a miss, bonus), got: ${text.replace(/\s+/g, ' ')}`);
      await context.close();
      return;
    }
    await context.close();
  }
  throw new Error('lesson did not complete');
});

await scenario('without camera access, explains and offers unscored practice', async () => {
  rmSync(PROFILE, { recursive: true, force: true });
  const { context, page } = await launch(null, { denyCamera: true });
  await page.goto(APP);
  await page.getByRole('button', { name: /Start learning/ }).click();
  await page.getByText(/Camera access was blocked/).waitFor({ timeout: 15_000 });
  check(await page.getByRole('button', { name: /Camera unavailable/ }).isDisabled(), 'scored practice must not start without a camera');
  await shot(page, '05-camera-denied');
  await page.getByRole('button', { name: /without camera/ }).click();
  await page.getByText(/Practice mode/).waitFor();
  await page.getByRole('button', { name: /I’m ready/ }).click();
  await page.getByRole('button', { name: /I practiced it/ }).click();
  check((await page.getByText('+').count()) === 0, 'practice answers must not earn XP');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Try recognition again' }).click();
  await page.getByText(/Camera access was blocked/).waitFor();
  await context.close();
});

await scenario('with the server unreachable, blocks scoring and recovers', async () => {
  rmSync(PROFILE, { recursive: true, force: true });
  const { context, page } = await launch('hello');
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(APP);
  await page.getByRole('button', { name: /^Continue|Start/ }).first().click();
  await page.getByText(/Can’t reach the recognition server/).waitFor({ timeout: 15_000 });
  check(await page.getByRole('button', { name: /Server unavailable/ }).isDisabled(), 'start must be disabled');
  await shot(page, '06-server-down');
  await page.unroute('**/api/**');
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('button', { name: /I’m ready|Getting camera ready/ }).waitFor();
  await context.close();
});

console.log(failures ? `\n${failures} scenario(s) failed` : '\nAll scenarios passed');
process.exit(failures ? 1 : 0);
