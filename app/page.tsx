'use client';

import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, ClipboardCheck, Clock3, Eraser, Gauge, PencilLine, Play, RotateCcw, Search, Sparkles, Star, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Empty } from '@/components/ui/empty';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CHARACTERS, type CharacterEntry } from './characters';

type Point = { x: number; y: number };
type Stroke = Point[];
type StrokeOrderData = {
  strokes: string[];
  medians: [number, number][][];
};
type DictionaryFilter = 'all' | 'numbers' | 'people' | 'body' | 'nature' | 'food' | 'time' | 'places';

const DICTIONARY_FILTERS: { id: DictionaryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'people', label: 'People' },
  { id: 'body', label: 'Body' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'time', label: 'Time' },
  { id: 'places', label: 'Places' },
];

const FILTER_PATTERNS: Record<Exclude<DictionaryFilter, 'all'>, RegExp> = {
  numbers: /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|number|numeral|ordinal|half|double|first|second|third)\b/i,
  people: /\b(person|people|man|woman|male|female|boy|girl|child|baby|father|mother|parent|brother|sister|son|daughter|teacher|student|friend|husband|wife|emperor|king|officer|worker)\b/i,
  body: /\b(body|head|face|eye|ear|nose|mouth|tooth|teeth|tongue|hand|arm|finger|leg|foot|feet|heart|blood|skin|hair|bone|stomach|back)\b/i,
  nature: /\b(water|fire|mountain|river|lake|sea|ocean|tree|wood|forest|flower|grass|sun|moon|star|sky|cloud|rain|snow|wind|earth|stone|bird|animal|dog|cat|horse|fish|insect)\b/i,
  food: /\b(food|eat|drink|rice|tea|fruit|vegetable|meat|fish|bread|noodle|dumpling|sugar|salt|meal|cook|wine|beer|milk|egg)\b/i,
  time: /\b(time|day|week|month|year|hour|minute|morning|afternoon|evening|night|today|tomorrow|yesterday|spring|summer|autumn|winter|season)\b/i,
  places: /\b(place|country|city|town|village|home|house|room|school|street|road|store|shop|market|hospital|station|airport|north|south|east|west|inside|outside|front|back)\b/i,
};

const NUMBER_CHARACTERS = new Set('零〇一二两三四五六七八九十百千万亿兆半双第数');

function matchesFilter(entry: CharacterEntry, filter: DictionaryFilter) {
  if (filter === 'all') return true;
  if (filter === 'numbers' && NUMBER_CHARACTERS.has(entry.character)) return true;
  return FILTER_PATTERNS[filter].test(entry.definition);
}

const examples: Record<string, { word: string; pinyin: string; meaning: string }[]> = {
  你: [{ word: '你好', pinyin: 'nǐ hǎo', meaning: 'hello' }, { word: '你们', pinyin: 'nǐ men', meaning: 'you (plural)' }],
  好: [{ word: '你好', pinyin: 'nǐ hǎo', meaning: 'hello' }, { word: '很好', pinyin: 'hěn hǎo', meaning: 'very good' }],
  我: [{ word: '我们', pinyin: 'wǒ men', meaning: 'we; us' }, { word: '我的', pinyin: 'wǒ de', meaning: 'my; mine' }],
  人: [{ word: '中国人', pinyin: 'zhōng guó rén', meaning: 'Chinese person' }, { word: '家人', pinyin: 'jiā rén', meaning: 'family' }],
  中: [{ word: '中国', pinyin: 'zhōng guó', meaning: 'China' }, { word: '中文', pinyin: 'zhōng wén', meaning: 'Chinese language' }],
  学: [{ word: '学习', pinyin: 'xué xí', meaning: 'to study' }, { word: '学生', pinyin: 'xué sheng', meaning: 'student' }],
};

const tones = ['neutral', 'high & level', 'rising', 'dip then rise', 'falling'];
function toneNumber(pinyin: string) {
  if (/[āēīōūǖ]/.test(pinyin)) return 1;
  if (/[áéíóúǘ]/.test(pinyin)) return 2;
  if (/[ǎěǐǒǔǚ]/.test(pinyin)) return 3;
  if (/[àèìòùǜ]/.test(pinyin)) return 4;
  return 0;
}

