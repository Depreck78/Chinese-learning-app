"""Builds app/reading-choices.json: three options for every gap in the daily reading exercise.

Each gap (see the blanks in app/lessons.json) gets its answer plus two wrong options that clearly
cannot fit, so there is exactly one right choice:
  - an option never forms a real word with the characters around the gap (jieba's dictionary),
  - it is never the same kind of word as the answer (pronoun for pronoun, number for number,
    particle for particle, ...), judged from the sentence and a list of function characters,
  - it never sounds like the answer.
Options come from the lesson's own characters where possible, then from earlier lessons.
scripts/reading-choices-review.json lists options a review found could still fit; they are never
used for that gap.

Run after changing lessons (uses jieba from the .cache/tts environment, see build-sentence-audio.py):
  .cache/tts/venv/bin/python scripts/build-reading-choices.py
"""

import hashlib
import json
import re

import jieba
import jieba.posseg as posseg
from pypinyin import lazy_pinyin

jieba.setLogLevel(60)

# Characters that are easy to swap for one another; an option never shares a group with the answer.
GROUPS = {
    'pronoun': '我你他她它们您咱自己谁这那哪每某其各',
    'number': '零一二两三四五六七八九十百千万亿几半双第数多少',
    'measure': '个本只条张件位口次块些把辆双片杯碗岁层门节首封座棵所台支匹头朵间家部种样场句本',
    'particle': '的地得了着过吗呢吧啊呀嘛么哦喔啦',
    'negation': '不没别未无非莫勿',
    'degree': '很太真最更非常特十好挺极越还比较稍',
    'time': '年月日天时分秒早晚今明昨前后刚才正在已曾将要再又',
    'place': '上下左右里外前后中内东南西北旁边间',
    'modal': '会能要想可该得必须应肯敢愿',
    'preposition': '在从向往对给跟和同与把被让叫比离到自由为替用按照',
    'conjunction': '和跟与及或但而且虽然因所以如果就才也都还又',
    'question': '什么谁哪几怎么吗呢为何',
    'color': '红黄蓝绿白黑紫灰粉色',
    'family': '爸妈哥弟姐妹爷奶儿女子孙叔姨舅姑伯',
    'body': '头手脚眼耳口鼻嘴身心脸牙腿',
}
POS_CLASS = {'r': 'pronoun', 'm': 'number', 'q': 'measure', 'u': 'particle', 'y': 'particle', 'd': 'adverb',
             'p': 'preposition', 'c': 'conjunction', 'n': 'noun', 'v': 'verb', 'a': 'adjective', 't': 'time', 'f': 'place'}

HANZI = re.compile(r'[㐀-鿿]')


def load_words():
    words = set()
    with open(jieba.get_dict_file().name, encoding='utf-8') as file:
        for line in file:
            words.add(line.split(' ', 1)[0])
    return words


def groups_of(character):
    return {name for name, members in GROUPS.items() if character in members}


def main():
    with open('app/lessons.json', encoding='utf-8') as file:
        lessons = json.load(file)
    with open('app/characters.ts', encoding='utf-8') as file:
        readings = dict(re.findall(r'"character":"([^"]+)","pinyin":"([^"]+)"', file.read()))
    try:
        with open('scripts/reading-choices-review.json', encoding='utf-8') as file:
            review = json.load(file)
    except FileNotFoundError:
        review = {}
    words = load_words()
    toneless = lambda character: lazy_pinyin(character)[0]

    choices = {}
    short = []
    earlier = []
    for lesson in lessons:
        own = list(lesson['characters'])
        for paragraph_index, (text, _, positions) in enumerate(lesson['paragraphs']):
            # The word around each character, and its part of speech, from the whole sentence.
            spans = []
            start = 0
            for word, flag in posseg.lcut(text):
                spans.append((start, start + len(word), word, flag))
                start += len(word)
            for position in positions:
                key = f"{lesson['number']}-{paragraph_index}-{position}"
                answer = text[position]
                word_start, word_end, word, flag = next(span for span in spans if span[0] <= position < span[1])
                answer_classes = groups_of(answer) | ({POS_CLASS[flag[0]]} if len(word) == 1 and flag[:1] in POS_CLASS else set())
                before = text[position - 1] if position and HANZI.match(text[position - 1]) else ''
                after = text[position + 1] if position + 1 < len(text) and HANZI.match(text[position + 1]) else ''

                def fits(option):
                    if option == answer or not HANZI.match(option) or option in review.get(key, []):
                        return True
                    if toneless(option) == toneless(answer):
                        return True
                    if groups_of(option) & answer_classes:
                        return True
                    # Would it make a real word with what is around the gap?
                    if len(word) > 1 and (word[:position - word_start] + option + word[position - word_start + 1:]) in words:
                        return True
                    if (before and before + option in words) or (after and option + after in words):
                        return True
                    if len(word) == 1:
                        tags = {tag for _, tag in posseg.lcut(option)}
                        if any(POS_CLASS.get(tag[:1]) in answer_classes for tag in tags):
                            return True
                    return False

                # Same-lesson characters first, in a fixed but gap-specific order.
                order = lambda character: hashlib.sha1(f'{key}{character}'.encode()).hexdigest()
                pool = sorted(set(own) - {answer}, key=order) + sorted(set(earlier) - set(own), key=order)
                wrong = []
                for option in pool:
                    if not fits(option) and not any(toneless(option) == toneless(other) for other in wrong):
                        wrong.append(option)
                    if len(wrong) == 2:
                        break
                if len(wrong) < 2:
                    short.append(key)
                options = sorted([answer, *wrong], key=order)
                choices[key] = [[option, readings.get(option, lazy_pinyin(option)[0])] for option in options]
        earlier += own

    with open('app/reading-choices.json', 'w', encoding='utf-8') as file:
        json.dump(choices, file, ensure_ascii=False, separators=(',', ':'))
        file.write('\n')
    print(f'{len(choices)} gaps written to app/reading-choices.json')
    if short:
        print(f'{len(short)} gaps have fewer than 2 wrong options: {short}')


if __name__ == '__main__':
    main()
