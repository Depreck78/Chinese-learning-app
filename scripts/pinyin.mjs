// Pinyin for Chinese text in context, shared by the lesson and sentence builders.
import { pinyin } from 'pinyin-pro';

export const isHanzi = (character) => /\p{Script=Han}/u.test(character);

// pinyin-pro often reads the structural particles 得 and 地 as dé and dì. Fix the clear cases:
// verb + 得 + degree word (跑得很快), and a reduplicated or adverbial phrase + 地 (慢慢地走).
const DEGREE_AFTER_DE = new Set('很非常太真挺十分特别更越不好快慢清高多少早晚远近对错累饱难漂干认舒热冷还满像比又稍没整');
const ADVERBS_BEFORE_DE = ['一步一步', '认真', '高兴', '努力', '小心', '不停', '突然', '安静', '仔细', '轻轻', '大声', '热情', '开心', '耐心', '紧张', '慢慢', '好好', '静静', '渐渐', '默默', '悄悄', '紧紧', '深深', '偷偷', '快快', '远远', '早早', '急忙', '热烈', '清楚', '一点一点', '自然', '愉快', '顺利', '勇敢', '激动', '主动', '明显', '逐渐', '不断', '积极', '简单', '随便', '慢吞吞', '兴奋', '平静', '满意', '坚决', '亲切', '温柔', '疯狂', '勇猛', '激烈', '大胆', '飞快', '用力', '狠狠', '迅速', '紧急', '热心', '专心', '安全', '冷静', '礼貌', '友好', '犹豫', '耐心地', '仔仔细细', '高高兴兴', '认认真真', '开开心心', '敏捷', '仔细', '轻松', '热闹', '彻底', '深深', '自豪', '欢腾', '恭敬', '小心', '拐弯抹角', '惭愧', '蹦蹦跳跳', '狼狈', '懊悔', '恍惚',
  '很快', '生气', '恣意', '惆怅', '不倦', '愁闷', '大方', '惊奇', '低声', '原状', '继日', '损坏', '逐字', '其妙', '光荣', '坦诚', '稳定', '缓慢', '详细', '五次', '愤怒', '频繁', '焦急', '经常', '完全', '虎咽', '所当然', '完美', '拼命', '仓促', '恶劣', '小怪', '痛苦', '顽强', '勉强', '流畅', '清晰', '胳膊', '截铁', '苦心', '不安', '永逸', '截了当', '羞怯', '呢喃', '诧异', '汹涌', '不绝', '更好', '愕然', '委婉', '朦胧', '不息', '扼要', '慷慨', '疲惫', '吃力', '懊丧', '不亢', '满志', '怅然', '填膺'];
// Other misreadings that show up in the example sentences, fixed from the neighbouring characters.
const MEASURE_BEFORE_ZHI = new Set('一二两三四五六七八九十几这那每哪半是有了画买抓养');
const ADVERB_ZHI_BEFORE = new Set('是有要能好不会需得在剩想');
const DE_AS_GET_AFTER = new Set('到知利意胜逞罪力标寸失奖益体病分过');
const DE_AS_GET_BEFORE = new Set('获取赢夺求筹值贪彼先难焉因');
const DEI_AFTER = new Set('我你他她们也还必都就人');
const DE_LIAO_AFTER = new Set('受吃做走去来动跑拿忍办用过');
const TEACHER_BEFORE_JIAO = new Set('我你他她师生姐妈爸哥授能会');
const NOUN_AFTER_JIAO = new Set('室授师堂练会徒科育材训养皇廷宗学');
const HANG_BEFORE = new Set('银一两几每排同');
const ZHUO_AFTER = new Set('衣穿沉执附');