function WritingPad({ character }: { character: string }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke | null>(null);
  const [guide, setGuide] = useState(true);
  const [strokeOrder, setStrokeOrder] = useState<StrokeOrderData | null>(null);
  const [strokeOrderError, setStrokeOrderError] = useState(false);
  const [demoRun, setDemoRun] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const frame = useRef<SVGSVGElement>(null);
  const demoTimer = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(character)}.json`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Stroke data request failed with ${response.status}`);
        return response.json();
      })
      .then((data: unknown) => {
        if (!data || typeof data !== 'object') throw new Error('Stroke data is not an object');
        const strokeData = data as Partial<StrokeOrderData>;
        if (!Array.isArray(strokeData.strokes) || !Array.isArray(strokeData.medians)) {
          throw new Error('Stroke data is missing paths or medians');
        }
        setStrokeOrder({ strokes: strokeData.strokes, medians: strokeData.medians });
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) setStrokeOrderError(true);
      });

    return () => {
      controller.abort();
      if (demoTimer.current !== null) window.clearTimeout(demoTimer.current);
    };
  }, [character]);

  function point(event: React.PointerEvent<SVGSVGElement>) {
    const rect = frame.current!.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 };
  }
  function start(event: React.PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId); setActive([point(event)]);
  }
  function move(event: React.PointerEvent<SVGSVGElement>) { if (active) setActive([...active, point(event)]); }
  function end() { if (active?.length) setStrokes([...strokes, active]); setActive(null); }
  const path = (stroke: Stroke) => stroke.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const medianPoints = (median: [number, number][]) => median
    .map(([x, y]) => `${(x * 0.09765625).toFixed(2)},${(87.890625 - y * 0.09765625).toFixed(2)}`)
    .join(' ');

  function playStrokeOrder() {
    if (!strokeOrder) return;
    if (demoTimer.current !== null) window.clearTimeout(demoTimer.current);
    setGuide(true);
    setDemoRun((run) => run + 1);
    setDemoPlaying(true);
    demoTimer.current = window.setTimeout(() => {
      setDemoPlaying(false);
      demoTimer.current = null;
    }, Math.max(strokeOrder.strokes.length * 620, 900));
  }

  const strokeProgress = strokeOrder
    ? `${strokes.length} of ${strokeOrder.strokes.length} strokes drawn`
    : strokeOrderError
      ? `${strokes.length} strokes drawn`
      : 'Loading stroke order…';

  return (
    <section className="writing-panel" aria-label={`Writing practice for ${character}`}>
      <div className="panel-heading"><div><span className="label">WRITING DESK</span><h2>Trace the character</h2></div><span className="stroke-count">{strokeProgress}</span></div>
      <div className="practice-stage">
        <svg ref={frame} className="writing-pad" viewBox="0 0 100 100" aria-label={`Canvas for practicing ${character}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <title>{`Writing practice for ${character}`}</title>
          <line className="practice-grid" x1="50" y1="0" x2="50" y2="100" /><line className="practice-grid" x1="0" y1="50" x2="100" y2="50" />
          <line className="practice-grid diagonal" x1="0" y1="0" x2="100" y2="100" /><line className="practice-grid diagonal" x1="100" y1="0" x2="0" y2="100" />
          {guide && strokeOrder ? (
            <g className="stroke-order-guide" aria-hidden="true">
              <g className="stroke-order-outlines" transform="translate(0 87.890625) scale(.09765625 -.09765625)">
                {strokeOrder.strokes.map((stroke, index) => <path key={index} d={stroke} />)}
              </g>
              <g key={demoRun} className={`stroke-order-medians ${demoRun ? 'is-animating' : ''}`}>
                {strokeOrder.medians.map((median, index) => {
                  const [startX, startY] = median[0] ?? [0, 0];
                  const labelX = startX * 0.09765625;
                  const labelY = 87.890625 - startY * 0.09765625;
                  return (
                    <g key={index}>
                      <polyline points={medianPoints(median)} pathLength="1" style={{ animationDelay: `${index * 0.62}s` }} />
                      <circle cx={labelX} cy={labelY} r={index > 8 ? 3.15 : 2.75} />
                      <text x={labelX} y={labelY + 0.2} textAnchor="middle">{index + 1}</text>
                    </g>
                  );
                })}
              </g>
            </g>
          ) : guide ? (
            <text className="character-guide" x="50" y="69" textAnchor="middle">{character}</text>
          ) : null}
          {strokes.map((stroke, index) => <path key={index} className="ink-stroke" d={path(stroke)} />)}{active && <path className="ink-stroke" d={path(active)} />}
        </svg>
        <div className="pad-actions">
          <button className={`tool-button ${guide ? 'active' : ''}`} onClick={() => setGuide(!guide)} aria-pressed={guide}><Sparkles size={17} /> Guide</button>
          <button className={`tool-button ${demoPlaying ? 'active' : ''}`} onClick={playStrokeOrder} disabled={!strokeOrder}><Play size={17} fill="currentColor" /> {demoPlaying ? 'Playing' : 'Play order'}</button>
          <button className="tool-button" onClick={() => setStrokes(strokes.slice(0, -1))} disabled={!strokes.length}><RotateCcw size={17} /> Undo</button>
          <button className="tool-button" onClick={() => setStrokes([])} disabled={!strokes.length}><Eraser size={17} /> Clear</button>
        </div>
      </div>
      <p className="pad-tip">Follow the numbered starts or play the order, then trace over the guide. The video remains available for a full demonstration.</p>
    </section>
  );
}

type NavView = 'dictionary' | 'study-plan' | 'review';
type AppView = NavView | 'character';
type StudyMode = 'normal' | 'intensive';

type CurriculumTheme = {
  id: string;
  title: string;
  focus: string;
  seed: string;
  matches: RegExp;
};

type CurriculumItem = {
  entry: CharacterEntry;
  theme: CurriculumTheme;
};

type StudyHistoryEntry = {
  day: number;
  mode: StudyMode;
  title: string;
  characters: string[];
};

type ReviewGrouping = 'category' | 'lesson';

type ReviewDeck = {
  id: string;
  label: string;
  description: string;
  characters: CharacterEntry[];
};

const CURRICULUM_THEMES: CurriculumTheme[] = [
  { id: 'sentences', title: 'First conversations', focus: 'Build useful sentences with people, questions, negatives, and common connectors.', seed: '你我他她们您好请谢谢对不起没关系再见是有不在很也都这那哪谁什么吗呢的了会能要', matches: /\b(I|me|you|he|him|she|her|we|they|this|that|who|what|which|yes|no|not|please|thank|sorry|question|particle|be|have|can|able|also|all)\b/i },
  { id: 'numbers', title: 'Numbers & amounts', focus: 'Learn counting, quantities, prices, and the measure words used with them.', seed: '零一二两三四五六七八九十百千万亿几多少半双第数个本只张块元钱加减分', matches: /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|number|count|amount|quantity|half|double|price|money|measure|add|subtract)\b/i },
  { id: 'time', title: 'Time & daily rhythm', focus: 'Connect clock time, calendar words, seasons, and the order of daily events.', seed: '日月年天时分秒今明昨早晚午星期周春夏秋冬点钟前后先每次', matches: /\b(time|day|week|month|year|hour|minute|second|today|tomorrow|yesterday|morning|afternoon|evening|night|spring|summer|autumn|winter|season|before|after|early|late)\b/i },
  { id: 'people', title: 'People & family', focus: 'Learn people together with family roles, relationships, and social identity.', seed: '人男女子爸妈父母哥姐弟妹儿家朋友夫妻爷奶祖亲孩老师学生', matches: /\b(person|people|man|woman|male|female|boy|girl|child|baby|father|mother|parent|brother|sister|son|daughter|family|friend|husband|wife|grandfather|grandmother|uncle|aunt|teacher|student)\b/i },
  { id: 'learning', title: 'Learning & language', focus: 'Combine the characters used for reading, writing, speaking, and studying.', seed: '学习生老师教读写说听看问答话语言汉字书本笔纸文名记思知道', matches: /\b(study|learn|practice|teach|teacher|student|read|write|speak|say|listen|hear|ask|answer|language|word|character|book|paper|pen|name|know|think|remember)\b/i },
  { id: 'places', title: 'Places & directions', focus: 'Orient yourself with locations, directions, travel, and position words.', seed: '上下左右前后里外中东西南北家国市区省乡路街店站机场校院室', matches: /\b(place|country|city|town|village|home|house|room|school|street|road|store|shop|market|hospital|station|airport|north|south|east|west|inside|outside|front|back|left|right|above|below|travel)\b/i },
  { id: 'actions', title: 'Everyday actions', focus: 'Pair high-use verbs so you can describe movement, routines, and simple tasks.', seed: '来去走跑进出回上下来坐站开关拿放给用做工作玩买卖睡醒洗穿', matches: /\b(come|go|walk|run|enter|leave|return|sit|stand|open|close|take|put|give|use|make|do|work|play|buy|sell|sleep|wake|wash|wear|move|carry|turn)\b/i },
  { id: 'food', title: 'Food & the table', focus: 'Learn foods alongside eating, drinking, tastes, utensils, and cooking.', seed: '吃喝饭米面菜肉鱼蛋水果茶酒奶糖盐甜酸苦辣碗盘筷锅油饺饿饱', matches: /\b(food|eat|drink|rice|tea|fruit|vegetable|meat|fish|bread|noodle|dumpling|sugar|salt|meal|cook|wine|beer|milk|egg|hungry|full|sweet|sour|bitter|spicy|bowl|plate|chopsticks|pot)\b/i },
  { id: 'body', title: 'Body & health', focus: 'Connect body parts with health, illness, movement, and physical sensations.', seed: '身体头脸眼耳鼻嘴口牙手指脚腿心血骨皮发脑胸肩病医药痛痒健康', matches: /\b(body|head|face|eye|ear|nose|mouth|tooth|teeth|tongue|hand|arm|finger|leg|foot|feet|heart|blood|skin|hair|bone|brain|chest|shoulder|stomach|health|healthy|medical|medicine|ill|sick|pain|ache|itch)\b/i },
  { id: 'home', title: 'Home & useful objects', focus: 'Group rooms, furniture, clothing, tools, and the objects used every day.', seed: '家房室门窗桌椅床灯电衣服鞋帽包杯瓶刀车机网电话表', matches: /\b(home|house|room|door|window|table|chair|bed|lamp|clothes|shirt|shoe|hat|bag|cup|bottle|knife|tool|machine|car|vehicle|telephone|phone|watch|furniture)\b/i },
  { id: 'nature', title: 'Nature & weather', focus: 'Study the landscape together with weather, water, light, and the seasons.', seed: '水火山川河江湖海天地日月星云雨雪风雾冷热阴阳石土木林花草', matches: /\b(water|fire|mountain|river|lake|sea|ocean|sky|earth|sun|moon|star|cloud|rain|snow|wind|fog|weather|hot|cold|stone|soil|wood|forest|flower|grass)\b/i },
  { id: 'living-things', title: 'Animals & plants', focus: 'Learn living things in related groups, from familiar animals to plants and insects.', seed: '人鸟鱼虫狗猫马牛羊猪鸡兔虎龙蛇猴鼠树木林花草叶果', matches: /\b(animal|bird|fish|insect|dog|cat|horse|cow|cattle|sheep|pig|chicken|rabbit|tiger|dragon|snake|monkey|mouse|rat|plant|tree|leaf|flower|grass|fruit)\b/i },
  { id: 'descriptions', title: 'Descriptions & contrasts', focus: 'Learn useful qualities in pairs: size, amount, color, temperature, and appearance.', seed: '大小多少高矮长短胖瘦好坏真假美丑新旧快慢轻重黑白红黄蓝绿紫灰棕粉', matches: /\b(big|small|many|few|high|low|tall|short|long|fat|thin|good|bad|true|false|beautiful|ugly|new|old|fast|slow|heavy|light|bright|dark|black|white|red|yellow|blue|green|purple|grey|gray|brown|pink|color)\b/i },
  { id: 'feelings', title: 'Feelings & relationships', focus: 'Connect emotion words with friendship, care, conflict, and social response.', seed: '爱喜欢乐笑哭悲哀怒怕惊忧愁情信谢歉善恶妒恨', matches: /\b(love|like|happy|laugh|smile|cry|sad|sorrow|angry|rage|fear|afraid|surprise|worry|emotion|feeling|friendship|believe|thank|apology|envy|hate|kind|evil)\b/i },
  { id: 'society', title: 'Work & society', focus: 'Build practical vocabulary for jobs, money, public life, and shared institutions.', seed: '工作公司厂商店市场钱元税政府国省市区军警法医学校银行票', matches: /\b(work|job|company|factory|business|market|money|tax|government|politic|country|province|city|district|army|military|police|law|hospital|school|bank|ticket|society)\b/i },
];

const EXTENDED_THEME: CurriculumTheme = {
  id: 'extended',
  title: 'Extended vocabulary',
  focus: 'Continue through the remaining archive in pinyin order so related sounds are easier to compare.',
  seed: '',
  matches: /$^/,
};

function buildCurriculum(): CurriculumItem[] {
  const entryByCharacter = new Map(CHARACTERS.map((entry) => [entry.character, entry]));
  const assigned = new Set<string>();
  const curriculum: CurriculumItem[] = [];

  for (const theme of CURRICULUM_THEMES) {
    for (const character of theme.seed) {
      const entry = entryByCharacter.get(character);
      if (entry && !assigned.has(character)) {
        curriculum.push({ entry, theme });
        assigned.add(character);
      }
    }
    for (const entry of CHARACTERS) {
      if (!assigned.has(entry.character) && theme.matches.test(entry.definition)) {
        curriculum.push({ entry, theme });
        assigned.add(entry.character);
      }
    }
  }

  CHARACTERS
    .filter((entry) => !assigned.has(entry.character))
    .sort((first, second) => first.pinyin.localeCompare(second.pinyin, 'en'))
    .forEach((entry) => curriculum.push({ entry, theme: EXTENDED_THEME }));

  return curriculum;
}

const CURRICULUM = buildCurriculum();
const CHARACTER_BY_ID = new Map(CHARACTERS.map((entry) => [entry.character, entry]));

const STUDY_PLANS: Record<StudyMode, { label: string; time: string; charactersPerDay: number; description: string }> = {
  normal: {
    label: 'Normal',
    time: '1 hour per day',
    charactersPerDay: 30,
    description: 'About 30 connected characters each day, with a sentence-writing checkpoint every seventh day.',
  },
  intensive: {
    label: 'Intensive',
    time: '2–3 hours per day',
    charactersPerDay: 60,
    description: 'About 60 connected characters each day, with sentence writing built into every lesson.',
  },
};

function makeStudyLesson(mode: StudyMode, completedCharacters: Set<string>) {
  const units = CURRICULUM
    .filter(({ entry }) => !completedCharacters.has(entry.character))
    .slice(0, STUDY_PLANS[mode].charactersPerDay);
  const themes = [...new Map(units.map(({ theme }) => [theme.id, theme])).values()];
  const firstTheme = themes[0] ?? EXTENDED_THEME;
  const title = themes.length > 1 ? `${firstTheme.title} + ${themes[1].title}` : firstTheme.title;
  const focus = themes.length > 1
    ? `${firstTheme.focus} Then begin ${themes[1].title.toLowerCase()} with the remaining characters.`
    : firstTheme.focus;

  return { characters: units.map(({ entry }) => entry), title, focus };
}

function makeReviewDecks(grouping: ReviewGrouping, learnedCharacters: CharacterEntry[], history: StudyHistoryEntry[]): ReviewDeck[] {
  const allDeck: ReviewDeck = {
    id: 'all',
    label: 'All learned',
    description: 'Every character marked as learned.',
    characters: learnedCharacters,
  };

  if (grouping === 'category') {
    const themeByCharacter = new Map(CURRICULUM.map(({ entry, theme }) => [entry.character, theme]));
    const decks = [...CURRICULUM_THEMES, EXTENDED_THEME].map((theme) => ({
      id: theme.id,
      label: theme.title,
      description: theme.focus,
      characters: learnedCharacters.filter((entry) => themeByCharacter.get(entry.character)?.id === theme.id),
    })).filter((deck) => deck.characters.length);
    return [allDeck, ...decks];
  }

  const learnedSet = new Set(learnedCharacters.map((entry) => entry.character));
  const recorded = new Set(history.flatMap((lesson) => lesson.characters));
  const lessonDecks = [...history].reverse().map((lesson) => ({
    id: `lesson-${lesson.day}`,
    label: `Day ${lesson.day} · ${lesson.title}`,
    description: `${lesson.mode === 'normal' ? 'Normal' : 'Intensive'} lesson`,
    characters: lesson.characters.map((character) => CHARACTER_BY_ID.get(character)).filter((entry): entry is CharacterEntry => Boolean(entry && learnedSet.has(entry.character))),
  })).filter((deck) => deck.characters.length);
  const independent = learnedCharacters.filter((entry) => !recorded.has(entry.character));

  return independent.length
    ? [allDeck, ...lessonDecks, { id: 'independent', label: 'Independent practice', description: 'Characters learned outside a completed daily lesson.', characters: independent }]
    : [allDeck, ...lessonDecks];
}

function AppNavigation({ activeView, onNavigate }: { activeView: NavView; onNavigate: (view: NavView) => void }) {

  return (
    <Sidebar collapsible="none" className="side-rail">
      <SidebarContent>
        <SidebarGroup className="rail-section">
          <SidebarGroupLabel className="label">WORKSHOP</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="page-menu">
              <SidebarMenuItem>
                <SidebarMenuButton className="page-link" size="lg" isActive={activeView === 'dictionary'} onClick={() => onNavigate('dictionary')}>
                  <BookOpen />
                  <span><b>Dictionary</b><small>Browse every character</small></span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="page-link" size="lg" isActive={activeView === 'study-plan'} onClick={() => onNavigate('study-plan')}>
                  <CalendarDays />
                  <span><b>Study Plan</b><small>Follow today&apos;s path</small></span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="page-link" size="lg" isActive={activeView === 'review'} onClick={() => onNavigate('review')}>
                  <ClipboardCheck />
                  <span><b>Review</b><small>Practice learned words</small></span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="rail-footer">
        <span className="label">TRAINCHINESE ARCHIVE</span>
        <strong>{CHARACTERS.length.toLocaleString()}</strong>
        <small>characters indexed</small>
      </SidebarFooter>
    </Sidebar>
  );
}

function WritingCheckpoint({
  cadence,
  dayNumber,
  characters,
  draft,
  onDraftChange,
}: {
  cadence: 'daily' | 'weekly';
  dayNumber: number;
  characters: CharacterEntry[];
  draft: string;
  onDraftChange: (draft: string) => void;
}) {
  const usedCharacters = new Set(characters.filter((entry) => draft.includes(entry.character)).map((entry) => entry.character));
  const remaining = characters.length - usedCharacters.size;
  const checkpointLabel = cadence === 'daily' ? 'DAILY INTENSIVE WRITING' : `WEEK ${Math.ceil(dayNumber / 7)} CHECKPOINT`;
  const periodLabel = cadence === 'daily' ? 'today' : 'this week';

  return (
    <section className="weekly-writing" aria-labelledby={`${cadence}-${dayNumber}-writing-title`}>
      <header className="weekly-writing-heading">
        <div><span className="label">{checkpointLabel}</span><h3 id={`${cadence}-${dayNumber}-writing-title`}>Write with {periodLabel}&apos;s characters</h3></div>
        <p aria-live="polite"><strong>{usedCharacters.size}</strong> of {characters.length} used</p>
      </header>
      <div className="weekly-writing-grid">
        <div>
          <p>Use every character from {periodLabel} at least once across your sentences. Earlier vocabulary is welcome, but {periodLabel}&apos;s set is the focus.</p>
          <div className="weekly-character-bank" aria-label={`Characters to use in ${periodLabel}'s sentences`}>
            {characters.map((entry) => <span key={entry.character} data-used={usedCharacters.has(entry.character) || undefined} title={`${entry.pinyin} — ${entry.definition}`}>{entry.character}</span>)}
          </div>
        </div>
        <label className="weekly-copybook">
          <span>Your sentences</span>
          <textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Write several Chinese sentences here…" />
          <small>{remaining ? `${remaining} required characters still need to be used.` : `Every character from ${periodLabel} appears in your sentences.`}</small>
        </label>
      </div>
    </section>
  );
}

