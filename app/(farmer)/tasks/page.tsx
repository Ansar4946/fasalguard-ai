import type { Metadata } from "next";
import { FarmerTasks } from "@/components/tasks/farmer-tasks";

export const metadata: Metadata = { title: "Tasks" };
export default function TasksPage() { return <FarmerTasks/>; }
