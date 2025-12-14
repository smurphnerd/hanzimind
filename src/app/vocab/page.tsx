import { VocabList } from "@/components/vocab-list";

export default function VocabPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Vocabulary Database</h1>
          <p className="text-muted-foreground mt-2">
            Browse and explore all vocabulary items in the database
          </p>
        </div>
        <VocabList />
      </div>
    </div>
  );
}
