// F10 personal-context browser E2E: real Chromium -> Next.js BFF -> core API -> PostgreSQL on the
// LOCAL demo stack. Nothing is mocked. The only injected pieces are (1) a stub for the browser's
// speechSynthesis so the test can prove that nothing is spoken until a click and what is spoken,
// and (2) a fake microphone playing a SYNTHETIC English clip to prove the transcribe -> answer path
// (it says nothing about real voice quality).
//
//   node tests/e2e/assistant-personal-live.cjs empty   (before seeding notifications)
//   node tests/e2e/assistant-personal-live.cjs data    (after assistant-personal-seed.cjs)
//
// Env: QA9_DEMO_EMAIL/QA9_DEMO_PASSWORD, QA9_EMPTY_EMAIL/QA9_EMPTY_PASSWORD, QA9_WEB_URL (default
// http://localhost:3100), QA9_SIZES (data phase: desktop,phone subset; the assistant allows 20 messages
// per minute per user, so run the sizes a minute apart), QA9_SHOTS (screenshot dir), QA9_VOICE_AUDIO (16 kHz mono WAV, data phase).
// Credentials come from the environment and are never printed. Login is limited to 5/min, so each
// account logs in once per run and the session is reused.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const phase = process.argv[2];
const origin = new URL(process.env.QA9_WEB_URL || 'http://localhost:3100');
const shots = path.resolve(process.env.QA9_SHOTS || 'docs/qa/assistant-personal');
const accounts = {
  demo: [process.env.QA9_DEMO_EMAIL, process.env.QA9_DEMO_PASSWORD],
  empty: [process.env.QA9_EMPTY_EMAIL, process.env.QA9_EMPTY_PASSWORD],
};
if (!['empty', 'data'].includes(phase) || Object.values(accounts).some(([e, p]) => !e || !p)) {
  console.error('usage: set QA9_* credentials, then: node assistant-personal-live.cjs empty|data');
  process.exit(2);
}
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local stack only.');
fs.mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, fn) =>
  fn().then(
    (detail) => results.push({ name, status: 'PASS', ...(detail ? { detail } : {}) }),
    (error) => results.push({ name, status: 'FAIL', detail: String(error.message).split('\n')[0] }),
  );
