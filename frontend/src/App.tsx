import { useState, useRef, useCallback } from 'react';
import { Brain, Search, BarChart2, Zap, Globe, BookOpen, ChevronRight, Loader2, CheckCircle, AlertCircle, Github, ExternalLink, Play, X } from 'lucide-react';

type AgentRole = 'planner' | 'researcher' | 'analyst' | 'synthesizer';
type EventType = 'step' | 'tool' | 'thinking' | 'answer' | 'error' | 'done';

interface StreamEvent {
  event: EventType;
  agent: AgentRole | null;
  data: Record<string, unknown>;
}

interface AgentEntry {
  role: AgentRole;
  thoughts: string[];
  tools: { tool: string; input: string; output: string; ms: number }[];
  answer: string;
  status: 'idle' | 'running' | 'done' | 'error';
}

const AGENT_CONFIG: Record<AgentRole, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  planner:     { label: 'Planner',     color: '#8b5cf6', icon: <Brain size={16}/>,    desc: 'Breaks task into execution plan' },
  researcher:  { label: 'Researcher',  color: '#06b6d4', icon: <Search size={16}/>,   desc: 'Searches web + Wikipedia' },
  analyst:     { label: 'Analyst',     color: '#f59e0b', icon: <BarChart2 size={16}/>, desc: 'Evaluates and draws insights' },
  synthesizer: { label: 'Synthesizer', color: '#10b981', icon: <Zap size={16}/>,      desc: 'Produces final answer' },
};

const EXAMPLES = [
  'What are the most important breakthroughs in AI agents in 2024?',
  'Explain the difference between RAG and fine-tuning for LLMs',
  'What is SELF-RAG and how does it work?',
  'What companies are leading in multi-agent AI systems?',
];

