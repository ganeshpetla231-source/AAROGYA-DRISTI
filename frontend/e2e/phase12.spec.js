import { test, expect } from '@playwright/test';
import { signIn } from './auth.helpers.js';

test('floating AI voice assistant handles multilingual speech and typed questions safely', async ({ page }) => {
  await page.addInitScript(() => {
    class MockRecognition {
      start() { window.__assistantRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    }
    class MockAudioContext {
      state = 'running';
      createAnalyser() { return { fftSize: 256, getByteTimeDomainData(samples) { samples.fill(150); } }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { this.state = 'closed'; return Promise.resolve(); }
    }
    window.SpeechRecognition = MockRecognition;
    window.AudioContext = MockAudioContext;
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel() {}, speak(utterance) { window.__spokenMessages = [...(window.__spokenMessages || []), utterance.text]; } }
    });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => ({ getTracks: () => [{ stop() {} }] })
    });
  });
  await page.route('**/api/assistant/message', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'success', data: { message: 'Rinse gently with clean water. Seek professional care if the sore persists or worsens.', language: 'en', safetyNotice: 'General oral-health education only.' } })
  }));
  await page.route('**/api/auth/language', route => {
    const { language } = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: { user: { language } } })
    });
  });
  await signIn(page, 'patient.demo@aarogya.test');
  await page.getByRole('button', { name: 'Open AI voice assistant' }).click();
  const panel = page.locator('.assistant-widget-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Start speaking' }).click();
  await expect(panel.locator('.assistant-widget-waveform')).toBeVisible();
  await page.evaluate(() => {
    const words = [{ transcript: 'How do I care for a mouth ulcer?' }];
    words.isFinal = true;
    window.__assistantRecognition.onresult({ resultIndex: 0, results: [words] });
  });
  await expect(panel.locator('.assistant-widget-message.is-user')).toContainText('How do I care for a mouth ulcer?');
  await expect(panel.locator('.assistant-widget-message.is-assistant')).toContainText('Seek professional care');
  await panel.getByRole('button', { name: 'Replay response' }).click();
  await expect.poll(() => page.evaluate(() => window.__spokenMessages?.length || 0)).toBeGreaterThanOrEqual(2);

  await panel.getByRole('button', { name: 'Stop listening' }).click();
  await panel.locator('input').fill('What should I do about a white patch?');
  await panel.getByRole('button', { name: 'Send message' }).click();
  await expect(panel.locator('.assistant-widget-message.is-user').last()).toContainText('What should I do about a white patch?');
  await panel.getByRole('button', { name: /Mute spoken responses/ }).click();
  await expect(panel.getByRole('button', { name: /Unmute spoken responses/ })).toBeVisible();
  await panel.locator('select').selectOption('te');
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await panel.locator('.assistant-widget-clear').click();
  await expect(panel.locator('.assistant-widget-message')).toHaveCount(0);
});

test('floating AI voice assistant explains microphone permission failures and keeps text input available', async ({ page }) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class { start() {} stop() {} };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }
    });
  });
  await signIn(page, 'patient.demo@aarogya.test');
  await page.getByRole('button', { name: 'Open AI voice assistant' }).click();
  const panel = page.locator('.assistant-widget-panel');
  await panel.getByRole('button', { name: 'Start speaking' }).click();
  await expect(panel.getByRole('alert')).toContainText('Microphone access was denied');
  await expect(panel.locator('input')).toBeEnabled();
});

test('floating AI voice assistant keeps typed fallback when speech recognition is unavailable and reports network failures', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  await page.route('**/api/assistant/message', route => route.abort('failed'));
  await signIn(page, 'patient.demo@aarogya.test');
  await page.getByRole('button', { name: 'Open AI voice assistant' }).click();
  const panel = page.locator('.assistant-widget-panel');
  await expect(panel.locator('input')).toBeEnabled();
  await panel.locator('input').fill('How can I keep my mouth healthy?');
  await panel.getByRole('button', { name: 'Send message' }).click();
  await expect(panel.getByRole('alert')).toContainText('The AI assistant could not respond');
  await expect(panel.locator('input')).toBeEnabled();
});

