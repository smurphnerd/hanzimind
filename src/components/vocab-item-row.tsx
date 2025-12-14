"use client";

import { useState, useRef } from "react";
import { ChevronDown, ChevronRight, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { CharacterStrokes } from "@/components/character-strokes";
import { Badge } from "@/components/ui/badge";

interface VocabItemRowProps {
  item: {
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
}

export function VocabItemRow({ item }: VocabItemRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayAudio = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(item.audioUrl);
      audioRef.current.addEventListener("ended", () => setIsPlaying(false));
      audioRef.current.addEventListener("error", (e) => {
        console.error("Audio loading error:", e);
        console.error("Audio URL:", item.audioUrl);
        setIsPlaying(false);
      });
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Failed to play audio:", error);
        console.error("Audio URL:", item.audioUrl);
        setIsPlaying(false);
      }
    }
  };

  const isCharacter = item.vocabType === "character";
  const hasStrokes = isCharacter && item.strokes && Array.isArray(item.strokes);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50">
        <TableCell className="w-12">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell className="text-2xl font-bold">{item.vocabItem}</TableCell>
        <TableCell className="text-sm">{item.pinyin}</TableCell>
        <TableCell className="max-w-md">
          <div className={isOpen ? "" : "line-clamp-2 text-sm"}>
            {item.translation}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{item.vocabType}</Badge>
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handlePlayAudio();
            }}
            className="h-8 w-8 p-0"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20 p-6">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Details</h3>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        ID
                      </dt>
                      <dd className="font-mono text-sm">{item.id}</dd>
                    </div>
                    {item.radical && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">
                          Radical
                        </dt>
                        <dd className="text-xl">{item.radical}</dd>
                      </div>
                    )}
                    {item.decomposition && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">
                          Decomposition
                        </dt>
                        <dd className="text-sm">{item.decomposition}</dd>
                      </div>
                    )}
                    {item.etymologyType && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">
                          Etymology Type
                        </dt>
                        <dd className="text-sm">
                          <Badge variant="outline">{item.etymologyType}</Badge>
                        </dd>
                      </div>
                    )}
                    {item.etymologyHint && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">
                          Etymology Hint
                        </dt>
                        <dd className="text-sm">{item.etymologyHint}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        Audio URL
                      </dt>
                      <dd className="font-mono text-sm break-all">
                        {item.audioUrl}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        Created
                      </dt>
                      <dd className="text-sm">
                        {new Date(item.createdAt).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        Updated
                      </dt>
                      <dd className="text-sm">
                        {new Date(item.updatedAt).toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </div>

                {hasStrokes ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      Character Strokes
                    </h3>
                    <CharacterStrokes
                      strokes={item.strokes as string[]}
                      strokeMedians={
                        (item.strokeMedians as number[][][] | undefined) ??
                        undefined
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
