export function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : 'Unknown error';
}

export function handleApiError(context: string, err: unknown): string {
    const message = getErrorMessage(err);
    console.error(`${context}:`, message);
    return message;
}
