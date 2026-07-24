import { Link } from 'react-router-dom';
export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-3xl font-bold">Page not found</h1>
        <Link className="mt-4 inline-block text-brand underline" to="/">
          Return to QuranTrack
        </Link>
      </div>
    </main>
  );
}
