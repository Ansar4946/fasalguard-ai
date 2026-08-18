import type { Metadata } from "next";
import { CreateFarmForm } from "@/components/farms/create-farm-form";

export const metadata: Metadata = {
  title: "Add Farm",
  description: "Register a new farm and map its boundary.",
};

export default function NewFarmPage() {
  return (
    <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-8">
      <header>
        <h1 className="text-[28px] font-extrabold leading-tight text-brand-dark">Add Farm</h1>
        <p className="mt-1 text-sm text-muted">
          Draw the farm boundary on the map, then fill in the details below.
        </p>
      </header>
      <CreateFarmForm />
    </div>
  );
}
