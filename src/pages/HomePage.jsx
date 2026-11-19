/**
 * HomePage.jsx - The public landing page: what ArcheSpace is, why it exists
 * and what it offers, how it works (what the server stores, and checking what
 * you run), how to get in touch, and a compact footer.
 * Left-aligned and plain, on the always-dark landing palette.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronsLeft,
  Command,
  Download,
  FileDown,
  Fingerprint,
  FolderTree,
  GitCommitHorizontal,
  HardDrive,
  Hourglass,
  Keyboard,
  Layers,
  LayoutGrid,
  List,
  Lock,
  LockKeyhole,
  Mail,
  Menu,
  MoreVertical,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  SquareCheck,
  Star,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { TypeBadge } from '../components/ui/TypeBadge'
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

// One primary and one quiet style, reused for every call to action.
const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-[#0c1a16] hover:bg-emerald-200 transition-colors'
const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15 transition-colors'
const navLink =
  'rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white transition-colors'
// A quiet tile link (the hero's other ways in, the source links).
const tileClass =
  'flex min-h-[44px] items-center gap-3 rounded-xl bg-white/[0.05] p-3.5 text-left transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300'

// The Android app, under the hero's buttons: the Worker's /download/android
// redirects to the latest release's arm64 APK (worker/index.js).
const ANDROID_APP_URL = '/download/android'

// Section links shown in the header (desktop) and the mobile menu.
const navSections = [
  { id: 'why', href: '#why', label: 'Why' },
  { id: 'how-it-works', href: '#how-it-works', label: 'How' },
  { id: 'contact', href: '#contact', label: 'Contact' },
]

// The kinds of item a space holds, shown in Why with their real type badges.
const itemKinds = [
  ['textbox', 'Note'],
  ['richtext', 'Rich text'],
  ['menu_list', 'List'],
  ['checkbox_list', 'Checklist'],
  ['table', 'Table'],
  ['kanban', 'Kanban board'],
  ['code', 'Code'],
  ['whiteboard', 'Whiteboard'],
]

// Every feature worth knowing about, each in a line.
const features = [
  { icon: FolderTree, title: 'Spaces', desc: 'Spaces inside spaces, as deep as you like, with colours, tags and pins.' },
  { icon: Layers, title: 'Item types', desc: 'Notes, rich text, lists, checklists, cards, tables, Kanban boards, code and whiteboards.' },
  { icon: Search, title: 'Search', desc: 'Find anything across all your spaces, and filter by tag.' },
  { icon: BellRing, title: 'Reminders', desc: 'One-off or repeating notifications, all in one list.' },
  { icon: HardDrive, title: 'No account needed', desc: 'Use it without signing up; everything stays encrypted on your device.' },
  { icon: ShieldCheck, title: 'Protected, read-only, self-destruct', desc: 'Keep items behind your PIN, freeze a space against edits, or have one delete itself on time.' },
  { icon: Fingerprint, title: 'Biometrics and two-factor', desc: 'Unlock with a fingerprint, face or passkey; authenticator codes at sign-in.' },
  { icon: RefreshCw, title: 'Sync and offline', desc: 'Synced across your devices, and fully usable offline.' },
  { icon: FileDown, title: 'Backups and export', desc: 'Encrypted backups that restore on web or mobile, and PDF export.' },
  { icon: ArchiveRestore, title: 'Starred, archive and bin', desc: "Star what matters, archive what's done, restore what you deleted." },
  { icon: Undo2, title: 'Undo, shortcuts and themes', desc: 'Undo and redo edits, a command palette, keyboard shortcuts, and dark and light themes.' },
  { icon: Server, title: 'Open source and self-hostable', desc: 'MIT licensed; host it on your own Supabase project.' },
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
  'We store only unreadable ciphertext plus plain metadata: ids, timestamps, and order.',
  'There is no reset link and no backdoor. Lose both your PIN and recovery code, and the data can never be unlocked again.',
]

/** A section heading: a plain title and an optional one-line intro. */
function SectionHeading({ title, children }) {
  return (
    <div className="reveal max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-normal sm:text-3xl">{title}</h2>
      {children ? <p className="mt-3 max-w-xl text-[15px] leading-6 text-white/62 sm:text-sm">{children}</p> : null}
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

          <div className="hidden items-center gap-1 lg:flex">
            <nav className="flex items-center gap-1">
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
            {/* Account actions where people look for them. */}
            <Link to="/login" className={`${navLink} ml-3`}>Sign in</Link>
            <Link to="/signup" className={`${btnPrimary} ml-1 px-4 py-2`}>Get started</Link>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              ref={menuToggleRef}
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="home-mobile-menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/15"
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
              <div className="mt-2 flex gap-3 border-t border-white/10 pt-4 pb-2">
                <Link to="/signup" className={`${btnPrimary} min-h-11`}>Get started</Link>
                <Link to="/login" className={`${btnGhost} min-h-11`}>Sign in</Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section id="top" className="relative flex min-h-[100svh] items-center overflow-hidden px-4 pb-24 pt-28 sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(50,211,170,0.14),transparent_55%),linear-gradient(180deg,#0f1117_0%,#12151d_100%)]" />
        <div className="hero-enter relative z-10 mx-auto w-full max-w-6xl">
          {/* Two lines on a phone, one line from the sm width up: a quiet
              lead-in, then the key words bright (no second colour to compete
              with the buttons). */}
          <h1 className="text-[clamp(1.75rem,8.5vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.025em] text-white sm:whitespace-nowrap sm:text-[clamp(1.25rem,min(6vw,9vh),3.5rem)] sm:leading-[1.05]">
            <span className="block font-medium text-white/65 sm:inline">Everything in</span>{' '}Private Space
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
            Notes, projects, snippets and drawings, organized like a file manager.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/signup" className={`${btnPrimary} min-h-11 sm:px-6 sm:py-3`}>
              Get started
              <ArrowRight size={16} />
            </Link>
            <Link to="/login" className={`${btnGhost} min-h-11 sm:px-6 sm:py-3`}>
              Sign in
            </Link>
          </div>

          {/* Other ways in: two quiet tiles under the main actions, each with
              what it is and where it goes. */}
          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={enterLocalMode}
              className={`group ${tileClass}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-300/10 text-emerald-200">
                <HardDrive size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">Try it without an account</span>
                <span className="block text-xs leading-5 text-white/50">No sign-up; encrypted on this device</span>
              </span>
              <ArrowRight size={15} className="ml-auto shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-emerald-200" />
            </button>
            <a href={ANDROID_APP_URL} className={`group ${tileClass}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80">
                <Smartphone size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">Get the Android app</span>
                <span className="block text-xs leading-5 text-white/50">Downloads the latest APK</span>
              </span>
              <Download
                size={15}
                aria-hidden="true"
                className="ml-auto shrink-0 text-white/40 transition group-hover:translate-y-0.5 group-hover:text-emerald-200"
              />
            </a>
          </div>
        </div>
      </section>

      {/* Why: the story behind it, then what it offers */}
      <section id="why" className="scroll-mt-20 border-t border-white/5 bg-[#0f1117] px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title="Why ArcheSpace" />
          <div className="mt-6 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div className="reveal max-w-2xl space-y-6 text-[15px] leading-7 text-white/72">
              {/* The lead, its two key ideas picked out in the accent. */}
              <p className="text-base leading-7 text-white sm:text-lg sm:leading-8">
                An open source, <span className="font-semibold text-emerald-200">zero knowledge encrypted</span> space
                to organize your notes, projects, secrets, code, and ideas in flexible spaces,{' '}
                <span className="font-semibold text-emerald-200">just like a file manager</span>, with everything
                synced across all your devices.
              </p>

              {/* The story, set off as a quote. */}
              <p className="border-l-2 border-emerald-300/60 pl-4 text-white/80">
                A personal private space, built to keep everything in one place: projects and their
                secrets, ideas, features and bugs, and any random data. It started as a space for one
                person, then went public to be usable from anywhere, and is now open for anyone.
              </p>

              {/* The file-manager idea, its kinds of item as the app's own badges. */}
              <div>
                <p>
                  Most note apps are a flat list behind an &quot;Add note&quot; button. ArcheSpace is
                  structured more like a file manager: spaces inside spaces, each holding the right kind
                  of item:
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {itemKinds.map(([type, label]) => (
                    <li
                      key={type}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] py-1 pl-1 pr-2.5 text-xs text-white/80"
                    >
                      <TypeBadge type={type} size={11} />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* The web app as it looks (dark theme, mint accent): the sidebar,
                a space open with its toolbar, and its items as cards. A
                picture only (not interactive). */}
            <figure
              role="img"
              aria-label="The ArcheSpace web app: the Projects space open, with a Kanban roadmap, a bug checklist, protected API keys and a code snippet as cards."
              className="reveal overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-2xl shadow-black/40"
            >
              <div aria-hidden="true" className="flex text-[#f5f7f2] [zoom:1.35] sm:[zoom:1]">
                {/* Sidebar */}
                <div className="hidden w-[112px] shrink-0 flex-col bg-[#151b21] px-2 py-2.5 sm:flex">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-bold tracking-[0.03em] text-[#32d3aa]">ARCHE<span className="text-white">SPACE</span></p>
                    <ChevronsLeft size={10} className="text-[#7b8e85]" />
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 px-1 text-[8px] text-[#a8b7ad]">
                    <LayoutGrid size={10} /> Dashboard
                  </p>
                  <p className="mt-2.5 flex items-center gap-0.5 px-1 text-[6.5px] font-semibold uppercase tracking-wide text-[#7b8e85]">
                    Spaces <ChevronDown size={8} />
                  </p>
                  {['Projects', 'Personal', 'Side ideas'].map((name, i) => (
                    <p
                      key={name}
                      className={`mt-0.5 truncate rounded-md px-2 py-[3px] text-[8px] ${i === 0 ? 'bg-white/[0.07] font-semibold text-white' : 'text-[#a8b7ad]'}`}
                    >
                      {name}
                    </p>
                  ))}
                  <p className="mt-2.5 px-1 text-[6.5px] font-semibold uppercase tracking-wide text-[#7b8e85]">Library</p>
                  {[[Bell, 'Reminders'], [Star, 'Starred', 1], [Hourglass, 'Self-destruct'], [Archive, 'Archive'], [Trash2, 'Bin']].map(([Icon, name, count]) => (
                    <p key={name} className="mt-1 flex items-center gap-1.5 px-1 text-[8px] text-[#a8b7ad]">
                      <Icon size={10} /> {name}
                      {count && <span className="ml-auto text-[#7b8e85]">{count}</span>}
                    </p>
                  ))}
                  <div className="mt-auto pt-4">
                    {[[Command, 'Commands'], [Keyboard, 'Shortcuts'], [Lock, 'Lock vault'], [Settings, 'Settings']].map(([Icon, name]) => (
                      <p key={name} className="mt-1 flex items-center gap-1.5 px-1 text-[8px] text-[#a8b7ad]">
                        <Icon size={10} /> {name}
                      </p>
                    ))}
                  </div>
                </div>

                {/* The open space */}
                <div className="min-w-0 flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-2 bg-[#121820] px-3 py-2">
                    <ArrowLeft size={11} className="text-[#a8b7ad]" />
                    <p className="truncate text-[10px] font-semibold">Projects</p>
                    <span className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-[#32d3aa] px-2 py-1 text-[8px] font-semibold text-[#0c1a16]">
                      <Plus size={10} /> New
                    </span>
                    <MoreVertical size={11} className="shrink-0 text-[#a8b7ad]" />
                  </div>

                  <div className="p-2.5">
                    {/* Toolbar */}
                    <div className="flex items-center gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-[#151b21] px-2.5 py-1 text-[8px] text-[#7b8e85]">
                        <Search size={10} /> <span className="truncate">Search this space</span>
                      </div>
                      <span className="flex shrink-0 rounded-md bg-[#151b21] p-0.5">
                        <span className="rounded bg-[#32d3aa]/20 p-0.5 text-[#32d3aa]"><LayoutGrid size={9} /></span>
                        <span className="p-0.5 text-[#7b8e85]"><List size={9} /></span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[8px] text-[#a8b7ad]"><ArrowUpDown size={9} /> Custom</span>
                      <span className="hidden shrink-0 items-center gap-1 text-[8px] text-[#a8b7ad] lg:flex"><SquareCheck size={9} /> Select</span>
                    </div>

                    {/* Cards */}
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      {/* Kanban */}
                      <div className="rounded-xl bg-[#151b21] p-2">
                        <div className="flex items-center gap-1.5">
                          <Pin size={10} className="shrink-0 fill-[#32d3aa] text-[#32d3aa]" />
                          <TypeBadge type="kanban" size={9} />
                          <p className="truncate text-[9px] font-semibold">Roadmap</p>
                          <Star size={9} className="shrink-0 fill-[#32d3aa] text-[#32d3aa]" />
                          <MoreVertical size={10} className="ml-auto shrink-0 text-[#7b8e85]" />
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          {[['To do', ['Sync', 'Tags']], ['Doing', ['Export']], ['Done', ['Search', 'Login']]].map(([stage, cards]) => (
                            <div key={stage} className="rounded-lg border border-[#2c3938] bg-[#0f1419] p-1">
                              <p className="text-[6.5px] font-semibold text-[#a8b7ad]">{stage}</p>
                              {cards.map(card => (
                                <p key={card} className="mt-1 truncate rounded bg-[#1b2427] px-1 py-0.5 text-[6.5px]">{card}</p>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Checklist */}
                      <div className="rounded-xl bg-[#151b21] p-2">
                        <div className="flex items-center gap-1.5">
                          <TypeBadge type="checkbox_list" size={9} />
                          <p className="truncate text-[9px] font-semibold">Bugs to fix</p>
                          <MoreVertical size={10} className="ml-auto shrink-0 text-[#7b8e85]" />
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-[#1b2427]">
                          <div className="h-1 w-1/2 rounded-full bg-[#32d3aa]" />
                        </div>
                        {[['Login loop on Safari', true], ['Slow search', true], ['Tag colours', false], ['Export date', false]].map(([task, done]) => (
                          <p key={task} className="mt-1 flex items-center gap-1.5 text-[8px]">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${done ? 'border-[#32d3aa] bg-[#32d3aa]' : 'border-[#7b8e85]'}`} />
                            <span className={`truncate ${done ? 'text-[#7b8e85] line-through' : ''}`}>{task}</span>
                          </p>
                        ))}
                        <p className="mt-1 flex items-center gap-1 text-[7px] text-[#7b8e85]"><Plus size={8} /> Add item</p>
                      </div>

                      {/* Protected (from the sm width) */}
                      <div className="hidden rounded-xl bg-[#151b21] p-2 sm:block">
                        <div className="flex items-center gap-1.5">
                          <TypeBadge type="textbox" size={9} />
                          <p className="truncate text-[9px] font-semibold">API keys</p>
                          <MoreVertical size={10} className="ml-auto shrink-0 text-[#7b8e85]" />
                        </div>
                        <div className="mt-2 flex flex-col items-center rounded-lg border border-[#2c3938] bg-[#0f1419] py-3">
                          <ShieldCheck size={13} className="text-[#a8b7ad]" />
                          <p className="mt-1 text-[8px] font-medium">Protected</p>
                          <p className="text-[7px] text-[#7b8e85]">Opens with your vault PIN</p>
                        </div>
                      </div>

                      {/* Code (from the sm width) */}
                      <div className="hidden rounded-xl bg-[#151b21] p-2 sm:block">
                        <div className="flex items-center gap-1.5">
                          <TypeBadge type="code" size={9} />
                          <p className="truncate text-[9px] font-semibold">Deploy script</p>
                          <MoreVertical size={10} className="ml-auto shrink-0 text-[#7b8e85]" />
                        </div>
                        <div className="mt-2 rounded-lg border border-[#2c3938] bg-[#0f1419] p-2 font-mono text-[7px] leading-[13px] text-[#d4dad4]">
                          <p className="truncate"><span className="text-[#c792ea]">npm</span> run build</p>
                          <p className="truncate"><span className="text-[#c792ea]">npx</span> wrangler deploy</p>
                          <p className="truncate text-[#7b8e85]"># done in 42s</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <figcaption className="border-t border-white/5 bg-[#151b21] px-3 py-1.5 text-[10px] text-white/45">
                A space in the web app
              </figcaption>
            </figure>
          </div>

          <h3 className="reveal mt-14 text-lg font-semibold text-white">Features</h3>
          <ul className="reveal mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <Icon size={18} className="mt-0.5 shrink-0 text-emerald-200" />
                <div>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-[15px] leading-6 text-white/62 sm:text-sm">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How: the steps, then what the server stores */}
      <section id="how-it-works" className="scroll-mt-20 border-t border-white/5 bg-[#101820] px-4 py-14 sm:px-6 sm:py-20">
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
                <p className="mt-3 text-[15px] leading-6 text-white/62 sm:text-sm">{body}</p>
              </li>
            ))}
          </ol>

          <div className="reveal mt-12">
            <h3 className="text-lg font-semibold text-white">What the Server Stores</h3>

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
                    <span className="text-[15px] leading-6 text-white/72 sm:text-sm">{fact}</span>
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
            <p className="mt-2 max-w-xl text-[15px] leading-6 text-white/62 sm:text-sm">
              Settings shows the exact commit your browser is running, so you can confirm that
              what ships is what&apos;s published.
            </p>
            {/* Each source as a card: which app, the repository it opens, and
                an arrow saying it leaves the page. */}
            <div className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-2">
              {[[REPO_URL, 'Web app source'], [MOBILE_REPO_URL, 'Mobile app source']].map(([url, label]) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={`group ${tileClass}`}
                >
                  <GithubMark size={22} className="shrink-0 text-white" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{label}</span>
                    <span className="block truncate text-xs text-white/50">{url.replace('https://github.com/', '')}</span>
                  </span>
                  <ArrowUpRight
                    size={16}
                    aria-hidden="true"
                    className="ml-auto shrink-0 text-white/40 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-200"
                  />
                  <span className="sr-only">(opens on GitHub)</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="scroll-mt-20 border-t border-white/5 bg-[#0b0d11] px-4 py-14 sm:px-6">
        <div className="reveal mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-12">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Contact</h2>
            <p className="mt-3 text-[15px] leading-6 text-white/62 sm:text-sm">
              Write to us about setup or sign-in, your vault and recovery, a bug, or an idea.
              For a bug, tell us what happened and the app version.
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-white/55">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-emerald-200" />
              Never send your vault PIN, recovery code or password. We never ask for them, and
              they couldn&apos;t help us read your data anyway.
            </p>
          </div>
          <a href="mailto:support@archespace.app" className={`min-h-11 shrink-0 self-start md:self-auto ${btnGhost}`}>
            <Mail size={16} className="text-emerald-200" />
            support@archespace.app
          </a>
        </div>
      </section>

      {/* Footer: credits, then the policy links and version */}
      <footer className="border-t border-white/10 bg-[#0d0f14] px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-white/65 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} · Crafted and maintained by{' '}
            <a href="https://github.com/wyserian" target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center sm:min-h-0 hover:text-white transition-colors">
              Wyserian
            </a>
          </p>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="inline-flex min-h-[44px] items-center sm:min-h-0 hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="inline-flex min-h-[44px] items-center sm:min-h-0 hover:text-white transition-colors">Terms</a>
            <a href={`${REPO_URL}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center sm:min-h-0 hover:text-white transition-colors">
              Security
            </a>
            <a href={COMMIT_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center sm:min-h-0 hover:text-white transition-colors">
              v{APP_VERSION}
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}
