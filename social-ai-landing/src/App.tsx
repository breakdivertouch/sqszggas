import { useEffect, useState } from 'react'
import {
  Sparkles,
  Zap,
  CalendarClock,
  Wand2,
  BarChart3,
  Image as ImageIcon,
  Languages,
  ShieldCheck,
  Bot,
  Rocket,
  Check,
  ChevronDown,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  Send,
  Music2,
  MessageCircle,
  Star,
  ArrowRight,
  Play,
  Menu,
  X as XIcon,
  Heart,
  Repeat2,
  Bookmark,
  Share2,
} from 'lucide-react'
import './App.css'

const platforms = [
  { name: 'Instagram', Icon: Instagram, color: 'from-pink-500 to-orange-400' },
  { name: 'Facebook', Icon: Facebook, color: 'from-blue-600 to-indigo-500' },
  { name: 'TikTok', Icon: Music2, color: 'from-fuchsia-500 to-cyan-400' },
  { name: 'X / Twitter', Icon: Twitter, color: 'from-sky-500 to-slate-700' },
  { name: 'LinkedIn', Icon: Linkedin, color: 'from-sky-700 to-blue-500' },
  { name: 'YouTube', Icon: Youtube, color: 'from-red-600 to-rose-500' },
  { name: 'Telegram', Icon: Send, color: 'from-sky-400 to-blue-600' },
  { name: 'Threads', Icon: MessageCircle, color: 'from-zinc-700 to-zinc-900' },
]

const features = [
  {
    Icon: Wand2,
    title: 'Тексты от ИИ за секунды',
    desc: 'Опишите идею в одной строке — нейросеть напишет цепляющий пост, придумает заголовок, хэштеги и call-to-action под нужную площадку.',
  },
  {
    Icon: ImageIcon,
    title: 'Картинки и Reels на автопилоте',
    desc: 'Генерируем обложки, карусели и короткие видео в стиле вашего бренда. Никакого Photoshop — только готовый креатив.',
  },
  {
    Icon: CalendarClock,
    title: 'Контент-план на месяц вперёд',
    desc: 'ИИ строит расписание публикаций, учитывает праздники, тренды и активность вашей аудитории — вы только подтверждаете.',
  },
  {
    Icon: Zap,
    title: 'Автопостинг в один клик',
    desc: 'Один пост → 8 соцсетей одновременно. Адаптация формата, длины и хэштегов под Instagram, Facebook, TikTok, X и других — автоматически.',
  },
  {
    Icon: Languages,
    title: '40+ языков и tone of voice',
    desc: 'Пишите на русском, английском, испанском, арабском. Настройте голос бренда: дружелюбный, экспертный, провокационный — ИИ запомнит.',
  },
  {
    Icon: BarChart3,
    title: 'Аналитика, которая понятна',
    desc: 'Видите, какие посты работают, в какое время постить и что повторить. ИИ сам предлагает идеи на основе ваших цифр.',
  },
  {
    Icon: ShieldCheck,
    title: 'Безопасные интеграции',
    desc: 'Официальные API соцсетей, шифрование и SOC 2. Ваши аккаунты и контент защищены — никаких серых схем.',
  },
  {
    Icon: Bot,
    title: 'Авто-ответы и комментарии',
    desc: 'ИИ-агент отвечает на вопросы, лайкает, благодарит и сортирует входящие — пока вы занимаетесь делом.',
  },
]

const steps = [
  {
    n: '01',
    title: 'Подключите соцсети',
    desc: 'Instagram, Facebook, TikTok, X, LinkedIn, YouTube, Telegram, Threads — за 30 секунд через официальный OAuth.',
  },
  {
    n: '02',
    title: 'Опишите бренд и цели',
    desc: 'Кто вы, кому пишете, какой стиль. ИИ запомнит tone of voice и больше не будет переспрашивать.',
  },
  {
    n: '03',
    title: 'Получите контент-план',
    desc: 'Готовый календарь на 30 дней с текстами, картинками и видео. Меняйте, что не нравится — одной кнопкой.',
  },
  {
    n: '04',
    title: 'Публикуйте автоматически',
    desc: 'Посты выходят в нужное время на всех площадках. Вы получаете отчёт и спите спокойно.',
  },
]

