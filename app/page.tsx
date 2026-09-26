'use client';

import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, ClipboardCheck, Clock3, Gauge, Menu, PencilLine, Play, Search, Star, UserRound, Volume2, X } from 'lucide-react';
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
import { DictionaryFilterBar } from './dictionary-filter-bar';
import { PlanCalendar } from './plan-calendar';
import { DICTIONARY_FILTERS, matchesFilter, type DictionaryFilterId } from './dictionary-filters';
import { AccountPanel } from './account-panel';
import { AvatarBadge } from './avatar-badge';
import { LessonSession } from './lesson-session';
import { useOfflineSupport, useOnline } from './offline';
import { finishDay, historyEntries, markedCharacters, setActiveLesson, setMarks, setStudyMode, type StudyHistoryEntry } from './progress';
import { pronounce } from './pronunciation';
import { LESSONS, lessonCharacters, lessonsForDay, STUDY_PLANS, type ActiveLesson, type Lesson, type StudyMode } from './study-plan';
import { useSyncedProgress } from './use-synced-progress';
import { VideoPanel } from './video-panel';
import { WritingPad } from './writing-pad';


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

type NavView = 'dictionary' | 'study-plan' | 'review' | 'account';
type AppView = NavView | 'character' | 'lesson';

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

function AppNavigation({ activeView, onNavigate, avatar }: { activeView: NavView; onNavigate: (view: NavView) => void; avatar: string | null }) {

  return (
    <Sidebar collapsible="none" className="side-rail" id="app-navigation">
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
              {/* On phones Account sits in the menu; on larger screens it is pinned to the bottom of the rail. */}
              <SidebarMenuItem className="account-menu-item">
                <SidebarMenuButton className="page-link" size="lg" isActive={activeView === 'account'} onClick={() => onNavigate('account')}>
                  {avatar ? <AvatarBadge avatar={avatar} size={28} className="nav-avatar" /> : <UserRound />}
                  <span><b>Account</b></span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="rail-footer">
        <SidebarMenu className="page-menu rail-account">
          <SidebarMenuItem>
            <SidebarMenuButton className="page-link" size="lg" isActive={activeView === 'account'} onClick={() => onNavigate('account')}>
              {avatar ? <AvatarBadge avatar={avatar} size={28} className="nav-avatar" /> : <UserRound />}
              <span><b>Account</b></span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function StudyPlanPanel({
  mode,
  dayNumber,
  lessons,
  lessonsDone,
  learnedCount,
  completed,
  history,
  resumeStep,
  onStart,
}: {
  mode: StudyMode;
  dayNumber: number;
  lessons: Lesson[];
  lessonsDone: number;
  learnedCount: number;
  completed: Set<string>;
  history: StudyHistoryEntry[];
  resumeStep: number | null;
  onStart: () => void;
}) {
  const [showFullPlan, setShowFullPlan] = useState(false);
  const plan = STUDY_PLANS[mode];
  const remainingDays = Math.ceil((LESSONS.length - lessonsDone) / plan.lessonsPerDay);
  const mastery = learnedCount / CHARACTERS.length * 100;
  const characters = lessonCharacters(lessons);

  return (
    <TabsContent value={mode} className="plan-content">
      <section className="plan-overview">
        <div className="plan-intro">
          <span className="plan-stamp">{mode === 'normal' ? '稳' : '速'}</span>
          <div><h2>{plan.label} plan</h2><p>{plan.description}</p></div>
        </div>
        <dl className="plan-stats">
          <div><dt><Clock3 size={17} />Daily time</dt><dd>{plan.time}</dd></div>
          <div><dt><BookOpen size={17} />Daily lesson</dt><dd>{plan.lessonsPerDay * 30} characters</dd></div>
          <div><dt><Gauge size={17} />Remaining path</dt><dd>{remainingDays.toLocaleString()} days</dd></div>
        </dl>
        <Progress className="mastery-progress" value={mastery}>
          <ProgressLabel>Overall mastery</ProgressLabel>
          <ProgressValue>{() => `${learnedCount.toLocaleString()} of ${CHARACTERS.length.toLocaleString()}`}</ProgressValue>
        </Progress>
      </section>

      <fieldset className="plan-view-switch">
        <legend className="sr-only">Study plan view</legend>
        <button aria-pressed={!showFullPlan} onClick={() => setShowFullPlan(false)}><Play size={16} />Today&apos;s lesson</button>
        <button aria-pressed={showFullPlan} onClick={() => setShowFullPlan(true)}><CalendarDays size={16} />Full plan</button>
      </fieldset>

      {showFullPlan ? (
        <PlanCalendar mode={mode} lessonsDone={lessonsDone} studyDays={dayNumber - 1} history={history} completed={completed} resuming={resumeStep !== null} onStart={onStart} />
      ) : (
      <section className="daily-lesson">
        {characters.length ? (
          <>
            <header className="daily-heading">
              <div>
                <span className="label">TODAY&apos;S LESSON</span><h2>Day {dayNumber}</h2>
                {lessons.map((lesson, index) => (
                  <div className="lesson-summary" key={lesson.number}><p className="lesson-theme">{lessons.length > 1 ? `Part ${index + 1} · ` : ''}{lesson.title}</p><small className="lesson-focus">{lesson.summary}</small></div>
                ))}
              </div>
              <p className="lesson-load"><strong>{characters.length}</strong> new characters</p>
            </header>
            <div className="lesson-preview" aria-label="Characters in today's lesson">
              {characters.map((entry) => <span key={entry.character} title={`${entry.pinyin} — ${entry.definition}`} data-learned={completed.has(entry.character) || undefined}>{entry.character}</span>)}
            </div>
            <footer className="daily-footer">
              <p>{resumeStep !== null
                ? `You stopped at step ${resumeStep + 1} of ${characters.length + 1}. Your traces are saved.`
                : `Go through the characters one by one, tracing each one ${TRACE_GOAL_TEXT}, then finish with a short reading.`}</p>
              <button className="complete-day-button" onClick={onStart}><Play size={18} fill="currentColor" />{resumeStep !== null ? 'Continue lesson' : 'Start lesson'}</button>
            </footer>
          </>
        ) : (
          <Empty className="plan-complete"><span className="empty-glyph">成</span><h2>All lessons complete</h2><p>Your complete library is ready in Review.</p></Empty>
        )}
      </section>
      )}
    </TabsContent>
  );
}

const TRACE_GOAL_TEXT = 'ten times (or writing it on paper)';

export default function Home() {
  const [view, setView] = useState<AppView>('dictionary');
  const [characterOrigin, setCharacterOrigin] = useState<NavView>('dictionary');
  const [current, setCurrent] = useState(0);
  const [query, setQuery] = useState('');
  const [dictionaryQuery, setDictionaryQuery] = useState('');
  const [dictionaryFilter, setDictionaryFilter] = useState<DictionaryFilterId>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const account = useSyncedProgress();
  const { progress, update } = account;
  const completed = useMemo(() => markedCharacters(progress, 'completed'), [progress]);
  const saved = useMemo(() => markedCharacters(progress, 'saved'), [progress]);
  const studyMode = progress.studyMode.value;
  const studyDaysCompleted = progress.studyDays;
  const studyHistory = useMemo(() => historyEntries(progress), [progress]);
  const lessonsDone = progress.lessonsDone;
  const activeLesson = progress.activeLesson.value;
  const [reviewGrouping, setReviewGrouping] = useState<ReviewGrouping>('category');
  const [reviewDeckId, setReviewDeckId] = useState('all');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewAnswerShown, setReviewAnswerShown] = useState(false);
  const [reviewTracing, setReviewTracing] = useState(false);
  const reviewTracePanel = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const online = useOnline();
  // Saves every character, recording and font for offline use in the background.
  useOfflineSupport(online);
  const item = CHARACTERS[current];

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
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
  ) as Record<DictionaryFilterId, number>, []);

  const completedSet = useMemo(() => new Set(completed), [completed]);
  const learnedCharacters = useMemo(() => CHARACTERS.filter((entry) => completedSet.has(entry.character)), [completedSet]);
  const todaysLessons = useMemo(() => ({
    normal: lessonsForDay('normal', lessonsDone),
    intensive: lessonsForDay('intensive', lessonsDone),
  }), [lessonsDone]);
  const sessionLessons = useMemo(() => activeLesson ? LESSONS.filter((lesson) => activeLesson.lessons.includes(lesson.number)) : [], [activeLesson]);
  const reviewDecks = useMemo(() => makeReviewDecks(reviewGrouping, learnedCharacters, studyHistory), [learnedCharacters, reviewGrouping, studyHistory]);
  const activeReviewDeck = reviewDecks.find((deck) => deck.id === reviewDeckId) ?? reviewDecks[0];
  const reviewCharacters = activeReviewDeck?.characters ?? [];
  const reviewEntry = reviewCharacters.length ? reviewCharacters[reviewIndex % reviewCharacters.length] : null;
  const activeNavView: NavView = view === 'character' ? characterOrigin : view === 'lesson' ? 'study-plan' : view;

  function choose(entry: CharacterEntry, origin: NavView = 'dictionary') {
    const index = CHARACTERS.findIndex((candidate) => candidate.character === entry.character);
    setCurrent(Math.max(index, 0));
    setCharacterOrigin(origin);
    setSearchOpen(false);
    setQuery('');
    setView('character');
  }

  function selectIndex(index: number) {
    setCurrent(index);
    setView('character');
  }

  function speak(text = item.character) {
    pronounce(text);
  }

  function toggleMark(kind: 'completed' | 'saved', character: string) {
    const on = !(kind === 'completed' ? completed : saved).includes(character);
    update((current) => setMarks(current, kind, [character], on));
  }

  function toggleComplete() {
    toggleMark('completed', item.character);
  }

  function toggleSaved() {
    toggleMark('saved', item.character);
  }

  function changeStudyMode(mode: StudyMode) {
    update((current) => setStudyMode(current, mode));
  }

  function saveActiveLesson(next: ActiveLesson | null) {
    update((current) => setActiveLesson(current, next));
  }

  function startLesson(mode: StudyMode) {
    const numbers = todaysLessons[mode].map((lesson) => lesson.number);
    const resuming = activeLesson && activeLesson.lessons.join() === numbers.join();
    if (!resuming) saveActiveLesson({ mode, lessons: numbers, step: 0, traces: {} });
    setView('lesson');
  }

  function markLessonCharacter(character: string) {
    update((current) => setMarks(current, 'completed', [character], true));
  }

  function finishLesson() {
    if (!activeLesson) return;
    const entry: StudyHistoryEntry = {
      day: studyDaysCompleted + 1,
      mode: activeLesson.mode,
      title: sessionLessons.map((lesson) => lesson.title).join(' + '),
      characters: lessonCharacters(sessionLessons).map((character) => character.character),
    };
    update((current) => finishDay(current, entry, Math.max(current.lessonsDone, ...activeLesson.lessons)));
    setReviewIndex(0);
    setReviewAnswerShown(false);
    setView('study-plan');
  }

  function moveReview(direction: 1 | -1) {
    if (!reviewCharacters.length) return;
    setReviewIndex((index) => (index + direction + reviewCharacters.length) % reviewCharacters.length);
    setReviewAnswerShown(false);
  }

  function toggleReviewTracing() {
    const next = !reviewTracing;
    setReviewTracing(next);
    if (next) window.requestAnimationFrame(() => reviewTracePanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
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
        <div className="header-actions"><button className="menu-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="app-navigation" aria-label={menuOpen ? 'Close menu' : 'Open menu'}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button><button className="avatar" onClick={() => setView('account')} title={account.session ? `Signed in as ${account.session.username}` : 'Sign in to sync across devices'} aria-label="Account">{account.session ? <AvatarBadge avatar={account.session.avatar} size={38} /> : <UserRound size={18} />}</button></div>
      </header>

      <SidebarProvider className={`workspace ${menuOpen ? 'menu-open' : ''}`} style={{ '--sidebar-width': '250px' } as React.CSSProperties}>
        <AppNavigation activeView={activeNavView} avatar={account.session?.avatar ?? null} onNavigate={(nextView) => { setView(nextView); setMenuOpen(false); if (nextView === 'review') setReviewAnswerShown(false); }} />
        {menuOpen && <button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close menu" tabIndex={-1} />}

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
            <DictionaryFilterBar active={dictionaryFilter} counts={dictionaryFilterCounts} onSelect={setDictionaryFilter} />
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
                <p>One lesson a day: go through its characters one at a time, then finish with a short reading. Finished lessons move into Review.</p>
                <TabsList className="plan-tabs-list" aria-label="Study pace">
                <TabsTrigger className="plan-tab" value="normal"><span><b>Normal</b><small>30/day</small></span></TabsTrigger>
                <TabsTrigger className="plan-tab" value="intensive"><span><b>Intensive</b><small>60/day</small></span></TabsTrigger>
              </TabsList>
              </header>
              {(['normal', 'intensive'] as const).map((mode) => (
                <StudyPlanPanel key={mode} mode={mode} dayNumber={studyDaysCompleted + 1} lessons={todaysLessons[mode]} lessonsDone={lessonsDone} learnedCount={learnedCharacters.length} completed={completedSet} history={studyHistory} resumeStep={activeLesson && activeLesson.lessons.join() === todaysLessons[mode].map((lesson) => lesson.number).join() ? activeLesson.step : null} onStart={() => startLesson(mode)} />
              ))}
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
                  <div className="review-main">
                  <div className="review-card">
                    <header><span className="label">{activeReviewDeck.label}</span><strong>{reviewIndex % reviewCharacters.length + 1} / {reviewCharacters.length}</strong></header>
                    <div className="review-tools">
                      <button className="review-trace-toggle" onClick={toggleReviewTracing} aria-pressed={reviewTracing}><PencilLine size={19} />{reviewTracing ? 'Hide tracing' : 'Trace to practice'}</button>
                      <button className="review-sound" onClick={() => speak(reviewEntry.character)} aria-label={`Hear ${reviewEntry.character} pronounced`}><Volume2 size={21} />Hear pronunciation</button>
                    </div>
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
                  {reviewTracing && <div ref={reviewTracePanel} className="review-trace"><WritingPad key={reviewEntry.character} character={reviewEntry.character} /></div>}
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
              <div className="character-actions"><button className={`save-button ${isSaved ? 'saved' : ''}`} onClick={toggleSaved} aria-pressed={isSaved} aria-label={isSaved ? 'Saved' : 'Save'} title={isSaved ? 'Saved' : 'Save'}><Star size={18} fill={isSaved ? 'currentColor' : 'none'} /><span className="button-label">{isSaved ? 'Saved' : 'Save'}</span></button><button className={`complete-button ${isComplete ? 'done' : ''}`} onClick={toggleComplete} aria-pressed={isComplete} aria-label={isComplete ? 'Practiced' : 'Mark practiced'} title={isComplete ? 'Practiced' : 'Mark practiced'}><Check size={18} strokeWidth={isComplete ? 3 : 2} /><span className="button-label">{isComplete ? 'Practiced' : 'Mark practiced'}</span></button></div>
            </section>

            <div className="study-grid"><WritingPad key={item.character} character={item.character} />
              <VideoPanel key={item.character} character={item.character} videoId={item.videoId} online={online} />
            </div>

            <section className="language-strip"><div className="tone-block"><span className="label">PRONUNCIATION</span><div className="tone-line"><button onClick={() => speak()} aria-label={`Hear ${item.pinyin}`}><Volume2 size={19} /></button><b>{item.pinyin}</b><span>Tone {tone || '—'} · {tones[tone]}</span></div><small className="audio-credit">Recordings by native speakers Yue Tan, Chen Wang and Luilui6666, from <a href="https://github.com/hugolpz/audio-cmn" target="_blank" rel="noreferrer">audio-cmn</a> and <a href="https://lingualibre.org" target="_blank" rel="noreferrer">Lingua Libre</a> (CC BY-SA).</small></div>
              <div className="examples-block"><span className="label">IN A WORD</span><div className="examples-list">{sampleExamples.map(example => <button key={example.word} onClick={() => speak(example.word)}><b>{example.word}</b><span>{example.pinyin}</span><small>{example.meaning}</small><Volume2 size={15} /></button>)}</div></div>
            </section>
            <nav className="lesson-nav" aria-label="Character navigation"><button disabled={current === 0} onClick={() => selectIndex(Math.max(0, current - 1))}><ArrowLeft size={18} />Previous</button><span>{current + 1} of {CHARACTERS.length.toLocaleString()} characters</span><button onClick={() => selectIndex((current + 1) % CHARACTERS.length)}>Next character<ArrowRight size={18} /></button></nav>
          </div>
        )}
        {view === 'account' && <AccountPanel account={account} online={online} learnedCount={learnedCharacters.length} />}

        {view === 'lesson' && activeLesson && sessionLessons.length > 0 && (
          <LessonSession
            lessons={sessionLessons}
            dayNumber={studyDaysCompleted + 1}
            progress={activeLesson}
            onProgress={(change) => update((current) => current.activeLesson.value ? setActiveLesson(current, change(current.activeLesson.value)) : current)}
            completed={completedSet}
            saved={new Set(saved)}
            onMarkCompleted={markLessonCharacter}
            onToggleSaved={(character) => toggleMark('saved', character)}
            onExit={() => setView('study-plan')}
            onFinish={finishLesson}
            online={online}
          />
        )}
      </SidebarProvider>
    </main>
  );
}
