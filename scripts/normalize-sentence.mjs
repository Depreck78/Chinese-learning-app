// Tidies the punctuation of an example sentence: full-width marks, Chinese quotes, no stray
// spaces, and an end mark (？ or ！ when the English translation ends with one, otherwise 。).
const CLOSING = /[。？！…”’）]$/u;

export function normalizeSentence(text, english = '') {
  let open = false;
  let result = text.trim()
    .replace(/\?/g, '？').replace(/!/g, '！').replace(/,/g, '，').replace(/:/g, '：').replace(/;/g, '；')
    .replace(/⋯|\.{3}/g, '…').replace(/\./g, '。')
    .replace(/「/g, '“').replace(/」/g, '”').replace(/『/g, '‘').replace(/』/g, '’')
    .replace(/"/g, () => {
      open = !open;
      return open ? '“' : '”';
    })
    // Book-title marks used as speech marks after a colon: 说：《不要怕》
    .replace(/：《([^》]*)》/gu, '：“$1”')
    .replace(/\s*([，。？！：；、“”‘’（）《》…])\s*/gu, '$1');
  // A closing quote typed as an opening one at the very end.
  if (result.endsWith('“') && (result.match(/“/g) ?? []).length > (result.match(/”/g) ?? []).length) result = `${result.slice(0, -1)}”`;
  result = result.replace(/[，；：、]$/u, '');
  if (!CLOSING.test(result)) {
    const end = english.trim().at(-1);
    result += end === '?' ? '？' : end === '!' ? '！' : '。';
  }
  return result;
}
