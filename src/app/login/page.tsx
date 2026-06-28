import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") ? next : "/";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <LoginForm next={safeNext} />
    </div>
  );
}