test('public patient registration requires a mobile number and uses OTP verification', async ({ page }) => {
  await page.goto('/#/login?mode=register');
  await expect(page.locator('select[name="role"]')).toHaveCount(0);
  await expect(page.getByLabel('Staff registration code')).toHaveCount(0);
  await expect(page.getByText('Patients can self-register. Staff and administrator accounts are created or approved by an administrator.')).toBeVisible();

  await expect(page.getByLabel('Mobile number')).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByRole('button', { name: /Send verification code/ })).toBeVisible();
  await expect(page.locator('#auth-password')).toHaveCount(0);
});

test('topic landing shows the scan dashboard, opens its analysis dialog, and supports all topic routes', async ({ page }) => {
  const topics = [
    ['ai-lesion-detection', 'AI-Assisted Oral Lesion Detection'],
    ['oral-health-education', 'Oral Health Education'],
    ['doctor-dashboard', 'Doctor Dashboard'],
    ['voice-assistant', 'Voice Assistant'],
    ['telemedicine', 'Telemedicine and Appointments'],
    ['maps-navigation', 'Maps and Navigation'],
    ['patient-qr', 'Digital Prescription and QR Code System'],
    ['authentication-roles', 'Authentication and Roles'],
    ['notifications-analytics', 'Notifications and Analytics'],
    ['security-deployment', 'Security and Deployment']
  ];

  await page.goto('/');
  const homeInfographic = page.locator('.topic-home-scan-image');
  await expect(homeInfographic).toBeVisible();
  await expect(homeInfographic).toHaveAttribute('src', '/images/oral-screening-infographic.png');
  await expect(homeInfographic).toHaveAttribute('alt', /fictional.*not a real screening or diagnosis/i);
  await expect.poll(() => homeInfographic.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.topic-radial-card')).toHaveCount(11);
  await expect(page.locator('.topic-brand')).toBeVisible();
  await expect(page.getByText(/AI result and confidence score shown are fictional/)).toBeVisible();
  await page.locator('.topic-mouth-button').click();
  const scanDialog = page.getByRole('dialog', { name: 'Oral screening overview' });
  await expect(scanDialog).toBeVisible();
  for (const title of ['Mouth Ulcer', 'Inflammation', 'Infection', 'Abnormality', 'Risk Alert']) {
    await expect(scanDialog.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(scanDialog.getByText(/Demonstration artwork only/)).toBeVisible();
  await scanDialog.getByRole('button', { name: 'Close screening overview' }).click();
  await expect(scanDialog).toHaveCount(0);
  await expect(page.locator('.topic-mouth-button')).toBeFocused();
  await page.locator('.topic-mouth-button').click();
  await expect(scanDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(scanDialog).toHaveCount(0);
  await expect(page.locator('.topic-radial-card')).toHaveCount(11);
  for (const title of ['Mouth Health Scan', 'Symptoms Checker', 'Oral Diseases Information', 'AI-Assisted Screening', 'Doctor Consultation', 'Appointments', 'Patient Medical History', 'Precautions and Health Tips', 'Screening Reports', 'Nearby Hospitals and PHCs', 'Offline Accessibility Mode']) {
    await expect(page.locator('.topic-radial-card').filter({ hasText: title })).toBeVisible();
  }
  await expect(page.getByText(/Project Planning and Architecture|Frontend UI Design|Backend and MongoDB/)).toHaveCount(0);

  for (const [index, [slug, title]] of topics.entries()) {
    await page.goto(`/#/topics/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const topicImage = page.locator('.topic-visual-image');
    await topicImage.evaluate(image => image.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(topicImage).toHaveAttribute('alt', /.+/);
    await expect.poll(() => topicImage.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.topic-implementation-status')).toBeVisible();
    await expect(page.getByRole('link', { name: /View original illustration/ })).toHaveAttribute('href', /\/images\/topics\/.+\.svg/);
    if (index === 0) {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
  }

  for (const slug of ['project-planning', 'frontend-design', 'backend-mongodb']) {
    await page.goto(`/#/topics/${slug}`);
    await expect(page.getByRole('heading', { name: 'Topic not found' })).toBeVisible();
  }
});

test('module selection animates the oral scan before navigating to the real module', async ({ page }) => {
  await page.goto('/');
  const moduleButton = page.getByRole('button', { name: /Symptoms Checker/ });
  await moduleButton.click();
  await expect(moduleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.topic-radial-stage')).toHaveClass(/is-opening/);
  await expect(page.locator('.topic-mouth-button')).toHaveClass(/is-scanning/);
  await expect(page).toHaveURL(/\/login\?module=symptoms-checker/);
});

test('voice and offline controls still open their existing functional panels', async ({ page }) => {
  await page.goto('/');
  await page.locator('.voice-dock-trigger').click();
  await expect(page.locator('.voice-assistant-panel')).toBeVisible({ timeout: 5000 });
  await page.locator('.offline-status-trigger').click();
  await expect(page.locator('#offline-accessibility-panel')).toBeVisible({ timeout: 5000 });
});

test('symptom module routes to safe, non-persisted symptom guidance after authentication', async ({ page }) => {
  await signIn(page, 'patient.demo@aarogya.test', undefined, '/#/login?module=symptoms-checker');
  await expect(page).toHaveURL(/\/patient\/dashboard\?voicePage=symptoms-checker/);
  await expect(page.getByRole('heading', { name: 'Symptoms Checker' })).toBeVisible();
  await page.getByLabel('Mouth ulcer or sore').check();
  await expect(page.getByText(/This selection is not saved or sent/)).toBeVisible();
});

test('topic content localizes and fits a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/topics/ai-lesion-detection');
  await expect(page.getByRole('heading', { name: 'AI-Assisted Oral Lesion Detection' })).toBeVisible();
  await page.locator('.topic-language select').selectOption('te');
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await expect(page.getByRole('heading', { level: 1, name: 'AI సహాయంతో నోటి గాయాల స్క్రీనింగ్' })).toBeVisible();
  await expect(page.locator('.topic-visual-image')).toHaveAttribute('alt', /వైద్యేతర నోటి చిత్రం/);
  await expect(page.getByRole('heading', { name: 'నోటి ఆరోగ్యం: అవగాహన, పరీక్ష' })).toBeVisible();
  await page.getByRole('button', { name: 'అంశాలకు తిరిగి వెళ్లండి' }).click();
  await expect(page.locator('.topic-radial-card')).toHaveCount(11);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(391);
  const moduleCardsFit = await page.locator('.topic-radial-card').evaluateAll(cards => cards.every(card => {
    const bounds = card.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth;
  }));
  expect(moduleCardsFit).toBe(true);
});

test('floating voice and connectivity controls stack on the right and panels are exclusive', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 900, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/topics/telemedicine');
    const layout = await page.evaluate(() => {
      const voice = document.querySelector('.voice-dock').getBoundingClientRect();
      const offline = document.querySelector('.offline-accessibility').getBoundingClientRect();
      return {
        voiceRight: voice.right,
        offlineRight: offline.right,
        verticalOrder: voice.bottom <= offline.top,
        gap: offline.top - voice.bottom,
        withinViewport: offline.right <= innerWidth && offline.bottom <= innerHeight,
        separated: voice.right <= offline.left || offline.right <= voice.left || voice.bottom <= offline.top || offline.bottom <= voice.top
      };
    });
    expect(viewport.width - layout.voiceRight).toBeLessThanOrEqual(20);
    expect(viewport.width - layout.offlineRight).toBeLessThanOrEqual(20);
    expect(layout.verticalOrder).toBe(true);
    expect(layout.gap).toBeGreaterThanOrEqual(8);
    expect(layout.withinViewport).toBe(true);
    expect(layout.separated).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/topics/telemedicine');
  await expect(page.locator('.offline-status-trigger')).toBeVisible();
  await expect(page.locator('.voice-dock-trigger')).toBeVisible();
  await page.locator('.offline-status-trigger').click();
  await expect(page.locator('#offline-accessibility-panel')).toBeVisible();
  const panelLayout = await page.locator('#offline-accessibility-panel').evaluate(panel => {
    const bounds = panel.getBoundingClientRect();
    const voice = document.querySelector('.voice-dock-trigger').getBoundingClientRect();
    const status = document.querySelector('.offline-status-trigger').getBoundingClientRect();
    const overlaps = rectangle => bounds.left < rectangle.right && bounds.right > rectangle.left && bounds.top < rectangle.bottom && bounds.bottom > rectangle.top;
    return { left: bounds.left, right: bounds.right, viewportWidth: innerWidth, voiceOverlaps: overlaps(voice), statusOverlaps: overlaps(status) };
  });
  expect(panelLayout.left).toBeGreaterThanOrEqual(0);
  expect(panelLayout.right).toBeLessThanOrEqual(panelLayout.viewportWidth);
  expect(panelLayout.voiceOverlaps).toBe(false);
  expect(panelLayout.statusOverlaps).toBe(false);
  await page.locator('.voice-dock-trigger').click();
  await expect(page.locator('#offline-accessibility-panel')).toHaveCount(0);
  await expect(page.locator('.voice-assistant-panel')).toBeVisible();
});

test('persistent voice assistant routes typed commands and changes language', async ({ page }) => {
  await page.goto('/');
  await page.locator('.voice-dock-trigger').click();
  await expect(page.locator('.voice-assistant-panel')).toBeVisible();
  await page.getByLabel('Type a voice command').fill('explain oral cancer symptoms');
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page).toHaveURL(/\/topics\/ai-lesion-detection/);
  await expect(page.getByRole('heading', { name: 'AI-Assisted Oral Lesion Detection' })).toBeVisible();
  await expect(page.locator('.voice-assistant-panel')).toBeVisible();

  await page.getByLabel('Type a voice command').fill('change language to Telugu');
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await expect(page.getByRole('heading', { name: 'AI సహాయంతో నోటి గాయాల స్క్రీనింగ్' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'నోటి ఆరోగ్యం: అవగాహన, పరీక్ష' })).toBeVisible();
});

test('Gemini Live chat keeps turn history and handles provider audio transcripts', async ({ page }) => {
  await page.addInitScript(() => {
    class MockGeminiSocket {
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) {
        this.url = url;
        this.readyState = 0;
        window.__geminiLiveSocketUrl = url;
        window.__geminiSockets ||= [];
        window.__geminiSetups ||= [];
        window.__geminiSockets.push(this);
        setTimeout(() => {
          this.readyState = MockGeminiSocket.OPEN;
          this.onopen?.({});
        }, 0);
      }

      send(data) {
        const message = JSON.parse(data);
        if (message.setup) {
          window.__geminiSetups.push(message.setup);
          const handle = `resume-handle-${window.__geminiSetups.length}`;
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: handle } }) });
            this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
          }, 0);
          return;
        }
        if (message.realtimeInput?.text) {
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify({ serverContent: { outputTranscription: { text: 'Aarogya Drishti shares oral-health education and helps connect users with care.' } } }) });
            this.onmessage?.({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
          }, 0);
        }
      }

      close() {
        this.readyState = MockGeminiSocket.CLOSED;
        this.onclose?.({});
      }
    }

    window.WebSocket = MockGeminiSocket;
  });
  const tokenLanguages = [];
  await page.route('**/api/assistant/live-token', route => {
    tokenLanguages.push(route.request().postDataJSON().language);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: { token: 'short-lived-test-token', model: 'gemini-3.8-live' } })
    });
  });
  await signIn(page, 'patient.demo@aarogya.test');
  await page.locator('.voice-dock-trigger').click();
  await page.locator('.voice-language-picker select').selectOption('hi');
  const speed = page.locator('.voice-speed-control input');
  await speed.focus();
  await speed.press('ArrowRight');
  await expect(speed).toHaveValue('1.25');
  await page.locator('.voice-command-form input').fill('How does Aarogya Drishti help patients?');
  await page.locator('.voice-command-form button[type="submit"]').click();
  await expect(page.locator('.voice-conversation-message.is-user')).toContainText('How does Aarogya Drishti help patients?');
  await expect(page.locator('.voice-conversation-message.is-assistant')).toContainText('connect users with care');
  const liveUrl = await page.evaluate(() => window.__geminiLiveSocketUrl);
  expect(liveUrl).toContain('access_token=short-lived-test-token');
  expect(liveUrl).not.toContain('GEMINI_API_KEY');
  const firstSetup = await page.evaluate(() => window.__geminiSetups[0]);
  expect(tokenLanguages[0]).toBe('hi');
  expect(firstSetup.contextWindowCompression).toEqual({ triggerTokens: 25000, slidingWindow: { targetTokens: 8000 } });
  expect(firstSetup.sessionResumption).toEqual({});
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');

  await page.evaluate(() => window.__geminiSockets[0].close());
  await page.locator('.voice-command-form input').fill('What is a simple mouth care routine?');
  await page.locator('.voice-command-form button[type="submit"]').click();
  await expect(page.locator('.voice-conversation-message.is-user')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__geminiSetups.length)).toBe(2);
  expect(await page.evaluate(() => window.__geminiSetups[1].sessionResumption.handle)).toBe('resume-handle-1');
  await page.locator('.voice-reset-control').click();
  await expect(page.locator('.voice-conversation-message')).toHaveCount(0);
  await page.locator('.voice-command-form input').fill('Start a new conversation.');
  await page.locator('.voice-command-form button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => window.__geminiSetups.length)).toBe(3);
  expect(await page.evaluate(() => window.__geminiSetups[2].sessionResumption)).toEqual({});
});

