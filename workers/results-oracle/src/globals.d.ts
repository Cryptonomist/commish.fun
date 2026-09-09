/* src/lib/scores.ts passes Next.js's `next: { revalidate }` option to fetch.
 * Next declares that field on RequestInit globally; the worker toolchain does
 * not, and would refuse the shared file over an option the runtime simply
 * ignores. Declared here so the app's parser can be reused unchanged. */
interface RequestInit {
  next?: { revalidate?: number | false; tags?: string[] };
}