function fixReading(characters, readings, index) {
  const character = characters[index];
  const before = characters[index - 1] ?? '';
  const after = characters[index + 1] ?? '';
  const reading = readings[index];
  if (character === '只' && (reading === 'zhī' || reading === 'zhǐ')) {
    // Measure word after a number or 这/那 (两只猫), otherwise the adverb "only" (只有).
    readings[index] = !ADVERB_ZHI_BEFORE.has(after) && MEASURE_BEFORE_ZHI.has(before) ? 'zhī' : 'zhǐ';
  } else if (character === '得' && reading === 'dé' && index > 0 && isHanzi(before) && isHanzi(after)
    && !(DE_AS_GET_AFTER.has(after) && characters[index + 2] !== '谅') && !DE_AS_GET_BEFORE.has(before)) {
    // 得 as "get" (得到, 获得) stays dé; 得了 after a subject is "caught / won" (他得了感冒).
    if (after === '了') readings[index] = DE_LIAO_AFTER.has(before) ? 'de' : 'dé';
    // "Must" after a subject (我得走了), otherwise the complement particle (跑得快).
    else readings[index] = DEI_AFTER.has(before) ? 'děi' : 'de';
  } else if (character === '了' && reading === 'liǎo' && !'不得'.includes(before) && !'解不'.includes(after) && !(before === '截' && after === '当')) {
    readings[index] = 'le';
  } else if (character === '着' && reading === 'zhuó' && index > 0 && !ZHUO_AFTER.has(before) && after !== '陆' && after !== '装') {
    readings[index] = 'zhe';
  } else if (character === '教' && reading === 'jiào' && !NOUN_AFTER_JIAO.has(after)
    && ('我你他她书'.includes(after) || TEACHER_BEFORE_JIAO.has(before))) {
    readings[index] = 'jiāo';
  } else if (character === '行' && reading === 'háng' && !HANG_BEFORE.has(before) && !'业列情'.includes(after)) {
    readings[index] = 'xíng';
  } else if (character === '的' && reading === 'dì' && (before !== '目' || characters[index - 2] === '夺')) {
    readings[index] = 'de';
  } else if (character === '相' && reading === 'xiàng' && '信得'.includes(after)) {
    readings[index] = 'xiāng';
  } else if (character === '数' && after === '数') {
    readings[index] = 'shǔ';
    readings[index + 1] = 'shù';
  }
}

