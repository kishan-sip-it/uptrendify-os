/**
 * Statuses where content authors can create a new version. Editing a version
 * during review is allowed, but the PATCH route must withdraw that review in
 * the same current-version update so nobody can approve artwork they did not see.
 */
export const EDITABLE_BODY_STATUSES: readonly string[] = ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED', 'IN_REVIEW', 'CLIENT_REVIEW'];
