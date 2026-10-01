"""Records every example sentence in public/sentences/*.json with an open-source Mandarin voice.

For each lesson it writes public/sentence-audio/<lesson>.json and a few MP3 "packs" (the
sentences of CHARS_PER_PACK characters each, back to back with a short pause between them). The
index maps each sentence's text to [pack, start, duration] in seconds, and the app plays just that
stretch. Packs keep the file count small: one file per sentence (9,000+) is more than local
`wrangler dev` can handle. Pack names include a hash of their contents, so browsers can cache them
forever; a pack is only re-recorded when its sentences or their pinyin change (the index keeps a
hash of each pack's sentences and pinyin under "readings").

The voice is Kokoro-82M v1.1-zh (Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh),
run with ONNX Runtime. The pinyin shown in the app is fed to it, so polyphones are read the same way
the app writes them (系上 jì), and Kokoro's frontend still applies tone sandhi.

Setup (model files live in the git-ignored .cache/tts):
  python3.11 -m venv .cache/tts/venv
  .cache/tts/venv/bin/pip install onnxruntime numpy "misaki[zh]"
  download onnx/model.onnx, tokenizer.json and voices/<voice>.bin from
  https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX into .cache/tts
Run:
  .cache/tts/venv/bin/python scripts/build-sentence-audio.py
  (for speed, run a few at once with --shard 0/3 --threads 3, --shard 1/3 --threads 3, ...,
  then once more with --clean to remove files nothing refers to any more)
Try voices: add --voice zf_001 --out <dir> --texts <sentence> ...
Needs ffmpeg for the MP3 encoding.
"""

import argparse
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np
import onnxruntime
from misaki import zh
from pypinyin.contrib.tone_convert import to_finals_tone3, to_initials

CACHE = '.cache/tts'
SAMPLE_RATE = 24000
HANZI = re.compile(r'[㐀-鿿]')
SPOKEN = {'C': ('西', 'xī'), 'T': ('踢', 'tī'), '·': ('', '')}


class PinyinFrontend:
    """Kokoro's Chinese frontend, reading each character with the pinyin the app shows."""

    def __init__(self):
        self.g2p = zh.ZHG2P(version='1.1')
        self.frontend = self.g2p.frontend
        self.original = self.frontend._get_initials_finals
        self.queue = None
        self.frontend._get_initials_finals = self._initials_finals

    def _initials_finals(self, word):
        if self.queue is None or len(self.queue) < len(word):
            self.queue = None  # out of step: fall back to Kokoro's own readings for this sentence
            return self.original(word)
        readings, self.queue = self.queue[:len(word)], self.queue[len(word):]
        initials, finals = [], []
        for reading in readings:
            initial = to_initials(reading, strict=True)
            final = to_finals_tone3(reading, strict=True, neutral_tone_with_five=True)
            # Kokoro tells zi/ci/si and zhi/chi/shi/ri apart from other i's.
            if re.fullmatch(r'i\d', final):
                if initial in ('z', 'c', 's'):
                    final = 'ii' + final[1:]
                elif initial in ('zh', 'ch', 'sh', 'r'):
                    final = 'iii' + final[1:]
            initials.append(initial)
            finals.append(final)
        return initials, finals

    def phonemes(self, text, pinyin):
        # Latin letters and the name dot aren't in the voice's alphabet: read C and T the way
        # Chinese speakers say them (维生素C, T恤) and drop the dot in 哈利·波特.
        parts = [SPOKEN.get(character, (character, reading)) for character, reading in zip(text, pinyin.split(' '))]
        text = ''.join(character for character, _ in parts)
        pinyin = ' '.join(reading for character, reading in parts if character)
        # Erhua 儿 is written r (哪儿 nǎ r); Kokoro's frontend expects er and joins it to the syllable before.
        readings = ['er' if reading == 'r' else reading
                    for character, reading in zip(text, pinyin.split(' ')) if HANZI.match(character)]
        self.queue = readings if len(readings) == len(HANZI.findall(text)) and all(readings) else None
        result, _ = self.g2p(text)
        return result


CHARS_PER_PACK = 10
LEAD = 0.05  # seconds of silence before the first sentence of a pack
GAP = 0.35  # seconds of silence between sentences, so playback never clips a neighbour


def lesson_sentences():
    """{lesson number: [[texts and pinyin of one pack], ...]} in study-plan order."""
    lessons = {}
    for path in glob.glob('public/sentences/*.json'):
        lesson = int(os.path.basename(path).split('.')[0])
        with open(path, encoding='utf-8') as file:
            characters = list(json.load(file).values())
        packs = []
        for first in range(0, len(characters), CHARS_PER_PACK):
            pack = {}
            for entries in characters[first:first + CHARS_PER_PACK]:
                for text, pinyin, *_ in entries:
                    pack.setdefault(text, pinyin)
            packs.append(list(pack.items()))
        lessons[lesson] = packs
    return dict(sorted(lessons.items()))


def trim(samples, threshold=0.01, pad=0.12):
    loud = np.flatnonzero(np.abs(samples) > threshold)
    if not len(loud):
        return samples
    start = max(0, loud[0] - int(pad * SAMPLE_RATE))
    end = min(len(samples), loud[-1] + int(pad * SAMPLE_RATE))
    return samples[start:end]


def normalize(samples):
    # Same peak level for every sentence, so none is much quieter than the others.
    return samples * (0.9 / max(float(np.abs(samples).max()), 1e-6))


def encode_mp3(samples):
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as folder:
        with wave.open(f'{folder}/in.wav', 'wb') as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(SAMPLE_RATE)
            out.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'{folder}/in.wav', '-ac', '1', '-ar', str(SAMPLE_RATE),
                        '-codec:a', 'libmp3lame', '-b:a', '32k', f'{folder}/out.mp3'], check=True)
        with open(f'{folder}/out.mp3', 'rb') as file:
            return file.read()


