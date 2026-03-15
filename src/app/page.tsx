"use client";

import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import SearchBar from "@/components/SearchBar";
import shell from "@/components/AppShell.module.css";

export default function Home() {
  return (
    <AppShell>
      {({ openSidebar }) => (
        <Suspense fallback={<div className={shell.loading}>Initializing…</div>}>
          <SearchBar onOpenSidebar={openSidebar} />
        </Suspense>
      )}
    </AppShell>
  );
}
