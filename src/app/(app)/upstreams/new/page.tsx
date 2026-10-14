import UpstreamForm from "@/components/upstream-form";

export default function NewUpstreamPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Add Upstream ISP</h1>
      <UpstreamForm mode="create" />
    </div>
  );
}
