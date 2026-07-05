export const metadata = { title: { template: '%s — Bot', default: 'Bot Settings' } }

export default function BotLayout({ children }) {
  return (
    <div className="-mx-3 sm:-mx-4 -mt-6 min-h-screen bg-warm-50 dark:bg-disc-bg2">
      <div className="max-w-5xl mx-auto px-1 sm:px-4 py-4">
        {children}
      </div>
    </div>
  )
}
