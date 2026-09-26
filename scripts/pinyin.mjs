// Pinyin for Chinese text in context, shared by the lesson and sentence builders.
import { pinyin } from 'pinyin-pro';

export const isHanzi = (character) => /\p{Script=Han}/u.test(character);

// pinyin-pro often reads the structural particles 得 and 地 as dé and dì. Fix the clear cases:
// verb + 得 + degree word (跑得很快), and a reduplicated or adverbial phrase + 地 (慢慢地走).
const DEGREE_AFTER_DE = new Set('很非常太真挺十分特别更越不好快慢清高多少早晚远近对错累饱难漂干认舒热冷还满像比又稍没整');
const ADVERBS_BEFORE_DE = ['一步一步', '认真', '高兴', '努力', '小心', '不停', '突然', '安静', '仔细', '轻轻', '大声', '热情', '开心', '耐心', '紧张', '慢慢', '好好', '静静', '渐渐', '默默', '悄悄', '紧紧', '深深', '偷偷', '快快', '远远', '早早', '急忙', '热烈', '清楚', '一点一点', '自然', '愉快', '顺利', '勇敢', '激动', '主动', '明显', '逐渐', '不断', '积极', '简单', '随便', '慢吞吞', '兴奋', '平静', '满意', '坚决', '亲切', '温柔', '疯狂', '勇猛', '激烈', '大胆', '飞快', '用力', '狠狠', '迅速', '紧急', '热心', '专心', '安全', '冷静', '礼貌', '友好', '犹豫', '耐心地', '仔仔细细', '高高兴兴', '认认真真', '开开心心', '敏捷', '仔细', '轻松', '热闹', '彻底', '深深', '自豪', '欢腾', '恭敬', '小心', '拐弯抹角', '惭愧', '蹦蹦跳跳', '狼狈', '懊悔', '恍惚'];
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

export function fixParticles(characters, readings) {
  characters.forEach((character, index) => {
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
