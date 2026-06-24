"use client";

import { useState } from "react";
import { Search, Play, Loader2, Plus } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
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
      <h1 className="mb-2 font-brush text-4xl text-primary text-center brush-underline">
        Dictionary
      </h1>
      <p className="text-center text-gold font-brush text-xl mb-8">词典</p>

      <form onSubmit={handleSearch} className="mb-10">
        <div className="mb-4 flex justify-center gap-4">
          <Button
            type="button"
            variant={searchLanguage === "chinese" ? "default" : "outline"}
            onClick={() => setSearchLanguage("chinese")}
          >
            中文 Chinese
          </Button>
          <Button
            type="button"
            variant={searchLanguage === "english" ? "default" : "outline"}
            onClick={() => setSearchLanguage("english")}
          >
            English
          </Button>
        </div>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-gold" />
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
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold border-t-primary" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-brush text-primary text-sm">查</span>
            </div>
          </div>
          <p className="mt-4 text-muted-foreground">Searching...</p>
        </div>
      )}

      {showResults && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-rice-paper">
                  <TableHead className="w-[25%] font-brush text-primary">Character</TableHead>
                  <TableHead className="w-[45%] font-brush text-primary">Translation</TableHead>
                  <TableHead className="w-[15%] font-brush text-primary">Audio</TableHead>
                  <TableHead className="w-[15%] font-brush text-primary">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow
                    key={index}
                    className={`cursor-pointer hover:bg-gold/10 transition-colors ${index % 2 === 0 ? "bg-cream" : "bg-rice-paper"}`}
                    onClick={() => {
                      window.location.href = `/dictionary/${encodeURIComponent(result.vocabItem)}`;
                    }}
                  >
                    <TableCell className="text-xl font-medium text-primary">
                      {result.vocabItem}
                    </TableCell>
                    <TableCell>{result.translation}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handlePlayAudio(result.audioUrl, e)}
                        className="size-8 text-gold hover:text-primary"
                      >
                        <Play className="size-4" />
                      </Button>
                    </TableCell>
                    <TableCell>{formatType(result.vocabType)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showNoResults && (
        <Card className="ornament-corners">
          <CardContent className="py-16 text-center">
            <div className="mb-6">
              <div className="h-16 w-16 mx-auto rounded-full border-3 border-gold/50 bg-rice-paper flex items-center justify-center">
                <span className="font-brush text-3xl text-muted-foreground">?</span>
              </div>
            </div>
            <p className="mb-2 text-lg text-muted-foreground">
              No results found for &ldquo;{submittedQuery}&rdquo;
            </p>
            {isChineseQuery(submittedQuery) && (
              <>
                <p className="mb-6 text-muted-foreground">
                  Would you like to add this word to the database?
                </p>
                <Button>
                  <Plus className="size-4 mr-2" />
                  Create New Entry
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!hasSearched && (
        <Card className="ornament-corners">
          <CardContent className="py-16 text-center">
            <div className="mb-6">
              <div className="h-20 w-20 mx-auto rounded-full border-4 border-gold bg-rice-paper flex items-center justify-center">
                <span className="font-brush text-4xl text-primary">典</span>
              </div>
            </div>
            <p className="text-muted-foreground text-lg">
              Search for Chinese characters or English translations to get started
            </p>
          </CardContent>
        </Card>
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
