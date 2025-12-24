"use client";

import { useState } from "react";
import { Search, Play, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useORPC } from "@/lib/orpc.client";
import type { SearchLanguage } from "@/definitions/definitions";
import { ErrorBoundary } from "@/components/error-boundary";

function DictionaryContent() {
  const orpc = useORPC();
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchLanguage, setSearchLanguage] =
    useState<SearchLanguage>("chinese");

  // Use the search endpoint
  const { data, isLoading } = useQuery({
    ...orpc.vocab.search.queryOptions({
      input: {
        query: submittedQuery,
        searchLanguage,
        page: 1,
        pageSize: 20,
      },
    }),
    enabled: submittedQuery.trim().length > 0,
  });

  const results = data?.items || [];
  const hasSearched = submittedQuery.trim().length > 0;
  const showNoResults = hasSearched && !isLoading && results.length === 0;
  const showResults = hasSearched && !isLoading && results.length > 0;

  // Check if search query is Chinese (simplified check for demonstration)
  const isChineseQuery = (query: string) => {
    return /[\u4e00-\u9fa5]/.test(query);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(searchQuery);
  };

  const handlePlayAudio = (audioUrl: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Placeholder for audio playback
    console.log("Playing audio:", audioUrl);
  };

  const formatType = (type: string) => {
    if (type === "character") return "Char";
    if (type === "compound") return "Word";
    if (type === "sentence") return "Sent";
    return type;
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Dictionary</h1>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="mb-4 flex gap-4">
          <Button
            type="button"
            variant={searchLanguage === "chinese" ? "default" : "outline"}
            onClick={() => setSearchLanguage("chinese")}
          >
            Chinese
          </Button>
          <Button
            type="button"
            variant={searchLanguage === "english" ? "default" : "outline"}
            onClick={() => setSearchLanguage("english")}
          >
            English
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={
                searchLanguage === "chinese"
                  ? "Search Chinese characters or pinyin..."
                  : "Search English translation..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-14 pl-12 text-lg"
            />
          </div>
          <Button type="submit" size="lg" className="h-14 px-8">
            Search
          </Button>
        </div>
      </form>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {showResults && (
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">Character</TableHead>
                <TableHead className="w-[45%]">Translation</TableHead>
                <TableHead className="w-[15%]">Audio</TableHead>
                <TableHead className="w-[15%]">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result, index) => (
                <TableRow
                  key={index}
                  className="cursor-pointer"
                  onClick={() => {
                    window.location.href = `/dictionary/${encodeURIComponent(result.vocabItem)}`;
                  }}
                >
                  <TableCell className="text-lg font-medium">
                    {result.vocabItem}
                  </TableCell>
                  <TableCell>{result.translation}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handlePlayAudio(result.audioUrl, e)}
                      className="size-8"
                    >
                      <Play className="size-4" />
                    </Button>
                  </TableCell>
                  <TableCell>{formatType(result.vocabType)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showNoResults && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="mb-2 text-lg text-muted-foreground">
            No results found for &ldquo;{submittedQuery}&rdquo;
          </p>
          {isChineseQuery(submittedQuery) && (
            <>
              <p className="mb-6 text-muted-foreground">
                Would you like to add this word to the database?
              </p>
              <Button>Create New Entry</Button>
            </>
          )}
        </div>
      )}

      {!hasSearched && (
        <div className="flex items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">
            Search for Chinese characters or English translations to get started
          </p>
        </div>
      )}
    </div>
  );
}

export default function DictionaryPage() {
  return (
    <ErrorBoundary>
      <DictionaryContent />
    </ErrorBoundary>
  );
}
