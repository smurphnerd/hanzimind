"use client";

import { useState, useRef } from "react";
import { Play, Pause, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterStrokes } from "@/components/character-strokes";

interface VocabItemDetailProps {
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
  onClose: () => void;
}

export function VocabItemDetail({ item, onClose }: VocabItemDetailProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayAudio = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(item.audioUrl);
      audioRef.current.addEventListener("ended", () => setIsPlaying(false));
      audioRef.current.addEventListener("error", (e) => {
        console.error("Audio loading error:", e);
        console.error("Audio error details:", {
          error: e.error,
          currentSrc: audioRef.current?.currentSrc,
          networkState: audioRef.current?.networkState,
          readyState: audioRef.current?.readyState,
        });
        console.error("Audio URL:", item.audioUrl);
        setIsPlaying(false);
      });
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        console.log("Attempting to play audio:", item.audioUrl);
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Failed to play audio:", error);
        console.error("Error name:", (error as Error).name);
        console.error("Error message:", (error as Error).message);
        console.error("Audio URL:", item.audioUrl);
        setIsPlaying(false);
      }
    }
  };

  const isCharacter = item.vocabType === "character";
  const hasStrokes = isCharacter && item.strokes && Array.isArray(item.strokes);

  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <CardTitle className="text-5xl font-bold">{item.vocabItem}</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePlayAudio}
              className="h-10 w-10 p-0"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xl text-muted-foreground">{item.pinyin}</p>
            <Badge variant="secondary">{item.vocabType}</Badge>
          </div>
          <p className="text-lg">{item.translation}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Details</h3>
            <dl className="space-y-3">
              {item.radical && (
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Radical
                  </dt>
                  <dd className="text-2xl mt-1">{item.radical}</dd>
                </div>
              )}
              {item.decomposition && (
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Decomposition
                  </dt>
                  <dd className="text-sm mt-1">{item.decomposition}</dd>
                </div>
              )}
              {item.etymologyType && (
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Etymology Type
                  </dt>
                  <dd className="mt-1">
                    <Badge variant="outline">{item.etymologyType}</Badge>
                  </dd>
                </div>
              )}
              {item.etymologyHint && (
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Etymology Hint
                  </dt>
                  <dd className="text-sm mt-1">{item.etymologyHint}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Audio URL
                </dt>
                <dd className="font-mono text-xs break-all mt-1 text-muted-foreground">
                  {item.audioUrl}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Created
                </dt>
                <dd className="text-sm mt-1">
                  {new Date(item.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Updated
                </dt>
                <dd className="text-sm mt-1">
                  {new Date(item.updatedAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  ID
                </dt>
                <dd className="font-mono text-xs break-all mt-1 text-muted-foreground">
                  {item.id}
                </dd>
              </div>
            </dl>
          </div>

          {/* Right Column - Strokes (if applicable) */}
          {hasStrokes && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Character Strokes</h3>
              <CharacterStrokes
                strokes={item.strokes as string[]}
                strokeMedians={
                  (item.strokeMedians as number[][][] | undefined) ?? undefined
                }
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
