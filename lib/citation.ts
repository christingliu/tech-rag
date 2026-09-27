export interface CitationSource {
  id: number;
  source: string;
  title: string;
  section: string;
  chunkIndex: number;
  rrfScore: number;
  rerankScore: number | null;
}

export type CitationStatus =
  | "valid"
  | "missing"
  | "invalid";

export interface CitationValidation {
  status: CitationStatus;
  valid: boolean;
  hasCitation: boolean;
  citationCount: number;
  citedSourceIds: number[];
  invalidSourceIds: number[];
}

const CITATION_PATTERN =
  /\[Source\s+(\d+)\]/gi;

export function validateCitations(
  answer: string,
  sources: CitationSource[]
): CitationValidation {
  const matches = [
    ...answer.matchAll(CITATION_PATTERN),
  ];

  const citedSourceIds = [
    ...new Set(
      matches.map((match) =>
        Number(match[1])
      )
    ),
  ];

  const availableSourceIds =
    new Set(
      sources.map((source) => source.id)
    );

  const invalidSourceIds =
    citedSourceIds.filter(
      (id) =>
        !availableSourceIds.has(id)
    );

  const hasCitation =
    citedSourceIds.length > 0;

  const status: CitationStatus =
    !hasCitation
      ? "missing"
      : invalidSourceIds.length > 0
        ? "invalid"
        : "valid";

  return {
    status,

    valid: status === "valid",

    hasCitation,

    citationCount:
      citedSourceIds.length,

    citedSourceIds,

    invalidSourceIds,
  };
}