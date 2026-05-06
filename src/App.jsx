import { useState, useEffect } from "react";

const LANGS=[{code:"ja",label:"🇯🇵 日本語"},{code:"en",label:"🇺🇸 English"},{code:"zh",label:"🇨🇳 中文"},{code:"ko",label:"🇰🇷 한국어"}];
const T={
  ja:{sub:"現地物価 AI判定",c15:"🌍 15カ国",rLive:"📡 リアルタイム為替",rFix:"📌 固定レート",rLoad:"⏳ 取得中...",
    s1:"① 国",s2:"② 都市",s3:"③ カテゴリ",s4:"④ 食事タイプ",s4b:"④ 種類",s5:"⑤ 金額",
    judge:"🔍 判定する",cmpOn:"✅ 比較",cmpOff:"🔄 比較",add:"＋追加",avgL:"平均",minL:"最安",maxL:"最高",
    cheap:"安い！",normal:"普通",exp:"高め",
    cheapD:(p)=>`平均より${p}%お得！`,expD:(p)=>`平均より${p}%高め`,normalD:"現地相場内です",
    priceD:"📊 相場データ",trendUp:(t)=>`📈 直近: ${t}値上がり`,trendSt:(t)=>`📊 直近: ${t}`,
    postT:"📍 価格を投稿",postD:"実際に払った金額を共有してDBに貢献！",postPh:"品目名",postSv:"保存",
    postOk:"✅ 保存しました！",noData:"データ準備中です",noCmp:"品目名と金額を入力",noPrice:"データなし",
    added:(n)=>`「${n}」追加`,dist:"距離",time:"時間帯",
    am:"朝",noon:"昼",pm:"夕方",late:"深夜",approx:(v)=>`≈ ${v} 円`,
    tabC:"判定",tabS:"詐欺警告",tabP:"フレーズ",tabTr:"旅行",tabTd:"トレンド",tabD:"DB",
    scamT:"⚠️ 詐欺・ぼったくり警告",scamD:"現地でよくある手口と対策",scamSel:"国を選んでください",
    scamNote:"🛡️ 困ったときは現地警察か日本大使館へ。外務省「たびレジ」への登録も推奨。",
    lH:"🔴 要注意",lM:"🟡 注意",lL:"🟢 軽度",
    phraseT:"💬 現地フレーズ集",phraseD:"値段交渉・食事・緊急時フレーズ",phraseSel:"国を選んでください",
    phLang:(l)=>`🗣️ ${l}　タップでコピー`,phAll:"すべて",phCopied:"✅ コピー！",phTap:"📋 コピー",
    travT:"旅行便利サイト",travD:"公式・信頼できるサービスのみ",travNote:"🔒 政府機関・公式サービスのみ掲載",
    trendT:"物価トレンド",trendD:"ユーザー投稿から見えるリアルな相場変動",prev:"前回",now:"現在",
    dbT:"投稿DB",dbD:"みんなが保存した価格データ",dbE:"まだ投稿がありません。判定後に投稿してDBを育てよう！",
    itemPh:"品目名（例：パッタイ、ステーキ）",amtPh:"金額",
  },
  en:{sub:"Local Price AI Judge",c15:"🌍 15 Countries",rLive:"📡 Live Rate",rFix:"📌 Fixed Rate",rLoad:"⏳ Loading...",
    s1:"① Country",s2:"② City",s3:"③ Category",s4:"④ Food Type",s4b:"④ Type",s5:"⑤ Amount",
    judge:"🔍 Judge Price",cmpOn:"✅ Compare",cmpOff:"🔄 Compare",add:"＋ Add",avgL:"Avg",minL:"Min",maxL:"Max",
    cheap:"Cheap!",normal:"Fair",exp:"Pricey",
    cheapD:(p)=>`${p}% below avg!`,expD:(p)=>`${p}% above avg`,normalD:"Within local average",
    priceD:"📊 Price Data",trendUp:(t)=>`📈 Recent: +${t}`,trendSt:(t)=>`📊 Recent: ${t}`,
    postT:"📍 Submit a Price",postD:"Share what you paid to help build the community DB!",postPh:"Item name",postSv:"Save",
    postOk:"✅ Saved! Thank you!",noData:"Data coming soon",noCmp:"Enter item name and amount",noPrice:"No data",
    added:(n)=>`Added "${n}"`,dist:"Distance",time:"Time of Day",
    am:"Morning",noon:"Noon",pm:"Evening",late:"Late Night",approx:(v)=>`≈ ¥${v}`,
    tabC:"Judge",tabS:"Scams",tabP:"Phrases",tabTr:"Travel",tabTd:"Trends",tabD:"DB",
    scamT:"⚠️ Scam & Ripoff Alerts",scamD:"Common scams and how to avoid them",scamSel:"Select a country",
    scamNote:"🛡️ If in trouble, contact local police or your embassy.",
    lH:"🔴 High Risk",lM:"🟡 Caution",lL:"🟢 Minor",
    phraseT:"💬 Local Phrases",phraseD:"Bargaining, dining & emergency phrases",phraseSel:"Select a country",
    phLang:(l)=>`🗣️ ${l}  Tap to copy`,phAll:"All",phCopied:"✅ Copied!",phTap:"📋 Tap to copy",
    travT:"Travel Resources",travD:"Official & trusted services only",travNote:"🔒 Official services only",
    trendT:"Price Trends",trendD:"Real price changes from user submissions",prev:"Before",now:"Now",
    dbT:"Price DB",dbD:"Real prices from our community",dbE:"No submissions yet. Judge a price and submit it!",
    itemPh:"Item name (e.g. Pad Thai, Steak)",amtPh:"Amount",
  },
  zh:{sub:"当地物价 AI 判断",c15:"🌍 15个国家",rLive:"📡 实时汇率",rFix:"📌 固定汇率",rLoad:"⏳ 加载中...",
    s1:"① 国家",s2:"② 城市",s3:"③ 分类",s4:"④ 餐饮类型",s4b:"④ 细分",s5:"⑤ 金额",
    judge:"🔍 开始判断",cmpOn:"✅ 对比",cmpOff:"🔄 对比",add:"＋添加",avgL:"均价",minL:"最低",maxL:"最高",
    cheap:"便宜！",normal:"合理",exp:"偏贵",
    cheapD:(p)=>`比均价低${p}%！`,expD:(p)=>`比均价高${p}%`,normalD:"在当地均价范围内",
    priceD:"📊 价格数据",trendUp:(t)=>`📈 近期: 涨${t}`,trendSt:(t)=>`📊 近期: ${t}`,
    postT:"📍 提交价格",postD:"分享您支付的价格，为社区数据库做贡献！",postPh:"商品名",postSv:"保存",
    postOk:"✅ 已保存！谢谢！",noData:"数据准备中",noCmp:"请输入商品名和金额",noPrice:"暂无数据",
    added:(n)=>`已添加「${n}」`,dist:"距离",time:"时间段",
    am:"早晨",noon:"中午",pm:"傍晚",late:"深夜",approx:(v)=>`≈ ¥${v}（日元）`,
    tabC:"判断",tabS:"诈骗警告",tabP:"常用语",tabTr:"旅行",tabTd:"趋势",tabD:"数据库",
    scamT:"⚠️ 诈骗与宰客警告",scamD:"当地常见手段与应对方法",scamSel:"请选择国家",
    scamNote:"🛡️ 遇到麻烦请联系当地警察或您国家的大使馆。",
    lH:"🔴 高风险",lM:"🟡 注意",lL:"🟢 轻微",
    phraseT:"💬 当地常用语",phraseD:"砍价、用餐和紧急情况常用语",phraseSel:"请选择国家",
    phLang:(l)=>`🗣️ ${l}  点击复制`,phAll:"全部",phCopied:"✅ 已复制！",phTap:"📋 点击复制",
    travT:"旅行实用网站",travD:"仅收录官方及可信赖服务",travNote:"🔒 仅收录官方服务",
    trendT:"物价趋势",trendD:"来自用户提交的实际价格变动",prev:"之前",now:"现在",
    dbT:"提交的价格",dbD:"来自社区的真实价格数据",dbE:"暂无提交。判断价格后提交，一起壮大数据库！",
    itemPh:"商品名（例：炒河粉、牛排）",amtPh:"金额",
  },
  ko:{sub:"현지 물가 AI 판정",c15:"🌍 15개국",rLive:"📡 실시간 환율",rFix:"📌 고정 환율",rLoad:"⏳ 로딩 중...",
    s1:"① 국가",s2:"② 도시",s3:"③ 카테고리",s4:"④ 음식 유형",s4b:"④ 세부",s5:"⑤ 금액",
    judge:"🔍 판정하기",cmpOn:"✅ 비교",cmpOff:"🔄 비교",add:"＋추가",avgL:"평균",minL:"최저",maxL:"최고",
    cheap:"저렴해요!",normal:"적당해요",exp:"비싸요",
    cheapD:(p)=>`평균보다 ${p}% 저렴!`,expD:(p)=>`평균보다 ${p}% 비쌈`,normalD:"현지 평균 범위 내",
    priceD:"📊 가격 데이터",trendUp:(t)=>`📈 최근: ${t} 인상`,trendSt:(t)=>`📊 최근: ${t}`,
    postT:"📍 가격 제출",postD:"실제로 지불한 가격을 공유해 DB를 함께 만들어요!",postPh:"항목명",postSv:"저장",
    postOk:"✅ 저장되었습니다! 감사합니다!",noData:"데이터 준비 중",noCmp:"항목명과 금액을 입력해주세요",noPrice:"데이터 없음",
    added:(n)=>`「${n}」 추가됨`,dist:"이동 거리",time:"시간대",
    am:"아침",noon:"낮",pm:"저녁",late:"심야",approx:(v)=>`≈ ¥${v}（엔）`,
    tabC:"판정",tabS:"사기 경보",tabP:"현지어",tabTr:"여행",tabTd:"트렌드",tabD:"DB",
    scamT:"⚠️ 사기·바가지 경보",scamD:"현지에서 흔한 수법과 대처법",scamSel:"국가를 선택해주세요",
    scamNote:"🛡️ 문제가 생기면 현지 경찰이나 한국 대사관에 연락하세요.",
    lH:"🔴 주의 필수",lM:"🟡 주의",lL:"🟢 경미",
    phraseT:"💬 현지 회화집",phraseD:"가격 흥정·식사·긴급 상황 표현",phraseSel:"국가를 선택해주세요",
    phLang:(l)=>`🗣️ ${l}  탭하여 복사`,phAll:"전체",phCopied:"✅ 복사됨!",phTap:"📋 탭하여 복사",
    travT:"여행 편의 사이트",travD:"공식 및 신뢰할 수 있는 서비스만",travNote:"🔒 공식 서비스만 수록",
    trendT:"물가 트렌드",trendD:"사용자 제출의 실제 가격 변동",prev:"이전",now:"현재",
    dbT:"제출된 가격",dbD:"커뮤니티의 실제 가격 데이터",dbE:"아직 없습니다. 가격을 판정 후 제출해보세요!",
    itemPh:"항목명 (예: 팟타이, 스테이크)",amtPh:"금액",
  },
};

const FALLBACK_RATES={THB:0.0043,KRW:0.011,USD:155,JPY:1,SGD:115,EUR:168,AUD:100,MYR:34,IDR:0.0096,PHP:2.7,TWD:4.8,GBP:197,VND:0.006};
async function fetchRates(){
  try{const r=await fetch("https://open.er-api.com/v6/latest/JPY");if(!r.ok)throw 0;const d=await r.json();const o={JPY:1};for(const[k,v]of Object.entries(d.rates)){if(v>0)o[k]=1/v;}return o;}catch{return null;}
}

