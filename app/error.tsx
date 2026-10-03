'use client';
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="alert err" role="alert">
      <h2>Something went wrong</h2>
      <p>The page could not be loaded. Nothing was changed.</p>
      <button className="btn secondary sm" onClick={reset}>Try again</button>
    </div>
  );
}
