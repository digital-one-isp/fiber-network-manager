import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/logout-button";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            Fiber Network Manager
          </h1>
          <LogoutButton />
        </div>

        <div className="mt-6 space-y-1 text-sm text-gray-700">
          <p><span className="font-medium">Email:</span> {user.email}</p>
          <p><span className="font-medium">Full name:</span> {profile?.full_name ?? "(not set)"}</p>
          <p><span className="font-medium">Role:</span> {profile?.role}</p>
        </div>
      </div>
    </div>
  );
}
