// Chinese-language shows and films to learn from. Trailer IDs and "where to watch" links were checked
// in September 2026; streaming catalogues change and differ by country, so each title also links to JustWatch.

export type FunKind = 'anime' | 'drama' | 'movie' | 'kids';
export type FunLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type WatchLink = { name: string; url: string; note?: string };

export type Recommendation = {
  id: string;
  title: string;
  chinese: string;
  pinyin: string;
  year: string;
  kind: FunKind;
  level: FunLevel;
  /** What it is about, in a sentence or two. */
  synopsis: string;
  /** Why it helps a learner. */
  why: string;
  /** YouTube video shown as the trailer. */
  trailer: string;
  trailerLabel?: string;
  free: WatchLink[];
  paid: WatchLink[];
};

export const FUN_KINDS: { id: FunKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'anime', label: 'Anime' },
  { id: 'drama', label: 'TV dramas' },
  { id: 'movie', label: 'Movies' },
  { id: 'kids', label: 'Kids' },
];

export const justWatchUrl = (title: string) => `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;

export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'peppa-pig',
    title: 'Peppa Pig (Mandarin)',
    chinese: '小猪佩奇',
    pinyin: 'Xiǎo Zhū Pèiqí',
    year: 'Ongoing',
    kind: 'kids',
    level: 'Beginner',
    synopsis: 'Peppa, her little brother George and their family and friends go about everyday life: school, the playground, shopping and jumping in muddy puddles.',
    why: 'Five-minute episodes with slow, clear Mandarin and the same everyday words again and again. The easiest place to start listening.',
    trailer: 'IEQQs7fB1Ms',
    trailerLabel: 'Sample episodes',
    free: [{ name: 'YouTube: 小猪佩奇中文官方 (official channel)', url: 'https://www.youtube.com/@PeppaPigChineseOfficial' }],
    paid: [],
  },
  {
    id: 'a-love-so-beautiful',
    title: 'A Love So Beautiful',
    chinese: '致我们单纯的小美好',
    pinyin: 'Zhì Wǒmen Dānchún de Xiǎo Měihǎo',
    year: '2017',
    kind: 'drama',
    level: 'Beginner',
    synopsis: 'Cheerful Chen Xiaoxi has loved her aloof neighbour Jiang Chen since childhood. A gentle high-school romance that follows them from school into adult life.',
    why: 'Everyday school and family conversations, short scenes and simple modern Mandarin.',
    trailer: 'ReRLQ9GN2iQ',
    trailerLabel: 'Episode 1',
    free: [
      { name: 'Rakuten Viki', url: 'https://www.viki.com/tv/35692c-a-love-so-beautiful', note: 'free with ads' },
      { name: 'YouTube: Viki official playlist', url: 'https://www.youtube.com/playlist?list=PLlH-Fr3fGKJBA1I6NrmsmV4wqIqMULluX' },
    ],
    paid: [{ name: 'Netflix', url: 'https://www.netflix.com/title/80239640' }],
  },
  {
    id: 'hidden-love',
    title: 'Hidden Love',
    chinese: '偷偷藏不住',
    pinyin: 'Tōutōu Cáng Bù Zhù',
    year: '2023',
    kind: 'drama',
    level: 'Intermediate',
    synopsis: 'Sang Zhi has had a secret crush on her brother’s friend Duan Jiaxu since she was a teenager. Years later at university in the same city, the crush turns into something more.',
    why: 'Natural, present-day speech between friends and family, with lots of texting, campus and city vocabulary.',
    trailer: 'tiwcMjH1dRw',
    free: [{ name: 'YouTube: Youku official channel', url: 'https://www.youtube.com/playlist?list=PLIPiKkS-FpK9FBPbX-0X-MDicBEQvjfas', note: 'some episodes' }],
    paid: [
      { name: 'Youku', url: 'https://www.youku.tv/v/v_show/id_XNTk3NTM3NTU4OA==.html' },
      { name: 'Netflix', url: 'https://www.netflix.com/search?q=Hidden%20Love' },
    ],
  },
  {
    id: 'the-untamed',
    title: 'The Untamed',
    chinese: '陈情令',
    pinyin: 'Chén Qíng Lìng',
    year: '2019',
    kind: 'drama',
    level: 'Advanced',
    synopsis: 'Two young cultivators from rival clans, the carefree Wei Wuxian and the upright Lan Wangji, solve mysteries together and are pulled into a war that ends in tragedy.',
    why: 'A fantasy epic with formal, old-fashioned speech. Great for listening once you know the basics; lean on the subtitles.',
    trailer: '2ldvydu34Is',
    free: [
      { name: 'Rakuten Viki', url: 'https://www.viki.com/tv/36657c-the-untamed', note: 'free with ads' },
      { name: 'YouTube: Viki official playlist', url: 'https://www.youtube.com/playlist?list=PLlH-Fr3fGKJBJ4WalTAqjFyvIbmSi_8AI' },
    ],
    paid: [
      { name: 'Netflix', url: 'https://www.netflix.com/title/81200228' },
      { name: 'WeTV', url: 'https://wetv.vip/en/play/gnwjazjgmg997xg-The%20Untamed/d0031smeq8n-EP01:%20The%20Untamed' },
    ],
  },
  {
    id: 'nirvana-in-fire',
    title: 'Nirvana in Fire',
    chinese: '琅琊榜',
    pinyin: 'Láng Yá Bǎng',
    year: '2015',
    kind: 'drama',
    level: 'Advanced',
    synopsis: 'Twelve years after his family is wiped out by a false accusation, a gifted strategist returns to the capital under a new name to clear their names and change who rules.',
    why: 'Widely called one of the best Chinese dramas ever made. Its court language is hard, so it suits advanced learners watching with subtitles.',
    trailer: 'Jdmva52nS9Y',
    free: [
      { name: 'YouTube: China Zone channel (Eng sub)', url: 'https://www.youtube.com/playlist?list=PLtt_YYUGi1gXRt2XVJZrHDBkZECcfmuAJ' },
      { name: 'Plex', url: 'https://watch.plex.tv/show/nirvana-in-fire', note: 'free with ads' },
    ],
    paid: [
      { name: 'Prime Video', url: 'https://www.amazon.com/Nirvana-Fire-%E7%90%85%E7%90%8A%E6%A6%9C-Season-1/dp/B0786Y7JF6' },
      { name: 'Apple TV', url: 'https://tv.apple.com/us/show/nirvana-in-fire/umc.cmc.4bwvcoo8ef8euv8ki6dg0nyki' },
      { name: 'WeTV', url: 'https://wetv.vip/en/play/r4bwi9ou088jxur-Nirvana_in_Fire' },
    ],
  },
  {
    id: 'scissor-seven',
    title: 'Scissor Seven',
    chinese: '刺客伍六七',
    pinyin: 'Cìkè Wǔ Liù Qī',
    year: '2018',
    kind: 'anime',
    level: 'Intermediate',
    synopsis: 'Seven, a clumsy hairdresser on a small island who has lost his memory, takes jobs as a hired assassin to make money, with a talking chicken as his partner.',
    why: 'Short, very funny episodes with fast, casual speech. Watch in Chinese with English subtitles.',
    trailer: '5X8VwQqjTtQ',
    free: [],
    paid: [{ name: 'Netflix', url: 'https://www.netflix.com/title/81156880' }],
  },
  {
    id: 'link-click',
    title: 'Link Click',
    chinese: '时光代理人',
    pinyin: 'Shíguāng Dàilǐrén',
    year: '2021',
    kind: 'anime',
    level: 'Intermediate',
    synopsis: 'Two friends run a photo studio with a secret: they can jump into a photo and live through the moment it was taken, to help clients with regrets. Every job risks changing the past.',
    why: 'Modern everyday Mandarin in a gripping time-travel mystery that makes you want the next episode.',
    trailer: 'Fd6i9zOFFoA',
    free: [],
    paid: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GP5HJ8E81/link-click' }],
  },
  {
    id: 'heaven-officials-blessing',
    title: 'Heaven Official’s Blessing',
    chinese: '天官赐福',
    pinyin: 'Tiān Guān Cì Fú',
    year: '2020',
    kind: 'anime',
    level: 'Advanced',
    synopsis: 'Xie Lian, a prince who became a god and fell from heaven twice, ascends for a third time and investigates ghostly cases with the mysterious Hua Cheng.',
    why: 'Beautiful animation with classical, poetic language. A good stretch for advanced listening.',
    trailer: 'aRhaKwvM360',
    free: [{ name: 'Bilibili', url: 'https://www.bilibili.tv/en/media/35336', note: 'free with ads, some regions' }],
    paid: [{ name: 'Netflix', url: 'https://www.netflix.com/title/81364887' }],
  },
  {
    id: 'ne-zha',
    title: 'Ne Zha',
    chinese: '哪吒之魔童降世',
    pinyin: 'Nézhā zhī Mótóng Jiàngshì',
    year: '2019',
    kind: 'movie',
    level: 'Intermediate',
    synopsis: 'Born from a demon pearl instead of a heavenly one, the boy Ne Zha is feared by everyone and fated to die. He decides to fight his destiny in this animated take on a classic myth.',
    why: 'An animated film with clear voices and lots of humour, plus the Chinese myths every learner meets sooner or later.',
    trailer: 'F37qqQTeIP4',
    free: [{ name: 'Tubi', url: 'https://tubitv.com/movies/703991/ne-zha', note: 'free with ads' }],
    paid: [
      { name: 'Netflix', url: 'https://www.netflix.com/title/81191389' },
      { name: 'Prime Video', url: 'https://www.amazon.com/Ne-Zha-Jiaozi/dp/B0G33CBJP1' },
    ],
  },
  {
    id: 'hi-mom',
    title: 'Hi, Mom',
    chinese: '你好，李焕英',
    pinyin: 'Nǐ Hǎo, Lǐ Huànyīng',
    year: '2021',
    kind: 'movie',
    level: 'Intermediate',
    synopsis: 'After her mother is badly hurt in an accident, Jia Xiaoling is sent back to 1981, where she befriends her young mother and tries to give her a happier life.',
    why: 'A warm comedy about family, with everyday conversation and lots of northern Chinese humour.',
    trailer: 'GjrtxkuFBtk',
    free: [{ name: 'Plex', url: 'https://watch.plex.tv/movie/hi-mom-2021', note: 'free with ads' }],
    paid: [
      { name: 'Prime Video', url: 'https://www.primevideo.com/detail/Hi-Mom/0KZW6KM9KUE7YWTJJR80DY6TSS' },
      { name: 'Google Play', url: 'https://play.google.com/store/movies/details/Hi_Mom?id=5BF401FB22B5CE0CMV' },
    ],
  },
  {
    id: 'the-wandering-earth',
    title: 'The Wandering Earth',
    chinese: '流浪地球',
    pinyin: 'Liúlàng Dìqiú',
    year: '2019',
    kind: 'movie',
    level: 'Intermediate',
    synopsis: 'The Sun is dying, so humanity fits the Earth with giant engines and steers it out of the solar system. When the planet drifts towards Jupiter, a few people must save it.',
    why: 'A big-budget sci-fi blockbuster based on a story by Liu Cixin, with plenty of short, clear dialogue in the action scenes.',
    trailer: '0TDII5IkI3Y',
    free: [],
    paid: [{ name: 'Netflix', url: 'https://www.netflix.com/title/81067760' }],
  },
  {
    id: 'crouching-tiger',
    title: 'Crouching Tiger, Hidden Dragon',
    chinese: '卧虎藏龙',
    pinyin: 'Wò Hǔ Cáng Lóng',
    year: '2000',
    kind: 'movie',
    level: 'Advanced',
    synopsis: 'A legendary sword is stolen, and a veteran warrior and his old friend chase the thief into a world of secret loves and martial-arts duels in Qing dynasty China.',
    why: 'The Oscar-winning classic of wuxia film. The dialogue is formal and the actors’ accents vary, so watch it with subtitles.',
    trailer: 'GRQ9CGnEmWQ',
    free: [{ name: 'The Roku Channel', url: 'https://therokuchannel.roku.com/details/681a475fd202dba8826885a265ab8088/crouching-tiger-hidden-dragon', note: 'free with ads' }],
    paid: [
      { name: 'Netflix', url: 'https://www.netflix.com/title/60002907' },
      { name: 'Apple TV', url: 'https://tv.apple.com/us/movie/crouching-tiger-hidden-dragon/umc.cmc.1qyopok7zvm57lvbxa2oz4ibq' },
    ],
  },
];
