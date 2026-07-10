import stagesData from './data/stages.json'

export const metadata = { title: 'Dojo — เรียนโค้ดดิ้ง' }

const { stages, revisionNote } = stagesData

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g

// แปลง "...[label](url)..." ในข้อความเนื้อหาให้เป็นลิงก์คลิกได้จริง
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

export default function DojoPage() {
  return (
    <div className="py-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">
        แผนที่เรียนโค้ดดิ้ง
      </h1>
      <p className="text-sm text-warm-500 dark:text-disc-muted mb-6">
        สาย Python เรียงลำดับ 6 สเตจ พร้อมลิงก์แหล่งเรียนที่เลือกมาให้แล้ว
      </p>

      <ol className="flex flex-col gap-4">
        {stages.map(stage => (
          <li
            key={stage.number}
            className={`bg-card-bg border rounded-xl p-4 ${
              stage.parallel
                ? 'border-teal/40 border-l-4 border-l-teal'
                : 'border-warm-200 dark:border-disc-border'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 rounded-full border border-warm-200 dark:border-disc-border flex items-center justify-center text-sm font-bold text-warm-500 dark:text-disc-muted">
                {stage.number}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">
                    {stage.title}
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted">
                    {stage.tag}
                  </span>
                </div>
                <p className="text-sm text-warm-500 dark:text-disc-muted mt-1 mb-3">
                  {linkify(stage.description)}
                </p>
                {stage.howTo && (
                  <ol className="list-decimal list-inside text-sm text-warm-500 dark:text-disc-muted space-y-1 mb-3">
                    {stage.howTo.map((step, i) => (
                      <li key={i}>{linkify(step)}</li>
                    ))}
                  </ol>
                )}
                <div className="flex flex-wrap gap-2">
                  {stage.links.map(link => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                    >
                      {link.label} <span className="opacity-50">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 bg-card-bg border border-dashed border-teal/60 rounded-xl p-4">
        <p className="text-sm font-semibold text-warm-900 dark:text-disc-text mb-2">
          {revisionNote.title}
        </p>
        <ul className="list-disc list-inside text-sm text-warm-500 dark:text-disc-muted space-y-1">
          {revisionNote.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
