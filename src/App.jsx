import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────
// SPEECH SYNTHESIS
// ─────────────────────────────────────────────────────────
function speakText(text, langCode) {
  if (!window.speechSynthesis || !text) return;
  // 既存の発話をキャンセル
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const map = {
    ja:"ja-JP", th:"th-TH", ko:"ko-KR", en:"en-US", zh:"zh-CN",
    vi:"vi-VN", id:"id-ID", hi:"hi-IN", fr:"fr-FR", it:"it-IT",
    de:"de-DE", es:"es-ES", pt:"pt-BR", ms:"ms-MY", ar:"ar-SA",
    tr:"tr-TR", ru:"ru-RU", nl:"nl-NL", fi:"fi-FI", no:"nb-NO",
    el:"el-GR", mn:"mn-MN", km:"km-KH", lo:"lo-LA",
  };
  const targetLang = map[langCode] || "en-US";
  u.lang = targetLang;
  u.rate = 0.9;
  u.pitch = 1.0;
  u.volume = 1.0;

  // 利用可能な音声から最適なものを選ぶ
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    // 厳密一致
    let v = voices.find(vo => vo.lang === targetLang);
    // 言語コードだけで一致 (例: en-US -> en-*)
    if (!v) v = voices.find(vo => vo.lang.startsWith(targetLang.split("-")[0]));
    if (v) u.voice = v;
  }

  // iOSで初回再生がよく失敗するので少し遅延させる
  setTimeout(() => {
    try { window.speechSynthesis.speak(u); } catch(e) { console.error("speak failed:", e); }
  }, 50);
}

// マイク開始/終了の効果音（ピロン音）
let _audioCtx = null;
function getAudioContext() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  if (_audioCtx && _audioCtx.state === "suspended") {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

function playBeep(type) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (type === "start") {
    // 開始音：低 → 高のピロン
    [[440, 0], [660, 0.08]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.15, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.13);
    });
  } else if (type === "end") {
    // 終了音：高 → 低のピロン
    [[660, 0], [440, 0.08]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.12, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.11);
    });
  }
}

// ─────────────────────────────────────────────────────────
// ANTHROPIC API TRANSLATION
// ─────────────────────────────────────────────────────────
async function translateText(text, fromLang, toLang, toLocalName) {
  if (!text || !text.trim()) return "";
  // 同じ言語なら翻訳不要
  if (fromLang === toLang) return text;

  // 言語コードマッピング
  const langMap = {
    ja:"ja", en:"en", zh:"zh", ko:"ko", es:"es", pt:"pt",
    th:"th", vi:"vi", id:"id", ms:"ms", hi:"hi", fr:"fr", it:"it",
    de:"de", ar:"ar", tr:"tr", ru:"ru", nl:"nl", fi:"fi", no:"no",
    el:"el", mn:"mn", km:"km", lo:"lo",
  };
  const from = langMap[fromLang] || "en";
  const to = langMap[toLang] || "en";

  // ── 戦略：複数の翻訳サービスを順番に試す ──

  // 1. Google Translate 公式ウェブAPI（無料・無認証・高精度・長文対応）
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      // data[0] は文ごとの翻訳配列。全てを結合
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map(seg => seg[0]).filter(Boolean).join("");
        if (translated && translated.trim()) return translated;
      }
    }
  } catch (err) { /* fallback */ }

  // 2. MyMemory APIへフォールバック（短文向け）
  try {
    const myMemoryLangMap = {
      ja:"ja", en:"en", zh:"zh-CN", ko:"ko", es:"es", pt:"pt-BR",
      th:"th", vi:"vi", id:"id", ms:"ms", hi:"hi", fr:"fr", it:"it",
      de:"de", ar:"ar", tr:"tr", ru:"ru", nl:"nl", fi:"fi", no:"no",
      el:"el",
    };
    const fromMM = myMemoryLangMap[fromLang] || "en";
    const toMM = myMemoryLangMap[toLang] || "en";
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromMM}|${toMM}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
  } catch (err) { /* fallback */ }

  return "";
}

// 言語コード → 表示名（自言語版）
function getLangDisplayName(code, uiLang) {
  const names = {
    ja: { ja:"日本語", en:"Japanese", zh:"日语", ko:"일본어", es:"Japonés", pt:"Japonês" },
    en: { ja:"英語", en:"English", zh:"英语", ko:"영어", es:"Inglés", pt:"Inglês" },
    zh: { ja:"中国語", en:"Chinese", zh:"中文", ko:"중국어", es:"Chino", pt:"Chinês" },
    ko: { ja:"韓国語", en:"Korean", zh:"韩语", ko:"한국어", es:"Coreano", pt:"Coreano" },
    es: { ja:"スペイン語", en:"Spanish", zh:"西班牙语", ko:"스페인어", es:"Español", pt:"Espanhol" },
    pt: { ja:"ポルトガル語", en:"Portuguese", zh:"葡萄牙语", ko:"포르투갈어", es:"Portugués", pt:"Português" },
    th: { ja:"タイ語", en:"Thai", zh:"泰语", ko:"태국어", es:"Tailandés", pt:"Tailandês" },
    vi: { ja:"ベトナム語", en:"Vietnamese", zh:"越南语", ko:"베트남어", es:"Vietnamita", pt:"Vietnamita" },
    id: { ja:"インドネシア語", en:"Indonesian", zh:"印尼语", ko:"인도네시아어", es:"Indonesio", pt:"Indonésio" },
    ms: { ja:"マレー語", en:"Malay", zh:"马来语", ko:"말레이어", es:"Malayo", pt:"Malaio" },
    hi: { ja:"ヒンディー語", en:"Hindi", zh:"印地语", ko:"힌디어", es:"Hindi", pt:"Hindi" },
    fr: { ja:"フランス語", en:"French", zh:"法语", ko:"프랑스어", es:"Francés", pt:"Francês" },
    it: { ja:"イタリア語", en:"Italian", zh:"意大利语", ko:"이탈리아어", es:"Italiano", pt:"Italiano" },
    de: { ja:"ドイツ語", en:"German", zh:"德语", ko:"독일어", es:"Alemán", pt:"Alemão" },
    ar: { ja:"アラビア語", en:"Arabic", zh:"阿拉伯语", ko:"아랍어", es:"Árabe", pt:"Árabe" },
    tr: { ja:"トルコ語", en:"Turkish", zh:"土耳其语", ko:"터키어", es:"Turco", pt:"Turco" },
    ru: { ja:"ロシア語", en:"Russian", zh:"俄语", ko:"러시아어", es:"Ruso", pt:"Russo" },
    nl: { ja:"オランダ語", en:"Dutch", zh:"荷兰语", ko:"네덜란드어", es:"Neerlandés", pt:"Holandês" },
    el: { ja:"ギリシャ語", en:"Greek", zh:"希腊语", ko:"그리스어", es:"Griego", pt:"Grego" },
    mn: { ja:"モンゴル語", en:"Mongolian", zh:"蒙古语", ko:"몽골어", es:"Mongol", pt:"Mongol" },
  };
  return names[code]?.[uiLang] || names[code]?.en || code;
}

// ─────────────────────────────────────────────────────────
// LANGUAGES
// ─────────────────────────────────────────────────────────
const LANGS = [
  { code:"ja", label:"🇯🇵 日本語" },
  { code:"en", label:"🇺🇸 English" },
  { code:"zh", label:"🇨🇳 中文" },
  { code:"ko", label:"🇰🇷 한국어" },
  { code:"es", label:"🇪🇸 Español" },
  { code:"pt", label:"🇧🇷 Português" },
];

// ─────────────────────────────────────────────────────────
// TRANSLATIONS (UI strings)
// ─────────────────────────────────────────────────────────
const T = {
  ja:{
    sub:"現地物価 AI判定", c20:"🌍 30カ国以上",
    rLive:"📡 リアルタイム為替", rFix:"📌 固定レート", rLoad:"⏳ 取得中…",
    s1:"① 国", s2:"② 都市", s3:"③ カテゴリ", s4:"④ 食事タイプ", s4b:"④ 種類", s5:"⑤ 金額",
    judge:"🔍 判定する", cmpOn:"✅ 比較中", cmpOff:"🔄 比較", add:"＋追加",
    avgL:"平均", minL:"最安", maxL:"最高",
    cheap:"安い！", normal:"普通", exp:"高め",
    cheapD:(p)=>`平均より${p}%お得！`, expD:(p)=>`平均より${p}%高め`, normalD:"現地相場内です",
    priceD:"📊 相場データ",
    trendUp:(t)=>`📈 直近: ${t}値上がり`, trendSt:(t)=>`📊 直近: ${t}`,
    postT:"📍 価格を投稿", postD:"実際に払った金額を共有してDBに貢献！",
    postPh:"品目名", postSv:"保存", postOk:"✅ 保存しました！",
    noData:"データ準備中です", noCmp:"品目名と金額を入力", noPrice:"データなし",
    added:(n)=>`「${n}」追加`, dist:"距離 (km)", time:"時間帯",
    am:"朝", noon:"昼", pm:"夕方", late:"深夜", approx:(v)=>`≈ ${v} 円`,
    tabC:"判定", tabS:"詐欺警告", tabTr:"翻訳", tabTv:"旅行", tabTd:"トレンド", tabD:"DB",
    checkT:"💴 価格判定", checkD:"国・カテゴリ・金額を入力してAI判定",
    scamT:"⚠️ 詐欺・安全情報", scamD:"都市別の手口と対策",
    scamSel:"国と都市を選んでください",
    scamNote:"🛡️ 困ったときは現地警察か日本大使館へ。外務省「たびレジ」への登録も推奨。",
    lH:"🔴 要注意", lM:"🟡 注意", lL:"🟢 軽度",
    transT:"🌐 翻訳・通訳",
    transD:"双方向リアルタイム翻訳",
    transSelCountry:"国を選んでください",
    transYou:"あなた → 現地語",
    transPartner:"相手 → あなたの言語",
    transTap:"🎙️ タップして話す",
    transListening:"🔴 聞いています...",
    transTranslating:"⏳ 翻訳中...",
    transSpeak:"🔊 発音",
    transCopy:"📋 コピー",
    transCopied:"✅ コピー済み",
    transError:"翻訳できませんでした",
    transNoSupport:"このブラウザは音声認識に対応していません",
    transFixed:"🆘 緊急フレーズ（オフライン）",
    travT:"旅行便利サイト", travD:"公式・信頼できるサービスのみ",
    travNote:"政府機関・公式サービスのみ掲載",
    trendT:"物価トレンド", trendD:"ユーザー投稿から見えるリアルな相場変動",
    prev:"前回", now:"現在",
    dbT:"投稿DB", dbD:"みんなが保存した価格データ",
    dbE:"まだ投稿がありません。判定後に投稿してDBを育てよう！",
    itemPh:"品目名（例：パッタイ、ステーキ）", amtPh:"金額",
    cityAll:"すべての都市", regionAll:"すべて",
    regionAsia:"アジア", regionEurope:"ヨーロッパ",
    regionAmericas:"南北米", regionOceania:"オセアニア",
    regionMideast:"中東・アフリカ",
    negotiateTitle:"💬 値段交渉アシスタント",
    negotiateDesc:"「高め」と判定されました。交渉してみましょう！",
    negotiateYou:"日本語で交渉したいことを話してください",
    negotiatePartner:"相手の言葉をここで聞かせてください",
    selectCountryAbove:"⬆️ 上で国を選んでください",
    selectCountry:"国を選択",
    countrySearchPh:"国名 or 頭文字（例: J = Japan）",
    transChange:"変更",
    transTextPh:"話したいことを入力するか、マイクを長押し...",
    transPartnerTextPh:"相手の言葉を入力するか、マイクを長押し...",
    transHold:"長押しで話す",
    transHoldHint:"⬇️ 長押しで話す（話し終わったら離す）",
    transTranslate:"翻訳",
    micShort:"マイク",
    negYouPh:"交渉フレーズを入力するか、マイクを長押し...",
    negPartnerPh:"相手の言葉を入力するか、マイクを長押し...",
    postComment:"コメント・体験談を書く（任意）...",
    postPhoto:"写真",
    postPostBtn:"投稿",
    settingsTitle:"⚙️ 使い方・設定",
    settingsNote:"💡 このアプリはAnthropic Claude AIを活用しています。翻訳・価格判定にはインターネット接続が必要です。",
    scamCityHdr:"🏙️ 都市",
    scamCountryAll:"国全体",
    scamCityHdr2:"国全体の注意事項",
    scamCitySpecific:"の固有アラート",
    speakHintHdr:"🔊で旅行先の言語で発音します",
  },
  en:{
    sub:"Local Price AI Judge", c20:"🌍 30+ Countries",
    rLive:"📡 Live Rate", rFix:"📌 Fixed Rate", rLoad:"⏳ Loading…",
    s1:"① Country", s2:"② City", s3:"③ Category", s4:"④ Food Type", s4b:"④ Type", s5:"⑤ Amount",
    judge:"🔍 Judge Price", cmpOn:"✅ Comparing", cmpOff:"🔄 Compare", add:"＋Add",
    avgL:"Avg", minL:"Min", maxL:"Max",
    cheap:"Cheap!", normal:"Fair", exp:"Pricey",
    cheapD:(p)=>`${p}% below avg!`, expD:(p)=>`${p}% above avg`, normalD:"Within local average",
    priceD:"📊 Price Data",
    trendUp:(t)=>`📈 Recent: +${t}`, trendSt:(t)=>`📊 Recent: ${t}`,
    postT:"📍 Submit a Price", postD:"Share what you paid!",
    postPh:"Item name", postSv:"Save", postOk:"✅ Saved!",
    noData:"Data coming soon", noCmp:"Enter item name and amount", noPrice:"No data",
    added:(n)=>`Added "${n}"`, dist:"Distance (km)", time:"Time of Day",
    am:"Morning", noon:"Noon", pm:"Evening", late:"Late Night", approx:(v)=>`≈ ¥${v}`,
    tabC:"Judge", tabS:"Scams", tabTr:"Translate", tabTv:"Travel", tabTd:"Trends", tabD:"DB",
    checkT:"💴 Price Check", checkD:"Enter country, category & amount for AI judgement",
    scamT:"⚠️ Scam & Safety", scamD:"City-specific scams and tips",
    scamSel:"Select a country and city",
    scamNote:"🛡️ If in trouble, contact local police or your embassy.",
    lH:"🔴 High Risk", lM:"🟡 Caution", lL:"🟢 Minor",
    transT:"🌐 Translate & Interpret",
    transD:"Real-time two-way translation",
    transSelCountry:"Select a country",
    transYou:"You → Local Language",
    transPartner:"Partner → Your Language",
    transTap:"🎙️ Tap to speak",
    transListening:"🔴 Listening...",
    transTranslating:"⏳ Translating...",
    transSpeak:"🔊 Speak",
    transCopy:"📋 Copy",
    transCopied:"✅ Copied",
    transError:"Translation failed",
    transNoSupport:"Speech recognition not supported in this browser",
    transFixed:"🆘 Emergency Phrases (Offline)",
    travT:"Travel Resources", travD:"Official & trusted services only",
    travNote:"Official services only",
    trendT:"Price Trends", trendD:"Real price changes from user submissions",
    prev:"Before", now:"Now",
    dbT:"Price DB", dbD:"Real prices from our community",
    dbE:"No submissions yet.",
    itemPh:"Item name (e.g. Pad Thai, Steak)", amtPh:"Amount",
    cityAll:"All Cities", regionAll:"All",
    regionAsia:"Asia", regionEurope:"Europe",
    regionAmericas:"Americas", regionOceania:"Oceania",
    regionMideast:"Middle East & Africa",
    negotiateTitle:"💬 Negotiation Assistant",
    negotiateDesc:"Price is 'Pricey'. Let's negotiate!",
    negotiateYou:"Speak what you want to say",
    negotiatePartner:"Let the other person speak here",
    selectCountryAbove:"⬆️ Please select a country above",
    selectCountry:"Select Country",
    countrySearchPh:"Country or initial (e.g. J = Japan)",
    transChange:"Change",
    transTextPh:"Type what you want to say or hold mic...",
    transPartnerTextPh:"Type partner's words or hold mic...",
    transHold:"Hold to speak",
    transHoldHint:"⬇️ Press and hold to speak (release when done)",
    transTranslate:"Translate",
    micShort:"Mic",
    negYouPh:"Type negotiation phrase or hold mic...",
    negPartnerPh:"Type partner's words or hold mic...",
    postComment:"Add comments or experience (optional)...",
    postPhoto:"Photo",
    postPostBtn:"Post",
    settingsTitle:"⚙️ How to use",
    settingsNote:"💡 This app uses Anthropic Claude AI. Internet required for translation and price judgement.",
    scamCityHdr:"🏙️ City",
    scamCountryAll:"All National",
    scamCityHdr2:"National warnings",
    scamCitySpecific:" specific alerts",
    speakHintHdr:"Tap 🔊 to hear in local language",
  },
  zh:{
    sub:"当地物价 AI 判断", c20:"🌍 30+个国家",
    rLive:"📡 实时汇率", rFix:"📌 固定汇率", rLoad:"⏳ 加载中…",
    s1:"① 国家", s2:"② 城市", s3:"③ 分类", s4:"④ 餐饮类型", s4b:"④ 细分", s5:"⑤ 金额",
    judge:"🔍 开始判断", cmpOn:"✅ 比较中", cmpOff:"🔄 对比", add:"＋添加",
    avgL:"均价", minL:"最低", maxL:"最高",
    cheap:"便宜！", normal:"合理", exp:"偏贵",
    cheapD:(p)=>`比均价低${p}%！`, expD:(p)=>`比均价高${p}%`, normalD:"在当地均价范围内",
    priceD:"📊 价格数据",
    trendUp:(t)=>`📈 近期: 涨${t}`, trendSt:(t)=>`📊 近期: ${t}`,
    postT:"📍 提交价格", postD:"分享您的价格！",
    postPh:"商品名", postSv:"保存", postOk:"✅ 已保存！",
    noData:"数据准备中", noCmp:"请输入商品名和金额", noPrice:"暂无数据",
    added:(n)=>`已添加「${n}」`, dist:"距离 (km)", time:"时间段",
    am:"早晨", noon:"中午", pm:"傍晚", late:"深夜", approx:(v)=>`≈ ¥${v}（日元）`,
    tabC:"判断", tabS:"诈骗警告", tabTr:"翻译", tabTv:"旅行", tabTd:"趋势", tabD:"数据库",
    checkT:"💴 价格判断", checkD:"输入国家、类别和金额进行AI判断",
    scamT:"⚠️ 诈骗与安全", scamD:"城市诈骗手段与应对",
    scamSel:"请选择国家和城市",
    scamNote:"🛡️ 遇到麻烦请联系当地警察或您国家的大使馆。",
    lH:"🔴 高风险", lM:"🟡 注意", lL:"🟢 轻微",
    transT:"🌐 翻译与口译",
    transD:"实时双向翻译",
    transSelCountry:"请选择国家",
    transYou:"您 → 当地语言",
    transPartner:"对方 → 您的语言",
    transTap:"🎙️ 点击说话",
    transListening:"🔴 正在听...",
    transTranslating:"⏳ 翻译中...",
    transSpeak:"🔊 发音",
    transCopy:"📋 复制",
    transCopied:"✅ 已复制",
    transError:"翻译失败",
    transNoSupport:"此浏览器不支持语音识别",
    transFixed:"🆘 紧急短语（离线）",
    travT:"旅行实用网站", travD:"仅收录官方及可信赖服务",
    travNote:"仅收录官方服务",
    trendT:"物价趋势", trendD:"来自用户提交的实际价格变动",
    prev:"之前", now:"现在",
    dbT:"提交的价格", dbD:"来自社区的真实价格数据",
    dbE:"暂无提交。",
    itemPh:"商品名（例：炒河粉、牛排）", amtPh:"金额",
    cityAll:"所有城市", regionAll:"全部",
    regionAsia:"亚洲", regionEurope:"欧洲",
    regionAmericas:"美洲", regionOceania:"大洋洲",
    regionMideast:"中东与非洲",
    negotiateTitle:"💬 砍价助手",
    negotiateDesc:"价格偏高，来砍个价吧！",
    negotiateYou:"说出您想说的话",
    negotiatePartner:"让对方在这里说话",
    selectCountryAbove:"⬆️ 请在上方选择国家",
    selectCountry:"选择国家",
    countrySearchPh:"国家名或首字母（例: J = Japan）",
    transChange:"更改",
    transTextPh:"输入或长按麦克风说话...",
    transPartnerTextPh:"输入对方的话或长按麦克风...",
    transHold:"长按说话",
    transHoldHint:"⬇️ 长按说话（说完松开）",
    transTranslate:"翻译",
    micShort:"麦克风",
    negYouPh:"输入砍价短语或长按麦克风...",
    negPartnerPh:"输入对方的话或长按麦克风...",
    postComment:"添加评论或体验（可选）...",
    postPhoto:"照片",
    postPostBtn:"发布",
    settingsTitle:"⚙️ 使用说明",
    settingsNote:"💡 此应用使用 Anthropic Claude AI。翻译和价格判断需要网络连接。",
    scamCityHdr:"🏙️ 城市",
    scamCountryAll:"全国",
    scamCityHdr2:"全国注意事项",
    scamCitySpecific:"的专属警告",
    speakHintHdr:"🔊播放当地语言",
  },
  ko:{
    sub:"현지 물가 AI 판정", c20:"🌍 30개국 이상",
    rLive:"📡 실시간 환율", rFix:"📌 고정 환율", rLoad:"⏳ 로딩 중…",
    s1:"① 국가", s2:"② 도시", s3:"③ 카테고리", s4:"④ 음식 유형", s4b:"④ 세부", s5:"⑤ 금액",
    judge:"🔍 판정하기", cmpOn:"✅ 비교 중", cmpOff:"🔄 비교", add:"＋추가",
    avgL:"평균", minL:"최저", maxL:"최고",
    cheap:"저렴해요!", normal:"적당해요", exp:"비싸요",
    cheapD:(p)=>`평균보다 ${p}% 저렴!`, expD:(p)=>`평균보다 ${p}% 비쌈`, normalD:"현지 평균 범위 내",
    priceD:"📊 가격 데이터",
    trendUp:(t)=>`📈 최근: ${t} 인상`, trendSt:(t)=>`📊 최근: ${t}`,
    postT:"📍 가격 제출", postD:"실제 가격을 공유해주세요!",
    postPh:"항목명", postSv:"저장", postOk:"✅ 저장되었습니다!",
    noData:"데이터 준비 중", noCmp:"항목명과 금액을 입력해주세요", noPrice:"데이터 없음",
    added:(n)=>`「${n}」 추가됨`, dist:"이동 거리 (km)", time:"시간대",
    am:"아침", noon:"낮", pm:"저녁", late:"심야", approx:(v)=>`≈ ¥${v}（엔）`,
    tabC:"판정", tabS:"사기 경보", tabTr:"번역", tabTv:"여행", tabTd:"트렌드", tabD:"DB",
    checkT:"💴 가격 판정", checkD:"국가, 카테고리, 금액을 입력하여 AI 판정",
    scamT:"⚠️ 사기·안전 경보", scamD:"도시별 수법과 대처법",
    scamSel:"국가와 도시를 선택해주세요",
    scamNote:"🛡️ 문제가 생기면 현지 경찰이나 한국 대사관에 연락하세요.",
    lH:"🔴 주의 필수", lM:"🟡 주의", lL:"🟢 경미",
    transT:"🌐 번역·통역",
    transD:"실시간 양방향 번역",
    transSelCountry:"국가를 선택해주세요",
    transYou:"나 → 현지어",
    transPartner:"상대방 → 내 언어",
    transTap:"🎙️ 탭하여 말하기",
    transListening:"🔴 듣는 중...",
    transTranslating:"⏳ 번역 중...",
    transSpeak:"🔊 발음",
    transCopy:"📋 복사",
    transCopied:"✅ 복사됨",
    transError:"번역 실패",
    transNoSupport:"이 브라우저는 음성 인식을 지원하지 않습니다",
    transFixed:"🆘 긴급 표현 (오프라인)",
    travT:"여행 편의 사이트", travD:"공식 및 신뢰할 수 있는 서비스만",
    travNote:"공식 서비스만 수록",
    trendT:"물가 트렌드", trendD:"사용자 제출의 실제 가격 변동",
    prev:"이전", now:"현재",
    dbT:"제출된 가격", dbD:"커뮤니티의 실제 가격 데이터",
    dbE:"아직 없습니다.",
    itemPh:"항목명 (예: 팟타이, 스테이크)", amtPh:"금액",
    cityAll:"모든 도시", regionAll:"전체",
    regionAsia:"아시아", regionEurope:"유럽",
    regionAmericas:"아메리카", regionOceania:"오세아니아",
    regionMideast:"중동·아프리카",
    negotiateTitle:"💬 흥정 도우미",
    negotiateDesc:"가격이 비쌉니다. 흥정해봅시다!",
    negotiateYou:"하고 싶은 말을 하세요",
    negotiatePartner:"상대방이 여기서 말하게 하세요",
    selectCountryAbove:"⬆️ 위에서 국가를 선택해주세요",
    selectCountry:"국가 선택",
    countrySearchPh:"국가명 또는 첫글자 (예: J = Japan)",
    transChange:"변경",
    transTextPh:"말하고 싶은 내용 입력 또는 마이크 길게 누르기...",
    transPartnerTextPh:"상대방 말 입력 또는 마이크 길게 누르기...",
    transHold:"길게 눌러 말하기",
    transHoldHint:"⬇️ 길게 누르고 말하기 (끝나면 떼기)",
    transTranslate:"번역",
    micShort:"마이크",
    negYouPh:"흥정 문구 입력 또는 마이크 길게 누르기...",
    negPartnerPh:"상대방 말 입력 또는 마이크 길게 누르기...",
    postComment:"코멘트나 체험담 (선택)...",
    postPhoto:"사진",
    postPostBtn:"게시",
    settingsTitle:"⚙️ 사용 방법",
    settingsNote:"💡 이 앱은 Anthropic Claude AI를 사용합니다. 번역과 가격 판정에는 인터넷 연결이 필요합니다.",
    scamCityHdr:"🏙️ 도시",
    scamCountryAll:"전국",
    scamCityHdr2:"전국 주의사항",
    scamCitySpecific:" 전용 경보",
    speakHintHdr:"🔊로 현지 언어로 들을 수 있습니다",
  },
  es:{
    sub:"Precio Local IA", c20:"🌍 30+ Países",
    rLive:"📡 Tipo en vivo", rFix:"📌 Tipo fijo", rLoad:"⏳ Cargando…",
    s1:"① País", s2:"② Ciudad", s3:"③ Categoría", s4:"④ Tipo de comida", s4b:"④ Tipo", s5:"⑤ Precio",
    judge:"🔍 Evaluar precio", cmpOn:"✅ Comparando", cmpOff:"🔄 Comparar", add:"＋Añadir",
    avgL:"Prom", minL:"Mín", maxL:"Máx",
    cheap:"¡Barato!", normal:"Justo", exp:"Caro",
    cheapD:(p)=>`${p}% bajo el promedio`, expD:(p)=>`${p}% sobre el promedio`, normalD:"Dentro del promedio local",
    priceD:"📊 Datos de precio",
    trendUp:(t)=>`📈 Reciente: +${t}`, trendSt:(t)=>`📊 Reciente: ${t}`,
    postT:"📍 Enviar precio", postD:"¡Comparte lo que pagaste!",
    postPh:"Nombre del artículo", postSv:"Guardar", postOk:"✅ ¡Guardado!",
    noData:"Datos próximamente", noCmp:"Ingresa nombre y monto", noPrice:"Sin datos",
    added:(n)=>`Añadido "${n}"`, dist:"Distancia (km)", time:"Hora del día",
    am:"Mañana", noon:"Mediodía", pm:"Tarde", late:"Madrugada", approx:(v)=>`≈ ¥${v}`,
    tabC:"Evaluar", tabS:"Estafas", tabTr:"Traducir", tabTv:"Viaje", tabTd:"Tendencias", tabD:"DB",
    checkT:"💴 Evaluar Precio", checkD:"Introduce país, categoría e importe para IA",
    scamT:"⚠️ Estafas y seguridad", scamD:"Estafas por ciudad y consejos",
    scamSel:"Selecciona un país y ciudad",
    scamNote:"🛡️ Si estás en problemas, contacta a la policía local o tu embajada.",
    lH:"🔴 Alto riesgo", lM:"🟡 Precaución", lL:"🟢 Menor",
    transT:"🌐 Traducir e Interpretar",
    transD:"Traducción bidireccional en tiempo real",
    transSelCountry:"Selecciona un país",
    transYou:"Tú → Idioma local",
    transPartner:"La otra persona → Tu idioma",
    transTap:"🎙️ Toca para hablar",
    transListening:"🔴 Escuchando...",
    transTranslating:"⏳ Traduciendo...",
    transSpeak:"🔊 Hablar",
    transCopy:"📋 Copiar",
    transCopied:"✅ ¡Copiado!",
    transError:"Error de traducción",
    transNoSupport:"Este navegador no admite reconocimiento de voz",
    transFixed:"🆘 Frases de emergencia (sin conexión)",
    travT:"Recursos de viaje", travD:"Solo servicios oficiales",
    travNote:"Solo servicios oficiales",
    trendT:"Tendencias de precios", trendD:"Cambios reales de precios",
    prev:"Antes", now:"Ahora",
    dbT:"Base de datos", dbD:"Precios reales de la comunidad",
    dbE:"Sin envíos aún.",
    itemPh:"Nombre (ej: Pad Thai, Filete)", amtPh:"Monto",
    cityAll:"Todas las ciudades", regionAll:"Todo",
    regionAsia:"Asia", regionEurope:"Europa",
    regionAmericas:"Américas", regionOceania:"Oceanía",
    regionMideast:"Oriente Medio y África",
    negotiateTitle:"💬 Asistente de negociación",
    negotiateDesc:"El precio es caro. ¡Negocia!",
    negotiateYou:"Di lo que quieres decir",
    negotiatePartner:"Deja hablar a la otra persona aquí",
    selectCountryAbove:"⬆️ Por favor selecciona un país arriba",
    selectCountry:"Selecciona país",
    countrySearchPh:"País o inicial (ej. J = Japan)",
    transChange:"Cambiar",
    transTextPh:"Escribe o mantén pulsado el micrófono...",
    transPartnerTextPh:"Texto de la otra persona o mantén pulsado...",
    transHold:"Mantén pulsado para hablar",
    transHoldHint:"⬇️ Mantén pulsado para hablar (suelta al terminar)",
    transTranslate:"Traducir",
    micShort:"Mic",
    negYouPh:"Frase de negociación o mantén pulsado...",
    negPartnerPh:"Palabras de la otra persona o mantén pulsado...",
    postComment:"Comentarios o experiencia (opcional)...",
    postPhoto:"Foto",
    postPostBtn:"Publicar",
    settingsTitle:"⚙️ Cómo usar",
    settingsNote:"💡 Esta app usa Anthropic Claude AI. Se necesita internet para traducción y juicio de precios.",
    scamCityHdr:"🏙️ Ciudad",
    scamCountryAll:"Todo el país",
    scamCityHdr2:"Avisos nacionales",
    scamCitySpecific:" alertas específicas",
    speakHintHdr:"Toca 🔊 para escuchar en idioma local",
  },
  pt:{
    sub:"Preço Local IA", c20:"🌍 30+ Países",
    rLive:"📡 Taxa ao vivo", rFix:"📌 Taxa fixa", rLoad:"⏳ Carregando…",
    s1:"① País", s2:"② Cidade", s3:"③ Categoria", s4:"④ Tipo de comida", s4b:"④ Tipo", s5:"⑤ Valor",
    judge:"🔍 Avaliar preço", cmpOn:"✅ Comparando", cmpOff:"🔄 Comparar", add:"＋Adicionar",
    avgL:"Méd", minL:"Mín", maxL:"Máx",
    cheap:"Barato!", normal:"Justo", exp:"Caro",
    cheapD:(p)=>`${p}% abaixo da média`, expD:(p)=>`${p}% acima da média`, normalD:"Dentro da média local",
    priceD:"📊 Dados de preço",
    trendUp:(t)=>`📈 Recente: +${t}`, trendSt:(t)=>`📊 Recente: ${t}`,
    postT:"📍 Enviar preço", postD:"Compartilhe o que pagou!",
    postPh:"Nome do item", postSv:"Salvar", postOk:"✅ Salvo!",
    noData:"Dados em breve", noCmp:"Digite nome e valor", noPrice:"Sem dados",
    added:(n)=>`Adicionado "${n}"`, dist:"Distância (km)", time:"Hora do dia",
    am:"Manhã", noon:"Meio-dia", pm:"Tarde", late:"Madrugada", approx:(v)=>`≈ ¥${v}`,
    tabC:"Avaliar", tabS:"Golpes", tabTr:"Traduzir", tabTv:"Viagem", tabTd:"Tendências", tabD:"DB",
    checkT:"💴 Avaliar Preço", checkD:"Insira país, categoria e valor para IA",
    scamT:"⚠️ Golpes e segurança", scamD:"Golpes por cidade e dicas",
    scamSel:"Selecione um país e cidade",
    scamNote:"🛡️ Se estiver em apuros, contate a polícia local ou sua embaixada.",
    lH:"🔴 Alto risco", lM:"🟡 Cuidado", lL:"🟢 Menor",
    transT:"🌐 Traduzir e Interpretar",
    transD:"Tradução bidirecional em tempo real",
    transSelCountry:"Selecione um país",
    transYou:"Você → Idioma local",
    transPartner:"A outra pessoa → Seu idioma",
    transTap:"🎙️ Toque para falar",
    transListening:"🔴 Ouvindo...",
    transTranslating:"⏳ Traduzindo...",
    transSpeak:"🔊 Falar",
    transCopy:"📋 Copiar",
    transCopied:"✅ Copiado!",
    transError:"Erro na tradução",
    transNoSupport:"Este navegador não suporta reconhecimento de voz",
    transFixed:"🆘 Frases de emergência (offline)",
    travT:"Recursos de viagem", travD:"Apenas serviços oficiais",
    travNote:"Apenas serviços oficiais",
    trendT:"Tendências de preços", trendD:"Mudanças reais de preços",
    prev:"Antes", now:"Agora",
    dbT:"Banco de dados", dbD:"Preços reais da comunidade",
    dbE:"Sem envios ainda.",
    itemPh:"Nome (ex: Pad Thai, Bife)", amtPh:"Valor",
    cityAll:"Todas as cidades", regionAll:"Todos",
    regionAsia:"Ásia", regionEurope:"Europa",
    regionAmericas:"Américas", regionOceania:"Oceania",
    regionMideast:"Oriente Médio e África",
    negotiateTitle:"💬 Assistente de negociação",
    negotiateDesc:"O preço está caro. Vamos negociar!",
    negotiateYou:"Diga o que quer dizer",
    negotiatePartner:"Deixe a outra pessoa falar aqui",
    selectCountryAbove:"⬆️ Por favor selecione um país acima",
    selectCountry:"Selecionar país",
    countrySearchPh:"País ou inicial (ex. J = Japan)",
    transChange:"Mudar",
    transTextPh:"Digite ou segure o microfone para falar...",
    transPartnerTextPh:"Digite ou segure o microfone para a outra pessoa...",
    transHold:"Segure para falar",
    transHoldHint:"⬇️ Segure para falar (solte quando terminar)",
    transTranslate:"Traduzir",
    micShort:"Microfone",
    negYouPh:"Frase de negociação ou segure o microfone...",
    negPartnerPh:"Palavras da outra pessoa ou segure o microfone...",
    postComment:"Comentários ou experiência (opcional)...",
    postPhoto:"Foto",
    postPostBtn:"Publicar",
    settingsTitle:"⚙️ Como usar",
    settingsNote:"💡 Este app usa Anthropic Claude AI. Internet necessária para tradução e julgamento de preços.",
    scamCityHdr:"🏙️ Cidade",
    scamCountryAll:"Todo o país",
    scamCityHdr2:"Avisos nacionais",
    scamCitySpecific:" alertas específicos",
    speakHintHdr:"Toque 🔊 para ouvir no idioma local",
  },


};

const FALLBACK_RATES = {
  THB:0.0043, KRW:0.011, USD:155, JPY:1, SGD:115, EUR:168,
  AUD:100, MYR:34, IDR:0.0096, PHP:2.7, TWD:4.8, GBP:197,
  VND:0.006, INR:1.85, BRL:30, MXN:8.5, AED:42, ZAR:8.5,
  CAD:114, HKD:20, NZD:92, CNY:21, EGP:3.2, TRY:4.5,
  SAR:41, NOK:14, SEK:14, CHF:175, RUB:1.7,
};

async function fetchRates() {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/JPY");
    if (!r.ok) throw 0;
    const d = await r.json();
    const o = { JPY:1 };
    for (const [k,v] of Object.entries(d.rates)) { if (v>0) o[k]=1/v; }
    return o;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────
// COUNTRIES (全34カ国)
// ─────────────────────────────────────────────────────────
const COUNTRIES = [
// ── ASIA ──
{ name:"日本", flag:"🇯🇵", currency:"JPY", rate:1, region:"asia",
  label:{ja:"日本",en:"Japan",zh:"日本",ko:"일본",es:"Japón",pt:"Japão"},
  localLang:"ja", localLangName:"日本語",
  cities:{
    ja:["札幌・北海道","仙台","東京","横浜","名古屋","京都","大阪","神戸","広島","博多・福岡","那覇・沖縄"],
    en:["Sapporo","Sendai","Tokyo","Yokohama","Nagoya","Kyoto","Osaka","Kobe","Hiroshima","Fukuoka","Okinawa"],
    zh:["札幌","仙台","东京","横滨","名古屋","京都","大阪","神户","广岛","福冈","冲绳"],
    ko:["삿포로","센다이","도쿄","요코하마","나고야","교토","오사카","고베","히로시마","후쿠오카","오키나와"],
    es:["Sapporo","Sendai","Tokio","Yokohama","Nagoya","Kioto","Osaka","Kobe","Hiroshima","Fukuoka","Okinawa"],
    pt:["Sapporo","Sendai","Tóquio","Yokohama","Nagoya","Kyoto","Osaka","Kobe","Hiroshima","Fukuoka","Okinawa"],
  }
},
{ name:"韓国", flag:"🇰🇷", currency:"KRW", rate:0.106, region:"asia",
  label:{ja:"韓国",en:"South Korea",zh:"韩国",ko:"한국",es:"Corea del Sur",pt:"Coreia do Sul"},
  localLang:"ko", localLangName:"한국어",
  cities:{
    ja:["ソウル","仁川","釜山","大邱","済州島","全州","慶州","江陵"],
    en:["Seoul","Incheon","Busan","Daegu","Jeju","Jeonju","Gyeongju","Gangneung"],
    zh:["首尔","仁川","釜山","大邱","济州岛","全州","庆州","江陵"],
    ko:["서울","인천","부산","대구","제주도","전주","경주","강릉"],
    es:["Seúl","Incheon","Busan","Daegu","Jeju","Jeonju","Gyeongju","Gangneung"],
    pt:["Seul","Incheon","Busan","Daegu","Jeju","Jeonju","Gyeongju","Gangneung"],
  }
},
{ name:"タイ", flag:"🇹🇭", currency:"THB", rate:4.8, region:"asia",
  label:{ja:"タイ",en:"Thailand",zh:"泰国",ko:"태국",es:"Tailandia",pt:"Tailândia"},
  localLang:"th", localLangName:"ภาษาไทย",
  cities:{
    ja:["バンコク","チェンマイ","プーケット","パタヤ","クラビ","アユタヤ","サムイ島","チェンライ"],
    en:["Bangkok","Chiang Mai","Phuket","Pattaya","Krabi","Ayutthaya","Koh Samui","Chiang Rai"],
    zh:["曼谷","清迈","普吉岛","芭提雅","甲米","大城","苏梅岛","清莱"],
    ko:["방콕","치앙마이","푸켓","파타야","끄라비","아유타야","코사무이","치앙라이"],
    es:["Bangkok","Chiang Mai","Phuket","Pattaya","Krabi","Ayutthaya","Koh Samui","Chiang Rai"],
    pt:["Bangkok","Chiang Mai","Phuket","Pattaya","Krabi","Ayutthaya","Koh Samui","Chiang Rai"],
  }
},
{ name:"ベトナム", flag:"🇻🇳", currency:"VND", rate:0.006, region:"asia",
  label:{ja:"ベトナム",en:"Vietnam",zh:"越南",ko:"베트남",es:"Vietnam",pt:"Vietnã"},
  localLang:"vi", localLangName:"Tiếng Việt",
  cities:{
    ja:["ハノイ","ホーチミン","ダナン","ホイアン","フエ","ニャチャン","ダラット","ハロン湾"],
    en:["Hanoi","Ho Chi Minh City","Da Nang","Hoi An","Hue","Nha Trang","Da Lat","Ha Long Bay"],
    zh:["河内","胡志明市","岘港","会安","顺化","芽庄","大叻","下龙湾"],
    ko:["하노이","호치민","다낭","호이안","후에","나트랑","달랏","하롱베이"],
    es:["Hanói","Ho Chi Minh","Da Nang","Hoi An","Hue","Nha Trang","Da Lat","Ha Long"],
    pt:["Hanói","Ho Chi Minh","Da Nang","Hoi An","Hue","Nha Trang","Da Lat","Ha Long"],
  }
},
{ name:"インドネシア", flag:"🇮🇩", currency:"IDR", rate:0.0096, region:"asia",
  label:{ja:"インドネシア",en:"Indonesia",zh:"印度尼西亚",ko:"인도네시아",es:"Indonesia",pt:"Indonésia"},
  localLang:"id", localLangName:"Bahasa Indonesia",
  cities:{
    ja:["バリ島","ジャカルタ","ジョグジャカルタ","スラバヤ","ロンボク","コモド","バンドン","メダン"],
    en:["Bali","Jakarta","Yogyakarta","Surabaya","Lombok","Komodo","Bandung","Medan"],
    zh:["巴厘岛","雅加达","日惹","泗水","龙目岛","科莫多","万隆","棉兰"],
    ko:["발리","자카르타","족자카르타","수라바야","롬복","코모도","반둥","메단"],
    es:["Bali","Yakarta","Yogyakarta","Surabaya","Lombok","Komodo","Bandung","Medan"],
    pt:["Bali","Jacarta","Yogyakarta","Surabaya","Lombok","Komodo","Bandung","Medan"],
  }
},
{ name:"マレーシア", flag:"🇲🇾", currency:"MYR", rate:34, region:"asia",
  label:{ja:"マレーシア",en:"Malaysia",zh:"马来西亚",ko:"말레이시아",es:"Malasia",pt:"Malásia"},
  localLang:"ms", localLangName:"Bahasa Melayu",
  cities:{
    ja:["クアラルンプール","ペナン","コタキナバル","マラッカ","ランカウイ","ジョホールバル","イポー","クチン"],
    en:["Kuala Lumpur","Penang","Kota Kinabalu","Malacca","Langkawi","Johor Bahru","Ipoh","Kuching"],
    zh:["吉隆坡","槟城","哥打基纳巴卢","马六甲","兰卡威","新山","怡保","古晋"],
    ko:["쿠알라룸푸르","페낭","코타키나발루","말라카","랑카위","조호르바루","이포","쿠칭"],
    es:["Kuala Lumpur","Penang","Kota Kinabalu","Malaca","Langkawi","Johor Bahru","Ipoh","Kuching"],
    pt:["Kuala Lumpur","Penang","Kota Kinabalu","Malaca","Langkawi","Johor Bahru","Ipoh","Kuching"],
  }
},
{ name:"フィリピン", flag:"🇵🇭", currency:"PHP", rate:2.7, region:"asia",
  label:{ja:"フィリピン",en:"Philippines",zh:"菲律宾",ko:"필리핀",es:"Filipinas",pt:"Filipinas"},
  localLang:"en", localLangName:"Filipino/English",
  cities:{
    ja:["マニラ","セブ島","ボラカイ","ダバオ","パラワン","バギオ","イロイロ","タガイタイ"],
    en:["Manila","Cebu","Boracay","Davao","Palawan","Baguio","Iloilo","Tagaytay"],
    zh:["马尼拉","宿务","长滩岛","达沃","巴拉望","碧瑶","伊洛伊洛","塔加伊塔伊"],
    ko:["마닐라","세부","보라카이","다바오","팔라완","바기오","일로일로","타가이타이"],
    es:["Manila","Cebú","Boracay","Davao","Palawan","Baguio","Iloilo","Tagaytay"],
    pt:["Manila","Cebu","Boracay","Davao","Palawan","Baguio","Iloilo","Tagaytay"],
  }
},
{ name:"台湾", flag:"🇹🇼", currency:"TWD", rate:4.8, region:"asia",
  label:{ja:"台湾",en:"Taiwan",zh:"台湾",ko:"대만",es:"Taiwán",pt:"Taiwan"},
  localLang:"zh", localLangName:"繁體中文",
  cities:{
    ja:["台北","台中","台南","高雄","花蓮","台東","嘉義","墾丁"],
    en:["Taipei","Taichung","Tainan","Kaohsiung","Hualien","Taitung","Chiayi","Kenting"],
    zh:["台北","台中","台南","高雄","花莲","台东","嘉义","垦丁"],
    ko:["타이베이","타이중","타이난","가오슝","화롄","타이둥","자이","컨딩"],
    es:["Taipei","Taichung","Tainan","Kaohsiung","Hualien","Taitung","Chiayi","Kenting"],
    pt:["Taipei","Taichung","Tainan","Kaohsiung","Hualien","Taitung","Chiayi","Kenting"],
  }
},
{ name:"シンガポール", flag:"🇸🇬", currency:"SGD", rate:115, region:"asia",
  label:{ja:"シンガポール",en:"Singapore",zh:"新加坡",ko:"싱가포르",es:"Singapur",pt:"Singapura"},
  localLang:"en", localLangName:"English/Singlish",
  cities:{
    ja:["マリーナベイ","オーチャード","チャイナタウン","リトルインディア","セントーサ","クラークキー"],
    en:["Marina Bay","Orchard","Chinatown","Little India","Sentosa","Clarke Quay"],
    zh:["滨海湾","乌节路","唐人街","小印度","圣淘沙","克拉码头"],
    ko:["마리나베이","오차드","차이나타운","리틀인디아","센토사","클락키"],
    es:["Marina Bay","Orchard","Chinatown","Pequeña India","Sentosa","Clarke Quay"],
    pt:["Marina Bay","Orchard","Chinatown","Pequena Índia","Sentosa","Clarke Quay"],
  }
},
{ name:"インド", flag:"🇮🇳", currency:"INR", rate:1.85, region:"asia",
  label:{ja:"インド",en:"India",zh:"印度",ko:"인도",es:"India",pt:"Índia"},
  localLang:"hi", localLangName:"हिंदी",
  cities:{
    ja:["デリー","ムンバイ","バンガロール","チェンナイ","コルカタ","ジャイプール","アグラ","ゴア","ハイデラバード","プネー"],
    en:["Delhi","Mumbai","Bangalore","Chennai","Kolkata","Jaipur","Agra","Goa","Hyderabad","Pune"],
    zh:["德里","孟买","班加罗尔","金奈","加尔各答","斋浦尔","阿格拉","果阿","海得拉巴","浦那"],
    ko:["델리","뭄바이","방갈로르","첸나이","콜카타","자이푸르","아그라","고아","하이데라바드","푸네"],
    es:["Delhi","Bombay","Bangalore","Chennai","Calcuta","Jaipur","Agra","Goa","Hyderabad","Pune"],
    pt:["Delhi","Mumbai","Bangalore","Chennai","Calcutá","Jaipur","Agra","Goa","Hyderabad","Pune"],
  }
},
{ name:"中国", flag:"🇨🇳", currency:"CNY", rate:21, region:"asia",
  label:{ja:"中国",en:"China",zh:"中国",ko:"중국",es:"China",pt:"China"},
  localLang:"zh", localLangName:"普通话",
  cities:{
    ja:["北京","上海","広州","深圳","成都","重慶","杭州","西安","南京","大連"],
    en:["Beijing","Shanghai","Guangzhou","Shenzhen","Chengdu","Chongqing","Hangzhou","Xi'an","Nanjing","Dalian"],
    zh:["北京","上海","广州","深圳","成都","重庆","杭州","西安","南京","大连"],
    ko:["베이징","상하이","광저우","선전","청두","충칭","항저우","시안","난징","다롄"],
    es:["Pekín","Shanghái","Guangzhou","Shenzhen","Chengdu","Chongqing","Hangzhou","Xi'an","Nanjing","Dalian"],
    pt:["Pequim","Xangai","Guangzhou","Shenzhen","Chengdu","Chongqing","Hangzhou","Xi'an","Nanjing","Dalian"],
  }
},
{ name:"モンゴル", flag:"🇲🇳", currency:"MNT", rate:0.045, region:"asia",
  label:{ja:"モンゴル",en:"Mongolia",zh:"蒙古",ko:"몽골",es:"Mongolia",pt:"Mongólia"},
  localLang:"mn", localLangName:"Монгол",
  cities:{
    ja:["ウランバートル","カラコルム","テレルジ","ホブド","ダルハン"],
    en:["Ulaanbaatar","Karakorum","Terelj","Khovd","Darkhan"],
    zh:["乌兰巴托","哈剌和林","特勒吉","科布多","达尔汗"],
    ko:["울란바토르","카라코룸","테렐지","호브드","다르항"],
    es:["Ulán Bator","Karakorum","Terelj","Khovd","Darkhan"],
    pt:["Ulan Bator","Karakorum","Terelj","Khovd","Darkhan"],
  }
},
{ name:"モルディブ", flag:"🇲🇻", currency:"MVR", rate:10, region:"asia",
  label:{ja:"モルディブ",en:"Maldives",zh:"马尔代夫",ko:"몰디브",es:"Maldivas",pt:"Maldivas"},
  localLang:"en", localLangName:"Dhivehi/English",
  cities:{
    ja:["マレ","サウスアリ環礁","北マレ環礁","バア環礁","ラ環礁"],
    en:["Malé","South Ari Atoll","North Malé Atoll","Baa Atoll","Lhaviyani Atoll"],
    zh:["马累","南阿里环礁","北马累环礁","巴环礁","拉环礁"],
    ko:["말레","사우스아리환초","노스말레환초","바환초","라비야니환초"],
    es:["Malé","Atolón South Ari","Atolón North Malé","Atolón Baa","Atolón Lhaviyani"],
    pt:["Malé","Atol South Ari","Atol North Malé","Atol Baa","Atol Lhaviyani"],
  }
},
{ name:"ラオス", flag:"🇱🇦", currency:"LAK", rate:0.0075, region:"asia",
  label:{ja:"ラオス",en:"Laos",zh:"老挝",ko:"라오스",es:"Laos",pt:"Laos"},
  localLang:"lo", localLangName:"ພາສາລາວ",
  cities:{
    ja:["ビエンチャン","ルアンパバーン","バンビエン","パークセー","サワンナケート"],
    en:["Vientiane","Luang Prabang","Vang Vieng","Pakse","Savannakhet"],
    zh:["万象","琅勃拉邦","万荣","巴色","沙湾拿吉"],
    ko:["비엔티안","루앙프라방","방비엥","팍세","사완나켓"],
    es:["Vientián","Luang Prabang","Vang Vieng","Pakse","Savannakhet"],
    pt:["Vientiane","Luang Prabang","Vang Vieng","Pakse","Savannakhet"],
  }
},
{ name:"カンボジア", flag:"🇰🇭", currency:"KHR", rate:0.038, region:"asia",
  label:{ja:"カンボジア",en:"Cambodia",zh:"柬埔寨",ko:"캄보디아",es:"Camboya",pt:"Camboja"},
  localLang:"km", localLangName:"ខ្មែរ",
  cities:{
    ja:["プノンペン","シェムリアップ","シアヌークビル","バッタンバン","コンポントム"],
    en:["Phnom Penh","Siem Reap","Sihanoukville","Battambang","Kampong Thom"],
    zh:["金边","暹粒","西哈努克市","马德望","磅同"],
    ko:["프놈펜","씨엠립","시아누크빌","바탐방","캄퐁톰"],
    es:["Phnom Penh","Siem Reap","Sihanoukville","Battambang","Kampong Thom"],
    pt:["Phnom Penh","Siem Reap","Sihanoukville","Battambang","Kampong Thom"],
  }
},
// ── OCEANIA ──
{ name:"オーストラリア", flag:"🇦🇺", currency:"AUD", rate:100, region:"oceania",
  label:{ja:"オーストラリア",en:"Australia",zh:"澳大利亚",ko:"호주",es:"Australia",pt:"Austrália"},
  localLang:"en", localLangName:"English",
  cities:{
    ja:["シドニー","メルボルン","ブリスベン","パース","アデレード","ケアンズ","ゴールドコースト","ダーウィン","ホバート","キャンベラ"],
    en:["Sydney","Melbourne","Brisbane","Perth","Adelaide","Cairns","Gold Coast","Darwin","Hobart","Canberra"],
    zh:["悉尼","墨尔本","布里斯班","珀斯","阿德莱德","凯恩斯","黄金海岸","达尔文","霍巴特","堪培拉"],
    ko:["시드니","멜버른","브리즈번","퍼스","애들레이드","케언즈","골드코스트","다윈","호바트","캔버라"],
    es:["Sídney","Melbourne","Brisbane","Perth","Adelaida","Cairns","Gold Coast","Darwin","Hobart","Canberra"],
    pt:["Sydney","Melbourne","Brisbane","Perth","Adelaide","Cairns","Gold Coast","Darwin","Hobart","Canberra"],
  }
},
{ name:"ニュージーランド", flag:"🇳🇿", currency:"NZD", rate:92, region:"oceania",
  label:{ja:"ニュージーランド",en:"New Zealand",zh:"新西兰",ko:"뉴질랜드",es:"Nueva Zelanda",pt:"Nova Zelândia"},
  localLang:"en", localLangName:"English",
  cities:{
    ja:["オークランド","クライストチャーチ","ウェリントン","クイーンズタウン","ロトルア","ダニーデン","ネルソン","タウポ"],
    en:["Auckland","Christchurch","Wellington","Queenstown","Rotorua","Dunedin","Nelson","Taupo"],
    zh:["奥克兰","基督城","惠灵顿","皇后镇","罗托鲁阿","但尼丁","尼尔森","陶波"],
    ko:["오클랜드","크라이스트처치","웰링턴","퀸스타운","로토루아","더니든","넬슨","타우포"],
    es:["Auckland","Christchurch","Wellington","Queenstown","Rotorua","Dunedin","Nelson","Taupo"],
    pt:["Auckland","Christchurch","Wellington","Queenstown","Rotorua","Dunedin","Nelson","Taupo"],
  }
},
{ name:"ハワイ", flag:"🌺", currency:"USD", rate:155, region:"oceania",
  label:{ja:"ハワイ",en:"Hawaii",zh:"夏威夷",ko:"하와이",es:"Hawái",pt:"Havaí"},
  localLang:"en", localLangName:"English/Hawaiian",
  cities:{
    ja:["ホノルル・ワイキキ","マウイ島","ハワイ島（ビッグアイランド）","カウアイ島","モロカイ島"],
    en:["Honolulu/Waikiki","Maui","Big Island (Hawaii)","Kauai","Molokai"],
    zh:["火奴鲁鲁/威基基","毛伊岛","夏威夷岛（大岛）","考艾岛","莫洛凯岛"],
    ko:["호놀룰루/와이키키","마우이","빅아일랜드","카우아이","몰로카이"],
    es:["Honolulu/Waikiki","Maui","Isla Grande (Hawaii)","Kauai","Molokai"],
    pt:["Honolulu/Waikiki","Maui","Ilha Grande (Hawaii)","Kauai","Molokai"],
  }
},
{ name:"グアム", flag:"🌴", currency:"USD", rate:155, region:"oceania",
  label:{ja:"グアム",en:"Guam",zh:"关岛",ko:"괌",es:"Guam",pt:"Guam"},
  localLang:"en", localLangName:"English/Chamorro",
  cities:{
    ja:["タモン","ハガニア","アガニア","ツモン湾","マンギラオ"],
    en:["Tumon","Hagåtña","Agana","Tumon Bay","Mangilao"],
    zh:["塔穆宁","阿加尼亚","阿加纳","塔穆宁湾","曼吉拉奥"],
    ko:["투몬","하갓냐","아가나","투몬베이","망힐라오"],
    es:["Tumon","Hagåtña","Agana","Bahía Tumon","Mangilao"],
    pt:["Tumon","Hagåtña","Agana","Baía Tumon","Mangilao"],
  }
},
// ── EUROPE ──
{ name:"イタリア", flag:"🇮🇹", currency:"EUR", rate:168, region:"europe",
  label:{ja:"イタリア",en:"Italy",zh:"意大利",ko:"이탈리아",es:"Italia",pt:"Itália"},
  localLang:"it", localLangName:"Italiano",
  cities:{
    ja:["ローマ","ミラノ","フィレンツェ","ヴェネツィア","ナポリ","アマルフィ","シチリア","ボローニャ","トリノ","パレルモ"],
    en:["Rome","Milan","Florence","Venice","Naples","Amalfi","Sicily","Bologna","Turin","Palermo"],
    zh:["罗马","米兰","佛罗伦萨","威尼斯","那不勒斯","阿马尔菲","西西里","博洛尼亚","都灵","巴勒莫"],
    ko:["로마","밀라노","피렌체","베네치아","나폴리","아말피","시칠리아","볼로냐","토리노","팔레르모"],
    es:["Roma","Milán","Florencia","Venecia","Nápoles","Amalfi","Sicilia","Bolonia","Turín","Palermo"],
    pt:["Roma","Milão","Florença","Veneza","Nápoles","Amalfi","Sicília","Bolonha","Turim","Palermo"],
  }
},
{ name:"フランス", flag:"🇫🇷", currency:"EUR", rate:168, region:"europe",
  label:{ja:"フランス",en:"France",zh:"法国",ko:"프랑스",es:"Francia",pt:"França"},
  localLang:"fr", localLangName:"Français",
  cities:{
    ja:["パリ","ニース","リヨン","マルセイユ","ボルドー","ストラスブール","モンペリエ","ナント"],
    en:["Paris","Nice","Lyon","Marseille","Bordeaux","Strasbourg","Montpellier","Nantes"],
    zh:["巴黎","尼斯","里昂","马赛","波尔多","斯特拉斯堡","蒙彼利埃","南特"],
    ko:["파리","니스","리옹","마르세유","보르도","스트라스부르","몽펠리에","낭트"],
    es:["París","Niza","Lyon","Marsella","Burdeos","Estrasburgo","Montpellier","Nantes"],
    pt:["Paris","Nice","Lyon","Marselha","Bordeaux","Estrasburgo","Montpellier","Nantes"],
  }
},
{ name:"ドイツ", flag:"🇩🇪", currency:"EUR", rate:168, region:"europe",
  label:{ja:"ドイツ",en:"Germany",zh:"德国",ko:"독일",es:"Alemania",pt:"Alemanha"},
  localLang:"de", localLangName:"Deutsch",
  cities:{
    ja:["ベルリン","ミュンヘン","フランクフルト","ハンブルク","ケルン","ドレスデン","ライプツィヒ","ニュルンベルク"],
    en:["Berlin","Munich","Frankfurt","Hamburg","Cologne","Dresden","Leipzig","Nuremberg"],
    zh:["柏林","慕尼黑","法兰克福","汉堡","科隆","德累斯顿","莱比锡","纽伦堡"],
    ko:["베를린","뮌헨","프랑크푸르트","함부르크","쾰른","드레스덴","라이프치히","뉘른베르크"],
    es:["Berlín","Múnich","Fráncfort","Hamburgo","Colonia","Dresde","Leipzig","Núremberg"],
    pt:["Berlim","Munique","Frankfurt","Hamburgo","Colônia","Dresden","Leipzig","Nuremberg"],
  }
},
{ name:"イギリス", flag:"🇬🇧", currency:"GBP", rate:197, region:"europe",
  label:{ja:"イギリス",en:"UK",zh:"英国",ko:"영국",es:"Reino Unido",pt:"Reino Unido"},
  localLang:"en", localLangName:"English",
  cities:{
    ja:["ロンドン","マンチェスター","エディンバラ","バーミンガム","リバプール","ブリストル","オックスフォード","ケンブリッジ"],
    en:["London","Manchester","Edinburgh","Birmingham","Liverpool","Bristol","Oxford","Cambridge"],
    zh:["伦敦","曼彻斯特","爱丁堡","伯明翰","利物浦","布里斯托尔","牛津","剑桥"],
    ko:["런던","맨체스터","에든버러","버밍엄","리버풀","브리스톨","옥스퍼드","케임브리지"],
    es:["Londres","Mánchester","Edimburgo","Birmingham","Liverpool","Bristol","Oxford","Cambridge"],
    pt:["Londres","Manchester","Edimburgo","Birmingham","Liverpool","Bristol","Oxford","Cambridge"],
  }
},
{ name:"スペイン", flag:"🇪🇸", currency:"EUR", rate:168, region:"europe",
  label:{ja:"スペイン",en:"Spain",zh:"西班牙",ko:"스페인",es:"España",pt:"Espanha"},
  localLang:"es", localLangName:"Español",
  cities:{
    ja:["マドリード","バルセロナ","セビリア","バレンシア","グラナダ","ビルバオ","マラガ","パルマ"],
    en:["Madrid","Barcelona","Seville","Valencia","Granada","Bilbao","Malaga","Palma"],
    zh:["马德里","巴塞罗那","塞维利亚","瓦伦西亚","格拉纳达","毕尔巴鄂","马拉加","帕尔马"],
    ko:["마드리드","바르셀로나","세비야","발렌시아","그라나다","빌바오","말라가","팔마"],
    es:["Madrid","Barcelona","Sevilla","Valencia","Granada","Bilbao","Málaga","Palma"],
    pt:["Madri","Barcelona","Sevilha","Valência","Granada","Bilbao","Málaga","Palma"],
  }
},
{ name:"ギリシャ", flag:"🇬🇷", currency:"EUR", rate:168, region:"europe",
  label:{ja:"ギリシャ",en:"Greece",zh:"希腊",ko:"그리스",es:"Grecia",pt:"Grécia"},
  localLang:"el", localLangName:"Ελληνικά",
  cities:{
    ja:["アテネ","サントリーニ島","ミコノス島","テッサロニキ","ロードス島","クレタ島","コルフ島","ナフプリオン"],
    en:["Athens","Santorini","Mykonos","Thessaloniki","Rhodes","Crete","Corfu","Nafplio"],
    zh:["雅典","圣托里尼岛","米科诺斯岛","塞萨洛尼基","罗德岛","克里特岛","科孚岛","纳夫普利翁"],
    ko:["아테네","산토리니","미코노스","테살로니키","로도스","크레타","코르푸","나플리오"],
    es:["Atenas","Santorini","Mykonos","Tesalónica","Rodas","Creta","Corfú","Nafplio"],
    pt:["Atenas","Santorini","Mykonos","Tessalônica","Rodes","Creta","Corfu","Nafplio"],
  }
},
{ name:"オランダ", flag:"🇳🇱", currency:"EUR", rate:168, region:"europe",
  label:{ja:"オランダ",en:"Netherlands",zh:"荷兰",ko:"네덜란드",es:"Países Bajos",pt:"Países Baixos"},
  localLang:"nl", localLangName:"Nederlands",
  cities:{
    ja:["アムステルダム","ロッテルダム","ハーグ","ユトレヒト","アイントホーフェン","ライデン","デルフト","ハーレム"],
    en:["Amsterdam","Rotterdam","The Hague","Utrecht","Eindhoven","Leiden","Delft","Haarlem"],
    zh:["阿姆斯特丹","鹿特丹","海牙","乌得勒支","埃因霍温","莱顿","代尔夫特","哈勒姆"],
    ko:["암스테르담","로테르담","헤이그","위트레흐트","에인트호번","레이던","델프트","하를럼"],
    es:["Ámsterdam","Rotterdam","La Haya","Utrecht","Eindhoven","Leiden","Delft","Haarlem"],
    pt:["Amsterdã","Rotterdam","Haia","Utrecht","Eindhoven","Leiden","Delft","Haarlem"],
  }
},
{ name:"オーストリア", flag:"🇦🇹", currency:"EUR", rate:168, region:"europe",
  label:{ja:"オーストリア",en:"Austria",zh:"奥地利",ko:"오스트리아",es:"Austria",pt:"Áustria"},
  localLang:"de", localLangName:"Deutsch",
  cities:{
    ja:["ウィーン","ザルツブルク","インスブルック","グラーツ","リンツ","ハルシュタット","クレムス","バーデン"],
    en:["Vienna","Salzburg","Innsbruck","Graz","Linz","Hallstatt","Krems","Baden"],
    zh:["维也纳","萨尔茨堡","因斯布鲁克","格拉茨","林茨","哈尔施塔特","克雷姆斯","巴登"],
    ko:["빈","잘츠부르크","인스브루크","그라츠","린츠","할슈타트","크렘스","바덴"],
    es:["Viena","Salzburgo","Innsbruck","Graz","Linz","Hallstatt","Krems","Baden"],
    pt:["Viena","Salzburgo","Innsbruck","Graz","Linz","Hallstatt","Krems","Baden"],
  }
},
{ name:"スイス", flag:"🇨🇭", currency:"CHF", rate:175, region:"europe",
  label:{ja:"スイス",en:"Switzerland",zh:"瑞士",ko:"스위스",es:"Suiza",pt:"Suíça"},
  localLang:"de", localLangName:"Deutsch/Français",
  cities:{
    ja:["チューリッヒ","ジュネーブ","ベルン","ルツェルン","バーゼル","インターラーケン","ツェルマット","サンモリッツ"],
    en:["Zurich","Geneva","Bern","Lucerne","Basel","Interlaken","Zermatt","St. Moritz"],
    zh:["苏黎世","日内瓦","伯尔尼","琉森","巴塞尔","因特拉肯","采尔马特","圣莫里茨"],
    ko:["취리히","제네바","베른","루체른","바젤","인터라켄","체르마트","생모리츠"],
    es:["Zúrich","Ginebra","Berna","Lucerna","Basilea","Interlaken","Zermatt","St. Moritz"],
    pt:["Zurique","Genebra","Berna","Lucerna","Basileia","Interlaken","Zermatt","St. Moritz"],
  }
},
{ name:"フィンランド", flag:"🇫🇮", currency:"EUR", rate:168, region:"europe",
  label:{ja:"フィンランド",en:"Finland",zh:"芬兰",ko:"핀란드",es:"Finlandia",pt:"Finlândia"},
  localLang:"fi", localLangName:"Suomi",
  cities:{
    ja:["ヘルシンキ","ロバニエミ","タンペレ","トゥルク","オウル","ポルヴォー","サヴォンリンナ","ラッペーンランタ"],
    en:["Helsinki","Rovaniemi","Tampere","Turku","Oulu","Porvoo","Savonlinna","Lappeenranta"],
    zh:["赫尔辛基","罗瓦涅米","坦佩雷","图尔库","奥卢","波尔沃","萨翁林纳","拉彭兰塔"],
    ko:["헬싱키","로바니에미","탐페레","투르쿠","오울루","포르보","사본린나","라펜란타"],
    es:["Helsinki","Rovaniemi","Tampere","Turku","Oulu","Porvoo","Savonlinna","Lappeenranta"],
    pt:["Helsinque","Rovaniemi","Tampere","Turku","Oulu","Porvoo","Savonlinna","Lappeenranta"],
  }
},
{ name:"ノルウェー", flag:"🇳🇴", currency:"NOK", rate:14, region:"europe",
  label:{ja:"ノルウェー",en:"Norway",zh:"挪威",ko:"노르웨이",es:"Noruega",pt:"Noruega"},
  localLang:"no", localLangName:"Norsk",
  cities:{
    ja:["オスロ","ベルゲン","トロンハイム","スタバンゲル","トロムソ","フロム","ゲイランゲル","クリスティアンサン"],
    en:["Oslo","Bergen","Trondheim","Stavanger","Tromsø","Flåm","Geiranger","Kristiansand"],
    zh:["奥斯陆","卑尔根","特隆赫姆","斯塔万格","特罗姆瑟","弗洛姆","盖朗厄尔","克里斯蒂安桑"],
    ko:["오슬로","베르겐","트론헤임","스타방에르","트롬쇠","플롬","게이랑에르","크리스티안산"],
    es:["Oslo","Bergen","Trondheim","Stavanger","Tromsø","Flåm","Geiranger","Kristiansand"],
    pt:["Oslo","Bergen","Trondheim","Stavanger","Tromsø","Flåm","Geiranger","Kristiansand"],
  }
},
{ name:"ロシア", flag:"🇷🇺", currency:"RUB", rate:1.7, region:"europe",
  label:{ja:"ロシア",en:"Russia",zh:"俄罗斯",ko:"러시아",es:"Rusia",pt:"Rússia"},
  localLang:"ru", localLangName:"Русский",
  cities:{
    ja:["モスクワ","サンクトペテルブルク","ウラジオストク","ノボシビルスク","エカテリンブルク","カザン","ソチ","イルクーツク"],
    en:["Moscow","St. Petersburg","Vladivostok","Novosibirsk","Yekaterinburg","Kazan","Sochi","Irkutsk"],
    zh:["莫斯科","圣彼得堡","符拉迪沃斯托克","新西伯利亚","叶卡捷琳堡","喀山","索契","伊尔库茨克"],
    ko:["모스크바","상트페테르부르크","블라디보스토크","노보시비르스크","예카테린부르크","카잔","소치","이르쿠츠크"],
    es:["Moscú","San Petersburgo","Vladivostok","Novosibirsk","Ekaterimburgo","Kazán","Sochi","Irkutsk"],
    pt:["Moscou","São Petersburgo","Vladivostok","Novosibirsk","Ecaterimburgo","Kazan","Sochi","Irkutsk"],
  }
},
// ── AMERICAS ──
{ name:"アメリカ", flag:"🇺🇸", currency:"USD", rate:155, region:"americas",
  label:{ja:"アメリカ",en:"USA",zh:"美国",ko:"미국",es:"EE.UU.",pt:"EUA"},
  localLang:"en", localLangName:"English",
  cities:{
    ja:["ニューヨーク","ロサンゼルス","シカゴ","マイアミ","サンフランシスコ","ラスベガス","ワシントンD.C.","ボストン","シアトル","ニューオーリンズ"],
    en:["New York","Los Angeles","Chicago","Miami","San Francisco","Las Vegas","Washington D.C.","Boston","Seattle","New Orleans"],
    zh:["纽约","洛杉矶","芝加哥","迈阿密","旧金山","拉斯维加斯","华盛顿特区","波士顿","西雅图","新奥尔良"],
    ko:["뉴욕","로스앤젤레스","시카고","마이애미","샌프란시스코","라스베이거스","워싱턴DC","보스턴","시애틀","뉴올리언스"],
    es:["Nueva York","Los Ángeles","Chicago","Miami","San Francisco","Las Vegas","Washington D.C.","Boston","Seattle","Nueva Orleans"],
    pt:["Nova York","Los Angeles","Chicago","Miami","São Francisco","Las Vegas","Washington D.C.","Boston","Seattle","Nova Orleans"],
  }
},
{ name:"カナダ", flag:"🇨🇦", currency:"CAD", rate:114, region:"americas",
  label:{ja:"カナダ",en:"Canada",zh:"加拿大",ko:"캐나다",es:"Canadá",pt:"Canadá"},
  localLang:"en", localLangName:"English/French",
  cities:{
    ja:["トロント","バンクーバー","モントリオール","カルガリー","ケベックシティ","オタワ","エドモントン","ビクトリア","ウィスラー","バンフ"],
    en:["Toronto","Vancouver","Montreal","Calgary","Quebec City","Ottawa","Edmonton","Victoria","Whistler","Banff"],
    zh:["多伦多","温哥华","蒙特利尔","卡尔加里","魁北克市","渥太华","埃德蒙顿","维多利亚","惠斯勒","班夫"],
    ko:["토론토","밴쿠버","몬트리올","캘거리","퀘벡시티","오타와","에드먼턴","빅토리아","휘슬러","밴프"],
    es:["Toronto","Vancouver","Montreal","Calgary","Ciudad de Quebec","Ottawa","Edmonton","Victoria","Whistler","Banff"],
    pt:["Toronto","Vancouver","Montreal","Calgary","Cidade de Quebec","Ottawa","Edmonton","Victoria","Whistler","Banff"],
  }
},
{ name:"メキシコ", flag:"🇲🇽", currency:"MXN", rate:8.5, region:"americas",
  label:{ja:"メキシコ",en:"Mexico",zh:"墨西哥",ko:"멕시코",es:"México",pt:"México"},
  localLang:"es", localLangName:"Español",
  cities:{
    ja:["メキシコシティ","カンクン","グアダラハラ","プラヤデルカルメン","ロスカボス","オアハカ","サンクリストバル","プエブラ","メリダ","モンテレイ"],
    en:["Mexico City","Cancún","Guadalajara","Playa del Carmen","Los Cabos","Oaxaca","San Cristóbal","Puebla","Mérida","Monterrey"],
    zh:["墨西哥城","坎昆","瓜达拉哈拉","卡门海滩","洛斯卡沃斯","瓦哈卡","圣克里斯托瓦尔","普埃布拉","梅里达","蒙特雷"],
    ko:["멕시코시티","칸쿤","과달라하라","플라야델카르멘","로스카보스","오악사카","산크리스토발","푸에블라","메리다","몬테레이"],
    es:["Ciudad de México","Cancún","Guadalajara","Playa del Carmen","Los Cabos","Oaxaca","San Cristóbal","Puebla","Mérida","Monterrey"],
    pt:["Cidade do México","Cancún","Guadalajara","Playa del Carmen","Los Cabos","Oaxaca","San Cristóbal","Puebla","Mérida","Monterrey"],
  }
},
{ name:"ブラジル", flag:"🇧🇷", currency:"BRL", rate:30, region:"americas",
  label:{ja:"ブラジル",en:"Brazil",zh:"巴西",ko:"브라질",es:"Brasil",pt:"Brasil"},
  localLang:"pt", localLangName:"Português",
  cities:{
    ja:["サンパウロ","リオデジャネイロ","サルバドール","フォルタレザ","マナウス","クリチバ","レシフェ","ブラジリア","ベレン","フロリアノポリス"],
    en:["São Paulo","Rio de Janeiro","Salvador","Fortaleza","Manaus","Curitiba","Recife","Brasília","Belém","Florianópolis"],
    zh:["圣保罗","里约热内卢","萨尔瓦多","福塔莱萨","马瑙斯","库里提巴","累西腓","巴西利亚","贝伦","弗洛里亚诺波利斯"],
    ko:["상파울루","리우데자네이루","살바도르","포르탈레자","마나우스","쿠리치바","헤시피","브라질리아","벨렘","플로리아노폴리스"],
    es:["São Paulo","Río de Janeiro","Salvador","Fortaleza","Manaos","Curitiba","Recife","Brasilia","Belém","Florianópolis"],
    pt:["São Paulo","Rio de Janeiro","Salvador","Fortaleza","Manaus","Curitiba","Recife","Brasília","Belém","Florianópolis"],
  }
},
{ name:"アルゼンチン", flag:"🇦🇷", currency:"ARS", rate:0.17, region:"americas",
  label:{ja:"アルゼンチン",en:"Argentina",zh:"阿根廷",ko:"아르헨티나",es:"Argentina",pt:"Argentina"},
  localLang:"es", localLangName:"Español",
  cities:{
    ja:["ブエノスアイレス","コルドバ","ロサリオ","メンドーサ","パタゴニア","ウシュアイア","サルタ","バリローチェ","マルデルプラタ","イグアスの滝"],
    en:["Buenos Aires","Córdoba","Rosario","Mendoza","Patagonia","Ushuaia","Salta","Bariloche","Mar del Plata","Iguazú Falls"],
    zh:["布宜诺斯艾利斯","科尔多瓦","罗萨里奥","门多萨","巴塔哥尼亚","乌斯怀亚","萨尔塔","巴里洛切","马德普拉塔","伊瓜苏瀑布"],
    ko:["부에노스아이레스","코르도바","로사리오","멘도사","파타고니아","우수아이아","살타","바릴로체","마르델플라타","이과수폭포"],
    es:["Buenos Aires","Córdoba","Rosario","Mendoza","Patagonia","Ushuaia","Salta","Bariloche","Mar del Plata","Cataratas del Iguazú"],
    pt:["Buenos Aires","Córdoba","Rosario","Mendoza","Patagônia","Ushuaia","Salta","Bariloche","Mar del Plata","Cataratas do Iguaçu"],
  }
},
// ── MIDDLE EAST & AFRICA ──
{ name:"UAE", flag:"🇦🇪", currency:"AED", rate:42, region:"mideast",
  label:{ja:"UAE（ドバイ）",en:"UAE (Dubai)",zh:"阿联酋(迪拜)",ko:"UAE(두바이)",es:"EAU (Dubái)",pt:"EAU (Dubai)"},
  localLang:"ar", localLangName:"العربية",
  cities:{
    ja:["ドバイ","アブダビ","シャルジャ","アジュマーン","フジャイラ","ラスアルハイマ"],
    en:["Dubai","Abu Dhabi","Sharjah","Ajman","Fujairah","Ras Al Khaimah"],
    zh:["迪拜","阿布扎比","沙迦","阿治曼","富查伊拉","哈伊马角"],
    ko:["두바이","아부다비","샤르자","아지만","푸자이라","라스알카이마"],
    es:["Dubái","Abu Dabi","Sharjah","Ajman","Fujairah","Ras Al Khaimah"],
    pt:["Dubai","Abu Dhabi","Sharjah","Ajman","Fujairah","Ras Al Khaimah"],
  }
},
{ name:"トルコ", flag:"🇹🇷", currency:"TRY", rate:4.5, region:"mideast",
  label:{ja:"トルコ",en:"Turkey",zh:"土耳其",ko:"터키",es:"Turquía",pt:"Turquia"},
  localLang:"tr", localLangName:"Türkçe",
  cities:{
    ja:["イスタンブール","カッパドキア","アンタルヤ","パムッカレ","アンカラ","エフェソス","ボドルム","イズミル"],
    en:["Istanbul","Cappadocia","Antalya","Pamukkale","Ankara","Ephesus","Bodrum","Izmir"],
    zh:["伊斯坦布尔","卡帕多西亚","安塔利亚","棉花堡","安卡拉","以弗所","博德鲁姆","伊兹密尔"],
    ko:["이스탄불","카파도키아","안탈리아","파묵칼레","앙카라","에페수스","보드룸","이즈미르"],
    es:["Estambul","Capadocia","Antalya","Pamukkale","Ankara","Éfeso","Bodrum","Esmirna"],
    pt:["Istambul","Capadócia","Antalya","Pamukkale","Ancara","Éfeso","Bodrum","Izmir"],
  }
},
{ name:"エジプト", flag:"🇪🇬", currency:"EGP", rate:3.2, region:"mideast",
  label:{ja:"エジプト",en:"Egypt",zh:"埃及",ko:"이집트",es:"Egipto",pt:"Egito"},
  localLang:"ar", localLangName:"العربية",
  cities:{
    ja:["カイロ","ルクソール","アスワン","アレクサンドリア","ハルガダ","シャルムエルシェイク","アブシンベル","ダハブ"],
    en:["Cairo","Luxor","Aswan","Alexandria","Hurghada","Sharm El Sheikh","Abu Simbel","Dahab"],
    zh:["开罗","卢克索","阿斯旺","亚历山大","赫尔格达","沙姆沙伊赫","阿布辛贝","达哈卜"],
    ko:["카이로","룩소르","아스완","알렉산드리아","후르가다","샴엘셰이크","아부심벨","다합"],
    es:["El Cairo","Luxor","Asuán","Alejandría","Hurghada","Sharm El Sheikh","Abu Simbel","Dahab"],
    pt:["Cairo","Luxor","Assuã","Alexandria","Hurghada","Sharm El Sheikh","Abu Simbel","Dahab"],
  }
},
{ name:"サウジアラビア", flag:"🇸🇦", currency:"SAR", rate:41, region:"mideast",
  label:{ja:"サウジアラビア",en:"Saudi Arabia",zh:"沙特阿拉伯",ko:"사우디아라비아",es:"Arabia Saudita",pt:"Arábia Saudita"},
  localLang:"ar", localLangName:"العربية",
  cities:{
    ja:["リヤド","ジェッダ","メッカ（非イスラム教徒入場不可）","メディナ（非イスラム教徒入場不可）","アルウラー","タイフ","アブハー","ダンマン"],
    en:["Riyadh","Jeddah","Mecca (Non-Muslims prohibited)","Medina (Non-Muslims prohibited)","AlUla","Taif","Abha","Dammam"],
    zh:["利雅得","吉达","麦加（非穆斯林禁入）","麦地那（非穆斯林禁入）","阿尔乌拉","塔伊夫","阿卜哈","达曼"],
    ko:["리야드","제다","메카(비무슬림 입장불가)","메디나(비무슬림 입장불가)","알울라","타이프","아브하","담맘"],
    es:["Riad","Yeda","La Meca (prohibido no-musulmanes)","Medina (prohibido no-musulmanes)","AlUla","Taif","Abha","Dammam"],
    pt:["Riad","Jeddah","Meca (proibido não-muçulmanos)","Medina (proibido não-muçulmanos)","AlUla","Taif","Abha","Dammam"],
  }
},
{ name:"南アフリカ", flag:"🇿🇦", currency:"ZAR", rate:8.5, region:"mideast",
  label:{ja:"南アフリカ",en:"South Africa",zh:"南非",ko:"남아프리카",es:"Sudáfrica",pt:"África do Sul"},
  localLang:"en", localLangName:"English/Afrikaans",
  cities:{
    ja:["ケープタウン","ヨハネスブルグ","ダーバン","プレトリア","ポートエリザベス","クルーガー国立公園","ガーデンルート","スワジランド"],
    en:["Cape Town","Johannesburg","Durban","Pretoria","Port Elizabeth","Kruger National Park","Garden Route","Swaziland"],
    zh:["开普敦","约翰内斯堡","德班","比勒陀利亚","伊丽莎白港","克鲁格国家公园","花园大道","斯威士兰"],
    ko:["케이프타운","요하네스버그","더반","프리토리아","포트엘리자베스","크루거국립공원","가든루트","에스와티니"],
    es:["Ciudad del Cabo","Johannesburgo","Durban","Pretoria","Port Elizabeth","Parque Kruger","Garden Route","Suazilandia"],
    pt:["Cidade do Cabo","Joanesburgo","Durban","Pretória","Port Elizabeth","Parque Kruger","Garden Route","Suazilândia"],
  }
},
];


// ─────────────────────────────────────────────────────────
// CITY PRICE FACTORS
// ─────────────────────────────────────────────────────────
const CITY_FACTOR = {
  // 日本
  "札幌・北海道":0.85,"仙台":0.88,"東京":1.0,"横浜":0.95,"名古屋":0.9,
  "京都":1.05,"大阪":0.93,"神戸":0.92,"広島":0.87,"博多・福岡":0.88,
  "那覇・沖縄":0.9,"軽井沢":1.2,
  // 韓国
  "ソウル":1.0,"仁川":0.92,"釜山":0.88,"大邱":0.82,"光州":0.8,
  "大田":0.82,"済州島":1.1,"慶州":0.85,"水原":0.88,"全州":0.8,"春川":0.82,"江陵":0.85,
  // タイ
  "バンコク":1.0,"チェンマイ":0.75,"プーケット":1.3,"パタヤ":1.1,
  "クラビ":1.15,"アユタヤ":0.7,"サムイ島":1.25,"ホアヒン":0.9,"コンケン":0.7,"チェンライ":0.72,
  // ベトナム
  "ハノイ":1.0,"ホーチミン":1.1,"ダナン":0.9,"ホイアン":0.95,
  "フエ":0.8,"ニャチャン":1.0,"ハロン湾":1.1,"ダラット":0.85,"ムイネー":0.9,"カントー":0.75,
  // インドネシア
  "バリ島":1.0,"ジャカルタ":0.9,"スラバヤ":0.8,"ジョグジャカルタ":0.7,
  "メダン":0.75,"マカッサル":0.78,"ロンボク":0.85,"バンドン":0.75,"セマラン":0.73,"マナド":0.78,
  // マレーシア
  "クアラルンプール":1.0,"ペナン":0.85,"コタキナバル":0.88,"ジョホールバル":0.9,
  "イポー":0.75,"クチン":0.82,"マラッカ":0.85,"ランカウイ":1.0,"コタバル":0.72,"プトラジャヤ":0.88,
  // フィリピン
  "マニラ":1.0,"セブ島":0.9,"ボラカイ":1.3,"ダバオ":0.85,
  "パラワン":1.0,"バギオ":0.8,"イロイロ":0.78,"ザンボアンガ":0.75,"カガヤンデオロ":0.78,"タガイタイ":0.88,
  // 台湾
  "台北":1.0,"新北":0.92,"桃園":0.88,"台中":0.88,"台南":0.85,
  "高雄":0.85,"花蓮":0.82,"台東":0.8,"嘉義":0.82,"墾丁":0.9,
  // シンガポール
  "マリーナベイ":1.2,"オーチャード":1.15,"チャイナタウン":0.85,
  "リトルインディア":0.8,"セントーサ":1.3,"ジュロン":0.9,"クラークキー":1.1,"ゲイランロード":0.82,
  // インド
  "デリー":1.0,"ムンバイ":1.1,"バンガロール":0.95,"チェンナイ":0.9,
  "コルカタ":0.85,"ジャイプール":0.8,"アグラ":0.75,"ゴア":1.0,"ハイデラバード":0.88,"プネー":0.9,
  // 中国
  "北京":1.0,"上海":1.1,"広州":0.95,"深圳":1.0,"成都":0.85,
  "西安":0.8,"杭州":0.92,"重慶":0.82,"南京":0.88,"武漢":0.82,"昆明":0.78,"桂林":0.75,
  // モルディブ（全域高め）
  "マレ":1.0,"バア環礁":1.5,"アリ環礁":1.4,"ラア環礁":1.3,"ノース・マレ環礁":1.35,"フヴァドゥ環礁":1.2,
  // ラオス
  "ビエンチャン":1.0,"ルアンパバーン":1.1,"バンビエン":0.9,"パクセー":0.8,"サワンナケート":0.75,"ポンサーリー":0.7,
  // カンボジア
  "プノンペン":1.0,"シェムリアップ":1.1,"シアヌークビル":0.95,"コンポンチャム":0.75,"バッタンバン":0.8,"カンポット":0.85,
  // モンゴル
  "ウランバートル":1.0,"エルデネト":0.85,"ダルハン":0.82,"チョイバルサン":0.78,"ウンドゥルハン":0.75,"ウルギー":0.8,
  // オーストラリア
  "シドニー":1.0,"メルボルン":0.97,"ブリスベン":0.92,"パース":0.93,
  "アデレード":0.88,"ケアンズ":1.05,"ゴールドコースト":0.95,"ダーウィン":1.05,"ホバート":0.9,"キャンベラ":0.93,
  // ニュージーランド
  "オークランド":1.0,"ウェリントン":0.97,"クライストチャーチ":0.92,"ダニーデン":0.88,
  "クイーンズタウン":1.2,"ロトルア":0.95,"ネイピア":0.9,"ハミルトン":0.9,
  // ハワイ
  "ホノルル":1.0,"ワイキキ":1.1,"マウイ島":1.15,"カウアイ島":1.1,
  "ハワイ島（ビッグアイランド）":1.05,"ラナイ島":1.3,"モロカイ島":0.95,
  // グアム
  "タムニング":1.0,"アガニャ（ハガニャ）":0.95,"デデド":0.85,"バリガダ":0.88,"マンギラオ":0.85,"アガット":0.82,
  // イタリア
  "ローマ":1.0,"ミラノ":1.15,"フィレンツェ":1.05,"ヴェネツィア":1.3,
  "ナポリ":0.85,"トリノ":0.9,"ボローニャ":0.95,"パレルモ":0.8,"アマルフィ":1.2,"シチリア":0.85,
  // フランス
  "パリ":1.0,"ニース":0.92,"リヨン":0.88,"マルセイユ":0.85,
  "ボルドー":0.88,"ストラスブール":0.87,"モンペリエ":0.85,"ナント":0.85,"リール":0.83,"エクサンプロヴァンス":0.9,
  // ドイツ
  "ベルリン":1.0,"ミュンヘン":1.15,"フランクフルト":1.1,"ハンブルク":1.05,
  "ケルン":1.0,"シュトゥットガルト":1.05,"ドレスデン":0.88,"ライプツィヒ":0.85,"ニュルンベルク":0.92,"デュッセルドルフ":1.0,
  // イギリス
  "ロンドン":1.0,"マンチェスター":0.82,"エディンバラ":0.88,"バーミンガム":0.8,
  "リバプール":0.78,"ブリストル":0.85,"オックスフォード":0.9,"ケンブリッジ":0.88,"グラスゴー":0.78,"バース":0.88,
  // スペイン
  "マドリード":1.0,"バルセロナ":1.1,"セビリア":0.88,"バレンシア":0.9,
  "グラナダ":0.85,"ビルバオ":0.92,"マラガ":0.88,"コルドバ":0.82,"サラゴサ":0.85,"サン・セバスティアン":1.05,
  // ギリシャ
  "アテネ":1.0,"テッサロニキ":0.88,"サントリーニ島":1.35,"ミコノス島":1.4,
  "ロドス島":1.1,"クレタ島（イラクリオン）":0.95,"コルフ島":1.0,"デルフィ":0.85,"オリンピア":0.82,"メテオラ":0.88,
  // オランダ
  "アムステルダム":1.0,"ロッテルダム":0.92,"デン・ハーグ":0.95,"ユトレヒト":0.95,
  "アイントホーフェン":0.88,"ハーレム":0.93,"デルフト":0.9,"ライデン":0.9,
  // オーストリア
  "ウィーン":1.0,"ザルツブルク":1.1,"インスブルック":1.05,"グラーツ":0.92,
  "リンツ":0.9,"ハルシュタット":1.15,"クレムス":0.88,"メルク":0.85,
  // スイス
  "チューリッヒ":1.0,"ジュネーブ":1.05,"バーゼル":0.97,"ベルン":0.98,
  "ルツェルン":1.0,"インターラーケン":1.1,"ツェルマット":1.3,"サンモリッツ":1.4,
  // フィンランド
  "ヘルシンキ":1.0,"タンペレ":0.92,"トゥルク":0.9,"オウル":0.88,
  "ロヴァニエミ":1.1,"サヴォンリンナ":0.9,"ポルヴォー":0.95,"ラハティ":0.88,
  // ノルウェー
  "オスロ":1.0,"ベルゲン":0.95,"トロンハイム":0.92,"スタヴァンゲル":1.0,
  "トロムソ":1.05,"オーレスン":0.9,"フロム":1.1,"ゲイランゲル":1.1,
  // ロシア
  "モスクワ":1.0,"サンクトペテルブルク":0.95,"ノボシビルスク":0.8,"エカテリンブルク":0.82,
  "カザン":0.85,"ウラジオストク":0.9,"ニジニノヴゴロド":0.78,"ソチ":1.0,
  // アメリカ
  "ニューヨーク":1.0,"ロサンゼルス":0.92,"シカゴ":0.88,"ヒューストン":0.82,
  "フェニックス":0.8,"フィラデルフィア":0.87,"サンアントニオ":0.78,
  "サンディエゴ":0.9,"ダラス":0.82,"サンノゼ":0.95,"ラスベガス":0.88,"マイアミ":0.95,
  // カナダ
  "トロント":1.0,"バンクーバー":1.05,"モントリオール":0.95,"カルガリー":0.98,
  "エドモントン":0.92,"オタワ":0.95,"ケベックシティ":0.9,"ウィニペグ":0.88,"ビクトリア":0.95,"バンフ":1.1,
  // ブラジル
  "サンパウロ":1.0,"リオデジャネイロ":1.05,"サルバドール":0.85,
  "フォルタレザ":0.82,"マナウス":0.88,"クリチバ":0.87,"レシフェ":0.8,"ポルトアレグレ":0.87,"ベレン":0.8,"ブラジリア":0.92,
  // アルゼンチン
  "ブエノスアイレス":1.0,"コルドバ":0.88,"ロサリオ":0.85,"メンドーサ":0.82,
  "サルタ":0.8,"バリローチェ":1.1,"プエルトマドリン":0.9,"ウシュアイア":1.2,"マルデルプラタ":0.88,"ラプラタ":0.85,
  // メキシコ
  "メキシコシティ":1.0,"カンクン":1.2,"グアダラハラ":0.85,
  "モンテレイ":0.9,"プエブラ":0.8,"オアハカ":0.78,"プラヤデルカルメン":1.15,"ロスカボス":1.3,"メリダ":0.8,"サンクリストバル":0.72,
  // UAE
  "ドバイ":1.0,"アブダビ":0.95,"シャルジャ":0.8,"アジュマーン":0.75,"フジャイラ":0.78,"ラスアルハイマ":0.75,
  // エジプト
  "カイロ":1.0,"アレキサンドリア":0.88,"ルクソール":0.85,"アスワン":0.82,
  "ギザ":1.05,"シャルムエルシェイク":1.2,"フルガダ":1.1,"ダハブ":0.9,
  // トルコ
  "イスタンブール":1.0,"アンカラ":0.88,"イズミル":0.9,"アンタルヤ":0.95,
  "カッパドキア":1.05,"パムッカレ":0.85,"エフェソス":0.9,"トラブゾン":0.82,"ボドルム":1.1,"マルマリス":1.05,
  // サウジアラビア
  "リヤド":1.0,"ジッダ":1.0,"メッカ":0.95,"メディナ":0.9,
  "ダンマーム":0.95,"アブハー":0.85,"タイフ":0.88,"ジャン":0.82,
  // 南アフリカ
  "ケープタウン":1.0,"ヨハネスブルグ":0.95,"ダーバン":0.88,
  "プレトリア":0.88,"ポートエリザベス":0.82,"ブルームフォンテーン":0.78,
};

// ─────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────
const MAIN_CATS = [
  {id:"food",icon:"🍽️",name:{ja:"食事",en:"Food",zh:"餐饮",ko:"식사",es:"Comida",pt:"Comida"},hint:{ja:"朝食〜高級まで",en:"Breakfast to fine dining",zh:"早餐到高档",ko:"아침부터 고급",es:"Desayuno a lujoso",pt:"Café a fino"}},
  {id:"drink",icon:"☕",name:{ja:"飲み物",en:"Drinks",zh:"饮料",ko:"음료",es:"Bebidas",pt:"Bebidas"},hint:{ja:"カフェ・バー",en:"Cafe & bar",zh:"咖啡·酒吧",ko:"카페·바",es:"Café y bar",pt:"Café e bar"}},
  {id:"taxi",icon:"🚕",name:{ja:"タクシー",en:"Transport",zh:"交通",ko:"교통",es:"Transporte",pt:"Transporte"},hint:{ja:"距離・時間帯込み",en:"Distance & time",zh:"含距离·时段",ko:"거리·시간대",es:"Distancia y hora",pt:"Distância e hora"}},
  {id:"hotel",icon:"🏨",name:{ja:"ホテル",en:"Hotel",zh:"酒店",ko:"호텔",es:"Hotel",pt:"Hotel"},hint:{ja:"1泊あたり",en:"Per night",zh:"每晚",ko:"1박 기준",es:"Por noche",pt:"Por noite"}},
  {id:"shopping",icon:"🛍️",name:{ja:"ショッピング",en:"Shopping",zh:"购物",ko:"쇼핑",es:"Compras",pt:"Compras"},hint:{ja:"衣料・雑貨",en:"Clothes & goods",zh:"服饰·杂货",ko:"의류·잡화",es:"Ropa y artículos",pt:"Roupas e artigos"}},
  {id:"activity",icon:"🎡",name:{ja:"観光・体験",en:"Activities",zh:"观光·体验",ko:"관광·체험",es:"Actividades",pt:"Atividades"},hint:{ja:"入場・ツアー",en:"Entry & tours",zh:"入场·旅游",ko:"입장·투어",es:"Entrada y tours",pt:"Entrada e tours"}},
  {id:"famous",icon:"🌟",name:{ja:"名物・名所",en:"Famous",zh:"名物·名胜",ko:"명물·명소",es:"Famosos",pt:"Famosos"},hint:{ja:"その土地の名物",en:"Local specialties",zh:"当地特色",ko:"현지 명물",es:"Especialidades",pt:"Especialidades"}},
];

const FOOD_GROUPS = [
  {label:{ja:"💰 価格帯",en:"💰 By Price",zh:"💰 按价位",ko:"💰 가격대",es:"💰 Por precio",pt:"💰 Por preço"},
   subs:{ja:["🏪 コンビニ","🍢 屋台","🍜 ローカル食堂","🍣 チェーン","🍽️ カジュアル","🥂 中級","🥩 高級","👑 超高級"],
         en:["🏪 Convenience","🍢 Street food","🍜 Local diner","🍣 Chain","🍽️ Casual","🥂 Mid-range","🥩 Upscale","👑 Fine dining"],
         zh:["🏪 便利店","🍢 街边摊","🍜 本地餐馆","🍣 连锁","🍽️ 休闲","🥂 中档","🥩 高档","👑 顶级"],
         ko:["🏪 편의점","🍢 노점","🍜 로컬 식당","🍣 체인","🍽️ 캐주얼","🥂 중급","🥩 고급","👑 초고급"],
         es:["🏪 Tienda","🍢 Calle","🍜 Local","🍣 Cadena","🍽️ Casual","🥂 Medio","🥩 Alto","👑 Lujo"],
         pt:["🏪 Conveniência","🍢 Rua","🍜 Local","🍣 Rede","🍽️ Casual","🥂 Médio","🥩 Alto","👑 Luxo"]}},
  {label:{ja:"⏰ 時間帯",en:"⏰ By Time",zh:"⏰ 按时段",ko:"⏰ 시간대",es:"⏰ Por hora",pt:"⏰ Por hora"},
   subs:{ja:["🌅 朝食","☀️ ランチ","🌆 ディナー","🍱 テイクアウト","☕ カフェ軽食","🌙 夜食"],
         en:["🌅 Breakfast","☀️ Lunch","🌆 Dinner","🍱 Takeout","☕ Cafe snack","🌙 Late night"],
         zh:["🌅 早餐","☀️ 午餐","🌆 晚餐","🍱 外卖","☕ 咖啡轻食","🌙 宵夜"],
         ko:["🌅 아침식사","☀️ 점심","🌆 저녁","🍱 테이크아웃","☕ 카페 간식","🌙 야식"],
         es:["🌅 Desayuno","☀️ Almuerzo","🌆 Cena","🍱 Para llevar","☕ Café snack","🌙 Noche tarde"],
         pt:["🌅 Café da manhã","☀️ Almoço","🌆 Jantar","🍱 Para levar","☕ Café snack","🌙 Noite tarde"]}},
  {label:{ja:"🍜 ジャンル",en:"🍜 By Cuisine",zh:"🍜 按菜系",ko:"🍜 장르",es:"🍜 Por cocina",pt:"🍜 Por culinária"},
   subs:{ja:["🍜 現地料理","🍣 魚介・海鮮","🥩 肉料理","🌱 ベジタリアン","🍕 洋食","🍱 他国アジア","🍰 スイーツ"],
         en:["🍜 Local cuisine","🍣 Seafood","🥩 Meat/grill","🌱 Vegetarian","🍕 Western","🍱 Other Asian","🍰 Sweets"],
         zh:["🍜 当地料理","🍣 海鲜","🥩 肉类/烧烤","🌱 素食","🍕 西餐","🍱 其他亚洲","🍰 甜点"],
         ko:["🍜 현지 요리","🍣 해산물","🥩 육류/그릴","🌱 채식","🍕 양식","🍱 기타 아시아","🍰 디저트"],
         es:["🍜 Local","🍣 Mariscos","🥩 Carne","🌱 Vegetariano","🍕 Occidental","🍱 Asiático","🍰 Dulces"],
         pt:["🍜 Local","🍣 Frutos do mar","🥩 Carne","🌱 Vegetariano","🍕 Ocidental","🍱 Asiático","🍰 Doces"]}},
];

const SUB_CATS = {
  drink:{ja:["🏪 コンビニ","🧋 タピオカ","☕ カフェ","🍺 バー","🧃 屋台ドリンク"],en:["🏪 Convenience","🧋 Bubble tea","☕ Cafe","🍺 Bar","🧃 Street drink"],zh:["🏪 便利店","🧋 珍珠奶茶","☕ 咖啡","🍺 酒吧","🧃 街边饮料"],ko:["🏪 편의점","🧋 버블티","☕ 카페","🍺 바","🧃 노점 음료"],es:["🏪 Tienda","🧋 Bubble tea","☕ Café","🍺 Bar","🧃 Bebida calle"],pt:["🏪 Conveniência","🧋 Bubble tea","☕ Café","🍺 Bar","🧃 Bebida rua"]},
  taxi:{ja:["🚕 一般タクシー","📱 Grab/Uber","🛺 トゥクトゥク","🚌 バス"],en:["🚕 Regular taxi","📱 Grab/Uber","🛺 Tuk-tuk","🚌 Bus"],zh:["🚕 普通出租车","📱 Grab/Uber","🛺 嘟嘟车","🚌 公共交通"],ko:["🚕 일반 택시","📱 Grab/Uber","🛺 툭툭","🚌 버스/대중교통"],es:["🚕 Taxi regular","📱 Grab/Uber","🛺 Tuk-tuk","🚌 Bus"],pt:["🚕 Táxi regular","📱 Grab/Uber","🛺 Tuk-tuk","🚌 Ônibus"]},
  hotel:{ja:["🏠 ゲストハウス","⭐ ビジネス","⭐⭐ 中級","⭐⭐⭐ 高級","🏖️ リゾート"],en:["🏠 Hostel/Guesthouse","⭐ Business","⭐⭐ Mid-range","⭐⭐⭐ Luxury","🏖️ Resort"],zh:["🏠 青旅/客栈","⭐ 商务","⭐⭐ 中档","⭐⭐⭐ 豪华","🏖️ 度假村"],ko:["🏠 게스트하우스","⭐ 비즈니스","⭐⭐ 중급","⭐⭐⭐ 고급","🏖️ 리조트"],es:["🏠 Hostal","⭐ Negocio","⭐⭐ Medio","⭐⭐⭐ Lujo","🏖️ Resort"],pt:["🏠 Hostel","⭐ Negócios","⭐⭐ Médio","⭐⭐⭐ Luxo","🏖️ Resort"]},
  shopping:{ja:["👕 衣料","💄 コスメ","🛒 スーパー","🎁 おみやげ","💻 家電"],en:["👕 Clothing","💄 Cosmetics","🛒 Grocery","🎁 Souvenirs","💻 Electronics"],zh:["👕 服装","💄 化妆品","🛒 超市","🎁 纪念品","💻 电子产品"],ko:["👕 의류","💄 화장품","🛒 마트","🎁 기념품","💻 전자기기"],es:["👕 Ropa","💄 Cosméticos","🛒 Supermercado","🎁 Souvenirs","💻 Electrónica"],pt:["👕 Roupas","💄 Cosméticos","🛒 Supermercado","🎁 Souvenirs","💻 Eletrônicos"]},
  activity:{ja:["🏛️ 観光入場","🤿 アクティビティ","💆 マッサージ","🎭 エンタメ","🚌 ツアー"],en:["🏛️ Attraction entry","🤿 Activities","💆 Massage/Spa","🎭 Entertainment","🚌 Tour"],zh:["🏛️ 景点门票","🤿 活动体验","💆 按摩·SPA","🎭 娱乐演出","🚌 旅游团"],ko:["🏛️ 관광지 입장","🤿 액티비티","💆 마사지·스파","🎭 엔터테인먼트","🚌 투어"],es:["🏛️ Entrada","🤿 Actividades","💆 Masaje/Spa","🎭 Entretenimiento","🚌 Tour"],pt:["🏛️ Entrada","🤿 Atividades","💆 Massagem/Spa","🎭 Entretenimento","🚌 Tour"]},
  famous:{
    東京:{
      ja:["🍣 寿司（高級）","🍣 寿司（回転）","🍜 ラーメン","🍤 天ぷら","🥩 すき焼き","🥞 もんじゃ焼き","🍱 鰻重","🐡 ふぐコース","🐭 ディズニー","🗼 展望タワー","🎨 デジタルアート","🐠 水族館","🐼 動物園","🥋 大相撲観戦","👘 着物レンタル","🍡 屋形船","🧙 ハリポタツアー","🎬 ジブリ美術館"],
      en:["🍣 Sushi (Premium)","🍣 Sushi (Conveyor)","🍜 Ramen","🍤 Tempura","🥩 Sukiyaki","🥞 Monjayaki","🍱 Unagi","🐡 Fugu Course","🐭 Disney","🗼 Observation Tower","🎨 Digital Art","🐠 Aquarium","🐼 Zoo","🥋 Sumo Match","👘 Kimono Rental","🍡 Yakatabune","🧙 Harry Potter Tour","🎬 Ghibli Museum"],
      zh:["🍣 寿司（高级）","🍣 回转寿司","🍜 拉面","🍤 天妇罗","🥩 寿喜烧","🥞 文字烧","🍱 鳗鱼饭","🐡 河豚套餐","🐭 迪士尼","🗼 观景塔","🎨 数字艺术","🐠 水族馆","🐼 动物园","🥋 相扑观战","👘 和服租借","🍡 屋形船","🧙 哈利波特之旅","🎬 吉卜力美术馆"],
      ko:["🍣 스시 (고급)","🍣 회전스시","🍜 라멘","🍤 텐푸라","🥩 스키야키","🥞 몬자야키","🍱 장어덮밥","🐡 복어코스","🐭 디즈니","🗼 전망타워","🎨 디지털아트","🐠 수족관","🐼 동물원","🥋 스모관전","👘 기모노대여","🍡 야카타부네","🧙 해리포터투어","🎬 지브리미술관"],
      es:["🍣 Sushi (Premium)","🍣 Sushi giratorio","🍜 Ramen","🍤 Tempura","🥩 Sukiyaki","🥞 Monjayaki","🍱 Unagi","🐡 Curso Fugu","🐭 Disney","🗼 Mirador","🎨 Arte digital","🐠 Acuario","🐼 Zoológico","🥋 Sumo","👘 Kimono","🍡 Yakatabune","🧙 Harry Potter","🎬 Museo Ghibli"],
      pt:["🍣 Sushi (Premium)","🍣 Sushi giratório","🍜 Ramen","🍤 Tempura","🥩 Sukiyaki","🥞 Monjayaki","🍱 Unagi","🐡 Curso Fugu","🐭 Disney","🗼 Mirante","🎨 Arte digital","🐠 Aquário","🐼 Zoológico","🥋 Sumô","👘 Kimono","🍡 Yakatabune","🧙 Harry Potter","🎬 Museu Ghibli"]
    },
    京都:{
      ja:["⛩️ 清水寺","🏯 金閣寺","🏯 銀閣寺","🦊 伏見稲荷","🏰 二条城","🚞 嵯峨野トロッコ","🚣 保津川下り","🚂 鉄道博物館","🎬 太秦映画村","🍱 京懐石","🍲 湯豆腐","🍵 抹茶パフェ","🍜 京都ラーメン","🍜 にしんそば","🥟 京湯葉料理","👘 着物レンタル","🍵 茶道体験","💃 舞妓体験"],
      en:["⛩️ Kiyomizu-dera","🏯 Kinkaku-ji","🏯 Ginkaku-ji","🦊 Fushimi Inari","🏰 Nijo Castle","🚞 Sagano Train","🚣 Hozugawa Boat","🚂 Railway Museum","🎬 Uzumasa Studio","🍱 Kaiseki","🍲 Yudofu","🍵 Matcha Parfait","🍜 Kyoto Ramen","🍜 Nishin Soba","🥟 Yuba Cuisine","👘 Kimono Rental","🍵 Tea Ceremony","💃 Maiko Experience"],
      zh:["⛩️ 清水寺","🏯 金阁寺","🏯 银阁寺","🦊 伏见稻荷","🏰 二条城","🚞 嵯峨野小火车","🚣 保津川下り","🚂 铁道博物馆","🎬 太秦映画村","🍱 京怀石","🍲 汤豆腐","🍵 抹茶芭菲","🍜 京都拉面","🍜 鲱鱼荞麦面","🥟 京湯葉","👘 和服租借","🍵 茶道体验","💃 舞伎体验"],
      ko:["⛩️ 기요미즈데라","🏯 킨카쿠지","🏯 긴카쿠지","🦊 후시미이나리","🏰 니조성","🚞 사가노 토롯코","🚣 호즈가와 뱃놀이","🚂 철도박물관","🎬 우즈마사 영화촌","🍱 가이세키","🍲 유도후","🍵 말차파르페","🍜 교토라멘","🍜 니신소바","🥟 유바요리","👘 기모노대여","🍵 다도체험","💃 마이코체험"],
      es:["⛩️ Kiyomizu-dera","🏯 Kinkaku-ji","🏯 Ginkaku-ji","🦊 Fushimi Inari","🏰 Castillo Nijo","🚞 Tren Sagano","🚣 Río Hozugawa","🚂 Museo Ferroviario","🎬 Uzumasa","🍱 Kaiseki","🍲 Yudofu","🍵 Parfait matcha","🍜 Ramen Kioto","🍜 Nishin Soba","🥟 Yuba","👘 Kimono","🍵 Té Ceremonia","💃 Maiko"],
      pt:["⛩️ Kiyomizu-dera","🏯 Kinkaku-ji","🏯 Ginkaku-ji","🦊 Fushimi Inari","🏰 Castelo Nijo","🚞 Trem Sagano","🚣 Rio Hozugawa","🚂 Museu Ferroviário","🎬 Uzumasa","🍱 Kaiseki","🍲 Yudofu","🍵 Parfait matcha","🍜 Ramen Kyoto","🍜 Nishin Soba","🥟 Yuba","👘 Kimono","🍵 Cerimônia chá","💃 Maiko"]
    },
    大阪:{
      ja:["🎢 USJ","🏯 大阪城","🐠 海遊館","🗼 通天閣","🏢 あべのハルカス","🌉 空中庭園","🚢 御座船","🐙 たこ焼き","🥞 お好み焼き","🍢 串カツ","🐡 てっちり","🍜 肉吸い","🍣 大阪寿司","🍱 かすうどん","🥟 551豚まん","🎭 なんば花月","🎡 観覧車","🚤 リバークルーズ"],
      en:["🎢 USJ","🏯 Osaka Castle","🐠 Kaiyukan","🗼 Tsutenkaku","🏢 Abeno Harukas","🌉 Sky Building","🚢 Gozabune","🐙 Takoyaki","🥞 Okonomiyaki","🍢 Kushikatsu","🐡 Tecchiri","🍜 Niku-sui","🍣 Osaka Sushi","🍱 Kasu Udon","🥟 551 Pork Bun","🎭 Namba Hanagekijo","🎡 Ferris Wheel","🚤 River Cruise"],
      zh:["🎢 环球影城","🏯 大阪城","🐠 海游馆","🗼 通天阁","🏢 阿倍野HARUKAS","🌉 梅田蓝天大厦","🚢 御座船","🐙 章鱼烧","🥞 大阪烧","🍢 炸串","🐡 河豚火锅","🍜 肉吸","🍣 大阪寿司","🍱 大阪乌冬","🥟 551猪肉包","🎭 难波花月","🎡 摩天轮","🚤 道顿堀游船"],
      ko:["🎢 유니버설 스튜디오","🏯 오사카성","🐠 카이유칸","🗼 츠텐카쿠","🏢 아베노 하루카스","🌉 우메다 스카이","🚢 고자부네","🐙 타코야키","🥞 오코노미야키","🍢 쿠시카츠","🐡 텟치리","🍜 니쿠스이","🍣 오사카초밥","🍱 카스우동","🥟 551 호라이","🎭 난바 하나게키죠","🎡 관람차","🚤 리버크루즈"],
      es:["🎢 USJ","🏯 Castillo Osaka","🐠 Kaiyukan","🗼 Tsutenkaku","🏢 Abeno Harukas","🌉 Sky Building","🚢 Gozabune","🐙 Takoyaki","🥞 Okonomiyaki","🍢 Kushikatsu","🐡 Tecchiri","🍜 Niku-sui","🍣 Sushi Osaka","🍱 Kasu Udon","🥟 551 Bollo","🎭 Namba Hanagekijo","🎡 Noria","🚤 Crucero"],
      pt:["🎢 USJ","🏯 Castelo Osaka","🐠 Kaiyukan","🗼 Tsutenkaku","🏢 Abeno Harukas","🌉 Sky Building","🚢 Gozabune","🐙 Takoyaki","🥞 Okonomiyaki","🍢 Kushikatsu","🐡 Tecchiri","🍜 Niku-sui","🍣 Sushi Osaka","🍱 Kasu Udon","🥟 551 Bolinho","🎭 Namba Hanagekijo","🎡 Roda-gigante","🚤 Cruzeiro"]
    },
    札幌・北海道:{
      ja:["🕰️ 札幌時計台","🗼 さっぽろテレビ塔","⛷️ 大倉山リフト","🏅 オリンピックミュージアム","🍪 白い恋人パーク","🚠 もいわ山ロープウェイ","🐑 羊ヶ丘展望台","🍺 サッポロビール博物館","🏢 JRタワーT38","🐻 円山動物園","🍜 札幌味噌ラーメン","🐑 ジンギスカン","🍛 スープカレー","🍗 ザンギ","🍣 海鮮丼","🍣 回転寿司","🦀 カニ料理","🌃 すすきの夜景"],
      en:["🕰️ Clock Tower","🗼 TV Tower","⛷️ Okurayama Lift","🏅 Olympic Museum","🍪 Shiroi Koibito Park","🚠 Mt.Moiwa Ropeway","🐑 Hitsujigaoka","🍺 Sapporo Beer Museum","🏢 JR Tower T38","🐻 Maruyama Zoo","🍜 Miso Ramen","🐑 Jingisukan","🍛 Soup Curry","🍗 Zangi","🍣 Seafood Bowl","🍣 Conveyor Sushi","🦀 Crab Cuisine","🌃 Susukino Night"],
      zh:["🕰️ 札幌时计台","🗼 札幌电视塔","⛷️ 大仓山缆车","🏅 奥运博物馆","🍪 白色恋人公园","🚠 藻岩山缆车","🐑 羊之丘展望台","🍺 札幌啤酒博物馆","🏢 JR塔T38","🐻 圆山动物园","🍜 味噌拉面","🐑 成吉思汗烤肉","🍛 汤咖喱","🍗 炸鸡","🍣 海鲜丼","🍣 回转寿司","🦀 螃蟹料理","🌃 薄野夜景"],
      ko:["🕰️ 삿포로 시계탑","🗼 삿포로 TV타워","⛷️ 오쿠라야마 리프트","🏅 올림픽 박물관","🍪 시로이코이비토 파크","🚠 모이와산 로프웨이","🐑 히츠지가오카","🍺 삿포로 맥주박물관","🏢 JR타워 T38","🐻 마루야마 동물원","🍜 미소라멘","🐑 징기스칸","🍛 수프카레","🍗 잔기","🍣 해물덮밥","🍣 회전초밥","🦀 게요리","🌃 스스키노 야경"],
      es:["🕰️ Torre Reloj","🗼 Torre TV Sapporo","⛷️ Telesilla Okurayama","🏅 Museo Olímpico","🍪 Parque Shiroi Koibito","🚠 Teleférico Moiwa","🐑 Hitsujigaoka","🍺 Museo Cerveza Sapporo","🏢 JR Tower T38","🐻 Zoo Maruyama","🍜 Ramen Miso","🐑 Jingisukan","🍛 Sopa Curry","🍗 Zangi","🍣 Tazón mariscos","🍣 Sushi giratorio","🦀 Cangrejo","🌃 Susukino Noche"],
      pt:["🕰️ Torre Relógio","🗼 Torre TV Sapporo","⛷️ Telesqui Okurayama","🏅 Museu Olímpico","🍪 Parque Shiroi Koibito","🚠 Teleférico Moiwa","🐑 Hitsujigaoka","🍺 Museu Cerveja Sapporo","🏢 JR Tower T38","🐻 Zoo Maruyama","🍜 Ramen Missô","🐑 Jingisukan","🍛 Sopa Curry","🍗 Zangi","🍣 Tigela frutos do mar","🍣 Sushi giratório","🦀 Caranguejo","🌃 Susukino Noite"]
    },
    仙台:{
      ja:["🏯 仙台城跡","🏛️ 青葉城資料展示館","⛩️ 瑞鳳殿","🐠 うみの杜水族館","🚢 松島観光船","⛵ 松島〜塩釜定期航路","⛩️ 大崎八幡宮","🎨 仙台メディアテーク","🏛️ 仙台市博物館","💧 秋保大滝","🐂 牛タン定食(ランチ)","🐂 牛タン定食(標準)","🐂 牛タン定食(特上)","🌿 ずんだ餅","🥤 ずんだシェイク","🐟 笹かまぼこ","🌙 萩の月","🍲 せり鍋"],
      en:["🏯 Sendai Castle Ruins","🏛️ Aoba Castle Museum","⛩️ Zuihoden","🐠 Uminomori Aquarium","🚢 Matsushima Cruise","⛵ Matsushima-Shiogama","⛩️ Osaki Hachimangu","🎨 Mediatheque","🏛️ City Museum","💧 Akiu Falls","🐂 Gyutan Lunch","🐂 Gyutan Standard","🐂 Gyutan Premium","🌿 Zunda Mochi","🥤 Zunda Shake","🐟 Sasa Kamaboko","🌙 Hagi no Tsuki","🍲 Seri Nabe"],
      zh:["🏯 仙台城迹","🏛️ 青叶城资料展示馆","⛩️ 瑞凤殿","🐠 仙台海洋森林水族馆","🚢 松岛观光船","⛵ 松岛塩釜航线","⛩️ 大崎八幡宫","🎨 仙台媒体中心","🏛️ 仙台市博物馆","💧 秋保大瀑布","🐂 牛舌定食(午餐)","🐂 牛舌定食(标准)","🐂 牛舌定食(特级)","🌿 毛豆麻糬","🥤 毛豆奶昔","🐟 笹叶鱼板","🌙 萩之月","🍲 鸭儿芹火锅"],
      ko:["🏯 센다이성터","🏛️ 아오바조 자료전시관","⛩️ 즈이호덴","🐠 우미노모리 수족관","🚢 마츠시마 관광선","⛵ 마츠시마-시오가마","⛩️ 오사키 하치만구","🎨 센다이 미디어테크","🏛️ 시립박물관","💧 아키우 폭포","🐂 규탄정식(런치)","🐂 규탄정식(표준)","🐂 규탄정식(특상)","🌿 즌다모치","🥤 즌다 셰이크","🐟 사사카마보코","🌙 하기노츠키","🍲 세리나베"],
      es:["🏯 Ruinas Castillo Sendai","🏛️ Museo Aoba","⛩️ Zuihoden","🐠 Acuario Uminomori","🚢 Crucero Matsushima","⛵ Matsushima-Shiogama","⛩️ Osaki Hachimangu","🎨 Mediateca","🏛️ Museo Ciudad","💧 Cataratas Akiu","🐂 Gyutan(Almuerzo)","🐂 Gyutan(Estándar)","🐂 Gyutan(Premium)","🌿 Zunda Mochi","🥤 Zunda Shake","🐟 Sasa Kamaboko","🌙 Hagi no Tsuki","🍲 Seri Nabe"],
      pt:["🏯 Ruínas Castelo Sendai","🏛️ Museu Aoba","⛩️ Zuihoden","🐠 Aquário Uminomori","🚢 Cruzeiro Matsushima","⛵ Matsushima-Shiogama","⛩️ Osaki Hachimangu","🎨 Mediateca","🏛️ Museu Cidade","💧 Cataratas Akiu","🐂 Gyutan(Almoço)","🐂 Gyutan(Padrão)","🐂 Gyutan(Premium)","🌿 Zunda Mochi","🥤 Zunda Shake","🐟 Sasa Kamaboko","🌙 Hagi no Tsuki","🍲 Seri Nabe"]
    },
    横浜:{
      ja:["🏢 ランドマークタワー展望台","🎡 コスモクロック21","🏮 横浜中華街","🧱 赤レンガ倉庫","🍜 カップヌードルミュージアム","🐬 八景島シーパラ ワンデーパス","🐠 八景島アクアリゾーツパス","🗼 横浜マリンタワー","🚠 ヨコハマエアキャビン往復","🍜 新横浜ラーメン博物館","🥟 中華街・本格中華","🥡 中華街・食べ歩き","🍜 サンマーメン","🍜 家系ラーメン","🫖 中華街飲茶","🍰 ありあけハーバー","🍱 崎陽軒シウマイ弁当","🚢 クルーズディナー"],
      en:["🏢 Landmark Tower","🎡 Cosmo Clock 21","🏮 Yokohama Chinatown","🧱 Red Brick Warehouse","🍜 Cup Noodles Museum","🐬 Hakkeijima 1-Day Pass","🐠 Hakkeijima Aqua Pass","🗼 Marine Tower","🚠 Air Cabin Round","🍜 Ramen Museum","🥟 Chinatown Course","🥡 Chinatown Street","🍜 Sanma-men","🍜 Iekei Ramen","🫖 Chinatown Yum Cha","🍰 Ariake Harbour","🍱 Kiyoken Shumai Bento","🚢 Cruise Dinner"],
      zh:["🏢 地标塔展望台","🎡 大观览车21","🏮 横滨中华街","🧱 红砖仓库","🍜 杯面博物馆","🐬 八景岛一日通票","🐠 八景岛水族馆通票","🗼 横滨海洋塔","🚠 空中缆车往返","🍜 新横滨拉面博物馆","🥟 中华街正宗中餐","🥡 中华街小吃","🍜 三马面","🍜 家系拉面","🫖 中华街饮茶","🍰 有明港湾","🍱 崎阳轩烧麦便当","🚢 游船晚餐"],
      ko:["🏢 랜드마크 타워","🎡 코스모 클락 21","🏮 요코하마 차이나타운","🧱 붉은벽돌창고","🍜 컵누들 박물관","🐬 핫케이지마 1일권","🐠 핫케이지마 아쿠아권","🗼 마린타워","🚠 에어 캐빈 왕복","🍜 라멘 박물관","🥟 차이나타운 정통","🥡 차이나타운 길거리","🍜 산마멘","🍜 이에케이 라멘","🫖 차이나타운 얌차","🍰 아리아케 하버","🍱 키요켄 슈마이","🚢 크루즈 디너"],
      es:["🏢 Landmark Tower","🎡 Cosmo Clock 21","🏮 Chinatown Yokohama","🧱 Almacén Ladrillo","🍜 Museo Cup Noodles","🐬 Hakkeijima 1-Día","🐠 Hakkeijima Acuario","🗼 Marine Tower","🚠 Air Cabin","🍜 Museo Ramen","🥟 Chinatown Curso","🥡 Chinatown Calle","🍜 Sanma-men","🍜 Ramen Iekei","🫖 Yum Cha","🍰 Ariake Harbour","🍱 Bento Shumai","🚢 Crucero Cena"],
      pt:["🏢 Landmark Tower","🎡 Cosmo Clock 21","🏮 Chinatown Yokohama","🧱 Armazém Tijolo","🍜 Museu Cup Noodles","🐬 Hakkeijima 1-Dia","🐠 Hakkeijima Aquário","🗼 Marine Tower","🚠 Air Cabin","🍜 Museu Ramen","🥟 Chinatown Curso","🥡 Chinatown Rua","🍜 Sanma-men","🍜 Ramen Iekei","🫖 Yum Cha","🍰 Ariake Harbour","🍱 Bento Shumai","🚢 Cruzeiro Jantar"]
    },
    名古屋:{
      ja:["🏯 名古屋城","🐼 東山動植物園","🐠 名古屋港水族館","🧱 レゴランド","🚄 リニア・鉄道館","🔬 名古屋市科学館","⛩️ 熱田神宮","🏺 ノリタケの森","🚗 トヨタ産業技術記念館","🗼 名古屋テレビ塔","🍱 ひつまぶし","🥩 味噌カツ","🍲 味噌煮込みうどん","🍗 手羽先","🍝 きしめん","🍝 あんかけスパゲッティ","🍜 台湾ラーメン","🐔 名古屋コーチン"],
      en:["🏯 Nagoya Castle","🐼 Higashiyama Zoo","🐠 Nagoya Aquarium","🧱 LEGOLAND","🚄 SCMaglev & Railway","🔬 Science Museum","⛩️ Atsuta Shrine","🏺 Noritake Garden","🚗 Toyota Museum","🗼 TV Tower","🍱 Hitsumabushi","🥩 Misokatsu","🍲 Miso Nikomi","🍗 Tebasaki","🍝 Kishimen","🍝 Ankake Pasta","🍜 Taiwan Ramen","🐔 Nagoya Cochin"],
      zh:["🏯 名古屋城","🐼 东山动植物园","🐠 名古屋港水族馆","🧱 乐高乐园","🚄 磁悬浮铁道馆","🔬 名古屋科学馆","⛩️ 热田神宫","🏺 则武之森","🚗 丰田产业技术馆","🗼 名古屋电视塔","🍱 鳗鱼三吃饭","🥩 味噌炸猪排","🍲 味噌煮乌冬","🍗 鸡翅膀","🍝 棊子面","🍝 勾芡意面","🍜 台湾拉面","🐔 名古屋土鸡"],
      ko:["🏯 나고야성","🐼 히가시야마 동식물원","🐠 나고야항 수족관","🧱 레고랜드","🚄 리니어 철도관","🔬 과학관","⛩️ 아츠타 신궁","🏺 노리타케 숲","🚗 토요타 산업기술관","🗼 나고야 TV타워","🍱 히츠마부시","🥩 미소카츠","🍲 미소니코미 우동","🍗 테바사키","🍝 키시멘","🍝 안카케 파스타","🍜 타이완 라멘","🐔 나고야 코친"],
      es:["🏯 Castillo Nagoya","🐼 Zoo Higashiyama","🐠 Acuario Puerto","🧱 LEGOLAND","🚄 Museo Maglev","🔬 Museo Ciencia","⛩️ Santuario Atsuta","🏺 Jardín Noritake","🚗 Museo Toyota","🗼 Torre TV","🍱 Hitsumabushi","🥩 Misokatsu","🍲 Miso Nikomi","🍗 Tebasaki","🍝 Kishimen","🍝 Pasta Ankake","🍜 Ramen Taiwán","🐔 Pollo Cochin"],
      pt:["🏯 Castelo Nagoya","🐼 Zoo Higashiyama","🐠 Aquário Porto","🧱 LEGOLAND","🚄 Museu Maglev","🔬 Museu Ciência","⛩️ Santuário Atsuta","🏺 Jardim Noritake","🚗 Museu Toyota","🗼 Torre TV","🍱 Hitsumabushi","🥩 Misokatsu","🍲 Miso Nikomi","🍗 Tebasaki","🍝 Kishimen","🍝 Massa Ankake","🍜 Ramen Taiwan","🐔 Frango Cochin"]
    },
    神戸:{
      ja:["🗼 神戸ポートタワー","🏠 北野異人館 7館パス","🏘️ 北野異人館 単館","🐼 神戸どうぶつ王国","🐑 六甲山牧場","🚠 六甲山ロープウェー","🌊 メリケンパーク","🛍️ ハーバーランド","🌿 神戸布引ハーブ園","🏮 南京町（中華街）","🥩 神戸牛ステーキ(ランチ)","🥩 神戸牛ステーキ(ディナー)","🍔 神戸牛ハンバーグ","🍴 神戸牛食べ放題","🍳 そばめし","🐙 明石焼き","🍮 神戸プリン","🥘 ぼっかけ"],
      en:["🗼 Port Tower","🏠 Ijinkan 7-Pass","🏘️ Ijinkan Single","🐼 Animal Kingdom","🐑 Rokko Pasture","🚠 Rokko Ropeway","🌊 Meriken Park","🛍️ Harborland","🌿 Nunobiki Herb Garden","🏮 Nankinmachi","🥩 Kobe Beef Lunch","🥩 Kobe Beef Dinner","🍔 Kobe Beef Burger","🍴 Kobe Beef Buffet","🍳 Sobameshi","🐙 Akashiyaki","🍮 Kobe Pudding","🥘 Bokkake"],
      zh:["🗼 神户港塔","🏠 北野异人馆7馆通票","🏘️ 北野异人馆单馆","🐼 神户动物王国","🐑 六甲山牧场","🚠 六甲山缆车","🌊 美利坚公园","🛍️ 海港乐园","🌿 神户布引香草园","🏮 南京町","🥩 神户牛排(午餐)","🥩 神户牛排(晚餐)","🍔 神户牛汉堡","🍴 神户牛吃到饱","🍳 荞麦饭","🐙 明石烧","🍮 神户布丁","🥘 牛筋蒟蒻"],
      ko:["🗼 고베 포트타워","🏠 기타노 이진칸 7관","🏘️ 기타노 이진칸 단관","🐼 고베 동물왕국","🐑 록코산 목장","🚠 록코산 로프웨이","🌊 메리켄 파크","🛍️ 하버랜드","🌿 누노비키 허브가든","🏮 난킨마치","🥩 고베규 스테이크(런치)","🥩 고베규 스테이크(디너)","🍔 고베규 함박","🍴 고베규 뷔페","🍳 소바메시","🐙 아카시야키","🍮 고베 푸딩","🥘 봇카케"],
      es:["🗼 Torre Puerto","🏠 Ijinkan 7","🏘️ Ijinkan Solo","🐼 Animal Kingdom","🐑 Rokko Pasture","🚠 Rokko Cable","🌊 Meriken Park","🛍️ Harborland","🌿 Nunobiki Hierbas","🏮 Nankinmachi","🥩 Kobe Almuerzo","🥩 Kobe Cena","🍔 Kobe Burger","🍴 Kobe Buffet","🍳 Sobameshi","🐙 Akashiyaki","🍮 Pudín Kobe","🥘 Bokkake"],
      pt:["🗼 Torre Porto","🏠 Ijinkan 7","🏘️ Ijinkan Solo","🐼 Animal Kingdom","🐑 Rokko Pasto","🚠 Rokko Cabo","🌊 Meriken Park","🛍️ Harborland","🌿 Nunobiki Ervas","🏮 Nankinmachi","🥩 Kobe Almoço","🥩 Kobe Jantar","🍔 Kobe Burger","🍴 Kobe Buffet","🍳 Sobameshi","🐙 Akashiyaki","🍮 Pudim Kobe","🥘 Bokkake"]
    },
    広島:{
      ja:["🕊️ 平和記念資料館","🏛️ 原爆ドーム","⛩️ 厳島神社 昇殿料","🎁 厳島神社+宝物館","🏯 千畳閣","🚠 宮島ロープウェイ往復","⛴️ 宮島フェリー片道","🏯 広島城","🚢 大和ミュージアム","🚠 千光寺山ロープウェイ往復","🥞 広島風お好み焼き","🦪 焼き牡蠣","🍱 あなご飯","🍜 広島ラーメン","🌶️ 汁なし担々麺","🍁 もみじ饅頭","🍩 揚げもみじ","🍋 レモン菓子"],
      en:["🕊️ Peace Memorial Museum","🏛️ Atomic Bomb Dome","⛩️ Itsukushima Shrine","🎁 Itsukushima+Treasure","🏯 Senjokaku Hall","🚠 Miyajima Ropeway","⛴️ Miyajima Ferry","🏯 Hiroshima Castle","🚢 Yamato Museum","🚠 Senkoji Ropeway","🥞 Hiroshima Okonomiyaki","🦪 Grilled Oyster","🍱 Anago-meshi","🍜 Hiroshima Ramen","🌶️ Soupless Tantanmen","🍁 Momiji Manju","🍩 Fried Momiji","🍋 Lemon Sweets"],
      zh:["🕊️ 和平纪念资料馆","🏛️ 原爆穹顶","⛩️ 严岛神社","🎁 严岛+宝物馆","🏯 千叠阁","🚠 宫岛缆车往返","⛴️ 宫岛轮渡单程","🏯 广岛城","🚢 大和博物馆","🚠 千光寺山缆车","🥞 广岛烧","🦪 烤牡蛎","🍱 鳗鱼饭","🍜 广岛拉面","🌶️ 干汁担担面","🍁 红叶馒头","🍩 炸红叶馒头","🍋 柠檬甜点"],
      ko:["🕊️ 평화기념자료관","🏛️ 원폭돔","⛩️ 이쓰쿠시마 신사","🎁 이쓰쿠시마+보물관","🏯 센조카쿠","🚠 미야지마 로프웨이","⛴️ 미야지마 페리","🏯 히로시마성","🚢 야마토 박물관","🚠 센코지산 로프웨이","🥞 히로시마 오코노미야키","🦪 구운 굴","🍱 아나고메시","🍜 히로시마 라멘","🌶️ 시루나시 탄탄면","🍁 모미지 만쥬","🍩 튀긴 모미지","🍋 레몬 과자"],
      es:["🕊️ Museo Memorial Paz","🏛️ Cúpula Bomba","⛩️ Itsukushima","🎁 Itsukushima+Tesoro","🏯 Senjokaku","🚠 Miyajima Cable","⛴️ Ferry Miyajima","🏯 Castillo Hiroshima","🚢 Museo Yamato","🚠 Senkoji Cable","🥞 Okonomiyaki Hiroshima","🦪 Ostra Asada","🍱 Anago-meshi","🍜 Ramen Hiroshima","🌶️ Tantanmen Seco","🍁 Momiji Manju","🍩 Momiji Frito","🍋 Dulces Limón"],
      pt:["🕊️ Museu Paz","🏛️ Cúpula Bomba","⛩️ Itsukushima","🎁 Itsukushima+Tesouro","🏯 Senjokaku","🚠 Miyajima Cabo","⛴️ Ferry Miyajima","🏯 Castelo Hiroshima","🚢 Museu Yamato","🚠 Senkoji Cabo","🥞 Okonomiyaki Hiroshima","🦪 Ostra Grelhada","🍱 Anago-meshi","🍜 Ramen Hiroshima","🌶️ Tantanmen Seco","🍁 Momiji Manju","🍩 Momiji Frito","🍋 Doces Limão"]
    },
    "博多・福岡":{
      ja:["⛩️ 太宰府天満宮","🗼 福岡タワー","🐠 マリンワールド海の中道","🌳 海の中道海浜公園","🛍️ キャナルシティ博多","🐼 福岡市動物園","⛩️ 櫛田神社","🚉 博多駅","🌸 能古島アイランドパーク","🎨 福岡市美術館","🍜 豚骨ラーメン","🏮 屋台ラーメン","🍲 もつ鍋","🐔 水炊き","🌶️ 明太子","🍱 明太重","🐟 ごまさば","🍢 焼き鳥(とり皮)"],
      en:["⛩️ Dazaifu Tenmangu","🗼 Fukuoka Tower","🐠 Marine World","🌳 Uminonakamichi Park","🛍️ Canal City","🐼 Fukuoka Zoo","⛩️ Kushida Shrine","🚉 Hakata Station","🌸 Nokonoshima","🎨 Art Museum","🍜 Tonkotsu Ramen","🏮 Yatai Ramen","🍲 Motsunabe","🐔 Mizutaki","🌶️ Mentaiko","🍱 Mentai-ju","🐟 Goma-saba","🍢 Tori-kawa"],
      zh:["⛩️ 太宰府天满宫","🗼 福冈塔","🐠 海洋世界","🌳 海中道海滨公园","🛍️ 博多运河城","🐼 福冈动物园","⛩️ 栉田神社","🚉 博多车站","🌸 能古岛","🎨 福冈美术馆","🍜 豚骨拉面","🏮 屋台拉面","🍲 内脏锅","🐔 鸡水炊","🌶️ 明太子","🍱 明太重","🐟 芝麻鲭鱼","🍢 烤鸡皮"],
      ko:["⛩️ 다자이후 텐만구","🗼 후쿠오카 타워","🐠 마린월드","🌳 우미노나카미치","🛍️ 캐널시티","🐼 후쿠오카 동물원","⛩️ 쿠시다 신사","🚉 하카타역","🌸 노코노시마","🎨 후쿠오카 미술관","🍜 돈코츠 라멘","🏮 야타이 라멘","🍲 모츠나베","🐔 미즈타키","🌶️ 명란","🍱 멘타이쥬","🐟 고마사바","🍢 토리카와"],
      es:["⛩️ Dazaifu Tenmangu","🗼 Torre Fukuoka","🐠 Marine World","🌳 Uminonakamichi","🛍️ Canal City","🐼 Zoo Fukuoka","⛩️ Santuario Kushida","🚉 Estación Hakata","🌸 Nokonoshima","🎨 Museo Arte","🍜 Ramen Tonkotsu","🏮 Yatai Ramen","🍲 Motsunabe","🐔 Mizutaki","🌶️ Mentaiko","🍱 Mentai-ju","🐟 Goma-saba","🍢 Tori-kawa"],
      pt:["⛩️ Dazaifu Tenmangu","🗼 Torre Fukuoka","🐠 Marine World","🌳 Uminonakamichi","🛍️ Canal City","🐼 Zoo Fukuoka","⛩️ Santuário Kushida","🚉 Estação Hakata","🌸 Nokonoshima","🎨 Museu Arte","🍜 Ramen Tonkotsu","🏮 Yatai Ramen","🍲 Motsunabe","🐔 Mizutaki","🌶️ Mentaiko","🍱 Mentai-ju","🐟 Goma-saba","🍢 Tori-kawa"]
    },
    "那覇・沖縄":{
      ja:["🐋 美ら海水族館","🏯 首里城公園","🛍️ 国際通り","🕳️ おきなわワールド","🕊️ ひめゆりの塔","🌊 万座毛","🗼 古宇利オーシャンタワー","🍍 ナゴパイナップルパーク","🕊️ 沖縄平和祈念堂","🏯 識名園","🍜 沖縄そば","🍳 ゴーヤチャンプルー","🥩 ラフテー","🌿 海ぶどう","🍩 サーターアンダギー","🍪 ちんすこう","🥜 ジーマミ豆腐","🍚 タコライス"],
      en:["🐋 Churaumi Aquarium","🏯 Shurijo Castle","🛍️ Kokusai Street","🕳️ Okinawa World","🕊️ Himeyuri Monument","🌊 Manzamo","🗼 Kouri Ocean Tower","🍍 Pineapple Park","🕊️ Peace Hall","🏯 Shikinaen","🍜 Okinawa Soba","🍳 Goya Chanpuru","🥩 Rafute","🌿 Umibudo","🍩 Sata Andagi","🍪 Chinsuko","🥜 Jimami Tofu","🍚 Taco Rice"],
      zh:["🐋 美丽海水族馆","🏯 首里城公园","🛍️ 国际通","🕳️ 冲绳世界","🕊️ 姬百合之塔","🌊 万座毛","🗼 古宇利海洋塔","🍍 凤梨园","🕊️ 和平祈念堂","🏯 识名园","🍜 冲绳荞麦面","🍳 苦瓜杂炒","🥩 红烧三层肉","🌿 海葡萄","🍩 冲绳甜甜圈","🍪 金楚糕","🥜 花生豆腐","🍚 塔可饭"],
      ko:["🐋 추라우미 수족관","🏯 슈리성 공원","🛍️ 국제거리","🕳️ 오키나와 월드","🕊️ 히메유리의 탑","🌊 만자모","🗼 고우리 오션타워","🍍 파인애플 파크","🕊️ 평화기념당","🏯 시키나엔","🍜 오키나와 소바","🍳 고야 찬푸루","🥩 라후테","🌿 우미부도","🍩 사타안다기","🍪 친스코","🥜 지마미 두부","🍚 타코라이스"],
      es:["🐋 Acuario Churaumi","🏯 Castillo Shurijo","🛍️ Calle Kokusai","🕳️ Okinawa World","🕊️ Monumento Himeyuri","🌊 Manzamo","🗼 Torre Kouri","🍍 Pineapple Park","🕊️ Sala Paz","🏯 Shikinaen","🍜 Okinawa Soba","🍳 Goya Chanpuru","🥩 Rafute","🌿 Umibudo","🍩 Sata Andagi","🍪 Chinsuko","🥜 Tofu Maní","🍚 Taco Rice"],
      pt:["🐋 Aquário Churaumi","🏯 Castelo Shurijo","🛍️ Rua Kokusai","🕳️ Okinawa World","🕊️ Monumento Himeyuri","🌊 Manzamo","🗼 Torre Kouri","🍍 Pineapple Park","🕊️ Sala Paz","🏯 Shikinaen","🍜 Okinawa Soba","🍳 Goya Chanpuru","🥩 Rafute","🌿 Umibudo","🍩 Sata Andagi","🍪 Chinsuko","🥜 Tofu Amendoim","🍚 Taco Rice"]
    },
    ソウル:{
      ja:["🏯 景福宮","🗼 Nソウルタワー","🚠 南山ケーブルカー","🎢 ロッテワールド","🏘️ 北村韓屋村","🛍️ 明洞","🎨 仁寺洞","🏛️ DDP","🏯 昌徳宮","🚢 漢江遊覧船","🥩 サムギョプサル","🍚 ビビンバ","🍜 冷麺","🍲 サムゲタン","🌶️ トッポッキ","🍗 韓国チキン","🍙 キンパ","🍱 韓定食コース"],
      en:["🏯 Gyeongbokgung","🗼 N Seoul Tower","🚠 Namsan Cable Car","🎢 Lotte World","🏘️ Bukchon Hanok","🛍️ Myeongdong","🎨 Insadong","🏛️ DDP","🏯 Changdeokgung","🚢 Hangang Cruise","🥩 Samgyeopsal","🍚 Bibimbap","🍜 Naengmyeon","🍲 Samgyetang","🌶️ Tteokbokki","🍗 Korean Chicken","🍙 Kimbap","🍱 Hanjeongsik"],
      zh:["🏯 景福宫","🗼 N首尔塔","🚠 南山缆车","🎢 乐天世界","🏘️ 北村韩屋村","🛍️ 明洞","🎨 仁寺洞","🏛️ DDP","🏯 昌德宫","🚢 汉江游船","🥩 三层肉","🍚 拌饭","🍜 冷面","🍲 参鸡汤","🌶️ 辣炒年糕","🍗 韩式炸鸡","🍙 紫菜包饭","🍱 韩定食"],
      ko:["🏯 경복궁","🗼 N서울타워","🚠 남산케이블카","🎢 롯데월드","🏘️ 북촌한옥마을","🛍️ 명동","🎨 인사동","🏛️ DDP","🏯 창덕궁","🚢 한강유람선","🥩 삼겹살","🍚 비빔밥","🍜 냉면","🍲 삼계탕","🌶️ 떡볶이","🍗 한국치킨","🍙 김밥","🍱 한정식"],
      es:["🏯 Gyeongbokgung","🗼 N Seoul Tower","🚠 Cable Namsan","🎢 Lotte World","🏘️ Bukchon","🛍️ Myeongdong","🎨 Insadong","🏛️ DDP","🏯 Changdeokgung","🚢 Crucero Hangang","🥩 Samgyeopsal","🍚 Bibimbap","🍜 Naengmyeon","🍲 Samgyetang","🌶️ Tteokbokki","🍗 Pollo Coreano","🍙 Kimbap","🍱 Hanjeongsik"],
      pt:["🏯 Gyeongbokgung","🗼 N Seoul Tower","🚠 Cabo Namsan","🎢 Lotte World","🏘️ Bukchon","🛍️ Myeongdong","🎨 Insadong","🏛️ DDP","🏯 Changdeokgung","🚢 Cruzeiro Hangang","🥩 Samgyeopsal","🍚 Bibimbap","🍜 Naengmyeon","🍲 Samgyetang","🌶️ Tteokbokki","🍗 Frango Coreano","🍙 Kimbap","🍱 Hanjeongsik"]
    },
    仁川:{
      ja:["✈️ 仁川国際空港","🌊 月尾島","🌳 ソンドセントラルパーク","🏮 チャイナタウン","🏛️ ソンドコンベンシア","🌳 自由公園","🛍️ 新浦国際市場","⚾ Wyverns野球","🎢 月尾テーマパーク","🌉 仁川大橋","🍜 チャジャン麺","🍲 海鮮鍋","🌶️ 新浦ラッポッキ","🦪 月尾島貝焼き","🥖 シナモンパン","🍞 アンパン","🥞 海鮮チヂミ","🍺 生ビール"],
      en:["✈️ Incheon Airport","🌊 Wolmido Island","🌳 Songdo Central Park","🏮 Chinatown","🏛️ Songdo Convensia","🌳 Jayu Park","🛍️ Sinpo Market","⚾ Wyverns Baseball","🎢 Wolmi Theme Park","🌉 Incheon Bridge","🍜 Jajangmyeon","🍲 Seafood Hotpot","🌶️ Sinpo Rapokki","🦪 Grilled Shellfish","🥖 Cinnamon Bread","🍞 Anpan","🥞 Seafood Pancake","🍺 Draft Beer"],
      zh:["✈️ 仁川机场","🌊 月尾岛","🌳 松岛中央公园","🏮 仁川中华街","🏛️ 松岛会展中心","🌳 自由公园","🛍️ 新浦市场","⚾ 维伦斯棒球","🎢 月尾主题公园","🌉 仁川大桥","🍜 炸酱面","🍲 海鲜汤","🌶️ 新浦辣炒年糕","🦪 月尾岛烤贝","🥖 肉桂面包","🍞 红豆包","🥞 海鲜煎饼","🍺 生啤酒"],
      ko:["✈️ 인천공항","🌊 월미도","🌳 송도센트럴파크","🏮 차이나타운","🏛️ 송도컨벤시아","🌳 자유공원","🛍️ 신포국제시장","⚾ 와이번스 야구","🎢 월미테마파크","🌉 인천대교","🍜 짜장면","🍲 해물탕","🌶️ 신포 라볶이","🦪 월미도 조개구이","🥖 시나몬빵","🍞 단팥빵","🥞 해물파전","🍺 생맥주"],
      es:["✈️ Aeropuerto Incheon","🌊 Isla Wolmido","🌳 Songdo Park","🏮 Chinatown","🏛️ Songdo Convensia","🌳 Parque Jayu","🛍️ Mercado Sinpo","⚾ Béisbol Wyverns","🎢 Parque Wolmi","🌉 Puente Incheon","🍜 Jajangmyeon","🍲 Sopa Mariscos","🌶️ Sinpo Rapokki","🦪 Mariscos a la Plancha","🥖 Pan Canela","🍞 Anpan","🥞 Tortilla Mariscos","🍺 Cerveza"],
      pt:["✈️ Aeroporto Incheon","🌊 Ilha Wolmido","🌳 Songdo Park","🏮 Chinatown","🏛️ Songdo Convensia","🌳 Parque Jayu","🛍️ Mercado Sinpo","⚾ Beisebol Wyverns","🎢 Parque Wolmi","🌉 Ponte Incheon","🍜 Jajangmyeon","🍲 Sopa Frutos do Mar","🌶️ Sinpo Rapokki","🦪 Conchas Grelhadas","🥖 Pão Canela","🍞 Anpan","🥞 Panqueca Mariscos","🍺 Chopp"]
    },
    釜山:{
      ja:["🏖️ 海雲台ビーチ","🏘️ 甘川文化村","🐟 チャガルチ市場","🏯 海東龍宮寺","🗼 釜山タワー","🚂 ブルーラインパーク","🌊 太宗台","🏖️ 広安里ビーチ","🌳 龍頭山公園","🚠 松島ケーブルカー","🍲 豚クッパ","🍜 ミルミョン","🦐 海鮮鍋","🐟 刺身","🐙 ナクチポックム","🍚 デジクッパ","🦐 エビ焼き","🍹 シッケ"],
      en:["🏖️ Haeundae Beach","🏘️ Gamcheon Village","🐟 Jagalchi Market","🏯 Haedong Yonggungsa","🗼 Busan Tower","🚂 Blue Line Park","🌊 Taejongdae","🏖️ Gwangalli Beach","🌳 Yongdusan Park","🚠 Songdo Cable Car","🍲 Dwaeji Gukbap","🍜 Milmyeon","🦐 Seafood Hotpot","🐟 Sashimi","🐙 Nakji Bokkeum","🍚 Dwaeji Gukbap","🦐 Grilled Shrimp","🍹 Sikhye"],
      zh:["🏖️ 海云台海滩","🏘️ 甘川文化村","🐟 札嘎其市场","🏯 海东龙宫寺","🗼 釜山塔","🚂 蓝线公园","🌊 太宗台","🏖️ 广安里海滩","🌳 龙头山公园","🚠 松岛缆车","🍲 猪肉汤饭","🍜 麦面","🦐 海鲜汤","🐟 生鱼片","🐙 辣炒章鱼","🍚 猪肉汤饭","🦐 烤虾","🍹 甜米露"],
      ko:["🏖️ 해운대해수욕장","🏘️ 감천문화마을","🐟 자갈치시장","🏯 해동용궁사","🗼 부산타워","🚂 블루라인파크","🌊 태종대","🏖️ 광안리해수욕장","🌳 용두산공원","🚠 송도케이블카","🍲 돼지국밥","🍜 밀면","🦐 해물탕","🐟 회","🐙 낙지볶음","🍚 돼지국밥","🦐 새우구이","🍹 식혜"],
      es:["🏖️ Playa Haeundae","🏘️ Aldea Gamcheon","🐟 Mercado Jagalchi","🏯 Haedong Yonggungsa","🗼 Torre Busan","🚂 Blue Line Park","🌊 Taejongdae","🏖️ Playa Gwangalli","🌳 Parque Yongdusan","🚠 Cable Songdo","🍲 Dwaeji Gukbap","🍜 Milmyeon","🦐 Sopa Mariscos","🐟 Sashimi","🐙 Pulpo Picante","🍚 Dwaeji Gukbap","🦐 Camarón Asado","🍹 Sikhye"],
      pt:["🏖️ Praia Haeundae","🏘️ Aldeia Gamcheon","🐟 Mercado Jagalchi","🏯 Haedong Yonggungsa","🗼 Torre Busan","🚂 Blue Line Park","🌊 Taejongdae","🏖️ Praia Gwangalli","🌳 Parque Yongdusan","🚠 Cabo Songdo","🍲 Dwaeji Gukbap","🍜 Milmyeon","🦐 Sopa Frutos","🐟 Sashimi","🐙 Polvo Picante","🍚 Dwaeji Gukbap","🦐 Camarão Grelhado","🍹 Sikhye"]
    },
    大邱:{
      ja:["🚠 八公山ロープウェイ","🛍️ 西門市場","🛍️ 東城路","🏛️ 近代文化通り","⛪ 桂山聖堂","🌿 薬令市","🗼 大邱83タワー","🌳 頭流公園","🛍️ 安吉モクチェ通り","🏛️ 青羅言堂","🍖 マクチャンクイ","🍗 平和市場チメッ","🥟 ナプチャクマンドゥ","🥩 テジカルビ","🐐 フクヨムソ","🍱 十大味","🌶️ 辛いカルグクス","🍳 ヤキメシ"],
      en:["🚠 Palgongsan Cable","🛍️ Seomun Market","🛍️ Dongseong-ro","🏛️ Modern Culture Street","⛪ Gyesan Cathedral","🌿 Yangnyeongsi","🗼 Daegu 83 Tower","🌳 Duryu Park","🛍️ Angil Mokje","🏛️ Cheongna Eondam","🍖 Makchang Gui","🍗 Chimaek Market","🥟 Napjak Mandu","🥩 Daegu Galbi","🐐 Heukyeomso","🍱 Sipdaemi","🌶️ Spicy Kalguksu","🍳 Yaki Meshi"],
      zh:["🚠 八公山缆车","🛍️ 西门市场","🛍️ 东城路","🏛️ 近代文化街","⛪ 桂山主教座堂","🌿 药令市","🗼 大邱83塔","🌳 头流公园","🛍️ 安吉穆鲁洞","🏛️ 青萝言堂","🍖 烤大肠","🍗 平和市场啤酒炸鸡","🥟 扁平饺子","🥩 大邱排骨","🐐 黑山羊汤","🍱 十大味","🌶️ 辣刀削面","🍳 烧饭"],
      ko:["🚠 팔공산케이블카","🛍️ 서문시장","🛍️ 동성로","🏛️ 근대문화골목","⛪ 계산성당","🌿 약령시","🗼 대구 83타워","🌳 두류공원","🛍️ 안지목재거리","🏛️ 청라언덕","🍖 막창구이","🍗 평화시장 치맥","🥟 납작만두","🥩 돼지갈비","🐐 흑염소","🍱 십대맛","🌶️ 매운칼국수","🍳 야끼밥"],
      es:["🚠 Cable Palgongsan","🛍️ Mercado Seomun","🛍️ Dongseong-ro","🏛️ Calle Cultura Moderna","⛪ Catedral Gyesan","🌿 Yangnyeongsi","🗼 Torre Daegu 83","🌳 Parque Duryu","🛍️ Angil Mokje","🏛️ Cheongna","🍖 Makchang Gui","🍗 Chimaek","🥟 Napjak Mandu","🥩 Daegu Galbi","🐐 Cabra Negra","🍱 Sipdaemi","🌶️ Kalguksu Picante","🍳 Yaki Meshi"],
      pt:["🚠 Cabo Palgongsan","🛍️ Mercado Seomun","🛍️ Dongseong-ro","🏛️ Rua Cultura Moderna","⛪ Catedral Gyesan","🌿 Yangnyeongsi","🗼 Torre Daegu 83","🌳 Parque Duryu","🛍️ Angil Mokje","🏛️ Cheongna","🍖 Makchang Gui","🍗 Chimaek","🥟 Napjak Mandu","🥩 Daegu Galbi","🐐 Cabra Preta","🍱 Sipdaemi","🌶️ Kalguksu Picante","🍳 Yaki Meshi"]
    },
    済州島:{
      ja:["🌋 城山日出峰","🏔️ 漢拏山国立公園","🕳️ 万丈窟","🐄 牛島フェリー","💧 天帝淵瀑布","💧 正房瀑布","🌳 テジボン公園","🪨 龍頭岩","🏘️ ヒーリョンタウン","🏖️ 中文海水浴場","🐖 黒豚焼肉","🍜 テジコギグクス","🍲 アワビ粥","🌊 海女料理","🐟 タチウオ料理","🏄 サーフィン体験","🍡 オメギ餅","🍊 漢拏ボン"],
      en:["🌋 Seongsan Ilchulbong","🏔️ Hallasan National Park","🕳️ Manjanggul Cave","🐄 Udo Ferry","💧 Cheonjeyeon Falls","💧 Jeongbang Falls","🌳 Daejeobong Park","🪨 Yongduam Rock","🏘️ Heoryong Town","🏖️ Jungmun Beach","🐖 Black Pork BBQ","🍜 Dwaeji Gukbap","🍲 Abalone Porridge","🌊 Haenyeo Cuisine","🐟 Cutlassfish","🏄 Surfing","🍡 Omegi Tteok","🍊 Hallabong"],
      zh:["🌋 城山日出峰","🏔️ 汉拿山","🕳️ 万丈窟","🐄 牛岛轮渡","💧 天帝渊瀑布","💧 正房瀑布","🌳 大邸峰公园","🪨 龙头岩","🏘️ 海女村","🏖️ 中文海水浴场","🐖 黑猪烤肉","🍜 猪肉汤面","🍲 鲍鱼粥","🌊 海女料理","🐟 带鱼料理","🏄 冲浪体验","🍡 五味子糕","🍊 汉拿峰"],
      ko:["🌋 성산일출봉","🏔️ 한라산국립공원","🕳️ 만장굴","🐄 우도페리","💧 천제연폭포","💧 정방폭포","🌳 대접봉공원","🪨 용두암","🏘️ 해녀마을","🏖️ 중문해수욕장","🐖 흑돼지구이","🍜 돼지국수","🍲 전복죽","🌊 해녀요리","🐟 갈치요리","🏄 서핑체험","🍡 오메기떡","🍊 한라봉"],
      es:["🌋 Seongsan Ilchulbong","🏔️ Hallasan","🕳️ Manjanggul","🐄 Ferry Udo","💧 Cataratas Cheonjeyeon","💧 Cataratas Jeongbang","🌳 Parque Daejeobong","🪨 Roca Yongduam","🏘️ Aldea Haenyeo","🏖️ Playa Jungmun","🐖 BBQ Cerdo Negro","🍜 Dwaeji Gukbap","🍲 Abulón Gachas","🌊 Cocina Haenyeo","🐟 Pez Cinto","🏄 Surf","🍡 Omegi Tteok","🍊 Hallabong"],
      pt:["🌋 Seongsan Ilchulbong","🏔️ Hallasan","🕳️ Manjanggul","🐄 Ferry Udo","💧 Cataratas Cheonjeyeon","💧 Cataratas Jeongbang","🌳 Parque Daejeobong","🪨 Rocha Yongduam","🏘️ Aldeia Haenyeo","🏖️ Praia Jungmun","🐖 BBQ Porco Preto","🍜 Dwaeji Gukbap","🍲 Abulone Mingau","🌊 Culinária Haenyeo","🐟 Peixe Cinto","🏄 Surf","🍡 Omegi Tteok","🍊 Hallabong"]
    },
    全州:{
      ja:["🏘️ 全州韓屋村","🏯 慶基殿","⛪ 殿洞聖堂","🌳 梧木台","🏛️ 寒碧堂","🏛️ 全州郷校","🛍️ 南部市場","🌳 徳津公園","🍶 マッコリ通り","🎨 工芸品展示館","🍚 全州ビビンバ","🍲 コンナムルクッパ","🍶 マッコリ","🍡 伝統菓子","🌶️ ピチョリ唐辛子","🍫 PNBチョコパイ","🍙 文化キンパ","🍲 十里堤野菜炒め"],
      en:["🏘️ Jeonju Hanok Village","🏯 Gyeonggijeon","⛪ Jeondong Cathedral","🌳 Omokdae","🏛️ Hanbyeokdang","🏛️ Jeonju Hyanggyo","🛍️ Nambu Market","🌳 Deokjin Park","🍶 Makgeolli Street","🎨 Craft Center","🍚 Jeonju Bibimbap","🍲 Kongnamul Gukbap","🍶 Makgeolli","🍡 Traditional Sweets","🌶️ Pichori Pepper","🍫 PNB Chocopie","🍙 Munhwa Kimbap","🍲 Sipri Vegetables"],
      zh:["🏘️ 全州韩屋村","🏯 庆基殿","⛪ 殿洞圣堂","🌳 梧木台","🏛️ 寒碧堂","🏛️ 全州乡校","🛍️ 南部市场","🌳 德津公园","🍶 马格利酒街","🎨 工艺品馆","🍚 全州拌饭","🍲 豆芽汤饭","🍶 马格利酒","🍡 传统糕点","🌶️ 皮焦里辣椒","🍫 PNB巧克力派","🍙 文化紫菜包饭","🍲 十里堤炒菜"],
      ko:["🏘️ 전주한옥마을","🏯 경기전","⛪ 전동성당","🌳 오목대","🏛️ 한벽당","🏛️ 전주향교","🛍️ 남부시장","🌳 덕진공원","🍶 막걸리골목","🎨 공예품전시관","🍚 전주비빔밥","🍲 콩나물국밥","🍶 막걸리","🍡 전통과자","🌶️ 피초리고추","🍫 PNB초코파이","🍙 문화김밥","🍲 십리제 채소볶음"],
      es:["🏘️ Jeonju Hanok","🏯 Gyeonggijeon","⛪ Catedral Jeondong","🌳 Omokdae","🏛️ Hanbyeokdang","🏛️ Jeonju Hyanggyo","🛍️ Mercado Nambu","🌳 Parque Deokjin","🍶 Calle Makgeolli","🎨 Centro Artesanía","🍚 Bibimbap Jeonju","🍲 Kongnamul","🍶 Makgeolli","🍡 Dulces","🌶️ Chile Pichori","🍫 PNB Chocopie","🍙 Kimbap","🍲 Sipri Verduras"],
      pt:["🏘️ Jeonju Hanok","🏯 Gyeonggijeon","⛪ Catedral Jeondong","🌳 Omokdae","🏛️ Hanbyeokdang","🏛️ Jeonju Hyanggyo","🛍️ Mercado Nambu","🌳 Parque Deokjin","🍶 Rua Makgeolli","🎨 Centro Artesanato","🍚 Bibimbap Jeonju","🍲 Kongnamul","🍶 Makgeolli","🍡 Doces","🌶️ Pimenta Pichori","🍫 PNB Chocopie","🍙 Kimbap","🍲 Sipri Vegetais"]
    },
    慶州:{
      ja:["🏯 仏国寺","🗿 石窟庵","🔭 瞻星台","🌊 雁鴨池","⚱️ 大陵苑","🏛️ 慶州歴史地区","🏘️ 良洞民俗村","🏛️ 統一殿","🌳 普門観光団地","🗼 慶州タワー","🍞 皇南パン","🍚 慶州ビビンバ","🌿 サムマンス豆腐料理","🌼 菊花パン","🍶 慶州法酒","🍡 韓菓","🍬 麦芽飴","🍚 ヌルンジ"],
      en:["🏯 Bulguksa Temple","🗿 Seokguram","🔭 Cheomseongdae","🌊 Anapji Pond","⚱️ Daereungwon","🏛️ Gyeongju Historic Area","🏘️ Yangdong Village","🏛️ Tongiljeon","🌳 Bomun Resort","🗼 Gyeongju Tower","🍞 Hwangnam Bread","🍚 Gyeongju Bibimbap","🌿 Tofu Cuisine","🌼 Gukhwa Bread","🍶 Beopju Liquor","🍡 Hangwa","🍬 Malt Candy","🍚 Nurungji"],
      zh:["🏯 佛国寺","🗿 石窟庵","🔭 瞻星台","🌊 雁鸭池","⚱️ 大陵苑","🏛️ 庆州历史区","🏘️ 良洞民俗村","🏛️ 统一殿","🌳 普门旅游区","🗼 庆州塔","🍞 皇南面包","🍚 庆州拌饭","🌿 豆腐料理","🌼 菊花面包","🍶 庆州法酒","🍡 韩果","🍬 麦芽糖","🍚 锅巴"],
      ko:["🏯 불국사","🗿 석굴암","🔭 첨성대","🌊 안압지","⚱️ 대릉원","🏛️ 경주역사유적지구","🏘️ 양동민속마을","🏛️ 통일전","🌳 보문관광단지","🗼 경주타워","🍞 황남빵","🍚 경주비빔밥","🌿 두부요리","🌼 국화빵","🍶 경주법주","🍡 한과","🍬 엿","🍚 누룽지"],
      es:["🏯 Templo Bulguksa","🗿 Seokguram","🔭 Cheomseongdae","🌊 Estanque Anapji","⚱️ Daereungwon","🏛️ Área Histórica","🏘️ Aldea Yangdong","🏛️ Tongiljeon","🌳 Bomun Resort","🗼 Torre Gyeongju","🍞 Pan Hwangnam","🍚 Bibimbap","🌿 Tofu","🌼 Pan Gukhwa","🍶 Licor Beopju","🍡 Hangwa","🍬 Caramelo Malta","🍚 Nurungji"],
      pt:["🏯 Templo Bulguksa","🗿 Seokguram","🔭 Cheomseongdae","🌊 Lago Anapji","⚱️ Daereungwon","🏛️ Área Histórica","🏘️ Aldeia Yangdong","🏛️ Tongiljeon","🌳 Bomun Resort","🗼 Torre Gyeongju","🍞 Pão Hwangnam","🍚 Bibimbap","🌿 Tofu","🌼 Pão Gukhwa","🍶 Licor Beopju","🍡 Hangwa","🍬 Caramelo Malte","🍚 Nurungji"]
    },
    江陵:{
      ja:["🏯 鏡浦台","🏖️ 鏡浦海水浴場","🏛️ 烏竹軒","🏛️ 船橋荘","🚂 正東津","☕ 安木カフェ通り","🛍️ 江陵中央市場","⚓ 注文津港","🌳 テリョン渓谷","🏔️ 束草秀峰丘","🥡 チョダン豆腐","🌭 オジンオスンデ","🌭 太岩ホットドッグ","🍜 ハマグリカルグクス","🌿 紅参","🦪 東海生牡蠣","🍲 ウィ吐豆腐定食","🍢 端午祭オデン"],
      en:["🏯 Gyeongpodae","🏖️ Gyeongpo Beach","🏛️ Ojukheon","🏛️ Seongyojang","🚂 Jeongdongjin","☕ Anmok Cafe Street","🛍️ Gangneung Market","⚓ Jumunjin Port","🌳 Daereong Valley","🏔️ Seoraksubong","🥡 Chodang Tofu","🌭 Ojingeo Sundae","🌭 Tearm Hot Dog","🍜 Clam Kalguksu","🌿 Red Ginseng","🦪 East Sea Oyster","🍲 Wita Tofu Set","🍢 Dano Festival Oden"],
      zh:["🏯 镜浦台","🏖️ 镜浦海水浴场","🏛️ 乌竹轩","🏛️ 船桥庄","🚂 正东津","☕ 安木咖啡街","🛍️ 江陵中央市场","⚓ 注文津港","🌳 大灵溪谷","🏔️ 束草秀峰丘","🥡 草堂豆腐","🌭 鱿鱼血肠","🌭 太岩热狗","🍜 蛤蜊刀削面","🌿 红参","🦪 东海生蚝","🍲 豆腐定食","🍢 端午节关东煮"],
      ko:["🏯 경포대","🏖️ 경포해수욕장","🏛️ 오죽헌","🏛️ 선교장","🚂 정동진","☕ 안목카페거리","🛍️ 강릉중앙시장","⚓ 주문진항","🌳 대령계곡","🏔️ 설악수봉","🥡 초당두부","🌭 오징어순대","🌭 태암핫도그","🍜 조개칼국수","🌿 홍삼","🦪 동해 생굴","🍲 두부정식","🍢 단오제 오뎅"],
      es:["🏯 Gyeongpodae","🏖️ Playa Gyeongpo","🏛️ Ojukheon","🏛️ Seongyojang","🚂 Jeongdongjin","☕ Café Anmok","🛍️ Mercado Gangneung","⚓ Puerto Jumunjin","🌳 Valle Daereong","🏔️ Seoraksubong","🥡 Tofu Chodang","🌭 Ojingeo Sundae","🌭 Hot Dog Tearm","🍜 Kalguksu Almejas","🌿 Ginseng Rojo","🦪 Ostra Mar Este","🍲 Set Tofu","🍢 Oden Dano"],
      pt:["🏯 Gyeongpodae","🏖️ Praia Gyeongpo","🏛️ Ojukheon","🏛️ Seongyojang","🚂 Jeongdongjin","☕ Café Anmok","🛍️ Mercado Gangneung","⚓ Porto Jumunjin","🌳 Vale Daereong","🏔️ Seoraksubong","🥡 Tofu Chodang","🌭 Ojingeo Sundae","🌭 Hot Dog Tearm","🍜 Kalguksu Mariscos","🌿 Ginseng Vermelho","🦪 Ostra Mar Leste","🍲 Set Tofu","🍢 Oden Dano"]
    },
    台北:{
      ja:["🗼 台北101展望台","🏛️ 故宮博物院","🏛️ 中正記念堂","⛩️ 龍山寺","🍢 士林夜市","🍢 饒河街夜市","🛍️ 西門町","🏘️ 迪化街","♨️ 北投温泉","🏛️ 国父記念館","🥟 小籠包(鼎泰豊)","🍜 牛肉麺","🍚 ルーロー飯","🥧 胡椒餅","🍧 マンゴーかき氷","🧋 タピオカミルクティー","🌶️ 臭豆腐","🍍 パイナップルケーキ"],
      en:["🗼 Taipei 101","🏛️ National Palace Museum","🏛️ CKS Memorial","⛩️ Longshan Temple","🍢 Shilin Night Market","🍢 Raohe Night Market","🛍️ Ximending","🏘️ Dihua Street","♨️ Beitou Hot Spring","🏛️ Sun Yat-sen Hall","🥟 Xiaolongbao","🍜 Beef Noodle","🍚 Lu Rou Fan","🥧 Pepper Bun","🍧 Mango Shaved Ice","🧋 Bubble Tea","🌶️ Stinky Tofu","🍍 Pineapple Cake"],
      zh:["🗼 台北101观景台","🏛️ 故宫博物院","🏛️ 中正纪念堂","⛩️ 龙山寺","🍢 士林夜市","🍢 饶河街夜市","🛍️ 西门町","🏘️ 迪化街","♨️ 北投温泉","🏛️ 国父纪念馆","🥟 小笼包(鼎泰丰)","🍜 牛肉面","🍚 卤肉饭","🥧 胡椒饼","🍧 芒果冰","🧋 珍珠奶茶","🌶️ 臭豆腐","🍍 凤梨酥"],
      ko:["🗼 타이베이 101","🏛️ 국립고궁박물원","🏛️ 중정기념당","⛩️ 룽산사","🍢 스린야시장","🍢 라오허제 야시장","🛍️ 시먼딩","🏘️ 디화제","♨️ 베이터우 온천","🏛️ 국부기념관","🥟 샤오롱바오","🍜 우육면","🍚 루러우판","🥧 후추빵","🍧 망고빙수","🧋 버블티","🌶️ 취두부","🍍 펑리수"],
      es:["🗼 Taipei 101","🏛️ Museo Palacio","🏛️ Memorial CKS","⛩️ Templo Longshan","🍢 Mercado Shilin","🍢 Mercado Raohe","🛍️ Ximending","🏘️ Calle Dihua","♨️ Aguas Beitou","🏛️ Sala Sun Yat-sen","🥟 Xiaolongbao","🍜 Sopa Carne","🍚 Lu Rou Fan","🥧 Pan Pimienta","🍧 Hielo Mango","🧋 Té Burbujas","🌶️ Tofu Apestoso","🍍 Pastel Piña"],
      pt:["🗼 Taipei 101","🏛️ Museu Palácio","🏛️ Memorial CKS","⛩️ Templo Longshan","🍢 Mercado Shilin","🍢 Mercado Raohe","🛍️ Ximending","🏘️ Rua Dihua","♨️ Águas Beitou","🏛️ Salão Sun Yat-sen","🥟 Xiaolongbao","🍜 Sopa Carne","🍚 Lu Rou Fan","🥧 Pão Pimenta","🍧 Gelo Manga","🧋 Bubble Tea","🌶️ Tofu Fedido","🍍 Bolo Abacaxi"]
    },
    台中:{
      ja:["🏥 宮原眼科","🌈 彩虹眷村","🍢 逢甲夜市","🌳 台中公園","⛪ 路思義教堂","🎨 国立台湾美術館","🌊 高美湿地","🛍️ 勤美誠品","⛩️ 台中孔子廟","🍢 忠孝路夜市","🌞 太陽餅","🍜 台中担仔麺","🍦 宮原アイス","🦆 烤鴨","🍲 麻油鶏","🍡 肉圓","🥪 洪瑞珍三明治","🧋 珍珠ミルクティー"],
      en:["🏥 Miyahara Ophthalmology","🌈 Rainbow Village","🍢 Fengjia Night Market","🌳 Taichung Park","⛪ Luce Chapel","🎨 NTMOFA","🌊 Gaomei Wetland","🛍️ CMP Block","⛩️ Confucius Temple","🍢 Zhongxiao Night Market","🌞 Sun Cake","🍜 Taichung Dan Zai","🍦 Miyahara Ice Cream","🦆 Roast Duck","🍲 Mayou Ji","🍡 Rou Yuan","🥪 Hong Rui Zhen","🧋 Bubble Tea (Origin)"],
      zh:["🏥 宫原眼科","🌈 彩虹眷村","🍢 逢甲夜市","🌳 台中公园","⛪ 路思义教堂","🎨 国立台湾美术馆","🌊 高美湿地","🛍️ 勤美诚品","⛩️ 台中孔子庙","🍢 忠孝路夜市","🌞 太阳饼","🍜 台中担仔面","🍦 宫原冰淇淋","🦆 烤鸭","🍲 麻油鸡","🍡 肉圆","🥪 洪瑞珍三明治","🧋 珍珠奶茶"],
      ko:["🏥 미야하라","🌈 무지개마을","🍢 펑자야시장","🌳 타이중공원","⛪ 루스이교회","🎨 미술관","🌊 가오메이습지","🛍️ 친메이청핀","⛩️ 공자묘","🍢 충샤오로 야시장","🌞 태양병","🍜 타이중 단자이","🍦 미야하라 아이스","🦆 오리구이","🍲 마유지","🍡 러우위안","🥪 홍루이전","🧋 버블티(원조)"],
      es:["🏥 Miyahara","🌈 Aldea Arcoíris","🍢 Mercado Fengjia","🌳 Parque Taichung","⛪ Capilla Luce","🎨 NTMOFA","🌊 Humedal Gaomei","🛍️ CMP Block","⛩️ Templo Confucio","🍢 Mercado Zhongxiao","🌞 Pastel Sol","🍜 Dan Zai Taichung","🍦 Helado Miyahara","🦆 Pato Asado","🍲 Mayou Ji","🍡 Rou Yuan","🥪 Hong Rui Zhen","🧋 Té Burbujas (Origen)"],
      pt:["🏥 Miyahara","🌈 Aldeia Arco-íris","🍢 Mercado Fengjia","🌳 Parque Taichung","⛪ Capela Luce","🎨 NTMOFA","🌊 Pântano Gaomei","🛍️ CMP Block","⛩️ Templo Confúcio","🍢 Mercado Zhongxiao","🌞 Bolo Sol","🍜 Dan Zai Taichung","🍦 Sorvete Miyahara","🦆 Pato Assado","🍲 Mayou Ji","🍡 Rou Yuan","🥪 Hong Rui Zhen","🧋 Bubble Tea (Origem)"]
    },
    台南:{
      ja:["🏯 赤崁楼","🏯 安平古堡","🏰 億載金城","🏬 林百貨","⛩️ 台南孔子廟","🏘️ 神農街","🏠 安平樹屋","🏛️ 奇美博物館","🍢 花園夜市","🍢 大東夜市","🍜 擔仔麺","🥪 棺材板","🍲 牛肉湯","🐟 虱目魚粥","🦐 蝦巻","🍚 米糕","🍜 関廟麺","🍬 椪糖"],
      en:["🏯 Chihkan Tower","🏯 Anping Fort","🏰 Eternal Castle","🏬 Hayashi Store","⛩️ Confucius Temple","🏘️ Shennong Street","🏠 Anping Tree House","🏛️ Chimei Museum","🍢 Garden Night Market","🍢 Dadong Night Market","🍜 Danzai Noodles","🥪 Coffin Bread","🍲 Beef Soup","🐟 Milkfish Congee","🦐 Shrimp Roll","🍚 Mi Gao","🍜 Guanmiao Noodle","🍬 Pong Tang"],
      zh:["🏯 赤崁楼","🏯 安平古堡","🏰 亿载金城","🏬 林百货","⛩️ 台南孔子庙","🏘️ 神农街","🏠 安平树屋","🏛️ 奇美博物馆","🍢 花园夜市","🍢 大东夜市","🍜 担仔面","🥪 棺材板","🍲 牛肉汤","🐟 虱目鱼粥","🦐 虾卷","🍚 米糕","🍜 关庙面","🍬 椪糖"],
      ko:["🏯 츠칸러우","🏯 안핑고보","🏰 억재금성","🏬 하야시 백화점","⛩️ 공자묘","🏘️ 션농제","🏠 안핑수옥","🏛️ 치메이박물관","🍢 화원야시장","🍢 다둥야시장","🍜 단자이면","🥪 관차이반","🍲 우육탕","🐟 시목어죽","🦐 새우롤","🍚 미가오","🍜 관묘면","🍬 펑탕"],
      es:["🏯 Torre Chihkan","🏯 Fuerte Anping","🏰 Castillo Eterno","🏬 Tienda Hayashi","⛩️ Templo Confucio","🏘️ Calle Shennong","🏠 Casa Árbol","🏛️ Museo Chimei","🍢 Mercado Jardín","🍢 Mercado Dadong","🍜 Fideos Danzai","🥪 Pan Ataúd","🍲 Sopa Carne","🐟 Sopa Milkfish","🦐 Rollo Camarón","🍚 Mi Gao","🍜 Fideos Guanmiao","🍬 Pong Tang"],
      pt:["🏯 Torre Chihkan","🏯 Forte Anping","🏰 Castelo Eterno","🏬 Loja Hayashi","⛩️ Templo Confúcio","🏘️ Rua Shennong","🏠 Casa Árvore","🏛️ Museu Chimei","🍢 Mercado Jardim","🍢 Mercado Dadong","🍜 Macarrão Danzai","🥪 Pão Caixão","🍲 Sopa Carne","🐟 Sopa Milkfish","🦐 Rolinho Camarão","🍚 Mi Gao","🍜 Macarrão Guanmiao","🍬 Pong Tang"]
    },
    高雄:{
      ja:["🌸 蓮池潭","🏯 龍虎塔","🍢 六合夜市","🎨 駁二芸術特区","🌃 愛河","🚢 旗津","🙏 佛光山","🗼 85ビル","🍢 瑞豊夜市","🏛️ 英国領事館","🍢 黒輪","🍡 高雄肉圓","🥣 海鮮粥","🦆 鴨肉飯","🥛 木瓜牛奶","🥛 ピリ辛豆乳","🍖 烤肉飯","🍹 サトウキビジュース"],
      en:["🌸 Lotus Pond","🏯 Dragon Tiger Pagoda","🍢 Liuhe Night Market","🎨 Pier-2 Art Center","🌃 Love River","🚢 Cijin Island","🙏 Fo Guang Shan","🗼 85 Sky Tower","🍢 Ruifeng Night Market","🏛️ British Consulate","🍢 Oden","🍡 Rou Yuan","🥣 Seafood Congee","🦆 Duck Rice","🥛 Papaya Milk","🥛 Spicy Soy","🍖 Grilled Pork Rice","🍹 Sugarcane Juice"],
      zh:["🌸 莲池潭","🏯 龙虎塔","🍢 六合夜市","🎨 驳二艺术特区","🌃 爱河","🚢 旗津","🙏 佛光山","🗼 85大楼","🍢 瑞丰夜市","🏛️ 英国领事馆","🍢 黑轮","🍡 高雄肉圆","🥣 海鲜粥","🦆 鸭肉饭","🥛 木瓜牛奶","🥛 辣豆乳","🍖 烤肉饭","🍹 甘蔗汁"],
      ko:["🌸 롄츠탄","🏯 용호탑","🍢 류허야시장","🎨 보얼예술구","🌃 아이허","🚢 치진섬","🙏 불광산","🗼 85빌딩","🍢 루이펑야시장","🏛️ 영국영사관","🍢 흑륜","🍡 가오슝 러우위안","🥣 해산물죽","🦆 오리덮밥","🥛 파파야 밀크","🥛 매운 두유","🍖 카오로우판","🍹 사탕수수즙"],
      es:["🌸 Estanque Loto","🏯 Pagoda Dragón","🍢 Mercado Liuhe","🎨 Pier-2","🌃 Río Amor","🚢 Isla Cijin","🙏 Fo Guang Shan","🗼 Torre 85","🍢 Mercado Ruifeng","🏛️ Consulado Británico","🍢 Oden","🍡 Rou Yuan","🥣 Sopa Mariscos","🦆 Arroz Pato","🥛 Leche Papaya","🥛 Soya Picante","🍖 Arroz Cerdo","🍹 Caña Azúcar"],
      pt:["🌸 Lago Lótus","🏯 Pagode Dragão","🍢 Mercado Liuhe","🎨 Pier-2","🌃 Rio Amor","🚢 Ilha Cijin","🙏 Fo Guang Shan","🗼 Torre 85","🍢 Mercado Ruifeng","🏛️ Consulado Britânico","🍢 Oden","🍡 Rou Yuan","🥣 Sopa Frutos","🦆 Arroz Pato","🥛 Leite Papaia","🥛 Soja Picante","🍖 Arroz Porco","🍹 Cana Açúcar"]
    },
    花蓮:{
      ja:["🏔️ 太魯閣国立公園","🌊 清水断崖","🏖️ 七星潭","🍢 東大門夜市","🏯 松園別館","⛩️ 慶修院","🌲 白楊歩道","🏞️ 砂卡礑歩道","🏛️ 長春祠","🌉 山月吊橋","🥟 扁食","🍡 麻糬","🍵 徳記薏仁","🐗 原住民料理","🐟 海鮮","🥟 公正包子","🥟 花蓮ワンタン","🍡 阿美麻糬"],
      en:["🏔️ Taroko National Park","🌊 Qingshui Cliff","🏖️ Qixingtan Beach","🍢 Dongdamen Night Market","🏯 Pine Garden","⛩️ Yoshino Shrine","🌲 Baiyang Trail","🏞️ Shakadang Trail","🏛️ Eternal Spring Shrine","🌉 Shanyue Bridge","🥟 Bian Shi","🍡 Mochi","🍵 De Ji Yiren","🐗 Aboriginal Cuisine","🐟 Seafood","🥟 Gongzheng Bao","🥟 Hualien Wonton","🍡 Amei Mochi"],
      zh:["🏔️ 太鲁阁国家公园","🌊 清水断崖","🏖️ 七星潭","🍢 东大门夜市","🏯 松园别馆","⛩️ 庆修院","🌲 白杨步道","🏞️ 砂卡礑步道","🏛️ 长春祠","🌉 山月吊桥","🥟 扁食","🍡 麻糬","🍵 德记薏仁","🐗 原住民料理","🐟 海鲜","🥟 公正包子","🥟 花莲馄饨","🍡 阿美麻糬"],
      ko:["🏔️ 타이루거","🌊 칭수이단애","🏖️ 치싱탄","🍢 둥다먼야시장","🏯 송원별관","⛩️ 요시노 신사","🌲 백양보도","🏞️ 사카당보도","🏛️ 장춘사","🌉 산위에 다리","🥟 비엔스","🍡 모찌","🍵 더지 율무","🐗 원주민요리","🐟 해산물","🥟 공정 빠오즈","🥟 화롄 완탕","🍡 아메이 모찌"],
      es:["🏔️ Parque Taroko","🌊 Acantilado Qingshui","🏖️ Playa Qixingtan","🍢 Mercado Dongdamen","🏯 Jardín Pinos","⛩️ Santuario Yoshino","🌲 Sendero Baiyang","🏞️ Sendero Shakadang","🏛️ Santuario Eterno","🌉 Puente Shanyue","🥟 Bian Shi","🍡 Mochi","🍵 De Ji Yiren","🐗 Cocina Aborigen","🐟 Mariscos","🥟 Gongzheng Bao","🥟 Wonton Hualien","🍡 Amei Mochi"],
      pt:["🏔️ Parque Taroko","🌊 Penhasco Qingshui","🏖️ Praia Qixingtan","🍢 Mercado Dongdamen","🏯 Jardim Pinheiros","⛩️ Santuário Yoshino","🌲 Trilha Baiyang","🏞️ Trilha Shakadang","🏛️ Santuário Eterno","🌉 Ponte Shanyue","🥟 Bian Shi","🍡 Mochi","🍵 De Ji Yiren","🐗 Cozinha Aborígene","🐟 Frutos do Mar","🥟 Gongzheng Bao","🥟 Wonton Hualien","🍡 Amei Mochi"]
    },
    台東:{
      ja:["🌾 池上","🛣️ 伯朗大道","🪨 三仙台","🏝️ 緑島","🏝️ 蘭嶼","♨️ 知本温泉","🌳 台東森林公園","🏛️ 卑南遺址公園","🐄 初鹿牧場","⚓ 富岡漁港","🍱 池上弁当","🌶️ 卑南臭豆腐","🍜 米苔目","🍈 太麻里釈迦","🐟 蘭嶼飛魚","🐗 原住民料理","🥛 初鹿生乳","🎈 台東熱気球"],
      en:["🌾 Chishang","🛣️ Mr. Brown Avenue","🪨 Sanxiantai","🏝️ Green Island","🏝️ Lanyu Island","♨️ Zhiben Hot Spring","🌳 Taitung Forest Park","🏛️ Beinan Cultural Park","🐄 Chulu Ranch","⚓ Fugang Fishing Port","🍱 Chishang Lunch Box","🌶️ Beinan Stinky Tofu","🍜 Mi Tai Mu","🍈 Taimali Sugar Apple","🐟 Lanyu Flying Fish","🐗 Aboriginal Cuisine","🥛 Chulu Milk","🎈 Hot Air Balloon"],
      zh:["🌾 池上","🛣️ 伯朗大道","🪨 三仙台","🏝️ 绿岛","🏝️ 兰屿","♨️ 知本温泉","🌳 台东森林公园","🏛️ 卑南遗址公园","🐄 初鹿牧场","⚓ 富冈渔港","🍱 池上便当","🌶️ 卑南臭豆腐","🍜 米苔目","🍈 太麻里释迦","🐟 兰屿飞鱼","🐗 原住民料理","🥛 初鹿牛奶","🎈 台东热气球"],
      ko:["🌾 츠상","🛣️ 미스터 브라운","🪨 산시엔타이","🏝️ 뤼다오","🏝️ 란위","♨️ 즈번 온천","🌳 타이둥 삼림공원","🏛️ 비난 유적공원","🐄 추루 목장","⚓ 푸강 어항","🍱 츠상 도시락","🌶️ 비난 취두부","🍜 미타이무","🍈 타이마리 석가","🐟 란위 날치","🐗 원주민요리","🥛 추루 우유","🎈 타이둥 열기구"],
      es:["🌾 Chishang","🛣️ Avenida Mr. Brown","🪨 Sanxiantai","🏝️ Isla Verde","🏝️ Lanyu","♨️ Aguas Zhiben","🌳 Parque Taitung","🏛️ Parque Beinan","🐄 Rancho Chulu","⚓ Puerto Fugang","🍱 Bento Chishang","🌶️ Tofu Beinan","🍜 Mi Tai Mu","🍈 Manzana Azúcar","🐟 Pez Volador","🐗 Cocina Aborigen","🥛 Leche Chulu","🎈 Globo Aerostático"],
      pt:["🌾 Chishang","🛣️ Avenida Mr. Brown","🪨 Sanxiantai","🏝️ Ilha Verde","🏝️ Lanyu","♨️ Águas Zhiben","🌳 Parque Taitung","🏛️ Parque Beinan","🐄 Rancho Chulu","⚓ Porto Fugang","🍱 Bento Chishang","🌶️ Tofu Beinan","🍜 Mi Tai Mu","🍈 Maçã Açúcar","🐟 Peixe Voador","🐗 Cozinha Aborígene","🥛 Leite Chulu","🎈 Balão de Ar"]
    },
    嘉義:{
      ja:["🌳 阿里山","🚂 阿里山森林鉄道","🍢 文化路夜市","🏘️ 檜意森活村","🌳 嘉義公園","🌐 北回帰線標公園","🚂 奮起湖老街","🏘️ 達邦部落","⚓ 東石漁人碼頭","⚓ 布袋港","🍗 鶏肉飯","🐟 砂鍋魚頭","🍗 火雞肉飯","🥧 方塊酥","🍱 奮起湖弁当","🍵 阿里山高山茶","🍚 米糕","🦪 東石蚵仔"],
      en:["🌳 Alishan","🚂 Alishan Forest Railway","🍢 Wenhua Road Night Market","🏘️ Hinoki Village","🌳 Chiayi Park","🌐 Tropic of Cancer","🚂 Fenqihu Old Street","🏘️ Dabang Village","⚓ Dongshi Fishing Wharf","⚓ Budai Port","🍗 Turkey Rice","🐟 Sandpot Fish Head","🍗 Chicken Rice","🥧 Square Pastry","🍱 Fenqihu Bento","🍵 Alishan High Mountain Tea","🍚 Mi Gao","🦪 Dongshi Oyster"],
      zh:["🌳 阿里山","🚂 阿里山森林铁路","🍢 文化路夜市","🏘️ 桧意森活村","🌳 嘉义公园","🌐 北回归线标志","🚂 奋起湖老街","🏘️ 达邦部落","⚓ 东石渔人码头","⚓ 布袋港","🍗 鸡肉饭","🐟 砂锅鱼头","🍗 火鸡肉饭","🥧 方块酥","🍱 奋起湖便当","🍵 阿里山高山茶","🍚 米糕","🦪 东石蚵仔"],
      ko:["🌳 알리산","🚂 알리산 삼림철도","🍢 원화로 야시장","🏘️ 히노키 마을","🌳 자이공원","🌐 북회귀선표","🚂 펀치후 노가","🏘️ 다방 부락","⚓ 둥스 어항","⚓ 부다이항","🍗 닭고기 덮밥","🐟 사구어 두부탕","🍗 칠면조 덮밥","🥧 팡콰이수","🍱 펀치후 도시락","🍵 알리산 고산차","🍚 미가오","🦪 둥스 굴"],
      es:["🌳 Alishan","🚂 Tren Alishan","🍢 Mercado Wenhua","🏘️ Aldea Hinoki","🌳 Parque Chiayi","🌐 Trópico Cáncer","🚂 Calle Fenqihu","🏘️ Aldea Dabang","⚓ Muelle Dongshi","⚓ Puerto Budai","🍗 Arroz Pavo","🐟 Cabeza Pescado","🍗 Arroz Pavo","🥧 Pastel Cuadrado","🍱 Bento Fenqihu","🍵 Té Alishan","🍚 Mi Gao","🦪 Ostra Dongshi"],
      pt:["🌳 Alishan","🚂 Trem Alishan","🍢 Mercado Wenhua","🏘️ Aldeia Hinoki","🌳 Parque Chiayi","🌐 Trópico Câncer","🚂 Rua Fenqihu","🏘️ Aldeia Dabang","⚓ Cais Dongshi","⚓ Porto Budai","🍗 Arroz Peru","🐟 Cabeça Peixe","🍗 Arroz Peru","🥧 Bolo Quadrado","🍱 Bento Fenqihu","🍵 Chá Alishan","🍚 Mi Gao","🦪 Ostra Dongshi"]
    },
    墾丁:{
      ja:["🌴 墾丁国家公園","🍢 墾丁大街夜市","🏖️ 白砂湾","🏖️ 南湾","🌳 社頂自然公園","🌊 龍磐公園","🗼 鵝鑾鼻燈塔","🐄 墾丁牧場","🐠 海生館","⚓ 後壁湖漁港","🦐 海鮮","🥗 緑豆蒜","🍢 墾丁夜市B級グルメ","🥥 椰子水","🥚 鴨蛋","🦑 烤魷魚","🍧 フルーツ氷","🍺 墾丁ビアガーデン"],
      en:["🌴 Kenting National Park","🍢 Kenting Night Market","🏖️ Baisha Bay","🏖️ Nanwan Beach","🌳 Sheding Nature Park","🌊 Longpan Park","🗼 Eluanbi Lighthouse","🐄 Kenting Ranch","🐠 National Marine Museum","⚓ Houbihu Port","🦐 Seafood","🥗 Mung Bean Sweet Soup","🍢 Kenting Street Food","🥥 Coconut Water","🥚 Salted Duck Egg","🦑 Grilled Squid","🍧 Fruit Ice","🍺 Kenting Beer Garden"],
      zh:["🌴 垦丁国家公园","🍢 垦丁大街夜市","🏖️ 白砂湾","🏖️ 南湾","🌳 社顶自然公园","🌊 龙磐公园","🗼 鹅銮鼻灯塔","🐄 垦丁牧场","🐠 海生馆","⚓ 后壁湖渔港","🦐 海鲜","🥗 绿豆蒜","🍢 垦丁夜市美食","🥥 椰子水","🥚 咸鸭蛋","🦑 烤鱿鱼","🍧 水果冰","🍺 垦丁啤酒花园"],
      ko:["🌴 컨딩 국립공원","🍢 컨딩 야시장","🏖️ 백사만","🏖️ 남완","🌳 사딩 자연공원","🌊 룽판공원","🗼 어롼비 등대","🐄 컨딩 목장","🐠 국립해양박물관","⚓ 후비후 어항","🦐 해산물","🥗 녹두탕","🍢 컨딩 야시장 음식","🥥 코코넛 워터","🥚 소금오리알","🦑 구운 오징어","🍧 과일빙수","🍺 컨딩 비어가든"],
      es:["🌴 Parque Kenting","🍢 Mercado Kenting","🏖️ Bahía Baisha","🏖️ Playa Nanwan","🌳 Parque Sheding","🌊 Parque Longpan","🗼 Faro Eluanbi","🐄 Rancho Kenting","🐠 Museo Marino","⚓ Puerto Houbihu","🦐 Mariscos","🥗 Sopa Frijol","🍢 Comida Kenting","🥥 Agua Coco","🥚 Huevo Salado","🦑 Calamar Asado","🍧 Hielo Frutas","🍺 Cerveza Kenting"],
      pt:["🌴 Parque Kenting","🍢 Mercado Kenting","🏖️ Baía Baisha","🏖️ Praia Nanwan","🌳 Parque Sheding","🌊 Parque Longpan","🗼 Farol Eluanbi","🐄 Rancho Kenting","🐠 Museu Marinho","⚓ Porto Houbihu","🦐 Frutos do Mar","🥗 Sopa Feijão","🍢 Comida Kenting","🥥 Água Coco","🥚 Ovo Salgado","🦑 Lula Grelhada","🍧 Gelo Frutas","🍺 Cerveja Kenting"]
    },
    バンコク:{
      ja:["🏯 王宮(グランドパレス)","🛕 ワットポー","🛕 ワットアルン","🛕 ワットパクナム","🌃 カオサンロード","🛍️ チャトゥチャック","🛍️ アジアティーク","🐘 エラワンミュージアム","🌳 ルンピニ公園","💎 エメラルド寺院","🍜 パッタイ","🍲 トムヤムクン","🍚 ガパオライス","🥭 マンゴースティッキー","🥗 ソムタム","🍗 カオマンガイ","🍲 トムカーガイ","🍛 マッサマンカレー"],
      en:["🏯 Grand Palace","🛕 Wat Pho","🛕 Wat Arun","🛕 Wat Paknam","🌃 Khao San Road","🛍️ Chatuchak Market","🛍️ Asiatique","🐘 Erawan Museum","🌳 Lumphini Park","💎 Wat Phra Kaew","🍜 Pad Thai","🍲 Tom Yum Kung","🍚 Pad Krapao","🥭 Mango Sticky Rice","🥗 Som Tum","🍗 Khao Man Gai","🍲 Tom Kha Gai","🍛 Massaman Curry"],
      zh:["🏯 大皇宫","🛕 卧佛寺","🛕 黎明寺","🛕 帕南寺","🌃 考山路","🛍️ 札都甲市场","🛍️ 河滨夜市","🐘 三头神象博物馆","🌳 伦披尼公园","💎 玉佛寺","🍜 泰式炒河粉","🍲 冬阴功","🍚 打抛饭","🥭 芒果糯米饭","🥗 木瓜沙拉","🍗 海南鸡饭","🍲 椰汁鸡汤","🍛 玛莎曼咖喱"],
      ko:["🏯 왕궁","🛕 왓포","🛕 왓아룬","🛕 왓파크남","🌃 카오산로드","🛍️ 짜뚜짝","🛍️ 아시아티크","🐘 에라완 박물관","🌳 룸피니공원","💎 에메랄드 사원","🍜 팟타이","🍲 똠얌꿍","🍚 팟까파오","🥭 망고찰밥","🥗 솜땀","🍗 카오만가이","🍲 똠카가이","🍛 마사만 카레"],
      es:["🏯 Gran Palacio","🛕 Wat Pho","🛕 Wat Arun","🛕 Wat Paknam","🌃 Khao San","🛍️ Chatuchak","🛍️ Asiatique","🐘 Museo Erawan","🌳 Parque Lumphini","💎 Wat Phra Kaew","🍜 Pad Thai","🍲 Tom Yum","🍚 Pad Krapao","🥭 Arroz Mango","🥗 Som Tum","🍗 Khao Man Gai","🍲 Tom Kha Gai","🍛 Curry Massaman"],
      pt:["🏯 Grande Palácio","🛕 Wat Pho","🛕 Wat Arun","🛕 Wat Paknam","🌃 Khao San","🛍️ Chatuchak","🛍️ Asiatique","🐘 Museu Erawan","🌳 Parque Lumphini","💎 Wat Phra Kaew","🍜 Pad Thai","🍲 Tom Yum","🍚 Pad Krapao","🥭 Arroz Manga","🥗 Som Tum","🍗 Khao Man Gai","🍲 Tom Kha Gai","🍛 Curry Massaman"]
    },
    チェンマイ:{
      ja:["🛕 ドイステープ寺院","🛕 ワットチェディルアン","🏛️ ターペー門","🛍️ ナイトバザール","🛍️ サンデーマーケット","🏔️ ドイインタノン","🐅 タイガーキングダム","🛕 ワットウモーン","🐘 メーサー象キャンプ","☂️ ボーサン傘の村","🍜 カオソーイ","🌭 サイウア","🌶️ ナムプリックノム","🍱 カントーク料理","🍳 北部料理","🥤 マンゴージュース","🎆 コムローイ祭","🍦 ココナッツアイス"],
      en:["🛕 Doi Suthep","🛕 Wat Chedi Luang","🏛️ Tha Phae Gate","🛍️ Night Bazaar","🛍️ Sunday Market","🏔️ Doi Inthanon","🐅 Tiger Kingdom","🛕 Wat Umong","🐘 Elephant Camp","☂️ Bo Sang Village","🍜 Khao Soi","🌭 Sai Ua","🌶️ Nam Prik Noom","🍱 Khantoke","🍳 Northern Cuisine","🥤 Mango Juice","🎆 Yi Peng Festival","🍦 Coconut Ice Cream"],
      zh:["🛕 双龙寺","🛕 柴迪龙寺","🏛️ 塔佩门","🛍️ 夜市","🛍️ 周日市场","🏔️ 因他暖山","🐅 老虎王国","🛕 伍蒙寺","🐘 大象营","☂️ 博桑伞村","🍜 咖喱面","🌭 泰式香肠","🌶️ 青辣椒酱","🍱 康托餐","🍳 北部料理","🥤 芒果汁","🎆 水灯节","🍦 椰子冰淇淋"],
      ko:["🛕 도이수텝","🛕 왓체디루앙","🏛️ 타패문","🛍️ 나이트바자르","🛍️ 일요시장","🏔️ 도이인타논","🐅 타이거 킹덤","🛕 왓우몽","🐘 코끼리캠프","☂️ 보상우산마을","🍜 카오소이","🌭 사이우아","🌶️ 남프릭눔","🍱 칸톡요리","🍳 북부요리","🥤 망고주스","🎆 콤로이 축제","🍦 코코넛 아이스크림"],
      es:["🛕 Doi Suthep","🛕 Wat Chedi Luang","🏛️ Tha Phae","🛍️ Night Bazaar","🛍️ Mercado Domingo","🏔️ Doi Inthanon","🐅 Reino Tigre","🛕 Wat Umong","🐘 Campo Elefantes","☂️ Bo Sang","🍜 Khao Soi","🌭 Sai Ua","🌶️ Nam Prik Noom","🍱 Khantoke","🍳 Cocina Norte","🥤 Jugo Mango","🎆 Yi Peng","🍦 Helado Coco"],
      pt:["🛕 Doi Suthep","🛕 Wat Chedi Luang","🏛️ Tha Phae","🛍️ Night Bazaar","🛍️ Mercado Domingo","🏔️ Doi Inthanon","🐅 Reino Tigre","🛕 Wat Umong","🐘 Campo Elefantes","☂️ Bo Sang","🍜 Khao Soi","🌭 Sai Ua","🌶️ Nam Prik Noom","🍱 Khantoke","🍳 Cozinha Norte","🥤 Suco Manga","🎆 Yi Peng","🍦 Sorvete Coco"]
    },
    プーケット:{
      ja:["🏝️ ピピ島ツアー","🏖️ カロンビーチ","🏖️ パトンビーチ","🏖️ カタビーチ","🌅 プロムテープ岬","🏛️ ビッグブッダ","🛕 ワットチャロン","🏘️ オールドタウン","🌃 バングラ通り","🏝️ ジェームズボンド島","🦞 シーフード","🥖 ロティ","🍜 ホッケンミー","🍲 トムカーガイ","🌶️ ナムプリック","🍧 ファラン氷","🍢 サテー","🏝️ ナイハーン"],
      en:["🏝️ Phi Phi Islands","🏖️ Karon Beach","🏖️ Patong Beach","🏖️ Kata Beach","🌅 Promthep Cape","🏛️ Big Buddha","🛕 Wat Chalong","🏘️ Old Town","🌃 Bangla Road","🏝️ James Bond Island","🦞 Seafood","🥖 Roti","🍜 Hokkien Mee","🍲 Tom Kha Gai","🌶️ Nam Prik","🍧 Shaved Ice","🍢 Satay","🏝️ Nai Harn"],
      zh:["🏝️ 皮皮岛","🏖️ 卡伦海滩","🏖️ 巴东海滩","🏖️ 卡塔海滩","🌅 神仙半岛","🏛️ 大佛","🛕 查龙寺","🏘️ 老城区","🌃 邦拉路","🏝️ 詹姆斯邦德岛","🦞 海鲜","🥖 罗蒂","🍜 福建面","🍲 椰汁鸡","🌶️ 南姆普里","🍧 刨冰","🍢 沙嗲","🏝️ 奈汉"],
      ko:["🏝️ 피피섬","🏖️ 카론비치","🏖️ 파통비치","🏖️ 카타비치","🌅 프롬텝곶","🏛️ 빅부다","🛕 왓차롱","🏘️ 올드타운","🌃 방라로드","🏝️ 제임스본드섬","🦞 해산물","🥖 로티","🍜 호키엔면","🍲 똠카가이","🌶️ 남프릭","🍧 빙수","🍢 사테","🏝️ 나이한"],
      es:["🏝️ Islas Phi Phi","🏖️ Karon","🏖️ Patong","🏖️ Kata","🌅 Cabo Promthep","🏛️ Gran Buda","🛕 Wat Chalong","🏘️ Casco Antiguo","🌃 Bangla","🏝️ Isla James Bond","🦞 Mariscos","🥖 Roti","🍜 Hokkien Mee","🍲 Tom Kha","🌶️ Nam Prik","🍧 Hielo","🍢 Satay","🏝️ Nai Harn"],
      pt:["🏝️ Phi Phi","🏖️ Karon","🏖️ Patong","🏖️ Kata","🌅 Cabo Promthep","🏛️ Grande Buda","🛕 Wat Chalong","🏘️ Cidade Antiga","🌃 Bangla","🏝️ Ilha James Bond","🦞 Frutos do Mar","🥖 Roti","🍜 Hokkien Mee","🍲 Tom Kha","🌶️ Nam Prik","🍧 Gelo","🍢 Satay","🏝️ Nai Harn"]
    },
    パタヤ:{
      ja:["🏛️ サンクチュアリオブトゥルース","🌺 ノンヌーチビレッジ","🏖️ パタヤビーチ","🏖️ ジョムティエン","🛍️ フローティングマーケット","🗼 7大不思議の塔","🎭 アルカザールショー","🎭 ティファニーショー","🌃 ウォーキングストリート","🏝️ ラン島","🦞 シーフード","🍲 海鮮鍋","🥭 トロピカルフルーツ","🍦 ココナッツアイス","🍢 屋台料理","🔥 ビーチBBQ","🍢 サテー","🍹 サムイティー"],
      en:["🏛️ Sanctuary of Truth","🌺 Nong Nooch Village","🏖️ Pattaya Beach","🏖️ Jomtien Beach","🛍️ Floating Market","🗼 7 Wonders Tower","🎭 Alcazar Show","🎭 Tiffany Show","🌃 Walking Street","🏝️ Koh Larn","🦞 Seafood","🍲 Seafood Hotpot","🥭 Tropical Fruits","🍦 Coconut Ice Cream","🍢 Street Food","🔥 Beach BBQ","🍢 Satay","🍹 Samui Tea"],
      zh:["🏛️ 真理寺","🌺 农努奇花园","🏖️ 芭提雅海滩","🏖️ 中天海滩","🛍️ 水上市场","🗼 七大奇迹塔","🎭 阿尔卡萨秀","🎭 蒂芙尼秀","🌃 步行街","🏝️ 兰岛","🦞 海鲜","🍲 海鲜锅","🥭 热带水果","🍦 椰子冰淇淋","🍢 街头美食","🔥 海滩BBQ","🍢 沙嗲","🍹 苏梅茶"],
      ko:["🏛️ 진리의 성전","🌺 농눗빌리지","🏖️ 파타야비치","🏖️ 좀티엔비치","🛍️ 수상시장","🗼 7대불가사의탑","🎭 알카자쇼","🎭 티파니쇼","🌃 워킹스트리트","🏝️ 코란섬","🦞 해산물","🍲 해물탕","🥭 열대과일","🍦 코코넛아이스","🍢 길거리음식","🔥 비치BBQ","🍢 사테","🍹 사무이티"],
      es:["🏛️ Santuario Verdad","🌺 Nong Nooch","🏖️ Pattaya","🏖️ Jomtien","🛍️ Mercado Flotante","🗼 Torre 7 Maravillas","🎭 Alcazar","🎭 Tiffany","🌃 Walking Street","🏝️ Koh Larn","🦞 Mariscos","🍲 Sopa Mariscos","🥭 Frutas Tropicales","🍦 Helado Coco","🍢 Comida Calle","🔥 BBQ Playa","🍢 Satay","🍹 Té Samui"],
      pt:["🏛️ Santuário Verdade","🌺 Nong Nooch","🏖️ Pattaya","🏖️ Jomtien","🛍️ Mercado Flutuante","🗼 Torre 7 Maravilhas","🎭 Alcazar","🎭 Tiffany","🌃 Walking Street","🏝️ Koh Larn","🦞 Frutos do Mar","🍲 Sopa Frutos","🥭 Frutas Tropicais","🍦 Sorvete Coco","🍢 Comida Rua","🔥 BBQ Praia","🍢 Satay","🍹 Chá Samui"]
    },
    クラビ:{
      ja:["🏖️ ライレイビーチ","💚 エメラルドプール","♨️ ホットスプリング","🛕 ティガーケーブ","🏖️ アオナンビーチ","🏝️ ホン島ツアー","🏝️ 4島ツアー","🌃 クラビナイトマーケット","🏔️ カルスト諸島","🌿 マングローブツアー","🦞 シーフード","🍝 カノムジーンナムヤー","🥚 ホイトート","🍢 サテーカイ","🍛 南部料理","🥤 フルーツシェイク","🥖 ロティ","🌳 ジャングルジュース"],
      en:["🏖️ Railay Beach","💚 Emerald Pool","♨️ Hot Springs","🛕 Tiger Cave Temple","🏖️ Ao Nang Beach","🏝️ Hong Islands","🏝️ 4 Islands Tour","🌃 Krabi Night Market","🏔️ Karst Islands","🌿 Mangrove Tour","🦞 Seafood","🍝 Kanom Jeen","🥚 Hoi Tod","🍢 Sate Kai","🍛 Southern Cuisine","🥤 Fruit Shake","🥖 Roti","🌳 Jungle Juice"],
      zh:["🏖️ 莱莉海滩","💚 翡翠池","♨️ 温泉","🛕 老虎洞寺","🏖️ 奥南海滩","🏝️ 翁岛","🏝️ 四岛游","🌃 甲米夜市","🏔️ 喀斯特群岛","🌿 红树林游","🦞 海鲜","🍝 椰汁面","🥚 蚝煎","🍢 沙嗲鸡","🍛 南部料理","🥤 水果奶昔","🥖 罗蒂","🌳 丛林果汁"],
      ko:["🏖️ 라이레이","💚 에메랄드풀","♨️ 온천","🛕 호랑이굴사원","🏖️ 아오낭","🏝️ 홍섬","🏝️ 4섬투어","🌃 끄라비야시장","🏔️ 카르스트섬","🌿 맹그로브투어","🦞 해산물","🍝 카놈진","🥚 호이톳","🍢 사테까이","🍛 남부요리","🥤 과일쉐이크","🥖 로티","🌳 정글주스"],
      es:["🏖️ Railay","💚 Piscina Esmeralda","♨️ Aguas Termales","🛕 Cueva Tigre","🏖️ Ao Nang","🏝️ Islas Hong","🏝️ Tour 4 Islas","🌃 Mercado Nocturno","🏔️ Islas Kársticas","🌿 Manglares","🦞 Mariscos","🍝 Kanom Jeen","🥚 Hoi Tod","🍢 Sate Kai","🍛 Cocina Sur","🥤 Batido Frutas","🥖 Roti","🌳 Jugo Jungla"],
      pt:["🏖️ Railay","💚 Piscina Esmeralda","♨️ Águas Termais","🛕 Caverna Tigre","🏖️ Ao Nang","🏝️ Ilhas Hong","🏝️ Tour 4 Ilhas","🌃 Mercado Noturno","🏔️ Ilhas Cársticas","🌿 Manguezais","🦞 Frutos do Mar","🍝 Kanom Jeen","🥚 Hoi Tod","🍢 Sate Kai","🍛 Cozinha Sul","🥤 Smoothie Frutas","🥖 Roti","🌳 Suco Selva"]
    },
    アユタヤ:{
      ja:["🛕 ワットマハタート","🛕 ワットプラシーサンペット","🛕 ワットチャイワッタナラム","🛕 ワットヤイチャイモンコン","🛕 ワットロカヤスタ","🏯 バーンパイン宮殿","🐘 象乗り体験","🌃 ナイトマーケット","🛍️ 水上マーケット","🚂 アユタヤ鉄道","🍜 ボートヌードル","🍬 ロティサイマイ","🦐 川エビ料理","🍗 カオマンガイ","🍗 グリルチキン","🍦 ココナッツアイス","🍡 伝統菓子","🍢 屋台料理"],
      en:["🛕 Wat Mahathat","🛕 Wat Phra Si Sanphet","🛕 Wat Chaiwatthanaram","🛕 Wat Yai Chai Mongkhon","🛕 Wat Lokayasutha","🏯 Bang Pa-In Palace","🐘 Elephant Ride","🌃 Night Market","🛍️ Floating Market","🚂 Ayutthaya Railway","🍜 Boat Noodles","🍬 Roti Sai Mai","🦐 River Prawn","🍗 Khao Man Gai","🍗 Grilled Chicken","🍦 Coconut Ice Cream","🍡 Traditional Sweets","🍢 Street Food"],
      zh:["🛕 玛哈泰寺","🛕 帕西桑碧寺","🛕 柴瓦塔那兰寺","🛕 大柴蒙空寺","🛕 罗卡雅苏塔寺","🏯 邦芭茵夏宫","🐘 骑大象","🌃 夜市","🛍️ 水上市场","🚂 大城铁路","🍜 船面","🍬 罗蒂赛迈","🦐 河虾","🍗 海南鸡饭","🍗 烤鸡","🍦 椰子冰淇淋","🍡 传统甜点","🍢 街头美食"],
      ko:["🛕 왓마하탓","🛕 왓프라시산펫","🛕 왓차이와타나람","🛕 왓야이차이몽콘","🛕 왓로카야수타","🏯 방파인 궁전","🐘 코끼리타기","🌃 야시장","🛍️ 수상시장","🚂 아유타야 철도","🍜 보트면","🍬 로티사이마이","🦐 강새우요리","🍗 카오만가이","🍗 그릴치킨","🍦 코코넛아이스","🍡 전통과자","🍢 길거리음식"],
      es:["🛕 Wat Mahathat","🛕 Wat Phra Si Sanphet","🛕 Wat Chaiwatthanaram","🛕 Wat Yai Chai Mongkhon","🛕 Wat Lokayasutha","🏯 Bang Pa-In","🐘 Paseo Elefante","🌃 Mercado Nocturno","🛍️ Mercado Flotante","🚂 Tren Ayutthaya","🍜 Fideos Barco","🍬 Roti Sai Mai","🦐 Camarón Río","🍗 Khao Man Gai","🍗 Pollo Asado","🍦 Helado Coco","🍡 Dulces Tradicionales","🍢 Comida Calle"],
      pt:["🛕 Wat Mahathat","🛕 Wat Phra Si Sanphet","🛕 Wat Chaiwatthanaram","🛕 Wat Yai Chai Mongkhon","🛕 Wat Lokayasutha","🏯 Bang Pa-In","🐘 Passeio Elefante","🌃 Mercado Noturno","🛍️ Mercado Flutuante","🚂 Trem Ayutthaya","🍜 Macarrão Barco","🍬 Roti Sai Mai","🦐 Camarão Rio","🍗 Khao Man Gai","🍗 Frango Grelhado","🍦 Sorvete Coco","🍡 Doces Tradicionais","🍢 Comida Rua"]
    },
    サムイ島:{
      ja:["🏖️ チャウエンビーチ","🏖️ ラマイビーチ","🪨 ヒンタヒンヤイ","🏛️ ビッグブッダ寺院","💧 ナムアン滝","🏘️ フィッシャーマンズ","🏖️ ボパイビーチ","🏝️ アンソン海洋公園","🚢 パンガン島フェリー","♨️ スパ温泉","🦞 シーフード","🌴 ヤシ油料理","🍲 トムヤムクン","🦞 ロブスター","🍦 ココナッツアイス","🥖 ロティ","🔥 海鮮BBQ","🥭 フルーツバスケット"],
      en:["🏖️ Chaweng Beach","🏖️ Lamai Beach","🪨 Hin Ta Hin Yai","🏛️ Big Buddha","💧 Na Muang Waterfall","🏘️ Fisherman's Village","🏖️ Bophut Beach","🏝️ Ang Thong Park","🚢 Pha Ngan Ferry","♨️ Spa & Massage","🦞 Seafood","🌴 Coconut Oil Cuisine","🍲 Tom Yum Kung","🦞 Lobster","🍦 Coconut Ice Cream","🥖 Roti","🔥 Seafood BBQ","🥭 Fruit Basket"],
      zh:["🏖️ 查汶海滩","🏖️ 拉迈海滩","🪨 阴阳岛","🏛️ 大佛寺","💧 那曼瀑布","🏘️ 渔夫村","🏖️ 波普特","🏝️ 安通公园","🚢 帕岸岛轮渡","♨️ 水疗","🦞 海鲜","🌴 椰子油料理","🍲 冬阴功","🦞 龙虾","🍦 椰子冰淇淋","🥖 罗蒂","🔥 海鲜BBQ","🥭 水果篮"],
      ko:["🏖️ 차웽비치","🏖️ 라마이비치","🪨 힌타힌야이","🏛️ 빅부다","💧 나무앙폭포","🏘️ 어부마을","🏖️ 보풋비치","🏝️ 앙통해양공원","🚢 팡안섬페리","♨️ 스파","🦞 해산물","🌴 코코넛오일요리","🍲 똠얌꿍","🦞 랍스터","🍦 코코넛아이스","🥖 로티","🔥 해산물BBQ","🥭 과일바구니"],
      es:["🏖️ Chaweng","🏖️ Lamai","🪨 Hin Ta Hin Yai","🏛️ Gran Buda","💧 Cataratas Na Muang","🏘️ Aldea Pescador","🏖️ Bophut","🏝️ Ang Thong","🚢 Ferry Pha Ngan","♨️ Spa","🦞 Mariscos","🌴 Cocina Aceite Coco","🍲 Tom Yum","🦞 Langosta","🍦 Helado Coco","🥖 Roti","🔥 BBQ Mariscos","🥭 Frutas"],
      pt:["🏖️ Chaweng","🏖️ Lamai","🪨 Hin Ta Hin Yai","🏛️ Grande Buda","💧 Cataratas Na Muang","🏘️ Vila Pescador","🏖️ Bophut","🏝️ Ang Thong","🚢 Ferry Pha Ngan","♨️ Spa","🦞 Frutos do Mar","🌴 Cozinha Óleo Coco","🍲 Tom Yum","🦞 Lagosta","🍦 Sorvete Coco","🥖 Roti","🔥 BBQ Frutos","🥭 Frutas"]
    },
    チェンライ:{
      ja:["🤍 ワットロンクン(白寺)","💙 ワットロンスアテン(青寺)","🖤 バーンダム(黒寺)","🌟 ゴールデントライアングル","🌄 メーサイ","🏔️ ドイメーサロン","🏘️ 山岳民族の村","🕰️ 時計塔","🛍️ ナイトバザール","🌳 ドイトンプロジェクト","🍜 カオソーイ","🍲 ナムニアオ","🍝 カノムジン","🍛 シャンミャンマー料理","🍒 ライチ","☕ ドイチャンコーヒー","🌶️ メーカームポン","🍵 お茶"],
      en:["🤍 Wat Rong Khun (White)","💙 Wat Rong Suea Ten (Blue)","🖤 Baan Dam (Black House)","🌟 Golden Triangle","🌄 Mae Sai","🏔️ Doi Mae Salong","🏘️ Hill Tribe Villages","🕰️ Clock Tower","🛍️ Night Bazaar","🌳 Doi Tung Project","🍜 Khao Soi","🍲 Nam Ngiao","🍝 Khanom Jeen","🍛 Shan Cuisine","🍒 Lychee","☕ Doi Chang Coffee","🌶️ Mae Kampong","🍵 Tea"],
      zh:["🤍 白庙","💙 蓝庙","🖤 黑庙","🌟 金三角","🌄 美塞","🏔️ 美斯乐","🏘️ 山地民族村","🕰️ 钟楼","🛍️ 夜市","🌳 多通项目","🍜 咖喱面","🍲 南尼奥","🍝 椰汁面","🍛 掸族料理","🍒 荔枝","☕ 多昌咖啡","🌶️ 美甘蓬","🍵 茶"],
      ko:["🤍 왓롱쿤(백사원)","💙 왓롱수아텐(청사원)","🖤 반담(흑사원)","🌟 골든트라이앵글","🌄 매사이","🏔️ 도이매살롱","🏘️ 산악민족마을","🕰️ 시계탑","🛍️ 나이트바자르","🌳 도이뚱프로젝트","🍜 카오소이","🍲 남니아오","🍝 카놈진","🍛 샨요리","🍒 리치","☕ 도이창커피","🌶️ 매캄퐁","🍵 차"],
      es:["🤍 Templo Blanco","💙 Templo Azul","🖤 Casa Negra","🌟 Triángulo Dorado","🌄 Mae Sai","🏔️ Doi Mae Salong","🏘️ Aldeas Tribus","🕰️ Torre Reloj","🛍️ Bazar Nocturno","🌳 Doi Tung","🍜 Khao Soi","🍲 Nam Ngiao","🍝 Khanom Jeen","🍛 Cocina Shan","🍒 Lichi","☕ Café Doi Chang","🌶️ Mae Kampong","🍵 Té"],
      pt:["🤍 Templo Branco","💙 Templo Azul","🖤 Casa Negra","🌟 Triângulo Dourado","🌄 Mae Sai","🏔️ Doi Mae Salong","🏘️ Aldeias Tribais","🕰️ Torre Relógio","🛍️ Bazar Noturno","🌳 Doi Tung","🍜 Khao Soi","🍲 Nam Ngiao","🍝 Khanom Jeen","🍛 Cozinha Shan","🍒 Lichia","☕ Café Doi Chang","🌶️ Mae Kampong","🍵 Chá"]
    },
    ハノイ:{
      ja:["🏛️ ホアンキエム湖","🏯 ホーチミン廟","🛕 文廟","🏰 タンロン遺跡","🏘️ 旧市街36通り","🎭 タンロン水上人形劇","🛕 一柱寺","⛪ ハノイ大教会","🚂 ハノイ駅","🛍️ ドンスアン市場","🍜 フォー","🥖 バインミー","🌯 生春巻き","☕ ベトナムコーヒー","🍳 エッグコーヒー","🍢 ブンチャー","🥗 ブンボーフエ","🍡 チェー"],
      en:["🏛️ Hoan Kiem Lake","🏯 Ho Chi Minh Mausoleum","🛕 Temple of Literature","🏰 Imperial Citadel","🏘️ Old Quarter","🎭 Water Puppet Show","🛕 One Pillar Pagoda","⛪ St. Joseph Cathedral","🚂 Hanoi Station","🛍️ Dong Xuan Market","🍜 Pho","🥖 Banh Mi","🌯 Spring Rolls","☕ Vietnamese Coffee","🍳 Egg Coffee","🍢 Bun Cha","🥗 Bun Bo Hue","🍡 Che"],
      zh:["🏛️ 还剑湖","🏯 胡志明陵","🛕 文庙","🏰 升龙皇城","🏘️ 36古街","🎭 水上木偶剧","🛕 独柱寺","⛪ 河内大教堂","🚂 河内车站","🛍️ 同春市场","🍜 河粉","🥖 越南三明治","🌯 春卷","☕ 越南咖啡","🍳 蛋咖啡","🍢 烤肉米线","🥗 顺化牛肉粉","🍡 越南糖水"],
      ko:["🏛️ 호안끼엠 호수","🏯 호치민 묘소","🛕 문묘","🏰 탕롱 황성","🏘️ 36거리","🎭 수상인형극","🛕 일주사","⛪ 하노이 대성당","🚂 하노이역","🛍️ 동쑤언 시장","🍜 쌀국수","🥖 반미","🌯 월남쌈","☕ 베트남 커피","🍳 에그커피","🍢 분짜","🥗 분보후에","🍡 째"],
      es:["🏛️ Lago Hoan Kiem","🏯 Mausoleo Ho Chi Minh","🛕 Templo Literatura","🏰 Ciudadela Imperial","🏘️ Casco Antiguo","🎭 Marionetas Acuáticas","🛕 Pagoda 1 Pilar","⛪ Catedral","🚂 Estación Hanoi","🛍️ Mercado Dong Xuan","🍜 Pho","🥖 Banh Mi","🌯 Rollitos","☕ Café Vietnamita","🍳 Café Huevo","🍢 Bun Cha","🥗 Bun Bo Hue","🍡 Che"],
      pt:["🏛️ Lago Hoan Kiem","🏯 Mausoléu Ho Chi Minh","🛕 Templo Literatura","🏰 Cidadela Imperial","🏘️ Bairro Antigo","🎭 Marionetes Aquáticos","🛕 Pagode 1 Pilar","⛪ Catedral","🚂 Estação Hanoi","🛍️ Mercado Dong Xuan","🍜 Pho","🥖 Banh Mi","🌯 Rolinhos","☕ Café Vietnamita","🍳 Café Ovo","🍢 Bun Cha","🥗 Bun Bo Hue","🍡 Che"]
    },
    ホーチミン:{
      ja:["🏛️ 統一会堂","🏛️ 戦争証跡博物館","⛪ サイゴン大聖堂","📬 中央郵便局","🛍️ ベンタイン市場","🛕 ジェード・エンペラー廟","🏘️ ドンコイ通り","🌃 ブイビエン通り","🚇 クチトンネル","🌊 メコン川クルーズ","🍜 フォー","🥖 バインミー","🥘 コムタム","🍲 フーティウ","🍜 ブンボーフエ","🦐 シーフード","☕ ベトナムコーヒー","🌶️ チェー"],
      en:["🏛️ Independence Palace","🏛️ War Remnants Museum","⛪ Notre Dame Saigon","📬 Central Post Office","🛍️ Ben Thanh Market","🛕 Jade Emperor Pagoda","🏘️ Dong Khoi Street","🌃 Bui Vien Street","🚇 Cu Chi Tunnels","🌊 Mekong Cruise","🍜 Pho","🥖 Banh Mi","🥘 Com Tam","🍲 Hu Tieu","🍜 Bun Bo Hue","🦐 Seafood","☕ Vietnamese Coffee","🌶️ Che"],
      zh:["🏛️ 统一宫","🏛️ 战争遗迹博物馆","⛪ 西贡圣母大教堂","📬 中央邮局","🛍️ 滨城市场","🛕 玉皇庙","🏘️ 同起街","🌃 范五老街","🚇 古芝地道","🌊 湄公河游","🍜 河粉","🥖 越南三明治","🥘 碎米饭","🍲 河粉汤","🍜 顺化牛肉粉","🦐 海鲜","☕ 越南咖啡","🌶️ 越南糖水"],
      ko:["🏛️ 통일궁","🏛️ 전쟁박물관","⛪ 사이공 대성당","📬 중앙우체국","🛍️ 벤탄시장","🛕 옥황상제묘","🏘️ 동코이거리","🌃 부이비엔거리","🚇 구찌터널","🌊 메콩강 크루즈","🍜 쌀국수","🥖 반미","🥘 껌떰","🍲 후띠우","🍜 분보후에","🦐 해산물","☕ 베트남 커피","🌶️ 째"],
      es:["🏛️ Palacio Independencia","🏛️ Museo Guerra","⛪ Notre Dame","📬 Oficina Postal","🛍️ Mercado Ben Thanh","🛕 Pagoda Jade","🏘️ Calle Dong Khoi","🌃 Bui Vien","🚇 Túneles Cu Chi","🌊 Mekong","🍜 Pho","🥖 Banh Mi","🥘 Com Tam","🍲 Hu Tieu","🍜 Bun Bo Hue","🦐 Mariscos","☕ Café","🌶️ Che"],
      pt:["🏛️ Palácio Independência","🏛️ Museu Guerra","⛪ Notre Dame","📬 Correios","🛍️ Mercado Ben Thanh","🛕 Pagode Jade","🏘️ Rua Dong Khoi","🌃 Bui Vien","🚇 Túneis Cu Chi","🌊 Mekong","🍜 Pho","🥖 Banh Mi","🥘 Com Tam","🍲 Hu Tieu","🍜 Bun Bo Hue","🦐 Frutos do Mar","☕ Café","🌶️ Che"]
    },
    ダナン:{
      ja:["🌉 ゴールデンブリッジ(神の手)","🎢 バーナーヒルズ","🏖️ ミーケービーチ","⛰️ 五行山","🐉 ドラゴンブリッジ","⛪ ダナン大聖堂(ピンク教会)","🛍️ ハン市場","🌊 ハン川","🏛️ チャム彫刻博物館","🌃 ダナン夜市","🍜 ミークアン","🥩 バインセオ","🦞 シーフード","🍤 ネムルイ","🌯 バインチャン","🍢 屋台料理","🥤 ココナッツコーヒー","🍡 チェー"],
      en:["🌉 Golden Bridge","🎢 Ba Na Hills","🏖️ My Khe Beach","⛰️ Marble Mountains","🐉 Dragon Bridge","⛪ Pink Cathedral","🛍️ Han Market","🌊 Han River","🏛️ Cham Museum","🌃 Da Nang Night Market","🍜 Mi Quang","🥩 Banh Xeo","🦞 Seafood","🍤 Nem Lui","🌯 Banh Trang","🍢 Street Food","🥤 Coconut Coffee","🍡 Che"],
      zh:["🌉 金桥","🎢 巴拿山","🏖️ 美溪海滩","⛰️ 五行山","🐉 龙桥","⛪ 粉红教堂","🛍️ 韩市场","🌊 韩江","🏛️ 占婆雕刻博物馆","🌃 岘港夜市","🍜 广面","🥩 越南煎饼","🦞 海鲜","🍤 蜗牛串烧","🌯 米饼卷","🍢 街头美食","🥤 椰子咖啡","🍡 越南糖水"],
      ko:["🌉 골든브릿지(신의 손)","🎢 바나힐","🏖️ 미케비치","⛰️ 오행산","🐉 드래곤브릿지","⛪ 핑크성당","🛍️ 한시장","🌊 한강","🏛️ 참박물관","🌃 다낭야시장","🍜 미꽝","🥩 반세오","🦞 해산물","🍤 넴루이","🌯 반짱","🍢 길거리음식","🥤 코코넛커피","🍡 째"],
      es:["🌉 Puente Dorado","🎢 Ba Na Hills","🏖️ Playa My Khe","⛰️ Montañas Mármol","🐉 Puente Dragón","⛪ Catedral Rosa","🛍️ Mercado Han","🌊 Río Han","🏛️ Museo Cham","🌃 Mercado Nocturno","🍜 Mi Quang","🥩 Banh Xeo","🦞 Mariscos","🍤 Nem Lui","🌯 Banh Trang","🍢 Comida Calle","🥤 Café Coco","🍡 Che"],
      pt:["🌉 Ponte Dourada","🎢 Ba Na Hills","🏖️ Praia My Khe","⛰️ Montanhas Mármore","🐉 Ponte Dragão","⛪ Catedral Rosa","🛍️ Mercado Han","🌊 Rio Han","🏛️ Museu Cham","🌃 Mercado Noturno","🍜 Mi Quang","🥩 Banh Xeo","🦞 Frutos do Mar","🍤 Nem Lui","🌯 Banh Trang","🍢 Comida Rua","🥤 Café Coco","🍡 Che"]
    },
    ホイアン:{
      ja:["🏘️ 旧市街","🌉 来遠橋(日本橋)","🏮 ランタンフェスティバル","🌊 トゥボン川","🏝️ チャム島","🛍️ ナイトマーケット","🏖️ アンバンビーチ","🏯 福建会館","🏯 廣肇会館","🌾 ココナッツビレッジ","🍜 カオラウ","🥟 ホワイトローズ","🥢 揚げワンタン","🍝 ミークアン","🥖 バインミー(フォン)","🐟 ホイアンチキンライス","🍡 チェー","🥖 バインバオ"],
      en:["🏘️ Old Town","🌉 Japanese Bridge","🏮 Lantern Festival","🌊 Thu Bon River","🏝️ Cham Islands","🛍️ Night Market","🏖️ An Bang Beach","🏯 Fujian Hall","🏯 Cantonese Hall","🌾 Coconut Village","🍜 Cao Lau","🥟 White Rose","🥢 Fried Wonton","🍝 Mi Quang","🥖 Banh Mi Phuong","🐟 Chicken Rice","🍡 Che","🥖 Banh Bao"],
      zh:["🏘️ 古城","🌉 日本桥(来远桥)","🏮 灯笼节","🌊 秋盆河","🏝️ 占婆岛","🛍️ 夜市","🏖️ 安邦海滩","🏯 福建会馆","🏯 广肇会馆","🌾 椰子村","🍜 高楼面","🥟 白玫瑰","🥢 炸馄饨","🍝 广面","🥖 凤越南三明治","🐟 鸡饭","🍡 越南糖水","🥖 包子"],
      ko:["🏘️ 구시가","🌉 일본다리(내원교)","🏮 랜턴 축제","🌊 투본강","🏝️ 짬섬","🛍️ 야시장","🏖️ 안방비치","🏯 푸젠회관","🏯 광둥회관","🌾 코코넛 마을","🍜 까오라우","🥟 화이트로즈","🥢 튀김 만두","🍝 미꽝","🥖 반미 퐁","🐟 닭고기 덮밥","🍡 째","🥖 반바오"],
      es:["🏘️ Casco Antiguo","🌉 Puente Japonés","🏮 Festival Linternas","🌊 Río Thu Bon","🏝️ Islas Cham","🛍️ Mercado Nocturno","🏖️ Playa An Bang","🏯 Sala Fujian","🏯 Sala Cantonesa","🌾 Aldea Coco","🍜 Cao Lau","🥟 Rosa Blanca","🥢 Wonton Frito","🍝 Mi Quang","🥖 Banh Mi","🐟 Arroz Pollo","🍡 Che","🥖 Banh Bao"],
      pt:["🏘️ Cidade Antiga","🌉 Ponte Japonesa","🏮 Festival Lanternas","🌊 Rio Thu Bon","🏝️ Ilhas Cham","🛍️ Mercado Noturno","🏖️ Praia An Bang","🏯 Salão Fujian","🏯 Salão Cantonês","🌾 Aldeia Coco","🍜 Cao Lau","🥟 Rosa Branca","🥢 Wonton Frito","🍝 Mi Quang","🥖 Banh Mi","🐟 Arroz Frango","🍡 Che","🥖 Banh Bao"]
    },
    フエ:{
      ja:["🏯 フエ王宮(グエン朝)","🏛️ カイディン帝廟","🏛️ ミンマン帝廟","🏛️ トゥドゥック帝廟","🛕 ティエンムー寺","🌊 フォーン川クルーズ","🛍️ ドンバ市場","🏘️ フエ旧市街","🚉 フエ駅","🌉 チュオンティエン橋","🍲 ブンボーフエ","🍡 バインベオ","🥟 バインボッロック","🥣 コムヘン","🍜 ブン","🍢 ネムランチコ","🥢 バインナム","🥄 宮廷料理"],
      en:["🏯 Imperial City","🏛️ Khai Dinh Tomb","🏛️ Minh Mang Tomb","🏛️ Tu Duc Tomb","🛕 Thien Mu Pagoda","🌊 Perfume River","🛍️ Dong Ba Market","🏘️ Hue Old Town","🚉 Hue Station","🌉 Truong Tien Bridge","🍲 Bun Bo Hue","🍡 Banh Beo","🥟 Banh Bot Loc","🥣 Com Hen","🍜 Bun","🍢 Nem Lui","🥢 Banh Nam","🥄 Royal Cuisine"],
      zh:["🏯 顺化皇城","🏛️ 启定帝陵","🏛️ 明命帝陵","🏛️ 嗣德帝陵","🛕 天姥寺","🌊 香江","🛍️ 东巴市场","🏘️ 顺化古城","🚉 顺化车站","🌉 长前桥","🍲 顺化牛肉粉","🍡 米浆糕","🥟 透明虾饺","🥣 蚌仔饭","🍜 米线","🍢 烤肉串","🥢 蕉叶包","🥄 宫廷料理"],
      ko:["🏯 후에 황성","🏛️ 카이딘 황릉","🏛️ 민망 황릉","🏛️ 뜨득 황릉","🛕 티엔무 사원","🌊 흐엉강","🛍️ 동바 시장","🏘️ 후에 구시가","🚉 후에역","🌉 쯔엉띠엔 다리","🍲 분보후에","🍡 반베오","🥟 반봇록","🥣 껌헨","🍜 분","🍢 넴루이","🥢 반남","🥄 궁중요리"],
      es:["🏯 Ciudad Imperial","🏛️ Tumba Khai Dinh","🏛️ Tumba Minh Mang","🏛️ Tumba Tu Duc","🛕 Pagoda Thien Mu","🌊 Río Perfume","🛍️ Mercado Dong Ba","🏘️ Casco Antiguo","🚉 Estación","🌉 Puente Truong Tien","🍲 Bun Bo Hue","🍡 Banh Beo","🥟 Banh Bot Loc","🥣 Com Hen","🍜 Bun","🍢 Nem Lui","🥢 Banh Nam","🥄 Cocina Real"],
      pt:["🏯 Cidade Imperial","🏛️ Tumba Khai Dinh","🏛️ Tumba Minh Mang","🏛️ Tumba Tu Duc","🛕 Pagode Thien Mu","🌊 Rio Perfume","🛍️ Mercado Dong Ba","🏘️ Centro Antigo","🚉 Estação","🌉 Ponte Truong Tien","🍲 Bun Bo Hue","🍡 Banh Beo","🥟 Banh Bot Loc","🥣 Com Hen","🍜 Bun","🍢 Nem Lui","🥢 Banh Nam","🥄 Cozinha Real"]
    },
    ニャチャン:{
      ja:["🏖️ ニャチャンビーチ","🎢 ヴィンパールランド","🛕 ロンソン寺","🏯 ポーナガル塔","💧 泥温泉","🏝️ ホンチョン岬","🏝️ 4島ツアー","⛪ ニャチャン大聖堂","🌃 ナイトマーケット","🎢 ヴィンワンダーズ","🦞 シーフード","🐟 ネムヌオン","🦐 海鮮鍋","🍜 ブンチャーカー","🌯 春巻き","🍡 チェー","🥃 ベトナム焼酎","🍢 BBQ"],
      en:["🏖️ Nha Trang Beach","🎢 Vinpearl Land","🛕 Long Son Pagoda","🏯 Po Nagar Towers","💧 Mud Baths","🏝️ Hon Chong Cape","🏝️ 4 Islands Tour","⛪ Nha Trang Cathedral","🌃 Night Market","🎢 VinWonders","🦞 Seafood","🐟 Nem Nuong","🦐 Seafood Hotpot","🍜 Bun Cha Ca","🌯 Spring Rolls","🍡 Che","🥃 Rice Wine","🍢 BBQ"],
      zh:["🏖️ 芽庄海滩","🎢 珍珠岛","🛕 龙山寺","🏯 婆那加塔","💧 泥浴","🏝️ 婚石岬","🏝️ 四岛游","⛪ 芽庄大教堂","🌃 夜市","🎢 珍珠乐园","🦞 海鲜","🐟 烤肉米线","🦐 海鲜火锅","🍜 鱼面","🌯 春卷","🍡 越南糖水","🥃 米酒","🍢 烧烤"],
      ko:["🏖️ 나트랑 비치","🎢 빈펄랜드","🛕 롱선사","🏯 포나가르탑","💧 머드 온천","🏝️ 혼총곶","🏝️ 4섬투어","⛪ 나트랑 대성당","🌃 야시장","🎢 빈원더스","🦞 해산물","🐟 넴느엉","🦐 해물탕","🍜 분짜까","🌯 월남쌈","🍡 째","🥃 라이스 와인","🍢 BBQ"],
      es:["🏖️ Playa Nha Trang","🎢 Vinpearl","🛕 Pagoda Long Son","🏯 Torres Po Nagar","💧 Baños Barro","🏝️ Cabo Hon Chong","🏝️ Tour 4 Islas","⛪ Catedral","🌃 Mercado Nocturno","🎢 VinWonders","🦞 Mariscos","🐟 Nem Nuong","🦐 Sopa Mariscos","🍜 Bun Cha Ca","🌯 Rollitos","🍡 Che","🥃 Vino Arroz","🍢 BBQ"],
      pt:["🏖️ Praia Nha Trang","🎢 Vinpearl","🛕 Pagode Long Son","🏯 Torres Po Nagar","💧 Banhos Lama","🏝️ Cabo Hon Chong","🏝️ Tour 4 Ilhas","⛪ Catedral","🌃 Mercado Noturno","🎢 VinWonders","🦞 Frutos do Mar","🐟 Nem Nuong","🦐 Sopa Frutos","🍜 Bun Cha Ca","🌯 Rolinhos","🍡 Che","🥃 Vinho Arroz","🍢 BBQ"]
    },
    ダラット:{
      ja:["🌺 ダラット花公園","🏯 バオダイ離宮","🚂 ダラット駅","💒 クレイジーハウス","💧 ダタンラ滝","🌲 ランビアン山","🏞️ トゥエンラム湖","🌹 バラ園","⛪ ドメイン・デ・マリー教会","🛍️ ダラット市場","🍓 イチゴ","🍷 ダラットワイン","☕ アラビカコーヒー","🥬 高原野菜","🍲 鍋料理","🌽 焼きトウモロコシ","🍡 ダラットチェー","🌭 ベトナムソーセージ"],
      en:["🌺 Da Lat Flower Garden","🏯 Bao Dai Palace","🚂 Da Lat Railway","💒 Crazy House","💧 Datanla Waterfall","🌲 Lang Biang Mountain","🏞️ Tuyen Lam Lake","🌹 Rose Garden","⛪ Domaine de Marie","🛍️ Da Lat Market","🍓 Strawberries","🍷 Da Lat Wine","☕ Arabica Coffee","🥬 Highland Vegetables","🍲 Hotpot","🌽 Grilled Corn","🍡 Da Lat Che","🌭 Vietnamese Sausage"],
      zh:["🌺 大叻花园","🏯 保大行宫","🚂 大叻车站","💒 疯狂屋","💧 达坦拉瀑布","🌲 兰比安山","🏞️ 宣林湖","🌹 玫瑰园","⛪ 圣母玛利亚教堂","🛍️ 大叻市场","🍓 草莓","🍷 大叻葡萄酒","☕ 阿拉比卡咖啡","🥬 高原蔬菜","🍲 火锅","🌽 烤玉米","🍡 大叻糖水","🌭 越南香肠"],
      ko:["🌺 달랏 꽃공원","🏯 바오다이 별궁","🚂 달랏역","💒 크레이지하우스","💧 다탄라 폭포","🌲 랑비앙산","🏞️ 뚜옌람호","🌹 장미공원","⛪ 도멘 드 마리","🛍️ 달랏시장","🍓 딸기","🍷 달랏와인","☕ 아라비카커피","🥬 고원채소","🍲 핫팟","🌽 옥수수 구이","🍡 달랏째","🌭 베트남 소시지"],
      es:["🌺 Jardín Flores","🏯 Palacio Bao Dai","🚂 Estación Da Lat","💒 Casa Loca","💧 Cataratas Datanla","🌲 Montaña Lang Biang","🏞️ Lago Tuyen Lam","🌹 Jardín Rosas","⛪ Domaine de Marie","🛍️ Mercado","🍓 Fresas","🍷 Vino Da Lat","☕ Café Arábica","🥬 Verduras","🍲 Hotpot","🌽 Maíz Asado","🍡 Che","🌭 Salchicha"],
      pt:["🌺 Jardim Flores","🏯 Palácio Bao Dai","🚂 Estação Da Lat","💒 Casa Maluca","💧 Cataratas Datanla","🌲 Montanha Lang Biang","🏞️ Lago Tuyen Lam","🌹 Jardim Rosas","⛪ Domaine de Marie","🛍️ Mercado","🍓 Morangos","🍷 Vinho Da Lat","☕ Café Arábica","🥬 Verduras","🍲 Hotpot","🌽 Milho Assado","🍡 Che","🌭 Salsicha"]
    },
    ハロン湾:{
      ja:["⛵ ハロン湾クルーズ","🌊 ティトップ島","🕳️ スンソット鍾乳洞","🚣 カヤック体験","🏝️ カットバ島","🐒 モンキーアイランド","🌊 ルオン洞","🎣 真珠養殖場","🌅 サンセットクルーズ","🌙 ナイトクルーズ","🦞 シーフード","🦀 カニ料理","🦐 ロブスター","🐟 イカ","🍲 海鮮粥","🥢 揚げ春巻き","🍶 ライスワイン","🦪 牡蠣"],
      en:["⛵ Halong Bay Cruise","🌊 Titop Island","🕳️ Sung Sot Cave","🚣 Kayaking","🏝️ Cat Ba Island","🐒 Monkey Island","🌊 Luon Cave","🎣 Pearl Farm","🌅 Sunset Cruise","🌙 Night Cruise","🦞 Seafood","🦀 Crab","🦐 Lobster","🐟 Squid","🍲 Seafood Porridge","🥢 Spring Rolls","🍶 Rice Wine","🦪 Oyster"],
      zh:["⛵ 下龙湾游船","🌊 提督岛","🕳️ 惊讶洞","🚣 划皮艇","🏝️ 吉婆岛","🐒 猴岛","🌊 笼洞","🎣 珍珠养殖场","🌅 日落游船","🌙 夜游","🦞 海鲜","🦀 螃蟹","🦐 龙虾","🐟 鱿鱼","🍲 海鲜粥","🥢 春卷","🍶 米酒","🦪 牡蛎"],
      ko:["⛵ 하롱베이 크루즈","🌊 띠톱섬","🕳️ 숭솟 동굴","🚣 카약 체험","🏝️ 깟바섬","🐒 원숭이섬","🌊 루옹동굴","🎣 진주양식장","🌅 선셋 크루즈","🌙 야간 크루즈","🦞 해산물","🦀 게요리","🦐 랍스터","🐟 오징어","🍲 해산물죽","🥢 짜조","🍶 라이스 와인","🦪 굴"],
      es:["⛵ Crucero Halong","🌊 Isla Titop","🕳️ Cueva Sung Sot","🚣 Kayak","🏝️ Isla Cat Ba","🐒 Isla Mono","🌊 Cueva Luon","🎣 Perlas","🌅 Crucero Atardecer","🌙 Crucero Nocturno","🦞 Mariscos","🦀 Cangrejo","🦐 Langosta","🐟 Calamar","🍲 Sopa","🥢 Rollitos","🍶 Vino Arroz","🦪 Ostra"],
      pt:["⛵ Cruzeiro Halong","🌊 Ilha Titop","🕳️ Caverna Sung Sot","🚣 Caiaque","🏝️ Ilha Cat Ba","🐒 Ilha Macaco","🌊 Caverna Luon","🎣 Pérolas","🌅 Cruzeiro Pôr Sol","🌙 Cruzeiro Noturno","🦞 Frutos do Mar","🦀 Caranguejo","🦐 Lagosta","🐟 Lula","🍲 Sopa","🥢 Rolinhos","🍶 Vinho Arroz","🦪 Ostra"]
    },
    ローマ:{
      ja:["🏛️ コロッセオ","🏛️ フォロロマーノ","⛪ バチカン美術館","⛪ サンピエトロ大聖堂","💧 トレヴィの泉","🪜 スペイン広場","🏛️ パンテオン","🏰 サンタンジェロ城","🛕 真実の口","🏛️ ボルゲーゼ美術館","🍝 カルボナーラ","🍝 カチョエペペ","🍝 アマトリチャーナ","🍕 ローマ風ピザ","🥩 サルティンボッカ","🍦 ジェラート","🥃 エスプレッソ","🍷 ハウスワイン"],
      en:["🏛️ Colosseum","🏛️ Roman Forum","⛪ Vatican Museums","⛪ St. Peter's Basilica","💧 Trevi Fountain","🪜 Spanish Steps","🏛️ Pantheon","🏰 Castel Sant'Angelo","🛕 Mouth of Truth","🏛️ Borghese Gallery","🍝 Carbonara","🍝 Cacio e Pepe","🍝 Amatriciana","🍕 Roman Pizza","🥩 Saltimbocca","🍦 Gelato","🥃 Espresso","🍷 House Wine"],
      zh:["🏛️ 罗马斗兽场","🏛️ 古罗马广场","⛪ 梵蒂冈博物馆","⛪ 圣彼得大教堂","💧 特雷维喷泉","🪜 西班牙广场","🏛️ 万神殿","🏰 圣天使城堡","🛕 真理之口","🏛️ 博尔盖塞美术馆","🍝 卡邦尼意粉","🍝 黑椒奶酪面","🍝 培根番茄面","🍕 罗马披萨","🥩 萨尔提波卡","🍦 意式冰淇淋","🥃 浓缩咖啡","🍷 家酿酒"],
      ko:["🏛️ 콜로세움","🏛️ 포로 로마노","⛪ 바티칸 박물관","⛪ 성베드로 대성당","💧 트레비 분수","🪜 스페인 광장","🏛️ 판테온","🏰 산탄젤로성","🛕 진실의 입","🏛️ 보르게세 미술관","🍝 까르보나라","🍝 카치오 에 페페","🍝 아마트리치아나","🍕 로마식 피자","🥩 살팀보카","🍦 젤라토","🥃 에스프레소","🍷 하우스 와인"],
      es:["🏛️ Coliseo","🏛️ Foro Romano","⛪ Museos Vaticanos","⛪ Basílica San Pedro","💧 Fontana di Trevi","🪜 Plaza España","🏛️ Panteón","🏰 Castel Sant'Angelo","🛕 Boca Verdad","🏛️ Galería Borghese","🍝 Carbonara","🍝 Cacio e Pepe","🍝 Amatriciana","🍕 Pizza Romana","🥩 Saltimbocca","🍦 Gelato","🥃 Espresso","🍷 Vino Casa"],
      pt:["🏛️ Coliseu","🏛️ Fórum Romano","⛪ Museus Vaticanos","⛪ Basílica São Pedro","💧 Fonte de Trevi","🪜 Praça Espanha","🏛️ Panteão","🏰 Castel Sant'Angelo","🛕 Boca da Verdade","🏛️ Galeria Borghese","🍝 Carbonara","🍝 Cacio e Pepe","🍝 Amatriciana","🍕 Pizza Romana","🥩 Saltimbocca","🍦 Gelato","🥃 Espresso","🍷 Vinho da Casa"]
    },
    ミラノ:{
      ja:["⛪ ミラノ大聖堂","🖼️ 最後の晩餐","🛍️ ヴィットーリオ・エマヌエーレII世","🏰 スフォルツェスコ城","🎭 スカラ座","🏛️ ブレラ美術館","⛪ サンタンブロージョ教会","🏛️ ピナコテーカ・アンブロジアーナ","🛍️ ナヴィリ運河","🏟️ サンシーロ","🍝 リゾット・ミラネーゼ","🥩 オッソブーコ","🥩 コトレッタ・ミラネーゼ","🍕 ピザ","🥖 パネットーネ","☕ エスプレッソ","🍷 ロンバルディアワイン","🍦 ジェラート"],
      en:["⛪ Milan Cathedral","🖼️ Last Supper","🛍️ Galleria Vittorio Emanuele","🏰 Sforzesco Castle","🎭 La Scala","🏛️ Brera Gallery","⛪ Sant'Ambrogio","🏛️ Pinacoteca Ambrosiana","🛍️ Navigli Canals","🏟️ San Siro","🍝 Risotto Milanese","🥩 Ossobuco","🥩 Cotoletta Milanese","🍕 Pizza","🥖 Panettone","☕ Espresso","🍷 Lombardy Wine","🍦 Gelato"],
      zh:["⛪ 米兰大教堂","🖼️ 最后的晚餐","🛍️ 维托里奥艾曼纽二世长廊","🏰 斯福尔扎城堡","🎭 斯卡拉歌剧院","🏛️ 布雷拉美术馆","⛪ 圣安波罗修堂","🏛️ 安波罗修美术馆","🛍️ 纳维利运河","🏟️ 圣西罗球场","🍝 米兰烩饭","🥩 红烩牛膝","🥩 米兰炸肉排","🍕 披萨","🥖 潘妮多妮","☕ 浓缩咖啡","🍷 伦巴第葡萄酒","🍦 冰淇淋"],
      ko:["⛪ 밀라노 대성당","🖼️ 최후의 만찬","🛍️ 비토리오 에마누엘레","🏰 스포르체스코성","🎭 스칼라 극장","🏛️ 브레라 미술관","⛪ 산탐브로조","🏛️ 암브로시아나","🛍️ 나빌리 운하","🏟️ 산시로","🍝 밀라네제 리조또","🥩 오소부코","🥩 코톨레타","🍕 피자","🥖 파네토네","☕ 에스프레소","🍷 롬바르디아 와인","🍦 젤라토"],
      es:["⛪ Catedral Milán","🖼️ Última Cena","🛍️ Galería V. Emanuele","🏰 Castillo Sforzesco","🎭 La Scala","🏛️ Brera","⛪ Sant'Ambrogio","🏛️ Ambrosiana","🛍️ Navigli","🏟️ San Siro","🍝 Risotto Milanés","🥩 Ossobuco","🥩 Cotoletta","🍕 Pizza","🥖 Panettone","☕ Espresso","🍷 Vino Lombardía","🍦 Gelato"],
      pt:["⛪ Catedral Milão","🖼️ Última Ceia","🛍️ Galeria V. Emanuele","🏰 Castelo Sforzesco","🎭 La Scala","🏛️ Brera","⛪ Sant'Ambrogio","🏛️ Ambrosiana","🛍️ Navigli","🏟️ San Siro","🍝 Risotto Milanês","🥩 Ossobuco","🥩 Cotoletta","🍕 Pizza","🥖 Panettone","☕ Espresso","🍷 Vinho Lombardia","🍦 Gelato"]
    },
    フィレンツェ:{
      ja:["⛪ ドゥオモ(花の聖母)","🏛️ ウフィツィ美術館","🏰 ヴェッキオ宮殿","🌉 ヴェッキオ橋","🏛️ アカデミア美術館(ダビデ像)","⛪ サンタクローチェ教会","🌅 ミケランジェロ広場","🏰 ピッティ宮殿","🌳 ボーボリ庭園","🏛️ バルジェロ博物館","🥩 ビステッカ・フィオレンティーナ","🍞 リボッリータ","🍝 パッパルデッレ","🍷 キャンティワイン","🍦 ジェラート","🐗 イノシシ料理","🧀 ペコリーノチーズ","🫒 オリーブオイル"],
      en:["⛪ Florence Duomo","🏛️ Uffizi Gallery","🏰 Palazzo Vecchio","🌉 Ponte Vecchio","🏛️ Accademia (David)","⛪ Santa Croce","🌅 Piazzale Michelangelo","🏰 Pitti Palace","🌳 Boboli Gardens","🏛️ Bargello Museum","🥩 Bistecca Fiorentina","🍞 Ribollita","🍝 Pappardelle","🍷 Chianti Wine","🍦 Gelato","🐗 Wild Boar","🧀 Pecorino","🫒 Olive Oil"],
      zh:["⛪ 佛罗伦萨大教堂","🏛️ 乌菲兹美术馆","🏰 旧宫","🌉 老桥","🏛️ 学院美术馆(大卫像)","⛪ 圣十字教堂","🌅 米开朗琪罗广场","🏰 皮蒂宫","🌳 波波里花园","🏛️ 巴杰罗博物馆","🥩 佛罗伦萨牛排","🍞 蔬菜浓汤","🍝 宽面条","🍷 基安蒂葡萄酒","🍦 冰淇淋","🐗 野猪料理","🧀 佩科里诺奶酪","🫒 橄榄油"],
      ko:["⛪ 피렌체 두오모","🏛️ 우피치 미술관","🏰 베키오 궁전","🌉 베키오 다리","🏛️ 아카데미아(다비드)","⛪ 산타크로체","🌅 미켈란젤로 광장","🏰 피티 궁전","🌳 보볼리 정원","🏛️ 바르젤로","🥩 비스테카","🍞 리볼리타","🍝 파파르델레","🍷 키안티","🍦 젤라토","🐗 멧돼지","🧀 페코리노","🫒 올리브유"],
      es:["⛪ Duomo Florencia","🏛️ Uffizi","🏰 Palazzo Vecchio","🌉 Ponte Vecchio","🏛️ Academia (David)","⛪ Santa Croce","🌅 Piazzale Michelangelo","🏰 Palacio Pitti","🌳 Jardines Boboli","🏛️ Bargello","🥩 Bistecca Fiorentina","🍞 Ribollita","🍝 Pappardelle","🍷 Chianti","🍦 Gelato","🐗 Jabalí","🧀 Pecorino","🫒 Aceite Oliva"],
      pt:["⛪ Duomo Florença","🏛️ Uffizi","🏰 Palazzo Vecchio","🌉 Ponte Vecchio","🏛️ Academia (David)","⛪ Santa Croce","🌅 Piazzale Michelangelo","🏰 Palácio Pitti","🌳 Jardins Boboli","🏛️ Bargello","🥩 Bistecca Fiorentina","🍞 Ribollita","🍝 Pappardelle","🍷 Chianti","🍦 Gelato","🐗 Javali","🧀 Pecorino","🫒 Azeite"]
    },
    ヴェネツィア:{
      ja:["⛪ サンマルコ寺院","🏰 ドゥカーレ宮殿","🌉 リアルト橋","🛶 ゴンドラ","⛪ サンタマリア教会","🏝️ ムラーノ島","🏝️ ブラーノ島","🎭 仮面舞踏会","🚢 水上バス(ヴァポレット)","🛍️ サンマルコ広場","🍝 イカ墨パスタ","🦞 海鮮料理","🐟 サルデフィン・サオール","🍷 プロセッコ","🍦 ジェラート","🍰 ティラミス(発祥)","🥖 チケッティ","🥃 アペロール"],
      en:["⛪ St. Mark's Basilica","🏰 Doge's Palace","🌉 Rialto Bridge","🛶 Gondola Ride","⛪ Santa Maria Salute","🏝️ Murano Island","🏝️ Burano Island","🎭 Masquerade","🚢 Vaporetto","🛍️ St. Mark's Square","🍝 Squid Ink Pasta","🦞 Seafood","🐟 Sarde in Saor","🍷 Prosecco","🍦 Gelato","🍰 Tiramisu (Origin)","🥖 Cicchetti","🥃 Aperol Spritz"],
      zh:["⛪ 圣马可大教堂","🏰 总督宫","🌉 里亚托桥","🛶 贡多拉","⛪ 安康圣母教堂","🏝️ 穆拉诺岛","🏝️ 布拉诺岛","🎭 假面舞会","🚢 水上巴士","🛍️ 圣马可广场","🍝 墨鱼意面","🦞 海鲜","🐟 醋渍沙丁鱼","🍷 普罗赛克","🍦 冰淇淋","🍰 提拉米苏(发源)","🥖 小吃","🥃 阿佩罗"],
      ko:["⛪ 산마르코 대성당","🏰 두칼레 궁전","🌉 리알토 다리","🛶 곤돌라","⛪ 산타마리아","🏝️ 무라노섬","🏝️ 부라노섬","🎭 가면무도회","🚢 바포레토","🛍️ 산마르코 광장","🍝 오징어먹물","🦞 해산물","🐟 사르데","🍷 프로세코","🍦 젤라토","🍰 티라미수(원조)","🥖 치케티","🥃 아페롤"],
      es:["⛪ Basílica San Marcos","🏰 Palacio Ducal","🌉 Puente Rialto","🛶 Góndola","⛪ Santa Maria Salute","🏝️ Murano","🏝️ Burano","🎭 Carnaval","🚢 Vaporetto","🛍️ Plaza San Marcos","🍝 Pasta Tinta Calamar","🦞 Mariscos","🐟 Sarde in Saor","🍷 Prosecco","🍦 Gelato","🍰 Tiramisú (Origen)","🥖 Cicchetti","🥃 Aperol"],
      pt:["⛪ Basílica São Marcos","🏰 Palácio Ducal","🌉 Ponte Rialto","🛶 Gôndola","⛪ Santa Maria Salute","🏝️ Murano","🏝️ Burano","🎭 Carnaval","🚢 Vaporetto","🛍️ Praça São Marcos","🍝 Massa Tinta Lula","🦞 Frutos do Mar","🐟 Sarde in Saor","🍷 Prosecco","🍦 Gelato","🍰 Tiramisu (Origem)","🥖 Cicchetti","🥃 Aperol"]
    },
    ナポリ:{
      ja:["⛰️ ヴェスヴィオ火山","🏛️ ポンペイ遺跡","🏛️ エルコラーノ遺跡","🏰 卵城(カステル・デローヴォ)","🏰 ヌオーヴォ城","⛪ ナポリ大聖堂","🏛️ 国立考古学博物館","🛍️ スパッカ・ナポリ","🌊 サンタルチア海岸","🏝️ カプリ島","🍕 マルゲリータ(発祥)","🍝 パスタ","☕ ナポリコーヒー","🍰 スフォリアテッラ","🍰 ババ","🍕 マリナーラ","🍷 ラクリマクリスティ","🍝 スパゲッティ・ボンゴレ"],
      en:["⛰️ Mt. Vesuvius","🏛️ Pompeii","🏛️ Herculaneum","🏰 Castel dell'Ovo","🏰 Castel Nuovo","⛪ Naples Cathedral","🏛️ Archaeological Museum","🛍️ Spaccanapoli","🌊 Santa Lucia","🏝️ Capri Island","🍕 Margherita (Origin)","🍝 Pasta","☕ Naples Coffee","🍰 Sfogliatella","🍰 Baba","🍕 Marinara","🍷 Lacryma Christi","🍝 Spaghetti Vongole"],
      zh:["⛰️ 维苏威火山","🏛️ 庞贝古城","🏛️ 赫库兰尼姆","🏰 蛋堡","🏰 新堡","⛪ 那不勒斯大教堂","🏛️ 国家考古博物馆","🛍️ 斯帕卡那不勒斯","🌊 圣露琪亚海岸","🏝️ 卡普里岛","🍕 玛格丽特(发源)","🍝 意面","☕ 那不勒斯咖啡","🍰 千层贝壳","🍰 巴巴朗姆","🍕 海员披萨","🍷 基督之泪","🍝 蛤蜊面"],
      ko:["⛰️ 베수비오 화산","🏛️ 폼페이","🏛️ 헤르쿨라네움","🏰 달걀성","🏰 누오보성","⛪ 나폴리 대성당","🏛️ 국립고고학박물관","🛍️ 스파카나폴리","🌊 산타루치아","🏝️ 카프리섬","🍕 마르게리타(원조)","🍝 파스타","☕ 나폴리 커피","🍰 스폴리아텔라","🍰 바바","🍕 마리나라","🍷 라크리마 크리스티","🍝 봉골레 스파게티"],
      es:["⛰️ Vesubio","🏛️ Pompeya","🏛️ Herculano","🏰 Castel dell'Ovo","🏰 Castel Nuovo","⛪ Catedral Nápoles","🏛️ Museo Arqueológico","🛍️ Spaccanapoli","🌊 Santa Lucía","🏝️ Capri","🍕 Margarita (Origen)","🍝 Pasta","☕ Café Napolitano","🍰 Sfogliatella","🍰 Babà","🍕 Marinara","🍷 Lacryma Christi","🍝 Spaghetti Vongole"],
      pt:["⛰️ Vesúvio","🏛️ Pompeia","🏛️ Herculano","🏰 Castel dell'Ovo","🏰 Castel Nuovo","⛪ Catedral Nápoles","🏛️ Museu Arqueológico","🛍️ Spaccanapoli","🌊 Santa Lúcia","🏝️ Capri","🍕 Margherita (Origem)","🍝 Massa","☕ Café Napolitano","🍰 Sfogliatella","🍰 Babà","🍕 Marinara","🍷 Lacryma Christi","🍝 Spaghetti Vongole"]
    },
    アマルフィ:{
      ja:["🏖️ ポジターノ","🏖️ アマルフィ海岸","⛪ アマルフィ大聖堂","🏘️ ラヴェッロ","🏛️ ヴィッラ・ルフォーロ","🏛️ ヴィッラ・チンブローネ","🚢 ボートツアー","🏝️ カプリ島","🌊 青の洞窟","🏘️ ソレント","🍋 リモンチェッロ","🍝 シーフードパスタ","🦞 海鮮料理","🍝 スパゲッティ・ボンゴレ","🍕 ピザ","🍦 レモンジェラート","🧀 モッツァレラ","🐟 アンチョビ料理"],
      en:["🏖️ Positano","🏖️ Amalfi Coast","⛪ Amalfi Cathedral","🏘️ Ravello","🏛️ Villa Rufolo","🏛️ Villa Cimbrone","🚢 Boat Tour","🏝️ Capri","🌊 Blue Grotto","🏘️ Sorrento","🍋 Limoncello","🍝 Seafood Pasta","🦞 Seafood","🍝 Spaghetti Vongole","🍕 Pizza","🍦 Lemon Gelato","🧀 Mozzarella","🐟 Anchovy Dish"],
      zh:["🏖️ 波西塔诺","🏖️ 阿马尔菲海岸","⛪ 阿马尔菲大教堂","🏘️ 拉韦洛","🏛️ 鲁福洛别墅","🏛️ 钦布罗内别墅","🚢 游船","🏝️ 卡普里岛","🌊 蓝洞","🏘️ 索伦托","🍋 柠檬酒","🍝 海鲜意面","🦞 海鲜","🍝 蛤蜊面","🍕 披萨","🍦 柠檬冰淇淋","🧀 莫扎瑞拉","🐟 鳀鱼料理"],
      ko:["🏖️ 포지타노","🏖️ 아말피 해안","⛪ 아말피 대성당","🏘️ 라벨로","🏛️ 빌라 루폴로","🏛️ 빌라 침브로네","🚢 보트투어","🏝️ 카프리","🌊 푸른동굴","🏘️ 소렌토","🍋 리몬첼로","🍝 해산물 파스타","🦞 해산물","🍝 봉골레","🍕 피자","🍦 레몬 젤라토","🧀 모짜렐라","🐟 안초비"],
      es:["🏖️ Positano","🏖️ Costa Amalfi","⛪ Catedral Amalfi","🏘️ Ravello","🏛️ Villa Rufolo","🏛️ Villa Cimbrone","🚢 Tour Barco","🏝️ Capri","🌊 Gruta Azul","🏘️ Sorrento","🍋 Limoncello","🍝 Pasta Mariscos","🦞 Mariscos","🍝 Vongole","🍕 Pizza","🍦 Gelato Limón","🧀 Mozzarella","🐟 Anchoa"],
      pt:["🏖️ Positano","🏖️ Costa Amalfi","⛪ Catedral Amalfi","🏘️ Ravello","🏛️ Villa Rufolo","🏛️ Villa Cimbrone","🚢 Tour Barco","🏝️ Capri","🌊 Gruta Azul","🏘️ Sorrento","🍋 Limoncello","🍝 Massa Mariscos","🦞 Frutos do Mar","🍝 Vongole","🍕 Pizza","🍦 Gelato Limão","🧀 Mozzarella","🐟 Anchova"]
    },
    シチリア:{
      ja:["🏛️ ヴァッレ・デイ・テンプリ","⛰️ エトナ火山","🏖️ タオルミーナ","🏛️ シラクーザ","🏛️ パレルモ大聖堂","🏘️ チェファル","🏰 ノルマン王宮","🏛️ モンレアーレ大聖堂","🏖️ サン・ヴィート・ロ・カーポ","🏘️ ノート","🍝 パスタ・アッラ・ノルマ","🍰 カンノーリ","🍦 グラニタ","🍕 シチリア風ピザ","🐟 シーフード","🍢 アランチーニ","🍰 カッサータ","🍷 マルサラ酒"],
      en:["🏛️ Valley of Temples","⛰️ Mt. Etna","🏖️ Taormina","🏛️ Syracuse","🏛️ Palermo Cathedral","🏘️ Cefalù","🏰 Norman Palace","🏛️ Monreale","🏖️ San Vito Lo Capo","🏘️ Noto","🍝 Pasta alla Norma","🍰 Cannoli","🍦 Granita","🍕 Sicilian Pizza","🐟 Seafood","🍢 Arancini","🍰 Cassata","🍷 Marsala Wine"],
      zh:["🏛️ 神殿之谷","⛰️ 埃特纳火山","🏖️ 陶尔米纳","🏛️ 锡拉库萨","🏛️ 巴勒莫大教堂","🏘️ 切法卢","🏰 诺曼王宫","🏛️ 蒙雷阿莱大教堂","🏖️ 圣维托","🏘️ 诺托","🍝 诺尔玛意面","🍰 卡诺利","🍦 格兰尼塔","🍕 西西里披萨","🐟 海鲜","🍢 米饭丸","🍰 卡萨塔","🍷 马尔萨拉酒"],
      ko:["🏛️ 신전의 계곡","⛰️ 에트나 화산","🏖️ 타오르미나","🏛️ 시라쿠사","🏛️ 팔레르모 대성당","🏘️ 체팔루","🏰 노르만 왕궁","🏛️ 몬레알레","🏖️ 산 비토","🏘️ 노토","🍝 노르마 파스타","🍰 칸놀리","🍦 그라니타","🍕 시칠리아 피자","🐟 해산물","🍢 아란치니","🍰 카사타","🍷 마르살라"],
      es:["🏛️ Valle Templos","⛰️ Etna","🏖️ Taormina","🏛️ Siracusa","🏛️ Catedral Palermo","🏘️ Cefalù","🏰 Palacio Normando","🏛️ Monreale","🏖️ San Vito","🏘️ Noto","🍝 Pasta alla Norma","🍰 Cannoli","🍦 Granita","🍕 Pizza Siciliana","🐟 Mariscos","🍢 Arancini","🍰 Cassata","🍷 Marsala"],
      pt:["🏛️ Vale dos Templos","⛰️ Etna","🏖️ Taormina","🏛️ Siracusa","🏛️ Catedral Palermo","🏘️ Cefalù","🏰 Palácio Normando","🏛️ Monreale","🏖️ San Vito","🏘️ Noto","🍝 Pasta alla Norma","🍰 Cannoli","🍦 Granita","🍕 Pizza Siciliana","🐟 Frutos do Mar","🍢 Arancini","🍰 Cassata","🍷 Marsala"]
    },
    ボローニャ:{
      ja:["🗼 アジネッリの塔","🏛️ マッジョーレ広場","⛪ サン・ペトロニオ大聖堂","🏛️ ボローニャ大学","🛍️ クアドリラテロ市場","⛪ サント・ステファノ教会","🏛️ ボローニャ国立美術館","🏛️ ネプチューン噴水","🚂 フェラーリ博物館(マラネッロ)","🏰 アックルシオ宮殿","🍝 タリアテッレ・ラグー(ボロネーゼ発祥)","🥩 モルタデッラ","🧀 パルミジャーノ","🥩 生ハム(プロシュート)","🍝 トルテリーニ","🍷 ランブルスコ","🥖 ピアディーナ","🍦 ジェラート"],
      en:["🗼 Asinelli Tower","🏛️ Piazza Maggiore","⛪ San Petronio","🏛️ Bologna University","🛍️ Quadrilatero Market","⛪ Santo Stefano","🏛️ National Gallery","🏛️ Neptune Fountain","🚂 Ferrari Museum","🏰 Palazzo d'Accursio","🍝 Tagliatelle al Ragu (Origin)","🥩 Mortadella","🧀 Parmigiano","🥩 Prosciutto","🍝 Tortellini","🍷 Lambrusco","🥖 Piadina","🍦 Gelato"],
      zh:["🗼 双塔","🏛️ 马焦雷广场","⛪ 圣白托略大教堂","🏛️ 博洛尼亚大学","🛍️ 市场区","⛪ 圣斯德望教堂","🏛️ 国立美术馆","🏛️ 海神喷泉","🚂 法拉利博物馆","🏰 阿库尔西奥宫","🍝 博洛尼亚肉酱面(发源)","🥩 大红肠","🧀 帕马森奶酪","🥩 帕尔玛火腿","🍝 馄饨","🍷 蓝布鲁斯科","🥖 玉米饼","🍦 冰淇淋"],
      ko:["🗼 아시넬리탑","🏛️ 마조레 광장","⛪ 산 페트로니오","🏛️ 볼로냐 대학","🛍️ 시장","⛪ 산토 스테파노","🏛️ 국립미술관","🏛️ 넵튠 분수","🚂 페라리 박물관","🏰 아쿠르시오","🍝 라구 탈리아텔레(원조)","🥩 모르타델라","🧀 파르미자노","🥩 프로슈토","🍝 토르텔리니","🍷 람브루스코","🥖 피아디나","🍦 젤라토"],
      es:["🗼 Torre Asinelli","🏛️ Plaza Maggiore","⛪ San Petronio","🏛️ Universidad","🛍️ Mercado","⛪ Santo Stefano","🏛️ Galería Nacional","🏛️ Fuente Neptuno","🚂 Museo Ferrari","🏰 Palazzo Accursio","🍝 Tagliatelle Ragu (Origen)","🥩 Mortadela","🧀 Parmigiano","🥩 Prosciutto","🍝 Tortellini","🍷 Lambrusco","🥖 Piadina","🍦 Gelato"],
      pt:["🗼 Torre Asinelli","🏛️ Praça Maggiore","⛪ San Petronio","🏛️ Universidade","🛍️ Mercado","⛪ Santo Stefano","🏛️ Galeria Nacional","🏛️ Fonte Netuno","🚂 Museu Ferrari","🏰 Palazzo Accursio","🍝 Tagliatelle Ragu (Origem)","🥩 Mortadela","🧀 Parmigiano","🥩 Prosciutto","🍝 Tortellini","🍷 Lambrusco","🥖 Piadina","🍦 Gelato"]
    },
    トリノ:{
      ja:["⛪ トリノ大聖堂(聖骸布)","🏰 マダマ宮殿","🏛️ エジプト博物館","🏰 王宮(パラッツォ・レアーレ)","🏛️ モーレ・アントネリアーナ","🎬 国立映画博物館","🏛️ サバウダ美術館","🏰 ヴァレンティーノ城","🚗 国立自動車博物館","🛍️ ポルタ・パラッツォ市場","🍫 ジャンドゥーヤ","☕ ビチェリン","🥩 ビテッロ・トンナート","🍝 アニョロッティ","🍷 バローロ","🍷 バルバレスコ","🧀 トマ・ピエモンテーゼ","🍦 ジェラート"],
      en:["⛪ Turin Cathedral (Shroud)","🏰 Palazzo Madama","🏛️ Egyptian Museum","🏰 Royal Palace","🏛️ Mole Antonelliana","🎬 Cinema Museum","🏛️ Sabauda Gallery","🏰 Valentino Castle","🚗 Auto Museum","🛍️ Porta Palazzo","🍫 Gianduja","☕ Bicerin","🥩 Vitello Tonnato","🍝 Agnolotti","🍷 Barolo","🍷 Barbaresco","🧀 Toma","🍦 Gelato"],
      zh:["⛪ 都灵大教堂","🏰 玛达玛宫","🏛️ 埃及博物馆","🏰 王宫","🏛️ 安托内利尖塔","🎬 电影博物馆","🏛️ 萨包达美术馆","🏰 瓦伦蒂诺城堡","🚗 国立汽车博物馆","🛍️ 宫门市场","🍫 占度亚巧克力","☕ 比切林","🥩 金枪鱼小牛","🍝 阿尼奥洛蒂","🍷 巴罗洛","🍷 巴巴莱斯科","🧀 托马奶酪","🍦 冰淇淋"],
      ko:["⛪ 토리노 대성당(성의)","🏰 마다마 궁전","🏛️ 이집트 박물관","🏰 왕궁","🏛️ 몰레 안토넬리아나","🎬 영화박물관","🏛️ 사바우다","🏰 발렌티노성","🚗 자동차박물관","🛍️ 포르타 팔라초","🍫 잔두야","☕ 비체린","🥩 비텔로 토나토","🍝 아뇰로티","🍷 바롤로","🍷 바르바레스코","🧀 토마","🍦 젤라토"],
      es:["⛪ Catedral Turín","🏰 Palazzo Madama","🏛️ Museo Egipcio","🏰 Palacio Real","🏛️ Mole Antonelliana","🎬 Museo Cine","🏛️ Sabauda","🏰 Valentino","🚗 Museo Auto","🛍️ Porta Palazzo","🍫 Gianduja","☕ Bicerin","🥩 Vitello Tonnato","🍝 Agnolotti","🍷 Barolo","🍷 Barbaresco","🧀 Toma","🍦 Gelato"],
      pt:["⛪ Catedral Turim","🏰 Palazzo Madama","🏛️ Museu Egípcio","🏰 Palácio Real","🏛️ Mole Antonelliana","🎬 Museu Cinema","🏛️ Sabauda","🏰 Valentino","🚗 Museu Auto","🛍️ Porta Palazzo","🍫 Gianduja","☕ Bicerin","🥩 Vitello Tonnato","🍝 Agnolotti","🍷 Barolo","🍷 Barbaresco","🧀 Toma","🍦 Gelato"]
    },
    パレルモ:{
      ja:["⛪ パレルモ大聖堂","🏰 ノルマン王宮","🏛️ パラティーナ礼拝堂","🏛️ モンレアーレ大聖堂","🏛️ クアトロ・カンティ","🏛️ プレトリア広場","🛍️ ヴッチリア市場","🛍️ バッラロ市場","🏛️ マッシモ劇場","🏰 ジサ城","🍢 アランチーニ","🍰 カンノーリ","🍦 グラニタ","🥖 パーニ・カ・ムエウサ","🍝 パスタ・コン・サルデ","🐟 シーフード","🍷 マルサラ酒","🥖 シチリアパン"],
      en:["⛪ Palermo Cathedral","🏰 Norman Palace","🏛️ Palatine Chapel","🏛️ Monreale Cathedral","🏛️ Quattro Canti","🏛️ Piazza Pretoria","🛍️ Vucciria Market","🛍️ Ballarò Market","🏛️ Teatro Massimo","🏰 Zisa Castle","🍢 Arancini","🍰 Cannoli","🍦 Granita","🥖 Pani ca Meusa","🍝 Pasta con Sarde","🐟 Seafood","🍷 Marsala","🥖 Sicilian Bread"],
      zh:["⛪ 巴勒莫大教堂","🏰 诺曼王宫","🏛️ 帕拉提那礼拜堂","🏛️ 蒙雷阿莱大教堂","🏛️ 四角广场","🏛️ 普雷托利亚广场","🛍️ 武恰利亚市场","🛍️ 巴拉罗市场","🏛️ 马西莫剧院","🏰 齐萨城","🍢 米饭丸","🍰 卡诺利","🍦 格兰尼塔","🥖 牛脾三明治","🍝 沙丁鱼意面","🐟 海鲜","🍷 马尔萨拉酒","🥖 西西里面包"],
      ko:["⛪ 팔레르모 대성당","🏰 노르만 왕궁","🏛️ 팔라티나 예배당","🏛️ 몬레알레","🏛️ 콰트로 칸티","🏛️ 프레토리아","🛍️ 부치리아 시장","🛍️ 발라로 시장","🏛️ 마시모 극장","🏰 지사성","🍢 아란치니","🍰 칸놀리","🍦 그라니타","🥖 파니 카 무에우사","🍝 정어리 파스타","🐟 해산물","🍷 마르살라","🥖 시칠리아 빵"],
      es:["⛪ Catedral Palermo","🏰 Palacio Normando","🏛️ Capilla Palatina","🏛️ Monreale","🏛️ Quattro Canti","🏛️ Plaza Pretoria","🛍️ Vucciria","🛍️ Ballarò","🏛️ Teatro Massimo","🏰 Castillo Zisa","🍢 Arancini","🍰 Cannoli","🍦 Granita","🥖 Pani ca Meusa","🍝 Pasta Sardinas","🐟 Mariscos","🍷 Marsala","🥖 Pan Siciliano"],
      pt:["⛪ Catedral Palermo","🏰 Palácio Normando","🏛️ Capela Palatina","🏛️ Monreale","🏛️ Quattro Canti","🏛️ Praça Pretoria","🛍️ Vucciria","🛍️ Ballarò","🏛️ Teatro Massimo","🏰 Castelo Zisa","🍢 Arancini","🍰 Cannoli","🍦 Granita","🥖 Pani ca Meusa","🍝 Massa Sardinhas","🐟 Frutos do Mar","🍷 Marsala","🥖 Pão Siciliano"]
    },
    パリ:{
      ja:["🗼 エッフェル塔","🏛️ ルーブル美術館","🏰 ヴェルサイユ宮殿","🎖️ 凱旋門","⛪ ノートルダム大聖堂","🎨 オルセー美術館","🌳 モンマルトル","💒 サクレクール寺院","🌊 セーヌ川クルーズ","🛍️ シャンゼリゼ通り","🥐 クロワッサン","🥖 バゲット","🍰 マカロン","🍷 ボルドーワイン","🧀 カマンベール","🥩 ステーキフリット","🐌 エスカルゴ","🍰 オペラケーキ"],
      en:["🗼 Eiffel Tower","🏛️ Louvre Museum","🏰 Versailles Palace","🎖️ Arc de Triomphe","⛪ Notre Dame","🎨 Musée d'Orsay","🌳 Montmartre","💒 Sacré-Cœur","🌊 Seine Cruise","🛍️ Champs-Élysées","🥐 Croissant","🥖 Baguette","🍰 Macaron","🍷 Bordeaux Wine","🧀 Camembert","🥩 Steak Frites","🐌 Escargot","🍰 Opera Cake"],
      zh:["🗼 埃菲尔铁塔","🏛️ 卢浮宫","🏰 凡尔赛宫","🎖️ 凯旋门","⛪ 巴黎圣母院","🎨 奥赛博物馆","🌳 蒙马特","💒 圣心堂","🌊 塞纳河游船","🛍️ 香榭丽舍","🥐 牛角包","🥖 法棍","🍰 马卡龙","🍷 波尔多红酒","🧀 卡门贝尔奶酪","🥩 牛排薯条","🐌 蜗牛","🍰 歌剧院蛋糕"],
      ko:["🗼 에펠탑","🏛️ 루브르 박물관","🏰 베르사유 궁전","🎖️ 개선문","⛪ 노트르담","🎨 오르세 미술관","🌳 몽마르트","💒 사크레쾨르","🌊 센강 크루즈","🛍️ 샹젤리제","🥐 크루아상","🥖 바게트","🍰 마카롱","🍷 보르도 와인","🧀 카망베르","🥩 스테이크 프리트","🐌 에스카르고","🍰 오페라 케이크"],
      es:["🗼 Torre Eiffel","🏛️ Museo Louvre","🏰 Palacio Versalles","🎖️ Arco Triunfo","⛪ Notre Dame","🎨 Museo Orsay","🌳 Montmartre","💒 Sacré-Cœur","🌊 Crucero Sena","🛍️ Campos Elíseos","🥐 Croissant","🥖 Baguette","🍰 Macaron","🍷 Vino Bordeaux","🧀 Camembert","🥩 Bistec Patatas","🐌 Caracoles","🍰 Pastel Ópera"],
      pt:["🗼 Torre Eiffel","🏛️ Museu Louvre","🏰 Palácio Versalhes","🎖️ Arco do Triunfo","⛪ Notre Dame","🎨 Museu Orsay","🌳 Montmartre","💒 Sacré-Cœur","🌊 Cruzeiro Sena","🛍️ Champs-Élysées","🥐 Croissant","🥖 Baguete","🍰 Macaron","🍷 Vinho Bordeaux","🧀 Camembert","🥩 Bife Frites","🐌 Caracóis","🍰 Bolo Ópera"]
    },
    ニース:{
      ja:["🏖️ プロムナード・デ・ザングレ","🌊 ニース旧市街","🌸 マセナ広場","🌹 城跡公園","🎨 マティス美術館","🎨 シャガール美術館","⛪ ロシア正教会","🛍️ サレヤ広場マルシェ","🌊 天使湾","🏰 ヴィル城","🥗 ニサルダサラダ","🥖 ソッカ","🐟 ブイヤベース","🐟 シーフード","🍦 グラス・ファブリーヌ","🍷 ローズワイン","🍰 タルトトロペジエンヌ","🥖 ピサラディエール"],
      en:["🏖️ Promenade des Anglais","🌊 Old Nice","🌸 Place Masséna","🌹 Castle Hill","🎨 Matisse Museum","🎨 Chagall Museum","⛪ Russian Cathedral","🛍️ Cours Saleya Market","🌊 Bay of Angels","🏰 Villa Massena","🥗 Salade Niçoise","🥖 Socca","🐟 Bouillabaisse","🐟 Seafood","🍦 Gelato Fenocchio","🍷 Rosé Wine","🍰 Tarte Tropezienne","🥖 Pissaladière"],
      zh:["🏖️ 英国人散步道","🌊 尼斯老城","🌸 马塞纳广场","🌹 城堡山","🎨 马蒂斯博物馆","🎨 夏加尔博物馆","⛪ 俄罗斯东正教堂","🛍️ 萨雷亚市场","🌊 天使湾","🏰 别墅","🥗 尼斯沙拉","🥖 索卡饼","🐟 普罗旺斯鱼汤","🐟 海鲜","🍦 冰淇淋","🍷 桃红葡萄酒","🍰 圣特罗佩塔","🥖 洋葱披萨"],
      ko:["🏖️ 영국인 산책로","🌊 니스 구시가","🌸 마세나 광장","🌹 성곽공원","🎨 마티스 미술관","🎨 샤갈 미술관","⛪ 러시아정교회","🛍️ 사레야 시장","🌊 천사의 만","🏰 빌라 마세나","🥗 니스 샐러드","🥖 소카","🐟 부야베스","🐟 해산물","🍦 젤라토","🍷 로제 와인","🍰 타르트 트로페지엔","🥖 피살라디에르"],
      es:["🏖️ Paseo de los Ingleses","🌊 Niza Vieja","🌸 Plaza Masséna","🌹 Colina del Castillo","🎨 Museo Matisse","🎨 Museo Chagall","⛪ Catedral Rusa","🛍️ Mercado Saleya","🌊 Bahía Ángeles","🏰 Villa Masséna","🥗 Ensalada Niçoise","🥖 Socca","🐟 Bouillabaisse","🐟 Mariscos","🍦 Helado","🍷 Vino Rosado","🍰 Tarta Tropezienne","🥖 Pissaladière"],
      pt:["🏖️ Promenade des Anglais","🌊 Nice Velha","🌸 Praça Masséna","🌹 Colina do Castelo","🎨 Museu Matisse","🎨 Museu Chagall","⛪ Catedral Russa","🛍️ Mercado Saleya","🌊 Baía dos Anjos","🏰 Villa Masséna","🥗 Salada Niçoise","🥖 Socca","🐟 Bouillabaisse","🐟 Frutos do Mar","🍦 Gelato","🍷 Vinho Rosé","🍰 Torta Tropezienne","🥖 Pissaladière"]
    },
    リヨン:{
      ja:["⛪ ノートルダム・ド・フルヴィエール","🏛️ リヨン旧市街","🎭 ギニョール劇場","🛍️ レ・アル・ポール・ボキューズ","🌉 ベルクール広場","🏛️ リヨン美術館","🌹 テット・ドール公園","🎬 リュミエール博物館","⛪ サン・ジャン大聖堂","🏘️ トラブール","🍲 リヨン風サラダ","🥩 アンドゥイエット","🥘 クネル","🍲 ブション料理","🧀 セルヴェル・ド・カニュ","🍷 ボージョレー","🍰 タルト・プラリネ","🍫 ベルナション"],
      en:["⛪ Basilica Fourvière","🏛️ Old Lyon","🎭 Guignol Theater","🛍️ Les Halles Bocuse","🌉 Place Bellecour","🏛️ Lyon Fine Arts","🌹 Parc Tête d'Or","🎬 Lumière Museum","⛪ Saint-Jean Cathedral","🏘️ Traboules","🍲 Lyonnaise Salad","🥩 Andouillette","🥘 Quenelle","🍲 Bouchon Cuisine","🧀 Cervelle de Canut","🍷 Beaujolais","🍰 Tarte Praline","🍫 Bernachon"],
      zh:["⛪ 富维耶圣母院","🏛️ 里昂老城","🎭 木偶剧场","🛍️ 博古斯市场","🌉 白莱果广场","🏛️ 里昂美术馆","🌹 金头公园","🎬 卢米埃尔博物馆","⛪ 圣让大教堂","🏘️ 暗道","🍲 里昂沙拉","🥩 内脏肠","🥘 鱼丸","🍲 里昂小酒馆料理","🧀 鲜奶酪","🍷 博若莱","🍰 杏仁塔","🍫 巧克力"],
      ko:["⛪ 푸르비에르 대성당","🏛️ 리옹 구시가","🎭 기뇰 극장","🛍️ 보퀴즈 시장","🌉 벨쿠르 광장","🏛️ 리옹 미술관","🌹 황금 머리 공원","🎬 뤼미에르 박물관","⛪ 생장 대성당","🏘️ 트라불","🍲 리옹 샐러드","🥩 앙두이예트","🥘 크넬","🍲 부숑 요리","🧀 세르벨 드 카뉘","🍷 보졸레","🍰 프랄린 타르트","🍫 베르나숑"],
      es:["⛪ Basílica Fourvière","🏛️ Lyon Antiguo","🎭 Teatro Guignol","🛍️ Les Halles Bocuse","🌉 Plaza Bellecour","🏛️ Bellas Artes","🌹 Parque Tête d'Or","🎬 Museo Lumière","⛪ Catedral Saint-Jean","🏘️ Traboules","🍲 Ensalada Lyonesa","🥩 Andouillette","🥘 Quenelle","🍲 Cocina Bouchon","🧀 Cervelle de Canut","🍷 Beaujolais","🍰 Tarta Praliné","🍫 Bernachon"],
      pt:["⛪ Basílica Fourvière","🏛️ Lyon Antiga","🎭 Teatro Guignol","🛍️ Les Halles Bocuse","🌉 Praça Bellecour","🏛️ Belas Artes","🌹 Parque Tête d'Or","🎬 Museu Lumière","⛪ Catedral Saint-Jean","🏘️ Traboules","🍲 Salada Lyonesa","🥩 Andouillette","🥘 Quenelle","🍲 Cozinha Bouchon","🧀 Cervelle de Canut","🍷 Beaujolais","🍰 Torta Praliné","🍫 Bernachon"]
    },
    マルセイユ:{
      ja:["⛪ ノートルダム・ド・ラ・ガルド","🏰 マルセイユ旧港","🏛️ MuCEM(欧州地中海文明博物館)","🏰 イフ島","🌊 カランク国立公園","⛪ マルセイユ大聖堂","🎨 ロンシャン宮","🛍️ ノアイユ市場","🏘️ パニエ地区","🌅 コルニッシュ","🐟 ブイヤベース","🥖 パスティス","🐟 シーフード","🐙 タコのプロヴァンサル","🍰 ナヴェット","🍷 プロヴァンスワイン","🧀 山羊チーズ","🌿 ハーブ・ド・プロヴァンス"],
      en:["⛪ Notre-Dame de la Garde","🏰 Vieux Port","🏛️ MuCEM","🏰 Château d'If","🌊 Calanques","⛪ Marseille Cathedral","🎨 Palais Longchamp","🛍️ Noailles Market","🏘️ Le Panier","🌅 Corniche","🐟 Bouillabaisse","🥖 Pastis","🐟 Seafood","🐙 Provençal Octopus","🍰 Navette","🍷 Provence Wine","🧀 Goat Cheese","🌿 Herbes de Provence"],
      zh:["⛪ 守护圣母圣殿","🏰 老港","🏛️ 欧洲地中海博物馆","🏰 伊夫城堡","🌊 卡兰格","⛪ 马赛大教堂","🎨 隆尚宫","🛍️ 诺阿耶市场","🏘️ 巴尼耶街区","🌅 海岸大道","🐟 普罗旺斯鱼汤","🥖 茴香酒","🐟 海鲜","🐙 章鱼","🍰 船型饼干","🍷 普罗旺斯葡萄酒","🧀 山羊奶酪","🌿 普罗旺斯香草"],
      ko:["⛪ 노트르담 드 라 가르드","🏰 구항구","🏛️ MuCEM","🏰 이프성","🌊 칼랑크","⛪ 마르세유 대성당","🎨 롱샹 궁전","🛍️ 노아유 시장","🏘️ 파니에","🌅 코르니슈","🐟 부야베스","🥖 파스티스","🐟 해산물","🐙 문어","🍰 나베트","🍷 프로방스 와인","🧀 염소치즈","🌿 프로방스 허브"],
      es:["⛪ Notre-Dame de la Garde","🏰 Puerto Viejo","🏛️ MuCEM","🏰 Château d'If","🌊 Calanques","⛪ Catedral Marsella","🎨 Palacio Longchamp","🛍️ Mercado Noailles","🏘️ Le Panier","🌅 Corniche","🐟 Bouillabaisse","🥖 Pastis","🐟 Mariscos","🐙 Pulpo","🍰 Navette","🍷 Vino Provenza","🧀 Queso Cabra","🌿 Hierbas Provenza"],
      pt:["⛪ Notre-Dame de la Garde","🏰 Porto Velho","🏛️ MuCEM","🏰 Château d'If","🌊 Calanques","⛪ Catedral Marselha","🎨 Palácio Longchamp","🛍️ Mercado Noailles","🏘️ Le Panier","🌅 Corniche","🐟 Bouillabaisse","🥖 Pastis","🐟 Frutos do Mar","🐙 Polvo","🍰 Navette","🍷 Vinho Provença","🧀 Queijo Cabra","🌿 Ervas Provença"]
    },
    ボルドー:{
      ja:["🍷 ラ・シテ・デュ・ヴァン","⛪ サン・タンドレ大聖堂","🏛️ ガロンヌ川","🌊 水鏡","🏛️ ボルドー美術館","🌳 公共庭園","🎭 ボルドー大劇場","🍷 サンテミリオン(郊外)","🏰 メドック地方ワインシャトー","🛍️ サン・カトリーヌ通り","🍷 ボルドーワイン","🥖 カヌレ","🦪 アルカションの牡蠣","🥩 アントルコート","🍰 ボルドー菓子","🥚 オムレツ・サンテミリオネーズ","🐟 シーフード","🧀 フランスチーズ"],
      en:["🍷 La Cité du Vin","⛪ Saint-André Cathedral","🏛️ Garonne River","🌊 Miroir d'Eau","🏛️ Fine Arts Museum","🌳 Public Garden","🎭 Grand Théâtre","🍷 Saint-Émilion","🏰 Médoc Châteaux","🛍️ Rue Sainte-Catherine","🍷 Bordeaux Wine","🥖 Canelé","🦪 Arcachon Oysters","🥩 Entrecôte","🍰 Bordeaux Pastry","🥚 Omelette Saint-Émilion","🐟 Seafood","🧀 French Cheese"],
      zh:["🍷 葡萄酒之城","⛪ 圣安德烈大教堂","🏛️ 加龙河","🌊 水镜","🏛️ 美术博物馆","🌳 公共花园","🎭 大剧院","🍷 圣埃米利永","🏰 梅多克酒庄","🛍️ 圣凯瑟琳街","🍷 波尔多葡萄酒","🥖 可丽露","🦪 阿尔卡雄牡蛎","🥩 牛排","🍰 波尔多甜点","🥚 煎蛋卷","🐟 海鲜","🧀 法国奶酪"],
      ko:["🍷 와인의 도시","⛪ 생탕드레 대성당","🏛️ 가론강","🌊 물의 거울","🏛️ 미술관","🌳 공공정원","🎭 그랑 테아트르","🍷 생테밀리옹","🏰 메독 와인성","🛍️ 생트카트린 거리","🍷 보르도 와인","🥖 카눌레","🦪 아르카숑 굴","🥩 앙트르코트","🍰 보르도 과자","🥚 오믈렛","🐟 해산물","🧀 프랑스 치즈"],
      es:["🍷 La Cité du Vin","⛪ Catedral Saint-André","🏛️ Río Garona","🌊 Espejo de Agua","🏛️ Bellas Artes","🌳 Jardín Público","🎭 Grand Théâtre","🍷 Saint-Émilion","🏰 Châteaux Médoc","🛍️ Rue Sainte-Catherine","🍷 Vino Bordeaux","🥖 Canelé","🦪 Ostras Arcachon","🥩 Entrecôte","🍰 Repostería","🥚 Tortilla","🐟 Mariscos","🧀 Queso Francés"],
      pt:["🍷 La Cité du Vin","⛪ Catedral Saint-André","🏛️ Rio Garona","🌊 Espelho d'Água","🏛️ Belas Artes","🌳 Jardim Público","🎭 Grand Théâtre","🍷 Saint-Émilion","🏰 Châteaux Médoc","🛍️ Rua Sainte-Catherine","🍷 Vinho Bordeaux","🥖 Canelé","🦪 Ostras Arcachon","🥩 Entrecôte","🍰 Doces","🥚 Omelete","🐟 Frutos do Mar","🧀 Queijo Francês"]
    },
    ストラスブール:{
      ja:["⛪ ストラスブール大聖堂","🏘️ プティット・フランス","🛶 イル川クルーズ","🏛️ 欧州議会","🛍️ クレベール広場","🎄 クリスマスマーケット","⛪ サン・トマ教会","🏛️ アルザス博物館","🍻 ジビエ地区","🏛️ ロアン宮殿","🥨 プレッツェル","🍲 シュークルート","🍝 タルト・フランベ","🍷 アルザスワイン","🍻 アルザスビール","🍰 クグロフ","🥧 ベッコフ","🧀 ミュンスターチーズ"],
      en:["⛪ Strasbourg Cathedral","🏘️ Petite France","🛶 Ill River Cruise","🏛️ European Parliament","🛍️ Place Kléber","🎄 Christmas Market","⛪ St. Thomas Church","🏛️ Alsace Museum","🍻 Gibier District","🏛️ Palais Rohan","🥨 Bretzel","🍲 Choucroute","🍝 Tarte Flambée","🍷 Alsace Wine","🍻 Alsace Beer","🍰 Kugelhopf","🥧 Baeckeoffe","🧀 Munster Cheese"],
      zh:["⛪ 斯特拉斯堡大教堂","🏘️ 小法国","🛶 伊尔河游船","🏛️ 欧洲议会","🛍️ 克勒贝尔广场","🎄 圣诞市场","⛪ 圣托马斯教堂","🏛️ 阿尔萨斯博物馆","🍻 吉比耶街区","🏛️ 罗昂宫","🥨 椒盐卷饼","🍲 酸菜","🍝 火焰薄饼","🍷 阿尔萨斯葡萄酒","🍻 阿尔萨斯啤酒","🍰 咕咕霍夫","🥧 烤箱炖肉","🧀 明斯特奶酪"],
      ko:["⛪ 스트라스부르 대성당","🏘️ 쁘띠 프랑스","🛶 일 강 크루즈","🏛️ 유럽 의회","🛍️ 클레베르 광장","🎄 크리스마스 마켓","⛪ 생토마 교회","🏛️ 알자스 박물관","🍻 지비에 지구","🏛️ 로앙 궁전","🥨 프레첼","🍲 슈크루트","🍝 타르트 플람베","🍷 알자스 와인","🍻 알자스 맥주","🍰 쿠겔호프","🥧 베코프","🧀 뮌스터 치즈"],
      es:["⛪ Catedral Estrasburgo","🏘️ Petite France","🛶 Crucero Ill","🏛️ Parlamento Europeo","🛍️ Plaza Kléber","🎄 Mercado Navidad","⛪ Iglesia St. Thomas","🏛️ Museo Alsacia","🍻 Distrito Gibier","🏛️ Palacio Rohan","🥨 Bretzel","🍲 Choucroute","🍝 Tarte Flambée","🍷 Vino Alsacia","🍻 Cerveza Alsacia","🍰 Kugelhopf","🥧 Baeckeoffe","🧀 Queso Munster"],
      pt:["⛪ Catedral Estrasburgo","🏘️ Petite France","🛶 Cruzeiro Ill","🏛️ Parlamento Europeu","🛍️ Praça Kléber","🎄 Mercado Natal","⛪ Igreja São Tomás","🏛️ Museu Alsácia","🍻 Distrito Gibier","🏛️ Palácio Rohan","🥨 Bretzel","🍲 Choucroute","🍝 Tarte Flambée","🍷 Vinho Alsácia","🍻 Cerveja Alsácia","🍰 Kugelhopf","🥧 Baeckeoffe","🧀 Queijo Munster"]
    },
    モンペリエ:{
      ja:["🏛️ ペイルー広場","⛪ サン・ピエール大聖堂","🌳 植物園","🎨 ファーブル美術館","🛍️ コメディ広場","🏰 凱旋門(モンペリエ)","🏛️ アンティゴーヌ地区","🌊 パラヴァ・レ・フロ海岸","🏛️ 旧市街","🏘️ エキュッソン地区","🐌 エスカルゴ","🐟 シーフード","🥗 サラダ","🍷 ラングドックワイン","🥖 ブリオッシュ","🧀 ロックフォール","🦪 牡蠣","🍰 オクシタニア菓子"],
      en:["🏛️ Place du Peyrou","⛪ Saint-Pierre Cathedral","🌳 Botanical Garden","🎨 Musée Fabre","🛍️ Place de la Comédie","🏰 Arc de Triomphe","🏛️ Antigone District","🌊 Palavas Beach","🏛️ Old Town","🏘️ Écusson District","🐌 Escargot","🐟 Seafood","🥗 Salad","🍷 Languedoc Wine","🥖 Brioche","🧀 Roquefort","🦪 Oysters","🍰 Occitan Pastry"],
      zh:["🏛️ 佩鲁广场","⛪ 圣彼得大教堂","🌳 植物园","🎨 法布尔博物馆","🛍️ 喜剧广场","🏰 凯旋门","🏛️ 安提戈涅区","🌊 帕拉瓦海滩","🏛️ 老城","🏘️ 老城中心","🐌 蜗牛","🐟 海鲜","🥗 沙拉","🍷 朗格多克葡萄酒","🥖 布里欧修","🧀 罗克福奶酪","🦪 牡蛎","🍰 奥克西塔尼亚甜点"],
      ko:["🏛️ 페이루 광장","⛪ 생피에르 대성당","🌳 식물원","🎨 파브르 미술관","🛍️ 코미디 광장","🏰 개선문","🏛️ 안티곤","🌊 팔라바 해변","🏛️ 구시가","🏘️ 에퀴송","🐌 에스카르고","🐟 해산물","🥗 샐러드","🍷 랑그도크 와인","🥖 브리오슈","🧀 로크포르","🦪 굴","🍰 옥시타니아 과자"],
      es:["🏛️ Plaza Peyrou","⛪ Catedral San Pedro","🌳 Jardín Botánico","🎨 Museo Fabre","🛍️ Plaza Comedia","🏰 Arco Triunfo","🏛️ Antigone","🌊 Playa Palavas","🏛️ Casco Antiguo","🏘️ Écusson","🐌 Caracoles","🐟 Mariscos","🥗 Ensalada","🍷 Vino Languedoc","🥖 Brioche","🧀 Roquefort","🦪 Ostras","🍰 Repostería Occitana"],
      pt:["🏛️ Praça Peyrou","⛪ Catedral São Pedro","🌳 Jardim Botânico","🎨 Museu Fabre","🛍️ Praça Comédia","🏰 Arco Triunfo","🏛️ Antigone","🌊 Praia Palavas","🏛️ Cidade Velha","🏘️ Écusson","🐌 Caracóis","🐟 Frutos do Mar","🥗 Salada","🍷 Vinho Languedoc","🥖 Brioche","🧀 Roquefort","🦪 Ostras","🍰 Doces Occitanos"]
    },
    ナント:{
      ja:["🏰 ブルターニュ公爵城","⛪ サン・ピエール・サン・ポール大聖堂","🎡 機械仕掛けの島(レ・マシーン)","🌳 植物園","🌉 ノートルダム・ド・ボン・ポール","🛍️ パッサージュ・ポムレ","🎨 ナント美術館","🌊 エルドル川","🏛️ ナント歴史博物館","🍫 LU(ル)タワー","🥞 クレープ","🥞 ガレット","🍶 ミュスカデ(白ワイン)","🍪 LUビスケット","🦪 牡蠣","🐟 シーフード","🧈 塩バター飴","🍰 ガトー・ナンテ"],
      en:["🏰 Château des Ducs","⛪ Saints-Peter-Paul Cathedral","🎡 Machines de l'Île","🌳 Botanical Garden","🌉 Notre-Dame","🛍️ Passage Pommeraye","🎨 Nantes Museum","🌊 Erdre River","🏛️ History Museum","🍫 LU Tower","🥞 Crêpe","🥞 Galette","🍶 Muscadet Wine","🍪 LU Biscuit","🦪 Oysters","🐟 Seafood","🧈 Salted Caramel","🍰 Gâteau Nantais"],
      zh:["🏰 布列塔尼公爵城堡","⛪ 圣彼得圣保罗大教堂","🎡 机械岛","🌳 植物园","🌉 圣母","🛍️ 波莫雷拱廊","🎨 南特博物馆","🌊 埃尔德尔河","🏛️ 历史博物馆","🍫 LU塔","🥞 法式薄饼","🥞 荞麦薄饼","🍶 慕思卡德白酒","🍪 LU饼干","🦪 牡蛎","🐟 海鲜","🧈 咸黄油糖","🍰 南特蛋糕"],
      ko:["🏰 브르타뉴 공작성","⛪ 생피에르 대성당","🎡 기계의 섬","🌳 식물원","🌉 노트르담","🛍️ 포메레 패시지","🎨 낭트 미술관","🌊 에르드르 강","🏛️ 역사박물관","🍫 LU 타워","🥞 크레프","🥞 갈레트","🍶 뮈스카데","🍪 LU 비스킷","🦪 굴","🐟 해산물","🧈 솔티드 카라멜","🍰 갸토 낭테"],
      es:["🏰 Castillo Duques","⛪ Catedral Saint-Pierre","🎡 Machines de l'Île","🌳 Jardín Botánico","🌉 Notre-Dame","🛍️ Pasaje Pommeraye","🎨 Museo Nantes","🌊 Río Erdre","🏛️ Museo Historia","🍫 Torre LU","🥞 Crêpe","🥞 Galette","🍶 Muscadet","🍪 Galleta LU","🦪 Ostras","🐟 Mariscos","🧈 Caramelo Salado","🍰 Gâteau Nantais"],
      pt:["🏰 Castelo Duques","⛪ Catedral Saint-Pierre","🎡 Machines de l'Île","🌳 Jardim Botânico","🌉 Notre-Dame","🛍️ Passagem Pommeraye","🎨 Museu Nantes","🌊 Rio Erdre","🏛️ Museu História","🍫 Torre LU","🥞 Crêpe","🥞 Galette","🍶 Muscadet","🍪 Biscoito LU","🦪 Ostras","🐟 Frutos do Mar","🧈 Caramelo Salgado","🍰 Gâteau Nantais"]
    },
    ロンドン:{
      ja:["🕰️ ビッグベン(国会議事堂)","🏛️ 大英博物館","🏰 ロンドン塔","🌉 タワーブリッジ","💒 ウェストミンスター寺院","🏰 バッキンガム宮殿","🎢 ロンドンアイ","🎨 ナショナルギャラリー","🏛️ V&A博物館","🛍️ コヴェントガーデン","🍟 フィッシュアンドチップス","🍰 アフタヌーンティー","🥧 ミートパイ","🍳 イングリッシュブレックファスト","🥧 シェパーズパイ","🍷 ピムス","☕ ミルクティー","🥩 サンデーロースト"],
      en:["🕰️ Big Ben","🏛️ British Museum","🏰 Tower of London","🌉 Tower Bridge","💒 Westminster Abbey","🏰 Buckingham Palace","🎢 London Eye","🎨 National Gallery","🏛️ V&A Museum","🛍️ Covent Garden","🍟 Fish & Chips","🍰 Afternoon Tea","🥧 Meat Pie","🍳 English Breakfast","🥧 Shepherd's Pie","🍷 Pimm's","☕ Milk Tea","🥩 Sunday Roast"],
      zh:["🕰️ 大本钟","🏛️ 大英博物馆","🏰 伦敦塔","🌉 塔桥","💒 威斯敏斯特教堂","🏰 白金汉宫","🎢 伦敦眼","🎨 国家美术馆","🏛️ V&A博物馆","🛍️ 柯文特花园","🍟 炸鱼薯条","🍰 下午茶","🥧 肉派","🍳 英式早餐","🥧 牧羊人派","🍷 皮姆酒","☕ 奶茶","🥩 周日烤肉"],
      ko:["🕰️ 빅벤","🏛️ 대영박물관","🏰 런던탑","🌉 타워브리지","💒 웨스트민스터 사원","🏰 버킹엄 궁전","🎢 런던아이","🎨 국립미술관","🏛️ V&A 박물관","🛍️ 코벤트가든","🍟 피쉬앤칩스","🍰 애프터눈티","🥧 미트파이","🍳 잉글리시 브랙퍼스트","🥧 셰퍼드 파이","🍷 핌스","☕ 밀크티","🥩 선데이 로스트"],
      es:["🕰️ Big Ben","🏛️ Museo Británico","🏰 Torre de Londres","🌉 Tower Bridge","💒 Abadía Westminster","🏰 Palacio Buckingham","🎢 London Eye","🎨 Galería Nacional","🏛️ Museo V&A","🛍️ Covent Garden","🍟 Fish & Chips","🍰 Té de la Tarde","🥧 Pastel Carne","🍳 Desayuno Inglés","🥧 Pastel Pastor","🍷 Pimm's","☕ Té con Leche","🥩 Asado Domingo"],
      pt:["🕰️ Big Ben","🏛️ Museu Britânico","🏰 Torre de Londres","🌉 Tower Bridge","💒 Abadia Westminster","🏰 Palácio Buckingham","🎢 London Eye","🎨 Galeria Nacional","🏛️ Museu V&A","🛍️ Covent Garden","🍟 Fish & Chips","🍰 Chá da Tarde","🥧 Torta Carne","🍳 Café Inglês","🥧 Torta Pastor","🍷 Pimm's","☕ Chá com Leite","🥩 Assado Domingo"]
    },
    マンチェスター:{
      ja:["🏟️ オールド・トラフォード","🏟️ エティハドスタジアム","🏛️ マンチェスター美術館","🎵 ピープルズヒストリーミュージアム","⛪ マンチェスター大聖堂","🏛️ サイエンス・産業博物館","🛍️ アーンデールセンター","🏛️ ジョンライランズ図書館","🌳 ヒートン公園","🎭 ロイヤルエクスチェンジ劇場","🍻 マンチェスターパブ","🍟 フィッシュアンドチップス","🥩 ランカシャー・ホットポット","🥧 ミートパイ","☕ ブレックウェル茶","🍻 クラフトビール","🍰 エクレス・ケーキ","🍻 ボディントンズ"],
      en:["🏟️ Old Trafford","🏟️ Etihad Stadium","🏛️ Manchester Art Gallery","🎵 People's History Museum","⛪ Manchester Cathedral","🏛️ Science & Industry Museum","🛍️ Arndale Centre","🏛️ John Rylands Library","🌳 Heaton Park","🎭 Royal Exchange Theatre","🍻 Manchester Pub","🍟 Fish & Chips","🥩 Lancashire Hotpot","🥧 Meat Pie","☕ Brew Tea","🍻 Craft Beer","🍰 Eccles Cake","🍻 Boddingtons"],
      zh:["🏟️ 老特拉福德","🏟️ 伊蒂哈德球场","🏛️ 曼彻斯特美术馆","🎵 人民历史博物馆","⛪ 曼彻斯特大教堂","🏛️ 科学工业博物馆","🛍️ 阿恩代尔购物中心","🏛️ 约翰赖兰兹图书馆","🌳 希顿公园","🎭 皇家交易所剧院","🍻 曼彻斯特酒吧","🍟 炸鱼薯条","🥩 兰开夏炖肉","🥧 肉派","☕ 茶","🍻 精酿啤酒","🍰 葡萄干蛋糕","🍻 博丁顿啤酒"],
      ko:["🏟️ 올드 트래포드","🏟️ 에티하드","🏛️ 맨체스터 미술관","🎵 인민역사박물관","⛪ 맨체스터 대성당","🏛️ 과학산업박물관","🛍️ 아른데일","🏛️ 존라이랜즈","🌳 히튼 공원","🎭 로열익스체인지","🍻 펍","🍟 피쉬앤칩스","🥩 랭커셔 핫팟","🥧 미트파이","☕ 차","🍻 크래프트 비어","🍰 에클스 케이크","🍻 보딩턴스"],
      es:["🏟️ Old Trafford","🏟️ Etihad","🏛️ Galería Arte","🎵 Historia Popular","⛪ Catedral Manchester","🏛️ Ciencia e Industria","🛍️ Arndale","🏛️ John Rylands","🌳 Parque Heaton","🎭 Royal Exchange","🍻 Pub Manchester","🍟 Fish & Chips","🥩 Lancashire Hotpot","🥧 Pastel","☕ Té","🍻 Cerveza Artesanal","🍰 Eccles Cake","🍻 Boddingtons"],
      pt:["🏟️ Old Trafford","🏟️ Etihad","🏛️ Galeria de Arte","🎵 História Popular","⛪ Catedral Manchester","🏛️ Ciência e Indústria","🛍️ Arndale","🏛️ John Rylands","🌳 Parque Heaton","🎭 Royal Exchange","🍻 Pub","🍟 Fish & Chips","🥩 Lancashire Hotpot","🥧 Torta","☕ Chá","🍻 Cerveja Artesanal","🍰 Eccles Cake","🍻 Boddingtons"]
    },
    エディンバラ:{
      ja:["🏰 エディンバラ城","🏛️ ホリールード宮殿","🛣️ ロイヤルマイル","⛪ セント・ジャイルズ大聖堂","🏔️ アーサーズシート","🏛️ スコットランド国立博物館","🎨 スコットランド国立美術館","🏛️ カールトンヒル","🛍️ プリンセスストリート","🎭 エディンバラフェスティバル","🥩 ハギス","🥩 スコッチビーフ","🍳 スコティッシュブレックファスト","🥃 スコッチウイスキー","🍰 ショートブレッド","🐟 サーモン","🍰 クラナハン","🍻 スコットランドエール"],
      en:["🏰 Edinburgh Castle","🏛️ Holyrood Palace","🛣️ Royal Mile","⛪ St. Giles' Cathedral","🏔️ Arthur's Seat","🏛️ National Museum Scotland","🎨 Scottish National Gallery","🏛️ Calton Hill","🛍️ Princes Street","🎭 Edinburgh Festival","🥩 Haggis","🥩 Scotch Beef","🍳 Scottish Breakfast","🥃 Scotch Whisky","🍰 Shortbread","🐟 Salmon","🍰 Cranachan","🍻 Scottish Ale"],
      zh:["🏰 爱丁堡城堡","🏛️ 荷里路德宫","🛣️ 皇家大道","⛪ 圣吉尔斯大教堂","🏔️ 亚瑟王座","🏛️ 苏格兰国家博物馆","🎨 苏格兰国家美术馆","🏛️ 卡尔顿山","🛍️ 王子街","🎭 爱丁堡艺术节","🥩 哈吉斯","🥩 苏格兰牛肉","🍳 苏格兰早餐","🥃 苏格兰威士忌","🍰 黄油酥饼","🐟 三文鱼","🍰 克兰那汉","🍻 苏格兰艾尔啤酒"],
      ko:["🏰 에든버러성","🏛️ 홀리루드 궁전","🛣️ 로열 마일","⛪ 세인트 자일스 대성당","🏔️ 아서의 자리","🏛️ 스코틀랜드 박물관","🎨 스코틀랜드 미술관","🏛️ 칼튼힐","🛍️ 프린세스 스트리트","🎭 에든버러 페스티벌","🥩 해기스","🥩 스코틀랜드 소고기","🍳 스코틀랜드 아침","🥃 스카치위스키","🍰 쇼트브레드","🐟 연어","🍰 크라나칸","🍻 스코틀랜드 에일"],
      es:["🏰 Castillo Edimburgo","🏛️ Palacio Holyrood","🛣️ Royal Mile","⛪ Catedral St. Giles","🏔️ Arthur's Seat","🏛️ Museo Nacional","🎨 Galería Nacional","🏛️ Calton Hill","🛍️ Princes Street","🎭 Festival Edimburgo","🥩 Haggis","🥩 Scotch Beef","🍳 Desayuno Escocés","🥃 Whisky Escocés","🍰 Shortbread","🐟 Salmón","🍰 Cranachan","🍻 Cerveza Escocesa"],
      pt:["🏰 Castelo Edimburgo","🏛️ Palácio Holyrood","🛣️ Royal Mile","⛪ Catedral St. Giles","🏔️ Arthur's Seat","🏛️ Museu Nacional","🎨 Galeria Nacional","🏛️ Calton Hill","🛍️ Princes Street","🎭 Festival Edimburgo","🥩 Haggis","🥩 Scotch Beef","🍳 Café Escocês","🥃 Whisky Escocês","🍰 Shortbread","🐟 Salmão","🍰 Cranachan","🍻 Cerveja Escocesa"]
    },
    バーミンガム:{
      ja:["🏛️ シンフォニーホール","🏛️ バーミンガム美術館","🛍️ ブルリングショッピングセンター","🏛️ シーライフセンター","🏰 アストン・ホール","🌳 カノンヒル公園","🛍️ ジュエリー地区","🏛️ シンクタンク科学博物館","🎭 バーミンガム・ヒッポドローム","⛪ セント・フィリップ大聖堂","🍛 バーミンガム・バルティ","🥧 ポーク・パイ","🍟 フィッシュアンドチップス","🍳 イングリッシュブレックファスト","🍰 アフタヌーンティー","🍻 エール","🍫 キャドバリー","🥩 ステーキ"],
      en:["🏛️ Symphony Hall","🏛️ Birmingham Museum","🛍️ Bullring Shopping","🏛️ Sea Life Centre","🏰 Aston Hall","🌳 Cannon Hill Park","🛍️ Jewellery Quarter","🏛️ Thinktank Science","🎭 Hippodrome Theatre","⛪ St. Philip's Cathedral","🍛 Birmingham Balti","🥧 Pork Pie","🍟 Fish & Chips","🍳 English Breakfast","🍰 Afternoon Tea","🍻 Ale","🍫 Cadbury Chocolate","🥩 Steak"],
      zh:["🏛️ 交响乐厅","🏛️ 伯明翰博物馆","🛍️ 斗牛场购物中心","🏛️ 海洋生物中心","🏰 阿斯顿厅","🌳 大炮山公园","🛍️ 珠宝区","🏛️ 智库科学博物馆","🎭 伯明翰剧院","⛪ 圣菲利普大教堂","🍛 伯明翰咖喱","🥧 猪肉派","🍟 炸鱼薯条","🍳 英式早餐","🍰 下午茶","🍻 艾尔啤酒","🍫 吉百利巧克力","🥩 牛排"],
      ko:["🏛️ 심포니홀","🏛️ 버밍엄 박물관","🛍️ 불링","🏛️ 씨라이프 센터","🏰 애스턴홀","🌳 캐논힐 공원","🛍️ 주얼리 지구","🏛️ 씽크탱크 과학","🎭 히포드롬","⛪ 세인트 필립스","🍛 버밍엄 발티","🥧 포크파이","🍟 피쉬앤칩스","🍳 잉글리시 브랙퍼스트","🍰 애프터눈티","🍻 에일","🍫 캐드버리 초콜릿","🥩 스테이크"],
      es:["🏛️ Symphony Hall","🏛️ Museo Birmingham","🛍️ Bullring","🏛️ Sea Life","🏰 Aston Hall","🌳 Parque Cannon Hill","🛍️ Barrio Joyería","🏛️ Thinktank","🎭 Hippodrome","⛪ Catedral St. Philip","🍛 Birmingham Balti","🥧 Pork Pie","🍟 Fish & Chips","🍳 Desayuno Inglés","🍰 Té de la Tarde","🍻 Cerveza Ale","🍫 Cadbury","🥩 Bistec"],
      pt:["🏛️ Symphony Hall","🏛️ Museu Birmingham","🛍️ Bullring","🏛️ Sea Life","🏰 Aston Hall","🌳 Parque Cannon Hill","🛍️ Bairro Joalheria","🏛️ Thinktank","🎭 Hippodrome","⛪ Catedral St. Philip","🍛 Birmingham Balti","🥧 Pork Pie","🍟 Fish & Chips","🍳 Café Inglês","🍰 Chá da Tarde","🍻 Cerveja Ale","🍫 Cadbury","🥩 Bife"]
    },
    リバプール:{
      ja:["🎵 ビートルズ・ストーリー","🎵 キャヴァーン・クラブ","🎵 ストロベリーフィールズ","🏟️ アンフィールド","🏟️ グディソン・パーク","🏛️ リバプール大聖堂","🏛️ アルバート・ドック","🎨 テート・リバプール","🛍️ リバプール・ワン","🌊 マージー川フェリー","🍟 フィッシュアンドチップス","🍞 スカウス・シチュー","🥧 ステーキ・パイ","🥩 サンデーロースト","🍰 ビクトリアスポンジ","🍻 ローカルエール","☕ ティー","🥩 ローストビーフ"],
      en:["🎵 Beatles Story","🎵 Cavern Club","🎵 Strawberry Field","🏟️ Anfield","🏟️ Goodison Park","🏛️ Liverpool Cathedral","🏛️ Albert Dock","🎨 Tate Liverpool","🛍️ Liverpool ONE","🌊 Mersey Ferry","🍟 Fish & Chips","🍞 Scouse Stew","🥧 Steak Pie","🥩 Sunday Roast","🍰 Victoria Sponge","🍻 Local Ale","☕ Tea","🥩 Roast Beef"],
      zh:["🎵 披头士故事","🎵 洞穴俱乐部","🎵 草莓园","🏟️ 安菲尔德","🏟️ 古迪逊公园","🏛️ 利物浦大教堂","🏛️ 阿尔伯特码头","🎨 泰特利物浦","🛍️ 利物浦一号","🌊 梅西河渡船","🍟 炸鱼薯条","🍞 斯考斯炖菜","🥧 牛排派","🥩 周日烤肉","🍰 维多利亚海绵蛋糕","🍻 当地艾尔","☕ 茶","🥩 烤牛肉"],
      ko:["🎵 비틀즈 스토리","🎵 캐번 클럽","🎵 스트로베리 필드","🏟️ 안필드","🏟️ 구디슨 파크","🏛️ 리버풀 대성당","🏛️ 앨버트 독","🎨 테이트 리버풀","🛍️ 리버풀 원","🌊 머지 페리","🍟 피쉬앤칩스","🍞 스카우스","🥧 스테이크 파이","🥩 선데이 로스트","🍰 빅토리아 스폰지","🍻 로컬 에일","☕ 차","🥩 로스트 비프"],
      es:["🎵 Beatles Story","🎵 Cavern Club","🎵 Strawberry Field","🏟️ Anfield","🏟️ Goodison Park","🏛️ Catedral Liverpool","🏛️ Albert Dock","🎨 Tate Liverpool","🛍️ Liverpool ONE","🌊 Ferry Mersey","🍟 Fish & Chips","🍞 Scouse","🥧 Pastel Carne","🥩 Asado Domingo","🍰 Victoria Sponge","🍻 Ale Local","☕ Té","🥩 Roast Beef"],
      pt:["🎵 Beatles Story","🎵 Cavern Club","🎵 Strawberry Field","🏟️ Anfield","🏟️ Goodison Park","🏛️ Catedral Liverpool","🏛️ Albert Dock","🎨 Tate Liverpool","🛍️ Liverpool ONE","🌊 Ferry Mersey","🍟 Fish & Chips","🍞 Scouse","🥧 Torta Carne","🥩 Assado Domingo","🍰 Victoria Sponge","🍻 Cerveja Local","☕ Chá","🥩 Roast Beef"]
    },
    ブリストル:{
      ja:["🌉 クリフトン吊り橋","🏛️ ブリストル動物園","🏛️ SS Great Britain","🏛️ ブリストル大聖堂","🏛️ M Shed博物館","🛍️ カボット・サーカス","🎨 ブリストル美術館","🏰 ブリストル城公園","🎈 気球フェスティバル","🎨 バンクシー作品(ストリート)","🍟 フィッシュアンドチップス","🧀 チェダーチーズ","🥩 サンデーロースト","🍰 ブリストルバン","🍻 サイダー","🍞 西部料理","🥧 ポークパイ","🍫 ブリストルチョコレート"],
      en:["🌉 Clifton Suspension Bridge","🏛️ Bristol Zoo","🏛️ SS Great Britain","🏛️ Bristol Cathedral","🏛️ M Shed Museum","🛍️ Cabot Circus","🎨 Bristol Museum","🏰 Bristol Castle Park","🎈 Balloon Festival","🎨 Banksy Street Art","🍟 Fish & Chips","🧀 Cheddar Cheese","🥩 Sunday Roast","🍰 Bristol Bun","🍻 Cider","🍞 West Country Food","🥧 Pork Pie","🍫 Bristol Chocolate"],
      zh:["🌉 克利夫顿吊桥","🏛️ 布里斯托动物园","🏛️ 大不列颠号","🏛️ 布里斯托大教堂","🏛️ M Shed博物馆","🛍️ 卡博特环","🎨 布里斯托博物馆","🏰 城堡公园","🎈 气球节","🎨 班克西街头艺术","🍟 炸鱼薯条","🧀 切达奶酪","🥩 周日烤肉","🍰 布里斯托面包","🍻 苹果酒","🍞 西部料理","🥧 猪肉派","🍫 巧克力"],
      ko:["🌉 클리프턴 다리","🏛️ 브리스톨 동물원","🏛️ SS 그레이트 브리튼","🏛️ 브리스톨 대성당","🏛️ M Shed","🛍️ 카봇 서커스","🎨 브리스톨 미술관","🏰 캐슬 파크","🎈 풍선축제","🎨 뱅크시","🍟 피쉬앤칩스","🧀 체다 치즈","🥩 선데이 로스트","🍰 브리스톨 번","🍻 사이다","🍞 서부요리","🥧 포크파이","🍫 초콜릿"],
      es:["🌉 Puente Clifton","🏛️ Zoo Bristol","🏛️ SS Great Britain","🏛️ Catedral Bristol","🏛️ M Shed","🛍️ Cabot Circus","🎨 Museo Bristol","🏰 Castle Park","🎈 Festival Globos","🎨 Banksy","🍟 Fish & Chips","🧀 Queso Cheddar","🥩 Asado Domingo","🍰 Bristol Bun","🍻 Sidra","🍞 Cocina Oeste","🥧 Pork Pie","🍫 Chocolate"],
      pt:["🌉 Ponte Clifton","🏛️ Zoo Bristol","🏛️ SS Great Britain","🏛️ Catedral Bristol","🏛️ M Shed","🛍️ Cabot Circus","🎨 Museu Bristol","🏰 Castle Park","🎈 Festival Balões","🎨 Banksy","🍟 Fish & Chips","🧀 Queijo Cheddar","🥩 Assado Domingo","🍰 Bristol Bun","🍻 Cidra","🍞 Cozinha Oeste","🥧 Pork Pie","🍫 Chocolate"]
    },
    オックスフォード:{
      ja:["🏛️ オックスフォード大学","🏛️ クライスト・チャーチ","🏛️ ボドリアン図書館","🏛️ アシュモレアン博物館","🏛️ シェルドニアン劇場","🏰 オックスフォード城","🌉 ため息の橋","🌳 ユニバーシティパーク","⛪ クライストチャーチ大聖堂","🛍️ コーンマーケット","🍟 フィッシュアンドチップス","🍰 アフタヌーンティー","🥩 サンデーロースト","🍻 オックスフォードエール","☕ オックスフォードティー","🥧 ポークパイ","🍰 オックスフォードソーセージ","🥩 ロースト料理"],
      en:["🏛️ Oxford University","🏛️ Christ Church","🏛️ Bodleian Library","🏛️ Ashmolean Museum","🏛️ Sheldonian Theatre","🏰 Oxford Castle","🌉 Bridge of Sighs","🌳 University Parks","⛪ Christ Church Cathedral","🛍️ Cornmarket Street","🍟 Fish & Chips","🍰 Afternoon Tea","🥩 Sunday Roast","🍻 Oxford Ale","☕ Oxford Tea","🥧 Pork Pie","🍰 Oxford Sausage","🥩 Roast"],
      zh:["🏛️ 牛津大学","🏛️ 基督教会学院","🏛️ 博德利图书馆","🏛️ 阿什莫尔博物馆","🏛️ 谢尔登剧院","🏰 牛津城堡","🌉 叹息桥","🌳 大学公园","⛪ 基督教会大教堂","🛍️ 玉米市场街","🍟 炸鱼薯条","🍰 下午茶","🥩 周日烤肉","🍻 牛津艾尔","☕ 牛津茶","🥧 猪肉派","🍰 牛津香肠","🥩 烤肉"],
      ko:["🏛️ 옥스퍼드 대학","🏛️ 크라이스트 처치","🏛️ 보들리언 도서관","🏛️ 애슈몰린 박물관","🏛️ 셸도니언 극장","🏰 옥스퍼드 성","🌉 한숨의 다리","🌳 대학 공원","⛪ 크라이스트 처치","🛍️ 콘마켓","🍟 피쉬앤칩스","🍰 애프터눈티","🥩 선데이 로스트","🍻 옥스퍼드 에일","☕ 옥스퍼드 차","🥧 포크파이","🍰 옥스퍼드 소시지","🥩 로스트"],
      es:["🏛️ Universidad Oxford","🏛️ Christ Church","🏛️ Bodleian","🏛️ Ashmolean","🏛️ Sheldonian","🏰 Castillo Oxford","🌉 Puente Suspiros","🌳 Parques Universidad","⛪ Catedral Christ Church","🛍️ Cornmarket","🍟 Fish & Chips","🍰 Té Tarde","🥩 Asado Domingo","🍻 Oxford Ale","☕ Té Oxford","🥧 Pork Pie","🍰 Oxford Sausage","🥩 Asado"],
      pt:["🏛️ Universidade Oxford","🏛️ Christ Church","🏛️ Bodleian","🏛️ Ashmolean","🏛️ Sheldonian","🏰 Castelo Oxford","🌉 Ponte Suspiros","🌳 Parques","⛪ Catedral Christ Church","🛍️ Cornmarket","🍟 Fish & Chips","🍰 Chá da Tarde","🥩 Assado","🍻 Oxford Ale","☕ Chá Oxford","🥧 Pork Pie","🍰 Oxford Sausage","🥩 Assado"]
    },
    ケンブリッジ:{
      ja:["🏛️ ケンブリッジ大学","🏛️ キングスカレッジ","🛶 パンティング(ケム川)","🏛️ フィッツウィリアム博物館","🌳 ケンブリッジ植物園","🏛️ トリニティカレッジ","🌉 数学の橋","🌉 ため息の橋","⛪ キングスカレッジ・チャペル","🛍️ マーケットスクエア","🍟 フィッシュアンドチップス","🍰 アフタヌーンティー","🥩 サンデーロースト","🍻 ケンブリッジエール","☕ 紅茶","🥧 ミートパイ","🍰 ジャム・ロリーポリー","🐟 鱒料理"],
      en:["🏛️ Cambridge University","🏛️ King's College","🛶 Punting on Cam","🏛️ Fitzwilliam Museum","🌳 Botanic Garden","🏛️ Trinity College","🌉 Mathematical Bridge","🌉 Bridge of Sighs","⛪ King's College Chapel","🛍️ Market Square","🍟 Fish & Chips","🍰 Afternoon Tea","🥩 Sunday Roast","🍻 Cambridge Ale","☕ Tea","🥧 Meat Pie","🍰 Jam Roly-Poly","🐟 Trout Dishes"],
      zh:["🏛️ 剑桥大学","🏛️ 国王学院","🛶 撑篙","🏛️ 菲茨威廉博物馆","🌳 植物园","🏛️ 三一学院","🌉 数学桥","🌉 叹息桥","⛪ 国王学院礼拜堂","🛍️ 市集广场","🍟 炸鱼薯条","🍰 下午茶","🥩 周日烤肉","🍻 剑桥艾尔","☕ 红茶","🥧 肉派","🍰 果酱卷","🐟 鳟鱼料理"],
      ko:["🏛️ 케임브리지 대학","🏛️ 킹스 칼리지","🛶 펀팅","🏛️ 피츠윌리엄 박물관","🌳 식물원","🏛️ 트리니티 칼리지","🌉 수학의 다리","🌉 한숨의 다리","⛪ 킹스 칼리지 채플","🛍️ 마켓 스퀘어","🍟 피쉬앤칩스","🍰 애프터눈티","🥩 선데이 로스트","🍻 케임브리지 에일","☕ 차","🥧 미트파이","🍰 잼 롤리폴리","🐟 송어요리"],
      es:["🏛️ Universidad Cambridge","🏛️ King's College","🛶 Punting","🏛️ Fitzwilliam","🌳 Jardín Botánico","🏛️ Trinity College","🌉 Puente Matemático","🌉 Puente Suspiros","⛪ King's Chapel","🛍️ Market Square","🍟 Fish & Chips","🍰 Té Tarde","🥩 Asado Domingo","🍻 Cambridge Ale","☕ Té","🥧 Pastel Carne","🍰 Jam Roly-Poly","🐟 Trucha"],
      pt:["🏛️ Universidade Cambridge","🏛️ King's College","🛶 Punting","🏛️ Fitzwilliam","🌳 Jardim Botânico","🏛️ Trinity College","🌉 Ponte Matemática","🌉 Ponte Suspiros","⛪ King's Chapel","🛍️ Market Square","🍟 Fish & Chips","🍰 Chá Tarde","🥩 Assado","🍻 Cambridge Ale","☕ Chá","🥧 Torta Carne","🍰 Jam Roly-Poly","🐟 Truta"]
    },
    ニューヨーク:{
      ja:["🗽 自由の女神","🏙️ エンパイアステートビル","🏛️ メトロポリタン美術館","🎭 タイムズスクエア","🌳 セントラルパーク","🌉 ブルックリン橋","🏛️ MoMA(近代美術館)","🏛️ 9/11メモリアル","🛍️ 5番街","🏛️ ロックフェラーセンター","🍕 NYピザ","🥯 ベーグル","🥪 パストラミサンド","🍰 NYチーズケーキ","🌭 ホットドッグ","🥩 ステーキ","🍳 ブランチ","🍔 ハンバーガー"],
      en:["🗽 Statue of Liberty","🏙️ Empire State Building","🏛️ Metropolitan Museum","🎭 Times Square","🌳 Central Park","🌉 Brooklyn Bridge","🏛️ MoMA","🏛️ 9/11 Memorial","🛍️ Fifth Avenue","🏛️ Rockefeller Center","🍕 NY Pizza","🥯 Bagel","🥪 Pastrami Sandwich","🍰 NY Cheesecake","🌭 Hot Dog","🥩 Steak","🍳 Brunch","🍔 Burger"],
      zh:["🗽 自由女神像","🏙️ 帝国大厦","🏛️ 大都会博物馆","🎭 时代广场","🌳 中央公园","🌉 布鲁克林大桥","🏛️ 现代艺术博物馆","🏛️ 9/11纪念馆","🛍️ 第五大道","🏛️ 洛克菲勒中心","🍕 纽约披萨","🥯 贝果","🥪 熏牛肉三明治","🍰 纽约芝士蛋糕","🌭 热狗","🥩 牛排","🍳 早午餐","🍔 汉堡"],
      ko:["🗽 자유의 여신상","🏙️ 엠파이어스테이트빌딩","🏛️ 메트로폴리탄 미술관","🎭 타임스스퀘어","🌳 센트럴파크","🌉 브루클린 다리","🏛️ MoMA","🏛️ 9/11 메모리얼","🛍️ 5번가","🏛️ 록펠러센터","🍕 뉴욕 피자","🥯 베이글","🥪 파스트라미","🍰 NY 치즈케이크","🌭 핫도그","🥩 스테이크","🍳 브런치","🍔 햄버거"],
      es:["🗽 Estatua de la Libertad","🏙️ Empire State","🏛️ Museo Metropolitano","🎭 Times Square","🌳 Central Park","🌉 Puente Brooklyn","🏛️ MoMA","🏛️ Memorial 9/11","🛍️ Quinta Avenida","🏛️ Rockefeller Center","🍕 Pizza NY","🥯 Bagel","🥪 Pastrami","🍰 Cheesecake NY","🌭 Hot Dog","🥩 Bistec","🍳 Brunch","🍔 Hamburguesa"],
      pt:["🗽 Estátua da Liberdade","🏙️ Empire State","🏛️ Museu Metropolitano","🎭 Times Square","🌳 Central Park","🌉 Ponte Brooklyn","🏛️ MoMA","🏛️ Memorial 9/11","🛍️ Quinta Avenida","🏛️ Rockefeller Center","🍕 Pizza NY","🥯 Bagel","🥪 Pastrami","🍰 Cheesecake NY","🌭 Cachorro-Quente","🥩 Bife","🍳 Brunch","🍔 Hambúrguer"]
    },
    ロサンゼルス:{
      ja:["🎬 ハリウッドサイン","⭐ ハリウッドウォークオブフェイム","🎬 ユニバーサルスタジオ","🌊 サンタモニカピア","🏖️ ベニスビーチ","🎢 ディズニーランド","🎨 ゲッティセンター","🌳 グリフィス天文台","🛍️ ロデオドライブ","🏛️ LACMA","🌮 タコス","🥑 アボカドトースト","🍔 イン・アンド・アウト","🍦 アイスクリーム","🥗 コブサラダ","🍝 シーフード","🍩 ドーナツ","🍺 クラフトビール"],
      en:["🎬 Hollywood Sign","⭐ Walk of Fame","🎬 Universal Studios","🌊 Santa Monica Pier","🏖️ Venice Beach","🎢 Disneyland","🎨 Getty Center","🌳 Griffith Observatory","🛍️ Rodeo Drive","🏛️ LACMA","🌮 Tacos","🥑 Avocado Toast","🍔 In-N-Out","🍦 Ice Cream","🥗 Cobb Salad","🍝 Seafood","🍩 Donuts","🍺 Craft Beer"],
      zh:["🎬 好莱坞标志","⭐ 星光大道","🎬 环球影城","🌊 圣莫尼卡码头","🏖️ 威尼斯海滩","🎢 迪士尼乐园","🎨 盖蒂中心","🌳 格里菲斯天文台","🛍️ 罗迪欧大道","🏛️ 洛杉矶艺术博物馆","🌮 玉米饼","🥑 牛油果吐司","🍔 In-N-Out汉堡","🍦 冰淇淋","🥗 科布沙拉","🍝 海鲜","🍩 甜甜圈","🍺 精酿啤酒"],
      ko:["🎬 할리우드 사인","⭐ 명예의 거리","🎬 유니버설 스튜디오","🌊 산타모니카","🏖️ 베니스비치","🎢 디즈니랜드","🎨 게티 센터","🌳 그리피스 천문대","🛍️ 로데오 드라이브","🏛️ LACMA","🌮 타코","🥑 아보카도 토스트","🍔 인앤아웃","🍦 아이스크림","🥗 콥 샐러드","🍝 해산물","🍩 도넛","🍺 크래프트 비어"],
      es:["🎬 Letrero Hollywood","⭐ Paseo de la Fama","🎬 Universal Studios","🌊 Muelle Santa Monica","🏖️ Venice Beach","🎢 Disneyland","🎨 Getty Center","🌳 Observatorio Griffith","🛍️ Rodeo Drive","🏛️ LACMA","🌮 Tacos","🥑 Tostada Aguacate","🍔 In-N-Out","🍦 Helado","🥗 Ensalada Cobb","🍝 Mariscos","🍩 Donuts","🍺 Cerveza Artesanal"],
      pt:["🎬 Letreiro Hollywood","⭐ Calçada da Fama","🎬 Universal Studios","🌊 Pier Santa Monica","🏖️ Venice Beach","🎢 Disneyland","🎨 Getty Center","🌳 Observatório Griffith","🛍️ Rodeo Drive","🏛️ LACMA","🌮 Tacos","🥑 Torrada Abacate","🍔 In-N-Out","🍦 Sorvete","🥗 Salada Cobb","🍝 Frutos do Mar","🍩 Donuts","🍺 Cerveja Artesanal"]
    },
    シカゴ:{
      ja:["🌆 ウィリスタワー","🪞 クラウドゲート(豆)","🌊 ネイビーピア","🏛️ シカゴ美術館","🏛️ フィールド自然史博物館","🎢 ミレニアムパーク","🌊 シカゴリバークルーズ","🎵 ジャズクラブ","🏟️ リグレーフィールド","🛍️ マグニフィセントマイル","🍕 シカゴディープディッシュピザ","🌭 シカゴホットドッグ","🥪 イタリアンビーフ","🍔 ハンバーガー","🍝 イタリアン料理","🥩 ステーキ","🍻 シカゴクラフトビール","🥧 ピザポップタルト"],
      en:["🌆 Willis Tower","🪞 Cloud Gate (Bean)","🌊 Navy Pier","🏛️ Art Institute","🏛️ Field Museum","🎢 Millennium Park","🌊 Chicago River Cruise","🎵 Jazz Clubs","🏟️ Wrigley Field","🛍️ Magnificent Mile","🍕 Deep Dish Pizza","🌭 Chicago Hot Dog","🥪 Italian Beef","🍔 Burger","🍝 Italian Food","🥩 Steak","🍻 Chicago Craft Beer","🥧 Pop Tart"],
      zh:["🌆 威利斯大厦","🪞 云门(豆子)","🌊 海军码头","🏛️ 芝加哥艺术博物馆","🏛️ 菲尔德博物馆","🎢 千禧公园","🌊 芝加哥河游船","🎵 爵士俱乐部","🏟️ 瑞格利球场","🛍️ 华丽一英里","🍕 深盘披萨","🌭 芝加哥热狗","🥪 意式牛肉三明治","🍔 汉堡","🍝 意大利菜","🥩 牛排","🍻 精酿啤酒","🥧 派"],
      ko:["🌆 윌리스 타워","🪞 클라우드 게이트","🌊 네이비 피어","🏛️ 시카고 미술관","🏛️ 필드 박물관","🎢 밀레니엄 공원","🌊 시카고 강 크루즈","🎵 재즈 클럽","🏟️ 리글리 필드","🛍️ 매그니피센트 마일","🍕 딥디시 피자","🌭 시카고 핫도그","🥪 이탈리안 비프","🍔 햄버거","🍝 이탈리아 요리","🥩 스테이크","🍻 크래프트 비어","🥧 파이"],
      es:["🌆 Willis Tower","🪞 Cloud Gate","🌊 Navy Pier","🏛️ Instituto de Arte","🏛️ Museo Field","🎢 Millennium Park","🌊 Crucero Río","🎵 Jazz","🏟️ Wrigley Field","🛍️ Magnificent Mile","🍕 Pizza Deep Dish","🌭 Hot Dog Chicago","🥪 Italian Beef","🍔 Hamburguesa","🍝 Italiana","🥩 Bistec","🍻 Cerveza Artesanal","🥧 Tarta"],
      pt:["🌆 Willis Tower","🪞 Cloud Gate","🌊 Navy Pier","🏛️ Instituto de Arte","🏛️ Museu Field","🎢 Millennium Park","🌊 Cruzeiro Rio","🎵 Jazz","🏟️ Wrigley Field","🛍️ Magnificent Mile","🍕 Pizza Deep Dish","🌭 Cachorro-Quente","🥪 Italian Beef","🍔 Hambúrguer","🍝 Italiana","🥩 Bife","🍻 Cerveja Artesanal","🥧 Torta"]
    },
    マイアミ:{
      ja:["🏖️ サウスビーチ","🏘️ アールデコ地区","🎨 ウィンウッドウォールズ","🏖️ ベイサイド","🌳 ビスケーン国立公園","🎡 マイアミシーアクエリアム","🏛️ ヴィスカヤ博物館","🚤 マイアミビーチクルーズ","🎭 リトルハバナ","🏖️ キーウェスト","🥪 キューバンサンド","🥙 アロスコンポヨ","🍤 シーフード","🥟 エンパナーダ","🍰 キーライムパイ","🍹 モヒート","🌭 ホットドッグ","🐟 グリル料理"],
      en:["🏖️ South Beach","🏘️ Art Deco District","🎨 Wynwood Walls","🏖️ Bayside","🌳 Biscayne National Park","🎡 Miami Seaquarium","🏛️ Vizcaya Museum","🚤 Miami Cruise","🎭 Little Havana","🏖️ Key West","🥪 Cuban Sandwich","🥙 Arroz con Pollo","🍤 Seafood","🥟 Empanadas","🍰 Key Lime Pie","🍹 Mojito","🌭 Hot Dog","🐟 Grilled Fish"],
      zh:["🏖️ 南海滩","🏘️ 装饰艺术区","🎨 温伍德墙","🏖️ 海湾","🌳 比斯坎国家公园","🎡 迈阿密海洋馆","🏛️ 维斯卡亚博物馆","🚤 迈阿密游船","🎭 小哈瓦那","🏖️ 基韦斯特","🥪 古巴三明治","🥙 鸡饭","🍤 海鲜","🥟 馅饼","🍰 酸橙派","🍹 莫吉托","🌭 热狗","🐟 烤鱼"],
      ko:["🏖️ 사우스 비치","🏘️ 아르데코 지구","🎨 윈우드 월스","🏖️ 베이사이드","🌳 비스케인 국립공원","🎡 마이애미 씨아쿠아리움","🏛️ 비스카야 박물관","🚤 마이애미 크루즈","🎭 리틀 하바나","🏖️ 키웨스트","🥪 쿠바 샌드위치","🥙 아로스 콘 포요","🍤 해산물","🥟 엠파나다","🍰 키 라임 파이","🍹 모히토","🌭 핫도그","🐟 그릴 생선"],
      es:["🏖️ South Beach","🏘️ Distrito Art Deco","🎨 Wynwood Walls","🏖️ Bayside","🌳 Biscayne","🎡 Miami Seaquarium","🏛️ Museo Vizcaya","🚤 Crucero Miami","🎭 Little Havana","🏖️ Key West","🥪 Sándwich Cubano","🥙 Arroz con Pollo","🍤 Mariscos","🥟 Empanadas","🍰 Key Lime Pie","🍹 Mojito","🌭 Hot Dog","🐟 Pescado Asado"],
      pt:["🏖️ South Beach","🏘️ Art Deco","🎨 Wynwood","🏖️ Bayside","🌳 Biscayne","🎡 Seaquarium","🏛️ Museu Vizcaya","🚤 Cruzeiro","🎭 Little Havana","🏖️ Key West","🥪 Sanduíche Cubano","🥙 Arroz com Frango","🍤 Frutos do Mar","🥟 Empanadas","🍰 Key Lime Pie","🍹 Mojito","🌭 Cachorro-Quente","🐟 Peixe Grelhado"]
    },
    サンフランシスコ:{
      ja:["🌉 ゴールデンゲートブリッジ","🏝️ アルカトラズ島","🚋 ケーブルカー","🌊 フィッシャーマンズワーフ","🏯 チャイナタウン","🎨 ピア39","🌳 ゴールデンゲートパーク","🛍️ ユニオンスクエア","🎨 SFMOMA","🌉 ベイブリッジ","🦀 ダンジネスクラブ","🍞 サワードウブレッド","🍫 ギラデリチョコレート","🥖 クラムチャウダーボウル","🍣 寿司","🌮 タコス","🍕 ピザ","🍷 カリフォルニアワイン"],
      en:["🌉 Golden Gate Bridge","🏝️ Alcatraz Island","🚋 Cable Car","🌊 Fisherman's Wharf","🏯 Chinatown","🎨 Pier 39","🌳 Golden Gate Park","🛍️ Union Square","🎨 SFMOMA","🌉 Bay Bridge","🦀 Dungeness Crab","🍞 Sourdough Bread","🍫 Ghirardelli Chocolate","🥖 Clam Chowder Bowl","🍣 Sushi","🌮 Tacos","🍕 Pizza","🍷 California Wine"],
      zh:["🌉 金门大桥","🏝️ 恶魔岛","🚋 缆车","🌊 渔人码头","🏯 唐人街","🎨 39号码头","🌳 金门公园","🛍️ 联合广场","🎨 SFMOMA","🌉 海湾大桥","🦀 珍宝蟹","🍞 酸面包","🍫 吉拉德利巧克力","🥖 蛤蜊汤碗","🍣 寿司","🌮 玉米饼","🍕 披萨","🍷 加州葡萄酒"],
      ko:["🌉 골든게이트브릿지","🏝️ 알카트라즈","🚋 케이블카","🌊 피셔맨스 워프","🏯 차이나타운","🎨 피어 39","🌳 골든게이트 공원","🛍️ 유니언 스퀘어","🎨 SFMOMA","🌉 베이 브리지","🦀 던지니스 크랩","🍞 사워도우","🍫 기라델리","🥖 클램차우더","🍣 스시","🌮 타코","🍕 피자","🍷 캘리포니아 와인"],
      es:["🌉 Golden Gate","🏝️ Alcatraz","🚋 Tranvía","🌊 Fisherman's Wharf","🏯 Chinatown","🎨 Pier 39","🌳 Golden Gate Park","🛍️ Union Square","🎨 SFMOMA","🌉 Bay Bridge","🦀 Cangrejo Dungeness","🍞 Pan Sourdough","🍫 Ghirardelli","🥖 Clam Chowder","🍣 Sushi","🌮 Tacos","🍕 Pizza","🍷 Vino California"],
      pt:["🌉 Golden Gate","🏝️ Alcatraz","🚋 Bonde","🌊 Fisherman's Wharf","🏯 Chinatown","🎨 Pier 39","🌳 Golden Gate Park","🛍️ Union Square","🎨 SFMOMA","🌉 Bay Bridge","🦀 Caranguejo","🍞 Pão Sourdough","🍫 Ghirardelli","🥖 Clam Chowder","🍣 Sushi","🌮 Tacos","🍕 Pizza","🍷 Vinho Califórnia"]
    },
    ラスベガス:{
      ja:["🎰 ベラージオ噴水","🏛️ ストリップ大通り","🎢 ストラトスフィアタワー","🏛️ シーザーズパレス","🎭 シルク・ドゥ・ソレイユ","🏔️ グランドキャニオン","🎰 フリーモントストリート","🌳 レッドロックキャニオン","💧 フーバーダム","🎰 カジノ","🍷 ビュッフェ","🥩 ステーキハウス","🍤 シーフード","🥖 イタリアン","🍔 ハンバーガー","🌮 タコス","🍣 寿司","🍰 ベラージオパティスリー"],
      en:["🎰 Bellagio Fountains","🏛️ Las Vegas Strip","🎢 Stratosphere Tower","🏛️ Caesars Palace","🎭 Cirque du Soleil","🏔️ Grand Canyon","🎰 Fremont Street","🌳 Red Rock Canyon","💧 Hoover Dam","🎰 Casino","🍷 Buffet","🥩 Steakhouse","🍤 Seafood","🥖 Italian","🍔 Burger","🌮 Tacos","🍣 Sushi","🍰 Bellagio Patisserie"],
      zh:["🎰 百乐宫喷泉","🏛️ 拉斯维加斯大道","🎢 同温层塔","🏛️ 凯撒宫","🎭 太阳马戏团","🏔️ 大峡谷","🎰 弗里蒙特街","🌳 红岩峡谷","💧 胡佛大坝","🎰 赌场","🍷 自助餐","🥩 牛排馆","🍤 海鲜","🥖 意大利菜","🍔 汉堡","🌮 玉米饼","🍣 寿司","🍰 糕点"],
      ko:["🎰 벨라지오 분수","🏛️ 라스베이거스 스트립","🎢 스트라토스피어","🏛️ 시저스 팰리스","🎭 시르크 뒤 솔레유","🏔️ 그랜드캐니언","🎰 프리몬트 거리","🌳 레드 록 캐니언","💧 후버 댐","🎰 카지노","🍷 뷔페","🥩 스테이크하우스","🍤 해산물","🥖 이탈리안","🍔 햄버거","🌮 타코","🍣 스시","🍰 벨라지오 파티세리"],
      es:["🎰 Fuentes Bellagio","🏛️ Strip Las Vegas","🎢 Stratosphere","🏛️ Caesars Palace","🎭 Cirque du Soleil","🏔️ Gran Cañón","🎰 Fremont Street","🌳 Red Rock","💧 Presa Hoover","🎰 Casino","🍷 Buffet","🥩 Steakhouse","🍤 Mariscos","🥖 Italiana","🍔 Hamburguesa","🌮 Tacos","🍣 Sushi","🍰 Pastelería"],
      pt:["🎰 Fontes Bellagio","🏛️ Las Vegas Strip","🎢 Stratosphere","🏛️ Caesars Palace","🎭 Cirque du Soleil","🏔️ Grand Canyon","🎰 Fremont Street","🌳 Red Rock","💧 Represa Hoover","🎰 Cassino","🍷 Buffet","🥩 Steakhouse","🍤 Frutos do Mar","🥖 Italiana","🍔 Hambúrguer","🌮 Tacos","🍣 Sushi","🍰 Patisserie"]
    },
    "ワシントンD.C.":{
      ja:["🏛️ ホワイトハウス","🗽 リンカーン記念堂","🏛️ ワシントン記念塔","🏛️ 国会議事堂","🏛️ スミソニアン博物館群","🏛️ 航空宇宙博物館","🏛️ アーリントン墓地","🏛️ 国立公文書館","🌸 ナショナルモール","🌸 桜の名所(タイダルベイスン)","🥪 サンドイッチ","🥩 ステーキ","🦀 メリーランドクラブケーキ","🍔 ハンバーガー","🍕 ピザ","🍝 イタリアン","🌮 タコス","🍻 クラフトビール"],
      en:["🏛️ White House","🗽 Lincoln Memorial","🏛️ Washington Monument","🏛️ US Capitol","🏛️ Smithsonian Museums","🏛️ Air & Space Museum","🏛️ Arlington Cemetery","🏛️ National Archives","🌸 National Mall","🌸 Cherry Blossom (Tidal Basin)","🥪 Sandwich","🥩 Steak","🦀 Maryland Crab Cake","🍔 Burger","🍕 Pizza","🍝 Italian","🌮 Tacos","🍻 Craft Beer"],
      zh:["🏛️ 白宫","🗽 林肯纪念堂","🏛️ 华盛顿纪念碑","🏛️ 国会大厦","🏛️ 史密森博物馆","🏛️ 航空航天博物馆","🏛️ 阿灵顿公墓","🏛️ 国家档案馆","🌸 国家广场","🌸 樱花","🥪 三明治","🥩 牛排","🦀 马里兰蟹饼","🍔 汉堡","🍕 披萨","🍝 意大利菜","🌮 玉米饼","🍻 精酿啤酒"],
      ko:["🏛️ 백악관","🗽 링컨 기념관","🏛️ 워싱턴 기념탑","🏛️ 국회의사당","🏛️ 스미스소니언","🏛️ 항공우주박물관","🏛️ 알링턴 묘지","🏛️ 국립문서기록보관관","🌸 내셔널 몰","🌸 벚꽃","🥪 샌드위치","🥩 스테이크","🦀 메릴랜드 크랩케이크","🍔 햄버거","🍕 피자","🍝 이탈리안","🌮 타코","🍻 크래프트 비어"],
      es:["🏛️ Casa Blanca","🗽 Lincoln Memorial","🏛️ Monumento Washington","🏛️ Capitolio","🏛️ Smithsonian","🏛️ Air & Space","🏛️ Arlington","🏛️ Archivos Nacionales","🌸 National Mall","🌸 Cerezos","🥪 Sándwich","🥩 Bistec","🦀 Maryland Crab Cake","🍔 Hamburguesa","🍕 Pizza","🍝 Italiana","🌮 Tacos","🍻 Cerveza Artesanal"],
      pt:["🏛️ Casa Branca","🗽 Lincoln Memorial","🏛️ Monumento Washington","🏛️ Capitólio","🏛️ Smithsonian","🏛️ Air & Space","🏛️ Arlington","🏛️ Arquivos Nacionais","🌸 National Mall","🌸 Cerejeiras","🥪 Sanduíche","🥩 Bife","🦀 Maryland Crab Cake","🍔 Hambúrguer","🍕 Pizza","🍝 Italiana","🌮 Tacos","🍻 Cerveja Artesanal"]
    },
    ボストン:{
      ja:["🏛️ フリーダムトレイル","🏛️ ボストンコモン","⛪ オールドノースチャーチ","🚢 USSコンスティテューション","🏛️ ハーバード大学","🏛️ MIT","🏛️ ファニエルホール","🏛️ ボストン美術館","🏟️ フェンウェイパーク","🌳 パブリックガーデン","🦞 ロブスターロール","🥣 クラムチャウダー","🐟 シーフード","🍔 ハンバーガー","🍰 ボストンクリームパイ","🍝 イタリアン(ノースエンド)","🍻 サミュエルアダムス","🥖 ベーグル"],
      en:["🏛️ Freedom Trail","🏛️ Boston Common","⛪ Old North Church","🚢 USS Constitution","🏛️ Harvard University","🏛️ MIT","🏛️ Faneuil Hall","🏛️ Museum of Fine Arts","🏟️ Fenway Park","🌳 Public Garden","🦞 Lobster Roll","🥣 Clam Chowder","🐟 Seafood","🍔 Burger","🍰 Boston Cream Pie","🍝 Italian (North End)","🍻 Samuel Adams","🥖 Bagel"],
      zh:["🏛️ 自由之路","🏛️ 波士顿公园","⛪ 老北教堂","🚢 宪法号","🏛️ 哈佛大学","🏛️ 麻省理工","🏛️ 法尼尔厅","🏛️ 美术馆","🏟️ 芬威球场","🌳 公共花园","🦞 龙虾卷","🥣 蛤蜊汤","🐟 海鲜","🍔 汉堡","🍰 波士顿奶油派","🍝 意大利菜","🍻 塞缪尔亚当斯","🥖 贝果"],
      ko:["🏛️ 자유의 길","🏛️ 보스턴 코먼","⛪ 올드 노스 처치","🚢 USS 컨스티튜션","🏛️ 하버드대학","🏛️ MIT","🏛️ 패뉴얼 홀","🏛️ 미술관","🏟️ 펜웨이 파크","🌳 퍼블릭 가든","🦞 랍스터 롤","🥣 클램차우더","🐟 해산물","🍔 햄버거","🍰 보스턴 크림파이","🍝 이탈리안","🍻 사뮤엘 아담스","🥖 베이글"],
      es:["🏛️ Freedom Trail","🏛️ Boston Common","⛪ Old North Church","🚢 USS Constitution","🏛️ Harvard","🏛️ MIT","🏛️ Faneuil Hall","🏛️ Museo Bellas Artes","🏟️ Fenway Park","🌳 Public Garden","🦞 Lobster Roll","🥣 Clam Chowder","🐟 Mariscos","🍔 Hamburguesa","🍰 Boston Cream Pie","🍝 Italiana","🍻 Samuel Adams","🥖 Bagel"],
      pt:["🏛️ Freedom Trail","🏛️ Boston Common","⛪ Old North Church","🚢 USS Constitution","🏛️ Harvard","🏛️ MIT","🏛️ Faneuil Hall","🏛️ Museu Belas Artes","🏟️ Fenway Park","🌳 Public Garden","🦞 Lobster Roll","🥣 Clam Chowder","🐟 Frutos do Mar","🍔 Hambúrguer","🍰 Boston Cream Pie","🍝 Italiana","🍻 Samuel Adams","🥖 Bagel"]
    },
    シアトル:{
      ja:["🗼 スペースニードル","🏛️ パイクプレイスマーケット","☕ スターバックス1号店","🌊 シアトル水族館","🏛️ ポップカルチャー博物館","🛍️ チフリーガラス博物館","🏛️ シアトル美術館","🏟️ T-モバイルパーク","🌳 ボランティアパーク","🚢 フェリー(ベインブリッジ島)","🦞 シアトルサーモン","☕ シアトルコーヒー","🍔 ハンバーガー","🥣 シーフードチャウダー","🥖 ベーカリー","🍣 寿司","🌮 タコス","🍰 デザート"],
      en:["🗼 Space Needle","🏛️ Pike Place Market","☕ First Starbucks","🌊 Seattle Aquarium","🏛️ MoPOP","🛍️ Chihuly Glass Museum","🏛️ Seattle Art Museum","🏟️ T-Mobile Park","🌳 Volunteer Park","🚢 Ferry (Bainbridge)","🦞 Seattle Salmon","☕ Seattle Coffee","🍔 Burger","🥣 Seafood Chowder","🥖 Bakery","🍣 Sushi","🌮 Tacos","🍰 Dessert"],
      zh:["🗼 太空针塔","🏛️ 派克市场","☕ 星巴克1号店","🌊 西雅图水族馆","🏛️ 流行文化博物馆","🛍️ 奇胡利玻璃博物馆","🏛️ 西雅图艺术博物馆","🏟️ T-Mobile球场","🌳 志愿者公园","🚢 渡轮","🦞 西雅图三文鱼","☕ 西雅图咖啡","🍔 汉堡","🥣 海鲜浓汤","🥖 烘焙","🍣 寿司","🌮 玉米饼","🍰 甜点"],
      ko:["🗼 스페이스 니들","🏛️ 파이크 플레이스","☕ 스타벅스 1호점","🌊 시애틀 수족관","🏛️ MoPOP","🛍️ 치훌리 글래스","🏛️ 시애틀 미술관","🏟️ T-모바일 파크","🌳 발룬티어 공원","🚢 페리","🦞 시애틀 연어","☕ 시애틀 커피","🍔 햄버거","🥣 해산물 차우더","🥖 베이커리","🍣 스시","🌮 타코","🍰 디저트"],
      es:["🗼 Space Needle","🏛️ Pike Place","☕ Primer Starbucks","🌊 Acuario Seattle","🏛️ MoPOP","🛍️ Chihuly","🏛️ Museo Arte","🏟️ T-Mobile Park","🌳 Volunteer Park","🚢 Ferry","🦞 Salmón Seattle","☕ Café Seattle","🍔 Hamburguesa","🥣 Seafood Chowder","🥖 Panadería","🍣 Sushi","🌮 Tacos","🍰 Postre"],
      pt:["🗼 Space Needle","🏛️ Pike Place","☕ Primeiro Starbucks","🌊 Aquário Seattle","🏛️ MoPOP","🛍️ Chihuly","🏛️ Museu Arte","🏟️ T-Mobile Park","🌳 Volunteer Park","🚢 Ferry","🦞 Salmão Seattle","☕ Café Seattle","🍔 Hambúrguer","🥣 Seafood Chowder","🥖 Padaria","🍣 Sushi","🌮 Tacos","🍰 Sobremesa"]
    },
    ニューオーリンズ:{
      ja:["🎷 フレンチクォーター","🎷 バーボンストリート","🏛️ ジャクソン広場","⛪ セントルイス大聖堂","🎭 マルディグラ","🚂 セントチャールズ路面電車","🛒 フレンチマーケット","🎵 プリザベーションホール","🌳 シティパーク","🏛️ WWII博物館","🦞 ガンボ","🦐 ジャンバラヤ","🦪 ポーボーイ","🍩 ベニエ(カフェデュモンド)","🦞 ザリガニ","🥩 ニューオーリンズ料理","🍰 ブレッドプディング","☕ チコリコーヒー"],
      en:["🎷 French Quarter","🎷 Bourbon Street","🏛️ Jackson Square","⛪ St. Louis Cathedral","🎭 Mardi Gras","🚂 St. Charles Streetcar","🛒 French Market","🎵 Preservation Hall","🌳 City Park","🏛️ WWII Museum","🦞 Gumbo","🦐 Jambalaya","🦪 Po' Boy","🍩 Beignet (Café du Monde)","🦞 Crawfish","🥩 Creole Cuisine","🍰 Bread Pudding","☕ Chicory Coffee"],
      zh:["🎷 法国区","🎷 波旁街","🏛️ 杰克逊广场","⛪ 圣路易斯大教堂","🎭 嘉年华","🚂 圣查尔斯电车","🛒 法国市场","🎵 保存厅","🌳 城市公园","🏛️ 二战博物馆","🦞 秋葵浓汤","🦐 什锦饭","🦪 法式三明治","🍩 法式甜甜圈","🦞 小龙虾","🥩 克里奥尔菜","🍰 面包布丁","☕ 菊苣咖啡"],
      ko:["🎷 프렌치 쿼터","🎷 버번 스트리트","🏛️ 잭슨 광장","⛪ 세인트루이스 대성당","🎭 마디그라","🚂 세인트찰스 전차","🛒 프렌치 마켓","🎵 프리저베이션 홀","🌳 시티 파크","🏛️ WWII 박물관","🦞 검보","🦐 잠발라야","🦪 포 보이","🍩 베네","🦞 가재","🥩 크리올 요리","🍰 브레드 푸딩","☕ 치코리 커피"],
      es:["🎷 French Quarter","🎷 Bourbon Street","🏛️ Jackson Square","⛪ Catedral St. Louis","🎭 Mardi Gras","🚂 Tranvía St. Charles","🛒 French Market","🎵 Preservation Hall","🌳 City Park","🏛️ Museo WWII","🦞 Gumbo","🦐 Jambalaya","🦪 Po' Boy","🍩 Beignet","🦞 Cangrejo","🥩 Cocina Criolla","🍰 Pudín","☕ Café Achicoria"],
      pt:["🎷 French Quarter","🎷 Bourbon Street","🏛️ Praça Jackson","⛪ Catedral St. Louis","🎭 Mardi Gras","🚂 Bonde","🛒 French Market","🎵 Preservation Hall","🌳 City Park","🏛️ Museu WWII","🦞 Gumbo","🦐 Jambalaya","🦪 Po' Boy","🍩 Beignet","🦞 Lagostim","🥩 Cozinha Crioula","🍰 Pudim","☕ Café Chicória"]
    },
    トロント:{
      ja:["🗼 CNタワー","🏟️ ロジャースセンター","🏛️ ロイヤルオンタリオ博物館","🎨 アートギャラリーオブオンタリオ","🏝️ トロントアイランド","🛍️ イートンセンター","🏘️ ディスティラリー地区","🌳 ハイパーク","🛍️ ケンジントンマーケット","🏟️ HHL殿堂博物館","🥩 プーティン","🥯 モントリオールベーグル","🥩 ステーキ","🍔 ハンバーガー","🦞 シーフード","🥞 メープルシロップパンケーキ","🍷 アイスワイン","🍻 カナディアンビール"],
      en:["🗼 CN Tower","🏟️ Rogers Centre","🏛️ Royal Ontario Museum","🎨 AGO","🏝️ Toronto Islands","🛍️ Eaton Centre","🏘️ Distillery District","🌳 High Park","🛍️ Kensington Market","🏟️ Hockey Hall of Fame","🥩 Poutine","🥯 Montreal Bagel","🥩 Steak","🍔 Burger","🦞 Seafood","🥞 Maple Syrup Pancake","🍷 Ice Wine","🍻 Canadian Beer"],
      zh:["🗼 CN塔","🏟️ 罗杰斯中心","🏛️ 皇家安大略博物馆","🎨 安大略美术馆","🏝️ 多伦多群岛","🛍️ 伊顿中心","🏘️ 酿酒厂区","🌳 高地公园","🛍️ 肯辛顿市场","🏟️ 冰球名人堂","🥩 普丁","🥯 蒙特利尔贝果","🥩 牛排","🍔 汉堡","🦞 海鲜","🥞 枫糖浆煎饼","🍷 冰酒","🍻 加拿大啤酒"],
      ko:["🗼 CN타워","🏟️ 로저스 센터","🏛️ ROM","🎨 AGO","🏝️ 토론토 아일랜드","🛍️ 이튼 센터","🏘️ 디스틸러리","🌳 하이파크","🛍️ 켄싱턴 마켓","🏟️ 하키 명예의 전당","🥩 푸틴","🥯 몬트리올 베이글","🥩 스테이크","🍔 햄버거","🦞 해산물","🥞 메이플 시럽 팬케이크","🍷 아이스와인","🍻 캐나다 맥주"],
      es:["🗼 CN Tower","🏟️ Rogers Centre","🏛️ Royal Ontario Museum","🎨 AGO","🏝️ Toronto Islands","🛍️ Eaton Centre","🏘️ Distillery District","🌳 High Park","🛍️ Kensington","🏟️ Hockey Hall of Fame","🥩 Poutine","🥯 Bagel Montreal","🥩 Bistec","🍔 Hamburguesa","🦞 Mariscos","🥞 Panqueque Arce","🍷 Ice Wine","🍻 Cerveza Canadiense"],
      pt:["🗼 CN Tower","🏟️ Rogers Centre","🏛️ Royal Ontario Museum","🎨 AGO","🏝️ Toronto Islands","🛍️ Eaton Centre","🏘️ Distillery District","🌳 High Park","🛍️ Kensington","🏟️ Hockey Hall of Fame","🥩 Poutine","🥯 Bagel Montreal","🥩 Bife","🍔 Hambúrguer","🦞 Frutos do Mar","🥞 Panqueca Maple","🍷 Ice Wine","🍻 Cerveja Canadense"]
    },
    バンクーバー:{
      ja:["🌳 スタンレーパーク","🏖️ イングリッシュベイ","🏘️ ガスタウン","🛍️ グランビルアイランド","🏔️ グラウスマウンテン","🏞️ キャピラノ吊り橋","🏛️ バンクーバー美術館","🏝️ ビクトリア(船)","🌊 ロブソン通り","🌲 リン渓谷","🦞 サーモン","🍣 寿司","🥩 プーティン","🍔 ジャパドッグ","🦀 ダンジネスクラブ","🥞 メープルシロップ","🍷 カナダワイン","☕ オーガニックコーヒー"],
      en:["🌳 Stanley Park","🏖️ English Bay","🏘️ Gastown","🛍️ Granville Island","🏔️ Grouse Mountain","🏞️ Capilano Bridge","🏛️ Vancouver Art Gallery","🏝️ Victoria (Ferry)","🌊 Robson Street","🌲 Lynn Canyon","🦞 Salmon","🍣 Sushi","🥩 Poutine","🍔 Japadog","🦀 Dungeness Crab","🥞 Maple Syrup","🍷 Canadian Wine","☕ Organic Coffee"],
      zh:["🌳 史丹利公园","🏖️ 英吉利湾","🏘️ 煤气镇","🛍️ 格兰维尔岛","🏔️ 松鸡山","🏞️ 卡皮拉诺吊桥","🏛️ 温哥华美术馆","🏝️ 维多利亚","🌊 罗布森街","🌲 林恩峡谷","🦞 三文鱼","🍣 寿司","🥩 普丁","🍔 日式热狗","🦀 珍宝蟹","🥞 枫糖浆","🍷 加拿大葡萄酒","☕ 有机咖啡"],
      ko:["🌳 스탠리 공원","🏖️ 잉글리시 베이","🏘️ 개스타운","🛍️ 그랜빌 아일랜드","🏔️ 그라우스 마운틴","🏞️ 캐필라노","🏛️ 밴쿠버 미술관","🏝️ 빅토리아","🌊 롭슨 거리","🌲 린 캐년","🦞 연어","🍣 스시","🥩 푸틴","🍔 자파독","🦀 던지니스 크랩","🥞 메이플 시럽","🍷 캐나다 와인","☕ 유기농 커피"],
      es:["🌳 Stanley Park","🏖️ English Bay","🏘️ Gastown","🛍️ Granville Island","🏔️ Grouse Mountain","🏞️ Capilano","🏛️ Vancouver Art Gallery","🏝️ Victoria","🌊 Robson Street","🌲 Lynn Canyon","🦞 Salmón","🍣 Sushi","🥩 Poutine","🍔 Japadog","🦀 Cangrejo","🥞 Sirope Arce","🍷 Vino Canadiense","☕ Café Orgánico"],
      pt:["🌳 Stanley Park","🏖️ English Bay","🏘️ Gastown","🛍️ Granville Island","🏔️ Grouse Mountain","🏞️ Capilano","🏛️ Vancouver Art Gallery","🏝️ Victoria","🌊 Robson Street","🌲 Lynn Canyon","🦞 Salmão","🍣 Sushi","🥩 Poutine","🍔 Japadog","🦀 Caranguejo","🥞 Xarope Maple","🍷 Vinho Canadense","☕ Café Orgânico"]
    },
    モントリオール:{
      ja:["⛪ ノートルダム大聖堂(モントリオール)","🏘️ 旧市街","🏛️ モントリオール美術館","🌳 モンロワイヤル公園","⛪ サンジョセフ礼拝堂","🏛️ ノートルダム広場","🏛️ オリンピックスタジアム","🌳 ボタニカルガーデン","🛍️ サンドニ通り","🏛️ 旧港(ヴュー・ポール)","🥩 プーティン","🥯 モントリオールベーグル","🥪 スモークミート","🍕 ピザ","🍟 フライドポテト","🥞 ケベックスタイル朝食","🍻 ローカルクラフトビール","🍫 メープル菓子"],
      en:["⛪ Notre-Dame Basilica","🏘️ Old Montreal","🏛️ Montreal Museum of Fine Arts","🌳 Mont Royal Park","⛪ Saint Joseph's Oratory","🏛️ Place d'Armes","🏛️ Olympic Stadium","🌳 Botanical Garden","🛍️ Saint-Denis Street","🏛️ Old Port","🥩 Poutine","🥯 Montreal Bagel","🥪 Smoked Meat","🍕 Pizza","🍟 Fries","🥞 Quebec Breakfast","🍻 Local Craft Beer","🍫 Maple Sweets"],
      zh:["⛪ 蒙特利尔圣母大教堂","🏘️ 老城区","🏛️ 蒙特利尔美术馆","🌳 皇家山公园","⛪ 圣若瑟堂","🏛️ 兵器广场","🏛️ 奥林匹克体育场","🌳 植物园","🛍️ 圣丹尼斯街","🏛️ 旧港","🥩 普丁","🥯 蒙特利尔贝果","🥪 烟熏肉","🍕 披萨","🍟 薯条","🥞 魁北克早餐","🍻 当地精酿","🍫 枫糖糖果"],
      ko:["⛪ 노트르담 대성당","🏘️ 구시가","🏛️ 몬트리올 미술관","🌳 몽 로얄","⛪ 성요셉 성당","🏛️ 다름 광장","🏛️ 올림픽 스타디움","🌳 식물원","🛍️ 생드니","🏛️ 올드 포트","🥩 푸틴","🥯 몬트리올 베이글","🥪 스모크 미트","🍕 피자","🍟 감자튀김","🥞 퀘벡 아침","🍻 로컬 맥주","🍫 메이플 디저트"],
      es:["⛪ Basílica Notre-Dame","🏘️ Vieux-Montréal","🏛️ Museo Bellas Artes","🌳 Monte Royal","⛪ Oratorio St. Joseph","🏛️ Place d'Armes","🏛️ Estadio Olímpico","🌳 Jardín Botánico","🛍️ Saint-Denis","🏛️ Vieux-Port","🥩 Poutine","🥯 Bagel Montreal","🥪 Smoked Meat","🍕 Pizza","🍟 Patatas","🥞 Desayuno Quebec","🍻 Cerveza Local","🍫 Dulces Arce"],
      pt:["⛪ Basílica Notre-Dame","🏘️ Velha Montreal","🏛️ Museu Belas Artes","🌳 Mont Royal","⛪ Oratório St. Joseph","🏛️ Place d'Armes","🏛️ Estádio Olímpico","🌳 Jardim Botânico","🛍️ Saint-Denis","🏛️ Velho Porto","🥩 Poutine","🥯 Bagel Montreal","🥪 Smoked Meat","🍕 Pizza","🍟 Batatas","🥞 Café Quebec","🍻 Cerveja Local","🍫 Doces Maple"]
    },
    カルガリー:{
      ja:["🤠 カルガリースタンピード","🗼 カルガリータワー","🏛️ グレンボウ博物館","🏛️ ヘリテージパーク歴史村","🏟️ サドルドーム","🛍️ スティーブンアベニュー","🌳 プリンスズアイランドパーク","🏛️ TELUS科学博物館","🛍️ チャイナタウン","🏰 オリンピックパーク","🥩 アルバータビーフ","🥩 ステーキ","🥩 プーティン","🍔 ハンバーガー","🥞 パンケーキ","🥪 サンドイッチ","🍷 カナディアンワイン","🍻 ローカルビール"],
      en:["🤠 Calgary Stampede","🗼 Calgary Tower","🏛️ Glenbow Museum","🏛️ Heritage Park","🏟️ Saddledome","🛍️ Stephen Avenue","🌳 Prince's Island","🏛️ TELUS Spark","🛍️ Chinatown","🏰 Olympic Park","🥩 Alberta Beef","🥩 Steak","🥩 Poutine","🍔 Burger","🥞 Pancakes","🥪 Sandwich","🍷 Canadian Wine","🍻 Local Beer"],
      zh:["🤠 卡尔加里牛仔节","🗼 卡尔加里塔","🏛️ 格伦博博物馆","🏛️ 遗产公园","🏟️ 马鞍体育馆","🛍️ 史蒂芬大道","🌳 王子岛公园","🏛️ TELUS科学馆","🛍️ 唐人街","🏰 奥林匹克公园","🥩 阿尔伯塔牛肉","🥩 牛排","🥩 普丁","🍔 汉堡","🥞 煎饼","🥪 三明治","🍷 加拿大葡萄酒","🍻 当地啤酒"],
      ko:["🤠 캘거리 스탬피드","🗼 캘거리 타워","🏛️ 글렌보 박물관","🏛️ 헤리티지 파크","🏟️ 새들돔","🛍️ 스티븐 애비뉴","🌳 프린스 아일랜드","🏛️ TELUS 스파크","🛍️ 차이나타운","🏰 올림픽 파크","🥩 앨버타 비프","🥩 스테이크","🥩 푸틴","🍔 햄버거","🥞 팬케이크","🥪 샌드위치","🍷 캐나다 와인","🍻 로컬 맥주"],
      es:["🤠 Calgary Stampede","🗼 Calgary Tower","🏛️ Glenbow Museum","🏛️ Heritage Park","🏟️ Saddledome","🛍️ Stephen Avenue","🌳 Prince's Island","🏛️ TELUS Spark","🛍️ Chinatown","🏰 Olympic Park","🥩 Alberta Beef","🥩 Bistec","🥩 Poutine","🍔 Hamburguesa","🥞 Panqueques","🥪 Sándwich","🍷 Vino Canadiense","🍻 Cerveza Local"],
      pt:["🤠 Calgary Stampede","🗼 Calgary Tower","🏛️ Glenbow Museum","🏛️ Heritage Park","🏟️ Saddledome","🛍️ Stephen Avenue","🌳 Prince's Island","🏛️ TELUS Spark","🛍️ Chinatown","🏰 Olympic Park","🥩 Carne Alberta","🥩 Bife","🥩 Poutine","🍔 Hambúrguer","🥞 Panquecas","🥪 Sanduíche","🍷 Vinho Canadense","🍻 Cerveja Local"]
    },
    ケベックシティ:{
      ja:["🏰 シャトーフロントナック","🏘️ ケベック旧市街","⛪ ノートルダム大聖堂(ケベック)","🌊 シタデル","🏞️ モンモランシー滝","🛍️ プチシャンプラン通り","🏛️ 文明博物館","🏰 シャンプラン銅像","🌳 戦場公園","🏛️ 旧城壁","🥩 プーティン","🥞 メープルシロップ","🦪 シーフード","🥪 トルティエール","🍞 ケベックパン","🍷 アイスワイン","🍻 ケベックビール","🥧 シュガーパイ"],
      en:["🏰 Château Frontenac","🏘️ Old Quebec","⛪ Notre-Dame de Québec","🌊 La Citadelle","🏞️ Montmorency Falls","🛍️ Petit-Champlain","🏛️ Civilization Museum","🏰 Champlain Statue","🌳 Plains of Abraham","🏛️ Old City Walls","🥩 Poutine","🥞 Maple Syrup","🦪 Seafood","🥪 Tourtière","🍞 Quebec Bread","🍷 Ice Wine","🍻 Quebec Beer","🥧 Sugar Pie"],
      zh:["🏰 弗龙特纳克城堡","🏘️ 魁北克老城","⛪ 圣母大教堂","🌊 城堡","🏞️ 蒙特摩伦西瀑布","🛍️ 小香普兰","🏛️ 文明博物馆","🏰 香普兰雕像","🌳 战场公园","🏛️ 旧城墙","🥩 普丁","🥞 枫糖浆","🦪 海鲜","🥪 肉派","🍞 魁北克面包","🍷 冰酒","🍻 魁北克啤酒","🥧 糖派"],
      ko:["🏰 샤토 프롱트낙","🏘️ 올드 퀘벡","⛪ 노트르담 대성당","🌊 시타델","🏞️ 몽모랑시 폭포","🛍️ 프티 샹플랭","🏛️ 문명박물관","🏰 샹플랭 동상","🌳 아브라함 평원","🏛️ 옛 성벽","🥩 푸틴","🥞 메이플 시럽","🦪 해산물","🥪 투르티에르","🍞 퀘벡 빵","🍷 아이스와인","🍻 퀘벡 맥주","🥧 슈가 파이"],
      es:["🏰 Château Frontenac","🏘️ Vieux-Québec","⛪ Notre-Dame de Québec","🌊 La Citadelle","🏞️ Montmorency","🛍️ Petit-Champlain","🏛️ Museo Civilización","🏰 Estatua Champlain","🌳 Plains of Abraham","🏛️ Murallas","🥩 Poutine","🥞 Sirope Arce","🦪 Mariscos","🥪 Tourtière","🍞 Pan Quebec","🍷 Ice Wine","🍻 Cerveza Quebec","🥧 Sugar Pie"],
      pt:["🏰 Château Frontenac","🏘️ Vieux-Québec","⛪ Notre-Dame de Québec","🌊 La Citadelle","🏞️ Montmorency","🛍️ Petit-Champlain","🏛️ Museu Civilização","🏰 Estátua Champlain","🌳 Plains of Abraham","🏛️ Muralhas","🥩 Poutine","🥞 Xarope Maple","🦪 Frutos do Mar","🥪 Tourtière","🍞 Pão Quebec","🍷 Ice Wine","🍻 Cerveja Quebec","🥧 Sugar Pie"]
    },
    オタワ:{
      ja:["🏛️ 国会議事堂(パーラメントヒル)","🏛️ カナダ歴史博物館","🏛️ カナダ国立美術館","💧 リドー運河","🛍️ バイワードマーケット","🏛️ カナダ戦争博物館","🏛️ カナダ自然博物館","🏛️ カナダ造幣局","🌳 ガティノー公園","🏛️ ナショナルアーカイブ","🥩 プーティン","🍞 ビーバーテール","🥩 ステーキ","🦞 シーフード","🥞 メープルシロップ","🍔 ハンバーガー","🍻 オタワビール","🥪 サンドイッチ"],
      en:["🏛️ Parliament Hill","🏛️ Canadian Museum of History","🏛️ National Gallery","💧 Rideau Canal","🛍️ ByWard Market","🏛️ War Museum","🏛️ Museum of Nature","🏛️ Royal Canadian Mint","🌳 Gatineau Park","🏛️ National Archives","🥩 Poutine","🍞 BeaverTails","🥩 Steak","🦞 Seafood","🥞 Maple Syrup","🍔 Burger","🍻 Ottawa Beer","🥪 Sandwich"],
      zh:["🏛️ 国会山","🏛️ 加拿大历史博物馆","🏛️ 国家美术馆","💧 里多运河","🛍️ 拜沃德市场","🏛️ 战争博物馆","🏛️ 自然博物馆","🏛️ 皇家造币厂","🌳 加蒂诺公园","🏛️ 国家档案馆","🥩 普丁","🍞 海狸尾巴","🥩 牛排","🦞 海鲜","🥞 枫糖浆","🍔 汉堡","🍻 渥太华啤酒","🥪 三明治"],
      ko:["🏛️ 국회의사당","🏛️ 캐나다 역사박물관","🏛️ 국립미술관","💧 리도 운하","🛍️ 바이워드 마켓","🏛️ 전쟁박물관","🏛️ 자연박물관","🏛️ 왕립 조폐국","🌳 가티노 공원","🏛️ 국립문서기록보관관","🥩 푸틴","🍞 비버 테일","🥩 스테이크","🦞 해산물","🥞 메이플 시럽","🍔 햄버거","🍻 오타와 맥주","🥪 샌드위치"],
      es:["🏛️ Parliament Hill","🏛️ Museo Historia","🏛️ National Gallery","💧 Rideau Canal","🛍️ ByWard Market","🏛️ War Museum","🏛️ Museum of Nature","🏛️ Royal Canadian Mint","🌳 Gatineau Park","🏛️ National Archives","🥩 Poutine","🍞 BeaverTails","🥩 Bistec","🦞 Mariscos","🥞 Sirope Arce","🍔 Hamburguesa","🍻 Cerveza Ottawa","🥪 Sándwich"],
      pt:["🏛️ Parliament Hill","🏛️ Museu História","🏛️ National Gallery","💧 Rideau Canal","🛍️ ByWard Market","🏛️ Museu Guerra","🏛️ Museu Natureza","🏛️ Royal Canadian Mint","🌳 Gatineau Park","🏛️ National Archives","🥩 Poutine","🍞 BeaverTails","🥩 Bife","🦞 Frutos do Mar","🥞 Xarope Maple","🍔 Hambúrguer","🍻 Cerveja Ottawa","🥪 Sanduíche"]
    },
    エドモントン:{
      ja:["🛍️ ウェストエドモントンモール","🏛️ アルバータ州議会議事堂","🏛️ 王立アルバータ博物館","🌳 リバーバレー","🎡 ファンタジーランド","🏞️ エルク島国立公園","🏛️ アルバータ美術館","🏟️ ロジャースプレイス","🌳 ミュッタートコンサバトリー","🏛️ 科学博物館","🥩 アルバータビーフ","🥩 ステーキ","🥩 プーティン","🍔 ハンバーガー","🥞 パンケーキ","🥪 サンドイッチ","🍷 カナダワイン","🍻 ローカルビール"],
      en:["🛍️ West Edmonton Mall","🏛️ Alberta Legislature","🏛️ Royal Alberta Museum","🌳 River Valley","🎡 Galaxyland","🏞️ Elk Island National Park","🏛️ Art Gallery of Alberta","🏟️ Rogers Place","🌳 Muttart Conservatory","🏛️ Science Centre","🥩 Alberta Beef","🥩 Steak","🥩 Poutine","🍔 Burger","🥞 Pancakes","🥪 Sandwich","🍷 Canadian Wine","🍻 Local Beer"],
      zh:["🛍️ 西埃德蒙顿购物中心","🏛️ 阿尔伯塔议会大厦","🏛️ 皇家阿尔伯塔博物馆","🌳 河谷","🎡 银河乐园","🏞️ 麋鹿岛国家公园","🏛️ 阿尔伯塔美术馆","🏟️ 罗杰斯广场","🌳 米塔特温室","🏛️ 科学博物馆","🥩 阿尔伯塔牛肉","🥩 牛排","🥩 普丁","🍔 汉堡","🥞 煎饼","🥪 三明治","🍷 加拿大葡萄酒","🍻 当地啤酒"],
      ko:["🛍️ 웨스트 에드먼턴 몰","🏛️ 앨버타 의회","🏛️ 왕립 앨버타 박물관","🌳 리버 밸리","🎡 갤럭시랜드","🏞️ 엘크 아일랜드","🏛️ 앨버타 미술관","🏟️ 로저스 플레이스","🌳 머타트 컨서버토리","🏛️ 과학박물관","🥩 앨버타 비프","🥩 스테이크","🥩 푸틴","🍔 햄버거","🥞 팬케이크","🥪 샌드위치","🍷 캐나다 와인","🍻 로컬 맥주"],
      es:["🛍️ West Edmonton Mall","🏛️ Legislatura","🏛️ Royal Alberta Museum","🌳 River Valley","🎡 Galaxyland","🏞️ Elk Island","🏛️ Art Gallery","🏟️ Rogers Place","🌳 Muttart","🏛️ Science Centre","🥩 Alberta Beef","🥩 Bistec","🥩 Poutine","🍔 Hamburguesa","🥞 Panqueques","🥪 Sándwich","🍷 Vino Canadiense","🍻 Cerveza Local"],
      pt:["🛍️ West Edmonton Mall","🏛️ Legislatura","🏛️ Royal Alberta Museum","🌳 River Valley","🎡 Galaxyland","🏞️ Elk Island","🏛️ Art Gallery","🏟️ Rogers Place","🌳 Muttart","🏛️ Science Centre","🥩 Carne Alberta","🥩 Bife","🥩 Poutine","🍔 Hambúrguer","🥞 Panquecas","🥪 Sanduíche","🍷 Vinho Canadense","🍻 Cerveja Local"]
    },
    ビクトリア:{
      ja:["🏛️ ブリティッシュコロンビア州議会議事堂","🌹 ブッチャートガーデン","🏰 クレイダーロック城","🏛️ ロイヤルBC博物館","🛍️ インナーハーバー","🏛️ エンプレスホテル","🛍️ ベーコンビル","🌳 ビーコンヒル公園","⛪ クライストチャーチ大聖堂","🏝️ ホエールウォッチング","🦞 サーモン","🍣 寿司","🥩 プーティン","🦀 シーフード","🍰 アフタヌーンティー","🍔 ハンバーガー","🍷 BCワイン","🍻 ローカルビール"],
      en:["🏛️ BC Parliament","🌹 Butchart Gardens","🏰 Craigdarroch Castle","🏛️ Royal BC Museum","🛍️ Inner Harbour","🏛️ Empress Hotel","🛍️ Bastion Square","🌳 Beacon Hill Park","⛪ Christ Church Cathedral","🏝️ Whale Watching","🦞 Salmon","🍣 Sushi","🥩 Poutine","🦀 Seafood","🍰 Afternoon Tea","🍔 Burger","🍷 BC Wine","🍻 Local Beer"],
      zh:["🏛️ BC省议会","🌹 布查特花园","🏰 海狸老克城堡","🏛️ 皇家BC博物馆","🛍️ 内港","🏛️ 帝后酒店","🛍️ 巴斯申广场","🌳 灯塔山公园","⛪ 基督堂大教堂","🏝️ 观鲸","🦞 三文鱼","🍣 寿司","🥩 普丁","🦀 海鲜","🍰 下午茶","🍔 汉堡","🍷 BC葡萄酒","🍻 当地啤酒"],
      ko:["🏛️ BC 의회","🌹 부차트 가든","🏰 크레이그다록 성","🏛️ 왕립 BC 박물관","🛍️ 이너 하버","🏛️ 엠프레스 호텔","🛍️ 베이스천 스퀘어","🌳 비콘힐 공원","⛪ 크라이스트 처치","🏝️ 고래 관찰","🦞 연어","🍣 스시","🥩 푸틴","🦀 해산물","🍰 애프터눈티","🍔 햄버거","🍷 BC 와인","🍻 로컬 맥주"],
      es:["🏛️ Parlamento BC","🌹 Butchart Gardens","🏰 Craigdarroch","🏛️ Royal BC Museum","🛍️ Inner Harbour","🏛️ Empress Hotel","🛍️ Bastion Square","🌳 Beacon Hill","⛪ Christ Church","🏝️ Avistamiento Ballenas","🦞 Salmón","🍣 Sushi","🥩 Poutine","🦀 Mariscos","🍰 Té Tarde","🍔 Hamburguesa","🍷 Vino BC","🍻 Cerveza Local"],
      pt:["🏛️ Parlamento BC","🌹 Butchart Gardens","🏰 Craigdarroch","🏛️ Royal BC Museum","🛍️ Inner Harbour","🏛️ Empress Hotel","🛍️ Bastion Square","🌳 Beacon Hill","⛪ Christ Church","🏝️ Observação Baleias","🦞 Salmão","🍣 Sushi","🥩 Poutine","🦀 Frutos do Mar","🍰 Chá Tarde","🍔 Hambúrguer","🍷 Vinho BC","🍻 Cerveja Local"]
    },
    ウィスラー:{
      ja:["🏔️ ウィスラー山","🏔️ ブラッコム山","🚠 ピーク2ピークゴンドラ","⛷️ スキー・スノーボード","🏔️ アルタ湖","🏞️ ガリバルディ州立公園","🛍️ ウィスラービレッジ","🌳 ロストレイク","🎢 ジップライン","🚴 マウンテンバイク","🥩 プーティン","🥩 ステーキ","🥪 サンドイッチ","🥣 シチュー","🍰 メープル菓子","🥞 パンケーキ","🍻 ローカルビール","🍷 カナダワイン"],
      en:["🏔️ Whistler Mountain","🏔️ Blackcomb Mountain","🚠 Peak 2 Peak Gondola","⛷️ Ski & Snowboard","🏔️ Alta Lake","🏞️ Garibaldi Provincial Park","🛍️ Whistler Village","🌳 Lost Lake","🎢 Ziplining","🚴 Mountain Biking","🥩 Poutine","🥩 Steak","🥪 Sandwich","🥣 Stew","🍰 Maple Sweets","🥞 Pancakes","🍻 Local Beer","🍷 Canadian Wine"],
      zh:["🏔️ 惠斯勒山","🏔️ 黑梳山","🚠 峰对峰缆车","⛷️ 滑雪","🏔️ 阿尔塔湖","🏞️ 加里波第省立公园","🛍️ 惠斯勒村","🌳 失落湖","🎢 滑索","🚴 山地自行车","🥩 普丁","🥩 牛排","🥪 三明治","🥣 炖菜","🍰 枫糖糖果","🥞 煎饼","🍻 当地啤酒","🍷 加拿大葡萄酒"],
      ko:["🏔️ 휘슬러산","🏔️ 블랙콤산","🚠 픽투픽 곤돌라","⛷️ 스키","🏔️ 알타 호수","🏞️ 가리발디 공원","🛍️ 휘슬러 빌리지","🌳 로스트 레이크","🎢 짚라인","🚴 산악자전거","🥩 푸틴","🥩 스테이크","🥪 샌드위치","🥣 스튜","🍰 메이플 디저트","🥞 팬케이크","🍻 로컬 맥주","🍷 캐나다 와인"],
      es:["🏔️ Whistler Mountain","🏔️ Blackcomb","🚠 Peak 2 Peak","⛷️ Esquí","🏔️ Alta Lake","🏞️ Garibaldi","🛍️ Whistler Village","🌳 Lost Lake","🎢 Tirolesa","🚴 Mountain Bike","🥩 Poutine","🥩 Bistec","🥪 Sándwich","🥣 Estofado","🍰 Dulces Arce","🥞 Panqueques","🍻 Cerveza Local","🍷 Vino Canadiense"],
      pt:["🏔️ Whistler Mountain","🏔️ Blackcomb","🚠 Peak 2 Peak","⛷️ Esqui","🏔️ Alta Lake","🏞️ Garibaldi","🛍️ Whistler Village","🌳 Lost Lake","🎢 Tirolesa","🚴 Mountain Bike","🥩 Poutine","🥩 Bife","🥪 Sanduíche","🥣 Ensopado","🍰 Doces Maple","🥞 Panquecas","🍻 Cerveja Local","🍷 Vinho Canadense"]
    },
    バンフ:{
      ja:["🏔️ バンフ国立公園","🌊 ルイーズ湖","🌊 モレーン湖","♨️ バンフ温泉","🚠 バンフゴンドラ","🏛️ ホエール川","🦌 野生動物観察","🚂 カナディアンロッキー鉄道","🏔️ 氷河ツアー","🏔️ サルファー山","🥩 アルバータビーフ","🥩 ステーキ","🥩 プーティン","🥩 バイソン肉","🍔 ハンバーガー","🥪 サンドイッチ","🥞 メープルシロップ","🍻 ローカルビール"],
      en:["🏔️ Banff National Park","🌊 Lake Louise","🌊 Moraine Lake","♨️ Banff Hot Springs","🚠 Banff Gondola","🏛️ Bow River","🦌 Wildlife Watching","🚂 Canadian Rockies Train","🏔️ Glacier Tour","🏔️ Sulphur Mountain","🥩 Alberta Beef","🥩 Steak","🥩 Poutine","🥩 Bison Meat","🍔 Burger","🥪 Sandwich","🥞 Maple Syrup","🍻 Local Beer"],
      zh:["🏔️ 班夫国家公园","🌊 路易斯湖","🌊 梦莲湖","♨️ 班夫温泉","🚠 班夫缆车","🏛️ 弓河","🦌 野生动物观察","🚂 加拿大落基山火车","🏔️ 冰川之旅","🏔️ 硫磺山","🥩 阿尔伯塔牛肉","🥩 牛排","🥩 普丁","🥩 野牛肉","🍔 汉堡","🥪 三明治","🥞 枫糖浆","🍻 当地啤酒"],
      ko:["🏔️ 밴프 국립공원","🌊 루이스 호수","🌊 모레인 호수","♨️ 밴프 온천","🚠 밴프 곤돌라","🏛️ 보우 강","🦌 야생동물","🚂 캐나다 록키 기차","🏔️ 빙하 투어","🏔️ 설퍼 마운틴","🥩 앨버타 비프","🥩 스테이크","🥩 푸틴","🥩 바이슨 고기","🍔 햄버거","🥪 샌드위치","🥞 메이플 시럽","🍻 로컬 맥주"],
      es:["🏔️ Banff National Park","🌊 Lake Louise","🌊 Moraine Lake","♨️ Banff Hot Springs","🚠 Banff Gondola","🏛️ Bow River","🦌 Vida Silvestre","🚂 Tren Rockies","🏔️ Tour Glaciar","🏔️ Sulphur Mountain","🥩 Alberta Beef","🥩 Bistec","🥩 Poutine","🥩 Bisonte","🍔 Hamburguesa","🥪 Sándwich","🥞 Sirope Arce","🍻 Cerveza Local"],
      pt:["🏔️ Banff National Park","🌊 Lake Louise","🌊 Moraine Lake","♨️ Banff Hot Springs","🚠 Banff Gondola","🏛️ Bow River","🦌 Vida Selvagem","🚂 Trem Rockies","🏔️ Tour Geleira","🏔️ Sulphur Mountain","🥩 Carne Alberta","🥩 Bife","🥩 Poutine","🥩 Bisão","🍔 Hambúrguer","🥪 Sanduíche","🥞 Xarope Maple","🍻 Cerveja Local"]
    },
    バリ島:{
      ja:["🐒 ウブドモンキーフォレスト","🛕 タナロット寺院","🛕 ウルワツ寺院","🌅 クタビーチ","🏖️ サヌールビーチ","🌾 テガラランライステラス","🛕 ティルタ・エンプル寺院","🌋 キンタマーニ火山","🎭 ケチャダンス","🏖️ ヌサドゥアビーチ","🍚 ナシゴレン","🍢 サテ","🥟 ガドガド","🦆 ベベベトゥトゥ","🍗 ナシチャンプル","🌶️ サンバル","🍰 マルタバ","🥥 ココナッツ"],
      en:["🐒 Monkey Forest","🛕 Tanah Lot","🛕 Uluwatu Temple","🌅 Kuta Beach","🏖️ Sanur Beach","🌾 Tegalalang Rice","🛕 Tirta Empul","🌋 Mt. Batur","🎭 Kecak Dance","🏖️ Nusa Dua","🍚 Nasi Goreng","🍢 Satay","🥟 Gado-Gado","🦆 Bebek Betutu","🍗 Nasi Campur","🌶️ Sambal","🍰 Martabak","🥥 Coconut"],
      zh:["🐒 圣猴森林","🛕 海神庙","🛕 乌鲁瓦图寺","🌅 库塔海滩","🏖️ 沙努尔海滩","🌾 德格拉朗梯田","🛕 圣泉寺","🌋 巴杜尔火山","🎭 凯卡克舞","🏖️ 努沙杜瓦","🍚 印尼炒饭","🍢 沙嗲","🥟 加多加多","🦆 烤鸭","🍗 巴厘风饭","🌶️ 桑巴酱","🍰 千层馅饼","🥥 椰子"],
      ko:["🐒 우붓 원숭이숲","🛕 따나롯 사원","🛕 울루와뚜","🌅 꾸따 비치","🏖️ 사누르 비치","🌾 떼갈랄랑","🛕 띠르따 엠뿔","🌋 바뚜르 화산","🎭 케착 댄스","🏖️ 누사두아","🍚 나시고렝","🍢 사떼","🥟 가도가도","🦆 베벡 베뚜뚜","🍗 나시참뿌르","🌶️ 삼발","🍰 마르따박","🥥 코코넛"],
      es:["🐒 Bosque Monos","🛕 Tanah Lot","🛕 Uluwatu","🌅 Playa Kuta","🏖️ Sanur","🌾 Arrozales Tegalalang","🛕 Tirta Empul","🌋 Mt. Batur","🎭 Danza Kecak","🏖️ Nusa Dua","🍚 Nasi Goreng","🍢 Satay","🥟 Gado-Gado","🦆 Pato Asado","🍗 Nasi Campur","🌶️ Sambal","🍰 Martabak","🥥 Coco"],
      pt:["🐒 Floresta Macacos","🛕 Tanah Lot","🛕 Uluwatu","🌅 Praia Kuta","🏖️ Sanur","🌾 Arrozais Tegalalang","🛕 Tirta Empul","🌋 Mt. Batur","🎭 Dança Kecak","🏖️ Nusa Dua","🍚 Nasi Goreng","🍢 Satay","🥟 Gado-Gado","🦆 Pato Assado","🍗 Nasi Campur","🌶️ Sambal","🍰 Martabak","🥥 Coco"]
    },
    ジャカルタ:{
      ja:["🏛️ モナス(独立記念塔)","🛍️ コタトゥア(旧市街)","🛍️ プラザインドネシア","🛕 イスティクラル・モスク","⛪ ジャカルタ大聖堂","🏛️ 国立博物館","🏝️ アンチョール","🛍️ タナアバン市場","🏘️ チャイナタウン","🏛️ メルデカ広場","🍚 ナシゴレン","🍜 ミーアヤム","🍢 サテ・アヤム","🥘 ガドガド","🍲 ソトベタウィ","🥖 マルタバ","🍢 屋台料理","🥤 アボカドジュース"],
      en:["🏛️ Monas","🛍️ Kota Tua","🛍️ Plaza Indonesia","🛕 Istiqlal Mosque","⛪ Jakarta Cathedral","🏛️ National Museum","🏝️ Ancol","🛍️ Tanah Abang","🏘️ Chinatown","🏛️ Merdeka Square","🍚 Nasi Goreng","🍜 Mie Ayam","🍢 Sate Ayam","🥘 Gado-Gado","🍲 Soto Betawi","🥖 Martabak","🍢 Street Food","🥤 Avocado Juice"],
      zh:["🏛️ 独立纪念碑","🛍️ 老城区","🛍️ 印尼广场","🛕 伊斯蒂赫拉尔清真寺","⛪ 雅加达大教堂","🏛️ 国家博物馆","🏝️ 安佐尔","🛍️ 塔纳阿邦市场","🏘️ 唐人街","🏛️ 默迪卡广场","🍚 印尼炒饭","🍜 鸡肉面","🍢 鸡肉沙嗲","🥘 加多加多","🍲 巴达维汤","🥖 千层饼","🍢 街头料理","🥤 牛油果汁"],
      ko:["🏛️ 모나스","🛍️ 코타투아","🛍️ 플라자 인도네시아","🛕 이스티끄랄 모스크","⛪ 자카르타 대성당","🏛️ 국립박물관","🏝️ 안촐","🛍️ 따나아방","🏘️ 차이나타운","🏛️ 머르데카 광장","🍚 나시고렝","🍜 미아얌","🍢 사떼 아얌","🥘 가도가도","🍲 소또 베따위","🥖 마르따박","🍢 길거리음식","🥤 아보카도 주스"],
      es:["🏛️ Monas","🛍️ Kota Tua","🛍️ Plaza Indonesia","🛕 Mezquita Istiqlal","⛪ Catedral Jakarta","🏛️ Museo Nacional","🏝️ Ancol","🛍️ Tanah Abang","🏘️ Chinatown","🏛️ Plaza Merdeka","🍚 Nasi Goreng","🍜 Mie Ayam","🍢 Sate Ayam","🥘 Gado-Gado","🍲 Soto Betawi","🥖 Martabak","🍢 Comida Calle","🥤 Jugo Aguacate"],
      pt:["🏛️ Monas","🛍️ Kota Tua","🛍️ Plaza Indonesia","🛕 Mesquita Istiqlal","⛪ Catedral Jakarta","🏛️ Museu Nacional","🏝️ Ancol","🛍️ Tanah Abang","🏘️ Chinatown","🏛️ Praça Merdeka","🍚 Nasi Goreng","🍜 Mie Ayam","🍢 Sate Ayam","🥘 Gado-Gado","🍲 Soto Betawi","🥖 Martabak","🍢 Comida Rua","🥤 Suco Abacate"]
    },
    ジョグジャカルタ:{
      ja:["🛕 ボロブドゥール遺跡","🛕 プランバナン寺院","🏰 ジョグジャカルタ王宮","🏰 水の宮殿(タマンサリ)","🛍️ マリオボロ通り","🛕 ラトゥボコ宮殿","🌋 ムラピ山","🛍️ ベリンハルジョ市場","🎭 ガムラン演奏","🐘 ジャワ象キャンプ","🍚 ナシゴレン","🍗 グデ(ジャックフルーツ料理)","🍢 サテ","🍲 バクソ","🍜 ミーゴレン","🥘 ナシリウェット","🍰 バクピア","🍵 ジャワティー"],
      en:["🛕 Borobudur","🛕 Prambanan","🏰 Yogyakarta Palace","🏰 Taman Sari","🛍️ Malioboro Street","🛕 Ratu Boko","🌋 Mt. Merapi","🛍️ Beringharjo Market","🎭 Gamelan","🐘 Java Elephant Camp","🍚 Nasi Goreng","🍗 Gudeg","🍢 Satay","🍲 Bakso","🍜 Mie Goreng","🥘 Nasi Liwet","🍰 Bakpia","🍵 Java Tea"],
      zh:["🛕 婆罗浮屠","🛕 普兰巴南","🏰 日惹王宫","🏰 水之宫殿","🛍️ 马里奥博罗街","🛕 拉图博克","🌋 默拉皮火山","🛍️ 贝林哈尔乔市场","🎭 甘美兰","🐘 爪哇大象营","🍚 印尼炒饭","🍗 古德格","🍢 沙嗲","🍲 肉丸汤","🍜 印尼炒面","🥘 利韦饭","🍰 八宝糕","🍵 爪哇茶"],
      ko:["🛕 보로부두르","🛕 쁘람바난","🏰 족자카르타 왕궁","🏰 따만사리","🛍️ 말리오보로","🛕 라뚜보꼬","🌋 머라삐 화산","🛍️ 베링하르조","🎭 가믈란","🐘 자바코끼리캠프","🍚 나시고렝","🍗 구덱","🍢 사떼","🍲 박소","🍜 미고렝","🥘 나시리웻","🍰 박삐아","🍵 자바티"],
      es:["🛕 Borobudur","🛕 Prambanan","🏰 Palacio Yogyakarta","🏰 Taman Sari","🛍️ Malioboro","🛕 Ratu Boko","🌋 Mt. Merapi","🛍️ Beringharjo","🎭 Gamelan","🐘 Campo Elefantes","🍚 Nasi Goreng","🍗 Gudeg","🍢 Satay","🍲 Bakso","🍜 Mie Goreng","🥘 Nasi Liwet","🍰 Bakpia","🍵 Té Java"],
      pt:["🛕 Borobudur","🛕 Prambanan","🏰 Palácio Yogyakarta","🏰 Taman Sari","🛍️ Malioboro","🛕 Ratu Boko","🌋 Mt. Merapi","🛍️ Beringharjo","🎭 Gamelan","🐘 Campo Elefantes","🍚 Nasi Goreng","🍗 Gudeg","🍢 Satay","🍲 Bakso","🍜 Mie Goreng","🥘 Nasi Liwet","🍰 Bakpia","🍵 Chá Java"]
    },
    スラバヤ:{
      ja:["🏛️ ヒーローズ記念碑","🛍️ チャイナタウン・カンプンプチナン","🏛️ スラバヤ動物園","🌳 ジャラン・トゥンジュンガン","🏛️ ハウス・オブ・サンプルナ","🏛️ シェラトン・スラバヤ","🌋 ブロモ火山(郊外)","⛪ サンタマリア大聖堂","🌳 スラバヤ植物園","🛕 アンペル・モスク","🍚 ナシペセル","🍲 ラウォン","🍢 サテ・クロポ","🍜 ミー・ジャワ","🍲 ソトアヤム","🥗 ガドガド・スラバヤ","🍰 クエ・ラピス","🥤 エスドゥガン"],
      en:["🏛️ Heroes Monument","🛍️ Kampung Pecinan","🏛️ Surabaya Zoo","🌳 Tunjungan Street","🏛️ House of Sampoerna","🏛️ Sheraton Surabaya","🌋 Mt. Bromo","⛪ Santa Maria Cathedral","🌳 Surabaya Botanic","🛕 Ampel Mosque","🍚 Nasi Pecel","🍲 Rawon","🍢 Sate Klopo","🍜 Mie Jawa","🍲 Soto Ayam","🥗 Surabaya Gado-Gado","🍰 Kue Lapis","🥤 Es Degan"],
      zh:["🏛️ 英雄纪念碑","🛍️ 唐人街","🏛️ 泗水动物园","🌳 屯戎安街","🏛️ 三保庙","🏛️ 喜来登酒店","🌋 布罗莫火山","⛪ 圣母玛利亚大教堂","🌳 泗水植物园","🛕 安佩尔清真寺","🍚 蔬菜饭","🍲 牛肉黑汤","🍢 椰子沙嗲","🍜 爪哇面","🍲 鸡汤","🥗 泗水加多加多","🍰 千层糕","🥤 椰子水"],
      ko:["🏛️ 영웅 기념탑","🛍️ 깜뿡 페시난","🏛️ 수라바야 동물원","🌳 뚠중안 거리","🏛️ 삼뿌르나 박물관","🏛️ 셰라톤 수라바야","🌋 브로모 화산","⛪ 산타마리아 대성당","🌳 수라바야 식물원","🛕 암펠 모스크","🍚 나시뻐쩰","🍲 라원","🍢 사떼끌로뽀","🍜 미자와","🍲 소또아얌","🥗 수라바야 가도가도","🍰 꾸에라삐스","🥤 에스두간"],
      es:["🏛️ Monumento Héroes","🛍️ Kampung Pecinan","🏛️ Zoo Surabaya","🌳 Calle Tunjungan","🏛️ Casa Sampoerna","🏛️ Sheraton","🌋 Mt. Bromo","⛪ Santa Maria","🌳 Jardín Botánico","🛕 Mezquita Ampel","🍚 Nasi Pecel","🍲 Rawon","🍢 Sate Klopo","🍜 Mie Jawa","🍲 Soto Ayam","🥗 Surabaya Gado-Gado","🍰 Kue Lapis","🥤 Es Degan"],
      pt:["🏛️ Monumento Heróis","🛍️ Kampung Pecinan","🏛️ Zoo Surabaya","🌳 Rua Tunjungan","🏛️ Casa Sampoerna","🏛️ Sheraton","🌋 Mt. Bromo","⛪ Santa Maria","🌳 Jardim Botânico","🛕 Mesquita Ampel","🍚 Nasi Pecel","🍲 Rawon","🍢 Sate Klopo","🍜 Mie Jawa","🍲 Soto Ayam","🥗 Surabaya Gado-Gado","🍰 Kue Lapis","🥤 Es Degan"]
    },
    ロンボク:{
      ja:["🏔️ リンジャニ山","🏖️ ギリ・トラワンガン","🏖️ ギリ・メノ","🏖️ ギリ・エア","🏖️ クタ・ビーチ・ロンボク","🌊 ピンクビーチ","🛕 リンサル寺院","🏛️ マタラム博物館","🌊 ティウ・クレップ滝","🌳 サスバビレッジ","🦞 シーフード","🍚 ナシ・プチェル","🍢 サテ","🌶️ アヤム・タリワン","🥘 プレチン","🍲 ベベラック","🥥 ココナッツ","🍦 トロピカルフルーツ"],
      en:["🏔️ Mt. Rinjani","🏖️ Gili Trawangan","🏖️ Gili Meno","🏖️ Gili Air","🏖️ Kuta Beach Lombok","🌊 Pink Beach","🛕 Lingsar Temple","🏛️ Mataram Museum","🌊 Tiu Kelep Waterfall","🌳 Sasak Village","🦞 Seafood","🍚 Nasi Pecel","🍢 Satay","🌶️ Ayam Taliwang","🥘 Plecing","🍲 Beberuk","🥥 Coconut","🍦 Tropical Fruits"],
      zh:["🏔️ 林贾尼火山","🏖️ 吉利岛","🏖️ 美诺岛","🏖️ 艾尔岛","🏖️ 库塔海滩","🌊 粉红沙滩","🛕 林萨尔寺","🏛️ 马塔兰博物馆","🌊 蒂乌克莱普瀑布","🌳 萨萨克村","🦞 海鲜","🍚 蔬菜饭","🍢 沙嗲","🌶️ 塔利万鸡","🥘 普莱青","🍲 贝贝鲁克","🥥 椰子","🍦 热带水果"],
      ko:["🏔️ 린자니 화산","🏖️ 길리 뜨라왕안","🏖️ 길리 메노","🏖️ 길리 아이르","🏖️ 꾸따 비치","🌊 핑크 비치","🛕 링사르 사원","🏛️ 마따람 박물관","🌊 띠우 끌렙 폭포","🌳 사삭 마을","🦞 해산물","🍚 나시 뻐쩰","🍢 사떼","🌶️ 아얌 딸리왕","🥘 쁠레찡","🍲 베베룩","🥥 코코넛","🍦 열대과일"],
      es:["🏔️ Mt. Rinjani","🏖️ Gili Trawangan","🏖️ Gili Meno","🏖️ Gili Air","🏖️ Playa Kuta Lombok","🌊 Playa Rosa","🛕 Templo Lingsar","🏛️ Museo Mataram","🌊 Cataratas Tiu Kelep","🌳 Aldea Sasak","🦞 Mariscos","🍚 Nasi Pecel","🍢 Satay","🌶️ Ayam Taliwang","🥘 Plecing","🍲 Beberuk","🥥 Coco","🍦 Frutas Tropicales"],
      pt:["🏔️ Mt. Rinjani","🏖️ Gili Trawangan","🏖️ Gili Meno","🏖️ Gili Air","🏖️ Praia Kuta Lombok","🌊 Praia Rosa","🛕 Templo Lingsar","🏛️ Museu Mataram","🌊 Cataratas Tiu Kelep","🌳 Aldeia Sasak","🦞 Frutos do Mar","🍚 Nasi Pecel","🍢 Satay","🌶️ Ayam Taliwang","🥘 Plecing","🍲 Beberuk","🥥 Coco","🍦 Frutas Tropicais"]
    },
    コモド:{
      ja:["🐲 コモドドラゴン","🏝️ コモド島","🏝️ リンチャ島","🏝️ パダール島","🌊 ピンクビーチ","🐠 マンタポイント","🤿 シュノーケリング","🐋 ボートツアー","🌅 サンセットクルーズ","🌳 国立公園","🐟 シーフード","🦞 ロブスター","🍚 ナシ・チャンプル","🍢 サテ","🌶️ サンバル","🥥 ココナッツ","🍦 アイス","🍻 ビンタンビール"],
      en:["🐲 Komodo Dragon","🏝️ Komodo Island","🏝️ Rinca Island","🏝️ Padar Island","🌊 Pink Beach","🐠 Manta Point","🤿 Snorkeling","🐋 Boat Tour","🌅 Sunset Cruise","🌳 National Park","🐟 Seafood","🦞 Lobster","🍚 Nasi Campur","🍢 Satay","🌶️ Sambal","🥥 Coconut","🍦 Ice Cream","🍻 Bintang Beer"],
      zh:["🐲 科莫多巨蜥","🏝️ 科莫多岛","🏝️ 林查岛","🏝️ 帕达尔岛","🌊 粉红沙滩","🐠 蝠鲼湾","🤿 浮潜","🐋 游船","🌅 日落游船","🌳 国家公园","🐟 海鲜","🦞 龙虾","🍚 巴厘风饭","🍢 沙嗲","🌶️ 桑巴酱","🥥 椰子","🍦 冰淇淋","🍻 宾唐啤酒"],
      ko:["🐲 코모도 도마뱀","🏝️ 코모도섬","🏝️ 린차섬","🏝️ 빠다르섬","🌊 핑크 비치","🐠 만타 포인트","🤿 스노클링","🐋 보트투어","🌅 선셋 크루즈","🌳 국립공원","🐟 해산물","🦞 랍스터","🍚 나시참뿌르","🍢 사떼","🌶️ 삼발","🥥 코코넛","🍦 아이스크림","🍻 빈땅 맥주"],
      es:["🐲 Dragón Komodo","🏝️ Isla Komodo","🏝️ Isla Rinca","🏝️ Isla Padar","🌊 Playa Rosa","🐠 Manta Point","🤿 Snorkel","🐋 Tour Barco","🌅 Sunset","🌳 Parque Nacional","🐟 Mariscos","🦞 Langosta","🍚 Nasi Campur","🍢 Satay","🌶️ Sambal","🥥 Coco","🍦 Helado","🍻 Bintang"],
      pt:["🐲 Dragão Komodo","🏝️ Ilha Komodo","🏝️ Ilha Rinca","🏝️ Ilha Padar","🌊 Praia Rosa","🐠 Manta Point","🤿 Snorkel","🐋 Tour Barco","🌅 Sunset","🌳 Parque Nacional","🐟 Frutos do Mar","🦞 Lagosta","🍚 Nasi Campur","🍢 Satay","🌶️ Sambal","🥥 Coco","🍦 Sorvete","🍻 Bintang"]
    },
    バンドン:{
      ja:["🏛️ ゲドゥン・サテ","🌋 タンクバン・プラフ","🌳 カワプティ","🛍️ ジャラン・ブラガ","🏛️ アジア・アフリカ会議博物館","🏖️ パプンダヤン","🌳 マリベヤ","🛍️ パサールバル","☕ コーヒー博物館","🏛️ バンドン地質博物館","🍚 ナシティンブル","🍲 バクソ","🍵 バンドンコーヒー","🍰 ピサンモーレン","🍞 バンドンパン","🥘 スンダ料理","🥤 エスチェンドル","🍢 サテ・マラング"],
      en:["🏛️ Gedung Sate","🌋 Tangkuban Perahu","🌳 Kawah Putih","🛍️ Jalan Braga","🏛️ Asia Africa Museum","🏖️ Papandayan","🌳 Maribaya","🛍️ Pasar Baru","☕ Coffee Museum","🏛️ Geology Museum","🍚 Nasi Timbel","🍲 Bakso","🍵 Bandung Coffee","🍰 Pisang Molen","🍞 Bandung Bread","🥘 Sundanese","🥤 Es Cendol","🍢 Sate Maranggi"],
      zh:["🏛️ 沙爹大厦","🌋 唐古班布拉胡火山","🌳 白色火山口","🛍️ 布拉加街","🏛️ 亚非会议博物馆","🏖️ 帕潘达扬","🌳 马里贝亚","🛍️ 巴鲁市场","☕ 咖啡博物馆","🏛️ 地质博物馆","🍚 蒸饭","🍲 肉丸","🍵 万隆咖啡","🍰 香蕉馅饼","🍞 万隆面包","🥘 巽他料理","🥤 椰糖冰","🍢 玛朗吉沙嗲"],
      ko:["🏛️ 정부청사","🌋 땅꾸반 쁘라후","🌳 까와뿌띠","🛍️ 브라가 거리","🏛️ 아시아아프리카회의","🏖️ 빠빤다얀","🌳 마리바야","🛍️ 빠사르 바루","☕ 커피박물관","🏛️ 지질박물관","🍚 나시띰벨","🍲 박소","🍵 반둥커피","🍰 삐상몰렌","🍞 반둥빵","🥘 순다요리","🥤 에스쩬돌","🍢 사떼 마랑기"],
      es:["🏛️ Gedung Sate","🌋 Tangkuban Perahu","🌳 Kawah Putih","🛍️ Jalan Braga","🏛️ Museo Asia África","🏖️ Papandayan","🌳 Maribaya","🛍️ Pasar Baru","☕ Museo Café","🏛️ Geología","🍚 Nasi Timbel","🍲 Bakso","🍵 Café Bandung","🍰 Pisang Molen","🍞 Pan Bandung","🥘 Sundanés","🥤 Es Cendol","🍢 Sate Maranggi"],
      pt:["🏛️ Gedung Sate","🌋 Tangkuban Perahu","🌳 Kawah Putih","🛍️ Jalan Braga","🏛️ Museu Ásia África","🏖️ Papandayan","🌳 Maribaya","🛍️ Pasar Baru","☕ Museu Café","🏛️ Geologia","🍚 Nasi Timbel","🍲 Bakso","🍵 Café Bandung","🍰 Pisang Molen","🍞 Pão Bandung","🥘 Sundanês","🥤 Es Cendol","🍢 Sate Maranggi"]
    },
    メダン:{
      ja:["🛕 マイモン宮殿","🛕 グレートモスク","🌋 シナブン火山","🌊 トバ湖(郊外)","🏝️ サモシール島","🏛️ メダン博物館","🏛️ ラフレシア・ティティ・ボボックロ","🏘️ クボン・ビナタン","🛍️ パサール・パギ","🏛️ ガンドール文化村","🍚 ナシ・パダン","🍲 ソトメダン","🍢 サテ・パダン","🥘 レンダン","🍜 ミ・アチェ","🍰 ビカ・アンボン","🍵 ドリアン","🥤 タミラ"],
      en:["🛕 Maimoon Palace","🛕 Great Mosque","🌋 Mt. Sinabung","🌊 Lake Toba","🏝️ Samosir Island","🏛️ Medan Museum","🏛️ Rahmat Wildlife","🏘️ Kebun Binatang","🛍️ Pasar Pagi","🏛️ Cultural Village","🍚 Nasi Padang","🍲 Soto Medan","🍢 Sate Padang","🥘 Rendang","🍜 Mie Aceh","🍰 Bika Ambon","🍵 Durian","🥤 Tamira"],
      zh:["🛕 迈蒙宫","🛕 大清真寺","🌋 西纳朋火山","🌊 多巴湖","🏝️ 萨摩西岛","🏛️ 棉兰博物馆","🏛️ 拉赫马特野生动物园","🏘️ 动物园","🛍️ 早市","🏛️ 文化村","🍚 巴东饭","🍲 棉兰汤","🍢 巴东沙嗲","🥘 仁当","🍜 亚齐面","🍰 比卡安邦","🍵 榴莲","🥤 塔米拉"],
      ko:["🛕 마이문 궁전","🛕 그레이트 모스크","🌋 시나붕 화산","🌊 또바 호수","🏝️ 사모시르섬","🏛️ 메단 박물관","🏛️ 라흐맛 야생동물원","🏘️ 동물원","🛍️ 빠사르 빠기","🏛️ 문화마을","🍚 나시 빠당","🍲 소또 메단","🍢 사떼 빠당","🥘 른당","🍜 미 아쩨","🍰 비까 암본","🍵 두리안","🥤 따미라"],
      es:["🛕 Palacio Maimoon","🛕 Gran Mezquita","🌋 Mt. Sinabung","🌊 Lago Toba","🏝️ Isla Samosir","🏛️ Museo Medan","🏛️ Rahmat Wildlife","🏘️ Zoo","🛍️ Pasar Pagi","🏛️ Aldea Cultural","🍚 Nasi Padang","🍲 Soto Medan","🍢 Sate Padang","🥘 Rendang","🍜 Mie Aceh","🍰 Bika Ambon","🍵 Durián","🥤 Tamira"],
      pt:["🛕 Palácio Maimoon","🛕 Grande Mesquita","🌋 Mt. Sinabung","🌊 Lago Toba","🏝️ Ilha Samosir","🏛️ Museu Medan","🏛️ Rahmat Wildlife","🏘️ Zoo","🛍️ Pasar Pagi","🏛️ Aldeia Cultural","🍚 Nasi Padang","🍲 Soto Medan","🍢 Sate Padang","🥘 Rendang","🍜 Mie Aceh","🍰 Bika Ambon","🍵 Durian","🥤 Tamira"]
    },
    クアラルンプール:{
      ja:["🗼 ペトロナスツインタワー","🗼 KLタワー","🛕 バトゥ洞窟","🏛️ 国立モスク","🛍️ ブキッ・ビンタン","🏰 メルデカ広場","🌳 KLCC公園","🏛️ 国立博物館","🏘️ チャイナタウン","🛍️ セントラルマーケット","🍛 ナシレマ","🍜 ラクサ","🍢 サテ","🍗 チキンライス(海南鶏飯)","🍛 ロティチャナイ","🍲 バクテー","🥘 チャークイティオ","🍢 ナシゴレン"],
      en:["🗼 Petronas Towers","🗼 KL Tower","🛕 Batu Caves","🏛️ National Mosque","🛍️ Bukit Bintang","🏰 Merdeka Square","🌳 KLCC Park","🏛️ National Museum","🏘️ Chinatown","🛍️ Central Market","🍛 Nasi Lemak","🍜 Laksa","🍢 Satay","🍗 Hainanese Chicken","🍛 Roti Canai","🍲 Bak Kut Teh","🥘 Char Kway Teow","🍢 Nasi Goreng"],
      zh:["🗼 双子塔","🗼 吉隆坡塔","🛕 黑风洞","🏛️ 国家清真寺","🛍️ 武吉免登","🏰 默迪卡广场","🌳 KLCC公园","🏛️ 国家博物馆","🏘️ 唐人街","🛍️ 中央市场","🍛 椰浆饭","🍜 叻沙","🍢 沙嗲","🍗 海南鸡饭","🍛 印度煎饼","🍲 肉骨茶","🥘 炒粿条","🍢 印尼炒饭"],
      ko:["🗼 페트로나스 트윈타워","🗼 KL타워","🛕 바투 동굴","🏛️ 국립 모스크","🛍️ 부킷빈탕","🏰 머르데카 광장","🌳 KLCC 공원","🏛️ 국립박물관","🏘️ 차이나타운","🛍️ 센트럴마켓","🍛 나시르막","🍜 락사","🍢 사떼","🍗 하이난 치킨라이스","🍛 로띠 짜나이","🍲 바꾸떼","🥘 차꿰이떼우","🍢 나시고렝"],
      es:["🗼 Torres Petronas","🗼 Torre KL","🛕 Cuevas Batu","🏛️ Mezquita Nacional","🛍️ Bukit Bintang","🏰 Plaza Merdeka","🌳 Parque KLCC","🏛️ Museo Nacional","🏘️ Chinatown","🛍️ Mercado Central","🍛 Nasi Lemak","🍜 Laksa","🍢 Satay","🍗 Pollo Hainanés","🍛 Roti Canai","🍲 Bak Kut Teh","🥘 Char Kway Teow","🍢 Nasi Goreng"],
      pt:["🗼 Torres Petronas","🗼 Torre KL","🛕 Cavernas Batu","🏛️ Mesquita Nacional","🛍️ Bukit Bintang","🏰 Praça Merdeka","🌳 Parque KLCC","🏛️ Museu Nacional","🏘️ Chinatown","🛍️ Mercado Central","🍛 Nasi Lemak","🍜 Laksa","🍢 Satay","🍗 Frango Hainanense","🍛 Roti Canai","🍲 Bak Kut Teh","🥘 Char Kway Teow","🍢 Nasi Goreng"]
    },
    ペナン:{
      ja:["🏘️ ジョージタウン","🎨 ストリートアート","🏛️ コムタタワー","🛕 極楽寺","🛕 ペナンヒル","🏛️ ペナン博物館","🏰 コーンウォリス砦","🛕 蛇寺院","🏖️ バトゥフェリンギビーチ","🏛️ ペナンモスク","🍜 ペナンラクサ","🍝 チャークイティオ","🍢 ナシカンダ","🍲 ホッケンミー","🍗 ペナンチャーシュー","🍞 ロティバカール","🍰 セムニャ","🍰 タンディキッ"],
      en:["🏘️ Georgetown","🎨 Street Art","🏛️ Komtar Tower","🛕 Kek Lok Si","🛕 Penang Hill","🏛️ Penang Museum","🏰 Fort Cornwallis","🛕 Snake Temple","🏖️ Batu Ferringhi","🏛️ Penang Mosque","🍜 Penang Laksa","🍝 Char Kway Teow","🍢 Nasi Kandar","🍲 Hokkien Mee","🍗 Penang Char Siu","🍞 Roti Bakar","🍰 Cendol","🍰 Tangyuan"],
      zh:["🏘️ 乔治市","🎨 街头艺术","🏛️ 光大大厦","🛕 极乐寺","🛕 槟城山","🏛️ 槟城博物馆","🏰 康华利斯堡","🛕 蛇庙","🏖️ 巴都丁宜海滩","🏛️ 槟城清真寺","🍜 槟城叻沙","🍝 炒粿条","🍢 印度饭","🍲 福建面","🍗 槟城叉烧","🍞 烤面包","🍰 椰糖冰","🍰 汤圆"],
      ko:["🏘️ 조지타운","🎨 스트리트 아트","🏛️ 꼼따르 타워","🛕 극락사","🛕 페낭힐","🏛️ 페낭 박물관","🏰 콘월리스 요새","🛕 뱀 사원","🏖️ 바뚜페링기","🏛️ 페낭 모스크","🍜 페낭 락사","🍝 차꿰이떼우","🍢 나시 깐다르","🍲 호키엔미","🍗 페낭 차슈","🍞 로띠 바까르","🍰 쩬돌","🍰 탕위안"],
      es:["🏘️ Georgetown","🎨 Arte Urbano","🏛️ Torre Komtar","🛕 Kek Lok Si","🛕 Cerro Penang","🏛️ Museo Penang","🏰 Fuerte Cornwallis","🛕 Templo Serpiente","🏖️ Batu Ferringhi","🏛️ Mezquita Penang","🍜 Laksa Penang","🍝 Char Kway Teow","🍢 Nasi Kandar","🍲 Hokkien Mee","🍗 Char Siu Penang","🍞 Roti Bakar","🍰 Cendol","🍰 Tangyuan"],
      pt:["🏘️ Georgetown","🎨 Arte Urbana","🏛️ Torre Komtar","🛕 Kek Lok Si","🛕 Colina Penang","🏛️ Museu Penang","🏰 Forte Cornwallis","🛕 Templo Serpente","🏖️ Batu Ferringhi","🏛️ Mesquita Penang","🍜 Laksa Penang","🍝 Char Kway Teow","🍢 Nasi Kandar","🍲 Hokkien Mee","🍗 Char Siu Penang","🍞 Roti Bakar","🍰 Cendol","🍰 Tangyuan"]
    },
    コタキナバル:{
      ja:["🏔️ キナバル山","🏝️ マヌカン島","🏝️ サピ島","🏝️ マムティック島","🌊 サピ・マムティックビーチ","🏞️ キナバル国立公園","🛕 コタキナバル市立モスク","🏛️ サバ博物館","🐢 ウミガメ島","🦧 サンダカン・オランウータン","🐟 シーフード","🍗 ナシレマ","🍝 トゥアラン・ミー","🍲 サバ風ラクサ","🥥 ココナッツ","🍰 トロピカルフルーツ","🦞 シーフードBBQ","🍻 ボルネオビール"],
      en:["🏔️ Mt. Kinabalu","🏝️ Manukan Island","🏝️ Sapi Island","🏝️ Mamutik Island","🌊 Sapi-Mamutik Beach","🏞️ Kinabalu Park","🛕 KK City Mosque","🏛️ Sabah Museum","🐢 Turtle Island","🦧 Sandakan Orangutan","🐟 Seafood","🍗 Nasi Lemak","🍝 Tuaran Mee","🍲 Sabah Laksa","🥥 Coconut","🍰 Tropical Fruits","🦞 Seafood BBQ","🍻 Borneo Beer"],
      zh:["🏔️ 神山","🏝️ 马奴干岛","🏝️ 沙比岛","🏝️ 马慕迪岛","🌊 海滩","🏞️ 神山公园","🛕 哥打市立清真寺","🏛️ 沙巴博物馆","🐢 龟岛","🦧 山打根猩猩","🐟 海鲜","🍗 椰浆饭","🍝 都亚兰面","🍲 沙巴叻沙","🥥 椰子","🍰 热带水果","🦞 海鲜BBQ","🍻 婆罗洲啤酒"],
      ko:["🏔️ 키나발루산","🏝️ 마누칸 섬","🏝️ 사피 섬","🏝️ 마무틱 섬","🌊 비치","🏞️ 키나발루 국립공원","🛕 KK 모스크","🏛️ 사바 박물관","🐢 거북섬","🦧 산다칸 오랑우탄","🐟 해산물","🍗 나시르막","🍝 뚜아란면","🍲 사바 락사","🥥 코코넛","🍰 열대과일","🦞 해산물BBQ","🍻 보르네오 맥주"],
      es:["🏔️ Mt. Kinabalu","🏝️ Isla Manukan","🏝️ Isla Sapi","🏝️ Isla Mamutik","🌊 Playa","🏞️ Parque Kinabalu","🛕 Mezquita KK","🏛️ Museo Sabah","🐢 Isla Tortugas","🦧 Orangutanes","🐟 Mariscos","🍗 Nasi Lemak","🍝 Tuaran Mee","🍲 Laksa Sabah","🥥 Coco","🍰 Frutas Tropicales","🦞 BBQ Mariscos","🍻 Cerveza Borneo"],
      pt:["🏔️ Mt. Kinabalu","🏝️ Ilha Manukan","🏝️ Ilha Sapi","🏝️ Ilha Mamutik","🌊 Praia","🏞️ Parque Kinabalu","🛕 Mesquita KK","🏛️ Museu Sabah","🐢 Ilha Tartarugas","🦧 Orangotangos","🐟 Frutos do Mar","🍗 Nasi Lemak","🍝 Tuaran Mee","🍲 Laksa Sabah","🥥 Coco","🍰 Frutas Tropicais","🦞 BBQ Frutos","🍻 Cerveja Borneo"]
    },
    マラッカ:{
      ja:["🏰 サンチアゴ砦(ア・ファモーザ)","⛪ セントポール教会","🛕 チェンフーテン寺","🏛️ オランダ広場","🏛️ ジョンカーストリート","🏛️ マラッカ・サルタネート宮殿","🏛️ 海洋博物館","🛕 カンプン・クリン・モスク","🚣 マラッカ川クルーズ","🌳 マラッカ動物園","🍝 ニョニャラクサ","🍗 海南鶏飯","🍢 サテ・チェルプ","🍰 ニョニャクエ","🍜 アッサムラクサ","🍞 ロティチャナイ","🍰 セムニャ","🥤 シェンドル"],
      en:["🏰 A Famosa","⛪ St. Paul's Church","🛕 Cheng Hoon Teng","🏛️ Dutch Square","🏛️ Jonker Street","🏛️ Sultanate Palace","🏛️ Maritime Museum","🛕 Kampung Kling Mosque","🚣 Malacca River Cruise","🌳 Malacca Zoo","🍝 Nyonya Laksa","🍗 Hainanese Chicken","🍢 Sate Celup","🍰 Nyonya Kuih","🍜 Asam Laksa","🍞 Roti Canai","🍰 Cendol","🥤 Chendol"],
      zh:["🏰 圣地亚哥要塞","⛪ 圣保罗教堂","🛕 青云亭","🏛️ 荷兰广场","🏛️ 鸡场街","🏛️ 苏丹皇宫","🏛️ 海事博物馆","🛕 甘榜吉宁清真寺","🚣 马六甲河游船","🌳 马六甲动物园","🍝 娘惹叻沙","🍗 海南鸡饭","🍢 沙嗲朱律","🍰 娘惹糕","🍜 阿叁叻沙","🍞 印度煎饼","🍰 椰糖冰","🥤 煎蕊"],
      ko:["🏰 산티아고 요새","⛪ 세인트폴 교회","🛕 청훈텡 사원","🏛️ 더치 광장","🏛️ 존커거리","🏛️ 술탄 궁전","🏛️ 해양박물관","🛕 깜뿡 끌링 모스크","🚣 말라카강 크루즈","🌳 말라카 동물원","🍝 뇨냐 락사","🍗 하이난 치킨","🍢 사떼 쩰룹","🍰 뇨냐 꾸이","🍜 아쌈 락사","🍞 로띠 짜나이","🍰 쩬돌","🥤 첸돌"],
      es:["🏰 A Famosa","⛪ Iglesia San Pablo","🛕 Cheng Hoon Teng","🏛️ Plaza Holandesa","🏛️ Jonker Street","🏛️ Palacio Sultanato","🏛️ Museo Marítimo","🛕 Mezquita Kampung Kling","🚣 Crucero Malaca","🌳 Zoo Malaca","🍝 Laksa Nyonya","🍗 Pollo Hainanés","🍢 Sate Celup","🍰 Kuih Nyonya","🍜 Asam Laksa","🍞 Roti Canai","🍰 Cendol","🥤 Chendol"],
      pt:["🏰 A Famosa","⛪ Igreja São Paulo","🛕 Cheng Hoon Teng","🏛️ Praça Holandesa","🏛️ Jonker Street","🏛️ Palácio Sultanato","🏛️ Museu Marítimo","🛕 Mesquita Kampung Kling","🚣 Cruzeiro Malaca","🌳 Zoo Malaca","🍝 Laksa Nyonya","🍗 Frango Hainanense","🍢 Sate Celup","🍰 Kuih Nyonya","🍜 Asam Laksa","🍞 Roti Canai","🍰 Cendol","🥤 Chendol"]
    },
    ランカウイ:{
      ja:["🦅 ランカウイの鷲","🚠 スカイブリッジ・スカイカブ","🏝️ パヤール島","🏖️ チェナンビーチ","🏖️ ブラックサンドビーチ","🏝️ ダヤン・ブンティン島","🌊 マングローブツアー","🏛️ ランカウイ博物館","🌊 セブンウェル滝","🛍️ ランカウイ・パレード","🍝 ナシレマ","🍜 ラクサ","🦞 シーフード","🐟 イカフライ","🦀 チリクラブ","🥥 ココナッツ","🍢 サテ","🥤 トロピカルジュース"],
      en:["🦅 Langkawi Eagle","🚠 Skybridge","🏝️ Payar Island","🏖️ Cenang Beach","🏖️ Black Sand Beach","🏝️ Dayang Bunting","🌊 Mangrove Tour","🏛️ Langkawi Museum","🌊 Seven Wells Falls","🛍️ Langkawi Parade","🍝 Nasi Lemak","🍜 Laksa","🦞 Seafood","🐟 Fried Squid","🦀 Chili Crab","🥥 Coconut","🍢 Satay","🥤 Tropical Juice"],
      zh:["🦅 兰卡威鹰","🚠 天空之桥","🏝️ 帕亚岛","🏖️ 真浪海滩","🏖️ 黑沙滩","🏝️ 怀孕少女湖","🌊 红树林游","🏛️ 兰卡威博物馆","🌊 七井瀑布","🛍️ 兰卡威广场","🍝 椰浆饭","🍜 叻沙","🦞 海鲜","🐟 炸鱿鱼","🦀 辣椒蟹","🥥 椰子","🍢 沙嗲","🥤 热带果汁"],
      ko:["🦅 랑카위 독수리","🚠 스카이브리지","🏝️ 빠야섬","🏖️ 쩌낭 비치","🏖️ 검은모래 비치","🏝️ 다양 분띵","🌊 맹그로브 투어","🏛️ 랑카위 박물관","🌊 7개우물 폭포","🛍️ 랑카위 퍼레이드","🍝 나시르막","🍜 락사","🦞 해산물","🐟 오징어튀김","🦀 칠리크랩","🥥 코코넛","🍢 사떼","🥤 열대주스"],
      es:["🦅 Águila Langkawi","🚠 Skybridge","🏝️ Isla Payar","🏖️ Playa Cenang","🏖️ Playa Negra","🏝️ Dayang Bunting","🌊 Manglares","🏛️ Museo Langkawi","🌊 Siete Pozos","🛍️ Langkawi Parade","🍝 Nasi Lemak","🍜 Laksa","🦞 Mariscos","🐟 Calamar","🦀 Cangrejo Chili","🥥 Coco","🍢 Satay","🥤 Jugo Tropical"],
      pt:["🦅 Águia Langkawi","🚠 Skybridge","🏝️ Ilha Payar","🏖️ Praia Cenang","🏖️ Praia Negra","🏝️ Dayang Bunting","🌊 Manguezais","🏛️ Museu Langkawi","🌊 Sete Poços","🛍️ Langkawi Parade","🍝 Nasi Lemak","🍜 Laksa","🦞 Frutos do Mar","🐟 Lula","🦀 Caranguejo","🥥 Coco","🍢 Satay","🥤 Suco Tropical"]
    },
    ジョホールバル:{
      ja:["🏰 スルタン・アブ・バカル・モスク","🏛️ ジョホールバル動物園","🛍️ シティスクエア","🎢 レゴランド・マレーシア","🛕 グレートチェンソウ寺院","🏰 ダタラン・バンダラヤ","🏛️ ジョホール州博物館","🛍️ ジョホールバル・ジャラン","🏖️ デサル・ビーチ","🌳 イスタナ・ガーデン","🍢 サテ","🍜 ラクサ","🍗 ナシレマ","🍲 バクテー","🍝 ミー・レブス","🥘 オタオタ","🍰 ニョニャクエ","🥤 シェンドル"],
      en:["🏰 Sultan Abu Bakar Mosque","🏛️ JB Zoo","🛍️ City Square","🎢 LEGOLAND Malaysia","🛕 Chen Sow Temple","🏰 Dataran Bandaraya","🏛️ Johor Museum","🛍️ JB Jalan","🏖️ Desaru Beach","🌳 Istana Garden","🍢 Satay","🍜 Laksa","🍗 Nasi Lemak","🍲 Bak Kut Teh","🍝 Mee Rebus","🥘 Otak-Otak","🍰 Nyonya Kuih","🥤 Chendol"],
      zh:["🏰 苏丹清真寺","🏛️ 新山动物园","🛍️ 城市广场","🎢 乐高乐园","🛕 陈氏寺","🏰 市政厅","🏛️ 柔佛博物馆","🛍️ 新山街","🏖️ 笛沙鲁海滩","🌳 御花园","🍢 沙嗲","🍜 叻沙","🍗 椰浆饭","🍲 肉骨茶","🍝 卤面","🥘 乌打乌打","🍰 娘惹糕","🥤 煎蕊"],
      ko:["🏰 술탄 모스크","🏛️ JB 동물원","🛍️ 시티 스퀘어","🎢 레고랜드","🛕 첸 사원","🏰 다따란","🏛️ 조호르 박물관","🛍️ JB 거리","🏖️ 데사루 비치","🌳 이스타나 정원","🍢 사떼","🍜 락사","🍗 나시르막","🍲 바꾸떼","🍝 미르부스","🥘 오딱오딱","🍰 뇨냐 꾸이","🥤 첸돌"],
      es:["🏰 Mezquita Sultan","🏛️ Zoo JB","🛍️ City Square","🎢 LEGOLAND","🛕 Templo Chen","🏰 Dataran","🏛️ Museo Johor","🛍️ JB Jalan","🏖️ Playa Desaru","🌳 Jardín Istana","🍢 Satay","🍜 Laksa","🍗 Nasi Lemak","🍲 Bak Kut Teh","🍝 Mee Rebus","🥘 Otak-Otak","🍰 Kuih Nyonya","🥤 Chendol"],
      pt:["🏰 Mesquita Sultan","🏛️ Zoo JB","🛍️ City Square","🎢 LEGOLAND","🛕 Templo Chen","🏰 Dataran","🏛️ Museu Johor","🛍️ JB Jalan","🏖️ Praia Desaru","🌳 Jardim Istana","🍢 Satay","🍜 Laksa","🍗 Nasi Lemak","🍲 Bak Kut Teh","🍝 Mee Rebus","🥘 Otak-Otak","🍰 Kuih Nyonya","🥤 Chendol"]
    },
    イポー:{
      ja:["🛕 ケッロクトン洞窟寺","🛕 サムポトン洞窟寺","🛕 ペラトン洞窟寺","🏛️ 旧駅","🏛️ ハン・チン・ペット・ソー","🏘️ コンクリート・ジャングル","🛍️ イポー旧市街","🏰 ヘリテージビル","🌳 グリーンタウン","🛕 関帝廟","🍗 イポー風モヤシ鶏","🥄 ホワイトコーヒー","🍜 イポーホーファン","🍢 サテ","🍞 ロティ・カネ","🍰 シューマイ・イポー","🥘 ナシレマ","🥤 アイス・カチャン"],
      en:["🛕 Kek Lok Tong","🛕 Sam Poh Tong","🛕 Perak Tong","🏛️ Old Railway Station","🏛️ Han Chin Pet Soo","🏘️ Concubine Lane","🛍️ Ipoh Old Town","🏰 Heritage Buildings","🌳 Greentown","🛕 Guan Yin Temple","🍗 Ipoh Bean Sprouts Chicken","🥄 White Coffee","🍜 Ipoh Hor Fun","🍢 Satay","🍞 Roti Canai","🍰 Ipoh Shumai","🥘 Nasi Lemak","🥤 Ice Kacang"],
      zh:["🛕 极乐洞","🛕 三宝洞","🛕 霹雳洞","🏛️ 旧火车站","🏛️ 韩江公会","🏘️ 二奶巷","🛍️ 怡保旧城","🏰 历史建筑","🌳 绿城","🛕 关帝庙","🍗 怡保芽菜鸡","🥄 怡保白咖啡","🍜 怡保河粉","🍢 沙嗲","🍞 印度煎饼","🍰 怡保烧卖","🥘 椰浆饭","🥤 冰沙冰"],
      ko:["🛕 끄끌록통","🛕 삼뽀통","🛕 뻬락통","🏛️ 옛 기차역","🏛️ 한친 펫 수","🏘️ 콘큐바인레인","🛍️ 이포 구시가","🏰 헤리티지","🌳 그린타운","🛕 관음사원","🍗 콩나물 닭","🥄 화이트 커피","🍜 이포 호펀","🍢 사떼","🍞 로띠 짜나이","🍰 이포 사오마이","🥘 나시르막","🥤 아이스 까짱"],
      es:["🛕 Kek Lok Tong","🛕 Sam Poh Tong","🛕 Perak Tong","🏛️ Estación Vieja","🏛️ Han Chin Pet Soo","🏘️ Concubine Lane","🛍️ Casco Antiguo","🏰 Edificios Históricos","🌳 Greentown","🛕 Templo Guan Yin","🍗 Pollo Brotes Ipoh","🥄 Café Blanco","🍜 Ipoh Hor Fun","🍢 Satay","🍞 Roti Canai","🍰 Shumai Ipoh","🥘 Nasi Lemak","🥤 Ice Kacang"],
      pt:["🛕 Kek Lok Tong","🛕 Sam Poh Tong","🛕 Perak Tong","🏛️ Estação Velha","🏛️ Han Chin Pet Soo","🏘️ Concubine Lane","🛍️ Cidade Antiga","🏰 Edifícios Históricos","🌳 Greentown","🛕 Templo Guan Yin","🍗 Frango Brotos","🥄 Café Branco","🍜 Ipoh Hor Fun","🍢 Satay","🍞 Roti Canai","🍰 Shumai Ipoh","🥘 Nasi Lemak","🥤 Ice Kacang"]
    },
    クチン:{
      ja:["🐱 クチン猫の像・猫博物館","🏛️ サラワク博物館","🏰 アスタナ宮殿","🛕 トゥアペックコン廟","🏞️ バコ国立公園","🦧 セメンゴ・オランウータン","🛍️ サラワク・カルチュラル・ビレッジ","🚣 サラワク川クルーズ","🛍️ メインバザール","🏞️ ニア国立公園","🍜 サラワク・ラクサ","🍝 コロ・ミー","🍗 アヤム・ペンセム","🍲 ミー・ジャワ","🥘 アンサクサゴ","🍰 クエ・カピット","🥥 ココナッツ","🥤 ジャングルジュース"],
      en:["🐱 Cat Statue & Museum","🏛️ Sarawak Museum","🏰 Astana Palace","🛕 Tua Pek Kong","🏞️ Bako National Park","🦧 Semenggoh Orangutans","🛍️ Cultural Village","🚣 Sarawak River Cruise","🛍️ Main Bazaar","🏞️ Niah National Park","🍜 Sarawak Laksa","🍝 Kolo Mee","🍗 Ayam Pansuh","🍲 Mie Jawa","🥘 Ansaksago","🍰 Kek Lapis","🥥 Coconut","🥤 Jungle Juice"],
      zh:["🐱 猫雕像与博物馆","🏛️ 砂拉越博物馆","🏰 阿斯塔纳宫","🛕 大伯公庙","🏞️ 巴哥国家公园","🦧 实蒙谷红毛猩猩","🛍️ 文化村","🚣 砂拉越河游船","🛍️ 主巴刹","🏞️ 尼亚国家公园","🍜 砂拉越叻沙","🍝 哥罗面","🍗 竹筒鸡","🍲 爪哇面","🥘 砂拉越美食","🍰 千层蛋糕","🥥 椰子","🥤 丛林果汁"],
      ko:["🐱 고양이 동상박물관","🏛️ 사라왁 박물관","🏰 아스타나 궁전","🛕 뚜아빽꽁","🏞️ 바코 국립공원","🦧 세멘고 오랑우탄","🛍️ 문화마을","🚣 사라왁강 크루즈","🛍️ 메인바자르","🏞️ 니아 국립공원","🍜 사라왁 락사","🍝 콜로미","🍗 아얌 빤수","🍲 미자와","🥘 안삭사고","🍰 끄끄라삐스","🥥 코코넛","🥤 정글주스"],
      es:["🐱 Estatua Gato","🏛️ Museo Sarawak","🏰 Palacio Astana","🛕 Tua Pek Kong","🏞️ Parque Bako","🦧 Orangutanes Semenggoh","🛍️ Aldea Cultural","🚣 Crucero Sarawak","🛍️ Main Bazaar","🏞️ Parque Niah","🍜 Laksa Sarawak","🍝 Kolo Mee","🍗 Ayam Pansuh","🍲 Mie Jawa","🥘 Ansaksago","🍰 Kek Lapis","🥥 Coco","🥤 Jugo Selva"],
      pt:["🐱 Estátua Gato","🏛️ Museu Sarawak","🏰 Palácio Astana","🛕 Tua Pek Kong","🏞️ Parque Bako","🦧 Orangotangos Semenggoh","🛍️ Aldeia Cultural","🚣 Cruzeiro Sarawak","🛍️ Main Bazaar","🏞️ Parque Niah","🍜 Laksa Sarawak","🍝 Kolo Mee","🍗 Ayam Pansuh","🍲 Mie Jawa","🥘 Ansaksago","🍰 Kek Lapis","🥥 Coco","🥤 Suco Selva"]
    },
    マニラ:{
      ja:["🏰 イントラムロス(城壁都市)","⛪ サンアグスティン教会","🏰 サンチアゴ要塞","🌳 リサール公園","🏛️ 国立博物館","🛍️ SMモール・オブ・アジア","🏛️ マラカニアン宮殿","🛕 マニラ大聖堂","🏛️ アヤラ博物館","🛍️ チャイナタウン(ビノンド)","🍢 アドボ","🍲 シニガン","🥘 カレカレ","🍢 レチョン","🍰 ハロハロ","🥚 バロット","🍞 パンデサル","🥤 ブコジュース"],
      en:["🏰 Intramuros","⛪ San Agustin Church","🏰 Fort Santiago","🌳 Rizal Park","🏛️ National Museum","🛍️ Mall of Asia","🏛️ Malacañang Palace","🛕 Manila Cathedral","🏛️ Ayala Museum","🛍️ Binondo Chinatown","🍢 Adobo","🍲 Sinigang","🥘 Kare-Kare","🍢 Lechon","🍰 Halo-Halo","🥚 Balut","🍞 Pandesal","🥤 Buko Juice"],
      zh:["🏰 西班牙城","⛪ 圣奥古斯丁教堂","🏰 圣地亚哥堡","🌳 黎刹公园","🏛️ 国家博物馆","🛍️ 亚洲购物中心","🏛️ 马拉坎南宫","🛕 马尼拉大教堂","🏛️ 阿亚拉博物馆","🛍️ 比农多唐人街","🍢 阿斗波","🍲 西尼甘汤","🥘 卡里卡里","🍢 烤乳猪","🍰 哈罗哈罗","🥚 鸭仔蛋","🍞 早餐面包","🥤 椰子汁"],
      ko:["🏰 인트라무로스","⛪ 산아구스틴 교회","🏰 산티아고 요새","🌳 리잘 공원","🏛️ 국립박물관","🛍️ 몰오브아시아","🏛️ 말라카냥 궁전","🛕 마닐라 대성당","🏛️ 아얄라 박물관","🛍️ 비논도","🍢 아도보","🍲 시니강","🥘 카레카레","🍢 레촌","🍰 할로할로","🥚 발롯","🍞 빤데살","🥤 부코주스"],
      es:["🏰 Intramuros","⛪ Iglesia San Agustín","🏰 Fuerte Santiago","🌳 Parque Rizal","🏛️ Museo Nacional","🛍️ Mall of Asia","🏛️ Palacio Malacañang","🛕 Catedral Manila","🏛️ Museo Ayala","🛍️ Binondo","🍢 Adobo","🍲 Sinigang","🥘 Kare-Kare","🍢 Lechón","🍰 Halo-Halo","🥚 Balut","🍞 Pandesal","🥤 Jugo Buko"],
      pt:["🏰 Intramuros","⛪ Igreja San Agustín","🏰 Forte Santiago","🌳 Parque Rizal","🏛️ Museu Nacional","🛍️ Mall of Asia","🏛️ Palácio Malacañang","🛕 Catedral Manila","🏛️ Museu Ayala","🛍️ Binondo","🍢 Adobo","🍲 Sinigang","🥘 Kare-Kare","🍢 Lechón","🍰 Halo-Halo","🥚 Balut","🍞 Pandesal","🥤 Suco Buko"]
    },
    セブ島:{
      ja:["⛪ サントニーニョ教会","✝️ マゼランクロス","🏰 サンペドロ要塞","🏝️ オスロブ・ジンベエザメ","🐬 イルカウォッチング","🏝️ モアルボアル(イワシトルネード)","🌊 カワサン滝","🏖️ マクタン島","🏝️ ボホール島","🐒 ターシャ(メガネザル)","🍢 レチョン","🍞 プソ(米団子)","🍝 ラペスバトチョイ","🥥 トロピカルフルーツ","🐟 シーフード","🍦 ハロハロ","🍝 ラスワ","🥤 マンゴーシェイク"],
      en:["⛪ Santo Niño Church","✝️ Magellan's Cross","🏰 Fort San Pedro","🏝️ Oslob Whale Sharks","🐬 Dolphin Watching","🏝️ Moalboal Sardines","🌊 Kawasan Falls","🏖️ Mactan Island","🏝️ Bohol Island","🐒 Tarsier","🍢 Lechon","🍞 Puso","🍝 La Paz Batchoy","🥥 Tropical Fruits","🐟 Seafood","🍦 Halo-Halo","🍝 Laswa","🥤 Mango Shake"],
      zh:["⛪ 圣婴教堂","✝️ 麦哲伦十字架","🏰 圣佩德罗堡","🏝️ 鲸鲨共游","🐬 海豚观察","🏝️ 莫阿尔博尔","🌊 卡瓦山瀑布","🏖️ 麦丹岛","🏝️ 薄荷岛","🐒 眼镜猴","🍢 烤乳猪","🍞 米团","🍝 拉巴斯面","🥥 热带水果","🐟 海鲜","🍦 哈罗哈罗","🍝 拉斯瓦","🥤 芒果奶昔"],
      ko:["⛪ 산토 니뇨 교회","✝️ 마젤란 십자가","🏰 산페드로 요새","🏝️ 오슬롭 고래상어","🐬 돌고래투어","🏝️ 모알보알","🌊 까와산 폭포","🏖️ 막탄섬","🏝️ 보홀섬","🐒 안경원숭이","🍢 레촌","🍞 뿌소","🍝 라파스 밧초이","🥥 열대과일","🐟 해산물","🍦 할로할로","🍝 라스와","🥤 망고쉐이크"],
      es:["⛪ Iglesia Santo Niño","✝️ Cruz Magallanes","🏰 Fuerte San Pedro","🏝️ Tiburones Ballena","🐬 Delfines","🏝️ Moalboal","🌊 Cataratas Kawasan","🏖️ Isla Mactan","🏝️ Bohol","🐒 Tarsero","🍢 Lechón","🍞 Puso","🍝 La Paz Batchoy","🥥 Frutas Tropicales","🐟 Mariscos","🍦 Halo-Halo","🍝 Laswa","🥤 Batido Mango"],
      pt:["⛪ Igreja Santo Niño","✝️ Cruz Magalhães","🏰 Forte San Pedro","🏝️ Tubarões-Baleia","🐬 Golfinhos","🏝️ Moalboal","🌊 Cataratas Kawasan","🏖️ Ilha Mactan","🏝️ Bohol","🐒 Társio","🍢 Lechón","🍞 Puso","🍝 La Paz Batchoy","🥥 Frutas Tropicais","🐟 Frutos do Mar","🍦 Halo-Halo","🍝 Laswa","🥤 Smoothie Manga"]
    },
    ボラカイ:{
      ja:["🏖️ ホワイトビーチ","🏖️ プカシェルビーチ","🌅 サンセットセーリング","🤿 パラセイリング","🦞 シーフード","🏝️ クロコダイル島","🌊 マグデュンガオ滝","🐠 シュノーケリングツアー","🏖️ ディニウィッドビーチ","🌅 ヨガリトリート","🦞 シーフードBBQ","🥥 ココナッツ","🍢 イサウ(屋台)","🍰 ハロハロ","🍝 パンシット","🍞 パンデサル","🥤 マンゴーシェイク","🍹 トロピカルカクテル"],
      en:["🏖️ White Beach","🏖️ Puka Shell Beach","🌅 Sunset Sailing","🤿 Parasailing","🦞 Seafood","🏝️ Crocodile Island","🌊 Magdungao Falls","🐠 Snorkeling","🏖️ Diniwid Beach","🌅 Yoga Retreat","🦞 Seafood BBQ","🥥 Coconut","🍢 Ihaw-Ihaw","🍰 Halo-Halo","🍝 Pancit","🍞 Pandesal","🥤 Mango Shake","🍹 Tropical Cocktail"],
      zh:["🏖️ 白沙滩","🏖️ 普卡贝壳海滩","🌅 日落帆船","🤿 帆伞","🦞 海鲜","🏝️ 鳄鱼岛","🌊 玛格东高瀑布","🐠 浮潜","🏖️ 迪尼维德海滩","🌅 瑜伽","🦞 海鲜BBQ","🥥 椰子","🍢 街头烧烤","🍰 哈罗哈罗","🍝 米粉","🍞 面包","🥤 芒果奶昔","🍹 热带鸡尾酒"],
      ko:["🏖️ 화이트비치","🏖️ 뿌까쉘 비치","🌅 선셋세일링","🤿 패러세일링","🦞 해산물","🏝️ 크로커다일섬","🌊 막둥아오폭포","🐠 스노클링","🏖️ 디니위드 비치","🌅 요가","🦞 해산물BBQ","🥥 코코넛","🍢 길거리BBQ","🍰 할로할로","🍝 빤싯","🍞 빤데살","🥤 망고쉐이크","🍹 트로피컬 칵테일"],
      es:["🏖️ Playa Blanca","🏖️ Puka Shell","🌅 Sunset Sailing","🤿 Parasailing","🦞 Mariscos","🏝️ Isla Cocodrilo","🌊 Cataratas Magdungao","🐠 Snorkel","🏖️ Diniwid","🌅 Yoga","🦞 BBQ Mariscos","🥥 Coco","🍢 Ihaw-Ihaw","🍰 Halo-Halo","🍝 Pancit","🍞 Pandesal","🥤 Batido Mango","🍹 Cóctel Tropical"],
      pt:["🏖️ Praia Branca","🏖️ Puka Shell","🌅 Sunset Sailing","🤿 Parasailing","🦞 Frutos do Mar","🏝️ Ilha Crocodilo","🌊 Cataratas Magdungao","🐠 Snorkel","🏖️ Diniwid","🌅 Yoga","🦞 BBQ Frutos","🥥 Coco","🍢 Ihaw-Ihaw","🍰 Halo-Halo","🍝 Pancit","🍞 Pandesal","🥤 Smoothie Manga","🍹 Coquetel Tropical"]
    },
    ダバオ:{
      ja:["🏔️ アポ山","🌳 フィリピン鷲保護センター","🏖️ サマール島","🌳 マラゴス農園","🛍️ ダバオ・ナイトマーケット","🏛️ サンペドロ大聖堂","🐊 クロコダイル公園","🌿 エデンネイチャーパーク","🏝️ パールファーム","🌳 ピープルズパーク","🍢 ドリアン","🐟 キニラウ","🍢 レチョン","🍝 ダバオ・パンシット","🥘 シニガン","🍰 ハロハロ","🥥 ココナッツ","🥤 マンゴーシェイク"],
      en:["🏔️ Mt. Apo","🌳 Philippine Eagle Center","🏖️ Samal Island","🌳 Malagos Garden","🛍️ Davao Night Market","🏛️ San Pedro Cathedral","🐊 Crocodile Park","🌿 Eden Nature Park","🏝️ Pearl Farm","🌳 People's Park","🍢 Durian","🐟 Kinilaw","🍢 Lechon","🍝 Davao Pancit","🥘 Sinigang","🍰 Halo-Halo","🥥 Coconut","🥤 Mango Shake"],
      zh:["🏔️ 阿波火山","🌳 菲律宾鹰中心","🏖️ 萨马尔岛","🌳 玛拉戈斯农场","🛍️ 达沃夜市","🏛️ 圣彼得大教堂","🐊 鳄鱼公园","🌿 伊甸自然公园","🏝️ 珍珠农场","🌳 人民公园","🍢 榴莲","🐟 醋拌生鱼","🍢 烤乳猪","🍝 达沃米粉","🥘 西尼甘汤","🍰 哈罗哈罗","🥥 椰子","🥤 芒果奶昔"],
      ko:["🏔️ 아포산","🌳 필리핀이글센터","🏖️ 사말섬","🌳 말라고스","🛍️ 다바오 야시장","🏛️ 산뻬드로 대성당","🐊 크로커다일파크","🌿 에덴자연공원","🏝️ 펄팜","🌳 인민공원","🍢 두리안","🐟 끼닐라우","🍢 레촌","🍝 다바오 빤싯","🥘 시니강","🍰 할로할로","🥥 코코넛","🥤 망고쉐이크"],
      es:["🏔️ Mt. Apo","🌳 Centro Águila","🏖️ Isla Samal","🌳 Malagos Garden","🛍️ Mercado Nocturno","🏛️ Catedral San Pedro","🐊 Parque Cocodrilos","🌿 Eden Park","🏝️ Pearl Farm","🌳 People's Park","🍢 Durián","🐟 Kinilaw","🍢 Lechón","🍝 Pancit Davao","🥘 Sinigang","🍰 Halo-Halo","🥥 Coco","🥤 Batido Mango"],
      pt:["🏔️ Mt. Apo","🌳 Centro Águia","🏖️ Ilha Samal","🌳 Malagos Garden","🛍️ Mercado Noturno","🏛️ Catedral San Pedro","🐊 Parque Crocodilos","🌿 Eden Park","🏝️ Pearl Farm","🌳 People's Park","🍢 Durian","🐟 Kinilaw","🍢 Lechón","🍝 Pancit Davao","🥘 Sinigang","🍰 Halo-Halo","🥥 Coco","🥤 Smoothie Manga"]
    },
    パラワン:{
      ja:["🌊 プエルトプリンセサ地下河川","🏝️ エルニド","🏝️ コロン","🏖️ ナクパンビーチ","🤿 アイランドホッピング","🌊 ツインラグーン","🌊 ビッグラグーン","🤿 沈没船ダイビング","🦞 シーフード","🏝️ パンダン島","🐟 キニラウ","🦀 マッドクラブ","🦞 ロブスター","🥥 ココナッツ","🍝 ロンミー","🍰 ハロハロ","🥤 マンゴーシェイク","🍹 トロピカルジュース"],
      en:["🌊 Puerto Princesa Underground River","🏝️ El Nido","🏝️ Coron","🏖️ Nacpan Beach","🤿 Island Hopping","🌊 Twin Lagoon","🌊 Big Lagoon","🤿 Wreck Diving","🦞 Seafood","🏝️ Pandan Island","🐟 Kinilaw","🦀 Mud Crab","🦞 Lobster","🥥 Coconut","🍝 Long Mee","🍰 Halo-Halo","🥤 Mango Shake","🍹 Tropical Juice"],
      zh:["🌊 公主港地下河","🏝️ 爱妮岛","🏝️ 科隆","🏖️ 纳克潘海滩","🤿 跳岛","🌊 双子湖","🌊 大湖","🤿 沉船潜水","🦞 海鲜","🏝️ 班丹岛","🐟 醋拌生鱼","🦀 大闸蟹","🦞 龙虾","🥥 椰子","🍝 长面","🍰 哈罗哈罗","🥤 芒果奶昔","🍹 热带果汁"],
      ko:["🌊 푸에르토프린세사 지하강","🏝️ 엘니도","🏝️ 코론","🏖️ 나끄빤 비치","🤿 아일랜드 호핑","🌊 트윈라군","🌊 빅라군","🤿 난파선 다이빙","🦞 해산물","🏝️ 빤단섬","🐟 끼닐라우","🦀 머드크랩","🦞 랍스터","🥥 코코넛","🍝 롱미","🍰 할로할로","🥤 망고쉐이크","🍹 열대주스"],
      es:["🌊 Río Subterráneo","🏝️ El Nido","🏝️ Coron","🏖️ Nacpan Beach","🤿 Island Hopping","🌊 Twin Lagoon","🌊 Big Lagoon","🤿 Buceo Naufragios","🦞 Mariscos","🏝️ Isla Pandan","🐟 Kinilaw","🦀 Cangrejo","🦞 Langosta","🥥 Coco","🍝 Long Mee","🍰 Halo-Halo","🥤 Batido Mango","🍹 Jugo Tropical"],
      pt:["🌊 Rio Subterrâneo","🏝️ El Nido","🏝️ Coron","🏖️ Nacpan Beach","🤿 Island Hopping","🌊 Twin Lagoon","🌊 Big Lagoon","🤿 Mergulho Naufrágios","🦞 Frutos do Mar","🏝️ Ilha Pandan","🐟 Kinilaw","🦀 Caranguejo","🦞 Lagosta","🥥 Coco","🍝 Long Mee","🍰 Halo-Halo","🥤 Smoothie Manga","🍹 Suco Tropical"]
    },
    バギオ:{
      ja:["🌲 バーナム公園","🌹 ライト公園","🏛️ ライト・パーク","🌳 マインズビューパーク","🛍️ バギオ・パブリックマーケット","⛪ バギオ大聖堂","🌳 ボタニカルガーデン","🏛️ ベンチョー博物館","🏘️ タムアワン・ビレッジ","🌳 イグ・サン・サン・ファーム","🍢 ピニクピカン","🍗 イグタイル","🥬 ベンゲット野菜","🥖 バギオパン","☕ コルディリェラコーヒー","🍰 ストロベリーパイ","🍓 バギオいちご","🥤 ウベシェイク"],
      en:["🌲 Burnham Park","🌹 Wright Park","🏛️ Lourdes Grotto","🌳 Mines View Park","🛍️ Public Market","⛪ Baguio Cathedral","🌳 Botanical Garden","🏛️ Bencab Museum","🏘️ Tam-Awan Village","🌳 Easter Weaving","🍢 Pinikpikan","🍗 Igtail","🥬 Benguet Vegetables","🥖 Baguio Bread","☕ Cordillera Coffee","🍰 Strawberry Pie","🍓 Baguio Strawberries","🥤 Ube Shake"],
      zh:["🌲 伯纳姆公园","🌹 莱特公园","🏛️ 卢尔德圣母洞","🌳 矿景公园","🛍️ 公共市场","⛪ 碧瑶大教堂","🌳 植物园","🏛️ 本卡布博物馆","🏘️ 塔姆瓦村","🌳 复活节编织","🍢 皮尼皮坎鸡","🍗 烤肉","🥬 本格特蔬菜","🥖 碧瑶面包","☕ 高地咖啡","🍰 草莓派","🍓 碧瑶草莓","🥤 紫薯奶昔"],
      ko:["🌲 번햄공원","🌹 라이트공원","🏛️ 루르드","🌳 마인즈뷰","🛍️ 공공시장","⛪ 바기오대성당","🌳 식물원","🏛️ 벤캅박물관","🏘️ 땀아완","🌳 이스터위빙","🍢 삐닉삐깐","🍗 이그타일","🥬 벤겟채소","🥖 바기오빵","☕ 코르디예라커피","🍰 딸기파이","🍓 바기오딸기","🥤 우베쉐이크"],
      es:["🌲 Burnham Park","🌹 Wright Park","🏛️ Gruta Lourdes","🌳 Mines View","🛍️ Mercado Público","⛪ Catedral Baguio","🌳 Jardín Botánico","🏛️ Museo Bencab","🏘️ Tam-Awan","🌳 Easter Weaving","🍢 Pinikpikan","🍗 Igtail","🥬 Verduras Benguet","🥖 Pan Baguio","☕ Café Cordillera","🍰 Pay Fresa","🍓 Fresas Baguio","🥤 Batido Ube"],
      pt:["🌲 Burnham Park","🌹 Wright Park","🏛️ Gruta Lourdes","🌳 Mines View","🛍️ Mercado Público","⛪ Catedral Baguio","🌳 Jardim Botânico","🏛️ Museu Bencab","🏘️ Tam-Awan","🌳 Easter Weaving","🍢 Pinikpikan","🍗 Igtail","🥬 Verduras Benguet","🥖 Pão Baguio","☕ Café Cordillera","🍰 Torta Morango","🍓 Morangos Baguio","🥤 Smoothie Ube"]
    },
    イロイロ:{
      ja:["⛪ ミアガオ教会","⛪ ハロ教会","⛪ サンタバルバラ教会","🏰 モロ教会","🌊 ギマラス島","🛍️ ラパス市場","🏛️ イロイロ博物館","🌳 ノースイースト・パナイ","🌅 イロイロ川","🏖️ サンドホアキン","🍝 ラパス・バトチョイ","🍞 イロイロ・ビスケット","🥘 ポチェロ","🍢 イナサル","🍲 サニマ","🦞 シーフード","🍦 ハロハロ","🥤 マンゴーシェイク"],
      en:["⛪ Miagao Church","⛪ Jaro Cathedral","⛪ Sta. Barbara Church","🏰 Molo Church","🌊 Guimaras Island","🛍️ La Paz Market","🏛️ Iloilo Museum","🌳 Northeast Panay","🌅 Iloilo River","🏖️ San Joaquin","🍝 La Paz Batchoy","🍞 Iloilo Biscuits","🥘 Pochero","🍢 Inasal","🍲 Sanima","🦞 Seafood","🍦 Halo-Halo","🥤 Mango Shake"],
      zh:["⛪ 米亚高教堂","⛪ 哈罗大教堂","⛪ 圣芭芭拉教堂","🏰 莫洛教堂","🌊 吉马拉斯岛","🛍️ 拉巴斯市场","🏛️ 伊洛伊洛博物馆","🌳 东北班乃岛","🌅 伊洛伊洛河","🏖️ 圣华金","🍝 拉巴斯面","🍞 伊洛伊洛饼干","🥘 普切罗","🍢 烤鸡","🍲 萨尼马","🦞 海鲜","🍦 哈罗哈罗","🥤 芒果奶昔"],
      ko:["⛪ 미아가오 교회","⛪ 하로 대성당","⛪ 산타바르바라","🏰 몰로 교회","🌊 기마라스섬","🛍️ 라파스 시장","🏛️ 일로일로 박물관","🌳 노스이스트 빠나이","🌅 일로일로강","🏖️ 산호아킨","🍝 라파스 밧초이","🍞 일로일로 비스킷","🥘 뽀체로","🍢 이나살","🍲 사니마","🦞 해산물","🍦 할로할로","🥤 망고쉐이크"],
      es:["⛪ Iglesia Miagao","⛪ Catedral Jaro","⛪ Sta. Barbara","🏰 Iglesia Molo","🌊 Isla Guimaras","🛍️ Mercado La Paz","🏛️ Museo Iloilo","🌳 Panay Noreste","🌅 Río Iloilo","🏖️ San Joaquín","🍝 La Paz Batchoy","🍞 Galletas Iloilo","🥘 Pochero","🍢 Inasal","🍲 Sanima","🦞 Mariscos","🍦 Halo-Halo","🥤 Batido Mango"],
      pt:["⛪ Igreja Miagao","⛪ Catedral Jaro","⛪ Sta. Barbara","🏰 Igreja Molo","🌊 Ilha Guimaras","🛍️ Mercado La Paz","🏛️ Museu Iloilo","🌳 Panay Nordeste","🌅 Rio Iloilo","🏖️ San Joaquín","🍝 La Paz Batchoy","🍞 Biscoitos Iloilo","🥘 Pochero","🍢 Inasal","🍲 Sanima","🦞 Frutos do Mar","🍦 Halo-Halo","🥤 Smoothie Manga"]
    },
    タガイタイ:{
      ja:["🌋 タール火山","🌊 タール湖","🌳 ピープルズパーク・スカイ","🌳 スカイランチ","🛍️ ロマウィン","🛍️ コラスキー","🏛️ ピクニックグローブ","⛪ アワーレディ・オブ・ラ・サレット","🌊 ボートツアー","🏘️ メアリ・グッド","🍲 ブラロ","🥘 ブカヨ","🥥 ココナッツ","🍢 タガイタイBBQ","🍞 ハム","🥗 ピナベット","🍰 ハロハロ","🥤 マンゴーシェイク"],
      en:["🌋 Taal Volcano","🌊 Taal Lake","🌳 People's Park in the Sky","🌳 Sky Ranch","🛍️ Rowena's","🛍️ Colasiqui","🏛️ Picnic Grove","⛪ Our Lady of La Salette","🌊 Boat Tour","🏘️ Mary Good","🍲 Bulalo","🥘 Bukayo","🥥 Coconut","🍢 Tagaytay BBQ","🍞 Ham","🥗 Pinakbet","🍰 Halo-Halo","🥤 Mango Shake"],
      zh:["🌋 塔尔火山","🌊 塔尔湖","🌳 天空公园","🌳 天空牧场","🛍️ 罗维娜","🛍️ 科拉斯基","🏛️ 野餐林","⛪ 拉萨莱特圣母","🌊 游船","🏘️ 玛丽古德","🍲 牛骨汤","🥘 椰糖","🥥 椰子","🍢 塔加伊塔伊烤肉","🍞 火腿","🥗 蔬菜炖","🍰 哈罗哈罗","🥤 芒果奶昔"],
      ko:["🌋 따알 화산","🌊 따알 호수","🌳 천국공원","🌳 스카이랜치","🛍️ 로웨나","🛍️ 콜라스키","🏛️ 피크닉그로브","⛪ 라살레뜨 성모","🌊 보트투어","🏘️ 메리굿","🍲 불랄로","🥘 부까요","🥥 코코넛","🍢 따가이따이BBQ","🍞 햄","🥗 삐낙벳","🍰 할로할로","🥤 망고쉐이크"],
      es:["🌋 Volcán Taal","🌊 Lago Taal","🌳 People's Park","🌳 Sky Ranch","🛍️ Rowena's","🛍️ Colasiqui","🏛️ Picnic Grove","⛪ Lady La Salette","🌊 Tour Barco","🏘️ Mary Good","🍲 Bulalo","🥘 Bukayo","🥥 Coco","🍢 BBQ Tagaytay","🍞 Jamón","🥗 Pinakbet","🍰 Halo-Halo","🥤 Batido Mango"],
      pt:["🌋 Vulcão Taal","🌊 Lago Taal","🌳 People's Park","🌳 Sky Ranch","🛍️ Rowena's","🛍️ Colasiqui","🏛️ Picnic Grove","⛪ Lady La Salette","🌊 Tour Barco","🏘️ Mary Good","🍲 Bulalo","🥘 Bukayo","🥥 Coco","🍢 BBQ Tagaytay","🍞 Presunto","🥗 Pinakbet","🍰 Halo-Halo","🥤 Smoothie Manga"]
    }
  }
};
// ─────────────────────────────────────────────────────────
const PRICE_DB = {
  日本:{
    food:{
      "🏪 コンビニ":{min:150,avg:500,max:1200,trend:"+8%",reason:"おにぎり150〜250円、弁当400〜800円。消費税込み。"},
      "🍢 屋台":{min:300,avg:700,max:1500,trend:"+5%",reason:"フードコート・屋台は300〜1500円。"},
      "🍜 ローカル食堂":{min:500,avg:950,max:2000,trend:"+8%",reason:"ラーメン・定食500〜1500円。チップ不要。"},
      "🍣 チェーン":{min:400,avg:800,max:1500,trend:"+10%",reason:"吉野家400〜600円。マック700〜900円。"},
      "🍽️ カジュアル":{min:800,avg:1800,max:4000,trend:"+8%",reason:"ファミレス・居酒屋ランチ800〜2500円。"},
      "🥂 中級":{min:3000,avg:7000,max:15000,trend:"+8%",reason:"和食・焼肉中級3000〜15000円。"},
      "🥩 高級":{min:10000,avg:25000,max:80000,trend:"+10%",reason:"ミシュラン掲載・高級和食10000〜80000円以上。"},
      "👑 超高級":{min:25000,avg:60000,max:200000,trend:"+12%",reason:"割烹・フレンチ最高峰25000〜200000円。"},
      "🌅 朝食":{min:300,avg:800,max:3000,trend:"+5%",reason:"モーニング400〜800円。ホテルビュッフェ1500〜4000円。"},
      "☀️ ランチ":{min:700,avg:1200,max:3500,trend:"+8%",reason:"ランチセット800〜1800円が相場。"},
      "🌆 ディナー":{min:1500,avg:5000,max:40000,trend:"+10%",reason:"居酒屋コース3000〜8000円。"},
      "🍱 テイクアウト":{min:300,avg:700,max:1800,trend:"+8%",reason:"デパ地下・スーパーの惣菜300〜1800円。"},
      "☕ カフェ軽食":{min:700,avg:1400,max:3500,trend:"+5%",reason:"カフェランチ800〜2000円。"},
      "🌙 夜食":{min:300,avg:900,max:2500,trend:"+5%",reason:"コンビニ夜食300〜600円。ラーメン600〜1200円。"},
      "🍜 現地料理":{min:600,avg:1500,max:6000,trend:"+8%",reason:"寿司・ラーメン・天ぷら600〜6000円。"},
      "🍣 魚介・海鮮":{min:1200,avg:5000,max:40000,trend:"+10%",reason:"回転寿司110〜550円/皿。高級寿司8000〜40000円以上。"},
      "🥩 肉料理":{min:1000,avg:4000,max:25000,trend:"+10%",reason:"焼肉1500〜6000円/人。黒毛和牛は高め。"},
      "🌱 ベジタリアン":{min:800,avg:2500,max:8000,trend:"+8%",reason:"精進料理2000〜8000円。"},
      "🍕 洋食":{min:900,avg:2500,max:10000,trend:"+8%",reason:"洋食屋のハンバーグ・オムライス900〜2500円。"},
      "🍱 他国アジア":{min:800,avg:1800,max:6000,trend:"+7%",reason:"タイ料理・中華800〜3500円。"},
      "🍰 スイーツ":{min:300,avg:800,max:3500,trend:"+5%",reason:"和菓子300〜800円。カフェケーキ700〜1800円。"},
    },
    drink:{
      "🏪 コンビニ":{min:100,avg:180,max:350,trend:"+8%",reason:"ペットボトル飲料100〜200円。"},
      "🧋 タピオカ":{min:500,avg:750,max:1200,trend:"+5%",reason:"タピオカドリンク500〜900円。"},
      "☕ カフェ":{min:450,avg:700,max:1100,trend:"+8%",reason:"スタバ・ドトール等450〜900円。"},
      "🍺 バー":{min:500,avg:900,max:3000,trend:"+5%",reason:"居酒屋のビール500〜700円。チップ不要。"},
      "🧃 屋台ドリンク":{min:200,avg:400,max:800,trend:"+5%",reason:"自販機・お茶・ジュース200〜300円。"},
    },
    taxi:{
      "🚕 一般タクシー":{minPerKm:300,baseMin:730,baseAvg:730,surge:{"深夜":1.2,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+5%",reason:"初乗り730円（東京）。以降280mごと90円加算。5kmで約2200円、10kmで約3900円。深夜は2割増。"},
      "📱 Grab/Uber":{minPerKm:320,baseMin:800,baseAvg:900,surge:{"深夜":1.3,"夕方":1.1,"朝":1.0,"昼":1.0},trend:"+10%",reason:"Go・Uberは高品質。ピーク時サージあり。"},
      "🛺 トゥクトゥク":{minPerKm:0,baseMin:230,baseAvg:230,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+3%",reason:"日本にはありません。電車・バスが最適。"},
      "🚌 バス":{minPerKm:15,baseMin:170,baseAvg:230,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+5%",reason:"電車・バス170〜300円。Suica等ICカードが便利。"},
    },
    hotel:{
      "🏠 ゲストハウス":{min:3000,avg:5000,max:10000,trend:"+15%",reason:"カプセルホテル・ゲストハウス3000〜10000円。"},
      "⭐ ビジネス":{min:7000,avg:12000,max:22000,trend:"+15%",reason:"東横イン等7000〜18000円。"},
      "⭐⭐ 中級":{min:15000,avg:25000,max:50000,trend:"+18%",reason:"3〜4つ星15000〜50000円。訪日客増加で値上がり。"},
      "⭐⭐⭐ 高級":{min:35000,avg:70000,max:200000,trend:"+20%",reason:"帝国ホテル等35000〜200000円。"},
      "🏖️ リゾート":{min:25000,avg:60000,max:200000,trend:"+20%",reason:"沖縄・北海道リゾート25000〜200000円。"},
    },
    shopping:{
      "👕 衣料":{min:1000,avg:5000,max:50000,trend:"+5%",reason:"ユニクロ・GU1000〜3000円。デパートは高め。"},
      "💄 コスメ":{min:500,avg:3000,max:20000,trend:"+5%",reason:"ドラッグストアのコスメ500〜3000円。"},
      "🛒 スーパー":{min:100,avg:500,max:3000,trend:"+8%",reason:"品質が高く価格も安定。"},
      "🎁 おみやげ":{min:500,avg:2000,max:10000,trend:"+8%",reason:"ドラッグストアで同じ商品が空港より安い場合も。"},
      "💻 家電":{min:1000,avg:30000,max:300000,trend:"+3%",reason:"秋葉原・ビックカメラ。免税で消費税還付あり。"},
    },
    activity:{
      "🏛️ 観光入場":{min:0,avg:1200,max:10000,trend:"+10%",reason:"神社・寺院は無料〜1000円。テーマパーク8000〜10000円以上。"},
      "🤿 アクティビティ":{min:3000,avg:9000,max:35000,trend:"+8%",reason:"沖縄シュノーケリング3000〜12000円。"},
      "💆 マッサージ":{min:3000,avg:7000,max:25000,trend:"+5%",reason:"マッサージ3000〜8000円/時間。温泉500〜3000円。"},
      "🎭 エンタメ":{min:1500,avg:9000,max:35000,trend:"+8%",reason:"歌舞伎2000〜20000円。コンサート6000〜18000円。"},
      "🚌 ツアー":{min:4000,avg:12000,max:60000,trend:"+10%",reason:"日帰りバスツアー4000〜18000円。"},
    },
    famous:{
      東京:{
        "🍣 寿司（高級）":{min:6000,avg:20000,max:80000,trend:"+10%",reason:"銀座おまかせディナー20000〜40000円。最高級店40000〜80000円以上。ランチ6000〜10000円。"},
        "🍣 寿司（回転）":{min:500,avg:1800,max:5000,trend:"+8%",reason:"スシロー・くら寿司は税込120円皿〜。1人500〜3000円が標準。"},
        "🍜 ラーメン":{min:800,avg:1200,max:2500,trend:"+12%",reason:"標準店800〜1200円。高級店1500〜2500円。全国平均729円（2026年1月）。"},
        "🍤 天ぷら":{min:3000,avg:15000,max:30000,trend:"+8%",reason:"高級店ディナー15000〜30000円。ランチ3000〜8000円。パレスホテル巽22000円。"},
        "🥩 すき焼き":{min:10000,avg:18000,max:26000,trend:"+10%",reason:"中級10000〜15000円（人形町今半など）。松阪・米沢牛21000〜26000円（日山等）。"},
        "🥞 もんじゃ焼き":{min:1500,avg:2500,max:3500,trend:"+8%",reason:"月島もんじゃ。1人1500〜3500円。コース料理は2500円〜。"},
        "🍱 鰻重":{min:3000,avg:5500,max:10000,trend:"+15%",reason:"鰻重3000〜10000円。老舗高級店は8000円以上。鰻価格高騰中。"},
        "🐡 ふぐコース":{min:15000,avg:25000,max:40000,trend:"+8%",reason:"ふぐコース15000〜40000円。最高級店は40000円以上。"},
        "🐭 ディズニー":{min:7900,avg:9400,max:10900,trend:"+5%",reason:"東京ディズニーランド/シー 1デーパスポート7900〜10900円（6段階変動価格制）。"},
        "🗼 展望タワー":{min:1500,avg:2700,max:4800,trend:"+10%",reason:"東京タワーメインデッキ1500円。スカイツリー天望デッキ1800〜3600円。セット券3000〜4800円。渋谷スカイ2700〜3700円。"},
        "🎨 デジタルアート":{min:3800,avg:4000,max:4200,trend:"+5%",reason:"teamLab Planets TOKYO：平日3800円、休日4200円。中高生2800円。"},
        "🐠 水族館":{min:2400,avg:2700,max:3000,trend:"+8%",reason:"すみだ水族館2700円（2026.2.10改定）。サンシャイン水族館2600〜3000円。"},
        "🐼 動物園":{min:600,avg:600,max:600,trend:"±0%",reason:"上野動物園：一般600円、65歳以上300円、中学生200円、小学生以下無料。"},
        "🥋 大相撲観戦":{min:3500,avg:9000,max:15000,trend:"+5%",reason:"両国国技館：イスC席3500〜4000円、イスA席8000〜8500円、マスC席8500〜9500円、マスS席14000〜15000円。"},
        "👘 着物レンタル":{min:2000,avg:4000,max:11000,trend:"+8%",reason:"標準プラン3000〜5000円。カップル8000円。メンズ5000円。振袖9000〜11000円。"},
        "🍡 屋形船":{min:6000,avg:12000,max:25000,trend:"+10%",reason:"乗合ディナー10000〜25000円（食事飲み物込）。ランチ6000〜10000円。"},
        "🧙 ハリポタツアー":{min:6300,avg:6650,max:7000,trend:"+5%",reason:"ワーナーブラザース スタジオツアー東京：大人6300〜7000円（2026.1.17改定、時期で変動）。中人5200〜5800円。"},
        "🎬 ジブリ美術館":{min:1000,avg:1000,max:1000,trend:"±0%",reason:"三鷹の森ジブリ美術館：大人1000円、高校・中学700円、小学生400円、幼児（4歳〜）100円。完全予約制。"},
      },
      京都:{
        "⛩️ 清水寺":{min:500,avg:500,max:500,trend:"±0%",reason:"清水寺拝観料：大人500円、小中学生200円（2024年4月改定）。現金のみ。世界遺産。"},
        "🏯 金閣寺":{min:500,avg:500,max:500,trend:"±0%",reason:"鹿苑寺（金閣寺）：高校生以上500円、小中学生300円。世界遺産。"},
        "🏯 銀閣寺":{min:500,avg:500,max:500,trend:"±0%",reason:"慈照寺（銀閣寺）：高校生以上500円、小中学生300円（2026年4月改定予定）。世界遺産。"},
        "🦊 伏見稲荷":{min:0,avg:0,max:0,trend:"±0%",reason:"伏見稲荷大社：参拝料無料。24時間参拝可能。千本鳥居が有名。"},
        "🏰 二条城":{min:800,avg:1300,max:2300,trend:"+5%",reason:"入城料800円。入城+二の丸御殿1300円。本丸御殿（要予約）+1000円。世界遺産。"},
        "🚞 嵯峨野トロッコ":{min:880,avg:880,max:880,trend:"+5%",reason:"嵯峨野観光鉄道：大人880円、子供440円。嵐山〜亀岡を約25分。要事前予約推奨。"},
        "🚣 保津川下り":{min:6000,avg:6000,max:6000,trend:"+10%",reason:"保津川下り：大人6000円、子供4500円（2024年3月改定）。亀岡〜嵐山約16km・約90分の舟下り。"},
        "🚂 鉄道博物館":{min:1500,avg:1500,max:1500,trend:"+5%",reason:"京都鉄道博物館：一般1500円、大学・高校生1300円、中小学生500円、幼児200円。SLスチーム号別途。"},
        "🎬 太秦映画村":{min:2000,avg:2800,max:2800,trend:"+15%",reason:"太秦映画村1DAY：大人2800円、子供1600円。ナイトタイム2000円。2026年3月リニューアル後の新料金。"},
        "🍱 京懐石":{min:4500,avg:10000,max:30000,trend:"+10%",reason:"昼コース4500〜11000円。ディナーコース10000〜30000円。ミシュラン店は15000〜30000円以上。"},
        "🍲 湯豆腐":{min:1250,avg:3500,max:6000,trend:"+8%",reason:"嵐山・南禅寺名物。とようけ茶屋1250円〜。観光地の専門店3000〜6000円。コース料理は4000円〜。"},
        "🍵 抹茶パフェ":{min:1265,avg:1500,max:3000,trend:"+10%",reason:"茶寮都路里：都路里パフェ1474円、特選1694円、白玉1265円。祇園本店限定「建都の極」3000円。"},
        "🍜 京都ラーメン":{min:800,avg:1100,max:1500,trend:"+12%",reason:"第一旭・新福菜館など。背脂醤油系800〜1200円。京都駅周辺は1500円程度の店も。"},
        "🍜 にしんそば":{min:1200,avg:1500,max:2000,trend:"+8%",reason:"祇園・南座近くの松葉本店など。京都の老舗そばの代表メニュー。1200〜2000円。"},
        "🥟 京湯葉料理":{min:3000,avg:4500,max:7000,trend:"+8%",reason:"湯葉づくしコース。嵐山・南禅寺周辺の専門店。ランチ3000〜5000円、ディナー5000〜7000円。"},
        "👘 着物レンタル":{min:3000,avg:5000,max:8000,trend:"+8%",reason:"標準プラン3080〜7700円。ヘアセット込み4000〜6000円。カップル8000円前後。夢館・梨花和服など。"},
        "🍵 茶道体験":{min:3000,avg:4500,max:6000,trend:"+5%",reason:"茶道体験：3000〜6000円。着物レンタル併設プランも。京町家での本格体験は5000円〜。"},
        "💃 舞妓体験":{min:10000,avg:18000,max:25000,trend:"+8%",reason:"舞妓変身→撮影→散策プラン。スタジオ撮影のみ10000〜15000円。屋外散策付き18000〜25000円。"},
      },
      大阪:{
        "🎢 USJ":{min:8600,avg:10000,max:11900,trend:"+5%",reason:"USJ 1デイ・スタジオ・パス：大人8600〜11900円（変動価格制）、子供5600〜7400円。3歳以下無料。"},
        "🏯 大阪城":{min:1200,avg:1200,max:1200,trend:"+100%",reason:"大阪城天守閣（豊臣石垣館込）：大人1200円（2025年4月値上げ）、大学・高校生600円、中学生以下無料。"},
        "🐠 海遊館":{min:2400,avg:2700,max:3200,trend:"+8%",reason:"海遊館：大人2400〜3200円（4段階変動価格制）、シニア2200円、子供1400円、幼児700円。ジンベエザメで有名。"},
        "🗼 通天閣":{min:1500,avg:1500,max:1500,trend:"+25%",reason:"通天閣（一般+特別屋外展望台セット）：大人1500円、子供800円（2026年4月一本化）。ビリケンさん。"},
        "🏢 あべのハルカス":{min:2000,avg:2000,max:2000,trend:"+5%",reason:"ハルカス300：大人2000円、中高生1200円、小学生700円、幼児500円（4歳以上）。日本一高いビル300m。"},
        "🌉 空中庭園":{min:2000,avg:2000,max:2000,trend:"+5%",reason:"梅田スカイビル空中庭園展望台：大人2000円、4歳〜小学生500円。地上173m360度のパノラマ。"},
        "🚢 御座船":{min:1500,avg:1500,max:1500,trend:"+5%",reason:"大阪城御座船：大阪城お堀めぐり。大人1500円程度。黄金色の豪華船。約20分。"},
        "🐙 たこ焼き":{min:300,avg:600,max:1200,trend:"+10%",reason:"屋台6個300〜480円、8個400〜640円。店内10個600〜800円。道頓堀の人気店は1000〜1200円。"},
        "🥞 お好み焼き":{min:800,avg:1300,max:1800,trend:"+8%",reason:"豚玉800〜1200円。ミックス・海鮮入り1200〜1800円。鶴橋風月・千房など。"},
        "🍢 串カツ":{min:120,avg:200,max:300,trend:"+8%",reason:"1本120〜300円。だるま等の老舗。コース10本1500〜2500円。新世界・難波が有名。"},
        "🐡 てっちり":{min:10000,avg:15000,max:25000,trend:"+8%",reason:"ふぐ鍋コース10000〜25000円。大阪はふぐ消費量日本一。づぼらや跡や老舗専門店。"},
        "🍜 肉吸い":{min:800,avg:1000,max:1200,trend:"+10%",reason:"千とせ（千日前）の名物。肉うどんから麺を抜いた料理。800〜1200円。"},
        "🍣 大阪寿司":{min:1500,avg:2000,max:3000,trend:"+8%",reason:"押し寿司・バッテラ・箱寿司。1500〜3000円。吉野鯗・湖月など老舗。"},
        "🍱 かすうどん":{min:800,avg:1000,max:1200,trend:"+8%",reason:"大阪南部発祥。牛もつの揚げカスが入ったうどん。800〜1200円。「加寿屋」など。"},
        "🥟 551豚まん":{min:210,avg:240,max:500,trend:"+10%",reason:"551蓬莱の豚まん：1個210円〜。2個セット約500円。大阪土産の定番。蓬莱以外の店もあり。"},
        "🎭 なんば花月":{min:4800,avg:5000,max:5300,trend:"+5%",reason:"なんばグランド花月（吉本新喜劇）：1階指定席5300円、2階指定席4800円。学生・シニア割引あり。"},
        "🎡 観覧車":{min:600,avg:900,max:1000,trend:"+5%",reason:"道頓堀大観覧車（えびすタワー）600円。天保山大観覧車900円。HEPファイブ観覧車600円。"},
        "🚤 リバークルーズ":{min:900,avg:1200,max:1500,trend:"+8%",reason:"とんぼりリバークルーズ：大人1200円、子供600円。道頓堀川約20分の遊覧船。"},
      },
      札幌・北海道:{
        "🕰️ 札幌時計台":{min:350,avg:350,max:350,trend:"+75%",reason:"札幌市時計台：大人350円（2025年4月値上げ、旧200円）、大学生150円、高校生以下無料。国指定重要文化財。"},
        "🗼 さっぽろテレビ塔":{min:1200,avg:1200,max:1200,trend:"+5%",reason:"さっぽろテレビ塔展望台：大人1200円、高校生1000円、中学生600円、小学生400円、幼児100円。地上90mからのパノラマ。"},
        "⛷️ 大倉山リフト":{min:500,avg:1000,max:1000,trend:"±0%",reason:"大倉山ジャンプ競技場展望台リフト：往復大人1000円、小学生以下500円。片道大人500円。1972年札幌オリンピック会場。"},
        "🏅 オリンピックミュージアム":{min:670,avg:670,max:670,trend:"+5%",reason:"札幌オリンピックミュージアム：大人670円、中学生以下無料、65歳以上500円。大倉山リフトとのセット券1370円。"},
        "🍪 白い恋人パーク":{min:800,avg:800,max:800,trend:"+33%",reason:"白い恋人パーク有料エリア：大人800円（旧600円から値上げ）、4歳〜中学生400円、3歳以下無料。チョコレートテーマパーク。"},
        "🚠 もいわ山ロープウェイ":{min:1400,avg:2100,max:2100,trend:"+8%",reason:"札幌もいわ山ロープウェイ＋ミニケーブルカー往復：大人2100円、小人1050円。ロープウェイのみ往復1400円。日本新三大夜景。"},
        "🐑 羊ヶ丘展望台":{min:600,avg:600,max:600,trend:"±0%",reason:"さっぽろ羊ヶ丘展望台：大人600円、小中学生300円。札幌市民800円（年パス）。クラーク博士像で有名。"},
        "🍺 サッポロビール博物館":{min:0,avg:1000,max:1000,trend:"±0%",reason:"自由見学は無料。プレミアムツアー1000円（ビール2杯試飲付き、約50分、要事前予約）。日本唯一のビール博物館。"},
        "🏢 JRタワーT38":{min:740,avg:740,max:740,trend:"+5%",reason:"JRタワー展望室T38：大人740円、中高生520円、小学生・4歳以上320円、3歳以下無料。地上160mから360度のパノラマ。"},
        "🐻 円山動物園":{min:800,avg:800,max:800,trend:"+33%",reason:"札幌市円山動物園：大人800円（旧600円から値上げ）、高校生400円、中学生以下無料。約160種700点の動物。"},
        "🍜 札幌味噌ラーメン":{min:840,avg:1100,max:1500,trend:"+10%",reason:"札幌味噌ラーメン：840〜1500円。すみれ・白樺山荘・純連・彩未など名店多数。中太ちぢれ麺と濃厚味噌スープが特徴。"},
        "🐑 ジンギスカン":{min:1500,avg:2000,max:2500,trend:"+8%",reason:"ジンギスカン：1500〜2500円/人。だるま本店・松尾・サッポロビール園など。ラム肉を専用鍋で焼く北海道名物。"},
        "🍛 スープカレー":{min:1290,avg:1380,max:1800,trend:"+10%",reason:"スープカレー：1290〜1800円。GARAKU・マジックスパイス・RAMAI・スープカリーイエローなど名店多数。札幌発祥。"},
        "🍗 ザンギ":{min:800,avg:1000,max:1200,trend:"+8%",reason:"ザンギ定食：800〜1200円。中国料理布袋など。北海道風唐揚げで醤油ベースの濃いめ味付け。"},
        "🍣 海鮮丼":{min:1500,avg:2200,max:3000,trend:"+10%",reason:"海鮮丼：1500〜3000円。二条市場・場外市場・札幌中央卸売市場が有名。ウニ・イクラ・カニなど。"},
        "🍣 回転寿司":{min:1500,avg:2200,max:3000,trend:"+8%",reason:"回転寿司：1500〜3000円/人。根室花まる・トリトン・なごやか亭が人気。北海道産ネタが充実。"},
        "🦀 カニ料理":{min:3000,avg:8000,max:20000,trend:"+10%",reason:"カニ料理：3000〜20000円。札幌かに本家・かに将軍など。タラバ・ズワイ・毛ガニのコースが定番。"},
        "🌃 すすきの夜景":{min:0,avg:0,max:0,trend:"±0%",reason:"すすきの・ニッカ看板：見学無料。日本三大歓楽街の一つ。約3500軒の飲食店。撮影スポット。"},
      },
      仙台:{
        "🏯 仙台城跡":{min:0,avg:0,max:0,trend:"±0%",reason:"仙台城跡（青葉城）：見学無料。伊達政宗公騎馬像が有名。標高130mから仙台市街と太平洋を一望。国の史跡。"},
        "🏛️ 青葉城資料展示館":{min:700,avg:700,max:700,trend:"+5%",reason:"青葉城資料展示館：大人700円、中高生600円、小学生450円。CG映像「謹製仙台城」とVRゴーが好評。クーポンで500円。"},
        "⛩️ 瑞鳳殿":{min:570,avg:570,max:570,trend:"+5%",reason:"瑞鳳殿：一般・大学生570円、高校生410円、小中学生210円。伊達政宗公霊屋。桃山様式の豪華絢爛な廟建築。"},
        "🐠 うみの杜水族館":{min:2400,avg:2400,max:2400,trend:"+8%",reason:"仙台うみの杜水族館：大人2400円、中高生1700円、小学生1200円、幼児700円（4歳以上）、3歳以下無料。シニア1800円。"},
        "🚢 松島観光船":{min:1500,avg:1500,max:1500,trend:"+5%",reason:"松島島巡り観光船「仁王丸コース」：大人1500円、子供750円。約50分の松島湾遊覧。日本三景・松島の絶景を満喫。"},
        "⛵ 松島〜塩釜定期航路":{min:2900,avg:2900,max:2900,trend:"+5%",reason:"芭蕉コース（丸文松島汽船）：大人2900円、小学生1450円。松島〜塩釜間を結ぶ定期遊覧船。"},
        "⛩️ 大崎八幡宮":{min:0,avg:0,max:0,trend:"±0%",reason:"大崎八幡宮：参拝無料。伊達政宗公が創建した国宝建築。安土桃山時代の優美な権現造り。どんと祭で有名。"},
        "🎨 仙台メディアテーク":{min:0,avg:0,max:0,trend:"±0%",reason:"せんだいメディアテーク：入館・図書館利用無料。伊東豊雄設計の現代建築。ギャラリーは企画展により有料の場合あり。"},
        "🏛️ 仙台市博物館":{min:460,avg:460,max:460,trend:"+5%",reason:"仙台市博物館：一般460円、高大生230円、小中学生110円。伊達家寄贈品約11000件を含む歴史資料。常設展。"},
        "💧 秋保大滝":{min:0,avg:0,max:0,trend:"±0%",reason:"秋保大滝：見学無料。落差55m・幅6mの大瀑布。日本三大瀑布の一つ。国指定名勝。秋保温泉とセットで観光。"},
        "🐂 牛タン定食(ランチ)":{min:1320,avg:1700,max:2000,trend:"+8%",reason:"牛タン定食ランチ：1320〜2000円。たんや善治郎の駅前本店・別館の平日限定「丸たん得々定食」1320円が地元志向。"},
        "🐂 牛タン定食(標準)":{min:2000,avg:2300,max:2500,trend:"+10%",reason:"牛タン定食標準：2000〜2500円。利久・喜助・たんや善治郎など主要店の通常メニュー。麦飯・テールスープ付き。"},
        "🐂 牛タン定食(特上)":{min:3355,avg:4000,max:4675,trend:"+8%",reason:"特上・厚切り牛タン定食：3355〜4675円。利久西口本店の各2枚4切3355円〜、各3枚6切4675円。喜助の特切り厚焼。"},
        "🌿 ずんだ餅":{min:500,avg:750,max:1000,trend:"+8%",reason:"ずんだ餅：500〜1000円。ずんだ茶寮・村上屋餅店など。枝豆をすり潰した甘い緑色の餡。"},
        "🥤 ずんだシェイク":{min:500,avg:550,max:660,trend:"+10%",reason:"ずんだシェイク：500〜660円。ずんだ茶寮の元祖ずんだシェイクが有名。仙台駅で人気の名物ドリンク。"},
        "🐟 笹かまぼこ":{min:200,avg:300,max:500,trend:"+5%",reason:"笹かまぼこ：1枚200〜500円。鐘崎・阿部の笹かまぼこ・松澤蒲鉾店・佐々直など。伊達家家紋の笹の葉型。"},
        "🌙 萩の月":{min:200,avg:250,max:300,trend:"+8%",reason:"萩の月：1個約200円（簡易包装197円〜、化粧箱204円〜）。6個入1500円、8個入2000円、10個入2500円。菓匠三全の代表銘菓。"},
        "🍲 せり鍋":{min:1500,avg:2200,max:3000,trend:"+8%",reason:"せり鍋・伊達鶏料理：1500〜3000円。仙台名産のせり（根まで食べる）と伊達鶏を使った郷土料理。冬の名物。"},
      },
      横浜:{
        "🏢 ランドマークタワー展望台":{min:1000,avg:1000,max:1000,trend:"±0%",reason:"横浜ランドマークタワー69階スカイガーデン：大人1000円、高校生・65歳以上800円、小中500円、幼児200円。2026年1月〜2028年まで大規模修繕で営業休止中。"},
        "🎡 コスモクロック21":{min:900,avg:900,max:900,trend:"±0%",reason:"よこはまコスモワールドの大観覧車：1回900円（3歳以上）。1周約15分。全高112.5m。世界最大の時計機能付き観覧車。"},
        "🏮 横浜中華街":{min:0,avg:0,max:0,trend:"±0%",reason:"横浜中華街：散策無料。600軒以上の中華料理店が軒を連ねる日本最大の中華街。広東・北京・上海・四川料理。"},
        "🧱 赤レンガ倉庫":{min:0,avg:0,max:0,trend:"±0%",reason:"横浜赤レンガ倉庫：入館無料。1号館は文化施設、2号館は商業施設。明治・大正期の歴史的建造物。イベント多数。"},
        "🍜 カップヌードルミュージアム":{min:500,avg:500,max:500,trend:"±0%",reason:"カップヌードルミュージアム横浜：大人500円、高校生以下無料、未就学児無料。マイカップヌードルファクトリー別途500円。"},
        "🐬 八景島シーパラ ワンデーパス":{min:2400,avg:5700,max:5700,trend:"+5%",reason:"横浜・八景島シーパラダイス ワンデーパス：大人・高校生5700円、シニア・小中4100円、幼児2400円。4水族館+アトラクション乗り放題。"},
        "🐠 八景島アクアリゾーツパス":{min:3500,avg:3500,max:3500,trend:"+5%",reason:"アクアリゾーツパス（4水族館）：大人3500円。シーパラの4つの水族館巡り。アトラクションなし。"},
        "🗼 横浜マリンタワー":{min:1000,avg:1200,max:1400,trend:"+10%",reason:"横浜マリンタワー：平日デイ大人1000円、土日祝1200円、ナイト平日1200円・土日祝1400円。地上106mから360度パノラマ。"},
        "🚠 ヨコハマエアキャビン往復":{min:1000,avg:1800,max:1800,trend:"+5%",reason:"YOKOHAMA AIR CABIN：往復大人1800円（小人900円）、片道大人1000円（小人500円）。桜木町〜運河パーク約5分の都市型ロープウェイ。"},
        "🍜 新横浜ラーメン博物館":{min:450,avg:450,max:450,trend:"+45%",reason:"新横浜ラーメン博物館：大人450円、小中学生100円、シニア100円、高校生（学生証提示）100円、小学生未満無料。"},
        "🥟 中華街・本格中華":{min:2000,avg:4000,max:6000,trend:"+8%",reason:"横浜中華街の本格中華コース：2000〜6000円。聘珍樓・萬珍樓など老舗。広東料理を中心に北京・上海・四川料理。"},
        "🥡 中華街・食べ歩き":{min:300,avg:500,max:800,trend:"+10%",reason:"中華街食べ歩き：1品300〜800円。小籠包・肉まん・ゴマ団子・北京ダックなど。大通り沿いに屋台多数。"},
        "🍜 サンマーメン":{min:800,avg:1000,max:1200,trend:"+10%",reason:"サンマーメン：800〜1200円。横浜発祥のあんかけ麺。もやし・キャベツ等の野菜あんかけ。"},
        "🍜 家系ラーメン":{min:900,avg:1100,max:1500,trend:"+10%",reason:"家系ラーメン：900〜1500円。横浜発祥の豚骨醤油+太麺。吉村家・六角家など。"},
        "🫖 中華街飲茶":{min:3000,avg:4500,max:6000,trend:"+8%",reason:"中華街飲茶コース：3000〜6000円。ランチ飲茶コース3000円〜。小籠包・点心食べ放題プランも。"},
        "🍰 ありあけハーバー":{min:200,avg:250,max:300,trend:"+8%",reason:"ありあけ横濱ハーバー：1個約200〜300円。横浜銘菓のマロンカステラ。横浜土産の定番。"},
        "🍱 崎陽軒シウマイ弁当":{min:950,avg:950,max:950,trend:"+5%",reason:"崎陽軒シウマイ弁当：950円。横浜駅・崎陽軒のロングセラー駅弁。1日約2万食販売の人気。"},
        "🚢 クルーズディナー":{min:6000,avg:10000,max:15000,trend:"+10%",reason:"横浜港クルーズディナー：6000〜15000円。マリーンルージュ・ロイヤルウイング・シーバスなど。夜景と食事を楽しむ。"},
      },
      名古屋:{
        "🏯 名古屋城":{min:500,avg:500,max:500,trend:"±0%",reason:"名古屋城：大人500円、中学生以下無料。2026年10月から1000円に値上げ予定（32年ぶり）。本丸・二の丸など4エリア。天守閣は閉鎖中。"},
        "🐼 東山動植物園":{min:500,avg:500,max:500,trend:"±0%",reason:"東山動植物園：大人500円、中学生以下無料。2026年10月から800円に値上げ予定。約450種の動物と7000種の植物。コアラで有名。"},
        "🐠 名古屋港水族館":{min:2030,avg:2030,max:2030,trend:"+5%",reason:"名古屋港水族館：大人・高校生2030円、小中1010円、幼児（4歳以上）500円。シャチ・ベルーガが見られる。イルカパフォーマンス充実。"},
        "🧱 レゴランド":{min:4500,avg:6000,max:7400,trend:"+5%",reason:"レゴランドジャパン1DAYパスポート：大人4500〜7400円（6段階変動価格制）、子供3300〜4800円。3歳以下無料。当日窓口は+500円。"},
        "🚄 リニア・鉄道館":{min:1200,avg:1200,max:1200,trend:"+5%",reason:"JR東海リニア・鉄道館：大人1200円、小中高500円、幼児（3歳以上）200円。新幹線・在来線・リニア実物車両展示。"},
        "🔬 名古屋市科学館":{min:800,avg:800,max:800,trend:"±0%",reason:"名古屋市科学館（展示室+プラネタリウム）：一般800円、高校生・大学生500円、小中学生無料。2026年10月から1000円に値上げ予定。"},
        "⛩️ 熱田神宮":{min:0,avg:0,max:0,trend:"±0%",reason:"熱田神宮：参拝無料。三種の神器の一つ「草薙剣」を祀る格式高い神社。約1900年の歴史。"},
        "🏺 ノリタケの森":{min:0,avg:0,max:0,trend:"±0%",reason:"ノリタケの森：入園無料。クラフトセンター・ミュージアム入場500円。陶磁器メーカーノリタケの企業ミュージアム。"},
        "🚗 トヨタ産業技術記念館":{min:500,avg:500,max:500,trend:"±0%",reason:"トヨタ産業技術記念館：大人500円、中高生300円、小学生200円。トヨタグループ発祥の地に建つ産業遺産。"},
        "🗼 名古屋テレビ塔":{min:1300,avg:1300,max:1300,trend:"+8%",reason:"中部電力 MIRAI TOWER（名古屋テレビ塔）：大人1300円、小中600円。地上90mのスカイバルコニー。日本初の集約電波塔。"},
        "🍱 ひつまぶし":{min:4950,avg:5000,max:6500,trend:"+15%",reason:"ひつまぶし：あつた蓬莱軒で4950円（神宮店）。3通りの食べ方（そのまま・薬味・出汁茶漬け）。鰻価格高騰で値上がり中。"},
        "🥩 味噌カツ":{min:1500,avg:2000,max:2500,trend:"+10%",reason:"味噌カツ：1500〜2500円。矢場とん（わらじとんかつ・ロースとんかつ定食）。八丁味噌ベースの濃厚タレ。"},
        "🍲 味噌煮込みうどん":{min:1200,avg:1500,max:1800,trend:"+8%",reason:"味噌煮込みうどん：1200〜1800円。山本屋本店・山本屋総本家など。土鍋で煮込む濃厚味噌の固麺うどん。"},
        "🍗 手羽先":{min:600,avg:700,max:800,trend:"+8%",reason:"手羽先（世界の山ちゃん・風来坊）：5本600〜800円。10本1100〜1400円。スパイシーな名古屋名物。"},
        "🍝 きしめん":{min:800,avg:1100,max:1500,trend:"+8%",reason:"きしめん：800〜1500円。住よし・宮きしめんなど。平打ち麺の郷土料理。"},
        "🍝 あんかけスパゲッティ":{min:900,avg:1200,max:1500,trend:"+8%",reason:"あんかけスパゲッティ：900〜1500円。ヨコイ・スパ屋ピカイチ・からめ亭など。胡椒の効いた中華風あんかけパスタ。"},
        "🍜 台湾ラーメン":{min:800,avg:950,max:1200,trend:"+10%",reason:"台湾ラーメン：800〜1200円。味仙が発祥。激辛ミンチ肉とニラがのった担仔麺アレンジ。"},
        "🐔 名古屋コーチン":{min:3000,avg:5000,max:8000,trend:"+10%",reason:"名古屋コーチン料理：3000〜8000円。鳥銀本店・鳥開総本家。日本三大地鶏。コースで親子丼・水炊き・刺身。"},
      },
      神戸:{
        "🗼 神戸ポートタワー":{min:1000,avg:1200,max:1200,trend:"+10%",reason:"神戸ポートタワー：展望フロア+屋上デッキ大人1200円・子供500円、展望のみ大人1000円・子供400円。2024年リニューアル。"},
        "🏠 北野異人館 7館パス":{min:3000,avg:3000,max:3000,trend:"+5%",reason:"北野異人館プレミアムパス（7館+展望ギャラリー）：3000円。うろこの家・山手八番館・英国館など7館。単館購入より1550円お得。"},
        "🏘️ 北野異人館 単館":{min:500,avg:750,max:1050,trend:"+5%",reason:"北野異人館単館：500〜1050円。うろこの家1050円、風見鶏の館・萌黄の館700円、坂の上の異人館550円など。"},
        "🐼 神戸どうぶつ王国":{min:2400,avg:2400,max:2400,trend:"+9%",reason:"神戸どうぶつ王国：大人2400円（2026.4から、旧2200円）、小学生1200円、4-5歳500円、シニア1900円。マヌルネコ・ハシビロコウで有名。"},
        "🐑 六甲山牧場":{min:500,avg:500,max:500,trend:"±0%",reason:"神戸市立六甲山牧場：大人500円、子供200円。羊・牛・ヤギ・馬とふれあい。チーズ館・羊毛クラフト体験あり。"},
        "🚠 六甲山ロープウェー":{min:1100,avg:1850,max:1850,trend:"+5%",reason:"六甲有馬ロープウェー：往復大人1850円、片道1100円。表六甲線。六甲山頂と有馬温泉を結ぶ。約12分。"},
        "🌊 メリケンパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"メリケンパーク：入園無料。BE KOBEモニュメント・神戸海洋博物館がある神戸港の象徴的公園。フォトスポット。"},
        "🛍️ ハーバーランド":{min:0,avg:0,max:0,trend:"±0%",reason:"神戸ハーバーランド：商業エリア入場無料。umie・映画館・モザイクなど。神戸港の夜景スポット。"},
        "🌿 神戸布引ハーブ園":{min:1400,avg:2000,max:2000,trend:"+10%",reason:"神戸布引ハーブ園（ロープウェイ往復+入園）：大人2000円、子供1000円。片道大人1400円。新神戸駅から約10分の空中散歩。"},
        "🏮 南京町（中華街）":{min:0,avg:0,max:0,trend:"±0%",reason:"南京町：散策無料。日本三大中華街の一つ。元町商店街近くにあり、約100軒の中華料理店が並ぶ。"},
        "🥩 神戸牛ステーキ(ランチ)":{min:3000,avg:5000,max:7000,trend:"+10%",reason:"神戸牛ステーキランチ：3000〜7000円。喜山・八坐和・カワムラなど。ランチセット形式で気軽に味わえる。"},
        "🥩 神戸牛ステーキ(ディナー)":{min:10000,avg:18000,max:30000,trend:"+12%",reason:"神戸牛ステーキディナー：10000〜30000円。麤皮（ミシュラン2つ星）・モーリヤ・カワムラなど。コース料理。"},
        "🍔 神戸牛ハンバーグ":{min:2000,avg:2500,max:3000,trend:"+10%",reason:"神戸牛ハンバーグ：2000〜3000円。カワムラ・吉豊など。土鍋ハンバーグやランチプレートで提供。"},
        "🍴 神戸牛食べ放題":{min:2500,avg:3000,max:4000,trend:"+10%",reason:"神戸牛食べ放題：2500〜4000円。ノーブルウルスの神戸牛ハンバーグランチ食べ放題2500円など。"},
        "🍳 そばめし":{min:600,avg:750,max:900,trend:"+8%",reason:"そばめし：600〜900円。神戸長田発祥の鉄板料理。焼そばと白ご飯を細かく刻んで一緒に焼いたもの。"},
        "🐙 明石焼き":{min:600,avg:800,max:1000,trend:"+8%",reason:"明石焼き（玉子焼）：600〜1000円。卵多めのたこ焼き。出汁につけて食べる兵庫県明石の郷土料理。"},
        "🍮 神戸プリン":{min:300,avg:400,max:500,trend:"+5%",reason:"神戸プリン：300〜500円。トーラク社の代表商品。神戸土産の定番。柑橘系ソース付き。"},
        "🥘 ぼっかけ":{min:600,avg:900,max:1200,trend:"+8%",reason:"ぼっかけ：600〜1200円。神戸長田名物の牛すじ+こんにゃくの煮込み。うどん・ご飯にかけて食べる。"},
      },
      広島:{
        "🕊️ 平和記念資料館":{min:200,avg:200,max:200,trend:"±0%",reason:"広島平和記念資料館：大人200円、高校生100円、中学生以下無料、65歳以上100円、団体（30名以上）160円。重要文化財。"},
        "🏛️ 原爆ドーム":{min:0,avg:0,max:0,trend:"±0%",reason:"原爆ドーム：外観のみ見学無料。世界遺産。1945年8月6日の原爆で被災した旧広島県産業奨励館。"},
        "⛩️ 厳島神社 昇殿料":{min:300,avg:300,max:300,trend:"±0%",reason:"厳島神社昇殿料：大人300円、高校生200円、小中100円。世界遺産。海上に立つ大鳥居が象徴。"},
        "🎁 厳島神社+宝物館":{min:500,avg:500,max:500,trend:"±0%",reason:"厳島神社+宝物館共通券：大人500円、高校生300円、小中150円。神社単体より100円お得。"},
        "🏯 千畳閣":{min:100,avg:100,max:100,trend:"±0%",reason:"千畳閣（豊国神社）：大人100円、小中50円。豊臣秀吉建立。畳857枚分の広さの大経堂。"},
        "🚠 宮島ロープウェイ往復":{min:1100,avg:1800,max:1800,trend:"+5%",reason:"宮島ロープウェー：往復大人1800円、片道1100円。弥山中腹の獅子岩駅まで。瀬戸内海の絶景。"},
        "⛴️ 宮島フェリー片道":{min:180,avg:180,max:180,trend:"+5%",reason:"宮島フェリー片道：大人180円、小人90円。JR西日本宮島フェリー・宮島松大汽船の2社運航。宮島訪問税含む。"},
        "🏯 広島城":{min:370,avg:370,max:370,trend:"±0%",reason:"広島城天守閣：大人370円、シニア・高校生180円、中学生以下無料。2025年から耐震工事による長期閉館予定。"},
        "🚢 大和ミュージアム":{min:500,avg:500,max:500,trend:"±0%",reason:"大和ミュージアム（呉市海事歴史科学館）：一般500円、高校生300円、小中200円、未就学児無料。10分の1戦艦大和模型が圧巻。"},
        "🚠 千光寺山ロープウェイ往復":{min:500,avg:700,max:700,trend:"+5%",reason:"千光寺山ロープウェイ：往復大人700円、片道500円、子供往復350円・片道250円。尾道の街並みと瀬戸内海を一望。"},
        "🥞 広島風お好み焼き":{min:1000,avg:1300,max:1800,trend:"+10%",reason:"広島風お好み焼き：1000〜1800円。みっちゃん総本店・八昌・電光石火など名店多数。そば・うどん入り重ね焼き。"},
        "🦪 焼き牡蠣":{min:500,avg:600,max:800,trend:"+10%",reason:"焼き牡蠣：2個500円〜。宮島の店頭でその場で焼いて販売。生牡蠣1個300円〜。広島県は牡蠣生産日本一。"},
        "🍱 あなご飯":{min:1800,avg:2200,max:3000,trend:"+12%",reason:"あなご飯：1800〜3000円。宮島名物。うえののあなご飯弁当2160円が有名。香ばしく焼いたあなごをご飯にのせる。"},
        "🍜 広島ラーメン":{min:800,avg:1000,max:1200,trend:"+10%",reason:"広島ラーメン：800〜1200円。すずめ・我馬・陽気など。豚骨醤油ベースの中華そば。"},
        "🌶️ 汁なし担々麺":{min:800,avg:1000,max:1200,trend:"+10%",reason:"汁なし担々麺：800〜1200円。キング軒・くにまつ・きさく・武蔵坊など。広島発祥のご当地グルメ。"},
        "🍁 もみじ饅頭":{min:120,avg:150,max:200,trend:"+5%",reason:"もみじ饅頭：1個120〜200円。にしき堂・藤い屋・やまだ屋など。広島土産の定番。あんこ・クリーム・チーズなど多彩。"},
        "🍩 揚げもみじ":{min:200,avg:230,max:250,trend:"+5%",reason:"揚げもみじ：1個200〜250円。紅葉堂が元祖。サクサクの揚げ饅頭。あん・クリーム・チーズ味。"},
        "🍋 レモン菓子":{min:300,avg:500,max:800,trend:"+8%",reason:"瀬戸内レモン菓子：300〜800円。瀬戸内レモンケーキ・レモスコ・レモン羊羹など。広島県生口島がレモン生産日本一。"},
      },
      "博多・福岡":{
        "⛩️ 太宰府天満宮":{min:0,avg:0,max:0,trend:"±0%",reason:"太宰府天満宮：参拝無料。学問の神様・菅原道真を祀る。全国天満宮の総本山。受験合格祈願で有名。"},
        "🗼 福岡タワー":{min:800,avg:800,max:800,trend:"+10%",reason:"福岡タワー：大人800円、小中500円、4歳〜200円。地上234m。全長海浜タワーで日本一の高さ。"},
        "🐠 マリンワールド海の中道":{min:2500,avg:2500,max:2500,trend:"+5%",reason:"マリンワールド海の中道：大人2500円、シニア2200円、小中1200円、幼児700円。九州の海をテーマ。350種3万点。"},
        "🌳 海の中道海浜公園":{min:450,avg:450,max:450,trend:"±0%",reason:"国営海の中道海浜公園：大人450円、中学生以下無料、シニア210円。広大な国営公園。サンシャインプール（夏期）別途。"},
        "🛍️ キャナルシティ博多":{min:0,avg:0,max:0,trend:"±0%",reason:"キャナルシティ博多：入場無料。商業施設・噴水ショー無料。映画館・劇場・ホテル・ラーメンスタジアム併設。"},
        "🐼 福岡市動物園":{min:600,avg:600,max:600,trend:"±0%",reason:"福岡市動物園：大人600円、高校生300円、中学生以下無料。福岡市民の憩いの場。植物園と隣接。"},
        "⛩️ 櫛田神社":{min:0,avg:0,max:0,trend:"±0%",reason:"櫛田神社：参拝無料。博多の総鎮守。博多祇園山笠の起点。境内に飾り山笠あり。"},
        "🚉 博多駅":{min:0,avg:0,max:0,trend:"±0%",reason:"JR博多駅：入場無料。九州新幹線・在来線の終着駅。JR博多シティ・KITTE博多・博多デイトスで買物グルメ充実。"},
        "🌸 能古島アイランドパーク":{min:1200,avg:1200,max:1200,trend:"+5%",reason:"のこのしまアイランドパーク：大人1200円、小中600円、幼児400円。フェリー別途（市営¥230片道）。季節の花畑。"},
        "🎨 福岡市美術館":{min:200,avg:200,max:200,trend:"±0%",reason:"福岡市美術館 常設展：大人200円、高校生150円、中学生以下無料。日本・アジア・現代美術。特別展は別料金。"},
        "🍜 豚骨ラーメン":{min:900,avg:1050,max:1200,trend:"+12%",reason:"豚骨ラーメン：900〜1200円。一風堂白丸950円・一蘭980円・元祖長浜屋等。博多発祥の細麺・替玉文化。"},
        "🏮 屋台ラーメン":{min:800,avg:900,max:1000,trend:"+10%",reason:"屋台ラーメン：800〜1000円。中洲・天神・長浜の屋台。豚骨ベース。ビールやおでんも楽しめる。"},
        "🍲 もつ鍋":{min:2000,avg:2500,max:3000,trend:"+10%",reason:"もつ鍋：1人前2000〜3000円。やまや・笑楽・楽天地・一藤など。醤油・味噌・水炊き風など味付け多彩。"},
        "🐔 水炊き":{min:3000,avg:4500,max:6000,trend:"+10%",reason:"水炊き：1人前3000〜6000円。華味鳥・橙・とり田など。鶏白湯スープと地鶏。コースで5000円〜。"},
        "🌶️ 明太子":{min:1500,avg:2200,max:3000,trend:"+10%",reason:"辛子明太子：100gあたり1500〜3000円。ふくや・かねふく・椒房庵など。福岡の代表的お土産。"},
        "🍱 明太重":{min:1800,avg:1980,max:2200,trend:"+8%",reason:"明太重・めんたい重：1800〜2200円。元祖博多めんたい重1,980円。昆布巻き明太子を一本ご飯にのせる。"},
        "🐟 ごまさば":{min:900,avg:1200,max:1500,trend:"+10%",reason:"ごまさば：900〜1500円。博多名物の鯖刺身ゴマ醤油和え。定食1990円〜。新鮮な真鯖を使用。"},
        "🍢 焼き鳥(とり皮)":{min:150,avg:200,max:300,trend:"+8%",reason:"とり皮：1本150〜300円。福岡名物の鶏皮ぐるぐる巻き焼き。秘伝のタレで何度も焼き直す。"},
      },
      "那覇・沖縄":{
        "🐋 美ら海水族館":{min:710,avg:2180,max:2180,trend:"+5%",reason:"沖縄美ら海水族館：大人2180円、高校生1440円、小中710円、6歳未満無料。ジンベエザメ・マンタが見られる「黒潮の海」が圧巻。"},
        "🏯 首里城公園":{min:400,avg:400,max:400,trend:"±0%",reason:"首里城公園 有料区域：大人400円、高校生300円、小中160円。2019年焼失。現在は復元工事見学エリア。世界遺産。"},
        "🛍️ 国際通り":{min:0,avg:0,max:0,trend:"±0%",reason:"国際通り：散策無料。那覇のメインストリート約1.6km。お土産店・飲食店・市場が並ぶ。「奇跡の1マイル」と呼ばれる。"},
        "🕳️ おきなわワールド":{min:2000,avg:2000,max:2000,trend:"+5%",reason:"おきなわワールド・文化王国玉泉洞：大人2000円、小人1000円。日本最大級の鍾乳洞・エイサーショー・伝統工芸体験。"},
        "🕊️ ひめゆりの塔":{min:450,avg:450,max:450,trend:"±0%",reason:"ひめゆり平和祈念資料館：大人450円、高校生250円、小中150円。沖縄戦の女子学生隊の悲劇を伝える。"},
        "🌊 万座毛":{min:100,avg:100,max:100,trend:"±0%",reason:"万座毛：駐車場・施設利用料100円程度。象の鼻のような岩と東シナ海の絶景。恩納村の名勝。"},
        "🗼 古宇利オーシャンタワー":{min:1000,avg:1000,max:1000,trend:"+5%",reason:"古宇利オーシャンタワー：大人1000円、小中500円。古宇利大橋・ハートロックを一望。貝殻ミュージアム併設。"},
        "🍍 ナゴパイナップルパーク":{min:1200,avg:1500,max:1500,trend:"+25%",reason:"ナゴパイナップルパーク：2025年5月から大人1500円（旧1200円）。パイナップル号で自動運転。試食・お土産充実。"},
        "🕊️ 沖縄平和祈念堂":{min:450,avg:450,max:450,trend:"±0%",reason:"沖縄平和祈念堂：大人450円、シニア350円。沖縄戦没者を慰霊する施設。摩文仁の丘・平和祈念公園内。"},
        "🏯 識名園":{min:400,avg:400,max:400,trend:"±0%",reason:"識名園（世界遺産）：大人400円、中学生以下200円。琉球王家の別邸。回遊式庭園。"},
        "🍜 沖縄そば":{min:700,avg:900,max:1200,trend:"+10%",reason:"沖縄そば（ソーキそば）：700〜1200円。首里そば・沖縄そばじゅん・てぃあんだーなど。豚骨カツオ出汁の小麦麺。"},
        "🍳 ゴーヤチャンプルー":{min:800,avg:1000,max:1200,trend:"+8%",reason:"ゴーヤチャンプルー定食：800〜1200円。沖縄家庭料理の代表。苦瓜・豆腐・卵・豚肉の炒め物。"},
        "🥩 ラフテー":{min:800,avg:1200,max:1500,trend:"+10%",reason:"ラフテー：800〜1500円。豚バラの角煮を泡盛・黒糖で煮込む沖縄宮廷料理。定食1200〜2000円。"},
        "🌿 海ぶどう":{min:600,avg:900,max:1200,trend:"+10%",reason:"海ぶどう：1皿600〜1200円。プチプチした食感の海藻。三杯酢やワサビ醤油で食べる沖縄名物。"},
        "🍩 サーターアンダギー":{min:80,avg:120,max:150,trend:"+8%",reason:"サーターアンダギー：1個80〜150円。沖縄風揚げドーナツ。プレーン・黒糖・紅芋など味多彩。"},
        "🍪 ちんすこう":{min:300,avg:500,max:800,trend:"+5%",reason:"ちんすこう：1箱8〜12個入り300〜800円。琉球王朝伝統菓子。沖縄土産の定番。新垣菓子店が老舗。"},
        "🥜 ジーマミ豆腐":{min:400,avg:500,max:600,trend:"+8%",reason:"ジーマミ豆腐：400〜600円。落花生（ピーナッツ）の絞り汁でつくる沖縄の郷土料理。もちもち食感。"},
        "🍚 タコライス":{min:800,avg:1000,max:1300,trend:"+10%",reason:"タコライス：800〜1300円。キングタコス（金武町）発祥。米軍文化由来。タコスの具をご飯にのせる。"},
      },
    },
  },
  韓国:{
    famous:{
      ソウル:{
        "🏯 景福宮":{min:3000,avg:3000,max:3000,trend:"±0%",reason:"景福宮：大人₩3,000、18歳以下・65歳以上無料。朝鮮王朝最大の宮殿。韓服着用なら無料。守門将交代式は1日2回。"},
        "🗼 Nソウルタワー":{min:21000,avg:21000,max:29000,trend:"+15%",reason:"Nソウルタワー展望台：大人₩21,000、子供・シニア₩16,000。最新公式価格は₩26,000〜₩29,000まで上がっており、変動制で時期によって異なる。"},
        "🚠 南山ケーブルカー":{min:14000,avg:14000,max:14000,trend:"+5%",reason:"南山ケーブルカー往復：大人₩14,000、子供₩10,500。片道は₩11,500/₩9,000。明洞からNソウルタワーへの最速ルート。"},
        "🎢 ロッテワールド":{min:46000,avg:62000,max:62000,trend:"+10%",reason:"ロッテワールド1日券：大人₩62,000、中人₩52,000、小人₩46,000。屋内・屋外2エリアの大型遊園地。KKday等で割引あり（₩35,000〜）。"},
        "🏘️ 北村韓屋村":{min:0,avg:0,max:0,trend:"±0%",reason:"北村韓屋村：散策無料。約900軒の韓屋（伝統家屋）が並ぶ。現在も住民が住んでいるため早朝・夜間は静かに。"},
        "🛍️ 明洞":{min:0,avg:0,max:0,trend:"±0%",reason:"明洞：散策・ショッピング無料。ソウル一の繁華街。コスメ・グルメ・両替所が集中。屋台多数。"},
        "🎨 仁寺洞":{min:0,avg:0,max:0,trend:"±0%",reason:"仁寺洞：散策無料。伝統工芸・骨董・伝統茶屋が並ぶ文化通り。お土産にぴったり。"},
        "🏛️ DDP":{min:0,avg:0,max:0,trend:"±0%",reason:"東大門デザインプラザ（DDP）：入場無料。ザハ・ハディド設計。特別展は別途料金（₩10,000〜₩20,000）。夜のLEDバラ畑が有名。"},
        "🏯 昌徳宮":{min:3000,avg:3000,max:8000,trend:"+5%",reason:"昌徳宮：大人₩3,000、秘苑見学は別途₩5,000で要事前予約。世界遺産。朝鮮王朝の正宮。"},
        "🚢 漢江遊覧船":{min:16000,avg:16000,max:25000,trend:"+8%",reason:"漢江遊覧船：基本コース大人₩16,000、ナイト・スペシャルは₩25,000まで。約70分でソウル中心部の景色を楽しめる。"},
        "🥩 サムギョプサル":{min:9500,avg:12000,max:15000,trend:"+12%",reason:"サムギョプサル1人前（150g）：₩9,500〜₩15,000。観光地（明洞）は割高、弘大・延南洞は₩7,500〜とお得。2人前から注文が基本。"},
        "🍚 ビビンバ":{min:8000,avg:10000,max:12000,trend:"+10%",reason:"ビビンバ：₩8,000〜₩12,000。石焼ビビンバ・ユッケビビンバは₩12,000〜₩15,000。コネスト等で人気店多数。"},
        "🍜 冷麺":{min:8000,avg:10000,max:14000,trend:"+10%",reason:"冷麺：₩8,000〜₩14,000。平壌冷麺の老舗（乙密台等）は₩14,000前後。咸興冷麺はビビン冷麺で辛い。"},
        "🍲 サムゲタン":{min:15000,avg:17000,max:20000,trend:"+8%",reason:"サムゲタン：₩15,000〜₩20,000。土俗村サムゲタン・百年土種参鶏湯など名店多数。漢方鶏スープ料理。"},
        "🌶️ トッポッキ":{min:4000,avg:5000,max:8000,trend:"+10%",reason:"トッポッキ：屋台₩4,000〜₩6,000、専門店₩6,000〜₩8,000。チーズ・ラーメン追加で₩2,000〜。"},
        "🍗 韓国チキン":{min:18000,avg:22000,max:28000,trend:"+12%",reason:"韓国チキン1羽：₩18,000〜₩28,000。BBQ・キョチョン・ノルブ等。チメク（チキン+ビール）文化。配達料₩3,000〜。"},
        "🍙 キンパ":{min:3000,avg:4000,max:6000,trend:"+10%",reason:"キンパ1本：₩3,000〜₩6,000。明洞餃子・キンパ天国など。プレミアム店は₩7,000〜₩10,000。"},
        "🍱 韓定食コース":{min:30000,avg:55000,max:80000,trend:"+10%",reason:"韓定食コース：₩30,000〜₩80,000。三清閣・コリアハウス等の宮廷料理。10〜20品の伝統料理。"},
      },
      仁川:{
        "✈️ 仁川国際空港":{min:0,avg:0,max:0,trend:"±0%",reason:"仁川国際空港：入場無料。世界トップクラスの空港。アイススケート場・カジノ・スパ等。ターミナル間移動はシャトルバス。"},
        "🌊 月尾島":{min:0,avg:0,max:0,trend:"±0%",reason:"月尾島：入島無料。文化通り散策・海鮮料理が名物。月尾テーマパークは別途料金。"},
        "🌳 ソンドセントラルパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"ソンドセントラルパーク：入園無料。仁川経済自由区域の中心。ボート₩8,000・水上タクシー₩4,000。"},
        "🏮 チャイナタウン":{min:0,avg:0,max:0,trend:"±0%",reason:"仁川チャイナタウン：散策無料。韓国最大規模。チャジャン麺発祥の地。三国志壁画通り。"},
        "🏛️ ソンドコンベンシア":{min:0,avg:0,max:0,trend:"±0%",reason:"ソンドコンベンシア：入場無料。国際会議場。周辺に高層ビル・トリプルストリート商業施設。"},
        "🌳 自由公園":{min:0,avg:0,max:0,trend:"±0%",reason:"自由公園：入園無料。韓国最古の西洋式公園（1888年開園）。マッカーサー像・桜の名所。"},
        "🛍️ 新浦国際市場":{min:0,avg:0,max:0,trend:"±0%",reason:"新浦国際市場：入場無料。チメク・新浦サンドイッチ・ダッカンジョン（甘辛チキン）が名物。"},
        "⚾ Wyverns野球":{min:8000,avg:15000,max:30000,trend:"+10%",reason:"SSGランダースホーム試合：内野₩8,000〜外野₩30,000。文鶴球場（インチョンSSGランダースフィールド）。"},
        "🎢 月尾テーマパーク":{min:25000,avg:30000,max:35000,trend:"+8%",reason:"月尾テーマパーク自由利用券：大人₩30,000、小人₩25,000。バイキング・ディスコパンパン等。"},
        "🌉 仁川大橋":{min:0,avg:0,max:0,trend:"±0%",reason:"仁川大橋：通行無料（一般道）、有料区間あり。世界6位の長さの斜張橋（21.4km）。"},
        "🍜 チャジャン麺":{min:6000,avg:8000,max:12000,trend:"+10%",reason:"チャジャン麺：仁川チャイナタウン発祥。₩6,000〜₩12,000。元祖韓国式中華の代表料理。"},
        "🍲 海鮮鍋":{min:25000,avg:40000,max:60000,trend:"+10%",reason:"海鮮鍋（ヘムルタン）：2〜3人前₩25,000〜₩60,000。新浦・月尾島の港町ならではの新鮮さ。"},
        "🌶️ 新浦ラッポッキ":{min:6000,avg:8000,max:10000,trend:"+10%",reason:"新浦ラッポッキ（トッポッキ+ラーメン）：₩6,000〜₩10,000。新浦国際市場が発祥地。"},
        "🦪 月尾島貝焼き":{min:30000,avg:40000,max:60000,trend:"+10%",reason:"貝焼き（チョゲグイ）：2人前盛り合わせ₩30,000〜₩60,000。月尾島の海岸沿いの専門店。"},
        "🥖 シナモンパン":{min:3000,avg:5000,max:8000,trend:"+10%",reason:"イ・ガネ・シナモンロール（コルモク食堂）：₩3,000〜。仁川名物のスイーツパン。"},
        "🍞 アンパン":{min:1500,avg:2500,max:4000,trend:"+8%",reason:"新浦アンパン（あんこパン）：₩1,500〜₩4,000。控菜豆あん入りが特徴。仁川の老舗パン。"},
        "🥞 海鮮チヂミ":{min:12000,avg:18000,max:25000,trend:"+10%",reason:"海鮮チヂミ（ヘムルパジョン）：₩12,000〜₩25,000。マッコリと合わせて楽しむ韓国伝統料理。"},
        "🍺 生ビール":{min:4000,avg:6000,max:8000,trend:"+8%",reason:"生ビール500ml：₩4,000〜₩8,000。チャイナタウン・月尾島の海風と一緒に。"},
      },
      釜山:{
        "🏖️ 海雲台ビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"海雲台ビーチ：入場無料。1.5kmの白砂ビーチ。夏は釜山最大の海水浴場。パラソル・チェア₩10,000〜。"},
        "🏘️ 甘川文化村":{min:0,avg:0,max:0,trend:"±0%",reason:"甘川文化村：入村無料。「韓国のマチュピチュ」。スタンプツアーマップ₩2,000で33ヶ所巡れる。9〜18時。"},
        "🐟 チャガルチ市場":{min:0,avg:0,max:0,trend:"±0%",reason:"チャガルチ市場：入場無料。韓国最大の海鮮市場。1階で購入→2階食堂で調理可能（調理代別途）。"},
        "🏯 海東龍宮寺":{min:0,avg:0,max:0,trend:"±0%",reason:"海東龍宮寺：参拝無料。韓国で唯一の海辺の仏教寺院。1376年創建。日の出スポット・桜の名所。"},
        "🗼 釜山タワー":{min:12000,avg:12000,max:12000,trend:"+10%",reason:"釜山タワー（ダイヤモンドタワー）：大人₩12,000、小中高₩9,000、幼児₩6,000。龍頭山公園内、地上120m。"},
        "🚂 ブルーラインパーク":{min:7000,avg:13000,max:20000,trend:"+8%",reason:"海雲台ブルーラインパーク：海岸列車₩7,000、空中カプセル₩30,000（往復）。海沿いの絶景観光列車。"},
        "🌊 太宗台":{min:0,avg:0,max:0,trend:"±0%",reason:"太宗台：入場無料。ダヌビー列車₩4,000で園内移動可能。釜山南端の絶壁・灯台・展望台。"},
        "🏖️ 広安里ビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"広安里ビーチ：入場無料。広安大橋の夜景が美しい。海沿いのカフェ・バー・ナイトクラブ多数。"},
        "🌳 龍頭山公園":{min:0,avg:0,max:0,trend:"±0%",reason:"龍頭山公園：入場無料。釜山タワー・李舜臣将軍像。エスカレーターで南浦洞・国際市場から徒歩アクセス。"},
        "🚠 松島ケーブルカー":{min:17000,avg:23000,max:28000,trend:"+10%",reason:"松島海上ケーブルカー：往復大人₩17,000（一般）・₩23,000（クリスタル床）。海上1.62km、世界最長クラス。"},
        "🍲 豚クッパ":{min:8000,avg:10000,max:13000,trend:"+10%",reason:"テジクッパ（豚クッパ）：₩8,000〜₩13,000。釜山発祥のソウルフード。西面・凡一洞の豚クッパ通りが有名。"},
        "🍜 ミルミョン":{min:7000,avg:9000,max:12000,trend:"+10%",reason:"ミルミョン（小麦粉冷麺）：₩7,000〜₩12,000。釜山戦争時代発祥。ピョン豚クッパ・佳夜ミルミョン名店。"},
        "🦐 海鮮鍋":{min:30000,avg:45000,max:70000,trend:"+10%",reason:"海鮮鍋（ヘムルタン）：2〜3人前₩30,000〜₩70,000。チャガルチ市場・海雲台が新鮮で名物。"},
        "🐟 刺身":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"刺身（フェ）：1〜2人前₩30,000〜₩100,000。チャガルチ・海雲台で新鮮な活魚を選んで調理してもらう。"},
        "🐙 ナクチポックム":{min:12000,avg:18000,max:25000,trend:"+10%",reason:"ナクチポックム（タコ炒め）：₩12,000〜₩25,000。激辛が特徴。釜山名物の屋台料理。"},
        "🍚 デジクッパ":{min:8000,avg:10000,max:13000,trend:"+10%",reason:"デジクッパ：豚クッパと同義（釜山方言）。₩8,000〜₩13,000。深いコクのあるスープご飯。"},
        "🦐 エビ焼き":{min:35000,avg:50000,max:80000,trend:"+10%",reason:"エビ焼き（セウグイ）：1人前₩35,000〜₩80,000。塩釜で焼く新鮮なエビ料理。海雲台の名店多数。"},
        "🍹 シッケ":{min:3000,avg:5000,max:8000,trend:"+8%",reason:"シッケ（米の甘酒）：1杯₩3,000〜₩8,000。釜山伝統の発酵飲料。冷たく爽やか。"},
      },
      大邱:{
        "🚠 八公山ロープウェイ":{min:11000,avg:11000,max:11000,trend:"+5%",reason:"八公山ロープウェイ往復：大人₩11,000、子供₩7,000。標高820mの絶景。桐華寺へのアクセス。"},
        "🛍️ 西門市場":{min:0,avg:0,max:0,trend:"±0%",reason:"西門市場：入場無料。韓国3大市場の1つ。夜市が有名（金・土曜）。納豆チム・キムチが名物。"},
        "🛍️ 東城路":{min:0,avg:0,max:0,trend:"±0%",reason:"東城路：散策無料。大邱の明洞と呼ばれる繁華街。ファッション・グルメ・カフェが集中。"},
        "🏛️ 近代文化通り":{min:5000,avg:5000,max:5000,trend:"±0%",reason:"近代文化通りツアー：日本語ガイド₩5,000〜。日本統治時代の建物・教会・歴史的建造物を巡る。"},
        "⛪ 桂山聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"桂山聖堂：見学無料。1902年建造の韓国最古のゴシック式聖堂の一つ。国指定史跡。"},
        "🌿 薬令市":{min:0,avg:0,max:0,trend:"±0%",reason:"薬令市（韓医薬博物館）：散策無料、博物館入館₩1,000。350年以上の歴史を持つ韓方薬市場。"},
        "🗼 大邱83タワー":{min:10000,avg:10000,max:10000,trend:"+5%",reason:"大邱83タワー展望台：大人₩10,000、小人₩7,000。地上202m。頭流公園内、リフトで山頂へ。"},
        "🌳 頭流公園":{min:0,avg:0,max:0,trend:"±0%",reason:"頭流公園：入園無料。大邱最大の都市公園。文化芸術会館・83タワー・遊園地（パンビロランド）併設。"},
        "🛍️ 安吉モクチェ通り":{min:0,avg:0,max:0,trend:"±0%",reason:"安吉モクチェ通り：散策無料。家具・木工芸品の専門通り。インテリア好きに人気。"},
        "🏛️ 青羅言堂":{min:0,avg:0,max:0,trend:"±0%",reason:"青羅言堂：見学無料。大邱の歴史的キリスト教教会の集積エリア。桜の名所としても有名。"},
        "🍖 マクチャンクイ":{min:10000,avg:13000,max:18000,trend:"+10%",reason:"マクチャンクイ（豚のホルモン焼き）：₩10,000〜₩18,000。大邱10味の代表格。安吉路の名店多数。"},
        "🍗 平和市場チメッ":{min:18000,avg:22000,max:28000,trend:"+10%",reason:"平和市場チキン横丁：チメク（チキン+ビール）セット₩18,000〜₩28,000。50年の歴史。"},
        "🥟 ナプチャクマンドゥ":{min:3000,avg:4000,max:6000,trend:"+8%",reason:"ナプチャクマンドゥ（平たい餃子）：₩3,000〜₩6,000。大邱発祥のB級グルメ。西門市場の名物。"},
        "🥩 テジカルビ":{min:12000,avg:16000,max:25000,trend:"+10%",reason:"テジカルビ（豚カルビ）：1人前₩12,000〜₩25,000。大邱十味の一つ。"},
        "🐐 フクヨムソ":{min:30000,avg:45000,max:60000,trend:"+10%",reason:"フクヨムソ（黒山羊スープ）：₩30,000〜₩60,000。大邱の薬念料理。スタミナ食。"},
        "🍱 十大味":{min:8000,avg:15000,max:25000,trend:"+10%",reason:"大邱十味（10代表料理）巡り：1食₩8,000〜₩25,000。マクチャンクイ・ヤキンユッケ・タレラーメン等。"},
        "🌶️ 辛いカルグクス":{min:7000,avg:9000,max:13000,trend:"+10%",reason:"辛いカルグクス（手打ち麺）：₩7,000〜₩13,000。大邱十味の一つ。煮干し出汁のあっさり辛口。"},
        "🍳 ヤキメシ":{min:7000,avg:10000,max:14000,trend:"+10%",reason:"ヤキメシ（焼き飯）：₩7,000〜₩14,000。大邱風炒飯。鉄板で香ばしく焼き上げる。"},
      },
      済州島:{
        "🌋 城山日出峰":{min:5000,avg:5000,max:5000,trend:"+5%",reason:"城山日出峰：大人₩5,000、小人₩2,500。ユネスコ世界自然遺産。180m頂上から日の出絶景。"},
        "🏔️ 漢拏山国立公園":{min:0,avg:0,max:0,trend:"±0%",reason:"漢拏山国立公園：入山無料（駐車場₩2,000）。韓国最高峰1947m。観音寺コース・城板岳コース等。"},
        "🕳️ 万丈窟":{min:4000,avg:4000,max:4000,trend:"±0%",reason:"万丈窟：大人₩4,000、小人₩2,000。世界最長級の溶岩洞窟（13.4km）。1km部分のみ公開。"},
        "🐄 牛島フェリー":{min:10500,avg:10500,max:10500,trend:"+8%",reason:"牛島フェリー（城山港〜牛島）往復：大人₩10,500、小人₩4,000。約15分。レンタル電動自転車別途。"},
        "💧 天帝淵瀑布":{min:2500,avg:2500,max:2500,trend:"±0%",reason:"天帝淵瀑布：大人₩2,500、小人₩1,400。3段の滝。仙臨橋・五仙女像が美しい。"},
        "💧 正房瀑布":{min:2500,avg:2500,max:2500,trend:"±0%",reason:"正房瀑布：大人₩2,500、小人₩1,400。アジア唯一海に直接落ちる滝（高さ23m）。西帰浦の名所。"},
        "🌳 テジボン公園":{min:0,avg:0,max:0,trend:"±0%",reason:"テジボン公園：入園無料。済州市内の小高い丘。済州市・遠く漢拏山を一望できる絶景スポット。"},
        "🪨 龍頭岩":{min:0,avg:0,max:0,trend:"±0%",reason:"龍頭岩：見学無料。済州市海岸沿いの龍頭の形をした奇岩。観光バスツアーの定番。"},
        "🏘️ ヒーリョンタウン":{min:0,avg:0,max:0,trend:"±0%",reason:"ヒーリョン（海女）タウン：散策無料。済州海女文化を体験できるエリア。海女ショー（要予約）。"},
        "🏖️ 中文海水浴場":{min:0,avg:0,max:0,trend:"±0%",reason:"中文海水浴場：入場無料。韓国を代表するサーフィンスポット。リゾートホテル・水族館が集積。"},
        "🐖 黒豚焼肉":{min:20000,avg:28000,max:40000,trend:"+12%",reason:"済州黒豚（フクテジ）焼肉：1人前₩20,000〜₩40,000。脂が甘く、ジューシー。済州島の名物中の名物。"},
        "🍜 テジコギグクス":{min:8000,avg:10000,max:13000,trend:"+10%",reason:"テジコギグクス（豚出汁麺）：₩8,000〜₩13,000。済州伝統料理。豚骨スープと太麺。"},
        "🍲 アワビ粥":{min:15000,avg:20000,max:30000,trend:"+10%",reason:"アワビ粥（チョンボッチュク）：₩15,000〜₩30,000。済州海女が獲ったアワビの濃厚な粥。"},
        "🌊 海女料理":{min:30000,avg:50000,max:80000,trend:"+10%",reason:"海女料理コース：₩30,000〜₩80,000。アワビ・サザエ・タコ・ウニ等の海女が獲った海産物料理。"},
        "🐟 タチウオ料理":{min:25000,avg:35000,max:50000,trend:"+10%",reason:"タチウオ煮付け（カルチチョリム）：₩25,000〜₩50,000。済州近海で獲れた巨大タチウオを甘辛く煮込む。"},
        "🏄 サーフィン体験":{min:50000,avg:70000,max:100000,trend:"+8%",reason:"サーフィン体験（中文ビーチ等）：2時間レッスン₩50,000〜₩100,000。ボード・ウェットスーツレンタル込。"},
        "🍡 オメギ餅":{min:1000,avg:2000,max:3000,trend:"+10%",reason:"オメギ餅：1個₩1,000〜₩3,000。済州伝統の粟もち。小豆・きな粉・松の実をまぶす。"},
        "🍊 漢拏ボン":{min:5000,avg:10000,max:20000,trend:"+8%",reason:"漢拏ボン（柑橘）：1kg₩5,000〜₩20,000。済州島特産の高級柑橘。糖度高く果汁たっぷり。"},
      },
      全州:{
        "🏘️ 全州韓屋村":{min:0,avg:0,max:0,trend:"±0%",reason:"全州韓屋村：散策無料。約700軒の韓屋が並ぶ韓国最大規模の韓屋集落。韓服レンタル₩15,000〜。"},
        "🏯 慶基殿":{min:3000,avg:3000,max:3000,trend:"±0%",reason:"慶基殿：大人₩3,000、青少年₩2,000、子供₩1,000。朝鮮王朝太祖・李成桂の御真を奉る。"},
        "⛪ 殿洞聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"殿洞聖堂：見学無料。1914年建造のロマネスク式聖堂。韓国カトリック殉教者の聖地。"},
        "🌳 梧木台":{min:0,avg:0,max:0,trend:"±0%",reason:"梧木台：入場無料。全州韓屋村を見下ろせる展望台。李成桂の故郷。徒歩15分で到着。"},
        "🏛️ 寒碧堂":{min:0,avg:0,max:0,trend:"±0%",reason:"寒碧堂：見学無料。15世紀建造の楼閣。全州川沿いの景勝地。桜・紅葉が美しい。"},
        "🏛️ 全州郷校":{min:0,avg:0,max:0,trend:"±0%",reason:"全州郷校：見学無料。朝鮮時代の地方教育機関。樹齢400年以上のイチョウが見事。秋は黄葉の名所。"},
        "🛍️ 南部市場":{min:0,avg:0,max:0,trend:"±0%",reason:"南部市場：入場無料。1905年開場の伝統市場。コンナムルクッパ・モジュチプの名店多数。青年夢の店街。"},
        "🌳 徳津公園":{min:0,avg:0,max:0,trend:"±0%",reason:"徳津公園：入園無料。連湖が美しい都市公園。夏のハス祭り・冬は氷上スケート場。"},
        "🍶 マッコリ通り":{min:0,avg:0,max:0,trend:"±0%",reason:"全州マッコリ通り：散策無料。マッコリ1壺₩15,000〜（つまみ盛り合わせ付）。三川洞・西新洞の名所。"},
        "🎨 工芸品展示館":{min:0,avg:0,max:0,trend:"±0%",reason:"全州伝統工芸品展示館：入館無料。韓紙・刺繍・陶磁器の作家作品展示。体験プログラム₩10,000〜。"},
        "🍚 全州ビビンバ":{min:12000,avg:15000,max:20000,trend:"+10%",reason:"全州ビビンバ：₩12,000〜₩20,000。元祖の地・全州の特色は黄銅器（놋그릇）で提供される伝統スタイル。"},
        "🍲 コンナムルクッパ":{min:7000,avg:9000,max:12000,trend:"+8%",reason:"コンナムルクッパ（豆もやしご飯）：₩7,000〜₩12,000。三百家・現代屋が老舗。二日酔いの朝に最適。"},
        "🍶 マッコリ":{min:15000,avg:25000,max:40000,trend:"+10%",reason:"マッコリ1壺＋つまみセット：₩15,000〜₩40,000。全州式は壺の数だけつまみが豊富。三天洞が有名。"},
        "🍡 伝統菓子":{min:2000,avg:5000,max:10000,trend:"+8%",reason:"全州韓菓・パッピンス：₩2,000〜₩10,000。韓屋村で職人手作りの伝統菓子。"},
        "🌶️ ピチョリ唐辛子":{min:5000,avg:8000,max:12000,trend:"+10%",reason:"ピチョリ唐辛子料理：₩5,000〜₩12,000。全州近郊のピチョリ唐辛子は辛さ・香りが特別。"},
        "🍫 PNBチョコパイ":{min:9000,avg:10000,max:12000,trend:"+5%",reason:"PNB（豊年製菓）チョコパイ：1箱（12個入）₩9,000〜₩12,000。全州ランチパッケージのお土産定番。"},
        "🍙 文化キンパ":{min:4000,avg:5000,max:7000,trend:"+8%",reason:"文化キンパ：₩4,000〜₩7,000。南部市場名物。具材が豊富で20cm以上の長さ。"},
        "🍲 十里堤野菜炒め":{min:8000,avg:12000,max:18000,trend:"+10%",reason:"十里堤野菜炒め定食：₩8,000〜₩18,000。郊外農家の伝統的な野菜中心の田舎料理。"},
      },
      慶州:{
        "🏯 仏国寺":{min:6000,avg:6000,max:6000,trend:"+5%",reason:"仏国寺：大人₩6,000、中高生₩4,000、子供₩3,000。ユネスコ世界遺産。新羅時代の代表的寺院。"},
        "🗿 石窟庵":{min:6000,avg:6000,max:6000,trend:"+5%",reason:"石窟庵：大人₩6,000。仏国寺の山頂にある石窟寺院。本尊釈迦如来像が国宝。"},
        "🔭 瞻星台":{min:0,avg:0,max:0,trend:"±0%",reason:"瞻星台：入場無料（周辺の月城公園内）。新羅時代の東洋最古の天文台。約7世紀建造。"},
        "🌊 雁鴨池（東宮と月池）":{min:3000,avg:3000,max:3000,trend:"±0%",reason:"東宮と月池（雁鴨池）：大人₩3,000、青少年₩2,000、子供₩1,000。新羅王宮の離宮跡。夜のライトアップ絶景。"},
        "⚱️ 大陵苑":{min:3000,avg:3000,max:3000,trend:"±0%",reason:"大陵苑（天馬塚）：大人₩3,000、青少年₩2,000、子供₩1,000。23基の新羅古墳群。天馬塚は内部見学可。"},
        "🏛️ 慶州歴史地区":{min:0,avg:0,max:0,trend:"±0%",reason:"慶州歴史地区：散策無料。ユネスコ世界遺産。瞻星台・月城・古墳群を含むエリア全体。"},
        "🏘️ 良洞民俗村":{min:4000,avg:4000,max:4000,trend:"±0%",reason:"良洞民俗村：大人₩4,000、青少年₩2,000、子供₩1,500。ユネスコ世界遺産。500年以上の歴史を持つ朝鮮時代の村。"},
        "🏛️ 統一殿":{min:0,avg:0,max:0,trend:"±0%",reason:"統一殿：入場無料。新羅統一を記念する記念館。三国統一を成し遂げた金庾信・武烈王・文武王を祀る。"},
        "🌳 普門観光団地":{min:0,avg:0,max:0,trend:"±0%",reason:"普門観光団地：入場無料。リゾート地区。湖周辺に高級ホテル・遊園地・水族館。"},
        "🗼 慶州タワー":{min:5000,avg:5000,max:5000,trend:"+5%",reason:"慶州タワー：大人₩5,000、青少年₩4,000、子供₩3,000。地上82m。慶州エキスポ大公園内。"},
        "🍞 皇南パン":{min:1000,avg:1500,max:2000,trend:"+8%",reason:"皇南パン：1個₩1,000〜₩2,000、10個入箱₩12,000〜。70年の歴史を持つ慶州土産の定番。あんこ入り焼きパン。"},
        "🍚 慶州ビビンバ":{min:10000,avg:13000,max:18000,trend:"+10%",reason:"慶州ビビンバ：₩10,000〜₩18,000。サムフップル（包み肉料理）・新羅式韓定食でも有名。"},
        "🌿 サムマンス豆腐料理":{min:8000,avg:12000,max:18000,trend:"+10%",reason:"豆腐定食：₩8,000〜₩18,000。慶州・南山周辺の田舎料理。手作り豆腐・ナムル中心。"},
        "🌼 菊花パン":{min:1000,avg:2000,max:3000,trend:"+8%",reason:"菊花パン（クッカパン）：1個₩1,000〜₩3,000。皇南パンと並ぶ慶州銘菓。菊の花型。"},
        "🍶 慶州法酒":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"慶州法酒：1本₩30,000〜₩100,000。300年以上の歴史を持つ韓国伝統清酒。慶州崔家秘伝。"},
        "🍡 韓菓":{min:5000,avg:10000,max:20000,trend:"+8%",reason:"韓菓（伝統菓子）：1箱₩5,000〜₩20,000。慶州韓屋村で手作り菓子作り体験も可能。"},
        "🍬 麦芽飴":{min:3000,avg:5000,max:10000,trend:"+8%",reason:"麦芽飴（ヨッ）：₩3,000〜₩10,000。慶州伝統の手作り飴。子供から大人まで人気の土産。"},
        "🍚 ヌルンジ":{min:5000,avg:8000,max:12000,trend:"+8%",reason:"ヌルンジ（おこげスープ）：₩5,000〜₩12,000。皇南パン同様の慶州伝統食。香ばしく素朴な味わい。"},
      },
      江陵:{
        "🏯 鏡浦台":{min:0,avg:0,max:0,trend:"±0%",reason:"鏡浦台：見学無料。1326年建造の楼閣。鏡のような穏やかな湖（鏡浦湖）と松林が美しい。"},
        "🏖️ 鏡浦海水浴場":{min:0,avg:0,max:0,trend:"±0%",reason:"鏡浦海水浴場：入場無料。江原道で最も人気のビーチ。1.8kmの白砂と松林。サーフィンも盛ん。"},
        "🏛️ 烏竹軒":{min:3000,avg:3000,max:3000,trend:"±0%",reason:"烏竹軒：大人₩3,000、子供₩1,500。朝鮮時代の学者・李栗谷の生家。₩5,000ウォン紙幣にも描かれる。"},
        "🏛️ 船橋荘":{min:5000,avg:5000,max:5000,trend:"+5%",reason:"船橋荘：大人₩5,000、子供₩3,000。300年以上の歴史を持つ朝鮮両班家屋。「韓国で最も美しい家」。"},
        "🚂 正東津":{min:0,avg:0,max:0,trend:"±0%",reason:"正東津：駅入場無料。世界で海に最も近い駅としてギネス認定。日の出の名所。"},
        "☕ 安木カフェ通り":{min:0,avg:0,max:0,trend:"±0%",reason:"安木コーヒー通り：入場無料。江陵=「韓国のシアトル」。50軒以上のカフェが海沿いに並ぶ。コーヒー1杯₩5,000〜。"},
        "🛍️ 江陵中央市場":{min:0,avg:0,max:0,trend:"±0%",reason:"江陵中央市場：入場無料。江陵の台所。タッカンマリ・チョダン豆腐・カムジャンチェなどの郷土料理。"},
        "⚓ 注文津港":{min:0,avg:0,max:0,trend:"±0%",reason:"注文津港：入場無料。「君の名は。」のロケ地として注目された港。新鮮なイカ・タチウオ。"},
        "🌳 テリョン渓谷":{min:0,avg:0,max:0,trend:"±0%",reason:"テリョン（大関嶺）渓谷：入場無料。標高800mの高原。羊牧場₩9,000・スキー場（冬）が有名。"},
        "🏔️ 束草秀峰丘":{min:0,avg:0,max:0,trend:"±0%",reason:"束草秀峰丘（雪嶽山）：入山料₩3,500（雪嶽山国立公園）。ケーブルカー₩15,000往復。江陵から1時間。"},
        "🥡 チョダン豆腐":{min:8000,avg:12000,max:18000,trend:"+10%",reason:"チョダン豆腐定食：₩8,000〜₩18,000。海水で固める江陵伝統豆腐。チョダン豆腐村で味わえる。"},
        "🌭 オジンオスンデ":{min:10000,avg:15000,max:25000,trend:"+10%",reason:"オジンオスンデ（イカ詰めご飯）：₩10,000〜₩25,000。注文津・束草の名物。イカのお腹に詰めた具を蒸し焼き。"},
        "🌭 太岩ホットドッグ":{min:3000,avg:4000,max:6000,trend:"+10%",reason:"太岩マーケットのホットドッグ：1本₩3,000〜₩6,000。チーズ・ポテト・チリ等のバリエーション豊富。"},
        "🍜 ハマグリカルグクス":{min:9000,avg:12000,max:15000,trend:"+8%",reason:"ハマグリカルグクス：₩9,000〜₩15,000。東海岸のあっさり貝出汁手打ち麺。"},
        "🌿 紅参":{min:30000,avg:50000,max:150000,trend:"+10%",reason:"江原道紅参：100g₩30,000〜₩150,000。江陵周辺は高麗人参の名産地。健康食品として人気。"},
        "🦪 東海生牡蠣":{min:15000,avg:25000,max:40000,trend:"+10%",reason:"東海岸生牡蠣：1人前₩15,000〜₩40,000。冬季が最盛期。海女が獲った天然物。"},
        "🍲 ウィ吐豆腐定食":{min:10000,avg:15000,max:20000,trend:"+10%",reason:"ウィ吐豆腐定食：₩10,000〜₩20,000。チョダン豆腐+海鮮の江陵スタイル豆腐料理。"},
        "🍢 端午祭オデン":{min:3000,avg:5000,max:8000,trend:"+8%",reason:"端午祭オデン：1人前₩3,000〜₩8,000。江陵端午祭（ユネスコ無形文化遺産）の屋台名物。"},
      },
    },
  },
  台湾:{
    famous:{
      台北:{
        "🗼 台北101展望台":{min:600,avg:600,max:1200,trend:"+5%",reason:"台北101展望台：大人NT$600（89階）、優先入場NT$1,200。学生NT$540、115cm以下無料。508mの超高層ビル。"},
        "🏛️ 故宮博物院":{min:350,avg:350,max:350,trend:"±0%",reason:"国立故宮博物院：大人NT$350、学生NT$150。中華文明の至宝70万点超を展示。月曜休館（祝日除く）。"},
        "🏛️ 中正記念堂":{min:0,avg:0,max:0,trend:"±0%",reason:"中正記念堂：入場無料。蒋介石を記念する施設。毎時の衛兵交代式が見もの。"},
        "⛩️ 龍山寺":{min:0,avg:0,max:0,trend:"±0%",reason:"龍山寺：参拝無料。台北最古の寺院（1738年建立）。観音菩薩を本尊とする。"},
        "🍢 士林夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"士林夜市：入場無料。台湾最大の夜市。地下美食街にフードコート。MRT剣潭駅徒歩5分。"},
        "🍢 饒河街夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"饒河街夜市：入場無料。一本道で歩きやすい。胡椒餅が名物。MRT松山駅徒歩1分。"},
        "🛍️ 西門町":{min:0,avg:0,max:0,trend:"±0%",reason:"西門町：散策無料。台湾の渋谷と呼ばれる若者の街。映画館・ファッション・グルメが集まる。"},
        "🏘️ 迪化街":{min:0,avg:0,max:0,trend:"±0%",reason:"迪化街：散策無料。台北最古の問屋街。漢方薬・乾物・お茶の老舗が並ぶ。旧正月の買い物で有名。"},
        "♨️ 北投温泉":{min:0,avg:100,max:1500,trend:"+8%",reason:"北投温泉：公衆浴場NT$40〜200、有料温泉施設NT$300〜1500。MRT新北投駅。日本統治時代から続く名湯。"},
        "🏛️ 国父記念館":{min:0,avg:0,max:0,trend:"±0%",reason:"国父記念館：入場無料。孫文を記念する施設。毎時の衛兵交代式。広大な公園で台北101と隣接。"},
        "🥟 小籠包(鼎泰豊)":{min:220,avg:270,max:400,trend:"+10%",reason:"鼎泰豊の小籠包：10個NT$220（オリジナル）、カニ味噌入りNT$400、トリュフNT$450。米紙が世界10大レストランに選出。"},
        "🍜 牛肉麺":{min:200,avg:250,max:400,trend:"+10%",reason:"牛肉麺：NT$200〜400。台湾代表料理。半筋半肉（牛筋と牛肉）が定番。永康牛肉麺・林東芳が名店。"},
        "🍚 ルーロー飯":{min:50,avg:70,max:120,trend:"+10%",reason:"ルーロー飯（魯肉飯）：NT$50〜120。豚バラ角煮を細かく刻んでご飯にかける台湾の定番。金峰魯肉飯が有名。"},
        "🥧 胡椒餅":{min:60,avg:65,max:80,trend:"+8%",reason:"胡椒餅：NT$60〜80。窯で焼く台湾風肉まん。福州世祖胡椒餅（饒河夜市）が名店。"},
        "🍧 マンゴーかき氷":{min:200,avg:250,max:350,trend:"+10%",reason:"マンゴーかき氷：NT$200〜350。台湾No.1スイーツ。アイスモンスター・思慕昔（スムージー）等の名店。"},
        "🧋 タピオカミルクティー":{min:50,avg:70,max:100,trend:"+5%",reason:"タピオカミルクティー（珍珠奶茶）：NT$50〜100。春水堂発祥。50嵐・コカ・コブチ・幸福堂など。"},
        "🌶️ 臭豆腐":{min:60,avg:80,max:120,trend:"+8%",reason:"臭豆腐：NT$60〜120。発酵豆腐を揚げて野菜と食べる。屋台の定番。"},
        "🍍 パイナップルケーキ":{min:30,avg:40,max:80,trend:"+8%",reason:"パイナップルケーキ：1個NT$30〜80、箱（8〜12個）NT$300〜1000。サニーヒルズ・佳徳・微熱山丘が名店。台湾No.1お土産。"},
      },
      台中:{
        "🏥 宮原眼科":{min:0,avg:0,max:0,trend:"±0%",reason:"宮原眼科：入場無料。日本統治時代の眼科を改装したスイーツ店。アイスクリーム1個NT$140〜220。"},
        "🌈 彩虹眷村":{min:0,avg:0,max:0,trend:"±0%",reason:"彩虹眷村：入場無料。退役軍人が描いたカラフルなアート村。インスタ映えスポット。"},
        "🍢 逢甲夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"逢甲夜市：入場無料。台湾流行の発信地。学生街の活気ある夜市。"},
        "🌳 台中公園":{min:0,avg:0,max:0,trend:"±0%",reason:"台中公園：入園無料。1903年開園の歴史ある公園。湖心亭が台中のシンボル。"},
        "⛪ 路思義教堂":{min:0,avg:0,max:0,trend:"±0%",reason:"路思義教堂（東海大学）：見学無料。1963年建造の独特な薄殻構造の教会。建築家貝聿銘設計。"},
        "🎨 国立台湾美術館":{min:0,avg:0,max:0,trend:"±0%",reason:"国立台湾美術館：入館無料（常設展）。アジアアートビエンナーレ会場。広大な庭園にアート作品。"},
        "🌊 高美湿地":{min:0,avg:0,max:0,trend:"±0%",reason:"高美湿地：入場無料。「天空の鏡」と呼ばれる景勝地。夕日が映る木道が絶景。"},
        "🛍️ 勤美誠品":{min:0,avg:0,max:0,trend:"±0%",reason:"勤美誠品：入場無料。台中のおしゃれ複合商業施設。書店・カフェ・雑貨が充実。"},
        "⛩️ 台中孔子廟":{min:0,avg:0,max:0,trend:"±0%",reason:"台中孔子廟：参拝無料。1976年建立。宋代様式の壮麗な建築。"},
        "🍢 忠孝路夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"忠孝路夜市：入場無料。地元客中心のローカル夜市。小吃（B級グルメ）が安い。"},
        "🌞 太陽餅":{min:30,avg:50,max:80,trend:"+8%",reason:"太陽餅：1個NT$30〜80、箱（10個）NT$300〜800。台中名物の麦芽糖入り焼き菓子。"},
        "🍜 台中担仔麺":{min:60,avg:100,max:150,trend:"+8%",reason:"担仔麺：NT$60〜150。台南起源だが台中にも名店多数。台中担仔麺は具沢山。"},
        "🍦 宮原アイス":{min:140,avg:180,max:280,trend:"+10%",reason:"宮原アイスクリーム：1スクープNT$140〜、ワッフル盛りNT$280〜。100種類以上のフレーバー。"},
        "🦆 烤鴨":{min:300,avg:600,max:1200,trend:"+10%",reason:"北京烤鴨（北京ダック）：1羽NT$800〜1200、半羽NT$300〜600。台中は隠れた北京ダック激戦区。"},
        "🍲 麻油鶏":{min:200,avg:300,max:500,trend:"+10%",reason:"麻油鶏：NT$200〜500。ごま油と生姜で鶏肉を煮込む台湾の冬の定番。"},
        "🍡 肉圓":{min:50,avg:70,max:100,trend:"+8%",reason:"肉圓（バーワン）：1個NT$50〜100。サツマイモ粉で作るモチっとした皮の中に豚肉とタケノコ。彰化発祥。"},
        "🥪 洪瑞珍三明治":{min:35,avg:50,max:80,trend:"+8%",reason:"洪瑞珍三明治：1個NT$35〜80。台中発祥のレトロサンドイッチ。ハム・卵・チーズが定番。"},
        "🧋 珍珠ミルクティー":{min:50,avg:70,max:120,trend:"+5%",reason:"珍珠奶茶（タピオカミルクティー）：NT$50〜120。台中の春水堂が発祥（1983年）。本店で味わうのが醍醐味。"},
      },
      台南:{
        "🏯 赤崁楼":{min:70,avg:70,max:70,trend:"±0%",reason:"赤崁楼：大人NT$70、子供NT$35。1653年オランダ統治時代のプロヴィンシア城跡。台南のシンボル。"},
        "🏯 安平古堡":{min:70,avg:70,max:70,trend:"±0%",reason:"安平古堡：大人NT$70。1624年オランダ建造の台湾最古の城塞。鄭成功ゆかりの地。"},
        "🏰 億載金城":{min:70,avg:70,max:70,trend:"±0%",reason:"億載金城：大人NT$70。1875年清朝建造の砲台。台湾近代化のシンボル。"},
        "🏬 林百貨":{min:0,avg:0,max:0,trend:"±0%",reason:"林百貨：入場無料。1932年建造の台湾最古の百貨店。改装され台南文化の発信拠点に。"},
        "⛩️ 台南孔子廟":{min:0,avg:0,max:0,trend:"±0%",reason:"台南孔子廟：参拝無料。1665年建立の台湾最古の孔子廟。「全台首学」の称号。"},
        "🏘️ 神農街":{min:0,avg:0,max:0,trend:"±0%",reason:"神農街：散策無料。台南で最もよく保存された古い街並み。レトロカフェが並ぶ。"},
        "🏠 安平樹屋":{min:70,avg:70,max:70,trend:"±0%",reason:"安平樹屋：大人NT$70。150年の歴史を持つ廃倉庫がガジュマルに覆われた絶景スポット。"},
        "🏛️ 奇美博物館":{min:200,avg:200,max:200,trend:"±0%",reason:"奇美博物館：大人NT$200。アジア最大級の私設博物館。西洋美術・楽器・武器コレクション。"},
        "🍢 花園夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"花園夜市：入場無料。台南最大の夜市。木・土・日のみ開催（週3日制）。"},
        "🍢 大東夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"大東夜市：入場無料。月・火・金開催の地元向け夜市。500店超の規模。"},
        "🍜 擔仔麺":{min:50,avg:80,max:120,trend:"+8%",reason:"担仔麺：NT$50〜120。台南発祥。度小月が老舗（1895年創業）。エビと豚そぼろのスープ麺。"},
        "🥪 棺材板":{min:60,avg:80,max:120,trend:"+8%",reason:"棺材板：NT$60〜120。台南名物。揚げパンに具材を詰めた「棺桶」の形のB級グルメ。"},
        "🍲 牛肉湯":{min:150,avg:200,max:300,trend:"+10%",reason:"牛肉湯：NT$150〜300。台南名物の朝食。新鮮な生牛肉を熱々スープで湯がいて食べる。"},
        "🐟 虱目魚粥":{min:80,avg:120,max:180,trend:"+8%",reason:"虱目魚粥（サバヒー粥）：NT$80〜180。台南の名物魚を使った粥。骨抜きが丁寧で食べやすい。"},
        "🦐 蝦巻":{min:60,avg:80,max:120,trend:"+8%",reason:"蝦巻（蝦捲）：NT$60〜120。海老のすり身を網脂で包んで揚げた台南名物。"},
        "🍚 米糕":{min:40,avg:60,max:90,trend:"+8%",reason:"米糕：NT$40〜90。もち米にひき肉そぼろをのせた小ぶりな郷土料理。台南の朝食定番。"},
        "🍜 関廟麺":{min:60,avg:80,max:120,trend:"+8%",reason:"関廟麺：NT$60〜120。台南関廟区発祥の天日干し麺。汁なし・スープいずれも美味。"},
        "🍬 椪糖":{min:30,avg:50,max:80,trend:"+8%",reason:"椪糖：NT$30〜80。台南名物の砂糖と重曹で作る伝統菓子。膨らませる過程が屋台パフォーマンス。"},
      },
      高雄:{
        "🌸 蓮池潭":{min:0,avg:0,max:0,trend:"±0%",reason:"蓮池潭：入場無料。高雄郊外の景勝地。蓮の花と龍虎塔・玄天上帝像が見もの。"},
        "🏯 龍虎塔":{min:0,avg:0,max:0,trend:"±0%",reason:"龍虎塔：見学無料。1976年建造の7階建て陶磁器の塔。龍口から入り虎口から出ると福が来る。2025年夏まで改修中。"},
        "🍢 六合夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"六合夜市：入場無料。高雄を代表する観光夜市。海鮮・パパイヤミルクが名物。"},
        "🎨 駁二芸術特区":{min:0,avg:0,max:0,trend:"±0%",reason:"駁二芸術特区：散策無料（一部展示は別途）。旧倉庫群を改装したアートスペース。MRT塩埕埔駅。"},
        "🌃 愛河":{min:0,avg:0,max:0,trend:"±0%",reason:"愛河：散策無料。高雄の中心を流れる川。クルーズはNT$80〜150。夜景が美しい。"},
        "🚢 旗津":{min:30,avg:30,max:30,trend:"±0%",reason:"旗津渡し舟：片道NT$30、自転車込みNT$40。高雄港の対岸へ5分。海鮮・ビーチ・天后宮。"},
        "🙏 佛光山":{min:0,avg:0,max:0,trend:"±0%",reason:"佛光山仏陀記念館：入場無料。世界最大級の仏教施設。108mの黄金大仏が圧巻。"},
        "🗼 85ビル":{min:100,avg:100,max:300,trend:"+8%",reason:"高雄85ビル展望台：大人NT$100〜300（プラン別）。地上378m、台湾2番目に高いビル。"},
        "🍢 瑞豊夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"瑞豊夜市：入場無料。MRT巨蛋駅すぐ。地元高雄人が一番好きな夜市の一つ。"},
        "🏛️ 英国領事館":{min:99,avg:99,max:99,trend:"±0%",reason:"打狗英国領事館：大人NT$99。1865年建造の台湾最古の西洋式建築。高雄港を一望。"},
        "🍢 黒輪":{min:30,avg:50,max:80,trend:"+8%",reason:"黒輪（おでん）：1串NT$30〜80。高雄の屋台料理。日本のおでんと類似。"},
        "🍡 高雄肉圓":{min:50,avg:70,max:100,trend:"+8%",reason:"高雄肉圓：NT$50〜100。彰化系より大ぶりで蒸し調理が多い。"},
        "🥣 海鮮粥":{min:120,avg:180,max:300,trend:"+10%",reason:"海鮮粥：NT$120〜300。高雄の港町ならではの新鮮さ。エビ・カニ・牡蠣が豪華に。"},
        "🦆 鴨肉飯":{min:80,avg:100,max:150,trend:"+8%",reason:"鴨肉飯：NT$80〜150。鴨肉そぼろをご飯にかけた台湾南部の名物。"},
        "🥛 木瓜牛奶":{min:60,avg:80,max:120,trend:"+8%",reason:"木瓜牛奶（パパイヤミルク）：NT$60〜120。高雄六合夜市の名物ドリンク。"},
        "🥛 ピリ辛豆乳":{min:30,avg:50,max:80,trend:"+8%",reason:"鹹豆漿（塩味豆乳）：NT$30〜80。鹹豆漿に揚げパン・葱を加えた台湾朝食。"},
        "🍖 烤肉飯":{min:80,avg:100,max:150,trend:"+8%",reason:"烤肉飯：NT$80〜150。炭火焼き豚肉をご飯にかけた定番。高雄の食堂で味わえる。"},
        "🍹 サトウキビジュース":{min:40,avg:60,max:100,trend:"+8%",reason:"甘蔗汁（サトウキビジュース）：NT$40〜100。台湾南部の伝統的なドリンク。屋台で生搾り。"},
      },
      花蓮:{
        "🏔️ 太魯閣国立公園":{min:0,avg:0,max:0,trend:"±0%",reason:"太魯閣国立公園：入場無料。雄大な大理石峡谷。立霧渓沿いの絶景。世界遺産級の自然美。"},
        "🌊 清水断崖":{min:0,avg:0,max:0,trend:"±0%",reason:"清水断崖：見学無料。海抜800mの断崖絶壁。太平洋の青と崖の絶景。台湾八景の一つ。"},
        "🏖️ 七星潭":{min:0,avg:0,max:0,trend:"±0%",reason:"七星潭：入場無料。三日月形の海岸線が美しいビーチ。石を積む遊びが人気。"},
        "🍢 東大門夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"東大門夜市：入場無料。花蓮最大の夜市。原住民料理・海鮮が名物。"},
        "🏯 松園別館":{min:60,avg:60,max:60,trend:"±0%",reason:"松園別館：大人NT$60。日本統治時代の軍司令官の別邸。松林に囲まれた花蓮の歴史的建造物。"},
        "⛩️ 慶修院":{min:30,avg:30,max:30,trend:"±0%",reason:"慶修院（吉野神社）：大人NT$30。日本統治時代の真言宗寺院。台湾で唯一の日本式仏教寺院。"},
        "🌲 白楊歩道":{min:0,avg:0,max:0,trend:"±0%",reason:"白楊歩道：入場無料。太魯閣国立公園の人気トレッキングコース。水濂洞（水のカーテン）が見もの。"},
        "🏞️ 砂卡礑歩道":{min:0,avg:0,max:0,trend:"±0%",reason:"砂卡礑歩道：入場無料。大理石の渓流沿いの平坦な歩道。家族連れにも人気。"},
        "🏛️ 長春祠":{min:0,avg:0,max:0,trend:"±0%",reason:"長春祠：見学無料。中横公路建設で殉職した225名の労働者を祀る祠。唐式建築と滝が美しい。"},
        "🌉 山月吊橋":{min:0,avg:0,max:0,trend:"±0%",reason:"布洛湾山月吊橋：見学無料・要予約（無料）。196mの最新観光吊橋。立霧渓を見下ろす。"},
        "🥟 扁食":{min:60,avg:80,max:120,trend:"+8%",reason:"扁食（ワンタン）：NT$60〜120。花蓮名物のワンタンスープ。液香扁食店が老舗。"},
        "🍡 麻糬":{min:30,avg:50,max:100,trend:"+8%",reason:"麻糬（モチ）：1個NT$30〜100。花蓮の原住民阿美族発祥の餅。曾記麻糬が有名。"},
        "🍵 徳記薏仁":{min:30,avg:50,max:80,trend:"+8%",reason:"徳記薏仁（ハトムギ）：NT$30〜80。健康志向の伝統スイーツ。花蓮の人気カフェメニュー。"},
        "🐗 原住民料理":{min:200,avg:400,max:800,trend:"+10%",reason:"原住民料理：NT$200〜800。阿美族・タロコ族の伝統料理。竹筒飯・山豚・山菜が定番。"},
        "🐟 海鮮":{min:300,avg:500,max:1000,trend:"+10%",reason:"花蓮海鮮：NT$300〜1000。太平洋に面した新鮮な魚介類。マグロ・カジキが名物。"},
        "🥟 公正包子":{min:15,avg:20,max:30,trend:"+8%",reason:"公正包子：1個NT$15〜30。花蓮の老舗肉まん店。深夜まで営業し小腹を満たす。"},
        "🥟 花蓮ワンタン":{min:60,avg:80,max:120,trend:"+8%",reason:"花蓮ワンタン：NT$60〜120。扁食より大きめのワンタン。液香・戴記が老舗。"},
        "🍡 阿美麻糬":{min:30,avg:50,max:100,trend:"+8%",reason:"阿美麻糬：1個NT$30〜100。原住民阿美族の伝統餅。きな粉・あんこなど多彩。"},
      },
      台東:{
        "🌾 池上":{min:0,avg:0,max:0,trend:"±0%",reason:"池上：入場無料。米どころとして有名な田園地帯。「天堂路」など絶景の田んぼ道。"},
        "🛣️ 伯朗大道":{min:0,avg:0,max:0,trend:"±0%",reason:"伯朗大道：見学無料。コーヒーCMのロケ地で有名。「金城武の木」が観光名所。"},
        "🪨 三仙台":{min:0,avg:0,max:0,trend:"±0%",reason:"三仙台：入場無料。八つのアーチ橋で結ばれた小島。台東を代表する景勝地。"},
        "🏝️ 緑島":{min:1500,avg:1500,max:1500,trend:"+5%",reason:"緑島フェリー往復：NT$1500前後（富岡港から）。ダイビング・温泉・絶景。海底温泉「朝日温泉」が世界三大。"},
        "🏝️ 蘭嶼":{min:2300,avg:2500,max:3000,trend:"+5%",reason:"蘭嶼フェリー往復：NT$2300〜3000、飛行機NT$3500。タオ族の伝統文化が残る原始の島。"},
        "♨️ 知本温泉":{min:200,avg:500,max:1500,trend:"+8%",reason:"知本温泉：日帰り入浴NT$200〜、温泉ホテルNT$1500〜。台湾屈指の温泉郷。"},
        "🌳 台東森林公園":{min:30,avg:30,max:30,trend:"±0%",reason:"台東森林公園：入園NT$30、自転車レンタル別途。「黒森林」と呼ばれる広大な公園。"},
        "🏛️ 卑南遺址公園":{min:30,avg:30,max:30,trend:"±0%",reason:"卑南遺址公園：大人NT$30。台湾最大の先史時代遺跡。約5000年前の文化遺産。"},
        "🐄 初鹿牧場":{min:200,avg:200,max:200,trend:"±0%",reason:"初鹿牧場：大人NT$200、シニアNT$100。台湾最大級の牧場。新鮮な牛乳・乳製品。"},
        "⚓ 富岡漁港":{min:0,avg:0,max:0,trend:"±0%",reason:"富岡漁港：見学無料。緑島・蘭嶼へのフェリー出発点。新鮮な海鮮市場。"},
        "🍱 池上弁当":{min:90,avg:120,max:180,trend:"+8%",reason:"池上弁当：NT$90〜180。台湾鉄道弁当の代表格。池上米と豚カツ・卵が定番。"},
        "🌶️ 卑南臭豆腐":{min:60,avg:80,max:120,trend:"+8%",reason:"卑南臭豆腐：NT$60〜120。台東の名物臭豆腐。揚げ・蒸し・煮込みなどバリエーション豊富。"},
        "🍜 米苔目":{min:50,avg:80,max:120,trend:"+8%",reason:"米苔目：NT$50〜120。米粉を押し出して作る台湾伝統麺。冷たくも熱くも食べられる。"},
        "🍈 太麻里釈迦":{min:100,avg:200,max:400,trend:"+10%",reason:"太麻里釈迦（バンレイシ）：1個NT$100〜400。台東の特産フルーツ。仏様の頭の形が特徴。"},
        "🐟 蘭嶼飛魚":{min:200,avg:400,max:800,trend:"+10%",reason:"蘭嶼飛魚料理：NT$200〜800。タオ族の伝統食。塩漬け・干物・煮込みなど。3〜6月が旬。"},
        "🐗 原住民料理":{min:200,avg:400,max:800,trend:"+10%",reason:"台東原住民料理：NT$200〜800。卑南族・阿美族・布農族の伝統料理。竹筒飯・山豚・山菜が定番。"},
        "🥛 初鹿生乳":{min:60,avg:100,max:200,trend:"+8%",reason:"初鹿生乳・乳製品：NT$60〜200。初鹿牧場の新鮮な牛乳・アイスクリーム・チーズ。"},
        "🎈 台東熱気球":{min:9000,avg:11000,max:15000,trend:"+10%",reason:"台東熱気球フリーフライト：NT$9000〜15000。鹿野高台での体験飛行。毎年7〜8月が「台湾国際熱気球フェスティバル」。"},
      },
      嘉義:{
        "🌳 阿里山":{min:300,avg:300,max:300,trend:"+5%",reason:"阿里山国家風景区：入場料NT$300。標高2200mの高山リゾート。日の出・雲海・神木が名物。"},
        "🚂 阿里山森林鉄道":{min:400,avg:600,max:800,trend:"+8%",reason:"阿里山森林鉄道：嘉義〜奮起湖NT$400、阿里山駅NT$600〜800。台湾を代表する高山鉄道。"},
        "🍢 文化路夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"文化路夜市：入場無料。嘉義最大の夜市。鶏肉飯・砂鍋魚頭の名店が並ぶ。"},
        "🏘️ 檜意森活村":{min:0,avg:0,max:0,trend:"±0%",reason:"檜意森活村：入場無料。日本統治時代の官舎を改装した文化エリア。檜（ヒノキ）の建築。"},
        "🌳 嘉義公園":{min:0,avg:0,max:0,trend:"±0%",reason:"嘉義公園：入園無料。1910年開園の歴史ある公園。射日塔（展望台）NT$50。"},
        "🌐 北回帰線標公園":{min:0,avg:0,max:0,trend:"±0%",reason:"北回帰線標公園：入場無料。北緯23.5度を示す記念塔。嘉義の地理的シンボル。"},
        "🚂 奮起湖老街":{min:0,avg:0,max:0,trend:"±0%",reason:"奮起湖老街：散策無料。阿里山森林鉄道の中継駅。「台湾のスイス」と呼ばれる山間の町。"},
        "🏘️ 達邦部落":{min:0,avg:0,max:0,trend:"±0%",reason:"達邦・特富野部落：見学無料。鄒族（ツォウ族）の伝統部落。原住民文化体験。"},
        "⚓ 東石漁人碼頭":{min:0,avg:0,max:0,trend:"±0%",reason:"東石漁人碼頭：入場無料。嘉義屈指の漁港。新鮮な牡蠣・蛤が名物。"},
        "⚓ 布袋港":{min:0,avg:0,max:0,trend:"±0%",reason:"布袋港：入場無料。澎湖島へのフェリー出発点。新鮮な海鮮市場。"},
        "🍗 鶏肉飯":{min:35,avg:50,max:80,trend:"+8%",reason:"嘉義鶏肉飯：NT$35〜80。嘉義名物中の名物。実は七面鳥（火鶏）の肉を使う。劉里長・噴水鶏肉飯が老舗。"},
        "🐟 砂鍋魚頭":{min:300,avg:500,max:800,trend:"+10%",reason:"砂鍋魚頭：NT$300〜800。レンギョ（白鰱）の頭を野菜と煮込む嘉義の名物鍋。林聡明が老舗。"},
        "🍗 火雞肉飯":{min:35,avg:50,max:80,trend:"+8%",reason:"火雞肉飯（七面鳥肉飯）：NT$35〜80。鶏肉飯の正式名称。嘉義のソウルフード。"},
        "🥧 方塊酥":{min:30,avg:50,max:100,trend:"+8%",reason:"方塊酥：1個NT$30〜100、箱（10個）NT$300〜1000。嘉義名物のサクサクパイ菓子。"},
        "🍱 奮起湖弁当":{min:100,avg:120,max:150,trend:"+8%",reason:"奮起湖弁当：NT$100〜150。鉄道弁当の元祖。木製弁当箱に豚カツが入る。"},
        "🍵 阿里山高山茶":{min:200,avg:500,max:2000,trend:"+10%",reason:"阿里山高山茶：100gあたりNT$200〜2000。標高1000m超の烏龍茶。台湾最高級茶葉。"},
        "🍚 米糕":{min:40,avg:60,max:90,trend:"+8%",reason:"嘉義米糕：NT$40〜90。もち米に肉そぼろを乗せる嘉義版おこわ。台南とは趣が違う。"},
        "🦪 東石蚵仔":{min:100,avg:200,max:400,trend:"+10%",reason:"東石蚵仔（牡蠣）：NT$100〜400。東石漁港の新鮮な牡蠣。蚵仔煎（牡蠣オムレツ）が名物。"},
      },
      墾丁:{
        "🌴 墾丁国家公園":{min:0,avg:0,max:0,trend:"±0%",reason:"墾丁国家公園：入場無料。台湾最南端のリゾート地。熱帯植物・サンゴ礁・絶景。"},
        "🍢 墾丁大街夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"墾丁大街夜市：入場無料。海辺のリゾート街の夜市。屋台・バー・ライブハウスが集中。"},
        "🏖️ 白砂湾":{min:0,avg:0,max:0,trend:"±0%",reason:"白砂湾：入場無料。映画「ライフ・オブ・パイ」のロケ地。透明度の高い海。"},
        "🏖️ 南湾":{min:0,avg:0,max:0,trend:"±0%",reason:"南湾：入場無料。墾丁を代表するビーチ。サーフィン・パラセイリング・ジェットスキーが盛ん。"},
        "🌳 社頂自然公園":{min:80,avg:80,max:80,trend:"±0%",reason:"社頂自然公園：大人NT$80。サンゴ礁の隆起した独特の地形。蝶・蝙蝠（コウモリ）の名所。"},
        "🌊 龍磐公園":{min:0,avg:0,max:0,trend:"±0%",reason:"龍磐公園：入場無料。崖の上の絶景スポット。星空観賞地としても有名。"},
        "🗼 鵝鑾鼻燈塔":{min:60,avg:60,max:60,trend:"±0%",reason:"鵝鑾鼻燈塔：大人NT$60。台湾最南端の灯台。1882年建造の歴史的灯台。"},
        "🐄 墾丁牧場":{min:60,avg:60,max:60,trend:"±0%",reason:"墾丁牧場：大人NT$60。台湾唯一の熱帯牧場。広大な緑地と動物たち。"},
        "🐠 海生館":{min:450,avg:450,max:450,trend:"+5%",reason:"国立海洋生物博物館：大人NT$450、子供NT$250。台湾最大の水族館。シロイルカ・ペンギン・サンゴ礁展示。"},
        "⚓ 後壁湖漁港":{min:0,avg:0,max:0,trend:"±0%",reason:"後壁湖漁港：入場無料。墾丁屈指の漁港。新鮮な刺身が安く食べられる。"},
        "🦐 海鮮":{min:300,avg:600,max:1500,trend:"+10%",reason:"墾丁海鮮：NT$300〜1500。後壁湖・恆春の漁港から直送。マグロ・カジキ・カキが豪華。"},
        "🥗 緑豆蒜":{min:40,avg:60,max:90,trend:"+8%",reason:"緑豆蒜（緑豆スイーツ）：NT$40〜90。墾丁・恆春の伝統スイーツ。冷温選べる。"},
        "🍢 墾丁夜市B級グルメ":{min:50,avg:100,max:200,trend:"+8%",reason:"墾丁大街屋台：1品NT$50〜200。サテ・カクテル・スムージーなどリゾート風。"},
        "🥥 椰子水":{min:60,avg:80,max:120,trend:"+8%",reason:"新鮮椰子水：NT$60〜120。墾丁の南国フルーツ。ストロー付きで提供。"},
        "🥚 鴨蛋":{min:30,avg:50,max:80,trend:"+8%",reason:"恆春鴨蛋（塩漬けアヒル卵）：NT$30〜80。墾丁周辺の伝統食品。お土産にも人気。"},
        "🦑 烤魷魚":{min:100,avg:150,max:250,trend:"+8%",reason:"烤魷魚（焼きイカ）：NT$100〜250。海辺の屋台の定番。墾丁夜市の人気商品。"},
        "🍧 フルーツ氷":{min:80,avg:120,max:200,trend:"+8%",reason:"南国フルーツかき氷：NT$80〜200。マンゴー・パパイヤ・釈迦頭などトロピカル。"},
        "🍺 墾丁ビアガーデン":{min:200,avg:400,max:800,trend:"+10%",reason:"墾丁ビアガーデン：1人NT$200〜800。海辺のオープンバー。台湾ビール・カクテル・ライブ。"},
      },
    },
  },
  タイ:{
    food:{
      "🏪 コンビニ":{min:35,avg:55,max:100,trend:"+5%",reason:"セブンイレブン等35〜100THB。"},
      "🍢 屋台":{min:30,avg:70,max:150,trend:"+12%",reason:"パッタイ・カオパット40〜80THB。観光地は高め。"},
      "🍜 ローカル食堂":{min:40,avg:80,max:180,trend:"+8%",reason:"地元食堂40〜180THB。"},
      "🍣 チェーン":{min:60,avg:130,max:280,trend:"+7%",reason:"MK・バーガーキング等60〜280THB。"},
      "🍽️ カジュアル":{min:150,avg:300,max:600,trend:"+8%",reason:"エアコン付きレストラン150〜600THB。"},
      "🥂 中級":{min:400,avg:900,max:2000,trend:"+10%",reason:"中級レストラン400〜2000THB。"},
      "🥩 高級":{min:1000,avg:2500,max:6000,trend:"+10%",reason:"高級レストラン1000〜6000THB以上。"},
      "👑 超高級":{min:2500,avg:6000,max:20000,trend:"+12%",reason:"ミシュラン掲載店2500〜20000THB以上。"},
      "🌅 朝食":{min:40,avg:90,max:250,trend:"+5%",reason:"カフェモーニング80〜250THB。屋台40〜80THB。"},
      "☀️ ランチ":{min:60,avg:160,max:500,trend:"+8%",reason:"ランチ60〜500THB。"},
      "🌆 ディナー":{min:120,avg:500,max:2500,trend:"+10%",reason:"ディナー120〜2500THB。"},
      "🍱 テイクアウト":{min:30,avg:70,max:150,trend:"+8%",reason:"市場弁当30〜150THB。"},
      "☕ カフェ軽食":{min:80,avg:200,max:500,trend:"+8%",reason:"カフェ軽食80〜500THB。"},
      "🌙 夜食":{min:30,avg:80,max:200,trend:"+8%",reason:"深夜屋台30〜200THB。"},
      "🍜 現地料理":{min:40,avg:100,max:300,trend:"+10%",reason:"パッタイ・トムヤム40〜300THB。"},
      "🍣 魚介・海鮮":{min:200,avg:800,max:4000,trend:"+12%",reason:"海老・蟹は量り売りで200〜4000THB以上。"},
      "🥩 肉料理":{min:100,avg:400,max:2000,trend:"+10%",reason:"豚・鶏グリル100〜500THB。"},
      "🌱 ベジタリアン":{min:50,avg:150,max:400,trend:"+8%",reason:"ジェイ料理専門店50〜400THB。"},
      "🍕 洋食":{min:180,avg:500,max:1800,trend:"+8%",reason:"ピザ・パスタ180〜1800THB。"},
      "🍱 他国アジア":{min:100,avg:280,max:900,trend:"+7%",reason:"日本・中華・韓国料理100〜900THB。"},
      "🍰 スイーツ":{min:30,avg:100,max:350,trend:"+8%",reason:"マンゴースティッキーライス60〜120THB。"},
    },
    drink:{
      "🏪 コンビニ":{min:15,avg:25,max:50,trend:"+3%",reason:"ペットボトル飲料15〜50THB。"},
      "🧋 タピオカ":{min:45,avg:80,max:160,trend:"+10%",reason:"タイティー・タピオカ45〜160THB。"},
      "☕ カフェ":{min:120,avg:180,max:300,trend:"+6%",reason:"スタバ等120〜300THB。"},
      "🍺 バー":{min:60,avg:150,max:500,trend:"+8%",reason:"ビアシン60〜120THB。カクテルは高め。"},
      "🧃 屋台ドリンク":{min:20,avg:40,max:80,trend:"+5%",reason:"絞りたてジュース20〜80THB。"},
    },
    taxi:{
      "🚕 一般タクシー":{minPerKm:8,baseMin:35,baseAvg:45,surge:{"深夜":1.3,"夕方":1.2,"朝":1.1,"昼":1.0},trend:"+5%",reason:"初乗り35THB＋1kmあたり8THB。深夜割増あり。渋滞時は高くなる。"},
      "📱 Grab/Uber":{minPerKm:12,baseMin:60,baseAvg:80,surge:{"深夜":1.5,"夕方":1.4,"朝":1.1,"昼":1.0},trend:"+15%",reason:"透明な料金設定で安心。ピーク時サージあり。"},
      "🛺 トゥクトゥク":{minPerKm:20,baseMin:100,baseAvg:150,surge:{"深夜":1.5,"夕方":1.3,"朝":1.1,"昼":1.0},trend:"+10%",reason:"観光客向けで交渉制。必ず乗車前に確認。"},
      "🚌 バス":{minPerKm:2,baseMin:16,baseAvg:30,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"安定",reason:"BTSは16〜59THB。MRTと組み合わせると便利。"},
    },
    hotel:{
      "🏠 ゲストハウス":{min:200,avg:450,max:900,trend:"+8%",reason:"カオサン周辺200〜900THB。"},
      "⭐ ビジネス":{min:700,avg:1400,max:3000,trend:"+10%",reason:"スクンビット周辺700〜3000THB。"},
      "⭐⭐ 中級":{min:1800,avg:3500,max:7000,trend:"+12%",reason:"3〜4つ星1800〜7000THB。"},
      "⭐⭐⭐ 高級":{min:5000,avg:10000,max:25000,trend:"+15%",reason:"5つ星5000THB〜。"},
      "🏖️ リゾート":{min:3500,avg:8000,max:30000,trend:"+12%",reason:"プーケット・サムイ3500〜30000THB。"},
    },
    shopping:{
      "👕 衣料":{min:100,avg:400,max:2000,trend:"+5%",reason:"チャトゥチャック市場なら100〜500THB。"},
      "💄 コスメ":{min:50,avg:300,max:1500,trend:"+5%",reason:"BOOTSやWatsonsで購入可能。"},
      "🛒 スーパー":{min:20,avg:80,max:300,trend:"+7%",reason:"Big CやTopsは安め。"},
      "🎁 おみやげ":{min:50,avg:250,max:1000,trend:"+8%",reason:"ナイトマーケットが安い。"},
      "💻 家電":{min:500,avg:3000,max:30000,trend:"+3%",reason:"MBKやパンティッププラザで購入可能。"},
    },
    activity:{
      "🏛️ 観光入場":{min:50,avg:300,max:600,trend:"+10%",reason:"ワット・プラケオは500THB（外国人料金）。"},
      "🤿 アクティビティ":{min:500,avg:2000,max:8000,trend:"+10%",reason:"プーケット海アクティビティ500〜8000THB。"},
      "💆 マッサージ":{min:150,avg:400,max:2000,trend:"+8%",reason:"タイ古式1時間200〜500THB。"},
      "🎭 エンタメ":{min:300,avg:1200,max:3000,trend:"+8%",reason:"バーやショー300THB〜。"},
      "🚌 ツアー":{min:500,avg:1500,max:5000,trend:"+10%",reason:"半日ツアー500〜2000THB。"},
    },
    famous:{
      バンコク:{
        "🏯 王宮(グランドパレス)":{min:500,avg:500,max:500,trend:"±0%",reason:"王宮(グランドパレス)：外国人500THB（タイ人無料）。ワットプラケオ込み。8:30〜15:30。"},
        "🛕 ワットポー":{min:300,avg:300,max:300,trend:"+50%",reason:"ワットポー：300THB（2024年1月値上げ、以前は200THB）。涅槃仏で有名。タイ古式マッサージ総本山。"},
        "🛕 ワットアルン":{min:100,avg:100,max:100,trend:"±0%",reason:"ワットアルン（暁の寺）：100THB。チャオプラヤー川対岸。渡し船4THB。"},
        "🛕 ワットパクナム":{min:200,avg:200,max:200,trend:"±0%",reason:"ワットパクナム：200THB。緑の天井画が有名なインスタ映え寺院。"},
        "🌃 カオサンロード":{min:0,avg:0,max:0,trend:"±0%",reason:"カオサンロード：散策無料。バックパッカーの聖地。屋台・バー・マッサージ集中。"},
        "🛍️ チャトゥチャック":{min:0,avg:0,max:0,trend:"±0%",reason:"チャトゥチャック市場：入場無料。8000店舗超の世界最大級ウィークエンドマーケット（土日のみ）。"},
        "🛍️ アジアティーク":{min:0,avg:0,max:0,trend:"±0%",reason:"アジアティーク：入場無料。チャオプラヤー川沿いの観光ナイトマーケット。観覧車別途400THB。"},
        "🐘 エラワンミュージアム":{min:400,avg:400,max:400,trend:"+5%",reason:"エラワン・ミュージアム：400THB。巨大な三頭象の博物館。神話の世界観。"},
        "🌳 ルンピニ公園":{min:0,avg:0,max:0,trend:"±0%",reason:"ルンピニ公園：入園無料。バンコク中心部のオアシス。早朝のオオトカゲ目撃も。"},
        "💎 エメラルド寺院":{min:0,avg:0,max:0,trend:"±0%",reason:"ワットプラケオ（エメラルド寺院）：王宮500THBに含まれる。タイで最も神聖な寺院。"},
        "🍜 パッタイ":{min:40,avg:80,max:300,trend:"+10%",reason:"パッタイ：屋台40〜80THB、レストラン100〜300THB。タイの代表料理。海老入りが定番。"},
        "🍲 トムヤムクン":{min:80,avg:200,max:600,trend:"+10%",reason:"トムヤムクン：屋台80〜150THB、レストラン200〜600THB。世界三大スープ。"},
        "🍚 ガパオライス":{min:50,avg:80,max:200,trend:"+10%",reason:"ガパオライス：屋台50〜80THB、フードコート80〜120THB。目玉焼き載せが定番。"},
        "🥭 マンゴースティッキー":{min:80,avg:120,max:250,trend:"+10%",reason:"カオニャオマムアン：80〜250THB。マンゴーシーズン（4〜6月）が最高。"},
        "🥗 ソムタム":{min:50,avg:80,max:200,trend:"+10%",reason:"ソムタム（青パパイヤサラダ）：屋台50〜80THB、レストラン150〜200THB。"},
        "🍗 カオマンガイ":{min:50,avg:80,max:200,trend:"+10%",reason:"カオマンガイ（海南鶏飯）：屋台50〜80THB、レストラン100〜200THB。ピンクのジョークがおすすめ。"},
        "🍲 トムカーガイ":{min:100,avg:200,max:400,trend:"+10%",reason:"トムカーガイ：100〜400THB。ココナッツミルクとガランガル（タイ生姜）の優しいスープ。"},
        "🍛 マッサマンカレー":{min:120,avg:200,max:500,trend:"+10%",reason:"マッサマンカレー：120〜500THB。CNN「世界の最も美味しい料理ランキング」1位獲得。"},
      },
      チェンマイ:{
        "🛕 ドイステープ寺院":{min:30,avg:30,max:50,trend:"±0%",reason:"ドイステープ寺院：30THB、ケーブルカー50THB。標高1080mの山頂にある黄金の仏塔。"},
        "🛕 ワットチェディルアン":{min:40,avg:40,max:40,trend:"±0%",reason:"ワットチェディルアン：大人40THB。チェンマイ旧市街中心の歴史的仏塔。"},
        "🏛️ ターペー門":{min:0,avg:0,max:0,trend:"±0%",reason:"ターペー門：散策無料。チェンマイ旧市街の東門。鳩の餌やりが名物。"},
        "🛍️ ナイトバザール":{min:0,avg:0,max:0,trend:"±0%",reason:"チェンマイナイトバザール：入場無料。毎晩開催。タイ手工芸品の宝庫。"},
        "🛍️ サンデーマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"サンデーマーケット：入場無料（日曜のみ）。旧市街の歩行者天国。"},
        "🏔️ ドイインタノン":{min:300,avg:300,max:300,trend:"±0%",reason:"ドイインタノン国立公園：外国人300THB。タイ最高峰2565m。雲海・滝・寺院。"},
        "🐅 タイガーキングダム":{min:250,avg:500,max:799,trend:"+10%",reason:"タイガーキングダム：入場250THB、虎との触れ合い799THB〜。大人・子供の虎で価格差。"},
        "🛕 ワットウモーン":{min:0,avg:0,max:0,trend:"±0%",reason:"ワットウモーン：参拝無料。瞑想用のトンネルがある森の中の寺院。穴場スポット。"},
        "🐘 メーサー象キャンプ":{min:500,avg:1500,max:3500,trend:"+10%",reason:"メーサーエレファントキャンプ：見学500THB、乗象1500THB、1日プログラム3500THB。"},
        "☂️ ボーサン傘の村":{min:0,avg:0,max:0,trend:"±0%",reason:"ボーサン傘の村：見学無料。タイ伝統の和紙傘作りが見られる工芸村。"},
        "🍜 カオソーイ":{min:60,avg:100,max:250,trend:"+10%",reason:"カオソーイ：屋台60〜100THB、有名店150〜250THB。北部名物のカレーラーメン。"},
        "🌭 サイウア":{min:60,avg:120,max:300,trend:"+10%",reason:"サイウア（北部ハーブソーセージ）：60〜300THB。レモングラスとハーブが効いた名物。"},
        "🌶️ ナムプリックノム":{min:50,avg:100,max:200,trend:"+8%",reason:"ナムプリックノム（青唐辛子ディップ）：50〜200THB。野菜と一緒に食べる北部料理。"},
        "🍱 カントーク料理":{min:300,avg:600,max:1200,trend:"+10%",reason:"カントーク・ディナー：300〜1200THB。北部伝統料理を低い丸テーブルで食べる体験。"},
        "🍳 北部料理":{min:80,avg:200,max:600,trend:"+10%",reason:"ランナー（北部）料理セット：80〜600THB。マイルドで野菜中心。"},
        "🥤 マンゴージュース":{min:30,avg:50,max:100,trend:"+8%",reason:"フレッシュマンゴージュース：30〜100THB。屋台で安く新鮮なものが飲める。"},
        "🎆 コムローイ祭":{min:0,avg:3000,max:15000,trend:"+15%",reason:"コムローイ（イーペン）祭：自由参加無料、有料会場3000〜15000THB（11月）。"},
        "🍦 ココナッツアイス":{min:30,avg:60,max:120,trend:"+8%",reason:"ココナッツアイス：30〜120THB。ココナッツの実に入れて出す屋台スイーツ。"},
      },
      プーケット:{
        "🏝️ ピピ島ツアー":{min:1500,avg:2200,max:3500,trend:"+10%",reason:"ピピ島1日ツアー：スピードボート1500〜2500THB、ラグジュアリー3500THB。国立公園代400THB別途。"},
        "🏖️ カロンビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"カロンビーチ：入場無料。パトンより落ち着いた雰囲気のビーチ。"},
        "🏖️ パトンビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"パトンビーチ：入場無料。プーケット最も有名なビーチ。バングラ通り隣接。"},
        "🏖️ カタビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"カタビーチ：入場無料。サーフィン人気のビーチ。家族連れにも安全。"},
        "🌅 プロムテープ岬":{min:0,avg:0,max:0,trend:"±0%",reason:"プロムテープ岬：入場無料。プーケット南端の絶景サンセットスポット。"},
        "🏛️ ビッグブッダ":{min:0,avg:0,max:0,trend:"±0%",reason:"ビッグブッダ：参拝無料（寄付歓迎）。高さ45mの白い大仏。プーケットを一望。"},
        "🛕 ワットチャロン":{min:0,avg:0,max:0,trend:"±0%",reason:"ワットチャロン：参拝無料。プーケット最大・最重要の寺院。"},
        "🏘️ オールドタウン":{min:0,avg:0,max:0,trend:"±0%",reason:"プーケット・オールドタウン：散策無料。シノ・ポルトガル建築のカラフルな街並み。"},
        "🌃 バングラ通り":{min:0,avg:0,max:0,trend:"±0%",reason:"バングラ通り：散策無料。パトンビーチ近くの夜の歓楽街。ぼったくり注意。"},
        "🏝️ ジェームズボンド島":{min:1500,avg:2000,max:3500,trend:"+10%",reason:"ジェームズボンド島ツアー：1500〜3500THB。映画ロケ地・カヌー体験込み。"},
        "🦞 シーフード":{min:300,avg:800,max:2500,trend:"+10%",reason:"プーケットシーフード：300〜2500THB。ロブスター・蟹・エビが豊富。"},
        "🥖 ロティ":{min:30,avg:60,max:120,trend:"+8%",reason:"ロティ：30〜120THB。バナナ・チョコ・コンデンスミルクなどが定番。"},
        "🍜 ホッケンミー":{min:60,avg:100,max:200,trend:"+10%",reason:"ホッケンミー（福建麺）：60〜200THB。プーケット名物の太麺。中華系移民の料理。"},
        "🍲 トムカーガイ":{min:120,avg:200,max:400,trend:"+10%",reason:"プーケット風トムカーガイ：120〜400THB。海鮮入りも美味。"},
        "🌶️ ナムプリック":{min:50,avg:100,max:200,trend:"+8%",reason:"プーケット風ナムプリック：50〜200THB。エビペーストの辛いディップ。"},
        "🍧 ファラン氷":{min:60,avg:100,max:180,trend:"+8%",reason:"カキ氷（ナムケンサイ）：60〜180THB。トロピカルフルーツトッピング。"},
        "🍢 サテー":{min:60,avg:100,max:200,trend:"+8%",reason:"サテー（串焼き）：60〜200THB。マレー系の影響を受けた料理。ピーナッツソース。"},
        "🏝️ ナイハーン":{min:0,avg:0,max:0,trend:"±0%",reason:"ナイハーンビーチ：入場無料。プーケット南端の隠れ家ビーチ。透明度高い。"},
      },
      パタヤ:{
        "🏛️ サンクチュアリオブトゥルース":{min:500,avg:500,max:500,trend:"±0%",reason:"サンクチュアリ・オブ・トゥルース：500THB。木造彫刻の巨大寺院。建設中の傑作。"},
        "🌺 ノンヌーチビレッジ":{min:500,avg:500,max:1000,trend:"+8%",reason:"ノンヌーチ・トロピカルガーデン：入場500THB、ショー込み1000THB。象ショー・タイ文化ショー。"},
        "🏖️ パタヤビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"パタヤビーチ：入場無料。パラセーリング500〜1000THBなどマリンスポーツ充実。"},
        "🏖️ ジョムティエン":{min:0,avg:0,max:0,trend:"±0%",reason:"ジョムティエンビーチ：入場無料。パタヤより落ち着いた家族向けビーチ。"},
        "🛍️ フローティングマーケット":{min:200,avg:200,max:200,trend:"±0%",reason:"パタヤ・フローティングマーケット：200THB。4地方のタイ料理・工芸品が集まる。"},
        "🗼 7大不思議の塔":{min:500,avg:500,max:500,trend:"±0%",reason:"パタヤ・パークタワー：展望500THB、レボリューションランチ含み1000THB〜。"},
        "🎭 アルカザールショー":{min:600,avg:800,max:1200,trend:"+8%",reason:"アルカザールショー：600〜1200THB（席別）。世界三大ニューハーフショー。"},
        "🎭 ティファニーショー":{min:800,avg:1000,max:1500,trend:"+8%",reason:"ティファニーショー：800〜1500THB。パタヤを代表する華麗なショー。"},
        "🌃 ウォーキングストリート":{min:0,avg:0,max:0,trend:"±0%",reason:"ウォーキングストリート：散策無料。パタヤの歓楽街。20時から車両通行止め。"},
        "🏝️ ラン島":{min:30,avg:200,max:500,trend:"+10%",reason:"ラン島フェリー：往復30〜100THB、スピードボートチャーター500THB〜。透明度抜群。"},
        "🦞 シーフード":{min:300,avg:600,max:1500,trend:"+10%",reason:"パタヤシーフード：300〜1500THB。観光地価格だが新鮮。"},
        "🍲 海鮮鍋":{min:400,avg:800,max:2000,trend:"+10%",reason:"海鮮鍋（タイスキ）：400〜2000THB。MK・コカが有名チェーン。"},
        "🥭 トロピカルフルーツ":{min:50,avg:120,max:300,trend:"+8%",reason:"トロピカルフルーツ盛り：50〜300THB。ドリアン・マンゴスチン・ランブータン。"},
        "🍦 ココナッツアイス":{min:40,avg:80,max:150,trend:"+8%",reason:"ココナッツアイス：40〜150THB。屋台の定番デザート。"},
        "🍢 屋台料理":{min:30,avg:80,max:200,trend:"+10%",reason:"屋台料理：30〜200THB/品。ウォーキングストリート周辺は観光地価格。"},
        "🔥 ビーチBBQ":{min:300,avg:600,max:1500,trend:"+10%",reason:"ビーチBBQ：300〜1500THB。サンセットを見ながら楽しめる。"},
        "🍢 サテー":{min:60,avg:100,max:200,trend:"+8%",reason:"サテー：60〜200THB。屋台・レストラン共に手軽に楽しめる。"},
        "🍹 サムイティー":{min:60,avg:100,max:200,trend:"+8%",reason:"タイティー：60〜200THB。コンデンスミルクの濃厚な甘さ。"},
      },
      クラビ:{
        "🏖️ ライレイビーチ":{min:100,avg:150,max:300,trend:"+8%",reason:"ライレイビーチ：船代100〜300THB。陸路アクセス不可の楽園ビーチ。"},
        "💚 エメラルドプール":{min:200,avg:200,max:200,trend:"±0%",reason:"エメラルドプール：外国人200THB。透き通る天然プール。ジャングルトレッキング込み。"},
        "♨️ ホットスプリング":{min:90,avg:90,max:90,trend:"±0%",reason:"クラビホットスプリング：90THB。エメラルドプール近くの天然温泉。"},
        "🛕 ティガーケーブ":{min:0,avg:0,max:0,trend:"±0%",reason:"ティガーケーブ寺院（虎の寺）：参拝無料。1237段の階段を登り絶景。"},
        "🏖️ アオナンビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"アオナンビーチ：入場無料。クラビ最大の観光ビーチ。"},
        "🏝️ ホン島ツアー":{min:1200,avg:1500,max:2500,trend:"+10%",reason:"ホン島ツアー：1200〜2500THB。ラグーンで有名な秘境の島。"},
        "🏝️ 4島ツアー":{min:1000,avg:1200,max:2000,trend:"+10%",reason:"4島ツアー：1000〜2000THB。チキン島・タップ島・プラナン洞窟を巡る人気コース。"},
        "🌃 クラビナイトマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"クラビタウンナイトマーケット：入場無料。週末開催。地元グルメが安い。"},
        "🏔️ カルスト諸島":{min:1000,avg:1500,max:3000,trend:"+10%",reason:"カルストアイランドホッピング：1000〜3000THB。石灰岩の絶景島巡り。"},
        "🌿 マングローブツアー":{min:800,avg:1200,max:2000,trend:"+10%",reason:"マングローブカヤックツアー：800〜2000THB。シーカヌーで原始の森を探検。"},
        "🦞 シーフード":{min:300,avg:600,max:1500,trend:"+10%",reason:"クラビシーフード：300〜1500THB。アンダマン海の新鮮な魚介。"},
        "🍝 カノムジーンナムヤー":{min:60,avg:100,max:200,trend:"+8%",reason:"カノムジーン・ナムヤー：60〜200THB。米麺に魚カレーをかけた南部料理。"},
        "🥚 ホイトート":{min:80,avg:150,max:300,trend:"+10%",reason:"ホイトート（カキオムレツ）：80〜300THB。タイ南部沿岸の名物。"},
        "🍢 サテーカイ":{min:60,avg:100,max:200,trend:"+8%",reason:"サテーカイ（鶏串焼き）：60〜200THB。ピーナッツソースで食べるマレー系料理。"},
        "🍛 南部料理":{min:80,avg:200,max:500,trend:"+10%",reason:"タイ南部料理：80〜500THB。辛味と塩味が強烈。マッサマン・カレーは必食。"},
        "🥤 フルーツシェイク":{min:50,avg:80,max:150,trend:"+8%",reason:"フルーツシェイク：50〜150THB。マンゴー・パッションフルーツが定番。"},
        "🥖 ロティ":{min:30,avg:60,max:120,trend:"+8%",reason:"ロティ：30〜120THB。バナナ・コンデンスミルクの組み合わせが人気。"},
        "🌳 ジャングルジュース":{min:60,avg:100,max:200,trend:"+8%",reason:"ジャングルジュース：60〜200THB。複数のトロピカルフルーツをミックス。"},
      },
      アユタヤ:{
        "🛕 ワットマハタート":{min:50,avg:50,max:50,trend:"±0%",reason:"ワット・マハタート：外国人50THB。木の根に絡まれた仏頭で有名。アユタヤ象徴。"},
        "🛕 ワットプラシーサンペット":{min:50,avg:50,max:50,trend:"±0%",reason:"ワット・プラシーサンペット：50THB。歴代王3名の遺骨を祀る三仏塔。"},
        "🛕 ワットチャイワッタナラム":{min:50,avg:50,max:50,trend:"±0%",reason:"ワット・チャイワッタナラム：50THB。クメール様式の美しい廃墟。タイ衣装での撮影が人気。"},
        "🛕 ワットヤイチャイモンコン":{min:20,avg:20,max:20,trend:"±0%",reason:"ワット・ヤイチャイモンコン：20THB。1357年建造。寝釈迦仏と巨大仏塔。"},
        "🛕 ワットロカヤスタ":{min:0,avg:0,max:0,trend:"±0%",reason:"ワット・ロカヤスタ：参拝無料。野ざらしの大きな寝釈迦仏で有名。"},
        "🏯 バーンパイン宮殿":{min:100,avg:100,max:100,trend:"±0%",reason:"バーンパイン宮殿：100THB。歴代タイ王の夏の離宮。ヨーロッパ・中国・タイ折衷建築。"},
        "🐘 象乗り体験":{min:400,avg:500,max:800,trend:"+10%",reason:"アユタヤ象乗り体験：400〜800THB（10〜30分）。遺跡周辺を散策できる。"},
        "🌃 ナイトマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"アユタヤナイトマーケット：入場無料。地元グルメが安く食べられる。"},
        "🛍️ 水上マーケット":{min:200,avg:200,max:200,trend:"±0%",reason:"アユタヤ水上マーケット（アヨタヤ）：入場200THB。タイ伝統の水上売店を再現。"},
        "🚂 アユタヤ鉄道":{min:50,avg:80,max:100,trend:"+8%",reason:"バンコク〜アユタヤ鉄道：3等15〜30THB、2等エアコン80〜100THB。所要1.5時間。"},
        "🍜 ボートヌードル":{min:20,avg:50,max:100,trend:"+10%",reason:"ボートヌードル：1杯20〜100THB。小ぶりな器で何杯も食べるスタイル。"},
        "🍬 ロティサイマイ":{min:30,avg:50,max:100,trend:"+8%",reason:"ロティ・サイマイ：30〜100THB。アユタヤ名物の綿あめロティ。"},
        "🦐 川エビ料理":{min:300,avg:600,max:1500,trend:"+10%",reason:"クン・メーナム（川エビ料理）：300〜1500THB。アユタヤ名物の巨大川エビ。"},
        "🍗 カオマンガイ":{min:50,avg:80,max:150,trend:"+10%",reason:"カオマンガイ：50〜150THB。アユタヤの食堂でも定番。"},
        "🍗 グリルチキン":{min:80,avg:150,max:300,trend:"+8%",reason:"ガイヤーン（グリルチキン）：80〜300THB。ソムタムとセットで食べる。"},
        "🍦 ココナッツアイス":{min:30,avg:60,max:120,trend:"+8%",reason:"ココナッツアイス：30〜120THB。観光遺跡周辺の屋台定番。"},
        "🍡 伝統菓子":{min:30,avg:50,max:150,trend:"+8%",reason:"タイ伝統菓子：30〜150THB。フォイトンなど王宮菓子発祥の地。"},
        "🍢 屋台料理":{min:30,avg:60,max:150,trend:"+10%",reason:"アユタヤ屋台料理：30〜150THB。観光地でも安い地元価格。"},
      },
      サムイ島:{
        "🏖️ チャウエンビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"チャウエンビーチ：入場無料。サムイ島最大の観光ビーチ。ナイトライフも活発。"},
        "🏖️ ラマイビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"ラマイビーチ：入場無料。チャウエンより落ち着いた雰囲気の人気ビーチ。"},
        "🪨 ヒンタヒンヤイ":{min:0,avg:0,max:0,trend:"±0%",reason:"ヒンタ・ヒンヤイ（おじいさん・おばあさん岩）：入場無料。男女性器の形をした珍岩。"},
        "🏛️ ビッグブッダ寺院":{min:0,avg:0,max:0,trend:"±0%",reason:"ビッグブッダ寺院（ワットプライレム）：参拝無料。サムイ島のシンボル12m大仏。"},
        "💧 ナムアン滝":{min:0,avg:0,max:0,trend:"±0%",reason:"ナムアン滝：入場無料。サムイ島最大の滝。象乗り体験も可能。"},
        "🏘️ フィッシャーマンズ":{min:0,avg:0,max:0,trend:"±0%",reason:"フィッシャーマンズビレッジ：散策無料。金曜のナイトマーケットが名物。"},
        "🏖️ ボパイビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"ボプットビーチ：入場無料。フィッシャーマンズ村に隣接する穏やかなビーチ。"},
        "🏝️ アンソン海洋公園":{min:300,avg:1500,max:3000,trend:"+10%",reason:"アンソン国立海洋公園：入園300THB、日帰りツアー1500〜3000THB。42島の絶景。"},
        "🚢 パンガン島フェリー":{min:300,avg:400,max:500,trend:"+8%",reason:"パンガン島フェリー：300〜500THB（片道）。フルムーンパーティーで有名。"},
        "♨️ スパ温泉":{min:500,avg:1500,max:5000,trend:"+10%",reason:"サムイスパ：500〜5000THB。タイマッサージから本格スパまで。"},
        "🦞 シーフード":{min:300,avg:800,max:2500,trend:"+10%",reason:"サムイ島シーフード：300〜2500THB。新鮮なシーフードBBQが名物。"},
        "🌴 ヤシ油料理":{min:80,avg:200,max:500,trend:"+10%",reason:"ココナッツオイル使用料理：80〜500THB。サムイ島はココナッツの島として有名。"},
        "🍲 トムヤムクン":{min:100,avg:250,max:600,trend:"+10%",reason:"トムヤムクン：100〜600THB。リゾート価格だがレベル高い。"},
        "🦞 ロブスター":{min:1500,avg:3000,max:6000,trend:"+12%",reason:"ロブスター：1500〜6000THB（重量別）。アンダマン海産。"},
        "🍦 ココナッツアイス":{min:50,avg:80,max:150,trend:"+8%",reason:"ココナッツアイス：50〜150THB。サムイ産のフレッシュココナッツ使用。"},
        "🥖 ロティ":{min:40,avg:80,max:150,trend:"+8%",reason:"ロティ：40〜150THB。ビーチ屋台で深夜まで楽しめる。"},
        "🔥 海鮮BBQ":{min:400,avg:800,max:2000,trend:"+10%",reason:"海鮮BBQ：400〜2000THB。フィッシャーマンズ村のレストランが定番。"},
        "🥭 フルーツバスケット":{min:100,avg:200,max:500,trend:"+8%",reason:"フルーツバスケット：100〜500THB。マンゴスチン・ランブータン・ロンガン。"},
      },
      チェンライ:{
        "🤍 ワットロンクン(白寺)":{min:100,avg:100,max:100,trend:"+100%",reason:"ワットロンクン（白寺）：外国人100THB（タイ人無料）。2024年に有料化。現代芸術家チャラームチャイ作。"},
        "💙 ワットロンスアテン(青寺)":{min:0,avg:0,max:0,trend:"±0%",reason:"ワットロンスアテン（青寺）：参拝無料。鮮やかな青の現代寺院。"},
        "🖤 バーンダム(黒寺)":{min:80,avg:80,max:80,trend:"±0%",reason:"バーンダム博物館（黒寺）：80THB。タワン・ダッチャニー作の黒い建物群。"},
        "🌟 ゴールデントライアングル":{min:0,avg:0,max:0,trend:"±0%",reason:"ゴールデントライアングル：見学無料。タイ・ラオス・ミャンマー3国境地帯。ボートツアー500THB〜。"},
        "🌄 メーサイ":{min:0,avg:0,max:0,trend:"±0%",reason:"メーサイ：入場無料。タイ最北端の街。ミャンマー国境とマーケット。"},
        "🏔️ ドイメーサロン":{min:0,avg:0,max:0,trend:"±0%",reason:"ドイメーサロン：入場無料。標高1800mの中国系雲南族の集落。お茶畑とサクラ。"},
        "🏘️ 山岳民族の村":{min:300,avg:500,max:1000,trend:"+10%",reason:"山岳民族村ツアー：300〜1000THB。アカ・カレン・ヤオ・モン族の伝統村訪問。"},
        "🕰️ 時計塔":{min:0,avg:0,max:0,trend:"±0%",reason:"チェンライ時計塔：見学無料。チャラームチャイ作の黄金時計塔。毎晩19/20/21時に音楽演出。"},
        "🛍️ ナイトバザール":{min:0,avg:0,max:0,trend:"±0%",reason:"チェンライナイトバザール：入場無料。毎晩開催。ローカルフード・工芸品。"},
        "🌳 ドイトンプロジェクト":{min:90,avg:90,max:90,trend:"±0%",reason:"ドイトン・ロイヤルプロジェクト：90THB。プミポン国王の母王太后の植林開発プロジェクト。"},
        "🍜 カオソーイ":{min:50,avg:80,max:200,trend:"+10%",reason:"チェンライカオソーイ：50〜200THB。チェンマイより少しマイルドな北部カレーラーメン。"},
        "🍲 ナムニアオ":{min:60,avg:100,max:200,trend:"+10%",reason:"ナムニアオ：60〜200THB。豚血と豆もやしの北部スープ。シャン族発祥。"},
        "🍝 カノムジン":{min:40,avg:80,max:150,trend:"+10%",reason:"カノムジン：40〜150THB。発酵米麺に色々なカレーソースをかける。"},
        "🍛 シャンミャンマー料理":{min:80,avg:200,max:500,trend:"+10%",reason:"シャン・ミャンマー料理：80〜500THB。チェンライ郊外のミャンマー系移民料理。"},
        "🍒 ライチ":{min:50,avg:100,max:300,trend:"+10%",reason:"ライチ：1kg 50〜300THB（5〜6月の季節）。チェンライ・チェンマイ特産。"},
        "☕ ドイチャンコーヒー":{min:80,avg:150,max:400,trend:"+10%",reason:"ドイチャン・コーヒー：80〜400THB。タイ最高級アラビカ豆。世界的にも評価。"},
        "🌶️ メーカームポン":{min:60,avg:100,max:200,trend:"+8%",reason:"メーカームポン料理：60〜200THB。山岳地帯の伝統料理。"},
        "🍵 お茶":{min:60,avg:150,max:500,trend:"+10%",reason:"チェンライお茶（烏龍・緑茶）：60〜500THB。ドイメーサロン産が有名。"},
      },
    },
  },
  ベトナム:{
    famous:{
      ハノイ:{
        "🏛️ ホアンキエム湖":{min:0,avg:0,max:0,trend:"±0%",reason:"ホアンキエム湖：散策無料。ハノイ中心部の景勝地。亀の伝説と玉山祠（30,000VND）。"},
        "🏯 ホーチミン廟":{min:0,avg:0,max:0,trend:"±0%",reason:"ホーチミン廟：入場無料。ベトナム建国の父の遺体を保管する霊廟。月・金休館。服装規定厳しい。"},
        "🛕 文廟":{min:30000,avg:30000,max:30000,trend:"±0%",reason:"文廟（孔子廟）：30,000VND。1070年建立のベトナム最古の大学。学問の神様。"},
        "🏰 タンロン遺跡":{min:30000,avg:30000,max:30000,trend:"±0%",reason:"タンロン皇城遺跡：30,000VND。世界遺産。ベトナム王朝の都の跡地。"},
        "🏘️ 旧市街36通り":{min:0,avg:0,max:0,trend:"±0%",reason:"旧市街36通り：散策無料。1000年の歴史を持つハノイの心臓部。屋台・カフェが集中。"},
        "🎭 タンロン水上人形劇":{min:100000,avg:150000,max:200000,trend:"+10%",reason:"水上人形劇：100,000〜200,000VND。ベトナム伝統芸能。1日数回上演。"},
        "🛕 一柱寺":{min:0,avg:0,max:0,trend:"±0%",reason:"一柱寺：参拝無料。1049年建立。1本の柱に建つ蓮の花のような寺。"},
        "⛪ ハノイ大教会":{min:0,avg:0,max:0,trend:"±0%",reason:"セントジョセフ大聖堂（ハノイ大教会）：見学無料。1886年建造のネオゴシック様式。"},
        "🚂 ハノイ駅":{min:0,avg:0,max:0,trend:"±0%",reason:"ハノイ・トレイン・ストリート：散策無料。線路ギリギリのカフェ街で有名。"},
        "🛍️ ドンスアン市場":{min:0,avg:0,max:0,trend:"±0%",reason:"ドンスアン市場：入場無料。ハノイ最大の卸売市場。フランス統治時代から続く。"},
        "🍜 フォー":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"フォー：屋台30,000〜60,000VND、レストラン100,000〜150,000VND。ベトナム代表料理。"},
        "🥖 バインミー":{min:20000,avg:40000,max:80000,trend:"+10%",reason:"バインミー：20,000〜80,000VND。フランスパンに各種具材を詰めたベトナムサンド。"},
        "🌯 生春巻き":{min:30000,avg:60000,max:120000,trend:"+10%",reason:"生春巻き（ゴイクオン）：30,000〜120,000VND。エビと豚肉のヘルシー春巻き。"},
        "☕ ベトナムコーヒー":{min:20000,avg:40000,max:80000,trend:"+8%",reason:"ベトナムコーヒー：20,000〜80,000VND。練乳入り濃厚カフェスーダー。"},
        "🍳 エッグコーヒー":{min:40000,avg:60000,max:100000,trend:"+10%",reason:"エッグコーヒー：40,000〜100,000VND。ハノイ発祥。卵黄とコーヒーの濃厚スイーツ風。"},
        "🍢 ブンチャー":{min:50000,avg:80000,max:150000,trend:"+10%",reason:"ブンチャー：50,000〜150,000VND。炭火焼き豚と米麺のハノイ名物。オバマ大統領も訪問。"},
        "🥗 ブンボーフエ":{min:50000,avg:80000,max:150000,trend:"+10%",reason:"ブンボーフエ：50,000〜150,000VND。中部フエ発祥のスパイシー牛肉麺。"},
        "🍡 チェー":{min:20000,avg:40000,max:80000,trend:"+8%",reason:"チェー：20,000〜80,000VND。豆・果物・ココナッツミルクの伝統スイーツ。"},
      },
      ホーチミン:{
        "🏛️ 統一会堂":{min:65000,avg:65000,max:65000,trend:"±0%",reason:"統一会堂（旧大統領官邸）：65,000VND。南ベトナム時代の遺構。1975年戦車突入の歴史的場所。"},
        "🏛️ 戦争証跡博物館":{min:40000,avg:40000,max:40000,trend:"+167%",reason:"戦争証跡博物館：40,000VND（以前15,000）。ベトナム戦争を伝える博物館。必訪。"},
        "⛪ サイゴン大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"サイゴン大聖堂（聖母マリア教会）：見学無料（改修中）。1880年建造のフランス植民地時代の象徴。"},
        "📬 中央郵便局":{min:0,avg:0,max:0,trend:"±0%",reason:"中央郵便局：入場無料。1891年建造のフランス植民地建築。エッフェル設計関与説。"},
        "🛍️ ベンタイン市場":{min:0,avg:0,max:0,trend:"±0%",reason:"ベンタイン市場：入場無料。ホーチミンを代表する市場。観光客向け価格に注意。"},
        "🛕 ジェード・エンペラー廟":{min:0,avg:0,max:0,trend:"±0%",reason:"玉皇廟：参拝無料。1909年建造の中国系仏教寺院。風水・パワースポット。"},
        "🏘️ ドンコイ通り":{min:0,avg:0,max:0,trend:"±0%",reason:"ドンコイ通り：散策無料。ホーチミンのメインストリート。高級ブランド・ホテル。"},
        "🌃 ブイビエン通り":{min:0,avg:0,max:0,trend:"±0%",reason:"ブイビエン通り：散策無料。バックパッカー街。ナイトライフの中心。"},
        "🚇 クチトンネル":{min:140000,avg:140000,max:140000,trend:"+10%",reason:"クチトンネル：140,000VND。ベトナム戦争時の地下トンネル網。射撃体験別途。"},
        "🌊 メコン川クルーズ":{min:600000,avg:1200000,max:2500000,trend:"+10%",reason:"メコン川日帰りクルーズ：600,000〜2,500,000VND。ミトー・ベンチェのジャングル探検。"},
        "🍜 フォー":{min:40000,avg:80000,max:200000,trend:"+10%",reason:"フォー（南部）：40,000〜200,000VND。北部より甘めの味付け。"},
        "🥖 バインミー":{min:20000,avg:40000,max:80000,trend:"+10%",reason:"バインミー：20,000〜80,000VND。バインミー37、バインミーフィンが名店。"},
        "🥘 コムタム":{min:40000,avg:80000,max:150000,trend:"+10%",reason:"コムタム（割れ米ご飯）：40,000〜150,000VND。ホーチミン市民のソウルフード。"},
        "🍲 フーティウ":{min:40000,avg:70000,max:150000,trend:"+10%",reason:"フーティウ：40,000〜150,000VND。南部独特の米麺料理。エビ・豚肉が定番。"},
        "🍜 ブンボーフエ":{min:50000,avg:80000,max:150000,trend:"+10%",reason:"ブンボーフエ：50,000〜150,000VND。フエ発祥の辛い牛肉麺。"},
        "🦐 シーフード":{min:200000,avg:500000,max:1500000,trend:"+10%",reason:"ホーチミンシーフード：200,000〜1,500,000VND。エビ・カニ・牡蠣が新鮮。"},
        "☕ ベトナムコーヒー":{min:20000,avg:40000,max:80000,trend:"+8%",reason:"ベトナムコーヒー：20,000〜80,000VND。コンドゥックビン・ルアンビンが有名。"},
        "🌶️ チェー":{min:20000,avg:40000,max:80000,trend:"+8%",reason:"チェー：20,000〜80,000VND。南部はココナッツミルクベースが多い。"},
      },
      ダナン:{
        "🌉 ゴールデンブリッジ(神の手)":{min:900000,avg:1000000,max:1000000,trend:"±0%",reason:"ゴールデンブリッジ：バーナーヒルズ入場料に含まれる（約1,000,000VND）。巨大な石の手で支えられた橋。"},
        "🎢 バーナーヒルズ":{min:900000,avg:1000000,max:1500000,trend:"+10%",reason:"バーナーヒルズ：大人900,000〜1,500,000VND。ゴンドラ・ゴールデンブリッジ込み。フランス風村。"},
        "🏖️ ミーケービーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"ミーケービーチ：入場無料。フォーブス選定「世界の美しいビーチ」に選出。"},
        "⛰️ 五行山":{min:40000,avg:40000,max:140000,trend:"+10%",reason:"五行山（マーブルマウンテン）：40,000VND（メインピーク）、エレベーター15,000VND別途。洞窟と仏像。"},
        "🐉 ドラゴンブリッジ":{min:0,avg:0,max:0,trend:"±0%",reason:"ドラゴンブリッジ：見学無料。週末21時に龍が火と水を吹くショー（無料）。"},
        "⛪ ダナン大聖堂(ピンク教会)":{min:0,avg:0,max:0,trend:"±0%",reason:"ダナン大聖堂：見学無料（外観のみ可）。1923年建造のピンク色のフランス植民地教会。"},
        "🛍️ ハン市場":{min:0,avg:0,max:0,trend:"±0%",reason:"ハン市場：入場無料。ダナン中心部の伝統市場。グルメ・お土産が安い。"},
        "🌊 ハン川":{min:0,avg:200000,max:500000,trend:"+8%",reason:"ハン川クルーズ：200,000〜500,000VND。ドラゴンブリッジを船から眺める夜景。"},
        "🏛️ チャム彫刻博物館":{min:60000,avg:60000,max:60000,trend:"±0%",reason:"チャム彫刻博物館：60,000VND。チャンパ王国の彫刻300点超を展示。"},
        "🌃 ダナン夜市":{min:0,avg:0,max:0,trend:"±0%",reason:"ダナンナイトマーケット（ソンチャー）：入場無料。屋台・お土産・マッサージ。"},
        "🍜 ミークアン":{min:30000,avg:50000,max:120000,trend:"+10%",reason:"ミークアン：30,000〜120,000VND。ダナン名物の麺料理。黄色い太麺にエビ・豚・ピーナッツ。"},
        "🥩 バインセオ":{min:50000,avg:80000,max:150000,trend:"+10%",reason:"バインセオ：50,000〜150,000VND。ベトナム風お好み焼き。中部スタイルが本場。"},
        "🦞 シーフード":{min:200000,avg:500000,max:1500000,trend:"+10%",reason:"ダナンシーフード：200,000〜1,500,000VND。ハン市場・ミーケーで新鮮。"},
        "🍤 ネムルイ":{min:50000,avg:100000,max:200000,trend:"+10%",reason:"ネムルイ：50,000〜200,000VND。レモングラスに巻いた串焼き。ライスペーパーで巻いて食べる。"},
        "🌯 バインチャン":{min:30000,avg:60000,max:120000,trend:"+10%",reason:"バインチャンクオン：30,000〜120,000VND。中部スタイルの揚げ春巻き。"},
        "🍢 屋台料理":{min:20000,avg:50000,max:150000,trend:"+10%",reason:"ダナン屋台：20,000〜150,000VND。ハン市場・ホアンサ通りで深夜まで。"},
        "🥤 ココナッツコーヒー":{min:40000,avg:60000,max:120000,trend:"+10%",reason:"ココナッツコーヒー：40,000〜120,000VND。ホイアン・ダナンで流行。"},
        "🍡 チェー":{min:20000,avg:40000,max:80000,trend:"+8%",reason:"チェー：20,000〜80,000VND。中部はもち米・タロイモが多い。"},
      },
      ホイアン:{
        "🏘️ 旧市街":{min:120000,avg:120000,max:120000,trend:"±0%",reason:"ホイアン旧市街：通行券120,000VND（5箇所の歴史建築入場可）。世界遺産。"},
        "🌉 来遠橋(日本橋)":{min:120000,avg:120000,max:120000,trend:"±0%",reason:"来遠橋（日本橋）：旧市街通行券に含まれる。17世紀建造の日本人街跡の屋根付き橋。"},
        "🏮 ランタンフェスティバル":{min:0,avg:0,max:0,trend:"±0%",reason:"ランタンフェスティバル：見学無料（旧暦14日）。電灯が消されランタンの灯りのみで幻想的。"},
        "🌊 トゥボン川":{min:50000,avg:100000,max:200000,trend:"+10%",reason:"トゥボン川ボート＋ランタン流し：50,000〜200,000VND。夜の幻想的体験。"},
        "🏝️ チャム島":{min:300000,avg:600000,max:1200000,trend:"+10%",reason:"チャム島ツアー：300,000〜1,200,000VND。シュノーケリング・ダイビング。生物圏保護区。"},
        "🛍️ ナイトマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"ホイアン・ナイトマーケット：入場無料。グエンホアン通り。ランタン・お土産・グルメ。"},
        "🏖️ アンバンビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"アンバンビーチ：入場無料。ホイアンから自転車10分。落ち着いた雰囲気。"},
        "🏯 福建会館":{min:120000,avg:120000,max:120000,trend:"±0%",reason:"福建会館：旧市街通行券に含まれる。1697年建造の中国福建省出身者の会館。"},
        "🏯 廣肇会館":{min:120000,avg:120000,max:120000,trend:"±0%",reason:"廣肇会館：旧市街通行券に含まれる。広東省出身者の会館。鮮やかな装飾。"},
        "🌾 ココナッツビレッジ":{min:150000,avg:200000,max:400000,trend:"+10%",reason:"ココナッツボートツアー：150,000〜400,000VND。バスケットボートで水上散策。"},
        "🍜 カオラウ":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"カオラウ：30,000〜100,000VND。ホイアン名物。中部独特の太麺料理。"},
        "🥟 ホワイトローズ":{min:50000,avg:80000,max:150000,trend:"+10%",reason:"ホワイトローズ（バインヴァク）：50,000〜150,000VND。エビ蒸し餃子。ホイアン名物。"},
        "🥢 揚げワンタン":{min:40000,avg:70000,max:150000,trend:"+10%",reason:"揚げワンタン：40,000〜150,000VND。ホイアン3大名物の1つ。"},
        "🍝 ミークアン":{min:30000,avg:50000,max:120000,trend:"+10%",reason:"ミークアン：30,000〜120,000VND。中部の麺料理。ホイアンでも食べられる。"},
        "🥖 バインミー(フォン)":{min:25000,avg:40000,max:80000,trend:"+10%",reason:"バインミーフォン：25,000〜80,000VND。アンソニー・ボーディン氏絶賛のホイアン名店。"},
        "🐟 ホイアンチキンライス":{min:40000,avg:70000,max:120000,trend:"+10%",reason:"コムガーホイアン：40,000〜120,000VND。ホイアン風チキンライス。"},
        "🍡 チェー":{min:15000,avg:30000,max:60000,trend:"+8%",reason:"チェー：15,000〜60,000VND。屋台で手軽に。"},
        "🥖 バインバオ":{min:15000,avg:30000,max:60000,trend:"+8%",reason:"バインバオ（中華まん）：15,000〜60,000VND。中華系移民の影響。"},
      },
      フエ:{
        "🏯 フエ王宮(グエン朝)":{min:200000,avg:200000,max:200000,trend:"+33%",reason:"フエ王宮：200,000VND（2024年値上げ、以前150,000）。北京紫禁城を模した世界遺産。"},
        "🏛️ カイディン帝廟":{min:150000,avg:150000,max:150000,trend:"+25%",reason:"カイディン帝廟：150,000VND。グエン朝12代皇帝の墓。東西折衷の華麗な装飾。"},
        "🏛️ ミンマン帝廟":{min:150000,avg:150000,max:150000,trend:"+25%",reason:"ミンマン帝廟：150,000VND。グエン朝2代皇帝の墓。中国風建築。"},
        "🏛️ トゥドゥック帝廟":{min:150000,avg:150000,max:150000,trend:"+25%",reason:"トゥドゥック帝廟：150,000VND。4代皇帝の墓。庭園と建築が美しい。"},
        "🛕 ティエンムー寺":{min:0,avg:0,max:0,trend:"±0%",reason:"ティエンムー寺：参拝無料。7階建ての八角形塔がフエの象徴。"},
        "🌊 フォーン川クルーズ":{min:200000,avg:400000,max:800000,trend:"+10%",reason:"フォーン川（香川）ドラゴンボート：200,000〜800,000VND。帝廟巡りに使われる。"},
        "🛍️ ドンバ市場":{min:0,avg:0,max:0,trend:"±0%",reason:"ドンバ市場：入場無料。フエ最大の伝統市場。コニカル・ハットが名物。"},
        "🏘️ フエ旧市街":{min:0,avg:0,max:0,trend:"±0%",reason:"フエ旧市街：散策無料。フォーン川の南北に古い街並みが残る。"},
        "🚉 フエ駅":{min:0,avg:0,max:0,trend:"±0%",reason:"フエ駅：見学無料。フランス植民地時代の鉄道駅。1906年建造。"},
        "🌉 チュオンティエン橋":{min:0,avg:0,max:0,trend:"±0%",reason:"チュオンティエン橋：通行無料。1899年建造の鉄橋。エッフェル設計と伝わる。"},
        "🍲 ブンボーフエ":{min:30000,avg:60000,max:120000,trend:"+10%",reason:"ブンボーフエ：30,000〜120,000VND。フエ発祥の辛い牛肉麺。本場の味を堪能。"},
        "🍡 バインベオ":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"バインベオ：30,000〜100,000VND。米粉の小皿蒸しケーキ。エビフレーク乗せ。"},
        "🥟 バインボッロック":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"バインボッロック：30,000〜100,000VND。透明な皮の海老餃子。"},
        "🥣 コムヘン":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"コムヘン：30,000〜100,000VND。フエ名物の貝飯。香り野菜とピリ辛。"},
        "🍜 ブン":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"ブン各種：30,000〜100,000VND。フエはブン料理の宝庫。"},
        "🍢 ネムランチコ":{min:40000,avg:70000,max:150000,trend:"+10%",reason:"ネムランチコ：40,000〜150,000VND。フエの宮廷由来料理。発酵豚肉。"},
        "🥢 バインナム":{min:25000,avg:40000,max:80000,trend:"+10%",reason:"バインナム：25,000〜80,000VND。バナナの葉に包まれた米粉ケーキ。"},
        "🥄 宮廷料理":{min:500000,avg:1000000,max:2500000,trend:"+10%",reason:"フエ宮廷料理コース：500,000〜2,500,000VND。グエン朝の宮廷料理を再現。"},
      },
      ニャチャン:{
        "🏖️ ニャチャンビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"ニャチャンビーチ：入場無料。7kmにわたる白砂ビーチ。リゾート街。"},
        "🎢 ヴィンパールランド":{min:880000,avg:880000,max:880000,trend:"+10%",reason:"ヴィンパール（ヴィンワンダーズ）：880,000VND。ニャチャン沖の島のテーマパーク。ロープウェイ込み。"},
        "🛕 ロンソン寺":{min:0,avg:0,max:0,trend:"±0%",reason:"ロンソン寺（龍山寺）：参拝無料。山頂に高さ24mの白い大仏。1886年建造。"},
        "🏯 ポーナガル塔":{min:30000,avg:30000,max:30000,trend:"±0%",reason:"ポーナガル塔：30,000VND。チャンパ王国の遺跡。8〜13世紀建造のヒンドゥー寺院。"},
        "💧 泥温泉":{min:200000,avg:400000,max:800000,trend:"+10%",reason:"泥温泉スパ：200,000〜800,000VND。ニャチャン名物。ミネラルたっぷりの泥風呂。"},
        "🏝️ ホンチョン岬":{min:30000,avg:30000,max:30000,trend:"±0%",reason:"ホンチョン岬：30,000VND。奇岩と海の絶景。ベトナム民族学博物館併設。"},
        "🏝️ 4島ツアー":{min:300000,avg:500000,max:800000,trend:"+10%",reason:"4島ツアー：300,000〜800,000VND。ホンミウ・ホンモットなど島巡り。"},
        "⛪ ニャチャン大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"ニャチャン大聖堂：見学無料。1928年建造のゴシック様式石造教会。"},
        "🌃 ナイトマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"ニャチャンナイトマーケット：入場無料。海鮮屋台・お土産が並ぶ。"},
        "🎢 ヴィンワンダーズ":{min:880000,avg:880000,max:880000,trend:"+10%",reason:"ヴィンワンダーズ：880,000VND。ヴィンパール拡張版。新アトラクション豊富。"},
        "🦞 シーフード":{min:200000,avg:500000,max:1500000,trend:"+10%",reason:"ニャチャンシーフード：200,000〜1,500,000VND。ロブスター・カキが安く新鮮。"},
        "🐟 ネムヌオン":{min:60000,avg:100000,max:200000,trend:"+10%",reason:"ネムヌオン：60,000〜200,000VND。豚肉串焼き。ニャチャンは発祥地のひとつ。"},
        "🦐 海鮮鍋":{min:300000,avg:600000,max:1500000,trend:"+10%",reason:"海鮮鍋：300,000〜1,500,000VND。サンゴ礁の魚介が豊富。"},
        "🍜 ブンチャーカー":{min:30000,avg:60000,max:120000,trend:"+10%",reason:"ブンチャーカー：30,000〜120,000VND。ニャチャン名物の魚団子麺。"},
        "🌯 春巻き":{min:30000,avg:60000,max:120000,trend:"+10%",reason:"生春巻き・揚げ春巻き：30,000〜120,000VND。シーフード入りが定番。"},
        "🍡 チェー":{min:15000,avg:30000,max:60000,trend:"+8%",reason:"チェー：15,000〜60,000VND。ビーチ近くの屋台で。"},
        "🥃 ベトナム焼酎":{min:50000,avg:150000,max:500000,trend:"+10%",reason:"ベトナム焼酎（ルアウデ）：50,000〜500,000VND。米焼酎。ニャチャンは産地。"},
        "🍢 BBQ":{min:200000,avg:400000,max:1000000,trend:"+10%",reason:"ビーチBBQ：200,000〜1,000,000VND。ロブスター・カキを炭火で。"},
      },
      ダラット:{
        "🌺 ダラット花公園":{min:50000,avg:50000,max:50000,trend:"±0%",reason:"ダラット花公園：50,000VND。標高1500mの高原都市の花の名所。3万平方m。"},
        "🏯 バオダイ離宮":{min:50000,avg:50000,max:50000,trend:"±0%",reason:"バオダイ離宮：50,000VND。ベトナム最後の皇帝の夏の離宮。1933年建造のアールデコ。"},
        "🚂 ダラット駅":{min:5000,avg:170000,max:170000,trend:"+10%",reason:"ダラット駅見学：5,000VND、観光列車170,000VND。フランス植民地時代1932年建造。"},
        "💒 クレイジーハウス":{min:60000,avg:60000,max:60000,trend:"±0%",reason:"クレイジーハウス：60,000VND。元首相の娘・ダン・ヴィエト・ガが設計した奇抜建築。"},
        "💧 ダタンラ滝":{min:50000,avg:200000,max:400000,trend:"+10%",reason:"ダタンラ滝：入場50,000VND、コースター200,000、ジップライン400,000VND。"},
        "🌲 ランビアン山":{min:30000,avg:120000,max:200000,trend:"+10%",reason:"ランビアン山：入山30,000VND、ジープ往復120,000、ピーク200,000VND。標高2167m。"},
        "🏞️ トゥエンラム湖":{min:0,avg:80000,max:200000,trend:"±0%",reason:"トゥエンラム湖：入場無料、ボート80,000〜200,000VND。ダラット最大の湖。"},
        "🌹 バラ園":{min:30000,avg:30000,max:30000,trend:"±0%",reason:"バラ園・ハイドランジア園：30,000VND。500種類のバラとアジサイ畑。"},
        "⛪ ドメイン・デ・マリー教会":{min:0,avg:0,max:0,trend:"±0%",reason:"ドメイン・デ・マリー教会：見学無料。1942年建造のフランス植民地修道院。ピンク色。"},
        "🛍️ ダラット市場":{min:0,avg:0,max:0,trend:"±0%",reason:"ダラットセントラルマーケット：入場無料。高原野菜・果物・花が安い。"},
        "🍓 イチゴ":{min:50000,avg:150000,max:400000,trend:"+10%",reason:"ダラットイチゴ：1kg 50,000〜400,000VND。高地気候の特産品。"},
        "🍷 ダラットワイン":{min:150000,avg:300000,max:800000,trend:"+10%",reason:"ダラットワイン：150,000〜800,000VND。ベトナム唯一のワイン産地。"},
        "☕ アラビカコーヒー":{min:80000,avg:200000,max:600000,trend:"+10%",reason:"ダラット・アラビカコーヒー：80,000〜600,000VND。高地栽培の高品質豆。"},
        "🥬 高原野菜":{min:20000,avg:50000,max:150000,trend:"+10%",reason:"ダラット高原野菜：20,000〜150,000VND/kg。アーティチョーク・カリフラワーが特産。"},
        "🍲 鍋料理":{min:200000,avg:400000,max:800000,trend:"+10%",reason:"ダラット鍋（ラウ）：200,000〜800,000VND。寒い高地で人気の温まる料理。"},
        "🌽 焼きトウモロコシ":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"焼きトウモロコシ：15,000〜60,000VND。屋台の冬の定番。"},
        "🍡 ダラットチェー":{min:20000,avg:40000,max:80000,trend:"+8%",reason:"ダラットチェー：20,000〜80,000VND。高原の冷たいスイーツ。"},
        "🌭 ベトナムソーセージ":{min:50000,avg:100000,max:200000,trend:"+10%",reason:"ネムチュア（生発酵ソーセージ）：50,000〜200,000VND。タインホア・ダラットが産地。"},
      },
      ハロン湾:{
        "⛵ ハロン湾クルーズ":{min:1000000,avg:2500000,max:5000000,trend:"+10%",reason:"ハロン湾日帰りクルーズ：1,000,000〜5,000,000VND。1泊2日宿泊5,000,000VND〜。世界遺産。"},
        "🌊 ティトップ島":{min:0,avg:0,max:0,trend:"±0%",reason:"ティトップ島：クルーズ料金に含まれる。ハロン湾を見渡せる展望台。海水浴可能。"},
        "🕳️ スンソット鍾乳洞":{min:0,avg:0,max:0,trend:"±0%",reason:"スンソット洞窟（驚きの洞窟）：クルーズ料金に含まれる。ハロン湾最大の鍾乳洞。"},
        "🚣 カヤック体験":{min:200000,avg:300000,max:500000,trend:"+10%",reason:"カヤック体験：200,000〜500,000VND。クルーズオプションに含まれることが多い。"},
        "🏝️ カットバ島":{min:0,avg:0,max:0,trend:"±0%",reason:"カットバ島：入場無料。ハロン湾最大の島。ハイキング・ロッククライミングの聖地。"},
        "🐒 モンキーアイランド":{min:0,avg:0,max:0,trend:"±0%",reason:"モンキーアイランド：見学無料（船代別）。野生の猿が生息。"},
        "🌊 ルオン洞":{min:0,avg:0,max:0,trend:"±0%",reason:"ルオン洞窟：クルーズ料金に含まれる。手漕ぎボートで通り抜ける天然トンネル。"},
        "🎣 真珠養殖場":{min:0,avg:0,max:0,trend:"±0%",reason:"真珠養殖場見学：クルーズ料金に含まれる。世界的に有名なハロン湾の真珠。"},
        "🌅 サンセットクルーズ":{min:500000,avg:800000,max:1500000,trend:"+10%",reason:"サンセットクルーズ：500,000〜1,500,000VND。2〜3時間の夕日鑑賞コース。"},
        "🌙 ナイトクルーズ":{min:1500000,avg:3000000,max:5000000,trend:"+10%",reason:"ナイトクルーズ：1,500,000〜5,000,000VND。船上泊でディナー＋朝食。"},
        "🦞 シーフード":{min:300000,avg:800000,max:2000000,trend:"+10%",reason:"ハロン湾シーフード：300,000〜2,000,000VND。新鮮な海産物。船上ディナー込み。"},
        "🦀 カニ料理":{min:400000,avg:800000,max:1500000,trend:"+10%",reason:"カニ料理：400,000〜1,500,000VND。ハロン湾名物。蒸し・茹で・チリソース。"},
        "🦐 ロブスター":{min:1500000,avg:3000000,max:6000000,trend:"+12%",reason:"ロブスター：1,500,000〜6,000,000VND（重量別）。ハロン湾の高級食材。"},
        "🐟 イカ":{min:200000,avg:400000,max:800000,trend:"+10%",reason:"イカ料理：200,000〜800,000VND。チャムムックは名物。"},
        "🍲 海鮮粥":{min:80000,avg:150000,max:300000,trend:"+10%",reason:"海鮮粥：80,000〜300,000VND。船上の朝食定番。"},
        "🥢 揚げ春巻き":{min:30000,avg:60000,max:120000,trend:"+10%",reason:"揚げ春巻き：30,000〜120,000VND。クルーズ料理にも含まれることが多い。"},
        "🍶 ライスワイン":{min:30000,avg:100000,max:300000,trend:"+10%",reason:"ライスワイン（ルアウデ）：30,000〜300,000VND。船上で味わうのが粋。"},
        "🦪 牡蠣":{min:100000,avg:200000,max:500000,trend:"+10%",reason:"牡蠣：100,000〜500,000VND。ハロン湾は牡蠣産地として有名。"},
      },
    },
  },
  インド:{
    food:{
      "🏪 コンビニ":{min:10,avg:50,max:150,trend:"+10%",reason:"スナック・飲料10〜150INR。"},
      "🍢 屋台":{min:10,avg:40,max:100,trend:"+12%",reason:"チャイ・チャパティ10〜50INR。衛生面に注意。"},
      "🍜 ローカル食堂":{min:50,avg:150,max:400,trend:"+10%",reason:"ダール・カレーセット50〜300INR。"},
      "🍣 チェーン":{min:100,avg:300,max:600,trend:"+8%",reason:"マクドナルド・KFC等100〜500INR。"},
      "🍽️ カジュアル":{min:200,avg:500,max:1200,trend:"+8%",reason:"カジュアルレストラン200〜1200INR。"},
      "🥂 中級":{min:500,avg:1500,max:4000,trend:"+10%",reason:"中級レストラン500〜4000INR。"},
      "🥩 高級":{min:1500,avg:4000,max:10000,trend:"+12%",reason:"高級レストラン1500〜10000INR。"},
      "👑 超高級":{min:3000,avg:8000,max:25000,trend:"+12%",reason:"5星ホテルのレストラン3000〜25000INR。"},
      "🌅 朝食":{min:30,avg:120,max:400,trend:"+8%",reason:"イドゥリ・ドーサ30〜150INR。ホテルビュッフェ400〜1000INR。"},
      "☀️ ランチ":{min:50,avg:200,max:800,trend:"+10%",reason:"ターリー定食50〜300INR。"},
      "🌆 ディナー":{min:150,avg:600,max:3000,trend:"+10%",reason:"レストランディナー150〜3000INR。"},
      "🍱 テイクアウト":{min:30,avg:100,max:300,trend:"+8%",reason:"ビリヤニ・サモサ30〜200INR。"},
      "☕ カフェ軽食":{min:100,avg:300,max:800,trend:"+8%",reason:"カフェコーヒー80〜200INR。"},
      "🌙 夜食":{min:20,avg:80,max:250,trend:"+8%",reason:"屋台の夜食20〜150INR。"},
      "🍜 現地料理":{min:50,avg:200,max:600,trend:"+10%",reason:"カレー・ナン・ビリヤニ50〜600INR。"},
      "🍣 魚介・海鮮":{min:200,avg:600,max:2000,trend:"+12%",reason:"海岸部の海鮮200〜2000INR。"},
      "🥩 肉料理":{min:150,avg:400,max:1500,trend:"+10%",reason:"チキン・マトン150〜1000INR。"},
      "🌱 ベジタリアン":{min:30,avg:150,max:500,trend:"+8%",reason:"ベジミール30〜400INR。インドはベジ食豊富。"},
      "🍕 洋食":{min:200,avg:600,max:2000,trend:"+8%",reason:"ピザ・パスタ200〜1500INR。"},
      "🍱 他国アジア":{min:150,avg:400,max:1200,trend:"+7%",reason:"中華・日本料理150〜1500INR。"},
      "🍰 スイーツ":{min:20,avg:80,max:300,trend:"+5%",reason:"グラブジャムン・ラドゥ20〜100INR。"},
    },
    drink:{
      "🏪 コンビニ":{min:10,avg:30,max:80,trend:"+5%",reason:"水・清涼飲料10〜60INR。"},
      "🧋 タピオカ":{min:80,avg:150,max:300,trend:"+10%",reason:"都市部のバブルティー80〜250INR。"},
      "☕ カフェ":{min:80,avg:200,max:500,trend:"+8%",reason:"チャイ10〜30INR。カフェコーヒー100〜300INR。"},
      "🍺 バー":{min:100,avg:300,max:800,trend:"+8%",reason:"ビール100〜300INR。禁酒州に注意。"},
      "🧃 屋台ドリンク":{min:10,avg:30,max:80,trend:"+5%",reason:"ラッシー・サトウキビジュース10〜60INR。"},
    },
    taxi:{
      "🚕 一般タクシー":{minPerKm:15,baseMin:50,baseAvg:100,surge:{"深夜":1.5,"夕方":1.3,"朝":1.2,"昼":1.0},trend:"+10%",reason:"⚠️ 正規料金：初乗り約50INR＋1kmあたり15〜25INR。深夜1.5倍。必ずメーター使用を主張。Olaアプリが最安全。乗車前にGoogleマップで料金確認。"},
      "📱 Grab/Uber":{minPerKm:12,baseMin:80,baseAvg:120,surge:{"深夜":1.8,"夕方":1.5,"朝":1.2,"昼":1.0},trend:"+15%",reason:"Ola・Uberが最も安全で透明。ピーク時サージが激しいので事前料金確認必須。"},
      "🛺 トゥクトゥク":{minPerKm:10,baseMin:30,baseAvg:60,surge:{"深夜":2.0,"夕方":1.5,"朝":1.3,"昼":1.0},trend:"+12%",reason:"⚠️ 高リスク：観光客への大幅割増が頻繁。必ず乗車前に金額交渉・確認。Olaオートが最安全。"},
      "🚌 バス":{minPerKm:1,baseMin:10,baseAvg:20,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"安定",reason:"市バス・メトロ10〜50INR。デリー・ムンバイ等はメトロが便利で安全。"},
    },
    hotel:{
      "🏠 ゲストハウス":{min:200,avg:800,max:2000,trend:"+10%",reason:"バックパッカー宿200〜2000INR。"},
      "⭐ ビジネス":{min:1500,avg:4000,max:8000,trend:"+12%",reason:"ビジネスホテル1500〜8000INR。"},
      "⭐⭐ 中級":{min:3000,avg:7000,max:15000,trend:"+12%",reason:"3〜4つ星3000〜15000INR。"},
      "⭐⭐⭐ 高級":{min:8000,avg:20000,max:60000,trend:"+15%",reason:"5つ星8000〜60000INR。"},
      "🏖️ リゾート":{min:5000,avg:15000,max:50000,trend:"+12%",reason:"ゴア・ケーララのリゾート5000〜50000INR。"},
    },
    shopping:{
      "👕 衣料":{min:100,avg:500,max:3000,trend:"+8%",reason:"地元市場では100〜500INR。クルタ・サリーは高め。"},
      "💄 コスメ":{min:50,avg:300,max:2000,trend:"+5%",reason:"ローカルブランド50〜500INR。"},
      "🛒 スーパー":{min:10,avg:100,max:500,trend:"+8%",reason:"スパイス・食料品は非常に安い。"},
      "🎁 おみやげ":{min:50,avg:300,max:2000,trend:"+10%",reason:"定価の店か政府直営店での購入推奨。交渉可能。"},
      "💻 家電":{min:500,avg:15000,max:100000,trend:"+5%",reason:"電子製品は都市部で購入可能。"},
    },
    activity:{
      "🏛️ 観光入場":{min:10,avg:500,max:1500,trend:"+10%",reason:"外国人料金は高め。タージマハル外国人1100INR。"},
      "🤿 アクティビティ":{min:500,avg:2000,max:8000,trend:"+10%",reason:"ゴアのウォータースポーツ500〜5000INR。"},
      "💆 マッサージ":{min:200,avg:800,max:3000,trend:"+8%",reason:"アーユルヴェーダマッサージ200〜3000INR。"},
      "🎭 エンタメ":{min:100,avg:500,max:2000,trend:"+8%",reason:"映画200〜500INR。"},
      "🚌 ツアー":{min:500,avg:2000,max:8000,trend:"+10%",reason:"ガイド付きツアー500〜8000INR。政府認定ガイドを推奨。"},
    },
  },
  アメリカ:{
    food:{
      "🏪 コンビニ":{min:2,avg:8,max:15,trend:"+8%",reason:"サンドイッチ・スナック$2〜15。チップ通常不要。"},
      "🍢 屋台":{min:3,avg:10,max:20,trend:"+10%",reason:"フードトラック$3〜20。チップ10〜15%が慣例。"},
      "🍜 ローカル食堂":{min:8,avg:18,max:35,trend:"+8%",reason:"ダイナー・カジュアル$8〜35。チップ15〜20%。"},
      "🍣 チェーン":{min:5,avg:12,max:20,trend:"+10%",reason:"マクドナルド$5〜15。スターバックス$5〜10。"},
      "🍽️ カジュアル":{min:15,avg:30,max:60,trend:"+8%",reason:"カジュアルレストラン$15〜60。チップ別途20%。"},
      "🥂 中級":{min:40,avg:80,max:150,trend:"+8%",reason:"中級レストラン$40〜150/人。チップ込みで高め。"},
      "🥩 高級":{min:100,avg:200,max:400,trend:"+10%",reason:"高級レストラン$100〜400/人。"},
      "👑 超高級":{min:200,avg:400,max:1000,trend:"+12%",reason:"ミシュランレストラン$200〜1000/人以上。"},
      "🌅 朝食":{min:5,avg:15,max:30,trend:"+5%",reason:"ベーグル・コーヒー$5〜15。ブランチ$15〜35。"},
      "☀️ ランチ":{min:10,avg:20,max:40,trend:"+8%",reason:"ランチ$10〜40。チップ15〜20%別途。"},
      "🌆 ディナー":{min:20,avg:60,max:200,trend:"+10%",reason:"ディナー$20〜200/人。チップ20%が一般的。"},
      "🍱 テイクアウト":{min:8,avg:15,max:30,trend:"+8%",reason:"テイクアウト$8〜30。"},
      "☕ カフェ軽食":{min:5,avg:15,max:30,trend:"+5%",reason:"カフェランチ$10〜25。"},
      "🌙 夜食":{min:5,avg:15,max:30,trend:"+5%",reason:"深夜営業の店は少ない。"},
      "🍜 現地料理":{min:10,avg:25,max:60,trend:"+8%",reason:"バーガー・ステーキ・BBQ$10〜60。"},
      "🍣 魚介・海鮮":{min:20,avg:50,max:150,trend:"+10%",reason:"ロブスター・シーフード$20〜150/人。"},
      "🥩 肉料理":{min:15,avg:45,max:150,trend:"+10%",reason:"ステーキ$25〜150。"},
      "🌱 ベジタリアン":{min:10,avg:20,max:40,trend:"+8%",reason:"ベジ・ビーガンレストラン$10〜40。"},
      "🍕 洋食":{min:10,avg:20,max:50,trend:"+8%",reason:"ピザ1枚$10〜25。パスタ$15〜35。"},
      "🍱 他国アジア":{min:10,avg:20,max:50,trend:"+7%",reason:"アジア料理$10〜50。日本食$20〜60。"},
      "🍰 スイーツ":{min:3,avg:8,max:20,trend:"+5%",reason:"アイスクリーム$3〜10。ケーキ$5〜15。"},
    },
    drink:{
      "🏪 コンビニ":{min:1,avg:3,max:6,trend:"+5%",reason:"ペットボトル飲料$1〜5。"},
      "🧋 タピオカ":{min:5,avg:8,max:12,trend:"+10%",reason:"バブルティー$5〜12。"},
      "☕ カフェ":{min:3,avg:6,max:10,trend:"+8%",reason:"スタバのラテ$5〜8。"},
      "🍺 バー":{min:5,avg:10,max:20,trend:"+5%",reason:"ビール$5〜12。カクテル$10〜20。チップ別途。"},
      "🧃 屋台ドリンク":{min:2,avg:5,max:10,trend:"+5%",reason:"レモネード等$2〜8。"},
    },
    taxi:{
      "🚕 一般タクシー":{minPerKm:2,baseMin:5,baseAvg:8,surge:{"深夜":1.5,"夕方":1.3,"朝":1.1,"昼":1.0},trend:"+10%",reason:"初乗り$3〜8＋1マイルあたり$2〜3（約$1.2〜1.9/km）。空港は割増。"},
      "📱 Grab/Uber":{minPerKm:1.5,baseMin:5,baseAvg:8,surge:{"深夜":2.0,"夕方":1.5,"朝":1.2,"昼":1.0},trend:"+15%",reason:"Uber/Lyftはサージが激しい。ピーク時は2倍以上になることも。"},
      "🛺 トゥクトゥク":{minPerKm:0,baseMin:0,baseAvg:0,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"N/A",reason:"アメリカにはトゥクトゥクはほぼありません。"},
      "🚌 バス":{minPerKm:0.5,baseMin:2,baseAvg:3,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+3%",reason:"市バス・地下鉄$2〜4。NYは$2.90/乗車。"},
    },
    hotel:{
      "🏠 ゲストハウス":{min:30,avg:80,max:150,trend:"+12%",reason:"ホステル・モーテル$30〜150。"},
      "⭐ ビジネス":{min:80,avg:160,max:300,trend:"+15%",reason:"ビジネスホテル$80〜300。"},
      "⭐⭐ 中級":{min:150,avg:250,max:450,trend:"+15%",reason:"3〜4つ星$150〜450。"},
      "⭐⭐⭐ 高級":{min:300,avg:500,max:1000,trend:"+18%",reason:"5つ星$300〜1000以上。"},
      "🏖️ リゾート":{min:250,avg:500,max:2000,trend:"+15%",reason:"ハワイ・マイアミのリゾート$250〜2000。"},
    },
    shopping:{
      "👕 衣料":{min:10,avg:50,max:500,trend:"+5%",reason:"アウトレットは安め。ブランドは高い。"},
      "💄 コスメ":{min:5,avg:30,max:200,trend:"+5%",reason:"ドラッグストアブランドは安い。"},
      "🛒 スーパー":{min:1,avg:8,max:50,trend:"+10%",reason:"物価高騰中。州によって税率が異なる。"},
      "🎁 おみやげ":{min:5,avg:20,max:100,trend:"+8%",reason:"空港や観光地は割高。"},
      "💻 家電":{min:10,avg:200,max:2000,trend:"+3%",reason:"Best Buy等で購入可能。"},
    },
    activity:{
      "🏛️ 観光入場":{min:0,avg:25,max:150,trend:"+10%",reason:"国立公園$35/車。博物館$15〜30。"},
      "🤿 アクティビティ":{min:30,avg:100,max:400,trend:"+10%",reason:"ハワイのマリンスポーツ$50〜300。"},
      "💆 マッサージ":{min:50,avg:120,max:300,trend:"+8%",reason:"マッサージ$50〜200/時間。チップ別途。"},
      "🎭 エンタメ":{min:20,avg:100,max:500,trend:"+10%",reason:"ブロードウェイ$100〜500。映画$15〜25。"},
      "🚌 ツアー":{min:30,avg:100,max:400,trend:"+10%",reason:"シティツアー$30〜200。"},
    },
    famous:{
      ニューヨーク:{
        "🗽 自由の女神":{min:25.50,avg:25.50,max:35,trend:"+10%",reason:"自由の女神フェリー：一般入場$25.50、ペデスタル予約$35。リバティ島・エリス島入場込み。"},
        "🏙️ エンパイアステートビル":{min:44,avg:54,max:79,trend:"+10%",reason:"エンパイアステートビル：86階展望$44、102階追加$79。日没時刻は最も人気。"},
        "🏛️ メトロポリタン美術館":{min:30,avg:30,max:30,trend:"+10%",reason:"メトロポリタン美術館：$30（NY州民は寄付制）。世界最大級の美術館。"},
        "🎭 タイムズスクエア":{min:0,avg:0,max:0,trend:"±0%",reason:"タイムズスクエア：散策無料。世界の交差点。年中無休のネオン街。"},
        "🌳 セントラルパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"セントラルパーク：入園無料。マンハッタンの巨大公園。"},
        "🌉 ブルックリン橋":{min:0,avg:0,max:0,trend:"±0%",reason:"ブルックリン橋：散策無料。徒歩30分で渡れる。"},
        "🏛️ MoMA(近代美術館)":{min:30,avg:30,max:30,trend:"+10%",reason:"MoMA：$30。ピカソ・ゴッホ・ウォーホール等。金曜夜は無料（4〜8pm）。"},
        "🏛️ 9/11メモリアル":{min:0,avg:33,max:33,trend:"+10%",reason:"9/11メモリアル：無料、博物館$33。世界貿易センター跡地。"},
        "🛍️ 5番街":{min:0,avg:0,max:0,trend:"±0%",reason:"5番街：散策無料。ティファニー・グッチ等の高級ブランドが並ぶ。"},
        "🏛️ ロックフェラーセンター":{min:40,avg:40,max:60,trend:"+10%",reason:"トップ・オブ・ザ・ロック展望台：$40〜60。冬はアイスリンク。"},
        "🍕 NYピザ":{min:3,avg:6,max:15,trend:"+10%",reason:"NYピザ：1スライス$3〜6、ホール$15〜30。ジョーズピザが有名。"},
        "🥯 ベーグル":{min:3,avg:8,max:18,trend:"+10%",reason:"NYベーグル：プレーン$3、フィリング付き$8〜18。"},
        "🥪 パストラミサンド":{min:18,avg:25,max:40,trend:"+10%",reason:"パストラミサンドイッチ：$18〜40。カッツデリが有名（$24.95）。"},
        "🍰 NYチーズケーキ":{min:8,avg:12,max:18,trend:"+10%",reason:"NYチーズケーキ：1スライス$8〜18。ジュニアズが定番。"},
        "🌭 ホットドッグ":{min:3,avg:6,max:12,trend:"+10%",reason:"ホットドッグ：屋台$3〜6、レストラン$8〜12。"},
        "🥩 ステーキ":{min:50,avg:90,max:200,trend:"+10%",reason:"NYステーキ：$50〜200。ピータールガーが有名。"},
        "🍳 ブランチ":{min:20,avg:35,max:80,trend:"+10%",reason:"NYブランチ：$20〜80。サラ・ベスやバルサザールが人気。"},
        "🍔 ハンバーガー":{min:8,avg:18,max:35,trend:"+10%",reason:"NYバーガー：$8〜35。シェイクシャック・JGメロンが定番。"},
      },
      ロサンゼルス:{
        "🎬 ハリウッドサイン":{min:0,avg:0,max:0,trend:"±0%",reason:"ハリウッドサイン：見学無料。グリフィス天文台や周辺道路から眺望。"},
        "⭐ ハリウッドウォークオブフェイム":{min:0,avg:0,max:0,trend:"±0%",reason:"ウォーク・オブ・フェイム：散策無料。2700以上の星型銘板。"},
        "🎬 ユニバーサルスタジオ":{min:109,avg:139,max:209,trend:"+12%",reason:"ユニバーサル・スタジオ・ハリウッド：$109〜209。VIP $379〜。"},
        "🌊 サンタモニカピア":{min:0,avg:0,max:0,trend:"±0%",reason:"サンタモニカピア：散策無料。ルート66の終点。観覧車は別途$10。"},
        "🏖️ ベニスビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"ベニスビーチ：入場無料。スケートパーク・マッスルビーチ。"},
        "🎢 ディズニーランド":{min:104,avg:154,max:206,trend:"+15%",reason:"ディズニーランド（カリフォルニア）：$104〜206。世界初のディズニーパーク（1955年）。"},
        "🎨 ゲッティセンター":{min:0,avg:25,max:25,trend:"±0%",reason:"ゲッティセンター：入場無料、駐車場$25。ジャン・ポール・ゲッティの美術コレクション。"},
        "🌳 グリフィス天文台":{min:0,avg:0,max:0,trend:"±0%",reason:"グリフィス天文台：入場無料、プラネタリウム$10。映画「ラ・ラ・ランド」で有名。"},
        "🛍️ ロデオドライブ":{min:0,avg:0,max:0,trend:"±0%",reason:"ロデオドライブ：散策無料。ビバリーヒルズの高級ブランド街。"},
        "🏛️ LACMA":{min:25,avg:25,max:25,trend:"+10%",reason:"ロサンゼルス・カウンティ美術館：$25。アーバン・ライトが有名。"},
        "🌮 タコス":{min:3,avg:8,max:18,trend:"+10%",reason:"LAタコス：トラック$3〜8、レストラン$10〜18。本場メキシカン。"},
        "🥑 アボカドトースト":{min:10,avg:15,max:25,trend:"+10%",reason:"アボカドトースト：$10〜25。LA発祥のカフェ定番。"},
        "🍔 イン・アンド・アウト":{min:5,avg:9,max:15,trend:"+10%",reason:"イン・アンド・アウト・バーガー：$5〜15。LA発祥のフレッシュバーガーチェーン。"},
        "🍦 アイスクリーム":{min:5,avg:8,max:15,trend:"+10%",reason:"LAアイスクリーム：$5〜15。コルドポップ・サザン・カリフォルニアスタイル。"},
        "🥗 コブサラダ":{min:12,avg:18,max:30,trend:"+10%",reason:"コブサラダ：$12〜30。ハリウッド発祥（ブラウン・ダービー）。"},
        "🍝 シーフード":{min:25,avg:50,max:120,trend:"+10%",reason:"LAシーフード：$25〜120。サンタモニカ・マリブの新鮮な魚介。"},
        "🍩 ドーナツ":{min:2,avg:5,max:12,trend:"+10%",reason:"LAドーナツ：$2〜12。クリスピー・クリーム・ランドルフドーナツが定番。"},
        "🍺 クラフトビール":{min:6,avg:10,max:18,trend:"+10%",reason:"LAクラフトビール：$6〜18。スタウトクラフトブルワリーが多数。"},
      },
      シカゴ:{
        "🌆 ウィリスタワー":{min:34,avg:34,max:50,trend:"+10%",reason:"ウィリスタワー・スカイデッキ：$34〜50。103階のガラス床「The Ledge」が人気。"},
        "🪞 クラウドゲート(豆)":{min:0,avg:0,max:0,trend:"±0%",reason:"クラウドゲート（通称「ザ・ビーン」）：見学無料。アニッシュ・カプーア作。"},
        "🌊 ネイビーピア":{min:0,avg:18,max:40,trend:"±0%",reason:"ネイビーピア：散策無料、観覧車$18、各種アトラクション。"},
        "🏛️ シカゴ美術館":{min:32,avg:32,max:32,trend:"+10%",reason:"シカゴ美術館：$32。スーラ「グランド・ジャット島」、ホッパー「ナイトホークス」。"},
        "🏛️ フィールド自然史博物館":{min:30,avg:30,max:30,trend:"+10%",reason:"フィールド自然史博物館：$30。最大級のティラノサウルス化石「スー」。"},
        "🎢 ミレニアムパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"ミレニアムパーク：散策無料。ザ・ビーン・クラウン噴水・ジェイ・プリツカー・パビリオン。"},
        "🌊 シカゴリバークルーズ":{min:35,avg:50,max:75,trend:"+10%",reason:"シカゴ建築リバークルーズ：$35〜75。シカゴの建築を学べる人気クルーズ。"},
        "🎵 ジャズクラブ":{min:15,avg:30,max:60,trend:"+10%",reason:"シカゴジャズクラブ：$15〜60。グリーン・ミル・ジャズ・クラブが伝説的。"},
        "🏟️ リグレーフィールド":{min:30,avg:80,max:200,trend:"+12%",reason:"リグレーフィールド：観戦$30〜200、ツアー$30。MLBシカゴカブス本拠地。"},
        "🛍️ マグニフィセントマイル":{min:0,avg:0,max:0,trend:"±0%",reason:"マグニフィセント・マイル：散策無料。シカゴの目玉ショッピングストリート。"},
        "🍕 シカゴディープディッシュピザ":{min:18,avg:30,max:50,trend:"+10%",reason:"ディープディッシュ・ピザ：$18〜50（個人〜ファミリー）。ジオダノス・ルー・マルナティが有名。"},
        "🌭 シカゴホットドッグ":{min:4,avg:7,max:12,trend:"+10%",reason:"シカゴホットドッグ：$4〜12。「ケチャップNG」のルール。"},
        "🥪 イタリアンビーフ":{min:8,avg:13,max:20,trend:"+10%",reason:"イタリアン・ビーフ・サンドイッチ：$8〜20。ジュースに浸す独特の食べ方。"},
        "🍔 ハンバーガー":{min:10,avg:18,max:35,trend:"+10%",reason:"シカゴバーガー：$10〜35。"},
        "🍝 イタリアン料理":{min:20,avg:40,max:80,trend:"+10%",reason:"シカゴ・イタリアン：$20〜80。リトル・イタリーで本格的な料理。"},
        "🥩 ステーキ":{min:50,avg:85,max:180,trend:"+10%",reason:"シカゴステーキ：$50〜180。"},
        "🍻 シカゴクラフトビール":{min:7,avg:10,max:18,trend:"+10%",reason:"シカゴクラフトビール：$7〜18。グース・アイランドなどの名門ブルワリー。"},
        "🥧 ピザポップタルト":{min:3,avg:5,max:10,trend:"+10%",reason:"ポップタルト：$3〜10。アメリカの朝食定番。"},
      },
      マイアミ:{
        "🏖️ サウスビーチ":{min:0,avg:0,max:0,trend:"±0%",reason:"サウスビーチ：入場無料。マイアミビーチの中心。アールデコ建築。"},
        "🏘️ アールデコ地区":{min:0,avg:0,max:0,trend:"±0%",reason:"アールデコ歴史地区：散策無料。1920〜30年代の建築群。世界最大級。"},
        "🎨 ウィンウッドウォールズ":{min:0,avg:12,max:25,trend:"+10%",reason:"ウィンウッドウォールズ：屋外無料、ギャラリー$12〜25。ストリートアートの聖地。"},
        "🏖️ ベイサイド":{min:0,avg:0,max:0,trend:"±0%",reason:"ベイサイド・マーケットプレース：散策無料。ウォーターフロントのショッピング・エンターテイメント。"},
        "🌳 ビスケーン国立公園":{min:0,avg:0,max:0,trend:"±0%",reason:"ビスケーン国立公園：入園無料（船は別途$50〜）。海中95%の珍しい国立公園。"},
        "🎡 マイアミシーアクエリアム":{min:50,avg:55,max:75,trend:"+10%",reason:"マイアミ・シーアクエリアム：$50〜75。"},
        "🏛️ ヴィスカヤ博物館":{min:25,avg:25,max:25,trend:"+10%",reason:"ヴィスカヤ博物館・庭園：$25。1916年建造のイタリア式邸宅。"},
        "🚤 マイアミビーチクルーズ":{min:35,avg:50,max:100,trend:"+10%",reason:"マイアミビーチクルーズ：$35〜100。スターズ・アイランドで有名人の家を見学。"},
        "🎭 リトルハバナ":{min:0,avg:0,max:0,trend:"±0%",reason:"リトル・ハバナ：散策無料。キューバ移民街。カジェ・オチョが中心。"},
        "🏖️ キーウェスト":{min:0,avg:0,max:0,trend:"±0%",reason:"キーウェスト：散策無料（マイアミから日帰り可）。ヘミングウェイの家$17。"},
        "🥪 キューバンサンド":{min:8,avg:13,max:20,trend:"+10%",reason:"キューバンサンド：$8〜20。プレスして焼くキューバ系サンド。"},
        "🥙 アロスコンポヨ":{min:12,avg:18,max:30,trend:"+10%",reason:"アロス・コン・ポヨ：$12〜30。キューバ風チキンライス。"},
        "🍤 シーフード":{min:25,avg:50,max:120,trend:"+10%",reason:"マイアミシーフード：$25〜120。スチーブズクラブが名物。"},
        "🥟 エンパナーダ":{min:3,avg:6,max:12,trend:"+10%",reason:"エンパナーダ：$3〜12。ラテン系の揚げパイ。"},
        "🍰 キーライムパイ":{min:6,avg:9,max:15,trend:"+10%",reason:"キーライムパイ：$6〜15。フロリダ州キーズ発祥のデザート。"},
        "🍹 モヒート":{min:10,avg:14,max:22,trend:"+10%",reason:"モヒート：$10〜22。キューバ発祥のラム・ミントカクテル。マイアミの定番。"},
        "🌭 ホットドッグ":{min:4,avg:7,max:12,trend:"+10%",reason:"マイアミホットドッグ：$4〜12。"},
        "🐟 グリル料理":{min:18,avg:30,max:60,trend:"+10%",reason:"マイアミグリル料理：$18〜60。"},
      },
      サンフランシスコ:{
        "🌉 ゴールデンゲートブリッジ":{min:0,avg:0,max:0,trend:"±0%",reason:"ゴールデンゲートブリッジ：徒歩・自転車無料、車両通行料$9.40。"},
        "🏝️ アルカトラズ島":{min:47,avg:47,max:65,trend:"+10%",reason:"アルカトラズ島ツアー：$47〜65（要事前予約）。元連邦刑務所。映画「ザ・ロック」舞台。"},
        "🚋 ケーブルカー":{min:8,avg:8,max:8,trend:"+10%",reason:"ケーブルカー：片道$8、1日パス$13。世界遺産級の交通機関。"},
        "🌊 フィッシャーマンズワーフ":{min:0,avg:0,max:0,trend:"±0%",reason:"フィッシャーマンズワーフ：散策無料。アシカが集まるピア39が名物。"},
        "🏯 チャイナタウン":{min:0,avg:0,max:0,trend:"±0%",reason:"チャイナタウン：散策無料。北米最古・最大級のチャイナタウン。"},
        "🎨 ピア39":{min:0,avg:0,max:0,trend:"±0%",reason:"ピア39：散策無料。アシカが集まる人気スポット。"},
        "🌳 ゴールデンゲートパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"ゴールデンゲートパーク：入園無料。ニューヨークのセントラルパークより大きい。"},
        "🛍️ ユニオンスクエア":{min:0,avg:0,max:0,trend:"±0%",reason:"ユニオンスクエア：散策無料。SFのショッピングエリア。"},
        "🎨 SFMOMA":{min:30,avg:30,max:30,trend:"+10%",reason:"サンフランシスコ近代美術館：$30。マティス・ピカソ・ウォーホール等。"},
        "🌉 ベイブリッジ":{min:0,avg:0,max:0,trend:"±0%",reason:"ベイブリッジ：見学無料、通行料$8.40。サンフランシスコ〜オークランドを結ぶ。"},
        "🦀 ダンジネスクラブ":{min:30,avg:50,max:90,trend:"+12%",reason:"ダンジネスクラブ：$30〜90。フィッシャーマンズワーフの名物。11〜6月が旬。"},
        "🍞 サワードウブレッド":{min:5,avg:10,max:25,trend:"+10%",reason:"サワードウブレッド：$5〜25。ボウディンベーカリーが発祥（1849年）。"},
        "🍫 ギラデリチョコレート":{min:5,avg:12,max:30,trend:"+10%",reason:"ギラデリチョコレート：$5〜30。1852年創業のサンフランシスコ発祥チョコ。"},
        "🥖 クラムチャウダーボウル":{min:15,avg:20,max:30,trend:"+10%",reason:"クラムチャウダー・ブレッドボウル：$15〜30。サワードウのお椀に入った名物スープ。"},
        "🍣 寿司":{min:25,avg:50,max:150,trend:"+10%",reason:"SF寿司：$25〜150。日系移民が多く本格的。"},
        "🌮 タコス":{min:5,avg:10,max:20,trend:"+10%",reason:"ミッション地区タコス：$5〜20。"},
        "🍕 ピザ":{min:18,avg:25,max:50,trend:"+10%",reason:"SFピザ：$18〜50。トニーズ・ピッツェリアが有名。"},
        "🍷 カリフォルニアワイン":{min:10,avg:20,max:80,trend:"+10%",reason:"カリフォルニアワイン：グラス$10〜20、ボトル$30〜80。ナパ・ソノマが近郊。"},
      },
      ラスベガス:{
        "🎰 ベラージオ噴水":{min:0,avg:0,max:0,trend:"±0%",reason:"ベラージオ噴水ショー：見学無料。15〜30分ごとに音楽と水のショー。"},
        "🏛️ ストリップ大通り":{min:0,avg:0,max:0,trend:"±0%",reason:"ラスベガス・ストリップ：散策無料。約6.8kmの大通り。"},
        "🎢 ストラトスフィアタワー":{min:24,avg:36,max:50,trend:"+10%",reason:"ストラトスフィアタワー：展望$24、スリル乗り物セット$36〜50。"},
        "🏛️ シーザーズパレス":{min:0,avg:0,max:0,trend:"±0%",reason:"シーザーズパレス：入場無料。古代ローマ風カジノホテル。フォーラム・ショップ。"},
        "🎭 シルク・ドゥ・ソレイユ":{min:90,avg:150,max:300,trend:"+12%",reason:"シルク・ドゥ・ソレイユ：$90〜300。「O」「Mystère」「KÀ」など複数公演。"},
        "🏔️ グランドキャニオン":{min:35,avg:200,max:500,trend:"+10%",reason:"グランドキャニオン日帰りツアー：$200〜500（ラスベガス発）。入園料$35/車別途。"},
        "🎰 フリーモントストリート":{min:0,avg:0,max:0,trend:"±0%",reason:"フリーモント・ストリート・エクスペリエンス：散策無料。LEDキャノピーの光ショー。"},
        "🌳 レッドロックキャニオン":{min:20,avg:20,max:20,trend:"+10%",reason:"レッドロック・キャニオン：$20/車。ラスベガス近郊の絶景ドライブ。"},
        "💧 フーバーダム":{min:15,avg:30,max:30,trend:"+10%",reason:"フーバーダム：見学$15、ダムツアー$30。1936年完成の巨大ダム。"},
        "🎰 カジノ":{min:1,avg:25,max:1000,trend:"+10%",reason:"カジノ：スロット$1〜、テーブル$5〜1000。"},
        "🍷 ビュッフェ":{min:30,avg:50,max:120,trend:"+12%",reason:"ラスベガスビュッフェ：朝$30〜、ディナー$60〜120。"},
        "🥩 ステーキハウス":{min:60,avg:120,max:300,trend:"+12%",reason:"ラスベガスステーキ：$60〜300。"},
        "🍤 シーフード":{min:40,avg:80,max:200,trend:"+10%",reason:"ラスベガスシーフード：$40〜200。"},
        "🥖 イタリアン":{min:30,avg:60,max:150,trend:"+10%",reason:"ラスベガスイタリアン：$30〜150。"},
        "🍔 ハンバーガー":{min:15,avg:25,max:50,trend:"+10%",reason:"ラスベガスバーガー：$15〜50。"},
        "🌮 タコス":{min:5,avg:12,max:25,trend:"+10%",reason:"ラスベガスタコス：$5〜25。"},
        "🍣 寿司":{min:30,avg:60,max:200,trend:"+10%",reason:"ラスベガス寿司：$30〜200。"},
        "🍰 ベラージオパティスリー":{min:6,avg:12,max:25,trend:"+10%",reason:"ベラージオパティスリー：$6〜25。世界最大のチョコレート噴水。"},
      },
      "ワシントンD.C.":{
        "🏛️ ホワイトハウス":{min:0,avg:0,max:0,trend:"±0%",reason:"ホワイトハウス：見学無料・要事前申請（米国民は議員経由、外国人は大使館経由）。"},
        "🗽 リンカーン記念堂":{min:0,avg:0,max:0,trend:"±0%",reason:"リンカーン記念堂：入場無料。MLKの「I Have a Dream」演説の場所。"},
        "🏛️ ワシントン記念塔":{min:0,avg:0,max:0,trend:"±0%",reason:"ワシントン記念塔：入場無料（要事前予約）。169mのオベリスク。"},
        "🏛️ 国会議事堂":{min:0,avg:0,max:0,trend:"±0%",reason:"国会議事堂：見学無料・要予約。米国民主主義の中心。"},
        "🏛️ スミソニアン博物館群":{min:0,avg:0,max:0,trend:"±0%",reason:"スミソニアン博物館：全19館入場無料！世界最大の博物館複合施設。"},
        "🏛️ 航空宇宙博物館":{min:0,avg:0,max:0,trend:"±0%",reason:"航空宇宙博物館：入場無料・要予約。アポロ11号・ライト兄弟の飛行機。"},
        "🏛️ アーリントン墓地":{min:0,avg:0,max:0,trend:"±0%",reason:"アーリントン国立墓地：入場無料。ケネディ大統領のお墓・無名戦士の墓。"},
        "🏛️ 国立公文書館":{min:0,avg:0,max:0,trend:"±0%",reason:"国立公文書館：入場無料。独立宣言・憲法の原本展示。"},
        "🌸 ナショナルモール":{min:0,avg:0,max:0,trend:"±0%",reason:"ナショナルモール：散策無料。リンカーン記念堂〜国会議事堂の大公園。"},
        "🌸 桜の名所(タイダルベイスン)":{min:0,avg:0,max:0,trend:"±0%",reason:"タイダルベイスン：散策無料。3月下旬〜4月初旬の桜祭りが日本との友好の象徴。"},
        "🥪 サンドイッチ":{min:8,avg:13,max:22,trend:"+10%",reason:"DCサンドイッチ：$8〜22。"},
        "🥩 ステーキ":{min:50,avg:90,max:180,trend:"+10%",reason:"DCステーキ：$50〜180。"},
        "🦀 メリーランドクラブケーキ":{min:18,avg:28,max:45,trend:"+12%",reason:"メリーランド・クラブケーキ：$18〜45。チェサピーク湾の青蟹を使う名物。"},
        "🍔 ハンバーガー":{min:10,avg:18,max:35,trend:"+10%",reason:"DCバーガー：$10〜35。"},
        "🍕 ピザ":{min:15,avg:22,max:40,trend:"+10%",reason:"DCピザ：$15〜40。"},
        "🍝 イタリアン":{min:25,avg:45,max:90,trend:"+10%",reason:"DCイタリアン：$25〜90。"},
        "🌮 タコス":{min:5,avg:12,max:25,trend:"+10%",reason:"DCタコス：$5〜25。"},
        "🍻 クラフトビール":{min:7,avg:10,max:18,trend:"+10%",reason:"DCクラフトビール：$7〜18。"},
      },
      ボストン:{
        "🏛️ フリーダムトレイル":{min:0,avg:16,max:25,trend:"±0%",reason:"フリーダムトレイル：散策無料、ガイドツアー$16〜25。米国独立革命の歴史的場所を巡る。"},
        "🏛️ ボストンコモン":{min:0,avg:0,max:0,trend:"±0%",reason:"ボストンコモン：入園無料。米国最古の公共公園（1634年）。"},
        "⛪ オールドノースチャーチ":{min:0,avg:8,max:8,trend:"±0%",reason:"オールドノースチャーチ：入場無料、ベヘマス・ツアー$8。1775年のポール・リビアの夜の合図。"},
        "🚢 USSコンスティテューション":{min:0,avg:0,max:0,trend:"±0%",reason:"USSコンスティテューション：入場無料・IDが必要。世界最古の現役軍艦（1797年進水）。"},
        "🏛️ ハーバード大学":{min:0,avg:12,max:35,trend:"+10%",reason:"ハーバード大学：見学無料、公式ツアー$12〜35。世界最古の英語大学。"},
        "🏛️ MIT":{min:0,avg:0,max:0,trend:"±0%",reason:"MIT：見学無料。マサチューセッツ工科大学。"},
        "🏛️ ファニエルホール":{min:0,avg:0,max:0,trend:"±0%",reason:"ファニエルホール・クインシーマーケット：散策無料。米国独立革命の集会所。"},
        "🏛️ ボストン美術館":{min:30,avg:30,max:30,trend:"+10%",reason:"ボストン美術館：$30。米国でも有数のコレクション。"},
        "🏟️ フェンウェイパーク":{min:30,avg:60,max:200,trend:"+12%",reason:"フェンウェイパーク：観戦$30〜200、ツアー$30。MLB最古の球場（1912年）。レッドソックス本拠地。"},
        "🌳 パブリックガーデン":{min:0,avg:0,max:5,trend:"±0%",reason:"パブリックガーデン：入園無料、スワンボート$5。「かもさんおとおり」の聖地。"},
        "🦞 ロブスターロール":{min:25,avg:35,max:55,trend:"+12%",reason:"ロブスターロール：$25〜55。ニューイングランド名物。"},
        "🥣 クラムチャウダー":{min:10,avg:15,max:25,trend:"+10%",reason:"ニューイングランド・クラムチャウダー：$10〜25。"},
        "🐟 シーフード":{min:25,avg:50,max:120,trend:"+10%",reason:"ボストンシーフード：$25〜120。"},
        "🍔 ハンバーガー":{min:10,avg:18,max:30,trend:"+10%",reason:"ボストンバーガー：$10〜30。"},
        "🍰 ボストンクリームパイ":{min:6,avg:10,max:18,trend:"+10%",reason:"ボストンクリームパイ：$6〜18。マサチューセッツ州の公式デザート。"},
        "🍝 イタリアン(ノースエンド)":{min:20,avg:40,max:80,trend:"+10%",reason:"ノースエンド・イタリアン：$20〜80。ボストンのリトル・イタリー。"},
        "🍻 サミュエルアダムス":{min:5,avg:8,max:14,trend:"+10%",reason:"サミュエルアダムス：$5〜14。ボストン発祥のクラフトビール。"},
        "🥖 ベーグル":{min:3,avg:6,max:12,trend:"+10%",reason:"ボストンベーグル：$3〜12。"},
      },
      シアトル:{
        "🗼 スペースニードル":{min:39.50,avg:39.50,max:55,trend:"+10%",reason:"スペースニードル：$39.50〜55。1962年完成の184m展望タワー。"},
        "🏛️ パイクプレイスマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"パイクプレイスマーケット：散策無料。1907年創立の米国最古の公設市場。"},
        "☕ スターバックス1号店":{min:0,avg:5,max:8,trend:"±0%",reason:"スターバックス1号店：見学無料、コーヒー$5〜8。パイクプレイスマーケット内。"},
        "🌊 シアトル水族館":{min:35.95,avg:35.95,max:40,trend:"+10%",reason:"シアトル水族館：$35.95〜40。"},
        "🏛️ ポップカルチャー博物館":{min:30,avg:35,max:40,trend:"+10%",reason:"MoPOP（ポップカルチャー博物館）：$30〜40。ジミ・ヘンドリックス・ニルヴァーナ展示。"},
        "🛍️ チフリーガラス博物館":{min:35,avg:35,max:35,trend:"+10%",reason:"チフリー・ガーデン&ガラス：$35。デール・チフリーのガラス芸術。"},
        "🏛️ シアトル美術館":{min:25,avg:25,max:25,trend:"+10%",reason:"シアトル美術館：$25。"},
        "🏟️ T-モバイルパーク":{min:18,avg:40,max:200,trend:"+10%",reason:"T-Mobileパーク：観戦$18〜200、ツアー$20。MLBシアトル・マリナーズ本拠地。"},
        "🌳 ボランティアパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"ボランティアパーク：入園無料。コンサバトリー・アジア美術館がある。"},
        "🚢 フェリー(ベインブリッジ島)":{min:9.45,avg:9.45,max:9.45,trend:"+8%",reason:"ワシントン州フェリー（ベインブリッジ島）：往復$9.45。シアトル湾の絶景。"},
        "🦞 シアトルサーモン":{min:25,avg:40,max:80,trend:"+12%",reason:"シアトルサーモン：$25〜80。パイクプレイスマーケットで投げるパフォーマンスも有名。"},
        "☕ シアトルコーヒー":{min:4,avg:6,max:12,trend:"+10%",reason:"シアトルコーヒー：$4〜12。スターバックス・タリーズ・シーズ・キャンディーズ等の本場。"},
        "🍔 ハンバーガー":{min:10,avg:18,max:30,trend:"+10%",reason:"シアトルバーガー：$10〜30。ディックス・ドライブインが伝統。"},
        "🥣 シーフードチャウダー":{min:10,avg:15,max:25,trend:"+10%",reason:"シーフードチャウダー：$10〜25。"},
        "🥖 ベーカリー":{min:5,avg:12,max:25,trend:"+10%",reason:"シアトルベーカリー：$5〜25。"},
        "🍣 寿司":{min:25,avg:50,max:150,trend:"+10%",reason:"シアトル寿司：$25〜150。"},
        "🌮 タコス":{min:5,avg:12,max:25,trend:"+10%",reason:"シアトルタコス：$5〜25。"},
        "🍰 デザート":{min:6,avg:10,max:20,trend:"+10%",reason:"シアトルデザート：$6〜20。"},
      },
      ニューオーリンズ:{
        "🎷 フレンチクォーター":{min:0,avg:0,max:0,trend:"±0%",reason:"フレンチクォーター：散策無料。ジャズ発祥地。フランス・スペイン植民地時代の街並み。"},
        "🎷 バーボンストリート":{min:0,avg:0,max:0,trend:"±0%",reason:"バーボンストリート：散策無料。フレンチクォーター中心の歓楽街。"},
        "🏛️ ジャクソン広場":{min:0,avg:0,max:0,trend:"±0%",reason:"ジャクソン広場：見学無料。フレンチクォーターの中心広場。"},
        "⛪ セントルイス大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"セントルイス大聖堂：入場無料。米国最古の大聖堂（1727年）。"},
        "🎭 マルディグラ":{min:0,avg:0,max:50,trend:"±0%",reason:"マルディグラ：観覧無料（2月）。世界三大カーニバルの一つ。"},
        "🚂 セントチャールズ路面電車":{min:1.50,avg:1.50,max:3,trend:"+10%",reason:"セント・チャールズ・ストリートカー：$1.50/回、1日券$3。米国最古の現役路面電車。"},
        "🛒 フレンチマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"フレンチマーケット：散策無料。米国最古の公設市場（1791年）。"},
        "🎵 プリザベーションホール":{min:35,avg:40,max:55,trend:"+10%",reason:"プリザベーション・ホール：$35〜55。1961年からジャズの本場として続く。"},
        "🌳 シティパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"シティパーク：入園無料。ニューオーリンズ最大の公園。"},
        "🏛️ WWII博物館":{min:36,avg:36,max:50,trend:"+10%",reason:"国立第二次世界大戦博物館：$36〜50。米国を代表する戦争博物館の一つ。"},
        "🦞 ガンボ":{min:10,avg:18,max:30,trend:"+10%",reason:"ガンボ：$10〜30。ニューオーリンズ発祥のクレオール料理。"},
        "🦐 ジャンバラヤ":{min:12,avg:20,max:32,trend:"+10%",reason:"ジャンバラヤ：$12〜32。ケイジャン・クレオール料理。"},
        "🦪 ポーボーイ":{min:10,avg:15,max:25,trend:"+10%",reason:"ポー・ボーイ・サンドイッチ：$10〜25。ルイジアナ発祥のサンドイッチ。"},
        "🍩 ベニエ(カフェデュモンド)":{min:4,avg:5,max:8,trend:"+10%",reason:"ベニエ（カフェ・デュ・モンド）：3個$5。ニューオーリンズの伝統揚げパン。"},
        "🦞 ザリガニ":{min:15,avg:25,max:45,trend:"+12%",reason:"ザリガニ料理：$15〜45。ルイジアナ春の風物詩。"},
        "🥩 ニューオーリンズ料理":{min:25,avg:45,max:90,trend:"+10%",reason:"クレオール・ケイジャン料理：$25〜90。"},
        "🍰 ブレッドプディング":{min:8,avg:12,max:18,trend:"+10%",reason:"ブレッドプディング：$8〜18。ニューオーリンズの定番デザート。"},
        "☕ チコリコーヒー":{min:3,avg:5,max:8,trend:"+10%",reason:"チコリコーヒー：$3〜8。カフェ・デュ・モンドが有名。"},
      },
    },
  },
  カナダ:{
    food:{
      "🏪 コンビニ":{min:3,avg:8,max:18,trend:"+8%",reason:"Tim Hortons・コンビニ軽食C$3〜18。"},
      "🍢 屋台":{min:5,avg:12,max:20,trend:"+10%",reason:"ストリートフードC$5〜20。"},
      "🍜 ローカル食堂":{min:12,avg:20,max:35,trend:"+8%",reason:"ローカルレストランC$12〜35。"},
      "🍣 チェーン":{min:8,avg:15,max:25,trend:"+8%",reason:"ファストフードC$8〜25。"},
      "🍽️ カジュアル":{min:20,avg:35,max:60,trend:"+10%",reason:"カジュアルレストランC$20〜60/人。"},
      "🥂 中級":{min:40,avg:70,max:120,trend:"+10%",reason:"中級レストランC$40〜120/人。"},
      "🥩 高級":{min:80,avg:150,max:300,trend:"+10%",reason:"高級レストランC$80〜300/人。"},
      "👑 超高級":{min:200,avg:400,max:1000,trend:"+12%",reason:"超高級C$200〜1000/人。"},
      "🌅 朝食":{min:5,avg:12,max:25,trend:"+8%",reason:"朝食C$5〜25。"},
      "☀️ ランチ":{min:12,avg:22,max:45,trend:"+10%",reason:"ランチC$12〜45。"},
      "🌆 ディナー":{min:25,avg:50,max:120,trend:"+10%",reason:"ディナーC$25〜120/人。"},
      "🍱 テイクアウト":{min:8,avg:15,max:30,trend:"+10%",reason:"テイクアウトC$8〜30。"},
      "☕ カフェ軽食":{min:5,avg:10,max:20,trend:"+8%",reason:"カフェ軽食C$5〜20。"},
      "🌙 夜食":{min:8,avg:15,max:35,trend:"+10%",reason:"夜食C$8〜35。"},
    },
    drink:{
      "🥤 ペットボトル水":{min:1.5,avg:2.5,max:4,trend:"+8%",reason:"水500ml C$1.5〜4。"},
      "🥤 ソフトドリンク":{min:2,avg:3.5,max:5,trend:"+8%",reason:"ソフトドリンクC$2〜5。"},
      "☕ コーヒー":{min:2,avg:4,max:7,trend:"+8%",reason:"Tim HortonsコーヒーC$2〜3、スタバC$5〜7。"},
      "🍵 紅茶":{min:2.5,avg:4,max:8,trend:"+8%",reason:"紅茶C$2.5〜8。"},
      "🧃 ジュース":{min:3,avg:5,max:8,trend:"+8%",reason:"ジュースC$3〜8。"},
      "🍺 ビール":{min:6,avg:9,max:14,trend:"+10%",reason:"ビールC$6〜14。"},
      "🍷 ワイン":{min:8,avg:12,max:25,trend:"+10%",reason:"グラスワインC$8〜15、ボトルC$30〜70。"},
      "🍹 カクテル":{min:12,avg:16,max:25,trend:"+10%",reason:"カクテルC$12〜25。"},
      "🥛 牛乳":{min:1.5,avg:3,max:5,trend:"+8%",reason:"牛乳1L C$1.5〜5。"},
      "🍶 リキュール":{min:7,avg:12,max:20,trend:"+10%",reason:"リキュールC$7〜20/杯。"},
    },
    taxi:{
      "🚖 短距離":{min:10,avg:18,max:30,trend:"+10%",reason:"市内短距離C$10〜30。"},
      "🚖 中距離":{min:20,avg:35,max:60,trend:"+10%",reason:"市内中距離C$20〜60。"},
      "🚖 長距離":{min:50,avg:90,max:180,trend:"+10%",reason:"長距離C$50〜180。"},
      "✈️ 空港":{min:50,avg:70,max:120,trend:"+10%",reason:"空港〜市内C$50〜120。"},
      "🌙 深夜":{min:15,avg:25,max:60,trend:"+15%",reason:"深夜割増+C$5〜10。"},
      "🚗 配車アプリ":{min:10,avg:20,max:50,trend:"+10%",reason:"Uber・Lyft利用可能。"},
    },
    hotel:{
      "🏨 格安ホステル":{min:30,avg:60,max:120,trend:"+10%",reason:"ホステルC$30〜120/泊。"},
      "🏨 3つ星":{min:100,avg:180,max:300,trend:"+12%",reason:"3つ星C$100〜300/泊。"},
      "🏨 4つ星":{min:200,avg:350,max:600,trend:"+12%",reason:"4つ星C$200〜600/泊。"},
      "🏨 5つ星":{min:400,avg:700,max:1500,trend:"+15%",reason:"5つ星C$400〜1500/泊。"},
      "🏠 民泊・Airbnb":{min:60,avg:120,max:300,trend:"+12%",reason:"AirbnbC$60〜300/泊。"},
    },
    shopping:{
      "👕 衣料":{min:20,avg:80,max:500,trend:"+8%",reason:"カナダ衣料C$20〜500。"},
      "💄 コスメ":{min:10,avg:35,max:150,trend:"+8%",reason:"コスメC$10〜150。"},
      "🛒 スーパー":{min:1,avg:5,max:30,trend:"+8%",reason:"スーパーC$1〜30。"},
      "🎁 おみやげ":{min:5,avg:20,max:80,trend:"+10%",reason:"メープルシロップ・サーモンC$5〜80。"},
      "💻 家電":{min:30,avg:200,max:2000,trend:"+8%",reason:"家電C$30〜2000。"},
    },
    activity:{
      "🏛️ 観光入場":{min:0,avg:25,max:60,trend:"+10%",reason:"博物館・観光C$15〜60。"},
      "🤿 アクティビティ":{min:30,avg:100,max:400,trend:"+10%",reason:"アクティビティC$30〜400。"},
      "💆 マッサージ":{min:60,avg:120,max:300,trend:"+10%",reason:"スパC$60〜300/時。"},
      "🎭 エンタメ":{min:30,avg:80,max:300,trend:"+10%",reason:"ショー・コンサートC$30〜300。"},
      "🚌 ツアー":{min:30,avg:80,max:250,trend:"+10%",reason:"ツアーC$30〜250。"},
    },
    famous:{
      トロント:{
        "🗼 CNタワー":{min:45,avg:45,max:79,trend:"+10%",reason:"CNタワー：C$45（標準）、ガラス床込みC$59、エッジウォークC$235。"},
        "🏟️ ロジャースセンター":{min:25,avg:60,max:200,trend:"+10%",reason:"ロジャースセンター：観戦C$25〜200、ツアーC$25。MLBトロント・ブルージェイズ本拠地。"},
        "🏛️ ロイヤルオンタリオ博物館":{min:26,avg:26,max:26,trend:"+10%",reason:"ロイヤル・オンタリオ博物館（ROM）：C$26。カナダ最大の博物館。"},
        "🎨 アートギャラリーオブオンタリオ":{min:30,avg:30,max:30,trend:"+10%",reason:"AGO：C$30。カナダ最大の美術館の一つ。"},
        "🏝️ トロントアイランド":{min:9.11,avg:9.11,max:9.11,trend:"+10%",reason:"トロント・アイランド・フェリー：往復C$9.11。トロントの絶景を島から望む。"},
        "🛍️ イートンセンター":{min:0,avg:0,max:0,trend:"±0%",reason:"イートンセンター：散策無料。トロント最大のショッピングモール。"},
        "🏘️ ディスティラリー地区":{min:0,avg:0,max:0,trend:"±0%",reason:"ディスティラリー地区：散策無料。1832年の蒸留所を改装したアートエリア。"},
        "🌳 ハイパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"ハイパーク：入園無料。トロント最大の公園。春は桜の名所。"},
        "🛍️ ケンジントンマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"ケンジントンマーケット：散策無料。多文化が混じるエクレクティック地区。"},
        "🏟️ HHL殿堂博物館":{min:25,avg:25,max:25,trend:"+10%",reason:"ホッケー殿堂博物館：C$25。NHLスタンレーカップを間近で見られる。"},
        "🥩 プーティン":{min:8,avg:15,max:25,trend:"+10%",reason:"プーティン：C$8〜25。フライドポテト・グレービー・チーズカード。ケベック発祥のカナダ国民食。"},
        "🥯 モントリオールベーグル":{min:2,avg:4,max:10,trend:"+10%",reason:"モントリオールベーグル：C$2〜10。NYベーグルと違い、より甘く小さい。"},
        "🥩 ステーキ":{min:40,avg:75,max:150,trend:"+10%",reason:"カナディアン・ステーキ：C$40〜150。"},
        "🍔 ハンバーガー":{min:12,avg:20,max:35,trend:"+10%",reason:"トロントバーガー：C$12〜35。"},
        "🦞 シーフード":{min:30,avg:60,max:150,trend:"+10%",reason:"トロントシーフード：C$30〜150。"},
        "🥞 メープルシロップパンケーキ":{min:10,avg:15,max:25,trend:"+10%",reason:"メープルシロップパンケーキ：C$10〜25。"},
        "🍷 アイスワイン":{min:15,avg:30,max:80,trend:"+10%",reason:"アイスワイン：C$15〜80（200ml）。ナイアガラ地方の特産。"},
        "🍻 カナディアンビール":{min:6,avg:9,max:14,trend:"+10%",reason:"カナディアン・ビール：C$6〜14。モルソン・ラバットが定番。"},
      },
      バンクーバー:{
        "🌳 スタンレーパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"スタンレーパーク：入園無料。北米最大級の都市公園。10km海岸線。"},
        "🏖️ イングリッシュベイ":{min:0,avg:0,max:0,trend:"±0%",reason:"イングリッシュベイ：入場無料。バンクーバーの中心ビーチ。サンセットが絶景。"},
        "🏘️ ガスタウン":{min:0,avg:0,max:0,trend:"±0%",reason:"ガスタウン：散策無料。バンクーバー発祥地。蒸気時計が有名。"},
        "🛍️ グランビルアイランド":{min:0,avg:0,max:0,trend:"±0%",reason:"グランビルアイランド：散策無料。公設市場・アーティスト工房・劇場。"},
        "🏔️ グラウスマウンテン":{min:69,avg:79,max:99,trend:"+10%",reason:"グラウス・マウンテン：スカイライドC$69〜99。バンクーバーを見下ろす絶景。"},
        "🏞️ キャピラノ吊り橋":{min:71.95,avg:71.95,max:71.95,trend:"+12%",reason:"キャピラノ吊り橋公園：C$71.95。70m上空の137m吊り橋。"},
        "🏛️ バンクーバー美術館":{min:29,avg:29,max:29,trend:"+10%",reason:"バンクーバー美術館：C$29。エミリー・カーのコレクションが見もの。"},
        "🏝️ ビクトリア(船)":{min:50,avg:100,max:200,trend:"+10%",reason:"ビクトリア行きフェリー：徒歩C$50往復、車込みC$200。"},
        "🌊 ロブソン通り":{min:0,avg:0,max:0,trend:"±0%",reason:"ロブソン通り：散策無料。バンクーバーのメインショッピングストリート。"},
        "🌲 リン渓谷":{min:0,avg:0,max:0,trend:"±0%",reason:"リン・キャニオン・パーク：入園無料。キャピラノより無料で美しい吊り橋。"},
        "🦞 サーモン":{min:25,avg:40,max:80,trend:"+12%",reason:"バンクーバーサーモン：C$25〜80。BC州の新鮮なサーモン。"},
        "🍣 寿司":{min:25,avg:45,max:120,trend:"+10%",reason:"バンクーバー寿司：C$25〜120。北米屈指の寿司シティ。"},
        "🥩 プーティン":{min:8,avg:14,max:22,trend:"+10%",reason:"プーティン：C$8〜22。"},
        "🍔 ジャパドッグ":{min:8,avg:12,max:18,trend:"+10%",reason:"ジャパドッグ：C$8〜18。バンクーバー発祥の日本風ホットドッグ。"},
        "🦀 ダンジネスクラブ":{min:30,avg:50,max:100,trend:"+12%",reason:"ダンジネスクラブ：C$30〜100。BC州の名物。"},
        "🥞 メープルシロップ":{min:5,avg:15,max:40,trend:"+10%",reason:"メープルシロップ：C$5〜40。カナダ土産の定番。"},
        "🍷 カナダワイン":{min:8,avg:18,max:60,trend:"+10%",reason:"BCワイン：グラスC$8〜18、ボトルC$25〜60。オカナガン地方のワイン。"},
        "☕ オーガニックコーヒー":{min:4,avg:6,max:10,trend:"+10%",reason:"バンクーバー・オーガニックコーヒー：C$4〜10。"},
      },
      モントリオール:{
        "⛪ ノートルダム大聖堂(モントリオール)":{min:16,avg:16,max:16,trend:"+10%",reason:"ノートルダム大聖堂：C$16。1829年完成のゴシック・リバイバル建築。"},
        "🏘️ 旧市街":{min:0,avg:0,max:0,trend:"±0%",reason:"オールド・モントリオール：散策無料。17世紀の石畳・歴史的建築群。"},
        "🏛️ モントリオール美術館":{min:24,avg:24,max:24,trend:"+10%",reason:"モントリオール美術館：C$24。カナダ最大の美術館の一つ。"},
        "🌳 モンロワイヤル公園":{min:0,avg:0,max:0,trend:"±0%",reason:"モン・ロワイヤル公園：入園無料。市内中心の山。展望台がモントリオールのシンボル。"},
        "⛪ サンジョセフ礼拝堂":{min:0,avg:0,max:0,trend:"±0%",reason:"セント・ジョセフ礼拝堂：入場無料。北米最大のドーム式聖堂。"},
        "🏛️ ノートルダム広場":{min:0,avg:0,max:0,trend:"±0%",reason:"プラス・ダルム：見学無料。モントリオール発祥の地。"},
        "🏛️ オリンピックスタジアム":{min:23,avg:32,max:32,trend:"+10%",reason:"オリンピックスタジアム・タワー：C$23〜32。1976年モントリオール五輪会場。"},
        "🌳 ボタニカルガーデン":{min:23,avg:23,max:23,trend:"+10%",reason:"モントリオール植物園：C$23。世界第2位の規模を誇る植物園。"},
        "🛍️ サンドニ通り":{min:0,avg:0,max:0,trend:"±0%",reason:"サンドニ通り：散策無料。モントリオールの活気あるカルチャー通り。"},
        "🏛️ 旧港(ヴュー・ポール)":{min:0,avg:0,max:0,trend:"±0%",reason:"ヴュー・ポール（旧港）：散策無料。サン・ローレンス川沿いの観光地。"},
        "🥩 プーティン":{min:8,avg:14,max:22,trend:"+10%",reason:"プーティン：C$8〜22。ケベック発祥（モントリオールが本場）。"},
        "🥯 モントリオールベーグル":{min:1,avg:2,max:6,trend:"+10%",reason:"モントリオールベーグル：1個C$1〜6。セント・ヴィアトゥールが老舗。"},
        "🥪 スモークミート":{min:14,avg:20,max:30,trend:"+10%",reason:"モントリオール・スモークミート：C$14〜30。シュワルツが発祥（1928年）。"},
        "🍕 ピザ":{min:12,avg:18,max:30,trend:"+10%",reason:"モントリオールピザ：C$12〜30。"},
        "🍟 フライドポテト":{min:5,avg:8,max:15,trend:"+10%",reason:"フライドポテト：C$5〜15。プーティンのベース。"},
        "🥞 ケベックスタイル朝食":{min:12,avg:18,max:30,trend:"+10%",reason:"ケベック朝食：C$12〜30。メープルシロップ・ベーコン・卵。"},
        "🍻 ローカルクラフトビール":{min:6,avg:9,max:14,trend:"+10%",reason:"モントリオール・クラフトビール：C$6〜14。"},
        "🍫 メープル菓子":{min:5,avg:12,max:30,trend:"+10%",reason:"メープル菓子：C$5〜30。"},
      },
      カルガリー:{
        "🤠 カルガリースタンピード":{min:30,avg:50,max:150,trend:"+10%",reason:"カルガリー・スタンピード：C$30〜150（7月10日間）。世界最大のロデオ＆カウボーイ祭。"},
        "🗼 カルガリータワー":{min:21,avg:21,max:21,trend:"+10%",reason:"カルガリータワー：C$21。160mの展望タワー。ガラス床がある。"},
        "🏛️ グレンボウ博物館":{min:25,avg:25,max:25,trend:"+10%",reason:"グレンボウ博物館：C$25。アルバータ州とカナダ西部の歴史。"},
        "🏛️ ヘリテージパーク歴史村":{min:35,avg:35,max:35,trend:"+10%",reason:"ヘリテージパーク：C$35。1860〜1950年のカナダ西部を再現。"},
        "🏟️ サドルドーム":{min:30,avg:80,max:300,trend:"+10%",reason:"スコシアバンク・サドルドーム：観戦C$30〜300。NHLカルガリー・フレームス本拠地。"},
        "🛍️ スティーブンアベニュー":{min:0,avg:0,max:0,trend:"±0%",reason:"スティーブン・アベニュー：散策無料。カルガリーのメインストリート。歩行者天国。"},
        "🌳 プリンスズアイランドパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"プリンセス・アイランドパーク：入園無料。ダウンタウンのオアシス。"},
        "🏛️ TELUS科学博物館":{min:26,avg:26,max:26,trend:"+10%",reason:"TELUSスパーク科学博物館：C$26。"},
        "🛍️ チャイナタウン":{min:0,avg:0,max:0,trend:"±0%",reason:"カルガリー・チャイナタウン：散策無料。"},
        "🏰 オリンピックパーク":{min:20,avg:30,max:50,trend:"+10%",reason:"カナダ・オリンピック・パーク：C$20〜50。1988年冬季五輪会場。"},
        "🥩 アルバータビーフ":{min:30,avg:50,max:120,trend:"+12%",reason:"アルバータビーフ：C$30〜120。カナダ最高峰の牛肉。"},
        "🥩 ステーキ":{min:40,avg:75,max:150,trend:"+10%",reason:"カルガリー・ステーキ：C$40〜150。"},
        "🥩 プーティン":{min:8,avg:14,max:22,trend:"+10%",reason:"プーティン：C$8〜22。"},
        "🍔 ハンバーガー":{min:12,avg:20,max:35,trend:"+10%",reason:"カルガリーバーガー：C$12〜35。"},
        "🥞 パンケーキ":{min:8,avg:14,max:22,trend:"+10%",reason:"パンケーキ：C$8〜22。スタンピード期間中はC$0（無料朝食）。"},
        "🥪 サンドイッチ":{min:8,avg:14,max:22,trend:"+10%",reason:"カルガリーサンドイッチ：C$8〜22。"},
        "🍷 カナディアンワイン":{min:10,avg:20,max:50,trend:"+10%",reason:"カナディアンワイン：C$10〜50。"},
        "🍻 ローカルビール":{min:6,avg:9,max:14,trend:"+10%",reason:"アルバータ・クラフトビール：C$6〜14。"},
      },
      ケベックシティ:{
        "🏰 シャトーフロントナック":{min:0,avg:0,max:25,trend:"±0%",reason:"シャトー・フロントナック：見学無料、ホテルツアーC$25。世界一写真に撮られたホテル。"},
        "🏘️ ケベック旧市街":{min:0,avg:0,max:0,trend:"±0%",reason:"オールド・ケベック：散策無料・世界遺産。北米唯一の城壁都市。"},
        "⛪ ノートルダム大聖堂(ケベック)":{min:0,avg:0,max:0,trend:"±0%",reason:"ケベック・ノートルダム大聖堂：入場無料。北米最古のカトリック大聖堂（1647年）。"},
        "🌊 シタデル":{min:18,avg:18,max:18,trend:"+10%",reason:"ラ・シタデル：C$18。北米最大の英国軍要塞。衛兵交代式が見もの。"},
        "🏞️ モンモランシー滝":{min:9,avg:19,max:32,trend:"+10%",reason:"モンモランシー滝：駐車場C$9、ロープウェイC$19、つり橋C$32。ナイアガラより高い83m。"},
        "🛍️ プチシャンプラン通り":{min:0,avg:0,max:0,trend:"±0%",reason:"プチ・シャンプラン通り：散策無料。北米最古の商店街。"},
        "🏛️ 文明博物館":{min:24,avg:24,max:24,trend:"+10%",reason:"ケベック文明博物館：C$24。"},
        "🏰 シャンプラン銅像":{min:0,avg:0,max:0,trend:"±0%",reason:"シャンプラン像：見学無料。ケベック創設者の像。"},
        "🌳 戦場公園":{min:0,avg:0,max:0,trend:"±0%",reason:"アブラハム平原（戦場公園）：入園無料。1759年英仏戦争の激戦地。"},
        "🏛️ 旧城壁":{min:0,avg:0,max:0,trend:"±0%",reason:"ケベック城壁：散策無料。北米唯一現存する城壁都市。"},
        "🥩 プーティン":{min:8,avg:14,max:22,trend:"+10%",reason:"ケベック・プーティン：C$8〜22。ケベック発祥の地。"},
        "🥞 メープルシロップ":{min:5,avg:15,max:40,trend:"+10%",reason:"メープルシロップ：C$5〜40。世界生産量の70%がケベック州。"},
        "🦪 シーフード":{min:30,avg:55,max:120,trend:"+10%",reason:"ケベックシーフード：C$30〜120。"},
        "🥪 トルティエール":{min:12,avg:18,max:28,trend:"+10%",reason:"トルティエール：C$12〜28。ケベック発祥の肉パイ。"},
        "🍞 ケベックパン":{min:3,avg:6,max:12,trend:"+10%",reason:"ケベックパン：C$3〜12。フランス系の伝統。"},
        "🍷 アイスワイン":{min:15,avg:30,max:80,trend:"+10%",reason:"ケベック・アイスワイン：C$15〜80。"},
        "🍻 ケベックビール":{min:6,avg:9,max:14,trend:"+10%",reason:"ケベック・クラフトビール：C$6〜14。ユニブルー等が有名。"},
        "🥧 シュガーパイ":{min:6,avg:10,max:18,trend:"+10%",reason:"シュガーパイ（タルト・オ・シュクル）：C$6〜18。ケベック伝統菓子。"},
      },
      オタワ:{
        "🏛️ 国会議事堂(パーラメントヒル)":{min:0,avg:0,max:0,trend:"±0%",reason:"パーラメントヒル：見学・ツアー無料・要予約。カナダの政治の中心。"},
        "🏛️ カナダ歴史博物館":{min:23,avg:23,max:23,trend:"+10%",reason:"カナダ歴史博物館：C$23。カナダ最大規模の博物館。"},
        "🏛️ カナダ国立美術館":{min:25,avg:25,max:25,trend:"+10%",reason:"カナダ国立美術館：C$25。巨大蜘蛛「ママン」彫刻が象徴。"},
        "💧 リドー運河":{min:0,avg:0,max:0,trend:"±0%",reason:"リドー運河：散策無料・世界遺産。冬は世界最長のスケートリンク（7.8km）。"},
        "🛍️ バイワードマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"バイワードマーケット：散策無料。1826年から続くオタワの市場。"},
        "🏛️ カナダ戦争博物館":{min:23,avg:23,max:23,trend:"+10%",reason:"カナダ戦争博物館：C$23。"},
        "🏛️ カナダ自然博物館":{min:21,avg:21,max:21,trend:"+10%",reason:"カナダ自然博物館：C$21。"},
        "🏛️ カナダ造幣局":{min:8,avg:8,max:8,trend:"+10%",reason:"カナダ造幣局：C$8。世界最高純度の金貨を製造。"},
        "🌳 ガティノー公園":{min:0,avg:0,max:0,trend:"±0%",reason:"ガティノー公園：入園無料。オタワ・ゲートウェイの自然公園。"},
        "🏛️ ナショナルアーカイブ":{min:0,avg:0,max:0,trend:"±0%",reason:"カナダ国立公文書館：入場無料。"},
        "🥩 プーティン":{min:8,avg:14,max:22,trend:"+10%",reason:"オタワプーティン：C$8〜22。"},
        "🍞 ビーバーテール":{min:6,avg:9,max:14,trend:"+10%",reason:"ビーバーテール：C$6〜14。オタワ発祥の揚げパン。"},
        "🥩 ステーキ":{min:40,avg:70,max:140,trend:"+10%",reason:"オタワステーキ：C$40〜140。"},
        "🦞 シーフード":{min:30,avg:55,max:120,trend:"+10%",reason:"オタワシーフード：C$30〜120。"},
        "🥞 メープルシロップ":{min:5,avg:15,max:40,trend:"+10%",reason:"メープルシロップ：C$5〜40。"},
        "🍔 ハンバーガー":{min:12,avg:20,max:35,trend:"+10%",reason:"オタワバーガー：C$12〜35。"},
        "🍻 オタワビール":{min:6,avg:9,max:14,trend:"+10%",reason:"オタワクラフトビール：C$6〜14。"},
        "🥪 サンドイッチ":{min:8,avg:14,max:22,trend:"+10%",reason:"オタワサンドイッチ：C$8〜22。"},
      },
      エドモントン:{
        "🛍️ ウェストエドモントンモール":{min:0,avg:0,max:80,trend:"±0%",reason:"West Edmonton Mall：散策無料、アトラクションC$10〜80。北米最大のショッピングモール。"},
        "🏛️ アルバータ州議会議事堂":{min:0,avg:0,max:0,trend:"±0%",reason:"アルバータ州議会：見学無料。"},
        "🏛️ 王立アルバータ博物館":{min:21,avg:21,max:21,trend:"+10%",reason:"王立アルバータ博物館：C$21。アルバータの自然・歴史・文化。"},
        "🌳 リバーバレー":{min:0,avg:0,max:0,trend:"±0%",reason:"リバーバレー：散策無料。北米最大の都市公園地帯。"},
        "🎡 ファンタジーランド":{min:50,avg:60,max:70,trend:"+10%",reason:"ギャラクシーランド（屋内遊園地）：C$50〜70。West Edmonton Mall内。"},
        "🏞️ エルク島国立公園":{min:8.50,avg:8.50,max:8.50,trend:"+10%",reason:"エルク島国立公園：C$8.50。バイソンを間近で見られる。"},
        "🏛️ アルバータ美術館":{min:15,avg:15,max:15,trend:"+10%",reason:"アルバータ美術館：C$15。"},
        "🏟️ ロジャースプレイス":{min:30,avg:80,max:250,trend:"+10%",reason:"ロジャース・プレイス：観戦C$30〜250、ツアーC$30。NHLエドモントン・オイラーズ本拠地。"},
        "🌳 ミュッタートコンサバトリー":{min:14,avg:14,max:14,trend:"+10%",reason:"ミュッタート温室：C$14。4つのピラミッド型温室。"},
        "🏛️ 科学博物館":{min:23,avg:23,max:23,trend:"+10%",reason:"テルース・ワールド・オブ・サイエンス：C$23。"},
        "🥩 アルバータビーフ":{min:30,avg:50,max:120,trend:"+12%",reason:"アルバータビーフ：C$30〜120。"},
        "🥩 ステーキ":{min:40,avg:70,max:140,trend:"+10%",reason:"エドモントンステーキ：C$40〜140。"},
        "🥩 プーティン":{min:8,avg:14,max:22,trend:"+10%",reason:"プーティン：C$8〜22。"},
        "🍔 ハンバーガー":{min:12,avg:18,max:32,trend:"+10%",reason:"エドモントンバーガー：C$12〜32。"},
        "🥞 パンケーキ":{min:8,avg:14,max:22,trend:"+10%",reason:"パンケーキ：C$8〜22。"},
        "🥪 サンドイッチ":{min:8,avg:14,max:22,trend:"+10%",reason:"サンドイッチ：C$8〜22。"},
        "🍷 カナダワイン":{min:10,avg:20,max:50,trend:"+10%",reason:"カナダワイン：C$10〜50。"},
        "🍻 ローカルビール":{min:6,avg:9,max:14,trend:"+10%",reason:"アルバータ・クラフトビール：C$6〜14。"},
      },
      ビクトリア:{
        "🏛️ ブリティッシュコロンビア州議会議事堂":{min:0,avg:0,max:0,trend:"±0%",reason:"BC州議会：見学無料。夜のライトアップが圧巻。"},
        "🌹 ブッチャートガーデン":{min:42,avg:42,max:52,trend:"+12%",reason:"ブッチャート・ガーデン：C$42〜52（夏）、C$30〜40（冬）。100年以上の歴史を持つ世界の名園。"},
        "🏰 クレイダーロック城":{min:22,avg:22,max:22,trend:"+10%",reason:"クレイダーロック城：C$22。1890年完成のヴィクトリアン・マンション。"},
        "🏛️ ロイヤルBC博物館":{min:30,avg:30,max:30,trend:"+10%",reason:"ロイヤルBC博物館：C$30。先住民の文化展示が秀逸。"},
        "🛍️ インナーハーバー":{min:0,avg:0,max:0,trend:"±0%",reason:"インナーハーバー：散策無料。ビクトリアの中心。総督邸前の港。"},
        "🏛️ エンプレスホテル":{min:0,avg:0,max:95,trend:"±0%",reason:"フェアモント・エンプレスホテル：見学無料、アフタヌーンティーC$95。1908年完成。"},
        "🛍️ ベーコンビル":{min:0,avg:0,max:0,trend:"±0%",reason:"バスチョン・スクエア：散策無料。ビクトリア発祥の地。"},
        "🌳 ビーコンヒル公園":{min:0,avg:0,max:0,trend:"±0%",reason:"ビーコン・ヒル公園：入園無料。海岸沿いの絶景公園。"},
        "⛪ クライストチャーチ大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"クライスト・チャーチ大聖堂：入場無料。"},
        "🏝️ ホエールウォッチング":{min:135,avg:150,max:200,trend:"+12%",reason:"ホエールウォッチング：C$135〜200（3時間）。シャチ・コククジラを観察。"},
        "🦞 サーモン":{min:25,avg:40,max:80,trend:"+12%",reason:"BCサーモン：C$25〜80。"},
        "🍣 寿司":{min:25,avg:45,max:120,trend:"+10%",reason:"ビクトリア寿司：C$25〜120。"},
        "🥩 プーティン":{min:8,avg:14,max:22,trend:"+10%",reason:"プーティン：C$8〜22。"},
        "🦀 シーフード":{min:30,avg:55,max:120,trend:"+10%",reason:"ビクトリアシーフード：C$30〜120。ダンジネスクラブが名物。"},
        "🍰 アフタヌーンティー":{min:65,avg:85,max:120,trend:"+12%",reason:"ビクトリア・アフタヌーンティー：C$65〜120。エンプレスホテルが本場。"},
        "🍔 ハンバーガー":{min:12,avg:20,max:32,trend:"+10%",reason:"ビクトリアバーガー：C$12〜32。"},
        "🍷 BCワイン":{min:10,avg:20,max:60,trend:"+10%",reason:"BCワイン：C$10〜60。"},
        "🍻 ローカルビール":{min:6,avg:9,max:14,trend:"+10%",reason:"BC州クラフトビール：C$6〜14。"},
      },
      ウィスラー:{
        "🏔️ ウィスラー山":{min:39,avg:65,max:99,trend:"+12%",reason:"ウィスラー山リフト：夏C$39〜65、冬リフト券C$99〜200。"},
        "🏔️ ブラッコム山":{min:39,avg:65,max:99,trend:"+12%",reason:"ブラッコム山：夏C$39〜65、冬リフト券C$99〜200。"},
        "🚠 ピーク2ピークゴンドラ":{min:75,avg:75,max:90,trend:"+10%",reason:"PEAK 2 PEAKゴンドラ：C$75〜90。世界最長の山頂間ロープウェイ（4.4km）。"},
        "⛷️ スキー・スノーボード":{min:99,avg:159,max:250,trend:"+15%",reason:"スキー1日リフト券：C$99〜250。北米No.1スキーリゾート。"},
        "🏔️ アルタ湖":{min:0,avg:0,max:0,trend:"±0%",reason:"アルタ湖：入場無料。夏のカヤック・SUPが人気。"},
        "🏞️ ガリバルディ州立公園":{min:0,avg:11,max:11,trend:"±0%",reason:"ガリバルディ州立公園：入園無料、駐車場C$11。エメラルド色の湖が絶景。"},
        "🛍️ ウィスラービレッジ":{min:0,avg:0,max:0,trend:"±0%",reason:"ウィスラービレッジ：散策無料。歩行者天国のリゾートタウン。"},
        "🌳 ロストレイク":{min:0,avg:0,max:0,trend:"±0%",reason:"ロスト・レイク：入場無料。ウィスラービレッジ徒歩圏の湖。"},
        "🎢 ジップライン":{min:135,avg:175,max:230,trend:"+12%",reason:"ウィスラー・ジップライン：C$135〜230。森を駆け抜けるスリル体験。"},
        "🚴 マウンテンバイク":{min:75,avg:115,max:170,trend:"+12%",reason:"ウィスラー・バイクパーク：1日券C$75〜170。世界最大規模のダウンヒルパーク。"},
        "🥩 プーティン":{min:10,avg:18,max:28,trend:"+10%",reason:"プーティン：C$10〜28。"},
        "🥩 ステーキ":{min:45,avg:80,max:160,trend:"+12%",reason:"ウィスラーステーキ：C$45〜160。"},
        "🥪 サンドイッチ":{min:10,avg:16,max:25,trend:"+10%",reason:"ウィスラーサンドイッチ：C$10〜25。"},
        "🥣 シチュー":{min:14,avg:22,max:35,trend:"+10%",reason:"温かいシチュー：C$14〜35。"},
        "🍰 メープル菓子":{min:5,avg:12,max:30,trend:"+10%",reason:"メープル菓子：C$5〜30。"},
        "🥞 パンケーキ":{min:10,avg:16,max:25,trend:"+10%",reason:"ウィスラーパンケーキ：C$10〜25。"},
        "🍻 ローカルビール":{min:7,avg:10,max:16,trend:"+10%",reason:"ウィスラーローカルビール：C$7〜16。"},
        "🍷 カナダワイン":{min:10,avg:22,max:60,trend:"+10%",reason:"カナダワイン：C$10〜60。"},
      },
      バンフ:{
        "🏔️ バンフ国立公園":{min:11,avg:11,max:11,trend:"+10%",reason:"バンフ国立公園：1日券C$11（大人）。1885年カナダ初の国立公園。"},
        "🌊 ルイーズ湖":{min:0,avg:0,max:0,trend:"±0%",reason:"ルイーズ湖：見学無料（公園入場料込み）。「ロッキーの宝石」と呼ばれるエメラルド色の湖。"},
        "🌊 モレーン湖":{min:0,avg:0,max:0,trend:"±0%",reason:"モレーン湖：見学無料（公園入場料込み）。10ペソ紙幣の絵柄になった絶景湖。"},
        "♨️ バンフ温泉":{min:17,avg:17,max:17,trend:"+10%",reason:"バンフ・アッパー・ホット・スプリングス：C$17。標高1585mの天然温泉。"},
        "🚠 バンフゴンドラ":{min:75,avg:75,max:75,trend:"+12%",reason:"バンフ・ゴンドラ：C$75。サルファー山頂2281mへ8分。"},
        "🏛️ ホエール川":{min:0,avg:0,max:0,trend:"±0%",reason:"ボウ川：散策無料。バンフの町を流れる絶景の川。"},
        "🦌 野生動物観察":{min:80,avg:120,max:200,trend:"+12%",reason:"野生動物ツアー：C$80〜200。エルク・クマ・ムース・ビッグホーンシープ。"},
        "🚂 カナディアンロッキー鉄道":{min:1500,avg:2500,max:5000,trend:"+15%",reason:"ロッキーマウンテニア鉄道：2泊3日C$1500〜5000。"},
        "🏔️ 氷河ツアー":{min:120,avg:150,max:250,trend:"+12%",reason:"アサバスカ氷河ツアー：C$120〜250。Snocoachで氷河上を走行。"},
        "🏔️ サルファー山":{min:75,avg:75,max:90,trend:"+10%",reason:"サルファー山：ゴンドラC$75、頂上展望台C$90。バンフタウンを一望。"},
        "🥩 アルバータビーフ":{min:35,avg:60,max:130,trend:"+12%",reason:"バンフのアルバータビーフ：C$35〜130。"},
        "🥩 ステーキ":{min:45,avg:80,max:160,trend:"+12%",reason:"バンフステーキ：C$45〜160。"},
        "🥩 プーティン":{min:10,avg:16,max:25,trend:"+10%",reason:"プーティン：C$10〜25。"},
        "🥩 バイソン肉":{min:35,avg:55,max:120,trend:"+12%",reason:"バイソン（バッファロー）料理：C$35〜120。カナディアン・ロッキーの伝統料理。"},
        "🍔 ハンバーガー":{min:14,avg:22,max:38,trend:"+10%",reason:"バンフバーガー：C$14〜38。"},
        "🥪 サンドイッチ":{min:10,avg:16,max:25,trend:"+10%",reason:"バンフサンドイッチ：C$10〜25。"},
        "🥞 メープルシロップ":{min:6,avg:18,max:50,trend:"+10%",reason:"メープルシロップ：C$6〜50。"},
        "🍻 ローカルビール":{min:7,avg:10,max:16,trend:"+10%",reason:"バンフ・ローカルビール：C$7〜16。"},
      },
    },
  },
  イタリア:{
    food:{
      "🏪 コンビニ":{min:3,avg:8,max:20,trend:"+8%",reason:"バール・スーパー軽食3〜20€。"},
      "🍢 屋台":{min:5,avg:12,max:25,trend:"+10%",reason:"ストリートフード5〜25€。パニーノ・ピザ切り売り。"},
      "🍜 ローカル食堂":{min:10,avg:20,max:35,trend:"+8%",reason:"トラットリア10〜35€。コペルト2〜5€別途。"},
      "🍣 チェーン":{min:8,avg:15,max:30,trend:"+8%",reason:"マックなどファストフード8〜30€。"},
      "🍽️ カジュアル":{min:20,avg:35,max:60,trend:"+10%",reason:"カジュアルレストラン20〜60€/人。"},
      "🥂 中級":{min:40,avg:70,max:120,trend:"+10%",reason:"中級レストラン40〜120€/人。"},
      "🥩 高級":{min:80,avg:150,max:300,trend:"+10%",reason:"高級レストラン80〜300€/人。"},
      "👑 超高級":{min:200,avg:350,max:800,trend:"+12%",reason:"ミシュラン三つ星200〜800€/人。"},
      "🌅 朝食":{min:3,avg:8,max:25,trend:"+8%",reason:"カフェ朝食3〜25€。エスプレッソ1.2〜2€。"},
      "☀️ ランチ":{min:12,avg:25,max:50,trend:"+10%",reason:"ランチセット12〜50€。"},
      "🌆 ディナー":{min:25,avg:50,max:120,trend:"+10%",reason:"ディナー25〜120€/人。"},
      "🍱 テイクアウト":{min:5,avg:12,max:25,trend:"+10%",reason:"テイクアウト5〜25€。"},
      "☕ カフェ軽食":{min:5,avg:12,max:25,trend:"+8%",reason:"カフェ軽食5〜25€。"},
      "🌙 夜食":{min:5,avg:15,max:40,trend:"+10%",reason:"バール夜食5〜40€。"},
    },
    drink:{
      "🥤 ペットボトル水":{min:1,avg:1.5,max:3,trend:"+8%",reason:"水500ml 1〜3€。スーパー0.5〜1€。"},
      "🥤 ソフトドリンク":{min:2,avg:3,max:5,trend:"+8%",reason:"コーラ・ジュース2〜5€。"},
      "☕ コーヒー":{min:1.2,avg:2,max:5,trend:"+8%",reason:"エスプレッソ1.2〜2€（バンコ）。テーブル席3〜5€。"},
      "🍵 紅茶":{min:2,avg:3.5,max:6,trend:"+8%",reason:"紅茶2〜6€。"},
      "🧃 ジュース":{min:3,avg:5,max:8,trend:"+8%",reason:"フレッシュジュース3〜8€。"},
      "🍺 ビール":{min:3,avg:6,max:10,trend:"+10%",reason:"イタリアビール3〜10€。観光地ぼったくり注意。"},
      "🍷 ワイン":{min:4,avg:8,max:25,trend:"+10%",reason:"グラスワイン4〜10€。ボトル15〜50€。"},
      "🍹 カクテル":{min:8,avg:12,max:20,trend:"+10%",reason:"カクテル8〜20€。アペロール8〜10€。"},
      "🥛 牛乳":{min:1,avg:1.8,max:3,trend:"+8%",reason:"牛乳1L 1〜3€。"},
      "🍶 リキュール":{min:3,avg:6,max:15,trend:"+10%",reason:"リモンチェッロ・グラッパ3〜15€/杯。"},
    },
    taxi:{
      "🚖 短距離":{min:8,avg:15,max:25,trend:"+10%",reason:"市内短距離8〜25€。初乗り3.5〜5€。"},
      "🚖 中距離":{min:15,avg:30,max:50,trend:"+10%",reason:"市内中距離15〜50€。"},
      "🚖 長距離":{min:40,avg:70,max:150,trend:"+10%",reason:"郊外への長距離40〜150€。"},
      "✈️ 空港":{min:35,avg:55,max:90,trend:"+10%",reason:"ローマ・フィウミチーノ空港〜市内55€定額（2025年）。"},
      "🌙 深夜":{min:15,avg:25,max:60,trend:"+15%",reason:"深夜割増+5〜10€。"},
      "🚗 配車アプリ":{min:8,avg:18,max:40,trend:"+10%",reason:"Uber/Free Now利用可能。"},
    },
    hotel:{
      "🏨 格安ホステル":{min:25,avg:50,max:100,trend:"+10%",reason:"ホステル・B&B25〜100€/泊。"},
      "🏨 3つ星":{min:80,avg:150,max:250,trend:"+10%",reason:"3つ星ホテル80〜250€/泊。"},
      "🏨 4つ星":{min:150,avg:280,max:450,trend:"+12%",reason:"4つ星ホテル150〜450€/泊。"},
      "🏨 5つ星":{min:300,avg:600,max:1500,trend:"+15%",reason:"5つ星ラグジュアリー300〜1500€/泊。"},
      "🏠 民泊・Airbnb":{min:40,avg:100,max:250,trend:"+12%",reason:"Airbnb40〜250€/泊。"},
    },
    shopping:{
      "👕 衣料":{min:20,avg:80,max:500,trend:"+8%",reason:"イタリアブランド20〜500€。プラダ・グッチ等高級。"},
      "💄 コスメ":{min:10,avg:35,max:150,trend:"+8%",reason:"イタリアブランドコスメ10〜150€。"},
      "🛒 スーパー":{min:1,avg:5,max:30,trend:"+8%",reason:"スーパー食料品1〜30€。"},
      "🎁 おみやげ":{min:5,avg:20,max:100,trend:"+10%",reason:"オリーブオイル・ワイン・チーズ5〜100€。"},
      "💻 家電":{min:30,avg:200,max:2000,trend:"+8%",reason:"家電製品30〜2000€。"},
    },
    activity:{
      "🏛️ 観光入場":{min:5,avg:18,max:30,trend:"+10%",reason:"コロッセオ18€、バチカン美術館20€、ウフィツィ25€。"},
      "🤿 アクティビティ":{min:20,avg:80,max:300,trend:"+10%",reason:"アマルフィボート・カプリ青の洞窟20〜300€。"},
      "💆 マッサージ":{min:40,avg:80,max:200,trend:"+10%",reason:"スパ・マッサージ40〜200€/時間。"},
      "🎭 エンタメ":{min:30,avg:100,max:300,trend:"+10%",reason:"オペラ30〜300€。スカラ座は500€超も。"},
      "🚌 ツアー":{min:30,avg:80,max:250,trend:"+10%",reason:"日帰りツアー30〜250€。"},
    },
    famous:{
      ローマ:{
        "🏛️ コロッセオ":{min:18,avg:18,max:24,trend:"+5%",reason:"コロッセオ：通常18€、コロッセオ+フォロロマーノ+パラティーノ共通券24€。事前予約推奨。"},
        "🏛️ フォロロマーノ":{min:18,avg:24,max:24,trend:"+5%",reason:"フォロロマーノ：コロッセオ共通券24€。古代ローマの中心地。"},
        "⛪ バチカン美術館":{min:20,avg:25,max:40,trend:"+8%",reason:"バチカン美術館：20€（公式）、ガイド付き25〜40€。システィーナ礼拝堂込み。"},
        "⛪ サンピエトロ大聖堂":{min:0,avg:0,max:10,trend:"±0%",reason:"サンピエトロ大聖堂：入場無料、クーポラ登頂8〜10€。"},
        "💧 トレヴィの泉":{min:0,avg:0,max:5,trend:"+100%",reason:"トレヴィの泉：見学2025年から有料化検討（数€）。コイン投げで願いが叶う伝説。"},
        "🪜 スペイン広場":{min:0,avg:0,max:0,trend:"±0%",reason:"スペイン広場：見学無料。映画「ローマの休日」の階段。階段に座るのは禁止。"},
        "🏛️ パンテオン":{min:5,avg:5,max:5,trend:"+100%",reason:"パンテオン：5€（2023年から有料化、以前は無料）。完璧なドーム建築。"},
        "🏰 サンタンジェロ城":{min:13,avg:13,max:25,trend:"+8%",reason:"サンタンジェロ城：13€、ローマパス利用可。テヴェレ川沿いの要塞。"},
        "🛕 真実の口":{min:0,avg:1,max:2,trend:"±0%",reason:"真実の口：寄付1〜2€。サンタ・マリア・イン・コスメディン教会内。映画ロケ地。"},
        "🏛️ ボルゲーゼ美術館":{min:15,avg:15,max:25,trend:"+5%",reason:"ボルゲーゼ美術館：15€、要事前予約。ベルニーニ・カラヴァッジョの傑作。"},
        "🍝 カルボナーラ":{min:12,avg:18,max:30,trend:"+10%",reason:"カルボナーラ：12〜30€。ローマ発祥のパスタ。グアンチャーレ・卵・ペコリーノ。"},
        "🍝 カチョエペペ":{min:10,avg:15,max:25,trend:"+10%",reason:"カチョ・エ・ペペ：10〜25€。ローマ三大パスタの一つ。ペコリーノチーズ・黒胡椒。"},
        "🍝 アマトリチャーナ":{min:12,avg:18,max:28,trend:"+10%",reason:"アマトリチャーナ：12〜28€。トマト・グアンチャーレ・ペコリーノのローマ風パスタ。"},
        "🍕 ローマ風ピザ":{min:8,avg:15,max:25,trend:"+10%",reason:"ローマ風ピザ：薄生地8〜25€。切り売り（al taglio）3〜8€/100g。"},
        "🥩 サルティンボッカ":{min:15,avg:22,max:35,trend:"+10%",reason:"サルティンボッカ・アッラ・ロマーナ：15〜35€。仔牛肉に生ハム・セージを巻いた料理。"},
        "🍦 ジェラート":{min:3,avg:5,max:10,trend:"+10%",reason:"ジェラート：3〜10€（コーン・カップ）。観光地は割高。"},
        "🥃 エスプレッソ":{min:1.2,avg:1.5,max:3,trend:"+8%",reason:"エスプレッソ：バンコ1.2〜2€、テーブル席2〜3€。バールの伝統。"},
        "🍷 ハウスワイン":{min:4,avg:8,max:15,trend:"+10%",reason:"ハウスワイン（vino della casa）：グラス4〜10€、デカンタ8〜15€。"},
      },
      ミラノ:{
        "⛪ ミラノ大聖堂":{min:7,avg:15,max:30,trend:"+10%",reason:"ミラノ大聖堂（ドゥオモ）：内部7€、屋上テラス15〜25€、ファストトラック30€。"},
        "🖼️ 最後の晩餐":{min:15,avg:20,max:50,trend:"+10%",reason:"最後の晩餐：15€（公式）、ガイド付き20〜50€。3ヶ月前予約必須・15分制限。"},
        "🛍️ ヴィットーリオ・エマヌエーレII世":{min:0,avg:0,max:0,trend:"±0%",reason:"ガッレリア：散策無料。プラダ本店・カフェ・宝石店。世界最古のショッピングモール。"},
        "🏰 スフォルツェスコ城":{min:5,avg:10,max:15,trend:"+8%",reason:"スフォルツェスコ城：城内入場無料、内部美術館5〜15€。ミケランジェロの遺作。"},
        "🎭 スカラ座":{min:9,avg:12,max:500,trend:"+10%",reason:"スカラ座：博物館9〜12€、公演30〜500€（最高オペラ席）。世界最高峰の歌劇場。"},
        "🏛️ ブレラ美術館":{min:12,avg:15,max:20,trend:"+8%",reason:"ブレラ絵画館：15€、第1日曜無料。ラファエロ・カラヴァッジョの傑作。"},
        "⛪ サンタンブロージョ教会":{min:0,avg:0,max:0,trend:"±0%",reason:"サンタンブロージョ教会：参拝無料。ミラノ守護聖人を祀る11世紀の教会。"},
        "🏛️ ピナコテーカ・アンブロジアーナ":{min:15,avg:15,max:15,trend:"+8%",reason:"アンブロジアーナ：15€。ダ・ヴィンチ「アトランティコ手稿」展示。"},
        "🛍️ ナヴィリ運河":{min:0,avg:0,max:0,trend:"±0%",reason:"ナヴィリ：散策無料。レオナルド設計の運河沿いのトレンディエリア。"},
        "🏟️ サンシーロ":{min:25,avg:35,max:150,trend:"+10%",reason:"サンシーロ：スタジアムツアー25〜35€、試合観戦35〜150€。AC/Inter本拠地。"},
        "🍝 リゾット・ミラネーゼ":{min:15,avg:22,max:35,trend:"+10%",reason:"リゾット・アッラ・ミラネーゼ：15〜35€。サフラン入り黄金リゾット。"},
        "🥩 オッソブーコ":{min:20,avg:30,max:50,trend:"+10%",reason:"オッソブーコ：20〜50€。仔牛すね肉の煮込み。リゾット添えが定番。"},
        "🥩 コトレッタ・ミラネーゼ":{min:18,avg:25,max:40,trend:"+10%",reason:"コトレッタ・ミラネーゼ：18〜40€。骨付き仔牛のカツレツ。"},
        "🍕 ピザ":{min:8,avg:14,max:25,trend:"+10%",reason:"ミラノピザ：8〜25€。ナポリほど厳格でなく多様。"},
        "🥖 パネットーネ":{min:15,avg:25,max:60,trend:"+10%",reason:"パネットーネ：500g 15〜60€。ミラノ発祥のクリスマス菓子。"},
        "☕ エスプレッソ":{min:1.2,avg:1.5,max:3,trend:"+8%",reason:"エスプレッソ：バンコ1.2〜2€、テーブル席2〜3€。"},
        "🍷 ロンバルディアワイン":{min:5,avg:10,max:30,trend:"+10%",reason:"ロンバルディアワイン：グラス5〜10€、ボトル15〜30€。フランチャコルタが有名。"},
        "🍦 ジェラート":{min:3,avg:5,max:10,trend:"+10%",reason:"ジェラート：3〜10€。グロムなど名店が多い。"},
      },
      フィレンツェ:{
        "⛪ ドゥオモ(花の聖母)":{min:0,avg:30,max:30,trend:"+10%",reason:"フィレンツェ大聖堂：内部無料、クーポラ・洗礼堂・鐘楼共通券30€（Brunelleschiパス）。"},
        "🏛️ ウフィツィ美術館":{min:25,avg:25,max:30,trend:"+5%",reason:"ウフィツィ美術館：25€（オンライン+予約料4€）。ボッティチェッリ「ヴィーナス誕生」。"},
        "🏰 ヴェッキオ宮殿":{min:12.5,avg:17.5,max:25,trend:"+10%",reason:"パラッツォ・ヴェッキオ：博物館12.5€、塔17.5€、共通券25€。"},
        "🌉 ヴェッキオ橋":{min:0,avg:0,max:0,trend:"±0%",reason:"ヴェッキオ橋：散策無料。14世紀の橋。宝飾店が並ぶ。"},
        "🏛️ アカデミア美術館(ダビデ像)":{min:16,avg:16,max:25,trend:"+5%",reason:"アカデミア美術館：16€（オンライン+予約料）。ミケランジェロ「ダビデ像」本物。"},
        "⛪ サンタクローチェ教会":{min:8,avg:8,max:8,trend:"+5%",reason:"サンタクローチェ教会：8€。ミケランジェロ・ガリレオの墓所。"},
        "🌅 ミケランジェロ広場":{min:0,avg:0,max:0,trend:"±0%",reason:"ミケランジェロ広場：見学無料。フィレンツェ全景の絶景スポット。サンセット必見。"},
        "🏰 ピッティ宮殿":{min:16,avg:22,max:22,trend:"+5%",reason:"ピッティ宮殿：16〜22€。メディチ家の大宮殿。複数美術館。"},
        "🌳 ボーボリ庭園":{min:11,avg:11,max:22,trend:"+5%",reason:"ボーボリ庭園：11€、ピッティ宮殿共通券22€。イタリア式庭園の代表。"},
        "🏛️ バルジェロ博物館":{min:12,avg:12,max:12,trend:"+5%",reason:"バルジェロ博物館：12€。ドナテッロ・ミケランジェロの彫刻。"},
        "🥩 ビステッカ・フィオレンティーナ":{min:50,avg:80,max:150,trend:"+10%",reason:"ビステッカ・フィオレンティーナ：1kg 50〜150€（2人前）。Tボーンステーキの王様。"},
        "🍞 リボッリータ":{min:10,avg:15,max:25,trend:"+10%",reason:"リボッリータ：10〜25€。トスカーナの伝統的な野菜・パン入りスープ。"},
        "🍝 パッパルデッレ":{min:14,avg:20,max:35,trend:"+10%",reason:"パッパルデッレ：14〜35€。幅広パスタ。イノシシ肉ソース（チンギアーレ）が名物。"},
        "🍷 キャンティワイン":{min:6,avg:12,max:50,trend:"+10%",reason:"キャンティ・クラシコ：グラス6〜12€、ボトル20〜50€。サンジョヴェーゼ品種。"},
        "🍦 ジェラート":{min:3,avg:5,max:10,trend:"+10%",reason:"ジェラート：3〜10€。ヴィヴォリ・ペルケノ・ジェラテリア・スゾーニ等の名店。"},
        "🐗 イノシシ料理":{min:18,avg:28,max:50,trend:"+10%",reason:"チンギアーレ（イノシシ）：18〜50€。パスタソース・煮込み・ハム。"},
        "🧀 ペコリーノチーズ":{min:8,avg:15,max:30,trend:"+8%",reason:"ペコリーノ・トスカーノ：100g 8〜30€。羊乳チーズ。"},
        "🫒 オリーブオイル":{min:8,avg:20,max:80,trend:"+10%",reason:"トスカーナEXVオリーブオイル：500ml 8〜80€。世界最高品質。"},
      },
      ヴェネツィア:{
        "⛪ サンマルコ寺院":{min:3,avg:3,max:7,trend:"+10%",reason:"サンマルコ寺院：3€（事前予約）、博物館7€。ビザンチン様式の傑作。"},
        "🏰 ドゥカーレ宮殿":{min:30,avg:30,max:30,trend:"+10%",reason:"ドゥカーレ宮殿：30€（サンマルコ広場博物館共通券）。ため息の橋に通じる。"},
        "🌉 リアルト橋":{min:0,avg:0,max:0,trend:"±0%",reason:"リアルト橋：見学無料。ヴェネツィアのシンボル。橋上には宝飾店。"},
        "🛶 ゴンドラ":{min:80,avg:90,max:120,trend:"+10%",reason:"ゴンドラ：30分90€（昼）、120€（19時以降）。最大6名まで分割可能。"},
        "⛪ サンタマリア教会":{min:5,avg:5,max:5,trend:"+8%",reason:"サンタマリア・デッラ・サルーテ：内部無料、聖具室5€。バロック建築の傑作。"},
        "🏝️ ムラーノ島":{min:0,avg:7.5,max:15,trend:"+8%",reason:"ムラーノ島：船賃片道7.5€、24h乗り放題25€。ガラス工芸の島。"},
        "🏝️ ブラーノ島":{min:0,avg:7.5,max:15,trend:"+8%",reason:"ブラーノ島：船賃片道7.5€。カラフルな家々で有名。レース編みの伝統。"},
        "🎭 仮面舞踏会":{min:30,avg:100,max:1000,trend:"+15%",reason:"カーニバル仮面舞踏会：30〜1000€。2月の伝統行事。仮面販売15€〜。"},
        "🚢 水上バス(ヴァポレット)":{min:9.5,avg:25,max:65,trend:"+15%",reason:"ヴァポレット：1回9.5€（75分）、1日券25€、3日券45€、7日券65€。"},
        "🛍️ サンマルコ広場":{min:0,avg:0,max:15,trend:"±0%",reason:"サンマルコ広場：散策無料。広場のカフェは音楽料込み15€〜（コーヒー1杯）。"},
        "🍝 イカ墨パスタ":{min:18,avg:25,max:45,trend:"+10%",reason:"スパゲッティ・アル・ネロ・ディ・セッピア：18〜45€。ヴェネツィア名物。"},
        "🦞 海鮮料理":{min:30,avg:50,max:120,trend:"+12%",reason:"ヴェネツィアシーフード：30〜120€。アドリア海の新鮮な魚介。"},
        "🐟 サルデフィン・サオール":{min:10,avg:15,max:25,trend:"+10%",reason:"サルデ・イン・サオール：10〜25€。イワシの甘酢漬け。ヴェネツィア伝統料理。"},
        "🍷 プロセッコ":{min:5,avg:8,max:20,trend:"+10%",reason:"プロセッコ：グラス5〜10€、ボトル15〜50€。ヴェネト州発祥のスパークリング。"},
        "🍦 ジェラート":{min:3,avg:6,max:12,trend:"+10%",reason:"ヴェネツィアのジェラート：3〜12€。サンマルコ広場周辺は割高。"},
        "🍰 ティラミス(発祥)":{min:6,avg:10,max:18,trend:"+10%",reason:"ティラミス：6〜18€。ヴェネト州トレヴィーゾ発祥。本場の味は感動的。"},
        "🥖 チケッティ":{min:1.5,avg:3,max:6,trend:"+10%",reason:"チケッティ（ベネチア風タパス）：1.5〜6€/個。バーカロで立ち飲み。"},
        "🥃 アペロール":{min:6,avg:10,max:15,trend:"+10%",reason:"アペロール・スプリッツ：6〜15€。ヴェネト発祥のオレンジ色アペリティーボ。"},
      },
      ナポリ:{
        "⛰️ ヴェスヴィオ火山":{min:10,avg:13,max:25,trend:"+8%",reason:"ヴェスヴィオ火山：山頂入場13€。バス・タクシーで山腹まで。ローマ帝国を埋めた火山。"},
        "🏛️ ポンペイ遺跡":{min:18,avg:22,max:30,trend:"+10%",reason:"ポンペイ遺跡：22€、ガイド付き30€〜。世界遺産。AD79年の街並みが完全保存。"},
        "🏛️ エルコラーノ遺跡":{min:15,avg:16,max:25,trend:"+10%",reason:"エルコラーノ遺跡：16€。ポンペイより保存状態良好。観光客少なめ。"},
        "🏰 卵城(カステル・デローヴォ)":{min:0,avg:0,max:0,trend:"±0%",reason:"卵城：入場無料。ナポリ湾に浮かぶ要塞。サンタルチア海岸沿い。"},
        "🏰 ヌオーヴォ城":{min:6,avg:6,max:6,trend:"+8%",reason:"カステル・ヌオーヴォ（新城）：6€。13世紀建造のアンジュー家の城。"},
        "⛪ ナポリ大聖堂":{min:0,avg:0,max:12,trend:"±0%",reason:"ナポリ大聖堂：内部無料、地下遺跡12€。聖ジェンナーロの血の奇跡で有名。"},
        "🏛️ 国立考古学博物館":{min:18,avg:22,max:22,trend:"+10%",reason:"国立考古学博物館：22€。ポンペイ・エルコラーノ出土品の世界最大コレクション。"},
        "🛍️ スパッカ・ナポリ":{min:0,avg:0,max:0,trend:"±0%",reason:"スパッカ・ナポリ：散策無料。ナポリ旧市街を貫く伝統地区。世界遺産。"},
        "🌊 サンタルチア海岸":{min:0,avg:0,max:0,trend:"±0%",reason:"サンタルチア海岸：散策無料。ナポリ湾の絶景。卵城を望むサンセットスポット。"},
        "🏝️ カプリ島":{min:25,avg:40,max:80,trend:"+12%",reason:"カプリ島フェリー：往復25〜80€（ナポリ・ソレント発）。所要40〜80分。"},
        "🍕 マルゲリータ(発祥)":{min:5,avg:9,max:20,trend:"+10%",reason:"ピザ・マルゲリータ：5〜20€。ダ・ミケーレ・ソルビーロ等の名店。ピザの発祥地。"},
        "🍝 パスタ":{min:8,avg:15,max:30,trend:"+10%",reason:"ナポリ風パスタ：8〜30€。スパゲッティ・アッラ・ジェノヴェーゼ等。"},
        "☕ ナポリコーヒー":{min:1,avg:1.5,max:3,trend:"+8%",reason:"ナポリコーヒー：バンコ1〜1.5€。イタリア最強の濃厚エスプレッソ。"},
        "🍰 スフォリアテッラ":{min:2.5,avg:4,max:7,trend:"+10%",reason:"スフォリアテッラ：1個2.5〜7€。貝殻状のリコッタチーズ入り焼き菓子。"},
        "🍰 ババ":{min:3,avg:5,max:10,trend:"+10%",reason:"ババ・アル・ラム：1個3〜10€。ラム酒シロップ漬けのパン菓子。"},
        "🍕 マリナーラ":{min:5,avg:8,max:15,trend:"+10%",reason:"ピザ・マリナーラ：5〜15€。トマト・ニンニク・オレガノのみのシンプルピザ。"},
        "🍷 ラクリマクリスティ":{min:5,avg:12,max:35,trend:"+10%",reason:"ラクリマ・クリスティ：グラス5〜12€、ボトル15〜35€。ヴェスヴィオ山麓のワイン。"},
        "🍝 スパゲッティ・ボンゴレ":{min:12,avg:18,max:35,trend:"+10%",reason:"スパゲッティ・アッラ・ヴォンゴレ：12〜35€。アサリのスパゲッティ。"},
      },
      アマルフィ:{
        "🏖️ ポジターノ":{min:0,avg:0,max:0,trend:"±0%",reason:"ポジターノ：散策無料。崖に貼り付くカラフルな家並み。世界一美しい海岸の象徴。"},
        "🏖️ アマルフィ海岸":{min:0,avg:0,max:0,trend:"±0%",reason:"アマルフィ海岸：散策無料・世界遺産。SS163号線をバス・タクシーで巡るのが定番。"},
        "⛪ アマルフィ大聖堂":{min:0,avg:3,max:3,trend:"±0%",reason:"アマルフィ大聖堂：内部無料、修道院・博物館3€。アラブ・ノルマン様式。"},
        "🏘️ ラヴェッロ":{min:0,avg:0,max:0,trend:"±0%",reason:"ラヴェッロ：散策無料。崖の上の「神の眺め」を持つ町。音楽祭で有名。"},
        "🏛️ ヴィッラ・ルフォーロ":{min:8,avg:8,max:8,trend:"+8%",reason:"ヴィッラ・ルフォーロ：8€。ラヴェッロの絶景庭園。ワーグナーが楽曲を書いた場所。"},
        "🏛️ ヴィッラ・チンブローネ":{min:10,avg:10,max:10,trend:"+8%",reason:"ヴィッラ・チンブローネ：10€。「無限のテラス」で有名。"},
        "🚢 ボートツアー":{min:30,avg:60,max:200,trend:"+12%",reason:"アマルフィ海岸ボートツアー：30〜200€。ポジターノ・カプリを巡るプライベートチャーター人気。"},
        "🏝️ カプリ島":{min:25,avg:40,max:80,trend:"+12%",reason:"カプリ島フェリー：往復25〜80€。アマルフィ・ソレントから所要40〜90分。"},
        "🌊 青の洞窟":{min:18,avg:25,max:50,trend:"+15%",reason:"青の洞窟：ボート＋入場料計18〜50€。波の状態で見学不可日も多い。"},
        "🏘️ ソレント":{min:0,avg:0,max:0,trend:"±0%",reason:"ソレント：散策無料。ナポリ湾沿いのリゾート町。リモンチェッロ発祥の地。"},
        "🍋 リモンチェッロ":{min:3,avg:8,max:25,trend:"+10%",reason:"リモンチェッロ：1杯3〜8€、ボトル500ml 15〜25€。ソレント・アマルフィレモン使用。"},
        "🍝 シーフードパスタ":{min:18,avg:30,max:60,trend:"+12%",reason:"シーフードパスタ：18〜60€。海岸沿いのレストランは観光地価格。"},
        "🦞 海鮮料理":{min:30,avg:60,max:150,trend:"+12%",reason:"アマルフィシーフード：30〜150€。新鮮なシーバス・ロブスター。"},
        "🍝 スパゲッティ・ボンゴレ":{min:15,avg:25,max:45,trend:"+10%",reason:"スパゲッティ・ボンゴレ：15〜45€。アサリのスパゲッティ。"},
        "🍕 ピザ":{min:8,avg:14,max:25,trend:"+10%",reason:"ピザ：8〜25€。ナポリスタイルが主流。"},
        "🍦 レモンジェラート":{min:3,avg:5,max:10,trend:"+10%",reason:"レモンジェラート：3〜10€。アマルフィレモンの爽やかな風味。"},
        "🧀 モッツァレラ":{min:5,avg:10,max:20,trend:"+10%",reason:"モッツァレラ・ディ・ブッファラ：5〜20€。カンパニア州の特産。"},
        "🐟 アンチョビ料理":{min:10,avg:18,max:35,trend:"+10%",reason:"チェターラ産アンチョビ：10〜35€。アマルフィ海岸名物。"},
      },
      シチリア:{
        "🏛️ ヴァッレ・デイ・テンプリ":{min:13.5,avg:18,max:25,trend:"+8%",reason:"神殿の谷（アグリジェント）：13.5€、博物館込み18€。ギリシャ・ローマ時代の遺跡群・世界遺産。"},
        "⛰️ エトナ火山":{min:30,avg:60,max:150,trend:"+10%",reason:"エトナ火山ツアー：30〜150€。ロープウェイ50€。4WDで山頂近くまで。"},
        "🏖️ タオルミーナ":{min:0,avg:0,max:0,trend:"±0%",reason:"タオルミーナ：散策無料。崖の上の絶景リゾート。ギリシャ劇場が有名。"},
        "🏛️ シラクーザ":{min:13.5,avg:17,max:17,trend:"+8%",reason:"ネアポリス考古学公園：17€。ギリシャ劇場・ローマ円形闘技場・ディオニュシオの耳。"},
        "🏛️ パレルモ大聖堂":{min:0,avg:7,max:15,trend:"+10%",reason:"パレルモ大聖堂：内部無料、屋上・宝物殿7〜15€。アラブ・ノルマン様式。"},
        "🏘️ チェファル":{min:0,avg:0,max:0,trend:"±0%",reason:"チェファル：散策無料。シチリア北部の美しい中世の漁村。"},
        "🏰 ノルマン王宮":{min:15,avg:19,max:19,trend:"+8%",reason:"ノルマン王宮：19€。パラティーナ礼拝堂込み。ビザンチン・モザイクの傑作。"},
        "🏛️ モンレアーレ大聖堂":{min:5,avg:7,max:15,trend:"+10%",reason:"モンレアーレ大聖堂：本堂7€、屋上・回廊15€。世界最大のビザンチン・モザイク。"},
        "🏖️ サン・ヴィート・ロ・カーポ":{min:0,avg:0,max:0,trend:"±0%",reason:"サン・ヴィート・ロ・カーポ：入場無料。シチリア西部の白砂ビーチ。"},
        "🏘️ ノート":{min:0,avg:0,max:0,trend:"±0%",reason:"ノート：散策無料・世界遺産。シチリア・バロック建築の宝石箱。"},
        "🍝 パスタ・アッラ・ノルマ":{min:10,avg:15,max:25,trend:"+10%",reason:"パスタ・アッラ・ノルマ：10〜25€。ナスとリコッタ・サラータのカターニア名物。"},
        "🍰 カンノーリ":{min:2.5,avg:5,max:10,trend:"+10%",reason:"カンノーリ：1個2.5〜10€。シチリア代表スイーツ。リコッタクリーム入り。"},
        "🍦 グラニタ":{min:2.5,avg:5,max:10,trend:"+10%",reason:"グラニタ：2.5〜10€。シャーベット状のシチリア朝食。ブリオッシュと一緒に。"},
        "🍕 シチリア風ピザ":{min:5,avg:10,max:18,trend:"+10%",reason:"シチリア風ピザ（スフィンチョーネ）：5〜18€。厚生地のフォカッチャ風ピザ。"},
        "🐟 シーフード":{min:25,avg:50,max:120,trend:"+12%",reason:"シチリアシーフード：25〜120€。マグロ・カジキマグロが特産。"},
        "🍢 アランチーニ":{min:2,avg:4,max:8,trend:"+10%",reason:"アランチーニ：1個2〜8€。サフランライスのコロッケ。シチリアのソウルフード。"},
        "🍰 カッサータ":{min:4,avg:7,max:15,trend:"+10%",reason:"カッサータ・シチリアーナ：4〜15€。リコッタクリームとマジパンの伝統菓子。"},
        "🍷 マルサラ酒":{min:5,avg:12,max:35,trend:"+10%",reason:"マルサラ酒：グラス5〜12€、ボトル15〜35€。シチリア西部の酒精強化ワイン。"},
      },
      ボローニャ:{
        "🗼 アジネッリの塔":{min:5,avg:5,max:5,trend:"+8%",reason:"アジネッリの塔：5€（要予約）。498段の階段。ボローニャのシンボル。"},
        "🏛️ マッジョーレ広場":{min:0,avg:0,max:0,trend:"±0%",reason:"マッジョーレ広場：散策無料。ボローニャの中心。サン・ペトロニオ大聖堂前。"},
        "⛪ サン・ペトロニオ大聖堂":{min:0,avg:0,max:5,trend:"±0%",reason:"サン・ペトロニオ大聖堂：内部無料、屋上テラス5€。世界5番目に大きい教会。"},
        "🏛️ ボローニャ大学":{min:0,avg:0,max:3,trend:"±0%",reason:"ボローニャ大学（アルキジンナージオ）：見学無料、解剖学劇場3€。世界最古の大学（1088年）。"},
        "🛍️ クアドリラテロ市場":{min:0,avg:0,max:0,trend:"±0%",reason:"クアドリラテロ市場：散策無料。中世から続く食の市場。ボローニャ食文化の中心。"},
        "⛪ サント・ステファノ教会":{min:0,avg:0,max:0,trend:"±0%",reason:"サント・ステファノ（七教会複合体）：参拝無料。古代から続くロマネスク様式。"},
        "🏛️ ボローニャ国立美術館":{min:8,avg:8,max:8,trend:"+8%",reason:"ピナコテーカ・ナツィオナーレ：8€。ラファエロ・カラッチの傑作。"},
        "🏛️ ネプチューン噴水":{min:0,avg:0,max:0,trend:"±0%",reason:"ネプチューン噴水：見学無料。ジャンボローニャ作の16世紀傑作。"},
        "🚂 フェラーリ博物館(マラネッロ)":{min:27,avg:32,max:60,trend:"+10%",reason:"フェラーリ博物館（マラネッロ）：27€、F1コースガイド付き60€。ボローニャから日帰り。"},
        "🏰 アックルシオ宮殿":{min:0,avg:5,max:8,trend:"±0%",reason:"パラッツォ・アックルシオ：見学無料、美術館5〜8€。ボローニャ市庁舎。"},
        "🍝 タリアテッレ・ラグー(ボロネーゼ発祥)":{min:12,avg:18,max:30,trend:"+10%",reason:"タリアテッレ・アル・ラグー：12〜30€。ボローニャ発祥（ミートソース・スパゲッティではない）。"},
        "🥩 モルタデッラ":{min:3,avg:8,max:20,trend:"+8%",reason:"モルタデッラ：100g 3〜20€。ボローニャ発祥のソーセージ。クアドリラテロで購入可。"},
        "🧀 パルミジャーノ":{min:5,avg:12,max:30,trend:"+8%",reason:"パルミジャーノ・レッジャーノ：100g 5〜30€（熟成年数別）。エミリア・ロマーニャ州特産。"},
        "🥩 生ハム(プロシュート)":{min:5,avg:15,max:40,trend:"+10%",reason:"プロシュート・ディ・パルマ：100g 5〜40€。エミリア州特産の生ハム。"},
        "🍝 トルテリーニ":{min:14,avg:20,max:35,trend:"+10%",reason:"トルテリーニ・イン・ブロード：14〜35€。指輪状のパスタを肉スープで。"},
        "🍷 ランブルスコ":{min:4,avg:8,max:25,trend:"+10%",reason:"ランブルスコ：グラス4〜10€、ボトル10〜25€。エミリア州の微発泡赤ワイン。"},
        "🥖 ピアディーナ":{min:3,avg:6,max:12,trend:"+10%",reason:"ピアディーナ：3〜12€。エミリア・ロマーニャ州の薄焼きパン。サンドイッチで人気。"},
        "🍦 ジェラート":{min:3,avg:5,max:10,trend:"+10%",reason:"ボローニャのジェラート：3〜10€。ボッテガ・ポルテッロなどの名店。"},
      },
      トリノ:{
        "⛪ トリノ大聖堂(聖骸布)":{min:0,avg:0,max:0,trend:"±0%",reason:"トリノ大聖堂：入場無料。聖骸布の複製公開（本物は特別公開時のみ）。"},
        "🏰 マダマ宮殿":{min:12,avg:15,max:15,trend:"+8%",reason:"パラッツォ・マダマ：12〜15€。市立古代美術館。世界遺産サヴォイア家王宮群の一部。"},
        "🏛️ エジプト博物館":{min:15,avg:18,max:18,trend:"+8%",reason:"エジプト博物館：18€。カイロに次ぐ世界2位の規模。3万点超の収蔵。"},
        "🏰 王宮(パラッツォ・レアーレ)":{min:15,avg:15,max:15,trend:"+8%",reason:"トリノ王宮：15€。サヴォイア家王宮。世界遺産。"},
        "🏛️ モーレ・アントネリアーナ":{min:11,avg:17,max:21,trend:"+8%",reason:"モーレ・アントネリアーナ：パノラマ展望11€、映画博物館込み17〜21€。"},
        "🎬 国立映画博物館":{min:11,avg:17,max:21,trend:"+8%",reason:"国立映画博物館：11〜21€。ヨーロッパ最大の映画博物館。"},
        "🏛️ サバウダ美術館":{min:15,avg:15,max:15,trend:"+8%",reason:"ガッレリア・サバウダ：15€。王家のコレクション。"},
        "🏰 ヴァレンティーノ城":{min:0,avg:0,max:0,trend:"±0%",reason:"ヴァレンティーノ城：見学無料（外観のみ）。ポー川沿いの17世紀宮殿。"},
        "🚗 国立自動車博物館":{min:12,avg:15,max:15,trend:"+8%",reason:"国立自動車博物館：15€。フィアット・ランチアの故郷トリノならではの博物館。"},
        "🛍️ ポルタ・パラッツォ市場":{min:0,avg:0,max:0,trend:"±0%",reason:"ポルタ・パラッツォ市場：散策無料。ヨーロッパ最大級の屋外市場（土曜）。"},
        "🍫 ジャンドゥーヤ":{min:5,avg:10,max:30,trend:"+10%",reason:"ジャンドゥーヤ・チョコレート：100g 5〜30€。ヘーゼルナッツとチョコの絶妙な組み合わせ。"},
        "☕ ビチェリン":{min:5,avg:7,max:12,trend:"+10%",reason:"ビチェリン：5〜12€。エスプレッソ・チョコ・ミルクの3層ドリンク。トリノ発祥。"},
        "🥩 ビテッロ・トンナート":{min:15,avg:22,max:35,trend:"+10%",reason:"ヴィテッロ・トンナート：15〜35€。仔牛肉のツナソースがけ。ピエモンテ名物。"},
        "🍝 アニョロッティ":{min:14,avg:20,max:35,trend:"+10%",reason:"アニョロッティ・デル・プリン：14〜35€。ピエモンテ風の小型ラビオリ。"},
        "🍷 バローロ":{min:10,avg:25,max:200,trend:"+10%",reason:"バローロ：グラス10〜25€、ボトル40〜200€。「ワインの王様」と呼ばれる赤。"},
        "🍷 バルバレスコ":{min:8,avg:20,max:150,trend:"+10%",reason:"バルバレスコ：グラス8〜20€、ボトル30〜150€。バローロの妹分。"},
        "🧀 トマ・ピエモンテーゼ":{min:5,avg:12,max:25,trend:"+8%",reason:"トマ・ピエモンテーゼ：100g 5〜25€。ピエモンテのアルプス山岳チーズ。"},
        "🍦 ジェラート":{min:3,avg:5,max:10,trend:"+10%",reason:"トリノのジェラート：3〜10€。ジャンドゥーヤフレーバーが必食。"},
      },
      パレルモ:{
        "⛪ パレルモ大聖堂":{min:0,avg:7,max:15,trend:"+10%",reason:"パレルモ大聖堂：内部無料、屋上・宝物殿7〜15€。アラブ・ノルマン様式。"},
        "🏰 ノルマン王宮":{min:15,avg:19,max:19,trend:"+8%",reason:"ノルマン王宮：19€（パラティーナ礼拝堂込み）。世界遺産。"},
        "🏛️ パラティーナ礼拝堂":{min:15,avg:19,max:19,trend:"+8%",reason:"パラティーナ礼拝堂：ノルマン王宮入場料19€に含まれる。ビザンチンモザイクの最高傑作。"},
        "🏛️ モンレアーレ大聖堂":{min:5,avg:7,max:15,trend:"+10%",reason:"モンレアーレ大聖堂：本堂7€、屋上・回廊15€。パレルモ郊外。世界最大級のモザイク。"},
        "🏛️ クアトロ・カンティ":{min:0,avg:0,max:0,trend:"±0%",reason:"クアトロ・カンティ：見学無料。パレルモ旧市街の四つ辻。バロック装飾。"},
        "🏛️ プレトリア広場":{min:0,avg:0,max:0,trend:"±0%",reason:"プレトリア広場：見学無料。「恥の噴水」と呼ばれる裸像噴水で有名。"},
        "🛍️ ヴッチリア市場":{min:0,avg:0,max:0,trend:"±0%",reason:"ヴッチリア市場：散策無料。パレルモ最古の市場。シチリア食文化の発信地。"},
        "🛍️ バッラロ市場":{min:0,avg:0,max:0,trend:"±0%",reason:"バッラロ市場：散策無料。パレルモ最大規模の市場。屋台フード豊富。"},
        "🏛️ マッシモ劇場":{min:10,avg:12,max:15,trend:"+8%",reason:"テアトロ・マッシモ：見学ツアー12€、オペラ公演30€〜。イタリア最大のオペラハウス。"},
        "🏰 ジサ城":{min:6,avg:6,max:6,trend:"+8%",reason:"ジサ城：6€。アラブ・ノルマン様式の12世紀の宮殿。世界遺産。"},
        "🍢 アランチーニ":{min:2,avg:4,max:8,trend:"+10%",reason:"アランチーニ：1個2〜8€。サフランライスのコロッケ。パレルモ屋台の王様。"},
        "🍰 カンノーリ":{min:2.5,avg:5,max:10,trend:"+10%",reason:"カンノーリ：1個2.5〜10€。シチリア代表スイーツ。"},
        "🍦 グラニタ":{min:2.5,avg:5,max:10,trend:"+10%",reason:"グラニタ：2.5〜10€。レモン・コーヒー・アーモンドが定番。"},
        "🥖 パーニ・カ・ムエウサ":{min:3,avg:5,max:8,trend:"+10%",reason:"パーニ・カ・ムエウサ：3〜8€。仔牛の脾臓と肺のサンドイッチ。パレルモのB級グルメ。"},
        "🍝 パスタ・コン・サルデ":{min:10,avg:15,max:25,trend:"+10%",reason:"パスタ・コン・レ・サルデ：10〜25€。イワシ・フェンネル・松の実のパレルモ名物。"},
        "🐟 シーフード":{min:25,avg:50,max:120,trend:"+12%",reason:"パレルモシーフード：25〜120€。マグロ・カジキマグロ・タコの新鮮料理。"},
        "🍷 マルサラ酒":{min:5,avg:12,max:35,trend:"+10%",reason:"マルサラ酒：グラス5〜12€、ボトル15〜35€。シチリア西部の酒精強化ワイン。"},
        "🥖 シチリアパン":{min:1,avg:3,max:8,trend:"+8%",reason:"シチリアパン：1〜8€。ゴマ入りパン（パーネ・カ・グレーヌ）が伝統。"},
      },
    },
  },
  フランス:{
    food:{
      "🏪 コンビニ":{min:3,avg:8,max:20,trend:"+8%",reason:"カフェ・ベーカリー軽食3〜20€。"},
      "🍢 屋台":{min:5,avg:12,max:25,trend:"+10%",reason:"クレープ・サンドイッチ5〜25€。"},
      "🍜 ローカル食堂":{min:12,avg:22,max:40,trend:"+8%",reason:"ビストロ・ブラッスリー12〜40€。"},
      "🍣 チェーン":{min:8,avg:15,max:30,trend:"+8%",reason:"ファストフード8〜30€。"},
      "🍽️ カジュアル":{min:20,avg:40,max:70,trend:"+10%",reason:"カジュアルレストラン20〜70€/人。"},
      "🥂 中級":{min:50,avg:90,max:150,trend:"+10%",reason:"中級レストラン50〜150€/人。"},
      "🥩 高級":{min:100,avg:200,max:400,trend:"+10%",reason:"高級レストラン100〜400€/人。"},
      "👑 超高級":{min:300,avg:500,max:1500,trend:"+12%",reason:"ミシュラン三つ星300〜1500€/人。"},
      "🌅 朝食":{min:3,avg:10,max:30,trend:"+8%",reason:"カフェ朝食3〜30€。"},
      "☀️ ランチ":{min:15,avg:30,max:60,trend:"+10%",reason:"ランチセット15〜60€。"},
      "🌆 ディナー":{min:30,avg:60,max:150,trend:"+10%",reason:"ディナー30〜150€/人。"},
      "🍱 テイクアウト":{min:5,avg:12,max:25,trend:"+10%",reason:"テイクアウト5〜25€。"},
      "☕ カフェ軽食":{min:5,avg:12,max:25,trend:"+8%",reason:"カフェ軽食5〜25€。"},
      "🌙 夜食":{min:8,avg:18,max:40,trend:"+10%",reason:"夜食5〜40€。"},
    },
    drink:{
      "🥤 ペットボトル水":{min:1,avg:2,max:4,trend:"+8%",reason:"水500ml 1〜4€。"},
      "🥤 ソフトドリンク":{min:3,avg:4,max:6,trend:"+8%",reason:"コーラ・ジュース3〜6€。"},
      "☕ コーヒー":{min:1.5,avg:3,max:6,trend:"+8%",reason:"エスプレッソ1.5〜3€、テラス4〜6€。"},
      "🍵 紅茶":{min:3,avg:5,max:8,trend:"+8%",reason:"紅茶3〜8€。"},
      "🧃 ジュース":{min:3,avg:5,max:8,trend:"+8%",reason:"ジュース3〜8€。"},
      "🍺 ビール":{min:4,avg:7,max:12,trend:"+10%",reason:"ビール4〜12€。"},
      "🍷 ワイン":{min:4,avg:10,max:30,trend:"+10%",reason:"グラスワイン4〜10€、ボトル20〜50€。"},
      "🍹 カクテル":{min:10,avg:15,max:25,trend:"+10%",reason:"カクテル10〜25€。"},
      "🥛 牛乳":{min:1,avg:2,max:3,trend:"+8%",reason:"牛乳1L 1〜3€。"},
      "🍶 リキュール":{min:5,avg:10,max:20,trend:"+10%",reason:"リキュール5〜20€/杯。"},
    },
    taxi:{
      "🚖 短距離":{min:10,avg:18,max:30,trend:"+10%",reason:"市内短距離10〜30€。"},
      "🚖 中距離":{min:20,avg:35,max:60,trend:"+10%",reason:"市内中距離20〜60€。"},
      "🚖 長距離":{min:50,avg:90,max:200,trend:"+10%",reason:"長距離50〜200€。"},
      "✈️ 空港":{min:50,avg:65,max:80,trend:"+10%",reason:"CDG空港〜パリ市内：右岸56€・左岸65€（定額）。"},
      "🌙 深夜":{min:15,avg:30,max:80,trend:"+15%",reason:"深夜割増+5〜15€。"},
      "🚗 配車アプリ":{min:10,avg:25,max:50,trend:"+10%",reason:"Uber・Bolt利用可能。"},
    },
    hotel:{
      "🏨 格安ホステル":{min:30,avg:60,max:120,trend:"+10%",reason:"ホステル・B&B30〜120€/泊。"},
      "🏨 3つ星":{min:100,avg:180,max:300,trend:"+12%",reason:"3つ星100〜300€/泊。"},
      "🏨 4つ星":{min:200,avg:350,max:600,trend:"+12%",reason:"4つ星200〜600€/泊。"},
      "🏨 5つ星":{min:400,avg:800,max:2500,trend:"+15%",reason:"5つ星ラグジュアリー400〜2500€/泊。"},
      "🏠 民泊・Airbnb":{min:50,avg:120,max:300,trend:"+12%",reason:"Airbnb50〜300€/泊。"},
    },
    shopping:{
      "👕 衣料":{min:30,avg:100,max:1000,trend:"+8%",reason:"パリブランド30〜1000€。シャネル・LV等。"},
      "💄 コスメ":{min:15,avg:50,max:200,trend:"+8%",reason:"パリコスメ15〜200€。"},
      "🛒 スーパー":{min:1,avg:6,max:30,trend:"+8%",reason:"スーパー1〜30€。"},
      "🎁 おみやげ":{min:5,avg:25,max:100,trend:"+10%",reason:"ワイン・チーズ・マカロン5〜100€。"},
      "💻 家電":{min:30,avg:250,max:2500,trend:"+8%",reason:"家電30〜2500€。"},
    },
    activity:{
      "🏛️ 観光入場":{min:5,avg:20,max:35,trend:"+10%",reason:"ルーブル22€、ヴェルサイユ宮殿21€、エッフェル塔29€。"},
      "🤿 アクティビティ":{min:30,avg:80,max:300,trend:"+10%",reason:"アクティビティ30〜300€。"},
      "💆 マッサージ":{min:50,avg:100,max:250,trend:"+10%",reason:"スパ50〜250€/時。"},
      "🎭 エンタメ":{min:30,avg:100,max:300,trend:"+10%",reason:"オペラ・ムーランルージュ30〜300€。"},
      "🚌 ツアー":{min:30,avg:80,max:250,trend:"+10%",reason:"日帰りツアー30〜250€。"},
    },
    famous:{
      パリ:{
        "🗼 エッフェル塔":{min:14,avg:29,max:50,trend:"+12%",reason:"エッフェル塔：2階まで階段14€、エレベーター26€、頂上展望29€、優先入場50€。"},
        "🏛️ ルーブル美術館":{min:22,avg:32,max:32,trend:"+45%",reason:"ルーブル美術館：2026年1月14日からEEA圏外32€（旧22€から大幅値上げ）。世界最大美術館。"},
        "🏰 ヴェルサイユ宮殿":{min:21,avg:35,max:35,trend:"+67%",reason:"ヴェルサイユ宮殿：2026年1月14日からEEA圏外35€（旧21€）。鏡の間が圧巻。"},
        "🎖️ 凱旋門":{min:13,avg:16,max:16,trend:"+23%",reason:"凱旋門：16€（2024年に13€から値上げ）。屋上からシャンゼリゼ大通り絶景。"},
        "⛪ ノートルダム大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"ノートルダム大聖堂：入場無料（2024年12月再開）。火災から5年で復活。"},
        "🎨 オルセー美術館":{min:16,avg:16,max:22,trend:"+5%",reason:"オルセー美術館：16€、ガイド付き22€。印象派の宝庫。モネ・ルノワール・ゴッホ。"},
        "🌳 モンマルトル":{min:0,avg:0,max:0,trend:"±0%",reason:"モンマルトル：散策無料。芸術家の街。テルトル広場で似顔絵30〜60€。"},
        "💒 サクレクール寺院":{min:0,avg:8,max:8,trend:"±0%",reason:"サクレクール寺院：入場無料、ドーム登頂8€。モンマルトルの白亜の寺院。"},
        "🌊 セーヌ川クルーズ":{min:15,avg:18,max:60,trend:"+10%",reason:"セーヌ川クルーズ：1時間15〜25€、ディナークルーズ60〜120€。"},
        "🛍️ シャンゼリゼ通り":{min:0,avg:0,max:0,trend:"±0%",reason:"シャンゼリゼ通り：散策無料。LV・カルティエ・ルイ・ヴィトン本店。世界一美しい大通り。"},
        "🥐 クロワッサン":{min:1.5,avg:2.5,max:5,trend:"+10%",reason:"クロワッサン：1.5〜5€。パン屋（ブーランジェリー）の朝食定番。"},
        "🥖 バゲット":{min:1.2,avg:1.8,max:3,trend:"+10%",reason:"バゲット：1.2〜3€。フランスのソウルフード。法律で価格が規制されている。"},
        "🍰 マカロン":{min:2.5,avg:3.5,max:6,trend:"+10%",reason:"マカロン：1個2.5〜6€。ラデュレ・ピエール・エルメが名店。"},
        "🍷 ボルドーワイン":{min:6,avg:15,max:200,trend:"+10%",reason:"ボルドーワイン：グラス6〜20€、ボトル20〜200€（高級は1000€超）。"},
        "🧀 カマンベール":{min:5,avg:10,max:20,trend:"+8%",reason:"カマンベール：1個5〜20€。AOPノルマンディー産が本物。"},
        "🥩 ステーキフリット":{min:18,avg:28,max:50,trend:"+10%",reason:"ステーキ・フリット：18〜50€。フランスの定番ビストロ料理。"},
        "🐌 エスカルゴ":{min:12,avg:18,max:35,trend:"+10%",reason:"エスカルゴ・ブルゴーニュ：6個12〜35€。ガーリックバターが定番。"},
        "🍰 オペラケーキ":{min:5,avg:8,max:15,trend:"+10%",reason:"オペラケーキ：5〜15€。コーヒー・チョコの層が美しいパリ伝統菓子。"},
      },
      ニース:{
        "🏖️ プロムナード・デ・ザングレ":{min:0,avg:0,max:0,trend:"±0%",reason:"プロムナード・デ・ザングレ：散策無料。地中海沿岸の絶景遊歩道。世界遺産。"},
        "🌊 ニース旧市街":{min:0,avg:0,max:0,trend:"±0%",reason:"ニース旧市街（Vieux Nice）：散策無料。中世の街並み。マルシェやレストラン充実。"},
        "🌸 マセナ広場":{min:0,avg:0,max:0,trend:"±0%",reason:"マセナ広場：見学無料。ニースの中心広場。チェッカー模様の床が特徴。"},
        "🌹 城跡公園":{min:0,avg:0,max:0,trend:"±0%",reason:"城跡公園（コリーヌ・デュ・シャトー）：入場無料。ニース全景の絶景。エレベーター1.6€。"},
        "🎨 マティス美術館":{min:10,avg:10,max:10,trend:"+8%",reason:"マティス美術館：10€。マティスの作品コレクション。"},
        "🎨 シャガール美術館":{min:10,avg:10,max:10,trend:"+8%",reason:"国立シャガール美術館：10€。聖書のメッセージ連作で有名。"},
        "⛪ ロシア正教会":{min:3,avg:3,max:3,trend:"+8%",reason:"サン・ニコラ・ロシア正教会：3€。ロシア国外最大の正教会。"},
        "🛍️ サレヤ広場マルシェ":{min:0,avg:0,max:0,trend:"±0%",reason:"サレヤ広場マルシェ：散策無料。花市場・食品市場。月曜は骨董市。"},
        "🌊 天使湾":{min:0,avg:0,max:0,trend:"±0%",reason:"天使湾（Baie des Anges）：散策無料。ニースのトレードマーク。"},
        "🏰 ヴィル城":{min:10,avg:10,max:10,trend:"+8%",reason:"ヴィッラ・マセナ：10€。19世紀の貴族邸宅。"},
        "🥗 ニサルダサラダ":{min:12,avg:18,max:28,trend:"+10%",reason:"サラダ・ニサルダ：12〜28€。ツナ・ゆで卵・アンチョビ・オリーブのプロヴァンサル。"},
        "🥖 ソッカ":{min:3,avg:5,max:8,trend:"+10%",reason:"ソッカ：3〜8€。ひよこ豆粉のクレープ。ニースのB級グルメ。"},
        "🐟 ブイヤベース":{min:35,avg:55,max:90,trend:"+10%",reason:"ブイヤベース：35〜90€。プロヴァンサルの魚スープ。"},
        "🐟 シーフード":{min:25,avg:50,max:120,trend:"+10%",reason:"地中海シーフード：25〜120€。新鮮な魚介。"},
        "🍦 グラス・ファブリーヌ":{min:3,avg:5,max:10,trend:"+10%",reason:"フェノキオ・ジェラート：3〜10€。94種類のフレーバー。ニース定番。"},
        "🍷 ローズワイン":{min:5,avg:10,max:30,trend:"+10%",reason:"プロヴァンス・ロゼ：グラス5〜10€、ボトル15〜30€。"},
        "🍰 タルトトロペジエンヌ":{min:4,avg:7,max:12,trend:"+10%",reason:"タルト・トロペジエンヌ：4〜12€。サントロペ発祥のクリームブリオッシュ。"},
        "🥖 ピサラディエール":{min:3,avg:6,max:12,trend:"+10%",reason:"ピサラディエール：3〜12€。玉ねぎ・アンチョビのニース風ピザ。"},
      },
      リヨン:{
        "⛪ ノートルダム・ド・フルヴィエール":{min:0,avg:0,max:0,trend:"±0%",reason:"フルヴィエール大聖堂：入場無料。リヨンの丘の上の白亜のバジリカ。"},
        "🏛️ リヨン旧市街":{min:0,avg:0,max:0,trend:"±0%",reason:"リヨン旧市街（Vieux Lyon）：散策無料・世界遺産。ルネサンス建築の宝庫。"},
        "🎭 ギニョール劇場":{min:10,avg:15,max:20,trend:"+10%",reason:"ギニョール劇場：10〜20€。リヨン発祥の操り人形劇。"},
        "🛍️ レ・アル・ポール・ボキューズ":{min:0,avg:0,max:0,trend:"±0%",reason:"ポール・ボキューズ市場：散策無料。リヨンの食の聖地。フランス料理の巨匠の名を冠する。"},
        "🌉 ベルクール広場":{min:0,avg:0,max:0,trend:"±0%",reason:"ベルクール広場：見学無料。リヨンの中心。ヨーロッパ最大級の歩行者広場。"},
        "🏛️ リヨン美術館":{min:9,avg:9,max:12,trend:"+8%",reason:"リヨン美術館：9〜12€。フランス第2の規模。ルーブルに次ぐコレクション。"},
        "🌹 テット・ドール公園":{min:0,avg:0,max:0,trend:"±0%",reason:"テット・ドール公園：入園無料。動物園・植物園・湖を備えるリヨン最大の公園。"},
        "🎬 リュミエール博物館":{min:9,avg:9,max:9,trend:"+8%",reason:"リュミエール博物館：9€。映画発明者リュミエール兄弟の生家。"},
        "⛪ サン・ジャン大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"サン・ジャン大聖堂：入場無料。リヨン旧市街の象徴。天文時計が見もの。"},
        "🏘️ トラブール":{min:0,avg:0,max:0,trend:"±0%",reason:"トラブール：散策無料。建物を抜ける秘密の小路。絹織物職人が使った歴史的通路。"},
        "🍲 リヨン風サラダ":{min:10,avg:15,max:25,trend:"+10%",reason:"サラダ・リヨネーズ：10〜25€。ベーコン・卵・クルトン・フリゼ。"},
        "🥩 アンドゥイエット":{min:14,avg:22,max:35,trend:"+10%",reason:"アンドゥイエット：14〜35€。豚の腸詰めソーセージ。リヨン名物。"},
        "🥘 クネル":{min:14,avg:20,max:35,trend:"+10%",reason:"クネル・ド・ブロシェ：14〜35€。カマス（魚）のすり身団子。"},
        "🍲 ブション料理":{min:18,avg:30,max:60,trend:"+10%",reason:"ブション（リヨン伝統居酒屋）：コース18〜60€。豚足・モツ料理など。"},
        "🧀 セルヴェル・ド・カニュ":{min:6,avg:10,max:18,trend:"+10%",reason:"セルヴェル・ド・カニュ：6〜18€。フロマージュ・ブランとハーブのリヨン名物。"},
        "🍷 ボージョレー":{min:5,avg:10,max:30,trend:"+10%",reason:"ボージョレーワイン：グラス5〜10€、ボトル15〜30€。リヨン南部の銘酒。"},
        "🍰 タルト・プラリネ":{min:4,avg:7,max:12,trend:"+10%",reason:"タルト・プラリネ：4〜12€。リヨン発祥のピンク色のアーモンドタルト。"},
        "🍫 ベルナション":{min:8,avg:15,max:50,trend:"+10%",reason:"ベルナション・チョコレート：100g 8〜50€。リヨン発祥の高級ショコラティエ。"},
      },
      マルセイユ:{
        "⛪ ノートルダム・ド・ラ・ガルド":{min:0,avg:0,max:0,trend:"±0%",reason:"ノートルダム・ド・ラ・ガルド：入場無料。マルセイユの守護聖堂。市内一望。"},
        "🏰 マルセイユ旧港":{min:0,avg:0,max:0,trend:"±0%",reason:"マルセイユ旧港（Vieux Port）：散策無料。2600年の歴史を持つ港。"},
        "🏛️ MuCEM(欧州地中海文明博物館)":{min:11,avg:11,max:11,trend:"+8%",reason:"MuCEM：11€。地中海文明博物館。建築自体がアート。"},
        "🏰 イフ島":{min:6,avg:6,max:10,trend:"+10%",reason:"イフ島：船賃往復11€、入場6€。「モンテ・クリスト伯」の舞台。"},
        "🌊 カランク国立公園":{min:0,avg:30,max:90,trend:"+10%",reason:"カランク国立公園：入園無料、ボートツアー30〜90€。石灰岩の入り江群。"},
        "⛪ マルセイユ大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"マルセイユ大聖堂：入場無料。ビザンチン・ロマネスク様式の壮大な大聖堂。"},
        "🎨 ロンシャン宮":{min:0,avg:0,max:8,trend:"±0%",reason:"ロンシャン宮：散策無料、美術館8€。19世紀の壮麗な宮殿。"},
        "🛍️ ノアイユ市場":{min:0,avg:0,max:0,trend:"±0%",reason:"ノアイユ市場：散策無料。北アフリカ食材・スパイスの市場。マルセイユの多文化を体感。"},
        "🏘️ パニエ地区":{min:0,avg:0,max:0,trend:"±0%",reason:"パニエ地区：散策無料。マルセイユ最古の地区。ストリートアートが有名。"},
        "🌅 コルニッシュ":{min:0,avg:0,max:0,trend:"±0%",reason:"コルニッシュ：散策無料。地中海沿いの絶景ドライブコース。"},
        "🐟 ブイヤベース":{min:40,avg:60,max:120,trend:"+10%",reason:"ブイヤベース・マルセイエーズ：40〜120€。マルセイユ発祥の魚介スープ。"},
        "🥖 パスティス":{min:4,avg:7,max:12,trend:"+10%",reason:"パスティス：4〜12€/杯。アニス風味の食前酒。マルセイユ・プロヴァンス定番。"},
        "🐟 シーフード":{min:25,avg:50,max:120,trend:"+10%",reason:"地中海シーフード：25〜120€。"},
        "🐙 タコのプロヴァンサル":{min:18,avg:28,max:45,trend:"+10%",reason:"プルポ・プロヴァンサル：18〜45€。トマト・ハーブで煮込んだタコ料理。"},
        "🍰 ナヴェット":{min:3,avg:5,max:10,trend:"+10%",reason:"ナヴェット：3〜10€。マルセイユ発祥の船形のオレンジフラワー風味ビスケット。"},
        "🍷 プロヴァンスワイン":{min:5,avg:10,max:30,trend:"+10%",reason:"プロヴァンス・ロゼ：グラス5〜10€、ボトル15〜30€。"},
        "🧀 山羊チーズ":{min:6,avg:12,max:25,trend:"+8%",reason:"プロヴァンス山羊チーズ：100g 6〜25€。"},
        "🌿 ハーブ・ド・プロヴァンス":{min:5,avg:10,max:25,trend:"+8%",reason:"ハーブ・ド・プロヴァンス：50g 5〜25€。タイム・ローズマリー・ラベンダー等のミックス。"},
      },
      ボルドー:{
        "🍷 ラ・シテ・デュ・ヴァン":{min:22,avg:22,max:30,trend:"+8%",reason:"ラ・シテ・デュ・ヴァン：22€（試飲込み）。ボルドー新名所のワインテーマパーク。"},
        "⛪ サン・タンドレ大聖堂":{min:0,avg:0,max:6,trend:"±0%",reason:"サン・タンドレ大聖堂：入場無料、塔登頂6€。世界遺産。"},
        "🏛️ ガロンヌ川":{min:0,avg:0,max:0,trend:"±0%",reason:"ガロンヌ川：散策無料。世界遺産のボルドー河岸。"},
        "🌊 水鏡":{min:0,avg:0,max:0,trend:"±0%",reason:"水鏡（Miroir d'Eau）：見学無料。ブルス広場前の世界最大の水鏡。"},
        "🏛️ ボルドー美術館":{min:0,avg:0,max:0,trend:"±0%",reason:"ボルドー美術館：入場無料（特別展は別途）。"},
        "🌳 公共庭園":{min:0,avg:0,max:0,trend:"±0%",reason:"ジャルダン・ピュブリック：入園無料。18世紀の英国式庭園。"},
        "🎭 ボルドー大劇場":{min:5,avg:30,max:120,trend:"+10%",reason:"グラン・テアトル：見学ツアー5〜10€、オペラ30〜120€。18世紀ネオクラシック様式。"},
        "🍷 サンテミリオン(郊外)":{min:30,avg:60,max:150,trend:"+10%",reason:"サンテミリオン：日帰りワインツアー30〜150€。世界遺産の中世ワイン村。"},
        "🏰 メドック地方ワインシャトー":{min:50,avg:100,max:300,trend:"+10%",reason:"メドックシャトー見学：50〜300€。マルゴー・ラフィット等の名門5大シャトー。"},
        "🛍️ サン・カトリーヌ通り":{min:0,avg:0,max:0,trend:"±0%",reason:"サン・カトリーヌ通り：散策無料。ヨーロッパ最長の歩行者天国（1.2km）。"},
        "🍷 ボルドーワイン":{min:6,avg:18,max:300,trend:"+10%",reason:"ボルドーワイン：グラス6〜30€、ボトル20〜300€（プレミアム1000€超）。"},
        "🥖 カヌレ":{min:2,avg:4,max:8,trend:"+10%",reason:"カヌレ・ド・ボルドー：1個2〜8€。バニラ・ラム酒風味のミニ焼き菓子。"},
        "🦪 アルカションの牡蠣":{min:12,avg:20,max:40,trend:"+10%",reason:"アルカション牡蠣：6個12〜40€。ボルドー近郊の名産。"},
        "🥩 アントルコート":{min:22,avg:35,max:60,trend:"+10%",reason:"アントルコート・ボルドレーズ：22〜60€。赤ワイン・骨髄ソース牛ステーキ。"},
        "🍰 ボルドー菓子":{min:3,avg:8,max:20,trend:"+10%",reason:"ボルドー伝統菓子：3〜20€。"},
        "🥚 オムレツ・サンテミリオネーズ":{min:14,avg:22,max:35,trend:"+10%",reason:"オムレツ・サンテミリオネーズ：14〜35€。トリュフ・フォアグラ入り高級オムレツ。"},
        "🐟 シーフード":{min:25,avg:50,max:100,trend:"+10%",reason:"大西洋シーフード：25〜100€。"},
        "🧀 フランスチーズ":{min:6,avg:15,max:40,trend:"+8%",reason:"チーズ盛り合わせ：6〜40€。"},
      },
      ストラスブール:{
        "⛪ ストラスブール大聖堂":{min:0,avg:0,max:8,trend:"±0%",reason:"ストラスブール大聖堂：入場無料、塔登頂8€。世界遺産。天文時計が有名。"},
        "🏘️ プティット・フランス":{min:0,avg:0,max:0,trend:"±0%",reason:"プティット・フランス：散策無料・世界遺産。中世の半木造建築の街並み。"},
        "🛶 イル川クルーズ":{min:14,avg:14,max:20,trend:"+8%",reason:"イル川クルーズ：14〜20€。70分。世界遺産の旧市街を巡る。"},
        "🏛️ 欧州議会":{min:0,avg:0,max:0,trend:"±0%",reason:"欧州議会：見学無料・要予約。EU政治の中心。"},
        "🛍️ クレベール広場":{min:0,avg:0,max:0,trend:"±0%",reason:"クレベール広場：散策無料。ストラスブールの中心広場。"},
        "🎄 クリスマスマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"ストラスブール・クリスマスマーケット：入場無料（11月末〜12月）。フランス最古。"},
        "⛪ サン・トマ教会":{min:0,avg:0,max:0,trend:"±0%",reason:"サン・トマ教会：入場無料。アルザス地方プロテスタント大聖堂。"},
        "🏛️ アルザス博物館":{min:7.5,avg:7.5,max:7.5,trend:"+8%",reason:"アルザス博物館：7.5€。アルザス地方の伝統文化。"},
        "🍻 ジビエ地区":{min:0,avg:0,max:0,trend:"±0%",reason:"ジビエ（鴨水路）地区：散策無料。プティット・フランスの中心。"},
        "🏛️ ロアン宮殿":{min:7.5,avg:14,max:14,trend:"+8%",reason:"ロアン宮殿：7.5€（個別）、3美術館共通券14€。"},
        "🥨 プレッツェル":{min:2,avg:3.5,max:6,trend:"+10%",reason:"アルザス・プレッツェル：1個2〜6€。塩・ゴマ・チーズ味。ビールと相性抜群。"},
        "🍲 シュークルート":{min:14,avg:22,max:35,trend:"+10%",reason:"シュークルート・アルザシエンヌ：14〜35€。発酵キャベツとソーセージ・肉のアルザス料理。"},
        "🍝 タルト・フランベ":{min:8,avg:12,max:20,trend:"+10%",reason:"タルト・フランベ：8〜20€。アルザス風ピザ。クリーム・ベーコン・玉ねぎ。"},
        "🍷 アルザスワイン":{min:4,avg:8,max:30,trend:"+10%",reason:"アルザスワイン：グラス4〜10€、ボトル15〜30€。リースリング・ゲヴュルツトラミネール。"},
        "🍻 アルザスビール":{min:4,avg:6,max:10,trend:"+10%",reason:"アルザスビール：4〜10€。クローネンブール発祥。"},
        "🍰 クグロフ":{min:5,avg:10,max:20,trend:"+10%",reason:"クグロフ：5〜20€。王冠型のアルザス伝統菓子。"},
        "🥧 ベッコフ":{min:14,avg:20,max:30,trend:"+10%",reason:"ベッコフ：14〜30€。3種の肉とジャガイモを陶器で煮込む。"},
        "🧀 ミュンスターチーズ":{min:6,avg:12,max:25,trend:"+8%",reason:"ミュンスターAOP：100g 6〜25€。アルザスの強烈な香りのウォッシュチーズ。"},
      },
      モンペリエ:{
        "🏛️ ペイルー広場":{min:0,avg:0,max:0,trend:"±0%",reason:"ペイルー広場：散策無料。モンペリエ旧市街の絶景スポット。"},
        "⛪ サン・ピエール大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"サン・ピエール大聖堂：入場無料。14世紀ゴシック様式。"},
        "🌳 植物園":{min:0,avg:0,max:0,trend:"±0%",reason:"モンペリエ植物園：入園無料。フランス最古の植物園（1593年）。"},
        "🎨 ファーブル美術館":{min:11,avg:11,max:11,trend:"+8%",reason:"ファーブル美術館：11€。南仏屈指のコレクション。"},
        "🛍️ コメディ広場":{min:0,avg:0,max:0,trend:"±0%",reason:"コメディ広場：散策無料。モンペリエの心臓部。三美神の噴水が有名。"},
        "🏰 凱旋門(モンペリエ)":{min:0,avg:0,max:0,trend:"±0%",reason:"モンペリエ凱旋門：見学無料。17世紀のルイ14世時代の凱旋門。"},
        "🏛️ アンティゴーヌ地区":{min:0,avg:0,max:0,trend:"±0%",reason:"アンティゴーヌ地区：散策無料。リカルド・ボフィル設計の壮大なポストモダン建築群。"},
        "🌊 パラヴァ・レ・フロ海岸":{min:0,avg:0,max:0,trend:"±0%",reason:"パラヴァ海岸：入場無料。モンペリエから20分の地中海ビーチ。"},
        "🏛️ 旧市街":{min:0,avg:0,max:0,trend:"±0%",reason:"モンペリエ旧市街：散策無料。中世の街並み。"},
        "🏘️ エキュッソン地区":{min:0,avg:0,max:0,trend:"±0%",reason:"エキュッソン地区：散策無料。モンペリエ歴史地区の中心。"},
        "🐌 エスカルゴ":{min:10,avg:15,max:28,trend:"+10%",reason:"エスカルゴ：6個10〜28€。"},
        "🐟 シーフード":{min:20,avg:40,max:90,trend:"+10%",reason:"地中海シーフード：20〜90€。"},
        "🥗 サラダ":{min:8,avg:14,max:25,trend:"+10%",reason:"南仏サラダ：8〜25€。"},
        "🍷 ラングドックワイン":{min:4,avg:8,max:25,trend:"+10%",reason:"ラングドック・ルシヨンワイン：グラス4〜10€、ボトル12〜25€。フランス最大のワイン産地。"},
        "🥖 ブリオッシュ":{min:2,avg:4,max:8,trend:"+10%",reason:"ブリオッシュ：2〜8€。"},
        "🧀 ロックフォール":{min:6,avg:15,max:35,trend:"+10%",reason:"ロックフォールAOP：100g 6〜35€。世界三大ブルーチーズ。"},
        "🦪 牡蠣":{min:10,avg:18,max:35,trend:"+10%",reason:"ブザン牡蠣：6個10〜35€。地中海の名産。"},
        "🍰 オクシタニア菓子":{min:3,avg:7,max:15,trend:"+10%",reason:"オクシタニア地方菓子：3〜15€。"},
      },
      ナント:{
        "🏰 ブルターニュ公爵城":{min:0,avg:9,max:9,trend:"±0%",reason:"ブルターニュ公爵城：城内無料、博物館9€。15世紀のブルターニュ最後の城。"},
        "⛪ サン・ピエール・サン・ポール大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"ナント大聖堂：入場無料。フランボワイヤン・ゴシック様式。"},
        "🎡 機械仕掛けの島(レ・マシーン)":{min:9,avg:9.5,max:18,trend:"+10%",reason:"レ・マシーン・ド・リル：9.5€、巨大象乗車9.5€（合計18€）。"},
        "🌳 植物園":{min:0,avg:0,max:0,trend:"±0%",reason:"ナント植物園：入園無料。19世紀から続く美しい庭園。"},
        "🌉 ノートルダム・ド・ボン・ポール":{min:0,avg:0,max:0,trend:"±0%",reason:"ノートルダム・ド・ボン・ポール：入場無料。"},
        "🛍️ パッサージュ・ポムレ":{min:0,avg:0,max:0,trend:"±0%",reason:"パッサージュ・ポムレ：散策無料。19世紀の三層構造アーケード。"},
        "🎨 ナント美術館":{min:8,avg:8,max:8,trend:"+8%",reason:"ナント美術館：8€。古典から現代までのコレクション。"},
        "🌊 エルドル川":{min:0,avg:18,max:30,trend:"+10%",reason:"エルドル川クルーズ：18〜30€。「フランスで最も美しい川」と評される。"},
        "🏛️ ナント歴史博物館":{min:9,avg:9,max:9,trend:"+8%",reason:"ナント歴史博物館：9€。ブルターニュ公爵城内。"},
        "🍫 LU(ル)タワー":{min:0,avg:3,max:5,trend:"±0%",reason:"LUタワー：登塔3〜5€。LUビスケットの旧工場の塔。"},
        "🥞 クレープ":{min:5,avg:9,max:18,trend:"+10%",reason:"クレープ・シュゼット等：5〜18€。ブルターニュ地方発祥の薄焼き菓子。"},
        "🥞 ガレット":{min:8,avg:12,max:22,trend:"+10%",reason:"ガレット・コンプレット：8〜22€。蕎麦粉のガレット。卵・ハム・チーズ。"},
        "🍶 ミュスカデ(白ワイン)":{min:4,avg:8,max:20,trend:"+10%",reason:"ミュスカデ：グラス4〜10€、ボトル10〜20€。ナント周辺の辛口白ワイン。"},
        "🍪 LUビスケット":{min:2,avg:4,max:10,trend:"+8%",reason:"LUビスケット：2〜10€。ナント発祥のフランス国民的ビスケット。"},
        "🦪 牡蠣":{min:10,avg:18,max:35,trend:"+10%",reason:"ブルターニュ牡蠣：6個10〜35€。フランス最大の牡蠣産地。"},
        "🐟 シーフード":{min:20,avg:40,max:90,trend:"+10%",reason:"ブルターニュシーフード：20〜90€。"},
        "🧈 塩バター飴":{min:3,avg:6,max:12,trend:"+10%",reason:"カラメル・オ・ブール・サレ：3〜12€。ブルターニュ名物の塩バター飴。"},
        "🍰 ガトー・ナンテ":{min:4,avg:7,max:15,trend:"+10%",reason:"ガトー・ナンテ：4〜15€。ラム酒・アーモンドのナント伝統菓子。"},
      },
    },
  },
  イギリス:{
    food:{
      "🏪 コンビニ":{min:3,avg:8,max:20,trend:"+8%",reason:"Tesco・Sainsbury's軽食3〜20£。"},
      "🍢 屋台":{min:5,avg:10,max:20,trend:"+10%",reason:"ストリートフード5〜20£。"},
      "🍜 ローカル食堂":{min:10,avg:18,max:35,trend:"+8%",reason:"パブランチ10〜35£。"},
      "🍣 チェーン":{min:8,avg:15,max:25,trend:"+8%",reason:"ファストフード8〜25£。"},
      "🍽️ カジュアル":{min:20,avg:35,max:60,trend:"+10%",reason:"カジュアルレストラン20〜60£/人。"},
      "🥂 中級":{min:40,avg:70,max:120,trend:"+10%",reason:"中級レストラン40〜120£/人。"},
      "🥩 高級":{min:80,avg:150,max:300,trend:"+10%",reason:"高級レストラン80〜300£/人。"},
      "👑 超高級":{min:200,avg:400,max:1000,trend:"+12%",reason:"ミシュラン三つ星200〜1000£/人。"},
      "🌅 朝食":{min:5,avg:12,max:30,trend:"+8%",reason:"イングリッシュブレックファスト5〜30£。"},
      "☀️ ランチ":{min:10,avg:25,max:50,trend:"+10%",reason:"ランチ10〜50£。"},
      "🌆 ディナー":{min:25,avg:50,max:120,trend:"+10%",reason:"ディナー25〜120£/人。"},
      "🍱 テイクアウト":{min:5,avg:12,max:25,trend:"+10%",reason:"テイクアウト5〜25£。"},
      "☕ カフェ軽食":{min:5,avg:10,max:20,trend:"+8%",reason:"カフェ軽食5〜20£。"},
      "🌙 夜食":{min:8,avg:15,max:35,trend:"+10%",reason:"夜食8〜35£。"},
    },
    drink:{
      "🥤 ペットボトル水":{min:1,avg:1.5,max:3,trend:"+8%",reason:"水500ml 1〜3£。"},
      "🥤 ソフトドリンク":{min:2,avg:3,max:5,trend:"+8%",reason:"コーラ・ジュース2〜5£。"},
      "☕ コーヒー":{min:3,avg:4,max:7,trend:"+8%",reason:"コーヒー3〜7£。"},
      "🍵 紅茶":{min:2,avg:4,max:8,trend:"+8%",reason:"紅茶2〜8£。"},
      "🧃 ジュース":{min:2,avg:4,max:7,trend:"+8%",reason:"ジュース2〜7£。"},
      "🍺 ビール":{min:4,avg:6,max:10,trend:"+10%",reason:"パブビール4〜10£（パイント）。ロンドン中心部は6〜10£。"},
      "🍷 ワイン":{min:5,avg:9,max:20,trend:"+10%",reason:"グラスワイン5〜10£、ボトル20〜50£。"},
      "🍹 カクテル":{min:10,avg:15,max:25,trend:"+10%",reason:"カクテル10〜25£。"},
      "🥛 牛乳":{min:1,avg:1.5,max:3,trend:"+8%",reason:"牛乳1L 1〜3£。"},
      "🍶 リキュール":{min:4,avg:8,max:15,trend:"+10%",reason:"ウイスキー・ジン4〜15£/杯。"},
    },
    taxi:{
      "🚖 短距離":{min:8,avg:15,max:25,trend:"+10%",reason:"ブラックキャブ短距離8〜25£。"},
      "🚖 中距離":{min:20,avg:35,max:60,trend:"+10%",reason:"中距離20〜60£。"},
      "🚖 長距離":{min:50,avg:100,max:200,trend:"+10%",reason:"長距離50〜200£。"},
      "✈️ 空港":{min:50,avg:80,max:150,trend:"+10%",reason:"ヒースロー〜ロンドン市内80〜100£。"},
      "🌙 深夜":{min:15,avg:30,max:80,trend:"+15%",reason:"深夜割増+5〜15£。"},
      "🚗 配車アプリ":{min:10,avg:20,max:50,trend:"+10%",reason:"Uber・Bolt利用可能。"},
    },
    hotel:{
      "🏨 格安ホステル":{min:30,avg:60,max:120,trend:"+10%",reason:"ホステル30〜120£/泊。"},
      "🏨 3つ星":{min:100,avg:180,max:300,trend:"+12%",reason:"3つ星100〜300£/泊。"},
      "🏨 4つ星":{min:200,avg:350,max:600,trend:"+12%",reason:"4つ星200〜600£/泊。"},
      "🏨 5つ星":{min:400,avg:800,max:2000,trend:"+15%",reason:"5つ星ラグジュアリー400〜2000£/泊。"},
      "🏠 民泊・Airbnb":{min:50,avg:120,max:300,trend:"+12%",reason:"Airbnb50〜300£/泊。"},
    },
    shopping:{
      "👕 衣料":{min:20,avg:80,max:500,trend:"+8%",reason:"ハロッズ・セルフリッジ20〜500£。"},
      "💄 コスメ":{min:10,avg:35,max:150,trend:"+8%",reason:"ブーツ・ボディショップ10〜150£。"},
      "🛒 スーパー":{min:1,avg:5,max:30,trend:"+8%",reason:"スーパー1〜30£。"},
      "🎁 おみやげ":{min:5,avg:20,max:80,trend:"+10%",reason:"紅茶・ファッジ・キーホルダー5〜80£。"},
      "💻 家電":{min:30,avg:200,max:2000,trend:"+8%",reason:"家電30〜2000£。"},
    },
    activity:{
      "🏛️ 観光入場":{min:0,avg:20,max:35,trend:"+10%",reason:"大英博物館無料、ロンドン塔36£、タワーブリッジ13£。"},
      "🤿 アクティビティ":{min:20,avg:60,max:200,trend:"+10%",reason:"テムズクルーズ20〜100£。"},
      "💆 マッサージ":{min:50,avg:100,max:250,trend:"+10%",reason:"スパ50〜250£/時。"},
      "🎭 エンタメ":{min:30,avg:80,max:300,trend:"+10%",reason:"ウェストエンドミュージカル30〜300£。"},
      "🚌 ツアー":{min:20,avg:60,max:200,trend:"+10%",reason:"日帰りツアー20〜200£。"},
    },
    famous:{
      ロンドン:{
        "🕰️ ビッグベン(国会議事堂)":{min:0,avg:32,max:42,trend:"+10%",reason:"ビッグベン：外観見学無料、議事堂内部ガイドツアー32〜42£。"},
        "🏛️ 大英博物館":{min:0,avg:0,max:0,trend:"±0%",reason:"大英博物館：入場無料。世界最大級の博物館。ロゼッタストーン・パルテノン神殿の彫刻。"},
        "🏰 ロンドン塔":{min:35.80,avg:35.80,max:42,trend:"+10%",reason:"ロンドン塔：35.80£（オンライン）、ゲート42£。王冠ジュエル展示。"},
        "🌉 タワーブリッジ":{min:13.40,avg:13.40,max:13.40,trend:"+8%",reason:"タワーブリッジ：13.40£。展示・ガラス床・歴史。"},
        "💒 ウェストミンスター寺院":{min:29,avg:29,max:35,trend:"+8%",reason:"ウェストミンスター寺院：29£（事前）、ゲート35£。王室結婚式・戴冠式の場所。"},
        "🏰 バッキンガム宮殿":{min:0,avg:32,max:39,trend:"+10%",reason:"バッキンガム宮殿：外観無料、夏季内部公開32〜39£、近衛兵交代式無料。"},
        "🎢 ロンドンアイ":{min:32,avg:36,max:50,trend:"+10%",reason:"ロンドンアイ：32〜50£。30分でロンドン一望。シャンパン付き50£〜。"},
        "🎨 ナショナルギャラリー":{min:0,avg:0,max:0,trend:"±0%",reason:"ナショナルギャラリー：入場無料。ゴッホ「ひまわり」、ダ・ヴィンチ等。"},
        "🏛️ V&A博物館":{min:0,avg:0,max:0,trend:"±0%",reason:"ヴィクトリア・アンド・アルバート博物館：入場無料。装飾芸術・ファッション。"},
        "🛍️ コヴェントガーデン":{min:0,avg:0,max:0,trend:"±0%",reason:"コヴェントガーデン：散策無料。ショッピング・ストリートパフォーマンス。"},
        "🍟 フィッシュアンドチップス":{min:10,avg:15,max:25,trend:"+10%",reason:"フィッシュ&チップス：10〜25£。イギリス国民食。"},
        "🍰 アフタヌーンティー":{min:30,avg:60,max:120,trend:"+12%",reason:"アフタヌーンティー：30〜120£。リッツ・サヴォイの高級ホテルは70〜120£。"},
        "🥧 ミートパイ":{min:8,avg:14,max:22,trend:"+10%",reason:"ステーキ&キドニーパイ：8〜22£。パブの定番。"},
        "🍳 イングリッシュブレックファスト":{min:8,avg:14,max:25,trend:"+10%",reason:"フルイングリッシュブレックファスト：8〜25£。ベーコン・卵・ソーセージ・豆・トマト。"},
        "🥧 シェパーズパイ":{min:10,avg:15,max:25,trend:"+10%",reason:"シェパーズパイ：10〜25£。羊肉とマッシュポテトの伝統パイ。"},
        "🍷 ピムス":{min:7,avg:10,max:15,trend:"+10%",reason:"ピムスNo.1：7〜15£。イギリス夏の定番カクテル。ウィンブルドンで人気。"},
        "☕ ミルクティー":{min:3,avg:5,max:8,trend:"+10%",reason:"イングリッシュブレックファストティー：3〜8£。紅茶文化の本場。"},
        "🥩 サンデーロースト":{min:15,avg:22,max:40,trend:"+10%",reason:"サンデーロースト：15〜40£。ローストビーフ・ヨークシャープディング。日曜の伝統。"},
      },
      マンチェスター:{
        "🏟️ オールド・トラフォード":{min:30,avg:35,max:80,trend:"+12%",reason:"オールド・トラフォード：スタジアムツアー30〜35£、試合観戦80£〜。マンU本拠地。"},
        "🏟️ エティハドスタジアム":{min:25,avg:30,max:75,trend:"+12%",reason:"エティハドスタジアム：スタジアムツアー25〜30£、試合観戦75£〜。マンC本拠地。"},
        "🏛️ マンチェスター美術館":{min:0,avg:0,max:0,trend:"±0%",reason:"マンチェスター美術館：入場無料。プレラファエロ派・印象派コレクション。"},
        "🎵 ピープルズヒストリーミュージアム":{min:0,avg:0,max:0,trend:"±0%",reason:"人民歴史博物館：入場無料。労働運動・民主主義の歴史。"},
        "⛪ マンチェスター大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"マンチェスター大聖堂：入場無料。15世紀の中世大聖堂。"},
        "🏛️ サイエンス・産業博物館":{min:0,avg:0,max:0,trend:"±0%",reason:"サイエンス&インダストリー博物館：入場無料。産業革命発祥地マンチェスター。"},
        "🛍️ アーンデールセンター":{min:0,avg:0,max:0,trend:"±0%",reason:"アーンデールセンター：散策無料。マンチェスター最大のショッピングモール。"},
        "🏛️ ジョンライランズ図書館":{min:0,avg:0,max:0,trend:"±0%",reason:"ジョン・ライランズ図書館：入場無料。ネオゴシック様式の壮麗な図書館。"},
        "🌳 ヒートン公園":{min:0,avg:0,max:0,trend:"±0%",reason:"ヒートン公園：入園無料。マンチェスター最大の公園。"},
        "🎭 ロイヤルエクスチェンジ劇場":{min:15,avg:30,max:60,trend:"+10%",reason:"ロイヤルエクスチェンジ劇場：15〜60£。マンチェスターを代表する円形劇場。"},
        "🍻 マンチェスターパブ":{min:5,avg:10,max:25,trend:"+10%",reason:"マンチェスターのパブ料理：5〜25£。"},
        "🍟 フィッシュアンドチップス":{min:8,avg:13,max:22,trend:"+10%",reason:"フィッシュ&チップス：8〜22£。"},
        "🥩 ランカシャー・ホットポット":{min:12,avg:18,max:28,trend:"+10%",reason:"ランカシャー・ホットポット：12〜28£。羊肉とジャガイモの煮込み。"},
        "🥧 ミートパイ":{min:8,avg:13,max:22,trend:"+10%",reason:"ミートパイ：8〜22£。"},
        "☕ ブレックウェル茶":{min:3,avg:5,max:10,trend:"+8%",reason:"ヨークシャー紅茶：3〜10£。北イングランドの定番。"},
        "🍻 クラフトビール":{min:5,avg:7,max:12,trend:"+10%",reason:"マンチェスター・クラフトビール：5〜12£。地元醸造所多数。"},
        "🍰 エクレス・ケーキ":{min:3,avg:5,max:10,trend:"+10%",reason:"エクレス・ケーキ：3〜10£。マンチェスター郊外発祥のレーズン菓子。"},
        "🍻 ボディントンズ":{min:4,avg:6,max:10,trend:"+10%",reason:"ボディントンズ・ビター：4〜10£。マンチェスター発祥の英国エール。"},
      },
      エディンバラ:{
        "🏰 エディンバラ城":{min:21.50,avg:21.50,max:25,trend:"+10%",reason:"エディンバラ城：21.50£（オンライン）、25£（窓口）。スコットランドの王城。"},
        "🏛️ ホリールード宮殿":{min:20.50,avg:20.50,max:20.50,trend:"+10%",reason:"ホリールード宮殿：20.50£。チャールズ国王スコットランド公邸。"},
        "🛣️ ロイヤルマイル":{min:0,avg:0,max:0,trend:"±0%",reason:"ロイヤルマイル：散策無料。エディンバラ城〜ホリールード宮殿の歴史街道。"},
        "⛪ セント・ジャイルズ大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"セント・ジャイルズ大聖堂：入場無料。スコットランド国教会の聖堂。"},
        "🏔️ アーサーズシート":{min:0,avg:0,max:0,trend:"±0%",reason:"アーサーズシート：入山無料。エディンバラ中心の死火山。市街地一望。"},
        "🏛️ スコットランド国立博物館":{min:0,avg:0,max:0,trend:"±0%",reason:"スコットランド国立博物館：入場無料。"},
        "🎨 スコットランド国立美術館":{min:0,avg:0,max:0,trend:"±0%",reason:"スコットランド国立美術館：入場無料。"},
        "🏛️ カールトンヒル":{min:0,avg:0,max:0,trend:"±0%",reason:"カールトンヒル：見学無料。「北のアテネ」と呼ばれる丘。エディンバラ全景。"},
        "🛍️ プリンセスストリート":{min:0,avg:0,max:0,trend:"±0%",reason:"プリンセスストリート：散策無料。エディンバラのメインショッピング通り。"},
        "🎭 エディンバラフェスティバル":{min:0,avg:30,max:200,trend:"+10%",reason:"エディンバラ・フリンジ：無料公演〜200£（8月）。世界最大の芸術祭。"},
        "🥩 ハギス":{min:10,avg:15,max:25,trend:"+10%",reason:"ハギス：10〜25£。スコットランドの羊内臓・オートミール料理。"},
        "🥩 スコッチビーフ":{min:25,avg:40,max:80,trend:"+12%",reason:"スコッチビーフ：25〜80£。アンガス・ハイランド牛が最高峰。"},
        "🍳 スコティッシュブレックファスト":{min:10,avg:16,max:25,trend:"+10%",reason:"スコティッシュ・ブレックファスト：10〜25£。ハギス・ブラックプディング付き。"},
        "🥃 スコッチウイスキー":{min:5,avg:10,max:50,trend:"+10%",reason:"スコッチウイスキー：5〜50£/杯。マッカラン・グレンフィディック等の高級モルト。"},
        "🍰 ショートブレッド":{min:3,avg:6,max:15,trend:"+10%",reason:"ショートブレッド：3〜15£。バターたっぷりのスコットランド伝統ビスケット。"},
        "🐟 サーモン":{min:18,avg:28,max:50,trend:"+10%",reason:"スコティッシュ・サーモン：18〜50£。世界最高品質。"},
        "🍰 クラナハン":{min:6,avg:10,max:18,trend:"+10%",reason:"クラナハン：6〜18£。ラズベリー・オートミール・ウイスキー入りクリーム。"},
        "🍻 スコットランドエール":{min:4,avg:7,max:12,trend:"+10%",reason:"スコットランド・エール：4〜12£。ブリュードッグなどが世界的に有名。"},
      },
      バーミンガム:{
        "🏛️ シンフォニーホール":{min:15,avg:30,max:80,trend:"+10%",reason:"バーミンガム・シンフォニーホール：15〜80£。世界トップクラスの音響。"},
        "🏛️ バーミンガム美術館":{min:0,avg:0,max:0,trend:"±0%",reason:"バーミンガム博物館・美術館：入場無料。プレラファエロ派コレクション。"},
        "🛍️ ブルリングショッピングセンター":{min:0,avg:0,max:0,trend:"±0%",reason:"ブルリング：散策無料。バーミンガム最大のショッピングモール。"},
        "🏛️ シーライフセンター":{min:18,avg:22,max:28,trend:"+10%",reason:"シーライフセンター：18〜28£。水族館。"},
        "🏰 アストン・ホール":{min:0,avg:0,max:0,trend:"±0%",reason:"アストン・ホール：入場無料。17世紀のジャコビアン様式邸宅。"},
        "🌳 カノンヒル公園":{min:0,avg:0,max:0,trend:"±0%",reason:"カノンヒル公園：入園無料。バーミンガム最大の公園。"},
        "🛍️ ジュエリー地区":{min:0,avg:0,max:0,trend:"±0%",reason:"ジュエリー地区：散策無料。世界最大の宝飾品街。"},
        "🏛️ シンクタンク科学博物館":{min:14,avg:14,max:20,trend:"+10%",reason:"シンクタンク科学博物館：14〜20£。"},
        "🎭 バーミンガム・ヒッポドローム":{min:20,avg:40,max:100,trend:"+10%",reason:"ヒッポドローム劇場：20〜100£。バーミンガムのウェストエンド級劇場。"},
        "⛪ セント・フィリップ大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"セント・フィリップ大聖堂：入場無料。バーミンガムのアングリカン大聖堂。"},
        "🍛 バーミンガム・バルティ":{min:10,avg:15,max:25,trend:"+10%",reason:"バーミンガム・バルティ：10〜25£。バーミンガム発祥の英国式カレー。"},
        "🥧 ポーク・パイ":{min:5,avg:8,max:15,trend:"+10%",reason:"ポーク・パイ：5〜15£。"},
        "🍟 フィッシュアンドチップス":{min:8,avg:12,max:20,trend:"+10%",reason:"フィッシュ&チップス：8〜20£。"},
        "🍳 イングリッシュブレックファスト":{min:8,avg:12,max:20,trend:"+10%",reason:"フルブレックファスト：8〜20£。"},
        "🍰 アフタヌーンティー":{min:25,avg:45,max:80,trend:"+12%",reason:"アフタヌーンティー：25〜80£。"},
        "🍻 エール":{min:4,avg:6,max:10,trend:"+10%",reason:"バーミンガム・エール：4〜10£。"},
        "🍫 キャドバリー":{min:3,avg:8,max:25,trend:"+10%",reason:"キャドバリー・チョコレート：3〜25£。バーミンガム郊外のキャドバリー・ワールド（22£）。"},
        "🥩 ステーキ":{min:18,avg:30,max:60,trend:"+10%",reason:"バーミンガム・ステーキ：18〜60£。"},
      },
      リバプール:{
        "🎵 ビートルズ・ストーリー":{min:19,avg:19,max:19,trend:"+8%",reason:"ビートルズ・ストーリー：19£。ビートルズ博物館。アルバート・ドック内。"},
        "🎵 キャヴァーン・クラブ":{min:0,avg:5,max:15,trend:"+10%",reason:"キャヴァーン・クラブ：日中無料、夜ライブ5〜15£。ビートルズの聖地。"},
        "🎵 ストロベリーフィールズ":{min:9,avg:9,max:9,trend:"+10%",reason:"ストロベリーフィールズ：9£。ビートルズ「ストロベリーフィールズ・フォーエバー」の場所。"},
        "🏟️ アンフィールド":{min:25,avg:30,max:100,trend:"+12%",reason:"アンフィールド：スタジアムツアー25〜30£、試合観戦100£〜。リバプールFC本拠地。"},
        "🏟️ グディソン・パーク":{min:20,avg:25,max:60,trend:"+10%",reason:"グディソン・パーク：スタジアムツアー20〜25£、試合観戦60£〜。エヴァートン本拠地。"},
        "🏛️ リバプール大聖堂":{min:0,avg:0,max:6,trend:"±0%",reason:"リバプール大聖堂：入場無料、塔登頂6£。イギリス最大の大聖堂。"},
        "🏛️ アルバート・ドック":{min:0,avg:0,max:0,trend:"±0%",reason:"アルバート・ドック：散策無料・世界遺産。19世紀の港湾施設。博物館・カフェ。"},
        "🎨 テート・リバプール":{min:0,avg:0,max:0,trend:"±0%",reason:"テート・リバプール：入場無料（特別展は別途）。現代美術館。"},
        "🛍️ リバプール・ワン":{min:0,avg:0,max:0,trend:"±0%",reason:"リバプール・ワン：散策無料。リバプール最大の屋外ショッピングモール。"},
        "🌊 マージー川フェリー":{min:12,avg:12,max:18,trend:"+10%",reason:"マージー川フェリー：12〜18£。「Ferry Cross the Mersey」で有名。"},
        "🍟 フィッシュアンドチップス":{min:8,avg:12,max:20,trend:"+10%",reason:"フィッシュ&チップス：8〜20£。"},
        "🍞 スカウス・シチュー":{min:9,avg:14,max:22,trend:"+10%",reason:"スカウス：9〜22£。リバプール名物の肉野菜煮込み（リバプール住民の愛称の由来）。"},
        "🥧 ステーキ・パイ":{min:8,avg:13,max:22,trend:"+10%",reason:"ステーキ・パイ：8〜22£。"},
        "🥩 サンデーロースト":{min:14,avg:20,max:35,trend:"+10%",reason:"サンデーロースト：14〜35£。"},
        "🍰 ビクトリアスポンジ":{min:4,avg:7,max:15,trend:"+10%",reason:"ビクトリアスポンジ：4〜15£。イチゴジャム・クリームの伝統ケーキ。"},
        "🍻 ローカルエール":{min:4,avg:6,max:10,trend:"+10%",reason:"リバプール・ローカルビール：4〜10£。"},
        "☕ ティー":{min:2.5,avg:4,max:8,trend:"+8%",reason:"イングリッシュティー：2.5〜8£。"},
        "🥩 ローストビーフ":{min:18,avg:28,max:50,trend:"+10%",reason:"ローストビーフ：18〜50£。"},
      },
      ブリストル:{
        "🌉 クリフトン吊り橋":{min:0,avg:0,max:0,trend:"±0%",reason:"クリフトン吊り橋：見学無料。1864年完成のヴィクトリア朝吊り橋。橋上から絶景。"},
        "🏛️ ブリストル動物園":{min:18,avg:20,max:25,trend:"+10%",reason:"ブリストル動物園プロジェクト（新施設）：18〜25£。"},
        "🏛️ SS Great Britain":{min:22,avg:22,max:27,trend:"+10%",reason:"SS Great Britain：22〜27£。世界初の鉄製大型蒸気船。1843年。"},
        "🏛️ ブリストル大聖堂":{min:0,avg:0,max:0,trend:"±0%",reason:"ブリストル大聖堂：入場無料。12世紀のノルマン建築。"},
        "🏛️ M Shed博物館":{min:0,avg:0,max:0,trend:"±0%",reason:"M Shed博物館：入場無料。ブリストルの歴史・船舶博物館。"},
        "🛍️ カボット・サーカス":{min:0,avg:0,max:0,trend:"±0%",reason:"カボット・サーカス：散策無料。ブリストル中心の現代的ショッピングモール。"},
        "🎨 ブリストル美術館":{min:0,avg:0,max:0,trend:"±0%",reason:"ブリストル美術館・博物館：入場無料。"},
        "🏰 ブリストル城公園":{min:0,avg:0,max:0,trend:"±0%",reason:"ブリストル城公園：入園無料。中世の城跡。"},
        "🎈 気球フェスティバル":{min:0,avg:0,max:0,trend:"±0%",reason:"ブリストル・バルーン・フィエスタ：入場無料（8月）。ヨーロッパ最大の気球イベント。"},
        "🎨 バンクシー作品(ストリート)":{min:0,avg:0,max:0,trend:"±0%",reason:"バンクシーのストリートアート：見学無料。ブリストル発祥のアーティスト。"},
        "🍟 フィッシュアンドチップス":{min:8,avg:12,max:20,trend:"+10%",reason:"フィッシュ&チップス：8〜20£。"},
        "🧀 チェダーチーズ":{min:5,avg:12,max:30,trend:"+8%",reason:"チェダーチーズ：100g 5〜30£。ブリストル近郊チェダー村発祥。"},
        "🥩 サンデーロースト":{min:14,avg:20,max:35,trend:"+10%",reason:"サンデーロースト：14〜35£。"},
        "🍰 ブリストルバン":{min:3,avg:5,max:10,trend:"+10%",reason:"ブリストルバン：3〜10£。地元のスイートパン。"},
        "🍻 サイダー":{min:4,avg:6,max:10,trend:"+10%",reason:"サマセット・サイダー：4〜10£。ブリストル周辺の特産。"},
        "🍞 西部料理":{min:10,avg:18,max:35,trend:"+10%",reason:"ウェスト・カントリー料理：10〜35£。"},
        "🥧 ポークパイ":{min:5,avg:8,max:15,trend:"+10%",reason:"ポークパイ：5〜15£。"},
        "🍫 ブリストルチョコレート":{min:4,avg:10,max:25,trend:"+10%",reason:"ブリストル・チョコレート：4〜25£。地元クラフトチョコ。"},
      },
      オックスフォード:{
        "🏛️ オックスフォード大学":{min:0,avg:18,max:30,trend:"+10%",reason:"オックスフォード大学：見学無料、ガイドツアー18〜30£。世界最古の英語大学。"},
        "🏛️ クライスト・チャーチ":{min:18,avg:18,max:18,trend:"+10%",reason:"クライスト・チャーチ：18£。ハリー・ポッターのホグワーツ大食堂のモデル。"},
        "🏛️ ボドリアン図書館":{min:9,avg:15,max:23,trend:"+10%",reason:"ボドリアン図書館：ツアー9〜23£。ヨーロッパ最古級の図書館（1602年）。"},
        "🏛️ アシュモレアン博物館":{min:0,avg:0,max:0,trend:"±0%",reason:"アシュモレアン博物館：入場無料。英国最古の公立博物館（1683年）。"},
        "🏛️ シェルドニアン劇場":{min:4.50,avg:4.50,max:4.50,trend:"+8%",reason:"シェルドニアン劇場：4.50£。クリストファー・レン設計の17世紀の劇場。"},
        "🏰 オックスフォード城":{min:18,avg:18,max:18,trend:"+10%",reason:"オックスフォード城：18£。1071年建造の中世の城跡。"},
        "🌉 ため息の橋":{min:0,avg:0,max:0,trend:"±0%",reason:"ため息の橋：見学無料。ヴェネツィアを模した美しい橋。"},
        "🌳 ユニバーシティパーク":{min:0,avg:0,max:0,trend:"±0%",reason:"ユニバーシティ・パーク：入園無料。広大な大学の庭園。"},
        "⛪ クライストチャーチ大聖堂":{min:18,avg:18,max:18,trend:"+10%",reason:"クライスト・チャーチ大聖堂：18£（クライストチャーチ入場料込み）。"},
        "🛍️ コーンマーケット":{min:0,avg:0,max:0,trend:"±0%",reason:"コーンマーケット通り：散策無料。オックスフォードの中心商店街。"},
        "🍟 フィッシュアンドチップス":{min:9,avg:13,max:22,trend:"+10%",reason:"フィッシュ&チップス：9〜22£。"},
        "🍰 アフタヌーンティー":{min:25,avg:40,max:80,trend:"+12%",reason:"オックスフォード・アフタヌーンティー：25〜80£。大学カレッジで楽しめる。"},
        "🥩 サンデーロースト":{min:14,avg:22,max:38,trend:"+10%",reason:"サンデーロースト：14〜38£。"},
        "🍻 オックスフォードエール":{min:4,avg:6,max:10,trend:"+10%",reason:"ブラハム・オックスフォード・ゴールド：4〜10£。地元エール。"},
        "☕ オックスフォードティー":{min:3,avg:5,max:10,trend:"+10%",reason:"オックスフォード・ティー：3〜10£。"},
        "🥧 ポークパイ":{min:5,avg:8,max:15,trend:"+10%",reason:"ポークパイ：5〜15£。"},
        "🍰 オックスフォードソーセージ":{min:4,avg:7,max:12,trend:"+10%",reason:"オックスフォード・ソーセージ：4〜12£。"},
        "🥩 ロースト料理":{min:18,avg:28,max:50,trend:"+10%",reason:"ロースト料理：18〜50£。"},
      },
      ケンブリッジ:{
        "🏛️ ケンブリッジ大学":{min:0,avg:20,max:35,trend:"+10%",reason:"ケンブリッジ大学：散策無料、ガイドツアー20〜35£。31のカレッジから構成。"},
        "🏛️ キングスカレッジ":{min:13.50,avg:13.50,max:13.50,trend:"+10%",reason:"キングスカレッジ：13.50£。ヘンリー6世創立。チャペルが圧巻。"},
        "🛶 パンティング(ケム川)":{min:15,avg:25,max:45,trend:"+10%",reason:"パンティング：シェア15〜25£、貸切45£。ケム川を竿で進む伝統のボート。"},
        "🏛️ フィッツウィリアム博物館":{min:0,avg:0,max:0,trend:"±0%",reason:"フィッツウィリアム博物館：入場無料。ケンブリッジ大学の博物館。"},
        "🌳 ケンブリッジ植物園":{min:7,avg:7,max:7,trend:"+8%",reason:"ケンブリッジ大学植物園：7£。19世紀から続く美しい庭園。"},
        "🏛️ トリニティカレッジ":{min:4,avg:4,max:4,trend:"+8%",reason:"トリニティカレッジ：4£。ニュートンの母校。リンゴの木のレプリカ。"},
        "🌉 数学の橋":{min:0,avg:0,max:0,trend:"±0%",reason:"数学の橋（マセマティカル・ブリッジ）：見学無料。クイーンズカレッジの木造橋。"},
        "🌉 ため息の橋":{min:0,avg:0,max:0,trend:"±0%",reason:"ため息の橋：見学無料。セント・ジョンズカレッジの優美な石橋。"},
        "⛪ キングスカレッジ・チャペル":{min:13.50,avg:13.50,max:13.50,trend:"+10%",reason:"キングスカレッジ・チャペル：13.50£（カレッジ入場料込み）。世界遺産級ゴシック建築。"},
        "🛍️ マーケットスクエア":{min:0,avg:0,max:0,trend:"±0%",reason:"マーケットスクエア：散策無料。月〜土曜日の屋外市場。"},
        "🍟 フィッシュアンドチップス":{min:9,avg:13,max:22,trend:"+10%",reason:"フィッシュ&チップス：9〜22£。"},
        "🍰 アフタヌーンティー":{min:25,avg:40,max:75,trend:"+12%",reason:"ケンブリッジ・アフタヌーンティー：25〜75£。"},
        "🥩 サンデーロースト":{min:14,avg:22,max:38,trend:"+10%",reason:"サンデーロースト：14〜38£。"},
        "🍻 ケンブリッジエール":{min:4,avg:6,max:10,trend:"+10%",reason:"ケンブリッジエール：4〜10£。"},
        "☕ 紅茶":{min:3,avg:5,max:10,trend:"+10%",reason:"イングリッシュ紅茶：3〜10£。"},
        "🥧 ミートパイ":{min:8,avg:12,max:20,trend:"+10%",reason:"ミートパイ：8〜20£。"},
        "🍰 ジャム・ロリーポリー":{min:6,avg:9,max:15,trend:"+10%",reason:"ジャム・ロリーポリー：6〜15£。英国伝統のロールスイーツ。"},
        "🐟 鱒料理":{min:18,avg:25,max:40,trend:"+10%",reason:"トラウト（鱒）料理：18〜40£。ケム川の名物。"},
      },
    },
  },
  インドネシア:{
    food:{
      "🏪 コンビニ":{min:10000,avg:30000,max:80000,trend:"+10%",reason:"インドマレット・アルファマート軽食10,000〜80,000IDR。"},
      "🍢 屋台":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"ワルン・カキリマ屋台15,000〜60,000IDR。"},
      "🍜 ローカル食堂":{min:25000,avg:60000,max:150000,trend:"+10%",reason:"ワルン25,000〜150,000IDR。"},
      "🍣 チェーン":{min:30000,avg:80000,max:150000,trend:"+8%",reason:"KFC・マック等30,000〜150,000IDR。"},
      "🍽️ カジュアル":{min:80000,avg:200000,max:400000,trend:"+10%",reason:"カジュアル80,000〜400,000IDR/人。"},
      "🥂 中級":{min:200000,avg:400000,max:800000,trend:"+10%",reason:"中級200,000〜800,000IDR/人。"},
      "🥩 高級":{min:500000,avg:1000000,max:2500000,trend:"+12%",reason:"高級500,000〜2,500,000IDR/人。"},
      "👑 超高級":{min:1500000,avg:3000000,max:8000000,trend:"+15%",reason:"超高級1,500,000〜8,000,000IDR/人。"},
      "🌅 朝食":{min:20000,avg:50000,max:150000,trend:"+10%",reason:"朝食20,000〜150,000IDR。"},
      "☀️ ランチ":{min:30000,avg:80000,max:200000,trend:"+10%",reason:"ランチ30,000〜200,000IDR。"},
      "🌆 ディナー":{min:80000,avg:200000,max:500000,trend:"+10%",reason:"ディナー80,000〜500,000IDR/人。"},
      "🍱 テイクアウト":{min:25000,avg:50000,max:120000,trend:"+10%",reason:"テイクアウト25,000〜120,000IDR。"},
      "☕ カフェ軽食":{min:25000,avg:60000,max:150000,trend:"+10%",reason:"カフェ軽食25,000〜150,000IDR。"},
      "🌙 夜食":{min:25000,avg:60000,max:150000,trend:"+10%",reason:"夜食25,000〜150,000IDR。"},
    },
    drink:{
      "🥤 ペットボトル水":{min:3000,avg:5000,max:15000,trend:"+8%",reason:"水500ml 3,000〜15,000IDR。"},
      "🥤 ソフトドリンク":{min:8000,avg:15000,max:30000,trend:"+10%",reason:"コーラ8,000〜30,000IDR。"},
      "☕ コーヒー":{min:15000,avg:35000,max:80000,trend:"+10%",reason:"コーヒー15,000〜80,000IDR。"},
      "🍵 紅茶":{min:8000,avg:20000,max:50000,trend:"+10%",reason:"紅茶8,000〜50,000IDR。"},
      "🧃 ジュース":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"ジュース15,000〜60,000IDR。"},
      "🍺 ビール":{min:30000,avg:60000,max:120000,trend:"+15%",reason:"ビンタンビール30,000〜120,000IDR。"},
      "🍷 ワイン":{min:80000,avg:200000,max:600000,trend:"+12%",reason:"ワイン80,000〜600,000IDR。"},
      "🍹 カクテル":{min:80000,avg:150000,max:300000,trend:"+12%",reason:"カクテル80,000〜300,000IDR。"},
      "🥛 牛乳":{min:8000,avg:15000,max:30000,trend:"+8%",reason:"牛乳1L 8,000〜30,000IDR。"},
      "🍶 リキュール":{min:50000,avg:100000,max:250000,trend:"+12%",reason:"アラック50,000〜250,000IDR/杯。"},
    },
    taxi:{
      "🚖 短距離":{min:20000,avg:50000,max:100000,trend:"+10%",reason:"短距離20,000〜100,000IDR。"},
      "🚖 中距離":{min:50000,avg:120000,max:250000,trend:"+10%",reason:"中距離50,000〜250,000IDR。"},
      "🚖 長距離":{min:200000,avg:400000,max:1000000,trend:"+10%",reason:"長距離200,000〜1,000,000IDR。"},
      "✈️ 空港":{min:150000,avg:300000,max:500000,trend:"+10%",reason:"空港〜市内150,000〜500,000IDR。"},
      "🌙 深夜":{min:30000,avg:80000,max:200000,trend:"+15%",reason:"深夜割増+30,000〜80,000IDR。"},
      "🚗 配車アプリ":{min:20000,avg:50000,max:150000,trend:"+10%",reason:"Grab・Gojek利用可。"},
    },
    hotel:{
      "🏨 格安ホステル":{min:100000,avg:250000,max:500000,trend:"+10%",reason:"ホステル100,000〜500,000IDR/泊。"},
      "🏨 3つ星":{min:400000,avg:800000,max:1500000,trend:"+12%",reason:"3つ星400,000〜1,500,000IDR/泊。"},
      "🏨 4つ星":{min:1000000,avg:2000000,max:4000000,trend:"+12%",reason:"4つ星1,000,000〜4,000,000IDR/泊。"},
      "🏨 5つ星":{min:2500000,avg:5000000,max:15000000,trend:"+15%",reason:"5つ星2,500,000〜15,000,000IDR/泊。"},
      "🏠 民泊・Airbnb":{min:300000,avg:800000,max:2500000,trend:"+12%",reason:"Airbnb300,000〜2,500,000IDR/泊。"},
    },
    shopping:{
      "👕 衣料":{min:50000,avg:200000,max:1000000,trend:"+8%",reason:"バティック50,000〜1,000,000IDR。"},
      "💄 コスメ":{min:30000,avg:150000,max:500000,trend:"+8%",reason:"コスメ30,000〜500,000IDR。"},
      "🛒 スーパー":{min:5000,avg:50000,max:300000,trend:"+8%",reason:"スーパー5,000〜300,000IDR。"},
      "🎁 おみやげ":{min:20000,avg:100000,max:500000,trend:"+10%",reason:"おみやげ20,000〜500,000IDR。"},
      "💻 家電":{min:300000,avg:2000000,max:20000000,trend:"+8%",reason:"家電300,000〜20,000,000IDR。"},
    },
    activity:{
      "🏛️ 観光入場":{min:30000,avg:200000,max:500000,trend:"+12%",reason:"ボロブドゥール400,000IDR、プランバナン375,000IDR。"},
      "🤿 アクティビティ":{min:300000,avg:800000,max:3000000,trend:"+10%",reason:"アクティビティ300,000〜3,000,000IDR。"},
      "💆 マッサージ":{min:100000,avg:250000,max:1000000,trend:"+10%",reason:"バリマッサージ100,000〜1,000,000IDR/時。"},
      "🎭 エンタメ":{min:100000,avg:300000,max:800000,trend:"+10%",reason:"バリダンス100,000〜800,000IDR。"},
      "🚌 ツアー":{min:300000,avg:800000,max:2500000,trend:"+10%",reason:"日帰りツアー300,000〜2,500,000IDR。"},
    },
    famous:{
      バリ島:{
        "🐒 ウブドモンキーフォレスト":{min:80000,avg:80000,max:100000,trend:"+10%",reason:"ウブド・モンキーフォレスト：80,000IDR。聖なる森と猿。"},
        "🛕 タナロット寺院":{min:75000,avg:75000,max:75000,trend:"+10%",reason:"タナロット寺院：75,000IDR。海に浮かぶバリ最人気のサンセット寺院。"},
        "🛕 ウルワツ寺院":{min:50000,avg:50000,max:150000,trend:"+10%",reason:"ウルワツ寺院：50,000IDR、ケチャダンス込み150,000IDR。"},
        "🌅 クタビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"クタビーチ：入場無料。サーファー天国。"},
        "🏖️ サヌールビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"サヌールビーチ：入場無料。"},
        "🌾 テガラランライステラス":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"テガラランライステラス：25,000IDR、ブランコ500,000IDR〜。"},
        "🛕 ティルタ・エンプル寺院":{min:75000,avg:75000,max:75000,trend:"+10%",reason:"ティルタ・エンプル：75,000IDR。聖水で身を清める沐浴寺院。"},
        "🌋 キンタマーニ火山":{min:50000,avg:100000,max:300000,trend:"+10%",reason:"キンタマーニ高原：50,000〜300,000IDR。バトゥール山眺望。"},
        "🎭 ケチャダンス":{min:100000,avg:150000,max:200000,trend:"+10%",reason:"ケチャダンス：100,000〜200,000IDR。バリの伝統舞踊。"},
        "🏖️ ヌサドゥアビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"ヌサドゥアビーチ：入場無料。高級リゾートエリア。"},
        "🍚 ナシゴレン":{min:25000,avg:60000,max:150000,trend:"+10%",reason:"ナシゴレン：25,000〜150,000IDR。インドネシア国民食。"},
        "🍢 サテ":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
        "🥟 ガドガド":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ガドガド：25,000〜100,000IDR。野菜のピーナッツソースサラダ。"},
        "🦆 ベベベトゥトゥ":{min:80000,avg:150000,max:300000,trend:"+10%",reason:"ベベック（アヒル料理）：80,000〜300,000IDR。"},
        "🍗 ナシチャンプル":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"ナシ・チャンプル：30,000〜150,000IDR。混ぜご飯。"},
        "🌶️ サンバル":{min:5000,avg:10000,max:30000,trend:"+10%",reason:"サンバル：5,000〜30,000IDR。インドネシア辛味ソース。"},
        "🍰 マルタバ":{min:15000,avg:35000,max:80000,trend:"+10%",reason:"マルタバ：15,000〜80,000IDR。"},
        "🥥 ココナッツ":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"ココナッツ：15,000〜60,000IDR。"},
      },
      ジャカルタ:{
        "🏛️ モナス(独立記念塔)":{min:20000,avg:20000,max:20000,trend:"+10%",reason:"モナス：20,000IDR。ジャカルタのシンボル132m。"},
        "🛍️ コタトゥア(旧市街)":{min:0,avg:0,max:0,trend:"+10%",reason:"コタトゥア：散策無料。オランダ植民地時代の旧市街。"},
        "🛍️ プラザインドネシア":{min:0,avg:0,max:0,trend:"+10%",reason:"プラザインドネシア：散策無料。ジャカルタ高級ショッピングモール。"},
        "🛕 イスティクラル・モスク":{min:0,avg:0,max:0,trend:"+10%",reason:"イスティクラル・モスク：入場無料。東南アジア最大のモスク。"},
        "⛪ ジャカルタ大聖堂":{min:0,avg:50000,max:200000,trend:"+10%",reason:"⛪ ジャカルタ大聖堂：見学・体験。"},
        "🏛️ 国立博物館":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🏛️ 国立博物館：見学・体験。"},
        "🏝️ アンチョール":{min:30000,avg:50000,max:200000,trend:"+10%",reason:"アンチョール：入場30,000IDR、テーマパーク別途。"},
        "🛍️ タナアバン市場":{min:0,avg:0,max:0,trend:"+10%",reason:"タナアバン市場：散策無料。東南アジア最大の繊維市場。"},
        "🏘️ チャイナタウン":{min:0,avg:0,max:0,trend:"+10%",reason:"ジャカルタ・チャイナタウン（グロドック）：散策無料。"},
        "🏛️ メルデカ広場":{min:0,avg:0,max:0,trend:"+10%",reason:"メルデカ広場：見学無料。モナスのある独立広場。"},
        "🍚 ナシゴレン":{min:25000,avg:60000,max:150000,trend:"+10%",reason:"ナシゴレン：25,000〜150,000IDR。インドネシア国民食。"},
        "🍜 ミーアヤム":{min:15000,avg:35000,max:80000,trend:"+10%",reason:"ミー・アヤム：15,000〜80,000IDR。"},
        "🍢 サテ・アヤム":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
        "🥘 ガドガド":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ガドガド：25,000〜100,000IDR。野菜のピーナッツソースサラダ。"},
        "🍲 ソトベタウィ":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ソト：25,000〜100,000IDR。"},
        "🥖 マルタバ":{min:15000,avg:35000,max:80000,trend:"+10%",reason:"マルタバ：15,000〜80,000IDR。"},
        "🍢 屋台料理":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🍢 屋台料理：見学・体験。"},
        "🥤 アボカドジュース":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🥤 アボカドジュース：見学・体験。"},
      },
      ジョグジャカルタ:{
        "🛕 ボロブドゥール遺跡":{min:50000,avg:400000,max:1000000,trend:"+10%",reason:"ボロブドゥール：外観50,000IDR、登頂US$25（400,000IDR）、サンライズ1,000,000IDR。世界遺産。"},
        "🛕 プランバナン寺院":{min:375000,avg:375000,max:675000,trend:"+10%",reason:"プランバナン：375,000IDR、ボロブドゥール共通券675,000IDR。世界遺産ヒンドゥー寺院。"},
        "🏰 ジョグジャカルタ王宮":{min:25000,avg:25000,max:25000,trend:"+10%",reason:"クラトン：25,000IDR。スルタン宮殿。"},
        "🏰 水の宮殿(タマンサリ)":{min:25000,avg:25000,max:25000,trend:"+10%",reason:"タマンサリ：25,000IDR。スルタンの離宮。水の宮殿。"},
        "🛍️ マリオボロ通り":{min:0,avg:0,max:0,trend:"+10%",reason:"マリオボロ通り：散策無料。ジョグジャの目抜き通り。"},
        "🛕 ラトゥボコ宮殿":{min:375000,avg:375000,max:675000,trend:"+10%",reason:"ラトゥボコ宮殿：375,000IDR。サンセットの名所。"},
        "🌋 ムラピ山":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🌋 ムラピ山：見学・体験。"},
        "🛍️ ベリンハルジョ市場":{min:0,avg:0,max:0,trend:"+10%",reason:"ベリンハルジョ市場：散策無料。ジョグジャの伝統市場。"},
        "🎭 ガムラン演奏":{min:50000,avg:100000,max:200000,trend:"+10%",reason:"ガムラン演奏：50,000〜200,000IDR。"},
        "🐘 ジャワ象キャンプ":{min:300000,avg:500000,max:800000,trend:"+10%",reason:"ジャワ象キャンプ：300,000〜800,000IDR。象との触れ合い体験。"},
        "🍚 ナシゴレン":{min:25000,avg:60000,max:150000,trend:"+10%",reason:"ナシゴレン：25,000〜150,000IDR。インドネシア国民食。"},
        "🍗 グデ(ジャックフルーツ料理)":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"グデ（ジャックフルーツ料理）：25,000〜100,000IDR。"},
        "🍢 サテ":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
        "🍲 バクソ":{min:20000,avg:40000,max:80000,trend:"+10%",reason:"バクソ：20,000〜80,000IDR。"},
        "🍜 ミーゴレン":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ミーゴレン：25,000〜100,000IDR。"},
        "🥘 ナシリウェット":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ナシリウェット：25,000〜100,000IDR。"},
        "🍰 バクピア":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"バクピア：30,000〜100,000IDR/箱。ジョグジャ伝統菓子。"},
        "🍵 ジャワティー":{min:10000,avg:20000,max:50000,trend:"+10%",reason:"ジャワティー：10,000〜50,000IDR。"},
      },
      スラバヤ:{
        "🏛️ ヒーローズ記念碑":{min:0,avg:0,max:0,trend:"+10%",reason:"ヒーローズ記念碑（トゥグ・パフラワン）：見学無料。"},
        "🛍️ チャイナタウン・カンプンプチナン":{min:0,avg:0,max:0,trend:"+10%",reason:"ジャカルタ・チャイナタウン（グロドック）：散策無料。"},
        "🏛️ スラバヤ動物園":{min:30000,avg:30000,max:30000,trend:"+10%",reason:"スラバヤ動物園：30,000IDR。インドネシア最古の動物園（1916年）。"},
        "🌳 ジャラン・トゥンジュンガン":{min:0,avg:0,max:0,trend:"+10%",reason:"ジャラン・トゥンジュンガン：散策無料。スラバヤのメインストリート。"},
        "🏛️ ハウス・オブ・サンプルナ":{min:0,avg:0,max:0,trend:"+10%",reason:"ハウス・オブ・サンプルナ：入場無料。クレテック工場兼博物館。"},
        "🏛️ シェラトン・スラバヤ":{min:0,avg:0,max:0,trend:"+10%",reason:"シェラトン・スラバヤ：歴史的建築物。見学無料。"},
        "🌋 ブロモ火山(郊外)":{min:300000,avg:800000,max:1500000,trend:"+10%",reason:"ブロモ火山ツアー：300,000〜1,500,000IDR。スラバヤから日帰り可能。"},
        "⛪ サンタマリア大聖堂":{min:0,avg:0,max:0,trend:"+10%",reason:"サンタマリア大聖堂：参拝無料。スラバヤのカトリック大聖堂。"},
        "🌳 スラバヤ植物園":{min:0,avg:0,max:0,trend:"+10%",reason:"スラバヤ植物園：入園無料。"},
        "🛕 アンペル・モスク":{min:0,avg:0,max:0,trend:"+10%",reason:"アンペル・モスク：参拝無料。スラバヤ最古のモスク。"},
        "🍚 ナシペセル":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ナシペセル：25,000〜100,000IDR。"},
        "🍲 ラウォン":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ラウォン：25,000〜100,000IDR。スラバヤ風黒スープ。"},
        "🍢 サテ・クロポ":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
        "🍜 ミー・ジャワ":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ミー・ジャワ：25,000〜100,000IDR。"},
        "🍲 ソトアヤム":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ソトアヤム：25,000〜100,000IDR。チキンスープ。"},
        "🥗 ガドガド・スラバヤ":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ガドガド：25,000〜100,000IDR。野菜のピーナッツソースサラダ。"},
        "🍰 クエ・ラピス":{min:15000,avg:35000,max:80000,trend:"+10%",reason:"クエ・ラピス：15,000〜80,000IDR。"},
        "🥤 エスドゥガン":{min:15000,avg:25000,max:50000,trend:"+10%",reason:"エス・ドゥガン：15,000〜50,000IDR。ココナッツ氷ドリンク。"},
      },
      ロンボク:{
        "🏔️ リンジャニ山":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🏔️ リンジャニ山：見学・体験。"},
        "🏖️ ギリ・トラワンガン":{min:50000,avg:150000,max:300000,trend:"+10%",reason:"ギリ・トラワンガン：船代50,000〜300,000IDR。パーティ島。"},
        "🏖️ ギリ・メノ":{min:50000,avg:150000,max:300000,trend:"+10%",reason:"ギリ・メノ：船代50,000〜300,000IDR。最も静かな島。"},
        "🏖️ ギリ・エア":{min:50000,avg:150000,max:300000,trend:"+10%",reason:"ギリ・エア：船代50,000〜300,000IDR。"},
        "🏖️ クタ・ビーチ・ロンボク":{min:0,avg:0,max:0,trend:"+10%",reason:"クタビーチ：入場無料。"},
        "🌊 ピンクビーチ":{min:300000,avg:500000,max:800000,trend:"+10%",reason:"ロンボク・ピンクビーチ：300,000〜800,000IDR。"},
        "🛕 リンサル寺院":{min:15000,avg:15000,max:15000,trend:"+10%",reason:"リンサル寺院：15,000IDR。ロンボクのバリ系寺院。"},
        "🏛️ マタラム博物館":{min:10000,avg:10000,max:10000,trend:"+10%",reason:"マタラム博物館：10,000IDR。ロンボク歴史博物館。"},
        "🌊 ティウ・クレップ滝":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"ティウ・クレップ滝：30,000〜100,000IDR。"},
        "🌳 サスバビレッジ":{min:30000,avg:50000,max:100000,trend:"+10%",reason:"サスバ・ビレッジ：30,000〜100,000IDR。伝統村。"},
        "🦞 シーフード":{min:80000,avg:200000,max:500000,trend:"+10%",reason:"シーフード：80,000〜500,000IDR。"},
        "🍚 ナシ・プチェル":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ナシ・プチェル：25,000〜100,000IDR。"},
        "🍢 サテ":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
        "🌶️ アヤム・タリワン":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"アヤム・タリワン：30,000〜150,000IDR。ロンボク辛い鶏。"},
        "🥘 プレチン":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"プレチン：25,000〜100,000IDR。"},
        "🍲 ベベラック":{min:80000,avg:150000,max:300000,trend:"+10%",reason:"ベベック（アヒル料理）：80,000〜300,000IDR。"},
        "🥥 ココナッツ":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"ココナッツ：15,000〜60,000IDR。"},
        "🍦 トロピカルフルーツ":{min:15000,avg:35000,max:80000,trend:"+10%",reason:"トロピカルフルーツ：15,000〜80,000IDR。"},
      },
      コモド:{
        "🐲 コモドドラゴン":{min:300000,avg:500000,max:1000000,trend:"+10%",reason:"コモド国立公園：入場300,000IDR、ガイド付き500,000〜1,000,000IDR。世界最大のトカゲ。"},
        "🏝️ コモド島":{min:300000,avg:500000,max:800000,trend:"+10%",reason:"コモド島：300,000〜800,000IDR。"},
        "🏝️ リンチャ島":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🏝️ リンチャ島：見学・体験。"},
        "🏝️ パダール島":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🏝️ パダール島：見学・体験。"},
        "🌊 ピンクビーチ":{min:300000,avg:500000,max:800000,trend:"+10%",reason:"ロンボク・ピンクビーチ：300,000〜800,000IDR。"},
        "🐠 マンタポイント":{min:1500000,avg:2500000,max:4000000,trend:"+10%",reason:"マンタポイント：シュノーケル1,500,000〜2,500,000IDR、ダイブ4,000,000IDR。"},
        "🤿 シュノーケリング":{min:300000,avg:800000,max:2000000,trend:"+10%",reason:"コモド・シュノーケリング：300,000〜2,000,000IDR。"},
        "🐋 ボートツアー":{min:1000000,avg:2500000,max:5000000,trend:"+10%",reason:"コモド・ボートツアー：1,000,000〜5,000,000IDR。"},
        "🌅 サンセットクルーズ":{min:300000,avg:500000,max:800000,trend:"+10%",reason:"コモドサンセットクルーズ：300,000〜800,000IDR。"},
        "🌳 国立公園":{min:300000,avg:500000,max:1000000,trend:"+10%",reason:"コモド国立公園：300,000〜1,000,000IDR。"},
        "🐟 シーフード":{min:80000,avg:200000,max:500000,trend:"+10%",reason:"シーフード：80,000〜500,000IDR。"},
        "🦞 ロブスター":{min:300000,avg:800000,max:2000000,trend:"+10%",reason:"ロブスター：300,000〜2,000,000IDR。"},
        "🍚 ナシ・チャンプル":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🍚 ナシ・チャンプル：見学・体験。"},
        "🍢 サテ":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
        "🌶️ サンバル":{min:5000,avg:10000,max:30000,trend:"+10%",reason:"サンバル：5,000〜30,000IDR。インドネシア辛味ソース。"},
        "🥥 ココナッツ":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"ココナッツ：15,000〜60,000IDR。"},
        "🍦 アイス":{min:10000,avg:25000,max:60000,trend:"+10%",reason:"アイス：10,000〜60,000IDR。"},
        "🍻 ビンタンビール":{min:30000,avg:60000,max:120000,trend:"+10%",reason:"ビンタンビール：30,000〜120,000IDR。"},
      },
      バンドン:{
        "🏛️ ゲドゥン・サテ":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
        "🌋 タンクバン・プラフ":{min:200000,avg:200000,max:200000,trend:"+10%",reason:"タンクバン・プラフ：200,000IDR（外国人）。アクティブな火山口。"},
        "🌳 カワプティ":{min:100000,avg:100000,max:100000,trend:"+10%",reason:"カワ・プティ：100,000IDR。神秘的な白い湖。"},
        "🛍️ ジャラン・ブラガ":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🛍️ ジャラン・ブラガ：見学・体験。"},
        "🏛️ アジア・アフリカ会議博物館":{min:0,avg:0,max:0,trend:"+10%",reason:"アジア・アフリカ会議博物館：入場無料。1955年バンドン会議の記念博物館。"},
        "🏖️ パプンダヤン":{min:200000,avg:300000,max:500000,trend:"+10%",reason:"パプンダヤン山：200,000〜500,000IDR。バンドン郊外の活火山。"},
        "🌳 マリベヤ":{min:50000,avg:100000,max:200000,trend:"+10%",reason:"マリベヤ・ハイランド：50,000〜200,000IDR。"},
        "🛍️ パサールバル":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🛍️ パサールバル：見学・体験。"},
        "☕ コーヒー博物館":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"コーヒー博物館：25,000〜100,000IDR。"},
        "🏛️ バンドン地質博物館":{min:10000,avg:10000,max:10000,trend:"+10%",reason:"バンドン地質博物館：10,000IDR。"},
        "🍚 ナシティンブル":{min:30000,avg:60000,max:120000,trend:"+10%",reason:"ナシ・ティンブル：30,000〜120,000IDR。バンブー包みスンダ料理。"},
        "🍲 バクソ":{min:20000,avg:40000,max:80000,trend:"+10%",reason:"バクソ：20,000〜80,000IDR。"},
        "🍵 バンドンコーヒー":{min:15000,avg:30000,max:80000,trend:"+10%",reason:"バンドンコーヒー：15,000〜80,000IDR。"},
        "🍰 ピサンモーレン":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"ピサン・モーレン：15,000〜60,000IDR。"},
        "🍞 バンドンパン":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"バンドンパン：15,000〜60,000IDR。"},
        "🥘 スンダ料理":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"スンダ料理：30,000〜150,000IDR。"},
        "🥤 エスチェンドル":{min:15000,avg:25000,max:50000,trend:"+10%",reason:"エス・チェンドル：15,000〜50,000IDR。"},
        "🍢 サテ・マラング":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
      },
      メダン:{
        "🛕 マイモン宮殿":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🛕 マイモン宮殿：見学・体験。"},
        "🛕 グレートモスク":{min:0,avg:0,max:0,trend:"+10%",reason:"メダン大モスク：参拝無料。マレー風の壮麗なモスク。"},
        "🌋 シナブン火山":{min:300000,avg:600000,max:1500000,trend:"+10%",reason:"シナブン火山：300,000〜1,500,000IDR。"},
        "🌊 トバ湖(郊外)":{min:0,avg:300000,max:800000,trend:"+10%",reason:"トバ湖：見学無料、フェリー300,000〜800,000IDR。世界最大の火山湖。"},
        "🏝️ サモシール島":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🏝️ サモシール島：見学・体験。"},
        "🏛️ メダン博物館":{min:10000,avg:10000,max:10000,trend:"+10%",reason:"メダン博物館：10,000IDR。"},
        "🏛️ ラフレシア・ティティ・ボボックロ":{min:50000,avg:100000,max:200000,trend:"+10%",reason:"ラフレシア観賞ツアー：50,000〜200,000IDR。世界最大の花。"},
        "🏘️ クボン・ビナタン":{min:15000,avg:15000,max:15000,trend:"+10%",reason:"クボン・ビナタン（メダン動物園）：15,000IDR。"},
        "🛍️ パサール・パギ":{min:0,avg:0,max:0,trend:"+10%",reason:"パサール・パギ：散策無料。メダンの朝市。"},
        "🏛️ ガンドール文化村":{min:50000,avg:100000,max:200000,trend:"+10%",reason:"ガンドール文化村：50,000〜200,000IDR。バタック文化体験。"},
        "🍚 ナシ・パダン":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"ナシ・パダン：30,000〜150,000IDR。スマトラ風混ぜご飯。"},
        "🍲 ソトメダン":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ソト：25,000〜100,000IDR。"},
        "🍢 サテ・パダン":{min:30000,avg:60000,max:150000,trend:"+10%",reason:"サテ：30,000〜150,000IDR。串焼き。"},
        "🥘 レンダン":{min:50000,avg:100000,max:250000,trend:"+10%",reason:"レンダン：50,000〜250,000IDR。CNN世界一の料理。"},
        "🍜 ミ・アチェ":{min:25000,avg:50000,max:100000,trend:"+10%",reason:"ミ・アチェ：25,000〜100,000IDR。"},
        "🍰 ビカ・アンボン":{min:0,avg:50000,max:200000,trend:"+10%",reason:"🍰 ビカ・アンボン：見学・体験。"},
        "🍵 ドリアン":{min:50000,avg:150000,max:400000,trend:"+10%",reason:"ドリアン：50,000〜400,000IDR。"},
        "🥤 タミラ":{min:15000,avg:30000,max:60000,trend:"+10%",reason:"タミラ：15,000〜60,000IDR。"},
      },
    },
  },
  マレーシア:{
    food:{
      "🏪 コンビニ":{min:3,avg:8,max:20,trend:"+10%",reason:"7-Eleven軽食3〜20RM。"},
      "🍢 屋台":{min:5,avg:10,max:25,trend:"+10%",reason:"ホーカー5〜25RM。"},
      "🍜 ローカル食堂":{min:8,avg:18,max:35,trend:"+10%",reason:"ママック8〜35RM。"},
      "🍣 チェーン":{min:10,avg:20,max:40,trend:"+10%",reason:"マック・KFC10〜40RM。"},
      "🍽️ カジュアル":{min:20,avg:40,max:80,trend:"+10%",reason:"カジュアル20〜80RM/人。"},
      "🥂 中級":{min:40,avg:80,max:150,trend:"+10%",reason:"中級40〜150RM/人。"},
      "🥩 高級":{min:100,avg:200,max:400,trend:"+10%",reason:"高級100〜400RM/人。"},
      "👑 超高級":{min:300,avg:500,max:1500,trend:"+12%",reason:"超高級300〜1,500RM/人。"},
      "🌅 朝食":{min:5,avg:15,max:40,trend:"+10%",reason:"朝食5〜40RM。"},
      "☀️ ランチ":{min:10,avg:25,max:60,trend:"+10%",reason:"ランチ10〜60RM。"},
      "🌆 ディナー":{min:25,avg:60,max:150,trend:"+10%",reason:"ディナー25〜150RM/人。"},
      "🍱 テイクアウト":{min:8,avg:18,max:40,trend:"+10%",reason:"テイクアウト8〜40RM。"},
      "☕ カフェ軽食":{min:8,avg:18,max:35,trend:"+10%",reason:"カフェ軽食8〜35RM。"},
      "🌙 夜食":{min:8,avg:20,max:50,trend:"+10%",reason:"屋台夜食8〜50RM。"},
    },
    drink:{
      "🥤 ペットボトル水":{min:2,avg:3,max:6,trend:"+8%",reason:"水500ml 2〜6RM。"},
      "🥤 ソフトドリンク":{min:3,avg:5,max:10,trend:"+10%",reason:"コーラ3〜10RM。"},
      "☕ コーヒー":{min:3,avg:8,max:18,trend:"+10%",reason:"コピ・コーヒー3〜18RM。"},
      "🍵 紅茶":{min:3,avg:5,max:12,trend:"+10%",reason:"テタリック3〜12RM。"},
      "🧃 ジュース":{min:5,avg:10,max:20,trend:"+10%",reason:"ジュース5〜20RM。"},
      "🍺 ビール":{min:15,avg:25,max:40,trend:"+12%",reason:"タイガー15〜40RM。"},
      "🍷 ワイン":{min:30,avg:60,max:200,trend:"+12%",reason:"ワイン30〜200RM。"},
      "🍹 カクテル":{min:30,avg:50,max:100,trend:"+12%",reason:"カクテル30〜100RM。"},
      "🥛 牛乳":{min:3,avg:5,max:12,trend:"+8%",reason:"牛乳1L 3〜12RM。"},
      "🍶 リキュール":{min:15,avg:30,max:80,trend:"+12%",reason:"アラック15〜80RM/杯。"},
    },
    taxi:{
      "🚖 短距離":{min:8,avg:15,max:30,trend:"+10%",reason:"短距離8〜30RM。"},
      "🚖 中距離":{min:20,avg:40,max:80,trend:"+10%",reason:"中距離20〜80RM。"},
      "🚖 長距離":{min:50,avg:100,max:250,trend:"+10%",reason:"長距離50〜250RM。"},
      "✈️ 空港":{min:80,avg:130,max:200,trend:"+10%",reason:"KLIA〜KL市内80〜200RM。"},
      "🌙 深夜":{min:15,avg:30,max:80,trend:"+15%",reason:"深夜+10〜20RM。"},
      "🚗 配車アプリ":{min:8,avg:25,max:60,trend:"+10%",reason:"Grabが主流。"},
    },
    hotel:{
      "🏨 格安ホステル":{min:30,avg:80,max:150,trend:"+10%",reason:"ホステル30〜150RM/泊。"},
      "🏨 3つ星":{min:120,avg:250,max:400,trend:"+12%",reason:"3つ星120〜400RM/泊。"},
      "🏨 4つ星":{min:250,avg:500,max:900,trend:"+12%",reason:"4つ星250〜900RM/泊。"},
      "🏨 5つ星":{min:500,avg:1200,max:3000,trend:"+15%",reason:"5つ星500〜3,000RM/泊。"},
      "🏠 民泊・Airbnb":{min:80,avg:200,max:500,trend:"+12%",reason:"Airbnb80〜500RM/泊。"},
    },
    shopping:{
      "👕 衣料":{min:30,avg:100,max:500,trend:"+8%",reason:"衣料30〜500RM。"},
      "💄 コスメ":{min:15,avg:50,max:200,trend:"+8%",reason:"コスメ15〜200RM。"},
      "🛒 スーパー":{min:2,avg:15,max:80,trend:"+8%",reason:"スーパー2〜80RM。"},
      "🎁 おみやげ":{min:10,avg:40,max:150,trend:"+10%",reason:"おみやげ10〜150RM。"},
      "💻 家電":{min:100,avg:800,max:8000,trend:"+8%",reason:"家電100〜8,000RM。"},
    },
    activity:{
      "🏛️ 観光入場":{min:0,avg:50,max:130,trend:"+10%",reason:"ペトロナス98RM、バトゥ洞窟無料、KLタワー60RM。"},
      "🤿 アクティビティ":{min:50,avg:200,max:600,trend:"+10%",reason:"アクティビティ50〜600RM。"},
      "💆 マッサージ":{min:40,avg:100,max:300,trend:"+10%",reason:"マッサージ40〜300RM/時。"},
      "🎭 エンタメ":{min:30,avg:100,max:300,trend:"+10%",reason:"エンタメ30〜300RM。"},
      "🚌 ツアー":{min:50,avg:150,max:500,trend:"+10%",reason:"日帰りツアー50〜500RM。"},
    },
    famous:{
      クアラルンプール:{
        "🗼 ペトロナスツインタワー":{min:98,avg:98,max:130,trend:"+10%",reason:"ペトロナスツインタワー：大人98RM（特別休日130RM）。88階建てのKLランドマーク。"},
        "🗼 KLタワー":{min:60,avg:60,max:120,trend:"+10%",reason:"KLタワー：展望台60RM、スカイデック120RM。世界第7位の高さ421m。"},
        "🛕 バトゥ洞窟":{min:0,avg:0,max:0,trend:"+10%",reason:"バトゥ洞窟：入場無料。272段カラフル階段＆43m黄金ムルガン神像。"},
        "🏛️ 国立モスク":{min:0,avg:0,max:0,trend:"+10%",reason:"国立モスク：入場無料。マレーシア宗教的中心。"},
        "🛍️ ブキッ・ビンタン":{min:0,avg:0,max:0,trend:"+10%",reason:"ブキ・ビンタン：散策無料。KL最大のショッピング＆エンタメ地区。"},
        "🏰 メルデカ広場":{min:0,avg:0,max:0,trend:"+10%",reason:"ムルデカ広場：見学無料。マレーシア独立宣言の地。"},
        "🌳 KLCC公園":{min:0,avg:0,max:0,trend:"+10%",reason:"KLCC公園：入園無料。ペトロナス前。噴水ショーが名物。"},
        "🏛️ 国立博物館":{min:5,avg:5,max:5,trend:"+10%",reason:"国立博物館：5RM。"},
        "🏘️ チャイナタウン":{min:0,avg:0,max:0,trend:"+10%",reason:"プタリン通り（チャイナタウン）：散策無料。"},
        "🛍️ セントラルマーケット":{min:0,avg:0,max:0,trend:"+10%",reason:"セントラルマーケット：散策無料。マレーシア工芸品。"},
        "🍛 ナシレマ":{min:5,avg:12,max:30,trend:"+10%",reason:"ナシレマ：5〜30RM。マレーシア国民食。ココナッツライスとサンバル。"},
        "🍜 ラクサ":{min:10,avg:18,max:35,trend:"+10%",reason:"ラクサ：10〜35RM。マレー風ココナッツカレー麺。"},
        "🍢 サテ":{min:1,avg:2,max:5,trend:"+10%",reason:"サテ：1串1〜5RM。10〜20本で1人前。"},
        "🍗 チキンライス(海南鶏飯)":{min:10,avg:18,max:35,trend:"+10%",reason:"海南チキンライス：10〜35RM。"},
        "🍛 ロティチャナイ":{min:2,avg:5,max:10,trend:"+10%",reason:"ロティチャナイ：2〜10RM。インド系薄焼きパン。"},
        "🍲 バクテー":{min:20,avg:35,max:60,trend:"+10%",reason:"バクテー：20〜60RM。豚骨スープ薬膳料理。"},
        "🥘 チャークイティオ":{min:8,avg:15,max:30,trend:"+10%",reason:"チャークイテオ：8〜30RM。エビ入り炒め麺。ペナン名物。"},
        "🍢 ナシゴレン":{min:8,avg:15,max:30,trend:"+10%",reason:"ナシゴレン：8〜30RM。"},
      },
      ペナン:{
        "🏘️ ジョージタウン":{min:5,avg:30,max:100,trend:"+10%",reason:"🏘️ ジョージタウン：マレーシア観光。"},
        "🎨 ストリートアート":{min:0,avg:0,max:0,trend:"+10%",reason:"ペナン・ストリートアート：見学無料。ジョージタウン世界遺産。"},
        "🏛️ コムタタワー":{min:68,avg:68,max:88,trend:"+10%",reason:"コムタタワー：68〜88RM。ペナン最高層展望台。"},
        "🛕 極楽寺":{min:5,avg:30,max:100,trend:"+10%",reason:"🛕 極楽寺：マレーシア観光。"},
        "🛕 ペナンヒル":{min:30,avg:30,max:30,trend:"+10%",reason:"ペナンヒル：ケーブルカー往復30RM。ペナン島絶景。"},
        "🏛️ ペナン博物館":{min:1,avg:1,max:1,trend:"+10%",reason:"ペナン州立博物館：1RM（破格）。"},
        "🏰 コーンウォリス砦":{min:5,avg:30,max:100,trend:"+10%",reason:"🏰 コーンウォリス砦：マレーシア観光。"},
        "🛕 蛇寺院":{min:0,avg:0,max:0,trend:"+10%",reason:"蛇寺院：参拝無料。生きた蛇が祀られた寺院。"},
        "🏖️ バトゥフェリンギビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"バトゥ洞窟：入場無料。272段カラフル階段＆43m黄金ムルガン神像。"},
        "🏛️ ペナンモスク":{min:0,avg:0,max:0,trend:"+10%",reason:"クーリン・モスク：参拝無料。マレー風モスク。"},
        "🍜 ペナンラクサ":{min:10,avg:18,max:35,trend:"+10%",reason:"ラクサ：10〜35RM。マレー風ココナッツカレー麺。"},
        "🍝 チャークイティオ":{min:8,avg:15,max:30,trend:"+10%",reason:"チャークイテオ：8〜30RM。エビ入り炒め麺。ペナン名物。"},
        "🍢 ナシカンダ":{min:10,avg:20,max:40,trend:"+10%",reason:"ナシ・カンダール：10〜40RM。インド系マレー料理。"},
        "🍲 ホッケンミー":{min:8,avg:15,max:30,trend:"+10%",reason:"ホッケンミー：8〜30RM。エビ風味スープ麺。"},
        "🍗 ペナンチャーシュー":{min:15,avg:25,max:50,trend:"+10%",reason:"ペナンチャーシュー：15〜50RM。"},
        "🍞 ロティバカール":{min:3,avg:6,max:12,trend:"+10%",reason:"ロティバカール：3〜12RM。"},
        "🍰 セムニャ":{min:5,avg:10,max:20,trend:"+10%",reason:"セムニャ：5〜20RM。マラッカ・ペナンスイーツ。"},
        "🍰 タンディキッ":{min:5,avg:10,max:20,trend:"+10%",reason:"タンディキッ：5〜20RM。"},
      },
      コタキナバル:{
        "🏔️ キナバル山":{min:50,avg:300,max:1500,trend:"+10%",reason:"キナバル国立公園：50RM、登山ツアー300〜1,500RM。東南アジア最高峰4095m。"},
        "🏝️ マヌカン島":{min:25,avg:50,max:100,trend:"+10%",reason:"マヌカン島：船代込25〜100RM。TAR海洋公園。"},
        "🏝️ サピ島":{min:25,avg:50,max:100,trend:"+10%",reason:"サピ島：船代込25〜100RM。シュノーケル人気。"},
        "🏝️ マムティック島":{min:25,avg:50,max:100,trend:"+10%",reason:"マムティック島：船代込25〜100RM。"},
        "🌊 サピ・マムティックビーチ":{min:25,avg:50,max:100,trend:"+10%",reason:"サピ島：船代込25〜100RM。シュノーケル人気。"},
        "🏞️ キナバル国立公園":{min:50,avg:300,max:1500,trend:"+10%",reason:"キナバル国立公園：50RM、登山ツアー300〜1,500RM。東南アジア最高峰4095m。"},
        "🛕 コタキナバル市立モスク":{min:50,avg:300,max:1500,trend:"+10%",reason:"キナバル国立公園：50RM、登山ツアー300〜1,500RM。東南アジア最高峰4095m。"},
        "🏛️ サバ博物館":{min:15,avg:15,max:15,trend:"+10%",reason:"サバ博物館：15RM。"},
        "🐢 ウミガメ島":{min:300,avg:500,max:800,trend:"+10%",reason:"ウミガメ島：300〜800RM。"},
        "🦧 サンダカン・オランウータン":{min:300,avg:500,max:1000,trend:"+10%",reason:"サンダカン・オランウータンツアー：300〜1,000RM。セピロック有名。"},
        "🐟 シーフード":{min:50,avg:120,max:300,trend:"+10%",reason:"シーフード：50〜300RM。"},
        "🍗 ナシレマ":{min:5,avg:12,max:30,trend:"+10%",reason:"ナシレマ：5〜30RM。マレーシア国民食。ココナッツライスとサンバル。"},
        "🍝 トゥアラン・ミー":{min:10,avg:18,max:35,trend:"+10%",reason:"トゥアラン・ミー：10〜35RM。サバ州名物麺。"},
        "🍲 サバ風ラクサ":{min:10,avg:18,max:35,trend:"+10%",reason:"ラクサ：10〜35RM。マレー風ココナッツカレー麺。"},
        "🥥 ココナッツ":{min:3,avg:6,max:12,trend:"+10%",reason:"ココナッツ：3〜12RM。"},
        "🍰 トロピカルフルーツ":{min:5,avg:15,max:50,trend:"+10%",reason:"トロピカルフルーツ：5〜50RM。"},
        "🦞 シーフードBBQ":{min:50,avg:120,max:300,trend:"+10%",reason:"シーフード：50〜300RM。"},
        "🍻 ボルネオビール":{min:15,avg:25,max:40,trend:"+10%",reason:"ボルネオビール：15〜40RM。"},
      },
      マラッカ:{
        "🏰 サンチアゴ砦(ア・ファモーザ)":{min:0,avg:0,max:0,trend:"+10%",reason:"ア・ファモサ：見学無料。16世紀ポルトガル要塞の遺構。"},
        "⛪ セントポール教会":{min:5,avg:30,max:100,trend:"+10%",reason:"⛪ セントポール教会：マレーシア観光。"},
        "🛕 チェンフーテン寺":{min:0,avg:0,max:0,trend:"+10%",reason:"青雲亭：参拝無料。マレーシア最古の中華寺院（1645年）。"},
        "🏛️ オランダ広場":{min:0,avg:0,max:0,trend:"+10%",reason:"オランダ広場（ダッチスクエア）：散策無料。スタダイス前の赤い広場。"},
        "🏛️ ジョンカーストリート":{min:0,avg:0,max:0,trend:"+10%",reason:"ジョンカー・ストリート：散策無料。週末ナイトマーケット。"},
        "🏛️ マラッカ・サルタネート宮殿":{min:5,avg:5,max:5,trend:"+10%",reason:"マラッカ・スルタン宮殿博物館：5RM。"},
        "🏛️ 海洋博物館":{min:10,avg:10,max:10,trend:"+10%",reason:"海洋博物館：10RM。船型博物館。"},
        "🛕 カンプン・クリン・モスク":{min:0,avg:0,max:0,trend:"+10%",reason:"カンプンクリン・モスク：参拝無料。スマトラ建築様式（1748年）。"},
        "🚣 マラッカ川クルーズ":{min:30,avg:30,max:30,trend:"+10%",reason:"マラッカ川クルーズ：30RM。45分のクルーズ。"},
        "🌳 マラッカ動物園":{min:12,avg:12,max:12,trend:"+10%",reason:"マラッカ動物園：12RM。"},
        "🍝 ニョニャラクサ":{min:10,avg:18,max:35,trend:"+10%",reason:"ラクサ：10〜35RM。マレー風ココナッツカレー麺。"},
        "🍗 海南鶏飯":{min:10,avg:18,max:35,trend:"+10%",reason:"海南鶏飯：10〜35RM。"},
        "🍢 サテ・チェルプ":{min:1,avg:2,max:5,trend:"+10%",reason:"サテ：1串1〜5RM。10〜20本で1人前。"},
        "🍰 ニョニャクエ":{min:5,avg:10,max:25,trend:"+10%",reason:"ニョニャ菓子：5〜25RM。"},
        "🍜 アッサムラクサ":{min:10,avg:18,max:35,trend:"+10%",reason:"ラクサ：10〜35RM。マレー風ココナッツカレー麺。"},
        "🍞 ロティチャナイ":{min:2,avg:5,max:10,trend:"+10%",reason:"ロティチャナイ：2〜10RM。インド系薄焼きパン。"},
        "🍰 セムニャ":{min:5,avg:10,max:20,trend:"+10%",reason:"セムニャ：5〜20RM。マラッカ・ペナンスイーツ。"},
        "🥤 シェンドル":{min:5,avg:10,max:20,trend:"+10%",reason:"チェンドル：5〜20RM。"},
      },
      ランカウイ:{
        "🦅 ランカウイの鷲":{min:0,avg:0,max:0,trend:"+10%",reason:"鷲の広場：見学無料。クア・タウンのシンボル像。"},
        "🚠 スカイブリッジ・スカイカブ":{min:35,avg:55,max:85,trend:"+10%",reason:"ランカウイ・スカイブリッジ：35〜85RM（ケーブルカー込み）。"},
        "🏝️ パヤール島":{min:300,avg:500,max:800,trend:"+10%",reason:"パヤール島：300〜800RM。海洋公園。"},
        "🏖️ チェナンビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"パンタイ・チェナン：入場無料。ランカウイ最人気ビーチ。"},
        "🏖️ ブラックサンドビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"ブラックサンドビーチ：入場無料。"},
        "🏝️ ダヤン・ブンティン島":{min:50,avg:100,max:200,trend:"+10%",reason:"ダヤン・ブンティン島：50〜200RM。妊婦の湖伝説。"},
        "🌊 マングローブツアー":{min:5,avg:30,max:100,trend:"+10%",reason:"🌊 マングローブツアー：マレーシア観光。"},
        "🏛️ ランカウイ博物館":{min:15,avg:15,max:15,trend:"+10%",reason:"ランカウイ・ガレリア・パードゥカ：15RM。"},
        "🌊 セブンウェル滝":{min:15,avg:15,max:15,trend:"+10%",reason:"セブンウェル滝：15RM。"},
        "🛍️ ランカウイ・パレード":{min:0,avg:0,max:0,trend:"+10%",reason:"ランカウイ・パレード：散策無料。免税ショッピング。"},
        "🍝 ナシレマ":{min:5,avg:12,max:30,trend:"+10%",reason:"ナシレマ：5〜30RM。マレーシア国民食。ココナッツライスとサンバル。"},
        "🍜 ラクサ":{min:10,avg:18,max:35,trend:"+10%",reason:"ラクサ：10〜35RM。マレー風ココナッツカレー麺。"},
        "🦞 シーフード":{min:50,avg:120,max:300,trend:"+10%",reason:"シーフード：50〜300RM。"},
        "🐟 イカフライ":{min:15,avg:35,max:80,trend:"+10%",reason:"イカフライ：15〜80RM。"},
        "🦀 チリクラブ":{min:60,avg:150,max:350,trend:"+10%",reason:"チリクラブ：60〜350RM。"},
        "🥥 ココナッツ":{min:3,avg:6,max:12,trend:"+10%",reason:"ココナッツ：3〜12RM。"},
        "🍢 サテ":{min:1,avg:2,max:5,trend:"+10%",reason:"サテ：1串1〜5RM。10〜20本で1人前。"},
        "🥤 トロピカルジュース":{min:5,avg:10,max:20,trend:"+10%",reason:"トロピカルジュース：5〜20RM。"},
      },
      ジョホールバル:{
        "🏰 スルタン・アブ・バカル・モスク":{min:0,avg:0,max:0,trend:"+10%",reason:"スルタン・アブ・バカル・モスク：参拝無料。ヴィクトリア朝風モスク。"},
        "🏛️ ジョホールバル動物園":{min:6,avg:6,max:8,trend:"+10%",reason:"ジョホール動物園：6〜8RM。マレーシア最古（1928年）。"},
        "🛍️ シティスクエア":{min:0,avg:0,max:0,trend:"+10%",reason:"シティ・スクエア・モール：散策無料。"},
        "🎢 レゴランド・マレーシア":{min:189,avg:259,max:339,trend:"+10%",reason:"レゴランド・マレーシア：189〜339RM。アジア初のレゴランド。"},
        "🛕 グレートチェンソウ寺院":{min:0,avg:0,max:0,trend:"+10%",reason:"Telok Cengkok Tua Temple：参拝無料。"},
        "🏰 ダタラン・バンダラヤ":{min:0,avg:0,max:0,trend:"+10%",reason:"ダタラン・バンダラヤ：見学無料。"},
        "🏛️ ジョホール州博物館":{min:5,avg:5,max:5,trend:"+10%",reason:"ロイヤルアブバカル博物館：5RM。"},
        "🛍️ ジョホールバル・ジャラン":{min:0,avg:0,max:0,trend:"+10%",reason:"ジョホールバル・ジャラン：散策無料。"},
        "🏖️ デサル・ビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"デサル海岸：入場無料。"},
        "🌳 イスタナ・ガーデン":{min:0,avg:0,max:0,trend:"+10%",reason:"イスタナ・ガーデン：見学無料。"},
        "🍢 サテ":{min:1,avg:2,max:5,trend:"+10%",reason:"サテ：1串1〜5RM。10〜20本で1人前。"},
        "🍜 ラクサ":{min:10,avg:18,max:35,trend:"+10%",reason:"ラクサ：10〜35RM。マレー風ココナッツカレー麺。"},
        "🍗 ナシレマ":{min:5,avg:12,max:30,trend:"+10%",reason:"ナシレマ：5〜30RM。マレーシア国民食。ココナッツライスとサンバル。"},
        "🍲 バクテー":{min:20,avg:35,max:60,trend:"+10%",reason:"バクテー：20〜60RM。豚骨スープ薬膳料理。"},
        "🍝 ミー・レブス":{min:8,avg:15,max:30,trend:"+10%",reason:"ミー・レブス：8〜30RM。"},
        "🥘 オタオタ":{min:5,avg:10,max:25,trend:"+10%",reason:"オタオタ：5〜25RM。魚のすり身焼き。"},
        "🍰 ニョニャクエ":{min:5,avg:10,max:25,trend:"+10%",reason:"ニョニャ菓子：5〜25RM。"},
        "🥤 シェンドル":{min:5,avg:10,max:20,trend:"+10%",reason:"チェンドル：5〜20RM。"},
      },
      イポー:{
        "🛕 ケッロクトン洞窟寺":{min:0,avg:0,max:0,trend:"+10%",reason:"ケッロクトン洞窟寺：参拝無料。中華系仏教洞窟寺院。"},
        "🛕 サムポトン洞窟寺":{min:0,avg:0,max:0,trend:"+10%",reason:"サムポー・タン洞窟：参拝無料。"},
        "🛕 ペラトン洞窟寺":{min:0,avg:0,max:0,trend:"+10%",reason:"ペラック・トン洞窟：参拝無料。450段の階段。"},
        "🏛️ 旧駅":{min:0,avg:0,max:0,trend:"+10%",reason:"イポー駅：見学無料。「アジアのタージマハル」と呼ばれる白亜駅舎。"},
        "🏛️ ハン・チン・ペット・ソー":{min:5,avg:30,max:100,trend:"+10%",reason:"🏛️ ハン・チン・ペット・ソー：マレーシア観光。"},
        "🏘️ コンクリート・ジャングル":{min:0,avg:0,max:0,trend:"+10%",reason:"コンクリート・ジャングル：散策無料。"},
        "🛍️ イポー旧市街":{min:0,avg:0,max:0,trend:"+10%",reason:"イポー旧市街：散策無料。コロニアル建築・ストリートアート。"},
        "🏰 ヘリテージビル":{min:0,avg:0,max:0,trend:"+10%",reason:"ヘリテージビル：見学無料。"},
        "🌳 グリーンタウン":{min:0,avg:0,max:0,trend:"+10%",reason:"グリーンタウン：散策無料。"},
        "🛕 関帝廟":{min:0,avg:0,max:0,trend:"+10%",reason:"関帝廟：参拝無料。"},
        "🍗 イポー風モヤシ鶏":{min:15,avg:25,max:50,trend:"+10%",reason:"イポー風モヤシ鶏：15〜50RM。"},
        "🥄 ホワイトコーヒー":{min:3,avg:8,max:18,trend:"+10%",reason:"イポー・ホワイトコーヒー：3〜18RM。発祥地。"},
        "🍜 イポーホーファン":{min:8,avg:15,max:30,trend:"+10%",reason:"ホー・フォン：8〜30RM。イポー名物。"},
        "🍢 サテ":{min:1,avg:2,max:5,trend:"+10%",reason:"サテ：1串1〜5RM。10〜20本で1人前。"},
        "🍞 ロティ・カネ":{min:2,avg:5,max:10,trend:"+10%",reason:"ロティ・カネ：2〜10RM。"},
        "🍰 シューマイ・イポー":{min:3,avg:8,max:15,trend:"+10%",reason:"シューマイ：3〜15RM。"},
        "🥘 ナシレマ":{min:5,avg:12,max:30,trend:"+10%",reason:"ナシレマ：5〜30RM。マレーシア国民食。ココナッツライスとサンバル。"},
        "🥤 アイス・カチャン":{min:5,avg:10,max:20,trend:"+10%",reason:"アイス・カチャン：5〜20RM。"},
      },
      クチン:{
        "🐱 クチン猫の像・猫博物館":{min:0,avg:0,max:0,trend:"+10%",reason:"クチン猫の像・猫博物館：入場無料。クチン＝「猫」。"},
        "🏛️ サラワク博物館":{min:5,avg:30,max:100,trend:"+10%",reason:"🏛️ サラワク博物館：マレーシア観光。"},
        "🏰 アスタナ宮殿":{min:0,avg:0,max:0,trend:"+10%",reason:"アスタナ宮殿：見学無料（外観）。"},
        "🛕 トゥアペックコン廟":{min:0,avg:0,max:0,trend:"+10%",reason:"トゥアペックコン廟：参拝無料。"},
        "🏞️ バコ国立公園":{min:30,avg:30,max:80,trend:"+10%",reason:"バコ国立公園：入園30RM、ボート50RM。テングザル・湿地林。"},
        "🦧 セメンゴ・オランウータン":{min:5,avg:30,max:100,trend:"+10%",reason:"🦧 セメンゴ・オランウータン：マレーシア観光。"},
        "🛍️ サラワク・カルチュラル・ビレッジ":{min:90,avg:90,max:90,trend:"+10%",reason:"サラワク文化村：90RM。先住民族のロングハウス再現。"},
        "🚣 サラワク川クルーズ":{min:30,avg:30,max:30,trend:"+10%",reason:"マラッカ川クルーズ：30RM。45分のクルーズ。"},
        "🛍️ メインバザール":{min:0,avg:0,max:0,trend:"+10%",reason:"メインバザール：散策無料。クチン最古の通り。"},
        "🏞️ ニア国立公園":{min:20,avg:20,max:20,trend:"+10%",reason:"ニア国立公園：20RM。新石器時代の洞窟壁画。"},
        "🍜 サラワク・ラクサ":{min:10,avg:18,max:35,trend:"+10%",reason:"ラクサ：10〜35RM。マレー風ココナッツカレー麺。"},
        "🍝 コロ・ミー":{min:8,avg:15,max:30,trend:"+10%",reason:"コロ・ミー：8〜30RM。サラワク式ドライ麺。"},
        "🍗 アヤム・ペンセム":{min:15,avg:30,max:60,trend:"+10%",reason:"アヤム・ペンセム：15〜60RM。"},
        "🍲 ミー・ジャワ":{min:8,avg:15,max:30,trend:"+10%",reason:"ミー・ジャワ：8〜30RM。"},
        "🥘 アンサクサゴ":{min:15,avg:30,max:60,trend:"+10%",reason:"アンサクサゴ：15〜60RM。サラワク先住民料理。"},
        "🍰 クエ・カピット":{min:5,avg:10,max:25,trend:"+10%",reason:"クエ・カピット：5〜25RM。"},
        "🥥 ココナッツ":{min:3,avg:6,max:12,trend:"+10%",reason:"ココナッツ：3〜12RM。"},
        "🥤 ジャングルジュース":{min:5,avg:10,max:20,trend:"+10%",reason:"ジャングルジュース：5〜20RM。"},
      },
    },
  },
  フィリピン:{
    food:{
      "🏪 コンビニ":{min:30,avg:80,max:200,trend:"+10%",reason:"7-Eleven軽食30〜200PHP。"},
      "🍢 屋台":{min:30,avg:80,max:200,trend:"+10%",reason:"カレンデリア30〜200PHP。"},
      "🍜 ローカル食堂":{min:80,avg:200,max:400,trend:"+10%",reason:"カレンデリア80〜400PHP。"},
      "🍣 チェーン":{min:100,avg:250,max:500,trend:"+10%",reason:"ジョリビー100〜500PHP。"},
      "🍽️ カジュアル":{min:200,avg:500,max:1000,trend:"+10%",reason:"カジュアル200〜1,000PHP/人。"},
      "🥂 中級":{min:500,avg:1000,max:2000,trend:"+10%",reason:"中級500〜2,000PHP/人。"},
      "🥩 高級":{min:1000,avg:2500,max:5000,trend:"+10%",reason:"高級1,000〜5,000PHP/人。"},
      "👑 超高級":{min:3000,avg:6000,max:15000,trend:"+12%",reason:"超高級3,000〜15,000PHP/人。"},
      "🌅 朝食":{min:80,avg:200,max:500,trend:"+10%",reason:"朝食80〜500PHP。シログが定番。"},
      "☀️ ランチ":{min:150,avg:400,max:800,trend:"+10%",reason:"ランチ150〜800PHP。"},
      "🌆 ディナー":{min:300,avg:700,max:1500,trend:"+10%",reason:"ディナー300〜1,500PHP/人。"},
      "🍱 テイクアウト":{min:100,avg:200,max:500,trend:"+10%",reason:"テイクアウト100〜500PHP。"},
      "☕ カフェ軽食":{min:80,avg:200,max:500,trend:"+10%",reason:"カフェ軽食80〜500PHP。"},
      "🌙 夜食":{min:100,avg:250,max:600,trend:"+10%",reason:"夜食100〜600PHP。"},
    },
    drink:{
      "🥤 ペットボトル水":{min:20,avg:35,max:80,trend:"+8%",reason:"水500ml 20〜80PHP。"},
      "🥤 ソフトドリンク":{min:40,avg:80,max:150,trend:"+10%",reason:"コーラ40〜150PHP。"},
      "☕ コーヒー":{min:100,avg:200,max:400,trend:"+10%",reason:"コーヒー100〜400PHP。"},
      "🍵 紅茶":{min:80,avg:150,max:300,trend:"+10%",reason:"紅茶80〜300PHP。"},
      "🧃 ジュース":{min:80,avg:150,max:300,trend:"+10%",reason:"ジュース80〜300PHP。"},
      "🍺 ビール":{min:80,avg:150,max:300,trend:"+10%",reason:"サンミゲル80〜300PHP。"},
      "🍷 ワイン":{min:300,avg:600,max:2000,trend:"+12%",reason:"ワイン300〜2,000PHP。"},
      "🍹 カクテル":{min:300,avg:500,max:1000,trend:"+12%",reason:"カクテル300〜1,000PHP。"},
      "🥛 牛乳":{min:50,avg:100,max:200,trend:"+8%",reason:"牛乳1L 50〜200PHP。"},
      "🍶 リキュール":{min:150,avg:300,max:800,trend:"+12%",reason:"タンドゥアイ150〜800PHP/杯。"},
    },
    taxi:{
      "🚖 短距離":{min:80,avg:200,max:400,trend:"+10%",reason:"短距離80〜400PHP。"},
      "🚖 中距離":{min:200,avg:500,max:1000,trend:"+10%",reason:"中距離200〜1,000PHP。"},
      "🚖 長距離":{min:800,avg:1500,max:3000,trend:"+10%",reason:"長距離800〜3,000PHP。"},
      "✈️ 空港":{min:300,avg:600,max:1200,trend:"+10%",reason:"NAIA〜マニラ300〜1,200PHP。Grab推奨。"},
      "🌙 深夜":{min:150,avg:300,max:800,trend:"+15%",reason:"深夜+50〜100PHP。"},
      "🚗 配車アプリ":{min:100,avg:250,max:600,trend:"+10%",reason:"Grab利用可。"},
    },
    hotel:{
      "🏨 格安ホステル":{min:500,avg:1200,max:2500,trend:"+10%",reason:"ホステル500〜2,500PHP/泊。"},
      "🏨 3つ星":{min:2000,avg:4000,max:7000,trend:"+12%",reason:"3つ星2,000〜7,000PHP/泊。"},
      "🏨 4つ星":{min:4000,avg:8000,max:15000,trend:"+12%",reason:"4つ星4,000〜15,000PHP/泊。"},
      "🏨 5つ星":{min:10000,avg:20000,max:60000,trend:"+15%",reason:"5つ星10,000〜60,000PHP/泊。"},
      "🏠 民泊・Airbnb":{min:1500,avg:3500,max:8000,trend:"+12%",reason:"Airbnb1,500〜8,000PHP/泊。"},
    },
    shopping:{
      "👕 衣料":{min:200,avg:800,max:3000,trend:"+8%",reason:"衣料200〜3,000PHP。"},
      "💄 コスメ":{min:150,avg:500,max:2000,trend:"+8%",reason:"コスメ150〜2,000PHP。"},
      "🛒 スーパー":{min:30,avg:200,max:1500,trend:"+8%",reason:"スーパー30〜1,500PHP。"},
      "🎁 おみやげ":{min:100,avg:500,max:2000,trend:"+10%",reason:"ドライマンゴー100〜2,000PHP。"},
      "💻 家電":{min:1000,avg:10000,max:80000,trend:"+8%",reason:"家電1,000〜80,000PHP。"},
    },
    activity:{
      "🏛️ 観光入場":{min:50,avg:200,max:500,trend:"+10%",reason:"イントラムロス無料、チョコレートヒルズ50PHP。"},
      "🤿 アクティビティ":{min:1000,avg:3000,max:8000,trend:"+10%",reason:"ダイビング1,000〜8,000PHP。"},
      "💆 マッサージ":{min:300,avg:600,max:2000,trend:"+10%",reason:"マッサージ300〜2,000PHP/時。"},
      "🎭 エンタメ":{min:500,avg:1500,max:5000,trend:"+10%",reason:"エンタメ500〜5,000PHP。"},
      "🚌 ツアー":{min:1500,avg:3500,max:10000,trend:"+10%",reason:"日帰り1,500〜10,000PHP。"},
    },
    famous:{
      マニラ:{
        "🏰 イントラムロス(城壁都市)":{min:0,avg:0,max:0,trend:"+10%",reason:"イントラムロス：散策無料。スペイン植民地時代の旧城壁都市。"},
        "⛪ サンアグスティン教会":{min:200,avg:200,max:200,trend:"+10%",reason:"サン・アグスチン教会：200PHP（博物館込）。フィリピン最古の教会・世界遺産。"},
        "🏰 サンチアゴ要塞":{min:75,avg:75,max:75,trend:"+10%",reason:"サンチャゴ要塞：75PHP。リサールの最期の地。"},
        "🌳 リサール公園":{min:50,avg:200,max:500,trend:"+10%",reason:"🌳 リサール公園：フィリピン観光。"},
        "🏛️ 国立博物館":{min:50,avg:200,max:500,trend:"+10%",reason:"🏛️ 国立博物館：フィリピン観光。"},
        "🛍️ SMモール・オブ・アジア":{min:0,avg:0,max:0,trend:"+10%",reason:"SMモール・オブ・アジア：散策無料。アジア最大級モール。"},
        "🏛️ マラカニアン宮殿":{min:50,avg:50,max:50,trend:"+10%",reason:"マラカニアン宮殿（マラカニアン博物館）：50PHP。"},
        "🛕 マニラ大聖堂":{min:0,avg:0,max:0,trend:"+10%",reason:"マニラ大聖堂：入場無料。1581年創建。"},
        "🏛️ アヤラ博物館":{min:50,avg:200,max:500,trend:"+10%",reason:"🏛️ アヤラ博物館：フィリピン観光。"},
        "🛍️ チャイナタウン(ビノンド)":{min:0,avg:0,max:0,trend:"+10%",reason:"ビノンド（チャイナタウン）：散策無料。世界最古のチャイナタウン。"},
        "🍢 アドボ":{min:150,avg:300,max:600,trend:"+10%",reason:"アドボ：150〜600PHP。フィリピン国民食。"},
        "🍲 シニガン":{min:200,avg:400,max:800,trend:"+10%",reason:"シニガン：200〜800PHP。"},
        "🥘 カレカレ":{min:300,avg:600,max:1200,trend:"+10%",reason:"カレカレ：300〜1,200PHP。"},
        "🍢 レチョン":{min:300,avg:800,max:2000,trend:"+10%",reason:"レチョン：300〜2,000PHP。豚の丸焼き。"},
        "🍰 ハロハロ":{min:100,avg:200,max:500,trend:"+10%",reason:"ハロハロ：100〜500PHP。"},
        "🥚 バロット":{min:20,avg:30,max:50,trend:"+10%",reason:"バロット：20〜50PHP。アヒルの孵化卵。"},
        "🍞 パンデサル":{min:5,avg:15,max:50,trend:"+10%",reason:"パンデサル：5〜50PHP。伝統朝食パン。"},
        "🥤 ブコジュース":{min:50,avg:100,max:250,trend:"+10%",reason:"ブコジュース：50〜250PHP。フレッシュココナッツ。"},
      },
      セブ島:{
        "⛪ サントニーニョ教会":{min:0,avg:0,max:0,trend:"+10%",reason:"サント・ニーニョ教会：参拝無料。フィリピン最古の教会（1565年）。"},
        "✝️ マゼランクロス":{min:0,avg:0,max:0,trend:"+10%",reason:"マゼラン・クロス：見学無料。1521年マゼラン到来の象徴。"},
        "🏰 サンペドロ要塞":{min:50,avg:200,max:500,trend:"+10%",reason:"🏰 サンペドロ要塞：フィリピン観光。"},
        "🏝️ オスロブ・ジンベエザメ":{min:1000,avg:1500,max:3000,trend:"+10%",reason:"オスロブ・ジンベエザメ：シュノーケル1,500〜3,000PHP。"},
        "🐬 イルカウォッチング":{min:50,avg:200,max:500,trend:"+10%",reason:"🐬 イルカウォッチング：フィリピン観光。"},
        "🏝️ モアルボアル(イワシトルネード)":{min:1000,avg:2000,max:4000,trend:"+10%",reason:"モアルボアル・サーディン：1,000〜4,000PHP。"},
        "🌊 カワサン滝":{min:50,avg:1500,max:3000,trend:"+10%",reason:"カワサン滝：入場50PHP、キャニオニング1,500〜3,000PHP。"},
        "🏖️ マクタン島":{min:50,avg:200,max:500,trend:"+10%",reason:"🏖️ マクタン島：フィリピン観光。"},
        "🏝️ ボホール島":{min:1500,avg:2500,max:5000,trend:"+10%",reason:"ボホール島ツアー：1,500〜5,000PHP。チョコレートヒルズ。"},
        "🐒 ターシャ(メガネザル)":{min:60,avg:60,max:60,trend:"+10%",reason:"ターシャ保護区：60PHP。世界最小メガネザル。"},
        "🍢 レチョン":{min:300,avg:800,max:2000,trend:"+10%",reason:"レチョン：300〜2,000PHP。豚の丸焼き。"},
        "🍞 プソ(米団子)":{min:5,avg:15,max:30,trend:"+10%",reason:"プソ：5〜30PHP。米団子。"},
        "🍝 ラペスバトチョイ":{min:80,avg:150,max:300,trend:"+10%",reason:"ラパス・バチョイ：80〜300PHP。"},
        "🥥 トロピカルフルーツ":{min:50,avg:150,max:400,trend:"+10%",reason:"トロピカルフルーツ：50〜400PHP。"},
        "🐟 シーフード":{min:400,avg:1000,max:2500,trend:"+10%",reason:"シーフード：400〜2,500PHP。"},
        "🍦 ハロハロ":{min:100,avg:200,max:500,trend:"+10%",reason:"ハロハロ：100〜500PHP。"},
        "🍝 ラスワ":{min:200,avg:400,max:800,trend:"+10%",reason:"ラスワ：200〜800PHP。"},
        "🥤 マンゴーシェイク":{min:80,avg:200,max:400,trend:"+10%",reason:"マンゴーシェイク：80〜400PHP。"},
      },
      ボラカイ:{
        "🏖️ ホワイトビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"ホワイトビーチ：入場無料。世界一美しいビーチに選ばれた4km白砂。"},
        "🏖️ プカシェルビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"プカシェル・ビーチ：入場無料。"},
        "🌅 サンセットセーリング":{min:50,avg:200,max:500,trend:"+10%",reason:"🌅 サンセットセーリング：フィリピン観光。"},
        "🤿 パラセイリング":{min:2500,avg:3500,max:6000,trend:"+10%",reason:"パラセイリング：2,500〜6,000PHP。"},
        "🦞 シーフード":{min:400,avg:1000,max:2500,trend:"+10%",reason:"シーフード：400〜2,500PHP。"},
        "🏝️ クロコダイル島":{min:1500,avg:2500,max:4500,trend:"+10%",reason:"クロコダイル島：1,500〜4,500PHP。"},
        "🌊 マグデュンガオ滝":{min:300,avg:500,max:1000,trend:"+10%",reason:"マグデュンガオ滝：300〜1,000PHP。"},
        "🐠 シュノーケリングツアー":{min:1500,avg:2500,max:4000,trend:"+10%",reason:"シュノーケリングツアー：1,500〜4,000PHP。"},
        "🏖️ ディニウィッドビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"ディニウィッドビーチ：入場無料。静かな隠れビーチ。"},
        "🌅 ヨガリトリート":{min:500,avg:1500,max:4000,trend:"+10%",reason:"ヨガリトリート：500〜4,000PHP/日。"},
        "🦞 シーフードBBQ":{min:400,avg:1000,max:2500,trend:"+10%",reason:"シーフード：400〜2,500PHP。"},
        "🥥 ココナッツ":{min:50,avg:100,max:250,trend:"+10%",reason:"ココナッツ：50〜250PHP。"},
        "🍢 イサウ(屋台)":{min:50,avg:100,max:200,trend:"+10%",reason:"イサウ：50〜200PHP。屋台料理。"},
        "🍰 ハロハロ":{min:100,avg:200,max:500,trend:"+10%",reason:"ハロハロ：100〜500PHP。"},
        "🍝 パンシット":{min:150,avg:300,max:600,trend:"+10%",reason:"パンシット：150〜600PHP。フィリピン風麺。"},
        "🍞 パンデサル":{min:5,avg:15,max:50,trend:"+10%",reason:"パンデサル：5〜50PHP。伝統朝食パン。"},
        "🥤 マンゴーシェイク":{min:80,avg:200,max:400,trend:"+10%",reason:"マンゴーシェイク：80〜400PHP。"},
        "🍹 トロピカルカクテル":{min:300,avg:500,max:1000,trend:"+10%",reason:"トロピカルカクテル：300〜1,000PHP。"},
      },
      ダバオ:{
        "🏔️ アポ山":{min:50,avg:200,max:500,trend:"+10%",reason:"🏔️ アポ山：フィリピン観光。"},
        "🌳 フィリピン鷲保護センター":{min:150,avg:150,max:150,trend:"+10%",reason:"フィリピンイーグル財団：150PHP。フィリピン国鳥保護施設。"},
        "🏖️ サマール島":{min:1000,avg:2500,max:5000,trend:"+10%",reason:"サマール島：1,000〜5,000PHP。"},
        "🌳 マラゴス農園":{min:500,avg:800,max:1500,trend:"+10%",reason:"マラゴス農園：500〜1,500PHP。オーガニックファーム。"},
        "🛍️ ダバオ・ナイトマーケット":{min:0,avg:0,max:0,trend:"+10%",reason:"ダバオ・ナイトマーケット：散策無料。"},
        "🏛️ サンペドロ大聖堂":{min:50,avg:200,max:500,trend:"+10%",reason:"🏛️ サンペドロ大聖堂：フィリピン観光。"},
        "🐊 クロコダイル公園":{min:300,avg:300,max:300,trend:"+10%",reason:"ダバオ・クロコダイル公園：300PHP。"},
        "🌿 エデンネイチャーパーク":{min:1100,avg:1500,max:2500,trend:"+10%",reason:"エデン・ネイチャーパーク：1,100〜2,500PHP（日帰り、食事込）。"},
        "🏝️ パールファーム":{min:3000,avg:5000,max:12000,trend:"+10%",reason:"パールファーム：3,000〜12,000PHP/泊。"},
        "🌳 ピープルズパーク":{min:0,avg:0,max:0,trend:"+10%",reason:"ピープルズパーク：入場無料。ダバオ中心公園。"},
        "🍢 ドリアン":{min:100,avg:300,max:800,trend:"+10%",reason:"ダバオ・ドリアン：100〜800PHP/個。"},
        "🐟 キニラウ":{min:200,avg:400,max:800,trend:"+10%",reason:"キニラウ：200〜800PHP。ダバオ風セビーチェ。"},
        "🍢 レチョン":{min:300,avg:800,max:2000,trend:"+10%",reason:"レチョン：300〜2,000PHP。豚の丸焼き。"},
        "🍝 ダバオ・パンシット":{min:150,avg:300,max:600,trend:"+10%",reason:"パンシット：150〜600PHP。フィリピン風麺。"},
        "🥘 シニガン":{min:200,avg:400,max:800,trend:"+10%",reason:"シニガン：200〜800PHP。"},
        "🍰 ハロハロ":{min:100,avg:200,max:500,trend:"+10%",reason:"ハロハロ：100〜500PHP。"},
        "🥥 ココナッツ":{min:50,avg:100,max:250,trend:"+10%",reason:"ココナッツ：50〜250PHP。"},
        "🥤 マンゴーシェイク":{min:80,avg:200,max:400,trend:"+10%",reason:"マンゴーシェイク：80〜400PHP。"},
      },
      パラワン:{
        "🌊 プエルトプリンセサ地下河川":{min:1500,avg:2500,max:4000,trend:"+10%",reason:"プエルトプリンセサ地下河川：1,500〜4,000PHP。世界遺産。"},
        "🏝️ エルニド":{min:1400,avg:2500,max:5000,trend:"+10%",reason:"エルニド・ツアーA-D：1,400〜5,000PHP。"},
        "🏝️ コロン":{min:1500,avg:2500,max:5000,trend:"+10%",reason:"コロン・ツアー：1,500〜5,000PHP。"},
        "🏖️ ナクパンビーチ":{min:0,avg:0,max:0,trend:"+10%",reason:"ナクパンビーチ：入場無料。エルニドの隠れビーチ。"},
        "🤿 アイランドホッピング":{min:1500,avg:2500,max:5000,trend:"+10%",reason:"アイランドホッピング：1,500〜5,000PHP。"},
        "🌊 ツインラグーン":{min:1500,avg:2500,max:4500,trend:"+10%",reason:"ツインラグーン：1,500〜4,500PHP。"},
        "🌊 ビッグラグーン":{min:1500,avg:2500,max:4500,trend:"+10%",reason:"ビッグラグーン：1,500〜4,500PHP。"},
        "🤿 沈没船ダイビング":{min:2500,avg:4500,max:9000,trend:"+10%",reason:"コロン沈船ダイビング：2,500〜9,000PHP。"},
        "🦞 シーフード":{min:400,avg:1000,max:2500,trend:"+10%",reason:"シーフード：400〜2,500PHP。"},
        "🏝️ パンダン島":{min:1500,avg:2500,max:4000,trend:"+10%",reason:"パンダン島：1,500〜4,000PHP。"},
        "🐟 キニラウ":{min:200,avg:400,max:800,trend:"+10%",reason:"キニラウ：200〜800PHP。ダバオ風セビーチェ。"},
        "🦀 マッドクラブ":{min:400,avg:800,max:2000,trend:"+10%",reason:"マッドクラブ：400〜2,000PHP。"},
        "🦞 ロブスター":{min:1500,avg:3000,max:6000,trend:"+10%",reason:"ロブスター：1,500〜6,000PHP。"},
        "🥥 ココナッツ":{min:50,avg:100,max:250,trend:"+10%",reason:"ココナッツ：50〜250PHP。"},
        "🍝 ロンミー":{min:150,avg:300,max:600,trend:"+10%",reason:"ロンミー：150〜600PHP。"},
        "🍰 ハロハロ":{min:100,avg:200,max:500,trend:"+10%",reason:"ハロハロ：100〜500PHP。"},
        "🥤 マンゴーシェイク":{min:80,avg:200,max:400,trend:"+10%",reason:"マンゴーシェイク：80〜400PHP。"},
        "🍹 トロピカルジュース":{min:80,avg:150,max:300,trend:"+10%",reason:"トロピカルジュース：80〜300PHP。"},
      },
      バギオ:{
        "🌲 バーナム公園":{min:0,avg:0,max:0,trend:"+10%",reason:"バーンハム公園：入園無料。バギオ中心公園。"},
        "🌹 ライト公園":{min:0,avg:0,max:0,trend:"+10%",reason:"ライト公園：入場無料。"},
        "🏛️ ライト・パーク":{min:0,avg:0,max:0,trend:"+10%",reason:"ライト・パーク：入場無料。"},
        "🌳 マインズビューパーク":{min:0,avg:0,max:0,trend:"+10%",reason:"マインズビュー公園：入場無料。バギオ絶景パノラマ。"},
        "🛍️ バギオ・パブリックマーケット":{min:0,avg:0,max:0,trend:"+10%",reason:"バギオ市場：散策無料。"},
        "⛪ バギオ大聖堂":{min:0,avg:0,max:0,trend:"+10%",reason:"バギオ大聖堂：参拝無料。"},
        "🌳 ボタニカルガーデン":{min:60,avg:60,max:60,trend:"+10%",reason:"バギオ植物園：60PHP。"},
        "🏛️ ベンチョー博物館":{min:200,avg:200,max:200,trend:"+10%",reason:"BENCAB博物館：200PHP。"},
        "🏘️ タムアワン・ビレッジ":{min:60,avg:60,max:60,trend:"+10%",reason:"タムアワン・ビレッジ：60PHP。"},
        "🌳 イグ・サン・サン・ファーム":{min:50,avg:100,max:200,trend:"+10%",reason:"イグ・サン・サン・ファーム：50〜200PHP。"},
        "🍢 ピニクピカン":{min:200,avg:400,max:800,trend:"+10%",reason:"ピニクピカン：200〜800PHP。"},
        "🍗 イグタイル":{min:200,avg:400,max:800,trend:"+10%",reason:"イグタイル：200〜800PHP。"},
        "🥬 ベンゲット野菜":{min:50,avg:120,max:300,trend:"+10%",reason:"ベンゲット野菜：50〜300PHP。"},
        "🥖 バギオパン":{min:50,avg:100,max:200,trend:"+10%",reason:"バギオパン：50〜200PHP。"},
        "☕ コルディリェラコーヒー":{min:150,avg:300,max:600,trend:"+10%",reason:"コルディリェラコーヒー：150〜600PHP。"},
        "🍰 ストロベリーパイ":{min:150,avg:300,max:600,trend:"+10%",reason:"ストロベリーパイ：150〜600PHP。"},
        "🍓 バギオいちご":{min:100,avg:250,max:500,trend:"+10%",reason:"バギオ・イチゴ：100〜500PHP。"},
        "🥤 ウベシェイク":{min:100,avg:250,max:600,trend:"+10%",reason:"ウベシェイク：100〜600PHP。"},
      },
      イロイロ:{
        "⛪ ミアガオ教会":{min:50,avg:200,max:500,trend:"+10%",reason:"⛪ ミアガオ教会：フィリピン観光。"},
        "⛪ ハロ教会":{min:0,avg:0,max:0,trend:"+10%",reason:"ハロ大聖堂：参拝無料。1874年建造。"},
        "⛪ サンタバルバラ教会":{min:0,avg:0,max:0,trend:"+10%",reason:"サンタ・バーバラ教会：参拝無料。"},
        "🏰 モロ教会":{min:0,avg:0,max:0,trend:"+10%",reason:"モロ教会：参拝無料。1880年代ゴシック様式。"},
        "🌊 ギマラス島":{min:50,avg:200,max:500,trend:"+10%",reason:"🌊 ギマラス島：フィリピン観光。"},
        "🛍️ ラパス市場":{min:0,avg:0,max:0,trend:"+10%",reason:"ラパス市場：散策無料。ラパス・バチョイ発祥地。"},
        "🏛️ イロイロ博物館":{min:50,avg:50,max:50,trend:"+10%",reason:"イロイロ博物館：50PHP。"},
        "🌳 ノースイースト・パナイ":{min:50,avg:100,max:200,trend:"+10%",reason:"ノースイースト・パナイ：50〜200PHP。"},
        "🌅 イロイロ川":{min:0,avg:0,max:0,trend:"+10%",reason:"イロイロ川：散策無料。リバーエスプラナード。"},
        "🏖️ サンドホアキン":{min:0,avg:0,max:0,trend:"+10%",reason:"サン・ホアキン教会：参拝無料。"},
        "🍝 ラパス・バトチョイ":{min:80,avg:150,max:300,trend:"+10%",reason:"ラパス・バトチョイ：80〜300PHP。"},
        "🍞 イロイロ・ビスケット":{min:80,avg:200,max:500,trend:"+10%",reason:"イロイロ・ビスケット：80〜500PHP。"},
        "🥘 ポチェロ":{min:200,avg:400,max:800,trend:"+10%",reason:"ポチェロ：200〜800PHP。"},
        "🍢 イナサル":{min:50,avg:200,max:500,trend:"+10%",reason:"🍢 イナサル：フィリピン観光。"},
        "🍲 サニマ":{min:200,avg:400,max:800,trend:"+10%",reason:"サニマ：200〜800PHP。"},
        "🦞 シーフード":{min:400,avg:1000,max:2500,trend:"+10%",reason:"シーフード：400〜2,500PHP。"},
        "🍦 ハロハロ":{min:100,avg:200,max:500,trend:"+10%",reason:"ハロハロ：100〜500PHP。"},
        "🥤 マンゴーシェイク":{min:80,avg:200,max:400,trend:"+10%",reason:"マンゴーシェイク：80〜400PHP。"},
      },
      タガイタイ:{
        "🌋 タール火山":{min:0,avg:0,max:0,trend:"+10%",reason:"タール湖：見学無料。火口湖の中の島の中の湖。"},
        "🌊 タール湖":{min:0,avg:0,max:0,trend:"+10%",reason:"タール湖：見学無料。火口湖の中の島の中の湖。"},
        "🌳 ピープルズパーク・スカイ":{min:0,avg:0,max:0,trend:"+10%",reason:"ピープルズパーク：入場無料。ダバオ中心公園。"},
        "🌳 スカイランチ":{min:50,avg:200,max:500,trend:"+10%",reason:"🌳 スカイランチ：フィリピン観光。"},
        "🛍️ ロマウィン":{min:0,avg:0,max:0,trend:"+10%",reason:"ローウェナーズ：散策無料。タガイタイ名物ブコパイ。"},
        "🛍️ コラスキー":{min:0,avg:0,max:0,trend:"+10%",reason:"コラシキ：散策無料。ホットエンサイマダ。"},
        "🏛️ ピクニックグローブ":{min:50,avg:200,max:500,trend:"+10%",reason:"🏛️ ピクニックグローブ：フィリピン観光。"},
        "⛪ アワーレディ・オブ・ラ・サレット":{min:0,avg:0,max:0,trend:"+10%",reason:"ラ・サレットの聖母：参拝無料。"},
        "🌊 ボートツアー":{min:50,avg:200,max:500,trend:"+10%",reason:"🌊 ボートツアー：フィリピン観光。"},
        "🏘️ メアリ・グッド":{min:0,avg:0,max:0,trend:"+10%",reason:"メアリー・グッド・ジェリー：見学無料。"},
        "🍲 ブラロ":{min:300,avg:500,max:1000,trend:"+10%",reason:"ブラロ：300〜1,000PHP。タガイタイ名物牛骨スープ。"},
        "🥘 ブカヨ":{min:80,avg:150,max:300,trend:"+10%",reason:"ブカヨ：80〜300PHP。ココナッツキャラメル。"},
        "🥥 ココナッツ":{min:50,avg:100,max:250,trend:"+10%",reason:"ココナッツ：50〜250PHP。"},
        "🍢 タガイタイBBQ":{min:200,avg:400,max:800,trend:"+10%",reason:"タガイタイBBQ：200〜800PHP。"},
        "🍞 ハム":{min:50,avg:200,max:500,trend:"+10%",reason:"🍞 ハム：フィリピン観光。"},
        "🥗 ピナベット":{min:200,avg:400,max:800,trend:"+10%",reason:"ピナクベット：200〜800PHP。野菜煮込み。"},
        "🍰 ハロハロ":{min:100,avg:200,max:500,trend:"+10%",reason:"ハロハロ：100〜500PHP。"},
        "🥤 マンゴーシェイク":{min:80,avg:200,max:400,trend:"+10%",reason:"マンゴーシェイク：80〜400PHP。"},
      },
    },
  },
};

// ─────────────────────────────────────────────────────────
// REGIONS
// ─────────────────────────────────────────────────────────
const REGIONS = [
  { key:"all" }, { key:"asia" }, { key:"europe" },
  { key:"americas" }, { key:"oceania" }, { key:"mideast" },
];

// ─────────────────────────────────────────────────────────
// APP COMPONENT
// ─────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang] = useState("ja");
  const t = T[lang] || T.ja;

  // ── 共通国選択 (全タブ共通) ──
  const [globalCountry, setGlobalCountry] = useState(null);
  const [countrySearch, setCountrySearch] = useState("");

  // ── 判定タブ ──
  const [city, setCity] = useState(null);
  const [mainCat, setMainCat] = useState(null);
  const [subCatJa, setSubCatJa] = useState(null);
  const [foodGroup, setFoodGroup] = useState(null);
  const [taxiDist, setTaxiDist] = useState(5);
  const [taxiTime, setTaxiTime] = useState("朝");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareItems, setCompareItems] = useState([]);
  const [cmpName, setCmpName] = useState("");
  const [cmpAmt, setCmpAmt] = useState("");

  // ── 翻訳タブ ──
  const [youText, setYouText] = useState("");
  const [youTranslated, setYouTranslated] = useState("");
  const [partnerText, setPartnerText] = useState("");
  const [partnerTranslated, setPartnerTranslated] = useState("");
  const [youListening, setYouListening] = useState(false);
  const [partnerListening, setPartnerListening] = useState(false);
  const [youTranslating, setYouTranslating] = useState(false);
  const [partnerTranslating, setPartnerTranslating] = useState(false);
  const [speaking, setSpeaking] = useState(null);
  const [copied, setCopied] = useState(null);
  const micRefYou = useRef(null);
  const micRefPartner = useRef(null);

  // ── 詐欺タブ ──
  const [scamCity, setScamCity] = useState(null);

  // ── DB タブ ──
  const [posts, setPosts] = useState([]);
  const [postItem, setPostItem] = useState("");
  const [postPrice, setPostPrice] = useState("");
  const [postText, setPostText] = useState("");
  const [postPhoto, setPostPhoto] = useState(null);
  const [postPhotoPreview, setPostPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);

  // ── 共通 ──
  const [tab, setTab] = useState("check");
  const [toast, setToast] = useState("");
  const [linkCat, setLinkCat] = useState(LINK_CATS[0]);
  const [liveRates, setLiveRates] = useState(null);
  const [rateStatus, setRateStatus] = useState("loading");
  const [regionFilter, setRegionFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);

  // ── 交渉アシスタント（高め判定時） ──
  const [negotiateCountry, setNegotiateCountry] = useState(null);
  const [negYouText, setNegYouText] = useState("");
  const [negYouTranslated, setNegYouTranslated] = useState("");
  const [negPartnerText, setNegPartnerText] = useState("");
  const [negPartnerTranslated, setNegPartnerTranslated] = useState("");
  const [negYouListening, setNegYouListening] = useState(false);
  const [negPartnerListening, setNegPartnerListening] = useState(false);
  const [negYouTranslating, setNegYouTranslating] = useState(false);
  const [negPartnerTranslating, setNegPartnerTranslating] = useState(false);
  const negMicRefYou = useRef(null);
  const negMicRefPartner = useRef(null);

  useEffect(() => {
    (async () => {
      const rates = await fetchRates();
      if (rates) { setLiveRates(rates); setRateStatus("live"); } else setRateStatus("fallback");
      try { const s = localStorage.getItem("nebula_posts"); if (s) setPosts(JSON.parse(s)); } catch {}
    })();
    // 音声合成の voices を先に読み込む（iOSでは非同期）
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
    // ブラウザの自動翻訳を抑制（Chromeで「翻訳しますか?」が出るのを防ぐ）
    try {
      let meta = document.querySelector('meta[name="google"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "google";
        document.head.appendChild(meta);
      }
      meta.content = "notranslate";
      document.documentElement.classList.add("notranslate");
    } catch {}
  }, []);

  // 言語が変わったら <html lang> も同期させる（ブラウザ自動翻訳の判断材料）
  useEffect(() => {
    try { document.documentElement.lang = lang; } catch {}
  }, [lang]);

  useEffect(() => {
    if (result && result.isExpensive && globalCountry) setNegotiateCountry(globalCountry);
  }, [result]);

  const getRate = cur => liveRates?.[cur] ?? FALLBACK_RATES[cur] ?? 1;
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const jpy = globalCountry && amount && globalCountry.currency !== "JPY"
    ? Math.round(parseFloat(amount) * getRate(globalCountry.currency)).toLocaleString() : null;
  const canJudge = globalCountry && city && mainCat && subCatJa && parseFloat(amount) > 0;

  const runJudge = () => {
    const info = getPriceInfo(globalCountry, city, mainCat.id, subCatJa, taxiDist, taxiTime, lang);
    if (!info) { showToast(t.noData); return; }
    const amt = parseFloat(amount);
    const j = judgeVerdict(amt, info.min, info.avg, info.max, t);
    const range = info.max - info.min || 1;
    setResult({ ...j, ...info, barPct: Math.min(100, Math.max(5, ((amt - info.min) / range) * 100)), currency: globalCountry.currency, isExpensive: j.verdict === t.exp });
  };

  const addToCompare = () => {
    if (!cmpName || !cmpAmt) { showToast(t.noCmp); return; }
    const info = getPriceInfo(globalCountry, city, mainCat.id, subCatJa, taxiDist, taxiTime, lang);
    if (!info) { showToast(t.noPrice); return; }
    const amt = parseFloat(cmpAmt);
    const j = judgeVerdict(amt, info.min, info.avg, info.max, t);
    setCompareItems(prev => [...prev, { name: cmpName, amount: amt, currency: globalCountry.currency, avg: info.avg, ...j }]);
    setCmpName(""); setCmpAmt(""); showToast(t.added(cmpName));
  };

  const submitPost = () => {
    if (!postItem && !postText && !postPhoto) { showToast(t.noCmp); return; }
    const idx = (globalCountry?.cities?.ja || []).indexOf(city);
    const cityLabel = (globalCountry?.cities?.[lang] || globalCountry?.cities?.ja || [])[idx >= 0 ? idx : 0] || city || "";
    const np = {
      item: postItem,
      price: postPrice,
      text: postText,
      photo: postPhotoPreview,
      currency: globalCountry?.currency || "",
      city: cityLabel,
      lang,
      time: new Date().toLocaleDateString("ja-JP"),
    };
    const nps = [np, ...posts].slice(0, 50);
    setPosts(nps);
    try { localStorage.setItem("nebula_posts", JSON.stringify(nps)); } catch {}
    setPostItem(""); setPostPrice(""); setPostText(""); setPostPhoto(null); setPostPhotoPreview(null);
    showToast(t.postOk);
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPostPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    setPostPhoto(file);
  };

  const handleCopy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  // 音声認識（長押し対応）
  // 長押し中だけ録音し続ける（onendが発火しても、まだボタンが押されていれば再起動）
  const startListeningHold = (langCode, setListeningState, setTextField, recRef) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast(t.transNoSupport); return; }

    // 既存セッションがあれば破棄
    if (recRef.current) {
      try { recRef.current.holdStop = true; recRef.current.abort(); } catch {}
      recRef.current = null;
    }

    const map = { ja:"ja-JP", th:"th-TH", ko:"ko-KR", en:"en-US", zh:"zh-CN", hi:"hi-IN", fr:"fr-FR", it:"it-IT", de:"de-DE", es:"es-ES", pt:"pt-BR", ms:"ms-MY", ar:"ar-SA", tr:"tr-TR", ru:"ru-RU", nl:"nl-NL", fi:"fi-FI", no:"nb-NO", el:"el-GR", vi:"vi-VN", id:"id-ID" };

    let accumulated = "";  // 再起動を跨いだ累積テキスト
    let isActive = true;   // 長押し中かどうか

    const createRec = () => {
      const rec = new SR();
      rec.lang = map[langCode] || "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.holdStop = false;

      rec.onresult = e => {
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        if (final) accumulated += final;
        setTextField((accumulated + interim).trim());
      };

      rec.onerror = (ev) => {
        // no-speech はよくあるので無視して再起動。それ以外も isActive なら再起動
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          isActive = false;
          setListeningState(false);
          showToast(t.transError);
        }
      };

      rec.onend = () => {
        if (isActive && recRef.current === rec && !rec.holdStop) {
          // まだ長押し中 → 再起動
          try {
            const next = createRec();
            recRef.current = next;
            next.start();
          } catch {
            setListeningState(false);
          }
        } else {
          setListeningState(false);
        }
      };

      return rec;
    };

    setListeningState(true);
    playBeep("start");
    try {
      const rec = createRec();
      recRef.current = rec;
      // holdStop と isActive を外から参照できるように
      rec._setInactive = () => { isActive = false; rec.holdStop = true; };
      rec.start();
    } catch (err) {
      setListeningState(false);
    }
  };

  const stopListeningHold = (recRef, setListeningState) => {
    if (recRef.current) {
      try {
        if (recRef.current._setInactive) recRef.current._setInactive();
        recRef.current.stop();
      } catch {}
      recRef.current = null;
      playBeep("end");
    }
    setListeningState(false);
  };

  // あなた→現地語 翻訳
  const handleYouSpeak = async () => {
    if (!globalCountry || !youText.trim()) { showToast(t.noCmp); return; }
    setYouTranslating(true);
    const userLangCode = lang;
    const translated = await translateText(youText, userLangCode, globalCountry.localLang, globalCountry.localLangName);
    setYouTranslated(translated);
    setYouTranslating(false);
    if (translated) speakText(translated, globalCountry.localLang);
  };

  const handlePartnerSpeak = async () => {
    if (!globalCountry || !partnerText.trim()) return;
    setPartnerTranslating(true);
    const toLangName = lang === "ja" ? "日本語" : lang === "en" ? "English" : lang === "zh" ? "中文" : lang === "ko" ? "한국어" : lang === "es" ? "Español" : "Português";
    const translated = await translateText(partnerText, globalCountry.localLang, lang, toLangName);
    setPartnerTranslated(translated);
    setPartnerTranslating(false);
  };

  // 交渉アシスタント
  const handleNegYouSpeak = async () => {
    if (!negotiateCountry || !negYouText.trim()) return;
    setNegYouTranslating(true);
    const translated = await translateText(negYouText, lang, negotiateCountry.localLang, negotiateCountry.localLangName);
    setNegYouTranslated(translated);
    setNegYouTranslating(false);
    if (translated) speakText(translated, negotiateCountry.localLang);
  };

  const handleNegPartnerSpeak = async () => {
    if (!negotiateCountry || !negPartnerText.trim()) return;
    setNegPartnerTranslating(true);
    const toLangName = lang === "ja" ? "日本語" : "English";
    const translated = await translateText(negPartnerText, negotiateCountry.localLang, lang, toLangName);
    setNegPartnerTranslated(translated);
    setNegPartnerTranslating(false);
  };

  const getScams = () => {
    if (!globalCountry) return { city: [], national: [] };
    const sd = SCAM_DATA[globalCountry.name];
    if (!sd) return { city: [], national: [] };
    const national = (sd._default || []).slice(0, 10);
    const cityScams = scamCity && sd[scamCity] ? sd[scamCity].slice(0, 10) : [];
    return { city: cityScams, national };
  };

  // 国の頭文字フィルタリング
  const filteredCountries = (() => {
    let list = regionFilter === "all" ? COUNTRIES : COUNTRIES.filter(c => c.region === regionFilter);
    if (countrySearch.trim()) {
      const q = countrySearch.trim().toUpperCase();
      list = list.filter(c => {
        const engName = c.name.replace(/[^\x00-\x7F]/g, "");
        const label = (c.label?.[lang] || c.label?.en || c.name);
        return label.toUpperCase().startsWith(q) || c.name.startsWith(q);
      });
    }
    return list;
  })();

  const regionLabel = key => {
    const map = { all: t.regionAll, asia: t.regionAsia, europe: t.regionEurope, americas: t.regionAmericas, oceania: t.regionOceania, mideast: t.regionMideast };
    return map[key] || key;
  };

  const Pill = ({ selected, onClick, children, small }) => (
    <button onClick={onClick} style={{ padding: small ? "6px 11px" : "9px 14px", background: selected ? S.pink : S.tag, border: `1.5px solid ${selected ? S.pink : S.border}`, borderRadius: 24, fontSize: small ? 11 : 13, cursor: "pointer", color: "#fff", whiteSpace: "nowrap", fontWeight: selected ? 700 : 400, transition: "all 0.2s" }}>
      {children}
    </button>
  );

  // Google風マイクボタン（PointerEventsで長押し対応）
  const HoldMicButton = ({ onStart, onEnd, isListening, label }) => {
    const handleStart = (e) => {
      // iOSでテキスト選択/スクロールを防ぐ
      if (e.cancelable) e.preventDefault();
      // AudioContextをユーザー操作で初期化
      getAudioContext();
      onStart();
    };
    const handleEnd = (e) => {
      if (e.cancelable) e.preventDefault();
      onEnd();
    };
    return (
      <button
        onPointerDown={handleStart}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
        onPointerLeave={(e) => { if (isListening) handleEnd(e); }}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width:"100%",
          padding:"14px",
          background: isListening ? "linear-gradient(135deg,#dc2626,#ef4444)" : "linear-gradient(135deg,#1a56a0,#3b82d4)",
          border:"none",
          borderRadius:14,
          cursor:"pointer",
          color:"#fff",
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          gap:10,
          touchAction:"none",
          userSelect:"none",
          WebkitUserSelect:"none",
          WebkitTouchCallout:"none",
          boxShadow: isListening ? "0 0 0 4px rgba(239,68,68,0.25), 0 6px 20px rgba(239,68,68,0.4)" : "0 4px 14px rgba(26,86,160,0.35)",
          transition:"all 0.15s",
          transform: isListening ? "scale(0.98)" : "scale(1)",
          position:"relative",
          fontSize:14,
          fontWeight:700,
        }}
      >
        <span style={{ fontSize:22, display:"inline-flex", alignItems:"center", justifyContent:"center", width:30, height:30, borderRadius:"50%", background:"rgba(255,255,255,0.2)" }}>🎙️</span>
        <span>{isListening ? t.transListening : label}</span>
        {isListening && (
          <span style={{ display:"inline-flex", gap:3, marginLeft:6 }}>
            <span style={{ width:3, height:14, background:"#fff", borderRadius:2, animation:"npbar 0.9s ease-in-out infinite" }} />
            <span style={{ width:3, height:18, background:"#fff", borderRadius:2, animation:"npbar 0.9s ease-in-out 0.15s infinite" }} />
            <span style={{ width:3, height:10, background:"#fff", borderRadius:2, animation:"npbar 0.9s ease-in-out 0.3s infinite" }} />
            <span style={{ width:3, height:16, background:"#fff", borderRadius:2, animation:"npbar 0.9s ease-in-out 0.45s infinite" }} />
          </span>
        )}
      </button>
    );
  };

  // フルスクリーン録音中オーバーレイ
  const ListeningOverlay = ({ visible, onEnd }) => {
    if (!visible) return null;
    return (
      <div
        onPointerUp={() => onEnd()}
        onPointerCancel={() => onEnd()}
        style={{
          position:"fixed", inset:0, zIndex:500,
          background:"rgba(0,0,0,0.55)", backdropFilter:"blur(8px)",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          touchAction:"none", userSelect:"none",
        }}
      >
        <div style={{
          width:140, height:140, borderRadius:"50%",
          background:"linear-gradient(135deg,#dc2626,#ef4444)",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:"0 0 0 12px rgba(239,68,68,0.25), 0 0 0 28px rgba(239,68,68,0.12), 0 20px 60px rgba(239,68,68,0.5)",
          animation:"nppulse 1.2s ease-in-out infinite",
          marginBottom:24,
        }}>
          <span style={{ fontSize:60 }}>🎙️</span>
        </div>
        <div style={{ display:"flex", gap:5, marginBottom:20, alignItems:"flex-end", height:40 }}>
          <span style={{ width:5, background:"#fff", borderRadius:3, animation:"npbar 0.9s ease-in-out infinite", height:20 }} />
          <span style={{ width:5, background:"#fff", borderRadius:3, animation:"npbar 0.9s ease-in-out 0.1s infinite", height:34 }} />
          <span style={{ width:5, background:"#fff", borderRadius:3, animation:"npbar 0.9s ease-in-out 0.2s infinite", height:14 }} />
          <span style={{ width:5, background:"#fff", borderRadius:3, animation:"npbar 0.9s ease-in-out 0.3s infinite", height:28 }} />
          <span style={{ width:5, background:"#fff", borderRadius:3, animation:"npbar 0.9s ease-in-out 0.4s infinite", height:18 }} />
          <span style={{ width:5, background:"#fff", borderRadius:3, animation:"npbar 0.9s ease-in-out 0.5s infinite", height:32 }} />
          <span style={{ width:5, background:"#fff", borderRadius:3, animation:"npbar 0.9s ease-in-out 0.6s infinite", height:22 }} />
        </div>
        <div style={{ color:"#fff", fontSize:16, fontWeight:700, marginBottom:6 }}>{t.transListening}</div>
        <div style={{ color:"rgba(255,255,255,0.7)", fontSize:11 }}>{lang==="ja"?"離すと送信":lang==="en"?"Release to send":lang==="zh"?"松开发送":lang==="ko"?"떼면 전송":lang==="es"?"Suelta para enviar":"Solte para enviar"}</div>
      </div>
    );
  };


  // 設定モーダル
  const helpTexts = {
    ja: {
      check: "💴 判定タブ: 国・都市・カテゴリを選んで金額を入力すると、その価格が適正かどうかをAIが判定します。高すぎる場合は交渉アシスタントが現地語で交渉フレーズを提供します。",
      scam: "⚠️ 詐欺警告タブ: 旅行先の国を選ぶと、その国でよくある詐欺・注意事項を表示します。都市名を選ぶとさらに詳細な情報が表示されます。",
      trans: "🌐 翻訳タブ: マイクボタンを長押しして話すと音声認識で入力できます。テキストを入力して翻訳ボタンを押すと現地語に翻訳されます。緊急フレーズもワンタップで使えます。",
      travel: "✈️ 旅行タブ: 旅行に役立つリンク集です。各カテゴリのリンクをタップして開きます。",
      trend: "📊 トレンドタブ: 世界各地の価格トレンドを表示します。インフレ率や価格変動を確認できます。",
      db: "🗄️ DBタブ: 価格情報を投稿・共有できます。写真や文章も投稿できるTwitter風の機能です。",
      global: "🌍 国選択: 画面上部で国を選ぶと、判定・詐欺警告・翻訳タブ全てに反映されます。頭文字（JapanはJ）で絞り込み検索もできます。",
    },
    en: {
      check: "💴 Judge Tab: Select country, city, and category, then enter the price to see if it's fair. If too expensive, the negotiation assistant provides phrases in the local language.",
      scam: "⚠️ Scam Alerts Tab: Select your destination country to see common scams and warnings. Select a city for more specific information.",
      trans: "🌐 Translate Tab: Press and hold the mic button to speak for voice input. Type text and press translate to convert to the local language. Emergency phrases are also available.",
      travel: "✈️ Travel Tab: A collection of useful travel links organized by category.",
      trend: "📊 Trends Tab: View price trends from around the world. Check inflation rates and price changes.",
      db: "🗄️ DB Tab: Post and share price information. Twitter-style feature with photo and text posting.",
      global: "🌍 Country Selection: Selecting a country at the top applies to the Judge, Scam Alerts, and Translate tabs. You can also search by first letter (J for Japan).",
    },
  };

  const hText = helpTexts[lang] || helpTexts.en;

  return (
    <div style={{ background: S.grad, minHeight:"100vh", fontFamily:"'Noto Sans JP','DM Sans',sans-serif", paddingBottom:90 }}>
      {/* ── Inline CSS for mic animations ── */}
      <style>{`
        @keyframes npbar { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
        @keyframes nppulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes nprotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes npaurora { 0%,100%{opacity:0.5} 50%{opacity:0.85} }
        /* All cards: glass effect */
        .np-glass {
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        }
        /* Input & textarea: white text on dark glass */
        input, textarea {
          color: #ffffff !important;
          caret-color: #ffffff;
        }
        input::placeholder, textarea::placeholder {
          color: rgba(255,255,255,0.55) !important;
        }
        /* Hide native autofill background */
        input:-webkit-autofill {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 1000px rgba(255,255,255,0.05) inset;
        }
      `}</style>
      {/* ── A-5 Midnight Ocean background (full screen, large globe, aurora) ── */}
      <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:S.grad, zIndex:0, overflow:"hidden" }}>
        <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
          <defs>
            <radialGradient id="npGlow" cx="15%" cy="15%" r="60%">
              <stop offset="0%" stopColor="#60b0e8" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#60b0e8" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="npGlow2" cx="85%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.30"/>
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="npGlow3" cx="50%" cy="85%" r="60%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="#34d399" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="npAurora1" x1="0" y1="0" x2="1" y2="0.5">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0"/>
              <stop offset="50%" stopColor="#10b981" stopOpacity="0.22"/>
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.22"/>
            </linearGradient>
            <linearGradient id="npAurora2" x1="0" y1="0" x2="1" y2="0.3">
              <stop offset="0%" stopColor="#60b0e8" stopOpacity="0"/>
              <stop offset="50%" stopColor="#60b0e8" stopOpacity="0.28"/>
              <stop offset="100%" stopColor="#34d399" stopOpacity="0.18"/>
            </linearGradient>
            <linearGradient id="npTrail" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#60b0e8" stopOpacity="0"/>
              <stop offset="50%" stopColor="#60b0e8" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#60b0e8" stopOpacity="0.05"/>
            </linearGradient>
            <linearGradient id="npTrail2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0"/>
              <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* Multi-layered aurora glows */}
          <rect width="400" height="800" fill="url(#npGlow)"/>
          <rect width="400" height="800" fill="url(#npGlow2)"/>
          <rect width="400" height="800" fill="url(#npGlow3)"/>
          {/* Aurora wave bands */}
          <path d="M 0 120 Q 100 80 200 130 T 400 120 L 400 200 Q 300 240 200 200 T 0 220 Z" fill="url(#npAurora1)" opacity="0.7"/>
          <path d="M 0 460 Q 120 420 220 470 T 400 460 L 400 550 Q 280 590 180 540 T 0 560 Z" fill="url(#npAurora2)" opacity="0.6"/>
          {/* LARGE globe meridians/latitudes - more prominent */}
          <g opacity="0.13" stroke="#60b0e8" strokeWidth="1.2" fill="none">
            <ellipse cx="200" cy="400" rx="320" ry="320"/>
            <ellipse cx="200" cy="400" rx="260" ry="320"/>
            <ellipse cx="200" cy="400" rx="180" ry="320"/>
            <ellipse cx="200" cy="400" rx="90" ry="320"/>
            <ellipse cx="200" cy="400" rx="320" ry="100"/>
            <ellipse cx="200" cy="400" rx="320" ry="200"/>
            <ellipse cx="200" cy="400" rx="320" ry="270"/>
          </g>
          {/* Second smaller globe top-left */}
          <g opacity="0.08" stroke="#a78bfa" strokeWidth="1" fill="none">
            <ellipse cx="60" cy="120" rx="80" ry="80"/>
            <ellipse cx="60" cy="120" rx="50" ry="80"/>
            <ellipse cx="60" cy="120" rx="80" ry="30"/>
            <ellipse cx="60" cy="120" rx="80" ry="55"/>
          </g>
          {/* Airplane trails */}
          <path d="M -20 220 Q 200 90 420 260" stroke="url(#npTrail)" strokeWidth="1.8" fill="none" strokeDasharray="4,5" opacity="0.7"/>
          <path d="M -20 600 Q 200 470 420 640" stroke="url(#npTrail2)" strokeWidth="1.3" fill="none" strokeDasharray="3,4" opacity="0.55"/>
          <path d="M -20 380 Q 200 280 420 100" stroke="url(#npTrail)" strokeWidth="1" fill="none" strokeDasharray="2,4" opacity="0.4"/>
          {/* Stars - more, denser */}
          {[
            [40,30,0.8,0.8],[120,25,0.6,0.7],[200,40,1.2,0.9],[280,20,0.7,0.7],
            [340,50,0.5,0.5],[370,80,0.9,0.7],[50,180,0.6,0.5],[160,220,0.5,0.4],
            [320,190,0.8,0.7],[380,240,0.5,0.5],[30,280,0.6,0.4],[250,290,0.5,0.5],
            [90,60,0.5,0.5],[170,90,0.6,0.6],[300,120,0.7,0.7],[60,330,0.7,0.6],
            [200,340,0.6,0.5],[360,330,0.8,0.7],[110,300,0.5,0.4],[230,160,0.7,0.6],
            [25,420,0.6,0.5],[150,440,0.5,0.4],[280,460,0.7,0.6],[380,420,0.6,0.5],
            [70,520,0.5,0.4],[200,540,0.8,0.7],[330,560,0.6,0.5],[100,620,0.7,0.6],
            [240,650,0.5,0.4],[370,680,0.6,0.5],[40,720,0.5,0.4],[180,740,0.7,0.6],
            [310,760,0.6,0.5],[160,500,0.5,0.4],[290,400,0.6,0.5],[55,400,0.7,0.6],
          ].map((s,i) => (
            <circle key={i} cx={s[0]} cy={s[1]} r={s[2]} fill="#fff" opacity={s[3]}/>
          ))}
          {/* Airplane emoji-style icons */}
          <text x="345" y="105" fontSize="13" opacity="0.65">✈️</text>
          <text x="40" y="500" fontSize="11" opacity="0.5">✈️</text>
        </svg>
      </div>
      <div style={{ position:"relative", zIndex:1, maxWidth:860, margin:"0 auto" }}>

        {/* ── HEADER ── */}
        <div style={{ padding:"44px 18px 12px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <div style={{ width:42, height:42, borderRadius:"50%", background:"rgba(255,255,255,0.18)", border:"2.5px solid rgba(255,255,255,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, boxShadow:"0 2px 12px rgba(0,0,0,0.2)", flexShrink:0 }}>🌐</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:8, letterSpacing:3, color:"rgba(255,255,255,0.8)", fontWeight:600, textTransform:"uppercase" }}>{t.sub}</div>
              <div style={{ fontSize:26, color:"#fff", fontFamily:"Georgia,serif", fontWeight:"bold", lineHeight:1.1 }}>Nebula<span style={{ color:"#60b0e8" }}>Price</span></div>
            </div>
            {/* 設定ボタン */}
            <button onClick={() => setShowSettings(true)} style={{ width:38, height:38, borderRadius:"50%", background:"rgba(255,255,255,0.18)", border:"2px solid rgba(255,255,255,0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, cursor:"pointer", color:"#fff", flexShrink:0 }}>⚙️</button>
          </div>
          <div style={{ display:"flex", gap:5, marginBottom:7, flexWrap:"wrap" }}>
            {LANGS.map(l => (
              <button key={l.code} onClick={() => setLang(l.code)} style={{ padding:"4px 10px", fontSize:10, borderRadius:20, border:`1.5px solid ${lang===l.code?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.3)"}`, background:lang===l.code?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)", color:"#fff", cursor:"pointer", fontWeight:lang===l.code?700:400 }}>{l.label}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, background:"rgba(96,176,232,0.25)", color:"#a8d9f5", padding:"3px 10px", borderRadius:20, fontWeight:600 }}>{t.c20}</span>
            <span style={{ fontSize:10, padding:"3px 10px", borderRadius:20, background:rateStatus==="live"?"rgba(77,166,217,0.3)":"rgba(255,255,255,0.15)", color:rateStatus==="live"?"#a8d9f5":"rgba(255,255,255,0.7)", fontWeight:600 }}>
              {rateStatus==="loading"?t.rLoad:rateStatus==="live"?t.rLive:t.rFix}
            </span>
          </div>
        </div>

        {/* ── グローバル国選択 (全タブ共通) ── */}
        <div style={{ background:"rgba(255,255,255,0.12)", margin:"0 14px 10px", borderRadius:16, padding:"10px 12px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
            <div style={{ fontSize:11, color:"#ffffff", fontWeight:800, letterSpacing:1 }}>🌍 {t.selectCountry}</div>
            {globalCountry && (
              <div style={{ fontSize:12, color:"#fff", fontWeight:700, background:"rgba(255,255,255,0.2)", padding:"2px 10px", borderRadius:14 }}>
                {globalCountry.flag} {globalCountry.label?.[lang] || globalCountry.name}
              </div>
            )}
          </div>
          {/* 頭文字検索 */}
          <div style={{ display:"flex", gap:6, marginBottom:7 }}>
            <input
              value={countrySearch}
              onChange={e => setCountrySearch(e.target.value)}
              placeholder={t.countrySearchPh}
              style={{ flex:1, background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.35)", borderRadius:10, padding:"6px 11px", fontSize:11, color:"#fff", outline:"none", fontFamily:"inherit" }}
            />
            {countrySearch && <button onClick={() => setCountrySearch("")} style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:10, padding:"6px 11px", color:"#fff", cursor:"pointer", fontSize:11 }}>✕</button>}
          </div>
          {/* リージョンフィルター */}
          <div style={{ display:"flex", gap:5, overflowX:"auto", paddingBottom:5, marginBottom:6, scrollbarWidth:"none" }}>
            {REGIONS.map(r => (
              <button key={r.key} onClick={() => setRegionFilter(r.key)} style={{ padding:"4px 9px", fontSize:9, borderRadius:18, whiteSpace:"nowrap", flexShrink:0, cursor:"pointer", background:regionFilter===r.key?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.18)", border:"none", color:regionFilter===r.key?S.accent:"rgba(255,255,255,0.85)", fontWeight:regionFilter===r.key?700:400 }}>{regionLabel(r.key)}</button>
            ))}
          </div>
          {/* 国ボタン */}
          <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4, scrollbarWidth:"none" }}>
            {filteredCountries.map(c => (
              <button key={c.name} onClick={() => {
                setGlobalCountry(c); setCity(null); setResult(null); setCompareItems([]); setNegotiateCountry(null);
                setScamCity(null); setYouText(""); setYouTranslated(""); setPartnerText(""); setPartnerTranslated("");
                if (!(PRICE_DB[c.name]?.famous) && mainCat?.id === "famous") { setMainCat(null); setSubCatJa(null); }
              }} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 11px", background:globalCountry?.name===c.name?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.18)", border:`1.5px solid ${globalCountry?.name===c.name?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.3)"}`, borderRadius:36, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, color:globalCountry?.name===c.name?S.accent:"#fff", fontSize:11, fontWeight:globalCountry?.name===c.name?700:400 }}>
                <span style={{ fontSize:14 }}>{c.flag}</span>{c.label?.[lang] || c.name}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════ CHECK TAB ══════════ */}
        {tab === "check" && (
          <div>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#ffb380", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:6, textShadow:"0 2px 10px rgba(0,0,0,0.5), 0 0 30px rgba(255,140,66,0.3)" }}>{t.checkT}</div>
              <div style={{ fontSize:11, color:"#ffd9b8", fontWeight:600, background:"rgba(255,140,66,0.22)", border:"1px solid rgba(255,140,66,0.4)", display:"inline-block", padding:"3px 11px", borderRadius:18, marginTop:3 }}>{t.checkD}</div>
            </div>
            <div style={{ margin:"0 14px", background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:22, padding:18, boxShadow:"0 8px 40px rgba(0,0,0,0.13)" }}>
              {/* Progress bar */}
              <div style={{ display:"flex", gap:5, marginBottom:18 }}>
                {[!!globalCountry,!!city,!!mainCat,!!subCatJa,parseFloat(amount)>0].map((done,i) => (
                  <div key={i} style={{ flex:1, height:3, borderRadius:2, background:done?S.accentLight:S.border, transition:"background 0.3s" }} />
                ))}
              </div>

              {/* ① City */}
              {!globalCountry ? (
                <div style={{ textAlign:"center", padding:"20px 0", color:S.muted, fontSize:12 }}>{t.selectCountryAbove}</div>
              ) : <>
                <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:7 }}>{t.s2}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
                  {(globalCountry.cities?.ja || []).map((jaKey, i) => {
                    const label = (globalCountry.cities?.[lang] || globalCountry.cities?.ja || [])[i] || jaKey;
                    return <Pill key={jaKey} selected={city===jaKey} onClick={() => { setCity(jaKey); setSubCatJa(null); setResult(null); }} small>{label}</Pill>;
                  })}
                </div>
              </>}

              {/* ② Main category */}
              {city && <>
                <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:7 }}>{t.s3}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:14 }}>
                  {MAIN_CATS.filter(c => c.id !== "famous" || !!(PRICE_DB[globalCountry?.name]?.famous)).map(c => (
                    <button key={c.id} onClick={() => { setMainCat(c); setSubCatJa(null); setFoodGroup(null); setResult(null); setCompareItems([]); }} style={{ background:mainCat?.id===c.id?"rgba(244,114,182,0.28)":S.card, border:`2px solid ${mainCat?.id===c.id?S.pink:S.border}`, borderRadius:12, padding:12, cursor:"pointer", textAlign:"left", boxShadow:mainCat?.id===c.id?"0 4px 18px rgba(244,114,182,0.35)":"0 1px 3px rgba(0,0,0,0.2)" }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{c.icon}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#ffffff" }}>{c.name[lang] || c.name.ja}</div>
                      <div style={{ fontSize:10, color:S.muted, marginTop:2 }}>{c.hint[lang] || c.hint.ja}</div>
                    </button>
                  ))}
                </div>
              </>}

              {/* ③ Food sub-group */}
              {mainCat?.id==="food" && <>
                <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:6 }}>{t.s4}</div>
                <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4, marginBottom:8, scrollbarWidth:"none" }}>
                  {FOOD_GROUPS.map(g => (
                    <button key={g.label.ja} onClick={() => { setFoodGroup(g.label.ja); setSubCatJa(null); setResult(null); }} style={{ padding:"6px 12px", background:foodGroup===g.label.ja?S.pink:S.tag, border:`1.5px solid ${foodGroup===g.label.ja?S.pink:S.border}`, borderRadius:24, fontSize:11, cursor:"pointer", color:foodGroup===g.label.ja?"#fff":"#ffffff", whiteSpace:"nowrap", flexShrink:0, fontWeight:700 }}>
                      {g.label[lang] || g.label.ja}
                    </button>
                  ))}
                </div>
                {foodGroup && (() => {
                  const g = FOOD_GROUPS.find(g => g.label.ja === foodGroup);
                  const keys = g.subs.ja; const labels = g.subs[lang] || g.subs.ja;
                  return <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>{keys.map((k,i) => <Pill key={k} selected={subCatJa===k} onClick={() => { setSubCatJa(k); setResult(null); }} small>{labels[i]}</Pill>)}</div>;
                })()}
              </>}

              {/* ③ Non-food sub */}
              {mainCat && mainCat.id !== "food" && <>
                <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:7 }}>{t.s4b}</div>
                {(() => {
                  // famousは都市別ネスト構造（東京・京都・大阪）
                  const sc = mainCat.id === "famous" ? SUB_CATS.famous[city] : SUB_CATS[mainCat.id];
                  if (!sc) return null;
                  const keys = sc.ja; const labels = sc[lang] || sc.ja;
                  return <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>{keys.map((k,i) => <Pill key={k} selected={subCatJa===k} onClick={() => { setSubCatJa(k); setResult(null); }}>{labels[i]}</Pill>)}</div>;
                })()}
              </>}

              {/* Taxi extras */}
              {mainCat?.id === "taxi" && (
                <div style={{ marginBottom:14, display:"flex", flexDirection:"column", gap:10 }}>
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:S.muted, marginBottom:5 }}><span>{t.dist}</span><span style={{ color:S.pink, fontWeight:700 }}>{taxiDist} km</span></div>
                    <input type="range" min="1" max="50" value={taxiDist} onChange={e => { setTaxiDist(parseInt(e.target.value)); setResult(null); }} style={{ width:"100%", accentColor:S.pink }} />
                  </div>
                  <div>
                    <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:6 }}>{t.time}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:5 }}>
                      {[["朝",t.am,"🌅"],["昼",t.noon,"☀️"],["夕方",t.pm,"🌆"],["深夜",t.late,"🌙"]].map(([key,label,ic]) => (
                        <button key={key} onClick={() => { setTaxiTime(key); setResult(null); }} style={{ padding:"7px 3px", background:taxiTime===key?S.pink:S.tag, border:`1.5px solid ${taxiTime===key?S.pink:S.border}`, borderRadius:9, fontSize:10, cursor:"pointer", color:taxiTime===key?"#fff":"#ffffff" }}>{ic} {label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ④ Amount */}
              {mainCat && subCatJa && <>
                {mainCat.id === "famous" && !(PRICE_DB[globalCountry?.name]?.famous?.[city]) ? (
                  <div style={{ background:"rgba(255,140,66,0.15)", border:"1.5px solid rgba(255,140,66,0.45)", borderRadius:13, padding:18, marginBottom:12, textAlign:"center" }}>
                    <div style={{ fontSize:30, marginBottom:8 }}>🚧</div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#ffd9b8", marginBottom:5 }}>
                      {{ja:"このエリアは準備中です",en:"This area is coming soon",zh:"该地区数据准备中",ko:"이 지역은 준비 중입니다",es:"Esta área está en preparación",pt:"Esta área em preparação"}[lang] || "このエリアは準備中です"}
                    </div>
                    <div style={{ fontSize:11, color:S.muted, lineHeight:1.6 }}>
                      {{ja:"日本11都市・韓国8都市・台湾8都市に対応中。タイ等は順次拡大予定。",en:"Available in 11 Japanese, 8 Korean & 8 Taiwanese cities. Thailand etc. coming soon.",zh:"覆盖日本11个、韩国8个、台湾8个主要城市。泰国等即将上线。",ko:"일본 11개·한국 8개·대만 8개 도시 지원. 태국 등 순차 확대 예정.",es:"Disponible en 11 ciudades japonesas, 8 coreanas y 8 taiwanesas. Tailandia próximamente.",pt:"Disponível em 11 cidades japonesas, 8 coreanas e 8 taiwanesas. Tailândia em breve."}[lang] || ""}
                    </div>
                  </div>
                ) : <>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                  <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase" }}>{t.s5}</div>
                  <button onClick={() => { setCompareMode(!compareMode); setResult(null); setCompareItems([]); }} style={{ fontSize:10, padding:"4px 11px", borderRadius:20, border:`1.5px solid ${compareMode?S.pink:S.border}`, background:compareMode?S.pink:"transparent", color:compareMode?"#fff":S.muted, cursor:"pointer" }}>{compareMode?t.cmpOn:t.cmpOff}</button>
                </div>
                {!compareMode ? (
                  <>
                    <div style={{ background:S.tag, border:`1.5px solid ${parseFloat(amount)>0?S.pink:S.border}`, borderRadius:13, padding:13, marginBottom:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ background:S.pink, color:"#fff", padding:"6px 11px", borderRadius:9, fontSize:12, fontWeight:700 }}>{globalCountry?.currency || "--"}</div>
                        <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setResult(null); }} placeholder="0" style={{ flex:1, background:"none", border:"none", outline:"none", fontSize:32, fontFamily:"Georgia,serif", color:"#ffffff", minWidth:0 }} />
                      </div>
                      {jpy && parseFloat(amount)>0 && <div style={{ fontSize:12, color:S.muted, marginTop:7, paddingTop:7, borderTop:`1px solid ${S.border}` }}>{t.approx(jpy)}</div>}
                    </div>
                    <button onClick={runJudge} disabled={!canJudge} style={{ width:"100%", background:canJudge?"linear-gradient(135deg,#ff8c42,#ffb380)":"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.25)", borderRadius:13, padding:15, fontSize:14, fontWeight:700, cursor:canJudge?"pointer":"not-allowed", boxShadow:canJudge?"0 4px 20px rgba(255,140,66,0.4)":"none" }}>{t.judge}</button>
                  </>
                ) : (
                  <div>
                    <div style={{ background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:13, padding:13, marginBottom:8 }}>
                      <input value={cmpName} onChange={e => setCmpName(e.target.value)} placeholder={t.itemPh} style={{ width:"100%", background:"none", border:"none", outline:"none", fontSize:12, color:"#ffffff", marginBottom:8, fontFamily:"inherit" }} />
                      <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                        <div style={{ background:S.pink, color:"#fff", padding:"6px 10px", borderRadius:9, fontSize:11, fontWeight:700 }}>{globalCountry?.currency}</div>
                        <input type="number" value={cmpAmt} onChange={e => setCmpAmt(e.target.value)} placeholder={t.amtPh} style={{ flex:1, background:"none", border:"none", outline:"none", fontSize:24, fontFamily:"Georgia,serif", color:"#ffffff", minWidth:0 }} />
                        <button onClick={addToCompare} style={{ background:S.accent, color:"#fff", border:"none", borderRadius:9, padding:"8px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>{t.add}</button>
                      </div>
                    </div>
                    {compareItems.length>0 && (
                      <div style={{ background:S.card, border:`1px solid rgba(255,255,255,0.25)`, borderRadius:13, padding:12, marginBottom:8 }}>
                        {compareItems.map((item,i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 0", borderBottom:i<compareItems.length-1?`1px solid ${S.border}`:"none" }}>
                            <div style={{ fontSize:20 }}>{item.emoji}</div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:12, fontWeight:700 }}>{item.name}</div>
                              <div style={{ fontSize:10, color:S.muted }}>{item.amount.toLocaleString()} {item.currency} / {t.avgL}: {item.avg.toLocaleString()}</div>
                            </div>
                            <div style={{ fontSize:11, fontWeight:700, color:item.color, background:item.bg, padding:"2px 8px", borderRadius:18 }}>{item.verdict}</div>
                            <button onClick={() => setCompareItems(prev => prev.filter((_,j) => j!==i))} style={{ background:"none", border:"none", color:S.muted, cursor:"pointer", fontSize:13 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Result */}
                {result && !compareMode && (
                  <div style={{ marginTop:14 }}>
                    <div style={{ background:"rgba(255,255,255,0.08)", backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:13, padding:14, marginBottom:10, display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ fontSize:42 }}>{result.emoji}</div>
                      <div>
                        <div style={{ fontSize:24, fontFamily:"Georgia,serif", fontWeight:"bold", color:"#ffffff", textShadow:`0 0 20px ${result.color}` }}>{result.verdict}</div>
                        <div style={{ fontSize:11, color:"rgba(255,255,255,0.75)", marginTop:2 }}>
                          {result.verdict===t.cheap?t.cheapD(result.pct):result.verdict===t.exp?t.expD(result.pct):t.normalD}
                        </div>
                      </div>
                    </div>
                    <div style={{ height:6, background:S.tag, borderRadius:3, marginBottom:12, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${result.barPct}%`, background:"linear-gradient(90deg,#006e52,#7a5e00,#b84800)", borderRadius:3, transition:"width 0.8s" }} />
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.08)", backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"1px solid rgba(255,255,255,0.18)", borderLeft:`3px solid ${S.pink}`, borderRadius:9, padding:11, marginBottom:10 }}>
                      <div style={{ fontSize:9, letterSpacing:2, color:S.pink, fontWeight:800, textTransform:"uppercase", marginBottom:5 }}>{t.priceD}</div>
                      <div style={{ fontSize:11, lineHeight:1.8, color:"#ffffff" }}>{(() => {
                        const r = typeof result.reason === "object" ? (result.reason.en || result.reason.ja || "") : (result.reason || "");
                        const hasJapanese = /[ぁ-んァ-ヶー一-龯]/.test(r);
                        if (hasJapanese) {
                          return `Typical range: ${result.min.toLocaleString()}〜${result.max.toLocaleString()} ${result.currency} (avg ${result.avg.toLocaleString()}).`;
                        }
                        return r;
                      })()}</div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:10 }}>
                      {[[t.avgL,result.avg],[t.minL,result.min],[t.maxL,result.max]].map(([l,v]) => (
                        <div key={l} style={{ background:"rgba(255,255,255,0.08)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:9, padding:"9px 5px", textAlign:"center" }}>
                          <div style={{ fontSize:9, color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:1, marginBottom:2, fontWeight:600 }}>{l}</div>
                          <div style={{ fontSize:11, fontFamily:"Georgia,serif", color:"#ffffff", fontWeight:600 }}>{typeof v==="number"?v.toLocaleString():v} {result.currency}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"inline-flex", alignItems:"center", gap:3, padding:"4px 11px", borderRadius:18, fontSize:10, fontWeight:600, background:result.trend?.includes("+")?"rgba(251,146,60,0.22)":"rgba(255,255,255,0.10)", border:"1px solid rgba(255,255,255,0.18)", color:result.trend?.includes("+")?"#fdba74":"rgba(255,255,255,0.7)" }}>
                      {result.trend?.includes("+")?t.trendUp(result.trend.replace(/\+/g,"")):t.trendSt(result.trend)}
                    </div>

                    {/* 交渉アシスタント */}
                    {result.isExpensive && negotiateCountry && (
                      <div style={{ marginTop:16, background:"rgba(255,255,255,0.06)", backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"2px solid rgba(255,140,66,0.55)", borderRadius:16, padding:16, boxShadow:"0 4px 24px rgba(255,140,66,0.15)" }}>
                        <div style={{ fontSize:14, fontWeight:800, color:"#ffb380", marginBottom:4 }}>💬 {t.negotiateTitle}</div>
                        <div style={{ fontSize:11, color:"rgba(255,255,255,0.85)", marginBottom:14, lineHeight:1.5 }}>{t.negotiateDesc} ({negotiateCountry.flag} {negotiateCountry.localLangName})</div>
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:11, color:"#ffb380", fontWeight:700, marginBottom:6 }}>🗣️ {t.negotiateYou}</div>
                          <textarea value={negYouText} onChange={e => setNegYouText(e.target.value)} placeholder={t.negYouPh} style={{ width:"100%", background:"rgba(255,255,255,0.10)", border:"1.5px solid rgba(255,140,66,0.4)", borderRadius:9, padding:"8px 11px", fontSize:12, fontFamily:"inherit", resize:"vertical", minHeight:54, outline:"none", boxSizing:"border-box", marginBottom:6, color:"#fff" }} />
                          <div style={{ display:"flex", gap:6 }}>
                            <div style={{ flex:1 }}>
                              <HoldMicButton
                                onStart={() => startListeningHold(lang, setNegYouListening, setNegYouText, negMicRefYou)}
                                onEnd={() => stopListeningHold(negMicRefYou, setNegYouListening)}
                                isListening={negYouListening}
                                label={t.transHold}
                              />
                            </div>
                            <button onClick={handleNegYouSpeak} disabled={negYouTranslating||!negYouText.trim()} style={{ flex:1, padding:"9px", background:negYouTranslating?"rgba(255,255,255,0.15)":"linear-gradient(135deg,#ff8c42,#ffb380)", border:"none", borderRadius:14, fontSize:11, fontWeight:800, cursor:"pointer", color:"#fff", boxShadow: negYouTranslating?"none":"0 4px 14px rgba(255,140,66,0.4)" }}>
                              {negYouTranslating?t.transTranslating:"🌐 "+t.transTranslate}
                            </button>
                          </div>
                          {negYouTranslated && (
                            <div style={{ marginTop:8, padding:10, background:"rgba(52,211,153,0.20)", border:"1px solid rgba(52,211,153,0.4)", borderRadius:10 }}>
                              <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginBottom:6 }}>{negYouTranslated}</div>
                              <div style={{ display:"flex", gap:6 }}>
                                <button onClick={() => speakText(negYouTranslated, negotiateCountry.localLang)} style={{ flex:1, padding:"7px", background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>🔊 {t.transSpeak}</button>
                                <button onClick={() => handleCopy(negYouTranslated, "neg-you")} style={{ flex:1, padding:"7px", background:copied==="neg-you"?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.1)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>{copied==="neg-you"?t.transCopied:t.transCopy}</button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:"#ffb380", fontWeight:700, marginBottom:6 }}>👂 {t.negotiatePartner}</div>
                          <textarea value={negPartnerText} onChange={e => setNegPartnerText(e.target.value)} placeholder={`${negotiateCountry.flag} ${negotiateCountry.localLangName}...`} style={{ width:"100%", background:"rgba(255,255,255,0.10)", border:"1.5px solid rgba(255,140,66,0.4)", borderRadius:9, padding:"8px 11px", fontSize:12, fontFamily:"inherit", resize:"vertical", minHeight:54, outline:"none", boxSizing:"border-box", marginBottom:6, color:"#fff" }} />
                          <div style={{ display:"flex", gap:6 }}>
                            <div style={{ flex:1 }}>
                              <HoldMicButton
                                onStart={() => startListeningHold(negotiateCountry.localLang, setNegPartnerListening, setNegPartnerText, negMicRefPartner)}
                                onEnd={() => stopListeningHold(negMicRefPartner, setNegPartnerListening)}
                                isListening={negPartnerListening}
                                label={t.transHold}
                              />
                            </div>
                            <button onClick={handleNegPartnerSpeak} disabled={negPartnerTranslating||!negPartnerText.trim()} style={{ flex:1, padding:"9px", background:negPartnerTranslating?"rgba(255,255,255,0.15)":"linear-gradient(135deg,#ff8c42,#ffb380)", border:"none", borderRadius:14, fontSize:11, fontWeight:800, cursor:"pointer", color:"#fff", boxShadow: negPartnerTranslating?"none":"0 4px 14px rgba(255,140,66,0.4)" }}>
                              {negPartnerTranslating?t.transTranslating:"🌐 "+t.transTranslate}
                            </button>
                          </div>
                          {negPartnerTranslated && (
                            <div style={{ marginTop:8, padding:10, background:"rgba(96,176,232,0.20)", border:"1px solid rgba(96,176,232,0.4)", borderRadius:10 }}>
                              <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>💬 {negPartnerTranslated}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                </>}
              </>}
            </div>

            {/* 投稿セクション */}
            {(result||compareItems.length>0) && (
              <div style={{ margin:"10px 14px 0", background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:15, padding:14, boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:"#ffffff", marginBottom:2 }}>{t.postT}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.6)", marginBottom:10, lineHeight:1.5 }}>{t.postD}</div>
                <input value={postItem} onChange={e => setPostItem(e.target.value)} placeholder={t.postPh} style={{ width:"100%", background:S.tag, border:`1.5px solid ${postItem?S.pink:S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, outline:"none", fontFamily:"inherit", marginBottom:6, boxSizing:"border-box" }} />
                <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                  <input value={postPrice} onChange={e => setPostPrice(e.target.value)} type="number" placeholder={t.amtPh} style={{ flex:1, background:S.tag, border:`1.5px solid ${postPrice?S.pink:S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, outline:"none", fontFamily:"inherit" }} />
                </div>
                <textarea value={postText} onChange={e => setPostText(e.target.value)} placeholder={t.postComment} style={{ width:"100%", background:S.tag, border:`1.5px solid ${postText?S.pink:S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, fontFamily:"inherit", resize:"vertical", minHeight:60, outline:"none", boxSizing:"border-box", marginBottom:6 }} />
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <button onClick={() => photoInputRef.current?.click()} style={{ padding:"8px 12px", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, fontSize:11, cursor:"pointer", color:"#fff" }}>📷</button>
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display:"none" }} />
                  {postPhotoPreview && <img src={postPhotoPreview} style={{ width:40, height:40, objectFit:"cover", borderRadius:6, border:`1px solid rgba(255,255,255,0.25)` }} />}
                  <button onClick={submitPost} style={{ flex:1, background:"linear-gradient(135deg,#ec4899,#f472b6)", color:"#fff", border:"none", borderRadius:9, padding:"8px 13px", fontSize:11, fontWeight:800, cursor:"pointer", boxShadow:"0 3px 12px rgba(244,114,182,0.4)" }}>{t.postSv}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ SCAM TAB ══════════ */}
        {tab === "scam" && (
          <div>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#ffb380", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:6, textShadow:"0 2px 10px rgba(0,0,0,0.5), 0 0 30px rgba(255,140,66,0.3)" }}>{t.scamT}</div>
              <div style={{ fontSize:11, color:"#ffd9b8", fontWeight:600, background:"rgba(255,140,66,0.22)", border:"1px solid rgba(255,140,66,0.4)", display:"inline-block", padding:"3px 11px", borderRadius:18, marginTop:3 }}>{t.scamD}</div>
            </div>
            {/* City select */}
            {globalCountry && (() => {
              const sd = SCAM_DATA[globalCountry.name];
              const citiesWithData = (globalCountry?.cities?.ja||[]).filter(jaKey => sd?.[jaKey]);
              if (citiesWithData.length===0) return null;
              return (
                <div style={{ background:"rgba(255,255,255,0.05)", padding:"10px 0 10px 14px", borderTop:`1px solid ${S.border}` }}>
                  <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:7, paddingRight:14 }}>🏙️ CITY</div>
                  <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:3, paddingRight:14, scrollbarWidth:"none" }}>
                    <button onClick={() => setScamCity(null)} style={{ padding:"6px 12px", background:!scamCity?S.pink:S.tag, border:`1.5px solid ${!scamCity?S.pink:S.border}`, borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer", color:!scamCity?"#fff":"#ffffff", whiteSpace:"nowrap", flexShrink:0 }}>
                      {t.cityAll}
                    </button>
                    {citiesWithData.map(jaKey => {
                      const idx = (globalCountry?.cities?.ja||[]).indexOf(jaKey);
                      const label = (globalCountry?.cities?.[lang]||globalCountry?.cities?.ja||[])[idx]||jaKey;
                      return <button key={jaKey} onClick={() => setScamCity(jaKey)} style={{ padding:"6px 12px", background:scamCity===jaKey?S.pink:S.tag, border:`1.5px solid ${scamCity===jaKey?S.pink:S.border}`, borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer", color:scamCity===jaKey?"#fff":"#ffffff", whiteSpace:"nowrap", flexShrink:0 }}>{label}</button>;
                    })}
                  </div>
                </div>
              );
            })()}
            {/* Scam cards */}
            <div style={{ margin:"10px 14px 0" }}>
              {!globalCountry ? (
                <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:18, padding:30, textAlign:"center", color:S.muted, boxShadow:"0 2px 12px rgba(0,0,0,0.07)" }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🛡️</div>
                  <div style={{ fontSize:13 }}>{t.scamSel}</div>
                </div>
              ) : (() => {
                const { city: cityScams, national } = getScams();
                const showCity = scamCity && cityScams.length > 0;
                const items = showCity ? cityScams : national;
                if (items.length === 0) return (
                  <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:18, padding:30, textAlign:"center", color:S.muted }}>
                    <div style={{ fontSize:13 }}>{t.noPrice}</div>
                  </div>
                );
                return (
                  <>
                    {showCity ? (
                      <div style={{ background:"rgba(244,114,182,0.18)", border:"1px solid rgba(244,114,182,0.4)", borderRadius:11, padding:"9px 13px", marginBottom:10, fontSize:12, color:"#fbcfe8", fontWeight:700 }}>
                        🏙️ {(() => {
                          const idx = (globalCountry?.cities?.ja||[]).indexOf(scamCity);
                          return (globalCountry?.cities?.[lang]||globalCountry?.cities?.ja||[])[idx] || scamCity;
                        })()}{t.scamCitySpecific}
                      </div>
                    ) : (
                      <div style={{ background:"rgba(96,176,232,0.18)", border:"1px solid rgba(96,176,232,0.4)", borderRadius:11, padding:"9px 13px", marginBottom:10, fontSize:12, color:"#a8d9f5", fontWeight:700 }}>
                        🌍 {globalCountry.label?.[lang] || globalCountry.name} · {t.scamCityHdr2}
                      </div>
                    )}
                    {items.map((s,i) => (
                      <div key={i} style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:14, padding:14, marginBottom:9, boxShadow:"0 4px 16px rgba(0,0,0,0.2)", borderLeft:`4px solid ${s.level==="high"?"#ef4444":s.level==="med"?"#fbbf24":"#34d399"}` }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                          <div style={{ fontSize:24, flexShrink:0 }}>{s.icon}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap" }}>
                              <div style={{ fontSize:13, fontWeight:800, color:"#ffffff" }}>{s.title[lang]||s.title.ja||s.title.en}</div>
                              <div style={{ fontSize:10, padding:"3px 10px", borderRadius:18, fontWeight:800, background:s.level==="high"?"rgba(239,68,68,0.18)":s.level==="med"?"rgba(251,191,36,0.18)":"rgba(52,211,153,0.18)", border:`1px solid ${s.level==="high"?"rgba(239,68,68,0.5)":s.level==="med"?"rgba(251,191,36,0.5)":"rgba(52,211,153,0.5)"}`, color:s.level==="high"?"#fca5a5":s.level==="med"?"#fde68a":"#6ee7b7" }}>
                                {s.level==="high"?"🔴 "+t.lH:s.level==="med"?"🟡 "+t.lM:"🟢 "+t.lL}
                              </div>
                            </div>
                            <div style={{ fontSize:12, color:"rgba(255,255,255,0.88)", lineHeight:1.75 }}>{s.desc[lang]||s.desc.ja||s.desc.en}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ background:"rgba(96,176,232,0.15)", border:"1px solid rgba(96,176,232,0.35)", borderRadius:11, padding:11, marginBottom:14, fontSize:11, color:"#a8d9f5", lineHeight:1.75, fontWeight:600 }}>{t.scamNote}</div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ══════════ TRANSLATE TAB ══════════ */}
        {tab === "trans" && (
          <div>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#ffb380", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:6, textShadow:"0 2px 10px rgba(0,0,0,0.5), 0 0 30px rgba(255,140,66,0.3)" }}>{t.transT}</div>
              <div style={{ fontSize:11, color:"#ffd9b8", fontWeight:600, background:"rgba(255,140,66,0.22)", border:"1px solid rgba(255,140,66,0.4)", display:"inline-block", padding:"3px 11px", borderRadius:18, marginTop:3 }}>{t.transD}</div>
            </div>
            <div style={{ margin:"10px 14px 0" }}>
              {!globalCountry ? (
                <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:18, padding:30, textAlign:"center", color:S.muted }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🌐</div>
                  <div style={{ fontSize:13 }}>{t.transSelCountry}</div>
                </div>
              ) : (
                <>
                  {/* 言語インジケーター */}
                  <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:11, padding:"9px 13px", marginBottom:10, display:"flex", alignItems:"center", gap:8, border:"1px solid rgba(255,255,255,0.18)" }}>
                    <span style={{ fontSize:18 }}>{globalCountry.flag}</span>
                    <span style={{ fontSize:12, color:"#ffb380", fontWeight:700 }}>{globalCountry.localLangName}</span>
                    <span style={{ marginLeft:"auto", fontSize:10, color:"rgba(255,255,255,0.6)" }}>🌐 AI Translate</span>
                  </div>

                  {/* あなた → 現地語 */}
                  <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize:13, fontWeight:800, color:"#ffb380", marginBottom:10, letterSpacing:0.3 }}>🗣️ {getLangDisplayName(lang, lang)} → {getLangDisplayName(globalCountry.localLang, lang)}</div>
                    <textarea
                      value={youText}
                      onChange={e => setYouText(e.target.value)}
                      placeholder={t.transTextPh}
                      style={{ width:"100%", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, padding:"8px 11px", fontSize:12, fontFamily:"inherit", resize:"vertical", minHeight:60, outline:"none", boxSizing:"border-box", marginBottom:8 }}
                    />
                    <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                      <div style={{ flex:1 }}>
                        <HoldMicButton
                          onStart={() => startListeningHold(lang, setYouListening, setYouText, micRefYou)}
                          onEnd={() => stopListeningHold(micRefYou, setYouListening)}
                          isListening={youListening}
                          label={t.transHold}
                        />
                      </div>
                      <button onClick={handleYouSpeak} disabled={youTranslating||!youText.trim()} style={{ flex:1, padding:"11px", background:youTranslating?"rgba(255,255,255,0.15)":"linear-gradient(135deg,#ff8c42,#ffb380)", border:"none", borderRadius:14, fontSize:12, fontWeight:800, cursor:"pointer", color:"#fff", boxShadow: youTranslating?"none":"0 4px 16px rgba(255,140,66,0.4)" }}>
                        {youTranslating ? t.transTranslating : "🌐 "+t.transTranslate}
                      </button>
                    </div>
                    {youTranslated && (
                      <div style={{ padding:14, background:"rgba(52,211,153,0.25)", borderRadius:12 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:"#fff", marginBottom:8, lineHeight:1.5 }}>{globalCountry.flag} {youTranslated}</div>
                        <div style={{ display:"flex", gap:7 }}>
                          <button onClick={() => speakText(youTranslated, globalCountry.localLang)} style={{ flex:1, padding:"8px", background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:9, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>🔊 {t.transSpeak}</button>
                          <button onClick={() => handleCopy(youTranslated, "you")} style={{ flex:1, padding:"8px", background:copied==="you"?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.1)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:9, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>{copied==="you"?t.transCopied:t.transCopy}</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 相手 → あなたの言語 */}
                  <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize:13, fontWeight:800, color:"#ffb380", marginBottom:10, letterSpacing:0.3 }}>👂 {getLangDisplayName(globalCountry.localLang, lang)} → {getLangDisplayName(lang, lang)}</div>
                    <textarea
                      value={partnerText}
                      onChange={e => setPartnerText(e.target.value)}
                      placeholder={`${globalCountry.flag} ${globalCountry.localLangName}...`}
                      style={{ width:"100%", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, padding:"8px 11px", fontSize:12, fontFamily:"inherit", resize:"vertical", minHeight:60, outline:"none", boxSizing:"border-box", marginBottom:8 }}
                    />
                    <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                      <div style={{ flex:1 }}>
                        <HoldMicButton
                          onStart={() => startListeningHold(globalCountry.localLang, setPartnerListening, setPartnerText, micRefPartner)}
                          onEnd={() => stopListeningHold(micRefPartner, setPartnerListening)}
                          isListening={partnerListening}
                          label={t.transHold}
                        />
                      </div>
                      <button onClick={handlePartnerSpeak} disabled={partnerTranslating||!partnerText.trim()} style={{ flex:1, padding:"11px", background:partnerTranslating?"rgba(255,255,255,0.15)":"linear-gradient(135deg,#ff8c42,#ffb380)", border:"none", borderRadius:14, fontSize:12, fontWeight:800, cursor:"pointer", color:"#fff", boxShadow: partnerTranslating?"none":"0 4px 16px rgba(255,140,66,0.4)" }}>
                        {partnerTranslating ? t.transTranslating : "🌐 "+t.transTranslate}
                      </button>
                    </div>
                    {partnerTranslated && (
                      <div style={{ padding:14, background:"rgba(96,176,232,0.30)", borderRadius:12 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:"#fff", lineHeight:1.5 }}>💬 {partnerTranslated}</div>
                      </div>
                    )}
                  </div>

                  {/* 固定緊急フレーズ - メイン:選択言語、サブ:旅行先言語、音声:旅行先言語 */}
                  <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize:12, fontWeight:800, color:"#ffb380", marginBottom:6 }}>{t.transFixed}</div>
                    <div style={{ fontSize:10, color:S.muted, marginBottom:10, lineHeight:1.5 }}>{t.speakHintHdr}</div>
                    {FIXED_PHRASES.map((p,i) => {
                      const localLangCode = globalCountry.localLang || "en";
                      // 旅行先の言語のテキストを取得（無ければ英語にフォールバック）
                      const localText = p[localLangCode] || p.en;
                      // 選択言語のテキスト
                      const userText = p[lang] || p.en;
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:i<FIXED_PHRASES.length-1?`1px solid ${S.border}`:"none" }}>
                          <div style={{ fontSize:20, flexShrink:0 }}>{p.emoji}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:"#ffffff" }}>{userText}</div>
                            <div style={{ fontSize:11, color:S.pink, marginTop:2, fontWeight:600 }}>{globalCountry.flag} {localText}</div>
                          </div>
                          <button onClick={() => speakText(localText, localLangCode)} style={{ padding:"8px 12px", background:S.pink, border:"none", borderRadius:9, fontSize:13, cursor:"pointer", flexShrink:0, color:"#fff", boxShadow:"0 2px 10px rgba(244,114,182,0.4)" }}>🔊</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════ TRAVEL TAB ══════════ */}
        {tab === "travel" && (
          <div>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#ffb380", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:6, textShadow:"0 2px 10px rgba(0,0,0,0.5), 0 0 30px rgba(255,140,66,0.3)" }}>{t.travT}</div>
              <div style={{ fontSize:11, color:"#ffd9b8", fontWeight:600, background:"rgba(255,140,66,0.22)", border:"1px solid rgba(255,140,66,0.4)", display:"inline-block", padding:"3px 11px", borderRadius:18, marginTop:3 }}>{t.travD}</div>
            </div>
            <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", padding:"12px 0 12px 14px", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
              <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:3, paddingRight:14, scrollbarWidth:"none" }}>
                {LINK_CATS.map(cat => (
                  <button key={cat} onClick={() => setLinkCat(cat)} style={{ padding:"7px 15px", background:linkCat===cat?S.pink:S.tag, border:`2px solid ${linkCat===cat?S.pink:S.border}`, borderRadius:22, fontSize:12, fontWeight:linkCat===cat?700:500, cursor:"pointer", color:linkCat===cat?"#fff":"#1a1a1a", whiteSpace:"nowrap", flexShrink:0 }}>{cat}</button>
                ))}
              </div>
            </div>
            <div style={{ margin:"8px 14px 0" }}>
              {TRAVEL_LINKS.filter(l => l.cat===linkCat).map((l,i) => {
                const linkUrl = (typeof l.urls === "object" ? (l.urls[lang] || l.urls.en || l.urls.ja) : l.url);
                return (
                <a key={i} href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ display:"block", textDecoration:"none", background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", borderRadius:14, padding:14, marginBottom:9, boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:11 }}>
                    <div style={{ width:38, height:38, borderRadius:9, background:l.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, color:"#fff", flexShrink:0 }}>{l.cat}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#ffffff", marginBottom:2 }}>{typeof l.label==="object"?(l.label[lang]||l.label.ja||l.label.en):l.label}</div>
                      <div style={{ fontSize:10, color:S.muted }}>{typeof l.desc==="object"?(l.desc[lang]||l.desc.ja||l.desc.en):l.desc}</div>
                    </div>
                    <div style={{ fontSize:15, color:S.border }}>›</div>
                  </div>
                </a>
              );})}
              <div style={{ background:"rgba(255,255,255,0.08)", backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:11, padding:11, marginBottom:14, fontSize:11, color:"#ffffff", lineHeight:1.7, fontWeight:600 }}>🔒 {t.travNote}</div>
            </div>
          </div>
        )}

        {/* ══════════ TREND TAB ══════════ */}
        {tab === "trend" && (
          <div>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#ffb380", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:6, textShadow:"0 2px 10px rgba(0,0,0,0.5), 0 0 30px rgba(255,140,66,0.3)" }}>{t.trendT}</div>
              <div style={{ fontSize:11, color:"#ffd9b8", fontWeight:600, background:"rgba(255,140,66,0.22)", border:"1px solid rgba(255,140,66,0.4)", display:"inline-block", padding:"3px 11px", borderRadius:18, marginTop:3 }}>{t.trendD}</div>
            </div>
            <div style={{ margin:"0 14px" }}>
              {TREND_DATA.map((td,i) => (
                <div key={i} style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:16, padding:16, marginBottom:9, boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ fontFamily:"Georgia,serif", fontSize:15, fontWeight:"bold", color:"#ffffff" }}>{typeof td.city==="object"?(td.city[lang]||td.city.ja||td.city.en):td.city}</div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", marginTop:2 }}>{typeof td.item==="object"?(td.item[lang]||td.item.ja||td.item.en):td.item}</div>
                    </div>
                    <div style={{ padding:"3px 10px", borderRadius:18, fontSize:11, fontWeight:800, background:"rgba(251,146,60,0.25)", border:"1px solid rgba(251,146,60,0.4)", color:"#fdba74" }}>↑ {td.pct}</div>
                  </div>
                  <div style={{ height:5, background:"rgba(255,255,255,0.12)", borderRadius:3, marginBottom:7, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${td.barW}%`, background:"linear-gradient(90deg,#34d399,#fbbf24,#fb923c)", borderRadius:3 }} />
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"rgba(255,255,255,0.85)", fontWeight:600 }}>
                    <span>{t.prev}: {td.old}</span><span>{t.now}: {td.now}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ DB TAB ══════════ */}
        {tab === "db" && (
          <div>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#ffb380", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:6, textShadow:"0 2px 10px rgba(0,0,0,0.5), 0 0 30px rgba(255,140,66,0.3)" }}>{t.dbT}</div>
              <div style={{ fontSize:11, color:"#ffd9b8", fontWeight:600, background:"rgba(255,140,66,0.22)", border:"1px solid rgba(255,140,66,0.4)", display:"inline-block", padding:"3px 11px", borderRadius:18, marginTop:3 }}>{t.dbD}</div>
            </div>

            {/* 投稿フォーム（Twitter風） */}
            <div style={{ margin:"0 14px 10px", background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:16, padding:16, boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#ffb380", marginBottom:10 }}>✏️ {t.postPostBtn}</div>
              <input value={postItem} onChange={e => setPostItem(e.target.value)} placeholder={t.postPh} style={{ width:"100%", background:S.tag, border:`1.5px solid ${postItem?S.pink:S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, outline:"none", fontFamily:"inherit", marginBottom:6, boxSizing:"border-box" }} />
              <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                <div style={{ background:S.pink, color:"#fff", padding:"7px 11px", borderRadius:9, fontSize:11, fontWeight:700, flexShrink:0, boxShadow:"0 2px 8px rgba(244,114,182,0.35)" }}>{globalCountry?.currency || "---"}</div>
                <input value={postPrice} onChange={e => setPostPrice(e.target.value)} type="number" placeholder={t.amtPh} style={{ flex:1, background:S.tag, border:`1.5px solid ${postPrice?S.pink:S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, outline:"none", fontFamily:"inherit" }} />
              </div>
              <textarea value={postText} onChange={e => setPostText(e.target.value)} placeholder={t.postComment} style={{ width:"100%", background:S.tag, border:`1.5px solid ${postText?S.pink:S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, fontFamily:"inherit", resize:"vertical", minHeight:70, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
              {postPhotoPreview && (
                <div style={{ marginBottom:8, position:"relative", display:"inline-block" }}>
                  <img src={postPhotoPreview} style={{ maxWidth:"100%", maxHeight:200, borderRadius:10, border:`1px solid rgba(255,255,255,0.25)` }} />
                  <button onClick={() => { setPostPhoto(null); setPostPhotoPreview(null); }} style={{ position:"absolute", top:4, right:4, width:22, height:22, borderRadius:"50%", background:"rgba(0,0,0,0.6)", border:"none", color:"#fff", cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                </div>
              )}
              <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                <button onClick={() => photoInputRef.current?.click()} style={{ padding:"9px 14px", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:10, fontSize:12, cursor:"pointer", color:"#fff", display:"flex", alignItems:"center", gap:5 }}>📷 {t.postPhoto}</button>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display:"none" }} />
                <button onClick={submitPost} style={{ flex:1, background:"linear-gradient(135deg,#ec4899,#f472b6)", color:"#fff", border:"none", borderRadius:10, padding:"9px 13px", fontSize:12, fontWeight:800, cursor:"pointer", boxShadow:"0 4px 14px rgba(244,114,182,0.4)" }}>{t.postSv}</button>
              </div>
            </div>

            {/* 投稿一覧 */}
            <div style={{ margin:"0 14px" }}>
              {posts.length===0 ? (
                <div style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:18, padding:34, textAlign:"center", color:"rgba(255,255,255,0.7)" }}>
                  <div style={{ fontSize:34, marginBottom:10 }}>🏪</div>
                  <div style={{ fontSize:13 }}>{t.dbE}</div>
                </div>
              ) : posts.map((p,i) => (
                <div key={i} style={{ background:S.card, backdropFilter:"blur(14px) saturate(140%)", WebkitBackdropFilter:"blur(14px) saturate(140%)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:14, padding:14, marginBottom:10, boxShadow:"0 2px 10px rgba(0,0,0,0.2)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:p.text||p.photo?8:0 }}>
                    <div>
                      {p.item && <div style={{ fontSize:13, fontWeight:700, color:"#ffffff" }}>{p.item}</div>}
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.6)", marginTop:2 }}>{p.city} · {p.time}</div>
                    </div>
                    {p.price && <div style={{ fontFamily:"Georgia,serif", fontSize:15, color:S.pink, fontWeight:800, flexShrink:0, textShadow:"0 0 12px rgba(244,114,182,0.5)" }}>{parseFloat(p.price).toLocaleString()} {p.currency}</div>}
                  </div>
                  {p.text && <div style={{ fontSize:12, color:"rgba(255,255,255,0.85)", lineHeight:1.6, marginBottom:p.photo?8:0 }}>{p.text}</div>}
                  {p.photo && <img src={p.photo} style={{ width:"100%", borderRadius:10, maxHeight:200, objectFit:"cover" }} />}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:860, background:"rgba(10,26,46,0.75)", backdropFilter:"blur(20px) saturate(160%)", WebkitBackdropFilter:"blur(20px) saturate(160%)", borderTop:"1px solid rgba(255,255,255,0.15)", display:"flex", zIndex:100 }}>
        {[
          ["check","🔍",t.tabC],
          ["scam","⚠️",t.tabS],
          ["trans","🌐",t.tabTr],
          ["travel","✈️",t.tabTv],
          ["trend","📊",t.tabTd],
          ["db","🗄️",t.tabD],
        ].map(([id,icon,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex:1, padding:"11px 0 7px", textAlign:"center", cursor:"pointer", color:tab===id?"#ffb380":"rgba(255,255,255,0.65)", fontSize:9, fontFamily:"inherit", letterSpacing:0.2, border:"none", background:"none", fontWeight:tab===id?800:500 }}>
            <div style={{ fontSize:18, marginBottom:2, filter: tab===id?"drop-shadow(0 0 8px rgba(255,179,128,0.6))":"none" }}>{icon}</div>{label}
          </button>
        ))}
      </div>

      {/* Listening Overlay (Google-style mic UI when holding) */}
      <ListeningOverlay
        visible={youListening || partnerListening || negYouListening || negPartnerListening}
        onEnd={() => {
          if (youListening) stopListeningHold(micRefYou, setYouListening);
          if (partnerListening) stopListeningHold(micRefPartner, setPartnerListening);
          if (negYouListening) stopListeningHold(negMicRefYou, setNegYouListening);
          if (negPartnerListening) stopListeningHold(negMicRefPartner, setNegPartnerListening);
        }}
      />

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:95, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg,#ec4899,#f472b6)", color:"#fff", padding:"10px 20px", borderRadius:24, fontSize:12, fontWeight:700, zIndex:200, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(244,114,182,0.5)" }}>{toast}</div>
      )}

      {/* 設定モーダル */}
      {showSettings && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={() => setShowSettings(false)}>
          <div style={{ background:"rgba(20,40,70,0.85)", backdropFilter:"blur(24px) saturate(160%)", WebkitBackdropFilter:"blur(24px) saturate(160%)", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:860, maxHeight:"75vh", overflowY:"auto", borderTop:"1px solid rgba(255,255,255,0.18)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:17, fontWeight:800, color:"#ffffff" }}>{t.settingsTitle}</div>
              <button onClick={() => setShowSettings(false)} style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", fontSize:16, cursor:"pointer", color:"#ffffff", width:32, height:32, borderRadius:"50%" }}>✕</button>
            </div>
            {Object.entries(hText).map(([key, text]) => (
              <div key={key} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, padding:"12px 14px", marginBottom:8 }}>
                <div style={{ fontSize:12, lineHeight:1.7, color:"rgba(255,255,255,0.9)" }}>{text}</div>
              </div>
            ))}
            <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(255,179,128,0.15)", border:"1px solid rgba(255,179,128,0.3)", borderRadius:12, fontSize:11, color:"#ffd9b8", lineHeight:1.6 }}>
              {t.settingsNote}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
