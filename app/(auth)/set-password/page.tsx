import { SetPasswordForm } from "@/components/auth/set-password-form";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top,rgba(217,245,199,.45),transparent_35%),#f8f4ea] p-4">
      <SetPasswordForm token={token} />
    </main>
  );
}