// Words whose reading pinyin-pro gets wrong: [word, position of the character in it, reading].
const WORD_READINGS = [
  // 系 is xì (关系, 系统) except as "to tie" (系上领带).
  ...['系上', '系着', '系好', '系紧', '系鞋', '系领', '系围', '系安全带'].map((word) => [word, 0, 'jì']),
  ...['一沓', '两沓', '几沓'].map((word) => [word, 1, 'dá']),
  ...['撮小胡子', '撮胡子', '撮头发', '撮毛'].map((word) => [word, 0, 'zuǒ']),
  ...['勒着', '勒紧', '勒住', '勒死'].map((word) => [word, 0, 'lēi']),
  ...['盛饭', '盛汤', '盛得', '盛一碗'].map((word) => [word, 0, 'chéng']),
  ['帮你盛', 2, 'chéng'],
  ['被扒', 1, 'pá'],
  ['曝出', 0, 'bào'],
  ['拗断', 0, 'ǎo'],
  // Found by checking every sentence against pypinyin and by reviewing each multi-reading character.
  ['乍暖还寒', 2, 'huán'], ['有借有还', 3, 'huán'], ['往返还是', 2, 'hái'],
  ['没事干', 2, 'gàn'], ['干嘛', 0, 'gàn'], ['干嘛', 1, 'má'], ['干点力', 0, 'gàn'],
  ['倒不如', 0, 'dào'], ['倒进', 0, 'dào'], ['这倒是', 1, 'dào'],
  ['心脏', 1, 'zàng'], ['红彤彤', 1, 'tóng'], ['红彤彤', 2, 'tóng'], ['湖泊', 1, 'pō'], ['曲棍', 0, 'qū'],
  ['你闷了', 1, 'mèn'], ['咖喱', 0, 'gā'], ['剥夺', 0, 'bō'],
  ['理发', 1, 'fà'], ['发簪', 0, 'fà'], ['红发', 1, 'fà'], ['蒜头发芽', 1, 'tóu'], ['蒜头发芽', 2, 'fā'],
  ['呕吐', 1, 'tù'], ['撩起', 0, 'liāo'], ['拧干', 0, 'níng'], ['有空', 1, 'kòng'], ['闲空', 1, 'kòng'],
  ['不应', 1, 'yīng'], ['我应认', 1, 'yīng'], ['本应', 1, 'yīng'], ['答应', 0, 'dā'], ['答应', 1, 'ying'],
  ['行尸走肉', 0, 'xíng'], ['伴我同行', 3, 'xíng'], ['舍不得', 0, 'shě'], ['京都', 1, 'dū'],
  ['请帖', 1, 'tiě'], ['发帖', 1, 'tiě'], ['豁然', 0, 'huò'], ['豁达', 0, 'huò'], ['导游说', 2, 'shuō'],
  ['参加', 0, 'cān'], ['槟榔', 0, 'bīng'], ['滂沱', 0, 'pāng'], ['熨斗', 1, 'dǒu'], ['烟斗', 1, 'dǒu'],
  ['处理', 0, 'chǔ'], ['我处在', 1, 'chǔ'], ['的量很', 1, 'liàng'], ['货量', 1, 'liàng'], ['只供', 1, 'gōng'],
  ['区种植', 1, 'zhòng'], ['么种植', 1, 'zhòng'], ['大城市', 0, 'dà'], ['卷入', 0, 'juǎn'], ['卷得', 0, 'juǎn'], ['逮捕', 0, 'dài'],
  ['中暑', 0, 'zhòng'], ['射中', 1, 'zhòng'], ['钉钉子', 0, 'dìng'], ['有朝一日', 1, 'zhāo'], ['炸鱼', 0, 'zhá'],
  ['钻空子', 0, 'zuān'], ['钻空子', 1, 'kòng'], ['押韵喔', 2, 'o'], ['缝衣', 0, 'féng'], ['屏住', 0, 'bǐng'],
  ['少林', 0, 'shào'], ['之貉', 1, 'hé'], ['拾级', 0, 'shè'], ['一只是雄', 1, 'zhī'], ['两只是雌', 1, 'zhī'],
  ['镶嵌着', 2, 'zhe'], ['举着火', 1, 'zhe'], ['嘎的一声', 0, 'gā'], ['绰号', 1, 'hào'], ['雪茄', 1, 'jiā'],
  ['蒙骗', 0, 'mēng'], ['相机', 0, 'xiàng'], ['相框', 0, 'xiàng'], ['钥匙', 1, 'shi'],
  ['喇叭', 0, 'lǎ'], ['喇叭', 1, 'ba'], ['喝止', 0, 'hè'], ['啰嗦', 1, 'suo'], ['哆嗦', 1, 'suo'],
  ['意思', 1, 'si'], ['伯伯', 1, 'bo'], ['姥姥', 1, 'lao'], ['石头', 1, 'tou'], ['坏东西', 2, 'xi'],
  ['舒服', 1, 'fu'], ['喜欢', 1, 'huan'], ['暄和', 1, 'huo'], ['清楚地上', 2, 'dì'], ['劈柴', 0, 'pī'],
  ['得分', 0, 'dé'], ['值得', 1, 'dé'], ['不得不', 1, 'dé'], ['必须得', 2, 'děi'], ['后来得了', 2, 'dé'],
  ['就当你', 1, 'dàng'], ['拿他当', 2, 'dàng'], ['当掉', 0, 'dàng'], ['麻将', 1, 'jiàng'], ['将军', 0, 'jiāng'],
  ['包落在', 1, 'là'], ['不转', 1, 'zhuàn'], ['地球转', 2, 'zhuàn'], ['怎么转', 2, 'zhuàn'], ['一天假', 2, 'jià'],
  ['为生病', 0, 'wèi'], ['为难民', 0, 'wèi'], ['为难民', 1, 'nàn'], ['为他收', 0, 'wèi'], ['人为财死', 1, 'wèi'],
  ['一言为定', 2, 'wéi'], ['亲力亲为', 3, 'wéi'], ['转为', 1, 'wéi'], ['为玉帛', 0, 'wéi'], ['锄为剑', 1, 'wéi'],
  ['剑为锄', 1, 'wéi'], ['走为上', 1, 'wéi'], ['钟为一', 1, 'wéi'], ['断定为', 2, 'wéi'], ['自由为宪', 2, 'wéi'],
  ['宁为', 0, 'nìng'], ['宁为', 1, 'wéi'], ['不为狮', 1, 'wéi'], ['以你为', 2, 'wéi'], ['为食', 0, 'wéi'],
  ['鸟为食亡', 1, 'wèi'], ['任命为', 2, 'wéi'], ['眼见为凭', 2, 'wéi'], ['变为', 1, 'wéi'], ['以史为鉴', 2, 'wéi'],
  ['颇为', 1, 'wéi'], ['为荣', 0, 'wéi'], ['为豪', 0, 'wéi'],
];
// Words ending in 系 where it stays xì, even before 上 or 着 (关系上).
const XI_BEFORE = new Set('关联体统派星河阳银谱世直');
// Characters with one everyday reading that pinyin-pro misses.
const ALWAYS = new Map([['呗', 'bei'], ['嚣', 'xiāo'], ['咳', 'ké']]);

