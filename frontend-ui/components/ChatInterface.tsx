'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, ShieldCheck, Paperclip, Mic, FileText, PenTool, Lightbulb, Compass } from 'lucide-react'

export default function ChatInterface({ activeProject }: { activeProject: string }) {
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

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
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: input, project: activeProject, username: 'admin', thread_id: 'General' }),
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
              setMessages(prev => {
                const newMessages = [...prev]
                newMessages[newMessages.length - 1].content = accumulatedResponse
                return newMessages
              })
            } catch (e) { }
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
    <div className="flex-1 flex flex-col h-full bg-[#212121] relative">
      
      {/* Scrollable Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto w-full scroll-smooth">
        {messages.length === 0 ? (
          /* EMPTY STATE */
          <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto px-4 pb-20">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-white/10 shadow-xl">
               <ShieldCheck className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-3xl font-medium mb-10 text-gray-100 tracking-tight">How can I help you today?</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              {[
                { icon: <FileText className="w-5 h-5 text-orange-400" />, text: "Analyze blueprints", sub: "Scan latest PDFs" },
                { icon: <PenTool className="w-5 h-5 text-emerald-400" />, text: "Draft a memo", sub: "For the engineering team" },
                { icon: <Compass className="w-5 h-5 text-cyan-400" />, text: "Verify compliance", sub: "Against local regulations" },
                { icon: <Lightbulb className="w-5 h-5 text-purple-400" />, text: "Project summary", sub: "Extract key metrics" },
              ].map((card, i) => (
                <button key={i} onClick={() => setInput(card.text)} className="group bg-[#2f2f2f] hover:bg-[#383838] border border-white/5 p-4 rounded-2xl flex flex-col items-start gap-2 transition-all text-left">
                  {card.icon}
                  <div>
                    <span className="block text-[14px] font-medium text-gray-200 group-hover:text-white">{card.text}</span>
                    <span className="block text-[13px] text-gray-500">{card.sub}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ACTIVE CHAT STATE */
          <div className="max-w-3xl mx-auto w-full pt-8 pb-40 px-4 space-y-6">
            {messages.map((m, i) => (
              <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                
                {m.role === 'user' ? (
                  /* User Message Pill */
                  <div className="bg-[#2f2f2f] text-gray-100 px-5 py-3 rounded-3xl max-w-[75%] text-[15px] leading-relaxed shadow-sm">
                    {m.content}
                  </div>
                ) : (
                  /* AI Message Block */
                  <div className="flex gap-4 w-full max-w-[90%]">
                    <div className="w-8 h-8 rounded-full border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-gray-200 text-[15px] leading-relaxed pt-1">
                      {m.content}
                    </div>
                  </div>
                )}
                
              </div>
            ))}
            
            {isLoading && !messages[messages.length-1].content && (
              <div className="flex gap-4 w-full px-4 mt-6">
                <div className="w-8 h-8 rounded-full border border-gray-600 bg-[#2f2f2f] shrink-0" />
                <div className="h-6 w-4 bg-cyan-500/50 rounded-sm animate-pulse mt-1" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Input Area with Frosted Glass */}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#212121] via-[#212121]/90 to-transparent pt-10 pb-6 px-4 backdrop-blur-[2px]">
        <div className="max-w-3xl mx-auto w-full relative">
          <div className="bg-[#2f2f2f] rounded-[24px] flex flex-col border border-white/10 shadow-2xl focus-within:border-white/20 transition-all overflow-hidden">
            
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if(e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message Sovereign AI..."
              disabled={isLoading}
              rows={1}
              className="w-full bg-transparent border-none focus:outline-none focus:ring-0 px-5 pt-4 pb-2 text-white placeholder-gray-500 text-[15px] resize-none min-h-[56px] max-h-[200px]"
            />
            
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <button className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/5 transition-colors">
                  <Paperclip className="w-4 h-4" />
                </button>
                <button className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/5 transition-colors">
                  <Mic className="w-4 h-4" />
                </button>
              </div>
              
              <button 
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="p-2 bg-white text-black hover:bg-gray-200 rounded-full transition-colors disabled:opacity-30 disabled:bg-white/10 disabled:text-gray-500"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </div>
          <p className="text-center text-[11px] text-gray-500 mt-3 font-medium">
            Sovereign Data Residency Confirmed. AI can make mistakes. Verify critical technical info.
          </p>
        </div>
      </div>
    </div>
  )
}