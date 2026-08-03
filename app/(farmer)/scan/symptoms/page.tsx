"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScanStepper } from "@/components/scan/scan-stepper";
import { useScanSession } from "@/features/diagnosis/scan-session-provider";

const questions = [
  { id: "spread", label: "How quickly are the symptoms spreading?", options: ["Not spreading", "Slowly", "Quickly", "Not sure"] },
  { id: "area", label: "How much of the field appears affected?", options: ["A few plants", "Less than 25%", "25–50%", "More than 50%"] },
  { id: "insects", label: "Can you see insects or sticky residue?", options: ["Yes", "No", "Not sure"] },
];

export default function SymptomsPage() {
  const router = useRouter();
  const { updateSession } = useScanSession();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = questions.every((question) => answers[question.id]);
  function submit(event: React.FormEvent) { event.preventDefault(); if (!complete) return; updateSession({ step: "analysis", progress: 60 }); router.push("/scan/analysis"); }
  return <div className="page-container space-y-5"><ScanStepper current="symptoms"/><header><p className="text-sm font-bold text-success">Step 3 of 5</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Tell us what you observed</h1><p className="mt-2 max-w-2xl text-sm text-muted">These answers help estimate field severity. They do not confirm the AI diagnosis.</p></header><form onSubmit={submit} className="card max-w-3xl space-y-6 p-5 md:p-7">{questions.map((question) => <fieldset key={question.id}><legend className="text-sm font-extrabold">{question.label}</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{question.options.map((option) => <label key={option} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm font-semibold ${answers[question.id] === option ? "border-brand bg-brand-soft text-brand-dark" : "border-border hover:bg-surface-soft"}`}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}/>{option}</label>)}</div></fieldset>)}<div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between"><Link href="/scan/upload" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-bold">Back</Link><button type="submit" disabled={!complete} className="min-h-11 rounded-xl bg-brand px-6 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">Start AI analysis</button></div></form></div>;
}
