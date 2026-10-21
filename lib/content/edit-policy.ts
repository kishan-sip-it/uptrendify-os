/**
 * Statuses in which the creator owns the content body and may save new
 * versions. Shared by the content PATCH route, the content detail page and
 * the dedicated editor page so the UI can never offer an edit the API would
 * reject (and vice versa).
 */
export const EDITABLE_BODY_STATUSES: readonly string[] = ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'];