const SCAM_DATA={
  タイ:[
    {icon:"🚕",title:{ja:"タクシーメーター拒否",en:"Taxi meter refusal",zh:"拒用计价器",ko:"미터기 거부"},level:"high",desc:{ja:"「今日は渋滞で高い」などの口実でメーターを使わない運転手に注意。必ず乗車前にメーターONを確認。",en:"Drivers claiming traffic is bad to avoid using the meter. Always confirm meter is ON before riding.",zh:"司机以堵车为由拒绝使用计价器。上车前务必确认计价器已打开。",ko:"교통체증을 핑계로 미터기를 안 쓰는 기사에 주의. 반드시 승차 전 미터기 ON 확인."}},
    {icon:"💎",title:{ja:"宝石詐欺",en:"Gem scam",zh:"宝石诈骗",ko:"보석 사기"},level:"high",desc:{ja:"「今日だけ特別価格」「本物の翡翠が激安」は100%詐欺。見知らぬ人の案内は断ること。",en:"'Special price today only' gem deals are 100% scams. Refuse guidance from strangers.",zh:"「今天特价」「正品翡翠」全是诈骗。拒绝陌生人的引导。",ko:"「오늘만 특가」 보석 거래는 100% 사기. 낯선 사람의 안내를 거절할 것."}},
    {icon:"🛺",title:{ja:"トゥクトゥク土産ツアー",en:"Tuk-tuk shop tour",zh:"嘟嘟车购物旅游",ko:"툭툭 쇼핑 투어"},level:"med",desc:{ja:"「観光地を案内する」と言って土産物店を回らせる商法。乗車前に目的地・金額を確認。",en:"'I'll show you around' leads to souvenir shop commissions. Agree on destination & price first.",zh:"以「带你游览」为名带入纪念品店赚回扣。上车前确认目的地和价格。",ko:"「관광 안내」 명목으로 기념품 가게를 돌게 하는 상법. 목적지·금액 먼저 확인."}},
    {icon:"🙏",title:{ja:"寺院入場詐欺",en:"Temple closed scam",zh:"寺庙关闭骗局",ko:"사원 폐쇄 사기"},level:"med",desc:{ja:"「今日は閉まっている」と言って別の場所へ誘導。実際は開いていることがほとんど。",en:"Strangers claim a temple is closed to redirect you. It's almost always open--verify officially.",zh:"陌生人谎称寺庙关闭将您引导到别处。实际上通常是开放的。",ko:"「오늘 문 닫았다」고 다른 곳으로 유도. 실제론 대부분 개방 중--공식 정보 확인."}},
  ],
  韓国:[
    {icon:"🚕",title:{ja:"空港白タク",en:"Airport tout taxi",zh:"机场黑车",ko:"공항 불법 택시"},level:"high",desc:{ja:"仁川空港で公式タクシー乗り場以外での勧誘に注意。必ず黄色い公式タクシーか公式カウンターで。",en:"Avoid solicitations outside official taxi stands at Incheon Airport. Use yellow official taxis.",zh:"仁川机场内避免在非官方出租车处乘车。使用黄色官方出租车或官方柜台。",ko:"인천공항에서 공식 택시 승강장 외 호객에 주의. 반드시 노란 공식 택시 이용."}},
    {icon:"🍷",title:{ja:"ぼったくりバー",en:"Overpriced bar scam",zh:"宰客酒吧",ko:"바가지 술집"},level:"high",desc:{ja:"梨泰院・弘大周辺の呼び込みバーで法外請求のケースあり。入店前に料金表を確認。",en:"Bars near Itaewon/Hongdae may overcharge. Always check the price list before entering.",zh:"梨泰院、弘大附近的招揽酒吧有乱收费现象。进店前查看价目表。",ko:"이태원·홍대 주변 호객 술집에서 과다 청구 사례 있음. 입장 전 가격표 확인."}},
    {icon:"💸",title:{ja:"街頭両替所",en:"Street money exchange",zh:"街头换钱",ko:"길거리 환전소"},level:"med",desc:{ja:"「レートが良い」と謳う街の両替所はレートが悪いことがある。銀行ATMを優先して。",en:"Street exchange offices touting good rates often aren't. Use bank ATMs instead.",zh:"宣称汇率好的街头换钱所实际汇率往往较差。优先使用银行ATM。",ko:"「좋은 환율」을 내세우는 길거리 환전소는 실제로 불리한 경우 많음. 은행 ATM 이용 권장."}},
  ],
  アメリカ:[
    {icon:"💳",title:{ja:"ATMスキミング",en:"ATM skimming",zh:"ATM盗刷",ko:"ATM 스키밍"},level:"high",desc:{ja:"街頭ATMはスキミング装置が取り付けられることがある。銀行内・大型店舗内のATMを優先して。",en:"Street ATMs can have skimming devices attached. Use ATMs inside banks or large stores.",zh:"街头ATM可能被安装盗刷装置。优先使用银行或大型商场内的ATM。",ko:"길거리 ATM은 스키밍 장치가 부착될 수 있음. 은행 내·대형 매장 ATM을 우선 이용."}},
    {icon:"🚖",title:{ja:"偽Uber白タク",en:"Fake Uber/rideshare",zh:"假Uber/网约车",ko:"가짜 우버 불법 택시"},level:"med",desc:{ja:"空港外でUber/Lyftを装った白タクに注意。必ずアプリ上で車両ナンバーを確認してから乗車。",en:"Fake Uber/Lyft drivers at airports. Always verify the plate number in the app before boarding.",zh:"机场外有人冒充Uber/Lyft。上车前务必在App中核对车牌号。",ko:"공항 외에서 우버/리프트를 가장한 불법 택시 주의. 반드시 앱에서 번호판 확인 후 탑승."}},
    {icon:"📱",title:{ja:"偽WiFiフィッシング",en:"Fake WiFi phishing",zh:"假WiFi钓鱼",ko:"가짜 WiFi 피싱"},level:"high",desc:{ja:"「Free Airport WiFi」などの偽WiFiは個人情報を抜き取られる恐れ。VPNを使うか公式WiFiのみ接続。",en:"Fake WiFi hotspots steal personal data. Use a VPN or only connect to official networks.",zh:"假冒公共WiFi可窃取个人信息。使用VPN或仅连接官方WiFi。",ko:"가짜 공공 WiFi는 개인정보 탈취 위험. VPN 사용 또는 공식 WiFi만 연결."}},
  ],
  日本:[
    {icon:"🏮",title:{ja:"ぼったくりバー",en:"Overpriced bar",zh:"宰客酒吧",ko:"바가지 술집"},level:"high",desc:{ja:"新宿・歌舞伎町の客引きによるバーはトラブルが多発。声かけには乗らないこと。",en:"Bars in Kabukicho with touts often overcharge. Never follow strangers' invitations.",zh:"新宿歌舞伎町的招揽酒吧纠纷频发。不要跟随陌生人的邀请。",ko:"신주쿠 가부키초 호객 술집에서 분쟁 다발. 낯선 사람의 권유를 따르지 말 것."}},
    {icon:"🎎",title:{ja:"着物体験過剰請求",en:"Kimono rental overcharge",zh:"和服体验过度收费",ko:"기모노 체험 과다 청구"},level:"med",desc:{ja:"一部の着物レンタル・写真撮影でオプション追加後に高額請求されるケースあり。事前に全料金を確認。",en:"Some kimono rentals add unexpected charges for photos/options. Confirm all fees upfront.",zh:"部分和服租赁店会在体验后额外收取高额费用。事先确认所有费用。",ko:"일부 기모노 렌탈에서 추가 옵션 후 과다 청구 사례 있음. 사전에 전체 요금 확인."}},
  ],
  ベトナム:[
    {icon:"🚕",title:{ja:"偽タクシー改ざんメーター",en:"Fake/rigged meter taxi",zh:"改装计价器出租车",ko:"미터기 조작 택시"},level:"high",desc:{ja:"Mailinh・Vinasun以外の無名タクシーはメーター改ざんが多数報告されている。Grabアプリを使うのが最安全。",en:"Unknown taxi companies often have rigged meters. Use the Grab app for safety.",zh:"非Mailinh、Vinasun的出租车计价器常被篡改。最安全的是使用Grab App。",ko:"Mailinh·Vinasun 외 무명 택시는 미터기 조작 다수 보고. Grab 앱 사용이 가장 안전."}},
    {icon:"🦞",title:{ja:"海鮮量り売りぼったくり",en:"Seafood weight scam",zh:"海鲜宰客",ko:"해산물 바가지 요금"},level:"high",desc:{ja:"「見るだけ」と言って高価な海鮮を調理→法外な請求をする店に注意。入店前に価格を確認。",en:"'Just look' leads to cooked seafood and huge bills. Always confirm prices before entering.",zh:"「只是看看」结果烹饪后要求高额付款。进店前务必确认价格。",ko:"「그냥 구경」 말하고 조리 후 과다 청구. 입장 전 반드시 가격 확인."}},
    {icon:"🛺",title:{ja:"シクロ交渉詐欺",en:"Cyclo price scam",zh:"人力车价格欺诈",ko:"씨클로 가격 사기"},level:"med",desc:{ja:"観光地のシクロは乗車後に高額請求するケースが多い。必ず乗車前に値段を書面で確認。",en:"Tourist cyclos often demand high prices after the ride. Get the price in writing before boarding.",zh:"景区人力车常在到达后要求高价。上车前务必书面确认价格。",ko:"관광지 씨클로는 탑승 후 고액 청구 많음. 탑승 전 반드시 서면으로 가격 확인."}},
  ],
  イタリア:[
    {icon:"👜",title:{ja:"スリ",en:"Pickpockets",zh:"扒手",ko:"소매치기"},level:"high",desc:{ja:"ローマ・フィレンツェの観光地はスリが非常に多い。貴重品はリュックでなく前掛けバッグに。",en:"Very common at tourist sites in Rome/Florence. Use front-body bags, not backpacks.",zh:"罗马、佛罗伦萨景区扒手非常猖獗。贵重物品放在前挎包而非背包中。",ko:"로마·피렌체 관광지에 소매치기 매우 많음. 귀중품은 백팩 대신 앞쪽 가방에 보관."}},
    {icon:"🍝",title:{ja:"カバー料金詐欺",en:"Coperto/bread charge",zh:"餐位费欺诈",ko:"코페르토 사기"},level:"med",desc:{ja:"メニューにない「カバー料（コペルト）」や「パン代」を高額請求されるケースあり。事前にメニューを確認。",en:"Unexpected coperto (cover charge) or bread fees. Check the menu carefully before ordering.",zh:"菜单上没有的「餐位费」或「面包费」被高额收取。点餐前仔细查看菜单。",ko:"메뉴에 없는 코페르토(착석료)·빵값 청구 사례. 주문 전 메뉴 꼼꼼히 확인."}},
  ],
};

