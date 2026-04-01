import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Loader2, Bot, User } from 'lucide-react';
import { sendChatMessage } from '../lib/api';
import type { ChatMessage } from '../lib/api';

export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "What's good! I'm Sneaker G AI. Ask me about releases, prices, copping tips, or anything sneaker-related. Try \"search Jordan 4 Bred\" for real data." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const reply = await sendChatMessage(text);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Try again!' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 bg-[#00ff87] text-[#0a0a0a] p-3.5 rounded-full shadow-lg shadow-[#00ff87]/20 hover:scale-105 transition-transform"
        >
          <MessageSquare size={22} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:w-[380px] h-full sm:h-[560px] bg-[#0a0a0a] sm:rounded-2xl border border-[#222222] flex flex-col shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#222222] bg-[#111111] sm:rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#00ff87]/10 flex items-center justify-center">
                <Bot size={16} className="text-[#00ff87]" />
              </div>
              <div>
                <p className="text-[#ffffff] font-semibold text-sm">Sneaker G AI</p>
                <p className="text-[#00ff87] text-[10px]">Online</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[#888888] hover:text-[#ffffff] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-[#00ff87]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={12} className="text-[#00ff87]" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#00ff87] text-[#0a0a0a] rounded-br-md'
                      : 'bg-[#111111] text-[#ffffff] border border-[#222222] rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-[#222222] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={12} className="text-[#888888]" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-[#00ff87]/10 flex items-center justify-center flex-shrink-0">
                  <Bot size={12} className="text-[#00ff87]" />
                </div>
                <div className="bg-[#111111] border border-[#222222] rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 size={16} className="animate-spin text-[#00ff87]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="px-3 py-3 border-t border-[#222222] bg-[#111111] sm:rounded-b-2xl">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about sneakers..."
                disabled={loading}
                className="flex-1 bg-[#0a0a0a] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#ffffff] placeholder-[#888888] focus:outline-none focus:border-[#00ff87] transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-[#00ff87] text-[#0a0a0a] p-2.5 rounded-xl hover:bg-[#00ff87]/90 transition-colors disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
