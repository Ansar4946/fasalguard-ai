import { redirect } from "next/navigation";
// There is no cross-farm fields list endpoint yet (tracked in docs/API_PRODUCTION_CHECKLIST.md).
// Send the user to a real farm they can pick a Fields tab from, instead of a fake hardcoded farm id.
export default function FieldsPage() { redirect("/farms"); }
