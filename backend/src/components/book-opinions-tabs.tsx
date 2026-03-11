"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface BookOpinionsTabsProps {
  opinionsContent: React.ReactNode;
  chaptersContent: React.ReactNode;
  reviewCount: number;
  chapterCount: number;
}

export function BookOpinionsTabs({
  opinionsContent,
  chaptersContent,
  reviewCount,
  chapterCount,
}: BookOpinionsTabsProps) {
  const [tab, setTab] = useState("opinions");

  useEffect(() => {
    const handler = () => setTab("chapters");
    window.addEventListener("open-chapters-tab", handler);
    return () => window.removeEventListener("open-chapters-tab", handler);
  }, []);

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="opinions" className="flex-1">
          Opinions
          <span className="text-muted-foreground font-normal ml-1">({reviewCount})</span>
        </TabsTrigger>
        <TabsTrigger value="chapters" className="flex-1">
          Chapters
          <span className="text-muted-foreground font-normal ml-1">({chapterCount})</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="opinions" className="mt-6">
        {opinionsContent}
      </TabsContent>
      <TabsContent value="chapters" className="mt-6 data-[state=inactive]:hidden" forceMount>
        {chaptersContent}
      </TabsContent>
    </Tabs>
  );
}
