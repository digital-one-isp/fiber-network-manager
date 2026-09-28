import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/logout-button";

export default async function Header() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let roleLabel = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();
    roleLabel = profile?.full_name
      ? `${profile.full_name} (${profile.role})`
      : (profile?.role ?? "");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <span className="text-sm text-gray-500">
        {user?.email} {roleLabel && `· ${roleLabel}`}
      </span>
      <LogoutButton />
    </header>
  );
}