const pricing = [
  {
    name: 'Старт',
    price: '0',
    period: '₽ / мес',
    desc: 'Чтобы попробовать и влюбиться',
    cta: 'Начать бесплатно',
    highlight: false,
    features: [
      '2 соцсети',
      '15 ИИ-постов в месяц',
      'Базовая генерация картинок',
      'Контент-план на 7 дней',
      'Аналитика по охватам',
    ],
  },
  {
    name: 'Профи',
    price: '1 490',
    period: '₽ / мес',
    desc: 'Для авторов и малого бизнеса',
    cta: 'Попробовать 7 дней бесплатно',
    highlight: true,
    features: [
      '8 соцсетей',
      'Безлимит ИИ-постов',
      'Reels и карусели от ИИ',
      'Контент-план на 30 дней',
      'Авто-ответы в Direct и комментариях',
      'Глубокая аналитика и AB-тесты',
      'Поддержка 24/7',
    ],
  },
  {
    name: 'Команда',
    price: '4 990',
    period: '₽ / мес',
    desc: 'Для агентств и брендов',
    cta: 'Связаться с нами',
    highlight: false,
    features: [
      'Всё из «Профи»',
      'До 25 брендов и команд',
      'Роли, согласования, ревью',
      'White-label отчёты для клиентов',
      'API и интеграции (Zapier, Make)',
      'Персональный менеджер',
    ],
  },
]

const testimonials = [
  {
    name: 'Анна К.',
    role: 'основатель бренда косметики',
    text: 'Раньше тратила 3 вечера в неделю на сторис и посты. Сейчас за 20 минут утром у меня готов план на 2 недели — и охваты выросли в 2,4 раза.',
    avatar: 'А',
    color: 'from-pink-400 to-rose-500',
  },
  {
    name: 'Дмитрий М.',
    role: 'SMM-агентство, 18 клиентов',
    text: 'PostPilot заменил нам 2 копирайтеров и дизайнера. Клиенты в шоке от стабильности контента — и мы наконец перестали выгорать.',
    avatar: 'Д',
    color: 'from-indigo-400 to-purple-500',
  },
  {
    name: 'Кристина Р.',
    role: 'фитнес-блогер, 240k',
    text: 'ИИ пишет так, будто слышал, как я говорю в сторис. Reels клепаю одной кнопкой — Instagram любит, аудитория растёт.',
    avatar: 'К',
    color: 'from-orange-400 to-amber-500',
  },
]