function AgentCard({ entry }: { entry: AgentEntry }) {
  const cfg = AGENT_CONFIG[entry.role];
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      border: `1px solid ${entry.status === 'running' ? cfg.color + '60' : '#1a2d4a'}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 12,
      background: entry.status === 'running' ? cfg.color + '08' : '#0d1526',
      transition: 'all 0.3s',
      boxShadow: entry.status === 'running' ? `0 0 20px ${cfg.color}20` : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
           onClick={() => setExpanded(e => !e)}>
        <div style={{ color: cfg.color }}>{cfg.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: cfg.color }}>{cfg.label}</div>
          <div style={{ fontSize: 12, color: '#6b8aaa' }}>{cfg.desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {entry.status === 'running' && (
            <Loader2 size={16} color={cfg.color} style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {entry.status === 'done' && <CheckCircle size={16} color="#10b981" />}
          {entry.status === 'error' && <AlertCircle size={16} color="#ef4444" />}
          {(entry.thoughts.length > 0 || entry.tools.length > 0) && (
            <ChevronRight size={14} color="#6b8aaa"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          )}
        </div>
      </div>

      {/* Expanded trace */}
      {expanded && (entry.thoughts.length > 0 || entry.tools.length > 0) && (
        <div style={{ borderTop: '1px solid #1a2d4a', padding: '12px 16px' }}>
          {entry.thoughts.map((t, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b8aaa', marginBottom: 2 }}>
                THOUGHT {i + 1}
              </div>
              <div style={{ fontSize: 13, color: '#c8d8e8', lineHeight: 1.5,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                {t}
              </div>
            </div>
          ))}
          {entry.tools.map((tc, i) => (
            <div key={i} style={{ marginTop: 8, background: '#080e1a', borderRadius: 8,
              border: '1px solid #1a2d4a', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                {tc.tool === 'web_search' ? <Globe size={12} color="#06b6d4"/> : <BookOpen size={12} color="#8b5cf6"/>}
                <span style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4',
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  {tc.tool}({tc.ms}ms)
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#6b8aaa', marginBottom: 4 }}>
                Input: <span style={{ color: '#c8d8e8' }}>{tc.input}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6b8aaa', maxHeight: 80, overflow: 'hidden',
                textOverflow: 'ellipsis' }}>
                {tc.output.slice(0, 300)}{tc.output.length > 300 ? '...' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Answer */}
      {entry.answer && (
        <div style={{ borderTop: '1px solid #1a2d4a', padding: '12px 16px',
          fontSize: 13, color: '#c8d8e8', lineHeight: 1.6,
          maxHeight: expanded ? 'none' : 80, overflow: 'hidden' }}>
          {entry.answer}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<Record<AgentRole, AgentEntry>>(() =>
    Object.fromEntries(
      (['planner', 'researcher', 'analyst', 'synthesizer'] as AgentRole[]).map(r => [
        r, { role: r, thoughts: [], tools: [], answer: '', status: 'idle' }
      ])
    ) as Record<AgentRole, AgentEntry>
  );
  const [finalAnswer, setFinalAnswer] = useState('');
  const [meta, setMeta] = useState<{ tokens: number; ms: number } | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const resetState = useCallback(() => {
    setAgents(Object.fromEntries(
      (['planner', 'researcher', 'analyst', 'synthesizer'] as AgentRole[]).map(r => [
        r, { role: r, thoughts: [], tools: [], answer: '', status: 'idle' }
      ])
    ) as Record<AgentRole, AgentEntry>);
    setFinalAnswer('');
    setMeta(null);
    setError('');
  }, []);

  const handleRun = useCallback(async () => {
    if (!task.trim() || running) return;
    resetState();
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const API = import.meta.env.VITE_API_URL || '';

    try {
      const res = await fetch(`${API}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.trim(), max_iterations: 6 }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setError(err.detail || 'Request failed');
        setRunning(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const ev: StreamEvent = JSON.parse(raw);
            handleEvent(ev);
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message || 'Connection failed. Is the backend running?');
      }
    } finally {
      setRunning(false);
    }
  }, [task, running, resetState]);

  const handleEvent = (ev: StreamEvent) => {
    if (ev.event === 'thinking') {
      if (ev.agent) {
        setAgents(a => ({ ...a, [ev.agent!]: { ...a[ev.agent!], status: 'running' } }));
      }
    } else if (ev.event === 'step') {
      if (ev.agent && ev.data.thought) {
        setAgents(a => ({
          ...a,
          [ev.agent!]: {
            ...a[ev.agent!],
            thoughts: [...a[ev.agent!].thoughts, ev.data.thought as string],
          }
        }));
      }
    } else if (ev.event === 'tool') {
      if (ev.agent) {
        const td = ev.data as { tool: string; input: string; output: string; duration_ms: number };
        setAgents(a => ({
          ...a,
          [ev.agent!]: {
            ...a[ev.agent!],
            tools: [...a[ev.agent!].tools, { tool: td.tool, input: td.input, output: td.output, ms: td.duration_ms }],
          }
        }));
      }
    } else if (ev.event === 'answer') {
      if (ev.agent) {
        setAgents(a => ({
          ...a,
          [ev.agent!]: {
            ...a[ev.agent!],
            answer: ev.data.answer as string,
            status: 'done',
          }
        }));
      }
    } else if (ev.event === 'done') {
      setFinalAnswer(ev.data.final_answer as string || '');
      setMeta({ tokens: ev.data.total_tokens as number, ms: ev.data.duration_ms as number });
      setAgents(a => {
        const next = { ...a };
        (Object.keys(next) as AgentRole[]).forEach(r => {
          if (next[r].status === 'running') next[r] = { ...next[r], status: 'done' };
        });
        return next;
      });
    } else if (ev.event === 'error') {
      setError((ev.data.error as string) || 'Unknown error');
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#080e1a' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: '1px solid #1a2d4a',
        background: '#0d1526', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={16} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#e8f4ff' }}>AgentMesh</span>
          <span style={{ fontSize: 11, background: '#06b6d420', border: '1px solid #06b6d440',
            color: '#06b6d4', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>v1.0</span>
        </div>
        <a href="https://github.com/bharghavaram/agentmesh" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b8aaa', textDecoration: 'none',
            fontSize: 13, transition: 'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#06b6d4')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6b8aaa')}>
          <Github size={16} />
          GitHub
          <ExternalLink size={12} />
        </a>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8,
            background: 'linear-gradient(135deg, #e8f4ff, #06b6d4, #8b5cf6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Multi-Agent AI Orchestration
          </h1>
          <p style={{ color: '#6b8aaa', fontSize: 15, maxWidth: 500, margin: '0 auto' }}>
            Watch 4 specialized agents — Planner, Researcher, Analyst, Synthesizer — 
            collaborate in real-time using the ReAct framework.
          </p>
        </div>

        {/* Input */}
        <div style={{ background: '#0d1526', border: '1px solid #1a2d4a', borderRadius: 16,
          padding: 20, marginBottom: 24 }}>
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun(); }}
            placeholder="Ask anything — the agents will research, analyze, and synthesize an answer..."
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: '#e8f4ff', fontSize: 15, resize: 'none', fontFamily: 'Inter, sans-serif',
              minHeight: 80, lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EXAMPLES.slice(0, 2).map((ex, i) => (
                <button key={i} onClick={() => setTask(ex)}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                    background: '#111d31', border: '1px solid #1a2d4a', color: '#6b8aaa',
                    transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget.style.color = '#06b6d4'); (e.currentTarget.style.borderColor = '#06b6d440'); }}
                  onMouseLeave={e => { (e.currentTarget.style.color = '#6b8aaa'); (e.currentTarget.style.borderColor = '#1a2d4a'); }}>
                  {ex.slice(0, 40)}...
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {running && (
                <button onClick={handleStop}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                    borderRadius: 10, cursor: 'pointer', background: '#1a2d4a',
                    border: '1px solid #ef444440', color: '#ef4444', fontWeight: 600, fontSize: 13 }}>
                  <X size={14} /> Stop
                </button>
              )}
              <button onClick={handleRun} disabled={!task.trim() || running}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
                  borderRadius: 10, cursor: task.trim() && !running ? 'pointer' : 'not-allowed',
                  background: task.trim() && !running ? '#06b6d4' : '#1a2d4a',
                  border: 'none', color: task.trim() && !running ? '#080e1a' : '#6b8aaa',
                  fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
                  boxShadow: task.trim() && !running ? '0 0 20px #06b6d430' : 'none' }}>
                {running ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <Play size={14}/>}
                {running ? 'Running...' : 'Run Agents'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, color: '#ef4444', fontSize: 13, display: 'flex',
            alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16}/> {error}
          </div>
        )}

        {/* Agent pipeline */}
        {(running || Object.values(agents).some(a => a.status !== 'idle')) && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b8aaa', letterSpacing: '0.08em',
              marginBottom: 12 }}>AGENT PIPELINE</div>
            {(['planner', 'researcher', 'analyst', 'synthesizer'] as AgentRole[]).map(role => (
              <AgentCard key={role} entry={agents[role]} />
            ))}
          </div>
        )}

        {/* Final answer */}
        {finalAnswer && (
          <div style={{ background: '#0d1526', border: '1px solid #10b98140', borderRadius: 16,
            padding: 24, marginTop: 8, boxShadow: '0 0 30px #10b98110' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <CheckCircle size={18} color="#10b981"/>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#10b981' }}>Final Answer</span>
              {meta && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b8aaa', fontFamily: 'JetBrains Mono, monospace' }}>
                  {meta.tokens.toLocaleString()} tokens · {(meta.ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <div style={{ color: '#c8d8e8', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {finalAnswer}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
