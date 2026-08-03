import { notFound } from "next/navigation";
import { CaseReview } from "@/components/expert/case-review";
import { expertCases } from "@/features/expert/data";
export function generateStaticParams(){return expertCases.map(x=>({caseId:x.id}))}
export default async function CasePage({params}:{params:Promise<{caseId:string}>}){const {caseId}=await params;const item=expertCases.find(x=>x.id===caseId);if(!item)notFound();return <CaseReview expertCase={item}/>}