function fixWords(characters, readings) {
  const text = characters.join('');
  for (const [word, offset, reading] of WORD_READINGS) {
    for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
      const index = Array.from(text.slice(0, at)).length + offset;
      if (characters[index] === '系' && XI_BEFORE.has(characters[index - 1])) continue;
      readings[index] = reading;
    }
  }
  characters.forEach((character, index) => {
    if (ALWAYS.has(character)) readings[index] = ALWAYS.get(character);
    // 粘 is zhān as a verb (粘在一起), nián only for "sticky" (粘稠, 粘米).
    if (character === '粘') readings[index] = '稠性液土米糊糕'.includes(characters[index + 1] ?? '') ? 'nián' : 'zhān';
  });
}

const KEEP_ZI_BEFORE = new Set('孢电执与孺女长其原君男孟孔王生鱼棋虎分量粒质中光离天太才弟公赤学莲瓜松庄老荀墨韩母父游浪骄臣诸逆');
const ZI_STARTS_WORD = new Set('弹女孙宫夜时承曰');
const ER_WORD_BEFORE = new Set('女婴幼胎孤健宠托少育患男乳孩血生');
const ER_STARTS_WORD = new Set('子童女媳歌科时戏孙');
const PLANT_BEFORE = new Set('民里边上她他爸家还在要会去也都人');
const NUMBERS = new Set('零一二两三四五六七八九十百千');
const SPELL_BEFORE = new Set('一亲贴密恳迫确关急真深');

// Readings that depend on whether a character is a verb or part of a word, decided from its neighbours.
function fixWordClass(characters, readings, index) {
  const character = characters[index];
  const before = characters[index - 1] ?? '';
  const after = characters[index + 1] ?? '';
  const afterNext = characters[index + 2] ?? '';
  const reading = readings[index];
  if (character === '子' && reading === 'zǐ' && isHanzi(before) && !KEEP_ZI_BEFORE.has(before) && !ZI_STARTS_WORD.has(after)) {
    readings[index] = 'zi'; // noun suffix: 虫子, 橙子
  } else if (character === '儿' && (reading === 'ér' || reading === 'er') && isHanzi(before) && !ER_WORD_BEFORE.has(before) && !ER_STARTS_WORD.has(after)) {
    readings[index] = 'r'; // erhua: 哪儿 nǎr, 一点儿 yìdiǎnr
  } else if (character === '长' && reading === 'cháng' && ('出得满着痘有'.includes(after)
    || (after === '了' && isHanzi(afterNext) && !'很太多最变更不还又这那伸拉延'.includes(before))
    || (after === '不' && afterNext === '好'))) {
    readings[index] = 'zhǎng'; // to grow: 长出, 长得很高, 长了一个包
  } else if (character === '种' && reading === 'zhǒng' && ('着了过满'.includes(after)
    || (PLANT_BEFORE.has(before) && isHanzi(after) && !'子类族'.includes(after)))) {
    readings[index] = 'zhòng'; // to plant: 院子里种着花, 农民种青稞
  } else if (character === '铺' && reading === 'pù' && '着了满上在开设'.includes(after)) {
    readings[index] = 'pū'; // to spread: 路上铺满了叶子
  } else if (character === '切' && reading === 'qiè' && !SPELL_BEFORE.has(before) && !'勿忌记'.includes(after)) {
    readings[index] = 'qiē'; // to cut: 把肉切成片
  } else if (character === '背' && reading === 'bèi' && ((after === '着' && !'他她我你人们'.includes(afterNext)) || after === '包'
    || (after === '一' && characters.slice(index, index + 6).includes('包')))) {
    readings[index] = 'bēi'; // to carry on the back: 背着书包
  } else if (character === '夹' && reading === 'jiá' && after !== '袄') {
    readings[index] = 'jiā';
  } else if (character === '场' && reading === 'chǎng' && '雨梦火诉车交战疫官病寒滂灾风雪'.includes(after)) {
    readings[index] = 'cháng'; // a spell of something: 一场大雨, 一场病
  } else if (character === '场' && reading === 'chǎng' && after === '大' && '雨火雪风病战'.includes(afterNext)) {
    readings[index] = 'cháng';
  } else if (character === '得' && NUMBERS.has(before) && NUMBERS.has(after)) {
    readings[index] = 'dé'; // 八减四得四
  } else if (character === '哦' && isHanzi(before) && !isHanzi(after)) {
    readings[index] = 'o'; // sentence-final particle
  } else if (character === '啦') {
    readings[index] = 'la';
  }
}

