export const metadata = { title: 'Calling' }

export default function CallingLayout({ children }) {
  return (
    <div className="-mx-3 sm:-mx-4 -mt-6 min-h-screen bg-warm-50 dark:bg-disc-bg2">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-8">
        {children}
      </div>
    </div>
  )
}