const PHRASE_DATA={
  タイ:{flag:"🇹🇭",lang:{ja:"タイ語",en:"Thai",zh:"泰语",ko:"태국어"},phrases:[
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"いくら？",en:"How much?",zh:"多少钱？",ko:"얼마예요?"},local:"เท่าไหร่",roman:"Thâo-rài?"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"高すぎ",en:"Too expensive",zh:"太贵了",ko:"너무 비싸요"},local:"แพงเกิน",roman:"Phaeng koen"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"安くして",en:"Cheaper please",zh:"便宜点吧",ko:"싸게 해주세요"},local:"ลดได้ไหม",roman:"Lót dâi mǎi?"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"おいしい！",en:"Delicious!",zh:"好吃！",ko:"맛있어요!"},local:"อร่อยมาก",roman:"A-ròi mâak!"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"辛くしないで",en:"Not spicy please",zh:"不要辣",ko:"맵지 않게"},local:"ไม่เผ็ดนะ",roman:"Mâi phèt ná"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"お会計",en:"Check please",zh:"买单",ko:"계산해주세요"},local:"เช็คบิล",roman:"Chék bin"},
    {cat:{ja:"🚕 交通",en:"🚕 Transport",zh:"🚕 交通",ko:"🚕 교통"},
     meaning:{ja:"メーター使って",en:"Use the meter",zh:"用计价器",ko:"미터기 써주세요"},local:"ขอมิเตอร์",roman:"Khǒo mí-dtêr"},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"助けて！",en:"Help me!",zh:"救命！",ko:"도와주세요!"},local:"ช่วยด้วย！",roman:"Chûai dûai!"},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"警察を呼んで",en:"Call the police",zh:"叫警察",ko:"경찰 불러주세요"},local:"เรียกตำรวจ",roman:"Rîak dtam-rùat"},
  ]},
  韓国:{flag:"🇰🇷",lang:{ja:"韓国語",en:"Korean",zh:"韩语",ko:"한국어"},phrases:[
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"いくらですか？",en:"How much?",zh:"多少钱？",ko:"얼마예요?"},local:"얼마예요?",roman:"Eolmayeyo?"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"高いです",en:"That's expensive",zh:"太贵了",ko:"비싸요"},local:"비싸요",roman:"Bissayo"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"割引できますか？",en:"Any discount?",zh:"能打折吗？",ko:"할인 돼요?"},local:"할인 돼요?",roman:"Harin dwaeyo?"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"おいしい！",en:"Delicious!",zh:"好吃！",ko:"맛있어요!"},local:"맛있어요!",roman:"Masisseoyo!"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"辛くないもの？",en:"Not spicy?",zh:"不辣的？",ko:"안 매운 거?"},local:"안 매운 거?",roman:"An maeun geo?"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"お会計",en:"Check please",zh:"买单",ko:"계산해주세요"},local:"계산해주세요",roman:"Gyesanhaejuseyo"},
    {cat:{ja:"🚕 交通",en:"🚕 Transport",zh:"🚕 交通",ko:"🚕 교통"},
     meaning:{ja:"メーターで",en:"Use the meter",zh:"用计价器",ko:"미터기로"},local:"미터기로",roman:"Miteogiro"},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"助けて！",en:"Help me!",zh:"救命！",ko:"도와주세요!"},local:"도와주세요!",roman:"Dowajuseyo!"},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"警察を",en:"Call police",zh:"叫警察",ko:"경찰 불러줘"},local:"경찰 불러줘",roman:"Gyeongchal bulleojwo"},
  ]},
  アメリカ:{flag:"🇺🇸",lang:{ja:"英語",en:"English",zh:"英语",ko:"영어"},phrases:[
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"いくらですか？",en:"How much?",zh:"多少钱？",ko:"얼마예요?"},local:"How much?",roman:""},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"チップは？",en:"How much tip?",zh:"小费多少？",ko:"팁은 얼마?"},local:"How much tip should I leave?",roman:""},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"割引ある？",en:"Any discount?",zh:"有折扣吗？",ko:"할인 있어요?"},local:"Any discount?",roman:""},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"おいしい！",en:"It's delicious!",zh:"好吃！",ko:"맛있어요!"},local:"It's delicious!",roman:""},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"テイクアウト",en:"To go please",zh:"打包",ko:"포장해주세요"},local:"To go, please.",roman:""},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"お会計",en:"Check please",zh:"买单",ko:"계산해주세요"},local:"Check, please.",roman:""},
    {cat:{ja:"🚕 交通",en:"🚕 Transport",zh:"🚕 交通",ko:"🚕 교통"},
     meaning:{ja:"この住所へ",en:"Take me here",zh:"去这个地址",ko:"여기로 가주세요"},local:"Take me here please.",roman:""},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"助けて！",en:"Help me!",zh:"救命！",ko:"도와주세요!"},local:"Help me!",roman:"Call 911"},
  ]},
  日本:{flag:"🇯🇵",lang:{ja:"日本語",en:"Japanese",zh:"日语",ko:"일본어"},phrases:[
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"いくらですか？",en:"How much?",zh:"多少钱？",ko:"얼마예요?"},local:"いくらですか？",roman:"Ikura desu ka?"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"安くして",en:"Discount please",zh:"便宜点",ko:"깎아주세요"},local:"まけてください",roman:"Makete kudasai"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"免税で",en:"Tax-free please",zh:"免税",ko:"면세로 해주세요"},local:"免税できますか？",roman:"Menzei dekimasu ka?"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"おいしい！",en:"Delicious!",zh:"好吃！",ko:"맛있어요!"},local:"おいしい！",roman:"Oishii!"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"辛くしないで",en:"Not spicy please",zh:"不要辣",ko:"맵지 않게"},local:"辛くしないで",roman:"Karakunai de"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"お会計を",en:"Check please",zh:"买单",ko:"계산해주세요"},local:"お会計を",roman:"Okaikei wo"},
    {cat:{ja:"🚕 交通",en:"🚕 Transport",zh:"🚕 交通",ko:"🚕 교통"},
     meaning:{ja:"ここへ行って",en:"Go here please",zh:"请去这里",ko:"여기로 가주세요"},local:"ここへ行って",roman:"Koko e itte"},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"助けて！",en:"Help!",zh:"救命！",ko:"도와주세요!"},local:"助けて！",roman:"Tasukete! (110/119)"},
  ]},
  ベトナム:{flag:"🇻🇳",lang:{ja:"ベトナム語",en:"Vietnamese",zh:"越南语",ko:"베트남어"},phrases:[
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"いくら？",en:"How much?",zh:"多少钱？",ko:"얼마예요?"},local:"Bao nhiêu?",roman:"Bao nhiêu?"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"高すぎ",en:"Too expensive",zh:"太贵了",ko:"너무 비싸요"},local:"Đắt quá",roman:"Đắt quá"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"安くして",en:"Cheaper please",zh:"便宜点",ko:"싸게 해주세요"},local:"Giảm đi",roman:"Giảm đi"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"おいしい！",en:"Delicious!",zh:"好吃！",ko:"맛있어요!"},local:"Ngon lắm!",roman:"Ngon lắm!"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"辛くしないで",en:"Not spicy",zh:"不要辣",ko:"맵지 않게"},local:"Không cay",roman:"Không cay"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 용餐",ko:"🍽️ 식사"},
     meaning:{ja:"お会計",en:"Check please",zh:"买单",ko:"계산해주세요"},local:"Tính tiền",roman:"Tính tiền"},
    {cat:{ja:"🚕 交通",en:"🚕 Transport",zh:"🚕 交通",ko:"🚕 교통"},
     meaning:{ja:"メーターで",en:"Use the meter",zh:"用计价器",ko:"미터기 써주세요"},local:"Dùng đồng hồ",roman:"Dùng đồng hồ"},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"助けて！",en:"Help me!",zh:"救命！",ko:"도와주세요!"},local:"Cứu tôi!",roman:"Cứu tôi! (113)"},
  ]},
  イタリア:{flag:"🇮🇹",lang:{ja:"イタリア語",en:"Italian",zh:"意大利语",ko:"이탈리아어"},phrases:[
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"いくら？",en:"How much?",zh:"多少钱？",ko:"얼마예요?"},local:"Quanto costa?",roman:"Quanto costa?"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"高すぎ",en:"Too expensive",zh:"太贵了",ko:"너무 비싸요"},local:"Troppo caro",roman:"Troppo caro"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"おいしい！",en:"Delicious!",zh:"好吃！",ko:"맛있어요!"},local:"Buonissimo!",roman:"Buonissimo!"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"お会計",en:"Check please",zh:"买单",ko:"계산해주세요"},local:"Il conto",roman:"Il conto"},
    {cat:{ja:"🚕 交通",en:"🚕 Transport",zh:"🚕 交通",ko:"🚕 교통"},
     meaning:{ja:"ここで止めて",en:"Stop here",zh:"在这里停",ko:"여기서 세워주세요"},local:"Fermi qui",roman:"Fermi qui"},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"助けて！",en:"Help me!",zh:"救命！",ko:"도와주세요!"},local:"Aiuto!",roman:"Aiuto! (112)"},
  ]},
  フランス:{flag:"🇫🇷",lang:{ja:"フランス語",en:"French",zh:"法语",ko:"프랑스어"},phrases:[
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"いくら？",en:"How much?",zh:"多少钱？",ko:"얼마예요?"},local:"C'est combien?",roman:"C'est combien?"},
    {cat:{ja:"💰 値段交渉",en:"💰 Bargaining",zh:"💰 砍价",ko:"💰 흥정"},
     meaning:{ja:"高すぎ",en:"Too expensive",zh:"太贵了",ko:"너무 비싸요"},local:"Trop cher",roman:"Trop cher"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"おいしい！",en:"Delicious!",zh:"好吃！",ko:"맛있어요!"},local:"Délicieux!",roman:"Délicieux!"},
    {cat:{ja:"🍽️ 食事",en:"🍽️ Food",zh:"🍽️ 用餐",ko:"🍽️ 식사"},
     meaning:{ja:"お会計",en:"Check please",zh:"买单",ko:"계산해주세요"},local:"L'addition",roman:"L'addition"},
    {cat:{ja:"🆘 緊急",en:"🆘 Emergency",zh:"🆘 紧急",ko:"🆘 긴급"},
     meaning:{ja:"助けて！",en:"Help me!",zh:"救命！",ko:"도와주세요!"},local:"Au secours!",roman:"Au secours! (17)"},
  ]},
};

const COUNTRIES=[
  {name:"タイ",flag:"🇹🇭",currency:"THB",rate:0.0043,
    label:{ja:"タイ",en:"Thailand",zh:"泰国",ko:"태국"},
    cities:{ja:["バンコク","チェンマイ","プーケット","パタヤ"],en:["Bangkok","Chiang Mai","Phuket","Pattaya"],zh:["曼谷","清迈","普吉岛","芭提雅"],ko:["방콕","치앙마이","푸켓","파타야"]}},
  {name:"韓国",flag:"🇰🇷",currency:"KRW",rate:0.011,
    label:{ja:"韓国",en:"South Korea",zh:"韩国",ko:"한국"},
    cities:{ja:["ソウル","釜山","済州島","大邱"],en:["Seoul","Busan","Jeju","Daegu"],zh:["首尔","釜山","济州岛","大邱"],ko:["서울","부산","제주도","대구"]}},
  {name:"アメリカ",flag:"🇺🇸",currency:"USD",rate:155,
    label:{ja:"アメリカ",en:"USA",zh:"美国",ko:"미국"},
    cities:{ja:["ニューヨーク","ロサンゼルス","シカゴ","ラスベガス"],en:["New York","Los Angeles","Chicago","Las Vegas"],zh:["纽约","洛杉矶","芝加哥","拉斯维加斯"],ko:["뉴욕","로스앤젤레스","시카고","라스베이거스"]}},
  {name:"日本",flag:"🇯🇵",currency:"JPY",rate:1,
    label:{ja:"日本",en:"Japan",zh:"日本",ko:"일본"},
    cities:{ja:["東京","大阪","京都","札幌"],en:["Tokyo","Osaka","Kyoto","Sapporo"],zh:["东京","大阪","京都","札幌"],ko:["도쿄","오사카","교토","삿포로"]}},
  {name:"シンガポール",flag:"🇸🇬",currency:"SGD",rate:115,
    label:{ja:"シンガポール",en:"Singapore",zh:"新加坡",ko:"싱가포르"},
    cities:{ja:["シンガポール"],en:["Singapore"],zh:["新加坡"],ko:["싱가포르"]}},
  {name:"イタリア",flag:"🇮🇹",currency:"EUR",rate:168,
    label:{ja:"イタリア",en:"Italy",zh:"意大利",ko:"이탈리아"},
    cities:{ja:["ローマ","ミラノ","フィレンツェ","ヴェネツィア"],en:["Rome","Milan","Florence","Venice"],zh:["罗马","米兰","佛罗伦萨","威尼斯"],ko:["로마","밀라노","피렌체","베네치아"]}},
  {name:"オーストラリア",flag:"🇦🇺",currency:"AUD",rate:100,
    label:{ja:"オーストラリア",en:"Australia",zh:"澳大利亚",ko:"호주"},
    cities:{ja:["シドニー","メルボルン","ケアンズ"],en:["Sydney","Melbourne","Cairns"],zh:["悉尼","墨尔本","凯恩斯"],ko:["시드니","멜버른","케언즈"]}},
  {name:"マレーシア",flag:"🇲🇾",currency:"MYR",rate:34,
    label:{ja:"マレーシア",en:"Malaysia",zh:"马来西亚",ko:"말레이시아"},
    cities:{ja:["クアラルンプール","ペナン","コタキナバル"],en:["Kuala Lumpur","Penang","Kota Kinabalu"],zh:["吉隆坡","槟城","哥打基纳巴卢"],ko:["쿠알라룸푸르","페낭","코타키나발루"]}},
  {name:"インドネシア",flag:"🇮🇩",currency:"IDR",rate:0.0096,
    label:{ja:"インドネシア",en:"Indonesia",zh:"印度尼西亚",ko:"인도네시아"},
    cities:{ja:["バリ島","ジャカルタ","ジョグジャカルタ"],en:["Bali","Jakarta","Yogyakarta"],zh:["巴厘岛","雅加达","日惹"],ko:["발리","자카르타","족자카르타"]}},
  {name:"フィリピン",flag:"🇵🇭",currency:"PHP",rate:2.7,
    label:{ja:"フィリピン",en:"Philippines",zh:"菲律宾",ko:"필리핀"},
    cities:{ja:["マニラ","セブ島","ボラカイ"],en:["Manila","Cebu","Boracay"],zh:["马尼拉","宿务","长滩岛"],ko:["마닐라","세부","보라카이"]}},
  {name:"台湾",flag:"🇹🇼",currency:"TWD",rate:4.8,
    label:{ja:"台湾",en:"Taiwan",zh:"台湾",ko:"대만"},
    cities:{ja:["台北","台南","高雄"],en:["Taipei","Tainan","Kaohsiung"],zh:["台北","台南","高雄"],ko:["타이베이","타이난","가오슝"]}},
  {name:"フランス",flag:"🇫🇷",currency:"EUR",rate:168,
    label:{ja:"フランス",en:"France",zh:"法国",ko:"프랑스"},
    cities:{ja:["パリ","ニース","リヨン"],en:["Paris","Nice","Lyon"],zh:["巴黎","尼斯","里昂"],ko:["파리","니스","리옹"]}},
  {name:"イギリス",flag:"🇬🇧",currency:"GBP",rate:197,
    label:{ja:"イギリス",en:"UK",zh:"英国",ko:"영국"},
    cities:{ja:["ロンドン","エディンバラ","マンチェスター"],en:["London","Edinburgh","Manchester"],zh:["伦敦","爱丁堡","曼彻斯特"],ko:["런던","에든버러","맨체스터"]}},
  {name:"ベトナム",flag:"🇻🇳",currency:"VND",rate:0.006,
    label:{ja:"ベトナム",en:"Vietnam",zh:"越南",ko:"베트남"},
    cities:{ja:["ハノイ","ホーチミン","ダナン","ホイアン"],en:["Hanoi","Ho Chi Minh City","Da Nang","Hoi An"],zh:["河内","胡志明市","岘港","会安"],ko:["하노이","호치민","다낭","호이안"]}},
  {name:"ドイツ",flag:"🇩🇪",currency:"EUR",rate:168,
    label:{ja:"ドイツ",en:"Germany",zh:"德国",ko:"독일"},
    cities:{ja:["ベルリン","ミュンヘン","フランクフルト"],en:["Berlin","Munich","Frankfurt"],zh:["柏林","慕尼黑","法兰克福"],ko:["베를린","뮌헨","프랑크푸르트"]}},
];

