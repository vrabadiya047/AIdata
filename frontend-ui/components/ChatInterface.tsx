'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, ShieldCheck, User } from 'lucide-react'

export default function ChatInterface({ activeProject }: { activeProject: string }) {
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Add a placeholder for the AI response
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: input,
          project: activeProject,
          username: 'admin', // In a real app, get this from your session
          thread_id: 'General'
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let accumulatedResponse = ""

      while (true) {
        const { done, value } = await reader!.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            
            try {
              const { token } = JSON.parse(data)
              accumulatedResponse += token
              
              // Update the last message in the list (the assistant)
              setMessages(prev => {
                const newMessages = [...prev]
                newMessages[newMessages.length - 1].content = accumulatedResponse
                return newMessages
              })
            } catch (e) { /* Skip malformed JSON tokens */ }
          }
        }
      }
    } catch (error) {
      console.error("Stream error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Chat Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
              )}
              <div className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed border ${
                m.role === 'user' 
                ? 'bg-cyan-600/10 border-cyan-500/20 text-cyan-50' 
                : 'bg-slate-900/50 border-slate-800 text-slate-300'
              }`}>
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
              )}
            </div>
          ))}
          {isLoading && !messages[messages.length-1].content && (
            <div className="flex gap-4 animate-pulse">
              <div className="w-8 h-8 bg-slate-800 rounded-lg shrink-0" />
              <div className="h-10 w-32 bg-slate-800 rounded-xl" />
            </div>
          )}
        </div>
      </div>

      {/* Input Form */}
      <div className="p-8 border-t border-slate-800/30">
        <div className="max-w-3xl mx-auto relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Query local knowledge base..."
            disabled={isLoading}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-4 px-6 pr-14 focus:outline-none focus:border-cyan-500/40 transition-all disabled:opacity-50"
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-all disabled:bg-slate-800"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}