const faqs = [
  {
    q: 'Это правда работает с Instagram и Facebook?',
    a: 'Да. Мы используем официальные Graph API Meta и партнёрские интеграции с TikTok, X, LinkedIn, YouTube, Telegram и Threads. Никаких рисков для аккаунта — всё по правилам платформ.',
  },
  {
    q: 'Сколько постов в день можно публиковать?',
    a: 'На тарифе «Профи» лимит на ИИ-генерации снят. Технически вы можете публиковать столько, сколько разрешает каждая платформа (например, до 25 постов/день в Instagram).',
  },
  {
    q: 'Я могу редактировать посты перед публикацией?',
    a: 'Конечно. По умолчанию мы показываем превью каждого поста — вы можете утвердить, отредактировать или попросить ИИ переписать в один клик. Можно также включить полный автопилот.',
  },
  {
    q: 'А как с разными языками и стилем бренда?',
    a: 'Мы поддерживаем 40+ языков и сохраняем ваш tone of voice: вы один раз описываете бренд (или загружаете старые посты), и ИИ пишет в этом стиле всегда.',
  },
  {
    q: 'Можно ли отменить подписку?',
    a: 'Да, в один клик из личного кабинета. Без звонков, без удержаний. Деньги за неиспользованный период вернём по запросу.',
  },
  {
    q: 'Мои данные в безопасности?',
    a: 'Шифрование TLS 1.3, хранение в ЕС, SOC 2 Type II, GDPR-совместимость. Ваш контент не используется для обучения сторонних моделей.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-white/10 py-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-lg font-medium text-white">{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-white/60 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`grid overflow-hidden transition-all duration-300 ${
          open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0">
          <p className="text-white/70">{a}</p>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0a0613] text-white antialiased">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-10%] h-[520px] w-[520px] rounded-full bg-purple-600/30 blur-[120px] animate-pulse-glow" />
        <div className="absolute right-[-10%] top-[20%] h-[480px] w-[480px] rounded-full bg-pink-500/25 blur-[120px] animate-pulse-glow" />
        <div className="absolute left-[20%] top-[60%] h-[420px] w-[420px] rounded-full bg-orange-500/20 blur-[120px] animate-pulse-glow" />
      </div>

      {/* Header */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all ${
          scrolled
            ? 'border-b border-white/10 bg-[#0a0613]/80 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="#top" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 shadow-lg shadow-purple-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              PostPilot<span className="text-purple-400">.ai</span>
            </span>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-white/70 hover:text-white transition">
              Возможности
            </a>
            <a href="#how" className="text-sm text-white/70 hover:text-white transition">
              Как это работает
            </a>
            <a href="#pricing" className="text-sm text-white/70 hover:text-white transition">
              Тарифы
            </a>
            <a href="#faq" className="text-sm text-white/70 hover:text-white transition">
              FAQ
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href="#login"
              className="text-sm text-white/70 hover:text-white transition"
            >
              Войти
            </a>
            <a
              href="#cta"
              className="group relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition hover:shadow-pink-500/40"
            >
              Начать бесплатно
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <button
            className="rounded-lg p-2 text-white/80 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="menu"
          >
            {mobileOpen ? <XIcon className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/10 bg-[#0a0613]/95 px-5 py-4 md:hidden">
            <nav className="flex flex-col gap-4">
              <a href="#features" onClick={() => setMobileOpen(false)} className="text-white/80">
                Возможности
              </a>
              <a href="#how" onClick={() => setMobileOpen(false)} className="text-white/80">
                Как это работает
              </a>
              <a href="#pricing" onClick={() => setMobileOpen(false)} className="text-white/80">
                Тарифы
              </a>
              <a href="#faq" onClick={() => setMobileOpen(false)} className="text-white/80">
                FAQ
              </a>
              <a
                href="#cta"
                onClick={() => setMobileOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-5 py-3 text-sm font-semibold"
              >
                Начать бесплатно
                <ArrowRight className="h-4 w-4" />
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section id="top" className="relative pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-purple-300" />
                Новый GPT-движок · Reels от ИИ · 8 соцсетей
              </div>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-[68px]">
                ИИ, который сам пишет и публикует посты в{' '}
                <span className="gradient-text">Instagram, Facebook</span> и других соцсетях
              </h1>

              <p className="mt-6 max-w-xl text-lg text-white/70 md:text-xl">
                Опишите идею — получите готовый контент-план на месяц.
                PostPilot.ai пишет тексты, генерирует картинки и Reels, а потом сам
                публикует всё в нужное время. Быстро, автоматически, в вашем стиле.
              </p>

              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
                <a
                  href="#cta"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-purple-500/30 transition hover:shadow-pink-500/40"
                >
                  Запустить автопостинг
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-base font-medium text-white/90 backdrop-blur hover:bg-white/10"
                >
                  <Play className="h-4 w-4" />
                  Посмотреть демо · 60 сек
                </a>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/60">
                <div className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-green-400" /> 7 дней бесплатно
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-green-400" /> Без карты
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-green-400" /> Отмена в один клик
                </div>
              </div>

              <div className="mt-10 flex items-center gap-4">
                <div className="flex -space-x-2">
                  {['from-pink-400 to-rose-500', 'from-indigo-400 to-purple-500', 'from-orange-400 to-amber-500', 'from-cyan-400 to-blue-500'].map(
                    (c, i) => (
                      <div
                        key={i}
                        className={`h-9 w-9 rounded-full border-2 border-[#0a0613] bg-gradient-to-br ${c} flex items-center justify-center text-xs font-semibold`}
                      >
                        {['А', 'Д', 'К', 'М'][i]}
                      </div>
                    ),
                  )}
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-1 text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current" />
                    ))}
                    <span className="ml-1 font-semibold text-white">4.9</span>
                  </div>
                  <div className="text-white/60">12 400+ авторов и брендов</div>
                </div>
              </div>
            </div>

            {/* Hero visual: mock app + post card */}
            <div className="relative">
              <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-orange-400/20 blur-2xl" />
              <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl shadow-2xl shadow-purple-900/40">
                {/* Top toolbar */}
                <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                  </div>
                  <div className="text-xs text-white/50">postpilot.ai · контент-план</div>
                  <div className="text-xs text-purple-300">сегодня</div>
                </div>

                {/* Prompt input */}
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs uppercase tracking-wider text-white/40">
                        Промпт
                      </div>
                      <div className="mt-1 text-sm text-white/90">
                        «Запусти контент-план на неделю про новую коллекцию
                        ароматов. Стиль — тёплый, личный, с эмодзи. Все соцсети.»
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      {['Instagram', 'Facebook', 'TikTok', 'X', '+4'].map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <button className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1.5 text-xs font-semibold">
                      <Wand2 className="h-3.5 w-3.5" />
                      Сгенерировать
                    </button>
                  </div>
                </div>

                {/* Generated post preview */}
                <div className="mt-5 grid gap-3 md:grid-cols-5">
                  <div className="md:col-span-2">
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500 via-rose-400 to-orange-300">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.4),transparent_60%)]" />
                      <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/30 px-3 py-2 backdrop-blur">
                        <div className="text-[10px] uppercase tracking-wider text-white/70">
                          Aurora · Limited
                        </div>
                        <div className="text-sm font-semibold">
                          Запах нового сезона
                        </div>
                      </div>
                      <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] backdrop-blur">
                        AI · v2
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-400">
                          <Instagram className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold">@aurora.beauty</div>
                          <div className="text-[10px] text-white/50">
                            запланировано · сегодня, 19:00
                          </div>
                        </div>
                        <div className="ml-auto rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-300">
                          ● готово
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-white/85">
                        Новая коллекция Aurora — ароматы, в которых хочется
                        проснуться 🌅 Лёгкий бергамот, тёплая ваниль и нотка
                        дождя по утру. Какой запах ваш? ✨
                      </p>
                      <p className="mt-2 text-xs text-purple-300/90">
                        #ароматы #parfum #aurora #новаяколлекция
                      </p>

                      <div className="mt-3 flex items-center gap-4 text-xs text-white/60">
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5" /> 1,2k
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3.5 w-3.5" /> 86
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Repeat2 className="h-3.5 w-3.5" /> 38
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Bookmark className="h-3.5 w-3.5" /> 254
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1">
                          <Share2 className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                        <div className="text-white/50">Охват</div>
                        <div className="text-base font-semibold text-white">+248%</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                        <div className="text-white/50">Engagement</div>
                        <div className="text-base font-semibold text-white">9,4%</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                        <div className="text-white/50">Время</div>
                        <div className="text-base font-semibold text-white">12 сек</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating chips */}
              <div className="absolute -right-4 -top-4 hidden animate-float-slow rounded-2xl border border-white/10 bg-[#0a0613]/80 px-4 py-3 shadow-xl backdrop-blur md:block">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-orange-400">
                    <Rocket className="h-4 w-4" />
                  </div>
                  <div className="text-xs">
                    <div className="font-semibold text-white">Опубликовано в 8 соцсетях</div>
                    <div className="text-white/50">за 2,4 секунды</div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-4 -left-4 hidden animate-float-slow rounded-2xl border border-white/10 bg-[#0a0613]/80 px-4 py-3 shadow-xl backdrop-blur md:block">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                  <div className="text-xs">
                    <div className="font-semibold text-white">Контент-план готов</div>
                    <div className="text-white/50">28 постов · 4 недели</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logo / platform strip */}
      <section className="relative border-y border-white/10 bg-white/[0.02] py-10">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <p className="text-center text-sm uppercase tracking-[0.2em] text-white/50">
            Постит везде, где есть ваша аудитория
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {platforms.map(({ name, Icon, color }) => (
              <div
                key={name}
                className="group flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/25 hover:bg-white/[0.05]"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${color}`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="text-xs font-medium text-white/80">{name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
              <Bot className="h-3.5 w-3.5 text-purple-300" />
              Возможности
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">
              Один ИИ заменяет копирайтера, дизайнера и SMM-менеджера
            </h2>
            <p className="mt-4 text-lg text-white/70">
              PostPilot не просто пишет тексты. Он строит стратегию,
              генерирует креатив, постит и анализирует — пока вы делаете то, что
              действительно важно.
            </p>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {features.map(({ Icon, title, desc }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/25 hover:bg-white/[0.05]"
              >
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 opacity-0 blur-2xl transition group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 ring-1 ring-white/10">
                    <Icon className="h-5 w-5 text-purple-300" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm text-white/65">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative py-24 md:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
              <Zap className="h-3.5 w-3.5 text-pink-300" />
              Как это работает
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">
              От идеи до публикации — за 4 минуты
            </h2>
            <p className="mt-4 text-lg text-white/70">
              Никаких сложных дашбордов и тысячи настроек. Запустите автопостинг
              быстрее, чем закажете кофе.
            </p>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div
                key={s.n}
                className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6"
              >
                <div className="text-sm font-semibold text-purple-300">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/65">{s.desc}</p>
                {i < steps.length - 1 && (
                  <ArrowRight className="absolute right-4 top-6 hidden h-5 w-5 text-white/20 lg:block" />
                )}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="mt-20 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { v: '12 400+', l: 'авторов и брендов' },
              { v: '8', l: 'соцсетей в одном клике' },
              { v: '×3,4', l: 'рост охвата за 30 дней' },
              { v: '14 ч', l: 'экономии в неделю' },
            ].map((s) => (
              <div key={s.l} className="bg-[#0a0613] p-7 text-center">
                <div className="bg-gradient-to-r from-purple-300 via-pink-300 to-orange-300 bg-clip-text text-3xl font-semibold text-transparent md:text-4xl">
                  {s.v}
                </div>
                <div className="mt-1 text-sm text-white/60">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo / showcase strip */}
      <section id="demo" className="relative py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-orange-400/10 p-8 md:p-14">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
                  <Play className="h-3.5 w-3.5 text-pink-300" />
                  Живое демо · 60 секунд
                </div>
                <h2 className="mt-5 text-3xl font-semibold md:text-4xl">
                  Посмотрите, как ИИ ведёт ваш Instagram сам
                </h2>
                <p className="mt-4 text-white/70">
                  От промпта до десяти опубликованных постов в Instagram, Facebook,
                  TikTok и X. Без редакторов. Без таймеров. Без головной боли.
                </p>

                <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row">
                  <a
                    href="#cta"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90"
                  >
                    Запустить у себя
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="#cta"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white hover:bg-white/10"
                  >
                    Получить демо для команды
                  </a>
                </div>
              </div>

              <div className="relative">
                <div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                  <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.35),transparent_60%)]">
                    <button className="group flex h-20 w-20 items-center justify-center rounded-full bg-white text-black shadow-2xl shadow-purple-500/30 transition hover:scale-105">
                      <Play className="ml-1 h-7 w-7 fill-current" />
                    </button>
                  </div>
                </div>
                <div className="absolute inset-x-6 -bottom-3 h-6 rounded-b-2xl bg-purple-500/40 blur-xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
              <Heart className="h-3.5 w-3.5 text-pink-400" />
              Любят 12 400+ авторов
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">
              Контент, которым гордятся бренды
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="flex items-center gap-1 text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-white/85">«{t.text}»</p>
                <div className="mt-5 flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${t.color} font-semibold`}
                  >
                    {t.avatar}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-white/55">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
              <Rocket className="h-3.5 w-3.5 text-orange-300" />
              Тарифы
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">
              Начните бесплатно. Платите, только когда увидите результат
            </h2>
            <p className="mt-4 text-lg text-white/70">
              Без скрытых платежей. Можно отменить в один клик. Любой тариф — 7
              дней бесплатно.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {pricing.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  p.highlight
                    ? 'border-transparent bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-orange-400/15 ring-1 ring-purple-400/40'
                    : 'border-white/10 bg-white/[0.03]'
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 text-xs font-semibold">
                    Популярный выбор
                  </div>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-white/60">{p.desc}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">
                    {p.price}
                  </span>
                  <span className="text-sm text-white/55">{p.period}</span>
                </div>
                <a
                  href="#cta"
                  className={`mt-6 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                    p.highlight
                      ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white shadow-lg shadow-purple-500/30 hover:shadow-pink-500/40'
                      : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  {p.cta}
                  <ArrowRight className="h-4 w-4" />
                </a>

                <ul className="mt-7 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-white/80">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative py-24">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
              <MessageCircle className="h-3.5 w-3.5 text-cyan-300" />
              FAQ
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">
              Частые вопросы
            </h2>
          </div>

          <div className="mt-10">
            {faqs.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="cta" className="relative py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-purple-600/30 via-pink-500/20 to-orange-400/20 p-10 md:p-16">
            <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-purple-500/40 blur-3xl" />
            <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-orange-400/40 blur-3xl" />

            <div className="relative grid items-center gap-10 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
                  Запустите автопостинг сегодня. Завтра соцсети будут вести
                  себя сами.
                </h2>
                <p className="mt-4 text-white/80">
                  Подключите Instagram и Facebook за минуту, получите контент-план
                  на 7 дней — бесплатно. Без карты, без созвона.
                </p>
              </div>

              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <input
                  type="email"
                  required
                  placeholder="ваш@email.com"
                  className="w-full rounded-full border border-white/15 bg-white/10 px-5 py-3.5 text-sm text-white placeholder-white/50 backdrop-blur outline-none focus:border-white/40"
                />
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  Запустить бесплатно
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/10 bg-[#070411] py-12">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-2">
              <a href="#top" className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-semibold">
                  PostPilot<span className="text-purple-400">.ai</span>
                </span>
              </a>
              <p className="mt-4 max-w-md text-sm text-white/55">
                ИИ-сервис автопостинга в Instagram, Facebook, TikTok, X, LinkedIn,
                YouTube, Telegram и Threads. Создан в 2025, чтобы вы наконец
                перестали думать про контент.
              </p>
            </div>

            <div>
              <div className="text-sm font-semibold text-white">Продукт</div>
              <ul className="mt-3 space-y-2 text-sm text-white/55">
                <li><a href="#features" className="hover:text-white">Возможности</a></li>
                <li><a href="#pricing" className="hover:text-white">Тарифы</a></li>
                <li><a href="#how" className="hover:text-white">Как это работает</a></li>
                <li><a href="#faq" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>

            <div>
              <div className="text-sm font-semibold text-white">Компания</div>
              <ul className="mt-3 space-y-2 text-sm text-white/55">
                <li><a href="#" className="hover:text-white">О нас</a></li>
                <li><a href="#" className="hover:text-white">Блог</a></li>
                <li><a href="#" className="hover:text-white">Контакты</a></li>
                <li><a href="#" className="hover:text-white">Политика данных</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
            <div className="text-xs text-white/40">
              © {new Date().getFullYear()} PostPilot AI. Все права защищены.
            </div>
            <div className="flex items-center gap-3">
              {platforms.slice(0, 6).map(({ name, Icon }) => (
                <a
                  key={name}
                  href="#"
                  aria-label={name}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
