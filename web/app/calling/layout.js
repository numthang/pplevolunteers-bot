export default function CallingLayout({ children }) {
  return (
    <div className="-mx-4 -mt-6 min-h-screen bg-warm-50 dark:bg-warm-dark-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </div>
    </div>
  )
}
