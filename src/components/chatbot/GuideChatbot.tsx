'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { X, Send, Sparkles, User, Bot, Trash2, Copy, Check, TrendingUp, DollarSign, Calendar, Zap, BarChart3, Activity } from 'lucide-react';
import { useSession } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import SeasonaxMainChart from '@/components/analytics/SeasonaxMainChart';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import 'katex/dist/katex.min.css';

export default function GuideChatbot() {
  const { data: session } = useSession();
  const { isOpen, messages, isLoading, model, setIsOpen, addMessage, setIsLoading, clearMessages, setModel } = useChatStore();
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSeasonalMenu, setShowSeasonalMenu] = useState(false);
  const [show30DayMenu, setShow30DayMenu] = useState(false);
  const [showElectionMenu, setShowElectionMenu] = useState(false);
  const [showOIMenu, setShowOIMenu] = useState(false);
  const [currentTicker, setCurrentTicker] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    // Add user message
    addMessage({
      role: 'user',
      content: userMessage,
    });

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
          ],
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      addMessage({
        role: 'assistant',
        content: data.content || 'Sorry, I could not generate a response.',
      });
    } catch (error) {
      console.error('Chat error:', error);
      addMessage({
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const submitQuery = async (query: string) => {
    if (!query.trim() || isLoading) return;

    setInput('');
    
    // Add user message
    addMessage({
      role: 'user',
      content: query,
    });

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: query }
          ],
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      addMessage({
        role: 'assistant',
        content: data.content || 'Sorry, I could not generate a response.',
      });
    } catch (error) {
      console.error('Chat error:', error);
      addMessage({
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Show panel when isOpen is TRUE (button clicked), hide when FALSE (default)
  if (!isOpen) return null;

  return (
    <div className="fixed right-0 z-[9999]" style={{ top: '115px', width: '30%', height: 'calc(70% - 115px)' }}>
      <div className="w-full h-full bg-black flex flex-col relative" style={{
        border: '2px solid rgba(255, 102, 0, 0.4)',
        borderRight: 'none'
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b bg-gradient-to-r from-black via-gray-900 to-black relative overflow-hidden z-20" style={{
          borderColor: 'rgba(255, 102, 0, 0.3)'
        }}>
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-amber-500/10 to-orange-500/5 animate-pulse"></div>
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 rounded-full relative overflow-hidden" style={{
              boxShadow: '0 0 30px rgba(255, 102, 0, 0.4), inset 0 0 20px rgba(255, 102, 0, 0.1)'
            }}>
              <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-purple-600 to-amber-500 animate-spin-slow"></div>
              <div className="absolute inset-[3px] bg-black rounded-full flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" style={{
                  filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.8))'
                }} />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-0.5" style={{
                textShadow: '0 0 20px rgba(255, 102, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.8)'
              }}>Trading Guide AI</h2>
              <p className="text-sm font-medium" style={{
                color: '#FF8833',
                textShadow: '0 0 10px rgba(255, 136, 51, 0.4)'
              }}>Your intelligent trading assistant</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 relative z-[10001]">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="p-2 hover:bg-red-500/10 rounded-lg transition-all duration-200 group border border-transparent hover:border-red-500/20"
                title="Clear chat"
              >
                <Trash2 className="w-5 h-5 text-gray-400 group-hover:text-red-400 transition-colors" />
              </button>
            )}
            
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-gray-800/50 rounded-lg transition-all duration-200 border border-transparent hover:border-gray-700"
              title="Close"
            >
              <X className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">How can I help you today?</h3>
              <p className="text-gray-400 max-w-2xl">
                Ask me anything about trading.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* User Avatar */}
              {message.role === 'user' ? (
                session?.user?.image ? (
                  <img 
                    src={session.user.image} 
                    alt="Your profile" 
                    className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-blue-500/50"
                  />
                ) : (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )
              ) : (
                /* AI Avatar - Animated Gold/Purple Gradient */
                <div className="flex-shrink-0 w-8 h-8 rounded-full relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-purple-600 to-amber-500 animate-spin-slow"></div>
                  <div className="absolute inset-[2px] bg-black rounded-full flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                  </div>
                </div>
              )}

              <div className={`flex-1 ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                <div className={`max-w-[95%] relative overflow-hidden ${
                  message.role === 'user'
                    ? 'text-white rounded-2xl rounded-tr-sm px-5 py-4'
                    : 'bg-[#0a0a0a] text-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-800/50'
                }`} style={message.role === 'user' ? {
                  background: 'linear-gradient(135deg, #1a0a00 0%, #331100 25%, #4d1a00 50%, #331100 75%, #1a0a00 100%)',
                  border: '2px solid rgba(255, 102, 0, 0.4)',
                  boxShadow: '0 0 25px rgba(255, 102, 0, 0.3), inset 0 0 20px rgba(255, 102, 0, 0.05), 0 8px 20px rgba(0, 0, 0, 0.6)'
                } : {}}>
                  {message.role === 'user' && (
                    <>
                      {/* Animated border glow */}
                      <div className="absolute inset-0 rounded-2xl rounded-tr-sm" style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255, 102, 0, 0.3), transparent)',
                        animation: 'shimmer 3s infinite'
                      }}></div>
                      {/* Inner glow */}
                      <div className="absolute inset-[2px] rounded-2xl rounded-tr-sm" style={{
                        background: 'radial-gradient(circle at top right, rgba(255, 136, 51, 0.1), transparent)'
                      }}></div>
                    </>
                  )}
                  {message.role === 'user' ? (
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap relative z-10" style={{
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.6)'
                    }}>{message.content}</p>
                  ) : (() => {
                    // Check if response is seasonal chart data
                    try {
                      const parsed = JSON.parse(message.content);
                      if (parsed.type === 'seasonal-chart' && parsed.data) {
                        return (
                          <div className="w-full">
                            <h3 className="text-lg font-bold mb-4 text-white">
                              {parsed.data.symbol} - {parsed.data.yearsOfData || 20}Y Seasonal Pattern
                            </h3>
                            <div className="bg-black/50 rounded-lg p-4 border border-gray-800">
                              <SeasonaxMainChart
                                data={{
                                  symbol: parsed.data.symbol,
                                  companyName: parsed.data.companyName || parsed.data.symbol,
                                  currency: 'USD',
                                  period: `${parsed.data.yearsOfData || 20}Y`,
                                  dailyData: parsed.data.dailyData || [],
                                  statistics: parsed.data.statistics || {},
                                  patternReturns: parsed.data.yearlyReturns || {}
                                }}
                                settings={{
                                  startDate: '',
                                  endDate: '',
                                  yearsOfData: parsed.data.yearsOfData || 20,
                                  showCumulative: false,
                                  showPatternReturns: false,
                                  selectedYears: [],
                                  smoothing: true,
                                  detrend: true,
                                  showCurrentDate: true,
                                  comparisonSymbols: []
                                }}
                              />
                            </div>
                          </div>
                        );
                      }
                    } catch (e) {
                      // Not JSON or not seasonal data, render as markdown
                    }
                    return (
                    <div className="prose prose-invert max-w-none overflow-hidden" style={{ maxWidth: '100%' }}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex, rehypeRaw]}
                        components={{
                          code({ inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-lg mt-2 mb-2 text-xs"
                                customStyle={{ fontSize: '11px', maxWidth: '100%', overflowX: 'auto' }}
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="bg-black px-1.5 py-0.5 rounded text-xs text-blue-400 border border-gray-800" {...props}>
                                {children}
                              </code>
                            );
                          },
                          p: ({ children }) => <p className="text-sm leading-relaxed break-words">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-sm">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-sm">{children}</ol>,
                          li: ({ children }) => <li className="text-sm leading-relaxed break-words">{children}</li>,
                          h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-4 break-words">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-3 break-words">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold mb-2 mt-2 break-words">{children}</h3>,
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-4 border-gray-600 pl-4 italic my-3 text-sm">{children}</blockquote>
                          ),
                          a: ({ children, href }) => (
                            <a href={href} className="text-blue-400 hover:underline text-sm break-all" target="_blank" rel="noopener noreferrer">
                              {children}
                            </a>
                          ),
                          img: ({ src, alt }) => (
                            <img 
                              src={src} 
                              alt={alt} 
                              className="max-w-full h-auto rounded-lg my-2"
                              style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain' }}
                            />
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-4 max-w-full">
                              <div style={{
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 133, 0, 0.3), inset 0 0 20px rgba(255, 133, 0, 0.05)',
                                borderRadius: '8px',
                                background: 'linear-gradient(145deg, #0a0a0a, #000000)',
                                maxWidth: '100%'
                              }}>
                                <table className="w-full border-collapse text-xs" style={{ fontSize: '10px' }}>{children}</table>
                              </div>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-black border-b-2 border-orange-500" style={{
                              boxShadow: 'inset 0 -2px 0 rgba(255, 133, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.5)',
                              background: '#000000',
                              transform: 'translateZ(10px)',
                              position: 'relative',
                            }}>{children}</thead>
                          ),
                          tbody: ({ children }) => <tbody className="bg-black" style={{ transform: 'translateZ(0)' }}>{children}</tbody>,
                          tr: ({ children }) => <tr className="border-b border-gray-900 hover:bg-gray-950 transition-all" style={{
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 2px 4px rgba(0, 0, 0, 0.5)',
                            transform: 'translateZ(2px)',
                            transition: 'all 0.2s ease',
                          }}>{children}</tr>,
                          th: ({ children }) => (
                            <th className="px-2 py-2 text-center text-xs font-black uppercase tracking-wider border-r border-gray-800 last:border-r-0 whitespace-nowrap" style={{
                              color: '#ff8500',
                              textShadow: '0 0 8px rgba(255, 133, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.8)',
                              transform: 'translateZ(5px)',
                              fontSize: '9px'
                            }}>
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-2 py-2 text-xs text-gray-200 border-r border-gray-900 last:border-r-0 text-center whitespace-nowrap" style={{
                              textShadow: '0 2px 4px rgba(0, 0, 0, 0.9)',
                              background: 'linear-gradient(180deg, rgba(10, 10, 10, 0.8) 0%, rgba(0, 0, 0, 0.9) 100%)',
                              fontSize: '10px'
                            }}>
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                    );
                  })()}
                </div>
                
                {message.role === 'assistant' && (
                  <button
                    onClick={() => handleCopy(message.content, message.id)}
                    className="mt-2 ml-2 p-1.5 hover:bg-gray-800/50 rounded-lg transition-all duration-200 group border border-transparent hover:border-gray-700"
                    title="Copy message"
                  >
                    {copiedId === message.id ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="bg-[#0a0a0a] rounded-2xl rounded-tl-sm px-4 py-3 inline-block border border-gray-800/50">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 border-t bg-gradient-to-r from-black via-gray-900 to-black relative" style={{
          borderColor: 'rgba(255, 102, 0, 0.3)'
        }}>
          {/* Animated top border */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
            background: 'linear-gradient(90deg, transparent, rgba(255, 102, 0, 0.6), transparent)',
            animation: 'shimmer 3s infinite'
          }}></div>
          
          {/* Quick Search Shortcuts - Only show after ticker + space */}
          {(() => {
            const match = input.match(/^([a-zA-Z]+)\s+$/);
            if (!match) return null;
            const ticker = match[1].toUpperCase();
            
            return (
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider mr-1" style={{
                  color: '#888'
                }}>Quick:</span>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTicker(ticker);
                    setShowSeasonalMenu(true);
                  }}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
                >
                  <TrendingUp className="w-4 h-4 text-white" />
                  <span className="text-white">Seasonal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInput(`${ticker} flow`)}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
                >
                  <DollarSign className="w-4 h-4 text-white" />
                  <span className="text-white">Flow</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInput(`${ticker} best 30day`)}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
                >
                  <Calendar className="w-4 h-4 text-white" />
                  <span className="text-white">Best 30D</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTicker(ticker);
                    setShowOIMenu(true);
                  }}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
                >
                  <TrendingUp className="w-4 h-4 text-white" />
                  <span className="text-white">OI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInput(`${ticker} weekly range`)}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
                >
                  <BarChart3 className="w-4 h-4 text-white" />
                  <span className="text-white">Weekly Range</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInput(`${ticker} monthly range`)}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
                >
                  <Activity className="w-4 h-4 text-white" />
                  <span className="text-white">Monthly Range</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInput(`${ticker} efi`)}
                  className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #FF6600 0%, #FF8833 100%)',
                    border: '1px solid rgba(255, 102, 0, 0.5)'
                  }}
                >
                  <Zap className="w-4 h-4 text-white" />
                  <span className="text-white">EFI</span>
                </button>
              </div>
            );
          })()}
          
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative group">
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-2xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
                background: 'radial-gradient(circle at center, rgba(255, 102, 0, 0.15), transparent 70%)'
              }}></div>
              
              {/* Input container */}
              <div className="relative flex items-center bg-black rounded-2xl transition-all duration-300" style={{
                border: '2px solid rgba(255, 102, 0, 0.3)',
                boxShadow: '0 0 20px rgba(255, 102, 0, 0.1), inset 0 0 20px rgba(0, 0, 0, 0.8)'
              }}>
                <Sparkles className="w-6 h-6 ml-6 flex-shrink-0" style={{
                  color: '#FF8833',
                  filter: 'drop-shadow(0 0 6px rgba(255, 136, 51, 0.5))'
                }} />
                <input
                  ref={textareaRef as any}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit(e as any);
                    }
                  }}
                  placeholder="Ask about options flow, seasonal patterns, or trading strategies..."
                  className="flex-1 px-5 py-5 bg-transparent text-white text-lg font-medium focus:outline-none"
                  style={{
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
                  }}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="flex-shrink-0 mr-3 p-4 text-white rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed relative overflow-hidden group"
                  style={{
                    background: input.trim() && !isLoading 
                      ? 'linear-gradient(135deg, #FF6600 0%, #FF8833 50%, #FF6600 100%)'
                      : 'linear-gradient(135deg, #333 0%, #222 100%)',
                    boxShadow: input.trim() && !isLoading
                      ? '0 0 25px rgba(255, 102, 0, 0.4), inset 0 0 15px rgba(255, 136, 51, 0.1)'
                      : 'none',
                    border: input.trim() && !isLoading
                      ? '1px solid rgba(255, 102, 0, 0.6)'
                      : '1px solid rgba(100, 100, 100, 0.3)'
                  }}
                  title="Send message"
                >
                  {input.trim() && !isLoading && (
                    <div className="absolute inset-0" style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                      animation: 'shimmer 2s infinite'
                    }}></div>
                  )}
                  <Send className="w-6 h-6 relative z-10" style={{
                    filter: input.trim() && !isLoading ? 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.3))' : 'none'
                  }} />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Seasonal Menu Modal */}
      {showSeasonalMenu && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000]" onClick={() => setShowSeasonalMenu(false)}>
          <div className="bg-black rounded-xl p-6 border-2 shadow-2xl" style={{
            borderColor: 'rgba(34, 197, 94, 0.5)',
            boxShadow: '0 0 40px rgba(34, 197, 94, 0.3), 0 20px 60px rgba(0, 0, 0, 0.9)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{
              color: '#4ade80',
              textShadow: '0 0 15px rgba(74, 222, 128, 0.5)'
            }}>Seasonal Analysis - {currentTicker}</h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShow30DayMenu(true);
                  setShowSeasonalMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(147, 51, 234, 0.1) 100%)',
                  border: '1.5px solid rgba(168, 85, 247, 0.4)',
                  color: '#c084fc',
                  textShadow: '0 0 8px rgba(192, 132, 252, 0.3)',
                  boxShadow: '0 0 15px rgba(168, 85, 247, 0.2)'
                }}
              >
                <Calendar className="w-4 h-4 inline mr-2" />
                30-Day Periods
              </button>
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} seasonal`);
                  setShowSeasonalMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%)',
                  border: '1.5px solid rgba(34, 197, 94, 0.4)',
                  color: '#4ade80',
                  textShadow: '0 0 8px rgba(74, 222, 128, 0.3)',
                  boxShadow: '0 0 15px rgba(34, 197, 94, 0.2)'
                }}
              >
                <TrendingUp className="w-4 h-4 inline mr-2" />
                20-Year Pattern
              </button>
              <button
                onClick={() => {
                  setShowElectionMenu(true);
                  setShowSeasonalMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%)',
                  border: '1.5px solid rgba(59, 130, 246, 0.4)',
                  color: '#60a5fa',
                  textShadow: '0 0 8px rgba(96, 165, 250, 0.3)',
                  boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)'
                }}
              >
                <Sparkles className="w-4 h-4 inline mr-2" />
                Election Cycles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 30-Day Menu Modal */}
      {show30DayMenu && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000]" onClick={() => setShow30DayMenu(false)}>
          <div className="bg-black rounded-xl p-6 border-2 shadow-2xl" style={{
            borderColor: 'rgba(168, 85, 247, 0.5)',
            boxShadow: '0 0 40px rgba(168, 85, 247, 0.3), 0 20px 60px rgba(0, 0, 0, 0.9)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{
              color: '#c084fc',
              textShadow: '0 0 15px rgba(192, 132, 252, 0.5)'
            }}>30-Day Periods - {currentTicker}</h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} best 30day`);
                  setShow30DayMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%)',
                  border: '1.5px solid rgba(34, 197, 94, 0.4)',
                  color: '#4ade80',
                  textShadow: '0 0 8px rgba(74, 222, 128, 0.3)',
                  boxShadow: '0 0 15px rgba(34, 197, 94, 0.2)'
                }}
              >
                <TrendingUp className="w-4 h-4 inline mr-2" />
                Best 30-Day (Bullish)
              </button>
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} worst 30day`);
                  setShow30DayMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.1) 100%)',
                  border: '1.5px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  textShadow: '0 0 8px rgba(248, 113, 113, 0.3)',
                  boxShadow: '0 0 15px rgba(239, 68, 68, 0.2)'
                }}
              >
                <TrendingUp className="w-4 h-4 inline mr-2 rotate-180" />
                Worst 30-Day (Bearish)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Election Cycle Menu Modal */}
      {showElectionMenu && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000]" onClick={() => setShowElectionMenu(false)}>
          <div className="bg-black rounded-xl p-6 border-2 shadow-2xl" style={{
            borderColor: 'rgba(59, 130, 246, 0.5)',
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.3), 0 20px 60px rgba(0, 0, 0, 0.9)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{
              color: '#60a5fa',
              textShadow: '0 0 15px rgba(96, 165, 250, 0.5)'
            }}>Election Cycles - {currentTicker}</h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} post election`);
                  setShowElectionMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%)',
                  border: '1.5px solid rgba(34, 197, 94, 0.4)',
                  color: '#4ade80',
                  textShadow: '0 0 8px rgba(74, 222, 128, 0.3)',
                  boxShadow: '0 0 15px rgba(34, 197, 94, 0.2)'
                }}
              >
                Post-Election Year
              </button>
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} mid term`);
                  setShowElectionMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%)',
                  border: '1.5px solid rgba(59, 130, 246, 0.4)',
                  color: '#60a5fa',
                  textShadow: '0 0 8px rgba(96, 165, 250, 0.3)',
                  boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)'
                }}
              >
                Mid-Term Year
              </button>
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} pre election`);
                  setShowElectionMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(147, 51, 234, 0.1) 100%)',
                  border: '1.5px solid rgba(168, 85, 247, 0.4)',
                  color: '#c084fc',
                  textShadow: '0 0 8px rgba(192, 132, 252, 0.3)',
                  boxShadow: '0 0 15px rgba(168, 85, 247, 0.2)'
                }}
              >
                Pre-Election Year
              </button>
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} election year`);
                  setShowElectionMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 102, 0, 0.15) 0%, rgba(255, 136, 51, 0.1) 100%)',
                  border: '1.5px solid rgba(255, 102, 0, 0.4)',
                  color: '#FF8833',
                  textShadow: '0 0 8px rgba(255, 136, 51, 0.4)',
                  boxShadow: '0 0 15px rgba(255, 102, 0, 0.2)'
                }}
              >
                Election Year
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OI Menu Modal */}
      {showOIMenu && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000]" onClick={() => setShowOIMenu(false)}>
          <div className="bg-black rounded-xl p-6 border-2 shadow-2xl" style={{
            borderColor: 'rgba(100, 100, 100, 0.5)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-white">
              {currentTicker} - Select OI Timeframe
            </h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} oi weekly`);
                  setShowOIMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
              >
                <Calendar className="w-4 h-4 inline mr-2 text-white" />
                <span className="text-white">This Week</span>
              </button>
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} oi monthly`);
                  setShowOIMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
              >
                <Calendar className="w-4 h-4 inline mr-2 text-white" />
                <span className="text-white">This Month</span>
              </button>
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} oi quadwitching`);
                  setShowOIMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
              >
                <Sparkles className="w-4 h-4 inline mr-2 text-white" />
                <span className="text-white">Quad Witching</span>
              </button>
              <button
                onClick={() => {
                  submitQuery(`${currentTicker} oi all`);
                  setShowOIMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #FF6600 0%, #FF8833 100%)',
                  border: '1px solid rgba(255, 102, 0, 0.5)'
                }}
              >
                <TrendingUp className="w-4 h-4 inline mr-2 text-white" />
                <span className="text-white">All Dates</span>
              </button>
              <button
                onClick={() => {
                  setInput(`${currentTicker} oi `);
                  setShowOIMenu(false);
                }}
                className="px-6 py-3 rounded-lg text-left font-semibold transition-all duration-200 hover:scale-105 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600"
              >
                <Calendar className="w-4 h-4 inline mr-2 text-white" />
                <span className="text-white">Specific Date (type after)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
