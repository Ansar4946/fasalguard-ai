const steps = ["Personal Information", "Farm Details", "First Field", "Preferences", "Complete"];

export function OnboardingStepper({ current }: { current: number }) {
  return <div><div className="flex items-center justify-between gap-4 text-[11px] font-bold sm:text-xs"><span className="text-brand-dark">Step {current} of 5</span><span className="text-success">{steps[current - 1]}</span></div><div className="mt-3 flex h-1.5 gap-1.5" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={current * 20}>{steps.map((step, index) => <span key={step} className={`h-full flex-1 rounded-full transition-colors ${index < current ? "bg-brand shadow-[0_2px_8px_rgba(7,95,61,.18)]" : "bg-[#dce7df]"}`} />)}</div></div>;
}
