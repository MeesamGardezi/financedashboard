'use client';
import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export default function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Ask me anything about your transactions.\n\nExamples:\n• "Did we pay AT&T this month?"\n• "How much did we spend on Champion Energy this year?"\n• "What\'s the history of payments to Jerry Vaughn?"\n• "Show me all Chase transactions last month"\n• "What are my current balances?"' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: q }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', text: data.answer || 'No response.' }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Error: could not reach the server.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--rule)', background: '#faf9f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
          Transaction Q&amp;A
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink4)' }}>
          searches real data only · free
        </span>
      </div>

      {/* Messages */}
      <div style={{ padding: '12px 18px', maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '8px 12px',
              borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              background: m.role === 'user' ? 'var(--ink)' : '#f0ede8',
              color: m.role === 'user' ? '#fff' : 'var(--ink)',
              fontSize: 12,
              lineHeight: 1.6,
              fontFamily: 'var(--font-body)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '8px 12px', borderRadius: '10px 10px 10px 2px', background: '#f0ede8', color: 'var(--ink4)', fontSize: 12 }}>
              Searching...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 18px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask about your transactions..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            background: 'var(--bg)',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: '8px 16px',
            background: loading || !input.trim() ? 'var(--rule)' : 'var(--ink)',
            color: loading || !input.trim() ? 'var(--ink4)' : '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            fontFamily: 'var(--font-body)',
            transition: 'background .15s',
          }}
        >
          Ask
        </button>
      </div>
    </div>
  );
}
