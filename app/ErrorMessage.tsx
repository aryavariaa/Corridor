// Error text that never relies on colour alone. Every error state in the app
// shows the alert icon AND carries the word "Error" for screen readers, so it is
// still an error to someone who can't tell the red/pink from the surrounding
// text (and in either theme). The colour is --danger (app/globals.css).
export function AlertIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M10 5.8v5" />
      <path d="M10 14.1h.01" />
    </svg>
  );
}

export default function ErrorMessage({
  children,
  id,
  className = "",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <p id={id} role="alert" className={`flex items-start gap-1.5 font-medium text-danger ${className}`}>
      <AlertIcon className="mt-[0.15em] h-[1.1em] w-[1.1em]" />
      <span>
        <span className="sr-only">Error: </span>
        {children}
      </span>
    </p>
  );
}
