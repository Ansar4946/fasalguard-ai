import { DiagnosisResults } from "@/components/scan/diagnosis-results";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ScanResultsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  // `?id=` opens any past scan (e.g. from the dashboard); without it, the in-progress scan is shown.
  return <DiagnosisResults scanId={id && uuidPattern.test(id) ? id : null} />;
}
