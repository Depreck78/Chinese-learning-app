import recordings from './recordings.json';

// Recordings by native female speakers, chosen per character by scripts/fetch-audio.mjs;
// see public/audio/CREDITS.txt. Anything else uses the device's best female Mandarin voice.
const files: Record<string, string> = { ...recordings.characters, ...recordings.words };

export function recordingUrl(text: string) {
  return files[text] ? `/audio/${files[text]}` : null;
}

export function allRecordingUrls() {
  return [...new Set(Object.values(files))].map((file) => `/audio/${file}`);
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();

// Web Audio plays reliably from the offline cache, unlike <audio> on iOS. The context
// must be created and resumed synchronously inside the tap that asked for sound.
function audioContext() {
  if (!context) {
    // Without this, iPhones stay silent when the ring/silent switch is on.
    const session = (navigator as AudioSessionNavigator).audioSession;
    if (session) session.type = 'playback';
    const Context = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    context = new Context();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function loadBuffer(ctx: AudioContext, url: string) {
  let buffer = buffers.get(url);
  if (!buffer) {
    buffer = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Recording request failed with ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    buffer.catch(() => buffers.delete(url));
    buffers.set(url, buffer);
  }
  return buffer;
}

// Recordings begin with ~0.3s of silence; skip it so sound follows the tap immediately.
function speechStart(buffer: AudioBuffer) {
  const samples = buffer.getChannelData(0);
  // Loudness per 10ms window, so a stray decoder click at the very start is ignored.
  const size = Math.round(buffer.sampleRate / 100);
  const loudness: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let sum = 0;
    for (let index = start; index < start + size; index += 1) sum += samples[index] * samples[index];
    loudness.push(Math.sqrt(sum / size));
  }
  const threshold = Math.max(...loudness) * 0.1;
  const first = loudness.findIndex((value) => value > threshold);
  return Math.max(0, first * 0.01 - 0.06);
}

const FEMALE_VOICES = /tingting|ting-ting|xiaoxiao|xiaoyi|xiaohan|xiaomo|xiaoqiu|xiaorui|xiaoshuang|xiaoxuan|xiaoyan|xiaomeng|yaoyao|huihui|lili|shanshan|yu-shu|yushu|sinji|female|女/i;
const MALE_VOICES = /yunxi|yunyang|yunjian|yunye|yunfeng|yunhao|yunze|kangkang|li-mu|limu|han\b|male|男/i;
const NATURAL_VOICES = /enhanced|premium|natural|neural|online/i;
// Apple's novelty voices sound robotic.
const ROBOTIC_VOICES = /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;

function bestMandarinVoice() {
  const voices = speechSynthesis.getVoices().filter((voice) => /^(zh|cmn)[-_](cn|hans)/i.test(voice.lang));
  const score = (voice: SpeechSynthesisVoice) =>
    (FEMALE_VOICES.test(voice.name) ? 4 : 0) - (MALE_VOICES.test(voice.name) && !/female/i.test(voice.name) ? 4 : 0)
    + (NATURAL_VOICES.test(voice.name) ? 2 : 0)
    - (ROBOTIC_VOICES.test(voice.name) ? 6 : 0)
    // Online voices sound better but stay silent without a connection.
    + (voice.localService || navigator.onLine ? 1 : -10);
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
}

function speakWithDeviceVoice(text: string) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.voice = bestMandarinVoice();
  utterance.rate = 0.85;
  speechSynthesis.speak(utterance);
}

export function pronounce(text: string) {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  playing?.stop();
  playing = null;

  const url = recordingUrl(text);
  if (!url) return speakWithDeviceVoice(text);

  const ctx = audioContext();
  loadBuffer(ctx, url)
    .then((buffer) => {
      playing?.stop();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0, speechStart(buffer));
      playing = source;
    })
    .catch(() => speakWithDeviceVoice(text));
}

// Sentence recordings come in packs of many sentences (scripts/build-sentence-audio.py). A decoded
// pack is large, so only the last two stay in memory.
const packs = new Map<string, Promise<AudioBuffer>>();

function loadPack(ctx: AudioContext, url: string) {
  let pack = packs.get(url);
  if (!pack) {
    pack = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Recording request failed with ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    pack.catch(() => packs.delete(url));
    packs.set(url, pack);
    for (const old of [...packs.keys()].slice(0, -2)) packs.delete(old);
  }
  return pack;
}

/** Plays one sentence from a pack of recordings, or reads `text` with the device voice. */
export function pronounceSentence(text: string, clip: { url: string; start: number; duration: number } | null) {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  playing?.stop();
  playing = null;
  if (!clip) return speakWithDeviceVoice(text);

  const ctx = audioContext();
  loadPack(ctx, clip.url)
    .then((pack) => {
      playing?.stop();
      const source = ctx.createBufferSource();
      source.buffer = pack;
      source.connect(ctx.destination);
      source.start(0, clip.start, clip.duration);
      playing = source;
    })
    .catch(() => speakWithDeviceVoice(text));
}
