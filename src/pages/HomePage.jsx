/**
 * HomePage.jsx - The public landing page: what ArcheSpace is, its features,
 * how it works (what the server stores, and checking what you run), how to
 * get in touch, and a compact footer.
 * Left-aligned and plain, on the always-dark landing palette.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlignLeft,
  ArchiveRestore,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  CheckSquare,
  FileDown,
  Fingerprint,
  FolderTree,
  GitCommitHorizontal,
  HardDrive,
  Layers,
  LockKeyhole,
  Mail,
  Menu,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react'
import { APP_VERSION, COMMIT_URL, MOBILE_REPO_URL, REPO_URL } from '../lib/buildInfo'
import { enterLocalMode } from '../lib/localMode'

function GithubMark({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.27-5.23-5.67 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18.92-.26 1.9-.38 2.88-.39.98.01 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.64 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.66.41.36.78 1.06.78 2.14v3.18c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

/**
 * A still picture of the app beside the hero: a few item cards in its look
 * (fixed colours, as the landing page is always dark). Decorative, so hidden
 * from screen readers; wide screens only, so the text stays first elsewhere.
 */
function HeroPreview() {
  const card = 'rounded-2xl bg-[#141a20] shadow-[0_12px_32px_-14px_rgba(0,0,0,0.7)]'
  const head = 'flex items-center gap-2 border-b border-white/5 px-4 py-2.5 text-sm font-medium text-white'
  const badge = (Icon, tone) => (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tone}`}>
      <Icon size={13} />
    </span>
  )
  return (
    <div aria-hidden="true" className="hidden select-none xl:block">
      <div className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 flex-1 items-center gap-2 rounded-full bg-[#141a20] px-3 text-xs text-white/40">
            <Search size={12} /> Search...
          </div>
          <div className="flex h-8 items-center gap-1 rounded-lg bg-emerald-300 px-3 text-xs font-semibold text-[#0c1a16]">
            <Plus size={12} strokeWidth={2.5} /> New
          </div>
        </div>
        <div className="space-y-3">
          <div className={card}>
            <div className={head}>
              {badge(CheckSquare, 'bg-[#4ade80]/10 text-[#4ade80]')}
              Trip plan
              <span className="ml-auto text-xs text-white/40">2/3 done</span>
            </div>
            <ul className="space-y-2 px-4 py-3 text-sm">
              {[['Book flights', true], ['Renew passport', true], ['Pack the charger', false]].map(([label, done]) => (
                <li key={label} className="flex items-center gap-2.5">
                  <span className={`flex h-4 w-4 items-center justify-center rounded ${done ? 'bg-emerald-300 text-[#0c1a16]' : 'ring-1 ring-white/25'}`}>
                    {done && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className={done ? 'text-white/40 line-through' : 'text-white/85'}>{label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={card}>
              <div className={head}>{badge(AlignLeft, 'bg-[#60a5fa]/10 text-[#60a5fa]')}Ideas</div>
              <p className="m-3 rounded-xl bg-[#0f1419] px-3 py-2.5 text-xs leading-relaxed text-white/60">
                A reading list to share, and a weekend for the garden.
              </p>
            </div>
            <div className={card}>
              <div className={head}>
                {badge(AlignLeft, 'bg-[#60a5fa]/10 text-[#60a5fa]')}
                <span className="truncate">Bank details</span>
              </div>
              <div className="m-3 flex flex-col items-center gap-1 rounded-xl bg-[#0f1419] py-3 text-white/45">
                <ShieldCheck size={16} />
                <span className="text-xs">Protected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// One primary and one quiet style, reused for every call to action.
const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-[#0c1a16] hover:bg-emerald-200 transition-colors'
const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15 transition-colors'
const navLink =
  'rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white transition-colors'

// The Android app, linked under the hero's buttons: the latest APK release for
// now (swap in the Play Store listing once it's live).
const ANDROID_APP_URL = `${MOBILE_REPO_URL}/releases/latest`

// Section links shown in the header (desktop) and the mobile menu.
const navSections = [
  { id: 'top', href: '#top', label: 'Home' },
  { id: 'features', href: '#features', label: 'Features' },
  { id: 'how-it-works', href: '#how-it-works', label: 'How It Works' },
  { id: 'contact', href: '#contact', label: 'Contact' },
]

// Every feature worth knowing about, each in a line.
const features = [
  { icon: FolderTree, title: 'Spaces', desc: 'Group everything into spaces with sub-spaces as deep as you like, with colours, tags and pins.' },
  { icon: Layers, title: 'Item types', desc: 'Notes, rich text, lists, checklists, cards, tables, Kanban boards, code and whiteboards; star, copy, duplicate or move any of them.' },
  { icon: Search, title: 'Search', desc: 'Find anything across all your spaces, and filter by tag.' },
  { icon: BellRing, title: 'Reminders', desc: 'Once, repeating, or until you turn them off, with notifications and a list of them all.' },
  { icon: HardDrive, title: 'No account needed', desc: 'Use it without signing up; everything stays encrypted on your device, with no server at all.' },
  { icon: ShieldCheck, title: 'Protected and read-only', desc: 'Hide sensitive items and spaces until your vault PIN opens them, and freeze a space against edits.' },
  { icon: Fingerprint, title: 'Biometrics and two-factor', desc: 'Unlock with a fingerprint, face or passkey, and add authenticator codes at sign-in.' },
  { icon: RefreshCw, title: 'Sync and offline', desc: 'Syncs across your devices, and keeps working without a connection.' },
  { icon: FileDown, title: 'Backups and export', desc: 'Encrypted backup files, and PDF export of a space or an item.' },
  { icon: ArchiveRestore, title: 'Starred, archive and bin', desc: 'Star what matters, archive what is done, and restore what you deleted.' },
  { icon: Palette, title: 'Themes and shortcuts', desc: 'Dark and light themes with accents, a command palette and keyboard shortcuts.' },
  { icon: Server, title: 'Open source and self-hostable', desc: 'MIT licensed; host it yourself on your own Supabase project.' },
]

const steps = [
  {
    step: '01',
    title: 'Sign up, or skip it',
    body: 'Create an account to sync across your devices, or use ArcheSpace without one and keep everything on this device. Neither unlocks your content yet.',
  },
  {
    step: '02',
    title: 'Set your vault key',
    body: 'Choose a PIN or passphrase. It becomes your encryption key on your device and is never sent to the server, so not even we can see it.',
  },
  {
    step: '03',
    title: 'Start capturing',
    body: 'Add notes, lists, code, whiteboards and more. Everything is encrypted on your device before it is saved, and reads back plainly wherever you unlock it.',
  },
]

const serverFacts = [
  'Two separate secrets: your login proves who you are, your vault key unlocks your content.',
  'Your vault key is created on your device and never leaves it.',
  'We store only unreadable ciphertext plus plain metadata: ids, timestamps, and order.',
  'There is no reset link and no backdoor. Lose both your PIN and recovery code, and the data can never be unlocked again.',
  'Without an account there is no server at all: everything stays on your device.',
]

/** A section heading: a plain title and an optional one-line intro. */
function SectionHeading({ title, children }) {
  return (
    <div className="reveal max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-normal sm:text-3xl">{title}</h2>
      {children ? <p className="mt-3 max-w-xl text-sm leading-6 text-white/62">{children}</p> : null}
    </div>
  )
}

export default function HomePage() {
  const [activeSection, setActiveSection] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuToggleRef = useRef(null)
  const headerRef = useRef(null)
  const year = new Date().getFullYear()

  // Mobile menu: close on Escape (returning focus to the toggle) or an outside
  // click, and lock body scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuToggleRef.current?.focus()
      }
    }
    const onPointerDown = event => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      document.body.style.overflow = prevOverflow
    }
  }, [menuOpen])

  // Scroll-reveal for sections, the active nav link, and the header's glass
  // once the hero has scrolled behind it. Under reduced motion everything is
  // shown up front.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    // Smooth-scroll anchor jumps while the landing page is mounted (restored on
    // unmount so in-app routing is unaffected).
    const root = document.documentElement
    const prevScrollBehavior = root.style.scrollBehavior
    if (!reduce) root.style.scrollBehavior = 'smooth'

    let pending = Array.from(document.querySelectorAll('.reveal, .reveal-stagger'))
    const sections = navSections.map(s => document.getElementById(s.id)).filter(Boolean)
    const hero = document.getElementById('top')

    if (reduce) {
      pending.forEach(el => el.classList.add('is-visible'))
      pending = []
    }

    let ticking = false
    const update = () => {
      ticking = false
      const vh = window.innerHeight || document.documentElement.clientHeight

      for (let i = pending.length - 1; i >= 0; i--) {
        const rect = pending[i].getBoundingClientRect()
        if (rect.top < vh * 0.88 && rect.bottom > 0) {
          pending[i].classList.add('is-visible')
          pending.splice(i, 1)
        }
      }

      const line = vh * 0.35
      let active = null
      for (const section of sections) {
        const rect = section.getBoundingClientRect()
        if (rect.top <= line && rect.bottom >= line) {
          active = section.id
          break
        }
      }
      setActiveSection(prev => (prev === active ? prev : active))

      const glass = hero ? hero.getBoundingClientRect().bottom <= 72 : false
      setScrolled(prev => (prev === glass ? prev : glass))
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        window.requestAnimationFrame(update)
      }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      root.style.scrollBehavior = prevScrollBehavior
    }
  }, [])

  return (
    <main className="home-page min-h-screen bg-[#0f1117] text-white">
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-emerald-300 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0c1a16]"
      >
        Skip to content
      </a>

      {/* Header */}
      <header
        ref={headerRef}
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          scrolled || menuOpen
            ? 'border-b border-white/5 bg-[#0f1117]/80 backdrop-blur-md'
            : 'border-b border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* The name as in the emails: caps, ARCHE in the mint accent. */}
          <a
            href="#top"
            aria-label="ArcheSpace"
            className="shrink-0 rounded-lg text-2xl font-bold leading-tight tracking-[0.03em] text-[#32d3aa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            ARCHE<span className="text-white">SPACE</span>
          </a>

          <nav className="hidden items-center gap-1 lg:flex">
            {navSections.map(section => (
              <a
                key={section.id}
                href={section.href}
                aria-current={activeSection === section.id ? 'true' : undefined}
                className={`${navLink} ${activeSection === section.id ? 'text-white' : ''}`}
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              ref={menuToggleRef}
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="home-mobile-menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/15"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="home-mobile-menu" className="border-t border-white/10 lg:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col px-4 py-2 sm:px-6">
              {navSections.map(section => (
                <a
                  key={section.id}
                  href={section.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-2 py-3 text-sm text-white/70 transition-colors hover:text-white"
                >
                  {section.label}
                </a>
              ))}
</nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section id="top" className="relative flex min-h-[100svh] items-center overflow-hidden px-4 pb-24 pt-28 sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(50,211,170,0.14),transparent_55%),linear-gradient(180deg,#0f1117_0%,#12151d_100%)]" />
        <div className="hero-enter relative z-10 mx-auto w-full max-w-6xl xl:grid xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-center xl:gap-14">
          <div>
          {/* Size carries the emphasis: a quiet lead-in, then the key words
              large and bright (no second colour to compete with the buttons). */}
          <h1 className="tracking-[-0.025em]">
            <span className="block text-[clamp(1.5rem,min(6.6vw,6.8vh),2.625rem)] font-medium leading-tight text-white/65">
              Everything in One{' '}
            </span>
            <span className="mt-1 block text-[clamp(2rem,min(9.4vw,11.6vh),4.5rem)] font-bold leading-[1.02] text-white">
              Encrypted Space
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/65 sm:text-[17px] sm:leading-[30px]">
            An open-source, zero-knowledge encrypted space to capture and organise your notes,
            projects, secrets, code, checklists and ideas, synced across all your devices.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/signup" className={`${btnPrimary} sm:px-6 sm:py-3`}>
              Get started
              <ArrowRight size={16} />
            </Link>
            <Link to="/login" className={`${btnGhost} sm:px-6 sm:py-3`}>
              Sign in
            </Link>
          </div>

          {/* Other ways in, set apart from the main actions by a hairline. */}
          <div className="mt-10 max-w-md space-y-1 border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={enterLocalMode}
              className="group flex min-h-[44px] w-full items-center gap-3 text-left text-sm font-medium text-emerald-200 transition-colors hover:text-emerald-100"
            >
              <HardDrive size={16} className="shrink-0" />
              <span>
                Try it without an account
                <span className="block text-xs font-normal text-white/50">
                  No sign-up; everything stays encrypted on your device.
                </span>
              </span>
              <ArrowRight size={14} className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
            <a
              href={ANDROID_APP_URL}
              target="_blank"
              rel="noreferrer"
              className="group flex min-h-[44px] w-full items-center gap-3 text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              <Smartphone size={16} className="shrink-0 text-white/55" />
              Get the Android app
              <ArrowRight size={14} className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
          </div>
          <HeroPreview />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-white/5 bg-[#101820] px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title="Features" />

          <ul className="reveal mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <Icon size={18} className="mt-0.5 shrink-0 text-emerald-200" />
                <div>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-white/62">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works, ending with what the server stores */}
      <section id="how-it-works" className="scroll-mt-20 bg-[#0f1117] px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title="How It Works" />

          <ol className="reveal-stagger mt-10 grid gap-4 md:grid-cols-3">
            {steps.map(({ step, title, body }, i) => (
              <li key={step} className="rounded-2xl bg-white/[0.05] p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="text-lg font-semibold text-white">{title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/62">{body}</p>
              </li>
            ))}
          </ol>

          <div className="reveal mt-12">
            <h3 className="text-lg font-semibold text-white">What the Server Stores</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/62">
              Your vault key never reaches us, so nothing on the server can be read by us or
              anyone else.
            </p>

            <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-200/[0.08] p-5">
                  <p className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
                    <CheckCircle2 size={14} />
                    What you see
                  </p>
                  <div className="mt-4 space-y-2.5">
                    <p className="text-sm font-semibold text-white">Q3 launch plan</p>
                    <p className="text-xs leading-5 text-white/60">
                      Pricing review, then the migration checklist
                    </p>
                    <div className="flex items-center gap-2 pt-1 text-xs text-white/60">
                      <CheckCircle2 size={13} className="text-emerald-300" />
                      Draft announcement
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.05] p-5">
                  <p className="flex items-center gap-2 text-xs font-semibold text-white/60">
                    <LockKeyhole size={14} />
                    What we store
                  </p>
                  <div className="mt-4 space-y-2 break-all font-mono text-[11px] leading-5 text-white/35">
                    <p>arc1:9tGf2xQ.8kZp1vLm4Rd0</p>
                    <p>arc1:Wq7hB3n.Yc6sT2eJ9uXa</p>
                    <p>arc1:Kd4mV8r.Pz5nQ1wE7bHt</p>
                  </div>
                  <p className="mt-4 text-[11px] leading-5 text-white/65">The same three items.</p>
                </div>
              </div>

              <ul className="space-y-3">
                {serverFacts.map(fact => (
                  <li key={fact} className="flex items-start gap-3 rounded-lg bg-white/[0.05] p-4">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-200" />
                    <span className="text-sm leading-6 text-white/72">{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="reveal mt-12">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <GitCommitHorizontal size={18} className="shrink-0 text-emerald-200" />
              Check What You Run
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/62">
              Settings shows the exact commit your browser is running, so you can confirm that
              what ships is what&apos;s published.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-200 hover:underline"
              >
                <GithubMark size={15} />
                Web app source
              </a>
              <a
                href={MOBILE_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-200 hover:underline"
              >
                <GithubMark size={15} />
                Mobile app source
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="scroll-mt-20 border-t border-white/5 bg-[#0b0d11] px-4 py-14 sm:px-6">
        <div className="reveal mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-12">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Contact</h2>
            <p className="mt-3 text-sm leading-6 text-white/62">
              Write to us about setup or sign-in, your vault and recovery, a bug, or an idea.
              For a bug, tell us what happened, the app version (in Settings or the footer) and
              whether it was on web or Android.
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-white/55">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-emerald-200" />
              Never send your vault PIN, recovery code or password. We never ask for them, and
              they couldn&apos;t help us read your data anyway.
            </p>
          </div>
          <a href="mailto:support@archespace.app" className={`shrink-0 self-start md:self-auto ${btnGhost}`}>
            <Mail size={16} className="text-emerald-200" />
            support@archespace.app
          </a>
        </div>
      </section>

      {/* Footer: credits, then the policy links and version */}
      <footer className="border-t border-white/10 bg-[#0d0f14] px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-white/65 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} · Created and maintained by{' '}
            <a href="https://github.com/wyserian" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              Wyserian
            </a>
          </p>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
            <a href={`${REPO_URL}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              Security
            </a>
            <a href={COMMIT_URL} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              v{APP_VERSION}
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}
