import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────
// SPEECH SYNTHESIS
// ─────────────────────────────────────────────────────────
function speakText(text, langCode) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const map = {
    ja:"ja-JP", th:"th-TH", ko:"ko-KR", en:"en-US", zh:"zh-CN",
    vi:"vi-VN", id:"id-ID", hi:"hi-IN", fr:"fr-FR", it:"it-IT",
    de:"de-DE", es:"es-ES", pt:"pt-BR", ms:"ms-MY", ar:"ar-SA",
    tr:"tr-TR", ru:"ru-RU", nl:"nl-NL", fi:"fi-FI", no:"nb-NO",
    el:"el-GR", mn:"mn-MN", km:"km-KH", lo:"lo-LA",
  };
  u.lang = map[langCode] || "en-US";
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
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
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Translate the following text to ${toLocalName} (language code: ${toLang}). This is for travel/price negotiation context. Return ONLY the translated text, nothing else, no explanations.\n\nText: ${text}`
        }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || "";
  } catch { return ""; }
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
{ name:"韓国", flag:"🇰🇷", currency:"KRW", rate:0.011, region:"asia",
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
{ name:"タイ", flag:"🇹🇭", currency:"THB", rate:0.0043, region:"asia",
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
};

// ─────────────────────────────────────────────────────────
// PRICE DATABASE (主要4カ国・詳細版)
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
  },
};

// ─────────────────────────────────────────────────────────
// DEFAULT DB GENERATOR (34カ国対応)
// ─────────────────────────────────────────────────────────
function getDefaultDB(country) {
  const r = country.rate || 1;
  const b = (avgJPY, minR=0.5, maxR=2.5) => ({
    min: Math.round(avgJPY*minR/r), avg: Math.round(avgJPY/r), max: Math.round(avgJPY*maxR/r),
    trend: "+8%", reason: `${country.label?.ja||country.name}の一般的な相場です。都市・エリアによって異なります。`
  });
  const tb = (baseJPY, perKmJPY) => ({
    minPerKm: Math.round(perKmJPY/r), baseMin: Math.round(baseJPY*0.8/r), baseAvg: Math.round(baseJPY/r),
    surge: {"深夜":1.3,"夕方":1.2,"朝":1.1,"昼":1.0}, trend: "+8%",
    reason: `${country.label?.ja||country.name}の一般的なタクシー相場です。`
  });
  return {
    food:{
      "🏪 コンビニ":b(400),"🍢 屋台":b(500),"🍜 ローカル食堂":b(800),"🍣 チェーン":b(900),
      "🍽️ カジュアル":b(1800),"🥂 中級":b(5000),"🥩 高級":b(12000),"👑 超高級":b(30000),
      "🌅 朝食":b(600),"☀️ ランチ":b(1400),"🌆 ディナー":b(4000),"🍱 テイクアウト":b(700),
      "☕ カフェ軽食":b(1400),"🌙 夜食":b(700),"🍜 現地料理":b(1000),"🍣 魚介・海鮮":b(4000),
      "🥩 肉料理":b(3500),"🌱 ベジタリアン":b(1800),"🍕 洋食":b(2500),"🍱 他国アジア":b(1800),"🍰 スイーツ":b(700)
    },
    drink:{"🏪 コンビニ":b(200),"🧋 タピオカ":b(700),"☕ カフェ":b(800),"🍺 バー":b(1200),"🧃 屋台ドリンク":b(300)},
    taxi:{
      "🚕 一般タクシー":tb(500,200),"📱 Grab/Uber":tb(600,250),"🛺 トゥクトゥク":tb(400,150),
      "🚌 バス":{minPerKm:Math.round(15/r),baseMin:Math.round(150/r),baseAvg:Math.round(200/r),surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+3%",reason:"公共交通機関は最もコスパが良い。"}
    },
    hotel:{"🏠 ゲストハウス":b(4000),"⭐ ビジネス":b(12000),"⭐⭐ 中級":b(25000),"⭐⭐⭐ 高級":b(60000),"🏖️ リゾート":b(50000)},
    shopping:{"👕 衣料":b(3500),"💄 コスメ":b(2500),"🛒 スーパー":b(600),"🎁 おみやげ":b(2500),"💻 家電":b(35000)},
    activity:{"🏛️ 観光入場":b(2000),"🤿 アクティビティ":b(10000),"💆 マッサージ":b(6000),"🎭 エンタメ":b(9000),"🚌 ツアー":b(12000)},
  };
}

function getTaxiPrice(db, subKey, dist, time, cf) {
  const d = db?.[subKey];
  if (!d || (!d.minPerKm && d.minPerKm!==0)) return null;
  const surge = d.surge?.[time] || 1.0;
  const distNum = parseInt(dist) || 5;
  return {
    avg: Math.round((d.baseAvg+d.minPerKm*distNum)*surge*cf),
    min: Math.round((d.baseMin+d.minPerKm*0.8*distNum)*cf),
    max: Math.round((d.baseAvg+d.minPerKm*1.6*distNum)*(d.surge?.["深夜"]||1.3)*cf),
    trend: d.trend, reason: d.reason,
  };
}

// 日本語都市名 → 英語都市名 を country.cities から取得
function getCityEN(country, cityJa) {
  if (!country?.cities?.ja || !country?.cities?.en) return cityJa;
  const idx = country.cities.ja.indexOf(cityJa);
  if (idx < 0) return cityJa;
  return country.cities.en[idx] || cityJa;
}

function getPriceInfo(country, city, catId, subCatJa, dist, time, lang) {
  const db = PRICE_DB[country.name] || getDefaultDB(country);
  const cf = CITY_FACTOR[city] || 1.0;
  if (catId==="taxi") return getTaxiPrice(db[catId], subCatJa, dist, time, cf);
  const base = db[catId]?.[subCatJa];
  if (!base) return null;
  // 都市名を英語表記に
  const cityEN = getCityEN(country, city);
  // 注釈は英語のみ
  const note = cf!==1.0 ? ` *Reflects ${cityEN}'s price coefficient (×${cf}).` : "";
  // reason は英語固定（reasonEN があればそれを優先、なければ既存 reason をそのまま使う）
  let reasonText = "";
  if (base.reasonEN) reasonText = base.reasonEN;
  else if (typeof base.reason === "object") reasonText = (base.reason.en || base.reason.ja || "");
  else reasonText = base.reason || "";
  return { min:Math.round(base.min*cf), avg:Math.round(base.avg*cf), max:Math.round(base.max*cf), trend:base.trend, reason:reasonText+note };
}

function judgeVerdict(amount, min, avg, max, t) {
  if (amount<=avg*0.75) return {verdict:t.cheap,emoji:"🤩",color:"#006e52",bg:"#e0f5ef",pct:Math.round((1-amount/avg)*100)};
  if (amount<=avg*1.25) return {verdict:t.normal,emoji:"😊",color:"#7a5e00",bg:"#fdf6d8",pct:0};
  return {verdict:t.exp,emoji:"😮",color:"#b84800",bg:"#fdeee0",pct:Math.round((amount/avg-1)*100)};
}