const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const speechStub = () => {
  window.__spoken = [];
  const fake = {
    getVoices: () => [{ lang: 'en-US' }, { lang: 'ur-PK' }, { lang: 'hi-IN' }],
    speak: (u) => window.__spoken.push({ text: u.text, lang: u.lang }),
    cancel: () => undefined,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
};

async function signIn(browser, key) {
  const context = await browser.newContext({ viewport: SIZES.desktop });
  const page = await context.newPage();
  await page.goto(new URL('/login', origin).href);
  await page.getByLabel('Phone or Email').fill(accounts[key][0]);
  await page.getByLabel('Password', { exact: true }).fill(accounts[key][1]);
  await page.getByRole('button', { name: /sign in|log in|login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(process.env.QA9_VOICE_AUDIO ? [`--use-file-for-fake-audio-capture=${process.env.QA9_VOICE_AUDIO}`] : [])],
  });
  const states = {};
  const open = async (key, size) => {
    states[key] ??= await signIn(browser, key);
    const context = await browser.newContext({ viewport: SIZES[size], storageState: states[key], permissions: ['microphone'] });
    await context.addInitScript(speechStub);
    const page = await context.newPage();
    await page.goto(new URL('/assistant', origin).href);
    await page.getByRole('heading', { name: 'Ask the agriculture assistant' }).waitFor({ timeout: 30000 });
    return { context, page };
  };
  const chat = (page) => page.locator('section[aria-labelledby="chat-heading"]');
  const shot = (page, name) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
  const lastAnswer = (page) => chat(page).locator('article').last();
  const ask = async (page, text, language) => {
    if (language) await chat(page).getByLabel('Language').selectOption(language);
    const before = await chat(page).locator('article').count();
    await chat(page).getByLabel('Your question').fill(text);
    await chat(page).getByRole('button', { name: 'Ask', exact: true }).click();
    await page.waitForFunction(
      (n) => document.querySelectorAll('section[aria-labelledby="chat-heading"] article').length >= n + 2 && !document.querySelector('section[aria-labelledby="chat-heading"] button[disabled]')?.textContent?.includes('Asking'),
      before,
      { timeout: 30000 },
    );
    return (await lastAnswer(page).innerText()).replace(/\s+/g, ' ');
  };
  const chip = (page) => lastAnswer(page).getByTestId('account-chip');
  const card = (page) => page.getByTestId('warnings-card');
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  try {
    if (phase === 'empty') {
      // A brand-new farmer: no farms, fields, seasons, expenses or notifications.
      for (const size of ['phone', 'desktop']) {
        const { context, page } = await open('empty', size);
        await check(`[${size}] empty farmer: warnings card says there are no unread warnings and is dismissible`, async () => {
          await card(page).waitFor({ timeout: 20000 });
          assert.match(await card(page).innerText(), /You have no unread warnings/);
          await shot(page, `${size}-01-empty-warnings-card`);
          await card(page).getByRole('button', { name: 'Dismiss warnings' }).click();
          await card(page).waitFor({ state: 'detached', timeout: 5000 });
        });
        for (const [slug, question, expected] of [
          ['farms', 'which farms do I have', /You have no farms saved yet/],
          ['fields', 'what are my fields', /You have no fields saved yet/],
          ['seasons', 'what crop seasons do I have', /no active or planned crop seasons/],
          ['spend', 'how much did I spend this month', /You have no confirmed expenses this month\./],
          ['warnings', 'do I have any warnings', /You have no unread notifications\./],
        ])
          await check(`[${size}] empty state: "${question}"`, async () => {
            const text = await ask(page, question, 'en');
            assert.match(text, expected);
            await chip(page).waitFor({ timeout: 3000 });
            assert.equal(await overflow(page), false, 'horizontal overflow');
            if (slug === 'spend' || slug === 'farms') await shot(page, `${size}-02-empty-${slug}`);
          });
        await context.close();
      }
      // Demo farmer before any notification exists.
      const { context, page } = await open('demo', 'desktop');
      await check('[desktop] demo farmer with no notifications: card shows the empty warnings state', async () => {
        await card(page).waitFor({ timeout: 20000 });
        assert.match(await card(page).innerText(), /no unread warnings/);
        const text = await ask(page, 'do I have any warnings', 'en');
        assert.match(text, /You have no unread notifications\./);
        await shot(page, 'desktop-03-demo-no-notifications');
      });
      await context.close();
    }

    if (phase === 'data') {
      const unreadBefore = {};
      for (const size of (process.env.QA9_SIZES || 'desktop,phone').split(',')) {
        const { context, page } = await open('demo', size);
        const api = (p) => page.evaluate(async (url) => (await fetch(url, { cache: 'no-store' })).json(), p);
        if (size === 'desktop') unreadBefore.n = (await api('/api/notifications/unread-count')).count;

        await check(`[${size}] "Warnings for you" card appears on open with the unread count and top 3 titles`, async () => {
          await card(page).waitFor({ timeout: 20000 });
          const text = await card(page).innerText();
          assert.match(text, /Warnings for you/);
          assert.match(text, /4 unread warnings/);
          assert.match(text, /QA9 FIXTURE Heavy rain expected tomorrow/);
          assert.equal(await card(page).locator('li').count(), 3);
          assert.equal(await page.evaluate(() => window.__spoken.length), 0, 'nothing may be spoken before a click');
          await shot(page, `${size}-10-warnings-card`);
        });

        await check(`[${size}] "Read my warnings" speaks only after a click, using the browser voice`, async () => {
          await card(page).getByRole('button', { name: 'Read my warnings' }).click();
          const spoken = await page.evaluate(() => window.__spoken);
          assert.equal(spoken.length, 1);
          assert.match(spoken[0].text, /You have 4 unread warnings\. Latest: QA9 FIXTURE Heavy rain expected tomorrow/);
          assert.equal(spoken[0].lang, 'en-US');
          return { spoken: spoken[0].text };
        });

        for (const [slug, question, expected, label] of [
          ['farms', 'which farms do I have', /You have 1 farm: Golden rice \(1 field\)\./, 'Your farms'],
          ['spend', 'how much did I spend this month', /Your confirmed expenses this month: PKR [\d,]+\.00 in \d+ entries\./, 'Your confirmed expenses'],
          ['warnings', 'do I have any warnings', /You have 4 unread notifications\. By type: .*Latest: "QA9 FIXTURE Heavy rain expected tomorrow"/, 'Your notifications'],
        ])
          await check(`[${size}] typed English "${question}" -> deterministic account answer with the "From your account" chip`, async () => {
            const text = await ask(page, question, 'en');
            assert.match(text, expected);
            assert.match(await chip(page).innerText(), /From your account/);
            assert.match(await lastAnswer(page).innerText(), new RegExp(label));
            assert.equal(await lastAnswer(page).getByText('Sources', { exact: true }).count(), 0, 'no knowledge citations on account answers');
            assert.equal(await overflow(page), false, 'horizontal overflow');
            await shot(page, `${size}-11-${slug}`);
            return { answer: text.slice(0, 160) };
          });

        await check(`[${size}] fields, crop seasons, category and latest expenses`, async () => {
          assert.match(await ask(page, 'what are my fields', 'en'), /rangeel pur field on farm Golden rice/);
          assert.match(await ask(page, 'which crops do I have', 'en'), /Rice on rangeel pur field \(Golden rice\), active/);
          assert.match(await ask(page, 'my expenses by category', 'en'), /Labour PKR 2,500\.00/);
          assert.match(await ask(page, 'show my latest expenses', 'en'), /\d{4}-\d{2}-\d{2} \w+ PKR/);
        });

        if (size === 'desktop') {
          await check('[desktop] Urdu script, Roman Urdu and Hindi questions are answered in the question language', async () => {
            const ur = await ask(page, 'میرے کون سے فارم ہیں', 'ur');
            assert.match(ur, /Golden rice/);
            assert.match(ur, /آپ کے 1 فارم ہیں/);
            await shot(page, 'desktop-12-urdu-farms');
            const urSpend = await ask(page, 'اس مہینے میں نے کتنا خرچ کیا', 'ur');
            assert.match(urSpend, /PKR [\d,]+\.00/);
            const roman = await ask(page, 'koi warning hai', 'en');
            assert.match(roman, /You have 4 unread notifications/);
            const hi = await ask(page, 'मेरे कौन से फार्म हैं', 'hi');
            assert.match(hi, /आपके 1 फार्म हैं/);
            const hiSpend = await ask(page, 'इस महीने मैंने कितना खर्च किया', 'hi');
            assert.match(hiSpend, /PKR [\d,]+\.00/);
            const hiWarn = await ask(page, 'क्या मेरे लिए कोई चेतावनी है', 'hi');
            assert.match(hiWarn, /आपकी 4 अपठित सूचनाएं हैं/);
            await shot(page, 'desktop-13-hindi-warnings');
            await chat(page).getByLabel('Language').selectOption('en');
          });

          await check('[desktop] knowledge question is unchanged: no approved guidance -> abstention, no account chip', async () => {
            const text = await ask(page, 'when should I sow wheat', 'en');
            assert.match(text, /I do not have approved guidance/);
            assert.equal(await chip(page).count(), 0);
            assert.match(await lastAnswer(page).innerText(), /No approved guidance found/);
          });

          await check('[desktop] mixed advice question with the stub model: facts plus a note that advice needs approved knowledge', async () => {
            const text = await ask(page, 'should I irrigate my rice field after this alert?', 'en');
            assert.match(text, /You have 4 unread notifications/);
            assert.match(text, /advice on what to do needs approved agriculture guidance/);
            assert.match(await chip(page).innerText(), /From your account/);
            await shot(page, 'desktop-14-mixed-advice');
          });

          await check('[desktop] answers are stored with their source type and survive a reload', async () => {
            await page.reload();
            await chat(page).locator('article').first().waitFor({ timeout: 20000 });
            assert.ok((await chat(page).getByTestId('account-chip').count()) >= 10);
            await shot(page, 'desktop-15-history-after-reload');
          });

          await check('[desktop] dismissing the card hides it; the assistant never marks notifications read', async () => {
            await card(page).getByRole('button', { name: 'Dismiss warnings' }).click();
            await card(page).waitFor({ state: 'detached', timeout: 5000 });
            assert.equal((await api('/api/notifications/unread-count')).count, unreadBefore.n);
          });

          await check('[desktop] Listen on an account answer speaks that answer after a click', async () => {
            await page.evaluate(() => { window.__spoken.length = 0; });
            await chat(page).getByRole('button', { name: 'Listen' }).first().click();
            assert.equal(await page.evaluate(() => window.__spoken.length), 1);
          });

          if (process.env.QA9_VOICE_AUDIO)
            await check('[desktop] VOICE path (synthetic English clip + fake mic): record -> real transcription -> Ask -> account answer', async () => {
              const voice = page.getByRole('heading', { name: 'Ask FasalGuard by voice' }).locator('..');
              await voice.getByLabel('Language').selectOption('en');
              const box = voice.getByLabel(/I consent/);
              await box.waitFor({ timeout: 20000 });
              if (!(await box.isChecked())) await box.click();
              await voice.getByRole('button', { name: 'Start recording' }).click();
              await voice.getByRole('button', { name: 'Stop recording' }).waitFor({ timeout: 10000 });
              await page.waitForTimeout(7000);
              await voice.getByRole('button', { name: 'Stop recording' }).click();
              const editor = voice.getByLabel('Editable transcript');
              await page.waitForFunction((el) => el && el.value.trim().length > 0, await editor.elementHandle(), { timeout: 60000 });
              const transcript = await editor.inputValue();
              assert.match(transcript, /farm/i, `transcript was: ${transcript}`);
              await chat(page).getByLabel('Language').selectOption('en');
              const before = await chat(page).locator('article').count();
              await chat(page).getByRole('button', { name: 'Ask', exact: true }).click();
              await page.waitForFunction((n) => document.querySelectorAll('section[aria-labelledby="chat-heading"] article').length >= n + 2, before, { timeout: 30000 });
              const answer = (await lastAnswer(page).innerText()).replace(/\s+/g, ' ');
              assert.match(answer, /Golden rice/);
              assert.match(await chip(page).innerText(), /From your account/);
              await shot(page, 'desktop-16-voice-account-answer');
              return { transcript, answer: answer.slice(0, 120) };
            });
        }
        await context.close();
      }

      // Isolation in the browser: the new empty farmer must not see any demo data.
      const { context, page } = await open('empty', 'desktop');
      await check('[desktop] a second farmer sees none of the demo farmer data in answers or the card', async () => {
        await card(page).waitFor({ timeout: 20000 });
        assert.doesNotMatch(await card(page).innerText(), /QA9 FIXTURE|Golden rice/);
        const farms = await ask(page, 'which farms do I have', 'en');
        assert.doesNotMatch(farms, /Golden rice/);
        const spend = await ask(page, 'how much did I spend this month', 'en');
        assert.match(spend, /no confirmed expenses/);
        const warn = await ask(page, 'do I have any warnings', 'en');
        assert.doesNotMatch(warn, /QA9 FIXTURE/);
      });
      await context.close();
    }
  } finally {
    await browser.close();
    const failed = results.filter((r) => r.status !== 'PASS');
    fs.writeFileSync(path.join(shots, `results-${phase}${process.env.QA9_SIZES ? '-' + process.env.QA9_SIZES.replace(/,/g, '_') : ''}.json`), JSON.stringify({ phase, at: new Date().toISOString(), results }, null, 2));
    for (const r of results) console.log(`${r.status}  ${r.name}${r.detail && r.status !== 'PASS' ? ` -- ${typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)}` : ''}`);
    console.log(`${results.length - failed.length}/${results.length} passed`);
    process.exitCode = failed.length ? 1 : 0;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
