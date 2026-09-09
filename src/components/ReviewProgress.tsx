import { CheckCircle2, Clock, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { ReviewStatus } from '@/types/domain';

const PIPELINE_STEPS = [
  { key: 'acquisiton', label: 'Acquisition', desc: 'Git checkout & SHA' },
  { key: 'static_analysis', label: 'SAST & Code Index', desc: 'Semgrep & AST graph' },
  { key: 'agent_review', label: 'AI Agent Reasoning', desc: 'Security, Bug & Quality' },
  { key: 'verification', label: 'Verification Agent', desc: 'False-positive disproval' },
  { key: 'completed', label: 'Report Generation', desc: 'Final audit report' },
];

export function ReviewProgress({
  status,
  progressPercent,
  currentPhase,
  error,
}: {
  status: ReviewStatus;
  progressPercent: number;
  currentPhase: string;
  error?: string;
}) {
  const getStepStatus = (stepKey: string) => {
    if (status === 'failed') {
      let failedStep = 'acquisiton';
      if (progressPercent > 80) failedStep = 'completed';
      else if (progressPercent > 60) failedStep = 'verification';
      else if (progressPercent > 30) failedStep = 'agent_review';
      else if (progressPercent > 10) failedStep = 'static_analysis';

      const stepOrder = ['acquisiton', 'static_analysis', 'agent_review', 'verification', 'completed'];
      const failedIdx = stepOrder.indexOf(failedStep);
      const currentIdx = stepOrder.indexOf(stepKey);

      if (currentIdx < failedIdx) return 'completed';
      if (currentIdx === failedIdx) return 'failed';
      return 'pending';
    }

    const order = ['queued', 'acquisiton', 'static_analysis', 'agent_review', 'verification', 'completed'];
    const currentIndex = order.indexOf(status);
    const stepIndex = order.indexOf(stepKey);

    if (currentIndex > stepIndex || status === 'completed') return 'completed';
    if (currentIndex === stepIndex) return 'in_progress';
    return 'pending';
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/60 p-6 backdrop-blur-xl shadow-2xl">
      {/* Background Glow */}
      <div className="absolute top-0 right-1/4 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Multi-Agent Review Pipeline</h3>
          </div>
          <p className="text-xs font-mono text-slate-400">{currentPhase}</p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-extrabold px-3.5 py-1.5 rounded-full border shadow-inner ${
              status === 'failed'
                ? 'text-rose-300 bg-rose-500/10 border-rose-500/30'
                : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30'
            }`}
          >
            {status === 'failed' ? 'FAILED' : `${progressPercent}% COMPLETE`}
          </span>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden mb-6 border border-slate-800/80 p-0.5">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out shadow-lg ${
            status === 'failed'
              ? 'bg-rose-500 shadow-rose-500/20'
              : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 shadow-indigo-500/20'
          }`}
          style={{ width: `${Math.max(5, progressPercent)}%` }}
        />
      </div>

      {/* Timeline Nodes */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {PIPELINE_STEPS.map((step, idx) => {
          const stepStatus = getStepStatus(step.key);
          return (
            <div
              key={step.key}
              className={`relative flex flex-col p-4 rounded-2xl border transition-all duration-300 ${
                stepStatus === 'completed'
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                  : stepStatus === 'in_progress'
                  ? 'border-indigo-500/60 bg-gradient-to-b from-indigo-500/15 to-purple-500/10 text-white shadow-xl shadow-indigo-500/10 scale-[1.02]'
                  : stepStatus === 'failed'
                  ? 'border-rose-500/50 bg-rose-500/15 text-rose-300 shadow-lg shadow-rose-500/10'
                  : 'border-slate-800/80 bg-slate-950/40 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 font-mono">0{idx + 1}</span>
                <div>
                  {stepStatus === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  {stepStatus === 'in_progress' && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />}
                  {stepStatus === 'pending' && <Clock className="h-4 w-4 text-slate-600" />}
                  {stepStatus === 'failed' && <AlertCircle className="h-4 w-4 text-rose-400" />}
                </div>
              </div>
              <span className="text-xs font-bold leading-snug">{step.label}</span>
              <span className="text-[10px] text-slate-400 mt-1">{step.desc}</span>
            </div>
          );
        })}
      </div>

      {/* Inline Failure Callout */}
      {status === 'failed' && error && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-200 backdrop-blur-md animate-in fade-in">
          <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-rose-300">Execution Error</p>
            <p className="text-slate-200 font-sans leading-relaxed">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