// ─────────────────────────────────────────────────────────
// SCAM DATA
// 構成: _default = 国全体10個, 各都市キー = 都市固有10個
// 都市と国を絶対に混同しない
// ─────────────────────────────────────────────────────────
const SCAM_DATA = {

  日本: {
    _default: [
      {icon:"🏮",level:"high",title:{ja:"ぼったくりバー（全国）",en:"Ripoff bars (nationwide)"},desc:{ja:"客引きに誘われたバー・クラブは法外な請求が多発。「飲み放題」と言われても契約書を確認。断れない雰囲気を作るのが手口。",en:"Bars with touts overcharge heavily. Always check the contract even for 'all-you-can-drink'."}},
      {icon:"💴",level:"high",title:{ja:"偽両替・スキミング",en:"Fake exchange/skimming"},desc:{ja:"街頭での両替勧誘は詐欺の可能性。ATMはセブンイレブン・郵便局・銀行内のみ使用。スキミング装置に注意。",en:"Street money exchange offers may be scams. Use ATMs inside 7-Eleven, post offices, or banks only."}},
      {icon:"🚕",level:"med",title:{ja:"タクシー遠回り",en:"Taxi detour"},desc:{ja:"空港・駅近くのタクシーは遠回りすることがある。乗車前にGoogleマップで経路を確認し、目的地をアプリで提示。",en:"Taxis near airports/stations may take detours. Show your destination via Google Maps before boarding."}},
      {icon:"📱",level:"med",title:{ja:"偽WiFiフィッシング",en:"Fake WiFi phishing"},desc:{ja:"観光地の「Free WiFi」に注意。VPNを使用するか、データ通信を利用。個人情報・クレジットカード情報の入力は避ける。",en:"Beware fake 'Free WiFi' at tourist spots. Use a VPN or mobile data. Never enter personal/card info."}},
      {icon:"🎎",level:"med",title:{ja:"着物・浴衣体験の過剰請求",en:"Kimono experience overcharge"},desc:{ja:"着物レンタルでオプション追加後に高額請求される事例あり。着付け・写真撮影の全料金を事前に書面で確認。",en:"Kimono rentals may add unexpected charges. Confirm ALL fees in writing before starting."}},
      {icon:"🏧",level:"med",title:{ja:"ATM詐欺・振り込め詐欺",en:"ATM fraud"},desc:{ja:"「警察・銀行員を名乗る詐欺」が外国人観光客にも増加中。いかなる理由でも知らない人からの指示でATM操作はしない。",en:"'Police/banker impersonation' ATM fraud is increasing. Never follow ATM instructions from strangers."}},
      {icon:"🎯",level:"low",title:{ja:"街頭アンケート詐欺",en:"Street survey scam"},desc:{ja:"アンケートや署名を求めた後、高額な商品・寄付を要求する手口。丁寧に断ってOK。",en:"Surveys/signature requests followed by demands for expensive purchases or donations. Just politely refuse."}},
      {icon:"💊",level:"low",title:{ja:"飲食物への異物混入",en:"Drink spiking"},desc:{ja:"見知らぬ人からの飲み物は受け取らない。バーでは自分の飲み物から目を離さない。",en:"Don't accept drinks from strangers. Never leave your drink unattended at bars."}},
      {icon:"🗾",level:"low",title:{ja:"チップ文化について",en:"About tipping"},desc:{ja:"日本はチップ不要。ホテル・レストラン・タクシー全て不要。渡そうとすると断られる場合もある。",en:"Japan has NO tipping culture. Hotels, restaurants, taxis — none require tips. It may even be refused."}},
      {icon:"🏥",level:"low",title:{ja:"医療費・旅行保険",en:"Medical costs & insurance"},desc:{ja:"日本の医療費は外国人には高額。旅行保険への加入を強く推奨。救急は119番。",en:"Medical costs in Japan are high for foreigners. Travel insurance is strongly recommended. Emergency: 119."}},
    ],
    東京: [
      {icon:"🎴",level:"high",title:{ja:"歌舞伎町ぼったくり",en:"Kabukicho extreme ripoff"},desc:{ja:"新宿歌舞伎町の客引きによるバーでは1杯に数十万円請求の事例あり。「ぼったくり防止条例」違反だが後を絶たない。絶対に客引きについていかない。",en:"Kabukicho touts lead to bars charging hundreds of thousands of yen per drink. Never follow anyone."}},
      {icon:"💼",level:"high",title:{ja:"偽ブランド品売買",en:"Fake brand goods"},desc:{ja:"アメ横・一部路地での偽ブランド品は違法。購入した場合、帰国時に没収される可能性。",en:"Fake brand goods in Ameyoko/backstreets are illegal. Items may be confiscated at customs on return."}},
      {icon:"📸",level:"med",title:{ja:"浅草・観光地での強引な物売り",en:"Aggressive vendors in Asakusa"},desc:{ja:"浅草仲見世周辺での強引な土産品販売・人力車の乗車強要に注意。価格は事前確認。",en:"Beware aggressive souvenir sellers and rickshaw operators near Nakamise. Always confirm prices first."}},
      {icon:"🚇",level:"med",title:{ja:"電車内スリ・痴漢",en:"Pickpockets & groping on trains"},desc:{ja:"混雑した電車でのスリに注意。女性専用車両を活用。不審に思ったら声を上げる。",en:"Watch for pickpockets on crowded trains. Women can use women-only cars. Speak up if harassed."}},
      {icon:"🏨",level:"med",title:{ja:"カプセルホテル・ゲストハウスの盗難",en:"Theft at capsule hotels"},desc:{ja:"共有スペースでの貴重品管理に注意。必ずロッカーを使用。パスポートは常に携帯推奨。",en:"Keep valuables secure in shared spaces. Always use lockers. Carry your passport at all times."}},
      {icon:"🎮",level:"med",title:{ja:"アキハバラ・ぼったくりマッサージ",en:"Akihabara/massage ripoffs"},desc:{ja:"秋葉原周辺の一部マッサージ店・メイドカフェで過剰請求。入店前に全メニューと料金を確認。",en:"Some massage parlors/maid cafes in Akihabara overcharge. Check the full menu and prices before entering."}},
      {icon:"🗼",level:"low",title:{ja:"東京タワー・スカイツリー周辺の物売り",en:"Vendors near Tokyo Tower/Skytree"},desc:{ja:"周辺での土産品は公式ショップより割高な場合あり。価格比較を推奨。",en:"Souvenir prices near attractions may be higher than official shops. Compare prices."}},
      {icon:"🍣",level:"low",title:{ja:"回転寿司の価格確認",en:"Conveyor belt sushi prices"},desc:{ja:"観光地近くの回転寿司は通常より高い場合あり。食べログ・Google口コミで価格帯を確認。",en:"Conveyor belt sushi near tourist spots may cost more. Check Tabelog/Google reviews for price range."}},
      {icon:"🚖",level:"low",title:{ja:"羽田・成田空港タクシー",en:"Narita/Haneda airport taxis"},desc:{ja:"成田から都心はタクシーで2〜3万円。リムジンバスや成田エクスプレスが安くて確実。",en:"Narita to central Tokyo by taxi costs ¥20,000-30,000. Limousine buses or N'EX are cheaper and reliable."}},
      {icon:"💴",level:"low",title:{ja:"両替レートの確認",en:"Check exchange rates"},desc:{ja:"空港の両替は手数料高め。セブン銀行ATM・郵便局ATMが外国カード対応で手数料安め。",en:"Airport exchange has high fees. Seven Bank ATMs and post office ATMs accept foreign cards with lower fees."}},
    ],
    大阪: [
      {icon:"🦀",level:"high",title:{ja:"道頓堀・カニ看板周辺の客引き",en:"Dotonbori aggressive touts"},desc:{ja:"道頓堀のカニ看板や千日前付近で過剰請求の飲食店・カラオケへの客引きに注意。入店前にメニュー・価格を必ず確認。",en:"Near Dotonbori crab sign and Sennichimae, touts lead to overpriced restaurants/karaoke. Check prices first."}},
      {icon:"🎰",level:"high",title:{ja:"違法カジノ・ギャンブル",en:"Illegal gambling"},desc:{ja:"大阪の一部地域で違法カジノに誘う手口あり。パチンコは合法だが換金は違法なグレーゾーン。",en:"Illegal casino invitations exist in some areas. Pachinko is legal but prize exchange is a legal gray zone."}},
      {icon:"🛍️",level:"med",title:{ja:"心斎橋・コスメ爆買いトラブル",en:"Shinsaibashi cosmetics overcharge"},desc:{ja:"心斎橋の一部化粧品店で中国語話者向けの過剰な押し売り報告あり。定価確認と比較を推奨。",en:"Some cosmetics stores in Shinsaibashi have reports of aggressive selling. Compare prices before buying."}},
      {icon:"🏯",level:"med",title:{ja:"大阪城周辺の偽チケット売り",en:"Fake tickets near Osaka Castle"},desc:{ja:"大阪城近辺で非公式のガイドや偽チケットを売る業者に注意。公式窓口・公式アプリのみ使用。",en:"Unofficial guides and fake ticket sellers operate near Osaka Castle. Use only official windows/apps."}},
      {icon:"🍜",level:"med",title:{ja:"黒門市場の観光客向け割高価格",en:"Kuromon Market tourist pricing"},desc:{ja:"黒門市場は近年観光客向け価格に。食べ歩き価格は割高。地元スーパーと比較してから購入を。",en:"Kuromon Market has shifted to tourist pricing. Street food prices are high. Compare with local supermarkets."}},
      {icon:"🚌",level:"low",title:{ja:"大阪観光バスのぼったくり",en:"Tour bus overcharging"},desc:{ja:"非公式の観光バスは割高。大阪市営バス・地下鉄の1日乗り放題パスが割安でおすすめ。",en:"Unofficial tour buses are expensive. The Osaka metro/bus 1-day pass is much better value."}},
      {icon:"📷",level:"low",title:{ja:"道頓堀川の危険",en:"Dotonbori canal danger"},desc:{ja:"道頓堀川への飛び込みは厳禁。転落事故が毎年発生。柵のそばでの写真撮影は注意。",en:"Jumping into the Dotonbori canal is strictly prohibited. Falls happen yearly. Be careful near railings."}},
      {icon:"🍺",level:"low",title:{ja:"ミナミ・キタのバー料金",en:"Bar prices in Minami/Kita"},desc:{ja:"ミナミ（難波）・キタ（梅田）のバーはエリアによって価格差大。入店前にチャージ料・ドリンク料金を確認。",en:"Bar prices vary greatly in Minami/Kita. Always check cover charges and drink prices before entering."}},
      {icon:"💳",level:"low",title:{ja:"免税手続きの確認",en:"Tax refund procedures"},desc:{ja:"大阪は免税対応店が多い。5,000円以上の購入でパスポート提示により消費税(10%)還付あり。",en:"Osaka has many tax-free stores. Purchases over ¥5,000 with passport get 10% consumption tax refunded."}},
      {icon:"🎭",level:"low",title:{ja:"道頓堀のストリートパフォーマー",en:"Street performers in Dotonbori"},desc:{ja:"道頓堀のパフォーマーへの投げ銭は任意。強要された場合は断ってOK。",en:"Tips for street performers in Dotonbori are voluntary. It's OK to refuse if pressured."}},
    ],
    京都: [
      {icon:"📸",level:"high",title:{ja:"舞妓・芸妓への無断撮影",en:"Unauthorized maiko/geiko photography"},desc:{ja:"祇園の花見小路では舞妓・芸妓への無断撮影・接触は条例で禁止。違反すると10,000円の罰金。観光客マナーを守ること。",en:"Unauthorized photography/contact with maiko/geiko in Gion is prohibited by ordinance. Fine: ¥10,000."}},
      {icon:"🏯",level:"high",title:{ja:"偽ガイドによる詐欺",en:"Fake guide scams"},desc:{ja:"嵐山・清水寺周辺で非公認の「ガイド」が高額ツアーを勧めてくる。公認ガイドは京都観光協会認定。",en:"Unofficial 'guides' near Arashiyama/Kiyomizudera offer expensive tours. Use only Kyoto Tourism Association guides."}},
      {icon:"🎎",level:"med",title:{ja:"着物レンタルの過剰オプション",en:"Kimono rental upselling"},desc:{ja:"嵐山・祇園の着物レンタルで写真・ヘアセット等のオプション追加後に高額請求あり。全料金を事前に書面確認。",en:"Kimono rentals in Arashiyama/Gion add photo/hair options with high charges. Get all prices in writing."}},
      {icon:"🍵",level:"med",title:{ja:"抹茶・茶道体験の価格差",en:"Matcha/tea ceremony price variation"},desc:{ja:"清水寺・二年坂周辺の抹茶スイーツは観光客向け価格。同じ品質でも祇園より四条周辺の方が安い場合あり。",en:"Matcha sweets near Kiyomizudera are tourist-priced. Same quality may be cheaper around Shijo area."}},
      {icon:"🚌",level:"med",title:{ja:"市バス混雑と料金",en:"City bus crowding and fares"},desc:{ja:"観光シーズンの市バスは極端に混雑。バス1日乗り放題600円がお得。タクシーは渋滞でメーターが上がり高額になることも。",en:"City buses are extremely crowded in peak season. 1-day pass ¥600 is good value. Taxis meter up in traffic."}},
      {icon:"🦌",level:"low",title:{ja:"嵐山周辺の人力車価格",en:"Rickshaw prices in Arashiyama"},desc:{ja:"嵐山の人力車は1コース2,000〜5,000円程度。乗車前に料金・コースを必ず確認。",en:"Rickshaws in Arashiyama cost ¥2,000-5,000 per course. Always confirm price and route before boarding."}},
      {icon:"🏮",level:"low",title:{ja:"先斗町のぼったくり居酒屋",en:"Pontocho ripoff izakayas"},desc:{ja:"先斗町の一部居酒屋はチャージ料が高く観光客向け価格。食べログで事前に価格帯・口コミを確認。",en:"Some Pontocho izakayas have high cover charges for tourists. Check Tabelog reviews and price range first."}},
      {icon:"⛩️",level:"low",title:{ja:"伏見稲荷の露店",en:"Fushimi Inari street stalls"},desc:{ja:"伏見稲荷大社の参道露店は価格がまちまち。同じ商品でも値段差大。比較してから購入を。",en:"Street stall prices at Fushimi Inari vary widely for the same items. Compare before buying."}},
      {icon:"🎋",level:"low",title:{ja:"竹林（嵐山）での撮影マナー",en:"Photography etiquette in bamboo grove"},desc:{ja:"嵐山竹林での三脚使用は禁止エリアあり。他の観光客の邪魔にならない撮影を。スタッフの指示に従うこと。",en:"Tripods are banned in some areas of Arashiyama bamboo grove. Follow staff instructions."}},
      {icon:"💴",level:"low",title:{ja:"嵐山・清水坂のお土産価格",en:"Souvenir prices in Arashiyama/Kiyomizuzaka"},desc:{ja:"観光地の土産物店は価格が高め。京都駅内・地元の商店街の方が同じ商品を安く購入できる場合が多い。",en:"Souvenir shops at tourist spots charge more. Kyoto Station or local shopping streets often have lower prices."}},
    ],
    博多・福岡: [
      {icon:"🍜",level:"med",title:{ja:"中洲屋台の料金確認",en:"Nakasu food stall pricing"},desc:{ja:"中洲の屋台は観光客向けで割高な場合あり。メニューと価格を座る前に確認すること。チャージ料が別途かかる屋台も。",en:"Nakasu food stalls may be tourist-priced. Check menu and prices before sitting. Some charge extra fees."}},
      {icon:"🎰",level:"med",title:{ja:"ゲームセンター・風俗エリア",en:"Entertainment district awareness"},desc:{ja:"中洲の風俗・キャバクラ街での法外な請求トラブルに注意。店の外での勧誘には応じないこと。",en:"Overcharging incidents occur in Nakasu entertainment districts. Don't follow street touts into clubs."}},
      {icon:"🚕",level:"low",title:{ja:"天神・博多駅タクシー",en:"Tenjin/Hakata station taxis"},desc:{ja:"天神・博多駅周辺のタクシーは比較的良心的。深夜は遠回りに注意。メーターONを乗車時に確認。",en:"Taxis near Tenjin/Hakata are relatively honest. Watch for detours at night. Confirm meter is ON."}},
      {icon:"🏖️",level:"low",title:{ja:"海の中道・志賀島の料金",en:"Uminonakamichi/Shikanoshima pricing"},desc:{ja:"海の中道海浜公園の入場料は大人450円。売店の価格は高め。食べ物は持参がお得。",en:"Uminonakamichi Seaside Park entry: ¥450/adult. Stalls are pricey. Bringing food is more economical."}},
      {icon:"✈️",level:"low",title:{ja:"福岡空港の両替レート",en:"Fukuoka airport exchange rates"},desc:{ja:"福岡空港の両替は手数料高め。市内のセブン銀行ATMやゆうちょATMの方がレートが良い。",en:"Airport exchange in Fukuoka has high fees. Better rates at Seven Bank or Japan Post ATMs in the city."}},
      {icon:"🍣",level:"low",title:{ja:"長浜鮮魚市場の観光客価格",en:"Nagahama fish market tourist prices"},desc:{ja:"長浜鮮魚市場周辺の飲食店は観光客向け価格。早朝の市場食堂は地元の人も使うので比較的良心的。",en:"Restaurants near Nagahama fish market charge tourist prices. Early morning market eateries are better value."}},
      {icon:"🏯",level:"low",title:{ja:"福岡城跡の無料エリア確認",en:"Fukuoka Castle free areas"},desc:{ja:"福岡城跡の大部分は無料。桜の季節は周辺の有料駐車場を強要する業者に注意。公共交通機関の利用を推奨。",en:"Most of Fukuoka Castle ruins is free. In cherry blossom season, watch for parking touts. Use public transit."}},
      {icon:"💳",level:"low",title:{ja:"キャッシュレス対応状況",en:"Cashless payment availability"},desc:{ja:"博多エリアは比較的キャッシュレス対応が進んでいる。屋台の多くは現金のみなので小銭準備を。",en:"Hakata area has good cashless coverage. However, most food stalls are cash-only, so bring small change."}},
      {icon:"🎵",level:"low",title:{ja:"ライブ・イベントのチケット詐欺",en:"Event ticket scams"},desc:{ja:"ヤフオクや街頭での転売チケットは偽物リスクあり。公式サイト・コンビニ端末での購入が安全。",en:"Resale tickets from Yahoo Auctions or street sellers risk being fake. Buy only from official sites/convenience stores."}},
      {icon:"🍶",level:"low",title:{ja:"キャナルシティ周辺の詐欺",en:"Canal City area scams"},desc:{ja:"キャナルシティ周辺の一部免税店で外国人観光客への過剰な勧誘報告あり。商品は複数店舗で価格比較を。",en:"Some duty-free shops near Canal City aggressively target foreign tourists. Compare prices at multiple stores."}},
    ],
    那覇・沖縄: [
      {icon:"🏖️",level:"high",title:{ja:"マリンスポーツ業者の悪質商法",en:"Shady marine sports operators"},desc:{ja:"ビーチ近くの無許可マリンスポーツ業者に注意。事前に料金・保険・資格を確認。無許可業者はトラブル時に補償なし。",en:"Beware unlicensed marine sports operators on beaches. Check prices, insurance, and certifications beforehand."}},
      {icon:"🚗",level:"high",title:{ja:"レンタカーの追加保険強要",en:"Forced rental car insurance"},desc:{ja:"レンタカー会社で過剰な保険加入を強要されることあり。必要な補償内容を事前に確認し、不要な保険は断る権利がある。",en:"Some rental car companies pressure you into excessive insurance. Know what coverage you need and refuse extra."}},
      {icon:"🍍",level:"med",title:{ja:"国際通りの土産品価格",en:"Kokusai-dori souvenir prices"},desc:{ja:"国際通りの土産品は観光客向け価格。同じ商品でも牧志公設市場周辺や地元スーパーの方が安い場合あり。",en:"Kokusai-dori souvenir prices are tourist rates. Makishi Public Market and local supermarkets may be cheaper."}},
      {icon:"🐟",level:"med",title:{ja:"牧志市場の量り売りトラブル",en:"Weight-based pricing at Makishi Market"},desc:{ja:"牧志公設市場の量り売りは買う前に単価と総額を必ず確認。思わぬ高額になるケースあり。",en:"At Makishi Market, always confirm unit price and total before buying weight-based goods. Costs can surprise."}},
      {icon:"🏝️",level:"med",title:{ja:"離島フェリーの追加料金",en:"Island ferry extra charges"},desc:{ja:"離島行きフェリーは正規料金以外に観光税・桟橋使用料が加算されることあり。総額を事前に確認。",en:"Island ferries may add tourist tax and pier fees on top of the base fare. Confirm total cost beforehand."}},
      {icon:"⛽",level:"low",title:{ja:"レンタカーのガソリン代",en:"Rental car gasoline costs"},desc:{ja:"沖縄はガソリンスタンドが少ない離島もある。レンタカー返却時の給油ルールと料金を確認。満タン返しが基本。",en:"Some remote islands have few gas stations. Check refueling rules and costs for rental car return. Full tank required."}},
      {icon:"☀️",level:"low",title:{ja:"紫外線・熱中症対策",en:"UV/heat stroke precautions"},desc:{ja:"沖縄の紫外線は本土の約1.5倍。日焼け止め・帽子は必携。熱中症に注意し水分補給を怠らないこと。",en:"UV radiation in Okinawa is ~1.5x mainland Japan. Sunscreen/hat essential. Stay hydrated to avoid heat stroke."}},
      {icon:"🌊",level:"low",title:{ja:"海の危険区域・クラゲ",en:"Ocean hazards and jellyfish"},desc:{ja:"遊泳禁止区域・危険区域の表示を必ず確認。ハブクラゲは6〜10月に多発。刺された場合は流水で洗い救助を求める。",en:"Check swimming prohibited/danger zone signs. Habu jellyfish peak June-October. Rinse with water if stung."}},
      {icon:"🎆",level:"low",title:{ja:"首里城周辺の物価",en:"Prices around Shuri Castle"},desc:{ja:"首里城公園の観覧料は大人400円。周辺の飲食店・土産物店は観光地価格。那覇バスターミナル周辺の方が安め。",en:"Shuri Castle viewing: ¥400/adult. Nearby restaurants/shops are tourist-priced. Better value near Naha Bus Terminal."}},
      {icon:"🐠",level:"low",title:{ja:"ダイビング器材盗難",en:"Diving equipment theft"},desc:{ja:"ビーチに放置したダイビング器材・貴重品の盗難事例あり。必ず施錠できるロッカーに保管。",en:"Theft of diving equipment and valuables left on beaches has been reported. Always use locked storage."}},
    ],
  },

  タイ: {
    _default: [
      {icon:"🚕",level:"high",title:{ja:"タクシーメーター拒否（全国）",en:"Taxi meter refusal (nationwide)"},desc:{ja:"メーターを使わず固定料金を要求する運転手が多い。乗車前に必ずメーターONを確認。拒否されたら即降車してGrabを使う。",en:"Many drivers demand fixed prices instead of using meters. Confirm meter ON before boarding. Use Grab if refused."}},
      {icon:"💎",level:"high",title:{ja:"宝石詐欺（全国）",en:"Gem scam (nationwide)"},desc:{ja:"「今日だけ特別価格」の宝石・シルクは100%詐欺。友好的な見知らぬ人の案内は全て断ること。損失は数万〜数十万円に及ぶ。",en:"'Special price today' gems/silk are 100% scams. Refuse ALL guidance from friendly strangers. Losses reach millions."}},
      {icon:"🛺",level:"high",title:{ja:"トゥクトゥク・観光店舗ツアー",en:"Tuk-tuk tour to commission shops"},desc:{ja:"「寺院が閉まっている」「特別な観光スポットに案内する」と言ってコミッションショップへ連れて行く手口。トゥクトゥクは目的地直行のみ使用。",en:"'Temple is closed' or 'special spot' leads to commission shops. Use tuk-tuks for direct routes only."}},
      {icon:"🙏",level:"high",title:{ja:"寺院閉鎖詐欺（全国）",en:"Temple closed scam (nationwide)"},desc:{ja:"「今日は特別な日で閉まっている」と嘘をついて別の場所に誘導。タイの主要寺院は基本毎日開いている。公式サイトで確認。",en:"'Temple closed today' lie redirects you elsewhere. Major Thai temples are open daily. Verify officially."}},
      {icon:"🏧",level:"high",title:{ja:"ATMスキミング・偽ATM",en:"ATM skimming/fake ATM"},desc:{ja:"街頭ATMにはスキミング装置取り付けの事例多数。銀行内ATM・大型ショッピングモール内ATMを優先使用。暗証番号は必ず隠す。",en:"Street ATMs frequently have skimming devices. Use ATMs inside banks or major malls. Always cover your PIN."}},
      {icon:"🍺",level:"med",title:{ja:"バー・クラブの過剰請求",en:"Bar/club overcharging"},desc:{ja:"パタヤ・バンコクのバーガール・ソープランド等の風俗街で法外な請求トラブル多発。入店前に料金の全額確認必須。",en:"Overcharging incidents frequent in Pattaya/Bangkok nightlife. Confirm ALL charges before entering any venue."}},
      {icon:"👮",level:"med",title:{ja:"偽警察による所持品検査",en:"Fake police shakedown"},desc:{ja:"観光客に近づき麻薬捜査と称して所持品検査・財布チェックを求める偽警察に注意。本物の警察を要求し警察署に移動を主張。",en:"Fake police approach tourists claiming drug search. Demand real police station. Never hand over your wallet."}},
      {icon:"🌊",level:"med",title:{ja:"水上アクティビティの割増・保険未加入",en:"Water activity overcharging & no insurance"},desc:{ja:"シュノーケリング・ダイビングツアーで宣伝価格より高い請求や、無保険業者のリスクあり。事前に業者の許認可を確認。",en:"Water tours may charge more than advertised and some operators lack insurance. Verify operator licenses."}},
      {icon:"💊",level:"low",title:{ja:"ヤードム（ピンクの棒）詐欺",en:"Ya dom (pink inhaler) scam"},desc:{ja:"観光地で強引に嗅がされ、高額請求される事例あり。受け取り拒否が安全。",en:"Inhalers thrust at tourists followed by high charges. It's safest to refuse all unsolicited items."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"タイはチップ文化あり。マッサージ20〜100THB、レストランは釣り銭を置く程度。強要された場合は断ってOK。",en:"Thailand has tipping culture. Massage 20-100THB, restaurants leave small change. OK to refuse if pressured."}},
    ],
    バンコク: [
      {icon:"✈️",level:"high",title:{ja:"スワンナプーム空港タクシー詐欺",en:"Suvarnabhumi airport taxi fraud"},desc:{ja:"地下の公式タクシー乗り場（Public Taxi）のみ利用。私服で声をかけてくる運転手は全て避ける。正規料金=メーター料金+高速道路代(25-75THB)のみ。",en:"Use only the official Public Taxi queue in the basement. Avoid ALL drivers who approach you. Official fare = meter + expressway (25-75THB) only."}},
      {icon:"🏛️",level:"high",title:{ja:"ワット・プラケオ周辺の詐欺師",en:"Grand Palace/Wat Phra Kaew scammers"},desc:{ja:"王宮・ワット・プラケオ周辺に「今日は閉館」と嘘をつく詐欺師が常駐。王宮は年中無休8:30-15:30開館。外国人料金500THB。詐欺師の誘導は全て断る。",en:"Scammers near Grand Palace claim it's 'closed today'. Open year-round 8:30-15:30. Entry 500THB. Refuse all guidance."}},
      {icon:"🛺",level:"high",title:{ja:"カオサン・ワット・ポー周辺トゥクトゥク",en:"Tuk-tuks near Khao San/Wat Pho"},desc:{ja:"「格安ツアー」と称して宝石店・仕立て屋へ連行するトゥクトゥクがカオサン周辺に多数。目的地を明確に伝え、寄り道を拒否。",en:"'Cheap tour' tuk-tuks near Khao San take you to gem/tailor shops. State destination clearly and refuse detours."}},
      {icon:"🎭",level:"med",title:{ja:"カオサンロードのぼったくりバー",en:"Khao San Road ripoff bars"},desc:{ja:"カオサンロードのバーでチャージ料・ドリンク料を後から加算する手口あり。注文前に全料金を確認。",en:"Khao San Road bars add cover charges and drink fees after the fact. Confirm ALL prices before ordering."}},
      {icon:"🧶",level:"med",title:{ja:"チャトゥチャック市場の偽ブランド",en:"Chatuchak Market fake brands"},desc:{ja:"チャトゥチャック市場(JJマーケット)での偽ブランド品購入は帰国時没収リスクあり。購入は自己責任で。",en:"Fake brand goods at Chatuchak (JJ Market) may be confiscated at customs on return. Purchase at own risk."}},
      {icon:"🚤",level:"med",title:{ja:"チャオプラヤー川の渡し船詐欺",en:"Chao Phraya express boat scam"},desc:{ja:"民間ボートが公式エクスプレスボートより高い料金を請求する事例あり。オレンジ旗の公式ボートを利用。",en:"Private boats charge more than official express boats. Use official orange-flag Chao Phraya Express only."}},
      {icon:"💆",level:"low",title:{ja:"ニセマッサージ店・性的サービス",en:"Fake massage shops"},desc:{ja:"スクンビット周辺の一部マッサージ店で過剰な性的サービスへの誘導あり。正規の看板・価格表がある店舗を選ぶ。",en:"Some massage shops near Sukhumvit push sexual services. Choose shops with official signage and price boards."}},
      {icon:"🌃",level:"low",title:{ja:"ルーフトップバーの入場料・服装",en:"Rooftop bar entry/dress code"},desc:{ja:"バンコクのルーフトップバーは入場料・ドレスコードあり。スニーカー・短パンでは入れない場所も。事前確認を。",en:"Bangkok rooftop bars have entry fees and dress codes. Sneakers/shorts may not be allowed. Check beforehand."}},
      {icon:"🐘",level:"low",title:{ja:"象乗り体験の倫理・料金",en:"Elephant ride ethics & pricing"},desc:{ja:"バンコク近郊の象乗りは動物虐待を伴う場合あり。エシカルなサンクチュアリ（タイエレファントホームなど）を選ぶことを推奨。",en:"Elephant rides near Bangkok may involve animal abuse. Choose ethical sanctuaries (e.g., Thai Elephant Home)."}},
      {icon:"💳",level:"low",title:{ja:"BTSスカイトレイン・ラビットカードの活用",en:"BTS Skytrain Rabbit Card tips"},desc:{ja:"バンコクのBTS・MRTはラビットカードで割引あり。単区間より1日パスや定期の方が観光には割安。",en:"Bangkok BTS/MRT Rabbit Card gives discounts. Day passes or stored value cards are better value for tourists."}},
    ],
    プーケット: [
      {icon:"🏍️",level:"high",title:{ja:"バイクタクシー・トゥクトゥク法外料金",en:"Motorcycle taxi & tuk-tuk extreme overcharging"},desc:{ja:"プーケットのバイクタクシー・トゥクトゥクは世界でも有名なぼったくりスポット。5分の距離で500〜1000THB請求例あり。必ずGrabを使用。乗る前に金額を書いてもらう。",en:"Phuket motorbike taxis/tuk-tuks are infamous for overcharging. 5-min rides billed 500-1000THB. Always use Grab or get price in writing."}},
      {icon:"🌊",level:"high",title:{ja:"ビーチチェア・パラソル強制使用料",en:"Forced beach chair/umbrella charges"},desc:{ja:"パトンビーチ等でビーチチェアに座るだけで強制的に料金(200〜500THB)を請求される。無料エリアとの区別が分かりにくい。",en:"At Patong Beach etc., simply sitting on beach chairs incurs forced charges (200-500THB). Free/paid zones are hard to distinguish."}},
      {icon:"🚤",level:"high",title:{ja:"ボートツアーの追加料金・無保険",en:"Boat tour extra charges & no insurance"},desc:{ja:"「全込み」と言われたボートツアーで昼食・シュノーケル器材・国立公園入場料等を別途請求するケース多発。保険確認必須。",en:"'All-inclusive' boat tours frequently charge extra for lunch, snorkel gear, national park fees. Always verify insurance."}},
      {icon:"💎",level:"high",title:{ja:"宝石・土産物の偽物・過剰請求",en:"Fake gems & souvenir overcharging"},desc:{ja:"パトン・ピンクロード周辺の宝石店は観光客向け偽造品・高額品を押し売りする事例多数。購入には十分な注意を。",en:"Gem shops in Patong/Pink Road area push fake/overpriced items on tourists. Exercise extreme caution when purchasing."}},
      {icon:"🏖️",level:"med",title:{ja:"ビーチマッサージの価格",en:"Beach massage pricing"},desc:{ja:"ビーチでのマッサージは200〜500THB/時間が適正。座った瞬間にサービス開始されて後から高額請求される手口に注意。",en:"Beach massages should be 200-500THB/hour. Watch for services starting before you agree, then billing high."}},
      {icon:"🍹",level:"med",title:{ja:"バングラロードのバー請求",en:"Bangla Road bar overcharging"},desc:{ja:"パトンのバングラロードのバーは注文前に価格確認必須。チャージ料・サービス料が加算されることが多い。",en:"Always confirm prices before ordering at Bangla Road bars in Patong. Cover and service charges are common."}},
      {icon:"🛵",level:"med",title:{ja:"レンタルバイクの偽損傷請求",en:"Rental bike false damage claims"},desc:{ja:"レンタルバイクで返却時に「最初からあった傷」を新しい損傷と主張して修理費を請求される事例多数。借りる前に全損傷を写真撮影。",en:"Rental bike shops claim pre-existing damage as new upon return. Photograph ALL damage before renting."}},
      {icon:"⛽",level:"low",title:{ja:"タクシー・ドライバーのGPS操作",en:"Taxi GPS manipulation"},desc:{ja:"Grabでの予約でも運転手がGPSをオフにして遠回りするケースあり。Grabアプリ内のルートをリアルタイムで監視。",en:"Even Grab drivers sometimes disable GPS for detours. Monitor the route in real-time on the Grab app."}},
      {icon:"🏝️",level:"low",title:{ja:"ピピ島・カタビーチへのボート料金",en:"Boat fares to Phi Phi/Kata Beach"},desc:{ja:"フェリー・スピードボートは公認業者を利用。料金は片道300〜900THB。非公認業者は保険・安全基準が不明確。",en:"Use certified operators for ferries/speedboats. Fares 300-900THB one-way. Uncertified operators lack safety standards."}},
      {icon:"🌅",level:"low",title:{ja:"カオサンビーチ周辺の露店価格",en:"Street vendor prices near Karon Beach"},desc:{ja:"カロンビーチ・カタビーチ周辺の露店は定価なし。必ず交渉。買う前に近くの複数店舗で価格比較を。",en:"Street vendors near Karon/Kata Beach have no fixed prices. Always negotiate. Compare multiple vendors first."}},
    ],
  },

  インド: {
    _default: [
      {icon:"🚕",level:"high",title:{ja:"タクシー・リクシャー大幅割増（全国）",en:"Taxi/rickshaw extreme overcharging (nationwide)"},desc:{ja:"⚠️ インドで最も頻発するトラブル。正規メーター料金の3〜10倍を請求するケースが常態化。必ずOlaまたはUberアプリを使用。スクリーンショットで料金を記録してから乗車。",en:"⚠️ Most common issue in India. 3-10x overcharging is routine. Always use Ola or Uber app. Screenshot the fare before boarding."}},
      {icon:"🏛️",level:"high",title:{ja:"偽政府観光局（全国）",en:"Fake government tourism offices (nationwide)"},desc:{ja:"「Indian Government Tourist Office」「Ministry of Tourism」と書かれた偽観光案内所が全国主要観光地に存在。高額ツアー・宿泊を売りつける。本物はincredibleindia.orgで確認。",en:"Fake 'Indian Government Tourist Office/Ministry of Tourism' offices exist near major sites nationwide. Verify at incredibleindia.org."}},
      {icon:"💎",level:"high",title:{ja:"宝石・カーペット・シルク詐欺（全国）",en:"Gem/carpet/silk scam (nationwide)"},desc:{ja:"「友人の店を紹介」「政府公認店」は高確率で詐欺。購入後の返金は不可能。正価の10〜50倍で売りつける。定評あるショップ以外での購入は避ける。",en:"'Friend's shop' or 'government certified' are almost always scams. Refunds impossible. Prices 10-50x fair value. Avoid unless well-reviewed."}},
      {icon:"🍵",level:"high",title:{ja:"チャイショップ・土産物詐欺（全国）",en:"Chai shop/souvenir scam (nationwide)"},desc:{ja:"「お茶を飲んでいきませんか」と誘い、工芸品・宝石を高額で売りつける。アグラ・ジャイプール・バラナシで特に多発。丁寧に断る。",en:"Tea invitation leads to high-pressure craft/gem selling. Especially common in Agra, Jaipur, Varanasi. Politely but firmly refuse."}},
      {icon:"👮",level:"high",title:{ja:"偽警察・偽両替商（全国）",en:"Fake police/money changers (nationwide)"},desc:{ja:"「麻薬捜査」「不正両替の確認」と称して財布・パスポートを要求する偽警察。本物の警察署に行くことを主張。公認両替所以外での両替は禁止。",en:"Fake police claim 'drug search' to access your wallet/passport. Insist on going to a real police station. Exchange only at authorized outlets."}},
      {icon:"🙏",level:"med",title:{ja:"物乞い組織・子供詐欺（全国）",en:"Organized begging/child scam (nationwide)"},desc:{ja:"観光地周辺の物乞いは組織的な場合が多い。子供を使った詐欺も存在。現金を渡すことが組織の資金源になる可能性。NGO等への寄付を推奨。",en:"Begging near tourist sites is often organized. Child scams exist. Cash donations may fund criminal organizations. Donate to NGOs instead."}},
      {icon:"🚂",level:"med",title:{ja:"鉄道チケット詐欺（全国）",en:"Train ticket scam (nationwide)"},desc:{ja:"「満席」「キャンセル」と嘘をついて別の旅行代理店に誘導。インド鉄道の公式予約サイト(irctc.co.in)のみ使用。駅窓口でもTourist Quota専用窓口を利用。",en:"Lies of 'full/cancelled' trains redirect to other agents. Use only official IRCTC (irctc.co.in). At stations, use Tourist Quota window only."}},
      {icon:"💊",level:"med",title:{ja:"食品・飲料への薬物混入",en:"Food/drink spiking"},desc:{ja:"長距離列車・バスで見知らぬ人から食べ物・飲み物を受け取らない。薬物を盛られて貴重品を盗まれる手口が報告されている。",en:"Never accept food/drinks from strangers on long-distance trains/buses. Reports of drugging and robbing tourists exist."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化（全国）",en:"Tipping culture (nationwide)"},desc:{ja:"インドはチップ文化あり。レストランはサービス料10%が相場。ホテルのベルボーイ50〜100INR、ガイドには200〜500INR。強要された場合は断ってOK。",en:"India has tipping culture. Restaurant: 10% service charge. Bellboy: 50-100INR. Guide: 200-500INR. OK to refuse if pressured."}},
      {icon:"💉",level:"low",title:{ja:"衛生・食中毒・旅行保険",en:"Hygiene, food poisoning & travel insurance"},desc:{ja:"路上の食べ物・生水は食中毒リスクあり。ミネラルウォーターは封を自分で開ける。旅行保険（医療補償あり）への加入を強く推奨。",en:"Street food/tap water carry food poisoning risks. Open mineral water bottles yourself. Travel insurance with medical coverage strongly recommended."}},
    ],
    デリー: [
      {icon:"🚂",level:"high",title:{ja:"ニューデリー駅周辺の詐欺師集中",en:"New Delhi Station scammer concentration"},desc:{ja:"ニューデリー駅の出入口・周辺に「列車キャンセル」「プラットフォーム変更」「政府ツーリストオフィスに案内する」詐欺師が常駐。鉄道予約はirctc.co.inのみ。現地で声をかけてくる人は全て断る。",en:"Scammers outside New Delhi Station constantly claim 'train cancelled' or 'platform changed' to divert you. Book trains only via irctc.co.in. Refuse all approaches."}},
      {icon:"🛺",level:"high",title:{ja:"コンノートプレイス周辺のオートリクシャー",en:"Auto-rickshaws near Connaught Place"},desc:{ja:"コンノートプレイス周辺のオートリクシャーは外国人に対して正規料金の5〜10倍を請求することで悪名高い。Olaオートで事前料金確認してから乗車。絶対にメーターなし車両には乗らない。",en:"Auto-rickshaws near Connaught Place are notorious for charging foreigners 5-10x normal fares. Use Ola Auto with pre-confirmed fares. Never board without a meter."}},
      {icon:"🏛️",level:"high",title:{ja:"インドゲート・クトゥブ・ミナール周辺詐欺師",en:"Scammers near India Gate/Qutub Minar"},desc:{ja:"インドゲート・クトゥブ・ミナール周辺で「公式ガイド」を名乗る詐欺師多数。ガイドは政府認定バッジ確認。インドゲートは無料、クトゥブは外国人600INR。",en:"Fake 'official guides' swarm India Gate and Qutub Minar. Check for government-certified badge. India Gate is free; Qutub Minar is ₹600 for foreigners."}},
      {icon:"🛍️",level:"med",title:{ja:"カロルバーグ・パハールガンジのぼったくり",en:"Karol Bagh/Paharganj overcharging"},desc:{ja:"パハールガンジ（バックパッカー街）は物価交渉が前提。定価の2〜3倍からスタートが一般的。宝石・シルクは購入しないことを推奨。",en:"Paharganj (backpacker area) requires bargaining. Vendors start at 2-3x fair price. Avoid purchasing gems or silk here."}},
      {icon:"🚌",level:"med",title:{ja:"デリーメトロの安全活用",en:"Delhi Metro safety tips"},desc:{ja:"デリーメトロは安全で安価。空港線はExpressline(150INR)で空港まで直結。女性専用車両あり。スリに注意。荷物検査あり（銃刀類・液体制限）。",en:"Delhi Metro is safe and cheap. Airport Express Line (₹150) connects to airport. Women's cars available. Watch for pickpockets. Bag X-ray required."}},
      {icon:"💊",level:"med",title:{ja:"食品・水の安全",en:"Food & water safety in Delhi"},desc:{ja:"デリーの水道水は飲用不可。必ずミネラルウォーター（封が開いていないもの）を購入。路上の生ジュース・カット野菜は食中毒リスク高。",en:"Delhi tap water is not drinkable. Always buy sealed mineral water. Street fresh juice and cut vegetables carry high food poisoning risk."}},
      {icon:"🏨",level:"low",title:{ja:"ホテル周辺の客引き・偽予約",en:"Hotel touts & fake bookings"},desc:{ja:"「予約したホテルが閉業した」「ダブルブッキングだ」と言って別のホテルへ誘導する手口あり。Booking.com等の予約確認画面を必ず持参。",en:"Touts claim 'your hotel closed' or 'double booking' to redirect you. Always carry your Booking.com confirmation screen."}},
      {icon:"📸",level:"low",title:{ja:"赤い砦（ラールキラー）の外国人料金",en:"Red Fort foreigner entry fees"},desc:{ja:"ラールキラー(赤い砦)の外国人入場料は600INR（インド人は35INR）。チケットは正規窓口のみで購入。周辺の転売チケットは詐欺。",en:"Red Fort entry for foreigners is ₹600 (Indians ₹35). Buy only from official ticket counters. Resellers outside are scams."}},
      {icon:"🍛",level:"low",title:{ja:"パラーンタ・ワーリーガリーの価格",en:"Paratha Wali Gali pricing"},desc:{ja:"オールドデリーの有名なパラーンタ屋台街は観光客価格に変化。1枚50〜150INRが相場。美味しいが隣の路地の方が安い場合も。",en:"Old Delhi's famous paratha street has shifted to tourist pricing. ₹50-150/paratha. Side alleys may be cheaper."}},
      {icon:"🕌",level:"low",title:{ja:"フマーユーン廟・ロータス寺院",en:"Humayun's Tomb & Lotus Temple"},desc:{ja:"フマーユーン廟の外国人料金600INR。ロータス寺院は無料。周辺の「ガイド」は全員非公認。観光スポットへの移動はOla推奨。",en:"Humayun's Tomb ₹600 for foreigners. Lotus Temple free. All 'guides' around these sites are unofficial. Use Ola to travel to sites."}},
      {icon:"💴",level:"low",title:{ja:"DELHIの両替",en:"Currency exchange in Delhi"},desc:{ja:"デリーの両替はホテル・認定両替所・空港が最安全。闇両替は偽札・詐欺のリスクが高い。レシートを必ずもらう。",en:"Change money only at hotels, authorized exchanges, or airports in Delhi. Black market exchanges risk counterfeit notes. Always get a receipt."}},
    ],
    アグラ: [
      {icon:"🕌",level:"high",title:{ja:"タージマハル周辺の詐欺師",en:"Scammers near Taj Mahal"},desc:{ja:"タージマハル入場ゲート周辺に偽ガイド・偽チケット販売業者が集中。公式チケットはasi.payuindia.comのみで購入。外国人料金1100INR。入場時にパスポート持参必須。",en:"Fake guides and ticket sellers cluster near Taj Mahal gates. Buy only at asi.payuindia.com. Foreign entry: ₹1100. Passport required."}},
      {icon:"🛺",level:"high",title:{ja:"アグラのオートリクシャー・タクシー詐欺",en:"Agra auto-rickshaw/taxi scams"},desc:{ja:"アグラのオートリクシャー・タクシーは外国人に法外な料金を請求することで有名。タージマハル〜アグラ城など主要観光地間は100〜200INRが適正。Olaアプリを強く推奨。",en:"Agra auto-rickshaws/taxis are notorious for overcharging foreigners. Taj Mahal to Agra Fort should be ₹100-200. Strongly recommend Ola app."}},
      {icon:"🍵",level:"high",title:{ja:"チャイショップ誘導詐欺（アグラ集中）",en:"Chai shop scam (highly concentrated in Agra)"},desc:{ja:"「眺めの良いタージマハルビューポイントに案内する」と言ってチャイショップ→宝石店→絨毯店へ連行する手口がアグラで特に多発。全て断ること。",en:"'I'll show you a Taj Mahal view point' leads to chai shop → gem shop → carpet shop. This is extremely common in Agra. Refuse everything."}},
      {icon:"🏯",level:"med",title:{ja:"アグラ城の外国人料金",en:"Agra Fort foreigner entry fee"},desc:{ja:"アグラ城の外国人料金650INR（インド人40INR）。周辺の私設ガイドは非公認が多い。公認ガイドはASI認定バッジを持つ。",en:"Agra Fort foreign entry: ₹650 (Indians ₹40). Most 'guides' around are unofficial. Certified ASI guides carry official badges."}},
      {icon:"🌅",level:"med",title:{ja:"タージマハルのサンライズ・サンセット入場",en:"Taj Mahal sunrise/sunset entry"},desc:{ja:"夜明け入場(5:30〜)は混雑が少なく美しいが、周辺の人力車・オートリクシャーが多数。Olaで直接行くのが最も安全で安価。",en:"Dawn entry (5:30am) is less crowded and beautiful, but rickshaws swarm the area. Take Ola directly for safety and lowest cost."}},
      {icon:"🛍️",level:"med",title:{ja:"大理石細工・象嵌細工の偽物",en:"Fake marble inlay crafts"},desc:{ja:"アグラ名産の大理石象嵌細工(ピエトラ・ドゥーラ)の偽物が多数流通。本物は重量があり冷たい感触。プラスチック・石膏製偽物に注意。",en:"Fake Agra marble inlay (pietra dura) crafts are widespread. Real ones are heavy and cold to touch. Beware plastic/plaster fakes."}},
      {icon:"🚌",level:"low",title:{ja:"アグラ〜デリー間の移動",en:"Agra to Delhi transportation"},desc:{ja:"アグラ〜デリーはGatimaan Express/Shatabdi Express(所要約2時間)が最も安全・快適。バスは道路状況次第で遅延あり。格安バスは乗り心地劣悪。",en:"Agra to Delhi: Gatimaan/Shatabdi Express (~2hrs) is safest and most comfortable. Buses subject to road delays. Cheap buses are uncomfortable."}},
      {icon:"🍛",level:"low",title:{ja:"アグラの食事",en:"Food in Agra"},desc:{ja:"タージマハル近くの飲食店は観光客価格で高め。サダルバザール周辺の地元食堂が安くて美味しい。ペット入り密閉ボトルの水のみ飲用。",en:"Restaurants near Taj Mahal are tourist-priced. Local eateries near Sadar Bazaar are cheap and good. Drink only sealed bottled water."}},
      {icon:"🌡️",level:"low",title:{ja:"アグラの熱中症・紫外線",en:"Heat stroke/UV in Agra"},desc:{ja:"アグラは夏(4〜6月)に45℃を超えることがある。タージマハル観光は早朝か夕方推奨。帽子・日焼け止め・水分補給必須。",en:"Agra can exceed 45°C in summer (Apr-Jun). Visit Taj Mahal at dawn or dusk. Hat, sunscreen, and hydration are essential."}},
      {icon:"📸",level:"low",title:{ja:"タージマハル内のカメラ規則",en:"Camera rules inside Taj Mahal"},desc:{ja:"タージマハル内部（霊廟）は撮影禁止。三脚・一脚の使用禁止。無人航空機（ドローン）は禁止。違反は罰則あり。",en:"Photography inside the Taj Mahal mausoleum is prohibited. Tripods and monopods banned. Drones strictly prohibited with penalties."}},
    ],
    ゴア: [
      {icon:"🏖️",level:"high",title:{ja:"ゴアのビーチドラッグ",en:"Beach drug scams in Goa"},desc:{ja:"ゴアのビーチ（特に北ゴア）では麻薬密売・使用が問題。見知らぬ人からの誘いは全て断ること。所持した場合の刑罰は極めて重い（懲役10年以上）。",en:"Drug dealing/use is a serious problem on Goa beaches (especially North Goa). Refuse all offers from strangers. Penalties are extremely severe (10+ years imprisonment)."}},
      {icon:"🛵",level:"high",title:{ja:"無許可バイクレンタル",en:"Unlicensed motorbike rentals"},desc:{ja:"ゴアでのバイクレンタルは多くが無許可。事故時の保険・補償なし。外国人免許証でのインド公道走行は違法。レンタル時は必ず許可証・保険証確認。",en:"Most bike rentals in Goa are unlicensed with no accident insurance. Driving on Indian roads with a foreign license is illegal. Always check license and insurance."}},
      {icon:"🌊",level:"med",title:{ja:"ゴアビーチの離岸流",en:"Goa beach rip currents"},desc:{ja:"ゴアのビーチは離岸流が非常に強い。旗の色を確認（赤旗=遊泳禁止、黄旗=注意）。救助員のいるビーチのみ遊泳。毎年多数の溺死事故あり。",en:"Goa beaches have extremely strong rip currents. Check flag colors (red=no swimming, yellow=caution). Only swim at beaches with lifeguards. Many drownings annually."}},
      {icon:"🍺",level:"med",title:{ja:"ビーチシャック（海の家）の料金",en:"Beach shack pricing"},desc:{ja:"ゴアのビーチシャックは交渉可能な場合も。ビールの適正価格は150〜200INR。観光客向けに2〜3倍で提示されることあり。座る前にメニュー価格を確認。",en:"Goa beach shack prices may be negotiable. Appropriate beer price: ₹150-200. Tourist prices can be 2-3x. Check menu prices before sitting."}},
      {icon:"🛍️",level:"med",title:{ja:"フリーマーケット（アンジュナ）の価格",en:"Flea market (Anjuna) prices"},desc:{ja:"アンジュナフリーマーケットは値切り交渉が必須。最初の提示価格の30〜50%が実際の適正価格。笑顔で粘り強く交渉。",en:"Haggling is essential at Anjuna Flea Market. Actual fair price is often 30-50% of the initial asking price. Negotiate with a smile."}},
      {icon:"🌴",level:"low",title:{ja:"タクシー・ゴア内移動",en:"Taxis & transport in Goa"},desc:{ja:"ゴアの一般タクシーはメーターなし固定料金制。空港〜パナジは700〜800INR、パナジ〜カランゲート500〜600INRが相場。Goaタクシー組合の公定料金を確認。",en:"Goa taxis use fixed (non-metered) rates. Airport to Panaji: ₹700-800, Panaji to Calangute: ₹500-600. Check Goa Taxi Union fixed rate chart."}},
      {icon:"💊",level:"low",title:{ja:"ゴアの薬局・医療",en:"Pharmacies & medical care in Goa"},desc:{ja:"ゴアは医療施設が整っている方だが、主要病院はパナジ・マルガオに集中。旅行保険は必須。蚊（マラリア・デング）対策に防虫スプレー必携。",en:"Goa has relatively good medical facilities, concentrated in Panaji/Margao. Travel insurance essential. Carry mosquito repellent (malaria/dengue risk)."}},
      {icon:"🎉",level:"low",title:{ja:"ゴアのナイトライフ・クラブ",en:"Goa nightlife & clubs"},desc:{ja:"ゴアのクラブ（特に北ゴア）は外国人に人気だが、ドリンクへの薬物混入・スリに注意。荷物は最小限で。知らない人の飲み物は絶対に受け取らない。",en:"Goa clubs (especially North Goa) are popular but watch for drink spiking and pickpockets. Bring minimal valuables. Never accept drinks from strangers."}},
      {icon:"🏛️",level:"low",title:{ja:"オールドゴアの教会入場",en:"Old Goa church entry"},desc:{ja:"オールドゴアの教会（ボン・ジェズ聖堂等）は基本無料。周辺の「ガイド」は非公認が多い。教会内での撮影は静粛に。",en:"Old Goa churches (Basilica of Bom Jesus etc.) are mostly free. 'Guides' nearby are mostly unofficial. Photograph quietly inside churches."}},
      {icon:"🌡️",level:"low",title:{ja:"ゴアのモンスーン・危険期間",en:"Goa monsoon danger period"},desc:{ja:"6〜9月はモンスーン期で海は遊泳禁止、多くのビーチシャック・ツアー会社が閉鎖。旅行は11〜3月がベストシーズン。",en:"June-September is monsoon season: swimming prohibited, most beach shacks and tour companies close. Best time to visit: November-March."}},
    ],
  },

  アメリカ: {
    _default: [
      {icon:"💳",level:"high",title:{ja:"ATMスキミング・カード詐欺（全国）",en:"ATM skimming/card fraud (nationwide)"},desc:{ja:"街頭ATMへのスキミング装置取り付けが頻発。銀行内ATMを優先。カード情報盗難時は24時間以内にカード会社へ連絡。",en:"Skimming devices frequently attached to street ATMs. Use ATMs inside bank branches. Report card theft to issuer within 24 hours."}},
      {icon:"🚖",level:"high",title:{ja:"偽Uber/Lyft・白タク（全国）",en:"Fake Uber/Lyft and unlicensed cabs (nationwide)"},desc:{ja:"空港外で声をかけてくるドライバーは偽Uber/白タクの可能性大。必ずアプリ内で車両ナンバー・運転手写真を確認してから乗車。",en:"Drivers approaching you outside airports are likely fake Uber/unlicensed. Always verify plate number and driver photo in the app before boarding."}},
      {icon:"🏙️",level:"high",title:{ja:"危険エリアの認識（全国）",en:"Awareness of dangerous areas (nationwide)"},desc:{ja:"全米主要都市に治安の悪いエリアが存在。地図アプリで事前確認。夜間の一人歩きは特に危険。ショルダーバッグは前に持ち、高価なアクセサリーは見せない。",en:"All major US cities have dangerous areas. Check in advance on mapping apps. Solo walking at night is especially dangerous. Keep bags in front; hide valuables."}},
      {icon:"📱",level:"high",title:{ja:"偽WiFiフィッシング（全国）",en:"Fake WiFi phishing (nationwide)"},desc:{ja:"「Free Airport/Hotel WiFi」と称した偽WiFiでの個人情報・クレジットカード情報窃取被害多発。公共WiFiではVPN必須。金融機関へのアクセスは避ける。",en:"Fake WiFi steals personal and credit card info. Always use VPN on public WiFi. Avoid accessing financial accounts on public networks."}},
      {icon:"🤲",level:"med",title:{ja:"物乞い・ホームレス対応",en:"Handling homeless/begging"},desc:{ja:"主要都市の観光地周辺に物乞いが多い。現金を渡す義務はなく、きっぱり断ってOK。しつこい場合は近くの店や警察官のそばへ移動。",en:"Beggars are common near tourist areas in major cities. You're not obligated to give money. Move near a store or police officer if harassed."}},
      {icon:"💊",level:"med",title:{ja:"飲み物への薬物混入（バー）",en:"Drink spiking at bars"},desc:{ja:"バーで見知らぬ人から受け取った飲み物に薬物を盛られて財産を奪われる手口あり。飲み物から目を離さない。知らない人のドリンクは必ず断る。",en:"Drinks spiked by strangers at bars lead to robbery. Never leave your drink unattended. Always refuse drinks from people you don't know."}},
      {icon:"🎭",level:"med",title:{ja:"観光スポット周辺の詐欺師",en:"Tourist spot scammers"},desc:{ja:"タイムズスクエア・ハリウッド・ラスベガスなど有名観光地でのCDの押し付け・写真撮影後の高額請求に注意。受け取り拒否・撮影拒否は権利。",en:"Near famous spots, watch for CD pushing and post-photo high charges. You have the right to refuse accepting items or being photographed."}},
      {icon:"🏥",level:"med",title:{ja:"医療費と旅行保険",en:"Medical costs and travel insurance"},desc:{ja:"アメリカの医療費は世界最高水準。軽い骨折でも数百万円。旅行保険（医療補償付き）への加入は必須。緊急時は911。",en:"US medical costs are the world's highest. A minor fracture can cost millions of yen. Travel insurance with medical coverage is essential. Emergency: 911."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化（全国）",en:"Tipping culture (nationwide)"},desc:{ja:"アメリカはチップ文化が強い。レストランは食事代の18〜22%、タクシーは15〜20%、ホテルのベルボーイは荷物1つにつき$1〜2が相場。",en:"Tipping culture is strong in the US. Restaurant: 18-22% of bill. Taxi: 15-20%. Hotel bellhop: $1-2 per bag."}},
      {icon:"🔫",level:"low",title:{ja:"銃社会への認識",en:"Awareness of gun culture"},desc:{ja:"アメリカは銃所持が合法的な州が多い。デモ・集会エリアは避ける。「Gun Free Zone」の表示がある場所は比較的安全。異変を感じたら速やかにその場を離れる。",en:"Many US states allow legal gun ownership. Avoid demonstrations and gatherings. 'Gun Free Zone' signs indicate relatively safer areas. Leave immediately if something feels wrong."}},
    ],
    ニューヨーク: [
      {icon:"🎭",level:"high",title:{ja:"タイムズスクエアのCDハンドアウト詐欺",en:"Times Square CD handout scam"},desc:{ja:"タイムズスクエアでCDを「無料プレゼント」と渡してきた後に高額な「サイン代」「寄付金」を要求。受け取らなければ問題なし。受け取ったら捨ててOK。",en:"CDs handed out as 'free gifts' in Times Square are followed by demands for high 'signing fees' or 'donations'. Simply don't take them. Throw away if taken."}},
      {icon:"🃏",level:"high",title:{ja:"シェルゲーム・カード詐欺",en:"Shell game/card scam"},desc:{ja:"タイムズスクエア・ブルックリンブリッジ周辺でのシェルゲームは100%イカサマ。周囲の参加者は全員グループの仲間。絶対に参加しない・見物もしない。",en:"Shell games near Times Square/Brooklyn Bridge are 100% rigged. All 'players' around you are accomplices. Never participate or even watch."}},
      {icon:"🗽",level:"high",title:{ja:"偽自由の女神チケット",en:"Fake Statue of Liberty tickets"},desc:{ja:"統一バッテリーパーク周辺で偽の自由の女神ツアーチケットを販売する業者あり。公式はStatueCruises(statuecruises.com)のみ。王冠入場は数ヶ月前から要予約。",en:"Fake Statue of Liberty tour tickets sold near Battery Park. Official operator is Statue Cruises only (statuecruises.com). Crown access requires booking months ahead."}},
      {icon:"🚇",level:"med",title:{ja:"地下鉄でのスリ・強盗",en:"Subway pickpocketing and robbery"},desc:{ja:"NYの地下鉄、特にA/C/E線・L線のブルックリン延伸区間は夜間危険。ドア付近に立たない。スマートフォン・財布を見えないところに。オレンジ色のマスコット「MTA警察」がいる駅は比較的安全。",en:"NYC subway, especially A/C/E lines and L train Brooklyn extension are dangerous at night. Don't stand by doors. Keep phone/wallet hidden. Stations with MTA Police are safer."}},
      {icon:"🏨",level:"med",title:{ja:"ミッドタウンホテルの追加料金",en:"Midtown hotel hidden fees"},desc:{ja:"NYのホテルはリゾートフィー・アメニティフィーが予約価格に含まれていない場合が多い。チェックイン時に総額を確認。Booking.comの表示価格と実際の請求額が異なることあり。",en:"NYC hotels often add resort/amenity fees not shown in booking price. Confirm total at check-in. Booking.com displayed price may differ from actual charge."}},
      {icon:"🎸",level:"med",title:{ja:"ブルックリン・ハーレムの夜間",en:"Night safety in Brooklyn/Harlem"},desc:{ja:"ブルックリン（一部地区）・ハーレムの夜間は徒歩移動に注意。観光スポット（DUMBO・ウィリアムズバーグ等）周辺は比較的安全だが、深夜は控えめに。",en:"Exercise caution walking at night in parts of Brooklyn and Harlem. Tourist areas (DUMBO, Williamsburg etc.) are relatively safe but limit late-night solo walks."}},
      {icon:"🍕",level:"low",title:{ja:"NYピザの価格",en:"NYC pizza prices"},desc:{ja:"本来のNYスタイルピザは1スライス$3〜4。観光地のタイムズスクエア近くのピザ屋は$5〜8/スライスも。チェルシー・グリニッジビレッジで地元価格を楽しめる。",en:"Authentic NY-style pizza is $3-4/slice. Near Times Square, expect $5-8/slice. Find local prices in Chelsea or Greenwich Village."}},
      {icon:"🚕",level:"low",title:{ja:"イエローキャブのチップ",en:"Yellow cab tipping"},desc:{ja:"ニューヨークのイエローキャブはクレジットカード支払い時に自動でチップオプションが表示。15〜20%が相場。「Custom」選択で任意の金額も可能。",en:"NYC Yellow Cabs display tip options on the screen when paying by card. 15-20% is standard. Choose 'Custom' for any amount."}},
      {icon:"🛍️",level:"low",title:{ja:"アウトレット・セールの確認",en:"Outlet/sale verification"},desc:{ja:"「50%OFF」「SALE」の表示でも元値が高い場合が多い。Woodbury Common等のアウトレットは本物のブランド品だが日本との価格差は縮小傾向。",en:"'50% OFF' signs often mean original price was inflated. Woodbury Common outlets are genuine brands but price gaps with Japan are narrowing."}},
      {icon:"🌉",level:"low",title:{ja:"ブルックリンブリッジの歩道規則",en:"Brooklyn Bridge walkway rules"},desc:{ja:"ブルックリンブリッジの歩道は自転車レーンと歩行者レーンに分かれている。自転車レーンに入ると危険。標識をよく見て通行。",en:"Brooklyn Bridge walkway is divided between bicycle and pedestrian lanes. Entering the bike lane is dangerous. Watch the signs carefully."}},
    ],
    ラスベガス: [
      {icon:"🎰",level:"high",title:{ja:"カジノの罠と確率",en:"Casino traps and odds"},desc:{ja:"ラスベガスのカジノは全てハウスが有利な確率設計。スロットのRTP(還元率)は85〜95%。長時間プレイするほど損失が増える。予算を決めて必ず守る。",en:"Las Vegas casinos are always designed with house advantage. Slot RTP is 85-95%. Losses increase with play time. Set a budget and strictly stick to it."}},
      {icon:"🍸",level:"high",title:{ja:"フリードリンクの罠",en:"Free drink trap"},desc:{ja:"ラスベガスのカジノではギャンブル中の飲み物は無料。酔わせてさらにギャンブルさせる戦略。飲みすぎに注意し、判断力が落ちたらギャンブルを止める。",en:"Free drinks while gambling in Vegas casinos are a trap to keep you playing. Alcohol impairs judgment and increases losses. Stop gambling if you feel drunk."}},
      {icon:"💰",level:"high",title:{ja:"ストリップ周辺の詐欺師・ぼったくり",en:"Strip area scammers and overcharging"},desc:{ja:"ラスベガス・ブルバード(ストリップ)でのCD配布・写真撮影後高額請求・偽チケット販売に注意。特に夜間は複数人での行動を推奨。",en:"CD handouts, post-photo overcharging, and fake ticket sales are common on the Las Vegas Strip. Group travel especially recommended at night."}},
      {icon:"🎭",level:"med",title:{ja:"ショーチケットの偽物・高額二次販売",en:"Fake/overpriced show tickets"},desc:{ja:"人気ショー（サーカス・コメディ等）の偽チケットや高額転売チケットに注意。公式サイト・ホテルボックスオフィスでのみ購入。",en:"Beware fake or heavily marked-up tickets for popular shows. Buy only from official websites or hotel box offices."}},
      {icon:"🚖",level:"med",title:{ja:"空港〜ホテル間の移動",en:"Airport to hotel transportation"},desc:{ja:"マッケラン空港からストリップまでのタクシーは$20〜30。Uber/Lyftは$15〜20。シャトルバス($8〜12)が最安。リムジン勧誘には料金を事前確認。",en:"Taxis from McCarran Airport to the Strip: $20-30. Uber/Lyft: $15-20. Shuttle bus ($8-12) is cheapest. Confirm limo prices before boarding."}},
      {icon:"🎲",level:"med",title:{ja:"カジノのルール・禁止事項",en:"Casino rules and prohibitions"},desc:{ja:"カジノ内での写真撮影はエリアによっては禁止。21歳未満のギャンブルは違法（ID確認される）。飲酒もID確認あり。セキュリティに従う。",en:"Photography banned in some casino areas. Gambling under 21 is illegal (ID checked). Alcohol also ID-checked. Follow all security instructions."}},
      {icon:"💆",level:"low",title:{ja:"スパ・マッサージの料金",en:"Spa/massage pricing"},desc:{ja:"ホテルのスパは$100〜300/時間と高額。チップは料金の20%が相場。事前予約とチップ込みの総額を確認してから予約。",en:"Hotel spas charge $100-300/hour. Tipping is standard at 20% of the rate. Confirm the total including tip before booking."}},
      {icon:"🌡️",level:"low",title:{ja:"砂漠の熱中症・紫外線",en:"Desert heat stroke and UV"},desc:{ja:"ラスベガスは夏季に45℃超も珍しくない。屋外観光（グランドキャニオン等）は水分2L以上持参。日中の屋外活動は最小限に。",en:"Las Vegas often exceeds 45°C in summer. Bring 2L+ of water for outdoor tours (Grand Canyon etc.). Minimize outdoor activity during midday."}},
      {icon:"🍽️",level:"low",title:{ja:"ビュッフェの値段",en:"Buffet prices"},desc:{ja:"かつて安価だったラスベガスのビュッフェは現在$30〜60/人に高騰。料金に飲み物・税・チップが別途加算されることも。総額を事前確認。",en:"Once cheap, Las Vegas buffets now cost $30-60/person. Drinks, tax, and tips are often extra. Confirm total cost beforehand."}},
      {icon:"📸",level:"low",title:{ja:"コスチューム写真撮影のチップ",en:"Costumed character photo tips"},desc:{ja:"ストリップ沿いのコスチューム（スパイダーマン等）との撮影は任意のチップが必要。$5〜10が相場。撮影後に激しく請求する場合は断ってOK。",en:"Photos with costumed characters (Spider-Man etc.) on the Strip require tips. $5-10 is standard. OK to firmly refuse if aggressively charged more."}},
    ],
  },


  韓国: {
    _default: [
      {icon:"🎭",level:"high",title:{ja:"明洞・弘大のぼったくり",en:"Myeongdong/Hongdae overcharging"},desc:{ja:"明洞・弘大の屋台・化粧品店での過剰請求多発。試供品を渡された後に高額請求される手口あり。価格表示がない場合は必ず確認。",en:"Overcharging at Myeongdong/Hongdae stalls and cosmetic shops. Free samples may be followed by high-pressure sales. Always check prices."}},
      {icon:"🚕",level:"high",title:{ja:"タクシー不正メーター",en:"Taxi meter fraud"},desc:{ja:"ソウルのタクシーは比較的安全だが深夜は割増あり。カカオT（Kakao T）アプリ使用が最安全。",en:"Seoul taxis are relatively safe but late-night surcharges apply. Kakao T app is safest."}},
      {icon:"💄",level:"med",title:{ja:"化粧品の過剰勧誘",en:"Cosmetics aggressive sales"},desc:{ja:"明洞の化粧品店でしつこい勧誘・試供品攻勢に注意。同じ商品でもオリーブヤング（Olive Young）の方が安い場合が多い。",en:"Aggressive sampling at Myeongdong cosmetics shops. Same products often cheaper at Olive Young stores."}},
      {icon:"🍺",level:"med",title:{ja:"ホンデ・イテウォンのバー",en:"Hongdae/Itaewon bar overcharging"},desc:{ja:"弘大・梨泰院のバーでチャージ料・テーブルフィーが高額になるケースあり。入店前に全料金を確認。",en:"Hongdae/Itaewon bars may charge high table/cover fees. Confirm all charges before entering."}},
      {icon:"🌊",level:"low",title:{ja:"済州島レンタカー詐欺",en:"Jeju rental car damage scams"},desc:{ja:"済州島のレンタカー会社で偽の傷をつけて修理費を請求するケースあり。借りる前に全傷を動画撮影すること。",en:"Some Jeju Island car rentals claim pre-existing damage is new. Video-record ALL damage before renting."}},
      {icon:"📱",level:"low",title:{ja:"交通カードの活用",en:"Use T-money transit card"},desc:{ja:"ソウルのT-moneyカードは地下鉄・バス・タクシーで使え割引あり。空港で購入可能。現金払いより1回あたり100〜150ウォン安い。",en:"Seoul T-money card works on subway/buses/taxis with discounts. Available at airport. 100-150 won cheaper per ride than cash."}},
      {icon:"🛍️",level:"low",title:{ja:"東大門・南大門市場の交渉",en:"Dongdaemun/Namdaemun bargaining"},desc:{ja:"東大門・南大門市場は交渉文化あり。提示価格の70〜80%が目安。カードより現金の方が値引きしやすい。",en:"Bargaining culture at Dongdaemun/Namdaemun markets. Aim for 70-80% of asking price. Cash usually gets better deals."}},
      {icon:"🏨",level:"low",title:{ja:"ゲストハウスの設備確認",en:"Check guesthouse facilities"},desc:{ja:"低価格ゲストハウスは写真と実態が異なる場合あり。Booking.comの最新口コミを確認。ドミトリーでの貴重品管理に注意。",en:"Budget guesthouses may differ from photos. Check recent Booking.com reviews. Secure valuables in dormitories."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"韓国は基本チップ不要。高級レストランではサービス料10%が請求されることあり。",en:"South Korea generally has no tipping culture. Some upscale restaurants add 10% service charge."}},
      {icon:"🎮",level:"low",title:{ja:"クレーンゲーム詐欺",en:"Crane game fraud"},desc:{ja:"一部のクレーンゲーム店は設定が極めて難しい仕様。景品取得後に別料金を要求するケースも。",en:"Some crane game arcades are set to near-impossible. Extra fees may be demanded after winning."}},
    ],
    ソウル: [
      {icon:"🎭",level:"high",title:{ja:"明洞の試供品過剰請求",en:"Myeongdong sample overcharging"},desc:{ja:"明洞では試供品を大量に渡された後に高額請求する手口が急増中。渡された商品は値段を先に確認。",en:"In Myeongdong, vendors hand out free samples then demand high payment. Always confirm prices first."}},
      {icon:"🚇",level:"med",title:{ja:"地下鉄でのスリ",en:"Pickpockets on subway"},desc:{ja:"混雑した2・4号線でのスリに注意。リュックは前に持ち、スマートフォンは見えないところへ。",en:"Watch for pickpockets on crowded Lines 2 & 4. Wear backpacks on front; hide smartphones."}},
      {icon:"🍺",level:"med",title:{ja:"梨泰院のバー",en:"Itaewon bars"},desc:{ja:"梨泰院のバー・クラブでテーブルチャージが高額になるケースあり。外国人と分かると価格が上がることも。全料金を事前確認。",en:"Itaewon bars/clubs may charge high table fees, sometimes more for obvious foreigners. Confirm all prices."}},
      {icon:"📸",level:"low",title:{ja:"景福宮周辺の韓服レンタル",en:"Gyeongbokgung hanbok rental"},desc:{ja:"景福宮周辺の韓服レンタルは正規料金15,000〜20,000ウォン/時間が目安。複数業者を比較。写真撮影の追加料金に注意。",en:"Hanbok rentals near Gyeongbokgung: 15,000-20,000 won/hour. Compare multiple vendors. Watch for extra photo fees."}},
      {icon:"🍜",level:"low",title:{ja:"観光客向け価格の確認",en:"Tourist-priced restaurants"},desc:{ja:"明洞・仁寺洞付近は観光客向け価格の飲食店が多い。ネイバーマップ（Naver Map）での口コミ確認を推奨。",en:"Many restaurants near Myeongdong/Insadong are tourist-priced. Check reviews on Naver Map."}},
    ],
    釜山: [
      {icon:"🐟",level:"med",title:{ja:"チャガルチ市場の量り売り価格",en:"Jagalchi Market weight-based pricing"},desc:{ja:"チャガルチ市場の海鮮は量り売りが多い。食べる前に総額を必ず確認。2階の食堂へ持ち込む際の調理代も事前確認。",en:"Jagalchi Market seafood is often priced by weight. Always confirm total before eating. Check cooking fees before taking to 2nd floor restaurants."}},
      {icon:"🚕",level:"low",title:{ja:"釜山のタクシー",en:"Busan taxis"},desc:{ja:"釜山のタクシーは比較的良心的。KakaoT使用が安心。深夜は割増（20〜40%）あり。",en:"Busan taxis are relatively honest. KakaoT app is safest. Late-night surcharge (20-40%) applies."}},
      {icon:"🏖️",level:"low",title:{ja:"海雲台ビーチの混雑対策",en:"Haeundae Beach crowd safety"},desc:{ja:"夏季の海雲台ビーチは極めて混雑。貴重品管理に注意。遊泳エリアを必ず確認して入水。",en:"Haeundae Beach is extremely crowded in summer. Watch valuables. Always confirm designated swimming areas."}},
      {icon:"⛵",level:"low",title:{ja:"釜山〜済州フェリー",en:"Busan-Jeju ferry booking"},desc:{ja:"釜山〜済州・対馬フェリーは夏季の予約が取りにくい。早めの公式サイトでの予約を推奨。",en:"Busan-Jeju and Busan-Tsushima ferries book out fast in summer. Book early through official sites."}},
      {icon:"🎢",level:"low",title:{ja:"海東龍宮寺の露店",en:"Haedong Yonggungsa street stalls"},desc:{ja:"海東龍宮寺周辺の海産物土産は観光客価格が高め。価格を複数店舗で比較してから購入を。",en:"Seafood souvenirs near Haedong Yonggungsa are tourist-priced. Compare prices at multiple stalls before buying."}},
    ],
    済州島: [
      {icon:"🚗",level:"high",title:{ja:"レンタカー偽損傷請求",en:"Rental car false damage claims"},desc:{ja:"済州島のレンタカーは全損傷を借りる前に動画撮影必須。返却時に「新しい傷」と主張して高額修理費を請求する手口が有名。",en:"Video-record ALL damage on Jeju rental cars before driving. 'New damage' claims on return are notorious on Jeju Island."}},
      {icon:"🌊",level:"med",title:{ja:"済州島の海の安全",en:"Jeju ocean safety"},desc:{ja:"済州島の海は波が強いエリアあり。地元のビーチルールに従い、旗の確認を徹底すること。",en:"Some Jeju beaches have strong waves. Follow local beach rules and always check flag warnings."}},
      {icon:"🍊",level:"low",title:{ja:"かんきつ類の価格",en:"Citrus fruit pricing"},desc:{ja:"済州島名産の柑橘類（漢拏峰みかん等）は路上販売より認定農家・公設市場の方が安くて新鮮。",en:"Jeju's famous citrus fruits are fresher and cheaper at certified farms or public markets than roadside sellers."}},
      {icon:"🎭",level:"low",title:{ja:"済州民俗村の偽ガイド",en:"Jeju Folk Village fake guides"},desc:{ja:"済州民俗村・城山日出峰周辺の非公認ガイドによる過剰請求に注意。公認ガイドは済州観光公社認定バッジを持つ。",en:"Unofficial guides near Jeju Folk Village/Seongsan Ilchulbong may overcharge. Certified guides carry Jeju Tourism Organization badges."}},
      {icon:"🛵",level:"low",title:{ja:"電動キックボードのルール",en:"Electric scooter rules"},desc:{ja:"済州島では電動キックボードのレンタルが普及。ヘルメット着用義務あり（違反は罰金）。飲酒後の使用は厳禁。",en:"Electric scooter rentals are popular in Jeju. Helmets are mandatory (fines for violations). Never ride after drinking."}},
    ],
  },

  ベトナム: {
    _default: [
      {icon:"🛵",level:"high",title:{ja:"シクロ・バイクタクシー過剰請求",en:"Cyclo/xe om overcharging"},desc:{ja:"シクロ・バイクタクシー（xe om）は乗車前に必ず価格交渉・確認。外国人には10〜20倍の料金を請求するケースあり。Grabが最も安全。",en:"Always negotiate cyclo/xe om prices before boarding. Foreigners often charged 10-20x fair price. Grab is safest."}},
      {icon:"💵",level:"high",title:{ja:"偽札・両替詐欺",en:"Counterfeit money/exchange scams"},desc:{ja:"非公認の両替商からの偽ドン紙幣に注意。銀行・公認両替所のみで両替。500,000ドン札と50,000ドン札を間違えやすいので注意。",en:"Beware counterfeit dong from unofficial exchangers. Exchange only at banks. Watch out: 500,000 dong looks like 50,000 dong."}},
      {icon:"🎒",level:"high",title:{ja:"スリ・ひったくり",en:"Pickpocketing/bag snatching"},desc:{ja:"バイクによるひったくりが特にハノイ・ホーチミンで多発。バッグは道路と反対側に持ち、スマートフォンを路上で使用しない。",en:"Motorbike bag snatching is very common in Hanoi/HCM. Keep bags on side away from road. Don't use phones on sidewalks."}},
      {icon:"🍜",level:"med",title:{ja:"観光客向け飲食店の価格",en:"Tourist restaurant pricing"},desc:{ja:"観光地近くの飲食店はメニューに英語価格（高め）と現地価格（安め）がある場合あり。価格表を事前確認。",en:"Some restaurants near tourist sites have higher English menus vs. local ones. Check price board before sitting."}},
      {icon:"🏨",level:"med",title:{ja:"偽ホテル誘導詐欺",en:"Fake hotel booking scams"},desc:{ja:"タクシー運転手が「予約したホテルが閉業した」と別の宿へ誘導する手口あり。Booking.comの確認画面を持参。",en:"Taxi drivers claim 'your hotel closed' to redirect you. Always carry your Booking.com confirmation."}},
      {icon:"🎨",level:"med",title:{ja:"偽アート・偽土産品",en:"Fake art/souvenirs"},desc:{ja:"「手作り」「一点物」と称する大量生産品に注意。真の職人品は政府公認の工芸品店で購入。",en:"Mass-produced items sold as 'handmade' or 'unique'. Purchase genuine crafts at government-certified shops."}},
      {icon:"🚌",level:"low",title:{ja:"バスチケット二重売り",en:"Bus ticket double selling"},desc:{ja:"ハノイ〜ホーチミン間等の長距離バス・ツアーで代理店による二重売りや偽チケット販売の報告あり。公認会社のみで購入。",en:"Double-selling and fake tickets reported on long-distance buses. Purchase only from certified companies."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"ベトナムはチップ文化が広まりつつある。高級レストラン・マッサージでは50,000〜100,000ドンが相場。",en:"Tipping culture is growing in Vietnam. Upscale restaurants/massages: 50,000-100,000 VND is standard."}},
      {icon:"⚠️",level:"low",title:{ja:"交通事故リスク",en:"Traffic accident risk"},desc:{ja:"ベトナムの交通は非常に混雑。道路横断は手を挙げてゆっくり一定速度で歩く。バイクレンタルは経験者以外は避ける。",en:"Vietnamese traffic is chaotic. Cross roads slowly at steady pace with hand raised. Avoid renting motorbikes unless experienced."}},
      {icon:"🌊",level:"low",title:{ja:"ハロン湾ツアーの品質",en:"Ha Long Bay tour quality"},desc:{ja:"ハロン湾のクルーズツアーは品質差が大きい。格安ツアーは設備・安全基準が低い場合あり。認定業者を選ぶ。",en:"Ha Long Bay cruise tours vary widely in quality. Budget tours may lack safety standards. Choose certified operators."}},
    ],
    ホーチミン: [
      {icon:"🛵",level:"high",title:{ja:"ベンタイン市場周辺のひったくり",en:"Ben Thanh market bag snatching"},desc:{ja:"ベンタイン市場周辺はバイクによるひったくりが非常に多い。カメラ・スマートフォンは首から下げない。バッグは体の前側に。",en:"Motorbike bag snatching is very common near Ben Thanh Market. Don't hang cameras/phones around neck. Keep bags in front."}},
      {icon:"🚕",level:"high",title:{ja:"偽Grabと白タク",en:"Fake Grab and unlicensed taxis"},desc:{ja:"ホーチミンの空港・観光地周辺でGrabを装った白タクに注意。アプリで車両ナンバー・運転手顔写真を必ず確認。",en:"Fake Grab drivers operate near airports/tourist spots in HCM. Always verify plate number and driver photo in the app."}},
      {icon:"💵",level:"med",title:{ja:"District 1の観光客価格",en:"District 1 tourist pricing"},desc:{ja:"1区（ドンコイ通り・ブイビェン通り）周辺は観光客向け価格。同じサービスでも2〜3区の方が安い場合が多い。",en:"District 1 (Dong Khoi/Bui Vien area) charges tourist prices. Same services often cheaper in Districts 2-3."}},
      {icon:"🍺",level:"med",title:{ja:"ブイビェン通りのバー",en:"Bui Vien Street bar overcharging"},desc:{ja:"ブイビェン通りのバーではドリンク料金を確認してから注文。後から追加料金を請求するケースあり。",en:"At Bui Vien Street bars, confirm drink prices before ordering. Extra charges may appear on the bill."}},
      {icon:"🎒",level:"low",title:{ja:"戦争証跡博物館周辺",en:"Around War Remnants Museum"},desc:{ja:"戦争証跡博物館周辺の物売り・勧誘が多い。強引な場合は歩き続けるだけでOK。",en:"Many vendors/hawkers around War Remnants Museum. Just keep walking if approached."}},
    ],
    ハノイ: [
      {icon:"🛵",level:"high",title:{ja:"ホアンキエム湖周辺のひったくり",en:"Hoan Kiem Lake area bag snatching"},desc:{ja:"ホアンキエム湖・旧市街でバイクによるひったくりが頻発。特に夜間はバッグを体の前に持ち、スマートフォンの使用を最小限に。",en:"Motorbike bag snatching is frequent near Hoan Kiem Lake and Old Quarter, especially at night. Keep bags in front and minimize phone use."}},
      {icon:"🍜",level:"med",title:{ja:"旧市街の観光客価格",en:"Old Quarter tourist pricing"},desc:{ja:"ハノイ旧市街（36通り）の飲食店・土産物店は観光客価格が高め。Googleマップの口コミが参考になる。",en:"Restaurants and souvenir shops in Hanoi's Old Quarter (36 Streets) charge tourist prices. Google Maps reviews help."}},
      {icon:"🚕",level:"med",title:{ja:"ノイバイ空港タクシー詐欺",en:"Noi Bai airport taxi scams"},desc:{ja:"ハノイのノイバイ空港外での流しタクシーは過剰請求が多い。Grabまたは空港公認タクシーのみ利用。",en:"Street taxis outside Hanoi's Noi Bai Airport frequently overcharge. Use Grab or airport-certified taxis only."}},
      {icon:"🎭",level:"low",title:{ja:"水上人形劇のチケット",en:"Water puppet show tickets"},desc:{ja:"ハノイの水上人形劇は事前オンライン予約が確実。当日券は売り切れる場合あり。周辺の転売チケットに注意。",en:"Book Hanoi water puppet show online in advance. Same-day tickets may be sold out. Avoid resellers nearby."}},
      {icon:"🌧️",level:"low",title:{ja:"ハノイの雨季",en:"Hanoi rainy season"},desc:{ja:"ハノイの雨季は5〜10月。スコールが突然来るため折り畳み傘必携。旧市街の石畳は雨で滑りやすい。",en:"Hanoi rainy season: May-October. Sudden downpours are common; always carry a foldable umbrella. Old Quarter cobblestones are slippery when wet."}},
    ],
  },

  インドネシア: {
    _default: [
      {icon:"🛵",level:"high",title:{ja:"バイクタクシー過剰請求",en:"Ojek motorbike overcharging"},desc:{ja:"非公認のバイクタクシー（ojek）は外国人に法外な料金を請求。Gojek・Grabアプリを使用が最安全。",en:"Unlicensed ojek motorbike taxis overcharge foreigners. Use Gojek or Grab app for safest and cheapest rides."}},
      {icon:"💵",level:"high",title:{ja:"両替詐欺",en:"Money exchange scams"},desc:{ja:"バリ島の一部両替所では計算を誤魔化す手口が有名。銀行・ATM・公認両替所（PT Dirgahayu等）のみ使用。",en:"Some Bali money changers are notorious for shortchanging. Use banks, ATMs, or authorized changers (e.g. PT Dirgahayu) only."}},
      {icon:"🏛️",level:"med",title:{ja:"観光地での入場料水増し",en:"Inflated entry fees"},desc:{ja:"非公式の「ガイド」が正規料金より高い入場料を徴収するケースあり。公式チケット窓口でのみ購入。",en:"Unofficial 'guides' collect inflated entry fees. Purchase tickets only at official windows."}},
      {icon:"🎨",level:"med",title:{ja:"アートギャラリー詐欺",en:"Art gallery scams"},desc:{ja:"バリ島のアートギャラリーで高額な絵画を購入させる手口あり。後で調べると大量生産品であることも。",en:"Bali art galleries pressure purchase of expensive paintings. Items may turn out to be mass-produced."}},
      {icon:"🙏",level:"med",title:{ja:"寺院訪問の服装要件",en:"Temple dress code requirements"},desc:{ja:"バリ島の寺院ではサロン・帯の着用が必要。入口で貸し出しあり（寄付制）。観光地周辺で高額で売りつける業者に注意。",en:"Bali temples require sarong and sash. Available at entrance (donation). Beware vendors overcharging for these near tourist sites."}},
      {icon:"🌋",level:"med",title:{ja:"火山ガイドの安全確認",en:"Volcano guide safety check"},desc:{ja:"ブロモ山・アグン山等の火山ガイドは資格確認必須。非公認ガイドは安全基準が低く救助保険なしの場合あり。",en:"Check credentials of volcano guides at Bromo/Agung etc. Uncertified guides may lack safety standards and rescue insurance."}},
      {icon:"🏖️",level:"low",title:{ja:"ビーチセールスの対応",en:"Handling beach sellers"},desc:{ja:"バリ島のビーチでのしつこい物売りは「Tidak mau（ティダマウ）」（いらない）と言えばOK。",en:"For persistent beach sellers in Bali, say 'Tidak mau' (I don't want). Say it clearly and walk away."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"インドネシアはチップ文化あり。高級レストラン・スパでは10〜15%が相場。強要されない限り任意。",en:"Tipping is customary in Indonesia. Upscale restaurants/spas: 10-15% standard. Voluntary unless pressured."}},
      {icon:"🌊",level:"low",title:{ja:"海の危険区域",en:"Ocean danger zones"},desc:{ja:"バリ島のビーチは離岸流が強いエリアあり。旗の色確認（赤=禁止）。救助員のいるビーチのみ遊泳推奨。",en:"Some Bali beaches have strong rip currents. Check flag colors (red=prohibited). Swim only at beaches with lifeguards."}},
      {icon:"🦟",level:"low",title:{ja:"デング熱・マラリア対策",en:"Dengue/malaria prevention"},desc:{ja:"インドネシアはデング熱・マラリアのリスクあり。長袖着用・防虫スプレー使用を推奨。旅行保険は必須。",en:"Indonesia has dengue/malaria risks. Wear long sleeves and use insect repellent. Travel insurance is essential."}},
    ],
    バリ島: [
      {icon:"💵",level:"high",title:{ja:"クタ・レギャン地区の両替詐欺",en:"Kuta/Legian money exchange fraud"},desc:{ja:"クタ・レギャン地区には偽両替所が多数。「公認両替所」と書いてあっても計算が正確でないケースあり。PT Dirgahayu等の大手公認所のみ利用。",en:"Many fake exchange counters in Kuta/Legian. Even 'authorized' ones may shortchange. Use major certified changers like PT Dirgahayu only."}},
      {icon:"🛵",level:"high",title:{ja:"スミニャック・ウブドのバイクタクシー",en:"Seminyak/Ubud motorbike overcharging"},desc:{ja:"スミニャック・ウブド周辺の流しバイクタクシーは外国人への割増が常態化。Gojek/Grabアプリ使用が必須。",en:"Street ojeks near Seminyak/Ubud routinely overcharge foreigners. Gojek/Grab app is essential."}},
      {icon:"🏛️",level:"med",title:{ja:"ウルワツ寺院での猿による盗難",en:"Monkey theft at Uluwatu Temple"},desc:{ja:"ウルワツ寺院の猿は眼鏡・帽子・スマートフォンを奪うことで有名。貴重品は必ずしまう。",en:"Uluwatu Temple monkeys are notorious for stealing glasses, hats, and phones. Secure all valuables."}},
      {icon:"🌊",level:"med",title:{ja:"クタビーチの離岸流",en:"Kuta Beach rip currents"},desc:{ja:"クタビーチは離岸流が非常に強く毎年溺死事故あり。旗の色を必ず確認。救助員のいるゾーンのみで遊泳。",en:"Kuta Beach has extremely strong rip currents with drownings every year. Always check flags. Swim only in flagged zones with lifeguards."}},
      {icon:"🎨",level:"low",title:{ja:"ウブドのアート詐欺",en:"Ubud art gallery overpricing"},desc:{ja:"ウブドのアートギャラリーで「有名作家の作品」として高額品を売りつけるケースあり。複数店舗で価格比較を推奨。",en:"Ubud galleries sell 'famous artist works' at high prices. Compare prices at multiple stores before purchasing."}},
    ],
  },

  マレーシア: {
    _default: [
      {icon:"🚕",level:"high",title:{ja:"クアラルンプールのタクシー不正",en:"KL taxi fraud"},desc:{ja:"クアラルンプールのタクシーはメーター拒否・遠回りが多い。GrabやMyCar等のライドシェアアプリが最も安全で確実。",en:"KL taxis frequently refuse meters or take detours. Grab or MyCar ride-share apps are safest and most reliable."}},
      {icon:"💎",level:"med",title:{ja:"偽ブランド品・模造品",en:"Fake brand goods/counterfeits"},desc:{ja:"ブキッビンタン・ジョホールバルなどの市場で偽ブランド品が多数販売。購入・持ち帰りは違法で税関で没収リスクあり。",en:"Fake brand goods sold at Bukit Bintang and JB markets. Buying/bringing home is illegal; customs may confiscate."}},
      {icon:"🌴",level:"med",title:{ja:"コタキナバル・離島の安全",en:"Kota Kinabalu island safety"},desc:{ja:"コタキナバル周辺の離島ツアーは認定業者のみ利用。海の天候変化が激しいため安全装備・保険の確認を。",en:"Use only certified operators for island tours near Kota Kinabalu. Weather changes rapidly. Check safety equipment and insurance."}},
      {icon:"🛕",level:"low",title:{ja:"宗教的マナー",en:"Religious etiquette"},desc:{ja:"マレーシアはイスラム教徒が多い。モスク訪問時は肌の露出を避け、女性はスカーフ着用。ラマダン中は公共での飲食に注意。",en:"Malaysia is majority Muslim. Cover up at mosques; women wear scarves. During Ramadan, avoid eating/drinking in public."}},
      {icon:"🦟",level:"low",title:{ja:"デング熱対策",en:"Dengue fever prevention"},desc:{ja:"マレーシアはデング熱のリスクあり。特に雨季（4〜5月、10〜11月）は防虫スプレー使用を。",en:"Dengue fever risk exists in Malaysia. Use insect repellent especially during rainy season (Apr-May, Oct-Nov)."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"マレーシアは基本チップ不要。高級レストランはサービス料10%が別途請求されることあり。",en:"Tipping generally not required in Malaysia. Upscale restaurants may add 10% service charge."}},
      {icon:"🌧️",level:"low",title:{ja:"スコール対策",en:"Tropical rain preparation"},desc:{ja:"マレーシアは年中スコールがある。折り畳み傘必携。急な豪雨では雨宿りで対処。",en:"Malaysia has tropical downpours year-round. Always carry a foldable umbrella. Seek shelter during sudden heavy rain."}},
      {icon:"🍱",level:"low",title:{ja:"ハラール食の確認",en:"Halal food awareness"},desc:{ja:"マレーシアではハラール認定外の豚肉・アルコールが食べられない場所も多い。メニューのHalal表示を確認。",en:"Many places in Malaysia don't serve non-halal pork or alcohol. Check for Halal certification on menus."}},
      {icon:"🏨",level:"low",title:{ja:"ゲストハウスの盗難",en:"Theft at guesthouses"},desc:{ja:"共有部屋での貴重品管理に注意。必ずロッカー使用。パスポートは常に携帯推奨。",en:"Keep valuables secure in shared rooms. Always use lockers. Carrying your passport at all times is recommended."}},
      {icon:"📱",level:"low",title:{ja:"WiFiとSIMカード",en:"WiFi and SIM cards"},desc:{ja:"マレーシアのSIMカードは空港で購入可能（Maxis・Celcom等）。観光客向けプリペイドSIMは7日間〜で安価。",en:"SIM cards available at airports (Maxis, Celcom etc.). Tourist prepaid SIMs from 7 days are affordable."}},
    ],
    クアラルンプール: [
      {icon:"🚕",level:"high",title:{ja:"KLIA空港タクシー詐欺",en:"KLIA airport taxi scams"},desc:{ja:"クアラルンプール国際空港(KLIA)ではGrabまたは事前払いタクシーカウンターのみ利用。声をかけてくる運転手は全て避ける。市内まで正規約80〜100リンギット。",en:"At KLIA, use only Grab or prepaid taxi counters. Avoid ALL drivers who approach you. Correct fare to city: ~80-100 RM."}},
      {icon:"🛍️",level:"med",title:{ja:"ブキッビンタンの偽物市場",en:"Bukit Bintang counterfeit market"},desc:{ja:"ブキッビンタン周辺の地下通路・路地での偽ブランド品販売は違法。購入した場合、出国時に税関で没収リスクあり。",en:"Counterfeit brand goods in Bukit Bintang tunnels/alleys are illegal. Risk of customs confiscation on departure."}},
      {icon:"🏙️",level:"med",title:{ja:"ペトロナスタワー周辺の詐欺師",en:"Petronas Tower area scammers"},desc:{ja:"ペトロナスタワー周辺で「無料チケットがある」「展望台に案内する」詐欺師に注意。公式チケットはKLCC公式サイトのみ。",en:"Scammers near Petronas Towers claim 'free tickets' or offer to 'guide you'. Official tickets only at KLCC official site."}},
      {icon:"🚇",level:"low",title:{ja:"LRT・MRT・モノレールの活用",en:"Using LRT/MRT/Monorail"},desc:{ja:"クアラルンプールの鉄道網は充実。観光客向けMyRapid Tourist Pass（1日/3日）がお得。タクシーより安く確実。",en:"KL has good rail network. MyRapid Tourist Pass (1-day/3-day) offers good value. Cheaper and more reliable than taxis."}},
      {icon:"🌡️",level:"low",title:{ja:"熱中症対策",en:"Heat stroke prevention"},desc:{ja:"クアラルンプールは年中高温多湿。水分を常に携帯。徒歩観光は早朝か夕方推奨。ショッピングモールは冷房が効いて避暑に最適。",en:"KL is hot and humid year-round. Always carry water. Walk tours best in early morning or evening. Malls are great for cooling down."}},
    ],
  },

  フィリピン: {
    _default: [
      {icon:"🚕",level:"high",title:{ja:"空港タクシー詐欺",en:"Airport taxi scams"},desc:{ja:"マニラ・セブの空港外でのタクシーは過剰請求が多発。Grab使用が最も安全。トライシクルは乗車前に料金確認必須。",en:"Taxis outside Manila/Cebu airports frequently overcharge. Grab is safest. Always confirm tricycle fares before boarding."}},
      {icon:"💎",level:"high",title:{ja:"宝石・真珠詐欺",en:"Gem/pearl scams"},desc:{ja:"「本物の南洋真珠が特別価格」は詐欺の可能性大。認定店以外での高額購入は避ける。",en:"'Real South Sea pearls at special price' is likely a scam. Avoid high-value purchases except at certified stores."}},
      {icon:"🌊",level:"med",title:{ja:"ボラカイの海のルール",en:"Boracay ocean rules"},desc:{ja:"ボラカイは環境保護のため厳格なルールあり。喫煙・アルコール禁止エリアあり。違反すると罰金。",en:"Boracay has strict environmental rules. Smoking/alcohol banned in certain areas. Fines for violations."}},
      {icon:"🌋",level:"med",title:{ja:"台風・自然災害への注意",en:"Typhoon/natural disaster awareness"},desc:{ja:"フィリピンは台風が多い（6〜12月が台風シーズン）。気象情報を常にチェック。PAGASAのアプリ活用を。",en:"Philippines has many typhoons (peak Jun-Dec). Check weather forecasts constantly. Use PAGASA app."}},
      {icon:"💊",level:"low",title:{ja:"飲料水の安全",en:"Drinking water safety"},desc:{ja:"水道水は飲用不可。必ず市販のミネラルウォーターを使用。氷が安全でない場合もあるため確認を。",en:"Tap water is not safe to drink. Use only bottled mineral water. Ice may also be unsafe; check with restaurants."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"フィリピンはチップ文化あり。レストランはサービス料10%が別途の場合が多い。ガイド・ドライバーへの50〜100ペソが相場。",en:"Tipping is customary. Restaurants often add 10% service charge. Guides/drivers: 50-100 PHP standard."}},
      {icon:"🔒",level:"low",title:{ja:"一般的な安全対策",en:"General safety tips"},desc:{ja:"マニラ・セブの一部地区は夜間危険。観光地以外での夜間単独行動は避け、グループ行動を推奨。",en:"Some areas of Manila/Cebu are dangerous at night. Avoid solo late-night walks outside tourist areas. Travel in groups."}},
      {icon:"🌴",level:"low",title:{ja:"離島の海流・安全",en:"Island currents and safety"},desc:{ja:"パラワン・コロン等の離島は海流が強い場所あり。地元ガイドの指示に従い、単独での行動は避ける。",en:"Islands like Palawan/Coron have strong currents in some areas. Follow local guide instructions. Avoid solo activities."}},
      {icon:"🏍️",level:"low",title:{ja:"バイクタクシーの危険",en:"Motorbike taxi hazards"},desc:{ja:"セブ・ダバオのバイクタクシー（habal-habal）は無許可・無保険の場合多い。Grab Bikeが安全。",en:"Habal-habal motorbike taxis in Cebu/Davao are often unlicensed and uninsured. Use Grab Bike instead."}},
      {icon:"🎰",level:"low",title:{ja:"カジノ周辺の詐欺",en:"Casino area scams"},desc:{ja:"マニラのカジノ（パグコー認定外）は違法。周辺でのカード詐欺・スリに注意。",en:"Non-PAGCOR casinos in Manila are illegal. Watch for card scams and pickpockets in casino areas."}},
    ],
  },

  台湾: {
    _default: [
      {icon:"🎪",level:"med",title:{ja:"夜市の価格確認",en:"Night market price checking"},desc:{ja:"台湾の夜市は基本的に安全だが、観光地（士林・饒河）では外国人向け価格になる場合あり。価格表を確認。",en:"Taiwan night markets are generally safe, but tourist spots (Shilin/Raohe) may charge more for foreigners. Check price boards."}},
      {icon:"🚕",level:"med",title:{ja:"タクシーメーター確認",en:"Check taxi meter"},desc:{ja:"台湾のタクシーは比較的誠実だが、桃園空港〜台北市内は正規料金1,100〜1,300台湾ドル。メーターONを乗車時に確認。",en:"Taiwan taxis are relatively honest, but Taoyuan Airport to Taipei city should be NT$1,100-1,300. Confirm meter ON when boarding."}},
      {icon:"🛵",level:"med",title:{ja:"スクーターレンタルの注意",en:"Scooter rental caution"},desc:{ja:"台湾でのスクーターレンタルは国際免許証+台湾の適切な免許が必要。違反した場合の罰金は高額。",en:"Scooter rental in Taiwan requires international license plus appropriate Taiwan license. Fines for violations are high."}},
      {icon:"💳",level:"low",title:{ja:"悠遊カードの活用",en:"Using EasyCard"},desc:{ja:"悠遊カード（EasyCard）は地下鉄・バス・タクシー・コンビニで使え便利。台北駅・空港で購入可能。",en:"EasyCard works on MRT, buses, taxis, and convenience stores. Available at Taipei Main Station and airport."}},
      {icon:"🌋",level:"low",title:{ja:"地震・台風への備え",en:"Earthquake/typhoon preparation"},desc:{ja:"台湾は地震・台風が多い。滞在中は気象情報と緊急速報に注意。ホテルの避難経路を確認。",en:"Taiwan has frequent earthquakes and typhoons. Monitor weather forecasts and emergency alerts. Check hotel evacuation routes."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"台湾は基本チップ不要。高級レストランでは10%のサービス料が請求されることあり。",en:"Tipping not required in Taiwan. Upscale restaurants may add 10% service charge."}},
      {icon:"🛍️",level:"low",title:{ja:"免税制度の活用",en:"Tax refund system"},desc:{ja:"台湾はVAT5%。1店舗で3,000台湾ドル以上購入し、出国時に空港で申請すれば還付可能。",en:"Taiwan has 5% VAT. Spend NT$3,000+ at one store and claim refund at the airport on departure."}},
      {icon:"🍜",level:"low",title:{ja:"屋台の衛生",en:"Street food hygiene"},desc:{ja:"台湾の屋台は衛生水準が比較的高いが、清潔感のある店舗を選ぶ。生の海鮮・切りフルーツは注意。",en:"Taiwan street food hygiene is relatively high, but choose clean-looking stalls. Be careful with raw seafood and cut fruit."}},
      {icon:"🏙️",level:"low",title:{ja:"台北101周辺の観光客向け料金",en:"Tourist pricing near Taipei 101"},desc:{ja:"台北101周辺の飲食店は観光客向け価格。近くの永康街・師大夜市の方が安くて美味しい場合あり。",en:"Restaurants near Taipei 101 charge tourist prices. Yongkang Street or Shida Night Market nearby are cheaper and often better."}},
      {icon:"📱",level:"low",title:{ja:"SIMカードの購入",en:"Buying a SIM card"},desc:{ja:"台湾の空港でSIMカード購入可能（中華電信・台灣大哥大等）。7日間約400台湾ドルで使い放題プランあり。",en:"SIM cards available at Taiwan airports (Chunghwa Telecom, Taiwan Mobile etc.). 7-day unlimited plans ~NT$400."}},
    ],
  },

  シンガポール: {
    _default: [
      {icon:"⚖️",level:"high",title:{ja:"厳格な法律・罰則",en:"Strict laws and penalties"},desc:{ja:"シンガポールは世界有数の厳格な法律を持つ。チューインガムの持ち込み禁止、ゴミのポイ捨て罰金1,000〜2,000シンガポールドル、喫煙エリア外での喫煙は罰金。",en:"Singapore has extremely strict laws. Chewing gum banned. Littering fines S$1,000-2,000. Smoking outside designated areas is fined."}},
      {icon:"🌿",level:"high",title:{ja:"麻薬の厳罰",en:"Severe drug penalties"},desc:{ja:"シンガポールでの麻薬所持・密輸は死刑を含む極めて重い刑罰。他人の荷物を運ぶことは絶対に引き受けない。",en:"Drug possession/trafficking in Singapore carries extremely severe penalties including death. Never carry bags for strangers under any circumstances."}},
      {icon:"🍺",level:"med",title:{ja:"アルコール時間規制",en:"Alcohol time restrictions"},desc:{ja:"シンガポールでは午後10:30〜翌午前7:00の間、公共の場所でのアルコール飲料持ち込み・飲用が禁止。違反は罰金。",en:"Singapore bans consuming alcohol in public areas from 10:30pm to 7am. Violations are fined."}},
      {icon:"🚕",level:"med",title:{ja:"タクシー・Grabの使い方",en:"Using taxis and Grab"},desc:{ja:"シンガポールのタクシーは信頼できる。GrabはComfortDelGro等の公認タクシー会社と提携。乗車前にアプリで料金確認。",en:"Singapore taxis are reliable. Grab partners with certified companies like ComfortDelGro. Confirm fare in app before boarding."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"シンガポールは基本チップ不要。レストランはサービス料10%＋GST9%が別途請求されることが多い。",en:"Tipping not required in Singapore. Restaurants often add 10% service charge + 9% GST on top of listed prices."}},
      {icon:"🌡️",level:"low",title:{ja:"熱中症対策",en:"Heat stroke prevention"},desc:{ja:"シンガポールは年中高温多湿（平均32℃）。水分を常に携帯。MRTとモールを活用して炎天下の移動を最小化。",en:"Singapore is hot and humid year-round (avg 32°C). Carry water always. Use MRT and malls to minimize sun exposure."}},
      {icon:"📷",level:"low",title:{ja:"撮影禁止エリア",en:"Photography prohibited areas"},desc:{ja:"政府機関・裁判所・軍事施設での無断撮影は違法。チャンギ空港の一部エリアも撮影制限あり。標識を確認。",en:"Unauthorized photography at government/court/military buildings is illegal. Some areas of Changi Airport also restrict photography. Check signs."}},
      {icon:"🛍️",level:"low",title:{ja:"オーチャードロードの正規店",en:"Orchard Road authorized stores"},desc:{ja:"オーチャードロードは基本的に安全だが、露天商やコピー品は購入しない。正規ショッピングモール内での購入が安心。",en:"Orchard Road is generally safe. Avoid street vendors and counterfeit goods. Buy only inside authorized shopping malls."}},
      {icon:"🦟",level:"low",title:{ja:"デング熱対策",en:"Dengue prevention"},desc:{ja:"シンガポールでもデング熱の発生あり。防虫スプレー使用推奨。水たまりは蚊の発生源なので注意。",en:"Dengue fever occurs in Singapore. Use insect repellent. Standing water breeds mosquitoes; be aware."}},
      {icon:"🏘️",level:"low",title:{ja:"ホーカーセンターでの食事",en:"Hawker centre dining tips"},desc:{ja:"ホーカー・センター（屋台街）は安くて美味しい。席に荷物を置いて席取りするのが地元のマナー。",en:"Hawker centres are cheap and good. Leaving items on chairs to reserve seats is local custom."}},
    ],
  },

  中国: {
    _default: [
      {icon:"📱",level:"high",title:{ja:"VPN・インターネット規制",en:"VPN and internet restrictions"},desc:{ja:"中国ではGoogle・LINE・Instagram・WhatsApp等が使えない。VPNは渡航前にインストール必須。中国内でのVPNダウンロードは困難。",en:"Google, LINE, Instagram, WhatsApp are blocked in China. Install VPN before arrival. Downloading VPN inside China is difficult."}},
      {icon:"💳",level:"high",title:{ja:"キャッシュレス社会への対応",en:"Adapting to cashless society"},desc:{ja:"中国はAlipay・WeChatPayが主流。外国のクレジットカードが使えない場合多い。到着時に十分な現金を用意するか、Alipay国際版を事前設定。",en:"China primarily uses Alipay/WeChat Pay. Foreign credit cards often not accepted. Bring sufficient cash or set up Alipay International before arrival."}},
      {icon:"🍵",level:"high",title:{ja:"茶館詐欺（茶葉詐欺）",en:"Tea house scam"},desc:{ja:"特に北京・上海で友好的な中国人が「茶館に案内する」と誘い、帰りに高額な茶葉代を請求する手口が有名。一人または二人組で近づいてくる。",en:"Especially in Beijing/Shanghai, friendly locals invite you to a 'tea house' then demand high payments for tea. Common with 1-2 person approach."}},
      {icon:"🏛️",level:"med",title:{ja:"偽観光ガイド・偽チケット",en:"Fake guides/tickets"},desc:{ja:"万里の長城・故宮等の名所周辺で偽ガイドや割高チケット業者に注意。公式窓口・公式アプリでのみ購入。",en:"Fake guides and overpriced ticket sellers operate near Great Wall/Forbidden City. Buy only at official counters or apps."}},
      {icon:"🛍️",level:"med",title:{ja:"偽ブランド品・コピー品",en:"Counterfeit/copy goods"},desc:{ja:"中国では偽ブランド品が多く流通。購入・持ち帰りは税関で没収リスクあり。正規店での購入を推奨。",en:"Counterfeit goods widely available in China. Risk of customs confiscation when leaving. Buy only at authorized stores."}},
      {icon:"💊",level:"med",title:{ja:"食品安全・衛生",en:"Food safety and hygiene"},desc:{ja:"路上の食べ物・生水は食中毒リスクあり。ミネラルウォーターは封を自分で開ける。評価の高いレストランを選ぶ。",en:"Street food and tap water carry food poisoning risks. Open mineral water bottles yourself. Choose well-reviewed restaurants."}},
      {icon:"📸",level:"med",title:{ja:"写真・SNSの注意",en:"Photography and social media caution"},desc:{ja:"天安門広場・軍事施設等の政治的に敏感な場所での撮影・SNS投稿は注意が必要。中国のルールを遵守。",en:"Be careful photographing politically sensitive sites like Tiananmen Square or military facilities. Comply with Chinese regulations."}},
      {icon:"🏥",level:"low",title:{ja:"医療費・旅行保険",en:"Medical costs & travel insurance"},desc:{ja:"中国の医療費は外国人には高額。旅行保険（医療補償付き）への加入を強く推奨。大病院は外国人向け窓口あり。",en:"Medical costs in China are high for foreigners. Travel insurance with medical coverage strongly recommended. Major hospitals have foreigner counters."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"中国は基本チップ不要。渡そうとすると断られる場合もある。高級ホテルのポーターには20〜50元が相場。",en:"Tipping generally not required in China. May even be refused. High-end hotel porters: 20-50 yuan is customary."}},
      {icon:"🚇",level:"low",title:{ja:"地下鉄・交通の活用",en:"Using subway and public transport"},desc:{ja:"主要都市の地下鉄は安価で便利。北京・上海はほぼ英語表記あり。交通カードが便利。",en:"Subways in major cities are cheap and convenient. Beijing/Shanghai have English signage. Transport cards are handy."}},
      {icon:"🌐",level:"low",title:{ja:"現地SIMカード",en:"Local SIM card"},desc:{ja:"中国でSIMカードを購入するにはパスポートが必要。China Mobile・China Unicom等の正規ショップで購入。",en:"Passport required to purchase SIM in China. Buy at official shops of China Mobile/China Unicom etc."}},
    ],
    北京: [
      {icon:"🍵",level:"high",title:{ja:"天安門周辺の茶館詐欺",en:"Tea house scam near Tiananmen"},desc:{ja:"天安門広場・王府井周辺で「英語の練習をしたい」と声かけ後、高額な茶館代を請求するのが有名な手口。笑顔で断る。",en:"Near Tiananmen/Wangfujing, locals approach saying 'I want to practice English' then charge high fees at tea houses. Politely refuse all such approaches."}},
      {icon:"🏯",level:"high",title:{ja:"万里の長城偽チケット・偽ガイド",en:"Great Wall fake tickets/guides"},desc:{ja:"万里の長城（特に八達嶺）周辺で偽ガイド・偽チケット売りが多数。公式サイトまたは現地公式窓口のみで購入。",en:"Many fake guides/ticket sellers near Great Wall (esp. Badaling). Official tickets only at official sites or ticketing counters. Never buy from individuals."}},
      {icon:"🚕",level:"med",title:{ja:"首都空港タクシー",en:"Beijing Capital Airport taxis"},desc:{ja:"首都国際空港では公式タクシー乗り場（T2・T3出口の外）のみ利用。声をかけてくる運転手は全て白タク。市内まで正規90〜130元程度。",en:"At Capital Airport, use only official taxi stands outside T2/T3 exits. Any driver approaching you is unlicensed. City center: ~90-130 RMB."}},
      {icon:"🛍️",level:"med",title:{ja:"秀水市場の偽ブランド品",en:"Fake goods at Silk Market"},desc:{ja:"秀水市場（シルクマーケット）での偽ブランド品販売は観光名物だが、購入・持ち帰りは帰国時に税関で没収されるリスクあり。",en:"Fake brands at Silk Market are a tourist attraction but buying/bringing home risks customs confiscation."}},
      {icon:"🌫️",level:"low",title:{ja:"大気汚染対策",en:"Air pollution protection"},desc:{ja:"北京の大気汚染（PM2.5）は深刻な場合あり。AQI150以上はN95マスク着用推奨。AQIアプリで事前確認。",en:"Beijing air pollution (PM2.5) can be severe. If AQI>150, wear an N95 mask. Check AQI app before outdoor activities."}},
    ],
    上海: [
      {icon:"🍵",level:"high",title:{ja:"南京路・外灘周辺の茶館詐欺",en:"Tea house scam near Nanjing Road/Bund"},desc:{ja:"南京路・外灘周辺でも「一緒にお茶を飲もう」と声かけし、高額なお茶代を請求する手口が多発。",en:"Near Nanjing Road/Bund, 'let's have tea' approaches lead to high tea bills. Firmly refuse."}},
      {icon:"🚕",level:"med",title:{ja:"浦東・虹橋空港タクシー",en:"Pudong/Hongqiao airport taxis"},desc:{ja:"浦東空港・虹橋空港での非公認タクシーへの乗車は避ける。公式乗り場で乗車。市内まで正規150〜200元程度。地下鉄が最も安くて確実。",en:"Avoid unlicensed taxis at Pudong/Hongqiao airports. Use official stands. City center: ~150-200 RMB. Metro is cheapest and most reliable."}},
      {icon:"🏙️",level:"med",title:{ja:"外灘・豫園周辺の偽ガイド",en:"Fake guides near Bund/Yu Garden"},desc:{ja:"外灘・豫園周辺で非公認の「ガイド」が高額ツアーを勧めてくる。公式観光ガイドは政府認定バッジを持つ。",en:"Unofficial 'guides' near the Bund/Yu Garden offer expensive tours. Official guides carry government-certified badges."}},
      {icon:"🛍️",level:"low",title:{ja:"上海の正規品店",en:"Shanghai authorized stores"},desc:{ja:"上海の空港免税店・正規ブランドショップは信頼できる。路地での「高級品格安販売」は偽物リスク大。",en:"Shanghai airport duty-free and official brand stores are reliable. 'Luxury goods at bargain prices' in alleys are almost certainly fake."}},
    ],
  },

  モンゴル: {
    _default: [
      {icon:"❄️",level:"high",title:{ja:"極寒の冬",en:"Extreme winter cold"},desc:{ja:"モンゴルの冬（11〜3月）はウランバートルでも−20〜−40℃になることがある。適切な防寒着・防水ブーツが必須。凍傷リスクに注意。",en:"Mongolian winters (Nov-Mar) can drop to -20 to -40°C even in Ulaanbaatar. Adequate cold-weather clothing and waterproof boots are essential. Watch for frostbite risk."}},
      {icon:"🐎",level:"med",title:{ja:"乗馬・ゲル滞在の安全",en:"Horseback riding and ger stay safety"},desc:{ja:"遊牧民体験（乗馬・ゲル宿泊）は認定業者のみ利用。適切な装備・ガイドなしでの草原移動は迷子リスク大。",en:"Nomadic experiences (horseback riding, ger stays) through certified operators only. Moving through steppe without appropriate gear and a guide risks getting lost."}},
      {icon:"🚕",level:"med",title:{ja:"タクシー過剰請求",en:"Taxi overcharging"},desc:{ja:"ウランバートルのタクシーは外国人への過剰請求多発。アプリ（Ride Taxi等）を使用するか、ホテルへのタクシー手配が安全。",en:"Ulaanbaatar taxis frequently overcharge foreigners. Use apps (Ride Taxi etc.) or arrange taxis through your hotel for safety."}},
      {icon:"💨",level:"med",title:{ja:"大気汚染",en:"Air pollution"},desc:{ja:"ウランバートルの冬の大気汚染（PM2.5）は世界最悪レベルになることも。N95マスク着用推奨。呼吸器疾患のある方は特に注意。",en:"Ulaanbaatar's winter air pollution (PM2.5) can reach some of the world's worst levels. N95 mask strongly recommended. Those with respiratory issues should exercise extreme caution."}},
      {icon:"🌿",level:"low",title:{ja:"自然保護区のルール",en:"Nature reserve rules"},desc:{ja:"モンゴルの国立公園・自然保護区での植物採集・野生動物への接触は禁止。ゴビ砂漠等では認定ガイドとともに行動を推奨。",en:"Collecting plants and touching wildlife in Mongolian national parks is prohibited. Traveling with certified guides is recommended in places like the Gobi Desert."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"モンゴルはチップが慣例。ガイドに1日$5〜10、運転手に$3〜5が相場。ゲルのホストへの小さなプレゼントも歓迎される。",en:"Tipping is customary in Mongolia. Guide: $5-10/day; driver: $3-5/day is standard. Small gifts to ger hosts are also appreciated."}},
    ],
  },

  モルディブ: {
    _default: [
      {icon:"⚖️",level:"high",title:{ja:"イスラム法の厳守",en:"Strict Islamic law compliance"},desc:{ja:"モルディブはイスラム共和国。アルコールはリゾート島内のみ合法（地元の島での飲酒は違法）。豚肉持ち込み禁止。ラマダン期間中は公共での飲食禁止。",en:"Maldives is an Islamic republic. Alcohol is legal only within resort islands (illegal on local islands). Pork is prohibited. Public eating/drinking banned during Ramadan."}},
      {icon:"🌊",level:"high",title:{ja:"水上コテージの安全",en:"Water villa safety"},desc:{ja:"水上コテージはライフジャケットの場所を確認。波が高い日は外部デッキへの外出注意。サンゴ礁の踏み荒らしは環境破壊で罰則あり。",en:"Check life jacket location in water villas. Exercise caution on outer decks during high waves. Trampling coral reefs causes environmental damage and may be penalized."}},
      {icon:"💰",level:"high",title:{ja:"リゾートの物価",en:"Resort pricing"},desc:{ja:"モルディブのリゾートは世界最高水準の物価。飲食・アクティビティの価格は事前に確認。オールインクルーシブプランが総合的に割安。",en:"Maldives resorts have world-class prices. Check food and activity prices in advance. All-inclusive plans are often better overall value."}},
      {icon:"🤿",level:"med",title:{ja:"ダイビングの安全",en:"Diving safety"},desc:{ja:"モルディブは世界屈指のダイビングスポット。潮流が強いエリアあり。認定ダイブセンター（PADI等）のみ利用し、必ずダイブコンピューター持参。",en:"Maldives is a world-class diving destination. Some areas have strong currents. Use only certified dive centers (PADI etc.). Always bring a dive computer."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"モルディブリゾートはサービス料10〜15%が既に含まれていることが多い。追加チップは任意。ダイブガイド・スパスタッフへの$5〜10/サービスが慣例。",en:"Maldives resorts often include 10-15% service charge. Additional tips are voluntary. $5-10 per service for dive guides and spa staff is customary."}},
    ],
  },

  ラオス: {
    _default: [
      {icon:"🛵",level:"med",title:{ja:"バイクタクシー・トゥクトゥク",en:"Motorbike taxi and tuk-tuk"},desc:{ja:"ビエンチャン・ルアンパバーンのトゥクトゥクは外国人への割増が多い。乗車前に料金確認。Grab利用が可能な地域では使用推奨。",en:"Tuk-tuks in Vientiane/Luang Prabang frequently overcharge foreigners. Confirm fare before boarding. Use Grab where available."}},
      {icon:"💵",level:"med",title:{ja:"両替・通貨",en:"Currency exchange"},desc:{ja:"ラオス・キップは変動しやすい通貨。ドル・タイバーツも多くの店で使用可能。両替は銀行・ホテルで。",en:"Lao kip is a fluctuating currency. USD and Thai baht are widely accepted. Exchange at banks or hotels."}},
      {icon:"🏛️",level:"low",title:{ja:"寺院の服装マナー",en:"Temple dress code"},desc:{ja:"ラオスのお寺（ワット）では肩・膝を覆う服装が必要。スカーフ等を持参。托鉢の撮影は静粛に。",en:"Laos temples (wats) require covering shoulders and knees. Bring a scarf. Be discreet when photographing alms-giving ceremonies."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"ラオスはチップが一般的ではないが、観光地ではガイド・運転手に20,000〜50,000キップが慣例になりつつある。",en:"Tipping is not traditional in Laos, but 20,000-50,000 kip for guides/drivers at tourist sites is becoming common."}},
      {icon:"🌿",level:"low",title:{ja:"不発弾（UXO）への注意",en:"Unexploded ordnance (UXO) awareness"},desc:{ja:"ラオス（特に東部）には未爆弾（UXO）が多く残っている。指定されたトレイル・道路のみを歩く。不審な物体には絶対に触れない。",en:"Unexploded ordnance (UXO) remains widespread in Laos (esp. eastern areas). Walk only on designated trails and roads. Never touch suspicious objects."}},
    ],
  },

  カンボジア: {
    _default: [
      {icon:"🏛️",level:"high",title:{ja:"アンコールワット周辺の詐欺師",en:"Scammers near Angkor Wat"},desc:{ja:"アンコールワット周辺で「偽ガイド」「偽チケット」販売多発。公式チケットはシェムリアップの公式窓口のみで1日券$37/外国人。",en:"Fake guides and ticket sellers abound near Angkor Wat. Official tickets only at official counter in Siem Reap. 1-day pass: $37 for foreigners."}},
      {icon:"🛵",level:"high",title:{ja:"トゥクトゥク・バイクタクシー",en:"Tuk-tuk and motorbike taxi"},desc:{ja:"シェムリアップ・プノンペンのトゥクトゥクは外国人への割増が常態化。PassApp（カンボジア版Grab）使用が最安全。",en:"Tuk-tuks in Siem Reap/Phnom Penh routinely overcharge foreigners. PassApp (Cambodia's Grab equivalent) is safest."}},
      {icon:"💵",level:"med",title:{ja:"二重通貨（ドルとリエル）",en:"Dual currency (USD and riel)"},desc:{ja:"カンボジアは米ドルとカンボジアリエルが混在。釣りはリエルで返ってくることあり。1ドル=4,000リエルが概ね相場。",en:"Cambodia uses both USD and Cambodian riel. Change may be given in riel. Approximate rate: 1 USD = 4,000 riel."}},
      {icon:"🌿",level:"med",title:{ja:"地雷・不発弾への注意",en:"Landmine and UXO awareness"},desc:{ja:"カンボジア（特に西部・北西部）には地雷・不発弾が残存。指定されたトレイル・観光エリアのみを歩く。",en:"Landmines and UXO remain in Cambodia (esp. western/northwest areas). Walk only on designated trails and in official tourist areas."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"カンボジアはチップが慣例になりつつある。レストランで5〜10%、ガイドに$5〜10/日が相場。",en:"Tipping is becoming customary in Cambodia. 5-10% at restaurants; $5-10/day for guides is standard."}},
    ],
  },

  オーストラリア: {
    _default: [
      {icon:"🕷️",level:"high",title:{ja:"危険な野生生物",en:"Dangerous wildlife"},desc:{ja:"オーストラリアにはファンネルウェブスパイダー・ヘビ・箱クラゲ等の危険な生物が多数。草むらには入らず、海では事前に安全確認。",en:"Australia has many dangerous creatures including funnel-web spiders, snakes, and box jellyfish. Avoid tall grass; check ocean safety before swimming."}},
      {icon:"🔥",level:"high",title:{ja:"山火事・熱波",en:"Bushfire and heatwave"},desc:{ja:"オーストラリアの夏（11〜3月）は山火事・熱波リスク大。出かける前にFirewatch・気象情報確認。山火事時は避難指示に従う。",en:"Australian summer (Nov-Mar) carries high bushfire/heatwave risk. Check Firewatch and weather before going out. Follow evacuation orders during bushfires."}},
      {icon:"☀️",level:"high",title:{ja:"紫外線・日焼け",en:"UV radiation and sunburn"},desc:{ja:"オーストラリアの紫外線は日本の数倍。SPF50+の日焼け止め・帽子・長袖が必須。屋外活動は午前11時〜午後3時を避ける。",en:"Australian UV is several times stronger than Japan's. SPF50+ sunscreen, hat, and long sleeves essential. Avoid outdoors 11am-3pm."}},
      {icon:"🦈",level:"med",title:{ja:"サメ・クラゲの危険",en:"Shark and jellyfish hazards"},desc:{ja:"オーストラリアの海にはサメ・クラゲ・エイが生息。旗が立っているビーチのライフセーバーエリアのみで遊泳。",en:"Australian waters have sharks, jellyfish, and stingrays. Swim only between flags in lifesaver patrol zones."}},
      {icon:"🚗",level:"med",title:{ja:"左側通行・長距離ドライブ",en:"Left-side driving and long drives"},desc:{ja:"オーストラリアは左側通行。長距離ドライブは動物（カンガルー等）の飛び出しに注意。夜間運転は特に危険。",en:"Australia drives on the left. Watch for animals (kangaroos) on long drives. Night driving is especially dangerous."}},
      {icon:"🏧",level:"med",title:{ja:"カード詐欺・スキミング",en:"Card fraud and skimming"},desc:{ja:"観光地のATMでのスキミング被害報告あり。銀行内ATMを優先使用。カード情報盗難時は即座にカード会社へ連絡。",en:"Skimming incidents reported at tourist area ATMs. Prefer ATMs inside bank branches. Contact card company immediately if fraud suspected."}},
      {icon:"🏕️",level:"low",title:{ja:"国立公園でのルール",en:"National park rules"},desc:{ja:"国立公園への持ち込み・植物・動物の採集は厳禁。罰金は最大数十万円。レンジャーの指示に従い、ゴミは必ず持ち帰る。",en:"Collecting plants and animals in national parks is strictly prohibited. Fines up to thousands of dollars. Follow ranger instructions; take all rubbish out."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"オーストラリアは基本チップ不要。レストランのサービスが良ければ10%程度が慣例だが義務ではない。",en:"Tipping is generally not required in Australia. 10% for good restaurant service is customary but not obligatory."}},
      {icon:"🌊",level:"low",title:{ja:"海でのルールと安全",en:"Ocean rules and safety"},desc:{ja:"「Swim between the flags（旗の間で泳ぐ）」がオーストラリアのビーチの基本ルール。旗の外での遊泳は救助員が助けに来ない場合あり。",en:"'Swim between the flags' is Australia's basic beach safety rule. Lifeguards may not rescue swimmers outside flags."}},
      {icon:"🍺",level:"low",title:{ja:"飲酒の年齢制限",en:"Drinking age restrictions"},desc:{ja:"オーストラリアの飲酒可能年齢は18歳以上。バー・レストランで年齢確認（ID）される場合あり。パスポートが最も確実。",en:"Legal drinking age in Australia is 18. Bars/restaurants may check ID. Passport is the most reliable form of ID."}},
    ],
    シドニー: [
      {icon:"🌊",level:"high",title:{ja:"ボンダイビーチの離岸流",en:"Bondi Beach rip currents"},desc:{ja:"ボンダイビーチは離岸流が非常に強く世界的に有名。必ずフラグ（旗）の間のみで遊泳。旗外での溺死事故は毎年発生。",en:"Bondi Beach has famously strong rip currents. Always swim only between the flags. Drownings outside flags occur every year."}},
      {icon:"🎒",level:"med",title:{ja:"観光地でのスリ",en:"Pickpockets at tourist sites"},desc:{ja:"シドニーのオペラハウス・ダーリングハーバー周辺でのスリ・バッグ盗難に注意。荷物から目を離さない。",en:"Watch for pickpockets near Sydney Opera House and Darling Harbour. Never leave bags unattended."}},
      {icon:"🚖",level:"med",title:{ja:"空港タクシーの料金",en:"Airport taxi fares"},desc:{ja:"シドニー空港〜市内のタクシーは正規料金$45〜60程度。Uber/Olaは$35〜50。空港シャトルも選択肢。",en:"Sydney Airport to city: taxis ~A$45-60. Uber/Ola: ~A$35-50. Airport shuttle also available."}},
      {icon:"🚇",level:"low",title:{ja:"Opalカードの活用",en:"Opal Card tips"},desc:{ja:"シドニーのOpalカードは電車・バス・フェリーで使えて割引あり。空港でも購入可。現金払いより1回あたり格安。",en:"Sydney Opal Card works on trains/buses/ferries with discounts. Available at airport. Much cheaper per ride than cash."}},
      {icon:"🍷",level:"low",title:{ja:"レストランのコークエージ制度",en:"Restaurant corkage fees"},desc:{ja:"シドニーのBYO（持ち込み可）レストランでは「コークエージフィー」（持ち込みワインに対する料金$5〜20/本）が発生することあり。事前確認を。",en:"BYO (bring your own) restaurants in Sydney may charge 'corkage fees' ($5-20/bottle). Confirm beforehand."}},
    ],
  },

  ニュージーランド: {
    _default: [
      {icon:"🌊",level:"high",title:{ja:"海・川・山の安全",en:"Ocean, river and mountain safety"},desc:{ja:"NZの自然は美しいが、天候変化が急激。登山・川でのアクティビティは天気予報確認必須。単独行動は避け、計画を人に伝える。",en:"NZ nature is beautiful but weather changes rapidly. Check forecasts before hiking/river activities. Avoid solo trips; always tell someone your plans."}},
      {icon:"🔥",level:"high",title:{ja:"キャンプファイヤー禁止",en:"Campfire restrictions"},desc:{ja:"NZはキャンプファイヤーを禁止している地域が多い。山火事リスクが高い時期は全面禁止。必ずDoC（環境保全省）のルールを確認。",en:"Many NZ areas prohibit campfires. Total bans during high fire risk periods. Always check DoC (Dept of Conservation) rules."}},
      {icon:"🦟",level:"med",title:{ja:"サンドフライ（ブラックフライ）",en:"Sandflies (blackflies)"},desc:{ja:"NZの南島・フィヨルドランドのサンドフライは非常に攻撃的。虫除けスプレー（DEET含有）必携。刺されると数日間かゆみが続く。",en:"Sandflies in NZ South Island/Fiordland are extremely aggressive. Carry insect repellent with DEET. Bites itch for days."}},
      {icon:"🚗",level:"med",title:{ja:"左側通行・山道の運転",en:"Left-side driving and mountain roads"},desc:{ja:"NZは左側通行。山道は狭く急カーブが多い。羊や牛の道路横断に注意。疲れたら必ず休憩。",en:"NZ drives on the left. Mountain roads are narrow with sharp curves. Watch for sheep/cattle on roads. Always rest when tired."}},
      {icon:"💳",level:"low",title:{ja:"物価の高さ",en:"High cost of living"},desc:{ja:"NZは物価が高め。レストランの食事は1人NZ$20〜40。スーパーでの自炊が節約になる。チップは基本不要。",en:"NZ has high living costs. Restaurant meals: NZ$20-40/person. Self-catering saves money. Tipping generally not required."}},
      {icon:"🌋",level:"low",title:{ja:"地震・火山活動",en:"Earthquakes and volcanic activity"},desc:{ja:"NZは地震・火山が多い。ホワイトアイランド等の火山観光は危険性を十分理解した上で参加。ホテルの避難経路を確認。",en:"NZ has frequent earthquakes and volcanic activity. Understand risks before volcanic tours. Check hotel evacuation routes."}},
      {icon:"☀️",level:"low",title:{ja:"紫外線・日焼け対策",en:"UV and sunburn protection"},desc:{ja:"NZの紫外線はオゾン層が薄いため非常に強い。SPF50+の日焼け止め必須。曇りの日でも紫外線は強い。",en:"NZ has very intense UV due to thin ozone layer. SPF50+ sunscreen essential. UV remains strong even on cloudy days."}},
      {icon:"🧭",level:"low",title:{ja:"クイーンズタウンの安全",en:"Queenstown safety"},desc:{ja:"クイーンズタウンはアドベンチャースポーツの聖地。バンジー・スカイダイビング等は認定業者のみ選ぶ。保険加入を確認してから参加。",en:"Queenstown is an adventure sports mecca. Choose only certified operators for bungy/skydiving etc. Verify insurance before participating."}},
      {icon:"🐾",level:"low",title:{ja:"野生生物の保護",en:"Wildlife protection"},desc:{ja:"NZの野生生物（カカポ・キウイ等）は厳重に保護されている。国立公園での動植物の採集・持ち出しは厳禁。",en:"NZ wildlife (kakapo, kiwi etc.) is strictly protected. Collecting plants/animals in national parks is prohibited."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"NZは基本チップ不要。サービスが特に良かった場合の任意。強要されることはほとんどない。",en:"Tipping is generally not required in NZ. Optional for exceptional service. Almost never pressured."}},
    ],
  },

  ハワイ: {
    _default: [
      {icon:"🌊",level:"high",title:{ja:"ビーチの離岸流・高波",en:"Rip currents and high waves"},desc:{ja:"ハワイのビーチは見た目より危険。離岸流・高波による事故が毎年多数。地元の旗表示を確認。ライフガードのいるビーチのみで遊泳。",en:"Hawaii beaches are more dangerous than they look. Rip currents and high waves cause many accidents annually. Check local flag warnings. Swim only at lifeguarded beaches."}},
      {icon:"🚖",level:"high",title:{ja:"偽Uber・タクシー過剰請求",en:"Fake Uber/taxi overcharging"},desc:{ja:"ホノルル空港周辺で偽UberやBolt等を装った白タクに注意。アプリで車両ナンバー・運転手写真を確認。空港〜ワイキキの正規Uber料金は$25〜35程度。",en:"Watch for fake Uber/Bolt drivers near Honolulu Airport. Verify plate/driver photo in app. Official Uber from airport to Waikiki: ~$25-35."}},
      {icon:"☀️",level:"high",title:{ja:"紫外線・熱中症",en:"UV and heat stroke"},desc:{ja:"ハワイの紫外線は非常に強い。SPF50+の日焼け止め必須（リーフセーフ推奨）。水分補給を怠らない。",en:"Hawaii UV is very intense. Use SPF50+ sunscreen (reef-safe recommended). Stay well hydrated."}},
      {icon:"🐢",level:"med",title:{ja:"ウミガメへの接触禁止",en:"Do not touch sea turtles"},desc:{ja:"ハワイのウミガメ（ホヌ）は連邦法で保護。接触・2メートル以内への接近だけで罰金$10,000以上。",en:"Hawaii's sea turtles (Honu) are federally protected. Touching or getting within 2 meters: fines of $10,000+."}},
      {icon:"🌋",level:"med",title:{ja:"ビッグアイランド火山ガス",en:"Big Island volcanic gas"},desc:{ja:"ハワイ火山国立公園からlaze（溶岩ガス）とvog（火山性霧）が発生。有毒のため呼吸器疾患のある方は特に注意。",en:"Laze (from lava hitting ocean) and vog (volcanic fog) from Kīlauea are toxic. People with respiratory issues should exercise extreme caution."}},
      {icon:"🐟",level:"med",title:{ja:"珊瑚礁保護",en:"Coral reef protection"},desc:{ja:"ハワイでは特定の日焼け止め（オキシベンゾン・オクチノキサート含有）の販売が禁止。珊瑚礁を傷つけるため。リーフセーフの日焼け止めを使用。",en:"Hawaii has banned sunscreens containing oxybenzone/octinoxate as they harm coral reefs. Use reef-safe sunscreen products."}},
      {icon:"🏄",level:"low",title:{ja:"サーフィンエリアのルール",en:"Surfing area rules"},desc:{ja:"ハワイの有名サーフポイント（ノースショア等）はローカルサーファーが優先。初心者は適切なビーチ・スクールで練習。",en:"Famous Hawaii surf spots (North Shore etc.) have local surfer priority. Beginners should practice at appropriate beaches or take lessons."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"ハワイはアメリカ本土同様のチップ文化。レストランは18〜22%、ホテルのハウスキーピングには$1〜5/日、観光ガイドには$10〜20程度。",en:"Hawaii follows mainland US tipping culture. Restaurant: 18-22%. Hotel housekeeping: $1-5/day. Tour guides: $10-20."}},
      {icon:"🚗",level:"low",title:{ja:"レンタカーのルール",en:"Rental car tips"},desc:{ja:"マウイ・ハワイ島等は公共交通が少なくレンタカーが便利。ハワイの道路は右側通行。駐車違反の罰金は高額。",en:"Maui, Big Island etc. have limited public transport; rental cars are convenient. Hawaii drives on the right. Parking violation fines are high."}},
      {icon:"🌺",level:"low",title:{ja:"ルアウ・ショーの料金",en:"Luau show pricing"},desc:{ja:"ワイキキのルアウショーは$100〜200/人程度。予約は公式サイトから。街頭でのチケット販売は高額・偽物リスクあり。",en:"Waikiki luau shows cost ~$100-200/person. Book via official sites. Street ticket sellers may overcharge or sell fakes."}},
    ],
  },

  グアム: {
    _default: [
      {icon:"🌊",level:"high",title:{ja:"ビーチの離岸流",en:"Beach rip currents"},desc:{ja:"グアムのビーチは美しいが離岸流が強いエリアあり。旗表示・標識の確認必須。ライフガードのいるビーチのみで遊泳推奨。",en:"Guam beaches are beautiful but some have strong rip currents. Check flag warnings and signs. Swim only at lifeguarded beaches."}},
      {icon:"🤿",level:"med",title:{ja:"ダイビング・シュノーケルの安全",en:"Diving and snorkeling safety"},desc:{ja:"ダイビング・シュノーケルは認定業者のみ利用。潜水病（減圧症）のリスクあり。ツアー後24時間以内の飛行機搭乗は避ける。",en:"Use only certified operators for diving/snorkeling. Risk of decompression sickness. Avoid flying within 24 hours after diving."}},
      {icon:"🚗",level:"med",title:{ja:"レンタカーは必須",en:"Rental car is essential"},desc:{ja:"グアムは公共交通が発達していないためレンタカーが必須。右側通行。国際免許証が必要。飲酒運転の罰則は厳しい。",en:"Public transport is limited in Guam; rental car is essential. Right-side driving. International license required. DUI penalties are strict."}},
      {icon:"🛍️",level:"med",title:{ja:"DFSギャラリア・アウトレットの価格",en:"DFS Galleria and outlet pricing"},desc:{ja:"グアムのDFS・プレミアムアウトレットは必ずしも日本より安くない。円安時は特に注意。価格比較してから購入を。",en:"DFS Galleria and Premium Outlets in Guam are not always cheaper than Japan, especially with weak yen. Compare prices before purchasing."}},
      {icon:"☀️",level:"low",title:{ja:"熱中症・紫外線",en:"Heat and UV"},desc:{ja:"グアムは年中高温多湿。紫外線も強い。SPF50+日焼け止め必携。水分補給を怠らない。",en:"Guam is hot and humid year-round. UV is strong. SPF50+ sunscreen essential. Stay hydrated."}},
      {icon:"🌀",level:"low",title:{ja:"台風シーズン",en:"Typhoon season"},desc:{ja:"グアムの台風シーズンは6〜12月。渡航前にWeather.govで気象情報確認。台風警戒令が出たらホテルの指示に従う。",en:"Guam's typhoon season is June-December. Check weather.gov before travel. Follow hotel instructions if typhoon warnings are issued."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"グアムはアメリカ領土のためチップ文化あり。レストランは18〜22%、ホテルのポーターには$1〜2/個が相場。",en:"Guam follows US tipping culture. Restaurant: 18-22%. Hotel porters: $1-2/bag is standard."}},
      {icon:"🐠",level:"low",title:{ja:"海洋生物への接触禁止",en:"Do not touch marine life"},desc:{ja:"珊瑚礁・海洋生物への接触は禁止。リーフセーフの日焼け止めを使用。ウミヘビ等の危険生物に近づかない。",en:"Do not touch coral reefs or marine life. Use reef-safe sunscreen. Stay away from sea snakes and other dangerous marine creatures."}},
      {icon:"🏬",level:"low",title:{ja:"タモンのお土産価格",en:"Tumon souvenir pricing"},desc:{ja:"タモン地区のホテル内ショップ・空港は割高。同じ商品でもK-マート・ペイレス等のスーパーの方が安い場合あり。",en:"Hotel shops and airport in Tumon are overpriced. Same items often cheaper at K-mart, Pay Less, and other local supermarkets."}},
      {icon:"🛕",level:"low",title:{ja:"チャモロ文化の尊重",en:"Respect Chamorro culture"},desc:{ja:"チャモロ族はグアムの先住民族。文化・伝統・遺跡を尊重すること。許可なく遺跡に触れることは禁止。",en:"The Chamorro people are Guam's indigenous inhabitants. Respect their culture, traditions, and historical sites. Do not touch sites without permission."}},
    ],
  },

  イタリア: {
    _default: [
      {icon:"🎒",level:"high",title:{ja:"スリ・ひったくり",en:"Pickpocketing and bag snatching"},desc:{ja:"ローマ・フィレンツェ・ヴェネツィアでのスリが多発。電車・バス・観光地で特に注意。リュックは前に、財布はズボンの前ポケットへ。",en:"Pickpocketing is rampant in Rome, Florence, and Venice, especially on public transport. Keep backpacks in front; wallets in front pockets."}},
      {icon:"🍕",level:"high",title:{ja:"観光地レストランの過剰請求",en:"Tourist restaurant overcharging"},desc:{ja:"コロッセオ・トレビの泉・バチカン周辺のレストランは観光客向け価格が多い。席に着く前にメニューと全料金を確認。「コペルト（席料）」が別途加算されることが多い。",en:"Restaurants near Colosseum/Trevi/Vatican overcharge tourists. Check menu and total before sitting. 'Coperto' (cover charge) is frequently added."}},
      {icon:"🌹",level:"high",title:{ja:"花売り・写真撮影の強要",en:"Forced flower/photo sales"},desc:{ja:"ローマ・フィレンツェの観光地で花やブレスレットを強制的に渡し、後から高額請求する手口。受け取らなければ問題なし。",en:"Flowers/bracelets forcefully given then high prices demanded in Rome/Florence tourist areas. Simply don't accept anything."}},
      {icon:"🚕",level:"med",title:{ja:"タクシーの白タク・過剰請求",en:"Unlicensed taxis and overcharging"},desc:{ja:"ローマの空港・駅周辺で白タクに注意。公式の白黒ツートンのローマ市タクシーのみ乗車。フィウミチーノ空港〜市内固定48ユーロ。",en:"Unlicensed taxis operate near Rome's airport/stations. Use only official white-and-black Rome taxis. Fixed fare from Fiumicino Airport to city center: €48."}},
      {icon:"🏛️",level:"med",title:{ja:"偽ガイド・偽チケット",en:"Fake guides and tickets"},desc:{ja:"コロッセオ・バチカン周辺の偽ガイドに注意。公式チケットは事前オンライン購入が安全（行列回避にもなる）。",en:"Fake guides operate near Colosseum/Vatican. Buy official tickets online in advance (also skips lines)."}},
      {icon:"🚿",level:"med",title:{ja:"カフェ・バールのルール",en:"Café and bar customs"},desc:{ja:"イタリアのバールでは立って飲むとテーブル席より安い（2〜3倍の差あり）。テーブルに座ると「カフェテーブルチャージ」が加算される。",en:"In Italian bars, standing at the counter is cheaper than sitting (can be 2-3x difference). Sitting at a table adds 'café table charges'."}},
      {icon:"🚂",level:"low",title:{ja:"電車でのスリ",en:"Train pickpocketing"},desc:{ja:"ローマ〜フィレンツェ〜ヴェネツィア間の電車でのスリ被害多発。荷物は網棚に置かず、貴重品は体に密着。",en:"Pickpocketing is frequent on trains between Rome, Florence, and Venice. Don't leave luggage on overhead racks. Keep valuables close to your body."}},
      {icon:"🛍️",level:"low",title:{ja:"免税（Tax-Free）手続き",en:"VAT refund procedures"},desc:{ja:"EUのVAT（イタリアは22%）は非EU居住者が対象店舗で所定額以上購入すれば還付可能。購入時に「Tax Refund」を申し出る。",en:"EU VAT (Italy 22%) can be refunded for non-EU residents at qualified stores above minimum purchase. Request 'Tax Refund' when buying."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"イタリアは基本チップ不要。レストランでサービスに満足した場合、5〜10%程度が慣例。",en:"Tipping not required in Italy. 5-10% for good restaurant service is customary."}},
      {icon:"🏖️",level:"low",title:{ja:"プライベートビーチの料金",en:"Private beach charges"},desc:{ja:"イタリアの多くのビーチはプライベート管理で、パラソル・デッキチェアの使用に1日10〜30ユーロかかる。無料の公共ビーチも存在する。",en:"Many Italian beaches are privately managed. Parasols and deckchairs cost €10-30/day. Free public beach sections also exist."}},
    ],
    ローマ: [
      {icon:"🌹",level:"high",title:{ja:"トレビの泉周辺の強要詐欺",en:"Trevi Fountain forced sales"},desc:{ja:"トレビの泉・スペイン広場周辺で花・ブレスレット等を強引に渡し高額請求する手口が非常に多い。何も受け取らない、という姿勢を貫く。",en:"Forced flowers, bracelets, and other items near Trevi Fountain and Spanish Steps followed by high demands are extremely common. Firmly refuse all unsolicited items."}},
      {icon:"🚌",level:"high",title:{ja:"スリ頻発バス路線（64番）",en:"High pickpocket risk bus 64"},desc:{ja:"ローマの64番バス（テルミニ駅〜バチカン）はスリが世界的に有名。できれば地下鉄か認定タクシーを使用。",en:"Rome Bus 64 (Termini Station to Vatican) is world-famous for pickpockets. Use the metro or authorized taxis instead where possible."}},
      {icon:"🏛️",level:"high",title:{ja:"コロッセオ偽チケット・偽ガイド",en:"Colosseum fake tickets/guides"},desc:{ja:"コロッセオ周辺の偽チケット業者・偽ガイドは毎年数多くの被害を出す。公式サイト（coopculture.it）での事前予約が唯一の安全な方法。",en:"Fake ticket sellers and guides near the Colosseum cause many victims every year. Advance booking at official site (coopculture.it) is the only safe method."}},
      {icon:"🚕",level:"med",title:{ja:"フィウミチーノ空港のタクシー",en:"Fiumicino Airport taxis"},desc:{ja:"フィウミチーノ空港〜ローマ市内は固定料金48ユーロ（公式白黒タクシーのみ）。声をかけてくる運転手は白タクの可能性大。",en:"Fiumicino Airport to Rome city center: fixed €48 (official white-and-black taxis only). Drivers approaching you are likely unlicensed."}},
      {icon:"🍦",level:"low",title:{ja:"ジェラートの価格確認",en:"Gelato price checking"},desc:{ja:"ローマの観光地のジェラートはスクープ当たり3〜6ユーロが相場。座れる場所があるカフェ式は価格が2倍以上になる場合あり。",en:"Gelato in Rome tourist areas: €3-6 per scoop. Café-style with seating may cost 2x+ more. Check prices before ordering."}},
    ],
  },

  フランス: {
    _default: [
      {icon:"🎒",level:"high",title:{ja:"パリのスリ・ひったくり",en:"Paris pickpocketing and bag snatching"},desc:{ja:"パリはヨーロッパ屈指のスリ多発都市。エッフェル塔・ルーブル・地下鉄で特に多い。リュックは前に持ち、スマートフォンを安易に取り出さない。",en:"Paris is one of Europe's top pickpocketing cities. Especially at Eiffel Tower, Louvre, and on the metro. Keep backpacks in front; don't casually take out smartphones."}},
      {icon:"📋",level:"high",title:{ja:"署名詐欺",en:"Petition signing scam"},desc:{ja:"観光地で「聴覚障害者支援の署名を」と近づいてくる詐欺が多発（実際は財布を狙う）。署名・寄付は断ってOK。",en:"'Sign this petition for deaf people' scams are common at tourist sites (actually distraction for wallet theft). Refuse all signatures and donations."}},
      {icon:"🌹",level:"high",title:{ja:"花売り・リストバンド強要",en:"Forced flowers/friendship bracelets"},desc:{ja:"エッフェル塔周辺で花やリストバンドを強制的に渡し高額請求する手口が有名。受け取らなければ問題なし。",en:"Forced flowers and friendship bracelets near Eiffel Tower followed by high demands are notorious. Simply refuse to accept anything."}},
      {icon:"🚕",level:"med",title:{ja:"空港タクシーの料金",en:"Airport taxi fares"},desc:{ja:"パリのCDG空港〜市内の正規タクシー料金は固定：左岸53ユーロ、右岸56ユーロ。RERやエアポートバスが安価。",en:"Official Paris CDG Airport taxis have fixed fares: Left Bank €53, Right Bank €56. RER or airport bus is cheaper."}},
      {icon:"🍷",level:"med",title:{ja:"観光地レストランの価格",en:"Tourist restaurant pricing"},desc:{ja:"エッフェル塔・シャンゼリゼ周辺のレストランは割高。サンジェルマン・モンマルトルの裏通りの地元レストランが安くて美味しい。",en:"Restaurants near Eiffel Tower/Champs-Élysées are overpriced. Local restaurants in side streets of Saint-Germain or Montmartre are better value."}},
      {icon:"🎡",level:"low",title:{ja:"フリーアトラクションの確認",en:"Free attractions check"},desc:{ja:"ルーブル・オルセー等の国立美術館は毎月第1日曜日無料。事前に無料入場条件を確認。",en:"National museums like Louvre/Orsay are free on first Sunday of each month. Always check free admission conditions in advance."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"フランスはサービス料がメニュー価格に含まれている。追加チップは任意で5〜10%が慣例。",en:"Service charge is included in French menu prices. Additional tipping is optional; 5-10% is customary."}},
      {icon:"🛍️",level:"low",title:{ja:"免税(détaxe)手続き",en:"VAT refund (détaxe) procedures"},desc:{ja:"フランスのVATは20%。1店舗175ユーロ以上でDetaxe申請可能。出国時に税関(PABLO)でスタンプが必要。",en:"French VAT is 20%. Détaxe available for purchases over €175 per store. PABLO customs stamp required at departure."}},
      {icon:"🚇",level:"low",title:{ja:"パリ地下鉄でのルール",en:"Paris Metro rules"},desc:{ja:"パリのメトロは無記名カルネ（10枚綴り）が割安。Navigo定期券も旅行者向けあり。改札外での助走は厳禁（罰金あり）。",en:"Paris Metro carnets (10 tickets) offer discounts. Navigo passes also available for visitors. Jumping turnstiles is illegal with fines."}},
      {icon:"🏥",level:"low",title:{ja:"医療・旅行保険",en:"Medical care and travel insurance"},desc:{ja:"フランスの医療費は高額。旅行保険（医療補償付き）への加入を強く推奨。",en:"Medical costs in France are high. Travel insurance with medical coverage strongly recommended."}},
    ],
    パリ: [
      {icon:"🗼",level:"high",title:{ja:"エッフェル塔周辺の詐欺師集中",en:"Eiffel Tower area scammer concentration"},desc:{ja:"エッフェル塔周辺は世界で最もスリ・詐欺師が多い場所の一つ。グループでの接触（特にリストバンド詐欺）に注意。貴重品はホテルに置く。",en:"Eiffel Tower area is one of the world's highest concentrations of pickpockets and scammers. Beware group approaches (especially friendship bracelet scams). Leave valuables at hotel."}},
      {icon:"📋",level:"high",title:{ja:"ルーブル周辺の署名詐欺",en:"Petition scam near Louvre"},desc:{ja:"ルーブル美術館周辺で紙にサインを求め、後から現金を要求する「請願書詐欺」が多発。何も書かない・署名しない。",en:"'Petition' scams demanding cash after signing are common near the Louvre. Don't write or sign anything from strangers."}},
      {icon:"🚇",level:"med",title:{ja:"地下鉄でのスリ",en:"Metro pickpocketing"},desc:{ja:"パリの地下鉄（特に1番線・RER B線）でのスリが多発。混雑した車両ではリュックを前に持ち、スマートフォンをポケットに。",en:"Pickpocketing is very common on Paris Metro (especially Line 1 and RER B). In crowded cars, keep backpack in front and phone in pocket."}},
      {icon:"🍽️",level:"med",title:{ja:"モンマルトル・観光地レストランの価格",en:"Montmartre/tourist area restaurant prices"},desc:{ja:"サクレクール大聖堂周辺等の観光地レストランは割高。1〜2ブロック離れた地元向け飲食店が安くて美味しい。",en:"Restaurants near Sacré-Cœur and tourist areas are tourist-priced. Move 1-2 blocks away for much better value at local restaurants."}},
      {icon:"🛍️",level:"low",title:{ja:"フランスの消費税還付（詳細）",en:"France VAT refund details"},desc:{ja:"パリのショッピングで175ユーロ以上の会計ならDetaxe申請可。免税対応店に「Tax-Free Shopping」のシールが貼ってある。CDG空港のPABLO機で電子処理。",en:"Spend €175+ at Paris stores with 'Tax-Free Shopping' sign to claim Détaxe. Electronic processing via PABLO machines at CDG Airport."}},
    ],
  },


  ドイツ: {
    _default: [
      {icon:"🎒",level:"med",title:{ja:"スリ対策",en:"Pickpocket prevention"},desc:{ja:"ベルリン・ミュンヘンの観光地・公共交通でスリ被害の報告あり。財布はズボン前ポケット、リュックは前に持つ。",en:"Pickpocketing reported at tourist sites and on public transport in Berlin/Munich. Keep wallet in front pocket; wear backpack on front."}},
      {icon:"🍺",level:"med",title:{ja:"オクトーバーフェストの注意",en:"Oktoberfest precautions"},desc:{ja:"ミュンヘンのオクトーバーフェストは世界最大のビール祭り（9〜10月）。混雑時のスリ・財布盗難に注意。飲みすぎに注意。",en:"Munich's Oktoberfest (Sep-Oct) is the world's largest beer festival. Watch for pickpockets in crowds. Drink responsibly."}},
      {icon:"🚉",level:"med",title:{ja:"電車でのチケット刻印",en:"Train ticket validation"},desc:{ja:"ドイツの一部交通機関では乗車前に切符を刻印（validate）する必要あり。刻印なしは無賃乗車として罰金60ユーロ。",en:"Some German transit requires validating your ticket before boarding. Unvalidated ticket = fine of €60."}},
      {icon:"🏧",level:"low",title:{ja:"現金文化",en:"Cash culture"},desc:{ja:"ドイツは意外と現金文化が残っている。カードが使えないレストラン・店舗も多い。旅行中は現金も常に用意。",en:"Germany surprisingly still has strong cash culture. Many restaurants and shops don't accept cards. Always carry some cash."}},
      {icon:"🚲",level:"low",title:{ja:"自転車レーン",en:"Bicycle lanes"},desc:{ja:"ドイツの自転車レーンは歩行者も入れないことが多く、入ると罰金になる場合あり。地面の表示・標識を確認。",en:"German bicycle lanes are often prohibited for pedestrians. Walking in them may result in fines. Check ground markings and signs."}},
      {icon:"🛕",level:"low",title:{ja:"日曜日の閉店",en:"Sunday closing laws"},desc:{ja:"ドイツは多くの店舗が日曜日に閉店。スーパー・薬局も基本閉店。日曜日の食料・日用品は事前に土曜日までに購入を。",en:"Most German shops close on Sundays, including supermarkets and pharmacies. Buy groceries and essentials by Saturday."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"ドイツはチップが慣例。レストランで5〜10%が相場。「Stimmt so（ズティムト・ゾー）」と言うとおつりなしの意味。",en:"Tipping is customary in Germany. 5-10% at restaurants is standard. Saying 'Stimmt so' means 'keep the change'."}},
      {icon:"🌡️",level:"low",title:{ja:"冬の寒さ",en:"Winter cold"},desc:{ja:"ドイツの冬（12〜2月）は気温がマイナスになることも。防寒着・手袋・帽子が必須。",en:"German winters (Dec-Feb) can drop below freezing. Warm coat, gloves, and hat are essential."}},
      {icon:"🏰",level:"low",title:{ja:"ノイシュバンシュタイン城の予約",en:"Neuschwanstein Castle reservations"},desc:{ja:"ノイシュバンシュタイン城はオンライン事前予約が強く推奨（夏季は当日券なしの場合あり）。周辺の非公式ガイドに注意。",en:"Online advance booking strongly recommended for Neuschwanstein Castle (summer tickets may sell out). Beware unofficial guides nearby."}},
      {icon:"🍻",level:"low",title:{ja:"公共の場での飲酒",en:"Public drinking"},desc:{ja:"ドイツは公共の場での飲酒が法律上認められている場所が多い。ただし公共交通機関内では禁止の場合あり。標識を確認。",en:"Public drinking is legally allowed in many German public places. However, it may be banned on public transport. Check signs."}},
    ],
  },
  イギリス: {
    _default: [
      {icon:"🎒",level:"high",title:{ja:"ロンドンのスリ・ひったくり",en:"London pickpocketing and bag snatching"},desc:{ja:"ロンドンはヨーロッパ有数のスリ多発都市。地下鉄・観光地・マーケット等で特に多発。バッグは前に持ち、スマートフォンを路上で使用しない。",en:"London is one of Europe's top pickpocketing cities. Especially on the Underground and at tourist sites. Keep bags in front; don't use smartphones on streets."}},
      {icon:"🚖",level:"high",title:{ja:"偽タクシー（ミニキャブ）",en:"Fake taxis (minicabs)"},desc:{ja:"公認の黒いタクシー（ブラックキャブ）以外の路上停車のタクシーには乗らない。Uber・Boltアプリか公式黒タクシーのみ利用。",en:"Never get into unlicensed minicabs stopping on streets. Use only official black cabs, Uber, or Bolt app for safety."}},
      {icon:"🍺",level:"med",title:{ja:"バーでのドリンク窃盗",en:"Drink theft at bars"},desc:{ja:"ロンドンのバーで飲み物から目を離すと飲まれる・薬物混入のリスクあり。知らない人から受け取らない。",en:"In London bars, leaving drinks unattended risks theft or spiking. Never accept drinks from strangers."}},
      {icon:"🚇",level:"med",title:{ja:"地下鉄・電車でのスリ",en:"Underground/train pickpocketing"},desc:{ja:"ロンドン地下鉄（特にセントラルライン・ピカデリーライン）でのスリに注意。混雑時は特に財布・スマートフォンの管理を徹底。",en:"Pickpocketing is very common on London Underground (esp. Central/Piccadilly lines). Be extra vigilant in crowds."}},
      {icon:"☔",level:"low",title:{ja:"天気と準備",en:"Weather preparation"},desc:{ja:"イギリスの天気は変わりやすい。折り畳み傘・防水ジャケットは必携。夏でも急な寒さあり。",en:"British weather is unpredictable. Always carry a foldable umbrella and a waterproof jacket. Even summer can be suddenly cold."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"イギリスはレストランで10〜15%のチップが慣例。サービス料が既に含まれている場合もあるためメニューを確認。",en:"10-15% tipping at restaurants is customary in the UK. Check menu to see if service charge is already included."}},
      {icon:"🏰",level:"low",title:{ja:"バッキンガム宮殿の見学",en:"Buckingham Palace visits"},desc:{ja:"バッキンガム宮殿の衛兵交替は無料で見学可能。夏季の宮殿内部見学は有料（事前予約推奨）。周辺の偽チケット販売に注意。",en:"Buckingham Palace changing of guard is free. Summer interior tours are paid (advance booking recommended). Beware fake ticket sellers nearby."}},
      {icon:"🛍️",level:"low",title:{ja:"VAT Refund廃止",en:"VAT Refund abolition"},desc:{ja:"ブレグジット後、英国でのVAT還付制度は廃止（2021年）。日本人旅行者はVAT還付を受けられない。",en:"After Brexit, the UK VAT refund scheme was abolished (2021). Japanese tourists can no longer claim VAT refunds in the UK."}},
      {icon:"🚂",level:"low",title:{ja:"電車の時刻と運賃",en:"Train times and fares"},desc:{ja:"英国の電車は事前予約でAdvance料金が大幅に安い。当日購入はAnytime料金で3〜5倍高くなることも。Trainlineアプリで事前予約推奨。",en:"UK trains offer Advance fares (much cheaper) with advance booking. Walk-up Anytime fares can be 3-5x more. Book in advance on Trainline app."}},
      {icon:"📱",level:"low",title:{ja:"SIMカードの購入",en:"SIM card purchase"},desc:{ja:"英国のSIMカードはEE・O2・Vodafone・Three等。空港・Superdrug・WHSmithで購入可能。データSIMは1ヶ月£10〜15程度。",en:"UK SIM cards from EE, O2, Vodafone, Three available at airports, Superdrug, WHSmith. Data SIMs ~£10-15/month."}},
    ],
  },
  スペイン: {
    _default: [
      {icon:"🎒",level:"high",title:{ja:"バルセロナのスリ",en:"Barcelona pickpocketing"},desc:{ja:"バルセロナはヨーロッパ最大のスリ多発都市の一つ。ランブラス通り・サグラダファミリア・地下鉄で特に多い。フロントにバッグ、財布は前ポケット。",en:"Barcelona is one of Europe's top pickpocketing cities. Especially on La Rambla, near Sagrada Família, and on the metro. Front bag, front pocket wallet."}},
      {icon:"🌹",level:"high",title:{ja:"花売り・強引物乞い",en:"Forced flower sellers and aggressive beggars"},desc:{ja:"ランブラス通りで花を強引に渡してから高額請求する手口が有名。受け取らなければ問題なし。",en:"Forced flowers on La Rambla followed by high demands is a notorious scam. Simply don't accept anything."}},
      {icon:"🍴",level:"med",title:{ja:"観光地レストランの価格",en:"Tourist restaurant pricing"},desc:{ja:"ガウディ建築周辺・ランブラス通りのレストランは割高。1ブロック裏の地元向け飲食店の方が安くて美味しい。",en:"Restaurants near Gaudí sites and La Rambla are overpriced. Move one block back for much better value at local-focused places."}},
      {icon:"🚕",level:"med",title:{ja:"偽タクシー・料金確認",en:"Fake taxis and fare checking"},desc:{ja:"バルセロナ・マドリードの空港周辺で白タクに注意。公式タクシー（黒と黄色）のみ乗車。バルセロナ空港〜市内固定料金約40ユーロ。",en:"Unlicensed taxis operate near Barcelona/Madrid airports. Use only official taxis (black and yellow). Barcelona Airport to city: fixed ~€40."}},
      {icon:"🏖️",level:"low",title:{ja:"ビーチのスリ",en:"Beach pickpocketing"},desc:{ja:"ビーチでの荷物スリに注意。海に入る間は貴重品を置いていかない。ビーチロッカーの使用を推奨。",en:"Beach pickpocketing is common. Never leave valuables unattended while swimming. Use beach lockers where available."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"スペインはチップが慣例。レストランで5〜10%、バーでは小銭程度が相場。",en:"Tipping is customary in Spain. 5-10% at restaurants, small change at bars is standard."}},
      {icon:"⏰",level:"low",title:{ja:"スペインの生活リズム",en:"Spanish daily schedule"},desc:{ja:"スペインのランチは14〜16時、ディナーは21〜23時が一般的。シエスタ中（14〜17時頃）は閉まる店も多い。",en:"Spanish lunch is 2-4pm; dinner 9-11pm. Many shops close during siesta (roughly 2-5pm)."}},
      {icon:"🌡️",level:"low",title:{ja:"夏の猛暑",en:"Summer heat"},desc:{ja:"スペインの夏（6〜8月）は40℃を超えることも。水分補給・日陰での休憩を心がける。",en:"Spanish summers (Jun-Aug) can exceed 40°C. Stay hydrated and rest in shade regularly."}},
      {icon:"🛍️",level:"low",title:{ja:"免税手続き",en:"Tax refund procedures"},desc:{ja:"スペインのVAT（21%）は在EU非居住者（日本人等）は90ユーロ以上で還付申請可能。",en:"Spanish VAT (21%): non-EU residents (e.g. Japanese) can apply for refunds on purchases over €90."}},
      {icon:"🚂",level:"low",title:{ja:"高速鉄道AVEの活用",en:"High-speed AVE train tips"},desc:{ja:"スペインのAVE（高速鉄道）はマドリード〜バルセロナ間を約2時間30分。事前予約でお得な料金あり。",en:"Spain's AVE high-speed rail connects Madrid-Barcelona in ~2.5 hours. Advance booking offers good deals."}},
    ],
  },
  ギリシャ: {
    _default: [
      {icon:"🍽️",level:"high",title:{ja:"観光地レストランのぼったくり",en:"Tourist restaurant overcharging"},desc:{ja:"アクロポリス・サントリーニ・ミコノスの観光客向けレストランは非常に高額。メニューに価格がない場合は座らない。魚は重量で価格が変わるため必ず事前確認。",en:"Tourist restaurants near Acropolis/Santorini/Mykonos are extremely expensive. Never sit if no prices on menu. Fish is priced by weight; always confirm total price first."}},
      {icon:"🚕",level:"high",title:{ja:"タクシーの不正メーター",en:"Taxi meter fraud"},desc:{ja:"アテネのタクシーで不正メーター（深夜割増を昼間に適用等）の報告あり。乗車時にメーターが「1」(昼間)または「2」(深夜)になっているか確認。",en:"Athens taxi meter fraud reported. Check meter shows '1' (day) or '2' (night/airport) when boarding."}},
      {icon:"💎",level:"med",title:{ja:"宝石・土産品の過剰請求",en:"Jewelry/souvenir overcharging"},desc:{ja:"サントリーニ・ミコノス等リゾートアイランドの土産物店は観光客向け価格。複数店舗で価格比較を推奨。",en:"Souvenir shops on resort islands like Santorini/Mykonos charge tourist prices. Compare prices at multiple stores before buying."}},
      {icon:"🏍️",level:"med",title:{ja:"ATVレンタルの危険",en:"ATV rental hazards"},desc:{ja:"サントリーニ・ミコノス等でのATV（四輪バイク）は事故が多発。医療保険の確認必須。",en:"ATV accidents are frequent in Santorini/Mykonos. Verify medical insurance coverage before renting."}},
      {icon:"🌊",level:"med",title:{ja:"海の危険",en:"Ocean hazards"},desc:{ja:"ギリシャの海はウニが多く岩場での素足歩行は危険。一部ビーチは離岸流あり。ライフガードのいるビーチを選ぶ。",en:"Sea urchins are common in Greek waters; barefoot walking on rocks is dangerous. Some beaches have rip currents."}},
      {icon:"⛽",level:"low",title:{ja:"島間の移動フェリー",en:"Inter-island ferry travel"},desc:{ja:"ギリシャの島間フェリーは天候により欠航・遅延が多い。予定に余裕を持たせる。公認会社（Blue Star Ferries等）のみ利用。",en:"Greek island ferries are frequently cancelled or delayed due to weather. Build extra time into itinerary. Use certified companies only."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"ギリシャはチップが慣例。レストランで10%程度が相場。",en:"Tipping is customary in Greece. ~10% at restaurants is standard."}},
      {icon:"🌡️",level:"low",title:{ja:"夏の猛暑",en:"Summer heat"},desc:{ja:"ギリシャの夏（7〜8月）は40℃を超えることも。観光は早朝・夕方に。水分補給・日焼け止め必須。",en:"Greek summers (Jul-Aug) can exceed 40°C. Plan sightseeing for early morning or late afternoon."}},
      {icon:"🚶",level:"low",title:{ja:"アクロポリスの混雑と靴",en:"Acropolis crowds and footwear"},desc:{ja:"アクロポリスは夏季に極めて混雑。開館直後（8時）が比較的空いている。石畳は滑りやすいため運動靴推奨。",en:"Acropolis is extremely crowded in summer. Opening time (8am) is relatively quiet. Wear athletic shoes on slippery cobblestones."}},
      {icon:"🏛️",level:"low",title:{ja:"偽考古学品詐欺",en:"Fake archaeological items scams"},desc:{ja:"「本物のギリシャ古代遺物」の販売は違法。古代遺物の持ち出しは厳禁。",en:"Selling 'real Greek ancient artifacts' is illegal. Exporting ancient artifacts is strictly prohibited."}},
    ],
  },
  オランダ: {
    _default: [
      {icon:"🚲",level:"high",title:{ja:"自転車との衝突",en:"Bicycle collision hazards"},desc:{ja:"アムステルダムの自転車レーンは歩行者と明確に分かれている。自転車レーンに踏み入ると高速自転車と衝突する危険。赤いアスファルトが自転車レーン。",en:"Amsterdam bicycle lanes are strictly separate from pedestrian areas. Stepping into them risks collision with fast cyclists. Red asphalt = bicycle lane."}},
      {icon:"💊",level:"high",title:{ja:"大麻・ドラッグの扱い",en:"Cannabis and drug policies"},desc:{ja:"オランダでは認可コーヒーショップでの大麻購入・使用は黙認されているが公共の場での喫煙は禁止。路上での購入は違法。",en:"Cannabis in licensed coffee shops is tolerated, but smoking in public is prohibited. Street purchase is illegal."}},
      {icon:"🎒",level:"med",title:{ja:"スリ・自転車盗難",en:"Pickpockets and bike theft"},desc:{ja:"アムステルダムの観光地（ダム広場・赤線地帯）でスリ多発。レンタル自転車の盗難も多い。二重ロックで施錠推奨。",en:"Pickpocketing is common near Dam Square and the Red Light District. Rental bike theft is also frequent. Use double locks."}},
      {icon:"🌷",level:"med",title:{ja:"チューリップ球根の持ち出し",en:"Tulip bulb export restrictions"},desc:{ja:"チューリップ球根は植物検疫が必要。未処理の球根の持ち帰りは日本の植物検疫で没収される場合あり。検疫証明書付きの商品を購入。",en:"Tulip bulbs require phytosanitary certificates. Untreated bulbs may be confiscated at Japanese customs. Buy products with phytosanitary certificates."}},
      {icon:"⚖️",level:"low",title:{ja:"赤線地帯のルール",en:"Red Light District rules"},desc:{ja:"赤線地帯（デ・ワレン）での撮影は禁止。性産業従事者の撮影は厳禁で罰金あり。ガイドツアーの参加が安全。",en:"Photography in the Red Light District (De Wallen) is prohibited. Photographing sex workers is strictly banned with fines."}},
      {icon:"🏨",level:"low",title:{ja:"アムステルダムの観光税",en:"Amsterdam tourist tax"},desc:{ja:"アムステルダムは宿泊税（ホテル代の12.5%）が課税される。予約時の表示価格と実際の支払いが異なることあり。",en:"Amsterdam charges tourist tax (12.5% of hotel rate). Actual payment may differ from displayed booking price."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"オランダはチップが任意。レストランで5〜10%が慣例。",en:"Tipping is optional in the Netherlands. 5-10% at restaurants is customary."}},
      {icon:"🏘️",level:"low",title:{ja:"運河周辺の注意",en:"Canal area caution"},desc:{ja:"アムステルダムの運河は柵が少なく夜間の転落事故が毎年発生。深夜の運河沿いでの飲酒・徒歩には注意。",en:"Amsterdam canals have few barriers; people fall in every year. Be careful when walking along canals at night."}},
      {icon:"🚂",level:"low",title:{ja:"NSトレインの活用",en:"NS train tips"},desc:{ja:"オランダの鉄道（NS）はOVチップカードが便利。紙の切符はホームで買うと割高（1.5ユーロの追加料金）。",en:"Dutch railways (NS): OV-chipkaart is most convenient. Paper tickets bought at platforms cost extra (€1.50 surcharge)."}},
      {icon:"⛅",level:"low",title:{ja:"天気と防水準備",en:"Weather and waterproof gear"},desc:{ja:"オランダは年中雨が多く風が強い。折り畳み傘より防水ジャケットが実用的。",en:"Netherlands has frequent rain and strong winds year-round. Waterproof jacket is more practical than umbrella."}},
    ],
  },
  オーストリア: {
    _default: [
      {icon:"🎭",level:"med",title:{ja:"観光地チケット詐欺",en:"Tourist attraction ticket scams"},desc:{ja:"ウィーンのシュテファン大聖堂・シェーンブルン宮殿周辺で偽チケット業者に注意。公式窓口・公式サイトでのみ購入。",en:"Beware fake ticket sellers near Vienna's St. Stephen's Cathedral and Schönbrunn Palace. Buy only at official counters or websites."}},
      {icon:"🎻",level:"med",title:{ja:"路上クラシックコンサート詐欺",en:"Street classical concert venue scams"},desc:{ja:"ウィーンの街角で「特別クラシックコンサート」の格安チケットを勧誘し、実際は割高な会場へ。正規の演奏会はウィーン国立歌劇場等の公式チャンネルで購入。",en:"Street ticket sellers in Vienna offer 'special classical concerts' that turn out overpriced. Buy opera/concert tickets only from official venues."}},
      {icon:"🚕",level:"low",title:{ja:"タクシーの事前料金確認",en:"Pre-confirm taxi fares"},desc:{ja:"ウィーンのタクシーはFunk TaxiかWienMobil・Uberアプリが安全。空港〜市内は約40〜50ユーロ。",en:"Vienna taxis: use Funk Taxi or WienMobil/Uber app for safety. Airport to city center: ~€40-50."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"オーストリアはチップが慣例。レストランで5〜10%、カフェではコーヒー代に50セント〜1ユーロが相場。",en:"Tipping is customary in Austria. 5-10% at restaurants; 50 cents to €1 extra for coffee is standard."}},
      {icon:"⛷️",level:"low",title:{ja:"スキー保険",en:"Ski insurance"},desc:{ja:"スキー・スノーボードは転倒・衝突事故のリスクあり。旅行保険のウィンタースポーツ特約への加入を強く推奨。救助ヘリの費用は非常に高額。",en:"Skiing/snowboarding carries collision and fall risks. Travel insurance with winter sports coverage strongly recommended. Rescue helicopter costs are extremely high."}},
      {icon:"🏔️",level:"low",title:{ja:"山岳観光の安全",en:"Mountain tourism safety"},desc:{ja:"ハルシュタット・チロル等の山岳観光は天候変化に注意。適切な装備・登山靴が必須。",en:"Mountain tourism at Hallstatt/Tyrol requires awareness of rapid weather changes. Proper equipment and hiking boots essential."}},
      {icon:"🌡️",level:"low",title:{ja:"冬の寒さと雪",en:"Winter cold and snow"},desc:{ja:"オーストリアの冬（12〜2月）は非常に寒く雪が多い。防寒着・防滑靴が必須。",en:"Austrian winters (Dec-Feb) are very cold with heavy snow. Warm clothing and non-slip footwear are essential."}},
      {icon:"🎆",level:"low",title:{ja:"ウィーン大晦日の混雑",en:"Vienna New Year's Eve crowds"},desc:{ja:"ウィーンの大晦日（シルベスター）はリンクシュトラーセ沿いに数十万人が集まる。スリに注意し、貴重品は最小限に。",en:"Vienna's New Year's Eve (Silvester) draws hundreds of thousands to the Ringstrasse. Watch for pickpockets; carry minimal valuables."}},
      {icon:"📸",level:"low",title:{ja:"ハルシュタットの観光マナー",en:"Hallstatt tourism etiquette"},desc:{ja:"ハルシュタットは世界遺産の小村。住宅への無断撮影は禁止。住民のプライバシーを尊重し、早朝・夕方の訪問で混雑を避ける。",en:"Hallstatt is a World Heritage small village. Unauthorized photography of private homes is prohibited. Visit early morning or evening to avoid crowds."}},
      {icon:"🛕",level:"low",title:{ja:"宗教的マナー",en:"Religious etiquette"},desc:{ja:"ウィーンのカトリック大聖堂（シュテファン等）は礼拝中の観光が制限されることあり。露出の多い服装での入場は禁止。",en:"Catholic cathedrals in Vienna may restrict tourist access during services. Revealing clothing is prohibited inside."}},
    ],
  },
  スイス: {
    _default: [
      {icon:"💰",level:"high",title:{ja:"世界最高水準の物価",en:"World's highest cost of living"},desc:{ja:"スイスは世界で最も物価が高い国の一つ。レストランの食事は1人30〜80フラン、コーヒー1杯5〜8フランが普通。事前に予算計画を。",en:"Switzerland is one of the world's most expensive countries. Restaurant meals: CHF 30-80/person. Coffee: CHF 5-8. Plan your budget carefully in advance."}},
      {icon:"🎿",level:"med",title:{ja:"スキー保険・山岳救助",en:"Ski insurance and mountain rescue"},desc:{ja:"スイスのスキー・登山は救助費用が非常に高額。旅行保険のウィンタースポーツ・山岳救助特約は必須。",en:"Swiss skiing/mountaineering: rescue costs are extremely high. Winter sports and mountain rescue insurance is essential."}},
      {icon:"🚂",level:"med",title:{ja:"スイスパスの活用",en:"Swiss Travel Pass usage"},desc:{ja:"スイスの交通費は非常に高い。スイスパス（3日〜）を事前購入すると鉄道・バス・船等が乗り放題で大幅に節約できる。",en:"Swiss transport costs are very high. Swiss Travel Pass (from 3 days) gives unlimited rail/bus/boat access and saves significantly. Buy in advance."}},
      {icon:"🌁",level:"med",title:{ja:"山岳の天候急変",en:"Rapid mountain weather changes"},desc:{ja:"スイスアルプスの天候は急激に変化する。山岳ハイキングは必ず天気予報確認。防水ジャケット・サングラス・日焼け止めを携帯。",en:"Swiss Alpine weather changes rapidly. Always check forecasts before mountain hikes. Carry waterproof jacket, sunglasses, and sunscreen."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"スイスはチップが任意。レストランでサービスに満足した場合、5〜10%程度が慣例。",en:"Tipping is voluntary in Switzerland. 5-10% for good restaurant service is customary."}},
      {icon:"⏱️",level:"low",title:{ja:"時刻厳守",en:"Punctuality is key"},desc:{ja:"スイスでは時刻厳守が文化。電車・バスは秒単位で正確。予約時刻の5分前には必ず到着を。",en:"Punctuality is a Swiss cultural value. Trains and buses are accurate to the second. Arrive at least 5 minutes before scheduled times."}},
      {icon:"🏦",level:"low",title:{ja:"現金とカード",en:"Cash and cards"},desc:{ja:"スイスフランが法定通貨。ユーロは一部で使えるが不利なレートになる場合あり。カード払いは普及しているが現金も必要な場面あり。",en:"Swiss Francs are the legal currency. Euros accepted in some places but at unfavorable rates. Cards widely accepted but cash is sometimes needed."}},
      {icon:"🌿",level:"low",title:{ja:"環境への意識",en:"Environmental awareness"},desc:{ja:"スイスは環境意識が非常に高い。ゴミの分別は厳格（プラスチック・紙・ガラス・金属で分別）。ゴミのポイ捨ては高額罰金。",en:"Switzerland has very high environmental consciousness. Strict waste separation required. Heavy fines for littering."}},
      {icon:"🦅",level:"low",title:{ja:"国立公園のルール",en:"National park rules"},desc:{ja:"スイス国立公園では植物の採集・ペットの持ち込み・キャンプが禁止。厳格なルールに従うこと。",en:"Swiss National Park prohibits plant collecting, pets, and camping. Follow strict rules."}},
      {icon:"🏔️",level:"low",title:{ja:"ツェルマット・インターラーケンの交通",en:"Zermatt/Interlaken transport"},desc:{ja:"ツェルマットは車両進入禁止（電動カートのみ）。インターラーケンはベルン・チューリッヒからの鉄道アクセスが便利。",en:"Zermatt prohibits regular vehicles (electric carts only). Interlaken is conveniently accessed by train from Bern or Zurich."}},
    ],
  },
  フィンランド: {
    _default: [
      {icon:"❄️",level:"high",title:{ja:"厳しい冬の寒さ",en:"Extreme winter cold"},desc:{ja:"フィンランドの冬（11〜3月）は−20〜−30℃になることも。防寒着・手袋・帽子・防水ブーツが必須。体感温度は気温よりさらに低い。",en:"Finnish winters (Nov-Mar) can reach -20 to -30°C. Heavy coat, gloves, hat, and waterproof boots are essential. Wind chill makes it feel even colder."}},
      {icon:"🦌",level:"med",title:{ja:"トナカイ・ムースの道路横断",en:"Reindeer and moose on roads"},desc:{ja:"ラップランド・北フィンランドの道路では突然トナカイ・ヘラジカが飛び出してくる。特に夜間・夕暮れ時は徐行運転を。",en:"Reindeer and moose suddenly cross roads in Lapland and northern Finland. Drive slowly especially at night and dusk."}},
      {icon:"🌌",level:"med",title:{ja:"オーロラ観光詐欺",en:"Northern Lights tour scams"},desc:{ja:"ロバニエミ周辺のオーロラツアーは業者によって品質が大きく異なる。「100%保証」と謳うツアーは詐欺の可能性。",en:"Northern Lights tour quality varies greatly near Rovaniemi. '100% guarantee' tours are likely scams. Northern Lights cannot be guaranteed."}},
      {icon:"🎅",level:"low",title:{ja:"サンタクロース村の価格",en:"Santa Claus Village pricing"},desc:{ja:"ロバニエミのサンタクロース村は観光客向け価格が高い。サンタとの写真パッケージは€50〜200。体験内容と価格を事前に確認。",en:"Santa Claus Village in Rovaniemi has high tourist prices. Santa photo packages: €50-200. Confirm experience details and prices in advance."}},
      {icon:"🌿",level:"low",title:{ja:"自然へのアクセス権（アラスト）",en:"Everyman's right"},desc:{ja:"フィンランドには「アラスト（万人権）」があり、私有地でも自然の中での行動が認められている。ただし住居近辺・農地への立入は禁止。",en:"Finland has 'Everyman's Right' allowing nature activities even on private land. However, approaching buildings and entering farmland is prohibited."}},
      {icon:"🦟",level:"low",title:{ja:"夏の蚊・コバエ",en:"Summer mosquitoes and gnats"},desc:{ja:"フィンランドの夏（6〜8月）は蚊やコバエが非常に多い。防虫スプレー必携。特に湖周辺・森の中では必須。",en:"Finnish summers (Jun-Aug) have many mosquitoes and gnats. Insect repellent is essential, especially near lakes and in forests."}},
      {icon:"🚗",level:"low",title:{ja:"アイスロードの安全",en:"Ice road safety"},desc:{ja:"冬季は一部道路が凍結。スタッドレスタイヤは義務付けられている期間あり。アイスロードは指定速度を厳守。",en:"Some roads freeze in winter. Studded/winter tires are mandatory in certain periods. Strictly follow speed limits on ice roads."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"フィンランドはチップが基本不要。サービスが特に良かった場合の任意。",en:"Tipping is not generally required in Finland. Voluntary for exceptional service."}},
      {icon:"🌅",level:"low",title:{ja:"白夜と極夜",en:"Midnight sun and polar night"},desc:{ja:"夏は白夜（太陽が沈まない）、冬は極夜（太陽が昇らない）が起きる。睡眠の質に影響するため遮光カーテン活用を。",en:"Summer brings midnight sun; winter brings polar night. Use blackout curtains for better sleep quality."}},
      {icon:"🏙️",level:"low",title:{ja:"ヘルシンキの交通",en:"Helsinki transport"},desc:{ja:"ヘルシンキの公共交通はHSLのDAY Ticket（24時間/72時間）が観光客向けにお得。トラム・バス・地下鉄・フェリーが全て使える。",en:"Helsinki: HSL DAY Ticket (24hr/72hr) is great value for tourists. Works on all trams, buses, metro, and ferries."}},
    ],
  },
  ノルウェー: {
    _default: [
      {icon:"💰",level:"high",title:{ja:"高い物価",en:"High cost of living"},desc:{ja:"ノルウェーは世界最高水準の物価。ビール1杯100〜150ノルウェークローネ（約1,400〜2,100円）。食費節約のためスーパーでの購入を推奨。",en:"Norway has among the world's highest living costs. Beer: 100-150 NOK. Save on food by shopping at supermarkets (REMA 1000, Kiwi etc.)."}},
      {icon:"🌊",level:"high",title:{ja:"フィヨルド・山岳の安全",en:"Fjord and mountain safety"},desc:{ja:"フィヨルド・ノルウェーの山岳は転落事故が毎年多数。「プレーケストーレン」等は適切な靴・天候確認が必須。",en:"Falls are common in Norwegian fjords and mountains. Appropriate footwear and weather checks before hiking are essential."}},
      {icon:"🦅",level:"med",title:{ja:"オーロラ観光の現実",en:"Northern Lights reality check"},desc:{ja:"オーロラはトロムソ（10〜3月）で確率高め。曇りの日は見えない。保証は不可能。複数夜の滞在が推奨。",en:"Northern Lights: best chance in Tromsø (Oct-Mar). Cloudy nights = no viewing. Cannot be guaranteed. Staying multiple nights is recommended."}},
      {icon:"🚢",level:"low",title:{ja:"フィヨルドクルーズの予約",en:"Fjord cruise booking"},desc:{ja:"ノルウェーフィヨルドのクルーズは夏季に非常に混雑。事前予約が必須。キャンセルポリシーの確認を。",en:"Norwegian fjord cruises are extremely busy in summer. Advance booking is essential. Check cancellation policies carefully."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"ノルウェーはチップが任意。レストランで10〜15%が慣例だが強要はほとんどない。",en:"Tipping is voluntary in Norway. 10-15% at restaurants is customary but rarely pressured."}},
      {icon:"🐋",level:"low",title:{ja:"ホエールウォッチングの注意",en:"Whale watching precautions"},desc:{ja:"トロムソ周辺のホエールウォッチングは11〜1月がシーズン。船酔い薬の準備を推奨。認定業者を選ぶ。",en:"Whale watching near Tromsø is best Nov-Jan. Bring seasickness medication. Choose certified operators."}},
      {icon:"🌡️",level:"low",title:{ja:"冬の極寒",en:"Extreme winter cold"},desc:{ja:"ノルウェーの冬は−20℃以下になることも。防寒着・防水ブーツが必須。凍結した道路でのスリップに注意。",en:"Norwegian winters can drop below -20°C. Heavy cold-weather clothing and waterproof boots are essential."}},
      {icon:"🛕",level:"low",title:{ja:"スターヴ教会の保護",en:"Stave church preservation"},desc:{ja:"ノルウェーのスターヴ教会（木造教会）は世界遺産。内部の撮影は制限されることあり。木製の建物に触れることは禁止。",en:"Norwegian stave churches are World Heritage sites. Interior photography may be restricted. Do not touch the wooden structures."}},
      {icon:"🚗",level:"low",title:{ja:"山道の運転注意",en:"Mountain road driving caution"},desc:{ja:"ノルウェーのアトランティックロード等の山岳道路は急カーブ・狭い箇所多数。冬季は通行止めになる区間あり。",en:"Norwegian mountain roads like the Atlantic Road have sharp curves and narrow sections. Some routes close in winter."}},
      {icon:"🎣",level:"low",title:{ja:"釣りのルール",en:"Fishing rules"},desc:{ja:"ノルウェーでの釣りは海は外国人でも基本無料だが、川・湖は漁業権（フィッシングカード）の購入が必要。",en:"Sea fishing in Norway is generally free for foreigners, but river/lake fishing requires a fishing card. Violations are fined."}},
    ],
  },
  ロシア: {
    _default: [
      {icon:"⚠️",level:"high",title:{ja:"渡航安全情報の確認",en:"Check travel safety advisories"},desc:{ja:"2025年現在、外務省はロシアへの渡航を「危険情報レベル3（渡航中止勧告）」に引き上げている。最新の外務省海外安全情報を必ず確認。",en:"As of 2025, Japan's MOFA has elevated Russia to Level 3 (Advise to Avoid). Always check the latest MOFA overseas safety information before travel."}},
      {icon:"💳",level:"high",title:{ja:"決済手段の制限",en:"Payment restrictions"},desc:{ja:"制裁措置によりVisaやMastercardが使えない。ミル（MIR）カードかルーブル現金が必要。ATMでの外国カード使用も制限されている。",en:"Due to sanctions, Visa and Mastercard are not accepted. MIR card or Russian ruble cash is necessary. Foreign card ATM access is also restricted."}},
      {icon:"📸",level:"med",title:{ja:"撮影禁止場所の厳守",en:"Strictly observe photography bans"},desc:{ja:"軍事施設・橋・一部政府施設の撮影は厳禁。違反は逮捕・器材没収のリスクあり。撮影前に周辺の標識を確認。",en:"Photography of military facilities, bridges, and some government buildings is strictly prohibited. Violations risk arrest and equipment confiscation."}},
      {icon:"🚕",level:"med",title:{ja:"タクシーの不正請求",en:"Taxi overcharging"},desc:{ja:"外国人観光客へのタクシー過剰請求が多い。YandexGo（ロシアのUber相当）アプリが最も安全。",en:"Taxi overcharging of foreign tourists is common. YandexGo (Russia's Uber equivalent) app is safest."}},
      {icon:"📱",level:"med",title:{ja:"通信・SNSの制限",en:"Communication and SNS restrictions"},desc:{ja:"ロシアではInstagram・Twitter/Xへのアクセスが制限されている。VPNは渡航前にインストールが必要。",en:"Instagram and Twitter/X access is restricted in Russia. Install VPN before arrival."}},
      {icon:"🍺",level:"low",title:{ja:"アルコールに関する注意",en:"Alcohol precautions"},desc:{ja:"ロシアのウォッカ等は度数が高く、飲みすぎに注意。見知らぬ人からのお酒の誘いは断ることを推奨。",en:"Russian vodka and other spirits are high-alcohol. Be careful not to drink too much. Declining alcohol offers from strangers is recommended."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"ロシアはチップが慣例。レストランで10〜15%、ガイド・運転手には100〜300ルーブルが相場。",en:"Tipping is customary in Russia. 10-15% at restaurants; 100-300 RUB for guides and drivers is standard."}},
      {icon:"❄️",level:"low",title:{ja:"冬の厳しい寒さ",en:"Extreme winter cold"},desc:{ja:"モスクワ・サンクトペテルブルクの冬（12〜2月）は−15〜−25℃になることも。適切な防寒着・防水ブーツが必須。",en:"Moscow/St. Petersburg winters (Dec-Feb) can reach -15 to -25°C. Appropriate cold-weather clothing and waterproof boots are essential."}},
      {icon:"🏥",level:"low",title:{ja:"医療・緊急連絡",en:"Medical and emergency contacts"},desc:{ja:"ロシアでの医療費は高額になりうる。旅行保険（医療補償付き）は必須。在ロシア日本大使館への連絡先を事前に控えておく。",en:"Medical costs in Russia can be high. Travel insurance with medical coverage is essential. Note down the Japanese Embassy in Russia contact details in advance."}},
    ],
  },
  カナダ: {
    _default: [
      {icon:"🐻",level:"high",title:{ja:"野生動物（熊）への注意",en:"Wildlife (bear) safety"},desc:{ja:"カナダの自然地域（バンフ・ジャスパー等）では黒熊・グリズリーが生息。ハイキング時は熊よけスプレー携帯、大声で話して存在を知らせる。",en:"Black bears and grizzlies inhabit Canadian wilderness (Banff, Jasper etc.). Carry bear spray when hiking; make noise to alert bears of your presence."}},
      {icon:"❄️",level:"high",title:{ja:"冬の厳しい寒さ",en:"Extreme winter cold"},desc:{ja:"カナダの冬（12〜2月）はトロント−15〜−20℃、バンクーバーは比較的温暖。適切な防寒着が必須。凍結した路面でのスリップに注意。",en:"Canadian winters: Toronto -15 to -20°C (Dec-Feb), Vancouver is milder. Appropriate cold-weather clothing essential."}},
      {icon:"🚕",level:"med",title:{ja:"タクシー・Uber",en:"Taxis and Uber"},desc:{ja:"カナダのタクシーは比較的信頼できる。Uber/Lyftが普及。空港ではポータル表示の公式タクシー乗り場のみ利用。",en:"Canadian taxis are relatively trustworthy. Uber/Lyft are widely available. At airports, use only official taxi stands."}},
      {icon:"🌊",level:"med",title:{ja:"ナイアガラの滝周辺の詐欺師",en:"Scammers near Niagara Falls"},desc:{ja:"ナイアガラの滝（カナダ側）周辺で非公式の「ガイド」やチケット業者に注意。公式アトラクションは公式サイトで購入。",en:"Unofficial 'guides' and ticket sellers operate near Niagara Falls (Canada side). Buy tickets for official attractions only on official sites."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"カナダはアメリカ同様のチップ文化。レストランで15〜20%、タクシーで15%、ホテルのポーターには$1〜2/個が相場。",en:"Canada has similar tipping culture to the US. Restaurant: 15-20%. Taxi: 15%. Hotel porter: $1-2/bag."}},
      {icon:"🍺",level:"low",title:{ja:"カナダの飲酒年齢・法律",en:"Canadian drinking age and laws"},desc:{ja:"カナダの飲酒可能年齢は州によって18歳（ケベック等）または19歳（オンタリオ等）。公共の場での飲酒は基本禁止。",en:"Legal drinking age in Canada: 18 (Quebec etc.) or 19 (Ontario etc.) depending on province. Drinking in public is generally prohibited."}},
      {icon:"🌿",level:"low",title:{ja:"大麻の合法化",en:"Cannabis legalization"},desc:{ja:"カナダでは大麻が連邦法で合法化（18歳以上）。ただし公共の場での喫煙は制限あり。日本への持ち帰りは絶対禁止（重罰）。",en:"Cannabis is federally legal in Canada (18+). Public smoking is restricted. Absolutely prohibited to bring to Japan (severe penalties)."}},
      {icon:"🏔️",level:"low",title:{ja:"山岳・自然公園のルール",en:"Mountain and national park rules"},desc:{ja:"カナダの国立公園は入場有料（年間パス$75/人）。ゴミの持ち帰り・火気使用ルール厳守。",en:"Canadian national parks charge entry fees (annual pass $75/person). Strictly follow rules for waste disposal and fire use."}},
      {icon:"💳",level:"low",title:{ja:"税金・チップ込み価格",en:"Prices with tax and tip"},desc:{ja:"カナダの表示価格に消費税（GST5%+各州税5〜10%）が別途加算される。レストランはさらにチップが加わるため、表示価格の1.3〜1.4倍が実際の支払いになる。",en:"Canadian listed prices don't include sales tax (GST 5% + provincial tax 5-10%). With tip, restaurant total is often 1.3-1.4x the listed price."}},
      {icon:"🌲",level:"low",title:{ja:"ケベックの言語",en:"Quebec language"},desc:{ja:"ケベック州はフランス語が公用語。英語も通じるが、フランス語で挨拶すると好印象（Bonjour！）。",en:"Quebec province uses French as official language. English is understood, but greeting in French (Bonjour!) makes a good impression."}},
    ],
  },
  メキシコ: {
    _default: [
      {icon:"🚗",level:"high",title:{ja:"誘拐・強盗リスク",en:"Kidnapping and robbery risks"},desc:{ja:"メキシコシティ・カンクン以外の地域は治安に注意が必要。外務省危険情報を事前確認。夜間の外出は最小限に。Uber・公認タクシーを使用。",en:"Safety varies significantly outside Mexico City/Cancun. Check MOFA safety advisories. Minimize nighttime outings. Use Uber or certified taxis only."}},
      {icon:"💊",level:"high",title:{ja:"飲み物への薬物混入",en:"Drink spiking"},desc:{ja:"バー・クラブで飲み物に薬物を盛られて財産を奪われる手口がリゾートでも報告。知らない人の飲み物は受け取らない。",en:"Drink spiking and robbery reported even in resort areas. Never accept drinks from strangers. Never leave your drink unattended."}},
      {icon:"🚕",level:"high",title:{ja:"タクシー犯罪",en:"Taxi-related crimes"},desc:{ja:"メキシコシティでの路上タクシー（流し）はUber・Cabifyアプリ、またはホテル手配タクシーを強く推奨。流しのタクシーへの乗車は強盗リスクがある。",en:"In Mexico City, Uber/Cabify apps or hotel-arranged taxis are strongly recommended. Street taxis carry robbery risks."}},
      {icon:"💵",level:"med",title:{ja:"通貨・両替の注意",en:"Currency and exchange caution"},desc:{ja:"メキシコペソへの両替は空港・ホテル・銀行が安全。街頭両替商は過剰手数料や偽札リスクあり。ATMは銀行内のものを優先使用。",en:"Exchange to Mexican pesos at airports, hotels, or banks. Street exchangers risk high fees and counterfeit notes. Use ATMs inside banks."}},
      {icon:"🏖️",level:"med",title:{ja:"カンクンのビーチリゾートの安全",en:"Cancun beach resort safety"},desc:{ja:"カンクンのホテルゾーン内は比較的安全。ホテルゾーン外（ダウンタウン等）は夜間の単独行動は避ける。",en:"Cancun Hotel Zone is relatively safe. Avoid solo nighttime outings outside the Hotel Zone."}},
      {icon:"🌮",level:"low",title:{ja:"屋台食の衛生",en:"Street food hygiene"},desc:{ja:"メキシコの屋台は食中毒リスクあり。熱々に調理されたものを選び、生野菜・生水は避ける。整腸剤を持参。",en:"Mexican street food carries food poisoning risks. Choose freshly cooked hot items. Avoid raw vegetables and tap water."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"メキシコはチップ文化が強い。レストランで15〜20%、ホテルのスタッフに20〜50ペソ/日が相場。",en:"Tipping culture is strong in Mexico. Restaurant: 15-20%. Hotel staff: 20-50 MXN/day is customary."}},
      {icon:"🌋",level:"low",title:{ja:"地震・火山活動",en:"Earthquake and volcanic activity"},desc:{ja:"メキシコは地震・火山が多い。ポポカテペトル火山の活動状況を確認。ホテルの避難経路を把握。",en:"Mexico has frequent earthquakes and volcanic activity. Check Popocatépetl volcano status. Know your hotel's evacuation routes."}},
      {icon:"🚧",level:"low",title:{ja:"警察の検問",en:"Police checkpoints"},desc:{ja:"メキシコの主要道路には警察・軍の検問所あり。検問では冷静にパスポートを提示。撮影は禁止。",en:"Police and military checkpoints exist on major Mexican roads. Remain calm and show passport when asked. Photography is prohibited."}},
      {icon:"🌊",level:"low",title:{ja:"リゾートの強い波",en:"Strong resort waves"},desc:{ja:"カンクン・ロスカボスのビーチは波が強いエリアあり。ライフガードのいるビーチのみで遊泳。",en:"Beaches in Cancun/Los Cabos have some strong wave areas. Swim only at beaches with lifeguards."}},
    ],
  },
  ブラジル: {
    _default: [
      {icon:"🔫",level:"high",title:{ja:"治安と強盗リスク",en:"Safety and robbery risks"},desc:{ja:"ブラジルの主要都市（リオ・サンパウロ）は強盗リスクが高い。高価なアクセサリー・スマートフォンを目立つところに出さない。夜間の外出は最小限に。",en:"Major Brazilian cities (Rio, São Paulo) have high robbery risk. Don't display expensive items or smartphones. Minimize nighttime outings."}},
      {icon:"🏖️",level:"high",title:{ja:"ビーチでの盗難",en:"Beach theft"},desc:{ja:"コパカバーナ・イパネマ等の有名ビーチでの盗難が多発。貴重品はホテルのセーフティボックスへ。ビーチには最小限の持ち物のみ。",en:"Theft is rampant on famous beaches like Copacabana and Ipanema. Leave valuables in hotel safe. Bring only minimal items to the beach."}},
      {icon:"🚕",level:"high",title:{ja:"タクシー・配車アプリ",en:"Taxis and ride-share apps"},desc:{ja:"路上の黄色タクシーよりUber・99等のアプリが安全。空港では事前払いタクシーカウンターを利用。白タクには絶対に乗らない。",en:"Uber/99 apps are safer than street taxis. At airports, use prepaid taxi counters. Never get in an unlicensed taxi."}},
      {icon:"🎭",level:"med",title:{ja:"カーニバル時の混雑・犯罪",en:"Carnival crowding and crime"},desc:{ja:"リオのカーニバル期間中はスリ・強盗が急増。貴重品はホテルに置き、現金は必要最小限。",en:"Pickpocketing and robbery surge during Rio Carnival. Leave valuables at hotel; carry minimal cash."}},
      {icon:"💊",level:"med",title:{ja:"飲料水の安全",en:"Drinking water safety"},desc:{ja:"ブラジルの水道水は地域によって飲用不可。ミネラルウォーターを使用。氷も水道水の場合あり、飲食店で確認を。",en:"Tap water quality varies in Brazil; often not safe to drink. Use bottled water. Ice in restaurants may also be made from tap water."}},
      {icon:"🌡️",level:"low",title:{ja:"熱帯の感染症",en:"Tropical diseases"},desc:{ja:"デング熱・マラリア・黄熱病のリスクあり。特にアマゾン地域へは黄熱病ワクチン接種が必要な場合あり。防虫スプレー必携。",en:"Dengue fever, malaria, and yellow fever risks exist. Yellow fever vaccination may be required for Amazon regions. Carry insect repellent."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"ブラジルはサービス料（serviço）10%がメニュー価格に加算される場合が多い。追加チップは任意。",en:"Brazilian restaurants often add 10% service charge (serviço). Additional tipping is voluntary."}},
      {icon:"🚴",level:"low",title:{ja:"公共交通の安全",en:"Public transport safety"},desc:{ja:"サンパウロの地下鉄は比較的安全。リオの地下鉄は観光客エリアを外れると危険。バスは混雑時にスリ多発。",en:"São Paulo metro is relatively safe. Rio metro becomes risky outside tourist areas. Bus pickpocketing is common when crowded."}},
    ],
  },
  アルゼンチン: {
    _default: [
      {icon:"💵",level:"high",title:{ja:"闇ドル・公式レート差",en:"Blue dollar and official rate gap"},desc:{ja:"アルゼンチンは公式レートと非公式レート（ブルーダラー）に大きな差がある。闇両替は違法で詐欺リスクも高い。認定両替所での両替を推奨。",en:"Argentina has a large gap between official and unofficial (blue dollar) exchange rates. Black market exchange is illegal and carries high scam risk."}},
      {icon:"🎒",level:"high",title:{ja:"ブエノスアイレスのスリ・強盗",en:"Buenos Aires pickpocketing and robbery"},desc:{ja:"ブエノスアイレスの観光地（フロリダ通り・サンテルモ等）でスリが多発。高価なアクセサリー・カメラを持ち歩かない。",en:"Pickpocketing is common in Buenos Aires tourist areas (Florida Street, San Telmo etc.). Don't carry expensive jewelry or cameras."}},
      {icon:"🚕",level:"med",title:{ja:"タクシー・Uber",en:"Taxis and Uber"},desc:{ja:"ブエノスアイレスのタクシーは基本的に信頼できるが、RemisやCabifyアプリが安全。空港からは公式シャトルが安全。",en:"Buenos Aires taxis are generally reliable, but Remis or Cabify apps are safer. From the airport, use official shuttles."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"アルゼンチンはチップ文化あり。レストランで10〜15%が相場。インフレが激しいため現金チップ額は要調整。",en:"Tipping is customary in Argentina. 10-15% at restaurants is standard. Given high inflation, adjust cash tip amounts accordingly."}},
      {icon:"🌡️",level:"low",title:{ja:"季節が逆",en:"Reversed seasons"},desc:{ja:"アルゼンチンは南半球のため季節が逆（日本の夏=現地の冬）。12〜2月が夏、6〜8月が冬。",en:"Argentina is in Southern Hemisphere, so seasons are reversed. Dec-Feb is summer, Jun-Aug winter."}},
      {icon:"🌿",level:"low",title:{ja:"パタゴニア自然保護",en:"Patagonia nature conservation"},desc:{ja:"パタゴニア（ロスグラシアレス等）は世界遺産。自然環境の破壊は厳しく罰せられる。公認ガイドとともに行動推奨。",en:"Patagonia (Los Glaciares etc.) is a World Heritage site. Damaging natural environment is severely punished. Traveling with certified guides recommended."}},
      {icon:"🔌",level:"low",title:{ja:"電源プラグの種類",en:"Power plug types"},desc:{ja:"アルゼンチンのコンセントはタイプI（三本の斜めピン）。変換プラグが必要。電圧は220V。",en:"Argentina uses Type I plugs (three diagonal pins). Adapter needed. Voltage is 220V. Check if voltage converter is needed."}},
    ],
  },
  UAE: {
    _default: [
      {icon:"⚖️",level:"high",title:{ja:"厳格な法律と禁止事項",en:"Strict laws and prohibitions"},desc:{ja:"UAEは非常に厳格な法律あり。公共での飲酒・接吻は違法（罰金・逮捕）。同性愛行為は違法。ラマダン中の公共での飲食は禁止。",en:"UAE has very strict laws. Public drinking/kissing is illegal (fines/arrest). Same-sex acts are illegal. Eating/drinking in public during Ramadan is prohibited."}},
      {icon:"👗",level:"high",title:{ja:"服装規定",en:"Dress code requirements"},desc:{ja:"モスク・一部商業施設では肌の露出が禁止（肩・膝を覆う）。モスク訪問時はアバヤやスカーフが必要。",en:"Mosques and some malls prohibit revealing clothing (cover shoulders/knees). Mosques require abaya/scarf."}},
      {icon:"💊",level:"high",title:{ja:"薬品・ドラッグの持ち込み",en:"Medication and drug import rules"},desc:{ja:"処方薬でも一部薬品はUAEへの持ち込みが禁止。医師の処方箋・英語の証明書が必要。麻薬の所持は死刑を含む極刑。",en:"Some prescription medications are banned in UAE. Bring doctor's prescription and English certificate. Drug possession carries extreme penalties including death."}},
      {icon:"📸",level:"med",title:{ja:"撮影禁止エリア",en:"Photography prohibited areas"},desc:{ja:"政府機関・宮殿・軍事施設の撮影は禁止。他人（特に女性）の無断撮影は逮捕リスクあり。",en:"Photography of government buildings, palaces, and military facilities is prohibited. Unauthorized photographing of people (especially women) risks arrest."}},
      {icon:"🍺",level:"med",title:{ja:"アルコールのルール",en:"Alcohol rules"},desc:{ja:"UAEではホテル・認定バーでのアルコール飲用は合法。公共の場での飲酒・酔い状態は違法で厳しく罰せられる。",en:"Alcohol is legal at licensed hotels and bars in UAE. Drinking in public or appearing drunk in public is illegal with severe penalties."}},
      {icon:"🚕",level:"med",title:{ja:"タクシー・カリーム",en:"Taxis and Careem"},desc:{ja:"ドバイのタクシーは公認会社（Dubai Taxi等）が信頼できる。Careem（Uber系列）アプリも安全。白タクには乗らない。",en:"Dubai taxis from official companies (Dubai Taxi etc.) are reliable. Careem (Uber affiliate) app is also safe. Never board unlicensed taxis."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"UAEはチップが慣例。レストランで10〜15%（すでに含まれている場合も）、タクシーで端数切り上げ程度が相場。",en:"Tipping is customary in UAE. 10-15% at restaurants (may already be included); round up taxi fares."}},
      {icon:"☀️",level:"low",title:{ja:"夏の猛暑",en:"Summer extreme heat"},desc:{ja:"ドバイの夏（6〜9月）は45〜50℃になることも。屋外活動は早朝か夕方に限定。水分を常に携帯。",en:"Dubai summer (Jun-Sep) can reach 45-50°C. Limit outdoor activities to early morning or evening. Always carry water."}},
      {icon:"🕌",level:"low",title:{ja:"礼拝時間の配慮",en:"Prayer time consideration"},desc:{ja:"イスラム教の礼拝時間（1日5回）中は一部店舗が一時的に閉まることあり。",en:"Some stores may temporarily close during Islamic prayer times (5x daily)."}},
      {icon:"🏗️",level:"low",title:{ja:"砂漠ツアーの安全",en:"Desert tour safety"},desc:{ja:"ドバイ郊外の砂漠ツアーは認定業者のみ利用。砂漠への無許可の立入は危険。",en:"Desert tours near Dubai: use only certified operators. Unauthorized entry into desert outskirts is dangerous."}},
    ],
    ドバイ: [
      {icon:"💎",level:"med",title:{ja:"ゴールドスーク・香辛料スークの価格交渉",en:"Gold Souk and Spice Souk bargaining"},desc:{ja:"デイラ地区のゴールドスーク・香辛料スークは値交渉が前提。最初の提示価格の50〜70%が適正な目安。",en:"Bargaining is expected at Deira's Gold Souk and Spice Souk. 50-70% of asking price is a reasonable target."}},
      {icon:"🛍️",level:"low",title:{ja:"ドバイモールの価格",en:"Dubai Mall prices"},desc:{ja:"ドバイモールは世界最大のショッピングモールの一つ。ブランド品は必ずしも日本より安くない。",en:"Dubai Mall is one of the world's largest shopping malls. Brand goods aren't necessarily cheaper than Japan."}},
      {icon:"🌇",level:"low",title:{ja:"バージュ・ハリファのチケット",en:"Burj Khalifa tickets"},desc:{ja:"バージュ・ハリファの展望台は事前オンライン予約が大幅に安い。公式サイトのみで購入。",en:"Burj Khalifa observation deck: advance online booking is much cheaper. Buy only at official site."}},
    ],
  },
  トルコ: {
    _default: [
      {icon:"🎒",level:"high",title:{ja:"スリ・ひったくり",en:"Pickpocketing and bag snatching"},desc:{ja:"イスタンブールのグランドバザール・エミノニュ広場・地下鉄でスリ多発。バッグは前に持ち、財布は前ポケットへ。",en:"Pickpocketing is common at Istanbul's Grand Bazaar, Eminönü Square, and on the metro. Keep bags in front; wallets in front pockets."}},
      {icon:"🍵",level:"high",title:{ja:"チャイ・カーペット詐欺",en:"Tea/carpet scam"},desc:{ja:"「チャイを飲みませんか」と誘われ、カーペット店・宝石店へ連行される手口。断っても大丈夫。",en:"'Come for tea' invitations lead to carpet/jewelry stores. It's perfectly OK to refuse."}},
      {icon:"🚕",level:"high",title:{ja:"タクシー過剰請求",en:"Taxi overcharging"},desc:{ja:"イスタンブールのタクシーは外国人への過剰請求が頻繁。BiTaksi・Uberアプリが安全。旧紙幣でお釣りを渡す詐欺にも注意。",en:"Istanbul taxi overcharging is frequent. BiTaksi or Uber apps are safer. Watch for taxi drivers giving change in old/worthless lira notes."}},
      {icon:"🏛️",level:"med",title:{ja:"観光地偽ガイド",en:"Fake guides at tourist sites"},desc:{ja:"アヤソフィア・トプカプ宮殿周辺で非公認ガイドによる過剰請求に注意。公式ガイドは政府認定バッジを持つ。",en:"Unofficial guides operate near Hagia Sophia and Topkapi Palace, charging excessive fees. Official guides carry government-certified badges."}},
      {icon:"🌊",level:"med",title:{ja:"地震リスク",en:"Earthquake risk"},desc:{ja:"トルコは地震が多い地域。ホテルの避難経路を確認。",en:"Turkey is earthquake-prone, especially near Istanbul. Check hotel evacuation routes."}},
      {icon:"💵",level:"med",title:{ja:"インフレと通貨",en:"Inflation and currency"},desc:{ja:"トルコリラはインフレが激しい。両替は銀行・公認両替所で。",en:"Turkish lira has experienced severe inflation. Exchange at banks or authorized exchangers."}},
      {icon:"🛍️",level:"low",title:{ja:"グランドバザールの交渉",en:"Grand Bazaar bargaining"},desc:{ja:"イスタンブールのグランドバザールは値交渉が前提。提示価格の50〜60%が目安。",en:"Bargaining is expected at Istanbul's Grand Bazaar. Aim for 50-60% of asking price."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"トルコはチップが慣例。レストランで10〜15%、ホテルのポーターに20〜50リラが相場。",en:"Tipping is customary in Turkey. 10-15% at restaurants; 20-50 TRY for hotel porters is standard."}},
      {icon:"🕌",level:"low",title:{ja:"モスク訪問のマナー",en:"Mosque visit etiquette"},desc:{ja:"モスク入場時は靴を脱ぎ、肌の露出を避ける。女性はスカーフ着用。礼拝中は入場制限あり。",en:"Remove shoes when entering mosques; cover up. Women wear headscarf. Entry restricted during prayer times."}},
      {icon:"🌡️",level:"low",title:{ja:"夏の猛暑",en:"Summer heat"},desc:{ja:"トルコの夏（6〜9月）は40℃を超えることも。水分補給必須。",en:"Turkish summers (Jun-Sep) can exceed 40°C. Stay well hydrated."}},
    ],
  },
  エジプト: {
    _default: [
      {icon:"🏛️",level:"high",title:{ja:"観光地での執拗な客引き",en:"Persistent touts at tourist sites"},desc:{ja:"ピラミッド・ルクソール神殿周辺の客引き（ガイド・ラクダ・土産物）は非常にしつこい。「La shukran」と言えば大丈夫。絶対に案内についていかない。",en:"Touts (guides, camels, souvenirs) at pyramids and Luxor temples are extremely persistent. Say 'La shukran' (No thank you). Never follow anyone."}},
      {icon:"🐪",level:"high",title:{ja:"ラクダ・馬車の後払い詐欺",en:"Camel/carriage post-ride overcharging"},desc:{ja:"ピラミッド周辺のラクダ・馬車は乗車前に料金を確認し、可能であれば書いてもらう。降車時に数倍請求するケースが多発。",en:"For camel/carriage rides at pyramids, confirm price before boarding and get it in writing if possible. Many demand much higher prices on return."}},
      {icon:"💵",level:"high",title:{ja:"両替詐欺・偽札",en:"Exchange scams and counterfeit notes"},desc:{ja:"非公認の両替商は偽札・不利レートのリスクあり。銀行・ホテル・公認両替所のみ利用。",en:"Unauthorized money changers risk counterfeit notes and unfavorable rates. Use only banks, hotels, or authorized exchange offices."}},
      {icon:"🚕",level:"high",title:{ja:"タクシー過剰請求",en:"Taxi overcharging"},desc:{ja:"カイロのタクシーは外国人への過剰請求が常態化。Uber・Careem（Uber系列）アプリが最も安全。",en:"Cairo taxis routinely overcharge foreigners. Uber or Careem (Uber affiliate) app is safest."}},
      {icon:"👮",level:"med",title:{ja:"偽警察・「バクシーシ」強要",en:"Fake police and 'baksheesh'"},desc:{ja:"観光地で便宜を図った後にチップ（バクシーシ）を強要する手口あり。サービスを提供する人物がいれば金額を事前に確認。",en:"People providing 'help' at tourist sites then demanding 'baksheesh' (tips) is common. Confirm cost before accepting any assistance."}},
      {icon:"🌡️",level:"med",title:{ja:"砂漠の熱中症",en:"Desert heat stroke"},desc:{ja:"エジプトの夏（5〜9月）は45℃を超えることも。水分を常に携帯し、日中の屋外観光は避ける。",en:"Egyptian summer (May-Sep) can exceed 45°C. Always carry water and avoid outdoor sightseeing during midday."}},
      {icon:"🏊",level:"med",title:{ja:"紅海・ダイビングの安全",en:"Red Sea and diving safety"},desc:{ja:"ハルガダ・シャルムエルシェイクの紅海は美しいが、無許可業者のダイビングは保険・安全基準が不明確。認定業者のみ利用。",en:"The Red Sea at Hurghada/Sharm El Sheikh is beautiful, but unlicensed diving operators lack insurance and safety standards."}},
      {icon:"🗿",level:"low",title:{ja:"古代遺物の持ち出し禁止",en:"No removal of ancient artifacts"},desc:{ja:"エジプトの石・陶器の破片等を持ち帰ることは違法で逮捕リスクあり。どんな小さなものでも持ち出しは禁止。",en:"Removing stones, pottery fragments etc. from Egypt is illegal and risks arrest. No matter how small, taking artifacts out is prohibited."}},
      {icon:"💴",level:"low",title:{ja:"チップ（バクシーシ）文化",en:"Tipping (baksheesh) culture"},desc:{ja:"エジプトはチップ文化が非常に強い。トイレの使用（5〜10ポンド）、荷物の取り扱い（10〜20ポンド）等でチップが期待される。",en:"Egypt has a very strong tipping culture. Toilet use (5-10 EGP), baggage handling (10-20 EGP) etc. all expect tips."}},
      {icon:"🕌",level:"low",title:{ja:"宗教的マナー",en:"Religious etiquette"},desc:{ja:"エジプトはイスラム教国。モスク訪問時は肌の露出を避け、礼拝中の入場は制限あり。ラマダン中は公共での飲食を控える。",en:"Egypt is a Muslim country. Cover up when visiting mosques. Entry restricted during prayer. Avoid eating/drinking in public during Ramadan."}},
    ],
  },
  サウジアラビア: {
    _default: [
      {icon:"⚖️",level:"high",title:{ja:"厳格なイスラム法",en:"Strict Islamic law"},desc:{ja:"サウジアラビアは世界で最も厳格なイスラム法が施行されている国の一つ。公共での男女接触・不道徳行為は厳しく処罰される。",en:"Saudi Arabia enforces some of the world's strictest Islamic law. Public contact between unmarried men/women and immoral behavior are severely punished."}},
      {icon:"🍺",level:"high",title:{ja:"アルコール完全禁止",en:"Alcohol completely prohibited"},desc:{ja:"サウジアラビアではアルコールの生産・販売・所持・飲用が全て禁止。違反は逮捕・鞭打ち・国外追放等の厳しい刑罰。",en:"Alcohol production, sale, possession, and consumption are all completely prohibited in Saudi Arabia. Violations result in arrest, flogging, deportation etc."}},
      {icon:"👗",level:"high",title:{ja:"服装規定",en:"Dress code"},desc:{ja:"観光ビザ導入後、外国人女性のアバヤ着用義務は緩和されたが、モスク・保守的なエリアでは着用推奨。肩・膝以上の露出は控える。",en:"Tourist visa holders no longer required to wear abaya, but recommended near mosques and conservative areas. Avoid exposing shoulders or above-knees."}},
      {icon:"📸",level:"high",title:{ja:"撮影の制限",en:"Photography restrictions"},desc:{ja:"政府機関・宗教施設・軍事施設・他人（特に女性）の無断撮影は禁止。違反は逮捕・器材没収のリスクあり。",en:"Photography of government buildings, religious sites, military facilities, and people (especially women) without permission is prohibited. Risk of arrest and equipment confiscation."}},
      {icon:"🚕",level:"med",title:{ja:"Uber・Careem",en:"Uber and Careem"},desc:{ja:"サウジアラビアではUber・Careemが普及。流しのタクシーより安全・安価。女性専用ドライバーオプションもあり。",en:"Uber and Careem are widely used in Saudi Arabia. Safer and cheaper than street taxis. Women-only driver option available."}},
      {icon:"🌅",level:"low",title:{ja:"礼拝時間のビジネス",en:"Prayer time business hours"},desc:{ja:"1日5回の礼拝時間（アザーン）中は多くの店舗が15〜30分閉まる。礼拝時間は日によって異なるため、外出前に確認を。",en:"Many shops close for 15-30 minutes during the 5 daily prayer times (adhan). Prayer times vary by day; check before going out."}},
      {icon:"🌡️",level:"low",title:{ja:"夏の猛暑",en:"Summer extreme heat"},desc:{ja:"サウジアラビアの夏（5〜9月）は45〜50℃を超えることも。観光は10〜3月がベストシーズン。水分補給必須。",en:"Saudi summer (May-Sep) can exceed 45-50°C. Best tourist season: October-March. Essential to stay well hydrated."}},
      {icon:"🕌",level:"low",title:{ja:"メッカ・メディナへの入場制限",en:"Mecca/Medina entry restrictions"},desc:{ja:"メッカ・メディナはイスラム教徒以外の入場が禁止（一部地域のみ）。違反は強制退去・逮捕。入場禁止エリアの看板を厳守。",en:"Mecca and certain parts of Medina are prohibited for non-Muslims. Violations result in forced removal or arrest. Strictly follow 'No Entry' signs."}},
      {icon:"💻",level:"low",title:{ja:"インターネットの検閲",en:"Internet censorship"},desc:{ja:"サウジアラビアではVoIP（Skype・WhatsApp通話等）が制限される場合あり。一部サイトへのアクセスも制限。VPNは渡航前にインストール推奨。",en:"VoIP (Skype/WhatsApp calls) may be restricted in Saudi Arabia. Some websites are also blocked. Install VPN before arrival."}},
    ],
  },
  南アフリカ: {
    _default: [
      {icon:"🔫",level:"high",title:{ja:"治安リスク",en:"Safety risks"},desc:{ja:"南アフリカは世界有数の犯罪率が高い国。ヨハネスブルグ・ケープタウン市内の一部地区は夜間立入禁止。貴重品を見せない。車内への置き忘れは厳禁。",en:"South Africa has one of the world's highest crime rates. Some areas of Johannesburg and Cape Town are no-go zones at night. Don't display valuables. Never leave items in cars."}},
      {icon:"🚗",level:"high",title:{ja:"カーハイジャック",en:"Carjacking"},desc:{ja:"ヨハネスブルグを中心にカーハイジャック（走行中の強制車両乗っ取り）が多発。赤信号での待機中はドアをロック。人気のない道路は避ける。",en:"Carjacking (forced vehicle takeover while driving) is common, especially in Johannesburg. Lock doors while stopped at red lights. Avoid quiet roads."}},
      {icon:"🏧",level:"high",title:{ja:"ATM犯罪",en:"ATM crimes"},desc:{ja:"ATM使用中の強盗・カード盗難が多発。銀行内ATMを優先。通行人に暗証番号を覗かれないよう注意。",en:"Robbery and card theft at ATMs is frequent. Use ATMs inside bank branches. Shield your PIN from bystanders."}},
      {icon:"🦁",level:"med",title:{ja:"野生動物サファリの安全",en:"Safari wildlife safety"},desc:{ja:"クルーガー国立公園等のサファリでは車外に出ることは厳禁。動物は野生のため予測不能。認定ガイドの指示に従う。",en:"Getting out of vehicles in Kruger National Park etc. is strictly prohibited. Wild animals are unpredictable. Always follow certified guide instructions."}},
      {icon:"🌊",level:"med",title:{ja:"ケープタウンのビーチ安全",en:"Cape Town beach safety"},desc:{ja:"ケープタウン周辺のビーチは美しいが、大西洋側は水温が低い（10〜14℃）。サメの出現もあり。ライフガードのいるビーチのみで遊泳。",en:"Cape Town's beaches are beautiful but the Atlantic side is cold (10-14°C). Shark sightings also occur. Swim only at beaches with lifeguards."}},
      {icon:"⚡",level:"low",title:{ja:"停電（ロードシェディング）",en:"Load shedding (power cuts)"},desc:{ja:"南アフリカでは計画停電（ロードシェディング）が頻繁。EskomSePushアプリで確認を。",en:"Scheduled power cuts (load shedding) are frequent in South Africa. Check the EskomSePush app for your area's schedule."}},
      {icon:"💴",level:"low",title:{ja:"チップ文化",en:"Tipping culture"},desc:{ja:"南アフリカはチップ文化が強い。レストランで10〜15%、ガイドに50〜100ランド/日が相場。",en:"Tipping culture is strong in South Africa. Restaurant: 10-15%. Guides: 50-100 ZAR/day."}},
      {icon:"🌍",level:"low",title:{ja:"11の公用語",en:"11 official languages"},desc:{ja:"南アフリカには11の公用語がある。観光地は英語が通じる。基本的な英語で問題なし。",en:"South Africa has 11 official languages. English is spoken at tourist areas. Basic English is sufficient."}},
      {icon:"🌡️",level:"low",title:{ja:"季節と気候",en:"Seasons and climate"},desc:{ja:"南アフリカは南半球のため季節が逆。サファリのベストシーズンは乾季（5〜10月）。",en:"South Africa is in the Southern Hemisphere; seasons are reversed. Best safari season: dry season May-Oct."}},
    ],
  },

};


// ─────────────────────────────────────────────────────────
// FIXED EMERGENCY PHRASES (オフライン用固定5個)
// ─────────────────────────────────────────────────────────
const FIXED_PHRASES = [
  { emoji:"🙏", ja:"ありがとうございます", en:"Thank you", zh:"谢谢", ko:"감사합니다", es:"Gracias", pt:"Obrigado" },
  { emoji:"🙇", ja:"すみません／失礼します", en:"Excuse me", zh:"打扰一下", ko:"실례합니다", es:"Disculpe", pt:"Com licença" },
  { emoji:"😔", ja:"ごめんなさい", en:"I'm sorry", zh:"对不起", ko:"죄송합니다", es:"Lo siento", pt:"Desculpe" },
  { emoji:"🆘", ja:"助けてください！", en:"Help me!", zh:"救命！", ko:"도와주세요!", es:"¡Ayuda!", pt:"Ajuda!" },
  { emoji:"👮", ja:"警察を呼んでください", en:"Please call the police", zh:"请叫警察", ko:"경찰을 불러주세요", es:"Llame a la policía", pt:"Chame a polícia" },
];

// ─────────────────────────────────────────────────────────
// TRAVEL LINKS
// ─────────────────────────────────────────────────────────
// TRAVEL_LINKS - 各言語対応URL + 多言語ラベル
const TRAVEL_LINKS = [
  { cat:"✈️", label:{ja:"Google フライト",en:"Google Flights",zh:"Google 航班",ko:"구글 항공",es:"Vuelos de Google",pt:"Google Voos"}, urls:{ja:"https://www.google.com/travel/flights?hl=ja",en:"https://www.google.com/travel/flights?hl=en",zh:"https://www.google.com/travel/flights?hl=zh-CN",ko:"https://www.google.com/travel/flights?hl=ko",es:"https://www.google.com/travel/flights?hl=es",pt:"https://www.google.com/travel/flights?hl=pt"}, desc:{ja:"最安値を一括比較",en:"Compare cheapest flights",zh:"比较最便宜的航班",ko:"최저가 항공편 비교",es:"Compara los vuelos más baratos",pt:"Comparar voos mais baratos"}, color:"#1a73e8" },
  { cat:"✈️", label:"Skyscanner", urls:{ja:"https://www.skyscanner.jp/",en:"https://www.skyscanner.net/",zh:"https://www.skyscanner.com.hk/",ko:"https://www.skyscanner.co.kr/",es:"https://www.skyscanner.es/",pt:"https://www.skyscanner.com.br/"}, desc:{ja:"世界最大の比較サイト",en:"World's largest flight search",zh:"世界最大的机票比较",ko:"세계 최대 항공권 비교",es:"Mayor buscador de vuelos del mundo",pt:"Maior buscador de voos do mundo"}, color:"#0770e3" },
  { cat:"🏨", label:"Booking.com", urls:{ja:"https://www.booking.com/index.ja.html",en:"https://www.booking.com/index.en.html",zh:"https://www.booking.com/index.zh-cn.html",ko:"https://www.booking.com/index.ko.html",es:"https://www.booking.com/index.es.html",pt:"https://www.booking.com/index.pt-br.html"}, desc:{ja:"世界No.1宿泊予約",en:"World's #1 accommodation booking",zh:"全球第一住宿预订",ko:"세계 1위 숙박 예약",es:"Reserva de alojamiento #1 mundial",pt:"Reserva de hospedagem #1 do mundo"}, color:"#003580" },
  { cat:"🏨", label:"Agoda", urls:{ja:"https://www.agoda.com/ja-jp/",en:"https://www.agoda.com/en-us/",zh:"https://www.agoda.com/zh-cn/",ko:"https://www.agoda.com/ko-kr/",es:"https://www.agoda.com/es-es/",pt:"https://www.agoda.com/pt-br/"}, desc:{ja:"アジア最大の宿泊予約",en:"Asia's top hotel booking",zh:"亚洲最大住宿预订",ko:"아시아 최대 숙박 예약",es:"Mayor reserva de hoteles de Asia",pt:"Maior reserva de hotéis da Ásia"}, color:"#e03c1b" },
  { cat:"🗺️", label:{ja:"外務省 海外安全情報",en:"US State Dept. Travel Advisory",zh:"外交部领事服务",ko:"외교부 해외안전여행",es:"Avisos de Viaje (España)",pt:"Itamaraty Viagens"}, urls:{ja:"https://www.anzen.mofa.go.jp/",en:"https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html",zh:"http://cs.mfa.gov.cn/",ko:"https://www.0404.go.kr/",es:"https://www.exteriores.gob.es/Embajadas/Paginas/index.aspx",pt:"https://www.gov.br/mre/pt-br"}, desc:{ja:"危険情報・感染症情報",en:"Travel safety & health alerts",zh:"出行安全信息",ko:"여행 안전 정보",es:"Información de seguridad",pt:"Informações de segurança"}, color:"#1a3a6e" },
  { cat:"🗺️", label:"Google Maps", urls:{ja:"https://maps.google.co.jp/",en:"https://maps.google.com/",zh:"https://maps.google.com/?hl=zh-CN",ko:"https://maps.google.com/?hl=ko",es:"https://maps.google.com/?hl=es",pt:"https://maps.google.com/?hl=pt"}, desc:{ja:"ルート案内・乗換検索",en:"Navigation & transit",zh:"路线导航・公交查询",ko:"길찾기・대중교통 검색",es:"Rutas y transporte",pt:"Rotas e transporte"}, color:"#34a853" },
  { cat:"🌐", label:"Google Translate", urls:{ja:"https://translate.google.co.jp/",en:"https://translate.google.com/",zh:"https://translate.google.com/?hl=zh-CN",ko:"https://translate.google.com/?hl=ko",es:"https://translate.google.com/?hl=es",pt:"https://translate.google.com/?hl=pt"}, desc:{ja:"カメラ翻訳・音声対応",en:"Camera & voice translation",zh:"相机翻译・语音翻译",ko:"카메라・음성 번역",es:"Traducción con cámara y voz",pt:"Tradução por câmera e voz"}, color:"#4285f4" },
  { cat:"🌐", label:"DeepL", urls:{ja:"https://www.deepl.com/ja/translator",en:"https://www.deepl.com/en/translator",zh:"https://www.deepl.com/zh/translator",ko:"https://www.deepl.com/ko/translator",es:"https://www.deepl.com/es/translator",pt:"https://www.deepl.com/pt-br/translator"}, desc:{ja:"高精度AI翻訳",en:"High-accuracy AI translation",zh:"高精度AI翻译",ko:"고정밀 AI 번역",es:"Traducción IA de alta precisión",pt:"Tradução IA de alta precisão"}, color:"#0d3b85" },
  { cat:"🛡️", label:"TripAdvisor", urls:{ja:"https://www.tripadvisor.jp/",en:"https://www.tripadvisor.com/",zh:"https://www.tripadvisor.cn/",ko:"https://www.tripadvisor.co.kr/",es:"https://www.tripadvisor.es/",pt:"https://www.tripadvisor.com.br/"}, desc:{ja:"口コミ・観光情報",en:"Reviews & travel info",zh:"评论与旅游信息",ko:"후기와 관광 정보",es:"Opiniones e info de viaje",pt:"Avaliações e info de viagem"}, color:"#00aa6c" },
  { cat:"🛡️", label:"Rome2rio", urls:{ja:"https://www.rome2rio.com/ja/",en:"https://www.rome2rio.com/",zh:"https://www.rome2rio.com/zh/",ko:"https://www.rome2rio.com/ko/",es:"https://www.rome2rio.com/es/",pt:"https://www.rome2rio.com/pt/"}, desc:{ja:"世界中の移動方法を検索",en:"Find any route worldwide",zh:"查询全球出行方式",ko:"전 세계 이동 검색",es:"Encuentra rutas mundiales",pt:"Encontre rotas mundiais"}, color:"#f57c00" },
];
const LINK_CATS = [...new Set(TRAVEL_LINKS.map(l => l.cat))];

// ─────────────────────────────────────────────────────────
// TREND DATA
// ─────────────────────────────────────────────────────────
const TREND_DATA = [
  { city:{ja:"🇯🇵 東京",en:"🇯🇵 Tokyo",zh:"🇯🇵 东京",ko:"🇯🇵 도쿄",es:"🇯🇵 Tokio",pt:"🇯🇵 Tóquio"}, item:{ja:"ランチセット",en:"Lunch set",zh:"午餐套餐",ko:"런치 세트",es:"Menú del día",pt:"Refeição executiva"}, old:"¥900", now:"¥1,200", pct:"+33%", dir:"up", barW:70 },
  { city:{ja:"🇹🇭 バンコク",en:"🇹🇭 Bangkok",zh:"🇹🇭 曼谷",ko:"🇹🇭 방콕",es:"🇹🇭 Bangkok",pt:"🇹🇭 Bangkok"}, item:{ja:"パッタイ（屋台）",en:"Pad Thai (street)",zh:"泰式炒河粉（街边）",ko:"팟타이 (포장마차)",es:"Pad Thai (calle)",pt:"Pad Thai (rua)"}, old:"40 THB", now:"60 THB", pct:"+50%", dir:"up", barW:65 },
  { city:{ja:"🇺🇸 ニューヨーク",en:"🇺🇸 New York",zh:"🇺🇸 纽约",ko:"🇺🇸 뉴욕",es:"🇺🇸 Nueva York",pt:"🇺🇸 Nova York"}, item:{ja:"タクシー初乗り",en:"Taxi base fare",zh:"出租车起步价",ko:"택시 기본 요금",es:"Tarifa base de taxi",pt:"Tarifa inicial de táxi"}, old:"$3", now:"$5+", pct:"+67%", dir:"up", barW:80 },
  { city:{ja:"🇮🇳 ムンバイ",en:"🇮🇳 Mumbai",zh:"🇮🇳 孟买",ko:"🇮🇳 뭄바이",es:"🇮🇳 Bombay",pt:"🇮🇳 Mumbai"}, item:{ja:"オートリクシャー5km",en:"Auto-rickshaw 5km",zh:"三轮车5公里",ko:"릭샤 5km",es:"Auto-rickshaw 5km",pt:"Rickshaw 5km"}, old:"₹80", now:"₹120", pct:"+50%", dir:"up", barW:60 },
  { city:{ja:"🇦🇺 シドニー",en:"🇦🇺 Sydney",zh:"🇦🇺 悉尼",ko:"🇦🇺 시드니",es:"🇦🇺 Sídney",pt:"🇦🇺 Sydney"}, item:{ja:"カフェコーヒー",en:"Cafe coffee",zh:"咖啡馆咖啡",ko:"카페 커피",es:"Café de cafetería",pt:"Café de cafeteria"}, old:"A$4", now:"A$5.5", pct:"+38%", dir:"up", barW:55 },
  { city:{ja:"🇸🇬 シンガポール",en:"🇸🇬 Singapore",zh:"🇸🇬 新加坡",ko:"🇸🇬 싱가포르",es:"🇸🇬 Singapur",pt:"🇸🇬 Singapura"}, item:{ja:"ホーカーミール",en:"Hawker meal",zh:"熟食中心餐",ko:"호커 식사",es:"Comida hawker",pt:"Refeição hawker"}, old:"S$4", now:"S$6", pct:"+50%", dir:"up", barW:62 },
  { city:{ja:"🇻🇳 ホーチミン",en:"🇻🇳 Ho Chi Minh",zh:"🇻🇳 胡志明市",ko:"🇻🇳 호치민",es:"🇻🇳 Ho Chi Minh",pt:"🇻🇳 Ho Chi Minh"}, item:{ja:"フォー",en:"Pho",zh:"越南河粉",ko:"쌀국수",es:"Pho",pt:"Pho"}, old:"50k VND", now:"70k VND", pct:"+40%", dir:"up", barW:50 },
  { city:{ja:"🇮🇩 バリ島",en:"🇮🇩 Bali",zh:"🇮🇩 巴厘岛",ko:"🇮🇩 발리",es:"🇮🇩 Bali",pt:"🇮🇩 Bali"}, item:{ja:"ナシゴレン",en:"Nasi goreng",zh:"印尼炒饭",ko:"나시고렝",es:"Nasi goreng",pt:"Nasi goreng"}, old:"25k IDR", now:"40k IDR", pct:"+60%", dir:"up", barW:58 },
  { city:{ja:"🇹🇷 イスタンブール",en:"🇹🇷 Istanbul",zh:"🇹🇷 伊斯坦布尔",ko:"🇹🇷 이스탄불",es:"🇹🇷 Estambul",pt:"🇹🇷 Istambul"}, item:{ja:"チャイ",en:"Chai tea",zh:"红茶",ko:"차이",es:"Té chai",pt:"Chá chai"}, old:"10 TRY", now:"25 TRY", pct:"+150%", dir:"up", barW:90 },
  { city:{ja:"🇬🇷 アテネ",en:"🇬🇷 Athens",zh:"🇬🇷 雅典",ko:"🇬🇷 아테네",es:"🇬🇷 Atenas",pt:"🇬🇷 Atenas"}, item:{ja:"カフェ",en:"Coffee",zh:"咖啡",ko:"커피",es:"Café",pt:"Café"}, old:"€2", now:"€3.5", pct:"+75%", dir:"up", barW:72 },
];

// ─────────────────────────────────────────────────────────
// DESIGN SYSTEM
// ─────────────────────────────────────────────────────────
const S = {
  accent:"#1a56a0", accentLight:"#3b82d4", light:"#60b0e8",
  muted:"#6b6560", border:"#d4cec8", bg:"#f5f3ee",
  card:"#ffffff", tag:"#eceae4",
  cheap:"#006e52", normal:"#7a5e00", expensive:"#b84800",
  grad:"linear-gradient(165deg,#0a1a2e 0%,#16213e 50%,#1a3a5c 100%)",
  emerald:"linear-gradient(145deg,#052e1c,#065f46)",
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
  }, []);

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
    const cityLabel = (globalCountry?.cities?.en || globalCountry?.cities?.ja || [])[idx >= 0 ? idx : 0] || city || "";
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
        const label = (c.label?.en || c.name);
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
    <button onClick={onClick} style={{ padding: small ? "6px 11px" : "9px 14px", background: selected ? S.accent : S.tag, border: `1.5px solid ${selected ? S.accent : S.border}`, borderRadius: 24, fontSize: small ? 11 : 13, cursor: "pointer", color: selected ? "#fff" : "#1a1a14", whiteSpace: "nowrap", fontWeight: selected ? 700 : 400, transition: "all 0.2s" }}>
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
    <div style={{ background: S.bg, minHeight:"100vh", fontFamily:"'Noto Sans JP','DM Sans',sans-serif", paddingBottom:90 }}>
      {/* ── Inline CSS for mic animations ── */}
      <style>{`
        @keyframes npbar { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
        @keyframes nppulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes nprotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
      {/* ── A-5 Midnight Ocean background (stars + meridians + airplane trail) ── */}
      <div style={{ position:"fixed", top:0, left:0, right:0, height:380, background:S.grad, zIndex:0, overflow:"hidden" }}>
        <svg viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
          <defs>
            <radialGradient id="npGlow" cx="20%" cy="20%" r="55%">
              <stop offset="0%" stopColor="#60b0e8" stopOpacity="0.22"/>
              <stop offset="100%" stopColor="#60b0e8" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="npGlow2" cx="85%" cy="35%" r="45%">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.16"/>
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="npTrail" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#60b0e8" stopOpacity="0"/>
              <stop offset="50%" stopColor="#60b0e8" stopOpacity="0.45"/>
              <stop offset="100%" stopColor="#60b0e8" stopOpacity="0.05"/>
            </linearGradient>
            <linearGradient id="npTrail2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0"/>
              <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* Aurora glow overlays */}
          <rect width="400" height="380" fill="url(#npGlow)"/>
          <rect width="400" height="380" fill="url(#npGlow2)"/>
          {/* Globe meridians/latitudes (very subtle) */}
          <g opacity="0.07" stroke="#60b0e8" strokeWidth="0.8" fill="none">
            <ellipse cx="200" cy="190" rx="200" ry="200"/>
            <ellipse cx="200" cy="190" rx="140" ry="200"/>
            <ellipse cx="200" cy="190" rx="80" ry="200"/>
            <ellipse cx="200" cy="190" rx="20" ry="200"/>
            <ellipse cx="200" cy="190" rx="200" ry="70"/>
            <ellipse cx="200" cy="190" rx="200" ry="140"/>
          </g>
          {/* Airplane trails */}
          <path d="M -20 220 Q 200 90 420 260" stroke="url(#npTrail)" strokeWidth="1.5" fill="none" strokeDasharray="3,4" opacity="0.65"/>
          <path d="M -20 320 Q 200 200 420 60" stroke="url(#npTrail2)" strokeWidth="1.2" fill="none" strokeDasharray="2,3" opacity="0.45"/>
          {/* Stars */}
          {[
            [40,30,0.8,0.8],[120,25,0.5,0.6],[200,40,1.2,0.9],[280,20,0.7,0.7],
            [340,50,0.5,0.5],[370,80,0.8,0.6],[50,180,0.6,0.5],[160,220,0.5,0.4],
            [320,190,0.7,0.6],[380,240,0.5,0.5],[30,280,0.6,0.4],[250,290,0.5,0.5],
            [90,60,0.5,0.5],[170,90,0.6,0.6],[300,120,0.7,0.7],[60,330,0.6,0.5],
            [200,340,0.5,0.4],[360,330,0.7,0.6],[110,300,0.5,0.4],[230,160,0.6,0.5],
          ].map((s,i) => (
            <circle key={i} cx={s[0]} cy={s[1]} r={s[2]} fill="#fff" opacity={s[3]}/>
          ))}
          {/* Airplane emoji-style icon */}
          <text x="345" y="105" fontSize="11" opacity="0.55">✈️</text>
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
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.85)", fontWeight:700, letterSpacing:1 }}>🌍 {t.selectCountry}</div>
            {globalCountry && (
              <div style={{ fontSize:12, color:"#fff", fontWeight:700, background:"rgba(255,255,255,0.2)", padding:"2px 10px", borderRadius:14 }}>
                {globalCountry.flag} {globalCountry.label?.en || globalCountry.name}
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
              }} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 11px", background:globalCountry?.name===c.name?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.18)", border:`1.5px solid ${globalCountry?.name===c.name?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.3)"}`, borderRadius:36, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, color:globalCountry?.name===c.name?S.accent:"#fff", fontSize:11, fontWeight:globalCountry?.name===c.name?700:400 }}>
                <span style={{ fontSize:14 }}>{c.flag}</span>{c.label?.en || c.name}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════ CHECK TAB ══════════ */}
        {tab === "check" && (
          <div>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#10b981", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:4, textShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>{t.checkT}</div>
              <div style={{ fontSize:11, color:"#047857", fontWeight:600, background:"rgba(16,185,129,0.15)", display:"inline-block", padding:"3px 10px", borderRadius:18, marginTop:3 }}>{t.checkD}</div>
            </div>
            <div style={{ margin:"0 14px", background:S.card, borderRadius:22, padding:18, boxShadow:"0 8px 40px rgba(0,0,0,0.13)" }}>
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
                    const label = (globalCountry.cities?.en || globalCountry.cities?.ja || [])[i] || jaKey;
                    return <Pill key={jaKey} selected={city===jaKey} onClick={() => { setCity(jaKey); setResult(null); }} small>{label}</Pill>;
                  })}
                </div>
              </>}

              {/* ② Main category */}
              {city && <>
                <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:7 }}>{t.s3}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:14 }}>
                  {MAIN_CATS.map(c => (
                    <button key={c.id} onClick={() => { setMainCat(c); setSubCatJa(null); setFoodGroup(null); setResult(null); setCompareItems([]); }} style={{ background:mainCat?.id===c.id?"#ddeeff":S.card, border:`2px solid ${mainCat?.id===c.id?S.accent:S.border}`, borderRadius:12, padding:12, cursor:"pointer", textAlign:"left", boxShadow:mainCat?.id===c.id?"0 2px 10px rgba(26,86,160,0.2)":"0 1px 3px rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{c.icon}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1a1a1a" }}>{c.name[lang] || c.name.ja}</div>
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
                    <button key={g.label.ja} onClick={() => { setFoodGroup(g.label.ja); setSubCatJa(null); setResult(null); }} style={{ padding:"6px 12px", background:foodGroup===g.label.ja?S.accent:S.tag, border:`1.5px solid ${foodGroup===g.label.ja?S.accent:S.border}`, borderRadius:24, fontSize:11, cursor:"pointer", color:foodGroup===g.label.ja?"#fff":"#1a1a14", whiteSpace:"nowrap", flexShrink:0, fontWeight:700 }}>
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
                  const sc = SUB_CATS[mainCat.id];
                  const keys = sc.ja; const labels = sc[lang] || sc.ja;
                  return <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>{keys.map((k,i) => <Pill key={k} selected={subCatJa===k} onClick={() => { setSubCatJa(k); setResult(null); }}>{labels[i]}</Pill>)}</div>;
                })()}
              </>}

              {/* Taxi extras */}
              {mainCat?.id === "taxi" && (
                <div style={{ marginBottom:14, display:"flex", flexDirection:"column", gap:10 }}>
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:S.muted, marginBottom:5 }}><span>{t.dist}</span><span style={{ color:S.accent, fontWeight:700 }}>{taxiDist} km</span></div>
                    <input type="range" min="1" max="50" value={taxiDist} onChange={e => { setTaxiDist(parseInt(e.target.value)); setResult(null); }} style={{ width:"100%", accentColor:S.accent }} />
                  </div>
                  <div>
                    <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:6 }}>{t.time}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:5 }}>
                      {[["朝",t.am,"🌅"],["昼",t.noon,"☀️"],["夕方",t.pm,"🌆"],["深夜",t.late,"🌙"]].map(([key,label,ic]) => (
                        <button key={key} onClick={() => { setTaxiTime(key); setResult(null); }} style={{ padding:"7px 3px", background:taxiTime===key?S.accent:S.tag, border:`1.5px solid ${taxiTime===key?S.accent:S.border}`, borderRadius:9, fontSize:10, cursor:"pointer", color:taxiTime===key?"#fff":"#1a1a14" }}>{ic} {label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ④ Amount */}
              {mainCat && subCatJa && <>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                  <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase" }}>{t.s5}</div>
                  <button onClick={() => { setCompareMode(!compareMode); setResult(null); setCompareItems([]); }} style={{ fontSize:10, padding:"4px 11px", borderRadius:20, border:`1.5px solid ${compareMode?S.accent:S.border}`, background:compareMode?S.accent:"transparent", color:compareMode?"#fff":S.muted, cursor:"pointer" }}>{compareMode?t.cmpOn:t.cmpOff}</button>
                </div>
                {!compareMode ? (
                  <>
                    <div style={{ background:S.tag, border:`1.5px solid ${parseFloat(amount)>0?S.accent:S.border}`, borderRadius:13, padding:13, marginBottom:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ background:S.accent, color:"#fff", padding:"6px 11px", borderRadius:9, fontSize:12, fontWeight:700 }}>{globalCountry?.currency || "--"}</div>
                        <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setResult(null); }} placeholder="0" style={{ flex:1, background:"none", border:"none", outline:"none", fontSize:32, fontFamily:"Georgia,serif", color:"#1a1a14", minWidth:0 }} />
                      </div>
                      {jpy && parseFloat(amount)>0 && <div style={{ fontSize:12, color:S.muted, marginTop:7, paddingTop:7, borderTop:`1px solid ${S.border}` }}>{t.approx(jpy)}</div>}
                    </div>
                    <button onClick={runJudge} disabled={!canJudge} style={{ width:"100%", background:canJudge?S.grad:"#ccc", color:"#fff", border:"none", borderRadius:13, padding:15, fontSize:14, fontWeight:700, cursor:canJudge?"pointer":"not-allowed", boxShadow:canJudge?"0 4px 15px rgba(26,86,160,0.4)":"none" }}>{t.judge}</button>
                  </>
                ) : (
                  <div>
                    <div style={{ background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:13, padding:13, marginBottom:8 }}>
                      <input value={cmpName} onChange={e => setCmpName(e.target.value)} placeholder={t.itemPh} style={{ width:"100%", background:"none", border:"none", outline:"none", fontSize:12, color:"#1a1a14", marginBottom:8, fontFamily:"inherit" }} />
                      <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                        <div style={{ background:S.accent, color:"#fff", padding:"6px 10px", borderRadius:9, fontSize:11, fontWeight:700 }}>{globalCountry?.currency}</div>
                        <input type="number" value={cmpAmt} onChange={e => setCmpAmt(e.target.value)} placeholder={t.amtPh} style={{ flex:1, background:"none", border:"none", outline:"none", fontSize:24, fontFamily:"Georgia,serif", color:"#1a1a14", minWidth:0 }} />
                        <button onClick={addToCompare} style={{ background:S.accent, color:"#fff", border:"none", borderRadius:9, padding:"8px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>{t.add}</button>
                      </div>
                    </div>
                    {compareItems.length>0 && (
                      <div style={{ background:S.card, border:`1px solid ${S.border}`, borderRadius:13, padding:12, marginBottom:8 }}>
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
                    <div style={{ background:result.bg, borderRadius:13, padding:14, marginBottom:10, display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ fontSize:42 }}>{result.emoji}</div>
                      <div>
                        <div style={{ fontSize:24, fontFamily:"Georgia,serif", fontWeight:"bold", color:result.color }}>{result.verdict}</div>
                        <div style={{ fontSize:11, color:S.muted, marginTop:2 }}>
                          {result.verdict===t.cheap?t.cheapD(result.pct):result.verdict===t.exp?t.expD(result.pct):t.normalD}
                        </div>
                      </div>
                    </div>
                    <div style={{ height:6, background:S.tag, borderRadius:3, marginBottom:12, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${result.barPct}%`, background:"linear-gradient(90deg,#006e52,#7a5e00,#b84800)", borderRadius:3, transition:"width 0.8s" }} />
                    </div>
                    <div style={{ background:"#f6f4f0", borderLeft:`3px solid ${S.accent}`, borderRadius:9, padding:11, marginBottom:10 }}>
                      <div style={{ fontSize:9, letterSpacing:2, color:S.accent, fontWeight:700, textTransform:"uppercase", marginBottom:5 }}>{t.priceD}</div>
                      <div style={{ fontSize:11, lineHeight:1.8 }}>{(() => {
                        const r = typeof result.reason === "object" ? (result.reason.en || result.reason.ja || "") : (result.reason || "");
                        // 日本語が含まれているかチェック（ひらがな・カタカナ・漢字）
                        const hasJapanese = /[ぁ-んァ-ヶー一-龯]/.test(r);
                        if (hasJapanese) {
                          // 英語の定型文に置き換え
                          return `Typical range: ${result.min.toLocaleString()}〜${result.max.toLocaleString()} ${result.currency} (avg ${result.avg.toLocaleString()}).`;
                        }
                        return r;
                      })()}</div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:10 }}>
                      {[[t.avgL,result.avg],[t.minL,result.min],[t.maxL,result.max]].map(([l,v]) => (
                        <div key={l} style={{ background:S.tag, borderRadius:9, padding:"9px 5px", textAlign:"center" }}>
                          <div style={{ fontSize:9, color:S.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:2 }}>{l}</div>
                          <div style={{ fontSize:11, fontFamily:"Georgia,serif" }}>{typeof v==="number"?v.toLocaleString():v} {result.currency}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"inline-flex", alignItems:"center", gap:3, padding:"4px 11px", borderRadius:18, fontSize:10, fontWeight:600, background:result.trend?.includes("+")?"#fdeee0":"#edeae4", color:result.trend?.includes("+")?"#b84800":S.muted }}>
                      {result.trend?.includes("+")?t.trendUp(result.trend.replace(/\+/g,"")):t.trendSt(result.trend)}
                    </div>

                    {/* 交渉アシスタント */}
                    {result.isExpensive && negotiateCountry && (
                      <div style={{ marginTop:16, background:"linear-gradient(135deg,#fff7ed,#fef3c7)", border:`2px solid #f59e0b`, borderRadius:16, padding:16 }}>
                        <div style={{ fontSize:14, fontWeight:800, color:"#92400e", marginBottom:4 }}>💬 {t.negotiateTitle}</div>
                        <div style={{ fontSize:11, color:"#78350f", marginBottom:14, lineHeight:1.5 }}>{t.negotiateDesc} ({negotiateCountry.flag} {negotiateCountry.localLangName})</div>
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:10, color:"#92400e", fontWeight:700, marginBottom:6 }}>🗣️ {t.negotiateYou}</div>
                          <textarea value={negYouText} onChange={e => setNegYouText(e.target.value)} placeholder={t.negYouPh} style={{ width:"100%", background:"rgba(255,255,255,0.7)", border:"1.5px solid #f59e0b", borderRadius:9, padding:"8px 11px", fontSize:12, fontFamily:"inherit", resize:"vertical", minHeight:54, outline:"none", boxSizing:"border-box", marginBottom:6 }} />
                          <div style={{ display:"flex", gap:6 }}>
                            <div style={{ flex:1 }}>
                              <HoldMicButton
                                onStart={() => startListeningHold(lang, setNegYouListening, setNegYouText, negMicRefYou)}
                                onEnd={() => stopListeningHold(negMicRefYou, setNegYouListening)}
                                isListening={negYouListening}
                                label={t.transHold}
                              />
                            </div>
                            <button onClick={handleNegYouSpeak} disabled={negYouTranslating||!negYouText.trim()} style={{ flex:1, padding:"9px", background:negYouTranslating?"#fef3c7":"#f59e0b", border:"none", borderRadius:14, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>
                              {negYouTranslating?t.transTranslating:"🌐 "+t.transTranslate}
                            </button>
                          </div>
                          {negYouTranslated && (
                            <div style={{ marginTop:8, padding:10, background:"#065f46", borderRadius:10 }}>
                              <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginBottom:6 }}>{negYouTranslated}</div>
                              <div style={{ display:"flex", gap:6 }}>
                                <button onClick={() => speakText(negYouTranslated, negotiateCountry.localLang)} style={{ flex:1, padding:"7px", background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>🔊 {t.transSpeak}</button>
                                <button onClick={() => handleCopy(negYouTranslated, "neg-you")} style={{ flex:1, padding:"7px", background:copied==="neg-you"?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.1)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>{copied==="neg-you"?t.transCopied:t.transCopy}</button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize:10, color:"#92400e", fontWeight:700, marginBottom:6 }}>👂 {t.negotiatePartner}</div>
                          <textarea value={negPartnerText} onChange={e => setNegPartnerText(e.target.value)} placeholder={`${negotiateCountry.flag} ${negotiateCountry.localLangName}...`} style={{ width:"100%", background:"rgba(255,255,255,0.7)", border:"1.5px solid #f59e0b", borderRadius:9, padding:"8px 11px", fontSize:12, fontFamily:"inherit", resize:"vertical", minHeight:54, outline:"none", boxSizing:"border-box", marginBottom:6 }} />
                          <div style={{ display:"flex", gap:6 }}>
                            <div style={{ flex:1 }}>
                              <HoldMicButton
                                onStart={() => startListeningHold(negotiateCountry.localLang, setNegPartnerListening, setNegPartnerText, negMicRefPartner)}
                                onEnd={() => stopListeningHold(negMicRefPartner, setNegPartnerListening)}
                                isListening={negPartnerListening}
                                label={t.transHold}
                              />
                            </div>
                            <button onClick={handleNegPartnerSpeak} disabled={negPartnerTranslating||!negPartnerText.trim()} style={{ flex:1, padding:"9px", background:negPartnerTranslating?"#fef3c7":"#f59e0b", border:"none", borderRadius:14, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>
                              {negPartnerTranslating?t.transTranslating:"🌐 "+t.transTranslate}
                            </button>
                          </div>
                          {negPartnerTranslated && (
                            <div style={{ marginTop:8, padding:10, background:"#1a56a0", borderRadius:10 }}>
                              <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>💬 {negPartnerTranslated}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>}
            </div>

            {/* 投稿セクション */}
            {(result||compareItems.length>0) && (
              <div style={{ margin:"10px 14px 0", background:S.card, border:`1.5px solid ${S.border}`, borderRadius:15, padding:14 }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{t.postT}</div>
                <div style={{ fontSize:10, color:S.muted, marginBottom:10, lineHeight:1.5 }}>{t.postD}</div>
                <input value={postItem} onChange={e => setPostItem(e.target.value)} placeholder={t.postPh} style={{ width:"100%", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, outline:"none", fontFamily:"inherit", marginBottom:6, boxSizing:"border-box" }} />
                <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                  <input value={postPrice} onChange={e => setPostPrice(e.target.value)} type="number" placeholder={t.amtPh} style={{ flex:1, background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, outline:"none", fontFamily:"inherit" }} />
                </div>
                <textarea value={postText} onChange={e => setPostText(e.target.value)} placeholder={t.postComment} style={{ width:"100%", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, fontFamily:"inherit", resize:"vertical", minHeight:60, outline:"none", boxSizing:"border-box", marginBottom:6 }} />
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <button onClick={() => photoInputRef.current?.click()} style={{ padding:"8px 12px", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, fontSize:11, cursor:"pointer", color:S.muted }}>📷</button>
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display:"none" }} />
                  {postPhotoPreview && <img src={postPhotoPreview} style={{ width:40, height:40, objectFit:"cover", borderRadius:6, border:`1px solid ${S.border}` }} />}
                  <button onClick={submitPost} style={{ flex:1, background:S.accent, color:"#fff", border:"none", borderRadius:9, padding:"8px 13px", fontSize:11, fontWeight:700, cursor:"pointer" }}>{t.postSv}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ SCAM TAB ══════════ */}
        {tab === "scam" && (
          <div style={{ background:S.bg, minHeight:"100vh" }}>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#10b981", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:4, textShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>{t.scamT}</div>
              <div style={{ fontSize:11, color:"#047857", fontWeight:600, background:"rgba(16,185,129,0.15)", display:"inline-block", padding:"3px 10px", borderRadius:18, marginTop:3 }}>{t.scamD}</div>
            </div>
            {/* City select */}
            {globalCountry && (() => {
              const sd = SCAM_DATA[globalCountry.name];
              const citiesWithData = (globalCountry?.cities?.ja||[]).filter(jaKey => sd?.[jaKey]);
              if (citiesWithData.length===0) return null;
              return (
                <div style={{ background:"#f8f6f2", padding:"10px 0 10px 14px", borderTop:`1px solid ${S.border}` }}>
                  <div style={{ fontSize:9, letterSpacing:2, color:S.muted, textTransform:"uppercase", marginBottom:7, paddingRight:14 }}>🏙️ CITY</div>
                  <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:3, paddingRight:14, scrollbarWidth:"none" }}>
                    <button onClick={() => setScamCity(null)} style={{ padding:"6px 12px", background:!scamCity?S.accent:S.tag, border:`1.5px solid ${!scamCity?S.accent:S.border}`, borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer", color:!scamCity?"#fff":"#1a1a14", whiteSpace:"nowrap", flexShrink:0 }}>
                      {t.cityAll}
                    </button>
                    {citiesWithData.map(jaKey => {
                      const idx = (globalCountry?.cities?.ja||[]).indexOf(jaKey);
                      const label = (globalCountry?.cities?.en||globalCountry?.cities?.ja||[])[idx]||jaKey;
                      return <button key={jaKey} onClick={() => setScamCity(jaKey)} style={{ padding:"6px 12px", background:scamCity===jaKey?S.accent:S.tag, border:`1.5px solid ${scamCity===jaKey?S.accent:S.border}`, borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer", color:scamCity===jaKey?"#fff":"#1a1a14", whiteSpace:"nowrap", flexShrink:0 }}>{label}</button>;
                    })}
                  </div>
                </div>
              );
            })()}
            {/* Scam cards */}
            <div style={{ margin:"10px 14px 0" }}>
              {!globalCountry ? (
                <div style={{ background:S.card, borderRadius:18, padding:30, textAlign:"center", color:S.muted, boxShadow:"0 2px 12px rgba(0,0,0,0.07)" }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🛡️</div>
                  <div style={{ fontSize:13 }}>{t.scamSel}</div>
                </div>
              ) : (() => {
                const { city: cityScams, national } = getScams();
                const showCity = scamCity && cityScams.length > 0;
                const items = showCity ? cityScams : national;
                if (items.length === 0) return (
                  <div style={{ background:S.card, borderRadius:18, padding:30, textAlign:"center", color:S.muted }}>
                    <div style={{ fontSize:13 }}>{t.noPrice}</div>
                  </div>
                );
                return (
                  <>
                    {showCity ? (
                      <div style={{ background:"#fef3c7", borderRadius:11, padding:"8px 12px", marginBottom:10, fontSize:11, color:"#92400e", fontWeight:600 }}>
                        🏙️ {getCityEN(globalCountry, scamCity)}{t.scamCitySpecific}
                      </div>
                    ) : (
                      <div style={{ background:"#dbeafe", borderRadius:11, padding:"8px 12px", marginBottom:10, fontSize:11, color:"#1e40af", fontWeight:600 }}>
                        🌍 {globalCountry.label?.en || globalCountry.name} · {t.scamCityHdr2}
                      </div>
                    )}
                    {items.map((s,i) => (
                      <div key={i} style={{ background:S.card, borderRadius:14, padding:14, marginBottom:9, boxShadow:"0 2px 10px rgba(0,0,0,0.07)", borderLeft:`4px solid ${s.level==="high"?"#c05000":s.level==="med"?"#8a6800":"#595550"}` }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                          <div style={{ fontSize:24, flexShrink:0 }}>{s.icon}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap" }}>
                              <div style={{ fontSize:13, fontWeight:700 }}>{s.title[lang]||s.title.ja||s.title.en}</div>
                              <div style={{ fontSize:10, padding:"2px 8px", borderRadius:18, fontWeight:700, background:s.level==="high"?"#fdeee0":s.level==="med"?"#fdf6d8":"#edeae4", color:s.level==="high"?"#c05000":s.level==="med"?"#8a6800":"#595550" }}>
                                {s.level==="high"?t.lH:s.level==="med"?t.lM:t.lL}
                              </div>
                            </div>
                            <div style={{ fontSize:12, color:"#333", lineHeight:1.75 }}>{s.desc[lang]||s.desc.ja||s.desc.en}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ background:"#deeeff", borderRadius:11, padding:11, marginBottom:14, fontSize:11, color:"#003f7a", lineHeight:1.75, fontWeight:600 }}>{t.scamNote}</div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ══════════ TRANSLATE TAB ══════════ */}
        {tab === "trans" && (
          <div style={{ background:S.bg, minHeight:"100vh" }}>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#10b981", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:4, textShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>{t.transT}</div>
              <div style={{ fontSize:11, color:"#047857", fontWeight:600, background:"rgba(16,185,129,0.15)", display:"inline-block", padding:"3px 10px", borderRadius:18, marginTop:3 }}>{t.transD}</div>
            </div>
            <div style={{ margin:"10px 14px 0" }}>
              {!globalCountry ? (
                <div style={{ background:S.card, borderRadius:18, padding:30, textAlign:"center", color:S.muted }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🌐</div>
                  <div style={{ fontSize:13 }}>{t.transSelCountry}</div>
                </div>
              ) : (
                <>
                  {/* 言語インジケーター */}
                  <div style={{ background:S.card, borderRadius:11, padding:"9px 13px", marginBottom:10, display:"flex", alignItems:"center", gap:8, border:`1px solid ${S.border}` }}>
                    <span style={{ fontSize:18 }}>{globalCountry.flag}</span>
                    <span style={{ fontSize:11, color:S.accent, fontWeight:700 }}>{globalCountry.localLangName}</span>
                    <span style={{ marginLeft:"auto", fontSize:10, color:S.muted }}>Anthropic AI翻訳</span>
                  </div>

                  {/* あなた → 現地語 */}
                  <div style={{ background:S.card, borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:S.accent, marginBottom:10, letterSpacing:0.5 }}>🗣️ {t.transYou}</div>
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
                      <button onClick={handleYouSpeak} disabled={youTranslating||!youText.trim()} style={{ flex:1, padding:"11px", background:youTranslating?"#fef3c7":S.accentLight, border:"none", borderRadius:14, fontSize:12, fontWeight:700, cursor:"pointer", color:"#fff" }}>
                        {youTranslating ? t.transTranslating : "🌐 "+t.transTranslate}
                      </button>
                    </div>
                    {youTranslated && (
                      <div style={{ padding:14, background:"#065f46", borderRadius:12 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:"#fff", marginBottom:8, lineHeight:1.5 }}>{globalCountry.flag} {youTranslated}</div>
                        <div style={{ display:"flex", gap:7 }}>
                          <button onClick={() => speakText(youTranslated, globalCountry.localLang)} style={{ flex:1, padding:"8px", background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:9, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>🔊 {t.transSpeak}</button>
                          <button onClick={() => handleCopy(youTranslated, "you")} style={{ flex:1, padding:"8px", background:copied==="you"?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.1)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:9, fontSize:11, fontWeight:700, cursor:"pointer", color:"#fff" }}>{copied==="you"?t.transCopied:t.transCopy}</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 相手 → あなたの言語 */}
                  <div style={{ background:S.card, borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#b84800", marginBottom:10, letterSpacing:0.5 }}>👂 {t.transPartner}</div>
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
                      <button onClick={handlePartnerSpeak} disabled={partnerTranslating||!partnerText.trim()} style={{ flex:1, padding:"11px", background:partnerTranslating?"#fef3c7":"#b84800", border:"none", borderRadius:14, fontSize:12, fontWeight:700, cursor:"pointer", color:"#fff" }}>
                        {partnerTranslating ? t.transTranslating : "🌐 "+t.transTranslate}
                      </button>
                    </div>
                    {partnerTranslated && (
                      <div style={{ padding:14, background:"#1a56a0", borderRadius:12 }}>
                        <div style={{ fontSize:16, fontWeight:700, color:"#fff", lineHeight:1.5 }}>💬 {partnerTranslated}</div>
                      </div>
                    )}
                  </div>

                  {/* 固定緊急フレーズ - メイン:選択言語、サブ:旅行先言語、音声:旅行先言語 */}
                  <div style={{ background:S.card, borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#c05000", marginBottom:6 }}>{t.transFixed}</div>
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
                            <div style={{ fontSize:12, fontWeight:700, color:"#1a1a14" }}>{userText}</div>
                            <div style={{ fontSize:11, color:S.accent, marginTop:2, fontWeight:600 }}>{globalCountry.flag} {localText}</div>
                          </div>
                          <button onClick={() => speakText(localText, localLangCode)} style={{ padding:"8px 12px", background:S.accentLight, border:"none", borderRadius:9, fontSize:13, cursor:"pointer", flexShrink:0, color:"#fff" }}>🔊</button>
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
              <div style={{ fontSize:22, color:"#10b981", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:4, textShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>{t.travT}</div>
              <div style={{ fontSize:11, color:"#047857", fontWeight:600, background:"rgba(16,185,129,0.15)", display:"inline-block", padding:"3px 10px", borderRadius:18, marginTop:3 }}>{t.travD}</div>
            </div>
            <div style={{ background:S.card, padding:"12px 0 12px 14px", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
              <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:3, paddingRight:14, scrollbarWidth:"none" }}>
                {LINK_CATS.map(cat => (
                  <button key={cat} onClick={() => setLinkCat(cat)} style={{ padding:"7px 15px", background:linkCat===cat?S.accent:S.tag, border:`2px solid ${linkCat===cat?S.accent:S.border}`, borderRadius:22, fontSize:12, fontWeight:linkCat===cat?700:500, cursor:"pointer", color:linkCat===cat?"#fff":"#1a1a1a", whiteSpace:"nowrap", flexShrink:0 }}>{cat}</button>
                ))}
              </div>
            </div>
            <div style={{ margin:"8px 14px 0" }}>
              {TRAVEL_LINKS.filter(l => l.cat===linkCat).map((l,i) => {
                const linkUrl = (typeof l.urls === "object" ? (l.urls[lang] || l.urls.en || l.urls.ja) : l.url);
                return (
                <a key={i} href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ display:"block", textDecoration:"none", background:S.card, borderRadius:14, padding:14, marginBottom:9, boxShadow:"0 2px 8px rgba(0,0,0,0.07)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:11 }}>
                    <div style={{ width:38, height:38, borderRadius:9, background:l.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, color:"#fff", flexShrink:0 }}>{l.cat}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#1a1a14", marginBottom:2 }}>{typeof l.label==="object"?(l.label[lang]||l.label.ja||l.label.en):l.label}</div>
                      <div style={{ fontSize:10, color:S.muted }}>{typeof l.desc==="object"?(l.desc[lang]||l.desc.ja||l.desc.en):l.desc}</div>
                    </div>
                    <div style={{ fontSize:15, color:S.border }}>›</div>
                  </div>
                </a>
              );})}
              <div style={{ background:"rgba(26,86,160,0.07)", borderRadius:11, padding:11, marginBottom:14, fontSize:10, color:S.accent, lineHeight:1.7, fontWeight:600 }}>🔒 {t.travNote}</div>
            </div>
          </div>
        )}

        {/* ══════════ TREND TAB ══════════ */}
        {tab === "trend" && (
          <div>
            <div style={{ padding:"10px 18px 14px" }}>
              <div style={{ fontSize:22, color:"#10b981", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:4, textShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>{t.trendT}</div>
              <div style={{ fontSize:11, color:"#047857", fontWeight:600, background:"rgba(16,185,129,0.15)", display:"inline-block", padding:"3px 10px", borderRadius:18, marginTop:3 }}>{t.trendD}</div>
            </div>
            <div style={{ margin:"0 14px" }}>
              {TREND_DATA.map((td,i) => (
                <div key={i} style={{ background:S.card, borderRadius:16, padding:16, marginBottom:9, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ fontFamily:"Georgia,serif", fontSize:14, fontWeight:"bold" }}>{typeof td.city==="object"?(td.city.en||td.city.ja):td.city}</div>
                      <div style={{ fontSize:10, color:S.muted, marginTop:2 }}>{typeof td.item==="object"?(td.item[lang]||td.item.ja||td.item.en):td.item}</div>
                    </div>
                    <div style={{ padding:"3px 9px", borderRadius:18, fontSize:10, fontWeight:700, background:"#fdeee0", color:"#b84800" }}>↑ {td.pct}</div>
                  </div>
                  <div style={{ height:4, background:S.tag, borderRadius:2, marginBottom:6, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${td.barW}%`, background:"linear-gradient(90deg,#006e52,#7a5e00,#b84800)", borderRadius:2 }} />
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:S.muted }}>
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
              <div style={{ fontSize:22, color:"#10b981", fontFamily:"Georgia,serif", fontWeight:"bold", marginBottom:4, textShadow:"0 2px 8px rgba(0,0,0,0.15)" }}>{t.dbT}</div>
              <div style={{ fontSize:11, color:"#047857", fontWeight:600, background:"rgba(16,185,129,0.15)", display:"inline-block", padding:"3px 10px", borderRadius:18, marginTop:3 }}>{t.dbD}</div>
            </div>

            {/* 投稿フォーム（Twitter風） */}
            <div style={{ margin:"0 14px 10px", background:S.card, borderRadius:16, padding:16, boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize:12, fontWeight:700, color:S.accent, marginBottom:10 }}>✏️ {t.postPostBtn}</div>
              <input value={postItem} onChange={e => setPostItem(e.target.value)} placeholder={t.postPh} style={{ width:"100%", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, outline:"none", fontFamily:"inherit", marginBottom:6, boxSizing:"border-box" }} />
              <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                <div style={{ background:S.accent, color:"#fff", padding:"7px 11px", borderRadius:9, fontSize:11, fontWeight:700, flexShrink:0 }}>{globalCountry?.currency || "---"}</div>
                <input value={postPrice} onChange={e => setPostPrice(e.target.value)} type="number" placeholder={t.amtPh} style={{ flex:1, background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, outline:"none", fontFamily:"inherit" }} />
              </div>
              <textarea value={postText} onChange={e => setPostText(e.target.value)} placeholder={t.postComment} style={{ width:"100%", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:9, padding:"8px 11px", fontSize:11, fontFamily:"inherit", resize:"vertical", minHeight:70, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
              {postPhotoPreview && (
                <div style={{ marginBottom:8, position:"relative", display:"inline-block" }}>
                  <img src={postPhotoPreview} style={{ maxWidth:"100%", maxHeight:200, borderRadius:10, border:`1px solid ${S.border}` }} />
                  <button onClick={() => { setPostPhoto(null); setPostPhotoPreview(null); }} style={{ position:"absolute", top:4, right:4, width:22, height:22, borderRadius:"50%", background:"rgba(0,0,0,0.6)", border:"none", color:"#fff", cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                </div>
              )}
              <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                <button onClick={() => photoInputRef.current?.click()} style={{ padding:"9px 14px", background:S.tag, border:`1.5px solid ${S.border}`, borderRadius:10, fontSize:12, cursor:"pointer", color:S.muted, display:"flex", alignItems:"center", gap:5 }}>📷 {t.postPhoto}</button>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display:"none" }} />
                <button onClick={submitPost} style={{ flex:1, background:S.accent, color:"#fff", border:"none", borderRadius:10, padding:"9px 13px", fontSize:12, fontWeight:700, cursor:"pointer" }}>{t.postSv}</button>
              </div>
            </div>

            {/* 投稿一覧 */}
            <div style={{ margin:"0 14px" }}>
              {posts.length===0 ? (
                <div style={{ background:S.card, borderRadius:18, padding:34, textAlign:"center", color:S.muted }}>
                  <div style={{ fontSize:34, marginBottom:10 }}>🏪</div>
                  <div style={{ fontSize:13 }}>{t.dbE}</div>
                </div>
              ) : posts.map((p,i) => (
                <div key={i} style={{ background:S.card, borderRadius:14, padding:14, marginBottom:10, boxShadow:"0 2px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:p.text||p.photo?8:0 }}>
                    <div>
                      {p.item && <div style={{ fontSize:13, fontWeight:700 }}>{p.item}</div>}
                      <div style={{ fontSize:10, color:S.muted, marginTop:2 }}>{p.city} · {p.time}</div>
                    </div>
                    {p.price && <div style={{ fontFamily:"Georgia,serif", fontSize:15, color:S.accent, fontWeight:700, flexShrink:0 }}>{parseFloat(p.price).toLocaleString()} {p.currency}</div>}
                  </div>
                  {p.text && <div style={{ fontSize:12, color:"#333", lineHeight:1.6, marginBottom:p.photo?8:0 }}>{p.text}</div>}
                  {p.photo && <img src={p.photo} style={{ width:"100%", borderRadius:10, maxHeight:200, objectFit:"cover" }} />}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:860, background:"rgba(255,255,255,0.97)", backdropFilter:"blur(20px)", borderTop:`1px solid ${S.border}`, display:"flex", zIndex:100 }}>
        {[
          ["check","🔍",t.tabC],
          ["scam","⚠️",t.tabS],
          ["trans","🌐",t.tabTr],
          ["travel","✈️",t.tabTv],
          ["trend","📊",t.tabTd],
          ["db","🗄️",t.tabD],
        ].map(([id,icon,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex:1, padding:"11px 0 7px", textAlign:"center", cursor:"pointer", color:tab===id?S.accent:S.muted, fontSize:8, fontFamily:"inherit", letterSpacing:0.2, border:"none", background:"none", fontWeight:tab===id?700:400 }}>
            <div style={{ fontSize:16, marginBottom:2 }}>{icon}</div>{label}
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
        <div style={{ position:"fixed", bottom:95, left:"50%", transform:"translateX(-50%)", background:S.accent, color:"#fff", padding:"10px 20px", borderRadius:24, fontSize:12, fontWeight:600, zIndex:200, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(26,86,160,0.5)" }}>{toast}</div>
      )}

      {/* 設定モーダル */}
      {showSettings && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={() => setShowSettings(false)}>
          <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:860, maxHeight:"75vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:17, fontWeight:800, color:"#1a1a14" }}>{t.settingsTitle}</div>
              <button onClick={() => setShowSettings(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:S.muted }}>✕</button>
            </div>
            {Object.entries(hText).map(([key, text]) => (
              <div key={key} style={{ background:S.tag, borderRadius:12, padding:"12px 14px", marginBottom:8 }}>
                <div style={{ fontSize:12, lineHeight:1.7, color:"#333" }}>{text}</div>
              </div>
            ))}
            <div style={{ marginTop:12, padding:"10px 14px", background:"#deeeff", borderRadius:12, fontSize:11, color:"#003f7a", lineHeight:1.6 }}>
              {t.settingsNote}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
