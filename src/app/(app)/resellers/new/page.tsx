import ResellerForm from "@/components/reseller-form";

export default function NewResellerPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Add Reseller</h1>
      <ResellerForm mode="create" />
    </div>
  );
}