const MAIN_CATS=[
  {id:"food",icon:"🍽️",name:{ja:"食事",en:"Food",zh:"餐饮",ko:"식사"},hint:{ja:"朝食〜高級まで",en:"Breakfast to fine dining",zh:"早餐到高档餐厅",ko:"아침부터 고급까지"}},
  {id:"drink",icon:"☕",name:{ja:"飲み物",en:"Drinks",zh:"饮料",ko:"음료"},hint:{ja:"カフェ・コンビニ",en:"Cafe & convenience",zh:"咖啡·便利店",ko:"카페·편의점"}},
  {id:"taxi",icon:"🚕",name:{ja:"タクシー",en:"Transport",zh:"交通",ko:"교통"},hint:{ja:"距離・時間帯込み",en:"Distance & time",zh:"含距离·时段",ko:"거리·시간대 포함"}},
  {id:"hotel",icon:"🏨",name:{ja:"ホテル",en:"Hotel",zh:"酒店",ko:"호텔"},hint:{ja:"1泊あたり",en:"Per night",zh:"每晚",ko:"1박 기준"}},
  {id:"shopping",icon:"🛍️",name:{ja:"ショッピング",en:"Shopping",zh:"购物",ko:"쇼핑"},hint:{ja:"衣料・雑貨など",en:"Clothes & goods",zh:"服饰·杂货",ko:"의류·잡화"}},
  {id:"activity",icon:"🎡",name:{ja:"観光・体験",en:"Activities",zh:"观光·体验",ko:"관광·체험"},hint:{ja:"入場・ツアー",en:"Entry & tours",zh:"入场·旅游",ko:"입장·투어"}},
];

const FOOD_GROUPS=[
  {label:{ja:"💰 価格帯",en:"💰 By Price",zh:"💰 按价位",ko:"💰 가격대"},
   subs:{ja:["🏪 コンビニ","🍢 屋台","🍜 ローカル食堂","🍣 チェーン","🍽️ カジュアル","🥂 中級","🥩 高級","👑 超高級"],
         en:["🏪 Convenience","🍢 Street food","🍜 Local diner","🍣 Chain/Fast","🍽️ Casual","🥂 Mid-range","🥩 Upscale","👑 Fine dining"],
         zh:["🏪 便利店","🍢 街边摊","🍜 本地餐馆","🍣 连锁/快餐","🍽️ 休闲餐厅","🥂 中档","🥩 高档","👑 顶级"],
         ko:["🏪 편의점","🍢 노점","🍜 로컬 식당","🍣 체인/패스트","🍽️ 캐주얼","🥂 중급","🥩 고급","👑 초고급"]}},
  {label:{ja:"⏰ 時間帯",en:"⏰ By Time",zh:"⏰ 按时段",ko:"⏰ 시간대"},
   subs:{ja:["🌅 朝食","☀️ ランチ","🌆 ディナー","🍱 テイクアウト","☕ カフェ軽食","🌙 夜食"],
         en:["🌅 Breakfast","☀️ Lunch","🌆 Dinner","🍱 Takeout","☕ Cafe snack","🌙 Late night"],
         zh:["🌅 早餐","☀️ 午餐","🌆 晚餐","🍱 外卖","☕ 咖啡轻食","🌙 宵夜"],
         ko:["🌅 아침식사","☀️ 점심","🌆 저녁","🍱 테이크아웃","☕ 카페 간식","🌙 야식"]}},
  {label:{ja:"🍜 ジャンル",en:"🍜 By Cuisine",zh:"🍜 按菜系",ko:"🍜 장르"},
   subs:{ja:["🍜 現地料理","🍣 魚介・海鮮","🥩 肉料理","🌱 ベジタリアン","🍕 洋食","🍱 他国アジア","🍰 スイーツ"],
         en:["🍜 Local cuisine","🍣 Seafood","🥩 Meat/grill","🌱 Vegetarian","🍕 Western","🍱 Other Asian","🍰 Sweets"],
         zh:["🍜 当地料理","🍣 海鲜","🥩 肉类/烧烤","🌱 素食","🍕 西餐","🍱 其他亚洲","🍰 甜点"],
         ko:["🍜 현지 요리","🍣 해산물","🥩 육류/그릴","🌱 채식","🍕 양식","🍱 기타 아시아","🍰 디저트"]}},
];

const SUB_CATS={
  drink:{ja:["🏪 コンビニ","🧋 タピオカ","☕ カフェ","🍺 バー","🧃 屋台ドリンク"],en:["🏪 Convenience","🧋 Bubble tea","☕ Cafe","🍺 Bar","🧃 Street drink"],zh:["🏪 便利店","🧋 珍珠奶茶","☕ 咖啡","🍺 酒吧","🧃 街边饮料"],ko:["🏪 편의점","🧋 버블티","☕ 카페","🍺 바","🧃 노점 음료"]},
  taxi:{ja:["🚕 一般タクシー","📱 Grab/Uber","🛺 トゥクトゥク","🚌 バス"],en:["🚕 Regular taxi","📱 Grab/Uber","🛺 Tuk-tuk","🚌 Bus/Transit"],zh:["🚕 普通出租车","📱 Grab/Uber","🛺 嘟嘟车","🚌 公共交通"],ko:["🚕 일반 택시","📱 Grab/Uber","🛺 툭툭","🚌 버스/대중교통"]},
  hotel:{ja:["🏠 ゲストハウス","⭐ ビジネス","⭐⭐ 中級","⭐⭐⭐ 高級","🏖️ リゾート"],en:["🏠 Hostel/Guesthouse","⭐ Business","⭐⭐ Mid-range","⭐⭐⭐ Luxury","🏖️ Resort"],zh:["🏠 青旅/客栈","⭐ 商务","⭐⭐ 中档","⭐⭐⭐ 豪华","🏖️ 度假村"],ko:["🏠 게스트하우스","⭐ 비즈니스","⭐⭐ 중급","⭐⭐⭐ 고급","🏖️ 리조트"]},
  shopping:{ja:["👕 衣料","💄 コスメ","🛒 スーパー","🎁 おみやげ","💻 家電"],en:["👕 Clothing","💄 Cosmetics","🛒 Grocery","🎁 Souvenirs","💻 Electronics"],zh:["👕 服装","💄 化妆品","🛒 超市","🎁 纪念品","💻 电子产品"],ko:["👕 의류","💄 화장품","🛒 마트","🎁 기념품","💻 전자기기"]},
  activity:{ja:["🏛️ 観光入場","🤿 アクティビティ","💆 マッサージ","🎭 エンタメ","🚌 ツアー"],en:["🏛️ Attraction entry","🤿 Activities","💆 Massage/Spa","🎭 Entertainment","🚌 Tour"],zh:["🏛️ 景点门票","🤿 活动体验","💆 按摩·SPA","🎭 娱乐演出","🚌 旅游团"],ko:["🏛️ 관광지 입장","🤿 액티비티","💆 마사지·스파","🎭 엔터테인먼트","🚌 투어"]},
};

const CITY_FACTOR={"バンコク":1.0,"チェンマイ":0.75,"プーケット":1.3,"パタヤ":1.1,"ソウル":1.0,"釜山":0.85,"済州島":1.2,"大邱":0.8,"ニューヨーク":1.0,"ロサンゼルス":0.9,"シカゴ":0.85,"ラスベガス":0.95,"東京":1.0,"大阪":0.9,"京都":1.05,"札幌":0.85,"パリ":1.0,"ニース":0.9,"リヨン":0.85,"ローマ":1.0,"ミラノ":1.1,"フィレンツェ":0.95,"ヴェネツィア":1.2,"ロンドン":1.0,"エディンバラ":0.85,"マンチェスター":0.8,"ベルリン":1.0,"ミュンヘン":1.15,"フランクフルト":1.1,"シドニー":1.0,"メルボルン":0.95,"ケアンズ":1.05,"クアラルンプール":1.0,"ペナン":0.8,"コタキナバル":0.85,"バリ島":1.0,"ジャカルタ":0.9,"ジョグジャカルタ":0.7,"マニラ":1.0,"セブ島":0.9,"ボラカイ":1.3,"台北":1.0,"台南":0.85,"高雄":0.85,"ハノイ":1.0,"ホーチミン":1.1,"ダナン":0.9,"ホイアン":0.95,"シンガポール":1.0};