class Voice:
    def __init__(self, name, speed, threads):
        with open(f'{CACHE}/tokenizer.json', encoding='utf-8') as file:
            self.vocab = json.load(file)['model']['vocab']
        self.style = np.fromfile(f'{CACHE}/voices/{name}.bin', dtype=np.float32).reshape(-1, 1, 256)
        self.speed = speed
        options = onnxruntime.SessionOptions()
        options.log_severity_level = 3
        options.intra_op_num_threads = threads
        # The full-precision model: the fp16 one (meant for GPUs) sounds harsh and garbled on a CPU.
        self.session = onnxruntime.InferenceSession(f'{CACHE}/model.onnx', options, providers=['CPUExecutionProvider'])
        self.frontend = PinyinFrontend()
        self.unreadable = []

    def say(self, text, pinyin):
        phonemes = self.frontend.phonemes(text, pinyin)
        if '❓' in phonemes:
            self.unreadable.append(text)
        tokens = [self.vocab[p] for p in phonemes if p in self.vocab][:508]
        samples = self.session.run(None, {
            'input_ids': np.array([[0, *tokens, 0]], dtype=np.int64),
            'style': self.style[len(tokens)],
            'speed': np.array([self.speed], dtype=np.float32),
        })[0].reshape(-1)
        return normalize(trim(samples))


def record_pack(voice, sentences):
    """One MP3 with the sentences back to back, and each one's [start, duration] in seconds."""
    parts = [np.zeros(int(LEAD * SAMPLE_RATE), dtype=np.float32)]
    position = LEAD
    timings = []
    for text, pinyin in sentences:
        samples = voice.say(text, pinyin)
        timings.append((text, round(position, 3), round(len(samples) / SAMPLE_RATE, 3)))
        parts += [samples, np.zeros(int(GAP * SAMPLE_RATE), dtype=np.float32)]
        position += len(samples) / SAMPLE_RATE + GAP
    return encode_mp3(np.concatenate(parts)), timings


def readings_hash(sentences):
    """Changes whenever a sentence or its pinyin does, so a corrected reading gets re-recorded."""
    return hashlib.sha1('\n'.join(f'{text}\t{pinyin}' for text, pinyin in sentences).encode()).hexdigest()[:12]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--voice', default='zf_003')
    parser.add_argument('--speed', type=float, default=0.9)
    parser.add_argument('--out', default='public/sentence-audio')
    parser.add_argument('--texts', nargs='*', help='record these sentences as separate files (for trying voices)')
    parser.add_argument('--shard', default='0/1', help='K/N: record every Nth lesson starting at K, to run several at once')
    parser.add_argument('--threads', type=int, default=0, help='CPU threads per run (0 = all)')
    parser.add_argument('--clean', action='store_true', help='only remove files that no lesson index refers to')
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)

    if args.clean:
        used = {'CREDITS.txt'}
        for path in glob.glob(f'{args.out}/*.json'):
            with open(path, encoding='utf-8') as file:
                used |= {os.path.basename(path), *json.load(file)['packs']}
        stale = [name for name in os.listdir(args.out) if name not in used]
        for name in stale:
            os.remove(f'{args.out}/{name}')
        print(f'removed {len(stale)} files nothing refers to')
        return

    voice = Voice(args.voice, args.speed, args.threads)
    if args.texts:
        for number, text in enumerate(args.texts, 1):
            with open(f'{args.out}/{args.voice}-{number}.mp3', 'wb') as file:
                file.write(encode_mp3(voice.say(text, '')))
        return

    lessons = list(lesson_sentences().items())
    shard, shards = (int(part) for part in args.shard.split('/'))
    lessons = lessons[shard::shards]
    recorded = kept = 0
    for lesson, packs in lessons:
        index_path = f'{args.out}/{lesson}.json'
        try:
            with open(index_path, encoding='utf-8') as file:
                old = json.load(file)
        except (FileNotFoundError, ValueError):
            old = {'packs': [], 'clips': {}}
        index = {'packs': [], 'readings': [], 'clips': {}}
        for number, sentences in enumerate(packs):
            readings = readings_hash(sentences)
            # A sentence shared by two packs is listed in clips under the last one only, so compare
            # packs by their readings hash rather than by the texts in clips.
            unchanged = (number < len(old['packs']) and number < len(old.get('readings', []))
                         and old['readings'][number] == readings
                         and os.path.exists(f"{args.out}/{old['packs'][number]}"))
            index['readings'].append(readings)
            if unchanged:
                index['packs'].append(old['packs'][number])
                for text, _ in sentences:
                    index['clips'][text] = old['clips'][text]
                kept += 1
                continue
            data, timings = record_pack(voice, sentences)
            name = f'{lesson}-{number}-{hashlib.sha1(data).hexdigest()[:8]}.mp3'
            with open(f'{args.out}/{name}', 'wb') as file:
                file.write(data)
            index['packs'].append(name)
            for text, start, duration in timings:
                index['clips'][text] = [number, start, duration]
            recorded += 1
        with open(index_path, 'w', encoding='utf-8') as file:
            json.dump(index, file, ensure_ascii=False, separators=(',', ':'))
            file.write('\n')
        print(f'lesson {lesson}: {len(packs)} packs', flush=True)
    print(f'{recorded} packs recorded, {kept} unchanged', flush=True)
    if voice.unreadable:
        print(f'sounds the voice could not read in: {voice.unreadable}', file=sys.stderr)


if __name__ == '__main__':
    main()
