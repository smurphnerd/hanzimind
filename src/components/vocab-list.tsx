"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useORPC } from "@/lib/orpc.client";
import { authClient } from "@/lib/authClient";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { VocabItemDetail } from "@/components/vocab-item-detail";

type VocabItem = {
  id: string;
  vocabItem: string;
  translation: string;
  pinyin: string;
  vocabType: string;
  audioUrl: string;
  decomposition: string | null;
  etymologyHint: string | null;
  etymologyType: string | null;
  radical: string | null;
  strokes: unknown;
  strokeMedians: unknown;
  strokeMatches: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export function VocabList() {
  const orpc = useORPC();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<VocabItem | null>(null);
  const pageSize = 10000; // Load all items for client-side search

  // Wait for auth to be determined before fetching vocab
  const { isPending: isAuthPending } = authClient.useSession();

  const queryOptions = orpc.vocab.list.queryOptions({
    input: {
      page: 1,
      pageSize,
    },
  });

  const { data, isPending, error } = useQuery({
    ...queryOptions,
    enabled: !isAuthPending,
  });

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!searchQuery.trim()) return []; // Return empty array when not searching

    const query = searchQuery.toLowerCase();
    return data.items.filter(
      (item: VocabItem) =>
        item.vocabItem.includes(searchQuery) ||
        item.pinyin.toLowerCase().includes(query) ||
        item.translation.toLowerCase().includes(query)
    );
  }, [data?.items, searchQuery]);

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Error loading vocab items</h2>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  if (isPending || isAuthPending) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-muted-foreground">Loading vocab items...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by character, pinyin, or translation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {searchQuery.trim()
            ? `${filteredItems.length} result${filteredItems.length !== 1 ? 's' : ''} found`
            : `${data.total} items in database`
          }
        </p>
      </div>

      {/* Search Results */}
      {searchQuery.trim() && (
        <div className="grid gap-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No vocab items found matching "{searchQuery}"
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredItems.map((item: VocabItem) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold">{item.vocabItem}</span>
                    <span className="text-sm text-muted-foreground">{item.pinyin}</span>
                    <span className="flex-1 text-sm truncate">{item.translation}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected Item Detail */}
      {selectedItem && (
        <VocabItemDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