function StudyPlanPanel({
  mode,
  dayNumber,
  learnedCount,
  characters,
  lessonTitle,
  lessonFocus,
  checkpointCharacters,
  writingDraft,
  onWritingDraftChange,
  onOpenCharacter,
  onCompleteDay,
}: {
  mode: StudyMode;
  dayNumber: number;
  learnedCount: number;
  characters: CharacterEntry[];
  lessonTitle: string;
  lessonFocus: string;
  checkpointCharacters: CharacterEntry[];
  writingDraft: string;
  onWritingDraftChange: (draft: string) => void;
  onOpenCharacter: (entry: CharacterEntry) => void;
  onCompleteDay: () => void;
}) {
  const plan = STUDY_PLANS[mode];
  const remaining = CHARACTERS.length - learnedCount;
  const remainingDays = Math.ceil(remaining / plan.charactersPerDay);
  const mastery = learnedCount / CHARACTERS.length * 100;
  const writingCadence = mode === 'intensive' ? 'daily' : 'weekly';
  const isWritingCheckpoint = characters.length > 0 && (mode === 'intensive' || dayNumber % 7 === 0);
  const checkpointCharactersUsed = isWritingCheckpoint ? checkpointCharacters.filter((entry) => writingDraft.includes(entry.character)).length : 0;
  const writingComplete = !isWritingCheckpoint || checkpointCharactersUsed === checkpointCharacters.length;

  return (
    <TabsContent value={mode} className="plan-content">
      <section className="plan-overview">
        <div className="plan-intro">
          <span className="plan-stamp">{mode === 'normal' ? '稳' : '速'}</span>
          <div><h2>{plan.label} plan</h2><p>{plan.description}</p></div>
        </div>
        <dl className="plan-stats">
          <div><dt><Clock3 size={17} />Daily time</dt><dd>{plan.time}</dd></div>
          <div><dt><BookOpen size={17} />Daily lesson</dt><dd>{plan.charactersPerDay} characters</dd></div>
          <div><dt><Gauge size={17} />Remaining path</dt><dd>{remainingDays.toLocaleString()} days</dd></div>
        </dl>
        <Progress className="mastery-progress" value={mastery}>
          <ProgressLabel>Overall mastery</ProgressLabel>
          <ProgressValue>{() => `${learnedCount.toLocaleString()} of ${CHARACTERS.length.toLocaleString()}`}</ProgressValue>
        </Progress>
      </section>

      <section className="daily-lesson">
        <header className="daily-heading">
          <div><span className="label">TODAY&apos;S LESSON</span><h2>Day {dayNumber}</h2><p className="lesson-theme">{lessonTitle}</p><small className="lesson-focus">{lessonFocus}</small></div>
          <p className="lesson-load"><strong>{characters.length}</strong> new {characters.length === 1 ? 'character' : 'characters'}</p>
        </header>
        {characters.length ? (
          <>
            <div className="today-character-grid">
              {characters.map((entry, index) => (
                <button key={entry.character} onClick={() => onOpenCharacter(entry)}>
                  <span className="lesson-number">{String(index + 1).padStart(2, '0')}</span>
                  <b>{entry.character}</b>
                  <span><strong>{entry.pinyin}</strong><small>{entry.definition}</small></span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
            {isWritingCheckpoint && <WritingCheckpoint cadence={writingCadence} dayNumber={dayNumber} characters={checkpointCharacters} draft={writingDraft} onDraftChange={onWritingDraftChange} />}
            <footer className="daily-footer">
              <p>{isWritingCheckpoint ? `Finish the ${writingCadence} writing checkpoint, then add this lesson to Review.` : 'Open each character to practice it. Complete the day when you are ready to add the full lesson to Review.'}</p>
              <button className="complete-day-button" onClick={onCompleteDay} disabled={!writingComplete}><Check size={19} />{writingComplete ? 'Complete day & add to Review' : `${checkpointCharacters.length - checkpointCharactersUsed} writing characters left`}</button>
            </footer>
          </>
        ) : (
          <Empty className="plan-complete"><span className="empty-glyph">成</span><h2>All characters mastered</h2><p>Your complete library is ready in Review.</p></Empty>
        )}
      </section>
    </TabsContent>
  );
}

export default function Home() {
  const [view, setView] = useState<AppView>('dictionary');
  const [characterOrigin, setCharacterOrigin] = useState<NavView>('dictionary');
  const [current, setCurrent] = useState(0);
  const [query, setQuery] = useState('');
  const [dictionaryQuery, setDictionaryQuery] = useState('');
  const [dictionaryFilter, setDictionaryFilter] = useState<DictionaryFilter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [completed, setCompleted] = useState<string[]>(() => typeof window === 'undefined' ? [] : JSON.parse(localStorage.getItem('hanzi-completed') || '[]'));
  const [saved, setSaved] = useState<string[]>(() => typeof window === 'undefined' ? [] : JSON.parse(localStorage.getItem('hanzi-saved') || '[]'));
  const [studyMode, setStudyMode] = useState<StudyMode>(() => typeof window !== 'undefined' && localStorage.getItem('hanzi-study-mode') === 'intensive' ? 'intensive' : 'normal');
  const [studyDaysCompleted, setStudyDaysCompleted] = useState(() => typeof window === 'undefined' ? 0 : Number(localStorage.getItem('hanzi-study-days') || '0'));
  const [studyHistory, setStudyHistory] = useState<StudyHistoryEntry[]>(() => typeof window === 'undefined' ? [] : JSON.parse(localStorage.getItem('hanzi-study-history') || '[]'));
  const [weeklyDrafts, setWeeklyDrafts] = useState<Record<string, string>>(() => typeof window === 'undefined' ? {} : JSON.parse(localStorage.getItem('hanzi-weekly-drafts') || '{}'));
  const [reviewGrouping, setReviewGrouping] = useState<ReviewGrouping>('category');
  const [reviewDeckId, setReviewDeckId] = useState('all');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewAnswerShown, setReviewAnswerShown] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const item = CHARACTERS[current];

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        document.querySelector<HTMLInputElement>('.search-wrap input')?.focus();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return CHARACTERS.slice(0, 12);
    return CHARACTERS.filter((entry) => entry.character.includes(value) || entry.pinyin.toLowerCase().includes(value) || entry.definition.toLowerCase().includes(value)).slice(0, 40);
  }, [query]);

  const dictionaryResults = useMemo(() => {
    const value = dictionaryQuery.trim().toLowerCase();
    return CHARACTERS.filter((entry) => {
      const matchesCategory = matchesFilter(entry, dictionaryFilter);
      if (!value) return matchesCategory;
      return matchesCategory && (entry.character.includes(value) || entry.pinyin.toLowerCase().includes(value) || entry.definition.toLowerCase().includes(value));
    });
  }, [dictionaryFilter, dictionaryQuery]);

  const dictionaryFilterCounts = useMemo(() => Object.fromEntries(
    DICTIONARY_FILTERS.map((filter) => [filter.id, CHARACTERS.filter((entry) => matchesFilter(entry, filter.id)).length]),
  ) as Record<DictionaryFilter, number>, []);

  const completedSet = useMemo(() => new Set(completed), [completed]);
  const learnedCharacters = useMemo(() => CHARACTERS.filter((entry) => completedSet.has(entry.character)), [completedSet]);
  const studyLessons = useMemo(() => ({
    normal: makeStudyLesson('normal', completedSet),
    intensive: makeStudyLesson('intensive', completedSet),
  }), [completedSet]);
  const normalWeeklyCharacters = useMemo(() => {
    const dayNumber = studyDaysCompleted + 1;
    const weekStart = Math.floor((dayNumber - 1) / 7) * 7 + 1;
    if (dayNumber % 7 !== 0) return [];
    let previousCharacters = studyHistory
      .filter((lesson) => lesson.day >= weekStart && lesson.day < dayNumber)
      .flatMap((lesson) => lesson.characters);
    if (!previousCharacters.length && dayNumber > weekStart) {
      const fallbackCount = (dayNumber - weekStart) * STUDY_PLANS.normal.charactersPerDay;
      previousCharacters = CURRICULUM.filter(({ entry }) => completedSet.has(entry.character)).slice(-fallbackCount).map(({ entry }) => entry.character);
    }
    const combined = [...previousCharacters, ...studyLessons.normal.characters.map((entry) => entry.character)];
    return [...new Set(combined)].map((character) => CHARACTER_BY_ID.get(character)).filter((entry): entry is CharacterEntry => Boolean(entry));
  }, [completedSet, studyDaysCompleted, studyHistory, studyLessons]);
  const reviewDecks = useMemo(() => makeReviewDecks(reviewGrouping, learnedCharacters, studyHistory), [learnedCharacters, reviewGrouping, studyHistory]);
  const activeReviewDeck = reviewDecks.find((deck) => deck.id === reviewDeckId) ?? reviewDecks[0];
  const reviewCharacters = activeReviewDeck?.characters ?? [];
  const reviewEntry = reviewCharacters.length ? reviewCharacters[reviewIndex % reviewCharacters.length] : null;
  const activeNavView: NavView = view === 'character' ? characterOrigin : view;

  function choose(entry: CharacterEntry, origin: NavView = 'dictionary') {
    const index = CHARACTERS.findIndex((candidate) => candidate.character === entry.character);
    setCurrent(Math.max(index, 0));
    setCharacterOrigin(origin);
    setVideoPlaying(false);
    setSearchOpen(false);
    setQuery('');
    setView('character');
  }

  function selectIndex(index: number) {
    setCurrent(index);
    setVideoPlaying(false);
    setView('character');
  }

  function speak(text = item.character) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const voice = new SpeechSynthesisUtterance(text);
    voice.lang = 'zh-CN';
    voice.rate = .7;
    speechSynthesis.speak(voice);
  }

  function persist(key: 'completed' | 'saved', list: string[]) {
    if (key === 'completed') setCompleted(list);
    else setSaved(list);
    localStorage.setItem(`hanzi-${key}`, JSON.stringify(list));
  }

  function toggleComplete() {
    persist('completed', completed.includes(item.character) ? completed.filter(v => v !== item.character) : [...completed, item.character]);
  }

  function toggleSaved() {
    persist('saved', saved.includes(item.character) ? saved.filter(v => v !== item.character) : [...saved, item.character]);
  }

  function changeStudyMode(mode: StudyMode) {
    setStudyMode(mode);
    localStorage.setItem('hanzi-study-mode', mode);
  }

  function completeStudyDay(mode: StudyMode) {
    const lesson = studyLessons[mode].characters;
    if (!lesson.length) return;
    persist('completed', [...completed, ...lesson.map((entry) => entry.character)]);
    const nextDay = studyDaysCompleted + 1;
    const nextHistory = [...studyHistory.filter((entry) => entry.day !== nextDay), {
      day: nextDay,
      mode,
      title: studyLessons[mode].title,
      characters: lesson.map((entry) => entry.character),
    }];
    setStudyHistory(nextHistory);
    localStorage.setItem('hanzi-study-history', JSON.stringify(nextHistory));
    setStudyDaysCompleted(nextDay);
    localStorage.setItem('hanzi-study-days', String(nextDay));
    setReviewIndex(0);
    setReviewAnswerShown(false);
  }

  function moveReview(direction: 1 | -1) {
    if (!reviewCharacters.length) return;
    setReviewIndex((index) => (index + direction + reviewCharacters.length) % reviewCharacters.length);
    setReviewAnswerShown(false);
  }

  function changeReviewGrouping(grouping: ReviewGrouping) {
    setReviewGrouping(grouping);
    setReviewDeckId('all');
    setReviewIndex(0);
    setReviewAnswerShown(false);
  }

  function selectReviewDeck(deckId: string) {
    setReviewDeckId(deckId);
    setReviewIndex(0);
    setReviewAnswerShown(false);
  }

  function updateWeeklyDraft(draftId: string, draft: string) {
    const nextDrafts = { ...weeklyDrafts, [draftId]: draft };
    setWeeklyDrafts(nextDrafts);
    localStorage.setItem('hanzi-weekly-drafts', JSON.stringify(nextDrafts));
  }

  const sampleExamples = examples[item.character] ?? [{ word: item.character, pinyin: item.pinyin, meaning: item.definition }];
  const tone = toneNumber(item.pinyin);
  const isComplete = completed.includes(item.character);
  const isSaved = saved.includes(item.character);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('dictionary')} aria-label="Hanzi Desk dictionary"><span className="brand-mark">字</span><span><strong>HANZI DESK</strong><small>CHARACTER WORKSHOP</small></span></button>
        <div className="search-wrap"><Search size={19} /><input value={query} onChange={e => { setQuery(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} placeholder="Search character, pinyin, or meaning" aria-label="Search the Chinese dictionary" /><kbd>⌘ K</kbd>
          {searchOpen && <div className="search-results"><div className="results-label"><span>{query ? `${results.length} MATCHES` : 'BEGINNER CHARACTERS'}</span><button onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={16} /></button></div>
            {results.length ? results.map(entry => <button key={entry.character} className="result-row" onClick={() => choose(entry)}><b>{entry.character}</b><span><strong>{entry.pinyin}</strong>{entry.definition}</span><ArrowRight size={16} /></button>) : <p className="empty-search">No character found. Try “water”, “nǐ”, or “你”.</p>}
          </div>}
        </div>
        <div className="header-actions"><button className="avatar" title="Local learner profile">EX</button></div>
      </header>

      <SidebarProvider className="workspace" style={{ '--sidebar-width': '250px' } as React.CSSProperties}>
        <AppNavigation activeView={activeNavView} onNavigate={(nextView) => { setView(nextView); if (nextView === 'review') setReviewAnswerShown(false); }} />

        {view === 'dictionary' && (
          <section className="page-main dictionary-page">
            <header className="page-heading">
              <div><span className="label">CHARACTER ARCHIVE</span><h1>Dictionary</h1></div>
              <p>Choose a character to open its pronunciation, meaning, writing desk, and TrainChinese lesson.</p>
            </header>
            <div className="dictionary-tools">
              <label className="dictionary-search"><Search size={20} /><span className="sr-only">Search the full dictionary</span><input value={dictionaryQuery} onChange={event => setDictionaryQuery(event.target.value)} placeholder="Search all characters, pinyin, or English" /></label>
              <p aria-live="polite"><strong>{dictionaryResults.length.toLocaleString()}</strong> {dictionaryResults.length === 1 ? 'character' : 'characters'}</p>
            </div>
            <nav className="dictionary-filters" aria-label="Filter dictionary by category">
              <span className="label">FILTER BY</span>
              <div className="filter-strip">
                {DICTIONARY_FILTERS.map((filter) => (
                  <button key={filter.id} aria-pressed={dictionaryFilter === filter.id} onClick={() => setDictionaryFilter(filter.id)}>
                    <span>{filter.label}</span>
                    <small>{dictionaryFilterCounts[filter.id].toLocaleString()}</small>
                  </button>
                ))}
              </div>
            </nav>
            <div className="dictionary-index">
              <div className="dictionary-columns" aria-hidden="true">
                <div className="dictionary-column-heading"><span>Character</span><span>Pinyin</span><span>English</span><span /></div>
                <div className="dictionary-column-heading dictionary-column-heading-secondary"><span>Character</span><span>Pinyin</span><span>English</span><span /></div>
              </div>
              {dictionaryResults.length ? (
                <ul className="dictionary-list">
                  {dictionaryResults.map((entry) => (
                    <li key={entry.character}>
                      <button onClick={() => choose(entry)} aria-label={`Open ${entry.character}, ${entry.pinyin}, ${entry.definition}`}>
                        <span className="dictionary-character">{entry.character}</span>
                        <span className="dictionary-pinyin">{entry.pinyin}</span>
                        <span className="dictionary-definition">{entry.definition}</span>
                        <ArrowRight className="dictionary-arrow" size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="dictionary-empty"><span className="empty-glyph">字</span><h2>No characters found</h2><p>Try a different character, pinyin spelling, or English word.</p></Empty>
              )}
            </div>
          </section>
        )}

        {view === 'study-plan' && (
          <section className="page-main study-plan-page">
            <Tabs className="study-plan-tabs" value={studyMode} onValueChange={(value) => changeStudyMode(value as StudyMode)}>
              <header className="page-heading study-plan-heading">
                <div><span className="label">DAILY PATH</span><h1>Study Plan</h1></div>
                <p>Follow one lesson each day. Completing it marks every character as learned and adds it to Review.</p>
                <TabsList className="plan-tabs-list" aria-label="Study pace">
                <TabsTrigger className="plan-tab" value="normal"><span><b>Normal</b><small>30/day</small></span></TabsTrigger>
                <TabsTrigger className="plan-tab" value="intensive"><span><b>Intensive</b><small>60/day</small></span></TabsTrigger>
              </TabsList>
              </header>
              <StudyPlanPanel mode="normal" dayNumber={studyDaysCompleted + 1} learnedCount={learnedCharacters.length} characters={studyLessons.normal.characters} lessonTitle={studyLessons.normal.title} lessonFocus={studyLessons.normal.focus} checkpointCharacters={normalWeeklyCharacters} writingDraft={weeklyDrafts[`normal-week-${Math.ceil((studyDaysCompleted + 1) / 7)}`] || ''} onWritingDraftChange={(draft) => updateWeeklyDraft(`normal-week-${Math.ceil((studyDaysCompleted + 1) / 7)}`, draft)} onOpenCharacter={(entry) => choose(entry, 'study-plan')} onCompleteDay={() => completeStudyDay('normal')} />
              <StudyPlanPanel mode="intensive" dayNumber={studyDaysCompleted + 1} learnedCount={learnedCharacters.length} characters={studyLessons.intensive.characters} lessonTitle={studyLessons.intensive.title} lessonFocus={studyLessons.intensive.focus} checkpointCharacters={studyLessons.intensive.characters} writingDraft={weeklyDrafts[`intensive-day-${studyDaysCompleted + 1}`] || ''} onWritingDraftChange={(draft) => updateWeeklyDraft(`intensive-day-${studyDaysCompleted + 1}`, draft)} onOpenCharacter={(entry) => choose(entry, 'study-plan')} onCompleteDay={() => completeStudyDay('intensive')} />
            </Tabs>
          </section>
        )}

        {view === 'review' && (
          <section className="page-main review-page">
            <header className="page-heading review-heading">
              <div><span className="label">MEMORY PRACTICE</span><h1>Review</h1></div>
              <p>Choose a curriculum category or a completed lesson, then recall each character before showing the answer.</p>
              {learnedCharacters.length > 0 && <fieldset className="review-grouping">
                <legend className="sr-only">Group review characters by</legend>
                <button aria-pressed={reviewGrouping === 'category'} onClick={() => changeReviewGrouping('category')}>By category</button>
                <button aria-pressed={reviewGrouping === 'lesson'} onClick={() => changeReviewGrouping('lesson')}>By lesson</button>
              </fieldset>}
            </header>
            {reviewEntry ? (
              <>
                <nav className="review-deck-strip" aria-label={`Review by ${reviewGrouping}`}>
                  {reviewDecks.map((deck) => <button key={deck.id} aria-pressed={activeReviewDeck.id === deck.id} onClick={() => selectReviewDeck(deck.id)}><span>{deck.label}</span><small>{deck.characters.length}</small></button>)}
                </nav>
                <section className="review-workspace">
                  <div className="review-ledger"><span>{reviewGrouping === 'category' ? 'CATEGORY DECK' : 'LESSON DECK'}</span><strong>{reviewCharacters.length.toLocaleString()}</strong><small>{activeReviewDeck.label}</small><p>{activeReviewDeck.description}</p></div>
                  <div className="review-card">
                    <header><span className="label">{activeReviewDeck.label}</span><strong>{reviewIndex % reviewCharacters.length + 1} / {reviewCharacters.length}</strong></header>
                    <button className="review-sound" onClick={() => speak(reviewEntry.character)} aria-label={`Hear ${reviewEntry.character} pronounced`}><Volume2 size={21} />Hear pronunciation</button>
                    <div className="review-character">{reviewEntry.character}</div>
                    {reviewAnswerShown ? (
                      <div className="review-answer" aria-live="polite"><strong>{reviewEntry.pinyin}</strong><p>{reviewEntry.definition}</p><button onClick={() => choose(reviewEntry, 'review')}>Open full lesson<ArrowRight size={16} /></button></div>
                    ) : (
                      <p className="review-prompt">Say the pronunciation and English meaning before revealing the answer.</p>
                    )}
                    <footer className="review-actions">
                      <button onClick={() => moveReview(-1)}><ArrowLeft size={18} />Previous</button>
                      <button className="reveal-button" onClick={() => setReviewAnswerShown((shown) => !shown)}>{reviewAnswerShown ? 'Hide answer' : 'Show answer'}</button>
                      <button onClick={() => moveReview(1)}>Next<ArrowRight size={18} /></button>
                    </footer>
                  </div>
                </section>
              </>
            ) : (
              <Empty className="review-empty"><span className="empty-glyph">习</span><h2>No learned characters yet</h2><p>Complete your first daily lesson to build your Review deck.</p><button onClick={() => setView('study-plan')}>Open Study Plan<ArrowRight size={17} /></button></Empty>
            )}
          </section>
        )}

        {view === 'character' && (
          <div className="lesson-main">
            <button className="back-to-dictionary" onClick={() => setView(characterOrigin)}><ArrowLeft size={17} />{characterOrigin === 'dictionary' ? 'Dictionary' : characterOrigin === 'study-plan' ? 'Study Plan' : 'Review'}</button>
            <section className="character-header"><div className="character-identity"><span className="label">CURRENT CHARACTER</span><div className="identity-line"><h1>{item.character}</h1><div><button className="pronounce" onClick={() => speak()} aria-label={`Hear ${item.character} pronounced`}><Volume2 size={21} /></button><p className="pinyin">{item.pinyin}</p><p className="definition">{item.definition}</p></div></div></div>
              <div className="character-actions"><button className={`save-button ${isSaved ? 'saved' : ''}`} onClick={toggleSaved} aria-pressed={isSaved}><Star size={18} fill={isSaved ? 'currentColor' : 'none'} />{isSaved ? 'Saved' : 'Save'}</button><button className={`complete-button ${isComplete ? 'done' : ''}`} onClick={toggleComplete}>{isComplete ? <Check size={18} /> : <PencilLine size={18} />}{isComplete ? 'Practiced' : 'Mark practiced'}</button></div>
            </section>

            <div className="study-grid"><WritingPad key={item.character} character={item.character} />
              <section className="video-panel"><div className="panel-heading video-heading"><div><span className="label">STROKE ORDER</span><h2>Watch it written</h2></div><span className="source-badge">TRAINCHINESE</span></div><div className="video-frame">
                {videoPlaying ? <iframe src={`https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&rel=0`} title={`TrainChinese: how to write ${item.character}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <button className="video-poster" onClick={() => setVideoPlaying(true)} aria-label="Play writing video"><span className="video-thumbnail" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg)` }} aria-hidden="true" /><span className="video-shade" /><span className="play-button"><Play size={25} fill="currentColor" /></span><span className="poster-copy">HOW TO WRITE <b>{item.character}</b></span></button>}
              </div><p className="video-caption">The original TrainChinese lesson plays here, so your practice stays in one place.</p></section>
            </div>

            <section className="language-strip"><div className="tone-block"><span className="label">PRONUNCIATION</span><div className="tone-line"><button onClick={() => speak()} aria-label={`Hear ${item.pinyin}`}><Volume2 size={19} /></button><b>{item.pinyin}</b><span>Tone {tone || '—'} · {tones[tone]}</span></div></div>
              <div className="examples-block"><span className="label">IN A WORD</span><div className="examples-list">{sampleExamples.map(example => <button key={example.word} onClick={() => speak(example.word)}><b>{example.word}</b><span>{example.pinyin}</span><small>{example.meaning}</small><Volume2 size={15} /></button>)}</div></div>
            </section>
            <nav className="lesson-nav" aria-label="Character navigation"><button disabled={current === 0} onClick={() => selectIndex(Math.max(0, current - 1))}><ArrowLeft size={18} />Previous</button><span>{current + 1} of {CHARACTERS.length.toLocaleString()} characters</span><button onClick={() => selectIndex((current + 1) % CHARACTERS.length)}>Next character<ArrowRight size={18} /></button></nav>
          </div>
        )}
      </SidebarProvider>
    </main>
  );
}
