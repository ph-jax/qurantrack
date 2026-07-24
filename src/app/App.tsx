export function App() {
  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-5 py-12 text-center">
        <p className="mb-4 rounded-full bg-teal-100 px-4 py-2 text-sm font-semibold text-teal-800">
          Learn. Practice. Progress.
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">QuranTrack</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-700">
          QuranTrack — Quran Learning & Progress Platform
        </p>
        <p className="mt-2 text-base text-slate-600">Kur&apos;an Öğrenme ve Gelişim Platformu</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {['React', 'Cloudflare Workers', 'Hono API'].map((item) => (
            <div key={item} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="font-medium text-slate-900">{item}</p>
              <p className="mt-2 text-sm text-slate-600">Phase 0 scaffold ready.</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
