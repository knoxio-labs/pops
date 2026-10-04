const RETRY_DELAY_MS = 250;

/** Retries once after 250ms when the first error passes `shouldRetry`; a second failure propagates. */
export async function retryOnce<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!shouldRetry(error)) throw error;
    await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return operation();
  }
}
