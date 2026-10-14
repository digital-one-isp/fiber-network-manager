import SiteForm from "@/components/site-form";

export default function NewSitePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Add Site</h1>
      <SiteForm mode="create" />
    </div>
  );
}
