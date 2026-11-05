/** Bounded index reads for the legacy sync adapters. No retries or writes. */
export async function fetchProviderIndex(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrthoGuidelinesHub/1.0',
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    // Keep the deadline active while reading the body, not just the headers.
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Timed out after ${timeoutMs}ms fetching ${url}`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