test('voice mode streams microphone PCM and plays Gemini audio without browser speech recognition', async ({ page }) => {
  await page.addInitScript(() => {
    class MockGeminiSocket {
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) {
        this.url = url;
        this.readyState = 0;
        window.__geminiAudioFrameCount = 0;
        setTimeout(() => {
          this.readyState = MockGeminiSocket.OPEN;
          this.onopen?.({});
        }, 0);
      }

      send(data) {
        const message = JSON.parse(data);
        if (message.setup) {
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) }), 0);
        } else if (message.realtimeInput?.audio) {
          window.__geminiAudioFrameCount += 1;
          if (window.__geminiAudioFrameCount === 1) {
            const pcm = btoa(String.fromCharCode(...new Uint8Array(48000)));
            setTimeout(() => {
              this.onmessage?.({ data: JSON.stringify({ serverContent: { inputTranscription: { text: 'How can Aarogya Drishti help?' } } }) });
              this.onmessage?.({ data: JSON.stringify({ serverContent: { outputTranscription: { text: 'It offers health education and connects people with care.' } } }) });
              this.onmessage?.({ data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm } }] } } }) });
              this.onmessage?.({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
            }, 0);
          }
        }
      }

      close() {
        this.readyState = MockGeminiSocket.CLOSED;
        this.onclose?.({});
      }
    }

    window.WebSocket = MockGeminiSocket;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const context = new AudioContext();
          await context.resume();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const destination = context.createMediaStreamDestination();
          gain.gain.value = 0.15;
          oscillator.connect(gain);
          gain.connect(destination);
          oscillator.start();
          window.__fakeMicCleanup = () => { oscillator.stop(); void context.close(); };
          return destination.stream;
        }
      }
    });
  });
  await page.route('**/api/assistant/live-token', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'success', data: { token: 'short-lived-test-token', model: 'gemini-3.8-live' } })
  }));
  await signIn(page, 'patient.demo@aarogya.test');
  await page.locator('.voice-dock-trigger').click();
  await page.locator('.voice-language-picker select').selectOption('en');
  await page.locator('.assistant-mode-toggle button').nth(1).click();
  await expect(page.locator('.voice-conversation-message.is-user')).toContainText('How can Aarogya Drishti help?');
  await expect(page.locator('.voice-conversation-message.is-assistant')).toContainText('connects people with care');
  await expect(page.locator('.assistant-speaking-indicator')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__geminiAudioFrameCount)).toBeGreaterThan(0);
  await page.locator('.voice-primary-control').click();
  await page.evaluate(() => window.__fakeMicCleanup?.());
});

