export type ContentVersionStateEntry = {
  id: string;
  version: number;
  body: string;
  cta?: string | null;
};

export type ReconciledContentVersionState = {
  versions: ContentVersionStateEntry[];
  currentVersionId: string | null;
};

/**
 * Reconcile a refreshed server version list with a just-saved local version.
 * A refresh may briefly return the previous current-version pointer; it must
 * not move the editor backwards and re-disable submission after a successful save.
 */
export function reconcileContentVersionState(
  incomingVersions: readonly ContentVersionStateEntry[],
  existingVersions: readonly ContentVersionStateEntry[],
  serverCurrentVersionId: string | null,
  localCurrentVersionId: string | null,
  limit = 40,
): ReconciledContentVersionState {
  const incomingIds = new Set(incomingVersions.map((entry) => entry.id));
  const mergedVersions = [
    ...incomingVersions,
    ...existingVersions.filter((entry) => !incomingIds.has(entry.id)),
  ]
    .sort((a, b) => b.version - a.version)
    .slice(0, limit);

  const serverCurrent = incomingVersions.find((entry) => entry.id === serverCurrentVersionId);
  if (!serverCurrent || !serverCurrentVersionId) {
    return { versions: mergedVersions, currentVersionId: localCurrentVersionId };
  }

  const locallyCurrent = mergedVersions.find((entry) => entry.id === localCurrentVersionId);
  if (locallyCurrent && serverCurrent.version < locallyCurrent.version) {
    return { versions: mergedVersions, currentVersionId: localCurrentVersionId };
  }

  return { versions: mergedVersions, currentVersionId: serverCurrentVersionId };
}
