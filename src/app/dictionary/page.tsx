"use client";

import { useState } from "react";
import { Search, Play, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { ItemTypeBadge } from "@/components/item-type-badge";
import { ComponentRoleBadge } from "@/components/component-role-badge";
import { Mika } from "@/components/mika";

function DictionaryContent() {
  const orpc = useORPC();
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchLanguage, setSearchLanguage] =
    useState<SearchLanguage>("chinese");

  // Use the search endpoint
  const { data, isLoading, isError, error, refetch } = useQuery({
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
  // Retries are disabled globally, so a failed search leaves data undefined with
  // isLoading false — without this guard it would masquerade as "no results".
  const showError = hasSearched && !isLoading && isError;
  const showNoResults =
    hasSearched && !isLoading && !isError && results.length === 0;
  const showResults =
    hasSearched && !isLoading && !isError && results.length > 0;

  // Check if search query is Chinese (simplified check for demonstration)
  const isChineseQuery = (query: string) => {
    return /[\u4e00-\u9fa5]/.test(query);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The server wraps the query in %...%, so trailing spaces would match nothing.
    setSubmittedQuery(searchQuery.trim());
  };

  const handlePlayAudio = (audioUrl: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.play().catch(() => toast.error("Couldn't play audio"));
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 text-center font-display text-4xl font-extrabold tracking-tight text-foreground">
        Dictionary
      </h1>
      <p className="hanzi mb-8 text-center text-xl text-muted-foreground">
        词典
      </p>

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
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Searching...</p>
        </div>
      )}

      {showError && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mb-6 flex justify-center">
              <AlertCircle className="size-10 text-destructive" />
            </div>
            <p className="mb-2 text-lg text-foreground">
              Search failed for &ldquo;{submittedQuery}&rdquo;
            </p>
            <p className="mb-6 text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "Something went wrong. Please try again."}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 size-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {showResults && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%] font-display text-muted-foreground">
                    Character
                  </TableHead>
                  <TableHead className="w-[45%] font-display text-muted-foreground">
                    Translation
                  </TableHead>
                  <TableHead className="w-[15%] font-display text-muted-foreground">
                    Audio
                  </TableHead>
                  <TableHead className="w-[15%] font-display text-muted-foreground">
                    Type
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow
                    key={index}
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => {
                      window.location.href = `/dictionary/${encodeURIComponent(result.vocabItem)}`;
                    }}
                  >
                    <TableCell className="hanzi text-xl text-foreground">
                      {result.vocabItem}
                    </TableCell>
                    <TableCell>{result.translation}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!result.audioUrl}
                        onClick={(e) => handlePlayAudio(result.audioUrl, e)}
                        className="size-8 text-muted-foreground hover:text-primary"
                      >
                        <Play className="size-4" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <ItemTypeBadge type={result.vocabType} short />
                        {result.vocabType === "component" && (
                          <ComponentRoleBadge phonetic={result.phonetic} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showNoResults && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mb-6 flex justify-center">
              <Mika pose="sleep" size={96} />
            </div>
            <p className="mb-2 text-lg text-muted-foreground">
              No results found for &ldquo;{submittedQuery}&rdquo;
            </p>
            {isChineseQuery(submittedQuery) && (
              <p className="text-muted-foreground">
                This word isn&rsquo;t in the database yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!hasSearched && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mb-6 flex justify-center">
              <Mika pose="peek" size={112} />
            </div>
            <p className="text-lg text-muted-foreground">
              Search for Chinese characters or English translations to get
              started
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