test('voice mode explains a denied microphone permission without starting a session', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) }
    });
  });
  await signIn(page, 'patient.demo@aarogya.test');
  await page.locator('.voice-dock-trigger').click();
  await page.locator('.voice-language-picker select').selectOption('en');
  await page.locator('.assistant-mode-toggle button').nth(1).click();
  await expect(page.getByRole('alert')).toContainText('Microphone permission was denied');
});

test('text chat explains when the Gemini backend key is not configured', async ({ page }) => {
  await page.route('**/api/assistant/live-token', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'error', message: 'Gemini voice is not configured. Set GEMINI_API_KEY on the backend.' })
  }));
  await signIn(page, 'patient.demo@aarogya.test');
  await page.locator('.voice-dock-trigger').click();
  await page.locator('.voice-language-picker select').selectOption('en');
  await page.locator('.voice-command-form input').fill('How does this app support oral health?');
  await page.locator('.voice-command-form button[type="submit"]').click();
  await expect(page.getByRole('alert')).toContainText('Add GEMINI_API_KEY to backend/.env');
});

test('voice-guided patient entry confirms each field without submitting', async ({ page }) => {
  await signIn(page, 'lakshmi.demo@aarogya.test');
  if (!(await page.locator('.voice-assistant-panel').isVisible())) {
    await page.getByRole('button', { name: 'Open voice assistant' }).click();
  }
  await page.getByLabel('Type a voice command').fill('register a new patient');
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page).toHaveURL(/\/app\/asha\?voicePage=patients&voiceAction=add-patient/);
  const form = page.locator('.patient-create');
  await expect(form).toBeVisible();

  for (const [value, fieldName] of [
    ['Voice Test Patient', 'name'],
    ['VOICE-TEST-01', 'patientId'],
    ['Test Village', 'village']
  ]) {
    await page.getByLabel('Type a voice command').fill(value);
    await page.getByRole('button', { name: 'Send command' }).click();
    await expect(page.locator('.voice-readback-value')).toHaveText(value);
    await page.getByRole('button', { name: 'Confirm value' }).click();
    await expect(form.locator(`input[name="${fieldName}"]`)).toHaveValue(value);
  }
  await expect(page.getByText('The required fields are filled. Review them and press Save yourself when ready. I have not submitted the form.')).toBeVisible();
  await expect(form.locator('button').first()).toBeVisible();
});

