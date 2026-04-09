'use client'
import { SessionProvider } from 'next-auth/react'
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
export function useTheme() { return useContext(ThemeContext) }

function ThemeProvider({ children }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setDark(saved ? saved === 'dark' : prefersDark)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export default function Providers({ children, session }) {
  return (
    <SessionProvider session={session}>
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  )
}
