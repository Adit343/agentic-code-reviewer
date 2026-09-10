'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageSquare, X, Send, Trash2, Bot, User, Sparkles, ChevronRight, CornerDownLeft, ShieldCheck } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  reviewId: string;
}

const STARTERS = [
  "What are the most critical findings?",
  "How do I fix the security vulnerabilities?",
  "Which files need the most attention?",
  "Explain the highest severity finding",
];

export default function ChatPanel({ reviewId }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Lock background scrolling strictly when chatbot panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const sendMessage = async (userMsg: string) => {
    if (!userMsg.trim() || isStreaming) return;

    const currentHistory = [...messages];
    setMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/reviews/${reviewId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history: currentHistory }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + chunk,
              };
            }
            return updated;
          });
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
          updated[updated.length - 1].content = `Error: ${err.message || 'Failed to get response'}`;
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating Trigger FAB with Pulsing Ring */}
      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 z-10">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 border-2 border-slate-950"></span>
          </span>
        )}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className={`group p-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white shadow-2xl shadow-indigo-600/40 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center border border-indigo-400/30 ${
            isOpen ? 'rotate-90 bg-slate-800 border-slate-700' : ''
          }`}
          title={isOpen ? 'Close Assistant' : 'Ask Review AI Assistant'}
        >
          {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        </button>
      </div>

      {/* Backdrop overlay (Locks background scroll & closes on click outside) */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        />
      )}

      {/* Slide-in Floating Glassmorphism Modal Drawer */}
      <div
        className={`fixed top-4 right-4 bottom-4 z-50 w-[calc(100vw-2rem)] sm:w-[480px] bg-slate-950/85 backdrop-blur-2xl border border-indigo-500/25 rounded-[28px] shadow-2xl shadow-indigo-950/60 flex flex-col overflow-hidden transition-all duration-300 ease-out transform ${
          isOpen ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {/* Ambient Top Glow Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/70 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="relative p-2.5 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 text-indigo-400 border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-white tracking-tight">Review AI Assistant</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-bold">
                  AI REPO CONTEXT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Repo-aware code & findings Q&A</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              title="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message Container Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-center px-2 space-y-6">
              <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-500/15 via-purple-500/15 to-slate-900 border border-indigo-500/30 text-indigo-400 shadow-xl shadow-indigo-500/10">
                <Bot className="w-10 h-10 text-indigo-400" />
              </div>
              <div className="space-y-1.5 max-w-xs">
                <h4 className="text-base font-extrabold text-white">Ask Anything About This Repository</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Indexed with full code intelligence and security audit findings for this repository.
                </p>
              </div>

              {/* Starter Question Pills */}
              <div className="w-full space-y-2.5 pt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left px-1">
                  Suggested Starter Questions
                </span>
                {STARTERS.map((starter, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(starter)}
                    className="w-full p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800/90 hover:border-indigo-500/40 text-left text-xs text-slate-300 hover:text-white transition-all duration-200 flex items-center justify-between group shadow-sm hover:shadow-md hover:scale-[1.01]"
                  >
                    <span className="font-medium pr-2">{starter}</span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] rounded-2xl px-4.5 py-3.5 text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white rounded-tr-xs shadow-lg shadow-indigo-600/25 font-medium'
                      : 'bg-slate-900/90 border border-slate-800/90 text-slate-200 rounded-tl-xs shadow-md backdrop-blur-md'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : msg.content ? (
                    <div className="prose prose-invert prose-xs max-w-none prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-2xl prose-code:text-indigo-300 prose-code:bg-indigo-950/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 py-1 px-0.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar Section */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/80 backdrop-blur-xl shrink-0">
          <div className="relative flex items-center">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about code or findings... (Enter to send)"
              rows={2}
              className="w-full resize-none rounded-2xl bg-slate-950 border border-slate-800 px-4 py-3 pr-12 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-colors shadow-inner"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="absolute right-3 p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2 flex justify-between items-center text-[10px] text-slate-500 px-1 font-mono">
            <span className="flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3 text-slate-600" /> Enter to send • Shift+Enter for newline
            </span>
            <span className="text-indigo-400/80 font-medium">Gemini 3.6 Flash</span>
          </div>
        </div>
      </div>
    </>
  );
}
