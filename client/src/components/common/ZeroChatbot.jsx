import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, Loader2, Plus, History, ChevronLeft, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'ztcs_chat_history';
const MAX_CHATS = 20;

const loadChats = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
};

const saveChats = (chats) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
};

const ZeroChatbot = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState(loadChats);
  const [activeChatId, setActiveChatId] = useState(null);
  const messagesEndRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when dialog opens or history closes
  useEffect(() => {
    if (isOpen && !showHistory) inputRef.current?.focus();
  }, [isOpen, showHistory]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Save current chat to history when it has messages
  const saveCurrentChat = useCallback((msgs) => {
    if (msgs.length === 0) return;
    const firstUserMsg = msgs.find(m => m.role === 'user');
    const title = firstUserMsg ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '') : 'New chat';

    setChatHistory(prev => {
      let updated;
      if (activeChatId) {
        updated = prev.map(c => c.id === activeChatId ? { ...c, messages: msgs, title, updatedAt: Date.now() } : c);
      } else {
        const id = Date.now().toString();
        setActiveChatId(id);
        updated = [{ id, title, messages: msgs, createdAt: Date.now(), updatedAt: Date.now() }, ...prev];
      }
      saveChats(updated);
      return updated;
    });
  }, [activeChatId]);

  // Start fresh chat when opening
  const handleOpen = () => {
    setIsOpen(true);
    setMessages([]);
    setActiveChatId(null);
    setShowHistory(false);
  };

  const handleNewChat = () => {
    setMessages([]);
    setActiveChatId(null);
    setShowHistory(false);
  };

  const handleLoadChat = (chat) => {
    setMessages(chat.messages);
    setActiveChatId(chat.id);
    setShowHistory(false);
  };

  const handleDeleteChat = (e, chatId) => {
    e.stopPropagation();
    setChatHistory(prev => {
      const updated = prev.filter(c => c.id !== chatId);
      saveChats(updated);
      return updated;
    });
    if (activeChatId === chatId) {
      setMessages([]);
      setActiveChatId(null);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const { data } = await api.post('/chat/message', {
        message: text,
        history: newMessages.slice(-20),
      });
      const withReply = [...newMessages, { role: 'assistant', content: data.data.reply }];
      setMessages(withReply);
      saveCurrentChat(withReply);
    } catch (err) {
      if (err.response?.status === 429) {
        toast.error('Slow down — wait a moment before sending again.');
      } else {
        const withError = [...newMessages, { role: 'assistant', content: "Something went wrong. Please try again." }];
        setMessages(withError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => isOpen ? setIsOpen(false) : handleOpen()}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-105"
        style={{
          background: isOpen ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(139,92,246,0.15))',
          border: `1px solid ${isOpen ? 'rgba(239,68,68,0.25)' : 'rgba(6,182,212,0.25)'}`,
          boxShadow: isOpen ? '0 0 24px rgba(239,68,68,0.15)' : '0 0 24px rgba(6,182,212,0.15)',
          backdropFilter: 'blur(16px)',
        }}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen
          ? <X className="w-5 h-5" style={{ color: 'var(--red)' }} />
          : <MessageCircle className="w-5 h-5" style={{ color: 'var(--cyan)' }} />
        }
      </button>

      {/* Chat Dialog */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed bottom-20 right-6 z-50 flex flex-col animate-scale"
          style={{
            width: 380,
            maxWidth: 'calc(100vw - 2rem)',
            height: 520,
            maxHeight: 'calc(100vh - 8rem)',
            background: 'var(--panel-bg)',
            backdropFilter: 'blur(24px)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 16px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {showHistory ? (
              <>
                <button onClick={() => setShowHistory(false)} className="icon-btn" aria-label="Back to chat">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-xs font-semibold flex-1">Chat History</p>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                  background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.15)',
                }}>
                  <Bot className="w-4 h-4" style={{ color: 'var(--cyan)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">
                    <span style={{ color: 'var(--cyan)' }}>Zero</span>
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--muted)' }}>ZTCS Assistant</p>
                </div>
                <button onClick={handleNewChat} className="icon-btn" aria-label="New chat" title="New chat">
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={() => setShowHistory(true)} className="icon-btn" aria-label="Chat history" title="Chat history">
                  <History className="w-4 h-4" />
                </button>
                <button onClick={() => setIsOpen(false)} className="icon-btn" aria-label="Close chat">
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {showHistory ? (
            /* ─── History Panel ─── */
            <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: 'thin' }}>
              {chatHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <History className="w-8 h-8 mb-3" style={{ color: 'var(--muted)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>No previous chats</p>
                </div>
              ) : (
                chatHistory.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => handleLoadChat(chat)}
                    className="w-full text-left px-3 py-2.5 rounded-lg mb-1 flex items-center gap-2 transition-all group"
                    style={{
                      background: activeChatId === chat.id ? 'rgba(6,182,212,0.08)' : 'transparent',
                      border: `1px solid ${activeChatId === chat.id ? 'rgba(6,182,212,0.12)' : 'transparent'}`,
                    }}
                    onMouseEnter={e => { if (activeChatId !== chat.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { if (activeChatId !== chat.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{chat.title}</p>
                      <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                        {chat.messages.length} messages · {formatTime(chat.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      className="icon-btn opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="w-3 h-3" style={{ color: 'var(--red)' }} />
                    </button>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              {/* ─── Messages ─── */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: 'thin' }}>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{
                      background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.1)',
                    }}>
                      <Bot className="w-7 h-7" style={{ color: 'var(--cyan)', opacity: 0.6 }} />
                    </div>
                    <p className="text-sm font-semibold mb-1.5">
                      Hi{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! How can I help?
                    </p>
                    <p className="text-[11px] max-w-[240px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                      Ask me about file management, risk scores, step-up auth, security settings, or anything else in ZTCS.
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[85%] px-3 py-2 text-[12px] leading-relaxed"
                      style={{
                        borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        background: msg.role === 'user'
                          ? 'rgba(6,182,212,0.12)'
                          : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.06)'}`,
                        color: 'var(--text2)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex justify-start">
                    <div className="px-3 py-2.5 flex items-center gap-1" style={{
                      borderRadius: '12px 12px 12px 4px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <span className="typing-dot" style={{ animationDelay: '0ms' }} />
                      <span className="typing-dot" style={{ animationDelay: '150ms' }} />
                      <span className="typing-dot" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* ─── Input ─── */}
              <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about ZTCS..."
                  maxLength={500}
                  disabled={loading}
                  className="flex-1 text-xs"
                  style={{ margin: 0 }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: input.trim() && !loading ? 'rgba(6,182,212,0.15)' : 'transparent',
                    border: `1px solid ${input.trim() && !loading ? 'rgba(6,182,212,0.2)' : 'transparent'}`,
                    color: input.trim() && !loading ? 'var(--cyan)' : 'var(--muted2)',
                  }}
                >
                  {loading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Typing dots animation */}
      <style>{`
        .typing-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--muted);
          animation: typingBounce 1.2s ease-in-out infinite;
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </>
  );
};

export default ZeroChatbot;
