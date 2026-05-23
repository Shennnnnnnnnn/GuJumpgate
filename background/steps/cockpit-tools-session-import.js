(function attachBackgroundCockpitToolsSessionImport(root, factory) {
  root.MultiPageBackgroundCockpitToolsSessionImport = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundCockpitToolsSessionImportModule() {
  const PLUS_CHECKOUT_SOURCE = 'plus-checkout';
  const DEFAULT_COCKPIT_TOOLS_IMPORT_WAIT_MS = 5000;
  const COCKPIT_TOOLS_PLUS_SESSION_POLL_MS = 3000;
  const COCKPIT_TOOLS_BRIDGE_PORT_START = 19528;
  const COCKPIT_TOOLS_BRIDGE_PORT_ATTEMPTS = 100;
  const CHATGPT_SESSION_URL = 'https://chatgpt.com/api/auth/session';
  const COCKPIT_TOOLS_SESSION_RECORDS_PATH = '/cockpit-tools-session-records';

  function createCockpitToolsSessionImportExecutor(deps = {}) {
    const {
      addLog: rawAddLog = async () => {},
      chrome,
      completeNodeFromBackground,
      fetch: fetchApi = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null,
      getTabId,
      isTabAlive,
      buildLocalHelperEndpoint = null,
      registerTab,
      setState = async () => {},
      sleepWithStop = async () => {},
      throwIfStopped = () => {},
      waitForTabCompleteUntilStopped = async () => {},
    } = deps;

    let cachedPlusSessionState = null;

    function addStepLog(step, message, level = 'info', stepKey = 'cockpit-tools-session-import') {
      return rawAddLog(message, level, {
        step,
        stepKey,
      });
    }

    function normalizeString(value = '') {
      return String(value || '').trim();
    }

    function resolveVisibleStep(state = {}, fallbackStep = 7) {
      const visibleStep = Math.floor(Number(state?.visibleStep) || 0);
      return visibleStep > 0 ? visibleStep : fallbackStep;
    }

    function buildCockpitToolsImportEndpoints() {
      return Array.from({ length: COCKPIT_TOOLS_BRIDGE_PORT_ATTEMPTS }, (_item, index) => (
        `http://127.0.0.1:${COCKPIT_TOOLS_BRIDGE_PORT_START + index}/v1/codex/accounts/import`
      ));
    }

    function buildCockpitToolsListEndpoints() {
      return Array.from({ length: COCKPIT_TOOLS_BRIDGE_PORT_ATTEMPTS }, (_item, index) => (
        `http://127.0.0.1:${COCKPIT_TOOLS_BRIDGE_PORT_START + index}/v1/codex/accounts`
      ));
    }

    function buildCockpitToolsDeleteEndpoints() {
      return Array.from({ length: COCKPIT_TOOLS_BRIDGE_PORT_ATTEMPTS }, (_item, index) => (
        `http://127.0.0.1:${COCKPIT_TOOLS_BRIDGE_PORT_START + index}/v1/codex/accounts/delete`
      ));
    }

    function base64UrlDecode(value = '') {
      const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      if (typeof atob === 'function') {
        return atob(padded);
      }
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(padded, 'base64').toString('utf8');
      }
      throw new Error('当前环境不支持 JWT 解码。');
    }

    function decodeJwtPayload(token = '') {
      const parts = String(token || '').split('.');
      if (parts.length < 2 || !parts[1]) {
        return null;
      }
      try {
        return JSON.parse(base64UrlDecode(parts[1]));
      } catch {
        return null;
      }
    }

    function getSessionAccessToken(sessionState = {}) {
      return normalizeString(
        sessionState?.accessToken
        || sessionState?.session?.accessToken
        || sessionState?.session?.access_token
      );
    }

    function isSessionAccessTokenExpired(sessionState = {}, options = {}) {
      const token = getSessionAccessToken(sessionState);
      const payload = decodeJwtPayload(token);
      const exp = Math.floor(Number(payload?.exp) || 0);
      if (!exp) {
        return false;
      }
      const nowSeconds = Math.floor(Number(options.nowMs || Date.now()) / 1000);
      const skewSeconds = Math.max(0, Math.floor(Number(options.skewSeconds) || 300));
      return exp <= nowSeconds + skewSeconds;
    }

    function getSessionEmail(sessionState = {}) {
      return normalizeString(
        sessionState?.session?.user?.email
        || sessionState?.session?.account?.email
        || sessionState?.session?.email
      ).toLowerCase();
    }

    function getSessionAccountId(sessionState = {}) {
      return normalizeString(
        sessionState?.session?.account?.id
        || sessionState?.session?.account_id
      );
    }

    function isOpenAiAccountUnavailableSession(sessionState = {}) {
      const session = sessionState?.session || {};
      const combined = [
        session?.error,
        session?.message,
        session?.detail,
        session?.account?.status,
        session?.account?.state,
      ].map((value) => normalizeString(value).toLowerCase()).filter(Boolean).join(' ');
      return /account.*(?:deleted|disabled|deactivated|suspended)|(?:deleted|disabled|deactivated|suspended).*account|账户.*(?:停用|删除|已删)|账号.*(?:停用|删除|已删)/i.test(combined);
    }

    async function fetchFirstJsonEndpoint(endpoints = [], requestOptions = {}) {
      if (typeof fetchApi !== 'function') {
        throw new Error('当前运行环境不支持 fetch，无法调用 cockpit-tools API。');
      }
      let lastError = '';
      for (const endpoint of endpoints) {
        try {
          const response = await fetchApi(endpoint, requestOptions);
          const responseText = await response.text().catch(() => '');
          const responseJson = responseText ? JSON.parse(responseText) : {};
          if (!response.ok) {
            lastError = `${endpoint}: ${responseJson?.message || responseJson?.error?.message || responseText || `HTTP ${response.status}`}`;
            continue;
          }
          return responseJson;
        } catch (error) {
          lastError = `${endpoint}: ${error?.message || String(error || '请求失败')}`;
        }
      }
      throw new Error(lastError || 'cockpit-tools API 请求失败。');
    }

    async function listCockpitToolsCodexAccounts() {
      const payload = await fetchFirstJsonEndpoint(buildCockpitToolsListEndpoints(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      return Array.isArray(payload?.accounts) ? payload.accounts : [];
    }

    function cockpitAccountNeedsReauth(account = {}) {
      return Boolean(account?.requires_reauth)
        || Boolean(account?.requiresReauth)
        || /reauth|重新登录|重新授权|invalid_grant|refresh_token/i.test(normalizeString(account?.reauth_reason || account?.reauthReason || account?.quota_error?.message));
    }

    async function deleteCockpitToolsCodexAccountByEmail(email = '') {
      const normalizedEmail = normalizeString(email).toLowerCase();
      if (!normalizedEmail) {
        return null;
      }
      return fetchFirstJsonEndpoint(buildCockpitToolsDeleteEndpoints(), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });
    }

    function buildLocalSessionRecordsEndpoint(state = {}) {
      const baseUrl = normalizeString(state?.hotmailLocalBaseUrl);
      if (!baseUrl) {
        return '';
      }
      return typeof buildLocalHelperEndpoint === 'function'
        ? buildLocalHelperEndpoint(baseUrl, COCKPIT_TOOLS_SESSION_RECORDS_PATH)
        : new URL(COCKPIT_TOOLS_SESSION_RECORDS_PATH, `${baseUrl.replace(/\/+$/, '')}/`).toString();
    }

    async function updateLocalSessionRecord(state = {}, action = 'upsert', record = {}) {
      const endpoint = buildLocalSessionRecordsEndpoint(state);
      if (!endpoint || typeof fetchApi !== 'function') {
        return null;
      }
      try {
        const response = await fetchApi(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action, record }),
        });
        return await response.json().catch(() => null);
      } catch (error) {
        await addStepLog(resolveVisibleStep(state, 8), `写入 cockpit-tools session 本地记录失败：${error?.message || error}`, 'warn');
        return null;
      }
    }

    async function syncCockpitToolsReauthStateBeforeImport(state = {}, sessionState = {}, visibleStep) {
      const email = getSessionEmail(sessionState);
      if (!email) {
        return;
      }
      try {
        const accounts = await listCockpitToolsCodexAccounts();
        const account = accounts.find((item) => normalizeString(item?.email).toLowerCase() === email) || null;
        if (account && cockpitAccountNeedsReauth(account)) {
          await addStepLog(visibleStep, `检测到 cockpit-tools 中 ${email} 的 OAuth/session 已失效，将删除旧账号后导入最新 Session。`, 'warn');
          await deleteCockpitToolsCodexAccountByEmail(email);
        }
      } catch (error) {
        await addStepLog(visibleStep, `检查 cockpit-tools 已有账号状态失败，将继续尝试导入最新 Session：${error?.message || error}`, 'warn');
      }
    }

    function isSupportedChatGptSessionUrl(url = '') {
      try {
        const parsed = new URL(String(url || ''));
        if (!/^https?:$/i.test(parsed.protocol)) {
          return false;
        }
        const hostname = String(parsed.hostname || '').trim().toLowerCase();
        return /(^|\.)chatgpt\.com$/.test(hostname)
          || hostname === 'chat.openai.com'
          || /(^|\.)openai\.com$/.test(hostname);
      } catch {
        return false;
      }
    }

    function getSessionTabHostPriority(url = '') {
      try {
        const hostname = String(new URL(String(url || '')).hostname || '').trim().toLowerCase();
        if (/(^|\.)chatgpt\.com$/.test(hostname)) {
          return 0;
        }
        if (hostname === 'chat.openai.com') {
          return 1;
        }
        if (/(^|\.)openai\.com$/.test(hostname)) {
          return 2;
        }
      } catch {
        return Number.POSITIVE_INFINITY;
      }
      return Number.POSITIVE_INFINITY;
    }

    function getSessionTabActivityPriority(tab = {}) {
      if (tab?.active && tab?.currentWindow) {
        return 0;
      }
      if (tab?.active) {
        return 1;
      }
      return 2;
    }

    function pickPreferredSessionTab(tabs = []) {
      const candidates = (Array.isArray(tabs) ? tabs : [])
        .filter((tab) => Number.isInteger(tab?.id) && isSupportedChatGptSessionUrl(tab.url));
      if (!candidates.length) {
        return null;
      }

      return candidates.reduce((best, candidate) => {
        if (!best) {
          return candidate;
        }

        const candidateHostPriority = getSessionTabHostPriority(candidate.url);
        const bestHostPriority = getSessionTabHostPriority(best.url);
        if (candidateHostPriority !== bestHostPriority) {
          return candidateHostPriority < bestHostPriority ? candidate : best;
        }

        const candidateActivityPriority = getSessionTabActivityPriority(candidate);
        const bestActivityPriority = getSessionTabActivityPriority(best);
        if (candidateActivityPriority !== bestActivityPriority) {
          return candidateActivityPriority < bestActivityPriority ? candidate : best;
        }

        const candidateLastAccessed = Number(candidate?.lastAccessed) || 0;
        const bestLastAccessed = Number(best?.lastAccessed) || 0;
        if (candidateLastAccessed !== bestLastAccessed) {
          return candidateLastAccessed > bestLastAccessed ? candidate : best;
        }

        return Number(candidate.id) < Number(best.id) ? candidate : best;
      }, null);
    }

    async function readSupportedSessionTab(tabId) {
      const numericTabId = Number(tabId) || 0;
      if (!numericTabId || !chrome?.tabs?.get) {
        return null;
      }

      const tab = await chrome.tabs.get(numericTabId).catch(() => null);
      return tab?.id && isSupportedChatGptSessionUrl(tab.url)
        ? tab
        : null;
    }

    async function findFallbackSessionTab() {
      if (!chrome?.tabs?.query) {
        return null;
      }

      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      const activeMatch = pickPreferredSessionTab(activeTabs);
      const allTabs = await chrome.tabs.query({}).catch(() => []);
      const globalMatch = pickPreferredSessionTab(allTabs);
      return pickPreferredSessionTab([activeMatch, globalMatch]);
    }

    async function resolveSessionTabId(state = {}) {
      const registeredTabId = typeof getTabId === 'function'
        ? await getTabId(PLUS_CHECKOUT_SOURCE)
        : null;
      if (registeredTabId && typeof isTabAlive === 'function' && await isTabAlive(PLUS_CHECKOUT_SOURCE)) {
        const registeredTab = await readSupportedSessionTab(registeredTabId);
        if (registeredTab?.id) {
          return registeredTab.id;
        }
      }

      const storedTabId = Number(state?.plusCheckoutTabId) || 0;
      const storedTab = await readSupportedSessionTab(storedTabId);
      if (storedTab?.id) {
        if (typeof registerTab === 'function') {
          await registerTab(PLUS_CHECKOUT_SOURCE, storedTab.id);
        }
        return storedTab.id;
      }

      const fallbackTab = await findFallbackSessionTab();
      if (fallbackTab?.id) {
        if (typeof registerTab === 'function') {
          await registerTab(PLUS_CHECKOUT_SOURCE, fallbackTab.id);
        }
        return fallbackTab.id;
      }

      throw new Error('未找到可读取 ChatGPT 会话的标签页，请先打开一个已登录的 ChatGPT / OpenAI 页面，或完成当前 Plus 支付链路。');
    }

    async function getResolvedSessionTab(tabId, visibleStep) {
      const tab = await chrome?.tabs?.get?.(tabId).catch(() => null);
      if (!tab?.id) {
        throw new Error(`步骤 ${visibleStep}：ChatGPT 会话标签页不存在或已关闭，无法继续导入 cockpit-tools。`);
      }
      if (!isSupportedChatGptSessionUrl(tab.url)) {
        throw new Error(`步骤 ${visibleStep}：当前标签页不在 ChatGPT / OpenAI 页面，无法读取当前登录会话。`);
      }
      return tab;
    }

    async function getOrOpenSessionJsonTab(state = {}, visibleStep) {
      let tabId = 0;
      try {
        tabId = await resolveSessionTabId(state);
      } catch {
        tabId = 0;
      }

      let tab = tabId ? await chrome?.tabs?.get?.(tabId).catch(() => null) : null;
      if (!tab?.id && chrome?.tabs?.create) {
        tab = await chrome.tabs.create({ url: CHATGPT_SESSION_URL, active: true });
      }
      if (!tab?.id) {
        throw new Error(`步骤 ${visibleStep}：无法打开 ${CHATGPT_SESSION_URL} 读取 Session JSON。`);
      }

      if (chrome?.tabs?.update) {
        tab = await chrome.tabs.update(tab.id, { url: CHATGPT_SESSION_URL, active: true }).catch(() => tab);
      }
      if (typeof registerTab === 'function') {
        await registerTab(PLUS_CHECKOUT_SOURCE, tab.id);
      }
      await waitForTabCompleteUntilStopped(tab.id);
      await sleepWithStop(500);
      return tab.id;
    }

    async function refreshSessionJsonTab(tabId, visibleStep) {
      if (!chrome?.tabs?.reload) {
        if (!chrome?.tabs?.update) {
          throw new Error(`步骤 ${visibleStep}：当前环境无法刷新 ${CHATGPT_SESSION_URL}。`);
        }
        await chrome.tabs.update(tabId, { url: CHATGPT_SESSION_URL, active: true });
      } else {
        await chrome.tabs.reload(tabId);
      }
      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(500);
    }

    function parseSessionJsonText(text = '', visibleStep) {
      const rawText = normalizeString(text);
      if (!rawText) {
        throw new Error(`步骤 ${visibleStep}：${CHATGPT_SESSION_URL} 未返回可解析的 Session JSON。`);
      }
      try {
        return JSON.parse(rawText);
      } catch {
        const startIndex = rawText.indexOf('{');
        const endIndex = rawText.lastIndexOf('}');
        if (startIndex >= 0 && endIndex > startIndex) {
          try {
            return JSON.parse(rawText.slice(startIndex, endIndex + 1));
          } catch {
            // Fall through to the normalized error below.
          }
        }
      }
      throw new Error(`步骤 ${visibleStep}：${CHATGPT_SESSION_URL} 返回内容不是有效的 Session JSON。`);
    }

    async function readSessionJsonPage(tabId, visibleStep) {
      await waitForTabCompleteUntilStopped(tabId);
      await sleepWithStop(500);
      const tab = await getResolvedSessionTab(tabId, visibleStep);
      if (String(tab.url || '').split('#')[0] !== CHATGPT_SESSION_URL) {
        throw new Error(`步骤 ${visibleStep}：当前标签页未停留在 ${CHATGPT_SESSION_URL}。`);
      }
      if (!chrome?.scripting?.executeScript) {
        throw new Error(`步骤 ${visibleStep}：当前扩展环境不支持读取 Session JSON 页面内容。`);
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const preText = document.querySelector('pre')?.innerText || '';
          const bodyText = document.body?.innerText || document.documentElement?.innerText || '';
          return preText || bodyText;
        },
      });
      const session = parseSessionJsonText(results?.[0]?.result || '', visibleStep);
      const accessToken = normalizeString(session?.accessToken);
      if (!session && !accessToken) {
        throw new Error(`步骤 ${visibleStep}：未读取到有效的 ChatGPT Session JSON 或 accessToken，请确认当前标签页仍处于已登录状态。`);
      }
      return {
        session,
        accessToken,
        capturedAt: Date.now(),
      };
    }

    function getSessionPlanType(sessionState = {}) {
      return normalizeString(sessionState?.session?.account?.planType).toLowerCase();
    }

    function isPayPalCookie(cookie = {}) {
      const domain = normalizeString(cookie?.domain).toLowerCase();
      return domain === 'paypal.com'
        || domain === '.paypal.com'
        || domain.endsWith('.paypal.com');
    }

    function buildCookieRemovalUrl(cookie = {}) {
      const domain = normalizeString(cookie?.domain).replace(/^\./, '');
      const path = normalizeString(cookie?.path) || '/';
      const protocol = cookie?.secure ? 'https:' : 'http:';
      return `${protocol}//${domain}${path.startsWith('/') ? path : `/${path}`}`;
    }

    async function collectPayPalCookies() {
      if (!chrome?.cookies?.getAll) {
        return [];
      }
      const stores = chrome.cookies.getAllCookieStores
        ? await chrome.cookies.getAllCookieStores()
        : [];
      const cookies = [];
      const seen = new Set();
      const storeIds = stores.length ? stores.map((store) => store.id).filter(Boolean) : [null];
      for (const storeId of storeIds) {
        const batch = await chrome.cookies.getAll(storeId ? { storeId } : {});
        for (const cookie of batch || []) {
          if (!isPayPalCookie(cookie)) {
            continue;
          }
          const key = [storeId || '', cookie.domain || '', cookie.path || '', cookie.name || ''].join('\n');
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          cookies.push({ ...cookie, storeId: storeId || cookie.storeId });
        }
      }
      return cookies;
    }

    async function clearPayPalCookiesForLimitedCheckout(visibleStep, stepKey) {
      if (!chrome?.cookies?.getAll || !chrome.cookies?.remove) {
        await addStepLog(visibleStep, 'PayPal 账号受限后仍为 free，但当前浏览器不支持 cookies API，无法清理 PayPal cookies。', 'warn', stepKey);
        return 0;
      }
      const cookies = await collectPayPalCookies();
      let removedCount = 0;
      for (const cookie of cookies) {
        try {
          const result = await chrome.cookies.remove({
            url: buildCookieRemovalUrl(cookie),
            name: cookie.name,
            ...(cookie.storeId ? { storeId: cookie.storeId } : {}),
          });
          if (result) {
            removedCount += 1;
          }
        } catch (error) {
          console.warn('[MultiPage:cockpit-tools-session-import] remove PayPal cookie failed', {
            name: cookie?.name,
            domain: cookie?.domain,
            error: error?.message || error,
          });
        }
      }
      await addStepLog(visibleStep, `PayPal 账号受限后 Session 仍为 free，已清理 ${removedCount} 个 PayPal cookies，准备回到步骤 6 重新创建 Checkout。`, 'warn', stepKey);
      return removedCount;
    }

    async function waitForPlusChatGptSession(tabId, visibleStep, stepKey = 'cockpit-tools-session-ready', state = {}) {
      let attempt = 0;
      while (true) {
        throwIfStopped();
        attempt += 1;
        const sessionState = await readSessionJsonPage(tabId, visibleStep);
        const planType = getSessionPlanType(sessionState);
        if (planType === 'plus') {
          if (attempt > 1) {
            await addStepLog(visibleStep, 'Session JSON 已确认 planType=plus。', 'success', stepKey);
          }
          return sessionState;
        }

        if (planType === 'free' && Number(state?.hostedCheckoutPayPalLimitedAt) > 0) {
          await clearPayPalCookiesForLimitedCheckout(visibleStep, stepKey);
          await setState({
            hostedCheckoutPayPalLimitedAt: null,
            hostedCheckoutPayPalLimitedUrl: '',
          });
          throw new Error('PAYPAL_LIMITED_RESTART_FROM_STEP6::PayPal Hermes 显示账号受限，ChatGPT Session 仍为 free，已清理 PayPal cookies，请从步骤 6 重新创建 Plus Checkout。');
        }

        const planLabel = planType || '未知';
        await addStepLog(
          visibleStep,
          `Session JSON 当前 planType=${planLabel}，尚未升级为 plus，3 秒后刷新重新获取...`,
          'info',
          stepKey
        );
        await sleepWithStop(COCKPIT_TOOLS_PLUS_SESSION_POLL_MS);
        await refreshSessionJsonTab(tabId, visibleStep);
      }
    }

    async function importSessionToCockpitTools(state = {}, sessionState = {}, visibleStep) {
      if (typeof fetchApi !== 'function') {
        throw new Error('当前运行环境不支持 fetch，无法调用 cockpit-tools API。');
      }
      const payload = JSON.stringify({
        payload: sessionState.session || sessionState.accessToken || '',
      });
      let lastError = '';
      for (const endpoint of buildCockpitToolsImportEndpoints()) {
        try {
          const response = await fetchApi(endpoint, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'text/plain;charset=UTF-8',
            },
            body: payload,
          });
          const responseText = await response.text().catch(() => '');
          const responseJson = responseText ? JSON.parse(responseText) : null;
          if (!response.ok) {
            const message = responseJson?.error?.message
              || responseJson?.message
              || responseText
              || `HTTP ${response.status}`;
            lastError = `${endpoint}: ${message}`;
            continue;
          }
          return responseJson || { ok: true };
        } catch (error) {
          lastError = `${endpoint}: ${error?.message || String(error || '请求失败')}`;
        }
      }
      throw new Error(`步骤 ${visibleStep}：未能通过本机桥导入 cockpit-tools，请确认 cockpit-tools 正在运行且 WebSocket 服务已启用。最后错误：${lastError}`);
    }

    function buildCompletionResult(result = {}) {
      return {
        imported: Boolean(result?.imported ?? result?.ok ?? true),
        destination: 'cockpit-tools',
        account: result?.account || result?.summary || null,
        addedToApiPool: Boolean(result?.added_to_api_pool ?? result?.addedToApiPool),
      };
    }

    function buildLocalSessionRecord(sessionState = {}, result = {}) {
      return {
        email: getSessionEmail(sessionState),
        accountId: getSessionAccountId(sessionState) || normalizeString(result?.account?.id || result?.summary?.id),
        planType: normalizeString(sessionState?.session?.account?.planType || result?.account?.plan_type || result?.account?.planType),
        capturedAt: sessionState?.capturedAt || Date.now(),
        importedAt: Date.now(),
        accessTokenExpiresAt: Math.floor(Number(decodeJwtPayload(getSessionAccessToken(sessionState))?.exp) || 0),
      };
    }

    function buildSessionReadyCompletionResult(sessionState = {}) {
      const session = sessionState?.session || {};
      return {
        ready: true,
        destination: 'cockpit-tools',
        planType: session?.account?.planType || null,
        accountId: session?.account?.id || null,
        email: session?.user?.email || null,
        capturedAt: sessionState?.capturedAt || Date.now(),
      };
    }

    function isCachedPlusSessionState(sessionState = {}) {
      return Boolean(sessionState?.session) && getSessionPlanType(sessionState) === 'plus';
    }

    async function executeCockpitToolsSessionReady(state = {}) {
      throwIfStopped();
      const visibleStep = resolveVisibleStep(state, 7);

      await addStepLog(visibleStep, `Plus Checkout 已完成，等待 5 秒后打开 ${CHATGPT_SESSION_URL}...`, 'info', 'cockpit-tools-session-ready');
      await sleepWithStop(DEFAULT_COCKPIT_TOOLS_IMPORT_WAIT_MS);
      throwIfStopped();

      const tabId = await getOrOpenSessionJsonTab(state, visibleStep);
      await addStepLog(visibleStep, '已打开 Session JSON 页面，正在刷新直到 account.planType=plus...', 'info', 'cockpit-tools-session-ready');
      cachedPlusSessionState = await waitForPlusChatGptSession(tabId, visibleStep, 'cockpit-tools-session-ready', state);

      await completeNodeFromBackground(
        state?.nodeId || 'cockpit-tools-session-ready',
        buildSessionReadyCompletionResult(cachedPlusSessionState)
      );
    }

    async function executeCockpitToolsSessionImport(state = {}) {
      throwIfStopped();
      const visibleStep = resolveVisibleStep(state, 8);

      let sessionState = cachedPlusSessionState;
      if (!isCachedPlusSessionState(sessionState)) {
        await addStepLog(visibleStep, '未找到上一步缓存的 Plus Session，正在重新打开 Session JSON 页面读取...', 'info');
        const tabId = await getOrOpenSessionJsonTab(state, visibleStep);
        sessionState = await waitForPlusChatGptSession(tabId, visibleStep, 'cockpit-tools-session-import', state);
        cachedPlusSessionState = sessionState;
      }

      throwIfStopped();
      if (isOpenAiAccountUnavailableSession(sessionState)) {
        const email = getSessionEmail(sessionState);
        if (email) {
          await addStepLog(visibleStep, `检测到 ${email} 账户已停用或删除，删除 cockpit-tools 侧账号并跳过 Session 刷新。`, 'warn');
          await deleteCockpitToolsCodexAccountByEmail(email).catch((error) => addStepLog(visibleStep, `删除 cockpit-tools 账号失败：${error?.message || error}`, 'warn'));
          await updateLocalSessionRecord(state, 'delete', { email });
        }
        await completeNodeFromBackground(state?.nodeId || 'cockpit-tools-session-import', {
          imported: false,
          skipped: true,
          reason: 'account_unavailable',
          destination: 'cockpit-tools',
        });
        return;
      }
      if (isSessionAccessTokenExpired(sessionState)) {
        await addStepLog(visibleStep, '当前 Session accessToken 已过期或即将过期，将用当前登录态刷新 Session JSON 后再导入。', 'warn');
        const tabId = await getOrOpenSessionJsonTab(state, visibleStep);
        await refreshSessionJsonTab(tabId, visibleStep);
        sessionState = await waitForPlusChatGptSession(tabId, visibleStep, 'cockpit-tools-session-import', state);
        cachedPlusSessionState = sessionState;
      }
      await syncCockpitToolsReauthStateBeforeImport(state, sessionState, visibleStep);
      await addStepLog(visibleStep, '已读取 Plus Session JSON，正在提交到 cockpit-tools...', 'info');
      const result = await importSessionToCockpitTools(state, sessionState, visibleStep);
      await updateLocalSessionRecord(state, 'upsert', buildLocalSessionRecord(sessionState, result));
      await addStepLog(visibleStep, 'cockpit-tools 导入完成。', 'success');
      await completeNodeFromBackground(state?.nodeId || 'cockpit-tools-session-import', buildCompletionResult(result));
    }

    return {
      executeCockpitToolsSessionReady,
      executeCockpitToolsSessionImport,
      isSupportedChatGptSessionUrl,
      isSessionAccessTokenExpired,
      buildCockpitToolsImportEndpoints,
      buildCockpitToolsListEndpoints,
      buildCockpitToolsDeleteEndpoints,
    };
  }

  return {
    createCockpitToolsSessionImportExecutor,
  };
});