const tone = (reading) => (/[āēīōūǖ]/.test(reading) ? 1 : /[áéíóúǘ]/.test(reading) ? 2 : /[ǎěǐǒǔǚ]/.test(reading) ? 3 : /[àèìòùǜ]/.test(reading) ? 4 : 0);

// 一 and 不 change tone before a fourth tone. pinyin-pro applies that from its own readings, so
// redo it after the fixes above (不应该: bù yīng gāi, not bú).
function fixSandhi(characters, readings) {
  characters.forEach((character, index) => {
    const next = readings[index + 1] ?? '';
    if (!tone(next)) return;
    if (character === '不' && (readings[index] === 'bù' || readings[index] === 'bú')) readings[index] = tone(next) === 4 ? 'bú' : 'bù';
    if (character === '一' && (readings[index] === 'yì' || readings[index] === 'yí')) readings[index] = tone(next) === 4 ? 'yí' : 'yì';
  });
}

export function fixParticles(characters, readings) {
  characters.forEach((character, index) => {
    fixWordClass(characters, readings, index);
    fixReading(characters, readings, index);
    if (character === '得' && readings[index] === 'dé' && index > 0 && !'获取赢'.includes(characters[index - 1]) && DEGREE_AFTER_DE.has(characters[index + 1])) readings[index] = 'de';
    if (character === '地' && readings[index] !== 'de') {
      const before = characters.slice(0, index).join('');
      // 慢慢地 (AA地) or 一个一个地 (ABAB地)
      const doubled = (index >= 2 && characters[index - 1] === characters[index - 2] && /\p{Script=Han}/u.test(characters[index - 1]))
        || (index >= 4 && before.endsWith(before.slice(-2).repeat(2)));
      if (doubled || ADVERBS_BEFORE_DE.some((adverb) => before.endsWith(adverb))) readings[index] = 'de';
    }
  });
  fixWords(characters, readings);
  fixSandhi(characters, readings);
}


/**
 * Returns [character, pinyin] pairs ('' for punctuation), or null if alignment fails.
 * A reading written after a character in braces overrides pinyin-pro: 还{huán}.
 */
export function annotate(source) {
  const overrides = new Map();
  let text = '';
  for (const match of source.matchAll(/(.)(\{([^}]+)\})?/gu)) {
    if (match[2]) overrides.set(Array.from(text).length, match[3]);
    text += match[1];
  }
  const readings = pinyin(text, { type: 'array', toneType: 'symbol', nonZh: 'consecutive' });
  const characters = Array.from(text);
  // pinyin-pro groups runs of non-Chinese text into one entry; expand them back to one per character.
  const perCharacter = [];
  let cursor = 0;
  for (const reading of readings) {
    if (isHanzi(characters[cursor])) { perCharacter.push(reading); cursor += 1; continue; }
    for (const _ of reading) { perCharacter.push(''); cursor += 1; }
  }
  if (perCharacter.length !== characters.length) return null;
  fixParticles(characters, perCharacter);
  for (const [position, reading] of overrides) perCharacter[position] = reading;
  return characters.map((character, position) => [character, isHanzi(character) ? perCharacter[position] : '']);
}
