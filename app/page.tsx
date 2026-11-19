"use client";

import { useState } from "react";
import { OrnamentStudio } from "@/components/ornament-studio";
import { TreeExperience } from "@/components/tree-experience";
import type { PublicOrnament } from "@/lib/ornaments/types";

export default function Home() {
  const [ornaments, setOrnaments] = useState<PublicOrnament[]>([]);

  return (
    <>
      <TreeExperience ornaments={ornaments} />
      <OrnamentStudio onOrnamentsChange={setOrnaments} />
    </>
  );
}