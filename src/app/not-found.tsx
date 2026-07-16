import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h2 className="text-3xl font-serif text-slate-800 mb-4">Page Not Found</h2>
      <p className="text-slate-600 mb-8 max-w-md">
        We couldn't find the page you were looking for. It might have been moved or doesn't exist.
      </p>
      <Link 
        href="/"
        className="px-6 py-3 bg-slate-800 text-white rounded-full hover:bg-slate-700 transition-colors"
      >
        Return Home
      </Link>
    </div>
  );
}
