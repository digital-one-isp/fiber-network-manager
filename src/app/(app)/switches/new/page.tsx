import SwitchForm from "@/components/switch-form";

export default function NewSwitchPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Add Switch</h1>
      <SwitchForm mode="create" />
    </div>
  );
}