test('patient route redirects away from another role and dashboard fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'patient.demo@aarogya.test');
  await expect(page.getByText('Synthetic data for demonstration. Not for clinical use.')).toBeVisible();
  await page.goto('/#/app/doctor');
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(391);
});

test('role dashboards use their role URLs and patient profile is scoped to the signed-in patient', async ({ page }) => {
  await signIn(page, 'patient.demo@aarogya.test');
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('heading', { name: 'Patient profile' })).toBeVisible();
  await expect(page.locator('.patient-id-badge strong')).toContainText('AD-');
  await page.goto('/#/admin/dashboard');
  await expect(page).toHaveURL(/\/patient\/dashboard/);
});

test('doctor and admin users reach their own dashboards', async ({ page }) => {
  await signIn(page, 'ananya.demo@aarogya.test');
  await expect(page).toHaveURL(/\/doctor\/dashboard/);
});

test('administrator dashboard exposes its navigation and healthcare workflows', async ({ page }) => {
  test.skip(!process.env.INITIAL_ADMIN_EMAIL || !process.env.INITIAL_ADMIN_PASSWORD, 'Provision an administrator for the E2E environment.');
  await signIn(page, process.env.INITIAL_ADMIN_EMAIL, 'admin');
  await expect(page).toHaveURL(/\/admin\/dashboard/);

  const nav = page.locator('.sidebar nav');
  const buttons = nav.locator('button');
  const labels = await buttons.evaluateAll(items => items.map(item => {
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.nav-icon, .nav-count').forEach(child => child.remove());
    return clone.textContent.trim();
  }));
  const expected = [
    'Overview', 'Patient Management', 'Healthcare Workers', 'Referrals', 'Facility Management',
    'Government Hospitals', 'Video Consultation Management', 'Content Management',
    'Reports & Analytics', 'Admin Management', 'Notifications', 'Settings'
  ];
  expect(labels).toEqual(expected);

  await expect(page.locator('.admin-overview-stats .admin-overview-stat')).toHaveCount(7);
  await expect(page.locator('.role-dashboard-greeting')).toContainText('Welcome back');
  await expect(page.locator('.role-admin-hero h1')).toContainText('AAROGYA');
  await expect(page.locator('.admin-overview-actions .role-overview-action')).toHaveCount(4);
  for (const label of expected) {
    const item = buttons.filter({ hasText: label });
    await item.click();
    await expect(item).toHaveClass(/nav-current/);
    if (label !== 'Overview') await expect(page.locator('.page-heading h1')).toHaveText(label);
  }

  await buttons.filter({ hasText: 'Healthcare Workers' }).click();
  await expect(page.getByRole('heading', { name: 'Doctor approvals' })).toBeVisible();
  await page.getByRole('button', { name: 'Staff management' }).click();
  await expect(page.getByRole('heading', { name: 'Create a staff account' })).toBeVisible();

  await buttons.filter({ hasText: 'Admin Management' }).click();
  await expect(page.getByRole('heading', { name: 'Administrator accounts' })).toBeVisible();
});