// 相場DB (main 4 countries, others use defaultDB)
const PRICE_DB={
  タイ:{
    food:{"🏪 コンビニ":{min:35,avg:55,max:100,trend:"+5%",reason:"コンビニ弁当・おにぎりは35〜100THB。インフレで値上がり傾向。"},"🍢 屋台":{min:30,avg:70,max:150,trend:"+12%",reason:"パッタイ・カオパットは30〜150THB。"},"🍜 ローカル食堂":{min:40,avg:80,max:160,trend:"+8%",reason:"地元食堂は40〜160THB。コスパ良好。"},"🍣 チェーン":{min:50,avg:120,max:250,trend:"+7%",reason:"MK・バーガーキング等は50〜250THB。"},"🍽️ カジュアル":{min:120,avg:250,max:500,trend:"+8%",reason:"エアコン付きレストランは120〜500THB。"},"🥂 中級":{min:300,avg:700,max:1500,trend:"+10%",reason:"中級レストランは300〜1500THB。"},"🥩 高級":{min:800,avg:2000,max:5000,trend:"+10%",reason:"高級レストランは800〜5000THB。"},"👑 超高級":{min:2000,avg:5000,max:15000,trend:"+12%",reason:"ミシュラン掲載店等は2000〜15000THB以上。"},"🌅 朝食":{min:40,avg:80,max:200,trend:"+5%",reason:"カフェモーニングは80〜200THB。屋台は40〜80THB。"},"☀️ ランチ":{min:60,avg:150,max:400,trend:"+8%",reason:"ランチは60〜400THB。"},"🌆 ディナー":{min:100,avg:400,max:2000,trend:"+10%",reason:"ディナーは100〜2000THB。"},"🍱 テイクアウト":{min:30,avg:70,max:150,trend:"+8%",reason:"市場弁当は30〜150THB。"},"☕ カフェ軽食":{min:80,avg:200,max:500,trend:"+8%",reason:"カフェ軽食は80〜500THB。"},"🌙 夜食":{min:30,avg:80,max:200,trend:"+8%",reason:"深夜屋台は30〜200THB。"},"🍜 現地料理":{min:40,avg:100,max:300,trend:"+10%",reason:"パッタイ・トムヤムは40〜300THB。"},"🍣 魚介・海鮮":{min:150,avg:600,max:3000,trend:"+12%",reason:"海老・蟹は量り売りで150〜3000THB以上。"},"🥩 肉料理":{min:100,avg:400,max:2000,trend:"+10%",reason:"豚・鶏グリルは100〜500THB。"},"🌱 ベジタリアン":{min:50,avg:150,max:400,trend:"+8%",reason:"ジェイ料理専門店は50〜400THB。"},"🍕 洋食":{min:150,avg:400,max:1500,trend:"+8%",reason:"ピザ・パスタは150〜1500THB。"},"🍱 他国アジア":{min:100,avg:250,max:800,trend:"+7%",reason:"日本・中華・韓国料理は100〜800THB。"},"🍰 スイーツ":{min:30,avg:100,max:300,trend:"+8%",reason:"マンゴースティッキーライスは60〜120THB。"}},
    drink:{"🏪 コンビニ":{min:15,avg:25,max:50,trend:"+3%",reason:"ペットボトル飲料15〜50THB。"},"🧋 タピオカ":{min:45,avg:80,max:160,trend:"+10%",reason:"タイティー・タピオカは45〜160THB。"},"☕ カフェ":{min:120,avg:180,max:280,trend:"+6%",reason:"スタバ等は120〜280THB。"},"🍺 バー":{min:60,avg:150,max:400,trend:"+8%",reason:"ビアシン60〜120THB。カクテルは高め。"},"🧃 屋台ドリンク":{min:20,avg:40,max:80,trend:"+5%",reason:"絞りたてジュースは20〜80THB。"}},
    taxi:{"🚕 一般タクシー":{minPerKm:8,baseMin:35,baseAvg:45,surge:{"深夜":1.3,"夕方":1.2,"朝":1.1,"昼":1.0},trend:"+5%",reason:"初乗り35THB＋1kmあたり8THB。深夜割増あり。"},"📱 Grab/Uber":{minPerKm:10,baseMin:50,baseAvg:60,surge:{"深夜":1.5,"夕方":1.4,"朝":1.1,"昼":1.0},trend:"+15%",reason:"透明な料金設定で安心。ピーク時は高め。"},"🛺 トゥクトゥク":{minPerKm:15,baseMin:50,baseAvg:100,surge:{"深夜":1.5,"夕方":1.3,"朝":1.1,"昼":1.0},trend:"+10%",reason:"観光客向けで交渉制。必ず乗車前に確認。"},"🚌 バス":{minPerKm:1,baseMin:10,baseAvg:20,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"安定",reason:"BTSは16〜59THB。最もコスパが良い。"}},
    hotel:{"🏠 ゲストハウス":{min:200,avg:400,max:800,trend:"+8%",reason:"カオサン周辺200〜800THB。"},"⭐ ビジネス":{min:600,avg:1200,max:2500,trend:"+10%",reason:"スクンビット周辺600〜2500THB。"},"⭐⭐ 中級":{min:1500,avg:3000,max:6000,trend:"+12%",reason:"3〜4つ星は1500〜6000THB。"},"⭐⭐⭐ 高級":{min:4000,avg:8000,max:20000,trend:"+15%",reason:"5つ星は4000THB〜。"},"🏖️ リゾート":{min:3000,avg:7000,max:25000,trend:"+12%",reason:"プーケット・サムイは3000〜25000THB。"}},
    shopping:{"👕 衣料":{min:100,avg:400,max:2000,trend:"+5%",reason:"チャトゥチャック市場なら100〜500THB。"},"💄 コスメ":{min:50,avg:300,max:1500,trend:"+5%",reason:"BOOTSやWatsonsで購入可能。"},"🛒 スーパー":{min:20,avg:80,max:300,trend:"+7%",reason:"Big CやTopsは安め。"},"🎁 おみやげ":{min:50,avg:250,max:1000,trend:"+8%",reason:"ナイトマーケットが安い。"},"💻 家電":{min:500,avg:3000,max:30000,trend:"+3%",reason:"MBKやパンティッププラザで購入可能。"}},
    activity:{"🏛️ 観光入場":{min:50,avg:200,max:500,trend:"+10%",reason:"ワット・プラケオは500THB（外国人料金）。"},"🤿 アクティビティ":{min:500,avg:2000,max:8000,trend:"+10%",reason:"プーケット海アクティビティは500〜8000THB。"},"💆 マッサージ":{min:150,avg:400,max:2000,trend:"+8%",reason:"タイ古式1時間は200〜500THB。"},"🎭 エンタメ":{min:300,avg:1200,max:3000,trend:"+8%",reason:"バーやショーは300THB〜。"},"🚌 ツアー":{min:500,avg:1500,max:5000,trend:"+10%",reason:"半日ツアーは500〜2000THB。"}},
  },
  日本:{
    food:{"🏪 コンビニ":{min:150,avg:500,max:1200,trend:"+8%",reason:"おにぎり150〜250円、弁当400〜800円。"},"🍢 屋台":{min:300,avg:700,max:1500,trend:"+5%",reason:"フードコートのランチは500〜1200円。"},"🍜 ローカル食堂":{min:500,avg:900,max:2000,trend:"+8%",reason:"ラーメン・定食は500〜1200円。チップ不要。"},"🍣 チェーン":{min:300,avg:700,max:1500,trend:"+10%",reason:"吉野家400〜600円。マクドセットは700〜900円。"},"🍽️ カジュアル":{min:700,avg:1500,max:3500,trend:"+8%",reason:"ファミレス・居酒屋ランチは700〜2000円。"},"🥂 中級":{min:2000,avg:5000,max:12000,trend:"+8%",reason:"和食・焼肉中級は2000〜12000円。"},"🥩 高級":{min:8000,avg:20000,max:60000,trend:"+10%",reason:"ミシュラン掲載・高級和食は8000〜60000円以上。"},"👑 超高級":{min:20000,avg:50000,max:200000,trend:"+12%",reason:"割烹・フレンチ最高峰は20000〜200000円。"},"🌅 朝食":{min:200,avg:700,max:2500,trend:"+5%",reason:"モーニング400〜800円。ホテルビュッフェは1500〜4000円。"},"☀️ ランチ":{min:600,avg:1100,max:3000,trend:"+8%",reason:"ランチセットは800〜1500円。"},"🌆 ディナー":{min:1000,avg:4000,max:30000,trend:"+10%",reason:"居酒屋コースは3000〜6000円。"},"🍱 テイクアウト":{min:300,avg:600,max:1500,trend:"+8%",reason:"デパ地下・スーパーの惣菜は300〜1500円。"},"☕ カフェ軽食":{min:600,avg:1200,max:3000,trend:"+5%",reason:"カフェランチは800〜1800円。"},"🌙 夜食":{min:300,avg:800,max:2000,trend:"+5%",reason:"コンビニ夜食は300〜600円。"},"🍜 現地料理":{min:500,avg:1200,max:5000,trend:"+8%",reason:"寿司・ラーメン・天ぷらは500〜5000円。"},"🍣 魚介・海鮮":{min:1000,avg:4000,max:30000,trend:"+10%",reason:"回転寿司1皿100〜500円。高級寿司は5000〜30000円以上。"},"🥩 肉料理":{min:800,avg:3000,max:20000,trend:"+10%",reason:"焼肉は1000〜5000円/人。"},"🌱 ベジタリアン":{min:800,avg:2000,max:6000,trend:"+8%",reason:"精進料理は2000〜8000円。"},"🍕 洋食":{min:800,avg:2000,max:8000,trend:"+8%",reason:"洋食屋のハンバーグ・オムライスは800〜2000円。"},"🍱 他国アジア":{min:700,avg:1500,max:5000,trend:"+7%",reason:"タイ料理・中華は700〜3000円。"},"🍰 スイーツ":{min:200,avg:700,max:3000,trend:"+5%",reason:"和菓子200〜800円。カフェケーキは600〜1500円。"}},
    drink:{"🏪 コンビニ":{min:100,avg:180,max:350,trend:"+8%",reason:"ペットボトル飲料は100〜200円。"},"🧋 タピオカ":{min:400,avg:700,max:1200,trend:"+5%",reason:"タピオカは500〜800円。"},"☕ カフェ":{min:400,avg:650,max:900,trend:"+8%",reason:"スタバは400〜800円。"},"🍺 バー":{min:400,avg:800,max:2000,trend:"+5%",reason:"居酒屋のビールは500〜700円。チップ不要。"},"🧃 屋台ドリンク":{min:200,avg:400,max:800,trend:"+5%",reason:"自販機が豊富で200〜300円から。"}},
    taxi:{"🚕 一般タクシー":{minPerKm:80,baseMin:730,baseAvg:730,surge:{"深夜":1.2,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+5%",reason:"初乗り730円（東京）。深夜は2割増。"},"📱 Grab/Uber":{minPerKm:100,baseMin:800,baseAvg:900,surge:{"深夜":1.3,"夕方":1.1,"朝":1.0,"昼":1.0},trend:"+10%",reason:"GoやUberが普及中。高品質だが高め。"},"🛺 トゥクトゥク":{minPerKm:0,baseMin:230,baseAvg:230,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+3%",reason:"日本にはほぼありません。電車・バスが最適。"},"🚌 バス":{minPerKm:10,baseMin:170,baseAvg:230,surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+5%",reason:"電車・バスは170〜300円。Suica等ICカードが便利。"}},
    hotel:{"🏠 ゲストハウス":{min:2500,avg:4000,max:8000,trend:"+15%",reason:"カプセルホテル・ゲストハウスは2500〜8000円。"},"⭐ ビジネス":{min:6000,avg:10000,max:20000,trend:"+15%",reason:"東横イン等は6000〜15000円。"},"⭐⭐ 中級":{min:12000,avg:20000,max:40000,trend:"+18%",reason:"3〜4つ星は12000〜40000円。"},"⭐⭐⭐ 高級":{min:30000,avg:60000,max:200000,trend:"+20%",reason:"帝国ホテル等は30000〜200000円。"},"🏖️ リゾート":{min:20000,avg:50000,max:150000,trend:"+20%",reason:"沖縄・北海道のリゾートは20000〜150000円。"}},
    shopping:{"👕 衣料":{min:1000,avg:5000,max:50000,trend:"+5%",reason:"ユニクロ・GUは1000〜3000円。"},"💄 コスメ":{min:500,avg:3000,max:20000,trend:"+5%",reason:"ドラッグストアのコスメは500〜3000円。"},"🛒 スーパー":{min:100,avg:500,max:3000,trend:"+8%",reason:"品質が高く価格も安定。惣菜コーナーは人気。"},"🎁 おみやげ":{min:500,avg:2000,max:10000,trend:"+8%",reason:"ドラッグストアで同じ商品が空港より安い場合も。"},"💻 家電":{min:1000,avg:30000,max:300000,trend:"+3%",reason:"秋葉原・ビックカメラが有名。免税で消費税還付あり。"}},
    activity:{"🏛️ 観光入場":{min:0,avg:1000,max:3000,trend:"+10%",reason:"神社・寺院は無料〜1000円。テーマパークは8000〜10000円以上。"},"🤿 アクティビティ":{min:3000,avg:8000,max:30000,trend:"+8%",reason:"沖縄のシュノーケリングは3000〜10000円。"},"💆 マッサージ":{min:3000,avg:6000,max:20000,trend:"+5%",reason:"マッサージは3000〜6000円/時間。温泉は500〜3000円。"},"🎭 エンタメ":{min:1000,avg:8000,max:30000,trend:"+8%",reason:"歌舞伎2000〜20000円。コンサートは5000〜15000円。"},"🚌 ツアー":{min:3000,avg:10000,max:50000,trend:"+10%",reason:"日帰りバスツアーは3000〜15000円。"}},
  },
};

function getDefaultDB(country){
  const r=country.rate||1;
  const b=(avg)=>({min:Math.round(avg*0.5/r),avg:Math.round(avg/r),max:Math.round(avg*2.5/r),trend:"+8%",reason:{ja:`${country.name}の一般的な相場です。都市・エリアによって異なります。`,en:`General price guide for ${country.name}. May vary by city/area.`,zh:`${country.name}的一般价格参考，因城市和地区而异。`,ko:`${country.name}의 일반적인 가격 기준입니다. 도시·지역에 따라 다를 수 있습니다.`}});
  return{
    food:{"🏪 コンビニ":b(400),"🍢 屋台":b(500),"🍜 ローカル食堂":b(700),"🍣 チェーン":b(800),"🍽️ カジュアル":b(1500),"🥂 中級":b(4000),"🥩 高級":b(10000),"👑 超高級":b(25000),"🌅 朝食":b(500),"☀️ ランチ":b(1200),"🌆 ディナー":b(3000),"🍱 テイクアウト":b(600),"☕ カフェ軽食":b(1200),"🌙 夜食":b(600),"🍜 現地料理":b(900),"🍣 魚介・海鮮":b(3000),"🥩 肉料理":b(3000),"🌱 ベジタリアン":b(1500),"🍕 洋食":b(2000),"🍱 他国アジア":b(1500),"🍰 スイーツ":b(600)},
    drink:{"🏪 コンビニ":b(200),"🧋 タピオカ":b(700),"☕ カフェ":b(700),"🍺 バー":b(1000),"🧃 屋台ドリンク":b(300)},
    taxi:{"🚕 一般タクシー":{minPerKm:Math.round(100/r),baseMin:Math.round(500/r),baseAvg:Math.round(700/r),surge:{"深夜":1.3,"夕方":1.2,"朝":1.1,"昼":1.0},trend:"+8%",reason:{ja:"一般的なタクシー相場（目安）。",en:"General taxi price guide.",zh:"一般出租车价格参考。",ko:"일반 택시 가격 기준."}},"📱 Grab/Uber":{minPerKm:Math.round(120/r),baseMin:Math.round(600/r),baseAvg:Math.round(800/r),surge:{"深夜":1.5,"夕方":1.3,"朝":1.1,"昼":1.0},trend:"+10%",reason:{ja:"配車アプリは事前に料金確認できて安心。",en:"Ride-hailing apps show prices upfront.",zh:"网约车App可提前确认费用，安心便捷。",ko:"차량 호출 앱은 요금을 미리 확인할 수 있어 안심."}},"🛺 トゥクトゥク":{minPerKm:Math.round(80/r),baseMin:Math.round(400/r),baseAvg:Math.round(600/r),surge:{"深夜":1.5,"夕方":1.3,"朝":1.1,"昼":1.0},trend:"+8%",reason:{ja:"乗車前に値段を確認してください。",en:"Always confirm price before boarding.",zh:"上车前务必确认价格。",ko:"탑승 전 반드시 가격을 확인하세요."}},"🚌 バス":{minPerKm:Math.round(10/r),baseMin:Math.round(150/r),baseAvg:Math.round(200/r),surge:{"深夜":1.0,"夕方":1.0,"朝":1.0,"昼":1.0},trend:"+3%",reason:{ja:"公共交通機関は最もコスパが良い。",en:"Public transport offers the best value.",zh:"公共交通是性价比最高的出行方式。",ko:"대중교통이 가장 가성비가 좋습니다."}}},
    hotel:{"🏠 ゲストハウス":b(3000),"⭐ ビジネス":b(10000),"⭐⭐ 中級":b(20000),"⭐⭐⭐ 高級":b(50000),"🏖️ リゾート":b(40000)},
    shopping:{"👕 衣料":b(3000),"💄 コスメ":b(2000),"🛒 スーパー":b(500),"🎁 おみやげ":b(2000),"💻 家電":b(30000)},
    activity:{"🏛️ 観光入場":b(1500),"🤿 アクティビティ":b(8000),"💆 マッサージ":b(5000),"🎭 エンタメ":b(8000),"🚌 ツアー":b(10000)},
  };
}

function getTaxiPrice(db,subKey,dist,time,cf){
  const d=db?.[subKey];if(!d?.minPerKm&&d?.minPerKm!==0)return null;
  const surge=d.surge?.[time]||1.0;
  return{avg:Math.round((d.baseAvg+d.minPerKm*dist)*surge*cf),min:Math.round((d.baseMin+d.minPerKm*0.7*dist)*cf),max:Math.round((d.baseAvg+d.minPerKm*1.5*dist)*(d.surge?.["深夜"]||1.3)*cf),trend:d.trend,reason:d.reason};
}

function getPriceInfo(country,city,catId,subCatJa,dist,time,lang){
  const db=PRICE_DB[country.name]||getDefaultDB(country);
  const cf=CITY_FACTOR[city]||1.0;
  if(catId==="taxi")return getTaxiPrice(db[catId],subCatJa,parseInt(dist),time,cf);
  const base=db[catId]?.[subCatJa];if(!base)return null;
  const note=cf!==1.0?` ※${city}の物価係数（×${cf}）を反映。`:"";
  const r2=typeof base.reason==="object"?(base.reason[lang]||base.reason.ja):base.reason;return{min:Math.round(base.min*cf),avg:Math.round(base.avg*cf),max:Math.round(base.max*cf),trend:base.trend,reason:r2+note};
}

function judgeVerdict(amount,min,avg,max,t){
  if(amount<=avg*0.75)return{verdict:t.cheap,emoji:"🤩",color:"#007a5e",bg:"#e0f5ef",pct:Math.round((1-amount/avg)*100)};
  if(amount<=avg*1.25)return{verdict:t.normal,emoji:"😊",color:"#8a6800",bg:"#fdf6d8",pct:0};
  return{verdict:t.exp,emoji:"😮",color:"#c05000",bg:"#fdeee0",pct:Math.round((amount/avg-1)*100)};
}

const TRAVEL_LINKS=[
  {cat:"✈️",label:"Google Flights",url:"https://www.google.com/travel/flights",desc:{ja:"最安値を一括比較",en:"Compare cheapest flights",zh:"机票比价",ko:"최저가 항공권 비교"},color:"#1a73e8"},
  {cat:"✈️",label:"Skyscanner",url:"https://www.skyscanner.jp/",desc:{ja:"世界最大の比較サイト",en:"World's largest flight search",zh:"全球最大机票比价",ko:"세계 최대 항공권 비교"},color:"#0770e3"},
  {cat:"🏨",label:"Booking.com",url:"https://www.booking.com/",desc:{ja:"世界No.1宿泊予約",en:"World's #1 accommodation",zh:"全球最大酒店预订",ko:"세계 1위 숙박 예약"},color:"#003580"},
  {cat:"🏨",label:"じゃらんnet",url:"https://www.jalan.net/",desc:{ja:"国内・海外公式予約",en:"Japan's major hotel booking",zh:"日本主要酒店预订",ko:"일본 주요 호텔 예약"},color:"#e60012"},
  {cat:"🗺️",label:{ja:"外務省 海外安全情報",en:"Japan MOFA Safety Info",zh:"日本外务省海外安全",ko:"일본 외무성 안전정보"},url:"https://www.anzen.mofa.go.jp/",desc:{ja:"危険情報・感染症情報",en:"Travel safety & health alerts",zh:"危险信息·传染病信息",ko:"위험 정보·감염병 정보"},color:"#1a3a6e"},
  {cat:"🗺️",label:"Google Maps",url:"https://maps.google.com/",desc:{ja:"ルート案内・乗換検索",en:"Navigation & transit search",zh:"路线导航·换乘搜索",ko:"경로 안내·환승 검색"},color:"#34a853"},
  {cat:"🌐",label:"Google Translate",url:"https://translate.google.com/",desc:{ja:"カメラ翻訳・音声対応",en:"Camera & voice translation",zh:"拍照翻译·语音翻译",ko:"카메라·음성 번역"},color:"#4285f4"},
  {cat:"🌐",label:"DeepL",url:"https://www.deepl.com/translator",desc:{ja:"高精度AI翻訳",en:"High-accuracy AI translation",zh:"高精度AI翻译",ko:"고정밀 AI 번역"},color:"#0d3b85"},
  {cat:"🛡️",label:"Rome2rio",url:"https://www.rome2rio.com/",desc:{ja:"世界中の移動方法を検索",en:"Find any route worldwide",zh:"全球交通方式搜索",ko:"전 세계 이동 방법 검색"},color:"#f57c00"},
];
const LINK_CATS=[...new Set(TRAVEL_LINKS.map(l=>l.cat))];

const TREND_DATA=[
  {city:"🇹🇭 Bangkok",item:"Pad Thai (street)",old:"50 THB",now:"60 THB",pct:"+20%",dir:"up",barW:55},
  {city:"🇰🇷 Seoul",item:"Cafe latte",old:"5,300 KRW",now:"5,500 KRW",pct:"Stable",dir:"flat",barW:42},
  {city:"🇺🇸 New York",item:"Taxi base fare",old:"$8",now:"$10+",pct:"+15%",dir:"up",barW:72},
  {city:"🇯🇵 Tokyo",item:"Lunch set",old:"¥900",now:"¥1,100",pct:"+22%",dir:"up",barW:65},
  {city:"🇸🇬 Singapore",item:"Hawker meal",old:"5 SGD",now:"6 SGD",pct:"+20%",dir:"up",barW:58},
  {city:"🇻🇳 Ho Chi Minh",item:"Pho",old:"40k VND",now:"50k VND",pct:"+25%",dir:"up",barW:48},
];

const S={
  accent:"#005fa3",    // 青系アクセント（赤緑色盲対応）
  light:"#4da6d9",     // 明るい青
  muted:"#595550",     // 濃いめグレー（コントラスト確保）
  border:"#c8c2b8",    // 境界線
  bg:"#f7f5f0",        // 背景
  tag:"#edeae4",       // タグ背景
  cheap:"#007a5e",     // 安い（青緑）
  normal:"#8a6800",    // 普通（濃い黄）
  expensive:"#c05000", // 高い（オレンジ）
};

export default function App(){
  const [lang,setLang]=useState("ja");
  const t=T[lang]||T.ja;
  const [tab,setTab]=useState("check");
  const [country,setCountry]=useState(null);
  const [city,setCity]=useState(null);
  const [mainCat,setMainCat]=useState(null);
  const [subCatJa,setSubCatJa]=useState(null); // always stored in JA key
  const [foodGroup,setFoodGroup]=useState(null);
  const [taxiDist,setTaxiDist]=useState(5);
  const [taxiTime,setTaxiTime]=useState("朝");
  const [amount,setAmount]=useState("");
  const [result,setResult]=useState(null);
  const [compareMode,setCompareMode]=useState(false);
  const [compareItems,setCompareItems]=useState([]);
  const [cmpName,setCmpName]=useState("");
  const [cmpAmt,setCmpAmt]=useState("");
  const [posts,setPosts]=useState([]);
  const [postItem,setPostItem]=useState("");
  const [postPrice,setPostPrice]=useState("");
  const [toast,setToast]=useState("");
  const [linkCat,setLinkCat]=useState(LINK_CATS[0]);
  const [liveRates,setLiveRates]=useState(null);
  const [rateStatus,setRateStatus]=useState("loading");
  const [scamCountry,setScamCountry]=useState(null);
  const [phraseCountry,setPhraseCountry]=useState(null);
  const [phraseCat,setPhraseCat]=useState(null);
  const [copied,setCopied]=useState(null);

  useEffect(()=>{
    (async()=>{
      const rates=await fetchRates();
      if(rates){setLiveRates(rates);setRateStatus("live");}else setRateStatus("fallback");
      try{const saved=localStorage.getItem('nebula_posts');if(saved)setPosts(JSON.parse(saved));}catch{}
    })();
  },[]);

  const getRate=(cur)=>liveRates?.[cur]??FALLBACK_RATES[cur]??1;
  const showToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2500);};
  const jpy=country&&amount&&country.currency!=="JPY"?Math.round(parseFloat(amount)*getRate(country.currency)).toLocaleString():null;
  const canJudge=country&&city&&mainCat&&subCatJa&&parseFloat(amount)>0;

  const runJudge=()=>{
    const info=getPriceInfo(country,city,mainCat.id,subCatJa,taxiDist,taxiTime,lang);
    if(!info){showToast(t.noData);return;}
    const amt=parseFloat(amount);
    const j=judgeVerdict(amt,info.min,info.avg,info.max,t);
    setResult({...j,...info,barPct:Math.min(100,Math.max(5,((amt-info.min)/(info.max-info.min))*100)),currency:country.currency});
  };

  const addToCompare=()=>{
    if(!cmpName||!cmpAmt){showToast(t.noCmp);return;}
    const info=getPriceInfo(country,city,mainCat.id,subCatJa,taxiDist,taxiTime,lang);
    if(!info){showToast(t.noPrice);return;}
    const amt=parseFloat(cmpAmt);
    const j=judgeVerdict(amt,info.min,info.avg,info.max,t);
    setCompareItems(prev=>[...prev,{name:cmpName,amount:amt,currency:country.currency,avg:info.avg,...j}]);
    setCmpName("");setCmpAmt("");
    showToast(t.added(cmpName));
  };

  const submitPost=async()=>{
    if(!postItem||!postPrice){showToast(t.noCmp);return;}
    const cityLabel=country&&city?(country.cities?.[lang]||country.cities?.ja||[])[(country.cities?.ja||[]).indexOf(city)]||city:city||"";
    const np={item:postItem,price:postPrice,currency:country?.currency||"",city:cityLabel,time:new Date().toLocaleDateString("ja-JP")};
    const nps=[np,...posts].slice(0,50);
    setPosts(nps);try{localStorage.setItem('nebula_posts',JSON.stringify(nps));}catch{}
    setPostItem("");setPostPrice("");showToast(t.postOk);
  };

  // Get subcategory keys and labels for current lang
  const getFoodSubsForGroup=(group)=>({
    keys:group.subs.ja,
    labels:group.subs[lang]||group.subs.ja,
  });
  const getSubCats=(catId)=>{
    if(catId==="food")return null;
    const sc=SUB_CATS[catId];
    return{keys:sc.ja,labels:sc[lang]||sc.ja};
  };

  const Pill=({selected,onClick,children,small})=>(
    <button onClick={onClick} style={{padding:small?"7px 12px":"9px 14px",background:selected?S.accent:S.tag,border:`1.5px solid ${selected?S.accent:S.border}`,borderRadius:24,fontSize:small?12:13,cursor:"pointer",color:selected?"#fff":"#1a1a14",whiteSpace:"nowrap",fontWeight:selected?700:400}}>
      {children}
    </button>
  );

  return(
    <div style={{background:S.bg,minHeight:"100vh",fontFamily:"'Noto Sans JP','DM Sans',sans-serif",paddingBottom:90}}>
      <div style={{position:"fixed",top:0,left:0,right:0,height:200,background:"linear-gradient(160deg,#003f7a,#00284f)",zIndex:0}}/>
      <div style={{position:"relative",zIndex:1,maxWidth:860,margin:"0 auto"}}>

        {/* Header */}
        <div style={{padding:"48px 20px 14px"}}>
          <div style={{fontSize:10,letterSpacing:3,color:"rgba(255,255,255,0.85)",marginBottom:4,fontWeight:500,letterSpacing:2}}>{t.sub}</div>
          <div style={{fontSize:26,color:"#fff",fontFamily:"Georgia,serif",fontWeight:"bold",marginBottom:10}}>
            Nebula<span style={{color:S.light}}>Price</span>
          </div>
          {/* Lang switcher */}
          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            {LANGS.map(l=>(
              <button key={l.code} onClick={()=>setLang(l.code)}
                style={{padding:"5px 11px",fontSize:11,borderRadius:20,border:`1.5px solid ${lang===l.code?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.3)"}`,background:lang===l.code?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)",color:"#fff",cursor:"pointer",fontWeight:lang===l.code?700:400}}>
                {l.label}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:11,background:"rgba(126,200,154,0.2)",color:S.light,padding:"3px 10px",borderRadius:20}}>{t.c15}</span>
            <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:rateStatus==="live"?"rgba(77,166,217,0.3)":"rgba(255,255,255,0.15)",color:rateStatus==="live"?"#a8d9f5":"rgba(255,255,255,0.75)"}}>
              {rateStatus==="loading"?t.rLoad:rateStatus==="live"?t.rLive:t.rFix}
            </span>
          </div>
        </div>

        {/* ── CHECK TAB ── */}
        {tab==="check"&&(
          <div>
            <div style={{margin:"0 16px",background:"#fff",borderRadius:24,padding:20,boxShadow:"0 8px 40px rgba(0,0,0,0.12)"}}>
              {/* Progress */}
              <div style={{display:"flex",gap:6,marginBottom:20}}>
                {[!!country,!!city,!!mainCat,!!subCatJa,parseFloat(amount)>0].map((done,i)=>(
                  <div key={i} style={{flex:1,height:3,borderRadius:2,background:done?S.light:S.border,transition:"background 0.3s"}}/>
                ))}
              </div>

              {/* ① Country */}
              <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:8}}>{t.s1}</div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,marginBottom:14,scrollbarWidth:"none"}}>
                {COUNTRIES.map(c=>(
                  <button key={c.name} onClick={()=>{setCountry(c);setCity(null);setResult(null);setCompareItems([]);}}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"8px 12px",background:country?.name===c.name?S.accent:S.tag,border:`1.5px solid ${country?.name===c.name?S.accent:S.border}`,borderRadius:40,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,color:country?.name===c.name?"#fff":"#1a1a14",fontSize:12}}>
                    <span style={{fontSize:16}}>{c.flag}</span>{c.label?.[lang]||c.name}
                  </button>
                ))}
              </div>

              {/* ② City */}
              {country&&<>
                <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:8}}>{t.s2}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
                  {(country.cities?.ja||country.cities||[]).map((c,i)=>{
                    const label=(country.cities?.[lang]||country.cities?.ja||[])[i]||c;
                    return <Pill key={c} selected={city===c} onClick={()=>{setCity(c);setResult(null);}}>{label}</Pill>;
                  })}
                </div>
              </>}

              {/* ③ Main Cat */}
              {city&&<>
                <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:8}}>{t.s3}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                  {MAIN_CATS.map(c=>(
                    <button key={c.id} onClick={()=>{setMainCat(c);setSubCatJa(null);setFoodGroup(null);setResult(null);setCompareItems([]);}}
                      style={{background:mainCat?.id===c.id?"#ddeeff":"#ffffff",border:`2px solid ${mainCat?.id===c.id?S.accent:"#c8c2b8"}`,borderRadius:12,padding:14,cursor:"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                      <div style={{fontSize:22,marginBottom:6}}>{c.icon}</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#1a1a1a"}}>{c.name[lang]||c.name.ja}</div>
                      <div style={{fontSize:11,color:"#595550",marginTop:3}}>{c.hint[lang]||c.hint.ja}</div>
                    </button>
                  ))}
                </div>
              </>}

              {/* ④ Subcategory */}
              {mainCat&&mainCat.id==="food"&&<>
                <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:8}}>{t.s4}</div>
                <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:4,marginBottom:10,scrollbarWidth:"none"}}>
                  {FOOD_GROUPS.map(g=>(
                    <button key={g.label.ja} onClick={()=>{setFoodGroup(g.label.ja);setSubCatJa(null);setResult(null);}}
                      style={{padding:"7px 13px",background:foodGroup===g.label.ja?S.accent:S.tag,border:`1.5px solid ${foodGroup===g.label.ja?S.accent:S.border}`,borderRadius:24,fontSize:12,cursor:"pointer",color:foodGroup===g.label.ja?"#fff":"#1a1a14",whiteSpace:"nowrap",flexShrink:0,fontWeight:700}}>
                      {g.label[lang]||g.label.ja}
                    </button>
                  ))}
                </div>
                {foodGroup&&(()=>{
                  const g=FOOD_GROUPS.find(g=>g.label.ja===foodGroup);
                  const {keys,labels}=getFoodSubsForGroup(g);
                  return(
                    <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:16}}>
                      {keys.map((k,i)=>(
                        <Pill key={k} selected={subCatJa===k} onClick={()=>{setSubCatJa(k);setResult(null);}} small>{labels[i]}</Pill>
                      ))}
                    </div>
                  );
                })()}
              </>}

              {mainCat&&mainCat.id!=="food"&&<>
                <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:8}}>{t.s4b}</div>
                {(()=>{
                  const sc=getSubCats(mainCat.id);
                  return(
                    <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:16}}>
                      {sc.keys.map((k,i)=>(
                        <Pill key={k} selected={subCatJa===k} onClick={()=>{setSubCatJa(k);setResult(null);}}>{sc.labels[i]}</Pill>
                      ))}
                    </div>
                  );
                })()}
              </>}

              {/* Taxi extras */}
              {mainCat?.id==="taxi"&&(
                <div style={{marginBottom:16,display:"flex",flexDirection:"column",gap:12}}>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:S.muted,marginBottom:6}}>
                      <span>{t.dist}</span><span style={{color:S.accent,fontWeight:700}}>{taxiDist} km</span>
                    </div>
                    <input type="range" min="1" max="50" value={taxiDist} onChange={e=>{setTaxiDist(e.target.value);setResult(null);}} style={{width:"100%",accentColor:S.accent}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:8}}>{t.time}</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                      {[["朝",t.am,"🌅"],["昼",t.noon,"☀️"],["夕方",t.pm,"🌆"],["深夜",t.late,"🌙"]].map(([key,label,ic])=>(
                        <button key={key} onClick={()=>{setTaxiTime(key);setResult(null);}}
                          style={{padding:"8px 4px",background:taxiTime===key?S.accent:S.tag,border:`1.5px solid ${taxiTime===key?S.accent:S.border}`,borderRadius:10,fontSize:11,cursor:"pointer",color:taxiTime===key?"#fff":"#1a1a14"}}>
                          {ic} {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ⑤ Amount */}
              {mainCat&&subCatJa&&<>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase"}}>{t.s5}</div>
                  <button onClick={()=>{setCompareMode(!compareMode);setResult(null);setCompareItems([]);}}
                    style={{fontSize:11,padding:"5px 12px",borderRadius:20,border:`1.5px solid ${compareMode?S.accent:S.border}`,background:compareMode?S.accent:"transparent",color:compareMode?"#fff":S.muted,cursor:"pointer"}}>
                    {compareMode?t.cmpOn:t.cmpOff}
                  </button>
                </div>

                {!compareMode?(
                  <>
                    <div style={{background:S.tag,border:`1.5px solid ${parseFloat(amount)>0?S.accent:S.border}`,borderRadius:14,padding:14,marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <div style={{background:S.accent,color:"#fff",padding:"7px 12px",borderRadius:10,fontSize:13,fontWeight:700}}>{country?.currency||"--"}</div>
                        <input type="number" value={amount} onChange={e=>{setAmount(e.target.value);setResult(null);}} placeholder="0"
                          style={{flex:1,background:"none",border:"none",outline:"none",fontSize:34,fontFamily:"Georgia,serif",color:"#1a1a14",minWidth:0}}/>
                      </div>
                      {jpy&&parseFloat(amount)>0&&(
                        <div style={{fontSize:13,color:S.muted,marginTop:8,paddingTop:8,borderTop:`1px solid ${S.border}`}}>
                          {t.approx(jpy)}
                        </div>
                      )}
                    </div>
                    <button onClick={runJudge} disabled={!canJudge}
                      style={{width:"100%",background:canJudge?S.accent:"#ccc",color:"#fff",border:"none",borderRadius:14,padding:16,fontSize:15,fontWeight:700,cursor:canJudge?"pointer":"not-allowed"}}>
                      {t.judge}
                    </button>
                  </>
                ):(
                  <div>
                    <div style={{background:S.tag,border:`1.5px solid ${S.border}`,borderRadius:14,padding:14,marginBottom:10}}>
                      <input value={cmpName} onChange={e=>setCmpName(e.target.value)} placeholder={t.itemPh}
                        style={{width:"100%",background:"none",border:"none",outline:"none",fontSize:13,color:"#1a1a14",marginBottom:10,fontFamily:"inherit"}}/>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <div style={{background:S.accent,color:"#fff",padding:"7px 11px",borderRadius:10,fontSize:12,fontWeight:700}}>{country?.currency}</div>
                        <input type="number" value={cmpAmt} onChange={e=>setCmpAmt(e.target.value)} placeholder={t.amtPh}
                          style={{flex:1,background:"none",border:"none",outline:"none",fontSize:26,fontFamily:"Georgia,serif",color:"#1a1a14",minWidth:0}}/>
                        <button onClick={addToCompare}
                          style={{background:S.accent,color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{t.add}</button>
                      </div>
                    </div>
                    {compareItems.length>0&&(
                      <div style={{background:"#fff",border:`1px solid ${S.border}`,borderRadius:14,padding:14,marginBottom:10}}>
                        <div style={{fontSize:11,color:S.muted,marginBottom:10,fontWeight:700}}>{t.compareResult}</div>
                        {compareItems.map((item,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:i<compareItems.length-1?`1px solid ${S.border}`:"none"}}>
                            <div style={{fontSize:22}}>{item.emoji}</div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,fontWeight:700}}>{item.name}</div>
                              <div style={{fontSize:11,color:S.muted,color:"#595550"}}>{item.amount.toLocaleString()} {item.currency} / {t.avgL}: {item.avg.toLocaleString()}</div>
                            </div>
                            <div style={{fontSize:12,fontWeight:700,color:item.color,background:item.bg,padding:"3px 9px",borderRadius:20}}>{item.verdict}</div>
                            <button onClick={()=>setCompareItems(prev=>prev.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:14}}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Result */}
                {result&&!compareMode&&(
                  <div style={{marginTop:16}}>
                    <div style={{background:result.bg,borderRadius:14,padding:16,marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{fontSize:44}}>{result.emoji}</div>
                      <div>
                        <div style={{fontSize:26,fontFamily:"Georgia,serif",fontWeight:"bold",color:result.color}}>{result.verdict}</div>
                        <div style={{fontSize:12,color:S.muted,marginTop:2}}>
                          {result.verdict===t.cheap?t.cheapD(result.pct):result.verdict===t.exp?t.expD(result.pct):t.normalD}
                        </div>
                      </div>
                    </div>
                    <div style={{height:7,background:S.tag,borderRadius:4,marginBottom:14,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${result.barPct}%`,background:"linear-gradient(90deg,#007a5e,#8a6800,#c05000)",borderRadius:4,transition:"width 0.8s"}}/>
                    </div>
                    <div style={{background:"#f8f6f2",borderLeft:`3px solid ${S.accent}`,borderRadius:10,padding:12,marginBottom:12}}>
                      <div style={{fontSize:10,letterSpacing:2,color:"#005fa3",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{t.priceD}</div>
                      <div style={{fontSize:12,lineHeight:1.8}}>{result.reason}</div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:12}}>
                      {[[t.avgL,result.avg],[t.minL,result.min],[t.maxL,result.max]].map(([l,v])=>(
                        <div key={l} style={{background:S.tag,borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
                          <div style={{fontSize:10,color:S.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{l}</div>
                          <div style={{fontSize:12,fontFamily:"Georgia,serif"}}>{typeof v==="number"?v.toLocaleString():v} {result.currency}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:600,background:result.trend?.includes("+")?"#fdeee0":"#edeae4",color:result.trend?.includes("+")?"#c05000":S.muted}}>
                      {result.trend?.includes("+")?t.trendUp(result.trend.replace(/\+/g,'')):t.trendSt(result.trend)}
                    </div>
                  </div>
                )}
              </>}
            </div>

            {/* Post section */}
            {(result||compareItems.length>0)&&(
              <div style={{margin:"12px 16px 0",background:"#fff",border:`1.5px solid ${S.border}`,borderRadius:16,padding:16}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>{t.postT}</div>
                <div style={{fontSize:11,color:S.muted,marginBottom:12,lineHeight:1.5}}>{t.postD}</div>
                <input value={postItem} onChange={e=>setPostItem(e.target.value)} placeholder={t.postPh}
                  style={{width:"100%",background:S.tag,border:`1.5px solid ${S.border}`,borderRadius:10,padding:"9px 12px",fontSize:12,outline:"none",fontFamily:"inherit",marginBottom:7,boxSizing:"border-box"}}/>
                <div style={{display:"flex",gap:7}}>
                  <input value={postPrice} onChange={e=>setPostPrice(e.target.value)} type="number" placeholder={t.amtPh}
                    style={{flex:1,background:S.tag,border:`1.5px solid ${S.border}`,borderRadius:10,padding:"9px 12px",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                  <button onClick={submitPost} style={{background:S.accent,color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{t.postSv}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SCAM TAB ── */}
        {tab==="scam"&&(
          <div style={{background:S.bg,minHeight:"100vh"}}>
            <div style={{padding:"52px 20px 16px"}}>
              <div style={{fontSize:24,color:"#fff",fontFamily:"Georgia,serif",fontWeight:"bold",marginBottom:4,textShadow:"0 1px 4px rgba(0,0,0,0.4)"}}>{t.scamT}</div>
              <div style={{fontSize:13,color:"#fff",fontWeight:600,background:"rgba(0,0,0,0.25)",display:"inline-block",padding:"3px 10px",borderRadius:20,marginTop:4}}>{t.scamD}</div>
            </div>
            {/* 国選択 - 白帯で完全に見やすく */}
            <div style={{background:"#fff",padding:"14px 0 14px 16px",marginBottom:0,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
              <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:10,paddingRight:16}}>🌍 SELECT COUNTRY</div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,paddingRight:16,scrollbarWidth:"none"}}>
                {COUNTRIES.filter(c=>SCAM_DATA[c.name]).map(c=>(
                  <button key={c.name} onClick={()=>setScamCountry(c.name)}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:scamCountry===c.name?S.accent:"#f0ede8",border:`2px solid ${scamCountry===c.name?S.accent:"#e8e3db"}`,borderRadius:40,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,color:scamCountry===c.name?"#fff":"#1a1a14",fontSize:13,fontWeight:scamCountry===c.name?700:500}}>
                    <span style={{fontSize:16}}>{c.flag}</span>{c.label?.[lang]||c.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{margin:"10px 16px 0"}}>
              {!scamCountry?(
                <div style={{background:"#fff",borderRadius:20,padding:32,textAlign:"center",color:S.muted,boxShadow:"0 2px 12px rgba(0,0,0,0.07)"}}>
                  <div style={{fontSize:34,marginBottom:10}}>👆</div>
                  <div style={{fontSize:13}}>{t.scamSel}</div>
                </div>
              ):(SCAM_DATA[scamCountry]||[]).map((s,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    <div style={{fontSize:26,flexShrink:0}}>{s.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                        <div style={{fontSize:13,fontWeight:700}}>{s.title[lang]||s.title.ja}</div>
                        <div style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:700,background:s.level==="high"?"#fdeee0":s.level==="med"?"#fdf6d8":"#edeae4",color:s.level==="high"?"#c05000":s.level==="med"?"#8a6800":"#595550"}}>
                          {s.level==="high"?t.lH:s.level==="med"?t.lM:t.lL}
                        </div>
                      </div>
                      <div style={{fontSize:12,color:"#444",lineHeight:1.7}}>{s.desc[lang]||s.desc.ja}</div>
                    </div>
                  </div>
                </div>
              ))}
              {scamCountry&&(
                <div style={{background:"#e0eeff",borderRadius:12,padding:12,marginBottom:14,fontSize:11,color:"#003f7a",lineHeight:1.7,fontWeight:600}}>
                  {t.scamNote}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PHRASE TAB ── */}
        {tab==="phrase"&&(
          <div style={{background:S.bg,minHeight:"100vh"}}>
            <div style={{padding:"52px 20px 16px"}}>
              <div style={{fontSize:22,color:"#fff",fontFamily:"Georgia,serif",fontWeight:"bold",marginBottom:4,textShadow:"0 1px 4px rgba(0,0,0,0.4)"}}>{t.phraseT}</div>
              <div style={{fontSize:13,color:"#fff",fontWeight:600,background:"rgba(0,0,0,0.25)",display:"inline-block",padding:"3px 10px",borderRadius:20,marginTop:4}}>{t.phraseD}</div>
            </div>
            {/* 国選択 - 白帯で完全に見やすく */}
            <div style={{background:"#fff",padding:"14px 0 14px 16px",marginBottom:0,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
              <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:10,paddingRight:16}}>🌍 SELECT COUNTRY</div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,paddingRight:16,scrollbarWidth:"none"}}>
                {COUNTRIES.filter(c=>PHRASE_DATA[c.name]).map(c=>(
                  <button key={c.name} onClick={()=>{setPhraseCountry(c.name);setPhraseCat(null);}}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:phraseCountry===c.name?S.accent:"#f0ede8",border:`2px solid ${phraseCountry===c.name?S.accent:"#e8e3db"}`,borderRadius:40,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,color:phraseCountry===c.name?"#fff":"#1a1a14",fontSize:13,fontWeight:phraseCountry===c.name?700:500}}>
                    <span style={{fontSize:16}}>{c.flag}</span>{c.label?.[lang]||c.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{background:S.bg,padding:"12px 0"}}>
            {phraseCountry&&(()=>{
              const pd=PHRASE_DATA[phraseCountry];
              const catKeys=[...new Set(pd.phrases.map(p=>typeof p.cat==="object"?p.cat.ja:p.cat))];
              const cats=catKeys.map(k=>pd.phrases.find(p=>(typeof p.cat==="object"?p.cat.ja:p.cat)===k)?.cat||k);
              const filtered=phraseCat?pd.phrases.filter(p=>(typeof p.cat==="object"?p.cat.ja:p.cat)===(typeof phraseCat==="object"?phraseCat.ja:phraseCat)):pd.phrases;
              return(
                <div style={{margin:"0 16px"}}>
                  {/* Lang info bar - solid white */}
                  <div style={{background:"#fff",borderRadius:12,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#005fa3",fontWeight:700,border:"1px solid #c8c2b8"}}>
                    {t.phLang(typeof pd.lang==="object"?(pd.lang[lang]||pd.lang.ja):pd.lang)}
                  </div>
                  {/* Category filter - solid colored buttons */}
                  <div style={{background:"#edeae4",borderRadius:14,padding:"10px 12px",marginBottom:12}}>
                    <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:8}}>🗂 FILTER</div>
                    <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:2,scrollbarWidth:"none"}}>
                      <button onClick={()=>setPhraseCat(null)} style={{padding:"7px 14px",background:!phraseCat?S.accent:"#fff",border:`2px solid ${!phraseCat?S.accent:"#c8c2b8"}`,borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",color:!phraseCat?"#fff":"#1a1a1a",whiteSpace:"nowrap",flexShrink:0}}>
                        {t.phAll}
                      </button>
                      {cats.map(cat=>(
                        <button key={typeof cat==="object"?cat.ja:cat} onClick={()=>setPhraseCat(cat)} style={{padding:"7px 14px",background:phraseCat===cat?S.accent:"#fff",border:`2px solid ${phraseCat===cat?S.accent:"#c8c2b8"}`,borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",color:phraseCat===cat?"#fff":"#1a1a1a",whiteSpace:"nowrap",flexShrink:0}}>
                          {typeof cat==="object"?(cat[lang]||cat.ja):cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Phrase cards */}
                  {filtered.map((p,i)=>(
                    <div key={i} onClick={()=>{navigator.clipboard?.writeText(p.local);setCopied(i);setTimeout(()=>setCopied(null),1500);}}
                      style={{background:"#fff",borderRadius:14,padding:14,marginBottom:9,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",cursor:"pointer",border:`1.5px solid ${copied===i?S.accent:S.border}`,transition:"border 0.2s"}}>
                      <div style={{fontSize:10,color:"#005fa3",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>
                        {p.cat?.[lang]||p.cat?.ja||p.cat}
                      </div>
                      <div style={{fontSize:12,color:S.muted,marginBottom:5}}>
                        {LANGS.find(l=>l.code===lang)?.label.split(" ")[0]} {p.meaning?.[lang]||p.meaning?.ja||p.jp}
                      </div>
                      <div style={{fontSize:15,fontWeight:700,color:"#1a1a14",marginBottom:p.roman?"3px":"0"}}>{PHRASE_DATA[phraseCountry]?.flag} {p.local}</div>
                      {p.roman&&<div style={{fontSize:12,color:"#555",marginTop:2,letterSpacing:0.5}}>🔤 {p.roman}</div>}
                      <div style={{fontSize:10,color:copied===i?"#005fa3":"#c8c2b8",marginTop:7,textAlign:"right",fontWeight:copied===i?700:400}}>
                        {copied===i?t.phCopied:t.phTap}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {!phraseCountry&&(
              <div style={{margin:"0 16px"}}>
                <div style={{background:"#fff",borderRadius:20,padding:32,textAlign:"center",color:S.muted,boxShadow:"0 2px 12px rgba(0,0,0,0.07)"}}>
                  <div style={{fontSize:34,marginBottom:10}}>👆</div>
                  <div style={{fontSize:13}}>{t.phraseSel}</div>
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* ── TRAVEL TAB ── */}
        {tab==="travel"&&(
          <div>
            <div style={{padding:"52px 20px 16px"}}>
              <div style={{fontSize:24,color:"#fff",fontFamily:"Georgia,serif",fontWeight:"bold",marginBottom:4,textShadow:"0 1px 4px rgba(0,0,0,0.4)"}}>{t.travT}</div>
              <div style={{fontSize:13,color:"#fff",fontWeight:600,background:"rgba(0,0,0,0.25)",display:"inline-block",padding:"3px 10px",borderRadius:20,marginTop:4}}>{t.travD}</div>
            </div>
            <div style={{background:"#fff",padding:"14px 0 14px 16px",boxShadow:"0 2px 8px rgba(0,0,0,0.08)",marginBottom:0}}>
              <div style={{fontSize:10,letterSpacing:2,color:S.muted,textTransform:"uppercase",marginBottom:10,paddingRight:16}}>🗂 CATEGORY</div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,paddingRight:16,scrollbarWidth:"none"}}>
                {LINK_CATS.map(cat=>(
                  <button key={cat} onClick={()=>setLinkCat(cat)}
                    style={{padding:"8px 16px",background:linkCat===cat?S.accent:"#edeae4",border:`2px solid ${linkCat===cat?S.accent:"#c8c2b8"}`,borderRadius:24,fontSize:13,fontWeight:linkCat===cat?700:500,cursor:"pointer",color:linkCat===cat?"#fff":"#1a1a1a",whiteSpace:"nowrap",flexShrink:0}}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div style={{margin:"0 16px"}}>
              {TRAVEL_LINKS.filter(l=>l.cat===linkCat).map((l,i)=>(
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{display:"block",textDecoration:"none",background:"#fff",borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:10,background:l.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff",flexShrink:0}}>
                      {l.cat}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#1a1a14",marginBottom:2}}>{typeof l.label==="object"?(l.label[lang]||l.label.ja):l.label}</div>
                      <div style={{fontSize:11,color:S.muted}}>{typeof l.desc==="object"?(l.desc[lang]||l.desc.ja):l.desc}</div>
                      <div style={{fontSize:10,color:l.color,marginTop:3,fontWeight:600}}>{l.url.replace("https://","").split("/")[0]}</div>
                    </div>
                    <div style={{fontSize:16,color:S.border}}>›</div>
                  </div>
                </a>
              ))}
              <div style={{background:"rgba(45,90,61,0.08)",borderRadius:12,padding:12,marginBottom:14,fontSize:11,color:S.accent,lineHeight:1.6}}>
                {t.travNote}
              </div>
            </div>
          </div>
        )}

        {/* ── TREND TAB ── */}
        {tab==="trend"&&(
          <div>
            <div style={{padding:"52px 20px 16px"}}>
              <div style={{fontSize:24,color:"#fff",fontFamily:"Georgia,serif",fontWeight:"bold",marginBottom:4,textShadow:"0 1px 4px rgba(0,0,0,0.4)"}}>{t.trendT}</div>
              <div style={{fontSize:13,color:"#fff",fontWeight:600,background:"rgba(0,0,0,0.25)",display:"inline-block",padding:"3px 10px",borderRadius:20,marginTop:4}}>{t.trendD}</div>
            </div>
            <div style={{margin:"0 16px"}}>
              {TREND_DATA.map((td,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:18,padding:18,marginBottom:10,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                    <div>
                      <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:"bold"}}>{td.city}</div>
                      <div style={{fontSize:11,color:S.muted,marginTop:2}}>{td.item}</div>
                    </div>
                    <div style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:td.dir==="up"?"#fdeee0":"#edeae4",color:td.dir==="up"?"#c05000":S.muted}}>
                      {td.dir==="up"?"↑":"→"} {td.pct}
                    </div>
                  </div>
                  <div style={{height:5,background:S.tag,borderRadius:3,marginBottom:7,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${td.barW}%`,background:"linear-gradient(90deg,#007a5e,#8a6800,#c05000)",borderRadius:3}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:S.muted}}>
                    <span>{t.prev}: {td.old}</span><span>{t.now}: {td.now}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DB TAB ── */}
        {tab==="db"&&(
          <div>
            <div style={{padding:"52px 20px 16px"}}>
              <div style={{fontSize:24,color:"#fff",fontFamily:"Georgia,serif",fontWeight:"bold",marginBottom:4,textShadow:"0 1px 4px rgba(0,0,0,0.4)"}}>{t.dbT}</div>
              <div style={{fontSize:13,color:"#fff",fontWeight:600,background:"rgba(0,0,0,0.25)",display:"inline-block",padding:"3px 10px",borderRadius:20,marginTop:4}}>{t.dbD}</div>
            </div>
            <div style={{margin:"0 16px"}}>
              {posts.length===0?(
                <div style={{background:"#fff",borderRadius:20,padding:36,textAlign:"center",color:S.muted}}>
                  <div style={{fontSize:36,marginBottom:10}}>📭</div>
                  <div style={{fontSize:13}}>{t.dbE}</div>
                </div>
              ):posts.map((p,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:12,padding:14,marginBottom:9,boxShadow:"0 2px 8px rgba(0,0,0,0.05)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700}}>{p.item}</div>
                    <div style={{fontSize:11,color:S.muted,marginTop:2}}>{p.city} · {p.time}</div>
                  </div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:16,color:"#005fa3",fontWeight:700}}>{parseFloat(p.price).toLocaleString()} {p.currency}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:860,background:"rgba(255,255,255,0.97)",backdropFilter:"blur(20px)",borderTop:`1px solid ${S.border}`,display:"flex",zIndex:100}}>
        {[["check","🔍",t.tabC],["scam","⚠️",t.tabS],["phrase","💬",t.tabP],["travel","✈️",t.tabTr],["trend","📊",t.tabTd],["db","🗄️",t.tabD]].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:"11px 0 7px",textAlign:"center",cursor:"pointer",color:tab===id?S.accent:S.muted,fontSize:8,fontFamily:"inherit",letterSpacing:0.2,border:"none",background:"none",fontWeight:tab===id?700:400}}>
            <div style={{fontSize:16,marginBottom:2}}>{icon}</div>{label}
          </button>
        ))}
      </div>

      {toast&&(
        <div style={{position:"fixed",bottom:95,left:"50%",transform:"translateX(-50%)",background:S.accent,color:"#fff",padding:"10px 20px",borderRadius:24,fontSize:12,fontWeight:600,zIndex:200,whiteSpace:"nowrap"}}>
          {toast}
        </div>
      )}
    </div>
  );
}
