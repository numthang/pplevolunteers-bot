import data from './data/portfolio.json'

export const metadata = { title: 'Unnop (Tee) Sricharoenchai — Portfolio' }

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g

// แปลง "[label](url)" ในข้อความให้เป็นลิงก์คลิกได้จริง (เหมือน /dojo)
function linkify(text) {
  const parts = []
  let lastIndex = 0
  for (const match of text.matchAll(LINK_PATTERN)) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(
      <a
        key={match.index}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-teal hover:opacity-80 underline underline-offset-2"
      >
        {match[1]}
      </a>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function Eyebrow({ children }) {
  return (
    <div className="text-xs uppercase tracking-widest text-teal font-semibold mb-2">
      {children}
    </div>
  )
}

const cardCls = 'bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl'
const dividerCls = 'border-t border-warm-200 dark:border-disc-border'

export default function PortfolioPage() {
  const d = data

  return (
    <div className="py-6 max-w-3xl mx-auto">

      {/* Header */}
      <header className="pb-7 border-b border-warm-200 dark:border-disc-border">
        <Eyebrow>Civic-technology · Consulting</Eyebrow>
        <h1 className="text-3xl sm:text-4xl font-bold text-warm-900 dark:text-disc-text mb-1.5 leading-tight">
          {d.name}
        </h1>
        <p className="text-warm-500 dark:text-disc-muted">{d.role}</p>
        <p className="text-lg text-warm-900 dark:text-disc-text mt-5 leading-relaxed">
          {linkify(d.thesis)}
        </p>
      </header>

      {/* Profile */}
      <section className={`py-7 ${dividerCls}`}>
        <Eyebrow>Profile</Eyebrow>
        <p className="text-base text-warm-900 dark:text-disc-text leading-relaxed">
          {linkify(d.profile)}
        </p>
      </section>

      {/* The work + metrics */}
      <section className={`py-7 ${dividerCls}`}>
        <Eyebrow>The work</Eyebrow>
        <h2 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-2">{d.work.heading}</h2>
        <p className="text-warm-500 dark:text-disc-muted leading-relaxed mb-5">{linkify(d.work.lead)}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {d.work.metrics.map(m => (
            <div key={m.k} className={`${cardCls} p-4`}>
              <div className="text-2xl font-bold text-teal tabular-nums leading-none">{m.n}</div>
              <div className="text-xs text-warm-500 dark:text-disc-muted mt-1.5">{m.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className={`py-7 ${dividerCls}`}>
        <Eyebrow>What it does</Eyebrow>
        <h2 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-4">Six modules, one shared core</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {d.modules.map(m => (
            <div key={m.idx} className={`${cardCls} p-4`}>
              <h3 className="font-semibold text-warm-900 dark:text-disc-text mb-1">
                <span className="text-teal text-sm font-mono mr-2">{m.idx}</span>{m.title}
              </h3>
              <p className="text-sm text-warm-500 dark:text-disc-muted leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture mapping */}
      <section className={`py-7 ${dividerCls}`}>
        <Eyebrow>Architecture</Eyebrow>
        <h2 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-2">{d.mapping.heading}</h2>
        <p className="text-warm-500 dark:text-disc-muted mb-4">{d.mapping.lead}</p>
        <div className="flex flex-col gap-2">
          {d.mapping.rows.map(r => (
            <div key={r.them} className={`${cardCls} p-3.5 sm:flex sm:items-center sm:gap-3`}>
              <div className="text-sm text-warm-500 dark:text-disc-muted flex-1">{r.them}</div>
              <div className="text-teal text-sm my-1 sm:my-0">→</div>
              <div className="text-sm font-medium text-warm-900 dark:text-disc-text flex-1">{r.me}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className={`py-7 ${dividerCls}`}>
        <Eyebrow>Career</Eyebrow>
        <h2 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-3">Experience</h2>
        <div className="flex flex-col">
          {d.experience.map((x, i) => (
            <div
              key={x.when}
              className={`grid sm:grid-cols-[130px_1fr] gap-1 sm:gap-4 py-4 ${i > 0 ? dividerCls : ''}`}
            >
              <div className="text-sm text-warm-500 dark:text-disc-muted tabular-nums pt-0.5">{x.when}</div>
              <div>
                <h3 className="font-semibold text-warm-900 dark:text-disc-text">{x.title}</h3>
                <p className="text-sm text-teal mb-1">{x.org}</p>
                <p className="text-sm text-warm-500 dark:text-disc-muted leading-relaxed">{x.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Education + Languages */}
      <section className={`py-7 ${dividerCls}`}>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <Eyebrow>Education</Eyebrow>
            <h3 className="font-semibold text-warm-900 dark:text-disc-text">{d.education.degree}</h3>
            <p className="text-sm text-warm-500 dark:text-disc-muted">{d.education.school}</p>
            <p className="text-sm text-warm-500 dark:text-disc-muted tabular-nums mt-0.5">{d.education.when}</p>
          </div>
          <div>
            <Eyebrow>Languages</Eyebrow>
            {d.languages.map(l => (
              <p key={l.lang} className="text-sm text-warm-900 dark:text-disc-text">
                {l.lang} <span className="text-warm-500 dark:text-disc-muted">— {l.level}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Skills */}
      <section className={`py-7 ${dividerCls}`}>
        <Eyebrow>Toolkit</Eyebrow>
        <h2 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-4">Skills & stack</h2>
        <div className="flex flex-wrap gap-2">
          {d.skills.map(s => (
            <span key={s} className="text-sm px-3 py-1.5 rounded-full border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text">
              {s}
            </span>
          ))}
        </div>
        <div className="text-xs uppercase tracking-wider text-warm-500 dark:text-disc-muted mt-5 mb-2">Also</div>
        <div className="flex flex-wrap gap-2">
          {d.alsoSkills.map(s => (
            <span key={s} className="text-sm px-3 py-1.5 rounded-full border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* Engagement */}
      <section className={`py-7 ${dividerCls}`}>
        <Eyebrow>Engagement</Eyebrow>
        <h2 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-2">{d.engagement.heading}</h2>
        <p className="text-warm-500 dark:text-disc-muted leading-relaxed">{d.engagement.text}</p>
      </section>

      {/* Contact */}
      <section className="py-7">
        <Eyebrow>Contact</Eyebrow>
        <h2 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-4">Let&apos;s talk</h2>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {d.contact.map(c => (
            <div key={c.k}>
              <div className="text-xs uppercase tracking-wider text-warm-500 dark:text-disc-muted mb-0.5">{c.k}</div>
              {c.href
                ? <a href={c.href} className="text-teal hover:opacity-80">{c.v}</a>
                : <span className="text-warm-900 dark:text-disc-text">{c.v}</span>}
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
