(function () {
  "use strict";

  var VW = (window.VoiceWidget = window.VoiceWidget || {});
  VW.q = VW.q || [];

  // Also check for queue from the loader script (window.vw.q)
  var loaderQ = window.vw && window.vw.q ? window.vw.q : [];

  var translations = {
    en: {
      voiceChat: "VOICE CHAT",
      connecting: "Connecting...",
      callEnded: "Call ended",
      poweredBy: "Powered by",
      terms: "Terms & Conditions",
      termsAgree: "I agree to the",
      cancel: "Cancel",
      continue: "Continue",
    },
    ar: {
      voiceChat: "محادثة صوتية",
      connecting: "جاري الاتصال...",
      callEnded: "انتهت المكالمة",
      poweredBy: "مدعوم من",
      terms: "الشروط والأحكام",
      termsAgree: "أوافق على",
      cancel: "إلغاء",
      continue: "متابعة",
    },
    de: {
      voiceChat: "SPRACHANRUF",
      connecting: "Verbinden...",
      callEnded: "Anruf beendet",
      poweredBy: "Unterstützt von",
      terms: "Nutzungsbedingungen",
      termsAgree: "Ich akzeptiere die",
      cancel: "Abbrechen",
      continue: "Weiter",
    },
    es: {
      voiceChat: "LLAMADA DE VOZ",
      connecting: "Conectando...",
      callEnded: "Llamada finalizada",
      poweredBy: "Desarrollado por",
      terms: "Términos y Condiciones",
      termsAgree: "Acepto los",
      cancel: "Cancelar",
      continue: "Continuar",
    },
    fr: {
      voiceChat: "APPEL VOCAL",
      connecting: "Connexion...",
      callEnded: "Appel terminé",
      poweredBy: "Propulsé par",
      terms: "Conditions Générales",
      termsAgree: "J'accepte les",
      cancel: "Annuler",
      continue: "Continuer",
    },
    hi: {
      voiceChat: "वॉइस कॉल",
      connecting: "कनेक्ट हो रहा है...",
      callEnded: "कॉल समाप्त",
      poweredBy: "द्वारा संचालित",
      terms: "नियम और शर्तें",
      termsAgree: "मैं सहमत हूं",
      cancel: "रद्द करें",
      continue: "जारी रखें",
    },
    it: {
      voiceChat: "CHIAMATA VOCALE",
      connecting: "Connessione...",
      callEnded: "Chiamata terminata",
      poweredBy: "Powered by",
      terms: "Termini e Condizioni",
      termsAgree: "Accetto i",
      cancel: "Annulla",
      continue: "Continua",
    },
    ja: {
      voiceChat: "音声通話",
      connecting: "接続中...",
      callEnded: "通話終了",
      poweredBy: "Powered by",
      terms: "利用規約",
      termsAgree: "同意します",
      cancel: "キャンセル",
      continue: "続ける",
    },
    pt: {
      voiceChat: "CHAMADA DE VOZ",
      connecting: "Conectando...",
      callEnded: "Chamada finalizada",
      poweredBy: "Desenvolvido por",
      terms: "Termos e Condições",
      termsAgree: "Eu concordo com os",
      cancel: "Cancelar",
      continue: "Continuar",
    },
    zh: {
      voiceChat: "语音通话",
      connecting: "连接中...",
      callEnded: "通话结束",
      poweredBy: "技术支持",
      terms: "条款和条件",
      termsAgree: "我同意",
      cancel: "取消",
      continue: "继续",
    },
  };

  var langFlags = {
    en: "🇺🇸",
    ar: "🇸🇦",
    af: "🇿🇦",
    am: "🇪🇹",
    az: "🇦🇿",
    be: "🇧🇾",
    bg: "🇧🇬",
    bn: "🇧🇩",
    bs: "🇧🇦",
    ca: "🇪🇸",
    cs: "🇨🇿",
    cy: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    da: "🇩🇰",
    de: "🇩🇪",
    el: "🇬🇷",
    es: "🇪🇸",
    et: "🇪🇪",
    fa: "🇮🇷",
    fi: "🇫🇮",
    fr: "🇫🇷",
    ga: "🇮🇪",
    gl: "🇪🇸",
    gu: "🇮🇳",
    he: "🇮🇱",
    hi: "🇮🇳",
    hr: "🇭🇷",
    hu: "🇭🇺",
    hy: "🇦🇲",
    id: "🇮🇩",
    is: "🇮🇸",
    it: "🇮🇹",
    ja: "🇯🇵",
    jw: "🇮🇩",
    ka: "🇬🇪",
    kk: "🇰🇿",
    km: "🇰🇭",
    kn: "🇮🇳",
    ko: "🇰🇷",
    lo: "🇱🇦",
    lt: "🇱🇹",
    lv: "🇱🇻",
    mi: "🇳🇿",
    mk: "🇲🇰",
    ml: "🇮🇳",
    mn: "🇲🇳",
    mr: "🇮🇳",
    ms: "🇲🇾",
    mt: "🇲🇹",
    my: "🇲🇲",
    ne: "🇳🇵",
    nl: "🇳🇱",
    no: "🇳🇴",
    pa: "🇮🇳",
    pl: "🇵🇱",
    pt: "🇧🇷",
    ro: "🇷🇴",
    ru: "🇷🇺",
    si: "🇱🇰",
    sk: "🇸🇰",
    sl: "🇸🇮",
    so: "🇸🇴",
    sq: "🇦🇱",
    sr: "🇷🇸",
    su: "🇮🇩",
    sv: "🇸🇪",
    sw: "🇰🇪",
    ta: "🇮🇳",
    te: "🇮🇳",
    th: "🇹🇭",
    tl: "🇵🇭",
    tr: "🇹🇷",
    uk: "🇺🇦",
    ur: "🇵🇰",
    uz: "O'zbek",
    vi: "🇻🇳",
    zh: "🇨🇳",
    zu: "🇿🇦",
  };

  var langNames = {
    en: "English",
    ar: "العربية",
    af: "Afrikaans",
    am: "አማርኛ",
    az: "Azərbaycan",
    be: "Беларуская",
    bg: "Български",
    bn: "বাংলা",
    bs: "Bosanski",
    ca: "Català",
    cs: "Čeština",
    cy: "Cymraeg",
    da: "Dansk",
    de: "Deutsch",
    el: "Ελληνικά",
    es: "Español",
    et: "Eesti",
    fa: "فارسی",
    fi: "Suomi",
    fr: "Français",
    ga: "Gaeilge",
    gl: "Galego",
    gu: "ગુજરાતી",
    he: "עברית",
    hi: "हिन्दी",
    hr: "Hrvatski",
    hu: "Magyar",
    hy: "Հայerén",
    id: "Indonesia",
    is: "Íslenska",
    it: "Italiano",
    ja: "日本語",
    jw: "Basa Jawa",
    ka: "ქართული",
    kk: "Қазақша",
    km: "ភាសាខ្មែរ",
    kn: "ಕನ್ನಡ",
    ko: "한국어",
    lo: "ລາວ",
    lt: "Lietuvių",
    lv: "Latviešu",
    mi: "Te Reo Māori",
    mk: "Македонски",
    ml: "മലയാളം",
    mn: "Монгол",
    mr: "मराठी",
    ms: "Bahasa Melayu",
    mt: "Malti",
    my: "မြန်မာ",
    ne: "नेपाली",
    nl: "Nederlands",
    no: "Norsk",
    pa: "ਪੰਜਾਬੀ",
    pl: "Polski",
    pt: "Português",
    ro: "Română",
    ru: "Русский",
    si: "සිංහල",
    sk: "Slovenčina",
    sl: "Slovenščina",
    so: "Soomaali",
    sq: "Shqip",
    sr: "Српски",
    su: "Basa Sunda",
    sv: "Svenska",
    sw: "Kiswahili",
    ta: "தமிழ்",
    te: "తెలుగు",
    th: "ไทย",
    tl: "Tagalog",
    tr: "Türkçe",
    uk: "Українська",
    ur: "اردو",
    uz: "O'zbek",
    vi: "Tiếng Việt",
    zh: "中文",
    zu: "isiZulu",
  };

  var currentLang = "en";
  var config = null;
  var embedToken = null;
  var state = "idle";
  var session = null;
  var livekitRoom = null;
  var isMuted = false;
  var elapsedTime = 0;
  var timerInterval = null;
  var heartbeatInterval = null;
  var audioContext = null;
  var analyser = null;
  var audioLevelInterval = null;
  var audioLevel = 0;
  var brandingData = null;
  var termsAccepted = false;
  var livekitLoaded = false;

  function t(key) {
    return (
      (translations[currentLang] && translations[currentLang][key]) ||
      translations.en[key] ||
      key
    );
  }

  function detectLanguage() {
    var htmlLang = document.documentElement.lang || "";
    var langCode = htmlLang.split("-")[0].toLowerCase();
    if (langNames[langCode]) {
      currentLang = langCode;
    } else {
      var navLang = (navigator.language || navigator.userLanguage || "en")
        .split("-")[0]
        .toLowerCase();
      if (langNames[navLang]) {
        currentLang = navLang;
      }
    }
  }

  function getSortedLanguages() {
    return Object.keys(langNames).sort(function (a, b) {
      if (a === "en") return -1;
      if (b === "en") return 1;
      return langNames[a].localeCompare(langNames[b]);
    });
  }

  function init(token) {
    embedToken = token;
    detectLanguage();
    loadLiveKitSDK(function () {
      livekitLoaded = true;
      loadConfig();
    });
  }

  function loadLiveKitSDK(callback) {
    // Load livekit-client from CDN
    if (window.LivekitClient) {
      callback();
      return;
    }
    var script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.js";
    script.onload = callback;
    script.onerror = function () {
      console.error("VoiceWidget: Failed to load LiveKit SDK");
    };
    document.head.appendChild(script);
  }

  function getBaseUrl() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].id === "vw" && scripts[i].src) {
        return scripts[i].src.replace(/\/widget\/embed\.js.*$/, "");
      }
    }
    return "";
  }

  function loadConfig() {
    fetch(getBaseUrl() + "/api/public/widget/config/" + embedToken)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        config = data;
        loadBranding();
      })
      .catch(function (err) {
        console.error("VoiceWidget: Failed to load config", err);
      });
  }

  function loadBranding() {
    fetch(getBaseUrl() + "/api/branding")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        brandingData = data;
        createWidget();
      })
      .catch(function () {
        createWidget();
      });
  }

  function getAbsoluteUrl(url) {
    if (!url) return "";
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("data:")
    ) {
      return url;
    }
    return getBaseUrl() + (url.startsWith("/") ? url : "/" + url);
  }

  function createWidget() {
    // If avatar or text chat is enabled, use iframe mode pointing to the React chat widget page
    if (config.avatarEnabled || config.textChatEnabled) {
      createIframeWidget();
      return;
    }

    var container = document.createElement("div");
    container.id = "vw-container";
    container.innerHTML = getWidgetHTML();
    document.body.appendChild(container);
    injectStyles();
    bindEvents();
  }

  function createIframeWidget() {
    var brandName = config.brandName || config.name || "Agent";
    var primaryColor = config.primaryColor || "#ec4899";
    var iconUrl = getAbsoluteUrl(config.iconPath || config.iconUrl);
    var buttonLabel =
      config.launcherText || config.buttonLabel || t("voiceChat");

    var container = document.createElement("div");
    container.id = "vw-container";

    // Launcher button
    var launcher = document.createElement("button");
    launcher.id = "vw-iframe-launcher";
    launcher.innerHTML =
      '<div class="vw-iframe-launcher-icon">' +
      (iconUrl
        ? '<img src="' +
          iconUrl +
          '" alt="" style="width:24px;height:24px;object-fit:contain;border-radius:50%">'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>') +
      "</div>" +
      '<span class="vw-iframe-launcher-text">' +
      buttonLabel +
      "</span>";

    // Iframe container (hidden initially)
    var iframeWrap = document.createElement("div");
    iframeWrap.id = "vw-iframe-wrap";
    iframeWrap.style.display = "none";

    var iframe = document.createElement("iframe");
    iframe.id = "vw-iframe";
    iframe.src = getBaseUrl() + "/w/" + embedToken;
    iframe.allow = "microphone; camera; autoplay";
    iframe.setAttribute("allowfullscreen", "");

    // Close button
    var closeBtn = document.createElement("button");
    closeBtn.id = "vw-iframe-close";
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M18 6L6 18M6 6l12 12"/></svg>';

    iframeWrap.appendChild(closeBtn);
    iframeWrap.appendChild(iframe);
    container.appendChild(iframeWrap);
    container.appendChild(launcher);
    document.body.appendChild(container);

    // Inject iframe-mode styles
    var style = document.createElement("style");
    style.textContent =
      '#vw-container{position:fixed;bottom:24px;right:24px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      "#vw-iframe-launcher{display:flex;align-items:center;gap:8px;padding:12px 20px;border:none;border-radius:50px;background:" +
      primaryColor +
      ";color:#fff;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:all .2s}" +
      "#vw-iframe-launcher:hover{transform:scale(1.05);box-shadow:0 6px 24px rgba(0,0,0,.25)}" +
      ".vw-iframe-launcher-icon{display:flex;align-items:center;justify-content:center}" +
      ".vw-iframe-launcher-text{white-space:nowrap}" +
      "#vw-iframe-wrap{position:fixed;bottom:90px;right:24px;width:400px;height:600px;max-width:calc(100vw - 48px);max-height:calc(100vh - 120px);border-radius:16px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.2);border:1px solid rgba(0,0,0,.08);background:#fff;z-index:999999}" +
      "#vw-iframe{width:100%;height:100%;border:none}" +
      "#vw-iframe-close{position:absolute;top:8px;right:8px;z-index:10;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;cursor:pointer;transition:background .2s}" +
      "#vw-iframe-close:hover{background:rgba(0,0,0,.7)}" +
      "@media(max-width:480px){#vw-iframe-wrap{bottom:0;right:0;width:100vw;height:100vh;max-width:100vw;max-height:100vh;border-radius:0}#vw-container{bottom:16px;right:16px}}";
    document.head.appendChild(style);

    // Toggle iframe
    var isOpen = false;
    launcher.addEventListener("click", function () {
      isOpen = !isOpen;
      iframeWrap.style.display = isOpen ? "block" : "none";
      launcher.style.display = isOpen ? "none" : "flex";
    });

    closeBtn.addEventListener("click", function () {
      // Tell iframe to end any active call before hiding
      iframe.contentWindow.postMessage({ type: "vw:close" }, "*");
      // Hide after short delay to let endSession fire
      setTimeout(function () {
        isOpen = false;
        iframeWrap.style.display = "none";
        launcher.style.display = "flex";
      }, 300);
    });

    // Listen for session-ended from iframe (e.g. user clicked disconnect inside)
    window.addEventListener("message", function (event) {
      if (event.data && event.data.type === "vw:session-ended") {
        isOpen = false;
        iframeWrap.style.display = "none";
        launcher.style.display = "flex";
      }
    });
  }

  function getWidgetHTML() {
    var brandName = config.brandName || config.name || "Agent";
    var iconUrl = getAbsoluteUrl(config.iconPath || config.iconUrl);
    var faviconUrl =
      brandingData?.favicon_url || brandingData?.logo_url || iconUrl;
    var appName = brandingData?.app_name || "Wtrops.ai";
    var primaryColor = config.primaryColor || "#ec4899";

    return (
      '<div id="vw-widget">' +
      '<div id="vw-state-idle" class="vw-state">' +
      '<div class="vw-card">' +
      '<div class="vw-avatar-wrap">' +
      (faviconUrl
        ? '<img src="' + faviconUrl + '" alt="" class="vw-avatar-img">'
        : '<svg class="vw-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>') +
      "</div>" +
      '<button id="vw-start-btn" class="vw-start-btn" ' +
      (!config.isAvailable ? "disabled" : "") +
      ">" +
      '<svg class="vw-phone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
      "<span>" +
      t("voiceChat") +
      "</span>" +
      "</button>" +
      '<div id="vw-lang-wrap" class="vw-lang-wrap">' +
      '<button id="vw-lang-btn" class="vw-lang-btn">' +
      '<span id="vw-lang-flag" class="vw-lang-flag">' +
      (langFlags[currentLang] || "🌐") +
      "</span>" +
      '<svg class="vw-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>' +
      "</button>" +
      '<div id="vw-lang-dropdown" class="vw-lang-dropdown">' +
      getSortedLanguages()
        .map(function (code) {
          return (
            '<button class="vw-lang-option' +
            (code === currentLang ? " vw-selected" : "") +
            '" data-lang="' +
            code +
            '">' +
            '<span class="vw-lang-option-flag">' +
            (langFlags[code] || "🌐") +
            "</span>" +
            '<span class="vw-lang-option-name">' +
            langNames[code] +
            "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="vw-powered">' +
      t("poweredBy") +
      ' <a href="' +
      getBaseUrl() +
      '" target="_blank" class="vw-brand-link">' +
      appName +
      "</a></div>" +
      "</div>" +
      '<div id="vw-state-terms" class="vw-state" style="display:none">' +
      '<div class="vw-card vw-terms-card">' +
      '<div class="vw-terms-header">' +
      t("terms") +
      "</div>" +
      '<label class="vw-terms-label">' +
      '<input type="checkbox" id="vw-terms-check" class="vw-terms-checkbox">' +
      "<span>" +
      t("termsAgree") +
      ' <a href="' +
      getBaseUrl() +
      '/terms" target="_blank" class="vw-terms-link">' +
      t("terms") +
      "</a></span>" +
      "</label>" +
      '<div class="vw-terms-actions">' +
      '<button id="vw-terms-cancel" class="vw-terms-btn vw-terms-cancel">' +
      t("cancel") +
      "</button>" +
      '<button id="vw-terms-accept" class="vw-terms-btn vw-terms-submit" disabled>' +
      t("continue") +
      "</button>" +
      "</div>" +
      "</div>" +
      '<div class="vw-powered">' +
      t("poweredBy") +
      ' <a href="' +
      getBaseUrl() +
      '" target="_blank" class="vw-brand-link">' +
      appName +
      "</a></div>" +
      "</div>" +
      '<div id="vw-state-connecting" class="vw-state" style="display:none">' +
      '<div class="vw-card">' +
      '<div class="vw-avatar-wrap vw-spinning">' +
      (faviconUrl
        ? '<img src="' + faviconUrl + '" alt="" class="vw-avatar-img">'
        : '<svg class="vw-avatar-icon vw-loader" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>') +
      "</div>" +
      '<span class="vw-connecting-text">' +
      t("connecting") +
      "</span>" +
      '<button id="vw-cancel-btn" class="vw-cancel-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      "</button>" +
      "</div>" +
      '<div class="vw-powered">' +
      t("poweredBy") +
      ' <a href="' +
      getBaseUrl() +
      '" target="_blank" class="vw-brand-link">' +
      appName +
      "</a></div>" +
      "</div>" +
      '<div id="vw-state-active" class="vw-state" style="display:none">' +
      '<div class="vw-card">' +
      '<div class="vw-avatar-wrap vw-avatar-active">' +
      (faviconUrl
        ? '<img src="' + faviconUrl + '" alt="" class="vw-avatar-img-lg">'
        : '<svg class="vw-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>') +
      "</div>" +
      '<div id="vw-timer-pill" class="vw-timer-pill">' +
      '<svg class="vw-timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
      '<span id="vw-timer" class="vw-timer-text">0:00</span>' +
      "</div>" +
      '<button id="vw-mute-btn" class="vw-inline-btn vw-mute-btn">' +
      '<svg id="vw-mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>' +
      '<svg id="vw-mic-off-icon" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>' +
      "</button>" +
      '<button id="vw-end-btn" class="vw-inline-btn vw-end-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>' +
      "</button>" +
      "</div>" +
      '<div class="vw-powered">' +
      t("poweredBy") +
      ' <a href="' +
      getBaseUrl() +
      '" target="_blank" class="vw-brand-link">' +
      appName +
      "</a></div>" +
      "</div>" +
      "</div>"
    );
  }

  function injectStyles() {
    var primaryColor = config.primaryColor || "#ec4899";
    var style = document.createElement("style");
    style.textContent =
      '#vw-container{position:fixed;bottom:24px;right:24px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      "#vw-widget{display:flex;flex-direction:column;align-items:center}" +
      ".vw-state{display:flex;flex-direction:column;align-items:center;gap:12px}" +
      ".vw-card{display:flex;align-items:center;gap:12px;background:#fff;border-radius:16px;padding:12px 16px;box-shadow:0 8px 32px rgba(0,0,0,.12);border:1px solid rgba(0,0,0,.06)}" +
      ".vw-terms-card{flex-direction:column;padding:20px 24px;min-width:280px}" +
      ".vw-avatar-wrap{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg," +
      primaryColor +
      "20," +
      primaryColor +
      "05);border:1px solid " +
      primaryColor +
      "30;flex-shrink:0;overflow:hidden}" +
      ".vw-avatar-img{width:24px;height:24px;object-fit:contain}" +
      ".vw-avatar-icon{width:20px;height:20px;color:" +
      primaryColor +
      "}" +
      ".vw-spinning{animation:vw-spin 2s linear infinite}" +
      "@keyframes vw-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}" +
      ".vw-start-btn{display:flex;align-items:center;gap:8px;padding:10px 16px;border:none;border-radius:50px;background:#18181b;color:#fff;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s}" +
      ".vw-start-btn:hover:not(:disabled){background:#27272a;transform:scale(1.02)}" +
      ".vw-start-btn:disabled{opacity:.5;cursor:not-allowed}" +
      ".vw-phone-icon{width:16px;height:16px}" +
      ".vw-lang-wrap{position:relative}" +
      ".vw-lang-btn{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid rgba(0,0,0,.1);border-radius:50px;background:transparent;cursor:pointer;transition:background .2s}" +
      ".vw-lang-btn:hover{background:rgba(0,0,0,.04)}" +
      ".vw-lang-flag{font-size:18px;line-height:1}" +
      ".vw-chevron{width:12px;height:12px;color:#71717a;transition:transform .2s}" +
      ".vw-chevron.vw-open{transform:rotate(180deg)}" +
      ".vw-lang-dropdown{display:none;position:absolute;bottom:100%;right:0;margin-bottom:8px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.16);border:1px solid rgba(0,0,0,.08);max-height:320px;overflow-y:auto;min-width:200px;z-index:1000}" +
      ".vw-lang-dropdown.vw-open{display:block}" +
      ".vw-lang-option{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:none;background:transparent;cursor:pointer;text-align:left;transition:background .15s}" +
      ".vw-lang-option:hover{background:rgba(0,0,0,.04)}" +
      ".vw-lang-option.vw-selected{background:rgba(0,0,0,.06)}" +
      ".vw-lang-option-flag{font-size:18px;line-height:1}" +
      ".vw-lang-option-name{font-size:14px;color:#27272a}" +
      ".vw-connecting-text{font-size:14px;font-weight:500;color:#52525b}" +
      ".vw-cancel-btn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:50%;background:transparent;cursor:pointer;color:#71717a;transition:background .2s}" +
      ".vw-cancel-btn:hover{background:rgba(0,0,0,.06)}" +
      ".vw-cancel-btn svg{width:16px;height:16px}" +
      ".vw-avatar-active{width:48px;height:48px}" +
      ".vw-avatar-img-lg{width:32px;height:32px;object-fit:contain}" +
      ".vw-timer-pill{display:flex;align-items:center;gap:8px;background:#f4f4f5;border-radius:50px;padding:6px 12px}" +
      ".vw-timer-icon{width:14px;height:14px;color:#71717a}" +
      ".vw-timer-text{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:#3f3f46}" +
      ".vw-inline-btn{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:50%;cursor:pointer;transition:all .2s}" +
      ".vw-inline-btn:hover{transform:scale(1.08)}" +
      ".vw-inline-btn svg{width:16px;height:16px}" +
      ".vw-mute-btn{background:transparent;color:#27272a;border:1px solid rgba(0,0,0,.15)}" +
      ".vw-mute-btn:hover{background:rgba(0,0,0,.04)}" +
      ".vw-mute-btn.vw-muted{background:#ef4444;color:#fff;border-color:#ef4444}" +
      ".vw-end-btn{background:#ef4444;color:#fff}" +
      ".vw-powered{font-size:12px;color:#a1a1aa}" +
      ".vw-brand-link{font-weight:500;color:#71717a;text-decoration:none}" +
      ".vw-brand-link:hover{text-decoration:underline}" +
      ".vw-terms-header{font-size:14px;font-weight:600;text-align:center;margin-bottom:12px;color:#27272a}" +
      ".vw-terms-label{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#52525b;cursor:pointer;margin-bottom:16px}" +
      ".vw-terms-checkbox{margin-top:2px;cursor:pointer}" +
      ".vw-terms-link{color:" +
      primaryColor +
      ";text-decoration:underline}" +
      ".vw-terms-actions{display:flex;gap:8px;justify-content:center}" +
      ".vw-terms-btn{padding:8px 20px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;border:none;transition:opacity .2s}" +
      ".vw-terms-cancel{background:transparent;border:1px solid rgba(0,0,0,.2);color:#52525b}" +
      ".vw-terms-submit{background:" +
      primaryColor +
      ";color:#fff}" +
      ".vw-terms-submit:disabled{opacity:.5;cursor:not-allowed}";
    document.head.appendChild(style);
  }

  function bindEvents() {
    document
      .getElementById("vw-start-btn")
      .addEventListener("click", handleStartClick);
    document.getElementById("vw-cancel-btn").addEventListener("click", cleanup);
    document
      .getElementById("vw-mute-btn")
      .addEventListener("click", toggleMute);
    document.getElementById("vw-end-btn").addEventListener("click", endCall);

    var termsCheck = document.getElementById("vw-terms-check");
    var termsAcceptBtn = document.getElementById("vw-terms-accept");
    var termsCancelBtn = document.getElementById("vw-terms-cancel");

    termsCheck.addEventListener("change", function () {
      termsAccepted = termsCheck.checked;
      termsAcceptBtn.disabled = !termsAccepted;
    });

    termsAcceptBtn.addEventListener("click", function () {
      if (termsAccepted) {
        startCall();
      }
    });

    termsCancelBtn.addEventListener("click", function () {
      setState("idle");
    });

    var langBtn = document.getElementById("vw-lang-btn");
    var langDropdown = document.getElementById("vw-lang-dropdown");
    var chevron = langBtn.querySelector(".vw-chevron");

    langBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = langDropdown.classList.contains("vw-open");
      langDropdown.classList.toggle("vw-open", !isOpen);
      chevron.classList.toggle("vw-open", !isOpen);
    });

    langDropdown.addEventListener("click", function (e) {
      e.stopPropagation();
      var option = e.target.closest(".vw-lang-option");
      if (option) {
        var newLang = option.getAttribute("data-lang");
        if (newLang && newLang !== currentLang) {
          currentLang = newLang;
          document.getElementById("vw-lang-flag").textContent =
            langFlags[newLang] || "🌐";
          langDropdown
            .querySelectorAll(".vw-lang-option")
            .forEach(function (opt) {
              opt.classList.toggle(
                "vw-selected",
                opt.getAttribute("data-lang") === newLang,
              );
            });
          updateUILanguage();
        }
        langDropdown.classList.remove("vw-open");
        chevron.classList.remove("vw-open");
      }
    });

    document.addEventListener("click", function () {
      langDropdown.classList.remove("vw-open");
      chevron.classList.remove("vw-open");
    });
  }

  function handleStartClick() {
    if (state !== "idle" || !config.isAvailable) return;

    if (config.requireTermsAcceptance && !termsAccepted) {
      setState("terms");
    } else {
      startCall();
    }
  }

  function setState(newState) {
    state = newState;
    document.getElementById("vw-state-idle").style.display =
      newState === "idle" ? "flex" : "none";
    document.getElementById("vw-state-terms").style.display =
      newState === "terms" ? "flex" : "none";
    document.getElementById("vw-state-connecting").style.display =
      newState === "connecting" ? "flex" : "none";
    document.getElementById("vw-state-active").style.display =
      newState === "active" ? "flex" : "none";
  }

  function updateUILanguage() {
    var startBtn = document.querySelector("#vw-start-btn span");
    if (startBtn) startBtn.textContent = t("voiceChat");

    var connectingText = document.querySelector(".vw-connecting-text");
    if (connectingText) connectingText.textContent = t("connecting");

    var termsHeader = document.querySelector(".vw-terms-header");
    if (termsHeader) termsHeader.textContent = t("terms");

    var termsLabel = document.querySelector(".vw-terms-label span");
    if (termsLabel) {
      termsLabel.innerHTML =
        t("termsAgree") +
        ' <a href="' +
        getBaseUrl() +
        '/terms" target="_blank" class="vw-terms-link">' +
        t("terms") +
        "</a>";
    }

    var cancelBtn = document.getElementById("vw-terms-cancel");
    if (cancelBtn) cancelBtn.textContent = t("cancel");

    var acceptBtn = document.getElementById("vw-terms-accept");
    if (acceptBtn) acceptBtn.textContent = t("continue");

    var poweredBys = document.querySelectorAll(".vw-powered");
    var appName =
      brandingData?.app_name || config?.brandName || config?.name || "Agent";
    poweredBys.forEach(function (el) {
      el.innerHTML =
        t("poweredBy") + ' <span class="vw-brand">' + appName + "</span>";
    });
  }

  async function startCall() {
    if (!livekitLoaded || !window.LivekitClient) {
      alert("Voice service is loading. Please try again.");
      return;
    }

    setState("connecting");

    try {
      // 1. Create widget session
      var sessionRes = await fetch(
        getBaseUrl() + "/api/public/widget/session/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embedToken: embedToken,
            visitorDomain: window.location.hostname,
            language: currentLang,
          }),
        },
      );

      if (!sessionRes.ok) {
        var err = await sessionRes.json();
        throw new Error(err.message || err.error || "Failed to start session");
      }

      session = await sessionRes.json();

      // 2. Get LiveKit token
      var tokenRes = await fetch(
        getBaseUrl() +
          "/api/public/widget/session/" +
          session.sessionId +
          "/livekit-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: session.sessionToken }),
        },
      );

      if (!tokenRes.ok) {
        var tokenErr = await tokenRes.json();
        throw new Error(tokenErr.error || "Failed to get connection token");
      }

      var connectionInfo = await tokenRes.json();

      // 3. Connect to LiveKit room
      var LK = window.LivekitClient;
      var room = new LK.Room({
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        adaptiveStream: true,
        dynacast: true,
      });
      livekitRoom = room;

      // Listen for agent audio
      room.on(LK.RoomEvent.TrackSubscribed, function (track) {
        if (track.kind === LK.Track.Kind.Audio) {
          var audioEl = track.attach();
          document.body.appendChild(audioEl);

          // Set up audio analyser
          var mediaTrack = track.mediaStreamTrack;
          if (mediaTrack) {
            setupAudioAnalyser(mediaTrack);
          }
        }
      });

      room.on(LK.RoomEvent.Disconnected, function () {
        if (state === "active") {
          endCall();
        }
      });

      await room.connect(connectionInfo.livekitUrl, connectionInfo.token);
      await room.localParticipant.setMicrophoneEnabled(true);

      setState("active");
      elapsedTime = 0;
      startTimer();
      startHeartbeat();
    } catch (err) {
      console.error("VoiceWidget: Call failed", err);
      cleanup();
      alert(err.message || "Connection failed. Please try again.");
    }
  }

  function setupAudioAnalyser(mediaTrack) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      var stream = new MediaStream([mediaTrack]);
      var source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch (e) {
      console.log("Could not setup audio analyser:", e);
    }
  }

  function startTimer() {
    var timerEl = document.getElementById("vw-timer");

    timerInterval = setInterval(function () {
      elapsedTime++;
      var mins = Math.floor(elapsedTime / 60);
      var secs = elapsedTime % 60;
      timerEl.textContent = mins + ":" + (secs < 10 ? "0" : "") + secs;

      if (config.maxCallDuration && elapsedTime >= config.maxCallDuration) {
        endCall();
      }
    }, 1000);
  }

  function startHeartbeat() {
    heartbeatInterval = setInterval(async function () {
      if (!session) return;

      try {
        var res = await fetch(
          getBaseUrl() +
            "/api/public/widget/session/" +
            session.sessionId +
            "/heartbeat",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionToken: session.sessionToken }),
          },
        );

        if (res.ok) {
          var data = await res.json();
          if (!data.continue) {
            endCall();
          }
        }
      } catch (e) {
        console.error("Heartbeat failed:", e);
      }
    }, 30000);
  }

  function toggleMute() {
    if (!livekitRoom) return;

    isMuted = !isMuted;
    livekitRoom.localParticipant.setMicrophoneEnabled(!isMuted);

    var muteBtn = document.getElementById("vw-mute-btn");
    var micIcon = document.getElementById("vw-mic-icon");
    var micOffIcon = document.getElementById("vw-mic-off-icon");

    muteBtn.classList.toggle("vw-muted", isMuted);
    micIcon.style.display = isMuted ? "none" : "block";
    micOffIcon.style.display = isMuted ? "block" : "none";
  }

  async function endCall() {
    if (session) {
      try {
        await fetch(
          getBaseUrl() +
            "/api/public/widget/session/" +
            session.sessionId +
            "/end",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionToken: session.sessionToken,
              duration: elapsedTime,
            }),
          },
        );
      } catch (e) {
        console.error("Failed to end session:", e);
      }
    }

    cleanup();
  }

  function cleanup() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (audioLevelInterval) {
      clearInterval(audioLevelInterval);
      audioLevelInterval = null;
    }

    if (livekitRoom) {
      livekitRoom.disconnect();
      livekitRoom = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
      analyser = null;
    }

    session = null;
    isMuted = false;
    audioLevel = 0;
    elapsedTime = 0;
    termsAccepted = false;

    var termsCheck = document.getElementById("vw-terms-check");
    if (termsCheck) termsCheck.checked = false;

    var termsAcceptBtn = document.getElementById("vw-terms-accept");
    if (termsAcceptBtn) termsAcceptBtn.disabled = true;

    var muteBtn = document.getElementById("vw-mute-btn");
    if (muteBtn) muteBtn.classList.remove("vw-muted");

    var micIcon = document.getElementById("vw-mic-icon");
    var micOffIcon = document.getElementById("vw-mic-off-icon");
    if (micIcon) micIcon.style.display = "block";
    if (micOffIcon) micOffIcon.style.display = "none";

    var bars = document.querySelectorAll(".vw-bar");
    bars.forEach(function (bar) {
      bar.style.transform = "scaleY(1)";
    });

    setState("idle");
  }

  VW.init = init;

  // Process commands from VoiceWidget.q
  while (VW.q.length) {
    var cmd = VW.q.shift();
    if (cmd[0] === "init" && cmd[1]) init(cmd[1]);
  }

  // Process commands from loader's vw.q (the embed code stub)
  while (loaderQ.length) {
    var cmd = loaderQ.shift();
    if (cmd[0] === "init" && cmd[1]) init(cmd[1]);
  }
})();