test('dashboard overview does not display a hero image on desktop or mobile', async ({ page }) => {
  await signIn(page, 'patient.demo@aarogya.test');
  await expect(page.locator('.overview-hero-image')).toHaveCount(0);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.overview-hero')).toBeHidden();
  }
});

test('district dashboard loads aggregate analytics and facility filter', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const analyticsResponse = page.waitForResponse(response => response.url().includes('/api/analytics'));
  await signIn(page, 'district.demo@aarogya.test');
  const response = await analyticsResponse;
  expect(response.ok()).toBeTruthy();
  await expect(page.getByText('Aggregate statistics only')).toBeVisible();
  const registeredCard = page.locator('.analytics-stat-grid .stat-card').first();
  await expect(registeredCard).toContainText('5');
  await page.locator('.analytics-filters select').first().selectOption({ label: 'District Dental Clinic · District Hospital' });
  await expect(registeredCard).toContainText('1');
  await expect(page.getByText('NO PATIENT MARKERS')).toBeVisible();
});

test('language selection updates the dashboard and persists across navigation and reload', async ({ page }) => {
  await signIn(page, 'patient.demo@aarogya.test');
  await expect(page.locator('.dashboard-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
  await page.locator('.language-selector select').selectOption('te');
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await expect(page.getByRole('button', { name: 'సారాంశం' })).toBeVisible();

  await page.locator('.language-selector select').selectOption('hi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.getByRole('button', { name: 'अवलोकन' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aarogya-language'))).toBe('hi');

  await page.locator('.sidebar nav').getByRole('button', { name: 'सूचनाएँ' }).click();
  await expect(page.getByRole('heading', { name: 'सूचना केंद्र' })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('aarogya-language'));
  await page.reload();
  await expect(page.locator('.language-selector select')).toHaveValue('hi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await page.locator('.language-selector select').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('accessibility preferences persist and translate across the interface', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Open offline and accessibility settings/ }).click();
  await page.getByRole('button', { name: 'Large', exact: true }).click();
  await page.getByLabel('High contrast').check();
  await page.getByLabel('Reduce motion').check();
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await page.locator('.accessibility-language select').selectOption('te');
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
});

test('offline patient registration requires consent and can be discarded locally', async ({ page, context }) => {
  await signIn(page, 'lakshmi.demo@aarogya.test');
  await page.getByRole('button', { name: /Patients/ }).click();
  await page.getByRole('button', { name: /Add patient/ }).click();
  await context.setOffline(true);
  const form = page.locator('.patient-create');
  await form.getByLabel('Full name').fill('Offline Draft Test');
  await form.getByLabel('Patient ID').fill(`OFFLINE-${Date.now()}`);
  await form.getByLabel('Village / town').fill('Offline Test Village');
  await expect(form.locator('input[name="offlineConsent"]')).toHaveAttribute('required', '');
  await form.getByRole('button', { name: 'Save encrypted offline draft' }).click();
  await expect(page.getByRole('button', { name: /Offline, 1/ })).toHaveCount(0);
  await form.locator('input[name="offlineConsent"]').check();
  await form.getByRole('button', { name: 'Save encrypted offline draft' }).click();
  await expect(page.getByRole('button', { name: /Offline, 1/ })).toBeVisible();
  await page.getByRole('button', { name: /Offline, 1/ }).click();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('No offline drafts are waiting to sync.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear all local app data' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear all local app data' }).click();
  await expect(page.getByText('No offline drafts are waiting to sync.')).toBeVisible();
  await context.setOffline(false);
});
