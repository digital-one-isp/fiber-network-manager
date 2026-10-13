"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/network", label: "Network Overview" },
  { href: "/olts", label: "OLTs" },
  { href: "/switches", label: "Switches" },
  { href: "/fiber-cables", label: "Fiber Cables" },
  { href: "/tg-boxes", label: "TG / Joint Boxes" },
  { href: "/splitters", label: "Splitters" },
  { href: "/customers", label: "Customers" },
  { href: "/resellers", label: "Resellers" },
  { href: "/faults", label: "Faults" },
  { href: "/map", label: "Network Map" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white md:block">
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <span className="text-sm font-semibold text-gray-900">
          Fiber Network Manager
        </span>
      </div>
      <nav className="space-y-0.5 p-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
